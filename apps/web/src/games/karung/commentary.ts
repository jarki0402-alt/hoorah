/**
 * Generated commentator lines for the main screen ticker. Pure: driven by events and periodic
 * samples with explicit time; randomness is injected.
 */
import { STR } from './strings';

export interface TickerLine {
  /** Changes with every new line so the HUD can animate it in. */
  key: number;
  bold: string;
  text: string;
}

export type CommentEvent =
  | { type: 'start'; race: number; final: boolean }
  | { type: 'super'; name: string }
  | { type: 'streak'; name: string; streak: number }
  | { type: 'stumble'; name: string }
  | { type: 'finish'; name: string; first: boolean }
  | { type: 'lastCall' }
  | { type: 'warning' }
  | { type: 'photo' }
  | { type: 'raceEnd'; name: string | null; race: number };

export interface CommentSample {
  /** Racers in live order: name and distance. */
  order: readonly { id: number; name: string; dist: number }[];
}

/** Minimum time a line stays before an equal or lower priority line may replace it. */
export const HOLD_MS = 2600;
const FILLER_AFTER_MS = 6500;
const CLOSE_GAP = 0.8;
const CLOSE_EVERY_MS = 9000;
const STUMBLE_EVERY_MS = 5000;

export class Commentator {
  private line: TickerLine | null = null;
  private shownAt = Number.NEGATIVE_INFINITY;
  private priority = 0;
  private keyCounter = 0;
  private leader: number | null = null;
  private lastClose = Number.NEGATIVE_INFINITY;
  private lastStumble = Number.NEGATIVE_INFINITY;
  private lastFiller = -1;

  constructor(private readonly rng: () => number = Math.random) {}

  get current(): TickerLine | null {
    return this.line;
  }

  /** New race: forget who led. */
  resetRace(): void {
    this.leader = null;
    this.lastClose = Number.NEGATIVE_INFINITY;
  }

  /** Returns true when the shown line changed. */
  event(e: CommentEvent, t: number): boolean {
    switch (e.type) {
      case 'start':
        return this.say(e.final ? STR.tickFinal : STR.tickStart(e.race), 3, t);
      case 'super':
        return this.say(STR.tickSuper(e.name), 1, t);
      case 'streak':
        return this.say(STR.tickStreak(e.name, e.streak), 2, t);
      case 'stumble':
        if (t - this.lastStumble < STUMBLE_EVERY_MS) return false;
        if (!this.say(STR.tickStumble(e.name), 2, t)) return false;
        this.lastStumble = t;
        return true;
      case 'finish':
        return this.say(STR.tickFinish(e.name), e.first ? 5 : 3, t);
      case 'lastCall':
        return this.say(STR.tickLastCall, 4, t);
      case 'warning':
        return this.say(STR.tickWarning, 4, t);
      case 'photo':
        return this.say(STR.tickPhoto, 6, t);
      case 'raceEnd':
        return e.name ? this.say(STR.tickRaceEnd(e.name, e.race), 6, t) : false;
    }
  }

  /** Periodic look at the field; returns true when the shown line changed. */
  sample(s: CommentSample, t: number): boolean {
    const first = s.order[0];
    const second = s.order[1];
    if (first && first.dist > 0 && (!second || first.dist > second.dist) && first.id !== this.leader) {
      const isFirst = this.leader === null;
      this.leader = first.id;
      if (this.say(isFirst ? STR.tickLead(first.name) : STR.tickLeadChange(first.name), isFirst ? 2 : 3, t))
        return true;
    }
    if (
      first &&
      second &&
      second.dist > 3 &&
      first.dist - second.dist <= CLOSE_GAP &&
      t - this.lastClose >= CLOSE_EVERY_MS
    ) {
      if (this.say(STR.tickClose(first.name, second.name), 2, t)) {
        this.lastClose = t;
        return true;
      }
    }
    if (t - this.shownAt >= FILLER_AFTER_MS) {
      const fillers = STR.tickFillers;
      let i = Math.floor(this.rng() * fillers.length) % fillers.length;
      if (i === this.lastFiller) i = (i + 1) % fillers.length;
      this.lastFiller = i;
      return this.say({ bold: '', text: fillers[i] ?? '' }, 0, t);
    }
    return false;
  }

  private say(line: { bold: string; text: string }, priority: number, t: number): boolean {
    if (this.line && t - this.shownAt < HOLD_MS && priority <= this.priority) return false;
    this.line = { key: ++this.keyCounter, bold: line.bold, text: line.text };
    this.shownAt = t;
    this.priority = priority;
    return true;
  }
}
