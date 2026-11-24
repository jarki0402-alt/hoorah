/**
 * How the game catalog is grouped on the main screen's home and in the Host's phone picker (the
 * same groups on both): "Semua" first (every game, ordered for the players on this screen), then
 * "Pas untuk kalian" and one row per mood.
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

export const HOME_SECTIONS: readonly HomeSection[] = ['all', 'fit', ...MOOD_ORDER];

/** The shelf home opens on (owner 2026-11-23: every game, ordered for this screen). */
export const DEFAULT_SECTION: HomeSection = 'all';

export function isHomeSection(v: unknown): v is HomeSection {
  return typeof v === 'string' && (HOME_SECTIONS as readonly string[]).includes(v);
}

/** "Pas untuk kalian" holds one screenful (two rows of five on the home grid). */
export const ROW_MAX = 10;
/** A mood row with fewer games than this is left out (it would look empty on a big screen). */
export const ROW_MIN = 3;

export interface HomeRow {
  id: 'fit' | GameMood;
  games: GameId[];
}

const fits = (id: GameId, n: number): boolean => n >= GAMES[id].minPlayers && n <= GAMES[id].maxPlayers;

/**
 * The home shelves. "Pas untuk kalian": playable now, the last played first (one screenful). Each
 * mood: all its playable games, the ones that fit this many players first, the newest wave next.
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
    if (ranked.length >= ROW_MIN) rows.push({ id: mood, games: ranked });
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

/** Every game grouped by category, in catalog order within each group. */
export function catalogByCategory(withSoon = true): GameId[] {
  return CATEGORIES.flatMap((c) => gridGames(c.id, withSoon));
}

/**
 * "Semua", ordered for the players on this screen, so each screen sees its own order: games that
 * fit this many players first (the ones played here lately first, then the newest wave, then
 * catalog order), then the ones needing a different count, then the "segera hadir" teasers when
 * `withSoon` (the main screen shows them, the phone picker does not).
 */
export function allGames(players: number, recent: readonly string[] = [], withSoon = false): GameId[] {
  const n = Math.max(1, players);
  const playable = CATALOG.filter((id) => GAMES[id].available);
  const played = (id: GameId) => {
    const i = recent.indexOf(id);
    return i < 0 ? Number.POSITIVE_INFINITY : i;
  };
  const ranked = [...playable].sort(
    (a, b) =>
      Number(fits(b, n)) - Number(fits(a, n)) ||
      played(a) - played(b) ||
      Number(isNewGame(b)) - Number(isNewGame(a)) ||
      CATALOG.indexOf(a) - CATALOG.indexOf(b),
  );
  return withSoon ? [...ranked, ...CATALOG.filter((id) => !GAMES[id].available)] : ranked;
}

/** The phone picker's list for a section: the row's games, or every game for `all`. */
export function sectionGames(
  section: HomeSection,
  players: number,
  recent: readonly string[] = [],
): GameId[] {
  if (section === 'all') return allGames(players, recent);
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
