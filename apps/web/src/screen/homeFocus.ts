/**
 * Focus ids of the home screen. A game can sit on several shelves, so a card id carries its shelf:
 * `card-<game>@<shelf>` (`@all` = "Semua"). Shelf tabs are `shelf-<shelf>`.
 */
import { GAMES, type GameId } from '../shared/games';
import { type HomeSection, isHomeSection } from '../shared/homeRows';

export type CardRow = 'fit' | 'heboh' | 'otak' | 'ramai' | 'santai' | 'all';

export const PARTY_ID = 'party';
export const RANDOM_ID = 'random';

export const cardFocusId = (game: GameId, row: CardRow): string => `card-${game}@${row}`;
export const shelfId = (shelf: HomeSection): string => `shelf-${shelf}`;

/** The shelf of a shelf tab id, or null for anything else. */
export function shelfOf(id: string): HomeSection | null {
  const s = id.startsWith('shelf-') ? id.slice(6) : '';
  return isHomeSection(s) ? s : null;
}

const CARD = /^card-([a-z0-9]+)@([a-z]+)$/;

/** The game of a card focus id, or null for anything else. */
export function cardGame(id: string): GameId | null {
  const m = CARD.exec(id);
  return m && m[1]! in GAMES ? (m[1] as GameId) : null;
}

const ROWS: readonly string[] = ['fit', 'heboh', 'otak', 'ramai', 'santai', 'all'];

/** The group a focused item belongs to (what the Host's phone picker shows), or null. */
export function focusSection(id: string): HomeSection | null {
  const shelf = shelfOf(id);
  if (shelf) return shelf;
  const row = CARD.exec(id)?.[2];
  return row && ROWS.includes(row) ? (row as HomeSection) : null;
}
