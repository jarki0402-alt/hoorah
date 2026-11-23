/** "Cara main" for Congklak (shared/tutorial). Imports only shared art helpers. */
import { boardMarkup, pitXY } from '../../shared/art/congklak';
import { appear, arrow, box, fruit, hop, label, pulse, scene, slide, tap } from '../../shared/tutorial/draw';
import type { Tutorial } from '../../shared/tutorial/types';

const BG = '#D7B377';
const GOLD = '#FFC928';
const SEED = '#F6E7C8';
const S = 0.5;
const OX = 25;
const OY = 96;
/** Seeds per pit for the scenes (0–6 top row, 7 right store, 8–14 bottom row, 15 left store). */
const PITS = [4, 2, 5, 3, 1, 4, 2, 6, 3, 2, 5, 1, 3, 0, 2, 5] as const;
const OFFSETS: readonly [number, number][] = [
  [0, 0],
  [-8, -6],
  [8, -5],
  [-7, 7],
  [7, 7],
  [0, -12],
  [0, 12],
  [-13, 1],
  [13, 1],
];

/** Pit centre in scene coordinates. */
function at(pos: number): { x: number; y: number } {
  const p = pitXY(pos);
  return { x: OX + p.x * S, y: OY + p.y * S };
}

function seed(x: number, y: number): string {
  return `<ellipse cx="${x}" cy="${y}" rx="5.5" ry="4.2" fill="${SEED}" stroke="#8C6A3C" stroke-width="1"/>`;
}

function pile(pos: number, n: number): string {
  const { x, y } = at(pos);
  return OFFSETS.slice(0, Math.min(n, OFFSETS.length))
    .map(([dx, dy]) => seed(x + dx, y + dy))
    .join('');
}

/** The board with seeds; `skip` leaves pits empty (they get animated seeds instead). */
function board(skip: readonly number[] = []): string {
  const seeds = PITS.map((n, pos) => (skip.includes(pos) ? '' : pile(pos, n))).join('');
  return `<g transform="translate(${OX} ${OY}) scale(${S})">${boardMarkup(false)}</g>${seeds}`;
}

function players(): string {
  return `${fruit('nanas', 320, 50, 56)}${label('Lawan', 370, 58, { size: 20, color: '#5A3016', anchor: 'start' })}${fruit('semangka', 320, 326, 56)}${label('Kamu', 370, 334, { size: 20, color: '#5A3016', anchor: 'start' })}`;
}

export const TUTORIAL: Tutorial = {
  origin:
    'Terinspirasi dari congklak, permainan papan tradisional. Bedanya: bisa main beregu sampai 8 orang, biji disebar otomatis di layar.',
  steps: [
    {
      text: 'Saat giliranmu, pilih satu lubang di sisimu dari HP.',
      scene: () => {
        const p = at(10);
        return scene(
          BG,
          `${board()}${box(at(14).x - 34, p.y - 34, at(8).x - at(14).x + 68, 68, 'none', 34, `stroke="${GOLD}" stroke-width="5"`)}${tap(p.x, p.y, '#FFFFFF')}${players()}`,
        );
      },
      phone: { kind: 'choice', options: ['3 biji', '2 biji', '5 biji', '1 biji'], pick: 2 },
    },
    {
      text: 'Biji disebar satu per satu ke lubang berikutnya, searah jarum jam.',
      scene: () => {
        const a = at(10);
        const b = at(13);
        return scene(
          BG,
          `${board([10])}${appear(pile(11, 2), 0.4, 3)}${appear(pile(12, 4), 0.9, 3)}${appear(pile(13, 1), 1.4, 3)}${arrow(a.x, a.y + 40, b.x, b.y + 40, { bend: -24 })}${hop(seed(a.x, a.y - 30), 16, 0.5)}${players()}`,
        );
      },
      phone: { kind: 'look', text: 'Bijimu sedang disebar' },
    },
    {
      text: 'Biji terakhir masuk lumbungmu? Kamu jalan lagi!',
      scene: () => {
        const a = at(14);
        const s = at(15);
        return scene(
          BG,
          `${board()}${slide(seed(a.x, a.y), s.x - a.x, 0, 1.6)}${appear(label('Jalan lagi!', 140, 80, { size: 30, color: '#5A3016' }), 1, 1.6)}${pulse(pile(15, 9), s.x, s.y, 1.6)}${players()}`,
        );
      },
      phone: { kind: 'look', text: 'Jalan lagi! Pilih lubang' },
    },
    {
      text: 'Isi lumbungmu sebanyak mungkin. Biji terbanyak menang!',
      scene: () => {
        const s = at(15);
        return scene(
          BG,
          `${board()}${pulse(`${box(s.x - 26, s.y - 92, 52, 30, GOLD, 10)}${label('42', s.x, s.y - 69, { size: 22, color: '#111214' })}`, s.x, s.y - 77, 1)}${fruit('nanas', 320, 50, 56, 'sad')}${hop(fruit('semangka', 320, 326, 56), 20, 1)}${label('Menang!', 400, 334, { size: 26, color: '#5A3016', anchor: 'start' })}`,
        );
      },
      phone: { kind: 'look', text: 'Juara!' },
    },
  ],
};
