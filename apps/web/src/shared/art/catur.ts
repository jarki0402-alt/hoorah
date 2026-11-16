import { pieceBody } from '../../games/catur/pieces';
import { svgDoc } from './svg';

/**
 * Key art (640x360): a white king facing a tilted wooden board where an orange vote arrow
 * proposes bishop takes knight, and a chess clock in the corner. The title sits top-left
 * (see LOGO_POS in keyart.tsx).
 */
export function caturSvg(): string {
  let checker = '';
  for (let y = 0, r = 0; y < 360; y += 60, r++)
    for (let x = r % 2 ? 60 : 0; x < 640; x += 120) checker += `M${x} ${y}h60v60h-60Z`;
  let squares = '';
  const S = 70;
  for (let r = 0; r < 6; r++)
    for (let f = 0; f < 6; f++)
      squares += `<rect x="${f * S}" y="${r * S}" width="${S}" height="${S}" fill="${(r + f) % 2 ? '#B9875B' : '#EFDDBA'}"/>`;
  const piece = (p: string, x: number, y: number, size: number) =>
    `<g transform="translate(${x} ${y}) scale(${size / 100})">${pieceBody(p)}</g>`;
  // Board group: origin at its top-left, rotated slightly.
  const board = [
    `<rect x="-16" y="-16" width="${6 * S + 32}" height="${6 * S + 32}" rx="16" fill="#4A3324" stroke="#2E1F15" stroke-width="5"/>`,
    squares,
    `<rect x="${2 * S}" y="0" width="${S}" height="${S}" fill="rgba(255,201,40,0.55)"/>`,
    `<rect x="${3 * S}" y="${S}" width="${S}" height="${S}" fill="rgba(255,201,40,0.55)"/>`,
    piece('n', 3 * S + 4, 1 * S - 6, 66),
    piece('q', 4 * S - 6, 0 * S - 16, 84),
    piece('P', 4 * S + 6, 4 * S + 6, 60),
    piece('B', 1 * S + 4, 3 * S + 2, 64),
    `<path d="M${1.75 * S} ${3.25 * S} L${3.05 * S} ${1.95 * S}" stroke="#FF5A1F" stroke-width="16" stroke-linecap="round"/>`,
    `<path d="M${3.4 * S} ${1.6 * S} l-12 42 l-30 -30Z" fill="#FF5A1F" stroke="#FF5A1F" stroke-width="6" stroke-linejoin="round"/>`,
  ].join('');
  const clock = [
    '<g transform="translate(36 236)">',
    '<rect x="0" y="22" width="190" height="96" rx="16" fill="#26272B" stroke="#111214" stroke-width="5"/>',
    '<rect x="26" y="6" width="44" height="20" rx="6" fill="#FFC928" stroke="#111214" stroke-width="4"/>',
    '<rect x="120" y="14" width="44" height="12" rx="5" fill="#5B5E66" stroke="#111214" stroke-width="4"/>',
    '<circle cx="48" cy="70" r="34" fill="#FFF7F0" stroke="#111214" stroke-width="5"/>',
    '<circle cx="142" cy="70" r="34" fill="#FFF7F0" stroke="#111214" stroke-width="5"/>',
    '<path d="M48 70 V46 M48 70 L64 78 M142 70 V44 M142 70 L126 62" stroke="#111214" stroke-width="5" stroke-linecap="round"/>',
    '<path d="M48 36 a34 34 0 0 1 30 18 L48 70Z" fill="#FF5A1F" opacity="0.9"/>',
    '<circle cx="48" cy="70" r="4" fill="#111214"/><circle cx="142" cy="70" r="4" fill="#111214"/>',
    '</g>',
  ].join('');
  const body = [
    '<rect width="640" height="360" fill="#1C1B1A"/>',
    `<path d="${checker}" fill="#232120"/>`,
    `<g transform="translate(300 18) rotate(-7 210 210)">${board}</g>`,
    piece('K', 196, 104, 150),
    clock,
  ].join('');
  return svgDoc(640, 360, body);
}
