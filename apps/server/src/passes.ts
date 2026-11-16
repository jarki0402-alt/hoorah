/**
 * Hoorah Pass storage (trial stage: shared codes made in the admin dashboard, see
 * packages/protocol/src/pass.ts). The room logic only sees `PassLookup`, so it stays testable
 * without a database.
 */
import type { DatabaseSync, SQLInputValue, StatementSync } from 'node:sqlite';
import type { PassStatus } from '@hoorah/protocol';

/** A pass as the room logic needs it. */
export interface PassRecord {
  id: number;
  code: string;
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
}

export interface PassLookup {
  byCode(code: string): PassRecord | null;
  byId(id: number): PassRecord | null;
  /** A room started using the pass, or more players joined it. Keeps the highest count. */
  noteUse(passId: number, roomCode: string, roomCreatedAt: number, players: number, now: number): void;
}

export interface NewPass {
  code: string;
  label: string;
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

const RECORD_COLUMNS = `id, code, max_players AS maxPlayers, max_rooms AS maxRooms,
  expires_at AS expiresAt, revoked_at AS revokedAt`;

export class PassRepository implements PassLookup {
  private readonly byCodeQ: StatementSync;
  private readonly byIdQ: StatementSync;
  private readonly useQ: StatementSync;
  private readonly listQ: StatementSync;
  private readonly rowQ: StatementSync;
  private readonly insertQ: StatementSync;
  private readonly deleteQ: StatementSync;

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
    const rowSelect = `SELECT p.id, p.code, p.max_players AS maxPlayers, p.max_rooms AS maxRooms,
        p.expires_at AS expiresAt, p.revoked_at AS revokedAt, p.label, p.created_at AS createdAt,
        count(u.id) AS roomsUsed, coalesce(max(u.peak_players), 0) AS peakPlayers,
        max(u.last_seen_at) AS lastUsedAt
      FROM passes p LEFT JOIN pass_uses u ON u.pass_id = p.id`;
    this.listQ = db.prepare(`${rowSelect} GROUP BY p.id ORDER BY p.created_at DESC, p.id DESC`);
    this.rowQ = db.prepare(`${rowSelect} WHERE p.id = ? GROUP BY p.id`);
    this.insertQ = db.prepare(
      `INSERT INTO passes (code, label, max_players, max_rooms, expires_at, revoked_at, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?)
       ON CONFLICT (code) DO NOTHING`,
    );
    this.deleteQ = db.prepare('DELETE FROM passes WHERE id = ?');
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

  list(): PassRow[] {
    return this.listQ.all() as unknown as PassRow[];
  }

  row(id: number): PassRow | null {
    return (this.rowQ.get(id) as PassRow | undefined) ?? null;
  }

  /** Returns the new id, or null when the code is already taken. */
  insert(p: NewPass): number | null {
    const r = this.insertQ.run(p.code, p.label, p.maxPlayers, p.maxRooms, p.expiresAt, p.now, p.createdBy);
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
}
