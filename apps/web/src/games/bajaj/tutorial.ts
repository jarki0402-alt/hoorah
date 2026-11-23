/** "Cara main" for Bajaj Rush (shared/tutorial). Imports only shared art helpers. */
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
  slide,
} from '../../shared/tutorial/draw';
import type { Tutorial } from '../../shared/tutorial/types';

const SKY = '#FF9A4D';
const CITY = '#C9572B';
const ROAD = '#3A3D44';
const GOLD = '#FFC928';
const ROAD_Y = 196;

type Fruit = Parameters<typeof fruit>[0];
type Face = Parameters<typeof fruit>[4];

function street(): string {
  let dashes = '';
  for (let x = 0; x < 640; x += 80) dashes += box(x, 274, 40, 6, '#FFF7F0', 2);
  return `${circle(520, 100, 40, '#FFD36B')}<path d="M0 182 V128 h40 v54Z M50 182 V104 h30 v78Z M90 182 V138 h50 v44Z M150 182 V118 h32 v64Z M380 182 V112 h36 v70Z M426 182 V92 h28 v90Z M462 182 V128 h50 v54Z M570 182 V136 h70 v46Z" fill="${CITY}"/>${box(0, 182, 640, 14, '#9AA0A6', 0)}${box(0, ROAD_Y, 640, 164, ROAD, 0)}${dashes}`;
}

/** A three-wheeled bajaj facing right, wheels resting on y, with a fruit driver. */
function bajaj(x: number, y: number, color: string, who: Fruit, face: Face = 'happy'): string {
  return `${box(x - 70, y - 92, 140, 72, color, 28)}${box(x - 60, y - 102, 108, 16, '#1F2A44', 8)}${box(x - 44, y - 84, 50, 34, '#BFE6FF', 6)}${fruit(who, x - 19, y - 66, 34, face)}${box(x + 14, y - 84, 34, 34, '#BFE6FF', 10)}${box(x - 66, y - 44, 132, 7, GOLD, 2)}${circle(x - 44, y - 16, 17, '#111214')}${circle(x - 44, y - 16, 7, '#9AA0A6')}${circle(x + 48, y - 16, 17, '#111214')}${circle(x + 48, y - 16, 7, '#9AA0A6')}`;
}

function speedLines(x: number, y: number): string {
  return `<g stroke="#FFF7F0" stroke-width="5" stroke-linecap="round" opacity="0.7"><path d="M${x} ${y} H${x + 70}"/><path d="M${x - 20} ${y + 26} H${x + 60}"/><path d="M${x + 10} ${y + 52} H${x + 80}"/></g>`;
}

function crate(x: number, y: number): string {
  return `${box(x - 24, y - 24, 48, 48, '#C98D4E', 6)}${label('?', x, y + 10, { size: 30, color: '#FFF7F0' })}`;
}

function durian(x: number, y: number): string {
  return `${circle(x, y, 18, '#7BC043')}<path d="M${x - 18} ${y} h-8 M${x + 18} ${y} h8 M${x} ${y - 18} v-8 M${x} ${y + 18} v8" stroke="#4E8A2A" stroke-width="5" stroke-linecap="round"/>`;
}

function checkered(x: number): string {
  let out = '';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 2; c++)
      out += box(x + c * 20, ROAD_Y + r * 20, 20, 20, (r + c) % 2 ? '#111214' : '#FFFFFF', 0);
  }
  return out;
}

export const TUTORIAL: Tutorial = {
  origin:
    'Terinspirasi dari game balap kart dengan item. Bedanya: kendaraannya bajaj di kota Indonesia, pelurunya durian dan petasan.',
  steps: [
    {
      text: 'Pegang HP mendatar. Tahan GAS untuk jalan, REM untuk mundur.',
      scene: () =>
        scene(
          SKY,
          `${street()}${move(`${speedLines(70, 236)}${bajaj(220, 320, '#2F8CFF', 'jeruk')}`, 200, 0, 2.4)}${arrow(260, 344, 520, 344)}`,
        ),
      phone: { kind: 'buttons', labels: ['REM', 'GAS'], press: 1 },
    },
    {
      text: 'Tekan kiri atau kanan di setir untuk belok.',
      scene: () =>
        scene(
          SKY,
          `${street()}${move(bajaj(320, 300, '#2F8CFF', 'jeruk'), 0, 40, 1.6)}${arrow(440, 240, 440, 330, { color: GOLD, bend: -30 })}${arrow(200, 330, 200, 240, { color: GOLD, bend: -30 })}`,
        ),
      phone: { kind: 'dpad', dir: 'right' },
    },
    {
      text: 'Tabrak kardus untuk dapat item, lalu ketuk ITEM untuk memakainya.',
      scene: () =>
        scene(
          SKY,
          `${street()}${pulse(crate(330, 232), 330, 232, 1)}${bajaj(150, 340, '#2F8CFF', 'jeruk')}${shake(bajaj(520, 340, '#E8352E', 'nanas', 'wow'), 520, 300, 0.4)}${slide(durian(240, 290), 200, 0, 1.6)}${appear(label('KENA!', 520, 214, { size: 34, color: GOLD }), 1, 1.6)}`,
        ),
      phone: { kind: 'tap', label: 'Durian' },
    },
    {
      text: 'Selesaikan semua putaran paling dulu untuk jadi juara!',
      scene: () =>
        scene(
          SKY,
          `${street()}${checkered(500)}${slide(bajaj(200, 320, '#2F8CFF', 'jeruk'), 360, 0, 2.4)}${appear(label('JUARA 1', 320, 80, { size: 44, color: '#FFFFFF' }), 1.6, 2.4)}`,
        ),
      phone: { kind: 'look', text: 'Lihat balapan di layar' },
    },
  ],
};
