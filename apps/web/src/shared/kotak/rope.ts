/**
 * Elastic rope for the box world: links that tie bodies of a `KotakSim` together (Satu Tali ties
 * the whole team in one chain). Pure TypeScript, run from `KotakSim.afterStep` at 60 Hz.
 *
 * Each link is slack up to `rest`, then pulls like a spring (with damping so it never rings), and
 * cannot stretch past `max` (positions and velocities are projected back, shared by weight).
 * Bodies have a weight (inverse mass, 1 = a player; a sandbag is heavier, so smaller). On the
 * ground, the sideways pull must beat the body's footing (`hold`, in m/s²) before it slides:
 * standing still holds a little, walking away from the pull holds more, and gripping (PEGANG)
 * plants the feet and makes the body nearly immovable. While a body is being dragged it loses
 * traction (`Body.slip`), so a teammate hanging over an edge really pulls a careless friend along.
 *
 * `RopeStrand` is the drawn rope: a short verlet chain between two ends that sags when slack and
 * rests on the floor, purely visual.
 */
import type { V3 } from './math';
import type { Body, KotakSim } from './sim';

export interface RopeTuning {
  /** Length at which a link starts to pull (m). */
  rest: number;
  /** Hard limit (m). */
  max: number;
  /** Pull per metre of stretch on a body of weight 1 (m/s² per m). */
  stiffness: number;
  /** Damping of the stretch speed (1/s). */
  damping: number;
  /** Footing of a standing body before a sideways pull drags it (m/s²). */
  standHold: number;
  /** Footing while walking away from the pull. */
  walkHold: number;
  /** Footing while gripping. */
  gripHold: number;
  /** Weight factor while gripping on the ground (small = hard to move). */
  gripWeight: number;
  /** Traction lost while dragged (0..1), see `Body.slip`. */
  slip: number;
}

export const DEFAULT_ROPE: RopeTuning = {
  rest: 3,
  max: 5,
  stiffness: 46,
  damping: 7,
  standHold: 12,
  walkHold: 24,
  gripHold: 80,
  gripWeight: 0.06,
  slip: 1,
};

export interface RopeLink {
  a: number;
  b: number;
  /**
   * This link's own slack length, shorter than `tuning.rest` while someone climbs hand over hand
   * (`shorten`); its hard limit moves with it.
   */
  rest?: number;
}

interface Acc {
  x: number;
  y: number;
  z: number;
  used: boolean;
}

export class Rope {
  readonly tuning: RopeTuning;
  links: RopeLink[] = [];
  /** Pull of each link at the last step (m/s² on a body of weight 1). */
  tension: number[] = [];
  /** Length of each link at the last step (m). */
  length: number[] = [];
  /** Where each link bends over an edge at the last step (drawing), or null when straight. */
  bend: (V3 | null)[] = [];
  private readonly grips = new Set<number>();
  private readonly weights = new Map<number, number>();
  private readonly holds = new Map<number, number>();
  private readonly acc = new Map<number, Acc>();
  private readonly geo: Geometry = { len: 0, ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0 };

  constructor(tuning: Partial<RopeTuning> = {}) {
    this.tuning = { ...DEFAULT_ROPE, ...tuning };
  }

  /** Tie bodies in one chain, in this order. */
  chain(ids: readonly number[]): void {
    this.links = [];
    for (let i = 1; i < ids.length; i++) this.links.push({ a: ids[i - 1]!, b: ids[i]! });
    this.tension = this.links.map(() => 0);
    this.length = this.links.map(() => 0);
    this.bend = this.links.map(() => null);
  }

  setGrip(id: number, on: boolean): void {
    if (on) this.grips.add(id);
    else this.grips.delete(id);
  }

  gripping(id: number): boolean {
    return this.grips.has(id);
  }

  /** Weight factor of a body: 1 = a player, 0.5 = twice as heavy. */
  setWeight(id: number, w: number): void {
    this.weights.set(id, Math.max(0, w));
  }

  /** Footing of a body on the ground (m/s²), or null for the default. */
  setHold(id: number, hold: number | null): void {
    if (hold === null) this.holds.delete(id);
    else this.holds.set(id, Math.max(0, hold));
  }

  /** Bodies tied directly to `id`. */
  neighbours(id: number): number[] {
    const out: number[] = [];
    for (const l of this.links) {
      if (l.a === id) out.push(l.b);
      else if (l.b === id) out.push(l.a);
    }
    return out;
  }

  /** Index of the link between two bodies, or -1. */
  linkOf(a: number, b: number): number {
    return this.links.findIndex((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a));
  }

  /** Slack length of link `i`. */
  restOf(i: number): number {
    return this.links[i]?.rest ?? this.tuning.rest;
  }

  /** Hard limit of link `i`. */
  maxOf(i: number): number {
    return this.restOf(i) + this.tuning.max - this.tuning.rest;
  }

  /** Climb hand over hand: link `i` gets `by` metres shorter, never below `min`. */
  shorten(i: number, by: number, min = 0.9): void {
    const l = this.links[i];
    if (l) l.rest = Math.max(min, this.restOf(i) - by);
  }

  /** Let link `i` pay back out towards its normal length at `speed` m/s. */
  relax(i: number, speed: number, dt: number): void {
    const l = this.links[i];
    if (!l || l.rest === undefined) return;
    l.rest += speed * dt;
    if (l.rest >= this.tuning.rest) delete l.rest;
  }

  /** 0 while slack, 1 at the hard limit. */
  strain(i: number): number {
    const len = this.length[i] ?? 0;
    const T = this.tuning;
    const rest = this.restOf(i);
    return Math.max(0, Math.min(1, (len - rest) / Math.max(0.01, T.max - T.rest)));
  }

  maxStrain(): number {
    let s = 0;
    for (let i = 0; i < this.links.length; i++) s = Math.max(s, this.strain(i));
    return s;
  }

  /** Effective weight of a body right now (0 = does not move). */
  weightOf(b: Body): number {
    if (!b.active || b.frozenLeft > 0) return 0;
    const w = this.weights.get(b.id) ?? 1;
    return b.ground >= 0 && this.grips.has(b.id) ? w * this.tuning.gripWeight : w;
  }

  /** One rope step: springs, footing, then the hard limit. Call after the bodies moved. */
  solve(sim: KotakSim, dt: number): void {
    const T = this.tuning;
    for (const a of this.acc.values()) {
      a.x = 0;
      a.y = 0;
      a.z = 0;
      a.used = false;
    }
    for (let i = 0; i < this.links.length; i++) {
      const l = this.links[i]!;
      const A = sim.body(l.a);
      const B = sim.body(l.b);
      this.tension[i] = 0;
      if (!A || !B || !A.active || !B.active) {
        this.length[i] = 0;
        this.bend[i] = null;
        continue;
      }
      // Over an edge, the rope runs along the floor and bends down at the lip, like a pulley.
      this.bend[i] = edgeBetween(sim, A, B);
      const g = this.geometry(A, B, this.bend[i] ?? null);
      this.length[i] = g.len;
      const rest = this.restOf(i);
      if (g.len <= rest) continue;
      const rel =
        -(A.vel.x * g.ax + A.vel.y * g.ay + A.vel.z * g.az) -
        (B.vel.x * g.bx + B.vel.y * g.by + B.vel.z * g.bz);
      const pull = Math.max(0, T.stiffness * (g.len - rest) + T.damping * rel);
      this.tension[i] = pull;
      const wa = this.weightOf(A);
      const wb = this.weightOf(B);
      this.push(A.id, g.ax * pull * wa, g.ay * pull * wa, g.az * pull * wa);
      this.push(B.id, g.bx * pull * wb, g.by * pull * wb, g.bz * pull * wb);
    }
    for (const b of sim.bodies) {
      const a = this.acc.get(b.id);
      if (!a) continue;
      if (!a.used) {
        b.slip = 0;
        continue;
      }
      this.apply(b, a, dt);
    }
    for (let pass = 0; pass < 2; pass++) this.limit(sim);
  }

  /**
   * Length of a link and the pull directions at each end (unit vectors pointing along the rope,
   * away from the body), straight or bent over `bend`.
   */
  private geometry(A: Body, B: Body, bend: V3 | null): Geometry {
    const g = this.geo;
    if (bend) {
      const ax = bend.x - A.pos.x;
      const ay = bend.y - A.pos.y;
      const az = bend.z - A.pos.z;
      const bx = bend.x - B.pos.x;
      const by = bend.y - B.pos.y;
      const bz = bend.z - B.pos.z;
      const la = Math.hypot(ax, ay, az);
      const lb = Math.hypot(bx, by, bz);
      if (la > 1e-4 && lb > 1e-4) {
        g.len = la + lb;
        g.ax = ax / la;
        g.ay = ay / la;
        g.az = az / la;
        g.bx = bx / lb;
        g.by = by / lb;
        g.bz = bz / lb;
        return g;
      }
    }
    const dx = B.pos.x - A.pos.x;
    const dy = B.pos.y - A.pos.y;
    const dz = B.pos.z - A.pos.z;
    const len = Math.hypot(dx, dy, dz);
    g.len = len;
    const k = len > 1e-6 ? 1 / len : 0;
    g.ax = dx * k;
    g.ay = dy * k;
    g.az = dz * k;
    g.bx = -dx * k;
    g.by = -dy * k;
    g.bz = -dz * k;
    return g;
  }

  private push(id: number, x: number, y: number, z: number): void {
    let a = this.acc.get(id);
    if (!a) {
      a = { x: 0, y: 0, z: 0, used: false };
      this.acc.set(id, a);
    }
    a.x += x;
    a.y += y;
    a.z += z;
    a.used = true;
  }

  private apply(b: Body, a: Acc, dt: number): void {
    const T = this.tuning;
    if (b.ground < 0) {
      b.vel.x += a.x * dt;
      b.vel.y += a.y * dt;
      b.vel.z += a.z * dt;
      b.slip = 0;
      return;
    }
    // On the ground: the floor takes any downward pull, the feet resist a sideways one. Someone
    // walking away from the pull digs in: they may be slowed, but they keep their footing.
    const h = Math.hypot(a.x, a.z);
    let hold = this.holds.get(b.id) ?? T.standHold;
    let digging = false;
    if (this.grips.has(b.id)) hold = Math.max(hold, T.gripHold);
    else {
      const m = Math.hypot(b.moveX, b.moveZ);
      digging = m > 0.3 && h > 1e-6 && (b.moveX * a.x + b.moveZ * a.z) / (m * h) < -0.3;
      if (digging) hold = Math.max(hold, T.walkHold);
    }
    if (h <= hold) b.slip = 0;
    else {
      const k = 1 - hold / h;
      b.vel.x += a.x * k * dt;
      b.vel.z += a.z * k * dt;
      b.slip = digging ? 0 : T.slip;
    }
    if (a.y > 0) b.vel.y += a.y * dt;
  }

  /** Project links longer than `max` back, shared by weight, and stop them stretching further. */
  private limit(sim: KotakSim): void {
    for (let i = 0; i < this.links.length; i++) {
      const l = this.links[i]!;
      const A = sim.body(l.a);
      const B = sim.body(l.b);
      if (!A || !B || !A.active || !B.active) continue;
      const g = this.geometry(A, B, this.bend[i] ?? null);
      const max = this.maxOf(i);
      if (g.len <= max) continue;
      const wa = this.weightOf(A);
      const wb = this.weightOf(B);
      const sum = wa + wb;
      if (sum <= 0) continue;
      const corr = g.len - max;
      const ka = (corr * wa) / sum;
      const kb = (corr * wb) / sum;
      shift(A, g.ax * ka, g.ay * ka, g.az * ka);
      shift(B, g.bx * kb, g.by * kb, g.bz * kb);
      const rel =
        -(A.vel.x * g.ax + A.vel.y * g.ay + A.vel.z * g.az) -
        (B.vel.x * g.bx + B.vel.y * g.by + B.vel.z * g.bz);
      if (rel > 0) {
        const ra = (rel * wa) / sum;
        const rb = (rel * wb) / sum;
        kick(A, g.ax * ra, g.ay * ra, g.az * ra);
        kick(B, g.bx * rb, g.by * rb, g.bz * rb);
      }
    }
  }
}

interface Geometry {
  len: number;
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
}

/**
 * Where a rope from a body standing on a floor bends down towards a body below that floor: walk
 * from the upper body towards the lower one until the floor ends. Null when neither end stands
 * above the other or the floor reaches all the way (the rope then runs straight).
 */
export function edgeBetween(sim: KotakSim, A: Body, B: Body): V3 | null {
  if (A.ground >= 0 && B.pos.y < A.pos.y - 0.4) return edgeFrom(sim, A, B);
  if (B.ground >= 0 && A.pos.y < B.pos.y - 0.4) return edgeFrom(sim, B, A);
  return null;
}

function edgeFrom(sim: KotakSim, up: Body, down: Body): V3 | null {
  const hx = down.pos.x - up.pos.x;
  const hz = down.pos.z - up.pos.z;
  const hl = Math.hypot(hx, hz);
  if (hl < 0.05) return null;
  const top = up.pos.y;
  const step = 0.2;
  for (let s = step; s < hl + step; s += step) {
    const d = Math.min(s, hl);
    const floor = sim.supportAt(up.pos.x + (hx * d) / hl, up.pos.z + (hz * d) / hl, top + 0.05);
    if (floor === null || floor < top - 0.3) {
      const e = Math.max(0, d - step / 2);
      return { x: up.pos.x + (hx * e) / hl, y: top, z: up.pos.z + (hz * e) / hl };
    }
  }
  return null;
}

/** Move a body; a body on the ground is never pushed down into its floor. */
function shift(b: Body, x: number, y: number, z: number): void {
  b.pos.x += x;
  b.pos.z += z;
  b.pos.y += b.ground >= 0 ? Math.max(0, y) : y;
}

function kick(b: Body, x: number, y: number, z: number): void {
  b.vel.x += x;
  b.vel.z += z;
  b.vel.y += b.ground >= 0 ? Math.max(0, y) : y;
}

/* ------------------------------------------------------------------ drawn rope */

/** Floor height under (x, z) at or below `y`, or null over a gap. */
export type FloorQuery = (x: number, z: number, y: number) => number | null;

/**
 * A drawn rope between two moving ends: `segments` pieces of verlet chain that sag under gravity
 * while slack, straighten when pulled tight and rest on floors instead of sinking through them.
 */
export class RopeStrand {
  readonly points: V3[] = [];
  private readonly prev: V3[] = [];
  private started = false;

  constructor(readonly segments = 10) {
    for (let i = 0; i <= segments; i++) {
      this.points.push({ x: 0, y: 0, z: 0 });
      this.prev.push({ x: 0, y: 0, z: 0 });
    }
  }

  /**
   * Pin the ends at `a` and `b` and settle the inside for a rope `length` long (at least the
   * straight distance). `dt` in seconds.
   */
  update(
    a: V3,
    b: V3,
    length: number,
    dt: number,
    floor: FloorQuery | null = null,
    via: V3 | null = null,
  ): void {
    const n = this.segments;
    const pts = this.points;
    const viaLen = via ? Math.hypot(via.x - a.x, via.y - a.y, via.z - a.z) : 0;
    const straight = via
      ? viaLen + Math.hypot(b.x - via.x, b.y - via.y, b.z - via.z)
      : Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (straight >= length - 1e-3) {
      // Pulled tight: straight lines (through the bend, if any).
      this.lay(a, b, via, viaLen, straight);
      this.started = true;
      return;
    }
    if (!this.started) {
      this.started = true;
      for (let i = 0; i <= n; i++) {
        const k = i / n;
        const p = pts[i]!;
        p.x = a.x + (b.x - a.x) * k;
        p.y = a.y + (b.y - a.y) * k;
        p.z = a.z + (b.z - a.z) * k;
        const q = this.prev[i]!;
        q.x = p.x;
        q.y = p.y;
        q.z = p.z;
      }
    }
    const h = Math.min(0.05, Math.max(0, dt));
    const g = 18 * h * h;
    for (let i = 1; i < n; i++) {
      const p = pts[i]!;
      const q = this.prev[i]!;
      const vx = (p.x - q.x) * 0.96;
      const vy = (p.y - q.y) * 0.96;
      const vz = (p.z - q.z) * 0.96;
      q.x = p.x;
      q.y = p.y;
      q.z = p.z;
      p.x += vx;
      p.y += vy - g;
      p.z += vz;
    }
    const first = pts[0]!;
    const last = pts[n]!;
    first.x = a.x;
    first.y = a.y;
    first.z = a.z;
    last.x = b.x;
    last.y = b.y;
    last.z = b.z;
    const seg = Math.max(straight, length) / n;
    const pin = via ? Math.max(1, Math.min(n - 1, Math.round((n * viaLen) / Math.max(1e-3, straight)))) : -1;
    for (let it = 0; it < 8; it++) {
      for (let i = 0; i < n; i++) {
        const p = pts[i]!;
        const q = pts[i + 1]!;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const dz = q.z - p.z;
        const d = Math.hypot(dx, dy, dz) || 1e-6;
        const diff = (d - seg) / d;
        const pinP = i === 0 || i === pin;
        const pinQ = i + 1 === n || i + 1 === pin;
        const kp = pinP ? 0 : pinQ ? 1 : 0.5;
        const kq = pinQ ? 0 : pinP ? 1 : 0.5;
        p.x += dx * diff * kp;
        p.y += dy * diff * kp;
        p.z += dz * diff * kp;
        q.x -= dx * diff * kq;
        q.y -= dy * diff * kq;
        q.z -= dz * diff * kq;
      }
      if (via && pin > 0) {
        const p = pts[pin]!;
        p.x = via.x;
        p.y = via.y;
        p.z = via.z;
      }
      if (floor && it % 4 === 3) {
        for (let i = 1; i < n; i++) {
          const p = pts[i]!;
          const top = floor(p.x, p.z, p.y + 0.4);
          if (top !== null && p.y < top + 0.05) p.y = top + 0.05;
        }
      }
    }
  }

  private lay(a: V3, b: V3, via: V3 | null, viaLen: number, total: number): void {
    const n = this.segments;
    for (let i = 0; i <= n; i++) {
      const d = (total * i) / n;
      let x: number;
      let y: number;
      let z: number;
      if (via && d <= viaLen) {
        const k = viaLen > 1e-6 ? d / viaLen : 0;
        x = a.x + (via.x - a.x) * k;
        y = a.y + (via.y - a.y) * k;
        z = a.z + (via.z - a.z) * k;
      } else {
        const from = via ?? a;
        const span = total - (via ? viaLen : 0);
        const k = span > 1e-6 ? (d - (via ? viaLen : 0)) / span : 1;
        x = from.x + (b.x - from.x) * k;
        y = from.y + (b.y - from.y) * k;
        z = from.z + (b.z - from.z) * k;
      }
      const p = this.points[i]!;
      const q = this.prev[i]!;
      p.x = x;
      p.y = y;
      p.z = z;
      q.x = x;
      q.y = y;
      q.z = z;
    }
  }

  /** Forget the shape (teleports): the next update starts straight. */
  reset(): void {
    this.started = false;
  }
}
