import { afterEach, describe, expect, it, vi } from 'vitest';
import { submitRecord } from '../common/records';
import { headCenterY, kerupukRestY, mouthY } from './layout';
import {
  BASE_PERIOD,
  BITES,
  CHEW_MS,
  CHOKE_MS,
  FINALE_MS,
  finishBonus,
  GameClock,
  INTRO_MS,
  judge,
  type KerupukEvent,
  KerupukLogic,
  type Lane,
  MAX_LAG_MS,
  PLACE_POINTS,
  phaseFraction,
  placeLanes,
  pressTime,
  ROUND_END_MS,
  ROUND_MS,
  rephase,
  SOLO_BITE,
  SOLO_PAS,
  SOLO_PER_SEC,
  soloScore,
  swingOffset,
  swingPeriod,
  swingZone,
  WARN_MS,
} from './logic';
import { buildResult, buildSoloResult, pickAwards, rankStandings, recordKind, recordLine } from './results';

const roster = (...ids: number[]) => ids.map((id) => ({ id, connected: true }));

function game(ids: number[] = [1, 2], rounds = 1): KerupukLogic {
  return new KerupukLogic({ rounds, roster: roster(...ids), now: 0 });
}

/** Start the round: tick past the countdown. */
function go(g: KerupukLogic): number {
  g.tick(g.goAt);
  expect(g.phase).toBe('play');
  return g.goAt;
}

/** First time >= from when the lane's kerupuk is dead centre. */
function centreAfter(l: Lane, from: number): number {
  const half = l.swing.period / 2;
  const k = Math.ceil((from - l.swing.start) / half);
  return l.swing.start + k * half;
}

/** First time >= from when the lane's kerupuk is at its far right (offset 1). */
function edgeAfter(l: Lane, from: number): number {
  const p = l.swing.period;
  const k = Math.ceil((from - l.swing.start - p / 4) / p);
  return l.swing.start + p / 4 + k * p;
}

function types(evts: KerupukEvent[]): string[] {
  return evts.map((e) => e.type);
}

/** Bite at the next centre (after the chew gap) and return the time used. */
function biteNow(g: KerupukLogic, id: number, from: number): number {
  const l = g.lane(id)!;
  const t = centreAfter(l, Math.max(from, l.lastBiteAt + CHEW_MS + 1));
  g.tick(t);
  g.bite(id, t, t);
  return t;
}

describe('swing helpers', () => {
  it('speeds up and narrows the zone with every bite', () => {
    for (let b = 1; b <= BITES; b++) {
      expect(swingPeriod(b)).toBeLessThan(swingPeriod(b - 1));
      expect(swingZone(b)).toBeLessThan(swingZone(b - 1));
    }
    expect(swingPeriod(0)).toBe(BASE_PERIOD);
    // Even the last bite keeps a window a thumb can hit (> 100 ms around each crossing).
    const last = BITES - 1;
    const windowMs = (Math.asin(swingZone(last)) / Math.PI) * swingPeriod(last);
    expect(windowMs).toBeGreaterThan(100);
  });

  it('keeps the kerupuk where it is when the period changes', () => {
    const s = { start: 120, period: 2000 };
    for (const t of [500, 1777, 4321]) {
      const r = rephase(s, t, 1400);
      expect(r.period).toBe(1400);
      expect(swingOffset(r, t)).toBeCloseTo(swingOffset(s, t), 9);
      // ...and keeps moving the same way.
      expect(Math.sign(swingOffset(r, t + 5) - swingOffset(r, t))).toBe(
        Math.sign(swingOffset(s, t + 5) - swingOffset(s, t)),
      );
    }
  });

  it('judges centre as PAS, the zone as a bite and the edge as a miss', () => {
    expect(judge(0, 0)).toBe('perfect');
    expect(judge(-0.05, 3)).toBe('perfect');
    expect(judge(swingZone(0) * 0.9, 0)).toBe('bite');
    expect(judge(-(swingZone(0) + 0.02), 0)).toBe('bite');
    expect(judge(swingZone(0) + 0.1, 0)).toBe('miss');
    expect(judge(1, 0)).toBe('miss');
    // The same offset can be a bite on a whole kerupuk and a miss on a nearly eaten one.
    const o = swingZone(BITES - 1) + 0.06;
    expect(judge(o, 0)).toBe('bite');
    expect(judge(o, BITES - 1)).toBe('miss');
  });

  it('clamps press stamps from lagging or lying phones', () => {
    expect(pressTime(900, 1000)).toBe(900);
    expect(pressTime(1500, 1000)).toBe(1000);
    expect(pressTime(0, 1000)).toBe(1000 - MAX_LAG_MS);
    expect(pressTime(Number.NaN, 1000)).toBe(1000);
  });

  it('gives eight lanes eight different phases', () => {
    const fr = Array.from({ length: 8 }, (_, i) => phaseFraction(i, 1));
    const sorted = [...fr].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i]! - sorted[i - 1]!).toBeGreaterThan(0.05);
    expect(phaseFraction(0, 1)).not.toBe(phaseFraction(0, 2));
  });
});

describe('GameClock', () => {
  it('stops while paused and maps phone stamps into game time', () => {
    let server = 1000;
    const c = new GameClock(() => server);
    expect(c.now()).toBe(1000);
    c.pause();
    server = 4000;
    expect(c.now()).toBe(1000);
    c.resume();
    expect(c.now()).toBe(1000);
    server = 4500;
    expect(c.now()).toBe(1500);
    expect(c.toGame(4400)).toBe(1400);
    expect(c.toServer(1400)).toBe(4400);
  });
});

describe('round flow', () => {
  it('counts down, then lets everyone bite on their own swing', () => {
    const g = game([1, 2, 3]);
    expect(g.phase).toBe('intro');
    expect(types(g.drain())).toEqual(['intro']);
    expect(g.lanes.map((l) => l.id)).toEqual([1, 2, 3]);
    const offsets = g.lanes.map((l) => swingOffset(l.swing, g.goAt).toFixed(3));
    expect(new Set(offsets).size).toBe(3);
    g.tick(INTRO_MS - 1);
    expect(g.phase).toBe('intro');
    expect(g.bite(1, INTRO_MS - 1, INTRO_MS - 1)).toBe('ignored');
    go(g);
    expect(types(g.drain())).toEqual(['go']);
  });

  it('ignores a press stamped before GIGIT even if it arrives after', () => {
    const g = game();
    const t = go(g);
    expect(g.bite(1, t - 50, t + 100)).toBe('ignored');
    expect(g.lane(1)!.bites).toBe(0);
  });

  it('takes a bite when the press is stamped in the zone', () => {
    const g = game();
    go(g);
    g.drain();
    const l = g.lane(1)!;
    const t = centreAfter(l, g.goAt + 1);
    g.tick(t);
    expect(g.bite(1, t, t)).toBe('perfect');
    expect(l.bites).toBe(1);
    expect(l.swing.period).toBeCloseTo(swingPeriod(1));
    const e = g.drain();
    expect(e).toEqual([{ type: 'bite', id: 1, bites: 1, perfect: true, at: t }]);
    expect(g.stats.get(1)).toMatchObject({ bites: 1, perfect: 1, chokes: 0 });
  });

  it('judges by the phone stamp, not by arrival (relay latency)', () => {
    const g = game();
    go(g);
    const l = g.lane(1)!;
    const t = centreAfter(l, g.goAt + 1);
    // Arrives a quarter period later, when the kerupuk is at the far edge: still a bite.
    const arrival = t + l.swing.period / 4;
    expect(Math.abs(swingOffset(l.swing, arrival))).toBeCloseTo(1);
    g.tick(arrival);
    expect(g.bite(1, t, arrival)).toBe('perfect');
    // And the reverse: pressed at the edge, arriving when it is centred, is a miss.
    const g2 = game();
    go(g2);
    const l2 = g2.lane(2)!;
    const e = edgeAfter(l2, g2.goAt + 1);
    const arr2 = e + l2.swing.period / 4;
    g2.tick(arr2);
    expect(g2.bite(2, e, arr2)).toBe('choke');
  });

  it('chokes on a miss, locks the player out, then recovers', () => {
    const g = game();
    go(g);
    g.drain();
    const l = g.lane(1)!;
    const t = edgeAfter(l, g.goAt + 1);
    g.tick(t);
    expect(g.bite(1, t, t)).toBe('choke');
    expect(g.drain()).toEqual([{ type: 'choke', id: 1, at: t, until: t + CHOKE_MS }]);
    expect(g.canBite(1, t + 10)).toBe(false);
    expect(g.stats.get(1)!.chokes).toBe(1);
    // A perfectly timed press during the lockout does nothing, and does not extend it.
    const during = centreAfter(l, t + 1);
    expect(during).toBeLessThan(t + CHOKE_MS);
    g.tick(during);
    expect(g.bite(1, during, during)).toBe('ignored');
    expect(l.bites).toBe(0);
    expect(l.chokeUntil).toBe(t + CHOKE_MS);
    g.tick(t + CHOKE_MS);
    expect(g.drain()).toEqual([{ type: 'recover', id: 1 }]);
    expect(g.canBite(1, t + CHOKE_MS)).toBe(true);
    const after = centreAfter(l, t + CHOKE_MS);
    g.tick(after);
    expect(g.bite(1, after, after)).not.toBe('ignored');
    expect(l.bites).toBe(1);
  });

  it('ignores double taps and out-of-order stamps but still counts the press', () => {
    const g = game();
    go(g);
    const l = g.lane(1)!;
    const t = biteNow(g, 1, g.goAt + 1);
    const presses = l.presses;
    expect(g.bite(1, t + CHEW_MS - 1, t + CHEW_MS - 1)).toBe('ignored');
    expect(g.bite(1, t - 10, t + 300)).toBe('ignored');
    expect(l.bites).toBe(1);
    expect(l.chokeUntil).toBe(0);
    // Each press gets an answer (a fresh button on the phone), even when ignored.
    expect(l.presses).toBe(presses + 2);
  });

  it('spams cannot eat a kerupuk: every miss costs a lockout', () => {
    const g = game();
    go(g);
    // Mash every 50 ms for 10 s.
    for (let t = g.goAt; t < g.goAt + 10_000; t += 50) {
      g.tick(t);
      g.bite(1, t, t);
    }
    const l = g.lane(1)!;
    const s = g.stats.get(1)!;
    // Some mashes land in the zone by luck, but the lockouts keep it far from a timed player.
    expect(l.bites).toBeLessThan(BITES);
    expect(s.chokes).toBeGreaterThan(3);
  });

  it('ends the round when someone finishes and pays placements', () => {
    const g = game([1, 2, 3]);
    go(g);
    let t = g.goAt + 1;
    t = biteNow(g, 2, t);
    t = biteNow(g, 2, t);
    t = biteNow(g, 3, t);
    for (let i = 0; i < BITES; i++) t = biteNow(g, 1, t);
    expect(g.phase).toBe('roundEnd');
    const end = g.drain().find((e) => e.type === 'roundEnd');
    expect(end?.type).toBe('roundEnd');
    if (end?.type !== 'roundEnd') return;
    expect(end.info.reason).toBe('finish');
    expect(end.info.finisher).toBe(1);
    expect(end.info.time).toBe(g.lane(1)!.finishedAt! - g.goAt);
    expect(end.info.placements.map((p) => [p.id, p.rank, p.points])).toEqual([
      [1, 1, PLACE_POINTS[0]],
      [2, 2, PLACE_POINTS[1]],
      [3, 3, PLACE_POINTS[2]],
    ]);
    expect(g.stats.get(1)).toMatchObject({ score: PLACE_POINTS[0], wins: 1 });
    expect(g.stats.get(1)!.bestTime).toBe(end.info.time);
    // No more biting until the next round.
    expect(g.bite(2, t + 500, t + 500)).toBe('ignored');
  });

  it('ends at the time cap: most bites wins, then who got there first', () => {
    const g = game([1, 2, 3, 4]);
    go(g);
    let t = g.goAt + 1;
    t = biteNow(g, 3, t);
    t = biteNow(g, 2, t);
    t = biteNow(g, 2, t);
    t = biteNow(g, 3, t);
    g.drain();
    g.tick(g.goAt + ROUND_MS - WARN_MS);
    expect(types(g.drain())).toEqual(['warn']);
    g.tick(g.goAt + ROUND_MS);
    expect(g.phase).toBe('roundEnd');
    const info = g.lastRoundEnd!;
    expect(info.reason).toBe('time');
    expect(info.finisher).toBeNull();
    // 2 and 3 both have 2 bites; 2 got its second bite first.
    expect(info.placements.map((p) => [p.id, p.rank, p.points])).toEqual([
      [2, 1, PLACE_POINTS[0]],
      [3, 2, PLACE_POINTS[1]],
      [1, 3, 0],
      [4, 3, 0],
    ]);
  });

  it('plays every round, then the finale, then ends', () => {
    const g = game([1, 2], 2);
    go(g);
    let t = g.goAt + 1;
    for (let i = 0; i < BITES; i++) t = biteNow(g, 2, t);
    expect(g.phase).toBe('roundEnd');
    const endAt = g.phaseEndsAt;
    g.drain();
    g.tick(endAt);
    expect(g.round).toBe(2);
    expect(g.phase).toBe('intro');
    expect(types(g.drain())).toEqual(['intro']);
    expect(g.lanes.every((l) => l.bites === 0 && l.finishedAt === null)).toBe(true);
    g.tick(g.goAt + ROUND_MS);
    expect(g.phase).toBe('roundEnd');
    expect(g.lastRoundEnd!.lastRound).toBe(true);
    g.tick(g.goAt + ROUND_MS + ROUND_END_MS);
    expect(g.phase).toBe('finale');
    g.tick(g.goAt + ROUND_MS + ROUND_END_MS + FINALE_MS);
    expect(g.phase).toBe('ended');
    expect(types(g.drain())).toEqual(['go', 'warn', 'roundEnd', 'finale', 'end']);
  });

  it('gives late joiners a lane during the intro or from the next round', () => {
    const g = game([1, 2], 2);
    g.setRoster(roster(1, 2, 3), 100);
    expect(g.participants).toEqual([1, 2, 3]);
    go(g);
    g.setRoster(roster(1, 2, 3, 4), g.goAt + 10);
    expect(g.participants).toEqual([1, 2, 3]);
    expect(g.bite(4, g.goAt + 20, g.goAt + 20)).toBe('ignored');
    g.tick(g.goAt + ROUND_MS + ROUND_END_MS);
    expect(g.round).toBe(2);
    expect(g.participants).toEqual([1, 2, 3, 4]);
  });

  it('keeps a disconnected player in their lane until the round ends', () => {
    const g = game([1, 2, 3], 2);
    go(g);
    g.setRoster([...roster(1, 3), { id: 2, connected: false }], g.goAt + 10);
    expect(g.participants).toEqual([1, 2, 3]);
    expect(g.isConnected(2)).toBe(false);
    g.tick(g.goAt + ROUND_MS + ROUND_END_MS);
    expect(g.participants).toEqual([1, 3]);
  });
});

describe('placements and results', () => {
  const lane = (id: number, bites: number, lastBiteAt: number, finishedAt: number | null = null): Lane => ({
    id,
    index: id,
    bites,
    swing: { start: 0, period: 1000 },
    presses: 0,
    chokeUntil: 0,
    choking: false,
    lastPressAt: 0,
    lastBiteAt,
    finishedAt,
  });

  it('ranks finishers first and shares the last rank between players without a bite', () => {
    const p = placeLanes([
      lane(1, 3, 500),
      lane(2, BITES, 900, 900),
      lane(3, 0, Number.NEGATIVE_INFINITY),
      lane(4, 0, Number.NEGATIVE_INFINITY),
      lane(5, 3, 400),
    ]);
    expect(p.map((x) => [x.id, x.rank, x.points])).toEqual([
      [2, 1, 5],
      [5, 2, 3],
      [1, 3, 2],
      [3, 4, 0],
      [4, 4, 0],
    ]);
  });

  const stats = (id: number, score: number, bites: number, extra = {}) => ({
    id,
    score,
    bites,
    perfect: 0,
    chokes: 0,
    wins: 0,
    bestTime: null,
    timeBonus: 0,
    ...extra,
  });

  it('ranks the final standings by points, then bites, sharing ties', () => {
    const s = rankStandings([stats(1, 5, 10), stats(2, 8, 9), stats(3, 5, 10), stats(4, 5, 7)]);
    expect(s.map((x) => [x.id, x.rank])).toEqual([
      [2, 1],
      [1, 2],
      [3, 2],
      [4, 4],
    ]);
  });

  it('spreads awards and builds the shell result', () => {
    const list = [
      stats(1, 10, 14, { bestTime: 9000, perfect: 2, wins: 2 }),
      stats(2, 6, 12, { perfect: 5, chokes: 4 }),
      stats(3, 3, 13, { chokes: 1 }),
    ];
    const awards = pickAwards(list);
    expect(awards.map((a) => [a.playerId, a.icon])).toEqual([
      [1, 'zap'],
      [3, 'fire'],
      [2, 'target'],
      [2, 'heart'],
    ]);
    const names: Record<number, string> = { 1: 'Rina', 2: 'Budi', 3: 'Sari' };
    const r = buildResult(list, 3, (id) => names[id]!);
    expect(r.title).toContain('Rina');
    expect(r.ranking.map((x) => x.playerId)).toEqual([1, 2, 3]);
    expect(r.ranking[0]!.label).toContain('14');
    for (const text of [r.title, r.subtitle ?? '', ...r.ranking.map((x) => x.label ?? '')]) {
      expect(text).not.toContain(String.fromCharCode(0x2014));
    }
  });
});

describe('commentary', () => {
  it('lets important lines through and keeps minor ones from interrupting', async () => {
    const { Commentator, HOLD_MS, FILLER_MS } = await import('./commentary');
    const c = new Commentator(() => 0);
    expect(c.event({ type: 'go' }, 0)).toBe(true);
    // A plain bite is not worth a line; a PAS bite cannot interrupt the start line.
    expect(c.event({ type: 'bite', name: 'Rina', bites: 2, perfect: false, firstOfRound: false }, 100)).toBe(
      false,
    );
    expect(c.event({ type: 'bite', name: 'Rina', bites: 2, perfect: true, firstOfRound: false }, 100)).toBe(
      false,
    );
    expect(
      c.event({ type: 'bite', name: 'Rina', bites: 2, perfect: true, firstOfRound: false }, HOLD_MS + 1),
    ).toBe(true);
    expect(c.current?.bold).toBe('Rina');
    // Finishing always wins.
    expect(c.event({ type: 'finish', name: 'Budi' }, HOLD_MS + 2)).toBe(true);
    expect(c.current?.bold).toBe('Budi');
    expect(c.idle(HOLD_MS + 3)).toBe(false);
    expect(c.idle(HOLD_MS + 2 + FILLER_MS)).toBe(true);
  });
});

describe('lane layout', () => {
  it('fits 1 to 8 contestants inside the 1280 world with room to swing', async () => {
    const { laneLayout, WORLD_W } = await import('./layout');
    for (let n = 1; n <= 8; n++) {
      const l = laneLayout(n);
      expect(l.xs).toHaveLength(n);
      expect(l.xs[0]! - l.spacing / 2).toBeGreaterThanOrEqual(0);
      expect(l.xs[n - 1]! + l.spacing / 2).toBeLessThanOrEqual(WORLD_W);
      expect(l.amp).toBeLessThan(l.spacing / 2);
      expect(l.unit).toBeGreaterThanOrEqual(1.15);
    }
  });
});

describe('solo score attack', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('scores bites, PAS bites and the seconds left at the finish', () => {
    expect(finishBonus(ROUND_MS)).toBe(0);
    expect(finishBonus(ROUND_MS + 5000)).toBe(0);
    expect(finishBonus(ROUND_MS - 10_000)).toBe(10 * SOLO_PER_SEC);
    expect(finishBonus(Number.NaN)).toBe(0);
    expect(soloScore({ bites: 7, perfect: 3, timeBonus: 900 })).toBe(7 * SOLO_BITE + 3 * SOLO_PAS + 900);
  });

  it('runs a one-player game cleanly from intro to end', () => {
    const g = game([1], 1);
    expect(g.solo).toBe(true);
    expect(g.lanes).toHaveLength(1);
    let t = go(g);
    const start = t;
    for (let i = 0; i < BITES; i++) t = biteNow(g, 1, t);
    // Every bite was dead centre: all PAS, the kerupuk is finished and the round is over.
    const s = g.stats.get(1)!;
    expect(s).toMatchObject({ bites: BITES, perfect: BITES, chokes: 0 });
    expect(s.bestTime).toBe(t - start);
    expect(s.timeBonus).toBe(finishBonus(t - start));
    expect(g.phase).toBe('roundEnd');
    expect(g.lastRoundEnd!.reason).toBe('finish');
    g.tick(g.phaseEndsAt);
    expect(g.phase).toBe('finale');
    g.tick(g.phaseEndsAt);
    expect(g.phase).toBe('ended');
    expect(soloScore(s)).toBe(BITES * (SOLO_BITE + SOLO_PAS) + finishBonus(t - start));
  });

  it('keeps scoring a timed-out solo round by its bites', () => {
    const g = game([1], 1);
    let t = go(g);
    t = biteNow(g, 1, t);
    biteNow(g, 1, t);
    g.tick(g.roundEndsAt);
    expect(g.lastRoundEnd!.reason).toBe('time');
    const s = g.stats.get(1)!;
    expect(s.timeBonus).toBe(0);
    expect(soloScore(s)).toBe(2 * (SOLO_BITE + SOLO_PAS));
  });

  it('is not solo with two players, whose placement points stay as before', () => {
    const g = game([1, 2], 1);
    expect(g.solo).toBe(false);
    let t = go(g);
    for (let i = 0; i < BITES; i++) t = biteNow(g, 1, t);
    expect(g.stats.get(1)!.score).toBe(PLACE_POINTS[0]);
  });

  it('describes the record: first, new, equal and short', () => {
    expect(recordKind({ best: 900, previous: null, isNew: false }, 900)).toBe('first');
    expect(recordKind({ best: 1200, previous: 900, isNew: true }, 1200)).toBe('new');
    expect(recordKind({ best: 1200, previous: 1200, isNew: false }, 1200)).toBe('tie');
    expect(recordKind({ best: 1200, previous: 1200, isNew: false }, 1000)).toBe('short');
    expect(recordLine({ best: 900, previous: null, isNew: false }, 900)).toBe(
      'Rekor pertama tercatat: 900 poin',
    );
    expect(recordLine({ best: 1250, previous: 980, isNew: true }, 1250)).toBe(
      'Rekor baru! 1.250 poin (sebelumnya 980)',
    );
    expect(recordLine({ best: 1250, previous: 1250, isNew: false }, 1000)).toBe(
      'Rekor: 1.250 poin, kurang 250 lagi',
    );
  });

  it('builds a solo result with the record line and no rivals', () => {
    const me = { id: 7, score: 5, bites: 7, perfect: 2, chokes: 1, wins: 1, bestTime: 9000, timeBonus: 1800 };
    const first = submitRecord('kerupuk-test', '1', soloScore(me));
    // Node has no localStorage: the helper reports a first record.
    expect(first).toEqual({ best: soloScore(me), previous: null, isNew: false });
    const r = buildSoloResult(me, first);
    expect(r.title).toBe('Skor 2.600!');
    expect(r.subtitle).toBe('Rekor pertama tercatat: 2.600 poin');
    expect(r.ranking).toEqual([{ playerId: 7, score: 2600, rank: 1, label: '2.600 poin' }]);
    for (const text of [r.title, r.subtitle ?? '', ...(r.awards ?? []).map((a) => a.desc)]) {
      expect(text).not.toMatch(/juara|revans/i);
      expect(text).not.toContain(String.fromCharCode(0x2014));
    }
  });

  it('remembers the record on the main screen between solo games', () => {
    const mem = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => mem.set(k, v),
    });
    const a = submitRecord('kerupuk', '1', 1500);
    expect(recordLine(a, 1500)).toBe('Rekor pertama tercatat: 1.500 poin');
    const b = submitRecord('kerupuk', '1', 1200);
    expect(recordLine(b, 1200)).toBe('Rekor: 1.500 poin, kurang 300 lagi');
    const c = submitRecord('kerupuk', '1', 1800);
    expect(recordLine(c, 1800)).toBe('Rekor baru! 1.800 poin (sebelumnya 1.500)');
    // Kilat and Normal keep their own records.
    expect(submitRecord('kerupuk', '3', 400).previous).toBeNull();
  });
});

describe('a phone dropping mid-game', () => {
  it('never stalls the round: the others finish it, or the time cap does', () => {
    const g = game([1, 2], 2);
    let t = go(g);
    t = biteNow(g, 2, t);
    g.setRoster(
      [
        { id: 1, connected: true },
        { id: 2, connected: false },
      ],
      t,
    );
    // The dropped lane stays (frozen) and the round runs on.
    expect(g.lanes).toHaveLength(2);
    for (let i = 0; i < BITES; i++) t = biteNow(g, 1, t);
    expect(g.phase).toBe('roundEnd');
    // Next round: only connected players get a lane, and the time cap still ends it.
    g.tick(g.phaseEndsAt);
    expect(g.phase).toBe('intro');
    expect(g.participants).toEqual([1]);
    go(g);
    g.tick(g.roundEndsAt);
    expect(g.phase).toBe('roundEnd');
    g.tick(g.phaseEndsAt);
    g.tick(g.phaseEndsAt);
    expect(g.phase).toBe('ended');
  });

  it('gives a player who reconnects during the intro their lane back', () => {
    const g = game([1, 2], 2);
    g.setRoster(
      [
        { id: 1, connected: true },
        { id: 2, connected: false },
      ],
      0,
    );
    expect(g.participants).toEqual([1]);
    g.setRoster(roster(1, 2), 10);
    expect(g.participants).toEqual([1, 2]);
  });
});

describe('layout', () => {
  it('hangs the kerupuk just above the mouth, below the head centre', () => {
    for (const u of [1.15, 1.5, 1.8]) {
      expect(mouthY(u)).toBeGreaterThan(headCenterY(u));
      expect(kerupukRestY(u)).toBeLessThan(mouthY(u));
    }
  });
});
