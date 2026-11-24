/**
 * The free trial (owner decision 2026-11-23): once per main screen (its `screen` id), for
 * `AppConfig.trialMinutes`. The address is kept only to stop one network from starting trial
 * after trial with new screen ids. The room logic only sees `TrialLookup`.
 */
import type { DatabaseSync, StatementSync } from 'node:sqlite';

export interface TrialRecord {
  screenId: string;
  startedAt: number;
  expiresAt: number;
}

export interface TrialLookup {
  get(screenId: string): TrialRecord | null;
  /** Other main screens that started a trial from `ip` since `since`. */
  otherScreensFromIp(ip: string, screenId: string, since: number): number;
  /** Returns false when this screen already had one. */
  start(screenId: string, ip: string, now: number, expiresAt: number): boolean;
}

export class TrialRepository implements TrialLookup {
  private readonly getQ: StatementSync;
  private readonly ipQ: StatementSync;
  private readonly startQ: StatementSync;

  constructor(db: DatabaseSync) {
    this.getQ = db.prepare(
      'SELECT screen_id AS screenId, started_at AS startedAt, expires_at AS expiresAt FROM trials WHERE screen_id = ?',
    );
    this.ipQ = db.prepare(
      'SELECT count(*) AS n FROM trials WHERE ip = ? AND screen_id != ? AND started_at >= ?',
    );
    this.startQ = db.prepare(
      `INSERT INTO trials (screen_id, ip, started_at, expires_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (screen_id) DO NOTHING`,
    );
  }

  get(screenId: string): TrialRecord | null {
    return (this.getQ.get(screenId) as TrialRecord | undefined) ?? null;
  }

  otherScreensFromIp(ip: string, screenId: string, since: number): number {
    return (this.ipQ.get(ip, screenId, since) as { n: number } | undefined)?.n ?? 0;
  }

  start(screenId: string, ip: string, now: number, expiresAt: number): boolean {
    return this.startQ.run(screenId, ip, now, expiresAt).changes > 0;
  }
}
