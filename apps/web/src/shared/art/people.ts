/**
 * The Hoorah cast: 24 original flat characters drawn as SVG markup on a 200x222 grid (head and shoulders).
 * Pure string builders, no DOM. Each character has a head shape, hair, outfit, accessories and a signature
 * face; any of the 14 expressions can be asked for. Ported from the approved design (avatar v2, 2026-11-23).
 */

import { type Fruit, type Look, lookOfFruit, type PersonId } from '@hoorah/protocol';

export type { PersonId };

export type PersonFace =
  | 'happy'
  | 'grin'
  | 'smile'
  | 'wink'
  | 'laugh'
  | 'wow'
  | 'love'
  | 'cool'
  | 'tongue'
  | 'shy'
  | 'nervous'
  | 'sad'
  | 'cry'
  | 'angry'
  | 'sleepy'
  | 'win';

type Head = 'round' | 'oval' | 'wide' | 'squircle' | 'kid';
type Hair =
  | 'bob'
  | 'spiky'
  | 'pony'
  | 'afro'
  | 'beanie'
  | 'hijab'
  | 'cap'
  | 'wavy'
  | 'opa'
  | 'tuft'
  | 'twinbuns'
  | 'mohawk'
  | 'braids'
  | 'curtain'
  | 'grandbun'
  | 'buzz'
  | 'puff'
  | 'messybun'
  | 'curlyshort'
  | 'pigtails'
  | 'bald'
  | 'bowl'
  | 'turban'
  | 'manbun';
type Outfit =
  | 'turtle'
  | 'hoodie'
  | 'sport'
  | 'tee'
  | 'jacket'
  | 'dress'
  | 'cardigan'
  | 'overall'
  | 'stripe'
  | 'sweater'
  | 'polo'
  | 'raincoat';
type Accessory =
  | 'glasses'
  | 'headband'
  | 'headphones'
  | 'flower'
  | 'mustache'
  | 'freckles'
  | 'earring'
  | 'bow'
  | 'beard'
  | 'bandaid'
  | 'bandana'
  | 'bowtie';

export interface Person {
  skin: 1 | 2 | 3 | 4 | 5;
  head: Head;
  hair: Hair;
  hairColor: string;
  outfit: Outfit;
  outfitColor: string;
  acc: readonly Accessory[];
  /** Accent for accessories (headband, bow, flower, bandana, bow tie, hair tie). */
  accent?: string;
  /** Beanie or cap colour. */
  hat?: string;
  /** Shirt under an overall. */
  shirt?: string;
  /** Signature colour: the tile behind the character. */
  color: string;
  face: PersonFace;
}

const P = (p: Person): Person => p;

export const PEOPLE: Record<PersonId, Person> = {
  leo: P({
    skin: 3,
    head: 'round',
    hair: 'spiky',
    hairColor: '#5A3A22',
    outfit: 'hoodie',
    outfitColor: '#FF6A2B',
    acc: [],
    color: '#FF6A2B',
    face: 'grin',
  }),
  nara: P({
    skin: 2,
    head: 'oval',
    hair: 'bob',
    hairColor: '#2A2230',
    outfit: 'turtle',
    outfitColor: '#F2B33D',
    acc: ['glasses'],
    color: '#F2B33D',
    face: 'smile',
  }),
  mia: P({
    skin: 1,
    head: 'round',
    hair: 'pony',
    hairColor: '#8A4A24',
    outfit: 'sport',
    outfitColor: '#19B9A6',
    acc: ['headband'],
    accent: '#FF5C9A',
    color: '#19B9A6',
    face: 'happy',
  }),
  bima: P({
    skin: 5,
    head: 'wide',
    hair: 'afro',
    hairColor: '#1F1A1A',
    outfit: 'tee',
    outfitColor: '#3BB54A',
    acc: [],
    color: '#3BB54A',
    face: 'happy',
  }),
  kai: P({
    skin: 2,
    head: 'squircle',
    hair: 'beanie',
    hairColor: '#2A2230',
    outfit: 'jacket',
    outfitColor: '#3D7BF2',
    acc: ['headphones'],
    accent: '#FFC928',
    hat: '#FF5C9A',
    color: '#3D7BF2',
    face: 'smile',
  }),
  zara: P({
    skin: 3,
    head: 'oval',
    hair: 'hijab',
    hairColor: '#FF5C9A',
    outfit: 'tee',
    outfitColor: '#FFC928',
    acc: [],
    color: '#FF5C9A',
    face: 'happy',
  }),
  rio: P({
    skin: 4,
    head: 'round',
    hair: 'cap',
    hairColor: '#1F1A1A',
    outfit: 'tee',
    outfitColor: '#FFC928',
    acc: [],
    hat: '#3D7BF2',
    color: '#FFC928',
    face: 'wink',
  }),
  ayu: P({
    skin: 1,
    head: 'oval',
    hair: 'wavy',
    hairColor: '#3A2418',
    outfit: 'dress',
    outfitColor: '#FF7A6B',
    acc: ['flower'],
    accent: '#FFC928',
    color: '#FF7A6B',
    face: 'smile',
  }),
  opa: P({
    skin: 2,
    head: 'oval',
    hair: 'opa',
    hairColor: '#D9D9E0',
    outfit: 'cardigan',
    outfitColor: '#A86B3C',
    acc: ['glasses', 'mustache'],
    color: '#A86B3C',
    face: 'smile',
  }),
  dino: P({
    skin: 3,
    head: 'kid',
    hair: 'tuft',
    hairColor: '#C8742E',
    outfit: 'overall',
    outfitColor: '#3D7BF2',
    shirt: '#FF5C5C',
    acc: ['freckles'],
    color: '#FF5C5C',
    face: 'grin',
  }),
  lala: P({
    skin: 2,
    head: 'round',
    hair: 'twinbuns',
    hairColor: '#3A2418',
    outfit: 'stripe',
    outfitColor: '#FF5C9A',
    acc: [],
    color: '#FF5C9A',
    face: 'laugh',
  }),
  bayu: P({
    skin: 3,
    head: 'squircle',
    hair: 'mohawk',
    hairColor: '#19B9A6',
    outfit: 'jacket',
    outfitColor: '#FF5A5A',
    acc: ['earring'],
    color: '#FF5A5A',
    face: 'tongue',
  }),
  sinta: P({
    skin: 4,
    head: 'oval',
    hair: 'braids',
    hairColor: '#2A1A14',
    outfit: 'sweater',
    outfitColor: '#3BB54A',
    acc: ['bow'],
    accent: '#FFC928',
    color: '#3BB54A',
    face: 'happy',
  }),
  arka: P({
    skin: 2,
    head: 'round',
    hair: 'curtain',
    hairColor: '#4A3020',
    outfit: 'polo',
    outfitColor: '#19B9A6',
    acc: [],
    color: '#19B9A6',
    face: 'cool',
  }),
  oma: P({
    skin: 1,
    head: 'oval',
    hair: 'grandbun',
    hairColor: '#E3E3EA',
    outfit: 'cardigan',
    outfitColor: '#FF8FB1',
    acc: ['glasses', 'earring'],
    color: '#FF8FB1',
    face: 'smile',
  }),
  gilang: P({
    skin: 4,
    head: 'squircle',
    hair: 'buzz',
    hairColor: '#2A1A14',
    outfit: 'hoodie',
    outfitColor: '#4A5568',
    acc: ['beard'],
    color: '#4A5568',
    face: 'smile',
  }),
  putri: P({
    skin: 5,
    head: 'round',
    hair: 'puff',
    hairColor: '#1F1A1A',
    outfit: 'dress',
    outfitColor: '#FFC928',
    acc: ['earring'],
    color: '#FFC928',
    face: 'love',
  }),
  tara: P({
    skin: 2,
    head: 'round',
    hair: 'messybun',
    hairColor: '#8A4A24',
    outfit: 'tee',
    outfitColor: '#FF8A3D',
    acc: ['bandaid'],
    color: '#FF8A3D',
    face: 'nervous',
  }),
  juna: P({
    skin: 3,
    head: 'wide',
    hair: 'curlyshort',
    hairColor: '#2A1A14',
    outfit: 'tee',
    outfitColor: '#3D7BF2',
    acc: ['bandana'],
    accent: '#FF5A5A',
    color: '#3D7BF2',
    face: 'grin',
  }),
  kiki: P({
    skin: 1,
    head: 'kid',
    hair: 'pigtails',
    hairColor: '#C8742E',
    outfit: 'sweater',
    outfitColor: '#19B9A6',
    acc: ['bow'],
    accent: '#FF5C9A',
    color: '#19B9A6',
    face: 'wow',
  }),
  doni: P({
    skin: 3,
    head: 'wide',
    hair: 'bald',
    hairColor: '#2A1A14',
    outfit: 'polo',
    outfitColor: '#FFC928',
    acc: ['bowtie'],
    accent: '#FF5A5A',
    color: '#FFC928',
    face: 'laugh',
  }),
  lili: P({
    skin: 2,
    head: 'kid',
    hair: 'bowl',
    hairColor: '#2A2230',
    outfit: 'raincoat',
    outfitColor: '#FFC928',
    acc: ['freckles'],
    color: '#FFC928',
    face: 'shy',
  }),
  sasa: P({
    skin: 4,
    head: 'oval',
    hair: 'turban',
    hairColor: '#19B9A6',
    outfit: 'sport',
    outfitColor: '#FF6A2B',
    acc: [],
    color: '#19B9A6',
    face: 'happy',
  }),
  bram: P({
    skin: 1,
    head: 'squircle',
    hair: 'manbun',
    hairColor: '#5A3A22',
    outfit: 'jacket',
    outfitColor: '#3BB54A',
    acc: ['beard'],
    color: '#3BB54A',
    face: 'sleepy',
  }),
};

export const PERSON_IDS = Object.keys(PEOPLE) as PersonId[];

export const PERSON_VIEWBOX = '0 0 200 222';

const SKIN = { 1: '#FBDCC0', 2: '#F2C49B', 3: '#D9A172', 4: '#B07548', 5: '#7E4E2E' } as const;
const INK = '#1B1B22';
const MOUTH = '#3A1A1E';
const TEAR = '#6EC6FF';

/** Darkens (f < 1) or lightens toward white (f > 1) a #RRGGBB colour. */
export function shade(hex: string, f: number): string {
  const h = hex.replace('#', '');
  const ch = [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
  const out = ch.map((c) => Math.min(255, Math.trunc(f < 1 ? c * f : c + (255 - c) * (f - 1))));
  return `#${out.map((c) => c.toString(16).padStart(2, '0').toUpperCase()).join('')}`;
}

/** Hair colours a player can pick (index = `Look.hc`); hats and veils follow it too. */
export const HAIR_PALETTE = [
  '#1F1A1A',
  '#3A2418',
  '#5A3A22',
  '#8A4A24',
  '#C8742E',
  '#D9D9E0',
  '#19B9A6',
  '#FF5C9A',
] as const;
/** Outfit colours a player can pick (index = `Look.oc`); the tile behind follows it. */
export const OUTFIT_PALETTE = [
  '#FF6A2B',
  '#FFC928',
  '#3BB54A',
  '#19B9A6',
  '#3D7BF2',
  '#FF5C9A',
  '#FF5A5A',
  '#4A5568',
] as const;
/** Skin tones 1-5 as colours (for the picker). */
export const SKIN_PALETTE = ['#FBDCC0', '#F2C49B', '#D9A172', '#B07548', '#7E4E2E'] as const;

/** A character with a player's changes applied (another skin, another character's hair, colours). */
export function resolveLook(look: Look): Person {
  const base = PEOPLE[look.c];
  const donor = look.h ? PEOPLE[look.h] : base;
  const out: Person = { ...base, hair: donor.hair };
  if (look.h) {
    out.hat = donor.hat;
    out.accent = base.accent ?? donor.accent;
  }
  if (look.s !== undefined && look.s >= 1 && look.s <= 5) out.skin = look.s as Person['skin'];
  const hc = look.hc === undefined ? undefined : HAIR_PALETTE[look.hc];
  if (hc) {
    out.hairColor = hc;
    if (out.hair === 'beanie' || out.hair === 'cap') out.hat = hc;
  }
  const oc = look.oc === undefined ? undefined : OUTFIT_PALETTE[look.oc];
  if (oc) {
    out.outfitColor = oc;
    out.color = oc;
  }
  return out;
}

/** The light tile colour behind a character. */
export function personTint(who: PersonId | Look): string {
  return shade((typeof who === 'string' ? PEOPLE[who] : resolveLook(who)).color, 1.38);
}

function strandColor(hex: string): string {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.45 ? shade(hex, 0.72) : shade(hex, 1.5);
}

/** Rounds to one decimal so the markup stays short. */
const n = (v: number): number => Math.round(v * 10) / 10;

interface HeadGeom {
  cx: number;
  cy: number;
  hw: number;
  bot: number;
  /** The head shape with `$` where extra attributes go. */
  el: string;
}

function headGeom(kind: Head): HeadGeom {
  switch (kind) {
    case 'round':
      return { cx: 100, cy: 90, hw: 56, bot: 146, el: '<circle cx="100" cy="90" r="56"$></circle>' };
    case 'oval':
      return {
        cx: 100,
        cy: 90,
        hw: 50,
        bot: 150,
        el: '<ellipse cx="100" cy="90" rx="50" ry="60"$></ellipse>',
      };
    case 'wide':
      return {
        cx: 100,
        cy: 92,
        hw: 60,
        bot: 146,
        el: '<ellipse cx="100" cy="92" rx="60" ry="54"$></ellipse>',
      };
    case 'squircle':
      return {
        cx: 100,
        cy: 90,
        hw: 56,
        bot: 148,
        el: '<rect x="44" y="32" width="112" height="116" rx="46"$></rect>',
      };
    case 'kid':
      return { cx: 100, cy: 88, hw: 60, bot: 148, el: '<circle cx="100" cy="88" r="60"$></circle>' };
  }
}

/** Head outline grown by `pad`, the outer edge of the hair. */
function silhouette(kind: Head, pad: number): string {
  switch (kind) {
    case 'round':
      return `<circle cx="100" cy="90" r="${56 + pad}"$></circle>`;
    case 'oval':
      return `<ellipse cx="100" cy="90" rx="${50 + pad}" ry="${60 + pad}"$></ellipse>`;
    case 'wide':
      return `<ellipse cx="100" cy="92" rx="${60 + pad}" ry="${54 + pad}"$></ellipse>`;
    case 'squircle':
      return `<rect x="${44 - pad}" y="${32 - pad}" width="${112 + 2 * pad}" height="${116 + 2 * pad}" rx="${46 + pad}"$></rect>`;
    case 'kid':
      return `<circle cx="100" cy="88" r="${60 + pad}"$></circle>`;
  }
}

const withAttrs = (el: string, attrs: string): string => el.replace('$', attrs);

type Line = 'arch' | 'part' | 'center' | 'bangs' | 'curtain' | 'spiky' | 'buzz' | 'bowl' | 'tousle';

/** Region above each hairline; the hair is the grown head outline clipped to it. */
const FRINGE: Record<Line, string> = {
  arch: 'M 0 -20 H 200 V 86 H 156 C 150 66 128 58 100 58 C 72 58 50 66 44 86 H 0 Z',
  part: 'M 0 -20 H 200 V 86 H 156 C 152 70 140 60 122 56 L 112 62 C 84 54 58 60 44 86 H 0 Z',
  center: 'M 0 -20 H 200 V 86 H 156 C 152 70 134 60 106 58 L 100 64 L 94 58 C 66 60 48 70 44 86 H 0 Z',
  bangs:
    'M 0 -20 H 200 V 160 H 156 V 90 C 152 74 148 66 142 62 C 128 60 72 60 58 62 C 52 66 48 74 44 90 V 160 H 0 Z',
  curtain:
    'M 0 -20 H 200 V 86 H 156 L 148 80 C 142 64 128 60 108 62 C 104 60 101 57 100 52 C 99 57 96 60 92 62 C 72 60 58 64 52 80 L 44 86 H 0 Z',
  spiky:
    'M 0 -20 H 200 V 86 H 156 C 152 74 148 64 140 56 L 128 62 L 118 50 L 104 62 L 92 48 L 80 62 L 68 52 C 58 60 50 72 44 86 H 0 Z',
  buzz: 'M 0 -20 H 200 V 84 H 156 C 152 68 140 60 124 58 C 114 56 108 60 100 60 C 92 60 86 56 76 58 C 60 60 48 68 44 84 H 0 Z',
  bowl: 'M 0 -20 H 200 V 86 H 156 V 64 H 44 V 86 H 0 Z',
  tousle:
    'M 0 -20 H 200 V 86 H 156 C 152 72 146 64 138 60 Q 130 70 120 62 Q 110 72 100 62 Q 90 72 80 62 Q 70 70 62 60 C 54 64 48 72 44 86 H 0 Z',
};

/** Strand lines that show which way the hair is combed. */
const STRANDS: Record<Line, readonly string[]> = {
  part: [
    'M 122 28 L 120 56',
    'M 116 36 C 96 40 72 50 56 74',
    'M 112 46 C 94 50 74 60 62 80',
    'M 128 38 C 140 44 148 56 152 72',
  ],
  center: [
    'M 100 26 L 100 62',
    'M 96 40 C 80 44 62 56 52 76',
    'M 104 40 C 120 44 138 56 148 76',
    'M 92 52 C 78 56 66 66 58 80',
    'M 108 52 C 122 56 134 66 142 80',
  ],
  arch: [
    'M 100 58 L 100 28',
    'M 76 62 C 76 48 82 38 92 32',
    'M 124 62 C 124 48 118 38 108 32',
    'M 56 76 C 58 60 64 48 76 40',
    'M 144 76 C 142 60 136 48 124 40',
  ],
  bangs: [
    'M 74 60 C 74 50 80 40 88 34',
    'M 100 58 L 100 30',
    'M 126 60 C 126 50 120 40 112 34',
    'M 52 84 C 52 66 58 52 66 44',
    'M 148 84 C 148 66 142 52 134 44',
  ],
  curtain: [
    'M 100 52 L 100 26',
    'M 98 56 C 86 54 68 60 58 76',
    'M 102 56 C 114 54 132 60 142 76',
    'M 94 42 C 80 42 64 50 54 64',
    'M 106 42 C 120 42 136 50 146 64',
  ],
  tousle: [
    'M 100 26 L 100 58',
    'M 80 60 C 80 46 86 36 94 30',
    'M 120 60 C 120 46 114 36 106 30',
    'M 60 62 C 62 50 70 40 80 34',
    'M 140 62 C 138 50 130 40 120 34',
  ],
  bowl: [
    'M 60 62 C 60 48 72 36 90 30',
    'M 80 62 C 80 48 88 36 96 30',
    'M 100 62 L 100 28',
    'M 120 62 C 120 48 112 36 104 30',
    'M 140 62 C 140 48 128 36 110 30',
  ],
  spiky: ['M 64 58 C 66 48 72 42 80 38', 'M 136 58 C 134 48 128 42 120 38', 'M 100 58 L 100 40'],
  buzz: [],
};

/** Hair drawn as a cap: [hairline, how far it sits outside the head]. */
const CAPS: Partial<Record<Hair, [Line, number]>> = {
  bob: ['bangs', 8],
  spiky: ['spiky', 6],
  pony: ['part', 8],
  twinbuns: ['center', 7],
  braids: ['center', 7],
  curtain: ['curtain', 8],
  grandbun: ['arch', 7],
  buzz: ['buzz', 3],
  puff: ['arch', 5],
  messybun: ['part', 8],
  manbun: ['arch', 6],
  pigtails: ['center', 7],
  bowl: ['bowl', 9],
  wavy: ['part', 9],
  afro: ['arch', 4],
  curlyshort: ['arch', 5],
  mohawk: ['arch', 1],
  tuft: ['tousle', 6],
};
const NO_STRANDS: ReadonlySet<Hair> = new Set(['afro', 'curlyshort', 'mohawk', 'buzz']);
const SHINE: ReadonlySet<Hair> = new Set([
  'bob',
  'pony',
  'twinbuns',
  'braids',
  'curtain',
  'bowl',
  'pigtails',
  'wavy',
  'messybun',
  'manbun',
  'grandbun',
]);
const NO_EARS: ReadonlySet<Hair> = new Set(['hijab', 'bob']);
const HIJAB = 'M 34 192 C 24 120 30 22 100 22 C 170 22 176 120 166 192 C 140 206 60 206 34 192 Z';
const TORSO = 'M 30 222 C 30 182 54 162 100 162 C 146 162 170 182 170 222 Z';

function heart(x: number, y: number, s: number, fill: string): string {
  const d = [
    'M',
    x,
    y + 7 * s,
    'C',
    x - 12 * s,
    y - s,
    x - 7 * s,
    y - 11 * s,
    x,
    y - 5 * s,
    'C',
    x + 7 * s,
    y - 11 * s,
    x + 12 * s,
    y - s,
    x,
    y + 7 * s,
    'Z',
  ]
    .map((v) => (typeof v === 'number' ? n(v) : v))
    .join(' ');
  return `<path d="${d}" fill="${fill}"></path>`;
}

const stroke = (d: string, color: string, width: number, extra = ''): string =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"${extra}></path>`;
const fillPath = (d: string, color: string, extra = ''): string =>
  `<path d="${d}" fill="${color}"${extra}></path>`;
const circle = (x: number, y: number, r: number, color: string, extra = ''): string =>
  `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${color}"${extra}></circle>`;
const ellipse = (x: number, y: number, rx: number, ry: number, color: string, extra = ''): string =>
  `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(rx)}" ry="${n(ry)}" fill="${color}"${extra}></ellipse>`;

let seq = 0;

export interface PersonOptions {
  /** Expression; the character's own face when left out. */
  face?: PersonFace;
  /** Prefix for clip-path ids; must be unique in the document. A fresh one is made when left out. */
  uid?: string;
}

/** Inner SVG markup (defs and shapes) of one character on the 200x222 grid. Trusted, no user input. */
export function personMarkup(who: PersonId | Look, opts: PersonOptions = {}): string {
  const c = typeof who === 'string' ? PEOPLE[who] : resolveLook(who);
  const face = opts.face ?? c.face;
  seq += 1;
  const uid = opts.uid ?? `pp${seq}`;
  const skin = SKIN[c.skin];
  const hc = c.hairColor;
  const oc = c.outfitColor;
  const h = c.hair;
  const has = (a: Accessory): boolean => c.acc.includes(a);
  const { cx, cy, hw, bot, el } = headGeom(c.head);
  const sc = strandColor(hc);
  const defs: string[] = [`<clipPath id="${uid}-h">${withAttrs(el, '')}</clipPath>`];
  const p: string[] = [];

  // Back layer: hair behind the head.
  if (h === 'bob') {
    p.push(
      fillPath('M 40 156 C 30 44 170 44 160 156 L 138 156 L 138 112 L 62 112 L 62 156 Z', shade(hc, 0.85)),
    );
  } else if (h === 'wavy') {
    p.push(
      fillPath(
        'M 38 206 C 18 150 30 30 100 30 C 170 30 182 150 162 206 C 150 196 150 160 148 124 L 52 124 C 50 160 50 196 38 206 Z',
        shade(hc, 0.85),
      ),
    );
  } else if (h === 'pony') {
    p.push(fillPath('M 124 40 C 176 18 196 74 172 118 C 178 86 164 62 134 58 Z', shade(hc, 0.9)));
  } else if (h === 'afro') {
    for (const [x, y, r] of [
      [100, 44, 42],
      [60, 58, 32],
      [140, 58, 32],
      [48, 90, 24],
      [152, 90, 24],
      [78, 34, 28],
      [122, 34, 28],
    ] as const)
      p.push(circle(x, y, r, hc));
    for (const [x, y] of [
      [100, 18],
      [70, 34],
      [130, 34],
      [46, 66],
      [154, 66],
      [36, 92],
      [164, 92],
      [84, 22],
      [116, 22],
    ] as const)
      p.push(stroke(`M ${x - 5} ${y} a 5 5 0 1 1 10 0`, sc, 3, ' opacity="0.8"'));
  } else if (h === 'cap') {
    p.push(fillPath('M 116 40 L 170 26 C 176 34 170 46 152 50 Z', shade(c.hat ?? '#3D7BF2', 0.8)));
  } else if (h === 'hijab') {
    p.push(fillPath(HIJAB, shade(hc, 0.85)));
  } else if (h === 'twinbuns') {
    for (const x of [54, 146]) {
      p.push(circle(x, 40, 23, hc));
      p.push(stroke(`M ${x - 8} 30 Q ${x - 12} 38 ${x - 6} 46`, shade(hc, 1.5), 3, ' opacity="0.6"'));
    }
  } else if (h === 'grandbun') {
    p.push(circle(100, 22, 20, shade(hc, 0.92)));
    p.push(stroke('M 88 24 C 88 10 112 8 112 20 C 112 28 98 28 98 20', sc, 3));
  } else if (h === 'puff') {
    p.push(circle(100, 31, 30, hc));
    p.push(circle(86, 20, 6, shade(hc, 2.2), ' opacity="0.5"'));
  } else if (h === 'messybun') {
    p.push(circle(104, 22, 20, hc));
    p.push(stroke('M 94 22 C 96 12 114 12 114 22', sc, 3));
    p.push(stroke('M 118 14 Q 132 8 134 20 M 88 16 Q 80 6 72 14', hc, 4));
  } else if (h === 'manbun') {
    p.push(circle(100, 16, 16, shade(hc, 0.9)));
    p.push(stroke('M 90 16 C 92 6 108 6 110 16', sc, 3));
  }

  // Body: neck, torso and outfit details clipped to the torso.
  const neck = shade(skin, 0.88);
  p.push(`<rect x="84" y="${bot - 16}" width="32" height="${176 - bot + 16}" rx="12" fill="${neck}"></rect>`);
  defs.push(`<clipPath id="${uid}-t"><path d="${TORSO}"></path></clipPath>`);
  p.push(`<g clip-path="url(#${uid}-t)">`);
  const o = c.outfit;
  if (o === 'overall') {
    p.push(fillPath(TORSO, c.shirt ?? '#FF5C5C'));
    p.push(
      fillPath(
        'M 62 222 L 62 186 C 62 180 66 178 72 178 L 128 178 C 134 178 138 180 138 186 L 138 222 Z',
        oc,
      ),
    );
    p.push(stroke('M 70 180 L 58 164 M 130 180 L 142 164', oc, 9));
    p.push(circle(74, 186, 4, '#FFC928') + circle(126, 186, 4, '#FFC928'));
  } else {
    p.push(fillPath(TORSO, oc));
    p.push(fillPath('M 134 222 C 138 196 150 176 172 180 L 172 222 Z', shade(oc, 0.82), ' opacity="0.6"'));
    if (o === 'turtle') {
      p.push(`<rect x="74" y="152" width="52" height="22" rx="11" fill="${shade(oc, 0.86)}"></rect>`);
    } else if (o === 'hoodie') {
      p.push(
        fillPath('M 58 170 C 66 150 134 150 142 170 L 130 176 C 118 166 82 166 70 176 Z', shade(oc, 0.82)),
      );
      p.push(stroke('M 88 176 L 86 200 M 112 176 L 114 200', '#FFFFFF', 4));
    } else if (o === 'sport') {
      p.push(stroke('M 44 196 L 156 176', '#FFFFFF', 7, ' opacity="0.9"'));
    } else if (o === 'tee' || o === 'stripe' || o === 'sweater' || o === 'polo') {
      p.push(stroke('M 82 163 Q 100 180 118 163', shade(oc, 0.8), 6));
      if (o === 'stripe')
        for (const y of [186, 202, 216])
          p.push(stroke(`M 34 ${y} L 166 ${y}`, '#FFFFFF', 6, ' opacity="0.85"'));
      if (o === 'sweater') p.push(heart(100, 196, 1.2, '#FFFFFF'));
      if (o === 'polo')
        p.push(fillPath('M 82 160 L 100 176 L 118 160 L 112 172 L 100 184 L 88 172 Z', shade(oc, 0.8)));
    } else if (o === 'jacket') {
      p.push(stroke('M 100 168 L 100 222', shade(oc, 0.7), 4));
      p.push(fillPath('M 74 162 L 100 176 L 126 162 L 120 156 L 80 156 Z', shade(oc, 0.8)));
    } else if (o === 'dress') {
      p.push(fillPath('M 80 163 Q 100 190 120 163', neck));
      for (const x of [64, 100, 136]) p.push(circle(x, 206, 5, '#FFFFFF', ' opacity="0.85"'));
    } else if (o === 'cardigan') {
      p.push(fillPath('M 82 162 L 100 204 L 118 162 Z', '#FFFFFF'));
      for (const y of [184, 200, 214]) p.push(circle(108, y, 3.4, shade(oc, 0.65)));
    } else if (o === 'raincoat') {
      p.push(
        fillPath('M 52 172 C 64 148 136 148 148 172 L 136 178 C 120 166 80 166 64 178 Z', shade(oc, 0.85)),
      );
      for (const y of [190, 206]) p.push(circle(100, y, 4, shade(oc, 0.6)));
    }
  }
  p.push('</g>');
  if (has('bowtie')) {
    const a = c.accent ?? '#FF5A5A';
    p.push(
      fillPath('M 100 170 L 82 160 L 82 180 Z M 100 170 L 118 160 L 118 180 Z', a) +
        circle(100, 170, 5, shade(a, 0.75)),
    );
  }

  // Hair that falls in front of the shoulders.
  if (h === 'braids') {
    for (const sx of [-1, 1]) {
      const x = 100 + sx * 52;
      [124, 142, 160, 178].forEach((y, i) => {
        p.push(ellipse(x, y, 11 - i, 11, i % 2 === 0 ? hc : shade(hc, 1.25)));
      });
      p.push(circle(x, 192, 5, c.accent ?? '#FFC928'));
    }
  }
  if (h === 'pigtails') {
    for (const sx of [-1, 1]) {
      const x = 100 + sx * 66;
      p.push(ellipse(x, 122, 15, 26, hc, ` transform="rotate(${sx * -15} ${x} 122)"`));
    }
  }

  // Head with a soft shadow on the right.
  p.push(`<g clip-path="url(#${uid}-h)">`);
  p.push(withAttrs(el, ` fill="${skin}"`));
  p.push(ellipse(cx + hw + 22, cy + 6, 44, 80, shade(skin, 0.9)));
  p.push('</g>');
  const ears = (): void => {
    if (NO_EARS.has(h)) return;
    for (const s of [-1, 1]) {
      p.push(circle(cx + s * hw, cy + 8, 12, shade(skin, 0.92)));
      p.push(circle(cx + s * hw, cy + 8, 5.5, shade(skin, 0.8)));
      if (has('earring')) p.push(circle(cx + s * hw, cy + 22, 4.5, '#FFC928'));
    }
  };
  ears();
  if (h === 'bald') {
    p.push(stroke('M 70 56 C 76 46 88 40 102 40', '#FFFFFF', 5, ' opacity="0.18"'));
    p.push(
      fillPath(
        'M 64 56 C 46 60 38 76 40 94 C 44 97 50 97 54 94 C 52 80 56 66 64 56 Z M 136 56 C 154 60 162 76 160 94 C 156 97 150 97 146 94 C 148 80 144 66 136 56 Z',
        hc,
      ),
    );
    p.push(stroke('M 52 66 C 46 74 44 82 46 90 M 148 66 C 154 74 156 82 154 90', sc, 3, ' opacity="0.8"'));
  }

  // Hijab and turban.
  if (h === 'hijab') {
    p.push(
      `<path d="${HIJAB} M 54 98 a 46 52 0 1 0 92 0 a 46 52 0 1 0 -92 0 Z" fill="${hc}" fill-rule="evenodd"></path>`,
    );
    p.push(stroke('M 58 74 C 72 50 128 50 142 74', shade(hc, 0.8), 7));
  }
  if (h === 'turban') {
    defs.push(
      `<clipPath id="${uid}-b"><path d="M 0 -20 H 200 V 82 H 156 C 142 64 118 58 100 70 C 82 58 58 64 44 82 H 0 Z"></path></clipPath>`,
    );
    const fold = shade(hc, 0.82);
    p.push(
      `<g clip-path="url(#${uid}-b)">${withAttrs(silhouette(c.head, 10), ` fill="${hc}"`)}<g fill="none" stroke="${fold}" stroke-width="5" stroke-linecap="round">` +
        '<path d="M 50 70 C 66 42 108 30 146 38"></path><path d="M 150 70 C 134 46 100 38 66 44"></path><path d="M 58 80 C 78 58 120 50 154 58"></path></g></g>',
    );
    p.push(ellipse(100, 64, 11, 9, shade(hc, 0.88)));
  }

  // Front hair: the grown head outline cut along the hairline, with strands.
  const cap = CAPS[h];
  if (cap) {
    const [line, pad] = cap;
    defs.push(`<clipPath id="${uid}-f"><path d="${FRINGE[line]}"></path></clipPath>`);
    defs.push(`<clipPath id="${uid}-s">${withAttrs(silhouette(c.head, pad), '')}</clipPath>`);
    let inner = withAttrs(silhouette(c.head, pad), ` fill="${hc}"${h === 'mohawk' ? ' opacity="0.3"' : ''}`);
    if (!NO_STRANDS.has(h)) {
      inner +=
        `<g clip-path="url(#${uid}-s)" fill="none" stroke="${sc}" stroke-width="3.5" stroke-linecap="round" opacity="0.75">` +
        STRANDS[line].map((d) => `<path d="${d}"></path>`).join('') +
        '</g>';
    }
    p.push(`<g clip-path="url(#${uid}-f)">${inner}</g>`);
    if (SHINE.has(h)) p.push(stroke('M 72 46 C 86 38 104 36 120 40', shade(hc, 1.35), 4, ' opacity="0.3"'));
  }
  if (h === 'spiky') {
    p.push(fillPath('M 56 60 L 50 30 L 74 40 L 78 14 L 98 32 L 114 8 L 124 34 L 148 22 L 146 60 Z', hc));
    p.push(
      stroke('M 54 34 L 64 52 M 78 18 L 84 46 M 114 12 L 110 44 M 146 26 L 138 50', sc, 3, ' opacity="0.75"'),
    );
  } else if (h === 'mohawk') {
    p.push(fillPath('M 82 64 C 74 36 86 10 100 3 C 114 10 126 36 118 64 C 108 56 92 56 82 64 Z', hc));
    p.push(
      stroke(
        'M 100 12 L 100 56 M 92 24 C 89 36 89 46 91 58 M 108 24 C 111 36 111 46 109 58',
        sc,
        3,
        ' opacity="0.75"',
      ),
    );
  } else if (h === 'curlyshort') {
    const rx = hw + 2;
    const ry = c.head === 'wide' ? 54 : 58;
    for (let i = 0; i < 9; i++) {
      const a = ((200 + i * 17.5) * Math.PI) / 180;
      const bx = cx + Math.cos(a) * rx;
      const by = cy + Math.sin(a) * ry;
      p.push(circle(bx, by, 13, hc));
      p.push(stroke(`M ${n(bx - 5)} ${n(by + 1)} a 5 5 0 1 1 10 0`, sc, 3, ' opacity="0.8"'));
    }
  } else if (h === 'tuft') {
    p.push(fillPath('M 92 30 C 86 12 104 2 114 12 C 106 12 100 18 102 30 Z', hc));
  } else if (h === 'pony') {
    p.push(circle(140, 39, 7, c.accent ?? '#FF5C9A'));
  } else if (h === 'manbun') {
    p.push(`<rect x="88" y="24" width="24" height="8" rx="4" fill="${shade(hc, 0.55)}"></rect>`);
  } else if (h === 'puff') {
    p.push('<rect x="82" y="28" width="36" height="8" rx="4" fill="#FF5C9A"></rect>');
  } else if (h === 'grandbun') {
    p.push(stroke('M 82 8 L 118 20 M 84 18 L 116 6', '#FFC928', 3));
  } else if (h === 'messybun') {
    p.push(stroke('M 52 76 C 44 88 52 98 46 110 M 148 76 C 156 88 148 98 154 110', hc, 4));
  } else if (h === 'beanie') {
    const bc = c.hat ?? '#FF5C9A';
    p.push(fillPath('M 48 72 Q 66 62 82 68 Q 98 58 116 68 Q 132 60 152 72 L 152 60 L 48 60 Z', hc));
    p.push(fillPath('M 44 62 C 42 6 158 6 156 62 Z', bc));
    p.push(`<rect x="40" y="50" width="120" height="16" rx="8" fill="${shade(bc, 0.82)}"></rect>`);
    p.push(circle(100, 14, 11, shade(bc, 1.3)));
  } else if (h === 'cap') {
    const cc = c.hat ?? '#3D7BF2';
    p.push(
      fillPath(
        'M 48 88 C 50 62 70 56 84 58 L 116 58 C 130 56 150 62 152 88 C 138 74 118 70 100 72 C 82 70 62 74 48 88 Z',
        hc,
      ),
    );
    p.push(fillPath('M 44 64 C 44 14 156 14 156 64 Z', cc));
    p.push(`<rect x="42" y="54" width="116" height="12" rx="6" fill="${shade(cc, 0.82)}"></rect>`);
    p.push(circle(100, 22, 5, shade(cc, 0.7)));
  } else if (h === 'opa') {
    for (const sx of [-1, 1])
      for (const [x, y, r] of [
        [58, 62, 11],
        [49, 74, 12],
        [47, 87, 9],
      ] as const)
        p.push(circle(sx < 0 ? x : 200 - x, y, r, hc));
    p.push(stroke('M 68 48 C 84 38 112 36 132 44 M 72 56 C 90 48 114 46 130 52', hc, 4));
    p.push(stroke('M 44 70 C 46 64 52 60 56 60 M 156 70 C 154 64 148 60 144 60', sc, 3));
  }

  // Face.
  const kid = c.head === 'kid';
  const ey = cy + (kid ? 10 : 6);
  const ex = kid ? 24 : 22;
  const erx = kid ? 16 : 14.5;
  const ery = kid ? 18 : 16.5;
  let brow = ['hijab', 'beanie', 'cap', 'turban', 'bald', 'buzz'].includes(h)
    ? shade(skin, 0.45)
    : shade(hc, 0.8);
  if (h === 'opa' || h === 'grandbun') brow = '#BFC0C8';
  if (h === 'buzz') brow = hc;
  for (const s of [-1, 1]) {
    const x = cx + s * ex;
    let d: string;
    if (face === 'angry') d = `M ${x - s * 12} ${ey - 28} L ${x + s * 10} ${ey - 19}`;
    else if (face === 'sad' || face === 'cry' || face === 'nervous')
      d = `M ${x - s * 12} ${ey - 21} L ${x + s * 10} ${ey - 29}`;
    else if (face === 'wow' || face === 'love')
      d = `M ${x - 11} ${ey - 29} Q ${x} ${ey - 36} ${x + 11} ${ey - 29}`;
    else if (face === 'sleepy') d = `M ${x - 11} ${ey - 20} L ${x + 11} ${ey - 20}`;
    else d = `M ${x - 11} ${ey - 23} Q ${x} ${ey - 29} ${x + 11} ${ey - 23}`;
    p.push(stroke(d, brow, 6));
  }
  for (const s of [-1, 1]) {
    const x = cx + s * ex;
    if (face === 'love') {
      p.push(heart(x, ey, 1.45, '#FF4D6D'));
      p.push(circle(x - 5, ey - 6, 2.6, '#FFFFFF'));
      continue;
    }
    if (face === 'win' || face === 'laugh' || (face === 'wink' && s === 1)) {
      p.push(stroke(`M ${x - 11} ${ey + 3} Q ${x} ${ey - 10} ${x + 11} ${ey + 3}`, INK, 5));
      continue;
    }
    if (face === 'cool') continue;
    const big = face === 'wow' ? 1.12 : 1;
    const sxr = erx * big;
    const syr = ery * big;
    p.push(ellipse(x, ey, sxr, syr, '#FFFFFF'));
    const pr = face === 'wow' || face === 'nervous' ? 6.5 : 9;
    const px = x - s * 2;
    const py = ey + (face === 'sad' || face === 'cry' || face === 'shy' ? 5 : 2);
    p.push(circle(px, py, pr, INK));
    p.push(circle(px + 3, py - 3.5, 3.2, '#FFFFFF') + circle(px - 3, py + 3.5, 1.6, '#FFFFFF'));
    if (face === 'sleepy') {
      p.push(
        fillPath(
          `M ${n(x - sxr - 1)} ${ey - 20} L ${n(x + sxr + 1)} ${ey - 20} L ${n(x + sxr + 1)} ${ey + 1} Q ${x} ${ey + 4} ${n(x - sxr - 1)} ${ey + 1} Z`,
          shade(skin, 0.92),
        ),
      );
      p.push(stroke(`M ${n(x - sxr)} ${ey + 1} Q ${x} ${ey + 5} ${n(x + sxr)} ${ey + 1}`, INK, 4));
    }
  }
  if (face === 'cool') {
    for (const s of [-1, 1]) {
      p.push(
        `<rect x="${cx + s * ex - 17}" y="${ey - 10}" width="34" height="22" rx="10" fill="${INK}"></rect>`,
      );
      p.push(
        stroke(
          `M ${cx + s * ex - 10} ${ey - 4} L ${cx + s * ex - 4} ${ey - 4}`,
          '#FFFFFF',
          3,
          ' opacity="0.6"',
        ),
      );
    }
    p.push(
      `<path d="M ${cx - ex + 17} ${ey - 2} L ${cx + ex - 17} ${ey - 2}" stroke="${INK}" stroke-width="4"></path>`,
    );
  }
  const bearded = has('beard');
  const my = ey + 32 + (has('mustache') || bearded ? 4 : 0);
  if (bearded) {
    // Full beard: sideburns down the cheeks, round chin, an open patch around the mouth.
    defs.push(
      `<clipPath id="${uid}-d">${withAttrs(el, '')}${ellipse(cx, bot - 6, hw - 18, 22, '#000')}</clipPath>`,
    );
    const beard = [
      `M ${cx - hw - 4} ${cy - 8} L ${cx - hw + 16} ${cy - 8}`,
      `C ${cx - hw + 16} ${ey + 26} ${cx - 30} ${ey + 30} ${cx - 18} ${ey + 26}`,
      `Q ${cx} ${ey + 21} ${cx + 18} ${ey + 26}`,
      `C ${cx + 30} ${ey + 30} ${cx + hw - 16} ${ey + 26} ${cx + hw - 16} ${cy - 8}`,
      `L ${cx + hw + 4} ${cy - 8} L ${cx + hw + 4} ${bot + 30} L ${cx - hw - 4} ${bot + 30} Z`,
    ].join(' ');
    const hole = `M ${cx - 19} ${my + 3} a 19 12 0 1 0 38 0 a 19 12 0 1 0 -38 0 Z`;
    p.push(
      `<g clip-path="url(#${uid}-d)"><path d="${beard} ${hole}" fill="${hc}" fill-rule="evenodd"></path></g>`,
    );
    ears();
  }
  p.push(ellipse(cx, ey + 18, 5.5, 4, shade(skin, 0.82)));
  if (bearded) {
    p.push(
      fillPath(
        `M ${cx - 22} ${ey + 31} C ${cx - 16} ${ey + 22} ${cx - 5} ${ey + 23} ${cx} ${ey + 27} C ${cx + 5} ${ey + 23} ${cx + 16} ${ey + 22} ${cx + 22} ${ey + 31} ` +
          `C ${cx + 12} ${ey + 34} ${cx + 4} ${ey + 33} ${cx} ${ey + 30} C ${cx - 4} ${ey + 33} ${cx - 12} ${ey + 34} ${cx - 22} ${ey + 31} Z`,
        shade(hc, 0.72),
      ),
    );
  }
  const flush = face === 'shy' || face === 'love';
  if (has('freckles')) {
    for (const [fx, fy] of [
      [-34, 24],
      [-28, 28],
      [-38, 30],
      [34, 24],
      [28, 28],
      [38, 30],
    ] as const)
      p.push(circle(cx + fx, ey + fy, 1.8, shade(skin, 0.7)));
    if (flush)
      for (const s of [-1, 1]) p.push(ellipse(cx + s * 34, ey + 24, 10, 6, '#FF6F7D', ' opacity="0.5"'));
  } else if (!bearded) {
    for (const s of [-1, 1])
      p.push(ellipse(cx + s * 34, ey + 24, 10, 6, '#FF6F7D', ` opacity="${flush ? 0.75 : 0.4}"`));
  }
  if (has('bandaid')) {
    p.push(
      `<rect x="${cx + 26}" y="${ey + 20}" width="20" height="9" rx="4" fill="#F3D3A6" transform="rotate(-25 ${cx + 36} ${ey + 24})"></rect>`,
    );
  }

  // Mouth.
  if (face === 'happy' || face === 'win' || face === 'laugh' || face === 'love' || face === 'tongue') {
    const k = face === 'laugh' || face === 'win' ? 1.25 : 1;
    p.push(
      fillPath(
        `M ${n(cx - 16 * k)} ${my - 4} Q ${cx} ${n(my + 22 * k)} ${n(cx + 16 * k)} ${my - 4} Z`,
        MOUTH,
      ),
    );
    p.push(
      fillPath(
        `M ${n(cx - 8 * k)} ${n(my + 8 * k)} Q ${cx} ${n(my + 16 * k)} ${n(cx + 8 * k)} ${n(my + 8 * k)} Z`,
        '#FF7A8A',
      ),
    );
    if (face === 'tongue')
      p.push(
        fillPath(
          `M ${cx - 8} ${my + 6} L ${cx + 8} ${my + 6} Q ${cx} ${my + 30} ${cx - 8} ${my + 6} Z`,
          '#FF7A8A',
        ),
      );
  } else if (face === 'grin') {
    p.push(fillPath(`M ${cx - 18} ${my - 4} Q ${cx} ${my + 20} ${cx + 18} ${my - 4} Z`, MOUTH));
    p.push(
      fillPath(
        `M ${cx - 15} ${my - 2} L ${cx + 15} ${my - 2} Q ${cx + 12} ${my + 4} ${cx - 12} ${my + 4} Z`,
        '#FFFFFF',
      ),
    );
  } else if (face === 'smile' || face === 'wink' || face === 'shy') {
    const w = face === 'shy' ? 9 : 13;
    p.push(stroke(`M ${cx - w} ${my - 2} Q ${cx} ${my + 9} ${cx + w} ${my - 2}`, MOUTH, 5));
  } else if (face === 'cool') {
    p.push(stroke(`M ${cx - 10} ${my + 2} Q ${cx + 6} ${my + 8} ${cx + 14} ${my - 4}`, MOUTH, 5));
  } else if (face === 'wow' || face === 'sleepy') {
    p.push(face === 'wow' ? ellipse(cx, my + 4, 8, 10, MOUTH) : ellipse(cx, my + 4, 5, 6, MOUTH));
  } else if (face === 'sad' || face === 'cry') {
    p.push(stroke(`M ${cx - 12} ${my + 8} Q ${cx} ${my - 2} ${cx + 12} ${my + 8}`, MOUTH, 5));
  } else if (face === 'angry') {
    p.push(stroke(`M ${cx - 12} ${my + 4} L ${cx + 12} ${my + 2}`, MOUTH, 5));
  } else if (face === 'nervous') {
    p.push(
      stroke(`M ${cx - 14} ${my + 4} Q ${cx - 7} ${my - 2} ${cx} ${my + 4} T ${cx + 14} ${my + 4}`, MOUTH, 4),
    );
  }
  if (face === 'cry') {
    for (const s of [-1, 1]) {
      const x = cx + s * ex;
      p.push(
        stroke(
          `M ${x + s * 4} ${ey + 14} C ${x + s * 6} ${ey + 26} ${x + s * 2} ${ey + 36} ${x + s * 6} ${ey + 46}`,
          TEAR,
          6,
          ' opacity="0.9"',
        ),
      );
    }
  }
  if (face === 'nervous') p.push(fillPath('M 150 60 C 144 70 144 78 150 80 C 156 78 156 70 150 60 Z', TEAR));
  if (face === 'sleepy') {
    for (const [zx, zy, zs] of [
      [150, 44, 10],
      [166, 28, 7],
    ] as const)
      p.push(
        `<path d="M ${zx} ${zy} L ${zx + zs} ${zy} L ${zx} ${zy + zs} L ${zx + zs} ${zy + zs}" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>`,
      );
  }

  // Accessories.
  if (has('mustache')) {
    p.push(
      fillPath(
        `M ${cx - 22} ${ey + 28} C ${cx - 14} ${ey + 18} ${cx - 4} ${ey + 22} ${cx} ${ey + 26} C ${cx + 4} ${ey + 22} ${cx + 14} ${ey + 18} ${cx + 22} ${ey + 28} ` +
          `C ${cx + 14} ${ey + 34} ${cx + 4} ${ey + 32} ${cx} ${ey + 29} C ${cx - 4} ${ey + 32} ${cx - 14} ${ey + 34} ${cx - 22} ${ey + 28} Z`,
        hc,
      ),
    );
  }
  if (has('glasses') && face !== 'cool') {
    for (const s of [-1, 1])
      p.push(
        `<circle cx="${cx + s * ex}" cy="${ey}" r="18" fill="#FFFFFF" fill-opacity="0.12" stroke="${INK}" stroke-width="4"></circle>`,
      );
    p.push(
      `<path d="M ${cx - ex + 18} ${ey} Q ${cx} ${ey - 5} ${cx + ex - 18} ${ey}" fill="none" stroke="${INK}" stroke-width="4"></path>`,
    );
  }
  if (has('headband')) p.push(stroke('M 46 80 C 60 50 140 50 154 80', c.accent ?? '#FF5C9A', 10));
  if (has('bandana')) {
    const a = c.accent ?? '#FF5A5A';
    p.push(fillPath('M 46 70 C 60 48 140 48 154 70 L 154 60 C 140 38 60 38 46 60 Z', a));
    p.push(fillPath('M 152 64 L 172 52 L 168 74 Z', shade(a, 0.8)));
    for (const x of [70, 100, 130]) p.push(circle(x, 56, 2.5, '#FFFFFF'));
  }
  if (has('headphones')) {
    p.push(stroke('M 36 100 C 30 14 170 14 164 100', INK, 9));
    for (const x of [28, 156])
      p.push(`<rect x="${x}" y="84" width="20" height="36" rx="9" fill="${c.accent ?? '#FFC928'}"></rect>`);
  }
  if (has('flower')) {
    const a = c.accent ?? '#FFC928';
    for (const [dx, dy] of [
      [0, -8],
      [7.6, -2.5],
      [4.7, 6.5],
      [-4.7, 6.5],
      [-7.6, -2.5],
    ] as const)
      p.push(circle(136 + dx, 58 + dy, 5.5, a));
    p.push(circle(136, 58, 4, '#FF7A6B'));
  }
  if (has('bow')) {
    const a = c.accent ?? '#FF5C9A';
    const bows: [number, number][] =
      h === 'pigtails'
        ? [
            [152, 74],
            [48, 74],
          ]
        : [[140, 50]];
    for (const [bx, by] of bows) {
      p.push(
        fillPath(
          `M ${bx} ${by} L ${bx - 14} ${by - 10} L ${bx - 14} ${by + 10} Z M ${bx} ${by} L ${bx + 14} ${by - 10} L ${bx + 14} ${by + 10} Z`,
          a,
        ) + circle(bx, by, 4.5, shade(a, 0.75)),
      );
    }
  }

  return `<defs>${defs.join('')}</defs>${p.join('')}`;
}

/** The four expressions games used with fruit heads, mapped onto cast faces. */
export type GameFace = 'happy' | 'effort' | 'wow' | 'sad';
const GAME_FACES: Record<GameFace, PersonFace> = { happy: 'happy', effort: 'angry', wow: 'wow', sad: 'sad' };

export function toPersonFace(face: GameFace | PersonFace): PersonFace {
  return face in GAME_FACES ? GAME_FACES[face as GameFace] : (face as PersonFace);
}

/**
 * A player's head and shoulders on the 64x64 grid the fruit heads used, as inner SVG markup, so a
 * game can swap `fruitMarkup(fruit, face)` for `avatarMarkup(look, face)` and keep its sizes.
 */
export function avatarMarkup(look: Look, face?: GameFace | PersonFace, uid?: string): string {
  const inner = personMarkup(look, { face: face ? toPersonFace(face) : undefined, uid });
  return `<svg x="2" y="0" width="60" height="66.6" viewBox="${PERSON_VIEWBOX}">${inner}</svg>`;
}

/**
 * A cast head standing in for a fruit in decorative art (key art, tutorial drawings): the
 * character that matches the fruit, on the same 64x64 grid as `fruitMarkup`.
 */
export function castHead(fruit: Fruit, face: GameFace | PersonFace = 'happy'): string {
  return avatarMarkup(lookOfFruit(fruit), face);
}
