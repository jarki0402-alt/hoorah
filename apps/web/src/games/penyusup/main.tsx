/**
 * Penyusup entry: connects to the Hoorah shell, mounts the poster stage and drives the pure match
 * from SDK events and a frame loop. Side effects (sound, adaptive music, vibration, confetti,
 * phone views) all happen here, in response to match events.
 */
import type { ControllerToGame } from '@hoorah/protocol';
import { connect, type HoorahGame, type MusicIntensity } from '@hoorah/sdk';
import { effect, signal } from '@preact/signals';
import { render } from 'preact';
import { celebrate, confetti } from '../../shared/confetti';
import { fontsReady, mountStage } from '../common/stage';
import { loadJson, saveJson } from '../common/store';
import { type PenyusupEvent, PenyusupMatch, type Phase } from './logic';
import { applyMirror, MirrorScene, type PenyusupMirror, toMirror } from './mirror';
import { buildResult } from './results';
import { FrameBus, PenyusupScreen, type ScreenModel, type SeatInfo } from './screen';
import { STR } from './strings';
import { viewFor } from './views';
import './penyusup.css';

const DEFAULT_ROUNDS = 3;
const FALLBACK_TICK_MS = 250;
const RECENT_KEY = 'penyusup.recent';
const RECENT_MAX = 120;
/** When the card on the main screen has turned (matches the CSS flip). */
const FLIP_MS = 1_900;
/** Last seconds of a clock that tick audibly. */
const TICK_FROM_S = 5;
const HURRY_FROM_MS = 10_000;

const INTENSITY: Record<Phase, MusicIntensity> = {
  setup: 0,
  deal: 0,
  clue: 1,
  vote: 2,
  tally: 2,
  reveal: 3,
  guess: 3,
  roundEnd: 1,
  final: 1,
  ended: 1,
};

function roundsFrom(settings: HoorahGame['settings']): number {
  const raw = Number(settings.rounds);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : DEFAULT_ROUNDS;
}

function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] ?? Date.now();
}

function presence(game: HoorahGame) {
  return game.allPlayers.map((p) => ({ id: p.id, connected: p.connected }));
}

class PenyusupDriver implements ScreenModel {
  readonly version = signal(0);
  readonly frame = new FrameBus();
  private readonly sent = new Map<number, string>();
  private readonly refusals = new Map<number, { text: string; n: number; turnKey: string }>();
  private shellPaused: boolean;
  private ended = false;
  private raf = 0;
  private interval = 0;
  private lastTickKey = '';
  private hurry = false;
  private intensity: MusicIntensity = 0;

  constructor(
    private readonly game: HoorahGame,
    readonly match: PenyusupMatch,
  ) {
    this.shellPaused = game.paused;
    game.on('players', () => this.onPlayers());
    game.on('action', (from, action) => this.onAction(from, action));
    game.on('pause', (paused) => {
      this.shellPaused = paused;
      this.updateHold();
    });
    this.updateHold();
  }

  info = (id: number) => this.game.player(id);

  hostId = (): number | null =>
    this.game.players.find((p) => p.isHost)?.id ?? this.game.players[0]?.id ?? null;

  start(): void {
    const loop = () => {
      this.step();
      if (!this.ended) this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    this.interval = window.setInterval(() => this.step(), FALLBACK_TICK_MS);
    this.setMusic();
    this.syncViews();
  }

  private step(): void {
    const now = this.game.now();
    const events = this.match.tick(now);
    if (events.length) this.handle(events);
    this.clockSounds();
    this.frame.emit();
  }

  /** Tick-tock in the last seconds of a turn, vote or guess; a little hurry in the music. */
  private clockSounds(): void {
    const m = this.match;
    const timed =
      (m.phase === 'clue' && !m.lastClue) || m.phase === 'vote' || (m.phase === 'guess' && !m.guessed);
    const left = m.msLeft();
    const hurry = timed && !m.held && left > 0 && left <= HURRY_FROM_MS && m.phase !== 'clue';
    if (hurry !== this.hurry) {
      this.hurry = hurry;
      this.game.musicHurry(hurry);
    }
    if (!timed || m.held || left <= 0) return;
    const s = Math.ceil(left / 1000);
    if (s > TICK_FROM_S) return;
    const key = `${m.phase}:${m.round}:${m.votes}:${m.circuit}:${m.turn}:${s}`;
    if (key === this.lastTickKey) return;
    this.lastTickKey = key;
    this.game.sfx(s % 2 === 0 ? 'tock' : 'tick');
  }

  private setMusic(): void {
    const level = INTENSITY[this.match.phase];
    if (level === this.intensity) return;
    this.intensity = level;
    this.game.musicIntensity(level);
  }

  private later(fn: () => void, ms: number): void {
    window.setTimeout(() => {
      if (!this.ended) fn();
    }, ms);
  }

  private handle(events: PenyusupEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'phase':
          this.onPhase(e.phase);
          break;
        case 'turn':
          this.game.sfx('select');
          this.game.vibrate(e.id, [30, 40, 30]);
          break;
        case 'clue':
          this.game.sfx(e.text ? 'drop' : 'wrong');
          this.refusals.delete(e.id);
          break;
        case 'timeout':
          this.game.sfx('weker');
          break;
        case 'locked':
        case 'ready':
          this.game.sfx('tick');
          break;
        case 'guess':
          this.game.sfx(e.correct ? 'super' : 'wrong');
          if (e.correct) this.later(celebrate, 200);
          break;
      }
    }
    this.setMusic();
    this.version.value++;
    this.syncViews();
  }

  private onPhase(phase: Phase): void {
    const m = this.match;
    switch (phase) {
      case 'deal':
        this.game.sfx('round');
        for (const s of m.table) if (s.present) this.game.vibrate(s.id, 40);
        break;
      case 'clue':
        this.game.sfx('go');
        break;
      case 'vote':
        this.game.sfx('bell');
        break;
      case 'tally':
        this.game.sfx('reveal');
        break;
      case 'reveal': {
        this.game.sfx('tension');
        const out = m.tally?.out ?? null;
        const role = out !== null ? m.seat(out)?.role : undefined;
        this.later(() => {
          this.game.sfx('gong');
          this.game.sfx(role === 'warga' ? 'stinger-fall' : 'stinger-win');
          if (role && role !== 'warga') confetti({ x: 0.5, y: 0.35, count: 70, spread: 0.7, power: 0.8 });
        }, FLIP_MS);
        if (out !== null) this.game.vibrate(out, [80, 50, 80]);
        break;
      }
      case 'guess':
        this.game.sfx('tension');
        break;
      case 'roundEnd': {
        const side = m.outcome?.side;
        this.game.sfx(side === 'warga' ? 'stinger-win' : 'cheer');
        if (side !== 'warga') this.later(celebrate, 300);
        for (const s of m.table) if (s.present) this.game.vibrate(s.id, s.gained > 0 ? 40 : [60, 40, 60]);
        break;
      }
      case 'final':
        this.game.sfx('win');
        this.later(celebrate, 300);
        break;
      case 'ended':
        this.finish();
        break;
      default:
        break;
    }
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    cancelAnimationFrame(this.raf);
    window.clearInterval(this.interval);
    this.game.musicHurry(false);
    this.game.end(buildResult(this.match, (id) => this.game.player(id)?.name ?? 'Pemain'));
  }

  private onPlayers(): void {
    this.match.syncPlayers(presence(this.game), this.game.now());
    const online = new Set(this.game.players.map((p) => p.id));
    for (const id of [...this.sent.keys()]) if (!online.has(id)) this.sent.delete(id);
    this.updateHold();
    this.version.value++;
    this.syncViews();
  }

  private onAction(from: number, a: ControllerToGame): void {
    if (a.k !== 'action') return;
    const m = this.match;
    const now = this.game.now();
    let events: PenyusupEvent[] = [];
    const isHost = from === this.hostId();
    switch (a.id) {
      case 'pick':
        if (m.phase === 'setup' && isHost && typeof a.value === 'string') m.pick(a.value);
        else if (m.phase === 'vote' && typeof a.value === 'string') {
          const target = Number(a.value);
          if (Number.isInteger(target)) events = m.vote(from, target, now);
        }
        break;
      case 'next':
        if (isHost) events = m.next(now);
        break;
      case 'back':
        if (isHost) m.back();
        break;
      case 'start':
        if (isHost) events = m.start(now);
        break;
      case 'ready':
        events = m.ready(from, now);
        break;
      case 'done':
        events = m.done(from, now);
        break;
      case 'lock':
        events = m.lock(from, now);
        break;
      case 'word':
        if (typeof a.value !== 'string' || a.value.length > 40) break;
        if (m.phase === 'guess') events = m.guess(from, a.value, now);
        else if (m.phase === 'clue') {
          const res = m.clue(from, a.value, now);
          events = res.events;
          if (res.problem) {
            const turnKey = `${m.round}:${m.votes}:${m.circuit}:${m.turn}`;
            const prev = this.refusals.get(from);
            const n = prev && prev.turnKey === turnKey ? prev.n + 1 : 1;
            this.refusals.set(from, {
              text: res.problem === 'own' ? STR.typeErrOwn : STR.typeErrEmpty,
              n,
              turnKey,
            });
            this.game.vibrate(from, [40, 30, 40]);
          }
        }
        break;
      default:
        return;
    }
    if (events.length) this.handle(events);
    else {
      this.version.value++;
      this.syncViews();
    }
  }

  /** Hold the match while the shell is paused or nobody is connected. */
  private updateHold(): void {
    const late = this.match.phase === 'final' || this.match.phase === 'ended';
    const hold = this.shellPaused || (this.game.players.length === 0 && !late);
    if (hold === this.match.held) return;
    this.match.setHeld(hold, this.game.now());
    if (hold && this.hurry) {
      this.hurry = false;
      this.game.musicHurry(false);
    }
    this.version.value++;
    if (!hold) this.syncViews();
  }

  private refusalFor = (id: number): { text: string; n: number } | undefined => {
    const r = this.refusals.get(id);
    const m = this.match;
    if (!r || r.turnKey !== `${m.round}:${m.votes}:${m.circuit}:${m.turn}`) return undefined;
    return r;
  };

  private syncViews(): void {
    const now = this.game.now();
    const host = this.hostId();
    const ctx = {
      hostId: host,
      name: (id: number) => this.game.player(id)?.name ?? '?',
      color: (id: number) => this.game.player(id)?.color ?? '#FFC928',
      refusal: this.refusalFor,
    };
    for (const p of this.game.players) {
      const view = viewFor(this.match, p.id, now, ctx);
      if (!view) continue;
      const key = JSON.stringify(view);
      if (this.sent.get(p.id) === key) continue;
      this.sent.set(p.id, key);
      this.game.setView(p.id, view);
    }
  }

  /** Called every frame through the loop as well, so phone timers follow pauses and turns. */
  refresh(): void {
    this.syncViews();
  }
}

function loadRecent(): string[] {
  const raw = loadJson<unknown>(RECENT_KEY, []);
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
}

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;
  let game: HoorahGame;
  try {
    game = await connect();
  } catch {
    const { stage } = mountStage(root);
    render(<div class="ps-noshell">{STR.noShell}</div>, stage);
    return;
  }
  const { stage } = mountStage(root);
  await fontsReady();
  if (game.isMirror) {
    bootMirror(game, stage);
    return;
  }
  const recent = loadRecent();
  const match = new PenyusupMatch({
    rounds: roundsFrom(game.settings),
    seed: randomSeed(),
    now: game.now(),
    players: presence(game),
    recent: new Set(recent),
  });
  const driver = new PenyusupDriver(game, match);
  // Remember played pairs when each ronde is dealt, so the next session draws fresh ones.
  let saved = 0;
  driver.frame.subscribe(() => {
    if (match.played.length === saved) return;
    saved = match.played.length;
    const next = [...recent.filter((k) => !match.played.includes(k)), ...match.played].slice(-RECENT_MAX);
    saveJson(RECENT_KEY, next);
  });
  if (import.meta.env.DEV) (window as unknown as { __penyusup?: PenyusupMatch }).__penyusup = match;
  render(<PenyusupScreen model={driver} />, stage);
  game.ready();
  game.music('penyusup');
  driver.start();
  const publish = publishMirror(game, driver);
  // Phone timers and turn changes that happen on the clock (not on events) still reach phones
  // (and far-away screens: the publish is deduplicated, so an unchanged state costs nothing).
  window.setInterval(() => {
    driver.refresh();
    publish();
  }, 500);
}

/** Host's screen: send the display state to far-away screens on every stage change. */
function publishMirror(game: HoorahGame, driver: PenyusupDriver): () => void {
  const send = () => {
    if (!game.mirrored) return;
    game.publish(toMirror(driver.match, { players: game.allPlayers, hostId: driver.hostId() }));
  };
  effect(() => {
    void driver.version.value;
    send();
  });
  game.on('mirrors', (on) => {
    if (on) send();
  });
  return send;
}

/** Far-away screen: the stage model fed by the Host's published states (no rules, no phones). */
class MirrorModel implements ScreenModel {
  readonly version = signal(0);
  readonly frame = new FrameBus();

  constructor(readonly match: MirrorScene) {}

  hostId = (): number | null => this.match.hostId();

  info = (id: number): SeatInfo | undefined => this.match.info(id);

  apply(next: PenyusupMirror): void {
    const prev = this.match.current;
    this.match.set(next);
    this.version.value++;
    // The same flourishes the Host's driver fires (its sounds and music arrive on their own).
    if (next.ph === 'guess' && next.gu?.[1] && !prev.gu?.[1]) window.setTimeout(celebrate, 200);
    if (prev.ph === next.ph && prev.r === next.r) return;
    if (next.ph === 'reveal') {
      const out = next.ta?.o ?? null;
      const role = next.rl.find(([id]) => id === out)?.[1];
      if (role && role !== 'warga') {
        window.setTimeout(() => confetti({ x: 0.5, y: 0.35, count: 70, spread: 0.7, power: 0.8 }), FLIP_MS);
      }
    } else if (next.ph === 'roundEnd') {
      const side = next.oc?.[0];
      if (side && side !== 'warga') window.setTimeout(celebrate, 300);
    } else if (next.ph === 'final') {
      window.setTimeout(celebrate, 300);
    }
  }
}

function bootMirror(game: HoorahGame, stage: HTMLElement): void {
  let model: MirrorModel | null = null;
  game.on('mirror', (raw) => {
    const state = applyMirror(raw);
    if (!state) return;
    if (model) {
      model.apply(state);
      return;
    }
    const scene = new MirrorScene(state, () => game.now());
    if (game.paused) scene.setLocalPause(true);
    const created = new MirrorModel(scene);
    model = created;
    game.on('pause', (paused) => scene.setLocalPause(paused));
    render(<PenyusupScreen model={created} />, stage);
    const loop = () => {
      created.frame.emit();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    window.setInterval(() => created.frame.emit(), FALLBACK_TICK_MS);
  });
  // The empty black stage until the Host's first state arrives.
  render(
    <div class="ps-root">
      <div class="ps-spot" aria-hidden="true" />
    </div>,
    stage,
  );
  game.ready();
}

void boot();
