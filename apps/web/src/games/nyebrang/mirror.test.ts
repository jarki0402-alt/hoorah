import { type Fruit, type Look, lookOfFruit } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import type { Overlay } from './hud';
import { COLS, type ItemPos, isLand, isOpen, itemsAt, platformAt, trainState, type World } from './lanes';
import { type Mode, NyebrangMatch, TUNING } from './logic';
import {
  applyMirror,
  camAt,
  MarkReader,
  MatchClock,
  matchTimeAt,
  mirrorHud,
  mirrorOverlay,
  type NyebrangMirror,
  restPose,
  toMirror,
  worldOf,
} from './mirror';
import { CLOCK_AHEAD_MAX_MS } from './playout';

const FRUITS: Fruit[] = ['semangka', 'alpukat', 'durian', 'nanas', 'jeruk', 'stroberi', 'mangga', 'rambutan'];
const COLORS = ['#F2453D', '#2F7BEA', '#2DB36A', '#FFC928', '#FF8A1F', '#1BB5C9', '#E2559A', '#8A5A2B'];
const lookOf = (id: number): { look: Look; color: string } => ({
  look: lookOfFruit(FRUITS[(Math.abs(id) - 1) % FRUITS.length]!),
  color: COLORS[(Math.abs(id) - 1) % COLORS.length]!,
});

const START_SERVER = 7_000_000;

/** A match with its own server clock: every step advances both by the same time. */
function host(n: number, mode: Mode = 'balapan', map: 'kota' | 'sungai' | 'rel' | 'malam' = 'kota') {
  const m = new NyebrangMatch({
    rounds: 3,
    seed: 42,
    runners: Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `Pemain Nomor ${i + 1}`, cpu: false })),
  });
  const clock = { server: START_SERVER };
  const step = (s: number) => {
    for (let t = 0; t < s - 1e-9; t += 1 / 60) {
      m.step(1 / 60);
      clock.server += 1000 / 60;
    }
  };
  const publish = (overlay: Overlay = { kind: 'none' }, held = false): NyebrangMirror =>
    toMirror({ server: clock.server, match: m, overlay, held, look: lookOf, horns: 0, hornRow: -1 });
  m.pick(mode);
  m.next();
  m.pick(map);
  m.next();
  step(TUNING.introS + TUNING.countS + 0.05);
  expect(m.phase).toBe('run');
  return { m, clock, step, publish };
}

const wire = (s: NyebrangMirror): unknown => JSON.parse(JSON.stringify(s));

function sameItems(a: ItemPos[], b: ItemPos[]): void {
  expect(a.length).toBe(b.length);
  a.forEach((it, i) => {
    const o = b[i]!;
    expect(o.kind).toBe(it.kind);
    expect(o.len).toBe(it.len);
    // Anchors are rounded to the millisecond: a train (about 30 cells/s) is off by < 0.05 cells.
    expect(Math.abs(o.left - it.left)).toBeLessThan(0.05);
  });
}

/** Every moving thing on screen, on the Host at its time and on the mirror at `mt`. */
function sameTraffic(hostWorld: World, hostT: number, mirror: World, mt: number, from: number): void {
  for (let row = Math.max(0, from); row < from + 24; row++) {
    const a = hostWorld.lane(row);
    const b = mirror.lane(row);
    expect(b.kind).toBe(a.kind);
    expect(b.props).toEqual(a.props);
    sameItems(itemsAt(a, hostT, []), itemsAt(b, mt, []));
    if (a.kind === 'rail') expect(trainState(b, mt)).toBe(trainState(a, hostT));
  }
}

describe('Nyebrang mirror wire', () => {
  it('round-trips through JSON', () => {
    const { m, step, publish } = host(3);
    m.input(1, 'left');
    m.input(2, 'right');
    step(1 / 60);
    const s = publish({ kind: 'banner', text: 'KAMERA MAKIN CEPAT', tone: 'yellow' });
    expect(s.rs[0]![8] ?? s.rs[1]![8] ?? s.rs[2]![8]).not.toBeNull();
    expect(applyMirror(wire(s))).toEqual(wire(s));
  });

  it('round-trips setup, ronde results and the final', () => {
    const m = new NyebrangMatch({ rounds: 2, seed: 7, runners: [{ id: 1, name: 'A', cpu: false }] });
    const src = (overlay: Overlay) =>
      toMirror({ server: 1000, match: m, overlay, held: false, look: lookOf, horns: 2, hornRow: 9 });
    const setup = src({ kind: 'setup', step: 'map', mode: 'bertahan', map: 'acak', host: 'Budi' });
    expect(setup.r).toBe(-1);
    expect(applyMirror(wire(setup))).toEqual(wire(setup));
    const rows = [
      {
        id: 1,
        name: 'A',
        look: lookOf(1).look,
        color: '#F2453D',
        dist: 12,
        near: 2,
        gained: 40,
        total: 40,
        rank: 1,
      },
    ];
    const end = src({ kind: 'roundEnd', round: 1, rows, next: 'Ronde berikutnya dalam 5', record: null });
    expect(applyMirror(wire(end))).toEqual(wire(end));
    const fin = src({ kind: 'final', rows });
    expect(applyMirror(wire(fin))).toEqual(wire(fin));
    const parsed = applyMirror(wire(fin))!;
    const ov = mirrorOverlay(parsed, 1000);
    expect(ov.kind === 'final' && ov.rows[0]?.name).toBe('A');
  });

  it('rejects malformed states', () => {
    const { m, step, publish } = host(2);
    m.input(1, 'up');
    step(1 / 60);
    const good = wire(publish()) as Record<string, unknown>;
    expect(applyMirror(good)).not.toBeNull();
    const bad = (patch: (j: Record<string, unknown>) => void) => {
      const j = JSON.parse(JSON.stringify(good)) as Record<string, unknown>;
      patch(j);
      return applyMirror(j);
    };
    expect(applyMirror(null)).toBeNull();
    expect(applyMirror('x')).toBeNull();
    expect(applyMirror([good])).toBeNull();
    expect(bad((j) => (j.v = 2))).toBeNull();
    expect(bad((j) => (j.t = 'now'))).toBeNull();
    expect(bad((j) => (j.mt = Number.NaN))).toBeNull();
    expect(bad((j) => (j.mt = -1))).toBeNull();
    expect(bad((j) => (j.hold = true))).toBeNull();
    expect(bad((j) => (j.ph = 'party'))).toBeNull();
    expect(bad((j) => (j.mo = 'santai'))).toBeNull();
    expect(bad((j) => (j.r = 9))).toBeNull();
    expect(bad((j) => (j.lv = 0))).toBeNull();
    expect(bad((j) => (j.w = ['bulan', 1, null]))).toBeNull();
    expect(bad((j) => (j.w = ['kota', -1, null]))).toBeNull();
    expect(bad((j) => (j.w = ['kota', 1, 0]))).toBeNull();
    expect(bad((j) => (j.ov = ['z']))).toBeNull();
    expect(bad((j) => (j.ov = ['c', 12]))).toBeNull();
    expect(bad((j) => (j.ov = ['e', 1, [[1, 2, 3]], 'x', null]))).toBeNull();
    expect(bad((j) => (j.hn = [1]))).toBeNull();
    expect(bad((j) => (j.rs = {}))).toBeNull();
    expect(bad((j) => (j.rs = Array.from({ length: 30 }, () => (j.rs as unknown[])[0])))).toBeNull();
    const runner = (patch: (r: unknown[]) => void) =>
      bad((j) => {
        patch((j.rs as unknown[][])[0]!);
      });
    expect(runner((r) => r.pop())).toBeNull();
    expect(runner((r) => (r[1] = 'x'.repeat(41)))).toBeNull();
    expect(runner((r) => (r[2] = { c: 'alien' }))).toBeNull();
    expect(runner((r) => (r[3] = 'red'))).toBeNull();
    expect(runner((r) => (r[5] = 7))).toBeNull();
    expect(runner((r) => (r[6] = Number.POSITIVE_INFINITY))).toBeNull();
    expect(runner((r) => (r[7] = 1.5))).toBeNull();
    expect(runner((r) => (r[8] = [0, 0, 0]))).toBeNull();
    expect(runner((r) => (r[8] = [0, 1, 0, 2, 3, 9]))).toBeNull();
    expect(runner((r) => (r[10] = 5))).toBeNull();
    expect(runner((r) => (r[17] = -1))).toBeNull();
  });

  it('stays small with 8 players, and under the limit with 16', () => {
    for (const [n, limit] of [
      [8, 2500],
      [16, 6000],
    ] as const) {
      const { m, step, publish } = host(n, 'bertahan');
      for (const r of m.roster) m.input(r.id, r.id % 2 ? 'up' : 'left');
      step(2 / 60);
      const run = JSON.stringify(publish({ kind: 'banner', text: '10 DETIK LAGI', tone: 'red' }));
      expect(run.length).toBeLessThan(limit);
      // Everyone idles: the camera takes them all and the ronde ends.
      for (let i = 0; i < 2400 && m.phase !== 'roundEnd'; i++) step(1 / 60);
      expect(m.phase).toBe('roundEnd');
      const rows = m.standings().map(({ r, rank }) => ({
        id: r.id,
        name: r.name,
        look: lookOf(r.id).look,
        color: lookOf(r.id).color,
        dist: Math.max(0, r.best - 1),
        near: r.near,
        gained: r.gained,
        total: r.score,
        rank,
      }));
      const end = JSON.stringify(
        publish({ kind: 'roundEnd', round: 1, rows, next: 'Ronde berikutnya dalam 8', record: null }),
      );
      expect(end.length).toBeLessThan(limit);
      expect(applyMirror(JSON.parse(end))).not.toBeNull();
    }
  });
});

describe('Nyebrang mirror traffic', () => {
  it('puts every vehicle, log and train where the Host has it at the same server time', () => {
    for (const map of ['kota', 'sungai', 'rel', 'malam'] as const) {
      const { m, clock, step, publish } = host(2, 'balapan', map);
      step(1.3);
      const s = applyMirror(wire(publish()))!;
      const world = worldOf(s);
      expect(world.seed).toBe(m.worldSeed);
      // The Host keeps playing; the mirror reads its last packet at later server times.
      for (const ahead of [0, 0.25, 0.9, 1.6]) {
        if (ahead > 0) step(ahead - (m.t - s.mt));
        const mt = matchTimeAt(s, clock.server);
        expect(Math.abs(mt - m.t)).toBeLessThan(0.002);
        sameTraffic(m.world, m.t, world, mt, Math.floor(m.cam));
      }
    }
  });

  it('stands still while the Host is paused and goes on after', () => {
    const { m, clock, step, publish } = host(1, 'balapan', 'rel');
    step(0.5);
    const held = applyMirror(wire(publish({ kind: 'none' }, true)))!;
    // Paused: no Host frames, but server time goes on.
    clock.server += 1500;
    const frozen = matchTimeAt(held, clock.server);
    expect(Math.abs(frozen - m.t)).toBeLessThan(0.001);
    sameTraffic(m.world, m.t, worldOf(held), frozen, 0);
    expect(camAt(held, frozen + 1)).toBe(held.cam);
    // Resumed: a fresh anchor, then play on.
    const resumed = applyMirror(wire(publish()))!;
    step(0.7);
    const mt = matchTimeAt(resumed, clock.server);
    expect(Math.abs(mt - m.t)).toBeLessThan(0.002);
    sameTraffic(m.world, m.t, worldOf(resumed), mt, 0);
  });

  it('draws at the eased match time: exact on steady packets, smooth on jittery ones', () => {
    const { m, clock, step, publish } = host(1);
    const mc = new MatchClock();
    const base = applyMirror(wire(publish()))!;
    mc.push(base);
    expect(Math.abs(mc.at(clock.server) - m.t)).toBeLessThan(0.002);
    for (let i = 0; i < 20; i++) {
      step(4 / 60);
      const s = applyMirror(wire(publish()))!;
      // Frame jitter of a few ms on each anchor.
      const jittered = { ...s, t: s.t + (i % 2 ? 6 : -6) };
      const before = mc.at(clock.server);
      mc.push(jittered);
      const after = mc.at(clock.server);
      expect(Math.abs(after - before)).toBeLessThan(0.0021);
      expect(Math.abs(after - m.t)).toBeLessThan(0.008);
    }
    // Paused: exact and still; resumed: snaps to the new anchor.
    const held = applyMirror(wire(publish({ kind: 'none' }, true)))!;
    mc.push(held);
    clock.server += 4000;
    expect(mc.at(clock.server)).toBe(held.mt);
    const resumed = applyMirror(wire(publish()))!;
    mc.push(resumed);
    step(0.5);
    expect(Math.abs(mc.at(clock.server) - m.t)).toBeLessThan(0.002);
    // A dead link stops the traffic like `matchTimeAt`.
    expect(mc.at(clock.server + 60_000)).toBeCloseTo(resumed.mt + CLOCK_AHEAD_MAX_MS / 1000, 6);
  });

  it('stops a dead link instead of running away', () => {
    const { clock, publish } = host(1);
    const s = applyMirror(wire(publish()))!;
    expect(matchTimeAt(s, clock.server + 60_000)).toBeCloseTo(s.mt + CLOCK_AHEAD_MAX_MS / 1000, 6);
  });

  it('extrapolates the camera like the Host', () => {
    const { m, clock, step, publish } = host(1);
    // Before the grace ends the camera waits, then it moves at the base speed.
    step(TUNING.graceS - 0.8);
    const early = applyMirror(wire(publish()))!;
    step(1.4);
    expect(Math.abs(camAt(early, matchTimeAt(early, clock.server)) - m.cam)).toBeLessThan(0.02);
    const s = applyMirror(wire(publish()))!;
    step(0.3);
    expect(Math.abs(camAt(s, matchTimeAt(s, clock.server)) - m.cam)).toBeLessThan(0.01);
  });

  it('lands a hop in flight on the same log as the Host and drifts with it', () => {
    const { m, step, publish } = host(1, 'balapan', 'sungai');
    const r = m.runner(1)!;
    // High up: the camera follows the leader there and never reaches the runner.
    let row = 20;
    const ok = (k: number) => {
      const lane = m.world.lane(k);
      return lane.kind === 'river' && lane.speed !== 0 && isLand(m.world.lane(k - 1).kind);
    };
    while (!ok(row)) row++;
    const lane = m.world.lane(row);
    const below = m.world.lane(row - 1);
    const col =
      [3, 4, 5, 6, 7].find((c) => isOpen(below, c)) ?? [...Array(COLS).keys()].find((c) => isOpen(below, c))!;
    r.row = row - 1;
    r.x = col;
    // Wait for a log that is under the landing cell, with room on both sides for a while.
    const good = (t: number) => {
      const p = platformAt(lane, t + TUNING.hop, col);
      return p !== null && col > p.left + 0.3 && col < p.left + p.len - 0.3;
    };
    let guard = 0;
    while (!good(m.t) && guard++ < 1200) step(1 / 60);
    expect(good(m.t)).toBe(true);
    m.input(1, 'up');
    step(2 / 60);
    expect(r.hop).not.toBeNull();
    const s = applyMirror(wire(publish()))!;
    const world = worldOf(s);
    step(0.3);
    expect(r.state).toBe('run');
    expect(r.riding).toBe(true);
    const rest = restPose(world, s.rs[0]!, s.mt, m.t);
    expect(rest.row).toBe(r.row);
    expect(Math.abs(rest.x - r.x)).toBeLessThan(0.01);
    // And a packet taken while riding carries it along too.
    const later = applyMirror(wire(publish()))!;
    step(0.2);
    if (r.state === 'run')
      expect(Math.abs(restPose(world, later.rs[0]!, later.mt, m.t).x - r.x)).toBeLessThan(0.01);
  });
});

describe('Nyebrang mirror replay', () => {
  it('turns counters into hops, deaths, comebacks, near misses, finishes and horns', () => {
    const { m, step, publish } = host(2);
    const reader = new MarkReader();
    expect(reader.read(applyMirror(wire(publish()))!)).toEqual([]);
    m.input(1, 'left');
    step(1 / 60);
    const hop = reader.read(applyMirror(wire(publish()))!);
    expect(hop).toEqual([{ type: 'hop', id: 1, dir: 'left' }]);
    const base = wire(publish()) as NyebrangMirror;
    reader.read(applyMirror(base)!);
    const next = JSON.parse(JSON.stringify(base)) as NyebrangMirror;
    const r = next.rs.find((w) => w[0] === 2)!;
    r[18] += 1;
    r[5] = 1;
    r[10] = 2;
    r[12] = 4.5;
    r[13] = 7;
    r[19] += 1;
    r[15] = 1;
    next.hn = [1, 6];
    expect(reader.read(applyMirror(next)!)).toEqual([
      { type: 'death', id: 2, kind: 'water', x: 4.5, row: 7 },
      { type: 'near', id: 2 },
      { type: 'finish', id: 2, place: 1 },
      { type: 'horn', row: 6 },
    ]);
    const back = JSON.parse(JSON.stringify(next)) as NyebrangMirror;
    back.rs.find((w) => w[0] === 2)![5] = 0;
    expect(reader.read(applyMirror(back)!)).toEqual([{ type: 'respawn', id: 2 }]);
    // A new ronde only sets a baseline.
    const ronde = JSON.parse(JSON.stringify(back)) as NyebrangMirror;
    ronde.r += 1;
    ronde.rs[0]![17] += 5;
    expect(reader.read(applyMirror(ronde)!)).toEqual([]);
  });

  it('reads the countdown and the clock at server time', () => {
    const m = new NyebrangMatch({ rounds: 1, seed: 3, runners: [{ id: 1, name: 'A', cpu: false }] });
    m.pick('balapan');
    m.next();
    m.next();
    // Packets come every quarter second in the countdown: the mirror reads at most 2 s ahead.
    for (let i = 0; i < Math.round((TUNING.introS + 1.5) * 60); i++) m.step(1 / 60);
    expect(m.phase).toBe('count');
    const s = applyMirror(
      wire(
        toMirror({
          server: 50_000,
          match: m,
          overlay: { kind: 'count', value: 3 },
          held: false,
          look: lookOf,
          horns: 0,
          hornRow: -1,
        }),
      ),
    )!;
    const left = s.pl;
    expect(mirrorOverlay(s, 50_000)).toEqual({ kind: 'count', value: Math.ceil(left) });
    expect(left).toBeLessThan(2);
    expect(mirrorOverlay(s, 50_000 + (left - 0.9) * 1000)).toEqual({ kind: 'count', value: 1 });
    expect(mirrorOverlay(s, 50_000 + (left + 0.1) * 1000)).toEqual({ kind: 'go' });
    const held = { ...s, hold: 1 };
    expect(mirrorOverlay(held, 50_000 + 1500)).toEqual({ kind: 'count', value: Math.ceil(left) });
    const hud = mirrorHud(s, 50_000, s.mt, false);
    expect(hud.show).toBe(true);
    expect(hud.clock).toBe('2:00');
    expect(hud.rows[0]?.name).toBe('A');
  });
});
