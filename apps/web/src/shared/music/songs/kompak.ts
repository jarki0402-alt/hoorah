/**
 * "Satu Frekuensi" (same wavelength): Kompak Gak?, an evening at the angkringan.
 * Easy-going ukulele pop in G, 99 bpm with a lazy swing. Island-style ukulele strums, a round
 * bass walking root to fifth, a whistly flute tune with glockenspiel answers, cross-stick,
 * shaker and a soft clap that only joins in the B part.
 * Form: intro(2) → A(8) → B(8) → A2(8) → break(4), looping to A (28 bars ≈ 68 s).
 */

import { BASS_ROUND, CLAP, FLUTE, GLOCK, KICK, RIM, SHAKER, UKULELE } from '../presets';
import type { Song } from '../synth';

const STRUM = { loop: 'x..u..u.m.u.x.u.', fill: 'x..u..u.m.u.m.n.', every: 4 };
const BASS = { loop: '1.....5.1...v.a.', fill: '1.....5.8.5.3.a.', every: 4 };
const KICKS = 'x.......x..x....';
const STICK = '....x.......x...';
const SHK = 'x.xox.xox.xox.xo';

const TUNE_A1 = `d5 - - b4 d5 - g5 - - - e5 - d5 - . . | e5 - - d5 b4 - - - g4 - a4 - b4 - . . |
                 c5 - - b4 c5 - e5 - - - g5 - e5 - . . | d5 - - - c5 - a4 - f#4 - - - . . . . |`;

export const kompak: Song = {
  id: 'kompak',
  title: 'Satu Frekuensi',
  bpm: 99,
  swing: 0.12,
  gain: 0.88,
  inst: {
    uke: { ...UKULELE, level: 0.24, pan: -0.22, rev: 0.16 },
    bass: { ...BASS_ROUND, level: 0.22, range: [36, 60] },
    flute: { ...FLUTE, level: 0.16, pan: 0.12, rev: 0.26, range: [62, 90] },
    glock: { ...GLOCK, level: 0.15, pan: 0.32, rev: 0.3, range: [72, 98] },
    kick: { ...KICK, level: 0.32 },
    rim: { ...RIM, level: 0.24, pan: 0.22, rev: 0.1 },
    shk: { ...SHAKER, level: 0.2, pan: -0.32 },
    clap: { ...CLAP, level: 0.16, pan: 0.05, rev: 0.16 },
  },
  sections: {
    intro: {
      bars: 2,
      chords: 'G | D7',
      parts: {
        uke: STRUM,
        rim: STICK,
        bass: '................|1.......v...a...',
        glock: `. . . . . . . . . . . . . . . . | . . . . . . . . b5 . a5 . f#5 . d5 .`,
      },
    },
    A: {
      bars: 8,
      chords: 'G | Em7 | Am7 | D7 | G | Em7 | C D7 | G',
      parts: {
        uke: STRUM,
        bass: BASS,
        kick: KICKS,
        rim: STICK,
        shk: SHK,
        flute: `${TUNE_A1}
                d5 - - b4 d5 - g5 - - - a5 - b5 - . . | g5 - - e5 d5 - b4 - - - d5 - e5 - . . |
                e5 - - - g5 - e5 - f#5 - - - a5 - - - | g5 - - - - - - - . . . . . . . .`,
        glock: `. . . . . . . . . . . . . . . . | . . . . . . . . . . . . d6 . g6 . |
                . . . . . . . . . . . . . . . . | . . . . . . . . . . . . a5 . d6 . |
                . . . . . . . . . . . . . . . . | . . . . . . . . . . . . b5 . e6 . |
                . . . . . . . . . . . . . . . . | . . . . . . . . g6 . d6 . b5 . g5 .`,
      },
    },
    B: {
      bars: 8,
      chords: 'Cmaj7 | Bm7 | Am7 | D7 | Cmaj7 | B7 | Em7 A7 | Am7 D7',
      parts: {
        uke: STRUM,
        bass: BASS,
        kick: KICKS,
        rim: STICK,
        shk: SHK,
        clap: '....x.......x...',
        flute: `e5 - g5 - b5 - - - a5 - g5 - e5 - - - | d5 - f#5 - a5 - - - g5 - f#5 - d5 - - - |
                c5 - e5 - g5 - - - f#5 - e5 - c5 - - - | a4 - - - - - . . c5 - d5 - f#5 - a5 - |
                b5 - - - g5 - e5 - - - g5 - b5 - - - | a5 - - - f#5 - d#5 - - - f#5 - a5 - - - |
                g5 - - - e5 - b4 - c#5 - e5 - g5 - - - | f#5 - - - e5 - c5 - d5 - - - . . . .`,
        glock: `. . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . . |
                . . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . . |
                . . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . . |
                . . . . . . . . . . . . . . . . | . . . . . . . . a5 . c6 . d6 . f#6 .`,
      },
    },
    A2: {
      bars: 8,
      chords: 'G | Em7 | Am7 | D7 | G | Em7 | C D7 | G',
      parts: {
        uke: STRUM,
        bass: BASS,
        kick: KICKS,
        rim: STICK,
        shk: SHK,
        flute: `${TUNE_A1}
                b5 - - a5 g5 - d5 - - - e5 - g5 - . . | e5 - - d5 b4 - - - . . d5 - e5 - g5 - |
                a5 - - - g5 - e5 - f#5 - - - d5 - - - | g5 - - - - - . . d6 - b5 - g5 - . .`,
        glock: `. . . . . . . . . . . . . . . . | . . . . . . . . . . . . d6 . g6 . |
                . . . . . . . . . . . . . . . . | . . . . . . . . . . . . a5 . d6 . |
                . . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . . |
                . . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . .`,
      },
    },
    break: {
      bars: 4,
      chords: 'C | D | Bm7 E7 | Am7 D7',
      parts: {
        uke: { loop: 'x.......x.......', fill: 'x.....u.m.u.m.n.' },
        bass: '1.......5.......',
        rim: STICK,
        shk: 'x...x...x...x...',
        glock: `c6 - e6 - g6 - - - e6 - - - . . . . | d6 - f#6 - a6 - - - f#6 - - - . . . . |
                b5 - d6 - f#6 - - - g#6 - - - e6 - - - | . . c6 - e6 - . . d6 - - - c6 - a5 -`,
      },
    },
  },
  form: ['intro', 'A', 'B', 'A2', 'break'],
  loopFrom: 1,
};
