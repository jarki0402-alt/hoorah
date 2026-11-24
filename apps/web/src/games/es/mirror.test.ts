import { lookOfFruit } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import type { EndRow, FinalRow } from './hud';
import { EsMatch, type PlayerInfo, TIMING } from './logic';
import {
  applyMirror,
  type EsMirror,
  EVENT_KEEP_S,
  EventLog,
  FLAG,
  MAX_EVENTS,
  type MirrorSource,
  MirrorTimeline,
  pose,
  RENDER_DELAY_MS,
  type SkaterRow,
  TELEPORT_M,
  toMirror,
} from './mirror';

const FRUITS = ['semangka', 'alpukat', 'durian', 'nanas', 'jeruk', 'stroberi', 'mangga', 'rambutan'] as const;

function seats(n: number): PlayerInfo[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i < 2 ? i + 1 : -(i + 1),
    name: `Pemain Nomor ${i + 1}`,
    fruit: FRUITS[i % FRUITS.length]!,
    look: lookOfFruit(FRUITS[i % FRUITS.length]!),
    color: '#2F8CFF',
    cpu: i >= 2,
  }));
}

function run(m: EsMatch, seconds: number): void {
  for (let t = 0; t < seconds; t += 1 / 60) m.tick(1 / 60);
  m.drainEvents();
}

/** A match in the aim phase, the first phone locked, the second still searching. */
function aiming(n: number): EsMatch {
  const m = new EsMatch({ players: seats(n), rounds: 5, seed: 7 });
  run(m, TIMING.intro + 0.2);
  m.lock(1, { x: 0.6, y: -0.3 });
  m.stream(2, { x: -0.4, y: 0.5 });
  m.drainEvents();
  return m;
}

function source(m: EsMatch, extra: Partial<MirrorSource> = {}): MirrorSource {
  return {
    at: 1_700_000_000_123,
    t: 12.3456,
    paused: false,
    match: m,
    offline: (id) => id === 2,
    intro: null,
    end: null,
    final: null,
    help: false,
    events: [],
    ...extra,
  };
}

const roundTrip = (s: EsMirror): EsMirror | null => applyMirror(JSON.parse(JSON.stringify(s)));

/** Every field at its longest: a busy final table with 8 skaters, 9 rounds and a full log. */
function busy(m: EsMatch): EsMirror {
  const log = new EventLog();
  const ids = m.players.map((p) => p.id);
  for (let i = 0; i < MAX_EVENTS + 4; i++) {
    log.push(
      {
        k: 'fall',
        id: ids[i % ids.length]!,
        by: ids[(i + 1) % ids.length]!,
        crack: i % 2 === 0,
        at: { x: -7.12345, y: 6.98765 },
      },
      10,
    );
  }
  const chip = (id: number) => {
    const p = m.player(id)!;
    return { id, name: p.name, fruit: p.fruit, look: p.look, color: p.color };
  };
  const end: EndRow[] = ids.map((id, i) => ({ ...chip(id), points: 20 - i, winner: i === 0 }));
  const final: FinalRow[] = ids.map((id, i) => ({
    ...chip(id),
    rounds: [10, 20, 9, 8, 7, 6, 5, 4, 20],
    total: 99,
    rank: i + 1,
  }));
  return toMirror(
    source(m, {
      intro: {
        of: 'Ronde 9 dari 9',
        name: 'Ronde penentuan',
        desc: 'Poin ganda! Juara bisa berganti di luncuran penutup.',
        double: true,
      },
      end: { title: 'Pemain Nomor 1 terakhir di atas es!', rows: end },
      final: { cols: 9, rows: final },
      help: true,
      events: log.recent(10),
    }),
  );
}

describe('toMirror / applyMirror', () => {
  it('round-trips an aiming match through JSON', () => {
    const m = aiming(4);
    const log = new EventLog();
    log.push({ k: 'hit', at: { x: 1.23456, y: -0.987 }, speed: 4.5678 }, 12);
    log.push({ k: 'nearMiss', id: 1, gap: 0.123456 }, 12.2);
    const s = toMirror(source(m, { events: log.recent(12.3) }));
    expect(s.ph).toBe('aim');
    expect(s.sh).toBe(1);
    expect(s.sk).toHaveLength(4);
    expect(s.st).toBe(12.346);
    expect(s.ev[0]!.e).toEqual({ k: 'hit', at: { x: 1.23, y: -0.99 }, speed: 4.57 });
    expect(s.ev[1]!.e).toEqual({ k: 'nearMiss', id: 1, gap: 0.123 });
    expect(roundTrip(s)).toEqual(s);
  });

  it('marks locked and live aims, offline phones and keeps negative computer ids', () => {
    const s = toMirror(source(aiming(3)));
    const row = (id: number) => s.sk.find((r) => r[0] === id)!;
    expect(row(1)[9] & FLAG.locked).toBe(FLAG.locked);
    expect([row(1)[5], row(1)[6]]).toEqual([0.6, -0.3]);
    expect(row(2)[9] & FLAG.live).toBe(FLAG.live);
    expect(row(2)[9] & FLAG.offline).toBe(FLAG.offline);
    expect(row(-3)[9] & FLAG.inRound).toBe(FLAG.inRound);
    expect(row(-3)[7]).toBe(-1);
  });

  it('carries the floe sizes and the round cards', () => {
    const m = aiming(8);
    const s = busy(m);
    expect(s.ed).toBeCloseTo(m.edge, 3);
    expect(s.ne).toBeCloseTo(m.nextEdge, 3);
    expect(s.ne).toBeLessThan(s.ed);
    expect(s.en?.r[0]).toEqual([1, 20, 1]);
    expect(s.fi?.r[7]).toEqual([-8, [10, 20, 9, 8, 7, 6, 5, 4, 20], 99, 8]);
    expect(roundTrip(s)).toEqual(s);
  });

  it('rejects malformed states', () => {
    const good = toMirror(source(aiming(4)));
    const bad = (patch: (j: Record<string, unknown>) => void): EsMirror | null => {
      const j = JSON.parse(JSON.stringify(good)) as Record<string, unknown>;
      patch(j);
      return applyMirror(j);
    };
    expect(applyMirror(null)).toBeNull();
    expect(applyMirror('state')).toBeNull();
    expect(applyMirror([])).toBeNull();
    expect(bad((j) => (j.v = 2))).toBeNull();
    expect(bad((j) => (j.ph = 'boom'))).toBeNull();
    expect(bad((j) => (j.rd = 5))).toBeNull();
    expect(bad((j) => (j.rn = 40))).toBeNull();
    expect(bad((j) => (j.sh = 12))).toBeNull();
    expect(bad((j) => (j.ed = 0))).toBeNull();
    expect(bad((j) => (j.ne = 500))).toBeNull();
    expect(bad((j) => (j.pt = -1))).toBeNull();
    expect(bad((j) => (j.pz = 'no'))).toBeNull();
    expect(bad((j) => delete j.hp)).toBeNull();
    expect(bad((j) => (j.at = Number.NaN))).toBeNull();
    expect(bad((j) => ((j.sk as unknown[][])[0]![1] = 5000))).toBeNull();
    expect(bad((j) => ((j.sk as unknown[][])[0]![9] = 64))).toBeNull();
    expect(bad((j) => ((j.sk as unknown[][])[0]![0] = 0))).toBeNull();
    expect(bad((j) => ((j.sk as unknown[][])[0] as unknown[]).pop())).toBeNull();
    expect(bad((j) => (j.sk = Array.from({ length: 9 }, () => (j.sk as unknown[])[0])))).toBeNull();
    expect(bad((j) => ((j.pl as Record<string, unknown>[])[0]!.f = 'apel'))).toBeNull();
    expect(bad((j) => ((j.pl as Record<string, unknown>[])[0]!.n = 'x'.repeat(41)))).toBeNull();
    expect(bad((j) => (j.ic = { of: 'a', name: 'b', desc: 'c' }))).toBeNull();
    expect(bad((j) => (j.en = { t: 'a', r: [[1, 2, 3]] }))).toBeNull();
    expect(bad((j) => (j.fi = { c: 5, r: [[1, [1, -2], 3, 1]] }))).toBeNull();
    expect(bad((j) => (j.ev = [{ n: 1, t: 1, e: { k: 'meledak' } }]))).toBeNull();
    expect(
      bad(
        (j) => (j.ev = [{ n: 1, t: 1, e: { k: 'fall', id: 1, by: 'x', crack: false, at: { x: 0, y: 0 } } }]),
      ),
    ).toBeNull();
    expect(bad((j) => (j.ev = [{ n: 1, t: 1, e: { k: 'nearMiss', id: 1, gap: 3 } }]))).toBeNull();
    expect(bad(() => {})).toEqual(good);
  });

  it('stays well under the 7.5 KB packet limit with 8 skaters', () => {
    const s = busy(aiming(8));
    expect(s.sk).toHaveLength(8);
    expect(s.ev).toHaveLength(MAX_EVENTS);
    expect(JSON.stringify(s).length).toBeLessThan(5000);
  });
});

describe('EventLog', () => {
  it('numbers events, keeps the newest few and drops old ones', () => {
    const log = new EventLog();
    for (let i = 0; i < MAX_EVENTS + 2; i++) log.push({ k: 'launch' }, i * 0.1);
    const all = log.recent(0);
    expect(all).toHaveLength(MAX_EVENTS);
    expect(all[0]!.n).toBe(3);
    expect(all[all.length - 1]!.n).toBe(MAX_EVENTS + 2);
    expect(log.recent(EVENT_KEEP_S + 10)).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ interpolation */

const row = (
  id: number,
  x: number,
  y: number,
  extra: Partial<Record<5 | 6 | 7 | 9, number>> = {},
): SkaterRow => [id, x, y, 1, 0, extra[5] ?? 0, extra[6] ?? 0, extra[7] ?? -1, 3, extra[9] ?? FLAG.inRound];

function state(at: number, st: number, sk: SkaterRow[], over: Partial<EsMirror> = {}): EsMirror {
  return {
    v: 1,
    at,
    st,
    pz: false,
    rn: 5,
    rd: 0,
    sh: 1,
    ph: 'slide',
    pt: st,
    ed: 7,
    ne: 6,
    pl: [],
    sk,
    ic: null,
    en: null,
    fi: null,
    hp: false,
    ev: [],
    ...over,
  };
}

describe('pose', () => {
  it('blends positions, aims, falls and phase time between two states', () => {
    const live = FLAG.inRound | FLAG.live;
    const a = state(1000, 1, [row(1, 0, 0, { 5: 0.2, 6: 0, 9: live }), row(2, 4, 0, { 7: 0.1 })]);
    const b = state(1100, 1.1, [row(1, 0.5, -0.5, { 5: 0.4, 6: 0.2, 9: live }), row(2, 4.3, 0, { 7: 0.3 })]);
    const p = pose(a, b, 1050);
    expect(p.simT).toBeCloseTo(1.05);
    expect(p.phaseT).toBeCloseTo(1.05);
    const [one, two] = p.skaters;
    expect(one!.x).toBeCloseTo(0.25);
    expect(one!.y).toBeCloseTo(-0.25);
    expect(one!.ax).toBeCloseTo(0.3);
    expect(one!.ay).toBeCloseTo(0.1);
    expect(two!.falling).toBeCloseTo(0.2);
  });

  it('snaps a skater that jumped and never blends across rounds', () => {
    const a = state(1000, 1, [row(1, 0, 0)]);
    const far = state(1100, 1.1, [row(1, TELEPORT_M + 1, 0)]);
    expect(pose(a, far, 1040).skaters[0]!.x).toBe(0);
    expect(pose(a, far, 1060).skaters[0]!.x).toBe(TELEPORT_M + 1);
    const next = state(1100, 1.1, [row(1, 1, 0)], { rd: 1, ph: 'intro', pt: 0 });
    expect(pose(a, next, 1050).skaters[0]!.x).toBe(0);
  });

  it('does not blend aims of different kinds or phase time across phases', () => {
    const a = state(1000, 5, [row(1, 0, 0, { 5: 0.2, 9: FLAG.inRound | FLAG.live })], { ph: 'aim', pt: 5 });
    const b = state(1100, 5.1, [row(1, 0, 0, { 5: 0.8, 9: FLAG.inRound | FLAG.locked })], {
      ph: 'slide',
      pt: 0,
    });
    const p = pose(a, b, 1050);
    expect(p.skaters[0]!.ax).toBe(0.2);
    expect(p.phaseT).toBeCloseTo(5.05);
  });

  it('holds the newest state when nothing newer arrived', () => {
    const a = state(1000, 1, [row(1, 2, 3)]);
    const p = pose(a, null, 5000);
    expect(p.simT).toBe(1);
    expect(p.skaters[0]!.x).toBe(2);
  });
});

describe('MirrorTimeline', () => {
  it('drops old or repeated states and draws a little in the past', () => {
    const tl = new MirrorTimeline();
    expect(tl.sample(0)).toBeNull();
    expect(tl.push(state(1000, 1, [row(1, 0, 0)]), 1200)).toBe(true);
    expect(tl.push(state(1000, 1, [row(1, 9, 0)]), 1210)).toBe(false);
    expect(tl.push(state(1075, 1.075, [row(1, 0.75, 0)]), 1275)).toBe(true);
    expect(tl.lagMs).toBeCloseTo(200);
    expect(tl.drawAt(1300)).toBeCloseTo(1300 - 200 - RENDER_DELAY_MS);
    // Drawn at 1037.5: halfway between the two states.
    const p = tl.sample(1037.5 + 200 + RENDER_DELAY_MS)!;
    expect(p.skaters[0]!.x).toBeCloseTo(0.375);
    expect(tl.latest?.at).toBe(1075);
  });
});
