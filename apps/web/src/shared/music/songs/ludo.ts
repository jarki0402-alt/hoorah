/**
 * "Dadu Berputar" (rolling dice): Ludo around the table on a lazy afternoon.
 * Cheerful bouncy pop in G major, 121 bpm with a light shuffle. Glockenspiel and pianika trade
 * the tune, ukulele strums, a round bass hopping root to fifth, claps on 2 and 4, a tambourine
 * and a woodblock "dice rattle" in the turnarounds.
 * Form: intro(2) → A(8) → B(8) → A2(8) → turn(4), looping to A (28 bars ≈ 56 s).
 */

import { BASS_ROUND, CLAP, GLOCK, KICK, PIANIKA, TAMBOURINE, UKULELE, WOODBLOCK } from '../presets';
import type { Song } from '../synth';

const STRUM = 'x.xu.uxux.xu.uxu';
const BASS = { loop: '1..1..5.1...5.a.', fill: '1...5...1.5.8.a.', every: 4 };
const KICKS = 'x.....x.x.......';
const CLAPS = '....x.......x...';
const TAMB = { loop: 'x.x.x.x.x.x.x.x.', fill: 'x.x.x.x.s...s...', every: 8 };
const RATTLE = { loop: '................', fill: '........4...x.x.', every: 4 };

const MELODY_A = `g5 . b5 . d6 - b5 . g5 . a5 . b5 - . . | e5 . g5 . b5 - g5 . e5 - - - . . d5 . |
                  e5 . g5 . c6 - e6 . d6 . c6 . b5 - a5 . | a5 - - - f#5 . a5 . d6 - - - . . . . |
                  g5 . b5 . d6 - b5 . g5 . a5 . b5 - . . | e6 . d6 . b5 - g5 . e5 - - - g5 . a5 . |
                  c6 . b5 . a5 - c6 . f#5 . a5 . d6 - c6 . | b5 - - - g5 - - - . . . . . . . .`;

export const ludo: Song = {
  id: 'ludo',
  title: 'Dadu Berputar',
  bpm: 121,
  swing: 0.08,
  gain: 0.9,
  inst: {
    lead: { ...PIANIKA, level: 0.2, pan: -0.12, rev: 0.18, range: [62, 91] },
    glock: { ...GLOCK, level: 0.17, pan: 0.28, rev: 0.3, range: [74, 98] },
    uke: { ...UKULELE, level: 0.2, pan: 0.18, rev: 0.12 },
    bass: { ...BASS_ROUND, level: 0.26, range: [40, 60] },
    kick: { ...KICK, level: 0.3 },
    clap: { ...CLAP, level: 0.2, pan: -0.05, rev: 0.12 },
    tamb: { ...TAMBOURINE, level: 0.18, pan: 0.35 },
    wood: { ...WOODBLOCK, level: 0.24, pan: -0.32, rev: 0.08 },
  },
  sections: {
    intro: {
      bars: 2,
      chords: 'G | D',
      parts: {
        glock: `. . . . . . . . d6 . g6 . b6 . d7 . | c7 - b6 - a6 - f#6 - . . . . . . . .`,
        uke: STRUM,
        wood: '4...4...x.x.x...|4...4...x.x.4...',
        tamb: 'x.x.x.x.x.x.x.x.',
      },
    },
    A: {
      bars: 8,
      chords: 'G | Em | C | D | G | Em | Am D | G',
      parts: {
        lead: MELODY_A,
        glock: `. . . . . . . . . . . . . . . . | . . . . . . . . . . . . g6 . b6 . |
                . . . . . . . . . . . . . . . . | . . . . . . . . . . . . a6 . d7 . |
                . . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . . |
                . . . . . . . . . . . . . . . . | . . . . . . . . d6 . g6 . b6 . d7 .`,
        uke: STRUM,
        bass: BASS,
        kick: KICKS,
        clap: CLAPS,
        tamb: TAMB,
        wood: RATTLE,
      },
    },
    B: {
      bars: 8,
      chords: 'C | D | Bm | Em | C | D | Am7 | D7',
      parts: {
        lead: `c6 - - - b5 . c6 . e6 - - - c6 . . . | d6 - - - c6 . d6 . f#6 - - - d6 . . . |
               d6 . b5 . f#5 . b5 . d6 - - - b5 . . . | e6 . b5 . g5 . b5 . e6 - - - . . . . |
               g5 . c6 . e6 . g6 - - - e6 . c6 . . . | f#6 - - - e6 . d6 . a5 - - - . . . . |
               c6 . a5 . e5 . a5 . c6 . e6 . g6 - - - | f#6 - - - - - - - . . . . . . . .`,
        glock: `. . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . . |
                . . . . . . . . . . . . . . . . | . . . . . . . . . . . . g6 . e6 . |
                . . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . . |
                . . . . . . . . . . . . . . . . | . . . . . . . . a6 . c7 . a6 . f#6 .`,
        uke: 'x...x.u.x...x.u.',
        bass: '1.......5.......|1.......5...a...',
        kick: 'x.......x.......',
        clap: CLAPS,
        tamb: 's...s...s...s...',
        wood: RATTLE,
      },
    },
    A2: {
      bars: 8,
      chords: 'G | Em | C | D | G | Em | Am D | G',
      parts: {
        lead: MELODY_A,
        glock: { loop: `. . . . . . . . b6 . . . d7 . . . | . . . . . . . . g6 . . . b6 . . .` },
        uke: STRUM,
        bass: BASS,
        kick: KICKS,
        clap: CLAPS,
        tamb: TAMB,
        wood: RATTLE,
      },
    },
    turn: {
      bars: 4,
      chords: 'Em | C | G | D',
      parts: {
        glock: `e6 . g6 . b6 . g6 . e6 . . . . . . . | c6 . e6 . g6 . e6 . c6 . . . . . . . |
                d6 . g6 . b6 . d7 . b6 . . . . . . . | a6 . f#6 . d6 . f#6 . a6 - - - . . . .`,
        uke: 'x.......x.......',
        bass: '1...............|1...............|1...............|1.......5...a...',
        kick: 'x...............',
        wood: '4...4...x.x.x...',
        tamb: 's.......s.......',
      },
    },
  },
  form: ['intro', 'A', 'B', 'A2', 'turn'],
  loopFrom: 1,
};
