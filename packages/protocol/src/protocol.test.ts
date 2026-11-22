import { describe, expect, it } from 'vitest';
import { parseAdminPassCreate, parseAdminPassUpdate, parseHistoryHours, parseUsageDays } from './admin';
import { ClockSync } from './clock';
import { ROOM_CODE_LENGTH } from './constants';
import {
  decodeRelayedInput,
  encodeInput,
  expandTime,
  INPUT_OP,
  packStick,
  STICK_OP,
  stampInput,
  u16Delta,
  unpackStick,
} from './input';
import {
  CHESS_BOARD,
  CHESS_MOVE,
  encodeAim,
  encodeArrowPress,
  PAD_UP,
  PEEK_WORD_MAX,
  padHeart,
  padRadar,
  parseAim,
  parseArrowPress,
  peekWord,
  RADAR_MAX,
  thumbKey,
} from './messages';
import { generatePassCode, isPassCode, normalizePassCode } from './pass';
import {
  formatRoomCode,
  generateRoomCode,
  isRoomCode,
  normalizeRoomCode,
  parseClientMsg,
  sanitizeName,
} from './validate';

describe('room codes', () => {
  it('generates six-digit codes', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      expect(code).toMatch(/^\d{6}$/);
      expect(isRoomCode(code)).toBe(true);
    }
  });

  it('normalizes user input to digits', () => {
    expect(normalizeRoomCode(' 482 917 ')).toBe('482917');
    expect(normalizeRoomCode('48-29-17-55')).toBe('482917');
    expect(normalizeRoomCode('K7QM')).toBe('7');
    expect(isRoomCode('K7QM')).toBe(false);
    expect(isRoomCode('48291')).toBe(false);
  });

  it('shows codes in two groups', () => {
    expect(formatRoomCode('482917')).toBe('482 917');
    expect(formatRoomCode('4829')).toBe('4829');
  });
});

describe('names', () => {
  it('strips markup, control chars and extra spaces', () => {
    expect(sanitizeName('  <b>Rina</b>\n ')).toBe('bRina/b');
    expect(sanitizeName('a   b')).toBe('a b');
    expect(sanitizeName('Abcdefghijklmnop')).toHaveLength(12);
  });
});

describe('parseClientMsg', () => {
  it('accepts a valid controller hello', () => {
    const m = parseClientMsg(
      JSON.stringify({
        t: 'hello',
        role: 'controller',
        v: 1,
        code: '482917',
        name: 'Rina',
        fruit: 'semangka',
      }),
    );
    expect(m).toEqual({
      t: 'hello',
      role: 'controller',
      v: 1,
      code: '482917',
      name: 'Rina',
      fruit: 'semangka',
    });
  });

  it('rejects bad codes, fruits, names and junk', () => {
    const base = { t: 'hello', role: 'controller', v: 1, code: '482917', name: 'Rina', fruit: 'semangka' };
    expect(parseClientMsg(JSON.stringify({ ...base, code: '48291A' }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ ...base, fruit: 'apel' }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ ...base, name: '   ' }))).toBeNull();
    expect(parseClientMsg('{nope')).toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: 'relay', ch: 'x', to: 'all', data: 1 }))).toBeNull();
    expect(parseClientMsg('x'.repeat(10_000))).toBeNull();
  });

  it('accepts relay, ping, host and leave', () => {
    expect(parseClientMsg('{"t":"relay","ch":"g","to":3,"data":{"a":1}}')).toEqual({
      t: 'relay',
      ch: 'g',
      to: 3,
      data: { a: 1 },
    });
    expect(parseClientMsg('{"t":"ping","id":4,"ct":123.5}')).toEqual({ t: 'ping', id: 4, ct: 123.5 });
    expect(parseClientMsg('{"t":"host","id":2}')).toEqual({ t: 'host', id: 2 });
    expect(parseClientMsg('{"t":"leave"}')).toEqual({ t: 'leave' });
  });
});

describe('binary input', () => {
  it('round-trips through stamping', () => {
    const frame = encodeInput({ seq: 70000, buttons: 5, taps: 65537, at: 2 ** 32 + 99 });
    const stamped = stampInput(frame, 7);
    expect(stamped).not.toBeNull();
    expect(decodeRelayedInput(stamped!)).toEqual({
      op: INPUT_OP,
      from: 7,
      seq: 70000 & 0xffff,
      buttons: 5,
      taps: 1,
      at: 99,
    });
  });

  it('rejects malformed frames', () => {
    expect(stampInput(new Uint8Array(3), 1)).toBeNull();
    expect(stampInput(encodeInput({ seq: 0, buttons: 0, taps: 0, at: 0 }), 0)).toBeNull();
  });

  it('relays joystick frames and keeps their op', () => {
    const frame = encodeInput({ op: STICK_OP, seq: 3, buttons: packStick(1, -0.5), taps: 9, at: 1234 });
    const relayed = decodeRelayedInput(stampInput(frame, 4)!);
    expect(relayed?.op).toBe(STICK_OP);
    expect(relayed?.from).toBe(4);
    const { x, y } = unpackStick(relayed!.buttons);
    expect(x).toBeCloseTo(1, 2);
    expect(y).toBeCloseTo(-0.5, 1);
  });

  it('packs the stick symmetrically, clamped, with an exact centre', () => {
    expect(packStick(0, 0)).toBe(0);
    expect(unpackStick(packStick(-1, 1))).toEqual({ x: -1, y: 1 });
    expect(unpackStick(packStick(5, -9))).toEqual({ x: 1, y: -1 });
    expect(unpackStick(packStick(Number.NaN, 0))).toEqual({ x: 0, y: 0 });
  });

  it('rejects unknown ops', () => {
    const frame = new Uint8Array(encodeInput({ seq: 0, buttons: 0, taps: 0, at: 0 }));
    frame[0] = 9;
    expect(stampInput(frame, 1)).toBeNull();
  });

  it('handles counter and time wrap-around', () => {
    expect(u16Delta(65530, 4)).toBe(10);
    const ref = 2 ** 32 * 5 + 100;
    expect(expandTime(50, ref)).toBe(2 ** 32 * 5 + 50);
    expect(expandTime(2 ** 32 - 10, 2 ** 32 * 5 + 5)).toBe(2 ** 32 * 5 - 10);
  });
});

describe('ClockSync', () => {
  it('prefers low-RTT samples', () => {
    const c = new ClockSync();
    c.add(0, 1_000 + 5, 10); // rtt 10, offset 1000
    c.add(100, 2_000, 400); // rtt 300, skewed sample
    c.add(200, 1_200 + 2, 204); // rtt 4, offset 1000
    expect(Math.round(c.offset)).toBe(1000);
    expect(c.rtt).toBe(4);
  });
});

describe('chess view formats', () => {
  it('accepts 64-square boards and UCI moves only', () => {
    const start = `rnbqkbnr${'p'.repeat(8)}${'.'.repeat(32)}${'P'.repeat(8)}RNBQKBNR`;
    expect(CHESS_BOARD.test(start)).toBe(true);
    expect(CHESS_BOARD.test(start.slice(1))).toBe(false);
    expect(CHESS_BOARD.test(`${start.slice(1)}x`)).toBe(false);
    for (const m of ['e2e4', 'e7e8q', 'a7a8n', 'h1a8']) expect(CHESS_MOVE.test(m)).toBe(true);
    for (const m of ['e2e9', 'e7e8k', 'i2i4', 'e2', 'e2e4qq', 'E2E4']) expect(CHESS_MOVE.test(m)).toBe(false);
  });
});

describe('Hoorah Pass codes and admin bodies', () => {
  it('normalizes typed pass codes and generates readable ones', () => {
    expect(normalizePassCode(' sabtu-16 ')).toBe('SABTU16');
    expect(isPassCode('SABTU16')).toBe(true);
    expect(isPassCode('sabtu16')).toBe(false);
    expect(isPassCode('AB1')).toBe(false);
    const code = generatePassCode();
    expect(code).toHaveLength(8);
    expect(/[01IOL]/.test(code)).toBe(false);
  });

  it('accepts pass messages and drops a malformed remembered pass instead of the player', () => {
    expect(parseClientMsg('{"t":"pass","code":"pesta-1"}')).toEqual({ t: 'pass', code: 'PESTA1' });
    expect(parseClientMsg('{"t":"pass","code":"!!"}')).toBeNull();
    const hello = { t: 'hello', role: 'controller', v: 1, code: '482917', name: 'Rina', fruit: 'semangka' };
    expect(parseClientMsg(JSON.stringify({ ...hello, pass: 'sabtu16' }))).toMatchObject({ pass: 'SABTU16' });
    expect(parseClientMsg(JSON.stringify({ ...hello, pass: '?' }))).not.toHaveProperty('pass');
  });

  it('accepts the main screen status only with a known page and a plain game id', () => {
    expect(parseClientMsg('{"t":"status","page":"game","gameId":"ludo"}')).toEqual({
      t: 'status',
      page: 'game',
      gameId: 'ludo',
    });
    expect(parseClientMsg('{"t":"status","page":"home","gameId":null}')).toMatchObject({ gameId: null });
    expect(parseClientMsg('{"t":"status","page":"lobby","gameId":null}')).toBeNull();
    expect(parseClientMsg('{"t":"status","page":"game","gameId":"<b>"}')).toBeNull();
  });

  it('accepts an optional count of direct links in the status, only as a small whole number', () => {
    const base = { t: 'status', page: 'home', gameId: null };
    expect(parseClientMsg(JSON.stringify({ ...base, direct: 3 }))).toEqual({ ...base, direct: 3 });
    expect(parseClientMsg(JSON.stringify({ ...base, direct: 0 }))).toMatchObject({ direct: 0 });
    expect(parseClientMsg(JSON.stringify(base))).not.toHaveProperty('direct');
    expect(parseClientMsg(JSON.stringify({ ...base, direct: -1 }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ ...base, direct: 1.5 }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ ...base, direct: '2' }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ ...base, direct: 17 }))).toBeNull();
  });

  it('reads the monitoring ranges, falling back on anything unknown', () => {
    expect(parseHistoryHours('168')).toBe(168);
    expect(parseHistoryHours('336')).toBe(336);
    expect(parseHistoryHours('12')).toBe(24);
    expect(parseHistoryHours(null)).toBe(24);
    expect(parseUsageDays('1')).toBe(1);
    expect(parseUsageDays('30')).toBe(30);
    expect(parseUsageDays('90')).toBe(7);
    expect(parseUsageDays('')).toBe(7);
  });

  it('validates pass create and update bodies', () => {
    const ok = { label: '  Main\nbareng  ', expiresAt: 2_000_000_000_000, maxPlayers: 16, maxRooms: null };
    expect(parseAdminPassCreate(ok)).toEqual({ ...ok, label: 'Main bareng' });
    expect(parseAdminPassCreate({ ...ok, code: 'sabtu 16' })).toMatchObject({ code: 'SABTU16' });
    expect(parseAdminPassCreate({ ...ok, maxPlayers: 2 })).toBeNull();
    expect(parseAdminPassCreate({ ...ok, maxPlayers: 17 })).toBeNull();
    expect(parseAdminPassCreate({ ...ok, label: '   ' })).toBeNull();
    expect(parseAdminPassCreate({ ...ok, maxRooms: 0 })).toBeNull();
    expect(parseAdminPassUpdate({ revoked: true })).toEqual({ revoked: true });
    expect(parseAdminPassUpdate({ maxRooms: null })).toEqual({ maxRooms: null });
    expect(parseAdminPassUpdate({})).toBeNull();
    expect(parseAdminPassUpdate({ revoked: 'ya' })).toBeNull();
  });
});

describe('peek card word', () => {
  it('keeps text only, trimmed and capped', () => {
    expect(peekWord('  Kopi ')).toBe('Kopi');
    expect(peekWord(42)).toBe('');
    expect(peekWord(undefined)).toBe('');
    expect(peekWord('a\u0000b')).toBe('ab');
    expect(peekWord('x'.repeat(100))).toHaveLength(PEEK_WORD_MAX);
  });
});

describe('secret map and heartbeat', () => {
  it('keeps a valid radar and clamps positions into the map', () => {
    const r = padRadar({
      grid: ['####', '#.D#', '####'],
      me: { x: 9, y: -2 },
      people: [
        { x: 1.5, y: 1.5, c: '#2F8CFF' },
        { x: 2, y: 1, c: 'red' },
        { x: 1, y: 1, c: '#FFC928', f: true },
      ],
      marks: [
        { x: 1, y: 1, k: 'fuse', p: 4 },
        { x: 2, y: 2, k: 'bomb' },
        { x: 3, y: 1, k: 'exit', on: true },
      ],
      lit: true,
    });
    expect(r).not.toBeNull();
    expect(r?.me).toEqual({ x: 4, y: 0 });
    expect(r?.people).toEqual([
      { x: 1.5, y: 1.5, c: '#2F8CFF' },
      { x: 1, y: 1, c: '#FFC928', f: true },
    ]);
    expect(r?.marks).toEqual([
      { x: 1, y: 1, k: 'fuse', p: 1 },
      { x: 3, y: 1, k: 'exit', on: true },
    ]);
    expect(r?.lit).toBe(true);
  });

  it('drops unknown cells, oversized maps and broken input', () => {
    expect(padRadar(null)).toBeNull();
    expect(padRadar({ grid: [], me: { x: 0, y: 0 } })).toBeNull();
    expect(padRadar({ grid: ['<script>'], me: { x: 0, y: 0 } })).toBeNull();
    expect(padRadar({ grid: ['##'], me: { x: Number.NaN, y: 0 } })).toBeNull();
    const big = padRadar({ grid: Array.from({ length: 60 }, () => '.'.repeat(90)), me: { x: 1, y: 1 } });
    expect(big?.grid).toHaveLength(RADAR_MAX.rows);
    expect(big?.grid[0]).toHaveLength(RADAR_MAX.cols);
    expect(padHeart(0.4)).toBe(0.4);
    expect(padHeart(7)).toBe(1);
    expect(padHeart('x')).toBe(0);
  });
});

describe('option picture key', () => {
  it('accepts short lowercase ids only', () => {
    expect(thumbKey('kota')).toBe('kota');
    expect(thumbKey('mode-balap-2')).toBe('mode-balap-2');
    expect(thumbKey('')).toBeNull();
    expect(thumbKey('-x')).toBeNull();
    expect(thumbKey('Kota')).toBeNull();
    expect(thumbKey('../x')).toBeNull();
    expect(thumbKey('<svg>')).toBeNull();
    expect(thumbKey('a'.repeat(33))).toBeNull();
    expect(thumbKey(7)).toBeNull();
  });
});

describe('sling aim', () => {
  it('round-trips in whole hundredths', () => {
    expect(encodeAim({ x: -0.354, y: 0.7 })).toBe('-35,70');
    expect(parseAim('-35,70')).toEqual({ x: -0.35, y: 0.7 });
    expect(parseAim(encodeAim({ x: 0, y: 0 }))).toEqual({ x: 0, y: 0 });
  });

  it('clamps the power to the unit disc', () => {
    const a = parseAim('100,100')!;
    expect(Math.hypot(a.x, a.y)).toBeCloseTo(1, 6);
    expect(encodeAim({ x: 3, y: 4 })).toBe('60,80');
    expect(encodeAim({ x: Number.NaN, y: 0.5 })).toBe('0,50');
  });

  it('rejects malformed or out-of-range values', () => {
    for (const bad of [undefined, 42, '', '1', '1,2,3', '101,0', '0,-101', 'a,b', ' 1,2', '1.5,2', '-0001,2'])
      expect(parseAim(bad)).toBeNull();
  });
});

describe('reliable arrow presses', () => {
  it('round-trips a direction bit and the tap counter', () => {
    expect(parseArrowPress(encodeArrowPress(PAD_UP, 70000))).toEqual({
      bit: PAD_UP,
      counter: 70000 & 0xffff,
    });
    expect(parseArrowPress('8:42')).toEqual({ bit: 8, counter: 42 });
  });

  it('rejects anything but one direction bit and a u16 counter', () => {
    for (const bad of [undefined, 3, '', '3:1', '16:1', '4:65536', '4:-1', '4:1:2', 'a:b', ' 4:1'])
      expect(parseArrowPress(bad)).toBeNull();
  });
});
