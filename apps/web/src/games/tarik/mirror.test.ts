import { type Fruit, lookOfFruit, type PlayerInfo } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { type BoardFacts, factsOf, hudFrom } from './board';
import { TarikMatch, type Team } from './logic';
import {
  applyMirror,
  type MirrorSource,
  MirrorTimeline,
  mirrorClocks,
  mirrorFacts,
  mirrorRoster,
  newSupers,
  type SuperMark,
  TAP_STEP_MS,
  TapPacer,
  type TarikMirror,
  toMirror,
} from './mirror';
import { CLOCK_AHEAD_MAX_MS } from './playout';

const OFFSET = 1_000_000;
const FRUITS: Fruit[] = ['semangka', 'alpukat', 'durian', 'nanas', 'jeruk', 'stroberi', 'mangga', 'rambutan'];

function player(id: number): PlayerInfo {
  const fruit = FRUITS[(id - 1) % FRUITS.length]!;
  return {
    id,
    name: `Pemain ${id}`,
    fruit,
    look: lookOfFruit(fruit),
    color: '#F2453D',
    connected: true,
    isHost: id === 1,
  };
}

interface Run {
  m: TarikMatch;
  t: number;
  counters: Map<number, number>;
}

function newRun(n: number): Run {
  const m = new TarikMatch({ rounds: 3 });
  m.setPlayers(Array.from({ length: n }, (_, i) => player(i + 1)));
  return { m, t: 0, counters: new Map() };
}

function advance(run: Run, until: (m: TarikMatch) => boolean, onTick?: () => void): void {
  for (let i = 0; i < 30_000 && !until(run.m); i++) {
    run.t += 10;
    run.m.advance(run.t, run.t + OFFSET);
    run.m.drainEvents();
    onTick?.();
  }
  expect(until(run.m)).toBe(true);
}

function tap(run: Run, id: number): number {
  const c = ((run.counters.get(id) ?? 0) + 1) & 0xffff;
  run.counters.set(id, c);
  return run.m.input(id, c, run.t + OFFSET, run.t, run.t + OFFSET).counted;
}

/** Red players (by team) tap 12 times a second until `until`. */
function pullRed(run: Run, until: (m: TarikMatch) => boolean): void {
  const reds = run.m.roster('red').map((m) => m.id);
  advance(run, until, () => {
    if (run.m.phase === 'pull' && run.t % 80 === 0) for (const id of reds) tap(run, id);
  });
}

function source(run: Run, extra: Partial<MirrorSource> = {}): MirrorSource {
  const m = run.m;
  return {
    facts: factsOf(m, run.t, (x) => x.connected),
    server: run.t + OFFSET,
    force: { red: m.teamForce('red'), blue: m.teamForce('blue') },
    taps: { red: 0, blue: 0 },
    supers: [],
    ticker: null,
    ringStart: m.ringStart,
    ringPeriod: m.tuning.ringPeriodMs,
    countLeft: m.phase === 'countdown' ? 3 * m.tuning.countStepMs - (run.t - m.phaseStart) : 0,
    countStep: m.tuning.countStepMs,
    held: false,
    ...extra,
  };
}

function wire(state: TarikMirror): TarikMirror {
  const parsed = applyMirror(JSON.parse(JSON.stringify(state)));
  if (!parsed) throw new Error('rejected');
  return parsed;
}

/** What the far-away screen rebuilds from one packet, read without interpolation, at its moment. */
function rebuilt(state: TarikMirror): BoardFacts {
  const line = new MirrorTimeline();
  line.push(state, state.t + 250);
  return mirrorFacts(state, line.sample(state.t + 250), mirrorClocks(state, state.t));
}

describe('tarik mirror', () => {
  it('round-trips the board mid-pull', () => {
    const run = newRun(4);
    advance(run, (m) => m.phase === 'pull');
    pullRed(run, () => run.m.phase === 'pull' && run.t - run.m.pullStart >= 1000);
    const supers: SuperMark[] = [{ n: 4, team: 'red', combo: 2 }];
    const state = wire(
      toMirror(
        source(run, {
          taps: { red: 120, blue: 7 },
          supers,
          ticker: { key: 5, bold: 'Rina', text: 'menarik kuat!' },
        }),
      ),
    );
    const facts = factsOf(run.m, run.t, (x) => x.connected);
    const back = rebuilt(state);
    expect(back.p).toBeCloseTo(facts.p, 3);
    expect(back.p).toBeLessThan(0);
    expect(back.rate.red).toBeCloseTo(facts.rate.red, 2);
    expect(back.timeLeft).toBe(Math.round(facts.timeLeft));
    expect(back.sincePull).toBe(Math.round(facts.sincePull));
    expect(back.teams).toEqual(facts.teams);
    expect({ ...back, p: 0, rate: null, timeLeft: 0, sincePull: 0 }).toEqual({
      ...facts,
      p: 0,
      rate: null,
      timeLeft: 0,
      sincePull: 0,
    });
    expect(state.tp).toEqual([120, 7]);
    expect(state.tk).toEqual([5, 'Rina', 'menarik kuat!']);
    expect(newSupers(state, 3)).toEqual(supers);
    expect(newSupers(state, 4)).toEqual([]);
    expect(state.ring).toEqual([run.m.ringStart, run.m.tuning.ringPeriodMs]);
    expect(mirrorRoster(state, 'red').map((r) => r.id)).toEqual(run.m.roster('red').map((r) => r.id));
  });

  it('rebuilds the same HUD between rounds and at the end', () => {
    const run = newRun(2);
    advance(run, (m) => m.phase === 'pull');
    pullRed(run, (m) => m.phase === 'scoreboard');
    const shown = (m: TarikMatch) => hudFrom(factsOf(m, run.t, (x) => x.connected));
    const scoreboard = hudFrom(rebuilt(wire(toMirror(source(run)))));
    expect(scoreboard.overlay).toEqual(shown(run.m).overlay);
    expect(scoreboard.overlay.kind).toBe('scoreboard');
    expect(scoreboard.timer).toBe(shown(run.m).timer);
    pullRed(run, (m) => m.phase === 'matchEnd');
    const state = wire(toMirror(source(run)));
    expect(state.h).toBe('rr');
    expect(state.mw).toBe('red');
    expect(hudFrom(rebuilt(state)).overlay).toEqual(shown(run.m).overlay);
  });

  it('shows who is waiting for a second player', () => {
    const run = newRun(1);
    run.m.advance(10, 10 + OFFSET);
    const state = wire(toMirror(source(run)));
    expect(state.wt).toEqual([1]);
    const hud = hudFrom(rebuilt(state));
    expect(hud.overlay).toEqual({
      kind: 'waiting',
      players: [{ id: 1, name: 'Pemain 1', look: player(1).look, connected: true }],
    });
  });

  it('keeps a disconnected puller dimmed', () => {
    const run = newRun(2);
    advance(run, (m) => m.phase === 'pull');
    const state = wire(
      toMirror({ ...source(run), facts: factsOf(run.m, run.t, (x) => x.id !== 2 && x.connected) }),
    );
    expect(state.off).toEqual([2]);
    const all = [...mirrorRoster(state, 'red'), ...mirrorRoster(state, 'blue')];
    expect(all.find((r) => r.id === 2)?.connected).toBe(false);
    expect(all.find((r) => r.id === 1)?.connected).toBe(true);
  });

  it('rejects malformed states', () => {
    const run = newRun(2);
    advance(run, (m) => m.phase === 'pull');
    const good = JSON.parse(JSON.stringify(toMirror(source(run)))) as Record<string, unknown>;
    expect(applyMirror(good)).not.toBeNull();
    const bad: Record<string, unknown>[] = [
      { ...good, v: 2 },
      { ...good, ph: 'tarik' },
      { ...good, p: 1.5 },
      { ...good, p: 'x' },
      { ...good, t: null },
      { ...good, n: 0 },
      { ...good, wn: 9 },
      { ...good, cv: 4 },
      { ...good, left: -1 },
      { ...good, f: [1] },
      { ...good, tp: [1, -1] },
      { ...good, ring: [0, 0] },
      { ...good, h: 'rbx' },
      { ...good, lw: 'green' },
      { ...good, lr: 'luck' },
      { ...good, tm: [[1], [99]] },
      { ...good, wt: [99] },
      { ...good, pl: [[1, 'Rina', { c: 'nobody' }]] },
      { ...good, pl: [[1, 'x'.repeat(41), { c: 'leo' }]] },
      { ...good, su: [[1, 'red']] },
      { ...good, su: Array.from({ length: 9 }, (_, i) => [i, 'red', 0]) },
      { ...good, tk: [1, 'a', 'b'.repeat(201)] },
      { ...good, off: Array.from({ length: 33 }, (_, i) => i) },
      { ...good, hold: 'no' },
    ];
    for (const b of bad) expect(applyMirror(b)).toBeNull();
    expect(applyMirror(null)).toBeNull();
    expect(applyMirror([])).toBeNull();
    expect(applyMirror('state')).toBeNull();
  });

  it('stays well under the packet limit with 8 players', () => {
    const run = newRun(8);
    advance(run, (m) => m.phase === 'pull');
    for (const m of run.m.allMembers()) {
      m.name = 'Abcdefghijkl';
      m.look = { c: 'putri', s: 3, h: 'leo', hc: 2, oc: 4 };
    }
    pullRed(run, () => run.t - run.m.pullStart >= 1000);
    const supers = Array.from({ length: 6 }, (_, i) => ({ n: 100 + i, team: 'red' as Team, combo: 9 }));
    const ticker = { key: 999, bold: 'Abcdefghijkl', text: 'x'.repeat(120) };
    const json = JSON.stringify(
      toMirror(source(run, { taps: { red: 99_999, blue: 99_999 }, supers, ticker })),
    );
    expect(json.length).toBeLessThan(2500);
  });
});

function snap(t: number, p: number, extra: Partial<TarikMirror> = {}): TarikMirror {
  const run = newRun(2);
  advance(run, (m) => m.phase === 'pull');
  const base = wire(toMirror(source(run)));
  return { ...base, t, p, f: [p * 10, 0], left: 30_000 - t, sp: t, ...extra };
}

describe('tarik mirror timeline', () => {
  const LAG = 300;

  it('plays packets back a little behind server time, interpolated', () => {
    const line = new MirrorTimeline();
    expect(line.push(snap(1000, 0), 1000 + LAG)).toBe(true);
    expect(line.push(snap(1070, 0.07), 1070 + LAG)).toBe(false);
    expect(line.push(snap(1140, 0.14), 1140 + LAG)).toBe(false);
    expect(line.lag).toBe(LAG);
    const s = line.sample(1140 + LAG);
    // Trip 300 plus a buffer of 1.5 packet gaps (no jitter yet): drawn time 1035.
    expect(line.behind).toBeCloseTo(LAG + 105, 6);
    expect(s.p).toBeCloseTo(0.035, 6);
    expect(s.force.red).toBeCloseTo(0.35, 6);
    // Later than the newest packet: hold it, never extrapolate.
    expect(line.sample(5000 + LAG).p).toBeCloseTo(0.14, 6);
  });

  it('absorbs a late packet without jumping back or skipping ahead', () => {
    const line = new MirrorTimeline();
    line.push(snap(1000, 0), 1000 + LAG);
    line.push(snap(1070, 0.07), 1070 + LAG);
    // 60 ms of extra network jitter: the rope waits on the newest packet, then carries on.
    const before = line.sample(1140 + LAG + 59).p;
    expect(before).toBeCloseTo(0.07, 6);
    line.push(snap(1140, 0.14), 1140 + LAG + 60);
    expect(line.lag).toBe(LAG);
    const after = line.sample(1140 + LAG + 60).p;
    expect(after).toBeGreaterThanOrEqual(before);
    expect(after).toBeLessThan(0.08);
  });

  it('snaps on a new phase, a pause, sudden death or a restarted Host', () => {
    const line = new MirrorTimeline();
    line.push(snap(1000, 0.2), 1000 + LAG);
    line.push(snap(1070, 0.3), 1070 + LAG);
    expect(line.push(snap(1140, -1, { ph: 'roundEnd' }), 1140 + LAG)).toBe(true);
    expect(line.sample(1140 + LAG).p).toBe(-1);
    expect(line.push(snap(1210, -1, { ph: 'roundEnd', hold: true }), 1210 + LAG)).toBe(true);
    expect(line.push(snap(1280, 0, { sd: true }), 1280 + LAG)).toBe(true);
    expect(line.push(snap(500, 0.5), 500 + LAG)).toBe(true);
    expect(line.sample(500 + LAG).p).toBe(0.5);
  });

  it('shrinks the delay on a fast direct link, and follows a route change without the rope jumping', () => {
    const line = new MirrorTimeline();
    const base = snap(0, 0);
    // The rope walks steadily: position = Host time / 20 s. Relay first, then a direct link.
    const trip = (t: number) => (t < 4000 ? 260 + ((t * 7) % 50) : 30 + ((t * 7) % 5));
    const sent = Array.from({ length: 200 }, (_, i) => i * 60);
    let k = 0;
    let lastP = Number.NEGATIVE_INFINITY;
    let maxStep = 0;
    for (let now = 0; now < 12_000; now += 16) {
      while (k < sent.length && sent[k]! + trip(sent[k]!) <= now) {
        const t = sent[k++]!;
        line.push({ ...base, t, p: t / 20_000 }, t + trip(t));
      }
      if (k === 0) continue;
      const p = line.sample(now).p;
      if (lastP > Number.NEGATIVE_INFINITY) {
        expect(p).toBeGreaterThanOrEqual(lastP - 1e-9);
        maxStep = Math.max(maxStep, p - lastP);
      }
      lastP = p;
    }
    // Never more than a little over real-time speed (16 ms of rope per frame = 0.0008).
    expect(maxStep).toBeLessThan(0.0008 * 1.15);
    expect(line.lag).toBeLessThan(36);
    expect(line.behind! - line.lag!).toBeLessThan(120);
  });
});

describe('tarik mirror clocks (server time)', () => {
  const T = 50_000;

  it('runs the round clock on server time from the newest packet, and stops it while paused', () => {
    const s = snap(T, 0, { left: 20_000, sp: 5000 });
    expect(mirrorClocks(s, T + 400)).toMatchObject({ phase: 'pull', left: 19_600, sincePull: 5400 });
    expect(mirrorClocks({ ...s, hold: true }, T + 400)).toMatchObject({ left: 20_000, sincePull: 5000 });
    // A link that dies does not run the clock away.
    expect(mirrorClocks(s, T + 60_000).left).toBe(20_000 - CLOCK_AHEAD_MAX_MS);
  });

  it('counts down and shows GO at the server moment the Host starts the pull', () => {
    const s = snap(T, 0, { ph: 'countdown', cv: 2, cd: [1500, 900], left: 30_000, sp: 0 });
    expect(mirrorClocks(s, T).countValue).toBe(2);
    expect(mirrorClocks(s, T + 500).countValue).toBe(2);
    expect(mirrorClocks(s, T + 700).countValue).toBe(1);
    expect(mirrorClocks({ ...s, hold: true }, T + 700).countValue).toBe(2);
    const go = mirrorClocks(s, T + 1600);
    expect(go).toMatchObject({ phase: 'pull', sincePull: 100, left: 29_900, countValue: 0 });
    expect(
      hudFrom(mirrorFacts(s, { p: 0, force: { red: 0, blue: 0 }, rate: { red: 0, blue: 0 } }, go)).overlay,
    ).toEqual({ kind: 'go' });
  });

  it('carries the countdown from the Host and validates it', () => {
    const run = newRun(2);
    advance(run, (m) => m.phase === 'countdown');
    run.t += 400;
    run.m.advance(run.t, run.t + OFFSET);
    const s = wire(toMirror(source(run)));
    expect(s.cd).toEqual([3 * run.m.tuning.countStepMs - 400, run.m.tuning.countStepMs]);
    expect(mirrorClocks(s, s.t).countValue).toBe(run.m.countValue);
    expect(applyMirror({ ...s, cd: [1, 0] })).toBeNull();
    expect(applyMirror({ ...s, cd: [-5, 900] })).toBeNull();
    expect(applyMirror({ ...s, cd: 'x' })).toBeNull();
  });
});

describe('tarik tap pacer', () => {
  it('spreads a burst of taps over several steps', () => {
    const pacer = new TapPacer();
    pacer.feed([50, 10]);
    expect(pacer.take('red', 0)).toBe(0);
    pacer.feed([59, 10]);
    const got: number[] = [];
    for (let t = 0; t < 1000; t += 10) {
      const n = pacer.take('red', t);
      if (n > 0) got.push(n);
    }
    expect(got.reduce((a, b) => a + b, 0)).toBe(9);
    expect(got.length).toBeGreaterThan(2);
    expect(Math.max(...got)).toBe(3);
    expect(pacer.take('blue', 0)).toBe(0);
  });

  it('waits a step between releases and resets on a lower counter', () => {
    const pacer = new TapPacer();
    pacer.feed([0, 0]);
    pacer.feed([0, 6]);
    expect(pacer.take('blue', 100)).toBe(2);
    expect(pacer.take('blue', 100 + TAP_STEP_MS - 1)).toBe(0);
    expect(pacer.take('blue', 100 + TAP_STEP_MS)).toBe(2);
    pacer.clear();
    expect(pacer.take('blue', 1000)).toBe(0);
    pacer.feed([0, 2]);
    pacer.feed([0, 5]);
    expect(pacer.take('blue', 2000)).toBe(1);
  });
});
