/**
 * "Lumbung Penuh" (a full store): Congklak, a calm afternoon on the porch with the board.
 * 86 bpm on a slendro-like pentatonic on C (C D E G A). Kacapi melody, a soft metallophone
 * playing the balungan (one note per beat, eighths in A2), pizzicato bass, a low gong every four
 * bars, a quiet pad drone and a gentle Sundanese kendang.
 * Form: intro(2) → A(8) → B(8) → A2(8), looping to A (24 bars ≈ 67 s).
 */

import { GONG, KACAPI, KENDANG_SUNDA, PAD, PIZZ, VIBES } from '../presets';
import type { Song } from '../synth';

const MELODY_A = `e5 . g5 . a5 - - . g5 . e5 . d5 - - . | c5 . d5 . e5 - - - . . a4 . c5 - d5 . |
                  d5 . e5 . g5 - - . a5 . g5 . e5 - - . | d5 - - - . . . . g4 . a4 . c5 . d5 . |
                  e5 . g5 . a5 - c6 - a5 . g5 . e5 - - . | g5 . e5 . d5 - c5 - a4 - - - . . c5 . |
                  d5 . c5 . a4 . c5 . d5 - - . e5 . g5 . | g5 - - - - - - - . . . . . . . .`;
const GONGS = '1...............|................|........5.......|................';
const BASS = '1.....5.1.......|1.......5...1...';
const KENDANG = 'd...k.p.d.b.k...|d...k.p.d.i.b.k.';

export const congklak: Song = {
  id: 'congklak',
  title: 'Lumbung Penuh',
  bpm: 86,
  swing: 0.04,
  gain: 0.9,
  delay: { beats: 0.75, feedback: 0.3, tone: 2400 },
  inst: {
    kac: { ...KACAPI, level: 0.34, pan: -0.12, rev: 0.3, dly: 0.12 },
    saron: { ...VIBES, level: 0.17, pan: 0.28, rev: 0.34 },
    bass: { ...PIZZ, level: 0.3, range: [36, 60] },
    gong: { ...GONG, level: 0.3, rev: 0.4 },
    pad: { ...PAD, level: 0.035, rev: 0.45, range: [55, 74], poly: 8 },
    kd: { ...KENDANG_SUNDA, level: 0.2, pan: 0.15, rev: 0.12 },
  },
  sections: {
    intro: {
      bars: 2,
      chords: 'C6 | Gsus4',
      parts: {
        kac: `c5 . e5 . g5 . a5 . c6 - - - . . . . | . . . . . . . . g4 . a4 . c5 . d5 .`,
        gong: '1...............|................',
        pad: 'x---------------',
      },
    },
    A: {
      bars: 8,
      chords: 'C6 | Am7 | Dm7 | G7sus4 | C6 | Am7 | F6 | Gsus4',
      parts: {
        kac: MELODY_A,
        saron: `c6 . . . a5 . . . g5 . . . a5 . . . | e6 . . . d6 . . . c6 . . . a5 . . .`,
        bass: BASS,
        gong: GONGS,
        pad: 'x---------------',
        kd: KENDANG,
      },
    },
    B: {
      bars: 8,
      chords: 'Am7 | Dm7 | C6 | Am7 | Dm7 | Gsus4 | C6 | G7sus4',
      parts: {
        kac: `a5 - - - g5 . e5 . g5 - - - . . . . | d5 . e5 . g5 . a5 . c6 - - - a5 . . . |
              g5 - - - e5 - - - d5 . c5 . d5 . e5 . | a4 - - - - - - - . . c5 . e5 . a5 . |
              c6 - - - a5 . g5 . a5 - - - g5 . e5 . | d5 - - - . . g4 . a4 . c5 . d5 . g5 . |
              e5 - - - d5 . c5 . d5 . e5 . g5 . a5 . | g5 - - - - - - - . . . . . . . .`,
        saron: `a5 . . . c6 . . . d6 . . . c6 . . . | g5 . . . a5 . . . c6 . . . e6 . . .`,
        bass: '1.......5.......|1.....5...8.5...',
        gong: GONGS,
        pad: 'x-------x-------',
        kd: 'd.k.p...d.k.b...|d.k.p...d.i.b.k.',
      },
    },
    A2: {
      bars: 8,
      chords: 'C6 | Am7 | Dm7 | G7sus4 | C6 | Am7 | F6 | Gsus4',
      parts: {
        kac: MELODY_A,
        saron: `c6 . a5 . g5 . a5 . c6 . d6 . e6 . d6 . | a5 . g5 . e5 . g5 . a5 . c6 . a5 . g5 .`,
        bass: BASS,
        gong: GONGS,
        pad: 'x---------------',
        kd: KENDANG,
      },
    },
  },
  form: ['intro', 'A', 'B', 'A2'],
  loopFrom: 1,
};
