/** "Cara main" for Catur (shared/tutorial). Imports only shared art helpers. */
import {
  appear,
  arrow,
  box,
  bubble,
  circle,
  fruit,
  label,
  pulse,
  scene,
  slide,
  tap,
} from '../../shared/tutorial/draw';
import type { Tutorial } from '../../shared/tutorial/types';

const BG = '#26272B';
const LIGHT = '#EFDDBA';
const DARK = '#B9875B';
const ACCENT = '#FF5A1F';
const CHECK = '#F2453D';

/** 8x8 board, cell C px, top-left at (X0, Y0); row 0 is the far rank. */
const C = 38;
const X0 = 50;
const Y0 = 28;
const sx = (col: number) => X0 + col * C + C / 2;
const sy = (row: number) => Y0 + row * C + C / 2;

type Side = 'w' | 'b';
const FILL: Record<Side, string> = { w: '#FFF7F0', b: '#2E1F15' };
const EDGE: Record<Side, string> = { w: '#111214', b: '#FFF7F0' };

function board(): string {
  let out = box(X0 - 8, Y0 - 8, C * 8 + 16, C * 8 + 16, '#4A3324', 10);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) out += box(X0 + c * C, Y0 + r * C, C, C, (r + c) % 2 ? DARK : LIGHT, 0);
  }
  return out;
}

function square(col: number, row: number, fill: string): string {
  return box(X0 + col * C, Y0 + row * C, C, C, fill, 0, 'opacity="0.85"');
}

function dot(col: number, row: number): string {
  return circle(sx(col), sy(row), 7, '#111214', 'opacity="0.35"');
}

const style = (s: Side) => `fill="${FILL[s]}" stroke="${EDGE[s]}" stroke-width="2.5" stroke-linejoin="round"`;

function pawn(s: Side, col: number, row: number): string {
  const x = sx(col);
  const y = sy(row);
  return `<path d="M${x - 11} ${y + 14} L${x + 11} ${y + 14} L${x + 6} ${y} L${x - 6} ${y}Z" ${style(s)}/><circle cx="${x}" cy="${y - 5}" r="7" ${style(s)}/>`;
}

function rook(s: Side, col: number, row: number): string {
  const x = sx(col);
  const y = sy(row);
  return `<path d="M${x - 12} ${y + 14} L${x + 12} ${y + 14} L${x + 8} ${y - 6} L${x + 11} ${y - 6} L${x + 11} ${y - 14} L${x + 6} ${y - 14} L${x + 6} ${y - 10} L${x + 2} ${y - 10} L${x + 2} ${y - 14} L${x - 2} ${y - 14} L${x - 2} ${y - 10} L${x - 6} ${y - 10} L${x - 6} ${y - 14} L${x - 11} ${y - 14} L${x - 11} ${y - 6} L${x - 8} ${y - 6}Z" ${style(s)}/>`;
}

function king(s: Side, col: number, row: number): string {
  const x = sx(col);
  const y = sy(row);
  return `<path d="M${x - 12} ${y + 14} L${x + 12} ${y + 14} L${x + 9} ${y - 4} L${x - 9} ${y - 4}Z" ${style(s)}/><path d="M${x} ${y - 17} L${x} ${y - 5} M${x - 5} ${y - 12} L${x + 5} ${y - 12}" fill="none" stroke="${EDGE[s]}" stroke-width="3" stroke-linecap="round"/>`;
}

/** A small opening position around the e-pawn. */
function opening(): string {
  return `${king('b', 4, 0)}${rook('b', 0, 0)}${pawn('b', 3, 1)}${pawn('b', 4, 1)}${pawn('b', 5, 1)}${king('w', 4, 7)}${rook('w', 7, 7)}${pawn('w', 3, 6)}${pawn('w', 5, 6)}`;
}

const SIDE_X = 510;

export const TUTORIAL: Tutorial = {
  origin:
    'Terinspirasi dari catur klasik. Bedanya: papannya ada di HP-mu, ada jam catur, dan Catur Rame untuk dua tim yang voting.',
  steps: [
    {
      text: 'Ketuk bidak di papan HP, langkah yang sah langsung ditandai.',
      scene: () =>
        scene(
          BG,
          `${board()}${pulse(square(4, 6, ACCENT), sx(4), sy(6), 1.2)}${opening()}${pawn('w', 4, 6)}${appear(`${dot(4, 5)}${dot(4, 4)}`, 0.3, 2.4)}${tap(sx(4), sy(6))}${fruit('semangka', SIDE_X, 200, 96)}`,
        ),
      phone: { kind: 'board', text: 'Ketuk bidakmu' },
    },
    {
      text: 'Ketuk petak tujuan untuk melangkah.',
      scene: () =>
        scene(
          BG,
          `${board()}${square(4, 6, ACCENT)}${square(4, 4, ACCENT)}${opening()}${arrow(sx(4) + 24, sy(6), sx(4) + 24, sy(4), { bend: -16 })}${slide(pawn('w', 4, 6), 0, -2 * C, 2.4)}${tap(sx(4), sy(4), '#FFFFFF', 0.3)}${fruit('semangka', SIDE_X, 200, 96)}`,
        ),
      phone: { kind: 'board', text: 'Ketuk petak tujuan' },
    },
    {
      text: 'Kunci raja lawan sampai tidak bisa lari: skak mat, kamu menang!',
      scene: () =>
        scene(
          BG,
          `${board()}${square(7, 0, CHECK)}${king('b', 7, 0)}${rook('w', 1, 1)}${king('w', 4, 7)}${slide(rook('w', 0, 4), 0, -4 * C, 2.6)}${appear(label('Skak mat!', SIDE_X, 120, { size: 36, color: ACCENT }), 1.6, 2.6)}${fruit('semangka', SIDE_X, 220, 96)}`,
        ),
      phone: { kind: 'look', text: 'Waktu habis berarti kalah' },
    },
    {
      text: 'Lebih dari dua pemain? Catur Rame: tim voting setiap langkah.',
      scene: () =>
        scene(
          BG,
          `${board()}${opening()}${pawn('w', 4, 4)}${bubble('e4!', 450, 120, { w: 80 })}${fruit('semangka', 450, 160, 56)}${fruit('nanas', 510, 170, 56)}${fruit('jeruk', 570, 160, 56)}${appear(bubble('d5!', 450, 260, { w: 80, fill: '#FFC928' }), 0.4, 2.6)}${fruit('alpukat', 450, 300, 56)}${fruit('rambutan', 510, 310, 56)}${fruit('mangga', 570, 300, 56)}`,
        ),
      phone: { kind: 'look', text: 'Pilih langkah bersama tim' },
    },
  ],
};
