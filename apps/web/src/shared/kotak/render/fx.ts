/**
 * Particle effects of the box world, all little cubes in one instanced mesh (one draw call):
 * landing dust, crumbling debris, confetti bursts, a respawn sparkle and fall streaks. The pool
 * size follows the graphics level; when it is full the oldest particle is reused.
 */
import * as THREE from 'three';
import type { GfxTier } from '../../../games/common/gfx';

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  grow: number;
  gravity: number;
  spin: number;
  drag: number;
}

const POOL: Record<GfxTier, number> = { low: 140, medium: 320, high: 520 };
const CONFETTI = ['#FFC928', '#FF5A1F', '#2F8CFF', '#22B35E', '#FF5C9A', '#FFFFFF'];

export class KotakFx {
  readonly mesh: THREE.InstancedMesh;
  private readonly parts: (Particle | null)[];
  private next = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly s = new THREE.Vector3();
  private readonly p = new THREE.Vector3();
  private readonly c = new THREE.Color();
  /** Particle count scale for the level (fewer on low). */
  readonly amount: number;

  constructor(level: GfxTier) {
    const n = POOL[level];
    this.amount = level === 'low' ? 0.45 : level === 'medium' ? 0.75 : 1;
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95 }),
      n,
    );
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.parts = new Array<Particle | null>(n).fill(null);
    for (let i = 0; i < n; i++) {
      this.mesh.setColorAt(i, this.c.set('#ffffff'));
      this.m.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, this.m);
    }
  }

  private spawn(color: string, init: Omit<Particle, 'life'>): void {
    const i = this.next;
    this.next = (this.next + 1) % this.parts.length;
    this.parts[i] = { ...init, life: 0 };
    this.mesh.setColorAt(i, this.c.set(color));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private count(n: number): number {
    return Math.max(1, Math.round(n * this.amount));
  }

  /** Grey puffs around the feet (landing, sliding, bumping). */
  dust(x: number, y: number, z: number, strength = 1, color = '#E9E2D6'): void {
    const n = this.count(6 + strength * 6);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const sp = 1.2 + Math.random() * 1.6 * strength;
      this.spawn(color, {
        x: x + Math.cos(a) * 0.25,
        y: y + 0.08,
        z: z + Math.sin(a) * 0.25,
        vx: Math.cos(a) * sp,
        vy: 0.6 + Math.random() * 0.8,
        vz: Math.sin(a) * sp,
        max: 0.45 + Math.random() * 0.25,
        size: 0.12 + Math.random() * 0.08,
        grow: 0.35,
        gravity: -1.2,
        spin: 2,
        drag: 4,
      });
    }
  }

  /** Chunks breaking off a crumbling solid of size (w, d) centred at (x, y, z). */
  debris(x: number, y: number, z: number, w: number, d: number, color: string): void {
    const n = this.count(14);
    for (let i = 0; i < n; i++) {
      this.spawn(i % 3 === 0 ? '#FFF7F0' : color, {
        x: x + (Math.random() - 0.5) * w,
        y: y + Math.random() * 0.2,
        z: z + (Math.random() - 0.5) * d,
        vx: (Math.random() - 0.5) * 2.4,
        vy: 1 + Math.random() * 2.2,
        vz: (Math.random() - 0.5) * 2.4,
        max: 0.9 + Math.random() * 0.5,
        size: 0.14 + Math.random() * 0.16,
        grow: -0.08,
        gravity: 18,
        spin: 8,
        drag: 0.4,
      });
    }
  }

  /** A burst of confetti (finish, round win). */
  confetti(x: number, y: number, z: number, power = 1): void {
    const n = this.count(40 * power);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = 5 + Math.random() * 5 * power;
      const out = 1 + Math.random() * 3.5;
      this.spawn(CONFETTI[i % CONFETTI.length]!, {
        x,
        y,
        z,
        vx: Math.cos(a) * out,
        vy: up,
        vz: Math.sin(a) * out,
        max: 1.6 + Math.random() * 0.8,
        size: 0.1 + Math.random() * 0.06,
        grow: 0,
        gravity: 9,
        spin: 10,
        drag: 1.4,
      });
    }
  }

  /** Rising sparkle in the player's colour (respawn, save point). */
  sparkle(x: number, y: number, z: number, color: string): void {
    const n = this.count(16);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.spawn(i % 2 ? color : '#FFFFFF', {
        x: x + Math.cos(a) * 0.55,
        y: y + 0.1 + Math.random() * 0.4,
        z: z + Math.sin(a) * 0.55,
        vx: Math.cos(a) * 0.3,
        vy: 2 + Math.random() * 1.5,
        vz: Math.sin(a) * 0.3,
        max: 0.8 + Math.random() * 0.3,
        size: 0.09 + Math.random() * 0.05,
        grow: -0.08,
        gravity: -0.5,
        spin: 6,
        drag: 1.5,
      });
    }
  }

  /** Small streak of puffs where a player tumbled off the world. */
  fall(x: number, y: number, z: number, color: string): void {
    const n = this.count(10);
    for (let i = 0; i < n; i++) {
      this.spawn(i % 2 ? color : '#FFF7F0', {
        x: x + (Math.random() - 0.5) * 0.6,
        y: y + Math.random() * 0.8,
        z: z + (Math.random() - 0.5) * 0.6,
        vx: (Math.random() - 0.5) * 1.5,
        vy: 2.5 + Math.random() * 2,
        vz: (Math.random() - 0.5) * 1.5,
        max: 0.7,
        size: 0.14,
        grow: -0.15,
        gravity: 4,
        spin: 6,
        drag: 1,
      });
    }
  }

  update(dt: number): void {
    const parts = this.parts;
    let dirty = false;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!p) continue;
      dirty = true;
      p.life += dt;
      if (p.life >= p.max) {
        parts[i] = null;
        this.m.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, this.m);
        continue;
      }
      const drag = Math.exp(-p.drag * dt);
      p.vx *= drag;
      p.vz *= drag;
      p.vy = p.vy * drag - p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const k = 1 - p.life / p.max;
      const size = Math.max(0.001, (p.size + p.grow * p.life) * Math.min(1, k * 3));
      this.e.set(p.life * p.spin, p.life * p.spin * 0.7, 0);
      this.q.setFromEuler(this.e);
      this.s.set(size, size, size);
      this.p.set(p.x, p.y, p.z);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    for (let i = 0; i < this.parts.length; i++) {
      this.parts[i] = null;
      this.m.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
