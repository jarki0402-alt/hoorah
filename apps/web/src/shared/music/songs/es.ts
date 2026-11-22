/**
 * "Bongkah Licin" (slippery floe): Seluncur Es, fruit skaters on a shrinking ice floe. A frosty,
 * bouncy groove in D minor, 106 bpm. A cool pad and pizzicato bass hold the floor; glockenspiel
 * sparkles like ice, marimba carries the tune, a woodblock ticks while everyone aims, and claps,
 * toms and tambourine pile on for the last skaters standing.
 * Adaptive layers: tier 0 pad + pizz bass (cards, scores), tier 1 woodblock, kick and hats (aiming),
 * tier 2 marimba tune and claps (sliding, final aim), tier 3 glockenspiel, toms and tambourine
 * (the last skaters, the final round).
 * Form: intro(2) → A(8) → B(8) → C(8), looping to A (24 bars ≈ 54 s).
 */

import { CLAP, GLOCK, HAT, KICK, MARIMBA, PAD, PIZZ, TAMBOURINE, TOMS, WOODBLOCK } from '../presets';
import type { Song } from '../synth';

const PADS = 'x...............';
const BASS = { loop: '1..5..1.8..5..3.', fill: '1..5..1.8.5.3.1.', every: 4 };
const TICKS = { loop: 'x...x...x...x...', fill: 'x.x.x.x.x.x.xxxx', every: 4 };
const KICKS = 'x.....x...x.....';
const HATS = '..x...x...x...x.';
const CLAPS = '....x.......x...';
const SPARKS = { loop: '8.5.3.5.8...5...', fill: '8.5.3.5.8.5.3.5.', every: 2 };
const ROLLS = { loop: '................', fill: 'h.h.x.x.l.l.lxlx', every: 4 };
const TAMB = '..x...x...x...x.';

const TUNE_A = `d5 - . f5 a5 - . f5 e5 - . c5 a4 - - . | bb4 - . d5 f5 - . d5 c5 - - . a4 - - . |
                d5 - . f5 a5 - . c6 bb5 - . a5 g5 - - . | a5 - - - e5 - - . c#5 - - . e5 - - . |
                f5 - . a5 d6 - . a5 c6 - . a5 g5 - - . | bb5 - . g5 d5 - . g5 f5 - - . d5 - - . |
                e5 - . g5 bb5 - . g5 a5 - . f5 e5 - - . | d5 - - - - - - . a4 . d5 . f5 . a5 .`;

const TUNE_B = `g5 - . bb5 d6 - . bb5 a5 - . f5 d5 - - . | f5 - . a5 c6 - . a5 g5 - . e5 c5 - - . |
                bb4 - . d5 f5 - . bb5 a5 - . f5 d5 - - . | a4 - . c#5 e5 - . a5 g5 - - - e5 - - . |
                g5 . bb5 . d6 . bb5 . a5 . f5 . d5 . f5 . | f5 . a5 . c6 . a5 . g5 . e5 . c5 . e5 . |
                bb4 . d5 . f5 . bb5 . a5 . f5 . d5 . f5 . | e5 - - - a5 - - - c#6 - - - - - - .`;

export const es: Song = {
  id: 'es',
  title: 'Bongkah Licin',
  bpm: 106,
  gain: 0.9,
  delay: { beats: 0.75, feedback: 0.32, tone: 3200 },
  inst: {
    pad: { ...PAD, level: 0.15, rev: 0.4 },
    bass: { ...PIZZ, level: 0.3 },
    block: { ...WOODBLOCK, level: 0.16, pan: 0.25, tier: 1 },
    lead: { ...MARIMBA, level: 0.26, pan: -0.1, rev: 0.22, range: [57, 90], tier: 2 },
    glock: { ...GLOCK, level: 0.1, pan: 0.3, dly: 0.3, rev: 0.3, tier: 3 },
    kick: { ...KICK, level: 0.34, tier: 1 },
    hat: { ...HAT, level: 0.16, pan: 0.3, tier: 1 },
    clap: { ...CLAP, level: 0.16, rev: 0.15, tier: 2 },
    toms: { ...TOMS, level: 0.24, pan: -0.2, rev: 0.12, tier: 3 },
    tamb: { ...TAMBOURINE, level: 0.11, pan: -0.3, tier: 3 },
  },
  sections: {
    intro: {
      bars: 2,
      chords: 'Dm | A',
      parts: {
        pad: PADS,
        bass: '1.......1.......|1...5...1.5.8.5.',
        glock: '8...5...3...1...|8.5.3.5.8.......',
      },
    },
    A: {
      bars: 8,
      chords: 'Dm | Bb | Dm | A | Dm | Gm | C | Dm',
      parts: {
        pad: PADS,
        bass: BASS,
        block: TICKS,
        lead: TUNE_A,
        glock: SPARKS,
        kick: KICKS,
        hat: HATS,
        clap: CLAPS,
        toms: ROLLS,
        tamb: TAMB,
      },
    },
    B: {
      bars: 8,
      chords: 'Gm | F | Bb | A | Gm | F | Bb | A',
      parts: {
        pad: PADS,
        bass: { loop: '1.5.1.5.1.5.8.5.', fill: '1.5.8.5.1.3.5.8.', every: 4 },
        block: { loop: 'x.x.x.x.x.x.x.x.', fill: 'x.x.x.x.xxxxxxxx', every: 4 },
        lead: TUNE_B,
        glock: { loop: '8...8...5...5...', fill: '8.8.5.5.3.3.1.1.', every: 4 },
        kick: { loop: 'x...x...x...x...', fill: 'x...x...x.x.x.x.', every: 4 },
        hat: 'x.x.x.x.x.x.x.x.',
        clap: CLAPS,
        toms: ROLLS,
        tamb: 'x.x.x.x.x.x.x.x.',
      },
    },
    C: {
      bars: 8,
      chords: 'Bb | C | Am | Dm | Bb | C | A | A',
      parts: {
        pad: 'x.......x.......',
        bass: '1...1...5...5...',
        block: { loop: 'x.......x.......', fill: 'x...x...x.x.x.x.', every: 4 },
        glock: { loop: '8.5.3.5.8.5.3.5.', fill: '1.3.5.8.1.3.5.8.', every: 4 },
        kick: KICKS,
        hat: '....x.......x...',
        clap: { loop: '................', fill: '....x.......x.xx', every: 4 },
        toms: { loop: '................', fill: 'h.x.l.h.x.l.hxlx', every: 4 },
        tamb: TAMB,
      },
    },
  },
  form: ['intro', 'A', 'B', 'C'],
  loopFrom: 1,
};
