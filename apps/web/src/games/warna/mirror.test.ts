import { type Look, lookOfFruit } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import type { HudState } from './hud';
import { hudOf } from './hudstate';
import { LEVELS, type Level, levelById } from './levels';
import { CLEAR_S, INTRO_S, type Person, type Progress, secondLook, WarnaMatch } from './logic';
import {
  applyMirror,
  castLook,
  doorChannels,
  EVENTS_KEPT,
  hintAt,
  MirrorFeed,
  type MirrorSource,
  type MirrorState,
  MirrorTimeline,
  mirrorClocks,
  newEvents,
  PACKET_MAX,
  poseWorld,
  SNAP_TILES,
  type WarnaMirror,
} from './mirror';
import { CLOCK_AHEAD_MAX_MS } from './playout';
import type { CharLook } from './scene';
import { TUNE, World } from './world';

const OFFSET = 5_000_000;
const COLORS = ['#F2453D', '#2F8CFF', '#22B35E', '#FFC928', '#FF8A3D', '#FF5C9A', '#14B8A6', '#C4C7CC'];
const LOOKS: Look[] = [
  { c: 'leo', s: 3, h: 'mia', hc: 4, oc: 6 },
  { c: 'mia', s: 1, h: 'leo', hc: 2, oc: 3 },
];

function people(n: number): Person[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    // Twelve characters: the longest name a player can pick.
    name: `Pemain Ke ${String(i + 1).padStart(2, '0')}`,
    fruit: 'jeruk',
    look: LOOKS[i % LOOKS.length]!,
    color: COLORS[i % COLORS.length]!,
    connected: true,
  }));
}

const ALL_DONE: Progress = Object.fromEntries(LEVELS.map((l) => [l.id, 3]));

function play(m: WarnaMatch, seconds: number): void {
  for (let t = 0; t < seconds; t += 1 / 60) m.update(1 / 60);
}

/** Starts `lv` (every level open) with `n` people, through the intro. */
function stageOf(lv: Level, n: number, intro = true): WarnaMatch {
  const m = new WarnaMatch(ALL_DONE);
  m.setPeople(people(n));
  expect(m.pickWorld(lv.biome)).toBe(true);
  expect(m.toLevels()).toBe(true);
  expect(m.pickLevel(lv.id)).toBe(true);
  m.start();
  if (intro) play(m, INTRO_S + 0.05);
  return m;
}

/** The look the Host's driver gives a character. */
function hostLook(m: WarnaMatch): (key: number) => CharLook {
  return (key) => {
    const c = m.sim?.chars[key];
    const p = c ? m.person(c.owner) : undefined;
    return {
      name: p?.name ?? '',
      look: (c?.sub === 1 ? secondLook(p?.look) : p?.look) ?? lookOfFruit('jeruk'),
      idle: Boolean(m.solo && c && c.sub !== m.steer),
    };
  };
}

const colorOf =
  (m: WarnaMatch) =>
  (owner: number): string =>
    m.person(owner)?.color ?? '#FFFFFF';

function source(m: WarnaMatch, serial: number, t: number, extra: Partial<MirrorSource> = {}): MirrorSource {
  return {
    match: m,
    server: t + OFFSET,
    serial,
    host: 'Pemain Ke 01',
    held: false,
    tip: true,
    look: hostLook(m),
    color: colorOf(m),
    ...extra,
  };
}

/** Through JSON and validation, as a far-away screen receives it. */
function trip(p: WarnaMirror): MirrorState {
  const s = applyMirror(JSON.parse(JSON.stringify(p)));
  expect(s).not.toBeNull();
  return s!;
}

/** The far-away screen's World for a state, posed at it. */
function farWorld(s: MirrorState): World | null {
  const st = s.stage;
  if (!st) return null;
  const w = new World(
    st.level,
    st.chars.map((c) => ({ owner: c.owner, sub: c.sub })),
    { solo: st.solo },
  );
  poseWorld(w, st, null, 0);
  return w;
}

function hostHud(m: WarnaMatch, tip: boolean): HudState {
  const score = m.lastScore();
  return hudOf({
    phase: m.phase,
    pickStep: m.pickStep,
    world: m.world,
    pick: m.pick,
    level: m.level,
    progress: m.progress,
    limited: m.limited,
    host: 'Pemain Ke 01',
    playT: m.playT,
    nextLeft: m.nextLeft(),
    tip,
    hint: m.currentHint(),
    vote: m.phase === 'play' && m.voteLeft > 0 ? { count: m.votes.size, need: m.voteNeed() } : null,
    score: score ?? null,
    solo: m.solo,
    sim: m.sim,
    look: hostLook(m),
    color: colorOf(m),
  });
}

function farHud(s: MirrorState, w: World | null): HudState {
  return hudOf({
    phase: s.phase,
    pickStep: s.pickStep,
    world: s.world,
    pick: s.pick,
    level: s.level,
    progress: s.progress,
    limited: s.limited,
    host: s.host,
    playT: s.playT,
    nextLeft: s.nextLeft,
    tip: s.tip,
    hint: s.hint && w ? hintAt(s.hint, w) : null,
    vote: s.vote,
    score: s.score,
    solo: s.stage?.solo ?? false,
    sim: w,
    look: (k) => (s.stage && castLook(s.stage, k)) ?? { name: '', look: lookOfFruit('jeruk'), idle: false },
    color: (owner) => s.stage?.chars.find((c) => c.owner === owner)?.color ?? '#FFFFFF',
  });
}

/** Packs, receives and checks that both screens show the same HUD; returns the received state. */
function sameHud(m: WarnaMatch, feed: MirrorFeed, serial: number, t: number): MirrorState {
  const s = trip(feed.pack(source(m, serial, t)));
  expect(farHud(s, farWorld(s))).toEqual(hostHud(m, true));
  return s;
}

/** Doors on two channels, plates, levers and flags; or a lift, a box and plates. */
const DOORS = levelById('hutan-30')!;
const LIFTS = levelById('hutan-29')!;

describe('warna mirror', () => {
  it.each([DOORS, LIFTS])(
    'round-trips characters, boxes, lifts, doors, switches, gems and planks ($id)',
    (lv) => {
      expect(lv.lifts.length + doorChannels(lv).length).toBeGreaterThan(0);
      const m = stageOf(lv, 3);
      m.setStick(1, 1, false);
      m.setStick(2, -1, true);
      play(m, 0.7);
      const w = m.sim!;
      // Put some of everything in a state worth checking.
      w.chars[2]!.dead = true;
      w.chars[1]!.inExit = true;
      if (w.gems[0]) w.gems[0].taken = true;
      if (w.plateOn.length) w.plateOn[0] = true;
      if (w.leverOn.length) w.leverOn[0] = true;
      if (w.checkpointLit.length) w.checkpointLit[0] = true;
      const ch = doorChannels(lv)[0];
      if (ch !== undefined) w.doorShown.set(ch, 0.37);
      w.active.set(lv.channels[0]!, true);
      if (w.lifts[0]) w.lifts[0].y -= 0.42;
      if (w.boxes[0]) w.boxes[0].pushers = 1;
      w.assist.add(5 * 32 + 3);

      const s = trip(new MirrorFeed(1).pack(source(m, 4, 1000)));
      expect(s.stage?.serial).toBe(4);
      expect(s.stage?.level).toBe(lv);
      const far = farWorld(s)!;
      w.chars.forEach((c, i) => {
        const f = far.chars[i]!;
        expect(f.x).toBeCloseTo(c.x, 2);
        expect(f.y).toBeCloseTo(c.y, 2);
        expect(f.vx).toBeCloseTo(c.vx, 1);
        expect([f.facing, f.grounded, f.active, f.dead, f.inExit]).toEqual([
          c.facing,
          c.grounded,
          c.active,
          c.dead,
          c.inExit,
        ]);
        expect(f.inX !== 0).toBe(c.inX !== 0);
        expect(f.slot).toBe(c.slot);
      });
      w.boxes.forEach((b, i) => {
        expect(far.boxes[i]!.x).toBeCloseTo(b.x, 2);
        expect(far.boxes[i]!.y).toBeCloseTo(b.y, 2);
        expect(far.boxes[i]!.pushers).toBe(b.pushers);
      });
      w.lifts.forEach((l, i) => {
        expect(far.lifts[i]!.y).toBeCloseTo(l.y, 2);
      });
      expect(far.gems.map((g) => g.taken)).toEqual(w.gems.map((g) => g.taken));
      expect(far.plateOn).toEqual(w.plateOn);
      expect(far.leverOn).toEqual(w.leverOn);
      expect(far.checkpointLit).toEqual(w.checkpointLit);
      expect([...far.active]).toEqual([...w.active]);
      if (ch !== undefined) expect(far.doorShown.get(ch)).toBeCloseTo(0.37, 2);
      expect([...far.doorShown.keys()]).toEqual([...w.doorShown.keys()]);
      expect([...far.assist]).toEqual([...w.assist]);
      // Same names, looks and colours on both screens.
      const look = hostLook(m);
      w.chars.forEach((c) => {
        expect(castLook(s.stage!, c.key)).toEqual(look(c.key));
      });
    },
  );

  it('mirrors every menu and card: worlds, journey map, intro, play, clear, the choice after it', () => {
    const lv = LEVELS[0]!;
    const feed = new MirrorFeed(2);
    const m = new WarnaMatch({ [lv.id]: 2 });
    m.setPeople(people(2));
    let s = sameHud(m, feed, 0, 0);
    expect(s.phase).toBe('select');
    expect(s.stage).toBeNull();
    expect(farHud(s, null).overlay.kind).toBe('worlds');

    m.toLevels();
    s = sameHud(m, feed, 0, 100);
    expect(farHud(s, null).overlay.kind).toBe('journey');
    expect(s.progress[lv.id]).toBe(2);

    m.start();
    s = sameHud(m, feed, 1, 200);
    expect(s.phase).toBe('intro');
    expect(farHud(s, farWorld(s)).overlay.kind).toBe('intro');

    play(m, INTRO_S + 0.1);
    m.setStick(1, 1, false);
    play(m, 1.3);
    s = sameHud(m, feed, 1, 300);
    expect(s.phase).toBe('play');

    // A hint and a restart vote show on both screens.
    m.hint(1);
    m.hint(1);
    m.restart(2);
    s = sameHud(m, feed, 1, 400);
    expect(s.hint?.level).toBe(2);
    expect(s.vote).not.toBeNull();

    // Everyone at their doors: the stage clears.
    const w = m.sim!;
    for (const c of w.chars) {
      const door = w.level.exits.find((e) => e.slot % w.colors === c.slot)!;
      c.x = door.x + (1 - TUNE.charW) / 2;
      c.y = door.y + 1 - TUNE.charH;
      c.cpX = c.x;
      c.cpY = c.y;
    }
    m.setStick(1, 0, false);
    play(m, 1);
    expect(m.phase).toBe('clear');
    s = sameHud(m, feed, 1, 500);
    expect(farHud(s, farWorld(s)).overlay.kind).toBe('clear');
    expect(s.score).not.toBeNull();

    play(m, CLEAR_S + 0.1);
    expect(m.phase).toBe('next');
    s = sameHud(m, feed, 1, 600);
    expect(s.nextLeft).toBeGreaterThan(0);

    // Back to the map: the old stage stays drawn behind the journey card.
    m.toMap();
    s = sameHud(m, feed, 1, 700);
    expect(s.phase).toBe('select');
    expect(s.stage?.serial).toBe(1);
  });

  it('mirrors a lone player steering two characters', () => {
    const m = stageOf(LEVELS[0]!, 1);
    m.swap(1);
    const s = trip(new MirrorFeed(3).pack(source(m, 1, 0)));
    expect(s.stage?.solo).toBe(true);
    expect(s.stage?.steer).toBe(1);
    expect(s.stage?.chars.map((c) => c.sub)).toEqual([0, 1]);
    expect(castLook(s.stage!, 0)?.idle).toBe(true);
    expect(castLook(s.stage!, 1)?.idle).toBe(false);
    expect(castLook(s.stage!, 1)?.look).toEqual(secondLook(LOOKS[0]));
  });

  it('rejects malformed packets', () => {
    const m = stageOf(DOORS, 2);
    const good = JSON.parse(JSON.stringify(new MirrorFeed(4).pack(source(m, 1, 0)))) as Record<
      string,
      unknown
    >;
    expect(applyMirror(good)).not.toBeNull();
    const bad = (patch: (p: Record<string, unknown>, sg: Record<string, unknown>) => void): unknown => {
      const p = JSON.parse(JSON.stringify(good)) as Record<string, unknown>;
      patch(p, p.sg as Record<string, unknown>);
      return p;
    };
    const cases: unknown[] = [
      null,
      42,
      'x',
      [],
      { ...good, v: 2 },
      { ...good, ph: 'boom' },
      { ...good, ps: 'map' },
      { ...good, wd: 'mars' },
      { ...good, lvl: LEVELS.length },
      { ...good, pk: -1 },
      { ...good, t: Number.NaN },
      { ...good, pr: 'x'.repeat(LEVELS.length) },
      { ...good, pr: '3' },
      { ...good, hn: 'x'.repeat(200) },
      { ...good, hold: 1 },
      { ...good, pt: -5 },
      { ...good, nl: 10_000_000 },
      { ...good, hi: ['box', 'plate', 0, 0, 3] },
      { ...good, hi: ['door', 'plate', 0, 0, 1] },
      { ...good, vo: [1] },
      { ...good, sc: [1000, 5, 2, 0] },
      { ...good, sc: [1000, 1, 2, 8] },
      { ...good, ev: 'x' },
      { ...good, ev: [[1, 'j', 99]] },
      { ...good, ev: [[1, 'z', 0]] },
      { ...good, ev: [[1, 'd', 0, 0]] },
      { ...good, ev: Array.from({ length: EVENTS_KEPT * 2 + 1 }, (_, i) => [i, 'c']) },
      { ...good, en: -1 },
      { ...good, sg: 5 },
      bad((_, sg) => {
        sg.l = 9999;
      }),
      bad((_, sg) => {
        sg.cs = [];
        sg.ch = [];
      }),
      bad((_, sg) => {
        (sg.ch as unknown[]).pop();
      }),
      bad((_, sg) => {
        (sg.cs as unknown[][])[0]![3] = { c: 'nobody' };
      }),
      bad((_, sg) => {
        (sg.cs as unknown[][])[0]![4] = 'red';
      }),
      bad((_, sg) => {
        (sg.ch as unknown[][])[0]![0] = 1e9;
      }),
      bad((_, sg) => {
        (sg.ch as unknown[][])[0]![3] = 64;
      }),
      bad((_, sg) => {
        (sg.bx as unknown[]).push(0);
      }),
      bad((_, sg) => {
        sg.lf = [0];
      }),
      bad((_, sg) => {
        sg.gm = `${sg.gm as string}1`;
      }),
      bad((_, sg) => {
        sg.pl = 'ab';
      }),
      bad((_, sg) => {
        sg.dr = [];
      }),
      bad((_, sg) => {
        sg.dr = (sg.dr as number[]).map(() => 101);
      }),
      bad((_, sg) => {
        sg.as = [32 * 18];
      }),
      bad((_, sg) => {
        sg.ac = 16;
      }),
      bad((_, sg) => {
        sg.st = 2;
      }),
    ];
    cases.forEach((c, i) => {
      expect([i, applyMirror(c)]).toEqual([i, null]);
    });
  });

  it('stays well under the size limit with 16 players and a full event list', () => {
    let lv = LEVELS[0]!;
    for (const l of LEVELS)
      if (l.gems.length + l.boxes.length * 3 > lv.gems.length + lv.boxes.length * 3) lv = l;
    const m = stageOf(lv, 16);
    const feed = new MirrorFeed(5);
    m.sim!.chars.forEach((c, i) => {
      c.vx = i % 2 ? 6.4 : -6.4;
      c.x += 0.123;
      c.y += 0.456;
    });
    m.hint(1);
    for (let i = 0; i < EVENTS_KEPT + 5; i++) feed.note({ type: 'die', key: i % 16, x: 31.99, y: 17.99 });
    const p = feed.pack(source(m, 99, 0));
    const size = JSON.stringify(p).length;
    expect(p.ev.length).toBe(EVENTS_KEPT);
    expect(size).toBeLessThan(PACKET_MAX);
    expect(size).toBeLessThan(4500);
    expect(applyMirror(JSON.parse(JSON.stringify(p)))).not.toBeNull();
    // A usual game of four in steady play stays small.
    const four = stageOf(lv, 4);
    expect(JSON.stringify(new MirrorFeed(6).pack(source(four, 1, 0))).length).toBeLessThan(2000);
  });

  it('replays effect events once, from the packet that brought them, and forgets them on a new stage', () => {
    const m = stageOf(LEVELS[0]!, 2);
    const feed = new MirrorFeed(6);
    feed.note({ type: 'jump', key: 0 });
    feed.note({ type: 'gem', key: 1, gem: 0 });
    const a = trip(feed.pack(source(m, 1, 0)));
    expect(a.events.map((e) => e.e.type)).toEqual(['jump', 'gem']);
    expect(a.eventTop).toBe(2);
    feed.note({ type: 'die', key: 0, x: 3.25, y: 9.5 });
    const b = trip(feed.pack(source(m, 1, 60)));
    // The earlier ones are repeated (a lost packet loses nothing), but only the new one is new.
    expect(b.events.length).toBe(3);
    expect(newEvents(b, a.eventTop).map((e) => e.e)).toEqual([{ type: 'die', key: 0, x: 3.25, y: 9.5 }]);
    // Repeated only for a while.
    const c = trip(feed.pack(source(m, 1, 2000)));
    expect(c.events).toEqual([]);
    expect(c.eventTop).toBe(3);
    // A restart is a new stage: older effects are not replayed on it, the restart itself is.
    feed.note({ type: 'ping', key: 1 });
    feed.newStage();
    feed.note({ type: 'restart' });
    const d = trip(feed.pack(source(m, 2, 2100)));
    expect(d.events.map((e) => e.e.type)).toEqual(['restart']);
    expect(newEvents(d, c.eventTop).map((e) => e.n)).toEqual([5]);
  });

  it('switches level: a new stage number and level reach the far-away screen and start a new stretch', () => {
    const first = LEVELS[0]!;
    const second = LEVELS[1]!;
    const feed = new MirrorFeed(7);
    const tl = new MirrorTimeline();
    const m = stageOf(first, 2);
    const a = trip(feed.pack(source(m, 1, 0)));
    expect(tl.push(a, OFFSET + 40)).toBe(true);
    expect(tl.push(trip(feed.pack(source(m, 1, 60))), OFFSET + 100)).toBe(false);
    expect(a.stage?.level).toBe(first);

    const n = stageOf(second, 2);
    const b = trip(feed.pack(source(n, 2, 120)));
    expect(b.stage?.level).toBe(second);
    expect(b.stage?.serial).toBe(2);
    expect(tl.push(b, OFFSET + 160)).toBe(true);
    // Posing never blends across stages: the other stage's positions are ignored.
    const w = farWorld(a)!;
    poseWorld(w, a.stage!, b.stage, 0.5);
    expect(w.chars[0]!.x).toBeCloseTo(a.stage!.chars[0]!.x, 5);
    // A stage of another level has other doors and gems: it is refused if mixed up.
    const mixed = JSON.parse(JSON.stringify(feed.pack(source(n, 2, 180)))) as WarnaMirror;
    const other = LEVELS.find((l) => l.gems.length !== second.gems.length)!;
    mixed.sg!.l = other.index;
    expect(applyMirror(mixed)).toBeNull();
  });
});

describe('warna mirror timeline', () => {
  /** Two packets 60 ms apart with character 0 moved `dx` tiles. */
  function pair(dx: number, dead = false): [MirrorState, MirrorState] {
    const m = stageOf(LEVELS[0]!, 2);
    const feed = new MirrorFeed(8);
    const a = trip(feed.pack(source(m, 1, 1000)));
    const c = m.sim!.chars[0]!;
    c.x += dx;
    c.dead = dead;
    const b = trip(feed.pack(source(m, 1, 1060)));
    return [a, b];
  }

  it('glides characters between packets a little in the past', () => {
    const [a, b] = pair(0.6);
    const tl = new MirrorTimeline();
    tl.push(a, a.t + 30);
    tl.push(b, b.t + 30);
    // Draw at the point half way between the two packets.
    const first = b.t + 30;
    const behind = first - tl.playhead(first);
    const span = tl.sample(a.t + 30 + behind)!;
    expect(span.a).toBe(a);
    expect(span.b).toBe(b);
    expect(span.k).toBeCloseTo(0.5, 5);
    const w = farWorld(a)!;
    poseWorld(w, span.a.stage!, span.b.stage, span.k);
    const x0 = a.stage!.chars[0]!.x;
    const x1 = b.stage!.chars[0]!.x;
    expect(w.chars[0]!.x).toBeCloseTo(x0 + (x1 - x0) * span.k, 5);
    expect(w.chars[0]!.x).toBeGreaterThan(x0);
    expect(w.chars[0]!.x).toBeLessThan(x1);
    // Half way exactly.
    poseWorld(w, a.stage!, b.stage, 0.5);
    expect(w.chars[0]!.x).toBeCloseTo((x0 + x1) / 2, 5);
  });

  it('does not glide a respawned or fallen character across the stage', () => {
    const [a, b] = pair(SNAP_TILES + 1);
    const w = farWorld(a)!;
    poseWorld(w, a.stage!, b.stage, 0.5);
    expect(w.chars[0]!.x).toBeCloseTo(a.stage!.chars[0]!.x, 5);
    const [c, d] = pair(0.5, true);
    poseWorld(w, c.stage!, d.stage, 0.5);
    expect(w.chars[0]!.x).toBeCloseTo(c.stage!.chars[0]!.x, 5);
  });

  it('snaps on a new phase or a pause', () => {
    const m = stageOf(LEVELS[0]!, 2, false);
    const feed = new MirrorFeed(9);
    const tl = new MirrorTimeline();
    expect(tl.push(trip(feed.pack(source(m, 1, 0))), OFFSET + 30)).toBe(true);
    play(m, INTRO_S + 0.1);
    expect(tl.push(trip(feed.pack(source(m, 1, 60))), OFFSET + 90)).toBe(true);
    expect(tl.push(trip(feed.pack(source(m, 1, 120))), OFFSET + 150)).toBe(false);
    expect(tl.push(trip(feed.pack(source(m, 1, 180, { held: true }))), OFFSET + 210)).toBe(true);
  });

  it('runs the stage clock and the next-level wait on server time, still while paused', () => {
    const m = stageOf(LEVELS[0]!, 2);
    play(m, 2);
    const s = trip(new MirrorFeed(10).pack(source(m, 1, 0)));
    expect(mirrorClocks(s, s.t + 500).playT).toBeCloseTo(s.playT + 0.5, 5);
    expect(mirrorClocks(s, s.t + 60_000).playT).toBeCloseTo(s.playT + CLOCK_AHEAD_MAX_MS / 1000, 5);
    const held = trip(new MirrorFeed(10).pack(source(m, 1, 0, { held: true })));
    expect(mirrorClocks(held, held.t + 500).playT).toBeCloseTo(held.playT, 5);
  });
});
