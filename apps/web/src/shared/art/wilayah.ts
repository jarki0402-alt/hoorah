import { type Face, fruitMarkup } from './fruits';
import { f1, svgDoc } from './svg';

/**
 * Key art of Rebut Wilayah (640x360): a dark tegel courtyard seen from above, tilted a little,
 * with smooth painted territories. An orange jeruk curves home along its dashed trail to close a
 * round loop, while a teal nanas cuts across the trail in a burst of sparks. The top left stays
 * plain floor for the logo.
 */

const T = 40;
/** The floor is tilted by this much around the poster centre and nudged left. */
const TILT = -7;
const SHIFT_X = -36;
const SHIFT_Y = -4;

/** Poster px of a cell centre on the tilted floor. */
function toPoster(c: number, r: number): [number, number] {
  const a = (TILT * Math.PI) / 180;
  const dx = (c + 0.5) * T + SHIFT_X - 320;
  const dy = (r + 0.5) * T + SHIFT_Y - 180;
  return [f1(320 + dx * Math.cos(a) - dy * Math.sin(a)), f1(180 + dx * Math.sin(a) + dy * Math.cos(a))];
}

type Pt = readonly [number, number];

interface Land {
  /** Outline in cell units, smoothed into a curve. */
  outline: readonly Pt[];
  face: string;
  lip: string;
  light: string;
}

/** Poster px (on the untilted floor) of a point in cell units, measured from cell centres. */
const px = ([c, r]: Pt): Pt => [(c + 0.5) * T, (r + 0.5) * T];

/** A smooth curve through points (Catmull-Rom as cubic Beziers), closed or open. */
function smooth(pts: readonly Pt[], closed: boolean): string {
  const n = pts.length;
  const at = (i: number): Pt => px(closed ? pts[(i + n) % n]! : pts[Math.max(0, Math.min(n - 1, i))]!);
  const p0 = at(0);
  let d = `M${f1(p0[0])} ${f1(p0[1])}`;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = at(i - 1);
    const b = at(i);
    const c = at(i + 1);
    const e = at(i + 2);
    d += ` C${f1(b[0] + (c[0] - a[0]) / 6)} ${f1(b[1] + (c[1] - a[1]) / 6)} ${f1(c[0] - (e[0] - b[0]) / 6)} ${f1(c[1] - (e[1] - b[1]) / 6)} ${f1(c[0])} ${f1(c[1])}`;
  }
  return closed ? `${d}Z` : d;
}

/** A painted territory as a raised slab with soft, rounded edges: shadow, lip, light rim, face, brush strokes. */
function land(l: Land): string {
  const d = smooth(l.outline, true);
  return [
    `<path d="${d}" fill="#000" opacity="0.35" transform="translate(5 14)"/>`,
    `<path d="${d}" fill="${l.lip}" transform="translate(0 9)"/>`,
    `<path d="${d}" fill="${l.light}" transform="translate(-3 -4)"/>`,
    `<path d="${d}" fill="${l.face}"/>`,
    `<path d="${d}" fill="url(#wlk-brush)"/>`,
  ].join('');
}

function trail(points: readonly Pt[], color: string): string {
  const d = smooth(points, false);
  return [
    `<path d="${d}" fill="none" stroke="#0B0C0E" stroke-opacity="0.65" stroke-width="27" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<path d="${d}" fill="none" stroke="#FFF6EC" stroke-width="7" stroke-dasharray="16 14"/>`,
  ].join('');
}

function head(
  x: number,
  y: number,
  r: number,
  ring: string,
  fruit: Parameters<typeof fruitMarkup>[0],
  face: Face,
  dir: number,
): string {
  const s = ((r - 4) * 2) / 64;
  return [
    `<ellipse cx="${x}" cy="${f1(y + r * 0.8)}" rx="${f1(r * 1.05)}" ry="${f1(r * 0.42)}" fill="#000" opacity="0.4"/>`,
    `<g transform="rotate(${dir} ${x} ${y})"><path d="M${f1(x + r + 2)} ${f1(y - 13)} L${f1(x + r + 21)} ${y} L${f1(x + r + 2)} ${f1(y + 13)}Z" fill="${ring}" stroke="#111214" stroke-width="3" stroke-linejoin="round"/></g>`,
    `<circle cx="${x}" cy="${y}" r="${r + 3}" fill="#111214"/>`,
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${ring}"/>`,
    `<circle cx="${x}" cy="${y}" r="${r - 6}" fill="#FFFAF0"/>`,
    `<g transform="translate(${f1(x - r + 4)} ${f1(y - r + 4)}) scale(${f1(s * 100) / 100})">${fruitMarkup(fruit, face)}</g>`,
  ].join('');
}

export function wilayahSvg(): string {
  const orange: Land = {
    face: '#FF8A3D',
    lip: '#9A4A1C',
    light: '#FFC59C',
    outline: [
      [-2, 4.4],
      [0.8, 3.6],
      [2.6, 4.1],
      [4.6, 4.8],
      [6.9, 5.7],
      [7.7, 7.4],
      [9.3, 8.1],
      [9.5, 10.6],
      [-2, 10.6],
    ],
  };
  const teal: Land = {
    face: '#14B8A6',
    lip: '#0B6A60',
    light: '#8CE3D9',
    outline: [
      [11.6, -2],
      [11.9, 0.8],
      [12.8, 2.2],
      [13.6, 3.6],
      [15.2, 4.5],
      [18.6, 4.9],
      [18.6, -2],
    ],
  };
  const blue: Land = {
    face: '#2F8CFF',
    lip: '#1A4F92',
    light: '#A6CDFF',
    outline: [
      [10.7, 8.3],
      [12, 7.6],
      [13.3, 6.8],
      [16.1, 6.6],
      [18.6, 7.1],
      [18.6, 11.6],
      [10.5, 11.6],
    ],
  };
  // The orange loop: a smooth arc out of its land, round to the right and back toward home.
  const loop: Pt[] = [
    [6.1, 6],
    [6.6, 4.9],
    [8.4, 4.7],
    [9.9, 4.1],
    [10.2, 2.8],
    [9.1, 1.8],
    [7.2, 1.8],
    [6, 3],
  ];
  const end = loop[loop.length - 1]!;
  const before = loop[loop.length - 2]!;
  const dir = (Math.atan2(end[1] - before[1], end[0] - before[0]) * 180) / Math.PI;
  // Where the nanas crosses the loop's right side, in cell units.
  const cut = { c: 10.1, r: 3.3 };
  const cx = (cut.c + 0.5) * T;
  const cy = (cut.r + 0.5) * T;
  const sparks = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2 + 0.3;
    const r0 = 18;
    const r1 = i % 2 ? 44 : 34;
    return `M${f1(cx + Math.cos(a) * r0)} ${f1(cy + Math.sin(a) * r0)} L${f1(cx + Math.cos(a) * r1)} ${f1(cy + Math.sin(a) * r1)}`;
  }).join(' ');

  const floor = [
    '<defs>',
    `<pattern id="wlk-tegel" width="${T * 2}" height="${T * 2}" patternUnits="userSpaceOnUse">`,
    `<rect width="${T * 2}" height="${T * 2}" fill="#25272C"/>`,
    `<rect x="${T}" width="${T}" height="${T}" fill="#222328"/><rect y="${T}" width="${T}" height="${T}" fill="#222328"/>`,
    `<path d="M0 ${T - 1.5}h${T * 2}v3H0Z M0 ${T * 2 - 1.5}h${T * 2}v1.5H0Z M0 0h${T * 2}v1.5H0Z M${T - 1.5} 0v${T * 2}h3V0Z M${T * 2 - 1.5} 0v${T * 2}h1.5V0Z M0 0v${T * 2}h1.5V0Z" fill="#1A1B1F"/>`,
    `<rect x="${T / 2 - 3}" y="${T / 2 - 3}" width="6" height="6" rx="1" fill="#2C2E34"/>`,
    `<rect x="${T * 1.5 - 3}" y="${T * 1.5 - 3}" width="6" height="6" rx="1" fill="#2C2E34"/>`,
    '</pattern>',
    `<pattern id="wlk-brush" width="${T / 2}" height="${T / 2}" patternUnits="userSpaceOnUse">`,
    `<path d="M${T / 2} 0 L0 ${T / 2}" stroke="#FFFFFF" stroke-opacity="0.16" stroke-width="3.5"/>`,
    '</pattern>',
    '<pattern id="wlk-claim" width="12" height="12" patternUnits="userSpaceOnUse">',
    '<path d="M12 0 L0 12" stroke="#FF8A3D" stroke-opacity="0.55" stroke-width="3"/>',
    '</pattern>',
    '</defs>',
  ].join('');

  const world = [
    `<rect x="-200" y="-200" width="1100" height="800" fill="url(#wlk-tegel)"/>`,
    land(blue),
    land(teal),
    land(orange),
    // The round area the loop is about to claim, hatched in orange.
    `<path d="${smooth(loop, true)}" fill="url(#wlk-claim)"/>`,
    trail(loop, '#FF8A3D'),
    // The nanas' own short trail from its land.
    trail(
      [
        [12.6, 3.1],
        [11.6, 3.25],
        [cut.c - 0.5, cut.r],
      ],
      '#14B8A6',
    ),
    `<path d="${sparks}" stroke="#FFE27A" stroke-width="5" stroke-linecap="round"/>`,
    `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="12" fill="#FFF6D6"/>`,
  ].join('');

  // Markers are drawn upright over the tilted floor.
  const [jx, jy] = toPoster(end[0], end[1]);
  const [nx, ny] = toPoster(cut.c - 0.8, cut.r);
  const markers = [
    // Speed lines behind both heads.
    `<path d="M${f1(jx - 22)} ${f1(jy - 50)} v-24 M${jx} ${f1(jy - 56)} v-32 M${f1(jx + 22)} ${f1(jy - 50)} v-24" stroke="#FFF6EC" stroke-width="5" stroke-linecap="round" opacity="0.7"/>`,
    `<path d="M${f1(nx + 50)} ${f1(ny - 16)} h22 M${f1(nx + 56)} ${ny} h30 M${f1(nx + 50)} ${f1(ny + 16)} h20" stroke="#FFF6EC" stroke-width="5" stroke-linecap="round" opacity="0.7"/>`,
    head(jx, jy, 40, '#FF8A3D', 'jeruk', 'effort', dir + TILT),
    head(nx, ny, 34, '#14B8A6', 'nanas', 'wow', 180 + TILT),
  ].join('');

  const body = [
    floor,
    '<rect width="640" height="360" fill="#1C1D21"/>',
    `<g transform="rotate(${TILT} 320 180) translate(${SHIFT_X} ${SHIFT_Y})">${world}</g>`,
    markers,
  ].join('');
  return svgDoc(640, 360, body);
}
