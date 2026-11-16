/**
 * Admin users and sessions. Passwords: scrypt with a random salt per user. Sessions: a random
 * token in an httpOnly cookie; only its SHA-256 is stored, so a copied database file cannot be
 * used to log in.
 */
import { createHash, randomBytes, type ScryptOptions, scrypt, timingSafeEqual } from 'node:crypto';
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import { isAdminUsername, isStrongPassword } from '@hoorah/protocol';

const SCRYPT: Required<Pick<ScryptOptions, 'N' | 'r' | 'p'>> = { N: 16384, r: 8, p: 1 };
const KEY_BYTES = 64;
export const SESSION_MS = 7 * 24 * 60 * 60_000;
/** Failed logins one address may make per window before it has to wait. */
const LOGIN_FAILS = 8;
const LOGIN_WINDOW_MS = 15 * 60_000;

function derive(password: string, salt: Buffer, o: typeof SCRYPT): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_BYTES, { ...o, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

/** `scrypt$N$r$p$salt$key` (base64url). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64url'), key.toString('base64url')].join(
    '$',
  );
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, n, r, p, salt, key] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !key) return false;
  const o = { N: Number(n), r: Number(r), p: Number(p) };
  if (!Number.isInteger(o.N) || !Number.isInteger(o.r) || !Number.isInteger(o.p)) return false;
  const expected = Buffer.from(key, 'base64url');
  const actual = await derive(password, Buffer.from(salt, 'base64url'), o);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const sha256 = (token: string): string => createHash('sha256').update(token).digest('hex');

interface AdminRow {
  id: number;
  username: string;
  passwordHash: string;
}

export interface AdminSession {
  adminId: number;
  username: string;
  tokenHash: string;
}

export type LoginResult =
  | { ok: true; token: string; username: string; expiresAt: number }
  | { ok: false; error: 'invalid_login' | 'rate_limited' };

export type PasswordChange = 'ok' | 'wrong_password' | 'weak_password';

export class AdminAuth {
  private readonly byNameQ: StatementSync;
  private readonly byIdQ: StatementSync;
  private readonly countQ: StatementSync;
  private readonly listQ: StatementSync;
  private readonly insertQ: StatementSync;
  private readonly setHashQ: StatementSync;
  private readonly removeQ: StatementSync;
  private readonly newSessionQ: StatementSync;
  private readonly sessionQ: StatementSync;
  private readonly endSessionQ: StatementSync;
  private readonly endOthersQ: StatementSync;
  private readonly sweepQ: StatementSync;
  private readonly fails = new Map<string, number[]>();
  /** Compared against when the username does not exist, so timing does not reveal it. */
  private dummyHash: Promise<string> | null = null;

  constructor(db: DatabaseSync) {
    const cols = 'id, username, password_hash AS passwordHash';
    this.byNameQ = db.prepare(`SELECT ${cols} FROM admins WHERE username = ?`);
    this.byIdQ = db.prepare(`SELECT ${cols} FROM admins WHERE id = ?`);
    this.countQ = db.prepare('SELECT count(*) AS n FROM admins');
    this.listQ = db.prepare('SELECT username, created_at AS createdAt FROM admins ORDER BY id');
    this.insertQ = db.prepare(
      'INSERT INTO admins (username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)',
    );
    this.setHashQ = db.prepare('UPDATE admins SET password_hash = ?, updated_at = ? WHERE id = ?');
    this.removeQ = db.prepare('DELETE FROM admins WHERE username = ?');
    this.newSessionQ = db.prepare(
      'INSERT INTO admin_sessions (token_hash, admin_id, created_at, expires_at, ip) VALUES (?, ?, ?, ?, ?)',
    );
    this.sessionQ = db.prepare(
      `SELECT s.admin_id AS adminId, a.username, s.expires_at AS expiresAt
       FROM admin_sessions s JOIN admins a ON a.id = s.admin_id WHERE s.token_hash = ?`,
    );
    this.endSessionQ = db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?');
    this.endOthersQ = db.prepare('DELETE FROM admin_sessions WHERE admin_id = ? AND token_hash != ?');
    this.sweepQ = db.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?');
  }

  count(): number {
    return (this.countQ.get() as { n: number }).n;
  }

  list(): { username: string; createdAt: number }[] {
    return this.listQ.all() as unknown as { username: string; createdAt: number }[];
  }

  /** Creates the user or replaces their password (CLI and first-start seeding). */
  async setUser(username: string, password: string, now: number): Promise<'created' | 'updated'> {
    if (!isAdminUsername(username))
      throw new Error('Username 3–32 karakter: huruf, angka, titik, minus, atau garis bawah.');
    if (!isStrongPassword(password)) throw new Error('Kata sandi minimal 10 karakter.');
    const hash = await hashPassword(password);
    const existing = this.byNameQ.get(username) as AdminRow | undefined;
    if (existing) {
      this.setHashQ.run(hash, now, existing.id);
      return 'updated';
    }
    this.insertQ.run(username, hash, now, now);
    return 'created';
  }

  removeUser(username: string): boolean {
    return this.removeQ.run(username).changes > 0;
  }

  async login(username: string, password: string, ip: string, now: number): Promise<LoginResult> {
    const recent = (this.fails.get(ip) ?? []).filter((t) => now - t < LOGIN_WINDOW_MS);
    if (recent.length >= LOGIN_FAILS) return { ok: false, error: 'rate_limited' };
    const user = this.byNameQ.get(username) as AdminRow | undefined;
    if (!this.dummyHash) this.dummyHash = hashPassword(randomBytes(12).toString('hex'));
    const good = await verifyPassword(password, user?.passwordHash ?? (await this.dummyHash));
    if (!user || !good) {
      recent.push(now);
      this.fails.set(ip, recent);
      if (this.fails.size > 5000) this.forgetOldFails(now);
      return { ok: false, error: 'invalid_login' };
    }
    this.fails.delete(ip);
    this.sweepQ.run(now);
    const token = randomBytes(32).toString('base64url');
    const expiresAt = now + SESSION_MS;
    this.newSessionQ.run(sha256(token), user.id, now, expiresAt, ip.slice(0, 64));
    return { ok: true, token, username: user.username, expiresAt };
  }

  session(token: string | null, now: number): AdminSession | null {
    if (!token || token.length > 128) return null;
    const tokenHash = sha256(token);
    const row = this.sessionQ.get(tokenHash) as
      | { adminId: number; username: string; expiresAt: number }
      | undefined;
    if (!row) return null;
    if (row.expiresAt <= now) {
      this.endSessionQ.run(tokenHash);
      return null;
    }
    return { adminId: row.adminId, username: row.username, tokenHash };
  }

  logout(token: string | null): void {
    if (token) this.endSessionQ.run(sha256(token));
  }

  /** Signs every other session of this admin out. */
  async changePassword(s: AdminSession, current: string, next: string, now: number): Promise<PasswordChange> {
    const user = this.byIdQ.get(s.adminId) as AdminRow | undefined;
    if (!user || !(await verifyPassword(current, user.passwordHash))) return 'wrong_password';
    if (!isStrongPassword(next)) return 'weak_password';
    this.setHashQ.run(await hashPassword(next), now, user.id);
    this.endOthersQ.run(user.id, s.tokenHash);
    return 'ok';
  }

  private forgetOldFails(now: number): void {
    for (const [ip, times] of this.fails) {
      if (times.every((t) => now - t >= LOGIN_WINDOW_MS)) this.fails.delete(ip);
    }
  }
}
