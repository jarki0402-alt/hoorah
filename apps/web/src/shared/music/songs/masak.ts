/**
 * "Dapur Riang" (happy kitchen): Jago Masak with Chef Mangga.
 * Light keroncong-inspired kitchen swing in F major, 112 bpm. Interlocking ukulele "cak"
 * strums and high "cuk" chops (Karplus–Strong), pizzicato cello bass with a kendang-like
 * lilt, a playful flute melody, brushes and a little kitchen-timer bell.
 * Form: intro(4) → A(8) → B(8) → A2(8) → bridge(4), looping to A (28 bars ≈ 60 s).
 */

import { BRUSH, CUK, FLUTE, GLOCK, PIZZ, SHAKER, UKULELE } from '../presets';
import type { Song } from '../synth';

const CAK = '..x.u.x...x.u.x.';
const CUK_PATTERN = '.m.m...m.m.m...m';
const CELLO = '1...5..1.5..1.8.|1...5..1.5..8.a.';
const BRUSHES = 's...x...s...x...';
const SHAKE = 'x.o.x.o.x.o.x.o.';

const FLUTE_A = `c5 - f5 - a5 - - - g5 - f5 - a5 - c6 - | d6 - - - c6 - a5 - f5 - - - . . . . |
  bb5 - - - a5 - g5 - e5 - - - g5 - bb5 - | a5 - - - - - - - . . c5 - d5 - e5 - |
  f5 - - - d5 - f5 - bb5 - - - a5 - g5 - | g5 - - - f5 - - - db5 - - - - - . . |
  c5 - f5 - a5 - c6 - bb5 - - - g5 - e5 - | f5 - - - - - - - . . . . . . . .`;

export const masak: Song = {
  id: 'masak',
  title: 'Dapur Riang',
  bpm: 112,
  swing: 0.14,
  gain: 0.85,
  inst: {
    flute: { ...FLUTE, level: 0.24, pan: 0.08, rev: 0.25, range: [65, 93] },
    cak: { ...UKULELE, level: 0.36, pan: -0.3, rev: 0.12, gate: 0.85 },
    cuk: { ...CUK, level: 0.5, pan: 0.32, rev: 0.12, gate: 0.7 },
    cello: { ...PIZZ, level: 0.62, rev: 0.1, range: [36, 60], gate: 4, poly: 5 },
    brush: { ...BRUSH, level: 0.31, pan: -0.1, rev: 0.08 },
    shk: { ...SHAKER, level: 0.25, pan: 0.25 },
    bell: { ...GLOCK, level: 0.07, pan: 0.4, rev: 0.3 },
  },
  sections: {
    intro: {
      bars: 4,
      chords: 'F | Dm | Gm7 C7 | F',
      parts: {
        flute: `. . . . . . . . c6 - a5 - f5 - a5 - | d6 - - - - - - - . . . . a5 - f5 - |
                g5 - - - bb5 - - - e5 - - - g5 - - - | f5 - - - - - - - . . . . . . . .`,
        cak: CAK,
        cello: '1.......1.......|1.......1.......|1.......1.......|1.......5...a...',
        shk: SHAKE,
      },
    },
    A: {
      bars: 8,
      chords: 'F | Dm | Gm7 C7 | F | Bb | Bbm6 | F C7 | F',
      parts: {
        flute: FLUTE_A,
        cak: CAK,
        cuk: CUK_PATTERN,
        cello: CELLO,
        brush: BRUSHES,
        shk: SHAKE,
      },
    },
    B: {
      bars: 8,
      chords: 'F7 | Bb | G7 | C7 | Am7 | D7 | Gm7 C7 | F',
      parts: {
        flute: `a5 - - - c6 - - - eb6 - - - c6 - - - | d6 - - - bb5 - - - f5 - - - . . . . |
                b5 - - - d6 - - - f6 - - - d6 - b5 - | c6 - - - - - - - . . e5 - g5 - bb5 - |
                a5 - - - c6 - - - e6 - - - c6 - - - | d6 - - - - - c6 - a5 - f#5 - . . . . |
                g5 - bb5 - d6 - - - c6 - bb5 - g5 - e5 - | f5 - - - a5 - c6 - f6 - - - . . . .`,
        cak: CAK,
        cuk: CUK_PATTERN,
        cello: CELLO,
        brush: BRUSHES,
        shk: SHAKE,
        bell: { loop: '................', fill: '. . . . . . . . c7 - a6 - f6 - - -', every: 8 },
      },
    },
    A2: {
      bars: 8,
      chords: 'F | Dm | Gm7 C7 | F | Bb | Bbm6 | F C7 | F',
      parts: {
        flute: `c5 - f5 - a5 - - - g5 - f5 - a5 - c6 - | d6 - - - f6 - d6 - c6 - - - . . . . |
                bb5 - - - a5 - g5 - e5 - - - g5 - bb5 - | a5 - - - - - - - . . a5 - bb5 - b5 - |
                c6 - - - bb5 - a5 - d6 - - - c6 - bb5 - | bb5 - - - g5 - - - f5 - - - db6 - - - |
                c6 - a5 - f5 - c6 - bb5 - - - g5 - e5 - | f5 - - - - - - - . . . . . . . .`,
        cak: CAK,
        cuk: CUK_PATTERN,
        cello: CELLO,
        brush: BRUSHES,
        shk: SHAKE,
        bell: { loop: '................', fill: '. . . . . . . . a6 - f6 - c6 - - -', every: 8 },
      },
    },
    bridge: {
      bars: 4,
      chords: 'Dm | A7 | Gm7 | C7',
      parts: {
        flute: `a5 - - - f5 - - - d5 - - - f5 - a5 - | c#6 - - - - - a5 - g5 - - - e5 - - - |
                f5 - - - g5 - - - bb5 - - - d6 - - - | c6 - - - bb5 - - - g5 - - - e5 - - -`,
        cak: 'x...x...x...x...',
        cuk: '..m...m...m...m.',
        cello: '1.......5.......|1.......5.......|1.......5.......|1.......5...a...',
        brush: BRUSHES,
      },
    },
  },
  form: ['intro', 'A', 'B', 'A2', 'bridge'],
  loopFrom: 1,
};
