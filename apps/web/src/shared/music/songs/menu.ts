/**
 * "Teras Sore" (porch at dusk): Hoorah home and lobby.
 * Lounge bossa in F major, 94 bpm. FM electric piano comping with bossa anticipations, soft
 * round bass on root–fifth, brushes, cross-stick clave and a vibraphone melody.
 * Form: intro(4) → A(8) → B(8) → A2(8) → bridge(8), looping back to A (32 bars ≈ 82 s).
 */

import { BASS_ROUND, BRUSH, EPIANO, KICK, RIM, SHAKER, VIBES } from '../presets';
import type { Song } from '../synth';

const COMP = {
  loop: `- - - x - - x - - - x - x - - - | - - x - - x - - x - - x - - n -`,
  fill: `x - - x - - x - x - - x - - n -`,
};
const BASS = `1 - - - - - v - v - - - - - a - | 1 - - - - - v - 1 - - - - - v -`;
const KICKS = 'x.....o.x.....o.';
const CLAVE = { loop: 'x.....x.....x...|....x.....x.....', fill: '....x.....x..xxx', every: 8 };
const SHK = 'xoxoxoxoxoxoxoxo';
const BRUSHES = 's...x...s...x...';

export const menu: Song = {
  id: 'menu',
  title: 'Teras Sore',
  bpm: 94,
  swing: 0.06,
  gain: 0.84,
  delay: { beats: 0.75, feedback: 0.28, tone: 2200 },
  inst: {
    ep: { ...EPIANO, level: 0.14, pan: -0.18, rev: 0.25, voices: 3 },
    vib: { ...VIBES, level: 0.3, pan: 0.2, rev: 0.32, dly: 0.16, trem: { rate: 5.2, depth: 0.3 } },
    bass: { ...BASS_ROUND, level: 0.2, range: [38, 62] },
    kick: { ...KICK, level: 0.36 },
    rim: { ...RIM, level: 0.3, pan: 0.25, rev: 0.12 },
    brush: { ...BRUSH, level: 0.28, pan: -0.1, rev: 0.08 },
    shk: { ...SHAKER, level: 0.24, pan: 0.35 },
  },
  sections: {
    intro: {
      bars: 4,
      chords: 'Gm9 | C13 | Gm9 | C7b9',
      parts: {
        ep: COMP,
        vib: `. . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . . |
              . . . . . . . . . . . . . . . . | . . . . . . . . e5 - g5 - bb5 - - -`,
        bass: `. . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . . |
               1 - - - - - v - v - - - - - a - | 1 - - - - - v - 1 - - - - - v -`,
        rim: CLAVE,
        shk: SHK,
      },
    },
    A: {
      bars: 8,
      chords: 'Fmaj9 | Em7b5 A7 | Dm9 | Cm9 F13 | Bbmaj9 | Bbm6 Eb9 | Am7 D7b9 | Gm9 C13',
      parts: {
        ep: COMP,
        vib: `. . e5 - g5 - a5 - - - - - . . . . | g5 - - bb5 - - a5 - - - g5 - e5 - . . |
              f5 - - - - - e5 - - - - - . . . . | . . eb5 - - - d5 - eb5 - - - d5 - c5 - |
              d5 - - - - - c5 - d5 - f5 - a5 - - - | - - g5 - f5 - db5 - - - - - f5 - - - |
              e5 - - - g5 - - - f#5 - - - eb5 - - - | d5 - - - f5 - a5 - - - g5 - . . . .`,
        bass: BASS,
        kick: KICKS,
        rim: CLAVE,
        brush: BRUSHES,
        shk: SHK,
      },
    },
    B: {
      bars: 8,
      chords: 'Bbmaj9 | Am7 | Gm9 | Fmaj9 | Ebmaj9 | Dm9 | Gm9 | C7sus4 C7b9',
      parts: {
        ep: COMP,
        vib: `. . d5 - f5 - a5 - c6 - - - - - a5 - | g5 - - - - - e5 - - - . . . . . . |
              . . bb4 - d5 - f5 - a5 - - - - - f5 - | e5 - - - - - c5 - - - . . . . . . |
              . . g5 - bb5 - d6 - - - c6 - bb5 - g5 - | a5 - - - - - f5 - e5 - - - - - . . |
              . . d5 - f5 - bb5 - a5 - - - g5 - f5 - | f5 - - - - - - - e5 - - - g5 - - -`,
        bass: BASS,
        kick: KICKS,
        rim: CLAVE,
        brush: BRUSHES,
        shk: SHK,
      },
    },
    A2: {
      bars: 8,
      chords: 'Fmaj9 | Em7b5 A7 | Dm9 | Cm9 F13 | Bbmaj9 | Bbm6 Eb9 | Am7 D7b9 | Gm9 C13',
      parts: {
        ep: COMP,
        vib: `. . e5 - g5 - a5 - - - c6 - a5 - - - | g5 - - bb5 - - a5 - - - g5 - e5 - c#5 - |
              d5 - - - f5 - a5 - - - e5 - - - . . | . . eb5 - - - d5 - eb5 - - - d5 - c5 - |
              d5 - - - c5 - d5 - f5 - a5 - c6 - - - | bb5 - - - g5 - f5 - db5 - - - - - . . |
              c5 - - - e5 - g5 - f#5 - - - a5 - c6 - | bb5 - - - a5 - - - g5 - - - e5 - . .`,
        bass: BASS,
        kick: KICKS,
        rim: CLAVE,
        brush: BRUSHES,
        shk: SHK,
      },
    },
    bridge: {
      bars: 8,
      chords: 'Dbmaj7 | Cm7 F7 | Bbmaj7 | Bbm6 | Am7 | D7b9 | Gm9 | C7sus4 C7b9',
      parts: {
        ep: {
          loop: `x - - - - - - - - - x - - - - - | - - - - x - - - x - - - - - n -`,
          fill: `x - - - - - - - x - - - - - n -`,
        },
        vib: `f5 - - - - - - - ab5 - - - c6 - - - | bb5 - - - - - g5 - a5 - - - - - . . |
              . . f5 - a5 - d6 - - - - - c6 - - - | db6 - - - - - bb5 - - - - - g5 - f5 - |
              e5 - - - - - - - g5 - - - c6 - - - | - - - - - - a5 - f#5 - - - eb5 - - - |
              d5 - - - f5 - a5 - - - - - bb5 - a5 - | f5 - - - - - - - e5 - - - . . . .`,
        bass: `1 - - - - - - - v - - - - - a - | 1 - - - - - - - 1 - - - - - v -`,
        kick: 'x.......x.......',
        brush: BRUSHES,
        shk: SHK,
      },
    },
  },
  form: ['intro', 'A', 'B', 'A2', 'bridge'],
  loopFrom: 1,
};
