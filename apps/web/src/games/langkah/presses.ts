/**
 * Every arrow press reaches the main screen twice: as a fast frame (may be lost) and as a reliable
 * action (never lost), both carrying the phone's tap counter and press time. `PressQueue` keeps
 * the first copy of each counter, drops the second, and hands presses out in counter order, so a
 * late reliable copy of a lost frame is judged before the presses that came after it. A gap that
 * stays open longer than `waitMs` (a press that never arrives at all) is skipped. Pure.
 */
import { u16Delta } from '@hoorah/protocol';
import type { Dir } from './logic';

export interface Press {
  counter: number;
  dir: Dir;
  /** Phone press time (server clock, ms). */
  atMs: number;
}

/** Counters further apart than this are a reload or reconnect, not a burst of presses. */
const WINDOW = 64;

interface Lane {
  /** Last counter handed out. */
  last: number;
  pending: Map<number, { press: Press; since: number }>;
}

export class PressQueue {
  private readonly lanes = new Map<number, Lane>();

  constructor(private readonly waitMs = 250) {}

  /** A press from either path. Returns the presses now ready, oldest first. */
  push(id: number, press: Press, nowMs: number): Press[] {
    const c = press.counter & 0xffff;
    let lane = this.lanes.get(id);
    if (!lane) {
      lane = { last: (c - 1) & 0xffff, pending: new Map() };
      this.lanes.set(id, lane);
    }
    const d = u16Delta(lane.last, c);
    if (d === 0 || d > 0xffff - WINDOW) return [];
    if (d > WINDOW) {
      // The phone's counter restarted: start over from this press.
      lane.last = (c - 1) & 0xffff;
      lane.pending.clear();
    }
    if (lane.pending.has(c)) return [];
    lane.pending.set(c, { press: { ...press, counter: c }, since: nowMs });
    return this.drain(lane);
  }

  /** Presses released because the gap before them waited too long, oldest first. */
  flush(nowMs: number): { id: number; press: Press }[] {
    const out: { id: number; press: Press }[] = [];
    for (const [id, lane] of this.lanes) {
      if (lane.pending.size === 0) continue;
      let oldest = Number.POSITIVE_INFINITY;
      let first = -1;
      let firstD = Number.POSITIVE_INFINITY;
      for (const [c, p] of lane.pending) {
        oldest = Math.min(oldest, p.since);
        const d = u16Delta(lane.last, c);
        if (d < firstD) {
          firstD = d;
          first = c;
        }
      }
      if (nowMs - oldest < this.waitMs) continue;
      lane.last = (first - 1) & 0xffff;
      for (const press of this.drain(lane)) out.push({ id, press });
    }
    return out;
  }

  forget(id: number): void {
    this.lanes.delete(id);
  }

  private drain(lane: Lane): Press[] {
    const out: Press[] = [];
    for (;;) {
      const next = (lane.last + 1) & 0xffff;
      const p = lane.pending.get(next);
      if (!p) break;
      lane.pending.delete(next);
      lane.last = next;
      out.push(p.press);
    }
    return out;
  }
}
