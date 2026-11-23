/** "Cara main" for Penyusup (shared/tutorial). Imports only shared art helpers. */
import {
  appear,
  arrow,
  box,
  bubble,
  fruit,
  label,
  mark,
  pulse,
  scene,
  shake,
} from '../../shared/tutorial/draw';
import type { Tutorial } from '../../shared/tutorial/types';

const BG = '#0A0A0B';
const YELLOW = '#FFC928';
const CREAM = '#FFF7DC';
const ORANGE = '#FF5A1F';
const FLOOR = 300;

const CAST = ['jeruk', 'nanas', 'mangga', 'durian'] as const;
const xs = (i: number) => 128 + i * 128;

/** The stage: a soft spotlight pool on the floor. */
function stage(spot = 320): string {
  return `<ellipse cx="${spot}" cy="${FLOOR + 14}" rx="300" ry="34" fill="#1C1C1F"/><ellipse cx="${spot}" cy="${FLOOR + 14}" rx="170" ry="22" fill="${YELLOW}" opacity="0.18"/>`;
}

/** A word card held up above (x, y). */
function card(x: number, y: number, word: string, fill = CREAM, color = '#111214'): string {
  return `${box(x - 50, y - 30, 100, 56, fill, 10)}${label(word, x, y + 7, { size: 22, color })}`;
}

function cast(face: (i: number) => 'happy' | 'wow' | 'effort' | 'sad' = () => 'happy'): string {
  return CAST.map((f, i) => fruit(f, xs(i), FLOOR - 30, 64, face(i))).join('');
}

export const TUTORIAL: Tutorial = {
  origin:
    'Terinspirasi dari Undercover dan Spyfall. Bedanya: ada Si Kosong tanpa kata, dan katanya bisa Indonesia atau Inggris.',
  steps: [
    {
      text: 'Tahan kartu di HP untuk melihat kata rahasiamu. Jangan diperlihatkan!',
      scene: () =>
        scene(
          BG,
          `${stage()}${fruit('mangga', 320, FLOOR - 40, 90)}${box(380, 90, 150, 96, '#2E2E30', 14)}${appear(card(455, 140, 'KOPI'), 0.3, 3)}${label('KATA RAHASIAMU', 455, 76, { size: 18, color: YELLOW })}`,
        ),
      phone: { kind: 'tap', label: 'Tahan kartu', hold: true },
    },
    {
      text: 'Satu penyusup dapat kata yang mirip. Kamu bisa saja penyusupnya!',
      scene: () =>
        scene(
          BG,
          `${stage()}${cast()}${card(xs(0), 150, 'KOPI')}${card(xs(1), 150, 'KOPI')}${card(xs(3), 150, 'KOPI')}${pulse(card(xs(2), 150, 'TEH', ORANGE, '#FFFFFF'), xs(2), 150, 1.2)}${label('?', xs(2), 96, { size: 40, color: YELLOW })}`,
        ),
      phone: { kind: 'look', text: 'Jangan ucapkan kata ini.' },
    },
    {
      text: 'Bergiliran beri satu kata petunjuk, diucapkan atau diketik.',
      scene: () =>
        scene(
          BG,
          `${stage()}${cast()}${appear(bubble('Pahit', xs(0), FLOOR - 74), 0, 3.6)}${appear(bubble('Pagi', xs(1), FLOOR - 74), 0.9, 3.6)}${appear(bubble('Hangat', xs(2), FLOOR - 74), 1.8, 3.6)}${appear(bubble('Hitam', xs(3), FLOOR - 74), 2.6, 3.6)}`,
        ),
      phone: { kind: 'type', text: 'Hangat' },
    },
    {
      text: 'Pilih siapa yang beda. Suara dibuka bersamaan di layar.',
      scene: () =>
        scene(
          BG,
          `${stage(xs(2))}${cast((i) => (i === 2 ? 'wow' : 'happy'))}${arrow(xs(0) + 20, 180, xs(2) - 30, 200, { bend: -30 })}${arrow(xs(3) - 20, 180, xs(2) + 30, 200, { bend: 30 })}${arrow(xs(1), 150, xs(2) - 10, 196, { bend: -20 })}${shake(label('3 suara', xs(2), 120, { size: 26, color: YELLOW }), xs(2), 112)}${appear(`${mark(true, xs(2) + 44, FLOOR - 70, 18)}${label('PENYUSUP!', 320, 60, { size: 34, color: ORANGE })}`, 1, 3)}`,
        ),
      phone: { kind: 'choice', options: ['Jeruk', 'Nanas', 'Mangga', 'Durian'], pick: 2 },
    },
  ],
};
