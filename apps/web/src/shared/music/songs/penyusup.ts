/**
 * "Bisik-Bisik" (whispers): Penyusup, a black stage under one spotlight.
 * A sly spy-lounge groove in D minor, 96 bpm with a light swing. Pizzicato bass and brushes are
 * always on; adaptive layers join as suspicion grows: vibes comp and a soft kick (tier 1, clue
 * turns), a muted trumpet tune and hats (tier 2, voting), brass stabs and tom fills (tier 3,
 * the reveal).
 * Form: intro(2) → A(8) → B(8) → break(4), looping to A (20 bars ≈ 50 s).
 */

import { BRASS, BRUSH, HAT, KICK, PAD, PIZZ, TOMS, TRUMPET, VIBES } from '../presets';
import type { Song } from '../synth';

const BASS = { loop: '1..1..5.8..5.a..', fill: '1..1..5.8.5.3.a.', every: 4 };
const BRUSHES = 's...x.s.s...x.s.';
const KICKS = 'x.......x..x....';
const HATS = '..x...x...x...x.';
const COMP = 'x.....x...x.....';
const STABS = 'x.....x.........';
const FILLS = { loop: '................', fill: '..........h.x.l.', every: 4 };
const GLUE = 'x-------x-------';

export const penyusup: Song = {
  id: 'penyusup',
  title: 'Bisik-Bisik',
  bpm: 96,
  swing: 0.1,
  gain: 0.86,
  inst: {
    bass: { ...PIZZ, level: 0.3, range: [36, 58] },
    brush: { ...BRUSH, level: 0.26, pan: 0.18 },
    pad: { ...PAD, level: 0.07, rev: 0.3 },
    vibes: { ...VIBES, level: 0.15, pan: -0.25, rev: 0.32, tier: 1 },
    kick: { ...KICK, level: 0.24, tier: 1 },
    lead: { ...TRUMPET, level: 0.13, pan: 0.12, rev: 0.28, range: [60, 88], tier: 2 },
    hat: { ...HAT, level: 0.16, pan: -0.3, tier: 2 },
    brass: { ...BRASS, level: 0.12, pan: 0.2, rev: 0.22, tier: 3 },
    toms: { ...TOMS, level: 0.2, pan: -0.1, tier: 3 },
  },
  sections: {
    intro: {
      bars: 2,
      chords: 'Dm | A7',
      parts: {
        bass: '1..1..5.8..5.a..|1.....5.....a...',
        brush: BRUSHES,
        vibes: COMP,
      },
    },
    A: {
      bars: 8,
      chords: 'Dm | Dm | Bb | A7 | Dm | Gm | Bb A7 | Dm',
      parts: {
        bass: BASS,
        brush: BRUSHES,
        pad: GLUE,
        vibes: COMP,
        kick: KICKS,
        hat: HATS,
        brass: STABS,
        toms: FILLS,
        lead: `d5 - - . f5 - a5 - . . g5 f5 e5 - d5 - | a4 - - - - - . . . . . . . . . . |
               d5 - - . f5 - bb5 - . . a5 g5 f5 - d5 - | e5 - - - c#5 - - - a4 - - - . . . . |
               d5 - - . f5 - a5 - . . c6 bb5 a5 - g5 - | g5 - - - bb4 - d5 - g5 - - - . . . . |
               f5 - - . d5 - bb4 - e5 - - . c#5 - a4 - | d5 - - - - - - - . . . . . . . .`,
      },
    },
    B: {
      bars: 8,
      chords: 'Gm | Gm | Dm | Dm | Bb | A7 | Dm | A7',
      parts: {
        bass: BASS,
        brush: BRUSHES,
        pad: GLUE,
        vibes: COMP,
        kick: KICKS,
        hat: HATS,
        brass: STABS,
        toms: FILLS,
        lead: `g5 - - . bb5 - d6 - . . c6 bb5 a5 - g5 - | d5 - - - - - . . . . . . . . . . |
               f5 - - . a5 - d6 - . . c6 a5 f5 - d5 - | a4 - - - - - . . . . . . . . . . |
               bb4 - d5 - f5 - bb5 - a5 - g5 - f5 - d5 - | e5 - - - g5 - - - c#5 - - - e5 - - - |
               d5 - f5 - a5 - - - . . . . . . . . | a4 - - - c#5 - e5 - g5 - - - . . . .`,
      },
    },
    break: {
      bars: 4,
      chords: 'Bb | Gm | Eb | A7',
      parts: {
        bass: '1.....5.1.....a.',
        brush: BRUSHES,
        pad: GLUE,
        vibes: COMP,
        kick: KICKS,
        hat: HATS,
        brass: STABS,
        toms: FILLS,
        lead: `bb5 - - - a5 - g5 - f5 - - - . . . . | g5 - - - f5 - e5 - d5 - - - . . . . |
               eb5 - - - g5 - bb5 - c6 - - - bb5 - - - | a5 - - - c#5 - e5 - a5 - - - . . . .`,
      },
    },
  },
  form: ['intro', 'A', 'B', 'break'],
  loopFrom: 1,
};
