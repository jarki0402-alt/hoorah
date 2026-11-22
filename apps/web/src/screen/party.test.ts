import { describe, expect, it } from 'vitest';
import { GAMES, type GameId } from '../shared/games';
import {
  advance,
  isFinalGame,
  newParty,
  PARTY_GAMES,
  pickLineup,
  placePoints,
  scoreGame,
  standings,
} from './party';

/** Deterministic random numbers for the lineup tests. */
function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe('party lineup', () => {
  it('picks playable games for the player count, varied moods, without repeats', () => {
    for (const seed of [0.1, 0.5, 0.9]) {
      const lineup = pickLineup(2, [], seq(seed, 0.3, 0.7));
      expect(lineup).toHaveLength(PARTY_GAMES);
      expect(new Set(lineup).size).toBe(lineup.length);
      for (const id of lineup) {
        expect(GAMES[id].available).toBe(true);
        expect(2).toBeGreaterThanOrEqual(GAMES[id].minPlayers);
        expect(2).toBeLessThanOrEqual(GAMES[id].maxPlayers);
      }
      expect(new Set(lineup.map((id) => GAMES[id].mood)).size).toBe(PARTY_GAMES);
    }
  });

  it('skips the games just played and never picks one that needs more players', () => {
    const recent: GameId[] = ['bajaj', 'kuis', 'ludo'];
    const lineup = pickLineup(1, recent, seq(0.2, 0.8));
    for (const id of lineup) expect(recent).not.toContain(id);
    expect(lineup).not.toContain('kompak'); // needs 2
    expect(lineup).not.toContain('penyusup'); // needs 3
  });
});

describe('party table', () => {
  const lineup: GameId[] = ['bajaj', 'kuis', 'tarik'];

  it('gives 3/2/1 points, double in the final game, and ignores computer opponents', () => {
    expect([1, 2, 3, 5].map((r) => placePoints(r, false))).toEqual([3, 2, 1, 1]);
    expect(placePoints(1, true)).toBe(6);

    let p = newParty(lineup);
    p = scoreGame(p, 'bajaj', [
      { playerId: 1, rank: 1 },
      { playerId: -1, rank: 2 },
      { playerId: 2, rank: 3 },
    ]);
    expect(p.points).toEqual({ 1: 3, 2: 1 });
    p = advance(p)!;
    p = scoreGame(p, 'kuis', [
      { playerId: 2, rank: 1 },
      { playerId: 1, rank: 2 },
    ]);
    p = advance(p)!;
    expect(isFinalGame(p)).toBe(true);
    p = scoreGame(p, 'tarik', [
      { playerId: 2, rank: 1 },
      { playerId: 1, rank: 1 },
    ]);
    expect(p.points).toEqual({ 1: 11, 2: 10 });
    expect(advance(p)).toBeNull();
  });

  it('scores the current game once only, and never another game', () => {
    let p = newParty(lineup);
    const win = [{ playerId: 1, rank: 1 }];
    expect(scoreGame(p, 'kuis', win)).toBe(p);
    p = scoreGame(p, 'bajaj', win);
    expect(scoreGame(p, 'bajaj', win)).toBe(p);
    expect(p.points[1]).toBe(3);
  });

  it('ranks the table with shared places and lists players without points', () => {
    let p = newParty(lineup);
    p = scoreGame(p, 'bajaj', [
      { playerId: 1, rank: 1 },
      { playerId: 2, rank: 1 },
    ]);
    expect(standings(p, [1, 2, 3])).toEqual([
      { playerId: 1, points: 3, rank: 1 },
      { playerId: 2, points: 3, rank: 1 },
      { playerId: 3, points: 0, rank: 3 },
    ]);
  });
});
