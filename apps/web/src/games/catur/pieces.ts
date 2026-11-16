/**
 * Original flat chess pieces, drawn as SVG on a 100x100 box. Chunky silhouettes with a thick
 * ink outline so they read at 36 px on a phone and from the sofa on the main screen. Used by
 * the main screen (as images) and by the phone board (as <symbol>s), so both look the same.
 */

const INK = '#111214';

interface Skin {
  body: string;
  base: string;
  line: string;
  shine: string;
}

const SKIN: Record<'w' | 'b', Skin> = {
  w: { body: '#FFF7F0', base: '#E8D6BF', line: INK, shine: '#FFFFFF' },
  b: { body: '#33353B', base: '#23252A', line: INK, shine: '#5A5D66' },
};

const outline = (d: string, fill: string) =>
  `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/>`;
const detail = (d: string, color: string, w = 3.5) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const ball = (cx: number, cy: number, r: number, fill: string) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${INK}" stroke-width="4.5"/>`;

/** Shared foot: a wide rounded plinth. */
const BASE = 'M19 92 V86 Q19 79 27 79 H73 Q81 79 81 86 V92 Z';

function piece(type: string, s: Skin): string {
  const base = outline(BASE, s.base);
  switch (type) {
    case 'p':
      return [
        outline('M33 80 C35 68 41 61 42 54 H58 C59 61 65 68 67 80 Z', s.body),
        outline('M35 49 Q35 46 38 46 H62 Q65 46 65 49 V53 Q65 56 62 56 H38 Q35 56 35 53 Z', s.base),
        ball(50, 31, 15, s.body),
        detail('M43 26 Q46 22 51 22', s.shine, 3),
        base,
      ].join('');
    case 'r':
      return [
        outline('M30 80 L33 46 H67 L70 80 Z', s.body),
        outline('M25 46 V16 H36 V24 H44 V16 H56 V24 H64 V16 H75 V46 Z', s.body),
        detail('M28 47 H72', INK, 4.5),
        detail('M36 58 V70 M50 58 V70 M64 58 V70', s.base, 3.5),
        base,
      ].join('');
    case 'n':
      return [
        outline(
          'M30 80 C29 67 35 59 45 54 C39 53 33 57 27 60 C20 63 14 57 16 50 C18 42 28 35 32 27 C35 21 39 17 43 15 L45 6 L52 13 C66 15 76 28 76 47 C76 60 72 70 71 80 Z',
          s.body,
        ),
        detail('M56 18 C66 24 70 35 70 50', s.base, 4),
        `<circle cx="39" cy="30" r="4" fill="${INK}"/>`,
        detail('M21 51 L25 50', INK, 3.5),
        base,
      ].join('');
    case 'b':
      return [
        outline('M33 80 C37 70 41 63 42 57 H58 C59 63 63 70 67 80 Z', s.body),
        outline('M35 51 Q35 48 38 48 H62 Q65 48 65 51 V55 Q65 58 62 58 H38 Q35 58 35 55 Z', s.base),
        outline('M50 15 C66 25 68 39 61 48 H39 C32 39 34 25 50 15 Z', s.body),
        detail('M57 26 L47 38', INK, 4.5),
        ball(50, 10, 5.5, s.body),
        base,
      ].join('');
    case 'q':
      return [
        outline('M29 80 C33 68 37 59 38 51 H62 C63 59 67 68 71 80 Z', s.body),
        outline('M28 46 L21 21 L37 33 L50 15 L63 33 L79 21 L72 46 Z', s.body),
        outline('M33 44 Q33 41 36 41 H64 Q67 41 67 44 V49 Q67 52 64 52 H36 Q33 52 33 49 Z', s.base),
        ball(21, 18, 6, s.body),
        ball(50, 11, 6, s.body),
        ball(79, 18, 6, s.body),
        base,
      ].join('');
    default:
      // King
      return [
        outline('M30 80 C34 68 37 59 38 52 H62 C63 59 66 68 70 80 Z', s.body),
        outline(
          'M33 46 C23 38 25 23 37 23 C43 23 47 27 50 32 C53 27 57 23 63 23 C75 23 77 38 67 46 Z',
          s.body,
        ),
        outline('M33 45 Q33 42 36 42 H64 Q67 42 67 45 V50 Q67 53 64 53 H36 Q33 53 33 50 Z', s.base),
        outline('M46 3 H54 V9 H60 V17 H54 V27 H46 V17 H40 V9 H46 Z', s.body),
        base,
      ].join('');
  }
}

/** SVG body (no <svg> wrapper) of one piece on a 100x100 box. `p` is a FEN letter. */
export function pieceBody(p: string): string {
  const color = p === p.toUpperCase() ? 'w' : 'b';
  return piece(p.toLowerCase(), SKIN[color]);
}

export function pieceSvg(p: string, size = 100): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">${pieceBody(p)}</svg>`;
}

const urls = new Map<string, string>();

/** Data URL of a piece image (memoized). */
export function pieceUrl(p: string): string {
  let u = urls.get(p);
  if (!u) {
    u = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pieceSvg(p))}`;
    urls.set(p, u);
  }
  return u;
}

/** All twelve pieces as <symbol id="{prefix}{letter}"> for one inline SVG board. */
export function pieceSymbols(prefix: string): string {
  return 'PNBRQKpnbrqk'
    .split('')
    .map((p) => `<symbol id="${prefix}${p}" viewBox="0 0 100 100">${pieceBody(p)}</symbol>`)
    .join('');
}

/** Board palette shared by the phone and the main screen. */
export const BOARD = {
  light: '#EFDDBA',
  dark: '#B9875B',
  frame: '#4A3324',
  frameEdge: '#2E1F15',
  coord: '#EFDDBA',
  last: 'rgba(255, 201, 40, 0.55)',
  check: '#F2453D',
  select: '#FF5A1F',
  dot: 'rgba(17, 18, 20, 0.28)',
} as const;
