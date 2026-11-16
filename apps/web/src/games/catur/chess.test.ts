import { describe, expect, it } from 'vitest';
import {
  findMove,
  hasMatingMaterial,
  inCheck,
  insufficientMaterial,
  legalMoves,
  makeMove,
  type Position,
  parseFen,
  perft,
  positionKey,
  START_FEN,
  san,
  statusOf,
  toFen,
} from './chess';

function play(pos: Position, ...moves: string[]): Position {
  let p = pos;
  for (const text of moves) {
    const m = findMove(legalMoves(p), text);
    if (!m) throw new Error(`illegal ${text} in ${toFen(p)}`);
    p = makeMove(p, m);
  }
  return p;
}

const sans = (fen: string) => {
  const pos = parseFen(fen);
  const moves = legalMoves(pos);
  return moves.map((m) => san(pos, m, moves));
};

describe('FEN', () => {
  it('round-trips', () => {
    for (const fen of [
      START_FEN,
      'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
      'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2',
      '8/8/8/8/8/8/8/K6k b - - 37 80',
    ]) {
      expect(toFen(parseFen(fen))).toBe(fen);
    }
  });

  it('rejects broken placements', () => {
    expect(() => parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP w')).toThrow();
    expect(() => parseFen('rnbqkbnr/ppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w')).toThrow();
    expect(() => parseFen('rnbqkbnr/ppppxppp/8/8/8/8/PPPPPPPP/RNBQKBNR w')).toThrow();
  });

  it('tracks the move counters', () => {
    const p = play(parseFen(START_FEN), 'g1f3', 'g8f6', 'f3g1');
    expect(toFen(p)).toBe('rnbqkb1r/pppppppp/5n2/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 3 2');
    const q = play(p, 'e7e5');
    expect(toFen(q)).toBe('rnbqkb1r/pppp1ppp/5n2/4p3/8/8/PPPPPPPP/RNBQKBNR w KQkq e6 0 3');
  });
});

describe('perft (move generator correctness)', () => {
  it('start position to depth 4', () => {
    const pos = parseFen(START_FEN);
    expect(perft(pos, 1)).toBe(20);
    expect(perft(pos, 2)).toBe(400);
    expect(perft(pos, 3)).toBe(8902);
    expect(perft(pos, 4)).toBe(197281);
  });

  it('"Kiwipete": castling, pins, en passant, promotions', () => {
    const pos = parseFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
    expect(perft(pos, 1)).toBe(48);
    expect(perft(pos, 2)).toBe(2039);
    expect(perft(pos, 3)).toBe(97862);
  });

  it('endgame with en passant discovered checks (position 3)', () => {
    const pos = parseFen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
    expect(perft(pos, 1)).toBe(14);
    expect(perft(pos, 2)).toBe(191);
    expect(perft(pos, 3)).toBe(2812);
    expect(perft(pos, 4)).toBe(43238);
  });

  it('promotions and checks (positions 4 and 5)', () => {
    const p4 = parseFen('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1');
    expect(perft(p4, 1)).toBe(6);
    expect(perft(p4, 2)).toBe(264);
    expect(perft(p4, 3)).toBe(9467);
    const p5 = parseFen('rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8');
    expect(perft(p5, 1)).toBe(44);
    expect(perft(p5, 2)).toBe(1486);
    expect(perft(p5, 3)).toBe(62379);
  });
});

describe('special moves', () => {
  it('castles both ways and moves the rook', () => {
    const pos = parseFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const k = play(pos, 'e1g1');
    expect(toFen(k)).toBe('r3k2r/8/8/8/8/8/8/R4RK1 b kq - 1 1');
    const q = play(k, 'e8c8');
    expect(toFen(q)).toBe('2kr3r/8/8/8/8/8/8/R4RK1 w - - 2 2');
  });

  it('never castles out of, through or into check', () => {
    // Black rook on f8 covers f1: no short castling. Long castling stays legal.
    const through = parseFen('5r2/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    const t = legalMoves(through).map((m) => san(through, m));
    expect(t).not.toContain('O-O');
    expect(t).toContain('O-O-O');
    // Rook on g8 covers g1 (the landing square).
    const into = parseFen('6r1/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    expect(legalMoves(into).map((m) => san(into, m))).not.toContain('O-O');
    // In check: neither side.
    const out = parseFen('4r3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    const o = legalMoves(out).map((m) => san(out, m));
    expect(o).not.toContain('O-O');
    expect(o).not.toContain('O-O-O');
    // b1 attacked does not stop long castling (the king never crosses b1).
    const b1 = parseFen('1r6/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    expect(legalMoves(b1).map((m) => san(b1, m))).toContain('O-O-O');
  });

  it('loses castling rights when king or rook moves or the rook is captured', () => {
    const pos = parseFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    expect(toFen(play(pos, 'h1h2')).split(' ')[2]).toBe('Qkq');
    expect(toFen(play(pos, 'e1e2')).split(' ')[2]).toBe('kq');
    expect(toFen(play(pos, 'a1a8')).split(' ')[2]).toBe('Kk');
  });

  it('captures en passant only right after the double step', () => {
    const pos = play(parseFen(START_FEN), 'e2e4', 'a7a6', 'e4e5', 'd7d5');
    const ep = findMove(legalMoves(pos), 'e5d6');
    expect(ep).not.toBeNull();
    const after = makeMove(pos, ep!);
    expect(toFen(after)).toBe('rnbqkbnr/1pp1pppp/p2P4/8/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 3');
    const late = play(pos, 'b1c3', 'a6a5');
    expect(findMove(legalMoves(late), 'e5d6')).toBeNull();
  });

  it('refuses an en passant capture that exposes the king', () => {
    const pos = parseFen('8/8/8/K2pP2r/8/8/8/7k w - d6 0 1');
    expect(findMove(legalMoves(pos), 'e5d6')).toBeNull();
  });

  it('promotes to any of four pieces', () => {
    const pos = parseFen('8/P6k/8/8/8/8/8/K7 w - - 0 1');
    const promos = legalMoves(pos).filter((m) => m.promo);
    expect(promos.map((m) => m.promo).sort()).toEqual(['b', 'n', 'q', 'r']);
    expect(toFen(play(pos, 'a7a8n'))).toBe('N7/7k/8/8/8/8/8/K7 b - - 0 1');
    expect(findMove(legalMoves(pos), 'a7a8')).toBeNull();
  });
});

describe('SAN', () => {
  it('writes captures, checks, mates, castling and promotions', () => {
    expect(sans(START_FEN)).toContain('Nf3');
    const mate = parseFen('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2');
    const m = findMove(legalMoves(mate), 'd8h4')!;
    expect(san(mate, m)).toBe('Qh4#');
    expect(sans('4k3/P7/8/8/8/8/8/4K3 w - - 0 1')).toContain('a8=Q+');
    expect(sans('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')).toEqual(expect.arrayContaining(['O-O', 'O-O-O']));
  });

  it('disambiguates by file, rank or square', () => {
    const files = sans('4k3/8/8/8/8/8/K7/R6R w - - 0 1');
    expect(files).toEqual(expect.arrayContaining(['Rad1', 'Rhd1']));
    const ranks = sans('4k3/R7/8/8/8/8/8/R3K3 w - - 0 1');
    expect(ranks).toEqual(expect.arrayContaining(['R1a4', 'R7a4']));
    const square = sans('1k6/8/8/8/4Q2Q/8/8/K6Q w - - 0 1');
    expect(square).toContain('Qh4e1');
  });
});

describe('game status', () => {
  it("detects fool's mate", () => {
    const pos = play(parseFen(START_FEN), 'f2f3', 'e7e5', 'g2g4', 'd8h4');
    expect(inCheck(pos)).toBe(true);
    expect(statusOf(pos)).toBe('checkmate');
  });

  it('detects stalemate', () => {
    const pos = parseFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    expect(statusOf(pos)).toBe('stalemate');
  });

  it('detects insufficient material', () => {
    expect(insufficientMaterial(parseFen('8/8/8/4k3/8/8/8/4K3 w - - 0 1'))).toBe(true);
    expect(insufficientMaterial(parseFen('8/8/8/4k3/8/8/8/4KN2 w - - 0 1'))).toBe(true);
    expect(insufficientMaterial(parseFen('8/8/8/4k3/8/8/8/4KB2 w - - 0 1'))).toBe(true);
    // Bishops on the same square colour (f1 and c8 are both light).
    expect(insufficientMaterial(parseFen('2b5/8/8/4k3/8/8/8/4KB2 w - - 0 1'))).toBe(true);
    expect(insufficientMaterial(parseFen('1b6/8/8/4k3/8/8/8/4KB2 w - - 0 1'))).toBe(false);
    expect(insufficientMaterial(parseFen('8/8/8/4k3/8/8/8/3NKN2 w - - 0 1'))).toBe(false);
    expect(insufficientMaterial(parseFen('8/8/8/4k3/8/8/4P3/4K3 w - - 0 1'))).toBe(false);
    expect(statusOf(parseFen('8/8/8/4k3/8/8/8/4K3 w - - 0 1'))).toBe('insufficient');
  });

  it('knows who can still mate (for time-outs)', () => {
    const bare = parseFen('8/8/8/4k3/8/8/8/4KN2 w - - 0 1');
    expect(hasMatingMaterial(bare, 'w')).toBe(false);
    expect(hasMatingMaterial(bare, 'b')).toBe(false);
    // Knight against king and pawn: a mate is possible (the pawn can block).
    const blocker = parseFen('8/8/8/4k3/4p3/8/8/4KN2 w - - 0 1');
    expect(hasMatingMaterial(blocker, 'w')).toBe(true);
    expect(hasMatingMaterial(blocker, 'b')).toBe(true);
    expect(hasMatingMaterial(parseFen('8/8/8/4k3/8/8/8/4KR2 w - - 0 1'), 'w')).toBe(true);
  });

  it('applies the 50-move rule', () => {
    expect(statusOf(parseFen('8/8/8/4k3/8/8/4R3/4K3 w - - 100 80'))).toBe('fifty');
    expect(statusOf(parseFen('8/8/8/4k3/8/8/4R3/4K3 w - - 99 80'))).toBe('play');
  });

  it('keys positions for repetition, ignoring a useless en passant square', () => {
    const a = play(parseFen(START_FEN), 'e2e4');
    // e3 is not capturable by any black pawn: same key as without the ep square.
    expect(positionKey(a)).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -');
    const b = play(parseFen(START_FEN), 'e2e4', 'a7a6', 'e4e5', 'd7d5');
    expect(positionKey(b).endsWith(' d6')).toBe(true);
  });
});
