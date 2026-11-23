/** "Cara main" for Ludo (shared/tutorial). Imports only shared art helpers. */
import {
  appear,
  arrow,
  box,
  circle,
  fruit,
  label,
  mark,
  pulse,
  scene,
  shake,
  slide,
  tap,
} from '../../shared/tutorial/draw';
import type { Tutorial } from '../../shared/tutorial/types';

type Fruit = Parameters<typeof fruit>[0];

const BG = '#1E1F24';
const BOARD = '#FFF6E3';
const LINE = '#D9C9A8';
/** Pawn colours, the same as the game (red, green, yellow, blue). */
const RED = { main: '#E8473A', dark: '#9E2A20', light: '#F7B8B0' };
const GREEN = { main: '#22A85A', dark: '#136B39', light: '#A9E2BF' };
const YELLOW = { main: '#F7BE16', dark: '#A87A00', light: '#FCE39A' };
const BLUE = { main: '#2E7CE6', dark: '#184D99', light: '#AACBF5' };

/** 15x15 grid, cell C px, board at (X0, Y0). */
const C = 22;
const X0 = 40;
const Y0 = 15;
const px = (col: number) => X0 + col * C + C / 2;
const py = (row: number) => Y0 + row * C + C / 2;

function cell(col: number, row: number, fill: string): string {
  return box(X0 + col * C + 1, Y0 + row * C + 1, C - 2, C - 2, fill, 3);
}

/** A 6x6 corner yard with four pawn spots. */
function yard(col: number, row: number, sw: { main: string; light: string }): string {
  const x = X0 + col * C;
  const y = Y0 + row * C;
  return `${box(x + 2, y + 2, C * 6 - 4, C * 6 - 4, sw.main, 12)}${box(x + C, y + C, C * 4, C * 4, BOARD, 10)}`;
}

/** The whole board: four yards, the cross-shaped track, home columns and the centre. */
function board(): string {
  let out = box(X0 - 6, Y0 - 6, C * 15 + 12, C * 15 + 12, LINE, 14);
  out += box(X0, Y0, C * 15, C * 15, BOARD, 10);
  out += yard(0, 0, RED) + yard(9, 0, GREEN) + yard(9, 9, YELLOW) + yard(0, 9, BLUE);
  for (let i = 0; i < 6; i++) {
    for (const r of [6, 7, 8]) {
      out += cell(i, r, '#FFFFFF') + cell(9 + i, r, '#FFFFFF');
      out += cell(r, i, '#FFFFFF') + cell(r, 9 + i, '#FFFFFF');
    }
  }
  for (let i = 1; i < 6; i++) {
    out +=
      cell(i, 7, RED.light) +
      cell(7, i, GREEN.light) +
      cell(14 - i, 7, YELLOW.light) +
      cell(7, 14 - i, BLUE.light);
  }
  out += cell(1, 6, RED.main) + cell(8, 1, GREEN.main) + cell(13, 8, YELLOW.main) + cell(6, 13, BLUE.main);
  const l = X0 + 6 * C;
  const t = Y0 + 6 * C;
  const r = l + 3 * C;
  const b = t + 3 * C;
  const mx = l + 1.5 * C;
  const my = t + 1.5 * C;
  out += `<polygon points="${l},${t} ${mx},${my} ${l},${b}" fill="${RED.main}"/>`;
  out += `<polygon points="${l},${t} ${mx},${my} ${r},${t}" fill="${GREEN.main}"/>`;
  out += `<polygon points="${r},${t} ${mx},${my} ${r},${b}" fill="${YELLOW.main}"/>`;
  out += `<polygon points="${l},${b} ${mx},${my} ${r},${b}" fill="${BLUE.main}"/>`;
  return out;
}

/** A pawn: a coloured disc with the player's fruit on it, centred on (x, y). */
function pawn(f: Fruit, x: number, y: number, sw: { main: string; dark: string }): string {
  return `${circle(x, y + 2, 15, sw.dark)}${circle(x, y, 15, sw.main)}${fruit(f, x, y, 22)}`;
}

function die(x: number, y: number, pips: number): string {
  const spots: Record<number, [number, number][]> = {
    3: [
      [-14, -14],
      [0, 0],
      [14, 14],
    ],
    6: [
      [-14, -16],
      [14, -16],
      [-14, 0],
      [14, 0],
      [-14, 16],
      [14, 16],
    ],
  };
  return `${box(x - 36, y - 36, 72, 72, '#FFFFFF', 14)}${(spots[pips] ?? []).map(([a, b]) => circle(x + a, y + b, 7, '#111214')).join('')}`;
}

/** Red yard pawn spot, in yard units (0 or 1 on each axis). */
const yardX = (i: number) => X0 + C * (2 + i * 2);
const yardY = (i: number) => Y0 + C * (2 + i * 2);
const SIDE = 530;

export const TUTORIAL: Tutorial = {
  origin:
    'Terinspirasi dari Ludo. Bedanya: dadu dan bidak dipilih di HP, dan 5–8 pemain main di papan segi 5 sampai segi 8.',
  steps: [
    {
      text: 'Ketuk LEMPAR untuk melempar dadu. Dapat 6? Bidak keluar kandang.',
      scene: () =>
        scene(
          BG,
          `${board()}${pulse(die(SIDE, 120, 6), SIDE, 120, 0.9)}${tap(SIDE, 120)}${pawn('semangka', yardX(1), yardY(1), RED)}${pawn('semangka', yardX(0), yardY(1), RED)}${pawn('semangka', yardX(1), yardY(0), RED)}${slide(pawn('semangka', yardX(0), yardY(0), RED), px(1) - yardX(0), py(6) - yardY(0), 2.4)}${label('Dapat 6!', SIDE, 200, { size: 26, color: '#FFC928' })}`,
        ),
      phone: { kind: 'tap', label: 'LEMPAR' },
    },
    {
      text: 'Pilih bidak yang mau dijalankan langsung di HP.',
      scene: () =>
        scene(
          BG,
          `${board()}${die(SIDE, 120, 3)}${arrow(px(1), py(6) - 22, px(4), py(6) - 22, { bend: 14 })}${slide(pawn('semangka', px(1), py(6), RED), 3 * C, 0, 2.4)}${pawn('semangka', yardX(1), yardY(1), RED)}${pawn('semangka', yardX(0), yardY(1), RED)}${pawn('semangka', yardX(1), yardY(0), RED)}`,
        ),
      phone: { kind: 'choice', options: ['Keluar kandang', 'Maju 3 langkah'], pick: 1 },
    },
    {
      text: 'Mendarat di bidak lawan mengirimnya pulang ke kandang!',
      scene: () =>
        scene(
          BG,
          `${board()}${die(SIDE, 120, 3)}${appear(shake(pawn('nanas', px(4), py(6), GREEN), px(4), py(6), 0.4), 0, 2.8)}${appear(pawn('nanas', X0 + C * 11, Y0 + C * 2, GREEN), 2, 2.8)}${slide(pawn('semangka', px(1), py(6), RED), 3 * C, 0, 2.8)}${mark(true, SIDE, 230, 24)}`,
        ),
      phone: { kind: 'choice', options: ['Maju 3 langkah', 'Makan Nanas!'], pick: 1 },
    },
    {
      text: 'Bawa semua bidakmu ke tengah papan. Yang duluan menang!',
      scene: () =>
        scene(
          BG,
          `${board()}${arrow(px(1), py(7) + 26, px(6), py(7) + 26, { bend: -10 })}${slide(pawn('semangka', px(1), py(7), RED), 5 * C, 0, 2.4)}${label('Menang!', SIDE, 130, { size: 34, color: '#FFC928' })}${fruit('semangka', SIDE, 210, 72)}`,
        ),
      phone: { kind: 'choice', options: ['Masuk rumah!'], pick: 0 },
    },
  ],
};
