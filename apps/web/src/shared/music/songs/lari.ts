/**
 * "Atap Kota" (city rooftops): Lari Terus.
 * A bright, driving chase in E major, 143 bpm. Punchy kick on a running pattern, backbeat snare,
 * sixteenth hats with open lifts, tambourine, a saw bass pumping eighths, a square-wave
 * arpeggio, an angklung hook that skips like feet over the roofs, brass stabs and a warm pad.
 * Form: intro(2) → A(8) → B(8) → A2(8) → drop(4), looping to A (28 bars ≈ 47 s).
 */

import {
  ANGKLUNG,
  BASS_SAW,
  BRASS,
  HAT,
  KICK_PUNCH,
  PAD,
  SNARE,
  SYNTH_PLUCK,
  TAMBOURINE,
  TOMS,
} from '../presets';
import type { Song } from '../synth';

const KICKS = { loop: 'x.....x.x.......|x.....x.x..x....', fill: 'x.....x.x.x.xxxx', every: 8 };
const SNARES = { loop: '....x.......x...', fill: '....x.......x.xx', every: 8 };
const HATS = 'x.x.x.x.x.x.x.h.';
const TAMB = '..x...x...x...x.';
const ARP = '1358531813585318';
const BASS_A = { loop: '1.1.1.1.1.1.8.1.|1.1.1.1.5.5.8.a.', fill: '1.1.1.1.8.8.5.a.', every: 8 };
const BASS_B = '1..1..1.1..1..5.|1..1..1.1.8.5.a.';

const HOOK = `b5 . . b5 . . g#5 . e5 . g#5 . b5 - - . | b5 . . b5 . . a5 . f#5 . d#5 . f#5 - - . |
              c#6 . . c#6 . . b5 . g#5 . e5 . g#5 - - . | a5 . . g#5 . . f#5 . e5 . c#5 . e5 - - . |
              b5 . . b5 . . g#5 . e5 . g#5 . b5 - - . | b5 . . b5 . . a5 . f#5 . d#5 . f#5 - - . |
              e6 . . e6 . . c#6 . b5 . a5 . c#6 - b5 . | f#5 - - - - - - . d#5 . f#5 . b5 - - .`;

const LINE_B = `c#6 - - - b5 - a5 - b5 - - - . . e5 . | d#6 - - - c#6 - b5 - f#5 - - - . . . . |
                b5 - - - d#6 - - - g#6 - - - f#6 - e6 - | e6 - - - - - - - . . c#6 . e6 . g#6 . |
                a6 - - - g#6 - f#6 - e6 - - - c#6 - - - | f#6 - - - d#6 - - - b5 - - - f#5 - - - |
                g#5 - b5 - e6 - - - g#6 - - - e6 - - - | f#6 - - - - - - - d#6 - - - b5 - - -`;

export const lari: Song = {
  id: 'lari',
  title: 'Atap Kota',
  bpm: 143,
  gain: 0.78,
  delay: { beats: 0.75, feedback: 0.2, tone: 2600 },
  inst: {
    kick: { ...KICK_PUNCH, level: 0.34 },
    snare: { ...SNARE, level: 0.2, pan: 0.04, rev: 0.12 },
    hat: { ...HAT, level: 0.2, pan: 0.3 },
    tamb: { ...TAMBOURINE, level: 0.15, pan: -0.32 },
    toms: { ...TOMS, level: 0.26, pan: -0.1, rev: 0.1 },
    bass: { ...BASS_SAW, level: 0.2, range: [28, 52] },
    arp: { ...SYNTH_PLUCK, level: 0.09, pan: -0.22, rev: 0.16, dly: 0.12 },
    lead: { ...ANGKLUNG, level: 0.24, pan: 0.08, rev: 0.2, dly: 0.14, range: [62, 94] },
    brass: { ...BRASS, level: 0.12, pan: 0.12, rev: 0.15, range: [58, 79] },
    pad: { ...PAD, level: 0.05, rev: 0.4 },
  },
  sections: {
    intro: {
      bars: 2,
      chords: 'E | B',
      parts: {
        arp: ARP,
        hat: HATS,
        tamb: TAMB,
        kick: '................|x...x...x...x.x.',
        snare: '................|....x...x.x.xxxx',
        bass: '................|1.1.1.1.1.1.8.a.',
        pad: 'x---------------',
      },
    },
    A: {
      bars: 8,
      chords: 'E | B | C#m | A | E | B | A | B',
      parts: {
        kick: KICKS,
        snare: SNARES,
        hat: HATS,
        tamb: TAMB,
        bass: BASS_A,
        arp: ARP,
        lead: HOOK,
        brass: { loop: '................', fill: '..........x.X---', every: 4 },
      },
    },
    B: {
      bars: 8,
      chords: 'A | B | G#m | C#m | A | B | E | B',
      parts: {
        kick: KICKS,
        snare: SNARES,
        hat: 'x.h.x.h.x.h.x.hx',
        tamb: TAMB,
        bass: BASS_B,
        arp: ARP,
        lead: LINE_B,
        brass: 'x...x...........|..........x.X---',
        pad: 'x---------------',
      },
    },
    A2: {
      bars: 8,
      chords: 'E | B | C#m | A | E | B | A | B',
      parts: {
        kick: KICKS,
        snare: SNARES,
        hat: HATS,
        tamb: TAMB,
        bass: BASS_A,
        arp: ARP,
        lead: HOOK,
        brass: { loop: 'x.......x.......', fill: 'x.x.X---x.x.X---', every: 8 },
        pad: 'x---------------',
      },
    },
    drop: {
      bars: 4,
      chords: 'C#m | A | E | B',
      parts: {
        kick: 'x.......x.......|x.......x.......|x.......x.......|x...x...x.x.x.x.',
        snare: '........x.......|........x.......|........x.......|....x...x.x.xxxx',
        hat: '..h...h...h...h.',
        bass: '1.......1.......|1.......1.......|1.......1.......|1.1.1.1.1.1.8.a.',
        arp: ARP,
        toms: '................|................|................|h.h.x.x.l.l.xxll',
        pad: 'x---------------',
      },
    },
  },
  form: ['intro', 'A', 'B', 'A2', 'drop'],
  loopFrom: 1,
};
