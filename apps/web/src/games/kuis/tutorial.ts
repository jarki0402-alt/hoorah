/** "Cara main" for Kuis Nusantara (shared/tutorial). Imports only shared art helpers. */
import { appear, box, fruit, hop, label, mark, pulse, scene, slide, tap } from '../../shared/tutorial/draw';
import type { Tutorial } from '../../shared/tutorial/types';

const BG = '#12343B';
const FLOOR = '#1C2A2E';
const CARD = '#FFF2C2';
const GOLD = '#FFC928';
const RED = '#B3261E';
const ANSWERS = ['Rendang', 'Gudeg', 'Pempek', 'Papeda'] as const;
const LETTERS = ['A', 'B', 'C', 'D'] as const;

function stage(): string {
  return `${box(0, 300, 640, 60, FLOOR, 0)}${box(70, 24, 500, 74, CARD, 16)}${label('Masakan Minang yang dimasak berjam-jam?', 320, 70, { size: 22, color: '#3A2A12' })}`;
}

/** The four answers in a 2x2 grid; `hi` highlights one (green when `ok`). */
function answers(hi = -1, ok = true): string {
  return ANSWERS.map((a, i) => {
    const x = 70 + (i % 2) * 256;
    const y = 112 + Math.floor(i / 2) * 64;
    const fill = i === hi ? (ok ? '#22B35E' : RED) : '#FFFFFF';
    const ink = i === hi ? '#FFFFFF' : '#111214';
    return `${box(x, y, 244, 52, fill, 12)}${box(x + 8, y + 8, 36, 36, GOLD, 10)}${label(LETTERS[i] ?? '', x + 26, y + 34, { size: 22, color: '#111214' })}${label(a, x + 60, y + 35, { size: 22, color: ink, anchor: 'start' })}`;
  }).join('');
}

export const TUTORIAL: Tutorial = {
  origin:
    'Terinspirasi dari acara kuis di televisi. Bedanya: semua soal tentang Nusantara dan dijawab dari HP, makin cepat makin besar poinnya.',
  steps: [
    {
      text: 'Soal dan empat pilihan jawaban muncul besar di layar.',
      scene: () =>
        scene(
          BG,
          `${stage()}${pulse(answers(), 320, 170, 2.4)}${fruit('semangka', 200, 300, 64, 'wow')}${fruit('jeruk', 320, 300, 64)}${fruit('alpukat', 440, 300, 64, 'wow')}`,
        ),
      phone: { kind: 'look', text: 'Lihat soalnya di layar!' },
    },
    {
      text: 'Pilih jawabanmu di HP secepat mungkin.',
      scene: () =>
        scene(
          BG,
          `${stage()}${answers(0)}${tap(88, 138, '#111214')}${hop(fruit('semangka', 200, 300, 64), 24, 1)}${fruit('jeruk', 320, 300, 64, 'effort')}${fruit('alpukat', 440, 300, 64, 'effort')}`,
        ),
      phone: { kind: 'choice', options: [...ANSWERS], pick: 0 },
    },
    {
      text: 'Makin cepat jawaban benar, makin besar poinnya.',
      scene: () =>
        scene(
          BG,
          `${stage()}${answers(0)}${box(70, 101, 500, 8, '#2C4A50', 4)}${slide(box(70, 101, 500, 8, GOLD, 4), -500, 0, 3)}${box(0, 96, 70, 18, BG, 0)}${fruit('semangka', 200, 300, 64)}${appear(label('+950', 200, 248, { size: 28, color: GOLD }), 0.3, 3)}${fruit('jeruk', 320, 300, 64)}${appear(label('+600', 320, 248, { size: 28, color: '#FFFFFF' }), 1.2, 3)}${fruit('alpukat', 440, 300, 64, 'sad')}`,
        ),
      phone: { kind: 'look', text: 'Terkunci!' },
    },
    {
      text: '3 benar beruntun? Poin soal berikutnya dobel!',
      scene: () =>
        scene(
          BG,
          `${box(0, 300, 640, 60, FLOOR, 0)}${appear(mark(true, 220, 110, 32), 0, 3)}${appear(mark(true, 320, 110, 32), 0.5, 3)}${appear(mark(true, 420, 110, 32), 1, 3)}${appear(pulse(`${box(240, 160, 160, 56, GOLD, 14)}${label('DOBEL', 320, 199, { size: 34, color: '#111214' })}`, 320, 188, 1), 1.5, 3)}${hop(fruit('semangka', 320, 290, 80), 30, 1)}`,
        ),
      phone: { kind: 'look', text: 'Beruntun! Poin soal berikutnya dobel!' },
    },
  ],
};
