import { FRUITS, lookOfFruit } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import type { ScoreCard } from './hud';
import { BomMatch, RULES } from './logic';
import {
  applyMirror,
  type BomMirror,
  EVENT_KEEP_S,
  EventLog,
  FLAG,
  FuseClock,
  MAX_EVENTS,
  type MirrorSource,
  MirrorTimeline,
  pose,
  type RunnerRow,
  TELEPORT_M,
  toMirror,
} from './mirror';
import { BUFFER_MAX_MS, BUFFER_MIN_MS, CLOCK_AHEAD_MAX_MS } from './playout';

const runners = (n: number) =>
  Array.from({ length: n }, (_, i) => {
    const fruit = FRUITS[i % FRUITS.length]!;
    return {
      id: i < 2 ? i + 1 : -(i + 1),
      name: `Pemain Nomor ${i + 1} Panjang`,
      fruit,
      look: lookOfFruit(fruit),
      color: '#2F8CFF',
    };
  });

function playing(n: number): BomMatch {
  const m = new BomMatch({ runners: runners(n), arena: 'pasar', rounds: 5, seed: 7 });
  for (const r of m.runners) m.steer(r.id, 0.7, -0.4);
  for (let i = 0; i < (RULES.intro + RULES.drop + 1.2) * 60; i++) m.tick(1 / 60);
  m.drainEvents();
  return m;
}

function source(m: BomMatch | null, extra: Partial<MirrorSource> = {}): MirrorSource {
  return {
    at: 1_700_000_000_123,
    stage: m ? 'play' : 'pick',
    paused: false,
    arena: 'pasar',
    rounds: 5,
    pick: null,
    match: m,
    offline: (id) => id === 2,
    brand: 'RONDE 1/5',
    banner: { title: 'BOM DI TANGAN PEMAIN NOMOR 1 PANJANG', sub: 'Tekan OPER di dekat orang', tone: 'bomb' },
    intro: null,
    score: null,
    events: [],
    ...extra,
  };
}

/** Every field at its longest: what a busy scoreboard moment with 8 runners sends. */
function busy(m: BomMatch): BomMirror {
  const log = new EventLog();
  const ids = m.runners.map((r) => r.id);
  for (let i = 0; i < MAX_EVENTS + 3; i++) {
    log.push(
      { k: 'boom', id: ids[i % ids.length]!, out: i % 2 === 0, at: { x: -12.345, y: 0.0234, z: 7.891 } },
      m.sim.t,
    );
  }
  const score: ScoreCard = {
    title: 'Ronde 5 selesai',
    line: 'Pemain Nomor 1 Panjang dan Pemain Nomor 2 Panjang kena BUM',
    sub: 'Ronde berikutnya dalam 3',
    rows: m.runners.map((r) => ({ ...r, lives: r.lives, lost: true, out: false })),
  };
  return toMirror(
    source(m, {
      intro: {
        of: 'Ronde 5 dari 5',
        name: 'Ronde Terakhir',
        line: 'Dua bom sekaligus, hati-hati',
        final: true,
        how: false,
      },
      score,
      events: log.recent(m.sim.t),
    }),
  );
}

describe('toMirror / applyMirror', () => {
  it('round-trips a running match through JSON', () => {
    const m = playing(4);
    const log = new EventLog();
    log.push({ k: 'pass', from: 1, to: -3, near: true }, m.sim.t);
    log.push({ k: 'boom', id: 1, out: false, at: { x: 1.23456, y: 0.02, z: -3.3333 } }, m.sim.t);
    const s = toMirror(source(m, { events: log.recent(m.sim.t) }));
    expect(s.ph).toBe('play');
    expect(s.ru).toHaveLength(4);
    expect(s.bo).toHaveLength(1);
    expect(s.ev[1]!.e).toEqual({ k: 'boom', id: 1, out: false, at: { x: 1.23, y: 0.02, z: -3.33 } });
    const back = applyMirror(JSON.parse(JSON.stringify(s)));
    expect(back).toEqual(s);
  });

  it('round-trips the arena picker before a match exists', () => {
    const s = toMirror(
      source(null, {
        rounds: 40,
        pick: { selected: 'atap', options: [], sub: 'Rina memilih di HP', note: '4 pelari · 5 ronde' },
        arena: 'atap',
        banner: null,
      }),
    );
    expect(s.rn).toBe(9);
    expect(s.pk).toEqual({ sub: 'Rina memilih di HP', note: '4 pelari · 5 ronde' });
    expect(applyMirror(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('marks offline runners and keeps negative computer ids', () => {
    const s = toMirror(source(playing(4)));
    const row = s.ru.find((r) => r[0] === 2)!;
    expect(row[6] & FLAG.offline).toBe(FLAG.offline);
    expect(s.ru.some((r) => r[0] < 0)).toBe(true);
  });

  it('never sends the secret fuse length', () => {
    const json = JSON.stringify(toMirror(source(playing(3))));
    expect(json).not.toContain('fuse');
    expect(json).not.toContain('litAt');
  });

  it('rejects malformed states', () => {
    const good = toMirror(source(playing(3)));
    const bad = (patch: Record<string, unknown>) =>
      applyMirror({ ...JSON.parse(JSON.stringify(good)), ...patch });
    expect(applyMirror(null)).toBeNull();
    expect(applyMirror('x')).toBeNull();
    expect(applyMirror([])).toBeNull();
    expect(bad({ v: 2 })).toBeNull();
    expect(bad({ ph: 'lava' })).toBeNull();
    expect(bad({ sg: 'nope' })).toBeNull();
    expect(bad({ ar: 'bulan' })).toBeNull();
    expect(bad({ no: 5 })).toBeNull();
    expect(bad({ rn: 0 })).toBeNull();
    expect(bad({ st: -1 })).toBeNull();
    expect(bad({ br: 'x'.repeat(500) })).toBeNull();
    expect(bad({ ru: [[1, 0, 0, 0, 0, 3, 64]] })).toBeNull();
    expect(bad({ ru: [[0, 0, 0, 0, 0, 3, 0]] })).toBeNull();
    expect(bad({ ru: [[1, 'a', 0, 0, 0, 3, 0]] })).toBeNull();
    expect(bad({ ru: [[1, 1e6, 0, 0, 0, 3, 0]] })).toBeNull();
    expect(bad({ ru: Array.from({ length: 9 }, (_, i) => [i + 1, 0, 0, 0, 0, 3, 0]) })).toBeNull();
    expect(bad({ bo: [[1, 1.5, 0, null]] })).toBeNull();
    expect(bad({ bo: [[1, 0.5, 2, null]] })).toBeNull();
    expect(bad({ bo: [[1, 0.5, 0, [2]]] })).toBeNull();
    expect(
      bad({
        bo: [
          [1, 0.1, 0, null],
          [2, 0.1, 0, null],
          [3, 0.1, 0, null],
        ],
      }),
    ).toBeNull();
    expect(bad({ pl: [{ id: 1, n: 'A', f: 'durian-x', l: { c: 'x' }, c: '#fff' }] })).toBeNull();
    expect(bad({ bn: { title: 'A', sub: 'B', tone: 'violet' } })).toBeNull();
    expect(bad({ ic: { of: 'a', name: 'b', line: 'c', final: 'ya', how: false } })).toBeNull();
    expect(bad({ sc: { t: 'a', l: 'b', s: 'c', r: [[1, 3, 2, 0]] } })).toBeNull();
    expect(bad({ ev: [{ n: 1, t: 0, e: { k: 'teleport' } }] })).toBeNull();
    expect(bad({ ev: [{ n: 1, t: 0, e: { k: 'boom', id: 1, out: false, at: { x: 0, y: 0 } } }] })).toBeNull();
    expect(bad({ pk: { sub: 1, note: '' } })).toBeNull();
    expect(bad({ pz: 'no' })).toBeNull();
  });

  it('stays well under one packet with 8 runners at the busiest moment', () => {
    const m = playing(8);
    const s = busy(m);
    expect(s.pl).toHaveLength(8);
    expect(s.ev).toHaveLength(MAX_EVENTS);
    const bytes = new TextEncoder().encode(JSON.stringify(s)).length;
    expect(bytes).toBeLessThan(4000);
    expect(applyMirror(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
});

describe('EventLog', () => {
  it('numbers events and forgets old ones', () => {
    const log = new EventLog();
    log.push({ k: 'go' }, 1);
    log.push({ k: 'refused', id: 3 }, 3);
    log.push({ k: 'final' }, 1 + EVENT_KEEP_S + 1.5);
    const recent = log.recent(1 + EVENT_KEEP_S + 1.5);
    expect(recent.map((e) => e.n)).toEqual([2, 3]);
    for (let i = 0; i < 20; i++) log.push({ k: 'go' }, 10);
    expect(log.recent(10)).toHaveLength(MAX_EVENTS);
    expect(log.recent(10).at(-1)!.n).toBe(23);
  });
});

/* ------------------------------------------------------------------ interpolation */

function state(at: number, st: number, ru: RunnerRow[], patch: Partial<BomMirror> = {}): BomMirror {
  return {
    v: 1,
    at,
    st,
    sg: 'play',
    pz: false,
    ar: 'halaman',
    pk: null,
    rn: 5,
    no: 0,
    ph: 'play',
    pt: st,
    pl: [],
    ru,
    bo: [[1, st / 20, 0, null]],
    br: '',
    bn: null,
    ic: null,
    sc: null,
    ev: [],
    ...patch,
  };
}

describe('pose', () => {
  it('blends position, facing, fuse and phase time halfway', () => {
    const a = state(1000, 10, [[1, 0, 0, 0, 0, 3, 0]]);
    const b = state(1100, 10.1, [[1, 1, 0, -0.5, 1, 3, 0]]);
    const p = pose(null, a, b, 1050);
    const r = p.runners[0]!;
    expect(r.x).toBeCloseTo(0.5);
    expect(r.z).toBeCloseTo(-0.25);
    expect(r.yaw).toBeCloseTo(0.5);
    expect(r.vx).toBeCloseTo(10);
    expect(p.simT).toBeCloseTo(10.05);
    expect(p.phaseT).toBeCloseTo(10.05);
    expect(p.burnt[0]).toBeCloseTo(10.05 / 20);
    expect(p.s).toBe(a);
  });

  it('turns the short way across the back', () => {
    const a = state(0, 1, [[1, 0, 0, 0, 3.1, 3, 0]]);
    const b = state(100, 1.1, [[1, 0, 0, 0, -3.1, 3, 0]]);
    const yaw = pose(null, a, b, 50).runners[0]!.yaw;
    expect(Math.abs(Math.abs(yaw) - Math.PI)).toBeLessThan(0.01);
  });

  it('snaps a runner that jumped instead of sliding across the yard', () => {
    const a = state(0, 1, [[1, -10, 0, 0, 0, 3, 0]]);
    const b = state(100, 1.1, [[1, -10 + TELEPORT_M + 6, 0, 0, 0, 3, 0]]);
    expect(pose(null, a, b, 30).runners[0]!.x).toBe(-10);
    const late = pose(null, a, b, 70).runners[0]!;
    expect(late.x).toBe(-10 + TELEPORT_M + 6);
    expect(late.vx).toBe(0);
  });

  it('keeps phase facts from the older state across a phase change', () => {
    const a = state(0, 5, [[1, 0, 0, 0, 0, 3, 0]], { ph: 'play', pt: 4 });
    const b = state(100, 5.1, [[1, 0, 0, 0, 0, 2, FLAG.frozen]], {
      ph: 'boom',
      pt: 0,
      bo: [[1, 0, 1, null]],
    });
    const p = pose(null, a, b, 50);
    expect(p.s.ph).toBe('play');
    expect(p.phaseT).toBeCloseTo(4.05);
    expect(p.burnt[0]).toBeCloseTo(5 / 20);
    expect(p.runners[0]!.lives).toBe(3);
  });

  it('holds the newest state and keeps the running speed from the one before', () => {
    const prev = state(0, 1, [[1, 0, 0, 0, 0, 3, 0]]);
    const a = state(100, 1.1, [[1, 0.6, 0, 0, 0, 3, 0]]);
    const p = pose(prev, a, null, 400);
    expect(p.runners[0]!.x).toBe(0.6);
    expect(p.runners[0]!.vx).toBeCloseTo(6);
    expect(p.simT).toBe(1.1);
  });
});

describe('MirrorTimeline', () => {
  it('draws the shortest trip plus an adaptive buffer behind server time and blends between states', () => {
    const tl = new MirrorTimeline();
    const lag = 300;
    for (let i = 0; i < 6; i++) {
      const at = 10_000 + i * 80;
      expect(tl.push(state(at, i * 0.08, [[1, i * 0.4, 0, 0, 0, 3, 0]]), at + lag)).toBe(true);
    }
    expect(tl.lagMs).toBe(lag);
    const now = 10_000 + 5 * 80 + lag;
    const drawn = tl.drawAt(now);
    const buffer = tl.behindMs! - lag;
    expect(drawn).toBeCloseTo(now - tl.behindMs!, 6);
    // About 1.5 state gaps (80 ms) with no jitter.
    expect(buffer).toBeGreaterThanOrEqual(BUFFER_MIN_MS);
    expect(buffer).toBeGreaterThan(105);
    expect(buffer).toBeLessThan(121);
    const p = tl.sample(now)!;
    const a = Math.floor((drawn - 10_000) / 80);
    expect(p.s.at).toBe(10_000 + a * 80);
    expect(p.runners[0]!.x).toBeCloseTo(((drawn - 10_000) / 80) * 0.4, 5);
  });

  it('ignores repeats and older states', () => {
    const tl = new MirrorTimeline();
    expect(tl.push(state(500, 1, []), 700)).toBe(true);
    expect(tl.push(state(500, 1, []), 800)).toBe(false);
    expect(tl.push(state(400, 1, []), 800)).toBe(false);
    expect(tl.latest?.at).toBe(500);
  });

  it('holds the oldest state before the buffer starts and nothing before any state', () => {
    const tl = new MirrorTimeline();
    expect(tl.sample(0)).toBeNull();
    tl.push(state(1000, 2, [[1, 3, 0, 0, 0, 3, 0]]), 1000);
    expect(tl.sample(1000)!.runners[0]!.x).toBe(3);
  });

  it('keeps a direct link close behind and follows route changes without the yard jumping', () => {
    const tl = new MirrorTimeline();
    // Relay, then a direct link, then the relay again; the runner walks 1 m per second.
    const trip = (t: number) => (t < 4000 || t >= 9000 ? 250 + ((t * 7) % 70) : 30 + ((t * 7) % 6));
    const sent = Array.from({ length: 250 }, (_, i) => i * 60);
    let k = 0;
    let lastX = Number.NEGATIVE_INFINITY;
    let maxStep = 0;
    let direct = Number.POSITIVE_INFINITY;
    for (let now = 0; now < 15_000; now += 16) {
      while (k < sent.length && sent[k]! + trip(sent[k]!) <= now) {
        const t = sent[k++]!;
        tl.push(state(t, t / 1000, [[1, t / 1000, 0, 0, 0, 3, 0]]), t + trip(t));
      }
      const p = tl.sample(now);
      if (!p) continue;
      const x = p.runners[0]!.x;
      if (lastX > Number.NEGATIVE_INFINITY) {
        expect(x).toBeGreaterThanOrEqual(lastX - 1e-9);
        maxStep = Math.max(maxStep, x - lastX);
      }
      lastX = x;
      if (now >= 8000 && now < 9000) direct = Math.min(direct, tl.behindMs! - tl.lagMs!);
    }
    expect(maxStep).toBeLessThan(0.016 * 1.15);
    expect(direct).toBeLessThan(120);
    expect(tl.behindMs! - tl.lagMs!).toBeLessThanOrEqual(BUFFER_MAX_MS);
  });
});

describe('FuseClock', () => {
  const bomb = (at: number, st: number, burnt: number, patch: Partial<BomMirror> = {}): BomMirror =>
    state(at, st, [], { bo: [[1, burnt, 0, null]], ...patch });

  it('reads the fuse at server time from how fast it burnt, ahead of the delayed yard', () => {
    const f = new FuseClock();
    // A 20 s fuse: 0.05 per second.
    for (let i = 0; i <= 25; i++) f.observe(bomb(10_000 + i * 60, 2 + i * 0.06, 0.1 + i * 0.003));
    const newest = bomb(10_000 + 25 * 60, 2 + 25 * 0.06, 0.1 + 25 * 0.003);
    expect(f.burntAt(newest, 0, newest.at)).toBeCloseTo(0.175, 6);
    expect(f.burntAt(newest, 0, newest.at + 400)).toBeCloseTo(0.175 + 0.02, 4);
    // Never past a full fuse, never further ahead than the clock cap.
    expect(f.burntAt(newest, 0, newest.at + 60_000)).toBeCloseTo(
      0.175 + (0.05 * CLOCK_AHEAD_MAX_MS) / 1000,
      4,
    );
    const nearEnd = bomb(newest.at, newest.st, 0.99);
    expect(f.burntAt(nearEnd, 0, nearEnd.at + 1000)).toBe(1);
    // Paused Host: the fuse stands still.
    expect(f.burntAt({ ...newest, pz: true }, 0, newest.at + 400)).toBeCloseTo(0.175, 6);
  });

  it('waits for a second of burning before reading ahead, and starts over each round', () => {
    const f = new FuseClock();
    f.observe(bomb(0, 0, 0.01));
    const early = bomb(500, 0.5, 0.035);
    f.observe(early);
    expect(f.burntAt(early, 0, 900)).toBeNull();
    const later = bomb(1500, 1.5, 0.085);
    f.observe(later);
    expect(f.burntAt(later, 0, 1500)).toBeCloseTo(0.085, 6);
    const next = bomb(1600, 1.6, 0.01, { no: 1 });
    f.observe(next);
    expect(f.burntAt(next, 0, 1700)).toBeNull();
    expect(f.burntAt(bomb(1700, 1.7, 0.5, { bo: [[1, 0.5, 1, null]] }), 0, 1800)).toBeNull();
    expect(f.burntAt(bomb(1700, 1.7, 0.5, { ph: 'boom' }), 0, 1800)).toBeNull();
  });
});
