import type { Fruit } from '@hoorah/protocol';
import { GROUP_COLOR, TILES } from '../../games/juragan/board';
import { ISLANDS, MAP_BOUNDS } from '../../games/juragan/scene/islands';
import { HALF, tileRect } from '../../games/juragan/scene/layout';
import { castHead } from './people';
import { f1, seeded, svgDoc } from './svg';

const INK = '#1E1F24';
/** Board px per board unit before the table perspective. */
const U = 42;
/** The tabletop perspective: board (x, y) to poster px. */
const M = { a: 1, b: 0.08, c: -0.3, d: 0.55, e: 292, f: 116 } as const;

function project(x: number, y: number): [number, number] {
  return [M.a * x + M.c * y + M.e, M.b * x + M.d * y + M.f];
}

/** Board world (x, z) in units to poster px. */
function onBoard(x: number, z: number): [number, number] {
  return project((x + HALF) * U, (z + HALF) * U);
}

function table(): string {
  const rnd = seeded(23);
  const tones = ['#7A4A28', '#83522D', '#76462A', '#8A5732', '#7E4D2B', '#875430', '#7C4B29', '#86532F'];
  let out = '';
  for (let i = 0; i < 8; i++) {
    const x = i * 80;
    out += `<rect x="${x}" width="80" height="360" fill="${tones[i]}"/>`;
    for (let g = 0; g < 3; g++) {
      const gx = x + 10 + rnd() * 60;
      out += `<path d="M${f1(gx)} 0 C${f1(gx + 5)} 120 ${f1(gx - 5)} 240 ${f1(gx)} 360" fill="none" stroke="#4A2812" stroke-width="1.3" opacity="0.28"/>`;
    }
    out += `<rect x="${x}" width="3" height="360" fill="#3E2210" opacity="0.6"/>`;
  }
  // Lamp light pooling on the table.
  out +=
    '<defs><radialGradient id="jg-lamp" cx="0.58" cy="0.55" r="0.75"><stop offset="0" stop-color="#FFD9A0" stop-opacity="0.28"/><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.5"/></radialGradient></defs><rect width="640" height="360" fill="url(#jg-lamp)"/>';
  return out;
}

/** The board in its own (flat) frame, drawn inside the perspective transform. */
function boardFlat(): string {
  const S = HALF * 2 * U;
  let out = `<rect x="-8" y="-8" width="${S + 16}" height="${S + 16}" rx="8" fill="#0B2E37"/>`;
  out += `<rect x="-4" y="-4" width="${S + 8}" height="${S + 8}" rx="6" fill="none" stroke="#E9B43C" stroke-width="1.5"/>`;
  out += `<rect x="${1.5 * U}" y="${1.5 * U}" width="${5 * U}" height="${5 * U}" fill="#0F5664"/>`;
  // The islands in their group colours.
  const bx = 1.7 * U;
  const by = 2.6 * U;
  const bw = 4.6 * U;
  const b = MAP_BOUNDS;
  const bh = (bw * (b.north - b.south)) / (b.east - b.west);
  for (const isl of ISLANDS) {
    const d = isl.points
      .map((p, k) => {
        const x = bx + ((p[0] - b.west) / (b.east - b.west)) * bw;
        const y = by + ((b.north - p[1]) / (b.north - b.south)) * bh;
        return `${k ? 'L' : 'M'}${f1(x)} ${f1(y)}`;
      })
      .join('');
    out += `<path d="${d}Z" fill="${GROUP_COLOR[isl.group]}" stroke="#F8EEDA" stroke-width="0.8" stroke-linejoin="round"/>`;
  }
  out += `<text x="${4 * U}" y="${2.15 * U}" text-anchor="middle" font-family="Baloo 2, ui-rounded, sans-serif" font-weight="800" font-size="${0.42 * U}" fill="#FFC928">JURAGAN NUSANTARA</text>`;
  for (let i = 0; i < TILES.length; i++) {
    const r = tileRect(i);
    const x = (r.cx - r.w / 2 + HALF) * U + 1;
    const y = (r.cz - r.d / 2 + HALF) * U + 1;
    const w = r.w * U - 2;
    const h = r.d * U - 2;
    const t = TILES[i]!;
    const fill =
      t.kind === 'corner' && t.key === 'start'
        ? '#FFC928'
        : t.kind === 'kabar'
          ? '#FFE29A'
          : t.kind === 'corner' && t.key === 'razia'
            ? '#FBE3DA'
            : '#F8EEDA';
    out += `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" rx="2" fill="${fill}"/>`;
    if (t.kind === 'city') {
      const band = 0.3 * U;
      const bandRect = [
        [x, y, w, band],
        [x, y, band, h],
        [x, y + h - band, w, band],
        [x + w - band, y, band, h],
      ][r.side]!;
      out += `<rect x="${f1(bandRect[0]!)}" y="${f1(bandRect[1]!)}" width="${f1(bandRect[2]!)}" height="${f1(bandRect[3]!)}" fill="${GROUP_COLOR[t.group]}"/>`;
      // Printed name and price as soft bars.
      const cx = x + w / 2 + (r.side === 1 ? band / 2 : r.side === 3 ? -band / 2 : 0);
      const cy = y + h / 2 + (r.side === 0 ? band / 2 : r.side === 2 ? -band / 2 : 0);
      out += `<rect x="${f1(cx - w * 0.3)}" y="${f1(cy - 4)}" width="${f1(w * 0.6)}" height="4" rx="1.5" fill="#3B3326"/>`;
      out += `<rect x="${f1(cx - w * 0.2)}" y="${f1(cy + 4)}" width="${f1(w * 0.4)}" height="3" rx="1.5" fill="#9A8F7D"/>`;
    }
  }
  const s = tileRect(0);
  const gx = (s.cx + HALF) * U;
  const gy = (s.cz + HALF) * U;
  out += `<text x="${f1(gx)}" y="${f1(gy - 4)}" text-anchor="middle" font-family="Baloo 2, ui-rounded, sans-serif" font-weight="800" font-size="${0.36 * U}" fill="${INK}">GAJIAN</text>`;
  out += `<path d="M${f1(gx - 18)} ${f1(gy + 12)} H${f1(gx + 12)} V${f1(gy + 7)} L${f1(gx + 22)} ${f1(gy + 14)} L${f1(gx + 12)} ${f1(gy + 21)} V${f1(gy + 16)} H${f1(gx - 18)}Z" fill="#C2410C"/>`;
  return out;
}

/** An upright pawn: glossy body in the player's colour with their fruit as the head. */
function pawn(x: number, y: number, k: number, color: string, fruit: Fruit): string {
  return `<g transform="translate(${f1(x)} ${f1(y)}) scale(${k})">
    <ellipse cx="0" cy="2" rx="22" ry="7" fill="#000" opacity="0.32"/>
    <path d="M-20 0 C-20 -6 -12 -9 -9 -14 C-6 -20 -6 -30 -7 -36 C-8 -40 -13 -41 -13 -45 C-13 -49 13 -49 13 -45 C13 -41 8 -40 7 -36 C6 -30 6 -20 9 -14 C12 -9 20 -6 20 0 Z" fill="${color}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M-12 -6 C-10 -10 -6 -12 -4 -16" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="0.55"/>
    <rect x="-19" y="-5" width="38" height="3" rx="1.5" fill="#FFF8EC"/>
    <g transform="translate(-21 -84) scale(0.66)">${castHead(fruit, 'happy')}</g>
  </g>`;
}

function hotel(x: number, y: number, k: number, roof: string): string {
  let win = '';
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 3; c++)
      win += `<rect x="${-13 + c * 9}" y="${-46 + r * 10}" width="6" height="7" rx="1" fill="#2B3F55"/>`;
  return `<g transform="translate(${f1(x)} ${f1(y)}) scale(${k})">
    <ellipse cx="4" cy="1" rx="22" ry="5" fill="#000" opacity="0.3"/>
    <path d="M17 -2 L25 -7 V-55 L17 -50Z" fill="#E7D9BE" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
    <rect x="-17" y="-50" width="34" height="48" fill="#FFF3DE" stroke="${INK}" stroke-width="1.8"/>
    <path d="M-19 -50 H19 L27 -55 H-11Z" fill="${roof}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
    <rect x="-19" y="-56" width="38" height="7" fill="${roof}" stroke="${INK}" stroke-width="1.8"/>
    ${win}
    <rect x="-5" y="-12" width="10" height="10" fill="#2B3F55"/>
  </g>`;
}

function die(cx: number, cy: number, s: number, rot: number, n: 4 | 5 | 6): string {
  const pips: Record<number, [number, number][]> = {
    4: [
      [0.28, 0.28],
      [0.72, 0.28],
      [0.28, 0.72],
      [0.72, 0.72],
    ],
    5: [
      [0.26, 0.26],
      [0.74, 0.26],
      [0.5, 0.5],
      [0.26, 0.74],
      [0.74, 0.74],
    ],
    6: [
      [0.28, 0.24],
      [0.72, 0.24],
      [0.28, 0.5],
      [0.72, 0.5],
      [0.28, 0.76],
      [0.72, 0.76],
    ],
  };
  const color = n === 4 ? '#D8322A' : INK;
  const dots = pips[n]!.map(
    ([x, y]) => `<circle cx="${f1(x * s)}" cy="${f1(y * s)}" r="${f1(s * 0.085)}" fill="${color}"/>`,
  ).join('');
  return `<g transform="translate(${f1(cx)} ${f1(cy)}) rotate(${rot}) translate(${f1(-s / 2)} ${f1(-s / 2)})">
    <rect x="3" y="${f1(s * 0.12)}" width="${s}" height="${s}" rx="${f1(s * 0.2)}" fill="#000" opacity="0.3"/>
    <rect width="${s}" height="${s}" rx="${f1(s * 0.2)}" fill="#FFF8EC" stroke="${INK}" stroke-width="${f1(s * 0.05)}"/>${dots}</g>`;
}

function coin(x: number, y: number, r: number, tilt: number): string {
  return `<g transform="translate(${f1(x)} ${f1(y)}) rotate(${tilt})">
    <ellipse cx="0" cy="${f1(r * 0.3)}" rx="${r}" ry="${f1(r * 0.55)}" fill="#A87810"/>
    <ellipse cx="0" cy="0" rx="${r}" ry="${f1(r * 0.55)}" fill="#F4C34A" stroke="#8C6410" stroke-width="1.2"/>
    <ellipse cx="0" cy="0" rx="${f1(r * 0.62)}" ry="${f1(r * 0.33)}" fill="none" stroke="#FFE08A" stroke-width="1.2"/></g>`;
}

/** Key art of Juragan Nusantara (640x360): the board on a teak table, fruit pawns, a hotel, dice and coins. */
export function juraganSvg(): string {
  const at = (x: number, z: number) => onBoard(x, z);
  const [hx, hy] = at(-2.0, 2.62);
  const [h2x, h2y] = at(-0.0, 2.62);
  const [p1x, p1y] = at(-3.2, 3.35);
  const [p2x, p2y] = at(-1.95, 3.45);
  const [p3x, p3y] = at(1.0, 3.4);
  const body = [
    table(),
    // Board thickness and its shadow on the table, then the printed top.
    `<g transform="translate(6 16) matrix(${M.a} ${M.b} ${M.c} ${M.d} ${M.e} ${M.f})"><rect x="-8" y="-8" width="${HALF * 2 * U + 16}" height="${HALF * 2 * U + 16}" rx="10" fill="#000" opacity="0.35"/></g>`,
    `<g transform="translate(0 8) matrix(${M.a} ${M.b} ${M.c} ${M.d} ${M.e} ${M.f})"><rect x="-8" y="-8" width="${HALF * 2 * U + 16}" height="${HALF * 2 * U + 16}" rx="8" fill="#06171C"/></g>`,
    `<g transform="matrix(${M.a} ${M.b} ${M.c} ${M.d} ${M.e} ${M.f})">${boardFlat()}</g>`,
    hotel(hx, hy, 0.62, '#F2453D'),
    hotel(h2x, h2y, 0.56, '#2F8CFF'),
    pawn(p3x, p3y, 0.6, '#22B35E', 'nanas'),
    pawn(p2x, p2y, 0.66, '#2F8CFF', 'semangka'),
    pawn(p1x, p1y, 0.82, '#F2453D', 'mangga'),
    // A throw in mid-air and a trail of coins towards the big pawn.
    '<path d="M548 238 Q590 190 612 130" fill="none" stroke="#FFF6E3" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 11" opacity="0.7"/>',
    die(552, 262, 54, -18, 6),
    die(600, 206, 40, 24, 4),
    coin(64, 300, 14, 6),
    coin(92, 318, 13, -10),
    coin(58, 326, 13, 12),
    coin(150, 236, 10, -14),
    coin(178, 214, 9, 18),
  ].join('');
  return svgDoc(640, 360, body);
}
