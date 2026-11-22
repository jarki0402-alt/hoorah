import { describe, expect, it } from 'vitest';
import {
  clampIntensity,
  DUCKS,
  easeRate,
  HURRY_RATE,
  hurryTarget,
  layerScheduled,
  mergeDuck,
  TIER_TAIL,
  tierAudible,
} from './adaptive';
import { SONGS } from './songs';

describe('intensity layers', () => {
  it('plays a channel while its tier is at or below the intensity', () => {
    expect(tierAudible(undefined, 0)).toBe(true);
    expect(tierAudible(0, 0)).toBe(true);
    expect(tierAudible(1, 0)).toBe(false);
    expect(tierAudible(1, 1)).toBe(true);
    expect(tierAudible(2, 1)).toBe(false);
    expect(tierAudible(3, 3)).toBe(true);
    expect(tierAudible(2, 3)).toBe(true);
  });

  it('keeps channels without a tier always on, so older songs sound unchanged', () => {
    for (const level of [0, 1, 2, 3] as const) expect(tierAudible(undefined, level)).toBe(true);
  });

  it('clamps any number to a valid intensity', () => {
    expect(clampIntensity(-1)).toBe(0);
    expect(clampIntensity(1.4)).toBe(1);
    expect(clampIntensity(2.6)).toBe(3);
    expect(clampIntensity(9)).toBe(3);
    expect(clampIntensity(Number.NaN)).toBe(0);
  });

  it('keeps scheduling a switched-off layer only while its fade is audible', () => {
    expect(layerScheduled(true, Number.NEGATIVE_INFINITY, 100)).toBe(true);
    expect(layerScheduled(false, Number.NEGATIVE_INFINITY, 0)).toBe(false);
    expect(layerScheduled(false, 10, 10.5)).toBe(true);
    expect(layerScheduled(false, 10, 10 + TIER_TAIL + 0.01)).toBe(false);
  });

  it('only uses valid tiers in the song library', () => {
    for (const song of Object.values(SONGS))
      for (const def of Object.values(song.inst))
        if (def.tier !== undefined) expect([0, 1, 2, 3]).toContain(def.tier);
  });
});

describe('hurry', () => {
  it('targets about 8% faster while hurrying', () => {
    expect(hurryTarget(false)).toBe(1);
    expect(hurryTarget(true)).toBe(HURRY_RATE);
    expect(HURRY_RATE).toBeGreaterThan(1.05);
    expect(HURRY_RATE).toBeLessThan(1.1);
  });

  it('eases the tempo smoothly and settles exactly on the target', () => {
    let rate = 1;
    const seen: number[] = [];
    const step = 0.125;
    for (let i = 0; i < 400; i++) {
      rate = easeRate(rate, HURRY_RATE, step);
      seen.push(rate);
    }
    // Never jumps more than a fraction of a percent per 16th note.
    for (let i = 1; i < seen.length; i++) expect(Math.abs(seen[i]! - seen[i - 1]!)).toBeLessThan(0.01);
    // Half way there after about one time constant, there after a while.
    expect(seen[10]!).toBeGreaterThan(1.03);
    expect(seen[10]!).toBeLessThan(HURRY_RATE);
    expect(rate).toBe(HURRY_RATE);
    for (let i = 0; i < 400; i++) rate = easeRate(rate, 1, step);
    expect(rate).toBe(1);
  });

  it('leaves the written tempo untouched when not hurrying', () => {
    expect(easeRate(1, 1, 0.1)).toBe(1);
  });
});

describe('ducking', () => {
  it('ducks for announcement sounds only', () => {
    for (const name of ['gong', 'round', 'stinger-win', 'stinger-fall', 'weker', 'rooster', 'bell', 'flute'])
      expect(DUCKS[name]).toBeDefined();
    for (const name of ['tick', 'tock', 'select', 'win', 'count']) expect(DUCKS[name]).toBeUndefined();
  });

  it('merges overlapping ducks to the deepest level and the latest end', () => {
    const a = mergeDuck(null, 10, { depth: 0.5, hold: 1 });
    expect(a).toEqual({ depth: 0.5, until: 11 });
    const b = mergeDuck(a, 10.5, { depth: 0.3, hold: 0.2 });
    expect(b).toEqual({ depth: 0.3, until: 11 });
    const c = mergeDuck(b, 10.8, { depth: 0.6, hold: 1 });
    expect(c.depth).toBe(0.3);
    expect(c.until).toBeCloseTo(11.8);
    // A duck that already ended does not deepen the next one.
    expect(mergeDuck(c, 20, { depth: 0.6, hold: 1 })).toEqual({ depth: 0.6, until: 21 });
  });
});
