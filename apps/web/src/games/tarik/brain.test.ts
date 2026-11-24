import type { PlayerInfo } from '@hoorah/protocol';
import { lookOfFruit } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { seeded } from '../../shared/art/svg';
import { BRAIN_MAX_RATE, PullBrain, type Ring } from './brain';
import { DEFAULT_TUNING, TarikMatch, type Team } from './logic';

const OFFSET = 1_000_000;

/** Tap times of a brain over `ms` of a pull starting at server time 0, polled every 16 ms. */
function tapsOver(brain: PullBrain, ms: number, ring: Ring | null = null, behind = 0): number[] {
  brain.startRound(0);
  const out: number[] = [];
  for (let now = 0; now <= ms; now += 16) out.push(...brain.update(now, { ring, behind }));
  return out;
}

function maxInWindow(taps: number[], windowMs: number): number {
  let best = 0;
  let j = 0;
  for (let i = 0; i < taps.length; i++) {
    while (taps[i]! - taps[j]! >= windowMs) j++;
    best = Math.max(best, i - j + 1);
  }
  return best;
}

function stats(values: number[]): { mean: number; sd: number } {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  return { mean, sd };
}

function player(id: number, name: string): PlayerInfo {
  return {
    id,
    name,
    fruit: 'semangka',
    look: lookOfFruit('semangka'),
    color: '#F2453D',
    connected: true,
    isHost: id === 1,
  };
}

/** A whole match between two brains (red = first player); returns the match when it is over. */
function brainMatch(red: PullBrain, blue: PullBrain, rounds = 3): TarikMatch {
  const m = new TarikMatch({ rounds });
  m.setPlayers([player(1, 'Rina'), player(-1, 'Bang Jali')]);
  const brains = new Map<number, PullBrain>([
    [1, red],
    [-1, blue],
  ]);
  const counters = new Map<number, number>();
  let t = 0;
  let pulling = false;
  while (m.phase !== 'done' && t < 600_000) {
    t += 10;
    const server = t + OFFSET;
    m.advance(t, server);
    m.drainEvents();
    if (m.phase !== 'pull') {
      pulling = false;
      continue;
    }
    if (!pulling) {
      pulling = true;
      for (const b of brains.values()) b.startRound(server);
    }
    const ring: Ring = {
      start: m.ringStart,
      period: m.tuning.ringPeriodMs,
      window: m.tuning.superWindowMs,
      quiet: m.tuning.superQuietMs,
    };
    for (const [id, brain] of brains) {
      const team = m.member(id)?.team as Team;
      const behind = team === 'red' ? m.p : -m.p;
      for (const at of brain.update(server, { ring, behind })) {
        const c = ((counters.get(id) ?? 0) + 1) & 0xffff;
        counters.set(id, c);
        m.input(id, c, at, t, server);
      }
    }
  }
  return m;
}

describe('PullBrain', () => {
  it('taps at a rate that rises with skill', () => {
    const gentle = tapsOver(new PullBrain(0, seeded(1)), 20_000).length / 20;
    const middle = tapsOver(new PullBrain(0.5, seeded(2)), 20_000).length / 20;
    const sharp = tapsOver(new PullBrain(1, seeded(3)), 20_000).length / 20;
    expect(gentle).toBeGreaterThan(3.5);
    expect(gentle).toBeLessThan(5.2);
    expect(middle).toBeGreaterThan(gentle);
    expect(sharp).toBeGreaterThan(middle);
    expect(sharp).toBeGreaterThan(7.2);
    expect(sharp).toBeLessThan(9.5);
  });

  it('never comes near the auto-clicker guard', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const taps = tapsOver(new PullBrain(1, seeded(seed)), 45_000, null, 1);
      expect(maxInWindow(taps, 1000)).toBeLessThanOrEqual(12);
      expect(maxInWindow(taps, 1000)).toBeLessThan(DEFAULT_TUNING.maxTapsPerSecond);
    }
    expect(BRAIN_MAX_RATE).toBeLessThan(DEFAULT_TUNING.maxTapsPerSecond);
  });

  it('is not metronomic: intervals vary and it pauses now and then', () => {
    const taps = tapsOver(new PullBrain(0.5, seeded(9)), 30_000);
    const gaps = taps.slice(1).map((v, i) => v - taps[i]!);
    const { mean, sd } = stats(gaps);
    expect(sd / mean).toBeGreaterThan(0.08);
    expect(Math.max(...gaps)).toBeGreaterThan(mean * 1.8);
    expect(new Set(gaps).size).toBeGreaterThan(20);
  });

  it('tires over a long round', () => {
    const brain = new PullBrain(0.3, seeded(4));
    brain.startRound(0);
    expect(brain.rateAt(40_000)).toBeLessThan(brain.rateAt(0) * 1.0001 + 1);
    const early: number[] = [];
    const late: number[] = [];
    for (let i = 0; i < 50; i++) {
      const b = new PullBrain(0.3, seeded(100 + i));
      const taps = tapsOver(b, 45_000);
      early.push(taps.filter((x) => x < 10_000).length);
      late.push(taps.filter((x) => x >= 35_000).length);
    }
    expect(stats(late).mean).toBeLessThan(stats(early).mean);
  });

  it('drops the backlog after a long gap instead of replaying it', () => {
    const brain = new PullBrain(0.8, seeded(5));
    brain.startRound(0);
    for (let now = 0; now <= 2_000; now += 16) brain.update(now, { ring: null, behind: 0 });
    const after = brain.update(7_000, { ring: null, behind: 0 });
    expect(after.length).toBeLessThanOrEqual(1);
  });

  it('goes quiet before the ring closes and lands super pulls at high skill only', () => {
    const ring: Ring = { start: 0, period: 1600, window: 90, quiet: 200 };
    const supersOf = (skill: number, seed: number) => {
      const taps = tapsOver(new PullBrain(skill, seeded(seed)), 40_000, ring);
      let n = 0;
      for (let i = 0; i < taps.length; i++) {
        const at = taps[i]!;
        const k = Math.round(at / ring.period);
        const end = k * ring.period;
        if (k < 1 || Math.abs(at - end) > ring.window) continue;
        const prev = taps[i - 1] ?? Number.NEGATIVE_INFINITY;
        if (prev < end - ring.window - ring.quiet) n++;
      }
      return n;
    };
    let sharp = 0;
    let gentle = 0;
    for (let seed = 1; seed <= 10; seed++) {
      sharp += supersOf(1, seed);
      gentle += supersOf(0, seed);
    }
    // 25 cycles per run: a sharp brain lands a fair share, never all of them.
    expect(sharp / 10).toBeGreaterThan(6);
    expect(sharp / 10).toBeLessThan(22);
    // Slow tapping lands the odd super by accident, exactly as it does for people.
    expect(gentle).toBeLessThan(sharp * 0.5);
  });
});

describe('PullBrain in a real match', () => {
  it('scores through the same rules as phones: taps and supers count', () => {
    const m = brainMatch(new PullBrain(0.95, seeded(11)), new PullBrain(0.95, seeded(12)));
    expect(m.phase).toBe('done');
    const cpu = m.member(-1);
    expect(cpu?.taps).toBeGreaterThan(200);
    expect(cpu?.supers).toBeGreaterThan(0);
  });

  it('a sharp brain beats a gentle one, and a gentle one rarely lands supers', () => {
    let sharpWins = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const m = brainMatch(new PullBrain(0.05, seeded(seed)), new PullBrain(0.95, seeded(seed + 50)), 1);
      if (m.matchWinner === 'blue') sharpWins++;
      expect(m.member(1)?.supers ?? 0).toBeLessThanOrEqual(2);
    }
    expect(sharpWins).toBe(6);
  });

  it('evenly matched brains make a contest, not a walkover', () => {
    const results: Team[] = [];
    for (let seed = 1; seed <= 8; seed++) {
      const m = brainMatch(new PullBrain(0.5, seeded(seed)), new PullBrain(0.5, seeded(seed + 100)), 1);
      results.push(m.matchWinner ?? 'red');
    }
    expect(results).toContain('red');
    expect(results).toContain('blue');
  });
});
