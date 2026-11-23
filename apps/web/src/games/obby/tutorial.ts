/** "Cara main" for Obby (shared/tutorial). Imports only shared art helpers. */
import { appear, arrow, box, fruit, hop, label, move, scene, slide, spin } from '../../shared/tutorial/draw';
import type { Tutorial } from '../../shared/tutorial/types';

const SKY = '#9FD9FF';
const INK = '#111214';
const RED = '#F2453D';
const BLUE = '#2F8CFF';
const GREEN = '#22B35E';
const YELLOW = '#FFD84D';
const TOP = 250;

/** A toy-brick platform with a lighter top edge. */
function block(x: number, w: number, color: string, y = TOP): string {
  return `${box(x, y, w, 360 - y, color, 6)}${box(x, y, w, 10, '#FFFFFF', 4, 'opacity="0.35"')}`;
}

/** The checkered save pad. */
function checker(x: number, y: number, cols = 6): string {
  let out = '';
  for (let i = 0; i < cols; i++) {
    out += box(x + i * 16, y, 16, 8, i % 2 ? INK : '#FFFFFF', 0);
    out += box(x + i * 16, y + 8, 16, 8, i % 2 ? '#FFFFFF' : INK, 0);
  }
  return out;
}

function flag(x: number, y: number): string {
  return `${box(x - 3, y - 110, 6, 110, '#FFF7F0', 2)}<polygon points="${x + 3},${y - 108} ${x + 60},${y - 90} ${x + 3},${y - 72}" fill="${RED}"/>`;
}

export const TUTORIAL: Tutorial = {
  origin:
    'Terinspirasi dari obby, lintasan rintangan ala Roblox. Bedanya: balapan bareng di satu layar dan kamera mengikuti rombongan.',
  steps: [
    {
      text: 'Joystick untuk lari, ketuk LOMPAT untuk melewati celah.',
      scene: () =>
        scene(
          SKY,
          `${block(0, 250, BLUE)}${block(390, 250, GREEN)}${arrow(200, 190, 440, 190, { bend: 50 })}${slide(hop(fruit('semangka', 170, TOP - 32, 64), 90, 2.4), 270, 0, 2.4)}`,
        ),
      phone: { kind: 'stick', dir: 'right', button: 'LOMPAT' },
    },
    {
      text: 'Lompati palang berputar dan hati-hati lantai yang menghilang.',
      scene: () =>
        scene(
          SKY,
          `${block(0, 400, BLUE)}${box(224, TOP - 110, 12, 110, INK, 4)}${spin(box(130, TOP - 117, 200, 14, RED, 7), 230, TOP - 110, 2.4)}${hop(fruit('semangka', 90, TOP - 32, 60), 100, 1.2)}${appear(block(420, 90, YELLOW, TOP - 4), 0, 2)}${appear(block(520, 90, YELLOW, TOP - 4), 1, 2)}`,
        ),
      phone: { kind: 'stick', dir: 'right', button: 'LOMPAT' },
    },
    {
      text: 'Injak lantai kotak-kotak untuk menyimpan. Jatuh? Muncul lagi di situ.',
      scene: () =>
        scene(
          SKY,
          `${block(0, 260, BLUE)}${checker(120, TOP - 2, 8)}${block(440, 200, GREEN)}${slide(fruit('semangka', 330, TOP - 20, 56, 'wow'), 20, 200, 1.6)}${appear(fruit('semangka', 184, TOP - 32, 60), 1.2, 2.6)}${arrow(340, 330, 220, TOP - 60, { bend: -60, color: '#FFFFFF' })}`,
        ),
      phone: { kind: 'look', text: 'Kembali ke titik simpan' },
    },
    {
      text: 'Lari bareng rombongan. Siapa duluan ke bendera, dia juara!',
      scene: () =>
        scene(
          SKY,
          `${block(0, 640, GREEN)}${checker(520, TOP - 2, 7)}${flag(560, TOP)}${move(fruit('nanas', 200, TOP - 30, 56), 120, 0, 2)}${move(fruit('jeruk', 120, TOP - 30, 56), 110, 0, 2, 0.2)}${hop(move(fruit('semangka', 320, TOP - 32, 64), 150, 0, 2), 40, 1)}${label('Duluan!', 470, 90, { size: 36, color: INK })}`,
        ),
      phone: { kind: 'stick', dir: 'right', button: 'LOMPAT' },
    },
  ],
};
