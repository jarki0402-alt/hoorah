import type { Fruit, PlayerInfo } from '@hoorah/protocol';
import { lookOfFruit } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { GameClock } from './clock';
import { Commentator, HOLD_MS } from './commentary';
import {
  BEAT_MS,
  BPM,
  buildResult,
  DEFAULT_TUNING,
  KarungMatch,
  type MatchEvent,
  parseRounds,
  pointsFor,
  type Tuning,
} from './logic';
import { formatClock, formatRate, formatTime } from './strings';
import { tapView, viewFor } from './views';

/** Server clock runs far from game time so the two can never be confused in tests. */
const OFFSET = 1_000_000;
const FRUITS: Fruit[] = ['semangka', 'alpukat', 'durian', 'nanas', 'jeruk', 'stroberi', 'mangga', 'rambutan'];
const NAMES = ['Rina', 'Budi', 'Sari', 'Dodi', 'Wati', 'Joko', 'Tari', 'Agus', 'Eka'];
/** Typical relay delay from phone to main screen. */
const LAG = 180;

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
  m: KarungMatch;
  t: number;
  counters: Map<number, number>;
  events: MatchEvent[];
}

function newRun(n = 2, opts: { rounds?: number; tuning?: Partial<Tuning> } = {}): Run {
  const m = new KarungMatch({ rounds: 3, ...opts });
  m.setPlayers(players(n));
  return { m, t: 0, counters: new Map(), events: [...m.drainEvents()] };
}

/** Advance in 10 ms ticks until `until` returns true (or a safety limit), collecting events. */
function runUntil(run: Run, until: (m: KarungMatch) => boolean, limitMs = 300_000): void {
  const stop = run.t + limitMs;
  while (!until(run.m) && run.t < stop) {
    run.t += 10;
    run.m.advance(run.t, run.t + OFFSET);
    run.events.push(...run.m.drainEvents());
  }
}

function advanceTo(run: Run, t: number): void {
  runUntil(run, () => run.t >= t, Math.max(0, t - run.t) + 20);
}

/** Server time of beat `n` of the current race. */
const beatAt = (run: Run, n: number) => run.m.anchor + n * run.m.tuning.beatMs;
/** First beat a racer can hop on. */
const goBeat = (run: Run) => 3 * run.m.tuning.countBeats;

/** A tap stamped on the phone at server time `at`, arriving `lag` ms later. */
function tapAt(run: Run, id: number, at: number, lag = LAG, count = 1) {
  const arrive = at - OFFSET + lag;
  if (arrive > run.t) advanceTo(run, arrive);
  const c = (run.counters.get(id) ?? 0) + count;
  run.counters.set(id, c);
  const r = run.m.input(id, c, Math.round(at), run.t, run.t + OFFSET);
  const copy = { ...r };
  run.events.push(...run.m.drainEvents());
  return copy;
}

function startRace(run: Run): void {
  runUntil(run, (m) => m.phase === 'race');
}

describe('helpers', () => {
  it('parses the race count from settings', () => {
    expect(parseRounds(1)).toBe(1);
    expect(parseRounds('3')).toBe(3);
    expect(parseRounds(undefined)).toBe(3);
    expect(parseRounds(40)).toBe(9);
    expect(parseRounds(0)).toBe(1);
  });

  it('gives points per place and nothing to racers who never moved', () => {
    expect(pointsFor(1, true)).toBe(10);
    expect(pointsFor(2, true)).toBe(8);
    expect(pointsFor(8, true)).toBe(1);
    expect(pointsFor(12, true)).toBe(1);
    expect(pointsFor(1, false)).toBe(0);
  });

  it('formats numbers the Indonesian way', () => {
    expect(formatRate(1.64)).toBe('1,6');
    expect(formatClock(61_900)).toBe('1:01');
    expect(formatTime(31_460)).toBe('31,5 dtk');
  });

  it('keeps the beat at the song tempo', () => {
    expect(BEAT_MS).toBeCloseTo(60_000 / BPM);
    expect(DEFAULT_TUNING.beatMs).toBe(BEAT_MS);
  });
});

describe('roster', () => {
  it("keeps each racer's look and follows a restyle", () => {
    const run = newRun(2);
    expect(run.m.racer(2)!.look).toEqual(lookOfFruit('alpukat'));
    run.m.setPlayers([player(1), { ...player(2), look: { c: 'bima', oc: 3 } }]);
    expect(run.m.racer(2)!.look).toEqual({ c: 'bima', oc: 3 });
    expect(run.m.drainEvents().some((e) => e.type === 'roster')).toBe(true);
  });
});

describe('countdown', () => {
  it('waits for two players, then counts down on the beat and starts on beat 6', () => {
    const solo = newRun(1);
    runUntil(solo, () => false, 5_000);
    expect(solo.m.phase).toBe('waiting');

    const run = newRun(3);
    runUntil(run, (m) => m.phase === 'countdown');
    const t0 = run.t;
    expect(run.m.field().map((r) => r.lane)).toEqual([0, 1, 2]);
    // Beat 0 sits one music lead after the countdown starts.
    expect(run.m.anchor).toBe(t0 + OFFSET + DEFAULT_TUNING.musicLeadMs);
    const counts: { value: number; t: number }[] = [];
    run.events.length = 0;
    while (run.m.phase === 'countdown') {
      runUntil(run, () => false, 10);
      for (const e of run.events.splice(0)) if (e.type === 'count') counts.push({ value: e.value, t: run.t });
    }
    expect(counts.map((c) => c.value)).toEqual([2, 1]);
    const beat0 = t0 + DEFAULT_TUNING.musicLeadMs;
    expect(Math.abs(counts[0]!.t - (beat0 + 2 * BEAT_MS))).toBeLessThanOrEqual(10);
    expect(Math.abs(counts[1]!.t - (beat0 + 4 * BEAT_MS))).toBeLessThanOrEqual(10);
    expect(Math.abs(run.m.raceStartT - (beat0 + 6 * BEAT_MS))).toBeLessThanOrEqual(10);
    expect(run.m.raceStartServer).toBeCloseTo(run.m.anchor + 6 * BEAT_MS);
  });

  it('starts the countdown over after a pause so it stays on the music', () => {
    const run = newRun(2);
    runUntil(run, (m) => m.phase === 'countdown');
    advanceTo(run, run.t + 800);
    const before = run.m.anchor;
    // Paused for 5 s: game time stood still, server time did not.
    run.m.resync(run.t, run.t + OFFSET + 5_000);
    const events = run.m.drainEvents();
    expect(events.some((e) => e.type === 'countdown')).toBe(true);
    expect(run.m.anchor).toBeGreaterThan(before + 5_000);
    expect(run.m.countValue).toBe(3);
  });
});

describe('beat judgement', () => {
  it('judges a tap by its phone timestamp, not by when it arrives', () => {
    const run = newRun(2);
    startRace(run);
    const b = goBeat(run);
    const a = tapAt(run, 1, beatAt(run, b + 1), 200);
    expect(a.kind).toBe('long');
    expect(a.to).toBeCloseTo(DEFAULT_TUNING.longHop);
    // A very slow relay (1.5 s) still counts the tap as on the beat.
    const late = tapAt(run, 2, beatAt(run, b + 2) + 30, 1_500);
    expect(late.kind).toBe('long');
    expect(late.offset).toBeCloseTo(30, 0);
  });

  it('gives a long hop inside the window and a short hop outside it', () => {
    const run = newRun(2);
    startRace(run);
    const b = goBeat(run);
    expect(tapAt(run, 1, beatAt(run, b + 1) - 109).kind).toBe('long');
    expect(tapAt(run, 1, beatAt(run, b + 2) + 109).kind).toBe('long');
    const off = tapAt(run, 1, beatAt(run, b + 3) + 250);
    expect(off.kind).toBe('short');
    expect(off.to - off.from).toBeCloseTo(DEFAULT_TUNING.shortHop);
    expect(tapAt(run, 2, beatAt(run, b + 1) + 112).kind).toBe('short');
  });

  it('distrusts timestamps far from the arrival time and treats them as off the beat', () => {
    const run = newRun(2);
    startRace(run);
    const b = goBeat(run);
    // Stamped 5 s in the past: clock garbage. Judged off-beat even though it looks perfect.
    advanceTo(run, beatAt(run, b + 12) - OFFSET);
    const r = tapAt(run, 1, beatAt(run, b + 4), 0);
    expect(r.kind).toBe('short');
  });

  it('ignores false starts before the go beat', () => {
    const run = newRun(2);
    startRace(run);
    const r = tapAt(run, 1, run.m.raceStartServer - 400, 0);
    expect(r.kind).toBe('none');
    expect(run.m.racer(1)!.dist).toBe(0);
  });

  it('ignores taps outside the race', () => {
    const run = newRun(2);
    runUntil(run, (m) => m.phase === 'countdown');
    const r = tapAt(run, 1, run.t + OFFSET, 0);
    expect(r.kind).toBe('none');
  });
});

describe('mashing', () => {
  it('makes a racer stumble when tapping twice within one beat', () => {
    const run = newRun(2);
    startRace(run);
    const b = goBeat(run);
    const first = beatAt(run, b + 1);
    expect(tapAt(run, 1, first).kind).toBe('long');
    const mash = tapAt(run, 1, first + 200);
    expect(mash.kind).toBe('stumble');
    expect(run.m.stumbling(1, first + 300)).toBe(true);
    expect(run.m.racer(1)!.streak).toBe(0);
    // On the ground: a calm tap 1 s later still does nothing.
    expect(tapAt(run, 1, first + 200 + 1_000).kind).toBe('none');
    // Back up after the tumble: a tap on a beat hops again.
    const up = beatAt(run, b + 6);
    expect(up).toBeGreaterThan(first + 200 + DEFAULT_TUNING.stumbleMs);
    expect(tapAt(run, 1, up).kind).toBe('long');
    expect(run.m.racer(1)!.raceStumbles).toBe(1);
  });

  it('lets a late tap be followed by an on-beat tap, but not two taps on one beat', () => {
    const run = newRun(2);
    startRace(run);
    const b = goBeat(run);
    // Late by 280 ms (still nearest to beat b+1), then right on b+2: one tap per beat.
    expect(tapAt(run, 1, beatAt(run, b + 1) + 280).kind).toBe('short');
    expect(tapAt(run, 1, beatAt(run, b + 2)).kind).toBe('long');
    // Double tempo: on the beat and again half a beat later counts as two taps on one beat.
    expect(tapAt(run, 2, beatAt(run, b + 1)).kind).toBe('long');
    expect(tapAt(run, 2, beatAt(run, b + 1) + 0.45 * BEAT_MS).kind).toBe('stumble');
  });

  it('keeps a racer down while they keep mashing', () => {
    const run = newRun(2);
    startRace(run);
    const start = beatAt(run, goBeat(run) + 1);
    const kinds: string[] = [];
    for (let i = 0; i < 20; i++) kinds.push(tapAt(run, 1, start + i * 150).kind);
    expect(kinds[0]).toBe('long');
    expect(kinds.filter((k) => k === 'stumble').length).toBeGreaterThanOrEqual(2);
    expect(kinds.filter((k) => k === 'long' || k === 'short').length).toBe(1);
  });

  it('counts several taps folded into one frame as mashing', () => {
    const run = newRun(2);
    startRace(run);
    expect(tapAt(run, 1, beatAt(run, goBeat(run) + 1)).kind).toBe('long');
    expect(tapAt(run, 1, beatAt(run, goBeat(run) + 2), LAG, 3).kind).toBe('stumble');
  });

  it('does not punish taps that arrive bunched together by network jitter', () => {
    const run = newRun(2);
    startRace(run);
    const b = goBeat(run);
    // Two taps one beat apart, delivered in the same instant.
    const at1 = beatAt(run, b + 1);
    const at2 = beatAt(run, b + 2);
    advanceTo(run, at2 - OFFSET + 300);
    expect(tapAt(run, 1, at1, 0).kind).toBe('long');
    expect(tapAt(run, 1, at2, 0).kind).toBe('long');
  });
});

describe('super hop', () => {
  it('turns every third on-beat hop in a row into a super hop', () => {
    const run = newRun(2);
    startRace(run);
    const b = goBeat(run);
    const kinds = [1, 2, 3, 4, 5, 6].map((k) => tapAt(run, 1, beatAt(run, b + k) + 20).kind);
    expect(kinds).toEqual(['long', 'long', 'super', 'long', 'long', 'super']);
    const tu = DEFAULT_TUNING;
    expect(run.m.racer(1)!.dist).toBeCloseTo(4 * tu.longHop + 2 * tu.superHop);
    expect(run.m.racer(1)!.maxStreak).toBe(6);
    expect(run.m.streakOf(1, beatAt(run, b + 6) + 100)).toBe(6);
  });

  it('breaks the streak on an off-beat tap or a skipped beat', () => {
    const run = newRun(2);
    startRace(run);
    const b = goBeat(run);
    tapAt(run, 1, beatAt(run, b + 1));
    tapAt(run, 1, beatAt(run, b + 2));
    expect(tapAt(run, 1, beatAt(run, b + 3) + 300).kind).toBe('short');
    expect(tapAt(run, 1, beatAt(run, b + 5)).kind).toBe('long');
    expect(tapAt(run, 1, beatAt(run, b + 6)).kind).toBe('long');
    // Skipped beat b+7: the streak starts over.
    expect(tapAt(run, 1, beatAt(run, b + 8)).kind).toBe('long');
    expect(run.m.racer(1)!.streak).toBe(1);
    // The live streak drops once a beat passes without a hop.
    expect(run.m.streakOf(1, beatAt(run, b + 10))).toBe(0);
  });
});

/** Hops racer `id` on every beat from `from` (super every third) until it finishes. */
function hopToFinish(run: Run, id: number, from: number, offset = 0): number {
  let beat = from;
  while (run.m.racer(id)!.finishAt === null && run.m.phase === 'race') {
    tapAt(run, id, beatAt(run, beat) + offset);
    beat++;
  }
  return beat;
}

describe('finish', () => {
  it('times the crossing inside the hop and ranks by it (photo finish)', () => {
    const run = newRun(2, { tuning: { trackLength: 3.5 } });
    startRace(run);
    const b = goBeat(run);
    // Racer 1: long, long (2 m) then a super from 2 m crosses 3.5 m at 1.5/2.2 of the air time.
    // Racer 2: two long hops then a short hop on a later beat to reach 2.4, then long 3.4, ...
    tapAt(run, 1, beatAt(run, b + 1));
    tapAt(run, 1, beatAt(run, b + 2));
    tapAt(run, 2, beatAt(run, b + 1));
    tapAt(run, 2, beatAt(run, b + 2));
    tapAt(run, 2, beatAt(run, b + 3) - 300);
    const sup = tapAt(run, 1, beatAt(run, b + 3) + 40);
    expect(sup.kind).toBe('super');
    expect(sup.finished).toBe(true);
    const r1 = run.m.racer(1)!;
    expect(r1.finishAt).toBeCloseTo(Math.round(beatAt(run, b + 3) + 40) + (DEFAULT_TUNING.hopMs * 1.5) / 2.2);
    const fin = run.events.find((e) => e.type === 'finish');
    expect(fin).toMatchObject({ id: 1, place: 1 });
    expect(run.events.some((e) => e.type === 'lastCall')).toBe(true);
    expect(run.m.placeOf(1)).toBe(1);
  });

  it('ranks a later tap with a longer hop ahead when it crosses first', () => {
    const run = newRun(2, { tuning: { trackLength: 1 } });
    startRace(run);
    const b = goBeat(run);
    // Both at 0.6 m after a short hop... then: racer 2 taps 70 ms earlier but only hops short.
    const t1 = beatAt(run, b + 1) + 300;
    tapAt(run, 1, t1); // short 0.4
    tapAt(run, 2, t1); // short 0.4
    const t2 = beatAt(run, b + 3);
    const slow = tapAt(run, 2, t2 - 200, 0); // off-beat short 0.4: 0.8, not there
    expect(slow.finished).toBe(false);
    tapAt(run, 1, t2 - 40); // long 1.0 -> crosses after 0.6 of 380 ms
    const two = tapAt(run, 2, beatAt(run, b + 4) - 30);
    expect(two.finished).toBe(true);
    runUntil(run, (m) => m.phase === 'raceEnd');
    expect(run.m.lastOrder).toEqual([1, 2]);
  });

  it('flags a photo finish when the first two cross within 300 ms', () => {
    const run = newRun(3, { tuning: { trackLength: 2 } });
    startRace(run);
    const b = goBeat(run);
    for (const id of [1, 2]) {
      tapAt(run, id, beatAt(run, b + 1) + (id === 1 ? 0 : 50));
      tapAt(run, id, beatAt(run, b + 2) + (id === 1 ? 0 : 50));
    }
    tapAt(run, 3, beatAt(run, b + 1));
    runUntil(run, (m) => m.phase === 'raceEnd');
    const end = run.events.find((e) => e.type === 'raceEnd');
    expect(end).toMatchObject({ winner: 1, photo: true });
    expect(run.m.lastOrder).toEqual([1, 2, 3]);
    const closeFinish = run.events.filter((e) => e.type === 'finish');
    expect(closeFinish[1]).toMatchObject({ id: 2, place: 2, close: true });
  });

  it('ends the race as soon as every racer has finished, then scores the places', () => {
    const run = newRun(3, { tuning: { trackLength: 3 } });
    startRace(run);
    const b = goBeat(run);
    hopToFinish(run, 1, b + 1, 0);
    hopToFinish(run, 2, b + 1, 60);
    expect(run.m.phase).toBe('race');
    hopToFinish(run, 3, b + 1, 300);
    runUntil(run, (m) => m.phase !== 'race', 100);
    expect(run.m.phase).toBe('raceEnd');
    expect(run.m.lastOrder).toEqual([1, 2, 3]);
    expect(run.m.all().map((r) => r.racePoints)).toEqual([10, 8, 6]);
    expect(run.m.racer(1)!.wins).toBe(1);
  });

  it('gives the field 10 s after the first finisher, then ranks the rest by distance', () => {
    const run = newRun(3, { tuning: { trackLength: 3 } });
    startRace(run);
    const b = goBeat(run);
    tapAt(run, 3, beatAt(run, b + 1) + 300); // 0.4 m
    tapAt(run, 2, beatAt(run, b + 1)); // 1 m
    hopToFinish(run, 1, b + 1);
    const first = run.m.firstFinishT!;
    expect(run.m.graceLeft()).toBeGreaterThan(9_000);
    runUntil(run, (m) => m.phase !== 'race');
    expect(run.t - first).toBeGreaterThanOrEqual(DEFAULT_TUNING.finishGraceMs);
    expect(run.t - first).toBeLessThan(DEFAULT_TUNING.finishGraceMs + 30);
    expect(run.m.lastOrder).toEqual([1, 2, 3]);
    expect(run.m.all().map((r) => r.place)).toEqual([1, 2, 3]);
  });

  it('stops at the race cap and lets racers who never moved share last place without points', () => {
    const run = newRun(3);
    startRace(run);
    tapAt(run, 2, beatAt(run, goBeat(run) + 1));
    runUntil(run, (m) => m.phase !== 'race');
    expect(run.m.elapsed()).toBeGreaterThanOrEqual(DEFAULT_TUNING.raceMs);
    expect(run.events.some((e) => e.type === 'warning')).toBe(true);
    const [a, b, c] = run.m.all();
    expect(b!.place).toBe(1);
    expect(a!.place).toBe(2);
    expect(c!.place).toBe(2);
    expect(a!.racePoints).toBe(0);
    expect(b!.racePoints).toBe(10);
  });

  it('ends the race when every racer has left', () => {
    const run = newRun(2);
    startRace(run);
    run.m.setPlayers([player(1, false), player(2, false)]);
    runUntil(run, (m) => m.phase !== 'race', 100);
    expect(run.m.phase).toBe('raceEnd');
  });
});

describe('match flow', () => {
  it('plays the configured number of races, then ends with the points ranking', () => {
    const run = newRun(3, { rounds: 2, tuning: { trackLength: 3 } });
    for (let race = 1; race <= 2; race++) {
      startRace(run);
      const b = goBeat(run);
      // Race 1: 1, 2, 3. Race 2: 2, 1, 3.
      const order = race === 1 ? [1, 2, 3] : [2, 1, 3];
      order.forEach((id, i) => {
        hopToFinish(run, id, b + 1 + i * 6);
      });
      runUntil(run, (m) => m.phase === 'standings');
    }
    runUntil(run, (m) => m.phase === 'done');
    expect(run.events.filter((e) => e.type === 'go')).toHaveLength(2);
    expect(run.events.some((e) => e.type === 'matchEnd')).toBe(true);
    const res = buildResult(run.m);
    // 1: 10 + 8 = 18 (one win), 2: 8 + 10 = 18 (one win), 3: 6 + 6.
    expect(res.ranking).toEqual([
      { playerId: 1, score: 18, rank: 1, label: '18 poin' },
      { playerId: 2, score: 18, rank: 1, label: '18 poin' },
      { playerId: 3, score: 12, rank: 3, label: '12 poin' },
    ]);
    expect(res.title).toBe('Juara bersama!');
    expect(res.awards?.map((a) => a.playerId)).toEqual([1, 2, 3]);
  });

  it('names the single winner and spreads the awards', () => {
    const run = newRun(2, { rounds: 1, tuning: { trackLength: 3 } });
    startRace(run);
    const b = goBeat(run);
    tapAt(run, 2, beatAt(run, b + 1));
    tapAt(run, 2, beatAt(run, b + 1) + 150); // stumble
    hopToFinish(run, 1, b + 1);
    runUntil(run, (m) => m.phase === 'done');
    const res = buildResult(run.m);
    expect(res.title).toBe('Rina juara Balap Karung!');
    expect(res.ranking.map((r) => [r.playerId, r.rank])).toEqual([
      [1, 1],
      [2, 2],
    ]);
    const tumble = res.awards?.find((a) => a.title === 'Pantang Menyerah');
    expect(tumble?.playerId).toBe(2);
  });

  it('keeps latecomers out of a running race and gives them a lane in the next', () => {
    const run = newRun(2, { tuning: { trackLength: 2 } });
    startRace(run);
    run.m.setPlayers(players(3));
    expect(run.m.racer(3)!.lane).toBeNull();
    expect(tapAt(run, 3, beatAt(run, goBeat(run) + 1)).kind).toBe('none');
    const view = viewFor(run.m, 3, run.t + OFFSET, null);
    expect(view).toMatchObject({ kind: 'message', title: 'Tunggu balapan berikutnya' });
    runUntil(run, (m) => m.phase === 'countdown');
    expect(run.m.racer(3)!.lane).toBe(2);
  });

  it('caps the field at 8 lanes', () => {
    const run = newRun(9);
    runUntil(run, (m) => m.phase === 'countdown');
    expect(run.m.field()).toHaveLength(8);
    expect(run.m.racer(9)!.lane).toBeNull();
  });

  it('keeps the tap counter in sync while paused', () => {
    const run = newRun(2);
    startRace(run);
    run.m.absorb(1, 7);
    run.counters.set(1, 7);
    expect(tapAt(run, 1, beatAt(run, goBeat(run) + 1)).kind).toBe('long');
  });
});

describe('phone views', () => {
  it('shows the rhythm ring, progress, streak and place on the tap view', () => {
    const run = newRun(3);
    startRace(run);
    const b = goBeat(run);
    tapAt(run, 1, beatAt(run, b + 1));
    tapAt(run, 1, beatAt(run, b + 2));
    tapAt(run, 2, beatAt(run, b + 1));
    const server = beatAt(run, b + 2) + 200;
    const v = tapView(run.m, run.m.racer(1)!, server);
    expect(v).toMatchObject({
      kind: 'tap',
      teamName: 'LAJUR 1',
      label: 'LOMPAT!',
      ring: { start: run.m.anchor, period: BEAT_MS },
      combo: 2,
      power: 0.04,
      lead: 'Posisi 1 dari 3 · memimpin!',
    });
    const v2 = tapView(run.m, run.m.racer(2)!, server);
    expect(v2).toMatchObject({ lead: 'Posisi 2 dari 3 · sisa 49 m' });
  });

  it('tells a tumbling racer to get up', () => {
    const run = newRun(2);
    startRace(run);
    const at = beatAt(run, goBeat(run) + 1);
    tapAt(run, 1, at);
    tapAt(run, 1, at + 100);
    expect(tapView(run.m, run.m.racer(1)!, at + 300)).toMatchObject({ lead: 'Gubrak! Bangun dulu…' });
  });

  it('walks through countdown, finish and result views', () => {
    const run = newRun(2, { rounds: 1, tuning: { trackLength: 2 } });
    expect(viewFor(run.m, 1, OFFSET, null)).toMatchObject({ kind: 'message', title: 'Masuk karung…' });
    runUntil(run, (m) => m.phase === 'countdown');
    expect(viewFor(run.m, 2, run.t + OFFSET, null)).toMatchObject({
      kind: 'countdown',
      value: '3',
      title: 'LAJUR 2',
      opponents: [1],
    });
    startRace(run);
    hopToFinish(run, 1, goBeat(run) + 1);
    expect(viewFor(run.m, 1, run.t + OFFSET, null)).toMatchObject({
      kind: 'message',
      title: 'Finis pertama!',
    });
    runUntil(run, (m) => m.phase === 'raceEnd');
    expect(viewFor(run.m, 1, run.t + OFFSET, null)).toMatchObject({
      title: 'Juara balapan!',
      subtitle: '+10 poin · total 10 poin',
    });
    runUntil(run, (m) => m.phase === 'done');
    const res = buildResult(run.m);
    expect(viewFor(run.m, 1, run.t + OFFSET, res)).toMatchObject({ kind: 'result', tone: 'win' });
    expect(viewFor(run.m, 2, run.t + OFFSET, res)).toMatchObject({
      kind: 'result',
      tone: 'lose',
      title: 'Peringkat 2',
    });
    expect(viewFor(run.m, 99, run.t + OFFSET, res)).toBeNull();
  });
});

describe('commentator', () => {
  it('holds a line, lets a stronger one through and fills silence', () => {
    const c = new Commentator(() => 0);
    expect(c.event({ type: 'start', race: 1, final: false }, 0)).toBe(true);
    expect(c.event({ type: 'super', name: 'Rina' }, 100)).toBe(false);
    expect(c.event({ type: 'photo' }, 200)).toBe(true);
    expect(c.current?.bold).toBe('Foto finis!');
    expect(c.sample({ order: [] }, 200 + HOLD_MS)).toBe(false);
    expect(c.sample({ order: [] }, 200 + 7_000)).toBe(true);
    expect(c.current?.bold).toBe('');
  });

  it('calls the leader and lead changes', () => {
    const c = new Commentator(() => 0);
    const a = { id: 1, name: 'Rina', dist: 5 };
    const b = { id: 2, name: 'Budi', dist: 4 };
    expect(c.sample({ order: [a, b] }, 0)).toBe(true);
    expect(c.current?.text).toContain('memimpin');
    expect(c.sample({ order: [{ ...b, dist: 7 }, a] }, 10_000)).toBe(true);
    expect(c.current?.text).toContain('menyalip');
  });
});

describe('clock', () => {
  it('stops while any hold is active', () => {
    let now = 1_000;
    const clock = new GameClock(() => now);
    now += 500;
    clock.hold('shell');
    clock.hold('hidden');
    now += 2_000;
    clock.release('shell');
    expect(clock.paused).toBe(true);
    clock.release('hidden');
    now += 100;
    expect(clock.now()).toBe(600);
  });
});
