import { castHead } from './people';
import { f1, svgDoc } from './svg';

/**
 * Key art (640x360) for Sambung Kata: a page of a school notebook with the chain BUKU, KUDA,
 * DAUN, UNTA built from letter tiles as a staircase, each word starting under the syllable it
 * continues (yellow), the syllable to continue underlined in orange. Two fruits think hard in the
 * corner; a turn timer and three hearts sit top right. The logo goes top left (see keyart.tsx).
 * Letters are drawn as strokes so the art never depends on a font.
 */

const INK = '#1D2430';
const MARKER = '#FFD23F';
const ORANGE = '#FF6B2C';

/** Letter strokes in a 28x36 box. */
const GLYPHS: Record<string, string> = {
  A: 'M0 36 L14 0 L28 36 M5 24 H23',
  B: 'M0 0 V36 M0 0 H13 A8 8 0 0 1 13 16 H0 M0 16 H15 A10 10 0 0 1 15 36 H0',
  D: 'M0 0 V36 H9 A18 18 0 0 0 9 0 Z',
  K: 'M0 0 V36 M26 0 L2 21 M10 14 L27 36',
  N: 'M0 36 V0 L28 36 V0',
  T: 'M0 0 H28 M14 0 V36',
  U: 'M0 0 V22 A14 14 0 0 0 28 22 V0',
};

const TILE_W = 44;
const TILE_H = 50;
const PITCH = 48;

function tile(x: number, y: number, letter: string, join: boolean, tail: boolean): string {
  const glyph = GLYPHS[letter] ?? '';
  return [
    `<rect x="${x}" y="${y + 4}" width="${TILE_W}" height="${TILE_H}" rx="8" fill="${INK}"/>`,
    `<rect x="${x}" y="${y}" width="${TILE_W}" height="${TILE_H}" rx="8" fill="${join ? MARKER : '#FFFFFF'}" stroke="${INK}" stroke-width="3"/>`,
    tail
      ? `<rect x="${x + 4}" y="${y + TILE_H - 9}" width="${TILE_W - 8}" height="5" rx="2" fill="${ORANGE}"/>`
      : '',
    `<path d="${glyph}" transform="translate(${x + 8} ${y + 5}) scale(1 0.86)" fill="none" stroke="${INK}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  ].join('');
}

function heart(x: number, y: number, s: number, fill: string): string {
  return `<path transform="translate(${x} ${y}) scale(${s})" d="M12 21 C5 15.5 2 12 2 8.2 C2 5.3 4.3 3 7.1 3 C9 3 10.9 4.1 12 5.8 C13.1 4.1 15 3 16.9 3 C19.7 3 22 5.3 22 8.2 C22 12 19 15.5 12 21 Z" fill="${fill}" stroke="${INK}" stroke-width="1.6"/>`;
}

export function kataSvg(): string {
  let rules = '';
  for (let y = 36; y < 360; y += 24) rules += `M0 ${y}H640`;

  const words = ['BUKU', 'KUDA', 'DAUN', 'UNTA'];
  const x0 = 150;
  const y0 = 100;
  let tiles = '';
  words.forEach((word, r) => {
    const x = x0 + r * PITCH * 2;
    const y = y0 + r * 58;
    for (let i = 0; i < word.length; i++) {
      const join = r > 0 && i < 2;
      const tail = r < words.length - 1 && i >= 2;
      tiles += tile(x + i * PITCH, y, word[i]!, join, tail);
    }
  });

  // Timer ring (three quarters left) and hearts, top right.
  const cx = 596;
  const cy = 48;
  const rr = 22;
  const arc = `M${cx} ${cy - rr} A${rr} ${rr} 0 1 1 ${f1(cx - rr)} ${cy}`;
  const ring = [
    `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="#FFFFFF" stroke="#E8DFCC" stroke-width="7"/>`,
    `<path d="${arc}" fill="none" stroke="${ORANGE}" stroke-width="7" stroke-linecap="round"/>`,
    `<path d="M${cx} ${cy} V${cy - 12} M${cx} ${cy} L${cx + 8} ${cy + 5}" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
  ].join('');
  const hearts =
    heart(468, 34, 1.1, '#E0453B') + heart(496, 34, 1.1, '#E0453B') + heart(524, 34, 1.1, '#E9E0CE');

  // Two fruits thinking in the corner, a thought bubble with a question mark over the first.
  const fruit = (
    x: number,
    y: number,
    s: number,
    f: Parameters<typeof castHead>[0],
    face: 'wow' | 'effort',
  ) => `<g transform="translate(${x} ${y}) scale(${s})">${castHead(f, face)}</g>`;
  const bubble = [
    `<circle cx="96" cy="226" r="4" fill="#FFFFFF" stroke="${INK}" stroke-width="2"/>`,
    `<circle cx="106" cy="212" r="6" fill="#FFFFFF" stroke="${INK}" stroke-width="2"/>`,
    `<rect x="98" y="160" width="58" height="44" rx="20" fill="#FFFFFF" stroke="${INK}" stroke-width="2.5"/>`,
    `<path d="M120 174 C120 166 136 166 136 174 C136 181 128 181 128 188 M128 196 V196.5" fill="none" stroke="${ORANGE}" stroke-width="4.5" stroke-linecap="round"/>`,
  ].join('');

  let doodle = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? 6 : 13;
    doodle += `${i ? 'L' : 'M'}${f1(580 + Math.cos(a) * rad)} ${f1(316 + Math.sin(a) * rad)}`;
  }

  const body = [
    '<rect width="640" height="360" fill="#FBF5E9"/>',
    `<path d="${rules}" stroke="#D5E3EE" stroke-width="1.5"/>`,
    '<path d="M14 0V360M19 0V360" stroke="#F0A39B" stroke-width="1.5"/>',
    `<path d="${doodle}Z" fill="none" stroke="#B9CBDA" stroke-width="2.5" stroke-linejoin="round"/>`,
    hearts,
    ring,
    tiles,
    bubble,
    fruit(26, 236, 1.35, 'jeruk', 'wow'),
    fruit(122, 264, 1.15, 'rambutan', 'effort'),
    // A pencil lying under the fruits.
    `<g transform="translate(212 334) rotate(-8)" stroke="${INK}" stroke-width="2" stroke-linejoin="round"><rect x="0" y="0" width="92" height="14" rx="2" fill="#FFC928"/><rect x="-12" y="0" width="12" height="14" rx="2" fill="#F0A39B"/><path d="M92 0 L112 7 L92 14Z" fill="#F3DDB4"/><path d="M105 4.6 L112 7 L105 9.4Z" fill="${INK}"/></g>`,
  ].join('');
  return svgDoc(640, 360, body);
}
