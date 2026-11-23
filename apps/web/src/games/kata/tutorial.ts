/** "Cara main" for Sambung Kata (shared/tutorial). Imports only shared art helpers. */
import {
  appear,
  arrow,
  box,
  bubble,
  fruit,
  hop,
  label,
  mark,
  pulse,
  scene,
  shake,
} from '../../shared/tutorial/draw';
import type { Tutorial } from '../../shared/tutorial/types';

const PAPER = '#FBF5E9';
const INK = '#1D2430';
const MARKER = '#FFD23F';
const ORANGE = '#FF6B2C';
const RED = '#E0453B';
const SPENT = '#E9E0CE';

/** Faint notebook lines and the red margin, like the key art. */
function paper(): string {
  let rules = '';
  for (let y = 60; y < 360; y += 36) rules += `M0 ${y}H640`;
  return `<path d="${rules}" stroke="#D5E3EE" stroke-width="1.5"/><path d="M14 0V360M19 0V360" stroke="#F0A39B" stroke-width="1.5"/>`;
}

/** One syllable card; `hl` paints it with the yellow marker. */
function syl(text: string, x: number, y: number, hl = false): string {
  return `${box(x, y, 76, 64, hl ? MARKER : '#FFFFFF', 10, `stroke="${INK}" stroke-width="3"`)}${label(text, x + 38, y + 44, { size: 32, color: INK })}`;
}

/** A word as syllable cards from `x`; `hlFirst`/`hlLast` mark the joining syllables. */
function word(parts: readonly string[], x: number, y: number, hlFirst = false, hlLast = false): string {
  return parts
    .map((p, i) => syl(p, x + i * 82, y, (i === 0 && hlFirst) || (i === parts.length - 1 && hlLast)))
    .join('');
}

function heart(x: number, y: number, color: string): string {
  return `<path transform="translate(${x} ${y}) scale(1.6)" d="M0 8 C-14 -2 -10 -16 0 -8 C10 -16 14 -2 0 8Z" fill="${color}" stroke="${INK}" stroke-width="1.5"/>`;
}

function hearts(x: number, y: number, left: number): string {
  let out = '';
  for (let i = 0; i < 3; i++) out += heart(x + i * 40, y, i < left ? RED : SPENT);
  return out;
}

/** A round countdown clock. */
function clock(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="34" fill="#FFFFFF" stroke="${INK}" stroke-width="4"/><path d="M${x} ${y} L${x} ${y - 24}" stroke="${ORANGE}" stroke-width="5" stroke-linecap="round"/>${label('5', x, y + 30, { size: 18, color: INK })}`;
}

export const TUTORIAL: Tutorial = {
  origin:
    'Terinspirasi dari permainan sambung kata yang sering dimainkan bersama teman. Bedanya: kata diketik di HP dan diperiksa kamus.',
  steps: [
    {
      text: 'Kata berikutnya diawali suku kata terakhir: BUKU lalu KUDA.',
      scene: () =>
        scene(
          PAPER,
          `${paper()}${word(['BU', 'KU'], 70, 140, false, true)}${arrow(190, 220, 400, 220, { bend: -40, color: ORANGE })}${appear(word(['KU', 'DA'], 404, 140, true), 0.6, 3)}${label('KU', 280, 120, { size: 30, color: ORANGE })}`,
        ),
      phone: { kind: 'look', text: 'Lihat suku katanya' },
    },
    {
      text: 'Saat giliranmu, ketik kata di HP lalu kirim sebelum waktu habis.',
      scene: () =>
        scene(
          PAPER,
          `${paper()}${label('KATA DIAWALI', 180, 90, { size: 24, color: INK })}${syl('KU', 142, 108, true)}${pulse(clock(470, 110), 470, 110, 1)}${fruit('semangka', 200, 280, 90, 'effort')}${appear(bubble('KUDA', 330, 260, { w: 140, fill: MARKER }), 0.5, 2.6)}`,
        ),
      phone: { kind: 'type', text: 'kuda' },
    },
    {
      text: 'Kata salah, sudah dipakai, atau waktu habis: nyawa berkurang.',
      scene: () =>
        scene(
          PAPER,
          `${paper()}${fruit('nanas', 180, 260, 96, 'sad')}${bubble('BUKU', 180, 200, { w: 130 })}${mark(false, 270, 140, 24)}${label('Sudah dipakai', 180, 90, { size: 26, color: RED })}${hearts(400, 240, 2)}${appear(shake(heart(480, 240, RED), 480, 240), 0, 2.4)}${appear(label('-1 NYAWA', 440, 300, { size: 26, color: RED }), 0.6, 2.4)}`,
        ),
      phone: { kind: 'look', text: 'Sudah dipakai' },
    },
    {
      text: 'Pemain terakhir yang masih punya nyawa jadi juara!',
      scene: () =>
        scene(
          PAPER,
          `${paper()}${fruit('jeruk', 140, 260, 70, 'sad')}${hearts(100, 320, 0)}${hop(fruit('semangka', 320, 240, 110), 30, 1)}${hearts(280, 330, 1)}${fruit('mangga', 500, 260, 70, 'sad')}${hearts(460, 320, 0)}${label('Juara!', 320, 90, { size: 40, color: ORANGE })}`,
        ),
      phone: { kind: 'look', text: 'Kamu juara!' },
    },
  ],
};
