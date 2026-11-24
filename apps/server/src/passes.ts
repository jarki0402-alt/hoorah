/**
 * Hoorah Pass storage: codes made in the admin dashboard (`shared`, `single`, `promo`, see
 * packages/protocol/src/pass.ts) and, for single and promo codes, which main screen uses them
 * (`entitlements`). The room logic only sees `PassLookup`, so it stays testable without a database.
 */
import type { DatabaseSync, SQLInputValue, StatementSync } from 'node:sqlite';
import type { PassKind, PassStatus } from '@hoorah/protocol';

/** A pass as the room logic needs it. */
export interface PassRecord {
  id: number;
  code: string;
  kind: PassKind;
  /** single and promo: how long the code runs from its first use on a screen. */
  durationMs: number | null;
  /** promo: how many main screens may use it; null = no limit. */
  maxUses: number | null;
  maxPlayers: number;
  /** Rooms that may use it at the same time; null = no limit. */
  maxRooms: number | null;
  expiresAt: number;
  revokedAt: number | null;
}

/** A pass with its owner notes and usage, for the dashboard. */
export interface PassRow extends PassRecord {
  label: string;
  createdAt: number;
  roomsUsed: number;
  peakPlayers: number;
  lastUsedAt: number | null;
  /** Main screens that have used a single or promo code. */
  uses: number;
  /** First time a screen started using it (single or promo), or null. */
  firstStartedAt: number | null;
  /** When the latest screen's run of it ends (single: when it ends), or null. */
  lastRunsUntil: number | null;
}

/** A single or promo code bound to one main screen. */
export interface Entitlement {
  passId: number;
  screenId: string;
  startedAt: number;
  expiresAt: number;
  movedAt: number | null;
}

/** An entitlement a screen can use now, with what its pass gives. */
export interface ScreenGrant {
  passId: number;
  code: string;
  maxPlayers: number;
  expiresAt: number;
}

export interface PassLookup {
  byCode(code: string): PassRecord | null;
  byId(id: number): PassRecord | null;
  /** A room started using the pass, or more players joined it. Keeps the highest count. */
  noteUse(passId: number, roomCode: string, roomCreatedAt: number, players: number, now: number): void;
  /** Running entitlements of a main screen whose pass is not revoked. */
  screenGrants(screenId: string, now: number): ScreenGrant[];
  /** Where a single code is bound (any screen), or null when it was never used. */
  singleBinding(passId: number): Entitlement | null;
  /** This screen's entitlement of `passId`, or null. */
  binding(passId: number, screenId: string): Entitlement | null;
  /** Screens that have used the code. */
  uses(passId: number): number;
  /** Returns false when the screen already has one for this pass. */
  bind(passId: number, screenId: string, now: number, expiresAt: number): boolean;
  /** Moves a single code to another screen (its end time stays). */
  move(passId: number, toScreenId: string, now: number): void;
}

export interface NewPass {
  code: string;
  label: string;
  /** Default `shared`. */
  kind?: PassKind;
  durationMs?: number | null;
  maxUses?: number | null;
  maxPlayers: number;
  maxRooms: number | null;
  expiresAt: number;
  createdBy: number | null;
  now: number;
}

export interface PassChanges {
  label?: string;
  maxPlayers?: number;
  maxRooms?: number | null;
  expiresAt?: number;
  revokedAt?: number | null;
}

export function passStatus(p: PassRecord, now: number): PassStatus {
  if (p.revokedAt !== null) return 'revoked';
  return p.expiresAt <= now ? 'expired' : 'active';
}

const RECORD_COLUMNS = `id, code, kind, duration_ms AS durationMs, max_uses AS maxUses,
  max_players AS maxPlayers, max_rooms AS maxRooms, expires_at AS expiresAt, revoked_at AS revokedAt`;
const ENTITLEMENT_COLUMNS = `pass_id AS passId, screen_id AS screenId, started_at AS startedAt,
  expires_at AS expiresAt, moved_at AS movedAt`;

export class PassRepository implements PassLookup {
  private readonly byCodeQ: StatementSync;
  private readonly byIdQ: StatementSync;
  private readonly useQ: StatementSync;
  private readonly listQ: StatementSync;
  private readonly rowQ: StatementSync;
  private readonly insertQ: StatementSync;
  private readonly deleteQ: StatementSync;
  private readonly grantsQ: StatementSync;
  private readonly singleQ: StatementSync;
  private readonly bindingQ: StatementSync;
  private readonly usesQ: StatementSync;
  private readonly bindQ: StatementSync;
  private readonly moveQ: StatementSync;

  constructor(private readonly db: DatabaseSync) {
    this.byCodeQ = db.prepare(`SELECT ${RECORD_COLUMNS} FROM passes WHERE code = ?`);
    this.byIdQ = db.prepare(`SELECT ${RECORD_COLUMNS} FROM passes WHERE id = ?`);
    this.useQ = db.prepare(
      `INSERT INTO pass_uses (pass_id, room_code, room_created_at, started_at, last_seen_at, peak_players)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (pass_id, room_code, room_created_at) DO UPDATE SET
         last_seen_at = excluded.last_seen_at,
         peak_players = max(peak_players, excluded.peak_players)`,
    );
    const rowSelect = `SELECT p.id, p.code, p.kind, p.duration_ms AS durationMs, p.max_uses AS maxUses,
        p.max_players AS maxPlayers, p.max_rooms AS maxRooms,
        p.expires_at AS expiresAt, p.revoked_at AS revokedAt, p.label, p.created_at AS createdAt,
        count(u.id) AS roomsUsed, coalesce(max(u.peak_players), 0) AS peakPlayers,
        max(u.last_seen_at) AS lastUsedAt,
        (SELECT count(*) FROM entitlements e WHERE e.pass_id = p.id) AS uses,
        (SELECT min(e.started_at) FROM entitlements e WHERE e.pass_id = p.id) AS firstStartedAt,
        (SELECT max(e.expires_at) FROM entitlements e WHERE e.pass_id = p.id) AS lastRunsUntil
      FROM passes p LEFT JOIN pass_uses u ON u.pass_id = p.id`;
    this.listQ = db.prepare(`${rowSelect} GROUP BY p.id ORDER BY p.created_at DESC, p.id DESC`);
    this.rowQ = db.prepare(`${rowSelect} WHERE p.id = ? GROUP BY p.id`);
    this.insertQ = db.prepare(
      `INSERT INTO passes (code, label, kind, duration_ms, max_uses, max_players, max_rooms, expires_at,
         revoked_at, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
       ON CONFLICT (code) DO NOTHING`,
    );
    this.deleteQ = db.prepare('DELETE FROM passes WHERE id = ?');
    this.grantsQ = db.prepare(
      `SELECT e.pass_id AS passId, p.code, p.max_players AS maxPlayers, e.expires_at AS expiresAt
       FROM entitlements e JOIN passes p ON p.id = e.pass_id
       WHERE e.screen_id = ? AND e.expires_at > ? AND p.revoked_at IS NULL`,
    );
    this.singleQ = db.prepare(`SELECT ${ENTITLEMENT_COLUMNS} FROM entitlements WHERE pass_id = ? LIMIT 1`);
    this.bindingQ = db.prepare(
      `SELECT ${ENTITLEMENT_COLUMNS} FROM entitlements WHERE pass_id = ? AND screen_id = ?`,
    );
    this.usesQ = db.prepare('SELECT count(*) AS n FROM entitlements WHERE pass_id = ?');
    this.bindQ = db.prepare(
      `INSERT INTO entitlements (pass_id, screen_id, started_at, expires_at, moved_at)
       VALUES (?, ?, ?, ?, NULL)
       ON CONFLICT (pass_id, screen_id) DO NOTHING`,
    );
    this.moveQ = db.prepare('UPDATE entitlements SET screen_id = ?, moved_at = ? WHERE pass_id = ?');
  }

  byCode(code: string): PassRecord | null {
    return (this.byCodeQ.get(code) as PassRecord | undefined) ?? null;
  }

  byId(id: number): PassRecord | null {
    return (this.byIdQ.get(id) as PassRecord | undefined) ?? null;
  }

  noteUse(passId: number, roomCode: string, roomCreatedAt: number, players: number, now: number): void {
    this.useQ.run(passId, roomCode, roomCreatedAt, now, now, players);
  }

  screenGrants(screenId: string, now: number): ScreenGrant[] {
    return this.grantsQ.all(screenId, now) as unknown as ScreenGrant[];
  }

  singleBinding(passId: number): Entitlement | null {
    return (this.singleQ.get(passId) as Entitlement | undefined) ?? null;
  }

  binding(passId: number, screenId: string): Entitlement | null {
    return (this.bindingQ.get(passId, screenId) as Entitlement | undefined) ?? null;
  }

  uses(passId: number): number {
    return (this.usesQ.get(passId) as { n: number } | undefined)?.n ?? 0;
  }

  bind(passId: number, screenId: string, now: number, expiresAt: number): boolean {
    return this.bindQ.run(passId, screenId, now, expiresAt).changes > 0;
  }

  move(passId: number, toScreenId: string, now: number): void {
    this.moveQ.run(toScreenId, now, passId);
  }

  list(): PassRow[] {
    return this.listQ.all() as unknown as PassRow[];
  }

  row(id: number): PassRow | null {
    return (this.rowQ.get(id) as PassRow | undefined) ?? null;
  }

  /** Returns the new id, or null when the code is already taken. */
  insert(p: NewPass): number | null {
    const r = this.insertQ.run(
      p.code,
      p.label,
      p.kind ?? 'shared',
      p.durationMs ?? null,
      p.maxUses ?? null,
      p.maxPlayers,
      p.maxRooms,
      p.expiresAt,
      p.now,
      p.createdBy,
    );
    return r.changes === 0 ? null : Number(r.lastInsertRowid);
  }

  /** Returns false when there is no such pass. */
  update(id: number, c: PassChanges): boolean {
    const sets: string[] = [];
    const values: SQLInputValue[] = [];
    const put = (column: string, value: SQLInputValue) => {
      sets.push(`${column} = ?`);
      values.push(value);
    };
    if (c.label !== undefined) put('label', c.label);
    if (c.maxPlayers !== undefined) put('max_players', c.maxPlayers);
    if (c.maxRooms !== undefined) put('max_rooms', c.maxRooms);
    if (c.expiresAt !== undefined) put('expires_at', c.expiresAt);
    if (c.revokedAt !== undefined) put('revoked_at', c.revokedAt);
    if (sets.length === 0) return this.byId(id) !== null;
    const r = this.db.prepare(`UPDATE passes SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
    return r.changes > 0;
  }

  delete(id: number): boolean {
    return this.deleteQ.run(id).changes > 0;
  }

  /** Runs `fn` in one transaction (many inserts at once are much faster). */
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN');
    try {
      const out = fn();
      this.db.exec('COMMIT');
      return out;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }
}
