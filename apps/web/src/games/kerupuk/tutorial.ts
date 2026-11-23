/** "Cara main" for Makan Kerupuk (shared/tutorial). Imports only shared art helpers. */
import {
  appear,
  box,
  bubble,
  circle,
  fruit,
  hop,
  label,
  move,
  scene,
  shake,
  tap,
} from '../../shared/tutorial/draw';
import type { Tutorial } from '../../shared/tutorial/types';

const SKY = '#9ADBFF';
const ROPE = '#7A4A1E';
const CRACKER = '#F6E7C8';
const CRUST = '#D9B36A';
const RED = '#E8352E';
const GOLD = '#FFC928';
const GROUND = 300;

function backdrop(): string {
  let flags = '';
  for (let x = 20; x < 640; x += 60) {
    flags += `<polygon points="${x},24 ${x + 40},24 ${x + 20},50" fill="${(x / 60) % 2 < 1 ? RED : '#FFFFFF'}"/>`;
  }
  return `${box(0, GROUND, 640, 60, '#3E9A45', 0)}${box(0, 18, 640, 6, ROPE, 0)}${flags}`;
}

/** A round cracker hanging from the rope, centre (x, y); `bites` chunks taken from its bottom. */
function cracker(x: number, y: number, r = 46, bites = 0): string {
  let chunks = '';
  for (let i = 0; i < bites; i++) chunks += circle(x - r * 0.5 + i * r * 0.5, y + r * 0.9, r * 0.38, SKY);
  const dots = `${circle(x - r * 0.4, y - r * 0.2, r * 0.08, CRUST)}${circle(x + r * 0.3, y - r * 0.35, r * 0.08, CRUST)}${circle(x + r * 0.1, y + r * 0.25, r * 0.08, CRUST)}`;
  return `${box(x - 1.5, 24, 3, y - r - 24, ROPE, 1)}${circle(x, y, r, CRACKER, `stroke="${CRUST}" stroke-width="5"`)}${dots}${chunks}`;
}

export const TUTORIAL: Tutorial = {
  origin:
    'Terinspirasi dari lomba makan kerupuk 17-an. Bedanya: kerupuk bergoyang di layar, dan gigitan harus pas saat di depan mulut.',
  steps: [
    {
      text: 'Kerupuk bergoyang di tali. Tangan di belakang, tidak boleh dipakai!',
      scene: () =>
        scene(SKY, `${backdrop()}${move(cracker(240, 150), 160, 0, 1.8)}${fruit('rambutan', 320, 250, 110)}`),
      phone: { kind: 'look', text: 'Siap-siap!' },
    },
    {
      text: 'Ketuk GIGIT tepat saat kerupuk di depan mulut.',
      scene: () =>
        scene(
          SKY,
          `${backdrop()}${cracker(320, 150, 46, 1)}${tap(320, 196, '#FFFFFF')}${hop(fruit('rambutan', 320, 250, 110, 'wow'), 14, 0.6)}${appear(label('PAS!', 470, 140, { size: 44, color: GOLD }), 0.3, 1.6)}`,
        ),
      phone: { kind: 'tap', label: 'GIGIT' },
    },
    {
      text: 'Gigitan meleset bikin kamu tersedak sebentar.',
      scene: () =>
        scene(
          SKY,
          `${backdrop()}${cracker(470, 150)}${shake(fruit('rambutan', 320, 250, 110, 'sad'), 320, 250, 0.4)}${bubble('Uhuk!', 190, 200)}`,
        ),
      phone: { kind: 'look', text: 'Tersedak!' },
    },
    {
      text: 'Yang pertama menghabiskan kerupuk, menang!',
      scene: () =>
        scene(
          SKY,
          `${backdrop()}${cracker(140, 140, 34, 1)}${fruit('nanas', 140, 250, 84, 'effort')}${appear(label('Habis!', 320, 120, { size: 40, color: RED }), 0.4, 2)}${hop(fruit('rambutan', 320, 250, 96), 30, 1)}${cracker(500, 140, 34, 2)}${fruit('jeruk', 500, 250, 84, 'effort')}`,
        ),
      phone: { kind: 'look', text: 'Habis duluan!' },
    },
  ],
};
