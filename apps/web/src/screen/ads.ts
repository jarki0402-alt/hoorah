/**
 * Promo breaks between games for free rooms (owner decisions 2026-11-23). Pure: the caller passes
 * the room's access, the owner's config and the time, so every rule is unit tested.
 *
 * Rules:
 * - only in a free room (`isPremium` false) and only while `config.adsEnabled`;
 * - never during Mode Pesta (a Pass feature, but checked anyway);
 * - never before the first game of the session;
 * - a break comes before the next game once `config.adEveryGames` games have finished since the
 *   last break (a finished game = a result arrived; "Main lagi" replays count too);
 * - and at least `config.adMinGapMin` minutes after the last break (the first one: after the
 *   session started).
 */
import { type AppConfig, isPremium, type RoomAccess } from '@hoorah/protocol';
import { CATALOG, GAMES, type GameId } from '../shared/games';

const MINUTE = 60_000;

export class AdPlanner {
  private sessionStart: number;
  private lastBreak: number | null = null;
  private finishedSinceBreak = 0;
  private finishedTotal = 0;
  private breaks = 0;

  constructor(now: number = Date.now()) {
    this.sessionStart = now;
  }

  /** A game ended with a result (including a "Main lagi" replay). */
  gameFinished(): void {
    this.finishedSinceBreak++;
    this.finishedTotal++;
  }

  /** True when a break should play before the next game starts. */
  due(access: RoomAccess | null | undefined, config: AppConfig, now: number, inParty = false): boolean {
    if (!config.adsEnabled || isPremium(access) || inParty) return false;
    if (this.finishedTotal === 0) return false;
    if (this.finishedSinceBreak < Math.max(1, config.adEveryGames)) return false;
    const since = this.lastBreak ?? this.sessionStart;
    return now - since >= Math.max(0, config.adMinGapMin) * MINUTE;
  }

  /** A break was shown (call when it starts, so a reload mid-break does not show it twice). */
  shown(now: number): void {
    this.lastBreak = now;
    this.finishedSinceBreak = 0;
    this.breaks++;
  }

  /** How many breaks this session has shown (rotates the showcase). */
  get count(): number {
    return this.breaks;
  }

  /** Starts a new session (a new room on this main screen). */
  reset(now: number): void {
    this.sessionStart = now;
    this.lastBreak = null;
    this.finishedSinceBreak = 0;
    this.finishedTotal = 0;
    this.breaks = 0;
  }
}

/** The main screen's planner for this page load. */
export const adPlanner = new AdPlanner();

/**
 * Games the break shows off: the newest Pass games (release wave 3), newest first, never the game
 * about to start. `round` rotates the window so back-to-back breaks show different games.
 */
export function showcaseGames(next: GameId, round = 0, count = 3): GameId[] {
  const pool = CATALOG.filter((id) => GAMES[id].wave === 3 && GAMES[id].available && id !== next).reverse();
  if (pool.length <= count) return pool;
  const start = (((round * count) % pool.length) + pool.length) % pool.length;
  return Array.from({ length: count }, (_, i) => pool[(start + i) % pool.length]!);
}
