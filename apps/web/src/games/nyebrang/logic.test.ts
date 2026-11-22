import { describe, expect, it } from 'vitest';
import { HopBrain } from './brain';
import { COLS, hitAt, isLand, isOpen, itemsAt, type Lane, platformAt, trainState, World } from './lanes';
import { mapsFor, NyebrangMatch, type Runner, TUNING } from './logic';

const runners = (n: number, cpu = false) =>
  Array.from({ length: n }, (_, i) => ({ id: cpu ? -(i + 1) : i + 1, name: `P${i + 1}`, cpu }));

function running(
  n = 1,
  mode: 'balapan' | 'bertahan' = 'balapan',
  map: 'kota' | 'sungai' | 'rel' | 'malam' = 'kota',
) {
  const m = new NyebrangMatch({ rounds: 3, seed: 42, runners: runners(n) });
  m.pick(mode);
  m.next();
  m.pick(map);
  m.next();
  const run = (s: number) => {
    for (let t = 0; t < s; t += 1 / 60) m.step(1 / 60);
  };
  run(TUNING.introS + TUNING.countS + 0.05);
  expect(m.phase).toBe('run');
  return { m, run };
}

/** A time when the lane is clear around x for a while. */
function quietTime(lane: Lane, x: number, from: number): number {
  for (let t = from; t < from + 60; t += 0.02) {
    let ok = true;
    for (let k = -0.3; k <= 0.6; k += 0.05) if (hitAt(lane, t + k, x)) ok = false;
    if (ok) return t;
  }
  throw new Error('lane never clears');
}

describe('Nyebrang world', () => {
  it('is the same for the same seed and keeps a path through static rows', () => {
    for (const map of ['kota', 'sungai', 'rel', 'malam'] as const) {
      const a = new World(map, 9, null);
      const b = new World(map, 9, null);
      for (let row = 0; row < 220; row++) {
        const la = a.lane(row);
        expect(la.kind).toBe(b.lane(row).kind);
        if (la.kind === 'grass') {
          const open = la.props.filter((p) => !p).length;
          expect(open, `${map} row ${row}`).toBeGreaterThanOrEqual(3);
          const below = a.lane(row - 1);
          if (isLand(below.kind)) {
            // At least one column open in both rows (you can walk straight up).
            const shared = la.props.some((p, c) => !p && !below.props[c]);
            expect(shared, `${map} row ${row}`).toBe(true);
          }
        }
      }
    }
  });

  it('moves traffic in closed form, wrapping off screen', () => {
    const w = new World('kota', 3, null);
    let road: Lane | null = null;
    for (let r = 3; r < 60 && !road; r++) if (w.lane(r).kind === 'road') road = w.lane(r);
    expect(road).not.toBeNull();
    const a = itemsAt(road!, 1).map((i) => i.left);
    const b = itemsAt(road!, 1.5).map((i) => i.left);
    expect(a.length).toBeGreaterThan(0);
    // Every item moved by speed * dt unless it wrapped.
    const moved = a.filter((x, i) => Math.abs(b[i]! - x - road!.speed * 0.5) < 1e-6).length;
    expect(moved).toBeGreaterThanOrEqual(a.length - 1);
  });

  it('warns before every train and puts the train on the rail', () => {
    const w = new World('rel', 5, null);
    let rail: Lane | null = null;
    for (let r = 3; r < 80 && !rail; r++) if (w.lane(r).kind === 'rail') rail = w.lane(r);
    expect(rail?.train).toBeDefined();
    const states: number[] = [];
    for (let t = 0; t < rail!.train!.period * 2; t += 0.05) states.push(trainState(rail!, t));
    const arrive = states.findIndex((s, i) => i > 0 && s === 2 && states[i - 1] !== 2);
    expect(arrive).toBeGreaterThan(0);
    expect(states[arrive - 1]).toBe(1);
  });

  it('builds a finish line for Balapan', () => {
    const w = new World('sungai', 1, 30);
    expect(w.lane(30).kind).toBe('finish');
    expect(w.lane(0).kind).toBe('start');
  });

  it('cycles through every map for "acak"', () => {
    const maps = mapsFor('acak', 4, () => 0.3);
    expect(new Set(maps).size).toBe(4);
    expect(mapsFor('rel', 3, Math.random)).toEqual(['rel', 'rel', 'rel']);
  });
});

describe('Nyebrang hops', () => {
  it('hops one cell per input and queues the next ones', () => {
    const { m, run } = running(1);
    const r = m.runner(1)!;
    expect(r.row).toBe(1);
    m.input(1, 'left');
    m.input(1, 'left');
    m.input(1, 'left');
    m.input(1, 'left'); // over the queue limit: dropped
    run(TUNING.hop * 4);
    expect(r.x).toBe(Math.floor(COLS / 2) - 3);
    expect(r.hops).toBe(3);
  });

  it('bumps into obstacles and the start edge', () => {
    const { m } = running(1);
    const r = m.runner(1)!;
    r.row = 0;
    m.input(1, 'down');
    expect(r.hop).toBeNull();
  });

  it('a car in Balapan sends you back after 3 seconds; in Bertahan you are out', () => {
    for (const mode of ['balapan', 'bertahan'] as const) {
      const { m, run } = running(2, mode);
      const r = m.runner(1)!;
      let row = 3;
      while (m.world.lane(row).kind !== 'road') row++;
      const lane = m.world.lane(row);
      const car = itemsAt(lane, m.t)[0]!;
      r.row = row;
      r.x = Math.max(0, Math.min(COLS - 1, Math.round(car.left + car.len / 2)));
      if (!hitAt(lane, m.t, r.x)) {
        // Park right on the car's middle, wherever it is.
        r.x = car.left + car.len / 2;
      }
      m.step(1 / 60);
      expect(r.state).toBe(mode === 'balapan' ? 'dead' : 'out');
      expect(r.death).toBe('hit');
      if (mode === 'balapan') {
        run(TUNING.respawnS + 0.1);
        expect(r.state).toBe('run');
        expect(isLand(m.world.lane(r.row).kind)).toBe(true);
      }
    }
  });

  it('falls in the water without a log, and rides one with it', () => {
    const { m } = running(1, 'balapan', 'sungai');
    const r = m.runner(1)!;
    let row = 3;
    while (
      !(
        m.world.lane(row).kind === 'river' &&
        m.world.lane(row).speed !== 0 &&
        isLand(m.world.lane(row - 1).kind)
      )
    )
      row++;
    const lane = m.world.lane(row);
    // Find a column of the row below that is open, and a moment with water above it.
    const below = m.world.lane(row - 1);
    const col = [...Array(COLS).keys()].find((c) => isOpen(below, c))!;
    r.row = row - 1;
    r.x = col;
    let guard = 0;
    while (platformAt(lane, m.t + TUNING.hop, col) && guard++ < 2000) m.step(1 / 60);
    m.input(1, 'up');
    for (let i = 0; i < 12; i++) m.step(1 / 60);
    expect(r.death).toBe('water');

    const { m: m2 } = running(1, 'balapan', 'sungai');
    const r2 = m2.runner(1)!;
    r2.row = row - 1;
    r2.x = col;
    guard = 0;
    while (!platformAt(m2.world.lane(row), m2.t + TUNING.hop, col) && guard++ < 4000) m2.step(1 / 60);
    // Wait until the log will still be under us for a moment, and well inside the strip.
    m2.input(1, 'up');
    for (let i = 0; i < 10; i++) m2.step(1 / 60);
    if (r2.state === 'run') {
      expect(r2.riding).toBe(true);
      const x0 = r2.x;
      m2.step(0.05);
      if (r2.state === 'run') expect(r2.x).toBeCloseTo(x0 + m2.world.lane(row).speed * 0.05, 5);
    }
  });

  it('the camera catches whoever stays behind', () => {
    const { m, run } = running(2, 'bertahan');
    const lazy = m.runner(2)!;
    run(TUNING.graceS + 6);
    expect(lazy.state).toBe('out');
    expect(lazy.death).toBe('edge');
  });

  it('scores distance, near misses and place, double in the final ronde', () => {
    const m = new NyebrangMatch({ rounds: 1, seed: 1, runners: runners(2) });
    m.pick('bertahan');
    m.next();
    m.pick('kota');
    m.next();
    expect(m.isFinal).toBe(true);
    for (let t = 0; t < TUNING.introS + TUNING.countS + TUNING.graceS + 10; t += 1 / 30) m.step(1 / 30);
    expect(m.phase).toBe('roundEnd');
    const order = m.ranking();
    const first = order[0] as Runner;
    expect(first.gained).toBe((Math.max(0, first.best - 1) + first.near * TUNING.nearPoints + 25) * 2);
  });

  it('crosses the finish line in Balapan', () => {
    const { m } = running(1);
    const r = m.runner(1)!;
    const finish = m.world.finish!;
    const lane = m.world.lane(finish - 1);
    r.row = finish - 1;
    r.x = 5;
    if (lane.kind === 'river') {
      const p = itemsAt(lane, m.t)[0]!;
      r.x = p.left + 0.5;
    } else if (lane.kind === 'road' || lane.kind === 'rail') {
      const t = quietTime(lane, 5, m.t);
      while (m.t < t) m.step(1 / 120);
      r.row = finish - 1;
      r.x = 5;
    }
    m.input(1, 'up');
    for (let i = 0; i < 12; i++) m.step(1 / 60);
    if (r.state !== 'dead') {
      expect(r.state).toBe('done');
      expect(r.place).toBe(1);
    }
  });
});

describe('Nyebrang computer runners', () => {
  it('make real progress on every map without the match breaking', () => {
    for (const map of ['kota', 'sungai', 'rel', 'malam'] as const) {
      const m = new NyebrangMatch({ rounds: 1, seed: 11, runners: runners(3, true) });
      m.pick('balapan');
      m.next();
      m.pick(map);
      m.next();
      const brains = new Map(m.roster.map((r) => [r.id, new HopBrain(0.85, () => 0.5)]));
      for (let t = 0; t < 70 && m.phase !== 'roundEnd'; t += 1 / 30) {
        for (const r of m.roster) {
          const d = brains.get(r.id)!.decide(m, r);
          if (d) m.input(r.id, d);
        }
        m.step(1 / 30);
      }
      const best = Math.max(...m.roster.map((r) => r.best));
      expect(best, map).toBeGreaterThan(25);
    }
  });
});
