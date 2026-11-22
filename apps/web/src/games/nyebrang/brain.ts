/**
 * Computer runners (PRD 6.4): they look ahead in the closed-form world (lanes.ts) and hop when
 * the next cell stays clear long enough. Skill (0..1) sets how quickly they react, how far ahead
 * they look and how often they gamble on a hop without checking. The same brain steers a person's
 * runner while their phone is away.
 */
import { bySkill } from '../common/cpu';
import { COLS, gapAt, type ItemPos, isOpen, platformAt, X_MAX, X_MIN } from './lanes';
import { type Dir, type NyebrangMatch, type Runner, TUNING } from './logic';

/** Skill for a seat whose phone dropped: steady, not brilliant. */
export const TAKEOVER_SKILL = 0.5;

const SAMPLE = 0.05;

export class HopBrain {
  private nextAt = 0;
  private readonly buf: ItemPos[] = [];

  constructor(
    readonly skill: number,
    private readonly rnd: () => number = Math.random,
  ) {}

  /** A hop to make now, or null to wait. */
  decide(m: NyebrangMatch, r: Runner): Dir | null {
    if (m.phase !== 'run' || r.state !== 'run' || r.hop || r.queue.length > 0) return null;
    if (m.t < this.nextAt) return null;
    const window = bySkill(this.skill, 0.22, 0.55);
    const slip = bySkill(this.skill, 0.07, 0.008);
    const mid = (COLS - 1) / 2;
    const danger = r.row - m.cam < 2.4;
    const options: { dir: Dir; score: number }[] = [];
    const consider = (dir: Dir, base: number) => {
      const target = this.target(m, r, dir);
      if (!target) return;
      const safe = this.safe(m, target.row, target.x, m.t + TUNING.hop, window);
      if (!safe && !(dir === 'up' && this.rnd() < slip)) return;
      let score = base;
      if (dir === 'left' || dir === 'right') {
        score -= Math.abs(target.x - mid) * 0.25;
        // Sideways is worth it when the cell above the target is clear soon.
        if (this.safe(m, target.row + 1, Math.round(target.x), m.t + TUNING.hop * 2, window)) score += 2.5;
      }
      options.push({ dir, score });
    };
    consider('up', danger ? 22 : 10);
    consider('left', 2);
    consider('right', 2);
    if (this.safe(m, r.row, r.x, m.t, window + TUNING.hop)) options.push({ dir: 'up', score: Number.NaN });
    consider('down', danger ? -20 : -4);
    const hops = options.filter((o) => !Number.isNaN(o.score)).sort((a, b) => b.score - a.score);
    const canStay = options.some((o) => Number.isNaN(o.score));
    const best = hops[0];
    const react = bySkill(this.skill, 0.42, 0.13) * (0.7 + this.rnd() * 0.6);
    // Waiting is fine while the current spot holds and nothing forward is clear.
    if (!best || (canStay && best.score < 1 && !danger)) {
      this.nextAt = m.t + Math.min(0.12, react);
      return null;
    }
    this.nextAt = m.t + react;
    return best.dir;
  }

  private target(m: NyebrangMatch, r: Runner, dir: Dir): { row: number; x: number } | null {
    let row = r.row;
    let x = r.x;
    if (dir === 'up') row++;
    else if (dir === 'down') row--;
    else x += dir === 'left' ? -1 : 1;
    if (row < 0) return null;
    const lane = m.world.lane(row);
    if (lane.kind === 'river') {
      if (x < -0.35 || x > COLS - 0.65) return null;
      return { row, x };
    }
    x = Math.round(x);
    return isOpen(lane, x) ? { row, x } : null;
  }

  /** Does a runner at (row, x) from time t0 stay unhurt for `span` seconds? */
  private safe(m: NyebrangMatch, row: number, x: number, t0: number, span: number): boolean {
    const lane = m.world.lane(row);
    if (lane.kind === 'road' || lane.kind === 'rail') {
      for (let t = t0 - TUNING.hop * 0.5; t <= t0 + span; t += SAMPLE) {
        if (gapAt(lane, t, x, this.buf).gap < 0.12) return false;
      }
      return true;
    }
    if (lane.kind === 'river') {
      const plat = platformAt(lane, t0, x, this.buf);
      if (!plat) return false;
      const slot = Math.max(0, Math.min(plat.len - 1, Math.round(x - plat.left - 0.5)));
      const settled = plat.left + slot + 0.5;
      const drift = settled + lane.speed * span;
      if (drift < -0.3 || drift > COLS - 0.7) return false;
      return drift > X_MIN && drift < X_MAX;
    }
    return true;
  }
}

/** Skills of `count` computer runners around the remembered level, a little spread. */
export function fieldSkills(skill: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) =>
    Math.max(0.05, Math.min(0.95, skill + (i - (count - 1) / 2) * 0.12)),
  );
}
