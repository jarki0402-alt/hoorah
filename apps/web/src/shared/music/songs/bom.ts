/**
 * "Detak Komik" (comic tick-tock): Bom Oper, a cartoon chase with a ticking bomb.
 * Sneaky-fast cartoon funk in A minor, 148 bpm, straight. A clavinet chops over a funky bass while
 * a woodblock ticks like the fuse; the xylophone runs the chase and brass stabs hit at the climax.
 * Adaptive layers: tier 0 clav + bass (round cards, scoreboard), tier 1 kick, hats and the ticking
 * woodblock (the fuse is lit), tier 2 xylophone tune and snare (the fuse is past half way), tier 3
 * brass stabs and claps (the final round with two bombs).
 * Form: intro(2) → A(8) → B(8) → C(8) → A(8), looping to A (32 bars ≈ 52 s).
 */

import { BASS_FUNK, BRASS, CLAP, CLAV, HAT, KICK, SNARE, WOODBLOCK, XYLO } from '../presets';
import type { Song } from '../synth';

const CHOP = { loop: 'm.x.m.x.m.x.mxm.', fill: 'm.x.m.x.x.x.xxxx', every: 4 };
const BASS = { loop: '1..1..5.1.8.5.3.', fill: '1..1..5.1.5.8.a.', every: 4 };
const KICKS = { loop: 'x...x...x...x...', fill: 'x...x...x.x.x.xx', every: 4 };
const HATS = 'x.x.x.x.x.x.x.x.';
const TICK = 'x...x...x...x...';
const SNARES = { loop: '....x.......x...', fill: '....x.......x.xx', every: 4 };
const STABS = { loop: 'x.....x...x.....', fill: 'x.....x...x.x.x.', every: 4 };
const CLAPS = '....x.......x...';

const TUNE_A = `a5 . c6 . e6 . c6 . a5 . e5 . a5 - - . | f5 . a5 . c6 . a5 . f5 . c5 . f5 - - . |
                g5 . b5 . d6 . b5 . g5 . d5 . g5 - - . | g#5 - b5 - e6 - - - d6 . c6 . b5 . g#5 . |
                e6 . e6 . d6 . c6 . b5 . c6 . a5 - - . | c6 . c6 . b5 . a5 . g5 . a5 . f5 - - . |
                d6 . d6 . c6 . b5 . a5 . b5 . g5 - - . | e5 . g#5 . b5 . e6 . g#6 - - - - - - .`;

const TUNE_B = `d6 - - . f6 - - . e6 - d6 - a5 - - . | c6 - - . e6 - - . d6 - c6 - a5 - - . |
                d6 - - . f6 - - . a6 - g6 - f6 - - . | e6 - - - - - - - g#5 . b5 . e6 . . . |
                f6 . e6 . d6 . a5 . f5 . a5 . d6 - - . | e6 . d6 . c6 . a5 . e5 . a5 . c6 - - . |
                a5 . c6 . f6 . c6 . a5 . c6 . f6 - - . | e6 - - - d6 - - - c6 - - - b5 - - .`;

const TUNE_C = `c6 - a5 - f5 - a5 - c6 - f6 - - - - . | d6 - b5 - g5 - b5 - d6 - g6 - - - - . |
                e6 - b5 - g5 - b5 - e6 - g6 - - - - . | a6 - - - g6 - - - e6 - - - c6 - - . |
                f6 . e6 . c6 . a5 . f6 . e6 . c6 . a5 . | g6 . f6 . d6 . b5 . g6 . f6 . d6 . b5 . |
                g#6 - - - e6 - - - b5 - - - g#5 - - . | e6 . . . e6 . . . e6 . e6 . e6 - - .`;

export const bom: Song = {
  id: 'bom',
  title: 'Detak Komik',
  bpm: 148,
  gain: 0.88,
  inst: {
    lead: { ...XYLO, level: 0.24, pan: 0.14, rev: 0.12, range: [64, 96], tier: 2 },
    clav: { ...CLAV, level: 0.24, pan: -0.24, rev: 0.06 },
    bass: { ...BASS_FUNK, level: 0.28 },
    brass: { ...BRASS, level: 0.14, pan: 0.2, rev: 0.14, tier: 3 },
    kick: { ...KICK, level: 0.36, tier: 1 },
    hat: { ...HAT, level: 0.16, pan: 0.3, tier: 1 },
    tick: { ...WOODBLOCK, level: 0.16, pan: -0.3, tier: 1 },
    snare: { ...SNARE, level: 0.24, rev: 0.06, tier: 2 },
    clap: { ...CLAP, level: 0.12, pan: -0.1, rev: 0.1, tier: 3 },
  },
  sections: {
    intro: {
      bars: 2,
      chords: 'Am | E',
      parts: {
        clav: CHOP,
        bass: '1.......1.......|5.......5...3.a.',
        tick: TICK,
      },
    },
    A: {
      bars: 8,
      chords: 'Am | F | G | E | Am | F | G | E',
      parts: {
        lead: TUNE_A,
        clav: CHOP,
        bass: BASS,
        brass: STABS,
        kick: KICKS,
        hat: HATS,
        tick: TICK,
        snare: SNARES,
        clap: CLAPS,
      },
    },
    B: {
      bars: 8,
      chords: 'Dm | Am | Dm | E | Dm | Am | F | E',
      parts: {
        lead: TUNE_B,
        clav: { loop: 'x...m.x.x...m.x.', fill: 'x...m.x.x.x.xxxx', every: 4 },
        bass: '1.1...5.1.1.8.5.',
        brass: { loop: 'x...........x...', fill: 'x.....x.x.x.x.x.', every: 4 },
        kick: { loop: 'x.....x.x.......', fill: 'x.....x.x...x.x.', every: 4 },
        hat: '..x...x...x...x.',
        tick: TICK,
        snare: SNARES,
        clap: CLAPS,
      },
    },
    C: {
      bars: 8,
      chords: 'F | G | Em | Am | F | G | E | E',
      parts: {
        lead: TUNE_C,
        clav: CHOP,
        bass: { loop: '1.1.1.1.5.5.5.5.', fill: '1.1.1.1.5.5.8.a.', every: 4 },
        brass: STABS,
        kick: { loop: 'x.x.x.x.x.x.x.x.', fill: 'x.x.x.x.xxxxxxxx', every: 8 },
        hat: HATS,
        tick: 'x.x.x.x.x.x.x.x.',
        snare: { loop: '....x.......x...', fill: '....x...x.x.xxxx', every: 8 },
        clap: CLAPS,
      },
    },
  },
  form: ['intro', 'A', 'B', 'C', 'A'],
  loopFrom: 1,
};
