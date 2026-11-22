/**
 * Focus ids of the home screen. A game can sit in several rows at once, so a card id carries its
 * row: `card-<game>@<row>` (`@all` = the "Semua game" grid). Grid tabs are `gtab-<tab>`.
 */
import { GAMES, type GameId } from '../shared/games';
import type { GridTab, HomeSection } from '../shared/homeRows';

export type CardRow = 'fit' | 'heboh' | 'otak' | 'ramai' | 'santai' | 'all';

export const PARTY_ID = 'party';
export const RANDOM_ID = 'random';

export const cardFocusId = (game: GameId, row: CardRow): string => `card-${game}@${row}`;
export const gridTabId = (tab: GridTab): string => `gtab-${tab}`;

const CARD = /^card-([a-z0-9]+)@([a-z]+)$/;

/** The game of a card focus id, or null for anything else. */
export function cardGame(id: string): GameId | null {
  const m = CARD.exec(id);
  return m && m[1]! in GAMES ? (m[1] as GameId) : null;
}

const ROWS: readonly string[] = ['fit', 'heboh', 'otak', 'ramai', 'santai', 'all'];

/** The group a focused item belongs to (what the Host's phone picker shows), or null. */
export function focusSection(id: string): HomeSection | null {
  if (id.startsWith('gtab-')) return 'all';
  const row = CARD.exec(id)?.[2];
  return row && ROWS.includes(row) ? (row as HomeSection) : null;
}
