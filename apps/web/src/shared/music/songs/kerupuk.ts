/**
 * "Kres Kres Kres!": Makan Kerupuk, a 17 Agustus contest in the kampung yard.
 * Bouncy two-step "orkes kampung" in D major, 146 bpm: pianika lead, off-beat cuk chops (ska
 * style), a polka bass on 1 and 5, kick on the beat, claps on 2 and 4, a jingling tambourine,
 * crunchy woodblock "kres kres kres" hits and a dry xylophone answering the tune.
 * Form: intro(4) → A(8) → B(8) → C(8) → A2(8), looping to A (32 bars ≈ 53 s).
 */

import { BASS_ROUND, CLAP, CUK, KICK, PIANIKA, TAMBOURINE, WOODBLOCK, XYLO } from '../presets';
import type { Song } from '../synth';

const KICKS = 'x.......x.......';
const CLAPS = '....x.......x...';
const TAM = '..x...x...x...x.|..x...x...x.x.x.';
const CHOPS = '..x...x...x...x.';
const BASS = '1...5...1...5...|1...5...1...5.a.';
const KRES = { loop: '................|................', fill: '........x.x.x...', every: 4 };

const MELODY_A = `a4 - d5 - f#5 - a5 - . . a5 - b5 - a5 - | f#5 - - - d5 - - - e5 - f#5 - e5 - d5 - |
  b4 - d5 - g5 - b5 - . . b5 - a5 - g5 - | f#5 - - - a5 - - - d5 - - - . . . . |
  d5 - f#5 - b5 - - - a5 - f#5 - d5 - - - | e5 - g5 - b5 - - - a5 - g5 - e5 - - - |
  c#5 - e5 - a5 - g5 - f#5 - e5 - c#5 - a4 - | d5 - - - f#5 - a5 - d6 - - - . . . .`;

export const kerupuk: Song = {
  id: 'kerupuk',
  title: 'Kres Kres Kres!',
  bpm: 146,
  gain: 0.8,
  inst: {
    pianika: { ...PIANIKA, level: 0.2, pan: -0.08, rev: 0.16, range: [60, 88] },
    xylo: { ...XYLO, level: 0.15, pan: 0.3, rev: 0.2 },
    cuk: { ...CUK, level: 0.42, pan: 0.28, rev: 0.1, gate: 0.6 },
    bass: { ...BASS_ROUND, level: 0.4, range: [38, 60] },
    kick: { ...KICK, level: 0.26 },
    clap: { ...CLAP, level: 0.2, pan: -0.12, rev: 0.12 },
    tam: { ...TAMBOURINE, level: 0.3, pan: 0.34 },
    wood: { ...WOODBLOCK, level: 0.26, pan: -0.3, rev: 0.08 },
  },
  sections: {
    intro: {
      bars: 4,
      chords: 'D | G | A7 | D',
      parts: {
        pianika: `. . . . . . . . . . . . a4 - b4 - | d5 . d5 . d5 . . . b4 - d5 - g5 - - - |
                  e5 . e5 . e5 . . . c#5 - e5 - a5 - g5 - | f#5 - - - d5 - - - . . . . . . . .`,
        wood: 'x.x.x...........|................|x.x.x...........|x.x.x.x.X.......',
        kick: '................|x.......x.......|x.......x.......|x...x...x.x.x...',
        bass: '................|1...5...1...5...|1...5...1...5...|1.......1...5.a.',
        tam: '................|..x...x...x...x.|..x...x...x...x.|..x...x...x.x.x.',
      },
    },
    A: {
      bars: 8,
      chords: 'D | D | G | D | Bm | Em | A7 | D',
      parts: {
        pianika: MELODY_A,
        cuk: CHOPS,
        bass: BASS,
        kick: KICKS,
        clap: CLAPS,
        tam: TAM,
        wood: KRES,
      },
    },
    B: {
      bars: 8,
      chords: 'G | D | A7 | D | G | D | Em A7 | D',
      parts: {
        xylo: `d6 . d6 . b5 . g5 . d6 - - - b5 - - - | a5 . a5 . f#5 . d5 . a5 - - - f#5 - - - |
               e5 . a5 . c#6 . e6 . g6 - - - e6 - - - | f#6 - - - d6 - - - a5 - - - . . . . |
               d6 . d6 . b5 . g5 . d6 - - - g6 - - - | f#6 . e6 . d6 . a5 . f#5 - - - a5 - - - |
               g5 - b5 - e6 - - - c#6 - e6 - a6 - - - | d6 - - - - - - - . . . . . . . .`,
        pianika: '....x.......x...|....x.......x.x.',
        cuk: CHOPS,
        bass: BASS,
        kick: KICKS,
        clap: CLAPS,
        tam: TAM,
        wood: KRES,
      },
    },
    C: {
      bars: 8,
      chords: 'Bm | F#m | G | D | Em | Bm | E7 | A7',
      parts: {
        pianika: `d5 - - - c#5 - d5 - f#5 - - - - - - - | e5 - - - c#5 - - - a4 - - - - - - - |
                  b4 - - - d5 - g5 - b5 - - - a5 - g5 - | f#5 - - - - - - - . . . . . . . . |
                  g5 - - - f#5 - g5 - b5 - - - - - - - | a5 - - - f#5 - - - d5 - - - - - - - |
                  g#5 - - - b5 - - - d6 - - - b5 - - - | c#6 - - - - - - - . . a4 - b4 - c#5 -`,
        xylo: { loop: '................', fill: '........x.x.x.x.', every: 4 },
        cuk: '..m...x...m...x.',
        bass: '1.......5.......|1.......5...a...',
        kick: 'x...............',
        tam: '..s.......s.....',
        wood: { loop: '................', fill: 'x.x.x...........', every: 8 },
      },
    },
    A2: {
      bars: 8,
      chords: 'D | D | G | D | Bm | Em | A7 | D',
      parts: {
        pianika: MELODY_A,
        xylo: { loop: MELODY_A, shift: 12 },
        cuk: CHOPS,
        bass: BASS,
        kick: KICKS,
        clap: CLAPS,
        tam: TAM,
        wood: { loop: '................|................', fill: 'x.x.x...x.x.x.X.', every: 8 },
      },
    },
  },
  form: ['intro', 'A', 'B', 'C', 'A2'],
  loopFrom: 1,
};
