/**
 * Computer runners (PRD 6.4): they read the same track the people see and send the same moves
 * through `LariRun.act`, with human flaws scaled by skill: they react a little early or late,
 * sometimes do not react at all, and wander towards coins when the roof ahead is calm.
 * The same brain runs a person's seat while their phone is disconnected.
 */
import { bySkill, wobble } from '../common/cpu';
import type { Action, LariRun, Runner } from './logic';
import { lowerBound, type Obstacle } from './track';

/** Skill of the brain that covers a dropped phone. */
export const TAKEOVER_SKILL = 0.6;

/** Seconds of run between two calm-roof decisions (coins, drifting). */
const IDLE_EVERY = 0.5;

interface Plan {
  obstacle: number;
  /** Moves still to make, in order (two lane changes for a far lane). */
  moves: Action[];
  /** Make the next move when the obstacle is this many seconds away. */
  lead: number;
}

/** Spread the computer runners around the remembered skill so the field is not uniform. */
export function fieldSkills(base: number, count: number, rnd: () => number = Math.random): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const spread = count > 1 ? (i / (count - 1) - 0.5) * 0.26 : 0;
    out.push(Math.min(0.97, Math.max(0.03, base + spread + (rnd() - 0.5) * 0.06)));
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export class RunnerBrain {
  private plan: Plan | null = null;
  private idleAt = 0;
  private moveAt = 0;
  /** Lane this runner likes to cruise in (changes now and then, spreads the pack). */
  private home = 0;
  private homeUntil = 0;

  constructor(
    readonly skill: number,
    private readonly rnd: () => number = Math.random,
  ) {
    this.home = Math.floor(rnd() * 3) - 1;
  }

  /** Called once per simulation step before `run.step`. */
  update(run: LariRun, r: Runner): void {
    if (run.phase !== 'run' || r.out || r.fallT > 0 || r.climbT > 0) return;
    const v = Math.max(4, run.speed);
    const threat = this.nextThreat(run, r, v);
    if (threat && threat.id !== this.plan?.obstacle) this.plan = this.decide(run, r, threat);
    const plan = this.plan;
    if (plan && threat && plan.obstacle === threat.id && plan.moves.length > 0 && run.t >= this.moveAt) {
      const front = threat.d - threat.len / 2 - r.d;
      if (front / v <= plan.lead) {
        const move = plan.moves.shift()!;
        run.act(r, move, 0);
        // A second lane change follows once the first is under way.
        this.moveAt = run.t + run.tuning.laneTime * 0.9;
      }
      return;
    }
    const calm = !threat || threat.d - threat.len / 2 - r.d > v * 0.9;
    if (!calm && threat && threat.d - threat.len / 2 - r.d > v * 0.6 && run.t >= this.idleAt)
      this.unpack(run, r, v);
    if (calm) this.idle(run, r, v);
  }

  /** Step out of someone's back into a safe neighbouring lane; true when it moved. */
  private unpack(run: LariRun, r: Runner, v: number): boolean {
    if (r.laneT < 1 || !this.crowded(run, r)) return false;
    this.idleAt = run.t + IDLE_EVERY;
    const prefer = this.home !== r.lane ? Math.sign(this.home - r.lane) : this.rnd() < 0.5 ? -1 : 1;
    for (const dir of [prefer, -prefer]) {
      const next = r.lane + dir;
      if (next >= -1 && next <= 1 && this.laneSafe(run, next, r.d - 1, r.d + v * 1.4)) {
        this.home = next;
        run.act(r, dir < 0 ? 'left' : 'right', 0);
        return true;
      }
    }
    return false;
  }

  /** The first obstacle ahead that matters for the lane we run (or are heading to). */
  private nextThreat(run: LariRun, r: Runner, v: number): Obstacle | null {
    const obs = run.track.obstacles;
    const horizon = r.d + v * 2.4;
    for (let i = Math.max(0, lowerBound(obs, r.d - 7)); i < obs.length; i++) {
      const o = obs[i]!;
      const front = o.d - o.len / 2;
      if (front > horizon) break;
      if (o.d + o.len / 2 < r.d - 0.2) continue;
      if (o.kind === 'gap' || o.span === 3 || o.lane === r.lane) {
        // Already past its front and clear of it: look further.
        if (front < r.d - 0.4 && o.kind !== 'block') continue;
        return o;
      }
    }
    return null;
  }

  private decide(run: LariRun, r: Runner, o: Obstacle): Plan {
    const s = this.skill;
    const noise = (gentle: number, sharp: number) => wobble(this.rnd) * bySkill(s, gentle, sharp);
    // Sometimes they simply do not see it coming.
    if (this.rnd() < bySkill(s, 0.12, 0.012)) return { obstacle: o.id, moves: [], lead: 0 };
    // A one-lane barrier: now and then step round it towards the lane we like instead.
    if ((o.kind === 'low' || o.kind === 'high') && o.span === 1 && this.home !== r.lane && this.rnd() < 0.4) {
      const next = r.lane + Math.sign(this.home - r.lane);
      if (this.rowFree(run, o, next)) {
        return {
          obstacle: o.id,
          moves: [next < r.lane ? 'left' : 'right'],
          lead: bySkill(s, 0.4, 0.62) + noise(0.15, 0.05),
        };
      }
    }
    switch (o.kind) {
      case 'low':
        return { obstacle: o.id, moves: ['jump'], lead: 0.27 + noise(0.2, 0.05) };
      case 'high':
        return { obstacle: o.id, moves: ['slide'], lead: 0.28 + noise(0.22, 0.05) };
      case 'gap':
        return { obstacle: o.id, moves: ['jump'], lead: 0.12 + noise(0.1, 0.03) };
      case 'block': {
        const target = this.escapeLane(run, r, o);
        if (target === null) return { obstacle: o.id, moves: [], lead: 0 };
        const dir: Action = target < r.lane ? 'left' : 'right';
        const moves: Action[] = Math.abs(target - r.lane) === 2 ? [dir, dir] : [dir];
        return { obstacle: o.id, moves, lead: bySkill(s, 0.34, 0.62) + noise(0.24, 0.06) };
      }
    }
  }

  /** Nearest lane in the obstacle's row without a block (ties: towards the middle). */
  private escapeLane(run: LariRun, r: Runner, o: Obstacle): number | null {
    const obs = run.track.obstacles;
    const blocked = new Set<number>();
    const soft = new Set<number>();
    for (let i = Math.max(0, lowerBound(obs, o.d - 7)); i < obs.length; i++) {
      const q = obs[i]!;
      if (q.d - q.len / 2 > o.d + o.len / 2 + 4) break;
      if (q.d + q.len / 2 < o.d - o.len / 2 - 4) continue;
      if (q.kind === 'block') blocked.add(q.lane);
      else if (q.span === 1) soft.add(q.lane);
    }
    const options = [-1, 0, 1].filter((l) => l !== r.lane && !blocked.has(l));
    if (options.length === 0) return null;
    options.sort(
      (a, b) =>
        Math.abs(a - r.lane) - Math.abs(b - r.lane) ||
        Number(soft.has(a)) - Number(soft.has(b)) ||
        Math.abs(a - this.home) - Math.abs(b - this.home),
    );
    // Sharp runners pick the best lane; gentle ones sometimes take the other free one.
    if (options.length > 1 && this.rnd() > bySkill(this.skill, 0.6, 0.95)) return options[1]!;
    return options[0]!;
  }

  /** Someone runs just ahead in the same lane. */
  private crowded(run: LariRun, r: Runner): boolean {
    for (const o of run.runners) {
      if (o === r || o.out || o.lane !== r.lane) continue;
      const gap = o.d - r.d;
      if (gap > -0.5 && gap < 4) return true;
    }
    return false;
  }

  /** True when `lane` has nothing at all in the row of `o`. */
  private rowFree(run: LariRun, o: Obstacle, lane: number): boolean {
    if (lane < -1 || lane > 1) return false;
    const obs = run.track.obstacles;
    for (let i = Math.max(0, lowerBound(obs, o.d - 7)); i < obs.length; i++) {
      const q = obs[i]!;
      if (q.d - q.len / 2 > o.d + o.len / 2 + 3) break;
      if (q.d + q.len / 2 < o.d - o.len / 2 - 3) continue;
      if (q.span === 3 || q.lane === lane) return false;
    }
    return true;
  }

  /** Calm roof: drift towards a line of coins in a neighbouring lane now and then. */
  private idle(run: LariRun, r: Runner, v: number): void {
    if (run.t < this.idleAt || r.laneT < 1) return;
    this.idleAt = run.t + IDLE_EVERY * (0.7 + this.rnd() * 0.6);
    // Runners do not like running in someone's back: pick another lane when crowded.
    if (this.unpack(run, r, v)) return;
    if (this.rnd() < bySkill(this.skill, 0.15, 0.45) && this.seekCoins(run, r, v)) return;
    if (run.t >= this.homeUntil) {
      this.home = Math.floor(this.rnd() * 3) - 1;
      this.homeUntil = run.t + 4 + this.rnd() * 6;
    }
    if (this.home !== r.lane) {
      const next = r.lane + Math.sign(this.home - r.lane);
      if (this.laneSafe(run, next, r.d - 1, r.d + v * 1.4)) run.act(r, next < r.lane ? 'left' : 'right', 0);
    }
  }

  /** Step towards a line of coins in a neighbouring lane; true when it moved or is on one. */
  private seekCoins(run: LariRun, r: Runner, v: number): boolean {
    const coins = run.track.coins;
    const W = run.tuning.laneW;
    let best: number | null = null;
    for (let i = Math.max(0, lowerBound(coins, r.d + 2)); i < coins.length; i++) {
      const c = coins[i]!;
      if (c.d > r.d + v * 1.5) break;
      if (c.taken || c.y > 1.5) continue;
      if (Math.abs(c.lane * W - r.x) < 0.5) return true;
      if (Math.abs(c.lane - r.lane) === 1 && this.laneSafe(run, c.lane, r.d, c.d + 3)) {
        best = c.lane;
        break;
      }
    }
    if (best === null) return false;
    run.act(r, best < r.lane ? 'left' : 'right', 0);
    return true;
  }

  private laneSafe(run: LariRun, lane: number, from: number, to: number): boolean {
    const obs = run.track.obstacles;
    for (let i = Math.max(0, lowerBound(obs, from - 7)); i < obs.length; i++) {
      const o = obs[i]!;
      if (o.d - o.len / 2 > to) break;
      if (o.d + o.len / 2 < from) continue;
      if (o.kind === 'block' && o.lane === lane) return false;
      if (o.kind === 'gap') return false;
    }
    return true;
  }
}
