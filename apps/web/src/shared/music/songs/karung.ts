/**
 * "Lompat Karung" (sack hop): Balap Karung, an Agustusan sack race on the village field.
 * Bouncy oom-pah in G major at 98 bpm, the hop tempo: one hop per beat. A kick and a tick-tock
 * woodblock mark every beat so players can hop to the music, a tuba oom-pah, off-beat ukulele
 * chops, a playful kendang, claps on 2 and 4, a pianika tune and lyra sparkles.
 * The game restarts the song with every countdown: the intro's woodblock knocks fall on the
 * "3, 2, 1" (beats 0, 2, 4) and the band kicks in on the go beat (6).
 * Form: intro(2) → A(8) → B(8) → A2(8) → break(4), looping to A (28 bars ≈ 69 s).
 */

import { CLAP, GLOCK, KENDANG, KICK, PIANIKA, TUBA, UKULELE, WOODBLOCK } from '../presets';
import type { Song } from '../synth';

const KICKS = 'x...x...x...x...';
const BLOCKS = 'x...l...x...l...';
const CLAPS = { loop: '....x.......x...', fill: '....x.......x.xx', every: 8 };
const KENDANG_A = { loop: 'd..t..k.d.tt..k.|d..t..k.d.t.pkpk', fill: 'd.t.d.t.dtdtkkkk', every: 8 };
const OOM_PAH = { loop: '1...5...1...5...|1...5...1...8.a.', fill: '1...5...1.5.1...', every: 8 };
const CHOPS = '..x...x...x...x.';

const TUNE_A = `g4 - b4 - d5 - - - b4 - d5 - g5 - - - | f#5 - e5 - d5 - - - b4 - - - . . . . |
  c5 - e5 - g5 - - - e5 - g5 - c6 - - - | b5 - a5 - g5 - - - d5 - - - . . . . |
  g5 - - g5 f#5 - - f#5 e5 - - e5 d5 - - - | e5 - g5 - b5 - - - a5 - g5 - e5 - - - |
  c#5 - e5 - a5 - - - c5 - d5 - f#5 - a5 - | g5 - - - d5 - b4 - g4 - - - . . . .`;

const TUNE_B = `e5 - - - g5 - - - e5 - c5 - . . . . | f#5 - - - a5 - - - f#5 - d5 - . . . . |
  d5 - f#5 - b5 - - - a5 - f#5 - d5 - - - | e5 - - - - - - - . . . . . . . . |
  g5 - - - e5 - - - c5 - e5 - g5 - - - | a5 - - - f#5 - - - d5 - f#5 - a5 - c6 - |
  b5 - - - g5 - - - e5 - - - g5 - - - | a5 - - - - - - - f#5 - - - d5 - - -`;

export const karung: Song = {
  id: 'karung',
  title: 'Lompat Karung',
  bpm: 98,
  gain: 0.86,
  inst: {
    kick: { ...KICK, level: 0.42 },
    block: { ...WOODBLOCK, level: 0.2, pan: 0.22, rev: 0.06 },
    clap: { ...CLAP, level: 0.22, pan: -0.08, rev: 0.12 },
    kendang: { ...KENDANG, level: 0.34, pan: -0.2, rev: 0.06 },
    tuba: { ...TUBA, level: 0.3, range: [36, 58] },
    uke: { ...UKULELE, level: 0.3, pan: 0.3, rev: 0.1, gate: 0.5 },
    lead: { ...PIANIKA, level: 0.2, pan: -0.06, rev: 0.16, range: [64, 86] },
    glock: { ...GLOCK, level: 0.12, pan: 0.32, rev: 0.25, range: [72, 100], poly: 6 },
  },
  sections: {
    intro: {
      bars: 2,
      chords: 'G | D7',
      parts: {
        // "3" and "2", then "1" and the go beat where the band comes in.
        block: 'X.......X.......|X.......x...l...',
        kick: '................|........X...x...',
        kendang: '................|....d.d.dtdtkkkk',
        tuba: '................|........1...5...',
        uke: '................|..........x...x.',
        glock: '. . . . . . . . . . . . . . . . | . . . . . . . . d6 - . . . . . .',
      },
    },
    A: {
      bars: 8,
      chords: 'G | G | C | G | G | Em | A7 D7 | G',
      parts: {
        kick: KICKS,
        block: BLOCKS,
        clap: CLAPS,
        kendang: KENDANG_A,
        tuba: OOM_PAH,
        uke: CHOPS,
        lead: TUNE_A,
      },
    },
    B: {
      bars: 8,
      chords: 'C | D | Bm | Em | C | D7 | G Em | Am7 D7',
      parts: {
        kick: KICKS,
        block: BLOCKS,
        clap: CLAPS,
        kendang: KENDANG_A,
        tuba: OOM_PAH,
        uke: CHOPS,
        lead: TUNE_B,
        glock: `. . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . . |
                . . . . . . . . . . . . . . . . | . . . . . . . . b5 - g5 - e5 - b5 -`,
      },
    },
    A2: {
      bars: 8,
      chords: 'G | G | C | G | G | Em | A7 D7 | G',
      parts: {
        kick: KICKS,
        block: BLOCKS,
        clap: CLAPS,
        kendang: KENDANG_A,
        tuba: OOM_PAH,
        uke: CHOPS,
        lead: TUNE_A,
        glock: { loop: TUNE_A, shift: 12 },
      },
    },
    break: {
      bars: 4,
      chords: 'G | G | D7 | D7',
      parts: {
        kick: KICKS,
        block: 'x.l.x.l.x.l.x.l.',
        clap: '....x.......x...|....x.......x...|....x.......x...|....x...x.x.x.x.',
        kendang: 'd..td..td..tdtkk|d..td..td..tdtkk|d.t.d.t.d.t.d.t.|dtdtdtdtkkkkKKKK',
        tuba: '1.......5.......|1.......5.......|1.......5.......|1...5...1...a...',
        uke: 'x.......x.......|x.......x.......|x.......x.......|x...x...x...x...',
        glock: `g5 - . . g5 - . . b5 - . . d6 - . . | g6 - . . . . . . . . . . . . . . |
                f#5 - . . f#5 - . . a5 - . . c6 - . . | d6 - . . c6 - . . a5 - . . f#5 - . .`,
      },
    },
  },
  form: ['intro', 'A', 'B', 'A2', 'break'],
  loopFrom: 1,
};
