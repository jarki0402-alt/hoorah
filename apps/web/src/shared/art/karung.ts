/**
 * Balap Karung art: a village field on an August afternoon. Low warm sun, umbul-umbul banners on
 * bent bamboo poles, kampung roofs, a crowd behind a bamboo fence, mown grass lanes and a
 * red-white finish ribbon. Racers are fruit heads in burlap rice sacks.
 *
 * Everything is flat shapes (no gradients). The racer is split in layers so the game can tint
 * the shirt with each player's colour: `sackShirt` (white, tinted), `sackBody` (sack + hands),
 * then the fruit head from fruits.ts.
 */
import type { Fruit } from '@hoorah/protocol';
import type { Face } from './fruits';
import { castHead } from './people';
import { f1, seeded, svgDoc } from './svg';

export const KARUNG = {
  sky: '#FFE3A6',
  sun: '#FFC24D',
  sunCore: '#FFD772',
  cloud: '#FFF3D9',
  hillFar: '#C9CF7E',
  hillNear: '#A9C566',
  tree: '#5E8F3E',
  treeDark: '#4C7A34',
  trunk: '#7A4A1E',
  grass: '#9BC25A',
  grassLight: '#A7CB65',
  grassDark: '#8DB24D',
  chalk: '#FFFDF4',
  bamboo: '#D9B46A',
  bambooDark: '#A57E3C',
  burlap: '#C9965A',
  burlapDark: '#A97543',
  burlapEdge: '#6B4423',
  red: '#E8352E',
  ink: '#111214',
} as const;

/** Height of the backdrop band in world px; the grass field starts at its bottom edge. */
export const BACKDROP_H = 310;
export const BACKDROP_W = 1280;

/** Racer art box in its own units (feet at 0,0), symmetric in x. */
export const RACER_BOX = { x: -44, y: -162, w: 88, h: 170 } as const;
/** Fruit head placement inside the racer box (64x64 grid). */
export const RACER_HEAD = { x: -30.4, y: -160, scale: 0.95 } as const;

const SACK_OUTLINE = 'M-30 2 Q-36 -36 -28 -72 L28 -72 Q36 -36 30 2 Q0 8 -30 2Z';

/** Shirt and arms in white (the game tints them with the player's colour). */
export function sackShirt(): string {
  return [
    '<path d="M-17 -98 Q-26 -86 -25 -70 M17 -98 Q26 -86 25 -70" fill="none" stroke="#FFFFFF" stroke-width="11" stroke-linecap="round"/>',
    '<rect x="-19" y="-110" width="38" height="50" rx="15" fill="#FFFFFF"/>',
    '<path d="M-19 -84 H19 V-74 Q0 -70 -19 -74Z" fill="#D6D6D6"/>',
    '<path d="M-8 -110 L0 -100 L8 -110Z" fill="#E6E6E6"/>',
  ].join('');
}

/** Burlap sack with a rolled rim, a faded rice stamp and the two hands gripping the rim. */
export function sackBody(): string {
  const weave: string[] = [];
  for (let y = -64; y < 2; y += 7) weave.push(`M-36 ${y} Q0 ${y + 3} 36 ${y}`);
  const warp: string[] = [];
  for (let x = -30; x <= 30; x += 8) warp.push(`M${x} -72 Q${f1(x * 1.15)} -34 ${f1(x * 1.02)} 4`);
  return [
    `<defs><clipPath id="sk"><path d="${SACK_OUTLINE}"/></clipPath></defs>`,
    `<path d="${SACK_OUTLINE}" fill="${KARUNG.burlap}"/>`,
    `<g clip-path="url(#sk)" fill="none" stroke="${KARUNG.burlapDark}" stroke-width="1.6" opacity="0.55"><path d="${weave.join(' ')}"/><path d="${warp.join(' ')}" stroke-width="1.2"/></g>`,
    // Rice stamp: a ring with a bent stalk, printed slightly crooked.
    '<g transform="translate(3 -36) rotate(-8)" fill="none" stroke="#B8432C" stroke-width="2.2" opacity="0.75"><circle r="11"/><path d="M-3 7 Q-1 -1 4 -7 M0 1 q4 -1 6 -5 M-1 -2 q-4 -1 -6 -5"/></g>',
    // Darker side so the sack reads round.
    `<path d="M18 -72 L28 -72 Q36 -36 30 2 Q24 4 20 5 Q26 -34 18 -72Z" fill="${KARUNG.burlapDark}" opacity="0.45"/>`,
    `<path d="${SACK_OUTLINE}" fill="none" stroke="${KARUNG.burlapEdge}" stroke-width="2.6" stroke-linejoin="round"/>`,
    // Rolled rim.
    `<path d="M-31 -74 Q0 -79 31 -74 L32 -63 Q0 -58 -32 -63Z" fill="${KARUNG.burlapDark}" stroke="${KARUNG.burlapEdge}" stroke-width="2.4" stroke-linejoin="round"/>`,
    `<path d="M-28 -68 Q0 -72 28 -68" fill="none" stroke="${KARUNG.burlap}" stroke-width="2" opacity="0.8"/>`,
    // Hands gripping the rim.
    `<circle cx="-24" cy="-69" r="7.5" fill="#FFFFFF" stroke="${KARUNG.ink}" stroke-width="1.8"/>`,
    `<circle cx="24" cy="-69" r="7.5" fill="#FFFFFF" stroke="${KARUNG.ink}" stroke-width="1.8"/>`,
  ].join('');
}

/** A whole racer (shirt in `color`), feet at 0,0: used by the poster. */
export function sackRacer(fruit: Fruit, color: string, face: Face = 'effort'): string {
  const shirt = sackShirt()
    .replace(/#FFFFFF/g, color)
    .replace(/#D6D6D6|#E6E6E6/g, '#00000033');
  return `${shirt}${sackBody()}<g transform="translate(${RACER_HEAD.x} ${RACER_HEAD.y}) scale(${RACER_HEAD.scale})">${castHead(fruit, face)}</g>`;
}

function cloud(x: number, y: number, s: number): string {
  const c = (cx: number, cy: number, r: number) =>
    `<circle cx="${f1(x + cx * s)}" cy="${f1(y + cy * s)}" r="${f1(r * s)}"/>`;
  return `<g fill="${KARUNG.cloud}">${c(0, 0, 16)}${c(22, -9, 21)}${c(46, -2, 15)}<rect x="${f1(x)}" y="${f1(y)}" width="${f1(46 * s)}" height="${f1(15 * s)}"/></g>`;
}

function house(x: number, y: number, w: number, wall: string): string {
  const h = w * 0.5;
  return [
    `<rect x="${x}" y="${y - h}" width="${w}" height="${h}" fill="${wall}"/>`,
    `<path d="M${x - 8} ${y - h} L${x + w * 0.28} ${y - h - w * 0.36} H${x + w * 0.72} L${x + w + 8} ${y - h}Z" fill="#C65A33"/>`,
    `<path d="M${x - 8} ${y - h} H${x + w + 8}" stroke="#9E4325" stroke-width="3"/>`,
    `<rect x="${x + w * 0.16}" y="${y - h * 0.7}" width="${w * 0.2}" height="${h * 0.38}" fill="#6B4423"/>`,
    `<rect x="${x + w * 0.58}" y="${y - h * 0.82}" width="${w * 0.22}" height="${h * 0.82}" fill="#8A5A2B"/>`,
  ].join('');
}

function palm(x: number, y: number, lean: number): string {
  const top = { x: x + lean, y: y - 92 };
  const leaf = (dx: number, dy: number) =>
    `<path d="M${top.x} ${top.y} q${f1(dx * 0.5)} ${f1(dy - 16)} ${dx} ${dy}" fill="none" stroke="${KARUNG.treeDark}" stroke-width="7" stroke-linecap="round"/>`;
  return [
    `<path d="M${x} ${y} Q${x + lean * 0.2} ${y - 50} ${top.x} ${top.y}" fill="none" stroke="#8A5A2B" stroke-width="7" stroke-linecap="round"/>`,
    leaf(-40, 14),
    leaf(42, 12),
    leaf(-26, 30),
    leaf(30, 30),
    leaf(-8, -22),
    `<circle cx="${top.x}" cy="${top.y + 4}" r="5" fill="#6B4423"/>`,
  ].join('');
}

/** Umbul-umbul: a tall bent bamboo pole with a long vertical banner. */
function umbul(x: number, y: number, colors: readonly [string, string], bend: number): string {
  const tipX = x + bend;
  const tipY = y - 150;
  const banner = `M${x + bend * 0.55} ${y - 128} L${x + bend * 0.55 + 14} ${y - 126} L${x + 12} ${y - 34} L${x + 5} ${y - 22} L${x - 2} ${y - 34}Z`;
  return [
    `<path d="M${x} ${y} Q${x + bend * 0.1} ${y - 90} ${tipX} ${tipY}" fill="none" stroke="#B98F47" stroke-width="4" stroke-linecap="round"/>`,
    `<path d="${banner}" fill="${colors[0]}"/>`,
    `<path d="M${x + bend * 0.55 + 7} ${y - 127} L${x + 5} ${y - 22}" stroke="${colors[1]}" stroke-width="5"/>`,
    `<circle cx="${tipX}" cy="${tipY}" r="3" fill="#FFD772"/>`,
  ].join('');
}

const SHIRTS = ['#E8352E', '#2F8CFF', '#FFC928', '#22B35E', '#FFFFFF', '#FF7A1A'];
const SKIN = ['#F1C27D', '#C68642', '#8D5524', '#E0AC69'];

/** Crowd behind the fence from x0 to x1 (bodies, heads, hair, a few raised arms and flags). */
function crowd(x0: number, x1: number, base: number, seed: number): string {
  const rnd = seeded(seed);
  const bodies = SHIRTS.map(() => '');
  const heads = SKIN.map(() => '');
  let hair = '';
  let arms = '';
  let flagsR = '';
  let flagsW = '';
  for (let x = x0; x < x1; x += 20 + Math.round(rnd() * 6)) {
    const y = base - 4 + Math.round(rnd() * 6);
    const si = Math.floor(rnd() * SHIRTS.length);
    const hi = Math.floor(rnd() * SKIN.length);
    bodies[si] += `M${x - 9} ${y + 26} v-9 q0 -11 9 -11 q9 0 9 11 v9Z `;
    heads[hi] += `M${x - 7} ${y} a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0Z `;
    hair += `M${x - 7} ${y - 1} a7 7 0 0 1 14 0 q-7 -3 -14 0Z `;
    const r = rnd();
    if (r < 0.18) arms += `M${x - 7} ${y + 12} L${x - 13} ${y - 6} M${x + 7} ${y + 12} L${x + 13} ${y - 6} `;
    else if (r < 0.3) {
      arms += `M${x + 8} ${y + 12} L${x + 10} ${y - 18} `;
      flagsR += `M${x + 10} ${y - 18} h12 v4.5 h-12Z `;
      flagsW += `M${x + 10} ${y - 13.5} h12 v4.5 h-12Z `;
    }
  }
  return [
    bodies.map((d, i) => (d ? `<path d="${d}" fill="${SHIRTS[i]}"/>` : '')).join(''),
    arms ? `<path d="${arms}" stroke="#E0AC69" stroke-width="4" stroke-linecap="round" fill="none"/>` : '',
    heads.map((d, i) => (d ? `<path d="${d}" fill="${SKIN[i]}"/>` : '')).join(''),
    hair ? `<path d="${hair}" fill="#2A1A10"/>` : '',
    flagsR ? `<path d="${flagsR}" fill="${KARUNG.red}"/><path d="${flagsW}" fill="#FFFFFF"/>` : '',
  ].join('');
}

function fence(x0: number, x1: number, y: number): string {
  let posts = '';
  for (let x = x0 + 10; x < x1; x += 56) posts += `M${x} ${y - 6} h8 v46 h-8Z `;
  let nodes = '';
  for (let x = x0 + 30; x < x1; x += 56) nodes += `M${x} ${y + 2} v6 M${x + 2} ${y + 20} v6 `;
  return [
    `<path d="M${x0} ${y} H${x1} V${y + 9} H${x0}Z M${x0} ${y + 18} H${x1} V${y + 27} H${x0}Z" fill="${KARUNG.bamboo}" stroke="${KARUNG.bambooDark}" stroke-width="1.5"/>`,
    `<path d="${nodes}" stroke="${KARUNG.bambooDark}" stroke-width="2"/>`,
    `<path d="${posts}" fill="#C9A15A" stroke="${KARUNG.bambooDark}" stroke-width="1.5"/>`,
  ].join('');
}

/**
 * The band above the field, 1280 x BACKDROP_H world px. Its left and right edges are plain sky,
 * hills and fence at the same heights, so a mirrored copy can continue it on wide screens.
 */
export function karungBackdrop(): string {
  const W = BACKDROP_W;
  const H = BACKDROP_H;
  const out: string[] = [];
  out.push(`<rect width="${W}" height="${H}" fill="${KARUNG.sky}"/>`);
  out.push(
    `<circle cx="1010" cy="118" r="56" fill="${KARUNG.sun}"/><circle cx="1010" cy="118" r="42" fill="${KARUNG.sunCore}"/>`,
  );
  out.push(cloud(150, 82, 1.1), cloud(520, 52, 0.9), cloud(800, 104, 0.8), cloud(1150, 60, 0.7));
  // Far hills: the curve meets y 196 at both edges.
  out.push(
    `<path d="M0 196 C140 150 260 172 380 186 C520 200 600 150 760 160 C900 170 1020 200 1140 180 C1200 172 1250 186 1280 196 V${H} H0Z" fill="${KARUNG.hillFar}"/>`,
  );
  // Kampung houses and palms on the hill.
  out.push(house(120, 226, 64, '#F4E2BF'), house(214, 230, 50, '#EAD3A8'), house(1110, 228, 60, '#F4E2BF'));
  out.push(palm(80, 232, 14), palm(300, 236, -10), palm(1060, 232, 16), palm(1220, 236, -12));
  // Tree clumps.
  for (const [x, y, s] of [
    [420, 226, 1],
    [470, 232, 0.8],
    [880, 228, 1.1],
    [940, 232, 0.8],
  ] as const) {
    out.push(
      `<rect x="${x - 3}" y="${y - 12}" width="7" height="24" fill="${KARUNG.trunk}"/><circle cx="${x}" cy="${y - 24 * s}" r="${20 * s}" fill="${KARUNG.tree}"/><circle cx="${x + 13 * s}" cy="${y - 32 * s}" r="${14 * s}" fill="${KARUNG.treeDark}"/><circle cx="${x - 12 * s}" cy="${y - 14 * s}" r="${12 * s}" fill="${KARUNG.treeDark}"/>`,
    );
  }
  // Near grass bank behind the crowd: y 238 at both edges.
  out.push(
    `<path d="M0 238 C200 228 420 242 640 234 C860 226 1080 244 1280 238 V${H} H0Z" fill="${KARUNG.hillNear}"/>`,
  );
  // Umbul-umbul along the far side of the field.
  const colors: readonly (readonly [string, string])[] = [
    [KARUNG.red, '#FFFFFF'],
    ['#FFC928', '#E8352E'],
    ['#22B35E', '#FFC928'],
    ['#2F8CFF', '#FFFFFF'],
  ];
  [70, 250, 430, 610, 790, 970, 1150].forEach((x, i) => {
    out.push(umbul(x, 262, colors[i % colors.length]!, i % 2 ? -18 : 18));
  });
  out.push(crowd(8, 1272, 250, 41));
  out.push(fence(0, W, 270));
  // Grass strip under the fence, the same colour as the field below.
  out.push(`<rect x="0" y="${H - 14}" width="${W}" height="14" fill="${KARUNG.grass}"/>`);
  out.push(`<path d="M0 ${H - 14} H${W}" stroke="${KARUNG.grassDark}" stroke-width="3"/>`);
  return out.join('');
}

/** Finish ribbon with two bamboo poles between y0 and y1 at x, in poster units. */
function ribbon(x: number, y0: number, y1: number): string {
  let dashes = '';
  for (let y = y0; y < y1; y += 12) dashes += `M${x} ${y} v6 `;
  return [
    `<path d="M${x} ${y0} V${y1}" stroke="#FFFFFF" stroke-width="5"/>`,
    `<path d="${dashes}" stroke="${KARUNG.red}" stroke-width="5"/>`,
    `<rect x="${x - 3}" y="${y0 - 40}" width="6" height="44" fill="#C9A15A" stroke="${KARUNG.bambooDark}" stroke-width="1.5"/>`,
    `<rect x="${x - 3}" y="${y1 - 4}" width="6" height="30" fill="#C9A15A" stroke="${KARUNG.bambooDark}" stroke-width="1.5"/>`,
  ].join('');
}

/** Key art, 640x360: three racers mid-race heading to the finish ribbon. */
export function karungSvg(): string {
  const field = 155;
  const lanes = [196, 252, 314];
  const stripes = lanes
    .map(
      (y, i) =>
        `<rect x="0" y="${y - 30}" width="640" height="${i === 2 ? 46 : y === 196 ? 56 : 62}" fill="${i % 2 ? KARUNG.grassLight : KARUNG.grass}"/>`,
    )
    .join('');
  const racer = (x: number, y: number, s: number, rot: number, fruit: Fruit, color: string, face: Face) =>
    `<ellipse cx="${x - 6}" cy="${y + 2}" rx="${22 * s}" ry="${5 * s}" fill="#111214" opacity="0.18"/><g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">${sackRacer(fruit, color, face)}</g>`;
  const body = [
    `<g transform="scale(0.5)">${karungBackdrop()}</g>`,
    `<rect x="0" y="${field}" width="640" height="${360 - field}" fill="${KARUNG.grass}"/>`,
    stripes,
    `<path d="M0 166 H640 M0 222 H640 M0 284 H640" stroke="${KARUNG.chalk}" stroke-width="2.5" opacity="0.9"/>`,
    ribbon(560, 166, 352),
    // Dust from landing.
    `<g fill="#F3E2B6" opacity="0.9"><circle cx="246" cy="260" r="7"/><circle cx="234" cy="256" r="5"/><circle cx="402" cy="320" r="8"/><circle cx="388" cy="316" r="6"/></g>`,
    // Motion arcs.
    `<path d="M168 196 Q200 150 236 168 M330 250 Q370 206 410 226" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 8" opacity="0.9"/>`,
    racer(258, 214, 0.62, -6, 'mangga', '#2F8CFF', 'happy'),
    racer(440, 238, 0.7, 8, 'semangka', '#22B35E', 'effort'),
    racer(320, 340, 0.8, -4, 'rambutan', '#FF7A1A', 'wow'),
  ].join('');
  return svgDoc(640, 360, body);
}
