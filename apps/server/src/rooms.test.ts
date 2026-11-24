import { encodeInput, LIMITS, PROTOCOL_VERSION, type ServerMsg } from '@hoorah/protocol';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Logger } from './log';
import { type Conn, RoomManager } from './rooms';

class FakeConn implements Conn {
  sent: ServerMsg[] = [];
  binary: Uint8Array[] = [];
  closedWith: number | null = null;
  constructor(readonly ip = '1.1.1.1') {}
  send(msg: ServerMsg) {
    this.sent.push(msg);
  }
  sendBinary(bytes: Uint8Array) {
    this.binary.push(bytes);
  }
  close(code: number) {
    this.closedWith = code;
  }
  last<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }> | undefined {
    return [...this.sent].reverse().find((m) => m.t === t) as Extract<ServerMsg, { t: T }> | undefined;
  }
}

const quiet: Logger = { debug() {}, info() {}, warn() {}, error() {} };
let clock = 1_000_000;
let tokenSeq = 0;

function makeManager(maxPlayers = 2) {
  return new RoomManager({
    now: () => clock,
    random: Math.random,
    token: () => `token-${String(++tokenSeq).padStart(12, '0')}`,
    maxPlayers,
    roomsPerIpPerMinute: 10,
    log: quiet,
  });
}

function openScreen(m: RoomManager) {
  const screen = new FakeConn();
  m.handleMessage(screen, { t: 'hello', role: 'screen', v: PROTOCOL_VERSION });
  const w = screen.last('welcome');
  if (w?.role !== 'screen') throw new Error('no screen welcome');
  return { screen, code: w.code, token: w.token };
}

function join(m: RoomManager, code: string, name = 'Rina', token?: string) {
  const c = new FakeConn();
  m.handleMessage(c, {
    t: 'hello',
    role: 'controller',
    v: PROTOCOL_VERSION,
    code,
    name,
    fruit: 'semangka',
    ...(token ? { token } : {}),
  });
  return c;
}

beforeEach(() => {
  clock = 1_000_000;
});

describe('RoomManager', () => {
  it('creates a room and lets players join, first one becomes host', () => {
    const m = makeManager();
    const { screen, code } = openScreen(m);
    const a = join(m, code, 'Rina');
    const b = join(m, code, 'Budi');
    const players = screen.last('players')!.players;
    expect(players.map((p) => [p.name, p.isHost])).toEqual([
      ['Rina', true],
      ['Budi', false],
    ]);
    expect(players[0]!.color).not.toBe(players[1]!.color);
    expect(a.last('welcome')).toMatchObject({ role: 'controller', id: 1, screenOnline: true });
    expect(b.last('welcome')).toMatchObject({ id: 2 });
  });

  it('enforces the player limit', () => {
    const m = makeManager(2);
    const { code } = openScreen(m);
    join(m, code, 'A');
    join(m, code, 'B');
    const c = join(m, code, 'C');
    expect(c.last('error')).toEqual({ t: 'error', code: 'room_full', fatal: true });
    expect(c.closedWith).not.toBeNull();
  });

  it('rejects unknown rooms and wrong protocol versions', () => {
    const m = makeManager();
    const c = join(m, 'ZZZZ');
    expect(c.last('error')?.code).toBe('room_not_found');
    const s = new FakeConn();
    m.handleMessage(s, { t: 'hello', role: 'screen', v: 999 });
    expect(s.last('error')?.code).toBe('version');
  });

  it('keeps the slot when a controller drops and resumes it with the token', () => {
    const m = makeManager();
    const { screen, code } = openScreen(m);
    const a = join(m, code, 'Rina');
    const token = (a.last('welcome') as { token: string }).token;
    m.handleClose(a);
    expect(screen.last('players')!.players[0]!.connected).toBe(false);
    clock += LIMITS.slotHoldMs - 1000;
    m.tick();
    const again = join(m, code, 'Rina', token);
    expect(again.last('welcome')).toMatchObject({ id: 1, resumed: true });
    expect(screen.last('players')!.players[0]!.connected).toBe(true);
  });

  it('frees the slot after the hold time and hands the host role over', () => {
    const m = makeManager();
    const { screen, code } = openScreen(m);
    const a = join(m, code, 'Rina');
    join(m, code, 'Budi');
    m.handleClose(a);
    clock += LIMITS.hostHandoverMs + 1;
    m.tick();
    expect(screen.last('players')!.players.find((p) => p.isHost)?.name).toBe('Budi');
    clock += LIMITS.slotHoldMs;
    m.tick();
    expect(screen.last('players')!.players.map((p) => p.name)).toEqual(['Budi']);
  });

  it('relays screen -> controller and controller -> screen only', () => {
    const m = makeManager();
    const { screen, code } = openScreen(m);
    const a = join(m, code, 'A');
    const b = join(m, code, 'B');
    m.handleMessage(screen, { t: 'relay', ch: 'g', to: 2, data: { hi: 1 } });
    expect(b.last('relay')).toEqual({ t: 'relay', ch: 'g', from: 0, data: { hi: 1 } });
    expect(a.last('relay')).toBeUndefined();
    m.handleMessage(a, { t: 'relay', ch: 'p', to: 2, data: 'sneaky' });
    expect(b.sent.filter((x) => x.t === 'relay')).toHaveLength(1);
    m.handleMessage(a, { t: 'relay', ch: 'p', to: 'screen', data: 'ok' });
    expect(screen.last('relay')).toEqual({ t: 'relay', ch: 'p', from: 1, data: 'ok' });
  });

  it('stamps binary input with the real sender id', () => {
    const m = makeManager();
    const { screen, code } = openScreen(m);
    join(m, code, 'A');
    const b = join(m, code, 'B');
    m.handleBinary(b, new Uint8Array(encodeInput({ seq: 1, buttons: 0, taps: 3, at: 5 })));
    expect(screen.binary[0]?.[1]).toBe(2);
  });

  it('lets the screen resume its room with the token and tells controllers', () => {
    const m = makeManager();
    const { screen, code, token } = openScreen(m);
    const a = join(m, code, 'A');
    m.handleClose(screen);
    expect(a.last('screen')).toEqual({ t: 'screen', online: false });
    const s2 = new FakeConn();
    m.handleMessage(s2, { t: 'hello', role: 'screen', v: PROTOCOL_VERSION, resume: { code, token } });
    expect(s2.last('welcome')).toMatchObject({ code, resumed: true });
    expect(a.last('screen')).toEqual({ t: 'screen', online: true });
  });

  it('closes a room when the screen never comes back', () => {
    const m = makeManager();
    const { screen, code } = openScreen(m);
    const a = join(m, code, 'A');
    m.handleClose(screen);
    clock += LIMITS.screenHoldMs + 1;
    m.tick();
    expect(a.last('error')?.code).toBe('room_closed');
    expect(m.roomCount).toBe(0);
  });

  it('only the host or screen may kick, never yourself', () => {
    const m = makeManager();
    const { screen, code } = openScreen(m);
    const a = join(m, code, 'A');
    const b = join(m, code, 'B');
    m.handleMessage(b, { t: 'kick', id: 1 });
    expect(b.last('error')?.code).toBe('not_allowed');
    m.handleMessage(a, { t: 'kick', id: 2 });
    expect(b.last('kicked')).toBeDefined();
    expect(screen.last('players')!.players).toHaveLength(1);
  });

  it('survives a snapshot round-trip', () => {
    const m = makeManager();
    const { code, token } = openScreen(m);
    const a = join(m, code, 'Rina');
    const pToken = (a.last('welcome') as { token: string }).token;
    const m2 = makeManager();
    m2.restore(m.snapshot());
    const s = new FakeConn();
    m2.handleMessage(s, { t: 'hello', role: 'screen', v: PROTOCOL_VERSION, resume: { code, token } });
    expect(s.last('welcome')).toMatchObject({ resumed: true });
    const back = join(m2, code, 'Rina', pToken);
    expect(back.last('welcome')).toMatchObject({ id: 1, resumed: true });
  });

  it('rate-limits room creation per IP', () => {
    const m = makeManager();
    for (let i = 0; i < 10; i++) openScreen(m);
    const s = new FakeConn();
    m.handleMessage(s, { t: 'hello', role: 'screen', v: PROTOCOL_VERSION });
    expect(s.last('error')?.code).toBe('rate_limited');
  });
});

describe('nearby screens and code guessing', () => {
  it('offers a room only to phones on the same network, and not when full', () => {
    const m = makeManager(2);
    const screen = new FakeConn('36.72.10.5');
    m.handleMessage(screen, { t: 'hello', role: 'screen', v: PROTOCOL_VERSION });
    const w = screen.last('welcome');
    if (w?.role !== 'screen') throw new Error('no screen welcome');
    expect(m.nearby('36.72.10.5').map((r) => r.code)).toEqual([w.code]);
    expect(m.nearby('36.72.10.6')).toEqual([]);
    join(m, w.code, 'Rina');
    const near = m.nearby('36.72.10.5')[0]!;
    expect(near.players.map((p) => p.name)).toEqual(['Rina']);
    expect(near.seatsLeft).toBe(1);
    join(m, w.code, 'Budi');
    expect(m.nearby('36.72.10.5')).toEqual([]);
  });

  it('stops looking codes up after too many wrong guesses from one address', () => {
    const m = makeManager();
    const { code } = openScreen(m);
    for (let i = 0; i < 20; i++) {
      const c = join(m, '000000' === code ? '111111' : '000000');
      expect(c.last('error')?.code).toBe('room_not_found');
    }
    expect(join(m, code).last('error')?.code).toBe('rate_limited');
    clock += 61_000;
    m.tick();
    expect(join(m, code).last('welcome')).toBeDefined();
  });
});

describe('avatars (look) and seat fruits', () => {
  function joinLook(m: RoomManager, code: string, name: string, look?: { c: 'mia' | 'bram'; hc?: number }) {
    const c = new FakeConn();
    m.handleMessage(c, {
      t: 'hello',
      role: 'controller',
      v: PROTOCOL_VERSION,
      code,
      name,
      ...(look ? { look } : {}),
    });
    return c;
  }

  it('keeps the look a phone sends and hands out a different fruit per seat', () => {
    const m = makeManager(4);
    const { screen, code } = openScreen(m);
    joinLook(m, code, 'Rina', { c: 'mia', hc: 2 });
    joinLook(m, code, 'Budi', { c: 'bram' });
    const players = screen.last('players')!.players;
    expect(players.map((p) => p.look)).toEqual([{ c: 'mia', hc: 2 }, { c: 'bram' }]);
    expect(new Set(players.map((p) => p.fruit)).size).toBe(2);
  });

  it('gives an old phone without a look a character from its fruit', () => {
    const m = makeManager(4);
    const { screen, code } = openScreen(m);
    join(m, code, 'Rina');
    expect(screen.last('players')!.players[0]!.look).toEqual({ c: 'leo' });
  });

  it('lets a phone change its name and look in the room (lobby "Ubah")', () => {
    const m = makeManager(4);
    const { screen, code } = openScreen(m);
    const a = joinLook(m, code, 'Rina', { c: 'mia' });
    m.handleMessage(a, { t: 'profile', name: 'Rini', look: { c: 'bram', oc: 3 } });
    const p = screen.last('players')!.players[0]!;
    expect(p.name).toBe('Rini');
    expect(p.look).toEqual({ c: 'bram', oc: 3 });
    // The main screen cannot change a player's profile.
    m.handleMessage(screen, { t: 'profile', name: 'X', look: { c: 'leo' } });
    expect(screen.last('error')?.code).toBe('not_allowed');
  });
});

describe('choosing an avatar after joining (picking)', () => {
  it('shows "picking" on the main screen until the phone says Siap, never for a dropped phone', () => {
    const m = makeManager(4);
    const { screen, code } = openScreen(m);
    const a = join(m, code, 'Rina');
    m.handleMessage(a, { t: 'profile', name: 'Rina', look: { c: 'mia' }, picking: true });
    expect(screen.last('players')!.players[0]!.picking).toBe(true);
    m.handleMessage(a, { t: 'profile', name: 'Rina', look: { c: 'kiki' }, picking: true });
    expect(screen.last('players')!.players[0]!.look).toEqual({ c: 'kiki' });
    m.handleMessage(a, { t: 'profile', name: 'Rina', look: { c: 'kiki' } });
    expect(screen.last('players')!.players[0]!.picking).toBeUndefined();
  });
});
