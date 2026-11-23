import { LIMITS, PROTOCOL_VERSION, type ServerMsg } from '@hoorah/protocol';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Logger } from './log';
import { type Conn, RoomManager } from './rooms';

class FakeConn implements Conn {
  sent: ServerMsg[] = [];
  closedWith: number | null = null;
  readonly ip = '1.1.1.1';
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

/** A room with a screen and three phones: Rina (1, Host), Budi (2), Sari (3). */
function setup() {
  const m = new RoomManager({
    now: () => clock,
    random: Math.random,
    token: () => `token-${String(++tokenSeq).padStart(12, '0')}`,
    maxPlayers: 8,
    roomsPerIpPerMinute: 10,
    log: quiet,
  });
  const screen = new FakeConn();
  m.handleMessage(screen, { t: 'hello', role: 'screen', v: PROTOCOL_VERSION });
  const w = screen.last('welcome');
  if (w?.role !== 'screen') throw new Error('no screen welcome');
  const join = (name: string) => {
    const c = new FakeConn();
    m.handleMessage(c, {
      t: 'hello',
      role: 'controller',
      v: PROTOCOL_VERSION,
      code: w.code,
      name,
      fruit: 'nanas',
    });
    return c;
  };
  const rina = join('Rina');
  const budi = join('Budi');
  const sari = join('Sari');
  const hostId = () => screen.last('players')?.players.find((p) => p.isHost)?.id ?? null;
  return { m, screen, rina, budi, sari, hostId };
}

beforeEach(() => {
  clock = 1_000_000;
});

describe('Host offers', () => {
  it('moves the Host role only after the asked player accepts', () => {
    const { m, screen, rina, budi, sari, hostId } = setup();
    m.handleMessage(rina, { t: 'hostOffer', id: 2 });
    expect(rina.last('hostOffer')).toEqual({ t: 'hostOffer', from: 1, to: 2 });
    expect(budi.last('hostOffer')).toEqual({ t: 'hostOffer', from: 1, to: 2 });
    expect(sari.last('hostOffer')).toBeUndefined();
    expect(hostId()).toBe(1);

    m.handleMessage(budi, { t: 'hostReply', accept: true });
    expect(hostId()).toBe(2);
    const end = { t: 'hostOfferEnd', from: 1, to: 2, result: 'accepted' };
    expect(rina.last('hostOfferEnd')).toEqual(end);
    expect(budi.last('hostOfferEnd')).toEqual(end);
    for (const c of [screen, rina, budi, sari])
      expect(c.last('hostChanged')).toEqual({ t: 'hostChanged', id: 2, from: 1 });
  });

  it('keeps the Host when the offer is declined', () => {
    const { m, screen, rina, budi, hostId } = setup();
    m.handleMessage(rina, { t: 'hostOffer', id: 2 });
    m.handleMessage(budi, { t: 'hostReply', accept: false });
    expect(hostId()).toBe(1);
    expect(rina.last('hostOfferEnd')).toMatchObject({ result: 'declined' });
    expect(screen.last('hostChanged')).toBeUndefined();
  });

  it('only the current Host phone may offer, never to itself or to an absent player', () => {
    const { m, screen, rina, budi } = setup();
    m.handleMessage(budi, { t: 'hostOffer', id: 3 });
    expect(budi.last('error')).toEqual({ t: 'error', code: 'not_allowed', fatal: false });
    m.handleMessage(screen, { t: 'hostOffer', id: 2 });
    expect(screen.last('error')).toEqual({ t: 'error', code: 'not_allowed', fatal: false });
    m.handleMessage(rina, { t: 'hostOffer', id: 1 });
    expect(rina.last('error')).toEqual({ t: 'error', code: 'not_allowed', fatal: false });
    m.handleMessage(rina, { t: 'hostOffer', id: 9 });
    expect(rina.last('error')).toEqual({ t: 'error', code: 'bad_request', fatal: false });
    expect(rina.last('hostOffer')).toBeUndefined();
  });

  it('only the asked player may answer', () => {
    const { m, rina, sari, hostId } = setup();
    m.handleMessage(rina, { t: 'hostOffer', id: 2 });
    m.handleMessage(sari, { t: 'hostReply', accept: true });
    expect(sari.last('error')).toEqual({ t: 'error', code: 'not_allowed', fatal: false });
    m.handleMessage(rina, { t: 'hostReply', accept: true });
    expect(rina.last('error')).toEqual({ t: 'error', code: 'not_allowed', fatal: false });
    expect(hostId()).toBe(1);
  });

  it('holds one pending offer per room: a new one replaces the old', () => {
    const { m, rina, budi, sari, hostId } = setup();
    m.handleMessage(rina, { t: 'hostOffer', id: 2 });
    m.handleMessage(rina, { t: 'hostOffer', id: 3 });
    expect(budi.last('hostOfferEnd')).toEqual({ t: 'hostOfferEnd', from: 1, to: 2, result: 'cancelled' });
    expect(sari.last('hostOffer')).toEqual({ t: 'hostOffer', from: 1, to: 3 });
    m.handleMessage(budi, { t: 'hostReply', accept: true });
    expect(budi.last('error')).toMatchObject({ code: 'not_allowed' });
    expect(hostId()).toBe(1);
    m.handleMessage(sari, { t: 'hostReply', accept: true });
    expect(hostId()).toBe(3);
  });

  it('expires after the offer time without an answer', () => {
    const { m, rina, budi, hostId } = setup();
    m.handleMessage(rina, { t: 'hostOffer', id: 2 });
    clock += LIMITS.hostOfferMs - 1000;
    m.tick();
    expect(rina.last('hostOfferEnd')).toBeUndefined();
    clock += 1000;
    m.tick();
    expect(rina.last('hostOfferEnd')).toMatchObject({ result: 'expired' });
    expect(budi.last('hostOfferEnd')).toMatchObject({ result: 'expired' });
    m.handleMessage(budi, { t: 'hostReply', accept: true });
    expect(hostId()).toBe(1);
  });

  it('the Host may withdraw its offer', () => {
    const { m, rina, budi, hostId } = setup();
    m.handleMessage(budi, { t: 'hostOfferCancel' });
    m.handleMessage(rina, { t: 'hostOffer', id: 2 });
    m.handleMessage(budi, { t: 'hostOfferCancel' });
    expect(budi.last('hostOfferEnd')).toBeUndefined();
    m.handleMessage(rina, { t: 'hostOfferCancel' });
    expect(budi.last('hostOfferEnd')).toMatchObject({ result: 'cancelled' });
    m.handleMessage(budi, { t: 'hostReply', accept: true });
    expect(hostId()).toBe(1);
  });

  it('is cancelled when the asked player leaves or drops', () => {
    const { m, rina, budi, sari } = setup();
    m.handleMessage(rina, { t: 'hostOffer', id: 2 });
    m.handleClose(budi);
    expect(rina.last('hostOfferEnd')).toMatchObject({ to: 2, result: 'cancelled' });
    m.handleMessage(rina, { t: 'hostOffer', id: 3 });
    m.handleMessage(sari, { t: 'leave' });
    expect(rina.last('hostOfferEnd')).toMatchObject({ to: 3, result: 'cancelled' });
  });

  it('is cancelled when the Host drops, and the asked player can no longer accept', () => {
    const { m, rina, budi, hostId } = setup();
    m.handleMessage(rina, { t: 'hostOffer', id: 2 });
    m.handleClose(rina);
    expect(budi.last('hostOfferEnd')).toMatchObject({ result: 'cancelled' });
    m.handleMessage(budi, { t: 'hostReply', accept: true });
    expect(hostId()).toBe(1);
  });

  it('is cancelled when the Host role moves another way', () => {
    const { m, screen, rina, sari, hostId } = setup();
    m.handleMessage(rina, { t: 'hostOffer', id: 2 });
    m.handleMessage(screen, { t: 'host', id: 3 });
    expect(hostId()).toBe(3);
    expect(rina.last('hostOfferEnd')).toMatchObject({ result: 'cancelled' });
    expect(sari.last('hostChanged')).toBeUndefined();
  });

  it('keeps the automatic handover when the Host stays away', () => {
    const { m, rina, hostId } = setup();
    m.handleClose(rina);
    clock += LIMITS.hostHandoverMs + 1000;
    m.tick();
    expect(hostId()).toBe(2);
  });
});
