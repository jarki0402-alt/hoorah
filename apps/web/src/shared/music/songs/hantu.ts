/**
 * "Rumah Sunyi" (the silent house): Hantu Tak Terlihat, a dark house and an invisible ghost.
 * A creepy-cute lullaby in D minor, 76 bpm. A music box tune over a low organ drone is always
 * on; adaptive layers follow how close the ghost is: a heartbeat kick and pizzicato bass (tier 1,
 * the ghost nearby), tremolo strings and tom rumbles (tier 2, close), a second heartbeat at
 * double pace and brass stabs (tier 3, one step away).
 * Form: intro(2) → A(8) → B(8) → C(4), looping to A (20 bars ≈ 63 s).
 */

import { BRASS, GLOCK, KICK, ORGAN, PAD, PIZZ, TOMS } from '../presets';
import type { Song } from '../synth';

const DRONE = 'x---------------';
const HEART = 'x..x............';
const HEART_FAST = '........x..x....';
const BASS = '1.......5.......';
const TREM = 'x-------x-------';
const RUMBLE = { loop: '................', fill: '........l...l.h.', every: 2 };
const STABS = 'x...........x...';

export const hantu: Song = {
  id: 'hantu',
  title: 'Rumah Sunyi',
  bpm: 76,
  gain: 0.84,
  inst: {
    box: { ...GLOCK, level: 0.16, pan: 0.15, rev: 0.45, dly: 0.25, range: [64, 92] },
    drone: { ...ORGAN, level: 0.05, rev: 0.4, range: [38, 57] },
    heart: { ...KICK, level: 0.3, tier: 1 },
    bass: { ...PIZZ, level: 0.24, range: [33, 52], tier: 1 },
    strings: { ...PAD, level: 0.09, rev: 0.4, trem: { rate: 9, depth: 0.6 }, tier: 2 },
    toms: { ...TOMS, level: 0.2, rev: 0.3, tier: 2 },
    heart2: { ...KICK, level: 0.28, tier: 3 },
    brass: { ...BRASS, level: 0.1, rev: 0.3, tier: 3 },
  },
  sections: {
    intro: {
      bars: 2,
      chords: 'Dm | A7',
      parts: {
        drone: DRONE,
        box: 'a5 - - - f5 - - - d5 - - - . . . . | c#6 - - - a5 - - - e5 - - - . . . .',
      },
    },
    A: {
      bars: 8,
      chords: 'Dm | Bb | Gm | A7 | Dm | Bb | Gm | A7',
      parts: {
        drone: DRONE,
        heart: HEART,
        bass: BASS,
        strings: TREM,
        toms: RUMBLE,
        heart2: HEART_FAST,
        brass: STABS,
        box: `a5 - - - f5 - - - d5 - - - . . . . | bb5 - - - f5 - - - d5 - - - . . . . |
              g5 - - - bb5 - - - d6 - - - . . . . | c#6 - - - a5 - - - e5 - - - g5 - - - |
              f5 - - - a5 - - - d6 - - - c6 - - - | bb5 - - - a5 - - - g5 - - - f5 - - - |
              e5 - - - g5 - - - bb5 - - - a5 - - - | a5 - - - - - - - . . . . . . . .`,
      },
    },
    B: {
      bars: 8,
      chords: 'Dm | Dm | Eb | Eb | Gm | A7 | Dm | A7',
      parts: {
        drone: DRONE,
        heart: HEART,
        bass: BASS,
        strings: TREM,
        toms: RUMBLE,
        heart2: HEART_FAST,
        brass: STABS,
        box: `d6 - - - . . a5 - . . f5 - . . d5 - | e5 - - - f5 - - - a5 - - - . . . . |
              g5 - - - eb5 - - - bb4 - - - . . . . | bb5 - - - g5 - - - eb5 - - - d5 - - - |
              d5 - - - g5 - - - bb5 - - - d6 - - - | c#6 - - - e6 - - - g6 - - - e6 - - - |
              d6 - - - a5 - - - f5 - - - d5 - - - | e5 - - - c#5 - - - a4 - - - . . . .`,
      },
    },
    C: {
      bars: 4,
      chords: 'Bb | Gm | Eb | A7',
      parts: {
        drone: DRONE,
        heart: HEART,
        bass: BASS,
        strings: TREM,
        toms: RUMBLE,
        heart2: HEART_FAST,
        brass: STABS,
        box: `. . . . d6 - - - bb5 - - - f5 - - - | . . . . bb5 - - - g5 - - - d5 - - - |
              . . . . g5 - - - eb5 - - - bb4 - - - | a4 - - - c#5 - - - e5 - - - a5 - - -`,
      },
    },
  },
  form: ['intro', 'A', 'B', 'C'],
  loopFrom: 1,
};
