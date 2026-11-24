/**
 * Long-distance play, far-away main screen: the stage the scene draws, rebuilt from the Host's
 * packets (mirror.ts). Pure (no DOM, no Phaser, no SDK), so tests can check it against the match.
 *
 * - `RemoteTrail` keeps every trail point a snake ever laid, by number. Points never move once
 *   laid, so they are stored as soon as a packet brings them, even ahead of the playback point.
 * - `sampleTrail` draws a body along those points exactly like `ArenaMatch.sampleBody`, from the
 *   head's distance travelled; a point that never arrived is bridged by its known neighbours.
 * - `RemotePellets` is the seed pool: numbered changes in order, full bands on top.
 * - `RemoteStage` is the scene's model: arena, seeds and snakes at the playback point.
 */
import type { FxSnake } from './effects';
import { DEFAULT_TUNING, PELLET_AMBIENT, PELLET_DROP, PELLET_FREE, Pellets } from './logic';
import {
  type MirrorSnake,
  type MirrorState,
  PELLET_BAND,
  PELLET_CAP,
  type PelletSeed,
  type Points,
  poseAt,
  type SnakePose,
  type Span,
} from './mirror';
import type { StageModel, StagePellets, StageSnake } from './scene';

/** Trail points kept per snake (longer than the longest body). */
const RING = 4096;
const MASK = RING - 1;
const D = DEFAULT_TUNING.spacing;
/** A seed first seen in a band is shown fully grown (no pop): born this long ago. */
const SETTLED_MS = 1000;

/* ------------------------------------------------------------------ trails */

export class RemoteTrail {
  readonly xs = new Float32Array(RING);
  readonly ys = new Float32Array(RING);
  /** Number of the point held in each ring slot, -1: none. */
  readonly ser = new Float64Array(RING).fill(-1);
  newest = -1;

  put(p: Points): void {
    for (let k = 0; k < p.xs.length; k++) {
      const serial = p.top - k;
      if (serial < 0) break;
      const i = serial & MASK;
      this.xs[i] = p.xs[k]!;
      this.ys[i] = p.ys[k]!;
      this.ser[i] = serial;
      if (serial > this.newest) this.newest = serial;
    }
  }

  has(serial: number): boolean {
    return serial >= 0 && this.ser[serial & MASK] === serial;
  }

  /** Known points among numbers `from..to` (tests and diagnostics). */
  count(from: number, to: number): number {
    let n = 0;
    for (let s = from; s <= to; s++) if (this.has(s)) n++;
    return n;
  }
}

/**
 * Body samples for drawing, head first: x, y pairs every `step` units of length plus the tail end,
 * like `ArenaMatch.sampleBody`. `odo` is the head's distance travelled (newest point number *
 * spacing + gap). Returns the number of samples written; the body stops early where no older point
 * is known yet.
 */
export function sampleTrail(
  tr: RemoteTrail,
  hx: number,
  hy: number,
  odo: number,
  bodyLen: number,
  step: number,
  out: Float32Array,
): number {
  const max = out.length >> 1;
  if (max < 1) return 0;
  out[0] = hx;
  out[1] = hy;
  const headU = odo / D;
  const floor = Math.floor(headU) - RING;
  let lo = Math.min(Math.floor(headU), tr.newest);
  while (lo > floor && !tr.has(lo)) lo--;
  if (lo <= floor || bodyLen <= 0) return 1;
  // The stretch being sampled: from (aU, ax, ay) down to known point `lo`.
  let aU = headU;
  let ax = hx;
  let ay = hy;
  let bx = tr.xs[lo & MASK]!;
  let by = tr.ys[lo & MASK]!;
  let c = 1;
  const put = (u: number): boolean => {
    while (u < lo) {
      let next = lo - 1;
      while (next > floor && !tr.has(next)) next--;
      if (next <= floor) return false;
      aU = lo;
      ax = bx;
      ay = by;
      lo = next;
      bx = tr.xs[lo & MASK]!;
      by = tr.ys[lo & MASK]!;
    }
    const f = aU > lo ? (aU - u) / (aU - lo) : 0;
    out[c * 2] = ax + (bx - ax) * f;
    out[c * 2 + 1] = ay + (by - ay) * f;
    c++;
    return true;
  };
  for (let k = step; k < bodyLen && c < max - 1; k += step) if (!put(headU - k)) return c;
  if (c < max) put(headU - bodyLen);
  return c;
}

/* ------------------------------------------------------------------ seeds */

/** A seed eaten on the Host, to replay its sparks and the head's bite. */
export interface EatFx {
  id: number;
  x: number;
  y: number;
  value: number;
  color: number;
}

export class RemotePellets implements StagePellets {
  readonly x = new Float32Array(PELLET_CAP);
  readonly y = new Float32Array(PELLET_CAP);
  readonly r = new Float32Array(PELLET_CAP);
  readonly value = new Uint8Array(PELLET_CAP);
  readonly kind = new Uint8Array(PELLET_CAP);
  readonly color = new Uint32Array(PELLET_CAP);
  readonly born = new Float64Array(PELLET_CAP);
  readonly expires = new Float64Array(PELLET_CAP);
  readonly gen = new Uint32Array(PELLET_CAP);
  span = 0;
  /** Highest change applied (or covered by a band), -1 before the first packet of a match. */
  have = -1;
  /** Changes that never arrived (the bands healed them). */
  missed = 0;
  /** Server time of the newest packet applied. */
  private lastT = Number.NEGATIVE_INFINITY;

  clear(): void {
    this.kind.fill(PELLET_FREE);
    this.have = -1;
    this.lastT = Number.NEGATIVE_INFINITY;
  }

  get active(): number {
    let n = 0;
    for (let i = 0; i < this.span; i++) if (this.kind[i] !== PELLET_FREE) n++;
    return n;
  }

  private set(seed: PelletSeed, now: number, pop: boolean): void {
    const i = seed.slot;
    const expires = seed.life > 0 ? now + seed.life : Number.POSITIVE_INFINITY;
    if (
      !pop &&
      this.kind[i] !== PELLET_FREE &&
      this.x[i] === seed.x &&
      this.y[i] === seed.y &&
      this.value[i] === seed.value &&
      this.color[i] === seed.color
    ) {
      this.expires[i] = expires;
      return;
    }
    this.x[i] = seed.x;
    this.y[i] = seed.y;
    this.value[i] = seed.value;
    this.r[i] = Pellets.radiusOf(seed.value);
    this.kind[i] = seed.life > 0 ? PELLET_DROP : PELLET_AMBIENT;
    this.color[i] = seed.color;
    this.born[i] = pop ? now : now - SETTLED_MS;
    this.expires[i] = expires;
    this.gen[i] = (this.gen[i]! + 1) >>> 0;
    if (i >= this.span) this.span = i + 1;
  }

  /** Applies a packet's changes and bands at stage time `now`; returns the seeds eaten meanwhile. */
  apply(s: MirrorState, now: number): EatFx[] {
    const eaten: EatFx[] = [];
    // A packet older than one already applied would bring back seeds eaten since.
    if (s.t < this.lastT) return eaten;
    this.lastT = s.t;
    const live = this.have >= 0;
    for (const d of s.deltas) {
      if (d.n <= this.have) continue;
      if (live && d.n > this.have + 1) this.missed += d.n - this.have - 1;
      this.have = d.n;
      for (const op of d.ops) {
        if (op.add) {
          this.set(op.seed, now, live);
          continue;
        }
        const i = op.slot;
        if (this.kind[i] === PELLET_FREE) continue;
        if (live && op.eater !== null) {
          eaten.push({
            id: op.eater,
            x: this.x[i]!,
            y: this.y[i]!,
            value: this.value[i]!,
            color: this.color[i]!,
          });
        }
        this.kind[i] = PELLET_FREE;
      }
    }
    if (this.have >= 0 && s.seq > this.have) this.missed += s.seq - this.have;
    // The bands show the pool at `seq`: an older change arriving later must not undo them.
    this.have = Math.max(this.have, s.seq);
    for (const b of s.bands) {
      const from = b.index * PELLET_BAND;
      const to = Math.min(PELLET_CAP, from + PELLET_BAND);
      let k = 0;
      for (let i = from; i < to; i++) {
        const seed = b.seeds[k];
        if (seed && seed.slot === i) {
          this.set(seed, now, false);
          k++;
        } else {
          this.kind[i] = PELLET_FREE;
        }
      }
    }
    return eaten;
  }
}

/* ------------------------------------------------------------------ snakes and stage */

export class RemoteSnake implements StageSnake, FxSnake {
  name = '';
  look: MirrorSnake['look'] = { c: 'leo' };
  color = '#C4C7CC';
  colorNum = 0xc4c7cc;
  alive = false;
  inMatch = true;
  gone = false;
  x = 0;
  y = 0;
  angle = 0;
  steer = 0;
  boosting = false;
  radius = DEFAULT_TUNING.radius;
  bodyLen = 0;
  /** Head's distance travelled along its trail (world units). */
  odo = 0;
  safe = false;

  constructor(readonly id: number) {}
}

export class RemoteStage implements StageModel {
  /** Stage time (server ms of the Host state shown). */
  now = 0;
  width = 0;
  height = 0;
  corner = 0;
  epoch = -1;
  readonly pellets = new RemotePellets();
  private readonly list: RemoteSnake[] = [];
  private readonly byId = new Map<number, RemoteSnake>();
  private readonly trails = new Map<number, RemoteTrail>();
  private readonly pose: SnakePose = { x: 0, y: 0, angle: 0, steer: 0, odo: 0, bodyLen: 0, radius: 0 };

  get all(): readonly RemoteSnake[] {
    return this.list;
  }

  snake(id: number): RemoteSnake | undefined {
    return this.byId.get(id);
  }

  trail(id: number): RemoteTrail | undefined {
    return this.trails.get(id);
  }

  sampleBody(s: StageSnake, step: number, out: Float32Array): number {
    const r = this.byId.get(s.id);
    const tr = this.trails.get(s.id);
    if (!r?.alive || !tr) return 0;
    return sampleTrail(tr, r.x, r.y, r.odo, r.bodyLen, step, out);
  }

  isProtected(s: StageSnake): boolean {
    return s.alive && (this.byId.get(s.id)?.safe ?? false);
  }

  /**
   * A packet arrived: keep its trail points right away. True when it belongs to a new match from
   * the Host (everything was cleared).
   */
  receive(s: MirrorState): boolean {
    const fresh = s.epoch !== this.epoch;
    if (fresh) {
      this.epoch = s.epoch;
      this.trails.clear();
      this.pellets.clear();
      for (const r of this.list) {
        r.gone = true;
        r.alive = false;
      }
    }
    for (const r of s.snakes) if (r.alive) this.trailOf(r.id).put(r.recent);
    for (const b of s.bodies) this.trailOf(b.id).put(b.points);
    return fresh;
  }

  private trailOf(id: number): RemoteTrail {
    let tr = this.trails.get(id);
    if (!tr) {
      tr = new RemoteTrail();
      this.trails.set(id, tr);
    }
    return tr;
  }

  /** Seeds and arena from a packet the playback point reached; returns the seeds eaten meanwhile. */
  apply(s: MirrorState): ReturnType<RemotePellets['apply']> {
    this.width = s.width;
    this.height = s.height;
    this.corner = s.corner;
    return this.pellets.apply(s, this.now);
  }

  /** Snakes as the Host showed them at the playback point; returns the ones that just started boosting. */
  place(span: Span): number[] {
    const { a, b, k } = span;
    const seen = new Set<number>();
    const boosts: number[] = [];
    for (const src of a.snakes) {
      seen.add(src.id);
      const p = poseAt(
        src,
        b.snakes.find((r) => r.id === src.id),
        k,
        this.pose,
      );
      let view = this.byId.get(src.id);
      if (!view) {
        view = new RemoteSnake(src.id);
        this.byId.set(src.id, view);
        // Append only: the scene gives every snake a layer by its place in this list.
        this.list.push(view);
      }
      view.name = src.name;
      view.look = src.look;
      view.color = src.color;
      view.colorNum = src.colorNum;
      view.alive = src.alive;
      view.inMatch = true;
      view.gone = false;
      if (src.boosting && !view.boosting && view.alive) boosts.push(src.id);
      view.boosting = src.boosting;
      view.safe = src.safe;
      view.x = p.x;
      view.y = p.y;
      view.angle = p.angle;
      view.steer = p.steer;
      view.odo = p.odo;
      view.bodyLen = p.bodyLen;
      view.radius = p.radius;
    }
    for (const view of this.list) {
      if (seen.has(view.id)) continue;
      view.gone = true;
      view.alive = false;
      view.boosting = false;
    }
    return boosts;
  }
}
