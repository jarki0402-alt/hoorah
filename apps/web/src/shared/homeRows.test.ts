import { describe, expect, it } from 'vitest';
import { CATALOG, CATEGORIES, GAMES } from './games';
import {
  cardTag,
  catalogByCategory,
  GRID_TABS,
  gridGames,
  HOME_SECTIONS,
  homeRows,
  isHomeSection,
  MOOD_ORDER,
  ROW_MAX,
  ROW_MIN,
  sectionGames,
} from './homeRows';

describe('home rows', () => {
  it('starts with "Pas untuk kalian": playable now, last played first, at most a row long', () => {
    const [fit] = homeRows(2, ['ludo', 'nope', 'penyusup']);
    expect(fit!.id).toBe('fit');
    expect(fit!.games[0]).toBe('ludo');
    expect(fit!.games).not.toContain('penyusup'); // needs 3 players
    expect(fit!.games.length).toBeLessThanOrEqual(ROW_MAX);
  });

  it('has one shelf per mood in order with all of that mood, fitting games first', () => {
    const rows = homeRows(1).slice(1);
    expect(rows.map((r) => r.id)).toEqual(MOOD_ORDER.filter((m) => rows.some((r) => r.id === m)));
    for (const r of rows) {
      expect(r.games.length).toBeGreaterThanOrEqual(ROW_MIN);
      expect(r.games.length).toBe(
        CATALOG.filter((id) => GAMES[id].available && GAMES[id].mood === r.id).length,
      );
      for (const id of r.games) expect(GAMES[id].mood).toBe(r.id);
      const fit = r.games.map((id) => GAMES[id].minPlayers <= 1);
      expect(fit).toEqual([...fit].sort((a, b) => Number(b) - Number(a)));
    }
  });

  it('lists every game in the "Semua" grid and filters it by category', () => {
    expect(gridGames('all')).toEqual(CATALOG);
    const grouped = catalogByCategory();
    expect([...grouped].sort()).toEqual([...CATALOG].sort());
    expect(grouped.map((id) => GAMES[id].category)).toEqual(
      CATEGORIES.flatMap((c) => grouped.filter((id) => GAMES[id].category === c.id).map(() => c.id)),
    );
    expect(GRID_TABS[0]).toBe('all');
    for (const tab of GRID_TABS.slice(1))
      for (const id of gridGames(tab)) expect(GAMES[id].category).toBe(tab);
  });

  it('gives the phone the same groups', () => {
    expect(HOME_SECTIONS).toEqual(['fit', ...MOOD_ORDER, 'all']);
    expect(sectionGames('all', 2)).toEqual(CATALOG.filter((id) => GAMES[id].available));
    expect(sectionGames('fit', 2, ['kuis'])[0]).toBe('kuis');
    expect(isHomeSection('heboh')).toBe(true);
    expect(isHomeSection('papan')).toBe(false);
    expect(isHomeSection(1)).toBe(false);
  });

  it('labels only the newest wave as new', () => {
    for (const id of CATALOG) {
      const tag = cardTag(id);
      if (GAMES[id].wave === 3) expect(tag).toBe('BARU');
      else expect(tag).not.toBe('BARU');
    }
  });
});
