/**
 * "Arena Tempur": Bajaj Rush, battle arena.
 * Intense and driving in E minor, 150 bpm. Punchy kick and snare with a clap layer, 16th hats,
 * tom fills, a gritty overdriven saw bass, a square-wave arpeggio, brass power stabs and a
 * short heroic trumpet riff.
 * Form: intro(4) → A(8) → B(8) → break(4) → A2(8) → B2(8), looping to A (36 bars ≈ 58 s).
 */

import {
  BASS_SAW,
  BRASS,
  CLAP,
  CYMBAL,
  HAT,
  KICK_PUNCH,
  PAD,
  SNARE,
  SYNTH_PLUCK,
  TOMS,
  TRUMPET,
} from '../presets';
import type { Song } from '../synth';

const KICKS = { loop: 'x...x...x...x.x.|x...x...x..xx...', fill: 'x...x...x.x.x.x.', every: 8 };
const SNARES = { loop: '....x.......x...', fill: '....x...x.xxXXXX', every: 8 };
const TOM_FILL = { loop: '................', fill: '........hhxxllLL', every: 8 };
const CRASH = { loop: 'x...............|................|................|................' };
const PUMP = '1.1.1.1.1.1.8.7.|1.1.1.1.1.1.8.5.';
const GALLOP = '1.111.111.111.18|1.111.111.111.a.';
const ARP = '1358531813585318';
const STABS_A = 'X..X..X.........|................';

const LEAD_A = `e5 - - - - - b4 - e5 - g5 - - - f#5 - | e5 - - - d5 - c5 - - - d5 - e5 - - - |
  d5 - - - - - b4 - d5 - g5 - - - a5 - | f#5 - - - - - - - a5 - - - d6 - - - |
  b5 - - - - - g5 - e5 - - - b5 - - - | c6 - - - b5 - - - g5 - - - e5 - - - |
  a5 - - - c6 - - - b5 - a5 - g5 - - - | f#5 - - - - - - - d#5 - - - f#5 - a5 -`;

const LEAD_B = `e5 - - e5 g5 - - - c6 - - - b5 - g5 - | a5 - - - - - - - f#5 - - - a5 - d6 - |
  b5 - - - - - - - g5 - - - e5 - - - | f#5 - - - g5 - - - a5 - - - b5 - - - |
  c6 - - c6 c6 - - - g5 - - - e5 - - - | d6 - - d6 d6 - - - a5 - - - f#5 - - - |
  b5 - - - - - - - a5 - - - f#5 - - - | d#5 - - - f#5 - - - b5 - - - a5 - - -`;

export const arena: Song = {
  id: 'bajaj-arena',
  title: 'Arena Tempur',
  bpm: 150,
  gain: 0.75,
  inst: {
    kick: { ...KICK_PUNCH, level: 0.39 },
    snare: { ...SNARE, level: 0.17, rev: 0.12 },
    clap: { ...CLAP, level: 0.2, rev: 0.1 },
    hat: { ...HAT, level: 0.29, pan: 0.3 },
    cym: { ...CYMBAL, level: 0.22, pan: -0.25, rev: 0.1 },
    toms: { ...TOMS, level: 0.26, pan: -0.1, rev: 0.12, poly: 6 },
    bass: { ...BASS_SAW, level: 0.12, drive: 0.5, range: [31, 55] },
    arp: { ...SYNTH_PLUCK, level: 0.125, pan: 0.25, rev: 0.15 },
    brass: { ...BRASS, level: 0.135, pan: -0.15, rev: 0.18, range: [55, 79] },
    lead: { ...TRUMPET, level: 0.24, pan: 0.08, rev: 0.2, range: [59, 86] },
    pad: { ...PAD, level: 0.037, rev: 0.4 },
  },
  sections: {
    intro: {
      bars: 4,
      chords: 'Em | Em | C | D',
      parts: {
        kick: 'x...x...x...x...',
        toms: 'l.......l.......|l.......l...l.l.|l...l...x...x...|h.h.x.x.l.l.LLLL',
        snare: '................|................|r.r.r.r.r.r.r.r.|rrrrrrrrrrrrRRRR',
        bass: '1.1.1.1.1.1.1.1.',
        cym: '................|................|................|............x...',
      },
    },
    A: {
      bars: 8,
      chords: 'Em | C | G | D | Em | C | Am | B7',
      parts: {
        kick: KICKS,
        snare: SNARES,
        clap: '....x.......x...',
        hat: 'x.x.x.x.x.x.x.x.',
        cym: CRASH,
        toms: TOM_FILL,
        bass: PUMP,
        arp: ARP,
        brass: STABS_A,
        lead: LEAD_A,
      },
    },
    B: {
      bars: 8,
      chords: 'C | D | Em | Em | C | D | B7 | B7',
      parts: {
        kick: KICKS,
        snare: SNARES,
        clap: '....x.......x...',
        hat: 'xoxoxoxoxoxoxoxo',
        cym: CRASH,
        toms: TOM_FILL,
        bass: GALLOP,
        arp: ARP,
        brass: 'x-------x-------',
        lead: LEAD_B,
        pad: 'x---------------',
      },
    },
    break: {
      bars: 4,
      chords: 'Em | Em | C | D',
      parts: {
        kick: 'x...............|x.......x.......|x...............|x.x.x.x.x.x.x.x.',
        snare: '........x.......|........x.......|........x.......|....x.x.rrrrXXXX',
        hat: 'x...x...x...x...',
        bass: '1-------........|1-------........|1-------........|1.1.1.1.1.1.1.1.',
        brass: 'X-----..........|X-----..........|X-----..........|X..X..X.X.X.X-..',
        pad: 'x---------------',
        cym: 'x...............|x...............|x...............|........c.c.x...',
      },
    },
    A2: {
      bars: 8,
      chords: 'Em | C | G | D | Em | C | Am | B7',
      parts: {
        kick: KICKS,
        snare: SNARES,
        clap: '....x.......x...',
        hat: 'xoxoxoxoxoxoxoxo',
        cym: CRASH,
        toms: TOM_FILL,
        bass: PUMP,
        arp: ARP,
        brass: { loop: LEAD_A, shift: -12 },
        lead: LEAD_A,
      },
    },
    B2: {
      bars: 8,
      chords: 'C | D | Em | Em | C | D | B7 | B7',
      parts: {
        kick: KICKS,
        snare: SNARES,
        clap: '....x.......x...',
        hat: 'xoxoxoxoxoxoxoxo',
        cym: CRASH,
        toms: TOM_FILL,
        bass: GALLOP,
        arp: ARP,
        brass: 'x-------x---x---',
        lead: LEAD_B,
        pad: 'x---------------',
      },
    },
  },
  form: ['intro', 'A', 'B', 'break', 'A2', 'B2'],
  loopFrom: 1,
};
