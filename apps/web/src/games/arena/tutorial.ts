/** "Cara main" for Ular Arena (shared/tutorial). Imports only shared art helpers. */
import { ARENA, bezierPoints, seedMarkup, snakeMarkup } from '../../shared/art/arena';
import {
  appear,
  arrow,
  box,
  label,
  mark,
  move,
  pulse,
  scene,
  shake,
  slide,
} from '../../shared/tutorial/draw';
import type { Tutorial } from '../../shared/tutorial/types';

type P = [number, number];
type Fruit = Parameters<typeof snakeMarkup>[3];

const ME = '#FFD84D';
const RIVAL = '#FF6F7D';
const R = 13;

/** Lawn with a hedge border. */
function lawn(): string {
  return `${box(18, 18, 604, 324, ARENA.lawn, 26)}<rect x="18" y="18" width="604" height="324" rx="26" fill="none" stroke="${ARENA.hedgeLight}" stroke-width="10"/>`;
}

/** A snake along a cubic Bezier chain (head first). */
function snake(
  ctrl: readonly P[],
  color: string,
  f: Fruit,
  face: Parameters<typeof snakeMarkup>[4] = 'happy',
): string {
  return snakeMarkup(bezierPoints(ctrl, R * 0.8), R, color, f, face);
}

function seeds(list: readonly [number, number, string][]): string {
  return list.map(([x, y, c]) => seedMarkup(x, y, 7, c)).join('');
}

export const TUTORIAL: Tutorial = {
  origin:
    'Terinspirasi dari game ular klasik dan Slither.io. Bedanya: ularnya berkepala buah dan semua bermain di satu layar.',
  steps: [
    {
      text: 'Arahkan joystick, kepala ularmu ikut berbelok ke arah itu.',
      scene: () =>
        scene(
          ARENA.night,
          `${lawn()}${arrow(380, 180, 470, 100, { bend: 40 })}${move(
            snake(
              [
                [360, 190],
                [300, 230],
                [240, 140],
                [170, 190],
              ],
              ME,
              'semangka',
            ),
            50,
            -30,
            2.4,
          )}`,
        ),
      phone: { kind: 'stick', dir: 'any', button: 'NGEBUT' },
    },
    {
      text: 'Makan biji yang bersinar supaya ularmu makin panjang.',
      scene: () =>
        scene(
          ARENA.night,
          `${lawn()}${appear(
            seeds([
              [420, 180, '#FFD84D'],
              [470, 180, '#7BE495'],
              [520, 180, '#5CD6FF'],
              [570, 180, '#FF9A3D'],
            ]),
            0,
            3,
          )}${slide(
            snake(
              [
                [300, 180],
                [240, 180],
                [160, 180],
                [80, 180],
              ],
              ME,
              'semangka',
            ),
            220,
            0,
            3,
          )}${appear(label('Makin panjang!', 320, 90, { size: 28, color: '#FFC928' }), 1.2, 3)}`,
        ),
      phone: { kind: 'stick', dir: 'right', button: 'NGEBUT' },
    },
    {
      text: 'Tahan NGEBUT untuk menyalip dan memotong jalan lawan.',
      scene: () =>
        scene(
          ARENA.night,
          `${lawn()}${move(
            snake(
              [
                [380, 260],
                [300, 260],
                [200, 260],
                [120, 260],
              ],
              RIVAL,
              'nanas',
            ),
            40,
            0,
            2.8,
          )}${slide(
            snake(
              [
                [230, 120],
                [170, 120],
                [110, 120],
                [60, 120],
              ],
              ME,
              'semangka',
            ),
            280,
            0,
            1.6,
          )}${arrow(260, 150, 540, 240, { bend: -30 })}${pulse(label('NGEBUT!', 520, 70, { size: 30, color: '#FFC928' }), 520, 60, 0.6)}`,
        ),
      phone: { kind: 'stick', dir: 'right', button: 'NGEBUT' },
    },
    {
      text: 'Kepala yang menabrak badan ular lain tumbang. Terpanjang menang!',
      scene: () =>
        scene(
          ARENA.night,
          `${lawn()}${snake(
            [
              [460, 180],
              [380, 120],
              [280, 240],
              [160, 180],
            ],
            ME,
            'semangka',
          )}${shake(
            snake(
              [
                [330, 150],
                [330, 110],
                [330, 80],
                [330, 50],
              ],
              RIVAL,
              'nanas',
              'sad',
            ),
            330,
            140,
            0.4,
          )}${mark(false, 375, 100, 20)}${appear(label('Tumbang!', 470, 80, { size: 28, color: RIVAL }), 0.3, 2.4)}`,
        ),
      phone: { kind: 'look', text: 'Jaga kepalamu!' },
    },
  ],
};
