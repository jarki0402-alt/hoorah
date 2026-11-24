import { castHead } from './people';
import { f1, seeded, svgDoc } from './svg';

/**
 * The congklak board: a long carved wooden board with two rows of seven holes and a store
 * (lumbung) at each end, filled with cream cowrie shells. Board coordinates are 1180x400; the
 * main screen draws it 1:1 in stage px and the poster draws it scaled down.
 *
 * Positions follow the game logic: 0–6 the top row left → right, 7 the right store,
 * 8–14 the bottom row right → left, 15 the left store.
 */

export const BOARD_W = 1180;
export const BOARD_H = 400;
const CX = BOARD_W / 2;
const CY = BOARD_H / 2;
export const HOLE_R = 50;
const HOLE_DX = 122;
const ROW_DY = 86;
export const STORE_RX = 62;
export const STORE_RY = 132;
const STORE_DX = 3 * HOLE_DX + HOLE_R + 28 + STORE_RX;

export const WOOD = {
  shadow: '#2B1608',
  side: '#6E3D1B',
  top: '#B87436',
  inner: '#C2803F',
  grain: '#A5642C',
  lip: '#8E5226',
  cavity: '#4A260F',
  cavityLit: '#5E3317',
  engrave: '#7A4420',
};

export const SEED_FILLS = ['#F6E7C8', '#EBD3A6', '#F3DDB4'] as const;

export function isStorePos(pos: number): boolean {
  return pos === 7 || pos === 15;
}

/** Centre of a hole or store in board coordinates. */
export function pitXY(pos: number): { x: number; y: number } {
  if (pos === 7) return { x: CX + STORE_DX, y: CY };
  if (pos === 15) return { x: CX - STORE_DX, y: CY };
  if (pos < 7) return { x: CX + (pos - 3) * HOLE_DX, y: CY - ROW_DY };
  return { x: CX + (3 - (pos - 8)) * HOLE_DX, y: CY + ROW_DY };
}

/** Row band (x, y, w, h) around the seven holes of a side, for turn highlights. */
export function rowRect(side: 0 | 1): { x: number; y: number; w: number; h: number } {
  const pad = HOLE_R + 12;
  const y = side === 0 ? CY - ROW_DY : CY + ROW_DY;
  return { x: CX - 3 * HOLE_DX - pad, y: y - pad, w: 6 * HOLE_DX + 2 * pad, h: 2 * pad };
}

export interface SeedSlot {
  x: number;
  y: number;
  rot: number;
  v: number;
}

/** Seeds visible in a hole / store at most; the count badge tells the rest. */
export const HOLE_SLOTS = 18;
export const STORE_SLOTS = 64;

const slotCache = new Map<string, SeedSlot[]>();

/** Sunflower spiral inside the pit, so a few seeds sit in the middle and more fill outwards. */
export function seedSlots(store: boolean): SeedSlot[] {
  const key = store ? 's' : 'h';
  const hit = slotCache.get(key);
  if (hit) return hit;
  const n = store ? STORE_SLOTS : HOLE_SLOTS;
  const rx = store ? STORE_RX - 17 : HOLE_R - 16;
  // Stores keep their top free for the count badge: seeds fill the lower part.
  const ry = store ? STORE_RY - 44 : HOLE_R - 16;
  const dy = store ? 22 : 0;
  const rnd = seeded(store ? 31 : 13);
  const out: SeedSlot[] = [];
  for (let k = 0; k < n; k++) {
    const r = Math.sqrt((k + 0.5) / n);
    const a = k * 2.39996;
    out.push({
      x: f1(Math.cos(a) * r * rx + (rnd() - 0.5) * 3),
      y: f1(Math.sin(a) * r * ry + dy + (rnd() - 0.5) * 3),
      rot: Math.round(rnd() * 180),
      v: Math.floor(rnd() * SEED_FILLS.length),
    });
  }
  slotCache.set(key, out);
  return out;
}

/** <defs> with the three seed looks (`#ck-s0` … `#ck-s2`): a cowrie with its slit and shadow. */
export function seedDefs(): string {
  return SEED_FILLS.map(
    (fill, i) =>
      `<g id="ck-s${i}"><ellipse cx="1.4" cy="2.4" rx="10.5" ry="8" fill="${WOOD.shadow}" opacity="0.55"/><ellipse rx="10.5" ry="8" fill="${fill}"/><path d="M-6.4 0.5 Q0 -1.9 6.4 0.5" fill="none" stroke="#8C6A3C" stroke-width="1.6" stroke-linecap="round"/></g>`,
  ).join('');
}

/** A pile of `n` seeds in pit `pos` as SVG markup (poster and anything static). */
export function pileMarkup(pos: number, n: number): string {
  const { x, y } = pitXY(pos);
  const slots = seedSlots(isStorePos(pos));
  let out = '';
  for (let k = 0; k < Math.min(n, slots.length); k++) {
    const s = slots[k]!;
    out += `<use href="#ck-s${s.v}" transform="translate(${f1(x + s.x)} ${f1(y + s.y)}) rotate(${s.rot})"/>`;
  }
  return out;
}

function grain(): string {
  const rnd = seeded(5);
  let d = '';
  for (let i = 0; i < 9; i++) {
    const y = 40 + i * 40 + rnd() * 10;
    const x0 = 60 + rnd() * 80;
    const x1 = BOARD_W - 60 - rnd() * 80;
    const w = 6 + rnd() * 8;
    d += `M${f1(x0)} ${f1(y)} C${f1(x0 + 260)} ${f1(y - w)} ${f1(x1 - 380)} ${f1(y + w)} ${f1(x1)} ${f1(y)} `;
  }
  return `<path d="${d}" fill="none" stroke="${WOOD.grain}" stroke-width="2.5" stroke-linecap="round" opacity="0.55"/>`;
}

function pitMarkup(pos: number): string {
  const { x, y } = pitXY(pos);
  if (isStorePos(pos)) {
    return [
      `<ellipse cx="${x}" cy="${y}" rx="${STORE_RX + 6}" ry="${STORE_RY + 6}" fill="${WOOD.lip}"/>`,
      `<ellipse cx="${x}" cy="${y}" rx="${STORE_RX}" ry="${STORE_RY}" fill="${WOOD.cavity}"/>`,
      `<ellipse cx="${x}" cy="${y + 8}" rx="${STORE_RX - 7}" ry="${STORE_RY - 10}" fill="${WOOD.cavityLit}"/>`,
    ].join('');
  }
  return [
    `<circle cx="${x}" cy="${y}" r="${HOLE_R + 5}" fill="${WOOD.lip}"/>`,
    `<circle cx="${x}" cy="${y}" r="${HOLE_R - 1}" fill="${WOOD.cavity}"/>`,
    `<circle cx="${x}" cy="${y + 6}" r="${HOLE_R - 9}" fill="${WOOD.cavityLit}"/>`,
  ].join('');
}

/** Engraved hole numbers 1–7 for each side (next to the inner edge of each hole). */
function numbers(): string {
  let out = '';
  for (let pos = 0; pos < 15; pos++) {
    if (pos === 7) continue;
    const { x, y } = pitXY(pos);
    const n = (pos % 8) + 1;
    const ty = pos < 7 ? y + HOLE_R + 27 : y - HOLE_R - 11;
    out += `<text x="${x}" y="${ty}" text-anchor="middle" font-family="'Baloo 2', ui-rounded, sans-serif" font-weight="800" font-size="22" fill="${WOOD.engrave}">${n}</text>`;
  }
  return out;
}

/** The empty board (hull, holes, stores, engravings) in board coordinates. */
export function boardMarkup(withNumbers = true): string {
  const r = BOARD_H / 2 - 14;
  return [
    `<rect x="14" y="30" width="${BOARD_W - 28}" height="${BOARD_H - 20}" rx="${r}" fill="${WOOD.shadow}" opacity="0.28"/>`,
    `<rect x="8" y="22" width="${BOARD_W - 16}" height="${BOARD_H - 28}" rx="${r}" fill="${WOOD.side}"/>`,
    `<rect x="8" y="12" width="${BOARD_W - 16}" height="${BOARD_H - 28}" rx="${r}" fill="${WOOD.top}"/>`,
    `<rect x="24" y="26" width="${BOARD_W - 48}" height="${BOARD_H - 56}" rx="${r - 16}" fill="${WOOD.inner}"/>`,
    grain(),
    Array.from({ length: 16 }, (_, p) => pitMarkup(p)).join(''),
    withNumbers ? numbers() : '',
  ].join('');
}

/** Woven pandan mat (tikar) tile, 48x48. */
export function matTile(): string {
  const a = '#D7B377';
  const b = '#C9A066';
  const line = '#B98E55';
  let body = `<rect width="48" height="48" fill="${a}"/>`;
  // Basket weave: horizontal strips in two quadrants, vertical in the other two.
  for (const [qx, qy, horiz] of [
    [0, 0, true],
    [24, 24, true],
    [24, 0, false],
    [0, 24, false],
  ] as const) {
    if (!horiz) body += `<rect x="${qx}" y="${qy}" width="24" height="24" fill="${b}"/>`;
    for (let k = 1; k < 3; k++) {
      body += horiz
        ? `<rect x="${qx}" y="${qy + k * 8 - 1}" width="24" height="2" fill="${line}"/>`
        : `<rect x="${qx + k * 8 - 1}" y="${qy}" width="2" height="24" fill="${line}"/>`;
    }
  }
  return svgDoc(48, 48, body);
}

/** Key art (640x360): the board on a tikar, mid-game, with two fruit friends leaning over it. */
export function congklakSvg(): string {
  const counts = [0, 9, 8, 3, 9, 0, 10, 14, 8, 2, 9, 11, 0, 8, 6, 9];
  const s = 0.5;
  const ox = (640 - BOARD_W * s) / 2;
  const oy = 158;
  let mat = '';
  for (let y = 0; y < 360; y += 24)
    for (let x = 0; x < 640; x += 24)
      if ((x / 24 + y / 24) % 2 === 0)
        mat += `<rect x="${x}" y="${y}" width="24" height="24" fill="#C9A066"/>`;
  const piles = counts.map((n, p) => pileMarkup(p, n)).join('');
  const shell = (x: number, y: number, r: number, v: number) =>
    `<use href="#ck-s${v}" transform="translate(${x} ${y}) rotate(${r})"/>`;
  return svgDoc(
    640,
    360,
    [
      `<defs>${seedDefs()}</defs>`,
      '<rect width="640" height="360" fill="#D7B377"/>',
      `<g opacity="0.6">${mat}</g>`,
      '<rect x="0" y="0" width="640" height="96" fill="#7A4521"/>',
      '<rect x="0" y="92" width="640" height="8" fill="#5A3016"/>',
      '<g fill="#8C5228"><rect x="0" y="26" width="640" height="3"/><rect x="0" y="60" width="640" height="3"/></g>',
      `<g transform="translate(372 92) scale(1.15)">${castHead('mangga', 'effort')}</g>`,
      `<g transform="translate(470 104) scale(1)">${castHead('rambutan', 'wow')}</g>`,
      `<g transform="translate(${f1(ox)} ${f1(oy)}) scale(${s})">${boardMarkup(false)}${piles}</g>`,
      shell(52, 140, 30, 0),
      shell(590, 150, 120, 1),
      shell(604, 132, 60, 2),
    ].join(''),
  );
}
