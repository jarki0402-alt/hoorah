/**
 * A player's avatar (owner 2026-11-24, replaces the fruit as the face of a player): one of the 24
 * cast characters, optionally with another skin tone, another character's hair, a hair colour and
 * an outfit colour from fixed palettes (the colours themselves live in the web app). Left-out
 * fields keep the character's own design. The fruit stays only for the 3D racers (Bajaj Rush,
 * Lari Terus), handed out by the server per seat.
 */
import { FRUITS, type Fruit } from './constants';

export const PERSON_IDS = [
  'leo',
  'nara',
  'mia',
  'bima',
  'kai',
  'zara',
  'rio',
  'ayu',
  'opa',
  'dino',
  'lala',
  'bayu',
  'sinta',
  'arka',
  'oma',
  'gilang',
  'putri',
  'tara',
  'juna',
  'kiki',
  'doni',
  'lili',
  'sasa',
  'bram',
] as const;
export type PersonId = (typeof PERSON_IDS)[number];

export const SKIN_TONES = 5;
export const HAIR_COLORS = 8;
export const OUTFIT_COLORS = 8;

export interface Look {
  /** The character. */
  c: PersonId;
  /** Skin tone 1-5 (light to dark). */
  s?: number;
  /** Hair style, taken from this character. */
  h?: PersonId;
  /** Hair colour, index into the hair palette. */
  hc?: number;
  /** Outfit colour, index into the outfit palette. */
  oc?: number;
}

const PERSON_SET: ReadonlySet<string> = new Set(PERSON_IDS);

export function isPersonId(v: unknown): v is PersonId {
  return typeof v === 'string' && PERSON_SET.has(v);
}

const isIndex = (v: unknown, below: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < below;

/** A clean copy of a look from untrusted input, or null. Unknown keys are dropped. */
export function parseLook(v: unknown): Look | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (!isPersonId(o.c)) return null;
  const out: Look = { c: o.c };
  if (o.s !== undefined) {
    if (!isIndex(o.s, SKIN_TONES + 1) || o.s === 0) return null;
    out.s = o.s;
  }
  if (o.h !== undefined) {
    if (!isPersonId(o.h)) return null;
    if (o.h !== o.c) out.h = o.h;
  }
  if (o.hc !== undefined) {
    if (!isIndex(o.hc, HAIR_COLORS)) return null;
    out.hc = o.hc;
  }
  if (o.oc !== undefined) {
    if (!isIndex(o.oc, OUTFIT_COLORS)) return null;
    out.oc = o.oc;
  }
  return out;
}

/** The look of a computer player or an old phone that sent only a fruit: one character per fruit. */
export const FRUIT_PERSON: Record<Fruit, PersonId> = {
  semangka: 'leo',
  alpukat: 'nara',
  durian: 'bima',
  nanas: 'putri',
  jeruk: 'tara',
  stroberi: 'kiki',
  mangga: 'rio',
  rambutan: 'bayu',
};

export function lookOfFruit(fruit: Fruit): Look {
  return { c: FRUIT_PERSON[fruit] };
}

/** A different character for each index (computer players, tests). */
export function lookAt(i: number): Look {
  return { c: PERSON_IDS[((i % PERSON_IDS.length) + PERSON_IDS.length) % PERSON_IDS.length]! };
}

/** The first fruit nobody in `taken` has (a room hands them out per seat), cycling when all are used. */
export function freeFruit(taken: readonly Fruit[]): Fruit {
  for (const f of FRUITS) if (!taken.includes(f)) return f;
  return FRUITS[taken.length % FRUITS.length]!;
}

export function sameLook(a: Look, b: Look): boolean {
  return a.c === b.c && a.s === b.s && a.h === b.h && a.hc === b.hc && a.oc === b.oc;
}
