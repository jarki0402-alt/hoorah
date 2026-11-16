import { describe, expect, it } from 'vitest';
import { legalMoves, makeMove, parseFen, START_FEN, statusOf, uci } from './chess';
import { chooseMove, evaluate, levelFor, MATE } from './engine';

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('catur engine', () => {
  it('maps skill onto search depth: about 1 ply gentle, 3 plies sharp', () => {
    expect(levelFor(0.05).depth).toBe(1);
    expect(levelFor(0.5).depth).toBe(2);
    expect(levelFor(0.95).depth).toBe(3);
    expect(levelFor(0.95).margin).toBeLessThan(levelFor(0.05).margin);
  });

  it('evaluates the start position as level and material from the mover side', () => {
    expect(evaluate(parseFen(START_FEN))).toBe(0);
    // White is a queen up; black to move sees it as bad.
    const pos = parseFen('rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1');
    expect(evaluate(pos)).toBeLessThan(-800);
  });

  it('finds mate in one at every skill', () => {
    const cases = [
      // Back-rank mate: Ra8#.
      { fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', mate: 'a1a8' },
      // Scholar's mate: Qxf7#.
      { fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4', mate: 'f3f7' },
      // Black to move: Qh4# after f3 g4.
      { fen: 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2', mate: 'd8h4' },
    ];
    for (const c of cases) {
      for (const skill of [0.05, 0.5, 0.95]) {
        for (let seed = 1; seed <= 3; seed++) {
          const res = chooseMove(parseFen(c.fen), { skill, rnd: rng(seed) });
          expect(uci(res.move)).toBe(c.mate);
          const after = makeMove(parseFen(c.fen), res.move);
          expect(statusOf(after)).toBe('checkmate');
        }
      }
    }
  });

  it('takes a hanging queen at high skill', () => {
    // Black queen on d4 hangs to the knight on f3 (nothing defends it).
    const fen = 'rnb1kbnr/pppp1ppp/8/4p3/3q4/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 3';
    for (let seed = 1; seed <= 10; seed++) {
      const res = chooseMove(parseFen(fen), { skill: 0.95, rnd: rng(seed) });
      expect(uci(res.move)).toBe('f3d4');
    }
  });

  it('scores a forced mate above everything', () => {
    const res = chooseMove(parseFen('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1'), { skill: 0.9, rnd: rng(3) });
    expect(res.ranked[0]!.score).toBeGreaterThan(MATE - 100);
  });

  it('always returns a legal move, through whole self-play games', () => {
    for (let g = 0; g < 3; g++) {
      const r = rng(g + 11);
      let pos = parseFen(START_FEN);
      for (let ply = 0; ply < 40; ply++) {
        const moves = legalMoves(pos);
        if (statusOf(pos, moves) !== 'play') break;
        const skill = ply % 2 === 0 ? 0.1 + 0.4 * g : 0.9;
        const res = chooseMove(pos, { skill, rnd: r, maxMs: 40 });
        expect(moves.map(uci)).toContain(uci(res.move));
        pos = makeMove(pos, res.move);
      }
    }
  });

  it('stops at the node budget and still answers', () => {
    const res = chooseMove(parseFen(START_FEN), { skill: 0.95, maxNodes: 50, rnd: rng(1) });
    expect(res.depth).toBe(1);
    expect(legalMoves(parseFen(START_FEN)).map(uci)).toContain(uci(res.move));
  });

  it('stays within the time budget in a busy middlegame', () => {
    const fen = 'r1bq1rk1/pp2bppp/2n1pn2/3p4/2PP4/2N1PN2/PP1B1PPP/R2QKB1R w KQ - 0 8';
    const t0 = performance.now();
    const res = chooseMove(parseFen(fen), { skill: 0.95, rnd: rng(2) });
    const ms = performance.now() - t0;
    // Budget 120 ms plus the always-finished first ply; generous for slow CI machines.
    expect(ms).toBeLessThan(400);
    expect(res.depth).toBeGreaterThanOrEqual(1);
  });

  it('treats a move into a third repetition as a draw', () => {
    // White is a queen up: repeating would throw the win away, so it plays something else.
    const fen = '4k3/8/8/8/8/8/8/Q3K3 w - - 0 1';
    const pos = parseFen(fen);
    const res = chooseMove(pos, {
      skill: 0.95,
      rnd: rng(4),
      repeats: (p) => (p.board[0] === 'Q' ? 2 : 0),
    });
    expect(uci(res.move)).not.toBe('a1a8');
  });
});
