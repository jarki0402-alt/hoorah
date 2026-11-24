import type { Fruit } from '@hoorah/protocol';
import { castHead } from './people';
import { svgDoc } from './svg';

/**
 * Key art (640x360) for Penyusup: a black stage with a yellow spotlight. Five fruits stand in a
 * row holding up word cards; four read "KOPI", the one in the spotlight hides a card that reads
 * "TEH" and glances sideways. Big faint question marks fill the dark. The logo sits top left
 * (see LOGO_POS in keyart.tsx).
 */
export function penyusupSvg(): string {
  const fruits: [Fruit, number, 'happy' | 'wow' | 'effort'][] = [
    ['jeruk', 250, 'happy'],
    ['alpukat', 330, 'wow'],
    ['stroberi', 410, 'effort'],
    ['nanas', 490, 'happy'],
    ['rambutan', 570, 'wow'],
  ];
  const odd = 410;
  const heads = fruits
    .map(([f, x, face]) => `<g transform="translate(${x - 32} 232)">${castHead(f, face)}</g>`)
    .join('');
  const card = (x: number, word: string, odd = false) => {
    const w = 64;
    const rot = odd ? -8 : 0;
    return `<g transform="translate(${x} 196) rotate(${rot})"><rect x="${-w / 2}" y="-22" width="${w}" height="34" rx="6" fill="#FFF7DC" stroke="${odd ? '#FF5A1F' : '#FFC928'}" stroke-width="3"/><text x="0" y="2" text-anchor="middle" font-family="Baloo 2, sans-serif" font-weight="800" font-size="19" fill="#0A0A0B">${word}</text><rect x="-2" y="12" width="4" height="22" fill="#8A5A2B"/></g>`;
  };
  const cards = fruits.map(([, x]) => card(x, x === odd ? 'TEH' : 'KOPI', x === odd)).join('');
  const marks = [
    [40, 330, 120, -12],
    [180, 120, 70, 14],
    [600, 110, 90, -8],
    [120, 230, 60, 20],
  ]
    .map(
      ([x, y, s, r]) =>
        `<text x="${x}" y="${y}" font-size="${s}" transform="rotate(${r} ${x} ${y})" font-family="Baloo 2, sans-serif" font-weight="800" fill="#1C1C1F">?</text>`,
    )
    .join('');
  const body = [
    '<rect width="640" height="360" fill="#0A0A0B"/>',
    marks,
    `<path d="M${odd - 18} 0 L${odd + 18} 0 L${odd + 110} 330 L${odd - 110} 330Z" fill="#FFC928" opacity="0.13"/>`,
    `<path d="M${odd - 9} 0 L${odd + 9} 0 L${odd + 62} 330 L${odd - 62} 330Z" fill="#FFC928" opacity="0.12"/>`,
    `<rect x="${odd - 24}" y="0" width="48" height="10" rx="3" fill="#2E2E30"/>`,
    '<rect x="0" y="300" width="640" height="60" fill="#141416"/>',
    '<rect x="0" y="300" width="640" height="3" fill="#FFC928" opacity="0.55"/>',
    `<ellipse cx="${odd}" cy="304" rx="96" ry="12" fill="#FFC928" opacity="0.25"/>`,
    cards,
    heads,
  ].join('');
  return svgDoc(640, 360, body);
}
