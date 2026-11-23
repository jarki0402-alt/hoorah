/** "Cara main" for Dapur Heboh (shared/tutorial). Imports only shared art helpers. */
import {
  appear,
  arrow,
  box,
  circle,
  fruit,
  label,
  mark,
  move,
  pulse,
  scene,
  shake,
  slide,
  tap,
} from '../../shared/tutorial/draw';
import type { Tutorial } from '../../shared/tutorial/types';

const FLOOR = '#ECE6DA';
const WALL = '#EFE8DC';
const WOOD = '#B9824C';
const TOP = '#EAD5B0';
const STEEL = '#A3AAB3';
const INK = '#2A2420';
const ORANGE = '#FF7A3D';
const TOMATO = '#F2453D';

/** Floor tiles and the back wall. */
function room(): string {
  let tiles = '';
  for (let x = 0; x < 640; x += 80) {
    for (let y = 110; y < 360; y += 80) {
      if ((x / 80 + (y - 110) / 80) % 2 === 1) tiles += box(x, y, 80, 80, '#DDD5C6', 0);
    }
  }
  return `${tiles}${box(0, 0, 640, 110, WALL, 0)}`;
}

/** A counter block with a lighter top. */
function counter(x: number, y: number, w: number): string {
  return `${box(x, y, w, 70, WOOD, 8)}${box(x, y, w, 18, TOP, 8)}`;
}

function tomato(x: number, y: number, r = 16): string {
  return `${circle(x, y, r, TOMATO)}<polygon points="${x - 7},${y - r + 2} ${x},${y - r - 6} ${x + 7},${y - r + 2}" fill="#22B35E"/>`;
}

/** Tomato halves on a cutting board. */
function sliced(x: number, y: number): string {
  return `${circle(x - 10, y, 12, TOMATO)}${circle(x + 12, y, 12, TOMATO)}${circle(x - 10, y, 6, '#FFB3A8')}${circle(x + 12, y, 6, '#FFB3A8')}`;
}

function basket(x: number, y: number): string {
  return `${box(x - 40, y - 20, 80, 44, '#C9934F', 10)}${tomato(x - 16, y - 22, 13)}${tomato(x + 14, y - 24, 13)}`;
}

function board(x: number, y: number): string {
  return box(x - 44, y - 16, 88, 34, '#F3E3C7', 8, `stroke="${WOOD}" stroke-width="3"`);
}

function stove(x: number, y: number): string {
  return `${box(x - 46, y - 18, 92, 40, STEEL, 8)}${circle(x, y + 2, 22, INK)}${circle(x, y + 2, 14, '#3A3330')}`;
}

/** A plate with a dish and the order ticket it matches. */
function plate(x: number, y: number): string {
  return `${circle(x, y, 26, '#FFFFFF', `stroke="${STEEL}" stroke-width="3"`)}${sliced(x, y)}`;
}

export const TUTORIAL: Tutorial = {
  origin:
    'Terinspirasi dari game masak kerja sama yang heboh. Bedanya: menu Nusantara, dan bahan bisa dilempar ke teman di seberang.',
  steps: [
    {
      text: 'Gerak dengan joystick, ketuk Ambil di keranjang untuk ambil bahan.',
      scene: () =>
        scene(
          FLOOR,
          `${room()}${counter(60, 120, 520)}${basket(160, 140)}${board(330, 140)}${stove(480, 140)}${move(fruit('semangka', 300, 270, 76), -130, 0, 2.4)}${appear(tomato(178, 220), 1.1, 2.4)}${tap(160, 150, '#FFFFFF', 1.1)}`,
        ),
      phone: { kind: 'buttons', labels: ['Ambil', 'Kerja', 'Lempar'], press: 0 },
    },
    {
      text: 'Tahan Kerja di talenan untuk memotong, lalu masak di kompor.',
      scene: () =>
        scene(
          FLOOR,
          `${room()}${counter(60, 120, 520)}${basket(160, 140)}${board(330, 140)}${appear(sliced(330, 138), 1, 3)}${shake(tomato(330, 132), 330, 132, 0.3)}${stove(480, 140)}${fruit('semangka', 330, 260, 80, 'effort')}${arrow(380, 210, 460, 190, { bend: 20, color: ORANGE })}`,
        ),
      phone: { kind: 'buttons', labels: ['Ambil', 'Kerja', 'Lempar'], press: 1 },
    },
    {
      text: 'Ketuk Lempar: bahan terbang ke teman. Pastikan tangannya kosong!',
      scene: () =>
        scene(
          FLOOR,
          `${room()}${box(312, 110, 16, 250, WOOD, 6)}${fruit('semangka', 160, 260, 80)}${fruit('nanas', 480, 260, 80, 'wow')}${arrow(190, 200, 450, 200, { bend: 60, color: ORANGE })}${slide(tomato(190, 210), 260, 0, 1.8)}${mark(true, 540, 200)}`,
        ),
      phone: { kind: 'buttons', labels: ['Ambil', 'Kerja', 'Lempar'], press: 2 },
    },
    {
      text: 'Susun di piring sesuai tiket, lalu antar ke loket sebelum pelanggan pulang.',
      scene: () =>
        scene(
          FLOOR,
          `${room()}${box(470, 20, 120, 70, '#FFFFFF', 8)}${sliced(530, 52)}${label('TIKET', 530, 84, { size: 14, color: INK })}${counter(500, 150, 110)}${label('LOKET', 555, 210, { size: 20, color: '#FFFFFF' })}${slide(`${fruit('semangka', 180, 270, 76)}${plate(180, 214)}`, 300, -40, 2.6)}${pulse(label('★★★', 200, 70, { size: 40, color: ORANGE }), 200, 58, 1.2)}`,
        ),
      phone: { kind: 'stick', dir: 'right', button: 'Ambil' },
    },
  ],
};
