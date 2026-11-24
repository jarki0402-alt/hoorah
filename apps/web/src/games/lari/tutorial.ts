/** "Cara main" for Lari Terus (shared/tutorial). Imports only shared art helpers. */
import {
  appear,
  arrow,
  box,
  fruitHead,
  hop,
  label,
  mark,
  scene,
  shake,
  slide,
} from '../../shared/tutorial/draw';
import type { Tutorial } from '../../shared/tutorial/types';

const SKY = '#FFE2B8';
const HAZE = '#FFD29A';
const ROOF = '#3A3C42';
const EDGE = '#E7D3B5';
const BAR = '#2F8CFF';
const STOP = '#E8352E';
const GROUND = 290;

/** Three lanes on a rooftop, seen from behind the runners. */
function lanes(): string {
  return `${box(0, 110, 640, 70, HAZE, 0)}<polygon points="250,120 390,120 600,360 40,360" fill="${ROOF}"/><path d="M297 120 L227 360 M343 120 L413 360" fill="none" stroke="${EDGE}" stroke-width="5" stroke-dasharray="18 14"/>`;
}

/** A barrier block in a lane (striped red and white). */
function block(x: number, y: number, w: number, h: number): string {
  return `${box(x - w / 2, y - h, w, h, '#FFF7F0', 6)}${box(x - w / 2, y - h * 0.62, w, h * 0.28, STOP, 0)}`;
}

/** Side view: the roof the runner stands on. */
function roof(): string {
  return `${box(0, 120, 640, 60, HAZE, 0)}${box(0, GROUND, 640, 70, ROOF, 0)}${box(0, GROUND, 640, 6, EDGE, 0)}`;
}

export const TUTORIAL: Tutorial = {
  origin:
    'Terinspirasi dari game lari tanpa henti seperti Subway Surfers. Bedanya: semua pelari berlari bersama, yang terakhir bertahan juara.',
  steps: [
    {
      text: 'Usap kiri atau kanan untuk pindah satu jalur.',
      scene: () =>
        scene(
          SKY,
          `${lanes()}${block(320, 220, 56, 52)}${arrow(300, 300, 170, 300, { bend: 30 })}${slide(fruitHead('semangka', 320, 300, 72), -170, 0, 2)}`,
        ),
      phone: { kind: 'swipe', dir: 'left' },
    },
    {
      text: 'Usap ke atas untuk melompati palang rendah.',
      scene: () =>
        scene(
          SKY,
          `${roof()}${box(330, GROUND - 40, 36, 40, BAR, 6)}${box(318, GROUND - 46, 60, 12, '#FFF7F0', 4)}${arrow(170, GROUND - 70, 520, GROUND - 70, { bend: 110 })}${slide(hop(fruitHead('semangka', 150, GROUND - 30, 60), 110, 2.4), 340, 0, 2.4)}`,
        ),
      phone: { kind: 'swipe', dir: 'up' },
    },
    {
      text: 'Usap ke bawah untuk merunduk di bawah palang tinggi.',
      scene: () =>
        scene(
          SKY,
          `${roof()}${box(320, 150, 10, GROUND - 150, '#FFF7F0', 3)}${box(410, 150, 10, GROUND - 150, '#FFF7F0', 3)}${box(310, 190, 120, 34, BAR, 6)}${arrow(140, 180, 140, 250)}${slide(fruitHead('semangka', 150, GROUND - 22, 44, 'effort'), 360, 0, 2.4)}`,
        ),
      phone: { kind: 'swipe', dir: 'down' },
    },
    {
      text: 'Menabrak bikin tertinggal. Pelari terakhir yang bertahan menang!',
      scene: () =>
        scene(
          SKY,
          `${lanes()}${hop(fruitHead('nanas', 300, 170, 44), 24, 0.6)}${hop(fruitHead('jeruk', 350, 180, 44), 24, 0.6, 0.3)}${block(420, 290, 64, 56)}${shake(fruitHead('semangka', 420, 320, 64, 'sad'), 420, 320, 0.4)}${mark(false, 480, 250, 20)}${appear(label('Tersandung!', 160, 80, { size: 28, color: STOP }), 0.2, 2.4)}`,
        ),
      phone: { kind: 'look', text: 'Jangan sampai tertinggal' },
    },
  ],
};
