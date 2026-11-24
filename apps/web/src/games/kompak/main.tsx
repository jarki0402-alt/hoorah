/**
 * Kompak Gak? entry: connects to the Hoorah shell, mounts the main-screen stage, and drives the
 * pure match logic from SDK events and a frame loop. Side effects (sound, vibration, confetti,
 * phone views) all happen here, in response to logic events.
 */

import type { ControllerToGame } from '@hoorah/protocol';
import { connect, type HoorahGame } from '@hoorah/sdk';
import { effect, type ReadonlySignal, signal } from '@preact/signals';
import { render } from 'preact';
import type { Sfx } from '../../shared/audio';
import { celebrate, confetti } from '../../shared/confetti';
import { fontsReady, mountStage } from '../common/stage';
import { backdropUrl } from './backdrop';
import { buildResult, type KompakEvent, KompakMatch, type PlayerPresence, type RoundScore } from './logic';
import { applyMirror, type KompakMirror, MirrorScene, toMirror } from './mirror';
import { STR } from './strings';
import { FrameBus, KompakTv, type SeatInfo, type StageSize, type TvModel } from './tv';
import { optionIndex, viewFor } from './views';
import './kompak.css';

const DEFAULT_ROUNDS = 12;
const FALLBACK_TICK_MS = 250;
/** Prompts played in recent sessions on this screen, so the next game draws fresh ones first. */
const RECENT_KEY = 'hoorah:kompak:recent';
const RECENT_MAX = 90;
/** When the stamps slam on the main screen (matches the CSS animation delays). */
const STAMP_MS = 1050;

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

function loadRecent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function saveRecent(recent: string[], played: string[]): void {
  try {
    const next = [...recent.filter((id) => !played.includes(id)), ...played].slice(-RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the next game just draws from the whole bank.
  }
}

/** Confetti from each winning column's stamp. */
function burstOver(winners: readonly number[]): void {
  const cols = document.querySelectorAll<HTMLElement>('.kp-col');
  for (const i of winners) {
    const el = cols[i];
    if (!el) continue;
    const r = el.getBoundingClientRect();
    confetti({
      x: (r.left + r.width / 2) / window.innerWidth,
      y: Math.max(0.15, (r.top + r.height * 0.3) / window.innerHeight),
      count: winners.length > 1 ? 40 : 70,
      spread: 0.6,
      power: 0.7,
    });
  }
}

class KompakDriver implements TvModel {
  readonly version = signal(0);
  readonly waiting = signal(false);
  readonly frame = new FrameBus();
  private readonly lastSent = new Map<number, string>();
  private connected = new Set<number>();
  private shellPaused: boolean;
  private ended = false;
  private raf = 0;
  private interval = 0;

  constructor(
    private readonly game: HoorahGame,
    readonly match: KompakMatch,
  ) {
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

  private handle(events: KompakEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'phase':
          if (e.phase === 'intro') this.sfx('reveal');
          else if (e.phase === 'question') this.sfx('tick');
          else if (e.phase === 'final') {
            this.sfx('win');
            window.setTimeout(celebrate, 300);
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
          this.onReveal(e.result);
          break;
      }
    }
    this.version.value++;
    this.syncViews();
  }

  private onReveal(result: RoundScore): void {
    this.sfx('drop', 300);
    const scored = result.outcomes.some((o) => o.points > 0);
    if (result.unanimous && result.mode === 'group') this.sfx('super', STAMP_MS);
    else if (result.mode === 'sehati' && scored) this.sfx('cheer', STAMP_MS);
    else this.sfx(scored ? 'correct' : 'wrong', STAMP_MS);
    for (const o of result.outcomes) {
      if (!this.connected.has(o.playerId)) continue;
      this.game.vibrate(o.playerId, o.points > 0 ? 30 : [60, 40, 60]);
    }
    if (scored) window.setTimeout(() => burstOver(result.winners), STAMP_MS + 80);
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    cancelAnimationFrame(this.raf);
    window.clearInterval(this.interval);
    this.game.end(buildResult(this.match, (id) => this.game.player(id)?.name ?? 'Pemain'));
  }

  private onPlayers(): void {
    const now = this.game.now();
    this.match.syncPlayers(presenceOf(this.game), now);
    const nowConnected = new Set(this.game.players.map((p) => p.id));
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

  private syncViews(): void {
    if (this.match.held) return;
    const now = this.game.now();
    for (const p of this.game.players) {
      const view = viewFor(this.match, p.id, now);
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
    render(<div class="kp-noshell">{STR.noShell}</div>, stage);
    return;
  }
  const { stage, width, height, onResize } = mountStage(root);
  const size = signal<StageSize>({ w: width(), h: height() });
  onResize((h, w) => {
    size.value = { w, h };
  });
  await Promise.all([fontsReady(), preloadStage(size.value)]);
  if (game.isMirror) {
    bootMirror(game, stage, size);
    return;
  }
  const recent = loadRecent();
  const match = new KompakMatch({
    seed: randomSeed(),
    rounds: roundsFrom(game.settings),
    now: game.now(),
    players: presenceOf(game),
    recent: new Set(recent),
  });
  saveRecent(
    recent,
    match.prompts.map((q) => q.id),
  );
  const driver = new KompakDriver(game, match);
  // Dev-only hook for local harnesses and e2e tests.
  if (import.meta.env.DEV) (window as unknown as { __kompak?: KompakMatch }).__kompak = match;
  render(<KompakTv model={driver} size={size} />, stage);
  game.ready();
  game.music('kompak');
  driver.start();
  publishMirror(game, driver);
}

/** Host's screen: send the display state to far-away screens on every stage change. */
function publishMirror(game: HoorahGame, driver: KompakDriver): void {
  const send = () => {
    if (!game.mirrored) return;
    game.publish(
      toMirror(driver.match, game.now(), driver.match.held, {
        players: game.allPlayers,
        waiting: driver.waiting.peek(),
      }),
    );
  };
  effect(() => {
    void driver.version.value;
    void driver.waiting.value;
    send();
  });
  game.on('mirrors', (on) => {
    if (on) send();
  });
}

/** Far-away screen: the stage model fed by the Host's published states (no rules, no phones). */
class MirrorModel implements TvModel {
  readonly version = signal(0);
  readonly waiting = signal(false);
  readonly frame = new FrameBus();

  constructor(readonly match: MirrorScene) {
    this.waiting.value = match.current.wait;
  }

  info = (id: number): SeatInfo | undefined => this.match.info(id);

  apply(next: KompakMirror, now: number): void {
    const prev = this.match.current;
    this.match.set(next, now);
    this.waiting.value = next.wait;
    this.version.value++;
    if (prev.ph === next.ph && prev.r === next.r) return;
    // The same flourishes the Host's driver fires on these phase changes.
    const res = next.res;
    if (next.ph === 'reveal' && res && res.oc.some(([, , , points]) => points > 0)) {
      window.setTimeout(() => burstOver(res.w), STAMP_MS + 80);
    } else if (next.ph === 'final') {
      window.setTimeout(celebrate, 300);
    }
  }
}

function bootMirror(game: HoorahGame, stage: HTMLElement, size: ReadonlySignal<StageSize>): void {
  let model: MirrorModel | null = null;
  game.on('mirror', (raw) => {
    const state = applyMirror(raw);
    if (!state) return;
    const now = game.now();
    if (model) {
      model.apply(state, now);
      return;
    }
    const scene = new MirrorScene(state);
    if (game.paused) scene.setLocalPause(true, now);
    const created = new MirrorModel(scene);
    model = created;
    game.on('pause', (paused) => scene.setLocalPause(paused, game.now()));
    render(<KompakTv model={created} size={size} />, stage);
    const loop = () => {
      created.frame.emit(game.now());
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    window.setInterval(() => created.frame.emit(game.now()), FALLBACK_TICK_MS);
  });
  // Backdrop only until the Host's first state arrives.
  const { w, h } = size.value;
  render(
    <div class="kp-root">
      <img class="kp-bg" src={backdropUrl(w, h)} alt="" width={w} height={h} draggable={false} />
    </div>,
    stage,
  );
  game.ready();
}

void boot();
