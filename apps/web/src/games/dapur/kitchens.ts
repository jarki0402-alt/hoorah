/**
 * The four kitchens as data (a 14x7 tile grid each) plus the difficulty tuning. Tile (0,0) is the
 * back-left counter; rows grow toward the viewer. Everything here is pure.
 *
 * Grid legend:
 *   .  floor          #  counter         |  divider wall      ~  street between carts
 *   R  roti basket    D  daging basket   T  tomat basket      S  selada basket
 *   K  kentang basket E  telur basket    N  nasi basket
 *   F  stove          G  fryer           W  wok               B  cutting board
 *   C  sink           P  plate rack      U  glass rack        M  soda machine
 *   X  trash          L  pass (two tiles wide)                Z  counter with the extinguisher
 */
import type { Food } from './items';
import type { DishId } from './recipes';

export const COLS = 14;
export const ROWS = 7;

export type KitchenId = 'warung' | 'terbelah' | 'gerobak' | 'sibuk';
export const KITCHENS: readonly KitchenId[] = ['warung', 'terbelah', 'gerobak', 'sibuk'];

export type Difficulty = 'santai' | 'normal' | 'heboh';
export const DIFFICULTIES: readonly Difficulty[] = ['santai', 'normal', 'heboh'];

export type StationKind =
  | 'counter'
  | 'basket'
  | 'stove'
  | 'fryer'
  | 'wok'
  | 'board'
  | 'sink'
  | 'rack'
  | 'cups'
  | 'soda'
  | 'trash'
  | 'pass';

/** 0 = Sisi Persiapan (left), 1 = Sisi Masak (right). */
export type Side = 0 | 1;

export interface StationMove {
  /** Fraction of the round when the swap happens. */
  atFrac: number;
  /** Tile pairs whose stations trade places (contents travel with them). */
  swaps: readonly (readonly [readonly [number, number], readonly [number, number]])[];
}

export interface KitchenDef {
  id: KitchenId;
  /** Number on the setup card ("DAPUR 2"). */
  no: number;
  /** A wall down the middle: food must be thrown across. */
  split: boolean;
  /** Drawn as two food carts with a street between (Gerobak Kembar). */
  carts: boolean;
  grid: readonly string[];
  menu: readonly DishId[];
  /** The first ticket of the round (an easy one). */
  first: DishId;
  /** Gap between new tickets on Normal with two cooks (ms). */
  orderGapMs: number;
  /** Score for 1, 2 and 3 stars on Normal with two cooks. */
  stars: readonly [number, number, number];
  /** Clean plates in the rack at the start. */
  plates: number;
  /** Jam Sibuk: stations that move mid-round. */
  move?: StationMove;
}

export const KITCHEN_DEFS: Record<KitchenId, KitchenDef> = {
  warung: {
    id: 'warung',
    no: 1,
    split: false,
    carts: false,
    grid: [
      '#RDTSK#FFG#MU#',
      '#............#',
      'C............P',
      '#....####....#',
      'X............Z',
      '#............#',
      '#BB##B#LL#####',
    ],
    menu: ['salad', 'kentang', 'burger', 'soda'],
    first: 'salad',
    orderGapMs: 21_000,
    stars: [200, 420, 760],
    plates: 4,
  },
  terbelah: {
    id: 'terbelah',
    no: 2,
    split: true,
    carts: false,
    grid: [
      '#RDTSK||FFWGM#',
      'N.....||.....U',
      'C.....||.....P',
      'E.....||.....#',
      '#.....||.....Z',
      'X.....||.....X',
      '#BBB##||##LL##',
    ],
    menu: ['kentang', 'salad', 'burger', 'nasi', 'soda', 'paket'],
    first: 'kentang',
    orderGapMs: 22_000,
    stars: [250, 550, 1000],
    plates: 4,
  },
  gerobak: {
    id: 'gerobak',
    no: 3,
    split: true,
    carts: true,
    grid: [
      '#RDTS#~~#FFWM#',
      'K....#~~#....U',
      'C....#~~#....P',
      'E....B~~#....N',
      '#....B~~#....Z',
      'X....#~~#....X',
      '#B####~~#G#LL#',
    ],
    menu: ['salad', 'kentang', 'burger', 'soda', 'nasi', 'paket'],
    first: 'salad',
    orderGapMs: 22_000,
    stars: [250, 550, 1000],
    plates: 4,
  },
  sibuk: {
    id: 'sibuk',
    no: 4,
    split: true,
    carts: false,
    grid: [
      '#RDTSK||FFWG##',
      'N.....||.....U',
      'C.....||.....P',
      'E.....||.....Z',
      '#.....||.....#',
      'X.....||.....X',
      '#BB#B#||##LLM#',
    ],
    menu: ['burger', 'kentang', 'soda', 'salad', 'nasi', 'paket'],
    first: 'kentang',
    orderGapMs: 17_000,
    stars: [280, 600, 1050],
    plates: 5,
    move: {
      atFrac: 0.5,
      swaps: [
        [
          [8, 0],
          [8, 6],
        ],
        [
          [9, 0],
          [9, 6],
        ],
      ],
    },
  },
};

export interface Cell {
  kind: StationKind | 'floor' | 'wall';
  /** Basket contents. */
  source?: Food;
  /** Starts with the extinguisher on it. */
  extinguisher?: boolean;
}

const BASKETS: Record<string, Food> = {
  R: 'roti',
  D: 'daging',
  T: 'tomat',
  S: 'selada',
  K: 'kentang',
  E: 'telur',
  N: 'nasi',
};

const KINDS: Record<string, StationKind> = {
  '#': 'counter',
  F: 'stove',
  G: 'fryer',
  W: 'wok',
  B: 'board',
  C: 'sink',
  P: 'rack',
  U: 'cups',
  M: 'soda',
  X: 'trash',
  L: 'pass',
  Z: 'counter',
};

export function cellOf(ch: string): Cell {
  if (ch === '.') return { kind: 'floor' };
  if (ch === '|' || ch === '~') return { kind: 'wall' };
  const src = BASKETS[ch];
  if (src) return { kind: 'basket', source: src };
  const kind = KINDS[ch];
  if (!kind) throw new Error(`unknown kitchen tile "${ch}"`);
  return ch === 'Z' ? { kind, extinguisher: true } : { kind };
}

/** Which side a point (tile units) is on: left of the middle is Sisi Persiapan. */
export const sideOfX = (x: number): Side => (x < COLS / 2 ? 0 : 1);

/** Walkable floor centre for spawning the n-th cook of a side. */
export function spawnPoint(def: KitchenDef, side: Side, n: number): { x: number; y: number } {
  const free: { x: number; y: number }[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (def.grid[r]![c] !== '.') continue;
      if (sideOfX(c + 0.5) !== side) continue;
      free.push({ x: c + 0.5, y: r + 0.5 });
    }
  }
  // Start near the middle of the side's floor, spreading out.
  const cx = side === 0 ? 3.5 : 10.5;
  const cy = 3.5;
  free.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy) || a.x - b.x);
  return free[n % Math.max(1, free.length)] ?? { x: cx, y: cy };
}

/* ------------------------------------------------------------------ difficulty */

export interface Tuning {
  roundMs: number;
  /** Ticket patience multiplier. */
  waitMul: number;
  /** Gap between tickets multiplier (bigger = calmer). */
  gapMul: number;
  /** Time a finished dish can stay on the heat before it burns; null = never burns. */
  burnMs: number | null;
  /** Burnt food sets the station on fire. */
  fire: boolean;
  /** Thrown plates break and full glasses spill when they hit full hands. */
  breaks: boolean;
  /** A hit cook staggers and gets a stain (Santai never hits anyone). */
  hits: boolean;
  /** Throws pick the nearest empty-handed teammate, else land on a free counter. */
  safeThrows: boolean;
  /** Holding the soda tap past full spills the glass. */
  overfill: boolean;
  /** Gerobak Kembar: the street between the carts widens and narrows. */
  movingGap: boolean;
  missPenalty: number;
  /** Star thresholds multiplier. */
  starMul: number;
}

export const TUNING: Record<Difficulty, Tuning> = {
  santai: {
    roundMs: 180_000,
    waitMul: 1.4,
    gapMul: 1.25,
    burnMs: null,
    fire: false,
    breaks: false,
    hits: false,
    safeThrows: true,
    overfill: false,
    movingGap: false,
    missPenalty: 10,
    starMul: 0.8,
  },
  normal: {
    roundMs: 180_000,
    waitMul: 1,
    gapMul: 1,
    burnMs: 9_000,
    fire: false,
    breaks: true,
    hits: true,
    safeThrows: false,
    overfill: false,
    movingGap: false,
    missPenalty: 30,
    starMul: 1,
  },
  heboh: {
    roundMs: 180_000,
    waitMul: 0.85,
    gapMul: 0.85,
    burnMs: 7_000,
    fire: true,
    breaks: true,
    hits: true,
    safeThrows: false,
    overfill: true,
    movingGap: true,
    missPenalty: 45,
    starMul: 1.15,
  },
};

/** How much more a bigger crew can handle (orders come faster, stars cost more). */
export function crewFactor(cooks: number): number {
  const table = [0.75, 0.75, 1, 1.2, 1.35, 1.45, 1.5];
  return table[Math.max(0, Math.min(table.length - 1, Math.floor(cooks)))] ?? 1.5;
}

export function starThresholds(def: KitchenDef, d: Difficulty, cooks: number): [number, number, number] {
  const k = TUNING[d].starMul * crewFactor(cooks);
  const r = (v: number) => Math.round((v * k) / 10) * 10;
  return [r(def.stars[0]), r(def.stars[1]), r(def.stars[2])];
}

export function starsFor(score: number, th: readonly [number, number, number]): 0 | 1 | 2 | 3 {
  return score >= th[2] ? 3 : score >= th[1] ? 2 : score >= th[0] ? 1 : 0;
}

/**
 * Gerobak Kembar on Heboh: extra width of the street between the carts (tile units, 0..1.2),
 * a slow back-and-forth so throws visibly get longer and shorter.
 */
export function cartGap(def: KitchenDef, d: Difficulty, t: number): number {
  if (!def.carts || !TUNING[d].movingGap) return 0;
  const period = 16_000;
  return 0.6 - 0.6 * Math.cos((2 * Math.PI * Math.max(0, t)) / period);
}

/** The kitchen suggested on the setup screen. */
export function recommended(humans: number): KitchenId {
  return humans >= 2 ? 'terbelah' : 'warung';
}

/* ------------------------------------------------------------------ timings (ms) */

export const COOK_MS = { stove: 7_000, fryer: 6_000, wok: 7_000 } as const;
/** Last part of the burn window: red ring, smoke, "Hampir gosong!". */
export const WARN_MS = 3_500;
export const CHOP_MS = 1_600;
export const WASH_MS = 1_500;
export const CLEAN_MS = 900;
export const FILL_MS = 1_800;
export const OVERFILL_MS = 700;
export const DOUSE_MS = 1_200;
export const PLATE_RETURN_MS = 7_000;
export const STAGGER_MS = 500;
export const THROW_MS = 600;
export const COUNTDOWN_MS = 3_000;
export const OVER_MS = 9_000;
export const WARNING_LEFT_MS = 30_000;
/** Jam Sibuk: the move is announced this long before it happens. */
export const MOVE_WARN_MS = 6_000;
