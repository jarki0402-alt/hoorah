/**
 * Computer contestants for Lantai Runtuh (PRD 6.4): they read the rule a moment after it is shown,
 * walk to a free safe tile, keep moving in "Jangan diam", flee crumbling tiles, and now and then
 * shove someone close by. Slips (the wrong colour, a forgotten tile in the dark, a late start) are
 * more frequent when the adaptive skill is low. The same brain covers a dropped phone.
 */
import { bySkill } from '../common/cpu';
import { TILE, tileCenter } from './arena';
import type { Pilot, RuntuhMatch } from './logic';

export const TAKEOVER_SKILL = 0.5;

export class ContestantBrain implements Pilot {
  private target = -1;
  /** Call / wave this decision belongs to, so a new call triggers a new choice. */
  private decidedFor = '';
  private waitLeft = 0;
  private hopLeft = 0;
  /** A wrongly chosen tile (a slip) is kept until the next call. */
  private slipTarget = -1;
  private readonly react: number;
  private readonly slip: number;
  private readonly darkSlip: number;
  private readonly pushRate: number;

  constructor(
    skill: number,
    private readonly rnd: () => number = Math.random,
  ) {
    this.react = bySkill(skill, 1.1, 0.35);
    this.slip = bySkill(skill, 0.24, 0.03);
    this.darkSlip = bySkill(skill, 0.4, 0.08);
    this.pushRate = bySkill(skill, 0.06, 0.2);
  }

  think(m: RuntuhMatch, id: number, dt: number): { x: number; z: number; push: boolean } {
    const out = { x: 0, z: 0, push: false };
    const b = m.sim.body(id);
    if (!b?.active || b.frozenLeft > 0) return out;
    const here = m.tileOf(id);
    const key = `${m.round}:${m.callIndex}:${m.callStage === 'show' || m.callStage === 'count' ? 'c' : 'x'}`;
    if (key !== this.decidedFor) {
      this.decidedFor = key;
      this.waitLeft = this.react * (0.6 + this.rnd() * 0.8);
      this.target = -1;
    }
    this.waitLeft -= dt;
    const call = m.call;
    const inCall = call && (m.callStage === 'show' || m.callStage === 'count');
    const solid = (i: number) => m.sim.solids[i]?.state === 'solid';
    const hereBad =
      here >= 0 && (m.sim.solids[here]?.state !== 'solid' || (m.rule === 'diam' && m.stillFor(id) > 0.55));
    if (this.waitLeft <= 0 || hereBad) {
      const safe = inCall ? call.targets : m.safeTiles().filter(solid);
      const needNew =
        this.target < 0 ||
        !solid(this.target) ||
        (inCall && !call.targets.includes(this.target) && this.target !== this.slipTarget) ||
        (m.rule === 'diam' && this.target === here && m.stillFor(id) > 0.4);
      if (needNew && safe.length > 0)
        this.target = this.choose(m, id, safe, inCall ? (m.rule === 'gelap' ? this.darkSlip : this.slip) : 0);
    }
    if (this.target >= 0) {
      const c = tileCenter(this.target);
      // In "Jangan diam" keep hopping between tiles.
      if (m.rule === 'diam') {
        this.hopLeft -= dt;
        if (this.hopLeft <= 0 && here === this.target) {
          this.hopLeft = 0.5 + this.rnd() * 0.3;
          const near = m
            .safeTiles()
            .filter((i) => solid(i) && i !== here && dist(tileCenter(i), c) <= TILE * 1.05);
          if (near.length > 0) this.target = near[Math.floor(this.rnd() * near.length)]!;
        }
      }
      const t = tileCenter(this.target);
      const dx = t.x - b.pos.x;
      const dz = t.z - b.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.18) {
        const k = Math.min(1, d / 0.6);
        out.x = (dx / d) * k;
        out.z = (dz / d) * k;
      }
    }
    // An occasional shove at a neighbour.
    if (m.pushRest(id) <= 0 && this.rnd() < this.pushRate * dt) {
      for (const o of m.sim.bodies) {
        if (o.id === id || !o.active) continue;
        if (Math.hypot(o.pos.x - b.pos.x, o.pos.z - b.pos.z) < 1.5) {
          out.push = true;
          // Face the target before shoving.
          out.x = o.pos.x - b.pos.x;
          out.z = o.pos.z - b.pos.z;
          break;
        }
      }
    }
    return out;
  }

  /** Nearest free safe tile; with a slip, a random (possibly wrong) one instead. */
  private choose(m: RuntuhMatch, id: number, safe: readonly number[], slip: number): number {
    const b = m.sim.body(id)!;
    if (slip > 0 && this.rnd() < slip) {
      const wrong = m.sim.solids.filter((s) => s.state === 'solid' && !safe.includes(s.id));
      const pick = wrong[Math.floor(this.rnd() * wrong.length)];
      if (pick) {
        this.slipTarget = pick.id;
        return pick.id;
      }
    }
    this.slipTarget = -1;
    const taken = new Set<number>();
    for (const o of m.sim.bodies) if (o.id !== id && o.active) taken.add(m.tileOf(o.id));
    let best = -1;
    let bestD = Infinity;
    for (const i of safe) {
      const c = tileCenter(i);
      const d = dist(c, { x: b.pos.x, z: b.pos.z }) + (taken.has(i) ? 2.5 : 0) + this.rnd() * 0.6;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }
}

function dist(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
