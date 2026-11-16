/**
 * Security log for the dashboard's "Keamanan": admin sign-ins, password changes and wrong Hoorah
 * Pass codes, each with its time and address, kept 30 days. Repeats of one kind from one address in
 * the same minute fold into one row with a count, so a flood of wrong codes costs one write per
 * minute. Entries collect in memory and are written every few seconds (and before every read).
 */
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { AdminEvent, AdminEventKind } from '@hoorah/protocol';
import { DAY_MS } from './zone';

export const EVENTS_KEEP_DAYS = 30;
export const EVENTS_LIST_MAX = 200;
/** Distinct (kind, address, minute) entries waiting; beyond this new ones are dropped until a flush. */
const MAX_PENDING = 2000;

interface Pending {
  at: number;
  minute: number;
  kind: AdminEventKind;
  ip: string;
  count: number;
  detail: string | null;
}

export class SecurityLog {
  private readonly pending = new Map<string, Pending>();
  private readonly upsertQ: StatementSync;
  private readonly listQ: StatementSync;
  private readonly pruneQ: StatementSync;

  constructor(private readonly db: DatabaseSync) {
    this.upsertQ = db.prepare(
      `INSERT INTO admin_events (at, minute, kind, ip, count, detail) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (kind, ip, minute) DO UPDATE SET at = max(at, excluded.at), count = count + excluded.count,
         detail = coalesce(excluded.detail, detail)`,
    );
    this.listQ = db.prepare(
      'SELECT id, at, kind, ip, count, detail FROM admin_events ORDER BY at DESC, id DESC LIMIT ?',
    );
    this.pruneQ = db.prepare('DELETE FROM admin_events WHERE at < ?');
  }

  record(kind: AdminEventKind, ip: string, at: number, detail: string | null = null): void {
    const minute = Math.floor(at / 60_000);
    const addr = ip.slice(0, 64) || '?';
    const key = `${kind}|${addr}|${minute}`;
    const cur = this.pending.get(key);
    if (cur) {
      cur.count++;
      cur.at = Math.max(cur.at, at);
      if (detail !== null) cur.detail = detail.slice(0, 64);
      return;
    }
    if (this.pending.size >= MAX_PENDING) return;
    this.pending.set(key, { at, minute, kind, ip: addr, count: 1, detail: detail?.slice(0, 64) ?? null });
  }

  flush(): void {
    if (this.pending.size === 0) return;
    this.db.exec('BEGIN');
    try {
      for (const e of this.pending.values())
        this.upsertQ.run(e.at, e.minute, e.kind, e.ip, e.count, e.detail);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    this.pending.clear();
  }

  /** Newest first. */
  list(limit = EVENTS_LIST_MAX): AdminEvent[] {
    this.flush();
    return this.listQ.all(Math.min(Math.max(1, limit), EVENTS_LIST_MAX)) as unknown as AdminEvent[];
  }

  prune(now: number): void {
    this.pruneQ.run(now - EVENTS_KEEP_DAYS * DAY_MS);
  }
}
