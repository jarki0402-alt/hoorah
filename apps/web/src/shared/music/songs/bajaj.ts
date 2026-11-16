/**
 * "Gas Pol Koplo": Bajaj Rush, Lingkar Kota circuit (and the pre-race menu).
 * Dangdut koplo energy in A minor (harmonic), 140 bpm. Kendang (ketipung + big drum with the
 * falling "dhut"), tambourine, a breathy suling lead with vibrato and turns, fingered
 * electric bass locked to the kendang, and off-beat organ stabs.
 * Form: intro(4) → A(8) → B(8) → A2(8) → break(4) → B2(8), looping to A (36 bars ≈ 62 s).
 */

import { BASS_ELECTRIC, FLUTE, KENDANG, KICK, ORGAN, TAMBOURINE } from '../presets';
import type { Song } from '../synth';

const KENDANG_A = {
  loop: 'd.kdt.kd.dk.t.kp|d.kdt.kd.kddtkpk',
  fill: 'tkpktkpkddtkdDD.',
  every: 8,
};
const KENDANG_B = {
  loop: 'D.kdt.kdD.kdt.kd|D.kdt.kdDkddtkpk',
  fill: 'tktkdtdtddtkDDDD',
  every: 8,
};
const BASS_A = '1..1..8.1..1..5.|1..1..8.1..5.8a.';
const BASS_B = '1..1..5.1..1..5.|1..1..8.1..5.8a.';
const TAM_A = '..x...x...x...x.';
const TAM_B = '..x.s.x...x.s.x.';
const ORGAN_A = '..x...x...x...x.';
const ORGAN_B = '..x..xx...x..xx.';

const SULING_A = `a5 - - - - - - - - - g#5 a5 b5 - a5 - | c6 - - - b5 - a5 - g#5 - a5 - e5 - - - |
  f5 - - - - - e5 f5 a5 - - - d6 - c6 - | b5 - a5 - - - - - . . c6 - b5 - a5 - |
  a5 - - - c6 - - - f6 - - - e6 - d6 - | d6 - - - b5 - - - g5 - - - a5 - b5 - |
  c6 - b5 - a5 - g#5 - f5 - e5 - - - . . | a5 - - - - - - - . . . . e5 - g#5 -`;

const SULING_B = `d6 - - d6 - - c6 - d6 - - - f6 - e6 - | d6 - - - b5 - - - g5 - - - . . . . |
  c6 - - c6 - - b5 - c6 - - - e6 - d6 - | c6 - - - a5 - - - f5 - - - . . . . |
  f5 - - - a5 - - - d6 - - - f6 - - - | e6 - - - - - c6 - b5 - a5 - - - . . |
  b5 - - - g#5 - - - e5 - - - g#5 - b5 - | d6 - - - - - c6 b5 c6 - b5 - g#5 - - -`;

export const bajaj: Song = {
  id: 'bajaj',
  title: 'Gas Pol Koplo',
  bpm: 140,
  gain: 0.735,
  delay: { beats: 0.75, feedback: 0.22, tone: 2400 },
  inst: {
    kendang: { ...KENDANG, level: 0.35, human: 0.004 },
    tam: { ...TAMBOURINE, level: 0.38, pan: 0.32 },
    kick: { ...KICK, level: 0.27 },
    suling: { ...FLUTE, level: 0.24, pan: 0.05, rev: 0.22, dly: 0.1, range: [64, 93] },
    bass: { ...BASS_ELECTRIC, level: 0.26, range: [33, 57] },
    organ: { ...ORGAN, level: 0.165, pan: -0.25, rev: 0.1, gate: 0.6 },
    hold: { ...ORGAN, level: 0.07, pan: -0.1, rev: 0.3 },
  },
  sections: {
    intro: {
      bars: 4,
      chords: 'Am | Dm | E7 | Am',
      parts: {
        suling: `e6 - - - - - - - d6 - c6 - b5 - c6 - | d6 - - - - - - - c6 - a5 - f5 - a5 - |
                 g#5 - - - - - - - b5 - d6 - f6 - e6 - | a5 - - - - - - - . . . . . . . .`,
        hold: 'x---------------',
        kendang: '................|................|................|tkpktkpkddtkdDD.',
        tam: '................|................|................|s...s...s.s.s.s.',
        bass: '................|................|................|1.......1..5.8a.',
      },
    },
    A: {
      bars: 8,
      chords: 'Am | Am | Dm | Am | F | G | E7 | Am',
      parts: {
        suling: SULING_A,
        kendang: KENDANG_A,
        tam: TAM_A,
        bass: BASS_A,
        organ: ORGAN_A,
      },
    },
    B: {
      bars: 8,
      chords: 'Dm | G | C | F | Dm | Am | E7 | E7',
      parts: {
        suling: SULING_B,
        kendang: KENDANG_B,
        tam: TAM_B,
        kick: 'x...x...x...x...',
        bass: BASS_B,
        organ: ORGAN_B,
      },
    },
    A2: {
      bars: 8,
      chords: 'Am | Am | Dm | Am | F | G | E7 | Am',
      parts: {
        suling: `a5 - - - - - - - c6 b5 a5 g#5 a5 - - - | e6 - - - d6 - c6 - b5 - c6 - a5 - - - |
                 f5 - - - a5 - d6 - f6 - - - e6 - d6 - | c6 - - - b5 - a5 - - - . . . . . . |
                 c6 - - - f6 - - - a6 - - - g6 - f6 - | g6 - - - d6 - - - b5 - - - d6 - - - |
                 e6 - d6 - c6 - b5 - a5 - g#5 - b5 - - - | a5 - - - - - - - . . . . e5 - g#5 -`,
        kendang: KENDANG_A,
        tam: TAM_A,
        bass: BASS_A,
        organ: ORGAN_A,
      },
    },
    break: {
      bars: 4,
      chords: 'Am | Am | Am | E7',
      parts: {
        kendang: 'd..d..d.t.t.ddtk|d..d..d.tktkdddd|D.kD.kD.kD.kDtkp|tktktktkddddDDDD',
        bass: '1..1..1.........|1..1..1.........|1..1..1..1..1...|1...1...1.1.1.1.',
        organ: 'x..x..x.........|x..x..x.........|x..x..x..x..x...|x...x...x.x.x.x.',
        tam: 's.......s.......|s.......s.......|s.......s.......|x.x.x.x.x.x.x.x.',
      },
    },
    B2: {
      bars: 8,
      chords: 'Dm | G | C | F | Dm | Am | E7 | E7',
      parts: {
        suling: `d6 - - d6 - - c6 - d6 - - - f6 - e6 - | d6 - - - b5 - - - g5 - - - . . . . |
                 c6 - - c6 - - b5 - c6 - - - e6 - d6 - | c6 - - - a5 - - - f5 - - - . . . . |
                 a5 - - - d6 - - - f6 - - - a6 - - - | g6 - - - e6 - c6 - b5 - c6 - - - . . |
                 b5 - - - d6 - - - f6 - - - e6 - d6 - | c6 - - - b5 - - - g#5 - - - b5 - - -`,
        kendang: KENDANG_B,
        tam: TAM_B,
        kick: 'x...x...x...x...',
        bass: BASS_B,
        organ: ORGAN_B,
      },
    },
  },
  form: ['intro', 'A', 'B', 'A2', 'break', 'B2'],
  loopFrom: 1,
};
