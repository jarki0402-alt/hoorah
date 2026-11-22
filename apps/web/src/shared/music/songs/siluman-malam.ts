/**
 * "Bulan di Atas Rumah" (the moon over the houses): Kampung Siluman at night, eyes closed.
 * A slow, hushed piece in D minor, 69 bpm: a dark pad, a low bass and a gong breathing every
 * phrase are always on, quiet enough to hear the role calls over; adaptive layers join while a
 * role is awake: soft marimba drops and a muffled kendang (tier 1), a suling that wanders like
 * a wind through the bamboo (tier 2, the siluman's turn), a slow heartbeat on the toms (tier 3).
 * Form: intro(2) → A(8) → B(4) → C(4), looping to A (16 bars ≈ 56 s).
 */

import { FLUTE, GONG, KENDANG, MARIMBA, PAD, PIZZ, TOMS } from '../presets';
import type { Song } from '../synth';

const DRONE = 'x---------------';
const BASS = '1.......5.......|1...........5...';
const DROPS = 'x.....x.........|..........x.....';
const MUFFLE = { loop: 'b.......b..b....', fill: 'b.......b..b..p.', every: 4 };
const HEART = 'l..l............';
const GONGS = '1...............|................';

export const silumanMalam: Song = {
  id: 'siluman-malam',
  title: 'Bulan di Atas Rumah',
  bpm: 69,
  gain: 0.9,
  inst: {
    pad: { ...PAD, level: 0.08, rev: 0.5 },
    bass: { ...PIZZ, level: 0.26, range: [33, 55] },
    gong: { ...GONG, level: 0.18, rev: 0.4 },
    marimba: { ...MARIMBA, level: 0.11, pan: -0.25, rev: 0.4, tier: 1 },
    kendang: { ...KENDANG, level: 0.18, pan: 0.15, tier: 1 },
    suling: { ...FLUTE, level: 0.12, pan: 0.18, rev: 0.45, range: [62, 86], tier: 2 },
    toms: { ...TOMS, level: 0.2, tier: 3 },
  },
  sections: {
    intro: {
      bars: 2,
      chords: 'Dm | Dm',
      parts: {
        pad: DRONE,
        gong: '1...............|................',
        bass: '1...............|................',
      },
    },
    A: {
      bars: 8,
      chords: 'Dm | Dm | Bb | A | Dm | Gm | Bb | A',
      parts: {
        pad: DRONE,
        bass: BASS,
        gong: GONGS,
        marimba: DROPS,
        kendang: MUFFLE,
        toms: HEART,
        suling: `d5 - - - - - - - f5 - - - e5 - d5 - | a4 - - - - - - - . . . . . . . . |
                 f5 - - - - - g5 - a5 - - - - - - - | e5 - - - c#5 - - - . . . . . . . . |
                 d5 - - - f5 - - - a5 - - - g5 - f5 - | g5 - - - - - - - d5 - - - . . . . |
                 bb4 - - - d5 - - - f5 - - - e5 - d5 - | e5 - - - - - - - . . . . . . . .`,
      },
    },
    B: {
      bars: 4,
      chords: 'Gm | Dm | Eb | A',
      parts: {
        pad: DRONE,
        bass: BASS,
        gong: GONGS,
        marimba: DROPS,
        kendang: MUFFLE,
        toms: HEART,
        suling: `g5 - - - - - bb5 - a5 - - - g5 - - - | f5 - - - - - - - d5 - - - . . . . |
                 eb5 - - - g5 - - - bb5 - - - a5 - g5 - | a5 - - - - - - - . . . . . . . .`,
      },
    },
    C: {
      bars: 4,
      chords: 'Bb | Gm | A | A',
      parts: {
        pad: DRONE,
        bass: '1...............',
        gong: '1...............|................|1...............|................',
        marimba: DROPS,
        kendang: MUFFLE,
        toms: HEART,
        suling: `f5 - - - - - - - d5 - - - bb4 - - - | g4 - - - - - - - bb4 - - - d5 - - - |
                 c#5 - - - - - - - e5 - - - a4 - - - | a4 - - - - - - - . . . . . . . .`,
      },
    },
  },
  form: ['intro', 'A', 'B', 'C'],
  loopFrom: 1,
};
