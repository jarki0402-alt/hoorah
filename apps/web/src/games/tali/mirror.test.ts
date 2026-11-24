import { FRUITS, lookOfFruit } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import type { FlagCard, IntroCard } from './hud';
import { type ClimberInfo, SACK_ID, TaliMatch, TIMING } from './logic';
import {
  applyMirror,
  type BodyRow,
  clockAt,
  EVENT_KEEP_S,
  EventLog,
  FLAG,
  MAX_CLIMBERS,
  MAX_EVENTS,
  type MirrorSource,
  MirrorTimeline,
  pose,
  type TaliMirror,
  TELEPORT_M,
  toMirror,
} from './mirror';
import { BUFFER_MIN_MS, CLOCK_AHEAD_MAX_MS } from './playout';

const STEP = 1 / 60;

const people = (n: number): ClimberInfo[] =>
  Array.from({ length: n }, (_, i) => {
    const fruit = FRUITS[i % FRUITS.length]!;
    return {
      id: i + 1,
      name: `Pemain Nomor ${i + 1} Panjang`,
      fruit,
      look: lookOfFruit(fruit),
      color: '#2F8CFF',
    };
  });

function climbing(n: number, seconds = 1.5): TaliMatch {
  const m = new TaliMatch({ climbers: people(n), route: 'bambu', sections: 6, seed: 4242 });
  const ticks = Math.round((TIMING.intro + TIMING.count + seconds) / STEP);
  for (let i = 0; i < ticks; i++) {
    for (const c of m.climbers) m.steer(c.id, 0.8, -0.1);
    m.tick(STEP);
  }
  m.drainEvents();
  return m;
}

function source(m: TaliMatch | null, extra: Partial<MirrorSource> = {}): MirrorSource {
  return {
    at: 1_700_000_000_123,
    stage: m ? 'play' : 'pick',
    paused: false,
    route: 'bambu',
    sections: 6,
    pick: null,
    match: m,
    gameT: m ? 7.25 : 0,
    brand: 'Hutan Bambu · bagian 1/6',
    intro: null,
    flagCard: null,
    events: [],
    ...extra,
  };
}

const json = <T>(v: T): unknown => JSON.parse(JSON.stringify(v));

/** Every field at its longest: what a busy flag moment with 4 climbers sends. */
function busy(m: TaliMatch): TaliMirror {
  const log = new EventLog();
  const ids = m.climbers.map((c) => c.id);
  for (let i = 0; i < MAX_EVENTS + 3; i++) {
    log.push({ k: 'catch', id: ids[i % ids.length]!, by: ids.filter((_, j) => j !== i % ids.length) }, 7);
  }
  const intro: IntroCard = {
    of: 'Bagian 6 dari 6',
    name: 'Puncak Salju',
    level: 'Makin tinggi',
    segments: ['Dinding panjat', 'Palang berputar', 'Titian sempit', 'Lift naik', 'Rakit geser'],
    solo: false,
  };
  const flagCard: FlagCard = {
    title: 'Bendera 6 berkibar!',
    done: true,
    stars: 3,
    lines: ['Waktu 12:34', 'Jatuh 12 kali', 'Bintang 18 dari 18'],
    sub: 'Hasil akhir sebentar lagi',
  };
  return toMirror(source(m, { intro, flagCard, events: log.recent(7), gameT: 7 }));
}

describe('toMirror / applyMirror', () => {
  it('round-trips a running climb through JSON', () => {
    const m = climbing(3);
    const log = new EventLog();
    log.push({ k: 'wipe', id: 2, at: { x: 12.3456, y: -8.0001, z: 0.333 }, live: true }, 7);
    log.push({ k: 'land', id: 1, speed: 7.777 }, 7.1);
    const s = toMirror(source(m, { events: log.recent(7.1) }));
    expect(s.ph).toBe('climb');
    expect(s.sd).toBe(4242);
    expect(s.pl).toHaveLength(3);
    expect(s.bo).toHaveLength(3);
    expect(s.rp).toHaveLength(2);
    expect(s.sk).toBe(false);
    expect(s.ev[0]!.e).toEqual({ k: 'wipe', id: 2, at: { x: 12.35, y: -8, z: 0.33 }, live: true });
    expect(s.ev[1]!.e).toEqual({ k: 'land', id: 1, speed: 7.8 });
    expect(applyMirror(json(s))).toEqual(s);
  });

  it('sends the sandbag last in the tie order when alone', () => {
    const m = climbing(1);
    const s = toMirror(source(m));
    expect(s.sk).toBe(true);
    expect(s.bo.map((r) => r[0])).toEqual([1, SACK_ID]);
    expect(s.rp).toHaveLength(1);
    expect(applyMirror(json(s))).toEqual(s);
  });

  it('marks grip, hanging and offline climbers', () => {
    const m = climbing(3);
    m.hold(1, true);
    m.setOffline(3, true);
    m.climber(2)!.hanging = true;
    const s = toMirror(source(m));
    const flags = (id: number) => s.bo.find((r) => r[0] === id)![5];
    expect(flags(1) & FLAG.grip).toBe(FLAG.grip);
    expect(flags(2) & FLAG.hang).toBe(FLAG.hang);
    expect(flags(3) & FLAG.offline).toBe(FLAG.offline);
  });

  it('round-trips the route picker before a climb exists', () => {
    const s = toMirror(
      source(null, {
        sections: 40,
        route: 'salju',
        pick: {
          selected: 'salju',
          options: [
            { id: 'senja', name: 'Tebing Senja', sub: 'Rekor tim 3:12' },
            { id: 'bambu', name: 'Hutan Bambu', sub: 'Titian bambu di atas sungai' },
            { id: 'salju', name: 'Puncak Salju', sub: 'Lift es menuju puncak' },
          ],
          sub: 'Rina memilih di HP',
          note: '3 pemain, satu tali',
        },
      }),
    );
    expect(s.sn).toBe(8);
    expect(s.ro).toBe('salju');
    expect(s.pk?.os[0]).toBe('Rekor tim 3:12');
    expect(applyMirror(json(s))).toEqual(s);
  });

  it('carries enough for a far-away screen to rebuild the same course and section', () => {
    const m = climbing(2);
    const s = toMirror(source(m));
    const far = new TaliMatch({ climbers: people(2), route: s.ro, sections: s.sn, seed: s.sd });
    expect(far.section.solids).toEqual(m.section.solids);
    far.load(3);
    const host = new TaliMatch({ climbers: people(2), route: 'bambu', sections: 6, seed: 4242 });
    host.load(3);
    expect(far.section.solids).toEqual(host.section.solids);
  });

  it('rejects malformed states', () => {
    const good = toMirror(source(climbing(3)));
    const bad = (patch: Record<string, unknown>) =>
      applyMirror({ ...(json(good) as Record<string, unknown>), ...patch });
    expect(applyMirror(null)).toBeNull();
    expect(applyMirror('x')).toBeNull();
    expect(applyMirror([])).toBeNull();
    expect(bad({ v: 2 })).toBeNull();
    expect(bad({ ph: 'lava' })).toBeNull();
    expect(bad({ sg: 'nope' })).toBeNull();
    expect(bad({ ro: 'bulan' })).toBeNull();
    expect(bad({ no: 6 })).toBeNull();
    expect(bad({ sn: 0 })).toBeNull();
    expect(bad({ sn: 9 })).toBeNull();
    expect(bad({ sd: -1 })).toBeNull();
    expect(bad({ sd: 1.5 })).toBeNull();
    expect(bad({ st: -1 })).toBeNull();
    expect(bad({ gt: Number.NaN })).toBeNull();
    expect(bad({ sk: 1 })).toBeNull();
    expect(bad({ fd: [1, 0, 2] })).toBeNull();
    expect(bad({ fd: [1, 1, 1, 1, 1, 1, 1] })).toBeNull();
    expect(bad({ br: 'x'.repeat(500) })).toBeNull();
    expect(bad({ bo: [[1, 0, 0, 0, 0, 64]] })).toBeNull();
    expect(bad({ bo: [[0, 0, 0, 0, 0, 0]] })).toBeNull();
    expect(bad({ bo: [[1, 'a', 0, 0, 0, 0]] })).toBeNull();
    expect(bad({ bo: [[1, 1e6, 0, 0, 0, 0]] })).toBeNull();
    expect(bad({ bo: Array.from({ length: 6 }, (_, i) => [i + 1, 0, 0, 0, 0, 0]) })).toBeNull();
    expect(bad({ rp: [[3, -1]] })).toBeNull();
    expect(bad({ rp: [[3]] })).toBeNull();
    expect(bad({ rp: Array.from({ length: 5 }, () => [3, 3]) })).toBeNull();
    expect(bad({ pl: [{ id: 1, n: 'A', f: 'durian-x', l: { c: 'x' }, c: '#fff' }] })).toBeNull();
    expect(bad({ ic: { of: 'a', name: 'b', level: 'c', segments: [1], solo: false } })).toBeNull();
    expect(bad({ fc: { title: 'a', done: true, stars: 4, lines: [], sub: '' } })).toBeNull();
    expect(bad({ pk: { sub: 'a', note: 'b', os: ['x', 'y', 'z', 'w'] } })).toBeNull();
    expect(bad({ ev: [{ n: 1, t: 0, e: { k: 'teleport' } }] })).toBeNull();
    expect(bad({ ev: [{ n: 1, t: 0, e: { k: 'wipe', id: 1, at: { x: 0, y: 0 }, live: true } }] })).toBeNull();
    expect(bad({ ev: [{ n: 1, t: 0, e: { k: 'go', help: 'semua' } }] })).toBeNull();
    expect(bad({ ev: [{ n: 1, t: 0, e: { k: 'count', value: 0 } }] })).toBeNull();
    expect(bad({ ev: [{ n: 1, t: -1, e: { k: 'throw' } }] })).toBeNull();
    expect(bad({ pz: 'no' })).toBeNull();
  });

  it('stays well under one packet with 4 climbers at the busiest moment', () => {
    const m = climbing(MAX_CLIMBERS);
    const s = busy(m);
    expect(s.pl).toHaveLength(MAX_CLIMBERS);
    expect(s.ev).toHaveLength(MAX_EVENTS);
    const bytes = new TextEncoder().encode(JSON.stringify(s)).length;
    expect(bytes).toBeLessThan(4000);
    expect(applyMirror(json(s))).toEqual(s);
    const plain = new TextEncoder().encode(JSON.stringify(toMirror(source(m)))).length;
    expect(plain).toBeLessThan(2000);
  });
});

describe('EventLog', () => {
  it('numbers events and forgets old ones', () => {
    const log = new EventLog();
    log.push({ k: 'go', help: 'team' }, 1);
    log.push({ k: 'sweep', id: 3 }, 3);
    log.push({ k: 'throw' }, 1 + EVENT_KEEP_S + 1.5);
    expect(log.recent(1 + EVENT_KEEP_S + 1.5).map((e) => e.n)).toEqual([2, 3]);
    for (let i = 0; i < 20; i++) log.push({ k: 'throw' }, 10);
    expect(log.recent(10)).toHaveLength(MAX_EVENTS);
    expect(log.recent(10).at(-1)!.n).toBe(23);
  });
});

describe('clockAt', () => {
  it('reads the climb clock ahead at server time, holds it when paused or not climbing', () => {
    const s = state(10_000, 20, [], { ph: 'climb', ct: 30, tt: 100 });
    expect(clockAt(s, 10_000)).toEqual({ total: 130, left: TIMING.sectionMax - 30 });
    expect(clockAt(s, 10_500).total).toBeCloseTo(130.5);
    expect(clockAt(s, 10_000 + 60_000).total).toBeCloseTo(130 + CLOCK_AHEAD_MAX_MS / 1000);
    expect(clockAt({ ...s, pz: true }, 10_500).total).toBe(130);
    expect(clockAt({ ...s, ph: 'flag' }, 10_500)).toEqual({ total: 100, left: null });
    expect(clockAt({ ...s, ct: TIMING.sectionMax + 5 }, 10_000).left).toBe(0);
  });
});

/* ------------------------------------------------------------------ interpolation */

function state(at: number, st: number, bo: BodyRow[], patch: Partial<TaliMirror> = {}): TaliMirror {
  return {
    v: 1,
    at,
    gt: st,
    st,
    sg: 'play',
    pz: false,
    ro: 'senja',
    pk: null,
    sd: 99,
    sn: 6,
    no: 0,
    ph: 'climb',
    pt: st,
    ct: st,
    tt: 0,
    sk: false,
    ca: 0,
    fd: [],
    pl: [],
    bo,
    rp: [[3, st]],
    br: '',
    ic: null,
    fc: null,
    ev: [],
    ...patch,
  };
}

describe('pose', () => {
  it('blends position, facing, rope, game and sim time halfway', () => {
    const a = state(1000, 10, [[1, 0, 1, 0, 0, FLAG.ground]]);
    const b = state(1100, 10.1, [[1, 1, 2, -0.5, 1, 0]]);
    const p = pose(null, a, b, 1050);
    const r = p.bodies[0]!;
    expect(r.x).toBeCloseTo(0.5);
    expect(r.y).toBeCloseTo(1.5);
    expect(r.z).toBeCloseTo(-0.25);
    expect(r.yaw).toBeCloseTo(0.5);
    expect(r.vx).toBeCloseTo(10);
    expect(r.vy).toBeCloseTo(10);
    expect(r.flags).toBe(FLAG.ground);
    expect(p.simT).toBeCloseTo(10.05);
    expect(p.gameT).toBeCloseTo(10.05);
    expect(p.phaseT).toBeCloseTo(10.05);
    expect(p.sectionT).toBeCloseTo(10.05);
    expect(p.rope[0]![1]).toBeCloseTo(10.05);
    expect(p.snap).toBe(false);
    expect(p.s).toBe(a);
  });

  it('turns the short way across the back', () => {
    const a = state(0, 1, [[1, 0, 0, 0, 3.1, 0]]);
    const b = state(100, 1.1, [[1, 0, 0, 0, -3.1, 0]]);
    const yaw = pose(null, a, b, 50).bodies[0]!.yaw;
    expect(Math.abs(Math.abs(yaw) - Math.PI)).toBeLessThan(0.01);
  });

  it('snaps a team respawn instead of sliding through the air', () => {
    const a = state(0, 1, [[1, 20, -9, 0, 0, 0]]);
    const b = state(100, 1.1, [[1, 20 - TELEPORT_M - 6, 2, 0, 0, FLAG.frozen]]);
    const early = pose(null, a, b, 30);
    expect(early.bodies[0]!.x).toBe(20);
    expect(early.snap).toBe(true);
    const late = pose(null, a, b, 70).bodies[0]!;
    expect(late.x).toBe(20 - TELEPORT_M - 6);
    expect(late.vx).toBe(0);
    expect(late.flags).toBe(FLAG.frozen);
    // A short hop back to the save pad still snaps: the team froze there.
    const near = state(100, 1.1, [[1, 19, -9, 0, 0, FLAG.frozen | FLAG.ground]]);
    expect(pose(null, a, near, 70).bodies[0]!.x).toBe(19);
  });

  it('never blends across sections', () => {
    const a = state(0, 80, [[1, 50, 3, 0, 0, FLAG.ground]], { ph: 'flag', pt: 5.9, ct: 70 });
    const b = state(100, 0.05, [[1, 0, 0.2, 0, 0, FLAG.frozen]], { no: 1, ph: 'intro', pt: 0.05, gt: 80.1 });
    const p = pose(null, a, b, 50);
    expect(p.bodies[0]!.x).toBe(50);
    expect(p.simT).toBe(80);
    expect(p.s.no).toBe(0);
    expect(p.gameT).toBeCloseTo(80.05);
  });

  it('keeps phase facts from the older state across a phase change', () => {
    const a = state(0, 5, [[1, 0, 0, 0, 0, 0]], { ph: 'count', pt: 2.95 });
    const b = state(100, 5.1, [[1, 0, 0, 0, 0, 0]], { ph: 'climb', pt: 0.05 });
    const p = pose(null, a, b, 50);
    expect(p.s.ph).toBe('count');
    expect(p.phaseT).toBeCloseTo(3);
  });

  it('holds the newest state and keeps the speed from the one before', () => {
    const prev = state(0, 1, [[1, 0, 0, 0, 0, 0]]);
    const a = state(100, 1.1, [[1, 0.6, 0, 0, 0, 0]]);
    const p = pose(prev, a, null, 400);
    expect(p.bodies[0]!.x).toBe(0.6);
    expect(p.bodies[0]!.vx).toBeCloseTo(6);
    expect(p.simT).toBe(1.1);
  });
});

describe('MirrorTimeline', () => {
  it('draws a little behind server time and blends between states', () => {
    const tl = new MirrorTimeline();
    const lag = 40;
    for (let i = 0; i < 6; i++) {
      const at = 10_000 + i * 60;
      expect(tl.push(state(at, i * 0.06, [[1, i * 0.3, 0, 0, 0, 0]]), at + lag)).toBe(true);
    }
    expect(tl.lagMs).toBe(lag);
    const now = 10_000 + 5 * 60 + lag;
    const drawn = tl.drawAt(now);
    expect(tl.behindMs! - lag).toBeGreaterThanOrEqual(BUFFER_MIN_MS);
    const p = tl.sample(now)!;
    expect(p.bodies[0]!.x).toBeCloseTo(((drawn - 10_000) / 60) * 0.3, 5);
  });

  it('ignores repeats and older states, and draws nothing before any state', () => {
    const tl = new MirrorTimeline();
    expect(tl.sample(0)).toBeNull();
    expect(tl.push(state(500, 1, []), 700)).toBe(true);
    expect(tl.push(state(500, 1, []), 800)).toBe(false);
    expect(tl.push(state(400, 1, []), 800)).toBe(false);
    expect(tl.latest?.at).toBe(500);
  });

  it('moves a climber forward smoothly over a jittery relay', () => {
    const tl = new MirrorTimeline();
    const trip = (t: number) => 220 + ((t * 13) % 90);
    const sent = Array.from({ length: 150 }, (_, i) => i * 60);
    let k = 0;
    let lastX = Number.NEGATIVE_INFINITY;
    let maxStep = 0;
    for (let now = 0; now < 9000; now += 16) {
      while (k < sent.length && sent[k]! + trip(sent[k]!) <= now) {
        const t = sent[k++]!;
        tl.push(state(t, t / 1000, [[1, (t / 1000) * 2, 0, 0, 0, FLAG.ground]]), t + trip(t));
      }
      const p = tl.sample(now);
      if (!p) continue;
      const x = p.bodies[0]!.x;
      if (lastX > Number.NEGATIVE_INFINITY) {
        expect(x).toBeGreaterThanOrEqual(lastX - 1e-9);
        maxStep = Math.max(maxStep, x - lastX);
      }
      lastX = x;
    }
    // 2 m/s at 16 ms frames: about 3 cm a frame, never a visible jump.
    expect(maxStep).toBeLessThan(0.032 * 1.2);
  });
});
