/**
 * "Kabut Kebun Teh" (tea-garden mist): Bajaj Rush, Jalur Puncak circuit.
 * Sundanese-inspired, 134 bpm, on a salendro-like G pentatonic. Angklung melody (bamboo
 * rattle on held notes) and off-beat angklung chords, running kacapi plucks, jaipong-style
 * kendang, kecrek, a gong every phrase, a soft bass and an airy pad.
 * Form: intro(4) → A(8) → B(8) → A2(8) → break(4) → B2(8), looping to A (36 bars ≈ 64 s).
 */

import { ANGKLUNG, BASS_ROUND, GONG, KACAPI, KENDANG_SUNDA, KICK, PAD, TAMBOURINE } from '../presets';
import type { Song } from '../synth';

const KENDANG = {
  loop: 'd..p..d.i.p.d.kp|d..p..dki.p.bdkp',
  fill: 'pkpkdddbpkpkdDDp',
  every: 8,
};
const KACAPI_RUN = '1358985313589853';
const KACAPI_RUN2 = '1235853212358532';
const GONGS = '1...............|................|........1.......|................';
const BASS = '1.....v.1.....v.|1.....v.1...5.a.';
const KECREK = '..x...x...x.x.x.';

const ANGKLUNG_A = `d5 - - - g5 - - - a5 - b5 - d6 - - - | b5 - - - a5 - g5 - e5 - - - g5 - - - |
  e5 - - - g5 - b5 - - - a5 - g5 - e5 - | d5 - - - e5 - - - g5 - - - - - - - |
  g5 - - - e5 - - - g5 - a5 - b5 - - - | a5 - - - - - d6 - - - b5 - a5 - - - |
  g5 - - - b5 - a5 - g5 - e5 - d5 - - - | g5 - - - - - - - - - - - . . . .`;

const ANGKLUNG_B = `b5 - - - - - - - d6 - b5 - a5 - - - | g5 - - - e5 - - - g5 - - - - - - - |
  d6 - - - - - - - e6 - d6 - b5 - - - | a5 - - - - - - - f#5 - - - a5 - - - |
  b5 - - - d6 - - - e6 - - - d6 - b5 - | g5 - - - - - - - e5 - g5 - a5 - - - |
  c6 - - - b5 - - - a5 - - - e5 - - - | f#5 - - - a5 - - - d6 - - - . . . .`;

export const puncak: Song = {
  id: 'bajaj-puncak',
  title: 'Kabut Kebun Teh',
  bpm: 134,
  gain: 0.85,
  inst: {
    angk: { ...ANGKLUNG, level: 0.49, pan: 0.15, rev: 0.25 },
    angc: { ...ANGKLUNG, level: 0.18, pan: -0.25, rev: 0.2, range: [62, 79] },
    kac: { ...KACAPI, level: 0.43, pan: -0.32, rev: 0.2, gate: 3.5, poly: 6, range: [55, 98] },
    kendang: { ...KENDANG_SUNDA, level: 0.37, human: 0.004 },
    kecrek: { ...TAMBOURINE, level: 0.25, pan: 0.3 },
    gong: { ...GONG, level: 0.19, rev: 0.3 },
    bass: { ...BASS_ROUND, level: 0.25, range: [36, 60] },
    pad: { ...PAD, level: 0.041, rev: 0.45 },
    kick: { ...KICK, level: 0.24 },
  },
  sections: {
    intro: {
      bars: 4,
      chords: 'G | Em | C | D',
      parts: {
        kac: KACAPI_RUN,
        pad: 'x---------------',
        gong: '1...............',
        kendang: '................|................|................|pkpkdddbpkpkdDDp',
      },
    },
    A: {
      bars: 8,
      chords: 'G | G | Em | Em | C | D | G | G',
      parts: {
        angk: ANGKLUNG_A,
        angc: '..x...x...x...x.',
        kac: KACAPI_RUN,
        kendang: KENDANG,
        kecrek: KECREK,
        gong: GONGS,
        bass: BASS,
        pad: 'x---------------',
      },
    },
    B: {
      bars: 8,
      chords: 'Em | C | G | D | Em | C | Am7 | D',
      parts: {
        angk: ANGKLUNG_B,
        angc: '..x..x....x..x..',
        kac: KACAPI_RUN2,
        kendang: KENDANG,
        kecrek: '.xx..xx..xx..xx.',
        gong: GONGS,
        bass: BASS,
        kick: 'x.......x.......',
        pad: 'x---------------',
      },
    },
    A2: {
      bars: 8,
      chords: 'G | G | Em | Em | C | D | G | G',
      parts: {
        angk: ANGKLUNG_A,
        angc: '.xx..xx..xx..xx.',
        kac: { loop: ANGKLUNG_A, shift: 12 },
        kendang: KENDANG,
        kecrek: KECREK,
        gong: GONGS,
        bass: BASS,
        pad: 'x---------------',
      },
    },
    break: {
      bars: 4,
      chords: 'Em | Em | C | D',
      parts: {
        kendang: 'd.d.pkd.d.pkddpk|i.i.pkd.d.pkbbpk|d..d..d.pkpkddpk|pkpkpkpkddddDDDD',
        angc: 'x.x...x.x.x...x.',
        gong: '1...............|................|1...............|................',
        kecrek: 'x...x...x...x...',
        bass: '1.......1.......|1.......1.......|1.......1.......|1...1...1.1.a...',
      },
    },
    B2: {
      bars: 8,
      chords: 'Em | C | G | D | Em | C | Am7 | D',
      parts: {
        angk: ANGKLUNG_B,
        angc: '..x..x....x..x..',
        kac: KACAPI_RUN,
        kendang: KENDANG,
        kecrek: '.xx..xx..xx..xx.',
        gong: GONGS,
        bass: BASS,
        kick: 'x.......x.......',
        pad: 'x---------------',
      },
    },
  },
  form: ['intro', 'A', 'B', 'A2', 'break', 'B2'],
  loopFrom: 1,
};
