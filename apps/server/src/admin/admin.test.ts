import { isPassCode, PASS_CODE_GENERATED_LENGTH } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { openDb } from '../db';
import type { Logger } from '../log';
import { PassRepository } from '../passes';
import { RoomManager } from '../rooms';
import { AdminAuth, hashPassword, SESSION_MS, verifyPassword } from './auth';
import { AdminService } from './service';

const quiet: Logger = { debug() {}, info() {}, warn() {}, error() {} };
const HOUR = 3_600_000;
const NOW = 1_800_000_000_000;

describe('admin passwords and sessions', () => {
  it('hashes with a fresh salt and verifies only the right password', async () => {
    const a = await hashPassword('rahasia-panjang');
    const b = await hashPassword('rahasia-panjang');
    expect(a).not.toBe(b);
    expect(a.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('rahasia-panjang', a)).toBe(true);
    expect(await verifyPassword('rahasia-salah!', a)).toBe(false);
    expect(await verifyPassword('apa saja', 'bukan-hash')).toBe(false);
  });

  it('logs in, keeps the session until it expires or logs out', async () => {
    const auth = new AdminAuth(openDb(':memory:'));
    expect(await auth.setUser('admin', 'kata-sandi-kuat', NOW)).toBe('created');
    expect(await auth.setUser('admin', 'kata-sandi-baru', NOW)).toBe('updated');
    expect((await auth.login('admin', 'kata-sandi-kuat', '1.1.1.1', NOW)).ok).toBe(false);
    const r = await auth.login('ADMIN', 'kata-sandi-baru', '1.1.1.1', NOW);
    if (!r.ok) throw new Error('login failed');
    expect(auth.session(r.token, NOW)).toMatchObject({ username: 'admin' });
    expect(auth.session(`${r.token}x`, NOW)).toBeNull();
    expect(auth.session(r.token, NOW + SESSION_MS)).toBeNull();
    const again = await auth.login('admin', 'kata-sandi-baru', '1.1.1.1', NOW);
    if (!again.ok) throw new Error('login failed');
    auth.logout(again.token);
    expect(auth.session(again.token, NOW)).toBeNull();
  });

  it('rejects weak or invalid users from the CLI path', async () => {
    const auth = new AdminAuth(openDb(':memory:'));
    await expect(auth.setUser('admin', 'pendek', NOW)).rejects.toThrow();
    await expect(auth.setUser('a b', 'kata-sandi-kuat', NOW)).rejects.toThrow();
    expect(auth.count()).toBe(0);
  });

  it('stops an address after repeated wrong passwords', async () => {
    const auth = new AdminAuth(openDb(':memory:'));
    await auth.setUser('admin', 'kata-sandi-kuat', NOW);
    for (let i = 0; i < 8; i++) {
      expect(await auth.login('admin', `salah-${i}-xxxx`, '6.6.6.6', NOW)).toEqual({
        ok: false,
        error: 'invalid_login',
      });
    }
    expect(await auth.login('admin', 'kata-sandi-kuat', '6.6.6.6', NOW)).toEqual({
      ok: false,
      error: 'rate_limited',
    });
    expect((await auth.login('admin', 'kata-sandi-kuat', '7.7.7.7', NOW)).ok).toBe(true);
    expect((await auth.login('admin', 'kata-sandi-kuat', '6.6.6.6', NOW + 16 * 60_000)).ok).toBe(true);
  });

  it('changes the password and signs other sessions out', async () => {
    const auth = new AdminAuth(openDb(':memory:'));
    await auth.setUser('admin', 'kata-sandi-kuat', NOW);
    const laptop = await auth.login('admin', 'kata-sandi-kuat', '1.1.1.1', NOW);
    const phone = await auth.login('admin', 'kata-sandi-kuat', '1.1.1.2', NOW);
    if (!laptop.ok || !phone.ok) throw new Error('login failed');
    const s = auth.session(laptop.token, NOW);
    if (!s) throw new Error('no session');
    expect(await auth.changePassword(s, 'salah-sekali', 'kata-sandi-baru', NOW)).toBe('wrong_password');
    expect(await auth.changePassword(s, 'kata-sandi-kuat', 'pendek', NOW)).toBe('weak_password');
    expect(await auth.changePassword(s, 'kata-sandi-kuat', 'kata-sandi-baru', NOW)).toBe('ok');
    expect(auth.session(laptop.token, NOW)).not.toBeNull();
    expect(auth.session(phone.token, NOW)).toBeNull();
  });
});

describe('admin pass service', () => {
  function setup() {
    const db = openDb(':memory:');
    db.exec(
      `INSERT INTO admins (id, username, password_hash, created_at, updated_at) VALUES (1, 'admin', 'x', 0, 0)`,
    );
    const passes = new PassRepository(db);
    const rooms = new RoomManager({
      now: () => NOW,
      random: Math.random,
      token: () => 'token-room-000001',
      maxPlayers: 2,
      roomsPerIpPerMinute: 10,
      log: quiet,
      passes,
    });
    const service = new AdminService({
      passes,
      rooms,
      now: () => NOW,
      random: Math.random,
      dbFile: ':memory:',
      startedAt: NOW - 5000,
    });
    return { service };
  }
  const base = { label: 'Main bareng', expiresAt: NOW + 24 * HOUR, maxPlayers: 16, maxRooms: null };

  it('creates passes with a generated or chosen code, never twice the same', () => {
    const { service } = setup();
    const a = service.createPass(base, 1);
    if (typeof a === 'string') throw new Error(a);
    expect(a.code).toHaveLength(PASS_CODE_GENERATED_LENGTH);
    expect(isPassCode(a.code)).toBe(true);
    expect(a).toMatchObject({ status: 'active', liveRooms: 0, roomsUsed: 0, label: 'Main bareng' });
    expect(service.createPass({ ...base, code: 'SABTU16' }, 1)).toMatchObject({ code: 'SABTU16' });
    expect(service.createPass({ ...base, code: 'SABTU16' }, 1)).toBe('code_taken');
  });

  it('refuses end times in the past or too far ahead', () => {
    const { service } = setup();
    expect(service.createPass({ ...base, expiresAt: NOW - 1 }, 1)).toBe('expired_time');
    expect(service.createPass({ ...base, expiresAt: NOW + 400 * 24 * HOUR }, 1)).toBe('expired_time');
  });

  it('extends, revokes, restores and deletes', () => {
    const { service } = setup();
    const p = service.createPass({ ...base, code: 'UBAH' }, 1);
    if (typeof p === 'string') throw new Error(p);
    expect(service.updatePass(p.id, { expiresAt: NOW + 72 * HOUR })).toMatchObject({
      expiresAt: NOW + 72 * HOUR,
    });
    expect(service.updatePass(p.id, { revoked: true })).toMatchObject({ status: 'revoked', revokedAt: NOW });
    expect(service.updatePass(p.id, { revoked: false })).toMatchObject({ status: 'active', revokedAt: null });
    expect(service.updatePass(9999, { revoked: true })).toBe('not_found');
    expect(service.deletePass(p.id)).toBe(true);
    expect(service.listPasses()).toEqual([]);
  });

  it('reports server numbers', () => {
    const { service } = setup();
    expect(service.stats()).toMatchObject({ uptimeSec: 5, rooms: 0, players: 0, sockets: 0, dbKb: 0 });
  });
});
