/**
 * Replays one move seed by seed over time: what the board and the hand show at any moment. The
 * Host's driver and a far-away main screen (long-distance play) both drive the board with it, so
 * the sowing looks the same on both. Pure: time comes in as `now`.
 */
import { applyStep, type Side, type Step, stepTimes } from './logic';

export interface HandAt {
  pos: number;
  n: number;
  /** How long the hand takes to get there. */
  ms: number;
}

export class SowReplay {
  readonly board: number[];
  /** Start of each step, ms after `startAt`. */
  readonly at: number[];
  hand = 0;
  applied = 0;

  constructor(
    before: readonly number[],
    readonly steps: readonly Step[],
    readonly side: Side,
    readonly startAt: number,
  ) {
    this.board = before.slice();
    this.at = stepTimes(steps).at;
  }

  get done(): boolean {
    return this.applied >= this.steps.length;
  }

  /** Applies every step due by `now` and returns them in order. */
  advance(now: number): Step[] {
    const out: Step[] = [];
    const elapsed = now - this.startAt;
    while (!this.done && this.at[this.applied]! <= elapsed) {
      const s = this.steps[this.applied]!;
      this.hand = applyStep(this.board, this.hand, s, this.side);
      this.applied++;
      out.push(s);
    }
    return out;
  }

  /** The hand hovering over the next step's hole, or null once the move is done. */
  handAt(): HandAt | null {
    if (this.done) return null;
    const next = this.steps[this.applied]!;
    const prevAt = this.applied > 0 ? this.at[this.applied - 1]! : 0;
    return { pos: next.pos, n: this.hand, ms: this.at[this.applied]! - prevAt };
  }
}
