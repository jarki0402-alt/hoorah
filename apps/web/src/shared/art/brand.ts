/**
 * The Kacawbalaw logo (owner, final 2026-11-24), drawn as SVG markup:
 *  - the wordmark: "kacaw balaw" in Baloo 2 ExtraBold with equal gaps between letters (placed from
 *    measured ink boxes, not the font's advance), every w replaced by one drawn rounded "wave" w;
 *  - the app icon: an orange tile with two tilted ribbons (yellow, cream), an orange w on each;
 *  - the small icon (16-32 px, favicon): one tilted yellow ribbon with one w.
 * The w has one shape everywhere: as tall as the letter a, 1.44 times as wide, stroke a third of
 * its height. Pure string builders (no DOM), shared by the app, tests and the icon script.
 */

export const BRAND = {
  orange: '#FF5A1F',
  yellow: '#FFC928',
  cream: '#FFF7F0',
  ink: '#111214',
} as const;

/** Baloo 2 ExtraBold, per 1000 units of font size: ink left and ink right of each glyph. */
const INK: Record<string, readonly [number, number]> = {
  k: [54, 527],
  a: [28, 492],
  c: [31, 456],
  b: [54, 559],
  l: [57, 227],
};
const ASCENDER = 0.661;
const X_HEIGHT = 0.5;
const GAP = 0.05;
const LEAD = 0.73;
const W_RATIO = 1.44;
const W_STROKE = 1 / 3;
const W_WIDTH = X_HEIGHT * W_RATIO;
const FONT = 'font-family="\'Baloo 2\', system-ui, sans-serif" font-weight="800"';

const r2 = (n: number): string => (Math.round(n * 100) / 100).toString();

/** The drawn w, its ink box at (x, top) sized w x h. */
export function wavePath(
  x: number,
  top: number,
  w: number,
  h: number,
  stroke: number,
  color: string,
): string {
  const x0 = x + stroke / 2;
  const x1 = x + w - stroke / 2;
  const yt = top + stroke / 2;
  const yb = top + h - stroke / 2;
  const q = (x1 - x0) / 4;
  const ym = yt + (yb - yt) * 0.4;
  const p = (...n: number[]) => n.map(r2).join(' ');
  const d =
    `M ${p(x0, yt)} C ${p(x0, yb + stroke * 0.15, x0 + q * 0.95, yb, x0 + q, yb)} ` +
    `C ${p(x0 + q * 1.5, yb, x0 + q * 1.62, ym, x0 + q * 2, ym)} ` +
    `C ${p(x0 + q * 2.38, ym, x0 + q * 2.5, yb, x0 + q * 3, yb)} ` +
    `C ${p(x0 + q * 3.05, yb, x1, yb + stroke * 0.15, x1, yt)}`;
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${r2(stroke)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** The w centred on (cx, cy), `h` tall. */
function centredW(cx: number, cy: number, h: number, color: string): string {
  const hh = h * (1 + 0.012 / X_HEIGHT);
  return wavePath(cx - (W_RATIO * h) / 2, cy - hh / 2, W_RATIO * h, hh, W_STROKE * h, color);
}

function inkWidth(word: string): number {
  let w = 0;
  for (const ch of word) {
    const box = INK[ch];
    w += box ? (box[1] - box[0]) / 1000 : W_WIDTH;
  }
  return w + GAP * (word.length - 1);
}

/** One word set at font size `s`, its ink starting at x; returns markup. */
function setWord(word: string, x: number, base: number, s: number, text: string, accent: string): string {
  let out = '';
  let at = x;
  for (const ch of word) {
    const box = INK[ch];
    if (box) {
      out += `<text x="${r2(at - (box[0] / 1000) * s)}" y="${r2(base)}" ${FONT} font-size="${r2(s)}" fill="${text}">${ch}</text>`;
      at += ((box[1] - box[0]) / 1000) * s;
    } else {
      const h = X_HEIGHT * s;
      out += wavePath(at, base - h, W_WIDTH * s, h * (1 + 0.012 / X_HEIGHT), W_STROKE * h, accent);
      at += W_WIDTH * s;
    }
    at += GAP * s;
  }
  return out;
}

export type WordmarkLayout = 'stack' | 'line';
/** Background the wordmark sits on: cream text and yellow w, or ink text and orange w on light. */
export type WordmarkTone = 'dark' | 'light';

export interface SvgArt {
  markup: string;
  viewBox: string;
  /** Width divided by height. */
  aspect: number;
}

/** "kacaw" over "balaw" (right aligned, the two w's in one column), or both on one line. */
export function wordmark(layout: WordmarkLayout, tone: WordmarkTone = 'dark'): SvgArt {
  const s = 100;
  const text = tone === 'dark' ? BRAND.cream : BRAND.ink;
  const accent = tone === 'dark' ? BRAND.yellow : BRAND.orange;
  const top = inkWidth('kacaw') * s;
  const bottom = inkWidth('balaw') * s;
  const pad = 0.03 * s;
  if (layout === 'line') {
    const base = ASCENDER * s;
    const markup =
      setWord('kacaw', 0, base, s, text, accent) + setWord('balaw', top + GAP * s, base, s, text, accent);
    const w = top + GAP * s + bottom + 2 * pad;
    const h = base + 0.04 * s + 2 * pad;
    return { markup, viewBox: `${r2(-pad)} ${r2(-pad)} ${r2(w)} ${r2(h)}`, aspect: w / h };
  }
  const width = Math.max(top, bottom);
  const b1 = ASCENDER * s;
  const b2 = b1 + LEAD * s;
  const markup =
    setWord('kacaw', width - top, b1, s, text, accent) +
    setWord('balaw', width - bottom, b2, s, text, accent);
  const w = width + 2 * pad;
  const h = b2 + 0.04 * s + 2 * pad;
  return { markup, viewBox: `${r2(-pad)} ${r2(-pad)} ${r2(w)} ${r2(h)}`, aspect: w / h };
}

export type IconKind = 'two' | 'one';

/**
 * The app icon on a 200 x 200 grid. `two`: two tilted ribbons (the app icon); `one`: one ribbon,
 * for 16-32 px. `square` fills the corners (home-screen icons, the system rounds them itself).
 */
export function iconMarkup(kind: IconKind, square = false): string {
  const { orange, yellow, cream } = BRAND;
  const tile = square
    ? `<rect width="200" height="200" fill="${orange}"/>`
    : `<rect width="200" height="200" rx="52" fill="${orange}"/>`;
  if (kind === 'one') {
    return (
      tile +
      `<g transform="rotate(-6 100 100)"><rect x="24" y="48" width="152" height="104" rx="26" fill="${yellow}"/>` +
      `${centredW(100, 100, 64, orange)}</g>`
    );
  }
  return (
    tile +
    `<g transform="rotate(-5 100 70)"><rect x="38" y="32" width="124" height="76" rx="20" fill="${yellow}"/>` +
    `${centredW(100, 70, 46, orange)}</g>` +
    `<g transform="rotate(4 100 138)"><rect x="38" y="100" width="124" height="76" rx="20" fill="${cream}" ` +
    `stroke="${orange}" stroke-width="6" paint-order="stroke"/>${centredW(100, 138, 46, orange)}</g>`
  );
}

/** A standalone SVG file of the icon (favicon, home-screen icon source). */
export function iconSvg(kind: IconKind, square = false): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><title>Kacawbalaw</title>` +
    `${iconMarkup(kind, square)}</svg>\n`
  );
}
