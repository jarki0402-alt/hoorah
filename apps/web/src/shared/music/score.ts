/**
 * Song scores and the compiler that turns them into per-step note events.
 *
 * A song is a list of sections played in `form` order. Every section has a chord chart and
 * one pattern per instrument. Patterns are written one token per 16th step, bars separated
 * by "|". A bar without spaces is read one character per step ("x...x...x...x..."); a bar
 * with spaces is read one word per step ("e5 - - . g5 - a5 - ...").
 *
 * Tokens for pitched instruments
 *   .  rest / end the sounding note        -  hold the previous note one more step
 *   c5 eb4 f#3   absolute notes            1–9 v a  chord-relative degrees (see theory.ts)
 *   x  chord     n  next chord (anticipation)    u  up-strum (top notes, high → low)
 *   m  muted chord chop    l / h  lowest / highest note of the chord    o  dead (ghost) note
 *   Uppercase single characters and a trailing "!" accent; a trailing "'" plays softly.
 *
 * Tokens for drums (`strokes` on the instrument)
 *   x default stroke   X accent   o ghost   r buzz roll   f flam   2–6 roll of n hits
 *   any other letter = that named stroke (uppercase = accented); "k3" = stroke k, 3 hits.
 *
 * Everything here is pure data processing, so it runs (and is tested) without Web Audio.
 */

import { type Chord, degreeToMidi, noteToMidi, parseChord, voiceChord } from './theory';

export const STEPS = 16;

/**
 * One pattern per section: a plain multi-bar loop, or a loop with a fill bar replacing every
 * n-th bar (default: the last bar of the section), optionally transposed by `shift` semitones.
 */
export type PartSpec = string | { loop: string; fill?: string; every?: number; shift?: number };

export interface SectionDef {
  bars: number;
  /** Bars separated by "|"; per bar 1 chord, 2 (half bar each) or 4 (one per beat, "." = same). */
  chords: string;
  parts: Record<string, PartSpec>;
}

/** What the compiler needs to know about an instrument. */
export interface ScoreInst {
  kind: 'tone' | 'pluck' | 'drum';
  /** MIDI range: degrees place roots from range[0]; chords are voiced inside it. */
  range?: readonly [number, number];
  /** Notes per chord voicing. */
  voices?: number;
  strokes?: Record<string, unknown>;
}

export interface SongScore<I extends ScoreInst = ScoreInst> {
  id: string;
  bpm: number;
  /** Delay of every odd 16th, as a fraction of a 16th (0 = straight). */
  swing?: number;
  inst: Record<string, I>;
  sections: Record<string, SectionDef>;
  form: string[];
  /** Index into `form` where the loop restarts (default 0). */
  loopFrom?: number;
}

export interface NoteEvent {
  inst: string;
  /** 16th step inside the bar, 0–15. */
  step: number;
  /** MIDI notes (empty for drums). */
  notes: number[];
  /** Drum stroke key ('' for pitched instruments). */
  stroke: string;
  vel: number;
  /** Length in 16th steps. */
  dur: number;
  /** Number of hits inside the step (1 = single hit, >1 = roll). */
  hits: number;
  flam: boolean;
  /** Up-strum (play the chord high → low). */
  up: boolean;
  /** Choked / dead note. */
  mute: boolean;
}

export interface CompiledSong {
  id: string;
  bpm: number;
  swing: number;
  /** bars[bar][step] = events starting on that step. */
  bars: NoteEvent[][][];
  /** Bar the song jumps back to after the last one. */
  loopBar: number;
  /** Section name of every bar (for debugging and tests). */
  sectionOfBar: string[];
}

export const splitBars = (pattern: string): string[] =>
  pattern
    .split('|')
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

/** One token per step: words when the bar has spaces, otherwise characters. */
export const tokenize = (bar: string): string[] => (/\s/.test(bar) ? bar.split(/\s+/) : bar.split(''));

/** The chord symbol sounding on each of the 16 steps of one bar of a chord chart. */
export function chordSteps(bar: string): string[] {
  const toks = bar.trim().split(/\s+/);
  if (toks.length !== 1 && toks.length !== 2 && toks.length !== 4)
    throw new Error(`Chord bar "${bar}" needs 1, 2 or 4 chords`);
  if (toks[0] === '.') throw new Error(`Chord bar "${bar}" starts with "."`);
  const per = STEPS / toks.length;
  const out: string[] = [];
  let cur = toks[0]!;
  for (const t of toks) {
    if (t !== '.') cur = t;
    for (let i = 0; i < per; i++) out.push(cur);
  }
  return out;
}

/** Pattern text for bar `i` (0-based) of a section that is `bars` long. */
export function barPattern(spec: PartSpec, i: number, bars: number): string {
  if (typeof spec !== 'string' && spec.fill && (i + 1) % (spec.every ?? bars) === 0) return spec.fill;
  const loop = splitBars(typeof spec === 'string' ? spec : spec.loop);
  if (!loop.length) throw new Error('Empty pattern');
  return loop[i % loop.length]!;
}

/** Bars of the form, in play order, with the chord of every step. */
export function expandForm(song: SongScore): { section: string; index: number; chords: Chord[] }[] {
  const cache = new Map<string, Chord>();
  const chord = (s: string) => {
    let c = cache.get(s);
    if (!c) {
      c = parseChord(s);
      cache.set(s, c);
    }
    return c;
  };
  const plan: { section: string; index: number; chords: Chord[] }[] = [];
  for (const name of song.form) {
    const sec = song.sections[name];
    if (!sec) throw new Error(`${song.id}: unknown section "${name}"`);
    const chordBars = splitBars(sec.chords);
    for (let i = 0; i < sec.bars; i++)
      plan.push({ section: name, index: i, chords: chordSteps(chordBars[i % chordBars.length]!).map(chord) });
  }
  return plan;
}

const ev = (inst: string, step: number, over: Partial<NoteEvent>): NoteEvent => ({
  inst,
  step,
  notes: [],
  stroke: '',
  vel: 0.8,
  dur: 1,
  hits: 1,
  flam: false,
  up: false,
  mute: false,
  ...over,
});

/** Splits a velocity suffix ("!" accent, "'" soft) or an uppercase accent off a token. */
function velocityOf(tok: string): { body: string; vel: number } {
  if (tok.endsWith('!')) return { body: tok.slice(0, -1), vel: 1 };
  if (tok.endsWith("'")) return { body: tok.slice(0, -1), vel: 0.5 };
  if (tok.length === 1 && tok !== tok.toLowerCase()) return { body: tok.toLowerCase(), vel: 1 };
  return { body: tok, vel: 0.8 };
}

function drumEvent(key: string, step: number, tok: string, strokes: Record<string, unknown>): NoteEvent {
  if (/^[2-6]$/.test(tok)) return ev(key, step, { stroke: 'x', hits: Number(tok) });
  const m = /^([a-zA-Z])([2-6])?([!']?)$/.exec(tok);
  if (!m) throw new Error(`bad drum token "${tok}"`);
  const { body, vel } = velocityOf(m[1]! + m[3]!);
  const hits = m[2] ? Number(m[2]) : 1;
  if (body === 'o') return ev(key, step, { stroke: 'x', vel: 0.4, hits });
  if (body === 'r') return ev(key, step, { stroke: 'x', vel, hits: 4 });
  if (body === 'f') return ev(key, step, { stroke: 'x', vel, flam: true });
  if (!(body in strokes)) throw new Error(`unknown stroke "${body}"`);
  return ev(key, step, { stroke: body, vel, hits });
}

export function compileSong(song: SongScore): CompiledSong {
  const plan = expandForm(song);
  for (const [name, sec] of Object.entries(song.sections))
    for (const key of Object.keys(sec.parts))
      if (!song.inst[key]) throw new Error(`${song.id}/${name}: no instrument "${key}"`);
  const loopFrom = song.loopFrom ?? 0;
  let loopBar = 0;
  for (let i = 0; i < loopFrom; i++) loopBar += song.sections[song.form[i]!]!.bars;
  const total = plan.length * STEPS;
  const chordAt = (g: number) => {
    const p = g < total ? g : loopBar * STEPS + ((g - total) % (total - loopBar * STEPS));
    return plan[Math.floor(p / STEPS)]!.chords[p % STEPS]!;
  };
  /**
   * The chord the music moves to next after global step g: a change later in the same bar,
   * otherwise the chord on the next bar line (possibly the same one), wrapping into the loop.
   */
  const nextChord = (g: number) => {
    const cur = chordAt(g);
    const barEnd = (Math.floor(g / STEPS) + 1) * STEPS;
    for (let k = g + 1; k < barEnd; k++) {
      const c = chordAt(k);
      if (c.name !== cur.name) return c;
    }
    return chordAt(barEnd);
  };

  const bars: NoteEvent[][][] = plan.map(() => Array.from({ length: STEPS }, () => []));
  for (const [key, inst] of Object.entries(song.inst)) {
    const [lo, hi] = inst.range ?? [48, 72];
    const voices = inst.voices ?? 3;
    let open: NoteEvent | null = null;
    let prevVoicing: number[] | undefined;
    let voicedName = '';
    const voicing = (c: Chord) => {
      if (c.name !== voicedName || !prevVoicing) {
        prevVoicing = voiceChord(c, voices, lo, hi, prevVoicing);
        voicedName = c.name;
      }
      return prevVoicing;
    };

    plan.forEach((bar, b) => {
      const sec = song.sections[bar.section]!;
      const spec = sec.parts[key];
      if (!spec) {
        open = null;
        return;
      }
      const shift = typeof spec === 'string' ? 0 : (spec.shift ?? 0);
      const toks = tokenize(barPattern(spec, bar.index, sec.bars));
      const where = `${song.id}/${bar.section} bar ${bar.index + 1} "${key}"`;
      if (toks.length !== STEPS) throw new Error(`${where}: ${toks.length} steps, expected ${STEPS}`);
      toks.forEach((tok, s) => {
        if (tok === '-') {
          if (open) open.dur++;
          return;
        }
        open = null;
        if (tok === '.') return;
        let e: NoteEvent;
        try {
          if (inst.kind === 'drum') {
            bars[b]![s]!.push(drumEvent(key, s, tok, inst.strokes ?? {}));
            return;
          }
          const { body, vel } = velocityOf(tok);
          const cur = bar.chords[s]!;
          const g = b * STEPS + s;
          switch (body) {
            case 'x':
              e = ev(key, s, { notes: voicing(cur), vel });
              break;
            case 'n':
              e = ev(key, s, { notes: voicing(nextChord(g)), vel });
              break;
            case 'u':
              e = ev(key, s, { notes: voicing(cur).slice(-3).reverse(), vel: vel * 0.8, up: true });
              break;
            case 'm':
              e = ev(key, s, { notes: voicing(cur), vel: vel * 0.6, mute: true });
              break;
            case 'l':
              e = ev(key, s, { notes: voicing(cur).slice(0, 1), vel });
              break;
            case 'h':
              e = ev(key, s, { notes: voicing(cur).slice(-1), vel });
              break;
            case 'o':
              e = ev(key, s, { notes: [degreeToMidi('1', cur, cur, lo)!], vel: 0.35, mute: true });
              break;
            default: {
              const midi = noteToMidi(body) ?? degreeToMidi(body, cur, nextChord(g), lo);
              if (midi === null) throw new Error(`bad token "${tok}"`);
              e = ev(key, s, { notes: [midi], vel });
            }
          }
        } catch (err) {
          throw new Error(`${where} step ${s + 1}: ${(err as Error).message}`);
        }
        if (shift) e.notes = e.notes.map((n) => n + shift);
        bars[b]![s]!.push(e);
        open = e;
      });
    });
  }
  return {
    id: song.id,
    bpm: song.bpm,
    swing: song.swing ?? 0,
    bars,
    loopBar,
    sectionOfBar: plan.map((p) => p.section),
  };
}

/** Seconds of one pass through the loop (from loopBar to the end). */
export const loopSeconds = (c: CompiledSong): number =>
  ((c.bars.length - c.loopBar) * STEPS * 60) / c.bpm / 4;
