/**
 * "Liuk Malam" (night slither): Ular Arena.
 * Sneaky, driving garden funk in D minor, 137 bpm. Four-on-the-floor kick with claps, disco
 * hats, shaker and a conga groove; a bouncy octave funk bass that slithers chromatically in the
 * chase section; a marimba hook, a breathy flute answer, square-wave arpeggios and brass stabs.
 * Form: intro(4) → A(8) → B(8) → chase(8) → A2(8), looping to A (32 bars ≈ 56 s).
 */

import {
  BASS_FUNK,
  BRASS,
  CLAP,
  CONGA,
  FLUTE,
  HAT,
  KICK_PUNCH,
  MARIMBA,
  PAD,
  SHAKER,
  SYNTH_PLUCK,
} from '../presets';
import type { Song } from '../synth';

const KICKS = { loop: 'x...x...x...x...', fill: 'x...x...x.x.x.xx', every: 8 };
const CLAPS = { loop: '....x.......x...', fill: '....x.......x.xx', every: 8 };
const HATS = 'x.h.x.h.x.h.x.hx';
const SHAKE = 'x.xxx.xxx.xxx.xx';
const CONGAS = 'l..x..s.l.x.s.m.|l..x..s.l.xxs.m.';
const ARP = '1358531813585318';
const BASS_A = { loop: '1.81..1.5.8.7.5.|1.81..1.5.8.5.a.', fill: '1.1.8.1.5.8.7.a.', every: 8 };
const BASS_B = '1..1.o5.8..8.o5.|1..1.o5.8.5.a...';

const HOOK = `d5 . f5 . a5 . g5 f5 . e5 . d5 . . a4 . | bb4 . d5 . f5 . e5 d5 . c5 . bb4 . . f4 . |
              c5 . e5 . g5 . f5 e5 . d5 . c5 . e5 . g5 | a5 - - . g5 . e5 . c#5 - . e5 a4 . . . |
              d5 . f5 . a5 . g5 f5 . e5 . d5 . . a4 . | bb4 . d5 . f5 . bb5 a5 . g5 . f5 . d5 . . |
              g5 . bb5 . a5 g5 f5 . e5 . g5 . c6 . bb5 . | a5 - - - c#6 - - - e6 - - - . . . .`;

export const arena: Song = {
  id: 'arena',
  title: 'Liuk Malam',
  bpm: 137,
  swing: 0.04,
  gain: 0.8,
  inst: {
    kick: { ...KICK_PUNCH, level: 0.36 },
    clap: { ...CLAP, level: 0.21, pan: -0.05, rev: 0.12 },
    hat: { ...HAT, level: 0.24, pan: 0.3 },
    shaker: { ...SHAKER, level: 0.14, pan: -0.32 },
    conga: { ...CONGA, level: 0.22, pan: -0.2, rev: 0.08 },
    bass: { ...BASS_FUNK, level: 0.2, range: [33, 57] },
    arp: { ...SYNTH_PLUCK, level: 0.1, pan: 0.25, rev: 0.18 },
    lead: { ...MARIMBA, level: 0.26, pan: -0.1, rev: 0.16, range: [62, 88] },
    flute: { ...FLUTE, level: 0.17, pan: 0.15, rev: 0.25, range: [67, 93] },
    brass: { ...BRASS, level: 0.12, pan: 0.1, rev: 0.15, range: [58, 79] },
    pad: { ...PAD, level: 0.04, rev: 0.4 },
  },
  sections: {
    intro: {
      bars: 4,
      chords: 'Dm | Dm | Bb | C',
      parts: {
        conga: CONGAS,
        shaker: SHAKE,
        bass: '1...1...1...1...|1...1...1...1...|1...1...1...1...|1.1.1.1.1.1.8.7.',
        arp: '................|........13585318|1358531813585318|1358531813585318',
        kick: '................|................|x...x...x...x...|x...x...x.x.x.xx',
        clap: '................|................|................|x.x.x.x.xxxxXXXX',
        pad: 'x---------------',
      },
    },
    A: {
      bars: 8,
      chords: 'Dm | Bb | C | A7 | Dm | Bb | Gm C | A7',
      parts: {
        kick: KICKS,
        clap: CLAPS,
        hat: HATS,
        shaker: SHAKE,
        conga: CONGAS,
        bass: BASS_A,
        arp: ARP,
        lead: HOOK,
        brass: { loop: '................', fill: '........x.x.X---', every: 4 },
      },
    },
    B: {
      bars: 8,
      chords: 'Gm | C | F | A7 | Gm | C | Bb | A7',
      parts: {
        kick: KICKS,
        clap: CLAPS,
        hat: HATS,
        shaker: SHAKE,
        conga: CONGAS,
        bass: BASS_B,
        arp: ARP,
        flute: `d6 - - - bb5 - - . g5 - a5 - bb5 - d6 - | c6 - - - - - g5 . e5 - g5 - c6 - e6 - |
                f6 - - - e6 - c6 - a5 - - - c6 - - - | e6 - - - c#6 - - - a5 - - - . . . . |
                d6 - bb5 - g5 - bb5 - d6 - g6 - f6 - d6 - | e6 - - - c6 - - - g5 - c6 - e6 - g6 - |
                f6 - - - d6 - - - bb5 - - - d6 - f6 - | e6 - - - - - - - c#6 - - - a5 - - -`,
        brass: '................|..........x.x.X-|................|x-..x-..X---....',
        pad: 'x---------------',
      },
    },
    chase: {
      bars: 8,
      chords: 'Dm | Dm | Dm | A7 | Bb | Bb | C | A7',
      parts: {
        kick: 'x.......x.......|x.......x.......|x.......x.......|x...x...x.x.x.x.|x...x...x...x...',
        clap: '........x.......|........x.......|........x.......|....x...x.x.xxxx|....x.......x...',
        hat: '..h...h...h...h.|..h...h...h...h.|..h...h...h...h.|x.x.x.x.x.x.xxxx|x.h.x.h.x.h.x.hx',
        conga: 'l.....s.l..xs...|l.....s.l..xs.mm',
        bass: `d2 . . d2 eb2 . e2 . f2 . f#2 . g2 . ab2 . | a2 . . a2 ab2 . g2 . f#2 . f2 . e2 . eb2 . |
               d2 . . d2 eb2 . e2 . f2 . f#2 . g2 . ab2 . | a2 . a2 . a2 . a2 . a2 a2 a2 a2 c#3 . e3 . |
               1..1.o8.1..5.8..|1..1.o8.1..5.8..|1..8..1.5..8..a.|1.1.1.1.1.1.8.7.`,
        arp: ARP,
        lead: `. . . . . . . . a5 . . . g5 . f5 . | e5 . . . . . . . . . . . . . . . |
               . . . . . . . . a5 . . . bb5 . a5 . | c#6 - - - - - - - e5 - - - . . . . |
               . . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . . |
               . . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . .`,
        brass:
          '................|................|................|................|X--.............|X--.............|x.x.X---x.x.X---|X---............',
        pad: 'x---------------',
      },
    },
    A2: {
      bars: 8,
      chords: 'Dm | Bb | C | A7 | Dm | Bb | Gm C | A7',
      parts: {
        kick: KICKS,
        clap: CLAPS,
        hat: HATS,
        shaker: SHAKE,
        conga: CONGAS,
        bass: BASS_A,
        arp: ARP,
        lead: HOOK,
        flute: `f6 - - - - - - - e6 - - - d6 - - - | d6 - - - - - - - f6 - - - - - - - |
                e6 - - - - - - - g6 - - - e6 - - - | c#6 - - - - - - - e6 - - - a6 - - -`,
        brass: { loop: '................', fill: 'x.x.X---x.x.X---', every: 8 },
      },
    },
  },
  form: ['intro', 'A', 'B', 'chase', 'A2'],
  loopFrom: 1,
};
