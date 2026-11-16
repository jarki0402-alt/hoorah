/**
 * Pak RT's loudspeaker lines on the main screen. Pure: fed with events and explicit time,
 * randomness injected. A new line replaces the current one if it is at least as important,
 * or once the current one has been up for HOLD_MS.
 */
import { BITES } from './logic';
import { STR } from './strings';

export interface Line {
  /** Changes with every new line so the HUD can animate it in. */
  key: number;
  bold: string;
  text: string;
}

export type CommentEvent =
  | { type: 'go' }
  | { type: 'bite'; name: string; bites: number; perfect: boolean; firstOfRound: boolean }
  | { type: 'choke'; name: string }
  | { type: 'warn' }
  | { type: 'finish'; name: string; solo?: boolean }
  | { type: 'time' };

export const HOLD_MS = 2400;
export const FILLER_MS = 6500;

export class Commentator {
  private line: Line | null = null;
  private shownAt = Number.NEGATIVE_INFINITY;
  private priority = 0;
  private seq = 0;
  private lastFiller = -1;

  constructor(private readonly rng: () => number = Math.random) {}

  get current(): Line | null {
    return this.line;
  }

  clear(): void {
    this.line = null;
    this.priority = 0;
  }

  /** Returns true when the line changed. */
  event(e: CommentEvent, now: number): boolean {
    switch (e.type) {
      case 'go':
        return this.say(STR.cGo, 3, now);
      case 'bite':
        if (e.bites === BITES - 1) return this.say(STR.cLast(e.name), 3, now);
        if (e.firstOfRound) return this.say(STR.cFirst(e.name), 2, now);
        if (e.perfect) return this.say(STR.cPerfect(e.name), 1, now);
        if (e.bites === Math.ceil(BITES / 2)) return this.say(STR.cHalf(e.name), 1, now);
        return false;
      case 'choke':
        return this.say(STR.cChoke(e.name), 2, now);
      case 'warn':
        return this.say(STR.cWarn, 3, now);
      case 'finish':
        return this.say(e.solo ? STR.cFinishSolo(e.name) : STR.cFinish(e.name), 4, now);
      case 'time':
        return this.say(STR.cTime, 4, now);
    }
  }

  /** While the round runs: a filler line when nothing happened for a while. */
  idle(now: number): boolean {
    if (now - this.shownAt < FILLER_MS) return false;
    const n = STR.cFillers.length;
    let i = Math.floor(this.rng() * n) % n;
    if (i === this.lastFiller) i = (i + 1) % n;
    this.lastFiller = i;
    return this.say(STR.cFillers[i]!, 0, now, true);
  }

  private say(parts: readonly [string, string], priority: number, now: number, force = false): boolean {
    if (!force && this.line && priority < this.priority && now - this.shownAt < HOLD_MS) return false;
    this.line = { key: ++this.seq, bold: parts[0], text: parts[1] };
    this.priority = priority;
    this.shownAt = now;
    return true;
  }
}
