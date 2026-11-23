/**
 * Tiny procedural audio engine: every sound effect and music loop is synthesized with the
 * Web Audio API, so there are no audio files to download and nothing to license.
 * Music lives in ./music (instruments, songs, scheduler); this file owns the AudioContext,
 * the buses and the sound effects.
 */

import type { MusicIntensity, SfxName } from '@hoorah/sdk/bridge';
import { looksLikeTv } from './device';
import { DUCKS, mergeDuck } from './music/adaptive';
import { MusicPlayer } from './music/player';
import type { Track } from './music/songs';
import { NightSynth } from './night-sounds';

export type { Track };

/** Every sound name the engine knows; shared with games through the SDK. */
export type Sfx = SfxName;

type PitchPath = readonly (readonly [number, number])[];

/** Falling horn sighs: [start s, pitch path]. */
const FALL: readonly (readonly [number, PitchPath])[] = [
  [
    0,
    [
      [0, 392],
      [0.26, 370],
    ],
  ],
  [
    0.32,
    [
      [0, 370],
      [0.26, 349],
    ],
  ],
  [
    0.64,
    [
      [0, 349],
      [0.26, 330],
    ],
  ],
  [
    0.96,
    [
      [0, 330],
      [0.3, 322],
      [0.6, 294],
    ],
  ],
];

/** Bell partials: [frequency ratio, level, length factor]. */
const BELL_PARTIALS: readonly (readonly [number, number, number])[] = [
  [1, 1, 1],
  [2, 0.45, 0.7],
  [2.76, 0.3, 0.45],
  [5.4, 0.12, 0.25],
];

/** Music bus level: under the sound effects. */
const MUSIC_LEVEL = 0.22;

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  /** Kampung Siluman sounds, built on first use. */
  private night: NightSynth | null = null;
  private musicBus!: GainNode;
  /** Announcement ducking, after the music on/off level. */
  private duckBus!: GainNode;
  private duck: { depth: number; until: number } | null = null;
  private intensity: MusicIntensity = 0;
  private hurry = false;
  private noise!: AudioBuffer;
  private muted = false;
  private musicOn = true;
  private track: Track | null = null;
  private player: MusicPlayer | null = null;

  private readonly readyListeners = new Set<() => void>();

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.7;
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicOn ? MUSIC_LEVEL : 0;
    this.duckBus = ctx.createGain();
    this.musicBus.connect(this.duckBus).connect(this.master);
    // Smart TV browsers and 1–2 core machines get the music without reverb/delay (cheaper).
    const weak = looksLikeTv() || (navigator.hardwareConcurrency || 4) <= 2;
    this.player = new MusicPlayer(ctx, this.musicBus, { lite: weak });
    this.player.setIntensity(this.intensity);
    this.player.setHurry(this.hurry);
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    ctx.onstatechange = () => this.onState();
    return ctx;
  }

  private onState(): void {
    if (this.ctx?.state !== 'running') return;
    this.player?.play(this.track);
    for (const fn of this.readyListeners) fn();
  }

  /**
   * Starts (or resumes) audio. Browsers only allow this after the first touch, click or key
   * on the page; without one it quietly stays suspended. Safe to call any number of times.
   */
  unlock(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === 'running') this.onState();
    else void ctx.resume().catch(() => {});
  }

  /** Called whenever audio becomes playable (immediately if it already is). */
  onReady(fn: () => void): void {
    this.readyListeners.add(fn);
    if (this.ctx?.state === 'running') fn();
  }

  get unlocked(): boolean {
    return this.ctx?.state === 'running';
  }

  /** Music only (sound effects keep playing); `setMuted` silences everything. */
  setMusicOn(on: boolean): void {
    this.musicOn = on;
    if (this.ctx) this.musicBus.gain.setTargetAtTime(on ? MUSIC_LEVEL : 0, this.ctx.currentTime, 0.08);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /**
   * Selects the song (see ./music/songs). It starts as soon as audio is allowed to play; a
   * change crossfades, `null` fades out, and unknown ids play nothing.
   */
  music(track: Track | null): void {
    if (track === this.track) return;
    this.track = track;
    // Every song starts calm and at its written tempo.
    this.musicIntensity(0);
    this.musicHurry(false);
    if (this.ctx?.state === 'running') this.player?.play(track);
  }

  /** Adaptive layers of the current song (channels with tier <= level sound). */
  musicIntensity(level: MusicIntensity): void {
    this.intensity = level;
    this.player?.setIntensity(level);
  }

  /** Tempo about 8% up while on, eased in and out. */
  musicHurry(on: boolean): void {
    this.hurry = on;
    this.player?.setHurry(on);
  }

  /** Pulls the music down under an announcement sound, merging with a duck already running. */
  private duckFor(name: Sfx, now: number): void {
    const spec = DUCKS[name];
    if (!spec) return;
    const d = mergeDuck(this.duck, now, spec);
    this.duck = d;
    const g = this.duckBus.gain;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(d.depth, now, 0.03);
    g.setTargetAtTime(1, d.until, 0.25);
  }

  sfx(name: Sfx): void {
    const ctx = this.ctx;
    if (ctx?.state !== 'running') return;
    const t = ctx.currentTime + 0.005;
    const b = this.sfxBus;
    this.duckFor(name, ctx.currentTime);
    switch (name) {
      case 'tick':
        this.voice(b, 1320, t, 0.035, 'sine', 0.25);
        return;
      case 'select':
        this.voice(b, 660, t, 0.07, 'square', 0.18);
        this.voice(b, 990, t + 0.06, 0.1, 'square', 0.18);
        return;
      case 'back':
        this.voice(b, 700, t, 0.06, 'triangle', 0.25);
        this.voice(b, 470, t + 0.06, 0.09, 'triangle', 0.25);
        return;
      case 'join':
        [523, 659, 784, 1047].forEach((f, i) => {
          this.voice(b, f, t + i * 0.07, 0.16, 'triangle', 0.3);
        });
        return;
      case 'leave':
        [659, 523, 392].forEach((f, i) => {
          this.voice(b, f, t + i * 0.08, 0.14, 'triangle', 0.22);
        });
        return;
      case 'correct':
        [784, 988, 1175, 1568].forEach((f, i) => {
          this.voice(b, f, t + i * 0.06, 0.18, 'square', 0.16);
        });
        return;
      case 'wrong':
        this.voice(b, 220, t, 0.18, 'sawtooth', 0.22, 0.005, 160);
        this.voice(b, 165, t + 0.16, 0.3, 'sawtooth', 0.22, 0.005, 110);
        return;
      case 'count':
        this.voice(b, 880, t, 0.12, 'square', 0.22);
        return;
      case 'go':
        this.voice(b, 1320, t, 0.35, 'square', 0.24);
        this.voice(b, 660, t, 0.35, 'triangle', 0.24);
        return;
      case 'drop':
        this.noiseHit(b, t, 0.18, 'lowpass', 900, 0.5);
        this.voice(b, 140, t + 0.12, 0.18, 'sine', 0.8, 0.003, 60);
        return;
      case 'perfect':
        [1047, 1319, 1568, 2093].forEach((f, i) => {
          this.voice(b, f, t + i * 0.05, 0.22, 'triangle', 0.25);
        });
        return;
      case 'collapse':
        this.noiseHit(b, t, 1.4, 'lowpass', 500, 0.9);
        this.voice(b, 120, t, 1.2, 'sawtooth', 0.35, 0.01, 40);
        this.kick(b, t + 0.05, 1);
        return;
      case 'pull':
        this.kick(b, t, 0.35);
        return;
      case 'super':
        this.voice(b, 523, t, 0.3, 'sawtooth', 0.2, 0.005, 1046);
        this.noiseHit(b, t + 0.05, 0.25, 'bandpass', 2500, 0.3);
        return;
      case 'cheer':
        this.crowd(b, t, 1.6, 0.55);
        return;
      case 'clap':
        for (let i = 0; i < 6; i++)
          this.noiseHit(b, t + i * 0.11 + Math.random() * 0.03, 0.05, 'bandpass', 1800, 0.5);
        return;
      case 'boo':
        this.voice(b, 180, t, 0.6, 'sawtooth', 0.18, 0.05, 120);
        return;
      case 'win':
        [523, 659, 784].forEach((f, i) => {
          this.voice(b, f, t + i * 0.12, 0.14, 'square', 0.22);
        });
        [523, 659, 784, 1047].forEach((f) => {
          this.voice(b, f, t + 0.4, 0.8, 'triangle', 0.16);
        });
        this.crowd(b, t + 0.3, 2, 0.4);
        return;
      case 'whistle':
        this.voice(b, 2200, t, 0.45, 'sine', 0.2, 0.01, 2600);
        return;
      case 'tension':
        this.voice(b, 110, t, 0.5, 'sawtooth', 0.15, 0.2, 116);
        return;
      case 'reveal':
        this.noiseHit(b, t, 0.4, 'highpass', 3000, 0.25);
        this.voice(b, 392, t + 0.25, 0.4, 'triangle', 0.25, 0.005, 784);
        return;
      case 'engine':
        this.voice(b, 70, t, 0.45, 'sawtooth', 0.16, 0.02, 160);
        this.noiseHit(b, t, 0.4, 'lowpass', 400, 0.25);
        return;
      case 'boost':
        this.voice(b, 260, t, 0.45, 'sawtooth', 0.18, 0.005, 980);
        this.noiseHit(b, t, 0.5, 'bandpass', 2200, 0.35);
        return;
      case 'item':
        [784, 988, 1175, 1568, 1976].forEach((f, i) => {
          this.voice(b, f, t + i * 0.045, 0.09, 'square', 0.14);
        });
        return;
      case 'hit':
        this.noiseHit(b, t, 0.35, 'lowpass', 900, 0.6);
        this.voice(b, 420, t, 0.45, 'square', 0.18, 0.005, 110);
        return;
      case 'horn':
        // "Te-lo-let": three bright horn notes, each doubled a fifth up.
        [587, 740, 880].forEach((f, i) => {
          const at = t + i * 0.14;
          const dur = i === 2 ? 0.38 : 0.13;
          this.voice(b, f, at, dur, 'sawtooth', 0.12, 0.01);
          this.voice(b, f * 1.5, at, dur, 'square', 0.06, 0.01);
        });
        return;
      case 'lap':
        [659, 784, 988, 1319].forEach((f, i) => {
          this.voice(b, f, t + i * 0.07, 0.16, 'triangle', 0.24);
        });
        return;
      case 'skid':
        this.noiseHit(b, t, 0.28, 'bandpass', 3200, 0.22);
        return;
      case 'chop':
        this.noiseHit(b, t, 0.05, 'highpass', 2500, 0.55);
        this.voice(b, 900, t, 0.04, 'triangle', 0.2);
        return;
      case 'sizzle':
        this.noiseHit(b, t, 0.9, 'highpass', 5200, 0.22);
        return;
      case 'stir':
        this.noiseHit(b, t, 0.18, 'bandpass', 700, 0.28);
        return;
      case 'flip':
        this.voice(b, 300, t, 0.18, 'sine', 0.3, 0.005, 720);
        this.noiseHit(b, t + 0.02, 0.1, 'bandpass', 1500, 0.2);
        return;
      case 'ding':
        this.voice(b, 1760, t, 0.7, 'sine', 0.22);
        this.voice(b, 2637, t, 0.45, 'sine', 0.1);
        return;
      case 'pour':
        this.noiseHit(b, t, 0.6, 'lowpass', 1200, 0.3);
        return;
      case 'splash':
        this.noiseHit(b, t, 0.4, 'bandpass', 1000, 0.45);
        return;
      case 'throw':
        // A quick whoosh rising in pitch.
        this.noiseHit(b, t, 0.22, 'bandpass', 1400, 0.35);
        this.voice(b, 300, t, 0.2, 'triangle', 0.14, 0.005, 900);
        return;
      case 'explode':
        // Petasan: a sharp crack, a low thump and a crackle tail.
        this.noiseHit(b, t, 0.08, 'highpass', 2500, 0.7);
        this.noiseHit(b, t + 0.01, 0.6, 'lowpass', 600, 0.8);
        this.voice(b, 120, t, 0.5, 'sine', 0.35, 0.002, 45);
        for (let i = 0; i < 5; i++)
          this.noiseHit(b, t + 0.12 + i * 0.07 + Math.random() * 0.03, 0.04, 'bandpass', 3000, 0.25);
        return;
      case 'jump':
        this.voice(b, 220, t, 0.25, 'triangle', 0.18, 0.005, 520);
        return;
      case 'brake':
        this.noiseHit(b, t, 0.35, 'bandpass', 3600, 0.16);
        this.voice(b, 1900, t, 0.3, 'sine', 0.05, 0.02, 1750);
        return;
      case 'reverse':
        // Reversing beeper: two short beeps.
        this.voice(b, 1180, t, 0.12, 'square', 0.08, 0.005);
        this.voice(b, 1180, t + 0.25, 0.12, 'square', 0.08, 0.005);
        return;
      case 'ready':
        [660, 990].forEach((f, i) => {
          this.voice(b, f, t + i * 0.08, 0.14, 'triangle', 0.2);
        });
        return;
      case 'tock':
        // The lower, woodier half of a clock's tick-tock.
        this.voice(b, 760, t, 0.05, 'sine', 0.24);
        this.noiseHit(b, t, 0.025, 'bandpass', 2400, 0.16);
        return;
      case 'weker':
        // Wind-up alarm clock: the hammer rattles between two small bells for about a second.
        for (let i = 0; i < 20; i++) {
          const at = t + i * 0.045;
          const f = i % 2 ? 2350 : 2093;
          const fade = i < 15 ? 1 : (20 - i) / 5;
          this.voice(b, f, at, 0.07, 'triangle', 0.07 * fade, 0.002);
          this.voice(b, f * 2.76, at, 0.04, 'sine', 0.025 * fade, 0.002);
        }
        return;
      case 'gong':
        // Big hanging gong: a soft mallet thump, a low beating hum and a few inharmonic partials.
        this.noiseHit(b, t, 0.12, 'lowpass', 700, 0.35);
        this.voice(b, 98, t, 2.6, 'sine', 0.42, 0.01);
        this.voice(b, 99.4, t, 2.4, 'sine', 0.24, 0.01);
        this.voice(b, 198, t, 1.8, 'sine', 0.13, 0.02);
        this.voice(b, 267, t, 1.4, 'sine', 0.09, 0.03);
        this.voice(b, 412, t, 0.9, 'sine', 0.05, 0.04);
        return;
      case 'rooster':
        this.nightSynth(ctx).rooster(t);
        return;
      case 'growl':
        this.nightSynth(ctx).roar(t);
        return;
      case 'bell':
        this.bellTone(b, 1046, t, 1.3, 0.22);
        return;
      case 'flute':
        this.nightSynth(ctx).suling(t);
        return;
      case 'night':
        this.nightSynth(ctx).night(t);
        return;
      case 'genta':
        this.nightSynth(ctx).genta(t);
        return;
      case 'kentongan':
        this.nightSynth(ctx).kentongan(t);
        return;
      case 'heart':
        this.nightSynth(ctx).heart(t);
        return;
      case 'birds':
        this.nightSynth(ctx).birds(t);
        return;
      case 'win-village':
        this.nightSynth(ctx).villageWin(t);
        return;
      case 'win-siluman':
        this.nightSynth(ctx).silumanWin(t);
        return;
      case 'round': {
        // Next round: a short snare roll into a bright chord hit.
        for (let i = 0; i < 8; i++) this.noiseHit(b, t + i * 0.035, 0.05, 'bandpass', 2200, 0.12 + i * 0.03);
        const hit = t + 0.3;
        this.kick(b, hit, 0.6);
        this.noiseHit(b, hit, 0.3, 'highpass', 4000, 0.22);
        for (const f of [392, 523, 659]) this.voice(b, f, hit, 0.5, 'square', 0.07);
        this.voice(b, 784, hit, 0.6, 'triangle', 0.14);
        return;
      }
      case 'stinger-win': {
        // Short fanfare: a quick pickup into a held major chord with a shimmer on top.
        [523, 659, 784].forEach((f, i) => {
          this.voice(b, f, t + i * 0.09, 0.12, 'square', 0.15);
        });
        const hit = t + 0.3;
        this.kick(b, hit, 0.5);
        this.noiseHit(b, hit, 0.6, 'highpass', 5000, 0.16);
        for (const f of [523, 659, 784, 1047]) {
          this.voice(b, f, hit, 1.0, 'triangle', 0.14);
          this.voice(b, f * 2, hit, 0.6, 'sine', 0.035);
        }
        return;
      }
      case 'stinger-fall':
        // "Wah wah wah waaah": falling horn sighs, the last one long and wobbling down.
        for (const [at, pts] of FALL) {
          const long = pts.length > 2;
          this.sweep(b, t + at, pts, 'sawtooth', 0.12, {
            filter: ['lowpass', 1100, 1.2],
            vibrato: long ? [6, 7] : undefined,
            attack: 0.03,
          });
        }
        return;
    }
  }

  /**
   * One oscillator following a pitch path (`points`: [seconds from `t`, Hz], linear between),
   * with optional filter, vibrato ([rate Hz, depth Hz]) and tremolo ([rate Hz, depth 0–1]).
   * The note lasts until the last point.
   */
  private nightSynth(ctx: AudioContext): NightSynth {
    this.night ??= new NightSynth(ctx, this.sfxBus);
    return this.night;
  }

  private sweep(
    bus: AudioNode,
    t: number,
    points: readonly (readonly [number, number])[],
    wave: OscillatorType,
    vol: number,
    opts: {
      attack?: number;
      filter?: readonly [BiquadFilterType, number, number];
      vibrato?: readonly [number, number];
      tremolo?: readonly [number, number];
    } = {},
  ): void {
    const ctx = this.ctx!;
    const first = points[0];
    const last = points[points.length - 1];
    if (!first || !last || last[0] <= 0) return;
    const end = t + last[0];
    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(first[1], t);
    for (const [at, f] of points.slice(1)) osc.frequency.linearRampToValueAtTime(f, t + at);
    const g = ctx.createGain();
    const attack = Math.min(opts.attack ?? 0.01, last[0] / 3);
    const release = Math.min(0.12, last[0] * 0.3);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, Math.max(t + attack, end - release));
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    const sources: OscillatorNode[] = [osc];
    let node: AudioNode = osc;
    if (opts.filter) {
      const f = ctx.createBiquadFilter();
      f.type = opts.filter[0];
      f.frequency.value = opts.filter[1];
      f.Q.value = opts.filter[2];
      node = node.connect(f);
    }
    if (opts.vibrato) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = opts.vibrato[0];
      depth.gain.value = opts.vibrato[1];
      lfo.connect(depth).connect(osc.frequency);
      sources.push(lfo);
    }
    if (opts.tremolo) {
      const trem = ctx.createGain();
      trem.gain.value = 1 - opts.tremolo[1] / 2;
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = opts.tremolo[0];
      depth.gain.value = opts.tremolo[1] / 2;
      lfo.connect(depth).connect(trem.gain);
      node = node.connect(trem);
      sources.push(lfo);
    }
    node.connect(g).connect(bus);
    for (const s of sources) {
      s.start(t);
      s.stop(end + 0.02);
    }
  }

  /** Struck metal bell: inharmonic sine partials that die away at different speeds. */
  private bellTone(bus: AudioNode, f: number, t: number, dur: number, vol: number): void {
    for (const [ratio, level, length] of BELL_PARTIALS)
      this.voice(bus, f * ratio, t, dur * length, 'sine', vol * level, 0.002);
    this.noiseHit(bus, t, 0.03, 'highpass', 5000, vol * 0.6);
  }

  private voice(
    bus: AudioNode,
    freq: number,
    t: number,
    dur: number,
    wave: OscillatorType,
    vol: number,
    attack = 0.004,
    glideTo?: number,
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, t);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(bus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noiseHit(
    bus: AudioNode,
    t: number,
    dur: number,
    type: BiquadFilterType,
    freq: number,
    vol: number,
  ): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private kick(bus: AudioNode, t: number, vol: number): void {
    this.voice(bus, 150, t, 0.16, 'sine', vol, 0.002, 45);
  }

  /** Amplitude-wobbled band-passed noise reads as a crowd. */
  private crowd(bus: AudioNode, t: number, dur: number, vol: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1100;
    f.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 7;
    lfoGain.gain.value = vol * 0.35;
    lfo.connect(lfoGain).connect(g.gain);
    src.connect(f).connect(g).connect(bus);
    src.start(t);
    lfo.start(t);
    src.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
  }
}

export const audio = new AudioEngine();
