/**
 * "Lampu Panggung" (stage lights): Lantai Runtuh, a quiz show stage at night where the floor gives
 * way. Suspense game-show groove in A minor, 101 bpm. A warm pad and a pulsing saw bass hold the
 * tension; a synth pluck ticks like a clock, vibraphone carries the tune, brass stabs announce,
 * and toms with tambourine roll in for the climax.
 * Adaptive layers: tier 0 pad + bass (rule cards, scores), tier 1 pluck, kick and hats (a round
 * plays), tier 2 vibraphone, clap and brass (a call is on), tier 3 toms and tambourine (the
 * final calls and the dark round).
 * Form: intro(2) → A(8) → B(8) → C(8), looping to A (24 bars ≈ 57 s).
 */

import { BASS_SAW, BRASS, CLAP, HAT, KICK, PAD, SYNTH_PLUCK, TAMBOURINE, TOMS, VIBES } from '../presets';
import type { Song } from '../synth';

const PADS = 'x...............';
const PULSE = { loop: '1.1.1.1.1.1.1.1.', fill: '1.1.1.1.1.5.8.5.', every: 4 };
const TICKS = { loop: '1...5...8...5...', fill: '1.5.8.5.1.5.8.5.', every: 4 };
const KICKS = 'x.......x.......';
const HATS = '..x...x...x...x.';
const CLAPS = '....x.......x...';
const STABS = { loop: 'x...........x...', fill: 'x.....x.....x.x.', every: 4 };
const ROLLS = { loop: '................', fill: 'h.h.x.x.l.l.lxlx', every: 4 };
const TAMB = '..x...x...x...x.';

const TUNE_A = `a4 - - . c5 . e5 . a5 - - . g5 . e5 . | f5 - - . e5 . c5 . a4 - - . c5 . f5 . |
                e5 - - . g5 . c6 . b5 - - . g5 . e5 . | d5 - - - g5 - - . b5 - - . d6 - - . |
                c6 - - . b5 . a5 . e5 - - . a5 . c6 . | a5 - - . f5 . c5 . f5 - - . a5 . c6 . |
                b5 - - . g#5 . e5 . g#5 - - . b5 . d6 . | e6 - - - - - - - . . . . b5 . g#5 .`;

const TUNE_B = `d5 . f5 . a5 - - . f5 . d5 . a4 - - . | c5 . e5 . a5 - - . e5 . c5 . a4 - - . |
                c5 . f5 . a5 . c6 . a5 . f5 . c5 . a4 . | b4 - - . e5 . g#5 . b5 - - - - - - . |
                f5 . a5 . d6 - - . a5 . f5 . d5 - - . | e5 . a5 . c6 - - . a5 . e5 . c5 - - . |
                f5 . a5 . c6 . f6 . e6 . c6 . a5 . f5 . | g#5 - - - b5 - - - e6 - - - - - - .`;

export const runtuh: Song = {
  id: 'runtuh',
  title: 'Lampu Panggung',
  bpm: 101,
  gain: 0.9,
  delay: { beats: 0.75, feedback: 0.3, tone: 2600 },
  inst: {
    pad: { ...PAD, level: 0.16, rev: 0.35 },
    bass: { ...BASS_SAW, level: 0.22 },
    pluck: { ...SYNTH_PLUCK, level: 0.14, pan: 0.26, dly: 0.25, tier: 1 },
    lead: { ...VIBES, level: 0.22, pan: -0.12, rev: 0.25, range: [57, 90], tier: 2 },
    brass: { ...BRASS, level: 0.14, pan: 0.1, rev: 0.18, tier: 2 },
    kick: { ...KICK, level: 0.36, tier: 1 },
    hat: { ...HAT, level: 0.18, pan: 0.3, tier: 1 },
    clap: { ...CLAP, level: 0.16, rev: 0.15, tier: 2 },
    toms: { ...TOMS, level: 0.26, pan: -0.2, rev: 0.12, tier: 3 },
    tamb: { ...TAMBOURINE, level: 0.12, pan: -0.3, tier: 3 },
  },
  sections: {
    intro: {
      bars: 2,
      chords: 'Am | E',
      parts: { pad: PADS, bass: '1.......1.......|1.1.1.1.1.1.1.1.' },
    },
    A: {
      bars: 8,
      chords: 'Am | F | C | G | Am | F | E | E',
      parts: {
        pad: PADS,
        bass: PULSE,
        pluck: TICKS,
        lead: TUNE_A,
        brass: STABS,
        kick: KICKS,
        hat: HATS,
        clap: CLAPS,
        toms: ROLLS,
        tamb: TAMB,
      },
    },
    B: {
      bars: 8,
      chords: 'Dm | Am | F | E | Dm | Am | F | E',
      parts: {
        pad: PADS,
        bass: PULSE,
        pluck: { loop: '1.5.8.5.1.5.8.5.', fill: '8.5.1.5.8.5.1.5.', every: 2 },
        lead: TUNE_B,
        brass: { loop: 'x.......x.......', fill: 'x...x...x.x.x.x.', every: 4 },
        kick: { loop: 'x...x...x...x...', fill: 'x...x...x.x.x.x.', every: 4 },
        hat: 'x.x.x.x.x.x.x.x.',
        clap: CLAPS,
        toms: ROLLS,
        tamb: 'x.x.x.x.x.x.x.x.',
      },
    },
    C: {
      bars: 8,
      chords: 'F | G | Em | Am | F | G | E | E',
      parts: {
        pad: 'x.......x.......',
        bass: '1...1...1...1...',
        pluck: { loop: '8.5.3.5.8.5.3.5.', fill: '1.3.5.8.1.3.5.8.', every: 4 },
        brass: { loop: 'x...............', fill: 'x.x.x.x.x...x...', every: 8 },
        kick: KICKS,
        hat: '....x.......x...',
        clap: { loop: '................', fill: '....x.......x.xx', every: 4 },
        toms: { loop: '................', fill: 'h.x.l.h.x.l.hxlx', every: 4 },
        tamb: TAMB,
      },
    },
  },
  form: ['intro', 'A', 'B', 'C'],
  loopFrom: 1,
};
