/**
 * Shared three.js building blocks: the toon look (one gradient ramp), a material cache, small
 * geometry helpers, and `Batch`, which bakes many coloured pieces into one vertex-coloured mesh
 * so the static kitchen costs a handful of draw calls.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/* ------------------------------------------------------------------ palette */

export const PAL = {
  ink: 0x111214,
  cream: 0xfff7f0,
  wall: 0xf6e3c6,
  wallShade: 0xeed5b2,
  tile: 0x2fa595,
  tile2: 0x37b3a2,
  tile3: 0x28968a,
  grout: 0xe6dcc8,
  trim: 0xc9733a,
  wood: 0xdca262,
  wood2: 0xd3955a,
  wood3: 0xe4ad6e,
  woodDark: 0x8e5a2e,
  island: 0xf06a35,
  islandDark: 0xd0552a,
  knob: 0xffc928,
  floor: 0xc8754a,
  floor2: 0xb4663e,
  steel: 0xc3cbd2,
  steelDark: 0x6b747c,
  iron: 0x2c2f34,
  iron2: 0x3b3f45,
  white: 0xfffdf8,
  plateRim: 0xff8a3d,
  green: 0x22b35e,
  leaf: 0x3a9e4a,
  leafDark: 0x2b7d3a,
  red: 0xf2453d,
  chili: 0xe0261b,
  orange: 0xff5a1f,
  yellow: 0xffc928,
  shallot: 0xc4475b,
  shallotIn: 0xf3c9cf,
  garlic: 0xf3ead6,
  rice: 0xfbf6ea,
  nasgor: 0xc8763a,
  paste: 0xc93a1c,
  egg: 0xfffdf5,
  yolk: 0xffaa00,
  chicken: 0xf3b2a0,
  chickenCooked: 0xd99655,
  chickenGrilled: 0x9e5a28,
  bamboo: 0xdcb87e,
  coal: 0x2a2523,
  peanut: 0x9a5a26,
  batter: 0xf4d38c,
  batterCooked: 0xb8742c,
  butter: 0xffd84a,
  choco: 0x4a2a1a,
  cheese: 0xffd23f,
  sky: 0xbfe6ff,
} as const;

/* ------------------------------------------------------------------ detail */

let lowDetail = false;

/** Weak devices: lighter food pieces (fewer, simpler rice grains). Set before any station is built. */
export function setLowDetail(on: boolean): void {
  lowDetail = on;
}

export function isLowDetail(): boolean {
  return lowDetail;
}

/* ------------------------------------------------------------------ toon */

let gradientMap: THREE.DataTexture | null = null;

/** Four soft bands: shadow, mid, lit, highlight (0..255). */
export const TOON_LEVELS: readonly number[] = [118, 176, 226, 255];

export function toonRamp(): THREE.DataTexture {
  if (gradientMap) return gradientMap;
  const levels = TOON_LEVELS;
  const data = new Uint8Array(levels.length * 4);
  levels.forEach((v, i) => {
    data.set([v, v, v, 255], i * 4);
  });
  const tex = new THREE.DataTexture(data, levels.length, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  gradientMap = tex;
  return tex;
}

const cache = new Map<string, THREE.Material>();

export interface ToonOpts {
  emissive?: number;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  vertexColors?: boolean;
}

export function toon(color: number, o: ToonOpts = {}): THREE.MeshToonMaterial {
  const key = `t:${color}:${JSON.stringify(o)}`;
  const hit = cache.get(key);
  if (hit) return hit as THREE.MeshToonMaterial;
  const m = new THREE.MeshToonMaterial({
    color,
    gradientMap: toonRamp(),
    emissive: o.emissive ?? 0x000000,
    emissiveIntensity: o.emissiveIntensity ?? 1,
    transparent: o.transparent ?? false,
    opacity: o.opacity ?? 1,
    side: o.side ?? THREE.FrontSide,
    vertexColors: o.vertexColors ?? false,
  });
  cache.set(key, m);
  return m;
}

/** A unique (uncached) toon material, for things whose colour changes per station. */
export function ownToon(color: number, o: ToonOpts = {}): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: toonRamp(),
    emissive: o.emissive ?? 0x000000,
    emissiveIntensity: o.emissiveIntensity ?? 1,
    transparent: o.transparent ?? false,
    opacity: o.opacity ?? 1,
    side: o.side ?? THREE.FrontSide,
    vertexColors: o.vertexColors ?? false,
  });
}

export function basic(
  color: number,
  o: { transparent?: boolean; opacity?: number; vertexColors?: boolean } = {},
) {
  const key = `b:${color}:${JSON.stringify(o)}`;
  const hit = cache.get(key);
  if (hit) return hit as THREE.MeshBasicMaterial;
  const m = new THREE.MeshBasicMaterial({
    color,
    transparent: o.transparent ?? false,
    opacity: o.opacity ?? 1,
    vertexColors: o.vertexColors ?? false,
    depthWrite: !(o.transparent ?? false),
  });
  cache.set(key, m);
  return m;
}

/** White vertex-coloured toon material for baked batches. */
export function vcToon(): THREE.MeshToonMaterial {
  return toon(0xffffff, { vertexColors: true });
}

/* ------------------------------------------------------------------ geometry */

const geoCache = new Map<string, THREE.BufferGeometry>();

/** Memoised geometry: per-station meshes share one buffer. */
export function shared(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

export function rbox(w: number, h: number, d: number, r: number, seg = 2): THREE.BufferGeometry {
  return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2) * 0.999);
}

/** Lathe from [radius, y] pairs. */
export function lathe(points: [number, number][], segments = 32): THREE.BufferGeometry {
  return new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)),
    segments,
  );
}

/** A smooth bowl/pan shell: outer profile + inner profile (wall thickness `t`). */
export function shell(profile: [number, number][], t: number, segments = 36): THREE.BufferGeometry {
  const outer = profile;
  const inner = [...profile]
    .reverse()
    .map(([r, y]) => [Math.max(0.0005, r - t), y + t * 0.6] as [number, number]);
  const lip: [number, number] = [outer[outer.length - 1]![0] - t / 2, outer[outer.length - 1]![1] + t * 0.5];
  return lathe([...outer, lip, ...inner], segments);
}

export interface Place {
  p?: [number, number, number];
  r?: [number, number, number];
  s?: [number, number, number] | number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

export function matrix(pl: Place = {}): THREE.Matrix4 {
  const [x, y, z] = pl.p ?? [0, 0, 0];
  const [rx, ry, rz] = pl.r ?? [0, 0, 0];
  const s = pl.s ?? 1;
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _v.set(x, y, z);
  if (typeof s === 'number') _s.set(s, s, s);
  else _s.set(s[0], s[1], s[2]);
  return _m.clone().compose(_v, _q, _s);
}

/** Bake a transform into a fresh copy of the geometry. */
export function placed(geo: THREE.BufferGeometry, pl: Place): THREE.BufferGeometry {
  const g = geo.clone();
  g.applyMatrix4(matrix(pl));
  return g;
}

export function mesh(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  pl: Place = {},
  shadow = true,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  const [x, y, z] = pl.p ?? [0, 0, 0];
  m.position.set(x, y, z);
  if (pl.r) m.rotation.set(pl.r[0], pl.r[1], pl.r[2]);
  if (pl.s !== undefined) {
    if (typeof pl.s === 'number') m.scale.setScalar(pl.s);
    else m.scale.set(pl.s[0], pl.s[1], pl.s[2]);
  }
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

/* ------------------------------------------------------------------ batch */

const _c = new THREE.Color();

/**
 * A placed copy reduced to position + normal (+ color). The index is kept: shared vertices are
 * shaded once, which matters on weak GPUs. Pieces without normals (or coloured per group) are
 * expanded so every triangle keeps its own vertices, as before.
 */
function piece(
  geo: THREE.BufferGeometry,
  pl: Place,
  keepColor: boolean,
  expand: boolean,
): THREE.BufferGeometry {
  const g = geo.index && (expand || !geo.getAttribute('normal')) ? geo.toNonIndexed() : geo.clone();
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && !(keepColor && name === 'color')) g.deleteAttribute(name);
  }
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  g.applyMatrix4(matrix(pl));
  return g;
}

/** Every part needs an index to merge with indexed ones. */
function ensureIndex(g: THREE.BufferGeometry): void {
  if (g.index) return;
  const n = g.getAttribute('position').count;
  const idx = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
}

/**
 * Collects coloured pieces and merges them into one vertex-coloured, indexed mesh. Every piece is
 * reduced to position + normal + color so anything merges with anything.
 */
export class Batch {
  private parts: THREE.BufferGeometry[] = [];

  add(geo: THREE.BufferGeometry, color: number | readonly number[], pl: Place = {}): this {
    const g = piece(geo, pl, false, typeof color !== 'number');
    const n = g.getAttribute('position').count;
    const cols = new Float32Array(n * 3);
    if (typeof color === 'number') {
      _c.setHex(color);
      for (let i = 0; i < n; i++) {
        cols[i * 3] = _c.r;
        cols[i * 3 + 1] = _c.g;
        cols[i * 3 + 2] = _c.b;
      }
    } else {
      // One colour per geometry group (e.g. extrude caps vs sides).
      const groups = geo.groups.length ? geo.groups : [{ start: 0, count: n, materialIndex: 0 }];
      for (const gr of groups) {
        _c.setHex(color[gr.materialIndex ?? 0] ?? color[0] ?? 0xffffff);
        for (let i = gr.start; i < Math.min(n, gr.start + gr.count); i++) cols.set([_c.r, _c.g, _c.b], i * 3);
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.clearGroups();
    this.parts.push(g);
    return this;
  }

  /** Per-vertex colour from a function of the (placed) vertex position. */
  addShaded(geo: THREE.BufferGeometry, shade: (x: number, y: number, z: number) => number, pl: Place = {}) {
    const g = piece(geo, pl, false, false);
    const pos = g.getAttribute('position');
    const cols = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      _c.setHex(shade(pos.getX(i), pos.getY(i), pos.getZ(i)));
      cols.set([_c.r, _c.g, _c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.clearGroups();
    this.parts.push(g);
    return this;
  }

  /** Add a geometry that already carries a `color` attribute (e.g. another batch's output). */
  addBaked(geo: THREE.BufferGeometry, pl: Place = {}): this {
    const g = piece(geo, pl, true, false);
    g.clearGroups();
    this.parts.push(g);
    return this;
  }

  get empty(): boolean {
    return this.parts.length === 0;
  }

  geometry(): THREE.BufferGeometry {
    for (const p of this.parts) ensureIndex(p);
    const g = mergeGeometries(this.parts, false);
    if (!g) throw new Error('batch merge failed');
    for (const p of this.parts) p.dispose();
    this.parts = [];
    g.computeBoundingSphere();
    return g;
  }

  build(mat: THREE.Material = vcToon(), shadow = true): THREE.Mesh {
    const m = new THREE.Mesh(this.geometry(), mat);
    m.castShadow = shadow;
    m.receiveShadow = true;
    return m;
  }

  /**
   * Like `build`, but one mesh per `cell`-metre cube (by piece centre), so each camera draws only
   * the chunks it can see. Same pixels as one mesh; the close station views skip most vertices.
   */
  buildChunks(cell: number, mat: THREE.Material = vcToon(), shadow = true): THREE.Group {
    const cells = new Map<string, THREE.BufferGeometry[]>();
    for (const p of this.parts) {
      ensureIndex(p);
      _box.setFromBufferAttribute(p.getAttribute('position') as THREE.BufferAttribute).getCenter(_v);
      const key = `${Math.floor(_v.x / cell)},${Math.floor(_v.y / cell)},${Math.floor(_v.z / cell)}`;
      const list = cells.get(key);
      if (list) list.push(p);
      else cells.set(key, [p]);
    }
    const group = new THREE.Group();
    for (const list of cells.values()) {
      const g = mergeGeometries(list, false);
      if (!g) throw new Error('batch merge failed');
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat);
      m.castShadow = shadow;
      m.receiveShadow = true;
      group.add(m);
    }
    for (const p of this.parts) p.dispose();
    this.parts = [];
    return group;
  }
}

const _box = new THREE.Box3();

/* ------------------------------------------------------------------ math */

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
/** Frame-rate independent ease toward a target. */
export const approach = (cur: number, target: number, rate: number, dt: number) =>
  cur + (target - cur) * (1 - Math.exp(-rate * dt));

/** Deterministic pseudo random in [0,1) from an integer seed. */
export function rand(seed: number): number {
  let s = (seed * 2654435761) >>> 0;
  s = Math.imul(s ^ (s >>> 16), 2246822507) >>> 0;
  s = Math.imul(s ^ (s >>> 13), 3266489909) >>> 0;
  return ((s ^ (s >>> 16)) >>> 0) / 4294967296;
}

const _ca = new THREE.Color();
const _cb = new THREE.Color();
/** Lerp two hex colours into `out`. */
export function mixColor(out: THREE.Color, a: number, b: number, t: number): THREE.Color {
  _ca.setHex(a);
  _cb.setHex(b);
  return out.copy(_ca).lerp(_cb, clamp01(t));
}

/** Multi-stop colour ramp: stops are [t, hex] sorted by t. */
export function ramp(
  out: THREE.Color,
  stops: readonly (readonly [number, number])[],
  t: number,
): THREE.Color {
  if (t <= stops[0]![0]) return out.setHex(stops[0]![1]);
  for (let i = 1; i < stops.length; i++) {
    const [t1, c1] = stops[i]!;
    const [t0, c0] = stops[i - 1]!;
    if (t <= t1) return mixColor(out, c0, c1, (t - t0) / (t1 - t0));
  }
  return out.setHex(stops[stops.length - 1]![1]);
}

/** Simple squash bump for one-shot animations: 0 -> 1 -> 0 over [0,1]. */
export const bump = (s: number) => (s <= 0 || s >= 1 ? 0 : Math.sin(Math.PI * s));
