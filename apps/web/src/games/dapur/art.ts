/**
 * Dapur Heboh drawings as SVG markup (rasterized into textures by textures.ts, reused by the key
 * art and the phone theme). Shapes follow the approved design canvas: food icons on a 40x40 grid,
 * stations in 3/4 view (a light top face over a darker front face, 80 px per tile, 92 px tall),
 * fruit chefs on a 64x84 sprite. Text is never baked into SVG (images cannot use the page fonts);
 * labels are returned separately and drawn on canvas with the brand font.
 */
import type { Fruit } from '@hoorah/protocol';
import { type Face, FRUIT_ART, fruitMarkup } from '../../shared/art/fruits';
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

const COLORS: Partial<Record<StationKind, [string, string]>> = {
  stove: ['#3A3C42', '#1E1F23'],
  wok: ['#3A3C42', '#1E1F23'],
  fryer: ['#A3AAB3', '#555B65'],
  pass: ['#ECEEF1', '#FF5A1F'],
};
const STEEL: [string, string] = ['#CDD2D8', '#6E747E'];

const r = (x: number, y: number, w: number, h: number, rx: number, fill: string, extra = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"${extra ? ` ${extra}` : ''}/>`;
const c = (cx: number, cy: number, rr: number, fill: string, extra = '') =>
  `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="${fill}"${extra ? ` ${extra}` : ''}/>`;
const knob = (x: number, y: number, s = 10) =>
  `${c(x + s / 2, y + s / 2, s / 2, '#DADCE0')}${r(x, y + s - 3, s, 3, 1.5, '#A8ABB2')}`;
const icon = (id: string, x: number, y: number, size: number) =>
  `<g transform="translate(${x} ${y}) scale(${size / 40})">${iconMarkup(id)}</g>`;

/** The counter body every station stands on: soft shadow, darker front, light top face. */
function body(w: number, top: string, front: string): string {
  const x = ST_INSET;
  const bw = w - ST_INSET * 2;
  return [
    `<ellipse cx="${w / 2}" cy="81" rx="${bw / 2 - 5}" ry="9" fill="rgb(70,45,20)" fill-opacity="0.22"/>`,
    r(x + 2, 48, bw - 4, 32, 10, front),
    r(x + 2, 48, bw - 4, 6, 3, '#000000', 'fill-opacity="0.2"'),
    r(x, 0, bw, 56, 10, top),
    r(x + 2, 1.5, bw - 4, 2, 1, '#FFFFFF', 'fill-opacity="0.45"'),
    r(x, 53, bw, 3, 1.5, '#000000', 'fill-opacity="0.14"'),
  ].join('');
}

const handleBar = (w: number) => r(w / 2 - 12, 62, 24, 5, 2.5, '#9AA0A9');

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
      parts.push(handleBar(w));
      break;
    case 'basket': {
      const id = source ?? 'roti';
      parts.push('<ellipse cx="40" cy="6" rx="31" ry="11" fill="#5E3B1E"/>');
      parts.push(icon(id, 11, -12, 28), icon(id, 41, -12, 28), icon(id, 25, -21, 30));
      parts.push(
        '<path d="M9 6 A31 11 0 0 0 71 6 L65 42 Q40 50 15 42 Z" fill="#B07A45"/>',
        '<path d="M12 19 Q40 29 68 19 M14 31 Q40 40 66 31" stroke="#8C5D2E" stroke-width="2" fill="none"/>',
        '<path d="M24 15 L22 44 M40 18 L40 47 M56 15 L58 44" stroke="#9A6837" stroke-width="1.6" fill="none"/>',
        '<path d="M9 6 A31 11 0 0 0 71 6" stroke="#D39A5E" stroke-width="4" fill="none" stroke-linecap="round"/>',
      );
      const text = labels.basket[id] ?? id.toUpperCase();
      lab.push({ text, x: 40, y: 49, size: 9, color: '#3A2A1A', bg: '#FFF7F0', track: 0.6 });
      break;
    }
    case 'stove':
      parts.push(
        c(21, 28, 12, '#26272B', 'stroke="#4A4D55" stroke-width="4"'),
        c(54, 28, 16, '#3A3D45', 'stroke="#50545D" stroke-width="4"'),
        r(69, 24, 14, 7, 3.5, '#1B1C20'),
        knob(12, 59),
        knob(28, 59),
        knob(44, 59),
      );
      break;
    case 'wok':
      parts.push(
        c(38, 28, 22, '#2B2C30', 'stroke="#44474F" stroke-width="5"'),
        r(58, 24, 22, 8, 4, '#8A5A2B'),
        knob(22, 59),
      );
      break;
    case 'fryer':
      parts.push(
        r(9, 8, 62, 40, 7, '#6E747E'),
        r(13, 12, 54, 32, 5, '#F2B233'),
        r(13, 12, 54, 7, 4, '#D9971A'),
        r(18, 13, 40, 28, 4, 'none', 'stroke="#5C626C" stroke-width="2"'),
        r(56, 25, 20, 4, 2, '#2B2C30'),
        knob(14, 57, 14),
        r(36, 60, 22, 8, 3, '#2B2C30'),
      );
      break;
    case 'board':
      parts.push(
        r(6, 12, 54, 38, 7, '#B9824C'),
        r(6, 9, 54, 38, 7, '#E0AE72'),
        '<path d="M14 18 h36 M14 26 h30 M14 34 h34" stroke="#CF9A5E" stroke-width="1.4" stroke-linecap="round"/>',
        r(64, 10, 7, 22, 3, '#D7D9DE'),
        r(64, 31, 7, 13, 2, '#2B2C30'),
        handleBar(w),
      );
      break;
    case 'sink':
      parts.push(
        r(10, 14, 60, 36, 9, '#7E858F'),
        r(10, 14, 60, 6, 3, '#5C626C'),
        r(15, 24, 50, 22, 7, '#7CC3EE'),
        r(15, 24, 50, 3, 1.5, '#5AA8D8'),
        '<path d="M28 12 V2 a8 8 0 0 1 16 0 V6" stroke="#DADCE0" stroke-width="4" fill="none" stroke-linecap="round"/>',
        r(24, 9, 8, 5, 2, '#A8ABB2'),
        handleBar(w),
      );
      break;
    case 'rack':
      parts.push(
        r(14, 2, 4, 46, 2, '#6E747E'),
        r(62, 2, 4, 46, 2, '#6E747E'),
        r(14, 44, 52, 4, 2, '#6E747E'),
        handleBar(w),
      );
      break;
    case 'cups': {
      parts.push(r(10, 40, 60, 5, 2.5, '#6E747E'));
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
      lab.push({ text: labels.cups, x: 40, y: 49, size: 9, color: '#3A2A1A', bg: '#FFF7F0', track: 0.6 });
      break;
    }
    case 'trash':
      parts.push(
        '<ellipse cx="40" cy="27" rx="24" ry="15" fill="#2B2C30"/>',
        '<ellipse cx="40" cy="24" rx="20" ry="10" fill="#1B1C20"/>',
        r(22, 6, 36, 12, 6, '#8E959F', 'transform="rotate(-14 40 12)"'),
      );
      lab.push({ text: labels.trash, x: 40, y: 49, size: 9, color: '#DADCE0', bg: '#2B2C30', track: 0.6 });
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
        handleBar(w),
      );
      lab.push({ text: labels.soda, x: 37, y: -23, size: 14, color: '#E8432E', display: true, track: 0.8 });
      break;
    case 'pass':
      parts.push(
        '<g transform="translate(12 12) scale(1.42)"><path d="M4 16h16v-1.5a8 8 0 0 0-16 0z" fill="#C9A23A"/><rect x="2" y="16.5" width="20" height="3" rx="1.5" fill="#8E959F"/><circle cx="12" cy="5.5" r="1.8" fill="#C9A23A"/></g>',
        r(56, 10, 92, 36, 8, '#FFFFFF', 'stroke="#E4E6EA" stroke-width="2"'),
      );
      lab.push({ text: labels.passSlot, x: 102, y: 28, size: 10, color: '#6B6E76', track: 0.6 });
      lab.push({ text: labels.pass, x: 80, y: 66, size: 19, color: '#FFFFFF', display: true, track: 1.5 });
      break;
  }
  const svg = `<g transform="translate(0 ${ST_MARGIN})">${parts.join('')}</g>`;
  for (const l of lab) l.y += ST_MARGIN;
  return { w, h: ST_H + ST_MARGIN, svg, labels: lab };
}

export interface StationLabels {
  basket: Record<string, string>;
  trash: string;
  soda: string;
  cups: string;
  pass: string;
  passSlot: string;
}

/** Where a station shows what is on it: icon centre and size, local to the tile top-left. */
export function contentSpot(kind: StationKind): { x: number; y: number; size: number } {
  switch (kind) {
    case 'stove':
      return { x: 54, y: 28, size: 30 };
    case 'wok':
      return { x: 38, y: 28, size: 34 };
    case 'fryer':
      return { x: 38, y: 26, size: 30 };
    case 'board':
      return { x: 33, y: 27, size: 36 };
    case 'pass':
      return { x: 80, y: 26, size: 40 };
    default:
      return { x: 40, y: 26, size: 42 };
  }
}

/** Flame ring position on cookers (glows while cooking). */
export function flameSpot(kind: StationKind): { x: number; y: number; r: number } | null {
  if (kind === 'stove') return { x: 54, y: 28, r: 20 };
  if (kind === 'wok') return { x: 38, y: 28, r: 26 };
  if (kind === 'fryer') return { x: 40, y: 28, r: 31 };
  return null;
}

/** Indicator light on the front face of cookers. */
export function lightSpot(kind: StationKind): { x: number; y: number } | null {
  if (kind === 'stove') return { x: 66, y: 64 };
  if (kind === 'wok') return { x: 52, y: 64 };
  if (kind === 'fryer') return { x: 66, y: 64 };
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
/** A white hand (tinted with the fruit colour). */
export const CHEF_HAND = '<circle cx="6" cy="6" r="5" fill="#FFFFFF"/>';

/** The fruit head on the chef sprite (the 64x64 avatar art squeezed into a 40 px circle). */
export function chefHead(fruit: Fruit, face: Face): string {
  return `<g transform="translate(12 9) scale(0.625)">${fruitMarkup(fruit, face)}</g>`;
}

export function fruitColor(fruit: Fruit): string {
  return FRUIT_ART[fruit].back?.[1] ?? FRUIT_ART[fruit].body[1];
}

/**
 * A whole chef as one SVG group (key art, phone theme): feet at (x, y), `s` times the 64x84
 * sprite, `arms` 'up' for a throw, 'catch' for both hands out front.
 */
export function chefMarkup(
  fruit: Fruit,
  color: string,
  x: number,
  y: number,
  s: number,
  opts: { face?: Face; flip?: boolean; arms?: 'down' | 'up' | 'catch'; stains?: StainKind[] } = {},
): string {
  const hand = fruitColor(fruit);
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
  return `<g transform="translate(${x - 32 * s} ${y - 80 * s}) scale(${s})${flip}">${CHEF_LEGS}${CHEF_SHIRT.replace('#FFFFFF', color)}${hands}${CHEF_APRON}${stains}${chefHead(fruit, opts.face ?? 'happy')}${CHEF_HAT}</g>`;
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
