/**
 * Generated commentator lines for the TV ticker. Pure: driven by events and periodic samples
 * with explicit time; randomness is injected.
 */
import type { Team } from './logic';
import { formatRate, STR } from './strings';

export interface TickerLine {
  /** Changes with every new line so the HUD can animate it in. */
  key: number;
  bold: string;
  text: string;
}

export type CommentEvent =
  | { type: 'roundStart'; round: number; decider: boolean }
  | { type: 'super'; name: string; combo: number; rival: string | null }
  | { type: 'warning' }
  | { type: 'suddenDeath' }
  | { type: 'roundEnd'; round: number; winner: Team | null };

export interface CommentSample {
  /** Rope position, negative = Merah leads. */
  p: number;
  /** Fastest connected tapper right now. */
  fastest: { name: string; rate: number } | null;
}

/** Minimum time a line stays before an equal or lower priority line may replace it. */
export const HOLD_MS = 2800;
const FILLER_AFTER_MS = 7000;
const FAST_EVERY_MS = 9000;
const FAST_RATE = 9;
const LEAD_EPS = 0.08;
const COMEBACK_DEFICIT = 0.35;
const COMEBACK_GAIN = 0.2;
const NEAR_WIN = 0.75;

export class Commentator {
  private line: TickerLine | null = null;
  private shownAt = Number.NEGATIVE_INFINITY;
  private priority = 0;
  private keyCounter = 0;
  private leader: Team | null = null;
  private readonly worst: Record<Team, number> = { red: 0, blue: 0 };
  private readonly comebackSaid: Record<Team, boolean> = { red: false, blue: false };
  private readonly nearSaid: Record<Team, boolean> = { red: false, blue: false };
  private lastFast = Number.NEGATIVE_INFINITY;
  private lastFiller = -1;

  constructor(private readonly rng: () => number = Math.random) {}

  get current(): TickerLine | null {
    return this.line;
  }

  /** New round: forget per-round memory (lead, comeback, near-win). */
  resetRound(): void {
    this.leader = null;
    this.worst.red = 0;
    this.worst.blue = 0;
    this.comebackSaid.red = false;
    this.comebackSaid.blue = false;
    this.nearSaid.red = false;
    this.nearSaid.blue = false;
  }

  /** Returns true when the shown line changed. */
  event(e: CommentEvent, t: number): boolean {
    switch (e.type) {
      case 'roundStart':
        return this.say(e.decider ? STR.tickFinalRound : STR.tickRoundStart(e.round), 3, t);
      case 'super':
        if (e.combo >= 3) return this.say(STR.tickSuperStreak(e.name, e.combo, e.rival), 4, t);
        return this.say(STR.tickSuper(e.name), 1, t);
      case 'warning':
        return this.say(STR.tickWarning, 4, t);
      case 'suddenDeath':
        return this.say(STR.tickSuddenDeath, 5, t);
      case 'roundEnd':
        return this.say(e.winner ? STR.tickRoundEnd(e.winner, e.round) : STR.tickDraw, 6, t);
    }
  }

  /** Periodic look at the rope; returns true when the shown line changed. */
  sample(s: CommentSample, t: number): boolean {
    const lead: Team | null = s.p < -LEAD_EPS ? 'red' : s.p > LEAD_EPS ? 'blue' : null;
    // Track how far each side has fallen behind this round, for comeback lines.
    if (s.p > 0) this.worst.red = Math.max(this.worst.red, s.p);
    if (s.p < 0) this.worst.blue = Math.max(this.worst.blue, -s.p);
    if (lead && lead !== this.leader) {
      const first = this.leader === null;
      this.leader = lead;
      if (this.say(first ? STR.tickFirstLead(lead) : STR.tickLeadChange(lead), first ? 2 : 3, t)) return true;
    }
    for (const team of ['red', 'blue'] as const) {
      const deficit = team === 'red' ? Math.max(0, s.p) : Math.max(0, -s.p);
      if (!this.comebackSaid[team] && this.worst[team] >= COMEBACK_DEFICIT) {
        if (this.worst[team] - deficit >= COMEBACK_GAIN) {
          this.comebackSaid[team] = true;
          if (this.say(STR.tickComeback(team), 3, t)) return true;
        }
      }
      const progress = team === 'red' ? -s.p : s.p;
      if (!this.nearSaid[team] && progress >= NEAR_WIN) {
        this.nearSaid[team] = true;
        if (this.say(STR.tickNearWin(team), 3, t)) return true;
      }
    }
    if (s.fastest && s.fastest.rate >= FAST_RATE && t - this.lastFast >= FAST_EVERY_MS) {
      if (this.say(STR.tickFast(s.fastest.name, formatRate(s.fastest.rate)), 2, t)) {
        this.lastFast = t;
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
