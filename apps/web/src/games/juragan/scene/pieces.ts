/**
 * The playing pieces: character pawns (the player's cast character as a little head on a glossy
 * pawn body in their colour), the two dice, the four building levels and the transport markers in the
 * owner's colour, and the owner frame. Procedural geometry only.
 */
import type { Look } from '@hoorah/protocol';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { type Person, resolveLook, SKIN_PALETTE } from '../../../shared/art/people';
import { GeoBuilder, SURF } from '../../bajaj/geo';
import { withSurface } from '../../bajaj/look';
import { diceFace } from './textures';

/* ------------------------------------------------------------------ shared materials */

/**
 * Smart TV level: Phong pieces (one cheap highlight, no reflections or clear coat) instead of the
 * clear-coated physical ones. Set before the first piece is made; changing it drops the caches.
 */
let lite = false;
/** Sheen of the light pieces (see liteSheen). */
const PIECE_SHEEN = 0.045;
let headMat: THREE.MeshPhysicalMaterial | THREE.MeshPhongMaterial | null = null;
const glossCache = new Map<string, THREE.MeshPhysicalMaterial | THREE.MeshPhongMaterial>();
let trimMat: THREE.Material | null = null;
let diceMats: THREE.Material[] | null = null;

/**
 * The light level has no room reflection, which on the full level lays a soft white sheen over
 * every surface; a little constant emission (linear grey `k`) stands in for it.
 */
export function liteSheen(k: number): THREE.Color {
  return new THREE.Color().setRGB(k, k, k);
}

export function setLiteMaterials(on: boolean): void {
  if (on === lite) return;
  lite = on;
  headMat = null;
  glossCache.clear();
  trimMat = null;
  diceMats = null;
}

/**
 * The lamp glow of the per-vertex surfaces (`aSurf.w`, see bajaj/geo.ts) for Phong: lit windows and
 * lighthouse lamps keep shining without the physical shader.
 */
function withGlow(mat: THREE.MeshPhongMaterial): THREE.MeshPhongMaterial {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aSurf;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aSurf.w;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow * 8.0;',
      );
  };
  mat.customProgramCacheKey = () => 'juragan-lite-glow';
  // Geometry without aSurf reads "no glow".
  (mat as unknown as { defaultAttributeValues: Record<string, number[]> }).defaultAttributeValues = {
    aSurf: [1, 1, 1, 0],
  };
  return mat;
}

/** Vertex-coloured clear-coated material that reads per-vertex surfaces (pawn heads, buildings). */
export function surfaceMaterial(): THREE.MeshPhysicalMaterial | THREE.MeshPhongMaterial {
  if (!headMat) {
    headMat = lite
      ? withGlow(
          new THREE.MeshPhongMaterial({
            vertexColors: true,
            specular: 0x2e2e2e,
            shininess: 40,
            emissive: liteSheen(PIECE_SHEEN),
          }),
        )
      : withSurface(
          new THREE.MeshPhysicalMaterial({
            vertexColors: true,
            roughness: 0.5,
            metalness: 0,
            clearcoat: 1,
            clearcoatRoughness: 0.08,
          }),
          'juragan',
        );
  }
  return headMat;
}

/** Glossy lacquered plastic in a player's colour. */
export function glossy(color: string): THREE.MeshPhysicalMaterial | THREE.MeshPhongMaterial {
  let m = glossCache.get(color);
  if (!m) {
    m = lite
      ? new THREE.MeshPhongMaterial({
          color: new THREE.Color(color),
          specular: 0x4a4a4a,
          shininess: 90,
          emissive: liteSheen(PIECE_SHEEN),
        })
      : new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(color),
          roughness: 0.2,
          metalness: 0,
          clearcoat: 1,
          clearcoatRoughness: 0.05,
        });
    glossCache.set(color, m);
  }
  return m;
}

/** The white ring on a pawn's neck. */
function trim(): THREE.Material {
  if (!trimMat) {
    trimMat = lite
      ? new THREE.MeshPhongMaterial({
          color: 0xfff8ec,
          specular: 0x404040,
          shininess: 70,
          emissive: liteSheen(PIECE_SHEEN),
        })
      : new THREE.MeshPhysicalMaterial({
          color: 0xfff8ec,
          roughness: 0.25,
          clearcoat: 1,
          clearcoatRoughness: 0.08,
        });
  }
  return trimMat;
}

/* ------------------------------------------------------------------ pawns */

const headCache = new Map<string, THREE.BufferGeometry>();

const INK = '#1B1B22';
const BLUSH = '#FF8A8A';
const WHITE = '#FFFFFF';
/** Head radius before scaling (about 0.62 across with the hair, like the old fruit heads). */
const R = 0.29;

/** Cache key of a look: every field that changes the head. */
function lookKey(look: Look): string {
  return `${look.c}|${look.s ?? ''}|${look.h ?? ''}|${look.hc ?? ''}|${look.oc ?? ''}`;
}

/** Add `g` to `b` at `pos`, turned by Euler `rot` and stretched by `scale`. */
function put(
  b: GeoBuilder,
  g: THREE.BufferGeometry,
  c: string | THREE.Color,
  pos: readonly [number, number, number],
  scale: readonly [number, number, number] = [1, 1, 1],
  rot: readonly [number, number, number] = [0, 0, 0],
): void {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
    new THREE.Vector3(...scale),
  );
  b.addGeometry(g, m, c);
}

/**
 * A hair cap: the top `cover` radians of a sphere slightly larger than the head, tipped back by
 * `tilt` so it reaches lower at the back than over the forehead.
 */
function cap(b: GeoBuilder, c: string, cover: number, tilt: number, grow = 1.08, lift = 0): void {
  put(
    b,
    new THREE.SphereGeometry(R * grow, 24, 12, 0, Math.PI * 2, 0, cover),
    c,
    [0, lift, 0],
    [1, 1, 1],
    [-tilt, 0, 0],
  );
}

function bun(b: GeoBuilder, c: string, r: number, x: number, y: number, z: number): void {
  put(b, new THREE.SphereGeometry(r, 14, 10), c, [x, y, z]);
}

/** Hair, veil or hat in the character's colours, built from a few rounded parts. */
function addHair(b: GeoBuilder, p: Person): void {
  const hc = p.hairColor;
  const hat = p.hat ?? hc;
  b.surface = SURF.satin;
  switch (p.hair) {
    case 'bald':
      return;
    case 'buzz':
      cap(b, hc, 1.35, 0.45, 1.02);
      return;
    case 'hijab':
      // A hood around the whole head with an oval opening for the face, falling to the shoulders.
      b.surface = SURF.fabric;
      put(
        b,
        new THREE.SphereGeometry(R * 1.12, 24, 16, 0, Math.PI * 2, 0.78, Math.PI - 0.78),
        hc,
        [0, -0.01, -0.01],
        [1, 1, 1.08],
        [Math.PI / 2, 0, 0],
      );
      put(b, new THREE.CylinderGeometry(R * 0.95, R * 1.15, 0.16, 20, 1, true), hc, [0, -0.28, -0.02]);
      return;
    case 'turban':
      b.surface = SURF.fabric;
      cap(b, hat, 1.25, 0.2, 1.16, 0.04);
      bun(b, hat, 0.07, 0, R * 0.72, R * 0.78);
      return;
    case 'beanie':
      b.surface = SURF.fabric;
      cap(b, hat, 1.3, 0.22, 1.1);
      bun(b, hat, 0.07, 0, R * 1.12, -0.03);
      return;
    case 'cap': {
      b.surface = SURF.plastic;
      cap(b, hat, 1.2, 0.3, 1.08);
      put(
        b,
        new THREE.CylinderGeometry(0.17, 0.17, 0.025, 20, 1, false, -Math.PI / 2, Math.PI),
        hat,
        [0, R * 0.55, R * 0.82],
        [1, 1, 1.1],
        [0.18, 0, 0],
      );
      return;
    }
    case 'afro':
      put(b, new THREE.SphereGeometry(R * 1.3, 20, 14), hc, [0, R * 0.42, -R * 0.5]);
      return;
    default:
      cap(b, hc, 1.5, 0.5);
  }
  switch (p.hair) {
    case 'bob':
    case 'wavy':
    case 'curtain':
    case 'braids':
      // Long hair down the back and over the ears.
      put(b, new THREE.SphereGeometry(R, 20, 14), hc, [0, -0.07, -0.08], [1.12, 1.02, 0.82]);
      return;
    case 'twinbuns':
    case 'pigtails':
      for (const side of [-1, 1]) bun(b, hc, 0.085, side * R * 0.95, R * 0.45, -R * 0.25);
      return;
    case 'pony':
    case 'manbun':
    case 'messybun':
    case 'grandbun':
      bun(b, hc, 0.095, 0, R * 0.78, -R * 0.72);
      return;
    case 'puff':
      bun(b, hc, 0.15, 0, R * 1.08, -R * 0.2);
      return;
    case 'mohawk':
    case 'spiky':
    case 'tuft':
      put(b, new THREE.ConeGeometry(0.07, 0.16, 10), hc, [0, R * 1.08, 0.02], [1, 1, 1], [-0.25, 0, 0]);
      return;
    default:
  }
}

/** Eyes with a glint, cheeks, a smile, and glasses when the character wears them. */
function addFace(b: GeoBuilder, p: Person): void {
  const fz = R * 0.95;
  for (const side of [-1, 1]) {
    const x = side * 0.1;
    b.surface = SURF.eye;
    put(b, new THREE.SphereGeometry(1, 10, 8), INK, [x, 0.03, fz - 0.035], [0.034, 0.048, 0.02]);
    put(b, new THREE.SphereGeometry(1, 6, 4), WHITE, [x + 0.012, 0.045, fz - 0.016], [0.01, 0.012, 0.006]);
    b.surface = SURF.skin;
    put(
      b,
      new THREE.SphereGeometry(1, 10, 6),
      BLUSH,
      [side * 0.165, -0.055, fz - 0.07],
      [0.045, 0.028, 0.02],
    );
    if (p.acc.includes('glasses')) {
      b.surface = SURF.gloss;
      put(b, new THREE.TorusGeometry(0.058, 0.01, 6, 20), INK, [x, 0.03, fz - 0.005]);
    }
  }
  b.surface = SURF.satin;
  // Half a ring turned upside down: a smile under the nose.
  put(
    b,
    new THREE.TorusGeometry(0.06, 0.013, 6, 14, Math.PI),
    INK,
    [0, -0.06, fz - 0.03],
    [1, 0.8, 1],
    [0.15, 0, Math.PI],
  );
}

/**
 * A player's head on the pawn (owner 2026-11-24: players are cast characters, not fruits): a round
 * head in their skin tone with ears, their hair or veil in their hair colour, a face, and shoulders in
 * their outfit colour. Centred on the origin, face towards +z, cached per look.
 */
function personHead(look: Look): THREE.BufferGeometry {
  const key = lookKey(look);
  const hit = headCache.get(key);
  if (hit) return hit;
  const p = resolveLook(look);
  const skin = SKIN_PALETTE[p.skin - 1] ?? SKIN_PALETTE[1];
  const b = new GeoBuilder();
  b.surface = SURF.fabric;
  put(
    b,
    new THREE.SphereGeometry(0.2, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    p.outfitColor,
    [0, -R * 1.02, 0],
    [1.25, 0.55, 0.95],
  );
  b.surface = SURF.skin;
  put(b, new THREE.SphereGeometry(R, 28, 20), skin, [0, 0, 0], [1, 1.04, 0.95]);
  for (const side of [-1, 1])
    put(b, new THREE.SphereGeometry(0.06, 10, 8), skin, [side * R * 0.97, -0.01, 0], [0.6, 1, 1]);
  addFace(b, p);
  addHair(b, p);
  const g = b.build();
  headCache.set(key, g);
  return g;
}

let bodyGeo: THREE.BufferGeometry | null = null;
let ringGeo: THREE.BufferGeometry | null = null;

/** Classic pawn silhouette: wide foot, slim waist and a collar cup that holds the head. */
function pawnBody(): THREE.BufferGeometry {
  if (!bodyGeo) {
    const pts = [
      [0.0001, 0],
      [0.165, 0],
      [0.178, 0.014],
      [0.176, 0.042],
      [0.15, 0.068],
      [0.11, 0.098],
      [0.085, 0.15],
      [0.072, 0.22],
      [0.074, 0.27],
      [0.1, 0.292],
      [0.118, 0.31],
      [0.112, 0.328],
      [0.08, 0.338],
      [0.0001, 0.34],
    ].map(([x, y]) => new THREE.Vector2(x!, y!));
    bodyGeo = new THREE.LatheGeometry(pts, 40);
  }
  return bodyGeo;
}

function pawnRing(): THREE.BufferGeometry {
  if (!ringGeo) {
    ringGeo = new THREE.TorusGeometry(0.163, 0.012, 8, 40);
    ringGeo.rotateX(Math.PI / 2);
    ringGeo.translate(0, 0.045, 0);
  }
  return ringGeo;
}

/** Head scale on the pawn and the height of its centre. */
export const HEAD_SCALE = 0.56;
export const HEAD_Y = 0.34 + 0.29 * HEAD_SCALE;
export const PAWN_H = HEAD_Y + 0.36 * HEAD_SCALE;

export class PawnModel {
  readonly root = new THREE.Group();
  /** Hops and squashes; the root carries the board position. */
  readonly body = new THREE.Group();
  readonly head: THREE.Mesh;

  constructor(look: Look, color: string) {
    const base = new THREE.Mesh(pawnBody(), glossy(color));
    const ring = new THREE.Mesh(pawnRing(), trim());
    this.head = new THREE.Mesh(personHead(look), surfaceMaterial());
    this.head.scale.setScalar(HEAD_SCALE);
    this.head.position.y = HEAD_Y;
    // Tip the face up a little so it looks at the camera above the table.
    this.head.rotation.x = -0.32;
    for (const m of [base, ring, this.head]) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
    this.body.add(base, ring, this.head);
    this.root.add(this.body);
  }
}

/* ------------------------------------------------------------------ dice */

export const DIE = 0.4;

/**
 * Face values in BoxGeometry material order (+x, -x, +y, -y, +z, -z). Opposite faces add up to 7.
 */
const FACE_VALUES = [3, 4, 1, 6, 2, 5] as const;

let dieGeo: THREE.BufferGeometry | null = null;

export function makeDie(): THREE.Mesh {
  if (!diceMats) {
    diceMats = FACE_VALUES.map((v) =>
      lite
        ? new THREE.MeshPhongMaterial({
            map: diceFace(v),
            specular: 0x333333,
            shininess: 60,
            emissive: liteSheen(PIECE_SHEEN),
          })
        : new THREE.MeshPhysicalMaterial({
            map: diceFace(v),
            roughness: 0.32,
            clearcoat: 0.7,
            clearcoatRoughness: 0.12,
          }),
    );
  }
  if (!dieGeo) dieGeo = new RoundedBoxGeometry(DIE, DIE, DIE, 4, DIE * 0.16);
  const m = new THREE.Mesh(dieGeo, diceMats);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Rotation that puts `value` on top, then turns the die by `yaw` around the vertical axis. */
export function dieRest(value: number, yaw: number): THREE.Quaternion {
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  switch (value) {
    case 6:
      e.set(Math.PI, 0, 0);
      break;
    case 2:
      e.set(-Math.PI / 2, 0, 0);
      break;
    case 5:
      e.set(Math.PI / 2, 0, 0);
      break;
    case 3:
      e.set(0, 0, Math.PI / 2);
      break;
    case 4:
      e.set(0, 0, -Math.PI / 2);
      break;
    default:
      e.set(0, 0, 0);
  }
  q.setFromEuler(e);
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(q);
}

/* ------------------------------------------------------------------ buildings */

const WALL = 0xfff3de;
const GLASS = 0x2b3f55;
const buildingCache = new Map<string, THREE.BufferGeometry>();

function box(
  b: GeoBuilder,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  c: THREE.ColorRepresentation,
  r = 0.012,
): void {
  const g = new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 3, h / 3, d / 3));
  b.addGeometry(g, new THREE.Matrix4().makeTranslation(x, y + h / 2, z), c);
}

/** A gable roof (triangular prism) along x. */
function roof(
  b: GeoBuilder,
  w: number,
  h: number,
  d: number,
  y: number,
  z: number,
  c: THREE.ColorRepresentation,
): void {
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2 - 0.02, 0);
  shape.lineTo(d / 2 + 0.02, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: w + 0.04, bevelEnabled: false });
  g.translate(0, 0, -(w + 0.04) / 2);
  g.rotateY(Math.PI / 2);
  b.addGeometry(g, new THREE.Matrix4().makeTranslation(0, y, z), c);
}

function windows(
  b: GeoBuilder,
  cols: number,
  rows: number,
  w: number,
  y0: number,
  dy: number,
  z: number,
  s: number,
): void {
  b.surface = SURF.glass;
  for (let r = 0; r < rows; r++)
    for (let k = 0; k < cols; k++) {
      const x = -w / 2 + ((k + 0.5) * w) / cols;
      b.addGeometry(
        new THREE.BoxGeometry(s, s * 1.15, 0.01),
        new THREE.Matrix4().makeTranslation(x, y0 + r * dy, z),
        GLASS,
      );
    }
}

/** The owner's colour darkened (doors, trims) or washed towards white (light walls). */
function shade(c: THREE.Color, k: number): THREE.Color {
  return k < 1 ? c.clone().multiplyScalar(k) : c.clone().lerp(new THREE.Color(0xffffff), k - 1);
}

/** Alternating stripes along x (an awning), `n` of them, starting with `a`. */
function stripes(
  b: GeoBuilder,
  n: number,
  w: number,
  h: number,
  d: number,
  y: number,
  z: number,
  a: THREE.ColorRepresentation,
  c: THREE.ColorRepresentation,
): void {
  const sw = w / n;
  for (let k = 0; k < n; k++) box(b, sw + 0.001, h, d, -w / 2 + sw * (k + 0.5), y, z, k % 2 ? c : a, 0.004);
}

/** Rumah (1): a small house under a big pitched roof in the owner's colour. */
function rumah(b: GeoBuilder, own: THREE.Color): void {
  b.surface = SURF.matte;
  box(b, 0.36, 0.03, 0.27, 0, 0, 0, 0xe2d3b5, 0.008);
  box(b, 0.3, 0.16, 0.22, 0, 0.03, 0, WALL);
  b.surface = SURF.paint;
  roof(b, 0.36, 0.16, 0.28, 0.19, 0, own);
  box(b, 0.075, 0.11, 0.012, -0.06, 0.03, 0.112, shade(own, 0.62), 0.004);
  b.surface = SURF.matte;
  box(b, 0.045, 0.09, 0.045, 0.09, 0.24, -0.03, WALL, 0.006);
  windows(b, 1, 1, 0.1, 0.11, 0, 0.111, 0.065);
  b.surface = SURF.satin;
  box(b, 0.09, 0.012, 0.03, 0.065, 0.075, 0.12, shade(own, 1.35), 0.004);
}

/** Toko (2): a two-storey shophouse with a striped awning, a coloured parapet and a lit sign. */
function toko(b: GeoBuilder, own: THREE.Color): void {
  b.surface = SURF.matte;
  box(b, 0.42, 0.34, 0.27, 0, 0, 0, WALL);
  b.surface = SURF.paint;
  box(b, 0.44, 0.07, 0.29, 0, 0.34, 0, own);
  box(b, 0.035, 0.34, 0.02, -0.19, 0, 0.13, own, 0.006);
  box(b, 0.035, 0.34, 0.02, 0.19, 0, 0.13, own, 0.006);
  windows(b, 3, 1, 0.33, 0.25, 0, 0.136, 0.075);
  b.surface = SURF.glass;
  box(b, 0.3, 0.12, 0.012, 0, 0.012, 0.132, GLASS, 0.004);
  b.surface = SURF.satin;
  stripes(b, 5, 0.42, 0.022, 0.12, 0.15, 0.19, own, 0xfff8ec);
  b.surface = SURF.lamp;
  box(b, 0.24, 0.045, 0.012, 0, 0.352, 0.146, 0xffd36b, 0.004);
}

/** Gedung (3): a four-storey office block painted in the owner's colour, cream floor bands. */
function gedung(b: GeoBuilder, own: THREE.Color): void {
  b.surface = SURF.paint;
  box(b, 0.42, 0.58, 0.28, 0, 0, 0, own);
  b.surface = SURF.matte;
  for (const y of [0.14, 0.285, 0.43]) box(b, 0.43, 0.02, 0.29, 0, y, 0, WALL, 0.006);
  box(b, 0.45, 0.035, 0.31, 0, 0.58, 0, WALL, 0.008);
  box(b, 0.16, 0.07, 0.12, 0.08, 0.615, -0.04, 0xd8ccb4, 0.008);
  windows(b, 4, 4, 0.36, 0.075, 0.145, 0.141, 0.058);
  b.surface = SURF.glass;
  box(b, 0.12, 0.09, 0.016, 0, 0.0, 0.142, GLASS, 0.004);
}

/** Hotel (4): a tall tower on a coloured podium, coloured corner columns and crown, a lit sign. */
function hotel(b: GeoBuilder, own: THREE.Color): void {
  b.surface = SURF.paint;
  box(b, 0.48, 0.1, 0.32, 0, 0, 0, own);
  b.surface = SURF.matte;
  box(b, 0.38, 0.62, 0.26, 0, 0.1, 0, WALL);
  b.surface = SURF.paint;
  box(b, 0.05, 0.62, 0.03, -0.17, 0.1, 0.122, own, 0.008);
  box(b, 0.05, 0.62, 0.03, 0.17, 0.1, 0.122, own, 0.008);
  box(b, 0.42, 0.06, 0.3, 0, 0.72, 0, own);
  box(b, 0.24, 0.08, 0.18, 0, 0.78, 0, shade(own, 0.8));
  box(b, 0.2, 0.022, 0.09, 0, 0.1, 0.19, own, 0.006);
  windows(b, 3, 5, 0.26, 0.2, 0.1, 0.131, 0.058);
  b.surface = SURF.glass;
  box(b, 0.12, 0.075, 0.016, 0, 0.012, 0.16, GLASS, 0.004);
  b.surface = SURF.lamp;
  box(b, 0.22, 0.05, 0.012, 0, 0.655, 0.133, 0xffd36b, 0.004);
  b.surface = SURF.metal;
  b.addGeometry(
    new THREE.CylinderGeometry(0.008, 0.008, 0.12, 8),
    new THREE.Matrix4().makeTranslation(0, 0.92, 0),
    0xd9d2c4,
  );
  b.surface = SURF.lamp;
  b.addGeometry(
    new THREE.SphereGeometry(0.02, 12, 8),
    new THREE.Matrix4().makeTranslation(0, 0.985, 0),
    0xffd36b,
  );
}

/**
 * Rumah (1), Toko (2), Gedung (3) or Hotel (4) in the owner's colour, facing +z, standing on
 * y = 0. Each level is clearly taller than the last; footprints stay inside 0.48 x 0.32.
 */
export function buildingGeometry(level: number, color: string): THREE.BufferGeometry {
  const key = `${level}|${color}`;
  const hit = buildingCache.get(key);
  if (hit) return hit;
  const b = new GeoBuilder();
  const own = new THREE.Color(color);
  if (level <= 1) rumah(b, own);
  else if (level === 2) toko(b, own);
  else if (level === 3) gedung(b, own);
  else hotel(b, own);
  const g = b.build();
  buildingCache.set(key, g);
  return g;
}

/** Pelabuhan: a striped lighthouse in the owner's colour with a glowing lantern. */
function lighthouse(b: GeoBuilder, own: THREE.Color): void {
  const cyl = (r0: number, r1: number, h: number, y: number, c: THREE.ColorRepresentation) =>
    b.addGeometry(
      new THREE.CylinderGeometry(r1, r0, h, 24),
      new THREE.Matrix4().makeTranslation(0, y + h / 2, 0),
      c,
    );
  b.surface = SURF.matte;
  cyl(0.15, 0.14, 0.04, 0, 0xe2d3b5);
  b.surface = SURF.paint;
  const bands = 4;
  const h = 0.42;
  for (let k = 0; k < bands; k++) {
    const r0 = 0.1 - (0.035 * k) / bands;
    const r1 = 0.1 - (0.035 * (k + 1)) / bands;
    cyl(r0, r1, h / bands, 0.04 + (k * h) / bands, k % 2 ? 0xfff8ec : own);
  }
  b.surface = SURF.matte;
  cyl(0.095, 0.095, 0.02, 0.46, 0x2b2f36);
  b.surface = SURF.lamp;
  cyl(0.055, 0.055, 0.07, 0.48, 0xffe08a);
  b.surface = SURF.paint;
  b.addGeometry(
    new THREE.ConeGeometry(0.075, 0.08, 24),
    new THREE.Matrix4().makeTranslation(0, 0.59, 0),
    own,
  );
}

/** Bandara: a control tower with a cab in the owner's colour and a band of lit glass. */
function controlTower(b: GeoBuilder, own: THREE.Color): void {
  const cyl = (r0: number, r1: number, h: number, y: number, c: THREE.ColorRepresentation, seg = 24) =>
    b.addGeometry(
      new THREE.CylinderGeometry(r1, r0, h, seg),
      new THREE.Matrix4().makeTranslation(0, y + h / 2, 0),
      c,
    );
  b.surface = SURF.matte;
  box(b, 0.3, 0.04, 0.24, 0, 0, 0, 0xe2d3b5, 0.008);
  box(b, 0.2, 0.09, 0.16, -0.03, 0.04, 0.02, WALL, 0.01);
  b.surface = SURF.paint;
  box(b, 0.21, 0.02, 0.17, -0.03, 0.13, 0.02, own, 0.006);
  b.surface = SURF.matte;
  cyl(0.05, 0.042, 0.34, 0.04, WALL);
  b.surface = SURF.paint;
  cyl(0.075, 0.11, 0.05, 0.38, own, 8);
  b.surface = SURF.lamp;
  cyl(0.11, 0.115, 0.055, 0.43, 0x9fd6ff, 8);
  b.surface = SURF.paint;
  cyl(0.125, 0.06, 0.04, 0.485, own, 8);
  b.surface = SURF.metal;
  cyl(0.006, 0.006, 0.1, 0.525, 0xd9d2c4, 6);
}

/** The owner's marker on a transport tile: a lighthouse (Pelabuhan) or a control tower (Bandara). */
export function transportGeometry(kind: 'pelabuhan' | 'bandara', color: string): THREE.BufferGeometry {
  const key = `${kind}|${color}`;
  const hit = buildingCache.get(key);
  if (hit) return hit;
  const b = new GeoBuilder();
  const own = new THREE.Color(color);
  if (kind === 'pelabuhan') lighthouse(b, own);
  else controlTower(b, own);
  const g = b.build();
  buildingCache.set(key, g);
  return g;
}

/* ------------------------------------------------------------------ owner marks */

/** A thin glossy frame hugging the tile edge in the owner's colour. */
export function makeOwnerFrame(w: number, d: number, color: string, t = 0.05): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, -d / 2);
  shape.lineTo(w / 2, -d / 2);
  shape.lineTo(w / 2, d / 2);
  shape.lineTo(-w / 2, d / 2);
  shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-w / 2 + t, -d / 2 + t);
  hole.lineTo(-w / 2 + t, d / 2 - t);
  hole.lineTo(w / 2 - t, d / 2 - t);
  hole.lineTo(w / 2 - t, -d / 2 + t);
  hole.closePath();
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, glossy(color));
  m.receiveShadow = true;
  return m;
}
