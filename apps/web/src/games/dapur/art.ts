/**
 * Dapur Heboh drawings as SVG markup (rasterized into textures by textures.ts, reused by the key
 * art and the phone theme). Shapes follow the approved design canvas: food icons on a 40x40 grid,
 * stations in 3/4 view (a light top face over a darker front face, 80 px per tile, 92 px tall),
 * fruit chefs on a 64x84 sprite. Text is never baked into SVG (images cannot use the page fonts);
 * labels are returned separately and drawn on canvas with the brand font.
 */
import { type Fruit, type Look, lookOfFruit } from '@hoorah/protocol';
import {
  type GameFace,
  PERSON_VIEWBOX,
  personMarkup,
  resolveLook,
  SKIN_PALETTE,
  toPersonFace,
} from '../../shared/art/people';
import type { ItemLook, StainKind } from './items';
import { COLS, type KitchenDef, ROWS, type StationKind } from './kitchens';

/** Tile size on the main screen (world px). */
export const TILE_W = 80;
export const TILE_H = 64;
/** Station drawings start this far above their tile's top face (soda machine, heaped baskets). */
export const ST_MARGIN = 44;
export const ST_H = 92;
/**
 * Each station block is drawn this far in from both sides of its tile, so the floor shows between
 * neighbours and every counter reads as its own table (players kept grabbing from the next one).
 */
export const ST_INSET = 5;
/** Kitchen area size (world px) and where row 0's top face starts. */
export const KITCHEN_W = COLS * TILE_W;
export const KITCHEN_H = 530;
export const TOP0 = 50;
/** Screen y of a tile row's top face, and of feet at tile y (both relative to the kitchen). */
export const rowTop = (r: number): number => TOP0 + r * TILE_H;
export const feetY = (y: number): number => TOP0 + 16 + y * TILE_H;

/* ------------------------------------------------------------------ food icons (40x40) */

const ICONS: Record<string, string> = {
  roti: '<ellipse cx="20" cy="23" rx="16" ry="11" fill="#D9974C"/><ellipse cx="20" cy="20" rx="14" ry="9" fill="#F0BC72"/><ellipse cx="14" cy="17" rx="1.4" ry="0.9" fill="#FFF3D6"/><ellipse cx="20" cy="15" rx="1.4" ry="0.9" fill="#FFF3D6"/><ellipse cx="26" cy="18" rx="1.4" ry="0.9" fill="#FFF3D6"/><ellipse cx="18" cy="21" rx="1.4" ry="0.9" fill="#FFF3D6"/>',
  daging:
    '<ellipse cx="20" cy="22" rx="15" ry="10" fill="#D0526A"/><ellipse cx="20" cy="20" rx="13" ry="8" fill="#E8798D"/><circle cx="15" cy="19" r="1.5" fill="#F7B3BF"/><circle cx="24" cy="22" r="1.5" fill="#F7B3BF"/>',
  dagingMatang:
    '<ellipse cx="20" cy="22" rx="15" ry="10" fill="#5E3519"/><ellipse cx="20" cy="20" rx="13" ry="8" fill="#8A5530"/><path d="M11 18 l18 0 M12 22 l16 0" stroke="#5E3519" stroke-width="1.6" stroke-linecap="round"/>',
  tomat:
    '<circle cx="20" cy="22" r="14" fill="#E8432E"/><circle cx="15" cy="17" r="3.5" fill="#F47A63"/><path d="M20 7 l2.5 4.5 l4 -1 l-2.5 3.5 l-4 -0.5 l-4 0.5 l-2.5 -3.5 l4 1 z" fill="#3E9B3A"/>',
  tomatPotong:
    '<circle cx="13" cy="21" r="9" fill="#E8432E"/><circle cx="13" cy="21" r="6" fill="#F58A6F"/><circle cx="11" cy="20" r="1" fill="#FFE3A3"/><circle cx="15" cy="22" r="1" fill="#FFE3A3"/><circle cx="28" cy="21" r="9" fill="#E8432E"/><circle cx="28" cy="21" r="6" fill="#F58A6F"/><circle cx="26" cy="22" r="1" fill="#FFE3A3"/><circle cx="30" cy="20" r="1" fill="#FFE3A3"/>',
  selada:
    '<circle cx="20" cy="21" r="15" fill="#4FA43A"/><circle cx="20" cy="21" r="10.5" fill="#8BD46E"/><path d="M20 11 v20 M12 17 l8 5 l8 -5" stroke="#4FA43A" stroke-width="1.8" fill="none" stroke-linecap="round"/>',
  seladaPotong:
    '<rect x="6" y="10" width="11" height="8" rx="3" fill="#6CC24A" transform="rotate(-12 11 14)"/><rect x="21" y="9" width="12" height="8" rx="3" fill="#8BD46E" transform="rotate(10 27 13)"/><rect x="9" y="22" width="12" height="8" rx="3" fill="#8BD46E" transform="rotate(8 15 26)"/><rect x="23" y="22" width="11" height="8" rx="3" fill="#6CC24A" transform="rotate(-8 28 26)"/>',
  kentang:
    '<ellipse cx="20" cy="21" rx="15" ry="11" fill="#C79A5B" transform="rotate(-12 20 21)"/><circle cx="14" cy="19" r="1.6" fill="#9C7442"/><circle cx="24" cy="25" r="1.6" fill="#9C7442"/><circle cx="26" cy="16" r="1.3" fill="#9C7442"/>',
  kentangPotong:
    '<rect x="8" y="8" width="5" height="24" rx="2" fill="#F3D9A0"/><rect x="15" y="10" width="5" height="22" rx="2" fill="#EBCB86"/><rect x="22" y="7" width="5" height="25" rx="2" fill="#F3D9A0"/><rect x="29" y="11" width="5" height="21" rx="2" fill="#EBCB86"/>',
  kentangGoreng:
    '<rect x="11" y="6" width="4" height="18" rx="1.5" fill="#FFC928"/><rect x="16" y="4" width="4" height="20" rx="1.5" fill="#F5B514"/><rect x="21" y="5" width="4" height="19" rx="1.5" fill="#FFC928"/><rect x="26" y="7" width="4" height="17" rx="1.5" fill="#F5B514"/><path d="M8 17 h24 l-3 18 h-18 z" fill="#E8432E"/><path d="M8 17 h24 l-0.6 3.5 h-22.8 z" fill="#C9301D"/>',
  telur:
    '<path d="M9 21 c-2 -8 6 -14 13 -12 c8 1 12 7 10 13 c-1 7 -9 10 -15 9 c-5 -1 -7 -4 -8 -10 z" fill="#FFFFFF" stroke="#E4E6EA" stroke-width="1"/><circle cx="21" cy="20" r="5.5" fill="#FFC928"/><circle cx="19.5" cy="18.5" r="1.6" fill="#FFE38A"/>',
  nasi: '<path d="M6 20 h28 a14 13 0 0 1 -28 0 z" fill="#E8E2D6"/><path d="M6 20 h28 a14 13 0 0 1 -28 0 z" fill="none" stroke="#C9C2B3" stroke-width="1.2"/><ellipse cx="20" cy="19" rx="13" ry="6.5" fill="#FFFFFF"/><ellipse cx="15" cy="18" rx="1.5" ry="0.8" fill="#EDE9E1"/><ellipse cx="22" cy="17" rx="1.5" ry="0.8" fill="#EDE9E1"/><ellipse cx="25" cy="20" rx="1.5" ry="0.8" fill="#EDE9E1"/>',
  nasiGoreng:
    '<ellipse cx="20" cy="21" rx="15" ry="12" fill="#C8792E"/><ellipse cx="20" cy="20" rx="12.5" ry="9.5" fill="#E09A47"/><circle cx="14" cy="18" r="1.6" fill="#6CC24A"/><circle cx="25" cy="23" r="1.6" fill="#E8432E"/><circle cx="23" cy="16" r="1.4" fill="#6CC24A"/><circle cx="16" cy="24" r="1.4" fill="#FFF3D6"/><circle cx="26" cy="19" r="1.2" fill="#FFF3D6"/><ellipse cx="20" cy="13" rx="5" ry="3.4" fill="#FFFFFF"/><circle cx="20" cy="13" r="1.8" fill="#FFC928"/>',
  gosong:
    '<ellipse cx="20" cy="25" rx="14" ry="9" fill="#241E1C"/><ellipse cx="20" cy="23" rx="12" ry="7" fill="#3E3532"/><path d="M12 22 l3 -2 l3 2 l3 -2 l3 2 l3 -2" stroke="#171311" stroke-width="1.6" fill="none" stroke-linecap="round"/><circle cx="14" cy="12" r="3.2" fill="#8E959F" opacity="0.75"/><circle cx="19" cy="7" r="2.6" fill="#8E959F" opacity="0.55"/><circle cx="25" cy="10" r="2" fill="#8E959F" opacity="0.45"/>',
  piring:
    '<circle cx="20" cy="21" r="16" fill="#FFFFFF" stroke="#D7D9DE" stroke-width="1.2"/><circle cx="20" cy="21" r="10.5" fill="none" stroke="#E4E6EA" stroke-width="2"/>',
  burger:
    '<circle cx="20" cy="22" r="17" fill="#FFFFFF" stroke="#D7D9DE" stroke-width="1"/><ellipse cx="20" cy="27" rx="11" ry="4" fill="#D9974C"/><rect x="8" y="22" width="24" height="4" rx="2" fill="#6CC24A"/><rect x="9" y="19" width="22" height="4" rx="2" fill="#E8432E"/><rect x="9" y="16" width="22" height="4" rx="2" fill="#6B3E22"/><path d="M8 16 a12 9 0 0 1 24 0 z" fill="#F0BC72"/><ellipse cx="16" cy="11.5" rx="1.2" ry="0.8" fill="#FFF3D6"/><ellipse cx="22" cy="10.5" rx="1.2" ry="0.8" fill="#FFF3D6"/><ellipse cx="25" cy="13" rx="1.2" ry="0.8" fill="#FFF3D6"/>',
  salad:
    '<circle cx="20" cy="22" r="17" fill="#FFFFFF" stroke="#D7D9DE" stroke-width="1"/><ellipse cx="20" cy="22" rx="12" ry="9" fill="#4FA43A"/><ellipse cx="18" cy="20" rx="8" ry="6" fill="#8BD46E"/><circle cx="14" cy="23" r="3.6" fill="#E8432E"/><circle cx="14" cy="23" r="2.2" fill="#F58A6F"/><circle cx="25" cy="19" r="3.6" fill="#E8432E"/><circle cx="25" cy="19" r="2.2" fill="#F58A6F"/><circle cx="23" cy="26" r="3" fill="#E8432E"/><circle cx="23" cy="26" r="1.8" fill="#F58A6F"/>',
  soda: '<path d="M27 9 l4 -6" stroke="#2F8CFF" stroke-width="2.6" stroke-linecap="round"/><path d="M10 11 h20 l-2.6 25 h-14.8 z" fill="#FFFFFF" stroke="#D7D9DE" stroke-width="1"/><path d="M11.4 17 h17.2 l-2 18 h-13.2 z" fill="#FF8A2E"/><path d="M12 23 h16" stroke="#FFC928" stroke-width="3"/><circle cx="16" cy="29" r="1.3" fill="#FFE1C2"/><circle cx="22" cy="31" r="1" fill="#FFE1C2"/><circle cx="24" cy="20" r="1.1" fill="#FFE1C2"/><rect x="8" y="8" width="24" height="4.5" rx="2.2" fill="#E4E6EA"/>',
  gelas:
    '<path d="M10 11 h20 l-2.6 25 h-14.8 z" fill="#E6F3FB" stroke="#B9C0C8" stroke-width="1.2"/><path d="M13.5 14 l1.6 19" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round"/><rect x="8" y="8" width="24" height="4.5" rx="2.2" fill="#E4E6EA"/>',
  pemadam:
    '<path d="M25 9 q9 -1 9 9" stroke="#2B2C30" stroke-width="2.6" fill="none" stroke-linecap="round"/><rect x="12" y="10" width="16" height="27" rx="6" fill="#E8432E"/><rect x="12" y="10" width="5" height="27" rx="2.5" fill="#C9301D"/><rect x="15" y="5" width="10" height="6" rx="1.5" fill="#2B2C30"/><rect x="15" y="19" width="10" height="8" rx="1.5" fill="#FFF7F0"/>',
  api: '<path d="M20 4 c4 7 11 10 11 19 a11 11 0 0 1 -22 0 c0 -5 3 -8 5 -10 c0 4 2 6 4 6 c-1 -6 0 -10 2 -15 z" fill="#FF5A1F"/><path d="M20 17 c2 4 6 6 6 10 a6 6 0 0 1 -12 0 c0 -3 2 -5 3 -6 c0 2 1 3 2 3 c0 -3 0 -5 1 -7 z" fill="#FFC928"/>',
};
ICONS.piringIsi = ICONS.piring!;
ICONS.paket = `<g transform="translate(-3 2) scale(0.8)">${ICONS.burger}</g><g transform="translate(17 8) scale(0.62)">${ICONS.soda}</g>`;

export type IconId = ItemLook | 'api' | 'paket';
export const ICON_IDS = Object.keys(ICONS) as IconId[];

export function iconMarkup(id: string): string {
  return ICONS[id] ?? ICONS.piring!;
}

/** A standalone icon SVG (for DOM <img> and rasterizing). */
export function iconSvg(id: string, px = 40): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 40 40">${iconMarkup(id)}</svg>`;
}

/** Chip colour for what a cook carries (phone status row). */
export const LOOK_COLOR: Record<ItemLook, string> = {
  roti: '#F0BC72',
  daging: '#E8798D',
  dagingMatang: '#8A5530',
  tomat: '#E8432E',
  tomatPotong: '#F58A6F',
  selada: '#4FA43A',
  seladaPotong: '#8BD46E',
  kentang: '#C79A5B',
  kentangPotong: '#F3D9A0',
  kentangGoreng: '#FFC928',
  telur: '#FFE38A',
  nasi: '#E8E2D6',
  nasiGoreng: '#E09A47',
  gosong: '#5A5D66',
  piring: '#FFFFFF',
  piringIsi: '#FFFFFF',
  burger: '#D9974C',
  salad: '#6CC24A',
  gelas: '#B9E0F5',
  soda: '#FF8A2E',
  pemadam: '#E8432E',
};

/* ------------------------------------------------------------------ stations */

export interface CanvasLabel {
  text: string;
  /** Centre x and baseline-centre y in the drawing's local px. */
  x: number;
  y: number;
  size: number;
  color: string;
  /** Rounded tag behind the text. */
  bg?: string;
  display?: boolean;
  /** Extra letter spacing (px). */
  track?: number;
}

export interface Drawing {
  w: number;
  h: number;
  svg: string;
  labels: CanvasLabel[];
}

/**
 * HD look (owner 2026-11-22, Dapur Heboh HD board): every block is a counter in 3/4 view with a
 * soft floor shadow, a front face with a darker foot, and a top face with a rim light. Every
 * station except the plain counter carries a name plate on its front face.
 */
const COLORS: Partial<Record<StationKind, [string, string]>> = {
  stove: ['#3A3D44', '#2B2D33'],
  wok: ['#3A3D44', '#2B2D33'],
  fryer: ['#C9CED6', '#8C939E'],
  pass: ['#FFF4E2', '#FF5A1F'],
};
const STEEL: [string, string] = ['#E7EAEE', '#B9C0CA'];
const WOOD_TOP = '#D9A066';
const WOOD_FRONT = '#B07A43';
const WOOD_DARK = '#8A5A2B';
const INK = '#1E1F23';

const r = (x: number, y: number, w: number, h: number, rx: number, fill: string, extra = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"${extra ? ` ${extra}` : ''}/>`;
const c = (cx: number, cy: number, rr: number, fill: string, extra = '') =>
  `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="${fill}"${extra ? ` ${extra}` : ''}/>`;
const e = (cx: number, cy: number, rx: number, ry: number, fill: string, extra = '') =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"${extra ? ` ${extra}` : ''}/>`;
const icon = (id: string, x: number, y: number, size: number) =>
  `<g transform="translate(${x} ${y}) scale(${size / 40})">${iconMarkup(id)}</g>`;

/** The counter body every station stands on: floor shadow, front face, top face, rim light. */
function body(w: number, top: string, front: string): string {
  const x = ST_INSET;
  const bw = w - ST_INSET * 2;
  return [
    e(w / 2, 82, bw / 2 - 2, 8, 'rgb(70,45,20)', 'fill-opacity="0.2"'),
    r(x, 46, bw, 34, 8, front),
    r(x, 73, bw, 7, 3.5, '#000000', 'fill-opacity="0.16"'),
    r(x, 0, bw, 56, 9, top),
    r(x + 4, 2.5, bw - 8, 3.5, 1.75, '#FFFFFF', 'fill-opacity="0.7"'),
    r(x, 52, bw, 4, 2, '#000000', 'fill-opacity="0.1"'),
  ].join('');
}

/**
 * Name plate on the edge between top and front face, centred on `cx`. It ends above y 64, where
 * the station one row below starts, so plates stay readable in stacked side columns too.
 */
function plate(text: string, bg: string, fg = '#FFFFFF', cx = 40): CanvasLabel {
  const long = text.length > 8;
  return { text, x: cx, y: 55, size: long ? 10 : 11, color: fg, bg, display: true, track: long ? 0.1 : 0.6 };
}

/** A pan seen from 3/4 above, centred at (cx, cy), handle to the right. */
function pan(cx: number, cy: number, rx: number, ry: number, handle: string): string {
  return [
    r(cx + rx - 4, cy - 5, 22, 7, 3.5, handle),
    e(cx, cy + 2, rx, ry, '#4A4E57'),
    e(cx, cy, rx - 4, ry - 3, '#2A2C31'),
    `<path d="M${cx - rx + 6} ${cy - 2} A${rx - 4} ${ry - 3} 0 0 1 ${cx + rx - 10} ${cy - ry + 4}" stroke="#5A5E68" stroke-width="2" fill="none" stroke-linecap="round"/>`,
  ].join('');
}

/**
 * One station in 3/4 view. Local frame: x from 0, y from -ST_MARGIN (the returned drawing is
 * shifted down by ST_MARGIN so it starts at 0). Dynamic parts (contents, flames, counts) are
 * drawn by the scene.
 */
export function stationDrawing(kind: StationKind, source: string | null, labels: StationLabels): Drawing {
  const w = kind === 'pass' ? TILE_W * 2 : TILE_W;
  const [top, front] = COLORS[kind] ?? STEEL;
  const parts: string[] = [body(w, top, front)];
  const lab: CanvasLabel[] = [];
  switch (kind) {
    case 'counter':
      break;
    case 'basket': {
      const id = source ?? 'roti';
      parts.push(
        r(10, 8, 60, 40, 6, WOOD_FRONT),
        r(13, 9, 54, 9, 4, '#5E3B1E'),
        icon(id, 11, -8, 28),
        icon(id, 41, -8, 28),
        icon(id, 25, -17, 30),
        r(10, 17, 60, 8, 4, WOOD_TOP),
        r(10, 31, 60, 3, 1.5, WOOD_DARK, 'fill-opacity="0.55"'),
        r(10, 41, 60, 3, 1.5, WOOD_DARK, 'fill-opacity="0.55"'),
      );
      lab.push(plate(labels.basket[id] ?? id.toUpperCase(), '#6B4423'));
      break;
    }
    case 'stove':
      parts.push(
        e(38, 30, 28, 13, INK),
        e(38, 30, 22, 9.5, 'none', 'stroke="#50545D" stroke-width="2.5"'),
        pan(38, 25, 24, 12, INK),
      );
      lab.push(plate(labels.stove, '#FF5A1F', '#111214'));
      break;
    case 'wok':
      parts.push(e(36, 31, 30, 14, INK), pan(36, 26, 27, 14, '#8A5A2B'));
      lab.push(plate(labels.wok, '#FF5A1F', '#111214'));
      break;
    case 'fryer':
      parts.push(
        r(11, 6, 58, 42, 7, '#5A3E1A'),
        r(14, 10, 52, 34, 5, '#E2A43A'),
        e(26, 20, 5, 3, '#FFE08A'),
        e(54, 34, 4, 2.5, '#FFE08A'),
        r(22, 14, 36, 22, 3, 'none', 'stroke="#3A3D44" stroke-width="2.5"'),
        r(56, 8, 18, 5, 2.5, INK),
      );
      lab.push(plate(labels.fryer, '#A8620C'));
      break;
    case 'board':
      parts.push(
        r(10, 12, 50, 36, 8, WOOD_FRONT),
        r(10, 9, 50, 35, 8, WOOD_TOP),
        '<path d="M17 18 h32 M17 25 h27 M17 32 h22" stroke="#C48A52" stroke-width="1.6" stroke-linecap="round"/>',
        r(62, 8, 7, 24, 3, '#D5DAE1'),
        r(62, 30, 7, 13, 2.5, INK),
      );
      lab.push(plate(labels.board, '#6B4423'));
      break;
    case 'sink':
      parts.push(
        r(11, 10, 58, 38, 10, '#8C939E'),
        r(15, 14, 50, 30, 8, '#7EC8F2'),
        '<path d="M22 27 q8 -4 16 0 t16 0" stroke="#D6F0FF" stroke-width="2.2" fill="none" stroke-linecap="round"/>',
        '<path d="M40 11 V2 q0 -6 8 -6 h5" stroke="#9AA3AF" stroke-width="4.5" fill="none" stroke-linecap="round"/>',
      );
      lab.push(plate(labels.sink, '#2B6CB0'));
      break;
    case 'rack':
      parts.push(
        r(14, 6, 4, 36, 2, '#8C939E'),
        r(62, 6, 4, 36, 2, '#8C939E'),
        r(13, 32, 54, 14, 6, '#9AA3AF'),
        r(15, 30, 50, 12, 5, '#C9CED6'),
      );
      lab.push(plate(labels.rack, INK));
      break;
    case 'cups': {
      parts.push(r(10, 40, 60, 5, 2.5, '#8C939E'));
      for (const [x, y] of [
        [14, 18],
        [32, 18],
        [50, 18],
        [23, 2],
        [41, 2],
      ] as const) {
        parts.push(
          `<path d="M${x} ${y + 22} h16 l-2 -20 h-12 z" fill="#E6F3FB" stroke="#B9C0C8" stroke-width="1.2"/>`,
          r(x - 1, y + 20, 18, 3, 1.5, '#DADCE0'),
        );
      }
      lab.push(plate(labels.cups, INK));
      break;
    }
    case 'trash':
      parts.push(
        e(40, 42, 22, 7, '#2B2D33'),
        r(18, 14, 44, 28, 0, '#3A3D44'),
        r(22, 18, 3, 20, 1.5, '#4A4E57'),
        r(55, 18, 3, 20, 1.5, '#4A4E57'),
        e(40, 14, 24, 8, '#5A5E68'),
        r(32, 4, 16, 6, 3, '#5A5E68'),
      );
      lab.push(plate(labels.trash, '#3A3D44'));
      break;
    case 'soda':
      parts.push(
        r(8, -40, 64, 86, 12, '#C9301D'),
        r(8, -40, 58, 86, 12, '#E8432E'),
        r(10, -40, 52, 3, 1.5, '#F47A63'),
        r(15, -33, 44, 20, 6, '#FFF7F0'),
        r(18, -8, 38, 46, 7, '#2B2C30'),
        r(25, -8, 8, 7, 3, '#FF8A2E'),
        r(41, -8, 8, 7, 3, '#FFC928'),
        r(20, 34, 34, 5, 2, '#8E959F'),
      );
      lab.push({ text: labels.soda, x: 37, y: -23, size: 14, color: '#E8432E', display: true, track: 0.8 });
      lab.push(plate(labels.drinks, '#E8432E'));
      break;
    case 'pass':
      parts.push(
        e(32, 36, 20, 7, '#C9CED6'),
        '<path d="M15 35 a17 15 0 0 1 34 0 z" fill="#FFC928"/>',
        '<circle cx="32" cy="18" r="3.2" fill="#C99A12"/>',
        r(58, 9, 90, 36, 9, '#FFFFFF', 'stroke="#FF5A1F" stroke-width="2.5" stroke-dasharray="6 4"'),
      );
      lab.push({
        text: labels.passSlot,
        x: 103,
        y: 27,
        size: 10,
        color: '#FF5A1F',
        display: true,
        track: 0.4,
      });
      lab.push({ text: labels.pass, x: 80, y: 66, size: 16, color: '#FFFFFF', display: true, track: 2 });
      break;
  }
  const svg = `<g transform="translate(0 ${ST_MARGIN})">${parts.join('')}</g>`;
  for (const l of lab) l.y += ST_MARGIN;
  return { w, h: ST_H + ST_MARGIN, svg, labels: lab };
}

export interface StationLabels {
  basket: Record<string, string>;
  stove: string;
  wok: string;
  fryer: string;
  board: string;
  sink: string;
  rack: string;
  trash: string;
  soda: string;
  drinks: string;
  cups: string;
  pass: string;
  passSlot: string;
}

/** Where a station shows what is on it: icon centre and size, local to the tile top-left. */
export function contentSpot(kind: StationKind): { x: number; y: number; size: number } {
  switch (kind) {
    case 'stove':
      return { x: 38, y: 24, size: 28 };
    case 'wok':
      return { x: 36, y: 25, size: 32 };
    case 'fryer':
      return { x: 40, y: 25, size: 30 };
    case 'board':
      return { x: 35, y: 26, size: 34 };
    case 'pass':
      return { x: 103, y: 26, size: 40 };
    default:
      return { x: 40, y: 26, size: 42 };
  }
}

/**
 * Where a cooker shows heat, local to the tile top-left: flames licking out under the pan rim
 * (stove, wok) or bubbles in the oil (fryer).
 */
export interface HeatSpot {
  look: 'flame' | 'oil';
  x: number;
  y: number;
  rx: number;
  ry: number;
}

export function heatSpot(kind: StationKind): HeatSpot | null {
  if (kind === 'stove') return { look: 'flame', x: 38, y: 27, rx: 24, ry: 12 };
  if (kind === 'wok') return { look: 'flame', x: 36, y: 28, rx: 27, ry: 14 };
  if (kind === 'fryer') return { look: 'oil', x: 40, y: 27, rx: 24, ry: 15 };
  return null;
}

/* ------------------------------------------------------------------ kitchen background */

const CHILI = (x: number, y: number, s = 1) =>
  `<g transform="translate(${x} ${y}) scale(${s})"><path d="M7 4 c4 2 5 8 1 13 c-1 1 -2 0 -1.5 -1 c2 -4 1 -8 -2.5 -10 z" fill="#E8432E"/><path d="M6 4 c0 -2 1 -3 3 -3" stroke="#3E9B3A" stroke-width="1.6" fill="none"/></g>`;

export const chiliMarkup = (x: number, y: number, s = 1): string => CHILI(x, y, s);

function checker(id: string, a: string, b: string): string {
  return `<pattern id="${id}" width="${TILE_W * 2}" height="${TILE_H * 2}" patternUnits="userSpaceOnUse" y="${feetY(0)}"><rect width="${TILE_W * 2}" height="${TILE_H * 2}" fill="${a}"/><rect width="${TILE_W}" height="${TILE_H}" fill="${b}"/><rect x="${TILE_W}" y="${TILE_H}" width="${TILE_W}" height="${TILE_H}" fill="${b}"/></pattern>`;
}

function wallTiles(x: number, w: number, h = 76): string {
  const out = [r(x, 0, w, h, 14, '#EFE8DC')];
  for (let y = 18; y < h; y += 20) out.push(r(x, y, w, 2, 0, '#DCD3C3'));
  for (let i = 0; i <= w; i += 40) out.push(r(x + i, 0, 2, h, 0, '#DCD3C3'));
  return out.join('');
}

/** Columns covered by a run of row-0 cookers, for the hood. */
function cookerSpan(def: KitchenDef): [number, number] | null {
  const row = def.grid[0] ?? '';
  let a = -1;
  let b = -1;
  for (let i = 0; i < row.length; i++) {
    if ('FGW'.includes(row[i]!)) {
      if (a < 0) a = i;
      b = i;
    }
  }
  return a < 0 ? null : [a, b];
}

export interface Backdrop {
  /** Full kitchen (or, for carts, the street between them). */
  base: Drawing;
  /** Gerobak Kembar: each cart separately so they can slide apart. */
  carts?: [Drawing, Drawing];
}

/** Everything that never changes: wall, floor, divider or street, carts. Stations are separate. */
export function backdropDrawing(def: KitchenDef, labels: { wall: string }): Backdrop {
  const W = KITCHEN_W;
  const H = KITCHEN_H;
  const defs: string[] = [
    checker('dp-fl-a', '#F3E3C7', '#EAD5B0'),
    checker('dp-fl-b', '#ECE6DA', '#DDD5C6'),
    checker('dp-fl-w', '#F4E6CC', '#EBD8B4'),
    '<pattern id="dp-haz" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="16" height="16" fill="#2B2C30"/><rect width="8" height="16" fill="#FFC928"/></pattern>',
  ];
  const parts: string[] = [];
  const lab: CanvasLabel[] = [];
  if (def.carts) {
    // Grass with a street down the middle; the carts are separate drawings.
    parts.push(r(0, 0, W, H, 14, '#8BA05A'));
    for (let i = 0; i < 26; i++) {
      const x = (i * 97) % W;
      const y = 20 + ((i * 53) % (H - 40));
      parts.push(
        `<path d="M${x} ${y} l3 -7 l3 7" stroke="#7A9049" stroke-width="2" fill="none" stroke-linecap="round"/>`,
      );
    }
    parts.push(
      r(W / 2 - 150, 0, 300, H, 0, '#4A4E57'),
      r(W / 2 - 150, 0, 6, H, 0, '#D7D9DE'),
      r(W / 2 + 144, 0, 6, H, 0, '#D7D9DE'),
    );
    for (let y = 16; y < H; y += 56) parts.push(r(W / 2 - 4, y, 8, 30, 3, '#F3F3F3'));
    const base: Drawing = {
      w: W,
      h: H,
      svg: `<defs>${defs.join('')}</defs>${parts.join('')}`,
      labels: [],
    };
    return { base, carts: [cartDrawing(0, defs), cartDrawing(1, defs)] };
  }
  // Floors (two tints on a split kitchen), then the back wall.
  if (def.split) {
    parts.push(
      r(0, 60, W / 2, H - 60, 14, 'url(#dp-fl-a)'),
      r(W / 2, 60, W / 2, H - 60, 14, 'url(#dp-fl-b)'),
    );
    parts.push(r(W / 2 - 20, 60, 40, H - 60, 0, 'url(#dp-fl-b)'));
  } else {
    parts.push(r(0, 60, W, H - 60, 14, 'url(#dp-fl-w)'));
  }
  parts.push(wallTiles(0, W));
  // Shelf with jars over the prep baskets, a menu board, the hood over the cookers.
  parts.push(r(80, 14, 400, 7, 3, '#B9824C'), r(80, 21, 400, 3, 1.5, '#8C5D2E'));
  parts.push(
    r(104, 0, 16, 14, 4, '#E8432E'),
    r(128, 2, 14, 12, 4, '#FFC928'),
    r(150, -2, 12, 16, 4, '#6CC24A'),
  );
  parts.push(r(196, 1, 12, 13, 4, '#F3D9A0'), r(214, 3, 18, 11, 4, '#B07A45'));
  const span = cookerSpan(def);
  if (span) {
    const x0 = span[0] * TILE_W - 12;
    const x1 = (span[1] + 1) * TILE_W + 12;
    parts.push(
      `<path d="M${x0 + 28} -4 H${x1 - 28} L${x1} 42 H${x0} Z" fill="#4A4E57"/>`,
      r(x0, 36, x1 - x0, 6, 3, '#3A3D45'),
      r(x0 + 52, 10, x1 - x0 - 104, 4, 2, '#3A3D45'),
      r(x0 + 52, 20, x1 - x0 - 104, 4, 2, '#3A3D45'),
    );
  }
  if (def.split) {
    // The low divider: steel top, hazard stripes, potted plants, a front face.
    const dx = W / 2 - 60;
    parts.push(
      r(dx + 2, 490, 116, 30, 10, '#5C626C'),
      r(dx, 40, 120, 460, 10, '#A3AAB3'),
      r(dx + 2, 41, 116, 2, 1, '#FFFFFF', 'fill-opacity="0.4"'),
      r(dx, 40, 9, 460, 4, 'url(#dp-haz)'),
      r(dx + 111, 40, 9, 460, 4, 'url(#dp-haz)'),
    );
    for (const py of [92, 196, 300, 404]) {
      parts.push(
        `<ellipse cx="${W / 2}" cy="${py + 50}" rx="17" ry="4" fill="#000000" fill-opacity="0.18"/>`,
        r(W / 2 - 15, py + 24, 30, 26, 6, '#8C5D2E'),
        r(W / 2 - 15, py + 28, 30, 22, 6, '#B9824C'),
        `<ellipse cx="${W / 2}" cy="${py + 18}" rx="18" ry="14" fill="#3E8A2D"/>`,
        `<ellipse cx="${W / 2}" cy="${py + 15}" rx="17" ry="12" fill="#4FA43A"/>`,
        `<ellipse cx="${W / 2 - 6}" cy="${py + 10}" rx="5" ry="3" fill="#6CC24A"/>`,
      );
    }
    lab.push({ text: labels.wall, x: W / 2, y: 52, size: 10, color: '#FFC928', bg: '#2B2C30', track: 0.6 });
  }
  // Frame.
  parts.push(r(-3, -3, W + 6, H + 6, 16, 'none', 'stroke="#26282D" stroke-width="6"'));
  return {
    base: { w: W, h: H, svg: `<defs>${defs.join('')}</defs>${parts.join('')}`, labels: lab },
  };
}

/** One food cart of Gerobak Kembar (left = orange Persiapan, right = yellow Masak). */
function cartDrawing(side: 0 | 1, defs: string[]): Drawing {
  const w = 6 * TILE_W;
  const color = side === 0 ? '#FF5A1F' : '#FFC928';
  const dark = side === 0 ? '#C9420F' : '#C99A12';
  const parts: string[] = [];
  // Body with a skirt, wheels, the floor inside, and a striped awning instead of a wall.
  parts.push(r(-8, 40, w + 16, 486, 18, dark), r(-8, 40, w + 16, 470, 18, color));
  parts.push(r(6, 60, w - 12, 450, 10, side === 0 ? 'url(#dp-fl-a)' : 'url(#dp-fl-b)'));
  for (const x of [70, w - 70]) parts.push(c(x, 520, 20, '#2B2C30'), c(x, 520, 8, '#8E959F'));
  for (let i = 0; i < 12; i++) {
    const x = i * (w / 12);
    parts.push(r(x - 8, -6, w / 12 + 1, 44, 0, i % 2 ? '#FFF7F0' : color));
  }
  parts.push(r(-8, 34, w + 16, 8, 4, dark));
  for (let i = 0; i < 12; i++) {
    const x = i * (w / 12) - 8;
    parts.push(`<path d="M${x} 38 q${w / 24} 14 ${w / 12} 0" fill="${i % 2 ? '#FFF7F0' : color}"/>`);
  }
  return { w, h: KITCHEN_H, svg: `<defs>${defs.join('')}</defs>${parts.join('')}`, labels: [] };
}

/* ------------------------------------------------------------------ chefs (64x84 sprite) */

/** Shadow and legs (static, grey). */
export const CHEF_LEGS =
  '<ellipse cx="32" cy="80" rx="17" ry="4.5" fill="#000000" fill-opacity="0.2"/><rect x="23" y="66" width="7" height="13" rx="3.5" fill="#3A3D45"/><rect x="34" y="66" width="7" height="13" rx="3.5" fill="#3A3D45"/>';
/** Shirt in white, tinted with the player colour at runtime. */
export const CHEF_SHIRT = '<rect x="17" y="46" width="30" height="26" rx="12" fill="#FFFFFF"/>';
export const CHEF_APRON =
  '<path d="M22 52 h20 v13 a4 4 0 0 1 -4 4 h-12 a4 4 0 0 1 -4 -4 z" fill="#FFFFFF"/><path d="M24 52 l-3 -5 M40 52 l3 -5" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/><rect x="27" y="58" width="10" height="5" rx="2" fill="#EEF0F2"/>';
export const CHEF_HAT =
  '<path d="M17 16 a7 7 0 0 1 8 -9 a9 9 0 0 1 14 0 a7 7 0 0 1 8 9 v4 h-30 z" fill="#FFFFFF"/><rect x="17" y="17" width="30" height="6" rx="3" fill="#E4E6EA"/>';
/** A white hand (tinted with the cook's skin tone). */
export const CHEF_HAND = '<circle cx="6" cy="6" r="5" fill="#FFFFFF"/>';

/** Rows of the 200x222 cast grid kept on the chef: the head down to the collar (no shoulders). */
const HEAD_ROWS = 160;
const PERSON_W = Number(PERSON_VIEWBOX.split(' ')[2]);

/**
 * The player's character as the chef's head: the cast art cut off at the collar and scaled so the
 * face fills about the same 36 px circle the fruit heads used, under the chef hat.
 */
export function chefHead(look: Look, face: GameFace, uid?: string): string {
  const h = (64 * HEAD_ROWS) / PERSON_W;
  const inner = personMarkup(look, { face: toPersonFace(face), uid });
  return `<svg x="0" y="0" width="64" height="${h.toFixed(1)}" viewBox="0 0 ${PERSON_W} ${HEAD_ROWS}">${inner}</svg>`;
}

/** The skin tone of a look (the chef's hands). */
export function skinColor(look: Look): string {
  return SKIN_PALETTE[resolveLook(look).skin - 1] ?? SKIN_PALETTE[1];
}

/** Stable text id of a look, for texture keys and caches. */
export function lookId(look: Look): string {
  return [look.c, look.s ?? '', look.h ?? '', look.hc ?? '', look.oc ?? ''].join('.');
}

/**
 * A whole chef as one SVG group (key art, phone theme): feet at (x, y), `s` times the 64x84
 * sprite, `arms` 'up' for a throw, 'catch' for both hands out front.
 */
export function chefMarkup(
  who: Fruit | Look,
  color: string,
  x: number,
  y: number,
  s: number,
  opts: { face?: GameFace; flip?: boolean; arms?: 'down' | 'up' | 'catch'; stains?: StainKind[] } = {},
): string {
  const look = typeof who === 'string' ? lookOfFruit(who) : who;
  const hand = skinColor(look);
  const arms = opts.arms ?? 'down';
  const hands =
    arms === 'up'
      ? `<circle cx="52" cy="34" r="5" fill="${hand}"/><circle cx="12" cy="56" r="5" fill="${hand}"/><path d="M45 50 L52 36" stroke="${color}" stroke-width="7" stroke-linecap="round"/>`
      : arms === 'catch'
        ? `<circle cx="20" cy="50" r="5" fill="${hand}"/><circle cx="44" cy="50" r="5" fill="${hand}"/>`
        : `<circle cx="14" cy="58" r="5" fill="${hand}"/><circle cx="50" cy="58" r="5" fill="${hand}"/>`;
  const stains = (opts.stains ?? [])
    .map((k, i) => `<g transform="translate(${22 + (i % 2) * 8} ${52 + i * 4}) scale(0.5)">${STAIN[k]}</g>`)
    .join('');
  const flip = opts.flip ? ' scale(-1 1) translate(-64 0)' : '';
  return `<g transform="translate(${x - 32 * s} ${y - 80 * s}) scale(${s})${flip}">${CHEF_LEGS}${CHEF_SHIRT.replace('#FFFFFF', color)}${hands}${CHEF_APRON}${stains}${chefHead(look, opts.face ?? 'happy')}${CHEF_HAT}</g>`;
}

/** Splats on an apron, 24x20, centred. */
export const STAIN: Record<StainKind, string> = {
  tomat:
    '<circle cx="11" cy="10" r="6" fill="#E8432E"/><circle cx="4" cy="6" r="2" fill="#E8432E"/><circle cx="19" cy="13" r="2.4" fill="#E8432E"/><circle cx="17" cy="4" r="1.6" fill="#E8432E"/><circle cx="10" cy="9" r="2" fill="#F58A6F"/>',
  telur:
    '<path d="M4 10 c0 -5 6 -8 10 -6 c5 1 7 5 6 8 c-1 4 -6 6 -10 5 c-4 -1 -6 -3 -6 -7 z" fill="#FFFFFF" stroke="#E4E6EA" stroke-width="0.8"/><circle cx="12" cy="10" r="3.4" fill="#FFC928"/><circle cx="21" cy="5" r="1.4" fill="#FFC928"/>',
  soda: '<circle cx="12" cy="10" r="5.5" fill="#FF8A2E"/><circle cx="5" cy="13" r="2.2" fill="#FF8A2E"/><circle cx="19" cy="7" r="2" fill="#FFC928"/><circle cx="16" cy="16" r="1.6" fill="#FF8A2E"/>',
  kuah: '<circle cx="12" cy="10" r="5.5" fill="#9A6232"/><circle cx="5" cy="7" r="2" fill="#9A6232"/><circle cx="19" cy="13" r="2.2" fill="#7A4A1E"/><circle cx="16" cy="4" r="1.4" fill="#9A6232"/>',
};

/* ------------------------------------------------------------------ setup-card thumbnails */

const THUMB_COLOR: Record<string, string> = {
  '#': '#C9CED5',
  F: '#2B2C30',
  W: '#2B2C30',
  G: '#F2B233',
  B: '#E0AE72',
  C: '#7CC3EE',
  P: '#FFFFFF',
  U: '#E6F3FB',
  M: '#E8432E',
  X: '#2B2C30',
  L: '#FF5A1F',
  Z: '#C9CED5',
  '|': '#A3AAB3',
  '~': '#4A4E57',
};

/** A schematic top view of a kitchen (for the setup cards), drawn straight from its grid. */
export function kitchenThumb(def: KitchenDef, w: number, h: number): string {
  const cw = w / COLS;
  const ch = h / ROWS;
  const out: string[] = [];
  const floorA = def.carts ? '#8BA05A' : '#F3E3C7';
  out.push(`<rect width="${w}" height="${h}" fill="${floorA}"/>`);
  for (let rr = 0; rr < ROWS; rr++) {
    const row = def.grid[rr] ?? '';
    for (let cc = 0; cc < COLS; cc++) {
      const t = row[cc] ?? '.';
      const x = cc * cw;
      const y = rr * ch;
      if (t === '.') {
        const tint = def.split && cc >= COLS / 2 ? '#ECE6DA' : '#F3E3C7';
        const alt = (cc + rr) % 2 ? (def.split && cc >= COLS / 2 ? '#DDD5C6' : '#EAD5B0') : tint;
        out.push(`<rect x="${x}" y="${y}" width="${cw + 0.5}" height="${ch + 0.5}" fill="${alt}"/>`);
        continue;
      }
      const fill = THUMB_COLOR[t] ?? '#B07A45';
      out.push(
        `<rect x="${x + 0.5}" y="${y + 0.5}" width="${cw - 1}" height="${ch - 1}" rx="2" fill="${fill}"/>`,
      );
      if (t === 'F' || t === 'W')
        out.push(
          `<circle cx="${x + cw / 2}" cy="${y + ch / 2}" r="${Math.min(cw, ch) * 0.28}" fill="none" stroke="#FF7A3D" stroke-width="1.5"/>`,
        );
      if (t === 'Z')
        out.push(
          `<rect x="${x + cw * 0.38}" y="${y + ch * 0.18}" width="${cw * 0.24}" height="${ch * 0.64}" rx="1.5" fill="#E8432E"/>`,
        );
    }
  }
  if (def.split && !def.carts) {
    out.push(
      `<rect x="${w / 2 - cw * 0.75}" y="0" width="${cw * 1.5}" height="${h}" fill="#A3AAB3"/>`,
      `<rect x="${w / 2 - cw * 0.75}" y="0" width="3" height="${h}" fill="#FFC928"/>`,
      `<rect x="${w / 2 + cw * 0.75 - 3}" y="0" width="3" height="${h}" fill="#FFC928"/>`,
    );
  }
  if (def.split) {
    out.push(
      `<path d="M${w / 2 - cw * 2.2} ${h * 0.55} Q${w / 2} ${h * 0.05} ${w / 2 + cw * 2.2} ${h * 0.5}" stroke="#FFFFFF" stroke-width="3" stroke-dasharray="2 7" stroke-linecap="round" fill="none"/>`,
    );
  }
  if (def.move) {
    out.push(
      `<path d="M${w * 0.66} ${h * 0.5} h${w * 0.2} M${w * 0.8} ${h * 0.4} l${w * 0.06} ${h * 0.1} l${-w * 0.06} ${h * 0.1}" stroke="#E8432E" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
  }
  return out.join('');
}
