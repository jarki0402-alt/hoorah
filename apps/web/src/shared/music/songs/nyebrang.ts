/**
 * "Lompat Lompat" (hop hop): Nyebrang, a sunny crossing in pixel land.
 * Bouncy chip-pop in F major, 132 bpm, straight. A saw bass and kick always run; adaptive layers
 * join as the camera speeds up: hats and square plucks (tier 1, the run starts), the xylophone
 * tune and snare (tier 2, faster camera or half the field out), claps (tier 3, final ronde,
 * last seconds, last two standing).
 * Form: intro(2) → A(8) → B(8) → A(8) → C(8), looping to A (34 bars ≈ 62 s).
 */

import { BASS_SAW, CLAP, HAT, KICK, SNARE, SYNTH_PLUCK, XYLO } from '../presets';
import type { Song } from '../synth';

const BASS = { loop: '1.1.5.1.1.1.5.8.', fill: '1.1.5.1.5.3.2.a.', every: 4 };
const KICKS = 'x...x...x...x...';
const HATS = '..x...x...x...xx';
const PLUCK = '..x...x...x..x..';
const SNARES = '....x.......x...';
const CLAPS = '....x.......x..x';

export const nyebrang: Song = {
  id: 'nyebrang',
  title: 'Lompat Lompat',
  bpm: 132,
  gain: 0.8,
  inst: {
    bass: { ...BASS_SAW, level: 0.2, range: [29, 50] },
    kick: { ...KICK, level: 0.3 },
    hat: { ...HAT, level: 0.14, pan: 0.25, tier: 1 },
    pluck: { ...SYNTH_PLUCK, level: 0.09, pan: -0.2, rev: 0.12, tier: 1 },
    lead: { ...XYLO, level: 0.15, pan: 0.1, rev: 0.18, range: [67, 96], tier: 2 },
    snare: { ...SNARE, level: 0.2, rev: 0.1, tier: 2 },
    clap: { ...CLAP, level: 0.14, pan: -0.05, rev: 0.12, tier: 3 },
  },
  sections: {
    intro: {
      bars: 2,
      chords: 'F | C',
      parts: { bass: BASS, kick: KICKS, pluck: PLUCK },
    },
    A: {
      bars: 8,
      chords: 'F | C | Dm | Bb C | F | C | Dm | Bb C',
      parts: {
        bass: BASS,
        kick: KICKS,
        hat: HATS,
        pluck: PLUCK,
        snare: SNARES,
        clap: CLAPS,
        lead: `f5 - a5 - c6 - a5 - f5 - g5 - a5 - - - | g5 - e5 - c5 - e5 - g5 - - - . . . . |
               a5 - f5 - d5 - f5 - a5 - c6 - d6 - - - | d6 - c6 - bb5 - a5 - g5 - - - c6 - - - |
               f5 - a5 - c6 - f6 - e6 - d6 - c6 - - - | g5 - - - c6 - - - e5 - g5 - c6 - - - |
               a5 - c6 - d6 - f6 - d6 - c6 - a5 - - - | g5 - - - - - . . c6 - e6 - f6 - - -`,
      },
    },
    B: {
      bars: 8,
      chords: 'Bb | C | Am | Dm | Bb | C | F | C',
      parts: {
        bass: BASS,
        kick: KICKS,
        hat: HATS,
        pluck: PLUCK,
        snare: SNARES,
        clap: CLAPS,
        lead: `d6 - - - bb5 - - - f5 - - - bb5 - d6 - | e6 - - - c6 - - - g5 - - - c6 - e6 - |
               c6 - - - a5 - - - e5 - - - a5 - c6 - | d6 - - - a5 - - - f5 - - - a5 - d6 - |
               f6 - - - d6 - bb5 - d6 - - - f6 - - - | e6 - - - c6 - g5 - c6 - - - e6 - - - |
               f6 - e6 - c6 - a5 - c6 - a5 - f5 - - - | g5 - - - c6 - - - e6 - - - g6 - - -`,
      },
    },
    C: {
      bars: 8,
      chords: 'Dm | Bb | F | C | Dm | Bb | Gm | C',
      parts: {
        bass: BASS,
        kick: KICKS,
        hat: HATS,
        pluck: PLUCK,
        snare: SNARES,
        clap: CLAPS,
        lead: `a5 - - - f5 - - - d5 - - - f5 - a5 - | bb5 - - - f5 - - - d5 - - - f5 - bb5 - |
               c6 - - - a5 - - - f5 - - - a5 - c6 - | e6 - - - c6 - - - g5 - - - c6 - e6 - |
               f6 - - - d6 - a5 - d6 - - - f6 - - - | d6 - - - bb5 - f5 - bb5 - - - d6 - - - |
               d6 - c6 - bb5 - g5 - bb5 - g5 - e5 - - - | g5 - - - c6 - - - e6 - - - . . . .`,
      },
    },
  },
  form: ['intro', 'A', 'B', 'A', 'C'],
  loopFrom: 1,
};
