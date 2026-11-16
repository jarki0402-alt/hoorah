import { describe, expect, it } from 'vitest';
import { autoRounds } from './automode';
import { CATALOG, GAMES, type GameId } from './games';

const ALL = Object.keys(GAMES) as GameId[];

describe('autoRounds', () => {
  it('gives every game a positive whole number for any player count', () => {
    for (const id of ALL) {
      for (let n = 1; n <= 16; n++) {
        const r = autoRounds(id, n);
        expect(Number.isInteger(r), `${id} ${n}`).toBe(true);
        expect(r, `${id} ${n}`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('treats missing or odd player counts as one player', () => {
    for (const id of CATALOG) {
      const solo = autoRounds(id, 1);
      expect(autoRounds(id, 0)).toBe(solo);
      expect(autoRounds(id, -3)).toBe(solo);
      expect(autoRounds(id, Number.NaN)).toBe(solo);
      expect(autoRounds(id, Number.POSITIVE_INFINITY)).toBe(solo);
    }
    expect(autoRounds('juragan', 2.9)).toBe(autoRounds('juragan', 2));
  });

  it('Juragan plays 14, 12 or 10 putaran by group size', () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => autoRounds('juragan', n))).toEqual([14, 14, 12, 12, 10, 10]);
    expect(autoRounds('juragan', 9)).toBe(10);
  });

  it('Lari Terus: Sprint alone, Bertahan together', () => {
    expect(autoRounds('lari', 1)).toBe(1);
    for (let n = 2; n <= 8; n++) expect(autoRounds('lari', n)).toBe(2);
  });

  it('quiz games never get longer as the group grows', () => {
    for (const id of ['kuis', 'kompak', 'kata', 'juragan'] as const) {
      for (let n = 2; n <= 16; n++) expect(autoRounds(id, n)).toBeLessThanOrEqual(autoRounds(id, n - 1));
    }
    expect(autoRounds('kuis', 1)).toBe(10);
    expect(autoRounds('kuis', 16)).toBe(6);
  });

  it('stays inside the values each game accepts', () => {
    for (let n = 1; n <= 16; n++) {
      expect([50, 100]).toContain(autoRounds('ular', n));
      expect([2, 4]).toContain(autoRounds('ludo', n));
      expect([1, 2]).toContain(autoRounds('lari', n));
      expect(autoRounds('masak', n)).toBeLessThanOrEqual(3);
      expect(autoRounds('kata', n)).toBeLessThanOrEqual(5);
      for (const id of ['rusun', 'bajaj', 'congklak', 'kerupuk', 'arena'] as const)
        expect(autoRounds(id, n)).toBeLessThanOrEqual(5);
    }
  });

  it('Catur gives team votes (3+ players) more time on the clock', () => {
    expect(autoRounds('catur', 1)).toBe(3);
    expect(autoRounds('catur', 2)).toBe(3);
    expect(autoRounds('catur', 3)).toBe(5);
  });
});
