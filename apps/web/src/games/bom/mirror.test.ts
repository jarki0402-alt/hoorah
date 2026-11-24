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
  MAX_EVENTS,
  type MirrorSource,
  MirrorTimeline,
  pose,
  RENDER_DELAY_MS,
  type RunnerRow,
  TELEPORT_M,
  toMirror,
} from './mirror';

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
  it('draws a fixed delay behind the delivery delay and blends between states', () => {
    const tl = new MirrorTimeline();
    const lag = 300;
    for (let i = 0; i < 6; i++) {
      const at = 10_000 + i * 80;
      expect(tl.push(state(at, i * 0.08, [[1, i * 0.4, 0, 0, 0, 3, 0]]), at + lag)).toBe(true);
    }
    expect(tl.lagMs).toBeCloseTo(lag);
    const now = 10_000 + 5 * 80 + lag;
    expect(tl.drawAt(now)).toBeCloseTo(10_400 - RENDER_DELAY_MS);
    const p = tl.sample(now)!;
    // Drawn at 10 300: three quarters of the way from the state at 10 240 to the one at 10 320.
    expect(p.s.at).toBe(10_240);
    expect(p.runners[0]!.x).toBeCloseTo(1.2 + 0.4 * 0.75);
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

  it('raises the delay quickly for a late packet and lowers it slowly', () => {
    const tl = new MirrorTimeline();
    tl.push(state(0, 0, []), 200);
    tl.push(state(80, 0.08, []), 80 + 600);
    const raised = tl.lagMs!;
    expect(raised).toBeGreaterThan(300);
    tl.push(state(160, 0.16, []), 160 + 200);
    expect(tl.lagMs!).toBeGreaterThan(raised - 20);
  });
});
