import { FRUITS, type Look, PLAYER_COLORS, type PlayerInfo } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { seeded } from '../../shared/art/svg';
import { fieldSkills, Sensors, SnakeBrain } from './brain';
import type { Overlay } from './hud';
import { type ArenaEvent, ArenaMatch, DEFAULT_TUNING, PELLET_FREE, type Snake, type Tuning } from './logic';
import {
  type ArenaMirror,
  applyMirror,
  bodyDepth,
  MirrorFeed,
  type MirrorState,
  MirrorTimeline,
  mirrorClocks,
  mirrorHud,
  newEvents,
  PACKET_MAX,
  RECENT_POINTS,
} from './mirror';
import { CLOCK_AHEAD_MAX_MS } from './playout';
import { RemoteStage, RemoteTrail, sampleTrail } from './remote';

const STEP = 1000 / 60;
const T = DEFAULT_TUNING;
/** Server time is match time plus this. */
const OFFSET = 7_000_000;
/** Steps between two packets (about 67 ms, like the Host's 60 ms throttle on a 60 fps screen). */
const STEPS_PER_PACKET = 4;
const NONE: Overlay = { kind: 'none' };
const RECT = { x: 0, y: 0, w: 100, h: 100 };
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
    color: PLAYER_COLORS[i % PLAYER_COLORS.length]!,
    connected: true,
    isHost: i === 0,
  }));
}

interface Sim {
  m: ArenaMatch;
  feed: MirrorFeed;
  brains: Map<number, SnakeBrain>;
  sensors: Sensors;
  events: ArenaEvent[];
}

/** A computer-only match of `n` snakes, as the Host runs it, already playing. */
function newSim(n: number, seed = 7, tuning: Partial<Tuning> = {}, roundMs = 180_000): Sim {
  const m = new ArenaMatch({ roundMs, aspect: 1.6, rnd: seeded(seed), tuning });
  m.setPlayers(players(n));
  const brains = new Map<number, SnakeBrain>();
  const skills = fieldSkills(0.7, n);
  const think = seeded(seed * 31 + 1);
  for (const s of m.all) brains.set(s.id, new SnakeBrain(skills[brains.size] ?? 0.6, think));
  const sim: Sim = { m, feed: new MirrorFeed(42), brains, sensors: new Sensors(), events: [] };
  steps(sim, Math.ceil((T.introMs + 3 * T.countMs + 50) / STEP));
  expect(m.phase).toBe('play');
  return sim;
}

function steps(sim: Sim, count: number): void {
  const m = sim.m;
  for (let i = 0; i < count; i++) {
    if (m.phase === 'play') {
      for (const [id, brain] of sim.brains) {
        const s = m.snake(id);
        if (!s) continue;
        const cmd = brain.update(m, s, sim.sensors);
        m.setInput(id, cmd.turn, cmd.boost);
      }
    }
    m.update(STEP);
    for (const e of m.drainEvents()) {
      sim.feed.note(e);
      sim.events.push(e);
    }
  }
}

function pack(sim: Sim, overlay: Overlay = NONE, held = false): ArenaMirror {
  return sim.feed.pack({ match: sim.m, server: sim.m.now + OFFSET, overlay, held });
}

/** Through JSON, like the network. */
const wire = (p: ArenaMirror): unknown => JSON.parse(JSON.stringify(p));

/** Plays a packet on a far-away stage at the Host's own moment (no playback delay). */
function deliver(stage: RemoteStage, raw: unknown): { s: MirrorState; eaten: number } {
  const s = applyMirror(raw);
  if (!s) throw new Error('packet refused');
  stage.receive(s);
  stage.now = s.t;
  const eaten = stage.apply(s).length;
  stage.place({ a: s, b: s, k: 0 });
  return { s, eaten };
}

/** Runs `packets` packets of play, delivering the ones `keep` lets through. */
function play(
  sim: Sim,
  stage: RemoteStage,
  packets: number,
  keep: (i: number) => boolean = () => true,
): number {
  let eaten = 0;
  for (let i = 0; i < packets; i++) {
    steps(sim, STEPS_PER_PACKET);
    const p = wire(pack(sim));
    if (keep(i)) eaten += deliver(stage, p).eaten;
  }
  return eaten;
}

const hostBuf = new Float32Array(8000);
const farBuf = new Float32Array(8000);

/** Largest gap between the Host's body samples and the far-away screen's, per snake. */
function bodyError(m: ArenaMatch, stage: RemoteStage, s: Snake): { count: number; far: number; err: number } {
  const r = stage.snake(s.id);
  if (!r) return { count: -1, far: -1, err: Number.POSITIVE_INFINITY };
  const n = m.sampleBody(s, 2, hostBuf);
  const f = stage.sampleBody(r, 2, farBuf);
  let err = 0;
  // The last sample is the tail end, whose drawn length is rounded to 1/8.
  const upto = Math.min(n, f) - 1;
  for (let i = 0; i < upto; i++) {
    err = Math.max(
      err,
      Math.hypot(hostBuf[i * 2]! - farBuf[i * 2]!, hostBuf[i * 2 + 1]! - farBuf[i * 2 + 1]!),
    );
  }
  return { count: n, far: f, err };
}

function expectBodies(m: ArenaMatch, stage: RemoteStage): void {
  let checked = 0;
  for (const s of m.field()) {
    const r = stage.snake(s.id);
    expect(r?.alive).toBe(s.alive);
    if (!s.alive) continue;
    const b = bodyError(m, stage, s);
    expect(Math.abs(b.count - b.far)).toBeLessThanOrEqual(1);
    expect(b.err).toBeLessThan(0.6);
    checked++;
  }
  expect(checked).toBeGreaterThan(0);
}

/** Seeds on both sides: same slots, values and colours; positions equal unless a head is pulling. */
function expectSeeds(m: ArenaMatch, stage: RemoteStage): void {
  const P = m.pellets;
  const R = stage.pellets;
  const heads = m.field().filter((s) => s.alive);
  for (let i = 0; i < P.span; i++) {
    const host = P.kind[i] !== PELLET_FREE;
    expect(R.kind[i] !== PELLET_FREE, `slot ${i}`).toBe(host);
    if (!host) continue;
    expect(R.value[i]).toBe(P.value[i]);
    expect(R.color[i]).toBe(P.color[i]);
    const pulled = heads.some(
      (s) => Math.hypot(s.x - P.x[i]!, s.y - P.y[i]!) < s.radius * 1.3 + P.r[i]! + T.magnet + 2,
    );
    if (!pulled) {
      expect(Math.abs(R.x[i]! - Math.round(P.x[i]!))).toBeLessThan(1e-6);
      expect(Math.abs(R.y[i]! - Math.round(P.y[i]!))).toBeLessThan(1e-6);
    }
  }
}

describe('arena mirror', () => {
  it('round-trips snakes, standings, overlay and the HUD', () => {
    const sim = newSim(4);
    const stage = new RemoteStage();
    play(sim, stage, 60);
    const m = sim.m;
    const p = pack(sim, { kind: 'warning' });
    const { s } = deliver(stage, wire(p));
    expect(s.epoch).toBe(42);
    expect(s.t).toBe(Math.round(m.now + OFFSET));
    expect(s.phase).toBe('play');
    expect(s.width).toBe(m.width);
    expect(s.height).toBe(m.height);
    expect(s.left).toBe(Math.round(m.timeLeft()));
    expect(s.overlay).toEqual({ kind: 'warning' });
    const order = m.order();
    expect(s.snakes.map((r) => r.id)).toEqual(order.map((o) => o.id));
    for (const host of order) {
      const r = s.snakes.find((x) => x.id === host.id)!;
      expect(r.name).toBe(host.name);
      expect(r.look).toEqual(host.look);
      expect(r.color).toBe(host.color);
      expect(r.alive).toBe(host.alive);
      expect(r.kos).toBe(host.kos);
      expect(r.len).toBe(host.alive ? m.shown(host.len) : 0);
      if (!host.alive) continue;
      expect(Math.abs(r.x - host.x)).toBeLessThanOrEqual(0.125);
      expect(Math.abs(r.y - host.y)).toBeLessThanOrEqual(0.125);
      expect(r.serial).toBe(host.serial);
      expect(Math.abs(r.bodyLen - host.bodyLen)).toBeLessThanOrEqual(1 / 16);
      expect(r.recent.xs.length).toBe(Math.min(bodyDepth(host), RECENT_POINTS));
    }
    const hud = mirrorHud(s, mirrorClocks(s, s.t), RECT, RECT);
    expect(hud.rows.map((r) => r.id)).toEqual(order.map((o) => o.id));
    expect(hud.rows.map((r) => r.len)).toEqual(order.map((o) => (o.alive ? m.shown(o.len) : 0)));
    expect(hud.overlay).toEqual({ kind: 'warning' });
    expect(hud.timer).toMatch(/^\d:\d\d$/);
  });

  it('carries the podium with its places', () => {
    const sim = newSim(3);
    const stage = new RemoteStage();
    play(sim, stage, 5);
    const order = sim.m.order();
    const places = order.map((s, i) => ({
      id: s.id,
      name: s.name,
      look: s.look,
      color: s.color,
      rank: i + 1,
      len: 10 * (3 - i),
      kos: i,
    }));
    const { s } = deliver(stage, wire(pack(sim, { kind: 'podium', title: 'Juara', sub: 'Hebat', places })));
    // On the podium the clocks leave the packet's overlay alone.
    const hud = mirrorHud(s, { left: 0, urgent: false, overlay: null }, RECT, RECT);
    expect(hud.overlay).toEqual({ kind: 'podium', title: 'Juara', sub: 'Hebat', places });
  });

  it('rejects malformed packets', () => {
    const sim = newSim(3);
    const stage = new RemoteStage();
    play(sim, stage, 20);
    const good = wire(pack(sim)) as Record<string, unknown>;
    expect(applyMirror(good)).not.toBeNull();
    const bad = (patch: (j: Record<string, unknown>) => void): unknown => {
      const j = JSON.parse(JSON.stringify(good)) as Record<string, unknown>;
      patch(j);
      return j;
    };
    const sn = (j: Record<string, unknown>) => j.sn as unknown[][];
    const cases: unknown[] = [
      null,
      42,
      'x',
      [],
      {},
      bad((j) => {
        j.v = 2;
      }),
      bad((j) => {
        j.ph = 'later';
      }),
      bad((j) => {
        j.w = 'wide';
      }),
      bad((j) => {
        j.w = 1e9;
      }),
      bad((j) => {
        j.left = -5;
      }),
      bad((j) => {
        j.go = 1e9;
      }),
      bad((j) => {
        j.hold = 1;
      }),
      bad((j) => {
        j.ov = ['zzz'];
      }),
      bad((j) => {
        j.ov = ['c', 99];
      }),
      bad((j) => {
        j.lead = 'me';
      }),
      bad((j) => {
        j.pal = [-1];
      }),
      bad((j) => {
        j.bd = [];
      }),
      bad((j) => {
        sn(j)[0]![3] = 'red';
      }),
      bad((j) => {
        sn(j)[0]![2] = { c: 'nobody' };
      }),
      bad((j) => {
        sn(j)[0]![4] = Number.NaN;
      }),
      bad((j) => {
        sn(j)[0]![4] = 1e9;
      }),
      bad((j) => {
        sn(j)[0]![12] = 99;
      }),
      bad((j) => {
        sn(j)[0]!.pop();
      }),
      bad((j) => {
        sn(j)[1]![0] = sn(j)[0]![0];
      }),
      bad((j) => {
        (j.bd as string[])[0] = '!!';
      }),
      bad((j) => {
        j.sn = Array.from({ length: 17 }, () => sn(j)[0]);
        j.bd = Array.from({ length: 17 }, () => '');
      }),
      bad((j) => {
        j.kb = [[1, 10, '#']];
      }),
      bad((j) => {
        j.pd = [[1, 'AAAA']];
        j.pn = 0;
      }),
      bad((j) => {
        // Slot past the pool.
        j.pd = [[1, '/////B']];
        j.pn = 1;
      }),
      bad((j) => {
        // An added seed with a colour code past the palette.
        j.pd = [[1, 'BKKAfA']];
        j.pn = 1;
        j.pal = [];
      }),
      bad((j) => {
        j.pb = [[99, '']];
      }),
      bad((j) => {
        j.ev = [
          [2, 'w'],
          [1, 'w'],
        ];
        j.en = 2;
      }),
      bad((j) => {
        j.ev = [[3, 'w']];
        j.en = 2;
      }),
      bad((j) => {
        j.ev = [[1, 'k', 1, null, 'lava', 10, 10, 5]];
        j.en = 1;
      }),
      bad((j) => {
        j.ev = [[1, 'z', 1]];
        j.en = 1;
      }),
    ];
    for (const c of cases) expect(applyMirror(c)).toBeNull();
  });

  it('rebuilds every body and the seed pool exactly while nothing is lost', () => {
    const sim = newSim(6, 11);
    const stage = new RemoteStage();
    const eaten = play(sim, stage, 300);
    expectBodies(sim.m, stage);
    expectSeeds(sim.m, stage);
    expect(stage.pellets.missed).toBe(0);
    // Every bite on the Host is replayed (after the first packet).
    const hostEats = sim.events.filter((e) => e.type === 'eat').length;
    expect(eaten).toBeGreaterThan(0);
    expect(eaten).toBeLessThanOrEqual(hostEats);
    expect(eaten).toBeGreaterThan(hostEats * 0.95);
  });

  it('reconstructs a body along its trail like the match does', () => {
    const sim = newSim(2, 5);
    const stage = new RemoteStage();
    play(sim, stage, 200);
    for (const s of sim.m.field()) {
      if (!s.alive) continue;
      const r = stage.snake(s.id)!;
      for (const step of [1, 2, 3]) {
        const n = sim.m.sampleBody(s, step, hostBuf);
        const f = stage.sampleBody(r, step, farBuf);
        expect(Math.abs(n - f)).toBeLessThanOrEqual(1);
        for (let i = 0; i < Math.min(n, f) - 1; i++) {
          expect(Math.abs(hostBuf[i * 2]! - farBuf[i * 2]!)).toBeLessThan(0.6);
          expect(Math.abs(hostBuf[i * 2 + 1]! - farBuf[i * 2 + 1]!)).toBeLessThan(0.6);
        }
      }
    }
  });

  it('bridges a missing trail point and stops where nothing older is known', () => {
    const tr = new RemoteTrail();
    // A straight line along x, one point every 8 units: point n at x = 8n.
    const xs = Array.from({ length: 10 }, (_, k) => 8 * (9 - k));
    tr.put({ top: 9, xs, ys: xs.map(() => 0) });
    const out = new Float32Array(64);
    const full = sampleTrail(tr, 76, 0, 9 * 8 + 4, 9, 1, out);
    expect(full).toBe(10);
    expect(Array.from(out.slice(0, 6))).toEqual([76, 0, 68, 0, 60, 0]);
    // Forget point 5: the samples around it are bridged by points 4 and 6 (still on the line).
    const holed = new RemoteTrail();
    holed.put({ top: 9, xs: xs.slice(0, 4), ys: [0, 0, 0, 0] });
    holed.put({ top: 4, xs: xs.slice(5), ys: [0, 0, 0, 0, 0] });
    expect(sampleTrail(holed, 76, 0, 9 * 8 + 4, 9, 1, out)).toBe(10);
    expect(out[10]).toBeCloseTo(36);
    // Only the newest three points: the body stops after them.
    const short = new RemoteTrail();
    short.put({ top: 9, xs: xs.slice(0, 3), ys: [0, 0, 0] });
    expect(sampleTrail(short, 76, 0, 9 * 8 + 4, 9, 1, out)).toBe(3);
  });

  it('heals bodies and seeds after lost packets and an outage', () => {
    const sim = newSim(6, 23);
    const stage = new RemoteStage();
    const rnd = seeded(99);
    play(sim, stage, 40);
    // A third of the packets lost for a while, then 1.5 s of nothing at all.
    play(sim, stage, 120, () => rnd() > 0.35);
    play(sim, stage, 22, () => false);
    // About 4 s of a clean link: two full band cycles.
    play(sim, stage, 60);
    expect(stage.pellets.missed).toBeGreaterThan(0);
    expectBodies(sim.m, stage);
    expectSeeds(sim.m, stage);
  });

  it('applies a lost seed change from the next packet, and never lets an old change undo a band', () => {
    const sim = newSim(4, 3);
    const stage = new RemoteStage();
    play(sim, stage, 30);
    // One packet lost: the next carries its changes again.
    steps(sim, STEPS_PER_PACKET);
    pack(sim);
    play(sim, stage, 1);
    expect(stage.pellets.missed).toBe(0);
    expectSeeds(sim.m, stage);
    // An old packet arriving late changes nothing.
    const old = wire(pack(sim));
    play(sim, stage, 10);
    const s = applyMirror(old)!;
    stage.apply(s);
    expectSeeds(sim.m, stage);
  });

  it('catches up a screen that connects late within about a second', () => {
    const sim = newSim(6, 31);
    const early = new RemoteStage();
    play(sim, early, 400);
    const late = new RemoteStage();
    sim.feed.resync();
    play(sim, late, 16);
    expectBodies(sim.m, late);
    expectSeeds(sim.m, late);
  });

  it('starts over for a new match from the Host', () => {
    const a = newSim(3, 1);
    const stage = new RemoteStage();
    play(a, stage, 30);
    const b = newSim(2, 2);
    b.feed = new MirrorFeed(77);
    play(b, stage, 40);
    expect(stage.epoch).toBe(77);
    expect(stage.all.filter((s) => !s.gone).map((s) => s.id)).toEqual(b.m.field().map((s) => s.id));
    expectBodies(b.m, stage);
    expectSeeds(b.m, stage);
  });

  it('replays effect events once, from the packet that brought them', () => {
    const sim = newSim(8, 13);
    const stage = new RemoteStage();
    let seen: number | null = null;
    let kos = 0;
    const played = new Set<number>();
    for (let i = 0; i < 900; i++) {
      steps(sim, STEPS_PER_PACKET);
      const { s } = deliver(stage, wire(pack(sim)));
      if (seen !== null) {
        for (const e of newEvents(s, seen)) {
          expect(played.has(e.n)).toBe(false);
          played.add(e.n);
          if (e.type === 'ko') kos++;
        }
      }
      seen = s.eventTop;
    }
    const hostKos = sim.events.filter((e) => e.type === 'ko').length;
    expect(hostKos).toBeGreaterThan(0);
    expect(kos).toBe(hostKos);
  });
});

describe('arena mirror size', () => {
  /** Eight (or sixteen) protected snakes racing around until their bodies are the longest there are. */
  function longSim(n: number): Sim {
    const sim = newSim(n, 17, { speed: 1500, boostSpeed: 1500, growRate: 400, turnRate: 2.4 }, 300_000);
    for (const s of sim.m.all) {
      s.protectUntil = Number.POSITIVE_INFINITY;
      s.len = T.maxLen;
    }
    sim.brains.clear();
    const rnd = seeded(5);
    for (let i = 0; i < 1300; i++) {
      if (i % 30 === 0) for (const s of sim.m.all) sim.m.setInput(s.id, Math.floor(rnd() * 3) - 1, false);
      steps(sim, 1);
      // Keep the feed's history short-lived like a live Host.
      if (i % STEPS_PER_PACKET === 0) pack(sim);
    }
    return sim;
  }

  it('keeps every packet under the limit with eight very long snakes, and rebuilds them', () => {
    const sim = longSim(8);
    for (const s of sim.m.field()) expect(s.bodyPoints()).toBeGreaterThan(2500);
    const stage = new RemoteStage();
    sim.feed.resync();
    let largest = 0;
    let steady = 0;
    for (let i = 0; i < 60; i++) {
      steps(sim, STEPS_PER_PACKET);
      const p = pack(sim);
      const size = JSON.stringify(p).length;
      largest = Math.max(largest, size);
      if (i >= 40) steady = Math.max(steady, size);
      deliver(stage, wire(p));
    }
    expect(largest).toBeLessThanOrEqual(PACKET_MAX);
    expect(steady).toBeLessThan(4000);
    expectBodies(sim.m, stage);
  });

  it('keeps every packet under the limit with sixteen long snakes', () => {
    const sim = longSim(16);
    sim.feed.resync();
    for (let i = 0; i < 40; i++) {
      steps(sim, STEPS_PER_PACKET);
      expect(JSON.stringify(pack(sim)).length).toBeLessThanOrEqual(PACKET_MAX);
    }
  });

  it('stays small in an ordinary eight-player game, knock-out bursts included', () => {
    const sim = newSim(8, 41);
    const sizes: number[] = [];
    for (let i = 0; i < 900; i++) {
      steps(sim, STEPS_PER_PACKET);
      sizes.push(JSON.stringify(pack(sim)).length);
    }
    sizes.sort((a, b) => a - b);
    expect(sim.events.some((e) => e.type === 'ko')).toBe(true);
    expect(sizes[sizes.length - 1]).toBeLessThanOrEqual(PACKET_MAX);
    expect(sizes[Math.floor(sizes.length / 2)]).toBeLessThan(2500);
  });
});

describe('arena mirror timeline and clocks', () => {
  function state(t: number, extra: Partial<MirrorState> = {}): MirrorState {
    return {
      epoch: 1,
      t,
      width: 1000,
      height: 600,
      corner: 64,
      phase: 'play',
      left: 60_000,
      goIn: 0,
      elapsed: 10_000,
      hold: false,
      overlay: { kind: 'none' },
      leader: null,
      snakes: [],
      bodies: [],
      seq: 0,
      deltas: [],
      bands: [],
      events: [],
      eventTop: 0,
      ...extra,
    };
  }

  it('runs the intro, countdown and GO on server time', () => {
    const s = state(1000, { phase: 'intro', goIn: 4000, left: 180_000, elapsed: 0 });
    expect(mirrorClocks(s, 1000).overlay).toEqual({ kind: 'intro' });
    expect(mirrorClocks(s, 1900).overlay).toEqual({ kind: 'intro' });
    expect(mirrorClocks(s, 2500).overlay).toEqual({ kind: 'count', value: 3 });
    expect(mirrorClocks(s, 3500).overlay).toEqual({ kind: 'count', value: 2 });
    // A newer packet keeps the clock going (an old one stops 2 s past its stamp).
    const later = state(3000, { phase: 'countdown', goIn: 2000, left: 180_000, elapsed: 0 });
    expect(mirrorClocks(later, 4500).overlay).toEqual({ kind: 'count', value: 1 });
    expect(mirrorClocks(later, 5100).overlay).toEqual({ kind: 'go' });
    expect(mirrorClocks({ ...s, hold: true }, 3500).overlay).toEqual({ kind: 'intro' });
  });

  it('runs the round clock and the last seconds on server time, never far past the newest packet', () => {
    const s = state(1000, { left: 12_000 });
    expect(mirrorClocks(s, 1000)).toMatchObject({ left: 12_000, urgent: false });
    expect(mirrorClocks(s, 2500)).toMatchObject({ left: 10_500, urgent: false });
    expect(mirrorClocks(state(1000, { left: 6000 }), 2500)).toMatchObject({
      urgent: true,
      overlay: { kind: 'final', value: 5 },
    });
    expect(mirrorClocks(s, 1000 + CLOCK_AHEAD_MAX_MS + 5000).left).toBe(12_000 - CLOCK_AHEAD_MAX_MS);
    expect(mirrorClocks(state(1000, { elapsed: 100 }), 1200).overlay).toEqual({ kind: 'go' });
    expect(mirrorClocks({ ...s, hold: true }, 9000).left).toBe(12_000);
  });

  it('snaps on a new phase, a pause or a new match, and glides in between', () => {
    const tl = new MirrorTimeline();
    expect(tl.push(state(1000), 1050)).toBe(true);
    expect(tl.push(state(1060), 1110)).toBe(false);
    expect(tl.push(state(1120, { hold: true }), 1170)).toBe(true);
    expect(tl.push(state(1180, { hold: true, phase: 'over' }), 1230)).toBe(true);
    expect(tl.push(state(1240, { hold: true, phase: 'over', epoch: 2 }), 1290)).toBe(true);
    expect(tl.push(state(1300, { hold: true, phase: 'over', epoch: 2 }), 1350)).toBe(false);
    const span = tl.sample(1400);
    expect(span).not.toBeNull();
    expect(span!.k).toBeGreaterThanOrEqual(0);
    expect(span!.k).toBeLessThanOrEqual(1);
  });
});
