/** "Cara main" for Nyebrang (shared/tutorial). Imports only shared art helpers. */
import {
  appear,
  arrow,
  box,
  circle,
  fruit,
  hop,
  label,
  mark,
  move,
  pulse,
  scene,
  slide,
} from '../../shared/tutorial/draw';
import type { Tutorial } from '../../shared/tutorial/types';

const GRASS = '#7CC45E';
const GRASS_DARK = '#5FA845';
const ROAD = '#3A3734';
const WATER = '#9CC9E0';
const LOG = '#7A5230';
const RAIL = '#6B4A2E';
const RED = '#FF3B2E';
const CREAM = '#F7F2E8';
const LANE = 60;

/** A full-width lane band starting at row `r` (0 = top). */
function lane(r: number, fill: string): string {
  return box(0, r * LANE, 640, LANE, fill, 0);
}

function grass(r: number): string {
  return lane(r, r % 2 ? GRASS : GRASS_DARK);
}

function road(r: number): string {
  const y = r * LANE + LANE / 2;
  return `${lane(r, ROAD)}<line x1="0" y1="${y}" x2="640" y2="${y}" stroke="${CREAM}" stroke-width="4" stroke-dasharray="20 16" opacity="0.5"/>`;
}

/** A little angkot seen from above. */
function angkot(x: number, y: number, color = '#FF6FA8'): string {
  return `${box(x, y - 20, 96, 40, color, 8)}${box(x + 62, y - 16, 22, 32, '#1A1816', 4)}${box(x + 8, y - 14, 44, 6, CREAM, 3)}`;
}

function rail(r: number): string {
  let ties = '';
  for (let x = 10; x < 640; x += 30) ties += box(x, r * LANE + 8, 10, LANE - 16, RAIL, 2);
  return `${lane(r, '#D8D8DC')}${ties}${box(0, r * LANE + 16, 640, 5, '#4A4E5A', 0)}${box(0, r * LANE + LANE - 21, 640, 5, '#4A4E5A', 0)}`;
}

function log(x: number, y: number, w = 150): string {
  return `${box(x, y - 18, w, 36, LOG, 18)}${box(x + 10, y - 8, w - 20, 5, '#9A6D44', 3)}`;
}

export const TUTORIAL: Tutorial = {
  origin:
    'Terinspirasi dari Crossy Road dan Frogger. Bedanya: semua lompat serentak di satu layar dan kamera terus mengejar.',
  steps: [
    {
      text: 'Usap ke mana saja di HP: satu usap, satu lompatan. Ketuk untuk maju.',
      scene: () =>
        scene(
          GRASS,
          `${grass(0)}${grass(1)}${grass(2)}${grass(3)}${grass(4)}${grass(5)}${arrow(320, 250, 320, 140, { width: 7 })}${hop(slide(fruit('semangka', 320, 270, 52), 0, -LANE * 2, 2), 24, 1)}${fruit('nanas', 200, 270, 52)}${fruit('jeruk', 440, 210, 52)}`,
        ),
      phone: { kind: 'swipe', dir: 'up' },
    },
    {
      text: 'Awas angkot dan kereta. Lampu merah berkedip artinya kereta datang!',
      scene: () =>
        scene(
          GRASS,
          `${grass(0)}${rail(1)}${grass(2)}${road(3)}${road(4)}${grass(5)}${pulse(circle(40, 1.5 * LANE, 14, RED), 40, 1.5 * LANE, 0.6)}${label('KERETA!', 110, 1.5 * LANE + 8, { size: 22, color: RED, anchor: 'start' })}${slide(angkot(-120, 3.5 * LANE), 820, 0, 2.4)}${slide(angkot(640, 4.5 * LANE, '#FF8A5C'), -820, 0, 3)}${fruit('semangka', 360, 2.5 * LANE, 52)}${mark(true, 410, 2.5 * LANE - 30, 16)}`,
        ),
      phone: { kind: 'tap', label: 'MAJU' },
    },
    {
      text: 'Di sungai, pijak batang kayu dan teratai. Jangan sampai tercebur.',
      scene: () =>
        scene(
          GRASS,
          `${grass(0)}${lane(1, WATER)}${lane(2, WATER)}${lane(3, WATER)}${grass(4)}${grass(5)}${move(log(60, 1.5 * LANE), 120, 0, 3)}${move(`${log(250, 2.5 * LANE)}${fruit('semangka', 325, 2.5 * LANE, 50)}`, -120, 0, 3)}${circle(470, 3.5 * LANE, 24, '#3FA34D')}${circle(160, 3.5 * LANE, 24, '#3FA34D')}${appear(fruit('nanas', 470, 3.5 * LANE, 48), 0.3, 2.4)}${fruit('jeruk', 320, 4.5 * LANE, 50)}`,
        ),
      phone: { kind: 'swipe', dir: 'up' },
    },
    {
      text: 'Kamera terus maju. Yang tertinggal di tepi layar gugur!',
      scene: () =>
        scene(
          GRASS,
          `${grass(0)}${road(1)}${grass(2)}${grass(3)}${grass(4)}${grass(5)}${hop(fruit('semangka', 300, 2.5 * LANE, 52), 24, 1)}${fruit('nanas', 420, 3.5 * LANE, 52)}${fruit('alpukat', 200, 5.5 * LANE - 4, 52, 'sad')}${mark(false, 250, 5.5 * LANE - 36, 16)}${box(0, 316, 640, 44, RED, 0, 'opacity="0.35"')}${label('TEPI LAYAR MAJU', 460, 346, { size: 22 })}${arrow(600, 300, 600, 220, { color: CREAM })}`,
        ),
      phone: { kind: 'swipe', dir: 'up' },
    },
  ],
};
