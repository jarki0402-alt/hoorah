import { describe, expect, it } from 'vitest';
import {
  type Cue,
  dirsOf,
  intervalAt,
  isChoice,
  type LangkahEvent,
  LangkahMatch,
  type PlayerInfo,
  POINTS,
  planBabak,
  rng,
  STAGES,
  type Stage,
  speedAt,
  TIMING,
} from './logic';
import { pickAwards } from './results';
import { setupView, viewFor } from './views';

const FRUITS = ['semangka', 'alpukat', 'durian', 'nanas', 'jeruk', 'stroberi', 'mangga', 'rambutan'] as const;

function players(n: number, cpu = false): PlayerInfo[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `P${i + 1}`,
    fruit: FRUITS[i % FRUITS.length]!,
    color: '#F2453D',
    cpu,
  }));
}

function run(m: LangkahMatch, seconds: number, dt = 1 / 60): LangkahEvent[] {
  const out: LangkahEvent[] = [];
  for (let t = 0; t < seconds; t += dt) {
    m.tick(dt);
    out.push(...m.drainEvents());
  }
  return out;
}

function runUntil(m: LangkahMatch, done: (e: LangkahEvent[]) => boolean, max = 120): LangkahEvent[] {
  const out: LangkahEvent[] = [];
  for (let t = 0; t < max; t += 1 / 60) {
    m.tick(1 / 60);
    out.push(...m.drainEvents());
    if (done(out)) return out;
  }
  throw new Error('condition not reached');
}

function started(stage: Stage, n = 2, rounds = 4): LangkahMatch {
  const m = new LangkahMatch({ players: players(n), rounds, seed: 3 });
  m.choose(stage);
  m.start();
  run(m, TIMING.intro + 0.02);
  expect(m.phase).toBe('play');
  return m;
}

/** Runs until the walker's current cue is pressable and returns it. */
function waitCue(m: LangkahMatch, id: number): Cue {
  for (let i = 0; i < 600; i++) {
    const c = m.cueFor(m.player(id)!);
    if (c && m.t >= c.open) return c;
    m.tick(1 / 60);
  }
  throw new Error('no cue');
}

describe('tempo and plans', () => {
  it('speeds up inside a babak and for repeated babak', () => {
    for (const s of STAGES) {
      expect(intervalAt(s, 50, 0)).toBeLessThan(intervalAt(s, 0, 0));
      expect(intervalAt(s, 0, 2)).toBeLessThan(intervalAt(s, 0, 0));
      expect(speedAt(s, 0, 0)).toBeCloseTo(1, 6);
    }
  });

  it('plays a chosen babak three times and Acak distinct babak from calm to scary', () => {
    expect(planBabak('laser', 4, rng(1))).toEqual(['laser', 'laser', 'laser']);
    const acak = planBabak('acak', 4, rng(2));
    expect(acak.length).toBe(4);
    expect(new Set(acak).size).toBe(4);
    expect(isChoice('acak')).toBe(true);
    expect(isChoice('gua')).toBe(true);
    expect(isChoice('nope')).toBe(false);
  });

  it('only uses the directions of the stage', () => {
    for (const s of ['titian', 'laser', 'batu'] as const) {
      const m = started(s);
      run(m, 20);
      const allowed = new Set(dirsOf(s));
      for (const c of m.cues) expect(allowed.has(c.dir)).toBe(true);
    }
  });
});

describe('setup', () => {
  it('waits for the Host, takes a choice and starts', () => {
    const m = new LangkahMatch({ players: players(2), rounds: 4, seed: 1 });
    expect(m.phase).toBe('setup');
    run(m, 5);
    expect(m.phase).toBe('setup');
    expect(m.choose('bogus')).toBe(false);
    expect(m.choose('tangga')).toBe(true);
    expect(m.start()).toBe(true);
    expect(m.plan).toEqual(['tangga', 'tangga', 'tangga']);
    expect(m.phase).toBe('intro');
    expect(m.choose('gua')).toBe(false);
  });

  it('shows the Host a picture menu and the others a waiting one', () => {
    const m = new LangkahMatch({ players: players(2), rounds: 4, seed: 1 });
    const host = setupView(m, 1, 1);
    expect(host.kind).toBe('menu');
    if (host.kind !== 'menu') return;
    expect(host.options.length).toBe(9);
    expect(host.options.every((o) => typeof o.thumb === 'string')).toBe(true);
    expect(host.confirm).toBeTruthy();
    const other = setupView(m, 2, 1);
    expect(other.kind === 'menu' && other.locked).toBe(true);
  });
});

describe('judging', () => {
  it('counts the right arrow on the beat as PAS and advances', () => {
    const m = started('eskalator');
    const c = waitCue(m, 1);
    const j = m.press(1, c.dir, c.at);
    expect(j).toBe('pas');
    const p = m.player(1)!;
    expect(p.step).toBe(1);
    expect(p.streak).toBe(1);
    expect(p.babakPoints).toBe(POINTS.pas);
  });

  it('drops a walker who presses the wrong arrow', () => {
    const m = started('eskalator');
    const c = waitCue(m, 1);
    const wrong = dirsOf('eskalator').find((d) => d !== c.dir)!;
    expect(m.press(1, wrong, m.t)).toBe('fall');
    const ev = m.drainEvents().find((e) => e.k === 'fall');
    expect(ev).toMatchObject({ k: 'fall', id: 1, why: 'wrong', step: 0 });
    expect(m.player(1)!.fallen).toBe(true);
    expect(m.press(1, c.dir, m.t)).toBeNull();
  });

  it('drops a walker who misses the window, only after the network grace', () => {
    const m = started('eskalator');
    const c = waitCue(m, 1);
    while (m.t <= c.close + TIMING.grace * 0.5) m.tick(1 / 120);
    expect(m.player(1)!.fallen).toBe(false);
    // A press made in time that arrives late still counts.
    expect(m.press(1, c.dir, c.close - 0.01)).not.toBe('fall');
    const c2 = m.cues[m.player(2)!.next]!;
    while (m.t <= c2.close + TIMING.grace + 0.02) m.tick(1 / 120);
    expect(m.player(2)!.fallen).toBe(true);
    expect(m.player(2)!.why).toBe('late');
  });

  it('ignores presses before a cue shows and bouncy double taps', () => {
    const m = started('eskalator');
    expect(m.press(1, 'up', 0.01)).toBeNull();
    const c = waitCue(m, 1);
    expect(m.press(1, c.dir, c.at)).toBe('pas');
    expect(m.press(1, c.dir, c.at + 0.03)).toBeNull();
  });

  it('punishes jumping too early in Lorong Laser', () => {
    const m = started('laser');
    let c = m.cues[0];
    while (!c || m.t < c.show) {
      m.tick(1 / 60);
      c = m.cues[0];
    }
    expect(m.t).toBeLessThan(c.open);
    expect(m.press(1, c.dir, m.t)).toBe('fall');
    expect(m.player(1)!.why).toBe('early');
  });

  it('hides arrows in the dark cave but keeps them pressable', () => {
    const m = started('gua');
    const c = waitCue(m, 1);
    expect(c.hide).not.toBeNull();
    expect(c.hide!).toBeLessThan(c.close);
  });

  it('shows a memory sequence, then takes it back from memory', () => {
    const m = started('ingat');
    const ev = runUntil(m, (e) => e.some((x) => x.k === 'memorize'));
    expect(ev.find((e) => e.k === 'memorize')).toMatchObject({ length: 3 });
    expect(m.memoCues().length).toBe(3);
    const seq = m.memoCues().map((c) => c.dir);
    // Pressing during the memorise phase is ignored.
    expect(m.press(1, seq[0]!, m.t)).toBeNull();
    while (m.t < m.memo!.recallAt) m.tick(1 / 60);
    for (const d of seq) expect(m.press(1, d, m.t)).not.toBe('fall');
    expect(m.player(1)!.step).toBe(3);
  });
});

describe('babak flow', () => {
  it('ends early when everybody fell, then moves to the next babak', () => {
    const m = started('eskalator', 2);
    const ev = runUntil(m, (e) => e.some((x) => x.k === 'babakEnd'));
    expect(ev.filter((e) => e.k === 'fall').length).toBe(2);
    run(m, TIMING.end + 0.1);
    expect(m.babak).toBe(1);
    expect(m.phase).toBe('intro');
    expect(m.player(1)!.fallen).toBe(false);
  });

  it('gives survivors a bonus, doubles the final and remembers the near record', () => {
    const m = started('eskalator', 1, 4);
    const p = m.player(1)!;
    // Babak 1: clear five cues, then fall.
    for (let i = 0; i < 5; i++) {
      const c = waitCue(m, 1);
      m.press(1, c.dir, c.at);
    }
    let ev = runUntil(m, (e) => e.some((x) => x.k === 'babakEnd'));
    expect(ev.find((e) => e.k === 'fall')).toMatchObject({ step: 5, best: 0, record: false });
    expect(p.stats.best).toBe(5);
    runUntil(m, (e) => e.some((x) => x.k === 'play'));
    // Babak 2: four cues, one short of the record.
    for (let i = 0; i < 4; i++) {
      const c = waitCue(m, 1);
      m.press(1, c.dir, c.at);
    }
    ev = runUntil(m, (e) => e.some((x) => x.k === 'fall'));
    expect(ev.find((e) => e.k === 'fall')).toMatchObject({ step: 4, best: 5 });
    expect(p.prevBest).toBe(5);
    expect(m.record).toMatchObject({ id: 1, steps: 5 });
  });

  it('plays a whole Acak session of computer walkers to the end', () => {
    const m = new LangkahMatch({ players: players(6, true), rounds: 4, seed: 11, skill: 0.6 });
    m.start();
    const ev = run(m, 400, 1 / 30);
    expect(m.phase).toBe('done');
    expect(ev.filter((e) => e.k === 'babakEnd').length).toBe(4);
    expect(m.players.every((p) => p.rounds.length === 4)).toBe(true);
    expect(m.players.some((p) => p.stats.steps > 10)).toBe(true);
    const awards = pickAwards(m.players);
    expect(new Set(awards.map((a) => a.playerId)).size).toBe(6);
  });

  it('keeps a late joiner out until the next babak', () => {
    const m = started('eskalator');
    m.addPlayer({ id: 9, name: 'Late', fruit: 'nanas', color: '#2F8CFF', cpu: false });
    expect(m.player(9)!.inRound).toBe(false);
    expect(m.press(9, 'up', m.t)).toBeNull();
    expect(
      viewFor({ match: m, id: 9, hostId: 1, guests: [], titles: new Map(), preview: true }),
    ).toMatchObject({
      kind: 'message',
      reactions: true,
    });
  });
});

describe('phone views', () => {
  it('shows the d-pad with steps and streak, then a near-record message after a fall', () => {
    const m = started('eskalator');
    const c = waitCue(m, 1);
    m.press(1, c.dir, c.at);
    const v = viewFor({ match: m, id: 1, hostId: 1, guests: [], titles: new Map(), preview: true });
    expect(v.kind === 'pad' && v.mode).toBe('dpad');
    expect(v.kind === 'pad' && v.reliable).toBe(true);
    const p = m.player(1)!;
    p.stats.best = 3;
    const c2 = waitCue(m, 1);
    m.press(1, dirsOf('eskalator').find((d) => d !== c2.dir)!, m.t);
    const fell = viewFor({ match: m, id: 1, hostId: 1, guests: [], titles: new Map(), preview: true });
    expect(fell).toMatchObject({ kind: 'message', reactions: true });
    expect(fell.kind === 'message' && fell.subtitle).toContain('2');
  });
});
