/**
 * Ular Tangga art: bamboo ladders, cartoon snakes, the woven-mat backdrop and the 640x360 poster.
 * The drawing helpers work in pixels and are shared by the poster and the game's board.
 */
import type { Fruit } from '@hoorah/protocol';
import { castHead } from './people';
import { f1, svgDoc } from './svg';

export interface P {
  x: number;
  y: number;
}

export interface SnakeColors {
  body: string;
  band: string;
  belly: string;
}

/** Snake skins: no violet, all readable on the light board cells. */
export const SNAKE_SKINS: SnakeColors[] = [
  { body: '#3E9E4A', band: '#FFD23F', belly: '#A6DB7A' },
  { body: '#E2543A', band: '#FFF1C9', belly: '#FF9E7A' },
  { body: '#1F8F86', band: '#FF9A3D', belly: '#7FD6C8' },
  { body: '#F08A24', band: '#5A3B1A', belly: '#FFC98A' },
  { body: '#2F7FD1', band: '#FFD23F', belly: '#8CC2F2' },
];

const OUTLINE = '#3A2410';

/** A bamboo ladder from its foot `a` to its top `b`; `w` is the distance between the rails. */
export function ladderMarkup(a: P, b: P, w: number, rungGap = Math.max(w * 0.62, 10)): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const ext = w * 0.35;
  const rail = Math.max(3, w * 0.17);
  const pt = (t: number, side: number) => ({
    x: a.x - ux * ext + ux * (len + 2 * ext) * t + nx * side * (w / 2),
    y: a.y - uy * ext + uy * (len + 2 * ext) * t + ny * side * (w / 2),
  });
  const line = (p: P, q: P) => `M${f1(p.x)} ${f1(p.y)}L${f1(q.x)} ${f1(q.y)}`;
  const rails = line(pt(0, -1), pt(1, -1)) + line(pt(0, 1), pt(1, 1));
  const total = len + 2 * ext;
  const n = Math.max(2, Math.floor(total / rungGap));
  let rungs = '';
  for (let i = 1; i < n; i++) {
    const t = i / n;
    rungs += line(pt(t, -1), pt(t, 1));
  }
  // Bamboo nodes: short dark bands across each rail.
  let nodes = '';
  const nodeGap = Math.max(w * 1.1, 18);
  const m = Math.max(1, Math.floor(total / nodeGap));
  for (let i = 1; i <= m; i++) {
    const t = (i - 0.5) / m;
    for (const side of [-1, 1]) {
      const c = pt(t, side);
      nodes += line(
        { x: c.x - nx * rail * 0.75, y: c.y - ny * rail * 0.75 },
        { x: c.x + nx * rail * 0.75, y: c.y + ny * rail * 0.75 },
      );
    }
  }
  const sh = `transform="translate(${f1(rail * 0.5)} ${f1(rail * 0.8)})"`;
  return [
    `<g ${sh} opacity="0.22" stroke="#000" stroke-linecap="round" fill="none"><path d="${rails}" stroke-width="${f1(rail + 3)}"/><path d="${rungs}" stroke-width="${f1(rail * 0.8 + 3)}"/></g>`,
    `<g stroke-linecap="round" fill="none">`,
    `<path d="${rungs}" stroke="${OUTLINE}" stroke-width="${f1(rail * 0.8 + 3)}"/>`,
    `<path d="${rungs}" stroke="#D9AE45" stroke-width="${f1(rail * 0.8)}"/>`,
    `<path d="${rails}" stroke="${OUTLINE}" stroke-width="${f1(rail + 3)}"/>`,
    `<path d="${rails}" stroke="#E8C55A" stroke-width="${f1(rail)}"/>`,
    `<path d="${nodes}" stroke="#A07A1E" stroke-width="${f1(Math.max(1.5, rail * 0.32))}"/>`,
    `</g>`,
  ].join('');
}

/**
 * A cartoon snake along `pts` (head first, at least 3 points). The body tapers from `wHead` to a
 * thin tail, with bands across it and a friendly head looking away from the body.
 */
export function snakeMarkup(pts: P[], wHead: number, skin: SnakeColors): string {
  const n = pts.length;
  const left: P[] = [];
  const right: P[] = [];
  const widths: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const prev = pts[Math.max(0, i - 1)]!;
    const next = pts[Math.min(n - 1, i + 1)]!;
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const l = Math.hypot(dx, dy) || 1;
    const t = i / (n - 1);
    // Full width behind the head, a gentle taper, then a quick point at the tail.
    const w = (wHead / 2) * (t < 0.08 ? 0.85 + t * 1.8 : 1 - 0.78 * ((t - 0.08) / 0.92) ** 1.4);
    widths.push(w);
    left.push({ x: p.x - (dy / l) * w, y: p.y + (dx / l) * w });
    right.push({ x: p.x + (dy / l) * w, y: p.y - (dx / l) * w });
  }
  const tail = pts[n - 1]!;
  const outline =
    `M${left.map((p) => `${f1(p.x)} ${f1(p.y)}`).join('L')}` +
    `L${f1(tail.x)} ${f1(tail.y)}` +
    `L${right
      .reverse()
      .map((p) => `${f1(p.x)} ${f1(p.y)}`)
      .join('L')}Z`;
  right.reverse();
  // Bands: quads between neighbouring samples, every few samples.
  let bands = '';
  const step = Math.max(3, Math.round(n / 9));
  for (let i = step; i < n - 3; i += step) {
    const a = left[i]!;
    const b = left[i + 1]!;
    const c = right[i + 1]!;
    const d = right[i]!;
    bands += `M${f1(a.x)} ${f1(a.y)}L${f1(b.x)} ${f1(b.y)}L${f1(c.x)} ${f1(c.y)}L${f1(d.x)} ${f1(d.y)}Z`;
  }
  // Belly stripe along the middle of the body.
  const belly = pts
    .slice(1, Math.floor(n * 0.85))
    .map((p, i) => `${i ? 'L' : 'M'}${f1(p.x)} ${f1(p.y)}`)
    .join('');
  const h = pts[0]!;
  const h2 = pts[2]!;
  const ang = (Math.atan2(h.y - h2.y, h.x - h2.x) * 180) / Math.PI;
  const r = wHead * 0.62;
  const head = [
    `<g transform="translate(${f1(h.x)} ${f1(h.y)}) rotate(${f1(ang)})">`,
    `<path d="M${f1(r * 0.9)} 0 l${f1(r * 0.55)} 0 m0 0 l${f1(r * 0.25)} ${f1(-r * 0.22)} m${f1(-r * 0.25)} ${f1(r * 0.22)} l${f1(r * 0.25)} ${f1(r * 0.22)}" stroke="#E8352E" stroke-width="${f1(Math.max(1.5, r * 0.14))}" stroke-linecap="round" fill="none"/>`,
    `<ellipse cx="0" cy="0" rx="${f1(r * 1.12)}" ry="${f1(r * 0.9)}" fill="${skin.body}" stroke="${OUTLINE}" stroke-width="2.2"/>`,
    `<ellipse cx="${f1(r * 0.4)}" cy="0" rx="${f1(r * 0.5)}" ry="${f1(r * 0.42)}" fill="${skin.belly}" opacity="0.55"/>`,
    `<circle cx="${f1(r * 0.12)}" cy="${f1(-r * 0.46)}" r="${f1(r * 0.34)}" fill="#fff" stroke="${OUTLINE}" stroke-width="1.6"/>`,
    `<circle cx="${f1(r * 0.12)}" cy="${f1(r * 0.46)}" r="${f1(r * 0.34)}" fill="#fff" stroke="${OUTLINE}" stroke-width="1.6"/>`,
    `<circle cx="${f1(r * 0.24)}" cy="${f1(-r * 0.44)}" r="${f1(r * 0.16)}" fill="#111214"/>`,
    `<circle cx="${f1(r * 0.24)}" cy="${f1(r * 0.48)}" r="${f1(r * 0.16)}" fill="#111214"/>`,
    `<circle cx="${f1(r * 0.86)}" cy="${f1(-r * 0.2)}" r="${f1(r * 0.06)}" fill="${OUTLINE}"/>`,
    `<circle cx="${f1(r * 0.86)}" cy="${f1(r * 0.2)}" r="${f1(r * 0.06)}" fill="${OUTLINE}"/>`,
    `</g>`,
  ].join('');
  return [
    `<path d="${outline}" fill="#000" opacity="0.2" transform="translate(${f1(wHead * 0.12)} ${f1(wHead * 0.2)})"/>`,
    `<path d="${outline}" fill="${skin.body}" stroke="${OUTLINE}" stroke-width="2.4" stroke-linejoin="round"/>`,
    `<path d="${belly}" fill="none" stroke="${skin.belly}" stroke-width="${f1(wHead * 0.16)}" stroke-linecap="round" opacity="0.8"/>`,
    `<path d="${bands}" fill="${skin.band}"/>`,
    head,
  ].join('');
}

/** Woven pandan mat (basket weave) markup for one size x size tile. */
function matBody(size: number): string {
  const h = size / 2;
  const s = size / 6;
  let strips = '';
  for (let q = 0; q < 4; q++) {
    const ox = (q % 2) * h;
    const oy = Math.floor(q / 2) * h;
    const horizontal = q === 0 || q === 3;
    for (let i = 0; i < 3; i++) {
      const fill = i % 2 ? '#E2BE7E' : '#EBCB90';
      strips += horizontal
        ? `<rect x="${ox}" y="${oy + i * s}" width="${h}" height="${s}" fill="${fill}"/>`
        : `<rect x="${ox + i * s}" y="${oy}" width="${s}" height="${h}" fill="${fill}"/>`;
    }
  }
  let lines = '';
  for (let q = 0; q < 4; q++) {
    const ox = (q % 2) * h;
    const oy = Math.floor(q / 2) * h;
    const horizontal = q === 0 || q === 3;
    for (let i = 1; i < 3; i++)
      lines += horizontal ? `M${ox} ${oy + i * s}h${h}` : `M${ox + i * s} ${oy}v${h}`;
  }
  return `${strips}<path d="${lines}" stroke="#C9A062" stroke-width="1" opacity="0.6"/><path d="M0 0H${size}M0 ${h}H${size}M0 0V${size}M${h} 0V${size}" stroke="#B88E50" stroke-width="1.2" opacity="0.55"/>`;
}

/** Woven pandan mat tile, used behind the board (CSS background). */
export function matTile(size = 48): string {
  return svgDoc(size, size, matBody(size));
}

/* ------------------------------------------------------------------ poster */

const CELL_COLORS = ['#FFF1C9', '#FFD9A0', '#CDEBB0', '#B9E2F0'];

/** Sample a waving snake between two points (head first). */
function wave(a: P, b: P, amp: number, halfWaves: number, n = 36): P[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  const pts: P[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const off = amp * Math.sin(Math.PI * halfWaves * t);
    pts.push({ x: a.x + dx * t - (dy / l) * off, y: a.y + dy * t + (dx / l) * off });
  }
  return pts;
}

function token(x: number, y: number, r: number, fruit: Fruit, ring: string): string {
  const s = (r * 2 * 0.8) / 64;
  return [
    `<ellipse cx="${x}" cy="${y + r * 0.95}" rx="${r * 0.9}" ry="${r * 0.28}" fill="#000" opacity="0.25"/>`,
    `<circle cx="${x}" cy="${y}" r="${r}" fill="#FFF7EA" stroke="${ring}" stroke-width="${r * 0.16}"/>`,
    `<g transform="translate(${f1(x - r * 0.8)} ${f1(y - r * 0.8)}) scale(${f1(s * 100) / 100})">${castHead(fruit, 'happy')}</g>`,
  ].join('');
}

function die(x: number, y: number, size: number, rot: number, face: number): string {
  const pip = (px: number, py: number) =>
    `<circle cx="${f1(px * size)}" cy="${f1(py * size)}" r="${f1(size * 0.09)}"/>`;
  const L = 0.27;
  const M = 0.5;
  const R = 0.73;
  const faces: Record<number, [number, number][]> = {
    1: [[M, M]],
    3: [
      [L, L],
      [M, M],
      [R, R],
    ],
    5: [
      [L, L],
      [R, L],
      [M, M],
      [L, R],
      [R, R],
    ],
    6: [
      [L, L],
      [R, L],
      [L, M],
      [R, M],
      [L, R],
      [R, R],
    ],
  };
  const pips = (faces[face] ?? faces[1]!).map(([px, py]) => pip(px, py)).join('');
  return `<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="4" y="6" width="${size}" height="${size}" rx="${size * 0.2}" fill="#000" opacity="0.25"/><rect width="${size}" height="${size}" rx="${size * 0.2}" fill="#FFFFFF" stroke="#111214" stroke-width="3"/><g fill="#E2543A">${pips}</g></g>`;
}

/** 640x360 poster: a slice of the board on the woven mat, a ladder, two snakes, tokens and dice. */
export function ularSvg(): string {
  const mat = `<pattern id="mat" width="48" height="48" patternUnits="userSpaceOnUse">${matBody(48)}</pattern>`;
  const c = 64;
  const ox = 312;
  const oy = -20;
  const cols = 6;
  const rows = 6;
  let cells = '';
  let nums = '';
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < cols; col++) {
      const x = ox + col * c;
      const y = oy + row * c;
      cells += `<rect x="${x}" y="${y}" width="${c}" height="${c}" fill="${CELL_COLORS[(col + row) % 4]}"/>`;
      const n = 100 - row * 10 - (row % 2 ? 9 - col : col);
      nums += `<text x="${x + 6}" y="${y + 18}">${n}</text>`;
    }
  let grid = '';
  for (let i = 0; i <= cols; i++) grid += `M${ox + i * c} ${oy}V${oy + rows * c}`;
  for (let j = 0; j <= rows; j++) grid += `M${ox} ${oy + j * c}H${ox + cols * c}`;
  const at = (cx: number, cy: number): P => ({ x: ox + cx * c, y: oy + cy * c });
  const ladder = ladderMarkup(at(0.5, 4.5), at(2.5, 1.5), 30);
  const s1 = snakeMarkup(wave(at(4.5, 1.5), at(3.5, 4.6), 24, 4), 30, SNAKE_SKINS[0]!);
  const s2 = snakeMarkup(wave(at(1.5, 0.5), at(0.5, 2.5), -18, 3), 24, SNAKE_SKINS[1]!);
  return svgDoc(
    640,
    360,
    [
      `<defs>${mat}</defs>`,
      '<rect width="640" height="360" fill="#EBCB90"/>',
      '<rect width="640" height="360" fill="url(#mat)"/>',
      `<rect x="${ox - 4}" y="${oy + 8}" width="${cols * c + 28}" height="${rows * c + 28}" rx="18" fill="#000" opacity="0.2"/>`,
      `<rect x="${ox - 14}" y="${oy - 14}" width="${cols * c + 28}" height="${rows * c + 28}" rx="18" fill="#8A5A2B"/>`,
      `<rect x="${ox - 6}" y="${oy - 6}" width="${cols * c + 12}" height="${rows * c + 12}" rx="10" fill="#B07A47"/>`,
      cells,
      `<path d="${grid}" stroke="#C9A16A" stroke-width="1.5"/>`,
      `<g font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="15" fill="#5A3B1A" opacity="0.7">${nums}</g>`,
      ladder,
      s1,
      s2,
      token(ox + 2.5 * c, oy + 1.3 * c, 24, 'mangga', '#FF8A3D'),
      token(ox + 3.5 * c, oy + 4.35 * c, 22, 'semangka', '#22B35E'),
      token(ox + 4.6 * c, oy + 3.4 * c, 22, 'rambutan', '#2F8CFF'),
      die(92, 70, 78, -14, 6),
      die(196, 120, 62, 12, 3),
    ].join(''),
  );
}
