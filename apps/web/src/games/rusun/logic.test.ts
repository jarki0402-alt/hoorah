import { afterEach, describe, expect, it, vi } from 'vitest';
import { floorWidth } from '../../shared/art/rusun';
import { submitRecord } from '../common/records';
import {
  analyzeBalance,
  balanceZone,
  CENTER_X,
  COLLAPSE_MS,
  FALL_MS,
  FINALE_MS,
  type Floor,
  findUnstableFloor,
  GameClock,
  INTRO_MS,
  MAX_HEIGHT,
  MISS_SETTLE_MS,
  PAS_PX,
  type RusunEvent,
  RusunLogic,
  resolveDrop,
  SETTLE_MS,
  SURVIVE_BONUS,
  SWING_AMPLITUDE,
  SWING_DEFAULTS,
  swingPeriod,
  swingPosition,
  swingX,
  TURN_MS,
} from './logic';
import { buildResult, pickAwards, rankStandings, recordKind, soloRecord } from './results';
import { STR } from './strings';
import { finalView, turnView } from './views';

const rankLabelOf = (s: { floors: number; pas: number; misses: number }) =>
  STR.rankLabel(s.floors, s.pas, s.misses);

const roster = (...ids: number[]) => ids.map((id) => ({ id, connected: true }));

function newGame(ids: number[], rounds = 1, now = 0) {
  return new RusunLogic({ rounds, roster: roster(...ids), now });
}

/** Run until the first turn starts and return the game at that moment. */
function toFirstTurn(g: RusunLogic) {
  g.tick(INTRO_MS);
  expect(g.phase).toBe('aim');
  return g.turnStartAt;
}

/** First time in the current turn where the swing passes `x` (scan per ms, then bisect). */
function timeAtX(g: RusunLogic, x: number): number {
  const side = (t: number) => Math.sign(g.swingX(t) - x);
  const s0 = side(g.turnStartAt);
  if (s0 === 0) return g.turnStartAt;
  for (let t = g.turnStartAt + 1; t <= g.turnStartAt + g.swing.period; t++) {
    if (side(t) === s0) continue;
    let lo = t - 1;
    let hi = t;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (side(mid) === s0) lo = mid;
      else hi = mid;
    }
    return hi;
  }
  throw new Error(`the swing never reaches x = ${x}`);
}

/** Drop so the floor lands `offset` px from the (swaying) top center. Returns the land time. */
function dropAtOffset(g: RusunLogic, offset: number): number {
  const target = g.top.x + offset;
  // With no wobble there is no sway, so the target is static.
  const t = timeAtX(g, target);
  expect(g.drop(g.current!, t, t)).toBe(true);
  const land = t + FALL_MS;
  g.tick(land);
  return land;
}

function events(g: RusunLogic): RusunEvent['type'][] {
  return g.drain().map((e) => e.type);
}

describe('swing', () => {
  it('swings like a pendulum: center at phase 0, right end at 0.25, left end at 0.75', () => {
    const swing = { start: 1000, period: 2000 };
    expect(swingX(swing, 1000)).toBeCloseTo(CENTER_X);
    expect(swingX(swing, 1500)).toBeCloseTo(CENTER_X + SWING_AMPLITUDE);
    expect(swingX(swing, 2000)).toBeCloseTo(CENTER_X);
    expect(swingX(swing, 2500)).toBeCloseTo(CENTER_X - SWING_AMPLITUDE);
    expect(swingX(swing, 3000)).toBeCloseTo(CENTER_X);
    // Never past the ends.
    for (let t = 0; t < 4000; t += 7)
      expect(Math.abs(swingX(swing, t) - CENTER_X)).toBeLessThanOrEqual(SWING_AMPLITUDE + 1e-9);
  });

  it('is fastest over the center and eases smoothly into each end (no jerk)', () => {
    const v = (u: number) => (swingPosition(u + 1e-5) - swingPosition(u - 1e-5)) / 2e-5;
    expect(Math.abs(v(0))).toBeCloseTo(2 * Math.PI, 3);
    expect(Math.abs(v(0.25))).toBeLessThan(1e-3);
    expect(Math.abs(v(0.75))).toBeLessThan(1e-3);
    // Continuous everywhere: no step between two close phases.
    for (let u = 0; u < 1; u += 0.001)
      expect(Math.abs(swingPosition(u + 0.001) - swingPosition(u))).toBeLessThan(0.007);
    // The way back mirrors the way there.
    expect(swingPosition(0.1)).toBeCloseTo(-swingPosition(0.6));
  });

  it('stays a fair timing game: the window to land PAS over the center stays playable', () => {
    const midSpeed = (period: number) => (2 * Math.PI * SWING_AMPLITUDE) / period;
    // PAS needs the drop within PAS_PX of the center: at least ~30 ms either way, even at the fastest.
    expect(PAS_PX / midSpeed(SWING_DEFAULTS.minPeriodMs)).toBeGreaterThan(14);
    expect(midSpeed(SWING_DEFAULTS.periodMs)).toBeLessThan(0.4);
    expect(midSpeed(SWING_DEFAULTS.minPeriodMs)).toBeGreaterThan(0.5);
  });

  it('starts at 3400 ms (1.7 s per side), 1.5 % faster per placed floor, down to 2400 ms', () => {
    expect(SWING_DEFAULTS).toEqual({ periodMs: 3400, speedup: 0.015, minPeriodMs: 2400 });
    expect(swingPeriod(1)).toBe(3400);
    expect(swingPeriod(2)).toBeCloseTo(3400 * 0.985);
    expect(swingPeriod(11)).toBeCloseTo(3400 * 0.985 ** 10);
    expect(swingPeriod(23)).toBeGreaterThan(2400);
    expect(swingPeriod(30)).toBe(2400);
  });

  it('takes its timing from the Lab override, kept within sane limits', () => {
    const tune = { periodMs: 3000, speedup: 0.02, minPeriodMs: 2000 };
    expect(swingPeriod(1, tune)).toBe(3000);
    expect(swingPeriod(3, tune)).toBeCloseTo(3000 * 0.98 ** 2);
    expect(swingPeriod(1, { periodMs: 1500, speedup: 0.02, minPeriodMs: 2000 })).toBe(2000);
    expect(swingPeriod(5, { periodMs: 3000, speedup: -1, minPeriodMs: 2000 })).toBe(3000);
    const g = new RusunLogic({ rounds: 1, roster: roster(1), now: 0, swing: { periodMs: 4000 } });
    toFirstTurn(g);
    expect(g.swing.period).toBe(4000);
    expect(g.swingTune).toEqual({ ...SWING_DEFAULTS, periodMs: 4000 });
  });

  it('starts each turn at an end of the swing, alternating sides', () => {
    const g = newGame([1]);
    const t0 = toFirstTurn(g);
    expect(g.swingX(t0)).toBeCloseTo(CENTER_X + SWING_AMPLITUDE);
    const land = dropAtOffset(g, 30);
    g.tick(land + SETTLE_MS);
    expect(g.phase).toBe('aim');
    expect(g.swingX(g.turnStartAt)).toBeCloseTo(CENTER_X - SWING_AMPLITUDE);
    expect(g.swing.period).toBeCloseTo(SWING_DEFAULTS.periodMs * 0.985);
  });

  it('sends the phone a plain button without a position indicator', () => {
    const v = turnView(4, 9000.4);
    expect(v).toEqual({
      kind: 'button',
      eyebrow: 'GILIRANMU!',
      title: 'Lantai 4 · makin sempit',
      label: 'JATUHKAN',
      hint: 'Lihat crane di layar, tekan saat lantai tepat di atas menara.',
      deadline: 9000,
    });
  });
});

describe('turn order', () => {
  it('follows join order and wraps', () => {
    const g = newGame([5, 2, 9]);
    toFirstTurn(g);
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      seen.push(g.current!);
      const land = dropAtOffset(g, 0);
      g.tick(land + SETTLE_MS);
    }
    expect(seen).toEqual([5, 2, 9, 5]);
  });

  it('skips disconnected players and the current player when they drop out', () => {
    const g = newGame([1, 2, 3]);
    toFirstTurn(g);
    expect(g.current).toBe(1);
    g.drain();
    g.setRoster(
      [
        { id: 1, connected: false },
        { id: 2, connected: true },
        { id: 3, connected: true },
      ],
      INTRO_MS + 500,
    );
    expect(g.current).toBe(2);
    const turn = g.drain().find((e) => e.type === 'turn');
    expect(turn).toMatchObject({ type: 'turn', playerId: 2, skipped: 1 });
    expect(g.deadline).toBe(INTRO_MS + 500 + TURN_MS);
    const land = dropAtOffset(g, 0);
    g.tick(land + SETTLE_MS);
    expect(g.current).toBe(3);
    const land2 = dropAtOffset(g, 0);
    g.tick(land2 + SETTLE_MS);
    expect(g.current).toBe(2);
  });

  it('waits when nobody is connected and resumes on reconnect', () => {
    const g = newGame([1]);
    toFirstTurn(g);
    g.setRoster([{ id: 1, connected: false }], 3000);
    expect(g.phase).toBe('waiting');
    g.tick(60_000);
    expect(g.phase).toBe('waiting');
    g.setRoster([{ id: 1, connected: true }], 61_000);
    expect(g.phase).toBe('aim');
    expect(g.current).toBe(1);
    expect(g.deadline).toBe(61_000 + TURN_MS);
  });

  it('adds late joiners at the end of the order', () => {
    const g = newGame([1, 2]);
    toFirstTurn(g);
    g.setRoster(roster(1, 2, 7), INTRO_MS + 10);
    expect(g.order).toEqual([1, 2, 7]);
    expect(g.nextPlayer(2)).toBe(7);
    expect(g.nextPlayer(7)).toBe(1);
  });
});

describe('drop', () => {
  it('ignores presses from other players, outside a turn and stale ones', () => {
    const g = newGame([1, 2]);
    expect(g.drop(1, 100, 100)).toBe(false);
    const t0 = toFirstTurn(g);
    expect(g.drop(2, t0 + 100, t0 + 100)).toBe(false);
    expect(g.drop(1, t0 - 1000, t0 + 50)).toBe(false);
    expect(g.drop(1, t0 + 100, t0 + 150)).toBe(true);
    expect(g.drop(1, t0 + 120, t0 + 160)).toBe(false);
  });

  it('lets go where the floor is on the main screen when the press arrives, and falls straight down', () => {
    const g = newGame([1]);
    const t0 = toFirstTurn(g);
    const now = t0 + 2000;
    g.drop(1, now - 120, now);
    const f = g.fall!;
    expect(f.at).toBe(now);
    expect(f.dropX).toBeCloseTo(g.swingX(now));
    expect(f.fromX).toBe(f.dropX);
    expect(f.outcome.x).toBe(f.dropX);
    expect(f.startAt).toBe(now);
    expect(f.landAt).toBe(now + FALL_MS);
  });

  it('auto-drops at the deadline', () => {
    const g = newGame([1]);
    const t0 = toFirstTurn(g);
    g.drain();
    g.tick(t0 + TURN_MS + 5);
    const drop = g.drain().find((e) => e.type === 'drop');
    expect(drop).toBeDefined();
    expect(g.fall!.auto).toBe(true);
    expect(g.fall!.at).toBe(t0 + TURN_MS);
  });

  it('awards +2 on PAS and leaves the floor exactly where it fell', () => {
    const g = newGame([1, 2]);
    toFirstTurn(g);
    dropAtOffset(g, PAS_PX - 1);
    expect(g.floors).toHaveLength(2);
    expect(g.floors[1]!.x).toBeCloseTo(CENTER_X + PAS_PX - 1);
    const s = g.stats.get(1)!;
    expect(s).toMatchObject({ floors: 1, pas: 1, score: 2, streak: 1, bestStreak: 1 });
  });

  it('awards +1 and keeps the offset on a normal landing', () => {
    const g = newGame([1, 2]);
    toFirstTurn(g);
    dropAtOffset(g, 40);
    expect(g.floors[1]!.x).toBeCloseTo(CENTER_X + 40);
    expect(g.stats.get(1)).toMatchObject({ floors: 1, pas: 0, score: 1, streak: 0 });
    expect(g.balance).toBeCloseTo(40 / 200);
  });

  it('tracks the best PAS streak', () => {
    const g = newGame([1]);
    toFirstTurn(g);
    for (const off of [0, 2, -3, 30, 0, 1]) {
      const land = dropAtOffset(g, off);
      g.tick(land + SETTLE_MS);
    }
    expect(g.stats.get(1)).toMatchObject({ pas: 5, bestStreak: 3, streak: 2, floors: 6, score: 11 });
  });
});

describe('stability (pure geometry)', () => {
  it('reports balance as the worst load offset over half-width, toppling only past the edge', () => {
    const straight: Floor[] = [
      { x: 640, width: 400 },
      { x: 640, width: 382 },
    ];
    expect(analyzeBalance(straight)).toEqual({ ratio: 0, fail: null });
    const atEdge: Floor[] = [
      { x: 640, width: 400 },
      { x: 840, width: 382 },
    ];
    expect(analyzeBalance(atEdge).ratio).toBeCloseTo(1);
    expect(analyzeBalance(atEdge).fail).toBeNull();
    const leaning: Floor[] = [
      { x: 640, width: 400 },
      { x: 760, width: 382 },
      { x: 860, width: 364 },
    ];
    // Above floor 0: (382*760 + 364*860) / 746 = 808.8 -> 168.8 / 200.
    expect(analyzeBalance(leaning).ratio).toBeCloseTo(168.8 / 200, 2);
    expect(balanceZone(0.4)).toBe('green');
    expect(balanceZone(0.6)).toBe('yellow');
    expect(balanceZone(0.8)).toBe('red');
  });

  it('finds the lowest floor whose load lies past its edge', () => {
    const over: Floor[] = [
      { x: 640, width: 400 },
      { x: 780, width: 382 },
      { x: 950, width: 364 },
    ];
    // Above floor 0: (382*780 + 364*950) / 746 = 862.9 -> past 840.
    expect(findUnstableFloor(over)).toEqual({ index: 0, dir: 1 });
    const topOnly: Floor[] = [
      { x: 640, width: 400 },
      { x: 640, width: 382 },
      { x: 440, width: 364 },
    ];
    expect(findUnstableFloor(topOnly)).toEqual({ index: 1, dir: -1 });
  });

  it('extra weight on a leaning stack topples it around a lower floor', () => {
    const floors: Floor[] = [
      { x: 640, width: 400 },
      { x: 760, width: 382 },
      { x: 860, width: 364 },
    ];
    const o = resolveDrop(floors, floorWidth(3), 960);
    expect(o.kind).toBe('topple');
    expect(o.collapse).toEqual({ fromIndex: 1, dir: 1 });
    expect(o.balance).toBeGreaterThan(1);
  });

  it('a floor past the top edge is a miss: it tips off if it touches, else falls clear', () => {
    const floors: Floor[] = [{ x: 640, width: 400 }];
    const tip = resolveDrop(floors, floorWidth(1), 640 + 210);
    expect(tip).toMatchObject({ kind: 'miss', tip: true, collapse: null, points: 0 });
    const clear = resolveDrop(floors, floorWidth(1), 640 - 200 - floorWidth(1) / 2 - 1);
    expect(clear).toMatchObject({ kind: 'miss', tip: false });
    const edge = resolveDrop(floors, floorWidth(1), 640 + 200);
    expect(edge.kind).toBe('land');
  });

  it('PAS lands exactly where dropped and scores +1 extra', () => {
    const floors: Floor[] = [{ x: 640, width: 400 }];
    const o = resolveDrop(floors, floorWidth(1), 640 + PAS_PX);
    expect(o).toMatchObject({ kind: 'pas', x: 640 + PAS_PX, points: 2 });
    expect(o.balance).toBeCloseTo(PAS_PX / 200);
    expect(resolveDrop(floors, floorWidth(1), 640 + PAS_PX + 1).kind).toBe('land');
  });

  it('flags the balance entering red once', () => {
    const g = newGame([1]);
    toFirstTurn(g);
    g.drain();
    let land = dropAtOffset(g, 170);
    const first = g.drain().find((e) => e.type === 'land');
    expect(first).toMatchObject({ enteredRed: true });
    expect(g.balance).toBeCloseTo(0.85);
    g.tick(land + SETTLE_MS);
    g.drain();
    land = dropAtOffset(g, 0);
    const second = g.drain().find((e) => e.type === 'land');
    expect(second).toMatchObject({ enteredRed: false, pas: true });
  });
});

describe('rounds and scoring', () => {
  /**
   * Lean the existing floors to the right (test setup), then land one more at the swing's right
   * end: the load above the warung passes its edge and the stack topples there.
   */
  function collapseNow(g: RusunLogic): number {
    const reach = CENTER_X + SWING_AMPLITUDE - 0.1;
    g.floors[0]!.x = reach - 220;
    for (let k = 1; k < g.floors.length; k++)
      g.floors[k]!.x = Math.min(reach - 15, reach - 35 + 15 * (k - 1));
    const t = timeAtX(g, reach);
    g.drop(g.current!, t, t);
    g.tick(t + FALL_MS);
    expect(g.phase).toBe('collapse');
    expect(g.collapse).toMatchObject({ reason: 'topple', fromIndex: 1, dir: 1 });
    return t + FALL_MS;
  }

  /** A floor whose center lands past the top's edge: tips off, a miss. */
  function missNow(g: RusunLogic): number {
    // Test setup: a top narrow enough for the swing's ends to reach past its edge.
    g.top.width = Math.min(g.top.width, 300);
    return dropAtOffset(g, g.top.x >= CENTER_X ? -190 : 190);
  }

  it('a miss loses the turn, adds a strike, keeps the floor number and scores nothing', () => {
    const g = newGame([1, 2]);
    toFirstTurn(g);
    g.drain();
    const land = missNow(g);
    const miss = g.drain().find((e) => e.type === 'miss');
    expect(miss).toMatchObject({ type: 'miss', strikes: 1 });
    expect(g.phase).toBe('settle');
    expect(g.floors).toHaveLength(1);
    expect(g.balance).toBe(0);
    expect(g.strikesOf(1)).toBe(1);
    expect(g.stats.get(1)).toMatchObject({ misses: 1, score: 0, floors: 0, collapses: 0 });
    g.tick(land + MISS_SETTLE_MS);
    expect(g.current).toBe(2);
    expect(g.floorIndex).toBe(1);
  });

  it('three misses by one player in a round bring the tower down', () => {
    const g = newGame([1, 2]);
    toFirstTurn(g);
    let land = dropAtOffset(g, 0); // 1 lands
    g.tick(land + SETTLE_MS);
    land = dropAtOffset(g, 0); // 2 lands
    g.tick(land + SETTLE_MS);
    for (let k = 0; k < 2; k++) {
      land = missNow(g); // 1 misses
      g.tick(land + MISS_SETTLE_MS);
      land = dropAtOffset(g, 0); // 2 lands
      g.tick(land + SETTLE_MS);
    }
    expect(g.current).toBe(1);
    g.drain();
    missNow(g);
    expect(events(g)).toEqual(['drop', 'miss', 'collapse']);
    expect(g.collapse).toMatchObject({ playerId: 1, reason: 'strikes', dropped: false });
    expect(g.stats.get(1)!.collapses).toBe(1);
    expect(g.stats.get(2)!.score).toBe(3 * 2 + SURVIVE_BONUS);
  });

  it('strikes reset every round', () => {
    const g = newGame([1], 2);
    toFirstTurn(g);
    let land = 0;
    for (let k = 0; k < 3; k++) {
      land = missNow(g);
      if (k < 2) g.tick(land + MISS_SETTLE_MS);
    }
    expect(g.phase).toBe('collapse');
    g.tick(land + COLLAPSE_MS);
    expect(g.round).toBe(2);
    expect(g.strikesOf(1)).toBe(0);
  });

  it('a skyscraper at the height cap ends the round and everybody wins it', () => {
    const g = newGame([1, 2]);
    toFirstTurn(g);
    let land = 0;
    while (g.floors.length < MAX_HEIGHT - 1) {
      land = dropAtOffset(g, 0);
      g.tick(land + SETTLE_MS);
    }
    g.drain();
    land = dropAtOffset(g, 0);
    expect(events(g)).toEqual(['drop', 'land', 'topped']);
    expect(g.phase).toBe('topped');
    expect(g.topped).toMatchObject({ height: MAX_HEIGHT, lastRound: true });
    const placed = MAX_HEIGHT - 1;
    expect(g.stats.get(1)!.score).toBe(Math.ceil(placed / 2) * 2 + SURVIVE_BONUS);
    expect(g.stats.get(2)!.score).toBe(Math.floor(placed / 2) * 2 + SURVIVE_BONUS);
    g.tick(land + COLLAPSE_MS);
    expect(g.phase).toBe('finale');
  });

  it('gives everyone but the collapser the survival bonus and ends after the last round', () => {
    const g = newGame([1, 2, 3]);
    toFirstTurn(g);
    let land = dropAtOffset(g, 0); // player 1: +2
    g.tick(land + SETTLE_MS);
    land = dropAtOffset(g, 30); // player 2: +1
    g.tick(land + SETTLE_MS);
    g.drain();
    const at = collapseNow(g); // player 3 collapses
    const collapse = g.drain().find((e) => e.type === 'collapse');
    expect(collapse).toMatchObject({ info: { playerId: 3, floorNumber: 4, height: 3, lastRound: true } });
    expect(g.stats.get(1)!.score).toBe(2 + SURVIVE_BONUS);
    expect(g.stats.get(2)!.score).toBe(1 + SURVIVE_BONUS);
    expect(g.stats.get(3)!.score).toBe(0);
    expect(g.stats.get(3)!.collapses).toBe(1);
    g.tick(at + COLLAPSE_MS);
    expect(g.phase).toBe('finale');
    g.tick(at + COLLAPSE_MS + FINALE_MS);
    expect(g.phase).toBe('ended');
    expect(events(g)).toEqual(['finale', 'end']);
  });

  it('starts a fresh tower for the next round with the player after the collapser', () => {
    const g = newGame([1, 2, 3], 2);
    toFirstTurn(g);
    const land = dropAtOffset(g, 0);
    g.tick(land + SETTLE_MS);
    expect(g.current).toBe(2);
    const at = collapseNow(g);
    g.tick(at + COLLAPSE_MS);
    expect(g.phase).toBe('intro');
    expect(g.round).toBe(2);
    expect(g.floors).toHaveLength(1);
    expect(g.balance).toBe(0);
    g.tick(at + COLLAPSE_MS + INTRO_MS);
    expect(g.phase).toBe('aim');
    expect(g.current).toBe(3);
    expect(g.bestHeight).toBe(2);
  });

  it('keeps time frozen while paused', () => {
    let server = 10_000;
    const clock = new GameClock(() => server);
    expect(clock.now()).toBe(10_000);
    server = 11_000;
    clock.pause();
    server = 15_000;
    expect(clock.now()).toBe(11_000);
    clock.resume();
    expect(clock.now()).toBe(11_000);
    server = 15_500;
    expect(clock.now()).toBe(11_500);
    expect(clock.toServer(11_500)).toBe(15_500);
    expect(clock.toGame(15_400)).toBe(11_400);
  });

  it('a long pause never fires the deadline', () => {
    let server = 0;
    const clock = new GameClock(() => server);
    const g = new RusunLogic({ rounds: 1, roster: roster(1), now: clock.now() });
    server = INTRO_MS;
    g.tick(clock.now());
    server += 2000;
    clock.pause();
    server += 60_000;
    g.tick(clock.now());
    expect(g.phase).toBe('aim');
    clock.resume();
    server += TURN_MS - 2000 - 1;
    g.tick(clock.now());
    expect(g.phase).toBe('aim');
    server += 2;
    g.tick(clock.now());
    expect(g.phase).toBe('falling');
  });
});

describe('results', () => {
  const stat = (
    id: number,
    o: Partial<{
      floors: number;
      pas: number;
      bestStreak: number;
      score: number;
      collapses: number;
      misses: number;
    }>,
  ) => ({
    id,
    floors: 0,
    pas: 0,
    streak: 0,
    bestStreak: 0,
    score: 0,
    collapses: 0,
    misses: 0,
    ...o,
  });

  it('ranks by score with shared ranks', () => {
    const r = rankStandings([stat(1, { score: 5 }), stat(2, { score: 9 }), stat(3, { score: 5 })], false);
    expect(r.map((s) => [s.id, s.rank])).toEqual([
      [2, 1],
      [1, 2],
      [3, 2],
    ]);
  });

  it('solo ranks by floors and titles with the tower height', () => {
    const res = buildResult([stat(1, { floors: 13, pas: 4, score: 17, bestStreak: 2 })], {
      solo: true,
      bestHeight: 14,
      rounds: 1,
      name: () => 'Rina',
    });
    expect(res.title).toBe('Rusun setinggi 14 lantai!');
    expect(res.ranking).toEqual([{ playerId: 1, score: 13, rank: 1, label: '13 lantai · 4 PAS' }]);
    expect(res.awards!.map((a) => a.title)).toEqual(['Arsitek Menara', 'Tukang Ahli', 'Tangan Dingin']);
  });

  it('names the winner and spreads awards so everyone gets one', () => {
    const stats = [
      stat(1, { floors: 6, pas: 4, bestStreak: 3, score: 13 }),
      stat(2, { floors: 4, pas: 1, bestStreak: 1, score: 8 }),
      stat(3, { floors: 3, pas: 0, score: 3, collapses: 1 }),
      stat(4, { floors: 2, pas: 0, score: 5 }),
    ];
    const names: Record<number, string> = { 1: 'Rina', 2: 'Budi', 3: 'Sari', 4: 'Joko' };
    const res = buildResult(stats, { solo: false, bestHeight: 16, rounds: 1, name: (id) => names[id]! });
    expect(res.title).toBe('Rina menang!');
    const titles = (id: number) => res.awards!.filter((a) => a.playerId === id).map((a) => a.title);
    expect(titles(1)).toEqual(['Arsitek Menara', 'Tangan Dingin']);
    expect(titles(2)).toEqual(['Tukang Ahli']);
    expect(titles(3)).toEqual(['Pemberani']);
    expect(titles(4)).toEqual(['Pekerja Keras']);
    expect(res.awards!.find((a) => a.title === 'Tangan Dingin')!.playerId).toBe(1);
    expect(new Set(res.awards!.map((a) => a.playerId)).size).toBe(4);
  });

  it('reports ties in the headline', () => {
    const res = buildResult([stat(1, { score: 7 }), stat(2, { score: 7 })], {
      solo: false,
      bestHeight: 5,
      rounds: 3,
      name: (id) => (id === 1 ? 'Rina' : 'Budi'),
    });
    expect(res.title).toBe('Rina & Budi seri!');
    expect(res.ranking.every((r) => r.rank === 1)).toBe(true);
  });

  it('never dresses up a player who built nothing', () => {
    const res = buildResult([stat(1, { score: 3, misses: 2 }), stat(2, { collapses: 1, misses: 3 })], {
      solo: false,
      bestHeight: 1,
      rounds: 1,
      name: (id) => (id === 1 ? 'Rina' : 'Budi'),
    });
    expect(res.ranking.map((r) => r.label)).toEqual(['Meleset 2x', 'Meleset 3x']);
    expect(res.awards!.map((a) => [a.playerId, a.title])).toEqual([[2, 'Pemberani']]);
    const solo = buildResult([stat(1, { misses: 3, collapses: 1 })], {
      solo: true,
      bestHeight: 1,
      rounds: 1,
      name: () => 'Rina',
    });
    expect(solo.title).toBe('Rusun belum sempat berdiri!');
    expect(solo.ranking[0]!.label).toBe('Meleset 3x');
    expect(rankLabelOf(stat(3, {}))).toBe('Belum menyusun lantai');
  });

  it('gives no award to players who did nothing', () => {
    expect(pickAwards([stat(1, {}), stat(2, {})])).toEqual([]);
  });

  it('final phone view shows rank and rematch', () => {
    const [s] = rankStandings([stat(1, { score: 9, floors: 5, pas: 2 })], false);
    const v = finalView(s!, false, 'Rina menang!');
    expect(v).toMatchObject({ kind: 'result', tone: 'win', title: 'Juara!', big: '9 poin' });
  });
});

describe('a full simulated game', () => {
  it('is deterministic for the same inputs', () => {
    const run = () => {
      const g = newGame([1, 2], 2);
      const log: string[] = [];
      let t = 0;
      for (let step = 0; step < 4000 && g.phase !== 'ended'; step++) {
        t += 37;
        if (g.phase === 'aim' && t - g.turnStartAt > 1300) g.drop(g.current!, t - 40, t);
        g.tick(t);
        for (const e of g.drain())
          log.push(e.type === 'land' ? `land:${e.fall.playerId}:${e.points}` : e.type);
      }
      return { log, phase: g.phase, scores: [...g.stats.values()].map((s) => s.score) };
    };
    const a = run();
    const b = run();
    expect(a).toEqual(b);
    expect(a.phase).toBe('ended');
    expect(a.log.filter((e) => e === 'collapse')).toHaveLength(2);
  });
});

describe('solo score attack', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('plays a one-player game cleanly to the end, its tallest tower being the score', () => {
    const g = newGame([1], 1);
    expect(g.solo).toBe(true);
    expect(g.order).toEqual([1]);
    toFirstTurn(g);
    // Three clean floors, then three misses bring the tower down.
    for (let i = 0; i < 3; i++) {
      dropAtOffset(g, 0);
      g.tick(g.phaseEndsAt);
      expect(g.current).toBe(1);
    }
    expect(g.bestHeight).toBe(4);
    for (let i = 0; i < 3; i++) {
      g.top.width = Math.min(g.top.width, 300);
      dropAtOffset(g, g.top.x >= CENTER_X ? -190 : 190);
      // The third miss brings the tower down.
      if (i < 2) g.tick(g.phaseEndsAt);
    }
    expect(g.phase).toBe('collapse');
    g.tick(g.phaseEndsAt);
    expect(g.phase).toBe('finale');
    g.tick(g.phaseEndsAt);
    expect(g.phase).toBe('ended');
    expect(g.bestHeight).toBe(4);
  });

  it('describes the record: first, new, equal and short', () => {
    expect(soloRecord({ best: 9, previous: null, isNew: false }, 9)).toEqual({
      text: 'Rekor pertama tercatat: 9 lantai',
      isNew: false,
    });
    expect(soloRecord({ best: 14, previous: 11, isNew: true }, 14)).toEqual({
      text: 'Rekor baru! 14 lantai (sebelumnya 11)',
      isNew: true,
    });
    expect(recordKind({ best: 14, previous: 14, isNew: false }, 14)).toBe('tie');
    expect(soloRecord({ best: 14, previous: 14, isNew: false }, 10).text).toBe(
      'Rekor: 14 lantai, kurang 4 lantai lagi',
    );
  });

  it('puts the record line in the solo result and on the phone', () => {
    const one = {
      id: 1,
      floors: 9,
      pas: 3,
      streak: 0,
      bestStreak: 2,
      score: 12,
      collapses: 1,
      misses: 0,
    };
    // Node has no localStorage: the helper reports a first record.
    const record = soloRecord(submitRecord('rusun-test', '1', 10), 10);
    const res = buildResult([one], { solo: true, bestHeight: 10, rounds: 1, name: () => 'Rina', record });
    expect(res.title).toBe('Rusun setinggi 10 lantai!');
    expect(res.subtitle).toBe('Rekor pertama tercatat: 10 lantai');
    const [s] = rankStandings([one], true);
    const v = finalView(s!, true, res.title, record);
    expect(v).toMatchObject({ title: 'Rusun setinggi 10 lantai!', subtitle: record.text });
    expect(v.kind === 'result' && v.actions?.[0]?.label).toBe('Main lagi!');
    // Multiplayer keeps its old subtitle and phone view.
    const multi = buildResult([one, { ...one, id: 2 }], {
      solo: false,
      bestHeight: 10,
      rounds: 1,
      name: () => 'X',
    });
    expect(multi.subtitle).toBe(STR.resultSubtitle(10, 1));
  });

  it('remembers the tallest tower per mode on the main screen', () => {
    const mem = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => mem.set(k, v),
    });
    expect(soloRecord(submitRecord('rusun', '1', 8), 8).text).toBe('Rekor pertama tercatat: 8 lantai');
    expect(soloRecord(submitRecord('rusun', '1', 6), 6).text).toBe('Rekor: 8 lantai, kurang 2 lantai lagi');
    expect(soloRecord(submitRecord('rusun', '1', 12), 12).isNew).toBe(true);
    expect(submitRecord('rusun', '3', 5).previous).toBeNull();
  });
});
