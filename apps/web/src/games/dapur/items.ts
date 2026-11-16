/**
 * What cooks carry in Dapur Heboh: raw, chopped, cooked and burnt food, plates with what is on
 * them, glasses (empty to full soda) and the extinguisher. Pure data and rules, no rendering.
 */

/** Food ids double as icon ids (see art.ts). `gosong` is any burnt food. */
export type Food =
  | 'roti'
  | 'daging'
  | 'dagingMatang'
  | 'tomat'
  | 'tomatPotong'
  | 'selada'
  | 'seladaPotong'
  | 'kentang'
  | 'kentangPotong'
  | 'kentangGoreng'
  | 'telur'
  | 'nasi'
  | 'nasiGoreng'
  | 'gosong';

export const FOODS: readonly Food[] = [
  'roti',
  'daging',
  'dagingMatang',
  'tomat',
  'tomatPotong',
  'selada',
  'seladaPotong',
  'kentang',
  'kentangPotong',
  'kentangGoreng',
  'telur',
  'nasi',
  'nasiGoreng',
  'gosong',
];

export type Item =
  /** `chop` (0..1) is how far a choppable food is cut; it stays with the food when picked up. */
  | { k: 'food'; food: Food; chop?: number }
  /** A clean plate and what is on it (no duplicates). */
  | { k: 'plate'; on: Food[] }
  /** 0 = empty glass, 1 = full soda. `over` = ms held past full (Heboh overfill). */
  | { k: 'glass'; fill: number; over?: number }
  | { k: 'extinguisher' };

export type ItemKind = Item['k'];

/** Raw food that a cutting board turns into its chopped form. */
export const CHOPS_TO: Partial<Record<Food, Food>> = {
  tomat: 'tomatPotong',
  selada: 'seladaPotong',
  kentang: 'kentangPotong',
};

/** Foods that may go on a plate. */
export const PLATEABLE: ReadonlySet<Food> = new Set<Food>([
  'roti',
  'dagingMatang',
  'tomatPotong',
  'seladaPotong',
  'kentangGoreng',
  'nasiGoreng',
]);

/** Every set of foods that makes a plated dish; partial plates must stay inside one of these. */
export const PLATE_SETS: readonly (readonly Food[])[] = [
  ['roti', 'dagingMatang', 'tomatPotong', 'seladaPotong'],
  ['tomatPotong', 'seladaPotong'],
  ['kentangGoreng'],
  ['nasiGoreng'],
];

/** Canonical plate order (bottom to top), so equal plates compare equal. */
const PLATE_ORDER: readonly Food[] = [
  'roti',
  'dagingMatang',
  'tomatPotong',
  'seladaPotong',
  'kentangGoreng',
  'nasiGoreng',
];

export const food = (f: Food): Item => ({ k: 'food', food: f });
export const plate = (on: Food[] = []): Item => ({ k: 'plate', on: sortPlate(on) });
export const glass = (fill = 0): Item => ({ k: 'glass', fill });

export function sortPlate(on: readonly Food[]): Food[] {
  return [...on].sort((a, b) => PLATE_ORDER.indexOf(a) - PLATE_ORDER.indexOf(b));
}

/** True when `f` can join a plate holding `on`: plateable, not there yet, still part of some dish. */
export function canAddToPlate(on: readonly Food[], f: Food): boolean {
  if (!PLATEABLE.has(f) || on.includes(f)) return false;
  const next = [...on, f];
  return PLATE_SETS.some((set) => next.every((x) => set.includes(x)));
}

/** Puts `f` on the plate in place. Returns false (and changes nothing) when it does not fit. */
export function addToPlate(p: Extract<Item, { k: 'plate' }>, f: Food): boolean {
  if (!canAddToPlate(p.on, f)) return false;
  p.on = sortPlate([...p.on, f]);
  return true;
}

export const isFull = (g: Extract<Item, { k: 'glass' }>): boolean => g.fill >= 1;

/** Short id used for labels and icons of any item (a plate shows its finished dish when it has one). */
export type ItemLook = Food | 'piring' | 'gelas' | 'soda' | 'pemadam' | 'burger' | 'salad' | 'piringIsi';

export function itemLook(item: Item): ItemLook {
  switch (item.k) {
    case 'food':
      return item.food;
    case 'glass':
      return isFull(item) ? 'soda' : 'gelas';
    case 'extinguisher':
      return 'pemadam';
    case 'plate': {
      const d = plateDish(item.on);
      if (d === 'burger') return 'burger';
      if (d === 'salad') return 'salad';
      if (d === 'kentang') return 'kentangGoreng';
      if (d === 'nasi') return 'nasiGoreng';
      return item.on.length ? 'piringIsi' : 'piring';
    }
  }
}

/** Plated dish ids (soda is served in a glass). */
export type PlateDish = 'burger' | 'salad' | 'kentang' | 'nasi';

/** The finished dish on a plate, or null while incomplete or empty. */
export function plateDish(on: readonly Food[]): PlateDish | null {
  const has = (...fs: Food[]) => fs.length === on.length && fs.every((f) => on.includes(f));
  if (has('roti', 'dagingMatang', 'tomatPotong', 'seladaPotong')) return 'burger';
  if (has('tomatPotong', 'seladaPotong')) return 'salad';
  if (has('kentangGoreng')) return 'kentang';
  if (has('nasiGoreng')) return 'nasi';
  return null;
}

/** Cosmetic stain left on an apron when this item hits someone with full hands. */
export type StainKind = 'tomat' | 'telur' | 'soda' | 'kuah';

export function stainOf(item: Item): StainKind {
  switch (item.k) {
    case 'glass':
      return 'soda';
    case 'extinguisher':
      return 'kuah';
    case 'plate': {
      if (item.on.includes('tomatPotong')) return 'tomat';
      return 'kuah';
    }
    case 'food':
      if (item.food === 'tomat' || item.food === 'tomatPotong') return 'tomat';
      if (item.food === 'telur') return 'telur';
      return 'kuah';
  }
}

/** Deep copy (items are mutable while held: chop progress, glass fill, plate contents). */
export function cloneItem(item: Item): Item {
  switch (item.k) {
    case 'food':
      return item.chop === undefined ? { k: 'food', food: item.food } : { ...item };
    case 'plate':
      return { k: 'plate', on: [...item.on] };
    case 'glass':
      return { ...item };
    case 'extinguisher':
      return { k: 'extinguisher' };
  }
}
