/**
 * "Langkah Pelan" (slow move): Catur. Calm and thoughtful so players can think, 78 bpm with a
 * light swing in D minor. Warm electric piano holding long chords, a sparse vibraphone line
 * that leaves room between phrases, round bass on roots, brushes and a soft rim tick.
 * Form: intro(2) → A(8) → B(8) → C(8), looping to A (24 bars ≈ 74 s).
 */

import { BASS_ROUND, BRUSH, EPIANO, PAD, RIM, VIBES } from '../presets';
import type { Song } from '../synth';

const COMP = {
  loop: `x - - - - - - - - - - - x - - - | - - - - - - x - - - - - - - - -`,
  fill: `x - - - - - - - - - x - - - n -`,
};
const BASS = `1 - - - - - - - v - - - - - - - | 1 - - - - - - - 5 - - - - - a -`;
const BRUSHES = 's.......x.......';
const TICK = '....x.......x...|....x.......x.x.';

export const catur: Song = {
  id: 'catur',
  title: 'Langkah Pelan',
  bpm: 78,
  swing: 0.08,
  gain: 0.9,
  delay: { beats: 0.75, feedback: 0.3, tone: 1900 },
  inst: {
    ep: { ...EPIANO, level: 0.15, pan: -0.15, rev: 0.32, voices: 4 },
    vib: {
      ...VIBES,
      level: 0.26,
      pan: 0.18,
      rev: 0.4,
      dly: 0.2,
      range: [62, 86],
      trem: { rate: 4.6, depth: 0.25 },
    },
    bass: { ...BASS_ROUND, level: 0.19, range: [38, 60] },
    pad: { ...PAD, level: 0.04, rev: 0.45, range: [57, 74], poly: 10 },
    brush: { ...BRUSH, level: 0.22, pan: -0.1, rev: 0.1 },
    rim: { ...RIM, level: 0.16, pan: 0.3, rev: 0.15 },
  },
  sections: {
    intro: {
      bars: 2,
      chords: 'Dm9 | Bbmaj7 A7sus4',
      parts: {
        ep: `x - - - - - - - - - - - - - - - | x - - - - - - - x - - - - - - -`,
        vib: `. . . . . . . . a4 - d5 - e5 - - - | f5 - - - - - - - e5 - - - . . . .`,
        bass: `1 - - - - - - - - - - - - - - - | 1 - - - - - - - 1 - - - - - - -`,
      },
    },
    A: {
      bars: 8,
      chords: 'Dm9 | Gm9 | Bbmaj7 | A7sus4 A7 | Dm9 | Gm9 | Ebmaj7 | A7sus4 A7',
      parts: {
        ep: COMP,
        vib: `a4 - - - . . d5 - e5 - f5 - - - - - | e5 - d5 - - - - - bb4 - - - . . . . |
              . . d5 - f5 - a5 - - - - - g5 - f5 - | e5 - - - - - d5 - c#5 - - - - - . . |
              . . a4 - d5 - f5 - a5 - - - g5 - - - | f5 - - - e5 - d5 - - - - - bb4 - - - |
              . . g5 - bb5 - - - a5 - g5 - - - - - | e5 - - - - - - - c#5 - e5 - . . . .`,
        bass: BASS,
        brush: BRUSHES,
        rim: TICK,
      },
    },
    B: {
      bars: 8,
      chords: 'Bbmaj7 | Fmaj7 | Gm9 | Dm9 | Bbmaj7 | F/A | Gm9 | A7sus4 A7',
      parts: {
        ep: COMP,
        vib: `d6 - - - - - c6 - a5 - - - f5 - - - | e5 - - - - - - - . . c5 - f5 - a5 - |
              bb5 - - - a5 - g5 - - - - - d5 - - - | f5 - - - e5 - - - d5 - - - . . . . |
              . . f5 - bb5 - d6 - - - c6 - bb5 - - - | a5 - - - g5 - f5 - - - - - c5 - - - |
              d5 - - - g5 - bb5 - a5 - - - g5 - - - | e5 - - - - - - - - - - - . . . .`,
        bass: BASS,
        pad: 'x---------------',
        brush: BRUSHES,
        rim: TICK,
      },
    },
    C: {
      bars: 8,
      chords: 'Gm9 | C13 | Fmaj9 | Bbmaj7 | Em7b5 | A7 | Dm9 | A7sus4',
      parts: {
        ep: {
          loop: `x - - - - - - - - - - - - - - - | - - - - - - - - x - - - - - - -`,
        },
        vib: `. . . . bb4 - d5 - f5 - - - - - . . | e5 - - - - - - - d5 - - - . . . . |
              . . . . a4 - c5 - e5 - - - g5 - - - | f5 - - - - - - - d5 - - - . . . . |
              . . . . g5 - - - bb5 - - - - - . . | a5 - - - g5 - - - e5 - - - c#5 - - - |
              d5 - - - - - - - - - - - . . . . | . . . . . . . . e5 - - - a4 - - -`,
        bass: `1 - - - - - - - - - - - - - - - | 1 - - - - - - - v - - - - - - -`,
        pad: 'x-------x-------',
        brush: 's...............',
      },
    },
  },
  form: ['intro', 'A', 'B', 'C'],
  loopFrom: 1,
};
