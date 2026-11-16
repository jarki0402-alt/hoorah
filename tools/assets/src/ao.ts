/**
 * Offline ambient occlusion: a bounding volume hierarchy over the triangles, and per-vertex
 * cosine-weighted hemisphere rays. The result goes to the 4th surface channel of each vertex
 * (multiplied in, so several passes with different occluders combine). Shaders apply it to
 * ambient light, which gives props their contact shading and crevices without real-time cost.
 */

import type { Mesh } from './mesh';
import { hash3 } from './noise';

export class Bvh {
  private readonly tri: Float64Array;
  private readonly order: Int32Array;
  private readonly bounds: number[] = [];
  /** Per node: left child (or -1 for a leaf), right child or first triangle, triangle count. */
  private readonly node: number[] = [];
  readonly triangleCount: number;

  constructor(pos: ArrayLike<number>, idx: ArrayLike<number>) {
    const T = idx.length / 3;
    this.triangleCount = T;
    this.tri = new Float64Array(T * 9);
    for (let t = 0; t < T; t++)
      for (let k = 0; k < 3; k++) {
        const v = idx[t * 3 + k]!;
        this.tri[t * 9 + k * 3] = pos[v * 3]!;
        this.tri[t * 9 + k * 3 + 1] = pos[v * 3 + 1]!;
        this.tri[t * 9 + k * 3 + 2] = pos[v * 3 + 2]!;
      }
    this.order = new Int32Array(T);
    for (let t = 0; t < T; t++) this.order[t] = t;
    const cent = new Float64Array(T * 3);
    for (let t = 0; t < T; t++)
      for (let k = 0; k < 3; k++)
        cent[t * 3 + k] = (this.tri[t * 9 + k]! + this.tri[t * 9 + 3 + k]! + this.tri[t * 9 + 6 + k]!) / 3;
    if (T > 0) this.build(0, T, cent);
  }

  private build(start: number, end: number, cent: Float64Array): number {
    const id = this.node.length / 3;
    this.node.push(-1, start, end - start);
    let mnx = Infinity;
    let mny = Infinity;
    let mnz = Infinity;
    let mxx = -Infinity;
    let mxy = -Infinity;
    let mxz = -Infinity;
    for (let i = start; i < end; i++) {
      const t = this.order[i]!;
      for (let k = 0; k < 3; k++) {
        const x = this.tri[t * 9 + k * 3]!;
        const y = this.tri[t * 9 + k * 3 + 1]!;
        const z = this.tri[t * 9 + k * 3 + 2]!;
        if (x < mnx) mnx = x;
        if (y < mny) mny = y;
        if (z < mnz) mnz = z;
        if (x > mxx) mxx = x;
        if (y > mxy) mxy = y;
        if (z > mxz) mxz = z;
      }
    }
    this.bounds.push(mnx, mny, mnz, mxx, mxy, mxz);
    if (end - start <= 4) return id;
    const ex = mxx - mnx;
    const ey = mxy - mny;
    const ez = mxz - mnz;
    const axis = ex >= ey && ex >= ez ? 0 : ey >= ez ? 1 : 2;
    const sub = Array.from(this.order.subarray(start, end));
    sub.sort((p, q) => cent[p * 3 + axis]! - cent[q * 3 + axis]!);
    this.order.set(sub, start);
    const mid = (start + end) >> 1;
    const left = this.build(start, mid, cent);
    const right = this.build(mid, end, cent);
    this.node[id * 3] = left;
    this.node[id * 3 + 1] = right;
    this.node[id * 3 + 2] = 0;
    return id;
  }

  /** Distance to the nearest hit along a unit ray, or Infinity. */
  cast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, tMax: number): number {
    if (this.triangleCount === 0) return Number.POSITIVE_INFINITY;
    const ix = 1 / (dx || 1e-12);
    const iy = 1 / (dy || 1e-12);
    const iz = 1 / (dz || 1e-12);
    let best = tMax;
    const stack: number[] = [0];
    const B = this.bounds;
    const tri = this.tri;
    while (stack.length > 0) {
      const n = stack.pop()!;
      const b = n * 6;
      let t0 = (B[b]! - ox) * ix;
      let t1 = (B[b + 3]! - ox) * ix;
      let tmin = Math.min(t0, t1);
      let tmax = Math.max(t0, t1);
      t0 = (B[b + 1]! - oy) * iy;
      t1 = (B[b + 4]! - oy) * iy;
      tmin = Math.max(tmin, Math.min(t0, t1));
      tmax = Math.min(tmax, Math.max(t0, t1));
      t0 = (B[b + 2]! - oz) * iz;
      t1 = (B[b + 5]! - oz) * iz;
      tmin = Math.max(tmin, Math.min(t0, t1));
      tmax = Math.min(tmax, Math.max(t0, t1));
      if (tmax < Math.max(tmin, 0) || tmin > best) continue;
      const left = this.node[n * 3]!;
      if (left >= 0) {
        stack.push(left, this.node[n * 3 + 1]!);
        continue;
      }
      const s = this.node[n * 3 + 1]!;
      const c = this.node[n * 3 + 2]!;
      for (let i = s; i < s + c; i++) {
        const o = this.order[i]! * 9;
        const e1x = tri[o + 3]! - tri[o]!;
        const e1y = tri[o + 4]! - tri[o + 1]!;
        const e1z = tri[o + 5]! - tri[o + 2]!;
        const e2x = tri[o + 6]! - tri[o]!;
        const e2y = tri[o + 7]! - tri[o + 1]!;
        const e2z = tri[o + 8]! - tri[o + 2]!;
        const px = dy * e2z - dz * e2y;
        const py = dz * e2x - dx * e2z;
        const pz = dx * e2y - dy * e2x;
        const det = e1x * px + e1y * py + e1z * pz;
        if (Math.abs(det) < 1e-14) continue;
        const inv = 1 / det;
        const tx = ox - tri[o]!;
        const ty = oy - tri[o + 1]!;
        const tz = oz - tri[o + 2]!;
        const u = (tx * px + ty * py + tz * pz) * inv;
        if (u < 0 || u > 1) continue;
        const qx = ty * e1z - tz * e1y;
        const qy = tz * e1x - tx * e1z;
        const qz = tx * e1y - ty * e1x;
        const v = (dx * qx + dy * qy + dz * qz) * inv;
        if (v < 0 || u + v > 1) continue;
        const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
        if (t > 1e-6 && t < best) best = t;
      }
    }
    return best;
  }
}

export interface AoOptions {
  /** Rays per vertex (default 48). */
  rays?: number;
  /** Occluders farther than this do not count (m). */
  distance?: number;
  /** 0..1, how dark full occlusion gets (default 0.85). */
  strength?: number;
  /** Height of a ground plane the object stands on, or null for none. */
  ground?: number | null;
  /** Extra geometry that occludes but is not shaded (neighbouring parts). */
  occluders?: Mesh[];
}

/** Bake ambient occlusion into `m.surf[*][3]` (multiplies what is there). */
export function bakeAo(m: Mesh, opts: AoOptions = {}): void {
  const rays = opts.rays ?? 48;
  const dist = opts.distance ?? 0.6;
  const strength = opts.strength ?? 0.85;
  const ground = opts.ground ?? null;
  let pos: number[] = m.pos;
  let idx: number[] = m.idx;
  if (opts.occluders && opts.occluders.length > 0) {
    pos = m.pos.slice();
    idx = m.idx.slice();
    for (const o of opts.occluders) {
      const base = pos.length / 3;
      for (const v of o.pos) pos.push(v);
      for (const i of o.idx) idx.push(i + base);
    }
  }
  const bvh = new Bvh(pos, idx);
  const bias = dist * 0.004 + 1e-4;
  for (let i = 0; i < m.vertexCount; i++) {
    const px = m.pos[i * 3]!;
    const py = m.pos[i * 3 + 1]!;
    const pz = m.pos[i * 3 + 2]!;
    const nx = m.nor[i * 3]!;
    const ny = m.nor[i * 3 + 1]!;
    const nz = m.nor[i * 3 + 2]!;
    // Tangent frame
    const ax = Math.abs(nx) < 0.9 ? 1 : 0;
    const ay = ax ? 0 : 1;
    let tx = ay * nz;
    let ty = -ax * nz;
    let tz = ax * ny - ay * nx;
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl;
    ty /= tl;
    tz /= tl;
    const bx = ny * tz - nz * ty;
    const by = nz * tx - nx * tz;
    const bz = nx * ty - ny * tx;
    const ox = px + nx * bias;
    const oy = py + ny * bias;
    const oz = pz + nz * bias;
    const rot = hash3(Math.round(px * 1e4), Math.round(py * 1e4), Math.round(pz * 1e4), 7);
    let occ = 0;
    for (let k = 0; k < rays; k++) {
      const u1 = (k + 0.5) / rays;
      let bits = k;
      let u2 = 0;
      let f = 0.5;
      while (bits > 0) {
        if (bits & 1) u2 += f;
        bits >>= 1;
        f *= 0.5;
      }
      const r = Math.sqrt(u1);
      const phi = (u2 + rot) * Math.PI * 2;
      const lx = r * Math.cos(phi);
      const ly = r * Math.sin(phi);
      const lz = Math.sqrt(Math.max(0, 1 - u1));
      const dx = tx * lx + bx * ly + nx * lz;
      const dy = ty * lx + by * ly + ny * lz;
      const dz = tz * lx + bz * ly + nz * lz;
      let t = bvh.cast(ox, oy, oz, dx, dy, dz, dist);
      if (ground !== null && dy < -1e-6) {
        const tg = (ground - oy) / dy;
        if (tg > 0 && tg < t) t = tg;
      }
      if (t < dist) {
        const s = 1 - t / dist;
        occ += s * s;
      }
    }
    const ao = 1 - strength * (occ / rays);
    m.surf[i * 4 + 3] = m.surf[i * 4 + 3]! * Math.max(0, Math.min(1, ao));
  }
}
