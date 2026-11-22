/**
 * "Pulau Mainan" (toy island): Obby, a sunny obstacle race over toy blocks.
 * Bouncy toy pop in C, 136 bpm, straight. A xylophone tune hops over strummed ukulele and a round
 * bass; glockenspiel sparkles and tambourine join as the race heats up.
 * Adaptive layers: tier 0 ukulele + bass (intro card, podium), tier 1 kick and hats (racing),
 * tier 2 xylophone tune, snare and clap (past half way), tier 3 glockenspiel and tambourine (the
 * last seconds after the first runner finishes).
 * Form: intro(2) → A(8) → B(8) → A2(8) → C(8), looping to A (32 bars ≈ 56 s).
 */

import { BASS_ROUND, CLAP, GLOCK, HAT, KICK, SNARE, TAMBOURINE, UKULELE, XYLO } from '../presets';
import type { Song } from '../synth';

const UKE = 'x..u..x.x.u.x.u.';
const BASS = { loop: '1...1.5.1...5.8.', fill: '1...1.5.1.5.8.a.', every: 4 };
const KICKS = 'x...x...x...x...';
const HATS = '..x...x...x...x.';
const SNARES = { loop: '....x.......x...', fill: '....x.......x.xx', every: 4 };
const CLAPS = '....x.......x...';
const SPARK = { loop: '1.3.5.3.8.5.3.5.', fill: '8.5.3.1.8.5.3.1.', every: 2 };
const TAMB = 'x.x.x.x.x.x.x.x.';

const TUNE_A = `e5 . g5 . c6 - - . g5 . e5 . g5 - - . | d5 . g5 . b5 - - . a5 . g5 . d5 - - . |
                c5 . e5 . a5 - - . g5 . e5 . c5 - e5 . | f5 - - . a5 . c6 . a5 - - . g5 . f5 . |
                e5 . e5 . g5 . c6 . e6 - - . d6 . c6 . | b5 - - . g5 . d5 . g5 - b5 . d6 - - . |
                c6 . b5 . a5 . e5 . a5 - c6 . e6 - - . | f6 - - - e6 - - - d6 - - - c6 - - .`;

const TUNE_A2 = `g5 . c6 . e6 - - . c6 . g5 . c6 - - . | g5 . b5 . d6 - - . b5 . g5 . d6 - - . |
                 a5 . c6 . e6 - - . c6 . a5 . e6 - c6 . | a5 - - . c6 . f6 . c6 - - . a5 . c6 . |
                 g5 . g5 . c6 . e6 . g6 - - . f6 . e6 . | d6 - - . b5 . g5 . b5 - d6 . g6 - - . |
                 e6 . d6 . c6 . a5 . c6 - e6 . a6 - - . | a6 - - - g6 - - - f6 - - - e6 - - .`;

const TUNE_B = `a5 . c6 . f6 - c6 . a5 . c6 . f6 - - . | g5 . b5 . d6 - b5 . g5 . b5 . d6 - - . |
                e5 . g5 . b5 - g5 . e5 . g5 . b5 - - . | a5 . c6 . e6 - - . d6 . c6 . a5 - - . |
                f5 . a5 . c6 . f6 . e6 . c6 . a5 . c6 . | d6 - - . b5 . g5 . d6 - - . g6 - - . |
                e6 . d6 . c6 . g5 . e5 . g5 . c6 . e6 . | c6 - - - - - - - . . . . g5 . b5 .`;

const TUNE_C = `. . . . c6 . . . e6 . . . d6 . . . | . . . . b5 . . . d6 . . . c6 . . . |
                . . . . a5 . . . c6 . . . b5 . . . | . . . . a5 . c6 . f6 - - . e6 . d6 . |
                . . . . c6 . . . e6 . . . g6 . . . | . . . . f6 . . . e6 . . . d6 . . . |
                . . . . e6 . . . c6 . . . a5 . . . | g5 - - - b5 - - - d6 - - - g6 - - .`;

export const obby: Song = {
  id: 'obby',
  title: 'Pulau Mainan',
  bpm: 136,
  gain: 0.9,
  inst: {
    lead: { ...XYLO, level: 0.24, pan: 0.12, rev: 0.16, range: [62, 93], tier: 2 },
    uke: { ...UKULELE, level: 0.3, pan: -0.24, rev: 0.12 },
    bass: { ...BASS_ROUND, level: 0.26 },
    glock: { ...GLOCK, level: 0.12, pan: 0.32, rev: 0.24, range: [72, 96], tier: 3 },
    kick: { ...KICK, level: 0.36, tier: 1 },
    hat: { ...HAT, level: 0.2, pan: 0.28, tier: 1 },
    snare: { ...SNARE, level: 0.24, rev: 0.08, tier: 2 },
    clap: { ...CLAP, level: 0.14, pan: -0.1, rev: 0.12, tier: 2 },
    tamb: { ...TAMBOURINE, level: 0.14, pan: -0.32, tier: 3 },
  },
  sections: {
    intro: {
      bars: 2,
      chords: 'C | G',
      parts: {
        uke: UKE,
        bass: '1...........5...|1.......5...8.5.',
        glock: '1.3.5.3.8.5.3.5.|8.5.3.1.8.5.3.1.',
      },
    },
    A: {
      bars: 8,
      chords: 'C | G | Am | F | C | G | Am | F',
      parts: {
        lead: TUNE_A,
        uke: UKE,
        bass: BASS,
        kick: KICKS,
        hat: HATS,
        snare: SNARES,
        clap: CLAPS,
        glock: SPARK,
        tamb: TAMB,
      },
    },
    B: {
      bars: 8,
      chords: 'F | G | Em | Am | F | G | C | C',
      parts: {
        lead: TUNE_B,
        uke: { loop: 'x.x.u.x.x.x.u.x.', fill: 'x.u.x.u.x.u.xuxu', every: 8 },
        bass: '1.1.5.1.1.1.5.8.',
        kick: { loop: 'x.....x.x.......', fill: 'x.....x.x...x.x.', every: 4 },
        hat: 'x.x.x.x.x.x.x.x.',
        snare: SNARES,
        clap: CLAPS,
        glock: { loop: '8...5...3...5...', fill: '1.3.5.8.1.3.5.8.', every: 4 },
        tamb: '..x...x...x...x.',
      },
    },
    A2: {
      bars: 8,
      chords: 'C | G | Am | F | C | G | Am | F',
      parts: {
        lead: TUNE_A2,
        uke: UKE,
        bass: BASS,
        kick: KICKS,
        hat: HATS,
        snare: SNARES,
        clap: CLAPS,
        glock: SPARK,
        tamb: TAMB,
      },
    },
    C: {
      bars: 8,
      chords: 'Am | Em | F | C | Am | Em | F | G',
      parts: {
        lead: TUNE_C,
        uke: 'x.......x.......',
        bass: '1.......5.......',
        kick: { loop: 'x.......x.......', fill: 'x...x...x.x.x.x.', every: 8 },
        hat: '....x.......x...',
        snare: { loop: '................', fill: '....x...x.x.xxxx', every: 8 },
        clap: '........x.......',
        glock: '1...3...5...8...',
        tamb: { loop: '................', fill: 'x.x.x.x.xxxxxxxx', every: 8 },
      },
    },
  },
  form: ['intro', 'A', 'B', 'A2', 'C'],
  loopFrom: 1,
};
