/**
 * The box world simulation: upright cylinder bodies (the players) against box solids, at a fixed
 * 60 Hz step so every main screen plays the same way whatever its frame rate.
 *
 * Movement is tuned like a modern platformer on a phone stick: quick acceleration, instant turns,
 * a fixed jump with coyote time (jump just after walking off an edge) and a jump buffer (a press
 * just before landing still jumps). Standing on a moving or turning solid carries the body along;
 * conveyors add their surface speed; springs launch; sweeper bars knock players away; fragile
 * floor crumbles a moment after it is stepped on.
 *
 * Pure TypeScript (no three.js): games and their tests drive it directly; the renderer reads
 * `prev`/`pos` with `alpha` to interpolate between steps.
 */
import { clamp, copy, type V3, v3 } from './math';
import {
  isSolidNow,
  type Pose,
  poseAt,
  type Solid,
  type SolidDef,
  surfaceVelocity,
  toLocal,
  topOf,
  toWorld,
} from './solids';

export const STEP = 1 / 60;
/** Longest catch-up per `advance` call; beyond that the world slows down instead of stuttering. */
const MAX_STEPS = 6;

export interface Tuning {
  /** Body radius and height (m). */
  radius: number;
  height: number;
  /** Top running speed (m/s). */
  speed: number;
  /** Ground and air acceleration (m/s²). */
  accel: number;
  airAccel: number;
  /** Ground braking when the stick is released (m/s²). */
  brake: number;
  gravity: number;
  jumpSpeed: number;
  /** Seconds after leaving an edge during which a jump still counts. */
  coyote: number;
  /** Seconds a jump press is remembered before landing. */
  buffer: number;
  /** Highest step climbed without jumping (m). */
  stepUp: number;
  /** Sweeper hit: push speed away from the bar and stun time. */
  sweepPush: number;
  stun: number;
  /** Below this height a body counts as fallen. */
  killY: number;
  /** Players push each other apart when they touch (0 = ghosts). */
  crowd: number;
}

export const DEFAULT_TUNING: Tuning = {
  radius: 0.38,
  height: 1.5,
  speed: 6.2,
  accel: 62,
  airAccel: 30,
  brake: 48,
  gravity: 32,
  jumpSpeed: 11.2,
  coyote: 0.11,
  buffer: 0.14,
  stepUp: 0.32,
  sweepPush: 9,
  stun: 0.45,
  killY: -12,
  crowd: 1,
};

export interface BodyInit {
  id: number;
  pos: V3;
  yaw?: number;
}

export interface Body {
  readonly id: number;
  readonly pos: V3;
  /** Position at the previous step (interpolation). */
  readonly prev: V3;
  readonly vel: V3;
  /** Facing (radians, 0 = towards +x... see `faceYaw`), turned towards the stick at once. */
  yaw: number;
  prevYaw: number;
  /** Solid id under the feet, or -1 in the air. */
  ground: number;
  /** Stick, each axis -1..1 (+x right, +z towards the viewer). */
  moveX: number;
  moveZ: number;
  /** Time left to still jump after leaving the ground. */
  coyoteLeft: number;
  /** Time left of a buffered jump press. */
  bufferLeft: number;
  /** Seconds of reduced control after a knock. */
  stunLeft: number;
  /** Frozen in place (respawn pause): no input, no gravity. */
  frozenLeft: number;
  /** Off: not simulated (fallen out of a round, waiting). */
  active: boolean;
  /** Highest y since the last landing (for "highest jump" stats). */
  peakY: number;
  /** Set while the body has fallen below `killY` until the game moves it. */
  fallen: boolean;
  /**
   * Traction lost this step (0..1), set by outside forces such as a rope dragging the body: the
   * stick and the brakes only get `1 - 0.85 * slip` of their grip on the ground.
   */
  slip: number;
}

export type SimEvent =
  | { k: 'jump'; id: number }
  | { k: 'land'; id: number; speed: number; solid: number }
  | { k: 'spring'; id: number; solid: number }
  | { k: 'sweep'; id: number; solid: number }
  | { k: 'bump'; a: number; b: number; speed: number }
  | { k: 'shove'; id: number; by: number }
  | { k: 'crack'; solid: number }
  | { k: 'vanish'; solid: number }
  | { k: 'restore'; solid: number }
  | { k: 'fall'; id: number };

/** Faces along the movement on the ground plane: yaw 0 looks towards +z (the viewer). */
export function faceYaw(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

export class KotakSim {
  readonly solids: Solid[] = [];
  readonly bodies: Body[] = [];
  readonly tuning: Tuning;
  /** Simulation time (s). */
  t = 0;
  private acc = 0;
  private events: SimEvent[] = [];
  private readonly poses: Pose[] = [];
  private readonly prevPoses: Pose[] = [];
  /**
   * Runs at the end of every fixed step, after bodies moved and collided: constraints that tie
   * bodies together (a rope) or game rules that need the 60 Hz step (climbing).
   */
  afterStep: ((dt: number) => void) | null = null;

  constructor(tuning: Partial<Tuning> = {}) {
    this.tuning = { ...DEFAULT_TUNING, ...tuning };
  }

  /* ------------------------------------------------------------------ setup */

  addSolid(def: SolidDef): Solid {
    const s: Solid = { id: this.solids.length, def, state: 'solid', until: Infinity, since: 0, goneFor: 0 };
    this.solids.push(s);
    this.poses.push(poseAt(def, this.t));
    this.prevPoses.push(poseAt(def, this.t));
    return s;
  }

  addBody(init: BodyInit): Body {
    const b: Body = {
      id: init.id,
      pos: { ...init.pos },
      prev: { ...init.pos },
      vel: v3(),
      yaw: init.yaw ?? 0,
      prevYaw: init.yaw ?? 0,
      ground: -1,
      moveX: 0,
      moveZ: 0,
      coyoteLeft: 0,
      bufferLeft: 0,
      stunLeft: 0,
      frozenLeft: 0,
      active: true,
      peakY: init.pos.y,
      fallen: false,
      slip: 0,
    };
    this.bodies.push(b);
    return b;
  }

  body(id: number): Body | undefined {
    return this.bodies.find((b) => b.id === id);
  }

  removeBody(id: number): void {
    const i = this.bodies.findIndex((b) => b.id === id);
    if (i >= 0) this.bodies.splice(i, 1);
  }

  /** Put a body somewhere at rest (respawn), optionally frozen for `freeze` seconds. */
  place(id: number, pos: V3, yaw = 0, freeze = 0): void {
    const b = this.body(id);
    if (!b) return;
    copy(b.pos, pos);
    copy(b.prev, pos);
    b.vel.x = 0;
    b.vel.y = 0;
    b.vel.z = 0;
    b.yaw = yaw;
    b.prevYaw = yaw;
    b.ground = -1;
    b.coyoteLeft = 0;
    b.bufferLeft = 0;
    b.stunLeft = 0;
    b.frozenLeft = freeze;
    b.peakY = pos.y;
    b.fallen = false;
    b.slip = 0;
    b.active = true;
  }

  /* ------------------------------------------------------------------ input */

  setMove(id: number, x: number, z: number): void {
    const b = this.body(id);
    if (!b) return;
    const len = Math.hypot(x, z);
    const k = len > 1 ? 1 / len : 1;
    b.moveX = Number.isFinite(x) ? x * k : 0;
    b.moveZ = Number.isFinite(z) ? z * k : 0;
  }

  /** A jump press; buffered so a press just before landing still jumps. */
  jump(id: number): void {
    const b = this.body(id);
    if (b?.active && b.frozenLeft <= 0) b.bufferLeft = this.tuning.buffer;
  }

  /** Knock a body away horizontally along (dx, dz) at `speed`, with a small hop and a stun. */
  shove(id: number, dx: number, dz: number, speed: number, by = 0): void {
    const b = this.body(id);
    if (!b?.active || b.frozenLeft > 0) return;
    const len = Math.hypot(dx, dz) || 1;
    b.vel.x = (dx / len) * speed;
    b.vel.z = (dz / len) * speed;
    b.vel.y = Math.max(b.vel.y, 3.6);
    b.ground = -1;
    b.coyoteLeft = 0;
    b.stunLeft = this.tuning.stun;
    this.events.push({ k: 'shove', id, by });
  }

  /* ------------------------------------------------------------------ solids at run time */

  pose(id: number): Pose {
    return this.poses[id]!;
  }

  /** Start a crumble: warn now, gone after `warn` s for `gone` s (Infinity = until restored). */
  crumble(id: number, warn: number, gone: number): void {
    const s = this.solids[id];
    if (s?.state !== 'solid') return;
    s.state = 'warn';
    s.since = this.t;
    s.until = this.t + warn;
    s.goneFor = gone;
    this.events.push({ k: 'crack', solid: id });
  }

  /** Remove a solid now for `gone` seconds (Infinity = until restored). */
  vanish(id: number, gone = Infinity): void {
    const s = this.solids[id];
    if (!s || s.state === 'gone') return;
    s.state = 'gone';
    s.since = this.t;
    s.until = this.t + gone;
    this.events.push({ k: 'vanish', solid: id });
  }

  restore(id: number): void {
    const s = this.solids[id];
    if (!s || s.state === 'solid') return;
    s.state = 'solid';
    s.since = this.t;
    s.until = Infinity;
    this.events.push({ k: 'restore', solid: id });
  }

  /* ------------------------------------------------------------------ queries */

  /**
   * Top of the highest active solid under (x, z) at or below `maxY`, at time `t` (defaults to now;
   * pass a future time to predict moving platforms). `margin` shrinks (+) or grows (-) footprints.
   */
  supportAt(x: number, z: number, maxY: number, t = this.t, margin = 0): number | null {
    let best: number | null = null;
    const p: Pose = { x: 0, y: 0, z: 0, yaw: 0 };
    for (const s of this.solids) {
      if (s.state === 'gone' || s.def.role === 'sweeper') continue;
      poseAt(s.def, t, p);
      const top = topOf(s.def, p);
      if (top > maxY + 1e-6) continue;
      const l = toLocal(p, x, z);
      if (Math.abs(l.x) > s.def.half.x - margin || Math.abs(l.z) > s.def.half.z - margin) continue;
      if (best === null || top > best) best = top;
    }
    return best;
  }

  /** The solid a body stands on, if any. */
  groundOf(b: Body): Solid | null {
    return b.ground >= 0 ? (this.solids[b.ground] ?? null) : null;
  }

  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /* ------------------------------------------------------------------ stepping */

  /**
   * Advance by `dt` real seconds in fixed steps. Returns the interpolation factor between the last
   * two steps for rendering.
   */
  advance(dt: number): number {
    this.acc += Math.max(0, Math.min(dt, MAX_STEPS * STEP));
    let n = 0;
    while (this.acc >= STEP && n < MAX_STEPS) {
      this.step();
      this.acc -= STEP;
      n++;
    }
    if (n === MAX_STEPS) this.acc = Math.min(this.acc, STEP);
    return this.acc / STEP;
  }

  step(): void {
    const dt = STEP;
    const t0 = this.t;
    const t1 = t0 + dt;
    for (let i = 0; i < this.solids.length; i++) {
      const prev = this.prevPoses[i]!;
      const cur = this.poses[i]!;
      prev.x = cur.x;
      prev.y = cur.y;
      prev.z = cur.z;
      prev.yaw = cur.yaw;
      poseAt(this.solids[i]!.def, t1, cur);
    }
    this.t = t1;
    this.tickStates();
    for (const b of this.bodies) this.stepBody(b, dt);
    if (this.tuning.crowd > 0) this.crowdPass();
    this.afterStep?.(dt);
  }

  private tickStates(): void {
    for (const s of this.solids) {
      if (s.state === 'warn' && this.t >= s.until) {
        s.state = 'gone';
        s.since = this.t;
        s.until = this.t + s.goneFor;
        this.events.push({ k: 'vanish', solid: s.id });
      } else if (s.state === 'gone' && this.t >= s.until) {
        s.state = 'solid';
        s.since = this.t;
        s.until = Infinity;
        this.events.push({ k: 'restore', solid: s.id });
      }
    }
  }

  private stepBody(b: Body, dt: number): void {
    copy(b.prev, b.pos);
    b.prevYaw = b.yaw;
    if (!b.active) return;
    const T = this.tuning;
    if (b.frozenLeft > 0) {
      b.frozenLeft = Math.max(0, b.frozenLeft - dt);
      b.vel.x = 0;
      b.vel.y = 0;
      b.vel.z = 0;
      return;
    }

    // 1. Ride the solid underfoot: its translation and turn, plus a conveyor's belt.
    const g = b.ground >= 0 ? this.solids[b.ground] : undefined;
    if (g && isSolidNow(g)) {
      const a = this.prevPoses[g.id]!;
      const c = this.poses[g.id]!;
      const local = toLocal(a, b.pos.x, b.pos.z);
      const moved = toWorld(c, local.x, local.z);
      b.pos.x = moved.x;
      b.pos.z = moved.z;
      b.pos.y += c.y - a.y;
      b.yaw += c.yaw - a.yaw;
      const belt = g.def.conveyor;
      if (belt) {
        const cy = Math.cos(c.yaw);
        const sy = Math.sin(c.yaw);
        b.pos.x += (belt.x * cy + belt.z * sy) * dt;
        b.pos.z += (-belt.x * sy + belt.z * cy) * dt;
      }
    }

    // 2. Steer: fast acceleration, instant facing; a stunned body drifts.
    const control = b.stunLeft > 0 ? 0.15 : 1 - 0.85 * b.slip;
    b.stunLeft = Math.max(0, b.stunLeft - dt);
    const grounded = b.ground >= 0;
    const wantX = b.moveX * T.speed;
    const wantZ = b.moveZ * T.speed;
    const pushing = Math.abs(b.moveX) + Math.abs(b.moveZ) > 0.05;
    const rate = (grounded ? (pushing ? T.accel : T.brake) : T.airAccel) * control * dt;
    const dx = wantX - b.vel.x;
    const dz = wantZ - b.vel.z;
    const dl = Math.hypot(dx, dz);
    if (dl > 0) {
      const k = Math.min(1, rate / dl);
      b.vel.x += dx * k;
      b.vel.z += dz * k;
    }
    if (pushing && b.stunLeft <= 0) b.yaw = faceYaw(b.moveX, b.moveZ);

    // 3. Jump with coyote time and buffer.
    if (grounded) b.coyoteLeft = T.coyote;
    else b.coyoteLeft = Math.max(0, b.coyoteLeft - dt);
    if (b.bufferLeft > 0) {
      if (b.coyoteLeft > 0) {
        b.vel.y = T.jumpSpeed;
        b.ground = -1;
        b.coyoteLeft = 0;
        b.bufferLeft = 0;
        this.events.push({ k: 'jump', id: b.id });
      } else b.bufferLeft = Math.max(0, b.bufferLeft - dt);
    }

    // 4. Gravity and integration.
    b.vel.y = Math.max(-34, b.vel.y - T.gravity * dt);
    const prevY = b.pos.y;
    b.pos.x += b.vel.x * dt;
    b.pos.y += b.vel.y * dt;
    b.pos.z += b.vel.z * dt;
    const wasGround = b.ground;
    b.ground = -1;

    // 5. Collide with every solid (two passes settle corners).
    for (let pass = 0; pass < 2; pass++) {
      for (const s of this.solids) {
        if (s.state === 'gone') continue;
        this.collide(b, s, prevY, wasGround === s.id);
      }
    }
    if (b.ground < 0) b.peakY = Math.max(b.peakY, b.pos.y);

    // 6. Fallen out of the world.
    if (!b.fallen && b.pos.y < T.killY) {
      b.fallen = true;
      this.events.push({ k: 'fall', id: b.id });
    }
  }

  private collide(b: Body, s: Solid, prevY: number, stoodOn: boolean): void {
    const T = this.tuning;
    const def = s.def;
    const p = this.poses[s.id]!;
    const top = topOf(def, p);
    const bottom = p.y - def.half.y;
    if (b.pos.y >= top + 0.001 || b.pos.y + T.height <= bottom) return;
    const l = toLocal(p, b.pos.x, b.pos.z);
    const hx = def.half.x;
    const hz = def.half.z;
    // Closest point of the box footprint to the body axis.
    const qx = clamp(l.x, -hx, hx);
    const qz = clamp(l.z, -hz, hz);
    const ox = l.x - qx;
    const oz = l.z - qz;
    const d2 = ox * ox + oz * oz;
    const r = T.radius;
    if (d2 >= r * r) return;

    const sweeper = def.role === 'sweeper';
    // Landing on top: the feet were above the top before this step (or stood on it), and the
    // axis is over the footprint (a little overhang allowed).
    const over = d2 < (r * 0.55) ** 2;
    const prevTop = this.prevPoses[s.id]!.y + def.half.y;
    if (!sweeper && b.vel.y <= 0.001) {
      const fromAbove = over && (prevY >= prevTop - 0.02 || stoodOn);
      // Walking into a low step climbs it (only right after being on the ground).
      const stepping = top - b.pos.y <= T.stepUp && b.coyoteLeft > 0;
      if (fromAbove || stepping) {
        this.land(b, s, top);
        return;
      }
    }
    // Coming down past the edge, the axis beyond the footprint: just fall, no sideways shove.
    if (!sweeper && prevY >= prevTop - 0.02) return;
    // Head bump from below.
    if (!sweeper && over && b.vel.y > 0 && prevY + T.height <= bottom + 0.05) {
      b.pos.y = bottom - T.height;
      b.vel.y = 0;
      return;
    }
    // Side push out of the box.
    let nx: number;
    let nz: number;
    let depth: number;
    if (d2 > 1e-10) {
      const d = Math.sqrt(d2);
      nx = ox / d;
      nz = oz / d;
      depth = r - d;
    } else {
      // Axis inside the footprint: leave through the nearest side.
      const px = hx - Math.abs(l.x);
      const pz = hz - Math.abs(l.z);
      if (px < pz) {
        nx = Math.sign(l.x) || 1;
        nz = 0;
        depth = px + r;
      } else {
        nx = 0;
        nz = Math.sign(l.z) || 1;
        depth = pz + r;
      }
    }
    const w = toWorld({ x: 0, y: 0, z: 0, yaw: p.yaw }, nx, nz);
    b.pos.x += w.x * depth;
    b.pos.z += w.z * depth;
    const into = b.vel.x * w.x + b.vel.z * w.z;
    if (into < 0) {
      b.vel.x -= into * w.x;
      b.vel.z -= into * w.z;
    }
    if (sweeper) {
      const sv = surfaceVelocity(def, this.t, b.pos.x, b.pos.z);
      const sl = Math.hypot(sv.x, sv.z);
      let kx = w.x;
      let kz = w.z;
      if (sl > 0.5) {
        kx = kx * 0.4 + (sv.x / sl) * 0.6;
        kz = kz * 0.4 + (sv.z / sl) * 0.6;
      }
      const kl = Math.hypot(kx, kz) || 1;
      if (b.stunLeft <= 0) this.events.push({ k: 'sweep', id: b.id, solid: s.id });
      b.vel.x = (kx / kl) * T.sweepPush;
      b.vel.z = (kz / kl) * T.sweepPush;
      b.vel.y = Math.max(b.vel.y, 5.5);
      b.ground = -1;
      b.coyoteLeft = 0;
      b.stunLeft = T.stun;
    }
  }

  private land(b: Body, s: Solid, top: number): void {
    const falling = -b.vel.y;
    const wasAir = b.ground < 0 && falling > 2;
    b.pos.y = top;
    b.vel.y = 0;
    b.ground = s.id;
    const def = s.def;
    if (def.spring && def.spring > 0) {
      b.vel.y = def.spring;
      b.ground = -1;
      b.coyoteLeft = 0;
      b.peakY = top;
      this.events.push({ k: 'spring', id: b.id, solid: s.id });
      return;
    }
    if (def.fragile && s.state === 'solid') this.crumble(s.id, def.fragile.warn, def.fragile.gone);
    if (wasAir) {
      this.events.push({ k: 'land', id: b.id, speed: falling, solid: s.id });
      b.peakY = top;
    }
  }

  /** Bodies that touch push each other apart; a fast bump is reported. */
  private crowdPass(): void {
    const T = this.tuning;
    const list = this.bodies;
    const min = T.radius * 2;
    for (let i = 0; i < list.length; i++) {
      const a = list[i]!;
      if (!a.active || a.frozenLeft > 0) continue;
      for (let j = i + 1; j < list.length; j++) {
        const c = list[j]!;
        if (!c.active || c.frozenLeft > 0) continue;
        if (Math.abs(a.pos.y - c.pos.y) > T.height * 0.8) continue;
        const dx = c.pos.x - a.pos.x;
        const dz = c.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2);
        const nx = d > 1e-6 ? dx / d : a.id < c.id ? 1 : -1;
        const nz = d > 1e-6 ? dz / d : 0;
        const push = ((min - d) / 2) * T.crowd;
        a.pos.x -= nx * push;
        a.pos.z -= nz * push;
        c.pos.x += nx * push;
        c.pos.z += nz * push;
        const rel = (a.vel.x - c.vel.x) * nx + (a.vel.z - c.vel.z) * nz;
        if (rel > 0) {
          // Share the closing speed, a little bouncy.
          const k = rel * 0.6 * T.crowd;
          a.vel.x -= nx * k;
          a.vel.z -= nz * k;
          c.vel.x += nx * k;
          c.vel.z += nz * k;
          if (rel > 4) this.events.push({ k: 'bump', a: a.id, b: c.id, speed: rel });
        }
      }
    }
  }
}

/** Ease a stick reading towards zero inside a small dead zone (phones already apply theirs). */
export function stickToMove(x: number, y: number): { x: number; z: number } {
  const len = Math.hypot(x, y);
  if (len < 0.05) return { x: 0, z: 0 };
  const k = Math.min(1, len) / len;
  return { x: x * k, z: y * k };
}

/** Speed on the ground plane (m/s). */
export function planarSpeed(b: Body): number {
  return Math.hypot(b.vel.x, b.vel.z);
}
