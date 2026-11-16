/**
 * "Cat Lantai" (floor paint): Rebut Wilayah, sneaking out, drawing a loop, dashing home.
 * Mischievous funk-pop in A minor (dorian lift on D9), 133 bpm with a hint of swing. A staccato
 * pizzicato riff tiptoes under a bright xylophone tune, e-piano chops, a slap-happy bass, congas
 * and a punchy kit. The breakdown drops to congas and the riff, like holding your breath out on
 * the floor before the run home.
 * Form: intro(2) → A(8) → B(8) → A2(8) → brk(4), looping to A (28 bars ≈ 51 s).
 */

import { BASS_FUNK, CONGA, EPIANO, HAT, KICK_PUNCH, PIZZ, SNARE, XYLO } from '../presets';
import type { Song } from '../synth';

const KICKS = 'x.....x.x..x....|x.....x.x.....x.';
const SNARES = { loop: '....x..o....x.o.', fill: '....x..o..x.xXXX', every: 8 };
const HATS = 'x.xxx.xhx.xxx.xh';
const CONGAS = '..s.l.x...s.m.x.|..s.l.x.s.s.l.x.';
const RIFF = { loop: '1..5..8.3..5.8..', fill: '1..5..8.3.5.8.a.', every: 4 };
const KEYS_A = '..x.m.x...x.m.x.';
const BASS_A = { loop: '1..1.o8.1..5.8o5', fill: '1..1.o8..18.5.a.', every: 4 };
const BASS_B = '1...1.8.5...1.5.|1...1.8.5.1.8.a.';

const MELODY_A = `a5 . c6 . e6 - c6 . a5 . . . g5 . a5 . | f#5 - a5 . . . e6 - d6 . c6 . a5 - - . |
                  a5 . c6 . e6 - g6 . e6 . c6 . d6 - c6 . | a5 - - - f#5 . a5 . b5 - - - . . . . |
                  c6 . a5 . f5 . a5 . c6 - e6 - . . c6 . | b5 - g#5 . e5 . g#5 . b5 - d6 - . . b5 . |
                  c6 . b5 . a5 . e5 . a5 - c6 - e6 - a6 - | g#6 - - - e6 - - - . . . . . . . .`;

const MELODY_A2 = `e6 . c6 . a5 - c6 . e6 . . . g6 . e6 . | f#6 - e6 . . . d6 - a5 . c6 . d6 - - . |
                   e6 . g6 . a6 - g6 . e6 . c6 . d6 - e6 . | a5 - - - . . a5 . b5 . c6 . d6 . f#6 . |
                   a6 . f6 . c6 . a5 . c6 - f6 - . . e6 . | d6 - b5 . g#5 . b5 . d6 - e6 - . . g#6 . |
                   a6 . g6 . e6 . c6 . a5 - c6 - e6 - g6 - | a6 - - - - - - - . . . . . . . .`;

export const wilayah: Song = {
  id: 'wilayah',
  title: 'Cat Lantai',
  bpm: 133,
  swing: 0.05,
  gain: 0.9,
  inst: {
    lead: { ...XYLO, level: 0.3, pan: 0.12, rev: 0.2, range: [67, 96] },
    pizz: { ...PIZZ, level: 0.42, pan: -0.25, rev: 0.12, range: [45, 67] },
    keys: { ...EPIANO, level: 0.12, pan: 0.22, rev: 0.18, range: [55, 74] },
    bass: { ...BASS_FUNK, level: 0.22, range: [33, 57] },
    kick: { ...KICK_PUNCH, level: 0.36 },
    snare: { ...SNARE, level: 0.27, pan: 0.04, rev: 0.08 },
    hat: { ...HAT, level: 0.24, pan: 0.3 },
    conga: { ...CONGA, level: 0.3, pan: -0.32, rev: 0.1 },
  },
  sections: {
    intro: {
      bars: 2,
      chords: 'Am7 | E7',
      parts: {
        conga: CONGAS,
        pizz: '1..5..8.3..5.8..|1..5..8.3.5.8.a.',
        hat: 'x.x.x.x.x.x.x.x.',
        kick: '................|x.....x.x.x.x.x.',
        snare: '................|........x.x.xXXX',
      },
    },
    A: {
      bars: 8,
      chords: 'Am7 | D9 | Am7 | D9 | Fmaj7 | E7 | Am7 | E7',
      parts: {
        lead: MELODY_A,
        pizz: RIFF,
        keys: KEYS_A,
        bass: BASS_A,
        kick: KICKS,
        snare: SNARES,
        hat: HATS,
        conga: CONGAS,
      },
    },
    B: {
      bars: 8,
      chords: 'Fmaj7 | G | Em7 | Am7 | Dm7 | G7 | Cmaj7 | E7',
      parts: {
        lead: `. . a5 . c6 . e6 . f6 - e6 . c6 . a5 . | b5 - - - d6 - g6 - - - d6 . b5 . g5 . |
               . . g5 . b5 . e6 . g6 - f#6 . e6 . b5 . | c6 - - - a5 - - - . . e5 . a5 . c6 . |
               d6 . f6 . a6 - f6 . d6 . . . c6 . d6 . | b5 - - - g5 . b5 . d6 - f6 - . . d6 . |
               e6 . d6 . c6 . b5 . c6 - e6 - g6 - b6 - | g#6 - - - - - - - b5 . d6 . e6 . g#6 .`,
        pizz: { loop: '1.....5.8.....5.', fill: '1..5..8.3.5.8.a.', every: 4 },
        keys: 'x...m.x.x...m...',
        bass: BASS_B,
        kick: 'x.......x..x....|x.......x.....x.',
        snare: SNARES,
        hat: 'x.x.x.x.x.x.x.xh',
        conga: '..s...x...s...x.|..s...x.s.s...x.',
      },
    },
    A2: {
      bars: 8,
      chords: 'Am7 | D9 | Am7 | D9 | Fmaj7 | E7 | Am7 | E7',
      parts: {
        lead: MELODY_A2,
        pizz: RIFF,
        keys: { loop: KEYS_A, fill: 'x.x.m.x.x.x.m.x.', every: 4 },
        bass: BASS_A,
        kick: KICKS,
        snare: SNARES,
        hat: HATS,
        conga: CONGAS,
      },
    },
    brk: {
      bars: 4,
      chords: 'Am7 | D9 | Fmaj7 | E7',
      parts: {
        conga: '..s.l.x...s.m.x.|..s.l.x.s.s.l.x.|..s.l.x...s.m.x.|s.s.l.l.x.x.m.m.',
        pizz: RIFF,
        bass: '1...............|1...............|1...............|1.......5...a...',
        hat: '..x...x...x...x.',
        lead: `. . . . . . . . e6 . . . a5 . . . | . . . . . . . . f#6 . . . d6 . . . |
               . . . . . . . . c6 . . . a5 . . . | b5 . . . g#5 . . . e5 . . . . . . .`,
        snare: { loop: '................', fill: '....x...x.x.xXXX', every: 4 },
        kick: { loop: '................', fill: 'x.......x.......', every: 4 },
      },
    },
  },
  form: ['intro', 'A', 'B', 'A2', 'brk'],
  loopFrom: 1,
};
