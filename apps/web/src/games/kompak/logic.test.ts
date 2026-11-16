import { describe, expect, it } from 'vitest';
import {
  buildResult,
  computeAwards,
  coopTitle,
  drawPrompts,
  KompakMatch,
  type PlayerRecord,
  percent,
  SCORING,
  scoreRound,
  TIMING,
} from './logic';
import { LIMITS, PROMPTS, type Prompt } from './prompts';
import { STR } from './strings';
import { optionIndex, viewFor } from './views';

/** U+2014, built from its code so this file itself stays free of the character. */
const EM_DASH = String.fromCharCode(0x2014);
const pick = (playerId: number, option: number | null, timeMs = 1000) => ({ playerId, option, timeMs });
const kinds = (r: ReturnType<typeof scoreRound>) => r.outcomes.map((o) => o.kind);
const points = (r: ReturnType<typeof scoreRound>) => r.outcomes.map((o) => o.points);

describe('scoreRound: 3+ players', () => {
  it('pays the largest group only', () => {
    const r = scoreRound([pick(1, 0), pick(2, 0), pick(3, 1), pick(4, 2)]);
    expect(r.mode).toBe('group');
    expect(r.counts).toEqual([2, 1, 1, 0]);
    expect(r.winners).toEqual([0]);
    expect(kinds(r)).toEqual(['kompak', 'kompak', 'alone', 'alone']);
    expect(points(r)).toEqual([SCORING.kompak, SCORING.kompak, 0, 0]);
    expect(r.unanimous).toBe(false);
  });

  it('pays every tied largest group', () => {
    const r = scoreRound([pick(1, 0), pick(2, 0), pick(3, 3), pick(4, 3), pick(5, 1)]);
    expect(r.winners).toEqual([0, 3]);
    expect(points(r)).toEqual([100, 100, 100, 100, 0]);
    expect(kinds(r)[4]).toBe('alone');
  });

  it('marks a smaller group of 2+ as minority, not alone', () => {
    const r = scoreRound([pick(1, 0), pick(2, 0), pick(3, 0), pick(4, 1), pick(5, 1)]);
    expect(kinds(r)).toEqual(['kompak', 'kompak', 'kompak', 'minority', 'minority']);
  });

  it('pays nobody when everyone is alone', () => {
    const r = scoreRound([pick(1, 0), pick(2, 1), pick(3, 2)]);
    expect(r.winners).toEqual([]);
    expect(kinds(r)).toEqual(['alone', 'alone', 'alone']);
    expect(points(r)).toEqual([0, 0, 0]);
  });

  it('adds the unanimous bonus only when every participant picked the same', () => {
    const all = scoreRound([pick(1, 2), pick(2, 2), pick(3, 2)]);
    expect(all.unanimous).toBe(true);
    expect(points(all)).toEqual(Array(3).fill(SCORING.kompak + SCORING.unanimous));
    expect(all.outcomes[0]!.bonus).toBe(SCORING.unanimous);

    const oneLate = scoreRound([pick(1, 2), pick(2, 2), pick(3, null)]);
    expect(oneLate.unanimous).toBe(false);
    expect(points(oneLate)).toEqual([SCORING.kompak, SCORING.kompak, 0]);
    expect(kinds(oneLate)[2]).toBe('missed');
  });

  it('treats timeouts as no vote', () => {
    const r = scoreRound([pick(1, null), pick(2, null), pick(3, 1)]);
    expect(r.counts).toEqual([0, 1, 0, 0]);
    expect(kinds(r)).toEqual(['missed', 'missed', 'alone']);
    expect(r.outcomes[0]!.timeMs).toBeNull();
  });
});

describe('scoreRound: 2 players (sehati)', () => {
  it('pays both when they match', () => {
    const r = scoreRound([pick(1, 1), pick(2, 1)]);
    expect(r.mode).toBe('sehati');
    expect(r.winners).toEqual([1]);
    expect(kinds(r)).toEqual(['sehati', 'sehati']);
    expect(points(r)).toEqual([SCORING.sehati, SCORING.sehati]);
  });

  it('pays nobody when they differ or one times out', () => {
    expect(kinds(scoreRound([pick(1, 0), pick(2, 3)]))).toEqual(['apart', 'apart']);
    const late = scoreRound([pick(1, 0), pick(2, null)]);
    expect(kinds(late)).toEqual(['apart', 'missed']);
    expect(late.winners).toEqual([]);
    expect(kinds(scoreRound([pick(1, null), pick(2, null)]))).toEqual(['missed', 'missed']);
  });

  it('a lone participant cannot score', () => {
    const r = scoreRound([pick(1, 0)]);
    expect(r.mode).toBe('solo');
    expect(points(r)).toEqual([0]);
  });
});

describe('persen kompak', () => {
  it('rounds and clamps', () => {
    expect(percent(0, 0)).toBe(0);
    expect(percent(2, 3)).toBe(67);
    expect(percent(12, 12)).toBe(100);
    expect(percent(5, 3)).toBe(100);
  });

  it('gives a title for every percentage', () => {
    expect(coopTitle(100).title).toBe('Kembar Batin');
    expect(coopTitle(99).title).toBe('Sehati Banget');
    expect(coopTitle(75).title).toBe('Sehati Banget');
    expect(coopTitle(50).title).toBe('Lumayan Nyambung');
    expect(coopTitle(25).title).toBe('Masih Pemanasan');
    expect(coopTitle(0).title).toBe('Beda Frekuensi');
  });
});

describe('drawPrompts', () => {
  it('draws distinct prompts deterministically', () => {
    const a = drawPrompts(42, 12);
    const b = drawPrompts(42, 12);
    expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id));
    expect(new Set(a.map((q) => q.id)).size).toBe(12);
    expect(drawPrompts(43, 12).map((q) => q.id)).not.toEqual(a.map((q) => q.id));
  });

  it('never repeats a category back to back', () => {
    for (let seed = 0; seed < 40; seed++) {
      const list = drawPrompts(seed, 12);
      for (let i = 1; i < list.length; i++) expect(list[i]!.category).not.toBe(list[i - 1]!.category);
    }
  });

  it('prefers prompts not played recently, then falls back', () => {
    const recent = new Set(PROMPTS.slice(0, PROMPTS.length - 6).map((q) => q.id));
    const list = drawPrompts(7, 12, PROMPTS, recent);
    expect(list).toHaveLength(12);
    expect(new Set(list.map((q) => q.id)).size).toBe(12);
    expect(list.filter((q) => !recent.has(q.id))).toHaveLength(6);
    expect(list.slice(0, 6).every((q) => !recent.has(q.id))).toBe(true);
  });

  it('caps at the bank size', () => {
    const bank = PROMPTS.slice(0, 3);
    expect(drawPrompts(1, 10, bank)).toHaveLength(3);
  });
});

describe('prompt bank', () => {
  it('has at least 120 valid prompts', () => {
    expect(PROMPTS.length).toBeGreaterThanOrEqual(120);
    expect(new Set(PROMPTS.map((q) => q.id)).size).toBe(PROMPTS.length);
    expect(new Set(PROMPTS.map((q) => q.q)).size).toBe(PROMPTS.length);
  });

  for (const q of PROMPTS) {
    it(`${q.id} fits the limits`, () => {
      expect(q.q.length, q.q).toBeLessThanOrEqual(LIMITS.prompt);
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options.map((o) => o.toLowerCase())).size).toBe(4);
      for (const o of q.options) {
        expect(o.trim(), o).toBe(o);
        expect(o.length, o).toBeGreaterThan(0);
        expect(o.length, o).toBeLessThanOrEqual(LIMITS.option);
      }
    });
  }

  it('has no em dash and no "TV" anywhere in player text', () => {
    const text = [
      ...PROMPTS.flatMap((q) => [q.q, ...q.options, q.category]),
      ...Object.values(STR).flatMap((v) =>
        typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap((t) => [t.title, t.text]) : [],
      ),
      ...[true, false].flatMap((coop) => STR.howToSteps(coop).flatMap((s) => [s.t, s.d])),
    ];
    for (const t of text) {
      expect(t, t).not.toContain(EM_DASH);
      expect(t, t).not.toMatch(/\bTV\b/i);
    }
  });
});

/* ------------------------------------------------------------------ match flow */

const BANK: Prompt[] = PROMPTS.slice(0, 20);

function startMatch(ids: number[], rounds = 3) {
  const match = new KompakMatch({
    seed: 9,
    rounds,
    now: 0,
    players: ids.map((id) => ({ id, connected: true })),
    bank: BANK,
  });
  return match;
}

/** Tick until the match reaches `phase`, returning the time. */
function runTo(match: KompakMatch, phase: KompakMatch['phase'], from: number, step = 50): number {
  let t = from;
  for (let i = 0; i < 10_000 && match.phase !== phase; i++) {
    t += step;
    match.tick(t);
  }
  expect(match.phase).toBe(phase);
  return t;
}

describe('KompakMatch', () => {
  it('runs a 3-player round and scores the majority', () => {
    const m = startMatch([1, 2, 3]);
    let t = runTo(m, 'question', 0);
    expect(m.participants).toEqual([1, 2, 3]);
    expect(m.answer(1, 0, t, t)).toHaveLength(1);
    expect(m.answer(1, 1, t, t)).toHaveLength(0); // second answer ignored
    m.answer(2, 0, t + 100, t + 100);
    m.answer(3, 2, t + 200, t + 200);
    expect(m.allAnsweredAt).not.toBeNull();
    t = runTo(m, 'reveal', t + 200);
    expect(m.result?.winners).toEqual([0]);
    expect(m.record(1)?.score).toBe(100);
    expect(m.record(3)?.score).toBe(0);
    expect(m.record(3)?.alone).toBe(1);
    expect(m.record(1)?.hits).toBe(1);
    expect(m.record(1)?.played).toBe(1);
    expect(m.coop).toBe(false);
  });

  it('closes on the deadline when someone never answers', () => {
    const m = startMatch([1, 2, 3]);
    const t = runTo(m, 'question', 0);
    m.answer(1, 0, t, t);
    m.answer(2, 0, t, t);
    m.tick(t + TIMING.questionMs - 10);
    expect(m.phase).toBe('question');
    m.tick(t + TIMING.questionMs + TIMING.closeGraceMs + 1);
    expect(m.phase).toBe('reveal');
    expect(m.outcomeOf(3)?.kind).toBe('missed');
    expect(m.record(3)?.played).toBe(1);
    expect(m.record(3)?.answered).toBe(0);
  });

  it('rejects late and out-of-range answers', () => {
    const m = startMatch([1, 2, 3]);
    const t = runTo(m, 'question', 0);
    expect(m.answer(1, 4, t, t)).toHaveLength(0);
    expect(m.answer(1, -1, t, t)).toHaveLength(0);
    expect(m.answer(9, 0, t, t)).toHaveLength(0);
    const late = t + TIMING.questionMs + TIMING.lateToleranceMs + 50;
    expect(m.answer(1, 0, late, t + TIMING.questionMs + 100)).toHaveLength(0);
  });

  it('plays co-op with 2 players and tracks persen kompak', () => {
    const m = startMatch([1, 2], 3);
    expect(m.coop).toBe(true);
    let t = 0;
    const plays: [number, number][] = [
      [0, 0],
      [1, 2],
      [3, 3],
    ];
    for (const [a, b] of plays) {
      t = runTo(m, 'question', t);
      m.answer(1, a, t, t);
      m.answer(2, b, t, t);
      t = runTo(m, 'reveal', t);
    }
    expect(m.coopRounds).toBe(3);
    expect(m.coopHits).toBe(2);
    expect(m.coopPercent).toBe(67);
    expect(m.record(1)?.score).toBe(200);
    t = runTo(m, 'final', t);
    runTo(m, 'ended', t);
    const res = buildResult(m, (id) => `P${id}`);
    expect(res.title).toBe(`Kalian ${coopTitle(67).title}!`);
    expect(res.ranking.map((r) => r.rank)).toEqual([1, 1]);
    expect(res.awards?.every((a) => a.title === STR.awardHeart)).toBe(true);
  });

  it('freezes timers while held', () => {
    const m = startMatch([1, 2, 3]);
    const t = runTo(m, 'question', 0);
    m.setHeld(true, t + 1000);
    expect(m.tick(t + 60_000)).toEqual([]);
    m.setHeld(false, t + 60_000);
    m.tick(t + 60_000 + 100);
    expect(m.phase).toBe('question');
    expect(m.timeLeft(t + 60_000 + 100)).toBeCloseTo(TIMING.questionMs - 1100, -1);
  });

  it('lets mid-question joiners wait for the next prompt', () => {
    const m = startMatch([1, 2, 3]);
    const t = runTo(m, 'question', 0);
    m.syncPlayers(
      [1, 2, 3, 4].map((id) => ({ id, connected: true })),
      t,
    );
    expect(m.isParticipant(4)).toBe(false);
    expect(m.answer(4, 0, t, t)).toHaveLength(0);
    expect(viewFor(m, 4, t)?.kind).toBe('message');
    m.answer(1, 0, t, t);
    m.answer(2, 0, t, t);
    m.answer(3, 0, t, t);
    const t2 = runTo(m, 'reveal', t);
    expect(m.result?.unanimous).toBe(true);
    runTo(m, 'question', t2);
    expect(m.isParticipant(4)).toBe(true);
  });

  it('plays every prompt once and ends', () => {
    const m = startMatch([1, 2, 3], 4);
    const seen = new Set<string>();
    let t = 0;
    for (let i = 0; i < 4; i++) {
      t = runTo(m, 'question', t);
      seen.add(m.prompt.id);
      t = runTo(m, 'reveal', t, 500);
    }
    expect(seen.size).toBe(4);
    t = runTo(m, 'final', t);
    runTo(m, 'ended', t);
    const res = buildResult(m, (id) => `P${id}`);
    expect(res.title).toBe(STR.resultTitleNone); // nobody answered, nobody scored
    expect(res.ranking).toHaveLength(3);
  });
});

describe('views', () => {
  it('maps phone action ids to options', () => {
    expect(optionIndex('A')).toBe(0);
    expect(optionIndex(' d ')).toBe(3);
    expect(optionIndex('E')).toBe(-1);
    expect(optionIndex(undefined)).toBe(-1);
  });

  it('shows choice, then locked, then the round result', () => {
    const m = startMatch([1, 2, 3]);
    const t = runTo(m, 'question', 0);
    const choice = viewFor(m, 1, t);
    expect(choice?.kind).toBe('choice');
    if (choice?.kind === 'choice') {
      expect(choice.options.map((o) => o.label)).toEqual([...m.prompt.options]);
      expect(choice.deadline).toBe(t + TIMING.questionMs);
    }
    m.answer(1, 1, t, t);
    m.answer(2, 1, t, t);
    m.answer(3, 0, t, t);
    expect(viewFor(m, 1, t)?.kind).toBe('locked');
    runTo(m, 'reveal', t);
    const win = viewFor(m, 1, t);
    const lose = viewFor(m, 3, t);
    expect(win?.kind === 'result' && win.tone).toBe('good');
    expect(win?.kind === 'result' && win.big).toBe('+100');
    expect(lose?.kind === 'result' && lose.title).toBe(STR.resultAlone);
  });
});

describe('awards', () => {
  const rec = (id: number, over: Partial<PlayerRecord>): PlayerRecord => ({
    id,
    present: true,
    connected: true,
    joinedRound: 0,
    score: 0,
    prevScore: 0,
    hits: 0,
    played: 6,
    answered: 6,
    alone: 0,
    answerTimeMs: 18_000,
    ...over,
  });

  it('gives every player an award', () => {
    const stats = [
      rec(1, { hits: 5 }),
      rec(2, { hits: 3, alone: 3 }),
      rec(3, { hits: 2, answerTimeMs: 6000 }),
      rec(4, { hits: 1 }),
    ];
    const awards = computeAwards(stats, null);
    expect(new Set(awards.map((a) => a.playerId))).toEqual(new Set([1, 2, 3, 4]));
    expect(awards.find((a) => a.playerId === 1)?.title).toBe(STR.awardKompak);
    expect(awards.find((a) => a.playerId === 2)?.title).toBe(STR.awardUnik);
    expect(awards.find((a) => a.playerId === 3)?.title).toBe(STR.awardZap);
    expect(awards.find((a) => a.playerId === 4)?.title).toBe(STR.awardStar);
  });
});
