/**
 * Pure music theory helpers: note names, chord symbols, chord tones and voicings.
 * No Web Audio in here, so everything is unit-testable in Node.
 */

export const midiToFreq = (m: number): number => 440 * 2 ** ((m - 69) / 12);

const LETTER: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/** "c4" → 60, "eb5" → 75, "f#3" → 54. Returns null when the text is not a note name. */
export function noteToMidi(name: string): number | null {
  const m = /^([a-g])(#|b)?(-?\d)$/.exec(name);
  if (!m) return null;
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return (Number(m[3]) + 1) * 12 + LETTER[m[1]!]! + acc;
}

/** Positive modulo. */
export const mod = (n: number, m: number): number => ((n % m) + m) % m;

export interface Chord {
  name: string;
  /** Pitch class of the root (0 = C). */
  root: number;
  /** Pitch class of the lowest note (slash chords); equals root otherwise. */
  bass: number;
  /** Intervals above the root in semitones, ascending, always starting with 0. */
  tones: number[];
}

const QUALITIES: Record<string, number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '7': [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  mmaj7: [0, 3, 7, 11],
  '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  '69': [0, 4, 7, 9, 14],
  dim: [0, 3, 6],
  dim7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  '7sus4': [0, 5, 7, 10],
  add9: [0, 4, 7, 14],
  madd9: [0, 3, 7, 14],
  '9': [0, 4, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  m9: [0, 3, 7, 10, 14],
  m11: [0, 3, 7, 10, 14, 17],
  '13': [0, 4, 7, 10, 14, 21],
  '7b9': [0, 4, 7, 10, 13],
  '7#9': [0, 4, 7, 10, 15],
  '9sus4': [0, 5, 7, 10, 14],
};

const pitchClass = (letter: string, acc: string | undefined): number =>
  mod(LETTER[letter.toLowerCase()]! + (acc === '#' ? 1 : acc === 'b' ? -1 : 0), 12);

/** Parses "Gm9", "C13", "Bb/D", "F#m7b5". Throws on anything it does not know. */
export function parseChord(sym: string): Chord {
  const m = /^([A-G])(#|b)?([^/]*)(?:\/([A-G])(#|b)?)?$/.exec(sym);
  const tones = m ? QUALITIES[m[3]!] : undefined;
  if (!m || !tones) throw new Error(`Unknown chord "${sym}"`);
  const root = pitchClass(m[1]!, m[2]);
  return { name: sym, root, bass: m[4] ? pitchClass(m[4], m[5]) : root, tones };
}

const has = (c: Chord, ...iv: number[]) => iv.find((i) => c.tones.includes(i));

/** Interval of the chord's third (the 4th or 2nd for sus chords). */
export const thirdOf = (c: Chord): number => has(c, 3, 4, 5, 2) ?? 4;
/** Interval of the chord's fifth. */
export const fifthOf = (c: Chord): number => has(c, 7, 6, 8) ?? 7;
/** Interval of the chord's seventh (or sixth); the octave when the chord has neither. */
export const seventhOf = (c: Chord): number => has(c, 10, 11, 9) ?? 12;

/** Lower number = more important to keep when a voicing has fewer notes than the chord. */
function priority(c: Chord, iv: number): number {
  if (iv === thirdOf(c)) return 0;
  if (iv === 10 || iv === 11 || (iv === 9 && !has(c, 10, 11))) return 1;
  if (iv === 13 || iv === 14 || iv === 15) return 2;
  if (iv === 21) return 3;
  if (iv === 17) return 4;
  if (iv === fifthOf(c)) return 5;
  if (iv === 0) return 6;
  return 7;
}

/** The pitch classes a voicing of `n` notes should use, most important first. */
export function voicingPitches(c: Chord, n: number): number[] {
  const ranked = [...c.tones].sort((a, b) => priority(c, a) - priority(c, b));
  const pcs: number[] = [];
  for (const iv of ranked) {
    const pc = mod(c.root + iv, 12);
    if (!pcs.includes(pc)) pcs.push(pc);
    if (pcs.length === n) return pcs;
  }
  // More notes than chord tones: double from the root upwards.
  for (let i = 0; pcs.length < n; i++) pcs.push(mod(c.root + c.tones[i % c.tones.length]!, 12));
  return pcs;
}

/**
 * Close-position voicing of `n` notes inside [lo, hi]. With a previous voicing it picks the
 * inversion that moves the voices the least (smooth voice leading); without one it centres
 * the chord in the range.
 */
export function voiceChord(c: Chord, n: number, lo: number, hi: number, prev?: number[]): number[] {
  const pcs = [...new Set(voicingPitches(c, n))].sort((a, b) => a - b);
  const candidates: number[][] = [];
  for (let r = 0; r < pcs.length; r++) {
    for (const lift of [0, 12]) {
      const notes: number[] = [];
      let cur = lo + mod(pcs[r]! - lo, 12) + lift;
      notes.push(cur);
      for (let i = 1; i < n; i++) {
        const pc = pcs[(r + i) % pcs.length]!;
        cur += mod(pc - cur, 12) || 12;
        notes.push(cur);
      }
      if (notes[notes.length - 1]! <= hi) candidates.push(notes);
    }
  }
  if (!candidates.length) {
    // Range too narrow for this chord: fall back to the lowest stack, clipped by octaves.
    const notes = pcs.map((pc) => lo + mod(pc - lo, 12)).sort((a, b) => a - b);
    return notes.slice(0, n);
  }
  const mid = (lo + hi) / 2;
  const cost = (v: number[]) =>
    prev && prev.length === v.length
      ? v.reduce((s, x, i) => s + Math.abs(x - prev[i]!), 0)
      : Math.abs(v.reduce((s, x) => s + x, 0) / v.length - mid);
  let best = candidates[0]!;
  for (const v of candidates) if (cost(v) < cost(best)) best = v;
  return best;
}

/**
 * Resolves a one-character scale degree against a chord, with roots placed in [lo, lo + 11].
 *  1 root (or slash bass) · 2 · 3 chord third · 4 · 5 chord fifth · 6 · 7 chord seventh · 8 octave
 *  9 ninth · v fifth below the root · a chromatic approach (a semitone under the next root)
 */
export function degreeToMidi(deg: string, c: Chord, next: Chord, lo: number): number | null {
  const root = lo + mod(c.root - lo, 12);
  switch (deg) {
    case '1':
      return lo + mod(c.bass - lo, 12);
    case '2':
      return root + 2;
    case '3':
      return root + thirdOf(c);
    case '4':
      return root + 5;
    case '5':
      return root + fifthOf(c);
    case '6':
      return root + 9;
    case '7':
      return root + seventhOf(c);
    case '8':
      return lo + mod(c.bass - lo, 12) + 12;
    case '9':
      return root + 14;
    case 'v':
      return root + fifthOf(c) - 12;
    case 'a': {
      const target = lo + mod(next.bass - lo, 12);
      // Approach from the side that keeps the line close to the current root.
      return Math.abs(target - 1 - root) <= Math.abs(target + 11 - root) ? target - 1 : target + 11;
    }
    default:
      return null;
  }
}
