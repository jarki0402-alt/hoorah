/**
 * Computer runners for Obby (PRD 6.4): they follow the course route, jump at its edges, wait for
 * sliding platforms, hop over the sweeper bar, and make human slips (an early jump, a late hop
 * over the bar, a slower pace) more often when the adaptive skill is low. The same brain keeps a
 * dropped phone's runner going until it reconnects.
 */

import { rotY } from '../../shared/kotak/math';
import type { Body, KotakSim } from '../../shared/kotak/sim';
import { poseAt } from '../../shared/kotak/solids';
import { bySkill } from '../common/cpu';
import type { RoutePoint } from './course';
import type { ObbyMatch, Pilot } from './logic';

export interface PilotInput {
  x: number;
  z: number;
  jump: boolean;
}

/** Skill for a seat whose phone dropped: steady, not sharp. */
export const TAKEOVER_SKILL = 0.5;

export class RunnerBrain implements Pilot {
  private idx = 0;
  /** Edge distance at which the planned jump fires (an early slip is far too early). */
  private trigger = 0.3;
  private planned = -1;
  private lastX = -Infinity;
  private stuckFor = 0;
  private wobbleT = 0;
  private wobbleZ = 0;
  private readonly pace: number;
  private readonly slip: number;
  private readonly barMargin: number;

  private route: readonly RoutePoint[] = [];

  constructor(
    skill: number,
    private readonly rnd: () => number = Math.random,
  ) {
    this.pace = bySkill(skill, 0.74, 0.99);
    this.slip = bySkill(skill, 0.2, 0.03);
    this.barMargin = bySkill(skill, 0.15, 0.42);
  }

  /** After a respawn: aim for the first route point ahead of the body. */
  resync(m: ObbyMatch, id: number): void {
    this.route = m.course.route;
    const b = m.sim.body(id);
    if (!b) return;
    const r = this.route;
    let i = 0;
    while (i < r.length - 1 && r[i]!.x < b.pos.x + 0.2) i++;
    this.idx = Math.max(0, i);
    this.planned = -1;
    this.stuckFor = 0;
    this.lastX = b.pos.x;
  }

  think(m: ObbyMatch, id: number, dt: number): PilotInput {
    const out: PilotInput = { x: 0, z: 0, jump: false };
    const sim = m.sim;
    const b = sim.body(id);
    if (this.route !== m.course.route) this.resync(m, id);
    const route = this.route;
    if (!b || b.frozenLeft > 0 || !b.active) return out;
    if (b.pos.x > this.lastX + 0.4) {
      this.lastX = b.pos.x;
      this.stuckFor = 0;
    } else this.stuckFor += dt;

    let target = route[this.idx];
    if (!target) return out;
    // Skip points already passed (pushed ahead, conveyor, spring).
    while (
      this.idx < route.length - 1 &&
      this.passed(b, target) &&
      !target.jump &&
      target.ride === undefined
    ) {
      this.idx++;
      target = route[this.idx]!;
    }
    let tx = target.x;
    let tz = target.z;
    if (target.ride !== undefined && !target.jump) {
      // Ride target: stand in the middle of the moving platform.
      const p = poseAt(sim.solids[target.ride]!.def, sim.t);
      tx = p.x;
      tz = p.z;
      if (b.ground === target.ride && Math.hypot(b.pos.x - tx, b.pos.z - tz) < 0.6) this.advance();
    }
    if (target.lane) tz = b.pos.z;
    const dx = tx - b.pos.x;
    const dz = tz - b.pos.z;
    const dist = Math.hypot(dx, dz);

    if (target.jump) {
      if (this.planned !== this.idx) {
        this.planned = this.idx;
        this.trigger = this.rnd() < this.slip ? 0.9 + this.rnd() * 0.6 : 0.2 + this.rnd() * 0.15;
      }
      const next = route[this.idx + 1];
      const waiting =
        !!next &&
        (target.ride !== undefined
          ? !this.rideReady(sim, target.ride, next, b)
          : !!target.lane && Math.abs(b.pos.z - next.z) > 2.2);
      if (dist < this.trigger || (b.ground < 0 && b.coyoteLeft > 0 && dist < 1)) {
        if (waiting) {
          // Hold at the edge until the platform comes round.
          return out;
        }
        if (b.ground >= 0) out.jump = true;
        this.advance();
      } else if (waiting && dist < 1.2) {
        const k = Math.max(0, dist - 0.5) / dist;
        out.x = dx * k;
        out.z = dz * k;
        return out;
      }
    } else if (target.ride === undefined && (dist < 0.6 || this.passed(b, target))) {
      this.advance();
    }

    // Hop over a sweeper bar that is about to reach us.
    if (target.sweeper !== undefined && b.ground >= 0 && this.barComing(sim, target.sweeper, b))
      out.jump = true;

    // Unknown gap straight ahead with ground further on: jump it.
    if (!out.jump && b.ground >= 0 && dist > 0.3) {
      const ux = dx / dist;
      const uz = dz / dist;
      const ahead = sim.supportAt(b.pos.x + ux * 0.7, b.pos.z + uz * 0.7, b.pos.y + 0.3);
      if (ahead === null && sim.supportAt(b.pos.x + ux * 2.6, b.pos.z + uz * 2.6, b.pos.y + 0.6) !== null)
        out.jump = true;
    }
    if (this.stuckFor > 2.5) {
      out.jump = true;
      this.stuckFor = 1.2;
    }

    // A little wander so runners do not move in lockstep.
    this.wobbleT -= dt;
    if (this.wobbleT <= 0) {
      this.wobbleT = 0.6 + this.rnd() * 0.8;
      this.wobbleZ = (this.rnd() - 0.5) * 0.35;
    }
    if (dist > 0.01) {
      // Full speed into a spring: the throw needs the run-up.
      const pace = target.y - b.pos.y > 1 ? 1 : this.pace;
      const speed = Math.min(1, dist / 0.4) * pace;
      out.x = (dx / dist) * speed;
      out.z = (dz / dist) * speed + (dist > 2 ? this.wobbleZ : 0);
    }
    return out;
  }

  private advance(): void {
    this.idx = Math.min(this.route.length - 1, this.idx + 1);
  }

  private passed(b: Body, t: RoutePoint): boolean {
    return b.pos.x > t.x + 0.25 && Math.abs(b.pos.y - t.y) < 1.2;
  }

  /** Will the platform be under the landing point when we get there (about 0.45 s)? */
  private rideReady(sim: KotakSim, ride: number, next: RoutePoint, b: Body): boolean {
    const def = sim.solids[ride]!.def;
    const p = poseAt(def, sim.t + 0.42);
    const lx = next.ride === ride ? p.x : next.x;
    const lz = b.pos.z;
    const local = rotY(lx - p.x, lz - p.z, -p.yaw);
    return Math.abs(local.x) < def.half.x - 0.3 && Math.abs(local.z) < def.half.z - 0.45;
  }

  /** Does the sweeper bar pass over us within the next moment? */
  private barComing(sim: KotakSim, bar: number, b: Body): boolean {
    const def = sim.solids[bar]!.def;
    const reach = sim.tuning.radius + def.half.z + this.barMargin;
    for (const dt of [0.08, 0.16, 0.24]) {
      const p = poseAt(def, sim.t + dt);
      const l = rotY(b.pos.x - p.x, b.pos.z - p.z, -p.yaw);
      if (Math.abs(l.x) <= def.half.x + 0.2 && Math.abs(l.z) < reach) return true;
    }
    return false;
  }
}
