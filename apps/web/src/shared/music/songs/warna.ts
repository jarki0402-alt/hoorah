/**
 * "Gua Kunang" (firefly cave): Petualangan Warna, friends solving puzzles in a glowing cave.
 * A dreamy adventure in F, 100 bpm, straight. Marimba arpeggios, a round bass and a soft pad are
 * always on; adaptive layers join as the team gets closer to the doors: kick and shaker (tier 1,
 * playing), the flute tune (tier 2, half the team at their doors), glockenspiel sparkles,
 * tambourine and tom fills (tier 3, the last one on the way and the stage clear).
 * Form: intro(2) → A(8) → B(8) → C(4), looping to A (22 bars ≈ 53 s).
 */

import { BASS_ROUND, FLUTE, GLOCK, KICK, MARIMBA, PAD, SHAKER, TAMBOURINE, TOMS } from '../presets';
import type { Song } from '../synth';

const ARP = { loop: '1.3.5.8.5.3.1.3.', fill: '1.3.5.8.a.8.5.3.', every: 4 };
const BASS = { loop: '1...1...5...1...', fill: '1...1...5.5.8...', every: 4 };
const GLUE = 'x-------x-------';
const KICKS = 'x.......x.......';
const SHAKE = '..x...x...x...x.';
const SPARK = '8.5.8.a.8.5.3.5.';
const TAMB = '....x.......x...';
const FILLS = { loop: '................', fill: '..........h.x.l.', every: 4 };

export const warna: Song = {
  id: 'warna',
  title: 'Gua Kunang',
  bpm: 100,
  gain: 0.86,
  inst: {
    arp: { ...MARIMBA, level: 0.22, pan: -0.18, rev: 0.3 },
    bass: { ...BASS_ROUND, level: 0.26 },
    pad: { ...PAD, level: 0.08, rev: 0.4 },
    kick: { ...KICK, level: 0.26, tier: 1 },
    shaker: { ...SHAKER, level: 0.14, pan: 0.3, tier: 1 },
    lead: { ...FLUTE, level: 0.18, pan: 0.1, rev: 0.32, range: [62, 92], tier: 2 },
    glock: { ...GLOCK, level: 0.1, pan: 0.34, rev: 0.36, range: [72, 98], tier: 3 },
    tamb: { ...TAMBOURINE, level: 0.12, pan: -0.32, tier: 3 },
    toms: { ...TOMS, level: 0.18, tier: 3 },
  },
  sections: {
    intro: {
      bars: 2,
      chords: 'F | C',
      parts: { arp: ARP, pad: GLUE },
    },
    A: {
      bars: 8,
      chords: 'F | C | Dm | Bb | F | C | Bb | C',
      parts: {
        arp: ARP,
        bass: BASS,
        pad: GLUE,
        kick: KICKS,
        shaker: SHAKE,
        glock: SPARK,
        tamb: TAMB,
        toms: FILLS,
        lead: `a5 - - . c6 - a5 . f5 - - - . . . . | g5 - - . e5 - g5 . c6 - - - . . . . |
               f5 - - . a5 - d6 . c6 - a5 - . . . . | bb5 - - - a5 - g5 - f5 - - - . . . . |
               a5 - - . c6 - f6 . e6 - c6 - . . . . | d6 - - . c6 - g5 . e5 - g5 - . . . . |
               f5 - - . g5 - a5 . bb5 - d6 - c6 - bb5 - | a5 - - - g5 - - - . . . . . . . .`,
      },
    },
    B: {
      bars: 8,
      chords: 'Dm | Am | Bb | F | Gm | C | Bb C | F',
      parts: {
        arp: ARP,
        bass: BASS,
        pad: GLUE,
        kick: KICKS,
        shaker: SHAKE,
        glock: SPARK,
        tamb: TAMB,
        toms: FILLS,
        lead: `d6 - - . a5 - f5 . a5 - - - . . . . | c6 - - . a5 - e5 . a5 - - - . . . . |
               d6 - - . bb5 - f5 . bb5 - d6 - . . . . | c6 - - - a5 - - - f5 - - - . . . . |
               bb5 - - . g5 - d6 . bb5 - - - . . . . | c6 - - . e6 - g6 . e6 - - - . . . . |
               d6 - - . c6 - bb5 . c6 - - . e6 - - . | f6 - - - - - - - . . . . . . . .`,
      },
    },
    C: {
      bars: 4,
      chords: 'Bb | C | Dm | C',
      parts: {
        arp: ARP,
        bass: BASS,
        pad: GLUE,
        kick: KICKS,
        shaker: SHAKE,
        glock: SPARK,
        toms: FILLS,
        lead: `. . . . f6 - - . d6 - - . bb5 - - . | . . . . g6 - - . e6 - - . c6 - - . |
               . . . . a6 - - . f6 - - . d6 - - . | e6 - - - - - - - c6 - - - - - - -`,
      },
    },
  },
  form: ['intro', 'A', 'B', 'C'],
  loopFrom: 1,
};
