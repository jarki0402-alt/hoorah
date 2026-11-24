import { lookAt } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { geometryFor, layoutPawns } from './geometry';
import { BASE, boardFor, type ColorId } from './logic';
import {
  applyMirror,
  type LudoMirror,
  type MirrorMove,
  type MirrorSource,
  pawnRefs,
  toMirror,
} from './mirror';
import { type HudModel, LudoStore, type PlayerCard, type SeatCard } from './store';

const OFFSET = 50_000;

const card = (id: number): PlayerCard => ({
  id,
  name: `Pemain ${id}`,
  fruit: 'mangga',
  look: lookAt(id),
  color: '#2F8CFF',
  connected: id !== 4,
});

function model(pawns: number[][], seats = 4): HudModel {
  const colors = [0, 1, 2, 3, 4, 5, 6, 7].slice(0, seats) as ColorId[];
  const cards: SeatCard[] = colors.map((color, i) => ({
    index: i,
    color,
    player: card(i + 1),
    pawns: pawns[i] ?? [BASE, BASE, BASE, BASE],
    home: 0,
    active: i === 0,
    winner: false,
  }));
  return {
    pawnsPer: 4,
    sides: Math.max(seats, 4),
    colors,
    seats: cards,
    turn: { seat: 0, color: 0, player: card(1), bonus: true, auto: false },
    dice: 6,
    rolling: false,
    rollId: 3,
    hint: 'Pilih bidak',
    six: true,
    over: false,
    legal: ['0-0', '0-1'],
    banner: { kind: 'intro', key: 1, first: 'Pemain 1 duluan', note: null },
  };
}

function source(m: HudModel, move: MirrorMove | null = null): MirrorSource {
  return {
    model: m,
    move,
    toast: { id: 9, text: 'ENAM!', sub: null, tone: 'six', until: 1000 },
    bursts: [{ id: 2, x: 7.5, y: 3, color: '#E8352E', until: 1200 }],
    ring: { deadline: 5000, total: 12_000 },
    frozenAt: null,
    toServer: (t) => t + OFFSET,
  };
}

const wire = (s: LudoMirror): unknown => JSON.parse(JSON.stringify(s));

describe('ludo mirror', () => {
  it('round trip rebuilds the HUD model and the pawns', () => {
    const m = model([[0, 5, BASE, BASE], [12], [BASE, BASE, 3, BASE], [BASE, BASE, BASE, 57]]);
    m.seats[1]!.pawns = [12, BASE, BASE, BASE];
    const shown = applyMirror(wire(toMirror(source(m))))!;
    expect(shown).not.toBeNull();
    expect(shown.model).toEqual(m);
    expect(shown.pawns).toEqual(pawnRefs(m.seats));
    expect(shown.pawns).toHaveLength(16);
  });

  it('times cross as server ms', () => {
    const shown = applyMirror(wire(toMirror({ ...source(model([])), frozenAt: 700 })))!;
    expect(shown.toast?.until).toBe(1000 + OFFSET);
    expect(shown.bursts[0]?.until).toBe(1200 + OFFSET);
    expect(shown.ring).toEqual({ deadline: 5000 + OFFSET, total: 12_000 });
    expect(shown.frozen).toBe(700 + OFFSET);
  });

  it('finale banner keeps its winners', () => {
    const m = model([]);
    m.banner = { kind: 'finale', key: 4, title: 'MERAH MENANG', sub: 'x', winners: [card(2)], color: 1 };
    m.turn = null;
    expect(applyMirror(wire(toMirror(source(m))))!.model).toEqual(m);
  });

  it('a move gives the far screen what it needs to replay the hops', () => {
    const before = model([[BASE, BASE, BASE, BASE]]);
    const after = model([
      [0, BASE, BASE, BASE],
      [BASE, BASE, BASE, BASE],
    ]);
    const mv: MirrorMove = { n: 1, at: 100, seat: 0, pawn: 0, color: 0, path: [0], captures: [] };
    const a = applyMirror(wire(toMirror(source(before))))!;
    const b = applyMirror(wire(toMirror(source(after, mv))))!;
    expect(a.move).toBeNull();
    expect(b.move).toEqual({ ...mv, at: 100 + OFFSET });
    const g = geometryFor(boardFor(4));
    const store = new LudoStore();
    const landed = store.playMove(g, a.pawns, b.pawns, 4, b.move!);
    const want = layoutPawns(g, b.pawns, 4).find((p) => p.seat === 0 && p.pawn === 0);
    expect(landed).toEqual(want);
    const start = layoutPawns(g, a.pawns, 4).find((p) => p.seat === 0 && p.pawn === 0);
    expect(landed && start && (landed.x !== start.x || landed.y !== start.y)).toBe(true);
  });

  it('rejects malformed states without throwing', () => {
    const good = toMirror(source(model([])));
    const bad: unknown[] = [
      null,
      7,
      [],
      {},
      { ...good, v: 9 },
      { ...good, pp: 3.5 },
      { ...good, sides: 99 },
      { ...good, people: [[1, 'A', 'durian?', {}, '#fff', 1]] },
      { ...good, seats: [[0, 0, 777, [BASE, BASE, BASE, BASE], 0, 0]] },
      { ...good, seats: [[0, 0, 1, [BASE, 'x', BASE, BASE], 0, 0]] },
      { ...good, seats: [[0, 0, 1, [BASE], 0, 0]] },
      { ...good, colors: [12] },
      { ...good, turn: [0, 0, 1, 2, 0] },
      { ...good, dice: 7 },
      { ...good, legal: ['<b>'] },
      { ...good, hint: 'x'.repeat(1000) },
      { ...good, banner: { k: 'party', key: 1 } },
      { ...good, toast: { id: 1, text: 'a', sub: null, tone: 'loud', until: 1 } },
      { ...good, bursts: [{ id: 1, x: 'a', y: 0, color: '#fff', until: 1 }] },
      { ...good, ring: [1, 0] },
      { ...good, move: { n: 1, at: 1, seat: 9, pawn: 0, color: 0, path: [], captures: [] } },
      { ...good, frozen: 'now' },
    ];
    for (const b of bad) expect(applyMirror(b)).toBeNull();
  });

  it('stays small for an eight-seat game', () => {
    const m = model(
      Array.from({ length: 8 }, (_, i) => [i, i + 10, BASE, 40]),
      8,
    );
    const mv: MirrorMove = {
      n: 12,
      at: 1,
      seat: 2,
      pawn: 1,
      color: 2,
      path: [7, 8, 9, 10, 11, 12],
      captures: [],
    };
    expect(JSON.stringify(toMirror(source(m, mv))).length).toBeLessThan(3000);
  });
});
