/** "Cara main" for Kampung Siluman (shared/tutorial). Imports only shared art helpers. */
import {
  appear,
  arrow,
  box,
  bubble,
  circle,
  fruit,
  label,
  mark,
  pulse,
  scene,
  shake,
} from '../../shared/tutorial/draw';
import type { Tutorial } from '../../shared/tutorial/types';

const NIGHT = '#0B1530';
const DEEP = '#02060F';
const MOON = '#FFE7A3';
const LAMP = '#FF8A1F';
const CREAM = '#FBF1DC';
const DAY = '#8FC6E8';
const GROUND = 300;

const CAST = ['jeruk', 'nanas', 'mangga', 'durian'] as const;
const xs = (i: number) => 128 + i * 128;

/** A row of kampung houses on the horizon; windows glow at night. */
function kampung(night: boolean): string {
  const roof = night ? '#1A2440' : '#B5562B';
  const wall = night ? '#131C36' : '#E8CFA0';
  let out = '';
  for (let i = 0; i < 5; i++) {
    const x = 20 + i * 130;
    out += `${box(x, 150, 90, 70, wall, 4)}<polygon points="${x - 10},150 ${x + 45},110 ${x + 100},150" fill="${roof}"/>${box(x + 34, 172, 22, 22, night ? LAMP : '#7A5230', 3, night ? 'opacity="0.8"' : '')}`;
  }
  return `${out}${box(0, 220, 640, 140, night ? DEEP : '#7CC45E', 0)}`;
}

/** A face-down role card that flips to show `role`. */
function roleCard(x: number, y: number, role: string, fill: string, color = '#111214'): string {
  return `${box(x - 56, y - 76, 112, 152, fill, 14)}${label(role, x, y + 8, { size: 24, color })}`;
}

/** The "Zz" of someone with eyes closed. */
function zz(x: number, y: number, delay = 0): string {
  return appear(label('Zz', x, y, { size: 22, color: MOON }), delay, 2.4);
}

export const TUTORIAL: Tutorial = {
  origin:
    'Terinspirasi dari Werewolf dan Mafia. Bedanya: tanpa moderator, layar yang memandu malam dengan bunyi tiap peran.',
  steps: [
    {
      text: 'Tahan kartu di HP untuk melihat peranmu: Warga, Siluman, Dukun, Tabib.',
      scene: () =>
        scene(
          NIGHT,
          `${circle(560, 60, 30, MOON)}${roleCard(110, 180, 'Warga', CREAM)}${roleCard(250, 180, 'Siluman', LAMP)}${roleCard(390, 180, 'Dukun', CREAM)}${roleCard(530, 180, 'Tabib', CREAM)}${pulse(box(194, 100, 112, 152, 'none', 14, `stroke="${MOON}" stroke-width="5"`), 250, 176, 1.2)}${label('Rahasiakan!', 320, 320, { size: 28, color: MOON })}`,
        ),
      phone: { kind: 'tap', label: 'Tahan kartu', hold: true },
    },
    {
      text: 'Malam: semua tutup mata. Buka mata hanya saat bunyi peranmu.',
      scene: () =>
        scene(
          NIGHT,
          `${circle(560, 60, 30, MOON)}${kampung(true)}<g opacity="0.5">${CAST.map((f, i) => fruit(f, xs(i), GROUND - 20, 60)).join('')}</g>${CAST.map((_, i) => zz(xs(i) + 26, GROUND - 60, i * 0.3)).join('')}${appear(`${box(170, 40, 300, 50, '#1A2440', 14)}${label('Geraman = Siluman', 320, 74, { size: 24, color: LAMP })}`, 0.2, 3)}`,
        ),
      phone: { kind: 'look', text: 'Tutup mata' },
    },
    {
      text: 'Siluman memilih, Dukun melihat peran, Tabib melindungi. Pilih di HP.',
      scene: () =>
        scene(
          NIGHT,
          `${kampung(true)}${appear(`${label('Geraman', 120, 60, { size: 24, color: LAMP })}${label('Siluman memilih', 120, 92, { size: 18, color: CREAM })}`, 0, 3.6)}${appear(`${label('Lonceng', 320, 60, { size: 24, color: MOON })}${label('Dukun melihat', 320, 92, { size: 18, color: CREAM })}`, 1.1, 3.6)}${appear(`${label('Seruling', 520, 60, { size: 24, color: '#7FD6B0' })}${label('Tabib melindungi', 520, 92, { size: 18, color: CREAM })}`, 2.2, 3.6)}${fruit('nanas', 320, GROUND - 20, 70)}${appear(circle(320, GROUND - 20, 48, 'none', 'stroke="#7FD6B0" stroke-width="6"'), 2.4, 3.6)}`,
        ),
      phone: { kind: 'choice', options: ['Jeruk', 'Nanas', 'Mangga', 'Durian'], pick: 1 },
    },
    {
      text: 'Siang: diskusi, lalu voting rahasia. Usir semua siluman untuk menang!',
      scene: () =>
        scene(
          DAY,
          `${circle(560, 60, 30, '#FFE27A')}${kampung(false)}${CAST.map((f, i) => fruit(f, xs(i), GROUND - 20, 60, i === 3 ? 'wow' : 'happy')).join('')}${appear(bubble('Kamu!', xs(0), GROUND - 60), 0, 3)}${appear(bubble('Bukan aku', xs(3), GROUND - 60), 0.8, 3)}${arrow(xs(1), GROUND - 60, xs(3) - 30, GROUND - 60, { bend: 50 })}${shake(mark(true, xs(3) + 34, GROUND - 52, 16), xs(3) + 34, GROUND - 52)}`,
        ),
      phone: { kind: 'choice', options: ['Jeruk', 'Nanas', 'Mangga', 'Durian'], pick: 3 },
    },
  ],
};
