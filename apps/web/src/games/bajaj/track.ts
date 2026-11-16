/**
 * A closed circuit as pure geometry: a centerline built from straights and arcs, resampled to ~1 m
 * steps with tangents, curvature, elevation and wall distances. Shared by the simulation
 * (projection, laps, AI) and the renderer (road mesh, scenery placement). No three.js here.
 * The three circuits themselves are defined in tracks.ts.
 *
 * World axes: x east, z south, y up. A kart heading `h` faces (sin h, cos h); its right side is
 * (-cos h, sin h). Track lateral offsets are signed: positive = right of the driving direction.
 */
import type { CircuitId } from './maps/types';

export type Segment = { kind: 'straight'; len: number } | { kind: 'arc'; radius: number; deg: number };

export const S = (len: number): Segment => ({ kind: 'straight', len });
/** Positive degrees turn right (clockwise seen from above with z pointing south). */
export const A = (radius: number, deg: number): Segment => ({ kind: 'arc', radius, deg });

export const ROAD_HALF = 8;
export const CURB_W = 0.9;
/** Default distance from the centerline to the barrier (road + curb + verge). */
export const WALL_DEFAULT = 12.5;
/** Bridges, piers, flyovers and tunnels. */
export const WALL_NARROW = 9.3;
export const WALL_FLYOVER = WALL_NARROW;
/** Inner side of the roundabout: the island kerb. */
export const WALL_ISLAND = 10.2;
export const FLYOVER_HEIGHT = 7.5;

export interface Zone {
  s0: number;
  s1: number;
}

/** Arc-length landmarks the scenery builders use. Optional ones belong to one circuit. */
export interface Landmarks {
  itemRows: number[];
  startStraight: Zone;
  /** Lingkar Kota: ramp up s0..top0, deck top0..top1, ramp down top1..s1. */
  flyover?: { s0: number; top0: number; top1: number; s1: number; crossX: number; z: number };
  roundabout?: { s0: number; s1: number; cx: number; cz: number; radius: number };
  market?: Zone;
  /** Pesisir Pantai: the boardwalk over the sea and the humpback bridge. */
  pier?: Zone;
  bridge?: { s0: number; top: number; s1: number };
  lighthouse?: { x: number; z: number };
  /** Jalur Puncak: tunnel through the ridge, the lookout, hairpin apexes. */
  tunnel?: Zone;
  viewpoint?: { s: number; side: -1 | 1 };
  hairpins?: number[];
}

export interface TrackDef {
  id: CircuitId;
  segments: readonly Segment[];
  /** Landmarks from the segment start table (`at(i)` = arc length where segment i starts). */
  marks(at: (i: number) => number, length: number, geo: TrackGeometry): Landmarks;
  /** Road height (m) at arc length s. */
  height(s: number, marks: Landmarks, length: number): number;
  /** Wall distances [left, right] at s. */
  walls(s: number, marks: Landmarks, y: number, length: number): [number, number];
}

/** The read-only sample arrays a definition may use while computing its landmarks. */
export interface TrackGeometry {
  x: Float32Array;
  z: Float32Array;
  tx: Float32Array;
  tz: Float32Array;
  step: number;
  n: number;
}

export interface Projection {
  /** Sample index of the segment start. */
  i: number;
  /** Arc length along the track, [0, length). */
  s: number;
  /** Signed lateral offset, + = right. */
  d: number;
  /** Ground height at that spot. */
  y: number;
  /** Squared distance to the centerline. */
  dist2: number;
}

export const smooth = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

export class Track {
  readonly length: number;
  readonly n: number;
  readonly step: number;
  readonly x: Float32Array;
  readonly z: Float32Array;
  readonly tx: Float32Array;
  readonly tz: Float32Array;
  readonly y: Float32Array;
  /** Signed curvature (1/m), + = turning right. */
  readonly curv: Float32Array;
  readonly wallL: Float32Array;
  readonly wallR: Float32Array;
  readonly marks: Landmarks;
  readonly id: CircuitId;
  /** Arc length where each segment starts. */
  readonly segStart: number[];
  /** Bounding box of the centerline. */
  readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number };

  constructor(readonly def: TrackDef) {
    const segments = def.segments;
    this.id = def.id;
    // 1. Walk the segments densely.
    const px: number[] = [];
    const pz: number[] = [];
    const pk: number[] = [];
    const segStart: number[] = [];
    let x = 0;
    let z = 0;
    let phi = 0;
    let len = 0;
    const DENSE = 0.25;
    px.push(0);
    pz.push(0);
    pk.push(0);
    for (const seg of segments) {
      segStart.push(len);
      if (seg.kind === 'straight') {
        const n = Math.max(1, Math.round(seg.len / DENSE));
        for (let k = 1; k <= n; k++) {
          px.push(x + (Math.cos(phi) * (seg.len * k)) / n);
          pz.push(z + (Math.sin(phi) * (seg.len * k)) / n);
          pk.push(0);
        }
        x += Math.cos(phi) * seg.len;
        z += Math.sin(phi) * seg.len;
        len += seg.len;
      } else {
        const a = (seg.deg * Math.PI) / 180;
        const sign = Math.sign(a);
        const cx = x - Math.sin(phi) * seg.radius * sign;
        const cz = z + Math.cos(phi) * seg.radius * sign;
        const a0 = Math.atan2(z - cz, x - cx);
        const arcLen = Math.abs(a) * seg.radius;
        const n = Math.max(2, Math.round(arcLen / DENSE));
        for (let k = 1; k <= n; k++) {
          const ang = a0 + (a * k) / n;
          px.push(cx + Math.cos(ang) * seg.radius);
          pz.push(cz + Math.sin(ang) * seg.radius);
          pk.push(sign / seg.radius);
        }
        x = cx + Math.cos(a0 + a) * seg.radius;
        z = cz + Math.sin(a0 + a) * seg.radius;
        phi += a;
        len += arcLen;
      }
    }
    // Spread the (tiny) closure error over the loop so the end meets the start exactly.
    const ex = px[px.length - 1]!;
    const ez = pz[pz.length - 1]!;
    const dense = px.length - 1;
    for (let k = 0; k <= dense; k++) {
      px[k]! -= (ex * k) / dense;
      pz[k]! -= (ez * k) / dense;
    }
    // Cumulative arc length of the dense polyline.
    const cum = new Float64Array(dense + 1);
    for (let k = 1; k <= dense; k++) {
      cum[k] = cum[k - 1]! + Math.hypot(px[k]! - px[k - 1]!, pz[k]! - pz[k - 1]!);
    }
    const total = cum[dense]!;

    // 2. Resample at uniform ~1 m spacing.
    this.n = Math.round(total);
    this.length = total;
    this.step = total / this.n;
    const N = this.n;
    this.x = new Float32Array(N);
    this.z = new Float32Array(N);
    this.tx = new Float32Array(N);
    this.tz = new Float32Array(N);
    this.y = new Float32Array(N);
    this.curv = new Float32Array(N);
    this.wallL = new Float32Array(N);
    this.wallR = new Float32Array(N);
    let k = 0;
    for (let i = 0; i < N; i++) {
      const s = i * this.step;
      while (k < dense - 1 && cum[k + 1]! < s) k++;
      const seg = cum[k + 1]! - cum[k]!;
      const t = seg > 0 ? (s - cum[k]!) / seg : 0;
      this.x[i] = px[k]! + (px[k + 1]! - px[k]!) * t;
      this.z[i] = pz[k]! + (pz[k + 1]! - pz[k]!) * t;
      this.curv[i] = pk[k + 1]!;
    }
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N;
      const b = (i + 1) % N;
      const dx = this.x[b]! - this.x[a]!;
      const dz = this.z[b]! - this.z[a]!;
      const l = Math.hypot(dx, dz) || 1;
      this.tx[i] = dx / l;
      this.tz[i] = dz / l;
    }

    // 3. Landmarks, elevation and walls from the definition.
    this.segStart = segStart;
    this.marks = def.marks((idx) => segStart[idx] ?? total, total, this);
    for (let i = 0; i < N; i++) {
      const s = i * this.step;
      this.y[i] = def.height(s, this.marks, total);
      const [l, r] = def.walls(s, this.marks, this.y[i]!, total);
      this.wallL[i] = l;
      this.wallR[i] = r;
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < N; i++) {
      minX = Math.min(minX, this.x[i]!);
      maxX = Math.max(maxX, this.x[i]!);
      minZ = Math.min(minZ, this.z[i]!);
      maxZ = Math.max(maxZ, this.z[i]!);
    }
    this.bounds = { minX, maxX, minZ, maxZ };
  }

  wrap(s: number): number {
    const L = this.length;
    return ((s % L) + L) % L;
  }

  index(s: number): number {
    return Math.floor(this.wrap(s) / this.step) % this.n;
  }

  /** Signed shortest difference b - a along the loop. */
  delta(a: number, b: number): number {
    const L = this.length;
    let d = (b - a) % L;
    if (d > L / 2) d -= L;
    if (d < -L / 2) d += L;
    return d;
  }

  /** Interpolated frame at arc length s. */
  frame(s: number, out: TrackFrame = { x: 0, z: 0, tx: 0, tz: 0, y: 0, curv: 0 }): TrackFrame {
    const w = this.wrap(s) / this.step;
    const i = Math.floor(w) % this.n;
    const j = (i + 1) % this.n;
    const t = w - Math.floor(w);
    out.x = this.x[i]! + (this.x[j]! - this.x[i]!) * t;
    out.z = this.z[i]! + (this.z[j]! - this.z[i]!) * t;
    const tx = this.tx[i]! + (this.tx[j]! - this.tx[i]!) * t;
    const tz = this.tz[i]! + (this.tz[j]! - this.tz[i]!) * t;
    const l = Math.hypot(tx, tz) || 1;
    out.tx = tx / l;
    out.tz = tz / l;
    out.y = this.y[i]! + (this.y[j]! - this.y[i]!) * t;
    out.curv = this.curv[i]!;
    return out;
  }

  /** World point at arc length s, offset d to the right. */
  point(s: number, d: number): { x: number; z: number; y: number } {
    const f = this.frame(s);
    return { x: f.x - f.tz * d, z: f.z + f.tx * d, y: f.y };
  }

  heightAt(s: number): number {
    return this.frame(s).y;
  }

  /** Heading (kart convention) of the driving direction at s. */
  headingAt(s: number): number {
    const f = this.frame(s);
    return Math.atan2(f.tx, f.tz);
  }

  /** Nearest centerline point, searching `window` samples either side of `hint`. */
  project(x: number, z: number, hint: number, window = 24): Projection {
    const N = this.n;
    let best = Infinity;
    let bi = 0;
    let bt = 0;
    for (let o = -window; o <= window; o++) {
      const i = (((hint + o) % N) + N) % N;
      const j = (i + 1) % N;
      const ax = this.x[i]!;
      const az = this.z[i]!;
      const sx = this.x[j]! - ax;
      const sz = this.z[j]! - az;
      const l2 = sx * sx + sz * sz || 1;
      let t = ((x - ax) * sx + (z - az) * sz) / l2;
      t = t < 0 ? 0 : Math.min(t, 1);
      const qx = ax + sx * t - x;
      const qz = az + sz * t - z;
      const d2 = qx * qx + qz * qz;
      if (d2 < best) {
        best = d2;
        bi = i;
        bt = t;
      }
    }
    return this.finishProjection(x, z, bi, bt, best);
  }

  /** Global nearest point (slow; for setup and recovery). */
  projectGlobal(x: number, z: number): Projection {
    let best = Infinity;
    let bi = 0;
    for (let i = 0; i < this.n; i++) {
      const dx = this.x[i]! - x;
      const dz = this.z[i]! - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < best) {
        best = d2;
        bi = i;
      }
    }
    return this.project(x, z, bi, 3);
  }

  private finishProjection(x: number, z: number, i: number, t: number, dist2: number): Projection {
    const j = (i + 1) % this.n;
    const cx = this.x[i]! + (this.x[j]! - this.x[i]!) * t;
    const cz = this.z[i]! + (this.z[j]! - this.z[i]!) * t;
    const tx = this.tx[i]! + (this.tx[j]! - this.tx[i]!) * t;
    const tz = this.tz[i]! + (this.tz[j]! - this.tz[i]!) * t;
    // right = (-tz, tx)
    const d = (x - cx) * -tz + (z - cz) * tx;
    const y = this.y[i]! + (this.y[j]! - this.y[i]!) * t;
    return { i, s: this.wrap((i + t) * this.step), d, y, dist2 };
  }

  /** Total heading change (radians, + = right) over the next `ahead` metres. */
  turnAhead(s: number, ahead: number): number {
    let sum = 0;
    const steps = Math.max(1, Math.round(ahead / this.step));
    let i = this.index(s);
    for (let k = 0; k < steps; k++) {
      sum += this.curv[i]! * this.step;
      i = (i + 1) % this.n;
    }
    return sum;
  }
}

export interface TrackFrame {
  x: number;
  z: number;
  tx: number;
  tz: number;
  y: number;
  curv: number;
}
