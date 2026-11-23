/** "Cara main" for Lantai Runtuh (shared/tutorial). Imports only shared art helpers. */
import {
  appear,
  arrow,
  box,
  fruit,
  label,
  pulse,
  scene,
  shake,
  slide,
  tap,
} from '../../shared/tutorial/draw';
import type { Tutorial } from '../../shared/tutorial/types';

const BG = '#12141B';
const PANEL = '#1E2028';
const YELLOW = '#FFC928';
const COLORS = ['#F2453D', '#2F8CFF', '#22B35E', '#FFC928'] as const;
const BLUE = 1;
const COLS = 4;
const TW = 120;
const TH = 64;
const X0 = 76;
const Y0 = 170;

/** Tile colour index by grid cell (a fixed shuffle so every colour shows twice). */
const LAYOUT = [0, 1, 2, 3, 2, 3, 1, 0] as const;

const tileX = (i: number) => X0 + (i % COLS) * (TW + 6);
const tileY = (i: number) => Y0 + Math.floor(i / COLS) * (TH + 6);
const midX = (i: number) => tileX(i) + TW / 2;
const midY = (i: number) => tileY(i) + TH / 2;

function tile(i: number): string {
  return box(tileX(i), tileY(i), TW, TH, COLORS[LAYOUT[i] ?? 0], 8);
}

/** The whole stage; `drop` makes the non-blue tiles fall away. */
function stage(drop = false): string {
  let out = '';
  for (let i = 0; i < LAYOUT.length; i++) {
    const t = tile(i);
    out += drop && LAYOUT[i] !== BLUE ? slide(shake(t, midX(i), midY(i), 0.25), 0, 200, 2.4) : t;
  }
  return out;
}

/** The host's sign board with the current call. */
function sign(text: string, color = YELLOW): string {
  return `${box(200, 30, 240, 74, PANEL, 12, `stroke="${YELLOW}" stroke-width="3"`)}${label('Berdiri di', 320, 60, { size: 18, color: '#C9CCD6', weight: 700 })}${label(text, 320, 92, { size: 30, color })}`;
}

export const TUTORIAL: Tutorial = {
  origin:
    'Terinspirasi dari Fall Guys dan kuis panggung. Bedanya: tanpa soal tertulis, aturan petak berganti tiap babak dan bisa saling dorong.',
  steps: [
    {
      text: 'Tiap babak layar menyebut aturan baru: warna, simbol, atau angka.',
      scene: () =>
        scene(
          BG,
          `${pulse(sign('BIRU', COLORS[BLUE]), 320, 67, 1.2)}${stage()}${fruit('semangka', midX(2), midY(2) - 10, 56)}${fruit('nanas', midX(4), midY(4) - 10, 56)}`,
        ),
      phone: { kind: 'look', text: 'Dengarkan aturannya' },
    },
    {
      text: 'Pindah ke petak yang benar dengan joystick sebelum waktu habis.',
      scene: () =>
        scene(
          BG,
          `${sign('BIRU', COLORS[BLUE])}${stage()}${arrow(midX(2), midY(2) - 40, midX(1) + 20, midY(1) - 40, { bend: 30 })}${slide(fruit('semangka', midX(2), midY(2) - 10, 56), midX(1) - midX(2), 0, 2)}${fruit('nanas', midX(6), midY(6) - 10, 56)}`,
        ),
      phone: { kind: 'stick', dir: 'left', button: 'DORONG' },
    },
    {
      text: 'Petak yang salah runtuh! Yang jatuh ikut lagi babak berikutnya.',
      scene: () =>
        scene(
          BG,
          `${sign('BIRU', COLORS[BLUE])}${stage(true)}${fruit('semangka', midX(1), midY(1) - 10, 56)}${slide(fruit('nanas', midX(4), midY(4) - 10, 56, 'wow'), 0, 200, 2.4)}${appear(label('RUNTUH!', 560, 140, { size: 28, color: COLORS[0] }), 0.4, 2.4)}`,
        ),
      phone: { kind: 'look', text: 'Ikut lagi babak berikutnya' },
    },
    {
      text: 'DORONG lawan di dekatmu, lalu tunggu jeda 3 detik. Poin terbanyak menang.',
      scene: () =>
        scene(
          BG,
          `${sign('BIRU', COLORS[BLUE])}${stage()}${fruit('semangka', midX(5) - 30, midY(5) - 10, 56, 'effort')}${slide(fruit('nanas', midX(6) - 30, midY(6) - 10, 56, 'wow'), 90, 0, 1.6)}${tap(midX(5), midY(5) - 10, '#FFFFFF', 0.2)}${label('DORONG!', midX(5), midY(5) + 60, { size: 26, color: YELLOW })}`,
        ),
      phone: { kind: 'tap', label: 'DORONG' },
    },
  ],
};
