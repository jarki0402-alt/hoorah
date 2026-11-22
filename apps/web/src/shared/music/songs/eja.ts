/**
 * "Tinta & Kertas" (ink and paper): Juara Eja, a page of cream notebook paper.
 * A light, thoughtful study tune in F major, 87 bpm. Pizzicato bass, marimba and a soft pad are
 * always on, quiet enough to think over; adaptive layers join as the words get harder: shaker
 * and claves (tier 1, Mudah), a soft kick and hats (tier 2, Sedang), a glockenspiel tune
 * (tier 3, Sulit).
 * Form: intro(2) → A(8) → B(8) → C(4), looping to A (20 bars ≈ 55 s).
 */

import { CLAVES, GLOCK, HAT, KICK, MARIMBA, PAD, PIZZ, SHAKER } from '../presets';
import type { Song } from '../synth';

const BASS = { loop: '1..1..5.8...5.3.', fill: '1..1..5.8.5.3.2.', every: 4 };
const COMP = 'x..x..x...x..x..';
const SHAKES = 'x.x.x.x.x.x.x.x.';
const CLAVE = 'x..x..x...x.x...';
const KICKS = 'x.......x.......';
const HATS = '..x...x...x...x.';
const GLUE = 'x-------x-------';

export const eja: Song = {
  id: 'eja',
  title: 'Tinta & Kertas',
  bpm: 87,
  swing: 0.06,
  gain: 0.84,
  inst: {
    bass: { ...PIZZ, level: 0.28, range: [36, 58] },
    marimba: { ...MARIMBA, level: 0.16, pan: -0.2, rev: 0.24 },
    pad: { ...PAD, level: 0.06, rev: 0.3 },
    shaker: { ...SHAKER, level: 0.12, pan: 0.3, tier: 1 },
    claves: { ...CLAVES, level: 0.1, pan: -0.32, tier: 1 },
    kick: { ...KICK, level: 0.2, tier: 2 },
    hat: { ...HAT, level: 0.12, pan: 0.22, tier: 2 },
    lead: { ...GLOCK, level: 0.1, pan: 0.12, rev: 0.32, range: [70, 92], tier: 3 },
  },
  sections: {
    intro: {
      bars: 2,
      chords: 'F | C',
      parts: {
        bass: '1.....5.....8...|1.....5.....3...',
        marimba: COMP,
      },
    },
    A: {
      bars: 8,
      chords: 'F | Dm | Bb | C | F | Am | Bb C | F',
      parts: {
        bass: BASS,
        marimba: COMP,
        pad: GLUE,
        shaker: SHAKES,
        claves: CLAVE,
        kick: KICKS,
        hat: HATS,
        lead: `a5 - - . c6 - a5 - g5 - f5 - . . . . | d5 - - - f5 - - - a5 - - - . . . . |
               bb5 - - . d6 - bb5 - a5 - g5 - . . . . | g5 - - - e5 - - - c5 - - - . . . . |
               a5 - - . c6 - f6 - e6 - c6 - . . . . | e6 - - - c6 - - - a5 - - - . . . . |
               bb5 - d6 - bb5 - . . g5 - c6 - e6 - . . | f6 - - - - - - - . . . . . . . .`,
      },
    },
    B: {
      bars: 8,
      chords: 'Bb | C | Am | Dm | Gm | C | F | C',
      parts: {
        bass: BASS,
        marimba: COMP,
        pad: GLUE,
        shaker: SHAKES,
        claves: CLAVE,
        kick: KICKS,
        hat: HATS,
        lead: `d6 - - . bb5 - f5 - . . bb5 - d6 - . . | e6 - - - c6 - g5 - . . . . . . . . |
               c6 - - . a5 - e5 - . . a5 - c6 - . . | d6 - - - a5 - f5 - . . . . . . . . |
               bb5 - - . g5 - d5 - . . g5 - bb5 - . . | c6 - - - e6 - g6 - . . . . . . . . |
               f6 - - . c6 - a5 - c6 - - - f5 - . . | e5 - - - g5 - - - c6 - - - . . . .`,
      },
    },
    C: {
      bars: 4,
      chords: 'Dm | Bb | Gm | C',
      parts: {
        bass: '1.....5.1.....5.',
        marimba: COMP,
        pad: GLUE,
        shaker: SHAKES,
        claves: CLAVE,
        kick: KICKS,
        hat: HATS,
        lead: `f5 - - - a5 - - - d6 - - - . . . . | d6 - - - bb5 - - - f5 - - - . . . . |
               g5 - - - bb5 - d6 - g6 - - - . . . . | e6 - - - c6 - - - g5 - - - e5 - - -`,
      },
    },
  },
  form: ['intro', 'A', 'B', 'C'],
  loopFrom: 1,
};
