/**
 * The static board as one SVG string (cell units). Drawn once per game and shown as inline SVG,
 * so the main screen only repaints pawns, the dice and the HUD.
 */
import { SWATCH } from './colors';
import { BASE_ORIGIN, GRID, homeColumn, type Pt, TRACK } from './geometry';
import { type ColorId, LAST_TRACK, START_ABS, TRACK_LEN } from './logic';

/** The SVG covers the 15x15 grid plus half a cell of frame on every side. */
export const VIEW_PAD = 0.5;
export const VIEW = GRID + VIEW_PAD * 2;

const INK = '#1E1F24';
const CREAM = '#FFF6E3';
const LINE = '#E2D3B4';
const STAR = '#C9B086';

const n2 = (v: number) => Math.round(v * 100) / 100;

function cell(p: Pt, fill: string, extra = ''): string {
  return `<rect x="${n2(p.x + 0.05)}" y="${n2(p.y + 0.05)}" width="0.9" height="0.9" rx="0.14" fill="${fill}" stroke="${LINE}" stroke-width="0.04"${extra}/>`;
}

function star(cx: number, cy: number, r: number, fill: string): string {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    d += `${i ? 'L' : 'M'}${n2(cx + Math.cos(a) * rr)} ${n2(cy + Math.sin(a) * rr)}`;
  }
  return `<path d="${d}Z" fill="${fill}"/>`;
}

/** A small arrow centred on (cx, cy) pointing along (dx, dy). */
function arrow(cx: number, cy: number, dx: number, dy: number, fill: string, s = 0.3): string {
  const px = -dy;
  const py = dx;
  const pt = (a: number, b: number) =>
    `${n2(cx + dx * a * s + px * b * s)} ${n2(cy + dy * a * s + py * b * s)}`;
  return `<path d="M${pt(1.1, 0)} L${pt(-0.2, 1)} L${pt(-0.2, 0.38)} L${pt(-1, 0.38)} L${pt(-1, -0.38)} L${pt(-0.2, -0.38)} L${pt(-0.2, -1)}Z" fill="${fill}"/>`;
}

function dirBetween(a: Pt, b: Pt): Pt {
  return { x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) };
}

export function boardSvg(active: readonly ColorId[], pawns: number): string {
  const v = VIEW_PAD;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-v} ${-v} ${VIEW} ${VIEW}" width="100%" height="100%">${boardBody(active, pawns)}</svg>`;
}

/** The board's inner markup in cell units (frame from -0.5 to 15.5), for embedding elsewhere. */
export function boardBody(active: readonly ColorId[], pawns: number): string {
  const used = new Set(active);
  const out: string[] = [];
  const v = VIEW_PAD;
  out.push(
    `<rect x="${-v + 0.08}" y="${-v + 0.26}" width="${VIEW - 0.16}" height="${VIEW - 0.16}" rx="0.6" fill="#000" opacity="0.28"/>`,
    `<rect x="${-v + 0.08}" y="${-v + 0.08}" width="${VIEW - 0.16}" height="${VIEW - 0.16}" rx="0.6" fill="${INK}"/>`,
    `<rect x="-0.12" y="-0.12" width="15.24" height="15.24" rx="0.32" fill="${CREAM}"/>`,
  );

  // Loop squares.
  const special = new Map<number, string>();
  for (const c of [0, 1, 2, 3] as const) special.set(START_ABS[c], SWATCH[c].main);
  TRACK.forEach((p, i) => {
    out.push(cell(p, special.get(i) ?? '#FFFFFF'));
  });
  for (const c of [0, 1, 2, 3] as const) {
    const s = SWATCH[c];
    // Start square: arrow in the direction of travel.
    const a = TRACK[START_ABS[c]]!;
    const b = TRACK[(START_ABS[c] + 1) % TRACK_LEN]!;
    const d = dirBetween(a, b);
    out.push(arrow(a.x + 0.5, a.y + 0.5, d.x, d.y, '#FFFFFF'));
    // Star square, eight steps on.
    const st = TRACK[(START_ABS[c] + 8) % TRACK_LEN]!;
    out.push(star(st.x + 0.5, st.y + 0.5, 0.36, STAR));
    // Home column and the arrow into it.
    const col = homeColumn(c);
    for (const p of col) out.push(cell(p, s.main));
    const entry = TRACK[(START_ABS[c] + LAST_TRACK) % TRACK_LEN]!;
    const into = dirBetween(entry, col[0]!);
    out.push(arrow(entry.x + 0.5, entry.y + 0.5, into.x, into.y, s.main, 0.32));
  }

  // Bases.
  for (const c of [0, 1, 2, 3] as const) {
    const s = SWATCH[c];
    const o = BASE_ORIGIN[c]!;
    const on = used.has(c);
    out.push(
      `<rect x="${o.x + 0.12}" y="${o.y + 0.12}" width="5.76" height="5.76" rx="0.55" fill="${on ? s.main : s.light}"/>`,
      `<rect x="${o.x + 0.82}" y="${o.y + 0.82}" width="4.36" height="4.36" rx="0.5" fill="${CREAM}"/>`,
    );
    if (!on) continue;
    const slots = pawns <= 2 ? [0, 3] : [0, 1, 2, 3];
    for (const k of slots) {
      const cx = o.x + 2 + (k % 2) * 2;
      const cy = o.y + 2 + Math.floor(k / 2) * 2;
      out.push(
        `<circle cx="${cx}" cy="${cy}" r="0.66" fill="${s.light}" stroke="${s.main}" stroke-width="0.1"/>`,
      );
    }
  }

  // Centre: one triangle per colour pointing at the middle, and a little house.
  const tri = [
    [6, 6, 6, 9],
    [6, 6, 9, 6],
    [9, 6, 9, 9],
    [6, 9, 9, 9],
  ] as const;
  for (const c of [0, 1, 2, 3] as const) {
    const [x1, y1, x2, y2] = tri[c];
    out.push(
      `<path d="M${x1} ${y1} L${x2} ${y2} L7.5 7.5Z" fill="${SWATCH[c].main}" stroke="${CREAM}" stroke-width="0.07" stroke-linejoin="round"/>`,
    );
  }
  out.push(
    `<circle cx="7.5" cy="7.5" r="0.5" fill="${CREAM}" stroke="${INK}" stroke-width="0.07"/>`,
    `<path d="M7.12 7.5 L7.5 7.14 L7.88 7.5Z M7.24 7.46 H7.76 V7.84 H7.24Z" fill="${INK}"/>`,
    `<rect x="7.43" y="7.62" width="0.14" height="0.22" fill="${CREAM}"/>`,
    `<rect x="-0.12" y="-0.12" width="15.24" height="15.24" rx="0.32" fill="none" stroke="${INK}" stroke-width="0.06"/>`,
  );
  return out.join('');
}

/** One pawn (40x48 units), number on its head. */
export function pawnSvg(color: ColorId, label: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 48" width="100%" height="100%">${pawnBody(color, label)}</svg>`;
}

/** A pawn's inner markup on a 40x48 grid. */
export function pawnBody(color: ColorId, label: string): string {
  const s = SWATCH[color];
  return [
    '<ellipse cx="20" cy="44.5" rx="13" ry="3.4" fill="#000" opacity="0.28"/>',
    `<path d="M6.5 43 C6.5 36 11.5 32.5 14.5 29.5 H25.5 C28.5 32.5 33.5 36 33.5 43Z" fill="${s.main}" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>`,
    `<ellipse cx="20" cy="29.5" rx="8.6" ry="3.2" fill="${s.dark}" stroke="${INK}" stroke-width="2.4"/>`,
    `<circle cx="20" cy="16.5" r="11" fill="${s.main}" stroke="${INK}" stroke-width="2.6"/>`,
    '<circle cx="15.5" cy="12" r="2.6" fill="#fff" opacity="0.55"/>',
    `<text x="20" y="21.4" text-anchor="middle" font-family="Baloo 2, sans-serif" font-weight="800" font-size="15" fill="#fff" stroke="${INK}" stroke-width="3" paint-order="stroke">${label}</text>`,
  ].join('');
}
