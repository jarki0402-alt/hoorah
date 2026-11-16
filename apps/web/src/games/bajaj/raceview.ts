/**
 * The race on screen: bajaj models following the fixed-step simulation (interpolated), effects
 * (exhaust, boost flames, brake lights, dust, skid marks, hit stars, explosions), item boxes,
 * hazards and throwables, arena life lamps, Lawan Waktu ghosts, and the cameras: one chase camera
 * per human, a broadcast camera for big groups and an overview quadrant.
 */
import * as THREE from 'three';
import { BoxField, HornRings, LifeLamps, OilField, Particles, Shadows, SkidMarks, Throwables } from './fx';
import { KART_ANCHORS, type KartModel } from './kart3d';
import { INTRO_MS, type Kart, type Race, type RaceEvent, TUNE, wrapAngle } from './logic';
import type { MapScene } from './maps/types';
import { fovFor, type RaceRenderer, type SceneContent, type Viewport } from './scene';
import { blobTexture, gradientMap, kardusTexture } from './textures';

export interface Tag {
  kart: number;
  x: number;
  y: number;
  scale: number;
}

class CamRig {
  readonly cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.3, 520);
  readonly pos = new THREE.Vector3();
  readonly look = new THREE.Vector3();
  yaw = 0;
  fovKick = 0;
  shake = 0;
  ready = false;
}

interface KartVis {
  roll: number;
  lastX: number;
  lastZ: number;
  exhaustT: number;
  starT: number;
  wasOut: boolean;
}

export class RaceView implements SceneContent {
  readonly models: KartModel[] = [];
  private readonly vis: KartVis[] = [];
  private readonly smoke: Particles;
  private readonly glow: Particles;
  private readonly boxes: BoxField;
  private readonly oils = new OilField(16);
  private readonly horns = new HornRings();
  private readonly skids = new SkidMarks(500);
  private readonly shadows: Shadows;
  private readonly throwables: Throwables;
  private readonly lamps: LifeLamps | null;
  private readonly objects: THREE.Object3D[] = [];
  private readonly ghostMats = new Map<number, THREE.MeshBasicMaterial>();
  private rigs: CamRig[] = [];
  private steamT = 0;
  private fountainT = 0;
  private time = 0;
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();

  constructor(
    private readonly core: RaceRenderer,
    readonly race: Race,
    private readonly map: MapScene,
  ) {
    // Low graphics level: shorter-lived pools (older puffs are reused sooner), fewer points to draw.
    this.smoke = new Particles(core.light ? 600 : 1400, false);
    this.glow = new Particles(core.light ? 500 : 1200, true);
    race.karts.forEach((k, i) => {
      const model = core.makeKart(k.color, k.fruit, i);
      model.root.position.set(k.x, k.y, k.z);
      model.root.rotation.y = k.h;
      this.models.push(model);
      this.objects.push(model.root);
      this.vis.push({ roll: 0, lastX: k.x, lastZ: k.z, exhaustT: 0, starT: 0, wasOut: false });
    });
    this.shadows = new Shadows(race.karts.length, blobTex());
    this.boxes = new BoxField(race.boxes, kardusTex());
    const toon = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap() });
    this.throwables = new Throwables(toon);
    this.lamps = race.mode === 'arena' ? new LifeLamps(race.karts.length) : null;
    this.objects.push(
      this.shadows.mesh,
      this.boxes.mesh,
      this.boxes.ring,
      this.oils.mesh,
      this.horns.group,
      this.skids.mesh,
      this.throwables.group,
      this.smoke.points,
      this.glow.points,
    );
    if (this.lamps) this.objects.push(this.lamps.mesh);
    for (const o of this.objects) core.scene.add(o);
  }

  dispose(): void {
    for (const o of this.objects) this.core.scene.remove(o);
  }

  /* ---------------------------------------------------------------- events */

  onEvent(e: RaceEvent): void {
    const R = this.race;
    switch (e.type) {
      case 'pickup': {
        const b = R.boxes[e.box]!;
        for (let i = 0; i < 14; i++) {
          const a = Math.random() * Math.PI * 2;
          this.smoke.spawn({
            x: b.x,
            y: b.y + 1.2,
            z: b.z,
            vx: Math.cos(a) * 4,
            vy: 2 + Math.random() * 3,
            vz: Math.sin(a) * 4,
            life: 0.7,
            size: 0.28,
            color: i % 2 ? 0xc98f55 : 0x8e5b2a,
            gravity: 9,
          });
        }
        for (let i = 0; i < 10; i++) {
          const a = Math.random() * Math.PI * 2;
          this.glow.spawn({
            x: b.x,
            y: b.y + 1.3,
            z: b.z,
            vx: Math.cos(a) * 3,
            vy: Math.random() * 3,
            vz: Math.sin(a) * 3,
            life: 0.45,
            size: 0.35,
            size1: 0.05,
            color: 0xffc928,
          });
        }
        return;
      }
      case 'horn': {
        const k = R.karts[e.kart]!;
        this.horns.blast(k.x, k.y, k.z);
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          this.glow.spawn({
            x: k.x,
            y: k.y + 2.2,
            z: k.z,
            vx: Math.cos(a) * 9,
            vy: 1.5,
            vz: Math.sin(a) * 9,
            life: 0.5,
            size: 0.5,
            size1: 0.1,
            color: 0xffc928,
            drag: 3,
          });
        }
        return;
      }
      case 'hazard': {
        const o = R.hazards.find((q) => q.id === e.id);
        if (!o) return;
        for (let i = 0; i < 12; i++) {
          const a = Math.random() * Math.PI * 2;
          this.smoke.spawn({
            x: o.x,
            y: o.y + 0.6,
            z: o.z,
            vx: Math.cos(a) * 2.5,
            vy: 2 + Math.random() * 2,
            vz: Math.sin(a) * 2.5,
            life: 0.6,
            size: 0.3,
            color: e.kind === 'oil' ? 0x15171b : 0x9ab83a,
            gravity: 10,
          });
        }
        return;
      }
      case 'throw': {
        const k = R.karts[e.kart]!;
        const p = this.anchor(k, this.tmp2.set(0, 1.2, 1.4));
        for (let i = 0; i < 8; i++) {
          this.smoke.spawn({
            x: p.x,
            y: p.y,
            z: p.z,
            vx: (Math.random() - 0.5) * 3,
            vy: Math.random() * 2,
            vz: (Math.random() - 0.5) * 3,
            life: 0.5,
            size: 0.4,
            size1: 1,
            color: 0xe8e8e8,
            alpha: 0.5,
          });
        }
        return;
      }
      case 'boom': {
        for (let i = 0; i < 26; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 4 + Math.random() * 8;
          this.glow.spawn({
            x: e.x,
            y: e.y + 0.4,
            z: e.z,
            vx: Math.cos(a) * sp,
            vy: 2 + Math.random() * 7,
            vz: Math.sin(a) * sp,
            life: 0.4 + Math.random() * 0.3,
            size: 0.9,
            size1: 0.15,
            color: i % 3 === 0 ? 0xfff7f0 : i % 3 === 1 ? 0xffc928 : 0xff5a1f,
            gravity: 6,
            drag: 2,
          });
        }
        for (let i = 0; i < 14; i++) {
          this.smoke.spawn({
            x: e.x + (Math.random() - 0.5) * 2,
            y: e.y + 0.5,
            z: e.z + (Math.random() - 0.5) * 2,
            vx: (Math.random() - 0.5) * 3,
            vy: 1.5 + Math.random() * 2,
            vz: (Math.random() - 0.5) * 3,
            life: 1.2,
            size: 1.2,
            size1: 3.4,
            color: 0x8a8d94,
            alpha: 0.6,
          });
        }
        // Red paper bits of the cracker.
        for (let i = 0; i < 18; i++) {
          this.smoke.spawn({
            x: e.x,
            y: e.y + 0.6,
            z: e.z,
            vx: (Math.random() - 0.5) * 9,
            vy: 3 + Math.random() * 6,
            vz: (Math.random() - 0.5) * 9,
            life: 1.1,
            size: 0.18,
            color: 0xf2453d,
            gravity: 12,
            drag: 1,
          });
        }
        this.shakeNear(e.x, e.z, 0.5);
        return;
      }
      case 'spin':
      case 'wobble':
      case 'blocked': {
        const k = R.karts[e.kart]!;
        const col = e.type === 'blocked' ? 0xe8ecef : 0xffc928;
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          this.glow.spawn({
            x: k.x + Math.cos(a) * 0.6,
            y: k.y + 2.3,
            z: k.z + Math.sin(a) * 0.6,
            vx: Math.cos(a) * 2.5,
            vy: 1.5,
            vz: Math.sin(a) * 2.5,
            life: 0.7,
            size: 0.45,
            size1: 0.1,
            color: col,
            drag: 2,
          });
        }
        if (e.type === 'spin') {
          for (let i = 0; i < 10; i++) {
            this.smoke.spawn({
              x: k.x,
              y: k.y + 0.3,
              z: k.z,
              vx: (Math.random() - 0.5) * 4,
              vy: 1 + Math.random(),
              vz: (Math.random() - 0.5) * 4,
              life: 0.9,
              size: 0.8,
              size1: 2.2,
              color: 0xd9d4cb,
              alpha: 0.6,
            });
          }
          if (e.kind === 'durian') {
            for (let i = 0; i < 12; i++) {
              this.smoke.spawn({
                x: k.x,
                y: k.y + 1.4,
                z: k.z,
                vx: (Math.random() - 0.5) * 6,
                vy: 2 + Math.random() * 3,
                vz: (Math.random() - 0.5) * 6,
                life: 0.8,
                size: 0.32,
                color: i % 2 ? 0xb5d152 : 0xfff2a8,
                gravity: 10,
              });
            }
          }
        }
        this.shakeKart(e.kart, e.type === 'blocked' ? 0.15 : 0.4);
        return;
      }
      case 'out': {
        const k = R.karts[e.kart]!;
        for (let i = 0; i < 22; i++) {
          this.smoke.spawn({
            x: k.x + (Math.random() - 0.5) * 2,
            y: k.y + 0.5,
            z: k.z + (Math.random() - 0.5) * 3,
            vx: (Math.random() - 0.5) * 2,
            vy: 1 + Math.random() * 2.5,
            vz: (Math.random() - 0.5) * 2,
            life: 1.4,
            size: 1.2,
            size1: 3.2,
            color: 0x5b5e66,
            alpha: 0.7,
          });
        }
        return;
      }
      case 'boost': {
        const k = R.karts[e.kart]!;
        const p = this.anchor(k, KART_ANCHORS.exhaust);
        for (let i = 0; i < 10; i++) {
          this.glow.spawn({
            x: p.x,
            y: p.y,
            z: p.z,
            vx: (Math.random() - 0.5) * 3,
            vy: Math.random() * 2,
            vz: (Math.random() - 0.5) * 3,
            life: 0.35,
            size: 0.7,
            size1: 0.1,
            color: 0xffc928,
          });
        }
        return;
      }
      case 'wall': {
        const k = R.karts[e.kart]!;
        const p = this.anchor(k, this.tmp2.set(0, 0.6, 1.2));
        for (let i = 0; i < 10; i++) {
          this.glow.spawn({
            x: p.x,
            y: p.y,
            z: p.z,
            vx: (Math.random() - 0.5) * 6,
            vy: Math.random() * 4,
            vz: (Math.random() - 0.5) * 6,
            life: 0.3,
            size: 0.25,
            size1: 0.05,
            color: i % 2 ? 0xffc928 : 0xfff7f0,
            gravity: 12,
          });
        }
        this.shakeKart(e.kart, Math.min(0.4, e.power * 0.03));
        return;
      }
      case 'bump': {
        const a = R.karts[e.a]!;
        const b = R.karts[e.b]!;
        for (let i = 0; i < 8; i++) {
          this.glow.spawn({
            x: (a.x + b.x) / 2,
            y: (a.y + b.y) / 2 + 0.7,
            z: (a.z + b.z) / 2,
            vx: (Math.random() - 0.5) * 6,
            vy: Math.random() * 3,
            vz: (Math.random() - 0.5) * 6,
            life: 0.25,
            size: 0.3,
            size1: 0.05,
            color: 0xfff7f0,
            gravity: 10,
          });
        }
        this.shakeKart(e.a, 0.2);
        this.shakeKart(e.b, 0.2);
        return;
      }
      case 'land': {
        const k = R.karts[e.kart]!;
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          this.smoke.spawn({
            x: k.x + Math.cos(a) * 0.8,
            y: k.y + 0.2,
            z: k.z + Math.sin(a) * 1.2,
            vx: Math.cos(a) * 2.5,
            vy: 0.6,
            vz: Math.sin(a) * 2.5,
            life: 0.6,
            size: 0.6,
            size1: 1.6,
            color: 0xd9d4cb,
            alpha: 0.5,
          });
        }
        this.shakeKart(e.kart, Math.min(0.3, e.air * 0.4));
        return;
      }
      case 'rescue': {
        const k = R.karts[e.kart]!;
        for (let i = 0; i < 14; i++) {
          this.smoke.spawn({
            x: k.x + (Math.random() - 0.5) * 2,
            y: k.y + 0.5,
            z: k.z + (Math.random() - 0.5) * 3,
            vy: 1.5,
            life: 0.8,
            size: 1,
            size1: 2.4,
            color: 0xffffff,
            alpha: 0.7,
          });
        }
        return;
      }
      default:
        return;
    }
  }

  private shakeKart(idx: number, amount: number): void {
    this.core.viewports.forEach((v, i) => {
      if (v.kind === 'chase' && v.kart === idx && this.rigs[i])
        this.rigs[i]!.shake = Math.max(this.rigs[i]!.shake, amount);
    });
  }

  private shakeNear(x: number, z: number, amount: number): void {
    this.core.viewports.forEach((v, i) => {
      const k = this.race.karts[v.kart];
      if (v.kind !== 'chase' || !k || !this.rigs[i]) return;
      const d = Math.hypot(k.x - x, k.z - z);
      if (d < 14) this.rigs[i]!.shake = Math.max(this.rigs[i]!.shake, amount * (1 - d / 14));
    });
  }

  /** World position of a kart-local anchor (ignores tilt). */
  private anchor(k: Kart, a: THREE.Vector3): THREE.Vector3 {
    const fx = Math.sin(k.h);
    const fz = Math.cos(k.h);
    return this.tmp.set(
      k.x + Math.cos(k.h) * a.x + fx * a.z,
      k.y + a.y,
      k.z - Math.sin(k.h) * a.x + fz * a.z,
    );
  }

  /* ---------------------------------------------------------------- frame */

  update(alpha: number, dt: number, time: number): void {
    const R = this.race;
    this.time = time;
    const lights = R.phase === 'countdown' ? (R.countdown >= 2 ? 1 : 2) : R.phase === 'intro' ? 0 : 3;
    this.map.setLights(lights);
    R.karts.forEach((k, i) => {
      this.syncKart(k, i, alpha, dt, R.t);
    });
    if (dt > 0) {
      this.boxes.update(time, dt);
      this.horns.update(dt);
      this.emitAmbient(dt);
      this.smoke.update(dt);
      this.glow.update(dt);
    }
    this.oils.update(R.hazards, R.t);
    this.throwables.update(R.projectiles, R.hazards, alpha, time);
    // Petasan fuse sparks and trail.
    if (dt > 0) {
      for (const p of R.projectiles) {
        if (p.kind !== 'firecracker') continue;
        this.glow.spawn({
          x: p.x,
          y: p.y + 0.15,
          z: p.z,
          vx: (Math.random() - 0.5) * 2,
          vy: 1 + Math.random(),
          vz: (Math.random() - 0.5) * 2,
          life: 0.2,
          size: 0.35,
          size1: 0.05,
          color: Math.random() < 0.5 ? 0xffc928 : 0xff5a1f,
        });
        this.smoke.spawn({
          x: p.x,
          y: p.y,
          z: p.z,
          vy: 0.4,
          life: 0.6,
          size: 0.4,
          size1: 1.1,
          color: 0xb9bcc2,
          alpha: 0.4,
        });
      }
    }
  }

  private syncKart(k: Kart, i: number, alpha: number, dt: number, tMs: number): void {
    const m = this.models[i]!;
    const v = this.vis[i]!;
    const x = k.prevX + (k.x - k.prevX) * alpha;
    const z = k.prevZ + (k.z - k.prevZ) * alpha;
    const y = k.prevY + (k.y - k.prevY) * alpha;
    const h = k.prevH + wrapAngle(k.h - k.prevH) * alpha;
    m.root.position.set(x, y, z);
    m.root.rotation.y = h;
    const travel = Math.hypot(x - v.lastX, z - v.lastZ) * Math.sign(k.speed || 1);
    v.lastX = x;
    v.lastZ = z;
    const ease = (target: number, cur: number, rate: number) => cur + (target - cur) * Math.min(1, dt * rate);
    const speedF = Math.min(1, Math.abs(k.speed) / 20);
    v.roll = ease(-k.steer * 0.06 * speedF, v.roll, 6);
    let pitch = 0;
    if (k.airborne) pitch = -Math.atan2(k.vy, Math.max(4, Math.abs(k.speed))) * 0.6;
    else if (this.race.track) {
      const T = this.race.track;
      pitch = -Math.atan((T.heightAt(k.s + 1.5) - T.heightAt(k.s - 1.5)) / 3);
    } else if (this.race.arena) {
      const A = this.race.arena;
      const fx = Math.sin(h);
      const fz = Math.cos(h);
      pitch = -Math.atan(
        (A.heightAt(x + fx * 1.2, z + fz * 1.2) - A.heightAt(x - fx * 1.2, z - fz * 1.2)) / 2.4,
      );
    }
    // Brake dive and launch squat.
    if (k.braking) pitch += 0.03;
    else if (k.gas && k.speed < 8) pitch -= 0.02;
    const spin = k.spinT > 0 ? (1 - (k.spinT / TUNE.spinS) ** 2) * Math.PI * 4 : 0;
    m.pose({
      steer: k.steer,
      slide: 0,
      hop: 0,
      roll: v.roll,
      pitch,
      spinYaw: spin,
      travel,
      wobble: k.wobbleT > 0 ? 1 : 0,
      shield: k.shield,
      t: tMs,
      boost: k.boostT > 0 ? 1 : 0,
      brake: k.braking,
    });
    const blink = (k.rescueT > 0 || k.invulnT > 0) && Math.floor(tMs / 90) % 2 === 0;
    m.root.visible = !k.out && !blink;
    this.shadows.set(i, x, k.airborne ? this.groundY(k) : y, z, h, k.out ? 0.001 : 1.9, k.out ? 0.001 : 3.2);
    if (this.lamps) this.lamps.set(i, x, y, z, h, k.lives, !k.out, k.invulnT > 0);

    if (dt <= 0 || k.out) return;
    // Exhaust: puffs harder on the gas.
    v.exhaustT -= dt;
    if (v.exhaustT <= 0) {
      v.exhaustT = k.gas ? 0.045 : 0.12;
      const p = this.anchor(k, KART_ANCHORS.exhaust);
      const fx = Math.sin(h);
      const fz = Math.cos(h);
      this.smoke.spawn({
        x: p.x,
        y: p.y,
        z: p.z,
        vx: -fx * 2 + (Math.random() - 0.5),
        vy: 0.8 + Math.random() * 0.5,
        vz: -fz * 2 + (Math.random() - 0.5),
        life: 0.7,
        size: 0.3,
        size1: k.gas ? 1.2 : 0.8,
        color: 0xa9adb5,
        alpha: k.gas ? 0.45 : 0.3,
        drag: 1.5,
      });
    }
    // Brake lights and the reversing lamp.
    if (k.braking || k.speed < -0.5) {
      for (const sx of [-1, 1]) {
        const p = this.anchor(k, this.tmp2.set(sx * 0.47, 0.72, -1.5));
        this.glow.spawn({
          x: p.x,
          y: p.y,
          z: p.z,
          life: 0.06,
          size: 0.7,
          size1: 0.6,
          color: k.speed < -0.5 ? 0xfff7f0 : 0xff2a1f,
          alpha: 0.9,
        });
      }
    }
    if (k.boostT > 0) {
      const p = this.anchor(k, KART_ANCHORS.exhaust);
      const fx = Math.sin(h);
      const fz = Math.cos(h);
      for (let n = 0; n < 3; n++) {
        this.glow.spawn({
          x: p.x,
          y: p.y,
          z: p.z,
          vx: -fx * 7 + (Math.random() - 0.5) * 1.5,
          vy: Math.random() * 0.8,
          vz: -fz * 7 + (Math.random() - 0.5) * 1.5,
          life: 0.18 + Math.random() * 0.08,
          size: 0.75,
          size1: 0.15,
          color: n % 2 ? 0xffc928 : 0xff5a1f,
        });
      }
    }
    // Spinning: stars circle over the driver.
    if (k.spinT > 0 || k.wobbleT > 0) {
      v.starT -= dt;
      if (v.starT <= 0) {
        v.starT = 0.05;
        const a = this.time * 9 + i;
        this.glow.spawn({
          x: x + Math.cos(a) * 0.7,
          y: y + 2.35,
          z: z + Math.sin(a) * 0.7,
          vx: -Math.sin(a) * 2,
          vy: 0.2,
          vz: Math.cos(a) * 2,
          life: 0.35,
          size: 0.42,
          size1: 0.12,
          color: 0xffc928,
        });
      }
    }
    // Hard braking leaves rubber; a spin smokes the tyres.
    if ((k.braking && k.speed > 10) || k.spinT > 0) {
      for (const a of [KART_ANCHORS.rearLeft, KART_ANCHORS.rearRight]) {
        const p = this.anchor(k, a);
        if (Math.random() < 0.35) this.skids.add(p.x, k.y, p.z, h, this.time);
        if (k.spinT > 0 && Math.random() < 0.4)
          this.smoke.spawn({
            x: p.x,
            y: p.y + 0.1,
            z: p.z,
            vy: 0.5,
            life: 0.5,
            size: 0.5,
            size1: 1.4,
            color: 0xe8e8e8,
            alpha: 0.4,
          });
      }
    }
    if (k.offroad && Math.abs(k.speed) > 4 && Math.random() < 0.6) {
      const p = this.anchor(k, KART_ANCHORS.rearLeft);
      this.smoke.spawn({
        x: p.x,
        y: p.y + 0.2,
        z: p.z,
        vx: (Math.random() - 0.5) * 2,
        vy: 1.2,
        vz: (Math.random() - 0.5) * 2,
        life: 0.8,
        size: 0.5,
        size1: 1.8,
        color: 0xc8b28a,
        alpha: 0.55,
      });
    }
  }

  private groundY(k: Kart): number {
    if (this.race.arena) return this.race.arena.heightAt(k.x, k.z);
    return this.race.track!.project(k.x, k.z, k.hint, 3).y;
  }

  private emitAmbient(dt: number): void {
    const near = (p: THREE.Vector3, r: number) =>
      this.rigs.some((g, i) => i < this.core.viewports.length && g.cam.position.distanceToSquared(p) < r * r);
    this.steamT -= dt;
    if (this.steamT <= 0) {
      this.steamT = 0.12;
      for (const s of this.map.steam) {
        if (!near(s, 110)) continue;
        this.smoke.spawn({
          x: s.x + (Math.random() - 0.5) * 0.3,
          y: s.y,
          z: s.z + (Math.random() - 0.5) * 0.3,
          vx: (Math.random() - 0.5) * 0.3,
          vy: 1.1,
          life: 1.6,
          size: 0.35,
          size1: 1.4,
          color: 0xffffff,
          alpha: 0.45,
          drag: 0.5,
        });
      }
    }
    const f = this.map.fountain;
    if (f && near(f, 260)) {
      this.fountainT -= dt;
      while (this.fountainT <= 0) {
        this.fountainT += 0.012;
        const a = Math.random() * Math.PI * 2;
        const ring = Math.random() < 0.5;
        const r = ring ? 6.5 : 0.4;
        this.smoke.spawn({
          x: f.x + Math.cos(a) * r,
          y: ring ? f.y - 1.3 : f.y + 0.8,
          z: f.z + Math.sin(a) * r,
          vx: ring ? -Math.cos(a) * 1.2 : Math.cos(a) * 1.2,
          vy: ring ? 5 : 9,
          vz: ring ? -Math.sin(a) * 1.2 : Math.sin(a) * 1.2,
          life: ring ? 1.0 : 1.7,
          size: 0.35,
          size1: 0.6,
          color: 0xdff3ff,
          alpha: 0.85,
          gravity: 9.8,
        });
      }
    }
  }

  /* ---------------------------------------------------------------- per viewport */

  beforeViewport(
    _vi: number,
    vp: Viewport,
    cam: THREE.PerspectiveCamera,
    heightPx: number,
  ): (() => void) | undefined {
    this.smoke.setViewportHeight(heightPx);
    this.glow.setViewportHeight(heightPx);
    const hidden: KartModel[] = [];
    const swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
    const ghost = this.race.mode === 'time';
    this.models.forEach((m, mi) => {
      if (!m.root.visible) return;
      const own = vp.kind === 'chase' && mi === vp.kart;
      if (own) return;
      // Karts right in front of a chase camera would fill the screen.
      if (vp.kind === 'chase' && m.root.position.distanceToSquared(cam.position) < 4.6 * 4.6) {
        m.root.visible = false;
        hidden.push(m);
        return;
      }
      if (ghost && vp.kind !== 'broadcast') {
        const mat = this.ghostMat(mi);
        m.root.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          swapped.push([mesh, mesh.material]);
          mesh.material = mat;
        });
      }
    });
    if (!hidden.length && !swapped.length) return undefined;
    return () => {
      for (const m of hidden) m.root.visible = true;
      for (const [mesh, mat] of swapped) mesh.material = mat;
    };
  }

  private ghostMat(i: number): THREE.MeshBasicMaterial {
    let m = this.ghostMats.get(i);
    if (!m) {
      m = new THREE.MeshBasicMaterial({
        color: this.race.karts[i]!.color,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      });
      this.ghostMats.set(i, m);
    }
    return m;
  }

  camera(vi: number, vp: Viewport, dt: number, alpha: number): THREE.PerspectiveCamera {
    while (this.rigs.length <= vi) this.rigs.push(new CamRig());
    const rig = this.rigs[vi]!;
    this.updateCamera(rig, vp, dt, alpha);
    return rig.cam;
  }

  /** Forget camera positions (layout changed). */
  resetCameras(): void {
    for (const r of this.rigs) r.ready = false;
  }

  private updateCamera(rig: CamRig, vp: Viewport, dt: number, alpha: number): void {
    const R = this.race;
    const cam = rig.cam;
    const aspect = vp.w / vp.h;
    cam.aspect = aspect;
    const k = dt > 0 ? 1 - Math.exp(-dt * 7) : rig.ready ? 0 : 1;
    if (vp.kind === 'free' && vp.free) {
      cam.position.copy(vp.free.pos);
      cam.fov = vp.free.fov;
      cam.updateProjectionMatrix();
      cam.lookAt(vp.free.look);
      return;
    }
    if (vp.kind === 'chase') {
      const kart = R.karts[vp.kart]!;
      if (kart.out) {
        this.overviewCamera(rig, vp, dt, k);
        return;
      }
      const x = kart.prevX + (kart.x - kart.prevX) * alpha;
      const z = kart.prevZ + (kart.z - kart.prevZ) * alpha;
      const yRaw = kart.prevY + (kart.y - kart.prevY) * alpha;
      // Don't bob the camera with every hop: follow the ground under the kart.
      const y = kart.airborne ? Math.max(this.groundY(kart), yRaw - 0.8) : yRaw;
      const h = kart.prevH + wrapAngle(kart.h - kart.prevH) * alpha;
      // While reversing the camera keeps looking the way the bajaj faces.
      if (!rig.ready) rig.yaw = h;
      else rig.yaw += wrapAngle(h - rig.yaw) * Math.min(1, dt * 4.5);
      let yaw = rig.yaw;
      let dist = 6.3;
      let height = 2.5;
      if (R.phase === 'intro') {
        const t = Math.min(1, R.phaseT / (INTRO_MS - 300));
        const e = t * t * (3 - 2 * t);
        yaw = h + Math.PI * (1 - e) * (vp.kart % 2 ? -1 : 1);
        dist = 7.2 - 0.9 * e;
        height = 2.1 + 0.4 * e;
      } else if (R.phase === 'results' || kart.finishT !== null) {
        yaw = h + Math.sin(this.time * 0.25) * 0.9 + 0.5;
        dist = 7.5;
        height = 2.6;
      }
      const tx = x - Math.sin(yaw) * dist;
      const tz = z - Math.cos(yaw) * dist;
      const ty = y + height;
      if (!rig.ready || R.phase === 'intro') rig.pos.set(tx, ty, tz);
      else {
        rig.pos.x += (tx - rig.pos.x) * Math.min(1, k * 1.6);
        rig.pos.z += (tz - rig.pos.z) * Math.min(1, k * 1.6);
        rig.pos.y += (ty - rig.pos.y) * k;
      }
      const lx = x + Math.sin(h) * 4.5;
      const lz = z + Math.cos(h) * 4.5;
      const ly = y + 1.3;
      if (!rig.ready || R.phase === 'intro') rig.look.set(lx, ly, lz);
      else rig.look.lerp(this.tmp2.set(lx, ly, lz), Math.min(1, k * 2));
      rig.ready = true;
      const kick = kart.boostT > 0 ? 9 : 0;
      rig.fovKick += (kick - rig.fovKick) * Math.min(1, dt * 6);
      const base = aspect > 2.5 ? 98 : aspect < 1.2 ? 74 : 84;
      cam.fov = fovFor(aspect, base) + rig.fovKick;
      cam.position.copy(rig.pos);
      if (rig.shake > 0) {
        cam.position.x += (Math.random() - 0.5) * rig.shake;
        cam.position.y += (Math.random() - 0.5) * rig.shake;
        rig.shake = Math.max(0, rig.shake - dt * 1.6);
      }
      cam.updateProjectionMatrix();
      cam.lookAt(rig.look);
      return;
    }
    if (R.arena) {
      this.overviewCamera(rig, vp, dt, k);
      return;
    }
    // Broadcast / overview on circuits: follow the humans' pack (or the leader).
    const T = R.track!;
    const humans = R.karts.filter((q) => q.human);
    const group = humans.length ? humans : R.karts;
    const focus = vp.kind === 'overview' ? [R.karts[R.order[0] ?? 0]!] : group;
    let minU = Infinity;
    let maxU = -Infinity;
    for (const q of focus) {
      minU = Math.min(minU, q.u);
      maxU = Math.max(maxU, q.u);
    }
    const spread = Math.min(120, maxU - minU);
    const sFocus = minU + spread * 0.6;
    const f = T.frame(sFocus);
    const overview = vp.kind === 'overview';
    const back = overview ? 34 : Math.max(20, 16 + spread * 0.55);
    const up = overview ? 30 : Math.max(14, back * 0.7);
    const fwd = overview ? 8 : spread * 0.25;
    const behind = T.frame(sFocus - back);
    const tx = behind.x + (overview ? -f.tz * 18 : 0);
    const tz = behind.z + (overview ? f.tx * 18 : 0);
    const ty = f.y + up;
    const ahead = T.frame(sFocus + fwd);
    if (!rig.ready || R.phase === 'intro') {
      rig.pos.set(tx, ty, tz);
      rig.look.set(ahead.x, ahead.y + 1, ahead.z);
      rig.ready = true;
    } else {
      const kk = Math.min(1, k * 0.6);
      rig.pos.lerp(this.tmp2.set(tx, ty, tz), kk);
      rig.look.lerp(this.tmp2.set(ahead.x, ahead.y + 1, ahead.z), kk);
    }
    cam.fov = fovFor(aspect, overview ? 70 : 78);
    cam.position.copy(rig.pos);
    cam.updateProjectionMatrix();
    cam.lookAt(rig.look);
  }

  /** Arena (and eliminated players): a high camera over whoever is still fighting. */
  private overviewCamera(rig: CamRig, vp: Viewport, dt: number, k: number): void {
    const R = this.race;
    const cam = rig.cam;
    let cx = 0;
    let cz = 0;
    let n = 0;
    let spread = 0;
    for (const q of R.karts) {
      if (q.out) continue;
      cx += q.x;
      cz += q.z;
      n++;
    }
    if (n) {
      cx /= n;
      cz /= n;
      for (const q of R.karts) if (!q.out) spread = Math.max(spread, Math.hypot(q.x - cx, q.z - cz));
    }
    const ang = this.time * 0.08 + (vp.kind === 'overview' ? 0.8 : 0);
    const dist = Math.max(30, 18 + spread * 1.1);
    const tx = cx + Math.sin(ang) * dist * 0.75;
    const tz = cz + Math.cos(ang) * dist * 0.75;
    const ty = dist * 0.85 + 6;
    if (!rig.ready) {
      rig.pos.set(tx, ty, tz);
      rig.look.set(cx, 0, cz);
      rig.ready = true;
    } else {
      const kk = Math.min(1, k * 0.5);
      rig.pos.lerp(this.tmp2.set(tx, ty, tz), kk);
      rig.look.lerp(this.tmp2.set(cx, 0, cz), kk);
    }
    cam.aspect = vp.w / vp.h;
    cam.fov = fovFor(cam.aspect, 72);
    cam.position.copy(rig.pos);
    cam.updateProjectionMatrix();
    cam.lookAt(rig.look);
    void dt;
  }

  /** Screen positions (stage px) of name tags over karts visible in viewport `vi`. */
  tags(vi: number, maxDist = 75): Tag[] {
    const vp = this.core.viewports[vi];
    const rig = this.rigs[vi];
    if (!vp || !rig) return [];
    const out: Tag[] = [];
    const cam = rig.cam;
    this.race.karts.forEach((k, i) => {
      if ((vp.kind === 'chase' && i === vp.kart) || k.out) return;
      const m = this.models[i]!;
      const p = this.tmp.copy(m.root.position).add(this.tmp2.set(0, this.race.arena ? 3.3 : 2.6, 0));
      const dist = p.distanceTo(cam.position);
      if (dist > maxDist) return;
      p.project(cam);
      if (p.z > 1 || p.x < -1.1 || p.x > 1.1 || p.y < -1.1 || p.y > 1.2) return;
      out.push({
        kart: i,
        x: vp.x + ((p.x + 1) / 2) * vp.w,
        y: vp.y + ((1 - p.y) / 2) * vp.h,
        scale: Math.max(0.55, Math.min(1, 14 / dist)),
      });
    });
    return out;
  }
}

/* ---------------------------------------------------------------- shared textures */

let blob: THREE.Texture | null = null;
let kardus: THREE.Texture | null = null;
function blobTex(): THREE.Texture {
  if (!blob) blob = blobTexture();
  return blob;
}
function kardusTex(): THREE.Texture {
  if (!kardus) kardus = kardusTexture();
  return kardus;
}
