/**
 * Signed distance modelling: primitives, smooth blends and helpers. Negative inside, positive
 * outside, metres. Organic shapes are built by blending these and then polygonised
 * (polygonize.ts), so joins melt into each other the way sculpted models do.
 */

export type Sdf = (x: number, y: number, z: number) => number;

const len3 = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z);

export function sphere(cx: number, cy: number, cz: number, r: number): Sdf {
  return (x, y, z) => len3(x - cx, y - cy, z - cz) - r;
}

/** Ellipsoid (a close bound, good for blending). */
export function ellipsoid(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number): Sdf {
  return (x, y, z) => {
    const px = x - cx;
    const py = y - cy;
    const pz = z - cz;
    const k0 = len3(px / rx, py / ry, pz / rz);
    const k1 = len3(px / (rx * rx), py / (ry * ry), pz / (rz * rz));
    if (k1 < 1e-9) return -Math.min(rx, ry, rz);
    return (k0 * (k0 - 1)) / k1;
  };
}

/** Segment a-b with a radius blending linearly from ra to rb. */
export function capsule(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  ra: number,
  rb = ra,
): Sdf {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const ll = dx * dx + dy * dy + dz * dz || 1e-12;
  return (x, y, z) => {
    const px = x - ax;
    const py = y - ay;
    const pz = z - az;
    const t = Math.max(0, Math.min(1, (px * dx + py * dy + pz * dz) / ll));
    return len3(px - dx * t, py - dy * t, pz - dz * t) - (ra + (rb - ra) * t);
  };
}

/** Box centred at c with half sizes h and rounded edges of radius r. */
export function roundBox(
  cx: number,
  cy: number,
  cz: number,
  hx: number,
  hy: number,
  hz: number,
  r: number,
): Sdf {
  return (x, y, z) => {
    const qx = Math.abs(x - cx) - hx + r;
    const qy = Math.abs(y - cy) - hy + r;
    const qz = Math.abs(z - cz) - hz + r;
    const out = len3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
    return out + Math.min(Math.max(qx, qy, qz), 0) - r;
  };
}

/** Torus around the y axis. */
export function torusY(cx: number, cy: number, cz: number, R: number, r: number): Sdf {
  return (x, y, z) => {
    const q = Math.sqrt((x - cx) ** 2 + (z - cz) ** 2) - R;
    return Math.sqrt(q * q + (y - cy) ** 2) - r;
  };
}

/** Half space below the plane through `d` along unit normal n (inside where n.p < d). */
export function plane(nx: number, ny: number, nz: number, d: number): Sdf {
  return (x, y, z) => x * nx + y * ny + z * nz - d;
}

/* ------------------------------------------------------------------ operations */

/** Polynomial smooth minimum: blends two surfaces over about `k` metres. */
export function smin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

export function smax(a: number, b: number, k: number): number {
  return -smin(-a, -b, k);
}

export function union(...fs: Sdf[]): Sdf {
  return (x, y, z) => {
    let d = Number.POSITIVE_INFINITY;
    for (const f of fs) d = Math.min(d, f(x, y, z));
    return d;
  };
}

export function blend(k: number, ...fs: Sdf[]): Sdf {
  return (x, y, z) => {
    let d = fs[0]!(x, y, z);
    for (let i = 1; i < fs.length; i++) d = smin(d, fs[i]!(x, y, z), k);
    return d;
  };
}

/** `a` with `b` carved away (smoothly over `k`). */
export function subtract(a: Sdf, b: Sdf, k = 0): Sdf {
  return (x, y, z) => smax(a(x, y, z), -b(x, y, z), k);
}

export function intersect(a: Sdf, b: Sdf, k = 0): Sdf {
  return (x, y, z) => smax(a(x, y, z), b(x, y, z), k);
}

/** Push the surface out by `amount(x, y, z)` (bumps, pores, ridges). Keep it small. */
export function displace(f: Sdf, amount: (x: number, y: number, z: number) => number): Sdf {
  return (x, y, z) => f(x, y, z) - amount(x, y, z);
}

/** Evaluate `f` in a frame rotated about y by `ry` and about z by `rz` around a pivot. */
export function rotated(f: Sdf, px: number, py: number, pz: number, rz: number, ry = 0): Sdf {
  const cz = Math.cos(-rz);
  const sz = Math.sin(-rz);
  const cy = Math.cos(-ry);
  const sy = Math.sin(-ry);
  return (x, y, z) => {
    let lx = x - px;
    const ly = y - py;
    let lz = z - pz;
    // Inverse rotation: undo y, then z.
    const ax = lx * cy + lz * sy;
    const az = -lx * sy + lz * cy;
    lx = ax;
    lz = az;
    const bx = lx * cz - ly * sz;
    const by = lx * sz + ly * cz;
    return f(bx + px, by + py, lz + pz);
  };
}

/* ------------------------------------------------------------------ queries */

/** Unit gradient (outward normal) by the tetrahedron technique. */
export function gradient(f: Sdf, x: number, y: number, z: number, h = 1e-4): [number, number, number] {
  const a = f(x + h, y - h, z - h);
  const b = f(x - h, y - h, z + h);
  const c = f(x - h, y + h, z - h);
  const d = f(x + h, y + h, z + h);
  const nx = a - b - c + d;
  const ny = -a - b + c + d;
  const nz = -a + b - c + d;
  const l = len3(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}

/** First hit of the surface along a unit ray (sphere tracing), or null. */
export function trace(
  f: Sdf,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  tMax: number,
): number | null {
  let t = 0;
  for (let i = 0; i < 256 && t < tMax; i++) {
    const d = f(ox + dx * t, oy + dy * t, oz + dz * t);
    if (d < 1e-5) return t;
    t += Math.max(d * 0.8, 1e-5);
  }
  return null;
}

/** Move a point onto the surface with a few Newton steps. */
export function project(f: Sdf, p: [number, number, number], steps = 4): void {
  for (let i = 0; i < steps; i++) {
    const d = f(p[0], p[1], p[2]);
    if (Math.abs(d) < 1e-6) return;
    const g = gradient(f, p[0], p[1], p[2]);
    p[0] -= g[0] * d;
    p[1] -= g[1] * d;
    p[2] -= g[2] * d;
  }
}
