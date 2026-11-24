import { CLOSE, LIMITS, PROTOCOL_VERSION, type ServerMsg } from '@hoorah/protocol';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Logger } from './log';
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
  all<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }>[] {
    return this.sent.filter((m) => m.t === t) as Extract<ServerMsg, { t: T }>[];
  }
}

const quiet: Logger = { debug() {}, info() {}, warn() {}, error() {} };
let clock = 1_000_000;
let tokenSeq = 0;

function makeManager() {
  return new RoomManager({
    now: () => clock,
    random: Math.random,
    token: () => `token-${String(++tokenSeq).padStart(12, '0')}`,
    maxPlayers: 2,
    roomsPerIpPerMinute: 10,
    log: quiet,
  });
}

function openScreen(m: RoomManager) {
  const screen = new FakeConn('9.9.9.9');
  m.handleMessage(screen, { t: 'hello', role: 'screen', v: PROTOCOL_VERSION });
  const w = screen.last('welcome');
  if (w?.role !== 'screen') throw new Error('no screen welcome');
  return { screen, code: w.code, token: w.token, key: w.mirrorKey };
}

function mirror(m: RoomManager, code: string, key: string, ip = '2.2.2.2') {
  const c = new FakeConn(ip);
  m.handleMessage(c, { t: 'hello', role: 'mirror', v: PROTOCOL_VERSION, code, key });
  return c;
}

function join(m: RoomManager, code: string, name = 'Rina') {
  const c = new FakeConn('3.3.3.3');
  m.handleMessage(c, { t: 'hello', role: 'controller', v: PROTOCOL_VERSION, code, name });
  return c;
}

beforeEach(() => {
  clock = 1_000_000;
});

describe('far-away main screens (long-distance play)', () => {
  it('gives only the main screen the link secret', () => {
    const m = makeManager();
    const { screen, code, key } = openScreen(m);
    expect(key).toMatch(/^[2-9A-Z]{8}$/);
    expect(screen.last('welcome')).toMatchObject({ mirrors: 0 });
    const phone = join(m, code);
    expect(JSON.stringify(phone.sent)).not.toContain(key);
  });

  it('lets a mirror watch with the right secret and tells the main screen', () => {
    const m = makeManager();
    const { screen, code, key } = openScreen(m);
    join(m, code, 'Rina');
    const b = mirror(m, code, key);
    const w = b.last('welcome');
    expect(w).toMatchObject({ role: 'mirror', code, maxPlayers: 2, screenOnline: true });
    expect(w?.role === 'mirror' && w.players.map((p) => p.name)).toEqual(['Rina']);
    expect(JSON.stringify(b.sent)).not.toContain(key);
    expect(screen.last('mirrors')).toEqual({ t: 'mirrors', count: 1, key, ids: [1] });
  });

  it('never counts a mirror as a player or a seat', () => {
    const m = makeManager();
    const { screen, code, key } = openScreen(m);
    mirror(m, code, key);
    mirror(m, code, key, '2.2.2.3');
    expect(m.playerCount).toBe(0);
    const a = join(m, code, 'Rina');
    const b = join(m, code, 'Budi');
    expect(a.last('welcome')).toMatchObject({ id: 1 });
    expect(b.last('welcome')).toMatchObject({ id: 2 });
    expect(screen.last('players')!.players).toHaveLength(2);
  });

  it('refuses a wrong secret or room and counts it toward the wrong-code limit', () => {
    const m = makeManager();
    const { code, key } = openScreen(m);
    const wrong = key === 'AAAAAAAA' ? 'BBBBBBBB' : 'AAAAAAAA';
    const bad = mirror(m, code, wrong);
    expect(bad.last('error')).toEqual({ t: 'error', code: 'room_not_found', fatal: true });
    expect(bad.closedWith).toBe(CLOSE.roomClosed);
    const other = mirror(m, code === '111111' ? '222222' : '111111', key);
    expect(other.last('error')?.code).toBe('room_not_found');
    for (let i = 0; i < 18; i++) mirror(m, code, wrong);
    // 20 wrong tries this minute: even the right pair (or a phone) waits now.
    expect(mirror(m, code, key).last('error')?.code).toBe('rate_limited');
    expect(join(m, code).last('welcome')).toBeDefined();
    const phoneSameIp = new FakeConn('2.2.2.2');
    m.handleMessage(phoneSameIp, { t: 'hello', role: 'controller', v: PROTOCOL_VERSION, code, name: 'X' });
    expect(phoneSameIp.last('error')?.code).toBe('rate_limited');
    clock += 61_000;
    m.tick();
    expect(mirror(m, code, key).last('welcome')).toBeDefined();
  });

  it('allows at most three mirrors at once', () => {
    const m = makeManager();
    const { code, key } = openScreen(m);
    for (let i = 0; i < LIMITS.maxMirrors; i++) expect(mirror(m, code, key).last('welcome')).toBeDefined();
    const extra = mirror(m, code, key);
    expect(extra.last('error')).toEqual({ t: 'error', code: 'room_full', fatal: true });
  });

  it('relays the main screen to mirrors only, and mirrors can never control anything', () => {
    const m = makeManager();
    const { screen, code, key } = openScreen(m);
    const phone = join(m, code, 'Rina');
    const b = mirror(m, code, key);
    m.handleMessage(screen, { t: 'relay', ch: 'p', to: 'mirror', data: { s: 1 } });
    expect(b.last('relay')).toEqual({ t: 'relay', ch: 'p', from: 0, data: { s: 1 } });
    expect(phone.all('relay')).toHaveLength(0);
    // A relay to 'all' reaches the phones, not the mirrors.
    m.handleMessage(screen, { t: 'relay', ch: 'p', to: 'all', data: { s: 2 } });
    expect(phone.last('relay')?.data).toEqual({ s: 2 });
    expect(b.all('relay')).toHaveLength(1);
    // A phone cannot reach the mirrors.
    m.handleMessage(phone, { t: 'relay', ch: 'p', to: 'mirror', data: { s: 3 } });
    expect(b.all('relay')).toHaveLength(1);

    screen.sent = [];
    phone.sent = [];
    for (const msg of [
      { t: 'relay', ch: 'p', to: 'screen', data: { k: 'nav', key: 'ok' } },
      { t: 'relay', ch: 'p', to: 'all', data: {} },
      { t: 'kick', id: 1 },
      { t: 'host', id: 1 },
      { t: 'trial' },
      { t: 'pass', code: 'ABCD2345' },
      { t: 'status', page: 'home', gameId: null },
      { t: 'mirrorsOff' },
      { t: 'leave' },
    ] as const) {
      b.sent = [];
      m.handleMessage(b, msg);
      expect(b.last('error')).toEqual({ t: 'error', code: 'not_allowed', fatal: false });
    }
    expect(screen.sent).toEqual([]);
    expect(phone.sent).toEqual([]);
    expect(m.playerCount).toBe(1);
    // Pings still answer, for the clock.
    m.handleMessage(b, { t: 'ping', id: 7, ct: 5 });
    expect(b.last('pong')).toMatchObject({ id: 7, ct: 5 });
  });

  it('keeps mirrors up to date with players, seats and whether the main screen is there', () => {
    const m = makeManager();
    const { screen, code, key, token } = openScreen(m);
    const b = mirror(m, code, key);
    join(m, code, 'Rina');
    expect(b.last('players')!.players.map((p) => p.name)).toEqual(['Rina']);
    m.handleClose(screen);
    expect(b.last('screen')).toEqual({ t: 'screen', online: false });
    const again = new FakeConn('9.9.9.9');
    m.handleMessage(again, { t: 'hello', role: 'screen', v: PROTOCOL_VERSION, resume: { code, token } });
    expect(b.last('screen')).toEqual({ t: 'screen', online: true });
    // The resumed main screen hears how many mirrors watch, to send them everything again.
    expect(again.last('welcome')).toMatchObject({ role: 'screen', mirrorKey: key, mirrors: 1 });
  });

  it('counts a mirror that drops off', () => {
    const m = makeManager();
    const { screen, code, key } = openScreen(m);
    const b = mirror(m, code, key);
    const c = mirror(m, code, key);
    expect(screen.last('mirrors')?.count).toBe(2);
    m.handleClose(b);
    expect(screen.last('mirrors')?.count).toBe(1);
    m.handleClose(c);
    expect(screen.last('mirrors')).toEqual({ t: 'mirrors', count: 0, key, ids: [] });
  });

  it('stops long-distance play on the main screen command: mirrors go, the old link dies', () => {
    const m = makeManager();
    const { screen, code, key } = openScreen(m);
    const phone = join(m, code, 'Rina');
    const b = mirror(m, code, key);
    m.handleMessage(phone, { t: 'mirrorsOff' });
    expect(phone.last('error')?.code).toBe('not_allowed');
    expect(b.closedWith).toBeNull();
    m.handleMessage(screen, { t: 'mirrorsOff' });
    expect(b.last('error')).toEqual({ t: 'error', code: 'mirror_stopped', fatal: true });
    expect(b.closedWith).toBe(CLOSE.roomClosed);
    const now = screen.last('mirrors')!;
    expect(now.count).toBe(0);
    expect(now.key).not.toBe(key);
    expect(mirror(m, code, key).last('error')?.code).toBe('room_not_found');
    expect(mirror(m, code, now.key).last('welcome')).toBeDefined();
    // The players stay.
    expect(phone.closedWith).toBeNull();
  });

  it('closes the mirrors with the room', () => {
    const m = makeManager();
    const { screen, code, key } = openScreen(m);
    const b = mirror(m, code, key);
    m.handleClose(screen);
    clock += LIMITS.screenHoldMs + 1000;
    m.tick();
    expect(b.last('error')).toEqual({ t: 'error', code: 'room_closed', fatal: true });
    expect(b.closedWith).toBe(CLOSE.roomClosed);
    expect(m.connectionCount).toBe(0);
  });

  it('gives every mirror connection its own id and tells the main screen', () => {
    const m = makeManager();
    const { screen, code, key, token } = openScreen(m);
    const b = mirror(m, code, key);
    const c = mirror(m, code, key);
    expect(screen.last('mirrors')).toEqual({ t: 'mirrors', count: 2, key, ids: [1, 2] });
    m.handleClose(b);
    expect(screen.last('mirrors')?.ids).toEqual([2]);
    // A reconnecting mirror is a new connection with a new id.
    mirror(m, code, key);
    expect(screen.last('mirrors')?.ids).toEqual([2, 3]);
    m.handleClose(screen);
    const again = new FakeConn('9.9.9.9');
    m.handleMessage(again, { t: 'hello', role: 'screen', v: PROTOCOL_VERSION, resume: { code, token } });
    expect(again.last('welcome')).toMatchObject({ mirrors: 2, mirrorIds: [2, 3] });
    expect(c.closedWith).toBeNull();
  });

  it('carries direct-link offers to one mirror and its answer back, with the server naming the sender', () => {
    const m = makeManager();
    const { screen, code, key } = openScreen(m);
    const phone = join(m, code, 'Rina');
    const b = mirror(m, code, key);
    const c = mirror(m, code, key);
    const offer = { k: 'offer', gen: 1, sdp: 'v=0 offer' } as const;
    m.handleMessage(screen, { t: 'mirrorRtc', to: 2, sig: offer });
    expect(c.last('mirrorRtc')).toEqual({ t: 'mirrorRtc', from: 0, sig: offer });
    expect(b.all('mirrorRtc')).toHaveLength(0);
    expect(phone.all('mirrorRtc')).toHaveLength(0);
    const answer = { k: 'answer', gen: 1, sdp: 'v=0 answer' } as const;
    // A mirror never names the receiver: the server sends it to the main screen with its id.
    m.handleMessage(c, { t: 'mirrorRtc', sig: answer });
    expect(screen.last('mirrorRtc')).toEqual({ t: 'mirrorRtc', from: 2, sig: answer });
    m.handleMessage(b, { t: 'mirrorRtc', sig: { k: 'hangup', gen: 4 } });
    expect(screen.last('mirrorRtc')).toEqual({ t: 'mirrorRtc', from: 1, sig: { k: 'hangup', gen: 4 } });
    expect(phone.all('mirrorRtc')).toHaveLength(0);
  });

  it('keeps direct-link signalling to its direction and roles', () => {
    const m = makeManager();
    const { screen, code, key } = openScreen(m);
    const phone = join(m, code, 'Rina');
    const b = mirror(m, code, key);
    const c = mirror(m, code, key);
    screen.sent = [];
    // A mirror cannot offer, nor address another mirror.
    m.handleMessage(b, { t: 'mirrorRtc', sig: { k: 'offer', gen: 1, sdp: 'x' } });
    expect(screen.all('mirrorRtc')).toHaveLength(0);
    m.handleMessage(b, { t: 'mirrorRtc', to: 2, sig: { k: 'hangup', gen: 1 } });
    expect(b.last('error')).toEqual({ t: 'error', code: 'not_allowed', fatal: false });
    expect(c.all('mirrorRtc')).toHaveLength(0);
    // The main screen cannot answer, and must name a mirror that exists.
    m.handleMessage(screen, { t: 'mirrorRtc', to: 1, sig: { k: 'answer', gen: 1, sdp: 'x' } });
    m.handleMessage(screen, { t: 'mirrorRtc', to: 9, sig: { k: 'offer', gen: 1, sdp: 'x' } });
    m.handleMessage(screen, { t: 'mirrorRtc', sig: { k: 'offer', gen: 1, sdp: 'x' } });
    expect(screen.last('error')).toEqual({ t: 'error', code: 'not_allowed', fatal: false });
    expect(b.all('mirrorRtc')).toHaveLength(0);
    expect(c.all('mirrorRtc')).toHaveLength(0);
    // Phones never take part.
    m.handleMessage(phone, { t: 'mirrorRtc', to: 1, sig: { k: 'offer', gen: 1, sdp: 'x' } });
    expect(phone.last('error')).toEqual({ t: 'error', code: 'not_allowed', fatal: false });
    expect(b.all('mirrorRtc')).toHaveLength(0);
    // Without its main screen, a mirror's answer goes nowhere.
    m.handleClose(screen);
    m.handleMessage(b, { t: 'mirrorRtc', sig: { k: 'answer', gen: 1, sdp: 'x' } });
    expect(screen.all('mirrorRtc')).toHaveLength(0);
  });

  it('limits direct-link signals per mirror and direction', () => {
    const m = makeManager();
    const { screen, code, key } = openScreen(m);
    const b = mirror(m, code, key);
    for (let i = 0; i < 20; i++)
      m.handleMessage(screen, { t: 'mirrorRtc', to: 1, sig: { k: 'hangup', gen: i } });
    for (let i = 0; i < 20; i++) m.handleMessage(b, { t: 'mirrorRtc', sig: { k: 'hangup', gen: i } });
    expect(b.all('mirrorRtc')).toHaveLength(12);
    expect(screen.all('mirrorRtc')).toHaveLength(12);
    clock += 10_000;
    m.handleMessage(screen, { t: 'mirrorRtc', to: 1, sig: { k: 'hangup', gen: 99 } });
    expect(b.last('mirrorRtc')?.sig).toEqual({ k: 'hangup', gen: 99 });
  });

  it('leaves out of a relay the mirrors the main screen reached directly', () => {
    const m = makeManager();
    const { screen, code, key } = openScreen(m);
    const b = mirror(m, code, key);
    const c = mirror(m, code, key);
    m.handleMessage(screen, { t: 'relay', ch: 'p', to: 'mirror', data: { n: 1 }, skip: [1] });
    expect(b.all('relay')).toHaveLength(0);
    expect(c.last('relay')).toEqual({ t: 'relay', ch: 'p', from: 0, data: { n: 1 } });
    m.handleMessage(screen, { t: 'relay', ch: 'p', to: 'mirror', data: { n: 2 }, skip: [1, 2] });
    expect(c.all('relay')).toHaveLength(1);
  });

  it('keeps the link secret across a restart, without the mirrors', () => {
    const m = makeManager();
    const { code, key, token } = openScreen(m);
    mirror(m, code, key);
    const snaps = m.snapshot();
    expect(snaps[0]).toMatchObject({ mirrorKey: key });
    const m2 = makeManager();
    m2.restore(JSON.parse(JSON.stringify(snaps)));
    const s = new FakeConn('9.9.9.9');
    m2.handleMessage(s, { t: 'hello', role: 'screen', v: PROTOCOL_VERSION, resume: { code, token } });
    expect(s.last('welcome')).toMatchObject({ mirrorKey: key, mirrors: 0 });
    expect(mirror(m2, code, key).last('welcome')).toBeDefined();
    // An old snapshot without a secret gets a fresh one.
    const m3 = makeManager();
    const { mirrorKey: _dropped, ...old } = snaps[0]!;
    m3.restore([old]);
    const s3 = new FakeConn('9.9.9.9');
    m3.handleMessage(s3, { t: 'hello', role: 'screen', v: PROTOCOL_VERSION, resume: { code, token } });
    const w3 = s3.last('welcome');
    expect(w3?.role === 'screen' && w3.mirrorKey).toMatch(/^[2-9A-Z]{8}$/);
  });
});
