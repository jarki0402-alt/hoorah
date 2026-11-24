import { boardBody, pawnBody } from '../../games/ludo/board-art';
import { boardFor } from '../../games/ludo/logic';
import { castHead } from './people';
import { seeded, svgDoc } from './svg';

/** A white die (size s, centred on cx, cy) showing `n`, tilted by `rot` degrees. */
function die(cx: number, cy: number, s: number, rot: number, n: number): string {
  const pips: Record<number, [number, number][]> = {
    3: [
      [0.25, 0.25],
      [0.5, 0.5],
      [0.75, 0.75],
    ],
    5: [
      [0.25, 0.25],
      [0.75, 0.25],
      [0.5, 0.5],
      [0.25, 0.75],
      [0.75, 0.75],
    ],
    6: [
      [0.27, 0.22],
      [0.73, 0.22],
      [0.27, 0.5],
      [0.73, 0.5],
      [0.27, 0.78],
      [0.73, 0.78],
    ],
  };
  const r = s * 0.085;
  const dots = (pips[n] ?? [])
    .map(([x, y]) => `<circle cx="${(x * s).toFixed(1)}" cy="${(y * s).toFixed(1)}" r="${r.toFixed(1)}"/>`)
    .join('');
  return `<g transform="translate(${cx} ${cy}) rotate(${rot}) translate(${-s / 2} ${-s / 2})">
    <rect x="3" y="${s * 0.1}" width="${s}" height="${s}" rx="${s * 0.2}" fill="#000" opacity="0.3"/>
    <rect width="${s}" height="${s}" rx="${s * 0.2}" fill="#FFFFFF" stroke="#1E1F24" stroke-width="${s * 0.05}"/>
    <g fill="#1E1F24">${dots}</g></g>`;
}

/** Wooden table planks. */
function table(): string {
  const rnd = seeded(17);
  const tones = ['#8F5B32', '#996237', '#8A5730', '#94603A', '#8D5932', '#97623A', '#8B5831', '#93603A'];
  let out = '';
  for (let i = 0; i < 8; i++) {
    const x = i * 80;
    out += `<rect x="${x}" width="80" height="360" fill="${tones[i]}"/>`;
    for (let g = 0; g < 3; g++) {
      const gx = x + 12 + rnd() * 56;
      out += `<path d="M${gx.toFixed(1)} 0 C${(gx + 4).toFixed(1)} 120 ${(gx - 4).toFixed(1)} 240 ${gx.toFixed(1)} 360" fill="none" stroke="#6F4425" stroke-width="1.4" opacity="0.3"/>`;
    }
    out += `<rect x="${x}" width="3" height="360" fill="#5E3A1F"/>`;
  }
  return out;
}

/** 640x360 poster: a board on the wooden table, a die mid-roll, pawns and two fruit fans. */
export function ludoSvg(): string {
  const pawn = (x: number, y: number, k: number, c: 0 | 1 | 2 | 3, label: string) =>
    `<g transform="translate(${x} ${y}) scale(${k})">${pawnBody(c, label)}</g>`;
  const fan = (x: number, y: number, size: number, fruit: Parameters<typeof castHead>[0], rot: number) =>
    `<g transform="translate(${x} ${y}) rotate(${rot} ${size / 2} ${size / 2}) scale(${size / 64})">${castHead(fruit, 'wow')}</g>`;
  const body = [
    table(),
    // The board, tilted on the right.
    `<g transform="rotate(-9 492 188)"><svg x="292" y="-14" width="400" height="400" viewBox="-0.5 -0.5 16 16">${boardBody(boardFor(4), [0, 1, 2, 3], 4)}</svg></g>`,
    // Pawns on the board (rough board coordinates after the tilt).
    pawn(372, 150, 0.95, 0, '1'),
    pawn(468, 58, 0.95, 1, '2'),
    pawn(560, 214, 0.95, 2, '1'),
    pawn(430, 262, 0.95, 3, '3'),
    // A big red pawn hopping in front, a die mid-roll.
    '<path d="M150 214 Q206 120 262 168" fill="none" stroke="#FFF6E3" stroke-width="5" stroke-linecap="round" stroke-dasharray="2 12" opacity="0.8"/>',
    pawn(232, 168, 2.6, 0, '4'),
    die(184, 232, 74, -16, 6),
    die(118, 196, 46, 22, 5),
    '<path d="M70 168 l-26 -10 M66 186 l-30 2 M74 204 l-24 12" stroke="#FFF6E3" stroke-width="5" stroke-linecap="round" opacity="0.85"/>',
    // Fans cheering at the bottom edge.
    fan(14, 268, 96, 'mangga', -8),
    fan(96, 292, 84, 'rambutan', 10),
  ].join('');
  return svgDoc(640, 360, body);
}
