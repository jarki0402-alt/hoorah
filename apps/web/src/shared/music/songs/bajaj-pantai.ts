/**
 * "Ombak Ceria" (cheerful waves): Bajaj Rush, Pesisir Pantai circuit.
 * Sunny tropical in G major, 130 bpm. Steel-pan FM melody (rolled on long notes), off-beat
 * ukulele skank (Karplus–Strong), congas, shaker, four-on-the-floor kick and a bouncy bass.
 * Form: intro(4) → A(8) → B(8) → A2(8) → breakdown(4) → B2(8), looping to A (36 bars ≈ 66 s).
 */

import { BASS_ELECTRIC, CONGA, KICK, RIM, SHAKER, STEELPAN, UKULELE } from '../presets';
import type { Song } from '../synth';

const SKANK = '..x-..x-..x-..x-';
const BASS = '1.....1.5...1...|1.....1.5...a...';
const CONGAS = 'l...s..x.x..s.x.|l...s..xmx..s.xx';
const SHAKE = 'xoxoxoxoxoxoxoxo';

const PAN_A = `b4 - d5 - g5 - - b5 - - a5 - g5 - - - | e5 - - - g5 - - b5 - - a5 - g5 - e5 - |
  c6 - - - b5 - a5 - - - g5 - e5 - - - | f#5 - - - a5 - - c6 - - b5 - a5 - - - |
  g5 - - - b5 - - d6 - - - - b5 - - - | c6 - - - b5 - - g5 - - e5 - g5 - - - |
  a5 - - - c6 - - e6 - - d6 - c6 - a5 - | g5 g5 g5 g5 g5 g5 g5 g5 . . . . d5 - e5 -`;

const PAN_B = `g5 - - - e5 - - g5 - - b5 - - - . . | c6 - - - b5 - - g5 - - e5 - - - . . |
  d5 - - - g5 - - b5 - - d6 - - - b5 - | a5 a5 a5 a5 a5 a5 a5 a5 f#5 - - - d5 - - - |
  e5 - g5 - b5 - - d6 - - b5 - g5 - - - | e6 - - - d6 - - c6 - - b5 - - - . . |
  c#6 - - - e6 - - - g5 - - - a5 - - - | g5 - - - - - - - f#5 - - - a5 - c6 -`;

export const pantai: Song = {
  id: 'bajaj-pantai',
  title: 'Ombak Ceria',
  bpm: 130,
  gain: 0.83,
  delay: { beats: 0.75, feedback: 0.25, tone: 2600 },
  inst: {
    pan: { ...STEELPAN, level: 0.28, pan: 0.15, rev: 0.25, dly: 0.12, range: [62, 92], poly: 10 },
    uke: { ...UKULELE, level: 0.36, pan: -0.32, rev: 0.1, gate: 0.8 },
    bass: { ...BASS_ELECTRIC, level: 0.28, range: [36, 60] },
    kick: { ...KICK, level: 0.34 },
    rim: { ...RIM, level: 0.33, pan: 0.1, rev: 0.12 },
    conga: { ...CONGA, level: 0.34, pan: -0.15, rev: 0.08 },
    shk: { ...SHAKER, level: 0.21, pan: 0.35 },
  },
  sections: {
    intro: {
      bars: 4,
      chords: 'G | Cmaj7 | Am7 | D7',
      parts: {
        pan: { loop: '1.3.5.8.5.3.1.3.', fill: '1.3.5.8.9.8.5...' },
        conga: CONGAS,
        shk: SHAKE,
        uke: '................|................|..x-..x-..x-..x-|..x-..x-..x-..x-',
        bass: '................|................|................|1.....1.5...a...',
      },
    },
    A: {
      bars: 8,
      chords: 'G | Cmaj7 | Am7 | D7 | G | Cmaj7 | Am7 D7 | G',
      parts: {
        pan: PAN_A,
        uke: SKANK,
        bass: BASS,
        kick: 'x...x...x...x...',
        rim: '....x.......x...',
        conga: CONGAS,
        shk: SHAKE,
      },
    },
    B: {
      bars: 8,
      chords: 'Em7 | Cmaj7 | G | D | Em7 | Cmaj7 | A7 | D7sus4 D7',
      parts: {
        pan: PAN_B,
        uke: { loop: SKANK, fill: '..x-..x-x.x.x.x.', every: 8 },
        bass: BASS,
        kick: 'x...x...x...x...',
        rim: { loop: '....x.......x...', fill: '....x.......x.xx', every: 4 },
        conga: CONGAS,
        shk: SHAKE,
      },
    },
    A2: {
      bars: 8,
      chords: 'G | Cmaj7 | Am7 | D7 | G | Cmaj7 | Am7 D7 | G',
      parts: {
        pan: `b4 - d5 - g5 - - b5 - - a5 - g5 - - - | e5 - - - g5 - - b5 - - a5 - g5 - e5 - |
              c6 - - - b5 - a5 - - - g5 - e5 - - - | f#5 - - - a5 - - c6 - - b5 - a5 - - - |
              b5 - - - d6 - - g6 - - - - d6 - - - | e6 - - - d6 - - c6 - - b5 - g5 - - - |
              a5 - - - c6 - - e6 - - f#6 - e6 - d6 - | g6 g6 g6 g6 g6 g6 g6 g6 . . . . . . . .`,
        uke: SKANK,
        bass: BASS,
        kick: 'x...x...x...x...',
        rim: '....x.......x...',
        conga: CONGAS,
        shk: SHAKE,
      },
    },
    breakdown: {
      bars: 4,
      chords: 'Cmaj7 | Bm7 | Am7 | D7',
      parts: {
        pan: { loop: '1.3.5.8.5.3.1.3.', fill: '1.3.5.8.9.8.5.3.' },
        uke: 'x-......x-......',
        conga: CONGAS,
        shk: SHAKE,
        bass: '1.......5.......|1.......5.......|1.......5.......|1.....1.5...a...',
      },
    },
    B2: {
      bars: 8,
      chords: 'Em7 | Cmaj7 | G | D | Em7 | Cmaj7 | A7 | D7sus4 D7',
      parts: {
        pan: PAN_B,
        uke: { loop: SKANK, fill: '..x-..x-x.x.x.x.', every: 8 },
        bass: BASS,
        kick: 'x...x...x...x...',
        rim: '....x.......x...',
        conga: CONGAS,
        shk: SHAKE,
      },
    },
  },
  form: ['intro', 'A', 'B', 'A2', 'breakdown', 'B2'],
  loopFrom: 1,
};
