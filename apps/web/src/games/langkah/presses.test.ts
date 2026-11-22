import { describe, expect, it } from 'vitest';
import { type Press, PressQueue } from './presses';

const p = (counter: number, dir: Press['dir'] = 'up', atMs = counter * 100): Press => ({
  counter,
  dir,
  atMs,
});

describe('press queue (fast frame + reliable copy)', () => {
  it('keeps the first copy of a press and drops the second', () => {
    const q = new PressQueue();
    expect(q.push(1, p(5), 0)).toEqual([p(5)]);
    expect(q.push(1, p(5), 10)).toEqual([]);
    expect(q.push(1, p(6, 'left'), 20)).toEqual([p(6, 'left')]);
    expect(q.push(1, p(6, 'left'), 30)).toEqual([]);
  });

  it('waits for a lost frame’s reliable copy and hands presses out in order', () => {
    const q = new PressQueue(250);
    expect(q.push(1, p(10), 0)).toEqual([p(10)]);
    // Frame 11 was lost; 12 arrives first and waits.
    expect(q.push(1, p(12, 'down'), 50)).toEqual([]);
    expect(q.push(1, p(11, 'left'), 90)).toEqual([p(11, 'left'), p(12, 'down')]);
    // The late fast copy of 12 changes nothing.
    expect(q.push(1, p(12, 'down'), 120)).toEqual([]);
  });

  it('skips a press that never arrives after the wait', () => {
    const q = new PressQueue(250);
    q.push(1, p(1), 0);
    expect(q.push(1, p(3), 10)).toEqual([]);
    expect(q.flush(100)).toEqual([]);
    expect(q.flush(300)).toEqual([{ id: 1, press: p(3) }]);
    expect(q.push(1, p(2), 310)).toEqual([]);
  });

  it('wraps the u16 counter and starts over after a phone reload', () => {
    const q = new PressQueue();
    expect(q.push(1, p(65535), 0)).toEqual([p(65535)]);
    expect(q.push(1, p(0), 1)).toEqual([p(0)]);
    expect(q.push(1, p(5000), 2)).toEqual([p(5000)]);
    expect(q.push(2, p(1), 3)).toEqual([p(1)]);
  });
});
