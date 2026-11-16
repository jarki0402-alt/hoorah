/**
 * Lari Terus renderer: one WebGL canvas with the Bajaj Rush look kit (ACES, sRGB, PBR, a warm
 * low sun with soft shadows that follow the pack, image-based reflections, automatic quality
 * tiers), the streaming city, obstacles, coins, runners and effects, and the camera.
 *
 * Camera: behind and above the pack. The bottom edge of the screen sits on the line below which
 * runners drop out (Bertahan), but while everyone runs close together the camera moves in so the
 * runners stay big; it backs off as soon as someone falls behind, so nobody leaves the screen
 * before they are out. Intro: a crane move from the runners' faces round to the back.
 */
import type { Fruit } from '@hoorah/protocol';
import * as THREE from 'three';
import { LightRig, type SkyLook, setLightMaterials, setupRenderer } from '../bajaj/look';
import { LEVELS } from '../bajaj/quality';
import { fovFor } from '../bajaj/scene';
import type { GfxTier } from '../common/gfx';
import type { LariAssets } from './assets';
import { ObstacleField } from './field';
import { Effects } from './fx';
import type { LariEvent, LariRun, Runner } from './logic';
import { setLowDetailMaterials } from './materials';
import { type PoseState, RUNNER_SCALE, RunnerModel, TAG_HEIGHT } from './runner3d';
import { SKY, World } from './world';

/** Golden hour over the rooftops. */
export const LOOK: SkyLook = {
  sunDir: SKY.sunDir.clone(),
  sunColor: 0xffbf80,
  sunIntensity: 3.4,
  hemiSky: 0xbcd6ea,
  hemiGround: 0x9a7458,
  hemiIntensity: 0.42,
  fog: SKY.haze.clone(),
  fogNear: 60,
  fogFar: 430,
  zenith: 0x3a7cb6,
  horizon: 0xf6c690,
  ground: 0x7a6450,
  skyline: 'city',
  envIntensity: 0.78,
  exposure: 1.02,
};

/** Fog end on the low level, where the city streams 210 m ahead instead of 280 m. */
const LOW_FOG_FAR = 330;

export type CamMode = 'intro' | 'run' | 'finish' | 'free';

/** Camera height and distance behind the bottom line of the screen (m). */
const CAM_H = 6.4;
const CAM_BACK = 8.2;
/** Horizontal field of view kept across screen shapes (deg). */
const HFOV = 76;

/** A move into the roof edge nudges the body this far (m) and back in this long (s). */
const BUMP_REACH = 0.16;
const BUMP_TIME = 0.2;

interface Display {
  x: number;
  /** Visual sidestep so runners sharing a spot never merge into one body. */
  sx: number;
  /** Wall bump: direction and seconds since (>= BUMP_TIME when none). */
  bumpDir: number;
  bumpT: number;
  y: number;
  d: number;
  side: number;
  stepT: number;
  wasAir: boolean;
  slideFx: number;
  visible: boolean;
}

export interface TagPos {
  x: number;
  y: number;
  on: boolean;
}

const _v = new THREE.Vector3();
const _t = new THREE.Vector3();

export class LariScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.3, 2400);
  readonly hemi = new THREE.HemisphereLight();
  readonly sun = new THREE.DirectionalLight();
  readonly rig: LightRig;
  readonly world: World;
  readonly field: ObstacleField;
  readonly fx: Effects;
  private readonly models = new Map<number, RunnerModel>();
  private readonly disp = new Map<number, Display>();
  private readonly order: number[] = [];
  private stageW = 1280;
  private stageH = 720;
  private camOff = 6;
  private camX = 0;
  private camBottom = 0;
  private time = 0;
  private winner: number | null = null;
  /** Clock time when the finish orbit started (-1 before). */
  private finishAt = -1;
  /** Camera for `free` mode (key art). */
  freeCam: { pos: THREE.Vector3; look: THREE.Vector3; fov: number } | null = null;
  /** Showroom: every runner holds this pose instead of following the rules. */
  forcePose: PoseState | null = null;
  /**
   * Low graphics level (Smart TVs, weak GPUs): Lambert materials, the lightest models, no shadow
   * maps, a shorter view and fewer effects.
   */
  readonly lowDetail: boolean;

  /** `level` comes from the device profile (common/gfx.ts); it picks materials and models. */
  constructor(
    host: HTMLElement,
    private readonly assets: LariAssets,
    level: GfxTier = 'high',
    antialias = true,
  ) {
    this.lowDetail = LEVELS[level].light;
    setLowDetailMaterials(this.lowDetail);
    setLightMaterials(this.lowDetail);
    this.renderer = new THREE.WebGLRenderer({
      antialias,
      powerPreference: 'high-performance',
      stencil: false,
    });
    setupRenderer(this.renderer);
    this.renderer.domElement.className = 'lr-canvas';
    host.appendChild(this.renderer.domElement);
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.rig = new LightRig(this.renderer, this.scene, this.sun, this.hemi, level);
    this.rig.setSky(LOOK, 'lari');
    this.world = new World(assets, this.lowDetail);
    this.field = new ObstacleField(assets, this.lowDetail);
    // The low level streams a shorter city: the haze closes in to match.
    const fogFar = this.lowDetail ? LOW_FOG_FAR : LOOK.fogFar;
    this.scene.fog = new THREE.Fog(LOOK.fog, LOOK.fogNear, fogFar);
    this.renderer.setClearColor(LOOK.fog);
    this.fx = new Effects(8, this.lowDetail);
    this.scene.add(this.world.root, this.field.root, this.fx.root);
    this.camera.rotation.order = 'YXZ';
  }

  setRunners(list: readonly { id: number; fruit: Fruit; color: string }[]): void {
    for (const m of this.models.values()) {
      this.scene.remove(m.group);
      m.dispose();
    }
    this.models.clear();
    this.disp.clear();
    this.order.length = 0;
    for (const r of list) {
      const m = new RunnerModel(
        r.id,
        r.fruit,
        r.color,
        this.assets.runners,
        this.lowDetail ? 1 : 0,
        !this.lowDetail,
      );
      this.models.set(r.id, m);
      this.scene.add(m.group);
      this.disp.set(r.id, {
        x: 0,
        sx: 0,
        bumpDir: 0,
        bumpT: BUMP_TIME,
        y: 0,
        d: 0,
        side: 0,
        stepT: 0,
        wasAir: false,
        slideFx: 0,
        visible: true,
      });
      this.order.push(r.id);
    }
  }

  setSize(w: number, h: number, k: number): void {
    this.stageW = w;
    this.stageH = h;
    this.renderer.setPixelRatio(k);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fx.setViewportHeight(h * k);
  }

  /**
   * Compile every material the run will need (pools that are still empty included) before the
   * first frame, so no shader compiles mid-run.
   */
  async warmUp(): Promise<void> {
    this.camera.updateMatrixWorld();
    // Hidden things (speed lines, blinking runners) compile too.
    const hidden: THREE.Object3D[] = [];
    this.scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
    } catch {
      this.renderer.compile(this.scene, this.camera);
    }
    for (const o of hidden) o.visible = false;
  }

  get pixelRatio(): number {
    return this.renderer.getPixelRatio();
  }

  /** Effects for rule events (call before `render` each frame). */
  onEvent(e: LariEvent, run: LariRun): void {
    if (e.type === 'coin') {
      this.fx.coin(e.lane * run.tuning.laneW, e.y, -e.d);
      return;
    }
    if (e.type === 'go' || e.type === 'faster' || e.type === 'finish') return;
    const r = run.runner(e.id);
    const d = this.disp.get(e.id);
    if (!r || !d) return;
    if (e.type === 'stumble' && e.kind !== 'gap') this.fx.stumble(d.x, -d.d);
    else if (e.type === 'land') this.fx.land(d.x, -d.d);
    else if (e.type === 'bump') {
      d.bumpDir = e.dir;
      d.bumpT = 0;
    }
  }

  /** The runner who wins, shown cheering in the finish shot. */
  setWinner(id: number | null): void {
    this.winner = id;
  }

  /**
   * Draw a frame. `alpha` blends the last two rule steps; `dt` is real time (0 while paused);
   * `modeT` is 0..1 through the intro (ignored otherwise).
   */
  render(run: LariRun, alpha: number, dt: number, mode: CamMode, modeT: number): void {
    this.time += dt;
    // Runners
    let lead = Number.NEGATIVE_INFINITY;
    let trail = Number.POSITIVE_INFINITY;
    let sumX = 0;
    let nAlive = 0;
    for (const r of run.runners) {
      const d = this.disp.get(r.id);
      if (!d) continue;
      const pd = r.prevD + (r.d - r.prevD) * alpha;
      const px = r.prevX + (r.x - r.prevX) * alpha;
      const py = r.prevY + (r.y - r.prevY) * alpha;
      const k = dt > 0 ? 1 - Math.exp(-dt * 28) : 1;
      const oldX = d.x;
      // A jump applied as of the phone press starts partway up its arc: ease the visible body to
      // it (lane changes already ease across in the rules, so x only follows here).
      d.x = Math.abs(px - d.x) > 0.4 ? d.x + (px - d.x) * k : px;
      d.y = Math.abs(py - d.y) > 0.3 && r.fallT <= 0 && r.climbT <= 0 ? d.y + (py - d.y) * k : py;
      d.d = pd;
      d.side = dt > 0 ? (d.x - oldX) / dt : 0;
      if (!r.out) {
        lead = Math.max(lead, pd);
        if (r.fallT <= 0) trail = Math.min(trail, pd);
        sumX += d.x;
        nAlive++;
      }
    }
    if (!Number.isFinite(lead)) lead = run.packD;
    if (!Number.isFinite(trail)) trail = lead;
    this.spread(run, dt);
    this.updateCamera(run, mode, modeT, dt, lead, trail, nAlive > 0 ? sumX / nAlive : 0);
    const camD = -this.camera.position.z;
    this.world.update(run.track, camD, this.camera.position.x, this.camera.position.z);
    this.field.update(run, camD, this.time);
    this.poseRunners(run, dt, mode);
    const strength = mode === 'run' ? (run.speed - 13) / 6 : 0;
    this.camera.updateMatrixWorld();
    this.fx.update(dt, this.camera, run.speed, strength);
    this.rig.prepareView(0, 1, this.camera);
    this.renderer.render(this.scene, this.camera);
  }

  /** Runners on the same spot step a little apart (visual only, the rules keep their lanes). */
  private spread(run: LariRun, dt: number): void {
    const list = run.runners;
    const k = dt > 0 ? 1 - Math.exp(-dt * 6) : 1;
    for (let i = 0; i < list.length; i++) {
      const a = this.disp.get(list[i]!.id);
      if (!a) continue;
      let target = 0;
      for (let j = 0; j < list.length; j++) {
        const o = list[j]!;
        if (i === j || o.out) continue;
        const b = this.disp.get(o.id);
        if (b && Math.abs(a.d - b.d) < 1.1 && Math.abs(a.x - b.x) < 0.7) target += i < j ? -0.36 : 0.36;
      }
      target = Math.max(-0.5, Math.min(0.5, target));
      a.sx += (target - a.sx) * k;
    }
  }

  private poseRunners(run: LariRun, dt: number, mode: CamMode): void {
    const T = run.tuning;
    let si = 0;
    for (const r of run.runners) {
      const m = this.models.get(r.id);
      const d = this.disp.get(r.id);
      if (!m || !d) continue;
      // Out runners fall off the bottom of the screen and are hidden there.
      const hidden = r.out && d.d < this.camBottom - 4;
      m.group.visible = !hidden;
      const z = -d.d;
      d.bumpT = Math.min(BUMP_TIME, d.bumpT + dt);
      const bump = d.bumpDir * BUMP_REACH * Math.sin((Math.PI * d.bumpT) / BUMP_TIME);
      const vx = d.x + d.sx + bump;
      m.group.position.set(vx, d.y, z);
      let state: PoseState = 'run';
      let t = 0;
      if (this.forcePose) state = this.forcePose;
      else if (run.phase === 'ready') state = mode === 'intro' ? 'idle' : 'ready';
      else if (run.phase === 'done') state = r.id === this.winner ? 'cheer' : 'idle';
      else if (r.fallT > 0) state = 'fall';
      else if (r.climbT > 0) state = 'climb';
      else if (r.stumbleT > 0 && r.stumbleKind !== 'gap' && r.stumbleT > T.stumbleRecover * 0.6) {
        state = 'stumble';
        t = 1 - (r.stumbleT - T.stumbleRecover * 0.6) / (T.stumbleSlow + T.stumbleRecover * 0.4);
      } else if (r.air) state = 'air';
      else if (r.slideT > 0) state = 'slide';
      let vy = r.vy;
      if (this.forcePose === 'air') vy = 6.6 * Math.cos(this.time * 4.5);
      else if (this.forcePose === 'stumble') t = (this.time * 0.8) % 1;
      m.animate(dt, {
        state,
        speed: this.forcePose === 'run' ? 14 : r.speed,
        vy,
        t,
        kind: r.stumbleKind,
        side: d.side,
        blink: r.safeT > 0 && run.phase === 'run',
      });
      // Contact shadow: shrinks with height, gone over a gap or while falling.
      const overGap = run.track.gapAt(d.d) !== null || r.fallT > 0 || r.climbT > 0;
      const lift = Math.max(0, d.y);
      const size = hidden || overGap ? 0 : Math.max(0.3, 1.25 - lift * 0.45) * RUNNER_SCALE;
      this.fx.shadows.set(si++, vx, 0.005, z, 0, size, size * 1.15);
      // Dust
      if (dt > 0 && run.phase === 'run' && !r.out && !hidden) {
        const ground = !r.air && r.fallT <= 0 && r.climbT <= 0;
        if (ground && r.slideT <= 0 && !overGap) {
          d.stepT += dt * (1.3 + r.speed * 0.075) * 2;
          if (d.stepT >= 1) {
            d.stepT -= 1;
            this.fx.step(vx, z + 0.1, r.speed);
          }
        }
        if (ground && r.slideT > 0) {
          d.slideFx += dt;
          if (d.slideFx > 0.05) {
            d.slideFx = 0;
            this.fx.slide(vx, z);
          }
        }
      }
    }
    for (; si < 8; si++) this.fx.shadows.set(si, 0, -100, 0, 0, 0, 0);
  }

  private updateCamera(
    run: LariRun,
    mode: CamMode,
    modeT: number,
    dt: number,
    lead: number,
    trail: number,
    avgX: number,
  ): void {
    const cam = this.camera;
    const aspect = this.stageW / this.stageH;
    const vfov = fovFor(aspect, HFOV);
    // Frame from the trailing runner (or the drop-out line) forward.
    const want = Math.max(run.outLine, Math.min(trail - 2.2, lead - 5.5));
    const offTarget = Math.max(0, lead - want);
    const k = dt > 0 ? 1 - Math.exp(-dt * (offTarget > this.camOff ? 3.5 : 1.1)) : 1;
    this.camOff += (offTarget - this.camOff) * k;
    this.camBottom = lead - this.camOff;
    const kx = dt > 0 ? 1 - Math.exp(-dt * 1.6) : 1;
    this.camX += (avgX * 0.35 - this.camX) * kx;
    const speedKick = mode === 'run' ? Math.max(0, (run.speed - 10) / 12) : 0;
    const fov = vfov * (1 + speedKick * 0.06);
    const bottomAngle = Math.atan2(CAM_H, CAM_BACK);
    const pitch = bottomAngle - THREE.MathUtils.degToRad(fov) / 2;
    const runPos = _v.set(this.camX, CAM_H, -(this.camBottom - CAM_BACK));
    if (mode === 'free' && this.freeCam) {
      cam.position.copy(this.freeCam.pos);
      cam.lookAt(this.freeCam.look);
      if (cam.fov !== this.freeCam.fov) {
        cam.fov = this.freeCam.fov;
        cam.updateProjectionMatrix();
      }
      return;
    }
    if (mode === 'run') {
      cam.position.copy(runPos);
      cam.rotation.set(-pitch, 0, 0);
    } else if (mode === 'intro') {
      // Crane: from in front of the pack at face height, round the right side, up and behind.
      const e = modeT * modeT * (3 - 2 * modeT);
      const a = Math.PI * (1 - e);
      const back = CAM_BACK + this.camOff;
      const radius = 5.6 + (back - 5.6) * e;
      const px = Math.sin(a) * 6.5 + this.camX * e;
      const pz = -(lead - Math.cos(a) * radius);
      const py = 1.55 + (CAM_H - 1.55) * e * e;
      cam.position.set(px, py, pz);
      // Look target blends from the faces to the run framing.
      _t.set(0, 1.0, -(lead - 0.8));
      const runLook = _v.set(this.camX, CAM_H - Math.sin(pitch) * 30, pz - Math.cos(pitch) * 30);
      const lk = Math.min(1, Math.max(0, (modeT - 0.6) / 0.4));
      _t.lerp(runLook, lk * lk * (3 - 2 * lk));
      cam.up.set(0, 1, 0);
      cam.lookAt(_t);
    } else {
      // Finish: a slow orbit in front of the winner.
      const w = this.winner !== null ? this.disp.get(this.winner) : undefined;
      const cx = w ? w.x : 0;
      const cd = w ? w.d : lead;
      if (this.finishAt < 0) this.finishAt = this.time;
      const a = 0.45 + (this.time - this.finishAt) * 0.12;
      cam.position.set(cx + Math.sin(a) * 5.6, 2.3, -(cd + Math.cos(a) * 5.6));
      _t.set(cx, 1.15, -cd);
      cam.lookAt(_t);
      // Keep the winner left of centre: the standings card sits on the right.
      cam.translateX(1.6);
    }
    if (cam.fov !== fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }

  /** Stage-px position of a runner's name tag anchor. */
  tagPos(r: Runner, out: TagPos): void {
    const d = this.disp.get(r.id);
    const m = this.models.get(r.id);
    if (!d || !m?.group.visible) {
      out.on = false;
      return;
    }
    _v.set(d.x + d.sx, d.y + TAG_HEIGHT * (r.slideT > 0 && !r.air ? 0.62 : 1), -d.d).project(this.camera);
    out.on = _v.z < 1 && _v.x > -1.2 && _v.x < 1.2 && _v.y > -1.3 && _v.y < 1.3;
    out.x = ((_v.x + 1) / 2) * this.stageW;
    out.y = ((1 - _v.y) / 2) * this.stageH;
  }

  dispose(): void {
    for (const m of this.models.values()) m.dispose();
    this.renderer.dispose();
  }
}
