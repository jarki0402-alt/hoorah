/** "Cara main" for Juragan Nusantara (shared/tutorial). Imports only shared art helpers. */
import {
  appear,
  arrow,
  box,
  circle,
  fruit,
  hop,
  label,
  pulse,
  scene,
  slide,
  tap,
} from '../../shared/tutorial/draw';
import type { Tutorial } from '../../shared/tutorial/types';

const BG = '#0B2E37';
const SEA = '#0F5664';
const CREAM = '#F8EEDA';
const GOLD = '#E9B43C';
const INK = '#1E1F24';
const MINE = '#FF8A3D';
const RIVAL = '#2F8CFF';
const TILE_W = 104;
const TILE_Y = 214;
const ROW_X = 60;

/** One city tile: colour band, name and price. */
function tile(x: number, name: string, band: string, price: string): string {
  return `${box(x, TILE_Y, TILE_W - 8, 120, CREAM, 8)}${box(x, TILE_Y, TILE_W - 8, 22, band, 6)}${label(name, x + (TILE_W - 8) / 2, TILE_Y + 50, { size: 18, color: INK })}${label(price, x + (TILE_W - 8) / 2, TILE_Y + 108, { size: 15, color: '#6B5A3A', weight: 700 })}`;
}

const CITIES: readonly [string, string, string][] = [
  ['Medan', '#22B35E', 'Rp 200 rb'],
  ['Padang', '#22B35E', 'Rp 220 rb'],
  ['Bandung', '#F2453D', 'Rp 300 rb'],
  ['Solo', '#F2453D', 'Rp 320 rb'],
  ['Makassar', GOLD, 'Rp 400 rb'],
];

function row(): string {
  return `${box(ROW_X - 14, TILE_Y - 14, CITIES.length * TILE_W + 20, 148, SEA, 12)}${CITIES.map(([n, b, p], i) => tile(ROW_X + i * TILE_W, n, b, p)).join('')}`;
}

/** Centre of tile `i` (where a token or building stands). */
const tx = (i: number) => ROW_X + i * TILE_W + (TILE_W - 8) / 2;

function die(x: number, y: number, pips: readonly [number, number][]): string {
  return `${box(x - 30, y - 30, 60, 60, '#FFFFFF', 12)}${pips.map(([a, b]) => circle(x + a, y + b, 6, INK)).join('')}`;
}

/** Buildings by level: 1 Rumah, 2 Toko, 3 Gedung, 4 Hotel. Base sits on (x, y). */
function building(x: number, y: number, level: number, color: string): string {
  if (level === 1) {
    return `${box(x - 18, y - 26, 36, 26, color, 3)}<polygon points="${x - 24},${y - 24} ${x},${y - 46} ${x + 24},${y - 24}" fill="${INK}"/>`;
  }
  if (level === 2) {
    return `${box(x - 26, y - 40, 52, 40, color, 3)}${box(x - 30, y - 48, 60, 12, CREAM, 3)}${box(x - 10, y - 22, 20, 22, INK, 2)}`;
  }
  const h = level === 3 ? 80 : 110;
  let windows = '';
  for (let wy = y - h + 12; wy < y - 16; wy += 20)
    windows += `${box(x - 14, wy, 10, 10, CREAM, 2)}${box(x + 4, wy, 10, 10, CREAM, 2)}`;
  const sign =
    level === 4
      ? `${circle(x, y - h - 14, 14, GOLD)}${label('H', x, y - h - 7, { size: 20, color: INK })}`
      : '';
  return `${box(x - 26, y - h, 52, h, color, 4)}${windows}${sign}`;
}

export const TUTORIAL: Tutorial = {
  origin:
    'Terinspirasi dari permainan papan Monopoli. Bedanya: kota-kota Nusantara, kota lawan bisa direbut, dan cukup main dari HP.',
  steps: [
    {
      text: 'Saat giliranmu, ketuk LEMPAR DADU di HP. Bidakmu maju.',
      scene: () =>
        scene(
          BG,
          `${row()}${pulse(
            die(250, 100, [
              [-12, -12],
              [0, 0],
              [12, 12],
            ]),
            250,
            100,
            0.9,
          )}${pulse(die(340, 100, [[0, 0]]), 340, 100, 0.9, 0.2)}${tap(295, 100)}${arrow(tx(0), TILE_Y - 24, tx(4), TILE_Y - 24, { bend: 30 })}${slide(fruit('semangka', tx(0), TILE_Y + 84, 52), TILE_W * 4, 0, 2.6)}`,
        ),
      phone: { kind: 'tap', label: 'LEMPAR DADU' },
    },
    {
      text: 'Singgah di kota kosong? Beli, rumah warnamu langsung berdiri.',
      scene: () =>
        scene(
          BG,
          `${row()}${fruit('semangka', tx(2), TILE_Y + 84, 52)}${appear(building(tx(2), TILE_Y - 4, 1, MINE), 0.5, 3)}${label('BELI', tx(2), 100, { size: 34, color: '#FFC928' })}${label('Rp 300 rb', tx(2), 140, { size: 22, color: CREAM })}`,
        ),
      phone: { kind: 'choice', options: ['BELI', 'LEWATI'], pick: 0 },
    },
    {
      text: 'Singgah lagi di kotamu untuk naik jadi Toko, Gedung, lalu Hotel.',
      scene: () =>
        scene(
          BG,
          `${box(40, 250, 560, 14, SEA, 6)}${building(110, 250, 1, MINE)}${appear(building(250, 250, 2, MINE), 0.3, 3.2)}${appear(building(390, 250, 3, MINE), 1, 3.2)}${appear(building(530, 250, 4, MINE), 1.7, 3.2)}${label('Rumah', 110, 300, { size: 20 })}${label('Toko', 250, 300, { size: 20 })}${label('Gedung', 390, 300, { size: 20 })}${label('Hotel', 530, 300, { size: 20 })}${label('Sewa naik terus!', 320, 70, { size: 30, color: '#FFC928' })}`,
        ),
      phone: { kind: 'choice', options: ['UPGRADE KE TOKO · Rp 120 rb', 'LEWATI'], pick: 0 },
    },
    {
      text: 'Rebut kota lawan. Yang terkaya di putaran terakhir jadi juragan!',
      scene: () =>
        scene(
          BG,
          `${row()}${building(tx(4), TILE_Y - 4, 2, RIVAL)}${appear(building(tx(4), TILE_Y - 4, 2, MINE), 0.8, 3)}${hop(fruit('semangka', tx(4), TILE_Y + 84, 52), 24, 1)}${fruit('nanas', tx(1), TILE_Y + 84, 52, 'sad')}${label('REBUT!', tx(4) - 40, 80, { size: 34, color: '#FFC928' })}`,
        ),
      phone: { kind: 'choice', options: ['REBUT · Rp 800 rb', 'TIDAK'], pick: 0 },
    },
  ],
};
