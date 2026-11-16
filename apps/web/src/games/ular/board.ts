/**
 * Ular Tangga boards: the hand-made layouts for both sizes and the shared geometry (cell
 * centres, ladder lines, snake curves) used by the board art and the token animation alike.
 * Everything is in cell units: x to the right, y down, the board's top-left corner at (0, 0).
 */

export type BoardSize = 50 | 100;
export type JumpKind = 'ladder' | 'snake';

export interface Jump {
  from: number;
  to: number;
  kind: JumpKind;
}

export interface Board {
  size: BoardSize;
  cols: number;
  rows: number;
  ladders: readonly Jump[];
  snakes: readonly Jump[];
  /** Kotak kejutan: landing here with the dice draws an event card. */
  surprises: readonly number[];
  jumpAt: ReadonlyMap<number, Jump>;
}

export const COLS = 10;

interface LayoutDef {
  ladders: [number, number][];
  snakes: [number, number][];
  surprises: number[];
}

/**
 * Hand-made layouts. Rules they follow (checked by the tests): no endpoint is shared, no ladder
 * starts on square 1, no snake sits on the last square, ladders climb and snakes fall at least one
 * row, and the snake/ladder balance keeps an average game near the catalog duration.
 */
const LAYOUTS: Record<BoardSize, LayoutDef> = {
  50: {
    ladders: [
      [3, 23],
      [9, 29],
      [20, 40],
      [25, 36],
      [35, 46],
    ],
    snakes: [
      [16, 5],
      [27, 7],
      [38, 22],
      [47, 28],
      [49, 30],
    ],
    surprises: [6, 13, 18, 33, 43],
  },
  100: {
    ladders: [
      [2, 23],
      [8, 34],
      [32, 51],
      [41, 80],
      [45, 64],
      [56, 76],
      [68, 87],
      [71, 91],
    ],
    snakes: [
      [17, 4],
      [29, 11],
      [46, 35],
      [53, 33],
      [62, 43],
      [86, 75],
      [93, 72],
      [99, 78],
    ],
    surprises: [12, 27, 38, 44, 59, 70, 83, 89],
  },
};

export function parseSize(v: unknown): BoardSize {
  return Number(v) === 100 ? 100 : 50;
}

const cache = new Map<BoardSize, Board>();

export function makeBoard(size: BoardSize): Board {
  const hit = cache.get(size);
  if (hit) return hit;
  const def = LAYOUTS[size];
  const ladders = def.ladders.map(([from, to]): Jump => ({ from, to, kind: 'ladder' }));
  const snakes = def.snakes.map(([from, to]): Jump => ({ from, to, kind: 'snake' }));
  const jumpAt = new Map<number, Jump>();
  for (const j of [...ladders, ...snakes]) jumpAt.set(j.from, j);
  const board: Board = {
    size,
    cols: COLS,
    rows: size / COLS,
    ladders,
    snakes,
    surprises: def.surprises,
    jumpAt,
  };
  cache.set(size, board);
  return board;
}

/** Column and row of a square; row 0 is the bottom row, rows alternate direction. */
export function squareCell(n: number, cols = COLS): { col: number; row: number } {
  const i = Math.max(0, n - 1);
  const row = Math.floor(i / cols);
  const k = i % cols;
  return { col: row % 2 === 0 ? k : cols - 1 - k, row };
}

export interface Pt {
  x: number;
  y: number;
}

/** Centre of a square in cell units. */
export function cellCenter(board: Board, n: number): Pt {
  const { col, row } = squareCell(n, board.cols);
  return { x: col + 0.5, y: board.rows - 1 - row + 0.5 };
}

/** Distance in cells between two squares' centres (drives slide and climb durations). */
export function cellDistance(board: Board, a: number, b: number): number {
  const p = cellCenter(board, a);
  const q = cellCenter(board, b);
  return Math.hypot(q.x - p.x, q.y - p.y);
}

/** Half-waves of a snake's body: more wiggles on longer snakes. */
function snakeWaves(len: number): number {
  return Math.max(2, Math.round(len / 1.15));
}

/**
 * A point on a snake's body: t = 0 at the head (top square), t = 1 at the tail. The body waves
 * sideways around the straight line and meets both square centres exactly.
 */
export function snakePoint(board: Board, s: Jump, t: number): Pt {
  const h = cellCenter(board, s.from);
  const e = cellCenter(board, s.to);
  const dx = e.x - h.x;
  const dy = e.y - h.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const amp = Math.min(0.42, 0.2 + len * 0.025) * (s.from % 2 === 0 ? 1 : -1);
  const off = amp * Math.sin(Math.PI * snakeWaves(len) * t);
  return { x: h.x + dx * t + nx * off, y: h.y + dy * t + ny * off };
}

/** A point on a ladder: t = 0 at the foot (bottom square), t = 1 at the top. */
export function ladderPoint(board: Board, l: Jump, t: number): Pt {
  const a = cellCenter(board, l.from);
  const b = cellCenter(board, l.to);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Where along a jump a token is at progress t (0..1). */
export function jumpPoint(board: Board, j: Jump, t: number): Pt {
  return j.kind === 'snake' ? snakePoint(board, j, t) : ladderPoint(board, j, t);
}

/**
 * Offsets (cell units) for tokens sharing a square, so everyone stays visible. Index i of n.
 */
export function crowdOffset(i: number, n: number): Pt {
  if (n <= 1) return { x: 0, y: 0 };
  if (n === 2) return { x: i === 0 ? -0.2 : 0.2, y: i === 0 ? -0.06 : 0.06 };
  if (n === 3) {
    const pts: Pt[] = [
      { x: -0.2, y: 0.14 },
      { x: 0.2, y: 0.14 },
      { x: 0, y: -0.16 },
    ];
    return pts[i] ?? { x: 0, y: 0 };
  }
  const cols = n <= 4 ? 2 : 3;
  const c = i % cols;
  const r = Math.floor(i / cols);
  const sx = cols === 2 ? 0.4 : 0.29;
  return { x: (c - (cols - 1) / 2) * sx, y: (r - 0.5) * 0.4 };
}
