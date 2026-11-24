/**
 * Which games a room can play (owner decisions 2026-11-23). A free room plays the free games plus
 * "Game Minggu Ini"; trial, Pass and open rooms (`isPremium`) play everything. Pure, so the main
 * screen, the phones and the tests agree.
 */
import { type AppConfig, isPremium, type RoomAccess } from '@hoorah/protocol';
import { CATALOG, GAMES, type GameId } from './games';

/** Free for everyone. Petualangan Warna is free with its first stages only (see `limitedRun`). */
export const FREE_GAMES: readonly GameId[] = [
  'tarik',
  'bajaj',
  'kuis',
  'catur',
  'kompak',
  'ular',
  'congklak',
  'rusun',
  'warna',
];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** Monday 1970-01-05 00:00 WIB (UTC+7): the weekly pick changes every Monday at midnight in Jakarta. */
const FIRST_MONDAY_WIB = Date.UTC(1970, 0, 4, 17);

function isGameId(v: unknown): v is GameId {
  return typeof v === 'string' && v in GAMES;
}

export function isFreeListed(id: GameId): boolean {
  return FREE_GAMES.includes(id);
}

/** Weeks since the first Monday (WIB), the counter of the automatic weekly pick. */
export function weekIndex(now: number): number {
  return Math.floor((now - FIRST_MONDAY_WIB) / WEEK_MS);
}

/** Games the automatic "Game Minggu Ini" rotates through: the playable, non-free ones, catalog order. */
export function weeklyPool(): GameId[] {
  return CATALOG.filter((id) => GAMES[id].available && !isFreeListed(id));
}

/** "Game Minggu Ini": the owner's pick when set and playable, else this week's automatic pick. */
export function weeklyGame(config: AppConfig | null | undefined, now: number): GameId | null {
  const chosen = config?.weeklyGame;
  if (isGameId(chosen) && GAMES[chosen].available) return chosen;
  const pool = weeklyPool();
  if (pool.length === 0) return null;
  const i = weekIndex(now) % pool.length;
  return pool[i < 0 ? i + pool.length : i] ?? null;
}

/** Free in a free room right now (the free list or this week's game). */
export function isFreeGame(id: GameId, config: AppConfig | null | undefined, now: number): boolean {
  return isFreeListed(id) || weeklyGame(config, now) === id;
}

/** Whether a room with this access can start the game. */
export function canPlay(
  id: GameId,
  access: RoomAccess | null | undefined,
  config: AppConfig | null | undefined,
  now: number,
): boolean {
  return isPremium(access) || isFreeGame(id, config, now);
}

/**
 * The game runs with its free-room limits (Petualangan Warna: Hutan 1-5 only): not premium and not
 * this week's game.
 */
export function limitedRun(
  id: GameId,
  access: RoomAccess | null | undefined,
  config: AppConfig | null | undefined,
  now: number,
): boolean {
  return !isPremium(access) && weeklyGame(config, now) !== id;
}

/** The games of `ids` this room can start, order kept (the Acak wheel's pool). */
export function playableGames(
  ids: readonly GameId[],
  access: RoomAccess | null | undefined,
  config: AppConfig | null | undefined,
  now: number,
): GameId[] {
  return ids.filter((id) => canPlay(id, access, config, now));
}
