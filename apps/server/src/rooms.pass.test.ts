import { PROTOCOL_VERSION, type ServerMsg } from '@hoorah/protocol';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDb } from './db';
import type { Logger } from './log';
import { PassRepository } from './passes';
import { type Conn, RoomManager } from './rooms';

class FakeConn implements Conn {
  sent: ServerMsg[] = [];
  closedWith: number | null = null;
  constructor(readonly ip = '1.1.1.1') {}
  send(msg: ServerMsg) {
    this.sent.push(msg);
  }
  sendBinary() {}
  close(code: number) {
    this.closedWith = code;
  }
  last<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }> | undefined {
    return [...this.sent].reverse().find((m) => m.t === t) as Extract<ServerMsg, { t: T }> | undefined;
  }
}

const quiet: Logger = { debug() {}, info() {}, warn() {}, error() {} };
const HOUR = 3_600_000;
let clock = 1_000_000_000;
let tokenSeq = 0;

function setup() {
  const repo = new PassRepository(openDb(':memory:'));
  const m = new RoomManager({
    now: () => clock,
    random: Math.random,
    token: () => `token-${String(++tokenSeq).padStart(12, '0')}`,
    maxPlayers: 2,
    roomsPerIpPerMinute: 50,
    log: quiet,
    passes: repo,
  });
  const addPass = (
    code: string,
    o: { maxPlayers?: number; maxRooms?: number | null; hours?: number } = {},
  ) => {
    const id = repo.insert({
      code,
      label: `Uji ${code}`,
      maxPlayers: o.maxPlayers ?? 16,
      maxRooms: o.maxRooms ?? null,
      expiresAt: clock + (o.hours ?? 24) * HOUR,
      createdBy: null,
      now: clock,
    });
    if (id === null) throw new Error('duplicate pass');
    return id;
  };
  return { repo, m, addPass };
}

function openScreen(m: RoomManager) {
  const screen = new FakeConn();
  m.handleMessage(screen, { t: 'hello', role: 'screen', v: PROTOCOL_VERSION });
  const w = screen.last('welcome');
  if (w?.role !== 'screen') throw new Error('no screen welcome');
  return { screen, code: w.code };
}

function join(m: RoomManager, code: string, name: string, pass?: string, ip?: string) {
  const c = new FakeConn(ip);
  m.handleMessage(c, {
    t: 'hello',
    role: 'controller',
    v: PROTOCOL_VERSION,
    code,
    name,
    fruit: 'semangka',
    ...(pass ? { pass } : {}),
  });
  return c;
}

beforeEach(() => {
  clock = 1_000_000_000;
});

describe('Hoorah Pass in rooms', () => {
  it('lets a third phone into a full room with a valid code and tells everyone', () => {
    const { m, repo, addPass } = setup();
    const id = addPass('SABTU16');
    const { screen, code } = openScreen(m);
    const a = join(m, code, 'A');
    join(m, code, 'B');
    const c = join(m, code, 'C', 'SABTU16');
    expect(c.last('welcome')).toMatchObject({ maxPlayers: 16, pass: { expiresAt: clock + 24 * HOUR } });
    expect(screen.last('room')).toEqual({
      t: 'room',
      maxPlayers: 16,
      pass: { expiresAt: clock + 24 * HOUR },
    });
    expect(a.last('room')?.maxPlayers).toBe(16);
    expect(repo.row(id)).toMatchObject({ roomsUsed: 1, peakPlayers: 3 });
  });

  it('refuses a full room with a clear reason when the code does not work', () => {
    const { m, repo, addPass } = setup();
    addPass('LAMA', { hours: 1 });
    const revoked = addPass('CABUT');
    repo.update(revoked, { revokedAt: clock });
    const { code } = openScreen(m);
    join(m, code, 'A');
    join(m, code, 'B');
    expect(join(m, code, 'C', 'SALAH1').last('error')).toEqual({
      t: 'error',
      code: 'pass_invalid',
      fatal: true,
    });
    expect(join(m, code, 'C', 'CABUT').last('error')?.code).toBe('pass_invalid');
    clock += 2 * HOUR;
    expect(join(m, code, 'C', 'LAMA').last('error')?.code).toBe('pass_expired');
    expect(join(m, code, 'C').last('error')?.code).toBe('room_full');
  });

  it('applies a code typed inside the room and answers the sender', () => {
    const { m, addPass } = setup();
    addPass('PESTA', { maxPlayers: 8 });
    const { screen, code } = openScreen(m);
    const a = join(m, code, 'A');
    m.handleMessage(a, { t: 'pass', code: 'NGAWUR' });
    expect(a.last('pass')).toEqual({ t: 'pass', ok: false, reason: 'invalid' });
    m.handleMessage(a, { t: 'pass', code: 'PESTA' });
    expect(a.last('pass')).toEqual({ t: 'pass', ok: true, pass: { expiresAt: clock + 24 * HOUR } });
    expect(screen.last('room')?.maxPlayers).toBe(8);
  });

  it('joins a free room normally when a remembered code has ended, and says so', () => {
    const { m, addPass } = setup();
    addPass('KEMARIN', { hours: 1 });
    clock += 2 * HOUR;
    const { code } = openScreen(m);
    const a = join(m, code, 'A', 'KEMARIN');
    expect(a.last('welcome')).toMatchObject({ maxPlayers: 2, pass: null });
    expect(a.last('pass')).toEqual({ t: 'pass', ok: false, reason: 'expired' });
  });

  it('keeps a pass to its room limit', () => {
    const { m, addPass } = setup();
    addPass('SATU', { maxRooms: 1 });
    const r1 = openScreen(m);
    const r2 = openScreen(m);
    join(m, r1.code, 'A', 'SATU');
    const b = join(m, r2.code, 'B');
    m.handleMessage(b, { t: 'pass', code: 'SATU' });
    expect(b.last('pass')).toEqual({ t: 'pass', ok: false, reason: 'busy' });
  });

  it('ends with the pass time but lets everyone already in keep their seat', () => {
    const { m, addPass } = setup();
    // A quarter of an hour, so the room is not closed as idle meanwhile.
    addPass('SEJAM', { hours: 0.25 });
    const { screen, code } = openScreen(m);
    for (const n of ['A', 'B', 'C']) join(m, code, n, 'SEJAM');
    clock += HOUR / 4;
    m.tick();
    expect(screen.last('room')).toEqual({ t: 'room', maxPlayers: 3, pass: null });
    expect(join(m, code, 'D').last('error')?.code).toBe('room_full');
  });

  it('follows admin changes right away (extend, then revoke)', () => {
    const { m, repo, addPass } = setup();
    const id = addPass('UBAH', { hours: 1 });
    const { screen, code } = openScreen(m);
    join(m, code, 'A', 'UBAH');
    repo.update(id, { expiresAt: clock + 48 * HOUR });
    m.refreshPass(id);
    expect(screen.last('room')?.pass).toEqual({ expiresAt: clock + 48 * HOUR });
    expect(m.passLiveCounts().get(id)).toBe(1);
    repo.update(id, { revokedAt: clock });
    m.refreshPass(id);
    expect(screen.last('room')).toEqual({ t: 'room', maxPlayers: 2, pass: null });
    expect(m.passLiveCounts().get(id)).toBeUndefined();
  });

  it('keeps the pass over a snapshot, unless it was revoked meanwhile', () => {
    const { m, repo, addPass } = setup();
    const id = addPass('SIMPAN');
    const { code } = openScreen(m);
    join(m, code, 'A', 'SIMPAN');
    const snap = m.snapshot();
    expect(snap[0]?.passId).toBe(id);

    const again = new RoomManager({
      now: () => clock,
      random: Math.random,
      token: () => `token-${String(++tokenSeq).padStart(12, '0')}`,
      maxPlayers: 2,
      roomsPerIpPerMinute: 50,
      log: quiet,
      passes: repo,
    });
    again.restore(snap);
    expect(again.adminRooms()[0]).toMatchObject({ maxPlayers: 16, pass: { id, code: 'SIMPAN' } });

    repo.update(id, { revokedAt: clock });
    const third = new RoomManager({
      now: () => clock,
      random: Math.random,
      token: () => 'token-restored-0001',
      maxPlayers: 2,
      roomsPerIpPerMinute: 50,
      log: quiet,
      passes: repo,
    });
    third.restore(snap);
    expect(third.adminRooms()[0]).toMatchObject({ maxPlayers: 2, pass: null });
  });

  it('slows down guessing of pass codes from one address', () => {
    const { m, addPass } = setup();
    addPass('ASLI');
    const { code } = openScreen(m);
    const a = join(m, code, 'A', undefined, '9.9.9.9');
    for (let i = 0; i < 10; i++) m.handleMessage(a, { t: 'pass', code: `TEBAK${i}` });
    m.handleMessage(a, { t: 'pass', code: 'ASLI' });
    expect(a.last('pass')).toEqual({ t: 'pass', ok: false, reason: 'rate_limited' });
    clock += 61_000;
    m.handleMessage(a, { t: 'pass', code: 'ASLI' });
    expect(a.last('pass')?.ok).toBe(true);
  });

  it('shows the main screen page and game on the dashboard', () => {
    const { m } = setup();
    const { screen, code } = openScreen(m);
    join(m, code, 'A');
    // Only the main screen may say what it shows.
    const phone = join(m, code, 'B');
    m.handleMessage(phone, { t: 'status', page: 'home', gameId: null });
    expect(m.adminRooms()[0]).toMatchObject({ page: null });
    m.handleMessage(screen, { t: 'status', page: 'game', gameId: 'ludo' });
    expect(m.adminRooms()[0]).toMatchObject({ code, page: 'game', gameId: 'ludo', players: 2, connected: 2 });
  });
});
