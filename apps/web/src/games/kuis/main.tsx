/**
 * Kuis Nusantara entry: connects to the Hoorah shell, mounts the TV stage, and drives the pure
 * match logic from SDK events and a frame loop. Side effects (sound, vibration, confetti, phone
 * views) all happen here, in response to logic events.
 */

import type { ControllerToGame } from '@hoorah/protocol';
import { connect, type HoorahGame } from '@hoorah/sdk';
import { signal } from '@preact/signals';
import { render } from 'preact';
import type { Sfx } from '../../shared/audio';
import { celebrate, confetti } from '../../shared/confetti';
import { readRecord, submitRecord } from '../common/records';
import { fontsReady, mountStage } from '../common/stage';
import { backdropUrl } from './backdrop';
import {
  buildResult,
  type KuisEvent,
  KuisMatch,
  type PlayerPresence,
  type RoundOutcome,
  type SoloRecord,
  soloRecord,
} from './logic';
import { STR } from './strings';
import { FrameBus, KuisTv, type StageSize, type TvModel } from './tv';
import { optionIndex, viewFor } from './views';
import './kuis.css';

const DEFAULT_ROUNDS = 10;
/** Key for the solo records (PRD 6.4); the variant is the number of questions. */
const GAME_ID = 'kuis';
/** Logic keeps ticking even if rAF is throttled (e.g. the TV tab loses focus). */
const FALLBACK_TICK_MS = 250;

function roundsFrom(settings: HoorahGame['settings']): number {
  const raw = Number(settings.rounds);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : DEFAULT_ROUNDS;
}

function presenceOf(game: HoorahGame): PlayerPresence[] {
  return game.allPlayers.map((p) => ({ id: p.id, connected: p.connected }));
}

function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] ?? Date.now();
}

class KuisDriver implements TvModel {
  readonly version = signal(0);
  readonly waiting = signal(false);
  readonly frame = new FrameBus();
  /** Last view JSON sent per player, so only changes go over the wire. */
  private readonly lastSent = new Map<number, string>();
  private connected = new Set<number>();
  private shellPaused: boolean;
  private ended = false;
  private raf = 0;
  private interval = 0;
  readonly recordBefore: number | null;
  record: SoloRecord | null = null;

  constructor(
    private readonly game: HoorahGame,
    readonly match: KuisMatch,
  ) {
    this.recordBefore = readRecord(GAME_ID, String(match.total));
    this.shellPaused = game.paused;
    this.connected = new Set(game.players.map((p) => p.id));
    game.on('players', () => this.onPlayers());
    game.on('action', (from, action) => this.onAction(from, action));
    game.on('pause', (paused) => {
      this.shellPaused = paused;
      this.updateHold();
    });
    this.updateHold();
  }

  info = (id: number) => this.game.player(id);

  start(): void {
    const loop = () => {
      this.step();
      if (!this.ended) this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    this.interval = window.setInterval(() => this.step(), FALLBACK_TICK_MS);
    this.syncViews();
  }

  private step(): void {
    const now = this.game.now();
    const events = this.match.tick(now);
    if (events.length) this.handle(events);
    this.frame.emit(now);
  }

  private sfx(name: Sfx, delayMs = 0): void {
    if (delayMs > 0) window.setTimeout(() => this.game.sfx(name), delayMs);
    else this.game.sfx(name);
  }

  private handle(events: KuisEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'phase':
          if (e.phase === 'intro') this.sfx('reveal');
          else if (e.phase === 'question') this.sfx('tick');
          else if (e.phase === 'final') {
            this.submitSolo();
            this.sfx(this.record?.isNew ? 'super' : 'win');
            window.setTimeout(celebrate, 250);
          } else if (e.phase === 'ended') this.finish();
          break;
        case 'locked':
          this.sfx('select');
          break;
        case 'cue':
          if (e.secondsLeft === 5) this.sfx('tension');
          this.sfx('count');
          break;
        case 'reveal':
          this.onReveal(e.outcomes, e.fastestCorrect);
          break;
      }
    }
    this.version.value++;
    this.syncViews();
  }

  private onReveal(outcomes: RoundOutcome[], fastest: number | null): void {
    const anyCorrect = outcomes.some((o) => o.score.correct);
    this.sfx(anyCorrect ? 'correct' : 'wrong');
    for (const o of outcomes) {
      if (!this.connected.has(o.playerId)) continue;
      this.game.vibrate(o.playerId, o.score.correct ? 30 : [60, 40, 60]);
    }
    if (outcomes.some((o) => o.score.doubled)) this.sfx('super', 550);
    else if (outcomes.length >= 2 && outcomes.every((o) => o.score.correct)) this.sfx('cheer', 550);
    if (fastest !== null) window.setTimeout(() => this.burstAt(fastest), 480);
  }

  /** Confetti from the fastest correct player's podium. */
  private burstAt(playerId: number): void {
    const el = document.querySelector<HTMLElement>(`[data-pid="${playerId}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    confetti({
      x: (r.left + r.width / 2) / window.innerWidth,
      y: r.top / window.innerHeight,
      count: 70,
      spread: 0.7,
      power: 0.75,
    });
  }

  /** A solo match stores its score once, when the final card goes up (PRD 6.4). */
  private submitSolo(): void {
    if (this.record || !this.match.solo) return;
    const me = this.match.roster[0];
    if (!me) return;
    const r = submitRecord(GAME_ID, String(this.match.total), me.score);
    this.record = soloRecord(r, me.score);
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    cancelAnimationFrame(this.raf);
    window.clearInterval(this.interval);
    this.submitSolo();
    this.game.end(buildResult(this.match, (id) => this.game.player(id)?.name ?? 'Pemain', this.record));
  }

  private onPlayers(): void {
    const now = this.game.now();
    this.match.syncPlayers(presenceOf(this.game), now);
    const nowConnected = new Set(this.game.players.map((p) => p.id));
    // Anyone who (re)connects or drops gets their current view re-sent next time.
    for (const id of nowConnected) if (!this.connected.has(id)) this.lastSent.delete(id);
    for (const id of this.connected) if (!nowConnected.has(id)) this.lastSent.delete(id);
    this.connected = nowConnected;
    this.updateHold();
    this.version.value++;
    this.syncViews();
  }

  private onAction(from: number, action: ControllerToGame): void {
    if (action.k !== 'action') return;
    let idx = optionIndex(action.id);
    if (idx < 0) idx = optionIndex(action.value);
    if (idx < 0) return;
    const events = this.match.answer(from, idx, action.at, this.game.now());
    if (events.length) {
      this.handle(events);
    } else {
      // Rejected (late, duplicate, wrong phase): make sure the phone shows the real state.
      this.lastSent.delete(from);
      this.syncViews();
    }
  }

  /** Hold the match while the shell is paused or nobody is connected. */
  private updateHold(): void {
    const late = this.match.phase === 'final' || this.match.phase === 'ended';
    const nobody = this.game.players.length === 0 && !late;
    this.waiting.value = nobody;
    const hold = this.shellPaused || nobody;
    if (hold === this.match.held) return;
    this.match.setHeld(hold, this.game.now());
    this.version.value++;
    if (!hold) this.syncViews();
  }

  /** Send each connected phone its view if it changed. Skipped while held (deadlines move). */
  private syncViews(): void {
    if (this.match.held) return;
    const now = this.game.now();
    for (const p of this.game.players) {
      const view = viewFor(this.match, p.id, now, this.record);
      if (!view) continue;
      const key = JSON.stringify(view);
      if (this.lastSent.get(p.id) === key) continue;
      this.lastSent.set(p.id, key);
      this.game.setView(p.id, view);
    }
  }
}

async function preloadStage(size: StageSize): Promise<void> {
  try {
    const img = new Image();
    img.src = backdropUrl(size.w, size.h);
    await img.decode();
  } catch {
    // The <img> still renders; this only avoids a first-frame flash.
  }
}

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;
  let game: HoorahGame;
  try {
    game = await connect();
  } catch {
    const { stage } = mountStage(root);
    render(<div class="kz-noshell">{STR.noShell}</div>, stage);
    return;
  }
  const { stage, width, height, onResize } = mountStage(root);
  const size = signal<StageSize>({ w: width(), h: height() });
  onResize((h, w) => {
    size.value = { w, h };
  });
  await Promise.all([fontsReady(), preloadStage(size.value)]);
  const match = new KuisMatch({
    seed: randomSeed(),
    rounds: roundsFrom(game.settings),
    now: game.now(),
    players: presenceOf(game),
  });
  const driver = new KuisDriver(game, match);
  // Dev-only hook for local harnesses and e2e tests (reads the answer key, never in builds).
  if (import.meta.env.DEV) (window as unknown as { __kuis?: KuisMatch }).__kuis = match;
  render(<KuisTv model={driver} size={size} />, stage);
  game.ready();
  game.music('kuis');
  driver.start();
}

void boot();
