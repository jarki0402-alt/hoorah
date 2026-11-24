import { type Look, lookOfFruit } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { GhostBrain } from './brain';
import type { Overlay, Who } from './hud';
import { inCone, lineOfSight } from './light';
import { HauntMatch, REVEAL_S } from './logic';
import {
  applyMirror,
  FX_KEPT,
  FxLog,
  ghostShown,
  type HantuMirror,
  type MirrorSource,
  type MirrorState,
  MirrorTimeline,
  MirrorWorld,
  mirrorHud,
  mirrorLeft,
  newFx,
  polygonTouchesBox,
  toMirror,
} from './mirror';
import { CLOCK_AHEAD_MAX_MS } from './playout';
import { type HauntWorld, PING_S, TUNE } from './world';

const COLORS = ['#F2453D', '#2F8CFF', '#22B35E', '#FFC928', '#FF8A3D', '#FF5C9A', '#14B8A6', '#C4C7CC'];
const LOOKS: Look[] = [
  { c: 'leo', s: 3, h: 'nara', hc: 4, oc: 6 },
  { c: 'mia', s: 1, h: 'bima', hc: 2, oc: 3 },
  lookOfFruit('jeruk'),
];
const NONE: Overlay = { kind: 'none' };
const EPOCH = 4242;
const T0 = 5_000_000;

function seq(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function who(id: number): Who {
  return {
    id,
    // Twelve characters: the longest name a player can pick.
    name: `Pemain Ke ${String(id).padStart(2, '0')}`,
    look: LOOKS[id % LOOKS.length]!,
    color: COLORS[id % COLORS.length]!,
  };
}

/** A match of `n` people in the hunt (person 1 haunts, the rest are residents), nothing updated yet. */
function hunt(n = 8, map: 'rumah' | 'kampung' = 'rumah'): { m: HauntMatch; w: HauntWorld } {
  const m = new HauntMatch({ rounds: 2, offset: 0, cpuId: -1, rnd: seq(7) });
  m.setPeople(Array.from({ length: n }, (_, i) => ({ id: i + 1, name: who(i + 1).name, connected: true })));
  m.pick(map);
  m.next();
  m.start();
  for (let t = 0; t <= REVEAL_S + 0.25; t += 0.25) m.update(0.25);
  m.drainEvents();
  expect(m.phase).toBe('hunt');
  return { m, w: m.world! };
}

function source(m: HauntMatch, over: Partial<MirrorSource> = {}): MirrorSource {
  return {
    match: m,
    server: T0,
    held: false,
    overlay: NONE,
    callout: '',
    feed: [],
    who,
    fx: [],
    fxTop: 0,
    ...over,
  };
}

const wire = (p: HantuMirror): unknown => JSON.parse(JSON.stringify(p));

function decode(m: HauntMatch, over: Partial<MirrorSource> = {}): MirrorState {
  const s = applyMirror(wire(toMirror(source(m, over), EPOCH)));
  expect(s).not.toBeNull();
  return s!;
}

/** Every resident's flashlight off and nobody caught: the ghost is lit by nothing. */
function dark(w: HauntWorld): void {
  for (const r of w.residents) {
    r.light = false;
    r.state = 'in';
  }
  w.ghost.silau = 0;
  w.flash = 0;
  w.ping = null;
}

describe('hantu mirror: packing', () => {
  it('round-trips the house, the residents and the HUD', () => {
    const { m, w } = hunt(4);
    const r = w.residents[0]!;
    r.x = 3.5;
    r.y = 8.5;
    r.face = 0;
    w.ghost.x = 8.5;
    w.ghost.y = 8.5;
    w.ghost.inX = -1;
    w.keys[1]!.taken = true;
    w.keysFound = 1;
    w.fuse = 0.4;
    w.doorShut[2] = 3;
    w.lampsOff = 2;
    const s = decode(m, {
      callout: 'Hantu tersorot!',
      feed: [{ key: 7, text: 'Pemain Ke 02 menyorot hantu!' }],
      fx: [[3, 60]],
      fxTop: 3,
    });
    expect(s.epoch).toBe(EPOCH);
    expect(s.t).toBe(T0);
    expect(s.phase).toBe('hunt');
    expect(s.map).toBe('rumah');
    expect(s.callout).toBe('Hantu tersorot!');
    expect(s.feed).toEqual([{ key: 7, text: 'Pemain Ke 02 menyorot hantu!' }]);
    expect(s.fx).toEqual([{ n: 3, strength: 0.6 }]);
    const st = s.stage!;
    expect(st.round).toBe(0);
    expect(st.keys).toEqual(w.keys.map((k) => ({ x: k.x, y: k.y, taken: k.taken })));
    expect(st.shut).toEqual([2]);
    expect(st.fuse).toBeCloseTo(0.4, 3);
    expect(st.lamps).toBe(false);
    expect(st.left).toBe(Math.round(w.timeLeft * 1000));
    expect(st.residents.map((x) => x.id)).toEqual(w.residents.map((x) => x.id));
    const back = st.residents[0]!;
    expect(back).toMatchObject({ x: 3.5, y: 8.5, face: 0, state: 'in', shine: true, name: who(r.id).name });
    expect(back.look).toEqual(who(r.id).look);
    // The beam points straight at it down the corridor.
    expect(st.ghost).toMatchObject({ x: 8.5, y: 8.5, inX: -1, skin: w.ghost.skin, revealed: false });
    const hud = mirrorHud(s, mirrorLeft(s, T0));
    expect(hud.show).toBe(true);
    expect(hud.keys).toBe('Kunci 1/3');
    expect(hud.fuse).toBe('40%');
    expect(hud.safe).toBe('3 aman');
    expect(hud.place).toBe('Rumah Tua');
  });

  it('round-trips the setup, role deal and round-end cards', () => {
    const { m } = hunt(3);
    const cards: Overlay[] = [
      { kind: 'setup', step: 'fright', map: 'kampung', fright: 'beneran', host: 'Pemain Ke 01' },
      {
        kind: 'reveal',
        eyebrow: 'RONDE 1 DARI 2',
        title: 'Satu dari kalian adalah hantu…',
        people: [who(1), who(2)],
      },
      {
        kind: 'end',
        eyebrow: 'RONDE 1 DARI 2',
        title: 'Hantu menang!',
        sub: '0 dari 2 kabur',
        ghost: 'Hantunya: Pemain Ke 01 sebagai Bayangan',
        good: false,
        rows: [{ ...who(1), points: 7, note: 'Bayangan · 2×' }],
        next: 'Ronde 2 sebentar lagi',
      },
    ];
    for (const overlay of cards) expect(decode(m, { overlay }).overlay).toEqual(overlay);
  });

  it('rejects malformed states without throwing', () => {
    const { m, w } = hunt(4);
    w.ghost.silau = 1;
    const good = wire(toMirror(source(m), EPOCH)) as Record<string, unknown>;
    expect(applyMirror(good)).not.toBeNull();
    const stage = good.w as Record<string, unknown>;
    const bad: unknown[] = [
      null,
      42,
      'x',
      [],
      {},
      { ...good, v: 2 },
      { ...good, ph: 'boo' },
      { ...good, mp: 'kastil' },
      { ...good, fr: 'sangat' },
      { ...good, t: Number.NaN },
      { ...good, hold: 1 },
      { ...good, co: 'x'.repeat(500) },
      { ...good, ov: ['z'] },
      { ...good, ov: ['s', 'map', 'rumah', 'ringan'] },
      { ...good, fd: [[1, 2]] },
      { ...good, fd: Array.from({ length: 9 }, (_, i) => [i, 'a']) },
      { ...good, fx: [[9, 50]], fn: 3 },
      { ...good, fx: [[1, 101]], fn: 3 },
      { ...good, fx: Array.from({ length: FX_KEPT + 1 }, (_, i) => [i, 1]), fn: 99 },
      { ...good, w: 'house' },
      { ...good, w: { ...stage, left: -1 } },
      { ...good, w: { ...stage, fu: 1001 } },
      { ...good, w: { ...stage, dr: [999] } },
      { ...good, w: { ...stage, k: [[40, 1, 0]] } },
      { ...good, w: { ...stage, k: [[1, 1, 2]] } },
      { ...good, w: { ...stage, rs: [[1, 'a', { c: 'nobody' }, '#FFFFFF', 0, 0, 0, 0]] } },
      { ...good, w: { ...stage, rs: [[1, 'a', LOOKS[0], 'red', 0, 0, 0, 0]] } },
      { ...good, w: { ...stage, rs: [[1, 'a', LOOKS[0], '#FFFFFF', 99_999, 0, 0, 0]] } },
      { ...good, w: { ...stage, rs: [[1, 'a', LOOKS[0], '#FFFFFF', 0, 0, 0, 3]] } },
      { ...good, w: { ...stage, gh: [100, 100, 0, 'vampir'] } },
      { ...good, w: { ...stage, gh: [100, 100, 9, 'pocong'] } },
      { ...good, w: { ...stage, gh: [100] } },
      { ...good, w: { ...stage, pg: [100, 100, 99_999] } },
      { ...good, w: { ...stage, rs: undefined } },
    ];
    for (const b of bad) expect(applyMirror(b), JSON.stringify(b)?.slice(0, 80)).toBeNull();
    // Random corruption never throws.
    const rnd = seq(11);
    const text = JSON.stringify(good);
    for (let i = 0; i < 300; i++) {
      const at = Math.floor(rnd() * text.length);
      const mangled = `${text.slice(0, at)}${'0[]",:{}x-9'[Math.floor(rnd() * 11)]}${text.slice(at + 1)}`;
      let parsed: unknown;
      try {
        parsed = JSON.parse(mangled);
      } catch {
        continue;
      }
      expect(() => applyMirror(parsed)).not.toThrow();
    }
  });
});

describe('hantu mirror: secrecy', () => {
  it('sends nothing of a ghost no light touches: packets do not depend on where it hides', () => {
    const { m, w } = hunt(8);
    dark(w);
    w.ghost.x = 26.5;
    w.ghost.y = 1.5;
    w.ghost.inX = 1;
    w.ghost.skin = 'bayangan';
    const a = JSON.stringify(toMirror(source(m), EPOCH));
    w.ghost.x = 4.5;
    w.ghost.y = 3.5;
    w.ghost.inX = -1;
    w.ghost.skin = 'boneka';
    w.ghost.litMeter = 0.9;
    const b = JSON.stringify(toMirror(source(m), EPOCH));
    expect(ghostShown(w)).toBe(false);
    expect(b).toBe(a);
    expect((JSON.parse(a) as HantuMirror).w!.gh).toBeNull();
    expect(a).not.toContain('bayangan');
    expect(b).not.toContain('boneka');
  });

  it('hides a ghost right behind a resident whose beam points away, and shows it in the beam', () => {
    const { m, w } = hunt(3);
    dark(w);
    const r = w.residents[0]!;
    r.x = 3.5;
    r.y = 8.5;
    r.light = true;
    w.ghost.x = 8.5;
    w.ghost.y = 8.5;
    r.face = Math.PI;
    expect(decode(m).stage!.ghost).toBeNull();
    r.face = 0;
    expect(decode(m).stage!.ghost).toMatchObject({ x: 8.5, y: 8.5 });
    // Batteries flat or the ghost's flicker power: no beam, no ghost.
    w.torchOff = 1;
    expect(decode(m).stage!.ghost).toBeNull();
    w.torchOff = 0;
    r.battery = 0;
    expect(decode(m).stage!.ghost).toBeNull();
  });

  it('sends the scared face as a flag, never how close the ghost is', () => {
    const { m, w } = hunt(3);
    dark(w);
    const r = w.residents[0]!;
    r.heart = 0.69;
    const calm = JSON.stringify(toMirror(source(m), EPOCH));
    r.heart = 0.1;
    expect(JSON.stringify(toMirror(source(m), EPOCH))).toBe(calm);
    r.heart = 0.95;
    expect(decode(m).stage!.residents[0]!.heart).toBe(1);
  });

  it('shows the ghost near a firefly, while dazzled, in the fuse flash, and the ping only while it blinks', () => {
    const { m, w } = hunt(3);
    dark(w);
    w.ghost.x = 20.5;
    w.ghost.y = 12.5;
    const fly = w.residents[0]!;
    fly.state = 'fly';
    fly.x = 26;
    fly.y = 12.5;
    expect(decode(m).stage!.ghost).toBeNull();
    fly.x = 22;
    expect(decode(m).stage!.ghost).not.toBeNull();
    fly.state = 'in';
    w.ghost.silau = 1;
    expect(decode(m).stage!.ghost).toMatchObject({ silau: 1, revealed: true });
    w.ghost.silau = 0;
    w.flash = 1;
    expect(decode(m).stage!.ghost).toMatchObject({ revealed: true });
    w.flash = 0;
    expect(decode(m).stage!.ping).toBeNull();
    w.ping = { x: 20.5, y: 12.5, age: 0.4 };
    expect(decode(m).stage!.ping).toEqual({ x: 20.5, y: 12.5, age: 0.4 });
    expect(decode(m).stage!.ghost).toBeNull();
  });

  it('never sends a hidden ghost and never hides a lit one over a long played round', () => {
    for (const map of ['rumah', 'kampung'] as const) {
      const { m, w } = hunt(5, map);
      const brain = new GhostBrain(0.7, seq(5));
      const rnd = seq(9);
      const sticks = new Map(w.residents.map((r) => [r.id, { x: 0, y: 0 }]));
      let hidden = 0;
      let shown = 0;
      for (let f = 0; f < 60 * 90 && m.phase === 'hunt'; f++) {
        if (f % 40 === 0)
          for (const r of w.residents) {
            const a = rnd() * Math.PI * 2;
            sticks.set(r.id, { x: Math.cos(a), y: Math.sin(a) });
            if (rnd() < 0.1) w.toggleLight(r.id);
          }
        for (const r of w.residents) w.setStick(r.id, sticks.get(r.id)!.x, sticks.get(r.id)!.y);
        const s = brain.update(w, 1 / 60);
        w.setStick(w.ghost.id, s.x, s.y);
        m.update(1 / 60);
        m.drainEvents();
        if (f % 4 !== 0 || m.phase !== 'hunt') continue;
        const gh = toMirror(source(m), EPOCH).w!.gh;
        const g = w.ghost;
        const lit = w.residents.some(
          (r) =>
            w.shining(r) &&
            inCone(r.x, r.y, r.face, TUNE.coneHalf, w.tune.range, g.x, g.y) &&
            lineOfSight(w.sight(), r.x, r.y, g.x, g.y),
        );
        const far = w.residents.every((r) => {
          const d = Math.hypot(r.x - g.x, r.y - g.y);
          return (
            r.state === 'out' ||
            (r.state === 'fly' ? d > TUNE.flyGlow + 2 : !w.shining(r) || d > w.tune.range + 2)
          );
        });
        if (lit || w.ghostRevealed()) expect(gh).not.toBeNull();
        if (far && !w.ghostRevealed()) expect(gh, `hidden ghost leaked at ${g.x},${g.y}`).toBeNull();
        if (gh === null) hidden++;
        else shown++;
      }
      // The run saw both sides.
      expect(hidden).toBeGreaterThan(20);
      expect(shown).toBeGreaterThan(0);
    }
  });

  it('tests polygon and box overlap', () => {
    const tri = [0, 0, 4, 0, 0, 4];
    expect(polygonTouchesBox(tri, 1, 1, 0.2)).toBe(true);
    expect(polygonTouchesBox(tri, 5, 5, 0.5)).toBe(false);
    // An edge crossing the box without any corner inside.
    expect(polygonTouchesBox(tri, 2.2, 2.2, 0.3)).toBe(true);
    // The polygon inside the box.
    expect(polygonTouchesBox([0, 0, 0.1, 0, 0, 0.1], 0, 0, 5)).toBe(true);
  });
});

describe('hantu mirror: far-away playback', () => {
  /** Two packets 60 ms apart with resident 0 and the ghost moved, played back in between. */
  function pair() {
    const { m, w } = hunt(3);
    dark(w);
    const r = w.residents[0]!;
    r.x = 3.5;
    r.y = 8.5;
    r.face = 0;
    r.light = true;
    w.ghost.x = 8;
    w.ghost.y = 8.5;
    const a = decode(m, { server: T0 });
    r.x = 4.1;
    r.face = 0.4;
    w.ghost.x = 8.6;
    const b = decode(m, { server: T0 + 60 });
    return { a, b };
  }

  it('glides residents and a showing ghost between packets', () => {
    const { a, b } = pair();
    const tl = new MirrorTimeline();
    expect(tl.push(a, T0 + 30)).toBe(true);
    expect(tl.push(b, T0 + 90)).toBe(false);
    let span = tl.sample(T0 + 90);
    for (let now = T0 + 90; now < T0 + 400 && span && (span.k <= 0 || span.k >= 1); now += 4)
      span = tl.sample(now);
    expect(span).not.toBeNull();
    const { k } = span!;
    expect(k).toBeGreaterThan(0);
    expect(k).toBeLessThan(1);
    const world = new MirrorWorld({ ...a, stage: a.stage! });
    world.update(span!);
    const r = world.residents[0]!;
    expect(r.x).toBeCloseTo(3.5 + 0.6 * k, 5);
    expect(r.face).toBeCloseTo(0.4 * k, 5);
    expect(world.ghost!.x).toBeCloseTo(8 + 0.6 * k, 5);
    expect(world.shining(r)).toBe(true);
    // The ghost left the light in the next packet: it stays where it was last shown, then goes.
    const gone: MirrorState = { ...b, stage: { ...b.stage!, ghost: null } };
    world.update({ a, b: gone, k: 0.5, at: T0 + 30 });
    expect(world.ghost!.x).toBe(8);
    world.update({ a: gone, b: gone, k: 0, at: T0 + 60 });
    expect(world.ghost).toBeNull();
  });

  it('ages the ping from the packet to the playback point and drops it after the blinks', () => {
    const { a } = pair();
    const withPing: MirrorState = { ...a, stage: { ...a.stage!, ping: { x: 5, y: 5, age: 1 } } };
    const world = new MirrorWorld({ ...withPing, stage: withPing.stage! });
    world.update({ a: withPing, b: withPing, k: 0, at: T0 + 200 });
    expect(world.ping!.age).toBeCloseTo(1.2, 5);
    world.update({ a: withPing, b: withPing, k: 0, at: T0 + (PING_S - 1) * 1000 + 10 });
    expect(world.ping).toBeNull();
    const held = { ...withPing, hold: true };
    world.update({ a: held, b: held, k: 0, at: T0 + 5000 });
    expect(world.ping!.age).toBe(1);
  });

  it('runs the round clock on server time, frozen while the Host is paused', () => {
    const { a } = pair();
    const left = a.stage!.left / 1000;
    expect(mirrorLeft(a, T0)).toBeCloseTo(left, 3);
    expect(mirrorLeft(a, T0 + 1000)).toBeCloseTo(left - 1, 3);
    expect(mirrorLeft(a, T0 + 60_000)).toBeCloseTo(left - CLOCK_AHEAD_MAX_MS / 1000, 3);
    expect(mirrorLeft({ ...a, hold: true }, T0 + 1000)).toBeCloseTo(left, 3);
    expect(mirrorLeft({ ...a, phase: 'end' }, T0 + 1000)).toBeCloseTo(left, 3);
  });

  it('numbers flashes, repeats them for a second and replays each once', () => {
    const log = new FxLog();
    log.note(1);
    log.note(0.6);
    expect(log.recent(T0)).toEqual([
      [1, 100],
      [2, 60],
    ]);
    expect(log.recent(T0 + 900)).toHaveLength(2);
    log.note(0.6);
    expect(log.recent(T0 + 1100)).toEqual([[3, 60]]);
    const { a } = pair();
    const s: MirrorState = {
      ...a,
      fx: [
        { n: 2, strength: 0.6 },
        { n: 3, strength: 0.6 },
      ],
      fxTop: 3,
    };
    expect(newFx(s, 2).map((f) => f.n)).toEqual([3]);
  });
});

describe('hantu mirror: size', () => {
  it('stays small with 8 players, the whole feed and the round-end card', () => {
    const { m, w } = hunt(8, 'kampung');
    for (const r of w.residents) r.light = true;
    w.ghost.silau = 1;
    w.ping = { x: 10, y: 10, age: 0.5 };
    w.doorShut.fill(2);
    const feed = [0, 1, 2, 3].map((key) => ({ key, text: 'Pemain Ke 08 berhasil kabur dari kampung!' }));
    const fx: [number, number][] = Array.from({ length: FX_KEPT }, (_, i) => [i + 1, 60]);
    const live = JSON.stringify(
      toMirror(source(m, { feed, callout: 'Hantu silau!', fx, fxTop: FX_KEPT }), EPOCH),
    );
    expect(live.length).toBeLessThan(2500);
    const people = Array.from({ length: 8 }, (_, i) => who(i + 1));
    const end: Overlay = {
      kind: 'end',
      eyebrow: 'RONDE 8 DARI 8',
      title: 'Penghuni menang!',
      sub: '7 dari 7 kabur',
      ghost: 'Hantunya: Pemain Ke 01 sebagai Kuntilanak',
      good: true,
      rows: people.map((p) => ({ ...p, points: 12, note: 'Kunang-kunang' })),
      next: 'Hasil akhir sebentar lagi',
    };
    const calm = JSON.stringify(toMirror(source(m, { overlay: end, feed }), EPOCH));
    expect(calm.length).toBeLessThan(6000);
  });
});
