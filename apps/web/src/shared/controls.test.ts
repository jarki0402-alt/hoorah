import { describe, expect, it } from 'vitest';
import {
  CONTROL_DEFAULTS,
  CONTROL_RANGES,
  dirOf,
  FingerSpeed,
  isSwipe,
  migrateStored,
  normalizeTuning,
  stickOutput,
  trackStick,
  tuningSummary,
} from './controls';
import { tickTimes } from './haptics';

describe('settings', () => {
  it('fills everything from defaults when nothing is stored', () => {
    const t = normalizeTuning(null);
    expect(t).toEqual({
      stick: { ...CONTROL_DEFAULTS.stick },
      swipe: { ...CONTROL_DEFAULTS.swipe },
      haptic: { ...CONTROL_DEFAULTS.haptic },
      runner: { ...CONTROL_DEFAULTS.runner },
      rusun: { ...CONTROL_DEFAULTS.rusun },
    });
  });

  it('defaults to a fixed joystick base and a jump of about 0.75 s', () => {
    expect(CONTROL_DEFAULTS.stick.follow).toBe(false);
    expect(normalizeTuning({ stick: { follow: true } }).stick.follow).toBe(true);
    expect(normalizeTuning({ stick: { follow: 'yes' } }).stick.follow).toBe(false);
    expect(CONTROL_DEFAULTS.rusun).toEqual({ periodMs: 3400, speedup: 0.015, minPeriodMs: 2400 });
  });

  it('never lets the first Rusun swing be faster than the fastest one', () => {
    const t = normalizeTuning({ rusun: { periodMs: 2000, minPeriodMs: 2600, speedup: 1 } });
    expect(t.rusun.periodMs).toBe(2600);
    expect(t.rusun.speedup).toBe(CONTROL_RANGES.rusun.speedup.max);
  });

  it('drops a jump stored before the float was added, keeps the rest', () => {
    const old = { stick: { radius: 60 }, runner: { jumpV: 7.6, gravity: 25 } };
    const t = normalizeTuning(migrateStored(old));
    expect(t.stick.radius).toBe(60);
    expect(t.runner).toEqual({ ...CONTROL_DEFAULTS.runner });
    const current = { version: 2, runner: { jumpV: 9 } };
    expect(normalizeTuning(migrateStored(current)).runner.jumpV).toBe(9);
  });

  it('keeps valid stored values, clamps wild ones and drops junk', () => {
    const t = normalizeTuning({
      stick: { radius: 70, dead: 9, curve: 'fast' },
      swipe: { distance: 20 },
      haptic: { flash: 'sometimes', releaseFallback: false, tickGap: Number.NaN },
      runner: { laneTime: 0.001 },
      extra: 1,
    });
    expect(t.stick.radius).toBe(70);
    expect(t.stick.dead).toBe(CONTROL_RANGES.stick.dead.max);
    expect(t.stick.curve).toBe(CONTROL_DEFAULTS.stick.curve);
    expect(t.swipe.distance).toBe(20);
    expect(t.haptic.flash).toBe('auto');
    expect(t.haptic.releaseFallback).toBe(false);
    expect(t.haptic.tickGap).toBe(CONTROL_DEFAULTS.haptic.tickGap);
    expect(t.runner.laneTime).toBe(CONTROL_RANGES.runner.laneTime.min);
    expect('extra' in t).toBe(false);
  });

  it('keeps a flick longer than a tap and no longer than a swipe', () => {
    expect(normalizeTuning({ swipe: { distance: 16, flickDistance: 30 } }).swipe.flickDistance).toBe(16);
    expect(normalizeTuning({ swipe: { tapPx: 20, flickDistance: 10 } }).swipe.flickDistance).toBe(21);
  });

  it('lists every value for the owner to send', () => {
    const text = tuningSummary(normalizeTuning(null));
    expect(text).toContain('radius=52');
    expect(text).toContain('laneTime=0.14');
    expect(text).toContain('base=fixed');
    expect(text).toContain('period=3400ms');
    expect(text.split('\n')).toHaveLength(5);
  });
});

describe('joystick', () => {
  const s = { radius: 50, dead: 0.2, curve: 1, follow: false };

  it('keeps a fixed base where the thumb landed and caps the knob at the radius', () => {
    const t = trackStick(100, 200, 220, 200, s);
    expect(t).toMatchObject({ cx: 100, cy: 200, dx: 120, dy: 0 });
    expect(t.kx).toBeCloseTo(50, 6);
    expect(t.ky).toBeCloseTo(0, 6);
  });

  it('drags a following base behind the thumb past the radius', () => {
    const t = trackStick(100, 200, 220, 200, { ...s, follow: true });
    expect(t.cx).toBeCloseTo(170, 6);
    expect(t.dx).toBeCloseTo(50, 6);
    const back = trackStick(t.cx, t.cy, 140, 200, { ...s, follow: true });
    expect(stickOutput(back.dx, back.dy, s).x).toBeLessThan(0);
  });

  it('reads centred inside the dead zone', () => {
    expect(stickOutput(0, 0, s)).toMatchObject({ x: 0, y: 0 });
    expect(stickOutput(9, 0, s)).toMatchObject({ x: 0, y: 0 });
  });

  it('rescales past the dead zone and caps at the radius', () => {
    expect(stickOutput(10, 0, s).x).toBeCloseTo(0, 6);
    expect(stickOutput(30, 0, s).x).toBeCloseTo(0.5, 6);
    expect(stickOutput(0, -50, s).y).toBeCloseTo(-1, 6);
    const far = stickOutput(300, 400, s);
    expect(Math.hypot(far.x, far.y)).toBeCloseTo(1, 6);
  });

  it('bends the response with the curve', () => {
    const soft = stickOutput(30, 0, { ...s, curve: 0.5 }).x;
    const fine = stickOutput(30, 0, { ...s, curve: 2 }).x;
    expect(soft).toBeCloseTo(Math.SQRT1_2, 6);
    expect(fine).toBeCloseTo(0.25, 6);
  });
});

describe('swipe', () => {
  const s = CONTROL_DEFAULTS.swipe;

  it('counts a long stroke, or a short fast flick', () => {
    expect(isSwipe(s.distance, 0, s)).toBe(true);
    expect(isSwipe(s.distance - 1, 0, s)).toBe(false);
    expect(isSwipe(s.flickDistance, s.flickSpeed, s)).toBe(true);
    expect(isSwipe(s.flickDistance - 1, 5, s)).toBe(false);
  });

  it('picks the main direction', () => {
    expect(dirOf(30, 5)).toBe('right');
    expect(dirOf(-30, 5)).toBe('left');
    expect(dirOf(4, -30)).toBe('up');
    expect(dirOf(4, 30)).toBe('down');
  });

  it('measures recent finger speed, not the average since touch-down', () => {
    const v = new FingerSpeed();
    v.reset(0, 0, 0);
    // Resting for half a second, then a quick flick.
    v.push(0, 0, 500);
    v.push(10, 0, 516);
    const fast = v.push(22, 0, 532);
    expect(fast).toBeGreaterThan(0.6);
  });
});

describe('haptic ticks', () => {
  it('turns a pattern into one tick per "on" segment, spaced apart', () => {
    expect(tickTimes(20, 70)).toEqual([0]);
    expect(tickTimes(0, 70)).toEqual([]);
    expect(tickTimes([50, 30, 50], 70)).toEqual([0, 80]);
    expect(tickTimes([10, 10, 10, 10, 10], 70)).toEqual([0, 70, 140]);
    expect(tickTimes(new Array(40).fill(10), 30)).toHaveLength(12);
  });
});
