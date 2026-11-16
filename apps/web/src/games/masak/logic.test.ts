import { GESTURE_HOLD } from '@hoorah/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { submitRecord } from '../common/records';
import { gridShape, stationRects } from './layout';
import {
  ALL_DONE_GRACE_MS,
  BURN_GRACE_MS,
  dishStars,
  GameClock,
  GRADE_POINTS,
  gradeCount,
  gradeHold,
  INPUT_GRACE_MS,
  INTRO_FIRST_MS,
  INTRO_MS,
  type MasakEvent,
  MasakLogic,
  parseRounds,
  READY_MS,
  REVEAL_MS,
  SHOWCASE_MS,
  STAR_BONUS,
  streakBonus,
} from './logic';
import { DISHES, type DishId, dishOrder } from './recipes';
import { buildResult, pickAwards, rankStandings, recordKind, soloRecord } from './results';
import { finalView } from './views';

const EGG = DISHES.nasgor.steps[4]!.hold!;

/** A game clock driven by hand. */
function game(ids: number[] = [1, 2], dishes: DishId[] = ['nasgor'], opts: { prime?: boolean } = {}) {
  const L = new MasakLogic({ dishes, roster: ids.map((id) => ({ id, connected: true })), now: 0 });
  const log: MasakEvent[] = [];
  let t = 0;
  const taps = new Map<number, number>(ids.map((id) => [id, 100]));
  const api = {
    L,
    log,
    get t() {
      return t;
    },
    at(ms: number) {
      t = ms;
      L.tick(t);
      log.push(...L.drain());
    },
    advance(ms: number) {
      api.at(t + ms);
    },
    /** Jump to the cook phase of the current/next step. */
    toCook() {
      for (let i = 0; i < 200 && L.phase !== 'cook'; i++) api.advance(50);
      expect(L.phase).toBe('cook');
    },
    tap(id: number, n = 1, at = t) {
      const next = (taps.get(id)! + n) & 0xffff;
      taps.set(id, next);
      const r = L.input(id, { taps: next, buttons: 0, at }, t);
      log.push(...L.drain());
      return r;
    },
    hold(id: number, down: boolean, at = t) {
      const r = L.input(id, { taps: taps.get(id)!, buttons: down ? GESTURE_HOLD : 0, at }, t);
      log.push(...L.drain());
      return r;
    },
    /** Kept for readability: counters are primed at creation (see below). */
    prime() {},
  };
  // Prime the phone counters during the intro so the first-frame rule doesn't matter.
  if (opts.prime !== false) for (const id of ids) L.input(id, { taps: taps.get(id)!, buttons: 0, at: 0 }, 0);
  return api;
}

describe('grading', () => {
  const step = { target: 10, perfectMs: 4000 };
  it('count steps: fast is Sempurna, finished is Bagus', () => {
    expect(gradeCount(step, 10, 3999)).toEqual({ grade: 'sempurna', reason: 'fast' });
    expect(gradeCount(step, 10, 4000)).toEqual({ grade: 'sempurna', reason: 'fast' });
    expect(gradeCount(step, 10, 4001)).toEqual({ grade: 'bagus', reason: 'done' });
  });
  it('count steps: unfinished is Lumayan from 60 %, else Gagal', () => {
    expect(gradeCount(step, 6, null)).toEqual({ grade: 'lumayan', reason: 'slow' });
    expect(gradeCount(step, 5, null)).toEqual({ grade: 'gagal', reason: 'slow' });
    expect(gradeCount(step, 0, null)).toEqual({ grade: 'gagal', reason: 'idle' });
  });
  it('hold steps: golden window, perfect center, over, burnt, raw', () => {
    expect(gradeHold(EGG, EGG.sweet).grade).toBe('sempurna');
    expect(gradeHold(EGG, EGG.sweet + EGG.perfect).grade).toBe('sempurna');
    expect(gradeHold(EGG, EGG.lo)).toEqual({ grade: 'bagus', reason: 'close' });
    expect(gradeHold(EGG, EGG.hi)).toEqual({ grade: 'bagus', reason: 'close' });
    expect(gradeHold(EGG, EGG.hi + 0.01)).toEqual({ grade: 'lumayan', reason: 'over' });
    expect(gradeHold(EGG, EGG.burn)).toEqual({ grade: 'gagal', reason: 'burnt' });
    expect(gradeHold(EGG, EGG.lo * 0.6)).toEqual({ grade: 'lumayan', reason: 'raw' });
    expect(gradeHold(EGG, 0.1)).toEqual({ grade: 'gagal', reason: 'raw' });
    expect(gradeHold(EGG, 0)).toEqual({ grade: 'gagal', reason: 'idle' });
  });
  it('streak bonus grows by 10 per extra Sempurna, capped', () => {
    expect(streakBonus(1)).toBe(0);
    expect(streakBonus(2)).toBe(10);
    expect(streakBonus(4)).toBe(30);
    expect(streakBonus(20)).toBe(50);
  });
  it('dish stars from step grades', () => {
    expect(dishStars(['sempurna', 'sempurna', 'sempurna', 'bagus', 'sempurna', 'sempurna'], 6)).toBe(3);
    expect(dishStars(['bagus', 'bagus', 'bagus', 'bagus', 'bagus', 'bagus'], 6)).toBe(2);
    expect(dishStars(['lumayan', 'lumayan', 'lumayan', 'lumayan', 'lumayan', 'lumayan'], 6)).toBe(1);
    expect(dishStars([null, null, null, null, null, null], 6)).toBe(1);
    expect(dishStars(['sempurna', 'sempurna', 'sempurna'], 6)).toBe(2);
  });
});

describe('recipes', () => {
  it('every dish has 5-6 steps, 7-10 s each, and mixes gestures', () => {
    for (const d of Object.values(DISHES)) {
      expect(d.steps.length).toBeGreaterThanOrEqual(5);
      expect(d.steps.length).toBeLessThanOrEqual(6);
      for (const s of d.steps) {
        expect(s.timeMs).toBeGreaterThanOrEqual(6500);
        expect(s.timeMs).toBeLessThanOrEqual(10000);
        if (s.mode === 'hold') expect(s.hold).toBeDefined();
        else expect(s.perfectMs).toBeLessThan(s.timeMs);
        if (s.mode === 'swipe') expect(s.dir).toBeDefined();
      }
      expect(new Set(d.steps.map((s) => s.mode)).size).toBeGreaterThanOrEqual(3);
    }
  });
  it('dish order: full menu for 3, seeded distinct picks below', () => {
    expect(dishOrder(3, 1)).toEqual(['nasgor', 'sate', 'martabak']);
    expect(dishOrder(9, 1)).toHaveLength(3);
    const seen = new Set<string>();
    for (let s = 0; s < 40; s++) {
      const one = dishOrder(1, s);
      expect(one).toHaveLength(1);
      seen.add(one[0]!);
      const two = dishOrder(2, s);
      expect(new Set(two).size).toBe(2);
    }
    expect(seen.size).toBe(3);
    expect(dishOrder(1, 7)).toEqual(dishOrder(1, 7));
  });
  it('parseRounds clamps to 1..3', () => {
    expect(parseRounds(1)).toBe(1);
    expect(parseRounds('3')).toBe(3);
    expect(parseRounds(8)).toBe(3);
    expect(parseRounds(undefined)).toBe(3);
  });
});

describe('flow', () => {
  it('runs intro, ready, cook, reveal for each step, then showcase, final and end', () => {
    const g = game([1]);
    expect(g.L.phase).toBe('intro');
    g.at(INTRO_FIRST_MS);
    expect(g.L.phase).toBe('ready');
    g.at(INTRO_FIRST_MS + READY_MS);
    expect(g.L.phase).toBe('cook');
    expect(g.L.deadline).toBe(INTRO_FIRST_MS + READY_MS + DISHES.nasgor.steps[0]!.timeMs);
    // Nobody does anything: every step times out.
    g.at(200_000);
    const types = g.log.map((e) => e.type);
    expect(types.filter((t) => t === 'reveal')).toHaveLength(6);
    expect(types.filter((t) => t === 'showcase')).toHaveLength(1);
    expect(types.at(-2)).toBe('final');
    expect(types.at(-1)).toBe('end');
    expect(g.L.phase).toBe('ended');
    const s = g.L.stats.get(1)!;
    expect(s.grades[0]).toEqual(Array(6).fill('gagal'));
    expect(s.dishStars[0]).toBe(1);
    expect(s.score).toBe(STAR_BONUS);
  });

  it('step timing chains exactly from scheduled times', () => {
    const g = game([1]);
    g.at(100_000);
    const cooks = g.log.filter((e) => e.type === 'cook');
    const steps = DISHES.nasgor.steps;
    let t = INTRO_FIRST_MS + READY_MS;
    for (let i = 0; i < cooks.length; i++) {
      const c = cooks[i]!;
      if (c.type !== 'cook') throw new Error();
      expect(c.deadline).toBe(t + steps[i]!.timeMs);
      t = c.deadline + INPUT_GRACE_MS + REVEAL_MS + READY_MS;
    }
  });

  it('a second dish starts with its own intro', () => {
    const g = game([1], ['nasgor', 'sate']);
    g.at(400_000);
    const intros = g.log.filter((e) => e.type === 'intro');
    expect(intros.map((e) => e.type === 'intro' && e.dishIndex)).toEqual([0, 1]);
    expect(g.L.dishIndex).toBe(1);
    expect(g.log.filter((e) => e.type === 'showcase')).toHaveLength(2);
    void INTRO_MS;
    void SHOWCASE_MS;
  });
});

describe('count steps', () => {
  it('fast chopping is Sempurna and ends the step early when everyone is done', () => {
    const g = game([1, 2]);
    g.toCook();
    g.prime();
    const start = g.t;
    const target = g.L.step.target;
    for (let i = 0; i < target; i++) {
      g.advance(150);
      g.tap(1);
      g.tap(2);
    }
    expect(g.L.runs.get(1)!.grade).toBe('sempurna');
    expect(g.L.runs.get(2)!.grade).toBe('sempurna');
    expect(g.L.allDoneAt).toBe(g.t);
    g.advance(ALL_DONE_GRACE_MS - 1);
    expect(g.L.phase).toBe('cook');
    g.advance(1);
    expect(g.L.phase).toBe('reveal');
    expect(g.t - start).toBeLessThan(g.L.step.timeMs);
    const reveal = g.log.find((e) => e.type === 'reveal');
    expect(reveal && reveal.type === 'reveal' && reveal.results.map((r) => r.grade)).toEqual([
      'sempurna',
      'sempurna',
    ]);
  });

  it('grades by the time stamped on the phone, not arrival', () => {
    const g = game([1]);
    g.toCook();
    g.prime();
    const start = g.t;
    const target = g.L.step.target;
    // All taps arrive late, but were stamped quickly.
    g.at(start + g.L.step.perfectMs + 1500);
    g.tap(1, target - 1, start + 1000);
    g.tap(1, 1, start + 1500);
    expect(g.L.runs.get(1)!.grade).toBe('sempurna');
  });

  it('caps the tap rate (auto-clicker guard) and ignores resync jumps', () => {
    const g = game([1]);
    g.toCook();
    g.prime();
    g.advance(100);
    // 30 taps in one frame after 100 ms: only the burst is allowed.
    const r = g.tap(1, 30);
    expect(r.counted).toBe(4); // floor(16 * 0.1) + 3
    g.advance(1000);
    const jump = g.tap(1, 500);
    expect(jump.counted).toBe(0);
  });

  it('u16 counter wrap counts correctly', () => {
    const L = new MasakLogic({ dishes: ['nasgor'], roster: [{ id: 1, connected: true }], now: 0 });
    L.tick(INTRO_FIRST_MS + READY_MS);
    const t = INTRO_FIRST_MS + READY_MS + 2000;
    L.input(1, { taps: 65534, buttons: 0, at: t }, t);
    const r = L.input(1, { taps: 2, buttons: 0, at: t }, t);
    expect(r.counted).toBe(4);
  });

  it('the first frame of a tap step counts as one tap, of a stir step as none', () => {
    const g = game([1], ['nasgor'], { prime: false });
    g.toCook();
    g.advance(500);
    expect(g.tap(1).counted).toBe(1);
    const s = game([1], ['nasgor'], { prime: false });
    // Skip to the saute (stir) step.
    for (let i = 0; i < 3; i++) {
      s.toCook();
      s.at(s.L.cookEndsAt);
    }
    s.toCook();
    expect(s.L.step.mode).toBe('stir');
    s.advance(500);
    expect(s.hold(1, true).counted).toBe(0);
  });

  it('unfinished steps grade at the deadline', () => {
    const g = game([1, 2]);
    g.toCook();
    g.prime();
    const target = g.L.step.target;
    for (let i = 0; i < Math.ceil(target * 0.6); i++) {
      g.advance(100);
      g.tap(1);
    }
    g.tap(2, 1);
    g.at(g.L.deadline + INPUT_GRACE_MS);
    expect(g.L.phase).toBe('reveal');
    expect(g.L.runs.get(1)!.grade).toBe('lumayan');
    expect(g.L.runs.get(2)!.grade).toBe('gagal');
  });

  it('frames stamped after the deadline do not count', () => {
    const g = game([1]);
    g.toCook();
    g.prime();
    const target = g.L.step.target;
    g.advance(3000);
    g.tap(1, target - 1);
    g.at(g.L.deadline + 100);
    const r = g.tap(1, 1, g.L.deadline + 50);
    expect(r.counted).toBe(0);
  });

  it('ignores input outside the cook phase but keeps the counter in sync', () => {
    const g = game([1]);
    g.advance(100);
    expect(g.L.phase).toBe('intro');
    g.tap(1, 5);
    g.toCook();
    g.advance(500);
    expect(g.tap(1).counted).toBe(1);
    expect(g.L.runs.get(1)!.count).toBe(1);
  });
});

describe('hold steps', () => {
  /** Skip to the egg step (index 4). */
  function toEgg(ids = [1, 2]) {
    const g = game(ids);
    for (let i = 0; i < 4; i++) {
      g.toCook();
      g.at(g.L.cookEndsAt);
    }
    g.toCook();
    expect(g.L.step.id).toBe('nasgor-egg');
    g.prime();
    return g;
  }

  it('release in the golden window by phone time', () => {
    const g = toEgg([1]);
    const press = g.t + 300;
    g.at(press + 50);
    g.hold(1, true, press);
    const holdMs = EGG.sweet * EGG.fillMs;
    g.at(press + holdMs + 120);
    const r = g.hold(1, false, press + holdMs);
    expect(r.finished).toBe(true);
    const run = g.L.runs.get(1)!;
    expect(run.grade).toBe('sempurna');
    expect(run.amount).toBeCloseTo(EGG.sweet, 5);
    expect(g.L.stats.get(1)!.holdErrors[0]).toBeCloseTo(0, 5);
  });

  it('short presses add up; an early release does not finish', () => {
    const g = toEgg([1]);
    const t0 = g.t;
    g.hold(1, true, t0);
    g.at(t0 + 1000);
    const r1 = g.hold(1, false, t0 + 1000);
    expect(r1.finished).toBe(false);
    expect(g.L.amountAt(1, g.t)).toBeCloseTo(1000 / EGG.fillMs, 5);
    g.at(t0 + 1500);
    g.hold(1, true, t0 + 1500);
    g.at(t0 + 3000);
    expect(g.L.amountAt(1, g.t)).toBeCloseTo(2500 / EGG.fillMs, 5);
    const r2 = g.hold(1, false, t0 + 3000);
    expect(r2.finished).toBe(true);
    expect(g.L.runs.get(1)!.grade).toBe('bagus');
  });

  it('holding too long burns, after a grace for a release in flight', () => {
    const g = toEgg([1]);
    const t0 = g.t;
    g.hold(1, true, t0);
    const burnAt = t0 + EGG.burn * EGG.fillMs;
    g.at(burnAt + BURN_GRACE_MS - 1);
    expect(g.L.runs.get(1)!.grade).toBeNull();
    g.at(burnAt + BURN_GRACE_MS);
    const run = g.L.runs.get(1)!;
    expect(run.grade).toBe('gagal');
    expect(run.reason).toBe('burnt');
    expect(run.doneAt).toBe(burnAt);
    expect(g.L.stats.get(1)!.burns).toBe(1);
  });

  it('a release stamped just before the burn point wins over the grace', () => {
    const g = toEgg([1]);
    const t0 = g.t;
    g.hold(1, true, t0);
    const burnAt = t0 + EGG.burn * EGG.fillMs;
    g.at(burnAt + 100);
    g.hold(1, false, t0 + EGG.hi * EGG.fillMs);
    expect(g.L.runs.get(1)!.grade).toBe('bagus');
  });

  it('still holding at the deadline grades the amount at the deadline', () => {
    const g = toEgg([1]);
    const press = g.L.deadline - EGG.sweet * EGG.fillMs;
    g.at(press);
    g.hold(1, true, press);
    g.at(g.L.deadline + INPUT_GRACE_MS);
    expect(g.L.runs.get(1)!.grade).toBe('sempurna');
  });

  it('never pressed is Gagal', () => {
    const g = toEgg([1]);
    g.at(g.L.deadline + INPUT_GRACE_MS);
    expect(g.L.runs.get(1)!.grade).toBe('gagal');
    expect(g.L.runs.get(1)!.reason).toBe('idle');
  });
});

describe('pause', () => {
  it('absorb counts nothing but ends a press at the pause moment', () => {
    const g = game([1]);
    g.toCook();
    g.advance(500);
    g.L.absorb(1, { taps: 999, buttons: 0, at: g.t }, g.t);
    expect(g.L.runs.get(1)!.count).toBe(0);
    // The counter was synced: the next real tap counts as one.
    g.advance(100);
    const r = g.L.input(1, { taps: 1000, buttons: 0, at: g.t }, g.t);
    expect(r.counted).toBe(1);
  });
});

describe('players', () => {
  it('a disconnected player is Gagal for missed steps and does not hold the step up', () => {
    const g = game([1, 2]);
    g.toCook();
    g.prime();
    g.L.setRoster(
      [
        { id: 1, connected: true },
        { id: 2, connected: false },
      ],
      g.t,
    );
    for (let i = 0; i < g.L.step.target; i++) {
      g.advance(100);
      g.tap(1);
    }
    expect(g.L.allDoneAt).not.toBeNull();
    g.advance(ALL_DONE_GRACE_MS);
    expect(g.L.phase).toBe('reveal');
    expect(g.L.runs.get(2)!.grade).toBe('gagal');
    expect(g.L.runs.get(2)!.reason).toBe('missed');
  });

  it('a player who rejoins mid-step can still finish it', () => {
    const g = game([1, 2]);
    g.toCook();
    g.prime();
    g.L.setRoster(
      [
        { id: 1, connected: true },
        { id: 2, connected: false },
      ],
      g.t,
    );
    g.advance(500);
    g.L.setRoster(
      [
        { id: 1, connected: true },
        { id: 2, connected: true },
      ],
      g.t,
    );
    for (let i = 0; i < g.L.step.target; i++) {
      g.advance(120);
      g.tap(2);
    }
    expect(g.L.runs.get(2)!.grade).toBe('sempurna');
  });

  it('a newcomer joins the next step; earlier steps count as missed', () => {
    const g = game([1]);
    g.toCook();
    g.at(g.L.cookEndsAt);
    expect(g.L.phase).toBe('reveal');
    g.L.setRoster(
      [
        { id: 1, connected: true },
        { id: 3, connected: true },
      ],
      g.t,
    );
    expect(g.L.participants).toEqual([1, 3]);
    expect(g.L.stats.get(3)!.grades[0]![0]).toBe('gagal');
    expect(g.L.stats.get(3)!.grades[0]![1]).toBeNull();
    g.toCook();
    expect(g.L.runs.has(3)).toBe(true);
  });

  it('scores: grade points, streak bonus and star bonus', () => {
    const g = game([1]);
    let expected = 0;
    let streak = 0;
    for (let s = 0; s < 6; s++) {
      g.toCook();
      g.prime();
      const step = g.L.step;
      if (step.hold) {
        g.hold(1, true, g.t);
        g.advance(step.hold.sweet * step.hold.fillMs);
        g.hold(1, false, g.t);
      } else {
        for (let i = 0; i < step.target; i++) {
          g.advance(Math.floor(step.perfectMs / step.target / 2));
          g.tap(1);
        }
      }
      streak++;
      expected += GRADE_POINTS.sempurna + streakBonus(streak);
      g.at(g.L.cookEndsAt);
    }
    const st = g.L.stats.get(1)!;
    expect(st.perfects).toBe(6);
    expect(st.bestStreak).toBe(6);
    g.at(g.t + REVEAL_MS);
    expect(g.L.phase).toBe('showcase');
    expect(st.dishStars[0]).toBe(3);
    expect(st.score).toBe(expected + 3 * STAR_BONUS);
  });
});

describe('results', () => {
  function stats(id: number, score: number, extra: Partial<ReturnType<typeof base>> = {}) {
    return { ...base(id), score, ...extra };
  }
  function base(id: number) {
    return {
      id,
      score: 0,
      stars: 0,
      dishStars: [0],
      dishPoints: [0],
      grades: [[]],
      reasons: [[]],
      amounts: [[]],
      perfects: 0,
      fails: 0,
      streak: 0,
      bestStreak: 0,
      knifeMs: [] as number[],
      stirMs: [] as number[],
      holdErrors: [] as number[],
      burns: 0,
    };
  }
  it('ties share a rank', () => {
    const r = rankStandings([stats(1, 300), stats(2, 500), stats(3, 300)]);
    expect(r.map((s) => [s.id, s.rank])).toEqual([
      [2, 1],
      [1, 2],
      [3, 2],
    ]);
  });
  it('awards spread across players and respect eligibility', () => {
    const a = pickAwards([
      stats(1, 900, { stars: 3, knifeMs: [3000], holdErrors: [0.02], bestStreak: 4 }),
      stats(2, 600, { stars: 2, knifeMs: [2500], burns: 1, holdErrors: [0.01] }),
      stats(3, 400, { stars: 1, stirMs: [4000] }),
    ]);
    const by = Object.fromEntries(a.map((x) => [x.title, x.playerId]));
    expect(by['Bintang Dapur']).toBe(1);
    expect(by['Pisau Tercepat']).toBe(2);
    // Player 2 burnt something: no Anti Gosong for them.
    expect(by['Anti Gosong']).toBe(1);
    expect(by['Jago Aduk']).toBe(3);
    expect(a.length).toBeLessThanOrEqual(4);
  });
  it('builds the shell result with a winner headline', () => {
    const r = buildResult([stats(1, 100, { stars: 2 }), stats(2, 300, { stars: 3 })], ['nasgor'], (id) =>
      id === 1 ? 'Rina' : 'Budi',
    );
    expect(r.title).toBe('Budi Juara Dapur!');
    expect(r.ranking[0]!.playerId).toBe(2);
    expect(r.ranking[0]!.label).toBe('3 bintang · 0 Sempurna');
  });

  describe('solo score attack', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('describes the record: first, new, equal and short', () => {
      expect(soloRecord({ best: 640, previous: null, isNew: false }, 640)).toEqual({
        text: 'Rekor pertama tercatat: 640 poin',
        isNew: false,
      });
      expect(soloRecord({ best: 1250, previous: 980, isNew: true }, 1250)).toEqual({
        text: 'Rekor baru! 1.250 poin (sebelumnya 980)',
        isNew: true,
      });
      expect(recordKind({ best: 900, previous: 900, isNew: false }, 900)).toBe('tie');
      expect(soloRecord({ best: 1250, previous: 1250, isNew: false }, 1000).text).toBe(
        'Rekor: 1.250 poin, kurang 250 lagi',
      );
    });

    it('puts the record line under the solo headline and on the phone', () => {
      const me = stats(1, 640, { stars: 2 });
      // Node has no localStorage: the helper reports a first record.
      const record = soloRecord(submitRecord('masak-test', '1', 640), 640);
      const r = buildResult([me], ['nasgor'], () => 'Rina', record);
      expect(r.title).toBe('Kamu dapat 2 dari 3 bintang!');
      expect(r.subtitle).toBe('Rekor pertama tercatat: 640 poin');
      expect(r.title).not.toMatch(/juara/i);
      const [st] = rankStandings([me]);
      expect(finalView(st!, true, r.title, record)).toMatchObject({ subtitle: record.text, big: '640 poin' });
      // Multiplayer never shows a record, even if one is passed by mistake.
      const multi = buildResult([me, stats(2, 100)], ['nasgor'], () => 'X', record);
      expect(multi.subtitle).toBe('Nasi Goreng');
    });

    it('remembers the score per mode on the main screen', () => {
      const mem = new Map<string, string>();
      vi.stubGlobal('localStorage', {
        getItem: (k: string) => mem.get(k) ?? null,
        setItem: (k: string, v: string) => mem.set(k, v),
      });
      expect(soloRecord(submitRecord('masak', '1', 700), 700).text).toBe('Rekor pertama tercatat: 700 poin');
      expect(soloRecord(submitRecord('masak', '1', 650), 650).text).toBe('Rekor: 700 poin, kurang 50 lagi');
      expect(soloRecord(submitRecord('masak', '1', 900), 900).text).toBe(
        'Rekor baru! 900 poin (sebelumnya 700)',
      );
      expect(submitRecord('masak', '3', 100).previous).toBeNull();
    });
  });
});

describe('clock', () => {
  it('freezes while paused and shifts after', () => {
    let server = 1000;
    const c = new GameClock(() => server);
    expect(c.now()).toBe(1000);
    c.pause();
    server = 5000;
    expect(c.now()).toBe(1000);
    c.resume();
    expect(c.now()).toBe(1000);
    server = 5500;
    expect(c.now()).toBe(1500);
    expect(c.toServer(1500)).toBe(5500);
    expect(c.toGame(5500)).toBe(1500);
  });
});

describe('layout', () => {
  it('grid shapes', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((n) => gridShape(n))).toEqual([
      { cols: 1, rows: 1 },
      { cols: 2, rows: 1 },
      { cols: 2, rows: 2 },
      { cols: 2, rows: 2 },
      { cols: 3, rows: 2 },
      { cols: 3, rows: 2 },
      { cols: 4, rows: 2 },
      { cols: 4, rows: 2 },
    ]);
  });
  it('stations stay inside the stage, never overlap, short rows centered', () => {
    for (const h of [720, 800, 960]) {
      for (let n = 1; n <= 8; n++) {
        const rs = stationRects(n, h);
        expect(rs).toHaveLength(n);
        for (const r of rs) {
          expect(r.x).toBeGreaterThanOrEqual(0);
          expect(r.x + r.w).toBeLessThanOrEqual(1280);
          expect(r.y + r.h).toBeLessThanOrEqual(h);
        }
        for (let i = 0; i < n; i++)
          for (let j = i + 1; j < n; j++) {
            const a = rs[i]!;
            const b = rs[j]!;
            const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
            expect(apart).toBe(true);
          }
      }
    }
    const three = stationRects(3, 720);
    expect(three[2]!.x + three[2]!.w / 2).toBeCloseTo(640, -1);
  });
  it('stations span a stage wider than 16:9 with the same margins', () => {
    const W = 1707;
    for (let n = 1; n <= 8; n++) {
      const rs = stationRects(n, 720, W);
      const right = Math.max(...rs.map((r) => r.x + r.w));
      const left = Math.min(...rs.map((r) => r.x));
      expect(left).toBeGreaterThanOrEqual(16);
      expect(left).toBeLessThanOrEqual(16 + 4);
      expect(right).toBeLessThanOrEqual(W - 16);
      expect(right).toBeGreaterThanOrEqual(W - 16 - 4);
    }
  });
});
