/**
 * Computer snakes (PRD 6.4): they feel ahead with a fan of rays, chase seeds (big knock-out seeds
 * first), and the sharper ones now and then cut across a rival's path. Human-like on purpose:
 * they react in intervals (slower when gentle), see less far when gentle and sometimes slip.
 * Their commands go through `ArenaMatch.setInput`, exactly like a phone's.
 */
import { bySkill, SKILL_MAX, SKILL_MIN } from '../common/cpu';
import {
  type ArenaMatch,
  insideArena,
  PELLET_AMBIENT,
  PELLET_DROP,
  PELLET_FREE,
  type Snake,
  wrapAngle,
} from './logic';

/** Skill of the brain that steers a snake whose phone dropped. */
export const TAKEOVER_SKILL = 0.55;

/**
 * Candidate plans, like a thumb on the phone: hold a turn for this many ms (negative = left),
 * then go straight. Each one is traced along the real turning circle, so a snake never picks a
 * way out that would swing it through a wall first.
 */
const PLANS: readonly number[] = [0, -150, 150, -300, 300, -500, 500, -800, 800, -1200, 1200];
const TRACE_STEP = 12;

interface Trace {
  free: number;
  /** Closest the path gets to the target. */
  near: number;
}

/** Skills of the solo field, spread around the remembered level so the field is not uniform. */
export function fieldSkills(base: number, n: number): number[] {
  const spread = [-0.14, 0.12, -0.05, 0.05, 0];
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = base + (spread[i % spread.length] ?? 0);
    out.push(Math.min(SKILL_MAX, Math.max(SKILL_MIN, v)));
  }
  return out;
}

/**
 * Coarse occupancy grid of every body (one bit per seat), rebuilt at most once per simulated
 * moment and shared by all brains.
 */
export class Sensors {
  readonly cell = 20;
  private cols = 0;
  private rows = 0;
  private occ = new Uint32Array(0);
  private builtAt = Number.NaN;
  private readonly bits = new Map<number, number>();

  build(m: ArenaMatch): void {
    if (this.builtAt === m.now) return;
    this.builtAt = m.now;
    const cols = Math.ceil(m.width / this.cell) + 2;
    const rows = Math.ceil(m.height / this.cell) + 2;
    if (cols !== this.cols || rows !== this.rows) {
      this.cols = cols;
      this.rows = rows;
      this.occ = new Uint32Array(cols * rows);
    } else {
      this.occ.fill(0);
    }
    const all = m.all;
    for (let i = 0; i < all.length && i < 32; i++) {
      const s = all[i]!;
      const bit = (1 << i) >>> 0;
      this.bits.set(s.id, bit);
      if (!s.alive || s.gone) continue;
      this.stamp(s.x, s.y, bit);
      // Where the head is about to be counts as taken too: no head-on dives into a rival.
      const ca = Math.cos(s.angle);
      const sa = Math.sin(s.angle);
      for (let d = 20; d <= 120; d += 20) this.stamp(s.x + ca * d, s.y + sa * d, bit);
      const n = s.bodyPoints();
      for (let j = 0; j <= n; j++) this.stamp(s.px(j), s.py(j), bit);
    }
  }

  private stamp(x: number, y: number, bit: number): void {
    const cx = Math.floor(x / this.cell) + 1;
    const cy = Math.floor(y / this.cell) + 1;
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return;
    const i = cy * this.cols + cx;
    this.occ[i] = (this.occ[i]! | bit) >>> 0;
  }

  /** Bits of everyone but `id`. */
  othersMask(id: number): number {
    const bit = this.bits.get(id) ?? 0;
    return ~bit >>> 0;
  }

  /** Any body of `mask` within roughly one cell of (x, y)? */
  blocked(x: number, y: number, mask: number): boolean {
    const cx = Math.floor(x / this.cell) + 1;
    const cy = Math.floor(y / this.cell) + 1;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = cy + dy;
      if (yy < 0 || yy >= this.rows) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const xx = cx + dx;
        if (xx < 0 || xx >= this.cols) continue;
        if ((this.occ[yy * this.cols + xx]! & mask) !== 0) return true;
      }
    }
    return false;
  }
}

export interface Command {
  turn: number;
  boost: boolean;
}

export class SnakeBrain {
  private readonly cmd: Command = { turn: 0, boost: false };
  private nextThink = 0;
  private boostUntil = 0;
  private wander = 0;
  private wanderUntil = 0;
  /** The held turn of the current plan and when the thumb lifts. */
  private turnDir = 0;
  private turnUntil = 0;
  private readonly tr: Trace = { free: 0, near: 0 };

  constructor(
    readonly skill: number,
    private readonly rnd: () => number = Math.random,
  ) {}

  /** The command for this frame; the brain only reconsiders every so often. */
  update(m: ArenaMatch, me: Snake, sensors: Sensors): Command {
    if (!me.alive || m.phase !== 'play') {
      this.cmd.turn = 0;
      this.cmd.boost = false;
      this.nextThink = m.now + 150 + this.rnd() * 250;
      return this.cmd;
    }
    if (m.now >= this.nextThink) {
      this.nextThink = m.now + bySkill(this.skill, 250, 105) + (this.rnd() - 0.5) * 70;
      sensors.build(m);
      this.think(m, me, sensors);
    }
    this.cmd.turn = m.now < this.turnUntil ? this.turnDir : 0;
    if (this.cmd.boost && (m.now >= this.boostUntil || me.len <= m.tuning.minBoostLen + 2)) {
      this.cmd.boost = false;
    }
    return this.cmd;
  }

  /** Follow one plan from the head until something is in the way (or `look` is reached). */
  private trace(
    m: ArenaMatch,
    sensors: Sensors,
    me: Snake,
    turnMs: number,
    look: number,
    mask: number,
    tx: number,
    ty: number,
  ): Trace {
    const t = m.tuning;
    const v = me.boosting ? t.boostSpeed : t.speed;
    const rate = me.boosting ? t.boostTurnRate : t.turnRate;
    const turnDist = (Math.abs(turnMs) / 1000) * v;
    const dA = ((rate * TRACE_STEP) / v) * Math.sign(turnMs);
    const margin = me.radius + 6;
    let x = me.x;
    let y = me.y;
    let a = me.angle;
    let near = Math.hypot(tx - x, ty - y);
    const out = this.tr;
    for (let d = TRACE_STEP; d <= look; d += TRACE_STEP) {
      if (d <= turnDist) a += dA;
      x += Math.cos(a) * TRACE_STEP;
      y += Math.sin(a) * TRACE_STEP;
      if (!insideArena(x, y, m.width, m.height, m.corner, margin) || sensors.blocked(x, y, mask)) {
        out.free = d - TRACE_STEP;
        out.near = near;
        return out;
      }
      const dt = Math.hypot(tx - x, ty - y);
      if (dt < near) near = dt;
    }
    out.free = look;
    out.near = near;
    return out;
  }

  /** Best seed to go for: value over distance, big burst seeds preferred, little behind us. */
  private pickSeed(m: ArenaMatch, me: Snake): { x: number; y: number; value: number } | null {
    const P = m.pellets;
    const reach = bySkill(this.skill, 260, 420);
    let best = -1;
    let bestScore = 0;
    const ca = Math.cos(me.angle);
    const sa = Math.sin(me.angle);
    for (let i = 0; i < P.span; i++) {
      const kind = P.kind[i]!;
      if (kind === PELLET_FREE) continue;
      const dx = P.x[i]! - me.x;
      const dy = P.y[i]! - me.y;
      if (dx > reach || dx < -reach || dy > reach || dy < -reach) continue;
      const d = Math.hypot(dx, dy);
      if (d > reach || d < 1) continue;
      const facing = (dx * ca + dy * sa) / d;
      let weight = kind === PELLET_DROP ? 1.7 : kind === PELLET_AMBIENT ? 1 : 0.8;
      // Seeds hugging the hedge are a trap: worth much less.
      if (!insideArena(P.x[i]!, P.y[i]!, m.width, m.height, m.corner, me.radius + 50)) weight *= 0.25;
      const score = ((P.value[i]! * weight) / (d + 60)) * (facing < -0.2 ? 0.35 : 1 + facing * 0.4);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best < 0 ? null : { x: P.x[best]!, y: P.y[best]!, value: P.value[best]! };
  }

  /** A spot just ahead of a nearby rival's head, worth cutting across. */
  private pickVictim(m: ArenaMatch, me: Snake): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestD = bySkill(this.skill, 160, 260);
    for (const o of m.all) {
      if (o === me || !o.alive || o.gone || m.isProtected(o)) continue;
      const d = Math.hypot(o.x - me.x, o.y - me.y);
      if (d >= bestD) continue;
      const lead = 50 + (o.boosting ? 60 : 30);
      bestD = d;
      best = { x: o.x + Math.cos(o.angle) * lead, y: o.y + Math.sin(o.angle) * lead };
    }
    return best;
  }

  private think(m: ArenaMatch, me: Snake, sensors: Sensors): void {
    const t = m.tuning;
    const look = bySkill(this.skill, 150, 320) + (me.boosting ? 90 : 0);
    // Room needed to turn away: a boosting snake turns much wider.
    const danger = me.radius * 2 + (me.boosting ? 150 : 100);
    const mask = sensors.othersMask(me.id);

    // Where would we like to go?
    let tx: number | null = null;
    let ty = 0;
    let hunting = false;
    let bigSeed = false;
    if (me.len > t.baseLen + 10 && this.rnd() < bySkill(this.skill, 0.02, 0.2)) {
      const v = this.pickVictim(m, me);
      if (v) {
        tx = v.x;
        ty = v.y;
        hunting = true;
      }
    }
    if (tx === null) {
      const seed = this.pickSeed(m, me);
      if (seed) {
        tx = seed.x;
        ty = seed.y;
        bigSeed = seed.value >= 3;
      }
    }
    if (tx === null) {
      if (m.now >= this.wanderUntil) {
        this.wander = (this.rnd() - 0.5) * 1.4;
        this.wanderUntil = m.now + 800 + this.rnd() * 1600;
      }
      // Drift back toward the middle when wandering near the edge.
      const toMid = Math.atan2(m.height / 2 - me.y, m.width / 2 - me.x);
      const edge = Math.min(me.x, m.width - me.x, me.y, m.height - me.y);
      const a = edge < 160 ? toMid : me.angle + this.wander;
      tx = me.x + Math.cos(a) * 200;
      ty = me.y + Math.sin(a) * 200;
    }
    const targetAngle = Math.atan2(ty - me.y, tx - me.x);

    // Trace every plan: room to move first, then how close it brings us to the target.
    let best = 0;
    let bestScore = Number.NEGATIVE_INFINITY;
    let ahead = look;
    for (const plan of PLANS) {
      const tr = this.trace(m, sensors, me, plan, look, mask, tx, ty);
      if (plan === 0) ahead = tr.free;
      const room = tr.free / look;
      let score = room * 3 + room * Math.max(0, 1 - tr.near / 220) * 1.4 - (Math.abs(plan) / 1000) * 0.35;
      // A little loyalty to the way we were already turning avoids dithering.
      if (Math.sign(plan) === this.turnDir && plan !== 0) score += 0.2;
      if (tr.free < danger) score -= 6 * (1 - tr.free / danger);
      if (score > bestScore) {
        bestScore = score;
        best = plan;
      }
    }

    // A human slip: the gentler the snake, the more often it fumbles a turn.
    if (this.rnd() < bySkill(this.skill, 0.016, 0.001))
      best = PLANS[1 + Math.floor(this.rnd() * (PLANS.length - 1))]!;
    // Something right ahead: look again sooner (a reflex, still slower when gentle).
    if (ahead < danger) this.nextThink = Math.min(this.nextThink, m.now + bySkill(this.skill, 150, 55));

    this.turnDir = Math.sign(best);
    this.turnUntil = m.now + Math.abs(best);

    // Boost in short bursts: for a big seed straight ahead or to cut a rival off.
    if (this.cmd.boost) {
      if (ahead < 150) this.cmd.boost = false;
      return;
    }
    const roomy = ahead >= Math.min(look, 210) && me.len > t.minBoostLen + 6;
    const aligned = Math.abs(wrapAngle(targetAngle - me.angle)) < 0.5;
    const near = Math.hypot(tx - me.x, ty - me.y) < 230;
    if (roomy && aligned && near && (bigSeed || hunting) && this.rnd() < bySkill(this.skill, 0.12, 0.6)) {
      this.cmd.boost = true;
      this.boostUntil = m.now + 350 + this.rnd() * 500;
    }
  }
}
