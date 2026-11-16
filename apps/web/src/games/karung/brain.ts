/**
 * The computer racer of Balap Karung (PRD 6.4): races a lane when someone plays alone, and takes
 * over a lane whose phone dropped mid-race. Pure: time (synced server ms) and randomness come in
 * from outside, so it is unit-tested and the director only turns its timestamps into taps through
 * the same `KarungMatch.input` path phone taps use.
 *
 * It aims one tap at every beat of the 98 bpm grid. Skill sets how far off it lands:
 *  - gentle: wide timing spread, so many short hops and the odd stumble (two taps on one beat);
 *  - sharp: tight spread, so long on-beat streaks and regular super hops.
 * On top of that it drifts slowly early or late like a person, skips a beat now and then and
 * sometimes double-taps by mistake. Never perfect, never metronomic.
 */
import { bySkill, wobble } from '../common/cpu';

/** The race's beat grid, in server time. */
export interface BeatGrid {
  /** Server time of beat 0. */
  anchor: number;
  beatMs: number;
  /** Server time of the go beat; nothing is aimed before it. */
  startAt: number;
}

/** A longer gap between updates (pause, hidden tab) drops the backlog instead of replaying it. */
const GAP_RESET_MS = 300;

/** Lane skill for a phone that dropped: a fair, middle-of-the-road racer. */
export const TAKEOVER_SKILL = 0.5;

/**
 * Skills of the solo opponents around the remembered level: one a bit sharper, one a bit gentler,
 * the rest in between, so the field is not three clones.
 */
export function fieldSkills(skill: number, count: number): number[] {
  const spread = [0.12, 0, -0.12, 0.06, -0.06];
  return Array.from({ length: count }, (_, i) => Math.min(1, Math.max(0, skill + (spread[i] ?? 0))));
}

export class HopBrain {
  readonly skill: number;
  private readonly rnd: () => number;
  /** Timing spread (ms, about one standard deviation). */
  private readonly spread: number;
  /** Personal tendency to tap early (negative) or late. */
  private readonly lean: number;
  private grid: BeatGrid | null = null;
  private nextBeat = 0;
  private drift = 0;
  private queue: number[] = [];
  private lastUpdate = Number.NaN;

  constructor(skill: number, rnd: () => number = Math.random) {
    this.skill = Math.min(1, Math.max(0, skill));
    this.rnd = rnd;
    this.spread = bySkill(this.skill, 165, 52) * (1 + 0.08 * wobble(rnd));
    this.lean = 0.25 * this.spread * wobble(rnd);
  }

  /** Aim at the race on `grid`. Pass `now` when joining a race already under way. */
  startRace(grid: BeatGrid, now = Number.NEGATIVE_INFINITY): void {
    this.grid = grid;
    this.queue = [];
    this.drift = 0;
    this.lastUpdate = Number.NaN;
    const startBeat = Math.round((grid.startAt - grid.anchor) / grid.beatMs);
    const nowBeat = Math.ceil((now - grid.anchor) / grid.beatMs) + 1;
    this.nextBeat = Math.max(startBeat, Number.isFinite(nowBeat) ? nowBeat : startBeat);
    // A slow reaction misses the go beat.
    if (this.nextBeat === startBeat && this.rnd() < bySkill(this.skill, 0.45, 0.06)) this.nextBeat++;
  }

  /** Server timestamps of the taps due by `now`, oldest first. Call it every frame during a race. */
  update(now: number): number[] {
    const g = this.grid;
    if (!g) return [];
    if (!Number.isNaN(this.lastUpdate) && now - this.lastUpdate > GAP_RESET_MS) {
      // Lossy input is never replayed: forget missed taps and pick up at the next beat.
      this.queue = this.queue.filter((at) => at > now);
      this.nextBeat = Math.max(this.nextBeat, Math.ceil((now - g.anchor) / g.beatMs) + 1);
    }
    this.lastUpdate = now;
    // Plan one beat ahead: no planned error reaches back further than that.
    while (g.anchor + (this.nextBeat - 1) * g.beatMs <= now) this.plan(this.nextBeat++);
    let n = 0;
    while (n < this.queue.length && this.queue[n]! <= now) n++;
    if (n === 0) return [];
    return this.queue.splice(0, n).map((at) => Math.round(at));
  }

  private plan(beat: number): void {
    const g = this.grid;
    if (!g) return;
    const rnd = this.rnd;
    const s = this.skill;
    // Timing drifts like a person's: a slow random walk, pulled back toward the beat.
    this.drift = this.drift * 0.8 + 0.15 * this.spread * wobble(rnd);
    if (rnd() < bySkill(s, 0.06, 0.02)) return; // lost the beat for a moment
    const at = g.anchor + beat * g.beatMs + this.lean + this.drift + 3 * this.spread * wobble(rnd);
    this.push(at);
    // An excited double tap: two taps on one beat make the racer stumble.
    if (rnd() < bySkill(s, 0.035, 0.006)) this.push(at + 70 + 110 * rnd());
  }

  private push(at: number): void {
    const q = this.queue;
    let i = q.length;
    while (i > 0 && q[i - 1]! > at) i--;
    q.splice(i, 0, at);
  }
}
