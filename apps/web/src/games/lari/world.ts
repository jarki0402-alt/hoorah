/**
 * The city around the run, assembled from the city and props packs (tools/assets/lari): every
 * track building's roof deck, parapets with rounded copings, the hazard lip and lit top-floor
 * windows at gaps, festoon lights, laundry, billboards and rooftop clutter; neighbouring blocks
 * on both sides with their own parapets, top-floor bays and clutter; far towers; the street far
 * below; the golden-hour sky with sculpted clouds and a skyline backdrop.
 *
 * Everything streams with the camera and is drawn from fixed-size instanced pools (no geometry
 * is built while running, no allocation per frame). Clutter near the camera uses the full
 * models and switches to the lighter `@1` models farther away (always on weak GPUs).
 * World space: x across the roof (lanes at -1.9, 0, 1.9), y up (roof deck at 0), z = -distance.
 */
import * as THREE from 'three';
import { WALL_COLORS } from '../bajaj/buildings';
import { hash01, mix } from '../bajaj/geo';
import { type LariAssets, model, type Part } from './assets';
import { LARI_MAT } from './materials';
import { DECOR_KINDS, type DecorKind } from './models';
import { cloudTexture, SIGN_SLOTS, signUv, skylineTexture } from './textures';
import type { Roof, Track } from './track';

/** Half width of a track building's roof deck (m). */
export const ROOF_HALF = 7.6;
const DECK_T = 0.35;
const PARAPET_H = 0.8;
/** Length of one parapet / façade module (m). */
const BAY = 3.2;
/** Long roofs stream in sections of at most this length (m, a multiple of the bay). */
const SECTION = BAY * 12;
/** How far ahead of and behind the camera the city is kept (m). */
const AHEAD = 280;
const BEHIND = 40;
/** Clutter, parapets and obstacles closer than this (m ahead of the camera) use the full models. */
export const NEAR_LOD = 50;
/** Neighbouring blocks show modelled top-floor bays this far ahead (m); the texture beyond. */
const BAY_RANGE = 150;

/* ------------------------------------------------------------------ sky */

export const SKY = {
  zenith: new THREE.Color(0x2f72b8),
  mid: new THREE.Color(0x86c2e2),
  cream: new THREE.Color(0xf5dcae),
  horizon: new THREE.Color(0xf6ae6c),
  glow: new THREE.Color(0xff9a42),
  haze: new THREE.Color(0xe9bf92),
  /** Direction towards the sun: low, to the right and a little behind the camera. */
  sunDir: new THREE.Vector3(0.66, 0.4, 0.62).normalize(),
};

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uMid;
uniform vec3 uCream;
uniform vec3 uHorizon;
uniform vec3 uGlow;
uniform vec3 uHaze;
uniform vec3 uSun;
uniform sampler2D uClouds;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  // Gold at the horizon, a cream band, clear sky blue, deeper blue overhead (never via grey).
  vec3 col = mix(uHorizon, uCream, smoothstep(0.0, 0.06, h));
  col = mix(col, uMid, smoothstep(0.05, 0.22, h));
  col = mix(col, uZenith, smoothstep(0.2, 0.7, h));
  // Warm light towards the sun side and a golden band on the horizon.
  float s = max(dot(normalize(vec3(d.x, max(h, 0.0) * 0.6, d.z)), normalize(vec3(uSun.x, 0.0, uSun.z))), 0.0);
  col += uGlow * (pow(s, 3.0) * 0.42 + pow(s, 16.0) * 0.35) * (1.0 - smoothstep(0.0, 0.5, h));
  col = mix(col, uGlow, (1.0 - smoothstep(0.0, 0.07, h)) * 0.35);
  // Clouds: a panoramic band (red = lit, green = shade, alpha = cover).
  float az = atan(d.x, -d.z) / 6.2831853 + 0.5;
  float el = h / 0.62;
  if (el > 0.0 && el < 1.0) {
    vec4 c = texture2D(uClouds, vec2(az * 2.0, el));
    vec3 lit = mix(vec3(1.0, 0.86, 0.68), vec3(1.0, 0.97, 0.9), c.g);
    vec3 shade = mix(uHaze * 0.92, vec3(0.86, 0.78, 0.74), 0.4);
    vec3 cloud = mix(shade, lit, c.r);
    col = mix(col, cloud, c.a * 0.8 * smoothstep(0.02, 0.14, el));
  }
  // Below the horizon: haze.
  col = mix(col, uHaze, 1.0 - smoothstep(-0.02, 0.015, h));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const SKYLINE_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uFar;
uniform vec3 uNear;
uniform float uLayer;
varying vec2 vUv;
void main() {
  vec2 uv = vec2(vUv.x * 3.0, uLayer < 0.5 ? 0.5 + vUv.y * 0.5 : vUv.y * 0.5);
  float a = texture2D(uMap, uv).a;
  if (a < 0.02) discard;
  vec3 col = uLayer < 0.5 ? uFar : uNear;
  // Fade the base into the haze.
  col = mix(col, uFar * 1.05, (1.0 - vUv.y) * 0.5);
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const SKYLINE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

function makeSky(): THREE.Group {
  const g = new THREE.Group();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1600, 48, 24),
    new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uZenith: { value: SKY.zenith },
        uMid: { value: SKY.mid },
        uCream: { value: SKY.cream },
        uHorizon: { value: SKY.horizon },
        uGlow: { value: SKY.glow },
        uHaze: { value: SKY.haze },
        uSun: { value: SKY.sunDir },
        uClouds: { value: cloudTexture() },
      },
    }),
  );
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  g.add(dome);
  const map = skylineTexture();
  const layers: [number, number, number, THREE.Color, THREE.Color][] = [
    [1300, 150, 0, mix(SKY.haze, 0xb9b4b8, 0.35), mix(SKY.haze, 0xb9b4b8, 0.35)],
    [900, 90, 1, mix(SKY.haze, 0x9a8f8c, 0.45), mix(SKY.haze, 0x8a7d78, 0.55)],
  ];
  for (const [r, h, layer, far, near] of layers) {
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, h, 96, 1, true),
      new THREE.ShaderMaterial({
        vertexShader: SKYLINE_VERT,
        fragmentShader: SKYLINE_FRAG,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        fog: false,
        uniforms: {
          uMap: { value: map },
          uFar: { value: far },
          uNear: { value: near },
          uLayer: { value: layer },
        },
      }),
    );
    cyl.position.y = h / 2 - 30 - layer * 8;
    cyl.renderOrder = -9 + layer;
    cyl.frustumCulled = false;
    g.add(cyl);
  }
  return g;
}

/* ------------------------------------------------------------------ instanced pools */

/** Fixed-size instanced pool with stable handles; live instances are kept packed. */
export class Pool {
  readonly mesh: THREE.InstancedMesh;
  private readonly slotOf: Int32Array;
  private readonly handleOf: Int32Array;
  private readonly freeHandles: number[] = [];
  private live = 0;
  private dirty = false;
  private readonly tmp = new THREE.Matrix4();
  private readonly tmpC = new THREE.Color();

  constructor(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    readonly capacity: number,
    colored = false,
  ) {
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (colored) this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.slotOf = new Int32Array(capacity).fill(-1);
    this.handleOf = new Int32Array(capacity).fill(-1);
    for (let i = capacity - 1; i >= 0; i--) this.freeHandles.push(i);
  }

  get count(): number {
    return this.live;
  }

  /** Add an instance; returns its handle, or -1 when the pool is full. */
  add(m: THREE.Matrix4, color?: THREE.ColorRepresentation): number {
    const h = this.freeHandles.pop();
    if (h === undefined) return -1;
    const slot = this.live++;
    this.slotOf[h] = slot;
    this.handleOf[slot] = h;
    this.mesh.setMatrixAt(slot, m);
    if (color !== undefined && this.mesh.instanceColor) this.mesh.setColorAt(slot, this.tmpC.set(color));
    this.mesh.count = this.live;
    this.dirty = true;
    return h;
  }

  /** Move an existing instance. */
  set(handle: number, m: THREE.Matrix4): void {
    const slot = this.slotOf[handle] ?? -1;
    if (slot < 0) return;
    this.mesh.setMatrixAt(slot, m);
    this.dirty = true;
  }

  remove(handle: number): void {
    const slot = this.slotOf[handle] ?? -1;
    if (slot < 0) return;
    const last = this.live - 1;
    if (slot !== last) {
      this.mesh.getMatrixAt(last, this.tmp);
      this.mesh.setMatrixAt(slot, this.tmp);
      if (this.mesh.instanceColor) {
        this.mesh.getColorAt(last, this.tmpC);
        this.mesh.setColorAt(slot, this.tmpC);
      }
      const moved = this.handleOf[last]!;
      this.slotOf[moved] = slot;
      this.handleOf[slot] = moved;
    }
    this.slotOf[handle] = -1;
    this.handleOf[last] = -1;
    this.freeHandles.push(handle);
    this.live = last;
    this.mesh.count = this.live;
    this.dirty = true;
  }

  flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/**
 * A multi-part model drawn by one pool per part, used in lockstep so every part gets the same
 * handle. `tinted` parts (walls) take the instance colour; the rest stay as authored.
 */
export class ModelPool {
  readonly pools: Pool[];

  constructor(
    parts: Part[],
    capacity: number,
    materialFor: (p: Part) => THREE.Material,
    root: THREE.Object3D,
    name = '',
  ) {
    this.pools = parts.map((p) => {
      const pool = new Pool(p.geometry, materialFor(p), capacity, p.material === 'wall');
      pool.mesh.name = name;
      root.add(pool.mesh);
      return pool;
    });
  }

  add(m: THREE.Matrix4, tint?: THREE.ColorRepresentation): number {
    let h = -1;
    for (const p of this.pools) h = p.add(m, tint);
    return h;
  }

  set(handle: number, m: THREE.Matrix4): void {
    for (const p of this.pools) p.set(handle, m);
  }

  remove(handle: number): void {
    for (const p of this.pools) p.remove(handle);
  }

  flush(): void {
    for (const p of this.pools) p.flush();
  }

  shadows(cast: boolean, receive = true): this {
    for (const p of this.pools) {
      p.mesh.castShadow = cast;
      p.mesh.receiveShadow = receive;
    }
    return this;
  }
}

/** Rough footprint radius of each decor kind (m), for spacing. */
const DECOR_SIZE: Record<DecorKind, number> = {
  tankOrange: 0.8,
  tankBlue: 0.8,
  ac: 0.5,
  antenna: 0.4,
  dish: 0.5,
  plants: 0.6,
  hut: 1.35,
  coop: 0.9,
  solar: 1.0,
  chairs: 1.0,
  vents: 0.4,
  tree: 0.7,
  planter: 1.15,
};

const DECOR_CAP: Record<DecorKind, number> = {
  tankOrange: 40,
  tankBlue: 30,
  ac: 90,
  antenna: 40,
  dish: 40,
  plants: 50,
  hut: 16,
  coop: 12,
  solar: 20,
  chairs: 14,
  vents: 60,
  tree: 24,
  planter: 24,
};

const SHADOW_CASTERS = new Set<DecorKind>(['tankOrange', 'tankBlue', 'hut', 'coop', 'solar', 'tree']);

/** Full and light model of the same thing (null: not drawn at that distance). */
type LodPair = [ModelPool, ModelPool | null];

/** One placed instance; pieces with two levels of detail remember enough to swap. */
interface Placed {
  pool: ModelPool;
  handle: number;
  pair?: LodPair;
  lod?: 0 | 1;
  z?: number;
  matrix?: THREE.Matrix4;
  tint?: THREE.Color;
  /** Distance ahead (m) where the full model gives way to the light one. */
  range?: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _y = new THREE.Vector3(0, 1, 0);

function place(x: number, y: number, z: number, ry: number, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  _q.setFromAxisAngle(_y, ry);
  return _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

/** Box with a white vertex colour (vertex-coloured materials tint it per instance). */
function whiteBox(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, -0.5, 0);
  const n = g.getAttribute('position').count;
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  return g;
}

/* ------------------------------------------------------------------ side blocks */

interface BlockSpec {
  key: string;
  col: number;
  x: number;
  w: number;
  z0: number;
  z1: number;
  top: number;
  color: number;
  seed: number;
  roof: 0 | 1 | 2;
}

/** Columns of neighbouring buildings: centre x, width, height range relative to our roof. */
const COLUMNS: readonly { x: number; w: number; lo: number; hi: number; tall: number }[] = [
  { x: -19, w: 13, lo: -9, hi: -2.5, tall: 0.04 },
  { x: 19, w: 13, lo: -9, hi: -2.5, tall: 0.04 },
  { x: -37, w: 16, lo: -6, hi: 1, tall: 0.12 },
  { x: 37, w: 16, lo: -6, hi: 1, tall: 0.12 },
  { x: -60, w: 22, lo: -2, hi: 14, tall: 0.35 },
  { x: 60, w: 22, lo: -2, hi: 14, tall: 0.35 },
];
const BLOCK_PITCH = 36;

function blockSpec(col: number, i: number): BlockSpec {
  const c = COLUMNS[col]!;
  const r = (k: number) => hash01(col * 131.7 + i * 17.31 + k * 3.7);
  const len = BLOCK_PITCH * (0.55 + r(1) * 0.38);
  const z1 = -i * BLOCK_PITCH;
  const tall = r(2) < c.tall;
  return {
    key: `${col}:${i}`,
    col,
    x: c.x + (r(3) - 0.5) * 3,
    w: c.w * (0.8 + r(4) * 0.3),
    z0: z1 - len,
    z1,
    top: tall ? c.hi + 6 + r(5) * 14 : c.lo + (c.hi - c.lo) * r(5),
    color: WALL_COLORS[Math.floor(r(6) * WALL_COLORS.length)]!,
    seed: col * 1000 + i,
    roof: (Math.floor(r(7) * 3) % 3) as 0 | 1 | 2,
  };
}

/* ------------------------------------------------------------------ clouds */

/** Sculpted clouds on a ring far around the camera (they travel with it, like the sky). */
function makeClouds(a: LariAssets): THREE.Group {
  const g = new THREE.Group();
  const mat = LARI_MAT.cloud();
  const per = 4;
  for (let k = 0; k < 4; k++) {
    const part = model(a, `cloud${k}`)[0]!;
    const inst = new THREE.InstancedMesh(part.geometry, mat, per);
    for (let i = 0; i < per; i++) {
      const idx = k * per + i;
      const r = (j: number) => hash01(idx * 13.7 + j * 3.1 + 5);
      const ang = (idx / (per * 4)) * Math.PI * 2 + r(1) * 0.3;
      const dist = 820 + r(2) * 360;
      const s = 2.2 + r(4) * 1.8;
      inst.setMatrixAt(
        i,
        place(
          Math.sin(ang) * dist,
          120 + r(3) * 190,
          Math.cos(ang) * dist,
          r(5) * 6.28,
          s,
          s * (0.6 + r(6) * 0.35),
          s,
        ),
      );
    }
    inst.frustumCulled = false;
    inst.castShadow = false;
    inst.receiveShadow = false;
    inst.renderOrder = -8;
    g.add(inst);
  }
  return g;
}

/* ------------------------------------------------------------------ world */

type Bays = [ModelPool, ModelPool, ModelPool, ModelPool];

export class World {
  readonly root = new THREE.Group();
  readonly sky: THREE.Group;
  private readonly ground: THREE.Mesh;
  private readonly decor = new Map<DecorKind, [ModelPool, ModelPool]>();
  /** Lightest clutter for the far columns of neighbouring blocks. */
  private readonly distantDecor = new Map<DecorKind, ModelPool>();
  private readonly decks: [Pool, Pool, Pool];
  private readonly facades: Pool;
  private readonly towers: Pool;
  private readonly joints: Pool;
  private readonly parapet: LodPair;
  private readonly parapetS: LodPair;
  /** Top-floor bays: full models on end walls at gaps (light when far), light ones on blocks. */
  private readonly frontBays: LodPair[];
  private readonly farBays: Bays;
  private readonly edge: ModelPool;
  private readonly rims: ModelPool;
  private readonly spans: LodPair;
  private readonly posts: LodPair;
  private readonly laundry: ModelPool;
  private readonly billboard: ModelPool;
  private readonly signs: Pool[] = [];
  private readonly all: (Pool | ModelPool)[] = [];
  private readonly buildings = new Map<number, Placed[]>();
  private readonly blocks = new Map<string, Placed[]>();
  private readonly towerSlots: { handle: number; z: number; idx: number }[] = [];
  private readonly tint = new THREE.Color();

  constructor(
    assets: LariAssets,
    private readonly lowDetail: boolean,
  ) {
    this.sky = makeSky();
    this.sky.add(makeClouds(assets));
    this.root.add(this.sky);
    // Street far below, seen through the gaps.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900),
      lowDetail
        ? new THREE.MeshLambertMaterial({ color: 0x5a4a3c })
        : new THREE.MeshStandardMaterial({ color: 0x5a4a3c, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -34;
    ground.receiveShadow = false;
    this.ground = ground;
    this.root.add(ground);

    const reflect = lowDetail ? 0 : 0.5;
    const materialFor = (p: Part): THREE.Material => {
      if (p.material === 'cloth') return LARI_MAT.fabric();
      if (p.material === 'duck') return LARI_MAT.duck();
      if (p.material === 'wall') return LARI_MAT.surface(0);
      return LARI_MAT.surface(reflect);
    };
    const pool = (name: string, cap: number) => {
      const mp = new ModelPool(model(assets, name), cap, materialFor, this.root, name);
      this.all.push(mp);
      return mp;
    };
    const lod = (name: string) => (lowDetail && assets.models.has(`${name}@1`) ? `${name}@1` : name);
    for (const kind of DECOR_KINDS) {
      // Weak GPUs use the lightest models everywhere.
      const near = pool(lowDetail ? `${kind}@2` : kind, DECOR_CAP[kind]);
      const far = pool(lowDetail ? `${kind}@2` : `${kind}@1`, DECOR_CAP[kind] + 30);
      const distant = lowDetail ? far : pool(`${kind}@2`, 40);
      // Only the big clutter casts into the shadow map; small parts keep their baked occlusion.
      near.shadows(SHADOW_CASTERS.has(kind));
      far.shadows(false);
      distant.shadows(false);
      this.decor.set(kind, [near, far]);
      this.distantDecor.set(kind, distant);
    }
    const box = whiteBox();
    const unit = (mat: THREE.Material, cap: number, cast = false, receive = true) => {
      const p = new Pool(box, mat, cap, true);
      p.mesh.castShadow = cast;
      p.mesh.receiveShadow = receive;
      this.root.add(p.mesh);
      this.all.push(p);
      return p;
    };
    this.decks = [0, 1, 2].map((k) => unit(LARI_MAT.roof(k as 0 | 1 | 2), 90)) as [Pool, Pool, Pool];
    this.facades = unit(LARI_MAT.facade(), 170);
    this.towers = unit(LARI_MAT.facade(), 90, false, false);
    this.joints = unit(LARI_MAT.surface(0), 16);
    // Full models only near the camera; the light pools hold everything else in range (a long
    // roof keeps all its pieces while any part of it is in range).
    const pair = (name: string, near: number, far: number, cast: boolean): LodPair => [
      pool(lod(name), near).shadows(cast),
      pool(`${name}@1`, far).shadows(cast),
    ];
    this.parapet = pair('parapet', 80, 380, true);
    this.parapetS = pair('parapet_s', 40, 140, true);
    const variants = ['a', 'b', 'c', 'd'] as const;
    this.frontBays = variants.map((v) => pair(`facade_${v}`, 16, 24, false));
    this.farBays = variants.map((v) => pool(`facade_${v}@1`, 120).shadows(false)) as Bays;
    this.edge = pool('edge', 16).shadows(false);
    this.rims = pool('rim', 560).shadows(false);
    this.posts = [pool(lod('post'), 60).shadows(false), pool('post@1', 220).shadows(false)];
    this.spans = [pool('span', 50).shadows(false), pool('span@1', 200).shadows(false)];
    this.laundry = pool(lod('high2'), 10).shadows(true);
    const board = model(assets, 'billboard');
    this.billboard = new ModelPool(
      board.filter((p) => p.material !== 'sign'),
      12,
      materialFor,
      this.root,
    ).shadows(true);
    this.all.push(this.billboard);
    const face = board.find((p) => p.material === 'sign');
    if (face) {
      for (let i = 0; i < SIGN_SLOTS; i++) {
        const g = face.geometry.clone();
        const uv = g.getAttribute('uv') as THREE.BufferAttribute;
        const [u0, v0, u1, v1] = signUv(i);
        for (let k = 0; k < uv.count; k++)
          uv.setXY(k, u0 + (u1 - u0) * uv.getX(k), v0 + (v1 - v0) * uv.getY(k));
        const p = new Pool(g, LARI_MAT.signs(), 8);
        p.mesh.name = `sign${i}`;
        p.mesh.castShadow = false;
        this.root.add(p.mesh);
        this.signs.push(p);
        this.all.push(p);
      }
    }
  }

  private streamedAt = Number.NaN;
  private streamedRoofs = -1;
  private camD = 0;

  /** Stream buildings, blocks and towers around the camera distance `camD`. */
  update(track: Track, camD: number, camX: number, camZ: number): void {
    this.sky.position.set(camX, 0, camZ);
    this.ground.position.set(camX, -34, camZ - 200);
    // Streaming only needs to run every few metres (or when new roofs appear).
    const last = track.roofs[track.roofs.length - 1]?.id ?? -1;
    if (Math.abs(camD - this.streamedAt) < 3 && last === this.streamedRoofs) return;
    this.streamedAt = camD;
    this.streamedRoofs = last;
    this.camD = camD;
    const keep = new Set<number>();
    const ahead = this.lowDetail ? AHEAD * 0.75 : AHEAD;
    for (const roof of track.roofs) {
      if (roof.end < camD - BEHIND || roof.start > camD + ahead) continue;
      const count = Math.max(1, Math.ceil((roof.end - roof.start) / SECTION));
      const secLen = (roof.end - roof.start) / count;
      for (let k = 0; k < count; k++) {
        const s0 = roof.start + k * secLen;
        if (s0 + secLen < camD - BEHIND || s0 > camD + ahead) continue;
        const key = roof.id * 4096 + k;
        keep.add(key);
        if (!this.buildings.has(key)) this.buildings.set(key, this.buildSection(track, roof, k, count));
      }
    }
    for (const [id, placed] of this.buildings) {
      if (keep.has(id)) {
        this.refreshDetail(placed);
        continue;
      }
      for (const p of placed) if (p.handle >= 0) p.pool.remove(p.handle);
      this.buildings.delete(id);
    }
    // Neighbouring blocks
    const i0 = Math.floor((camD - BEHIND) / BLOCK_PITCH);
    const i1 = Math.ceil((camD + ahead + 120) / BLOCK_PITCH);
    const want = new Set<string>();
    for (let col = 0; col < COLUMNS.length; col++) {
      for (let i = i0; i <= i1; i++) {
        const key = `${col}:${i}`;
        want.add(key);
        if (!this.blocks.has(key)) this.blocks.set(key, this.buildBlock(blockSpec(col, i)));
      }
    }
    for (const [key, placed] of this.blocks) {
      if (want.has(key)) {
        this.refreshDetail(placed);
        continue;
      }
      for (const p of placed) if (p.handle >= 0) p.pool.remove(p.handle);
      this.blocks.delete(key);
    }
    this.updateTowers(camD);
    for (const p of this.all) p.flush();
  }

  /** Pieces with two models switch to the light one beyond `NEAR_LOD` metres ahead. */
  private refreshDetail(placed: Placed[]): void {
    if (this.lowDetail) return;
    for (const p of placed) {
      if (!p.pair || !p.matrix || p.z === undefined) continue;
      const lod = this.lodAt(p.z, p.range);
      if (lod === p.lod) continue;
      if (p.handle >= 0) p.pool.remove(p.handle);
      const next = p.pair[lod];
      p.lod = lod;
      if (!next) {
        p.handle = -1;
        continue;
      }
      p.pool = next;
      p.handle = next.add(p.matrix, p.tint);
    }
  }

  /** Full model only from a little behind the camera to `NEAR_LOD` ahead of it. */
  private lodAt(z: number, range = NEAR_LOD): 0 | 1 {
    const ahead = -z - this.camD;
    return this.lowDetail || ahead > range || ahead < -12 ? 1 : 0;
  }

  /** Place a piece that has two levels of detail. */
  private putLod(
    placed: Placed[],
    pair: LodPair,
    m: THREE.Matrix4,
    tint?: THREE.Color,
    range = NEAR_LOD,
  ): void {
    const z = m.elements[14]!;
    const lod = this.lodAt(z, range);
    const pool = pair[lod] ?? pair[0];
    const handle = pair[lod] ? pool.add(m, tint) : -1;
    if (handle < 0 && pair[lod]) return;
    const entry: Placed = { pool, handle, pair, lod, z, matrix: m.clone(), range };
    if (tint) entry.tint = tint;
    placed.push(entry);
  }

  private put(
    placed: Placed[],
    pool: ModelPool | Pool,
    m: THREE.Matrix4,
    tint?: THREE.ColorRepresentation,
  ): void {
    const handle = pool.add(m, tint);
    if (handle >= 0) placed.push({ pool: pool as ModelPool, handle });
  }

  private putDecor(
    placed: Placed[],
    kind: DecorKind,
    x: number,
    y: number,
    z: number,
    ry: number,
    far: false | 'far' | 'distant' = false,
  ): void {
    const pair = this.decor.get(kind)!;
    if (far) this.put(placed, far === 'distant' ? this.distantDecor.get(kind)! : pair[1], place(x, y, z, ry));
    else this.putLod(placed, pair, place(x, y, z, ry));
  }

  /* ---------------------------------------------------------------- one track building */

  /**
   * One section of a track building (long roofs stream in sections of at most `SECTION` m).
   * Roof-wide choices (colours, festoon, laundry, billboard, clutter) come from the roof's hash,
   * so sections join seamlessly; each section places only what falls inside it.
   */
  private buildSection(track: Track, roof: Roof, k: number, count: number): Placed[] {
    const r = (i: number) => hash01(roof.id * 91.7 + i * 13.3 + roof.look * 7);
    const roofLen = roof.end - roof.start;
    const secLen = roofLen / count;
    const zFront = -(roof.start + k * secLen);
    const zBack = zFront - secLen;
    const zc = (zFront + zBack) / 2;
    const first = k === 0;
    const last = k === count - 1;
    const roofFront = -roof.start;
    const roofBack = -roof.end;
    const kind = (Math.floor(r(1) * 3) % 3) as 0 | 1 | 2;
    const wall = this.tint.set(WALL_COLORS[Math.floor(r(2) * WALL_COLORS.length)]!).clone();
    const light = new THREE.Color(mix(wall, 0xffffff, 0.3));
    const depth = 26 + r(3) * 14;
    // A gap is published together with the roof before it, so this works before the next roof exists.
    const gapBefore = first && track.gapAt(roof.start - 0.05) !== null;
    const gapAfter = last && track.gapAt(roof.end + 0.05) !== null;
    const inside = (z: number) => z <= zFront && z > zBack;
    const placed: Placed[] = [];
    const deckTint =
      kind === 0 ? mix(0xffffff, 0xffe9d6, r(4)) : kind === 1 ? mix(0xffffff, 0xd8f0e2, r(4)) : 0xffffff;
    this.put(placed, this.decks[kind], place(0, 0, zc, 0, ROOF_HALF * 2, DECK_T, secLen), deckTint);
    // Façade below the deck; set back at the front so the top-floor windows have depth.
    const fz0 = zFront - (first ? 0.25 : 0);
    const fz1 = zBack + (last ? 0.1 : 0);
    this.put(
      placed,
      this.facades,
      place(0, -DECK_T, (fz0 + fz1) / 2, 0, ROOF_HALF * 2 - 0.2, depth, fz0 - fz1),
      wall,
    );
    // Parapets along both sides, a scupper now and then.
    const n = Math.max(1, Math.round(secLen / BAY));
    const sc = secLen / (n * BAY);
    for (const side of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        const z = zFront - (i + 0.5) * BAY * sc;
        const pair = hash01(roof.id * 7.1 + (k * 64 + i) * 3.3 + side) < 0.2 ? this.parapetS : this.parapet;
        this.putLod(
          placed,
          pair,
          place(side * (ROOF_HALF - 0.15), 0, z, side > 0 ? 0 : Math.PI, 1, 1, sc),
          light,
        );
      }
    }
    // Front edge: the hazard lip and the lit top floor of the end wall across a gap.
    if (gapBefore) {
      this.put(placed, this.edge, place(0, 0, zFront, 0), light);
      const bays = 5;
      const bw = (ROOF_HALF * 2) / bays;
      for (let i = 0; i < bays; i++) {
        const v = Math.floor(hash01(roof.id * 3.7 + i * 1.9) * 4);
        this.putLod(
          placed,
          this.frontBays[v]!,
          place(-ROOF_HALF + bw * (i + 0.5), 0, zFront - 0.15, -Math.PI / 2, 1, 1, bw / BAY),
          wall,
        );
      }
    } else if (first) {
      this.put(placed, this.joints, place(0, 0.012, zFront, 0, ROOF_HALF * 2 - 0.4, 0.02, 0.12), 0x6d6a66);
    }
    if (gapAfter) this.put(placed, this.edge, place(0, 0, zBack, Math.PI), light);
    // Festoon lights along both parapets every 7 m from the roof front: posts and sagging wires.
    if (r(5) < 0.75) {
      const step = 7;
      for (const side of [-1, 1]) {
        const x = side * (ROOF_HALF - 0.15);
        for (let z = roofFront - 1.5, j = 0; z > roofBack + 1; z -= step, j++) {
          if (!inside(z)) continue;
          this.putLod(placed, this.posts, place(x, PARAPET_H + 0.08, z, 0));
          if (j > 0) this.putLod(placed, this.spans, place(x, PARAPET_H + 0.08 + 2.47, z + step, 0));
        }
      }
    }
    // Laundry along one side
    const roofMid = (roofFront + roofBack) / 2;
    if (r(6) < 0.45 && roofLen > 18) {
      const side = r(7) < 0.5 ? -1 : 1;
      const z = roofMid + (r(8) - 0.5) * (Math.min(roofLen, 60) - 11);
      if (inside(z)) this.put(placed, this.laundry, place(side * 5.6, 0, z, Math.PI / 2));
    }
    // Billboard on a steel frame, angled towards the run
    if (r(9) < 0.4 && roofLen > 24 && this.signs.length > 0) {
      const side = r(10) < 0.5 ? -1 : 1;
      const z = roofMid + (r(11) - 0.5) * (Math.min(roofLen, 60) - 12);
      if (inside(z)) {
        const m = place(side * 6.2, 0, z, side * -0.75);
        this.put(placed, this.billboard, m);
        this.put(placed, this.signs[Math.floor(r(12) * this.signs.length)]!, m);
      }
    }
    this.clutter(placed, roofFront, roofBack, r, zFront, zBack);
    return placed;
  }

  /** Rooftop clutter along both sides of a roof, placing only what lies in [zBack, zFront]. */
  private clutter(
    placed: Placed[],
    roofFront: number,
    roofBack: number,
    r: (k: number) => number,
    zFront: number,
    zBack: number,
  ): void {
    const kinds: [DecorKind, number][] = [
      ['tankOrange', 1.3],
      ['tankBlue', 0.9],
      ['ac', 3],
      ['antenna', 1.3],
      ['dish', 1.4],
      ['plants', 2],
      ['hut', 0.8],
      ['coop', 0.5],
      ['solar', 0.9],
      ['chairs', 0.6],
      ['vents', 1.5],
      ['tree', 0.7],
      ['planter', 0.8],
    ];
    const total = kinds.reduce((s, k) => s + k[1], 0);
    let k = 20;
    for (const side of [-1, 1]) {
      let z = roofFront - 2.5 - r(k++) * 3;
      while (z > roofBack + 2.5) {
        let pick = r(k++) * total;
        let kind: DecorKind = 'ac';
        for (const [kd, w] of kinds) {
          pick -= w;
          if (pick <= 0) {
            kind = kd;
            break;
          }
        }
        const size = DECOR_SIZE[kind];
        const big = size > 0.95;
        const x = side * (big ? 5.7 : 4.0 + r(k++) * (6.6 - size - 4.0));
        const facing = kind === 'hut' || kind === 'coop' || kind === 'planter';
        const ry = facing ? (side < 0 ? Math.PI / 2 : -Math.PI / 2) : r(k++) * Math.PI * 2;
        const at = z - size;
        if (at > roofBack + 1 && at <= zFront && at > zBack)
          this.putDecor(
            placed,
            kind,
            x,
            0,
            at,
            kind === 'ac' || kind === 'solar' ? (side * Math.PI) / 2 + Math.PI : ry,
          );
        z -= size * 2 + 1.2 + r(k++) * 5;
      }
    }
  }

  /* ---------------------------------------------------------------- neighbouring blocks */

  private buildBlock(s: BlockSpec): Placed[] {
    const placed: Placed[] = [];
    const len = s.z1 - s.z0;
    const zc = (s.z0 + s.z1) / 2;
    const bottom = -62;
    const h = s.top - bottom;
    const wall = this.tint.set(s.color).clone();
    const near = s.col < 2 && !this.lowDetail;
    // The near columns get modelled top floors on the faces the run sees: inset the box there.
    const inset = near ? 0.25 : 0;
    const inner = s.x < 0 ? 1 : -1;
    this.put(
      placed,
      this.facades,
      place(s.x - (inner * inset) / 2, s.top, zc - inset / 2, 0, s.w - inset, h, len - inset),
      wall,
    );
    this.put(
      placed,
      this.decks[s.roof],
      place(s.x, s.top + 0.09, zc, 0, s.w - 0.5, 0.1, len - 0.5),
      0xffffff,
    );
    const rim = mix(s.color, 0xffffff, 0.25);
    const t = 0.14;
    this.put(placed, this.rims, place(s.x - s.w / 2 + t, s.top, zc, 0, 1, 1, len), rim);
    this.put(placed, this.rims, place(s.x + s.w / 2 - t, s.top, zc, 0, 1, 1, len), rim);
    this.put(placed, this.rims, place(s.x, s.top, s.z0 + t, Math.PI / 2, 1, 1, s.w), rim);
    this.put(placed, this.rims, place(s.x, s.top, s.z1 - t, Math.PI / 2, 1, 1, s.w), rim);
    if (near) {
      const r = (k: number) => hash01(s.seed * 5.3 + k * 2.9);
      const n = Math.max(1, Math.round(len / BAY));
      const sc = len / (n * BAY);
      const fx = s.x + (inner * s.w) / 2 - inner * 0.15;
      for (let i = 0; i < n; i++) {
        const v = Math.floor(r(i) * 4);
        this.putLod(
          placed,
          [this.farBays[v]!, null],
          place(fx, s.top, s.z1 - (i + 0.5) * BAY * sc, inner > 0 ? 0 : Math.PI, 1, 1, sc),
          wall,
          BAY_RANGE,
        );
      }
      const m = Math.max(1, Math.round(s.w / BAY));
      const sw = s.w / (m * BAY);
      for (let i = 0; i < m; i++) {
        const v = Math.floor(r(i + 40) * 4);
        this.putLod(
          placed,
          [this.farBays[v]!, null],
          place(s.x - s.w / 2 + (i + 0.5) * BAY * sw, s.top, s.z1 - 0.15, -Math.PI / 2, 1, 1, sw),
          wall,
          BAY_RANGE,
        );
      }
    }
    // Clutter on top
    const r = (k: number) => hash01(s.seed * 3.1 + k * 7.7);
    const kinds: DecorKind[] = [
      'tankOrange',
      'tankBlue',
      'ac',
      'antenna',
      'dish',
      'hut',
      'solar',
      'vents',
      'coop',
      'tree',
      'planter',
    ];
    // Far columns are seen small and through haze: fewer things on their roofs.
    const count =
      s.col < 2 ? 2 + Math.floor(r(1) * 4) : s.col < 4 ? 1 + Math.floor(r(1) * 2) : Math.floor(r(1) * 2);
    for (let i = 0; i < count; i++) {
      const kind = kinds[Math.floor(r(i + 2) * kinds.length)]!;
      const x = s.x + (r(i + 10) - 0.5) * (s.w - 3);
      const z = s.z0 + 2 + r(i + 20) * (len - 4);
      this.putDecor(placed, kind, x, s.top + 0.09, z, r(i + 30) * Math.PI * 2, s.col < 2 ? 'far' : 'distant');
    }
    return placed;
  }

  /* ---------------------------------------------------------------- far towers */

  private updateTowers(camD: number): void {
    const N = this.lowDetail ? 50 : 80;
    const pitch = 26;
    const base = Math.floor((camD - 60) / pitch);
    // Keep towers for indices base..base+N-1, recycling the ones that fell behind.
    const live = new Set<number>();
    for (let i = this.towerSlots.length - 1; i >= 0; i--) {
      const t = this.towerSlots[i]!;
      if (t.idx < base) {
        this.towers.remove(t.handle);
        this.towerSlots.splice(i, 1);
      } else live.add(t.idx);
    }
    for (let idx = base; idx < base + N; idx++) {
      if (live.has(idx)) continue;
      const r = (k: number) => hash01(idx * 41.3 + k * 9.1);
      const side = idx % 2 === 0 ? -1 : 1;
      const x = side * (95 + r(1) * 170);
      const w = 16 + r(2) * 22;
      const d = 16 + r(3) * 22;
      const top = 14 + r(4) * r(4) * 90;
      const z = -(idx * pitch);
      const palette = [0xe6e0d6, 0xd9dfe4, 0xf0e3cf, 0xc9d7df, 0xe9e2d8, 0xd6e1d2];
      const c = palette[Math.floor(r(5) * palette.length)]!;
      const handle = this.towers.add(place(x, top, z, 0, w, top + 62, d), c);
      if (handle >= 0) this.towerSlots.push({ handle, z, idx });
    }
  }
}
