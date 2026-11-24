/**
 * "Laporkan masalah" reports and device errors sent by the main screen and the phones
 * (`POST /api/report`, `POST /api/errors`), read in the admin dashboard. No address is stored:
 * the limiters keep it in memory only while they need it.
 */
import { createHash } from 'node:crypto';
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import {
  type AdminErrorGroup,
  type AdminReport,
  type AdminReportList,
  type ClientContext,
  type ErrorInput,
  parseErrorInput,
  parseReportInput,
  type ReportInput,
  type ReportKind,
  type ReportStatus,
} from '@hoorah/protocol';
import { IpLimiter } from './limiter';

export const REPORT_STATUSES: readonly ReportStatus[] = ['baru', 'diproses', 'selesai'];
/** Oldest rows beyond these are dropped, so a flood can never fill the disk. */
const REPORTS_KEPT = 5000;
const ERROR_GROUPS_KEPT = 500;
const ERROR_LIST_MAX = 200;

export function isReportStatus(v: unknown): v is ReportStatus {
  return typeof v === 'string' && (REPORT_STATUSES as readonly string[]).includes(v);
}

/** Context from the database; a broken row still shows up instead of breaking the list. */
function readContext(raw: string): ClientContext {
  try {
    const v = JSON.parse(raw) as unknown;
    if (typeof v === 'object' && v !== null) return v as ClientContext;
  } catch {
    // Fall through.
  }
  return { role: 'screen', version: '', userAgent: '' };
}

/** Same message on the same kind of device and game = one group. */
export function errorKey(input: ErrorInput): string {
  const { role, gameId } = input.context;
  return createHash('sha256')
    .update(`${role}\n${gameId ?? ''}\n${input.message}`)
    .digest('hex')
    .slice(0, 32);
}

interface ReportDbRow {
  id: number;
  createdAt: number;
  kind: ReportKind;
  text: string;
  contact: string | null;
  status: ReportStatus;
  context: string;
}

export class ReportRepository {
  private readonly insertQ: StatementSync;
  private readonly trimQ: StatementSync;
  private readonly listAllQ: StatementSync;
  private readonly listQ: StatementSync;
  private readonly countsQ: StatementSync;
  private readonly statusQ: StatementSync;

  constructor(db: DatabaseSync) {
    const select = `SELECT id, created_at AS createdAt, kind, text, contact, status, context FROM reports`;
    this.insertQ = db.prepare(
      'INSERT INTO reports (created_at, kind, text, contact, status, context) VALUES (?, ?, ?, ?, ?, ?)',
    );
    this.trimQ = db.prepare(
      'DELETE FROM reports WHERE id NOT IN (SELECT id FROM reports ORDER BY created_at DESC, id DESC LIMIT ?)',
    );
    this.listAllQ = db.prepare(`${select} ORDER BY created_at DESC, id DESC LIMIT 500`);
    this.listQ = db.prepare(`${select} WHERE status = ? ORDER BY created_at DESC, id DESC LIMIT 500`);
    this.countsQ = db.prepare('SELECT status, count(*) AS n FROM reports GROUP BY status');
    this.statusQ = db.prepare('UPDATE reports SET status = ? WHERE id = ?');
  }

  add(r: ReportInput, now: number): number {
    const res = this.insertQ.run(now, r.kind, r.text, r.contact, 'baru', JSON.stringify(r.context));
    if (Number(res.lastInsertRowid) % 100 === 0) this.trimQ.run(REPORTS_KEPT);
    return Number(res.lastInsertRowid);
  }

  /** Newest first, optionally one status only, with the counts of every status. */
  list(status?: ReportStatus): AdminReportList {
    const rows = (status ? this.listQ.all(status) : this.listAllQ.all()) as unknown as ReportDbRow[];
    const counts: Record<ReportStatus, number> = { baru: 0, diproses: 0, selesai: 0 };
    for (const c of this.countsQ.all() as unknown as { status: string; n: number }[]) {
      if (isReportStatus(c.status)) counts[c.status] = c.n;
    }
    return {
      reports: rows.map(
        (r): AdminReport => ({
          id: r.id,
          createdAt: r.createdAt,
          kind: r.kind,
          text: r.text,
          contact: r.contact,
          status: r.status,
          context: readContext(r.context),
        }),
      ),
      counts,
    };
  }

  /** Returns false when there is no such report. */
  setStatus(id: number, status: ReportStatus): boolean {
    return this.statusQ.run(status, id).changes > 0;
  }
}

interface ErrorDbRow {
  id: number;
  message: string;
  stack: string | null;
  role: 'screen' | 'controller';
  gameId: string | null;
  count: number;
  firstAt: number;
  lastAt: number;
  last: string;
}

export class ErrorRepository {
  private readonly upsertQ: StatementSync;
  private readonly trimQ: StatementSync;
  private readonly listQ: StatementSync;
  private readonly deleteQ: StatementSync;
  private readonly clearQ: StatementSync;

  constructor(db: DatabaseSync) {
    this.upsertQ = db.prepare(
      `INSERT INTO error_groups (key, message, stack, role, game_id, count, first_at, last_at, last_context)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET
         count = count + 1,
         stack = coalesce(excluded.stack, stack),
         last_at = excluded.last_at,
         last_context = excluded.last_context
       RETURNING count`,
    );
    this.trimQ = db.prepare(
      'DELETE FROM error_groups WHERE id NOT IN (SELECT id FROM error_groups ORDER BY last_at DESC LIMIT ?)',
    );
    this.listQ = db.prepare(
      `SELECT id, message, stack, role, game_id AS gameId, count, first_at AS firstAt, last_at AS lastAt,
         last_context AS last
       FROM error_groups ORDER BY last_at DESC, id DESC LIMIT ?`,
    );
    this.deleteQ = db.prepare('DELETE FROM error_groups WHERE id = ?');
    this.clearQ = db.prepare('DELETE FROM error_groups');
  }

  /** Counts one more of this error. Returns how many times its group has been seen. */
  add(e: ErrorInput, now: number): number {
    const row = this.upsertQ.get(
      errorKey(e),
      e.message,
      e.stack,
      e.context.role,
      e.context.gameId ?? null,
      now,
      now,
      JSON.stringify(e.context),
    ) as { count: number } | undefined;
    const count = row?.count ?? 1;
    // A new group: keep the table small.
    if (count === 1) this.trimQ.run(ERROR_GROUPS_KEPT);
    return count;
  }

  /** Most recently seen first. */
  list(): AdminErrorGroup[] {
    return (this.listQ.all(ERROR_LIST_MAX) as unknown as ErrorDbRow[]).map((r) => ({
      id: r.id,
      message: r.message,
      stack: r.stack,
      role: r.role,
      gameId: r.gameId,
      count: r.count,
      firstAt: r.firstAt,
      lastAt: r.lastAt,
      last: readContext(r.last),
    }));
  }

  delete(id: number): boolean {
    return this.deleteQ.run(id).changes > 0;
  }

  clear(): number {
    return Number(this.clearQ.run().changes);
  }
}

/** HTTP status for a public intake request. */
export type IntakeStatus = 204 | 400 | 429;

/** Validates, rate limits and stores what devices send. Called by the HTTP layer. */
export class FeedbackIntake {
  /** 5 reports per 10 minutes per address. */
  private readonly reportLimiter = new IpLimiter(5 / 600, 5);
  /** 30 errors per minute per address. */
  private readonly errorLimiter = new IpLimiter(0.5, 30);

  constructor(
    private readonly reports: ReportRepository,
    private readonly errors: ErrorRepository,
  ) {}

  report(ip: string, body: unknown, now: number): IntakeStatus {
    if (!this.reportLimiter.allow(ip, now)) return 429;
    const input = parseReportInput(body);
    if (!input) return 400;
    this.reports.add(input, now);
    return 204;
  }

  error(ip: string, body: unknown, now: number): IntakeStatus {
    if (!this.errorLimiter.allow(ip, now)) return 429;
    const input = parseErrorInput(body);
    if (!input) return 400;
    this.errors.add(input, now);
    return 204;
  }
}
