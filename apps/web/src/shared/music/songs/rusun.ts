/**
 * "Menara Goyang" (wobbly tower): Rusun, stacking floors with a swinging crane.
 * Playful, lightly suspenseful, 104 bpm with a little swing. Marimba melody on a pelog-like
 * scale on D (D Eb F A Bb), xylophone answers, bouncy tuba, woodblock tick-tock and claves.
 * The Eb-over-D chord (a flat second over the bass) gives the gentle tension.
 * Form: intro(2) → A(8) → B(8) → A2(8) → crane(4), looping to A (28 bars ≈ 65 s).
 */

import { CLAVES, KICK, MARIMBA, PAD, SHAKER, TUBA, WOODBLOCK, XYLO } from '../presets';
import type { Song } from '../synth';

const TUBA_A = { loop: '1...v...1...v...', fill: '1...v...1.5.8...', every: 4 };
const BLOCKS = '..x..x....x..x..';
const CLAVE = 'x..x..x...x.x...|..x.x...x..x..x.';

export const rusun: Song = {
  id: 'rusun',
  title: 'Menara Goyang',
  bpm: 104,
  swing: 0.1,
  gain: 0.92,
  inst: {
    mar: { ...MARIMBA, level: 0.36, pan: -0.15, rev: 0.2, range: [55, 88], poly: 8 },
    xyl: { ...XYLO, level: 0.26, pan: 0.32, rev: 0.22, range: [67, 96] },
    tuba: { ...TUBA, level: 0.28, range: [33, 57] },
    pad: { ...PAD, level: 0.042, rev: 0.4, range: [57, 74], poly: 10 },
    wood: { ...WOODBLOCK, level: 0.3, pan: 0.38, rev: 0.1 },
    claves: { ...CLAVES, level: 0.27, pan: -0.38, rev: 0.1 },
    kick: { ...KICK, level: 0.28 },
    shk: { ...SHAKER, level: 0.26, pan: 0.2 },
  },
  sections: {
    intro: {
      bars: 2,
      chords: 'Dm | A7',
      parts: {
        wood: 'x...l...x...l...|x...l...x.l.l.l.',
        tuba: '1.......1.......|1.......v...a...',
        mar: `. . . . . . . . . . . . . . . . | . . . . . . . . a4 . d5 . e5 . f5 .`,
      },
    },
    A: {
      bars: 8,
      chords: 'Dm | Dm | Eb/D | Dm | Bb | Bb | A7 | Dm',
      parts: {
        mar: `d5 . f5 . a5 - . . bb5 . a5 . f5 - . . | eb5 . f5 . d5 - - - . . . . a4 . d5 . |
              eb5 . g5 . bb5 - . . g5 . eb5 . f5 - . . | d5 - - - . . a4 . d5 . f5 . a5 - . . |
              bb5 . a5 . f5 . d5 . f5 - . . bb4 . d5 . | f5 - - - eb5 . d5 . . . . . . . . . |
              c#5 . e5 . a5 - . . g5 . e5 . c#5 - . . | d5 - - - . . . . . . . . . . . . |`,
        xyl: `. . . . . . . . . . . . . . . . | . . . . . . . . a6 . bb6 . a6 . . . |
              . . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . . |
              . . . . . . . . . . . . . . . . | . . . . . . . . . . f6 . eb6 . d6 . |
              . . . . . . . . . . . . . . . . | . . . . a5 . d6 . f6 . a6 . d7 . . .`,
        tuba: TUBA_A,
        wood: BLOCKS,
        claves: CLAVE,
        kick: 'x.......x.......',
        shk: 'x.o.x.o.x.o.x.o.',
      },
    },
    B: {
      bars: 8,
      chords: 'Bb | Gm | Eb | Eb | Bb | Gm | A7sus4 | A7',
      parts: {
        mar: `d6 . . . bb5 . . . f5 . . . bb5 . d6 . | d6 . . . bb5 . . . g5 . . . . . . . |
              eb6 eb6 eb6 eb6 eb6 eb6 eb6 eb6 d6 . . . bb5 . . . | g5 . bb5 . eb6 . . . d6 . bb5 . g5 . . . |
              f5 . bb5 . d6 . . . f6 . d6 . bb5 . . . | bb5 . . . g5 . . . d5 . . . g5 . . . |
              a5 a5 a5 a5 a5 a5 a5 a5 d6 . . . . . . . | c#6 . . . a5 . . . e5 . . . c#5 . . .`,
        xyl: `. . . . . . . . . . . . . . . . | . . . . . . . . . . . . d6 . bb5 . |
              . . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . . |
              . . . . . . . . . . . . . . . . | . . . . . . . . . . . . bb5 . d6 . |
              . . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . .`,
        pad: 'x-------x-------',
        tuba: '1-------5-------|1-------5---a---',
        wood: '..x...x...x...x.',
        claves: CLAVE,
        kick: 'x.......x.......',
        shk: 'x.o.x.o.x.o.x.o.',
      },
    },
    A2: {
      bars: 8,
      chords: 'Dm | Dm | Eb/D | Dm | Bb | Gm | A7 | Dm',
      parts: {
        mar: `d5 . f5 . a5 - . . bb5 . a5 . f5 - . . | eb5 . f5 . d5 - - - . . . . a4 . d5 . |
              eb5 . g5 . bb5 - . . g5 . eb5 . f5 - . . | d5 - - - . . a4 . d5 . f5 . a5 - . . |
              bb5 . a5 . f5 . d5 . f5 - . . bb4 . d5 . | g5 . bb5 . d6 . . . bb5 . g5 . d5 . . . |
              e5 . g5 . a5 - . . c#6 . a5 . e5 - . . | d5 - - - . . . . . . . . . . . . |`,
        xyl: { loop: `. . . . . . . . a5 . . . bb5 . . . | . . . . . . . . a5 . . . f5 . . .` },
        tuba: TUBA_A,
        wood: BLOCKS,
        claves: CLAVE,
        kick: 'x.......x.......',
        shk: 'x.o.x.o.x.o.x.o.',
      },
    },
    crane: {
      bars: 4,
      chords: 'Dm | Eb/D | Dm | A7',
      parts: {
        wood: 'x...l...x...l...',
        mar: `. . . . . . . . a5 . . . bb5 . . . | . . . . . . . . a5 . . . g5 . . . |
              . . . . . . . . f5 . . . eb5 . . . | d5 . . . c#5 . . . e5 . . . a5 . . .`,
        tuba: '1-------........|1-------........|1-------........|1-------v---a---',
        kick: 'x..x............',
        pad: 'x---------------',
      },
    },
  },
  form: ['intro', 'A', 'B', 'A2', 'crane'],
  loopFrom: 1,
};
