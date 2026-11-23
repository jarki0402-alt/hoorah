/** "Cara main" for Petualangan Warna (shared/tutorial). Imports only shared art helpers. */
import { appear, arrow, box, fruit, hop, label, mark, move, pulse, scene } from '../../shared/tutorial/draw';
import type { Tutorial } from '../../shared/tutorial/types';

const BG = '#0B1F26';
const RED = '#F2453D';
const BLUE = '#2F7DF6';
const ROCK = '#163A40';
const GRASS = '#3FA34D';
const FLOOR = 290;

function ground(): string {
  return `${box(0, FLOOR, 640, 70, ROCK, 0)}${box(0, FLOOR, 640, 5, GRASS, 0)}`;
}

function pool(x: number, w: number, color: string): string {
  return box(x, FLOOR, w, 26, color, 4, 'opacity="0.9"');
}

function gem(x: number, y: number, color: string): string {
  return `<polygon points="${x},${y - 16} ${x + 14},${y} ${x},${y + 16} ${x - 14},${y}" fill="${color}" stroke="#fff" stroke-width="3"/>`;
}

function door(x: number, color: string): string {
  return `${box(x - 26, FLOOR - 88, 52, 88, '#0A1A1F', 26)}<rect x="${x - 26}" y="${FLOOR - 88}" width="52" height="88" rx="26" fill="none" stroke="${color}" stroke-width="6"/>`;
}

export const TUTORIAL: Tutorial = {
  origin:
    'Terinspirasi dari game petualangan dua warna, api dan air. Bedanya: bisa sampai 4 warna, semuanya buah, dan bisa dimainkan sendiri.',
  steps: [
    {
      text: 'Geser joystick untuk berjalan. Tekan di mana saja di sisi kanan HP untuk lompat.',
      scene: () =>
        scene(
          BG,
          `${ground()}${box(330, FLOOR - 60, 120, 60, ROCK, 6)}${box(330, FLOOR - 60, 120, 5, GRASS, 0)}${arrow(180, FLOOR - 80, 340, FLOOR - 120, { bend: 40 })}${hop(move(fruit('semangka', 150, FLOOR - 32, 60), 60, 0, 1.6), 70, 1.6)}`,
        ),
      phone: { kind: 'stick', dir: 'right', button: 'LOMPAT' },
    },
    {
      text: 'Kolam warnamu aman. Kolam warna lain berbahaya!',
      scene: () =>
        scene(
          BG,
          `${ground()}${pool(120, 140, RED)}${pool(380, 140, BLUE)}${fruit('semangka', 190, FLOOR - 22, 56)}${mark(true, 190, FLOOR - 82)}${fruit('nanas', 450, FLOOR - 22, 56, 'wow')}${mark(false, 450, FLOOR - 82)}${label('Merah', 190, 340, { size: 20 })}${label('Biru', 450, 340, { size: 20 })}`,
        ),
      phone: { kind: 'stick', dir: 'left', button: 'LOMPAT' },
    },
    {
      text: 'Injak tombol supaya pintu terbuka untuk temanmu.',
      scene: () =>
        scene(
          BG,
          `${ground()}${box(90, FLOOR - 8, 70, 10, '#FFE27A', 4)}${fruit('semangka', 125, FLOOR - 36, 56)}${appear(box(360, FLOOR - 200, 26, 200, '#4FE3C8', 6, 'opacity="0.35"'), 0, 2.4)}${box(360, FLOOR - 200, 26, 200, '#4FE3C8', 6)}${arrow(170, FLOOR - 60, 340, FLOOR - 140, { bend: -30, color: '#4FE3C8' })}${fruit('nanas', 450, FLOOR - 30, 56)}`,
        ),
      phone: { kind: 'stick', dir: 'right', button: 'LOMPAT' },
    },
    {
      text: 'Ambil permata, lalu semua masuk pintu warnanya bersamaan.',
      scene: () =>
        scene(
          BG,
          `${ground()}${pulse(gem(180, 150, RED), 180, 150)}${pulse(gem(260, 150, BLUE), 260, 150, 1.2, 0.3)}${door(430, RED)}${door(520, BLUE)}${move(fruit('semangka', 330, FLOOR - 30, 54), 100, 0, 2)}${move(fruit('nanas', 600, FLOOR - 30, 54), -80, 0, 2)}`,
        ),
      phone: { kind: 'look', text: 'Masuk pintu bersamaan' },
    },
  ],
};
