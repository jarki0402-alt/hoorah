/** "Cara main" for Jago Masak (shared/tutorial). Imports only shared art helpers. */
import {
  appear,
  arrow,
  box,
  circle,
  fruit,
  hop,
  label,
  move,
  pulse,
  scene,
  slide,
  tap,
} from '../../shared/tutorial/draw';
import type { Tutorial } from '../../shared/tutorial/types';

const BG = '#2E8C83';
const COUNTER = '#B9773E';
const EDGE = '#D9955A';
const BOARD = '#E8B77A';
const GOLD = '#FFC928';
const RED = '#E8352E';
const TOP = 232;

function kitchen(): string {
  return `${box(0, TOP, 640, 128, COUNTER, 0)}${box(0, TOP - 8, 640, 16, EDGE, 0)}`;
}

/** The step card at the top of the main screen. */
function card(text: string): string {
  return `${box(170, 22, 300, 52, '#FFF7F0', 14)}${label(text, 320, 57, { size: 26, color: '#111214' })}`;
}

function wok(): string {
  return `${box(250, 214, 190, 26, '#2A2B30', 8)}<path d="M296 214 q8 -24 18 -8 q6 -20 16 -4 q8 -22 18 -2 q6 -18 14 4Z" fill="#FF5A1F"/><path d="M262 172 h166 a83 42 0 0 1 -166 0Z" fill="#3C3E44"/>${box(428, 176, 70, 12, '#2A2B30', 6)}`;
}

function star(x: number, y: number): string {
  return `<polygon points="${x},${y - 26} ${x + 8},${y - 8} ${x + 26},${y - 6} ${x + 12},${y + 6} ${x + 16},${y + 25} ${x},${y + 15} ${x - 16},${y + 25} ${x - 12},${y + 6} ${x - 26},${y - 6} ${x - 8},${y - 8}" fill="${GOLD}" stroke="#FFF7F0" stroke-width="3"/>`;
}

export const TUTORIAL: Tutorial = {
  origin:
    'Terinspirasi dari game memasak cepat di dapur. Bedanya: resepnya masakan Nusantara, dan gerakan jari di HP meniru cara memasak.',
  steps: [
    {
      text: 'Layar menunjukkan langkah masak berikutnya. Ikuti satu per satu.',
      scene: () =>
        scene(
          BG,
          `${kitchen()}${pulse(card('Iris bawang!'), 320, 48, 1.6)}${box(200, 250, 240, 80, BOARD, 14)}${circle(290, 286, 22, '#B8410F')}${circle(350, 288, 20, '#FFF7F0')}${fruit('mangga', 540, 190, 80)}`,
        ),
      phone: { kind: 'look', text: 'Lihat langkahnya di layar' },
    },
    {
      text: 'Ketuk cepat untuk mengiris, putar jari untuk mengaduk.',
      scene: () =>
        scene(
          BG,
          `${kitchen()}${card('Iris bawang!')}${box(200, 250, 240, 80, BOARD, 14)}${circle(290, 288, 24, '#B8410F')}${appear(`${box(330, 278, 12, 22, '#B8410F', 4)}${box(350, 278, 12, 22, '#B8410F', 4)}${box(370, 278, 12, 22, '#B8410F', 4)}`, 0.4, 2)}${hop(`${box(306, 196, 14, 70, '#9AA0A6', 4)}${box(304, 160, 18, 40, '#3C3E44', 6)}`, 30, 0.5)}${tap(313, 270, '#FFFFFF')}${fruit('mangga', 540, 190, 80, 'effort')}`,
        ),
      phone: { kind: 'tap', label: 'Iris bawang!' },
    },
    {
      text: 'Tahan untuk menggoreng, lepas saat jarum masuk zona emas.',
      scene: () =>
        scene(
          BG,
          `${kitchen()}${card('Ceplok telur!')}${wok()}<ellipse cx="345" cy="172" rx="32" ry="14" fill="#FFF7F0"/>${circle(345, 170, 9, GOLD)}${box(130, 100, 380, 22, '#1F6E66', 11)}${box(370, 100, 60, 22, GOLD, 0)}${box(430, 100, 80, 22, RED, 11)}${move(box(140, 92, 8, 38, '#FFFFFF', 4), 250, 0, 2.4)}${fruit('mangga', 560, 190, 80, 'wow')}`,
        ),
      phone: { kind: 'tap', label: 'TAHAN', hold: true },
    },
    {
      text: 'Usap sesuai arah panah. Cepat dan tepat dapat bintang tiga!',
      scene: () =>
        scene(
          BG,
          `${kitchen()}${card('Sajikan!')}<ellipse cx="320" cy="290" rx="110" ry="30" fill="#FFF7F0"/>${slide(`<ellipse cx="320" cy="150" rx="60" ry="22" fill="#E9A24C"/>`, 0, 130, 1.6)}${arrow(160, 120, 160, 260, { color: GOLD })}${appear(`${star(470, 120)}${star(530, 108)}${star(590, 120)}`, 1.2, 2.4)}${fruit('mangga', 560, 200, 72)}`,
        ),
      phone: { kind: 'swipe', dir: 'down' },
    },
  ],
};
