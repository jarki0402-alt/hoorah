import { type Look, lookAt } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { seeded } from '../../shared/art/svg';
import { CookBrain, styleFor } from './brain';
import type { CookChip, Overlay } from './hud';
import { food, glass, type Item, plate } from './items';
import {
  COUNTDOWN_MS,
  type Difficulty,
  KITCHENS,
  type KitchenId,
  type Side,
  THROW_MS,
  TUNING,
} from './kitchens';
import { DapurMatch, type Flight, STEP_MS } from './logic';
import {
  applyMirror,
  type DapurMirror,
  decodeItem,
  EVENT_KEEP_MS,
  EVENTS_KEPT,
  encodeItem,
  FLIGHTS_MAX,
  FLOOR_MAX,
  flightAt,
  itemAt,
  type MirrorChef,
  MirrorFeed,
  type MirrorSource,
  MirrorStage,
  type MirrorState,
  MirrorTimeline,
  mirrorClocks,
  mirrorHud,
  newEvents,
  type RoundSource,
  stationAt,
} from './mirror';
import { type SetupInfo, setupPanel } from './panels';
import { STR } from './strings';

/** Server time is the game clock plus this (the Host's clock started at 0). */
const OFFSET = 5_000_000;
/** What one packet should stay under (JSON characters). */
const BUDGET = 6000;
const COLORS = ['#F2453D', '#2F8CFF', '#22B35E', '#FFC928', '#FF8A3D', '#FF5C9A', '#14B8A6', '#C4C7CC'];
const LOOKS: Look[] = [
  { c: 'leo', s: 3, h: 'nara', hc: 4, oc: 6 },
  { c: 'mia', s: 1, h: 'bima', hc: 2, oc: 3 },
];
const NONE: Overlay = { kind: 'none' };

function cooks(sides: readonly Side[], longNames = false) {
  return sides.map((side, i) => ({
    id: i + 1,
    // Twelve characters: the longest name a player can pick.
    name: longNames ? `Pemain Ke ${String(i + 1).padStart(2, '0')}` : `C${i + 1}`,
    fruit: 'nanas' as const,
    look: longNames ? LOOKS[i % LOOKS.length]! : lookAt(i),
    color: COLORS[i % COLORS.length]!,
    side,
  }));
}

interface Sim {
  m: DapurMatch;
  t: number;
  run(ms: number): void;
}

/** A computer-only match, as the Host runs it. */
function newSim(
  kitchen: KitchenId = 'terbelah',
  sides: Side[] = [0, 1],
  difficulty: Difficulty = 'normal',
): Sim {
  const m = new DapurMatch({ kitchen, difficulty, cooks: cooks(sides), now: 0, seed: 3 });
  const rnd = seeded(41);
  for (const c of m.chefs) m.setPilot(c.id, new CookBrain(styleFor(0.7), c.side, rnd));
  const sim: Sim = {
    m,
    t: 0,
    run(ms: number) {
      const end = sim.t + ms;
      while (sim.t < end - 1e-6) {
        sim.t += STEP_MS;
        m.step(sim.t);
        m.drainEvents();
      }
    },
  };
  return sim;
}

function round(sim: Sim, extra: Partial<RoundSource> = {}): RoundSource {
  return {
    match: sim.m,
    t: sim.t,
    overlay: NONE,
    hint: false,
    showResult: false,
    result: null,
    guide: null,
    ...extra,
  };
}

function source(sim: Sim, extra: Partial<RoundSource> = {}, held = false): MirrorSource {
  return { server: sim.t + OFFSET, held, setup: null, round: round(sim, extra) };
}

/** Through JSON, as the network carries it. */
const wire = (p: DapurMirror): unknown => JSON.parse(JSON.stringify(p));

function decode(p: DapurMirror): MirrorState {
  const s = applyMirror(wire(p));
  if (!s) throw new Error('packet rejected');
  return s;
}

const code = (it: Item | null): string => (it ? encodeItem(it) : '');

describe('item codes', () => {
  const items: Item[] = [
    food('tomat'),
    { k: 'food', food: 'kentang', chop: 0.37 },
    { k: 'food', food: 'selada', chop: 1 },
    plate(),
    plate(['roti', 'dagingMatang', 'tomatPotong', 'seladaPotong']),
    glass(),
    glass(0.5),
    { k: 'glass', fill: 1, over: 300 },
    { k: 'extinguisher' },
  ];

  it('round-trips every kind of item', () => {
    for (const it of items) {
      const back = decodeItem(encodeItem(it));
      expect(back).not.toBeNull();
      expect(encodeItem(back!)).toBe(encodeItem(it));
    }
    expect(decodeItem('h37')).toEqual({ k: 'food', food: 'kentang', chop: 0.37 });
    expect(decodeItem('G100!')).toEqual({ k: 'glass', fill: 1, over: 1 });
  });

  it('rejects malformed codes', () => {
    for (const bad of ['', 'z', 'a101', 'Paa', 'Pz', 'G101', 'G', 'X1', 'a-1', 42, null, 'PPPPPPPPP']) {
      expect(decodeItem(bad)).toBeNull();
    }
  });
});

describe('packing', () => {
  it('round-trips a busy kitchen through JSON', () => {
    const sim = newSim();
    sim.run(COUNTDOWN_MS + 40_000);
    const m = sim.m;
    const feed = new MirrorFeed(7);
    const s = decode(feed.pack(source(sim)));
    const r = s.round!;
    expect(s.epoch).toBe(7);
    expect(s.t).toBe(Math.round(sim.t + OFFSET));
    expect(r.kitchen).toBe('terbelah');
    expect(r.phase).toBe(m.phase);
    expect(r.score).toBe(m.score);
    expect(r.stars).toBe(m.stars());
    expect(r.thresholds).toEqual([...m.thresholds]);
    expect(r.left).toBe(Math.round(m.timeLeft(sim.t)));
    expect(r.chefs).toHaveLength(m.chefs.length);
    for (const c of m.chefs) {
      const back = r.chefs.find((x) => x.id === c.id)!;
      expect(back.x).toBeCloseTo(c.x, 2);
      expect(back.y).toBeCloseTo(c.y, 2);
      expect(back.side).toBe(c.side);
      expect(code(back.held)).toBe(code(c.held));
      expect(back.busy).toBe(c.busy);
      expect(back.target).toBe(c.target);
      expect(back.steer).toBe(false);
      expect(back.stains).toHaveLength(c.stains.length);
    }
    for (const st of m.stations) {
      const back = r.stations.find((x) => x.id === st.id);
      if (!back) {
        expect(st.item).toBeNull();
        expect(st.pot).toHaveLength(0);
        continue;
      }
      expect(code(back.item)).toBe(code(st.item));
      expect(back.pot).toEqual(st.pot);
      expect(back.level).toBeCloseTo(m.heatLevel(st), 2);
      expect(back.fire).toBe(st.fire);
      expect(back.plates).toBe(st.plates);
      expect(back.dirty).toBe(st.dirty);
    }
    expect(r.tickets.map((k) => k.id)).toEqual(m.orders.tickets.map((k) => k.id));
    for (const k of m.orders.tickets) {
      const back = r.tickets.find((x) => x.id === k.id)!;
      expect(back.dish).toBe(k.dish);
      expect(back.end).toBe(Math.round(k.t0 + k.waitMs - sim.t));
      expect(back.wait).toBe(Math.round(k.waitMs));
    }
    expect(r.floor).toHaveLength(Math.min(FLOOR_MAX, m.floor.length));
  });

  it('marks cooks a person steers, and the practice card and result', () => {
    const sim = newSim('warung', [0, 1]);
    sim.m.setPilot(1, null);
    sim.run(COUNTDOWN_MS + 2_000);
    const s = decode(
      new MirrorFeed(1).pack(
        source(sim, {
          overlay: { kind: 'guideGo' },
          guide: {
            info: {
              step: 'chop',
              index: 4,
              total: 10,
              waiting: false,
              helper: 'C2',
              button: 'work',
              ticket: false,
            },
            target: { kind: 'station', id: 3 },
          },
          showResult: true,
          result: {
            kitchen: 'warung',
            thresholds: sim.m.thresholds,
            stars: 2,
            score: 480,
            delivered: 5,
            missed: 1,
            tips: 40,
            awards: [{ playerId: 1, title: 'Juru Masak', desc: '5 pesanan', icon: 'zap' }],
            newBest: true,
          },
        }),
      ),
    );
    const r = s.round!;
    expect(r.chefs.find((c) => c.id === 1)!.steer).toBe(true);
    expect(r.chefs.find((c) => c.id === 2)!.steer).toBe(false);
    expect(r.overlay).toEqual({ kind: 'guideGo' });
    expect(r.guide?.info).toEqual({
      step: 'chop',
      index: 4,
      total: 10,
      waiting: false,
      helper: 'C2',
      button: 'work',
      ticket: false,
    });
    expect(r.guide?.target).toEqual({ kind: 'station', id: 3 });
    expect(r.result?.awards[0]).toEqual({ playerId: 1, title: 'Juru Masak', desc: '5 pesanan', icon: 'zap' });
    expect(r.result?.newBest).toBe(true);
    const hud = mirrorHud(s, s.t, mirrorClocks(s, s.t), () => ({ x: 10, y: 20, up: false }));
    expect(hud.mode).toBe('result');
    expect(hud.result?.awards[0]?.name).toBe('C1');
    expect(hud.guide?.arrow).toEqual({ x: 10, y: 20, up: false });
    expect(hud.guide?.sub).toBe(STR.guide.helper('C2'));
  });

  it('carries the setup screen and rebuilds it exactly', () => {
    const chip = (id: number): CookChip => ({
      id,
      name: `P${id}`,
      fruit: 'jeruk',
      look: LOOKS[id % 2]!,
      color: COLORS[id]!,
    });
    const info: SetupInfo = {
      step: 'sides',
      kitchen: 'terbelah',
      difficulty: 'heboh',
      humans: 3,
      best: { warung: 2, terbelah: 0, gerobak: 3, sibuk: 0 },
      sides: [[chip(1), chip(3)], [chip(2)]],
      everyone: [chip(1), chip(2), chip(3)],
      hostName: 'P1',
    };
    const feed = new MirrorFeed(3);
    const s = decode(feed.pack({ server: 1000, held: false, setup: info, round: null }));
    expect(s.round).toBeNull();
    expect(s.setup).toEqual(info);
    const hud = mirrorHud(s, 1000, mirrorClocks(s, 1000), () => null);
    expect(hud.mode).toBe('setup');
    expect(hud.setup).toEqual(setupPanel(info));
  });
});

describe('validation', () => {
  const sample = (): DapurMirror => {
    const sim = newSim();
    sim.run(COUNTDOWN_MS + 25_000);
    const feed = new MirrorFeed(9);
    feed.float({ text: 'Gosong!', x: 3, y: 1, color: '#A8ABB2', size: 30, world: false });
    feed.mark({ kind: 'pop', x: 2, y: 2, color: '#FFFFFF' });
    return feed.pack(source(sim));
  };

  it('accepts a real packet', () => {
    expect(applyMirror(wire(sample()))).not.toBeNull();
  });

  it('rejects malformed packets', () => {
    const bad: ((p: Record<string, unknown>) => void)[] = [
      (p) => {
        p.v = 2;
      },
      (p) => {
        p.t = 'soon';
      },
      (p) => {
        p.r = null;
        p.su = null;
      },
      (p) => {
        p.ev = [[1, 'f', 'x', '', 0, 0, 'red', 30, 0]];
      },
      (p) => {
        // An event newer than the newest number.
        p.en = 0;
      },
      (p) => {
        p.ev = [
          [2, 'm'],
          [1, 'm'],
        ];
        p.en = 2;
      },
      (p) => {
        p.ev = Array.from({ length: EVENTS_KEPT + 1 }, (_, i) => [i + 1, 'x']);
        p.en = EVENTS_KEPT + 1;
      },
    ];
    const round = (p: Record<string, unknown>) => p.r as Record<string, unknown>;
    const chef = (p: Record<string, unknown>) => (round(p).ck as unknown[][])[0]!;
    const roundBad: ((p: Record<string, unknown>) => void)[] = [
      (p) => {
        round(p).k = 'dapurku';
      },
      (p) => {
        round(p).ph = 'lunch';
      },
      (p) => {
        round(p).th = [1, 2];
      },
      (p) => {
        chef(p)[4] = 'red';
      },
      (p) => {
        chef(p)[6] = 99_999;
      },
      (p) => {
        chef(p)[1] = 'x'.repeat(41);
      },
      (p) => {
        chef(p)[10] = 'Q';
      },
      (p) => {
        chef(p)[3] = { c: 'nobody' };
      },
      (p) => {
        chef(p)[15] = 'abc';
      },
      (p) => {
        (round(p).sn as unknown[]).push([999, '', '', 0, 0, 0, 0, 0]);
      },
      (p) => {
        (round(p).sn as unknown[]).push([1, '', 'zz', 0, 0, 0, 0, 0]);
      },
      (p) => {
        round(p).fl = Array.from({ length: FLOOR_MAX + 1 }, (_, i) => [i, 'a', 100, 100]);
      },
      (p) => {
        round(p).fx = [[1, 'a', 1, -1, -1, 0, 0, 100, 100, 0, 0, '#FFFFFF']];
      },
      (p) => {
        round(p).tk = [[1, 'rendang', [], 1000, 1000]];
      },
      (p) => {
        round(p).ov = ['c', 'tiga'];
      },
      (p) => {
        round(p).gd = ['dance', 0, 10, 0, '', '', 0, '', -1];
      },
      (p) => {
        round(p).res = [4, 0, 0, 0, 0, 0, []];
      },
    ];
    for (const mutate of [...bad, ...roundBad]) {
      const p = wire(sample()) as Record<string, unknown>;
      mutate(p);
      expect(applyMirror(p)).toBeNull();
    }
    for (const junk of [null, undefined, 42, 'x', [], {}, { v: 1 }]) expect(applyMirror(junk)).toBeNull();
  });

  it('never throws on random damage', () => {
    const rnd = seeded(5);
    const junk: unknown[] = [null, -1, 1e12, Number.NaN, 'x', '', [], {}, [1, 2], true, 'G100!', 0.5];
    const base = JSON.stringify(sample());
    for (let n = 0; n < 300; n++) {
      const p = JSON.parse(base) as unknown;
      // Walk to a random leaf and replace it.
      let node = p as Record<string, unknown> | unknown[];
      for (let depth = 0; depth < 6; depth++) {
        const keys = Object.keys(node);
        if (keys.length === 0) break;
        const key = keys[Math.floor(rnd() * keys.length)]!;
        const next = (node as Record<string, unknown>)[key];
        if (typeof next !== 'object' || next === null || rnd() < 0.25) {
          (node as Record<string, unknown>)[key] = junk[Math.floor(rnd() * junk.length)];
          break;
        }
        node = next as Record<string, unknown>;
      }
      expect(() => applyMirror(p)).not.toThrow();
    }
  });
});

describe('effects', () => {
  it('numbers effects and repeats them for about a second', () => {
    const sim = newSim();
    sim.run(COUNTDOWN_MS + 1_000);
    const feed = new MirrorFeed(2);
    feed.float({
      text: STR.missed,
      sub: STR.penalty(20),
      x: 640,
      y: 150,
      color: '#FF6B5E',
      size: 30,
      world: true,
    });
    feed.mark({ kind: 'throw', id: 1 });
    expect(feed.pending).toBe(true);
    const first = decode(feed.pack(source(sim)));
    expect(feed.pending).toBe(false);
    expect(first.events.map((e) => e.type)).toEqual(['float', 'throw']);
    const f = first.events[0]!;
    expect(f).toMatchObject({ type: 'float', text: STR.missed, sub: '-20', x: 640, y: 150, world: true });
    sim.run(500);
    feed.flash();
    const again = decode(feed.pack(source(sim)));
    expect(again.events.map((e) => e.n)).toEqual([1, 2, 3]);
    expect(newEvents(again, first.eventTop).map((e) => e.type)).toEqual(['flash']);
    sim.run(EVENT_KEEP_MS);
    const later = decode(feed.pack(source(sim)));
    expect(later.events.map((e) => e.n)).toEqual([3]);
    sim.run(EVENT_KEEP_MS);
    expect(decode(feed.pack(source(sim))).events).toHaveLength(0);
  });

  it('keeps floats on kitchen spots in tiles', () => {
    const sim = newSim();
    const feed = new MirrorFeed(2);
    feed.float({
      text: STR.served(150),
      sub: STR.tip(20),
      x: 10.5,
      y: 6.2,
      color: '#5BE08F',
      size: 40,
      world: false,
    });
    const e = decode(feed.pack(source(sim))).events[0]!;
    expect(e).toMatchObject({ type: 'float', x: 10.5, y: 6.2, size: 40, world: false, sub: 'tip +20' });
  });
});

describe('playback', () => {
  const chef = (over: Partial<MirrorChef>): MirrorChef => ({
    id: 1,
    name: 'A',
    fruit: 'jeruk',
    look: { c: 'leo' },
    color: '#F2453D',
    side: 0,
    x: 2,
    y: 2,
    faceX: 1,
    moving: true,
    staggered: false,
    steer: true,
    held: null,
    busy: null,
    jobMs: 0,
    target: null,
    hitAgo: null,
    stains: [],
    ...over,
  });

  it('blends cooks, progress and throws between packets', () => {
    const sim = newSim('warung');
    sim.run(COUNTDOWN_MS + 3_000);
    const feed = new MirrorFeed(4);
    const c = sim.m.chefs[0]!;
    c.x = 3;
    c.y = 2;
    c.held = { k: 'food', food: 'tomat', chop: 0.2 };
    const fryer = sim.m.stations.find((s) => s.kind === 'fryer')!;
    fryer.item = food('kentangPotong');
    fryer.cookMs = 1_000;
    const flight: Flight = {
      id: 77,
      item: food('roti'),
      from: 1,
      toChef: 2,
      toStation: null,
      sx: 3,
      sy: 2,
      ex: 8,
      ey: 4,
      t0: sim.t - 100,
      dur: THROW_MS,
      color: '#F2453D',
    };
    sim.m.flights.push(flight);
    const a = decode(feed.pack(source(sim)));
    sim.t += 60;
    c.x = 3.6;
    c.held = { k: 'food', food: 'tomat', chop: 0.3 };
    fryer.cookMs = 1_060;
    flight.ex = 9;
    const b = decode(feed.pack(source(sim)));

    const stage = new MirrorStage('warung', 'normal');
    stage.apply({ a, b, k: 0.5 });
    const view = stage.chef(1)!;
    expect(view.x).toBeCloseTo(3.3, 5);
    expect(view.y).toBeCloseTo(2, 5);
    expect(view.prevX).toBe(view.x);
    expect(view.held).toEqual({ k: 'food', food: 'tomat', chop: 0.25 });
    const st = stage.stations[fryer.id]!;
    expect(st.item).toEqual(food('kentangPotong'));
    expect(stage.heatLevel(st)).toBeCloseTo(1_030 / 6_000, 3);
    expect(stage.flights).toHaveLength(1);
    const f = stage.flights[0]!;
    // Start on the server clock, landing point halfway to the catcher's newer spot.
    expect(f.t0).toBe(a.t - 100);
    expect(f.ex).toBeCloseTo(8.5, 5);
    // A station not in the packet is empty on the far-away screen.
    const rack = stage.stations.find((s) => s.kind === 'rack')!;
    expect(rack.plates).toBe(sim.m.stations[rack.id]!.plates);
    expect(stage.stations.filter((s) => s.item !== null).length).toBe(
      sim.m.stations.filter((s) => s.item !== null).length,
    );
  });

  it('snaps a cook that jumped instead of gliding', () => {
    const stage = new MirrorStage('warung', 'normal');
    const sim = newSim('warung', [0]);
    sim.run(COUNTDOWN_MS + 100);
    const feed = new MirrorFeed(4);
    const a = decode(feed.pack(source(sim)));
    sim.t += 60;
    sim.m.place(1, 11, 5);
    const b = decode(feed.pack(source(sim)));
    stage.apply({ a, b, k: 0.9 });
    expect(stage.chef(1)!.x).toBeCloseTo(a.round!.chefs[0]!.x, 5);
    expect(stage.chef(1)!.walked).toBeLessThan(1.5);
  });

  it('blend helpers keep resets and other items as they are', () => {
    const chop = { k: 'food', food: 'tomat', chop: 0.8 } as const;
    expect(itemAt(chop, { k: 'food', food: 'tomat', chop: 0.1 }, 0.5)).toBe(chop);
    expect(itemAt(chop, food('tomatPotong'), 0.5)).toBe(chop);
    expect(itemAt(glass(0.2), glass(0.4), 0.5)).toEqual(glass(0.30000000000000004));
    const st = { id: 1, item: null, pot: [], level: 0.9, fire: false, douseMs: 0, dirty: 0, plates: 0 };
    expect(stationAt(st, { ...st, level: 1.1 }, 0.5).level).toBeCloseTo(1, 5);
    expect(stationAt(st, { ...st, level: 0 }, 0.5).level).toBe(0.9);
    const fl = {
      id: 1,
      item: food('roti'),
      from: 1,
      toChef: null,
      toStation: 4,
      sx: 1,
      sy: 1,
      ex: 5,
      ey: 1,
      t0: -50,
      dur: 600,
      color: '#FFFFFF',
    };
    expect(flightAt(fl, undefined, 0.5, 1000)).toMatchObject({ t0: 950, ex: 5, toStation: 4 });
    expect(chef({}).x).toBe(2);
  });

  it('plays packets a little behind server time, snapping on a new phase', () => {
    const sim = newSim('warung');
    sim.run(COUNTDOWN_MS + 500);
    const feed = new MirrorFeed(5);
    const tl = new MirrorTimeline();
    let first = true;
    for (let i = 0; i < 10; i++) {
      sim.run(60);
      const s = decode(feed.pack(source(sim)));
      const snap = tl.push(s, s.t + 40);
      expect(snap).toBe(first);
      first = false;
    }
    const latest = tl.latest!;
    const span = tl.sample(latest.t + 40)!;
    expect(span.a.t).toBeLessThanOrEqual(span.b.t);
    expect(span.a.t).toBeLessThan(latest.t);
    // Pausing is a new stretch: shown at once.
    const held = decode(feed.pack(source(sim, {}, true)));
    expect(tl.push(held, held.t + 40)).toBe(true);
  });
});

describe('clocks', () => {
  it('counts down and runs the round clock on server time, frozen while held', () => {
    const sim = newSim('warung', [0, 1]);
    sim.run(1_000);
    const feed = new MirrorFeed(6);
    const s = decode(feed.pack(source(sim, { overlay: { kind: 'count', value: 2 } })));
    expect(mirrorClocks(s, s.t + 100).overlay).toEqual({ kind: 'count', value: 2 });
    expect(mirrorClocks(s, s.t + 1_500).overlay).toEqual({ kind: 'count', value: 1 });
    expect(mirrorClocks(s, s.t + 2_100).overlay).toEqual({ kind: 'go' });
    sim.run(COUNTDOWN_MS + 5_000);
    const p = decode(feed.pack(source(sim)));
    const left = p.round!.left;
    expect(mirrorClocks(p, p.t + 1_000).left).toBe(left - 1_000);
    const h = decode(feed.pack(source(sim, {}, true)));
    expect(mirrorClocks(h, h.t + 1_000).left).toBe(h.round!.left);
  });

  it('drains ticket patience from the deadlines, full while practising', () => {
    const sim = newSim('warung', [0, 1]);
    sim.run(COUNTDOWN_MS + 1_000);
    const feed = new MirrorFeed(6);
    const s = decode(feed.pack(source(sim)));
    const k = s.round!.tickets[0]!;
    const hud = mirrorHud(s, s.t + 1_000, mirrorClocks(s, s.t + 1_000), () => null);
    expect(hud.play?.tickets[0]?.left).toBeCloseTo((k.end - 1_000) / k.wait, 5);
    const pm = new DapurMatch({
      kitchen: 'warung',
      difficulty: 'normal',
      cooks: cooks([0]),
      now: 0,
      practice: true,
    });
    const ps: Sim = { m: pm, t: 0, run: () => undefined };
    for (let t = STEP_MS; t < COUNTDOWN_MS + 2_000; t += STEP_MS) pm.step(t);
    ps.t = COUNTDOWN_MS + 2_000;
    const pr = decode(feed.pack(source(ps)));
    expect(pr.round!.practice).toBe(true);
    const ph = mirrorHud(pr, pr.t + 60_000, mirrorClocks(pr, pr.t + 60_000), () => null);
    expect(ph.play?.tickets[0]?.left).toBe(1);
    expect(ph.play?.score).toBe('0');
  });
});

describe('size', () => {
  const kitchenWithMostStations = (): KitchenId => {
    let best: KitchenId = 'warung';
    let most = 0;
    for (const k of KITCHENS) {
      const n = new DapurMatch({ kitchen: k, difficulty: 'heboh', cooks: [], now: 0 }).stations.length;
      if (n > most) {
        most = n;
        best = k;
      }
    }
    return best;
  };

  it('stays under budget with a full kitchen, every station busy and the most cooks', () => {
    const kitchen = kitchenWithMostStations();
    const sides: Side[] = [0, 1, 0, 1, 0, 1, 0, 1];
    const m = new DapurMatch({ kitchen, difficulty: 'heboh', cooks: cooks(sides, true), now: 0, seed: 1 });
    for (let t = STEP_MS; t < COUNTDOWN_MS + 30_000; t += STEP_MS) m.step(t);
    const t = COUNTDOWN_MS + 30_000;
    const full = (): Item => plate(['roti', 'dagingMatang', 'tomatPotong', 'seladaPotong']);
    m.chefs.forEach((c, i) => {
      c.held = i % 2 ? full() : { k: 'glass', fill: 0.47, over: 100 };
      c.stains = Array.from({ length: 6 }, (_, j) => ({
        kind: 'tomat' as const,
        u: -0.9 + j * 0.3,
        v: 0.5,
        s: 1.1,
      }));
      c.busy = 'wash';
      c.jobMs = 1234;
      c.hitAt = t - 500;
      c.target = 3;
      c.moving = true;
    });
    for (const s of m.stations) {
      s.item = s.kind === 'board' ? { k: 'food', food: 'kentang', chop: 0.55 } : full();
      s.pot = s.kind === 'wok' ? ['nasi', 'telur'] : [];
      s.fire = s.kind === 'stove';
      s.douseMs = s.fire ? 600 : 0;
      s.dirty = s.kind === 'sink' ? 7 : 0;
      s.plates = s.kind === 'rack' ? 12 : 0;
    }
    for (let i = 0; i < FLOOR_MAX + 6; i++) m.dropFloor(full(), 2 + (i % 8), 1 + (i % 4));
    for (let i = 0; i < FLIGHTS_MAX + 3; i++) {
      m.flights.push({
        id: 1000 + i,
        item: full(),
        from: 1,
        toChef: 2,
        toStation: null,
        sx: 2.37,
        sy: 3.51,
        ex: 11.29,
        ey: 4.73,
        t0: t - 123,
        dur: THROW_MS,
        color: '#FF5C9A',
      });
    }
    m.orders.tickets.length = 0;
    for (let i = 0; i < 4; i++) {
      m.orders.tickets.push({
        id: 100 + i,
        dish: 'paket',
        t0: t - 2000,
        waitMs: 91_000,
        got: ['burger', 'soda'],
      });
    }
    const feed = new MirrorFeed(123_456_789);
    for (let i = 0; i < EVENTS_KEPT + 4; i++) {
      if (i % 3 === 0)
        feed.float({
          text: STR.served(150),
          sub: STR.tip(45),
          x: 10.5,
          y: 6.2,
          color: '#5BE08F',
          size: 40,
          world: false,
        });
      else if (i % 3 === 1)
        feed.float({ text: STR.wrongDish, x: 11, y: 6.2, color: '#FF6B5E', size: 22, world: false });
      else feed.mark({ kind: 'pop', x: 4.45, y: 6.1, color: '#8BD46E' });
    }
    const packet = feed.pack({
      server: t + OFFSET,
      held: false,
      setup: null,
      round: {
        match: m,
        t,
        overlay: { kind: 'warning' },
        hint: true,
        showResult: false,
        result: {
          kitchen,
          thresholds: m.thresholds,
          stars: 3,
          score: 12_345,
          delivered: 40,
          missed: 3,
          tips: 900,
          awards: [1, 2, 3, 4].map((id) => ({
            playerId: id,
            title: STR.awards.deliveries.title,
            desc: STR.awards.deliveries.desc(12),
            icon: 'zap' as const,
          })),
          newBest: true,
        },
        guide: {
          info: {
            step: 'serve',
            index: 9,
            total: 10,
            waiting: true,
            helper: 'Pemain Ke 02',
            button: 'grab',
            ticket: false,
          },
          target: { kind: 'chef', id: 2 },
        },
      },
    });
    const size = JSON.stringify(packet).length;
    expect(size).toBeLessThan(BUDGET);
    const s = decode(packet);
    expect(s.round!.chefs).toHaveLength(8);
    expect(s.round!.stations).toHaveLength(m.stations.length);
    expect(s.round!.floor).toHaveLength(FLOOR_MAX);
    expect(s.round!.flights).toHaveLength(FLIGHTS_MAX);
    expect(s.events).toHaveLength(EVENTS_KEPT);
  });

  it('stays small in an ordinary round', () => {
    const sim = newSim('terbelah', [0, 1, 0, 1]);
    const feed = new MirrorFeed(1);
    let most = 0;
    for (let i = 0; i < 60; i++) {
      sim.run(1_000);
      most = Math.max(most, JSON.stringify(feed.pack(source(sim))).length);
    }
    expect(most).toBeLessThan(3_000);
    expect(TUNING.normal.roundMs).toBeGreaterThan(0);
  });
});
