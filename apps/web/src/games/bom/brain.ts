/**
 * Computer runners for Bom Oper (PRD 6.4: only when one person plays, they look like normal
 * players, their skill adapts silently). With the bomb they chase the nearest runner who can take
 * it and tap OPER after a human-like moment; without it they flee from the holder, slide along
 * fences instead of hiding in corners, steer round obstacles and stroll when the bomb is far.
 */
import { bySkill } from '../common/cpu';
import type { BomMatch, Pilot } from './logic';

export class BomBrain implements Pilot {
  private react = 0;
  private wanderX = 0;
  private wanderZ = 0;
  private wanderT = 0;
  /** Which way this runner jukes along a fence (+1 / -1). */
  private readonly side: number;

  constructor(
    private readonly skill: number,
    private readonly rnd: () => number = Math.random,
  ) {
    this.side = rnd() < 0.5 ? 1 : -1;
  }

  think(m: BomMatch, id: number, dt: number): { x: number; z: number; pass: boolean } {
    const me = m.sim.body(id);
    const r = m.runner(id);
    if (!me || !r || r.out) return { x: 0, z: 0, pass: false };
    let x = 0;
    let z = 0;
    let pass = false;
    if (m.bombOf(id)) {
      let best: { x: number; z: number; d: number } | null = null;
      for (const o of m.alive()) {
        if (o.id === id || !m.canReceive(o)) continue;
        const b = m.sim.body(o.id);
        if (!b) continue;
        const lead = bySkill(this.skill, 0.05, 0.35);
        const tx = b.pos.x + b.vel.x * lead - me.pos.x;
        const tz = b.pos.z + b.vel.z * lead - me.pos.z;
        const d = Math.hypot(tx, tz);
        if (!best || d < best.d) best = { x: tx, z: tz, d };
      }
      if (best && best.d > 1e-3) {
        x = best.x / best.d;
        z = best.z / best.d;
      }
      if (m.passTarget(id)) this.react += dt;
      else this.react = 0;
      pass = this.react >= bySkill(this.skill, 0.55, 0.12);
      const a = this.avoid(m, me.pos.x, me.pos.z, 1.2);
      x += a.x * 0.6;
      z += a.z * 0.6;
    } else {
      this.react = 0;
      let threat = Infinity;
      for (const b of m.bombs) {
        if (b.exploded || b.holder === id) continue;
        const h = m.sim.body(b.holder);
        if (!h) continue;
        const dx = me.pos.x - h.pos.x;
        const dz = me.pos.z - h.pos.z;
        const d = Math.max(0.4, Math.hypot(dx, dz));
        threat = Math.min(threat, d);
        const w = (d < 9 ? 1 : 0.25) / (d * d);
        x += (dx / d) * w * 9;
        z += (dz / d) * w * 9;
      }
      // Fences push back, and running along one beats running into the corner.
      const A = m.arena;
      const edge = 2.2;
      const wx =
        me.pos.x > A.hx - edge
          ? -(me.pos.x - (A.hx - edge))
          : me.pos.x < -A.hx + edge
            ? -A.hx + edge - me.pos.x
            : 0;
      const wz =
        me.pos.z > A.hz - edge
          ? -(me.pos.z - (A.hz - edge))
          : me.pos.z < -A.hz + edge
            ? -A.hz + edge - me.pos.z
            : 0;
      x += wx * 0.9;
      z += wz * 0.9;
      if ((wx !== 0 || wz !== 0) && threat < 6) {
        const px = -z * 0.6 * this.side;
        const pz = x * 0.6 * this.side;
        x += px;
        z += pz;
      }
      const a = this.avoid(m, me.pos.x, me.pos.z, 1.6);
      x += a.x;
      z += a.z;
      this.wanderT -= dt;
      if (this.wanderT <= 0) {
        const ang = this.rnd() * Math.PI * 2;
        this.wanderX = Math.cos(ang);
        this.wanderZ = Math.sin(ang);
        this.wanderT = 1.2 + this.rnd() * 1.4;
      }
      x += this.wanderX * 0.25;
      z += this.wanderZ * 0.25;
      const len = Math.hypot(x, z);
      const want = threat < 6 ? bySkill(this.skill, 0.78, 1) : 0.45;
      if (len > 1e-3) {
        x = (x / len) * want;
        z = (z / len) * want;
      }
    }
    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    return { x, z, pass };
  }

  /** Push away from obstacles closer than `reach` (fences are handled separately). */
  private avoid(m: BomMatch, px: number, pz: number, reach: number): { x: number; z: number } {
    let x = 0;
    let z = 0;
    for (const s of m.arena.solids) {
      if (s.look === 'floor' || s.look === 'fence') continue;
      const qx = Math.max(s.pos.x - s.half.x, Math.min(px, s.pos.x + s.half.x));
      const qz = Math.max(s.pos.z - s.half.z, Math.min(pz, s.pos.z + s.half.z));
      const dx = px - qx;
      const dz = pz - qz;
      const d = Math.hypot(dx, dz);
      if (d >= reach || d < 1e-4) continue;
      const k = (reach - d) / reach;
      x += (dx / d) * k * 1.4;
      z += (dz / d) * k * 1.4;
    }
    return { x, z };
  }
}
