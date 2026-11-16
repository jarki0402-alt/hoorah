/**
 * Aggregated use for the dashboard's "Pemakaian": per hour, how many rooms opened, games started
 * (and with how many players), rooms closed (and how long they lived), and Pass activations. No room
 * codes, names or addresses are stored. Counts collect in memory and are written once a minute (and
 * before every read), so the room logic never waits on the disk.
 */
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { AdminUsage, AdminUsagePoint, AdminUsageTotals, UsageDays } from '@hoorah/protocol';
import { DAY_MS, floorHour, HOUR_MS, LOCAL_TZ, startOfDay, zonedParts } from './zone';

export const USAGE_KEEP_DAYS = 90;
/** Distinct game ids waiting to be written; a screen inventing ids cannot grow memory past this. */
const MAX_PENDING_GAMES = 200;

export interface UsageRow extends AdminUsageTotals {
  hour: number;
}

export interface GameRow {
  hour: number;
  gameId: string;
  plays: number;
  players: number;
}

const emptyTotals = (): AdminUsageTotals => ({
  roomsCreated: 0,
  gameStarts: 0,
  startPlayers: 0,
  roomsClosed: 0,
  roomSeconds: 0,
  roomsPlayed: 0,
  roomPlayers: 0,
  passActivations: 0,
});

const TOTAL_KEYS = Object.keys(emptyTotals()) as (keyof AdminUsageTotals)[];

function addTotals(into: AdminUsageTotals, row: AdminUsageTotals): void {
  for (const k of TOTAL_KEYS) into[k] += row[k];
}

/** Where each point of the series starts: 24 hours for one day, Jakarta days otherwise. */
export function usageBuckets(days: UsageDays, now: number): { bucket: 'hour' | 'day'; starts: number[] } {
  if (days === 1) {
    const last = floorHour(now);
    return { bucket: 'hour', starts: Array.from({ length: 24 }, (_, i) => last - (23 - i) * HOUR_MS) };
  }
  return {
    bucket: 'day',
    starts: Array.from({ length: days }, (_, i) => startOfDay(now, LOCAL_TZ, -(days - 1 - i))),
  };
}

/** The usage views from hour rows (pure; rows before the range are ignored). */
export function summarizeUsage(
  rows: readonly UsageRow[],
  games: readonly GameRow[],
  days: UsageDays,
  now: number,
): AdminUsage {
  const { bucket, starts } = usageBuckets(days, now);
  const from = starts[0] ?? now;
  const series: AdminUsagePoint[] = starts.map((at) => ({
    at,
    roomsCreated: 0,
    gameStarts: 0,
    startPlayers: 0,
  }));
  const heatmap = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  const totals = emptyTotals();

  for (const r of rows) {
    if (r.hour < from || r.hour > now) continue;
    addTotals(totals, r);
    // Last bucket starting at or before this hour.
    let i = starts.length - 1;
    while (i > 0 && (starts[i] ?? 0) > r.hour) i--;
    const point = series[i];
    if (point) {
      point.roomsCreated += r.roomsCreated;
      point.gameStarts += r.gameStarts;
      point.startPlayers += r.startPlayers;
    }
    if (r.gameStarts > 0) {
      const p = zonedParts(r.hour, LOCAL_TZ);
      const cells = heatmap[p.weekday];
      if (cells) cells[p.hour] = (cells[p.hour] ?? 0) + r.gameStarts;
    }
  }

  const byGame = new Map<string, { plays: number; players: number }>();
  for (const g of games) {
    if (g.hour < from || g.hour > now) continue;
    const cur = byGame.get(g.gameId) ?? { plays: 0, players: 0 };
    cur.plays += g.plays;
    cur.players += g.players;
    byGame.set(g.gameId, cur);
  }
  const topGames = [...byGame]
    .map(([gameId, v]) => ({ gameId, plays: v.plays, players: v.players }))
    .sort((a, b) => b.plays - a.plays || a.gameId.localeCompare(b.gameId));

  return { days, bucket, from, to: now, series, heatmap, totals, games: topGames };
}

export class UsageStore {
  private readonly pending = new Map<number, AdminUsageTotals>();
  private readonly pendingGames = new Map<string, GameRow>();
  private readonly addHourQ: StatementSync;
  private readonly addGameQ: StatementSync;
  private readonly rowsQ: StatementSync;
  private readonly gamesQ: StatementSync;
  private readonly pruneHoursQ: StatementSync;
  private readonly pruneGamesQ: StatementSync;

  constructor(private readonly db: DatabaseSync) {
    this.addHourQ = db.prepare(
      `INSERT INTO usage_hourly (hour, rooms_created, game_starts, start_players, rooms_closed, room_seconds,
         rooms_played, room_players, pass_activations)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (hour) DO UPDATE SET
         rooms_created = rooms_created + excluded.rooms_created,
         game_starts = game_starts + excluded.game_starts,
         start_players = start_players + excluded.start_players,
         rooms_closed = rooms_closed + excluded.rooms_closed,
         room_seconds = room_seconds + excluded.room_seconds,
         rooms_played = rooms_played + excluded.rooms_played,
         room_players = room_players + excluded.room_players,
         pass_activations = pass_activations + excluded.pass_activations`,
    );
    this.addGameQ = db.prepare(
      `INSERT INTO game_hourly (hour, game_id, plays, players) VALUES (?, ?, ?, ?)
       ON CONFLICT (hour, game_id) DO UPDATE SET plays = plays + excluded.plays, players = players + excluded.players`,
    );
    this.rowsQ = db.prepare(
      `SELECT hour, rooms_created AS roomsCreated, game_starts AS gameStarts, start_players AS startPlayers,
         rooms_closed AS roomsClosed, room_seconds AS roomSeconds, rooms_played AS roomsPlayed,
         room_players AS roomPlayers, pass_activations AS passActivations
       FROM usage_hourly WHERE hour >= ? ORDER BY hour`,
    );
    this.gamesQ = db.prepare(
      'SELECT hour, game_id AS gameId, plays, players FROM game_hourly WHERE hour >= ? ORDER BY hour',
    );
    this.pruneHoursQ = db.prepare('DELETE FROM usage_hourly WHERE hour < ?');
    this.pruneGamesQ = db.prepare('DELETE FROM game_hourly WHERE hour < ?');
  }

  roomCreated(at: number): void {
    this.hour(at).roomsCreated++;
  }

  gameStarted(gameId: string, players: number, at: number): void {
    const h = this.hour(at);
    h.gameStarts++;
    h.startPlayers += players;
    const hour = floorHour(at);
    const key = `${hour}|${gameId}`;
    let g = this.pendingGames.get(key);
    if (!g) {
      if (this.pendingGames.size >= MAX_PENDING_GAMES) return;
      g = { hour, gameId, plays: 0, players: 0 };
      this.pendingGames.set(key, g);
    }
    g.plays++;
    g.players += players;
  }

  /** `lifetimeMs`: from opening until the screen left (or the last activity); `peakPlayers`: most seats taken. */
  roomClosed(lifetimeMs: number, peakPlayers: number, at: number): void {
    const h = this.hour(at);
    h.roomsClosed++;
    h.roomSeconds += Math.max(0, Math.round(lifetimeMs / 1000));
    if (peakPlayers > 0) {
      h.roomsPlayed++;
      h.roomPlayers += peakPlayers;
    }
  }

  passActivated(at: number): void {
    this.hour(at).passActivations++;
  }

  /** Writes what collected in memory (one transaction). */
  flush(): void {
    if (this.pending.size === 0 && this.pendingGames.size === 0) return;
    this.db.exec('BEGIN');
    try {
      for (const [hour, t] of this.pending) {
        this.addHourQ.run(
          hour,
          t.roomsCreated,
          t.gameStarts,
          t.startPlayers,
          t.roomsClosed,
          t.roomSeconds,
          t.roomsPlayed,
          t.roomPlayers,
          t.passActivations,
        );
      }
      for (const g of this.pendingGames.values()) this.addGameQ.run(g.hour, g.gameId, g.plays, g.players);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    this.pending.clear();
    this.pendingGames.clear();
  }

  summary(days: UsageDays, now: number): AdminUsage {
    this.flush();
    const from = usageBuckets(days, now).starts[0] ?? now;
    const rows = this.rowsQ.all(from) as unknown as UsageRow[];
    const games = this.gamesQ.all(from) as unknown as GameRow[];
    return summarizeUsage(rows, games, days, now);
  }

  prune(now: number): void {
    const before = now - USAGE_KEEP_DAYS * DAY_MS;
    this.pruneHoursQ.run(before);
    this.pruneGamesQ.run(before);
  }

  private hour(at: number): AdminUsageTotals {
    const hour = floorHour(at);
    let t = this.pending.get(hour);
    if (!t) {
      t = emptyTotals();
      this.pending.set(hour, t);
    }
    return t;
  }
}
