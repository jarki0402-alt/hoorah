/**
 * Piece sprites for the main screen: each piece keeps a stable id across moves so the renderer
 * can slide it from square to square instead of redrawing the board. Pure.
 */

export interface Sprite {
  id: number;
  /** FEN letter. */
  p: string;
  /** 0..63, a8 = 0, h1 = 63. */
  sq: number;
  /** Captured on the last move: drawn fading out, dropped on the next update. */
  gone?: boolean;
}

/** "e2" -> 52. */
export function index64(name: string): number {
  return (8 - Number(name[1])) * 8 + (name.charCodeAt(0) - 97);
}

export function spritesFrom(board: string, startId = 1): Sprite[] {
  const out: Sprite[] = [];
  let id = startId;
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq]!;
    if (p !== '.') out.push({ id: id++, p, sq });
  }
  return out;
}

/**
 * Moves the sprites to match `board` after `move` (UCI). The mover keeps its id (and slides);
 * castling slides the rook too; captured pieces (including en passant) are marked `gone`.
 * Anything still out of step (a desync) is fixed by adding or dropping sprites.
 */
export function reconcile(prev: Sprite[], board: string, move?: string): Sprite[] {
  let nextId = prev.reduce((m, s) => Math.max(m, s.id), 0) + 1;
  const live = prev.filter((s) => !s.gone).map((s) => ({ ...s }));
  const out: Sprite[] = [];
  if (move) {
    const from = index64(move.slice(0, 2));
    const to = index64(move.slice(2, 4));
    const mover = live.find((s) => s.sq === from);
    if (mover) {
      for (const s of live) if (s.sq === to && s !== mover) s.gone = true;
      mover.sq = to;
      // Castling: the king moved two files, bring the rook along.
      if (mover.p.toLowerCase() === 'k' && Math.abs(to - from) === 2) {
        const row = to - (to % 8);
        const rookFrom = to > from ? row + 7 : row;
        const rookTo = to > from ? to - 1 : to + 1;
        const rook = live.find((s) => s.sq === rookFrom && !s.gone);
        if (rook) rook.sq = rookTo;
      }
    }
  }
  const taken = new Set<number>();
  for (const s of live) {
    if (s.gone) {
      out.push(s);
      continue;
    }
    const want = board[s.sq];
    if (want === s.p || (want && want !== '.' && !taken.has(s.sq) && samePromotion(s, want, move))) {
      if (taken.has(s.sq)) {
        out.push({ ...s, gone: true });
        continue;
      }
      s.p = want!;
      taken.add(s.sq);
      out.push(s);
    } else {
      // En passant victim or desync: fade it out.
      out.push({ ...s, gone: true });
    }
  }
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq]!;
    if (p !== '.' && !taken.has(sq)) out.push({ id: nextId++, p, sq });
  }
  return out;
}

/** The pawn that just reached the last rank becomes the promoted piece (same id). */
function samePromotion(s: Sprite, want: string, move?: string): boolean {
  if (move?.length !== 5) return false;
  return s.p.toLowerCase() === 'p' && index64(move.slice(2, 4)) === s.sq && want.toLowerCase() === move[4];
}
