import { FRUITS, lookOfFruit } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { STEP } from '../../shared/kotak/sim';
import { TILES } from './arena';
import { RuntuhMatch, TIMING } from './logic';
import {
  advanceTile,
  applyMirror,
  decodeFaces,
  EVENT_KEEP_S,
  EventLog,
  encodeFaces,
  FLAG,
  type HudSnapshot,
  MAX_EVENTS,
  MirrorTimeline,
  PUBLISH_MS,
  pose,
  RENDER_DELAY_MS,
  type RunnerRow,
  type RuntuhMirror,
  TELEPORT_M,
  type TileNow,
  tileGroups,
  tilesOf,
  toMirror,
} from './mirror';

const T0 = 1_700_000_000_000;

const seats = (n: number) =>
  Array.from({ length: n }, (_, i) => {
    const fruit = FRUITS[i % FRUITS.length]!;
    return {
      id: i < 2 ? i + 1 : -(i + 1),
      name: `Pemain Nomor ${i + 1} Panjang`,
      fruit,
      look: lookOfFruit(fruit),
      color: '#2F8CFF',
      cpu: i >= 2,
    };
  });

/** A match in the first round (Kotak acak) a few seconds into play: tiles are crumbling. */
function playing(n: number, seconds = 3): RuntuhMatch {
  const m = new RuntuhMatch({ players: seats(n), seed: 7 });
  for (const p of m.players) m.steer(p.id, 0.6, -0.3);
  for (let i = 0; i < (TIMING.intro + seconds) * 60; i++) m.tick(1 / 60);
  m.drainEvents();
  return m;
}

function hud(m: RuntuhMatch, patch: Partial<HudSnapshot> = {}): HudSnapshot {
  const chip = (id: number) => {
    const p = m.player(id)!;
    return { id, name: p.name, fruit: p.fruit, look: p.look, color: p.color };
  };
  return {
    round: 'Babak 1/7',
    alive: 'Bertahan 3/4',
    rule: {
      title: 'Babak 1: Kotak acak',
      head: '',
      target: 'Hindari petak berkedip',
      tint: null,
      seconds: 12,
      double: false,
    },
    scores: m.players.map((p) => ({ ...chip(p.id), score: 50, out: p.id === 2, offline: p.id === 2 })),
    intro: null,
    end: null,
    final: null,
    help: true,
    ...patch,
  };
}

function snapshot(m: RuntuhMatch, at: number, log = new EventLog(), patch: Partial<HudSnapshot> = {}) {
  return toMirror({ at, paused: false, match: m, hud: hud(m, patch), events: log.recent(m.sim.t) });
}

const wire = (s: RuntuhMirror): unknown => JSON.parse(JSON.stringify(s));

describe('toMirror / applyMirror', () => {
  it('round-trips a running match through JSON', () => {
    const m = playing(4);
    const log = new EventLog();
    log.push({ k: 'fall', id: 1, at: { x: 1.23456, y: -3.0001, z: -2.3333 }, by: -3, next: 1 }, m.sim.t);
    log.push({ k: 'near', id: -3, gap: 0.123456 }, m.sim.t);
    log.push({ k: 'push', id: 2, target: null }, m.sim.t);
    const s = snapshot(m, T0, log);
    expect(s.ph).toBe('play');
    expect(s.rl).toHaveLength(7);
    expect(s.ru).toHaveLength(4);
    expect(s.tg.length).toBeGreaterThan(0);
    expect(s.ev[0]!.e).toEqual({ k: 'fall', id: 1, at: { x: 1.23, y: -3, z: -2.33 }, by: -3, next: 1 });
    expect(s.ev[1]!.e).toEqual({ k: 'near', id: -3, gap: 0.123 });
    expect(applyMirror(wire(s))).toEqual(s);
  });

  it('round-trips the round summary and the final table', () => {
    const m = playing(3);
    const s = snapshot(m, T0, new EventLog(), {
      rule: null,
      end: { title: 'Babak selesai', sub: '2 bertahan', rows: [] },
      final: {
        cols: 7,
        rows: m.players.map((p, i) => ({
          id: p.id,
          name: p.name,
          fruit: p.fruit,
          look: p.look,
          color: p.color,
          rounds: [50, 20, 50, 50, 10, 50, 100],
          total: 330,
          rank: i + 1,
        })),
      },
    });
    expect(s.fi!.r[0]).toEqual([1, [50, 20, 50, 50, 10, 50, 100], 330, 1]);
    expect(applyMirror(wire(s))).toEqual(s);
  });

  it('encodes faces as three digits per tile', () => {
    const m = playing(2);
    const fc = encodeFaces(m.faces);
    expect(fc).toHaveLength(TILES * 3);
    expect(decodeFaces(fc)).toEqual(m.faces);
    expect(decodeFaces(fc.slice(3))).toBeNull();
    expect(decodeFaces(`9${fc.slice(1)}`)).toBeNull();
    expect(decodeFaces(`${fc.slice(0, 2)}0${fc.slice(3)}`)).toBeNull();
  });

  it('flags fallen and frozen players', () => {
    const m = new RuntuhMatch({ players: seats(3), seed: 3 });
    const s = snapshot(m, T0);
    // Round intro: everyone waits frozen on a start tile.
    expect(s.ru.every((r) => (r[5] & FLAG.frozen) !== 0)).toBe(true);
    m.sim.body(1)!.active = false;
    const t = snapshot(m, T0 + 75);
    expect(t.ru.find((r) => r[0] === 1)![5] & FLAG.hidden).toBe(FLAG.hidden);
  });

  it('rejects malformed states', () => {
    const good = wire(snapshot(playing(3), T0)) as Record<string, unknown>;
    const bad = (patch: Record<string, unknown>) => applyMirror({ ...good, ...patch });
    expect(applyMirror(good)).not.toBeNull();
    expect(applyMirror(null)).toBeNull();
    expect(applyMirror('x')).toBeNull();
    expect(applyMirror([])).toBeNull();
    expect(bad({ v: 2 })).toBeNull();
    expect(bad({ ph: 'lava' })).toBeNull();
    expect(bad({ st: -1 })).toBeNull();
    expect(bad({ at: 'kemarin' })).toBeNull();
    expect(bad({ rl: [] })).toBeNull();
    expect(bad({ rl: ['acak', 'terbang'] })).toBeNull();
    expect(bad({ ro: 7 })).toBeNull();
    expect(bad({ dk: 1 })).toBeNull();
    expect(bad({ gl: [35] })).toBeNull();
    expect(bad({ gl: [-1] })).toBeNull();
    expect(bad({ fc: 'abc' })).toBeNull();
    expect(bad({ tg: [[3, 1, 2, 2, [0]]] })).toBeNull();
    expect(bad({ tg: [[1, 1, 2, 2, [35]]] })).toBeNull();
    expect(bad({ tg: [[1, 1, 2, 2, []]] })).toBeNull();
    expect(bad({ tg: [[1, 1, -5, 2, [0]]] })).toBeNull();
    expect(bad({ tg: [[1, 'x', 2, 2, [0]]] })).toBeNull();
    expect(bad({ ru: [[1, 0, 0, 0, 0, 8]] })).toBeNull();
    expect(bad({ ru: [[0, 0, 0, 0, 0, 0]] })).toBeNull();
    expect(bad({ ru: [[1, 'a', 0, 0, 0, 0]] })).toBeNull();
    expect(bad({ ru: [[1, 1e6, 0, 0, 0, 0]] })).toBeNull();
    expect(bad({ ru: Array.from({ length: 9 }, (_, i) => [i + 1, 0, 0, 0, 0, 0]) })).toBeNull();
    expect(bad({ pl: [{ id: 1, n: 'A', f: 'durian-x', l: { c: 'x' }, c: '#fff' }] })).toBeNull();
    expect(bad({ hr: 'x'.repeat(500) })).toBeNull();
    expect(bad({ rc: { title: 'a', head: '', target: 'b', tint: 5, seconds: 3, double: false } })).toBeNull();
    expect(
      bad({ rc: { title: 'a', head: '', target: 'b', tint: null, seconds: 1.5, double: false } }),
    ).toBeNull();
    expect(bad({ ic: { of: 'a', name: 'b', desc: 'c', double: 'ya' } })).toBeNull();
    expect(bad({ sc: [[1, 50, 2, 0]] })).toBeNull();
    expect(bad({ en: { t: 'a', s: 'b', r: [[1, 50]] } })).toBeNull();
    expect(bad({ fi: { c: 8, r: [] } })).toBeNull();
    expect(bad({ fi: { c: 7, r: [[1, [1, 2, 3, 4, 5, 6, 7, 8], 10, 1]] } })).toBeNull();
    expect(bad({ ev: [{ n: 1, t: 0, e: { k: 'teleport' } }] })).toBeNull();
    expect(
      bad({ ev: [{ n: 1, t: 0, e: { k: 'fall', id: 1, at: { x: 0, y: 0 }, by: null, next: null } }] }),
    ).toBeNull();
    expect(bad({ ev: [{ n: 1, t: 0, e: { k: 'near', id: 1, gap: -1 } }] })).toBeNull();
    expect(bad({ pz: 'no' })).toBeNull();
    expect(bad({ hp: null })).toBeNull();
  });

  it('stays well under one packet with 8 players at the busiest moment', () => {
    const m = playing(8);
    // Every tile on its own schedule: the most tile groups a state can carry.
    m.sim.solids.forEach((s, i) => {
      s.state = i % 2 === 0 ? 'warn' : 'gone';
      s.since = 100 + i * 0.0137;
      s.until = 101.234 + i * 0.0113;
      s.goneFor = i % 3 === 0 ? Infinity : 2.6;
    });
    m.sim.t = 100.9;
    const log = new EventLog();
    for (let i = 0; i < MAX_EVENTS + 4; i++) {
      const id = m.players[i % 8]!.id;
      log.push(
        { k: 'fall', id, at: { x: -12.345, y: -3.0123, z: 7.891 }, by: m.players[0]!.id, next: 3 },
        100,
      );
    }
    const rows = m.players.map((p, i) => ({
      id: p.id,
      name: p.name,
      fruit: p.fruit,
      look: p.look,
      color: p.color,
      rounds: [100, 100, 100, 100, 100, 100, 200],
      total: 800,
      rank: i + 1,
    }));
    const s = snapshot(m, T0, log, {
      intro: {
        of: 'Babak 7/7',
        name: 'Gelap',
        desc: 'Lampu padam. Petak aman menyala sebentar: ingat dan lari!',
        double: true,
      },
      end: {
        title: 'Babak selesai',
        sub: '8 bertahan',
        rows: rows.map((r) => ({ ...r, points: 100, survived: true })),
      },
      final: { cols: 7, rows },
    });
    expect(s.pl).toHaveLength(8);
    expect(s.ev).toHaveLength(MAX_EVENTS);
    expect(s.tg).toHaveLength(TILES);
    const bytes = new TextEncoder().encode(JSON.stringify(s)).length;
    expect(bytes).toBeLessThan(6000);
    expect(applyMirror(wire(s))).toEqual(s);
  });

  it('sends a calm stage with almost no tile data', () => {
    const m = new RuntuhMatch({ players: seats(8), seed: 5 });
    const s = snapshot(m, T0);
    expect(s.tg).toEqual([]);
    expect(new TextEncoder().encode(JSON.stringify(s)).length).toBeLessThan(3000);
  });
});

describe('EventLog', () => {
  it('numbers events and forgets old ones', () => {
    const log = new EventLog();
    log.push({ k: 'go' }, 1);
    log.push({ k: 'drop' }, 3);
    log.push({ k: 'win' }, 1 + EVENT_KEEP_S + 1.5);
    expect(log.recent(1 + EVENT_KEEP_S + 1.5).map((e) => e.n)).toEqual([2, 3]);
    for (let i = 0; i < 20; i++) log.push({ k: 'reveal' }, 10);
    expect(log.recent(10)).toHaveLength(MAX_EVENTS);
    expect(log.recent(10).at(-1)!.n).toBe(23);
  });
});

/* ------------------------------------------------------------------ tiles */

describe('tile schedules', () => {
  it('groups tiles with the same timing and skips plain solid ones', () => {
    const solid = { state: 'solid' as const, since: 0, until: Infinity, goneFor: 0 };
    const warn = { state: 'warn' as const, since: 5, until: 5.45, goneFor: Infinity };
    const list = Array.from({ length: TILES }, (_, i) => (i < 30 ? warn : solid));
    list[34] = { state: 'solid', since: 9, until: Infinity, goneFor: 0 };
    const groups = tileGroups(list, 10);
    expect(groups).toEqual([
      [1, 5, 5.45, -1, Array.from({ length: 30 }, (_, i) => i)],
      [0, 9, -1, -1, [34]],
    ]);
    // A restore older than the rise window is plain solid again.
    expect(tileGroups(list, 20)).toHaveLength(1);
    const back = tilesOf(groups);
    expect(back[0]).toEqual(warn);
    expect(back[31]!.state).toBe('solid');
    expect(back[34]!.since).toBe(9);
  });

  it('carries a schedule forward like the sim: warn, gone, solid', () => {
    const s: TileNow = { state: 'warn', since: 2, until: 3, goneFor: 2.6 };
    expect(advanceTile(s, 2.5)).toEqual(s);
    expect(advanceTile(s, 3.1)).toEqual({ state: 'gone', since: 3, until: 5.6, goneFor: 2.6 });
    expect(advanceTile(s, 6)).toEqual({ state: 'solid', since: 5.6, until: Infinity, goneFor: 0 });
    const forever: TileNow = { state: 'warn', since: 2, until: 3, goneFor: Infinity };
    expect(advanceTile(forever, 99).state).toBe('gone');
  });

  /** The Host's states every 5 steps (about `PUBLISH_MS`) through a busy stretch of Kotak acak. */
  function publishRun(): RuntuhMirror[] {
    const m = playing(4, 0);
    const out: RuntuhMirror[] = [];
    const every = Math.round(PUBLISH_MS / 1000 / STEP);
    for (let i = 1; i <= 6 * 60; i++) {
      m.tick(STEP);
      m.drainEvents();
      // Server time runs in step with sim time, so states sit exactly on the sim clock.
      if (i % every === 0) out.push(snapshot(m, T0 + i * 20));
    }
    return out;
  }

  /** The screen's tiles drawn at the moment the Host published `s` (from what it received). */
  function drawnAt(received: RuntuhMirror[], s: RuntuhMirror): TileNow[] {
    const tl = new MirrorTimeline();
    for (const r of received) if (r.at <= s.at + 300) tl.push(r, r.at);
    return tl.sample(s.at + RENDER_DELAY_MS)!.tiles;
  }

  const truth = (s: RuntuhMirror): TileNow[] => tilesOf(s.tg).map((x) => advanceTile(x, s.st));

  it('shows every tile as the Host had it, even for a lost state', () => {
    const states = publishRun();
    // A state where some tile started cracking since the one before.
    const k = states.findIndex((s, i) => i > 0 && s.tg.some((g) => g[0] === 1 && g[1] > states[i - 1]!.st));
    expect(k).toBeGreaterThan(0);
    const lost = states[k]!;
    const received = states.filter((_, i) => i !== k);
    expect(drawnAt(received, lost)).toEqual(truth(lost));
    // And around it, every state on screen matches the Host.
    for (const s of states.slice(Math.max(1, k - 5), k + 5)) {
      if (s === lost) continue;
      expect(drawnAt(received, s)).toEqual(truth(s));
    }
  });

  it('cracks a tile at its sim time and drops it when the warning ends', () => {
    const states = publishRun();
    const k = states.findIndex((s, i) => i > 0 && s.tg.some((g) => g[0] === 1 && g[1] > states[i - 1]!.st));
    const group = states[k]!.tg.find((g) => g[0] === 1 && g[1] > states[k - 1]!.st)!;
    const [, since, until] = group;
    const tile = group[4][0]!;
    // State k is lost: only k-1 and k+1 arrive, yet the crack shows at its exact sim time.
    const a = states[k - 1]!;
    const b = states[k + 1]!;
    const atSim = (t: number) => a.at + ((t - a.st) / (b.st - a.st)) * (b.at - a.at);
    const before = pose(null, a, b, atSim(since - STEP / 2)).tiles[tile]!;
    const after = pose(null, a, b, atSim(since + STEP / 2)).tiles[tile]!;
    expect(before.state).toBe('solid');
    expect(after).toMatchObject({ state: 'warn', since, until });
    // Once its warning has run out the tile drops, even before the Host's next state says so.
    const held = states.filter((s) => s.st < until).at(-1)!;
    expect(pose(null, held, null, held.at + 5000).tiles[tile]!.state).toBe('warn');
    expect(advanceTile(after, until + 0.01)).toMatchObject({ state: 'gone', since: until });
  });
});

/* ------------------------------------------------------------------ interpolation */

function state(at: number, st: number, ru: RunnerRow[], patch: Partial<RuntuhMirror> = {}): RuntuhMirror {
  return {
    v: 1,
    at,
    st,
    pz: false,
    rl: ['acak', 'gelap'],
    ro: 0,
    ph: 'play',
    dk: false,
    gl: [],
    fc: '001'.repeat(TILES),
    tg: [],
    pl: [],
    ru,
    hr: '',
    ha: '',
    rc: null,
    sc: [],
    ic: null,
    en: null,
    fi: null,
    hp: false,
    ev: [],
    ...patch,
  };
}

describe('pose', () => {
  it('blends position and facing halfway, with the running speed', () => {
    const a = state(1000, 10, [[1, 0, 0, 0, 0, 0]]);
    const b = state(1100, 10.1, [[1, 1, 0, -0.5, 1, FLAG.stunned]]);
    const p = pose(null, a, b, 1050);
    expect(p.simT).toBeCloseTo(10.05);
    const r = p.runners[0]!;
    expect(r.x).toBeCloseTo(0.5);
    expect(r.z).toBeCloseTo(-0.25);
    expect(r.yaw).toBeCloseTo(0.5);
    expect(r.vx).toBeCloseTo(10);
    expect(r.flags).toBe(0);
  });

  it('turns the short way round', () => {
    const a = state(0, 0, [[1, 0, 0, 0, 3, 0]]);
    const b = state(100, 0.1, [[1, 0, 0, 0, -3, 0]]);
    expect(Math.abs(pose(null, a, b, 50).runners[0]!.yaw)).toBeGreaterThan(3);
  });

  it('snaps a player who was put on a new start tile', () => {
    const a = state(0, 0, [[1, 0, 0, 0, 0, FLAG.hidden]]);
    const b = state(100, 0.1, [[1, TELEPORT_M + 2, 0, 0, 0, FLAG.frozen]]);
    expect(pose(null, a, b, 40).runners[0]).toMatchObject({ x: 0, flags: FLAG.hidden });
    expect(pose(null, a, b, 60).runners[0]).toMatchObject({ x: TELEPORT_M + 2, vx: 0, flags: FLAG.frozen });
  });

  it('holds the newest state when nothing newer came (paused Host)', () => {
    const prev = state(0, 0, [[1, 0, 0, 0, 0, 0]]);
    const a = state(100, 0.1, [[1, 1, 0, 0, 0, 0]], { pz: true });
    const p = pose(prev, a, null, 5000);
    expect(p.simT).toBe(0.1);
    expect(p.runners[0]!.x).toBe(1);
    expect(p.runners[0]!.vx).toBeCloseTo(10);
  });
});

describe('MirrorTimeline', () => {
  it('draws behind the newest state by the delivery delay plus the render delay', () => {
    const tl = new MirrorTimeline();
    expect(tl.sample(0)).toBeNull();
    expect(tl.push(state(1000, 1, []), 1300)).toBe(true);
    expect(tl.push(state(1000, 1, []), 1310)).toBe(false);
    expect(tl.push(state(900, 0.9, []), 1320)).toBe(false);
    expect(tl.lagMs).toBe(300);
    expect(tl.drawAt(2000)).toBe(2000 - 300 - RENDER_DELAY_MS);
  });

  it('interpolates between the two states around the draw time', () => {
    const tl = new MirrorTimeline();
    tl.push(state(1000, 1, [[1, 0, 0, 0, 0, 0]]), 1000);
    tl.push(state(1075, 1.075, [[1, 0.75, 0, 0, 0, 0]]), 1075);
    tl.push(state(1150, 1.15, [[1, 1.5, 0, 0, 0, 0]]), 1150);
    const p = tl.sample(1100 + RENDER_DELAY_MS)!;
    expect(p.s.at).toBe(1075);
    expect(p.simT).toBeCloseTo(1.1);
    expect(p.runners[0]!.x).toBeCloseTo(1);
  });
});
