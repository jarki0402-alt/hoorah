/** "Cara main" for Satu Tali (shared/tutorial). Imports only shared art helpers. */
import { arrow, box, bubble, fruit, hop, label, move, scene, shake, slide } from '../../shared/tutorial/draw';
import type { Tutorial } from '../../shared/tutorial/types';

const SKY = '#FFB98A';
const ROCK = '#C9794B';
const ROCK_DARK = '#B4663E';
const ROPE = '#FFF7F0';
const RED = '#F2453D';
const TOP = 250;

function cliff(x: number, w: number, y = TOP): string {
  return `${box(x, y, w, 360 - y, ROCK, 10)}${box(x, y, w, 12, ROCK_DARK, 6)}`;
}

/** A sagging rope between two points. */
function rope(x1: number, y1: number, x2: number, y2: number, sag = 24): string {
  return `<path d="M${x1} ${y1} Q${(x1 + x2) / 2} ${Math.max(y1, y2) + sag} ${x2} ${y2}" fill="none" stroke="${ROPE}" stroke-width="5" stroke-linecap="round"/>`;
}

function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<path d="M${x1} ${y1} L${x2} ${y2}" fill="none" stroke="${ROPE}" stroke-width="5" stroke-linecap="round"/>`;
}

function flag(x: number, y: number): string {
  return `${box(x - 3, y - 110, 6, 110, ROPE, 2)}<polygon points="${x + 3},${y - 108} ${x + 60},${y - 90} ${x + 3},${y - 72}" fill="${RED}"/>`;
}

/** Three climbers tied together, standing on the ground from `x`. */
function team(x: number): string {
  const y = TOP - 28;
  return `${rope(x, y, x + 100, y)}${rope(x + 100, y, x + 200, y)}${fruit('jeruk', x, y, 56)}${fruit('semangka', x + 100, y - 4, 64)}${fruit('nanas', x + 200, y, 56)}`;
}

export const TUTORIAL: Tutorial = {
  origin:
    'Terinspirasi dari Chained Together, mendaki sambil terikat rantai. Bedanya: tali elastis, tema Nusantara, dan bisa main sendiri.',
  steps: [
    {
      text: 'Semua terikat satu tali. Lari dengan joystick, LOMPAT bareng.',
      scene: () =>
        scene(
          SKY,
          `${cliff(0, 640)}${arrow(160, 120, 460, 120, { bend: 30 })}${hop(move(team(90), 140, 0, 2.4), 36, 1.2)}`,
        ),
      phone: { kind: 'stick', dir: 'right', button: 'LOMPAT' },
    },
    {
      text: 'Teman jatuh? Tahan PEGANG supaya kamu tidak ikut terseret.',
      scene: () =>
        scene(
          SKY,
          `${cliff(0, 360)}${line(250, TOP - 24, 360, TOP + 2)}${line(360, TOP + 2, 360, 300)}${fruit('semangka', 250, TOP - 32, 64, 'effort')}${bubble('PEGANG!', 250, TOP - 72, { w: 130 })}${shake(fruit('nanas', 380, 316, 56, 'wow'), 380, 316, 0.4)}${label('Tolong!', 480, 300, { size: 26 })}`,
        ),
      phone: { kind: 'tap', label: 'PEGANG', hold: true },
    },
    {
      text: 'Sambil PEGANG, mundur pelan untuk menarik temanmu naik.',
      scene: () =>
        scene(
          SKY,
          `${cliff(0, 360)}${line(220, TOP - 24, 360, TOP + 2)}${line(360, TOP + 2, 360, 360)}${fruit('semangka', 220, TOP - 32, 64, 'effort')}${arrow(180, TOP - 90, 80, TOP - 90)}${slide(fruit('nanas', 380, 330, 56), 0, -90, 2.4)}${arrow(440, 330, 440, TOP - 10, { color: '#FFFFFF' })}`,
        ),
      phone: { kind: 'stick', dir: 'left', button: 'PEGANG' },
    },
    {
      text: 'Semua berdiri di bendera untuk lanjut ke bagian berikutnya.',
      scene: () =>
        scene(
          SKY,
          `${cliff(0, 640)}${flag(300, TOP)}${hop(team(200), 30, 1)}${label('Lanjut!', 320, 80, { size: 40 })}`,
        ),
      phone: { kind: 'look', text: 'Kumpul di bendera' },
    },
  ],
};
