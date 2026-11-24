import { LIMITS, type Look } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { CITY_TILES, isOwnable, MAX_LEVEL, TILE_COUNT, TILES } from './board';
import type { HudModel, HudPlayer, TileCardModel } from './hud';
import type { TileState } from './logic';
import { applyMirror, FX_KEEP, type MirrorFx, type MirrorSource, toMirror } from './mirror';
import type { PawnPlace } from './scene/view';

const OFFSET = 1_000_000;
const LOOKS: Look[] = [
  { c: 'leo', s: 3, hc: 2, oc: 5 },
  { c: 'nara', s: 1, h: 'mia', hc: 7, oc: 1 },
  { c: 'mia' },
  { c: 'bima', s: 5, oc: 7 },
  { c: 'leo', h: 'bima', hc: 4 },
  { c: 'nara', s: 2 },
];
const COLORS = ['#F2453D', '#2F8CFF', '#22B35E', '#FFC928', '#FF5C9A', '#00B8C8'];
/** Longest names a phone can send. */
const longName = (i: number) => `${'Pemain'.padEnd(LIMITS.nameMax - 1, 'x')}${i}`;

function hudPlayer(i: number, n: number): HudPlayer {
  return {
    id: i < n - 2 ? i + 1 : -(i + 1),
    name: longName(i),
    look: LOOKS[i % LOOKS.length]!,
    color: COLORS[i % COLORS.length]!,
    cash: 12_345 - i * 1_000,
    worth: 98_760 - i * 3_210,
    cities: 3,
    rank: i + 1,
    active: i === 2,
    jailed: i === 3,
    bankrupt: false,
    connected: i !== 4,
    deltas: [
      { key: 900 + i, amount: -1_250 },
      { key: 910 + i, amount: 2_400 },
    ],
  };
}

function tileCard(p: HudPlayer): TileCardModel {
  return {
    tile: 23,
    eyebrow: 'Pulau Jawa',
    name: 'Jakarta',
    color: '#C92D25',
    price: 360,
    rows: [
      { label: 'Rumah', value: 360, current: false },
      { label: 'Toko', value: 720, current: false },
      { label: 'Gedung', value: 1_440, current: false },
      { label: 'Hotel', value: 2_880, current: true },
    ],
    double: true,
    lines: [
      { label: 'Harga rebut', value: 'Rp 1,2 jt', strong: true },
      { label: 'Upgrade ke Hotel', value: 'Rp 540 rb' },
    ],
    owner: { name: p.name, look: p.look, color: p.color },
    note: 'Ambil satu kartu kejadian: bisa untung, bisa buntung, bisa jalan-jalan.',
    forSale: false,
    level: MAX_LEVEL,
  };
}

/** Six players late in the game: every property owned, cities at Hotel, every HUD element up. */
function lateGame(n = 6): MirrorSource {
  const players = Array.from({ length: n }, (_, i) => hudPlayer(i, n));
  const tiles: TileState[] = TILES.map((t, i) =>
    isOwnable(t)
      ? { owner: players[i % n]!.id, level: t.kind === 'city' ? MAX_LEVEL : 0 }
      : { owner: null, level: 0 },
  );
  const places: PawnPlace[] = players.map((p, i) => ({
    id: p.id,
    tile: (i * 5) % TILE_COUNT,
    jailed: p.jailed,
    out: p.bankrupt,
  }));
  const winner = players[0]!;
  const model: HudModel = {
    players,
    turn: {
      id: players[2 % n]!.id,
      name: players[2 % n]!.name,
      look: players[2 % n]!.look,
      color: players[2 % n]!.color,
      hint: 'Rebut Labuan Bajo?',
      bonus: true,
    },
    dice: [6, 6],
    rolling: false,
    tile: tileCard(players[1 % n]!),
    card: {
      key: 77,
      title: 'Renovasi Gotong Royong',
      body: 'Tetangga datang membantu. Pilih satu kotamu yang belum Hotel, naik satu tingkat gratis. Belum punya kota? Terima Rp 100 rb.',
      tone: 'good',
    },
    banner: {
      kind: 'finale',
      key: 88,
      title: `${winner.name.toUpperCase()} JADI JURAGAN!`,
      sub: 'Putaran habis',
      line: 'Total kekayaan Rp 98,7 jt',
      winner: { name: winner.name, look: winner.look, color: winner.color },
    },
    toast: {
      key: 99,
      text: `${players[3 % n]!.name} merebut Labuan Bajo dari ${players[4 % n]!.name}!`,
      amount: 'Rp 1,2 jt',
      tone: 'gold',
    },
    round: { n: 40, of: 40 },
    lastRound: true,
  };
  const p = (k: number) => players[k % n]!.id;
  const fx: MirrorFx[] = [
    { k: 'd', n: 100, at: 5_000, p: p(0), v: [6, 6] },
    { k: 'w', n: 101, at: 5_100, p: p(0), m: 'walk', path: Array.from({ length: 23 }, (_, i) => i + 1) },
    { k: 'c', n: 102, at: 5_200, f: p(0), t: p(1), a: 2_880 },
    { k: 'c', n: 103, at: 5_300, f: null, t: p(0), a: 200 },
    { k: 'k', n: 104, at: 5_400 },
    { k: 'w', n: 105, at: 5_500, p: p(2), m: 'jump', path: [6] },
    { k: 'c', n: 106, at: 5_600, f: p(3), t: null, a: 1_500 },
    { k: 'w', n: 107, at: 5_700, p: p(4), m: 'back', path: [3, 2, 1] },
  ];
  return {
    model,
    tiles,
    places,
    active: p(2),
    focus: p(2),
    highlight: { tile: 16, color: '#FF6B5E' },
    fx,
    ring: { deadline: 20_000, total: 15_000 },
    frozenAt: null,
    toServer: (t) => t + OFFSET,
  };
}

function wire(src: MirrorSource) {
  const parsed = applyMirror(JSON.parse(JSON.stringify(toMirror(src))));
  if (!parsed) throw new Error('rejected');
  return parsed;
}

describe('juragan mirror', () => {
  it('round-trips the HUD model, the board and the effects', () => {
    const src = lateGame();
    const got = wire(src);
    expect(got.model).toEqual(src.model);
    expect(got.tiles).toEqual(src.tiles);
    expect(got.places).toEqual(src.places);
    expect(got.pawns).toEqual(src.model.players.map((p) => ({ id: p.id, look: p.look, color: p.color })));
    expect(got.active).toBe(src.active);
    expect(got.focus).toBe(src.focus);
    expect(got.highlight).toEqual(src.highlight);
    expect(got.fx).toEqual(src.fx.map((f) => ({ ...f, at: f.at + OFFSET })));
    expect(got.ring).toEqual({ deadline: 20_000 + OFFSET, total: 15_000 });
    expect(got.frozen).toBeNull();
  });

  it('round-trips an opening board: no owners, no turn, nothing on show, paused', () => {
    const src = lateGame(2);
    src.model = {
      ...src.model,
      turn: null,
      dice: null,
      tile: null,
      card: null,
      banner: null,
      toast: null,
      round: { n: 0, of: 12 },
      lastRound: false,
      players: src.model.players.map((p) => ({ ...p, deltas: [] })),
    };
    src.tiles = TILES.map(() => ({ owner: null, level: 0 }));
    src.fx = [];
    src.active = null;
    src.focus = null;
    src.highlight = null;
    src.ring = null;
    src.frozenAt = 3_000;
    const got = wire(src);
    expect(got.model).toEqual(src.model);
    expect(got.tiles.every((t) => t.owner === null)).toBe(true);
    expect(got.frozen).toBe(3_000 + OFFSET);
    expect(got.active).toBeNull();
    expect(got.highlight).toBeNull();
  });

  it('drops an unset strong flag on tile card lines', () => {
    const src = lateGame();
    const card = src.model.tile!;
    src.model = {
      ...src.model,
      tile: { ...card, lines: [{ label: 'Harga rebut', value: 'Rp 1 jt', strong: false }] },
    };
    expect(wire(src).model.tile?.lines).toEqual([{ label: 'Harga rebut', value: 'Rp 1 jt' }]);
  });

  it('rejects malformed states without throwing', () => {
    const good = JSON.parse(JSON.stringify(toMirror(lateGame()))) as Record<string, unknown>;
    expect(applyMirror(good)).not.toBeNull();
    const row0 = (good.pl as unknown[][])[0]!;
    const fx = good.fx as Record<string, unknown>[];
    const bad: unknown[] = [
      null,
      42,
      [],
      { ...good, v: 2 },
      { ...good, pl: [] },
      { ...good, pl: [row0, row0] },
      { ...good, pl: [[...row0.slice(0, 4), 99, ...row0.slice(5)]] },
      { ...good, pl: [[...row0.slice(0, 2), { c: 'nobody' }, ...row0.slice(3)]] },
      { ...good, pl: [[...row0.slice(0, 10), [1, 2, 3]]] },
      { ...good, tu: [12345, 'x', 0] },
      { ...good, di: [0, 7] },
      { ...good, ro: true },
      { ...good, ow: (good.ow as number[]).slice(1) },
      { ...good, ow: (good.ow as number[]).map(() => 9) },
      { ...good, lv: (good.lv as number[]).map(() => MAX_LEVEL + 1) },
      { ...good, tc: [23, 'x'] },
      { ...good, bn: { ...(good.bn as object), k: 'party' } },
      { ...good, to: [1, 'x', null, 'loud'] },
      { ...good, cd: [1, 'x', 'y', 'meh'] },
      { ...good, hl: [TILE_COUNT, '#FFC928'] },
      { ...good, hl: [3, 'red'] },
      { ...good, ac: 12345 },
      { ...good, ring: [1, 0] },
      { ...good, fz: 'now' },
      { ...good, fx: [...fx, ...fx] },
      { ...good, fx: [{ k: 'z', n: 1, at: 0 }] },
      { ...good, fx: [{ k: 'w', n: 1, at: 0, p: row0[0], m: 'fly', path: [1] }] },
      { ...good, fx: [{ k: 'w', n: 1, at: 0, p: row0[0], m: 'walk', path: [TILE_COUNT] }] },
      { ...good, fx: [{ k: 'c', n: 1, at: 0, f: 12345, t: null, a: 10 }] },
      { ...good, fx: [{ k: 'd', n: 1, at: 0, p: row0[0], v: [1] }] },
    ];
    for (const b of bad) expect(applyMirror(b)).toBeNull();
  });

  it('stays well under one packet for six players late in the game', () => {
    const src = lateGame();
    expect(src.fx).toHaveLength(FX_KEEP);
    expect(src.tiles.filter((t) => t.owner !== null)).toHaveLength(
      CITY_TILES.length + TILES.filter((t) => t.kind === 'transport').length,
    );
    const size = JSON.stringify(toMirror(src)).length;
    expect(size).toBeLessThan(5_000);
  });
});
