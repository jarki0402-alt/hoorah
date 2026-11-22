/**
 * Instruments for the music engine. Every sound is made from Web Audio oscillators, noise and
 * Karplus–Strong string buffers computed in JavaScript; there are no sample files.
 *
 * Cost model (nodes per note, created at schedule time and garbage-collected after they stop):
 *   tone   2 + 1 per extra oscillator layer + 1 filter + 2 FM + 2 vibrato + 3 breath
 *   pluck  2 (buffer source + gain; the string itself is computed once per pitch and cached)
 *   drum   2 per tone part + 3 for the noise part; rolls reuse the same nodes
 * Each instrument also has a small fixed channel strip (gain, optional filter / drive /
 * tremolo, pan, reverb and delay sends) that lives as long as its song plays.
 */

import { layerScheduled, TIER_FADE_TAU, type Tier } from './adaptive';
import type { NoteEvent, ScoreInst, SongScore } from './score';
import { midiToFreq } from './theory';

export interface Env {
  /** Attack time (s). */
  a: number;
  /** Time (s) to settle on the sustain level. */
  d: number;
  /** Sustain level, 0–1. */
  s: number;
  /** Release time (s). */
  r: number;
}

/** Named harmonic tables, played through a PeriodicWave (one oscillator per note). */
export const WAVES = {
  round: [1, 0.35, 0.12, 0.05],
  organ: [1, 0.85, 0.6, 0.35, 0.25, 0.12, 0.1, 0.08],
  reed: [1, 0.65, 0.5, 0.42, 0.33, 0.25, 0.2, 0.15, 0.1, 0.08],
  tuba: [1, 0.8, 0.5, 0.3, 0.18, 0.1, 0.05],
  /** Flute body: near-sine with a soft octave. */
  flute: [1, 0.14, 0.04],
  /** Angklung: two bamboo tubes an octave apart, a little hollow. */
  bamboo: [1, 0.5, 0.1, 0.03, 0.04],
  /** Steel pan carrier: fundamental plus the strong octave partial. */
  pan: [1, 0.32],
  /** Soft saw-like pad, already rolled off (no filter needed). */
  soft: [1, 0.45, 0.25, 0.15, 0.1, 0.06, 0.04, 0.03],
  /** Fingered electric bass (triangle with a touch of square). */
  ebass: [1, 0.06, 0.2, 0.03, 0.1, 0.02, 0.06, 0.01, 0.04],
  /** Funk bass: saw with a heavier fundamental (built-in sub). */
  funk: [1, 0.32, 0.21, 0.16, 0.13, 0.11, 0.09, 0.08, 0.07, 0.065, 0.06, 0.055, 0.05, 0.045, 0.04, 0.04],
} satisfies Record<string, number[]>;
export type WaveName = keyof typeof WAVES;

export interface Layer {
  wave: OscillatorType | WaveName;
  /** Frequency multiple of the note (default 1). */
  ratio?: number;
  /** Cents. */
  detune?: number;
  /** Mix level of this layer (default 1). */
  gain?: number;
}

/** Channel-strip settings shared by all instrument kinds. */
export interface Mix {
  level: number;
  pan?: number;
  /** Reverb send, 0–1. */
  rev?: number;
  /** Delay send, 0–1. */
  dly?: number;
  /** Maximum voices sounding at once; extra notes are dropped. */
  poly?: number;
  /** Static filter over the whole channel. */
  tone?: { type: BiquadFilterType; f: number; q?: number };
  /** Soft saturation, 0–1. */
  drive?: number;
  /** Amplitude tremolo over the whole channel (vibraphone motor). */
  trem?: { rate: number; depth: number };
  /** Random timing spread in seconds (default 0.003). */
  human?: number;
  /** Peak gain of one note at full velocity (default 1). */
  vol?: number;
  /**
   * Adaptive layer: the channel sounds while tier <= the game's music intensity (see
   * ./adaptive). Default 0 = always on.
   */
  tier?: Tier;
}

export interface ToneDef extends ScoreInst, Mix {
  kind: 'tone';
  layers: Layer[];
  /** 2-operator FM: a sine modulator at note × ratio, index decaying from `index` to `end`. */
  fm?: { ratio: number; index: number; end?: number; decay: number };
  /** Per-note filter. Cutoff = f × (note / middle C)^track, swept by `env` ×. */
  filter?: {
    type?: BiquadFilterType;
    f: number;
    track?: number;
    q?: number;
    env?: number;
    a?: number;
    d?: number;
  };
  env: Env;
  /** Vibrato in cents, fading in after `delay` seconds. */
  vib?: { rate: number; depth: number; delay: number };
  /** Starts this many cents flat and slides up. */
  scoop?: { cents: number; time: number };
  /** Band-passed noise "chiff" at the start of the note plus a quieter breath while it lasts. */
  breath?: { vol: number; ratio: number; q: number; decay: number; sustain?: number };
  /** Bamboo rattle (angklung): repeated decaying strikes while the note is held. */
  rattle?: { rate: number; decay: number };
  /** Seconds between chord notes (strummed or rolled chords). */
  strum?: number;
  /** Fraction of the written length the note is held (default 0.92). */
  gate?: number;
  /** Ignore the written length: every note lasts this many seconds (struck instruments). */
  fixed?: number;
}

export interface PluckDef extends ScoreInst, Mix {
  kind: 'pluck';
  /** Seconds for a low string to fade by 60 dB. */
  t60: number;
  /** 0 (dull) – 1 (bright) excitation. */
  bright: number;
  /** Pluck position 0–0.5; small values sound thin and nasal. */
  pick?: number;
  /** Seconds of string computed per pitch. */
  len: number;
  strum?: number;
  /** Damp the string after this fraction of the written length (omit to let it ring). */
  gate?: number;
}

export interface ToneHit {
  f: number;
  /** Pitch the hit glides to (membranes drop, some kendang strokes rise). */
  to?: number;
  /** Glide time (s). */
  pd?: number;
  decay: number;
  vol: number;
  wave?: OscillatorType;
}

export interface NoiseHit {
  type: BiquadFilterType;
  f: number;
  q?: number;
  decay: number;
  vol: number;
  /** Attack (s); brushes and shakers swell in. */
  a?: number;
  /** Hand clap: this many tightly spaced bursts. */
  claps?: number;
}

export interface Stroke {
  tone?: ToneHit;
  tone2?: ToneHit;
  noise?: NoiseHit;
}

export interface DrumDef extends ScoreInst, Mix {
  kind: 'drum';
  /** Must contain "x" (the default stroke). */
  strokes: Record<string, Stroke>;
}

export type InstDef = ToneDef | PluckDef | DrumDef;

export interface Song extends SongScore<InstDef> {
  title: string;
  /** Output trim, set by measuring loudness so all songs play equally loud. */
  gain: number;
  /** Tempo-synced echo shared by the instruments with a `dly` send. */
  delay?: { beats: number; feedback: number; tone?: number };
}

/* ------------------------------------------------------------------ shared resources */

/** Deterministic PRNG (mulberry32) so renders and tests are reproducible. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Karplus–Strong plucked string: a burst of filtered noise circulating in a tuned delay line
 * with a lossy averaging filter. Computed in JS because a Web Audio feedback loop cannot be
 * shorter than one render quantum (128 samples), which would cap the pitch near 350 Hz.
 */
export function karplus(
  freq: number,
  sampleRate: number,
  seconds: number,
  opts: { t60: number; bright: number; pick?: number; seed?: number },
): Float32Array {
  const n = Math.max(1, Math.floor(seconds * sampleRate));
  const out = new Float32Array(n);
  const period = sampleRate / freq;
  const delay = Math.max(1, period - 0.5); // the averaging filter adds half a sample
  const di = Math.floor(delay);
  const fr = delay - di;
  const loss = 0.001 ** (1 / (opts.t60 * freq));
  const p = Math.max(2, Math.round(period));
  const rand = rng(opts.seed ?? Math.round(freq * 100));
  const exc = new Float32Array(p);
  const k = 0.08 + 0.92 * opts.bright;
  let lp = 0;
  let mean = 0;
  for (let i = 0; i < p; i++) {
    lp += k * (rand() * 2 - 1 - lp);
    exc[i] = lp;
  }
  const pick = opts.pick ? Math.max(1, Math.round(opts.pick * p)) : 0;
  if (pick) for (let i = p - 1; i >= pick; i--) exc[i]! -= exc[i - pick]!;
  for (let i = 0; i < p; i++) mean += exc[i]! / p;
  let prev = 0;
  let peak = 1e-9;
  for (let i = 0; i < n; i++) {
    const j = i - di;
    const d = (j >= 0 ? out[j]! : 0) * (1 - fr) + (j >= 1 ? out[j - 1]! : 0) * fr;
    const y = (i < p ? exc[i]! - mean : 0) + loss * 0.5 * (d + prev);
    prev = d;
    out[i] = y;
    const ay = y < 0 ? -y : y;
    if (ay > peak) peak = ay;
  }
  const fade = Math.min(n, Math.floor(sampleRate * 0.01));
  for (let i = 0; i < n; i++) {
    const tail = n - i < fade ? (n - i) / fade : 1;
    out[i] = (out[i]! / peak) * tail;
  }
  return out;
}

/** Reverb impulse: decaying noise that darkens as it fades (mono, to keep the convolver cheap). */
export function reverbImpulse(sampleRate: number, seconds: number, seed = 7): Float32Array {
  const n = Math.floor(sampleRate * seconds);
  const pre = Math.floor(sampleRate * 0.012);
  const ramp = sampleRate * 0.004;
  const rand = rng(seed);
  const d = new Float32Array(n);
  let lp = 0;
  for (let i = pre; i < n; i++) {
    const x = (i - pre) / (n - pre);
    const k = 0.65 - 0.5 * x; // brighter early reflections, darker tail
    lp += k * (rand() * 2 - 1 - lp);
    d[i] = lp * Math.exp(-6.2 * x) * Math.min(1, (i - pre) / ramp);
  }
  return d;
}

interface Shared {
  noise: AudioBuffer;
  waves: Map<string, PeriodicWave>;
  strings: Map<string, AudioBuffer>;
  curves: Map<number, Float32Array<ArrayBuffer>>;
}
const SHARED = new WeakMap<BaseAudioContext, Shared>();
const MAX_STRINGS = 72;

function shared(ctx: BaseAudioContext): Shared {
  let s = SHARED.get(ctx);
  if (!s) {
    const len = Math.floor(ctx.sampleRate * 1.5);
    const noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noise.getChannelData(0);
    const rand = rng(99);
    for (let i = 0; i < len; i++) data[i] = rand() * 2 - 1;
    s = { noise, waves: new Map(), strings: new Map(), curves: new Map() };
    SHARED.set(ctx, s);
  }
  return s;
}

function periodicWave(ctx: BaseAudioContext, name: WaveName): PeriodicWave {
  const sh = shared(ctx);
  let w = sh.waves.get(name);
  if (!w) {
    const h = WAVES[name];
    const real = new Float32Array(h.length + 1);
    const imag = new Float32Array(h.length + 1);
    h.forEach((v, i) => {
      imag[i + 1] = v;
    });
    w = ctx.createPeriodicWave(real, imag);
    sh.waves.set(name, w);
  }
  return w;
}

function stringBuffer(ctx: BaseAudioContext, def: PluckDef, midi: number): AudioBuffer {
  const sh = shared(ctx);
  const key = `${def.t60}:${def.bright}:${def.pick ?? 0}:${def.len}:${midi}`;
  let b = sh.strings.get(key);
  if (!b) {
    // Strings are computed at 24 kHz to keep memory low; the context resamples them.
    const rate = Math.min(ctx.sampleRate, 24000);
    const data = karplus(midiToFreq(midi), rate, def.len, def);
    b = ctx.createBuffer(1, data.length, rate);
    b.getChannelData(0).set(data);
    if (sh.strings.size >= MAX_STRINGS) {
      const oldest = sh.strings.keys().next().value;
      if (oldest !== undefined) sh.strings.delete(oldest);
    }
    sh.strings.set(key, b);
  }
  return b;
}

/**
 * tanh saturation. The WaveShaper clamps its input to ±1, so the output never exceeds ±1 and
 * the channel level that follows sets the loudness.
 */
function driveCurve(ctx: BaseAudioContext, amount: number): Float32Array<ArrayBuffer> {
  const sh = shared(ctx);
  let c = sh.curves.get(amount);
  if (!c) {
    const k = 1 + amount * 6;
    const n = 1024;
    c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      c[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    sh.curves.set(amount, c);
  }
  return c;
}

/* ------------------------------------------------------------------ envelopes */

/**
 * Repeated strikes on one gain param: each jumps (or ramps in `a` seconds) to its level and
 * decays exponentially with time constant `tau`. Values are continued exactly between strikes,
 * so there are no jumps other than the attacks themselves.
 */
export function strikes(p: AudioParam, times: number[], levels: number[], a: number, tau: number): number {
  let lastT = -1;
  let lastV = 0;
  for (let i = 0; i < times.length; i++) {
    const t = times[i]!;
    const v = levels[i]!;
    if (a > 0) {
      p.setValueAtTime(lastT < 0 ? 0 : lastV * Math.exp(-(t - lastT) / tau), t);
      p.linearRampToValueAtTime(v, t + a);
    } else {
      p.setValueAtTime(v, t);
    }
    p.setTargetAtTime(0, t + a, tau);
    lastT = t + a;
    lastV = v;
  }
  return lastT;
}

/**
 * Evaluate a param once per 128-sample block instead of per sample. Used for filter cutoffs
 * and pitch sweeps, where per-sample evaluation (a biquad recomputes its coefficients every
 * sample) costs far more than it is audible. Older browsers without automationRate ignore it.
 */
function krate(p: AudioParam): void {
  try {
    p.automationRate = 'k-rate';
  } catch {
    // Not settable on this param / browser: stays a-rate.
  }
}

/* ------------------------------------------------------------------ channel */

/** Where a song instance's channels send their audio. */
export interface Bus {
  ctx: BaseAudioContext;
  dry: AudioNode;
  rev: AudioNode | null;
  dly: AudioNode | null;
  stats: { nodes: number; dropped: number };
  rand: () => number;
}

/** One instrument of one playing song: its channel strip plus the note players. */
export class Channel {
  readonly input: GainNode;
  private readonly strip: AudioNode[] = [];
  private readonly lfos: OscillatorNode[] = [];
  private ends: number[] = [];
  /** Layer fader (only for channels with a tier above 0). */
  private readonly layer: GainNode | null = null;
  private on: boolean;
  private offAt = Number.NEGATIVE_INFINITY;

  constructor(
    readonly def: InstDef,
    private readonly bus: Bus,
    audible = true,
  ) {
    const ctx = bus.ctx;
    // Notes arrive at their own level (velocity × vol); the saturator sees that level, so
    // `drive` sounds the same whatever the mix level, and `level` is applied after it.
    this.input = this.gain(def.drive ? 1 : def.level);
    let node: AudioNode = this.input;
    const chain = (next: AudioNode) => {
      node.connect(next);
      this.strip.push(next);
      node = next;
    };
    if (def.tone) chain(this.filter(def.tone.type, def.tone.f, def.tone.q ?? 0.7));
    if (def.drive) {
      const ws = ctx.createWaveShaper();
      ws.curve = driveCurve(ctx, def.drive);
      this.bus.stats.nodes++;
      chain(ws);
      chain(this.gain(def.level));
    }
    if (def.trem) {
      const tg = this.gain(1 - def.trem.depth / 2);
      const lfo = this.osc('sine', def.trem.rate);
      const depth = this.gain(def.trem.depth / 2);
      lfo.connect(depth).connect(tg.gain);
      lfo.start();
      this.lfos.push(lfo);
      this.strip.push(depth);
      chain(tg);
    }
    if (def.pan && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = def.pan;
      this.bus.stats.nodes++;
      chain(p);
    }
    this.on = audible;
    if (def.tier) {
      this.layer = this.gain(audible ? 1 : 0);
      chain(this.layer);
    }
    node.connect(bus.dry);
    for (const [amount, dest] of [
      [def.rev, bus.rev],
      [def.dly, bus.dly],
    ] as const) {
      if (!amount || !dest) continue;
      const send = this.gain(amount);
      node.connect(send).connect(dest);
      this.strip.push(send);
    }
  }

  /** Fades this layer in or out from context time `at`; the song keeps playing. */
  setAudible(on: boolean, at: number): void {
    if (on === this.on) return;
    this.on = on;
    if (!on) this.offAt = at;
    const g = this.layer?.gain;
    if (!g) return;
    g.cancelScheduledValues(at);
    g.setTargetAtTime(on ? 1 : 0, at, TIER_FADE_TAU);
  }

  /** Whether notes starting at `t` are worth scheduling (silent layers cost nothing). */
  scheduledAt(t: number): boolean {
    return layerScheduled(this.on, this.offAt, t);
  }

  /** Disconnects the channel strip; notes already scheduled simply end into nothing. */
  dispose(): void {
    for (const l of this.lfos) {
      try {
        l.stop();
      } catch {
        // already stopped
      }
    }
    this.input.disconnect();
    for (const n of this.strip) n.disconnect();
  }

  /** Plays one score event starting at `t`. */
  play(e: NoteEvent, t: number, stepDur: number): void {
    const d = this.def;
    const vel = e.vel * (0.94 + this.bus.rand() * 0.12);
    if (d.kind === 'drum') {
      const stroke = d.strokes[e.stroke];
      if (stroke) this.drum(stroke, t, vel * (d.vol ?? 1), e, stepDur);
      return;
    }
    const gap = (d.strum ?? 0) * (e.up ? 0.7 : 1);
    const written = e.dur * stepDur;
    e.notes.forEach((midi, i) => {
      const at = t + i * gap;
      if (d.kind === 'pluck') this.pluck(d, midi, at, written, vel, e.mute);
      else this.tone(d, midi, at, e.mute ? Math.min(written, 0.07) : written, vel);
    });
  }

  /* -------------------------------------------------------------- node helpers */

  /**
   * Nodes of the voice being built. Chromium keeps finished nodes that still have connections
   * in its render graph (a voice with two oscillators made rendering cost grow without bound),
   * so every voice is disconnected as a whole when its last source ends.
   */
  private building: AudioNode[] | null = null;

  private track<T extends AudioNode>(n: T): T {
    this.bus.stats.nodes++;
    this.building?.push(n);
    return n;
  }

  /** Frees the voice's nodes once `last` (the source that stops last) has ended. */
  private free(last: AudioScheduledSourceNode): void {
    const nodes = this.building ?? [];
    this.building = null;
    last.onended = () => {
      for (const n of nodes) n.disconnect();
    };
  }

  private gain(v: number): GainNode {
    const g = this.bus.ctx.createGain();
    g.gain.value = v;
    return this.track(g);
  }

  private osc(type: OscillatorType | WaveName, f: number): OscillatorNode {
    const o = this.bus.ctx.createOscillator();
    if (type in WAVES) o.setPeriodicWave(periodicWave(this.bus.ctx, type as WaveName));
    else o.type = type as OscillatorType;
    o.frequency.value = f;
    return this.track(o);
  }

  private filter(type: BiquadFilterType, f: number, q: number): BiquadFilterNode {
    const b = this.bus.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return this.track(b);
  }

  private noiseSource(): AudioBufferSourceNode {
    const s = this.bus.ctx.createBufferSource();
    s.buffer = shared(this.bus.ctx).noise;
    s.loop = true;
    return this.track(s);
  }

  /** Reserves a voice until `end`; false (note dropped) when the polyphony limit is reached. */
  private claim(t: number, end: number): boolean {
    this.ends = this.ends.filter((x) => x > t);
    if (this.ends.length >= (this.def.poly ?? 8)) {
      this.bus.stats.dropped++;
      return false;
    }
    this.ends.push(end);
    return true;
  }

  /* -------------------------------------------------------------- voices */

  private tone(d: ToneDef, midi: number, t: number, written: number, vel: number): void {
    const f = midiToFreq(midi);
    const peak = vel * (d.vol ?? 1);
    const { a, s, r } = d.env;
    const hold = d.fixed ?? written * (d.gate ?? 0.92);
    const end = Math.max(t + a + 0.01, t + hold);
    const stop = end + r + 0.05;
    if (!this.claim(t, stop)) return;
    this.building = [];

    const amp = this.gain(0);
    amp.connect(this.input);
    if (d.rattle) {
      const times: number[] = [];
      const levels: number[] = [];
      for (let at = t; at < end && times.length < 48; ) {
        times.push(at);
        levels.push(peak * (times.length === 1 ? 1 : 0.55 + 0.4 * this.bus.rand()));
        at += (0.85 + 0.3 * this.bus.rand()) / d.rattle.rate;
      }
      strikes(amp.gain, times, levels, 0.002, d.rattle.decay / 3);
    } else {
      amp.gain.setValueAtTime(0, t);
      amp.gain.linearRampToValueAtTime(peak, t + a);
      amp.gain.setTargetAtTime(peak * s, t + a, Math.max(0.005, d.env.d / 4));
      amp.gain.setTargetAtTime(0, end, Math.max(0.005, r / 4));
    }

    let dest: AudioNode = amp;
    if (d.filter) {
      const fl = d.filter;
      const cut = Math.min(18000, fl.f * (f / 261.63) ** (fl.track ?? 0));
      const top = Math.min(18000, cut * (fl.env ?? 1));
      const flt = this.filter(fl.type ?? 'lowpass', cut, fl.q ?? 0.7);
      if (fl.env && fl.env !== 1) {
        krate(flt.frequency);
        if (fl.a) {
          flt.frequency.setValueAtTime(cut, t);
          flt.frequency.linearRampToValueAtTime(top, t + fl.a);
        } else flt.frequency.setValueAtTime(top, t);
        flt.frequency.setTargetAtTime(cut, t + (fl.a ?? 0), Math.max(0.005, (fl.d ?? 0.2) / 3));
      }
      flt.connect(amp);
      dest = flt;
    }

    const sources: OscillatorNode[] = [];
    let mod: GainNode | null = null;
    if (d.fm) {
      const mf = f * d.fm.ratio;
      const idx = d.fm.index * (0.55 + 0.6 * vel);
      const m = this.osc('sine', mf);
      mod = this.gain(mf * idx);
      mod.gain.setValueAtTime(mf * idx, t);
      mod.gain.setTargetAtTime(mf * (d.fm.end ?? 0), t, Math.max(0.005, d.fm.decay / 3));
      m.connect(mod);
      // Audio-rate FM is the expensive part of a note: once the index has decayed to nothing,
      // stop the modulator so the carrier falls back to the cheap fixed-frequency path.
      m.start(t);
      m.stop(d.fm.end ? stop : Math.min(stop, t + d.fm.decay * 2.5));
    }
    let vib: GainNode | null = null;
    if (d.vib && hold > d.vib.delay) {
      const lfo = this.osc('sine', d.vib.rate * (0.95 + 0.1 * this.bus.rand()));
      vib = this.gain(0);
      vib.gain.setValueAtTime(0, t + d.vib.delay);
      vib.gain.linearRampToValueAtTime(d.vib.depth, t + d.vib.delay + 0.25);
      lfo.connect(vib);
      sources.push(lfo);
    }
    for (const L of d.layers) {
      const o = this.osc(L.wave, f * (L.ratio ?? 1));
      const det = L.detune ?? 0;
      o.detune.value = det;
      if (d.scoop || vib) krate(o.detune);
      if (d.scoop) {
        o.detune.setValueAtTime(det - d.scoop.cents, t);
        o.detune.setTargetAtTime(det, t, d.scoop.time / 3);
      }
      if (mod) mod.connect(o.frequency);
      if (vib) vib.connect(o.detune);
      if ((L.gain ?? 1) !== 1) o.connect(this.gain(L.gain!)).connect(dest);
      else o.connect(dest);
      sources.push(o);
    }
    for (const o of sources) {
      o.start(t);
      o.stop(stop);
    }

    if (d.breath) {
      const b = d.breath;
      const src = this.noiseSource();
      const bp = this.filter('bandpass', Math.min(12000, f * b.ratio), b.q);
      const bg = this.gain(0);
      const bv = peak * b.vol;
      bg.gain.setValueAtTime(0, t);
      bg.gain.linearRampToValueAtTime(bv, t + 0.012);
      bg.gain.setTargetAtTime(bv * (b.sustain ?? 0), t + 0.012, b.decay / 3);
      bg.gain.setTargetAtTime(0, end, 0.03);
      src.connect(bp).connect(bg).connect(this.input);
      src.start(t, this.bus.rand());
      src.stop(stop);
    }
    this.free(sources[sources.length - 1]!);
  }

  private pluck(d: PluckDef, midi: number, t: number, written: number, vel: number, mute: boolean): void {
    const buf = stringBuffer(this.bus.ctx, d, midi);
    const damp = mute ? 0.05 : d.gate ? Math.max(0.05, written * d.gate) : buf.duration;
    const stop = t + Math.min(buf.duration, damp + 0.12);
    if (!this.claim(t, stop)) return;
    this.building = [];
    const src = this.track(this.bus.ctx.createBufferSource());
    src.buffer = buf;
    const g = this.gain(vel * (d.vol ?? 1));
    if (damp < buf.duration) {
      g.gain.setValueAtTime(vel * (d.vol ?? 1), t + damp);
      g.gain.setTargetAtTime(0, t + damp, 0.025);
    }
    src.connect(g).connect(this.input);
    src.start(t);
    src.stop(stop);
    this.free(src);
  }

  private drum(k: Stroke, t: number, vel: number, e: NoteEvent, stepDur: number): void {
    const times: number[] = [];
    const levels: number[] = [];
    if (e.flam) {
      times.push(t - 0.024, t);
      levels.push(vel * 0.45, vel);
    } else {
      const gap = stepDur / e.hits;
      for (let i = 0; i < e.hits; i++) {
        times.push(t + i * gap);
        levels.push(vel * (e.hits > 1 ? 0.6 + (0.4 * (i + 1)) / e.hits : 1));
      }
    }
    if (times[0]! < 0) times[0] = 0;
    const spacing = times.length > 1 ? times[1]! - times[0]! : 1;
    const last = times[times.length - 1]!;
    let longest = 0;
    for (const h of [k.tone, k.tone2, k.noise]) if (h) longest = Math.max(longest, h.decay);
    const stop = last + longest * 1.4 + (k.noise?.a ?? 0);
    if (!this.claim(times[0]!, stop)) return;
    this.building = [];
    let src: AudioScheduledSourceNode | null = null;
    let srcEnd = 0;

    for (const h of [k.tone, k.tone2]) {
      if (!h) continue;
      const o = this.osc(h.wave ?? 'sine', h.f);
      if (h.to && h.pd) {
        krate(o.frequency);
        const glide = Math.min(h.pd, spacing * 0.9);
        for (const at of times) {
          o.frequency.setValueAtTime(h.f, at);
          o.frequency.exponentialRampToValueAtTime(h.to, at + glide);
        }
      }
      const g = this.gain(0);
      strikes(
        g.gain,
        times,
        levels.map((v) => v * h.vol),
        0.001,
        h.decay / 5,
      );
      o.connect(g).connect(this.input);
      o.start(times[0]!);
      const end = last + h.decay * 1.4;
      o.stop(end);
      if (end >= srcEnd) {
        src = o;
        srcEnd = end;
      }
    }
    const n = k.noise;
    if (n) {
      let nt = times;
      let nl = levels;
      if (n.claps && n.claps > 1) {
        nt = [];
        nl = [];
        for (const [i, at] of times.entries())
          for (let c = 0; c < n.claps; c++) {
            nt.push(at + c * 0.0105);
            nl.push(levels[i]! * (0.7 + (0.3 * c) / n.claps));
          }
      }
      const ns = this.noiseSource();
      const flt = this.filter(n.type, n.f, n.q ?? 0.8);
      const g = this.gain(0);
      strikes(
        g.gain,
        nt,
        nl.map((v) => v * n.vol),
        n.a ?? 0,
        n.decay / 5,
      );
      ns.connect(flt).connect(g).connect(this.input);
      ns.start(nt[0]!, this.bus.rand());
      const end = nt[nt.length - 1]! + n.decay * 1.4 + (n.a ?? 0);
      ns.stop(end);
      if (end >= srcEnd) src = ns;
    }
    if (src) this.free(src);
    else this.building = null;
  }
}
