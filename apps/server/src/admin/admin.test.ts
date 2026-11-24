import {
  DEFAULT_CONFIG,
  isPassCode,
  PASS_CODE_GENERATED_LENGTH,
  PROTOCOL_VERSION,
  type ServerMsg,
} from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { openDb } from '../db';
import type { Logger } from '../log';
import { PassRepository } from '../passes';
import { ErrorRepository, ReportRepository } from '../reports';
import { type Conn, RoomManager } from '../rooms';
import { SettingsRepository } from '../settings';
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
    const settings = new SettingsRepository(db);
    const reports = new ReportRepository(db);
    const errors = new ErrorRepository(db);
    const rooms = new RoomManager({
      now: () => NOW,
      random: Math.random,
      token: () => 'token-room-000001',
      maxPlayers: 2,
      roomsPerIpPerMinute: 10,
      log: quiet,
      passes,
      config: settings.config(),
    });
    const service = new AdminService({
      passes,
      rooms,
      now: () => NOW,
      random: Math.random,
      dbFile: ':memory:',
      startedAt: NOW - 5000,
      settings,
      reports,
      errors,
    });
    return { service, settings, reports, errors, rooms };
  }
  const base = { label: 'Main bareng', expiresAt: NOW + 24 * HOUR, maxPlayers: 16, maxRooms: null };

  it('creates passes with a generated or chosen code, never twice the same', () => {
    const { service } = setup();
    const created = service.createPass(base, 1);
    if (typeof created === 'string') throw new Error(created);
    const [a] = created;
    if (!a) throw new Error('nothing created');
    expect(a.code).toHaveLength(PASS_CODE_GENERATED_LENGTH);
    expect(isPassCode(a.code)).toBe(true);
    expect(a).toMatchObject({
      status: 'active',
      liveRooms: 0,
      roomsUsed: 0,
      label: 'Main bareng',
      kind: 'shared',
    });
    expect(service.createPass({ ...base, code: 'SABTU16' }, 1)).toMatchObject([{ code: 'SABTU16' }]);
    expect(service.createPass({ ...base, code: 'SABTU16' }, 1)).toBe('code_taken');
  });

  it('refuses end times in the past or too far ahead', () => {
    const { service } = setup();
    expect(service.createPass({ ...base, expiresAt: NOW - 1 }, 1)).toBe('expired_time');
    expect(service.createPass({ ...base, expiresAt: NOW + 400 * 24 * HOUR }, 1)).toBe('expired_time');
  });

  it('extends, revokes, restores and deletes', () => {
    const { service } = setup();
    const created = service.createPass({ ...base, code: 'UBAH' }, 1);
    if (typeof created === 'string' || !created[0]) throw new Error('not created');
    const p = created[0];
    expect(service.updatePass(p.id, { expiresAt: NOW + 72 * HOUR })).toMatchObject({
      expiresAt: NOW + 72 * HOUR,
    });
    expect(service.updatePass(p.id, { revoked: true })).toMatchObject({ status: 'revoked', revokedAt: NOW });
    expect(service.updatePass(p.id, { revoked: false })).toMatchObject({ status: 'active', revokedAt: null });
    expect(service.updatePass(9999, { revoked: true })).toBe('not_found');
    expect(service.deletePass(p.id)).toBe(true);
    expect(service.listPasses()).toEqual([]);
  });

  it('makes a batch of single codes, all different, with the same settings', () => {
    const { service } = setup();
    const r = service.createPass({ ...base, kind: 'single', durationDays: 30, count: 25 }, 1);
    if (typeof r === 'string') throw new Error(r);
    expect(r).toHaveLength(25);
    expect(new Set(r.map((p) => p.code)).size).toBe(25);
    expect(r[0]).toMatchObject({ kind: 'single', durationMs: 30 * 24 * HOUR, maxUses: null, uses: 0 });
    expect(service.listPasses()).toHaveLength(25);
  });

  it('makes promo codes with a use limit', () => {
    const { service } = setup();
    const r = service.createPass(
      { ...base, code: 'MERDEKA', kind: 'promo', durationDays: 3, maxUses: 100 },
      1,
    );
    expect(r).toMatchObject([
      { code: 'MERDEKA', kind: 'promo', durationMs: 3 * 24 * HOUR, maxUses: 100, uses: 0 },
    ]);
  });

  it('reports server numbers', () => {
    const { service } = setup();
    expect(service.stats()).toMatchObject({ uptimeSec: 5, rooms: 0, players: 0, sockets: 0, dbKb: 0 });
  });
});

describe('admin settings, reports and errors', () => {
  class FakeConn implements Conn {
    sent: ServerMsg[] = [];
    readonly ip = '1.1.1.1';
    send(msg: ServerMsg) {
      this.sent.push(msg);
    }
    sendBinary() {}
    close() {}
  }

  function setup() {
    const db = openDb(':memory:');
    const passes = new PassRepository(db);
    const settings = new SettingsRepository(db);
    const reports = new ReportRepository(db);
    const errors = new ErrorRepository(db);
    const rooms = new RoomManager({
      now: () => NOW,
      random: Math.random,
      token: () => 'token-room-000001',
      maxPlayers: 2,
      roomsPerIpPerMinute: 10,
      log: quiet,
      passes,
      config: settings.config(),
    });
    const service = new AdminService({
      passes,
      rooms,
      now: () => NOW,
      random: Math.random,
      dbFile: ':memory:',
      startedAt: NOW,
      settings,
      reports,
      errors,
    });
    return { service, settings, reports, errors, rooms };
  }

  it('saves the settings, keeps them over a restart and tells every screen', () => {
    const { service, settings, rooms } = setup();
    expect(service.config()).toEqual(DEFAULT_CONFIG);
    const screen = new FakeConn();
    rooms.handleMessage(screen, { t: 'hello', role: 'screen', v: PROTOCOL_VERSION });
    const next = service.setConfig({ openAll: true, adSeconds: 1000, weeklyGame: 'ludo' });
    expect(next).toEqual({ ...DEFAULT_CONFIG, openAll: true, adSeconds: 30, weeklyGame: 'ludo' });
    expect(settings.config()).toEqual(next);
    expect(screen.sent).toContainEqual({ t: 'config', config: next });
    expect(screen.sent.at(-1)).toMatchObject({ t: 'room', access: { kind: 'open' } });
    // A partial body changes only what it names.
    expect(service.setConfig({ trialMinutes: 45 })).toMatchObject({ openAll: true, trialMinutes: 45 });
  });

  it('lists reports by status and changes their status', () => {
    const { service, reports } = setup();
    const ctx = { role: 'screen' as const, version: 'v1', userAgent: 'TV' };
    const id = reports.add({ kind: 'teknis', text: 'Suara hilang', contact: null, context: ctx }, NOW);
    expect(service.reports().reports).toHaveLength(1);
    expect(service.setReportStatus(id, 'diproses')).toBe(true);
    expect(service.reports('baru').reports).toEqual([]);
    expect(service.reports('diproses').counts).toEqual({ baru: 0, diproses: 1, selesai: 0 });
    expect(service.setReportStatus(id + 1, 'selesai')).toBe(false);
  });

  it('lists, deletes and clears error groups', () => {
    const { service, errors } = setup();
    const ctx = { role: 'controller' as const, version: 'v1', userAgent: 'HP' };
    errors.add({ message: 'a', stack: null, context: ctx }, NOW);
    errors.add({ message: 'b', stack: null, context: ctx }, NOW + 1);
    const groups = service.errors();
    expect(groups.map((g) => g.message)).toEqual(['b', 'a']);
    expect(service.deleteError(groups[0]?.id ?? 0)).toBe(true);
    expect(service.clearErrors()).toBe(1);
    expect(service.errors()).toEqual([]);
  });
});
