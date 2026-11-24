/**
 * Rebut Wilayah match rules with free, fluid movement. Pure: time comes in as plain ms numbers
 * from a paused-aware clock, randomness from an injected generator, so every rule is unit-tested.
 *
 * Movement (decided for an analog phone joystick and ~200 ms of relay latency):
 * - Positions and headings are continuous (field cells as floats). Everyone moves at one constant
 *   speed on a fixed 60 Hz step; the screen draws between steps.
 * - The stick sets a target angle; the heading turns toward it at a capped turn rate, so every
 *   change of direction is a smooth arc (turning circle about 1.4 units). A released or barely
 *   deflected stick keeps the runner going straight; a late frame only shifts an arc a little.
 * - The field edge never knocks anyone out: a runner that meets it slides along it (and around
 *   corners), at full speed.
 *
 * Rules:
 * - Outside your land you lay a trail: a polyline of your real path, sampled every half unit.
 * - Back home, the band around the trail plus everything your land then encloses becomes yours,
 *   opponents' land included (Field.capture on a fine raster).
 * - Out: someone's head touches your trail while you are out; your head runs onto your own trail
 *   (except the stretch right behind it and where it leaves your land); two heads meet and you are outside your land; or your
 *   whole land gets taken. Your land turns neutral; you come back after 3 s on free floor with a
 *   small round home, protected for 2 s.
 * - Biggest share of the floor when time runs out wins.
 *
 * Units: the raster has `arena.unit` cells per unit (U). One unit is roughly the old grid cell
 * (about 9–12 world px), so speeds and sizes read the same on every floor size.
 */
import {
  type Fruit,
  INPUT_OP,
  type Look,
  PAD_DOWN,
  PAD_LEFT,
  PAD_RIGHT,
  PAD_UP,
  type PlayerInfo,
  STICK_OP,
  unpackStick,
} from '@hoorah/protocol';
import { Field } from './field';
import { Trail, wrapAngle } from './trail';

export const MAX_SLOTS = 8;

export interface Tuning {
  countdownMs: number;
  respawnMs: number;
  /** Protection after a respawn: nobody else can knock you out. */
  protectMs: number;
  /** "Time's up" screen before the results. */
  overMs: number;
  /** The warning fires this long before the end. */
  warnMs: number;
  /** Fastest turn, radians per second. */
  turnRate: number;
  /** Radius of a fresh home (units). */
  homeRadius: number;
  /** Half-width of the trail band that becomes land (units). */
  band: number;
  /** A head this close to someone's trail cuts it (units). */
  hit: number;
  /** A head this close to its own trail is out (units): on the line itself, a little kinder. */
  selfHit: number;
  /** Two heads this close crash (units). */
  headHit: number;
  /** Own trail within this arc length behind the head never counts (units). */
  selfSkip: number;
  /** Nor does the first stretch, where the trail leaves the land (units): coming back right there is coming home. */
  startSkip: number;
  /** Trail point spacing (units). */
  sample: number;
  /** Stick deflection below this keeps the runner going straight. */
  deadzone: number;
  /** A deflected stick silent this long counts as released (its release frame got lost). */
  staleMs: number;
}

export const DEFAULT_TUNING: Tuning = {
  countdownMs: 3000,
  respawnMs: 3000,
  protectMs: 2000,
  overMs: 3600,
  warnMs: 10_000,
  turnRate: 5.6,
  homeRadius: 2.9,
  band: 0.45,
  hit: 0.8,
  selfHit: 0.5,
  headHit: 1.3,
  selfSkip: 1.6,
  startSkip: 0.6,
  sample: 0.5,
  deadzone: 0.28,
  staleMs: 1300,
};

export interface Arena {
  /** Raster size in cells (16:9). */
  cols: number;
  rows: number;
  /** Raster cells per unit. */
  unit: number;
  /** Units per second. */
  speed: number;
  /** Fixed logic step (ms). */
  stepMs: number;
}

/** A 16:9 floor that grows with the field: 80x45 units for two, 96x54 up to five, 112x63 up to eight. */
export function arenaFor(players: number): Arena {
  const k = players <= 2 ? 15 : players <= 5 ? 18 : 21;
  return {
    cols: 16 * k,
    rows: 9 * k,
    unit: 3,
    speed: k === 15 ? 7.6 : k === 18 ? 8 : 8.4,
    stepMs: 1000 / 60,
  };
}

/** Round length in minutes from `settings.rounds` (Kilat 2, Normal 3). */
export function parseMinutes(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(n)) return 3;
  return Math.min(10, Math.max(1, Math.round(n)));
}

export type OutCause = 'cut' | 'self' | 'crash' | 'wiped';

export interface RunnerStats {
  kills: number;
  outs: number;
  captures: number;
  /** Cells won in all captures. */
  captured: number;
  /** Cells won in the single biggest capture. */
  bestCapture: number;
  /** Most cells held at once. */
  peak: number;
  /** Longest trail brought home (units). */
  longestLoop: number;
}

/** Position and heading: what the movement model steps (a runner, or a brain's look-ahead). */
export interface Motion {
  x: number;
  y: number;
  /** Heading in radians (0 = right, +PI/2 = down). */
  angle: number;
}

export interface Runner extends Motion {
  readonly id: number;
  slot: number;
  /** Owner and trail value on the field: slot + 1. */
  v: number;
  name: string;
  fruit: Fruit;
  look: Look;
  color: string;
  connected: boolean;
  alive: boolean;
  /** Head and heading at the previous step, for drawing in between. */
  px: number;
  py: number;
  pangle: number;
  /** Where the stick points (radians), or null to keep going straight. */
  target: number | null;
  /** Clock time of the last stick frame. */
  stickAt: number;
  /** Points laid since leaving home; empty at home. */
  trail: Trail;
  respawnAt: number;
  protectUntil: number;
  spawnedAt: number;
  stats: RunnerStats;
}

export type MatchEvent =
  | { type: 'count'; value: number }
  | { type: 'go' }
  | { type: 'spawn'; id: number; cells: number[]; x: number; y: number; first: boolean }
  | {
      type: 'capture';
      id: number;
      cells: number[];
      dist: number[];
      /** Share of the field won, 0..1. */
      gained: number;
      /** Centre of the won area (cells). */
      x: number;
      y: number;
      /** Owners who lost cells (ids). */
      victims: number[];
      /** Length of the trail brought home (units). */
      loop: number;
    }
  | {
      type: 'out';
      id: number;
      by: number | null;
      cause: OutCause;
      /** Where the head was (cells). */
      x: number;
      y: number;
      cleared: number[];
      /** Trail points (flat x, y pairs, cells) for the shatter effect. */
      trail: number[];
    }
  | { type: 'leave'; id: number; cleared: number[] }
  | { type: 'warning' }
  | { type: 'second'; left: number }
  | { type: 'timeUp' }
  | { type: 'done' };

export type Phase = 'countdown' | 'play' | 'over' | 'done';

/** Something that steers a runner every step (computer players): a target angle or null. */
export interface Pilot {
  steer(match: WilayahMatch, me: Runner, t: number): number | null;
}

export interface Standing {
  runner: Runner;
  cells: number;
  rank: number;
}

export interface MatchOptions {
  players: readonly PlayerInfo[];
  minutes: number;
  /** Clock time the countdown starts. */
  now: number;
  rnd?: () => number;
  tuning?: Partial<Tuning>;
  /** Override the floor (tests). */
  arena?: Arena;
}

/** Tuning converted to field cells and per-step amounts. */
export interface Geometry {
  unit: number;
  /** Cells moved per step. */
  stepCells: number;
  /** Radians turned per step at most. */
  maxTurn: number;
  band: number;
  hit: number;
  selfHit: number;
  headHit: number;
  selfSkip: number;
  startSkip: number;
  /** Radius of the trail layer on the raster (own trail checks with a little margin). */
  mark: number;
  sample: number;
  home: number;
  /** Heads stay this far inside the field edge. */
  edge: number;
}

/** Starting spots as fractions of the field, by number of runners. The centre stays free for the countdown. */
const ANCHORS: readonly (readonly [number, number])[][] = [
  [],
  [[0.3, 0.5]],
  [
    [0.25, 0.5],
    [0.75, 0.5],
  ],
  [
    [0.2, 0.3],
    [0.8, 0.3],
    [0.5, 0.74],
  ],
  [
    [0.2, 0.27],
    [0.8, 0.27],
    [0.2, 0.73],
    [0.8, 0.73],
  ],
  [
    [0.15, 0.27],
    [0.5, 0.2],
    [0.85, 0.27],
    [0.3, 0.77],
    [0.7, 0.77],
  ],
  [
    [0.15, 0.27],
    [0.5, 0.27],
    [0.85, 0.27],
    [0.15, 0.73],
    [0.5, 0.73],
    [0.85, 0.73],
  ],
  [
    [0.12, 0.26],
    [0.37, 0.26],
    [0.63, 0.26],
    [0.88, 0.26],
    [0.25, 0.74],
    [0.5, 0.74],
    [0.75, 0.74],
  ],
  [
    [0.12, 0.27],
    [0.37, 0.27],
    [0.63, 0.27],
    [0.88, 0.27],
    [0.12, 0.73],
    [0.37, 0.73],
    [0.63, 0.73],
    [0.88, 0.73],
  ],
];

const MAX_CATCH_UP = 10;
/** Axis directions for the edge slide: right, down, left, up. */
const AX = [1, 0, -1, 0] as const;
const AY = [0, 1, 0, -1] as const;

/**
 * One step of the movement model, in place: turn toward `target` (or keep straight), move
 * `dist` cells, and slide along the field edge instead of leaving it. `v` (the mover's trail
 * value, 0 for none) steers a head-on edge hit away from its own trail.
 */
export function stepMotion(
  m: Motion,
  target: number | null,
  maxTurn: number,
  dist: number,
  field: Field,
  edge: number,
  v: number,
): void {
  if (target !== null) {
    const d = wrapAngle(target - m.angle);
    m.angle = wrapAngle(m.angle + Math.max(-maxTurn, Math.min(maxTurn, d)));
  }
  const vx = Math.cos(m.angle);
  const vy = Math.sin(m.angle);
  let nx = m.x + vx * dist;
  let ny = m.y + vy * dist;
  const hiX = field.cols - edge;
  const hiY = field.rows - edge;
  const hitL = nx < edge;
  const hitR = nx > hiX;
  const hitT = ny < edge;
  const hitB = ny > hiY;
  if (hitL || hitR || hitT || hitB) {
    let tx = hitL || hitR ? 0 : vx;
    let ty = hitT || hitB ? 0 : vy;
    const mag = Math.hypot(tx, ty);
    if (mag < 0.08) {
      // Square onto the edge (or into a corner): pick a way along it.
      let best = 0;
      let bestScore = Number.NEGATIVE_INFINITY;
      const gx = target === null ? 0 : Math.cos(target);
      const gy = target === null ? 0 : Math.sin(target);
      const span = Math.max(field.cols, field.rows);
      for (let k = 0; k < 4; k++) {
        const dx = AX[k]!;
        const dy = AY[k]!;
        if ((dx > 0 && hitR) || (dx < 0 && hitL) || (dy > 0 && hitB) || (dy < 0 && hitT)) continue;
        const room = dx > 0 ? field.cols - m.x : dx < 0 ? m.x : dy > 0 ? field.rows - m.y : m.y;
        let score = (dx * vx + dy * vy) * 1.5 + (dx * gx + dy * gy) * 2 + room / span;
        if (v > 0 && field.trailAt(m.x + dx * 3, m.y + dy * 3) === v) score -= 10;
        if (score > bestScore) {
          bestScore = score;
          best = k;
        }
      }
      tx = AX[best]!;
      ty = AY[best]!;
    } else {
      tx /= mag;
      ty /= mag;
    }
    m.angle = Math.atan2(ty, tx);
    // Along a wall the head hugs it; the other coordinate moves freely.
    nx = tx === 0 ? (hitL ? edge : hitR ? hiX : m.x) : clamp(m.x + tx * dist, edge, hiX);
    ny = ty === 0 ? (hitT ? edge : hitB ? hiY : m.y) : clamp(m.y + ty * dist, edge, hiY);
  }
  m.x = nx;
  m.y = ny;
}

export class WilayahMatch {
  readonly field: Field;
  readonly arena: Arena;
  readonly tuning: Tuning;
  readonly geo: Geometry;
  readonly durationMs: number;
  phase: Phase = 'countdown';
  /** Seconds shown by the countdown (3, 2, 1). */
  countValue: number;
  readonly goAt: number;
  readonly endAt: number;
  lastTickAt: number;
  private nextTickAt: number;
  private readonly runners: Runner[] = [];
  private readonly bySlot: (Runner | undefined)[] = [];
  private readonly byId = new Map<number, Runner>();
  /** Connected people who found no free slot. */
  readonly spectators = new Set<number>();
  private readonly pilots = new Map<number, Pilot>();
  private events: MatchEvent[] = [];
  private readonly rnd: () => number;
  private warned = false;
  private lastSecond = Number.POSITIVE_INFINITY;
  /** Per-step scratch (no allocation in the step). */
  private readonly moving: Runner[] = [];
  private readonly outBy: (Runner | null)[] = new Array(MAX_SLOTS).fill(null);
  private readonly outCause: (OutCause | null)[] = new Array(MAX_SLOTS).fill(null);
  private readonly near = new Uint8Array(MAX_SLOTS * MAX_SLOTS);
  ticks = 0;

  constructor(opts: MatchOptions) {
    this.tuning = { ...DEFAULT_TUNING, ...opts.tuning };
    this.rnd = opts.rnd ?? Math.random;
    const field = opts.players.filter((p) => p.connected).slice(0, MAX_SLOTS);
    this.arena = opts.arena ?? arenaFor(field.length);
    this.field = new Field(this.arena.cols, this.arena.rows, MAX_SLOTS);
    const u = this.arena.unit;
    const tu = this.tuning;
    this.geo = {
      unit: u,
      stepCells: (this.arena.speed * u * this.arena.stepMs) / 1000,
      maxTurn: (tu.turnRate * this.arena.stepMs) / 1000,
      band: tu.band * u,
      hit: tu.hit * u,
      selfHit: tu.selfHit * u,
      headHit: tu.headHit * u,
      selfSkip: tu.selfSkip * u,
      startSkip: tu.startSkip * u,
      mark: (tu.selfHit + 0.2) * u,
      sample: tu.sample * u,
      home: tu.homeRadius * u,
      edge: 0.5,
    };
    this.durationMs = Math.round(opts.minutes * 60_000);
    this.goAt = opts.now + tu.countdownMs;
    this.endAt = this.goAt + this.durationMs;
    this.lastTickAt = this.goAt;
    this.nextTickAt = this.goAt + this.arena.stepMs;
    this.countValue = Math.ceil(tu.countdownMs / 1000);

    const anchors = shuffle(ANCHORS[field.length] ?? [], this.rnd);
    field.forEach((p, slot) => {
      const r = this.addRunner(p, slot);
      const a = anchors[slot];
      if (a) this.spawnAt(r, a[0], a[1], opts.now, true);
      else this.spawn(r, opts.now, true);
    });
    for (const p of opts.players) {
      if (p.connected && !this.byId.has(p.id)) this.spectators.add(p.id);
    }
    this.events.push({ type: 'count', value: this.countValue });
  }

  /* ------------------------------------------------------------------ queries */

  all(): readonly Runner[] {
    return this.runners;
  }

  runner(id: number): Runner | undefined {
    return this.byId.get(id);
  }

  slotRunner(slot: number): Runner | undefined {
    return this.bySlot[slot];
  }

  cells(r: Runner): number {
    return this.field.counts[r.v] ?? 0;
  }

  /** Share of the field, 0..100. */
  percent(r: Runner): number {
    return (this.cells(r) * 100) / this.field.size;
  }

  isProtected(r: Runner, t: number): boolean {
    return r.alive && t < r.protectUntil;
  }

  /** True while the runner's head is on its own land. */
  isHome(r: Runner): boolean {
    return this.field.ownerAt(r.x, r.y) === r.v;
  }

  /** Ms left on the round clock. */
  timeLeft(t: number): number {
    if (this.phase === 'countdown') return this.durationMs;
    if (this.phase === 'play') return Math.max(0, this.endAt - t);
    return 0;
  }

  /** 0..1 progress of the current step, for drawing runners between steps. */
  alpha(t: number): number {
    if (this.phase !== 'play') return 1;
    return Math.min(1, Math.max(0, (t - this.lastTickAt) / this.arena.stepMs));
  }

  /** Best first; equal territory shares a rank (1, 1, 3). Knock-outs, then join order break display ties. */
  standings(): Standing[] {
    const rows = this.runners.map((runner) => ({ runner, cells: this.cells(runner) }));
    rows.sort(
      (a, b) =>
        b.cells - a.cells || b.runner.stats.kills - a.runner.stats.kills || a.runner.slot - b.runner.slot,
    );
    const out: Standing[] = [];
    rows.forEach((row, k) => {
      const prev = out[k - 1];
      out.push({ ...row, rank: prev && prev.cells === row.cells ? prev.rank : k + 1 });
    });
    return out;
  }

  rankOf(id: number): number {
    return this.standings().find((s) => s.runner.id === id)?.rank ?? 0;
  }

  drainEvents(): MatchEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /* ------------------------------------------------------------------ players */

  /** Feed the full player list (computer players included). New people get a free slot. */
  setPlayers(players: readonly PlayerInfo[], t: number): void {
    const present = new Set(players.map((p) => p.id));
    for (const r of [...this.runners]) if (!present.has(r.id)) this.removeRunner(r);
    for (const id of this.spectators) if (!present.has(id)) this.spectators.delete(id);
    for (const p of players) {
      const r = this.byId.get(p.id);
      if (r) {
        r.connected = p.connected;
        r.name = p.name;
        r.color = p.color;
        r.fruit = p.fruit;
        r.look = p.look;
        continue;
      }
      if (!p.connected || this.phase === 'over' || this.phase === 'done') continue;
      const slot = this.freeSlot();
      if (slot < 0) {
        this.spectators.add(p.id);
        continue;
      }
      this.spectators.delete(p.id);
      const nr = this.addRunner(p, slot);
      if (this.phase === 'countdown') this.spawn(nr, t, true);
      else {
        nr.alive = false;
        nr.respawnAt = t;
      }
    }
  }

  setPilot(id: number, pilot: Pilot | null): void {
    if (pilot) this.pilots.set(id, pilot);
    else this.pilots.delete(id);
  }

  hasPilot(id: number): boolean {
    return this.pilots.has(id);
  }

  private freeSlot(): number {
    for (let s = 0; s < MAX_SLOTS; s++) if (!this.bySlot[s]) return s;
    return -1;
  }

  private addRunner(p: PlayerInfo, slot: number): Runner {
    const r: Runner = {
      id: p.id,
      slot,
      v: slot + 1,
      name: p.name,
      fruit: p.fruit,
      look: p.look,
      color: p.color,
      connected: p.connected,
      alive: false,
      x: 0,
      y: 0,
      angle: 0,
      px: 0,
      py: 0,
      pangle: 0,
      target: null,
      stickAt: 0,
      trail: new Trail(),
      respawnAt: Number.POSITIVE_INFINITY,
      protectUntil: 0,
      spawnedAt: 0,
      stats: { kills: 0, outs: 0, captures: 0, captured: 0, bestCapture: 0, peak: 0, longestLoop: 0 },
    };
    this.runners.push(r);
    this.bySlot[slot] = r;
    this.byId.set(r.id, r);
    return r;
  }

  private removeRunner(r: Runner): void {
    const cleared = this.field.clearOwner(r.v);
    this.liftTrail(r);
    this.runners.splice(this.runners.indexOf(r), 1);
    this.bySlot[r.slot] = undefined;
    this.byId.delete(r.id);
    this.pilots.delete(r.id);
    this.events.push({ type: 'leave', id: r.id, cleared });
  }

  /* ------------------------------------------------------------------ input */

  /**
   * A phone frame. STICK_OP carries the joystick (a deflection below the dead zone means "keep
   * going straight"); an INPUT_OP frame with arrow bits counts as a stick pushed that way, without
   * arrows it is ignored (it may be another control). Returns true when it was applied.
   */
  input(id: number, op: number, buttons: number, t: number): boolean {
    const r = this.byId.get(id);
    if (!r) return false;
    let target: number | null;
    if (op === STICK_OP) {
      const s = unpackStick(buttons);
      target = Math.hypot(s.x, s.y) < this.tuning.deadzone ? null : Math.atan2(s.y, s.x);
    } else if (op === INPUT_OP) {
      const dx = (buttons & PAD_RIGHT ? 1 : 0) - (buttons & PAD_LEFT ? 1 : 0);
      const dy = (buttons & PAD_DOWN ? 1 : 0) - (buttons & PAD_UP ? 1 : 0);
      if (dx === 0 && dy === 0) return false;
      target = Math.atan2(dy, dx);
    } else return false;
    return this.steer(id, target, t);
  }

  /** Input that arrives while paused is dropped; the runner goes straight until the next frame. */
  absorb(id: number): void {
    const r = this.byId.get(id);
    if (r) r.target = null;
  }

  /** Point a runner's stick at time `t` (radians, or null for straight). During the countdown it aims at once. */
  steer(id: number, target: number | null, t: number): boolean {
    const r = this.byId.get(id);
    if (!r?.alive) return false;
    r.stickAt = t;
    if (this.phase === 'countdown') {
      r.target = target;
      if (target !== null) r.angle = r.pangle = wrapAngle(target);
      return true;
    }
    if (this.phase !== 'play') return false;
    r.target = target === null ? null : wrapAngle(target);
    return true;
  }

  /* ------------------------------------------------------------------ time */

  advance(t: number): void {
    if (this.phase === 'countdown') {
      const left = Math.ceil((this.goAt - t) / 1000);
      if (t >= this.goAt) {
        this.phase = 'play';
        this.countValue = 0;
        this.events.push({ type: 'go' });
      } else if (left !== this.countValue && left > 0) {
        this.countValue = left;
        this.events.push({ type: 'count', value: left });
      }
    }
    if (this.phase === 'play') {
      const step = this.arena.stepMs;
      let n = 0;
      while (t >= this.nextTickAt && this.nextTickAt <= this.endAt && n < MAX_CATCH_UP) {
        this.tick(this.nextTickAt);
        this.lastTickAt = this.nextTickAt;
        this.nextTickAt += step;
        n++;
      }
      // After a long stall (a frozen tab), skip ahead instead of fast-forwarding the world.
      if (t - this.nextTickAt > step * 2 && this.nextTickAt <= this.endAt) {
        this.lastTickAt = t;
        this.nextTickAt = t + step;
      }
      const left = this.endAt - t;
      if (!this.warned && left <= this.tuning.warnMs) {
        this.warned = true;
        this.events.push({ type: 'warning' });
      }
      const sec = Math.ceil(left / 1000);
      if (sec <= 5 && sec >= 1 && sec < this.lastSecond) {
        this.lastSecond = sec;
        this.events.push({ type: 'second', left: sec });
      }
      if (t >= this.endAt) {
        this.phase = 'over';
        for (const r of this.runners) r.target = null;
        this.events.push({ type: 'timeUp' });
      }
    }
    if (this.phase === 'over' && t >= this.endAt + this.tuning.overMs) {
      this.phase = 'done';
      this.events.push({ type: 'done' });
    }
  }

  /* ------------------------------------------------------------------ the step */

  private tick(t: number): void {
    const { field, geo } = this;
    this.ticks++;
    for (const r of this.runners) {
      if (!r.alive && r.respawnAt <= t) this.spawn(r, t, false);
    }
    const moving = this.moving;
    moving.length = 0;
    for (const r of this.runners) if (r.alive) moving.push(r);

    for (const r of moving) {
      const pilot = this.pilots.get(r.id);
      if (pilot) r.target = pilot.steer(this, r, t);
      else if (r.target !== null && t - r.stickAt > this.tuning.staleMs) r.target = null;
    }
    for (const r of moving) {
      r.px = r.x;
      r.py = r.y;
      r.pangle = r.angle;
      stepMotion(r, r.target, geo.maxTurn, geo.stepCells, field, geo.edge, r.v);
    }

    // Who is out after this move (decided on everyone's new position before anything changes).
    const n = moving.length;
    for (let s = 0; s < MAX_SLOTS; s++) {
      this.outBy[s] = null;
      this.outCause[s] = null;
    }
    this.near.fill(0);
    const head2 = geo.headHit * geo.headHit;
    for (let a = 0; a < n; a++) {
      const A = moving[a]!;
      for (let b = a + 1; b < n; b++) {
        const B = moving[b]!;
        const dx = A.x - B.x;
        const dy = A.y - B.y;
        if (dx * dx + dy * dy > head2) continue;
        this.near[A.slot * MAX_SLOTS + B.slot] = 1;
        this.near[B.slot * MAX_SLOTS + A.slot] = 1;
        if (!this.isHome(A)) this.knock(A, B, 'crash', t);
        if (!this.isHome(B)) this.knock(B, A, 'crash', t);
      }
    }
    for (const A of moving) {
      for (const B of moving) {
        if (B === A || B.trail.len === 0 || this.near[A.slot * MAX_SLOTS + B.slot] === 1) continue;
        if (B.trail.hits(A.x, A.y, B.x, B.y, geo.hit, 0)) this.knock(B, A, 'cut', t);
      }
      if (A.trail.len > 0 && A.trail.hits(A.x, A.y, A.x, A.y, geo.selfHit, geo.selfSkip, geo.startSkip)) {
        this.knock(A, null, 'self', t);
      }
    }
    for (const r of moving) {
      const cause = this.outCause[r.slot];
      if (cause) this.knockOut(r, this.outBy[r.slot] ?? null, cause, t);
    }

    for (const r of moving) {
      if (!r.alive) continue;
      const tr = r.trail;
      if (this.isHome(r)) {
        if (tr.len > 0) this.capture(r, t);
        continue;
      }
      if (tr.len === 0) tr.push(r.px, r.py);
      const lx = tr.lastX();
      const ly = tr.lastY();
      if (Math.hypot(r.x - lx, r.y - ly) >= geo.sample) {
        tr.push(r.x, r.y);
        field.paintTrail(lx, ly, r.x, r.y, geo.mark, r.v, tr.ss[tr.len - 1]!);
      }
    }
    for (const r of this.runners) {
      const c = this.cells(r);
      if (c > r.stats.peak) r.stats.peak = c;
    }
  }

  private knock(victim: Runner, by: Runner | null, cause: OutCause, t: number): void {
    if (this.outCause[victim.slot]) return;
    if (by !== null && this.isProtected(victim, t)) return;
    this.outCause[victim.slot] = cause;
    this.outBy[victim.slot] = by;
  }

  private capture(r: Runner, t: number): void {
    const { field, geo } = this;
    const tr = r.trail;
    const loop = tr.arcTo(r.x, r.y);
    field.clearTrail(r.v, tr.xs, tr.ys, tr.len, geo.mark);
    const cap = field.capture(r.v, tr.xs, tr.ys, tr.len, r.x, r.y, geo.band);
    tr.clear();
    const n = cap.cells.length;
    r.stats.captures++;
    r.stats.captured += n;
    if (n > r.stats.bestCapture) r.stats.bestCapture = n;
    const units = Math.round(loop / geo.unit);
    if (units > r.stats.longestLoop) r.stats.longestLoop = units;
    let sx = 0;
    let sy = 0;
    for (const i of cap.cells) {
      sx += field.xOf(i) + 0.5;
      sy += field.yOf(i) + 0.5;
    }
    const victims: number[] = [];
    for (const v of cap.stolen.keys()) {
      const q = this.bySlot[v - 1];
      if (q) victims.push(q.id);
    }
    this.events.push({
      type: 'capture',
      id: r.id,
      cells: cap.cells,
      dist: cap.dist,
      gained: n / field.size,
      x: n ? sx / n : r.x,
      y: n ? sy / n : r.y,
      victims,
      loop: loop / geo.unit,
    });
    for (const v of cap.stolen.keys()) {
      const q = this.bySlot[v - 1];
      if (q?.alive && field.counts[v] === 0) this.knockOut(q, r, 'wiped', t);
    }
  }

  /** Lift a runner's trail from the raster and forget it. */
  private liftTrail(r: Runner): void {
    const tr = r.trail;
    this.field.clearTrail(r.v, tr.xs, tr.ys, tr.len, this.geo.mark);
    tr.clear();
  }

  private knockOut(r: Runner, by: Runner | null, cause: OutCause, t: number): void {
    if (!r.alive) return;
    const cleared = this.field.clearOwner(r.v);
    const stride = Math.max(1, Math.floor(r.trail.len / 40));
    const trail = r.trail.toArray(stride);
    this.liftTrail(r);
    r.target = null;
    r.alive = false;
    r.respawnAt = t + this.tuning.respawnMs;
    r.stats.outs++;
    if (by && by !== r) by.stats.kills++;
    this.events.push({
      type: 'out',
      id: r.id,
      by: by && by !== r ? by.id : null,
      cause,
      x: r.x,
      y: r.y,
      cleared,
      trail,
    });
  }

  /* ------------------------------------------------------------------ spawning */

  private spawnAt(r: Runner, fx: number, fy: number, t: number, first: boolean): void {
    const R = this.geo.home;
    const cx = clamp(fx * this.field.cols, R + 1, this.field.cols - R - 1);
    const cy = clamp(fy * this.field.rows, R + 1, this.field.rows - R - 1);
    this.place(r, cx, cy, t, first);
  }

  private spawn(r: Runner, t: number, first: boolean): void {
    const [cx, cy] = this.findSpawn();
    this.place(r, cx, cy, t, first);
  }

  /** The emptiest round spot of free floor, far from everyone's head and trail. */
  private findSpawn(): [number, number] {
    const { field, geo } = this;
    const R = geo.home;
    const outer = R + geo.unit;
    const lo = R + 2;
    let best: [number, number] = [field.cols / 2, field.rows / 2];
    let bestScore = Number.NEGATIVE_INFINITY;
    const heads = this.runners.filter((r) => r.alive);
    for (let k = 0; k < 90; k++) {
      const cx = lo + this.rnd() * (field.cols - lo * 2);
      const cy = lo + this.rnd() * (field.rows - lo * 2);
      let score = 0;
      const x0 = Math.max(0, Math.floor(cx - outer));
      const x1 = Math.min(field.cols - 1, Math.ceil(cx + outer));
      const y0 = Math.max(0, Math.floor(cy - outer));
      const y1 = Math.min(field.rows - 1, Math.ceil(cy + outer));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const d2 = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2;
          if (d2 > outer * outer) continue;
          const core = d2 <= R * R;
          const i = field.index(x, y);
          if (field.trail[i] !== 0) score -= core ? 600 : 5;
          if (field.owner[i] !== 0) score -= core ? 3 : 0.5;
        }
      }
      let near = 40;
      for (const h of heads) {
        const d = Math.hypot(h.x - cx, h.y - cy) / geo.unit;
        if (d < R / geo.unit + 2) score -= 5000;
        near = Math.min(near, d);
        const tr = h.trail;
        if (tr.len > 0) near = Math.min(near, Math.sqrt(tr.nearest2(cx, cy, 4)) / geo.unit + 2);
      }
      score += near * 2;
      if (score > bestScore) {
        bestScore = score;
        best = [cx, cy];
      }
    }
    return best;
  }

  private place(r: Runner, x: number, y: number, t: number, first: boolean): void {
    const field = this.field;
    // Centred on a cell centre, every fresh home covers exactly the same number of cells.
    const cx = Math.floor(x) + 0.5;
    const cy = Math.floor(y) + 0.5;
    const cells = field.fillDisc(cx, cy, this.geo.home, r.v);
    r.alive = true;
    r.x = r.px = cx;
    r.y = r.py = cy;
    const dx = field.cols / 2 - cx;
    const dy = field.rows / 2 - cy;
    r.angle = r.pangle = dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx);
    r.target = null;
    r.trail.clear();
    r.respawnAt = Number.POSITIVE_INFINITY;
    r.protectUntil = first ? 0 : t + this.tuning.protectMs;
    r.spawnedAt = t;
    this.events.push({ type: 'spawn', id: r.id, cells, x: cx, y: cy, first });
    // A home dropped onto someone's last cells must not leave them stranded with nothing.
    for (const q of this.runners) {
      if (q !== r && q.alive && this.cells(q) === 0) this.knockOut(q, null, 'wiped', t);
    }
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function shuffle<T>(list: readonly T[], rnd: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
