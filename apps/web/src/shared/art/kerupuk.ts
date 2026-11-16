/**
 * Makan Kerupuk art: a 17 Agustus kampung yard (houses, umbul-umbul, merah putih bunting, a crowd
 * behind the bamboo fence), the contestants (fruit heads, hands tied behind their back) and the
 * kerupuk itself with crescent bites. Art units: the backdrop is 640x360 like the other games
 * (world px = 2x); characters stand with their feet at (0, 0).
 */
import type { Fruit } from '@hoorah/protocol';
import { type Face, FRUIT_ART, fruitMarkup } from './fruits';
import { f1, svgDoc } from './svg';

export const KERUPUK_SKY = '#9ADBFF';
/** Rope line the kerupuk hang from: between the two bamboo poles, sagging in the middle. */
export const ROPE = { x0: 14, x1: 626, y: 76, sag: 9 } as const;
/** Kerupuk radius in character units. */
export const KERUPUK_R = 19;
/** Fruit head placement inside a character (64x64 grid scaled 0.95). */
export const HEAD = { x: -30.4, y: -158, scale: 0.95, size: 64 * 0.95 } as const;

/** Rope height (art units) at art x. */
export function ropeY(x: number): number {
  const u = Math.max(0, Math.min(1, (x - ROPE.x0) / (ROPE.x1 - ROPE.x0)));
  return ROPE.y + ROPE.sag * 4 * u * (1 - u);
}

/** Stable pseudo-random value in [0, 1) for an integer slot (same on every device and seam). */
function hash(i: number, salt: number): number {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x27d4eb2f);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

const WALLS = ['#FFF2DC', '#F4D9A8', '#CDE8D2', '#F6E7C8', '#FFE0CC', '#DDEBF7'];
const SHIRTS = ['#F2453D', '#2F8CFF', '#FFC928', '#22B35E', '#FFFFFF', '#FF8A3D'];
const SKIN = ['#F1C27D', '#C68642', '#8D5524', '#E0AC69'];
const BANNERS = [
  ['#E8352E', '#FFFFFF'],
  ['#FFC928', '#E8352E'],
  ['#22B35E', '#FFC928'],
  ['#2F8CFF', '#FFFFFF'],
];

function cloud(cx: number, cy: number, s: number): string {
  return `<g fill="#fff"><ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(40 * s)}" ry="${f1(12 * s)}"/><circle cx="${f1(cx - 12 * s)}" cy="${f1(cy - 8 * s)}" r="${f1(15 * s)}"/><circle cx="${f1(cx + 10 * s)}" cy="${f1(cy - 13 * s)}" r="${f1(18 * s)}"/></g>`;
}

/** One kampung house, base at y. */
function house(x: number, y: number, w: number, h: number, wall: string, roof: string): string {
  const top = y - h;
  const ridge = top - h * 0.55;
  const door = `<rect x="${f1(x + w * 0.42)}" y="${f1(y - h * 0.62)}" width="${f1(w * 0.16)}" height="${f1(h * 0.62)}" fill="#7A4A1E"/>`;
  const win = (wx: number) =>
    `<rect x="${f1(wx)}" y="${f1(top + h * 0.22)}" width="${f1(w * 0.16)}" height="${f1(h * 0.28)}" fill="#3B5A73"/><path d="M${f1(wx + w * 0.08)} ${f1(top + h * 0.22)} v${f1(h * 0.28)}" stroke="${wall}" stroke-width="1.2"/>`;
  return [
    `<rect x="${f1(x)}" y="${f1(top)}" width="${f1(w)}" height="${f1(h)}" fill="${wall}"/>`,
    `<path d="M${f1(x - 6)} ${f1(top + 2)} L${f1(x + w / 2)} ${f1(ridge)} L${f1(x + w + 6)} ${f1(top + 2)}Z" fill="${roof}"/>`,
    `<path d="M${f1(x - 6)} ${f1(top + 2)} H${f1(x + w + 6)}" stroke="#8E3F1C" stroke-width="2"/>`,
    win(x + w * 0.12),
    win(x + w * 0.72),
    door,
  ].join('');
}

/** A tall bamboo umbul-umbul: the pole bends over at the top and a long banner hangs from it. */
function umbul(x: number, base: number, top: number, cols: string[], lean: number): string {
  const tipX = x + lean * 18;
  const bend = `M${f1(x)} ${f1(base)} C${f1(x)} ${f1(top + 40)} ${f1(x + lean * 2)} ${f1(top)} ${f1(tipX)} ${f1(top + 12)}`;
  const bw = 9;
  const bx = x + lean * 3;
  const by = top + 8;
  const len = (base - top) * 0.62;
  const a = cols[0]!;
  const b = cols[1]!;
  const banner = `M${f1(bx)} ${f1(by)} h${bw * lean} q${f1(4 * lean)} ${f1(len * 0.5)} ${f1(-2 * lean)} ${f1(len)} l${f1(-3 * lean)} -10 l${f1(-3 * lean)} 8 q${f1(-2 * lean)} ${f1(-len * 0.5)} ${f1(-1 * lean)} ${f1(-len + 2)}Z`;
  const stripe = `M${f1(bx + 3 * lean)} ${f1(by)} h${3 * lean} q${f1(2 * lean)} ${f1(len * 0.5)} ${f1(-1 * lean)} ${f1(len - 6)} h${-3 * lean} q${f1(2 * lean)} ${f1(-len * 0.5)} ${f1(1 * lean)} ${f1(-len + 6)}Z`;
  return [
    `<path d="${banner}" fill="${a}"/>`,
    `<path d="${stripe}" fill="${b}"/>`,
    `<path d="${bend}" fill="none" stroke="#C9A35E" stroke-width="3" stroke-linecap="round"/>`,
    `<path d="${bend}" fill="none" stroke="#8D6E2F" stroke-width="3" stroke-dasharray="1 16" stroke-linecap="butt"/>`,
  ].join('');
}

/** Merah putih garland between two points, dipping `dip` units. */
function garland(xa: number, xb: number, y: number, dip: number, step = 22): string {
  let red = '';
  let white = '';
  const w = xb - xa;
  for (let i = 0, x = xa + step / 2; x < xb; x += step, i++) {
    const u = (x - xa) / w;
    const yy = y + dip * 4 * u * (1 - u);
    const tri = `M${f1(x - 7.5)} ${f1(yy)} L${f1(x + 7.5)} ${f1(yy)} L${f1(x)} ${f1(yy + 13)}Z `;
    if (i % 2) white += tri;
    else red += tri;
  }
  return `<path d="M${f1(xa)} ${f1(y)} Q${f1((xa + xb) / 2)} ${f1(y + dip * 2)} ${f1(xb)} ${f1(y)}" fill="none" stroke="#6B4423" stroke-width="1.4"/><path d="${red}" fill="#E8352E"/><path d="${white}" fill="#FFFFFF"/>`;
}

/**
 * The yard for art x in [x0, x1] (640x360 canvas; draw it through a viewBox for the wings).
 * Everything repeating is placed on fixed slots in absolute x, so wings meet the main art.
 */
export function kerupukBackdrop(x0 = 0, x1 = 640): string {
  const w = x1 - x0;
  const out: string[] = [];
  out.push(`<rect x="${x0}" y="0" width="${w}" height="360" fill="${KERUPUK_SKY}"/>`);
  // Clouds every 260 units.
  for (let i = Math.floor((x0 - 100) / 260); i * 260 < x1 + 100; i++) {
    const cx = i * 260 + 60 + hash(i, 1) * 120;
    out.push(cloud(cx, 112 + hash(i, 2) * 40, 0.8 + hash(i, 3) * 0.5));
  }
  // Far hills.
  out.push(
    `<path d="M${x0} 196 ${Array.from({ length: Math.ceil(w / 80) + 2 }, (_, k) => {
      const x = Math.floor(x0 / 80) * 80 + k * 80;
      return `Q${x + 40} ${f1(168 + hash(Math.floor(x / 80), 4) * 18)} ${x + 80} 190`;
    }).join(' ')} V360 H${x0}Z" fill="#A8DC86"/>`,
  );
  // Umbul-umbul behind the houses' roofs, every 150 units.
  for (let i = Math.floor((x0 - 60) / 150); i * 150 < x1 + 60; i++) {
    const x = i * 150 + 40 + hash(i, 5) * 40;
    const cols = BANNERS[Math.floor(hash(i, 6) * BANNERS.length)]!;
    out.push(umbul(x, 236, 92 + hash(i, 7) * 26, cols, hash(i, 8) < 0.5 ? 1 : -1));
  }
  // Houses on 74-unit slots.
  for (let i = Math.floor((x0 - 80) / 74); i * 74 < x1 + 80; i++) {
    const hw = 44 + hash(i, 9) * 16;
    const hh = 26 + hash(i, 10) * 10;
    const x = i * 74 + hash(i, 11) * 10;
    const wall = WALLS[Math.floor(hash(i, 12) * WALLS.length)]!;
    const roof = hash(i, 13) < 0.5 ? '#C9733A' : '#B2552E';
    out.push(house(x, 232, hw, hh, wall, roof));
    if (hash(i, 14) < 0.45) {
      const tx = x + hw + 9;
      out.push(
        `<rect x="${f1(tx - 2)}" y="196" width="5" height="38" fill="#7A4A1E"/><circle cx="${f1(tx)}" cy="190" r="14" fill="#3E9A45"/><circle cx="${f1(tx + 9)}" cy="198" r="10" fill="#348A3C"/>`,
      );
    }
  }
  // Crowd behind the fence on 24-unit slots, a few waving paper flags.
  const bodies = ['', '', '', '', '', ''];
  const heads = ['', '', '', ''];
  let hair = '';
  let sticks = '';
  let fr = '';
  let fw = '';
  for (let i = Math.floor((x0 - 20) / 24); i * 24 < x1 + 20; i++) {
    if (hash(i, 15) < 0.12) continue;
    const x = i * 24 + 12;
    const y = 232 + hash(i, 16) * 5;
    bodies[Math.floor(hash(i, 17) * 6)] += `M${f1(x - 10)} ${f1(y + 26)} v-9 q0 -12 10 -12 q10 0 10 12 v9Z `;
    heads[Math.floor(hash(i, 18) * 4)] +=
      `M${f1(x - 7.5)} ${f1(y)} a7.5 7.5 0 1 0 15 0 a7.5 7.5 0 1 0 -15 0Z `;
    hair += `M${f1(x - 7.5)} ${f1(y - 1)} a7.5 7.5 0 0 1 15 0 q-7.5 -4 -15 0Z `;
    if (hash(i, 19) < 0.3) {
      const s = hash(i, 20) < 0.5 ? 1 : -1;
      sticks += `M${f1(x + 9 * s)} ${f1(y + 10)} V${f1(y - 20)} `;
      const fx = s > 0 ? x + 9 : x - 21;
      fr += `M${f1(fx)} ${f1(y - 20)} h12 v5 h-12Z `;
      fw += `M${f1(fx)} ${f1(y - 15)} h12 v5 h-12Z `;
    }
  }
  out.push(bodies.map((d, k) => (d ? `<path d="${d}" fill="${SHIRTS[k]}"/>` : '')).join(''));
  out.push(heads.map((d, k) => (d ? `<path d="${d}" fill="${SKIN[k]}"/>` : '')).join(''));
  if (hair) out.push(`<path d="${hair}" fill="#2A1A10"/>`);
  if (sticks) out.push(`<path d="${sticks}" fill="none" stroke="#5A3A1A" stroke-width="1.4"/>`);
  if (fr) out.push(`<path d="${fr}" fill="#E8352E"/><path d="${fw}" fill="#FFFFFF"/>`);
  // Bamboo fence: posts every 18 units and two rails.
  let posts = '';
  for (let i = Math.floor(x0 / 18); i * 18 < x1; i++) posts += `M${i * 18 + 4} 246 h5 v24 h-5Z `;
  out.push(`<path d="${posts}" fill="#D9B36A"/>`);
  out.push(`<path d="M${x0} 251 H${x1} V255 H${x0}Z M${x0} 261 H${x1} V265 H${x0}Z" fill="#B8913F"/>`);
  // Grass yard with a trodden arena where the contestants stand.
  out.push(`<rect x="${x0}" y="270" width="${w}" height="90" fill="#8CCB63"/>`);
  out.push(`<rect x="${x0}" y="286" width="${w}" height="40" fill="#E2B07A"/>`);
  out.push(
    `<path d="M${x0} 286 H${x1} M${x0} 326 H${x1}" stroke="#FFF7F0" stroke-width="2" stroke-dasharray="8 6"/>`,
  );
  let tufts = '';
  for (let i = Math.floor(x0 / 34); i * 34 < x1; i++) {
    const tx = i * 34 + hash(i, 21) * 20;
    const ty = hash(i, 22) < 0.5 ? 278 + hash(i, 23) * 4 : 336 + hash(i, 23) * 18;
    tufts += `M${f1(tx)} ${f1(ty)} l3 -6 l2 6 l3 -5 l1 5Z `;
  }
  out.push(`<path d="${tufts}" fill="#6FB24E"/>`);
  let pebbles = '';
  for (let i = Math.floor(x0 / 46); i * 46 < x1; i++) {
    pebbles += `<ellipse cx="${f1(i * 46 + hash(i, 24) * 30)}" cy="${f1(292 + hash(i, 25) * 30)}" rx="${f1(4 + hash(i, 26) * 8)}" ry="2"/>`;
  }
  out.push(`<g fill="#CF9A62">${pebbles}</g>`);
  // Garlands high up, one per 160 units.
  for (let i = Math.floor(x0 / 160); i * 160 < x1; i++) out.push(garland(i * 160, i * 160 + 160, 46, 10));
  // The rope line between two bamboo poles (main art only).
  if (x0 < ROPE.x1 + 10 && x1 > ROPE.x0 - 10) out.push(ropeLine());
  return out.join('');
}

function pole(x: number): string {
  return [
    `<rect x="${x - 3}" y="${ROPE.y - 18}" width="6" height="${306 - ROPE.y + 18}" fill="#D9B36A"/>`,
    `<path d="M${x - 3} ${ROPE.y + 30} h6 M${x - 3} ${ROPE.y + 90} h6 M${x - 3} ${ROPE.y + 150} h6 M${x - 3} ${ROPE.y + 210} h6" stroke="#8D6E2F" stroke-width="2"/>`,
    `<path d="M${x} ${ROPE.y - 18} v-4" stroke="#8D6E2F" stroke-width="1.6"/>`,
    `<path d="M${x} ${ROPE.y - 30} h16 v6 h-16Z" fill="#E8352E"/><path d="M${x} ${ROPE.y - 24} h16 v6 h-16Z" fill="#FFFFFF"/>`,
    `<path d="M${x} ${ROPE.y - 32} v14" stroke="#5A3A1A" stroke-width="1.4"/>`,
    `<ellipse cx="${x}" cy="306" rx="9" ry="2.5" fill="#B88A55"/>`,
  ].join('');
}

/** Rafia rope between the poles with little knots. */
function ropeLine(): string {
  let d = `M${ROPE.x0} ${ROPE.y}`;
  for (let x = ROPE.x0 + 8; x <= ROPE.x1; x += 8) d += ` L${x} ${f1(ropeY(x))}`;
  return [
    pole(ROPE.x0),
    pole(ROPE.x1),
    `<path d="${d}" fill="none" stroke="#B82620" stroke-width="2.4" stroke-linecap="round"/>`,
    `<path d="${d}" fill="none" stroke="#FF8A84" stroke-width="0.8" stroke-dasharray="3 5"/>`,
  ].join('');
}

/* ------------------------------------------------------------------ contestants */

/**
 * One contestant without the head, feet at (0, 0). Hands are held behind the back: the sleeves
 * bend backwards at the elbows.
 */
export function kerupukBody(shirt: string): string {
  const dark = shade(shirt, 0.78);
  return [
    // Elbows sticking out behind the back, drawn behind the torso.
    `<path d="M-16 -94 L-35 -70 L-12 -55" fill="none" stroke="${dark}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<path d="M16 -94 L35 -70 L12 -55" fill="none" stroke="${dark}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<path d="M-16 -94 L-33 -71" stroke="${shirt}" stroke-width="11" stroke-linecap="round"/><path d="M16 -94 L33 -71" stroke="${shirt}" stroke-width="11" stroke-linecap="round"/>`,
    // Legs and shoes.
    '<path d="M-8 -46 L-10 -5 M8 -46 L10 -5" stroke="#2B3A55" stroke-width="13" stroke-linecap="round"/>',
    '<ellipse cx="-12" cy="-3" rx="11" ry="5.5" fill="#111214"/><ellipse cx="12" cy="-3" rx="11" ry="5.5" fill="#111214"/>',
    // Shirt with a white collar and a merah putih ribbon.
    `<rect x="-21" y="-104" width="42" height="64" rx="16" fill="${shirt}"/>`,
    `<path d="M-21 -52 H21 V-44 Q21 -40 17 -40 H-17 Q-21 -40 -21 -44Z" fill="${dark}"/>`,
    '<path d="M-10 -103 Q0 -94 10 -103" fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round"/>',
    '<path d="M9 -84 l6 0 l0 4 l-6 0Z" fill="#E8352E"/><path d="M9 -80 l6 0 l0 4 l-6 0Z" fill="#FFFFFF"/>',
    '<path d="M9 -76 l1.5 6 l1.5 -3 l1.5 3 l1.5 -6Z" fill="#E8352E"/>',
  ].join('');
}

/** Full character (body + head) for the poster. */
function contestant(shirt: string, fruit: Fruit, face: Face): string {
  return `${kerupukBody(shirt)}<g transform="translate(${HEAD.x} ${HEAD.y}) scale(${HEAD.scale})">${fruitMarkup(fruit, face)}</g>`;
}

function shade(hex: string, k: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const c = (v: number) =>
    Math.round(Math.max(0, Math.min(255, v * k)))
      .toString(16)
      .padStart(2, '0');
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
}

/* ------------------------------------------------------------------ the kerupuk */

/** Bite circles, in kerupuk radii: angle from straight down (deg, + = right), distance, radius. */
const BITE_HOLES: readonly (readonly [number, number, number])[] = [
  [0, 1.05, 0.46],
  [33, 1.01, 0.46],
  [-33, 1.01, 0.46],
  [33, 0.6, 0.43],
  [-33, 0.6, 0.43],
  [0, 0.18, 0.52],
];

function wavyDisk(r: number): string {
  const n = 22;
  let d = '';
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * Math.PI * 2;
    const rr = r + (k % 2 ? 1.3 : -0.6);
    const x = Math.sin(a) * rr;
    const y = -Math.cos(a) * rr;
    if (k === 0) d += `M${f1(x)} ${f1(y)}`;
    else {
      const am = ((k - 0.5) / n) * Math.PI * 2;
      const rc = r + 2.2;
      d += ` Q${f1(Math.sin(am) * rc)} ${f1(-Math.cos(am) * rc)} ${f1(x)} ${f1(y)}`;
    }
  }
  return `${d}Z`;
}

/** Circles cut out after `bites` bites (each bite = one hole plus three tooth notches). */
function biteCircles(bites: number, r: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i < Math.min(bites, BITE_HOLES.length); i++) {
    const [deg, dist, rad] = BITE_HOLES[i]!;
    const a = (deg * Math.PI) / 180;
    const cx = Math.sin(a) * dist * r;
    const cy = Math.cos(a) * dist * r;
    const br = rad * r;
    out.push([cx, cy, br]);
    // Tooth notches along the inner side of the bite.
    const toC = Math.atan2(-cy, -cx);
    for (const off of [-0.55, 0, 0.55]) {
      const t = toC + off;
      out.push([cx + Math.cos(t) * br, cy + Math.sin(t) * br, r * 0.1]);
    }
  }
  return out;
}

const SPOTS: readonly (readonly [number, number, number])[] = [
  [-9, -8, 3.2],
  [6, -12, 2.4],
  [10, 3, 3.6],
  [-4, 6, 2.2],
  [-13, 5, 2],
  [2, 15, 2.6],
  [-6, -16, 1.8],
  [14, -5, 1.6],
];

/**
 * A round kerupuk centred at (0, 0) with `bites` bites taken (0..BITES-1), radius `r`, string
 * tied at the top edge. `uid` keeps mask ids unique inside one SVG document.
 */
export function kerupukMarkup(bites: number, uid: string, r = KERUPUK_R): string {
  const disk = wavyDisk(r);
  const holes = biteCircles(bites, r);
  const s = r / KERUPUK_R;
  const sp = s * 0.8;
  const spots = SPOTS.map(
    ([x, y, rr]) =>
      `<ellipse cx="${f1(x * sp)}" cy="${f1(y * sp)}" rx="${f1(rr * sp)}" ry="${f1(rr * sp * 0.8)}"/>`,
  ).join('');
  const body = [
    `<path d="${disk}" fill="#FFF4D6" stroke="#D2A85E" stroke-width="1.8"/>`,
    `<path d="${wavyDisk(r * 0.74)}" fill="none" stroke="#F3E2B6" stroke-width="2"/>`,
    `<g fill="#F1DDAA">${spots}</g>`,
    `<circle cx="0" cy="${f1(-r + 3.4 * s)}" r="${f1(1.6 * s)}" fill="#C99A4E"/>`,
  ].join('');
  if (!holes.length) return body;
  const cut = holes.map(([x, y, rr]) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(rr)}"/>`).join('');
  const m = `km${uid}`;
  const c = `kc${uid}`;
  const lim = r + 4;
  return [
    `<defs><mask id="${m}" maskUnits="userSpaceOnUse" x="${-lim}" y="${-lim}" width="${lim * 2}" height="${lim * 2}"><rect x="${-lim}" y="${-lim}" width="${lim * 2}" height="${lim * 2}" fill="#fff"/><g fill="#000">${cut}</g></mask><clipPath id="${c}"><path d="${disk}"/></clipPath></defs>`,
    `<g mask="url(#${m})">${body}<g clip-path="url(#${c})" fill="none" stroke="#DDB772" stroke-width="${f1(3.4 * s)}">${cut}</g></g>`,
  ].join('');
}

/* ------------------------------------------------------------------ poster */

function crumbs(cx: number, cy: number, seed: number, n: number): string {
  let d = '';
  for (let i = 0; i < n; i++) {
    const x = cx + (hash(i, seed) - 0.5) * 70;
    const y = cy + (hash(i, seed + 1) - 0.3) * 50;
    const s = 1.6 + hash(i, seed + 2) * 2.4;
    d += `M${f1(x)} ${f1(y - s)} l${f1(s)} ${f1(s * 0.6)} l${f1(-s * 0.3)} ${f1(s)} l${f1(-s)} ${f1(-s * 0.2)}Z `;
  }
  return `<path d="${d}" fill="#FFF0C8" stroke="#D2A85E" stroke-width="0.6"/>`;
}

/** 640x360 key art: three contestants under the rope, one biting, one choking. */
export function kerupukSvg(): string {
  const s = 1.22;
  const feet = 350;
  const mouth = (x: number, fruit: Fruit) => {
    // Kerupuk hangs at mouth height; string from the rope.
    const my = feet + (HEAD.y + 0.95 * (FRUIT_ART[fruit].face[1] + 6)) * s;
    return { x, y: my - KERUPUK_R * s * 0.55 };
  };
  const hang = (x: number, fruit: Fruit, dx: number, bites: number, uid: string) => {
    const m = mouth(x, fruit);
    const kx = m.x + dx;
    const top = ropeY(x);
    const angle = (Math.atan2(dx, m.y - top) * 180) / Math.PI;
    return [
      `<path d="M${f1(x)} ${f1(top)} L${f1(kx)} ${f1(m.y - KERUPUK_R * s)}" stroke="#E8352E" stroke-width="1.6"/>`,
      `<g transform="translate(${f1(kx)} ${f1(m.y)}) rotate(${f1(-angle)}) scale(${s})">${kerupukMarkup(bites, uid)}</g>`,
    ].join('');
  };
  const who = (x: number, shirt: string, fruit: Fruit, face: Face, lift = 0, tilt = 0) =>
    `<ellipse cx="${x}" cy="${feet}" rx="${f1(30 * s)}" ry="5" fill="#111214" fill-opacity="0.18"/><g transform="translate(${x} ${feet - lift}) rotate(${tilt}) scale(${s})">${contestant(shirt, fruit, face)}</g>`;
  const puff = (x: number, y: number, r: number) =>
    `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="#FFFFFF" fill-opacity="0.9"/>`;
  const body = [
    kerupukBackdrop(),
    // Left: choking, kerupuk swung away.
    who(250, '#2F8CFF', 'jeruk', 'sad', 0, -6),
    hang(250, 'jeruk', 46, 2, 'a'),
    puff(222, 210, 7),
    puff(210, 203, 5),
    puff(200, 196, 3.5),
    `<g fill="#7FD1FF"><path d="M276 168 q5 7 0 10 q-5 -3 0 -10Z"/><path d="M284 180 q4 6 0 8 q-4 -2 0 -8Z"/></g>`,
    // Middle: the big bite, crumbs flying.
    who(392, '#FFC928', 'rambutan', 'wow', 8, 0),
    hang(392, 'rambutan', 26, 4, 'b'),
    crumbs(404, 226, 40, 14),
    // Right: waiting for the swing to come back.
    who(530, '#22B35E', 'nanas', 'effort', 0, 3),
    hang(530, 'nanas', -40, 1, 'c'),
  ].join('');
  return svgDoc(640, 360, body);
}
