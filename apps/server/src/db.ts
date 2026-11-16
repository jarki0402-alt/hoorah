/**
 * The server's only durable store: one SQLite file (Node's built-in `node:sqlite`, no extra
 * service). Holds admin users and sessions, Hoorah Pass codes and where they were used, and the
 * dashboard's monitoring (system samples, egress, aggregated usage, security log). Rooms stay
 * in memory (see rooms.ts). Back up by copying the file while the server is stopped.
 */
import { mkdirSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** Each entry upgrades the schema by one version (`PRAGMA user_version`); never edit old ones. */
const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE admins (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE admin_sessions (
    token_hash TEXT PRIMARY KEY,
    admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    ip TEXT NOT NULL
  );
  CREATE INDEX admin_sessions_admin ON admin_sessions(admin_id);
  CREATE TABLE passes (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    max_players INTEGER NOT NULL,
    max_rooms INTEGER,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER,
    created_at INTEGER NOT NULL,
    created_by INTEGER REFERENCES admins(id) ON DELETE SET NULL
  );
  CREATE TABLE pass_uses (
    id INTEGER PRIMARY KEY,
    pass_id INTEGER NOT NULL REFERENCES passes(id) ON DELETE CASCADE,
    room_code TEXT NOT NULL,
    room_created_at INTEGER NOT NULL,
    started_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    peak_players INTEGER NOT NULL,
    UNIQUE (pass_id, room_code, room_created_at)
  );
  `,
  // 2: monitoring for the admin dashboard. Times are epoch ms; hour rows start on a UTC hour.
  `
  CREATE TABLE system_samples (
    at INTEGER PRIMARY KEY,
    ram_used INTEGER NOT NULL,
    ram_total INTEGER NOT NULL,
    swap_used INTEGER NOT NULL,
    swap_total INTEGER NOT NULL,
    load1 REAL NOT NULL,
    cpus INTEGER NOT NULL,
    disk_used INTEGER,
    disk_total INTEGER,
    rss INTEGER NOT NULL,
    heap_used INTEGER NOT NULL,
    db_bytes INTEGER NOT NULL,
    sockets INTEGER NOT NULL,
    screens INTEGER NOT NULL,
    phones INTEGER NOT NULL,
    rooms INTEGER NOT NULL,
    players INTEGER NOT NULL,
    direct INTEGER NOT NULL,
    relay_bytes INTEGER NOT NULL,
    net_tx INTEGER,
    net_rx INTEGER
  );
  CREATE TABLE net_counter (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    boot_id TEXT NOT NULL,
    iface TEXT NOT NULL,
    tx INTEGER NOT NULL,
    rx INTEGER NOT NULL,
    at INTEGER NOT NULL,
    since INTEGER NOT NULL
  );
  CREATE TABLE net_hourly (
    hour INTEGER PRIMARY KEY,
    tx INTEGER NOT NULL,
    rx INTEGER NOT NULL
  );
  CREATE TABLE usage_hourly (
    hour INTEGER PRIMARY KEY,
    rooms_created INTEGER NOT NULL DEFAULT 0,
    game_starts INTEGER NOT NULL DEFAULT 0,
    start_players INTEGER NOT NULL DEFAULT 0,
    rooms_closed INTEGER NOT NULL DEFAULT 0,
    room_seconds INTEGER NOT NULL DEFAULT 0,
    rooms_played INTEGER NOT NULL DEFAULT 0,
    room_players INTEGER NOT NULL DEFAULT 0,
    pass_activations INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE game_hourly (
    hour INTEGER NOT NULL,
    game_id TEXT NOT NULL,
    plays INTEGER NOT NULL,
    players INTEGER NOT NULL,
    PRIMARY KEY (hour, game_id)
  );
  CREATE TABLE admin_events (
    id INTEGER PRIMARY KEY,
    at INTEGER NOT NULL,
    minute INTEGER NOT NULL,
    kind TEXT NOT NULL,
    ip TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 1,
    detail TEXT,
    UNIQUE (kind, ip, minute)
  );
  CREATE INDEX admin_events_at ON admin_events(at);
  CREATE TABLE meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
];

export function openDb(file: string): DatabaseSync {
  const memory = file === ':memory:';
  if (!memory) mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 2000;');
  if (!memory) db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
  migrate(db);
  return db;
}

function migrate(db: DatabaseSync): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined;
  const from = row?.user_version ?? 0;
  for (let v = from; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v] as string);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

/** Size of the database file plus its write-ahead log, in bytes (0 for an in-memory database). */
export function dbSizeBytes(file: string): number {
  if (file === ':memory:') return 0;
  let bytes = 0;
  for (const f of [file, `${file}-wal`]) {
    try {
      bytes += statSync(f).size;
    } catch {
      // Not created yet.
    }
  }
  return bytes;
}

/** The same in KB. */
export function dbSizeKb(file: string): number {
  return Math.round(dbSizeBytes(file) / 1024);
}

/** Every table and how many rows it holds (small tables only: this counts them all). */
export function tableRows(db: DatabaseSync): { name: string; rows: number }[] {
  const names = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { name: string }[];
  return names.map(({ name }) => {
    const row = db.prepare(`SELECT count(*) AS n FROM "${name.replaceAll('"', '""')}"`).get() as
      | { n: number }
      | undefined;
    return { name, rows: row?.n ?? 0 };
  });
}
