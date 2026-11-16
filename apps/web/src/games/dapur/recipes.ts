/**
 * The menu: what customers order, what each order needs at the pass, how much it scores and how
 * long the ticket waits. Pure data plus the matching rules used by the order book and the brain.
 */
import { type Food, type Item, isFull, type PlateDish, plateDish } from './items';

export type DishId = 'burger' | 'salad' | 'kentang' | 'nasi' | 'soda' | 'paket';

export const DISHES: readonly DishId[] = ['burger', 'salad', 'kentang', 'nasi', 'soda', 'paket'];

/** One thing to hand in at the pass: a plated dish or a full soda. */
export type Part = PlateDish | 'soda';

export interface Recipe {
  id: DishId;
  /** Hand-ins that complete the order (a paket needs a burger and a soda). */
  parts: readonly Part[];
  /** Points when completed, before the speed tip. */
  points: number;
  /** Ticket patience on Normal (ms). */
  waitMs: number;
  /** Ticket icon, and the small ingredient icons under it (design: Terbelah tickets). */
  icon: string;
  shows: readonly string[];
}

export const RECIPES: Record<DishId, Recipe> = {
  burger: {
    id: 'burger',
    parts: ['burger'],
    points: 120,
    waitMs: 80_000,
    icon: 'burger',
    shows: ['roti', 'dagingMatang', 'tomatPotong', 'seladaPotong'],
  },
  salad: {
    id: 'salad',
    parts: ['salad'],
    points: 60,
    waitMs: 55_000,
    icon: 'salad',
    shows: ['tomatPotong', 'seladaPotong'],
  },
  kentang: {
    id: 'kentang',
    parts: ['kentang'],
    points: 80,
    waitMs: 65_000,
    icon: 'kentangGoreng',
    shows: ['kentangPotong'],
  },
  nasi: {
    id: 'nasi',
    parts: ['nasi'],
    points: 100,
    waitMs: 70_000,
    icon: 'nasiGoreng',
    shows: ['nasi', 'telur'],
  },
  soda: { id: 'soda', parts: ['soda'], points: 40, waitMs: 45_000, icon: 'soda', shows: ['gelas'] },
  paket: {
    id: 'paket',
    parts: ['burger', 'soda'],
    points: 190,
    waitMs: 95_000,
    icon: 'paket',
    shows: ['roti', 'dagingMatang', 'tomatPotong', 'seladaPotong', 'soda'],
  },
};

/** What an item counts as at the pass, or null when it is not a finished hand-in. */
export function partOf(item: Item): Part | null {
  if (item.k === 'glass') return isFull(item) && (item.over ?? 0) === 0 ? 'soda' : null;
  if (item.k === 'plate') return plateDish(item.on);
  return null;
}

/**
 * Raw ingredients ("lines") a hand-in is made from. Used to tell which basket is worth opening:
 * a line is satisfied by its raw food or by anything made from it (chopped, cooked, plated).
 */
export type Line = 'roti' | 'daging' | 'tomat' | 'selada' | 'kentang' | 'nasi' | 'telur' | 'gelas' | 'piring';

export const PART_LINES: Record<Part, readonly Line[]> = {
  burger: ['roti', 'daging', 'tomat', 'selada', 'piring'],
  salad: ['tomat', 'selada', 'piring'],
  kentang: ['kentang', 'piring'],
  nasi: ['nasi', 'telur', 'piring'],
  soda: ['gelas'],
};

/** The lines a food belongs to (fried rice holds both rice and egg; burnt food holds none). */
export function linesOf(f: Food): readonly Line[] {
  switch (f) {
    case 'roti':
      return ['roti'];
    case 'daging':
    case 'dagingMatang':
      return ['daging'];
    case 'tomat':
    case 'tomatPotong':
      return ['tomat'];
    case 'selada':
    case 'seladaPotong':
      return ['selada'];
    case 'kentang':
    case 'kentangPotong':
    case 'kentangGoreng':
      return ['kentang'];
    case 'nasi':
      return ['nasi'];
    case 'telur':
      return ['telur'];
    case 'nasiGoreng':
      return ['nasi', 'telur'];
    case 'gosong':
      return [];
  }
}
