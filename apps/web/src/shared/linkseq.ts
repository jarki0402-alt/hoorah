/**
 * Ordering for relay messages that may travel two paths at once (the server relay and a direct
 * WebRTC link). Every sender numbers its messages per recipient (`q`, from 1) inside a page
 * session (`e`, random per page load). The receiver delivers them in order, drops duplicates and
 * old ones, and skips a hole after a short wait (a message lost when a path broke).
 */

/**
 * What actually travels for the `p` and `g` channels: as the relay `data` over the server, or as
 * the whole text over a direct link. Both channels share one numbered stream per sender.
 */
export interface Envelope {
  e: string;
  q: number;
  c: 'p' | 'g';
  d: unknown;
}

export function isEnvelope(v: unknown): v is Envelope {
  if (typeof v !== 'object' || v === null) return false;
  const m = v as Record<string, unknown>;
  return (
    typeof m.e === 'string' &&
    m.e.length <= 16 &&
    Number.isInteger(m.q) &&
    (m.q as number) > 0 &&
    (m.c === 'p' || m.c === 'g') &&
    'd' in m
  );
}

export function newEpoch(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Per-recipient counters on the sending side. */
export class OutSeq {
  private readonly next = new Map<string | number, number>();

  take(to: string | number): number {
    const q = (this.next.get(to) ?? 0) + 1;
    this.next.set(to, q);
    return q;
  }
}

interface SenderState {
  epoch: string;
  expect: number;
  held: Map<number, Envelope>;
  timer: number;
}

/** How long a hole may block later messages before they are delivered anyway. */
export const GAP_WAIT_MS = 300;

type Timers = {
  set: (fn: () => void, ms: number) => number;
  clear: (id: number) => void;
};

const browserTimers: Timers = {
  set: (fn, ms) => window.setTimeout(fn, ms),
  clear: (id) => window.clearTimeout(id),
};

/** Receiving side: one ordered stream per sender. */
export class InOrder {
  private readonly senders = new Map<number, SenderState>();

  constructor(
    private readonly deliver: (from: number, env: Envelope) => void,
    private readonly timers: Timers = browserTimers,
  ) {}

  push(from: number, env: Envelope): void {
    let s = this.senders.get(from);
    if (!s || s.epoch !== env.e) {
      // A new page session on the other side starts a fresh stream wherever its numbers are.
      if (s) this.timers.clear(s.timer);
      s = { epoch: env.e, expect: env.q, held: new Map(), timer: 0 };
      this.senders.set(from, s);
    }
    if (env.q < s.expect || s.held.has(env.q)) return;
    s.held.set(env.q, env);
    this.flush(from, s);
  }

  /** Forget a sender (it left the room). */
  drop(from: number): void {
    const s = this.senders.get(from);
    if (s) this.timers.clear(s.timer);
    this.senders.delete(from);
  }

  private flush(from: number, s: SenderState): void {
    while (s.held.has(s.expect)) {
      const env = s.held.get(s.expect)!;
      s.held.delete(s.expect);
      s.expect++;
      this.deliver(from, env);
    }
    this.timers.clear(s.timer);
    s.timer = 0;
    if (s.held.size === 0) return;
    s.timer = this.timers.set(() => {
      s.timer = 0;
      // Give up on the hole: continue from the oldest message that did arrive.
      s.expect = Math.min(...s.held.keys());
      this.flush(from, s);
    }, GAP_WAIT_MS);
  }
}
