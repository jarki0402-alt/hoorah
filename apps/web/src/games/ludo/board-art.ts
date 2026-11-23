/**
 * The static board as one SVG string (cell units). Drawn once per game and shown as inline SVG,
 * so the main screen only repaints pawns, the dice and the HUD.
 */
import { SWATCH } from './colors';
import { BASE_ORIGIN, GRID, geometryFor, POLY_FRAME, type Pt, polyFrame, TRACK } from './geometry';
import type { BoardSpec, ColorId } from './logic';

/** The SVG covers the 15x15 grid plus half a cell of frame on every side (polygons fit inside). */
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

export function boardSvg(spec: BoardSpec, active: readonly ColorId[], pawns: number): string {
  const v = VIEW_PAD;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-v} ${-v} ${VIEW} ${VIEW}" width="100%" height="100%">${boardBody(spec, active, pawns)}</svg>`;
}

/** The board's inner markup in board units (frame from -0.5 to 15.5), for embedding elsewhere. */
export function boardBody(spec: BoardSpec, active: readonly ColorId[], pawns: number): string {
  return spec.sides === 4 ? classicBody(spec, active, pawns) : polygonBody(spec, pawns);
}

function classicBody(spec: BoardSpec, active: readonly ColorId[], pawns: number): string {
  const g = geometryFor(spec);
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
  for (const c of [0, 1, 2, 3] as const) special.set(spec.start[c]!, SWATCH[c].main);
  TRACK.forEach((p, i) => {
    out.push(cell(p, special.get(i) ?? '#FFFFFF'));
  });
  for (const c of [0, 1, 2, 3] as const) {
    const s = SWATCH[c];
    // Start square: arrow in the direction of travel.
    const a = TRACK[spec.start[c]!]!;
    const b = TRACK[(spec.start[c]! + 1) % spec.trackLen]!;
    const d = dirBetween(a, b);
    out.push(arrow(a.x + 0.5, a.y + 0.5, d.x, d.y, '#FFFFFF'));
    // Star square.
    const st = TRACK[spec.star[c]!]!;
    out.push(star(st.x + 0.5, st.y + 0.5, 0.36, STAR));
    // Home column and the arrow into it.
    const col = g.homeColumn(c).map((p) => ({ x: p.x - 0.5, y: p.y - 0.5 }));
    for (const p of col) out.push(cell(p, s.main));
    const entry = TRACK[(spec.start[c]! + spec.lastTrack) % spec.trackLen]!;
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

const pts = (a: readonly Pt[]) => a.map((p) => `${n2(p.x)},${n2(p.y)}`).join(' ');

/** An arrow centred on (cx, cy) pointing at angle `ang` (radians). */
function arrowAt(cx: number, cy: number, ang: number, s: number, fill: string): string {
  return arrow(cx, cy, Math.cos(ang), Math.sin(ang), fill, s);
}

/** 5 to 8 colours: a regular polygon with one side, one home column and one base per colour. */
function polygonBody(spec: BoardSpec, pawns: number): string {
  const f = polyFrame(spec);
  const n = f.n;
  const out: string[] = [];
  const ring = (r: number, dy = 0) =>
    pts(Array.from({ length: n }, (_, i) => f.vertex(i, r)).map((p) => ({ x: p.x, y: p.y + dy })));
  const outer = f.R + POLY_FRAME / Math.cos(Math.PI / n);
  out.push(
    `<polygon points="${ring(outer - 0.08, 0.18)}" fill="#000" opacity="0.28" stroke="#000" stroke-width="0.16" stroke-linejoin="round"/>`,
    `<polygon points="${ring(outer - 0.08)}" fill="${INK}" stroke="${INK}" stroke-width="0.16" stroke-linejoin="round"/>`,
    `<polygon points="${ring(f.R + 0.14)}" fill="${CREAM}" stroke="${CREAM}" stroke-width="0.12" stroke-linejoin="round"/>`,
  );
  const starts = new Map<number, ColorId>();
  const entries = new Map<number, ColorId>();
  const stars = new Set<number>();
  for (let c = 0; c < n; c++) {
    starts.set(spec.start[c]!, c as ColorId);
    entries.set((spec.start[c]! + spec.lastTrack) % spec.trackLen, c as ColorId);
    stars.add(spec.star[c]!);
  }
  const g = geometryFor(spec);
  for (let abs = 0; abs < spec.trackLen; abs++) {
    const q = f.square(abs);
    const owner = starts.get(abs);
    out.push(
      `<polygon points="${pts(q)}" fill="${owner !== undefined ? SWATCH[owner].main : '#FFFFFF'}" stroke="${LINE}" stroke-width="0.05" stroke-linejoin="round"/>`,
    );
    const c = g.track(abs);
    const dir = Math.atan2(q[1]!.y - q[0]!.y, q[1]!.x - q[0]!.x);
    if (owner !== undefined) out.push(arrowAt(c.x, c.y, dir, f.d * 0.3, '#FFFFFF'));
    else if (stars.has(abs)) out.push(star(c.x, c.y, f.d * 0.34, STAR));
    const into = entries.get(abs);
    if (into !== undefined) out.push(arrowAt(c.x, c.y, dir + Math.PI / 2, f.d * 0.28, SWATCH[into].main));
  }
  for (let c = 0; c < n; c++) {
    for (let j = 0; j < 5; j++)
      out.push(
        `<polygon points="${pts(f.lane(c, j))}" fill="${SWATCH[c as ColorId].main}" stroke="${CREAM}" stroke-width="0.07" stroke-linejoin="round"/>`,
      );
  }
  const hubR = f.hub / Math.cos(Math.PI / n);
  for (let c = 0; c < n; c++) {
    const a = f.vertex(c, hubR);
    const b = f.vertex(c + 1, hubR);
    out.push(
      `<path d="M${n2(a.x)} ${n2(a.y)} L${n2(b.x)} ${n2(b.y)} L${n2(f.cx)} ${n2(f.cy)}Z" fill="${SWATCH[c as ColorId].main}" stroke="${CREAM}" stroke-width="0.07" stroke-linejoin="round"/>`,
    );
  }
  const hr = Math.min(0.5, f.hub * 0.42);
  const k = hr / 0.5;
  const hx = (dx: number) => n2(f.cx + dx * k);
  const hy = (dy: number) => n2(f.cy + dy * k);
  out.push(
    `<circle cx="${n2(f.cx)}" cy="${n2(f.cy)}" r="${n2(hr)}" fill="${CREAM}" stroke="${INK}" stroke-width="0.07"/>`,
    `<path d="M${hx(-0.38)} ${hy(0)} L${hx(0)} ${hy(-0.36)} L${hx(0.38)} ${hy(0)}Z M${hx(-0.26)} ${hy(-0.04)} H${hx(0.26)} V${hy(0.34)} H${hx(-0.26)}Z" fill="${INK}"/>`,
  );
  for (let c = 0; c < n; c++) {
    const s = SWATCH[c as ColorId];
    const y = f.yard(c);
    out.push(
      `<circle cx="${n2(y.x)}" cy="${n2(y.y)}" r="${n2(y.r)}" fill="${s.main}"/>`,
      `<circle cx="${n2(y.x)}" cy="${n2(y.y)}" r="${n2(y.r * 0.8)}" fill="${CREAM}"/>`,
    );
    for (let p = 0; p < pawns; p++) {
      const slot = g.baseSlot(c as ColorId, p, pawns);
      out.push(
        `<circle cx="${n2(slot.x)}" cy="${n2(slot.y)}" r="${n2(y.r * 0.24)}" fill="${s.light}" stroke="${s.main}" stroke-width="${n2(f.d * 0.1)}"/>`,
      );
    }
  }
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
