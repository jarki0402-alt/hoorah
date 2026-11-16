import { describe, expect, it } from 'vitest';
import { chooseHole, depthFor, moveValue, rankHoles } from './brain';
import { CongklakMatch, holeNumber, INTRO_MS, newBoard, type Side, sow, storeOf, validHoles } from './logic';

/** Board from two rows as players see them (hole 1 … 7) plus the stores. */
function board(side0: number[], side1: number[], store0 = 0, store1 = 0): number[] {
  return [...side0, store0, ...side1, store1];
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A random-ish position reached by playing `n` legal moves. */
function midgame(n: number, seed: number): { b: number[]; side: Side } {
  const r = rng(seed);
  let b = newBoard();
  let side: Side = 0;
  for (let i = 0; i < n; i++) {
    const holes = validHoles(b, side);
    if (holes.length === 0) break;
    const t = sow(b, side, holes[Math.floor(r() * holes.length)]!);
    b = t.after;
    if (t.outcome !== 'store') side = side === 0 ? 1 : 0;
  }
  return { b, side };
}

describe('congklak brain', () => {
  it('maps skill onto lookahead depth', () => {
    expect(depthFor(0)).toBe(1);
    expect(depthFor(0.5)).toBe(2);
    expect(depthFor(0.95)).toBe(3);
  });

  it('values a move by store gain plus an extra-turn bonus at depth 1', () => {
    // Hole 7 of side 0 holds 1 seed: it lands in the store (gain 1, extra turn).
    const b = board([0, 0, 0, 0, 0, 3, 1], [1, 1, 1, 1, 1, 1, 1]);
    expect(moveValue(b, 0, 6, 1)).toBe(1 + 2);
  });

  it('prefers a capture over a quiet move', () => {
    // Hole 1 (1 seed) lands in empty hole 2; across it (pos 13) sit 9 seeds.
    const b = board([1, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 9, 0]);
    const ranked = rankHoles(b, 0, 1);
    expect(ranked[0]!.pos).toBe(0);
    expect(ranked[0]!.score).toBe(10);
  });

  it('ranks every legal hole exactly once, best first', () => {
    for (let seed = 1; seed < 15; seed++) {
      const { b, side } = midgame(6 + seed, seed);
      if (validHoles(b, side).length === 0) continue;
      for (const depth of [1, 2, 3]) {
        const ranked = rankHoles(b, side, depth);
        expect(ranked.map((r) => r.pos).sort((x, y) => x - y)).toEqual(validHoles(b, side));
        for (let i = 1; i < ranked.length; i++)
          expect(ranked[i - 1]!.score).toBeGreaterThanOrEqual(ranked[i]!.score);
      }
    }
  });

  it('deeper search scores the same holes with finite values', () => {
    const b = board([0, 0, 0, 0, 0, 2, 1], [1, 0, 0, 0, 0, 0, 0], 0, 0);
    const shallow = rankHoles(b, 0, 1);
    const deep = rankHoles(b, 0, 3);
    expect(shallow.length).toBe(deep.length);
    for (const r of deep) expect(Number.isFinite(r.score)).toBe(true);
  });

  it('always returns a legal hole, at any skill', () => {
    for (let seed = 1; seed < 40; seed++) {
      const { b, side } = midgame(seed % 20, seed);
      const legal = validHoles(b, side);
      if (legal.length === 0) continue;
      for (const skill of [0.05, 0.5, 0.95]) {
        expect(legal).toContain(chooseHole(b, side, skill, rng(seed * 7)));
      }
    }
  });

  it('a sharp brain beats random play over many games', () => {
    let wins = 0;
    const games = 20;
    for (let g = 0; g < games; g++) {
      const r = rng(g + 100);
      let b = newBoard();
      let side: Side = (g % 2) as Side;
      for (let guard = 0; guard < 400; guard++) {
        const holes = validHoles(b, side);
        if (holes.length === 0) break;
        const pit = side === 0 ? chooseHole(b, 0, 0.9, r) : holes[Math.floor(r() * holes.length)]!;
        const t = sow(b, side, pit);
        b = t.after;
        if (t.outcome !== 'store') side = side === 0 ? 1 : 0;
      }
      if (b[storeOf(0)]! > b[storeOf(1)]!) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(15);
  });

  it('plugs into the match: a side with nobody connected uses the given brain and delay', () => {
    const picks: number[] = [];
    const m = new CongklakMatch({
      rounds: 1,
      roster: [
        { id: 1, connected: false },
        { id: 2, connected: true },
      ],
      now: 0,
      autoChoose: (b, side) => {
        const pos = chooseHole(b, side, 0.6, rng(1));
        picks.push(pos);
        return pos;
      },
      autoDelay: () => 2000,
    });
    m.tick(INTRO_MS);
    expect(m.current).toBeNull();
    expect(m.deadline).toBe(INTRO_MS + 2000);
    m.tick(INTRO_MS + 2000);
    expect(picks.length).toBe(1);
    expect(m.move?.trace.pit).toBe(picks[0]);
    expect(m.move?.auto).toBe(true);
    expect(holeNumber(picks[0]!)).toBeGreaterThanOrEqual(1);
  });
});
