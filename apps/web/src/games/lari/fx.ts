/**
 * Effects: dust kicked up by feet, landings and slides; gold sparkles for coins; dizzy stars on a
 * stumble; soft contact shadows under every runner; and speed lines streaming past the camera
 * once the pack is fast. Pooled and instanced, no allocation per frame.
 */
import * as THREE from 'three';
import { Particles, Shadows } from '../bajaj/fx';
import { blobTexture } from '../bajaj/textures';
import { streakTexture } from './textures';

const DUST = 0xd9c3a2;
const GOLD = 0xffd25a;
const STAR = 0xfff1a8;

const STREAKS = 36;
/** Low graphics level: fewer speed lines (each is a blended layer) and smaller particle pools. */
const LOW_STREAKS = 14;

export class Effects {
  readonly root = new THREE.Group();
  readonly dust: Particles;
  readonly sparks: Particles;
  readonly shadows: Shadows;
  private readonly streaks: THREE.InstancedMesh;
  private readonly streakPos = new Float32Array(STREAKS * 3);
  private readonly streakLen = new Float32Array(STREAKS);
  private readonly streakMat: THREE.MeshBasicMaterial;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private seed = 1;

  constructor(maxRunners: number, low = false) {
    this.dust = new Particles(low ? 200 : 480, false);
    this.sparks = new Particles(low ? 150 : 360, true);
    this.shadows = new Shadows(maxRunners, blobTexture());
    this.root.add(this.dust.points, this.sparks.points, this.shadows.mesh);
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    this.streakMat = new THREE.MeshBasicMaterial({
      map: streakTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    this.streaks = new THREE.InstancedMesh(g, this.streakMat, STREAKS);
    this.streaks.frustumCulled = false;
    this.streaks.renderOrder = 8;
    this.streaks.count = low ? LOW_STREAKS : STREAKS;
    for (let i = 0; i < STREAKS; i++) this.respawnStreak(i, true);
    this.root.add(this.streaks);
  }

  private rnd(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  setViewportHeight(px: number): void {
    this.dust.setViewportHeight(px);
    this.sparks.setViewportHeight(px);
  }

  /* ---------------------------------------------------------------- spawns */

  /** A small puff at a foot strike. */
  step(x: number, z: number, speed: number): void {
    this.dust.spawn({
      x: x + (this.rnd() - 0.5) * 0.2,
      y: 0.05,
      z,
      vx: (this.rnd() - 0.5) * 0.6,
      vy: 0.4 + this.rnd() * 0.5,
      vz: speed * 0.12,
      life: 0.45,
      size: 0.18,
      size1: 0.5,
      color: DUST,
      alpha: 0.35,
      drag: 2,
    });
  }

  land(x: number, z: number): void {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      this.dust.spawn({
        x: x + Math.cos(a) * 0.2,
        y: 0.06,
        z: z + Math.sin(a) * 0.2,
        vx: Math.cos(a) * 1.6,
        vy: 0.5 + this.rnd() * 0.4,
        vz: Math.sin(a) * 1.6,
        life: 0.55,
        size: 0.25,
        size1: 0.75,
        color: DUST,
        alpha: 0.45,
        drag: 3,
      });
    }
  }

  slide(x: number, z: number): void {
    for (let i = 0; i < 2; i++)
      this.dust.spawn({
        x: x + (this.rnd() - 0.5) * 0.5,
        y: 0.08,
        z: z + 0.3,
        vx: (this.rnd() - 0.5) * 1.2,
        vy: 0.6 + this.rnd() * 0.6,
        vz: 1.5,
        life: 0.6,
        size: 0.3,
        size1: 0.9,
        color: DUST,
        alpha: 0.4,
        drag: 2.5,
      });
  }

  coin(x: number, y: number, z: number): void {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      this.sparks.spawn({
        x,
        y,
        z,
        vx: Math.cos(a) * 2.2,
        vy: Math.sin(a) * 2.2 + 1,
        vz: (this.rnd() - 0.5) * 1.5,
        life: 0.45,
        size: 0.16,
        size1: 0.02,
        color: GOLD,
        gravity: 3,
        drag: 2,
      });
    }
    this.sparks.spawn({ x, y, z, life: 0.25, size: 0.4, size1: 1.3, color: GOLD, alpha: 0.7 });
  }

  /** A stumble: a dust burst and stars circling above the head. */
  stumble(x: number, z: number): void {
    this.land(x, z);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      this.sparks.spawn({
        x: x + Math.cos(a) * 0.35,
        y: 2.0,
        z: z + Math.sin(a) * 0.35,
        vx: -Math.sin(a) * 1.4,
        vy: 0.3,
        vz: Math.cos(a) * 1.4,
        life: 0.8,
        size: 0.17,
        size1: 0.08,
        color: STAR,
      });
    }
  }

  /* ---------------------------------------------------------------- per frame */

  private respawnStreak(i: number, anywhere: boolean): void {
    const side = this.rnd() < 0.5 ? -1 : 1;
    this.streakPos[i * 3] = side * (2.5 + this.rnd() * 6);
    this.streakPos[i * 3 + 1] = (this.rnd() - 0.5) * 6;
    this.streakPos[i * 3 + 2] = anywhere ? -this.rnd() * 40 : -30 - this.rnd() * 12;
    this.streakLen[i] = 2.5 + this.rnd() * 4;
  }

  /**
   * Advance particles and speed lines. Speed lines live in camera space (x right, y up,
   * -z ahead) and fade in from `strength` 0..1.
   */
  update(dt: number, camera: THREE.Camera, speed: number, strength: number): void {
    this.dust.update(dt);
    this.sparks.update(dt);
    const target = Math.max(0, Math.min(1, strength)) * 0.28;
    this.streakMat.opacity += (target - this.streakMat.opacity) * Math.min(1, dt * 3);
    this.streaks.visible = this.streakMat.opacity > 0.01;
    if (!this.streaks.visible) return;
    for (let i = 0; i < this.streaks.count; i++) {
      this.streakPos[i * 3 + 2]! += speed * 1.6 * dt;
      if (this.streakPos[i * 3 + 2]! > 2) this.respawnStreak(i, false);
      this.v.set(this.streakPos[i * 3]!, this.streakPos[i * 3 + 1]!, this.streakPos[i * 3 + 2]!);
      this.v.applyMatrix4(camera.matrixWorld);
      // Streaks lie along the camera's view direction.
      this.q.copy(camera.quaternion);
      this.s.set(0.05, 1, this.streakLen[i]!);
      this.m.compose(this.v, this.q, this.s);
      this.streaks.setMatrixAt(i, this.m);
    }
    this.streaks.instanceMatrix.needsUpdate = true;
  }
}
