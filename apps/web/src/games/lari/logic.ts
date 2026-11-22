/**
 * Lari Terus rules, pure and deterministic (fixed time steps, no DOM): the shared pack speed,
 * every runner's lane, jump, slide and stumble, coins, the camera line that eliminates runners
 * in Bertahan, and the end of the run. The driver feeds it phone input and computer decisions;
 * the 3D view only reads it.
 *
 * Latency (PRD 5.3): the relay may add about 200 ms, so the main screen judges generously.
 *  - Phone input is applied as of the moment it was pressed (`lag`, capped): a jump that left the
 *    finger 150 ms ago is owed 150 ms of its arc, which it catches up by playing the arc faster
 *    for a moment (`lagCatch`), so the body never pops up. A lane change always eases the body
 *    across in full (never a teleport); where it stands across the roof is judged as of the press
 *    instead (`judgedX`).
 *  - A person's runner that touches an obstacle is not tripped at once: the hit waits `hitGrace`
 *    and is forgiven when the right move (pressed no later than just after the touch) clears it.
 *  - Jumps are long and high (about 0.75 s: a quick rise, a short float at the top, a slightly
 *    faster fall), the hit box is a little smaller than the body, and the first rows come after a
 *    calm start.
 *
 * Lane changes work like a classic three-lane runner: one lateral move is exactly one lane. A
 * move made during a change waits its turn (at most `LANE_QUEUE` wait), a move back cancels the
 * last waiting one or turns the change under way around, and a move into the roof edge only
 * bumps.
 */
import { PAD_ACTION, PAD_DOWN, PAD_LEFT, PAD_RIGHT, PAD_UP, u16Delta } from '@hoorah/protocol';
import { CONTROL_DEFAULTS } from '../../shared/controls';
import { lowerBound, type Obstacle, type ObstacleKind, Track } from './track';

export type Mode = 'sprint' | 'survive';
export const MODES: readonly Mode[] = ['sprint', 'survive'];

/** `game.settings.rounds`: 1 = Sprint, 2 = Bertahan (the catalog's default). */
export function parseMode(rounds: unknown): Mode {
  return Number(rounds) === 1 ? 'sprint' : 'survive';
}

export const TUNING = {
  /** Distance between lane centres (m). */
  laneW: 1.9,
  /** Seconds for one lane change (sharp ease-out; the same at every speed). Lab: controls.ts. */
  laneTime: CONTROL_DEFAULTS.runner.laneTime,
  /** Take-off speed and rising gravity (Lab: controls.ts). */
  jumpV: CONTROL_DEFAULTS.runner.jumpV,
  gravity: CONTROL_DEFAULTS.runner.gravity,
  /** Falling gravity as a multiple of the rising one, and the float at the apex (s). */
  fallMul: CONTROL_DEFAULTS.runner.fallMul,
  hang: CONTROL_DEFAULTS.runner.hang,
  /** Extra arc seconds played per second until a lagged jump has caught up (Lab: controls.ts). */
  lagCatch: CONTROL_DEFAULTS.runner.lagCatch,
  /** Downward speed of a slide pressed in the air (m/s). */
  fastFall: 16,
  slideTime: 0.75,
  /** A stumble: crawl at `stumbleSpeed` of the pack speed, then recover. */
  stumbleSlow: 0.5,
  stumbleRecover: 0.55,
  stumbleSpeed: 0.3,
  /** Seconds a runner cannot be tripped again after a stumble (blinks). */
  safeTime: 1.2,
  /** People's runners: seconds a touch waits for the move that clears it. */
  hitGrace: 0.25,
  /** A clearing move may start this long after the touch and still count. */
  lateOk: 0.1,
  /** Phone lag compensated at most (s). */
  maxLag: 0.25,
  /** Seconds a runner may run on air past a roof edge before it counts as a fall. */
  coyote: 0.1,
  /** Feet height that clears a low barrier (m). */
  lowClear: 0.34,
  /** Lateral distance (runner to obstacle centre) below which they touch (m). */
  hitHalfW: 0.88,
  /** Half depth of a runner along the run (m), a little under the body: grazes are forgiven. */
  bodyHalf: 0.22,
  /** Runners behind the leader run a little faster, up to this share. */
  catchUp: 0.07,
  /** ...from this far behind (m). */
  catchFrom: 1.6,
  sprintSeconds: 90,
  /** Sprint: metres taken off the distance per stumble. */
  stumbleCost: 15,
  coinPoints: 5,
  /** Bertahan: how far behind the leader the bottom of the screen is (m), shrinking over time. */
  backStart: 12.5,
  backEnd: 8,
  backShrinkFrom: 75,
  backShrinkTo: 240,
  /** Speed-up call-outs every this many seconds. */
  fasterEvery: 30,
} as const;

export type Tuning = { -readonly [K in keyof typeof TUNING]: number };

/** Share of the rising gravity felt around the apex (the float). */
const HANG_SHARE = 0.3;

type JumpParams = Pick<Tuning, 'jumpV' | 'gravity' | 'fallMul' | 'hang'>;

/** Upward speed (m/s) below which the runner floats: the float lasts `hang` seconds. */
function hangSpeed(t: JumpParams): number {
  return Math.min(t.jumpV, (t.hang * t.gravity * HANG_SHARE) / 2);
}

/**
 * Gravity (m/s², positive = down) at upward speed `vy` during a jump: full on the way up, gentle
 * around the apex, `fallMul` times stronger on the way down.
 */
export function jumpGravity(vy: number, t: JumpParams): number {
  const h = hangSpeed(t);
  if (vy > h) return t.gravity;
  if (vy >= -h) return t.gravity * HANG_SHARE;
  return t.gravity * t.fallMul;
}

/** Height and upward speed `at` seconds after take-off (exact, phase by phase; may go below 0). */
export function jumpArc(at: number, t: JumpParams): { y: number; vy: number } {
  const h = hangSpeed(t);
  const g = t.gravity;
  const gh = g * HANG_SHARE;
  const gf = g * t.fallMul;
  const t1 = (t.jumpV - h) / g;
  if (at <= t1) return { y: t.jumpV * at - 0.5 * g * at * at, vy: t.jumpV - g * at };
  const y1 = t.jumpV * t1 - 0.5 * g * t1 * t1;
  const t2 = h > 0 ? (2 * h) / gh : 0;
  const a2 = at - t1;
  if (a2 <= t2) return { y: y1 + h * a2 - 0.5 * gh * a2 * a2, vy: h - gh * a2 };
  const a3 = a2 - t2;
  return { y: y1 - h * a3 - 0.5 * gf * a3 * a3, vy: -h - gf * a3 };
}

/** Seconds a jump stays airborne and the apex height of the feet. */
export function jumpShape(t: JumpParams = TUNING): { airTime: number; peak: number } {
  const h = hangSpeed(t);
  const g = t.gravity;
  const gf = g * t.fallMul;
  const t1 = (t.jumpV - h) / g;
  const y1 = (t.jumpV * t.jumpV - h * h) / (2 * g);
  const t2 = h > 0 ? (2 * h) / (g * HANG_SHARE) : 0;
  const t3 = (-h + Math.sqrt(h * h + 2 * gf * y1)) / gf;
  return { airTime: t1 + t2 + t3, peak: y1 + (h * h) / (2 * g * HANG_SHARE) };
}

/* ------------------------------------------------------------------ pack speed */

/** Piecewise linear pack speed (m/s) over time since the start (s); flat after the last point. */
const SPEED_POINTS: readonly [number, number][] = [
  [0, 8.5],
  [40, 12],
  [100, 15.5],
  [180, 18.5],
  [300, 21],
];

export function speedAt(t: number): number {
  const p = SPEED_POINTS;
  if (t <= p[0]![0]) return p[0]![1];
  for (let i = 1; i < p.length; i++) {
    const [t1, v1] = p[i]!;
    if (t <= t1) {
      const [t0, v0] = p[i - 1]!;
      return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  }
  return p[p.length - 1]![1];
}

/** Distance the pack covers in `t` seconds at full speed. */
export function distanceAt(t: number): number {
  const p = SPEED_POINTS;
  if (t <= 0) return t * p[0]![1];
  let d = 0;
  for (let i = 1; i < p.length; i++) {
    const [t0, v0] = p[i - 1]!;
    const [t1] = p[i]!;
    const end = Math.min(t, t1);
    if (end > t0) d += ((v0 + speedAt(end)) / 2) * (end - t0);
    if (t <= t1) return d;
  }
  const [tl, vl] = p[p.length - 1]!;
  return d + vl * (t - tl);
}

/** Time at which the pack reaches `d` at full speed (inverse of `distanceAt`). */
export function timeAtDistance(d: number): number {
  if (d <= 0) return d / SPEED_POINTS[0]![1];
  let lo = 0;
  let hi = 4000;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (distanceAt(mid) < d) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/* ------------------------------------------------------------------ runners */

export interface RunnerSetup {
  id: number;
  /** Controlled by the main screen (computer opponent). */
  cpu: boolean;
}

export type Action = 'left' | 'right' | 'jump' | 'slide';

/** A lateral move waiting for the lane change under way. */
export interface LaneMove {
  dir: -1 | 1;
  /** When it was pressed (run time, s). */
  at: number;
}

/** Lateral moves that may wait behind the change under way; a newer one replaces the extra. */
export const LANE_QUEUE = 2;

export interface Runner {
  readonly id: number;
  readonly idx: number;
  readonly cpu: boolean;
  /** A dropped phone: the computer runs this seat until it reconnects. */
  takeover: boolean;
  d: number;
  x: number;
  y: number;
  prevD: number;
  prevX: number;
  prevY: number;
  /** Current forward speed (m/s). */
  speed: number;
  /** Target lane -1..1. */
  lane: number;
  laneFrom: number;
  /** Lane change progress 0..1 (1 = settled). */
  laneT: number;
  /** Lateral moves waiting for the change under way, oldest first. */
  laneQueue: LaneMove[];
  vy: number;
  air: boolean;
  slideT: number;
  slideQueued: boolean;
  jumpBuffer: number;
  /** Seconds of jump arc still owed to phone lag, caught up at `lagCatch` (no visual pop). */
  arcOwed: number;
  coyoteT: number;
  /** Remaining stumble (slow + recover), seconds. */
  stumbleT: number;
  /** Kind of the last stumble (for the animation). */
  stumbleKind: ObstacleKind | null;
  safeT: number;
  /** Falling into a gap (s left); then `climbT` while climbing out on the far side. */
  fallT: number;
  climbT: number;
  /** Times the last moves started (run time, s), for forgiving late touches. */
  jumpAt: number;
  slideAt: number;
  laneAt: number;
  pending: Obstacle | null;
  pendingAt: number;
  lastHit: number;
  coins: number;
  stumbles: number;
  jumps: number;
  out: boolean;
  outT: number | null;
  /** Final place once out or finished (1 = best). */
  place: number | null;
  lastTaps: number;
}

export type LariEvent =
  | { type: 'go' }
  | { type: 'jump'; id: number }
  | { type: 'slide'; id: number }
  | { type: 'lane'; id: number; dir: -1 | 1 }
  /** A lateral move into the roof edge: nothing moves, the body only nudges. */
  | { type: 'bump'; id: number; dir: -1 | 1 }
  | { type: 'land'; id: number }
  | { type: 'coin'; id: number; coin: number; lane: number; d: number; y: number }
  | { type: 'stumble'; id: number; kind: ObstacleKind }
  | { type: 'fall'; id: number }
  | { type: 'dodge'; id: number }
  | { type: 'out'; id: number; place: number }
  | { type: 'faster'; level: number }
  | { type: 'finish' };

export type Phase = 'ready' | 'run' | 'done';

export interface RunOptions {
  mode: Mode;
  runners: readonly RunnerSetup[];
  seed: number;
  tuning?: Partial<Tuning>;
  /** A prepared track (tests); otherwise one is generated from `seed`. */
  track?: Track;
}

/** How far ahead of the leader the track is generated, and how far behind it is kept. */
const AHEAD = 320;
const BEHIND = 60;

/** Lane change easing: sharp ease-out (cubic), so the body leaves at once and settles softly. */
export const laneEase = (t: number): number => 1 - (1 - t) ** 3;
/** Steepest slope of `laneEase` (at the start), for render smoothing and tests. */
export const LANE_EASE_SLOPE = 3;
const byDistance = (a: Runner, b: Runner) => a.d - b.d;

export class LariRun {
  readonly mode: Mode;
  readonly tuning: Tuning;
  readonly track: Track;
  readonly runners: Runner[];
  phase: Phase = 'ready';
  /** Seconds since the start signal. */
  t = 0;
  /** Distance of the leading runner still in the run. */
  packD = 0;
  /** Pack speed now (m/s). */
  speed: number;
  readonly events: LariEvent[] = [];
  /** A lone runner (no one to follow) is paced by a ghost at the pack speed. */
  private ghostD = 0;
  /** Scratch list for the drop-out check (no allocation per step). */
  private readonly behind: Runner[] = [];
  private readonly byId = new Map<number, Runner>();
  private fasterLevel = 0;

  constructor(opts: RunOptions) {
    this.mode = opts.mode;
    this.tuning = { ...TUNING, ...opts.tuning };
    const shape = jumpShape(this.tuning);
    this.track =
      opts.track ??
      new Track({
        seed: opts.seed,
        speedAt: (d) => speedAt(timeAtDistance(d)),
        airTime: shape.airTime,
        jumpPeak: shape.peak,
      });
    this.speed = speedAt(0);
    // Start in a loose staggered pack across the three lanes.
    this.runners = opts.runners.map((s, idx) => {
      const lane = ([0, -1, 1][idx % 3] ?? 0) as number;
      const d = -Math.floor(idx / 3) * 1.6 - (idx % 3 === 0 ? 0 : 0.8);
      const r: Runner = {
        id: s.id,
        idx,
        cpu: s.cpu,
        takeover: false,
        d,
        x: lane * this.tuning.laneW,
        y: 0,
        prevD: d,
        prevX: lane * this.tuning.laneW,
        prevY: 0,
        speed: 0,
        lane,
        laneFrom: lane * this.tuning.laneW,
        laneT: 1,
        laneQueue: [],
        vy: 0,
        air: false,
        slideT: 0,
        slideQueued: false,
        jumpBuffer: 0,
        arcOwed: 0,
        coyoteT: 0,
        stumbleT: 0,
        stumbleKind: null,
        safeT: 0,
        fallT: 0,
        climbT: 0,
        jumpAt: -99,
        slideAt: -99,
        laneAt: -99,
        pending: null,
        pendingAt: 0,
        lastHit: -1,
        coins: 0,
        stumbles: 0,
        jumps: 0,
        out: false,
        outT: null,
        place: null,
        lastTaps: -1,
      };
      this.byId.set(s.id, r);
      return r;
    });
    this.packD = Math.max(0, ...this.runners.map((r) => r.d));
    this.track.ensure(this.packD + AHEAD);
  }

  runner(id: number): Runner | undefined {
    return this.byId.get(id);
  }

  /** Bertahan: distance behind the leader at which a runner drops out. */
  backLimit(): number {
    const T = this.tuning;
    const k = Math.min(1, Math.max(0, (this.t - T.backShrinkFrom) / (T.backShrinkTo - T.backShrinkFrom)));
    return T.backStart + (T.backEnd - T.backStart) * k;
  }

  /** Runners behind this line are out (Bertahan) or dragged along (Sprint). */
  get outLine(): number {
    return this.packD - this.backLimit();
  }

  get alive(): number {
    let n = 0;
    for (const r of this.runners) if (!r.out) n++;
    return n;
  }

  /** Sprint: seconds left. */
  get timeLeft(): number {
    return Math.max(0, this.tuning.sprintSeconds - this.t);
  }

  /** Scored distance: Sprint takes `stumbleCost` metres off per stumble. */
  distOf(r: Runner): number {
    const base = Math.max(0, r.d);
    return this.mode === 'sprint' ? Math.max(0, base - r.stumbles * this.tuning.stumbleCost) : base;
  }

  /** Sprint score: distance plus coins. */
  scoreOf(r: Runner): number {
    return Math.round(this.distOf(r)) + r.coins * this.tuning.coinPoints;
  }

  /** Everyone, best first (live ranking, also the final order once done). */
  standings(): Runner[] {
    const list = [...this.runners];
    if (this.mode === 'sprint') {
      list.sort((a, b) => this.scoreOf(b) - this.scoreOf(a) || b.coins - a.coins || a.idx - b.idx);
      return list;
    }
    list.sort((a, b) => {
      if (a.place !== null || b.place !== null) {
        if (a.place === null) return -1;
        if (b.place === null) return 1;
        return a.place - b.place;
      }
      return b.d - a.d || a.idx - b.idx;
    });
    return list;
  }

  /** The start signal. */
  start(): void {
    if (this.phase !== 'ready') return;
    this.phase = 'run';
    this.events.push({ type: 'go' });
  }

  /* ---------------------------------------------------------------- input */

  /**
   * One phone frame. `taps` is the cumulative u16 swipe counter; the frame whose counter rose
   * carries the swipe direction in `buttons`. `lag` = seconds since the finger moved.
   */
  input(id: number, taps: number, buttons: number, lag: number): void {
    const r = this.byId.get(id);
    if (!r) return;
    const counter = taps & 0xffff;
    const delta = r.lastTaps < 0 ? 1 : u16Delta(r.lastTaps, counter);
    r.lastTaps = counter;
    // A huge jump of the counter is a reconnect or a counter reset, not hundreds of swipes.
    if (delta === 0 || delta > 40) return;
    if (this.phase !== 'run' || r.out || r.takeover) return;
    let action: Action | null = null;
    if (buttons & PAD_LEFT) action = 'left';
    else if (buttons & PAD_RIGHT) action = 'right';
    else if (buttons & (PAD_UP | PAD_ACTION)) action = 'jump';
    else if (buttons & PAD_DOWN) action = 'slide';
    if (!action) return;
    // One frame is one move, even when frames went missing: lost input is dropped, not replayed
    // (a lane change repeated from a guess is exactly the jump across the roof to avoid).
    this.act(r, action, lag);
  }

  /** Apply a move as of `lag` seconds ago (0 for computer runners). */
  act(r: Runner, action: Action, lag = 0): void {
    if (this.phase !== 'run' || r.out || r.fallT > 0 || r.climbT > 0) return;
    const T = this.tuning;
    const L = Math.min(T.maxLag, Math.max(0, lag));
    switch (action) {
      case 'left':
      case 'right':
        this.laneMove(r, action === 'left' ? -1 : 1, this.t - L);
        return;
      case 'jump': {
        const grounded = !r.air || r.y <= 0.02;
        if (!grounded) {
          r.jumpBuffer = 0.16;
          return;
        }
        this.startJump(r, L);
        return;
      }
      case 'slide': {
        if (r.air && r.y > 0.05) {
          r.arcOwed = 0;
          r.vy = Math.min(r.vy, -T.fastFall);
          r.slideQueued = true;
          r.slideAt = this.t - L;
          return;
        }
        r.slideT = Math.max(0.3, T.slideTime - L);
        r.slideAt = this.t - L;
        this.events.push({ type: 'slide', id: r.id });
        return;
      }
    }
  }

  /** One lateral move pressed at `at`: exactly one lane, after the change under way. */
  private laneMove(r: Runner, dir: -1 | 1, at: number): void {
    const q = r.laneQueue;
    const last = q[q.length - 1];
    // A move back cancels the last waiting move...
    if (last && last.dir !== dir) {
      q.pop();
      return;
    }
    // ...or turns the change under way around, back to the lane it left.
    if (r.laneT < 1 && q.length === 0 && this.laneDir(r) === -dir) {
      this.startLane(r, r.lane + dir, at);
      return;
    }
    // Waiting moves are all the same way: the extra one is replaced, which changes nothing.
    if (q.length >= LANE_QUEUE) q.length = LANE_QUEUE - 1;
    let planned = r.lane;
    for (const m of q) planned += m.dir;
    if (planned + dir < -1 || planned + dir > 1) {
      this.events.push({ type: 'bump', id: r.id, dir });
      return;
    }
    if (r.laneT < 1 || q.length > 0) q.push({ dir, at });
    else this.startLane(r, r.lane + dir, at);
  }

  /** Direction of the change under way (0 when settled). */
  private laneDir(r: Runner): number {
    if (r.laneT >= 1) return 0;
    return Math.sign(r.lane * this.tuning.laneW - r.laneFrom);
  }

  /** Ease the body from where it is now to `lane`, from the next step on. */
  private startLane(r: Runner, lane: number, at: number): void {
    const target = Math.max(-1, Math.min(1, lane));
    const dir = Math.sign(target * this.tuning.laneW - r.x);
    r.laneFrom = r.x;
    r.lane = target;
    r.laneT = 0;
    r.laneAt = Math.min(this.t, at);
    if (dir !== 0) this.events.push({ type: 'lane', id: r.id, dir: dir < 0 ? -1 : 1 });
  }

  /**
   * Lateral position for forgiving a late sidestep: the lane change as if it had started when it
   * was pressed (the eased body only shows it from when it arrived).
   */
  judgedX(r: Runner): number {
    if (r.laneT >= 1) return r.x;
    const T = this.tuning;
    const k = Math.max(r.laneT, Math.min(1, (this.t - r.laneAt) / T.laneTime));
    return r.laneFrom + (r.lane * T.laneW - r.laneFrom) * laneEase(k);
  }

  /**
   * Take off now. A press `L` seconds old is owed `L` of arc: with `lagCatch` > 0 it is played
   * faster from the ground up (smooth); with 0 the body starts that far up its arc at once.
   */
  private startJump(r: Runner, L: number): void {
    const T = this.tuning;
    r.air = true;
    if (T.lagCatch > 0) {
      r.vy = T.jumpV;
      r.y = 0.001;
      r.arcOwed = L;
    } else {
      const arc = jumpArc(L, T);
      r.vy = arc.vy;
      r.y = Math.max(0.001, arc.y);
      r.arcOwed = 0;
    }
    r.slideT = 0;
    r.slideQueued = false;
    r.jumpBuffer = 0;
    r.coyoteT = 0;
    r.jumpAt = this.t - L;
    r.jumps++;
    this.events.push({ type: 'jump', id: r.id });
  }

  /** Disconnected people are run by the computer until they come back. */
  setTakeover(id: number, on: boolean): void {
    const r = this.byId.get(id);
    if (!r || r.cpu) return;
    r.takeover = on;
    if (on) r.lastTaps = -1;
  }

  /* ---------------------------------------------------------------- simulation */

  step(dt: number): void {
    if (this.phase !== 'run') {
      for (const r of this.runners) {
        r.prevD = r.d;
        r.prevX = r.x;
        r.prevY = r.y;
      }
      return;
    }
    this.t += dt;
    const v = speedAt(this.t);
    this.speed = v;
    this.ghostD += v * dt;
    for (const r of this.runners) if (!r.out) this.move(r, v, dt);
    // Leader and the line at the bottom of the screen.
    let lead = Number.NEGATIVE_INFINITY;
    for (const r of this.runners) if (!r.out && r.d > lead) lead = r.d;
    if (this.runners.length === 1) lead = Math.max(lead, this.ghostD);
    if (Number.isFinite(lead)) this.packD = lead;
    for (const r of this.runners) if (!r.out) this.judge(r);
    this.checkOut();
    const level = Math.floor(this.t / this.tuning.fasterEvery);
    if (level > this.fasterLevel) {
      this.fasterLevel = level;
      this.events.push({ type: 'faster', level });
    }
    this.track.ensure(this.packD + AHEAD);
    this.track.prune(this.outLine - BEHIND);
    this.checkEnd();
  }

  private move(r: Runner, v: number, dt: number): void {
    const T = this.tuning;
    r.prevD = r.d;
    r.prevX = r.x;
    r.prevY = r.y;
    // Forward: stumbles crawl, then recover; runners behind the leader catch up a little.
    let k = 1;
    if (r.stumbleT > 0) {
      r.stumbleT = Math.max(0, r.stumbleT - dt);
      const rec = T.stumbleRecover;
      k = r.stumbleT > rec ? T.stumbleSpeed : 1 - (1 - T.stumbleSpeed) * (r.stumbleT / rec);
    }
    if (r.fallT > 0) k = Math.min(k, 0.35);
    const behind = this.packD - r.d;
    if (behind > T.catchFrom) k *= 1 + Math.min(T.catchUp, (behind - T.catchFrom) * 0.015);
    r.speed = v * k;
    r.d += r.speed * dt;
    if (r.safeT > 0) r.safeT = Math.max(0, r.safeT - dt);
    if (r.jumpBuffer > 0) r.jumpBuffer = Math.max(0, r.jumpBuffer - dt);
    // Lane change, then the next waiting one: never more than one lane at a time.
    if (r.laneT < 1) {
      r.laneT = Math.min(1, r.laneT + dt / T.laneTime);
      r.x = r.laneFrom + (r.lane * T.laneW - r.laneFrom) * laneEase(r.laneT);
      if (r.laneT >= 1) {
        r.x = r.lane * T.laneW;
        const next = r.laneQueue.shift();
        // It cannot have started before the one it waited for ended (as judged from the presses).
        if (next) this.startLane(r, r.lane + next.dir, Math.max(next.at, r.laneAt + T.laneTime));
      }
    }
    // Falling into a gap, then climbing out on the far side.
    if (r.fallT > 0) {
      r.vy -= T.gravity * dt;
      r.y += r.vy * dt;
      r.fallT -= dt;
      if (r.fallT <= 0) this.climbOut(r);
      return;
    }
    if (r.climbT > 0) {
      r.climbT = Math.max(0, r.climbT - dt);
      r.y = r.climbT > 0 ? -1.1 * (r.climbT / 0.45) : 0;
      return;
    }
    if (r.slideT > 0) r.slideT = Math.max(0, r.slideT - dt);
    const gap = this.track.gapAt(r.d);
    if (r.air) {
      // A lagged jump runs its arc a little faster until it is where the press put it.
      const extra = r.arcOwed > 0 ? Math.min(r.arcOwed, dt * T.lagCatch) : 0;
      r.arcOwed -= extra;
      const adt = dt + extra;
      r.vy -= jumpGravity(r.vy, T) * adt;
      r.y += r.vy * adt;
      if (r.y <= 0) {
        r.arcOwed = 0;
        if (!gap) {
          r.y = 0;
          r.vy = 0;
          r.air = false;
          this.events.push({ type: 'land', id: r.id });
          if (r.jumpBuffer > 0) this.startJump(r, 0);
          else if (r.slideQueued) {
            r.slideQueued = false;
            r.slideT = T.slideTime;
            this.events.push({ type: 'slide', id: r.id });
          }
        } else if (r.y < -0.3) {
          this.fall(r);
        }
      }
    } else if (gap) {
      r.coyoteT += dt;
    } else {
      r.coyoteT = 0;
    }
  }

  /* ---------------------------------------------------------------- touches */

  /** True when `r` touches `o` right now (a gap: running on air past the coyote time). */
  private touches(r: Runner, o: Obstacle): boolean {
    const T = this.tuning;
    if (o.kind === 'gap') return !r.air && r.coyoteT > T.coyote && Math.abs(r.d - o.d) < o.len / 2 + 0.2;
    if (Math.abs(r.d - o.d) >= o.len / 2 + T.bodyHalf) return false;
    return o.span === 3 || Math.abs(this.judgedX(r) - o.lane * T.laneW) < T.hitHalfW;
  }

  /** True when the runner's current state passes `o`. */
  private clears(r: Runner, o: Obstacle): boolean {
    switch (o.kind) {
      case 'low':
        return r.y >= this.tuning.lowClear;
      case 'high':
        return r.slideT > 0 && r.y < 0.3;
      case 'gap':
        return r.air;
      case 'block':
        return false;
    }
  }

  /** When the move that clears `o` started (run time). */
  private remedyAt(r: Runner, o: Obstacle): number {
    if (o.kind === 'low' || o.kind === 'gap') return r.jumpAt;
    if (o.kind === 'high') return r.slideAt;
    return r.laneAt;
  }

  private judge(r: Runner): void {
    if (r.fallT > 0 || r.climbT > 0) return;
    const T = this.tuning;
    const grace = r.cpu || r.takeover ? 0 : T.hitGrace;
    // A touch waiting for a late move: forgiven when the right move started no later than just
    // after the touch and the runner is now clear of it.
    const p = r.pending;
    if (p) {
      const by = r.pendingAt + T.lateOk;
      const sidestep =
        p.span === 1 && Math.abs(this.judgedX(r) - p.lane * T.laneW) >= T.hitHalfW && r.laneAt <= by;
      const move = this.clears(r, p) && this.remedyAt(r, p) <= by;
      if (sidestep || move) {
        r.pending = null;
        this.events.push({ type: 'dodge', id: r.id });
      } else if (this.t - r.pendingAt >= grace) {
        r.pending = null;
        this.hit(r, p);
        return;
      }
    }
    const obs = this.track.obstacles;
    for (let i = Math.max(0, lowerBound(obs, r.d - 7)); i < obs.length; i++) {
      const o = obs[i]!;
      if (o.d - o.len / 2 > r.d + 1) break;
      if (o === r.pending || o.id === r.lastHit) continue;
      if (!this.touches(r, o) || this.clears(r, o)) continue;
      if (r.safeT > 0 && o.kind !== 'gap') continue;
      if (grace <= 0) {
        this.hit(r, o);
        return;
      }
      if (!r.pending) {
        r.pending = o;
        r.pendingAt = this.t;
      }
    }
    this.collectCoins(r);
  }

  private hit(r: Runner, o: Obstacle): void {
    r.lastHit = o.id;
    if (o.kind === 'gap') {
      this.fall(r);
      return;
    }
    if (o.kind === 'block') {
      // Bounce off into a free neighbouring lane when there is one, else ghost through it.
      const free = this.freeLaneBeside(r, o);
      r.laneQueue.length = 0;
      if (free !== null) this.startLane(r, free, this.t);
    }
    if (r.air && r.vy > 0) r.vy = 0;
    r.slideT = 0;
    r.slideQueued = false;
    this.stumble(r, o.kind);
  }

  private freeLaneBeside(r: Runner, o: Obstacle): number | null {
    const obs = this.track.obstacles;
    const blocked = new Set<number>();
    for (let i = Math.max(0, lowerBound(obs, o.d - 7)); i < obs.length; i++) {
      const q = obs[i]!;
      if (q.d - q.len / 2 > o.d + o.len / 2 + 1) break;
      if (q.kind === 'block' && q.span === 1 && Math.abs(q.d - o.d) < (q.len + o.len) / 2 + 1)
        blocked.add(q.lane);
    }
    const order = r.x < o.lane * this.tuning.laneW ? [o.lane - 1, o.lane + 1] : [o.lane + 1, o.lane - 1];
    for (const l of order) if (l >= -1 && l <= 1 && !blocked.has(l)) return l;
    return null;
  }

  private stumble(r: Runner, kind: ObstacleKind): void {
    const T = this.tuning;
    r.stumbleT = T.stumbleSlow + T.stumbleRecover;
    r.stumbleKind = kind;
    r.safeT = T.safeTime;
    r.stumbles++;
    this.events.push({ type: 'stumble', id: r.id, kind });
  }

  private fall(r: Runner): void {
    r.pending = null;
    r.arcOwed = 0;
    r.laneQueue.length = 0;
    r.air = false;
    r.slideT = 0;
    r.slideQueued = false;
    r.vy = Math.min(r.vy, -1);
    r.fallT = 0.35;
    this.events.push({ type: 'fall', id: r.id });
  }

  private climbOut(r: Runner): void {
    const gap = this.track.gapAt(r.d) ?? this.lastGapBefore(r.d);
    if (gap) r.d = Math.max(r.d, gap.d + gap.len / 2 + 0.35);
    r.prevD = r.d;
    r.fallT = 0;
    r.climbT = 0.45;
    r.y = -1.1;
    r.prevY = r.y;
    r.vy = 0;
    r.coyoteT = 0;
    this.stumble(r, 'gap');
  }

  private lastGapBefore(d: number): Obstacle | null {
    const obs = this.track.obstacles;
    for (let i = Math.min(obs.length, lowerBound(obs, d + 8)) - 1; i >= 0; i--) {
      const o = obs[i]!;
      if (o.kind === 'gap' && o.d - o.len / 2 <= d) return o;
      if (o.d < d - 20) break;
    }
    return null;
  }

  private collectCoins(r: Runner): void {
    const coins = this.track.coins;
    const W = this.tuning.laneW;
    const mid = r.y + (r.slideT > 0 ? 0.45 : 0.85);
    for (let i = Math.max(0, lowerBound(coins, r.d - 0.8)); i < coins.length; i++) {
      const c = coins[i]!;
      if (c.d > r.d + 0.8) break;
      if (c.taken) continue;
      if (Math.abs(c.lane * W - r.x) < 0.9 && Math.abs(c.y - mid) < 0.95) {
        c.taken = true;
        r.coins++;
        this.events.push({ type: 'coin', id: r.id, coin: c.id, lane: c.lane, d: c.d, y: c.y });
      }
    }
  }

  /* ---------------------------------------------------------------- out and end */

  private checkOut(): void {
    const line = this.outLine;
    if (this.mode === 'sprint') {
      for (const r of this.runners) {
        if (r.d < line) {
          r.d = line;
          r.prevD = Math.max(r.prevD, line - r.speed / 60);
        }
      }
      return;
    }
    const behind = this.behind;
    behind.length = 0;
    for (const r of this.runners) if (!r.out && r.d < line) behind.push(r);
    if (behind.length === 0) return;
    // Furthest behind drops out first (and takes the worse place).
    behind.sort(byDistance);
    let alive = this.alive;
    for (const r of behind) {
      // The last one standing never drops out: the run ends on the same step.
      if (this.runners.length > 1 && alive <= 1) break;
      r.out = true;
      r.outT = this.t;
      r.place = alive;
      r.pending = null;
      alive--;
      this.events.push({ type: 'out', id: r.id, place: r.place });
    }
  }

  private checkEnd(): void {
    if (this.phase !== 'run') return;
    let done = false;
    if (this.mode === 'sprint') done = this.t >= this.tuning.sprintSeconds;
    else {
      let alive = 0;
      let people = 0;
      let peopleIn = 0;
      let cpus = 0;
      for (const r of this.runners) {
        if (!r.out) alive++;
        if (r.cpu) cpus++;
        else {
          people++;
          if (!r.out) peopleIn++;
        }
      }
      const last = this.runners.length > 1 ? 1 : 0;
      done = alive <= last || (people > 0 && peopleIn === 0 && cpus > 0);
    }
    if (!done) return;
    this.phase = 'done';
    if (this.mode === 'sprint') {
      this.standings().forEach((r, i) => {
        r.place = i + 1;
      });
    } else {
      // Still running at the end: ranked by distance, ahead of everyone who dropped out.
      const running = this.runners.filter((r) => !r.out).sort((a, b) => b.d - a.d);
      running.forEach((r, i) => {
        r.place = i + 1;
      });
    }
    this.events.push({ type: 'finish' });
  }
}
