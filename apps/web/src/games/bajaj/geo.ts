/**
 * Geometry merging for the procedural city and karts: primitives are transformed and appended
 * into one vertex-coloured BufferGeometry, so hundreds of parts become a single draw call.
 *
 * Besides colour, every vertex can carry a PBR "surface" (roughness, metalness, clearcoat,
 * emission) in the `aSurf` attribute: set `builder.surface = SURF.chrome` (etc.) before adding
 * parts. The surface-aware materials in look.ts read it, so one merged mesh can hold matte
 * plaster, glossy paint, chrome and glass at the cost of a single draw call.
 *
 * Boxes added with `box`/`prim('box')` get softly bevelled edges with smooth normals (sized in
 * metres, not stretched with the box), so nothing reads as a hard-edged block.
 */
import * as THREE from 'three';

type Prim =
  | 'box'
  | 'cyl6'
  | 'cyl8'
  | 'cyl12'
  | 'cyl16'
  | 'cone6'
  | 'cone8'
  | 'sphere'
  | 'sphereMd'
  | 'sphereLo'
  | 'gem'
  | 'quad';

const templates = new Map<string, THREE.BufferGeometry>();

function template(kind: Prim): THREE.BufferGeometry {
  let g = templates.get(kind);
  if (g) return g;
  // Segment counts are higher than the names say: the names are kept for the call sites.
  switch (kind) {
    case 'box':
      g = new THREE.BoxGeometry(1, 1, 1);
      break;
    case 'cyl6':
      g = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
      break;
    case 'cyl8':
      g = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
      break;
    case 'cyl12':
      g = new THREE.CylinderGeometry(0.5, 0.5, 1, 18);
      break;
    case 'cyl16':
      g = new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
      break;
    case 'cone6':
      g = new THREE.ConeGeometry(0.5, 1, 8);
      break;
    case 'cone8':
      g = new THREE.ConeGeometry(0.5, 1, 12);
      break;
    case 'sphere':
      g = new THREE.SphereGeometry(0.5, 22, 16);
      break;
    case 'sphereMd':
      g = new THREE.SphereGeometry(0.5, 14, 10);
      break;
    case 'sphereLo':
      g = new THREE.SphereGeometry(0.5, 10, 7);
      break;
    case 'gem':
      g = new THREE.IcosahedronGeometry(0.5, 0);
      break;
    case 'quad':
      g = new THREE.PlaneGeometry(1, 1);
      break;
  }
  templates.set(kind, g);
  return g;
}

/** Cheaper primitive used by a builder's far-away twin. */
const COARSE: Record<Prim, Prim> = {
  box: 'box',
  cyl6: 'cyl6',
  cyl8: 'cyl6',
  cyl12: 'cyl8',
  cyl16: 'cyl8',
  cone6: 'cone6',
  cone8: 'cone6',
  sphere: 'sphereLo',
  sphereMd: 'sphereLo',
  sphereLo: 'gem',
  gem: 'gem',
  quad: 'quad',
};

/* ------------------------------------------------------------------ surfaces */

/** Per-vertex PBR surface: [roughness 0..1, metalness 0..1, clearcoat 0..1, emission 0..8]. */
export type Surf = readonly [number, number, number, number];

/**
 * Surface presets for `GeoBuilder.surface`. Clearcoat only shows on physical materials
 * (karts, drivers); emission multiplies the vertex colour (lamps, lit signs).
 */
export const SURF = {
  plaster: [0.9, 0, 0, 0],
  matte: [0.82, 0, 0, 0],
  satin: [0.55, 0, 0, 0],
  gloss: [0.3, 0, 0.4, 0],
  paint: [0.36, 0.18, 1, 0],
  metal: [0.38, 0.85, 0, 0],
  steel: [0.24, 0.9, 0.2, 0],
  chrome: [0.08, 1, 0.5, 0],
  glass: [0.04, 0, 1, 0],
  rubber: [0.88, 0, 0, 0],
  plastic: [0.42, 0, 0.25, 0],
  vinyl: [0.5, 0, 0.35, 0],
  fabric: [0.94, 0, 0, 0],
  foliage: [0.72, 0, 0, 0],
  wood: [0.7, 0, 0, 0],
  water: [0.05, 0, 0, 0],
  skin: [0.42, 0, 0.45, 0],
  eye: [0.05, 0, 1, 0],
  lamp: [0.25, 0, 0.6, 2.5],
  neon: [0.3, 0, 0, 1.4],
} as const satisfies Record<string, Surf>;

/** A glowing surface: `k` is the emission strength (1 = as bright as the colour). */
export function glow(k: number): Surf {
  return [0.3, 0, 0.5, k];
}

const SURF_DEFAULT = [255, 255, 255, 0] as const;

function encodeSurf(s: Surf): [number, number, number, number] {
  const q = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 254);
  return [q(s[0]), q(s[1]), q(s[2]), Math.round(Math.min(1, Math.max(0, s[3] / 8)) * 255)];
}

/* ------------------------------------------------------------------ bevelled box */

interface BevelVert {
  s: [number, number, number];
  n: [number, number, number];
}

/**
 * 44-triangle box with 45-degree chamfers whose normals blend like a rounded edge, as 24 unique
 * (corner, normal) vertices plus triangle indices.
 */
interface BevelTemplate {
  verts: BevelVert[];
  idx: number[];
}
let bevelTemplate: BevelTemplate | null = null;

function bevelVerts(): BevelTemplate {
  if (bevelTemplate) return bevelTemplate;
  const tris: BevelVert[] = [];
  const e = (axis: number, sign: number): [number, number, number] => {
    const v: [number, number, number] = [0, 0, 0];
    v[axis] = sign;
    return v;
  };
  const pos = (v: BevelVert) => {
    const h = 1;
    const r = 0.25;
    return new THREE.Vector3(
      v.s[0] * (h - r) + v.n[0] * r,
      v.s[1] * (h - r) + v.n[1] * r,
      v.s[2] * (h - r) + v.n[2] * r,
    );
  };
  const tri = (a: BevelVert, b: BevelVert, c: BevelVert) => {
    const pa = pos(a);
    const pb = pos(b);
    const pc = pos(c);
    const nrm = new THREE.Vector3().subVectors(pb, pa).cross(new THREE.Vector3().subVectors(pc, pa));
    const out0 = new THREE.Vector3(...a.n).add(new THREE.Vector3(...b.n)).add(new THREE.Vector3(...c.n));
    if (nrm.dot(out0) < 0) tris.push(a, c, b);
    else tris.push(a, b, c);
  };
  const quad = (a: BevelVert, b: BevelVert, c: BevelVert, d: BevelVert) => {
    tri(a, b, c);
    tri(a, c, d);
  };
  for (let a = 0; a < 3; a++) {
    const b = (a + 1) % 3;
    const c = (a + 2) % 3;
    for (const s of [-1, 1]) {
      const corner = (sb: number, sc: number): BevelVert => {
        const S: [number, number, number] = [0, 0, 0];
        S[a] = s;
        S[b] = sb;
        S[c] = sc;
        return { s: S, n: e(a, s) };
      };
      quad(corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1));
    }
  }
  for (let a = 0; a < 3; a++) {
    for (let b = a + 1; b < 3; b++) {
      const c = 3 - a - b;
      for (const sa of [-1, 1]) {
        for (const sb of [-1, 1]) {
          const v = (sc: number, onA: boolean): BevelVert => {
            const S: [number, number, number] = [0, 0, 0];
            S[a] = sa;
            S[b] = sb;
            S[c] = sc;
            return { s: S, n: onA ? e(a, sa) : e(b, sb) };
          };
          quad(v(-1, true), v(1, true), v(1, false), v(-1, false));
        }
      }
    }
  }
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const S: [number, number, number] = [sx, sy, sz];
        tri({ s: S, n: [sx, 0, 0] }, { s: S, n: [0, sy, 0] }, { s: S, n: [0, 0, sz] });
      }
    }
  }
  const verts: BevelVert[] = [];
  const idx: number[] = [];
  const seen = new Map<string, number>();
  for (const v of tris) {
    const k = `${v.s.join(',')}|${v.n.join(',')}`;
    let i = seen.get(k);
    if (i === undefined) {
      i = verts.length;
      seen.set(k, i);
      verts.push(v);
    }
    idx.push(i);
  }
  bevelTemplate = { verts, idx };
  return bevelTemplate;
}

/** Edge radius used for boxes added without an explicit one (0 = sharp). */
function autoBevel(sx: number, sy: number, sz: number): number {
  const m = Math.min(Math.abs(sx), Math.abs(sy), Math.abs(sz));
  // Thin slats and frames would only get sub-centimetre bevels: keep those sharp and cheap.
  if (m < 0.1) return 0;
  return Math.min(0.09, m * 0.18);
}

/* ------------------------------------------------------------------ builder */

const _m = new THREE.Matrix4();
const _n = new THREE.Matrix3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const ONE = new THREE.Vector3(1, 1, 1);

export type ColorLike = number | string | THREE.Color;

export function color(c: ColorLike): THREE.Color {
  return c instanceof THREE.Color ? c : new THREE.Color(c);
}

export class GeoBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private uv: number[] = [];
  private extra: number[] = [];
  private idx: number[] = [];
  /** Encoded aSurf bytes, created on first use of a surface. */
  private surf: number[] | null = null;
  private surf_: Surf | null = null;
  /**
   * Optional coarse twin for far-away viewing: it receives a cheap copy of everything added here
   * (plain boxes, lower-resolution primitives) except what is added while `lodSkip` > 0.
   * Build both and show them through a THREE.LOD.
   */
  lod: GeoBuilder | null = null;
  /** While > 0, parts go to this builder only: small details the far version leaves out. */
  lodSkip = 0;

  /** Surface for parts added from now on (null = the material's own roughness/metalness). */
  get surface(): Surf | null {
    return this.surf_;
  }
  set surface(s: Surf | null) {
    this.surf_ = s;
    if (this.lod) this.lod.surface = s;
  }

  private fwd(): GeoBuilder | null {
    return this.lodSkip === 0 ? this.lod : null;
  }
  /** Multiplier for the automatic edge bevel of boxes (0 = sharp boxes). */
  boxBevel = 1;

  constructor(
    readonly withUv = false,
    /** Optional per-vertex float (e.g. flag wave weight). */
    readonly withExtra = false,
  ) {}

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  get triangleCount(): number {
    return this.idx.length / 3;
  }

  private pushSurf(count: number, src?: THREE.BufferAttribute): void {
    if (!this.surface && !this.surf && !src) return;
    if (!this.surf) {
      const prev = this.pos.length / 3 - count;
      this.surf = new Array<number>(prev * 4);
      for (let i = 0; i < prev; i++) {
        this.surf[i * 4] = SURF_DEFAULT[0];
        this.surf[i * 4 + 1] = SURF_DEFAULT[1];
        this.surf[i * 4 + 2] = SURF_DEFAULT[2];
        this.surf[i * 4 + 3] = SURF_DEFAULT[3];
      }
    }
    const own = this.surface ? encodeSurf(this.surface) : SURF_DEFAULT;
    const arr = src ? (src.array as ArrayLike<number>) : null;
    const scale = src && !src.normalized ? 255 : 1;
    for (let i = 0; i < count; i++) {
      if (arr) {
        const j = i * 4;
        const r = arr[j]! * scale;
        const m = arr[j + 1]! * scale;
        const c = arr[j + 2]! * scale;
        const e = arr[j + 3]! * scale;
        // Source surfaces win unless they are the default.
        if (r < 255 || m < 255 || c < 255 || e > 0) {
          this.surf.push(r, m, c, e);
          continue;
        }
      }
      this.surf.push(own[0], own[1], own[2], own[3]);
    }
  }

  /** Append triangle indices (relative to `base`), flipping winding for mirrored transforms. */
  private pushIndex(base: number, src: ArrayLike<number> | null, count: number, flip: boolean): void {
    for (let i = 0; i < count; i += 3) {
      const a = src ? src[i]! : i;
      const b = src ? src[i + 1]! : i + 1;
      const c = src ? src[i + 2]! : i + 2;
      if (flip) this.idx.push(base + a, base + c, base + b);
      else this.idx.push(base + a, base + b, base + c);
    }
  }

  /**
   * Append a geometry (non-indexed or indexed) under `m`, coloured `c`.
   * `uvRect` remaps the source UVs (0..1) into [u0, v0, u1, v1].
   */
  addGeometry(
    g: THREE.BufferGeometry,
    m: THREE.Matrix4,
    c: ColorLike,
    uvRect?: readonly [number, number, number, number],
    extra?: (x: number, y: number, z: number) => number,
  ): void {
    this.addRaw(g, m, c, uvRect, extra);
    this.fwd()?.addRaw(g, m, c, uvRect, extra);
  }

  private addRaw(
    g: THREE.BufferGeometry,
    m: THREE.Matrix4,
    c: ColorLike,
    uvRect?: readonly [number, number, number, number],
    extra?: (x: number, y: number, z: number) => number,
  ): void {
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    const n = g.getAttribute('normal') as THREE.BufferAttribute | undefined;
    const uv = g.getAttribute('uv') as THREE.BufferAttribute | undefined;
    const vc = g.getAttribute('color') as THREE.BufferAttribute | undefined;
    const sa = g.getAttribute('aSurf') as THREE.BufferAttribute | undefined;
    const base = this.pos.length / 3;
    _n.getNormalMatrix(m);
    const k = color(c);
    for (let i = 0; i < p.count; i++) {
      _v.set(p.getX(i), p.getY(i), p.getZ(i));
      const lx = _v.x;
      const ly = _v.y;
      const lz = _v.z;
      _v.applyMatrix4(m);
      this.pos.push(_v.x, _v.y, _v.z);
      if (n) _p.set(n.getX(i), n.getY(i), n.getZ(i)).applyMatrix3(_n).normalize();
      else _p.set(0, 1, 0);
      this.nor.push(_p.x, _p.y, _p.z);
      if (vc) {
        _c.setRGB(vc.getX(i) * k.r, vc.getY(i) * k.g, vc.getZ(i) * k.b);
        this.col.push(_c.r, _c.g, _c.b);
      } else {
        this.col.push(k.r, k.g, k.b);
      }
      if (this.withUv) {
        let u = uv ? uv.getX(i) : 0;
        let w = uv ? uv.getY(i) : 0;
        if (uvRect) {
          u = uvRect[0] + (uvRect[2] - uvRect[0]) * u;
          w = uvRect[1] + (uvRect[3] - uvRect[1]) * w;
        }
        this.uv.push(u, w);
      }
      if (this.withExtra) this.extra.push(extra ? extra(lx, ly, lz) : 0);
    }
    this.pushSurf(p.count, sa);
    const flip = m.determinant() < 0;
    if (g.index) this.pushIndex(base, g.index.array, g.index.count, flip);
    else this.pushIndex(base, null, p.count, flip);
  }

  /** Primitive at position, rotation (Euler XYZ radians) and size. */
  prim(
    kind: Prim,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    c: ColorLike,
    rx = 0,
    ry = 0,
    rz = 0,
    uvRect?: readonly [number, number, number, number],
  ): void {
    this.fwd()?.prim(COARSE[kind], x, y, z, sx, sy, sz, c, rx, ry, rz, uvRect);
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    if (kind === 'box') {
      const r = autoBevel(sx, sy, sz) * this.boxBevel;
      if (r > 0.004) {
        _m.compose(_p.set(x, y, z), _q, ONE);
        this.bevelRaw(_m, sx, sy, sz, r, c, uvRect);
        return;
      }
    }
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    this.addRaw(template(kind), _m, c, uvRect);
  }

  /** Primitive placed through a parent matrix (e.g. a building's frame). */
  primIn(
    parent: THREE.Matrix4,
    kind: Prim,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    c: ColorLike,
    rx = 0,
    ry = 0,
    rz = 0,
    uvRect?: readonly [number, number, number, number],
  ): void {
    this.fwd()?.primIn(parent, COARSE[kind], x, y, z, sx, sy, sz, c, rx, ry, rz, uvRect);
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    if (kind === 'box') {
      const r = autoBevel(sx, sy, sz) * this.boxBevel;
      if (r > 0.004) {
        const local = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.clone(), ONE);
        this.bevelRaw(new THREE.Matrix4().multiplyMatrices(parent, local), sx, sy, sz, r, c, uvRect);
        return;
      }
    }
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      _q.clone(),
      new THREE.Vector3(sx, sy, sz),
    );
    this.addRaw(template(kind), new THREE.Matrix4().multiplyMatrices(parent, local), c, uvRect);
  }

  box(x: number, y: number, z: number, w: number, h: number, d: number, c: ColorLike, ry = 0): void {
    this.prim('box', x, y, z, w, h, d, c, 0, ry, 0);
  }

  /** Box of size w x h x d with edges rounded by `r` metres, placed by `m` (no scale in `m`). */
  bevelBox(
    m: THREE.Matrix4,
    w: number,
    h: number,
    d: number,
    r: number,
    c: ColorLike,
    uvRect?: readonly [number, number, number, number],
  ): void {
    this.fwd()?.addRaw(
      template('box'),
      new THREE.Matrix4().multiplyMatrices(m, new THREE.Matrix4().makeScale(w, h, d)),
      c,
      uvRect,
    );
    this.bevelRaw(m, w, h, d, r, c, uvRect);
  }

  private bevelRaw(
    m: THREE.Matrix4,
    w: number,
    h: number,
    d: number,
    r: number,
    c: ColorLike,
    uvRect?: readonly [number, number, number, number],
  ): void {
    const hs = [Math.abs(w) / 2, Math.abs(h) / 2, Math.abs(d) / 2];
    const rr = Math.min(r, hs[0]! * 0.95, hs[1]! * 0.95, hs[2]! * 0.95);
    const k = color(c);
    _n.getNormalMatrix(m);
    const t = bevelVerts();
    const base = this.pos.length / 3;
    for (const v of t.verts) {
      const px = v.s[0] * (hs[0]! - rr) + v.n[0] * rr;
      const py = v.s[1] * (hs[1]! - rr) + v.n[1] * rr;
      const pz = v.s[2] * (hs[2]! - rr) + v.n[2] * rr;
      _v.set(px, py, pz).applyMatrix4(m);
      this.pos.push(_v.x, _v.y, _v.z);
      _p.set(v.n[0], v.n[1], v.n[2]).applyMatrix3(_n).normalize();
      this.nor.push(_p.x, _p.y, _p.z);
      this.col.push(k.r, k.g, k.b);
      if (this.withUv) {
        // Project on the plane of the vertex's face, like BoxGeometry's per-face mapping.
        const ax = v.n[0] !== 0 ? 0 : v.n[1] !== 0 ? 1 : 2;
        const p3 = [px / hs[0]!, py / hs[1]!, pz / hs[2]!];
        let u = (p3[(ax + 1) % 3]! + 1) / 2;
        let w2 = (p3[(ax + 2) % 3]! + 1) / 2;
        if (uvRect) {
          u = uvRect[0] + (uvRect[2] - uvRect[0]) * u;
          w2 = uvRect[1] + (uvRect[3] - uvRect[1]) * w2;
        }
        this.uv.push(u, w2);
      }
      if (this.withExtra) this.extra.push(0);
    }
    this.pushSurf(t.verts.length);
    this.pushIndex(base, t.idx, t.idx.length, m.determinant() < 0);
  }

  /** Rounded box at a position/rotation with an explicit edge radius. */
  roundBox(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    c: ColorLike,
    r: number,
    rx = 0,
    ry = 0,
    rz = 0,
  ): void {
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    this.bevelBox(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.clone(), ONE), w, h, d, r, c);
  }

  /** `roundBox` in a parent frame. */
  roundBoxIn(
    parent: THREE.Matrix4,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    c: ColorLike,
    r: number,
    rx = 0,
    ry = 0,
    rz = 0,
  ): void {
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    const local = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.clone(), ONE);
    this.bevelBox(new THREE.Matrix4().multiplyMatrices(parent, local), w, h, d, r, c);
  }

  /** Raw triangle with explicit corners (counter-clockwise seen from the front). */
  tri(
    a: readonly [number, number, number],
    b: readonly [number, number, number],
    c: readonly [number, number, number],
    col: ColorLike,
    uvs?: readonly [number, number, number, number, number, number],
    extra?: readonly [number, number, number],
  ): void {
    this.poly([a, b, c], col, uvs ?? [0, 0, 0, 0, 0, 0], extra ?? [0, 0, 0]);
  }

  /** Quad a-b-c-d (counter-clockwise from the front), flat-shaded, 4 vertices. */
  quad(
    a: readonly [number, number, number],
    b: readonly [number, number, number],
    c: readonly [number, number, number],
    d: readonly [number, number, number],
    col: ColorLike,
    uv?: readonly [number, number, number, number],
    extra?: readonly [number, number, number, number],
  ): void {
    const [u0, v0, u1, v1] = uv ?? [0, 0, 1, 1];
    this.poly([a, b, c, d], col, [u0, v0, u1, v0, u1, v1, u0, v1], extra ?? [0, 0, 0, 0]);
  }

  /** Flat convex polygon (3 or 4 corners) as a fan. */
  private poly(
    pts: readonly (readonly [number, number, number])[],
    col: ColorLike,
    uvs: readonly number[],
    extra: readonly number[],
  ): void {
    this.fwd()?.poly(pts, col, uvs, extra);
    const [a, b, c] = pts as [
      readonly [number, number, number],
      readonly [number, number, number],
      readonly [number, number, number],
    ];
    const ab = _v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const ac = _s.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const nrm = _p.crossVectors(ab, ac).normalize();
    const k = color(col);
    const base = this.pos.length / 3;
    pts.forEach((v, i) => {
      this.pos.push(v[0], v[1], v[2]);
      this.nor.push(nrm.x, nrm.y, nrm.z);
      this.col.push(k.r, k.g, k.b);
      if (this.withUv) this.uv.push(uvs[i * 2] ?? 0, uvs[i * 2 + 1] ?? 0);
      if (this.withExtra) this.extra.push(extra[i] ?? 0);
    });
    this.pushSurf(pts.length);
    for (let i = 1; i < pts.length - 1; i++) this.idx.push(base, base + i, base + i + 1);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.withUv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.withExtra) g.setAttribute('aWave', new THREE.Float32BufferAttribute(this.extra, 1));
    if (this.surf)
      g.setAttribute('aSurf', new THREE.Uint8BufferAttribute(Uint8Array.from(this.surf), 4, true));
    const n = this.pos.length / 3;
    g.setIndex(
      n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1),
    );
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/* ------------------------------------------------------------------ colour helpers */

/** Darken/lighten a colour by `f` (0.8 = 20% darker). */
export function shade(c: ColorLike, f: number): THREE.Color {
  const k = color(c).clone();
  k.r = Math.min(1, k.r * f);
  k.g = Math.min(1, k.g * f);
  k.b = Math.min(1, k.b * f);
  return k;
}

export function mix(a: ColorLike, b: ColorLike, t: number): THREE.Color {
  return color(a).clone().lerp(color(b), t);
}

/** Recolour every vertex of a geometry by a function of its position. */
export function paint(g: THREE.BufferGeometry, fn: (x: number, y: number, z: number) => THREE.Color): void {
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const arr = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const k = fn(p.getX(i), p.getY(i), p.getZ(i));
    arr[i * 3] = k.r;
    arr[i * 3 + 1] = k.g;
    arr[i * 3 + 2] = k.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

/** Per-face recolour (flat patterns like melon stripes): fn gets the face centroid. */
export function paintFaces(
  g: THREE.BufferGeometry,
  fn: (x: number, y: number, z: number) => THREE.Color,
): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  const p = src.getAttribute('position') as THREE.BufferAttribute;
  const arr = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i += 3) {
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
    const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    const k = fn(cx, cy, cz);
    for (let j = 0; j < 3; j++) {
      arr[(i + j) * 3] = k.r;
      arr[(i + j) * 3 + 1] = k.g;
      arr[(i + j) * 3 + 2] = k.b;
    }
  }
  src.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return src;
}

/** Deterministic hash-based random in [0, 1). */
export function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Smooth 3D value noise in [-1, 1] (organic displacement for foliage, fruit skin, cloth). */
export function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const s = (t: number) => t * t * (3 - 2 * t);
  const h = (a: number, b: number, c: number) => hash01(a * 57.31 + b * 113.7 + c * 271.3) * 2 - 1;
  const u = s(xf);
  const v = s(yf);
  const w = s(zf);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(
    l(l(h(xi, yi, zi), h(xi + 1, yi, zi), u), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
    l(
      l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u),
      l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u),
      v,
    ),
    w,
  );
}

/* ------------------------------------------------------------------ smooth shapes */

/** Cross-section of a loft: a superellipse ("squircle") in the x-y plane at depth `z`. */
export interface Section {
  z: number;
  /** Bottom and top. */
  y0: number;
  y1: number;
  /** Half width at the top half; `hwb` at the bottom (defaults to `hw`). */
  hw: number;
  hwb?: number;
  /** Centre x (default 0). */
  x?: number;
  /** Superellipse exponent: 2 = ellipse, 4-8 = rounded box (default 4). */
  n?: number;
}

/**
 * Smooth closed shell through the sections (ordered by increasing z), indexed with smooth
 * normals. `caps` closes both ends with fans; make the end sections small for rounded ends.
 */
export function loft(sections: readonly Section[], around = 28, caps = true): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const sp = (v: number, e: number) => Math.sign(v) * Math.abs(v) ** e;
  for (const s of sections) {
    const e = 2 / (s.n ?? 4);
    const cx = s.x ?? 0;
    const yc = (s.y0 + s.y1) / 2;
    const hh = (s.y1 - s.y0) / 2;
    const hwb = s.hwb ?? s.hw;
    for (let k = 0; k < around; k++) {
      const t = (k / around) * Math.PI * 2;
      const ny = sp(Math.sin(t), e);
      const w = hwb + (s.hw - hwb) * ((ny + 1) / 2);
      pos.push(cx + w * sp(Math.cos(t), e), yc + hh * ny, s.z);
    }
  }
  const ring = (i: number, k: number) => i * around + (k % around);
  for (let i = 0; i < sections.length - 1; i++) {
    for (let k = 0; k < around; k++) {
      const a = ring(i, k);
      const b = ring(i, k + 1);
      const c = ring(i + 1, k + 1);
      const d = ring(i + 1, k);
      idx.push(a, b, c, a, c, d);
    }
  }
  if (caps) {
    for (const [i, end] of [
      [0, false],
      [sections.length - 1, true],
    ] as const) {
      const s = sections[i]!;
      const ci = pos.length / 3;
      pos.push(s.x ?? 0, (s.y0 + s.y1) / 2, s.z);
      for (let k = 0; k < around; k++) {
        if (end) idx.push(ci, ring(i, k), ring(i, k + 1));
        else idx.push(ci, ring(i, k + 1), ring(i, k));
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Move every vertex of an indexed geometry, then recompute smooth normals. */
export function displace(
  g: THREE.BufferGeometry,
  fn: (p: THREE.Vector3, n: THREE.Vector3) => void,
): THREE.BufferGeometry {
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const nv = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i));
    nv.set(n.getX(i), n.getY(i), n.getZ(i));
    fn(v, nv);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/**
 * Indexed copy of a geometry with shared corners merged, so `computeVertexNormals` gives
 * smooth shading (ExtrudeGeometry and friends come out flat-shaded).
 */
export function smooth(g: THREE.BufferGeometry, tolerance = 1e-4): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  const p = src.getAttribute('position') as THREE.BufferAttribute;
  const map = new Map<string, number>();
  const pos: number[] = [];
  const idx: number[] = [];
  const q = 1 / tolerance;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const key = `${Math.round(x * q)},${Math.round(y * q)},${Math.round(z * q)}`;
    let j = map.get(key);
    if (j === undefined) {
      j = pos.length / 3;
      map.set(key, j);
      pos.push(x, y, z);
    }
    idx.push(j);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setIndex(idx);
  out.computeVertexNormals();
  return out;
}

/**
 * Smooth tube through `points` (Catmull-Rom), radius `r`, with rounded end caps unless the
 * path is closed. Good for frame rails, bumpers, pipes and handlebars.
 */
export function tube(
  points: readonly THREE.Vector3[],
  r: number,
  opts: { radial?: number; segments?: number; closed?: boolean; caps?: boolean; tension?: number } = {},
): THREE.BufferGeometry {
  const closed = opts.closed ?? false;
  const curve = new THREE.CatmullRomCurve3(points.slice(), closed, 'catmullrom', opts.tension ?? 0.5);
  const segs = opts.segments ?? Math.max(3, Math.ceil(curve.getLength() / Math.max(0.035, r * 4)));
  const radial = opts.radial ?? 8;
  const tg = new THREE.TubeGeometry(curve, Math.min(64, segs), r, radial, closed);
  if (closed || opts.caps === false) return tg;
  const b = new GeoBuilder();
  b.addGeometry(tg, new THREE.Matrix4(), 0xffffff);
  const cap = new THREE.SphereGeometry(r, radial, 3);
  for (const t of [0, 1]) {
    const pt = curve.getPointAt(t);
    b.addGeometry(cap, new THREE.Matrix4().makeTranslation(pt.x, pt.y, pt.z), 0xffffff);
  }
  const out = b.build();
  out.deleteAttribute('color');
  return out;
}
