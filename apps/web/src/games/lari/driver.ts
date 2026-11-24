/**
 * Glue between the Hoorah SDK, the pure rules, the 3D scene and the DOM HUD: the roster (with
 * computer runners when one person plays alone, and the computer covering dropped phones), the
 * intro, countdown, run and finish beats, fixed-step simulation with render interpolation, phone
 * views, sounds and the result.
 */
import type { ControllerView, PlayerInfo, RelayedInput } from '@hoorah/protocol';
import type { GameResult } from '@hoorah/sdk';
import type { Sfx } from '../../shared/audio';
import { celebrate } from '../../shared/confetti';
import { CONTROL_TUNING } from '../../shared/controls';
import { cpuSkill, reportSoloResult, soloOpponents } from '../common/cpu';
import { fieldSkills, RunnerBrain, TAKEOVER_SKILL } from './brain';
import type { BoardRow, HudStore, NetRow } from './hud';
import { type LariEvent, LariRun, type Mode, parseMode, type Runner, type Tuning } from './logic';
import { buildResult, finalRows, soloOutcome } from './results';
import type { CamMode, LariScene, TagPos } from './scene';
import { formatClock, formatElapsed, formatInt, STR } from './strings';
import { countdownView, doneView, padView, waitView } from './views';

export interface GameLike {
  readonly allPlayers: PlayerInfo[];
  readonly settings: Record<string, string | number | boolean>;
  readonly paused: boolean;
  now(): number;
  on(event: 'players', fn: (players: PlayerInfo[]) => void): () => void;
  on(event: 'input', fn: (input: RelayedInput & { atMs: number }) => void): () => void;
  on(event: 'pause', fn: (paused: boolean) => void): () => void;
  setView(to: number | 'all', view: ControllerView): void;
  vibrate(to: number | 'all', pattern: number | number[]): void;
  sfx(name: string): void;
  music(track: string | null): void;
  end(result: GameResult): void;
  ready(): void;
}

const GAME_ID = 'lari';
const STEP = 1 / 60;
const INTRO_S = 5.5;
const COUNT_S = 3;
const FINISH_S = 5.5;
/** Opponents for someone playing alone. */
const SOLO_OPPONENTS = 4;
const HUD_MS = 100;
const VIEW_MS = 450;
const HELP_S = 9;
const SFX_GAP: Partial<Record<Sfx, number>> = {
  jump: 90,
  ding: 60,
  skid: 160,
  hit: 120,
  select: 80,
  flip: 70,
};
/** Smoothing of the measured phone lag on the `?diag=1` panel (share of the newest sample). */
const LAG_EMA = 0.25;

type Beat = 'intro' | 'count' | 'run' | 'finish' | 'ended';

function randomSeed(): number {
  try {
    const b = new Uint32Array(1);
    crypto.getRandomValues(b);
    return b[0] ?? 1;
  } catch {
    return Date.now() >>> 0;
  }
}

export interface DriverOptions {
  /** Every runner on autopilot (offline demo and soak tests). */
  autopilot?: boolean;
  seed?: number;
  /** Mode override (demo). */
  mode?: Mode;
  /** Rule overrides (demo: a short Sprint); laid over the Lab's runner settings. */
  tuning?: Partial<Tuning>;
  /**
   * `?diag=1`: show each phone's lag and how many phones skip the relay. `directLinks` reads the
   * shell's count of open direct (WebRTC) links, null when unknown.
   */
  netDiag?: { directLinks(): number | null };
}

export class LariDriver {
  readonly run: LariRun;
  readonly mode: Mode;
  private beat: Beat = 'intro';
  private beatT = 0;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private paused = false;
  private lastHud = 0;
  private lastViews = 0;
  private lastCount = -1;
  private readonly sent = new Map<number, string>();
  private readonly sfxAt = new Map<Sfx, number>();
  private readonly brains = new Map<number, RunnerBrain>();
  private readonly cpus: PlayerInfo[];
  private readonly people: PlayerInfo[];
  private readonly names = new Map<number, string>();
  private readonly colors = new Map<number, string>();
  private readonly tag: TagPos = { x: 0, y: 0, on: false };
  private readonly hurtUntil = new Map<number, number>();
  private result: GameResult | null = null;
  private clockT = 0;
  /** Measured phone lag per player (ms, smoothed) for the `?diag=1` panel. */
  private readonly lagMs = new Map<number, { avg: number; last: number }>();
  /** Measured fps (rendered frames) once a second: quality ladder and debug overlay. */
  onFps: ((fps: number) => void) | null = null;
  /** Called after every rendered frame (the quality ladder). */
  onFrame: ((now: number) => void) | null = null;
  /** Frame pacing (30 fps cap on the ladder's last rung); every display frame when null. */
  pacer: { due(now: number): boolean } | null = null;
  private fpsFrames = 0;
  private fpsT = 0;

  constructor(
    private readonly game: GameLike,
    private readonly hud: HudStore,
    private readonly scene: LariScene,
    private readonly opts: DriverOptions = {},
  ) {
    this.mode = opts.mode ?? parseMode(game.settings.rounds);
    this.people = game.allPlayers.filter((p) => p.connected);
    if (this.people.length === 0) this.people = game.allPlayers.slice(0, 1);
    this.cpus = opts.autopilot ? [] : soloOpponents(this.people, SOLO_OPPONENTS);
    const roster = [
      ...this.people.map((p) => ({ id: p.id, cpu: false })),
      ...this.cpus.map((p) => ({ id: p.id, cpu: true })),
    ];
    // Lane, jump and lag catch-up come from the Lab Kontrol settings of this browser.
    const { laneTime, jumpV, gravity, fallMul, hang, lagCatch } = CONTROL_TUNING.runner;
    this.run = new LariRun({
      mode: this.mode,
      runners: roster,
      seed: opts.seed ?? randomSeed(),
      tuning: { laneTime, jumpV, gravity, fallMul, hang, lagCatch, ...opts.tuning },
    });
    const skills = fieldSkills(cpuSkill(GAME_ID), this.cpus.length);
    this.cpus.forEach((c, i) => {
      this.brains.set(c.id, new RunnerBrain(skills[i] ?? 0.5));
    });
    if (opts.autopilot) {
      this.people.forEach((p, i) => {
        this.brains.set(p.id, new RunnerBrain(0.35 + (i % 4) * 0.18));
        this.run.setTakeover(p.id, true);
      });
    }
    for (const p of [...this.people, ...this.cpus]) {
      this.names.set(p.id, p.name);
      this.colors.set(p.id, p.color);
    }
    hud.mode.value = this.mode;
    hud.cards.value = [...this.people, ...this.cpus].map((p) => ({
      id: p.id,
      name: p.name,
      fruit: p.fruit,
      look: p.look,
      color: p.color,
    }));
    scene.setRunners(
      [...this.people, ...this.cpus].map((p) => ({ id: p.id, fruit: p.fruit, color: p.color })),
    );
  }

  get beatName(): Beat {
    return this.beat;
  }

  /** True while the run itself goes (not the intro, countdown, finish or a pause). */
  get running(): boolean {
    return this.beat === 'run' && !this.paused;
  }

  start(): void {
    this.game.on('input', (i) => this.onInput(i));
    this.game.on('players', () => this.onPlayers());
    this.game.on('pause', (p) => this.setPaused(p));
    if (this.game.paused) this.setPaused(true);
    this.game.music(GAME_ID);
    this.hud.phase.value = 'intro';
    this.sendViews();
    this.updateHud();
    this.last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      // Skipped display frames: the next drawn frame's delta covers them.
      if (this.pacer && !this.pacer.due(now)) return;
      this.frame(now);
      this.onFrame?.(now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }

  /** Jump straight to the run (demo, screenshots). */
  skipIntro(): void {
    this.beat = 'count';
    this.beatT = COUNT_S;
  }

  /* ---------------------------------------------------------------- SDK */

  private onInput(i: RelayedInput & { atMs: number }): void {
    if (this.paused) {
      // Keep the counter in step so swipes made during the pause do nothing later.
      this.run.input(i.from, i.taps, 0, 0);
      return;
    }
    const lag = Math.max(0, (this.game.now() - i.atMs) / 1000);
    if (this.opts.netDiag) this.noteLag(i.from, lag * 1000);
    this.run.input(i.from, i.taps, i.buttons, lag);
    // Sound and effects the moment the move lands, not on the next simulation step.
    this.drain();
  }

  private noteLag(id: number, ms: number): void {
    const prev = this.lagMs.get(id);
    this.lagMs.set(id, { avg: prev ? prev.avg + (ms - prev.avg) * LAG_EMA : ms, last: ms });
  }

  /** Rows of the `?diag=1` panel: every person with their smoothed and last phone lag. */
  netRows(): NetRow[] {
    return this.people.map((p) => {
      const l = this.lagMs.get(p.id);
      return {
        id: p.id,
        name: this.names.get(p.id) ?? p.name,
        avgMs: l ? Math.round(l.avg) : null,
        lastMs: l ? Math.round(l.last) : null,
      };
    });
  }

  private onPlayers(): void {
    const online = new Set(this.game.allPlayers.filter((p) => p.connected).map((p) => p.id));
    for (const p of this.people) {
      const r = this.run.runner(p.id);
      if (!r || this.opts.autopilot) continue;
      const away = !online.has(p.id);
      if (away && !r.takeover) {
        this.run.setTakeover(p.id, true);
        this.brains.set(p.id, new RunnerBrain(TAKEOVER_SKILL));
        this.sent.delete(p.id);
      } else if (!away && r.takeover) {
        this.run.setTakeover(p.id, false);
        this.brains.delete(p.id);
        this.sent.delete(p.id);
      }
    }
    // Late joiners watch this run.
    for (const p of this.game.allPlayers) {
      if (!p.connected || this.run.runner(p.id) || this.sent.has(p.id)) continue;
      this.game.setView(p.id, waitView());
      this.sent.set(p.id, 'wait');
    }
    this.sendViews();
  }

  private setPaused(p: boolean): void {
    this.paused = p;
    this.hud.paused.value = p;
    this.last = performance.now();
  }

  /* ---------------------------------------------------------------- loop */

  private frame(now: number): void {
    const elapsed = Math.max(0, (now - this.last) / 1000);
    const real = Math.min(0.1, elapsed);
    this.last = now;
    this.fpsFrames++;
    // The real elapsed time: slow frames must read as slow (the simulation clamps, not the meter).
    this.fpsT += elapsed;
    if (this.fpsT >= 1) {
      this.onFps?.(this.fpsFrames / this.fpsT);
      this.fpsFrames = 0;
      this.fpsT = 0;
    }
    const dt = this.paused || this.beat === 'ended' ? 0 : real;
    this.beatT += dt;
    let alpha = 1;
    switch (this.beat) {
      case 'intro':
        if (this.beatT >= INTRO_S) this.toCount();
        break;
      case 'count': {
        const left = Math.ceil(COUNT_S - this.beatT);
        if (left !== this.lastCount && left > 0) {
          this.lastCount = left;
          this.hud.count.value = left;
          this.sfx('count');
          this.sendViews();
        }
        if (this.beatT >= COUNT_S) this.toRun();
        break;
      }
      case 'run': {
        this.acc += dt;
        let steps = 0;
        while (this.acc >= STEP && steps < 8) {
          this.acc -= STEP;
          steps++;
          for (const r of this.run.runners) this.brains.get(r.id)?.update(this.run, r);
          this.run.step(STEP);
          this.drain();
          if (this.run.phase === 'done') break;
        }
        if (steps >= 8) this.acc = 0;
        alpha = this.acc / STEP;
        if (this.run.phase === 'done') this.toFinish();
        break;
      }
      case 'finish':
        if (this.beatT >= FINISH_S) this.end();
        break;
      case 'ended':
        break;
    }
    if (this.run.phase !== 'run') this.drain();
    // Paused: the last frame stays on the canvas, no need to redraw it.
    if (this.paused && this.drewPaused) return;
    this.drewPaused = this.paused;
    const camMode: CamMode =
      this.beat === 'intro' ? 'intro' : this.beat === 'finish' || this.beat === 'ended' ? 'finish' : 'run';
    this.scene.render(this.run, alpha, dt, camMode, Math.min(1, this.beatT / INTRO_S));
    this.placeTags(now);
    if (now - this.lastHud >= HUD_MS) {
      this.lastHud = now;
      this.updateHud();
    }
    if (now - this.lastViews >= VIEW_MS) {
      this.lastViews = now;
      this.sendViews();
    }
  }

  private toCount(): void {
    this.beat = 'count';
    this.beatT = 0;
    this.lastCount = -1;
    this.hud.phase.value = 'count';
  }

  private toRun(): void {
    this.beat = 'run';
    this.beatT = 0;
    this.acc = 0;
    this.hud.count.value = 0;
    this.hud.phase.value = 'run';
    this.hud.help.value = true;
    window.setTimeout(() => {
      this.hud.count.value = -1;
    }, 900);
    window.setTimeout(() => {
      this.hud.help.value = false;
    }, HELP_S * 1000);
    this.run.start();
    this.sfx('go');
    this.sendViews();
  }

  private toFinish(): void {
    if (this.beat === 'finish') return;
    this.beat = 'finish';
    this.beatT = 0;
    const rows = finalRows(this.run);
    const winner = rows[0];
    this.scene.setWinner(winner?.id ?? null);
    this.result = buildResult(this.run, (id) => this.names.get(id) ?? '', this.cpus);
    this.hud.phase.value = 'finish';
    this.hud.callout.value = null;
    this.hud.help.value = false;
    this.hud.finish.value = {
      title: this.result.title,
      rows: rows.map((r) => ({
        id: r.id,
        rank: r.place,
        value: this.mode === 'sprint' ? STR.points(r.score) : STR.distance(r.dist),
      })),
    };
    this.game.music(null);
    this.sfx('whistle');
    window.setTimeout(() => this.sfx('win'), 350);
    celebrate();
    for (const r of this.run.runners) if (!r.cpu) this.game.setView(r.id, doneView(this.run, r));
    if (this.cpus.length > 0 && this.people.length === 1) {
      reportSoloResult(GAME_ID, soloOutcome(rows, this.people[0]!.id));
    }
  }

  private end(): void {
    if (this.beat === 'ended') return;
    this.beat = 'ended';
    if (this.result) this.game.end(this.result);
  }

  /* ---------------------------------------------------------------- events */

  private drain(): void {
    const ev = this.run.events;
    if (ev.length === 0) return;
    for (const e of ev) this.onEvent(e);
    ev.length = 0;
  }

  private onEvent(e: LariEvent): void {
    this.scene.onEvent(e, this.run);
    switch (e.type) {
      case 'go':
        this.hud.say(STR.go, 'go');
        break;
      case 'jump':
        this.sfx('jump');
        break;
      case 'slide':
        this.sfx('skid');
        break;
      case 'lane':
        // Only people's moves: a soft swish confirms the swipe on the main screen at once.
        if (e.id > 0) this.sfx('flip');
        break;
      case 'coin':
        this.sfx('ding');
        break;
      case 'stumble':
        this.sfx('hit');
        this.hurtUntil.set(e.id, performance.now() + 900);
        if (e.id > 0) this.game.vibrate(e.id, [50, 30, 50]);
        break;
      case 'fall':
        this.sfx('drop');
        break;
      case 'bump':
        if (e.id > 0) this.game.vibrate(e.id, 25);
        break;
      case 'out': {
        this.sfx('collapse');
        this.hud.toast(STR.outToast(this.names.get(e.id) ?? ''));
        if (e.id > 0) this.game.vibrate(e.id, [100, 50, 100]);
        this.sent.delete(e.id);
        this.sendViews();
        break;
      }
      case 'faster':
        this.sfx('boost');
        this.hud.say(STR.faster, 'info');
        break;
      default:
        break;
    }
  }

  private sfx(name: Sfx): void {
    const gap = SFX_GAP[name];
    const now = performance.now();
    if (gap) {
      const at = this.sfxAt.get(name) ?? -1e9;
      if (now - at < gap) return;
      this.sfxAt.set(name, now);
    }
    this.game.sfx(name);
  }

  /* ---------------------------------------------------------------- HUD */

  private readonly tagX = new Float32Array(16);
  private readonly tagY = new Float32Array(16);
  private readonly tagOn = new Uint8Array(16);
  private readonly tagOrder: number[] = [];

  /** Name tags over the runners, nudged up so close runners' tags never cover each other. */
  private placeTags(now: number): void {
    const list = this.run.runners;
    const order = this.tagOrder;
    order.length = 0;
    for (let i = 0; i < list.length; i++) {
      const r = list[i]!;
      this.scene.tagPos(r, this.tag);
      this.tagX[i] = this.tag.x;
      this.tagY[i] = this.tag.y;
      this.tagOn[i] = this.tag.on && !r.out && this.beat !== 'intro' ? 1 : 0;
      order.push(i);
    }
    // Nearest runners (lowest on screen) keep their spot; the others step up (insertion sort).
    for (let a = 1; a < order.length; a++) {
      const v = order[a]!;
      let b = a - 1;
      while (b >= 0 && this.tagY[order[b]!]! < this.tagY[v]!) {
        order[b + 1] = order[b]!;
        b--;
      }
      order[b + 1] = v;
    }
    for (let k = 0; k < order.length; k++) {
      const i = order[k]!;
      if (!this.tagOn[i]) continue;
      for (let pass = 0; pass < 3; pass++) {
        let moved = false;
        for (let j = 0; j < k; j++) {
          const o = order[j]!;
          if (!this.tagOn[o]) continue;
          if (Math.abs(this.tagX[i]! - this.tagX[o]!) < 104 && Math.abs(this.tagY[i]! - this.tagY[o]!) < 30) {
            this.tagY[i] = this.tagY[o]! - 30;
            moved = true;
          }
        }
        if (!moved) break;
      }
    }
    for (let i = 0; i < list.length; i++) {
      const r = list[i]!;
      const hurt = (this.hurtUntil.get(r.id) ?? 0) > now;
      const state = r.out ? 'out' : hurt ? 'hurt' : '';
      this.hud.placeTag(r.id, this.tagX[i]!, this.tagY[i]!, this.tagOn[i] === 1, state);
    }
  }

  private updateHud(): void {
    const run = this.run;
    const h = this.hud;
    if (this.mode === 'sprint') {
      h.clockLabel.value = STR.timeLeft;
      const left = this.beat === 'run' ? run.timeLeft : run.tuning.sprintSeconds;
      h.clock.value = formatClock(left);
      const urgent = this.beat === 'run' && left <= 10;
      if (urgent && !h.urgent.value) h.say(STR.lastSeconds, 'warn');
      h.urgent.value = urgent;
      h.alive.value = null;
    } else {
      h.clockLabel.value = STR.timeRun;
      h.clock.value = formatElapsed(run.t);
      h.alive.value = STR.aliveOf(run.alive, run.runners.length);
    }
    h.speed.value = Math.round(run.speed * 3.6);
    h.speedK.value = Math.min(1, Math.max(0, (run.speed - 8) / 13));
    const now = performance.now();
    const order = run.standings();
    const rows: BoardRow[] = order.map((r, i) => ({
      id: r.id,
      rank: i + 1,
      value: this.mode === 'sprint' ? formatInt(run.scoreOf(r)) : STR.distance(run.distOf(r)),
      coins: r.coins,
      out: r.out,
      offline: r.takeover,
      hurt: (this.hurtUntil.get(r.id) ?? 0) > now,
    }));
    const sig = rows.map((r) => `${r.id}${r.rank}${r.value}${r.coins}${r.out}${r.hurt}`).join('|');
    if (sig !== this.boardSig) {
      this.boardSig = sig;
      h.board.value = rows;
    }
    this.clockT = run.t;
    if (this.opts.netDiag) {
      const net = { rows: this.netRows(), direct: this.opts.netDiag.directLinks() };
      const netSig = JSON.stringify(net);
      if (netSig !== this.netSig) {
        this.netSig = netSig;
        h.net.value = net;
      }
    }
  }
  private boardSig = '';
  private netSig = '';
  private drewPaused = false;

  /* ---------------------------------------------------------------- phones */

  private sendViews(): void {
    if (this.beat === 'finish' || this.beat === 'ended') return;
    const order = this.run.standings();
    const rankOf = new Map<number, number>();
    order.forEach((r, i) => {
      rankOf.set(r.id, i + 1);
    });
    for (const r of this.run.runners) {
      if (r.cpu || r.takeover) continue;
      const view = this.viewFor(r, rankOf.get(r.id) ?? 1);
      const json = JSON.stringify(view);
      if (this.sent.get(r.id) === json) continue;
      this.sent.set(r.id, json);
      this.game.setView(r.id, view);
    }
  }

  private viewFor(r: Runner, rank: number): ControllerView {
    const color = this.colors.get(r.id) ?? '#FF5A1F';
    if (this.beat === 'count') return countdownView(Math.max(1, this.lastCount), color);
    if (this.beat === 'intro') return padView(this.run, r, rank, color, STR.phoneIntro);
    return padView(this.run, r, rank, color);
  }

  /** Debug summary for soak scripts. */
  debug(): { beat: Beat; t: number; d: number; speed: number; alive: number; clock: number } {
    return {
      beat: this.beat,
      t: this.run.t,
      d: this.run.packD,
      speed: this.run.speed,
      alive: this.run.alive,
      clock: this.clockT,
    };
  }
}
