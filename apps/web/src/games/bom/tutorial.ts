/** "Cara main" for Bom Oper (shared/tutorial). Imports only shared art helpers. */
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
  shake,
  slide,
  tap,
} from '../../shared/tutorial/draw';
import type { Tutorial } from '../../shared/tutorial/types';

const BG = '#FFE98A';
const GRASS = '#7CC86A';
const PATH = '#E9D2A6';
const INK = '#1E1F24';
const RED = '#F2453D';
const ORANGE = '#FF8A3D';
const YELLOW = '#FFC928';

function yard(): string {
  return `${box(0, 120, 640, 240, GRASS, 0)}${box(0, 220, 640, 60, PATH, 0)}`;
}

/** The bomb with its fuse and a pulsing spark; `fast` makes the spark race. */
function bomb(x: number, y: number, fast = false): string {
  const spark = `${circle(x + 22, y - 32, 9, YELLOW)}${circle(x + 22, y - 32, 4, '#FFFFFF')}`;
  return `${circle(x, y, 22, INK)}${circle(x - 7, y - 7, 5, '#5A5D66')}<path d="M${x + 10} ${y - 18} Q${x + 14} ${y - 30} ${x + 22} ${y - 32}" fill="none" stroke="#9A6B45" stroke-width="4"/>${pulse(spark, x + 22, y - 32, fast ? 0.3 : 0.9)}`;
}

/** The red reach ring around the bomb holder. */
function ring(x: number, y: number, r = 90): string {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${RED}" fill-opacity="0.12" stroke="${RED}" stroke-width="4" stroke-dasharray="14 10"/>`;
}

function heart(x: number, y: number, color: string): string {
  return `<path transform="translate(${x} ${y}) scale(1.5)" d="M0 8 C-14 -2 -10 -16 0 -8 C10 -16 14 -2 0 8Z" fill="${color}"/>`;
}

export const TUTORIAL: Tutorial = {
  origin:
    'Terinspirasi dari permainan oper bom panas. Bedanya: kejar-kejaran di arena, waktu ledak rahasia, dan tiap pemain punya 3 nyawa.',
  steps: [
    {
      text: 'Pegang bom? Kejar teman terdekat dengan joystick.',
      scene: () =>
        scene(
          BG,
          `${yard()}${arrow(220, 200, 420, 200, { bend: 20, color: RED })}${move(`${fruit('semangka', 160, 250, 70, 'effort')}${bomb(160, 190)}`, 180, 0, 2.4)}${move(fruit('nanas', 480, 250, 64, 'wow'), 80, 0, 2.4)}`,
        ),
      phone: { kind: 'stick', dir: 'right', button: 'OPER' },
    },
    {
      text: 'Teman masuk lingkar merah? Ketuk OPER. Bomnya tak bisa langsung balik.',
      scene: () =>
        scene(
          BG,
          `${yard()}${ring(240, 250)}${fruit('semangka', 240, 250, 70)}${fruit('nanas', 310, 250, 64, 'wow')}${slide(bomb(240, 190), 70, 0, 1.6)}${tap(240, 190, '#FFFFFF', 0.2)}${label('OPER!', 275, 110, { size: 34, color: INK })}`,
        ),
      phone: { kind: 'tap', label: 'OPER' },
    },
    {
      text: 'Waktu ledaknya rahasia. Sumbu makin cepat menyala, cepat oper atau kabur!',
      scene: () =>
        scene(
          BG,
          `${yard()}${shake(bomb(320, 200, true), 320, 200, 0.3)}${fruit('jeruk', 320, 262, 64, 'wow')}${move(fruit('semangka', 160, 250, 60), -100, 0, 1.6)}${move(fruit('nanas', 480, 250, 60), 100, 0, 1.6)}${label('Kabur!', 320, 90, { size: 36, color: INK })}`,
        ),
      phone: { kind: 'stick', dir: 'any', button: 'OPER' },
    },
    {
      text: 'BUM! Pemegangnya kehilangan satu nyawa. Nyawa terbanyak menang.',
      scene: () =>
        scene(
          BG,
          `${yard()}${pulse(`${circle(200, 220, 70, ORANGE)}${circle(200, 220, 44, YELLOW)}${label('BUM!', 200, 232, { size: 34, color: INK })}`, 200, 220, 0.8)}${fruit('jeruk', 200, 310, 56, 'sad')}${heart(420, 90, RED)}${heart(470, 90, RED)}${heart(520, 90, '#E9D2A6')}${appear(label('-1', 560, 100, { size: 30, color: RED }), 0.3, 2.4)}${hop(fruit('semangka', 480, 250, 72), 30, 1)}`,
        ),
      phone: { kind: 'look', text: 'Jaga 3 nyawamu' },
    },
  ],
};
