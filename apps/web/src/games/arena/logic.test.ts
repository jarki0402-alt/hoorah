import {
  FRUITS,
  INPUT_OP,
  lookOfFruit,
  PAD_ACTION,
  PLAYER_COLORS,
  type PlayerInfo,
  packStick,
  STICK_OP,
} from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { seeded } from '../../shared/art/svg';
import { fieldSkills, Sensors, SnakeBrain } from './brain';
import { type PadCommand, PadInputs, STALE_INPUT_MS } from './input';
import { boxAspect, fitArena } from './layout';
import {
  type ArenaEvent,
  ArenaMatch,
  arenaSize,
  DEFAULT_TUNING,
  insideArena,
  PELLET_AMBIENT,
  PELLET_DROP,
  PELLET_SHED,
  parseRounds,
  STICK_DEADZONE,
  wrapAngle,
} from './logic';
import { buildResult, pickAwards, soloOutcome } from './results';
import { formatClock } from './strings';
import { padView, viewFor } from './views';

const STEP = 1000 / 60;
const T = DEFAULT_TUNING;

function player(id: number, connected = true): PlayerInfo {
  const i = Math.abs(id) - 1;
  return {
    id,
    name: `P${id}`,
    fruit: FRUITS[i % FRUITS.length]!,
    look: lookOfFruit(FRUITS[i % FRUITS.length]!),
    color: PLAYER_COLORS[i % PLAYER_COLORS.length]!,
    connected,
    isHost: id === 1,
  };
}

function run(m: ArenaMatch, ms: number, events?: ArenaEvent[]): void {
  for (let t = 0; t < ms - 1e-6; t += STEP) {
    m.update(Math.min(STEP, ms - t));
    const e = m.drainEvents();
    if (events) events.push(...e);
  }
}

/** A match with `n` players, already in the play phase. */
function playing(n: number, roundMs = 60_000): ArenaMatch {
  const m = new ArenaMatch({ roundMs, aspect: 1.5, rnd: seeded(7) });
  m.setPlayers(Array.from({ length: n }, (_, i) => player(i + 1)));
  run(m, T.introMs + 3 * T.countMs + 50);
  expect(m.phase).toBe('play');
  m.drainEvents();
  return m;
}

describe('setup', () => {
  it('parses the round length in minutes', () => {
    expect(parseRounds(2)).toBe(2);
    expect(parseRounds('3')).toBe(3);
    expect(parseRounds(undefined)).toBe(3);
    expect(parseRounds(0)).toBe(3);
    expect(parseRounds(99)).toBe(5);
  });

  it('grows the arena with the number of snakes and keeps the screen shape', () => {
    const two = arenaSize(2, 1.5);
    const eight = arenaSize(8, 1.5);
    expect(two.w / two.h).toBeCloseTo(1.5, 1);
    expect(eight.w * eight.h).toBeGreaterThan(two.w * two.h * 2);
    expect(eight.w * eight.h).toBeLessThan(two.w * two.h * 2.6);
    // A one-snake field still gets a two-snake arena; extreme screens are clamped.
    expect(arenaSize(1, 1.5)).toEqual(two);
    const wide = arenaSize(4, 5);
    expect(wide.w / wide.h).toBeCloseTo(1.9, 1);
  });

  it('knows the rounded arena edge', () => {
    expect(insideArena(100, 100, 800, 600, 60, 10)).toBe(true);
    expect(insideArena(5, 300, 800, 600, 60, 10)).toBe(false);
    // Inside the bounding box but outside the rounded corner.
    expect(insideArena(14, 14, 800, 600, 60, 10)).toBe(false);
    expect(insideArena(60, 60, 800, 600, 60, 10)).toBe(true);
  });

  it('fits the arena into the lawn space on every screen shape', () => {
    for (const [w, h] of [
      [1280, 720],
      [1280, 800],
      [1280, 960],
      [1707, 720],
    ] as const) {
      const size = arenaSize(5, boxAspect(w, h));
      const v = fitArena(w, h, size.w, size.h);
      expect(v.x).toBeGreaterThan(0);
      expect(v.y).toBeGreaterThan(0);
      expect(v.x + v.w).toBeLessThan(w - 256);
      expect(v.y + v.h).toBeLessThan(h);
    }
  });

  it('formats the clock', () => {
    expect(formatClock(180_000)).toBe('3:00');
    expect(formatClock(9_001)).toBe('0:10');
    expect(formatClock(-5)).toBe('0:00');
  });
});

describe('phases', () => {
  it('runs intro, a 3-2-1 countdown, the round, the podium and ends', () => {
    const m = new ArenaMatch({ roundMs: 20_000, aspect: 1.5, rnd: seeded(3) });
    m.setPlayers([player(1), player(2)]);
    const events: ArenaEvent[] = [];
    expect(m.phase).toBe('intro');
    expect(m.pellets.ambient).toBe(m.ambientTarget());
    run(m, T.introMs + 10, events);
    expect(m.phase).toBe('countdown');
    expect(m.field().every((s) => s.alive)).toBe(true);
    run(m, 3 * T.countMs, events);
    expect(m.phase).toBe('play');
    const counts = events.filter((e) => e.type === 'count').map((e) => (e.type === 'count' ? e.value : 0));
    expect(counts).toEqual([3, 2, 1]);
    expect(events.some((e) => e.type === 'go')).toBe(true);
    // Keep both snakes cruising in circles so nobody dies on the way.
    for (const s of m.field()) m.setInput(s.id, 1, false);
    run(m, 20_000, events);
    expect(m.phase).toBe('over');
    expect(events.some((e) => e.type === 'warning')).toBe(true);
    const ticks = events.filter((e) => e.type === 'tick').map((e) => (e.type === 'tick' ? e.left : 0));
    expect(ticks).toEqual([5, 4, 3, 2, 1]);
    expect(events.some((e) => e.type === 'timeUp')).toBe(true);
    run(m, T.overMs + 10);
    expect(m.phase).toBe('podium');
    run(m, T.podiumMs + 10);
    expect(m.phase).toBe('done');
  });

  it('starts everyone on a ring, apart and inside the arena', () => {
    const m = playing(8);
    const field = m.field();
    expect(field).toHaveLength(8);
    for (const a of field) {
      expect(insideArena(a.x, a.y, m.width, m.height, m.corner, a.radius)).toBe(true);
      for (const b of field) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(120);
    }
  });
});

describe('movement', () => {
  it('moves at cruising speed, turns at a finite rate and lays an even trail', () => {
    const m = playing(2);
    m.placeAt(1, 200, 300, 0);
    m.placeAt(2, 600, 100, 0);
    run(m, 1000);
    const s = m.snake(1)!;
    expect(s.x).toBeCloseTo(200 + T.speed, 0);
    expect(s.y).toBeCloseTo(300, 3);
    for (let j = 0; j < 10; j++) {
      expect(Math.hypot(s.px(j) - s.px(j + 1), s.py(j) - s.py(j + 1))).toBeCloseTo(T.spacing, 3);
    }
    m.setInput(1, 1, false);
    run(m, 500);
    expect(s.angle).toBeCloseTo(T.turnRate * 0.5, 1);
    m.setInput(1, -1, false);
    run(m, 500);
    expect(s.angle).toBeCloseTo(0, 1);
  });

  it('heads where the joystick points along a smooth arc at the normal turn rate', () => {
    const m = playing(2);
    m.placeAt(1, 300, 300, 0);
    m.placeAt(2, 900, 100, 0);
    const s = m.snake(1)!;
    m.setStick(1, 0, 1, false); // straight down the screen
    run(m, 200);
    expect(s.angle).toBeCloseTo(T.turnRate * 0.2, 1);
    expect(s.steer).toBeCloseTo(1, 5);
    run(m, 600);
    expect(s.angle).toBeCloseTo(Math.PI / 2, 5);
    expect(s.steer).toBeCloseTo(0, 5);
    // Up and to the left: the shorter way round (through straight left), never a snap.
    m.setStick(1, -0.7, -0.7, false);
    let last = s.angle;
    for (let i = 0; i < 90; i++) {
      run(m, STEP);
      expect(Math.abs(wrapAngle(s.angle - last))).toBeLessThanOrEqual(T.turnRate * (STEP / 1000) + 1e-6);
      last = s.angle;
    }
    expect(s.angle).toBeCloseTo((-3 * Math.PI) / 4, 5);
  });

  it('keeps the heading when the stick is released or barely pushed', () => {
    const m = playing(2);
    m.placeAt(1, 300, 300, 0.4);
    m.placeAt(2, 900, 100, 0);
    const s = m.snake(1)!;
    m.setStick(1, 0, -1, false);
    run(m, 100);
    const turned = s.angle;
    expect(turned).toBeLessThan(0.4);
    m.setStick(1, 0, 0, false);
    run(m, 500);
    expect(s.angle).toBeCloseTo(turned, 6);
    m.setStick(1, STICK_DEADZONE * 0.6, STICK_DEADZONE * 0.6, false);
    run(m, 500);
    expect(s.angle).toBeCloseTo(turned, 6);
    expect(s.steer).toBe(0);
  });

  it('turns all the way round for a target straight behind without dithering', () => {
    const m = playing(2);
    m.placeAt(1, 300, 330, 0);
    m.placeAt(2, 900, 100, 0);
    const s = m.snake(1)!;
    m.setStick(1, -1, 0, false);
    let side = 0;
    for (let i = 0; i < 70; i++) {
      run(m, STEP);
      if (s.steer !== 0) {
        if (side === 0) side = Math.sign(s.steer);
        expect(Math.sign(s.steer)).toBe(side);
      }
    }
    expect(Math.abs(s.angle)).toBeCloseTo(Math.PI, 5);
  });

  it('turns a little wider while boosting with the stick, and the held turn of a computer snake still works', () => {
    const m = playing(2);
    m.placeAt(1, 300, 300, 0);
    m.placeAt(2, 900, 100, 0);
    const s = m.snake(1)!;
    m.setStick(1, 0, 1, true);
    run(m, 200);
    expect(s.boosting).toBe(true);
    expect(s.angle).toBeCloseTo(T.boostTurnRate * 0.2, 1);
    m.setInput(1, -1, false);
    expect(Number.isNaN(s.aim)).toBe(true);
    const before = s.angle;
    run(m, 200);
    expect(s.angle).toBeCloseTo(before - T.turnRate * 0.2, 1);
    expect(s.boosting).toBe(false);
  });

  it('samples the body head first with the exact tail end', () => {
    const m = playing(2);
    m.placeAt(1, 300, 300, 0);
    const s = m.snake(1)!;
    const out = new Float32Array(200);
    const n = m.sampleBody(s, 1, out);
    expect(n).toBe(T.baseLen + 1);
    expect(out[0]).toBeCloseTo(300);
    expect(out[(n - 1) * 2]).toBeCloseTo(300 - T.baseLen * T.spacing, 3);
    expect(m.sampleBody(s, 2, out)).toBe(T.baseLen / 2 + 1);
  });
});

describe('seeds', () => {
  it('grows by the value of the seeds eaten, pulling nearby seeds in', () => {
    const m = playing(2);
    m.placeAt(1, 200, 300, 0);
    m.placeAt(2, 600, 100, 0);
    m.pellets.clear();
    m.pellets.add(PELLET_AMBIENT, 260, 316, 2, 0xffd84d, m.now, 0);
    const events: ArenaEvent[] = [];
    run(m, 500, events);
    const s = m.snake(1)!;
    expect(s.len).toBe(T.baseLen + 2 * T.foodLen);
    expect(s.eaten).toBe(1);
    expect(events.find((e) => e.type === 'eat')).toMatchObject({ id: 1, value: 2 });
  });

  it('regrows ambient seeds toward the target', () => {
    const m = playing(2);
    m.pellets.clear();
    run(m, 2000);
    // About ten seeds per second per million square units of arena.
    const rate = (T.regrowRate * m.width * m.height) / 1e6;
    expect(m.pellets.ambient).toBeGreaterThan(rate * 2 - 3);
    run(m, 20_000);
    expect(m.pellets.ambient).toBeLessThanOrEqual(m.ambientTarget());
  });
});

describe('knock-outs', () => {
  it('knocks out a head that touches another body and credits the owner', () => {
    const m = playing(2);
    m.placeAt(1, 300, 330, 0);
    m.placeAt(2, 360, 420, Math.PI / 2);
    m.pellets.clear();
    const events: ArenaEvent[] = [];
    run(m, 600, events);
    const a = m.snake(1)!;
    const b = m.snake(2)!;
    expect(a.alive).toBe(false);
    expect(b.alive).toBe(true);
    expect(b.kos).toBe(1);
    expect(a.deaths).toBe(1);
    expect(events.find((e) => e.type === 'ko')).toMatchObject({
      id: 1,
      by: 2,
      cause: 'body',
      len: T.baseLen,
    });
    // The body burst into big seeds.
    let drops = 0;
    for (let i = 0; i < m.pellets.span; i++) if (m.pellets.kind[i] === PELLET_DROP) drops++;
    expect(drops).toBeGreaterThanOrEqual(3);
  });

  it('brings a knocked-out snake back after 3 s, blinking and untouchable for 2 s', () => {
    const m = playing(2);
    m.placeAt(1, 300, 330, 0);
    m.placeAt(2, 360, 420, Math.PI / 2);
    run(m, 600);
    const a = m.snake(1)!;
    expect(a.alive).toBe(false);
    expect(m.respawnLeft(a)).toBeGreaterThan(2000);
    let waited = 0;
    while (!a.alive && waited < T.respawnMs + 100) {
      m.update(STEP);
      waited += STEP;
    }
    expect(a.alive).toBe(true);
    expect(waited).toBeGreaterThan(T.respawnMs - 700);
    // Back at the base length (it may have caught a seed on the very first step).
    expect(a.len).toBeGreaterThanOrEqual(T.baseLen);
    expect(a.len).toBeLessThan(T.baseLen + 10);
    expect(m.isProtected(a)).toBe(true);
    // Drive the protected head straight through the other snake's body: nothing happens.
    const b = m.snake(2)!;
    m.placeAt(2, a.x + 60, a.y + 90, -Math.PI / 2);
    m.setInput(2, 0, false);
    a.angle = 0;
    run(m, 500);
    expect(a.alive).toBe(true);
    expect(b.alive).toBe(true);
    run(m, T.protectMs);
    expect(m.isProtected(a)).toBe(false);
  });

  it('knocks out both snakes in a head-to-head without credit', () => {
    const m = playing(2);
    m.placeAt(1, 300, 300, 0);
    m.placeAt(2, 420, 300, Math.PI);
    const events: ArenaEvent[] = [];
    run(m, 600, events);
    expect(m.snake(1)!.alive).toBe(false);
    expect(m.snake(2)!.alive).toBe(false);
    expect(m.snake(1)!.kos + m.snake(2)!.kos).toBe(0);
    expect(events.filter((e) => e.type === 'ko' && e.cause === 'head')).toHaveLength(2);
  });

  it('knocks out a snake that hits the arena edge', () => {
    const m = playing(2);
    m.placeAt(1, m.width - 60, m.height / 2, 0);
    m.placeAt(2, 200, 100, Math.PI);
    m.setInput(2, 1, false);
    const events: ArenaEvent[] = [];
    run(m, 600, events);
    expect(m.snake(1)!.alive).toBe(false);
    expect(events.find((e) => e.type === 'ko')).toMatchObject({ id: 1, cause: 'wall', by: null });
  });

  it('bounces a protected snake off the edge instead', () => {
    const m = playing(2);
    m.placeAt(1, m.width - 60, m.height / 2, 0, true);
    run(m, 800);
    const s = m.snake(1)!;
    expect(s.alive).toBe(true);
    expect(Math.cos(s.angle)).toBeLessThan(0);
  });
});

describe('boost', () => {
  it('goes faster and sheds length as seeds, never below the minimum', () => {
    const m = playing(2);
    m.placeAt(1, 100, 300, 0);
    m.placeAt(2, 600, 100, Math.PI);
    m.setInput(2, 1, false);
    m.pellets.clear();
    m.setInput(1, 0, true);
    run(m, 640);
    const s = m.snake(1)!;
    expect(s.boosting).toBe(true);
    expect(s.x).toBeCloseTo(100 + T.boostSpeed * 0.64, -1);
    expect(s.len).toBe(T.baseLen - 4);
    let shed = 0;
    for (let i = 0; i < m.pellets.span; i++) if (m.pellets.kind[i] === PELLET_SHED) shed++;
    expect(shed).toBe(4);
    run(m, 1500);
    expect(s.len).toBe(T.minBoostLen);
    expect(s.boosting).toBe(false);
    expect(s.boostMs).toBeGreaterThan(1000);
  });
});

describe('players', () => {
  it('lets a late joiner in shortly after, and removes a player who leaves', () => {
    const m = playing(2);
    m.setPlayers([player(1), player(2), player(3)]);
    const c = m.snake(3)!;
    expect(c.inMatch).toBe(true);
    expect(c.alive).toBe(false);
    const events: ArenaEvent[] = [];
    run(m, T.joinDelayMs + 50, events);
    expect(c.alive).toBe(true);
    expect(m.isProtected(c)).toBe(true);
    expect(events.find((e) => e.type === 'spawn')).toMatchObject({ id: 3, first: true });
    m.setPlayers([player(1), player(3)]);
    expect(m.snake(2)!.gone).toBe(true);
    expect(m.field().map((s) => s.id)).toEqual([1, 3]);
    expect(m.drainEvents().some((e) => e.type === 'removed' && e.id === 2)).toBe(true);
  });

  it('keeps a dropped phone on the field (the driver steers it)', () => {
    const m = playing(2);
    m.setPlayers([player(1), player(2, false)]);
    expect(m.snake(2)!.connected).toBe(false);
    expect(m.snake(2)!.gone).toBe(false);
    expect(m.field()).toHaveLength(2);
  });

  it("keeps each snake's look and follows a restyle", () => {
    const m = playing(2);
    expect(m.snake(2)!.look).toEqual(player(2).look);
    m.setPlayers([player(1), { ...player(2), look: { c: 'kai', s: 4 } }]);
    expect(m.snake(2)!.look).toEqual({ c: 'kai', s: 4 });
  });
});

describe('standings and results', () => {
  it('ranks by length at the whistle, then knock-outs, sharing ties', () => {
    const m = playing(3);
    const [a, b, c] = [m.snake(1)!, m.snake(2)!, m.snake(3)!];
    a.len = 40;
    b.len = 40;
    c.len = 55;
    b.kos = 2;
    let rows = m.standings();
    expect(rows.map((r) => [r.snake.id, r.rank])).toEqual([
      [3, 1],
      [2, 2],
      [1, 3],
    ]);
    b.kos = 0;
    rows = m.standings();
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 2]);
    // Knocked out at the whistle counts as zero.
    c.alive = false;
    rows = m.standings();
    expect(rows[2]).toMatchObject({ final: 0 });
    expect(rows[2]!.snake.id).toBe(3);
  });

  it('builds the result with a winner, labels and spread awards', () => {
    const m = playing(2);
    const [a, b] = [m.snake(1)!, m.snake(2)!];
    a.len = 80;
    a.best = 95;
    a.kos = 3;
    a.eaten = 60;
    b.len = 30;
    b.best = 30;
    b.eaten = 70;
    b.boostMs = 9000;
    const res = buildResult(m.standings());
    expect(res.title).toBe('P1 juara!');
    // Lengths are shown in seed points: 80 units of body read as 200.
    expect(res.subtitle).toContain('200');
    expect(res.ranking[0]).toMatchObject({ playerId: 1, score: 200, rank: 1 });
    const awards = res.awards ?? [];
    expect(awards.length).toBeLessThanOrEqual(3);
    expect(new Set(awards.map((w) => w.playerId))).toEqual(new Set([1, 2]));
    expect(soloOutcome(res, 1)).toBe('win');
    expect(soloOutcome(res, 2)).toBe('lose');
    expect(soloOutcome(res, 99)).toBeNull();
  });

  it('calls a shared first place a tie', () => {
    const m = playing(2);
    m.snake(1)!.len = 50;
    m.snake(2)!.len = 50;
    const res = buildResult(m.standings());
    expect(res.title).toContain('Seri');
    expect(soloOutcome(res, 1)).toBe('draw');
  });

  it('gives no award nobody earned', () => {
    const m = playing(2);
    for (const s of m.field()) {
      s.best = 0;
      s.eaten = 0;
    }
    expect(pickAwards(m.standings())).toEqual([]);
  });
});

describe('phone views', () => {
  it('shows the steering pad while alive and locks it with a countdown while knocked out', () => {
    const m = playing(2);
    m.placeAt(1, 300, 330, 0);
    m.placeAt(2, 360, 420, Math.PI / 2);
    const s = m.snake(1)!;
    const alive = padView(m, s, 1, 2);
    expect(alive).toMatchObject({ kind: 'pad', mode: 'stick', title: 'Panjang 50' });
    expect(alive.kind === 'pad' && alive.buttons?.map((b) => [b.label, b.press])).toEqual([
      ['NGEBUT', 'hold'],
    ]);
    expect(alive.kind === 'pad' && alive.locked).toBeFalsy();
    run(m, 600);
    const out = viewFor(m, 1, 2, 2, null);
    expect(out).toMatchObject({ kind: 'pad', locked: true, banner: 'Hidup lagi dalam 3…' });
  });

  it('shows the countdown before the start and the result at the end', () => {
    const m = new ArenaMatch({ roundMs: 10_000, aspect: 1.5, rnd: seeded(5) });
    m.setPlayers([player(1), player(2)]);
    run(m, T.introMs + 10);
    expect(viewFor(m, 1, 1, 2, null)).toMatchObject({ kind: 'countdown', value: '3' });
    run(m, 3 * T.countMs + 10_100);
    const res = buildResult(m.standings());
    expect(viewFor(m, 1, 1, 2, res).kind).toBe('result');
    expect(viewFor(m, 42, 1, 2, res).kind).toBe('message');
  });
});

describe('phone input', () => {
  it('tracks the stick and the boost button apart', () => {
    const pads = new PadInputs();
    const right = packStick(1, 0);
    expect(pads.frame(1, STICK_OP, right, 0)).toMatchObject({ x: 1, y: 0, boost: false });
    expect(pads.frame(1, INPUT_OP, PAD_ACTION, 10)).toMatchObject({ x: 1, y: 0, boost: true });
    expect(pads.frame(1, STICK_OP, packStick(0, -1), 20)).toMatchObject({ x: 0, y: -1, boost: true });
    expect(pads.frame(1, STICK_OP, 0, 30)).toMatchObject({ x: 0, y: 0, boost: true });
    expect(pads.frame(1, INPUT_OP, 0, 40)).toMatchObject({ x: 0, y: 0, boost: false });
    expect(pads.frame(1, 9, PAD_ACTION, 50)).toBeNull();
    // Another phone starts clean.
    expect(pads.frame(2, INPUT_OP, PAD_ACTION, 50)).toMatchObject({ x: 0, y: 0, boost: true });
  });

  it('releases a channel that went silent, and only that one', () => {
    const pads = new PadInputs();
    const got: Array<[number, PadCommand]> = [];
    const apply = (id: number, cmd: PadCommand) => got.push([id, cmd]);
    pads.frame(1, STICK_OP, packStick(0.5, 0.5), 0);
    pads.frame(1, INPUT_OP, PAD_ACTION, 0);
    // The stick keeps repeating; the boost release got lost.
    for (let t = 250; t <= STALE_INPUT_MS + 250; t += 250) pads.frame(1, STICK_OP, packStick(0.5, 0.5), t);
    pads.releaseStale(STALE_INPUT_MS + 300, apply);
    expect(got).toHaveLength(1);
    expect(got[0]![1].boost).toBe(false);
    expect(got[0]![1].x).toBeCloseTo(0.5, 1);
    // Now the stick goes quiet too.
    pads.releaseStale(STALE_INPUT_MS * 3, apply);
    expect(got).toHaveLength(2);
    expect(got[1]![1]).toEqual({ x: 0, y: 0, boost: false });
    // Nothing held: nothing more to release.
    pads.releaseStale(STALE_INPUT_MS * 9, apply);
    expect(got).toHaveLength(2);
  });

  it('steers the match from phone frames', () => {
    const m = playing(2);
    m.placeAt(1, 300, 300, 0);
    m.placeAt(2, 900, 100, 0);
    const pads = new PadInputs();
    const cmd = pads.frame(1, STICK_OP, packStick(0, 1), 0)!;
    m.setStick(1, cmd.x, cmd.y, cmd.boost);
    run(m, 1000);
    expect(m.snake(1)!.angle).toBeCloseTo(Math.PI / 2, 2);
  });
});

describe('computer snakes', () => {
  it('spreads the solo field around the remembered skill', () => {
    const s = fieldSkills(0.5, 4);
    expect(s).toHaveLength(4);
    expect(Math.min(...s)).toBeLessThan(0.5);
    expect(Math.max(...s)).toBeGreaterThan(0.5);
    expect(fieldSkills(0.99, 4).every((v) => v <= 0.95)).toBe(true);
  });

  it('survive, eat and grow on their own', () => {
    const m = new ArenaMatch({ roundMs: 60_000, aspect: 1.5, rnd: seeded(11) });
    m.setPlayers([-1, -2, -3, -4, -5].map((id) => player(id)));
    run(m, T.introMs + 3 * T.countMs + 50);
    const sensors = new Sensors();
    const brains = new Map(m.field().map((s, i) => [s.id, new SnakeBrain(0.85, seeded(100 + i))]));
    let walls = 0;
    for (let t = 0; t < 30_000; t += STEP) {
      for (const [id, brain] of brains) {
        const cmd = brain.update(m, m.snake(id)!, sensors);
        m.setInput(id, cmd.turn, cmd.boost);
      }
      m.update(STEP);
      for (const e of m.drainEvents()) if (e.type === 'ko' && e.cause === 'wall') walls++;
    }
    const eaten = m.field().reduce((n, s) => n + s.eaten, 0);
    const best = Math.max(...m.field().map((s) => s.best));
    expect(eaten).toBeGreaterThan(60);
    expect(best).toBeGreaterThan(T.baseLen + 15);
    expect(walls).toBeLessThanOrEqual(2);
  });
});
