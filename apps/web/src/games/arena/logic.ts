/**
 * Ular Arena rules: snakes, seeds (pellets), collisions, knock-outs, respawns and the round
 * clock. Pure and deterministic: no DOM, no Phaser, no wall clock. The driver feeds frame deltas
 * of game time (frozen while paused) through `update(dt)`; randomness comes from the injected
 * generator, so tests replay exactly.
 *
 * World units: the arena is `width` x `height` units with rounded corners. A fresh snake is 11
 * units thick (radius) and moves 150 units per second. The arena grows with the number of snakes
 * so two players never feel lost and eight are never cramped. Bodies are a trail of points spaced
 * `spacing` apart; one unit of length is one trail point, so "Panjang 42" is 42 points of body.
 */
import type { Fruit, PlayerInfo } from '@hoorah/protocol';

export type Phase = 'intro' | 'countdown' | 'play' | 'over' | 'podium' | 'done';
export type KoCause = 'body' | 'head' | 'wall';

export interface Tuning {
  /** Arena shown with the snakes before the countdown. */
  introMs: number;
  /** Length of each countdown number (3, 2, 1). */
  countMs: number;
  /** "Waktu habis" freeze before the podium. */
  overMs: number;
  podiumMs: number;
  /** "10 detik lagi" warning. */
  warnMs: number;
  /** Largest simulation step; frames are split into steps no longer than this. */
  stepMs: number;
  /** Frame deltas above this are clipped (a stalled tab must not teleport snakes). */
  maxFrameMs: number;
  baseLen: number;
  /** Boost is refused at or below this length. */
  minBoostLen: number;
  maxLen: number;
  /** World units between two trail points (one unit of length). */
  spacing: number;
  /** Body radius of a fresh snake; grows by `radiusGrow` until `radiusFullLen`. */
  radius: number;
  radiusGrow: number;
  radiusFullLen: number;
  /** Units per second. */
  speed: number;
  boostSpeed: number;
  /** Radians per second. */
  turnRate: number;
  boostTurnRate: number;
  /** How fast the drawn body catches up with the length (units of length per second). */
  growRate: number;
  shrinkRate: number;
  /** Boosting sheds one unit of length (as a seed) this often. */
  shedMs: number;
  respawnMs: number;
  protectMs: number;
  /** A player joining mid-round enters after this delay. */
  joinDelayMs: number;
  /** Arena area per snake (plus `areaExtra` snakes of breathing room). */
  unitArea: number;
  areaExtra: number;
  corner: number;
  /** Arena area per ambient seed. */
  pelletArea: number;
  maxPellets: number;
  /** Ambient seeds regrowing per second per million square units, while below the target. */
  regrowRate: number;
  /** Seeds from knock-outs and boosting fade after this long. */
  dropLifeMs: number;
  /** Extra reach of a head's pull on nearby seeds. */
  magnet: number;
  magnetSpeed: number;
  /** Share of a knocked-out snake's length that bursts into seeds. */
  burstShare: number;
  /** Length gained per unit of food in a seed (seeds carry whole units). */
  foodLen: number;
  /** Minimum gap between two "new leader" calls. */
  leadGapMs: number;
}

export const DEFAULT_TUNING: Tuning = {
  introMs: 1600,
  countMs: 1000,
  overMs: 2600,
  podiumMs: 5600,
  warnMs: 10_000,
  stepMs: 1000 / 60,
  maxFrameMs: 100,
  baseLen: 20,
  minBoostLen: 12,
  maxLen: 3000,
  spacing: 8,
  radius: 11,
  radiusGrow: 6,
  radiusFullLen: 320,
  speed: 150,
  boostSpeed: 270,
  turnRate: 3.5,
  boostTurnRate: 3.1,
  growRate: 26,
  shrinkRate: 40,
  shedMs: 150,
  respawnMs: 3000,
  protectMs: 2000,
  joinDelayMs: 800,
  unitArea: 103_680,
  areaExtra: 2.8,
  corner: 64,
  pelletArea: 4600,
  maxPellets: 1100,
  regrowRate: 10,
  dropLifeMs: 30_000,
  magnet: 18,
  magnetSpeed: 320,
  burstShare: 0.6,
  foodLen: 0.4,
  leadGapMs: 4000,
};

/** Trail ring buffer size per snake (power of two). */
export const TRAIL_CAP = 4096;
const TRAIL_MASK = TRAIL_CAP - 1;
/** Seats on the field (bitmask friendly). */
export const MAX_SNAKES = 16;
export const MIN_ASPECT = 1;
export const MAX_ASPECT = 1.9;
/** A joystick pushed less than this far (0..1) counts as centred: the snake keeps its heading. */
export const STICK_DEADZONE = 0.12;
/** A target this close to straight behind keeps the way the head was already turning. */
const BEHIND = Math.PI - 0.08;

/** Ambient seed colours: warm night-garden glows (no violet). */
export const SEED_COLORS: readonly number[] = [0xffd84d, 0xff9a3d, 0x7be495, 0x5cd6ff, 0xff6f7d, 0xfff1c9];

export const PELLET_FREE = 0;
export const PELLET_AMBIENT = 1;
/** Burst from a knocked-out snake. */
export const PELLET_DROP = 2;
/** Shed while boosting. */
export const PELLET_SHED = 3;

export type ArenaEvent =
  | { type: 'phase'; phase: Phase }
  | { type: 'count'; value: number }
  | { type: 'go' }
  | { type: 'spawn'; id: number; x: number; y: number; first: boolean }
  | { type: 'eat'; id: number; x: number; y: number; value: number; color: number }
  | { type: 'boost'; id: number; on: boolean }
  | { type: 'ko'; id: number; by: number | null; cause: KoCause; x: number; y: number; len: number }
  | { type: 'removed'; id: number }
  | { type: 'lead'; id: number }
  | { type: 'warning' }
  | { type: 'tick'; left: number }
  | { type: 'timeUp' };

/** Round length in minutes from the catalog mode (`settings.rounds`): 1–5, default 3. */
export function parseRounds(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 ? Math.min(5, Math.floor(n)) : 3;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function wrapAngle(a: number): number {
  const TAU = Math.PI * 2;
  let r = a % TAU;
  if (r > Math.PI) r -= TAU;
  else if (r < -Math.PI) r += TAU;
  return r;
}

/** Arena size in world units for `n` snakes at the given width/height ratio. */
export function arenaSize(n: number, aspect: number, t: Tuning = DEFAULT_TUNING): { w: number; h: number } {
  const a = clamp(Number.isFinite(aspect) ? aspect : 1.5, MIN_ASPECT, MAX_ASPECT);
  const area = t.unitArea * (Math.max(2, n) + t.areaExtra);
  const w = Math.sqrt(area * a);
  return { w: Math.round(w), h: Math.round(w / a) };
}

/** Is (x, y) inside the rounded arena [0,w]x[0,h] shrunk by `margin`? */
export function insideArena(
  x: number,
  y: number,
  w: number,
  h: number,
  corner: number,
  margin: number,
): boolean {
  const hx = w / 2;
  const hy = h / 2;
  const ax = Math.abs(x - hx);
  const ay = Math.abs(y - hy);
  if (ax > hx - margin || ay > hy - margin) return false;
  const cx = ax - (hx - corner);
  const cy = ay - (hy - corner);
  if (cx > 0 && cy > 0) {
    const r = Math.max(0, corner - margin);
    return cx * cx + cy * cy <= r * r;
  }
  return true;
}

export function colorNumber(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  return m ? Number.parseInt(m[1]!, 16) : 0xc4c7cc;
}

export class Snake {
  readonly trailX = new Float32Array(TRAIL_CAP);
  readonly trailY = new Float32Array(TRAIL_CAP);
  trailHead = 0;
  trailCount = 0;
  /** Distance from the head to the newest trail point (0 ≤ gap < spacing). */
  gap = 0;
  x = 0;
  y = 0;
  angle = 0;
  /** Input: -1 left, 0 straight, 1 right (computer snakes); boost button held. */
  turn = 0;
  /** Input: heading the joystick points at (radians), NaN = none. Overrides `turn`. */
  aim = Number.NaN;
  wantBoost = false;
  /** How hard the head turned on the last step, -1..1 (drives the head's lean). */
  steer = 0;
  boosting = false;
  len = 0;
  /** Drawn length; eases toward `len`. */
  bodyLen = 0;
  radius = DEFAULT_TUNING.radius;
  alive = false;
  /** Has a seat on the field this round (spawned, or waiting for the first spawn). */
  inMatch = false;
  connected = true;
  /** No longer in the room's player list. */
  gone = false;
  respawnAt = Number.POSITIVE_INFINITY;
  protectUntil = 0;
  spawnedAt = 0;
  diedAt = 0;
  lastKiller: number | null = null;
  lastCause: KoCause | null = null;
  shedAcc = 0;
  colorNum: number;
  /* stats over the whole round */
  eaten = 0;
  kos = 0;
  deaths = 0;
  best = 0;
  boostMs = 0;
  longestLife = 0;
  /* collision scratch */
  marked = false;
  markBy: Snake | null = null;
  markCause: KoCause = 'wall';
  minX = 0;
  minY = 0;
  maxX = 0;
  maxY = 0;

  constructor(
    readonly id: number,
    public name: string,
    public fruit: Fruit,
    public color: string,
    readonly joinIndex: number,
  ) {
    this.colorNum = colorNumber(color);
  }

  /** Trail point j (0 = newest). */
  px(j: number): number {
    return this.trailX[(this.trailHead - j) & TRAIL_MASK]!;
  }

  py(j: number): number {
    return this.trailY[(this.trailHead - j) & TRAIL_MASK]!;
  }

  /** Trail points that make up the body right now (index 0..n). */
  bodyPoints(): number {
    return Math.max(0, Math.min(Math.floor(this.bodyLen), this.trailCount - 1));
  }
}

/** Struct-of-arrays seed pool; slots are reused, `gen` changes whenever a slot is refilled. */
export class Pellets {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly r: Float32Array;
  readonly value: Uint8Array;
  readonly kind: Uint8Array;
  readonly color: Uint32Array;
  readonly born: Float64Array;
  readonly expires: Float64Array;
  readonly gen: Uint32Array;
  private readonly free: Int32Array;
  private freeTop = 0;
  /** One past the highest slot ever used: loops stop here. */
  span = 0;
  active = 0;
  ambient = 0;

  constructor(readonly cap: number) {
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.r = new Float32Array(cap);
    this.value = new Uint8Array(cap);
    this.kind = new Uint8Array(cap);
    this.color = new Uint32Array(cap);
    this.born = new Float64Array(cap);
    this.expires = new Float64Array(cap);
    this.gen = new Uint32Array(cap);
    this.free = new Int32Array(cap);
    this.clear();
  }

  clear(): void {
    for (let i = 0; i < this.cap; i++) {
      this.free[i] = this.cap - 1 - i;
      this.kind[i] = PELLET_FREE;
    }
    this.freeTop = this.cap;
    this.span = 0;
    this.active = 0;
    this.ambient = 0;
  }

  /** Seed radius for a value: bigger seeds are worth more. */
  static radiusOf(value: number): number {
    return 3.6 + 2.5 * Math.sqrt(value);
  }

  add(kind: number, x: number, y: number, value: number, color: number, now: number, life: number): number {
    if (this.freeTop === 0) return -1;
    const i = this.free[--this.freeTop]!;
    this.x[i] = x;
    this.y[i] = y;
    this.value[i] = value;
    this.r[i] = Pellets.radiusOf(value);
    this.kind[i] = kind;
    this.color[i] = color;
    this.born[i] = now;
    this.expires[i] = life > 0 ? now + life : Number.POSITIVE_INFINITY;
    this.gen[i] = (this.gen[i]! + 1) >>> 0;
    if (i >= this.span) this.span = i + 1;
    this.active++;
    if (kind === PELLET_AMBIENT) this.ambient++;
    return i;
  }

  remove(i: number): void {
    const k = this.kind[i];
    if (k === PELLET_FREE || k === undefined) return;
    if (k === PELLET_AMBIENT) this.ambient--;
    this.kind[i] = PELLET_FREE;
    this.active--;
    this.free[this.freeTop++] = i;
  }
}

export interface Standing {
  snake: Snake;
  /** Shown length at the final whistle (0 when knocked out at that moment). */
  final: number;
  /** Shown longest length over the round. */
  best: number;
  rank: number;
}

export interface MatchOptions {
  /** Round length in ms. */
  roundMs: number;
  /** Width / height of the arena (from the main screen's shape), clamped to 1–1.9. */
  aspect: number;
  rnd?: () => number;
  tuning?: Partial<Tuning>;
}

interface Point {
  x: number;
  y: number;
}

export class ArenaMatch {
  readonly tuning: Tuning;
  readonly roundMs: number;
  readonly aspect: number;
  readonly pellets: Pellets;
  phase: Phase = 'intro';
  /** Simulated game time in ms. */
  now = 0;
  playStart = 0;
  countValue = 3;
  leaderId: number | null = null;
  width = 0;
  height = 0;
  corner = 0;
  private phaseAt = 0;
  private readonly list: Snake[] = [];
  private readonly byId = new Map<number, Snake>();
  private events: ArenaEvent[] = [];
  private readonly rnd: () => number;
  private joins = 0;
  private spawnAcc = 0;
  private warned = false;
  private lastTick = 0;
  private lastLeadAt = Number.NEGATIVE_INFINITY;
  private fieldSize = 0;
  /** Field size the starting ring was laid out for. */
  private placed = -1;
  /* scratch, reused every step */
  private readonly live: Snake[] = [];
  private readonly marked: Snake[] = [];
  private readonly heads: Snake[] = [];
  private readonly pt: Point = { x: 0, y: 0 };

  constructor(opts: MatchOptions) {
    this.tuning = { ...DEFAULT_TUNING, ...opts.tuning };
    this.roundMs = Math.max(10_000, opts.roundMs);
    this.aspect = clamp(Number.isFinite(opts.aspect) ? opts.aspect : 1.5, MIN_ASPECT, MAX_ASPECT);
    this.rnd = opts.rnd ?? Math.random;
    this.pellets = new Pellets(this.tuning.maxPellets);
    this.resize(2);
  }

  /* ------------------------------------------------------------------ queries */

  /** Every snake ever seated (including gone ones). Do not mutate. */
  get all(): readonly Snake[] {
    return this.list;
  }

  snake(id: number): Snake | undefined {
    return this.byId.get(id);
  }

  /** Snakes taking part in this round (alive or waiting to respawn). */
  field(): Snake[] {
    return this.list.filter((s) => s.inMatch && !s.gone);
  }

  isProtected(s: Snake): boolean {
    return s.alive && this.now < s.protectUntil;
  }

  timeLeft(): number {
    if (this.phase === 'intro' || this.phase === 'countdown') return this.roundMs;
    if (this.phase === 'play') return Math.max(0, this.roundMs - (this.now - this.playStart));
    return 0;
  }

  /** Ms until a knocked-out snake comes back, 0 when alive or not scheduled. */
  respawnLeft(s: Snake): number {
    if (s.alive || !Number.isFinite(s.respawnAt) || this.phase !== 'play') return 0;
    return Math.max(0, s.respawnAt - this.now);
  }

  /** Length as players see it: one point per unit of food, so every seed counts (a fresh snake shows 50). */
  shown(len: number): number {
    return Math.round(len / this.tuning.foodLen);
  }

  ambientTarget(): number {
    return Math.min(
      this.tuning.maxPellets - 200,
      Math.round((this.width * this.height) / this.tuning.pelletArea),
    );
  }

  /** Live order: longest first (knocked out = 0), then knock-outs, then join order. */
  order(): Snake[] {
    return this.field().sort(
      (a, b) => (b.alive ? b.len : 0) - (a.alive ? a.len : 0) || b.kos - a.kos || a.joinIndex - b.joinIndex,
    );
  }

  /** Final standings: length at the whistle, then knock-outs; ties on both share a rank. */
  standings(): Standing[] {
    const rows = this.field().map((s) => ({
      snake: s,
      final: s.alive ? this.shown(s.len) : 0,
      best: this.shown(s.best),
      rank: 0,
    }));
    rows.sort(
      (a, b) =>
        b.final - a.final ||
        b.snake.kos - a.snake.kos ||
        b.snake.best - a.snake.best ||
        a.snake.joinIndex - b.snake.joinIndex,
    );
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      const prev = rows[i - 1];
      r.rank = prev && prev.final === r.final && prev.snake.kos === r.snake.kos ? prev.rank : i + 1;
    }
    return rows;
  }

  /** Point on a snake's body at arc distance `d` from the head. */
  pointAt(s: Snake, d: number, out: Point): Point {
    const D = this.tuning.spacing;
    if (s.trailCount === 0) {
      out.x = s.x;
      out.y = s.y;
      return out;
    }
    if (d <= s.gap) {
      const f = s.gap > 0 ? d / s.gap : 0;
      out.x = s.x + (s.px(0) - s.x) * f;
      out.y = s.y + (s.py(0) - s.y) * f;
      return out;
    }
    const u = (d - s.gap) / D;
    const j = Math.floor(u);
    const last = s.trailCount - 1;
    if (j >= last) {
      out.x = s.px(last);
      out.y = s.py(last);
      return out;
    }
    const f = u - j;
    const ax = s.px(j);
    const ay = s.py(j);
    out.x = ax + (s.px(j + 1) - ax) * f;
    out.y = ay + (s.py(j + 1) - ay) * f;
    return out;
  }

  /**
   * Body samples for drawing, head first: x, y pairs every `step` units of length plus the exact
   * tail end. Returns the number of samples written (0 when the snake is not on the field).
   */
  sampleBody(s: Snake, step: number, out: Float32Array): number {
    if (!s.alive) return 0;
    const D = this.tuning.spacing;
    const maxSamples = out.length >> 1;
    const tail = Math.min(s.bodyLen, s.trailCount - 1 + s.gap / D);
    out[0] = s.x;
    out[1] = s.y;
    let c = 1;
    const p = this.pt;
    for (let k = step; k < tail && c < maxSamples - 1; k += step) {
      this.pointAt(s, k * D, p);
      out[c * 2] = p.x;
      out[c * 2 + 1] = p.y;
      c++;
    }
    if (tail > 0 && c < maxSamples) {
      this.pointAt(s, tail * D, p);
      out[c * 2] = p.x;
      out[c * 2 + 1] = p.y;
      c++;
    }
    return c;
  }

  drainEvents(): ArenaEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /* ------------------------------------------------------------------ players and input */

  /** Sync with the room (plus computer players). New ids get a seat, missing ids leave. */
  setPlayers(players: readonly PlayerInfo[]): void {
    const seen = new Set<number>();
    for (const p of players) {
      seen.add(p.id);
      let s = this.byId.get(p.id);
      if (!s) {
        if (this.list.length >= MAX_SNAKES) continue;
        s = new Snake(p.id, p.name, p.fruit, p.color, this.joins++);
        this.list.push(s);
        this.byId.set(p.id, s);
        s.connected = p.connected;
        this.enter(s);
      } else if (s.gone) {
        s.gone = false;
        this.enter(s);
      }
      s.name = p.name;
      s.fruit = p.fruit;
      if (s.color !== p.color) {
        s.color = p.color;
        s.colorNum = colorNumber(p.color);
      }
      s.connected = p.connected;
    }
    for (const s of this.list) if (!seen.has(s.id) && !s.gone) this.leave(s);
    if (this.phase === 'intro') this.fitField();
  }

  /** Held turn (computer snakes): -1 left, 0 straight, 1 right. */
  setInput(id: number, turn: number, boost: boolean): void {
    const s = this.byId.get(id);
    if (!s) return;
    s.turn = turn < 0 ? -1 : turn > 0 ? 1 : 0;
    s.aim = Number.NaN;
    s.wantBoost = boost;
  }

  /**
   * Joystick steering (x, y in -1..1, +y down): the head turns toward where the stick points at
   * the normal turn rate, so it draws a smooth arc. A centred stick keeps the current heading.
   */
  setStick(id: number, x: number, y: number, boost: boolean): void {
    const s = this.byId.get(id);
    if (!s) return;
    const fx = Number.isFinite(x) ? x : 0;
    const fy = Number.isFinite(y) ? y : 0;
    s.turn = 0;
    s.aim = Math.hypot(fx, fy) >= STICK_DEADZONE ? Math.atan2(fy, fx) : Number.NaN;
    s.wantBoost = boost;
  }

  private clearInput(s: Snake): void {
    s.turn = 0;
    s.aim = Number.NaN;
    s.wantBoost = false;
  }

  private enter(s: Snake): void {
    const t = this.tuning;
    switch (this.phase) {
      case 'intro':
        s.inMatch = true;
        return;
      case 'countdown': {
        s.inMatch = true;
        const at = this.pickSpawn(s);
        this.spawnCoiled(s, at.x, at.y, at.angle);
        this.emit({ type: 'spawn', id: s.id, x: s.x, y: s.y, first: true });
        return;
      }
      case 'play':
        s.inMatch = true;
        s.alive = false;
        s.respawnAt = this.now + t.joinDelayMs;
        return;
      default:
        // Round over: watch only.
        return;
    }
  }

  private leave(s: Snake): void {
    s.gone = true;
    this.clearInput(s);
    if (s.alive) {
      this.burst(s);
      s.alive = false;
      s.boosting = false;
      s.longestLife = Math.max(s.longestLife, this.now - s.spawnedAt);
      this.emit({ type: 'removed', id: s.id });
    }
    s.respawnAt = Number.POSITIVE_INFINITY;
    if (this.leaderId === s.id) this.leaderId = null;
  }

  /* ------------------------------------------------------------------ arena */

  private resize(n: number): void {
    const { w, h } = arenaSize(n, this.aspect, this.tuning);
    this.width = w;
    this.height = h;
    this.corner = Math.min(this.tuning.corner, Math.min(w, h) * 0.2);
    this.fieldSize = n;
  }

  /** Before the countdown the arena follows the field size; seeds are re-laid when it changes. */
  private fitField(): void {
    const n = this.field().length;
    if (n !== this.fieldSize || this.pellets.active === 0) {
      if (n !== this.fieldSize) this.resize(n);
      this.pellets.clear();
      const target = this.ambientTarget();
      for (let i = 0; i < target; i++) this.spawnAmbient();
    }
    // The snakes wait on their starting ring from the intro on.
    if (n !== this.placed) {
      this.placed = n;
      this.placeField();
    }
  }

  /* ------------------------------------------------------------------ time */

  update(dtMs: number): void {
    let left = Math.min(Math.max(0, dtMs), this.tuning.maxFrameMs);
    while (left > 1e-6) {
      const dt = Math.min(this.tuning.stepMs, left);
      left -= dt;
      this.now += dt;
      this.step(dt);
    }
  }

  private step(dt: number): void {
    const t = this.tuning;
    switch (this.phase) {
      case 'intro':
        if (this.now - this.phaseAt >= t.introMs) this.startCountdown();
        return;
      case 'countdown': {
        const v = 3 - Math.floor((this.now - this.phaseAt) / t.countMs);
        if (v <= 0) this.startPlay();
        else if (v !== this.countValue) {
          this.countValue = v;
          this.emit({ type: 'count', value: v });
        }
        return;
      }
      case 'play':
        this.simulate(dt);
        if (this.now - this.playStart >= this.roundMs) this.endRound();
        return;
      case 'over':
        if (this.now - this.phaseAt >= t.overMs) this.setPhase('podium');
        return;
      case 'podium':
        if (this.now - this.phaseAt >= t.podiumMs) this.setPhase('done');
        return;
      case 'done':
        return;
    }
  }

  private setPhase(p: Phase): void {
    this.phase = p;
    this.phaseAt = this.now;
    this.emit({ type: 'phase', phase: p });
  }

  private startCountdown(): void {
    this.fitField();
    this.setPhase('countdown');
    this.countValue = 3;
    this.emit({ type: 'count', value: 3 });
  }

  private startPlay(): void {
    this.setPhase('play');
    this.playStart = this.now;
    this.lastTick = 0;
    this.warned = false;
    this.emit({ type: 'go' });
  }

  private endRound(): void {
    for (const s of this.list) {
      if (s.alive) s.longestLife = Math.max(s.longestLife, this.now - s.spawnedAt);
      s.boosting = false;
      this.clearInput(s);
      s.respawnAt = Number.POSITIVE_INFINITY;
    }
    this.setPhase('over');
    this.emit({ type: 'timeUp' });
  }

  private emit(e: ArenaEvent): void {
    this.events.push(e);
  }

  /* ------------------------------------------------------------------ spawning */

  /** Starting ring: evenly around an ellipse, all circling the same way, tilted slightly inward. */
  private placeField(): void {
    const field = this.field();
    const n = field.length;
    const cx = this.width / 2;
    const cy = this.height / 2;
    const rx = this.width * 0.3;
    const ry = this.height * 0.3;
    const offset = this.rnd() * Math.PI * 2;
    field.forEach((s, k) => {
      const th = offset + (Math.PI * 2 * k) / Math.max(1, n);
      const x = cx + Math.cos(th) * rx;
      const y = cy + Math.sin(th) * ry;
      // Tangent of the ellipse at th (direction of increasing th), then a little inward.
      const tangent = Math.atan2(Math.cos(th) * ry, -Math.sin(th) * rx);
      this.spawnStraight(s, x, y, wrapAngle(tangent + 0.3));
      s.protectUntil = 0;
      this.emit({ type: 'spawn', id: s.id, x: s.x, y: s.y, first: true });
    });
  }

  /** The clearest of a handful of random spots, facing roughly toward the middle. */
  pickSpawn(self: Snake): { x: number; y: number; angle: number } {
    const W = this.width;
    const H = this.height;
    const m = Math.min(150, Math.min(W, H) * 0.22);
    let bx = W / 2;
    let by = H / 2;
    let best = Number.NEGATIVE_INFINITY;
    for (let c = 0; c < 24; c++) {
      const x = m + this.rnd() * (W - 2 * m);
      const y = m + this.rnd() * (H - 2 * m);
      if (!insideArena(x, y, W, H, this.corner, m)) continue;
      let clear = Math.min(x, W - x, y, H - y) * 1.5;
      for (const o of this.list) {
        if (o === self || !o.alive || o.gone) continue;
        // Heads move, keep twice the distance from them.
        const dh = Math.hypot(o.x - x, o.y - y) * 0.5;
        if (dh < clear) clear = dh;
        const n = o.bodyPoints();
        for (let j = 0; j <= n; j += 3) {
          const d = Math.hypot(o.px(j) - x, o.py(j) - y);
          if (d < clear) clear = d;
        }
      }
      if (clear > best) {
        best = clear;
        bx = x;
        by = y;
      }
    }
    // Roughly toward the middle but never straight at it, so two snakes that come back at the
    // same moment do not meet head-on in the centre.
    const side = this.rnd() < 0.5 ? -1 : 1;
    const angle = wrapAngle(Math.atan2(H / 2 - by, W / 2 - bx) + side * (0.55 + this.rnd() * 0.6));
    return { x: bx, y: by, angle };
  }

  private resetBody(s: Snake, x: number, y: number, angle: number): void {
    const t = this.tuning;
    s.alive = true;
    s.x = x;
    s.y = y;
    s.angle = angle;
    s.len = t.baseLen;
    s.bodyLen = t.baseLen;
    s.radius = this.radiusFor(t.baseLen);
    s.trailHead = 0;
    s.trailCount = 0;
    s.gap = 0;
    s.boosting = false;
    s.steer = 0;
    s.shedAcc = 0;
    s.spawnedAt = this.now;
    s.respawnAt = Number.POSITIVE_INFINITY;
    s.best = Math.max(s.best, t.baseLen);
  }

  /** A straight body trailing behind (start of the round). */
  private spawnStraight(s: Snake, x: number, y: number, angle: number): void {
    this.resetBody(s, x, y, angle);
    const D = this.tuning.spacing;
    const n = this.tuning.baseLen + 2;
    const dx = Math.cos(angle) * D;
    const dy = Math.sin(angle) * D;
    for (let j = n - 1; j >= 0; j--) this.push(s, x - dx * j, y - dy * j);
  }

  /** A body coiled on the spot that unrolls as the head moves (respawn, late join). */
  private spawnCoiled(s: Snake, x: number, y: number, angle: number): void {
    this.resetBody(s, x, y, angle);
    const n = this.tuning.baseLen + 2;
    for (let j = 0; j < n; j++) this.push(s, x, y);
  }

  /** Put a snake on the field at a spot with a straight body behind it (tests, set pieces). */
  placeAt(id: number, x: number, y: number, angle: number, protect = false): void {
    const s = this.byId.get(id);
    if (!s || s.gone) return;
    s.inMatch = true;
    this.spawnStraight(s, x, y, angle);
    s.protectUntil = protect ? this.now + this.tuning.protectMs : 0;
  }

  private respawn(s: Snake): void {
    const first = s.deaths === 0 && s.eaten === 0 && s.best === 0;
    const at = this.pickSpawn(s);
    this.spawnCoiled(s, at.x, at.y, at.angle);
    s.protectUntil = this.now + this.tuning.protectMs;
    this.emit({ type: 'spawn', id: s.id, x: s.x, y: s.y, first });
  }

  radiusFor(len: number): number {
    const t = this.tuning;
    return t.radius + t.radiusGrow * clamp((len - t.baseLen) / t.radiusFullLen, 0, 1);
  }

  /* ------------------------------------------------------------------ simulation */

  private simulate(dt: number): void {
    const sec = dt / 1000;
    for (const s of this.list) {
      if (s.gone || !s.inMatch) continue;
      if (!s.alive) {
        if (this.now >= s.respawnAt) this.respawn(s);
        continue;
      }
      this.move(s, dt, sec);
    }
    this.collide();
    this.updatePellets(dt, sec);
    this.trackLeader();
    this.clockEvents();
  }

  /** Turns the head by at most `maxStep` radians: toward the stick's aim, else by the held turn. */
  private turn(s: Snake, maxStep: number): void {
    let step = s.turn * maxStep;
    if (!Number.isNaN(s.aim)) {
      let d = wrapAngle(s.aim - s.angle);
      // Straight behind: commit to the current turn instead of dithering between both sides.
      if (Math.abs(d) > BEHIND && s.steer !== 0) d = Math.sign(s.steer) * Math.abs(d);
      step = clamp(d, -maxStep, maxStep);
    }
    s.steer = maxStep > 0 ? clamp(step / maxStep, -1, 1) : 0;
    s.angle = wrapAngle(s.angle + step);
  }

  private move(s: Snake, dt: number, sec: number): void {
    const t = this.tuning;
    const boost = s.wantBoost && s.len > t.minBoostLen;
    if (boost !== s.boosting) {
      s.boosting = boost;
      if (!boost) s.shedAcc = 0;
      this.emit({ type: 'boost', id: s.id, on: boost });
    }
    this.turn(s, (boost ? t.boostTurnRate : t.turnRate) * sec);
    const v = boost ? t.boostSpeed : t.speed;
    s.x += Math.cos(s.angle) * v * sec;
    s.y += Math.sin(s.angle) * v * sec;
    if (this.isProtected(s)) this.keepInside(s);
    this.record(s);
    if (boost) {
      s.boostMs += dt;
      s.shedAcc += dt;
      while (s.shedAcc >= t.shedMs && s.len > t.minBoostLen) {
        s.shedAcc -= t.shedMs;
        s.len -= 1;
        this.shed(s);
      }
    }
    if (s.bodyLen < s.len) s.bodyLen = Math.min(s.len, s.bodyLen + t.growRate * sec);
    else if (s.bodyLen > s.len) s.bodyLen = Math.max(s.len, s.bodyLen - t.shrinkRate * sec);
    // The tail waits on the spot until the head has laid enough trail.
    if (s.bodyLen > s.trailCount - 1) s.bodyLen = s.trailCount - 1;
    s.radius = this.radiusFor(s.bodyLen);
  }

  private push(s: Snake, x: number, y: number): void {
    s.trailHead = (s.trailHead + 1) & TRAIL_MASK;
    s.trailX[s.trailHead] = x;
    s.trailY[s.trailHead] = y;
    if (s.trailCount < TRAIL_CAP) s.trailCount++;
  }

  /** Lay trail points every `spacing` units behind the head. */
  private record(s: Snake): void {
    const D = this.tuning.spacing;
    let lx = s.px(0);
    let ly = s.py(0);
    let dx = s.x - lx;
    let dy = s.y - ly;
    let d = Math.hypot(dx, dy);
    let guard = 0;
    while (d >= D && guard++ < 64) {
      const k = D / d;
      lx += dx * k;
      ly += dy * k;
      this.push(s, lx, ly);
      dx = s.x - lx;
      dy = s.y - ly;
      d = Math.hypot(dx, dy);
    }
    s.gap = d;
  }

  /** Spawn protection: the arena edge bounces the snake back instead of knocking it out. */
  private keepInside(s: Snake): void {
    const W = this.width;
    const H = this.height;
    const C = this.corner;
    const m = s.radius;
    if (insideArena(s.x, s.y, W, H, C, m)) return;
    const hx = W / 2;
    const hy = H / 2;
    const sx = s.x >= hx ? 1 : -1;
    const sy = s.y >= hy ? 1 : -1;
    const ax = Math.abs(s.x - hx);
    const ay = Math.abs(s.y - hy);
    const cx = ax - (hx - C);
    const cy = ay - (hy - C);
    let nx: number;
    let ny: number;
    if (cx > 0 && cy > 0) {
      const d = Math.hypot(cx, cy) || 1;
      nx = (cx / d) * sx;
      ny = (cy / d) * sy;
    } else if (ax - (hx - m) >= ay - (hy - m)) {
      nx = sx;
      ny = 0;
    } else {
      nx = 0;
      ny = sy;
    }
    const dx = Math.cos(s.angle);
    const dy = Math.sin(s.angle);
    const dot = dx * nx + dy * ny;
    if (dot > 0) s.angle = Math.atan2(dy - 2 * dot * ny, dx - 2 * dot * nx);
    for (let i = 0; i < 12 && !insideArena(s.x, s.y, W, H, C, m); i++) {
      s.x -= nx * 2;
      s.y -= ny * 2;
    }
  }

  private shed(s: Snake): void {
    const p = this.pointAt(s, s.bodyLen * this.tuning.spacing, this.pt);
    const j = s.radius * 0.5;
    this.addLoose(PELLET_SHED, p.x + (this.rnd() - 0.5) * j, p.y + (this.rnd() - 0.5) * j, 1, s.colorNum);
  }

  /** A seed dropped by a snake, kept inside the arena. */
  private addLoose(kind: number, x: number, y: number, value: number, color: number): void {
    let px = x;
    let py = y;
    const W = this.width;
    const H = this.height;
    for (let i = 0; i < 10 && !insideArena(px, py, W, H, this.corner, 10); i++) {
      px += (W / 2 - px) * 0.12;
      py += (H / 2 - py) * 0.12;
    }
    this.pellets.add(kind, px, py, value, color, this.now, this.tuning.dropLifeMs);
  }

  /** A knocked-out body bursts into big seeds along its length. */
  private burst(s: Snake): void {
    const t = this.tuning;
    const n = s.bodyPoints();
    const total = Math.max(6, Math.round((s.len * t.burstShare) / t.foodLen));
    const count = clamp(Math.round(total / 6), 3, 48);
    const per = total / count;
    let carry = 0;
    const p = this.pt;
    for (let i = 0; i < count; i++) {
      const d = count === 1 ? 0 : (i / (count - 1)) * n * t.spacing;
      this.pointAt(s, d, p);
      carry += per;
      const v = clamp(Math.round(carry), 1, 12);
      carry -= v;
      const jx = (this.rnd() - 0.5) * s.radius * 1.4;
      const jy = (this.rnd() - 0.5) * s.radius * 1.4;
      this.addLoose(PELLET_DROP, p.x + jx, p.y + jy, v, s.colorNum);
    }
  }

  private spawnAmbient(): void {
    const W = this.width;
    const H = this.height;
    for (let tries = 0; tries < 6; tries++) {
      const x = 16 + this.rnd() * (W - 32);
      const y = 16 + this.rnd() * (H - 32);
      if (!insideArena(x, y, W, H, this.corner, 14)) continue;
      const value = this.rnd() < 0.2 ? 2 : 1;
      const color = SEED_COLORS[Math.floor(this.rnd() * SEED_COLORS.length)] ?? 0xffd84d;
      this.pellets.add(PELLET_AMBIENT, x, y, value, color, this.now, 0);
      return;
    }
  }

  private bounds(s: Snake): void {
    let minX = s.x;
    let maxX = s.x;
    let minY = s.y;
    let maxY = s.y;
    const n = s.bodyPoints();
    for (let j = 0; j <= n; j++) {
      const x = s.px(j);
      const y = s.py(j);
      if (x < minX) minX = x;
      else if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      else if (y > maxY) maxY = y;
    }
    s.minX = minX;
    s.maxX = maxX;
    s.minY = minY;
    s.maxY = maxY;
  }

  private mark(s: Snake, by: Snake | null, cause: KoCause): void {
    if (s.marked) return;
    s.marked = true;
    s.markBy = by;
    s.markCause = cause;
    this.marked.push(s);
  }

  /** Walls, head-to-head, head-to-body. Protected snakes neither die nor knock anyone out. */
  private collide(): void {
    const live = this.live;
    live.length = 0;
    for (const s of this.list) if (s.alive && !s.gone && !this.isProtected(s)) live.push(s);
    this.marked.length = 0;
    const W = this.width;
    const H = this.height;
    for (const s of live) {
      this.bounds(s);
      if (!insideArena(s.x, s.y, W, H, this.corner, s.radius * 0.8)) this.mark(s, null, 'wall');
    }
    for (let i = 0; i < live.length; i++) {
      const a = live[i]!;
      for (let k = i + 1; k < live.length; k++) {
        const b = live[k]!;
        const r = (a.radius + b.radius) * 0.9;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        if (dx * dx + dy * dy < r * r) {
          this.mark(a, b, 'head');
          this.mark(b, a, 'head');
        }
      }
    }
    for (const a of live) {
      if (a.marked) continue;
      for (const b of live) {
        if (b === a) continue;
        const thr = a.radius + b.radius - 1.5;
        if (a.x < b.minX - thr || a.x > b.maxX + thr || a.y < b.minY - thr || a.y > b.maxY + thr) continue;
        const thr2 = thr * thr;
        const n = b.bodyPoints();
        let hit = false;
        for (let j = 0; j <= n; j++) {
          const dx = a.x - b.px(j);
          const dy = a.y - b.py(j);
          if (dx * dx + dy * dy < thr2) {
            hit = true;
            break;
          }
        }
        if (hit) {
          this.mark(a, b, 'body');
          break;
        }
      }
    }
    for (const s of this.marked) {
      this.knockOut(s, s.markBy, s.markCause);
      s.marked = false;
      s.markBy = null;
    }
    this.marked.length = 0;
  }

  private knockOut(s: Snake, by: Snake | null, cause: KoCause): void {
    const len = Math.floor(s.len);
    const x = s.x;
    const y = s.y;
    this.burst(s);
    s.alive = false;
    s.boosting = false;
    s.shedAcc = 0;
    s.deaths++;
    s.longestLife = Math.max(s.longestLife, this.now - s.spawnedAt);
    s.diedAt = this.now;
    s.respawnAt = this.now + this.tuning.respawnMs;
    s.lastKiller = by ? by.id : null;
    s.lastCause = cause;
    s.len = 0;
    s.bodyLen = 0;
    if (by && cause === 'body') by.kos++;
    if (this.leaderId === s.id) this.leaderId = null;
    this.emit({ type: 'ko', id: s.id, by: by ? by.id : null, cause, x, y, len });
  }

  private updatePellets(dt: number, sec: number): void {
    const P = this.pellets;
    const t = this.tuning;
    const heads = this.heads;
    heads.length = 0;
    for (const s of this.list) if (s.alive && !s.gone) heads.push(s);
    const now = this.now;
    for (let i = 0; i < P.span; i++) {
      const kind = P.kind[i]!;
      if (kind === PELLET_FREE) continue;
      if (kind !== PELLET_AMBIENT && P.expires[i]! <= now) {
        P.remove(i);
        continue;
      }
      if (heads.length === 0) continue;
      const px = P.x[i]!;
      const py = P.y[i]!;
      const pr = P.r[i]!;
      let best: Snake | null = null;
      let bestD2 = Number.POSITIVE_INFINITY;
      let bestReach = 0;
      for (const s of heads) {
        const reach = s.radius * 1.3 + pr + t.magnet;
        const dx = s.x - px;
        if (dx > reach || dx < -reach) continue;
        const dy = s.y - py;
        if (dy > reach || dy < -reach) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 < reach * reach && d2 < bestD2) {
          bestD2 = d2;
          best = s;
          bestReach = reach;
        }
      }
      if (!best) continue;
      const d = Math.sqrt(bestD2);
      const eatR = best.radius * 1.3 + pr * 0.6;
      if (d <= eatR) {
        const value = P.value[i]!;
        best.len = Math.min(t.maxLen, best.len + value * t.foodLen);
        best.eaten++;
        if (best.len > best.best) best.best = best.len;
        this.emit({ type: 'eat', id: best.id, x: px, y: py, value, color: P.color[i]! });
        P.remove(i);
        continue;
      }
      const pull = t.magnetSpeed * sec * (1 + (bestReach - d) / bestReach);
      const stepLen = Math.min(d - eatR * 0.5, pull);
      P.x[i] = px + ((best.x - px) / d) * stepLen;
      P.y[i] = py + ((best.y - py) / d) * stepLen;
    }
    const target = this.ambientTarget();
    if (P.ambient < target) {
      // Regrowth scales with the arena, so a full field does not eat it bare.
      const every = 1e9 / (t.regrowRate * this.width * this.height);
      this.spawnAcc += dt;
      while (this.spawnAcc >= every && P.ambient < target) {
        this.spawnAcc -= every;
        this.spawnAmbient();
      }
    } else {
      this.spawnAcc = 0;
    }
  }

  private trackLeader(): void {
    let best: Snake | null = null;
    for (const s of this.list) {
      if (!s.alive || s.gone || !s.inMatch) continue;
      if (!best || s.len > best.len) best = s;
    }
    const cur = this.leaderId === null ? undefined : this.byId.get(this.leaderId);
    if (cur?.alive && !cur.gone && best && cur.len >= best.len) return;
    // The crown needs a real lead in length; the announcement needs a bit more.
    const next = best && best.len >= this.tuning.baseLen + 6 ? best.id : null;
    if (next === this.leaderId) return;
    this.leaderId = next;
    if (
      next !== null &&
      best &&
      best.len >= this.tuning.baseLen + 15 &&
      this.now - this.lastLeadAt >= this.tuning.leadGapMs
    ) {
      this.lastLeadAt = this.now;
      this.emit({ type: 'lead', id: next });
    }
  }

  private clockEvents(): void {
    const left = this.timeLeft();
    if (!this.warned && left <= this.tuning.warnMs) {
      this.warned = true;
      this.emit({ type: 'warning' });
    }
    const sec = Math.ceil(left / 1000);
    if (sec >= 1 && sec <= 5 && sec !== this.lastTick) {
      this.lastTick = sec;
      this.emit({ type: 'tick', left: sec });
    }
  }
}
