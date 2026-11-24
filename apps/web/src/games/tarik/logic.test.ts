import type { Fruit, PlayerInfo } from '@hoorah/protocol';
import { lookOfFruit } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { seeded } from '../../shared/art/svg';
import { GameClock } from './clock';
import { Commentator, HOLD_MS } from './commentary';
import {
  buildResult,
  DEFAULT_TUNING,
  type MatchEvent,
  parseRounds,
  RateWindow,
  TarikMatch,
  type Team,
  type Tuning,
} from './logic';
import { formatClock, formatRate } from './strings';
import { tapView, viewFor } from './views';

/** Server clock runs far from game time so the two can never be confused in tests. */
const OFFSET = 1_000_000;
const FRUITS: Fruit[] = ['semangka', 'alpukat', 'durian', 'nanas', 'jeruk', 'stroberi', 'mangga', 'rambutan'];
const NAMES = ['Rina', 'Budi', 'Sari', 'Dodi', 'Wati', 'Joko', 'Tari', 'Agus'];

function player(id: number, connected = true): PlayerInfo {
  return {
    id,
    name: NAMES[(id - 1) % NAMES.length]!,
    fruit: FRUITS[(id - 1) % FRUITS.length]!,
    look: lookOfFruit(FRUITS[(id - 1) % FRUITS.length]!),
    color: '#F2453D',
    connected,
    isHost: id === 1,
  };
}

const players = (n: number): PlayerInfo[] => Array.from({ length: n }, (_, i) => player(i + 1));

interface Run {
  m: TarikMatch;
  t: number;
  counters: Map<number, number>;
  events: MatchEvent[];
}

/** Advance in 10 ms ticks until `until` returns true (or a safety limit), collecting events. */
function runUntil(run: Run, until: (m: TarikMatch) => boolean, limitMs = 300_000): void {
  const stop = run.t + limitMs;
  while (!until(run.m) && run.t < stop) {
    run.t += 10;
    run.m.advance(run.t, run.t + OFFSET);
    run.events.push(...run.m.drainEvents());
  }
}

function newRun(n = 2, opts: { rounds?: number; tuning?: Partial<Tuning> } = {}): Run {
  const m = new TarikMatch({ rounds: 3, ...opts });
  m.setPlayers(players(n));
  const run: Run = { m, t: 0, counters: new Map(), events: [...m.drainEvents()] };
  return run;
}

function toPull(run: Run): Run {
  runUntil(run, (m) => m.phase === 'pull');
  return run;
}

/** One tap from `id` at the current time; `atOffset` shifts the tap's own timestamp. */
function tap(run: Run, id: number, atOffset = 0) {
  const c = ((run.counters.get(id) ?? 0) + 1) & 0xffff;
  run.counters.set(id, c);
  return run.m.input(id, c, run.t + OFFSET + atOffset, run.t, run.t + OFFSET);
}

/** Move time forward to an absolute game time. */
function at(run: Run, t: number): void {
  run.t = t;
  run.m.advance(t, t + OFFSET);
  run.events.push(...run.m.drainEvents());
}

interface Tapper {
  id: number;
  rate: number;
  jitter?: number;
}

/** Steady mashing at the given rates (taps/s) until the round ends or `maxMs` passes. */
function mash(run: Run, tappers: Tapper[], maxMs: number, rng = seeded(7)): void {
  const next = tappers.map((tp) => run.t + (1000 / tp.rate) * rng());
  const stop = run.t + maxMs;
  while (run.m.phase === 'pull' && run.t < stop) {
    run.t += 5;
    tappers.forEach((tp, i) => {
      if (run.t >= next[i]!) {
        tap(run, tp.id);
        const jitter = tp.jitter ?? 0;
        next[i]! += (1000 / tp.rate) * (1 + jitter * (rng() * 2 - 1));
      }
    });
    run.m.advance(run.t, run.t + OFFSET);
    run.events.push(...run.m.drainEvents());
  }
}

const eventTypes = (run: Run) => run.events.map((e) => e.type);

/* ------------------------------------------------------------------ basics */

describe('parseRounds', () => {
  it('reads numbers and strings, defaults to 3 and clamps', () => {
    expect(parseRounds(1)).toBe(1);
    expect(parseRounds('3')).toBe(3);
    expect(parseRounds(undefined)).toBe(3);
    expect(parseRounds('abc')).toBe(3);
    expect(parseRounds(0)).toBe(1);
    expect(parseRounds(50)).toBe(9);
  });

  it('derives wins needed (best of N)', () => {
    expect(new TarikMatch({ rounds: 3 }).winsNeeded).toBe(2);
    expect(new TarikMatch({ rounds: 1 }).winsNeeded).toBe(1);
    expect(new TarikMatch({ rounds: 5 }).winsNeeded).toBe(3);
  });
});

describe('RateWindow', () => {
  it('sums events of the last second and forgets older ones', () => {
    const w = new RateWindow(50, 20);
    w.add(0, 1);
    w.add(400, 2);
    w.add(990, 1);
    expect(w.sum(990)).toBe(4);
    expect(w.sum(1010)).toBe(3);
    expect(w.sum(1420)).toBe(1);
    expect(w.sum(2100)).toBe(0);
  });

  it('survives long gaps and reset', () => {
    const w = new RateWindow(50, 20);
    w.add(100, 5);
    w.add(100_000, 2);
    expect(w.sum(100_000)).toBe(2);
    w.reset();
    expect(w.sum(100_010)).toBe(0);
    w.add(100_020, 1);
    expect(w.sum(100_030)).toBe(1);
  });
});

describe('GameClock', () => {
  it('freezes while held and resumes without a jump', () => {
    let now = 1000;
    const clock = new GameClock(() => now);
    now = 1500;
    expect(clock.now()).toBe(500);
    clock.hold('pause');
    now = 9000;
    expect(clock.now()).toBe(500);
    clock.release('pause');
    expect(clock.now()).toBe(500);
    now = 9100;
    expect(clock.now()).toBe(600);
  });

  it('stays frozen until every hold is released', () => {
    let now = 0;
    const clock = new GameClock(() => now);
    clock.hold('pause');
    clock.hold('hidden');
    now = 100;
    clock.release('pause');
    expect(clock.paused).toBe(true);
    now = 200;
    clock.release('hidden');
    now = 250;
    expect(clock.now()).toBe(50);
  });
});

describe('formatting', () => {
  it('uses Indonesian decimals and m:ss', () => {
    expect(formatRate(7.44)).toBe('7,4');
    expect(formatRate(0)).toBe('0,0');
    expect(formatClock(42_000)).toBe('0:42');
    expect(formatClock(41_001)).toBe('0:42');
    expect(formatClock(65_000)).toBe('1:05');
    expect(formatClock(-5)).toBe('0:00');
  });
});

/* ------------------------------------------------------------------ teams & phases */

describe('teams', () => {
  it('splits connected players alternately by join order: odd positions Merah', () => {
    const run = toPull(newRun(5));
    expect(run.m.roster('red').map((m) => m.id)).toEqual([1, 3, 5]);
    expect(run.m.roster('blue').map((m) => m.id)).toEqual([2, 4]);
  });

  it('skips disconnected players and gives them a team when they come back', () => {
    const list = [player(1), player(2, false), player(3)];
    const m = new TarikMatch();
    m.setPlayers(list);
    const run: Run = { m, t: 0, counters: new Map(), events: [] };
    toPull(run);
    expect(m.member(1)?.team).toBe('red');
    expect(m.member(3)?.team).toBe('blue');
    expect(m.member(2)?.team).toBeNull();
    m.setPlayers([player(1), player(2), player(3)]);
    expect(m.member(2)?.team).toBe('blue');
  });

  it('puts latecomers on the smaller team', () => {
    const run = toPull(newRun(3));
    run.m.setPlayers(players(4));
    expect(run.m.member(4)?.team).toBe('blue');
    run.m.setPlayers(players(5));
    expect(run.m.member(5)?.team).toBe('red');
  });

  it('rebalances between rounds when one side is two players bigger', () => {
    const run = toPull(newRun(4));
    // Both Biru players drop out; Merah has 2 connected, Biru 0.
    run.m.setPlayers([player(1), player(2, false), player(3), player(4, false)]);
    run.m.setPlayers([player(1), player(3), player(5)]);
    expect(run.m.connectedCount('red')).toBe(2);
    expect(run.m.connectedCount('blue')).toBe(1);
    // Still uneven by more than one? Not here; drop player 5 so Merah 2 vs Biru 0.
    run.m.setPlayers([player(1), player(3)]);
    expect(run.m.connectedCount('blue')).toBe(0);
    mash(run, [{ id: 1, rate: 9 }], 60_000);
    runUntil(run, (m) => m.phase === 'pull');
    expect(run.m.connectedCount('red')).toBe(1);
    expect(run.m.connectedCount('blue')).toBe(1);
    expect(run.m.member(3)?.team).toBe('blue');
  });

  it('drops players that leave the room from rosters', () => {
    const run = toPull(newRun(3));
    run.m.setPlayers([player(1), player(2)]);
    expect(run.m.member(3)).toBeUndefined();
    expect(run.m.roster('red').map((m) => m.id)).toEqual([1]);
    expect(run.events.some((e) => e.type === 'teams')).toBe(true);
  });

  it("keeps each player's look and follows a restyle", () => {
    const m = new TarikMatch({ rounds: 3 });
    m.setPlayers(players(2));
    m.drainEvents();
    expect(m.member(2)?.look).toEqual(lookOfFruit('alpukat'));
    m.setPlayers([player(1), { ...player(2), look: { c: 'zara', hc: 2 } }]);
    expect(m.member(2)?.look).toEqual({ c: 'zara', hc: 2 });
    expect(m.drainEvents().some((e) => e.type === 'teams')).toBe(true);
  });
});

describe('waiting and countdown', () => {
  it('waits for two connected players, then counts 3-2-1 and goes', () => {
    const m = new TarikMatch();
    m.setPlayers([player(1)]);
    const run: Run = { m, t: 0, counters: new Map(), events: [] };
    at(run, 5000);
    expect(m.phase).toBe('waiting');
    m.setPlayers([player(1), player(2)]);
    at(run, 5010);
    expect(m.phase).toBe('countdown');
    expect(m.countValue).toBe(3);
    at(run, 5010 + 900);
    expect(m.countValue).toBe(2);
    at(run, 5010 + 1800);
    expect(m.countValue).toBe(1);
    at(run, 5010 + 2700);
    expect(m.phase).toBe('pull');
    expect(eventTypes(run)).toEqual([
      'teams',
      'teams',
      'teams',
      'countdown',
      'count',
      'count',
      'count',
      'go',
    ]);
    const counts = run.events
      .filter((e) => e.type === 'count')
      .map((e) => (e.type === 'count' ? e.value : 0));
    expect(counts).toEqual([3, 2, 1]);
  });

  it('anchors the ring to server time at the start of the pull', () => {
    const run = toPull(newRun(2));
    const go = run.events.find((e) => e.type === 'go');
    expect(go?.type === 'go' && go.ringStart).toBe(run.m.pullStart + OFFSET);
    expect(run.m.ringStart).toBe(run.m.pullStart + OFFSET);
  });

  it('does not depend on how often it is advanced', () => {
    const a = newRun(2);
    at(a, 20_000);
    const b = newRun(2);
    for (let t = 7; t <= 20_000; t += 7) at(b, t);
    at(b, 20_000);
    expect(b.m.phase).toBe(a.m.phase);
    expect(b.m.pullStart).toBe(a.m.pullStart);
    expect(b.m.p).toBe(a.m.p);
  });
});

/* ------------------------------------------------------------------ tap accounting */

describe('tap accounting', () => {
  it('counts the first frame as one tap and then cumulative deltas', () => {
    const run = toPull(newRun(2));
    expect(run.m.input(1, 500, run.t + OFFSET, run.t, run.t + OFFSET).counted).toBe(1);
    expect(run.m.input(1, 501, run.t + OFFSET, run.t, run.t + OFFSET).counted).toBe(1);
    expect(run.m.input(1, 504, run.t + OFFSET, run.t, run.t + OFFSET).counted).toBe(3);
    expect(run.m.member(1)?.taps).toBe(5);
  });

  it('handles u16 wrap-around', () => {
    const run = toPull(newRun(2));
    run.m.input(1, 65534, run.t + OFFSET, run.t, run.t + OFFSET);
    const r = run.m.input(1, 1, run.t + OFFSET, run.t, run.t + OFFSET);
    expect(r.counted).toBe(3);
  });

  it('ignores duplicates and treats big jumps as a resync', () => {
    const run = toPull(newRun(2));
    run.m.input(1, 10, run.t + OFFSET, run.t, run.t + OFFSET);
    expect(run.m.input(1, 10, run.t + OFFSET, run.t, run.t + OFFSET).counted).toBe(0);
    expect(run.m.input(1, 40, run.t + OFFSET, run.t, run.t + OFFSET).counted).toBe(0);
    // The resync becomes the new baseline.
    expect(run.m.input(1, 41, run.t + OFFSET, run.t, run.t + OFFSET).counted).toBe(1);
    expect(run.m.member(1)?.taps).toBe(2);
  });

  it('only counts taps during the pull, but keeps the baseline', () => {
    const run = newRun(2);
    at(run, 1000);
    expect(run.m.phase).toBe('countdown');
    expect(run.m.input(1, 7, run.t + OFFSET, run.t, run.t + OFFSET).counted).toBe(0);
    toPull(run);
    expect(run.m.input(1, 8, run.t + OFFSET, run.t, run.t + OFFSET).counted).toBe(1);
  });

  it('absorbs taps while paused', () => {
    const run = toPull(newRun(2));
    run.m.input(1, 1, run.t + OFFSET, run.t, run.t + OFFSET);
    run.m.absorb(1, 15);
    expect(run.m.input(1, 16, run.t + OFFSET, run.t, run.t + OFFSET).counted).toBe(1);
    expect(run.m.member(1)?.taps).toBe(2);
  });

  it('ignores unknown players', () => {
    const run = toPull(newRun(2));
    expect(run.m.input(99, 1, run.t + OFFSET, run.t, run.t + OFFSET).counted).toBe(0);
  });

  it('caps a single player at the maximum human tap rate', () => {
    const run = toPull(newRun(2));
    let counted = 0;
    for (let i = 0; i < 40; i++) counted += tap(run, 1).counted;
    expect(counted).toBe(DEFAULT_TUNING.maxTapsPerSecond);
  });

  it('reports per-player and per-team rates over the last second', () => {
    const run = toPull(newRun(2));
    mash(run, [{ id: 1, rate: 8 }], 3000);
    expect(run.m.playerRate(1)).toBeGreaterThanOrEqual(7);
    expect(run.m.playerRate(1)).toBeLessThanOrEqual(9);
    expect(run.m.teamRate('red')).toBe(run.m.playerRate(1));
    expect(run.m.teamRate('blue')).toBe(0);
  });
});

/* ------------------------------------------------------------------ force & rope */

describe('force and rope', () => {
  it('keeps evenly matched mashing (~7 taps/s) near the center for the whole round', () => {
    const run = toPull(newRun(2));
    let maxAbs = 0;
    const tappers = [
      { id: 1, rate: 7, jitter: 0.35 },
      { id: 2, rate: 7, jitter: 0.35 },
    ];
    const start = run.t;
    while (run.m.phase === 'pull' && run.t - start < 44_000) {
      mash(run, tappers, 500, seeded(run.t));
      maxAbs = Math.max(maxAbs, Math.abs(run.m.p));
    }
    expect(run.m.phase).toBe('pull');
    expect(maxAbs).toBeLessThan(0.45);
  });

  it('lets a 30 % stronger side win in 12-20 s', () => {
    for (const [red, blue, winner] of [
      [9.1, 7, 'red'],
      [7, 9.1, 'blue'],
    ] as const) {
      const run = toPull(newRun(2));
      const start = run.m.pullStart;
      mash(
        run,
        [
          { id: 1, rate: red },
          { id: 2, rate: blue },
        ],
        45_000,
      );
      const end = run.events.find((e) => e.type === 'roundEnd');
      expect(end?.type === 'roundEnd' && end.winner).toBe(winner);
      expect(end?.type === 'roundEnd' && end.reason).toBe('line');
      const seconds = (run.m.phaseStart - start) / 1000;
      expect(seconds).toBeGreaterThanOrEqual(12);
      expect(seconds).toBeLessThanOrEqual(20);
    }
  });

  it('moves the rope toward Merah (negative) when Merah pulls harder', () => {
    const run = toPull(newRun(2));
    mash(run, [{ id: 1, rate: 8 }], 2000);
    expect(run.m.p).toBeLessThan(0);
    expect(run.m.leader()).toBe('red');
  });

  it('divides force by connected team size so 2 vs 1 at equal per-player rates is fair', () => {
    const run = toPull(newRun(3));
    mash(
      run,
      [
        { id: 1, rate: 7 },
        { id: 3, rate: 7 },
        { id: 2, rate: 7 },
      ],
      10_000,
    );
    expect(Math.abs(run.m.p)).toBeLessThan(0.15);
    expect(run.m.teamSize('red')).toBe(2);
  });

  it('rescales a team when a member disconnects mid-round', () => {
    const run = toPull(newRun(3));
    run.m.setPlayers([player(1), player(2), player(3, false)]);
    expect(run.m.teamSize('red')).toBe(1);
    mash(
      run,
      [
        { id: 1, rate: 7 },
        { id: 2, rate: 7 },
      ],
      8000,
    );
    expect(Math.abs(run.m.p)).toBeLessThan(0.15);
  });

  it('decays a lead slowly toward the center when nobody pulls', () => {
    const run = toPull(newRun(2));
    mash(run, [{ id: 1, rate: 9 }], 1200);
    // Taps keep pulling for one window (1 s) after the last one.
    at(run, run.t + 1100);
    const lead = run.m.p;
    expect(lead).toBeLessThan(-0.1);
    at(run, run.t + 5000);
    expect(run.m.p).toBeGreaterThan(lead);
    expect(run.m.p).toBeLessThan(0);
  });
});

/* ------------------------------------------------------------------ super pull */

describe('super pull timing', () => {
  const P = DEFAULT_TUNING.ringPeriodMs;
  /** Game time of the end of ring cycle n (server = game + OFFSET in these tests). */
  const cycleEnd = (run: Run, n: number) => run.m.ringStart - OFFSET + n * P;

  it('counts a deliberate tap within ±90 ms of a cycle end as SUPER', () => {
    for (const off of [-90, -40, 0, 60, 90]) {
      const run = toPull(newRun(2));
      at(run, cycleEnd(run, 1) + off);
      const r = tap(run, 1);
      expect(r.super, `offset ${off}`).toBe(true);
      expect(r.combo).toBe(1);
    }
  });

  it('rejects taps just outside the window and on cycle 0', () => {
    for (const off of [-91, 91, 300]) {
      const run = toPull(newRun(2));
      at(run, cycleEnd(run, 1) + off);
      expect(tap(run, 1).super, `offset ${off}`).toBe(false);
    }
    const run = toPull(newRun(2));
    expect(tap(run, 1).super).toBe(false);
  });

  it('judges by the tap timestamp, not by arrival time', () => {
    const run = toPull(newRun(2));
    at(run, cycleEnd(run, 2) + 250);
    // The frame arrives 250 ms late but was tapped exactly at the cycle end.
    expect(tap(run, 1, -250).super).toBe(true);
  });

  it('ignores implausible timestamps', () => {
    const run = toPull(newRun(2));
    at(run, cycleEnd(run, 1) - 2500);
    // Claims to be from the future cycle end, far ahead of server time.
    expect(tap(run, 1, 2500).super).toBe(false);
  });

  it('requires a quiet moment before the window, so blind mashing does not get supers', () => {
    const run = toPull(newRun(2));
    at(run, cycleEnd(run, 1) - 150);
    tap(run, 1);
    at(run, cycleEnd(run, 1));
    expect(tap(run, 1).super).toBe(false);

    const ok = toPull(newRun(2));
    at(ok, cycleEnd(ok, 1) - 300);
    tap(ok, 1);
    at(ok, cycleEnd(ok, 1));
    expect(tap(ok, 1).super).toBe(true);
  });

  it('gives a 7 taps/s masher no supers', () => {
    const run = toPull(newRun(2));
    mash(run, [{ id: 1, rate: 7, jitter: 0.1 }], 20_000);
    expect(run.m.member(1)?.supers).toBe(0);
  });

  it('allows only one super per player per cycle', () => {
    const run = toPull(newRun(2));
    at(run, cycleEnd(run, 1) - 60);
    expect(tap(run, 1).super).toBe(true);
    at(run, cycleEnd(run, 1) + 60);
    expect(tap(run, 1).super).toBe(false);
  });

  it('builds a combo over consecutive cycles and breaks it after a missed cycle', () => {
    // Weak rope so the solo supers do not end the round.
    const run = toPull(newRun(2, { tuning: { pullGain: 0.001 } }));
    for (let n = 1; n <= 4; n++) {
      at(run, cycleEnd(run, n));
      expect(tap(run, 1).combo).toBe(n);
    }
    expect(run.m.comboOf(1)).toBe(4);
    // Still alive until cycle 5's window (plus grace for late frames) has passed.
    at(run, cycleEnd(run, 5) + 300);
    expect(run.m.comboOf(1)).toBe(4);
    at(run, cycleEnd(run, 5) + DEFAULT_TUNING.superWindowMs + DEFAULT_TUNING.superGraceMs + 10);
    expect(run.m.comboOf(1)).toBe(0);
    at(run, cycleEnd(run, 6));
    expect(tap(run, 1).combo).toBe(1);
    expect(run.m.member(1)?.maxCombo).toBe(4);
    expect(run.m.member(1)?.supers).toBe(5);
  });

  it('adds an impulse worth 6 taps for the team', () => {
    const plain = toPull(newRun(2));
    at(plain, cycleEnd(plain, 1) - 300);
    tap(plain, 1);
    at(plain, cycleEnd(plain, 1) + 95);
    tap(plain, 1);
    at(plain, cycleEnd(plain, 1) + 1500);

    const boosted = toPull(newRun(2));
    at(boosted, cycleEnd(boosted, 1) - 300);
    tap(boosted, 1);
    at(boosted, cycleEnd(boosted, 1));
    expect(tap(boosted, 1).super).toBe(true);
    at(boosted, cycleEnd(boosted, 1) + 1500);

    // Same real taps, but the super moved the rope ~4x as far (2 taps vs 2 + 6).
    expect(boosted.m.p).toBeLessThan(plain.m.p * 3.5);
    expect(boosted.m.member(1)?.taps).toBe(plain.m.member(1)?.taps);
  });

  it('resets combos at the next round', () => {
    const run = toPull(newRun(2));
    at(run, cycleEnd(run, 1));
    tap(run, 1);
    mash(run, [{ id: 1, rate: 12 }], 45_000);
    runUntil(run, (m) => m.phase === 'pull');
    expect(run.m.member(1)?.combo).toBe(0);
    expect(run.m.member(1)?.roundSupers).toBe(0);
    expect(run.m.member(1)?.maxCombo).toBe(1);
  });
});

/* ------------------------------------------------------------------ clock & rounds */

describe('round clock', () => {
  it('gives the round to the leader when time runs out', () => {
    const run = toPull(newRun(2, { tuning: { pullGain: 0.001 } }));
    mash(run, [{ id: 2, rate: 8 }], 46_000);
    const end = run.events.find((e) => e.type === 'roundEnd');
    expect(end).toEqual({ type: 'roundEnd', round: 1, winner: 'blue', reason: 'time' });
    expect(run.m.phaseStart - run.m.pullStart).toBe(45_000);
    expect(eventTypes(run)).toContain('warning');
  });

  it('freezes the clock when a round ends early', () => {
    const run = toPull(newRun(2));
    mash(run, [{ id: 1, rate: 12 }], 45_000);
    expect(run.m.phase).toBe('roundEnd');
    const left = run.m.timeLeft();
    expect(left).toBe(45_000 - (run.m.phaseStart - run.m.pullStart));
    at(run, run.t + 2500);
    expect(run.m.phase).toBe('scoreboard');
    expect(run.m.timeLeft()).toBe(left);
  });

  it('goes to sudden death on a tie, then the first clear lead wins', () => {
    const run = toPull(newRun(2));
    at(run, run.m.pullStart + 45_000);
    expect(run.m.suddenDeath).toBe(true);
    expect(run.m.phase).toBe('pull');
    expect(eventTypes(run)).toContain('suddenDeath');
    expect(run.m.timeLeft()).toBe(10_000);
    mash(run, [{ id: 1, rate: 10 }], 10_000);
    const end = run.events.find((e) => e.type === 'roundEnd');
    expect(end?.type === 'roundEnd' && end.winner).toBe('red');
    expect(run.m.phaseStart - run.m.pullStart).toBeLessThan(55_000);
  });

  it('breaks a dead-even sudden death by round taps, else replays the round', () => {
    const run = toPull(newRun(2));
    at(run, run.m.pullStart + 55_000);
    expect(run.events.find((e) => e.type === 'roundEnd')).toEqual({
      type: 'roundEnd',
      round: 1,
      winner: null,
      reason: 'draw',
    });
    runUntil(run, (m) => m.phase === 'countdown');
    expect(run.m.round).toBe(1);
    expect(run.m.wins).toEqual({ red: 0, blue: 0 });
  });
});

describe('match flow', () => {
  function playRound(run: Run, winner: Team): void {
    runUntil(run, (m) => m.phase === 'pull');
    mash(run, [{ id: winner === 'red' ? 1 : 2, rate: 12 }], 45_000);
  }

  it('plays best of 3: first to 2 wins, with scoreboards in between', () => {
    const run = newRun(2, { rounds: 3 });
    playRound(run, 'red');
    expect(run.m.phase).toBe('roundEnd');
    runUntil(run, (m) => m.phase === 'scoreboard');
    playRound(run, 'blue');
    playRound(run, 'red');
    expect(run.m.matchWinner).toBe('red');
    expect(run.m.history).toEqual(['red', 'blue', 'red']);
    runUntil(run, (m) => m.phase === 'done');
    const types = eventTypes(run).filter((e) => e !== 'count' && e !== 'teams' && e !== 'warning');
    expect(types).toEqual([
      'countdown',
      'go',
      'roundEnd',
      'scoreboard',
      'countdown',
      'go',
      'roundEnd',
      'scoreboard',
      'countdown',
      'go',
      'roundEnd',
      'matchEnd',
      'done',
    ]);
    expect(run.m.round).toBe(3);
  });

  it('ends a 2-0 sweep after two rounds', () => {
    const run = newRun(2, { rounds: 3 });
    playRound(run, 'blue');
    playRound(run, 'blue');
    expect(run.m.matchWinner).toBe('blue');
    expect(run.m.wins).toEqual({ red: 0, blue: 2 });
  });

  it('plays a single round when rounds = 1', () => {
    const run = newRun(2, { rounds: 1 });
    playRound(run, 'blue');
    runUntil(run, (m) => m.phase === 'matchEnd');
    expect(run.m.matchWinner).toBe('blue');
    expect(run.m.history).toEqual(['blue']);
  });

  it('waits between rounds when fewer than 2 players are connected', () => {
    const run = newRun(2);
    playRound(run, 'red');
    run.m.setPlayers([player(1), player(2, false)]);
    runUntil(run, (m) => m.phase === 'waiting');
    expect(run.m.round).toBe(2);
    at(run, run.t + 5000);
    expect(run.m.phase).toBe('waiting');
    run.m.setPlayers(players(2));
    runUntil(run, (m) => m.phase === 'pull');
    expect(run.m.round).toBe(2);
  });
});

/* ------------------------------------------------------------------ results */

describe('result', () => {
  function finished(n: number, rates: Record<number, number>): Run {
    const run = newRun(n, { rounds: 1 });
    runUntil(run, (m) => m.phase === 'pull');
    mash(
      run,
      Object.entries(rates).map(([id, rate]) => ({ id: Number(id), rate })),
      45_000,
    );
    runUntil(run, (m) => m.phase === 'matchEnd');
    return run;
  }

  it('ranks the winning team first with score = taps + supers * 6', () => {
    const run = finished(2, { 1: 9, 2: 6 });
    const result = buildResult(run.m);
    expect(result.title).toBe('Tim Merah juara!');
    expect(result.subtitle).toBe('Menang 1–0');
    expect(result.ranking.map((r) => [r.playerId, r.rank])).toEqual([
      [1, 1],
      [2, 2],
    ]);
    const p1 = run.m.member(1)!;
    expect(result.ranking[0]?.score).toBe(p1.taps + p1.supers * 6);
    expect(result.ranking[0]?.label).toBe('Tim Merah');
  });

  it('gives every player an award when there are enough awards', () => {
    const run = finished(4, { 1: 10, 3: 8, 2: 7, 4: 5 });
    const awards = buildResult(run.m).awards ?? [];
    const winners = new Set(awards.map((a) => a.playerId));
    // No supers happened, so Raja Kombo is skipped: 3 awards for 4 players.
    expect(awards.map((a) => a.title)).toEqual(['Jari Kilat', 'Pantang Menyerah', 'Kapten Tim']);
    expect(winners.size).toBe(3);
    const captain = awards.find((a) => a.title === 'Kapten Tim');
    const fighter = awards.find((a) => a.title === 'Pantang Menyerah');
    expect(captain?.playerId).toBe(1);
    expect(captain?.icon).toBe('crown');
    expect(fighter?.playerId).toBe(2);
    expect(fighter?.icon).toBe('heart');
  });

  it('reroutes awards so nobody is left out when a full assignment exists', () => {
    // Player 1 is the only one with supers and also taps the most: without matching they would
    // collect both Raja Kombo and Kapten Tim while player 4 gets nothing.
    const run = newRun(4, { rounds: 1 });
    runUntil(run, (m) => m.phase === 'pull');
    const P = DEFAULT_TUNING.ringPeriodMs;
    for (let n = 1; n <= 2; n++) {
      at(run, run.m.ringStart - OFFSET + n * P);
      tap(run, 1);
    }
    mash(
      run,
      [
        { id: 1, rate: 12 },
        { id: 3, rate: 11 },
        { id: 2, rate: 4 },
        { id: 4, rate: 4 },
      ],
      45_000,
    );
    runUntil(run, (m) => m.phase === 'matchEnd');
    const awards = buildResult(run.m).awards ?? [];
    expect(awards).toHaveLength(4);
    expect(new Set(awards.map((a) => a.playerId)).size).toBe(4);
    expect(awards.find((a) => a.title === 'Raja Kombo')?.playerId).toBe(1);
    const captain = awards.find((a) => a.title === 'Kapten Tim');
    expect(captain?.playerId).toBe(3);
    expect(captain?.desc.startsWith('Memimpin Tim Merah')).toBe(true);
  });

  it('falls back to the true best once everyone has an award', () => {
    const run = finished(2, { 1: 10, 2: 6 });
    const awards = buildResult(run.m).awards ?? [];
    const fastest = awards.find((a) => a.title === 'Jari Kilat');
    expect(fastest?.playerId).toBe(1);
    expect(fastest?.desc.startsWith('Ketukan tercepat')).toBe(true);
    expect(fastest?.icon).toBe('zap');
  });

  it('awards Raja Kombo for the longest super streak', () => {
    const run = newRun(2, { rounds: 1 });
    runUntil(run, (m) => m.phase === 'pull');
    const P = DEFAULT_TUNING.ringPeriodMs;
    for (let n = 1; n <= 3; n++) {
      at(run, run.m.ringStart - OFFSET + n * P);
      tap(run, 2);
    }
    mash(run, [{ id: 2, rate: 12 }], 45_000);
    runUntil(run, (m) => m.phase === 'matchEnd');
    const combo = buildResult(run.m).awards?.find((a) => a.title === 'Raja Kombo');
    expect(combo?.playerId).toBe(2);
    expect(combo?.desc).toBe('Super tarik 3 kali beruntun');
    expect(combo?.icon).toBe('fire');
  });
});

/* ------------------------------------------------------------------ views */

describe('controller views', () => {
  it('builds the tap view with ring, rate, power, combo and lead', () => {
    const run = toPull(newRun(2));
    mash(run, [{ id: 1, rate: 8 }], 3000);
    const view = tapView(run.m, run.m.member(1) as never, run.t + OFFSET);
    expect(view).toMatchObject({
      kind: 'tap',
      teamName: 'TIM MERAH',
      teamColor: '#F2453D',
      label: 'TARIK!',
      ring: { start: run.m.ringStart, period: 1600 },
      lead: 'Merah unggul',
      combo: 0,
    });
    if (view.kind !== 'tap') throw new Error('expected tap view');
    expect(view.round).toBe('R1 · 0:42');
    expect(view.power).toBeGreaterThan(0.6);
    expect(view.power).toBeLessThanOrEqual(1);
    expect(view.rate).toMatch(/^\d+,\d$/);
  });

  it('picks the right view for every phase', () => {
    const run = newRun(2);
    expect(viewFor(run.m, 1, OFFSET, null)?.kind).toBe('message');
    runUntil(run, (m) => m.phase === 'countdown');
    const cd = viewFor(run.m, 2, OFFSET, null);
    expect(cd).toMatchObject({
      kind: 'countdown',
      value: '3',
      title: 'TIM BIRU',
      color: '#2F8CFF',
      opponents: [1],
    });
    runUntil(run, (m) => m.phase === 'pull');
    expect(viewFor(run.m, 2, OFFSET, null)?.kind).toBe('tap');
    mash(run, [{ id: 2, rate: 12 }], 45_000);
    expect(viewFor(run.m, 2, OFFSET, null)).toMatchObject({ kind: 'message', tone: 'good' });
    expect(viewFor(run.m, 1, OFFSET, null)).toMatchObject({ kind: 'message', tone: 'bad' });
    runUntil(run, (m) => m.phase === 'countdown');
    expect(viewFor(run.m, 2, OFFSET, null)).toMatchObject({ subtitle: 'Ronde 1 kamu menang. Pertahankan!' });
    expect(viewFor(run.m, 1, OFFSET, null)).toMatchObject({ subtitle: 'Ronde 1 lepas. Saatnya balas!' });
    expect(viewFor(run.m, 99, OFFSET, null)).toBeNull();
  });

  it('builds per-player final results', () => {
    const run = newRun(2, { rounds: 1 });
    runUntil(run, (m) => m.phase === 'pull');
    mash(run, [{ id: 1, rate: 12 }], 45_000);
    runUntil(run, (m) => m.phase === 'matchEnd');
    const result = buildResult(run.m);
    expect(viewFor(run.m, 1, OFFSET, result)).toMatchObject({
      kind: 'result',
      tone: 'win',
      title: 'Tim Merah juara!',
    });
    const lose = viewFor(run.m, 2, OFFSET, result);
    expect(lose).toMatchObject({ kind: 'result', tone: 'lose', title: 'Hampir!' });
    if (lose?.kind !== 'result') throw new Error('expected result view');
    expect(lose.stats?.map((s) => s.label)).toEqual(['Ketukan', 'Super', 'Kombo terbaik']);
  });
});

/* ------------------------------------------------------------------ commentary */

describe('commentator', () => {
  it('announces super streaks with the rival name', () => {
    const c = new Commentator(seeded(1));
    expect(c.event({ type: 'super', name: 'Rina', combo: 3, rival: 'Budi' }, 0)).toBe(true);
    expect(c.current).toMatchObject({ bold: 'Rina', text: ' 3 kali super beruntun! Budi, jangan kendor!' });
  });

  it('holds a line, but lets more important lines interrupt', () => {
    const c = new Commentator(seeded(1));
    c.event({ type: 'super', name: 'Rina', combo: 1, rival: null }, 0);
    expect(c.event({ type: 'super', name: 'Budi', combo: 1, rival: null }, 500)).toBe(false);
    expect(c.event({ type: 'warning' }, 600)).toBe(true);
    expect(c.current?.text).toBe('Tinggal 10 detik!');
    expect(c.event({ type: 'super', name: 'Budi', combo: 1, rival: null }, 600 + HOLD_MS)).toBe(true);
  });

  it('calls lead changes, comebacks and near wins from rope samples', () => {
    const c = new Commentator(seeded(1));
    let t = 0;
    const sample = (p: number) => {
      t += HOLD_MS + 1;
      c.sample({ p, fastest: null }, t);
      return c.current;
    };
    expect(sample(-0.2)).toMatchObject({ bold: 'Merah', text: ' mulai unggul!' });
    expect(sample(-0.5)).toMatchObject({ bold: 'Merah' });
    expect(sample(-0.25)).toMatchObject({ bold: 'Biru', text: ' mulai bangkit!' });
    expect(sample(0.2)).toMatchObject({ bold: 'Biru', text: ' ambil alih pimpinan!' });
    expect(sample(0.8)).toMatchObject({ bold: 'Biru', text: ' tinggal sedikit lagi!' });
  });

  it('fills silence and names fast tappers', () => {
    const c = new Commentator(seeded(3));
    expect(c.sample({ p: 0, fastest: { name: 'Sari', rate: 9.4 } }, 10_000)).toBe(true);
    expect(c.current).toMatchObject({ bold: 'Sari', text: ' ngebut 9,4 ketukan per detik!' });
    expect(c.sample({ p: 0, fastest: null }, 20_000)).toBe(true);
    expect(c.current?.bold).toBe('');
  });
});
