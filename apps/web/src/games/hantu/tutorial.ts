/** "Cara main" for Hantu Tak Terlihat (shared/tutorial). Imports only shared art helpers. */
import {
  appear,
  arrow,
  box,
  circle,
  fruit,
  label,
  move,
  pulse,
  scene,
  shake,
} from '../../shared/tutorial/draw';
import type { Tutorial } from '../../shared/tutorial/types';

const BG = '#101214';
const FLOOR = '#1C1D21';
const WALL = '#4A4D55';
const LIGHT = '#FFE7A8';
const YELLOW = '#FFC928';
const GHOST = '#A6F4E6';

/** A dark hallway seen from above: floor boards between two walls. */
function hall(): string {
  let boards = '';
  for (let y = 70; y < 300; y += 46) boards += box(0, y, 640, 2, '#25262B', 0);
  return `${box(0, 50, 640, 260, FLOOR, 0)}${boards}${box(0, 40, 640, 14, WALL, 0)}${box(0, 306, 640, 14, WALL, 0)}`;
}

/** A flashlight cone from (x, y) pointing right, `len` px long. */
function beam(x: number, y: number, len = 260): string {
  return `<polygon points="${x},${y - 8} ${x + len},${y - 70} ${x + len},${y + 70} ${x},${y + 8}" fill="${LIGHT}" opacity="0.35"/>`;
}

/** A pale round ghost with a wavy hem and two eyes. */
function ghost(x: number, y: number, s = 1): string {
  const w = 34 * s;
  const h = 44 * s;
  return `<path d="M${x - w} ${y + h} L${x - w} ${y} Q${x - w} ${y - h} ${x} ${y - h} Q${x + w} ${y - h} ${x + w} ${y} L${x + w} ${y + h} Q${x + w / 2} ${y + h - 14 * s} ${x} ${y + h} Q${x - w / 2} ${y + h - 14 * s} ${x - w} ${y + h} Z" fill="${GHOST}"/>${circle(x - 12 * s, y - 6 * s, 6 * s, '#101214')}${circle(x + 12 * s, y - 6 * s, 6 * s, '#101214')}`;
}

function key(x: number, y: number): string {
  return `${circle(x - 10, y, 11, 'none', `stroke="${YELLOW}" stroke-width="6"`)}${box(x, y - 3, 30, 7, YELLOW, 3)}${box(x + 20, y + 2, 6, 10, YELLOW, 2)}`;
}

function roleCard(x: number, y: number, role: string, fill: string): string {
  return `${box(x - 90, y - 60, 180, 120, fill, 16)}${label(role, x, y + 10, { size: 30, color: '#101214' })}`;
}

export const TUTORIAL: Tutorial = {
  origin:
    'Terinspirasi dari game kejar-kejaran satu lawan semua. Bedanya: hantunya tak terlihat di layar kecuali tersorot senter.',
  steps: [
    {
      text: 'Tahan kartu di HP: kamu penghuni atau hantu. Rahasiakan!',
      scene: () =>
        scene(
          BG,
          `${roleCard(200, 170, 'PENGHUNI', LIGHT)}${appear(roleCard(440, 170, 'HANTU', GHOST), 0.6, 3)}${fruit('semangka', 200, 290, 64)}${label('Satu dari kalian adalah hantu', 320, 60, { size: 24, color: LIGHT })}`,
        ),
      phone: { kind: 'tap', label: 'Tahan kartu', hold: true },
    },
    {
      text: 'Penghuni: geser joystick untuk berjalan dan mengarahkan senter.',
      scene: () =>
        scene(
          BG,
          `${hall()}${move(`${beam(150, 180)}${fruit('semangka', 120, 180, 60)}`, 140, 0, 3)}${arrow(110, 250, 300, 250, { color: LIGHT })}`,
        ),
      phone: { kind: 'stick', dir: 'right', button: 'SENTER' },
    },
    {
      text: 'Hantu hanya terlihat saat tersorot. Sorot agar silau, lalu LARI!',
      scene: () =>
        scene(
          BG,
          `${hall()}${beam(190, 180, 300)}${fruit('nanas', 160, 180, 60, 'wow')}${appear(shake(ghost(430, 175), 430, 175), 0.4, 2.6)}${appear(label('Silau!', 430, 106, { size: 30, color: YELLOW }), 0.9, 2.6)}${move(fruit('jeruk', 560, 260, 44), 50, 0, 1.2)}`,
        ),
      phone: { kind: 'stick', dir: 'left', button: 'LARI' },
    },
    {
      text: 'Penghuni cari 3 kunci, nyalakan sekring, lalu kabur. Hantu menangkap!',
      scene: () =>
        scene(
          BG,
          `${hall()}${pulse(key(90, 110), 95, 110, 1.2)}${pulse(key(250, 260), 255, 260, 1.2, 0.3)}${pulse(key(400, 110), 405, 110, 1.2, 0.6)}${box(300, 56, 60, 40, WALL, 6)}${label('SEKRING', 330, 120, { size: 16, color: LIGHT })}${box(560, 120, 70, 120, '#2C1B0F', 8, `stroke="${YELLOW}" stroke-width="5"`)}${label('KELUAR', 595, 260, { size: 18, color: YELLOW })}${move(fruit('semangka', 300, 200, 56), 220, -20, 2.6)}`,
        ),
      phone: { kind: 'stick', dir: 'right', button: 'LARI' },
    },
  ],
};
