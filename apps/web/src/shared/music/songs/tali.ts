/**
 * "Tali Senja" (rope at dusk): Satu Tali, a co-op climb up warm cliffs.
 * Steady, encouraging adventure in D, 111 bpm, straight. A kacapi runs over a round bass; a
 * bamboo flute sings the climb, angklung chords ring out near the top.
 * Adaptive layers: tier 0 kacapi + bass (intro card, flag), tier 1 kick and shaker (climbing),
 * tier 2 flute tune and clap (later sections), tier 3 angklung and tambourine (someone hangs on
 * the rope, the last seconds).
 * Form: intro(2) → A(8) → B(8) → C(8) → A(8), looping to A (32 bars ≈ 69 s).
 */

import { ANGKLUNG, BASS_ROUND, CLAP, FLUTE, KACAPI, KICK, SHAKER, TAMBOURINE } from '../presets';
import type { Song } from '../synth';

const RUN = { loop: '1358985313589853', fill: '1358985385318531', every: 4 };
const BASS = { loop: '1...1.5.1...5.8.', fill: '1...1.5.1.5.8.5.', every: 4 };
const KICKS = { loop: 'x.....x.x.......', fill: 'x.....x.x...x.x.', every: 4 };
const SHAKE = '..x...x...x...x.';
const CLAPS = '....x.......x...';
const RING = { loop: 'x.......x.......', fill: 'x.......x...x...', every: 4 };
const TAMB = 's...s...s...s...';

const TUNE_A = `d5 - - . f#5 . a5 - - - b5 . a5 - f#5 . | e5 - - . a4 . c#5 . e5 - - . c#5 - a4 . |
                f#5 - - . d5 . f#5 . b5 - - . a5 - f#5 . | g5 - - . b5 . a5 . g5 - f#5 . e5 - - . |
                d5 - - . f#5 . a5 - - - d6 . c#6 - a5 . | b5 - - . a5 . e5 . c#6 - - . b5 - a5 . |
                g5 - - . b5 . d6 . b5 - a5 . g5 - b5 . | a5 - - - - - . . e5 - f#5 - g5 - a5 .`;

const TUNE_B = `b5 - - . a5 . f#5 . d5 - - . f#5 - a5 . | g5 - - . f#5 . e5 . d5 - - . e5 - g5 . |
                f#5 - - . e5 . d5 . a4 - - . d5 - f#5 . | e5 - - - - - . . c#5 - e5 - a5 - - . |
                d6 - - . c#6 . b5 . f#5 - - . b5 - d6 . | d6 - - . b5 . g5 . d6 - e6 . d6 - b5 . |
                g5 - - . b5 . e6 . d6 - b5 . g5 - e5 . | a5 - - - - - - - c#6 - - - e6 - - .`;

const TUNE_C = `b5 - - - a5 - g5 - d5 - - - g5 - - . | c#6 - - - b5 - a5 - e5 - - - a5 - - . |
                a5 - - - f#5 - a5 - c#6 - - - a5 - - . | b5 - - - - - - - d6 - c#6 - b5 - - . |
                d6 - - - b5 - d6 - g6 - - - f#6 - - . | e6 - - - c#6 - e6 - a6 - - - g6 - - . |
                f#6 - - - d6 - b5 - d6 - f#6 - e6 - - . | e6 - - - - - - - . . . . a5 - c#6 .`;

export const tali: Song = {
  id: 'tali',
  title: 'Tali Senja',
  bpm: 111,
  gain: 0.92,
  inst: {
    lead: { ...FLUTE, level: 0.22, pan: 0.12, rev: 0.22, range: [62, 93], tier: 2 },
    kacapi: { ...KACAPI, level: 0.3, pan: -0.22, rev: 0.14 },
    bass: { ...BASS_ROUND, level: 0.27 },
    angk: { ...ANGKLUNG, level: 0.16, pan: 0.3, rev: 0.26, range: [62, 81], tier: 3 },
    kick: { ...KICK, level: 0.34, tier: 1 },
    shaker: { ...SHAKER, level: 0.16, pan: 0.26, tier: 1 },
    clap: { ...CLAP, level: 0.14, pan: -0.1, rev: 0.12, tier: 2 },
    tamb: { ...TAMBOURINE, level: 0.12, pan: -0.3, tier: 3 },
  },
  sections: {
    intro: {
      bars: 2,
      chords: 'D | A',
      parts: {
        kacapi: RUN,
        bass: '1...........5...|1.......5...8.5.',
      },
    },
    A: {
      bars: 8,
      chords: 'D | A | Bm | G | D | A | G | A',
      parts: {
        lead: TUNE_A,
        kacapi: RUN,
        bass: BASS,
        angk: RING,
        kick: KICKS,
        shaker: SHAKE,
        clap: CLAPS,
        tamb: TAMB,
      },
    },
    B: {
      bars: 8,
      chords: 'Bm | G | D | A | Bm | G | Em | A',
      parts: {
        lead: TUNE_B,
        kacapi: { loop: '1535853515358535', fill: '1358985385318531', every: 4 },
        bass: '1.1.5...1.1.5.8.',
        angk: RING,
        kick: { loop: 'x...x...x...x...', fill: 'x...x...x.x.x.x.', every: 4 },
        shaker: 'x.x.x.x.x.x.x.x.',
        clap: CLAPS,
        tamb: TAMB,
      },
    },
    C: {
      bars: 8,
      chords: 'G | A | F#m | Bm | G | A | Bm | A',
      parts: {
        lead: TUNE_C,
        kacapi: { loop: '1.3.5.8.5.3.1.3.', fill: '1358985385318531', every: 4 },
        bass: '1.......5...1...',
        angk: { loop: 'x...............', fill: 'x.......x.x.x...', every: 4 },
        kick: { loop: 'x.......x.......', fill: 'x.......x...x.x.', every: 4 },
        shaker: SHAKE,
        clap: { loop: '................', fill: '....x.......x.x.', every: 4 },
        tamb: 's.......s.......',
      },
    },
  },
  form: ['intro', 'A', 'B', 'C', 'A'],
  loopFrom: 1,
};
