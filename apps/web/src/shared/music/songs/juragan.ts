/**
 * "Juragan Santai" (the easy-going tycoon): Juragan Nusantara around the table, deals made over
 * coffee. A relaxed but lively keroncong-flavoured swing in F major, 107 bpm: a breathy flute tune,
 * cuk chops on the off-beats with little up-strums, a plucked cello walking under it like in a
 * keroncong band, round bass, brushes and a soft rim tresillo. The marimba takes the tune in B,
 * and a glockenspiel "kaching" closes every eight bars like a till.
 * Form: intro(2) → A(8) → B(8) → A2(8) → C(8), looping to A (32 bars ≈ 72 s).
 */

import { BASS_ROUND, BRUSH, CUK, FLUTE, GLOCK, KICK, MARIMBA, PIZZ, RIM } from '../presets';
import type { Song } from '../synth';

const CHOPS = '..x.u.x...x.u.x.';
const CELLO = { loop: '1..5..8.5..3..5.', fill: '1..5..8.5.3.1...', every: 4 };
const BASS = '1.......5.......|1.......5...a...';
const KICKS = 'x.......x.......';
const BRUSHES = 'x.s.x.s.x.s.x.s.';
const TRESILLO = 'x..x..x...x.x...';
const KACHING = {
  loop: '................',
  fill: 'c6 . f6 . a6 . c7 - - - . . . . . .',
  every: 8,
};

const MELODY_A = `c5 . f5 . a5 - - - g5 . f5 . a5 . c6 . | d6 - - - c6 . a5 . f5 - - - d5 . . . |
                  . . d5 . g5 . bb5 . d6 - c6 - bb5 . a5 . | g5 - - - e5 . g5 . bb5 - a5 - g5 - - - |
                  c5 . f5 . a5 - - - c6 . a5 . f6 - - - | eb6 - - - d6 . c6 . a5 - - - f5 . . . |
                  d6 - bb5 - f5 - bb5 - c6 - bb5 - g5 - e5 - | f5 - - - - - - - . . . . c5 . d5 .`;

/** Marimba answers in the gaps of the tune. */
const ANSWER_A = `. . . . . . . . . . . . . . . . | . . . . . . . . . . . . a5 . c6 . |
                  . . . . . . . . . . . . . . . . | . . . . . . . . . . . . c5 . e5 . |
                  . . . . . . . . . . . . . . . . | . . . . . . . . . . . . a5 . c6 . |
                  . . . . . . . . . . . . . . . . | . . . . a5 . c6 . f5 . . . . . . .`;

export const juragan: Song = {
  id: 'juragan',
  title: 'Juragan Santai',
  bpm: 107,
  swing: 0.12,
  gain: 0.86,
  inst: {
    flute: { ...FLUTE, level: 0.2, pan: -0.1, rev: 0.24, range: [67, 93] },
    marimba: { ...MARIMBA, level: 0.2, pan: 0.24, rev: 0.18 },
    cuk: { ...CUK, level: 0.34, pan: 0.3, rev: 0.1, gate: 0.55 },
    cello: { ...PIZZ, level: 0.32, pan: -0.18, rev: 0.12, range: [40, 62] },
    bass: { ...BASS_ROUND, level: 0.24, range: [36, 55] },
    kick: { ...KICK, level: 0.22 },
    brush: { ...BRUSH, level: 0.22, pan: 0.12 },
    rim: { ...RIM, level: 0.12, pan: -0.28, rev: 0.1 },
    glock: { ...GLOCK, level: 0.14, pan: 0.32, rev: 0.32 },
  },
  sections: {
    intro: {
      bars: 2,
      chords: 'F | C7',
      parts: {
        marimba: `f5 . a5 . c6 . a5 . f5 . a5 . c6 - - - | bb5 . g5 . e5 . g5 . c5 - - - . . . .`,
        cuk: CHOPS,
        cello: '1..5..8.5..3..5.|1..5..8.5.3.1...',
        brush: BRUSHES,
        rim: '................|x..x..x...x.x...',
      },
    },
    A: {
      bars: 8,
      chords: 'F | Dm | Gm | C7 | F | F7 | Bb C7 | F',
      parts: {
        flute: MELODY_A,
        marimba: ANSWER_A,
        cuk: CHOPS,
        cello: CELLO,
        bass: BASS,
        kick: KICKS,
        brush: BRUSHES,
        rim: TRESILLO,
        glock: KACHING,
      },
    },
    B: {
      bars: 8,
      chords: 'Bb | F | Gm | C | Am | Dm | G7 | C7',
      parts: {
        marimba: `bb4 . d5 . f5 . bb5 . a5 . f5 . d5 . f5 . | a4 . c5 . f5 . a5 . g5 . f5 . c5 . a4 . |
                  g4 . bb4 . d5 . g5 . f5 . d5 . bb4 . d5 . | c5 . e5 . g5 . c6 . bb5 . g5 . e5 . c5 . |
                  a4 . c5 . e5 . a5 . g5 . e5 . c5 . e5 . | d5 . f5 . a5 . d5 . f5 . a5 . c6 . a5 . |
                  b4 . d5 . f5 . g5 . b5 . g5 . f5 . d5 . | e5 . g5 . bb5 . c6 . bb5 . g5 . e5 . c5 .`,
        flute: `d6 - - - - - - - c6 - - - - - - - | c6 - - - - - - - a5 - - - - - - - |
                bb5 - - - - - - - d6 - - - - - - - | e6 - - - - - - - . . . . . . . . |
                e6 - - - - - - - c6 - - - - - - - | f6 - - - - - - - d6 - - - - - - - |
                d6 - - - - - - - b5 - - - - - - - | bb5 - - - - - - - g5 - - - . . . .`,
        cuk: '..x...x...x...x.',
        cello: CELLO,
        bass: BASS,
        kick: KICKS,
        brush: 'x...x.s.x...x.s.',
        glock: KACHING,
      },
    },
    A2: {
      bars: 8,
      chords: 'F | Dm | Gm | C7 | F | F7 | Bb C7 | F',
      parts: {
        flute: MELODY_A,
        marimba: `. . . . . . . . f5 . a5 . c6 . a5 . | . . . . . . . . d5 . f5 . a5 . f5 . |
                  . . . . . . . . g5 . bb5 . d5 . bb4 . | . . . . . . . . c5 . e5 . g5 . e5 . |
                  . . . . . . . . f5 . a5 . c6 . a5 . | . . . . . . . . eb5 . f5 . a5 . c6 . |
                  . . . . . . . . . . . . . . . . | . . . . a5 . c6 . f5 . . . . . . .`,
        cuk: CHOPS,
        cello: CELLO,
        bass: BASS,
        kick: KICKS,
        brush: BRUSHES,
        rim: TRESILLO,
        glock: KACHING,
      },
    },
    C: {
      bars: 8,
      chords: 'Dm | Am | Bb | F | Gm | C | F | C7',
      parts: {
        flute: `a5 . a5 . f5 . d5 . a5 - - - g5 . f5 . | e5 . e5 . c5 . a4 . e5 - - - . . . . |
                f5 . f5 . d5 . bb4 . f5 - g5 - a5 - bb5 - | c6 - - - a5 - - - f5 - - - . . . . |
                d6 . d6 . bb5 . g5 . d6 - - - c6 . bb5 . | c6 . c6 . g5 . e5 . c6 - - - bb5 . g5 . |
                a5 - c6 - f6 - - - e6 . d6 . c6 . a5 . | g5 - - - bb5 - - - c6 - - - . . . .`,
        marimba: `. . . . . . . . . . . . d5 . f5 . | . . . . . . . . . . . . c5 . e5 . |
                  . . . . . . . . . . . . . . . . | . . . . . . . . . . . . a5 . c6 . |
                  . . . . . . . . . . . . g5 . bb5 . | . . . . . . . . . . . . e5 . g5 . |
                  . . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . .`,
        cuk: '..x.u.x.u.x.u.x.',
        cello: CELLO,
        bass: BASS,
        kick: 'x.......x...x...',
        brush: BRUSHES,
        rim: 'x..x..x.....x...',
        glock: KACHING,
      },
    },
  },
  form: ['intro', 'A', 'B', 'A2', 'C'],
  loopFrom: 1,
};
