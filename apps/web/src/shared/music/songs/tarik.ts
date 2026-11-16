/**
 * "Tarik Terus!" (keep pulling!): Tarik Tambang, a 17 Agustus village contest.
 * School drum band (drumband) march in Bb, 128 bpm: marching snare with rolls and flams,
 * tuned bass drums, crash cymbals, trumpet-like brass melody, lyra (glockenspiel), pianika
 * off-beat chords and an oom-pah tuba.
 * Form: intro(4) → A(8) → A2(8) → B(8) → break(4) → A3(8), looping to A (36 bars ≈ 68 s).
 */

import { BRASS, CYMBAL, GLOCK, MARCH_BASS, PIANIKA, SNARE_MARCH, TUBA } from '../presets';
import type { Song } from '../synth';

const SNARES = {
  loop: 'x.xxX.x.x.xxX.x.|x.xxX.x.rrrrX.x.',
  fill: 'F.x.F.x.rrrrX.XX',
  every: 8,
};
const BASS_DRUMS = 'x...m.h.x...m...|x...m.h.x.h.m.l.';
const CYMBALS = 'x.......c.......|....c.......c...|x.......c.......|....c...c.c.X...';
const OOM_PAH = { loop: '1-......v-......', fill: '1-......v-..a-..', every: 4 };
const PAH = '....x.......x...';

const MELODY_A = `f4 - - f4 bb4 - - - d5 - - - bb4 - - - | g4 - - g4 c5 - - - eb5 - - - c5 - - - |
  f5 - - - eb5 - - - d5 - - - c5 - - - | bb4 - - - - - - - . . f4 - g4 - a4 - |
  bb4 - - bb4 d5 - - - f5 - - - d5 - - - | g5 - - - f5 - - - d5 - - - bb4 - - - |
  c5 - - c5 e5 - - - g5 - - - e5 - - - | f5 - - - c5 - a4 - f4 - - - . . . .`;

export const tarik: Song = {
  id: 'tarik',
  title: 'Tarik Terus!',
  bpm: 128,
  gain: 0.83,
  inst: {
    snare: { ...SNARE_MARCH, level: 0.35, pan: 0.12, rev: 0.12 },
    bd: { ...MARCH_BASS, level: 0.53, pan: -0.05 },
    cym: { ...CYMBAL, level: 0.26, pan: -0.25, rev: 0.1 },
    brass: { ...BRASS, level: 0.22, pan: -0.05, rev: 0.18, range: [53, 81] },
    glock: { ...GLOCK, level: 0.18, pan: 0.3, rev: 0.25, range: [72, 101], poly: 8 },
    pianika: { ...PIANIKA, level: 0.15, pan: -0.3, rev: 0.1 },
    tuba: { ...TUBA, level: 0.28, range: [34, 58] },
  },
  sections: {
    intro: {
      bars: 4,
      chords: 'Bb | Bb | F7 | F7',
      parts: {
        snare: 'F...F...F...F.F.|x.xxX.x.x.xxX.x.|x.xxX.x.rrrrX.x.|rrrrrrrrrrrrX...',
        bd: '................|................|x...m.h.x...m...|x...x...x.x.x...',
        cym: '................|................|x...............|............x...',
        brass: `. . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . . |
                . . . . . . . . . . . . . . . . | f4 - - f4 a4 - - a4 c5 - - c5 eb5 - - -`,
        tuba: '................|................|1-......v-......|1-......v-..a-..',
      },
    },
    A: {
      bars: 8,
      chords: 'Bb | Eb | F7 | Bb | Bb | Gm | C7 | F7',
      parts: {
        snare: SNARES,
        bd: BASS_DRUMS,
        cym: CYMBALS,
        brass: MELODY_A,
        glock: `. . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . . |
                . . . . . . . . . . . . . . . . | . . . . . . . . f6 - d6 - bb5 - f5 - |
                . . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . . |
                . . . . . . . . . . . . . . . . | . . . . . . . . a6 - f6 - c6 - a5 -`,
        pianika: PAH,
        tuba: OOM_PAH,
      },
    },
    A2: {
      bars: 8,
      chords: 'Bb | Eb | F7 | Bb | Gm | Eb | F7 | Bb',
      parts: {
        snare: SNARES,
        bd: BASS_DRUMS,
        cym: CYMBALS,
        brass: `f4 - - f4 bb4 - - - d5 - - - f5 - - - | eb5 - - eb5 g5 - - - eb5 - - - bb4 - - - |
                c5 - - c5 eb5 - - - a4 - - - c5 - - - | d5 - - - - - - - . . d5 - eb5 - e5 - |
                f5 - - - d5 - - - bb4 - - - g4 - - - | g4 - - g4 bb4 - - - eb5 - - - g5 - - - |
                f5 - - - eb5 - - - c5 - - - a4 - - - | bb4 - - - - - - - . . . . . . . .`,
        glock: {
          loop: `. . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . . |
                 . . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . .`,
          fill: `bb5 - d6 - f6 - bb6 - f6 - d6 - bb5 - - -`,
          every: 8,
        },
        pianika: '..x...x...x...x.',
        tuba: OOM_PAH,
      },
    },
    B: {
      bars: 8,
      chords: 'Eb | Eb | Bb | Bb | Cm | F7 | Bb | F7',
      parts: {
        snare: SNARES,
        bd: BASS_DRUMS,
        cym: CYMBALS,
        glock: `g5 - bb5 - eb6 - - - d6 - c6 - bb5 - - - | c6 - - - bb5 - - - g5 - - - . . . . |
                f5 - bb5 - d6 - - - c6 - bb5 - a5 - - - | bb5 - - - f5 - - - . . . . . . . . |
                eb6 - - - c6 - - - g5 - - - eb6 - - - | d6 - - - c6 - - - a5 - - - f5 - - - |
                bb5 - - - d6 - - - f6 - - - d6 - - - | c6 - - - - - - - . . . . . . . .`,
        brass: {
          loop: '................|........x.x.X-..',
          fill: 'x..x..x.X---....',
          every: 8,
        },
        pianika: '..x...x...x...x.',
        tuba: OOM_PAH,
      },
    },
    break: {
      bars: 4,
      chords: 'Bb | Bb | Bb | F7',
      parts: {
        snare: 'f.xxX.x.f.xxX.x.|x.xxX.xxrrrrX.x.|F.F.x.xxF.F.x.xx|rrrrrrrrX.X.XXXX',
        bd: 'x..hm..lx..hm..l|x.h.m.l.x.h.m.l.|x..hm..lx..hm..l|x.x.x.x.x...x...',
        cym: 'x...............|................|x...............|........c.c.X...',
        tuba: '1-..............|................|1-..............|1-......v-..a-..',
        brass: '................|................|................|x..x..x.X---....',
      },
    },
    A3: {
      bars: 8,
      chords: 'Bb | Eb | F7 | Bb | Bb | Gm | C7 | F7',
      parts: {
        snare: SNARES,
        bd: BASS_DRUMS,
        cym: CYMBALS,
        brass: MELODY_A,
        glock: { loop: MELODY_A, shift: 12 },
        pianika: '..x...x...x...x.',
        tuba: OOM_PAH,
      },
    },
  },
  form: ['intro', 'A', 'A2', 'B', 'break', 'A3'],
  loopFrom: 1,
};
