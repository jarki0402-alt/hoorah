import { describe, expect, it } from 'vitest';
import { barPattern, chordSteps, compileSong, loopSeconds, type SongScore, STEPS, tokenize } from './score';
import { getSong, SONGS, TRACKS } from './songs';
import { karplus, reverbImpulse, rng, strikes } from './synth';
import { degreeToMidi, midiToFreq, noteToMidi, parseChord, voiceChord, voicingPitches } from './theory';

describe('notes', () => {
  it('converts note names to MIDI and frequency', () => {
    expect(noteToMidi('c4')).toBe(60);
    expect(noteToMidi('a4')).toBe(69);
    expect(noteToMidi('eb5')).toBe(75);
    expect(noteToMidi('f#3')).toBe(54);
    expect(noteToMidi('b5')).toBe(83);
    expect(noteToMidi('bb5')).toBe(82);
    expect(noteToMidi('x')).toBeNull();
    expect(noteToMidi('1')).toBeNull();
    expect(midiToFreq(69)).toBeCloseTo(440);
    expect(midiToFreq(60)).toBeCloseTo(261.626, 2);
    expect(midiToFreq(81)).toBeCloseTo(880);
  });
});

describe('chords', () => {
  it('parses chord symbols', () => {
    expect(parseChord('Gm9')).toMatchObject({ root: 7, bass: 7, tones: [0, 3, 7, 10, 14] });
    expect(parseChord('C13').tones).toEqual([0, 4, 7, 10, 14, 21]);
    expect(parseChord('Bb/D')).toMatchObject({ root: 10, bass: 2, tones: [0, 4, 7] });
    expect(parseChord('F#m7b5')).toMatchObject({ root: 6, tones: [0, 3, 6, 10] });
    expect(parseChord('Eb/D').bass).toBe(2);
    expect(() => parseChord('H7')).toThrow();
    expect(() => parseChord('Cmaj13#11')).toThrow();
  });

  it('keeps third and seventh first and drops root and fifth from extended voicings', () => {
    // C13 rootless: E, Bb, D (9th), A (13th)
    expect(voicingPitches(parseChord('C13'), 4).sort((a, b) => a - b)).toEqual([2, 4, 9, 10]);
    // A plain triad keeps all three tones.
    expect(voicingPitches(parseChord('G'), 3).sort((a, b) => a - b)).toEqual([2, 7, 11]);
  });

  it('voices chords inside the range with smooth voice leading', () => {
    const lo = 53;
    const hi = 74;
    const dm9 = voiceChord(parseChord('Dm9'), 4, lo, hi);
    const g13 = voiceChord(parseChord('G13'), 4, lo, hi, dm9);
    for (const v of [dm9, g13]) {
      expect(v).toHaveLength(4);
      expect(Math.min(...v)).toBeGreaterThanOrEqual(lo);
      expect(Math.max(...v)).toBeLessThanOrEqual(hi);
      expect([...v].sort((a, b) => a - b)).toEqual(v);
    }
    const moved = g13.reduce((s, n, i) => s + Math.abs(n - dm9[i]!), 0);
    expect(moved).toBeLessThanOrEqual(6);
  });

  it('resolves chord-relative degrees', () => {
    const am = parseChord('Am');
    const e7 = parseChord('E7');
    expect(degreeToMidi('1', am, e7, 36)).toBe(45); // A2
    expect(degreeToMidi('3', am, e7, 36)).toBe(48); // C3
    expect(degreeToMidi('5', am, e7, 36)).toBe(52);
    expect(degreeToMidi('8', am, e7, 36)).toBe(57);
    expect(degreeToMidi('v', am, e7, 36)).toBe(40); // E2, a fifth below
    expect(degreeToMidi('7', e7, am, 36)).toBe(50); // D3 over E2
    expect(degreeToMidi('a', am, e7, 36)).toBe(39); // D#2 leads to E2
    expect(degreeToMidi('1', parseChord('G/A'), am, 36)).toBe(45); // slash bass
    expect(degreeToMidi('z', am, e7, 36)).toBeNull();
  });
});

describe('score parsing', () => {
  it('tokenizes characters or words', () => {
    expect(tokenize('x..x')).toEqual(['x', '.', '.', 'x']);
    expect(tokenize('c5 - eb5 .')).toEqual(['c5', '-', 'eb5', '.']);
  });

  it('spreads chords over the steps of a bar', () => {
    expect(chordSteps('C')).toEqual(Array(16).fill('C'));
    const half = chordSteps('Dm7 G7');
    expect(half.slice(0, 8)).toEqual(Array(8).fill('Dm7'));
    expect(half.slice(8)).toEqual(Array(8).fill('G7'));
    const beats = chordSteps('C . F G');
    expect(beats[4]).toBe('C');
    expect(beats[8]).toBe('F');
    expect(beats[12]).toBe('G');
    expect(() => chordSteps('C D E')).toThrow();
  });

  it('cycles loops and places fills', () => {
    const spec = { loop: 'a|b', fill: 'f', every: 4 };
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((i) => barPattern(spec, i, 8))).toEqual([
      'a',
      'b',
      'a',
      'f',
      'a',
      'b',
      'a',
      'f',
    ]);
    expect(barPattern({ loop: 'a|b', fill: 'f' }, 7, 8)).toBe('f');
    expect(barPattern('a|b|c', 4, 8)).toBe('b');
  });
});

const tiny: SongScore = {
  id: 'tiny',
  bpm: 120,
  inst: {
    bass: { kind: 'tone', range: [36, 60] },
    keys: { kind: 'tone', range: [55, 72], voices: 3 },
    drum: { kind: 'drum', strokes: { x: {}, k: {} } },
  },
  sections: {
    intro: { bars: 1, chords: 'C', parts: { drum: 'x...o...r...fk.K' } },
    A: {
      bars: 2,
      chords: 'C | G7',
      parts: {
        bass: '1--.5...a.......|1...............',
        keys: 'x-..u...m.....n-',
        drum: { loop: 'x...x...x...x...', fill: 'X.X.X.X.X.X.X.X.' },
      },
    },
  },
  form: ['intro', 'A'],
  loopFrom: 1,
};

describe('compileSong', () => {
  const c = compileSong(tiny);

  it('expands sections and remembers where the loop restarts', () => {
    expect(c.bars).toHaveLength(3);
    expect(c.loopBar).toBe(1);
    expect(c.sectionOfBar).toEqual(['intro', 'A', 'A']);
    expect(c.bars.every((b) => b.length === STEPS)).toBe(true);
    expect(loopSeconds(c)).toBeCloseTo(4);
  });

  it('turns drum tokens into strokes, ghosts, rolls and flams', () => {
    const intro = c.bars[0]!;
    expect(intro[0]![0]).toMatchObject({ stroke: 'x', vel: 0.8, hits: 1 });
    expect(intro[4]![0]).toMatchObject({ stroke: 'x', vel: 0.4 });
    expect(intro[8]![0]).toMatchObject({ stroke: 'x', hits: 4 });
    expect(intro[12]![0]).toMatchObject({ flam: true });
    expect(intro[13]![0]).toMatchObject({ stroke: 'k', vel: 0.8 });
    expect(intro[15]![0]).toMatchObject({ stroke: 'k', vel: 1 });
    // The fill replaces the last bar of the section.
    expect(c.bars[2]![2]![0]).toMatchObject({ stroke: 'x', vel: 1 });
  });

  it('resolves degrees, holds and approach notes', () => {
    const bar = c.bars[1]!;
    const bass = (s: number) => bar[s]!.find((e) => e.inst === 'bass');
    expect(bass(0)).toMatchObject({ notes: [36], dur: 3 }); // C2 held for 3 steps
    expect(bass(4)).toMatchObject({ notes: [43], dur: 1 }); // G2
    expect(bass(8)?.notes).toEqual([42]); // F#2 leads to the G7 of the next bar
  });

  it('voices chords, up-strums, chops and anticipations', () => {
    const bar = c.bars[1]!;
    const keys = (s: number) => bar[s]!.find((e) => e.inst === 'keys')!;
    expect(keys(0).notes).toHaveLength(3);
    expect(keys(0).dur).toBe(2);
    expect(keys(4)).toMatchObject({ up: true });
    expect(keys(4).notes[0]).toBeGreaterThan(keys(4).notes[2]!);
    expect(keys(8)).toMatchObject({ mute: true });
    // "n" plays the coming G7 (B, D, F / G) two steps early.
    const pcs = keys(14)
      .notes.map((n) => n % 12)
      .sort((a, b) => a - b);
    expect(pcs.every((p) => [2, 5, 7, 11].includes(p))).toBe(true);
  });

  it('reports mistakes with their location', () => {
    const bad = {
      ...tiny,
      sections: { ...tiny.sections, intro: { bars: 1, chords: 'C', parts: { drum: 'x..' } } },
    };
    expect(() => compileSong(bad)).toThrow(/tiny\/intro bar 1 "drum": 3 steps/);
    const unknown = {
      ...tiny,
      sections: { ...tiny.sections, intro: { bars: 1, chords: 'C', parts: { piano: 'x' } } },
    };
    expect(() => compileSong(unknown)).toThrow(/no instrument "piano"/);
  });
});

describe('songs', () => {
  it('has a song for every track, including the three Bajaj circuits', () => {
    expect(TRACKS).toEqual(
      expect.arrayContaining([
        'menu',
        'kuis',
        'tarik',
        'rusun',
        'bajaj',
        'bajaj-pantai',
        'bajaj-puncak',
        'bajaj-arena',
        'masak',
      ]),
    );
    expect(getSong('menu')).toBe(SONGS.menu);
    expect(getSong('nope')).toBeUndefined();
    expect(getSong('constructor')).toBeUndefined();
    expect(getSong('toString')).toBeUndefined();
  });

  it('gives every song its own tempo', () => {
    const bpms = TRACKS.map((t) => SONGS[t].bpm);
    expect(new Set(bpms).size).toBe(bpms.length);
  });

  for (const id of TRACKS) {
    describe(id, () => {
      const song = SONGS[id];
      const c = compileSong(song);

      it('compiles into a 16–40 bar loop of real sections', () => {
        expect(song.id).toBe(id);
        const loopBars = c.bars.length - c.loopBar;
        expect(loopBars).toBeGreaterThanOrEqual(16);
        expect(loopBars).toBeLessThanOrEqual(40);
        expect(new Set(c.sectionOfBar.slice(c.loopBar)).size).toBeGreaterThanOrEqual(3);
        expect(loopSeconds(c)).toBeGreaterThan(45);
      });

      it('uses every instrument and keeps notes in their range', () => {
        const used = new Set<string>();
        for (const bar of c.bars)
          for (const step of bar)
            for (const e of step) {
              used.add(e.inst);
              const inst = song.inst[e.inst]!;
              if (inst.kind === 'drum') continue;
              const [lo, hi] = inst.range ?? [48, 72];
              for (const n of e.notes) {
                expect(n, `${e.inst} note`).toBeGreaterThanOrEqual(lo - 7);
                expect(n, `${e.inst} note`).toBeLessThanOrEqual(hi + 2);
              }
            }
        expect([...used].sort()).toEqual(Object.keys(song.inst).sort());
      });

      it('bounds the work done per step', () => {
        let most = 0;
        for (const bar of c.bars)
          for (const step of bar) {
            const notes = step.reduce((s, e) => s + Math.max(1, e.notes.length), 0);
            most = Math.max(most, notes);
          }
        expect(most).toBeLessThanOrEqual(16);
      });
    });
  }
});

describe('synth helpers', () => {
  it('makes a Karplus–Strong string at the right pitch that decays', () => {
    const rate = 24000;
    const f = 220;
    const d = karplus(f, rate, 1, { t60: 1, bright: 0.7, pick: 0.15 });
    expect(d).toHaveLength(rate);
    let peak = 0;
    for (const v of d) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeCloseTo(1, 5);
    // Autocorrelation peak around one period.
    const from = 2000;
    const period = rate / f;
    let best = 0;
    let bestLag = 0;
    for (let lag = Math.floor(period * 0.8); lag < period * 1.2; lag++) {
      let s = 0;
      for (let i = from; i < from + 2000; i++) s += d[i]! * d[i + lag]!;
      if (s > best) {
        best = s;
        bestLag = lag;
      }
    }
    expect(Math.abs(bestLag - period)).toBeLessThan(1.5);
    const energy = (a: number, b: number) => {
      let s = 0;
      for (let i = a; i < b; i++) s += d[i]! * d[i]!;
      return s;
    };
    expect(energy(rate * 0.6, rate * 0.7)).toBeLessThan(energy(0, rate * 0.1) / 20);
  });

  it('makes a decaying reverb impulse', () => {
    const ir = reverbImpulse(8000, 1);
    expect(ir).toHaveLength(8000);
    const early = ir.slice(200, 1200).reduce((s, v) => s + v * v, 0);
    const late = ir.slice(7000).reduce((s, v) => s + v * v, 0);
    expect(late).toBeLessThan(early / 100);
  });

  it('is deterministic for a seed', () => {
    const a = rng(5);
    const b = rng(5);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('continues a strike envelope smoothly between hits', () => {
    const calls: [string, number, number][] = [];
    const param = {
      setValueAtTime: (v: number, t: number) => calls.push(['set', v, t]),
      linearRampToValueAtTime: (v: number, t: number) => calls.push(['ramp', v, t]),
      setTargetAtTime: (v: number, t: number) => calls.push(['target', v, t]),
    } as unknown as AudioParam;
    strikes(param, [0, 0.1], [1, 0.5], 0.01, 0.05);
    expect(calls[0]).toEqual(['set', 0, 0]);
    expect(calls[1]).toEqual(['ramp', 1, 0.01]);
    // Second hit starts from the decayed level of the first, not from zero.
    expect(calls[3]![1]).toBeCloseTo(Math.exp(-0.09 / 0.05), 6);
  });
});
