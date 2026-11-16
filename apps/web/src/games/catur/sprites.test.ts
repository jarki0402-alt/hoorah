import { describe, expect, it } from 'vitest';
import { boardString, findMove, legalMoves, makeMove, type Position, parseFen, START_FEN } from './chess';
import { index64, reconcile, type Sprite, spritesFrom } from './sprites';

function step(pos: Position, sprites: Sprite[], move: string): [Position, Sprite[]] {
  const m = findMove(legalMoves(pos), move);
  if (!m) throw new Error(move);
  const next = makeMove(pos, m);
  return [next, reconcile(sprites, boardString(next), move)];
}

const live = (s: Sprite[]) => s.filter((x) => !x.gone);
const at = (s: Sprite[], sq: string) => live(s).find((x) => x.sq === index64(sq));

describe('sprites', () => {
  it('keeps ids when pieces move and marks captures', () => {
    let pos = parseFen(START_FEN);
    let s = spritesFrom(boardString(pos));
    expect(s).toHaveLength(32);
    const e2 = at(s, 'e2')!.id;
    [pos, s] = step(pos, s, 'e2e4');
    expect(at(s, 'e4')!.id).toBe(e2);
    [pos, s] = step(pos, s, 'd7d5');
    const d5 = at(s, 'd5')!.id;
    [pos, s] = step(pos, s, 'e4d5');
    expect(at(s, 'd5')!.id).toBe(e2);
    expect(s.find((x) => x.id === d5)?.gone).toBe(true);
    expect(live(s)).toHaveLength(31);
    // The faded piece is dropped on the next move.
    [pos, s] = step(pos, s, 'g8f6');
    expect(s.find((x) => x.id === d5)).toBeUndefined();
  });

  it('slides the rook when castling', () => {
    let pos = parseFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    let s = spritesFrom(boardString(pos));
    const rook = at(s, 'h1')!.id;
    [pos, s] = step(pos, s, 'e1g1');
    expect(at(s, 'f1')!.id).toBe(rook);
    const qRook = at(s, 'a8')!.id;
    [pos, s] = step(pos, s, 'e8c8');
    expect(at(s, 'd8')!.id).toBe(qRook);
    expect(
      live(s)
        .map((x) => x.p)
        .sort()
        .join(''),
    ).toBe('KRRkrr'.split('').sort().join(''));
  });

  it('removes the en passant victim and promotes in place', () => {
    let pos = parseFen('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
    let s = spritesFrom(boardString(pos));
    const victim = at(s, 'd5')!.id;
    [pos, s] = step(pos, s, 'e5d6');
    expect(s.find((x) => x.id === victim)?.gone).toBe(true);
    expect(live(s)).toHaveLength(3);
    pos = parseFen('4k3/1P6/8/8/8/8/8/4K3 w - - 0 1');
    s = spritesFrom(boardString(pos));
    const pawn = at(s, 'b7')!.id;
    [pos, s] = step(pos, s, 'b7b8n');
    expect(at(s, 'b8')).toMatchObject({ id: pawn, p: 'N' });
  });

  it('repairs a desync from the board', () => {
    const s = reconcile(
      spritesFrom(boardString(parseFen(START_FEN))),
      boardString(parseFen('4k3/8/8/8/8/8/8/4K3 w - - 0 1')),
    );
    expect(
      live(s)
        .map((x) => x.p)
        .sort(),
    ).toEqual(['K', 'k']);
  });
});
