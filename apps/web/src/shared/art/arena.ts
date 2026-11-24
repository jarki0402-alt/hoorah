/**
 * Ular Arena art: a lawn in a night garden, fenced by a low hedge strung with warm fairy lights,
 * glowing seeds in the grass and fruit-headed snakes. Shared by the key art, the game's backdrop
 * and the phone theme. No violet anywhere: deep greens, warm lights, cream flowers.
 */
import type { Fruit } from '@hoorah/protocol';
import type { Face } from './fruits';
import { castHead } from './people';
import { f1, seeded, svgDoc } from './svg';

export const ARENA = {
  night: '#0A1A14',
  leafDark: '#0F2A1F',
  leaf: '#15402C',
  leafLight: '#1F5A3C',
  vein: '#2C7650',
  lawn: '#17402D',
  lawnStripe: '#1B4833',
  hedge: '#0E2F21',
  hedgeMid: '#14402C',
  hedgeLight: '#1E5439',
  wire: '#07130E',
  bulb: '#FFE6A8',
  bulbGlow: '#FFC24D',
  petal: '#FFF6E3',
  petalShade: '#F1DFC0',
  petalCenter: '#FFC928',
  hibiscus: '#E8423A',
} as const;

/** Glowing seed colours (same as the game's ambient seeds). */
export const SEED_HEX = ['#FFD84D', '#FF9A3D', '#7BE495', '#5CD6FF', '#FF6F7D', '#FFF1C9'] as const;

/* ------------------------------------------------------------------ colour helpers */

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? Number.parseInt(m[1]!, 16) : 0xc4c7cc;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Blend two hex colours: t = 0 gives `a`, t = 1 gives `b`. */
export function mixHex(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  const c = (i: 0 | 1 | 2) => Math.round(x[i] + (y[i] - x[i]) * t);
  return `#${((1 << 24) | (c(0) << 16) | (c(1) << 8) | c(2)).toString(16).slice(1).toUpperCase()}`;
}

/* ------------------------------------------------------------------ garden pieces */

/** A pointed leaf from (x, y) along `rot` degrees, with a midrib. */
export function leaf(
  x: number,
  y: number,
  len: number,
  wide: number,
  rot: number,
  fill: string,
  vein: string,
): string {
  const w = wide / 2;
  const d = `M0 0 C${f1(len * 0.25)} ${f1(-w * 1.2)} ${f1(len * 0.7)} ${f1(-w)} ${f1(len)} 0 C${f1(len * 0.7)} ${f1(w)} ${f1(len * 0.25)} ${f1(w * 1.2)} 0 0Z`;
  const rib = `M${f1(len * 0.05)} 0 Q${f1(len * 0.5)} ${f1(-w * 0.12)} ${f1(len * 0.92)} 0`;
  return `<g transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(rot)})"><path d="${d}" fill="${fill}"/><path d="${rib}" fill="none" stroke="${vein}" stroke-width="${f1(Math.max(1, wide * 0.06))}" stroke-linecap="round"/></g>`;
}

/** A fan of leaves growing from one point (a clump in the garden). */
export function leafClump(
  x: number,
  y: number,
  size: number,
  from: number,
  to: number,
  count: number,
  seed: number,
): string {
  const rnd = seeded(seed);
  const fills = [ARENA.leafDark, ARENA.leaf, ARENA.leafLight];
  let out = '';
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const rot = from + (to - from) * t + (rnd() - 0.5) * 14;
    const len = size * (0.7 + rnd() * 0.45);
    const fill = fills[(i + Math.floor(rnd() * 3)) % 3]!;
    out += leaf(x, y, len, len * (0.3 + rnd() * 0.08), rot, fill, ARENA.vein);
  }
  return out;
}

/** Frangipani (kamboja): five cream petals around a warm yellow heart. */
export function frangipani(x: number, y: number, r: number, rot: number): string {
  let petals = '';
  for (let i = 0; i < 5; i++) {
    const a = i * 72;
    petals += `<path d="M0 0 C${f1(r * 0.25)} ${f1(-r * 0.55)} ${f1(r * 0.95)} ${f1(-r * 0.62)} ${f1(r)} ${f1(-r * 0.15)} C${f1(r * 0.85)} ${f1(r * 0.2)} ${f1(r * 0.35)} ${f1(r * 0.18)} 0 0Z" fill="${ARENA.petal}" stroke="${ARENA.petalShade}" stroke-width="${f1(r * 0.05)}" transform="rotate(${a})"/>`;
  }
  return `<g transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(rot)})">${petals}<circle r="${f1(r * 0.24)}" fill="${ARENA.petalCenter}"/></g>`;
}

/** A warm fairy-light bulb with a soft halo. */
export function bulb(x: number, y: number, r: number): string {
  return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r * 2.8)}" fill="${ARENA.bulbGlow}" opacity="0.16"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r * 1.6)}" fill="${ARENA.bulbGlow}" opacity="0.3"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="${ARENA.bulb}"/>`;
}

/** A glowing seed (pellet) with its halo. */
export function seedMarkup(x: number, y: number, r: number, color: string): string {
  return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r * 2.4)}" fill="${color}" opacity="0.16"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="${color}"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r * 0.55)}" fill="${mixHex(color, '#FFFFFF', 0.55)}"/><circle cx="${f1(x - r * 0.3)}" cy="${f1(y - r * 0.3)}" r="${f1(r * 0.22)}" fill="#FFFFFF"/>`;
}

/* ------------------------------------------------------------------ snakes */

type P = [number, number];

/** Points every `gap` px along a cubic Bezier chain (p0 c1 c2 p1 c3 c4 p2 ...). */
export function bezierPoints(ctrl: readonly P[], gap: number): P[] {
  const dense: P[] = [];
  for (let k = 0; k + 3 < ctrl.length; k += 3) {
    const [a, b, c, d] = [ctrl[k]!, ctrl[k + 1]!, ctrl[k + 2]!, ctrl[k + 3]!];
    for (let i = k === 0 ? 0 : 1; i <= 80; i++) {
      const t = i / 80;
      const u = 1 - t;
      dense.push([
        u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
        u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1],
      ]);
    }
  }
  const out: P[] = [];
  let acc = gap;
  for (let i = 0; i < dense.length; i++) {
    const p = dense[i]!;
    const q = dense[i - 1];
    if (q) acc += Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (acc >= gap) {
      out.push(p);
      acc = 0;
    }
  }
  return out;
}

/**
 * A fruit-headed snake drawn like in the game: a dark outline tube, a body of overlapping
 * segments with light bands every few segments, then the head (a disc in the player's colour
 * with the fruit on it). `pts` run from the head to the tail.
 */
export function snakeMarkup(
  pts: readonly P[],
  r: number,
  color: string,
  fruit: Fruit,
  face: Face = 'happy',
): string {
  if (pts.length === 0) return '';
  const dark = mixHex(color, '#06100B', 0.55);
  const shade = mixHex(color, '#06100B', 0.22);
  const band = mixHex(color, '#FFF6E3', 0.38);
  const light = mixHex(color, '#FFFFFF', 0.5);
  const o = Math.max(1.6, r * 0.2);
  let outline = '';
  let body = '';
  for (let i = pts.length - 1; i >= 1; i--) {
    const [x, y] = pts[i]!;
    const taper = 1 - Math.max(0, (i - (pts.length - 6)) / 8);
    const rr = r * taper;
    outline += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(rr + o)}"/>`;
    const fill = Math.floor(i / 3) % 3 === 0 ? band : color;
    body += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(rr)}" fill="${shade}"/><circle cx="${f1(x - rr * 0.08)}" cy="${f1(y - rr * 0.1)}" r="${f1(rr * 0.86)}" fill="${fill}"/><ellipse cx="${f1(x - rr * 0.32)}" cy="${f1(y - rr * 0.36)}" rx="${f1(rr * 0.3)}" ry="${f1(rr * 0.18)}" fill="${light}" opacity="0.8" transform="rotate(-35 ${f1(x - rr * 0.32)} ${f1(y - rr * 0.36)})"/>`;
  }
  const [hx, hy] = pts[0]!;
  const hr = r * 1.32;
  const fs = (r * 2.3) / 64;
  const head = `<circle cx="${f1(hx)}" cy="${f1(hy)}" r="${f1(hr + o)}" fill="${dark}"/><circle cx="${f1(hx)}" cy="${f1(hy)}" r="${f1(hr)}" fill="${color}"/><g transform="translate(${f1(hx - 32 * fs)} ${f1(hy - 32 * fs)}) scale(${f1(fs * 100) / 100})">${castHead(fruit, face)}</g>`;
  return `<g fill="${dark}">${outline}</g>${body}${head}`;
}

/* ------------------------------------------------------------------ key art */

function lawnStripes(w: number, h: number, band: number): string {
  let d = '';
  for (let x = -h; x < w + h; x += band * 2) d += `M${x} 0 l${band} 0 l${-h * 0.45} ${h} l${-band} 0Z `;
  return `<path d="${d}" fill="${ARENA.lawnStripe}"/>`;
}

/** Key art of Ular Arena (640x360): three fruit snakes on the night lawn, seeds, fairy lights. */
export function arenaSvg(): string {
  const W = 640;
  const H = 360;
  const rnd = seeded(77);
  // Lawn with the arena's hedge corner sweeping across the bottom right.
  const ex = 618;
  const ey = 334;
  const cr = 110;
  const lawnPath = `M-20 -20 H${ex} V${ey - cr} A${cr} ${cr} 0 0 1 ${ex - cr} ${ey} H-20Z`;
  /** The hedge line moved `k` px toward the lawn (negative: outward). */
  const edge = (k: number) =>
    `M-20 ${ey - k} H${ex - cr} A${cr - k} ${cr - k} 0 0 0 ${ex - k} ${ey - cr} V-20`;
  const along = (k: number, gap: number): P[] => {
    const pts: P[] = [];
    for (let x = gap / 2; x < ex - cr; x += gap) pts.push([x, ey - k]);
    const r = cr - k;
    const steps = Math.max(2, Math.round((r * Math.PI) / 2 / gap));
    for (let i = 1; i < steps; i++) {
      const a = Math.PI / 2 - (i / steps) * (Math.PI / 2);
      pts.push([ex - cr + Math.cos(a) * r, ey - cr + Math.sin(a) * r]);
    }
    for (let y = ey - cr; y > -gap; y -= gap) pts.push([ex - k, y]);
    return pts;
  };
  let bumps = '';
  let tips = '';
  for (const [x, y] of along(-12, 13)) {
    bumps += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(8 + rnd() * 3)}"/>`;
    if (rnd() < 0.5)
      tips += `<circle cx="${f1(x + (rnd() - 0.5) * 6)}" cy="${f1(y + (rnd() - 0.5) * 6)}" r="${f1(2.2 + rnd() * 1.6)}"/>`;
  }
  let lights = '';
  for (const [x, y] of along(4, 30)) lights += bulb(x, y, 3);

  // Seeds scattered on the lawn, a burst of big ones where a snake was knocked out.
  let seeds = '';
  for (let i = 0; i < 46; i++) {
    const x = 20 + rnd() * 560;
    const y = 20 + rnd() * 290;
    if (x < 250 && y < 110) continue; // keep the logo corner calm
    seeds += seedMarkup(x, y, 2.6 + rnd() * 1.6, SEED_HEX[i % SEED_HEX.length]!);
  }
  let burst = '';
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rnd() * 0.4;
    const d = 16 + rnd() * 26;
    burst += seedMarkup(462 + Math.cos(a) * d, 104 + Math.sin(a) * d * 0.8, 5 + rnd() * 1.8, '#FF5C9A');
  }
  const ring = `<circle cx="462" cy="104" r="44" fill="none" stroke="#FFFFFF" stroke-width="2.5" opacity="0.35"/><circle cx="462" cy="104" r="30" fill="none" stroke="#FF5C9A" stroke-width="3" opacity="0.5"/>`;

  // Snakes: orange mango sweeping across, blue watermelon chasing, green avocado curling below.
  const orange = bezierPoints(
    [
      [404, 214],
      [350, 170],
      [262, 168],
      [214, 214],
      [166, 262],
      [92, 300],
      [24, 262],
      [-20, 238],
      [-40, 210],
      [-60, 190],
    ],
    7,
  );
  const blue = bezierPoints(
    [
      [520, 200],
      [556, 240],
      [580, 290],
      [512, 300],
      [444, 310],
      [392, 296],
      [340, 270],
    ],
    6.5,
  );
  const green = bezierPoints(
    [
      [302, 64],
      [346, 40],
      [400, 44],
      [430, 18],
      [450, 0],
      [470, -10],
      [500, -30],
    ],
    6,
  );
  const sparks = [
    [438, 80],
    [490, 86],
    [446, 132],
    [484, 128],
  ]
    .map(
      ([x, y]) =>
        `<path d="M${x} ${y! - 7} L${x! + 2} ${y! - 2} L${x! + 7} ${y} L${x! + 2} ${y! + 2} L${x} ${y! + 7} L${x! - 2} ${y! + 2} L${x! - 7} ${y} L${x! - 2} ${y! - 2}Z" fill="#FFF1C9"/>`,
    )
    .join('');

  const body = [
    `<rect width="${W}" height="${H}" fill="${ARENA.night}"/>`,
    `<clipPath id="lawn"><path d="${lawnPath}"/></clipPath>`,
    `<path d="${lawnPath}" fill="${ARENA.lawn}"/>`,
    `<g clip-path="url(#lawn)">${lawnStripes(W + 40, H + 40, 38)}</g>`,
    // A soft darker rim around the logo corner keeps the title readable.
    `<path d="M0 0 H300 C250 40 170 120 0 150Z" fill="${ARENA.night}" opacity="0.35"/>`,
    seeds,
    ring,
    burst,
    sparks,
    snakeMarkup(green, 9, '#22B35E', 'alpukat', 'happy'),
    snakeMarkup(blue, 10, '#2F8CFF', 'semangka', 'effort'),
    snakeMarkup(orange, 12, '#FF8A3D', 'mangga', 'wow'),
    // Hedge and fairy lights.
    `<g fill="${ARENA.hedge}">${bumps}</g>`,
    `<path d="${edge(-6)}" fill="none" stroke="${ARENA.hedge}" stroke-width="26"/>`,
    `<g fill="${ARENA.hedgeLight}" opacity="0.7">${tips}</g>`,
    `<path d="${edge(4)}" fill="none" stroke="${ARENA.wire}" stroke-width="1.5"/>`,
    lights,
    // Garden in the corners.
    leafClump(640, 0, 90, 100, 170, 5, 3),
    leafClump(0, 360, 80, -80, -10, 4, 5),
    frangipani(598, 46, 15, 12),
    frangipani(570, 22, 11, -20),
    frangipani(28, 326, 13, 30),
  ].join('');
  return svgDoc(W, H, body);
}
