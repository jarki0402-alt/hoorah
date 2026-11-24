import {
  FRUITS,
  INPUT_OP,
  lookOfFruit,
  PAD_UP,
  type PlayerInfo,
  packStick,
  STICK_OP,
} from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { Field } from './field';
import { type Arena, arenaFor, type MatchEvent, parseMinutes, type Runner, WilayahMatch } from './logic';
import { Trail, wrapAngle } from './trail';

const COLORS = ['#F2453D', '#2F8CFF', '#22B35E', '#FFC928', '#FF8A3D', '#FF5C9A', '#14B8A6', '#C4C7CC'];

function players(n: number, from = 1): PlayerInfo[] {
  return Array.from({ length: n }, (_, i) => ({
    id: from + i,
    name: `P${from + i}`,
    fruit: FRUITS[(from + i - 1) % FRUITS.length]!,
    look: lookOfFruit(FRUITS[(from + i - 1) % FRUITS.length]!),
    color: COLORS[(from + i - 1) % COLORS.length]!,
    connected: true,
    isHost: i === 0,
  }));
}

/** Deterministic generator for reproducible spawns. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 8 units/s at 20 ms steps: 0.48 cells per step, at most 0.112 rad of turn per step. */
const SMALL: Arena = { cols: 96, rows: 54, unit: 3, speed: 8, stepMs: 20 };
const WIDE: Arena = { cols: 120, rows: 66, unit: 3, speed: 8, stepMs: 20 };

/** A match already in play (countdown skipped), with events drained. */
function playing(n: number, arena: Arena = SMALL, seed = 7): { m: WilayahMatch; t: number } {
  const m = new WilayahMatch({ players: players(n), minutes: 2, now: 0, rnd: rng(seed), arena });
  const t = m.goAt;
  m.advance(t);
  m.drainEvents();
  return { m, t };
}

/** Put a runner on a fresh round home at a known spot, heading `angle`. */
function park(m: WilayahMatch, r: Runner, x: number, y: number, angle: number, radius = m.geo.home): void {
  m.field.clearOwner(r.v);
  m.field.clearTrail(r.v, r.trail.xs, r.trail.ys, r.trail.len, m.geo.mark);
  r.trail.clear();
  m.field.fillDisc(x, y, radius, r.v);
  r.x = r.px = x;
  r.y = r.py = y;
  r.angle = r.pangle = angle;
  r.target = null;
  r.alive = true;
  r.protectUntil = 0;
}

/**
 * Advance one step at a time for `n` steps (or until `stop` says so); `each` may steer before
 * every step. Returns the time and every event seen.
 */
function run(
  m: WilayahMatch,
  t: number,
  n: number,
  each?: (k: number, now: number) => void,
  stop?: (events: readonly MatchEvent[]) => boolean,
): { t: number; events: MatchEvent[] } {
  let now = t;
  const events: MatchEvent[] = [];
  for (let k = 0; k < n; k++) {
    each?.(k, now);
    now += m.arena.stepMs;
    m.advance(now);
    events.push(...m.drainEvents());
    if (stop?.(events)) break;
  }
  return { t: now, events };
}

function eventsOf<T extends MatchEvent['type']>(
  list: MatchEvent[],
  type: T,
): Extract<MatchEvent, { type: T }>[] {
  return list.filter((e): e is Extract<MatchEvent, { type: T }> => e.type === type);
}

const ownsAt = (m: WilayahMatch, r: Runner, x: number, y: number) => m.field.ownerAt(x, y) === r.v;

describe('trail geometry', () => {
  it('measures distance to the path and skips the stretch behind the head', () => {
    const tr = new Trail(2);
    for (let x = 0; x <= 10; x++) tr.push(x, 0);
    expect(tr.len).toBe(11);
    expect(tr.arcTo(12, 0)).toBeCloseTo(12);
    expect(tr.hits(5, 0.5, 12, 0, 0.6, 0)).toBe(true);
    expect(tr.hits(5, 1, 12, 0, 0.6, 0)).toBe(false);
    // The live segment to the head counts for others...
    expect(tr.hits(11, 0.3, 12, 0, 0.6, 0)).toBe(true);
    // ...but not the last stretch of a runner's own trail.
    expect(tr.hits(11, 0.3, 12, 0, 0.6, 3)).toBe(false);
    expect(tr.hits(2, 0.3, 12, 0, 0.6, 3)).toBe(true);
    expect(Math.abs(wrapAngle(Math.PI * 3))).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI / 2 - Math.PI * 4)).toBeCloseTo(-Math.PI / 2);
  });
});

describe('field capture', () => {
  it('turns a curved path home into land and fills the round area it encloses', () => {
    const f = new Field(60, 40);
    f.fillDisc(15, 20, 6, 1);
    // A circle of radius 10 around (24, 20) that starts and ends inside the home disc.
    const xs: number[] = [];
    const ys: number[] = [];
    for (let k = 0; k <= 64; k++) {
      const a = Math.PI + 0.55 + (k / 64) * (Math.PI * 2 - 1.1);
      xs.push(24 + Math.cos(a) * 10);
      ys.push(20 + Math.sin(a) * 10);
    }
    const cap = f.capture(1, xs, ys, xs.length, xs[xs.length - 1]!, ys[ys.length - 1]!, 1.35);
    expect(f.ownerAt(24, 20)).toBe(1);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      expect(f.ownerAt(24 + Math.cos(a) * 8, 20 + Math.sin(a) * 8)).toBe(1);
      if (Math.cos(a) > -0.3) expect(f.ownerAt(24 + Math.cos(a) * 12.5, 20 + Math.sin(a) * 12.5)).toBe(0);
    }
    expect(cap.dist.every((d, i) => i === 0 || d >= cap.dist[i - 1]!)).toBe(true);
    expect(f.counts[1]).toBeGreaterThan(Math.PI * 10 * 10 * 0.9);
  });

  it('steals enclosed cells from other owners and reports them', () => {
    const f = new Field(30, 30);
    f.fillDisc(15, 15, 9, 1);
    f.fillDisc(15, 15, 4, 2);
    const ring = f.counts[1]!;
    // Owner 1's ring already surrounds owner 2: an empty capture takes the inside.
    const cap = f.enclose(1);
    expect(cap.stolen.get(2)).toBe(cap.cells.length);
    expect(f.counts[2]).toBe(0);
    expect(f.counts[1]).toBe(ring + cap.cells.length);
  });

  it('does not capture land that is open to the field edge', () => {
    const f = new Field(40, 20);
    f.fillDisc(5, 10, 4, 1);
    const xs = [8, 20, 20];
    const ys = [10, 10, 19.5];
    f.capture(1, xs, ys, 3, 20, 19.5, 1.35);
    expect(f.ownerAt(14, 15)).toBe(0);
    expect(f.ownerAt(30, 5)).toBe(0);
  });

  it('keeps counts consistent through fills, captures and clears', () => {
    const f = new Field(32, 18);
    f.fillDisc(8, 9, 5, 1);
    f.fillDisc(20, 9, 5, 2);
    f.capture(1, [10, 26, 26, 10], [3, 3, 15, 15], 4, 10, 15, 1.35);
    f.clearOwner(2);
    const total = Array.from(f.counts).reduce((s, c) => s + c, 0);
    expect(total).toBe(f.size);
    let mine = 0;
    for (let i = 0; i < f.size; i++) if (f.owner[i] === 1) mine++;
    expect(f.counts[1]).toBe(mine);
  });
});

describe('setup', () => {
  it('sizes the floor to the number of players', () => {
    expect(arenaFor(1)).toMatchObject({ cols: 240, rows: 135, unit: 3 });
    expect(arenaFor(2).cols).toBe(240);
    expect(arenaFor(3).cols).toBe(288);
    expect(arenaFor(5).cols).toBe(288);
    expect(arenaFor(6).cols).toBe(336);
    expect(arenaFor(8)).toMatchObject({ cols: 336, rows: 189 });
    for (const n of [2, 5, 8]) {
      const a = arenaFor(n);
      expect(a.cols * 9).toBe(a.rows * 16);
    }
  });

  it('reads the round length from settings', () => {
    expect(parseMinutes(2)).toBe(2);
    expect(parseMinutes('3')).toBe(3);
    expect(parseMinutes(undefined)).toBe(3);
    expect(parseMinutes(99)).toBe(10);
  });

  it('starts everyone on their own round home with no overlaps', () => {
    const m = new WilayahMatch({ players: players(8), minutes: 2, now: 0, rnd: rng(1) });
    const area = m.all().map((r) => m.cells(r));
    // Equal homes: nobody leads before the start.
    expect(new Set(area).size).toBe(1);
    expect(m.standings().every((s) => s.rank === 1)).toBe(true);
    const r = m.geo.home;
    for (const a of area) {
      expect(a).toBeGreaterThan(Math.PI * r * r * 0.9);
      expect(a).toBeLessThan(Math.PI * r * r * 1.1);
    }
    for (const q of m.all()) {
      expect(ownsAt(m, q, q.x, q.y)).toBe(true);
      expect(q.angle).toBeCloseTo(Math.atan2(m.field.rows / 2 - q.y, m.field.cols / 2 - q.x));
    }
  });

  it('counts down 3, 2, 1, then goes', () => {
    const m = new WilayahMatch({ players: players(2), minutes: 2, now: 0, rnd: rng(2), arena: SMALL });
    const seen: number[] = [];
    let go = false;
    for (let t = 0; t <= 3100; t += 50) {
      m.advance(t);
      for (const e of m.drainEvents()) {
        if (e.type === 'count') seen.push(e.value);
        if (e.type === 'go') go = true;
      }
    }
    expect(seen).toEqual([3, 2, 1]);
    expect(go).toBe(true);
    expect(m.phase).toBe('play');
  });
});

describe('free movement', () => {
  it('moves at a constant speed and turns toward the stick at a capped rate', () => {
    const { m, t } = playing(1);
    const r = m.all()[0]!;
    park(m, r, 30, 27, 0);
    m.input(r.id, STICK_OP, packStick(0, -1), t);
    expect(r.target).toBeCloseTo(-Math.PI / 2, 1);
    let prevX = r.x;
    let prevY = r.y;
    run(m, t, 5, () => {
      prevX = r.x;
      prevY = r.y;
    });
    expect(Math.hypot(r.x - prevX, r.y - prevY)).toBeCloseTo(m.geo.stepCells, 5);
    // Five steps of 0.112 rad toward straight up.
    expect(r.angle).toBeCloseTo(-0.56, 5);
    run(m, t + 100, 20);
    expect(r.angle).toBeCloseTo(-Math.PI / 2, 1);
  });

  it('keeps going straight when the stick is released or barely moved', () => {
    const { m, t } = playing(1);
    const r = m.all()[0]!;
    park(m, r, 30, 27, 0.3);
    m.input(r.id, STICK_OP, packStick(0.1, 0.12), t);
    expect(r.target).toBeNull();
    run(m, t, 10);
    expect(r.angle).toBeCloseTo(0.3, 6);
    m.input(r.id, STICK_OP, packStick(-1, 0), t);
    m.input(r.id, STICK_OP, packStick(0, 0), t);
    expect(r.target).toBeNull();
  });

  it('treats a stick that went silent as released, and d-pad arrows as a direction', () => {
    const { m, t } = playing(1);
    const r = m.all()[0]!;
    park(m, r, 30, 27, 0);
    m.input(r.id, STICK_OP, packStick(0, 1), t);
    run(m, t, 10);
    expect(r.target).not.toBeNull();
    run(m, t + 200, Math.ceil(m.tuning.staleMs / m.arena.stepMs) + 2);
    expect(r.target).toBeNull();
    expect(m.input(r.id, INPUT_OP, PAD_UP, t)).toBe(true);
    expect(r.target).toBeCloseTo(-Math.PI / 2);
    expect(m.input(r.id, INPUT_OP, 0, t)).toBe(false);
  });

  it('aims at once during the countdown', () => {
    const m = new WilayahMatch({ players: players(2), minutes: 2, now: 0, rnd: rng(2), arena: SMALL });
    const r = m.all()[0]!;
    m.input(r.id, STICK_OP, packStick(0, 1), 100);
    expect(r.angle).toBeCloseTo(Math.PI / 2, 1);
  });

  it('slides along the field edge and around corners instead of knocking out', () => {
    const { m, t } = playing(1);
    const r = m.all()[0]!;
    park(m, r, SMALL.cols - 6, 20, 0.05);
    let minX = Number.POSITIVE_INFINITY;
    const { events } = run(m, t, 150, () => {
      minX = Math.min(minX, r.x);
    });
    minX = Math.min(minX, r.x);
    expect(r.alive).toBe(true);
    expect(eventsOf(events, 'out')).toHaveLength(0);
    expect(r.x).toBeGreaterThanOrEqual(m.geo.edge);
    expect(r.x).toBeLessThanOrEqual(SMALL.cols - m.geo.edge);
    expect(r.y).toBeGreaterThanOrEqual(m.geo.edge);
    expect(r.y).toBeLessThanOrEqual(SMALL.rows - m.geo.edge);
    // 150 steps of 0.48 cells: down the right edge, then along the bottom toward the left.
    expect(r.y).toBeCloseTo(SMALL.rows - m.geo.edge, 5);
    expect(r.x).toBeLessThan(SMALL.cols - 25);
    expect(minX).toBe(r.x);
    expect(Math.abs(wrapAngle(r.angle - Math.PI))).toBeLessThan(0.01);
  });
});

describe('trails and captures', () => {
  it('captures the round field a curved loop draws', () => {
    const { m, t } = playing(1, WIDE);
    const r = m.all()[0]!;
    park(m, r, 30, 40, 0);
    const before = m.cells(r);
    const now = run(m, t, 22).t; // straight out to x ~ 40.5
    expect(r.trail.len).toBeGreaterThan(0);
    // Then a steady left curve (radius 0.48 / 0.032 = 15 cells) until home again.
    const { events } = run(
      m,
      now,
      400,
      (_k, now) => {
        if (r.trail.len > 0) m.steer(r.id, r.angle - 0.032, now);
      },
      (list) => list.some((e) => e.type === 'capture'),
    );
    const caps = eventsOf(events, 'capture');
    expect(caps).toHaveLength(1);
    expect(eventsOf(events, 'out')).toHaveLength(0);
    expect(r.trail.len).toBe(0);
    // The circle's centre is about (40, 25); inside it everything is ours, outside nothing is.
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      expect(ownsAt(m, r, 40 + Math.cos(a) * 11, 25 + Math.sin(a) * 11)).toBe(true);
      if (Math.sin(a) < 0.2) expect(ownsAt(m, r, 40 + Math.cos(a) * 19, 25 + Math.sin(a) * 19)).toBe(false);
    }
    expect(m.cells(r)).toBeGreaterThan(before + Math.PI * 13 * 13 * 0.8);
    expect(caps[0]!.gained).toBeCloseTo((m.cells(r) - before) / m.field.size, 6);
    expect(caps[0]!.loop).toBeGreaterThan(20);
    expect(r.stats.longestLoop).toBe(Math.round(caps[0]!.loop));
    expect(r.stats.captures).toBe(1);
  });

  it('takes opponents land inside the loop, and knocks out an owner left with nothing', () => {
    for (const keepsSome of [true, false]) {
      const { m, t } = playing(2, WIDE);
      const [a, b] = m.all() as [Runner, Runner];
      park(m, a, 30, 40, 0);
      // B circles tightly inside a land in the middle of A's coming loop.
      park(m, b, 40, 25, 0, 9.5);
      if (keepsSome) m.field.fillDisc(100, 50, 6, b.v);
      const bBefore = m.cells(b);
      const { events } = run(
        m,
        t,
        420,
        (k, now) => {
          if (k >= 22 && a.trail.len > 0) m.steer(a.id, a.angle - 0.032, now);
          if (b.alive) m.steer(b.id, b.angle - 1, now);
        },
        (list) => list.some((e) => e.type === 'capture'),
      );
      const cap = eventsOf(events, 'capture').find((e) => e.id === a.id);
      expect(cap?.victims).toEqual([b.id]);
      expect(ownsAt(m, a, 40, 25)).toBe(true);
      if (keepsSome) {
        expect(b.alive).toBe(true);
        expect(m.cells(b)).toBeLessThan(bBefore);
        expect(m.cells(b)).toBeGreaterThan(0);
      } else {
        const out = eventsOf(events, 'out').find((e) => e.id === b.id);
        expect(out).toMatchObject({ cause: 'wiped', by: a.id });
        expect(a.stats.kills).toBe(1);
      }
    }
  });

  it('knocks out the owner of a trail someone crosses, and credits the cutter', () => {
    const { m, t } = playing(2);
    const [a, b] = m.all() as [Runner, Runner];
    park(m, b, 60, 44, -Math.PI / 2);
    park(m, a, 16, 15, 0);
    const { events } = run(m, t, 95);
    const out = eventsOf(events, 'out');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: b.id, by: a.id, cause: 'cut' });
    expect(out[0]!.trail.length).toBeGreaterThan(4);
    expect(out[0]!.cleared.length).toBeGreaterThan(200);
    expect(m.cells(b)).toBe(0);
    expect(b.alive).toBe(false);
    expect(a.alive).toBe(true);
    expect(a.stats.kills).toBe(1);
    expect(b.stats.outs).toBe(1);
    expect(m.field.trail.some((v) => v === b.v)).toBe(false);
  });

  it('knocks you out when you run into your own trail', () => {
    const { m, t } = playing(1);
    const r = m.all()[0]!;
    park(m, r, 30, 27, 0);
    const now = run(m, t, 42).t; // well clear of home
    const { events } = run(m, now, 120, (_k, now) => {
      if (r.alive) m.steer(r.id, r.angle - 1, now);
    });
    const out = eventsOf(events, 'out');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: r.id, by: null, cause: 'self' });
  });

  it('never knocks you out on a hard turn right behind your head', () => {
    const { m, t } = playing(1);
    const r = m.all()[0]!;
    park(m, r, 30, 27, 0);
    const now = run(m, t, 42).t;
    // A U-turn at the tightest radius, then straight back alongside the trail.
    let k = 0;
    const { events } = run(m, now, 60, (_k, now) => {
      if (k++ < 30) m.steer(r.id, Math.PI, now);
    });
    expect(eventsOf(events, 'out')).toHaveLength(0);
    expect(r.alive).toBe(true);
  });

  it('knocks both out in a head-on crash outside, but you are safe at home', () => {
    {
      const { m, t } = playing(2);
      const [a, b] = m.all() as [Runner, Runner];
      park(m, a, 20, 27, 0);
      park(m, b, 76, 27, Math.PI);
      const out = eventsOf(run(m, t, 70).events, 'out');
      expect(out.map((e) => [e.id, e.cause]).sort()).toEqual([
        [a.id, 'crash'],
        [b.id, 'crash'],
      ]);
    }
    {
      const { m, t } = playing(2);
      const [a, b] = m.all() as [Runner, Runner];
      park(m, a, 22, 27, 0);
      park(m, b, 62, 27, Math.PI, 22);
      const out = eventsOf(run(m, t, 70).events, 'out');
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({ id: a.id, by: b.id, cause: 'crash' });
      expect(b.alive).toBe(true);
    }
  });

  it('respawns after 3 s on a small round home, protected for 2 s', () => {
    const { m, t } = playing(2);
    const [a, b] = m.all() as [Runner, Runner];
    park(m, b, 60, 44, -Math.PI / 2);
    park(m, a, 16, 15, 0);
    let now = t;
    let outAt = -1;
    for (let k = 0; k < 95 && outAt < 0; k++) {
      now = run(m, now, 1).t;
      if (!b.alive) outAt = now;
    }
    expect(outAt).toBeGreaterThan(0);
    expect(b.respawnAt).toBe(outAt + 3000);
    now = run(m, now, Math.floor((b.respawnAt - now) / SMALL.stepMs) - 1).t;
    expect(b.alive).toBe(false);
    const { events } = run(m, now, 3);
    now += 3 * SMALL.stepMs;
    const spawn = eventsOf(events, 'spawn');
    expect(spawn).toHaveLength(1);
    expect(spawn[0]!.first).toBe(false);
    expect(b.alive).toBe(true);
    expect(b.spawnedAt).toBe(outAt + 3000);
    const r = m.geo.home;
    expect(m.cells(b)).toBeGreaterThan(Math.PI * r * r * 0.9);
    expect(m.isProtected(b, now)).toBe(true);
    expect(m.isProtected(b, b.spawnedAt + 2001)).toBe(false);
  });

  it('protects a fresh spawn from being cut', () => {
    const { m, t } = playing(2);
    const [a, b] = m.all() as [Runner, Runner];
    park(m, b, 60, 44, -Math.PI / 2);
    park(m, a, 16, 15, 0);
    b.protectUntil = t + 10_000;
    const { events } = run(m, t, 95);
    expect(eventsOf(events, 'out')).toHaveLength(0);
    expect(b.alive).toBe(true);
  });
});

describe('players, scoring and the clock', () => {
  it('ends after the round time, then reports done', () => {
    const m = new WilayahMatch({ players: players(2), minutes: 1, now: 0, rnd: rng(3), arena: SMALL });
    const types: string[] = [];
    for (let t = 0; t <= m.endAt + m.tuning.overMs + 100; t += 16) {
      m.advance(t);
      for (const e of m.drainEvents()) types.push(e.type);
    }
    expect(types.filter((x) => x === 'warning')).toHaveLength(1);
    expect(types.filter((x) => x === 'second')).toHaveLength(5);
    expect(types.indexOf('timeUp')).toBeLessThan(types.indexOf('done'));
    expect(m.phase).toBe('done');
    expect(m.ticks).toBe(Math.floor(60_000 / m.arena.stepMs));
  });

  it('scores the share of the floor and ranks with shared ties', () => {
    const { m } = playing(3);
    const [a, b, c] = m.all() as [Runner, Runner, Runner];
    for (const r of [a, b, c]) m.field.clearOwner(r.v);
    m.field.fillRect(0, 0, 10, 10, a.v);
    m.field.fillRect(20, 0, 5, 10, b.v);
    m.field.fillRect(40, 0, 5, 10, c.v);
    expect(m.percent(a)).toBeCloseTo((100 * 100) / m.field.size);
    const s = m.standings();
    expect(s.map((x) => [x.runner.id, x.rank])).toEqual([
      [a.id, 1],
      [b.id, 2],
      [c.id, 2],
    ]);
    expect(m.rankOf(c.id)).toBe(2);
  });

  it('gives late joiners a free slot and frees it when they leave', () => {
    const { m, t } = playing(2);
    m.setPlayers([...players(2), ...players(1, 10)], t);
    const late = m.runner(10)!;
    expect(late.alive).toBe(false);
    run(m, t, 1);
    expect(late.alive).toBe(true);
    const home = m.cells(late);
    expect(home).toBeGreaterThan(0);
    m.setPlayers(players(2), t + 200);
    expect(m.runner(10)).toBeUndefined();
    const leave = eventsOf(m.drainEvents(), 'leave');
    expect(leave[0]?.cleared).toHaveLength(home);
  });

  it('follows a player changing colour, fruit or look', () => {
    const { m, t } = playing(2);
    const list = players(2);
    expect(m.runner(2)!.look).toEqual(list[1]!.look);
    list[1] = { ...list[1]!, color: '#14B8A6', fruit: 'durian', look: { c: 'rio', hc: 1 } };
    m.setPlayers(list, t);
    expect(m.runner(2)).toMatchObject({ color: '#14B8A6', fruit: 'durian', look: { c: 'rio', hc: 1 } });
  });

  it('puts people beyond eight into the stands', () => {
    const m = new WilayahMatch({ players: players(9), minutes: 2, now: 0, rnd: rng(9) });
    expect(m.all()).toHaveLength(8);
    expect(m.spectators.has(9)).toBe(true);
  });
});
