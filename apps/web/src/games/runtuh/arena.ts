/**
 * Lantai Runtuh stage: a 7 x 5 grid of tiles on a night quiz stage, each with a colour, a symbol
 * and a number, plus the layout generators that guarantee the right answer always has enough
 * tiles (pure, seeded).
 */
import { shuffle } from '../../shared/kotak/math';
import type { SolidDef } from '../../shared/kotak/solids';

export const COLS = 7;
export const ROWS = 5;
export const TILE = 2;
export const TILE_GAP = 0.12;
export const TILES = COLS * ROWS;

export const COLOR_IDS = ['merah', 'biru', 'hijau', 'kuning'] as const;
export type ColorId = (typeof COLOR_IDS)[number];
export const COLOR_HEX: Record<ColorId, string> = {
  merah: '#F2453D',
  biru: '#2F8CFF',
  hijau: '#22B35E',
  kuning: '#FFC928',
};

export const SYMBOL_IDS = ['bintang', 'bulan', 'hati', 'segitiga'] as const;
export type SymbolId = (typeof SYMBOL_IDS)[number];

export interface TileFace {
  color: ColorId;
  symbol: SymbolId;
  /** 1..9 */
  number: number;
}

/** Centre of tile i on the ground plane (row 0 at the back, -z). */
export function tileCenter(i: number): { x: number; z: number } {
  const c = i % COLS;
  const r = Math.floor(i / COLS);
  return { x: (c - (COLS - 1) / 2) * TILE, z: (r - (ROWS - 1) / 2) * TILE };
}

export function tileAt(x: number, z: number): number {
  const c = Math.round(x / TILE + (COLS - 1) / 2);
  const r = Math.round(z / TILE + (ROWS - 1) / 2);
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return -1;
  return r * COLS + c;
}

export function colOf(i: number): number {
  return i % COLS;
}

export function rowOf(i: number): number {
  return Math.floor(i / COLS);
}

/** Solid definitions of the tiles (tag = tile index). */
export function tileSolids(): SolidDef[] {
  const half = TILE / 2 - TILE_GAP / 2;
  return Array.from({ length: TILES }, (_, i) => {
    const c = tileCenter(i);
    return { pos: { x: c.x, y: -0.3, z: c.z }, half: { x: half, y: 0.3, z: half }, role: 'tile', tag: i };
  });
}

/** Spread start spots for up to 8 players, one per tile, away from the edges. */
export function startTiles(n: number): number[] {
  const inner: number[] = [];
  for (let r = 1; r < ROWS - 1; r++) for (let c = 1; c < COLS - 1; c++) inner.push(r * COLS + c);
  // Interleave so a small group spreads out: every other tile first.
  const order = [...inner.filter((_, k) => k % 2 === 0), ...inner.filter((_, k) => k % 2 === 1)];
  return order.slice(0, Math.max(0, Math.min(n, order.length)));
}

/** Any face for every tile: colours balanced, symbols and numbers random. */
export function randomFaces(rnd: () => number): TileFace[] {
  const colors = shuffle(
    Array.from({ length: TILES }, (_, i) => COLOR_IDS[i % COLOR_IDS.length]!),
    rnd,
  );
  const symbols = shuffle(
    Array.from({ length: TILES }, (_, i) => SYMBOL_IDS[i % SYMBOL_IDS.length]!),
    rnd,
  );
  return colors.map((color, i) => ({ color, symbol: symbols[i]!, number: 1 + Math.floor(rnd() * 9) }));
}

/**
 * Pick `k` tiles spread over the stage (no more than two in a row touch), so the safe spots are
 * reachable from everywhere.
 */
export function spreadTiles(k: number, rnd: () => number): number[] {
  const all = shuffle(
    Array.from({ length: TILES }, (_, i) => i),
    rnd,
  );
  const picked: number[] = [];
  const near = (a: number, b: number) =>
    Math.abs(colOf(a) - colOf(b)) <= 1 && Math.abs(rowOf(a) - rowOf(b)) <= 1;
  for (const t of all) {
    if (picked.length >= k) break;
    if (picked.filter((p) => near(p, t)).length < 1) picked.push(t);
  }
  for (const t of all) {
    if (picked.length >= k) break;
    if (!picked.includes(t)) picked.push(t);
  }
  return picked;
}

/** Faces where exactly the tiles in `targets` carry `color` (the others never do). */
export function colorLayout(
  faces: TileFace[],
  color: ColorId,
  targets: number[],
  rnd: () => number,
): TileFace[] {
  const others = COLOR_IDS.filter((c) => c !== color);
  const set = new Set(targets);
  return faces.map((f, i) => ({
    ...f,
    color: set.has(i) ? color : others[Math.floor(rnd() * others.length)]!,
  }));
}

export function symbolLayout(
  faces: TileFace[],
  symbol: SymbolId,
  targets: number[],
  rnd: () => number,
): TileFace[] {
  const others = SYMBOL_IDS.filter((s) => s !== symbol);
  const set = new Set(targets);
  // Colours stay random on purpose: they tempt the eye away from the symbol.
  return faces.map((f, i) => ({
    ...f,
    color: COLOR_IDS[Math.floor(rnd() * COLOR_IDS.length)]!,
    symbol: set.has(i) ? symbol : others[Math.floor(rnd() * others.length)]!,
  }));
}

export function numberLayout(
  faces: TileFace[],
  answer: number,
  targets: number[],
  rnd: () => number,
): TileFace[] {
  const set = new Set(targets);
  return faces.map((f, i) => {
    if (set.has(i)) return { ...f, number: answer };
    let n = 1 + Math.floor(rnd() * 9);
    if (n === answer) n = (n % 9) + 1;
    return { ...f, number: n };
  });
}

export interface Sum {
  a: number;
  b: number;
  op: '+' | '-';
  answer: number;
}

/** A sum for call `k` (0-based): additions first, then a subtraction; answers 2..9. */
export function makeSum(k: number, rnd: () => number): Sum {
  if (k >= 2) {
    const answer = 2 + Math.floor(rnd() * 6);
    const b = 1 + Math.floor(rnd() * (9 - answer));
    return { a: answer + b, b, op: '-', answer };
  }
  const answer = 3 + Math.floor(rnd() * 7);
  const a = 1 + Math.floor(rnd() * (answer - 1));
  return { a, b: answer - a, op: '+', answer };
}
