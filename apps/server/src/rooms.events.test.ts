import { PROTOCOL_VERSION, type ServerMsg } from '@hoorah/protocol';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDb } from './db';
import type { Logger } from './log';
import { PassRepository } from './passes';
import { type Conn, type RoomEvents, RoomManager } from './rooms';

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
let clock = 1_000_000_000;
let tokenSeq = 0;

type Event = [keyof RoomEvents, ...unknown[]];

function setup() {
  const events: Event[] = [];
  const sink: RoomEvents = {
    roomCreated: (at) => events.push(['roomCreated', at]),
    gameStarted: (gameId, players, at) => events.push(['gameStarted', gameId, players, at]),
    roomClosed: (lifetimeMs, peak, at) => events.push(['roomClosed', lifetimeMs, peak, at]),
    passActivated: (at) => events.push(['passActivated', at]),
    passRejected: (ip, reason, at) => events.push(['passRejected', ip, reason, at]),
  };
  const passes = new PassRepository(openDb(':memory:'));
  const m = new RoomManager({
    now: () => clock,
    random: Math.random,
    token: () => `token-${String(++tokenSeq).padStart(12, '0')}`,
    maxPlayers: 2,
    roomsPerIpPerMinute: 50,
    log: quiet,
    passes,
    events: sink,
  });
  return { m, events, passes };
}

function openScreen(m: RoomManager) {
  const screen = new FakeConn();
  m.handleMessage(screen, { t: 'hello', role: 'screen', v: PROTOCOL_VERSION });
  const w = screen.last('welcome');
  if (w?.role !== 'screen') throw new Error('no screen welcome');
  return { screen, code: w.code, token: w.token };
}

function join(m: RoomManager, code: string, name: string, pass?: string) {
  const c = new FakeConn('2.2.2.2');
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

describe('RoomManager dashboard events', () => {
  it('counts a game start only when the screen enters a game page it was not on', () => {
    const { m, events } = setup();
    const { screen, code } = openScreen(m);
    join(m, code, 'Rina');
    join(m, code, 'Budi');
    const status = (page: 'home' | 'detail' | 'game' | 'results', gameId: string | null) =>
      m.handleMessage(screen, { t: 'status', page, gameId });
    status('home', 'ludo');
    status('detail', 'ludo');
    status('game', 'ludo');
    status('game', 'ludo');
    status('results', 'ludo');
    status('game', 'ludo');
    status('game', 'catur');
    const starts = events.filter((e) => e[0] === 'gameStarted');
    expect(starts).toEqual([
      ['gameStarted', 'ludo', 2, clock],
      ['gameStarted', 'ludo', 2, clock],
      ['gameStarted', 'catur', 2, clock],
    ]);
    expect(events[0]).toEqual(['roomCreated', clock]);
  });

  it('does not count again when a resumed screen repeats its status', () => {
    const { m, events } = setup();
    const { screen, code, token } = openScreen(m);
    join(m, code, 'Rina');
    m.handleMessage(screen, { t: 'status', page: 'game', gameId: 'kuis' });
    m.handleClose(screen);
    const again = new FakeConn();
    m.handleMessage(again, { t: 'hello', role: 'screen', v: PROTOCOL_VERSION, resume: { code, token } });
    m.handleMessage(again, { t: 'status', page: 'game', gameId: 'kuis' });
    expect(events.filter((e) => e[0] === 'gameStarted')).toHaveLength(1);
  });

  it('keeps the direct link count per room, capped by connected phones, and clears it when the screen leaves', () => {
    const { m } = setup();
    const { screen, code } = openScreen(m);
    const rina = join(m, code, 'Rina');
    join(m, code, 'Budi');
    m.handleMessage(screen, { t: 'status', page: 'home', gameId: null, direct: 2 });
    expect(m.liveCounts()).toEqual({ rooms: 1, screens: 1, phones: 2, players: 2, direct: 2 });
    m.handleClose(rina);
    expect(m.liveCounts()).toMatchObject({ phones: 1, players: 2, direct: 1 });
    // A status without `direct` (older screen) keeps the last number.
    m.handleMessage(screen, { t: 'status', page: 'detail', gameId: 'ludo' });
    expect(m.liveCounts().direct).toBe(1);
    m.handleClose(screen);
    expect(m.liveCounts()).toMatchObject({ screens: 0, direct: 0 });
  });

  it('reports the room lifetime and its most players when it closes', () => {
    const { m, events } = setup();
    const { screen, code } = openScreen(m);
    const opened = clock;
    join(m, code, 'Rina');
    join(m, code, 'Budi');
    clock += 20 * 60_000;
    m.handleClose(screen);
    // Held for the screen until screenHoldMs runs out, then closed.
    clock += 11 * 60_000;
    m.tick();
    const closed = events.find((e) => e[0] === 'roomClosed');
    expect(closed).toEqual(['roomClosed', 20 * 60_000, 2, clock]);
    expect(opened).toBeLessThan(clock);
  });

  it('reports pass activations and wrong pass codes with the address', () => {
    const { m, events, passes } = setup();
    passes.insert({
      code: 'SABTU16',
      label: 'Uji',
      maxPlayers: 8,
      maxRooms: null,
      expiresAt: clock + 3_600_000,
      createdBy: null,
      now: clock,
    });
    const { code } = openScreen(m);
    join(m, code, 'Rina', 'SALAH99');
    join(m, code, 'Budi', 'SABTU16');
    join(m, code, 'Sari', 'SABTU16');
    expect(events.filter((e) => e[0] === 'passRejected')).toEqual([
      ['passRejected', '2.2.2.2', 'invalid', clock],
    ]);
    // The second phone with the same code finds the room already open: one activation.
    expect(events.filter((e) => e[0] === 'passActivated')).toHaveLength(1);
  });

  it('reports rate-limited pass attempts', () => {
    const { m, events } = setup();
    const { screen } = openScreen(m);
    for (let i = 0; i < 11; i++) m.handleMessage(screen, { t: 'pass', code: `SALAH${i + 10}` });
    const reasons = events.filter((e) => e[0] === 'passRejected').map((e) => e[2]);
    expect(reasons.filter((r) => r === 'invalid')).toHaveLength(10);
    expect(reasons.at(-1)).toBe('rate_limited');
  });

  it('keeps working when the event sink throws', () => {
    const m = new RoomManager({
      now: () => clock,
      random: Math.random,
      token: () => `token-${String(++tokenSeq).padStart(12, '0')}`,
      maxPlayers: 2,
      roomsPerIpPerMinute: 50,
      log: quiet,
      events: {
        roomCreated() {
          throw new Error('disk full');
        },
        gameStarted() {},
        roomClosed() {},
        passActivated() {},
        passRejected() {},
      },
    });
    const { code } = openScreen(m);
    expect(m.roomCount).toBe(1);
    expect(code).toMatch(/^\d{6}$/);
  });
});
