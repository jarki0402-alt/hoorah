/**
 * Chess rules engine: board, legal move generation (castling, en passant, promotion), check,
 * game-over detection, SAN and FEN. Pure and dependency-free.
 *
 * Squares use the 0x88 layout with row 0 = rank 8 (the FEN order): sq = row * 16 + file.
 * Pieces are FEN letters, upper case = white, lower case = black, '' = empty.
 */

export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const CASTLE_WK = 1;
const CASTLE_WQ = 2;
const CASTLE_BK = 4;
const CASTLE_BQ = 8;

export const FLAG_CAPTURE = 1;
export const FLAG_EP = 2;
export const FLAG_DOUBLE = 4;
export const FLAG_CASTLE_K = 8;
export const FLAG_CASTLE_Q = 16;
export const FLAG_PROMO = 32;

export interface Position {
  /** 128 cells (0x88); only cells with (sq & 0x88) === 0 are on the board. */
  board: string[];
  turn: Color;
  castling: number;
  /** En passant target square, or -1. */
  ep: number;
  halfmove: number;
  fullmove: number;
  kings: { w: number; b: number };
}

export interface Move {
  from: number;
  to: number;
  /** Moving piece (FEN letter). */
  piece: string;
  captured?: string;
  /** Promotion piece type ('q', 'r', 'b', 'n'). */
  promo?: PieceType;
  flags: number;
}

const KNIGHT = [-33, -31, -18, -14, 14, 18, 31, 33];
const KING = [-17, -16, -15, -1, 1, 15, 16, 17];
const DIAG = [-17, -15, 15, 17];
const ORTHO = [-16, -1, 1, 16];
const PROMOS: PieceType[] = ['q', 'r', 'b', 'n'];

/* ------------------------------------------------------------------ squares */

export const onBoard = (sq: number): boolean => (sq & 0x88) === 0;
export const fileOf = (sq: number): number => sq & 7;
/** 0 = rank 8 (top), 7 = rank 1. */
export const rowOf = (sq: number): number => sq >> 4;

export function sqName(sq: number): string {
  return 'abcdefgh'[fileOf(sq)]! + String(8 - rowOf(sq));
}

export function parseSq(name: string): number {
  if (!/^[a-h][1-8]$/.test(name)) return -1;
  return (8 - Number(name[1])) * 16 + (name.charCodeAt(0) - 97);
}

/** 0..63 in FEN order (a8 = 0, h1 = 63) to 0x88. */
export const from64 = (i: number): number => (i >> 3) * 16 + (i & 7);
export const to64 = (sq: number): number => rowOf(sq) * 8 + fileOf(sq);

export const colorOf = (p: string): Color => (p === p.toUpperCase() ? 'w' : 'b');
export const typeOf = (p: string): PieceType => p.toLowerCase() as PieceType;
const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

export { other as opposite };

/* ------------------------------------------------------------------ FEN */

export function parseFen(fen: string): Position {
  const parts = fen.trim().split(/\s+/);
  const [placement, turn = 'w', castle = '-', ep = '-', half = '0', full = '1'] = parts;
  if (!placement) throw new Error('bad fen');
  const board: string[] = new Array(128).fill('');
  const kings = { w: -1, b: -1 };
  const rows = placement.split('/');
  if (rows.length !== 8) throw new Error('bad fen');
  rows.forEach((row, r) => {
    let f = 0;
    for (const ch of row) {
      if (/[1-8]/.test(ch)) {
        f += Number(ch);
      } else if (/[pnbrqkPNBRQK]/.test(ch)) {
        const sq = r * 16 + f;
        board[sq] = ch;
        if (ch === 'K') kings.w = sq;
        if (ch === 'k') kings.b = sq;
        f++;
      } else {
        throw new Error('bad fen');
      }
    }
    if (f !== 8) throw new Error('bad fen');
  });
  let castling = 0;
  if (castle.includes('K')) castling |= CASTLE_WK;
  if (castle.includes('Q')) castling |= CASTLE_WQ;
  if (castle.includes('k')) castling |= CASTLE_BK;
  if (castle.includes('q')) castling |= CASTLE_BQ;
  return {
    board,
    turn: turn === 'b' ? 'b' : 'w',
    castling,
    ep: ep === '-' ? -1 : parseSq(ep),
    halfmove: Number(half) || 0,
    fullmove: Number(full) || 1,
    kings,
  };
}

/** The 64 squares a8..h1 as one string, '.' for empty. */
export function boardString(pos: Position): string {
  let s = '';
  for (let i = 0; i < 64; i++) s += pos.board[from64(i)] || '.';
  return s;
}

function placement(pos: Position): string {
  const rows: string[] = [];
  for (let r = 0; r < 8; r++) {
    let row = '';
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = pos.board[r * 16 + f];
      if (p) {
        if (empty) row += String(empty);
        empty = 0;
        row += p;
      } else {
        empty++;
      }
    }
    if (empty) row += String(empty);
    rows.push(row);
  }
  return rows.join('/');
}

function castleString(c: number): string {
  const s =
    (c & CASTLE_WK ? 'K' : '') +
    (c & CASTLE_WQ ? 'Q' : '') +
    (c & CASTLE_BK ? 'k' : '') +
    (c & CASTLE_BQ ? 'q' : '');
  return s || '-';
}

export function toFen(pos: Position): string {
  return [
    placement(pos),
    pos.turn,
    castleString(pos.castling),
    pos.ep >= 0 ? sqName(pos.ep) : '-',
    String(pos.halfmove),
    String(pos.fullmove),
  ].join(' ');
}

/**
 * Identity of a position for repetition: placement, side to move, castling rights, and the
 * en passant square only when a capture there is actually possible.
 */
export function positionKey(pos: Position): string {
  let ep = '-';
  if (pos.ep >= 0 && legalMoves(pos).some((m) => m.flags & FLAG_EP)) ep = sqName(pos.ep);
  return `${placement(pos)} ${pos.turn} ${castleString(pos.castling)} ${ep}`;
}

/* ------------------------------------------------------------------ attacks */

/** Is `sq` attacked by any piece of colour `by`? */
export function isAttacked(board: string[], sq: number, by: Color): boolean {
  // Pawns: a white pawn attacks up (towards row 0), so it sits below the square.
  if (by === 'w') {
    for (const d of [15, 17]) {
      const s = sq + d;
      if (onBoard(s) && board[s] === 'P') return true;
    }
  } else {
    for (const d of [-15, -17]) {
      const s = sq + d;
      if (onBoard(s) && board[s] === 'p') return true;
    }
  }
  const n = by === 'w' ? 'N' : 'n';
  for (const d of KNIGHT) {
    const s = sq + d;
    if (onBoard(s) && board[s] === n) return true;
  }
  const k = by === 'w' ? 'K' : 'k';
  for (const d of KING) {
    const s = sq + d;
    if (onBoard(s) && board[s] === k) return true;
  }
  const bq = by === 'w' ? 'BQ' : 'bq';
  for (const d of DIAG) {
    for (let s = sq + d; onBoard(s); s += d) {
      const p = board[s];
      if (!p) continue;
      if (p === bq[0] || p === bq[1]) return true;
      break;
    }
  }
  const rq = by === 'w' ? 'RQ' : 'rq';
  for (const d of ORTHO) {
    for (let s = sq + d; onBoard(s); s += d) {
      const p = board[s];
      if (!p) continue;
      if (p === rq[0] || p === rq[1]) return true;
      break;
    }
  }
  return false;
}

export function inCheck(pos: Position, color: Color = pos.turn): boolean {
  const k = pos.kings[color];
  return k >= 0 && isAttacked(pos.board, k, other(color));
}

/* ------------------------------------------------------------------ move generation */

function pseudoMoves(pos: Position): Move[] {
  const moves: Move[] = [];
  const { board, turn } = pos;
  const enemy = other(turn);
  const add = (from: number, to: number, flags: number, captured?: string) => {
    const piece = board[from]!;
    const m: Move = { from, to, piece, flags };
    if (captured) m.captured = captured;
    moves.push(m);
  };
  for (let from = 0; from < 128; from++) {
    if (!onBoard(from)) {
      from += 7;
      continue;
    }
    const p = board[from];
    if (!p || colorOf(p) !== turn) continue;
    const t = typeOf(p);
    if (t === 'p') {
      const dir = turn === 'w' ? -16 : 16;
      const startRow = turn === 'w' ? 6 : 1;
      const lastRow = turn === 'w' ? 0 : 7;
      const pushPawn = (to: number, flags: number, captured?: string) => {
        if (rowOf(to) === lastRow) {
          for (const promo of PROMOS) {
            const m: Move = { from, to, piece: p, flags: flags | FLAG_PROMO, promo };
            if (captured) m.captured = captured;
            moves.push(m);
          }
        } else {
          add(from, to, flags, captured);
        }
      };
      const one = from + dir;
      if (onBoard(one) && !board[one]) {
        pushPawn(one, 0);
        const two = one + dir;
        if (rowOf(from) === startRow && !board[two]) add(from, two, FLAG_DOUBLE);
      }
      for (const side of [-1, 1]) {
        const to = from + dir + side;
        if (!onBoard(to)) continue;
        const q = board[to];
        if (q && colorOf(q) === enemy) pushPawn(to, FLAG_CAPTURE, q);
        else if (to === pos.ep) add(from, to, FLAG_CAPTURE | FLAG_EP, turn === 'w' ? 'p' : 'P');
      }
      continue;
    }
    const steps = t === 'n' ? KNIGHT : t === 'k' ? KING : t === 'b' ? DIAG : t === 'r' ? ORTHO : KING;
    const slide = t === 'b' || t === 'r' || t === 'q';
    for (const d of steps) {
      for (let to = from + d; onBoard(to); to += d) {
        const q = board[to];
        if (q) {
          if (colorOf(q) === enemy) add(from, to, FLAG_CAPTURE, q);
          break;
        }
        add(from, to, 0);
        if (!slide) break;
      }
    }
    if (t === 'k') {
      const home = turn === 'w' ? 116 : 4; // e1 / e8
      if (from !== home) continue;
      const kRight = turn === 'w' ? CASTLE_WK : CASTLE_BK;
      const qRight = turn === 'w' ? CASTLE_WQ : CASTLE_BQ;
      const rook = turn === 'w' ? 'R' : 'r';
      if (isAttacked(board, from, enemy)) continue;
      if (
        pos.castling & kRight &&
        !board[from + 1] &&
        !board[from + 2] &&
        board[from + 3] === rook &&
        !isAttacked(board, from + 1, enemy) &&
        !isAttacked(board, from + 2, enemy)
      ) {
        add(from, from + 2, FLAG_CASTLE_K);
      }
      if (
        pos.castling & qRight &&
        !board[from - 1] &&
        !board[from - 2] &&
        !board[from - 3] &&
        board[from - 4] === rook &&
        !isAttacked(board, from - 1, enemy) &&
        !isAttacked(board, from - 2, enemy)
      ) {
        add(from, from - 2, FLAG_CASTLE_Q);
      }
    }
  }
  return moves;
}

/** Castling rights lost when a piece leaves or arrives on these squares. */
function rightsMask(sq: number): number {
  switch (sq) {
    case 116: // e1
      return CASTLE_WK | CASTLE_WQ;
    case 119: // h1
      return CASTLE_WK;
    case 112: // a1
      return CASTLE_WQ;
    case 4: // e8
      return CASTLE_BK | CASTLE_BQ;
    case 7: // h8
      return CASTLE_BK;
    case 0: // a8
      return CASTLE_BQ;
    default:
      return 0;
  }
}

/** Applies a move (assumed pseudo-legal) and returns the new position. */
export function makeMove(pos: Position, m: Move): Position {
  const board = pos.board.slice();
  const turn = pos.turn;
  const kings = { ...pos.kings };
  board[m.from] = '';
  let placed = m.piece;
  if (m.promo) placed = turn === 'w' ? m.promo.toUpperCase() : m.promo;
  board[m.to] = placed;
  if (m.flags & FLAG_EP) board[m.to + (turn === 'w' ? 16 : -16)] = '';
  if (m.flags & FLAG_CASTLE_K) {
    board[m.to - 1] = board[m.to + 1]!;
    board[m.to + 1] = '';
  } else if (m.flags & FLAG_CASTLE_Q) {
    board[m.to + 1] = board[m.to - 2]!;
    board[m.to - 2] = '';
  }
  if (typeOf(m.piece) === 'k') kings[turn] = m.to;
  const castling = pos.castling & ~rightsMask(m.from) & ~rightsMask(m.to);
  const ep = m.flags & FLAG_DOUBLE ? m.from + (turn === 'w' ? -16 : 16) : -1;
  const reset = typeOf(m.piece) === 'p' || m.captured !== undefined;
  return {
    board,
    turn: other(turn),
    castling,
    ep,
    halfmove: reset ? 0 : pos.halfmove + 1,
    fullmove: turn === 'b' ? pos.fullmove + 1 : pos.fullmove,
    kings,
  };
}

/** Moves that follow the piece rules but may leave the own king in check (engine search). */
export function pseudoLegalMoves(pos: Position): Move[] {
  return pseudoMoves(pos);
}

export function legalMoves(pos: Position): Move[] {
  const out: Move[] = [];
  for (const m of pseudoMoves(pos)) {
    const next = makeMove(pos, m);
    if (!inCheck(next, pos.turn)) out.push(m);
  }
  return out;
}

/** Leaf-node count to `depth`: the standard correctness check for move generators. */
export function perft(pos: Position, depth: number): number {
  if (depth === 0) return 1;
  const moves = legalMoves(pos);
  if (depth === 1) return moves.length;
  let n = 0;
  for (const m of moves) n += perft(makeMove(pos, m), depth - 1);
  return n;
}

/* ------------------------------------------------------------------ notation */

export function uci(m: Move): string {
  return sqName(m.from) + sqName(m.to) + (m.promo ?? '');
}

/** Finds the legal move matching a UCI string (e.g. "e2e4", "e7e8q"), or null. */
export function findMove(moves: Move[], text: string): Move | null {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(text)) return null;
  const from = parseSq(text.slice(0, 2));
  const to = parseSq(text.slice(2, 4));
  const promo = text[4] as PieceType | undefined;
  return moves.find((m) => m.from === from && m.to === to && m.promo === promo) ?? null;
}

/** Standard algebraic notation with English piece letters (K Q R B N), e.g. "Nxf7+", "O-O", "e8=Q#". */
export function san(pos: Position, m: Move, moves: Move[] = legalMoves(pos)): string {
  let s: string;
  if (m.flags & FLAG_CASTLE_K) s = 'O-O';
  else if (m.flags & FLAG_CASTLE_Q) s = 'O-O-O';
  else {
    const t = typeOf(m.piece);
    const capture = m.captured !== undefined;
    if (t === 'p') {
      s = capture ? `${'abcdefgh'[fileOf(m.from)]}x${sqName(m.to)}` : sqName(m.to);
      if (m.promo) s += `=${m.promo.toUpperCase()}`;
    } else {
      const rivals = moves.filter((o) => o.piece === m.piece && o.to === m.to && o.from !== m.from);
      let dis = '';
      if (rivals.length) {
        const sameFile = rivals.some((o) => fileOf(o.from) === fileOf(m.from));
        const sameRow = rivals.some((o) => rowOf(o.from) === rowOf(m.from));
        if (!sameFile) dis = 'abcdefgh'[fileOf(m.from)]!;
        else if (!sameRow) dis = String(8 - rowOf(m.from));
        else dis = sqName(m.from);
      }
      s = t.toUpperCase() + dis + (capture ? 'x' : '') + sqName(m.to);
    }
  }
  const next = makeMove(pos, m);
  if (inCheck(next)) s += legalMoves(next).length === 0 ? '#' : '+';
  return s;
}

/* ------------------------------------------------------------------ game state */

export type Status = 'play' | 'checkmate' | 'stalemate' | 'insufficient' | 'fifty';

function minorsAndOthers(pos: Position): { pieces: { t: PieceType; c: Color; sq: number }[] } {
  const pieces: { t: PieceType; c: Color; sq: number }[] = [];
  for (let sq = 0; sq < 128; sq++) {
    if (!onBoard(sq)) {
      sq += 7;
      continue;
    }
    const p = pos.board[sq];
    if (p && typeOf(p) !== 'k') pieces.push({ t: typeOf(p), c: colorOf(p), sq });
  }
  return { pieces };
}

const squareShade = (sq: number): number => (fileOf(sq) + rowOf(sq)) & 1;

/** Neither side can ever mate: K v K, K+minor v K, and bishops only, all on one square colour. */
export function insufficientMaterial(pos: Position): boolean {
  const { pieces } = minorsAndOthers(pos);
  if (pieces.length === 0) return true;
  if (pieces.length === 1) return pieces[0]!.t === 'n' || pieces[0]!.t === 'b';
  if (pieces.every((p) => p.t === 'b')) {
    const shade = squareShade(pieces[0]!.sq);
    return pieces.every((p) => squareShade(p.sq) === shade);
  }
  return false;
}

/**
 * Could `color` still mate at all? Used when the other side runs out of time: with no mating
 * material the game is drawn instead of lost. A lone minor piece can only mate when the
 * defender still has men of their own to block their king.
 */
export function hasMatingMaterial(pos: Position, color: Color): boolean {
  const { pieces } = minorsAndOthers(pos);
  const own = pieces.filter((p) => p.c === color);
  if (own.some((p) => p.t === 'p' || p.t === 'r' || p.t === 'q')) return true;
  if (own.length >= 2) {
    // Two bishops on the same colour cannot mate a bare king.
    const allBishops = own.every((p) => p.t === 'b');
    const oneShade = own.every((p) => squareShade(p.sq) === squareShade(own[0]!.sq));
    if (!(allBishops && oneShade)) return true;
  }
  if (own.length === 0) return false;
  return pieces.some((p) => p.c !== color);
}

/** Status of a position on its own (repetition needs the game history, see logic.ts). */
export function statusOf(pos: Position, moves: Move[] = legalMoves(pos)): Status {
  if (moves.length === 0) return inCheck(pos) ? 'checkmate' : 'stalemate';
  if (insufficientMaterial(pos)) return 'insufficient';
  if (pos.halfmove >= 100) return 'fifty';
  return 'play';
}
