import { FRUITS, type Look, type PlayerInfo } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { styleFor, TerritoryBrain } from './brain';
import type { Overlay } from './hud';
import { WilayahMatch } from './logic';
import {
  applyMirror,
  BAND_ROWS,
  bandCount,
  type MirrorEvent,
  MirrorFeed,
  MirrorGrid,
  type MirrorSource,
  type MirrorState,
  MirrorTimeline,
  mirrorClocks,
  mirrorHud,
  newEvents,
  PACKET_MAX,
  poseAt,
  type WilayahMirror,
} from './mirror';
import { CLOCK_AHEAD_MAX_MS } from './playout';

const COLORS = ['#F2453D', '#2F8CFF', '#22B35E', '#FFC928', '#FF8A3D', '#FF5C9A', '#14B8A6', '#C4C7CC'];
const OFFSET = 5_000_000;
/** The shell's limit for one packet. */
const SHELL_LIMIT = 7500;
const LOOKS: Look[] = [
  { c: 'leo', s: 3, h: 'nara', hc: 4, oc: 6 },
  { c: 'mia', s: 1, h: 'bima', hc: 2, oc: 3 },
];

function players(n: number): PlayerInfo[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    // Twelve characters: the longest name a player can pick.
    name: `Pemain Ke ${String(i + 1).padStart(2, '0')}`,
    fruit: FRUITS[i % FRUITS.length]!,
    look: LOOKS[i % LOOKS.length]!,
    color: COLORS[i % COLORS.length]!,
    connected: true,
    isHost: i === 0,
  }));
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const NONE: Overlay = { kind: 'none' };

interface Sim {
  m: WilayahMatch;
  feed: MirrorFeed;
  t: number;
}

/** A computer-only match of `n`, as the Host runs it. */
function newSim(n: number, seed = 7): Sim {
  const m = new WilayahMatch({ players: players(n), minutes: 3, now: 0, rnd: rng(seed) });
  const r = rng(seed * 13);
  for (const p of m.all()) m.setPilot(p.id, new TerritoryBrain(styleFor(0.6), r));
  return { m, feed: new MirrorFeed(42), t: 0 };
}

function source(sim: Sim, extra: Partial<MirrorSource> = {}): MirrorSource {
  return {
    match: sim.m,
    t: sim.t,
    server: sim.t + OFFSET,
    overlay: NONE,
    hint: false,
    away: new Set(),
    held: false,
    ...extra,
  };
}

/** Advance the match `ms`, publishing every 70 ms; `each` gets every packet. */
function run(sim: Sim, ms: number, each: (p: WilayahMirror) => void): void {
  const end = sim.t + ms;
  let nextPublish = sim.t;
  while (sim.t < end) {
    sim.t += 1000 / 60;
    sim.m.advance(sim.t);
    for (const e of sim.m.drainEvents()) {
      if (e.type === 'capture' || e.type === 'out' || (e.type === 'spawn' && !e.first)) sim.feed.note(e);
    }
    if (sim.t >= nextPublish) {
      nextPublish = sim.t + 70;
      each(sim.feed.pack(source(sim)));
    }
  }
}

function wire(p: WilayahMirror): MirrorState {
  const json = JSON.stringify(p);
  expect(json.length).toBeLessThanOrEqual(PACKET_MAX);
  const s = applyMirror(JSON.parse(json));
  if (!s) throw new Error('rejected');
  return s;
}

const sameFloor = (g: MirrorGrid, m: WilayahMatch): boolean =>
  g.owner.length === m.field.size && g.owner.every((v, i) => v === m.field.owner[i]);

/** How many cells differ. */
const diffCount = (g: MirrorGrid, m: WilayahMatch): number => {
  let n = 0;
  for (let i = 0; i < m.field.size; i++) if (g.owner[i] !== m.field.owner[i]) n++;
  return n;
};

describe('wilayah mirror', () => {
  it('round-trips heads, trails, standings and the HUD', () => {
    const sim = newSim(4);
    run(sim, 3000 + 6000, () => {});
    const m = sim.m;
    const p = sim.feed.pack(
      source(sim, {
        overlay: { kind: 'warning' },
        hint: true,
        away: new Set([2]),
      }),
    );
    const s = wire(p);
    expect(s.epoch).toBe(42);
    expect(s.t).toBe(Math.round(sim.t + OFFSET));
    expect([s.cols, s.rows, s.unit]).toEqual([m.field.cols, m.field.rows, m.geo.unit]);
    expect(s.phase).toBe('play');
    expect(s.overlay).toEqual({ kind: 'warning' });
    expect(s.hint).toBe(true);
    const standings = m.standings();
    expect(s.runners.map((r) => r.id)).toEqual(standings.map((x) => x.runner.id));
    for (const [k, st] of standings.entries()) {
      const r = st.runner;
      const back = s.runners[k]!;
      expect(back.name).toBe(r.name);
      expect(back.look).toEqual(r.look);
      expect(back.color).toBe(r.color);
      expect(back.v).toBe(r.v);
      expect(back.cells).toBe(st.cells);
      expect(back.rank).toBe(st.rank);
      expect(back.alive).toBe(r.alive);
      expect(back.away).toBe(r.id === 2);
      expect(Math.abs(back.x - r.x)).toBeLessThanOrEqual(1 / 16);
      expect(Math.abs(back.y - r.y)).toBeLessThanOrEqual(1 / 16);
      expect(Math.abs(back.angle - r.angle)).toBeLessThanOrEqual(0.005);
      if (!r.alive) continue;
      expect(back.trail.len).toBe(r.trail.len);
      for (let i = 0; i < r.trail.len; i++) {
        expect(Math.abs(back.trail.xs[i]! - r.trail.xs[i]!)).toBeLessThanOrEqual(1 / 16);
        expect(Math.abs(back.trail.ys[i]! - r.trail.ys[i]!)).toBeLessThanOrEqual(1 / 16);
      }
    }
    const hud = mirrorHud(s, mirrorClocks(s, s.t));
    expect(hud.rows.map((r) => r.id)).toEqual(standings.map((x) => x.runner.id));
    expect(hud.rows[0]!.share).toBe(1);
    expect(hud.overlay).toEqual({ kind: 'warning' });
    expect(hud.timer).toMatch(/^\d:\d\d$/);
  });

  it('carries the time-up overlay with its winners', () => {
    const sim = newSim(2);
    run(sim, 4000, () => {});
    const winner = sim.m.all()[0]!;
    const s = wire(
      sim.feed.pack(
        source(sim, {
          overlay: {
            kind: 'timeUp',
            title: 'Pemain Ke 01 menguasai lantai!',
            sub: '12% lantai dikuasai',
            winners: [{ id: winner.id, look: winner.look, color: winner.color }],
          },
        }),
      ),
    );
    const hud = mirrorHud(s, { left: 0, overlay: null });
    expect(hud.overlay).toEqual({
      kind: 'timeUp',
      title: 'Pemain Ke 01 menguasai lantai!',
      sub: '12% lantai dikuasai',
      winners: [{ id: winner.id, look: winner.look, color: winner.color }],
    });
    expect(hud.timer).toBe('0:00');
  });

  it('rejects malformed packets', () => {
    const sim = newSim(3);
    run(sim, 5000, () => {});
    const good = JSON.parse(JSON.stringify(sim.feed.pack(source(sim)))) as Record<string, unknown>;
    expect(applyMirror(good)).not.toBeNull();
    const bad = (patch: Record<string, unknown>) => ({ ...good, ...patch });
    const pl = good.pl as unknown[][];
    const row = (k: number, v: unknown) => [pl[0]!.map((x, i) => (i === k ? v : x)), ...pl.slice(1)];
    for (const v of [
      null,
      42,
      'x',
      [],
      bad({ v: 2 }),
      bad({ ph: 'pull' }),
      bad({ c: 4 }),
      bad({ rw: 10_000 }),
      bad({ left: -1 }),
      bad({ hold: 'no' }),
      bad({ ov: ['z'] }),
      bad({ ov: ['u', 'a', 'b', ['x']] }),
      bad({ tr: [] }),
      bad({ tr: (good.tr as string[]).map(() => '!!') }),
      bad({ pl: row(1, 0) }),
      bad({ pl: row(1, 99) }),
      bad({ pl: row(3, { c: 'nobody' }) }),
      bad({ pl: row(4, 'red') }),
      bad({ pl: row(5, 1e7) }),
      bad({ pl: row(8, 99) }),
      bad({ d: [[1, 'A']] }),
      bad({ d: [[good.n as number, 'zzzzzzzz']] }),
      bad({ d: [[(good.n as number) + 1, 'AAB']] }),
      bad({ b: [[0, 'AB']] }),
      bad({ b: [[999, '']] }),
      bad({ ev: [[1, 'c', 1, 20_000, 0, 0]] }),
      bad({ en: -1 }),
      bad({ ev: [[(good.en as number) + 1, 's', 1, 0, 0]] }),
      bad({ ev: [[1, 'o', 1, -1, 'boom', 0, 0]] }),
      bad({ ev: [[1, 's', 1, -5, 0]] }),
    ]) {
      expect(applyMirror(v)).toBeNull();
    }
  });

  it('rebuilds the floor exactly from deltas and bands, and stays under the size limit late in a full game', () => {
    const sim = newSim(8, 11);
    const grid = new MirrorGrid();
    let biggest = 0;
    let packets = 0;
    let firstExact = -1;
    run(sim, 3000 + 150_000, (p) => {
      biggest = Math.max(biggest, JSON.stringify(p).length);
      grid.apply(wire(p));
      packets++;
      if (firstExact < 0 && sameFloor(grid, sim.m)) firstExact = packets;
      if (firstExact > 0) expect(diffCount(grid, sim.m)).toBe(0);
    });
    expect(sim.m.phase).toBe('play');
    expect(firstExact).toBe(1);
    expect(grid.missed).toBe(0);
    expect(biggest).toBeLessThanOrEqual(PACKET_MAX);
    expect(biggest).toBeLessThan(SHELL_LIMIT);
    // A screen connecting late in the game gets the whole floor within a few packets.
    sim.feed.resync();
    const late = new MirrorGrid();
    let needed = 0;
    run(sim, 2000, (p) => {
      late.apply(wire(p));
      if (needed <= 0) needed = sameFloor(late, sim.m) ? -needed + 1 : needed - 1;
    });
    expect(needed).toBeGreaterThan(0);
    expect(needed).toBeLessThanOrEqual(6);
    expect(sameFloor(late, sim.m)).toBe(true);
  }, 60_000);

  it('heals the floor after lost packets', () => {
    const sim = newSim(6, 3);
    run(sim, 3000 + 40_000, () => {});
    const grid = new MirrorGrid();
    let k = 0;
    let lostAt = 0;
    // Steady packets, then a burst of 60 lost ones (far more than the deltas each packet
    // repeats), then every third packet lost for a while.
    run(sim, 16_000, (p) => {
      k++;
      const lose = (k > 20 && k <= 80) || (k > 100 && k % 3 === 0 && k < 150);
      if (lose) {
        lostAt = k;
        return;
      }
      grid.apply(wire(p));
    });
    expect(grid.missed).toBeGreaterThan(0);
    expect(lostAt).toBeGreaterThan(140);
    // About 2 s after the last loss every band has been sent again.
    expect(sameFloor(grid, sim.m)).toBe(true);
  }, 30_000);

  it('applies a lost delta from the next packet, and never lets an old delta undo a band', () => {
    const sim = newSim(4, 5);
    const grid = new MirrorGrid();
    run(sim, 3000 + 20_000, (p) => grid.apply(wire(p)));
    expect(sameFloor(grid, sim.m)).toBe(true);
    const packets: WilayahMirror[] = [];
    let changes = 0;
    run(sim, 4000, (p) => {
      packets.push(p);
      if (p.d.some(([n]) => n === p.n)) changes++;
    });
    expect(changes).toBeGreaterThan(2);
    const lastIndex = packets.length - 1;
    for (const [i, p] of packets.entries()) {
      // Every other packet lost, and no bands in the rest: the repeated deltas alone keep up.
      if (i % 2 === 0 || i === lastIndex) grid.apply({ ...wire(p), bands: [] });
    }
    expect(grid.missed).toBe(0);
    expect(sameFloor(grid, sim.m)).toBe(true);
    const last = wire(packets[packets.length - 1]!);
    const before = grid.have;
    const old = { ...last, deltas: last.deltas.map((d) => ({ ...d, n: d.n - 1000 })), bands: [] };
    grid.apply(old);
    expect(grid.have).toBe(before);
    expect(sameFloor(grid, sim.m)).toBe(true);
  });

  it('starts over for a new match from the Host', () => {
    const sim = newSim(2);
    run(sim, 5000, () => {});
    const grid = new MirrorGrid();
    grid.apply(wire(sim.feed.pack(source(sim))));
    const other = newSim(2, 99);
    other.feed = new MirrorFeed(43);
    run(other, 4000, () => {});
    // The far-away screen connected: the Host sends the whole floor again.
    other.feed.resync();
    const resets: boolean[] = [];
    run(other, 300, (p) => resets.push(grid.apply(wire(p)).reset));
    expect(resets[0]).toBe(true);
    expect(resets.slice(1)).not.toContain(true);
    expect(grid.epoch).toBe(43);
    expect(sameFloor(grid, other.m)).toBe(true);
  });

  it('stays under the size limit with very long trails and a shattered floor', () => {
    const sim = newSim(8, 2);
    run(sim, 3000 + 5000, () => {});
    const m = sim.m;
    const r = rng(5);
    // Every runner far out on a winding trail of 1500 points.
    for (const runner of m.all()) {
      runner.alive = true;
      runner.trail.clear();
      let x = m.field.cols / 2;
      let y = m.field.rows / 2;
      for (let i = 0; i < 1500; i++) {
        x = Math.min(m.field.cols - 1, Math.max(1, x + (r() - 0.5) * 3));
        y = Math.min(m.field.rows - 1, Math.max(1, y + (r() - 0.5) * 3));
        runner.trail.push(x, y);
      }
    }
    // A floor of noise: the worst case for the bands and the deltas.
    for (let i = 0; i < m.field.size; i++) m.field.owner[i] = Math.floor(r() * 9);
    for (let k = 0; k < 5; k++) {
      const p = sim.feed.pack(source(sim));
      const s = wire(p);
      for (const runner of s.runners) expect(runner.trail.len).toBeGreaterThan(1);
    }
  });

  it('cycles every band within about 2 s of steady play', () => {
    const sim = newSim(8, 4);
    run(sim, 3000 + 30_000, () => {});
    const seen = new Set<number>();
    let packets = 0;
    run(sim, 2100, (p) => {
      packets++;
      for (const [b] of p.b) seen.add(b);
    });
    expect(packets).toBeGreaterThanOrEqual(24);
    expect(seen.size).toBe(bandCount(sim.m.field.rows));
    expect(BAND_ROWS * bandCount(sim.m.field.rows)).toBeGreaterThanOrEqual(sim.m.field.rows);
  });

  it('replays effect events once, from the packet that brought them', () => {
    const sim = newSim(8, 6);
    const seenEvents: MirrorEvent[] = [];
    let seen: number | null = null;
    let noted = 0;
    const end = sim.t + 3000 + 40_000;
    let nextPublish = 0;
    let k = 0;
    while (sim.t < end) {
      sim.t += 1000 / 60;
      sim.m.advance(sim.t);
      for (const e of sim.m.drainEvents()) {
        if (e.type === 'out' || (e.type === 'spawn' && !e.first)) {
          sim.feed.note(e);
          noted++;
        }
      }
      if (sim.t < nextPublish) continue;
      nextPublish = sim.t + 70;
      const s = wire(sim.feed.pack(source(sim)));
      // One packet in four is lost.
      if (++k % 4 === 0) continue;
      if (seen === null) {
        seen = s.eventTop;
        continue;
      }
      seenEvents.push(...newEvents(s, seen));
      seen = s.eventTop;
    }
    expect(noted).toBeGreaterThan(4);
    const ns = seenEvents.map((e) => e.n);
    expect(new Set(ns).size).toBe(ns.length);
    expect(ns).toEqual([...ns].sort((a, b) => a - b));
    expect(ns.length).toBe(noted);
  });
});

describe('wilayah mirror timeline', () => {
  const base = (t: number, x: number, angle: number, extra: Partial<MirrorState> = {}): MirrorState => ({
    epoch: 1,
    t,
    cols: 240,
    rows: 135,
    unit: 3,
    phase: 'play',
    left: 100_000 - t,
    goIn: 0,
    urgent: false,
    hint: false,
    hold: false,
    overlay: { kind: 'none' },
    runners: [
      {
        id: 1,
        v: 1,
        name: 'Rina',
        look: LOOKS[0]!,
        color: COLORS[0]!,
        x,
        y: 20,
        angle,
        alive: true,
        shield: false,
        home: false,
        away: false,
        cells: 100,
        rank: 1,
        respawn: null,
        trail: { len: 0, xs: [], ys: [] },
      },
    ],
    seq: 0,
    deltas: [],
    bands: [],
    events: [],
    eventTop: 0,
    ...extra,
  });

  it('glides heads between packets a little in the past', () => {
    const line = new MirrorTimeline();
    const lag = 250;
    expect(line.push(base(1000, 10, 3.1), 1000 + lag)).toBe(true);
    expect(line.push(base(1070, 17, -3.1), 1070 + lag)).toBe(false);
    expect(line.lag).toBe(lag);
    // Trip 250 plus a buffer of 1.5 packet gaps (no jitter yet): 105.
    const span = line.sample(1035 + lag + 105);
    if (!span) throw new Error('no span');
    expect(line.behind).toBeCloseTo(lag + 105, 6);
    expect(span.k).toBeCloseTo(0.5, 5);
    const pose = poseAt(span.a.runners[0]!, span.b.runners[0], span.k, { x: 0, y: 0, angle: 0 });
    expect(pose.x).toBeCloseTo(13.5, 5);
    // The heading turns the short way across PI.
    expect(Math.abs(Math.abs(pose.angle) - Math.PI)).toBeLessThan(0.05);
    // Past the newest packet the head waits on it.
    const after = line.sample(5000);
    expect(after?.a.t).toBe(1070);
    expect(after?.k).toBe(0);
  });

  it('follows a route change mid-game without the heads jumping or running backwards', () => {
    const line = new MirrorTimeline();
    // The head runs 1 cell per 100 ms. A direct link first, then a fall back to the relay.
    const trip = (t: number) => (t < 4000 ? 30 + ((t * 7) % 5) : 260 + ((t * 7) % 60));
    const sent = Array.from({ length: 200 }, (_, i) => i * 70);
    let k = 0;
    let lastX = Number.NEGATIVE_INFINITY;
    let maxStep = 0;
    const pose = { x: 0, y: 0, angle: 0 };
    for (let now = 0; now < 13_000; now += 16) {
      while (k < sent.length && sent[k]! + trip(sent[k]!) <= now) {
        const t = sent[k++]!;
        line.push(base(t, 10 + t / 100, 0), t + trip(t));
      }
      const span = line.sample(now);
      if (!span) continue;
      const x = poseAt(span.a.runners[0]!, span.b.runners[0], span.k, pose).x;
      if (lastX > Number.NEGATIVE_INFINITY) {
        expect(x).toBeGreaterThanOrEqual(lastX - 1e-9);
        maxStep = Math.max(maxStep, x - lastX);
      }
      lastX = x;
    }
    // Never faster than a little over real time: 16 ms = 0.16 cells.
    expect(maxStep).toBeLessThan(0.16 * 1.15);
    expect(line.lag).toBeGreaterThanOrEqual(260);
    expect(line.behind! - line.lag!).toBeLessThan(260);
  });

  it('runs the countdown and the round clock on server time from the newest packet', () => {
    const play = base(10_000, 10, 0, { left: 60_000 });
    expect(mirrorClocks(play, 10_400)).toEqual({ left: 59_600, overlay: null });
    expect(mirrorClocks(play, 99_000).left).toBe(60_000 - CLOCK_AHEAD_MAX_MS);
    expect(mirrorClocks({ ...play, hold: true }, 10_400).left).toBe(60_000);
    const count = base(10_000, 10, 0, {
      phase: 'countdown',
      left: 180_000,
      goIn: 1800,
      overlay: { kind: 'count', value: 2 },
    });
    expect(mirrorClocks(count, 10_000).overlay).toEqual({ kind: 'count', value: 2 });
    expect(mirrorClocks(count, 10_900).overlay).toEqual({ kind: 'count', value: 1 });
    expect(mirrorClocks(count, 11_850)).toEqual({ left: 179_950, overlay: { kind: 'go' } });
    expect(mirrorHud(count, mirrorClocks(count, 11_850)).overlay).toEqual({ kind: 'go' });
    // Paused Host: the packet's own countdown.
    expect(mirrorClocks({ ...count, hold: true }, 11_850).overlay).toBeNull();
  });

  it('carries the time to go from the Host and validates it', () => {
    const sim = newSim(2);
    sim.t = 1000;
    sim.m.advance(sim.t);
    const raw = sim.feed.pack(source(sim));
    expect(raw.go).toBe(sim.m.goAt - 1000);
    const s = wire(raw);
    expect(mirrorClocks(s, s.t).overlay).toEqual({ kind: 'count', value: sim.m.countValue });
    expect(applyMirror({ ...raw, go: -1 })).toBeNull();
    expect(applyMirror({ ...raw, go: 1e9 })).toBeNull();
  });

  it('does not glide a respawned head across the floor', () => {
    const a = base(0, 10, 0).runners[0]!;
    const b = { ...a, x: 200 };
    expect(poseAt(a, b, 0.5, { x: 0, y: 0, angle: 0 }).x).toBe(10);
    expect(poseAt(a, { ...b, x: 12 }, 0.5, { x: 0, y: 0, angle: 0 }).x).toBeCloseTo(11, 5);
  });

  it('snaps on a new phase, a pause or a new match', () => {
    const line = new MirrorTimeline();
    line.push(base(1000, 10, 0), 1200);
    expect(line.push(base(1070, 11, 0), 1270)).toBe(false);
    expect(line.push(base(1140, 12, 0, { hold: true }), 1340)).toBe(true);
    expect(line.push(base(1210, 12, 0, { hold: true, phase: 'over' }), 1410)).toBe(true);
    expect(line.push(base(1280, 12, 0, { hold: true, phase: 'over', epoch: 2 }), 1480)).toBe(true);
    // A packet older than the newest one (Host restarted its clock) snaps too.
    expect(line.push(base(100, 12, 0, { hold: true, phase: 'over', epoch: 2 }), 1550)).toBe(true);
  });
});
