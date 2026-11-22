import { describe, expect, it } from 'vitest';
import { CATALOG, GAMES, type GameId, gamesForTab, HOME_TABS, isHomeTab, MOODS } from './games';

/** Banned in player text (CLAUDE.md); built from its code so this file stays free of it. */
const EM_DASH = String.fromCharCode(0x2014);

describe('game list tabs', () => {
  it('every game has a category that is a tab', () => {
    for (const id of CATALOG) expect(HOME_TABS.some((t) => t.id === GAMES[id].category)).toBe(true);
  });

  it('"Pas untuk kalian" lists playable games for the player count, recent first', () => {
    const two = gamesForTab('fit', 2, ['ludo', 'nope', 'penyusup']);
    expect(two[0]).toBe('ludo');
    expect(two).not.toContain('penyusup'); // needs 3 players
    expect(two.every((id) => GAMES[id].available)).toBe(true);
    expect(new Set(two).size).toBe(two.length);
    expect(gamesForTab('fit', 1)).not.toContain('kompak'); // needs 2
    expect(gamesForTab('fit', 0)).toEqual(gamesForTab('fit', 1));
  });

  it('a category lists its games in catalog order, all playable', () => {
    expect(gamesForTab('papan', 2)).toEqual(['ular', 'congklak', 'ludo', 'catur', 'juragan']);
    for (const id of CATALOG) expect(GAMES[id].available).toBe(true);
  });

  it('every game has a mood with a label, and no text mentions a length in minutes', () => {
    for (const id of Object.keys(GAMES) as GameId[]) {
      const g = GAMES[id];
      expect(MOODS[g.mood]?.label, id).toBeTruthy();
      const text = [g.tagline, g.description, g.control, ...g.howTo.flatMap((h) => [h.t, h.d]), ...g.tips];
      for (const t of text) {
        expect(t, id).not.toMatch(/\bmenit\b|\bmnt\b/i);
        expect(t, id).not.toContain(EM_DASH);
      }
    }
  });

  it('recognises tab ids', () => {
    expect(isHomeTab('fit')).toBe(true);
    expect(isHomeTab('aksi')).toBe(true);
    expect(isHomeTab('semua')).toBe(false);
    expect(isHomeTab(3)).toBe(false);
  });
});
