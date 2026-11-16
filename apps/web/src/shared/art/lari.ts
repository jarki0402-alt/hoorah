/**
 * Lari Terus key art (fallback for the rendered poster): city rooftops at golden hour seen along
 * the run. A runner in a jump over a striped barrier, coins arcing above, another sliding under a
 * laundry line, water tanks, antennas and festoon lights on the parapets, the skyline in the haze.
 * Flat shapes only; the top left stays open for the logo.
 */
import type { Fruit } from '@hoorah/protocol';
import { type Face, fruitMarkup } from './fruits';
import { f1, seeded, svgDoc } from './svg';

const INK = '#111214';
const SKIN = '#F3D2A8';

/** Skyline blocks between x0 and x1 standing on `base`. */
function blocks(x0: number, x1: number, base: number, tall: number, fill: string, seed: number): string {
  const rnd = seeded(seed);
  let d = '';
  let x = x0;
  while (x < x1) {
    const w = 14 + rnd() * 26;
    const h = tall * (0.35 + rnd() * 0.65);
    d += `M${f1(x)} ${base}V${f1(base - h)}H${f1(x + w)}V${base}Z`;
    if (rnd() > 0.8) d += `M${f1(x + w / 2 - 1)} ${f1(base - h)}v-12h2v12Z`;
    x += w + rnd() * 3;
  }
  return `<path d="${d}" fill="${fill}"/>`;
}

/** A runner (feet at 0,0, facing away from us) with arms and legs posed. */
function runner(fruit: Fruit, shirt: string, face: Face, pose: 'jump' | 'run' | 'slide'): string {
  const limb = (d: string, c: string, w: number) =>
    `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const legs =
    pose === 'jump'
      ? limb('M-5 -30 L-12 -18 L-6 -10', SKIN, 6) + limb('M5 -30 L10 -16 L16 -12', SKIN, 6)
      : pose === 'slide'
        ? limb('M-4 -14 L-20 -6', SKIN, 6) + limb('M4 -14 L-14 -2', SKIN, 6)
        : limb('M-5 -30 L-8 -14 L-6 0', SKIN, 6) + limb('M5 -30 L9 -18 L15 -12', SKIN, 6);
  const arms =
    pose === 'jump'
      ? limb('M-11 -52 L-20 -66 L-18 -76', SKIN, 5) + limb('M11 -52 L20 -64 L26 -70', SKIN, 5)
      : pose === 'slide'
        ? limb('M-10 -34 L-22 -24', SKIN, 5) + limb('M10 -34 L22 -22', SKIN, 5)
        : limb('M-11 -52 L-16 -40 L-10 -32', SKIN, 5) + limb('M11 -52 L16 -42 L22 -46', SKIN, 5);
  const torsoY = pose === 'slide' ? -40 : -58;
  const torso = `<rect x="-13" y="${torsoY}" width="26" height="${pose === 'slide' ? 24 : 28}" rx="10" fill="${shirt}" stroke="${INK}" stroke-width="2.5"/>`;
  const bib = `<rect x="-7" y="${torsoY + 7}" width="14" height="10" rx="2" fill="#FAF7F0"/>`;
  const shorts =
    pose === 'slide' ? '' : `<rect x="-11" y="-34" width="22" height="9" rx="4" fill="#2B2F38"/>`;
  const headY = pose === 'slide' ? -70 : -92;
  return [
    legs,
    shorts,
    arms,
    torso,
    bib,
    `<g transform="translate(-19 ${headY}) scale(0.6)">${fruitMarkup(fruit, face)}</g>`,
  ].join('');
}

function toren(x: number, y: number, s: number, color = '#FF8A2E'): string {
  return [
    `<path d="M${x - 12 * s} ${y}l3 -${16 * s}h3l-3 ${16 * s}Z M${x + 12 * s} ${y}l-3 -${16 * s}h-3l3 ${16 * s}Z" fill="#3A3C42"/>`,
    `<rect x="${f1(x - 14 * s)}" y="${f1(y - 18 * s)}" width="${f1(28 * s)}" height="${f1(3 * s)}" fill="#3A3C42"/>`,
    `<rect x="${f1(x - 13 * s)}" y="${f1(y - 46 * s)}" width="${f1(26 * s)}" height="${f1(28 * s)}" rx="${f1(4 * s)}" fill="${color}" stroke="${INK}" stroke-width="2"/>`,
    `<path d="M${f1(x - 13 * s)} ${f1(y - 37 * s)}h${f1(26 * s)}M${f1(x - 13 * s)} ${f1(y - 28 * s)}h${f1(26 * s)}" stroke="${INK}" stroke-opacity="0.25" stroke-width="2"/>`,
  ].join('');
}

export function lariSvg(): string {
  const horizon = 190;
  // Roof in perspective: vanishing point near the centre of the horizon.
  const vx = 330;
  const rnd = seeded(11);
  let tiles = '';
  for (let i = -9; i <= 9; i++) tiles += `M${vx + i * 3} ${horizon + 6} L${vx + i * 110} 360 `;
  for (let k = 0; k < 9; k++) {
    const t = (k / 9) ** 2.2;
    const y = horizon + 6 + (360 - horizon - 6) * t;
    tiles += `M0 ${f1(y)} H640 `;
  }
  let bulbs = '';
  for (const side of [-1, 1]) {
    let d = '';
    for (let k = 0; k < 4; k++) {
      const x0 = side < 0 ? 0 + k * 70 : 640 - k * 70;
      const x1 = side < 0 ? x0 + 70 : x0 - 70;
      const y0 = 150 + k * 14;
      d += `M${x0} ${y0} Q${(x0 + x1) / 2} ${y0 + 22} ${x1} ${y0 + 14} `;
      for (let b = 1; b < 4; b++) {
        const t = b / 4;
        const bx = x0 + (x1 - x0) * t;
        const by = y0 + 14 * t + Math.sin(t * Math.PI) * 9;
        bulbs += `<circle cx="${f1(bx)}" cy="${f1(by + 3)}" r="3" fill="#FFD27A"/>`;
      }
    }
    bulbs += `<path d="${d}" fill="none" stroke="${INK}" stroke-width="1.5"/>`;
  }
  let clothes = '';
  const colors = ['#C8372D', '#2F8CFF', '#FFC928', '#14A3A0', '#FF7A2E', '#2E9D58'];
  for (let i = 0; i < 6; i++) {
    const x = 392 + i * 26;
    clothes += `<path d="M${x} 214 h22 l-2 ${30 + (i % 3) * 6} h-18Z" fill="${colors[i]}" stroke="${INK}" stroke-width="1.5"/>`;
  }
  const coins = [0, 1, 2, 3, 4]
    .map((i) => {
      const u = i / 4;
      const x = 210 + u * 120;
      const y = 150 - Math.sin(u * Math.PI) * 46;
      return `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="7" ry="9" fill="#FFC23A" stroke="#8A5A06" stroke-width="2"/><path d="M${f1(x - 1)} ${f1(y - 4)}v8" stroke="#FFF2B0" stroke-width="2"/>`;
    })
    .join('');
  const body = [
    `<rect width="640" height="360" fill="#FFE2B8"/>`,
    `<rect y="110" width="640" height="80" fill="#FFD29A"/>`,
    `<circle cx="540" cy="70" r="40" fill="#FFC56E"/><circle cx="540" cy="70" r="30" fill="#FFD98F"/>`,
    `<path d="M420 60h70a10 10 0 0 0 -14 -10a14 14 0 0 0 -26 -4a10 10 0 0 0 -30 14Z" fill="#FFF3DD"/>`,
    blocks(0, 640, horizon, 120, '#F0B07E', 3),
    blocks(0, 220, horizon + 6, 70, '#D98F5F', 5),
    blocks(440, 640, horizon + 6, 80, '#D98F5F', 6),
    // The roof deck
    `<path d="M0 ${horizon + 6} H640 V360 H0Z" fill="#D9774E"/>`,
    `<path d="${tiles}" stroke="#A9512F" stroke-width="2" fill="none"/>`,
    // Parapets running to the vanishing point
    `<path d="M0 ${horizon + 40} L${vx - 140} ${horizon + 6} L${vx - 134} ${horizon + 6} L0 ${horizon + 74}Z" fill="#E7D3B5" stroke="${INK}" stroke-width="2"/>`,
    `<path d="M640 ${horizon + 40} L${vx + 140} ${horizon + 6} L${vx + 134} ${horizon + 6} L640 ${horizon + 74}Z" fill="#E7D3B5" stroke="${INK}" stroke-width="2"/>`,
    toren(80, 250, 1.4),
    toren(560, 248, 1.3, '#2F8CFF'),
    `<path d="M598 214 V120 M584 128 h28 M588 138 h20 M592 148 h12" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
    bulbs,
    // Laundry line obstacle on the right
    `<path d="M388 252 V206 M552 252 V206" stroke="#B98F47" stroke-width="5" stroke-linecap="round"/>`,
    `<path d="M388 212 Q470 220 552 212" fill="none" stroke="${INK}" stroke-width="2"/>`,
    clothes,
    // Striped barrier in the middle
    `<path d="M228 300 l6 -40 M330 300 l-6 -40" stroke="#7A4E2C" stroke-width="5" stroke-linecap="round"/>`,
    `<rect x="214" y="256" width="132" height="18" rx="3" fill="#FFF7F0" stroke="${INK}" stroke-width="2.5"/>`,
    `<path d="M226 256 l-12 18 M250 256 l-12 18 M274 256 l-12 18 M298 256 l-12 18 M322 256 l-12 18 M346 256 l-12 18" stroke="#E23B2E" stroke-width="8"/>`,
    `<rect x="214" y="256" width="132" height="18" rx="3" fill="none" stroke="${INK}" stroke-width="2.5"/>`,
    coins,
    // Runners: one leaping over the barrier, one sliding under the laundry, one running.
    `<ellipse cx="282" cy="318" rx="26" ry="6" fill="${INK}" opacity="0.18"/>`,
    `<g transform="translate(282 238) rotate(-6) scale(1.15)">${runner('jeruk', '#FF5A1F', 'effort', 'jump')}</g>`,
    `<g transform="translate(468 332) scale(1.05)">${runner('semangka', '#2F8CFF', 'wow', 'slide')}</g>`,
    `<ellipse cx="140" cy="352" rx="22" ry="5" fill="${INK}" opacity="0.18"/>`,
    `<g transform="translate(140 350) scale(1.25)">${runner('durian', '#22B35E', 'happy', 'run')}</g>`,
    // Speed streaks
    `<path d="M40 300 h60 M24 320 h46 M560 300 h56 M584 322 h40" stroke="#FFF7F0" stroke-width="3" stroke-linecap="round" opacity="${f1(0.6 + rnd() * 0.2)}"/>`,
  ].join('');
  return svgDoc(640, 360, body);
}
