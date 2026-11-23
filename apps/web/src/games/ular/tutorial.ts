/** "Cara main" for Ular Tangga (shared/tutorial). Imports only shared art helpers. */
import {
  appear,
  arrow,
  box,
  circle,
  fruit,
  hop,
  label,
  mark,
  pulse,
  scene,
  slide,
  tap,
} from '../../shared/tutorial/draw';
import type { Tutorial } from '../../shared/tutorial/types';

const BG = '#1F6B3A';
const CELL = 54;
const X0 = 110;
const Y0 = 34;

/** A 6x5 board of light and dark cells numbered like a snake path. */
function board(): string {
  let out = '';
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 6; c++) {
      const x = X0 + c * CELL;
      const y = Y0 + r * CELL;
      out += box(x, y, CELL - 4, CELL - 4, (r + c) % 2 ? '#F6E7C1' : '#E9CF8E', 8);
      // A 1–100 board in short: the top row ends at 100, the bottom row starts at 1.
      const num = r === 0 ? 100 - c : r === 4 ? c + 1 : null;
      if (num !== null)
        out += label(String(num), x + 10, y + 18, { size: 13, color: '#8A6A2A', anchor: 'start' });
    }
  }
  return out;
}

const cx = (c: number) => X0 + c * CELL + (CELL - 4) / 2;
const cy = (r: number) => Y0 + r * CELL + (CELL - 4) / 2;

function ladder(c1: number, r1: number, c2: number, r2: number): string {
  const x1 = cx(c1);
  const y1 = cy(r1);
  const x2 = cx(c2);
  const y2 = cy(r2);
  const dx = 9;
  let rungs = '';
  for (let i = 1; i < 5; i++) {
    const t = i / 5;
    rungs += `<line x1="${x1 - dx + (x2 - x1) * t}" y1="${y1 + (y2 - y1) * t}" x2="${x1 + dx + (x2 - x1) * t}" y2="${y1 + (y2 - y1) * t}" stroke="#8B5A2B" stroke-width="5"/>`;
  }
  return `<line x1="${x1 - dx}" y1="${y1}" x2="${x2 - dx}" y2="${y2}" stroke="#8B5A2B" stroke-width="6" stroke-linecap="round"/><line x1="${x1 + dx}" y1="${y1}" x2="${x2 + dx}" y2="${y2}" stroke="#8B5A2B" stroke-width="6" stroke-linecap="round"/>${rungs}`;
}

function snake(c1: number, r1: number, c2: number, r2: number): string {
  const x1 = cx(c1);
  const y1 = cy(r1);
  const x2 = cx(c2);
  const y2 = cy(r2);
  const mx = (x1 + x2) / 2 + 40;
  const my = (y1 + y2) / 2;
  return `<path d="M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}" fill="none" stroke="#2FA84F" stroke-width="12" stroke-linecap="round"/>${circle(x1, y1, 13, '#2FA84F')}${circle(x1 - 4, y1 - 3, 3, '#111214')}${circle(x1 + 4, y1 - 3, 3, '#111214')}`;
}

function die(x: number, y: number, pips: number): string {
  const spots: Record<number, [number, number][]> = {
    1: [[0, 0]],
    3: [
      [-12, -12],
      [0, 0],
      [12, 12],
    ],
    5: [
      [-12, -12],
      [12, -12],
      [0, 0],
      [-12, 12],
      [12, 12],
    ],
  };
  return `${box(x - 30, y - 30, 60, 60, '#FFFFFF', 12)}${(spots[pips] ?? []).map(([a, b]) => circle(x + a, y + b, 6, '#111214')).join('')}`;
}

export const TUTORIAL: Tutorial = {
  origin:
    'Terinspirasi dari Ular Tangga yang biasa dimainkan di rumah. Bedanya: ada kotak kejutan dan duel kilat yang bisa membalik posisi.',
  steps: [
    {
      text: 'Saat giliranmu, ketuk LEMPAR di HP untuk melempar dadu.',
      scene: () =>
        scene(
          BG,
          `${board()}${pulse(die(530, 120, 5), 530, 120, 0.9)}${tap(530, 120)}${fruit('semangka', cx(0), cy(4), 44)}`,
        ),
      phone: { kind: 'tap', label: 'LEMPAR' },
    },
    {
      text: 'Bidakmu maju sesuai angka dadu, kotak demi kotak.',
      scene: () =>
        scene(
          BG,
          `${board()}${die(530, 120, 3)}${arrow(cx(0), cy(4) + 22, cx(3), cy(4) + 22, { bend: -14 })}${slide(fruit('semangka', cx(0), cy(4), 44), CELL * 3, 0, 2.4)}`,
        ),
      phone: { kind: 'look', text: 'Lihat bidakmu di layar' },
    },
    {
      text: 'Kaki tangga membawamu naik. Kepala ular membuatmu turun!',
      scene: () =>
        scene(
          BG,
          `${board()}${ladder(1, 4, 2, 1)}${snake(4, 0, 5, 3)}${slide(fruit('semangka', cx(1), cy(4), 40), cx(2) - cx(1), cy(1) - cy(4), 2.6)}${mark(true, 520, 110)}${label('Naik', 560, 117, { anchor: 'start', size: 22 })}${mark(false, 520, 190)}${label('Turun', 560, 197, { anchor: 'start', size: 22 })}`,
        ),
      phone: { kind: 'look', text: 'Awas kepala ular!' },
    },
    {
      text: 'Kotak kejutan bisa menukar posisi. Yang pertama sampai 100 menang!',
      scene: () =>
        scene(
          BG,
          `${board()}${appear(`${box(cx(3) - 24, cy(2) - 24, 48, 48, '#FFC928', 10)}${label('?', cx(3), cy(2) + 10, { size: 30, color: '#111214' })}`, 0.2, 2.6)}${hop(fruit('nanas', cx(5), cy(0), 44), 26, 1)}${label('Menang!', 520, 70, { size: 30, color: '#FFC928' })}`,
        ),
      phone: { kind: 'look', text: 'Sorak untuk pemenang' },
    },
  ],
};
