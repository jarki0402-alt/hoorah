/**
 * How the game catalog is grouped on the main screen's home and in the Host's phone picker (the
 * same groups on both): "Pas untuk kalian", one row per mood, then every game by category.
 */
import {
  CATALOG,
  CATEGORIES,
  GAMES,
  type GameCategory,
  type GameId,
  type GameMood,
  gamesForTab,
} from './games';

/** A group the Host can jump to from the phone; `all` is the full catalog grid. */
export type HomeSection = 'fit' | GameMood | 'all';

/** Mood rows top to bottom: the loud ones first, the calm one last. */
export const MOOD_ORDER: readonly GameMood[] = ['heboh', 'otak', 'ramai', 'santai'];

export const HOME_SECTIONS: readonly HomeSection[] = ['fit', ...MOOD_ORDER, 'all'];

export function isHomeSection(v: unknown): v is HomeSection {
  return typeof v === 'string' && (HOME_SECTIONS as readonly string[]).includes(v);
}

/** Longest row: a row should never feel like the whole catalog again. */
export const ROW_MAX = 8;
/** A mood row with fewer games than this is left out (it would look empty on a big screen). */
export const ROW_MIN = 3;

export interface HomeRow {
  id: 'fit' | GameMood;
  games: GameId[];
}

const fits = (id: GameId, n: number): boolean => n >= GAMES[id].minPlayers && n <= GAMES[id].maxPlayers;

/**
 * The rows under the posters. "Pas untuk kalian": playable now, the last played first. Each mood:
 * its playable games, the ones that fit this many players first, the newest wave next.
 */
export function homeRows(players: number, recent: readonly string[] = []): HomeRow[] {
  const n = Math.max(1, players);
  const rows: HomeRow[] = [{ id: 'fit', games: gamesForTab('fit', n, recent).slice(0, ROW_MAX) }];
  for (const mood of MOOD_ORDER) {
    const all = CATALOG.filter((id) => GAMES[id].available && GAMES[id].mood === mood);
    const ranked = [...all].sort(
      (a, b) =>
        Number(fits(b, n)) - Number(fits(a, n)) ||
        Number(isNewGame(b)) - Number(isNewGame(a)) ||
        all.indexOf(a) - all.indexOf(b),
    );
    if (ranked.length >= ROW_MIN) rows.push({ id: mood, games: ranked.slice(0, ROW_MAX) });
  }
  return rows;
}

/** Filter of the "Semua game" grid. */
export type GridTab = 'all' | GameCategory;

export const GRID_TABS: readonly GridTab[] = ['all', ...CATEGORIES.map((c) => c.id)];

/** Games in the "Semua game" grid under a tab, in catalog order (`withSoon` keeps teasers). */
export function gridGames(tab: GridTab, withSoon = true): GameId[] {
  return CATALOG.filter(
    (id) => (tab === 'all' || GAMES[id].category === tab) && (withSoon || GAMES[id].available),
  );
}

/** The phone picker's list for a section: the row's games, or the whole catalog for `all`. */
export function sectionGames(
  section: HomeSection,
  players: number,
  recent: readonly string[] = [],
): GameId[] {
  if (section === 'all') return gridGames('all', false);
  return homeRows(players, recent).find((r) => r.id === section)?.games ?? [];
}

/** Games of the newest wave get a "Baru" label on cards. */
export function isNewGame(id: GameId): boolean {
  return GAMES[id].wave === 3;
}

/** The small tag on a game card: "Baru" for the newest wave, else the catalog's own (not "BARU"). */
export function cardTag(id: GameId): 'BARU' | 'FAVORIT' | 'SEGERA' | null {
  const g = GAMES[id];
  if (!g.available) return 'SEGERA';
  if (isNewGame(id)) return 'BARU';
  return g.badge === 'FAVORIT' ? 'FAVORIT' : null;
}
