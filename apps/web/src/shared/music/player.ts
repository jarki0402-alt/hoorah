/**
 * Music player: look-ahead scheduler, crossfades between songs, and an offline renderer that
 * uses exactly the same code (for previews and loudness measurements).
 *
 * Signal flow per playing song:
 *   instrument channels → fader ─────────────────────────────→ out (the music bus)
 *                       ↘ reverb send → revIn → shared reverb ↗
 *                       ↘ delay send  → song delay → fader
 * A crossfade fades the old song's fader and reverb send while the new one starts cleanly.
 */

import { type CompiledSong, compileSong, STEPS } from './score';
import { getSong } from './songs';
import { type Bus, Channel, reverbImpulse, rng, type Song } from './synth';

/** How far ahead notes are scheduled (s); generous so slow frames on weak devices don't cause gaps. */
const LOOKAHEAD = 0.3;
const LOOKAHEAD_HIDDEN = 1.3;
const TICK_MS = 50;
/** Old song fade time constant (≈ 0.6 s to silence). */
const FADE_TAU = 0.13;
/** Gap before the next song starts after a crossfade begins. */
const NEXT_DELAY = 0.3;
/** Mono in, mono impulse: one convolution (a stereo 1.6 s impulse cost 2.5× as much). */
const REVERB_SECONDS = 1.2;
const REVERB_RETURN = 0.55;

export interface PlayerOptions {
  /** false for OfflineAudioContext rendering: no timers, notes are scheduled by `scheduleUntil`. */
  realtime?: boolean;
  /**
   * For weak devices (Smart TV browsers, 1–2 core machines): no reverb or delay. The shared
   * convolver is the single most expensive part of the music (about a third of its CPU).
   */
  lite?: boolean;
}

export interface MusicStats {
  /** Audio nodes created since the player was made. */
  nodes: number;
  /** Notes skipped because an instrument hit its polyphony limit. */
  dropped: number;
}

interface Instance {
  id: string;
  song: Song;
  score: CompiledSong;
  channels: Map<string, Channel>;
  fader: GainNode;
  revIn: GainNode | null;
  extra: AudioNode[];
  stepDur: number;
  bar: number;
  step: number;
  /** Context time of the next step to schedule. */
  time: number;
}

const compiled = new Map<string, CompiledSong>();

/** Compiles (once) and returns a song, or null for unknown ids and broken scores. */
function load(id: string): { song: Song; score: CompiledSong } | null {
  const song = getSong(id);
  if (!song) return null;
  let score = compiled.get(id);
  if (!score) {
    try {
      score = compileSong(song);
    } catch (err) {
      console.warn('[music]', err);
      return null;
    }
    compiled.set(id, score);
  }
  return { song, score };
}

export class MusicPlayer {
  readonly stats: MusicStats = { nodes: 0, dropped: 0 };
  private cur: Instance | null = null;
  private fading: { inst: Instance; until: number }[] = [];
  private reverbIn: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | 0 = 0;
  private seed = 1;

  private readonly realtime: boolean;
  private readonly lite: boolean;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly out: AudioNode,
    opts: PlayerOptions = {},
  ) {
    this.realtime = opts.realtime ?? true;
    this.lite = opts.lite ?? false;
  }

  /** Id of the song playing now (null while silent). */
  get current(): string | null {
    return this.cur?.id ?? null;
  }

  /**
   * Switches to another song: the old one fades out (~0.6 s) and the new one starts cleanly.
   * `null` or an unknown id just fades out.
   */
  play(id: string | null, at?: number): void {
    if (this.current === id) return;
    const now = this.ctx.currentTime;
    const hadSong = this.cur !== null;
    if (this.cur) this.fadeOut(this.cur, now);
    this.cur = null;
    const loaded = id ? load(id) : null;
    if (loaded) {
      this.cur = this.start(id!, loaded.song, loaded.score, at ?? now + (hadSong ? NEXT_DELAY : 0.05));
      this.scheduleUntil(this.cur.time + LOOKAHEAD);
    }
    if (this.realtime) this.ensureTimer();
  }

  /** Stops everything at once (no fade) and frees all nodes. */
  dispose(): void {
    if (this.cur) this.release(this.cur);
    for (const f of this.fading) this.release(f.inst);
    this.cur = null;
    this.fading = [];
    if (this.timer) clearInterval(this.timer);
    this.timer = 0;
  }

  /** Schedules every note of the current song that starts before `horizon` (context time). */
  scheduleUntil(horizon: number): void {
    const inst = this.cur;
    if (!inst) return;
    const now = this.realtime ? this.ctx.currentTime : 0;
    // After a long stall (hidden tab, frozen main thread) skip what was missed instead of
    // playing a burst of late notes.
    if (inst.time < now - 0.05) this.advance(inst, Math.ceil((now - inst.time) / inst.stepDur));
    for (let guard = 0; inst.time < horizon && guard < 4096; guard++) {
      this.scheduleStep(inst);
      this.advance(inst, 1);
    }
  }

  private advance(inst: Instance, steps: number): void {
    const { score } = inst;
    const loopSteps = (score.bars.length - score.loopBar) * STEPS;
    let pos = inst.bar * STEPS + inst.step + steps;
    const end = score.bars.length * STEPS;
    if (pos >= end) pos = score.loopBar * STEPS + ((pos - end) % loopSteps);
    inst.bar = Math.floor(pos / STEPS);
    inst.step = pos % STEPS;
    inst.time += steps * inst.stepDur;
  }

  private scheduleStep(inst: Instance): void {
    const events = inst.score.bars[inst.bar]?.[inst.step];
    if (!events?.length) return;
    const swing = inst.step % 2 === 1 ? inst.score.swing * inst.stepDur : 0;
    const rand = this.rand;
    for (const e of events) {
      const ch = inst.channels.get(e.inst);
      if (!ch) continue;
      const human = ch.def.human ?? 0.003;
      ch.play(e, inst.time + swing + (rand() - 0.5) * 2 * human, inst.stepDur);
    }
  }

  private rand = rng(12345);

  private start(id: string, song: Song, score: CompiledSong, at: number): Instance {
    const ctx = this.ctx;
    this.rand = rng(this.seed++ * 7919);
    const fader = ctx.createGain();
    fader.gain.value = song.gain;
    fader.connect(this.out);
    this.stats.nodes++;
    let revIn: GainNode | null = null;
    const extra: AudioNode[] = [];
    const usesReverb = !this.lite && Object.values(song.inst).some((i) => (i.rev ?? 0) > 0);
    if (usesReverb) {
      revIn = ctx.createGain();
      revIn.gain.value = song.gain;
      revIn.connect(this.reverb());
      this.stats.nodes++;
    }
    let dlyIn: GainNode | null = null;
    if (song.delay && !this.lite) {
      dlyIn = ctx.createGain();
      const delay = ctx.createDelay(2);
      delay.delayTime.value = Math.min(1.9, (song.delay.beats * 60) / song.bpm);
      const fb = ctx.createGain();
      fb.gain.value = song.delay.feedback;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = song.delay.tone ?? 2600;
      dlyIn.connect(delay).connect(lp).connect(fb).connect(delay);
      lp.connect(fader);
      extra.push(dlyIn, delay, fb, lp);
      this.stats.nodes += 4;
    }
    const bus: Bus = { ctx, dry: fader, rev: revIn, dly: dlyIn, stats: this.stats, rand: this.rand };
    const channels = new Map<string, Channel>();
    for (const [key, def] of Object.entries(song.inst)) channels.set(key, new Channel(def, bus));
    return {
      id,
      song,
      score,
      channels,
      fader,
      revIn,
      extra,
      stepDur: 60 / song.bpm / 4,
      bar: 0,
      step: 0,
      time: at,
    };
  }

  /** The shared reverb, created on first use. */
  private reverb(): AudioNode {
    if (this.reverbIn) return this.reverbIn;
    const ctx = this.ctx;
    const input = ctx.createGain();
    input.channelCount = 1;
    input.channelCountMode = 'explicit';
    const conv = ctx.createConvolver();
    const ir = reverbImpulse(ctx.sampleRate, REVERB_SECONDS);
    const buf = ctx.createBuffer(1, ir.length, ctx.sampleRate);
    buf.getChannelData(0).set(ir);
    conv.buffer = buf;
    const ret = ctx.createGain();
    ret.gain.value = REVERB_RETURN;
    input.connect(conv).connect(ret).connect(this.out);
    this.stats.nodes += 3;
    this.reverbIn = input;
    return input;
  }

  private fadeOut(inst: Instance, now: number): void {
    for (const g of [inst.fader, inst.revIn]) {
      if (!g) continue;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.setTargetAtTime(0, now, FADE_TAU);
    }
    // Reverb and delay tails are inside the faded path too; free the nodes once silent.
    this.fading.push({ inst, until: now + FADE_TAU * 9 + LOOKAHEAD });
  }

  private release(inst: Instance): void {
    for (const ch of inst.channels.values()) ch.dispose();
    inst.fader.disconnect();
    inst.revIn?.disconnect();
    for (const n of inst.extra) n.disconnect();
  }

  private ensureTimer(): void {
    if (this.timer || (!this.cur && !this.fading.length)) return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  private tick(): void {
    const now = this.ctx.currentTime;
    const hidden = typeof document !== 'undefined' && document.hidden;
    this.scheduleUntil(now + (hidden ? LOOKAHEAD_HIDDEN : LOOKAHEAD));
    if (this.fading.length) {
      this.fading = this.fading.filter((f) => {
        if (f.until > now) return true;
        this.release(f.inst);
        return false;
      });
    }
    if (!this.cur && !this.fading.length && this.timer) {
      clearInterval(this.timer);
      this.timer = 0;
    }
  }
}

/**
 * Schedules `seconds` of a song on any context (normally an OfflineAudioContext) through the
 * same instruments the game uses; then call `startRendering()`. On an OfflineAudioContext the
 * notes are scheduled in small chunks while it renders (via `suspend`), like the live
 * look-ahead scheduler, so render time reflects the real cost. The returned stats keep
 * counting while it renders.
 */
export function renderSong(
  ctx: BaseAudioContext,
  track: string,
  seconds: number,
  opts: { out?: AudioNode; lite?: boolean } = {},
): MusicStats {
  const player = new MusicPlayer(ctx, opts.out ?? ctx.destination, { realtime: false, lite: opts.lite });
  player.play(track, 0.02);
  const offline = ctx as OfflineAudioContext;
  if (typeof offline.suspend !== 'function' || typeof offline.startRendering !== 'function') {
    player.scheduleUntil(seconds);
    return player.stats;
  }
  const chunk = 0.25;
  player.scheduleUntil(Math.min(seconds, chunk * 2));
  for (let t = chunk; t < seconds; t += chunk) {
    void offline.suspend(t).then(() => {
      player.scheduleUntil(Math.min(seconds, t + chunk * 2));
      void offline.resume();
    });
  }
  return player.stats;
}
