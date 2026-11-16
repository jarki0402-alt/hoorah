/**
 * Rooftop parts shared by several Lari Terus models: AC units, plastic water tanks with ribs,
 * plank crates, cement sacks, banded pipes, steel stands, bamboo poles, laundry, potted foliage.
 * Each returns a Mesh in its own space (standing on y = 0, front facing +z).
 */
import * as THREE from 'three';
import { hex, mixRGB, type RGB, scaleRGB } from '../src/color';
import { blade, clump } from '../src/foliage';
import { Mesh, type Paint, paint, trs, type Vec3 } from '../src/mesh';
import { fbm3, hash1, rng } from '../src/noise';
import { organic } from '../src/organic';
import { roundBox } from '../src/sdf';
import { cylinder, type LathePoint, lathe, quad, ring, rod, roundedBox, sagPath, tube } from '../src/shapes';

/* ------------------------------------------------------------------ palette */

export const P = {
  steel: paint(hex(0x50545a), 0.45, 0.6),
  galv: paint(hex(0x9aa0a6), 0.38, 0.75),
  chrome: paint(hex(0xd7dade), 0.18, 1),
  dark: paint(hex(0x2a2c31), 0.6),
  rubber: paint(hex(0x1f2023), 0.8),
  plaster: paint(hex(0xa39d92), 0.92),
  concrete: paint(hex(0xb3ab9f), 0.9),
  acBody: paint(hex(0xeef0ec), 0.45),
  acPanel: paint(hex(0xd9dcd8), 0.5),
  hazard: paint(hex(0xffc928), 0.42),
  hazardDark: paint(hex(0x1c1d21), 0.5),
  red: paint(hex(0xe23b2e), 0.35),
  white: paint(hex(0xfff7f0), 0.4),
  pvc: paint(hex(0xe8e4da), 0.45),
  wood: paint(hex(0xb07a45), 0.75),
  woodDark: paint(hex(0x7a4e2c), 0.8),
  bamboo: paint(hex(0xc9a35a), 0.6),
  bambooNode: paint(hex(0x9c7a3c), 0.65),
  glass: paint(hex(0x22384a), 0.06, 0.6),
  terracotta: paint(hex(0xb5563a), 0.8),
  soil: paint(hex(0x4a3324), 0.95),
} as const;

export const shade = (p: Paint, k: number): Paint => paint(scaleRGB(p.color, k), p.rough, p.metal, p.emit);
export const tone = (p: Paint, c: RGB, t: number): Paint =>
  paint(mixRGB(p.color, c, t), p.rough, p.metal, p.emit);

/** A rounded box placed by its centre. */
export function rbox(
  w: number,
  h: number,
  d: number,
  r: number,
  p: Paint,
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0,
  n = 1,
): Mesh {
  // Bevels under a centimetre do not read at game distance: keep tiny parts as plain boxes.
  return roundedBox(w, h, d, r < 0.01 ? 0 : r, p, n).transform(trs(x, y, z, rx, ry, rz));
}

/** Cylinder along an axis between two points, with rounded rims. */
export function post(a: Vec3, b: Vec3, r: number, p: Paint, radial = 8): Mesh {
  return tube([a, b], r, radial, p, { caps: 'round', capSteps: 1 });
}

/* ------------------------------------------------------------------ AC unit */

/** Outdoor AC unit (w x h x d) on the ground, fan grille facing +z. */
export function acUnit(w = 0.82, h = 0.58, d = 0.32): Mesh {
  const m = new Mesh();
  m.append(rbox(w, h, d, 0.035, P.acBody, 0, h / 2, 0, 0, 0, 0, 2));
  // Dirty lower band and feet
  m.append(rbox(w + 0.006, 0.05, d + 0.006, 0.012, shade(P.acBody, 0.78), 0, 0.03, 0));
  for (const sx of [-1, 1]) m.append(rbox(0.08, 0.03, d * 0.9, 0, P.rubber, sx * w * 0.36, 0.0, 0));
  // Fan: dark recess, guard rings, spokes, hub
  const g = h * 0.37;
  const fx = -w * 0.13;
  const fz = d / 2;
  m.append(cylinder(g, 0.02, P.dark, 18).transform(trs(fx, h / 2, fz - 0.012, Math.PI / 2)));
  for (const [R, r, n] of [
    [g, 0.011, 20],
    [g * 0.6, 0.007, 14],
  ] as const)
    m.append(ring(R, r, P.chrome, n, 4).transform(trs(fx, h / 2, fz + 0.006, Math.PI / 2)));
  for (let i = 0; i < 4; i++)
    m.append(rbox(g * 2, 0.012, 0.01, 0.004, P.chrome, fx, h / 2, fz + 0.006, 0, 0, (i * Math.PI) / 4));
  m.append(cylinder(g * 0.16, 0.03, P.galv, 10).transform(trs(fx, h / 2, fz - 0.005, Math.PI / 2)));
  // Service panel and vent slats on the side
  m.append(rbox(w * 0.22, h * 0.72, 0.02, 0.008, P.acPanel, w * 0.34, h * 0.5, fz + 0.004));
  for (let i = 0; i < 5; i++)
    m.append(rbox(0.012, 0.022, d * 0.72, 0.005, shade(P.acBody, 0.85), w / 2 + 0.004, 0.13 + i * 0.075, 0));
  // Insulated pipes going down at the back
  m.append(
    tube(
      [
        [w * 0.38, h * 0.3, -d * 0.3],
        [w * 0.38, h * 0.3, -d * 0.62],
        [w * 0.38, h * 0.12, -d * 0.7],
        [w * 0.38, 0.02, -d * 0.7],
      ],
      0.022,
      6,
      P.rubber,
      { caps: 'flat' },
    ),
  );
  return m;
}

/* ------------------------------------------------------------------ water tank */

/** Ribbed plastic water tank (radius r, body height h) with dome lid, standing on y = 0. */
export function tankBody(r: number, h: number, color: RGB): Mesh {
  const prof: LathePoint[] = [
    [0, 0],
    [r * 0.86, 0],
    [r * 0.97, 0.03],
    [r, 0.08],
  ];
  const ribs = 5;
  for (let i = 1; i <= ribs * 4; i++) {
    const y = 0.08 + ((h - 0.16) * i) / (ribs * 4);
    const bulge = Math.sin((i / 4) * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5;
    prof.push([r + bulge * 0.018, y]);
  }
  prof.push([r, h - 0.04], [r * 0.97, h], [r * 0.9, h + 0.06]);
  for (let i = 1; i <= 5; i++) {
    const a = (i / 5) * (Math.PI / 2);
    prof.push([r * 0.9 * Math.cos(a), h + 0.06 + Math.sin(a) * r * 0.26]);
  }
  const body = lathe(prof, 30, paint(color, 0.42));
  body.repaint((_x, y) => (y > h + 0.01 ? paint(mixRGB(color, [1, 1, 1], 0.12), 0.4) : null));
  const m = new Mesh().append(body);
  const top = h + 0.06 + r * 0.26;
  m.append(
    cylinder(r * 0.3, 0.07, paint(scaleRGB(color, 0.85), 0.45), 20, 0.015).transform(trs(0, top - 0.02, 0)),
  );
  // Outlet with an elbow and a little valve
  m.append(
    tube(
      [
        [r * 0.6, 0.12, r * 0.6],
        [r * 0.85, 0.12, r * 0.85],
        [r * 0.95, 0.06, r * 0.95],
        [r * 0.95, -0.4, r * 0.95],
      ],
      0.028,
      8,
      P.pvc,
      { caps: 'flat' },
    ),
  );
  m.append(rbox(0.07, 0.05, 0.07, 0.015, hexPaint(0xd23a2a, 0.4), r * 0.95, -0.12, r * 0.95));
  return m;
}

function hexPaint(c: number, rough: number, metal = 0, emit = 0): Paint {
  return paint(hex(c), rough, metal, emit);
}

/** Steel stand of height `h` for a tank of radius r (platform on top). */
export function tankStand(r: number, h: number): Mesh {
  const m = new Mesh();
  const s = r * 0.82;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      m.append(post([sx * s, 0, sz * s], [sx * s, h, sz * s], 0.035, P.steel, 8));
      m.append(rbox(0.12, 0.02, 0.12, 0.006, P.steel, sx * s, 0.01, sz * s));
    }
  if (h > 0.3) {
    for (const y of [h * 0.42]) {
      for (const sz of [-1, 1]) m.append(post([-s, y, sz * s], [s, y, sz * s], 0.022, P.steel, 6));
      for (const sx of [-1, 1]) m.append(post([sx * s, y, -s], [sx * s, y, s], 0.022, P.steel, 6));
    }
    // Cross braces on the front and back
    for (const sz of [-1, 1]) m.append(post([-s, 0.05, sz * s], [s, h * 0.4, sz * s], 0.014, P.steel, 6));
  }
  m.append(rbox(s * 2 + 0.16, 0.06, s * 2 + 0.16, 0.015, shade(P.steel, 0.85), 0, h + 0.03, 0));
  return m;
}

/** Tank on its stand, standing on y = 0. */
export function waterTank(r: number, h: number, stand: number, color: RGB): Mesh {
  const m = tankStand(r, stand);
  m.append(tankBody(r, h, color).transform(trs(0, stand + 0.06, 0)));
  return m;
}

/* ------------------------------------------------------------------ crates and sacks */

/** Plank crate (w x h x d) on the ground, turned by ry. */
export function crate(w: number, h: number, d: number, toneK: number, seed: number): Mesh {
  const r = rng(seed);
  const base = mixRGB(hex(0xa8723f), hex(0xd2a46a), toneK);
  const m = new Mesh();
  m.append(rbox(w - 0.03, h - 0.03, d - 0.03, 0.015, paint(scaleRGB(base, 0.62), 0.85), 0, h / 2, 0));
  const n = 4;
  const ph = h / n;
  for (let i = 0; i < n; i++) {
    const y = ph * (i + 0.5);
    const c = paint(scaleRGB(base, 0.88 + r() * 0.16), 0.75);
    m.append(rbox(w - 0.05, ph - 0.022, 0.026, 0.01, c, 0, y, d / 2 - 0.004));
    m.append(rbox(w - 0.05, ph - 0.022, 0.026, 0.01, c, 0, y, -d / 2 + 0.004));
    m.append(rbox(0.026, ph - 0.022, d - 0.05, 0.01, c, w / 2 - 0.004, y, 0));
    m.append(rbox(0.026, ph - 0.022, d - 0.05, 0.01, c, -w / 2 + 0.004, y, 0));
  }
  const batten = paint(scaleRGB(base, 0.66), 0.8);
  for (const sx of [-1, 1]) {
    m.append(rbox(0.07, h, 0.032, 0.01, batten, sx * (w / 2 - 0.035), h / 2, d / 2 + 0.012));
    m.append(rbox(0.032, h, 0.07, 0.01, batten, w / 2 + 0.012, h / 2, sx * (d / 2 - 0.035)));
  }
  m.append(
    rbox(Math.hypot(w, h) * 0.86, 0.07, 0.03, 0.01, batten, 0, h / 2, d / 2 + 0.018, 0, 0, Math.atan2(h, w)),
  );
  return m;
}

/** A soft cement sack lying on the ground (sculpted, so it slumps). */
export function sack(w: number, h: number, d: number, color: RGB, band: RGB, seed: number, tris = 420): Mesh {
  const f = (x: number, y: number, z: number) =>
    roundBox(0, h / 2, 0, w / 2, h / 2, d / 2, Math.min(h, d) * 0.48)(x, y + Math.abs(x) * 0.12 - 0.01, z) -
    fbm3(x * 8, y * 8, z * 8, 2, seed) * 0.008;
  return organic(f, {
    min: [-w / 2 - 0.02, -0.02, -d / 2 - 0.02],
    max: [w / 2 + 0.02, h + 0.04, d / 2 + 0.02],
    cell: 0.014,
    tris,
    paint: (x, y, z) =>
      Math.abs(x) < w * 0.2 && z > 0 && y > h * 0.2
        ? paint(band, 0.7)
        : paint(color, 0.9 - fbm3(x * 20, y * 20, z * 20, 1, seed) * 0.05),
  });
}

/* ------------------------------------------------------------------ pipes */

/** Pipe along x from x0 to x1 with crisp colour bands every `band` m. */
export function bandedPipe(
  y: number,
  z: number,
  x0: number,
  x1: number,
  r: number,
  cols: Paint[],
  band: number,
): Mesh {
  const m = new Mesh();
  const n = Math.max(1, Math.round((x1 - x0) / band));
  const w = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const xa = x0 + i * w;
    m.append(rod([xa, y, z], [xa + w, y, z], r, cols[i % cols.length]!, 14, 'flat'));
  }
  return m;
}

/** Flange ring around a pipe along x. */
export function flange(x: number, y: number, z: number, r: number, p: Paint): Mesh {
  return cylinder(r, 0.04, p, 16, 0.01).transform(trs(x - 0.02, y, z, 0, 0, -Math.PI / 2));
}

/* ------------------------------------------------------------------ bamboo and laundry */

/** A bamboo pole with node rings on a small concrete pad. */
export function bambooPole(x: number, z: number, h: number): Mesh {
  const m = new Mesh();
  m.append(rbox(0.3, 0.16, 0.3, 0.04, P.concrete, x, 0.08, z, 0, 0, 0, 2));
  const prof: LathePoint[] = [[0, 0.12]];
  const nodes = 5;
  for (let i = 0; i <= nodes; i++) {
    const y0 = 0.12 + ((h - 0.12) * i) / nodes;
    prof.push([0.042, y0 + 0.01], [0.05, y0 + 0.025], [0.042, y0 + 0.045]);
  }
  prof.push([0.04, h], [0, h + 0.01]);
  const pole = lathe(prof, 10, P.bamboo);
  pole.repaint((_x, y) => {
    const local = ((y - 0.12) / ((h - 0.12) / nodes)) % 1;
    return local < 0.08 || local > 0.97 ? P.bambooNode : null;
  });
  return m.append(pole.transform(trs(x, 0, z)));
}

/** Fabric atlas cells (see the game's clothTexture): sarong, polka, shirt, stripes, floral, batik, tee, towel. */
const CLOTH_ORDER = [0, 3, 5, 6, 7, 2, 4, 1] as const;

/** Hanging clothes along a line `w` wide at height `top`: draped panels with UVs in a 4x2 atlas. */
export function clothes(w: number, top: number, seed: number, minBottom = 1.12): Mesh {
  const r = rng(seed);
  const m = new Mesh();
  const half = w / 2 - 0.14;
  let x = -half;
  const white = paint([1, 1, 1], 0.85);
  let count = 0;
  while (x < half - 0.25) {
    // Neighbouring garments always differ: walk a fixed colourful order from the seed.
    const cell = CLOTH_ORDER[(seed + count++) % CLOTH_ORDER.length]!;
    const cw = Math.min(half - x, 0.42 + r() * 0.26);
    if (cw < 0.24) break;
    const ch = 0.6 + r() * 0.24;
    const bottom = Math.max(minBottom, top - ch);
    const u0 = (cell % 4) / 4;
    const v0 = Math.floor(cell / 4) / 2;
    const cols = 6;
    const rows = 5;
    const base = m.vertexCount;
    const phase = r() * 6;
    for (let j = 0; j <= rows; j++)
      for (let i = 0; i <= cols; i++) {
        const u = i / cols;
        const v = j / rows;
        const px = x + u * cw;
        const py = top - (top - bottom) * v - Math.sin(u * Math.PI) * 0.03 * v;
        // Folds: a soft wave across, stronger towards the hem.
        const pz = Math.sin(u * Math.PI * 3 + phase) * 0.035 * (0.3 + v) + v * 0.02;
        m.vertex(px, py, pz, 0, 0, 1, white, u0 + 0.004 + u * 0.242, v0 + 0.008 + (1 - v) * 0.484);
      }
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const a = base + j * (cols + 1) + i;
        m.tri(a, a + cols + 1, a + cols + 2);
        m.tri(a, a + cols + 2, a + 1);
      }
    x += cw + 0.06;
  }
  m.hasUv = true;
  return normalsFromFaces(m);
}

/** Smooth normals for a sheet (both sides share them; the material is double sided). */
function normalsFromFaces(m: Mesh): Mesh {
  const n = new Float64Array(m.vertexCount * 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let t = 0; t < m.idx.length; t += 3) {
    const i0 = m.idx[t]!;
    const i1 = m.idx[t + 1]!;
    const i2 = m.idx[t + 2]!;
    a.fromArray(m.pos, i0 * 3);
    b.fromArray(m.pos, i1 * 3).sub(a);
    c.fromArray(m.pos, i2 * 3).sub(a);
    b.cross(c);
    for (const i of [i0, i1, i2]) {
      n[i * 3]! += b.x;
      n[i * 3 + 1]! += b.y;
      n[i * 3 + 2]! += b.z;
    }
  }
  for (let i = 0; i < m.vertexCount; i++) {
    const l = Math.hypot(n[i * 3]!, n[i * 3 + 1]!, n[i * 3 + 2]!) || 1;
    m.nor[i * 3] = n[i * 3]! / l;
    m.nor[i * 3 + 1] = n[i * 3 + 1]! / l;
    m.nor[i * 3 + 2] = n[i * 3 + 2]! / l;
  }
  return m;
}

/** Poles, two sagging lines and pegs for a laundry line `w` wide (clothes separate). */
export function laundryFrame(w: number, top = 1.97): Mesh {
  const half = w / 2;
  const posts = w > 3 ? [-half, -half / 3, half / 3, half] : [-half, half];
  const m = new Mesh();
  for (const x of posts) m.append(bambooPole(x, 0, top + 0.22));
  for (let i = 0; i < posts.length - 1; i++) {
    const a = posts[i]!;
    const b = posts[i + 1]!;
    for (const [dz, dy] of [
      [0.03, 0],
      [-0.03, -0.04],
    ] as const)
      m.append(
        tube(sagPath([a, top + dy, dz], [b, top + dy, dz], 0.06, 12), 0.007, 5, P.rubber, { caps: 'none' }),
      );
  }
  const pegA = hexPaint(0xff7a2e, 0.4);
  const pegB = hexPaint(0x2f8cff, 0.4);
  let k = 0;
  for (let x = -half + 0.2; x < half - 0.1; x += 0.24) {
    const sag = Math.sin(((x + half) / w) * Math.PI) * 0.0;
    m.append(rbox(0.024, 0.07, 0.03, 0.008, k++ % 2 ? pegA : pegB, x, top - 0.02 - sag, 0.03));
  }
  return m;
}

/* ------------------------------------------------------------------ plants */

/** A terracotta pot (radius r) with a rim, standing on y = 0. */
export function pot(r: number, h: number, p: Paint = P.terracotta): Mesh {
  const prof: LathePoint[] = [
    [0, 0],
    [r * 0.72, 0],
    [r * 0.76, 0.02],
    [r * 0.95, h - 0.06],
    [r * 1.08, h - 0.055, true],
    [r * 1.1, h - 0.01],
    [r * 1.06, h, true],
    [r * 0.94, h, true],
    [r * 0.92, h - 0.05],
    [0, h - 0.05],
  ];
  const m = lathe(prof, 20, p);
  m.repaint((_x, y) => (Math.abs(y - (h - 0.05)) < 0.002 ? P.soil : null));
  return m;
}

/** A leafy bush clump (sculpted) of about radius r centred above the origin. */
export function bush(r: number, seed: number, green: RGB, tris = 520): Mesh {
  const rand = rng(seed);
  const balls: [number, number, number, number][] = [[0, r * 0.7, 0, r * 0.75]];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rand() * 0.6;
    balls.push([
      Math.cos(a) * r * 0.55,
      r * (0.45 + rand() * 0.5),
      Math.sin(a) * r * 0.55,
      r * (0.42 + rand() * 0.2),
    ]);
  }
  const f = clump(balls, r * 0.3, r * 0.08, seed);
  const dark = scaleRGB(green, 0.55);
  const light = mixRGB(green, hex(0xd9f27a), 0.35);
  return organic(f, {
    min: [-r * 1.4, -r * 0.2, -r * 1.4],
    max: [r * 1.4, r * 1.7, r * 1.4],
    cell: r * 0.09,
    tris,
    paint: (x, y, z) => {
      const n = fbm3(x * 6, y * 6, z * 6, 2, seed + 4);
      return paint(
        mixRGB(
          mixRGB(dark, green, Math.min(1, y / r)),
          light,
          Math.max(0, n) * 0.9 + Math.max(0, y / r - 1) * 0.6,
        ),
        0.65,
      );
    },
  });
}

/** Spiky leaves (snake plant / pandan) fanning out of a pot. */
export function spikyLeaves(n: number, h: number, seed: number): Mesh {
  const r = rng(seed);
  const m = new Mesh();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.5;
    const lean = 0.15 + r() * 0.35;
    m.append(
      blade({
        base: [Math.cos(a) * 0.03, 0, Math.sin(a) * 0.03],
        dir: [Math.cos(a) * lean, 1, Math.sin(a) * lean],
        side: [-Math.sin(a), 0, Math.cos(a)],
        length: h * (0.7 + r() * 0.4),
        width: 0.07,
        widthAt: (s) => Math.sin(Math.PI * Math.min(1, 0.15 + s * 0.85)) ** 0.6,
        droop: 0.3,
        fold: 0.25,
        steps: 5,
        paint: (s) => paint(mixRGB(hex(0x2e6b2f), hex(0x8fc24a), s * 0.8 + hash1(i, 2) * 0.2), 0.5),
      }),
    );
  }
  return m;
}

/** Quick helper: a flat textured quad facing +z (signs). */
export function faceQuad(x0: number, y0: number, x1: number, y1: number, z: number): Mesh {
  return quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], paint([1, 1, 1], 0.6));
}
