/**
 * "Tepi Jurang" (edge of the abyss): Langkah Maut, one wrong step and you fall. A dark, driving
 * thriller pulse in E minor, 116 bpm. A low pad and a saw bass throb like a heartbeat; a synth
 * pluck ticks the steps, vibraphone carries a wary tune, brass stabs hit the turns, and toms with
 * tambourine storm in when the tempo is at its fastest.
 * Adaptive layers: tier 0 pad + bass (cards, setup), tier 1 pluck, kick and hats (a babak plays),
 * tier 2 vibraphone, clap and brass (the tempo climbs), tier 3 toms and tambourine (top speed,
 * the final babak).
 * Form: intro(2) → A(8) → B(8) → C(8), looping to A (24 bars ≈ 50 s).
 */

import { BASS_SAW, BRASS, CLAP, HAT, KICK, PAD, SYNTH_PLUCK, TAMBOURINE, TOMS, VIBES } from '../presets';
import type { Song } from '../synth';

const PADS = 'x...............';
const HEART = { loop: '1..1....1..1....', fill: '1..1....1.1.1.1.', every: 4 };
const STEPS = { loop: '1.5.8.5.1.5.8.5.', fill: '8.5.1.5.8.5.1.5.', every: 4 };
const KICKS = 'x..x....x..x....';
const HATS = '..x...x...x...x.';
const CLAPS = '....x.......x...';
const STABS = { loop: 'x.......x.......', fill: 'x.....x.....x.x.', every: 4 };
const ROLLS = { loop: '................', fill: 'h.h.x.x.l.l.lxlx', every: 4 };
const TAMB = '..x...x...x...x.';

const TUNE_A = `e5 - - . g5 . b5 . a5 - - . g5 . e5 . | f#5 - - . e5 . d5 . b4 - - - - - - . |
                e5 - - . g5 . c6 . b5 - - . a5 . g5 . | a5 - - - f#5 - - . d#5 - - - - - - . |
                e5 - - . b5 . e6 . d6 - - . b5 . g5 . | c6 - - . b5 . a5 . f#5 - - . a5 . c6 . |
                b5 - - . g5 . e5 . f#5 - - . d#5 . b4 . | e5 - - - - - - . . . . . b4 . e5 .`;

const TUNE_B = `a4 . c5 . e5 - - . c5 . a4 . e5 - - . | g4 . b4 . e5 - - . b4 . g4 . e5 - - . |
                c5 . e5 . a5 . c6 . b5 . a5 . e5 . c5 . | b4 - - . d#5 . f#5 . b5 - - - - - - . |
                a5 . c6 . e6 - - . c6 . a5 . e5 - - . | g5 . b5 . e6 - - . b5 . g5 . e5 - - . |
                c6 . a5 . e5 . a5 . b5 . g5 . e5 . g5 . | f#5 - - - b5 - - - d#6 - - - - - - .`;

export const langkah: Song = {
  id: 'langkah',
  title: 'Tepi Jurang',
  bpm: 116,
  gain: 0.9,
  delay: { beats: 0.75, feedback: 0.34, tone: 2400 },
  inst: {
    pad: { ...PAD, level: 0.17, rev: 0.45 },
    bass: { ...BASS_SAW, level: 0.24 },
    pluck: { ...SYNTH_PLUCK, level: 0.13, pan: 0.26, dly: 0.28, tier: 1 },
    lead: { ...VIBES, level: 0.2, pan: -0.12, rev: 0.3, range: [55, 90], tier: 2 },
    brass: { ...BRASS, level: 0.13, pan: 0.1, rev: 0.2, tier: 2 },
    kick: { ...KICK, level: 0.38, tier: 1 },
    hat: { ...HAT, level: 0.16, pan: 0.3, tier: 1 },
    clap: { ...CLAP, level: 0.15, rev: 0.18, tier: 2 },
    toms: { ...TOMS, level: 0.26, pan: -0.2, rev: 0.15, tier: 3 },
    tamb: { ...TAMBOURINE, level: 0.11, pan: -0.3, tier: 3 },
  },
  sections: {
    intro: {
      bars: 2,
      chords: 'Em | B',
      parts: { pad: PADS, bass: '1.......1.......|1..1....1.1.1.1.' },
    },
    A: {
      bars: 8,
      chords: 'Em | Bm | C | B | Em | Am | B | Em',
      parts: {
        pad: PADS,
        bass: HEART,
        pluck: STEPS,
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
      chords: 'Am | Em | Am | B | Am | Em | C | B',
      parts: {
        pad: PADS,
        bass: { loop: '1.1.1.1.1.1.1.1.', fill: '1.1.1.1.5.5.8.8.', every: 4 },
        pluck: { loop: '1.5.8.5.1.5.8.5.', fill: '1.3.5.8.1.3.5.8.', every: 2 },
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
      chords: 'C | D | Bm | Em | C | D | B | B',
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
