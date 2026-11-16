/**
 * Leaves and foliage: curved, folded leaf blades (crowns, calyxes, potted plants) and lumpy
 * foliage clumps from blended spheres (bushes, tree crowns, clouds use the same idea).
 */
import { Mesh, type Paint, type Vec3 } from './mesh';
import { fbm3 } from './noise';
import { creaseNormals } from './normals';
import { blend, displace, type Sdf, sphere } from './sdf';

export interface BladeSpec {
  base: Vec3;
  /** Growth direction. */
  dir: Vec3;
  /** Across the leaf (any vector not parallel to dir). */
  side: Vec3;
  length: number;
  width: number;
  /** Width along the leaf, 0..1 -> 0..1 (default: pointed oval). */
  widthAt?: (s: number) => number;
  /** Downward curve (m at the tip per m^2 of length). */
  droop?: number;
  /** Depth of the centre fold relative to the width. */
  fold?: number;
  thickness?: number;
  steps?: number;
  paint: (s: number) => Paint;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** A leaf blade: two thin sheets (top and underside) so it reads from both sides. */
export function blade(b: BladeSpec): Mesh {
  const D = norm(b.dir);
  const S0 = b.side;
  const S = norm(sub(S0, [D[0] * dot(D, S0), D[1] * dot(D, S0), D[2] * dot(D, S0)]));
  const U = cross(D, S);
  const steps = b.steps ?? 6;
  const cols = [-1, -0.5, 0, 0.5, 1];
  const widthAt = b.widthAt ?? ((s: number) => Math.sin(Math.PI * Math.min(1, s * 0.92 + 0.08)) ** 0.8);
  const droop = b.droop ?? 0;
  const fold = b.fold ?? 0.25;
  const th = (b.thickness ?? 0.006) / 2;
  const out = new Mesh();
  for (const sheet of [1, -1]) {
    const m = new Mesh();
    for (let i = 0; i <= steps; i++) {
      const s = i / steps;
      const along = s * b.length;
      const w = widthAt(s) * b.width * 0.5;
      const p = b.paint(s);
      for (const t of cols) {
        const lift = fold * Math.abs(t) * w + sheet * th;
        m.vertex(
          b.base[0] + D[0] * along + S[0] * t * w + U[0] * lift,
          b.base[1] + D[1] * along + S[1] * t * w + U[1] * lift - droop * along * along,
          b.base[2] + D[2] * along + S[2] * t * w + U[2] * lift,
          0,
          1,
          0,
          p,
        );
      }
    }
    const C = cols.length;
    for (let i = 0; i < steps; i++)
      for (let j = 0; j < C - 1; j++) {
        const a = i * C + j;
        const bb = a + 1;
        const c = a + C + 1;
        const d = a + C;
        if (sheet > 0) {
          m.tri(a, d, c);
          m.tri(a, c, bb);
        } else {
          m.tri(a, bb, c);
          m.tri(a, c, d);
        }
      }
    out.append(creaseNormals(m, 80));
  }
  return out;
}

/** A lumpy clump of foliage: spheres blended together with a little noise on the surface. */
export function clump(
  balls: readonly [number, number, number, number][],
  k: number,
  bump: number,
  seed: number,
): Sdf {
  const f = blend(k, ...balls.map(([x, y, z, r]) => sphere(x, y, z, r)));
  return displace(f, (x, y, z) => fbm3(x * 9, y * 9, z * 9, 2, seed) * bump);
}
