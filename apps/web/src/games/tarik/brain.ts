/**
 * The computer tapper of Tarik Tambang (PRD 6.4): plays a seat when someone plays alone, and takes
 * over a seat whose phone dropped mid-game. Pure: time (synced server ms) and randomness come in
 * from outside, so it is unit-tested and the director only turns its timestamps into taps through
 * the same `TarikMatch.input` path human taps use.
 *
 * What makes it read as a person rather than a metronome:
 *  - a base rate by skill (about 4.5 taps/s gentle to 8.5 taps/s sharp) with per-tap jitter;
 *  - a slow wave in the rate, short bursts (more often when its side is losing), small pauses;
 *  - fatigue over a round, recovered between rounds;
 *  - super pulls: it sometimes goes quiet before the ring closes and taps on the line, more often
 *    and more precisely at higher skill, and it misses some.
 */
import { bySkill, wobble } from '../common/cpu';

/** The super-pull ring in server time, plus the timing rules a super tap must respect. */
export interface Ring {
  start: number;
  period: number;
  /** A tap within this many ms of a cycle's end is a super. */
  window: number;
  /** No tap from the player in this span before the window. */
  quiet: number;
}

export interface PullContext {
  ring: Ring | null;
  /** -1..1, positive when this brain's side is losing (rope toward the other side). */
  behind: number;
}

/** Hard ceiling, well under the match's 16 taps/s auto-clicker guard. */
export const BRAIN_MAX_RATE = 11;
/** No interval is ever shorter than this, so no one-second window can exceed 12 taps. */
const MIN_INTERVAL_MS = 1000 / 12;
/** A longer gap between updates (pause, hidden tab) drops the backlog instead of replaying it. */
const GAP_RESET_MS = 300;

/** Seat skill for a phone that dropped: a fair, middle-of-the-road teammate. */
export const TAKEOVER_SKILL = 0.5;

export class PullBrain {
  readonly skill: number;
  private readonly rnd: () => number;
  private readonly base: number;
  private readonly wavePeriod: number;
  private readonly wavePhase: number;
  private roundStart = 0;
  private nextAt = Number.NaN;
  private lastUpdate = Number.NaN;
  private burstUntil = Number.NEGATIVE_INFINITY;
  private burstGain = 1;
  /** Ring cycle the super decision was made for. */
  private plannedCycle = -1;
  /** Planned super tap time and the moment it starts holding still for it; NaN when none. */
  private superAt = Number.NaN;
  private quietFrom = Number.NaN;

  constructor(skill: number, rnd: () => number = Math.random) {
    this.skill = Math.min(1, Math.max(0, skill));
    this.rnd = rnd;
    // Every brain has its own natural pace around its skill.
    this.base = bySkill(this.skill, 4.5, 8.5) * (1 + 0.05 * wobble(rnd));
    this.wavePeriod = 5_000 + 4_000 * rnd();
    this.wavePhase = rnd() * Math.PI * 2;
  }

  /** A new round's pull starts at server time `now`: rested arms, a human reaction delay. */
  startRound(now: number): void {
    this.roundStart = now;
    this.nextAt = now + bySkill(this.skill, 340, 170) * (1 + 0.4 * wobble(this.rnd));
    this.lastUpdate = now;
    this.burstUntil = Number.NEGATIVE_INFINITY;
    this.plannedCycle = -1;
    this.superAt = Number.NaN;
    this.quietFrom = Number.NaN;
  }

  /** Server timestamps of the taps due by `now`, oldest first. Call it every frame during a pull. */
  update(now: number, ctx: PullContext): number[] {
    if (Number.isNaN(this.nextAt)) this.startRound(now);
    if (now - this.lastUpdate > GAP_RESET_MS) {
      // Lossy input is never replayed: pick up from now.
      this.nextAt = Math.max(this.nextAt, now + MIN_INTERVAL_MS * (1 + this.rnd()));
      this.superAt = Number.NaN;
      this.quietFrom = Number.NaN;
    }
    this.lastUpdate = now;
    const out: number[] = [];
    while (this.nextAt <= now) {
      const at = this.nextAt;
      out.push(Math.round(at));
      this.nextAt = this.schedule(at, ctx);
    }
    return out;
  }

  /** Current tap rate (taps/s) at server time `at`. Exposed for tests. */
  rateAt(at: number): number {
    const elapsed = Math.max(0, at - this.roundStart) / 1000;
    const fatigue = 1 - bySkill(this.skill, 0.16, 0.07) * Math.min(1, elapsed / 40);
    const wave = 1 + 0.06 * Math.sin((2 * Math.PI * at) / this.wavePeriod + this.wavePhase);
    const burst = at < this.burstUntil ? this.burstGain : 1;
    return Math.min(BRAIN_MAX_RATE, Math.max(2.5, this.base * fatigue * wave * burst));
  }

  private schedule(from: number, ctx: PullContext): number {
    const rnd = this.rnd;
    const s = this.skill;
    // Bursts: a spurt of effort, more likely when the rope is going the wrong way.
    if (from >= this.burstUntil) {
      const chance = bySkill(s, 0.004, 0.009) + (ctx.behind > 0.2 ? bySkill(s, 0.006, 0.014) : 0);
      if (rnd() < chance) {
        this.burstUntil = from + 800 + 1_200 * rnd();
        this.burstGain = 1.1 + 0.15 * rnd();
      }
    }
    let interval = (1000 / this.rateAt(from)) * (1 + bySkill(s, 0.3, 0.18) * wobble(rnd));
    // A breath or a grip change now and then.
    if (rnd() < bySkill(s, 0.025, 0.008)) interval += 150 + 300 * rnd();
    let next = from + Math.max(MIN_INTERVAL_MS, interval);

    if (ctx.ring) this.planSuper(from, ctx.ring);
    if (!Number.isNaN(this.superAt) && this.superAt > from) {
      if (next >= this.quietFrom) {
        // Hold still, then tap on the line.
        next = Math.max(this.superAt, from + MIN_INTERVAL_MS);
        this.superAt = Number.NaN;
        this.quietFrom = Number.NaN;
      }
    } else if (!Number.isNaN(this.superAt)) {
      this.superAt = Number.NaN;
      this.quietFrom = Number.NaN;
    }
    return next;
  }

  /** Decide once per ring cycle whether to go for a super, and when exactly to tap. */
  private planSuper(from: number, ring: Ring): void {
    const n = Math.floor((from - ring.start) / ring.period) + 1;
    if (n < 1 || n === this.plannedCycle) return;
    const end = ring.start + n * ring.period;
    // Too late to go quiet for this cycle.
    if (from > end - ring.window - ring.quiet - 40) return;
    this.plannedCycle = n;
    const s = this.skill;
    const attempt = Math.max(0, bySkill(s, -0.12, 0.7));
    if (this.rnd() >= attempt) return;
    const sd = bySkill(s, 110, 34);
    this.superAt = end + wobble(this.rnd) * 3 * sd;
    // Sharper players wait a little longer than strictly needed; gentle ones sometimes too little.
    const margin = bySkill(s, -20, 45) + 25 * wobble(this.rnd);
    this.quietFrom = end - ring.window - ring.quiet - margin;
  }
}
