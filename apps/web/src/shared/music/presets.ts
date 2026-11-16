/**
 * Reusable instrument sounds. Songs spread a preset and set their own mix:
 *   ep: { ...EPIANO, level: 0.2, pan: -0.2, rev: 0.25 }
 * Pure data: importing this file creates no audio nodes.
 */

import type { DrumDef, PluckDef, ToneDef } from './synth';

type Preset<T> = Omit<T, 'level'>;

/* ------------------------------------------------------------------ keys & mallets (FM) */

/** Electric piano: 2-op FM, bright bark on the attack that mellows as it rings. */
export const EPIANO: Preset<ToneDef> = {
  kind: 'tone',
  layers: [{ wave: 'sine' }],
  fm: { ratio: 1, index: 1.8, end: 0, decay: 0.28 },
  env: { a: 0.004, d: 1.4, s: 0.3, r: 0.28 },
  range: [53, 74],
  voices: 4,
  strum: 0.007,
  poly: 10,
};

/** Vibraphone: soft mallet on a bar (partial at 4×), long ring; pair with `trem`. */
export const VIBES: Preset<ToneDef> = {
  kind: 'tone',
  layers: [{ wave: 'sine' }],
  fm: { ratio: 4, index: 0.55, end: 0, decay: 0.25 },
  env: { a: 0.002, d: 3, s: 0.12, r: 0.7 },
  range: [60, 88],
  poly: 6,
};

/** Marimba: woody, short, rounded. */
export const MARIMBA: Preset<ToneDef> = {
  kind: 'tone',
  layers: [{ wave: 'sine' }],
  fm: { ratio: 4, index: 1.4, end: 0, decay: 0.07 },
  env: { a: 0.001, d: 0.75, s: 0, r: 0.15 },
  fixed: 0.75,
  range: [55, 84],
  poly: 6,
};

/** Xylophone: hard mallet, bright and dry. */
export const XYLO: Preset<ToneDef> = {
  kind: 'tone',
  layers: [{ wave: 'sine' }],
  fm: { ratio: 3, index: 2.2, end: 0, decay: 0.04 },
  env: { a: 0.001, d: 0.4, s: 0, r: 0.1 },
  fixed: 0.4,
  range: [67, 96],
  poly: 4,
};

/** Glockenspiel / lyra: metal bars, inharmonic shimmer, long ring. */
export const GLOCK: Preset<ToneDef> = {
  kind: 'tone',
  layers: [{ wave: 'sine' }],
  fm: { ratio: 2.76, index: 0.9, end: 0, decay: 0.15 },
  env: { a: 0.001, d: 1.4, s: 0, r: 0.3 },
  fixed: 1.1,
  range: [72, 98],
  poly: 6,
};

/** Steel pan: round FM bell with a strong octave partial. */
export const STEELPAN: Preset<ToneDef> = {
  kind: 'tone',
  layers: [{ wave: 'pan' }],
  fm: { ratio: 1, index: 2, end: 0, decay: 0.22 },
  env: { a: 0.003, d: 1.1, s: 0, r: 0.25 },
  fixed: 0.9,
  range: [62, 88],
  poly: 6,
};

/** Drawbar-style organ for chord stabs. */
export const ORGAN: Preset<ToneDef> = {
  kind: 'tone',
  layers: [{ wave: 'organ' }],
  env: { a: 0.006, d: 0.12, s: 0.85, r: 0.05 },
  range: [57, 76],
  voices: 3,
  poly: 9,
};

/** Pianika (melodica): reedy, the sound of every school drum band. */
export const PIANIKA: Preset<ToneDef> = {
  kind: 'tone',
  layers: [{ wave: 'reed' }],
  filter: { f: 2600, q: 0.5 },
  env: { a: 0.02, d: 0.15, s: 0.85, r: 0.06 },
  vib: { rate: 5, depth: 7, delay: 0.3 },
  range: [60, 84],
  voices: 3,
  poly: 9,
};

/** Soft airy pad (one rolled-off saw-like wave, slow swell). */
export const PAD: Preset<ToneDef> = {
  kind: 'tone',
  layers: [{ wave: 'soft' }],
  env: { a: 0.7, d: 1, s: 0.8, r: 1.1 },
  gate: 1,
  range: [55, 76],
  voices: 3,
  poly: 7,
};

/** Gong / kempul: low bronze hum with a slow beat between two close partials. */
export const GONG: Preset<ToneDef> = {
  kind: 'tone',
  layers: [{ wave: 'sine' }, { wave: 'sine', ratio: 2, detune: 9, gain: 0.35 }],
  fm: { ratio: 1.5, index: 0.8, end: 0, decay: 0.3 },
  env: { a: 0.012, d: 3.5, s: 0, r: 0.8 },
  fixed: 2.6,
  range: [36, 60],
  poly: 2,
};

/** Short square-wave synth pluck for driving arpeggios. */
export const SYNTH_PLUCK: Preset<ToneDef> = {
  kind: 'tone',
  layers: [{ wave: 'square' }],
  filter: { f: 1300, track: 0.4, q: 3, env: 3, d: 0.09 },
  env: { a: 0.002, d: 0.14, s: 0, r: 0.05 },
  range: [52, 84],
  poly: 4,
};

/* ------------------------------------------------------------------ winds & brass */

/** Breathy flute / suling: sine core, chiff and breath noise, delayed vibrato. */
export const FLUTE: Preset<ToneDef> = {
  kind: 'tone',
  layers: [{ wave: 'flute' }],
  env: { a: 0.045, d: 0.25, s: 0.82, r: 0.09 },
  vib: { rate: 5.3, depth: 16, delay: 0.2 },
  breath: { vol: 0.28, ratio: 3, q: 1.4, decay: 0.09, sustain: 0.22 },
  range: [67, 93],
  poly: 3,
};

/** Bright brass section for stabs and fanfares. */
export const BRASS: Preset<ToneDef> = {
  kind: 'tone',
  layers: [
    { wave: 'sawtooth', detune: -6 },
    { wave: 'sawtooth', detune: 6 },
  ],
  filter: { f: 850, track: 0.8, q: 1.1, env: 3.2, a: 0.035, d: 0.25 },
  env: { a: 0.02, d: 0.25, s: 0.7, r: 0.09 },
  scoop: { cents: 30, time: 0.05 },
  range: [58, 79],
  voices: 3,
  poly: 9,
};

/** Solo trumpet-like lead with vibrato. */
export const TRUMPET: Preset<ToneDef> = {
  kind: 'tone',
  layers: [{ wave: 'sawtooth' }],
  filter: { f: 1100, track: 0.9, q: 1.4, env: 2.8, a: 0.03, d: 0.22 },
  env: { a: 0.025, d: 0.2, s: 0.75, r: 0.08 },
  vib: { rate: 5.6, depth: 13, delay: 0.25 },
  scoop: { cents: 45, time: 0.06 },
  range: [60, 86],
  poly: 3,
};

/* ------------------------------------------------------------------ basses */

/** Round, soft bass for lounge music. */
export const BASS_ROUND: Preset<ToneDef> = {
  kind: 'tone',
  layers: [{ wave: 'round' }],
  filter: { f: 650, q: 0.5 },
  env: { a: 0.012, d: 0.6, s: 0.6, r: 0.12 },
  range: [36, 60],
  poly: 2,
};

/** Funk bass: resonant filter pluck plus a sine sub. */
export const BASS_FUNK: Preset<ToneDef> = {
  kind: 'tone',
  layers: [{ wave: 'funk' }],
  filter: { f: 330, track: 0.6, q: 4, env: 4.5, d: 0.16 },
  env: { a: 0.003, d: 0.3, s: 0.55, r: 0.06 },
  range: [33, 57],
  poly: 2,
};

/** Electric bass, fingered. */
export const BASS_ELECTRIC: Preset<ToneDef> = {
  kind: 'tone',
  layers: [{ wave: 'ebass' }],
  filter: { f: 850, track: 0.3, q: 1, env: 2.2, d: 0.14 },
  env: { a: 0.004, d: 0.25, s: 0.7, r: 0.06 },
  range: [33, 57],
  poly: 2,
};

/** Tuba / sousaphone. */
export const TUBA: Preset<ToneDef> = {
  kind: 'tone',
  layers: [{ wave: 'tuba' }],
  filter: { f: 480, track: 0.5, q: 0.7, env: 1.8, a: 0.04, d: 0.2 },
  env: { a: 0.03, d: 0.2, s: 0.8, r: 0.08 },
  scoop: { cents: 30, time: 0.05 },
  range: [33, 57],
  poly: 2,
};

/** Gritty saw bass for the battle arena (pair with `drive`). */
export const BASS_SAW: Preset<ToneDef> = {
  kind: 'tone',
  layers: [
    { wave: 'sawtooth', detune: -7 },
    { wave: 'sawtooth', detune: 7 },
  ],
  filter: { f: 260, track: 0.5, q: 5, env: 6, d: 0.12 },
  env: { a: 0.002, d: 0.2, s: 0.75, r: 0.05 },
  range: [28, 52],
  poly: 2,
};

/* ------------------------------------------------------------------ plucked strings (Karplus–Strong) */

/** Ukulele chord strums (the "cak" of keroncong, the skank of the beach song). */
export const UKULELE: Preset<PluckDef> = {
  kind: 'pluck',
  t60: 1.1,
  bright: 0.7,
  pick: 0.14,
  len: 0.9,
  strum: 0.011,
  range: [60, 76],
  voices: 4,
  poly: 12,
};

/** Small high ukulele (the "cuk"). */
export const CUK: Preset<PluckDef> = {
  kind: 'pluck',
  t60: 0.8,
  bright: 0.85,
  pick: 0.1,
  len: 0.7,
  strum: 0.008,
  range: [67, 84],
  voices: 3,
  poly: 9,
};

/** Kacapi (Sundanese zither): bright, long, metallic. */
export const KACAPI: Preset<PluckDef> = {
  kind: 'pluck',
  t60: 2.4,
  bright: 0.95,
  pick: 0.07,
  len: 1.6,
  range: [55, 88],
  poly: 8,
};

/** Clavinet-like funk comping: thin, nasal, quickly damped. */
export const CLAV: Preset<PluckDef> = {
  kind: 'pluck',
  t60: 0.7,
  bright: 1,
  pick: 0.05,
  len: 0.6,
  gate: 0.75,
  strum: 0.004,
  range: [57, 74],
  voices: 3,
  poly: 9,
};

/** Pizzicato cello as a bass. */
export const PIZZ: Preset<PluckDef> = {
  kind: 'pluck',
  t60: 0.9,
  bright: 0.35,
  pick: 0.22,
  len: 1,
  range: [36, 60],
  poly: 3,
};

/* ------------------------------------------------------------------ angklung */

/** Angklung: bamboo tubes an octave apart, rattled while the note is held. */
export const ANGKLUNG: Preset<ToneDef> = {
  kind: 'tone',
  layers: [{ wave: 'bamboo' }],
  env: { a: 0.002, d: 0.1, s: 1, r: 0.09 },
  rattle: { rate: 13, decay: 0.075 },
  range: [62, 86],
  voices: 3,
  poly: 6,
};

/* ------------------------------------------------------------------ drums & percussion */

export const KICK: Preset<DrumDef> = {
  kind: 'drum',
  strokes: {
    x: {
      tone: { f: 125, to: 46, pd: 0.09, decay: 0.32, vol: 1 },
      noise: { type: 'lowpass', f: 1500, decay: 0.012, vol: 0.12 },
    },
  },
  poly: 3,
};

export const KICK_PUNCH: Preset<DrumDef> = {
  kind: 'drum',
  strokes: {
    x: {
      tone: { f: 165, to: 44, pd: 0.065, decay: 0.36, vol: 1 },
      noise: { type: 'highpass', f: 2800, decay: 0.008, vol: 0.3 },
    },
  },
  poly: 3,
};

export const SNARE: Preset<DrumDef> = {
  kind: 'drum',
  vol: 2,
  strokes: {
    x: {
      tone: { f: 205, to: 170, pd: 0.03, decay: 0.09, vol: 0.45, wave: 'triangle' },
      noise: { type: 'highpass', f: 1400, q: 0.7, decay: 0.17, vol: 0.75 },
    },
  },
  poly: 4,
};

/** High-tuned marching snare: crisp, made for rolls and flams. */
export const SNARE_MARCH: Preset<DrumDef> = {
  kind: 'drum',
  vol: 1.6,
  strokes: {
    x: {
      tone: { f: 340, to: 300, pd: 0.02, decay: 0.06, vol: 0.38, wave: 'triangle' },
      noise: { type: 'bandpass', f: 4300, q: 0.55, decay: 0.13, vol: 0.9 },
    },
    // Rim click
    k: {
      tone: { f: 1900, decay: 0.02, vol: 0.3, wave: 'triangle' },
      noise: { type: 'bandpass', f: 3500, q: 2, decay: 0.025, vol: 0.5 },
    },
  },
  poly: 6,
};

export const CLAP: Preset<DrumDef> = {
  kind: 'drum',
  vol: 3,
  strokes: { x: { noise: { type: 'bandpass', f: 1250, q: 1.1, decay: 0.17, vol: 0.95, claps: 4 } } },
  poly: 3,
};

export const HAT: Preset<DrumDef> = {
  kind: 'drum',
  vol: 1.6,
  strokes: {
    x: { noise: { type: 'highpass', f: 7600, decay: 0.035, vol: 0.5 } },
    h: { noise: { type: 'highpass', f: 7000, decay: 0.24, vol: 0.38 } },
  },
  poly: 4,
};

export const SHAKER: Preset<DrumDef> = {
  kind: 'drum',
  vol: 1.5,
  strokes: { x: { noise: { type: 'bandpass', f: 6200, q: 1.3, a: 0.012, decay: 0.06, vol: 0.6 } } },
  poly: 4,
};

export const TAMBOURINE: Preset<DrumDef> = {
  kind: 'drum',
  vol: 1.8,
  strokes: {
    x: { noise: { type: 'bandpass', f: 7800, q: 2.6, decay: 0.12, vol: 0.75 } },
    // Shake (slower swell, longer jingle)
    s: { noise: { type: 'bandpass', f: 7400, q: 2.2, a: 0.02, decay: 0.2, vol: 0.5 } },
  },
  poly: 4,
};

export const WOODBLOCK: Preset<DrumDef> = {
  kind: 'drum',
  vol: 1.6,
  strokes: {
    x: {
      tone: { f: 1050, to: 1000, pd: 0.01, decay: 0.07, vol: 0.7 },
      noise: { type: 'bandpass', f: 2100, q: 4, decay: 0.015, vol: 0.25 },
    },
    l: {
      tone: { f: 760, to: 730, pd: 0.01, decay: 0.08, vol: 0.7 },
      noise: { type: 'bandpass', f: 1600, q: 4, decay: 0.015, vol: 0.25 },
    },
  },
  poly: 3,
};

export const CLAVES: Preset<DrumDef> = {
  kind: 'drum',
  vol: 1.3,
  strokes: { x: { tone: { f: 2500, decay: 0.06, vol: 0.55 } } },
  poly: 2,
};

/** Cross-stick / rim click. */
export const RIM: Preset<DrumDef> = {
  kind: 'drum',
  vol: 3,
  strokes: {
    x: {
      tone: { f: 1700, decay: 0.03, vol: 0.4, wave: 'triangle' },
      noise: { type: 'bandpass', f: 2500, q: 2, decay: 0.03, vol: 0.5 },
    },
  },
  poly: 3,
};

/** Brushes on a snare: "x" tap, "s" sweep. */
export const BRUSH: Preset<DrumDef> = {
  kind: 'drum',
  vol: 2.5,
  strokes: {
    x: { noise: { type: 'bandpass', f: 3200, q: 0.6, a: 0.004, decay: 0.12, vol: 0.55 } },
    s: { noise: { type: 'bandpass', f: 2600, q: 0.5, a: 0.06, decay: 0.2, vol: 0.3 } },
  },
  poly: 4,
};

/** "x" crash, "c" choked crash, "b" ride bell. */
export const CYMBAL: Preset<DrumDef> = {
  kind: 'drum',
  vol: 1.2,
  strokes: {
    x: { noise: { type: 'highpass', f: 4800, q: 0.5, decay: 1.4, vol: 0.45 } },
    c: { noise: { type: 'highpass', f: 4500, q: 0.5, decay: 0.14, vol: 0.55 } },
    b: {
      tone: { f: 2350, decay: 0.5, vol: 0.12, wave: 'triangle' },
      noise: { type: 'highpass', f: 6000, decay: 0.3, vol: 0.18 },
    },
  },
  poly: 3,
};

/** Toms: "h" high, "x" mid, "l" low. */
export const TOMS: Preset<DrumDef> = {
  kind: 'drum',
  strokes: {
    h: { tone: { f: 250, to: 175, pd: 0.12, decay: 0.28, vol: 0.85 } },
    x: { tone: { f: 185, to: 125, pd: 0.13, decay: 0.32, vol: 0.9 } },
    l: { tone: { f: 125, to: 82, pd: 0.15, decay: 0.38, vol: 0.95 } },
  },
  poly: 4,
};

/** Marching bass drums, tuned high to low: "h", "m", "x", "l". */
export const MARCH_BASS: Preset<DrumDef> = {
  kind: 'drum',
  strokes: {
    h: {
      tone: { f: 150, to: 108, pd: 0.09, decay: 0.32, vol: 0.85 },
      noise: { type: 'lowpass', f: 900, decay: 0.02, vol: 0.25 },
    },
    m: {
      tone: { f: 118, to: 84, pd: 0.1, decay: 0.38, vol: 0.9 },
      noise: { type: 'lowpass', f: 700, decay: 0.025, vol: 0.25 },
    },
    x: {
      tone: { f: 92, to: 60, pd: 0.11, decay: 0.45, vol: 1 },
      noise: { type: 'lowpass', f: 500, decay: 0.03, vol: 0.3 },
    },
    l: {
      tone: { f: 72, to: 48, pd: 0.12, decay: 0.5, vol: 1 },
      noise: { type: 'lowpass', f: 400, decay: 0.03, vol: 0.3 },
    },
  },
  poly: 4,
};

/** Congas: "x" open, "s" slap, "l" low (tumba), "m" muted. */
export const CONGA: Preset<DrumDef> = {
  kind: 'drum',
  strokes: {
    x: {
      tone: { f: 340, to: 318, pd: 0.03, decay: 0.22, vol: 0.75 },
      noise: { type: 'highpass', f: 2500, decay: 0.01, vol: 0.15 },
    },
    s: {
      tone: { f: 420, to: 380, pd: 0.02, decay: 0.05, vol: 0.4 },
      noise: { type: 'bandpass', f: 1900, q: 1, decay: 0.05, vol: 0.6 },
    },
    l: {
      tone: { f: 230, to: 212, pd: 0.04, decay: 0.28, vol: 0.8 },
      noise: { type: 'highpass', f: 2200, decay: 0.01, vol: 0.12 },
    },
    m: {
      tone: { f: 330, to: 300, pd: 0.02, decay: 0.045, vol: 0.5 },
    },
  },
  poly: 4,
};

/**
 * Javanese kendang for dangdut koplo:
 *   d "dhut"  big drum, deep with a falling pitch      b "dlang" big drum, low open tone
 *   t "tak"   sharp slap                               k "ket"   ketipung, short high slap
 *   p "tung"  ketipung open ring
 */
export const KENDANG: Preset<DrumDef> = {
  kind: 'drum',
  strokes: {
    x: {
      tone: { f: 165, to: 92, pd: 0.13, decay: 0.34, vol: 1 },
      noise: { type: 'lowpass', f: 700, decay: 0.03, vol: 0.25 },
    },
    d: {
      tone: { f: 165, to: 92, pd: 0.13, decay: 0.34, vol: 1 },
      noise: { type: 'lowpass', f: 700, decay: 0.03, vol: 0.25 },
    },
    b: {
      tone: { f: 112, to: 104, pd: 0.08, decay: 0.4, vol: 0.9 },
      noise: { type: 'lowpass', f: 600, decay: 0.03, vol: 0.2 },
    },
    t: {
      tone: { f: 430, to: 390, pd: 0.03, decay: 0.05, vol: 0.4, wave: 'triangle' },
      noise: { type: 'bandpass', f: 2300, q: 1, decay: 0.055, vol: 0.85 },
    },
    k: {
      tone: { f: 720, to: 680, pd: 0.02, decay: 0.03, vol: 0.3 },
      noise: { type: 'bandpass', f: 3600, q: 1.2, decay: 0.03, vol: 0.6 },
    },
    p: {
      tone: { f: 345, to: 312, pd: 0.05, decay: 0.19, vol: 0.8 },
      noise: { type: 'highpass', f: 3000, decay: 0.01, vol: 0.18 },
    },
  },
  poly: 5,
};

/**
 * Sundanese kendang (jaipong style):
 *   d "dong" big drum with the heel-pressed rising bend   b "bung" low falling tone
 *   i "ting" small drum, high ring                       p "plak" slap      k "ket" closed
 */
export const KENDANG_SUNDA: Preset<DrumDef> = {
  kind: 'drum',
  strokes: {
    x: {
      tone: { f: 96, to: 142, pd: 0.14, decay: 0.38, vol: 1 },
      noise: { type: 'lowpass', f: 600, decay: 0.03, vol: 0.22 },
    },
    d: {
      tone: { f: 96, to: 142, pd: 0.14, decay: 0.38, vol: 1 },
      noise: { type: 'lowpass', f: 600, decay: 0.03, vol: 0.22 },
    },
    b: {
      tone: { f: 140, to: 88, pd: 0.12, decay: 0.34, vol: 0.95 },
      noise: { type: 'lowpass', f: 600, decay: 0.03, vol: 0.2 },
    },
    i: {
      tone: { f: 520, to: 498, pd: 0.03, decay: 0.16, vol: 0.6 },
      noise: { type: 'highpass', f: 3500, decay: 0.008, vol: 0.15 },
    },
    p: {
      tone: { f: 380, to: 330, pd: 0.02, decay: 0.04, vol: 0.35, wave: 'triangle' },
      noise: { type: 'bandpass', f: 2000, q: 0.9, decay: 0.06, vol: 0.9 },
    },
    k: {
      tone: { f: 640, to: 600, pd: 0.02, decay: 0.03, vol: 0.3 },
      noise: { type: 'bandpass', f: 3200, q: 1.2, decay: 0.03, vol: 0.55 },
    },
  },
  poly: 5,
};
