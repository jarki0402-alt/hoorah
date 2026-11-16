/**
 * Tiny procedural audio engine: every sound effect and music loop is synthesized with the
 * Web Audio API, so there are no audio files to download and nothing to license.
 * Music lives in ./music (instruments, songs, scheduler); this file owns the AudioContext,
 * the buses and the sound effects.
 */

import { looksLikeTv } from './device';
import { MusicPlayer } from './music/player';
import type { Track } from './music/songs';

export type { Track };

export type Sfx =
  | 'tick'
  | 'select'
  | 'back'
  | 'join'
  | 'leave'
  | 'correct'
  | 'wrong'
  | 'count'
  | 'go'
  | 'drop'
  | 'perfect'
  | 'collapse'
  | 'pull'
  | 'super'
  | 'cheer'
  | 'clap'
  | 'boo'
  | 'win'
  | 'whistle'
  | 'tension'
  | 'reveal'
  // Bajaj Rush
  | 'engine'
  | 'boost'
  | 'item'
  | 'hit'
  | 'horn'
  | 'lap'
  | 'skid'
  // Jago Masak
  | 'chop'
  | 'sizzle'
  | 'stir'
  | 'flip'
  | 'ding'
  | 'pour'
  | 'splash'
  // Bajaj Rush v2
  | 'throw'
  | 'explode'
  | 'jump'
  | 'brake'
  | 'reverse'
  | 'ready';

/** Music bus level: under the sound effects. */
const MUSIC_LEVEL = 0.22;

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
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
    this.musicBus.connect(this.master);
    // Smart TV browsers and 1–2 core machines get the music without reverb/delay (cheaper).
    const weak = looksLikeTv() || (navigator.hardwareConcurrency || 4) <= 2;
    this.player = new MusicPlayer(ctx, this.musicBus, { lite: weak });
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
    if (this.ctx?.state === 'running') this.player?.play(track);
  }

  sfx(name: Sfx): void {
    const ctx = this.ctx;
    if (ctx?.state !== 'running') return;
    const t = ctx.currentTime + 0.005;
    const b = this.sfxBus;
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
    }
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
