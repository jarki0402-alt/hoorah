import { describe, expect, it } from 'vitest';
import { InOrder, isEnvelope, OutSeq } from './linkseq';

function fakeTimers() {
  let id = 0;
  const pending = new Map<number, () => void>();
  return {
    timers: {
      set: (fn: () => void) => {
        pending.set(++id, fn);
        return id;
      },
      clear: (t: number) => {
        pending.delete(t);
      },
    },
    fire() {
      const fns = [...pending.values()];
      pending.clear();
      for (const fn of fns) fn();
    },
    count: () => pending.size,
  };
}

describe('link ordering', () => {
  it('numbers messages per recipient', () => {
    const out = new OutSeq();
    expect([out.take(1), out.take(1), out.take(2), out.take('screen'), out.take(1)]).toEqual([1, 2, 1, 1, 3]);
  });

  it('recognises envelopes only', () => {
    expect(isEnvelope({ e: 'ab', q: 1, c: 'p', d: null })).toBe(true);
    expect(isEnvelope({ e: 'ab', q: 1, c: 'r', d: null })).toBe(false);
    expect(isEnvelope({ k: 'view' })).toBe(false);
    expect(isEnvelope({ e: 'ab', q: 0, d: 1 })).toBe(false);
    expect(isEnvelope({ e: 'x'.repeat(40), q: 1, d: 1 })).toBe(false);
  });

  it('delivers in order across two paths and drops duplicates', () => {
    const t = fakeTimers();
    const got: unknown[] = [];
    const io = new InOrder((_from, env) => got.push(env.d), t.timers);
    io.push(1, { e: 'a', q: 1, c: 'g', d: 'one' });
    io.push(1, { e: 'a', q: 3, c: 'g', d: 'three' }); // fast path overtakes
    expect(got).toEqual(['one']);
    io.push(1, { e: 'a', q: 2, c: 'g', d: 'two' }); // slow path catches up
    expect(got).toEqual(['one', 'two', 'three']);
    io.push(1, { e: 'a', q: 2, c: 'g', d: 'two again' });
    expect(got).toEqual(['one', 'two', 'three']);
    expect(t.count()).toBe(0);
  });

  it('skips a hole after waiting', () => {
    const t = fakeTimers();
    const got: unknown[] = [];
    const io = new InOrder((_from, env) => got.push(env.d), t.timers);
    io.push(2, { e: 'a', q: 1, c: 'g', d: 1 });
    io.push(2, { e: 'a', q: 3, c: 'g', d: 3 });
    io.push(2, { e: 'a', q: 4, c: 'g', d: 4 });
    expect(got).toEqual([1]);
    t.fire();
    expect(got).toEqual([1, 3, 4]);
    io.push(2, { e: 'a', q: 2, c: 'g', d: 2 }); // the lost one arriving late is dropped
    expect(got).toEqual([1, 3, 4]);
  });

  it('starts over when the sender reloads, and keeps senders apart', () => {
    const t = fakeTimers();
    const got: string[] = [];
    const io = new InOrder((from, env) => got.push(`${from}:${String(env.d)}`), t.timers);
    io.push(1, { e: 'a', q: 5, c: 'g', d: 'x' });
    io.push(3, { e: 'z', q: 1, c: 'g', d: 'other' });
    io.push(1, { e: 'b', q: 1, c: 'g', d: 'fresh' });
    expect(got).toEqual(['1:x', '3:other', '1:fresh']);
  });
});
