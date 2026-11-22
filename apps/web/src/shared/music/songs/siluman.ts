/**
 * "Pagi di Kampung" (morning in the kampung): Kampung Siluman by day, warm gold after the night.
 * A bright village groove on a G pentatonic, 113 bpm. Kacapi runs, a round bass, a soft pad and
 * a gong every phrase are always on, calm enough to argue over; adaptive layers join as the day
 * heats up: kendang and kecrek (tier 1, morning news and discussion), the angklung tune (tier 2,
 * defence and voting), a kick (tier 3, votes revealed).
 * Form: intro(2) → A(8) → B(8) → C(8), looping to A (24 bars ≈ 51 s).
 */

import { ANGKLUNG, BASS_ROUND, GONG, KACAPI, KENDANG, KICK, PAD, TAMBOURINE } from '../presets';
import type { Song } from '../synth';

const RUN = '1358985313589853';
const RUN2 = '1235853212358532';
const KENDANGS = { loop: 'b..t..b.t.t.b..t', fill: 'b..t..b.tktkbbtt', every: 4 };
const KECREK = '..x...x...x.x.x.';
const GONGS = '1...............|................|................|................';
const BASS = '1.....5.1.....5.|1.....5.8...5.3.';
const KICKS = 'x.......x.......';
const GLUE = 'x---------------';

export const siluman: Song = {
  id: 'siluman',
  title: 'Pagi di Kampung',
  bpm: 113,
  gain: 0.84,
  inst: {
    kac: { ...KACAPI, level: 0.34, pan: -0.28, rev: 0.2, gate: 3.5, poly: 6, range: [55, 98] },
    bass: { ...BASS_ROUND, level: 0.24, range: [36, 60] },
    pad: { ...PAD, level: 0.04, rev: 0.4 },
    gong: { ...GONG, level: 0.16, rev: 0.3 },
    kendang: { ...KENDANG, level: 0.3, human: 0.004, tier: 1 },
    kecrek: { ...TAMBOURINE, level: 0.2, pan: 0.3, tier: 1 },
    angk: { ...ANGKLUNG, level: 0.36, pan: 0.15, rev: 0.25, tier: 2 },
    kick: { ...KICK, level: 0.22, tier: 3 },
  },
  sections: {
    intro: {
      bars: 2,
      chords: 'G | D',
      parts: {
        kac: RUN,
        pad: GLUE,
        gong: '1...............',
        bass: '1...............|1.......5.......',
      },
    },
    A: {
      bars: 8,
      chords: 'G | G | Em | Em | C | D | G | G',
      parts: {
        kac: RUN,
        bass: BASS,
        pad: GLUE,
        gong: GONGS,
        kendang: KENDANGS,
        kecrek: KECREK,
        kick: KICKS,
        angk: `d5 - - - g5 - - - a5 - b5 - d6 - - - | b5 - - - a5 - g5 - e5 - - - - - - - |
               e5 - - - g5 - a5 - b5 - a5 - g5 - e5 - | d5 - - - e5 - - - g5 - - - - - - - |
               e5 - - - g5 - - - e5 - d5 - c5 - - - | d5 - - - - - a5 - - - g5 - a5 - - - |
               b5 - - - a5 - g5 - e5 - g5 - a5 - - - | g5 - - - - - - - - - - - . . . .`,
      },
    },
    B: {
      bars: 8,
      chords: 'Em | C | G | D | Em | C | Am | D',
      parts: {
        kac: RUN2,
        bass: BASS,
        pad: GLUE,
        gong: GONGS,
        kendang: KENDANGS,
        kecrek: KECREK,
        kick: KICKS,
        angk: `b5 - - - - - - - d6 - b5 - a5 - - - | g5 - - - e5 - - - g5 - - - - - - - |
               d6 - - - - - - - e6 - d6 - b5 - - - | a5 - - - - - - - f#5 - - - a5 - - - |
               b5 - - - d6 - - - e6 - - - d6 - b5 - | g5 - - - - - - - e5 - g5 - a5 - - - |
               c6 - - - b5 - - - a5 - - - e5 - - - | f#5 - - - a5 - - - d6 - - - . . . .`,
      },
    },
    C: {
      bars: 8,
      chords: 'C | D | Em | D | C | D | G | G',
      parts: {
        kac: RUN,
        bass: '1.......5.......',
        pad: GLUE,
        gong: '1...............|................|1...............|................',
        kendang: KENDANGS,
        kecrek: KECREK,
        kick: KICKS,
        angk: `e5 - - - g5 - - - c6 - - - - - - - | d6 - - - - - a5 - - - f#5 - - - - - |
               g5 - - - b5 - - - e6 - - - d6 - b5 - | a5 - - - - - - - d5 - - - - - - - |
               e5 - - - g5 - - - c6 - - - e6 - - - | d6 - - - - - b5 - a5 - - - - - - - |
               g5 - - - a5 - b5 - d6 - b5 - a5 - - - | g5 - - - - - - - - - - - . . . .`,
      },
    },
  },
  form: ['intro', 'A', 'B', 'C'],
  loopFrom: 1,
};
