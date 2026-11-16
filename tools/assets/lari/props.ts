/**
 * Lari Terus props pack: the lane obstacles (pipe rack, striped barrier, duct, duck-under sign,
 * laundry lines, AC stack, water tank, crates, AC row), the coin, and the rooftop clutter
 * (tanks, AC units, antenna, dish, potted plants, stair hut, pigeon coop, solar heater, chairs,
 * turbine vents, festoon posts, a garden tree and a planter). Every model gets baked
 * occlusion against itself and the roof it stands on, and a lighter `@1` level of detail.
 *
 * Model space: y up, ground at y = 0, the face a runner sees first points to +z, centred on x.
 * Single-lane obstacles fit in 1.75 m of width; wide ones span the three lanes (6.6 m).
 * Material names: `surface` (vertex colours + per-vertex surface), `cloth` (fabric atlas UVs),
 * `duck` (sign face UVs), `gold` (the coin).
 */

import * as THREE from 'three';
import { bakeAo } from '../src/ao';
import { hex, mixRGB } from '../src/color';
import { clump } from '../src/foliage';
import type { Glb } from '../src/gltf';
import { decimate } from '../src/lod';
import { Mesh, merge, paint, trs } from '../src/mesh';
import { fbm3 } from '../src/noise';
import { creaseNormals } from '../src/normals';
import { organic } from '../src/organic';
import { blend, capsule, displace, type Sdf } from '../src/sdf';
import { cylinder, ellipsoid, extrude, type LathePoint, lathe, ring, rod, tube } from '../src/shapes';
import {
  acUnit,
  bandedPipe,
  bush,
  clothes,
  crate,
  faceQuad,
  flange,
  laundryFrame,
  P,
  post,
  pot,
  rbox,
  sack,
  shade,
  spikyLeaves,
  waterTank,
} from './kit';

/** A model: primitives by material, plus how it is shaded and reduced. */
interface Model {
  name: string;
  parts: { mesh: Mesh; material: string }[];
  /** Ambient occlusion reach (m); 0 skips baking. */
  ao: number;
  /** Triangle share kept by the `@1` level (0 = no LOD). */
  lod: number;
}

/* ------------------------------------------------------------------ obstacles */

/** low 0: a hazard-banded pipe and a grey pipe on steel brackets with concrete pads (top 0.7 m). */
function pipeRack(): Mesh {
  const m = new Mesh();
  for (const sx of [-1, 1]) {
    m.append(rbox(0.34, 0.12, 0.44, 0.03, P.concrete, sx * 0.72, 0.06, 0, 0, 0, 0, 2));
    m.append(post([sx * 0.72, 0.1, 0], [sx * 0.72, 0.7, 0], 0.035, P.steel));
    m.append(rbox(0.14, 0.035, 0.22, 0.012, P.steel, sx * 0.72, 0.71, 0));
    for (const [y, r] of [
      [0.62, 0.075],
      [0.34, 0.06],
    ] as const)
      m.append(
        ring(r + 0.012, 0.012, P.galv, 18, 5, Math.PI).transform(trs(sx * 0.72, y, 0, 0, 0, Math.PI / 2)),
      );
  }
  m.append(bandedPipe(0.62, 0, -0.86, 0.86, 0.075, [P.hazard, P.hazardDark], 0.2));
  m.append(bandedPipe(0.34, 0.02, -0.86, 0.86, 0.06, [P.pvc, shade(P.pvc, 0.7)], 0.57));
  for (const sx of [-1, 1]) {
    m.append(flange(sx * 0.86, 0.62, 0, 0.095, P.galv));
    m.append(flange(sx * 0.86, 0.34, 0.02, 0.078, P.galv));
  }
  return m;
}

/** low 1: an A-frame barrier with red and white stripes and an amber lamp. */
function sawhorse(): Mesh {
  const m = new Mesh();
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1])
      m.append(rbox(0.06, 0.78, 0.05, 0.015, P.wood, sx * 0.74, 0.37, sz * 0.11, -sz * 0.3, 0, 0));
    m.append(rbox(0.05, 0.05, 0.3, 0.015, P.woodDark, sx * 0.74, 0.3, 0));
    m.append(rbox(0.14, 0.04, 0.36, 0.012, P.rubber, sx * 0.74, 0.02, 0));
  }
  const n = 7;
  const w = 1.78 / n;
  for (let i = 0; i < n; i++) {
    const x = -0.89 + w * (i + 0.5);
    m.append(rbox(w - 0.004, 0.2, 0.05, 0.012, i % 2 ? P.white : P.red, x, 0.62, 0.05));
    m.append(rbox(w - 0.004, 0.12, 0.045, 0.01, i % 2 ? P.red : P.white, x, 0.3, 0.05));
  }
  // Lamp on the right end
  m.append(rbox(0.1, 0.06, 0.08, 0.02, P.hazardDark, 0.8, 0.75, 0.05));
  m.append(
    ellipsoid(0.06, 0.05, 0.06, paint(hex(0xffa531), 0.3, 0, 0.9), 14, 8).transform(trs(0.8, 0.8, 0.05)),
  );
  return m;
}

/** low 2 (wide): an insulated silver duct across the roof on stands, top at about 0.66 m. */
function ductAcross(): Mesh {
  const half = 3.3;
  const m = new Mesh();
  m.append(rod([-half, 0.38, 0], [half, 0.38, 0], 0.27, P.galv, 28, 'flat'));
  for (let x = -half + 0.4; x <= half - 0.3; x += 0.8)
    m.append(ring(0.276, 0.016, shade(P.galv, 0.8), 28, 5).transform(trs(x, 0.38, 0, 0, 0, Math.PI / 2)));
  for (const x of [-1.9, 0, 1.9])
    m.append(rod([x - 0.13, 0.38, 0], [x + 0.13, 0.38, 0], 0.284, P.hazard, 28, 'flat'));
  for (const x of [-half + 0.5, -1, 1, half - 0.5]) {
    m.append(rbox(0.16, 0.14, 0.56, 0.03, P.steel, x, 0.07, 0));
    m.append(ring(0.29, 0.02, P.steel, 20, 5, Math.PI).transform(trs(x, 0.38, 0, 0, 0, Math.PI / 2)));
  }
  for (const sx of [-1, 1])
    m.append(
      cylinder(0.29, 0.06, P.rubber, 28, 0.02).transform(
        trs(sx * (half + 0.03), 0.38, 0, 0, 0, (sx * -Math.PI) / 2),
      ),
    );
  return m;
}

/** high 0: a board on two posts (face is the `duck` primitive), board from 1.15 to 1.85 m. */
function signPosts(): Mesh {
  const m = new Mesh();
  for (const sx of [-1, 1]) {
    m.append(rbox(0.3, 0.16, 0.3, 0.035, P.concrete, sx * 0.86, 0.08, 0, 0, 0, 0, 2));
    m.append(post([sx * 0.86, 0.1, 0], [sx * 0.86, 2.08, 0], 0.045, paint(hex(0x2b2d33), 0.4, 0.3)));
    m.append(ellipsoid(0.07, 0.07, 0.07, P.hazard, 14, 8).transform(trs(sx * 0.86, 2.12, 0)));
  }
  m.append(rbox(1.8, 0.8, 0.06, 0.025, paint(hex(0x3a3c42), 0.4, 0.4), 0, 1.5, -0.035, 0, 0, 0, 2));
  return m;
}

/** block 0: a steel rack holding four AC units, 1.6 m tall. */
function acStack(): Mesh {
  const m = new Mesh();
  const W = 1.72;
  const D = 1.1;
  const sx0 = W * 0.47;
  const sz0 = D * 0.4;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      m.append(post([sx * sx0, 0, sz * sz0], [sx * sx0, 1.38, sz * sz0], 0.03, P.steel, 8));
  for (const y of [0.06, 0.7, 1.34]) {
    for (const sz of [-1, 1]) m.append(post([-sx0, y, sz * sz0], [sx0, y, sz * sz0], 0.024, P.steel, 6));
    for (const sx of [-1, 1]) m.append(post([sx * sx0, y, -sz0], [sx * sx0, y, sz0], 0.024, P.steel, 6));
  }
  const unit = acUnit(0.8, 0.56, 0.3);
  for (const y of [0.08, 0.72])
    for (const sx of [-1, 1]) {
      m.append(unit, trs(sx * 0.42, y, 0.2));
      m.append(unit, trs(sx * 0.42, y, -0.24, 0, Math.PI));
    }
  m.append(rbox(W + 0.1, 0.06, D + 0.1, 0.02, P.concrete, 0, 0.03, 0, 0, 0, 0, 2));
  return m;
}

/** block 2: three crates and two cement sacks (1.75 m tall). */
function crateStack(): Mesh {
  const m = new Mesh();
  m.append(crate(0.8, 0.8, 0.9, 0.2, 1), trs(-0.42, 0, 0.05, 0, 0.04));
  m.append(crate(0.78, 0.78, 0.88, 0.7, 2), trs(0.44, 0, -0.05, 0, -0.05));
  m.append(crate(0.78, 0.74, 0.86, 0.45, 3), trs(0.02, 0.8, 0, 0, 0.12));
  m.append(sack(0.5, 0.2, 0.32, hex(0xd9d2c3), hex(0x2f8cff), 4), trs(-0.48, 0, 0.66, 0, 0.1));
  m.append(sack(0.5, 0.2, 0.32, hex(0xcfc6b4), hex(0xc8372d), 5), trs(0.06, 0, 0.66, 0, -0.08));
  return m;
}

/** block 3 segment (1.25 m long): a plinth with two AC units back to back and a cable. */
const AC_ROW_STEP = 1.25;
function acRowSegment(): Mesh {
  const m = new Mesh();
  m.append(rbox(1.7, 0.22, AC_ROW_STEP - 0.03, 0.04, P.concrete, 0, 0.11, 0, 0, 0, 0, 2));
  const unit = acUnit(0.8, 0.6, 0.32);
  m.append(unit, trs(-0.43, 0.22, 0, 0, Math.PI / 2));
  m.append(unit, trs(0.43, 0.22, 0, 0, -Math.PI / 2));
  m.append(rod([0, 0.9, -0.62], [0, 0.9, 0.62], 0.03, P.rubber, 8));
  m.append(rbox(0.06, 0.1, 0.06, 0.012, P.galv, 0, 0.86, 0));
  return m;
}

/* ------------------------------------------------------------------ coin */

/** A gold coin standing upright (faces +-z), 0.56 m across, raised rim and an embossed star. */
function coin(): Mesh {
  const gold = paint(hex(0xffc23a), 0.24, 1);
  const prof: LathePoint[] = [
    [0, -0.045],
    [0.2, -0.045, true],
    [0.215, -0.062],
    [0.27, -0.062],
    [0.287, -0.04],
    [0.287, 0.04],
    [0.27, 0.062],
    [0.215, 0.062],
    [0.2, 0.045, true],
    [0, 0.045],
  ];
  const m = lathe(prof, 26, gold).transform(trs(0, 0, 0, Math.PI / 2));
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 0.068 : 0.155;
    if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  star.closePath();
  const s = extrude(star, 0.022, paint(hex(0xffd65a), 0.2, 1), 0.01, 1, 1);
  m.append(s, trs(0, 0, 0.032));
  m.append(s, trs(0, 0, -0.032, 0, Math.PI));
  return m;
}

/* ------------------------------------------------------------------ decor */

function antenna(): Mesh {
  const m = new Mesh();
  m.append(rbox(0.3, 0.1, 0.3, 0.03, P.concrete, 0, 0.05, 0, 0, 0, 0, 2));
  m.append(post([0, 0.05, 0], [0, 3.4, 0], 0.03, P.galv, 8));
  for (let i = 0; i < 6; i++) {
    const y = 2.4 + i * 0.16;
    const w = 0.9 - i * 0.1;
    m.append(rod([-w / 2, y, 0], [w / 2, y, 0], 0.012, P.chrome, 5, 'round'));
  }
  m.append(rod([0, 2.4, 0], [0, 3.25, 0.5], 0.014, P.galv, 5));
  for (const a of [0.3, 2.4, 4.4])
    m.append(
      tube(
        [
          [0, 2.0, 0],
          [Math.cos(a) * 1.2, 0.02, Math.sin(a) * 1.2],
        ],
        0.006,
        4,
        P.rubber,
        { caps: 'none' },
      ),
    );
  return m;
}

function dish(): Mesh {
  const m = new Mesh();
  m.append(rbox(0.36, 0.08, 0.36, 0.02, P.steel, 0, 0.04, 0));
  m.append(post([0, 0.05, 0], [0, 1.15, 0], 0.035, P.steel, 10));
  const prof: LathePoint[] = [];
  for (let i = 0; i <= 8; i++) {
    const r = (i / 8) * 0.43;
    prof.push([r, -0.1 + (r / 0.43) ** 2 * 0.13]);
  }
  prof.push([0.445, 0.035, true], [0.42, 0.02, true]);
  for (let i = 8; i >= 0; i--) {
    const r = (i / 8) * 0.415;
    prof.push([r, -0.085 + (r / 0.415) ** 2 * 0.1 + 0.005]);
  }
  // Two-sided dish: outer shell then inner face back to the centre.
  const d = lathe(prof, 28, paint(hex(0xf2f1ec), 0.4));
  m.append(d, trs(0, 1.3, 0.05, Math.PI / 2 - 0.55));
  m.append(rod([0, 1.12, 0.2], [0, 1.42, 0.52], 0.012, P.steel, 5));
  m.append(rbox(0.07, 0.06, 0.12, 0.015, P.dark, 0, 1.45, 0.55, 0.5));
  return m;
}

function plants(): Mesh {
  const m = new Mesh();
  const pots: [number, number, number, number][] = [
    [0, 0, 0.3, 0x3f9e4a],
    [0.46, 0.2, 0.24, 0x5bb04c],
    [-0.4, 0.24, 0.22, 0x2f7f3f],
  ];
  pots.forEach(([x, z, r, leaf], i) => {
    const h = r * 1.3;
    m.append(pot(r, h), trs(x, 0, z));
    if (i === 2) m.append(spikyLeaves(9, 0.55, 11), trs(x, h - 0.05, z));
    else m.append(bush(r * 1.05, 20 + i, hex(leaf), 340), trs(x, h - 0.08, z));
  });
  return m;
}

/** Stair-head room: plaster walls, a blue door with lamp, small window, flat roof with drip edge. */
function hut(): Mesh {
  const m = new Mesh();
  const wall = paint(hex(0xf1e6d2), 0.92);
  m.append(rbox(2.4, 2.6, 2.4, 0.05, wall, 0, 1.3, 0, 0, 0, 0, 2));
  m.append(rbox(2.62, 0.14, 2.62, 0.04, paint(hex(0xd8cdb8), 0.85), 0, 2.66, 0, 0, 0, 0, 2));
  m.append(rbox(2.5, 0.14, 2.5, 0.03, P.concrete, 0, 0.07, 0));
  // Door with frame and handle
  m.append(rbox(0.98, 2.0, 0.06, 0.02, paint(hex(0xe2d6c0), 0.8), 0.3, 1.0, 1.205));
  m.append(rbox(0.84, 1.88, 0.05, 0.015, paint(hex(0x2f6fb6), 0.35), 0.3, 0.98, 1.23, 0, 0, 0, 2));
  for (const y of [0.55, 1.4]) m.append(rbox(0.7, 0.5, 0.02, 0.01, paint(hex(0x2a62a3), 0.4), 0.3, y, 1.255));
  m.append(ellipsoid(0.035, 0.035, 0.035, P.chrome, 10, 6).transform(trs(0.62, 1.0, 1.28)));
  // Lamp over the door
  m.append(rbox(0.2, 0.1, 0.12, 0.03, P.dark, 0.3, 2.2, 1.24));
  m.append(
    ellipsoid(0.08, 0.06, 0.06, paint(hex(0xffd27a), 0.3, 0, 0.85), 12, 7).transform(trs(0.3, 2.14, 1.28)),
  );
  // Window with frame, glass and sill
  m.append(rbox(0.6, 0.6, 0.06, 0.015, paint(hex(0xd8cdb8), 0.8), -0.72, 1.62, 1.205));
  m.append(rbox(0.5, 0.5, 0.03, 0.008, P.glass, -0.72, 1.62, 1.215));
  m.append(rbox(0.04, 0.5, 0.04, 0.008, paint(hex(0xd8cdb8), 0.8), -0.72, 1.62, 1.23));
  m.append(rbox(0.7, 0.05, 0.12, 0.012, paint(hex(0xd8cdb8), 0.8), -0.72, 1.3, 1.25));
  // Downpipe at the back corner
  m.append(
    tube(
      [
        [1.12, 2.6, -1.12],
        [1.12, 0.12, -1.12],
        [1.2, 0.06, -1.2],
      ],
      0.04,
      8,
      P.pvc,
      { caps: 'flat' },
    ),
  );
  return m;
}

function coop(): Mesh {
  const m = new Mesh();
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) m.append(rbox(0.08, 2.0, 0.08, 0.02, P.woodDark, sx * 0.55, 1.0, sz * 0.45));
  m.append(rbox(1.3, 0.05, 0.09, 0.015, P.woodDark, 0, 1.3, 0.45, 0, 0, 0.5));
  m.append(rbox(1.4, 0.7, 1.2, 0.03, paint(hex(0xc58a52), 0.75), 0, 2.35, 0, 0, 0, 0, 2));
  for (let i = 0; i < 5; i++)
    m.append(rbox(1.42, 0.02, 0.02, 0.006, paint(hex(0x9a6a3e), 0.8), 0, 2.07 + i * 0.13, 0.605));
  m.append(rbox(1.6, 0.1, 1.42, 0.03, paint(hex(0x3b6e5a), 0.5), 0, 2.76, 0, 0, 0, 0, 2));
  for (let i = 0; i < 3; i++) m.append(rbox(0.2, 0.22, 0.03, 0.04, P.rubber, -0.4 + i * 0.4, 2.32, 0.6));
  m.append(rbox(1.3, 0.04, 0.3, 0.012, paint(hex(0x9a6a3e), 0.8), 0, 2.1, 0.75));
  m.append(post([0.62, 2.8, 0], [0.62, 3.9, 0], 0.02, P.galv, 6));
  const flag = new Mesh();
  const f = paint(hex(0xff7a2e), 0.6);
  const a = flag.vertex(0.62, 3.9, 0, 0, 0, 1, f);
  const b = flag.vertex(0.62, 3.6, 0, 0, 0, 1, f);
  const c = flag.vertex(1.2, 3.74, 0.05, 0, 0, 1, f);
  flag.tri(a, b, c);
  const a2 = flag.vertex(0.62, 3.9, 0, 0, 0, -1, f);
  const b2 = flag.vertex(0.62, 3.6, 0, 0, 0, -1, f);
  const c2 = flag.vertex(1.2, 3.74, 0.05, 0, 0, -1, f);
  flag.tri(a2, c2, b2);
  return m.append(flag);
}

function solar(): Mesh {
  const m = new Mesh();
  for (const sx of [-1, 1]) {
    m.append(post([sx * 0.8, 0, 0.6], [sx * 0.8, 0.52, 0.6], 0.03, P.galv, 6));
    m.append(post([sx * 0.8, 0, -0.6], [sx * 0.8, 1.32, -0.6], 0.03, P.galv, 6));
  }
  m.append(rbox(1.82, 0.07, 1.52, 0.025, paint(hex(0xc9ced3), 0.35, 0.6), 0, 0.95, 0, 0.52));
  m.append(rbox(1.7, 0.02, 1.4, 0.008, paint(hex(0x1d3550), 0.05, 0.5), 0, 0.99, 0.02, 0.52));
  for (let i = 0; i < 9; i++)
    m.append(rbox(0.05, 0.03, 1.38, 0.012, P.dark, -0.8 + i * 0.2, 0.99, 0.02, 0.52));
  m.append(rod([-0.95, 1.55, -0.72], [0.95, 1.55, -0.72], 0.21, paint(hex(0xf2f1ec), 0.4), 18, 'round'));
  for (const sx of [-1, 1])
    m.append(ring(0.215, 0.012, P.galv, 18, 5).transform(trs(sx * 0.7, 1.55, -0.72, 0, 0, Math.PI / 2)));
  return m;
}

function chairs(): Mesh {
  const m = new Mesh();
  const white = paint(hex(0xf2f1ec), 0.35);
  m.append(cylinder(0.4, 0.04, white, 24, 0.015).transform(trs(0, 0.68, 0)));
  m.append(post([0, 0.02, 0], [0, 0.69, 0], 0.035, white, 10));
  m.append(cylinder(0.2, 0.03, white, 16, 0.01));
  for (const [x, z, a, c] of [
    [-0.7, 0.1, 0.4, 0xd7342b],
    [0.65, -0.15, -2.6, 0x2f8cff],
  ] as const) {
    const p = paint(hex(c), 0.35);
    const ch = new Mesh();
    ch.append(rbox(0.46, 0.05, 0.44, 0.02, p, 0, 0.44, 0, 0, 0, 0, 2));
    ch.append(rbox(0.46, 0.46, 0.04, 0.03, p, 0, 0.72, -0.21, -0.14, 0, 0, 2));
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        ch.append(post([sx * 0.19, 0, sz * 0.19], [sx * 0.2, 0.44, sz * 0.18], 0.02, p, 6));
    m.append(ch, trs(x, 0, z, 0, a));
  }
  return m;
}

/** Two turbine roof vents: a ribbed ball on a short stack. */
function vents(): Mesh {
  const m = new Mesh();
  for (const [x, z, h] of [
    [0, 0, 0.8],
    [0.42, 0.26, 0.58],
  ] as const) {
    m.append(cylinder(0.09, h, P.galv, 14, 0.01).transform(trs(x, 0, z)));
    m.append(rbox(0.3, 0.04, 0.3, 0.01, P.steel, x, 0.02, z));
    const prof: LathePoint[] = [];
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI;
      prof.push([Math.max(0, Math.sin(a)) * 0.19, h + 0.19 - Math.cos(a) * 0.19]);
    }
    const ball = lathe(prof, 24, paint(hex(0xc9ced3), 0.3, 0.8));
    // Fins: ridges every 15 degrees.
    for (let i = 0; i < ball.vertexCount; i++) {
      const vx = ball.pos[i * 3]!;
      const vz = ball.pos[i * 3 + 2]!;
      const a = Math.atan2(vz, vx);
      const k = 1 + Math.abs(Math.sin(a * 12)) * 0.06;
      ball.pos[i * 3] = vx * k;
      ball.pos[i * 3 + 2] = vz * k;
    }
    m.append(creaseNormals(ball, 50).transform(trs(x, 0, z)));
    m.append(cylinder(0.03, 0.05, P.steel, 8).transform(trs(x, h + 0.37, z)));
  }
  return m;
}

function festoonPost(): Mesh {
  const m = new Mesh();
  m.append(post([0, 0, 0], [0, 2.5, 0], 0.03, paint(hex(0x3a3c42), 0.45, 0.4), 8));
  m.append(ellipsoid(0.06, 0.06, 0.06, paint(hex(0x3a3c42), 0.45, 0.4), 10, 6).transform(trs(0, 2.52, 0)));
  m.append(rbox(0.12, 0.08, 0.12, 0.02, P.steel, 0, 0.04, 0));
  return m;
}

/** A small rooftop garden tree in a square planter (sculpted trunk and crown). */
function tree(): Mesh {
  const m = new Mesh();
  const planter = paint(hex(0xc9bfae), 0.9);
  m.append(rbox(1.2, 0.6, 1.2, 0.06, planter, 0, 0.3, 0, 0, 0, 0, 2));
  m.append(rbox(1.04, 0.04, 1.04, 0.02, P.soil, 0, 0.6, 0));
  const trunk: Sdf = blend(
    0.05,
    capsule(0, 0.5, 0, 0.05, 1.5, 0.02, 0.08, 0.055),
    capsule(0.05, 1.4, 0.02, 0.32, 1.95, 0.08, 0.04, 0.03),
    capsule(0.04, 1.5, 0.02, -0.25, 2.05, -0.06, 0.04, 0.03),
  );
  m.append(
    organic(trunk, {
      min: [-0.35, 0.45, -0.2],
      max: [0.45, 2.15, 0.25],
      cell: 0.025,
      tris: 380,
      paint: (x, y, z) =>
        paint(mixRGB(hex(0x6b4a30), hex(0x8a6644), 0.5 + fbm3(x * 20, y * 6, z * 20, 2, 3) * 0.6), 0.85),
    }),
  );
  const crown = clump(
    [
      [0, 2.25, 0, 0.62],
      [0.45, 2.1, 0.1, 0.42],
      [-0.42, 2.15, -0.1, 0.44],
      [0.1, 2.6, 0.12, 0.45],
      [-0.1, 2.0, 0.4, 0.38],
      [0.05, 2.05, -0.42, 0.38],
    ],
    0.22,
    0.06,
    31,
  );
  m.append(
    organic(crown, {
      min: [-1.0, 1.4, -1.0],
      max: [1.0, 3.2, 1.0],
      cell: 0.05,
      tris: 800,
      paint: (x, y, z) => {
        const n = fbm3(x * 4, y * 4, z * 4, 2, 7);
        const lit = Math.max(0, (y - 2.0) * 0.9 + n * 0.5);
        return paint(
          mixRGB(mixRGB(hex(0x2c6b2c), hex(0x4f9a3a), lit), hex(0xa9d45a), Math.max(0, n) * 0.6 * lit),
          0.7,
        );
      },
    }),
  );
  return m;
}

/** A long planter with low shrubs and two stones. */
function planter(): Mesh {
  const m = new Mesh();
  m.append(rbox(2.2, 0.45, 0.7, 0.05, paint(hex(0xd8d0c2), 0.9), 0, 0.225, 0, 0, 0, 0, 2));
  m.append(rbox(2.06, 0.04, 0.56, 0.02, P.soil, 0, 0.44, 0));
  m.append(bush(0.32, 41, hex(0x3f8f3c), 360), trs(-0.6, 0.38, 0));
  m.append(bush(0.28, 42, hex(0x5aa548), 320), trs(0.15, 0.38, 0.02));
  m.append(spikyLeaves(7, 0.5, 43), trs(0.75, 0.42, 0));
  const rock = (seed: number, r: number): Mesh =>
    organic(
      displace(
        blend(
          0.04,
          ...[0, 1].map((k) =>
            capsule(-r * 0.4 + k * r * 0.3, 0, 0, r * 0.4, r * 0.1, 0, r * 0.55, r * 0.45),
          ),
        ),
        (x, y, z) => fbm3(x * 9, y * 9, z * 9, 2, seed) * r * 0.25,
      ),
      {
        min: [-r * 1.4, -r, -r],
        max: [r * 1.4, r, r],
        cell: r * 0.12,
        tris: 140,
        paint: (x, y, z) =>
          paint(
            mixRGB(hex(0x8d877d), hex(0xb9b2a6), 0.5 + fbm3(x * 15, y * 15, z * 15, 2, seed) * 0.7),
            0.85,
          ),
      },
    );
  m.append(rock(51, 0.12), trs(-0.15, 0.46, 0.15, 0, 0.6));
  m.append(rock(52, 0.09), trs(0.4, 0.46, -0.15, 0, 2.1));
  return m;
}

/* ------------------------------------------------------------------ catalogue */

/** Rooftop clutter (not obstacles): these get the extra `@2` level. */
const DECOR = new Set([
  'tankOrange',
  'tankBlue',
  'ac',
  'antenna',
  'dish',
  'plants',
  'hut',
  'coop',
  'solar',
  'chairs',
  'vents',
  'tree',
  'planter',
]);

const ORANGE = hex(0xff8a2e);
const BLUE = hex(0x2f8cff);

function catalogue(): Model[] {
  const s = (name: string, mesh: Mesh, ao: number, lod = 0.35): Model => ({
    name,
    parts: [{ mesh, material: 'surface' }],
    ao,
    lod,
  });
  const laundry = (name: string, w: number, seed: number): Model => ({
    name,
    parts: [
      { mesh: laundryFrame(w), material: 'surface' },
      { mesh: clothes(w, 1.95, seed), material: 'cloth' },
    ],
    ao: 0.4,
    lod: 0.35,
  });
  return [
    s('low0', pipeRack(), 0.35),
    s('low1', sawhorse(), 0.35),
    s('low2', ductAcross(), 0.5),
    {
      name: 'high0',
      parts: [
        { mesh: signPosts(), material: 'surface' },
        { mesh: faceQuad(-0.86, 1.13, 0.86, 1.87, 0.0), material: 'duck' },
      ],
      ao: 0.35,
      lod: 0.35,
    },
    laundry('high1-0', 1.8, 3),
    laundry('high1-1', 1.8, 8),
    laundry('high2', 6.6, 11),
    s('block0', acStack(), 0.45),
    s('block1', waterTank(0.66, 1.25, 0.95, ORANGE), 0.5),
    s('block2', crateStack(), 0.4),
    s('block3', acRowSegment(), 0.4),
    { name: 'coin', parts: [{ mesh: coin(), material: 'gold' }], ao: 0, lod: 0.4 },
    s('tankOrange', waterTank(0.62, 1.15, 0.55, ORANGE), 0.5),
    s('tankBlue', waterTank(0.58, 1.1, 1.1, BLUE), 0.5),
    s(
      'ac',
      merge(
        rbox(0.9, 0.06, 0.4, 0.015, P.steel, 0, 0.06, 0),
        acUnit(0.84, 0.58, 0.32).transform(trs(0, 0.09, 0)),
      ),
      0.35,
    ),
    s('antenna', antenna(), 0.3, 0.5),
    s('dish', dish(), 0.35),
    s('plants', plants(), 0.35, 0.3),
    s('hut', hut(), 0.8),
    s('coop', coop(), 0.6),
    s('solar', solar(), 0.5),
    s('chairs', chairs(), 0.4),
    s('vents', vents(), 0.35),
    s('post', festoonPost(), 0.2, 0.5),
    s('tree', tree(), 0.6, 0.3),
    s('planter', planter(), 0.4, 0.3),
  ];
}

export function writeProps(glb: Glb, log: (r: { name: string; tris: number }) => void): void {
  const mats = new Map<string, number>([
    ['surface', glb.addMaterial({ name: 'surface', rough: 0.7 })],
    ['cloth', glb.addMaterial({ name: 'cloth', rough: 0.85, doubleSided: true })],
    ['duck', glb.addMaterial({ name: 'duck', rough: 0.6 })],
    ['gold', glb.addMaterial({ name: 'gold', color: [1, 0.76, 0.23, 1], metal: 1, rough: 0.24 })],
  ]);
  const nodes: number[] = [];
  for (const model of catalogue()) {
    // Occlusion against every part of the model and the roof under it.
    if (model.ao > 0) {
      for (const part of model.parts) {
        const others = model.parts.filter((p) => p !== part).map((p) => p.mesh);
        bakeAo(part.mesh, { distance: model.ao, rays: 40, strength: 0.85, ground: 0, occluders: others });
      }
    }
    const levels: [string, { mesh: Mesh; material: string }[]][] = [[model.name, model.parts]];
    const reduce = (share: number) =>
      model.parts.map((p) => ({
        mesh:
          p.material === 'surface' || p.material === 'gold'
            ? decimate(p.mesh, Math.max(12, Math.round(p.mesh.triangleCount * share)))
            : p.mesh,
        material: p.material,
      }));
    if (model.lod > 0) levels.push([`${model.name}@1`, reduce(model.lod)]);
    // Rooftop clutter also gets a very light `@2` for weak GPUs and far rooftops.
    if (model.lod > 0 && DECOR.has(model.name)) levels.push([`${model.name}@2`, reduce(0.12)]);
    for (const [name, parts] of levels) {
      const ref = glb.addMesh(
        name,
        parts.map((p) => ({ mesh: p.mesh, material: mats.get(p.material)! })),
        { quantize: true },
      );
      nodes.push(glb.addNode({ name, mesh: ref.mesh, translation: ref.translation, scale: ref.scale }));
      log({ name, tris: parts.reduce((t, p) => t + p.mesh.triangleCount, 0) });
    }
  }
  glb.setScene(nodes);
}
