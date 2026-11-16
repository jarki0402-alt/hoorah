/**
 * "Tik Tok Mikir" (tick tock, thinking): Sambung Kata. A light, curious thinking loop in F major
 * at 92 bpm. A woodblock clock ticks and tocks under a staccato marimba tune that keeps asking
 * little questions, a pizzicato bass tiptoes on the beat, soft electric piano chords leave room
 * to think, and a glockenspiel answers each phrase like an idea popping up.
 * Form: intro(2) → A(8) → B(8) → C(8), looping to A (24 bars ≈ 63 s).
 */

import { EPIANO, GLOCK, KICK, MARIMBA, PIZZ, SHAKER, WOODBLOCK } from '../presets';
import type { Song } from '../synth';

const CLOCK = 'x...l...x...l...';
const COMP_A = `x - - - . . x - . . . . x - . .`;
const MELODY_A = `c5 . f5 . a5 . f5 . c6 . a5 . f5 - . . | d5 . f5 . a5 . d6 . c6 . a5 . f5 - . . |
                  bb4 . d5 . g5 . bb5 . a5 . g5 . f5 . d5 . | e5 - . . g5 - . . bb5 - - . c6 - . . |
                  c5 . f5 . a5 . f5 . c6 . a5 . f5 - . . | f5 . a5 . d6 - . . c6 . a5 . f5 - . . |
                  d5 . f5 . bb5 - . . e5 . g5 . c6 - . . | a5 - - - . . f5 . c5 . f5 - - - . .`;

export const kata: Song = {
  id: 'kata',
  title: 'Tik Tok Mikir',
  bpm: 92,
  swing: 0.06,
  gain: 0.9,
  delay: { beats: 0.75, feedback: 0.22, tone: 2200 },
  inst: {
    mar: { ...MARIMBA, level: 0.27, pan: -0.1, rev: 0.2, dly: 0.12, range: [60, 84] },
    glock: { ...GLOCK, level: 0.13, pan: 0.3, rev: 0.34, dly: 0.25, range: [72, 98] },
    ep: { ...EPIANO, level: 0.11, pan: 0.16, rev: 0.28, voices: 4 },
    pizz: { ...PIZZ, level: 0.32, pan: 0.04, range: [36, 60] },
    wood: { ...WOODBLOCK, level: 0.2, pan: -0.3, rev: 0.08 },
    shk: { ...SHAKER, level: 0.14, pan: 0.34 },
    kick: { ...KICK, level: 0.24 },
  },
  sections: {
    intro: {
      bars: 2,
      chords: 'F | C7',
      parts: {
        wood: 'x...l...x...l...|x...l...x.l.x.l.',
        ep: `x - - - - - - - - - - - - - - - | x - - - - - - - x - - - . . . .`,
        pizz: `1 . . . . . . . . . . . . . . . | 1 . . . . . . . 5 . . . v . . .`,
        glock: `. . . . . . . . . . . . . . . . | . . . . . . . . c7 . bb6 . g6 . e6 .`,
      },
    },
    A: {
      bars: 8,
      chords: 'F | Dm | Gm7 | C7 | F | Dm | Bb C7 | F',
      parts: {
        mar: MELODY_A,
        glock: { loop: '................', fill: `. . . . . . . . c7 . a6 . f6 . c6 .`, every: 4 },
        ep: COMP_A,
        pizz: `1 . . 5 . . 8 . . 5 . . 1 . 5 .`,
        wood: CLOCK,
        shk: '..x...x...x...x.',
        kick: 'x.......x.......',
      },
    },
    B: {
      bars: 8,
      chords: 'Bb | C | Am7 | Dm | Gm7 | C7 | Am7 Dm | Gm7 C7',
      parts: {
        mar: `d6 - . . bb5 . f5 . d5 . f5 . bb5 - . . | c6 - . . g5 . e5 . c5 . e5 . g5 - . . |
              c6 . a5 . e5 . a5 . g5 - . . e5 - . . | f5 - - - a5 - - - d5 - - - . . . . |
              bb5 . a5 . g5 . f5 . d5 . f5 . g5 - . . | e5 . g5 . bb5 . c6 . bb5 . g5 . e5 - . . |
              c6 - a5 - e5 - . . d6 - a5 - f5 - . . | g5 - - - bb5 - - - c6 - - - . . . .`,
        glock: { loop: `. . . . . . . . . . . . . . . . | . . . . . . . . f6 . e6 . c6 . . .` },
        ep: `x - - - - - . . x - - - - - . .`,
        pizz: `1 . . . 5 . . . 1 . . . 3 . 5 .`,
        wood: CLOCK,
        shk: 'x.x.x.x.x.x.x.x.',
        kick: 'x.....x.x.......',
      },
    },
    C: {
      bars: 8,
      chords: 'Dm | Bb | F | C | Dm | Bb | Gm7 | C7',
      parts: {
        mar: `a5 . . . a5 . . . f5 . d5 . . . . . | bb5 . . . bb5 . . . f5 . d5 . . . . . |
              c6 . . . a5 . . . c6 . f5 . . . . . | e5 - - - g5 - - - c5 - - - . . . . |
              a5 . . . a5 . . . f5 . d5 . . . . . | bb5 . . . d6 . . . bb5 . f5 . . . . . |
              g5 . bb5 . d6 . bb5 . g5 . f5 . d5 . . . | e5 - g5 - bb5 - c6 - - - - - . . . .`,
        glock: { loop: `. . . . . . . . . . . . a6 . f6 . | . . . . . . . . . . . . d6 . f6 .` },
        ep: `x - - - - - - - - - - - - - - -`,
        pizz: `1 . . . . . . . 5 . . . . . . .`,
        wood: 'x.......l.......',
        kick: 'x...............',
      },
    },
  },
  form: ['intro', 'A', 'B', 'C'],
  loopFrom: 1,
};
