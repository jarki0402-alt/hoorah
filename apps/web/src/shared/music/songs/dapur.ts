/**
 * "Wajan Goyang" (the dancing wok): Dapur Heboh, a busy kitchen at rush hour.
 * Sunny kitchen funk in C, 124 bpm with a little swing. A steel pan tune bounces over chopping
 * clav, a rubbery bass, congas like knives on a board and shaker like rice in a pan. The break
 * drops to congas and clav, a breath before the next wave of orders.
 * Form: intro(2) → A(8) → B(8) → A2(8) → brk(4), looping to A (28 bars ≈ 54 s).
 */

import { BASS_FUNK, CLAV, CONGA, EPIANO, HAT, KICK_PUNCH, SHAKER, SNARE, STEELPAN } from '../presets';
import type { Song } from '../synth';

const KICKS = { loop: 'x.....x...x.....|x..x......x..x..', fill: 'x.....x...x.x...', every: 8 };
const SNARES = { loop: '....x..o.o..x...|....x..o....x.o.', fill: '....x..ox.xxX.XX', every: 8 };
const HATS = 'x.xxx.xhx.xxx.xh';
const CONGAS = '..s.l.x...s.m.x.|..s.l.x.s.s.l.x.';
const SHAKE = 'x.o.x.o.x.o.x.o.';
const CLAVS = 'x.mx.mx.x.mx.m.x|.mx.mx.xm.x.mx.m';
const KEYS_A = '..x.m.x...x.m.x.';
const BASS_A = { loop: '1..1.o8.1..5.8o5', fill: '1..1.o8..18.5.a.', every: 4 };
const BASS_B = '1...1.8.5...1.5.|1...1.8.5.1.8.a.';

const TUNE_A = `e5 . g5 . c6 - g5 . a5 . g5 . e5 . d5 . | c5 - e5 . a5 . g5 . e5 - - . c5 . d5 . |
                f5 . a5 . d6 - c6 . a5 . f5 . a5 . c6 . | b5 - - . g5 . f5 . d5 - - . g5 . b5 . |
                c6 . e6 . g6 - e6 . c6 . g5 . e5 . g5 . | a5 - c6 . e6 . c6 . a5 - g5 . e5 . c5 . |
                f5 . a5 . c6 . f6 . e6 . c6 . a5 . c6 . | d6 - - - b5 - g5 . f5 . d5 . g5 - - .`;

const TUNE_A2 = `g5 . c6 . e6 - c6 . g5 . c6 . e6 . g6 . | e6 - c6 . a5 . c6 . e6 - - . d6 . c6 . |
                 d6 . f6 . a6 - f6 . d6 . a5 . c6 . d6 . | g6 - - . f6 . d6 . b5 - - . d6 . f6 . |
                 e6 . g6 . c6 - e6 . g6 . e6 . c6 . e6 . | a6 - g6 . e6 . c6 . a5 - c6 . e6 . a6 . |
                 f6 . e6 . c6 . a5 . c6 . f6 . a6 . f6 . | g6 - - - f6 - d6 . b5 . g5 . c6 - - .`;

export const dapur: Song = {
  id: 'dapur',
  title: 'Wajan Goyang',
  bpm: 124,
  swing: 0.06,
  gain: 0.9,
  inst: {
    lead: { ...STEELPAN, level: 0.26, pan: 0.14, rev: 0.2, range: [64, 93] },
    clav: { ...CLAV, level: 0.32, pan: -0.28 },
    keys: { ...EPIANO, level: 0.11, pan: 0.22, rev: 0.18, range: [55, 74] },
    bass: { ...BASS_FUNK, level: 0.22, range: [33, 57] },
    kick: { ...KICK_PUNCH, level: 0.36 },
    snare: { ...SNARE, level: 0.26, pan: 0.04, rev: 0.08 },
    hat: { ...HAT, level: 0.22, pan: 0.3 },
    conga: { ...CONGA, level: 0.3, pan: -0.32, rev: 0.1 },
    shk: { ...SHAKER, level: 0.18, pan: 0.24 },
  },
  sections: {
    intro: {
      bars: 2,
      chords: 'C | G7',
      parts: {
        conga: CONGAS,
        clav: 'x.mx.mx.x.mx.m.x|.mx.mx.xm.x.mx.m',
        shk: SHAKE,
        kick: '................|x.....x.x.x.x.x.',
        snare: '................|........x.x.xXXX',
      },
    },
    A: {
      bars: 8,
      chords: 'C | Am7 | Dm7 | G7 | C | Am7 | F | G7',
      parts: {
        lead: TUNE_A,
        clav: CLAVS,
        keys: KEYS_A,
        bass: BASS_A,
        kick: KICKS,
        snare: SNARES,
        hat: HATS,
        conga: CONGAS,
        shk: SHAKE,
      },
    },
    B: {
      bars: 8,
      chords: 'F | G | Em7 | Am7 | Dm7 | G7 | C | G7',
      parts: {
        lead: `a5 . c6 . f6 - e6 . c6 . a5 . c6 . e6 . | d6 - - . b5 . g5 . d6 . g6 . d6 - - . |
               e6 . g6 . b5 - g5 . e5 . g5 . b5 . d6 . | c6 - - . a5 . e5 . a5 . c6 . e6 - - . |
               f6 . e6 . d6 - c6 . a5 . c6 . d6 . f6 . | g6 - - . f6 . d6 . b5 - - . g5 . b5 . |
               c6 . e6 . g6 . e6 . c6 . g5 . c6 . e6 . | d6 - - - - - - - b5 . d6 . f6 . g6 .`,
        clav: { loop: 'x...x.mx..x.x.m.', fill: 'x.mx.mx.x.mx.m.x', every: 4 },
        keys: 'x...m.x.x...m...',
        bass: BASS_B,
        kick: 'x.......x..x....|x.......x.....x.',
        snare: SNARES,
        hat: 'x.x.x.x.x.x.x.xh',
        conga: '..s...x...s...x.|..s...x.s.s...x.',
        shk: SHAKE,
      },
    },
    A2: {
      bars: 8,
      chords: 'C | Am7 | Dm7 | G7 | C | Am7 | F | G7',
      parts: {
        lead: TUNE_A2,
        clav: CLAVS,
        keys: { loop: KEYS_A, fill: 'x.x.m.x.x.x.m.x.', every: 4 },
        bass: BASS_A,
        kick: KICKS,
        snare: SNARES,
        hat: HATS,
        conga: CONGAS,
        shk: SHAKE,
      },
    },
    brk: {
      bars: 4,
      chords: 'Am7 | Dm7 | F | G7',
      parts: {
        conga: '..s.l.x...s.m.x.|..s.l.x.s.s.l.x.|..s.l.x...s.m.x.|s.s.l.l.x.x.m.m.',
        clav: { loop: 'x.mx.mx.x.mx.m.x', fill: 'x.mx.mx.xxmxxmxx', every: 4 },
        bass: '1...............|1...............|1...............|1.......5...a...',
        shk: SHAKE,
        lead: `. . . . . . . . e6 . . . c6 . . . | . . . . . . . . f6 . . . d6 . . . |
               . . . . . . . . c6 . . . a5 . . . | b5 . . . g5 . . . d5 . . . . . . .`,
        snare: { loop: '................', fill: '....x...x.x.xXXX', every: 4 },
        kick: { loop: '................', fill: 'x.......x.......', every: 4 },
      },
    },
  },
  form: ['intro', 'A', 'B', 'A2', 'brk'],
  loopFrom: 1,
};
