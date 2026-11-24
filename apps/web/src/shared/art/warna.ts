/**
 * Petualangan Warna key art: a glowing cave seen from the side. Four fruit friends wear their
 * colour aura: one stands on another's shoulders to reach a gem, one wades through its own blue
 * pool, one pushes a heavy stone block. Exit arches in four colours glow on the right; the top
 * left stays dark cave for the logo.
 */
import type { Fruit } from '@hoorah/protocol';
import { castHead } from './people';
import { f1, seeded, svgDoc } from './svg';

const RED = '#F2453D';
const BLUE = '#2F7DF6';
const GREEN = '#22B35E';
const YELLOW = '#FFC928';

function friend(fruit: Fruit, color: string, x: number, y: number, s: number, flip = false): string {
  const t = `translate(${f1(x)} ${f1(y)}) scale(${flip ? -s : s} ${s}) translate(-32 -32)`;
  return [
    `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(40 * s)}" fill="url(#aura-${color.slice(1)})"/>`,
    `<g transform="${t}">${castHead(fruit, 'happy')}</g>`,
  ].join('');
}

function aura(color: string): string {
  return `<radialGradient id="aura-${color.slice(1)}"><stop offset="0" stop-color="${color}" stop-opacity="0.75"/><stop offset="0.55" stop-color="${color}" stop-opacity="0.25"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`;
}

export function warnaSvg(): string {
  const rnd = seeded(27);
  const out: string[] = [];
  out.push(
    `<defs><linearGradient id="wsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0A2731"/><stop offset="1" stop-color="#0E3440"/></linearGradient>${[RED, BLUE, GREEN, YELLOW].map(aura).join('')}<radialGradient id="wglow"><stop offset="0" stop-color="#4FE3C8" stop-opacity="0.35"/><stop offset="1" stop-color="#4FE3C8" stop-opacity="0"/></radialGradient></defs>`,
  );
  out.push('<rect width="640" height="360" fill="url(#wsky)"/>');
  out.push('<circle cx="470" cy="150" r="200" fill="url(#wglow)"/>');
  // Stalactites.
  let stal = '';
  for (let x = -10; x < 650; ) {
    const bw = 20 + rnd() * 40;
    const bh = 20 + rnd() * 50;
    stal += `M${f1(x)} 0 L${f1(x + bw)} 0 L${f1(x + bw * 0.5)} ${f1(bh)}Z`;
    x += bw * 0.85;
  }
  out.push(`<path d="${stal}" fill="#163A40"/>`);
  // Fireflies.
  let flies = '';
  for (let i = 0; i < 26; i++)
    flies += `<circle cx="${f1(rnd() * 640)}" cy="${f1(40 + rnd() * 220)}" r="${f1(1.2 + rnd() * 2)}"/>`;
  out.push(`<g fill="#FFE27A" opacity="0.8">${flies}</g>`);
  // Cave floor.
  out.push('<rect x="0" y="292" width="640" height="68" fill="#14262B"/>');
  out.push('<rect x="0" y="292" width="640" height="6" fill="#3FA34D"/>');
  // Blue pool with its circle.
  out.push(
    `<rect x="160" y="300" width="120" height="52" fill="${BLUE}"/><rect x="160" y="298" width="120" height="6" fill="#9CC2FF"/>`,
  );
  out.push(
    '<circle cx="220" cy="286" r="10" fill="#111214"/><circle cx="220" cy="286" r="6" fill="#FFFFFF"/>',
  );
  // Red gate bars.
  for (let i = 0; i < 4; i++)
    out.push(`<rect x="${438 + i * 9}" y="214" width="4" height="78" fill="${RED}" opacity="0.7"/>`);
  out.push(
    '<circle cx="453" cy="252" r="10" fill="#111214"/><path d="M453 245 L459 256 L447 256Z" fill="#FFFFFF"/>',
  );
  // Exit arches.
  [RED, BLUE, GREEN, YELLOW].forEach((c, i) => {
    const x = 490 + i * 36;
    out.push(`<path d="M${x} 292 V250 a14 14 0 0 1 28 0 V292Z" fill="${c}"/>`);
    out.push(`<path d="M${x + 5} 292 V252 a9 9 0 0 1 18 0 V292Z" fill="#0B1F26"/>`);
  });
  // Heavy block being pushed.
  out.push(
    '<rect x="40" y="226" width="66" height="66" rx="8" fill="#8E877A" stroke="#3A3D44" stroke-width="4"/>',
  );
  out.push('<rect x="44" y="230" width="58" height="10" rx="4" fill="#BDAF94"/>');
  // Gem.
  out.push(
    `<path d="M360 128 L376 148 L360 168 L344 148Z" fill="${GREEN}" stroke="#FFFFFF" stroke-width="3"/>`,
  );
  out.push('<rect x="355" y="143" width="10" height="10" fill="#FFFFFF"/>');
  // Friends.
  out.push(friend('jeruk', YELLOW, 128, 260, 0.9, true));
  out.push(friend('semangka', BLUE, 220, 306, 0.85));
  out.push(friend('stroberi', RED, 360, 266, 0.85));
  out.push(friend('durian', GREEN, 360, 216, 0.85));
  return svgDoc(640, 360, out.join(''));
}
