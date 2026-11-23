/** "Cara main" for Rebut Wilayah (shared/tutorial). Imports only shared art helpers. */
import {
  appear,
  arrow,
  box,
  fruit,
  label,
  mark,
  move,
  scene,
  shake,
  slide,
} from '../../shared/tutorial/draw';
import type { Tutorial } from '../../shared/tutorial/types';

const BG = '#1C1D21';
const TILE = '#222328';
const ME = '#FF8A3D';
const ME_TRAIL = '#FFC59C';
const RIVAL = '#14B8A6';
const RIVAL_TRAIL = '#8FE3D8';

/** Floor tiles. */
function floor(): string {
  let out = '';
  for (let y = 10; y < 360; y += 50) {
    for (let x = 10; x < 640; x += 50) out += box(x, y, 44, 44, TILE, 6);
  }
  return out;
}

function land(x: number, y: number, w: number, h: number, color: string): string {
  return box(x, y, w, h, color, 18, 'opacity="0.9"');
}

function trail(d: string, color: string): string {
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>`;
}

export const TUTORIAL: Tutorial = {
  origin:
    'Terinspirasi dari game rebut lahan seperti Paper.io. Bedanya: semua berebut di satu layar bersama dan bergerak bebas ke segala arah.',
  steps: [
    {
      text: 'Geser joystick ke mana pun, buahmu berbelok mengikutinya.',
      scene: () =>
        scene(
          BG,
          `${floor()}${land(110, 100, 200, 160, ME)}${arrow(190, 210, 290, 150, { bend: 40 })}${move(fruit('semangka', 170, 210, 60), 70, -50, 2.2)}`,
        ),
      phone: { kind: 'stick', dir: 'any' },
    },
    {
      text: 'Keluar dari wilayahmu, kamu meninggalkan jejak di belakang.',
      scene: () =>
        scene(
          BG,
          `${floor()}${land(110, 100, 200, 160, ME)}${trail('M300 150 L470 150', ME_TRAIL)}${slide(fruit('semangka', 300, 150, 60), 170, 0, 2.4)}${label('Di luar!', 400, 110, { size: 26, color: ME })}`,
        ),
      phone: { kind: 'stick', dir: 'right' },
    },
    {
      text: 'Pulang ke wilayahmu untuk merebut semua lahan di dalam lengkungan.',
      scene: () =>
        scene(
          BG,
          `${floor()}${land(110, 100, 200, 160, ME)}${trail('M300 150 L470 150 L470 300 L300 300 L300 240', ME_TRAIL)}${appear(land(290, 140, 190, 170, ME), 1.2, 3)}${slide(fruit('semangka', 470, 300, 60), -170, -60, 1.6)}${appear(label('Lahan baru!', 390, 340, { size: 24, color: '#FFFFFF' }), 1.4, 3)}`,
        ),
      phone: { kind: 'stick', dir: 'left' },
    },
    {
      text: 'Potong jejak lawan yang belum pulang. Wilayah terluas menang!',
      scene: () =>
        scene(
          BG,
          `${floor()}${land(60, 120, 150, 130, ME)}${land(450, 60, 150, 130, RIVAL)}${trail('M460 180 L400 260 L300 260', RIVAL_TRAIL)}${shake(fruit('nanas', 300, 260, 56, 'sad'), 300, 260, 0.4)}${slide(fruit('semangka', 360, 120, 56), 0, 200, 2)}${mark(false, 300, 205, 18)}`,
        ),
      phone: { kind: 'stick', dir: 'down' },
    },
  ],
};
