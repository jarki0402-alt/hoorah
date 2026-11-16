/**
 * "Naik Turun" (up and down): Ular Tangga, a board game on a woven mat in the village.
 * Bouncy and cheeky, 109 bpm in G: a pianika tune that climbs like a ladder in A, slides down
 * chromatically like a snake in B, and a xylophone "dice" break in C. Pizzicato bass hops on
 * the beat, conga and woodblock keep the counting, shaker on the off-beats.
 * Form: intro(2) → A(8) → B(8) → dadu(4) → A2(8), looping to A (28 bars ≈ 62 s).
 */

import { CONGA, KICK, PIANIKA, PIZZ, SHAKER, WOODBLOCK, XYLO } from '../presets';
import type { Song } from '../synth';

const PIZZ_A = { loop: '1...5...8...5...', fill: '1...5...1.5.a...', every: 4 };
const CONGA_A = 'x..s..l.x..s.ll.';
const BLOCKS_A = '..x...x...x..xl.';
const SHAKE = 'x.o.x.o.x.o.x.o.';

const TUNE_A = `g4 . a4 . b4 . d5 . g5 - - . d5 . b4 . | e5 - . . g5 . e5 . b4 - - - . . . . |
  c5 . e5 . g5 . c6 . b5 . a5 . g5 - e5 . | d5 - - - f#5 . e5 . d5 - . . . . . . |
  g4 . a4 . b4 . d5 . g5 . a5 . b5 - - . | g5 - - . e5 . . . b4 - . . e5 . f#5 . |
  a5 . g5 . e5 . c5 . d5 . f#5 . a5 - - . | g5 - - - . . . . . . . . . . . .`;

export const ular: Song = {
  id: 'ular',
  title: 'Naik Turun',
  bpm: 109,
  swing: 0.12,
  gain: 0.9,
  inst: {
    pianika: { ...PIANIKA, level: 0.2, pan: -0.12, rev: 0.16, range: [60, 86] },
    xyl: { ...XYLO, level: 0.24, pan: 0.3, rev: 0.22, range: [67, 98] },
    pizz: { ...PIZZ, level: 0.34, range: [36, 60] },
    conga: { ...CONGA, level: 0.3, pan: -0.28, rev: 0.08 },
    wood: { ...WOODBLOCK, level: 0.24, pan: 0.36, rev: 0.1 },
    shk: { ...SHAKER, level: 0.22, pan: 0.2 },
    kick: { ...KICK, level: 0.26 },
  },
  sections: {
    intro: {
      bars: 2,
      chords: 'G | D7',
      parts: {
        wood: 'x...l...x...l...|x.l.x.l.x.l.xlxl',
        xyl: `. . . . . . . . . . . . . . . . | d5 . e5 . f#5 . g5 . a5 . b5 . c6 . d6 .`,
        pizz: '1.......1.......|1.......5...a...',
      },
    },
    A: {
      bars: 8,
      chords: 'G | Em | C | D | G | Em | Am D | G',
      parts: {
        pianika: TUNE_A,
        xyl: `. . . . . . . . . . . . . . . . | . . . . . . . . . . . . b5 . d6 . |
              . . . . . . . . . . . . . . . . | . . . . . . . . . . a5 . b5 . c6 . |
              . . . . . . . . . . . . . . . . | . . . . . . . . . . . . g6 . e6 . |
              . . . . . . . . . . . . . . . . | . . . . b5 . d6 . g6 . d6 . b5 . . .`,
        pizz: PIZZ_A,
        conga: CONGA_A,
        wood: BLOCKS_A,
        shk: SHAKE,
        kick: 'x.......x.......',
      },
    },
    B: {
      bars: 8,
      chords: 'C | C | G | G | Am | D7 | G | D7',
      parts: {
        pianika: `e5 - - . g5 . e5 . c5 - - . . . . . | e5 . eb5 . d5 . db5 . c5 - - - . . . . |
                  d5 - - . g5 . d5 . b4 - - . . . . . | d5 . c#5 . c5 . b4 . a4 . g4 - - - . . |
                  a4 . c5 . e5 . a5 - - . g5 . e5 . . . | f#5 - - . a5 . f#5 . d5 - - . c5 . . . |
                  b4 . d5 . g5 - - . b5 . a5 . g5 . . . | a5 - - - f#5 - - - d5 - - - . . . .`,
        xyl: { loop: `. . . . . . . . g6 . . . e6 . . . | . . . . . . . . d6 . . . b5 . . .` },
        pizz: '1.....5.1.....5.',
        conga: 'x...s..lx.s.s.l.',
        wood: '..x...x...x...x.',
        shk: SHAKE,
        kick: 'x.....x.x.......',
      },
    },
    dadu: {
      bars: 4,
      chords: 'G | C | G | D',
      parts: {
        xyl: `g5 . b5 . d6 . b5 . g5 . b5 . d6 . g6 . | e6 . c6 . g5 . c6 . e6 . g6 . e6 . c6 . |
              d6 . b5 . g5 . b5 . d6 . g6 . b6 . g6 . | a6 - - - f#6 - - - d6 - - - . . . .`,
        pianika: `. . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . . |
                  . . . . . . . . . . . . . . . . | . . . . . . . . . . . . d5 . f#5 .`,
        pizz: '1.1.5.5.8.8.5.5.',
        conga: 'xxs.xxs.lls.xsls',
        wood: 'x.x.x.x.x.x.x.x.',
        kick: 'x...x...x...x...',
      },
    },
    A2: {
      bars: 8,
      chords: 'G | Em | C | D | G | Em | Am D | G',
      parts: {
        pianika: TUNE_A,
        xyl: { loop: `. . . . . . . . . . . . d6 . . . | . . . . . . . . . . . . b5 . . .` },
        pizz: PIZZ_A,
        conga: CONGA_A,
        wood: BLOCKS_A,
        shk: SHAKE,
        kick: 'x.......x.......',
      },
    },
  },
  form: ['intro', 'A', 'B', 'dadu', 'A2'],
  loopFrom: 1,
};
