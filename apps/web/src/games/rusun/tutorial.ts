/** "Cara main" for Rusun (shared/tutorial). Imports only shared art helpers. */
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

const BG = '#2B3A55';
const GROUND = '#2E9E4F';
const STEEL = '#9AA0A6';
const GOLD = '#FFC928';
const COLORS = ['#F2453D', '#2F8CFF', '#FFC928', '#FF7A1F'] as const;
const BASE = 320;
const FH = 36;

/** One floor of the flats: a coloured slab with a row of windows, top-left at (x, y). */
function floor(x: number, y: number, w: number, color: string): string {
  let windows = '';
  for (let i = 0; i < Math.floor(w / 34); i++) windows += box(x + 10 + i * 34, y + 10, 20, 16, '#FFF2C2', 3);
  return `${box(x, y, w, FH - 2, color, 4)}${windows}`;
}

/** A tower of `n` floors centred at x 320 standing on the ground. */
function tower(n: number): string {
  let out = '';
  for (let i = 0; i < n; i++) out += floor(250, BASE - (i + 1) * FH, 140, COLORS[i % COLORS.length] ?? GOLD);
  return out;
}

function ground(): string {
  return box(0, BASE, 640, 360 - BASE, GROUND, 0);
}

/** The crane arm across the top of the scene. */
function crane(): string {
  return `${box(40, 20, 560, 12, STEEL, 4)}${box(40, 20, 14, 70, STEEL, 2)}`;
}

function hooked(x: number, y: number, w: number, color: string): string {
  return `${box(x + w / 2 - 2, 32, 4, y - 32, '#111214', 2)}${floor(x, y, w, color)}`;
}

export const TUTORIAL: Tutorial = {
  origin:
    'Terinspirasi dari game menyusun menara balok. Bedanya: menaranya rumah susun, dimainkan bergiliran, dan yang merobohkan kalah.',
  steps: [
    {
      text: 'Saat giliranmu, crane menggeser lantai baru ke kanan dan kiri.',
      scene: () =>
        scene(
          BG,
          `${ground()}${tower(3)}${crane()}${move(hooked(130, 120, 130, COLORS[3]), 250, 0, 2.4)}${arrow(150, 190, 490, 190, { color: GOLD })}${fruit('semangka', 560, BASE - 30, 56)}`,
        ),
      phone: { kind: 'look', text: 'Lihat crane di layar' },
    },
    {
      text: 'Ketuk JATUHKAN saat lantai tepat di atas menara.',
      scene: () =>
        scene(
          BG,
          `${ground()}${tower(3)}${crane()}${slide(floor(255, 120, 130, COLORS[3]), 0, BASE - 4 * FH - 120, 1.6)}${appear(label('PAS!', 470, 150, { size: 40, color: GOLD }), 1, 1.6)}${fruit('semangka', 560, BASE - 30, 56, 'effort')}`,
        ),
      phone: { kind: 'tap', label: 'JATUHKAN' },
    },
    {
      text: 'Lantai yang terlalu ke pinggir bikin menara miring dan goyang.',
      scene: () =>
        scene(
          BG,
          `${ground()}${shake(`${tower(3)}${floor(320, BASE - 4 * FH, 130, COLORS[3])}`, 320, BASE, 0.7)}${mark(false, 500, 160, 26)}${box(470, 230, 140, 18, '#1D2740', 9)}${box(470, 230, 46, 18, '#2E9E4F', 9)}${box(516, 230, 46, 18, GOLD, 0)}${box(562, 230, 48, 18, '#F2453D', 9)}${label('KESEIMBANGAN', 540, 220, { size: 16 })}${fruit('semangka', 90, BASE - 30, 56, 'wow')}`,
        ),
      phone: { kind: 'look', text: 'Pantau KESEIMBANGAN' },
    },
    {
      text: 'Susun bergiliran. Yang merobohkan menara, kalah!',
      scene: () =>
        scene(
          BG,
          `${ground()}${tower(2)}${slide(`${floor(250, BASE - 3 * FH, 140, COLORS[2])}${floor(290, BASE - 4 * FH, 140, COLORS[3])}`, 160, 90, 1.8)}${appear(label('ROBOH!', 320, 90, { size: 48, color: '#F2453D' }), 0.8, 1.8)}${fruit('semangka', 90, BASE - 30, 56, 'sad')}${fruit('nanas', 560, BASE - 30, 56)}`,
        ),
      phone: { kind: 'buttons', labels: ['Sorak!', 'Huuu~'], press: 0 },
    },
  ],
};
