/**
 * Lari Terus city pack: modular building pieces that the game instances along the run, and the
 * sky's puffy clouds.
 *
 *  - `parapet`, `parapet_s`: 3.2 m of parapet wall with a rounded coping, outer face at +x
 *    (`_s` adds a scupper spout). Wall parts are the `wall` primitive (tinted per building).
 *  - `facade_a`..`facade_d`: one 3.2 m bay of the top floor under the deck edge, outer face at
 *    +x: cornice, window with frame, sill, glass and a curtain; b adds an AC unit, c a striped
 *    awning, d a flower box.
 *  - `edge`: the 15.2 m wide front lip of a roof at a gap: hazard stripes and a curb, facing +z.
 *  - `rim`: 1 m of low parapet for neighbouring roofs (scaled along z).
 *  - `span`: 7 m of festoon wire sagging from (0, 0, 0) to (0, 0, -7) with five bulbs.
 *  - `billboard` + face quad (`sign` material, UV 0..1) on a steel frame, facing +z.
 *  - `cloud0`..`cloud3`: sculpted cumulus clouds about 60 m across.
 */
import { bakeAo } from '../src/ao';
import { hex, mixRGB, type RGB } from '../src/color';
import type { Glb } from '../src/gltf';
import { decimate } from '../src/lod';
import { Mesh, paint, trs } from '../src/mesh';
import { fbm3, rng } from '../src/noise';
import { organic } from '../src/organic';
import { blend, smax, sphere } from '../src/sdf';
import { box, ellipsoid, sagPath, tube } from '../src/shapes';
import { acUnit, bush, faceQuad, P, post, rbox } from './kit';

/** Track building constants shared with the game (world.ts). */
export const ROOF_HALF = 7.6;
export const DECK_T = 0.35;
export const PARAPET_H = 0.8;
export const BAY = 3.2;

const WALL = paint([0.9, 0.9, 0.9], 0.92);
const WALL_LIGHT = paint([1, 1, 1], 0.88);
const WALL_SHADE = paint([0.78, 0.78, 0.78], 0.92);
const FRAME = paint(hex(0xf2efe8), 0.45);
const SILL = paint(hex(0xc9c2b6), 0.85);

interface Piece {
  name: string;
  wall: Mesh;
  surface: Mesh;
  extra?: { mesh: Mesh; material: string }[];
  ao: number;
  lod: number;
}

/* ------------------------------------------------------------------ roof pieces */

function parapet(scupper: boolean): Piece {
  const wall = new Mesh();
  const surface = new Mesh();
  // Wall body (seamless along z: square ends), coping with soft edges, a drip line under it.
  wall.append(box(0.3, PARAPET_H, BAY, WALL), trs(0, PARAPET_H / 2, 0));
  wall.append(rbox(0.44, 0.08, BAY - 0.012, 0.03, WALL_LIGHT, 0, PARAPET_H + 0.04, 0, 0, 0, 0, 1));
  wall.append(rbox(0.34, 0.03, BAY, 0.01, WALL_SHADE, 0, PARAPET_H - 0.015, 0));
  // Skirting where the wall meets the deck (waterproofing upstand).
  surface.append(rbox(0.06, 0.14, BAY, 0.02, paint(hex(0x8f8a80), 0.9), -0.17, 0.07, 0, 0, 0, 0, 1));
  if (scupper) {
    surface.append(rbox(0.22, 0.12, 0.2, 0.02, paint(hex(0x6d6a66), 0.6), -0.08, 0.06, 0.4));
    surface.append(
      tube(
        [
          [0.1, 0.07, 0.4],
          [0.26, 0.07, 0.4],
          [0.3, 0.02, 0.4],
        ],
        0.045,
        8,
        P.galv,
        { caps: 'flat' },
      ),
    );
    // Rain streak down the outer face under the spout.
    surface.append(box(0.01, 1.8, 0.24, paint([0.42, 0.4, 0.38], 0.95)), trs(0.155, -1.3, 0.4));
  }
  return { name: scupper ? 'parapet_s' : 'parapet', wall, surface, ao: 0.4, lod: 0.4 };
}

/** One top-floor bay under the deck edge, outer face at x = +0.15. */
function facadeBay(variant: 'a' | 'b' | 'c' | 'd', seed: number): Piece {
  const r = rng(seed);
  const wall = new Mesh();
  const surface = new Mesh();
  const extra: { mesh: Mesh; material: string }[] = [];
  const x0 = 0.15;
  const top = -DECK_T;
  const floor = top - BAY;
  // Cornice: a rounded band and a smaller fillet under it.
  wall.append(rbox(0.36, 0.28, BAY, 0.05, WALL_LIGHT, x0 + 0.02, top - 0.14, 0, 0, 0, 0, 2));
  wall.append(box(0.14, 0.08, BAY, WALL_SHADE), trs(x0 + 0.02, top - 0.32, 0));
  // Wall around the window opening (1.5 x 1.5 m, sill at floor + 0.8).
  const sill = floor + 0.85;
  const head = sill + 1.5;
  const half = 0.75;
  const t = 0.12;
  wall.append(box(t, top - 0.28 - head, BAY, WALL), trs(x0 - t / 2, (top - 0.28 + head) / 2, 0));
  wall.append(box(t, sill - floor, BAY, WALL), trs(x0 - t / 2, (sill + floor) / 2, 0));
  for (const s of [-1, 1])
    wall.append(
      box(t, head - sill, BAY / 2 - half, WALL),
      trs(x0 - t / 2, (head + sill) / 2, s * (BAY / 4 + half / 2)),
    );
  // Floor band at the bottom of the bay.
  wall.append(rbox(0.08, 0.16, BAY, 0.02, WALL_LIGHT, x0 + 0.03, floor + 0.08, 0, 0, 0, 0, 1));
  // Frame, mullion, sill, glass and a half-drawn curtain behind it.
  const gx = x0 - t - 0.01;
  surface.append(rbox(0.06, 0.07, 1.56, 0.015, FRAME, gx + 0.03, head - 0.03, 0));
  surface.append(rbox(0.06, 0.07, 1.56, 0.015, FRAME, gx + 0.03, sill + 0.03, 0));
  for (const s of [-1, 1])
    surface.append(rbox(0.06, 1.5, 0.07, 0.015, FRAME, gx + 0.03, (head + sill) / 2, s * (half - 0.03)));
  surface.append(rbox(0.05, 1.44, 0.05, 0.012, FRAME, gx + 0.03, (head + sill) / 2, 0));
  surface.append(rbox(0.2, 0.06, 1.7, 0.02, SILL, x0 + 0.05, sill - 0.03, 0, 0, 0, 0, 1));
  surface.append(box(0.02, 1.44, 1.44, paint(hex(0x2a4256), 0.05, 0.55)), trs(gx, (head + sill) / 2, 0));
  const curtains: RGB[] = [hex(0xf2e2c4), hex(0xe9a6a0), hex(0xa8d0e6), hex(0xf6d36b), hex(0xc8e0b0)];
  const curtain = curtains[Math.floor(r() * curtains.length)]!;
  const side = r() < 0.5 ? -1 : 1;
  surface.append(box(0.02, 1.4, 0.6, paint(curtain, 0.95)), trs(gx - 0.06, (head + sill) / 2, side * 0.42));
  if (variant === 'b') {
    // AC unit on brackets under the window, pipe running down.
    const unit = acUnit(0.78, 0.5, 0.28);
    surface.append(unit, trs(x0 + 0.2, sill - 0.75, -0.2, 0, Math.PI / 2));
    for (const s of [-1, 1])
      surface.append(rbox(0.32, 0.04, 0.04, 0, P.steel, x0 + 0.14, sill - 0.77, -0.2 + s * 0.3));
  } else if (variant === 'c') {
    // Striped fabric awning over the window.
    const stripes = 7;
    const a = paint(mixRGB(hex(0x2f8cff), hex(0x22b35e), r()), 0.8);
    const b = paint(hex(0xf6f1e6), 0.8);
    for (let i = 0; i < stripes; i++) {
      const z = -0.85 + (1.7 * (i + 0.5)) / stripes;
      surface.append(
        rbox(0.62, 0.03, 1.7 / stripes, 0, i % 2 ? b : a, x0 + 0.28, head + 0.18, z, 0, 0, -0.42),
      );
    }
    surface.append(rbox(0.04, 0.12, 1.72, 0.01, a, x0 + 0.56, head + 0.02, 0));
  } else if (variant === 'd') {
    // Flower box on the sill.
    surface.append(
      rbox(0.24, 0.2, 1.4, 0.03, paint(hex(0xb5563a), 0.8), x0 + 0.13, sill + 0.1, 0, 0, 0, 0, 1),
    );
    for (let i = 0; i < 3; i++)
      surface.append(
        bush(0.2, 70 + seed * 3 + i, hex(0x3f9e4a), 200),
        trs(x0 + 0.13, sill + 0.15, -0.45 + i * 0.45),
      );
  }
  return { name: `facade_${variant}`, wall, surface, extra, ao: 0.6, lod: 0.2 };
}

/** The open front of a roof at a gap: hazard stripes on the deck, a curb, facing +z at z = 0. */
function edge(): Piece {
  const surface = new Mesh();
  const wall = new Mesh();
  const n = 14;
  const w = (ROOF_HALF * 2 - 0.6) / n;
  for (let i = 0; i < n; i++)
    surface.append(
      box(w, 0.012, 0.42, i % 2 ? P.hazardDark : P.hazard),
      trs(-ROOF_HALF + 0.3 + w * (i + 0.5), 0.006, -0.3),
    );
  wall.append(rbox(ROOF_HALF * 2 - 0.1, 0.1, 0.14, 0.04, WALL_LIGHT, 0, 0.05, -0.07, 0, 0, 0, 2));
  return { name: 'edge', wall, surface, ao: 0.3, lod: 0 };
}

function rim(): Piece {
  const wall = new Mesh();
  wall.append(box(0.28, 0.5, 1, WALL), trs(0, 0.25, 0));
  wall.append(box(0.36, 0.07, 1, WALL_LIGHT), trs(0, 0.53, 0));
  return { name: 'rim', wall, surface: new Mesh(), ao: 0, lod: 0 };
}

/** Festoon wire between two posts 7 m apart with five warm bulbs. */
function span(light: boolean): Piece {
  const surface = new Mesh();
  const sag = 0.45;
  const path = sagPath([0, 0, 0], [0, 0, -7], sag, light ? 8 : 14);
  surface.append(tube(path, 0.009, light ? 3 : 4, P.rubber, { caps: 'none' }));
  const bulbGlow = paint(hex(0xffd690), 0.3, 0, 1);
  for (let k = 1; k < 6; k++) {
    const a = k / 6;
    const y = -Math.sin(a * Math.PI) * sag;
    if (!light) surface.append(box(0.04, 0.03, 0.04, P.dark), trs(0, y - 0.025, -7 * a));
    surface.append(
      ellipsoid(0.05, 0.062, 0.05, bulbGlow, light ? 4 : 6, light ? 3 : 4),
      trs(0, y - 0.085, -7 * a),
    );
  }
  return { name: light ? 'span@1' : 'span', wall: new Mesh(), surface, ao: 0, lod: 0 };
}

function billboard(): Piece {
  const surface = new Mesh();
  const steel = paint(hex(0x3a3c42), 0.45, 0.5);
  for (const sx of [-1, 1]) {
    surface.append(post([sx * 1.6, 0, -0.2], [sx * 1.6, 3.85, -0.2], 0.06, steel, 8));
    surface.append(rbox(0.3, 0.12, 0.3, 0.03, P.concrete, sx * 1.6, 0.06, -0.2));
    surface.append(post([sx * 1.6, 0.1, -0.9], [sx * 1.6, 2.6, -0.22], 0.035, steel, 6));
  }
  surface.append(post([-1.6, 1.2, -0.25], [1.6, 1.2, -0.25], 0.04, steel, 6));
  surface.append(rbox(3.62, 1.72, 0.12, 0.03, paint(hex(0x2b2d33), 0.5, 0.3), 0, 3.0, -0.08, 0, 0, 0, 2));
  // Two little lamps leaning over the face.
  for (const sx of [-1, 1]) {
    surface.append(post([sx * 0.9, 3.86, -0.1], [sx * 0.9, 4.05, 0.3], 0.018, steel, 5));
    surface.append(rbox(0.22, 0.06, 0.12, 0.02, P.dark, sx * 0.9, 4.04, 0.34, 0.5));
  }
  return {
    name: 'billboard',
    wall: new Mesh(),
    surface,
    extra: [{ mesh: faceQuad(-1.7, 2.2, 1.7, 3.8, 0.0), material: 'sign' }],
    ao: 0.4,
    lod: 0,
  };
}

/* ------------------------------------------------------------------ clouds */

function cloud(seed: number): Mesh {
  const r = rng(seed);
  const balls: [number, number, number, number][] = [];
  const n = 7 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const x = (r() - 0.5) * 46;
    const rad = 7 + r() * 8 * (1 - Math.abs(x) / 30);
    balls.push([x, rad * 0.55 + r() * 4, (r() - 0.5) * 14, rad]);
  }
  balls.push([0, 9, 0, 13]);
  const puff = blend(6, ...balls.map(([x, y, z, rad]) => sphere(x, y, z, rad)));
  // Soft billows at the scale of the cloud (not the leaf-sized noise of bushes), flat-ish base.
  const f = (x: number, y: number, z: number) =>
    smax(puff(x, y, z) - fbm3(x * 0.09, y * 0.09, z * 0.09, 2, seed) * 1.8, 1.5 - y, 3);
  return organic(f, {
    min: [-42, -1, -26],
    max: [42, 34, 26],
    cell: 0.9,
    tris: 1100,
    relaxIterations: 3,
    paint: (x, y, z) => {
      const lit = Math.min(1, Math.max(0, y / 20 + fbm3(x * 0.06, y * 0.06, z * 0.06, 2, seed) * 0.25));
      return paint(mixRGB(hex(0xd7b4a4), hex(0xfffaf2), lit), 1);
    },
  });
}

/* ------------------------------------------------------------------ export */

export function writeCity(glb: Glb, log: (r: { name: string; tris: number }) => void): void {
  const mats = new Map<string, number>([
    ['wall', glb.addMaterial({ name: 'wall', rough: 0.9 })],
    ['surface', glb.addMaterial({ name: 'surface', rough: 0.7 })],
    ['sign', glb.addMaterial({ name: 'sign', rough: 0.6 })],
    ['cloud', glb.addMaterial({ name: 'cloud', rough: 1 })],
  ]);
  const pieces: Piece[] = [
    parapet(false),
    parapet(true),
    facadeBay('a', 1),
    facadeBay('b', 2),
    facadeBay('c', 3),
    facadeBay('d', 4),
    edge(),
    rim(),
    span(false),
    span(true),
    billboard(),
  ];
  const nodes: number[] = [];
  const add = (name: string, parts: { mesh: Mesh; material: string }[]) => {
    const live = parts.filter((p) => p.mesh.triangleCount > 0);
    const ref = glb.addMesh(
      name,
      live.map((p) => ({ mesh: p.mesh, material: mats.get(p.material)! })),
      { quantize: true },
    );
    nodes.push(glb.addNode({ name, mesh: ref.mesh, translation: ref.translation, scale: ref.scale }));
    log({ name, tris: live.reduce((t, p) => t + p.mesh.triangleCount, 0) });
  };
  for (const piece of pieces) {
    const parts = [
      { mesh: piece.wall, material: 'wall' },
      { mesh: piece.surface, material: 'surface' },
      ...(piece.extra ?? []),
    ];
    if (piece.ao > 0) {
      for (const part of parts) {
        if (part.mesh.triangleCount === 0) continue;
        const others = parts.filter((p) => p !== part).map((p) => p.mesh);
        bakeAo(part.mesh, { distance: piece.ao, rays: 32, strength: 0.8, occluders: others });
      }
    }
    add(piece.name, parts);
    if (piece.lod > 0)
      add(
        `${piece.name}@1`,
        parts.map((p) => ({
          mesh:
            p.mesh.triangleCount > 40
              ? decimate(p.mesh, Math.round(p.mesh.triangleCount * piece.lod))
              : p.mesh,
          material: p.material,
        })),
      );
  }
  for (let i = 0; i < 4; i++) add(`cloud${i}`, [{ mesh: cloud(100 + i), material: 'cloud' }]);
  glb.setScene(nodes);
}
