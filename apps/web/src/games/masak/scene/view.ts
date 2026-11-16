/**
 * The 3D view: one WebGL canvas covering the stage. In grid mode every player's station is drawn
 * into its own scissor viewport (same kitchen, only that player's food visible), plus a small
 * window on Chef Mangga in the header. In hero mode one wide shot fills the stage (dish intro,
 * finale, poster).
 *
 * Graphics follow the device level (`common/gfx.ts`, mapped in `quality.ts`); while frames stay
 * slow the quality ladder turns shadows down, then resolution, then caps at 30 fps.
 */
import * as THREE from 'three';
import type { GfxTier } from '../../common/gfx';
import { CHEF_RECT, HEADER_H, type Rect, STAGE_W, stationRects } from '../layout';
import { DISHES, type DishId, type Focus } from '../recipes';
import { Chef, type Mood } from './chef';
import { particleMaterial } from './fx';
import { approach, PAL, setLowDetail } from './kit';
import { Kitchen } from './kitchen';
import { directional, FILL, HEMI, KEY, RIM } from './light';
import type { StationModel } from './model';
import { PLANS, QualityLadder, type Rung, type ShadowLevel, shadowMapSize, type TierPlan } from './quality';
import { CHEF_POS, FRAME, SPOT } from './spots';
import { StationRig } from './station';

export type HeroShot = 'intro' | 'final' | 'poster';

export interface ViewFrame {
  /** Seconds (game time; frozen while paused). */
  t: number;
  dt: number;
  mode: 'grid' | 'hero';
  dish: DishId;
  focus: Focus;
  stations: StationModel[];
  /** Hero mode: which station's food is on the island. */
  heroStation: number;
  heroShot: HeroShot;
  /** Showcase: slow orbit around the plate. */
  orbit: boolean;
}

const FOV = 30;
/** Hold quality changes this long after the view is built (shader compile, first uploads). */
const LOAD_HOLD_MS = 3000;
/** ... and after a scene change (mode, dish, stations), which may compile new shaders. */
const CHANGE_HOLD_MS = 1500;

export interface ViewOptions {
  /** Keep the drawing buffer (poster capture). */
  preserve?: boolean;
  width?: number;
  /** Device graphics level (default high). */
  tier?: GfxTier;
  /** Step quality down while frames are slow (default true). */
  adaptive?: boolean;
  /** Called when the ladder reaches its last rung (default `noteSlow`). */
  onBottom?: (tier: GfxTier) => void;
}

interface CamState {
  cam: THREE.PerspectiveCamera;
  target: THREE.Vector3;
  dist: number;
  elev: number;
  yaw: number;
  init: boolean;
}

export class MasakView {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly kitchen: Kitchen;
  readonly chef = new Chef();
  private readonly rigs: StationRig[] = [];
  private readonly cams: CamState[] = [];
  private readonly chefCam = new THREE.PerspectiveCamera(26, 1, 0.05, 30);
  private readonly heroCam = new THREE.PerspectiveCamera(32, 16 / 9, 0.05, 40);
  /** Sees nothing: rendering with it runs only the shadow pass. */
  private readonly voidCam = new THREE.OrthographicCamera(-0.01, 0.01, 0.01, -0.01, 0.1, 0.2);
  private readonly key: THREE.DirectionalLight;
  private readonly plan: TierPlan;
  readonly quality: QualityLadder;
  private height: number;
  /** Stage width: 1280 on 16:9 and taller, wider on 21:9 / 2:1. */
  private width: number;
  private rects: Rect[] = [];
  private readonly heroRect: Rect = { x: 0, y: 0, w: STAGE_W, h: 720 };
  private heroT = 0;
  private lastMode: 'grid' | 'hero' | null = null;
  private lastDish: DishId | null = null;
  /** What the shadow map holds: the fixed set of one dish, a live frame, or nothing yet. */
  private shadowOf: DishId | 'live' | null = null;
  private frameNo = 0;
  /** Poster tuning: [x, y, z, tx, ty, tz, fov]. */
  posterCam: number[] | null = null;

  constructor(host: HTMLElement, height: number, opts: ViewOptions = {}) {
    this.height = height;
    this.width = Math.max(STAGE_W, opts.width ?? STAGE_W);
    this.plan = PLANS[opts.tier ?? 'high'];
    this.quality = new QualityLadder(this.plan, opts.adaptive ?? true, opts.onBottom);
    this.quality.hold(performance.now() + LOAD_HOLD_MS);
    setLowDetail(this.plan.lowDetail);
    this.kitchen = new Kitchen({ baked: this.plan.bakedSet });
    this.renderer = new THREE.WebGLRenderer({
      antialias: this.plan.msaa,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: opts.preserve ?? false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.autoClear = false;
    this.voidCam.position.set(0, -100, 0);
    this.voidCam.lookAt(0, -101, 0);
    this.voidCam.updateMatrixWorld();
    this.canvas = this.renderer.domElement;
    this.applySize();
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    host.appendChild(this.canvas);

    this.scene.add(this.kitchen.group);
    this.chef.root.position.set(CHEF_POS[0], CHEF_POS[1], CHEF_POS[2]);
    this.scene.add(this.chef.root);

    this.scene.add(new THREE.HemisphereLight(HEMI.sky, HEMI.ground, HEMI.intensity));
    this.key = directional(KEY);
    const sc = this.key.shadow.camera;
    sc.left = -1.9;
    sc.right = 1.9;
    sc.top = 1.6;
    sc.bottom = -1.6;
    sc.near = 0.5;
    sc.far = 7;
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.012;
    this.key.shadow.radius = 3;
    this.scene.add(this.key, this.key.target, directional(FILL), directional(RIM));
    this.applyShadows(this.quality.rung.shadows);
  }

  /**
   * Backing-store scale actually used. A stage wider than 1280 keeps the pixel count of the
   * 1280-wide stage at the same height, so 21:9 costs no extra fill rate.
   */
  get pixelRatio(): number {
    return this.quality.rung.ratio * Math.sqrt(STAGE_W / this.width);
  }

  /** Frames drawn so far (fps probes). */
  get framesRendered(): number {
    return this.frameNo;
  }

  /**
   * Call at the top of every animation frame with its timestamp. False: skip this display frame
   * (capped at 30 fps). True: render it; quality may have just stepped down.
   */
  beginFrame(now: number): boolean {
    if (!this.quality.due(now)) return false;
    const prev = this.quality.rung;
    const next = this.quality.frame(now);
    if (next) this.applyRung(next, prev);
    return true;
  }

  private applyRung(next: Rung, prev: Rung): void {
    if (next.shadows !== prev.shadows) this.applyShadows(next.shadows);
    if (next.ratio !== prev.ratio) this.applySize();
  }

  /** Shadow map on or off and its size; blob shadows stand in when it is off. */
  private applyShadows(level: ShadowLevel): void {
    const size = shadowMapSize(level);
    const on = size > 0;
    const shadow = this.key.shadow;
    if (!on || shadow.mapSize.x !== size) {
      shadow.map?.dispose();
      shadow.map = null;
    }
    if (on) shadow.mapSize.set(size, size);
    this.renderer.shadowMap.enabled = on;
    this.key.castShadow = on;
    this.kitchen.setContactShadows(!on);
    this.shadowOf = null;
  }

  private applySize(): void {
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.width, this.height, false);
  }

  setSize(w: number, h: number): void {
    this.width = Math.max(STAGE_W, w);
    this.height = h;
    // A new drawing buffer: the next frames are not a fair measure.
    this.quality.hold(performance.now() + CHANGE_HOLD_MS);
    this.applySize();
    this.layout(this.rigs.length);
  }

  /** Make sure there are `n` station rigs and viewports. */
  setStations(n: number): void {
    if (this.rigs.length < n) this.quality.hold(performance.now() + CHANGE_HOLD_MS);
    while (this.rigs.length < n) {
      const rig = new StationRig();
      rig.fx.density = this.plan.particles;
      this.rigs.push(rig);
      this.scene.add(rig.group);
      this.cams.push({
        cam: new THREE.PerspectiveCamera(FOV, 1, 0.03, 30),
        target: new THREE.Vector3(),
        dist: 1,
        elev: 0.85,
        yaw: 0,
        init: false,
      });
    }
    this.layout(n);
  }

  get stationRects(): readonly Rect[] {
    return this.rects;
  }

  private layout(n: number): void {
    this.rects = stationRects(Math.max(1, n), this.height, this.width);
  }

  react(mood: Mood, t: number, ms?: number): void {
    this.chef.react(mood, t, ms);
  }

  render(f: ViewFrame): void {
    const t = f.t;
    this.frameNo++;
    if (f.dish !== this.lastDish) {
      this.lastDish = f.dish;
      this.quality.hold(performance.now() + CHANGE_HOLD_MS);
    }
    this.kitchen.setDish(f.dish);
    this.chef.update(t);
    const n = Math.min(this.rigs.length, f.stations.length);
    for (let i = 0; i < n; i++) this.rigs[i]!.update(f.stations[i]!, t, f.dt);

    const r = this.renderer;
    r.setScissorTest(false);
    r.setClearColor(PAL.ink, 1);
    r.clear(true, true, true);
    r.setScissorTest(true);

    if (f.mode !== this.lastMode) {
      this.lastMode = f.mode;
      this.heroT = 0;
      for (const c of this.cams) c.init = false;
      this.quality.hold(performance.now() + CHANGE_HOLD_MS);
    }
    this.heroT += f.dt;
    const level = this.quality.rung.shadows;

    if (f.mode === 'hero') {
      // The dish intro is a short camera move right after a scene change: not a fair measure.
      if (f.heroShot === 'intro') this.quality.hold(performance.now() + CHANGE_HOLD_MS);
      this.showOnly(f.heroStation);
      this.chef.root.visible = true;
      this.placeHero(f.heroShot, this.width / this.height, this.heroT, t);
      // The chef moves: full redraws the shadow map every frame, light every other frame.
      r.shadowMap.autoUpdate = level === 'full';
      r.shadowMap.needsUpdate = this.shadowOf !== 'live' || (this.frameNo & 1) === 0;
      this.shadowOf = 'live';
      this.heroRect.w = this.width;
      this.heroRect.h = this.height;
      this.draw(this.heroRect, this.heroCam, true);
    } else {
      // Shadows: at full level with one or two stations each viewport renders its own (the food
      // casts shadows). Otherwise one map of the fixed set (food hidden) is shared by all views;
      // nothing in it moves, so it is redrawn only when the dish changes.
      const perView = level === 'full' && n <= 2;
      this.chef.root.visible = false;
      if (level !== 'off' && !perView) this.staticShadows(f.dish);
      r.shadowMap.autoUpdate = perView;
      if (perView) this.shadowOf = 'live';
      for (let i = 0; i < n; i++) {
        const rect = this.rects[i];
        if (!rect) continue;
        this.showOnly(i);
        const cs = this.cams[i]!;
        this.placeStation(cs, f.focus, rect.w / rect.h, f.dt, t, i, f.orbit, this.rigs[i]!.shake);
        this.draw(rect, cs.cam, false);
      }
      // Chef window: no food on the island, and it reuses the last shadow map.
      r.shadowMap.autoUpdate = false;
      this.showOnly(-1);
      this.chef.root.visible = true;
      this.placeChefCam(CHEF_RECT.w / CHEF_RECT.h, t);
      this.draw(CHEF_RECT, this.chefCam, false);
    }
  }

  /** Render the shadow map of the fixed set (no food, no chef) unless it already holds it. */
  private staticShadows(dish: DishId): void {
    if (this.shadowOf === dish) return;
    this.shadowOf = dish;
    this.showOnly(-1);
    const r = this.renderer;
    r.shadowMap.autoUpdate = false;
    r.shadowMap.needsUpdate = true;
    r.render(this.scene, this.voidCam);
  }

  private showOnly(i: number): void {
    for (let k = 0; k < this.rigs.length; k++) this.rigs[k]!.group.visible = k === i;
  }

  private draw(rect: Rect, cam: THREE.PerspectiveCamera, clearColor: boolean): void {
    const r = this.renderer;
    const y = this.height - rect.y - rect.h;
    r.setViewport(rect.x, y, rect.w, rect.h);
    r.setScissor(rect.x, y, rect.w, rect.h);
    r.clear(clearColor, true, false);
    const mat = particleMaterial();
    mat.uniforms.uScale!.value = (rect.h * this.pixelRatio) / (2 * Math.tan((cam.fov * Math.PI) / 360));
    r.render(this.scene, cam);
  }

  private placeStation(
    cs: CamState,
    focus: Focus,
    aspect: number,
    dt: number,
    t: number,
    slot: number,
    orbit: boolean,
    shake: number,
  ): void {
    const fr = FRAME[focus];
    const [sx, sy, sz] = SPOT[focus];
    const half = Math.tan((FOV * Math.PI) / 360);
    const fit = Math.min(half, half * aspect * 0.9);
    const dist = fr.radius / fit;
    const tx = sx;
    const ty = sy + fr.lookY;
    const tz = sz;
    if (!cs.init) {
      cs.init = true;
      cs.target.set(tx, ty, tz);
      cs.dist = dist;
      cs.elev = fr.elev;
    } else {
      const k = 4.2;
      cs.target.set(
        approach(cs.target.x, tx, k, dt),
        approach(cs.target.y, ty, k, dt),
        approach(cs.target.z, tz, k, dt),
      );
      cs.dist = approach(cs.dist, dist, k, dt);
      cs.elev = approach(cs.elev, fr.elev, k, dt);
    }
    const yawTarget = orbit ? Math.sin(t * 0.45 + slot) * 0.55 : Math.sin(t * 0.3 + slot * 1.7) * 0.05;
    cs.yaw = approach(cs.yaw, yawTarget, 2, dt);
    const cam = cs.cam;
    cam.aspect = aspect;
    cam.fov = FOV;
    const ce = Math.cos(cs.elev);
    const se = Math.sin(cs.elev);
    cam.position.set(
      cs.target.x + Math.sin(cs.yaw) * ce * cs.dist,
      cs.target.y + se * cs.dist,
      cs.target.z + Math.cos(cs.yaw) * ce * cs.dist,
    );
    if (shake > 0) {
      cam.position.x += (Math.sin(t * 91) * shake) / 1;
      cam.position.y += Math.cos(t * 77) * shake;
    }
    cam.lookAt(cs.target);
    cam.updateProjectionMatrix();
  }

  private placeChefCam(aspect: number, t: number): void {
    const c = this.chefCam;
    c.aspect = aspect;
    const [x, , z] = CHEF_POS;
    c.position.set(x + 0.02 + Math.sin(t * 0.4) * 0.02, 0.3, z + 1.45);
    c.lookAt(x + 0.05, 0.21, z);
    c.updateProjectionMatrix();
  }

  private placeHero(shot: HeroShot, aspect: number, k: number, t: number): void {
    const c = this.heroCam;
    c.aspect = aspect;
    const ease = 1 - Math.exp(-k * 1.4);
    if (shot === 'poster') {
      const pc = this.posterCam ?? [-0.14, 0.56, 1.12, 0.34, 0.2, -0.33, 38];
      c.fov = pc[6] ?? 30;
      c.position.set(pc[0]!, pc[1]!, pc[2]!);
      c.lookAt(pc[3]!, pc[4]!, pc[5]!);
    } else if (shot === 'final') {
      c.fov = 30;
      c.position.set(0.15 + Math.sin(t * 0.25) * 0.08, 0.64, 1.85 - ease * 0.15);
      c.lookAt(0.5, 0.24, -0.35);
    } else {
      // Dish intro: slow push-in; the chef sits left of the recipe card.
      c.fov = 32;
      c.position.set(0.05 + ease * 0.15, 0.7 - ease * 0.08, 2.05 - ease * 0.3);
      c.lookAt(0.48, 0.24, -0.35);
    }
    c.updateProjectionMatrix();
  }

  /** Steps that use the stove keep the scene lively; exposed for the poster. */
  static focusOf(dish: DishId, stepIndex: number): Focus {
    return DISHES[dish].steps[stepIndex]?.focus ?? 'plate';
  }

  get headerHeight(): number {
    return HEADER_H;
  }
}
