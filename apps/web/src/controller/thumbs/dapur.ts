/**
 * Dapur Heboh option pictures, drawn with the game's own art: the kitchen floor plan the main
 * screen shows on its setup cards, and the chilies of each level. Keys: `kitchen-<KitchenId>`,
 * `level-<Difficulty>`.
 */
import { chiliMarkup, kitchenThumb } from '../../games/dapur/art';
import { COLS, DIFFICULTIES, KITCHEN_DEFS, KITCHENS, ROWS } from '../../games/dapur/kitchens';
import { THUMB_H, THUMB_W, thumbSvg } from './frame';

const K = '#111214';

/** Plan cell size: whole pixels keep the markup short (the plan is scaled to the thumbnail). */
const CELL = 11;

/** The kitchen plan keeps its 2:1 grid between a tiled wall strip and the counter edge. */
function kitchen(id: (typeof KITCHENS)[number]): string {
  const h = THUMB_W / 2;
  const top = (THUMB_H - h) / 2;
  const s = THUMB_W / (COLS * CELL);
  return thumbSvg(
    '#EFE8DC',
    `<path d="M0 ${top / 2}h${THUMB_W}" stroke="#DCD3C3" stroke-width="2"/>` +
      `<g transform="translate(0 ${top}) scale(${s.toFixed(4)} ${(h / (ROWS * CELL)).toFixed(4)})">${kitchenThumb(KITCHEN_DEFS[id], COLS * CELL, ROWS * CELL)}</g>` +
      `<rect x="0" y="${top + h}" width="${THUMB_W}" height="${top}" fill="#B07A45"/>` +
      `<path d="M0 ${top + h}h${THUMB_W}" stroke="${K}" stroke-width="2.5"/>`,
  );
}

const LEVEL_BG = { santai: '#DDF4E5', normal: '#FFF2C4', heboh: '#FFE0DE' } as const;

/** One to three big chilies; Heboh also gets a little flame behind them. */
function level(d: (typeof DIFFICULTIES)[number], n: number): string {
  const s = 3.4;
  const w = (13 * (n - 1) + 14) * s;
  const x0 = (THUMB_W - w) / 2;
  const chilies = Array.from({ length: n }, (_, i) => chiliMarkup(x0 + i * 13 * s, 30, s)).join('');
  const flame =
    d === 'heboh'
      ? `<path d="M80 112c-30 0-40-22-28-40 2 10 8 14 12 14-4-16 6-30 18-36-2 12 4 18 10 24 4-6 4-12 2-18 14 10 18 26 14 38-4 12-14 18-28 18Z" fill="#FF8A1F" opacity="0.55"/>`
      : '';
  return thumbSvg(LEVEL_BG[d], flame + chilies);
}

export const THUMBS: Record<string, () => string> = Object.fromEntries([
  ...KITCHENS.map((k) => [`kitchen-${k}`, () => kitchen(k)] as const),
  ...DIFFICULTIES.map((d, i) => [`level-${d}`, () => level(d, i + 1)] as const),
]);
