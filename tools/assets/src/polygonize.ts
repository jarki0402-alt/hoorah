/**
 * Surface extraction for signed distance fields: naive surface nets on a regular grid (one vertex
 * per surface cell, quads across every sign-changing grid edge), then each vertex is pulled onto
 * the true surface and the mesh is relaxed a little for even triangles. Output is a closed,
 * consistently wound triangle mesh (positions and indices only).
 */
import { gradient, project, type Sdf } from './sdf';

export interface RawMesh {
  pos: number[];
  idx: number[];
}

export function surfaceNets(
  f: Sdf,
  min: readonly [number, number, number],
  max: readonly [number, number, number],
  cell: number,
): RawMesh {
  // Pad by one cell so the shape never touches the grid border (keeps the mesh closed).
  const ox = min[0] - cell;
  const oy = min[1] - cell;
  const oz = min[2] - cell;
  const nx = Math.ceil((max[0] - min[0]) / cell) + 3;
  const ny = Math.ceil((max[1] - min[1]) / cell) + 3;
  const nz = Math.ceil((max[2] - min[2]) / cell) + 3;
  const field = new Float32Array(nx * ny * nz);
  const at = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const edge = i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1;
        const v = f(ox + i * cell, oy + j * cell, oz + k * cell);
        field[at(i, j, k)] = edge ? Math.max(v, cell) : v;
      }
  const cx = nx - 1;
  const cy = ny - 1;
  const cellIndex = new Int32Array(cx * cy * nz).fill(-1);
  const cAt = (i: number, j: number, k: number) => i + cx * (j + cy * k);
  const pos: number[] = [];
  const corners = [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
    [1, 1, 0],
    [0, 0, 1],
    [1, 0, 1],
    [0, 1, 1],
    [1, 1, 1],
  ] as const;
  const edges = [
    [0, 1],
    [2, 3],
    [4, 5],
    [6, 7],
    [0, 2],
    [1, 3],
    [4, 6],
    [5, 7],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ] as const;
  const v = new Float64Array(8);
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        let inside = 0;
        for (let c = 0; c < 8; c++) {
          const [a, b, d] = corners[c]!;
          v[c] = field[at(i + a, j + b, k + d)]!;
          if (v[c]! < 0) inside++;
        }
        if (inside === 0 || inside === 8) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let n = 0;
        for (const [e0, e1] of edges) {
          const a = v[e0]!;
          const b = v[e1]!;
          if (a < 0 === b < 0) continue;
          const t = a / (a - b);
          const p0 = corners[e0]!;
          const p1 = corners[e1]!;
          sx += p0[0] + (p1[0] - p0[0]) * t;
          sy += p0[1] + (p1[1] - p0[1]) * t;
          sz += p0[2] + (p1[2] - p0[2]) * t;
          n++;
        }
        cellIndex[cAt(i, j, k)] = pos.length / 3;
        pos.push(ox + (i + sx / n) * cell, oy + (j + sy / n) * cell, oz + (k + sz / n) * cell);
      }
  const idx: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    const q = flip ? [a, d, c, b] : [a, b, c, d];
    // Split along the shorter diagonal.
    const d02 = dist2(pos, q[0]!, q[2]!);
    const d13 = dist2(pos, q[1]!, q[3]!);
    if (d02 <= d13) idx.push(q[0]!, q[1]!, q[2]!, q[0]!, q[2]!, q[3]!);
    else idx.push(q[0]!, q[1]!, q[3]!, q[1]!, q[2]!, q[3]!);
  };
  for (let k = 1; k < nz - 1; k++)
    for (let j = 1; j < ny - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const s = field[at(i, j, k)]! < 0;
        // x edge (i,j,k)-(i+1,j,k): cells around it in the (y, z) plane.
        if (i < nx - 1 && s !== field[at(i + 1, j, k)]! < 0)
          quad(
            cellIndex[cAt(i, j - 1, k - 1)]!,
            cellIndex[cAt(i, j, k - 1)]!,
            cellIndex[cAt(i, j, k)]!,
            cellIndex[cAt(i, j - 1, k)]!,
            !s,
          );
        if (j < ny - 1 && s !== field[at(i, j + 1, k)]! < 0)
          quad(
            cellIndex[cAt(i - 1, j, k - 1)]!,
            cellIndex[cAt(i - 1, j, k)]!,
            cellIndex[cAt(i, j, k)]!,
            cellIndex[cAt(i, j, k - 1)]!,
            !s,
          );
        if (k < nz - 1 && s !== field[at(i, j, k + 1)]! < 0)
          quad(
            cellIndex[cAt(i - 1, j - 1, k)]!,
            cellIndex[cAt(i, j - 1, k)]!,
            cellIndex[cAt(i, j, k)]!,
            cellIndex[cAt(i - 1, j, k)]!,
            !s,
          );
      }
  return { pos, idx };
}

function dist2(p: number[], a: number, b: number): number {
  const dx = p[a * 3]! - p[b * 3]!;
  const dy = p[a * 3 + 1]! - p[b * 3 + 1]!;
  const dz = p[a * 3 + 2]! - p[b * 3 + 2]!;
  return dx * dx + dy * dy + dz * dz;
}

/** Vertex neighbours from triangles. */
export function neighbours(count: number, idx: readonly number[]): number[][] {
  const nb: Set<number>[] = Array.from({ length: count }, () => new Set<number>());
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t]!;
    const b = idx[t + 1]!;
    const c = idx[t + 2]!;
    nb[a]!.add(b).add(c);
    nb[b]!.add(a).add(c);
    nb[c]!.add(a).add(b);
  }
  return nb.map((s) => [...s]);
}

/**
 * Even out the triangles: tangential Laplacian relaxation (moves along the surface only), then
 * pull every vertex back onto the surface.
 */
export function relax(f: Sdf, m: RawMesh, iterations = 3, amount = 0.5): void {
  const n = m.pos.length / 3;
  const nb = neighbours(n, m.idx);
  const next = new Float64Array(n * 3);
  const p: [number, number, number] = [0, 0, 0];
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < n; i++) {
      const list = nb[i]!;
      const x = m.pos[i * 3]!;
      const y = m.pos[i * 3 + 1]!;
      const z = m.pos[i * 3 + 2]!;
      if (list.length === 0) {
        next[i * 3] = x;
        next[i * 3 + 1] = y;
        next[i * 3 + 2] = z;
        continue;
      }
      let ax = 0;
      let ay = 0;
      let az = 0;
      for (const j of list) {
        ax += m.pos[j * 3]!;
        ay += m.pos[j * 3 + 1]!;
        az += m.pos[j * 3 + 2]!;
      }
      ax = ax / list.length - x;
      ay = ay / list.length - y;
      az = az / list.length - z;
      const g = gradient(f, x, y, z);
      const dn = ax * g[0] + ay * g[1] + az * g[2];
      next[i * 3] = x + (ax - g[0] * dn) * amount;
      next[i * 3 + 1] = y + (ay - g[1] * dn) * amount;
      next[i * 3 + 2] = z + (az - g[2] * dn) * amount;
    }
    for (let i = 0; i < n; i++) {
      p[0] = next[i * 3]!;
      p[1] = next[i * 3 + 1]!;
      p[2] = next[i * 3 + 2]!;
      project(f, p, 3);
      m.pos[i * 3] = p[0];
      m.pos[i * 3 + 1] = p[1];
      m.pos[i * 3 + 2] = p[2];
    }
  }
}
