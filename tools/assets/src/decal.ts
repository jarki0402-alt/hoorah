/**
 * Raised details that hug an organic surface: eyes, pupils, mouths, cheeks, spots. A star-shaped
 * outline is projected onto the field along -z (so it sits on the front of a character), lifted
 * by a height profile (domes for eyes, flat for patches) and closed with a short rim that sinks
 * into the surface, so the edge stays crisp at any distance.
 */
import { Mesh, type Paint, type Vec3 } from './mesh';
import { creaseNormals } from './normals';
import { gradient, type Sdf, trace } from './sdf';
import { tube } from './shapes';

export interface DecalSpec {
  /** Centre on the front plane (x, y). */
  cx: number;
  cy: number;
  /** Outline radius at angle theta (0 = +x, counter-clockwise seen from the front). */
  shape: (theta: number) => number;
  /** Lift above the surface along its normal at local offset (u, v) from the centre. */
  height: (u: number, v: number) => number;
  /** How far the rim reaches into the surface. */
  sink?: number;
  paint: Paint;
  rings?: number;
  segs?: number;
}

/** Where the front-facing surface is at (x, y), with its normal. */
export function frontHit(f: Sdf, x: number, y: number): { p: Vec3; n: Vec3 } | null {
  const t = trace(f, x, y, 2, 0, 0, -1, 4);
  if (t === null) return null;
  const p: Vec3 = [x, y, 2 - t];
  return { p, n: gradient(f, p[0], p[1], p[2]) };
}

export function ellipseShape(a: number, b: number): (theta: number) => number {
  return (th) => (a * b) / Math.sqrt((b * Math.cos(th)) ** 2 + (a * Math.sin(th)) ** 2);
}

/** Dome height profile for an elliptic outline: `h` at the centre, `edge` at the outline. */
export function domeHeight(a: number, b: number, h: number, edge = 0.0015): (u: number, v: number) => number {
  return (u, v) => {
    const r = Math.min(1, (u / a) ** 2 + (v / b) ** 2);
    return edge + (h - edge) * Math.sqrt(1 - r);
  };
}

export function decal(f: Sdf, d: DecalSpec): Mesh {
  const rings = d.rings ?? 4;
  const segs = d.segs ?? 28;
  const sink = d.sink ?? 0.006;
  const m = new Mesh();
  const place = (u: number, v: number, lift: number): Vec3 => {
    const hit = frontHit(f, d.cx + u, d.cy + v);
    if (!hit) return [d.cx + u, d.cy + v, 0];
    return [hit.p[0] + hit.n[0] * lift, hit.p[1] + hit.n[1] * lift, hit.p[2] + hit.n[2] * lift];
  };
  const centre = place(0, 0, d.height(0, 0));
  m.vertex(...centre, 0, 0, 1, d.paint);
  const ringStart: number[] = [];
  for (let k = 1; k <= rings; k++) {
    ringStart.push(m.vertexCount);
    for (let j = 0; j < segs; j++) {
      const th = (j / segs) * Math.PI * 2;
      const r = d.shape(th) * (k / rings);
      const u = Math.cos(th) * r;
      const v = Math.sin(th) * r;
      m.vertex(...place(u, v, d.height(u, v)), 0, 0, 1, d.paint);
    }
  }
  for (let j = 0; j < segs; j++) m.tri(0, ringStart[0]! + j, ringStart[0]! + ((j + 1) % segs));
  for (let k = 0; k < rings - 1; k++) {
    const a = ringStart[k]!;
    const b = ringStart[k + 1]!;
    for (let j = 0; j < segs; j++) {
      const j1 = (j + 1) % segs;
      m.tri(a + j, b + j, b + j1);
      m.tri(a + j, b + j1, a + j1);
    }
  }
  // Rim down into the surface.
  const top = ringStart[rings - 1]!;
  const bottom = m.vertexCount;
  for (let j = 0; j < segs; j++) {
    const th = (j / segs) * Math.PI * 2;
    const r = d.shape(th);
    m.vertex(...place(Math.cos(th) * r, Math.sin(th) * r, -sink), 0, 0, 1, d.paint);
  }
  for (let j = 0; j < segs; j++) {
    const j1 = (j + 1) % segs;
    m.tri(top + j, bottom + j, bottom + j1);
    m.tri(top + j, bottom + j1, top + j1);
  }
  return creaseNormals(m, 55);
}

/** A tube laid along points on the front of a surface (brows, smiles), lifted by `lift`. */
export function surfaceStroke(
  f: Sdf,
  pts: readonly [number, number][],
  r: number,
  lift: number,
  p: Paint,
): Mesh {
  const path: Vec3[] = pts.map(([x, y]) => {
    const hit = frontHit(f, x, y);
    if (!hit) return [x, y, 0];
    return [hit.p[0] + hit.n[0] * lift, hit.p[1] + hit.n[1] * lift, hit.p[2] + hit.n[2] * lift];
  });
  return tube(path, (_i, t) => r * (0.55 + 0.45 * Math.sin(Math.PI * t)), 8, p, {
    caps: 'round',
    capSteps: 2,
  });
}
