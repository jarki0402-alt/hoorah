/**
 * Kampung Siluman sounds (owner picked them in the Lab, 2026-11-22): the night gong with crickets,
 * the role calls (tiger roar, temple bell, bamboo flute), a rooster built from how a real crow is
 * shaped, the alarm kentongan, the heartbeat, morning birds and the two endings. Synthesised, no
 * files. `NightSynth` plays into any output node, so the game engine and the Lab share it.
 */

type Path = readonly (readonly [number, number])[];

interface ToneOpts {
  attack?: number;
  release?: number;
  filter?: readonly [BiquadFilterType, number, number];
  /** Filter frequency over time (replaces the filter's start frequency). */
  filterPath?: Path;
  vibrato?: readonly [number, number];
  tremolo?: readonly [number, number];
  /** Share sent to the echo (0..1). */
  echo?: number;
  wave?: PeriodicWave;
}

export class NightSynth {
  private readonly echoIn: GainNode;
  private readonly noiseBuf: AudioBuffer;
  private throat: PeriodicWave | null = null;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly out: AudioNode,
  ) {
    // A short village-night echo: one delay line feeding back into itself, darker on every pass.
    this.echoIn = ctx.createGain();
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.29;
    const fb = ctx.createGain();
    fb.gain.value = 0.34;
    const dark = ctx.createBiquadFilter();
    dark.type = 'lowpass';
    dark.frequency.value = 2400;
    this.echoIn.connect(delay);
    delay.connect(dark);
    dark.connect(fb);
    fb.connect(delay);
    dark.connect(out);
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  /* ---------------------------------------------------------------- the sounds */

  /** Night falls: a long gong, crickets fading in. */
  night(t: number): void {
    this.gong(t, 4, 0.42);
    this.crickets(t, 1.0, 5.0, 0.035);
  }

  /** The siluman's turn: a breath in, a growl swelling into a roar, a rough exhale. */
  roar(t: number): void {
    this.noise(
      t,
      0.55,
      'bandpass',
      [
        [0, 900],
        [0.55, 500],
      ],
      1.2,
      0.07,
      0.2,
    );
    const g: Path = [
      [0, 68],
      [0.6, 84],
      [1.2, 112],
      [1.9, 96],
      [2.6, 58],
    ];
    this.tone(t + 0.5, g, 'sawtooth', 0.26, {
      filter: ['lowpass', 500, 3],
      filterPath: [
        [0, 450],
        [1.2, 1300],
        [2.6, 380],
      ],
      tremolo: [24, 0.55],
      vibrato: [5, 4],
      attack: 0.25,
      release: 0.7,
      echo: 0.2,
    });
    this.tone(
      t + 0.5,
      g.map(([a, f]) => [a, f / 2] as const),
      'sawtooth',
      0.18,
      {
        filter: ['lowpass', 300, 1],
        tremolo: [17, 0.5],
        attack: 0.3,
        release: 0.7,
      },
    );
    this.noise(
      t + 0.9,
      1.9,
      'bandpass',
      [
        [0, 380],
        [0.8, 1100],
        [1.9, 420],
      ],
      3,
      0.22,
      0.3,
      0.2,
    );
  }

  /** The Dukun's turn: a temple bell struck three times over a soft low hum. */
  genta(t: number): void {
    this.tone(
      t,
      [
        [0, 220],
        [3.2, 220],
      ],
      'sine',
      0.05,
      { attack: 0.6, release: 1.2 },
    );
    this.bell(t, 880, 2.4, 0.2);
    this.bell(t + 0.62, 659, 2.4, 0.2);
    this.bell(t + 1.24, 784, 2.8, 0.22);
  }

  /** The Tabib's turn: a slow bamboo flute phrase that climbs and settles, echoing. */
  suling(t: number): void {
    const notes: [number, number][] = [
      [587, 0.32],
      [659, 0.32],
      [784, 0.32],
      [880, 0.5],
      [784, 0.32],
      [659, 0.32],
      [587, 1.2],
    ];
    let at = 0;
    notes.forEach(([f, len], i) => {
      const last = i === notes.length - 1;
      const path: Path = [
        [0, f],
        [len, last ? f * 0.985 : f],
      ];
      this.tone(t + at, path, 'sine', 0.2, {
        attack: 0.04,
        vibrato: len > 0.4 ? [5.5, 8] : undefined,
        echo: 0.45,
      });
      this.tone(t + at, path, 'triangle', 0.035, { attack: 0.04 });
      this.noise(t + at, Math.min(len, 0.3), 'bandpass', [[0, f * 1.6]], 3, 0.05, 0.02);
      at += len;
    });
  }

  /**
   * Dawn: "ku-ku-ru-yuuuk". Built the way a real crow is shaped: a bright buzzing throat (many
   * harmonics) through three vocal-tract resonances, a quick upward glide at each syllable start,
   * a croaky half-pitch undertone, shaky pitch and loudness, and a long last syllable that rises,
   * holds and falls away.
   */
  rooster(t: number): void {
    const syllables: [number, Path, number][] = [
      [
        0,
        [
          [0, 430],
          [0.05, 640],
          [0.16, 610],
        ],
        0.06,
      ],
      [
        0.2,
        [
          [0, 470],
          [0.05, 690],
          [0.16, 650],
        ],
        0.06,
      ],
      [
        0.4,
        [
          [0, 500],
          [0.06, 730],
          [0.24, 700],
        ],
        0.07,
      ],
      [
        0.7,
        [
          [0, 560],
          [0.12, 790],
          [0.55, 840],
          [1.05, 810],
          [1.4, 690],
          [1.65, 500],
        ],
        0.35,
      ],
    ];
    const throat = this.throatWave();
    const sum = this.ctx.createGain();
    // Vocal-tract resonances of a big bird: parallel band filters, louder low ones.
    const formants: [number, number, number][] = [
      [1050, 4, 1],
      [2250, 5, 0.65],
      [3400, 6, 0.3],
    ];
    for (const [f, q, g] of formants) {
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      const lvl = this.ctx.createGain();
      lvl.gain.value = g * 2.4;
      sum.connect(bp);
      bp.connect(lvl);
      this.send(lvl, 0.28);
    }
    const end = t + 2.5;
    const shake = this.jitter(t, end, 45);
    for (const [at, path, release] of syllables) {
      const st = t + at;
      const len = path[path.length - 1]![0];
      const voice = this.ctx.createGain();
      this.envelope(voice, st, st + len, 0.22, 0.018, release);
      voice.connect(sum);
      // Main throat buzz and the croaky undertone an octave down.
      for (const [mul, vol] of [
        [1, 1],
        [0.5, 0.32],
      ] as const) {
        const osc = this.ctx.createOscillator();
        osc.setPeriodicWave(throat);
        osc.frequency.setValueAtTime(path[0]![1] * mul, st);
        for (const [pa, f] of path.slice(1)) osc.frequency.linearRampToValueAtTime(f * mul, st + pa);
        const pj = this.ctx.createGain();
        pj.gain.value = 18 * mul;
        shake.connect(pj);
        pj.connect(osc.frequency);
        const g = this.ctx.createGain();
        g.gain.value = vol;
        osc.connect(g);
        g.connect(voice);
        osc.start(st);
        osc.stop(st + len + 0.05);
      }
      // Breath through the beak.
      this.noise(st, len, 'bandpass', [[0, 2600]], 1.5, 0.035, 0.02);
    }
  }

  /** A victim at dawn: the village alarm kentongan, then a low thud. */
  kentongan(t: number): void {
    for (let i = 0; i < 12; i++) this.knock(t + i * 0.15, i % 2 ? 440 : 520, 0.32);
    this.tone(
      t + 1.9,
      [
        [0, 70],
        [0.9, 45],
      ],
      'sine',
      0.45,
      { attack: 0.005, release: 0.8 },
    );
    this.noise(t + 1.9, 0.3, 'lowpass', [[0, 300]], 1, 0.25);
  }

  /** One heavy lub-dub (the game repeats it, faster as the siluman's time runs out). */
  heart(t: number): void {
    this.tone(
      t,
      [
        [0, 74],
        [0.16, 40],
      ],
      'sine',
      0.95,
      { attack: 0.004, release: 0.14 },
    );
    this.tone(
      t,
      [
        [0, 148],
        [0.06, 90],
      ],
      'triangle',
      0.22,
      { attack: 0.002, release: 0.05 },
    );
    this.noise(t, 0.05, 'lowpass', [[0, 220]], 1, 0.45);
    this.tone(
      t + 0.21,
      [
        [0, 64],
        [0.15, 36],
      ],
      'sine',
      0.75,
      { attack: 0.004, release: 0.13 },
    );
    this.noise(t + 0.21, 0.04, 'lowpass', [[0, 200]], 1, 0.3);
  }

  /** Morning birds after the rooster. */
  birds(t: number): void {
    const chirps: [number, number][] = [
      [0, 2600],
      [0.12, 3100],
      [0.24, 2800],
      [0.7, 3400],
      [0.8, 3700],
      [1.3, 2900],
      [1.4, 3300],
      [1.5, 3600],
    ];
    for (const [at, f] of chirps)
      this.tone(
        t + at,
        [
          [0, f],
          [0.07, f * 1.35],
        ],
        'sine',
        0.06,
        { attack: 0.005, release: 0.04, echo: 0.3 },
      );
  }

  /** The villagers win: a bright bonang run ending on a gong. */
  villageWin(t: number): void {
    const run = [523, 587, 659, 784, 880, 784, 880, 1047];
    run.forEach((f, i) => {
      this.bell(t + i * 0.16, f, 0.8, 0.13, 0.2);
    });
    this.gong(t + 1.35, 3, 0.36);
  }

  /** The siluman wins: the roar, then a gong. */
  silumanWin(t: number): void {
    this.roar(t);
    this.gong(t + 2.6, 3.5, 0.45);
  }

  /* ---------------------------------------------------------------- building blocks */

  private send(node: AudioNode, echo = 0): void {
    node.connect(this.out);
    if (echo > 0) {
      const s = this.ctx.createGain();
      s.gain.value = echo;
      node.connect(s);
      s.connect(this.echoIn);
    }
  }

  private envelope(g: GainNode, t: number, end: number, vol: number, attack: number, release: number): void {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, Math.max(t + attack, end - release));
    g.gain.exponentialRampToValueAtTime(0.0001, end);
  }

  /** A buzzy throat: harmonics falling off slowly (1/n^0.7), like a syrinx under pressure. */
  private throatWave(): PeriodicWave {
    if (this.throat) return this.throat;
    const n = 28;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) imag[k] = 1 / k ** 0.7;
    this.throat = this.ctx.createPeriodicWave(real, imag);
    return this.throat;
  }

  /** Slow random wobble (-1..1, low passed noise) for shaky pitch. */
  private jitter(t: number, end: number, hz: number): AudioNode {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = hz;
    const boost = this.ctx.createGain();
    boost.gain.value = 3;
    src.connect(lp);
    lp.connect(boost);
    src.start(t, Math.random());
    src.stop(end);
    return boost;
  }

  private tone(t: number, path: Path, wave: OscillatorType, vol: number, o: ToneOpts = {}): void {
    const c = this.ctx;
    const first = path[0];
    const last = path[path.length - 1];
    if (!first || !last || last[0] <= 0) return;
    const end = t + last[0];
    const osc = c.createOscillator();
    if (o.wave) osc.setPeriodicWave(o.wave);
    else osc.type = wave;
    osc.frequency.setValueAtTime(first[1], t);
    for (const [at, f] of path.slice(1)) osc.frequency.linearRampToValueAtTime(f, t + at);
    const g = c.createGain();
    this.envelope(g, t, end, vol, o.attack ?? 0.01, Math.min(o.release ?? 0.15, last[0] * 0.4));
    let head: AudioNode = osc;
    if (o.filter) {
      const f = c.createBiquadFilter();
      f.type = o.filter[0];
      f.frequency.setValueAtTime(o.filterPath?.[0]?.[1] ?? o.filter[1], t);
      for (const [at, hz] of o.filterPath?.slice(1) ?? []) f.frequency.linearRampToValueAtTime(hz, t + at);
      f.Q.value = o.filter[2];
      head.connect(f);
      head = f;
    }
    if (o.vibrato) {
      const lfo = c.createOscillator();
      const depth = c.createGain();
      lfo.frequency.value = o.vibrato[0];
      depth.gain.value = o.vibrato[1];
      lfo.connect(depth);
      depth.connect(osc.frequency);
      lfo.start(t);
      lfo.stop(end);
    }
    if (o.tremolo) {
      const trem = c.createGain();
      trem.gain.value = 1 - o.tremolo[1] / 2;
      const lfo = c.createOscillator();
      const depth = c.createGain();
      lfo.frequency.value = o.tremolo[0];
      depth.gain.value = o.tremolo[1] / 2;
      lfo.connect(depth);
      depth.connect(trem.gain);
      head.connect(trem);
      head = trem;
      lfo.start(t);
      lfo.stop(end);
    }
    head.connect(g);
    this.send(g, o.echo);
    osc.start(t);
    osc.stop(end + 0.05);
  }

  private noise(
    t: number,
    dur: number,
    type: BiquadFilterType,
    path: Path,
    q: number,
    vol: number,
    attack = 0.005,
    echo = 0,
  ): void {
    if (dur <= 0) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(path[0]?.[1] ?? 1000, t);
    for (const [at, hz] of path.slice(1)) f.frequency.linearRampToValueAtTime(hz, t + at);
    const g = this.ctx.createGain();
    this.envelope(g, t, t + dur, vol, Math.min(attack, dur / 2), Math.min(0.2, dur * 0.6));
    src.connect(f);
    f.connect(g);
    this.send(g, echo);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  /** Struck metal bell: inharmonic partials dying at different speeds. */
  private bell(t: number, f: number, dur: number, vol: number, echo = 0.3): void {
    const partials: [number, number, number][] = [
      [1, 1, 1],
      [2.76, 0.45, 0.6],
      [5.4, 0.25, 0.35],
      [8.93, 0.12, 0.2],
    ];
    for (const [ratio, amp, life] of partials) {
      this.tone(
        t,
        [
          [0, f * ratio],
          [dur * life, f * ratio],
        ],
        'sine',
        vol * amp,
        {
          attack: 0.003,
          release: dur * life * 0.9,
          echo,
        },
      );
    }
  }

  /** Kentongan (hollow wooden slit drum) knock. */
  private knock(t: number, f: number, vol: number): void {
    this.tone(
      t,
      [
        [0, f * 1.04],
        [0.3, f],
      ],
      'sine',
      vol,
      { attack: 0.002, release: 0.28, echo: 0.35 },
    );
    this.tone(
      t,
      [
        [0, f * 2.3],
        [0.12, f * 2.2],
      ],
      'sine',
      vol * 0.3,
      { attack: 0.002, release: 0.1 },
    );
    this.noise(t, 0.03, 'bandpass', [[0, 1800]], 2, vol * 0.5);
  }

  private gong(t: number, len: number, vol: number): void {
    this.noise(t, 0.15, 'lowpass', [[0, 700]], 1, vol * 0.8);
    this.tone(
      t,
      [
        [0, 98],
        [len, 97],
      ],
      'sine',
      vol,
      { attack: 0.01, release: len * 0.85, echo: 0.2 },
    );
    this.tone(
      t,
      [
        [0, 99.5],
        [len * 0.9, 99],
      ],
      'sine',
      vol * 0.55,
      { attack: 0.01, release: len * 0.8 },
    );
    this.tone(
      t,
      [
        [0, 196],
        [len * 0.7, 195],
      ],
      'sine',
      vol * 0.3,
      { attack: 0.02, release: len * 0.6 },
    );
    this.tone(
      t,
      [
        [0, 271],
        [len * 0.5, 270],
      ],
      'sine',
      vol * 0.2,
      { attack: 0.03, release: len * 0.45 },
    );
    this.tone(
      t,
      [
        [0, 415],
        [len * 0.3, 414],
      ],
      'sine',
      vol * 0.1,
      { attack: 0.04, release: len * 0.25 },
    );
  }

  private crickets(t: number, from: number, to: number, vol: number): void {
    for (let at = from; at < to; at += 0.42 + ((at * 7.3) % 0.2)) {
      const grow = Math.min(1, (at - from) / 1.2 + 0.25);
      for (let k = 0; k < 3; k++) {
        this.tone(
          t + at + k * 0.045,
          [
            [0, 4300],
            [0.028, 4300],
          ],
          'sine',
          vol * grow,
          {
            attack: 0.004,
            release: 0.02,
          },
        );
      }
    }
  }
}
