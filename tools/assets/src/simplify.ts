/**
 * Mesh decimation by quadric error metrics (Garland and Heckbert): repeatedly collapse the edge
 * whose merged vertex strays least from the original surface planes. Collapses that would flip a
 * triangle or tear the surface (non-manifold) are skipped; open borders are held in place by
 * extra planes. Optional per-vertex weights keep detail where it matters (colour changes, faces).
 */

export interface SimplifyResult {
  pos: number[];
  idx: number[];
  /** For each output vertex, the input vertex it descends from (to copy attributes). */
  source: number[];
}

export interface SimplifyOptions {
  /** Multiplies each input vertex's error (default 1). */
  weights?: ArrayLike<number>;
  /** Strength of the planes that pin open borders (default 50). */
  border?: number;
}

interface Entry {
  cost: number;
  a: number;
  b: number;
  va: number;
  vb: number;
  x: number;
  y: number;
  z: number;
}

class Heap {
  private readonly items: Entry[] = [];
  get size(): number {
    return this.items.length;
  }
  push(e: Entry): void {
    const h = this.items;
    h.push(e);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (h[p]!.cost <= e.cost) break;
      h[i] = h[p]!;
      i = p;
    }
    h[i] = e;
  }
  pop(): Entry | undefined {
    const h = this.items;
    const top = h[0];
    const last = h.pop();
    if (h.length > 0 && last) {
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        let mc = last.cost;
        if (l < h.length && h[l]!.cost < mc) {
          m = l;
          mc = h[l]!.cost;
        }
        if (r < h.length && h[r]!.cost < mc) m = r;
        if (m === i) break;
        h[i] = h[m]!;
        i = m;
      }
      h[i] = last;
    }
    return top;
  }
}

function addPlane(Q: Float64Array, v: number, a: number, b: number, c: number, d: number, w: number): void {
  const o = v * 10;
  Q[o]! += w * a * a;
  Q[o + 1]! += w * a * b;
  Q[o + 2]! += w * a * c;
  Q[o + 3]! += w * a * d;
  Q[o + 4]! += w * b * b;
  Q[o + 5]! += w * b * c;
  Q[o + 6]! += w * b * d;
  Q[o + 7]! += w * c * c;
  Q[o + 8]! += w * c * d;
  Q[o + 9]! += w * d * d;
}

function err(q: Float64Array, x: number, y: number, z: number): number {
  return (
    q[0]! * x * x +
    2 * q[1]! * x * y +
    2 * q[2]! * x * z +
    2 * q[3]! * x +
    q[4]! * y * y +
    2 * q[5]! * y * z +
    2 * q[6]! * y +
    q[7]! * z * z +
    2 * q[8]! * z +
    q[9]!
  );
}

/** Reduce `idx` to at most `targetTris` triangles. Positions are xyz triples. */
export function simplify(
  posIn: readonly number[],
  idxIn: readonly number[],
  targetTris: number,
  opts: SimplifyOptions = {},
): SimplifyResult {
  const V = posIn.length / 3;
  const T = idxIn.length / 3;
  const P = Float64Array.from(posIn);
  const tri = Int32Array.from(idxIn);
  const triAlive = new Uint8Array(T).fill(1);
  const vAlive = new Uint8Array(V).fill(1);
  const ver = new Int32Array(V);
  const vtris: number[][] = Array.from({ length: V }, () => []);
  for (let t = 0; t < T; t++) for (let k = 0; k < 3; k++) vtris[tri[t * 3 + k]!]!.push(t);
  const Q = new Float64Array(V * 10);
  const normal = (t: number, out: Float64Array, movedV = -1, mx = 0, my = 0, mz = 0): number => {
    const ia = tri[t * 3]!;
    const ib = tri[t * 3 + 1]!;
    const ic = tri[t * 3 + 2]!;
    const g = (v: number, k: number) => (v === movedV ? (k === 0 ? mx : k === 1 ? my : mz) : P[v * 3 + k]!);
    const ux = g(ib, 0) - g(ia, 0);
    const uy = g(ib, 1) - g(ia, 1);
    const uz = g(ib, 2) - g(ia, 2);
    const vx = g(ic, 0) - g(ia, 0);
    const vy = g(ic, 1) - g(ia, 1);
    const vz = g(ic, 2) - g(ia, 2);
    out[0] = uy * vz - uz * vy;
    out[1] = uz * vx - ux * vz;
    out[2] = ux * vy - uy * vx;
    const l = Math.hypot(out[0]!, out[1]!, out[2]!);
    if (l > 0) {
      out[0]! /= l;
      out[1]! /= l;
      out[2]! /= l;
    }
    return l / 2;
  };
  const n0 = new Float64Array(3);
  const n1 = new Float64Array(3);
  for (let t = 0; t < T; t++) {
    const area = normal(t, n0);
    const a = tri[t * 3]!;
    const d = -(n0[0]! * P[a * 3]! + n0[1]! * P[a * 3 + 1]! + n0[2]! * P[a * 3 + 2]!);
    for (let k = 0; k < 3; k++) addPlane(Q, tri[t * 3 + k]!, n0[0]!, n0[1]!, n0[2]!, d, area);
  }
  // Pin open borders: a plane through each border edge, perpendicular to its triangle.
  const edgeCount = new Map<string, number[]>();
  for (let t = 0; t < T; t++)
    for (let k = 0; k < 3; k++) {
      const a = tri[t * 3 + k]!;
      const b = tri[t * 3 + ((k + 1) % 3)]!;
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      const list = edgeCount.get(key);
      if (list) list.push(t);
      else edgeCount.set(key, [t]);
    }
  const border = opts.border ?? 50;
  for (const [key, list] of edgeCount) {
    if (list.length !== 1) continue;
    const [sa, sb] = key.split('_');
    const a = Number(sa);
    const b = Number(sb);
    normal(list[0]!, n0);
    const ex = P[b * 3]! - P[a * 3]!;
    const ey = P[b * 3 + 1]! - P[a * 3 + 1]!;
    const ez = P[b * 3 + 2]! - P[a * 3 + 2]!;
    let px = ey * n0[2]! - ez * n0[1]!;
    let py = ez * n0[0]! - ex * n0[2]!;
    let pz = ex * n0[1]! - ey * n0[0]!;
    const l = Math.hypot(px, py, pz) || 1;
    px /= l;
    py /= l;
    pz /= l;
    const d = -(px * P[a * 3]! + py * P[a * 3 + 1]! + pz * P[a * 3 + 2]!);
    const w = border * (ex * ex + ey * ey + ez * ez);
    addPlane(Q, a, px, py, pz, d, w);
    addPlane(Q, b, px, py, pz, d, w);
  }
  if (opts.weights) {
    for (let v = 0; v < V; v++) {
      const w = opts.weights[v] ?? 1;
      for (let k = 0; k < 10; k++) Q[v * 10 + k]! *= w;
    }
  }

  const q = new Float64Array(10);
  const heap = new Heap();
  const pushEdge = (a: number, b: number) => {
    for (let k = 0; k < 10; k++) q[k] = Q[a * 10 + k]! + Q[b * 10 + k]!;
    const ax = P[a * 3]!;
    const ay = P[a * 3 + 1]!;
    const az = P[a * 3 + 2]!;
    const bx = P[b * 3]!;
    const by = P[b * 3 + 1]!;
    const bz = P[b * 3 + 2]!;
    const A00 = q[0]!;
    const A01 = q[1]!;
    const A02 = q[2]!;
    const A11 = q[4]!;
    const A12 = q[5]!;
    const A22 = q[7]!;
    const det = A00 * (A11 * A22 - A12 * A12) - A01 * (A01 * A22 - A12 * A02) + A02 * (A01 * A12 - A11 * A02);
    let best = Number.POSITIVE_INFINITY;
    let x = 0;
    let y = 0;
    let z = 0;
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    if (Math.abs(det) > 1e-15) {
      const b0 = -q[3]!;
      const b1 = -q[6]!;
      const b2 = -q[8]!;
      const sx =
        (b0 * (A11 * A22 - A12 * A12) - A01 * (b1 * A22 - A12 * b2) + A02 * (b1 * A12 - A11 * b2)) / det;
      const sy =
        (A00 * (b1 * A22 - A12 * b2) - b0 * (A01 * A22 - A12 * A02) + A02 * (A01 * b2 - b1 * A02)) / det;
      const sz =
        (A00 * (A11 * b2 - b1 * A12) - A01 * (A01 * b2 - b1 * A02) + b0 * (A01 * A12 - A11 * A02)) / det;
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      const mz = (az + bz) / 2;
      if (Math.hypot(sx - mx, sy - my, sz - mz) < len) {
        best = err(q, sx, sy, sz);
        x = sx;
        y = sy;
        z = sz;
      }
    }
    for (const t of [0, 0.5, 1]) {
      const cx = ax + (bx - ax) * t;
      const cy = ay + (by - ay) * t;
      const cz = az + (bz - az) * t;
      const e = err(q, cx, cy, cz);
      if (e < best) {
        best = e;
        x = cx;
        y = cy;
        z = cz;
      }
    }
    heap.push({ cost: Math.max(0, best) + len * 1e-9, a, b, va: ver[a]!, vb: ver[b]!, x, y, z });
  };
  for (const key of edgeCount.keys()) {
    const [sa, sb] = key.split('_');
    pushEdge(Number(sa), Number(sb));
  }

  let alive = T;
  const ring = (v: number): Set<number> => {
    const s = new Set<number>();
    for (const t of vtris[v]!) {
      if (!triAlive[t]) continue;
      for (let k = 0; k < 3; k++) {
        const u = tri[t * 3 + k]!;
        if (u !== v) s.add(u);
      }
    }
    return s;
  };
  while (alive > targetTris && heap.size > 0) {
    const e = heap.pop()!;
    const { a, b } = e;
    if (!vAlive[a] || !vAlive[b] || ver[a] !== e.va || ver[b] !== e.vb) continue;
    // Link condition: shared neighbours must be exactly the opposite corners of shared triangles.
    const ra = ring(a);
    const rb = ring(b);
    if (!ra.has(b)) continue;
    let shared = 0;
    for (const u of ra) if (rb.has(u)) shared++;
    let sharedTris = 0;
    for (const t of vtris[a]!) {
      if (!triAlive[t]) continue;
      if (tri[t * 3] === b || tri[t * 3 + 1] === b || tri[t * 3 + 2] === b) sharedTris++;
    }
    if (shared !== sharedTris) continue;
    // Reject flips.
    let ok = true;
    for (const v of [a, b]) {
      for (const t of vtris[v]!) {
        if (!triAlive[t]) continue;
        const hasA = tri[t * 3] === a || tri[t * 3 + 1] === a || tri[t * 3 + 2] === a;
        const hasB = tri[t * 3] === b || tri[t * 3 + 1] === b || tri[t * 3 + 2] === b;
        if (hasA && hasB) continue;
        normal(t, n0);
        const area = normal(t, n1, v, e.x, e.y, e.z);
        if (area < 1e-14 || n0[0]! * n1[0]! + n0[1]! * n1[1]! + n0[2]! * n1[2]! < 0.25) {
          ok = false;
          break;
        }
      }
      if (!ok) break;
    }
    if (!ok) continue;
    // Collapse b into a.
    P[a * 3] = e.x;
    P[a * 3 + 1] = e.y;
    P[a * 3 + 2] = e.z;
    for (let k = 0; k < 10; k++) Q[a * 10 + k]! += Q[b * 10 + k]!;
    vAlive[b] = 0;
    ver[a]!++;
    ver[b]!++;
    for (const t of vtris[b]!) {
      if (!triAlive[t]) continue;
      const hasA = tri[t * 3] === a || tri[t * 3 + 1] === a || tri[t * 3 + 2] === a;
      if (hasA) {
        triAlive[t] = 0;
        alive--;
        continue;
      }
      for (let k = 0; k < 3; k++) if (tri[t * 3 + k] === b) tri[t * 3 + k] = a;
      vtris[a]!.push(t);
    }
    vtris[a] = vtris[a]!.filter((t) => triAlive[t] === 1);
    vtris[b] = [];
    // Only edges touching `a` changed cost; their old heap entries are stale by version.
    for (const u of ring(a)) pushEdge(a, u);
  }

  const remap = new Int32Array(V).fill(-1);
  const out: SimplifyResult = { pos: [], idx: [], source: [] };
  for (let t = 0; t < T; t++) {
    if (!triAlive[t]) continue;
    for (let k = 0; k < 3; k++) {
      const v = tri[t * 3 + k]!;
      if (remap[v] === -1) {
        remap[v] = out.source.length;
        out.source.push(v);
        out.pos.push(P[v * 3]!, P[v * 3 + 1]!, P[v * 3 + 2]!);
      }
      out.idx.push(remap[v]!);
    }
  }
  return out;
}
