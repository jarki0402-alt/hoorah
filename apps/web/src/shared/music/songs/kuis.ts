/**
 * "Siapa Cepat" (who's quicker): Kuis Nusantara.
 * Bright game-show funk in A, 118 bpm. Tight drums, 16th clav comping, a funky resonant bass,
 * brass stabs on phrase ends and a sparse trumpet lead, kept under the voices in the room.
 * Form: intro(2) → A(8) → B(8) → A2(8) → break(4) → B2(8), looping to A (36 bars ≈ 73 s).
 */

import { BASS_FUNK, BRASS, CLAP, CLAV, HAT, KICK, SNARE, TRUMPET } from '../presets';
import type { Song } from '../synth';

const KICKS = { loop: 'x.....x...x.....|x..x......x..x..', fill: 'x.....x...x.x...', every: 8 };
const SNARES = { loop: '....x..o.o..x...|....x..o....x.o.', fill: '....x..ox.xxX.XX', every: 8 };
const HATS = 'xoxoxoxoxoxoxoxo|xoxoxoxoxoxoxhxo';
const CLAVS = 'x.mx.mx.x.mx.m.x|.mx.mx.xm.x.mx.m';
const BASS_A = '1..1.o8.1.71.8o5|1..1.o8..17.85.a';
const BASS_B = '1..1..5.8.5.3.5.|1..1..5..1..8.a.';
const STABS = {
  loop: '................|................|................|..........x.x.X-',
  fill: 'X-..x.x...X-....',
  every: 8,
};

export const kuis: Song = {
  id: 'kuis',
  title: 'Siapa Cepat',
  bpm: 118,
  gain: 0.92,
  inst: {
    kick: { ...KICK, level: 0.4 },
    snare: { ...SNARE, level: 0.3, pan: 0.05, rev: 0.08 },
    clap: { ...CLAP, level: 0.27, pan: -0.05, rev: 0.12 },
    hat: { ...HAT, level: 0.3, pan: 0.3 },
    bass: { ...BASS_FUNK, level: 0.2, range: [36, 60] },
    clav: { ...CLAV, level: 0.4, pan: -0.3 },
    brass: { ...BRASS, level: 0.125, pan: 0.18, rev: 0.15, range: [62, 81] },
    lead: { ...TRUMPET, level: 0.17, pan: 0.1, rev: 0.2, range: [62, 86] },
  },
  sections: {
    intro: {
      bars: 2,
      chords: 'A9 | A9',
      parts: {
        brass: 'X-..x.x...X-....|................',
        kick: 'x.....x.x.......|x...x...x...x...',
        snare: '................|....x...x.xxX.XX',
        hat: 'x.x.x.x.x.x.x.x.|xoxoxoxoxoxoxoxo',
        bass: '................|........1.1.8.a.',
      },
    },
    A: {
      bars: 8,
      chords: 'A9 | G/A | A9 | G/A | D9 | C/D | E9 | D9 E9',
      parts: {
        kick: KICKS,
        snare: SNARES,
        hat: HATS,
        bass: BASS_A,
        clav: CLAVS,
        brass: STABS,
        lead: `. . . . . . . . . . e5 - g5 - a5 - | - - - - . . . . . . . . . . . . |
               . . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . . |
               . . . . . . . . . . c6 - b5 - a5 - | e5 - d5 - - - . . . . . . . . . . |
               . . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . .`,
      },
    },
    B: {
      bars: 8,
      chords: 'Dmaj7 | C#m7 | Bm7 | E9 | Dmaj7 | C#m7 F#7 | Bm7 | E9',
      parts: {
        kick: KICKS,
        snare: SNARES,
        clap: '....x.......x...',
        hat: HATS,
        bass: BASS_B,
        clav: CLAVS,
        brass: {
          loop: 'x-..............|................|................|..........x.x.X-',
          fill: '........x.x.X-..',
          every: 8,
        },
        lead: `f#5 - - - a5 - - - c#6 - - - - - . . | b5 - - - - - g#5 - e5 - - - . . . . |
               . . d5 - f#5 - a5 - - - - - c#6 - b5 - | g#5 - - - - - - - . . . . . . . . |
               f#5 - - - a5 - - - d6 - - - c#6 - - - | b5 - - - g#5 - - - a#5 - - - c#6 - - - |
               d6 - - - - - b5 - - - a5 - f#5 - - - | e5 - - - g#5 - b5 - d6 - - - . . . .`,
      },
    },
    A2: {
      bars: 8,
      chords: 'A9 | G/A | A9 | G/A | D9 | C/D | E9 | D9 E9',
      parts: {
        kick: KICKS,
        snare: SNARES,
        hat: HATS,
        bass: BASS_A,
        clav: { loop: CLAVS, fill: 'x.mx.mx.X.X.X.X.', every: 4 },
        brass: STABS,
        lead: `. . . . . . . . . . a5 - c6 - a5 - | g5 - e5 - - - . . . . . . . . . . |
               . . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . . |
               . . . . . . . . . . f#5 - a5 - c6 - | d6 - - - c6 - a5 - - - . . . . . . |
               . . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . .`,
      },
    },
    break: {
      bars: 4,
      chords: 'A9 | A9 | G/A | E9',
      parts: {
        kick: 'x.......x..x....',
        clap: '....x.......x...',
        hat: '..x...x...x...x.',
        bass: '1..1.o8.1.71.8o5',
        brass: '................|................|................|........x..x..X-',
        snare: { loop: '................', fill: '........x.xxXXXX', every: 4 },
      },
    },
    B2: {
      bars: 8,
      chords: 'Dmaj7 | C#m7 | Bm7 | E9 | Dmaj7 | C#m7 F#7 | Bm7 | E9',
      parts: {
        kick: KICKS,
        snare: SNARES,
        clap: '....x.......x...',
        hat: HATS,
        bass: BASS_B,
        clav: CLAVS,
        brass: {
          loop: 'x-......x-......|................|x-......x-......|..........x.x.X-',
          fill: '........x.x.X-..',
          every: 8,
        },
        lead: `f#5 - - - a5 - - - c#6 - - - - - . . | b5 - - - - - g#5 - e5 - - - . . . . |
               . . d5 - f#5 - a5 - - - - - c#6 - b5 - | g#5 - - - - - - - . . . . . . . . |
               a5 - - - d6 - - - f#5 - - - a5 - - - | g#5 - - - e5 - - - c#6 - - - a#5 - - - |
               b5 - - - d6 - - - c#6 - b5 - a5 - - - | b5 - - - g#5 - e5 - d5 - - - c#5 - - -`,
      },
    },
  },
  form: ['intro', 'A', 'B', 'A2', 'break', 'B2'],
  loopFrom: 1,
};
