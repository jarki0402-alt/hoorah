/** "Cara main" for Juara Eja (shared/tutorial). Imports only shared art helpers. */
import { appear, box, circle, fruit, hop, label, mark, pulse, scene } from '../../shared/tutorial/draw';
import type { Tutorial } from '../../shared/tutorial/types';

const PAPER = '#FBF6EC';
const INK = '#1C1A17';
const RULE = '#EADFCB';
const ORANGE = '#FF5A1F';
const GREEN = '#2E7D4F';
const WORD = 'PELANGI';

/** Notebook paper: ruled lines and a red margin. */
function paper(): string {
  let out = '';
  for (let i = 0; i < 8; i++) out += box(0, 44 + i * 40, 640, 2, RULE, 0);
  return `${out}${box(56, 0, 3, 360, '#F2A08A', 0)}`;
}

/** One letter tile centred at (x, y); empty when `ch` is blank. */
function tile(x: number, y: number, ch: string, s = 60, dark = false): string {
  return `<rect x="${x - s / 2}" y="${y - s / 2}" width="${s}" height="${s}" rx="10" fill="${dark ? INK : '#FFFFFF'}" stroke="${INK}" stroke-width="4"/>${ch ? label(ch, x, y + s * 0.22, { size: Math.round(s * 0.6), color: dark ? PAPER : INK }) : ''}`;
}

/** A row of tiles spelling `word`, centred on cx; `open` letters are shown. */
function tiles(word: string, cx: number, y: number, s = 60, open = word.length): string {
  const gap = s + 10;
  const x0 = cx - ((word.length - 1) * gap) / 2;
  return [...word].map((ch, i) => tile(x0 + i * gap, y, i < open ? ch : '', s)).join('');
}

/** A speaker with sound waves. */
function speaker(x: number, y: number): string {
  const waves = [24, 42, 60]
    .map((r, i) =>
      appear(
        `<path d="M${x + 20 + r * 0.5} ${y - r * 0.8} Q${x + 20 + r} ${y} ${x + 20 + r * 0.5} ${y + r * 0.8}" fill="none" stroke="${ORANGE}" stroke-width="6" stroke-linecap="round"/>`,
        i * 0.3,
        1.8,
      ),
    )
    .join('');
  return `${box(x - 30, y - 16, 22, 32, INK, 4)}<polygon points="${x - 10},${y - 16} ${x + 18},${y - 36} ${x + 18},${y + 36} ${x - 10},${y + 16}" fill="${INK}"/>${waves}`;
}

function hearts(x: number, y: number, left: number): string {
  return [0, 1, 2].map((i) => circle(x + i * 26, y, 9, i < left ? ORANGE : RULE)).join('');
}

export const TUTORIAL: Tutorial = {
  origin:
    'Terinspirasi dari lomba mengeja (spelling bee). Bedanya: semua mengeja serentak di HP dan huruf dibuka bersama di layar.',
  steps: [
    {
      text: 'Layar membacakan kata dan menampilkan artinya. Dengarkan baik-baik.',
      scene: () =>
        scene(
          PAPER,
          `${paper()}${speaker(170, 130)}${box(100, 220, 480, 90, '#FFFFFF', 14, `stroke="${INK}" stroke-width="4"`)}${label('ARTI', 128, 252, { size: 18, color: ORANGE, anchor: 'start' })}${label('Lengkung warna di langit setelah hujan', 128, 288, { size: 22, color: INK, anchor: 'start' })}${tiles(WORD, 420, 130, 34, 0)}`,
        ),
      phone: { kind: 'look', text: 'Dengarkan katanya' },
    },
    {
      text: 'Ketik ejaannya di HP, lalu tekan Kirim. Kotak menunjukkan panjang kata.',
      scene: () =>
        scene(
          PAPER,
          `${paper()}${tiles(WORD, 320, 170, 60, 0)}${[...WORD]
            .map((ch, i) => appear(tile(320 + (i - 3) * 70, 170, ch, 60), i * 0.3, 4))
            .join('')}${fruit('jeruk', 320, 290, 70, 'effort')}`,
        ),
      phone: { kind: 'type', text: WORD },
    },
    {
      text: 'Huruf dibuka bersama. Benar dapat 2 poin, salah eja mengurangi nyawa.',
      scene: () =>
        scene(
          PAPER,
          `${paper()}${fruit('jeruk', 100, 110, 60)}${tiles(WORD, 340, 110, 44)}${mark(true, 590, 110, 20)}${appear(label('+2', 590, 70, { size: 30, color: GREEN }), 0.4, 2.4)}${fruit('alpukat', 100, 240, 60, 'sad')}${tiles('PELANGY', 340, 240, 44)}${mark(false, 590, 240, 20)}${pulse(hearts(306, 296, 2), 332, 296, 1)}`,
        ),
      phone: { kind: 'look', text: 'Benar!' },
    },
    {
      text: 'Kata makin sulit dan Kata Sulit berpoin ganda. Poin terbanyak menang!',
      scene: () =>
        scene(
          PAPER,
          `${paper()}${tile(170, 280, 'A', 70)}${tile(250, 240, 'B', 70)}${tile(330, 200, 'C', 70, true)}${label('x2', 330, 140, { size: 30, color: ORANGE })}${hop(fruit('stroberi', 460, 230, 80), 40, 1)}${label('Juara Eja!', 460, 110, { size: 34, color: INK })}`,
        ),
      phone: { kind: 'look', text: 'Juara Eja!' },
    },
  ],
};
