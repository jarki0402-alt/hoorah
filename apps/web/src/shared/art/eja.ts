import type { Fruit } from '@hoorah/protocol';
import { castHead } from './people';
import { svgDoc } from './svg';

/**
 * Key art (640x360) for Juara Eja: a page of cream notebook paper. Big letter tiles spell
 * "E J A" on the right, the last one flipping over; a speech bubble with a sound wave reads the
 * word out. Three fruits peek over the bottom edge holding phones, one cheering with "+2". The
 * logo sits top left (see LOGO_POS in keyart.tsx).
 */
export function ejaSvg(): string {
  const rules = Array.from({ length: 8 }, (_, i) => `M0 ${44 + i * 40}H640`).join('');
  const tile = (x: number, y: number, ch: string, rot: number, dark = false) =>
    `<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="-38" y="-46" width="76" height="92" rx="12" fill="${dark ? '#1C1A17' : '#FFFFFF'}" stroke="#1C1A17" stroke-width="5"/><rect x="-38" y="40" width="76" height="8" rx="4" fill="#E4D5BC"/><text x="0" y="22" text-anchor="middle" font-family="Baloo 2, sans-serif" font-weight="800" font-size="64" fill="${dark ? '#FBF6EC' : '#1C1A17'}">${ch}</text></g>`;
  const fruits: [Fruit, number, number, 'happy' | 'wow' | 'effort'][] = [
    ['jeruk', 70, 288, 'effort'],
    ['alpukat', 170, 296, 'wow'],
    ['stroberi', 272, 282, 'happy'],
  ];
  const heads = fruits
    .map(
      ([f, x, y, face]) =>
        `<g transform="translate(${x - 36} ${y - 36}) scale(1.12)">${castHead(f, face)}</g>` +
        `<g transform="translate(${x + 14} ${y + 14}) rotate(-12)"><rect x="-13" y="-22" width="26" height="44" rx="5" fill="#2A2B30"/><rect x="-10" y="-17" width="20" height="30" rx="2" fill="#FBF6EC"/><rect x="-6" y="-11" width="5" height="6" fill="#1C1A17"/><rect x="1" y="-11" width="5" height="6" fill="#1C1A17"/></g>`,
    )
    .join('');
  const body = [
    '<rect width="640" height="360" fill="#FBF6EC"/>',
    `<path d="${rules}" stroke="#EADFCB" stroke-width="2"/>`,
    '<path d="M64 0V360" stroke="#FF5A1F" stroke-width="2.5" opacity="0.5"/>',
    // Speech bubble with the sound wave: the word is read out.
    '<path d="M300 92h96a16 16 0 0 1 16 16v38a16 16 0 0 1-16 16h-54l-20 18v-18h-22a16 16 0 0 1-16-16v-38a16 16 0 0 1 16-16Z" fill="#FFFFFF" stroke="#1C1A17" stroke-width="4" stroke-linejoin="round"/>',
    '<path d="M318 118h8l12-10v42l-12-10h-8Z" fill="#1C1A17"/>',
    '<path d="M352 116q8 11 0 22M364 108q14 19 0 38M376 100q20 27 0 54" fill="none" stroke="#FF5A1F" stroke-width="4.5" stroke-linecap="round"/>',
    tile(462, 150, 'E', -6),
    tile(548, 140, 'J', 3),
    // The last tile flips over: drawn narrower and dark, a little higher.
    `<g transform="translate(600 238) scale(0.62 1) rotate(-4)"><rect x="-38" y="-46" width="76" height="92" rx="12" fill="#1C1A17" stroke="#1C1A17" stroke-width="5"/><text x="0" y="22" text-anchor="middle" font-family="Baloo 2, sans-serif" font-weight="800" font-size="64" fill="#FBF6EC">A</text></g>`,
    tile(505, 252, '?', 5),
    // Little letter boxes being filled in at the bottom right.
    '<g transform="translate(372 300)">',
    [0, 1, 2, 3, 4, 5]
      .map(
        (i) =>
          `<rect x="${i * 34}" y="0" width="28" height="34" rx="6" fill="${i < 3 ? '#1C1A17' : '#FFFFFF'}" stroke="#1C1A17" stroke-width="3"/>`,
      )
      .join(''),
    '</g>',
    // "+2" sticker for the cheering fruit.
    '<g transform="translate(318 218) rotate(-10)"><circle r="26" fill="#2E7D4F"/><text x="0" y="10" text-anchor="middle" font-family="Baloo 2, sans-serif" font-weight="800" font-size="28" fill="#FFFFFF">+2</text></g>',
    heads,
  ].join('');
  return svgDoc(640, 360, body);
}
