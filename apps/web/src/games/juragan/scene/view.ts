/**
 * The 3D tabletop: one WebGL canvas covering the stage. A printed board with raised bevelled tiles
 * on a teak table under a warm lamp, glossy fruit pawns that hop tile by tile, ivory dice that
 * tumble onto the rolled values, buildings that pop up in the owner's colour and grow with every
 * upgrade, a flip and a paint splash when a city is taken over, owner frames and gold coins flying
 * between players and the bank. The camera frames the whole board inside the free
 * area between the HUD columns and leans gently towards the action.
 *
 * Animations run on the view clock, which the driver advances with the game clock (frozen while
 * the game is paused). Quality starts from the device's graphics level (`common/gfx.ts`, settings in
 * `quality.ts`) and steps down automatically if frames run slow. The board is mostly still, so a
 * frame is drawn only when something moves; the idle bob and pulses alone are drawn at 30 fps and a
 * paused board is not redrawn at all.
 */
import type { Fruit } from '@hoorah/protocol';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FrameGovernor, FramePacer, type GfxTier, noteSlow } from '../../common/gfx';
import { TILES } from '../board';
import type { MoveKind } from '../logic';
import {
  BANK_SPOT,
  BASE_HALF,
  buildingSpot,
  DECK_SPOT,
  DICE_SPOT,
  GAP,
  markerSpot,
  pawnSpot,
  TILE_H,
  tileRect,
} from './layout';
import {
  buildingGeometry,
  DIE,
  dieRest,
  glossy,
  liteSheen,
  makeDie,
  makeOwnerFrame,
  PAWN_H,
  PawnModel,
  setLiteMaterials,
  surfaceMaterial,
  transportGeometry,
} from './pieces';
import { drawBoardPrint } from './print';
import { nextRung, QUALITY, type Quality, rungLabel } from './quality';
import { cardBack, softShadow, woodTexture } from './textures';

export interface PawnInfo {
  id: number;
  fruit: Fruit;
  color: string;
}

export interface PawnPlace {
  id: number;
  tile: number;
  jailed: boolean;
  out: boolean;
}

/** Where coins fly from or to. */
export type Anchor = { pawn: number } | { tile: number } | 'bank';

/** Free stage area the board must fit in (stage px), between the HUD columns. */
export interface Frame {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Renderer state for performance tests (`window.__juraganStats()` in main.tsx). */
export interface ViewStats {
  tier: string;
  ratio: number;
  pixelRatio: number;
  backing: [number, number];
  calls: number;
  triangles: number;
  /** Compiled shader programs (a jump mid-game means a compile hitch). */
  programs: number;
  shadows: boolean;
  shadowMap: number;
  cap30: boolean;
  renders: number;
  steps: string[];
}

/** Camera height above the table as an angle (deg) and vertical field of view. */
const ELEVATION = 53;
const FOV = 26;
const BASE_H = 0.22;
const HOP_ARC = 0.34;
const JUMP_ARC = 2.4;
const COIN_MAX = 96;
/**
 * Building scale by level (index 1 Rumah .. 4 Hotel): the small ones are blown up so even a Rumah
 * reads from the overview camera. The side columns' band is narrower across the screen, so their
 * buildings stay within about 0.35 units wide.
 */
const LEVEL_SCALE = [1, 1.3, 1.2, 1.1, 1] as const;
const SIDE_LEVEL_SCALE = [1, 0.92, 0.8, 0.76, 0.72] as const;
const GRAVITY = 7;
/** Longest frame interval fed to the governor (it ignores longer ones as one-off hitches). */
const SLOWEST_SAMPLE_MS = 480;
/** Least time between two frames that only show the idle bob and pulses (30 fps, with slack). */
const AMBIENT_MS = 1000 / 30 - 4;
/** Contact shadows without a shadow map: tint, darkness and sizes (world units). */
const BLOB_COLOR = 0x1c1008;
const BLOB_OPACITY = 0.6;
const PAWN_BLOB = 0.56;
const DIE_BLOB = 0.62;
/** Shadows fall away from the key light (it shines from the front left). */
const BLOB_SHIFT_X = 0.03;
const BLOB_SHIFT_Z = -0.03;
/** Hemisphere fill on the light level, standing in for the room reflection it does without. */
const LITE_HEMI = 1.45;
/** Stand-in for the room reflection's sheen on the table and the board (see liteSheen). */
const TABLE_SHEEN = 0.095;
const BOARD_SHEEN = 0.065;

interface Walk {
  pts: [number, number][];
  from: [number, number];
  start: number;
  hop: number;
  kind: MoveKind;
}

interface PawnState {
  info: PawnInfo;
  model: PawnModel;
  /** Contact shadow when there is no shadow map. */
  blob: THREE.Mesh;
  blobMat: THREE.MeshBasicMaterial;
  x: number;
  z: number;
  tx: number;
  tz: number;
  yaw: number;
  walk: Walk | null;
  landedAt: number;
  outAt: number | null;
}

interface Flight {
  a: THREE.Vector3;
  b: THREE.Vector3;
  start: number;
  dur: number;
  h: number;
  spin: number;
}

interface DiceThrow {
  from: THREE.Vector3[];
  to: THREE.Vector3[];
  end: THREE.Quaternion[];
  axis: THREE.Vector3[];
  spin: number[];
  start: number;
  dur: number;
}

interface Pop {
  obj: THREE.Object3D;
  start: number;
  /** 1 grows in with a bounce, -1 shrinks away (then the object is removed). */
  dir: 1 | -1;
  dur: number;
}

interface Building {
  obj: THREE.Group;
  mesh: THREE.Mesh;
  /** Contact shadow when there is no shadow map (a child of `obj`). */
  blob: THREE.Mesh;
  level: number;
  color: string;
}

/** A taken-over building: it jumps, spins once and lands in the new owner's colour. */
interface Flip {
  b: Building;
  next: THREE.BufferGeometry;
  start: number;
  dur: number;
  swapped: boolean;
}

/** A paint drop of a takeover splash: flies on a ballistic arc, then lies flat as a splat. */
interface Drop {
  mesh: THREE.Mesh;
  from: THREE.Vector3;
  vel: THREE.Vector3;
  start: number;
  /** Flight time until it hits the board. */
  flight: number;
  size: number;
}

/** A ring of colour spreading over a tile and fading. */
interface Burst {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  start: number;
  dur: number;
  size: number;
}

/**
 * Device pixels per stage px. The main screen draws its own 1280-wide stage scaled with a CSS
 * transform and the game iframe sits inside it at stage size, so the iframe's own window does not
 * know the real size; the (same-origin) parent window does.
 */
function screenScale(w: number, h: number): number {
  let win: Window = window;
  try {
    if (window.parent !== window && window.parent.innerWidth > 0) win = window.parent;
  } catch {
    // Cross-origin parent: fall back to this window.
  }
  return Math.min(win.innerWidth / w, win.innerHeight / h) * (win.devicePixelRatio || 1);
}

const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** Scratch objects for the per-frame updates (no allocations in the frame loop). */
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _target = new THREE.Vector3();
const _dir = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Gold coins: polished metal with reflections, or a Phong gold on the light level. */
function goldMaterial(rich: boolean, roughness: number): THREE.Material {
  return rich
    ? new THREE.MeshStandardMaterial({ color: 0xf4c34a, metalness: 1, roughness })
    : new THREE.MeshPhongMaterial({
        color: 0xc9962a,
        specular: 0xffe7a0,
        shininess: 70,
        emissive: liteSheen(0.03),
      });
}

/** Sizes a building's contact shadow (a sibling of `mesh`) to the mesh's footprint. */
function fitBlob(blob: THREE.Mesh, mesh: THREE.Mesh): void {
  const g = mesh.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  const box = g.boundingBox;
  const k = mesh.scale.x;
  const w = box ? (box.max.x - box.min.x) * k : 0.4;
  const d = box ? (box.max.z - box.min.z) * k : 0.4;
  const cx = box ? ((box.max.x + box.min.x) / 2) * k : 0;
  const cz = box ? ((box.max.z + box.min.z) / 2) * k : 0;
  blob.scale.set(w + 0.26, 1, d + 0.26);
  blob.position.x = cx + BLOB_SHIFT_X * 2;
  blob.position.z = cz + BLOB_SHIFT_Z * 2;
}

/** Planar UVs from world x/z so every mesh samples its own patch of the board print. */
function planarUv(g: THREE.BufferGeometry): void {
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  const span = BASE_HALF * 2;
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = clamp01((p.getX(i) + BASE_HALF) / span);
    uv[i * 2 + 1] = clamp01(1 - (p.getZ(i) + BASE_HALF) / span);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

export class JuraganView {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.5, 80);
  private readonly key: THREE.DirectionalLight;
  private width: number;
  private height: number;
  private frameRect: Frame;
  /** Requested backing px per stage px (the screen's real density caps it). */
  private ratio: number;
  /** Width factor of the last applySize (wide stages keep the pixel count of 1280 wide). */
  private wide = 1;
  /** The level the game started at, and its settings. */
  readonly tier: GfxTier;
  private readonly q: Quality;
  private time = 0;

  private readonly pawns = new Map<number, PawnState>();
  private readonly buildings = new Map<number, Building>();
  private readonly owners = new Map<number, THREE.Group>();
  private readonly pops: Pop[] = [];
  private readonly flips: Flip[] = [];
  private readonly drops: Drop[] = [];
  private readonly bursts: Burst[] = [];
  private readonly dropGeo = new THREE.SphereGeometry(0.045, 12, 8);
  private readonly burstGeo = new THREE.RingGeometry(0.78, 1, 48);
  private readonly dice: THREE.Mesh[];
  private diceThrow: DiceThrow | null = null;
  private readonly coinMesh: THREE.InstancedMesh;
  private readonly flights: Flight[] = [];
  private readonly topCard: THREE.Mesh;
  private cardAt = -10;
  private lastLanding = -10;
  private readonly ring: THREE.Mesh;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private active: number | null = null;
  private readonly glow: THREE.Mesh;
  private readonly glowMat: THREE.MeshBasicMaterial;
  private glowTile: number | null = null;

  /** Base camera (fits the board) and the eased focus offset. */
  private baseDist = 18;
  private readonly baseTarget = new THREE.Vector3();
  private readonly focusGoal = new THREE.Vector3();
  private readonly focusNow = new THREE.Vector3();
  private zoomGoal = 1;
  /** Starts wide and turned, settling during the intro: a short fly-in over the table. */
  private zoomNow = 1.45;
  private yawNow = -0.42;
  /** Poster tuning: [x, y, z, tx, ty, tz, fov] replaces the framing camera. */
  posterCam: number[] | null = null;

  /** Due frames seen (the active pawn's bob refreshes the shadow map every 4th). */
  private frames = 0;
  private renders = 0;
  /** Something changed outside the frame loop (a call from the driver, a resize): draw. */
  private dirty = true;
  /** Something that casts a shadow moved since the shadow map was last drawn. */
  private shadowDirty = true;
  private lastDraw = -Infinity;

  /** Frame pacing and the quality ladder (see `govern`). */
  private readonly pacer = new FramePacer();
  private readonly gov = new FrameGovernor();
  /** Governor clock: only intervals between back-to-back motion frames advance it. */
  private govClock = 0;
  private govLast = 0;
  private govArmed = false;
  /** performance.now() until which no frame is judged (loading, intro, after a change). */
  private holdUntil = 0;
  /** Steps taken by the governor, for the stats. */
  private readonly steps: string[] = [];

  /** Contact shadows used when the shadow map is off (shared material + per-piece fading ones). */
  private readonly blobGeo: THREE.PlaneGeometry;
  private readonly blobMat: THREE.MeshBasicMaterial;
  private readonly rectBlobMat: THREE.MeshBasicMaterial;
  private readonly blobMats: THREE.MeshBasicMaterial[] = [];
  private readonly diceBlobs: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }[];

  constructor(
    host: HTMLElement,
    width: number,
    height: number,
    frame: Frame,
    opts: { preserve?: boolean; tier?: GfxTier } = {},
  ) {
    this.width = width;
    this.height = height;
    this.frameRect = frame;
    this.tier = opts.tier ?? 'high';
    const q = QUALITY[this.tier];
    this.q = q;
    setLiteMaterials(!q.rich);
    this.renderer = new THREE.WebGLRenderer({
      antialias: q.antialias,
      powerPreference: 'high-performance',
      stencil: false,
      preserveDrawingBuffer: opts.preserve ?? false,
    });
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = q.shadowMap > 0;
    r.shadowMap.type = THREE.PCFShadowMap;
    // Shadows are redrawn only while something moves (see draw()).
    r.shadowMap.autoUpdate = false;
    this.canvas = r.domElement;
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    host.appendChild(this.canvas);
    this.ratio = q.maxRatio;
    this.applySize();

    this.scene.background = new THREE.Color(0x120b07);
    if (q.rich) {
      const pmrem = new THREE.PMREMGenerator(r);
      this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      this.scene.environmentIntensity = 0.42;
      pmrem.dispose();
    }

    // Without the room reflection the light pieces need more ambient fill to keep their brightness.
    const hemi = new THREE.HemisphereLight(0xfff1dc, 0x3a2416, q.rich ? 0.75 : LITE_HEMI);
    this.key = new THREE.DirectionalLight(0xffe2bd, 2.7);
    this.key.position.set(-5.5, 12, 6.5);
    this.key.castShadow = q.shadowMap > 0;
    const size = Math.max(512, q.shadowMap);
    this.key.shadow.mapSize.set(size, size);
    const sc = this.key.shadow.camera;
    sc.left = -6.6;
    sc.right = 6.6;
    sc.top = 6.6;
    sc.bottom = -6.6;
    sc.near = 2;
    sc.far = 32;
    this.key.shadow.bias = -0.0005;
    this.key.shadow.normalBias = 0.02;
    this.key.shadow.radius = q.shadowRadius;
    const fill = new THREE.DirectionalLight(0xcfe4ff, 0.45);
    fill.position.set(7, 6, -4);
    const rim = new THREE.DirectionalLight(0xffc890, 0.7);
    rim.position.set(1, 5, -10);
    this.scene.add(hemi, this.key, this.key.target, fill, rim);

    this.blobGeo = new THREE.PlaneGeometry(1, 1);
    this.blobGeo.rotateX(-Math.PI / 2);
    this.blobMat = this.makeBlobMat(softShadow(64, 0.2, 2));
    this.rectBlobMat = this.makeBlobMat(softShadow(64, 0.55, 6));

    this.buildTable();
    this.buildBoard();
    this.buildBank();
    this.topCard = this.buildDeck();

    this.dice = [makeDie(), makeDie()];
    this.dice.forEach((d, k) => {
      d.position.set(DICE_SPOT[0] + (k ? 0.36 : -0.36), DIE / 2, DICE_SPOT[1] + (k ? 0.08 : -0.06));
      d.quaternion.copy(dieRest(k ? 5 : 3, k ? 0.5 : -0.3));
      this.scene.add(d);
    });
    this.diceBlobs = this.dice.map(() => {
      const mat = this.makeBlobMat(this.blobMat.map);
      const mesh = this.blob(DIE_BLOB, DIE_BLOB, mat);
      this.scene.add(mesh);
      return { mesh, mat };
    });
    this.updateDiceBlobs();

    const coinGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.022, 28);
    const coinMat = goldMaterial(q.rich, 0.28);
    this.coinMesh = new THREE.InstancedMesh(coinGeo, coinMat, COIN_MAX);
    this.coinMesh.count = 0;
    this.coinMesh.frustumCulled = false;
    this.scene.add(this.coinMesh);

    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.25, 48), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.ring.renderOrder = 2;
    this.scene.add(this.ring);

    this.glowMat = new THREE.MeshBasicMaterial({
      color: 0xffc928,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    this.glow = new THREE.Mesh(new THREE.BufferGeometry(), this.glowMat);
    this.glow.visible = false;
    this.glow.renderOrder = 2;
    this.scene.add(this.glow);

    this.reframe();
  }

  /* ---------------------------------------------------------------- size + camera */

  get pixelRatio(): number {
    return this.ratio;
  }

  private applySize(): void {
    // Render at the screen's real pixel density. A stage wider than 1280 keeps the pixel count of
    // the 1280-wide stage at the same height, so 21:9 costs no extra fill rate.
    const wide = Math.sqrt(1280 / Math.max(1280, this.width));
    this.wide = wide;
    // 0.6 is the old floor for tiny windows; the light level may go lower.
    const floor = Math.min(0.6, this.q.minRatio);
    const k = Math.max(floor, Math.min(this.ratio * wide, screenScale(this.width, this.height)));
    this.renderer.setPixelRatio(k);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }

  setSize(w: number, h: number, frame: Frame): void {
    this.width = w;
    this.height = h;
    this.frameRect = frame;
    this.applySize();
    this.reframe();
    this.dirty = true;
    this.holdGovernor(1000);
  }

  /** Camera direction from the target (unit vector). */
  private dir(out = new THREE.Vector3()): THREE.Vector3 {
    const e = (ELEVATION * Math.PI) / 180;
    return out.set(0, Math.sin(e), Math.cos(e));
  }

  /**
   * Find the distance and look-at point that fit the board (with standing pawns) into the free
   * frame of the stage, centred in it.
   */
  private reframe(): void {
    const cam = this.camera;
    cam.fov = FOV;
    cam.aspect = this.width / this.height;
    cam.updateProjectionMatrix();
    const f = this.frameRect;
    const toNdcX = (px: number) => (px / this.width) * 2 - 1;
    const toNdcY = (py: number) => 1 - (py / this.height) * 2;
    const rect = {
      x0: toNdcX(f.left),
      x1: toNdcX(this.width - f.right),
      y0: toNdcY(this.height - f.bottom),
      y1: toNdcY(f.top),
    };
    const H = BASE_HALF;
    const pts: THREE.Vector3[] = [];
    for (const x of [-H, H])
      for (const z of [-H, H]) {
        pts.push(new THREE.Vector3(x, -BASE_H, z), new THREE.Vector3(x, PAWN_H * 0.6, z));
      }
    const dir = this.dir();
    const target = new THREE.Vector3(0, 0, 0);
    let dist = 18;
    const v = new THREE.Vector3();
    for (let it = 0; it < 40; it++) {
      cam.position.copy(target).addScaledVector(dir, dist);
      cam.lookAt(target);
      cam.updateMatrixWorld(true);
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const p of pts) {
        v.copy(p).project(cam);
        x0 = Math.min(x0, v.x);
        x1 = Math.max(x1, v.x);
        y0 = Math.min(y0, v.y);
        y1 = Math.max(y1, v.y);
      }
      const s = Math.max((x1 - x0) / (rect.x1 - rect.x0), (y1 - y0) / (rect.y1 - rect.y0));
      const cy = (y0 + y1) / 2 - (rect.y0 + rect.y1) / 2;
      const cx = (x0 + x1) / 2 - (rect.x0 + rect.x1) / 2;
      dist *= 1 + (s - 1) * 0.8;
      // Shift the look-at point so the board sits in the middle of the frame.
      const unitsPerNdc = Math.tan((FOV * Math.PI) / 360) * dist;
      target.z -= cy * unitsPerNdc * 0.8 * 1.15;
      target.x += cx * unitsPerNdc * cam.aspect * 0.8;
    }
    this.baseDist = dist;
    this.baseTarget.copy(target);
  }

  /** Lean the camera towards a point of interest (null = the whole board). */
  focusOn(p: { x: number; z: number } | null, zoom = 0.97): void {
    this.dirty = true;
    if (!p) {
      this.focusGoal.set(0, 0, 0);
      this.zoomGoal = 1;
      return;
    }
    this.focusGoal.set(p.x * 0.07, 0, p.z * 0.05);
    this.zoomGoal = zoom;
  }

  focusPawn(id: number | null): void {
    const s = id === null ? undefined : this.pawns.get(id);
    this.focusOn(s ? { x: s.tx, z: s.tz } : null);
  }

  private updateCamera(dt: number): void {
    const cam = this.camera;
    if (this.posterCam) {
      const [x, y, z, tx, ty, tz, fov] = this.posterCam;
      cam.fov = fov ?? FOV;
      cam.updateProjectionMatrix();
      cam.position.set(x ?? 0, y ?? 10, z ?? 10);
      cam.lookAt(tx ?? 0, ty ?? 0, tz ?? 0);
      return;
    }
    const k = 1 - Math.exp(-dt * 1.6);
    this.focusNow.lerp(this.focusGoal, k);
    this.zoomNow += (this.zoomGoal - this.zoomNow) * k;
    this.yawNow += (0 - this.yawNow) * (1 - Math.exp(-dt * 1.3));
    const sway = Math.sin(this.time * 0.21) * 0.003;
    const target = _target.copy(this.baseTarget).add(this.focusNow);
    const dir = this.dir(_dir);
    dir.applyAxisAngle(UP, sway + this.yawNow);
    cam.position.copy(target).addScaledVector(dir, this.baseDist * this.zoomNow);
    cam.lookAt(target);
  }

  /* ---------------------------------------------------------------- the table and the board */

  private buildTable(): void {
    const seg = this.q.tableSegments;
    const geo = new THREE.PlaneGeometry(64, 64, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const p = geo.getAttribute('position') as THREE.BufferAttribute;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const r = Math.hypot(p.getX(i), p.getZ(i) * 1.15);
      const f = 0.3 + 0.7 * (1 - clamp01((r - 5.5) / 11)) ** 1.6;
      col[i * 3] = f;
      col[i * 3 + 1] = f * 0.96;
      col[i * 3 + 2] = f * 0.92;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const wood = woodTexture(this.q.wood);
    wood.repeat.set(64 / 5, 64 / 5);
    wood.anisotropy = this.anisotropy();
    // Big surfaces stay on the standard model (no clearcoat): they cover most of the pixels.
    const mat = this.q.rich
      ? new THREE.MeshStandardMaterial({ map: wood, vertexColors: true, roughness: 0.5 })
      : new THREE.MeshLambertMaterial({ map: wood, vertexColors: true, emissive: liteSheen(TABLE_SHEEN) });
    const table = new THREE.Mesh(geo, mat);
    table.position.y = -BASE_H;
    // Below the full level it is drawn after the board and the pieces, so the depth test skips
    // shading it under them (the full level keeps its exact draw order and edges).
    if (this.tier !== 'high') table.renderOrder = 1;
    table.receiveShadow = true;
    this.scene.add(table);
    // The board's contact shadow on the table, without a shadow map.
    const s = BASE_HALF * 2 + 0.75;
    const blob = this.blob(s, s, this.makeBlobMat(softShadow(128, 0.86, 10)));
    blob.position.set(BLOB_SHIFT_X * 4, -BASE_H + 0.003, BLOB_SHIFT_Z * 4);
    this.scene.add(blob);
  }

  private anisotropy(): number {
    return Math.min(this.q.anisotropy, this.renderer.capabilities.getMaxAnisotropy());
  }

  /** A transparent contact-shadow material (hidden while the shadow map draws real shadows). */
  private makeBlobMat(map: THREE.Texture | null): THREE.MeshBasicMaterial {
    const m = new THREE.MeshBasicMaterial({
      map,
      color: BLOB_COLOR,
      transparent: true,
      opacity: BLOB_OPACITY,
      depthWrite: false,
    });
    m.visible = !this.key.castShadow;
    this.blobMats.push(m);
    return m;
  }

  /** A flat contact shadow `w` x `d` lying on the surface (place it slightly above). */
  private blob(w: number, d: number, mat: THREE.MeshBasicMaterial): THREE.Mesh {
    const m = new THREE.Mesh(this.blobGeo, mat);
    m.scale.set(w, 1, d);
    m.renderOrder = 1;
    return m;
  }

  private buildBoard(): void {
    const max = this.renderer.capabilities.maxTextureSize;
    const size = this.q.boardPrint > 2048 && max < 4096 ? 2048 : this.q.boardPrint;
    const tex = new THREE.CanvasTexture(drawBoardPrint(size));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.anisotropy();
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;

    const base = new RoundedBoxGeometry(BASE_HALF * 2, BASE_H, BASE_HALF * 2, 3, 0.07);
    base.translate(0, -BASE_H / 2, 0);
    planarUv(base);
    const baseMesh = new THREE.Mesh(base, this.printMaterial(tex, 0.5));
    baseMesh.receiveShadow = true;
    baseMesh.castShadow = true;
    // After the tiles (same reason as the table).
    if (this.tier !== 'high') baseMesh.renderOrder = 1;
    this.scene.add(baseMesh);

    const parts: THREE.BufferGeometry[] = [];
    const sink = 0.02;
    for (let i = 0; i < TILES.length; i++) {
      const r = tileRect(i);
      const g = new RoundedBoxGeometry(r.w - GAP, TILE_H + sink, r.d - GAP, this.q.rich ? 2 : 1, 0.022);
      g.translate(r.cx, (TILE_H - sink) / 2, r.cz);
      planarUv(g);
      g.deleteAttribute('uv1');
      parts.push(g.index ? g.toNonIndexed() : g);
    }
    const merged = mergeGeometries(parts);
    for (const g of parts) g.dispose();
    const tiles = new THREE.Mesh(merged, this.printMaterial(tex, 0.4));
    tiles.receiveShadow = true;
    tiles.castShadow = true;
    this.scene.add(tiles);
  }

  private printMaterial(map: THREE.Texture, roughness: number): THREE.Material {
    return this.q.rich
      ? new THREE.MeshStandardMaterial({ map, roughness })
      : new THREE.MeshLambertMaterial({ map, emissive: liteSheen(BOARD_SHEEN) });
  }

  /** The bank: three neat stacks of gold coins on its printed spot. */
  private buildBank(): void {
    const geo = new THREE.CylinderGeometry(0.11, 0.11, 0.026, 28);
    const mat = goldMaterial(this.q.rich, 0.3);
    const stacks: [number, number, number][] = [
      [-0.18, 0.08, 7],
      [0.17, 0.1, 5],
      [0.0, -0.17, 9],
      [0.24, -0.2, 3],
    ];
    const count = stacks.reduce((s, x) => s + x[2], 0);
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    let k = 0;
    for (const [dx, dz, n] of stacks)
      for (let j = 0; j < n; j++) {
        const jitter = ((j * 37) % 7) / 100 - 0.03;
        q.setFromEuler(new THREE.Euler(0, j * 0.7, 0));
        m.compose(
          new THREE.Vector3(
            BANK_SPOT[0] + dx + jitter * 0.4,
            0.013 + j * 0.027,
            BANK_SPOT[1] + dz - jitter * 0.3,
          ),
          q,
          new THREE.Vector3(1, 1, 1),
        );
        mesh.setMatrixAt(k++, m);
      }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    const blob = this.blob(0.95, 0.9, this.blobMat);
    blob.position.set(BANK_SPOT[0] + 0.03 + BLOB_SHIFT_X, 0.003, BANK_SPOT[1] - 0.04 + BLOB_SHIFT_Z);
    this.scene.add(blob);
  }

  /** The Kabar deck on its spot; returns the top card used for the draw animation. */
  private buildDeck(): THREE.Mesh {
    const back = cardBack();
    const rich = this.q.rich;
    const edge = rich
      ? new THREE.MeshStandardMaterial({ color: 0xf6efe2, roughness: 0.7 })
      : new THREE.MeshLambertMaterial({ color: 0xf6efe2, emissive: liteSheen(BOARD_SHEEN) });
    const face = rich
      ? new THREE.MeshPhysicalMaterial({ map: back, roughness: 0.4, clearcoat: 0.4 })
      : new THREE.MeshPhongMaterial({
          map: back,
          specular: 0x262626,
          shininess: 40,
          emissive: liteSheen(BOARD_SHEEN),
        });
    const w = 0.9;
    const d = 1.2;
    const stack = new THREE.Mesh(new RoundedBoxGeometry(w, 0.12, d, 2, 0.02), [
      edge,
      edge,
      face,
      edge,
      edge,
      edge,
    ]);
    stack.position.set(DECK_SPOT[0], 0.06, DECK_SPOT[1]);
    stack.rotation.y = 0.06;
    stack.castShadow = true;
    stack.receiveShadow = true;
    this.scene.add(stack);
    const blob = this.blob(w + 0.32, d + 0.32, this.rectBlobMat);
    blob.position.set(DECK_SPOT[0] + BLOB_SHIFT_X * 2, 0.003, DECK_SPOT[1] + BLOB_SHIFT_Z * 2);
    blob.rotation.y = 0.06;
    this.scene.add(blob);
    const card = new THREE.Mesh(new RoundedBoxGeometry(w, 0.012, d, 2, 0.005), [
      edge,
      edge,
      face,
      face,
      edge,
      edge,
    ]);
    card.position.set(DECK_SPOT[0], 0.127, DECK_SPOT[1]);
    card.rotation.y = 0.06;
    card.castShadow = true;
    this.scene.add(card);
    return card;
  }

  /* ---------------------------------------------------------------- pawns */

  setPawns(list: readonly PawnInfo[]): void {
    for (const s of this.pawns.values()) {
      this.scene.remove(s.model.root, s.blob);
      s.blobMat.dispose();
      const i = this.blobMats.indexOf(s.blobMat);
      if (i >= 0) this.blobMats.splice(i, 1);
    }
    this.pawns.clear();
    this.dirty = true;
    for (const info of list) {
      const model = new PawnModel(info.fruit, info.color);
      this.scene.add(model.root);
      const blobMat = this.makeBlobMat(this.blobMat.map);
      const blob = this.blob(PAWN_BLOB, PAWN_BLOB, blobMat);
      this.scene.add(blob);
      this.pawns.set(info.id, {
        info,
        model,
        blob,
        blobMat,
        x: 0,
        z: 0,
        tx: 0,
        tz: 0,
        yaw: 0,
        walk: null,
        landedAt: -10,
        outAt: null,
      });
    }
  }

  /** Where every pawn should stand; idle pawns slide there, `snap` places them at once. */
  place(list: readonly PawnPlace[], snap = false): void {
    this.dirty = true;
    const groups = new Map<string, PawnPlace[]>();
    for (const p of list) {
      if (p.out) continue;
      const key = `${p.tile}|${p.jailed ? 1 : 0}`;
      const g = groups.get(key) ?? [];
      g.push(p);
      groups.set(key, g);
    }
    for (const p of list) {
      const s = this.pawns.get(p.id);
      if (!s) continue;
      if (p.out) {
        if (s.outAt === null) s.outAt = this.time;
        continue;
      }
      const g = groups.get(`${p.tile}|${p.jailed ? 1 : 0}`)!;
      const [x, z] = pawnSpot(p.tile, g.indexOf(p), g.length, p.jailed);
      s.tx = x;
      s.tz = z;
      if (snap) {
        s.x = x;
        s.z = z;
      }
    }
  }

  /** Hop along `path` (tile indices); the last hop lands on the pawn's placed spot. */
  walk(id: number, path: readonly number[], kind: MoveKind, hopSec: number, jumpSec: number): void {
    const s = this.pawns.get(id);
    if (!s || !path.length) return;
    const pts = path.map((t) => pawnSpot(t, 0, 1));
    this.dirty = true;
    s.walk = {
      pts,
      from: [s.x, s.z],
      start: this.time,
      hop: kind === 'jump' ? jumpSec : hopSec,
      kind,
    };
  }

  setActive(id: number | null): void {
    this.active = id;
    this.dirty = true;
    const s = id === null ? undefined : this.pawns.get(id);
    this.ring.visible = !!s;
    if (s) this.ringMat.color.set(s.info.color);
  }

  /** Pulsing outline on a tile (the one on offer), or none. */
  highlight(tile: number | null, color = '#FFC928'): void {
    this.glowTile = tile;
    this.dirty = true;
    this.glow.visible = tile !== null;
    if (tile === null) return;
    const r = tileRect(tile);
    this.glow.geometry.dispose();
    const g = makeOwnerFrame(r.w - GAP + 0.1, r.d - GAP + 0.1, color, 0.09).geometry;
    this.glow.geometry = g;
    this.glow.position.set(r.cx, TILE_H + 0.006, r.cz);
    this.glowMat.color.set(color);
  }

  pawnPoint(id: number): THREE.Vector3 | null {
    const s = this.pawns.get(id);
    return s ? new THREE.Vector3(s.x, TILE_H + PAWN_H * 0.6, s.z) : null;
  }

  /* ---------------------------------------------------------------- ownership + buildings */

  /** The thin frame around an owned tile in the owner's colour (the building is the main sign). */
  setOwner(tile: number, color: string | null, animate = true): void {
    this.dirty = true;
    const old = this.owners.get(tile);
    if (old) {
      this.owners.delete(tile);
      if (animate) this.pops.push({ obj: old, start: this.time, dir: -1, dur: 0.35 });
      else this.scene.remove(old);
    }
    if (!color) return;
    const r = tileRect(tile);
    const group = new THREE.Group();
    group.add(makeOwnerFrame(r.w - GAP - 0.02, r.d - GAP - 0.02, color));
    group.position.set(r.cx, TILE_H + 0.002, r.cz);
    this.scene.add(group);
    this.owners.set(tile, group);
    if (animate) {
      group.scale.setScalar(0.001);
      this.pops.push({ obj: group, start: this.time + 0.1, dir: 1, dur: 0.5 });
    }
  }

  private buildingGeo(tile: number, level: number, color: string): THREE.BufferGeometry {
    const t = TILES[tile]!;
    return t.kind === 'transport' ? transportGeometry(t.key, color) : buildingGeometry(level, color);
  }

  /**
   * The building on a city (level 1 Rumah .. 4 Hotel) or the marker on a transport tile (any level
   * above 0), in the owner's colour; 0 removes it. A new level shrinks the old model away and
   * springs the new one up with a ring of colour.
   */
  setBuilding(tile: number, level: number, color: string, animate = true): void {
    const old = this.buildings.get(tile);
    if (old && old.level === level && old.color === color) return;
    this.dirty = true;
    if (old) {
      this.buildings.delete(tile);
      if (animate) this.pops.push({ obj: old.obj, start: this.time, dir: -1, dur: 0.25 });
      else this.scene.remove(old.obj);
    }
    if (level <= 0) return;
    const transport = TILES[tile]!.kind === 'transport';
    const mesh = new THREE.Mesh(this.buildingGeo(tile, level, color), surfaceMaterial());
    const [x, z] = transport ? markerSpot(tile) : buildingSpot(tile);
    // Every building faces the camera; on the side columns the band is narrow, so they are smaller.
    if (!transport) {
      const k = Math.max(1, Math.min(4, level));
      const side = tileRect(tile).side % 2 === 1;
      mesh.scale.setScalar((side ? SIDE_LEVEL_SCALE[k] : LEVEL_SCALE[k]) ?? 1);
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const obj = new THREE.Group();
    const blob = this.buildingBlob(mesh);
    obj.add(mesh, blob);
    obj.position.set(x, TILE_H, z);
    this.scene.add(obj);
    this.buildings.set(tile, { obj, mesh, blob, level, color });
    if (animate) {
      obj.scale.setScalar(0.001);
      const delay = old ? 0.18 : 0;
      this.pops.push({ obj, start: this.time + delay, dir: 1, dur: 0.6 });
      // A ring of colour for a purchase or an upgrade, not for an upgrade sold back to the bank.
      if (!old || level > old.level) this.burst(x, z, color, 0.55, delay);
    }
  }

  /** A contact shadow under a building's footprint, a little wider than its base. */
  private buildingBlob(mesh: THREE.Mesh): THREE.Mesh {
    const blob = this.blob(1, 1, this.rectBlobMat);
    blob.position.y = 0.003;
    fitBlob(blob, mesh);
    return blob;
  }

  /**
   * A city changes hands: its building jumps, spins once and lands in the new owner's colour while
   * paint splashes over the tile. Without a building on the board yet it simply appears.
   */
  takeover(tile: number, level: number, color: string): void {
    this.dirty = true;
    const b = this.buildings.get(tile);
    if (!b) {
      this.setBuilding(tile, level, color);
      return;
    }
    // A flip still running on this building lands at once.
    for (let k = this.flips.length - 1; k >= 0; k--) {
      const f = this.flips[k]!;
      if (f.b !== b) continue;
      f.b.mesh.geometry = f.next;
      fitBlob(f.b.blob, f.b.mesh);
      this.endFlip(f);
      this.flips.splice(k, 1);
    }
    b.level = level;
    b.color = color;
    this.flips.push({
      b,
      next: this.buildingGeo(tile, level, color),
      start: this.time,
      dur: 0.95,
      swapped: false,
    });
    const top = level >= 4 ? 0.8 : level === 3 ? 0.55 : 0.35;
    this.splash(b.obj.position.x, b.obj.position.z, top, color);
    this.burst(b.obj.position.x, b.obj.position.z, color, 0.8, 0.5);
  }

  private burst(x: number, z: number, color: string, size: number, delay = 0): void {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.burstGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, TILE_H + 0.01, z);
    mesh.renderOrder = 3;
    mesh.scale.setScalar(0.001);
    this.scene.add(mesh);
    this.bursts.push({ mesh, mat, start: this.time + delay, dur: 0.75, size });
  }

  private splash(x: number, z: number, top: number, color: string): void {
    const mat = glossy(color);
    const n = this.q.splashDrops;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + Math.random() * 0.35;
      const speed = 0.55 + Math.random() * 0.75;
      const from = new THREE.Vector3(x, TILE_H + top, z);
      const vel = new THREE.Vector3(Math.cos(a) * speed, 1.1 + Math.random() * 1.1, Math.sin(a) * speed);
      // Time until y = TILE_H on the arc y(t) = y0 + vy t - g t^2 / 2.
      const flight = (vel.y + Math.sqrt(vel.y * vel.y + 2 * GRAVITY * top)) / GRAVITY;
      const mesh = new THREE.Mesh(this.dropGeo, mat);
      mesh.visible = false;
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.drops.push({ mesh, from, vel, start: this.time + 0.42, flight, size: 0.7 + Math.random() * 0.7 });
    }
  }

  private endFlip(f: Flip): void {
    f.b.mesh.rotation.y = 0;
    f.b.obj.position.y = TILE_H;
    f.b.obj.scale.setScalar(1);
    f.b.blob.position.y = 0.003;
  }

  private updateFlips(): void {
    for (let k = this.flips.length - 1; k >= 0; k--) {
      const f = this.flips[k]!;
      const t = clamp01((this.time - f.start) / f.dur);
      const e = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
      f.b.mesh.rotation.y = e * Math.PI * 2;
      const lift = Math.sin(Math.PI * Math.min(1, t / 0.85)) * 0.34;
      f.b.obj.position.y = TILE_H + lift;
      // The contact shadow stays on the tile while the building jumps.
      f.b.blob.position.y = 0.003 - lift;
      const squash = t > 0.82 ? Math.sin(((t - 0.82) / 0.18) * Math.PI) * 0.14 : 0;
      f.b.obj.scale.set(1 + squash, 1 - squash, 1 + squash);
      if (!f.swapped && t >= 0.5) {
        f.b.mesh.geometry = f.next;
        fitBlob(f.b.blob, f.b.mesh);
        f.swapped = true;
      }
      if (t >= 1) {
        this.endFlip(f);
        this.flips.splice(k, 1);
      }
    }
  }

  private updateDrops(): void {
    for (let k = this.drops.length - 1; k >= 0; k--) {
      const d = this.drops[k]!;
      const age = this.time - d.start;
      if (age < 0) continue;
      const m = d.mesh;
      m.visible = true;
      if (age < d.flight) {
        m.position.set(
          d.from.x + d.vel.x * age,
          d.from.y + d.vel.y * age - (GRAVITY * age * age) / 2,
          d.from.z + d.vel.z * age,
        );
        m.scale.setScalar(d.size);
        continue;
      }
      // Landed: a flat splat that lingers, then shrinks away.
      const after = age - d.flight;
      const spread = easeOut(clamp01(after / 0.12));
      const fade = 1 - easeOut(clamp01((after - 1.1) / 0.45));
      m.position.y = TILE_H + 0.004;
      m.scale.set(d.size * (1 + spread) * fade, d.size * 0.16 * fade + 0.001, d.size * (1 + spread) * fade);
      if (after >= 1.55) {
        this.scene.remove(m);
        this.drops.splice(k, 1);
      }
    }
  }

  private updateBursts(): void {
    for (let k = this.bursts.length - 1; k >= 0; k--) {
      const b = this.bursts[k]!;
      const t = (this.time - b.start) / b.dur;
      if (t < 0) continue;
      const c = clamp01(t);
      b.mesh.scale.setScalar(b.size * (0.25 + 0.95 * easeOut(c)));
      b.mat.opacity = 0.85 * (1 - c);
      if (c >= 1) {
        this.scene.remove(b.mesh);
        b.mat.dispose();
        this.bursts.splice(k, 1);
      }
    }
  }

  /* ---------------------------------------------------------------- dice */

  /** Throw both dice from above `from` onto the dice spot, landing on `values` after `sec`. */
  rollDice(values: readonly [number, number], from: THREE.Vector3 | null, sec: number): void {
    const start = from ?? new THREE.Vector3(0, 0, 3.6);
    const rnd = Math.random;
    const yaw = rnd() * Math.PI * 2;
    const to = [
      new THREE.Vector3(
        DICE_SPOT[0] - 0.32 + (rnd() - 0.5) * 0.25,
        DIE / 2,
        DICE_SPOT[1] + (rnd() - 0.5) * 0.3,
      ),
      new THREE.Vector3(
        DICE_SPOT[0] + 0.34 + (rnd() - 0.5) * 0.25,
        DIE / 2,
        DICE_SPOT[1] + (rnd() - 0.5) * 0.3,
      ),
    ];
    this.diceThrow = {
      from: [
        new THREE.Vector3(start.x - 0.18, 1.4, start.z),
        new THREE.Vector3(start.x + 0.18, 1.55, start.z + 0.1),
      ],
      to,
      end: [dieRest(values[0], yaw + rnd() * 0.6), dieRest(values[1], yaw - rnd() * 0.6)],
      axis: [
        new THREE.Vector3(rnd() - 0.5, rnd() * 0.3, rnd() - 0.5).normalize(),
        new THREE.Vector3(rnd() - 0.5, rnd() * 0.3, rnd() - 0.5).normalize(),
      ],
      spin: [Math.PI * (5 + rnd() * 2), Math.PI * (5 + rnd() * 2)],
      start: this.time,
      dur: sec,
    };
    this.dirty = true;
  }

  private updateDice(): void {
    const d = this.diceThrow;
    if (!d) return;
    const u = clamp01((this.time - d.start) / d.dur);
    for (let k = 0; k < 2; k++) {
      const die = this.dice[k]!;
      const lag = k * 0.05;
      const t = clamp01((u - lag) / (1 - lag));
      const h = easeOut(t);
      die.position.lerpVectors(d.from[k]!, d.to[k]!, h);
      // A big arc, then two shrinking bounces, then a short roll.
      let y = 0;
      if (t < 0.5) {
        const s = t / 0.5;
        y = d.from[k]!.y * (1 - s) + 0.9 * 4 * s * (1 - s);
      } else if (t < 0.74) {
        const s = (t - 0.5) / 0.24;
        y = 0.32 * 4 * s * (1 - s);
      } else if (t < 0.88) {
        const s = (t - 0.74) / 0.14;
        y = 0.09 * 4 * s * (1 - s);
      }
      die.position.y = DIE / 2 + y;
      const rest = (1 - t) ** 2;
      die.quaternion.setFromAxisAngle(d.axis[k]!, d.spin[k]! * rest).multiply(d.end[k]!);
    }
    this.updateDiceBlobs();
    if (u >= 1) this.diceThrow = null;
  }

  /** Dice shadows grow and fade with the height of the die. */
  private updateDiceBlobs(): void {
    for (let k = 0; k < 2; k++) {
      const die = this.dice[k]!;
      const b = this.diceBlobs[k]!;
      const h = Math.max(0, die.position.y - DIE / 2);
      b.mesh.position.set(die.position.x + BLOB_SHIFT_X, 0.003, die.position.z + BLOB_SHIFT_Z);
      b.mesh.scale.set(DIE_BLOB * (1 + h * 0.5), 1, DIE_BLOB * (1 + h * 0.5));
      b.mat.opacity = BLOB_OPACITY / (1 + h * 1.6);
    }
  }

  /* ---------------------------------------------------------------- coins */

  private anchorPoint(a: Anchor): THREE.Vector3 {
    if (a === 'bank') return new THREE.Vector3(BANK_SPOT[0], 0.3, BANK_SPOT[1]);
    if ('pawn' in a) return this.pawnPoint(a.pawn) ?? new THREE.Vector3(0, 0.3, 0);
    const r = tileRect(a.tile);
    return new THREE.Vector3(r.cx, TILE_H + 0.2, r.cz);
  }

  /** Coins fly from one anchor to the other; more coins for bigger sums. */
  coins(from: Anchor, to: Anchor, amount: number, delaySec = 0): number {
    const a = this.anchorPoint(from);
    const b = this.anchorPoint(to);
    const n = Math.max(3, Math.min(this.q.coinsMax, Math.round(Math.sqrt(amount) / 1.6)));
    this.dirty = true;
    const dist = a.distanceTo(b);
    const dur = 0.55 + dist * 0.05;
    for (let k = 0; k < n && this.flights.length < COIN_MAX; k++) {
      const jitter = new THREE.Vector3((Math.random() - 0.5) * 0.25, 0, (Math.random() - 0.5) * 0.25);
      this.flights.push({
        a: a.clone().add(jitter),
        b: b.clone().add(jitter.multiplyScalar(0.4)),
        start: this.time + delaySec + k * 0.055,
        dur,
        h: 0.8 + dist * 0.12,
        spin: 8 + Math.random() * 8,
      });
    }
    return delaySec + (n - 1) * 0.055 + dur;
  }

  private updateCoins(): void {
    if (!this.flights.length && this.coinMesh.count === 0) return;
    const m = _m;
    const q = _q;
    const p = _p;
    const sc = _s;
    let n = 0;
    for (let k = this.flights.length - 1; k >= 0; k--) {
      const f = this.flights[k]!;
      const t = (this.time - f.start) / f.dur;
      if (t >= 1) {
        this.flights.splice(k, 1);
        continue;
      }
      if (t < 0) continue;
      p.lerpVectors(f.a, f.b, t);
      p.y += f.h * 4 * t * (1 - t);
      q.setFromEuler(_e.set(Math.PI / 2 + t * f.spin, t * f.spin * 0.5, 0));
      const s = t < 0.12 ? t / 0.12 : t > 0.9 ? (1 - t) / 0.1 : 1;
      sc.setScalar(Math.max(0.001, s));
      m.compose(p, q, sc);
      this.coinMesh.setMatrixAt(n++, m);
    }
    this.coinMesh.count = n;
    this.coinMesh.instanceMatrix.needsUpdate = true;
  }

  /* ---------------------------------------------------------------- the Kabar card */

  drawCard(): void {
    this.cardAt = this.time;
    this.dirty = true;
  }

  private updateCard(): void {
    const c = this.topCard;
    const t = this.time - this.cardAt;
    const base = _p.set(DECK_SPOT[0], 0.127, DECK_SPOT[1]);
    if (t < 0 || t > 1.5) {
      c.position.copy(base);
      c.rotation.set(0, 0.06, 0);
      c.visible = true;
      return;
    }
    // Lift, flip towards the camera, then vanish into the reveal on the HUD.
    const lift = easeOut(clamp01(t / 0.5));
    const flip = easeOut(clamp01((t - 0.2) / 0.6));
    c.position.set(base.x - lift * 0.5, base.y + lift * 1.1, base.z + lift * 0.6);
    c.rotation.set(-flip * Math.PI * 0.62, 0.06 - flip * 0.2, 0);
    const fade = 1 - clamp01((t - 1.05) / 0.4);
    c.scale.setScalar(Math.max(0.001, fade));
  }

  /* ---------------------------------------------------------------- frame */

  /** Moves the pawns; true when one of them moved (or is still shrinking away). */
  private updatePawns(dt: number): boolean {
    const ease = 1 - Math.exp(-dt * 9);
    let moved = false;
    for (const [id, s] of this.pawns) {
      const root = s.model.root;
      const body = s.model.body;
      let y = 0;
      let moving = false;
      if (s.walk) {
        const w = s.walk;
        const e = this.time - w.start;
        const k = Math.floor(e / w.hop);
        if (k >= w.pts.length) {
          s.walk = null;
          s.x = s.tx;
          s.z = s.tz;
          s.landedAt = this.time;
          this.lastLanding = this.time;
        } else {
          moving = true;
          const u = (e - k * w.hop) / w.hop;
          const a = k === 0 ? w.from : w.pts[k - 1]!;
          const last = k === w.pts.length - 1;
          const b: [number, number] = last ? [s.tx, s.tz] : w.pts[k]!;
          s.x = a[0] + (b[0] - a[0]) * u;
          s.z = a[1] + (b[1] - a[1]) * u;
          y = (w.kind === 'jump' ? JUMP_ARC : HOP_ARC) * 4 * u * (1 - u);
          const dx = b[0] - a[0];
          const dz = b[1] - a[1];
          if (Math.abs(dx) + Math.abs(dz) > 0.01) {
            const want = Math.atan2(dx, dz) * (w.kind === 'back' ? 0 : 1);
            s.yaw += angleDelta(s.yaw, want) * Math.min(1, dt * 14);
          }
          if (u > 0.92 && k < w.pts.length - 1) s.landedAt = this.time;
        }
      }
      if (
        moving ||
        Math.abs(s.tx - s.x) + Math.abs(s.tz - s.z) > 0.002 ||
        (s.outAt !== null && this.time - s.outAt < 0.7)
      )
        moved = true;
      if (!moving) {
        s.x += (s.tx - s.x) * ease;
        s.z += (s.tz - s.z) * ease;
        s.yaw += angleDelta(s.yaw, 0) * Math.min(1, dt * 5);
      }
      const isActive = this.active === id;
      if (isActive && !moving) y += 0.025 * (0.5 + 0.5 * Math.sin(this.time * 4.2));
      root.position.set(s.x, TILE_H + y, s.z);
      root.rotation.y = s.yaw;
      // Squash on landing.
      const l = (this.time - s.landedAt) / 0.18;
      if (l >= 0 && l < 1) {
        const q = Math.sin(l * Math.PI);
        body.scale.set(1 + q * 0.12, 1 - q * 0.16, 1 + q * 0.12);
      } else body.scale.set(1, 1, 1);
      let gone = 1;
      if (s.outAt !== null) {
        const o = clamp01((this.time - s.outAt) / 0.6);
        gone = Math.max(0.001, 1 - easeOut(o));
        root.scale.setScalar(gone);
        root.visible = o < 1;
      }
      // Contact shadow: stays on the tile, grows and fades while the pawn is in the air.
      const b = s.blob;
      b.visible = root.visible;
      b.position.set(s.x + BLOB_SHIFT_X, TILE_H + 0.003, s.z + BLOB_SHIFT_Z);
      const spread = PAWN_BLOB * gone * (1 + y * 0.5);
      b.scale.set(spread, 1, spread);
      s.blobMat.opacity = BLOB_OPACITY / (1 + y * 1.6);
      if (isActive) {
        const pulse = 1 + 0.08 * Math.sin(this.time * 4.2);
        this.ring.position.set(s.x, TILE_H + 0.004, s.z);
        this.ring.scale.setScalar(pulse);
        this.ringMat.opacity = 0.65 + 0.3 * Math.sin(this.time * 4.2);
      }
    }
    return moved;
  }

  private updatePops(): void {
    for (let k = this.pops.length - 1; k >= 0; k--) {
      const p = this.pops[k]!;
      const t = clamp01((this.time - p.start) / p.dur);
      if (p.dir === 1) p.obj.scale.setScalar(Math.max(0.001, easeOutBack(t)));
      else p.obj.scale.setScalar(Math.max(0.001, 1 - easeOut(t)));
      if (t >= 1) {
        if (p.dir === -1) {
          this.scene.remove(p.obj);
          p.obj.parent?.remove(p.obj);
        }
        this.pops.splice(k, 1);
      }
    }
  }

  /** Frame pacing: call at the top of every animation frame; false = skip this frame entirely. */
  due(now: number): boolean {
    return this.pacer.due(now);
  }

  /** Do not judge frame times for `ms` (intro, resume after a pause, a resize). */
  holdGovernor(ms: number): void {
    this.holdUntil = Math.max(this.holdUntil, performance.now() + ms);
    this.govArmed = false;
  }

  /**
   * One due frame: advance the view clock by `dt` seconds (0 while paused), then draw when
   * something moved. Only the idle bob and pulses: at most 30 fps. Nothing at all: no draw.
   */
  frame(dt: number, now: number): void {
    this.frames++;
    const motion = this.update(dt);
    const draw = motion || (dt > 0 && now - this.lastDraw >= AMBIENT_MS);
    if (draw) {
      this.draw();
      this.lastDraw = now;
    }
    this.govern(now, motion);
  }

  /** Advance the view clock by `dt` seconds and always draw (key art). */
  render(dt: number): void {
    this.update(dt);
    this.shadowDirty = true;
    this.draw();
  }

  /** Advances every animation; true when something moved enough to need a full-rate frame. */
  private update(dt: number): boolean {
    this.time += dt;
    const camera =
      this.posterCam === null &&
      (Math.abs(this.focusGoal.x - this.focusNow.x) + Math.abs(this.focusGoal.z - this.focusNow.z) > 0.005 ||
        Math.abs(this.zoomGoal - this.zoomNow) > 0.002 ||
        Math.abs(this.yawNow) > 0.003);
    const animating =
      this.frames < 3 ||
      this.diceThrow !== null ||
      this.pops.length > 0 ||
      this.flips.length > 0 ||
      this.drops.length > 0 ||
      this.time - this.cardAt < 1.6 ||
      this.time - this.lastLanding < 0.3;
    // The active pawn's idle bob: a light shadow refresh is enough.
    if (animating || (this.active !== null && this.frames % 4 === 0)) this.shadowDirty = true;
    const pawns = this.updatePawns(dt);
    if (pawns) this.shadowDirty = true;
    const effects = this.flights.length > 0 || this.bursts.length > 0;
    this.updateDice();
    this.updateCoins();
    this.updateCard();
    this.updatePops();
    this.updateFlips();
    this.updateDrops();
    this.updateBursts();
    if (this.glowTile !== null) this.glowMat.opacity = 0.55 + 0.4 * Math.sin(this.time * 5);
    this.updateCamera(dt);
    const motion = this.dirty || animating || pawns || effects || camera;
    this.dirty = false;
    return motion;
  }

  private draw(): void {
    if (this.shadowDirty && this.key.castShadow) this.renderer.shadowMap.needsUpdate = true;
    this.shadowDirty = false;
    this.renderer.render(this.scene, this.camera);
    this.renders++;
  }

  /**
   * Feeds the frame governor. Only the interval between two back-to-back motion frames is a
   * measure of speed (idle frames are drawn at 30 fps or not at all), so the governor runs on its
   * own clock that advances by those intervals only.
   */
  private govern(now: number, motion: boolean): void {
    if (!motion || now < this.holdUntil || this.posterCam) {
      this.govArmed = false;
      return;
    }
    if (this.govArmed) {
      // FrameGovernor skips frames over 500 ms as hitches; a device that slow must still step down.
      this.govClock += Math.min(now - this.govLast, SLOWEST_SAMPLE_MS);
      if (this.gov.frame(this.govClock, this.pacer.targetMs)) this.stepDown(now);
    }
    this.govLast = now;
    this.govArmed = true;
  }

  /** One rung down the quality ladder (see quality.ts). */
  private stepDown(now: number): void {
    const rung = nextRung({
      shadowMap: this.key.castShadow ? this.key.shadow.mapSize.x : 0,
      ratio: this.renderer.getPixelRatio() / this.wide,
      minRatio: this.q.minRatio,
      cap30: this.pacer.cap30,
    });
    if (rung.kind === 'none') return;
    this.steps.push(rungLabel(rung));
    if (rung.kind === 'shadow') this.setShadow(rung.size);
    else if (rung.kind === 'ratio') {
      this.ratio = rung.ratio;
      this.applySize();
    } else {
      this.pacer.cap30 = true;
      // The last rung: the next game on this device starts one level lower.
      noteSlow(this.tier);
    }
    this.dirty = true;
    // Let the change settle (a resize, recompiled shaders) before judging again.
    this.holdUntil = Math.max(this.holdUntil, now + 500);
    this.govArmed = false;
  }

  /** A smaller shadow map, or none (the contact shadows take over). */
  private setShadow(size: number): void {
    const k = this.key;
    if (size > 0) {
      k.shadow.mapSize.set(size, size);
      k.shadow.map?.dispose();
      k.shadow.map = null;
    } else k.castShadow = false;
    for (const m of this.blobMats) m.visible = !k.castShadow;
    this.shadowDirty = true;
  }

  /**
   * Compiles every shader before the first frame (hidden things and the contact shadows too), so
   * nothing compiles mid-game on a slow GPU.
   */
  async warmUp(): Promise<void> {
    this.camera.updateMatrixWorld();
    const hidden: THREE.Object3D[] = [];
    this.scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    const blobs = this.blobMats.map((m) => m.visible);
    for (const m of this.blobMats) m.visible = true;
    const coins = this.coinMesh.count;
    this.coinMesh.count = 1;
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
    } catch {
      this.renderer.compile(this.scene, this.camera);
    }
    for (const o of hidden) o.visible = false;
    this.blobMats.forEach((m, i) => {
      m.visible = blobs[i] ?? m.visible;
    });
    this.coinMesh.count = coins;
    this.dirty = true;
  }

  stats(): ViewStats {
    const info = this.renderer.info.render;
    return {
      tier: this.tier,
      ratio: this.ratio,
      pixelRatio: this.renderer.getPixelRatio(),
      backing: [this.canvas.width, this.canvas.height],
      calls: info.calls,
      triangles: info.triangles,
      programs: this.renderer.info.programs?.length ?? 0,
      shadows: this.key.castShadow,
      shadowMap: this.key.castShadow ? this.key.shadow.mapSize.x : 0,
      cap30: this.pacer.cap30,
      renders: this.renders,
      steps: [...this.steps],
    };
  }

  dispose(): void {
    this.renderer.dispose();
  }
}

/** Shortest signed angle from a to b. */
function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
