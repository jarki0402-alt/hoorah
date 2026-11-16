/**
 * Arena Tempur ground: "Lapangan Pasar", a walled market square with a fountain island, planters,
 * a row of parked angkot, crate stacks and three kicker ramps. Pure geometry for the simulation and
 * the renderer: collision push-out, ground height (ramps), spawn points and item box spots.
 */

export type Obstacle =
  | { kind: 'circle'; x: number; z: number; r: number; tag: 'fountain' | 'planter' | 'pole' }
  | {
      kind: 'box';
      x: number;
      z: number;
      hw: number;
      hd: number;
      rot: number;
      tag: 'angkot' | 'crates' | 'stall';
    };

/** A two-way kicker: height rises to `h` at its middle and falls away again. */
export interface Ramp {
  x: number;
  z: number;
  /** Heading of the ramp's long axis (kart convention: forward = (sin, cos)). */
  rot: number;
  w: number;
  len: number;
  h: number;
}

export interface Spawn {
  x: number;
  z: number;
  h: number;
}

export interface PushOut {
  x: number;
  z: number;
  /** Outward normal of the surface that was hit, and how deep the circle was inside it. */
  nx: number;
  nz: number;
  depth: number;
}

export class Arena {
  readonly halfW = 50;
  readonly halfD = 40;
  readonly corner = 9;
  readonly obstacles: Obstacle[] = [];
  readonly ramps: Ramp[] = [];
  readonly spawns: Spawn[] = [];
  readonly boxSpots: { x: number; z: number }[] = [];

  constructor() {
    this.obstacles.push({ kind: 'circle', x: 0, z: 0, r: 6, tag: 'fountain' });
    for (const [x, z] of [
      [-22, -15],
      [22, -15],
      [-22, 15],
      [22, 15],
    ] as const) {
      this.obstacles.push({ kind: 'circle', x, z, r: 2.3, tag: 'planter' });
    }
    // Parked angkot along the north edge, nose to tail.
    for (let i = 0; i < 4; i++) {
      this.obstacles.push({ kind: 'box', x: -27 + i * 6, z: -31, hw: 1.0, hd: 2.4, rot: 0, tag: 'angkot' });
    }
    this.obstacles.push({ kind: 'box', x: 34, z: -26, hw: 1.8, hd: 1.8, rot: 0.3, tag: 'crates' });
    this.obstacles.push({ kind: 'box', x: 33, z: 27, hw: 1.6, hd: 1.6, rot: -0.2, tag: 'crates' });
    this.obstacles.push({ kind: 'box', x: -34, z: 27, hw: 1.8, hd: 1.4, rot: 0.15, tag: 'stall' });
    for (const [x, z] of [
      [-10, 25],
      [10, 25],
    ] as const) {
      this.obstacles.push({ kind: 'circle', x, z, r: 0.5, tag: 'pole' });
    }

    this.ramps.push({ x: -36, z: 2, rot: Math.PI / 2, w: 7, len: 11, h: 1.5 });
    this.ramps.push({ x: 36, z: -2, rot: Math.PI / 2, w: 7, len: 11, h: 1.5 });
    this.ramps.push({ x: 0, z: 30, rot: Math.PI / 2, w: 7, len: 11, h: 1.3 });

    const ring: [number, number][] = [
      [-40, -10],
      [40, 10],
      [-12, 33],
      [12, -24],
      [-40, 18],
      [40, -18],
      [26, 34],
      [-14, -24],
    ];
    for (const [x, z] of ring) this.spawns.push({ x, z, h: Math.atan2(-x, -z) });

    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      this.boxSpots.push({ x: Math.cos(a) * 12.5, z: Math.sin(a) * 12.5 });
    }
    for (const [x, z] of [
      [-42, -32],
      [42, -32],
      [-42, 32],
      [42, 32],
      [0, -22],
      [0, 19],
      [-24, 0],
      [24, 0],
      [-16, -8],
      [16, 8],
    ] as const) {
      this.boxSpots.push({ x, z });
    }
  }

  /** Ground height (ramps) at a point. */
  heightAt(x: number, z: number): number {
    let y = 0;
    for (const r of this.ramps) {
      const dx = x - r.x;
      const dz = z - r.z;
      const fx = Math.sin(r.rot);
      const fz = Math.cos(r.rot);
      const u = dx * fx + dz * fz;
      const v = dx * fz - dz * fx;
      if (Math.abs(u) > r.len / 2 || Math.abs(v) > r.w / 2) continue;
      y = Math.max(y, r.h * (1 - Math.abs(u) / (r.len / 2)));
    }
    return y;
  }

  /** Push a circle of radius `rad` out of the walls and obstacles. Null if nothing was touched. */
  resolve(x: number, z: number, rad: number): PushOut | null {
    let px = x;
    let pz = z;
    let hit: PushOut | null = null;
    const record = (nx: number, nz: number, depth: number) => {
      if (!hit || depth > hit.depth) hit = { x: 0, z: 0, nx, nz, depth };
    };
    // Rounded-rectangle boundary.
    const ix = this.halfW - this.corner;
    const iz = this.halfD - this.corner;
    const cx = Math.max(-ix, Math.min(ix, px));
    const cz = Math.max(-iz, Math.min(iz, pz));
    const ox = px - cx;
    const oz = pz - cz;
    const od = Math.hypot(ox, oz);
    const lim = this.corner - rad;
    if (od > lim) {
      const nx = od > 1e-6 ? ox / od : 0;
      const nz = od > 1e-6 ? oz / od : 1;
      const depth = od - lim;
      px -= nx * depth;
      pz -= nz * depth;
      // Normal points back into the arena.
      record(-nx, -nz, depth);
    }
    for (const o of this.obstacles) {
      if (o.kind === 'circle') {
        const dx = px - o.x;
        const dz = pz - o.z;
        const d = Math.hypot(dx, dz);
        const min = o.r + rad;
        if (d >= min) continue;
        const nx = d > 1e-6 ? dx / d : 1;
        const nz = d > 1e-6 ? dz / d : 0;
        px = o.x + nx * min;
        pz = o.z + nz * min;
        record(nx, nz, min - d);
      } else {
        const c = Math.cos(o.rot);
        const s = Math.sin(o.rot);
        const dx = px - o.x;
        const dz = pz - o.z;
        // Box local axes: u along (cos, -sin) = width, v along (sin, cos) = depth.
        const u = dx * c - dz * s;
        const v = dx * s + dz * c;
        const qu = Math.max(-o.hw, Math.min(o.hw, u));
        const qv = Math.max(-o.hd, Math.min(o.hd, v));
        let du = u - qu;
        let dv = v - qv;
        let d = Math.hypot(du, dv);
        if (d >= rad) continue;
        if (d < 1e-6) {
          // Centre inside the box: leave by the nearest face.
          const ex = o.hw - Math.abs(u);
          const ez = o.hd - Math.abs(v);
          if (ex < ez) {
            du = Math.sign(u) || 1;
            dv = 0;
          } else {
            du = 0;
            dv = Math.sign(v) || 1;
          }
          d = 0;
        }
        const l = Math.hypot(du, dv) || 1;
        const nu = du / l;
        const nv = dv / l;
        const depth = rad - d;
        const nu2 = qu + nu * rad;
        const nv2 = qv + nv * rad;
        px = o.x + nu2 * c + nv2 * s;
        pz = o.z - nu2 * s + nv2 * c;
        record(nu * c + nv * s, -nu * s + nv * c, depth);
      }
    }
    if (!hit) return null;
    const out = hit as PushOut;
    out.x = px;
    out.z = pz;
    return out;
  }

  /** True when a point is free of walls and obstacles by `margin`. */
  free(x: number, z: number, margin: number): boolean {
    return this.resolve(x, z, margin) === null;
  }
}

let shared: Arena | null = null;
export function getArena(): Arena {
  if (!shared) shared = new Arena();
  return shared;
}
