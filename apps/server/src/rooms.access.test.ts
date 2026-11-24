import {
  DEFAULT_CONFIG,
  PASS_MOVE_GAP_MS,
  type PassKind,
  PROTOCOL_VERSION,
  type ServerMsg,
} from '@hoorah/protocol';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDb } from './db';
import type { Logger } from './log';
import { PassRepository } from './passes';
import { type Conn, RoomManager } from './rooms';
import { TrialRepository } from './trials';

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
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const SCREEN_A = 'layar-ruang-tamu-0001';
const SCREEN_B = 'layar-kamar-depan-0002';
const SCREEN_C = 'layar-rumah-nenek-0003';
let clock = 1_000_000_000;
let tokenSeq = 0;

function setup(config = DEFAULT_CONFIG) {
  const db = openDb(':memory:');
  const repo = new PassRepository(db);
  const trials = new TrialRepository(db);
  const make = () =>
    new RoomManager({
      now: () => clock,
      random: Math.random,
      token: () => `token-${String(++tokenSeq).padStart(12, '0')}`,
      maxPlayers: 2,
      roomsPerIpPerMinute: 50,
      log: quiet,
      passes: repo,
      trials,
      config,
    });
  const m = make();
  const addPass = (
    code: string,
    kind: PassKind,
    o: { maxPlayers?: number; days?: number; hours?: number; maxUses?: number | null } = {},
  ) => {
    const id = repo.insert({
      code,
      label: `Uji ${code}`,
      kind,
      durationMs: kind === 'shared' ? null : (o.days ?? 30) * DAY,
      maxUses: o.maxUses ?? null,
      maxPlayers: o.maxPlayers ?? 16,
      maxRooms: null,
      expiresAt: clock + (o.hours ?? 24) * HOUR,
      createdBy: null,
      now: clock,
    });
    if (id === null) throw new Error('duplicate pass');
    return id;
  };
  return { repo, trials, m, make, addPass };
}

function openScreen(m: RoomManager, screen?: string, ip?: string) {
  const conn = new FakeConn(ip);
  m.handleMessage(conn, { t: 'hello', role: 'screen', v: PROTOCOL_VERSION, ...(screen ? { screen } : {}) });
  const w = conn.last('welcome');
  if (w?.role !== 'screen') throw new Error('no screen welcome');
  return { screen: conn, code: w.code, welcome: w };
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

describe('room access', () => {
  it('starts free with two seats and tells the screen and phones the settings', () => {
    const { m } = setup();
    const { welcome, code } = openScreen(m, SCREEN_A);
    expect(welcome).toMatchObject({
      maxPlayers: 2,
      pass: null,
      access: { kind: 'free', until: null, trialUsed: false },
      config: DEFAULT_CONFIG,
    });
    expect(join(m, code, 'A').last('welcome')).toMatchObject({
      access: { kind: 'free' },
      config: DEFAULT_CONFIG,
    });
  });

  it('opens every room with the owner switch and broadcasts the new settings', () => {
    const { m } = setup();
    const { screen, code } = openScreen(m, SCREEN_A);
    const a = join(m, code, 'A');
    m.setConfig({ ...DEFAULT_CONFIG, openAll: true });
    expect(screen.last('config')).toEqual({ t: 'config', config: { ...DEFAULT_CONFIG, openAll: true } });
    expect(a.last('config')?.config.openAll).toBe(true);
    expect(screen.last('room')).toMatchObject({ maxPlayers: 16, access: { kind: 'open', until: null } });
    expect(m.appConfig.openAll).toBe(true);
    // Switching it off again: the room is free, nobody already in is sent away.
    for (const n of ['B', 'C']) join(m, code, n);
    m.setConfig(DEFAULT_CONFIG);
    expect(screen.last('room')).toMatchObject({ maxPlayers: 3, access: { kind: 'free' } });
  });

  it('prefers open over pass over trial over free', () => {
    const { m, addPass } = setup();
    addPass('PESTA8', 'shared', { maxPlayers: 8 });
    const { screen, code } = openScreen(m, SCREEN_A);
    m.handleMessage(screen, { t: 'trial' });
    expect(screen.last('room')).toMatchObject({
      maxPlayers: 16,
      access: { kind: 'trial', until: clock + HOUR },
    });
    // A shared code can still be entered during the trial (only the trial needs a free room).
    m.handleMessage(screen, { t: 'pass', code: 'PESTA8' });
    expect(screen.last('room')).toMatchObject({
      maxPlayers: 8,
      pass: { expiresAt: clock + 24 * HOUR },
      access: { kind: 'pass', until: clock + 24 * HOUR, trialUsed: true },
    });
    m.setConfig({ ...DEFAULT_CONFIG, openAll: true });
    expect(screen.last('room')).toMatchObject({ maxPlayers: 16, access: { kind: 'open' } });
    expect(join(m, code, 'A').last('welcome')).toMatchObject({ access: { kind: 'open' } });
  });
});

describe('single-use Pass codes', () => {
  it('binds to the screen on first use and follows it into a new room', () => {
    const { m, repo, addPass } = setup();
    const id = addPass('BELI0001', 'single', { days: 30, maxPlayers: 12, hours: 2 });
    const r1 = openScreen(m, SCREEN_A);
    const a = join(m, r1.code, 'A');
    m.handleMessage(a, { t: 'pass', code: 'BELI0001' });
    expect(a.last('pass')).toEqual({ t: 'pass', ok: true, pass: { expiresAt: clock + 30 * DAY } });
    expect(r1.screen.last('room')).toMatchObject({
      maxPlayers: 12,
      access: { kind: 'pass', until: clock + 30 * DAY },
    });
    expect(repo.row(id)).toMatchObject({ uses: 1, kind: 'single', durationMs: 30 * DAY });
    // Days later (past the code's first-use deadline) the same screen opens a new room: still a Pass.
    clock += 3 * DAY;
    const r2 = openScreen(m, SCREEN_A);
    expect(r2.welcome).toMatchObject({
      maxPlayers: 12,
      access: { kind: 'pass' },
      pass: { expiresAt: 1_000_000_000 + 30 * DAY },
    });
    expect(m.passLiveCounts().get(id)).toBe(2);
  });

  it('cannot be first used after its end time', () => {
    const { m, addPass } = setup();
    addPass('TELAT', 'single', { hours: 1 });
    clock += 2 * HOUR;
    const { screen } = openScreen(m, SCREEN_A);
    m.handleMessage(screen, { t: 'pass', code: 'TELAT' });
    expect(screen.last('pass')).toEqual({ t: 'pass', ok: false, reason: 'expired' });
  });

  it('moves to another screen at most once per gap, and the old screen loses it', () => {
    const { m, addPass } = setup();
    addPass('PINDAH', 'single');
    const a = openScreen(m, SCREEN_A);
    m.handleMessage(a.screen, { t: 'pass', code: 'PINDAH' });
    const b = openScreen(m, SCREEN_B);
    m.handleMessage(b.screen, { t: 'pass', code: 'PINDAH' });
    expect(b.screen.last('pass')).toEqual({ t: 'pass', ok: false, reason: 'busy' });
    clock += PASS_MOVE_GAP_MS;
    m.handleMessage(b.screen, { t: 'pass', code: 'PINDAH' });
    expect(b.screen.last('pass')?.ok).toBe(true);
    expect(b.screen.last('room')).toMatchObject({ access: { kind: 'pass' } });
    expect(a.screen.last('room')).toMatchObject({ maxPlayers: 2, access: { kind: 'free' }, pass: null });
    // Straight back: too soon after the move.
    m.handleMessage(a.screen, { t: 'pass', code: 'PINDAH' });
    expect(a.screen.last('pass')).toEqual({ t: 'pass', ok: false, reason: 'busy' });
  });

  it('is never moved by a code a phone remembers', () => {
    const { m, addPass } = setup();
    addPass('INGAT', 'single');
    const a = openScreen(m, SCREEN_A);
    m.handleMessage(a.screen, { t: 'pass', code: 'INGAT' });
    clock += PASS_MOVE_GAP_MS + 1;
    const b = openScreen(m, SCREEN_B);
    const phone = join(m, b.code, 'A', 'INGAT');
    expect(phone.last('welcome')).toMatchObject({ access: { kind: 'free' } });
    expect(phone.last('pass')).toEqual({ t: 'pass', ok: false, reason: 'busy' });
    expect(a.screen.last('room')?.access.kind).toBe('pass');
  });

  it('opens only the room when the screen sends no id', () => {
    const { m, repo, addPass } = setup();
    const id = addPass('LAMA01', 'single', { days: 7 });
    const { screen } = openScreen(m);
    m.handleMessage(screen, { t: 'pass', code: 'LAMA01' });
    expect(screen.last('room')).toMatchObject({ access: { kind: 'pass', until: clock + 7 * DAY } });
    expect(repo.row(id)).toMatchObject({ uses: 0 });
    expect(m.adminRooms()[0]?.pass).toMatchObject({ id, code: 'LAMA01' });
  });

  it('ends with its run and drops out when revoked', () => {
    const { m, repo, addPass } = setup();
    const id = addPass('HABIS', 'single', { days: 1 });
    const { screen } = openScreen(m, SCREEN_A);
    m.handleMessage(screen, { t: 'pass', code: 'HABIS' });
    repo.update(id, { revokedAt: clock });
    m.refreshPass(id);
    expect(screen.last('room')).toMatchObject({ access: { kind: 'free' } });
    repo.update(id, { revokedAt: null });
    m.refreshPass(id);
    expect(screen.last('room')).toMatchObject({ access: { kind: 'pass' } });
    clock += DAY;
    m.handleMessage(screen, { t: 'ping', id: 1, ct: 0 });
    m.tick();
    expect(screen.last('room')).toMatchObject({ access: { kind: 'free' }, pass: null });
  });
});

describe('promo Pass codes', () => {
  it('gives each screen its own run until the uses run out', () => {
    const { m, repo, addPass } = setup();
    const id = addPass('PROMO', 'promo', { days: 3, maxUses: 2 });
    const a = openScreen(m, SCREEN_A);
    m.handleMessage(a.screen, { t: 'pass', code: 'PROMO' });
    expect(a.screen.last('pass')).toEqual({ t: 'pass', ok: true, pass: { expiresAt: clock + 3 * DAY } });
    // Entering it again on the same screen does not use another one.
    m.handleMessage(a.screen, { t: 'pass', code: 'PROMO' });
    expect(repo.row(id)?.uses).toBe(1);
    clock += HOUR;
    const b = openScreen(m, SCREEN_B);
    m.handleMessage(b.screen, { t: 'pass', code: 'PROMO' });
    expect(b.screen.last('pass')).toEqual({ t: 'pass', ok: true, pass: { expiresAt: clock + 3 * DAY } });
    const c = openScreen(m, SCREEN_C);
    m.handleMessage(c.screen, { t: 'pass', code: 'PROMO' });
    expect(c.screen.last('pass')).toEqual({ t: 'pass', ok: false, reason: 'used' });
    expect(repo.row(id)?.uses).toBe(2);
  });

  it('keeps running on its screens after the code can no longer be redeemed', () => {
    const { m, addPass } = setup();
    addPass('SINGKAT', 'promo', { days: 3, hours: 1 });
    const a = openScreen(m, SCREEN_A);
    m.handleMessage(a.screen, { t: 'pass', code: 'SINGKAT' });
    clock += 2 * HOUR;
    m.handleMessage(a.screen, { t: 'pass', code: 'SINGKAT' });
    expect(a.screen.last('pass')?.ok).toBe(true);
    const b = openScreen(m, SCREEN_B);
    m.handleMessage(b.screen, { t: 'pass', code: 'SINGKAT' });
    expect(b.screen.last('pass')).toEqual({ t: 'pass', ok: false, reason: 'expired' });
  });

  it('turns a full room away with pass_expired when a remembered promo is used up', () => {
    const { m, addPass } = setup();
    addPass('SEKALI', 'promo', { maxUses: 1 });
    const a = openScreen(m, SCREEN_A);
    m.handleMessage(a.screen, { t: 'pass', code: 'SEKALI' });
    const b = openScreen(m, SCREEN_B);
    join(m, b.code, 'A');
    join(m, b.code, 'B');
    expect(join(m, b.code, 'C', 'SEKALI').last('error')).toEqual({
      t: 'error',
      code: 'pass_expired',
      fatal: true,
    });
  });
});

describe('free trial', () => {
  it('starts once per screen from any phone in the room, then ends', () => {
    const { m } = setup();
    const { screen, code } = openScreen(m, SCREEN_A);
    const a = join(m, code, 'A');
    m.handleMessage(a, { t: 'trial' });
    expect(a.last('trial')).toBeUndefined();
    expect(screen.last('room')).toEqual({
      t: 'room',
      maxPlayers: 16,
      pass: null,
      access: { kind: 'trial', until: clock + HOUR, trialUsed: true },
    });
    m.handleMessage(a, { t: 'trial' });
    expect(a.last('trial')).toEqual({ t: 'trial', ok: false, reason: 'not_free' });
    for (const n of ['B', 'C']) join(m, code, n);
    clock += HOUR;
    // Keep the room from closing as idle meanwhile.
    m.handleMessage(screen, { t: 'ping', id: 1, ct: 0 });
    m.tick();
    expect(screen.last('room')).toMatchObject({ maxPlayers: 3, access: { kind: 'free', trialUsed: true } });
    m.handleMessage(screen, { t: 'trial' });
    expect(screen.last('trial')).toEqual({ t: 'trial', ok: false, reason: 'used' });
    // A new room on the same screen knows the trial is used.
    expect(openScreen(m, SCREEN_A).welcome.access).toEqual({ kind: 'free', until: null, trialUsed: true });
  });

  it('uses the trial length from the settings', () => {
    const { m } = setup({ ...DEFAULT_CONFIG, trialMinutes: 90 });
    const { screen } = openScreen(m, SCREEN_A);
    m.handleMessage(screen, { t: 'trial' });
    expect(screen.last('room')?.access.until).toBe(clock + 90 * MIN);
  });

  it('needs a screen id and a free room', () => {
    const { m } = setup({ ...DEFAULT_CONFIG, openAll: true });
    const open = openScreen(m, SCREEN_A);
    m.handleMessage(open.screen, { t: 'trial' });
    expect(open.screen.last('trial')).toEqual({ t: 'trial', ok: false, reason: 'not_free' });
    m.setConfig(DEFAULT_CONFIG);
    const old = openScreen(m);
    m.handleMessage(old.screen, { t: 'trial' });
    expect(old.screen.last('trial')).toEqual({ t: 'trial', ok: false, reason: 'used' });
  });

  it('lets a household start a few trials on one network, not endless ones', () => {
    const { m } = setup();
    const ip = '36.70.1.2';
    for (let i = 0; i < 3; i++) {
      const { screen } = openScreen(m, `layar-rumah-${String(i).padStart(12, '0')}`, ip);
      m.handleMessage(screen, { t: 'trial' });
      expect(screen.last('trial')).toBeUndefined();
    }
    const fourth = openScreen(m, 'layar-rumah-000000000099', ip);
    m.handleMessage(fourth.screen, { t: 'trial' });
    expect(fourth.screen.last('trial')).toEqual({ t: 'trial', ok: false, reason: 'used' });
    // A month later the network may start one again.
    clock += 31 * DAY;
    const later = openScreen(m, 'layar-rumah-000000000100', ip);
    m.handleMessage(later.screen, { t: 'trial' });
    expect(later.screen.last('trial')).toBeUndefined();
  });

  it('slows down trial requests from one address', () => {
    const { m } = setup();
    const { screen } = openScreen(m);
    for (let i = 0; i < 10; i++) m.handleMessage(screen, { t: 'trial' });
    expect(screen.last('trial')?.reason).toBe('used');
    m.handleMessage(screen, { t: 'trial' });
    expect(screen.last('trial')?.reason).toBe('rate_limited');
  });
});

describe('screen id over restarts', () => {
  it('keeps the screen id and a room-only code in the snapshot', () => {
    const { m, make, addPass } = setup();
    addPass('LOKAL', 'promo', { days: 2 });
    const withId = openScreen(m, SCREEN_A);
    m.handleMessage(withId.screen, { t: 'trial' });
    const noId = openScreen(m);
    m.handleMessage(noId.screen, { t: 'pass', code: 'LOKAL' });
    const snap = m.snapshot();
    expect(snap.find((s) => s.code === withId.code)?.screenId).toBe(SCREEN_A);

    const again = make();
    again.restore(snap);
    const rooms = new Map(again.adminRooms().map((r) => [r.code, r]));
    expect(rooms.get(withId.code)?.maxPlayers).toBe(16);
    expect(rooms.get(noId.code)?.pass).toMatchObject({ code: 'LOKAL', expiresAt: clock + 2 * DAY });

    const resumed = new FakeConn();
    const token = snap.find((s) => s.code === withId.code)?.screenToken ?? '';
    again.handleMessage(resumed, {
      t: 'hello',
      role: 'screen',
      v: PROTOCOL_VERSION,
      resume: { code: withId.code, token },
      screen: SCREEN_A,
    });
    expect(resumed.last('welcome')).toMatchObject({
      resumed: true,
      access: { kind: 'trial', trialUsed: true },
    });
  });

  it('adopts the screen id when a room made without one is resumed with it', () => {
    const { m, addPass } = setup();
    addPass('ADOPSI', 'single');
    const first = openScreen(m, SCREEN_A);
    m.handleMessage(first.screen, { t: 'pass', code: 'ADOPSI' });
    const old = openScreen(m);
    const conn = new FakeConn();
    const token = m.snapshot().find((s) => s.code === old.code)?.screenToken ?? '';
    m.handleMessage(conn, {
      t: 'hello',
      role: 'screen',
      v: PROTOCOL_VERSION,
      resume: { code: old.code, token },
      screen: SCREEN_A,
    });
    expect(conn.last('welcome')).toMatchObject({ access: { kind: 'pass' }, maxPlayers: 16 });
  });
});
