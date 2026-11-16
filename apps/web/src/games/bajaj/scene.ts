/**
 * Renderer core shared by every Bajaj Rush screen: one WebGL canvas, lights, fog and the current
 * map, plus a pluggable `SceneContent` (the race, the showroom or a circuit flyover) that moves
 * its objects each frame and supplies one camera per viewport. Look and lighting live here;
 * race behaviour lives in raceview.ts, showroom.ts and flyover.ts.
 */
import type { Fruit } from '@hoorah/protocol';
import * as THREE from 'three';
import type { GfxTier } from '../common/gfx';
import { type KartMaterials, KartModel, kartMaterials } from './kart3d';
import { LightRig, setLightMaterials, setupRenderer, upgradeMaterials } from './look';
import type { MapScene } from './maps/types';
import { LEVELS } from './quality';
import { type PlateAtlas, plateAtlas } from './textures';

export type ViewKind = 'chase' | 'broadcast' | 'overview' | 'free';

export interface Viewport {
  /** Stage px, origin top-left. */
  x: number;
  y: number;
  w: number;
  h: number;
  kind: ViewKind;
  /** Kart index followed by a chase camera. */
  kart: number;
  free?: { pos: THREE.Vector3; look: THREE.Vector3; fov: number };
}

/** What is on screen. It adds its objects to `renderer.scene` and removes them in `dispose()`. */
export interface SceneContent {
  update(alpha: number, dt: number, time: number): void;
  camera(vi: number, vp: Viewport, dt: number, alpha: number): THREE.PerspectiveCamera;
  /** Per-viewport tweaks (hide or ghost karts, particle scale); returns an undo function. */
  beforeViewport?(
    vi: number,
    vp: Viewport,
    cam: THREE.PerspectiveCamera,
    heightPx: number,
  ): (() => void) | undefined;
  dispose(): void;
}

/**
 * Low level: map LOD objects switch to their coarse twin at this share of their own distance, and
 * karts keep the full model only this close to a camera (m).
 */
const LIGHT_LOD_SCALE = 0.6;
const LIGHT_KART_DETAIL = 12;
/**
 * Low level view distance: the fog ends by this far (m) and cameras stop a little beyond it, so
 * fogged-out chunks and props are culled. Sky domes (radius 490, centred under the camera) shrink
 * to fit inside; scaled about the camera they look exactly the same.
 */
const LIGHT_FOG_FAR = 300;
const LIGHT_VIEW_FAR = 340;
const LIGHT_SKY_SCALE = 0.6;
const SKY_RADIUS = 490;
/** Low level with 3-4 split views (each small, each drawn in full): a shorter view still. */
const LIGHT_SPLIT_VIEW = 0.75;

/** Fictional Jakarta-style plates, one per grid slot. */

const PLATES = [
  'B 2718 RS',
  'B 4073 JD',
  'B 1417 DF',
  'B 6342 UE',
  'B 9061 LT',
  'B 3385 BS',
  'B 5520 KA',
  'B 7704 NH',
];

export class RaceRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly hemi = new THREE.HemisphereLight(0xdcefff, 0x9c8f7a, 1.25);
  readonly sun = new THREE.DirectionalLight(0xfff1d6, 2.1);
  map: MapScene | null = null;
  content: SceneContent | null = null;
  viewports: Viewport[] = [];
  private stageH = 720;
  private clock = 0;
  private readonly kartMats: KartMaterials;
  private readonly plates: PlateAtlas;
  /** Sun, fill, image-based lighting, per-viewport shadows and quality tiers (look.ts). */
  readonly rig: LightRig;
  /** Low graphics level: light materials and models, fewer particles. */
  readonly light: boolean;
  private upgradeScene = true;
  /** Per-viewport copies of the content's cameras for this frame. */
  private readonly snaps: THREE.PerspectiveCamera[] = [];
  /** Low level: the map's sky group and its fog distances (scaled per frame for split views). */
  private sky: THREE.Object3D | null = null;
  private fogNear = 0;
  private fogFar = 0;

  /** `level` must be known before any map or kart is built (it picks their materials). */
  constructor(host: HTMLElement, antialias = true, level: GfxTier = 'high') {
    this.light = LEVELS[level].light;
    setLightMaterials(this.light);
    KartModel.detailDistance = this.light ? LIGHT_KART_DETAIL : KartModel.detailDistance;
    this.renderer = new THREE.WebGLRenderer({
      antialias,
      powerPreference: 'high-performance',
      stencil: false,
    });
    setupRenderer(this.renderer);
    this.renderer.info.autoReset = false;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'bj-canvas';
    host.appendChild(this.canvas);
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.rig = new LightRig(this.renderer, this.scene, this.sun, this.hemi, level);
    this.scene.userData.rig = this.rig;

    // One set of kart materials shared by every bajaj (a single shader program each).
    this.plates = plateAtlas(PLATES);
    this.kartMats = kartMaterials(this.plates.texture);
  }

  /** One bajaj in a player's colour with their fruit driver; `slot` picks the number plate. */
  makeKart(color: string, fruit: Fruit, slot: number): KartModel {
    const p = ((slot % PLATES.length) + PLATES.length) % PLATES.length;
    return new KartModel(
      { color, fruit, plate: this.plates.plate(p), lightUv: this.plates.white },
      this.kartMats,
    );
  }

  /** Swap the world and its time-of-day mood. */
  setMap(map: MapScene): void {
    if (this.map === map) return;
    if (this.map) this.scene.remove(this.map.root);
    this.map = map;
    // PBR materials, shadow flags and per-cell prop culling for maps built with toon materials.
    upgradeMaterials(map.root, { split: true });
    if (this.light) nearerLod(map.root);
    this.scene.add(map.root);
    const m = map.mood;
    if (this.light) {
      this.fogFar = Math.min(m.fogFar, LIGHT_FOG_FAR);
      this.fogNear = (m.fogNear * this.fogFar) / m.fogFar;
      this.sky = map.root.getObjectByName('sky') ?? null;
    }
    this.scene.fog = new THREE.Fog(m.fog, m.fogNear, m.fogFar);
    this.renderer.setClearColor(m.fog);
    this.rig.setSky(m, map.id);
    this.upgradeScene = true;
  }

  setContent(c: SceneContent | null): void {
    if (this.content && this.content !== c) this.content.dispose();
    this.content = c;
    this.upgradeScene = true;
  }

  /** Backing store = stage px x k (the stage is 1280x720 on 16:9, wider or taller elsewhere). */
  setSize(stageW: number, stageH: number, k: number): void {
    this.stageH = stageH;
    this.renderer.setPixelRatio(k);
    this.renderer.setSize(stageW, stageH, false);
  }

  get pixelRatio(): number {
    return this.renderer.getPixelRatio();
  }

  get time(): number {
    return this.clock;
  }

  setLayout(vps: Viewport[]): void {
    this.viewports = vps;
  }

  /** `alpha` interpolates between the last two sim steps; `dt` is real seconds (0 while paused). */
  render(alpha: number, dt: number): void {
    const r = this.renderer;
    r.info.reset();
    this.clock += dt;
    const map = this.map;
    const c = this.content;
    if (!map || !c) {
      r.clear();
      return;
    }
    if (dt > 0) map.update(this.clock, dt);
    c.update(alpha, dt, this.clock);
    if (this.upgradeScene) {
      // Effects and props the content added (item boxes, slicks): PBR materials, no splitting.
      this.upgradeScene = false;
      upgradeMaterials(this.scene);
    }
    const H = this.stageH;
    const pr = r.getPixelRatio();
    const n = this.viewports.length;
    const view = this.light ? this.lightView(n) : 1;
    // Cameras first, then every viewport's shadow map, then the views: the canvas stays bound
    // for all views in one go (cheap on tile-based GPUs).
    KartModel.setDetailFor(null);
    const cams = this.viewports.map((vp, vi) => {
      const snap = this.snaps[vi] ?? new THREE.PerspectiveCamera();
      this.snaps[vi] = snap;
      snap.copy(c.camera(vi, vp, dt, alpha), false);
      if (this.light) {
        // High overview cameras still need to reach the far side of the (shrunken) sky dome.
        const far = Math.max(
          LIGHT_VIEW_FAR * view,
          snap.position.y + SKY_RADIUS * LIGHT_SKY_SCALE * view + 20,
        );
        if (snap.far > far) {
          snap.far = far;
          snap.updateProjectionMatrix();
        }
      }
      this.rig.shadowView(vi, n, snap);
      return snap;
    });
    r.setScissorTest(true);
    this.viewports.forEach((vp, vi) => {
      const cam = cams[vi]!;
      map.followSky(cam.position.x, cam.position.z);
      r.setViewport(vp.x, H - vp.y - vp.h, vp.w, vp.h);
      r.setScissor(vp.x, H - vp.y - vp.h, vp.w, vp.h);
      const undo = c.beforeViewport?.(vi, vp, cam, vp.h * pr);
      this.rig.useView(vi);
      KartModel.setDetailFor(cam.position, vp.h / H);
      r.render(this.scene, cam);
      undo?.();
    });
    r.setScissorTest(false);
  }

  /**
   * Low level view distance for `n` viewports: fog and sky dome for this frame; returns the scale
   * for the camera far plane.
   */
  private lightView(n: number): number {
    const k = n > 2 ? LIGHT_SPLIT_VIEW : 1;
    const fog = this.scene.fog;
    if (fog instanceof THREE.Fog) {
      fog.near = this.fogNear * k;
      fog.far = this.fogFar * k;
    }
    this.sky?.scale.setScalar(LIGHT_SKY_SCALE * k);
    return k;
  }

  dispose(): void {
    this.content?.dispose();
    this.renderer.dispose();
  }
}

/** Coarse LOD twins from closer by (once per map). */
function nearerLod(root: THREE.Object3D): void {
  if (root.userData.nearerLod) return;
  root.userData.nearerLod = true;
  root.traverse((o) => {
    if (o instanceof THREE.LOD) for (const l of o.levels) l.distance *= LIGHT_LOD_SCALE;
  });
}

/** Widest horizontal FOV (deg) before the edges of a very wide strip stretch visibly. */
const MAX_HFOV = 104;

/**
 * Horizontal FOV kept roughly constant across viewport shapes. Vertical FOV stays in [38, 72],
 * except that very wide strips (2-player split on 21:9) drop below 38 rather than exceed MAX_HFOV.
 */
export function fovFor(aspect: number, hfovDeg: number): number {
  const vOf = (hDeg: number) => (2 * Math.atan(Math.tan((hDeg * Math.PI) / 360) / aspect) * 180) / Math.PI;
  return Math.min(72, Math.max(38, vOf(hfovDeg)), vOf(MAX_HFOV));
}
