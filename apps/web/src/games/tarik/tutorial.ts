/** "Cara main" for Tarik Tambang (shared/tutorial). Imports only shared art helpers. */
import {
  appear,
  box,
  circle,
  fruit,
  label,
  move,
  pulse,
  scene,
  shake,
  tap,
} from '../../shared/tutorial/draw';
import type { Tutorial } from '../../shared/tutorial/types';

const SKY = '#9ADBFF';
const SAND = '#E2B07A';
const GRASS = '#3E9A45';
const ROPE = '#A87448';
const RED = '#E8352E';
const BLUE = '#2F7DF6';
const GROUND = 246;
const ROPE_Y = 214;
const LINE_RED = 240;
const LINE_BLUE = 400;

function field(): string {
  return `${box(0, GROUND - 10, 640, 12, GRASS, 0)}${box(0, GROUND, 640, 114, SAND, 0)}${box(LINE_RED - 3, GROUND, 6, 114, '#FFFFFF', 2)}${box(LINE_BLUE - 3, GROUND, 6, 114, '#FFFFFF', 2)}${label('MERAH', LINE_RED, 340, { size: 18, color: RED })}${label('BIRU', LINE_BLUE, 340, { size: 18, color: BLUE })}`;
}

/** The rope with both teams holding it and the flag in the middle at `flagX`. */
function teams(flagX = 320, face: 'happy' | 'effort' = 'effort'): string {
  const rope = box(40, ROPE_Y - 4, 560, 8, ROPE, 4);
  const flag = `${box(flagX - 3, ROPE_Y - 4, 6, 38, '#FFFFFF', 2)}<polygon points="${flagX + 3},${ROPE_Y + 34} ${flagX + 3},${ROPE_Y + 10} ${flagX + 28},${ROPE_Y + 22}" fill="#FFC928"/>`;
  const red = `${fruit('semangka', 80, ROPE_Y - 10, 60, face)}${fruit('stroberi', 150, ROPE_Y - 10, 60, face)}`;
  const blue = `${fruit('jeruk', 490, ROPE_Y - 10, 60, face)}${fruit('nanas', 560, ROPE_Y - 10, 60, face)}`;
  return `${rope}${flag}${red}${blue}`;
}

export const TUTORIAL: Tutorial = {
  origin:
    'Terinspirasi dari lomba tarik tambang 17-an. Bedanya: tali ditarik dengan mengetuk HP, dan ketukan yang pas memberi tarikan super.',
  steps: [
    {
      text: 'Dua tim beradu. Ketuk TARIK! secepatnya untuk menarik tali.',
      scene: () =>
        scene(
          SKY,
          `${field()}${move(teams(), -60, 0, 1.6)}${tap(110, 120, '#FFFFFF')}${tap(110, 120, '#FFFFFF', 0.4)}${label('TARIK!', 110, 90, { size: 30, color: RED })}`,
        ),
      phone: { kind: 'tap', label: 'TARIK!' },
    },
    {
      text: 'Ketuk saat cincin kuning pas di garis putih: tarikan super!',
      scene: () =>
        scene(
          SKY,
          `${field()}${teams()}${circle(320, 100, 46, 'none', 'stroke="#FFFFFF" stroke-width="8"')}${pulse(circle(320, 100, 46, 'none', 'stroke="#FFC928" stroke-width="8"'), 320, 100, 1.4)}${appear(label('SUPER TARIK!', 320, 30, { size: 30, color: '#FFC928' }), 0.6, 1.4)}`,
        ),
      phone: { kind: 'tap', label: 'TARIK!' },
    },
    {
      text: 'Ketukan berirama lebih kuat daripada ketukan asal cepat.',
      scene: () =>
        scene(
          SKY,
          `${field()}${shake(teams(), 320, ROPE_Y, 0.6)}${tap(200, 110, '#FFFFFF', 0)}${tap(320, 110, '#FFFFFF', 0.3)}${tap(440, 110, '#FFFFFF', 0.6)}${label('KOMBO x3', 320, 60, { size: 30, color: '#FFC928' })}`,
        ),
      phone: { kind: 'tap', label: 'TARIK!' },
    },
    {
      text: 'Seret bendera melewati garis timmu untuk menang ronde.',
      scene: () =>
        scene(
          SKY,
          `${field()}${move(teams(320, 'happy'), -100, 0, 2.4)}${appear(label('MERAH MENANG!', 320, 80, { size: 40, color: RED }), 1.2, 2.4)}`,
        ),
      phone: { kind: 'look', text: 'Lihat bendera di layar' },
    },
  ],
};
