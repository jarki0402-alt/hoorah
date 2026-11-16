import { describe, expect, it } from 'vitest';
import {
  type LadderTarget,
  LEVELS,
  QualityLadder,
  type QualityTier,
  readOverrides,
  startRatio,
} from './quality';

/** Light rig stand-in with the same rules as LightRig (no step up from off or above the start). */
function fakeTarget(shadow: QualityTier, k: number, ratioPinned = false) {
  const start = shadow;
  const state = { shadow, k };
  const target: LadderTarget = {
    shadows: {
      get tier() {
        return state.shadow;
      },
      stepDown() {
        if (state.shadow === 0) return false;
        state.shadow = (state.shadow - 1) as QualityTier;
        return true;
      },
      stepUp() {
        if (state.shadow === 0 || state.shadow >= start) return false;
        state.shadow = (state.shadow + 1) as QualityTier;
        return true;
      },
    },
    ratio: () => state.k,
    setRatio: (v) => {
      state.k = v;
    },
    ratioPinned,
  };
  return { state, target };
}

/** Feed frames `ms` apart for `seconds` (running), starting at `t0`; returns the end time. */
function run(ladder: QualityLadder, t0: number, seconds: number, ms: number): number {
  let t = t0;
  const end = t0 + seconds * 1000;
  while (t < end) {
    t += ms;
    ladder.frame(t, true);
  }
  return t;
}

describe('startRatio', () => {
  it('keeps the laptop setting on high (1.5x stage, device pixels, wide stages capped)', () => {
    expect(startRatio('high', 1.5, 1280, 1)).toBe(1.5);
    expect(startRatio('high', 1, 1280, 1)).toBe(1);
    expect(startRatio('high', 0.6, 1280, 1)).toBe(1);
    expect(startRatio('high', 1, 1280, 2)).toBe(1.5);
    expect(startRatio('high', 1.5, 1680, 1)).toBeCloseTo(1.5 * Math.sqrt(1280 / 1680), 6);
  });

  it('caps medium at 1.25 and starts low at 0.75 (960x540)', () => {
    expect(startRatio('medium', 1.5, 1280, 1)).toBe(1.25);
    expect(startRatio('medium', 1, 1280, 1)).toBe(1);
    expect(startRatio('low', 1.5, 1280, 1)).toBe(0.75);
    expect(startRatio('low', 3, 1280, 1)).toBe(0.75);
    // A tiny window never renders above its pixels, nor below the floor.
    expect(startRatio('low', 0.6, 1280, 1)).toBe(0.6);
    expect(startRatio('low', 0.3, 1280, 1)).toBe(LEVELS.low.kFloor);
  });
});

describe('readOverrides', () => {
  it('reads the debug pins', () => {
    expect(readOverrides(new URLSearchParams('q=1&k=0.9&aa=0'))).toEqual({ shadow: 1, k: 0.9, aa: false });
    expect(readOverrides(new URLSearchParams(''))).toEqual({ shadow: null, k: null, aa: null });
    expect(readOverrides(new URLSearchParams('q=7&k=x&aa=1'))).toEqual({ shadow: null, k: null, aa: true });
  });
});

describe('QualityLadder', () => {
  it('walks shadows, resolution, then 30 fps, and reports the level once at the bottom', () => {
    const { state, target } = fakeTarget(3, 1.5);
    const slowAt: string[] = [];
    const ladder = new QualityLadder('high', target, (l) => slowAt.push(l));
    ladder.frame(0, true);
    // 40 ms frames (25 fps) for a long time: every rung is taken.
    run(ladder, 0, 120, 40);
    expect(ladder.steps).toEqual([
      'shadows',
      'shadows',
      'shadows',
      'resolution',
      'resolution',
      'resolution',
      'resolution',
      'resolution',
      'cap30',
    ]);
    expect(state.shadow).toBe(0);
    expect(state.k).toBe(LEVELS.high.kFloor);
    expect(ladder.pacer.cap30).toBe(true);
    expect(ladder.atBottom).toBe(true);
    expect(slowAt).toEqual(['high']);
  });

  it('starts low without shadows: resolution to 0.5, then 30 fps', () => {
    const { state, target } = fakeTarget(0, 0.75);
    const ladder = new QualityLadder('low', target, () => {});
    ladder.frame(0, true);
    run(ladder, 0, 60, 40);
    expect(ladder.steps).toEqual(['resolution', 'resolution', 'cap30']);
    expect(state.k).toBe(0.5);
  });

  it('leaves a pinned ratio alone', () => {
    const { state, target } = fakeTarget(0, 0.9, true);
    const ladder = new QualityLadder('low', target, () => {});
    ladder.frame(0, true);
    run(ladder, 0, 30, 40);
    expect(state.k).toBe(0.9);
    expect(ladder.steps).toEqual(['cap30']);
  });

  it('never judges frames while the game is not running', () => {
    const { target } = fakeTarget(3, 1.5);
    const ladder = new QualityLadder('high', target, () => {});
    for (let i = 1; i <= 2000; i++) ladder.frame(i * 40, false);
    expect(ladder.steps).toEqual([]);
  });

  it('holds still at a steady 60 fps', () => {
    const { target } = fakeTarget(3, 1.5);
    const ladder = new QualityLadder('high', target, () => {});
    ladder.frame(0, true);
    run(ladder, 0, 60, 1000 / 60);
    expect(ladder.steps).toEqual([]);
  });

  it('steps down on a device drawing about one frame a second', () => {
    const { state, target } = fakeTarget(2, 1.25);
    const ladder = new QualityLadder('medium', target, () => {});
    ladder.frame(0, true);
    run(ladder, 0, 30, 900);
    expect(ladder.steps[0]).toBe('shadows');
    expect(state.shadow).toBeLessThan(2);
  });

  it('brings shadows back after smooth stretches, never above the start, at most twice', () => {
    const { state, target } = fakeTarget(3, 1.5);
    const ladder = new QualityLadder('high', target, () => {});
    ladder.frame(0, true);
    state.shadow = 1;
    let t = 0;
    for (let s = 0; s < 200; s++) {
      t = run(ladder, t, 1, 1000 / 60);
      ladder.second(t, 60);
    }
    expect(state.shadow).toBe(3);
    const off = fakeTarget(3, 1.5);
    off.state.shadow = 0;
    const l2 = new QualityLadder('high', off.target, () => {});
    l2.frame(0, true);
    t = 0;
    for (let s = 0; s < 60; s++) {
      t = run(l2, t, 1, 1000 / 60);
      l2.second(t, 60);
    }
    expect(off.state.shadow).toBe(0);
  });
});
