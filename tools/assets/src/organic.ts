/**
 * The organic pipeline: signed distance field -> surface nets -> relaxation -> quadric
 * decimation (keeping detail where the colour changes) -> vertices snapped back onto the true
 * surface -> smooth normals from the field gradient -> per-vertex paint.
 */
import { Mesh, type Paint, type Vec3 } from './mesh';
import { relax, surfaceNets } from './polygonize';
import { gradient, project, type Sdf } from './sdf';
import { simplify } from './simplify';

export interface OrganicOptions {
  min: Vec3;
  max: Vec3;
  /** Grid cell size (m): smaller resolves finer bumps. */
  cell: number;
  /** Triangle budget after decimation. */
  tris: number;
  paint: (x: number, y: number, z: number) => Paint;
  /** Extra importance (>= 1) for some regions, e.g. a face. */
  detail?: (x: number, y: number, z: number) => number;
  relaxIterations?: number;
}

function paintDiff(a: Paint, b: Paint): number {
  return (
    Math.abs(a.color[0] - b.color[0]) +
    Math.abs(a.color[1] - b.color[1]) +
    Math.abs(a.color[2] - b.color[2]) +
    Math.abs(a.rough - b.rough) * 0.5
  );
}

export function organic(f: Sdf, o: OrganicOptions): Mesh {
  const raw = surfaceNets(f, o.min, o.max, o.cell);
  relax(f, raw, o.relaxIterations ?? 2, 0.5);
  const n = raw.pos.length / 3;
  // Importance: colour edges and detail regions keep more triangles.
  const paints: Paint[] = [];
  for (let i = 0; i < n; i++) paints.push(o.paint(raw.pos[i * 3]!, raw.pos[i * 3 + 1]!, raw.pos[i * 3 + 2]!));
  const weights = new Float64Array(n).fill(1);
  for (let t = 0; t < raw.idx.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = raw.idx[t + k]!;
      const b = raw.idx[t + ((k + 1) % 3)]!;
      const d = paintDiff(paints[a]!, paints[b]!);
      const w = 1 + Math.min(40, d * 60);
      if (w > weights[a]!) weights[a] = w;
      if (w > weights[b]!) weights[b] = w;
    }
  }
  if (o.detail) {
    for (let i = 0; i < n; i++)
      weights[i] = weights[i]! * o.detail(raw.pos[i * 3]!, raw.pos[i * 3 + 1]!, raw.pos[i * 3 + 2]!);
  }
  const s =
    raw.idx.length / 3 > o.tris ? simplify(raw.pos, raw.idx, o.tris, { weights }) : { ...raw, source: [] };
  const m = new Mesh();
  const p: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < s.pos.length / 3; i++) {
    p[0] = s.pos[i * 3]!;
    p[1] = s.pos[i * 3 + 1]!;
    p[2] = s.pos[i * 3 + 2]!;
    project(f, p, 4);
    const g = gradient(f, p[0], p[1], p[2], o.cell * 0.15);
    m.vertex(p[0], p[1], p[2], g[0], g[1], g[2], o.paint(p[0], p[1], p[2]));
  }
  for (const i of s.idx) m.idx.push(i);
  return m;
}
