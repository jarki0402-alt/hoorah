/** "Cara main" for Kompak Gak? (shared/tutorial). Imports only shared art helpers. */
import {
  appear,
  arrow,
  box,
  bubble,
  fruit,
  hop,
  label,
  mark,
  pulse,
  scene,
  shake,
} from '../../shared/tutorial/draw';
import type { Tutorial } from '../../shared/tutorial/types';

const BG = '#3C4651';
const CARD = '#F6E3C6';
const INK = '#111214';
/** Option colours A–D, the same as the game's cards and phone buttons. */
const OPT = ['#FF8A3D', '#3FC489', '#FFC928', '#5AB4F0'] as const;
const OPTIONS = ['Nasi uduk', 'Bubur ayam', 'Lontong sayur', 'Roti bakar'] as const;
const CARD_W = 136;
const CARD_X = (i: number) => 32 + i * (CARD_W + 16);
const CARD_Y = 128;

/** The question panel at the top. */
function question(): string {
  return `${box(40, 22, 560, 78, CARD, 16)}${label('Sarapan paling enak buat', 320, 56, { size: 24, color: INK })}${label('memulai hari...', 320, 86, { size: 24, color: INK })}`;
}

/** The four answer cards (A–D). */
function cards(): string {
  return OPTIONS.map((o, i) => {
    const x = CARD_X(i);
    return `${box(x, CARD_Y, CARD_W, 70, OPT[i] ?? CARD, 14)}${label(String.fromCharCode(65 + i), x + 18, CARD_Y + 26, { size: 18, color: INK })}${label(o, x + CARD_W / 2, CARD_Y + 50, { size: 18, color: INK })}`;
  }).join('');
}

const CX = (i: number) => CARD_X(i) + CARD_W / 2;

export const TUTORIAL: Tutorial = {
  origin:
    'Terinspirasi dari kuis tebak jawaban terbanyak seperti Family 100. Bedanya: tidak ada survei, jawaban kalian sendiri yang dihitung.',
  steps: [
    {
      text: 'Pertanyaan dan empat pilihan jawaban muncul di layar.',
      scene: () =>
        scene(
          BG,
          `${question()}${appear(cards(), 0.3, 3.4)}${hop(fruit('semangka', 200, 290, 64), 16, 1.6)}${hop(fruit('nanas', 320, 290, 64), 16, 1.6, 0.3)}${hop(fruit('jeruk', 440, 290, 64), 16, 1.6, 0.6)}`,
        ),
      phone: { kind: 'look', text: 'Baca pertanyaan di layar' },
    },
    {
      text: 'Pilih jawaban yang menurutmu dipilih kebanyakan orang.',
      scene: () =>
        scene(
          BG,
          `${question()}${cards()}${bubble('Pasti ini!', 120, 262, { w: 150 })}${fruit('semangka', 120, 300, 64)}${arrow(150, 270, CX(0), CARD_Y + 78, { bend: -30 })}${pulse(box(CARD_X(0) - 5, CARD_Y - 5, CARD_W + 10, 80, 'none', 14, 'stroke="#FFFFFF" stroke-width="5"'), CX(0), CARD_Y + 35)}`,
        ),
      phone: { kind: 'choice', options: OPTIONS, pick: 0 },
    },
    {
      text: 'Jawabanmu sama dengan kebanyakan orang? Kamu dapat poin!',
      scene: () =>
        scene(
          BG,
          `${question()}${cards()}${hop(fruit('semangka', CX(0) - 30, 300, 52), 16, 1.2)}${fruit('nanas', CX(0) + 30, 300, 52)}${fruit('jeruk', CX(0), 250, 48)}${mark(true, CX(0), 340, 16)}${appear(label('Poin!', CX(0) + 80, 250, { size: 28, color: '#FFC928' }), 0.4, 2.4)}${shake(fruit('alpukat', CX(3), 290, 52, 'sad'), CX(3), 290, 0.6)}${mark(false, CX(3), 340, 16)}`,
        ),
      phone: { kind: 'look', text: 'Lihat siapa yang kompak' },
    },
    {
      text: 'Main berdua? Kalian sama-sama dapat poin kalau jawabannya sama.',
      scene: () =>
        scene(
          BG,
          `${question()}${cards()}${hop(fruit('semangka', CX(1) - 40, 290, 64), 24, 1.2)}${hop(fruit('stroberi', CX(1) + 40, 290, 64), 24, 1.2, 0.2)}${arrow(CX(1) - 40, 252, CX(1) - 10, CARD_Y + 78, { bend: 10 })}${arrow(CX(1) + 40, 252, CX(1) + 10, CARD_Y + 78, { bend: -10 })}${appear(label('Kompak!', 520, 290, { size: 34, color: '#FFC928' }), 0.4, 2.4)}`,
        ),
      phone: { kind: 'choice', options: OPTIONS, pick: 1 },
    },
  ],
};
