/**
 * Hard-surface generators with clean, analytic normals: rounded boxes (true quarter-round bevels,
 * flat faces stay flat), lathes with crisp or smooth profile corners, swept tubes with flat or
 * round caps, rings, ellipsoids, bevelled cylinders, extrusions and quads.
 *
 * Conventions: y up, metres, counter-clockwise front faces.
 */
import * as THREE from 'three';
import { Mesh, type Paint, type Vec3 } from './mesh';
import { creaseNormals } from './normals';

/* ------------------------------------------------------------------ boxes */

/** Sharp box centred on the origin. */
export function box(w: number, h: number, d: number, p: Paint): Mesh {
  return roundedBox(w, h, d, 0, p);
}

/**
 * Box centred on the origin with every edge rounded to radius `r`. `n` bevel steps per face half
 * (2 = 4 facets per quarter round, smooth at game distances).
 */
export function roundedBox(w: number, h: number, d: number, r: number, p: Paint, n = 2): Mesh {
  const half = [w / 2, h / 2, d / 2] as const;
  const rr = Math.max(0, Math.min(r, half[0] * 0.999, half[1] * 0.999, half[2] * 0.999));
  const m = new Mesh();
  const axis = (hh: number): number[] => {
    if (rr <= 1e-6) return [-hh, hh];
    const inner = hh - rr;
    const s: number[] = [];
    for (let k = 0; k <= n; k++) s.push(-inner - rr * Math.tan((Math.PI / 4) * (1 - k / n)));
    const out = s.slice();
    for (let k = inner > 1e-6 ? n : n - 1; k >= 0; k--) out.push(-s[k]!);
    return out;
  };
  const faces: [number, number, number][] = [
    [0, 1, 2],
    [1, 2, 0],
    [2, 0, 1],
  ];
  const P = [0, 0, 0];
  for (const [a, u, v] of faces) {
    for (const sgn of [1, -1]) {
      const su = axis(half[u]!);
      const sv = axis(half[v]!);
      const base = m.vertexCount;
      for (let j = 0; j < sv.length; j++) {
        for (let i = 0; i < su.length; i++) {
          P[a] = sgn * half[a]!;
          P[u] = su[i]!;
          P[v] = sv[j]!;
          let x = P[0]!;
          let y = P[1]!;
          let z = P[2]!;
          let nx = a === 0 ? sgn : 0;
          let ny = a === 1 ? sgn : 0;
          let nz = a === 2 ? sgn : 0;
          if (rr > 1e-6) {
            const cx = Math.max(-(half[0] - rr), Math.min(half[0] - rr, x));
            const cy = Math.max(-(half[1] - rr), Math.min(half[1] - rr, y));
            const cz = Math.max(-(half[2] - rr), Math.min(half[2] - rr, z));
            const dx = x - cx;
            const dy = y - cy;
            const dz = z - cz;
            const l = Math.hypot(dx, dy, dz);
            if (l > 1e-9) {
              nx = dx / l;
              ny = dy / l;
              nz = dz / l;
              x = cx + nx * rr;
              y = cy + ny * rr;
              z = cz + nz * rr;
            }
          }
          m.vertex(x, y, z, nx, ny, nz, p);
        }
      }
      const W = su.length;
      for (let j = 0; j < sv.length - 1; j++) {
        for (let i = 0; i < W - 1; i++) {
          const A = base + j * W + i;
          const B = A + 1;
          const C = A + W + 1;
          const D = A + W;
          if (sgn > 0) {
            m.tri(A, B, C);
            m.tri(A, C, D);
          } else {
            m.tri(A, C, B);
            m.tri(A, D, C);
          }
        }
      }
    }
  }
  return dedupe(m);
}

/** Weld vertices with identical position, normal and attributes (keeps normals as they are). */
export function dedupe(m: Mesh): Mesh {
  const out = new Mesh();
  out.hasUv = m.hasUv;
  const map = new Map<string, number>();
  const remap: number[] = [];
  const q = (v: number, k: number) => Math.round(v * k);
  for (let i = 0; i < m.vertexCount; i++) {
    const k = [
      q(m.pos[i * 3]!, 1e5),
      q(m.pos[i * 3 + 1]!, 1e5),
      q(m.pos[i * 3 + 2]!, 1e5),
      q(m.nor[i * 3]!, 1e3),
      q(m.nor[i * 3 + 1]!, 1e3),
      q(m.nor[i * 3 + 2]!, 1e3),
      q(m.col[i * 3]!, 4096),
      q(m.col[i * 3 + 1]!, 4096),
      q(m.col[i * 3 + 2]!, 4096),
      q(m.surf[i * 4]!, 255),
      q(m.surf[i * 4 + 1]!, 255),
      q(m.surf[i * 4 + 2]!, 255),
      q(m.uv[i * 2]!, 8192),
      q(m.uv[i * 2 + 1]!, 8192),
    ].join(',');
    let j = map.get(k);
    if (j === undefined) {
      j = out.vertexCount;
      map.set(k, j);
      out.pos.push(m.pos[i * 3]!, m.pos[i * 3 + 1]!, m.pos[i * 3 + 2]!);
      out.nor.push(m.nor[i * 3]!, m.nor[i * 3 + 1]!, m.nor[i * 3 + 2]!);
      out.col.push(m.col[i * 3]!, m.col[i * 3 + 1]!, m.col[i * 3 + 2]!);
      out.surf.push(m.surf[i * 4]!, m.surf[i * 4 + 1]!, m.surf[i * 4 + 2]!, m.surf[i * 4 + 3]!);
      out.uv.push(m.uv[i * 2]!, m.uv[i * 2 + 1]!);
    }
    remap.push(j);
  }
  for (let t = 0; t < m.idx.length; t += 3) {
    const a = remap[m.idx[t]!]!;
    const b = remap[m.idx[t + 1]!]!;
    const c = remap[m.idx[t + 2]!]!;
    if (a !== b && b !== c && a !== c) out.idx.push(a, b, c);
  }
  return out;
}

/* ------------------------------------------------------------------ lathe */

/** Profile point: radius, height, and whether the profile has a hard corner there. */
export type LathePoint = readonly [number, number] | readonly [number, number, boolean];

/**
 * Revolve a profile (listed bottom to top, radius >= 0) around +y. Hard corners get split
 * normals; everything else is smooth. `phiLen` < 2*PI makes an open sector.
 */
export function lathe(
  profile: readonly LathePoint[],
  segs: number,
  p: Paint,
  phiStart = 0,
  phiLen = Math.PI * 2,
): Mesh {
  const m = new Mesh();
  const n = profile.length;
  const segN: [number, number][] = [];
  for (let i = 0; i < n - 1; i++) {
    const dr = profile[i + 1]![0] - profile[i]![0];
    const dy = profile[i + 1]![1] - profile[i]![1];
    const l = Math.hypot(dr, dy) || 1;
    segN.push([dy / l, -dr / l]);
  }
  // Each profile point becomes one ring (smooth) or two (hard corner): [r, y, nr, ny, pointIndex].
  const rings: [number, number, number, number][] = [];
  const startOf: number[] = [];
  const endOf: number[] = [];
  for (let i = 0; i < n; i++) {
    const [r, y] = profile[i]!;
    const hard = profile[i]![2] === true;
    const before = i > 0 ? segN[i - 1]! : null;
    const after = i < n - 1 ? segN[i]! : null;
    if (hard && before && after) {
      endOf[i] = rings.length;
      rings.push([r, y, before[0], before[1]]);
      startOf[i] = rings.length;
      rings.push([r, y, after[0], after[1]]);
    } else {
      let nr = (before?.[0] ?? 0) + (after?.[0] ?? 0);
      let ny = (before?.[1] ?? 0) + (after?.[1] ?? 0);
      const l = Math.hypot(nr, ny) || 1;
      nr /= l;
      ny /= l;
      endOf[i] = rings.length;
      startOf[i] = rings.length;
      rings.push([r, y, nr, ny]);
    }
  }
  const cols = segs + 1;
  for (const [r, y, nr, ny] of rings) {
    for (let j = 0; j < cols; j++) {
      const a = phiStart + (phiLen * j) / segs;
      const s = Math.sin(a);
      const c = Math.cos(a);
      m.vertex(r * s, y, r * c, nr * s, ny, nr * c, p, j / segs, y);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    const r0 = profile[i]![0];
    const r1 = profile[i + 1]![0];
    const ra = startOf[i]!;
    const rb = endOf[i + 1]!;
    for (let j = 0; j < segs; j++) {
      const A = ra * cols + j;
      const B = A + 1;
      const D = rb * cols + j;
      const C = D + 1;
      if (r0 > 1e-7) m.tri(A, B, C);
      if (r1 > 1e-7) m.tri(A, C, D);
    }
  }
  return m;
}

/** Ellipsoid centred on the origin. */
export function ellipsoid(rx: number, ry: number, rz: number, p: Paint, segs = 16, rings = 10): Mesh {
  const prof: LathePoint[] = [];
  for (let i = 0; i <= rings; i++) {
    const t = (i / rings) * Math.PI;
    prof.push([Math.max(0, Math.sin(t)), -Math.cos(t)]);
  }
  return lathe(prof, segs, p).transform(new THREE.Matrix4().makeScale(rx, ry, rz));
}

/** Cylinder standing on y = 0, `h` tall, with rounded rims of radius `bevel` (0 = sharp). */
export function cylinder(r: number, h: number, p: Paint, segs = 16, bevel = 0, steps = 2): Mesh {
  const prof: LathePoint[] = [[0, 0]];
  if (bevel > 1e-6) {
    for (let k = 0; k <= steps; k++) {
      const a = (k / steps) * (Math.PI / 2);
      prof.push([r - bevel + Math.sin(a) * bevel, bevel - Math.cos(a) * bevel]);
    }
    for (let k = 0; k <= steps; k++) {
      const a = (k / steps) * (Math.PI / 2);
      prof.push([r - bevel + Math.cos(a) * bevel, h - bevel + Math.sin(a) * bevel]);
    }
  } else {
    prof.push([r, 0, true], [r, h, true]);
  }
  prof.push([0, h]);
  return lathe(prof, segs, p);
}

/* ------------------------------------------------------------------ tubes */

interface Ring {
  c: THREE.Vector3;
  n: THREE.Vector3;
  b: THREE.Vector3;
  r: number;
  /** Radial share of the normal and its axial part (round caps tilt the normal). */
  tn: number;
  tv: THREE.Vector3;
}

export interface TubeOptions {
  closed?: boolean;
  /** End treatment: flat disc, half sphere, or open. */
  caps?: 'flat' | 'round' | 'none';
  capSteps?: number;
}

/** Sweep a circle of `radius` (constant or per point) along a path with parallel-transport frames. */
export function tube(
  path: readonly Vec3[],
  radius: number | ((i: number, t: number) => number),
  radial: number,
  p: Paint,
  opts: TubeOptions = {},
): Mesh {
  const closed = opts.closed ?? false;
  const caps = closed ? 'none' : (opts.caps ?? 'flat');
  const pts = path.map((q) => new THREE.Vector3(...q));
  const N = pts.length;
  const rad = (i: number) => (typeof radius === 'number' ? radius : radius(i, N > 1 ? i / (N - 1) : 0));
  const T: THREE.Vector3[] = [];
  for (let i = 0; i < N; i++) {
    const prev = closed ? pts[(i - 1 + N) % N]! : pts[Math.max(0, i - 1)]!;
    const next = closed ? pts[(i + 1) % N]! : pts[Math.min(N - 1, i + 1)]!;
    T.push(next.clone().sub(prev).normalize());
  }
  const t0 = T[0]!;
  const ref = Math.abs(t0.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  let nPrev = ref
    .clone()
    .sub(t0.clone().multiplyScalar(ref.dot(t0)))
    .normalize();
  const rings: Ring[] = [];
  const frames: { n: THREE.Vector3; b: THREE.Vector3 }[] = [];
  for (let i = 0; i < N; i++) {
    const t = T[i]!;
    const n = nPrev
      .clone()
      .sub(t.clone().multiplyScalar(nPrev.dot(t)))
      .normalize();
    const b = new THREE.Vector3().crossVectors(t, n).normalize();
    frames.push({ n, b });
    nPrev = n;
  }
  const steps = opts.capSteps ?? 3;
  if (caps === 'round') {
    const f = frames[0]!;
    const back = T[0]!.clone().negate();
    for (let k = steps; k >= 1; k--) {
      const a = (k / steps) * (Math.PI / 2);
      const r0 = rad(0);
      rings.push({
        c: pts[0]!.clone().addScaledVector(back, Math.sin(a) * r0),
        n: f.n,
        b: f.b,
        r: Math.cos(a) * r0,
        tn: Math.cos(a),
        tv: back.clone().multiplyScalar(Math.sin(a)),
      });
    }
  }
  for (let i = 0; i < N; i++) {
    rings.push({ c: pts[i]!, n: frames[i]!.n, b: frames[i]!.b, r: rad(i), tn: 1, tv: new THREE.Vector3() });
  }
  if (closed) rings.push({ ...rings[0]! });
  if (caps === 'round') {
    const f = frames[N - 1]!;
    const fwd = T[N - 1]!;
    for (let k = 1; k <= steps; k++) {
      const a = (k / steps) * (Math.PI / 2);
      const r1 = rad(N - 1);
      rings.push({
        c: pts[N - 1]!.clone().addScaledVector(fwd, Math.sin(a) * r1),
        n: f.n,
        b: f.b,
        r: Math.cos(a) * r1,
        tn: Math.cos(a),
        tv: fwd.clone().multiplyScalar(Math.sin(a)),
      });
    }
  }
  const m = new Mesh();
  const cols = radial + 1;
  const off = new THREE.Vector3();
  for (const ring of rings) {
    for (let j = 0; j < cols; j++) {
      const a = (j / radial) * Math.PI * 2;
      off.copy(ring.n).multiplyScalar(Math.cos(a)).addScaledVector(ring.b, Math.sin(a));
      const nx = off.x * ring.tn + ring.tv.x;
      const ny = off.y * ring.tn + ring.tv.y;
      const nz = off.z * ring.tn + ring.tv.z;
      m.vertex(
        ring.c.x + off.x * ring.r,
        ring.c.y + off.y * ring.r,
        ring.c.z + off.z * ring.r,
        nx,
        ny,
        nz,
        p,
        j / radial,
        0,
      );
    }
  }
  for (let i = 0; i < rings.length - 1; i++) {
    const r0 = rings[i]!.r;
    const r1 = rings[i + 1]!.r;
    for (let j = 0; j < radial; j++) {
      const A = i * cols + j;
      const B = A + 1;
      const D = A + cols;
      const C = D + 1;
      if (r0 > 1e-7) m.tri(A, B, C);
      if (r1 > 1e-7) m.tri(A, C, D);
    }
  }
  if (caps === 'flat') {
    for (const [i, sign] of [
      [0, -1],
      [N - 1, 1],
    ] as const) {
      const f = frames[i]!;
      const t = T[i]!;
      const c = pts[i]!;
      const r = rad(i);
      const center = m.vertex(c.x, c.y, c.z, t.x * sign, t.y * sign, t.z * sign, p);
      const start = m.vertexCount;
      for (let j = 0; j < radial; j++) {
        const a = (j / radial) * Math.PI * 2;
        off.copy(f.n).multiplyScalar(Math.cos(a)).addScaledVector(f.b, Math.sin(a));
        m.vertex(c.x + off.x * r, c.y + off.y * r, c.z + off.z * r, t.x * sign, t.y * sign, t.z * sign, p);
      }
      for (let j = 0; j < radial; j++) {
        const a = start + j;
        const b = start + ((j + 1) % radial);
        if (sign > 0) m.tri(center, a, b);
        else m.tri(center, b, a);
      }
    }
  }
  return m;
}

/** A horizontal ring (torus in the xz plane) of major radius `R` and tube radius `r` at height 0. */
export function ring(R: number, r: number, p: Paint, segs = 24, radial = 8, arc = Math.PI * 2): Mesh {
  const full = arc >= Math.PI * 2 - 1e-6;
  const n = full ? segs : segs + 1;
  const path: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / segs) * arc;
    path.push([Math.sin(a) * R, 0, Math.cos(a) * R]);
  }
  return tube(path, r, radial, p, full ? { closed: true } : { caps: 'round', capSteps: 2 });
}

/** A straight rod between two points. */
export function rod(
  a: Vec3,
  b: Vec3,
  r: number,
  p: Paint,
  radial = 8,
  caps: 'flat' | 'round' = 'flat',
): Mesh {
  return tube([a, b], r, radial, p, { caps, capSteps: 2 });
}

/** Points along a hanging wire (parabolic sag) from `a` to `b`. */
export function sagPath(a: Vec3, b: Vec3, sag: number, steps = 10): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    out.push([
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * sag,
      a[2] + (b[2] - a[2]) * t,
    ]);
  }
  return out;
}

/* ------------------------------------------------------------------ flat things */

/** A quad a-b-c-d (counter-clockwise from the front) with UVs 0..1 unless given. */
export function quad(
  a: Vec3,
  b: Vec3,
  c: Vec3,
  d: Vec3,
  p: Paint,
  uv: [number, number, number, number] = [0, 0, 1, 1],
): Mesh {
  const m = new Mesh();
  const u = new THREE.Vector3(...b).sub(new THREE.Vector3(...a));
  const v = new THREE.Vector3(...d).sub(new THREE.Vector3(...a));
  const n = new THREE.Vector3().crossVectors(u, v).normalize();
  m.hasUv = true;
  const i0 = m.vertex(...a, n.x, n.y, n.z, p, uv[0], uv[1]);
  m.vertex(...b, n.x, n.y, n.z, p, uv[2], uv[1]);
  m.vertex(...c, n.x, n.y, n.z, p, uv[2], uv[3]);
  m.vertex(...d, n.x, n.y, n.z, p, uv[0], uv[3]);
  m.tri(i0, i0 + 1, i0 + 2);
  m.tri(i0, i0 + 2, i0 + 3);
  return m;
}

/** Extrude a 2D shape along +z by `depth` with a rounded bevel (three's extruder, crisp normals). */
export function extrude(
  shape: THREE.Shape,
  depth: number,
  p: Paint,
  bevel = 0,
  bevelSteps = 2,
  curveSteps = 12,
): Mesh {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: bevelSteps,
    curveSegments: curveSteps,
  });
  const m = Mesh.fromGeometry(g, p);
  g.dispose();
  return creaseNormals(m, 35);
}
