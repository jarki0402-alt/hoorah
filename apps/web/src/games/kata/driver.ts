/**
 * Glue between the Hoorah SDK, the pure rules and the main screen: owns the pausable game clock,
 * plays the computer seats, turns logic events into sounds, vibration, notebook lines and phone
 * views, and reports the result.
 */
import type { ControllerToGame, PlayerInfo } from '@hoorah/protocol';
import type { GameResult, HoorahGame } from '@hoorah/sdk';
import { signal } from '@preact/signals';
import type { Sfx } from '../../shared/audio';
import { celebrate } from '../../shared/confetti';
import { cpuSkill, isCpu, reportSoloResult } from '../common/cpu';
import { type BrainMove, decide, kataOpponents } from './brain';
import { GameClock } from './clock';
import { Lexicon } from './lexicon';
import { clampLives, type KataEvent, KataMatch, type Presence } from './logic';
import { buildResult } from './results';
import { type Banner, burstOver, FrameBus, type LogEntry, type ScreenModel } from './screen';
import { STR } from './strings';
import { viewFor } from './views';
import { wordList } from './words';

/** The logic keeps ticking even if rAF is throttled (e.g. the screen's tab loses focus). */
const FALLBACK_TICK_MS = 250;
const LOG_MAX = 40;
const BANNER_MS = 2600;
/** Words this long earn the big cheer. */
const LONG_WORD = 9;

function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] ?? Date.now();
}

export class KataDriver implements ScreenModel {
  readonly version = signal(0);
  readonly waiting = signal(false);
  readonly frame = new FrameBus();
  readonly match: KataMatch;
  readonly clock: GameClock;
  private readonly cpus: PlayerInfo[];
  private readonly skill: number;
  private readonly sent = new Map<number, string>();
  private readonly entries: LogEntry[] = [];
  private bannerState: (Banner & { until: number }) | null = null;
  private connected = new Set<number>();
  private shellPaused = false;
  private plan: { turn: number; at: number; move: BrainMove } | null = null;
  private raf = 0;
  private interval = 0;
  private ended = false;
  private soloReported = false;
  private seq = 0;

  constructor(private readonly game: HoorahGame) {
    this.clock = new GameClock(() => game.now());
    this.cpus = kataOpponents(game.players);
    this.skill = cpuSkill(game.gameId);
    this.connected = new Set(game.players.map((p) => p.id));
    const seats: Presence[] = [
      ...game.players.map((p) => ({ id: p.id, connected: true })),
      ...this.cpus.map((p) => ({ id: p.id, connected: true })),
    ];
    this.match = new KataMatch({
      seats,
      lives: clampLives(game.settings.rounds),
      lexicon: new Lexicon(wordList()),
      seed: randomSeed(),
      now: this.clock.now(),
      computers: new Set(this.cpus.map((p) => p.id)),
    });
    // Dev-only hook for local harnesses (never in builds).
    if (import.meta.env.DEV) (window as unknown as { __kata?: KataMatch }).__kata = this.match;
  }

  /* ---------------------------------------------------------------- ScreenModel */

  info = (id: number): PlayerInfo | undefined => this.game.player(id) ?? this.cpus.find((p) => p.id === id);

  log = (): readonly LogEntry[] => this.entries;

  banner = (): Banner | null => {
    const b = this.bannerState;
    return b && this.clock.now() < b.until ? b : null;
  };

  private name(id: number): string {
    return this.info(id)?.name ?? STR.unknownPlayer;
  }

  /* ---------------------------------------------------------------- lifecycle */

  start(): void {
    this.game.on('players', () => this.onPlayers());
    this.game.on('action', (from, a) => this.onAction(from, a));
    this.game.on('pause', (p) => {
      this.shellPaused = p;
      this.updateHold();
    });
    this.shellPaused = this.game.paused;
    this.match.setPresence(this.presence(), this.clock.now());
    this.updateHold();
    this.sfx('reveal');
    this.flush();
    this.syncViews();
    const loop = () => {
      this.step();
      if (!this.ended) this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    this.interval = window.setInterval(() => this.step(), FALLBACK_TICK_MS);
  }

  private step(): void {
    if (this.ended) return;
    const now = this.clock.now();
    if (!this.clock.held) {
      this.match.tick(now);
      this.think(now);
      this.flush();
      if (this.bannerState && now >= this.bannerState.until) {
        this.bannerState = null;
        this.bump();
      }
    }
    this.frame.emit(now);
  }

  private bump(): void {
    this.version.value++;
  }

  /* ---------------------------------------------------------------- input */

  private presence(): Presence[] {
    return this.game.allPlayers.map((p) => ({ id: p.id, connected: p.connected }));
  }

  private onPlayers(): void {
    const now = new Set(this.game.allPlayers.filter((p) => p.connected).map((p) => p.id));
    for (const id of now) if (!this.connected.has(id)) this.sent.delete(id);
    this.connected = now;
    if (!this.ended) this.match.setPresence(this.presence(), this.clock.now());
    this.updateHold();
    this.flush();
    this.bump();
    this.syncViews();
  }

  private onAction(from: number, a: ControllerToGame): void {
    if (this.ended || this.clock.held || a.k !== 'action') return;
    if (a.id !== 'word') return;
    const now = this.clock.now();
    const sentAt = Number.isFinite(a.at) ? this.clock.fromServer(a.at) : undefined;
    const ok = this.match.submit(from, a.value ?? '', now, sentAt);
    if (ok) {
      this.flush();
      return;
    }
    // Out of turn or late: make sure the phone shows the real state again.
    this.sent.delete(from);
    this.syncViews();
  }

  /* ---------------------------------------------------------------- computer seats */

  /** Seats the brain plays: computer players, and dropped phones while someone is still here. */
  private brainSeat(id: number): boolean {
    if (isCpu(id)) return true;
    const p = this.game.player(id);
    return !!p && !p.connected && this.connected.size > 0;
  }

  private think(now: number): void {
    const m = this.match;
    const seat = m.currentSeat;
    if (m.phase !== 'turn' || !seat || !this.brainSeat(seat.id)) {
      if (m.phase !== 'turn') this.plan = null;
      return;
    }
    if (this.plan?.turn !== m.turnNo) {
      const move = decide({
        prefix: m.prefix,
        lexicon: m.lexicon,
        used: m.used,
        skill: this.skill,
        turnMs: m.turnMs,
      });
      this.plan = {
        turn: m.turnNo,
        at: m.turnStart + (move.kind === 'word' ? move.delayMs : m.turnMs),
        move,
      };
      return;
    }
    if (now < this.plan.at || this.plan.move.kind !== 'word') return;
    const word = this.plan.move.word;
    this.plan = { ...this.plan, at: Number.POSITIVE_INFINITY };
    m.submit(seat.id, word, now);
  }

  /* ---------------------------------------------------------------- events */

  private flush(): void {
    const events = this.match.drain();
    if (!events.length) return;
    for (const e of events) this.handle(e);
    this.bump();
    this.syncViews();
  }

  private handle(e: KataEvent): void {
    const m = this.match;
    switch (e.type) {
      case 'phase':
        if (e.phase === 'final') this.onFinal();
        else if (e.phase === 'ended') this.finish();
        break;
      case 'turn': {
        const last = this.entries[this.entries.length - 1];
        if (e.kind === 'first' || !last || last.kind === 'start') {
          if (e.kind !== 'chain') {
            this.pushLog({
              kind: 'start',
              key: `s${m.turnNo}`,
              prefix: e.prefix,
              start: e.kind,
              stuckFrom: m.stuckFrom,
            });
          }
        } else if (e.kind !== 'chain') {
          last.after = { prefix: e.prefix, stuck: e.kind === 'stuck' };
        }
        if (e.newRound) {
          this.showBanner(STR.newRound(e.round, Math.round(m.turnMs / 1000)));
          this.sfx('whistle');
        } else {
          this.sfx(e.kind === 'stuck' ? 'reveal' : 'tick');
        }
        this.buzz(e.id, 40);
        break;
      }
      case 'accepted':
        this.pushLog({ kind: 'word', key: `w${e.link.turn}`, link: e.link });
        this.sfx(e.link.word.length >= LONG_WORD ? 'super' : 'correct');
        this.buzz(e.attempt.by, 30);
        break;
      case 'refused':
        this.pushLog({ kind: 'miss', key: `m${e.attempt.turn}`, attempt: e.attempt });
        this.sfx('wrong');
        this.buzz(e.attempt.by, [60, 40, 60]);
        break;
      case 'out':
        if (!e.left) window.setTimeout(() => this.sfx('collapse'), 350);
        break;
      case 'cue':
        this.sfx('count');
        break;
    }
  }

  private pushLog(entry: LogEntry): void {
    this.entries.push(entry);
    if (this.entries.length > LOG_MAX) this.entries.splice(0, this.entries.length - LOG_MAX);
  }

  private showBanner(text: string): void {
    this.bannerState = { key: ++this.seq, text, until: this.clock.now() + BANNER_MS };
  }

  private onFinal(): void {
    this.reportSolo();
    this.sfx('win');
    window.setTimeout(celebrate, 250);
    const id = this.match.winner;
    if (id !== null) window.setTimeout(() => burstOver(id), 700);
  }

  /** A solo game against the computer just ended: nudge its skill for next time. */
  private reportSolo(): void {
    if (!this.cpus.length || this.soloReported) return;
    this.soloReported = true;
    const w = this.match.winner;
    reportSoloResult(this.game.gameId, w !== null && !isCpu(w) ? 'win' : 'lose');
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    cancelAnimationFrame(this.raf);
    window.clearInterval(this.interval);
    this.reportSolo();
    this.game.end(this.result());
  }

  private result(): GameResult {
    const r = buildResult(this.match, (id) => this.name(id));
    return this.cpus.length ? { ...r, cpuPlayers: this.cpus } : r;
  }

  /* ---------------------------------------------------------------- hold + views */

  /** Freeze the game while the shell is paused or nobody is connected. */
  private updateHold(): void {
    const late = this.match.phase === 'final' || this.match.phase === 'ended';
    const nobody = this.connected.size === 0 && !late;
    this.waiting.value = nobody;
    const hold = this.shellPaused || nobody;
    if (hold === this.clock.held) return;
    if (hold) this.clock.hold();
    else this.clock.release();
    for (const anim of document.getAnimations()) {
      if (hold) anim.pause();
      else anim.play();
    }
    // Deadlines are sent in server time, which moved while held.
    if (!hold) {
      this.sent.clear();
      this.syncViews();
    }
    this.bump();
  }

  /** Vibrate a human's phone (never a computer seat). */
  private buzz(id: number, pattern: number | number[]): void {
    if (!isCpu(id) && this.connected.has(id)) this.game.vibrate(id, pattern);
  }

  private syncViews(): void {
    if (this.clock.held) return;
    const ctx = { name: (id: number) => this.name(id), toServer: (t: number) => this.clock.toServer(t) };
    for (const p of this.game.allPlayers) {
      if (!p.connected) continue;
      const view = viewFor(this.match, p.id, ctx);
      const json = JSON.stringify(view);
      if (this.sent.get(p.id) === json) continue;
      this.sent.set(p.id, json);
      this.game.setView(p.id, view);
    }
  }

  private sfx(name: Sfx): void {
    this.game.sfx(name);
  }
}
