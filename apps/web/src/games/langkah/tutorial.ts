/** "Cara main" for Langkah Maut (shared/tutorial). Imports only shared art helpers. */
import { appear, box, fruit, hop, label, mark, move, pulse, scene, slide } from '../../shared/tutorial/draw';
import type { Tutorial } from '../../shared/tutorial/types';

const BG = '#0E0F13';
const STONE = '#4A4E5A';
const STONE_TOP = '#6A6F7D';
const YELLOW = '#FFC928';
const RED = '#F2453D';
const PATH_Y = 270;

/** A row of stone slabs over the dark abyss. */
function path(from = 40, count = 6, gap = 100): string {
  let out = '';
  for (let i = 0; i < count; i++) {
    const x = from + i * gap;
    out += `${box(x, PATH_Y, 84, 40, STONE, 6)}${box(x, PATH_Y, 84, 10, STONE_TOP, 4)}`;
  }
  return out;
}

const TRI: Record<'up' | 'right' | 'down' | 'left', string> = {
  up: 'M0 -30 L28 6 L10 6 L10 30 L-10 30 L-10 6 L-28 6 Z',
  right: 'M30 0 L-6 28 L-6 10 L-30 10 L-30 -10 L-6 -10 L-6 -28 Z',
  down: 'M0 30 L28 -6 L10 -6 L10 -30 L-10 -30 L-10 -6 L-28 -6 Z',
  left: 'M-30 0 L6 28 L6 10 L30 10 L30 -10 L6 -10 L6 -28 Z',
};

/** The big glowing cue arrow on a dark tile. */
function cue(x: number, y: number, dir: 'up' | 'right' | 'down' | 'left'): string {
  return `${box(x - 50, y - 50, 100, 100, '#22242B', 18)}<path transform="translate(${x} ${y})" d="${TRI[dir]}" fill="${YELLOW}"/>`;
}

export const TUTORIAL: Tutorial = {
  origin:
    'Terinspirasi dari game ritme injak panah seperti Dance Dance Revolution. Bedanya: salah langkah, kamu jatuh ke jurang.',
  steps: [
    {
      text: 'Panah muncul di layar. Tekan arah yang sama di HP tepat waktu.',
      scene: () =>
        scene(
          BG,
          `${path()}${pulse(cue(320, 110, 'right'), 320, 110, 1)}${hop(slide(fruit('semangka', 82, PATH_Y - 30, 60), 100, 0, 1.2), 30, 1.2)}`,
        ),
      phone: { kind: 'dpad', dir: 'right' },
    },
    {
      text: 'Salah arah atau terlambat, kamu jatuh. Ikut lagi di babak berikutnya.',
      scene: () =>
        scene(
          BG,
          `${path(40, 2)}${path(440, 2)}${cue(320, 100, 'up')}${slide(fruit('nanas', 320, PATH_Y - 30, 60, 'wow'), 0, 130, 2.2, 0.4)}${mark(false, 420, 100, 24)}${label('JATUH', 320, 230, { size: 26, color: RED })}`,
        ),
      phone: { kind: 'dpad', dir: 'left' },
    },
    {
      text: 'Delapan babak berbeda. Di Lorong Laser, tunggu laser dekat, lalu lompat.',
      scene: () =>
        scene(
          BG,
          `${path()}${move(box(520, PATH_Y - 26, 10, 26, RED, 3, 'opacity="0.9"'), -230, 0, 2)}${move(box(520, PATH_Y - 12, 100, 6, RED, 3), -230, 0, 2)}${hop(fruit('jeruk', 250, PATH_Y - 30, 60), 70, 2)}${label('LOMPAT', 320, 90, { size: 40, color: YELLOW })}${label('Lorong Laser', 320, 46, { size: 22, color: '#FFF7F0' })}`,
        ),
      phone: { kind: 'dpad', dir: 'up' },
    },
    {
      text: 'Tekan pas di ketukan untuk bonus beruntun. Yang bertahan dapat poin!',
      scene: () =>
        scene(
          BG,
          `${path()}${hop(fruit('semangka', 182, PATH_Y - 30, 56), 26, 0.8)}${hop(fruit('nanas', 282, PATH_Y - 30, 56), 26, 0.8, 0.2)}${hop(fruit('mangga', 382, PATH_Y - 30, 56), 26, 0.8, 0.4)}${appear(label('PAS!', 320, 110, { size: 52, color: YELLOW }), 0.2, 1.6)}${label('Beruntun 12', 320, 170, { size: 24, color: '#FFF7F0' })}`,
        ),
      phone: { kind: 'dpad', dir: 'down' },
    },
  ],
};
