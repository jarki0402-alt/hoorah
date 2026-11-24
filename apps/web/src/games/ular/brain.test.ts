import type { PlayerInfo } from '@hoorah/protocol';
import { lookOfFruit } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { isCpu } from '../common/cpu';
import { DuelTapper, duelRate, rollDelay, soloOutcome, ularOpponents } from './brain';
import { DUEL_MS, INTRO_MS, MAX_TAP_RATE, makeRng, type Standing, UlarLogic } from './logic';

const human = (id: number): PlayerInfo => ({
  id,
  name: `P${id}`,
  fruit: id === 1 ? 'semangka' : 'mangga',
  look: lookOfFruit(id === 1 ? 'semangka' : 'mangga'),
  color: id === 1 ? '#F2453D' : '#2F80ED',
  connected: true,
  isHost: id === 1,
});

/** Total taps one tapper makes over a whole duel, sampled every 100 ms like the driver. */
function duelTaps(skill: number, rnd: () => number): number {
  const t = new DuelTapper(skill, 0, rnd);
  let total = 0;
  for (let now = 100; now <= DUEL_MS; now += 100) total += t.advance(now);
  return total;
}

function average(skill: number, seed: number, n = 200): number {
  const r = makeRng(seed);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += duelTaps(skill, r);
  return sum / n;
}

describe('solo lineup', () => {
  it('adds exactly one opponent for one human', () => {
    const cpus = ularOpponents([human(1)]);
    expect(cpus).toHaveLength(1);
    expect(isCpu(cpus[0]!.id)).toBe(true);
    expect(cpus[0]!.fruit).not.toBe('semangka');
    expect(cpus[0]!.name.length).toBeGreaterThan(0);
  });

  it('adds nobody for two humans', () => {
    expect(ularOpponents([human(1), human(2)])).toHaveLength(0);
  });

  it('seats the opponent after the human in the turn order', () => {
    const [cpu] = ularOpponents([human(1)]);
    const L = new UlarLogic({
      size: 50,
      roster: [
        { id: 1, connected: true },
        { id: cpu!.id, connected: true },
      ],
      now: 0,
      seed: 1,
    });
    expect(L.order).toEqual([1, cpu!.id]);
  });
});

describe('thinking pause', () => {
  it('is never instant, and takeover seats wait about 1.5 to 3 seconds', () => {
    const r = makeRng(5);
    for (let i = 0; i < 300; i++) {
      expect(rollDelay(r(), false, r)).toBeGreaterThanOrEqual(600);
      const t = rollDelay(r(), true, r);
      expect(t).toBeGreaterThanOrEqual(1500);
      expect(t).toBeLessThanOrEqual(3000);
    }
  });
});

describe('duel kilat taps', () => {
  it('rises with skill and stays within a human rate', () => {
    const r = makeRng(9);
    for (let i = 0; i < 200; i++) {
      const v = duelRate(r(), r);
      expect(v).toBeGreaterThan(2);
      expect(v).toBeLessThan(MAX_TAP_RATE);
    }
    expect(duelRate(0, () => 0.5)).toBeLessThan(duelRate(1, () => 0.5));
  });

  it('is beatable when gentle and a fight when sharp', () => {
    const gentle = average(0.05, 1);
    const sharp = average(0.95, 2);
    // A relaxed human taps about 5-7 times a second (25-35 in 5 s).
    expect(gentle).toBeGreaterThan(10);
    expect(gentle).toBeLessThan(22);
    expect(sharp).toBeGreaterThan(32);
    expect(sharp).toBeLessThan(45);
  });

  it('varies from duel to duel', () => {
    const r = makeRng(4);
    const seen = new Set<number>();
    for (let i = 0; i < 20; i++) seen.add(duelTaps(0.5, r));
    expect(seen.size).toBeGreaterThan(3);
  });

  it('feeds the logic through addTaps, capped like a phone', () => {
    const L = new UlarLogic({
      size: 50,
      roster: [
        { id: 1, connected: true },
        { id: -1, connected: true },
      ],
      now: 0,
      seed: 3,
      rng: () => 0.2, // every roll is a 2
    });
    L.tick(INTRO_MS);
    L.player(1)!.pos = 8;
    L.player(-1)!.pos = 10;
    L.roll(1, INTRO_MS);
    let t = INTRO_MS;
    while (L.phase !== 'duel' && t < INTRO_MS + 20_000) {
      t += 50;
      L.tick(t);
    }
    expect(L.phase).toBe('duel');
    const start = L.duel!.start;
    expect(L.addTaps(-1, 0, t)).toBe(0);
    expect(L.addTaps(1, 2, t)).toBe(2);
    // A burst far above a human rate is capped.
    expect(L.addTaps(-1, 100, start + 100)).toBeLessThanOrEqual(8);
    const tapper = new DuelTapper(0.95, start, makeRng(1));
    for (let now = start + 100; now <= start + DUEL_MS; now += 100) L.addTaps(-1, tapper.advance(now), now);
    expect(L.duel!.tapsB).toBeGreaterThan(20);
    expect(L.duel!.tapsB).toBeLessThanOrEqual(MAX_TAP_RATE * (DUEL_MS / 1000) + 2);
    L.tick(start + DUEL_MS + 1);
    expect(L.duel!.winner).toBe(-1);
  });
});

describe('solo outcome', () => {
  const row = (id: number, rank: number): Standing => ({
    id,
    rank,
    pos: 10,
    finished: false,
    stats: {
      id,
      rolls: 0,
      sixes: 0,
      ladders: 0,
      climbed: 0,
      snakes: 0,
      fell: 0,
      cards: 0,
      duelsWon: 0,
      duelsLost: 0,
      blocked: 0,
    },
  });

  it('reads win, lose and draw from the human side', () => {
    expect(soloOutcome([row(1, 1), row(-1, 2)], 1, 1)).toBe('win');
    expect(soloOutcome([row(-1, 1), row(1, 2)], -1, 1)).toBe('lose');
    expect(soloOutcome([row(1, 1), row(-1, 1)], null, 1)).toBe('draw');
  });
});
