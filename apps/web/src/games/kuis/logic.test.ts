import { afterEach, describe, expect, it, vi } from 'vitest';
import { submitRecord } from '../common/records';
import {
  buildResult,
  computeAwards,
  type KuisEvent,
  KuisMatch,
  measureAnswerTime,
  PauseClock,
  rankScores,
  recordKind,
  recordLine,
  SCORING,
  scoreAnswer,
  soloRecord,
  TIMING,
} from './logic';
import { prepareQuestions, QUESTIONS, seededRng, shuffleQuestion } from './questions';
import { formatNumber, formatSeconds } from './strings';
import { optionIndex, viewFor } from './views';

const T0 = 1_000_000;
const Q_START = T0 + TIMING.startMs + TIMING.introMs;

function setup(ids: number[] = [1, 2], rounds = 3): KuisMatch {
  return new KuisMatch({
    seed: 42,
    rounds,
    now: T0,
    players: ids.map((id) => ({ id, connected: true })),
  });
}

/** Tick in 10 ms steps until the phase changes; returns the server time it changed at. */
function nextPhase(m: KuisMatch, from: number, events: KuisEvent[] = []): number {
  const phase = m.phase;
  for (let t = from; t < from + 120_000; t += 10) {
    events.push(...m.tick(t));
    if (m.phase !== phase) return t;
  }
  throw new Error(`stuck in ${phase}`);
}

/** From a fresh match: tick into the first question; returns its server start time. */
function toFirstQuestion(m: KuisMatch): number {
  m.tick(T0 + TIMING.startMs);
  expect(m.phase).toBe('intro');
  m.tick(Q_START);
  expect(m.phase).toBe('question');
  return Q_START;
}

const wrongOf = (m: KuisMatch) => (m.question.answer + 1) % 4;

/* ------------------------------------------------------------------ questions */

describe('question bank', () => {
  it('has at least 60 well-formed questions', () => {
    expect(QUESTIONS.length).toBeGreaterThanOrEqual(60);
    const ids = new Set<string>();
    for (const q of QUESTIONS) {
      expect(ids.has(q.id), q.id).toBe(false);
      ids.add(q.id);
      expect(q.q.length, q.id).toBeLessThanOrEqual(120);
      expect(q.q.trim().length, q.id).toBeGreaterThan(10);
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options.map((o) => o.toLowerCase())).size, q.id).toBe(4);
      for (const o of q.options) {
        expect(o.length, `${q.id}: ${o}`).toBeLessThanOrEqual(22);
        expect(o.trim().length).toBeGreaterThan(0);
      }
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(4);
      expect(q.fact.length, q.id).toBeGreaterThan(10);
      expect(q.fact.length, q.id).toBeLessThanOrEqual(110);
      expect(['Budaya', 'Kuliner', 'Geografi', 'Alam', 'Sejarah', 'Bahasa']).toContain(q.category);
    }
  });

  it('covers every category', () => {
    const cats = new Set(QUESTIONS.map((q) => q.category));
    expect(cats.size).toBe(6);
  });
});

describe('prepareQuestions', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = prepareQuestions(7, 10);
    const b = prepareQuestions(7, 10);
    const c = prepareQuestions(8, 10);
    expect(a).toEqual(b);
    expect(a.map((q) => q.id)).not.toEqual(c.map((q) => q.id));
  });

  it('picks distinct questions and keeps the correct option attached', () => {
    const picked = prepareQuestions(123, 10);
    expect(picked).toHaveLength(10);
    expect(new Set(picked.map((q) => q.id)).size).toBe(10);
    for (const p of picked) {
      const src = QUESTIONS.find((q) => q.id === p.id)!;
      expect(p.options[p.answer]).toBe(src.options[src.answer]);
      expect([...p.options].sort()).toEqual([...src.options].sort());
    }
  });

  it('clamps to the bank size', () => {
    expect(prepareQuestions(1, 10_000)).toHaveLength(QUESTIONS.length);
    expect(prepareQuestions(1, 0)).toHaveLength(0);
  });

  it('varies the answer letter and avoids three of the same letter in a row', () => {
    const letters = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const qs = prepareQuestions(seed, 10);
      for (let i = 0; i < qs.length; i++) {
        letters.add(qs[i]!.answer);
        if (i >= 2) {
          const same = qs[i]!.answer === qs[i - 1]!.answer && qs[i]!.answer === qs[i - 2]!.answer;
          expect(same).toBe(false);
        }
      }
    }
    expect(letters.size).toBe(4);
  });

  it('avoids the same category back to back', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const qs = prepareQuestions(seed, 10);
      for (let i = 1; i < qs.length; i++) expect(qs[i]!.category).not.toBe(qs[i - 1]!.category);
    }
  });

  it('shuffleQuestion re-points the answer index', () => {
    const src = QUESTIONS[0]!;
    const rnd = seededRng(99);
    for (let i = 0; i < 20; i++) {
      const p = shuffleQuestion(src, rnd);
      expect(p.options[p.answer]).toBe(src.options[src.answer]);
    }
  });
});

/* ------------------------------------------------------------------ scoring */

describe('scoreAnswer', () => {
  it('awards base plus linear speed bonus', () => {
    expect(scoreAnswer(true, 0, 0).total).toBe(1000);
    expect(scoreAnswer(true, 7500, 0).total).toBe(750);
    expect(scoreAnswer(true, 15_000, 0).total).toBe(500);
    expect(scoreAnswer(true, 99_000, 0).total).toBe(500);
    expect(scoreAnswer(true, 1, 0).speed).toBe(500);
    expect(scoreAnswer(true, 3000, 0).speed).toBe(400);
  });

  it('matches the design example: +850 = 500 + 250 + 100', () => {
    const s = scoreAnswer(true, 7500, 1);
    expect(s).toMatchObject({
      base: 500,
      speed: 250,
      streakBonus: 100,
      doubled: false,
      total: 850,
      streakAfter: 2,
    });
  });

  it('caps the streak bonus at +300 and doubles once the streak was 3+', () => {
    expect(scoreAnswer(true, 15_000, 2)).toMatchObject({ streakBonus: 200, doubled: false, total: 700 });
    expect(scoreAnswer(true, 15_000, 3)).toMatchObject({ streakBonus: 300, doubled: true, total: 1600 });
    expect(scoreAnswer(true, 0, 3).total).toBe((500 + 500 + 300) * 2);
    expect(scoreAnswer(true, 0, 12)).toMatchObject({
      streakBonus: SCORING.streakCap,
      doubled: true,
      streakAfter: 13,
    });
  });

  it('scores nothing and resets the streak on wrong or missing answers', () => {
    expect(scoreAnswer(false, 1000, 5)).toMatchObject({ total: 0, streakAfter: 0, correct: false });
    expect(scoreAnswer(true, null, 5)).toMatchObject({ total: 0, streakAfter: 0 });
  });
});

describe('measureAnswerTime', () => {
  it('clamps into the window and rejects stamps outside the tolerance', () => {
    expect(measureAnswerTime(3200)).toBe(3200);
    expect(measureAnswerTime(-150)).toBe(0);
    expect(measureAnswerTime(-200)).toBe(0);
    expect(measureAnswerTime(-201)).toBeNull();
    expect(measureAnswerTime(15_300)).toBe(15_000);
    expect(measureAnswerTime(15_301)).toBeNull();
    expect(measureAnswerTime(Number.NaN)).toBeNull();
  });
});

describe('PauseClock', () => {
  it('skips paused intervals and maps back to server time', () => {
    const c = new PauseClock(1000);
    expect(c.game(1500)).toBe(500);
    c.pause(2000);
    expect(c.paused).toBe(true);
    expect(c.game(2500)).toBe(1000);
    expect(c.game(9000)).toBe(1000);
    c.resume(5000);
    expect(c.paused).toBe(false);
    expect(c.game(5000)).toBe(1000);
    expect(c.game(6000)).toBe(2000);
    // A stamp from before the pause still maps to its true game time.
    expect(c.game(1800)).toBe(800);
    expect(c.server(3000, 6000)).toBe(7000);
  });
});

describe('rankScores', () => {
  it('shares ranks on ties', () => {
    const r = rankScores([
      { playerId: 1, score: 500 },
      { playerId: 2, score: 900 },
      { playerId: 3, score: 500 },
      { playerId: 4, score: 100 },
    ]);
    expect(r.map((x) => [x.playerId, x.rank])).toEqual([
      [2, 1],
      [1, 2],
      [3, 2],
      [4, 4],
    ]);
  });
});

/* ------------------------------------------------------------------ match flow */

describe('KuisMatch phases', () => {
  it('runs start → intro → question → reveal → … → final → ended on schedule', () => {
    const m = setup([1], 2);
    expect(m.phase).toBe('start');
    expect(m.tick(T0 + TIMING.startMs - 10)).toEqual([]);
    const events: KuisEvent[] = [];
    expect(nextPhase(m, T0, events)).toBe(T0 + TIMING.startMs);
    expect(m.phase).toBe('intro');
    expect(nextPhase(m, T0 + TIMING.startMs, events)).toBe(Q_START);
    expect(m.phase).toBe('question');
    // Nobody answers: reveal after deadline + close grace.
    const revealAt = nextPhase(m, Q_START, events);
    expect(revealAt).toBe(Q_START + TIMING.questionMs + TIMING.closeGraceMs);
    expect(m.phase).toBe('reveal');
    expect(nextPhase(m, revealAt, events)).toBe(revealAt + TIMING.revealMs);
    expect(m.phase).toBe('intro');
    expect(m.round).toBe(1);
    const q2 = nextPhase(m, revealAt + TIMING.revealMs, events);
    const r2 = nextPhase(m, q2, events);
    expect(m.phase).toBe('reveal');
    const finalAt = nextPhase(m, r2, events);
    expect(m.phase).toBe('final');
    expect(finalAt).toBe(r2 + TIMING.revealMs);
    expect(nextPhase(m, finalAt, events)).toBe(finalAt + TIMING.finalMs);
    expect(m.phase).toBe('ended');
    expect(m.tick(finalAt + 99_999)).toEqual([]);
    const phases = events.filter((e) => e.type === 'phase').map((e) => (e.type === 'phase' ? e.phase : ''));
    expect(phases).toEqual(['intro', 'question', 'reveal', 'intro', 'question', 'reveal', 'final', 'ended']);
  });

  it('emits tension countdown cues 5..1 once each', () => {
    const m = setup([1]);
    toFirstQuestion(m);
    const events: KuisEvent[] = [];
    for (let t = Q_START; t <= Q_START + TIMING.questionMs + 200; t += 50) events.push(...m.tick(t));
    const cues = events.filter((e) => e.type === 'cue').map((e) => (e.type === 'cue' ? e.secondsLeft : 0));
    expect(cues).toEqual([5, 4, 3, 2, 1]);
  });

  it('ends the question early once every connected player answered', () => {
    const m = setup([1, 2]);
    const start = toFirstQuestion(m);
    expect(m.answer(1, m.question.answer, start + 2000, start + 2100)).toEqual([
      { type: 'locked', playerId: 1 },
    ]);
    expect(m.allAnsweredAt).toBeNull();
    m.answer(2, wrongOf(m), start + 4000, start + 4200);
    expect(m.allAnsweredAt).toBe(4200 + TIMING.startMs + TIMING.introMs);
    const revealAt = nextPhase(m, start + 4200);
    expect(revealAt).toBe(start + 4200 + TIMING.allAnsweredMs);
  });

  it('never waits for disconnected players', () => {
    const m = setup([1, 2]);
    const start = toFirstQuestion(m);
    m.syncPlayers(
      [
        { id: 1, connected: true },
        { id: 2, connected: false },
      ],
      start + 500,
    );
    m.answer(1, m.question.answer, start + 1000, start + 1100);
    expect(m.waitingFor()).toEqual([]);
    expect(nextPhase(m, start + 1100)).toBe(start + 1100 + TIMING.allAnsweredMs);
    // The absent player still took part (and missed).
    expect(m.outcomes.map((o) => o.playerId)).toEqual([1, 2]);
    expect(m.record(2)!.streak).toBe(0);
  });

  it('a disconnect can complete the round', () => {
    const m = setup([1, 2]);
    const start = toFirstQuestion(m);
    m.answer(1, m.question.answer, start + 1000, start + 1000);
    expect(m.allAnsweredAt).toBeNull();
    m.syncPlayers(
      [
        { id: 1, connected: true },
        { id: 2, connected: false },
      ],
      start + 3000,
    );
    expect(nextPhase(m, start + 3000)).toBe(start + 3000 + TIMING.allAnsweredMs);
  });

  it('measures answer time from the phone stamp and scores it', () => {
    const m = setup([1, 2]);
    const start = toFirstQuestion(m);
    // Pressed at 3.0 s, arrived 250 ms later.
    m.answer(1, m.question.answer, start + 3000, start + 3250);
    m.answer(2, wrongOf(m), start + 1000, start + 1300);
    expect(m.answers.get(1)!.timeMs).toBe(3000);
    const events: KuisEvent[] = [];
    nextPhase(m, start + 3250, events);
    const reveal = events.find((e) => e.type === 'reveal');
    expect(reveal).toBeDefined();
    if (reveal?.type !== 'reveal') return;
    expect(reveal.fastestCorrect).toBe(1);
    expect(m.record(1)!.score).toBe(500 + 400);
    expect(m.record(2)!.score).toBe(0);
    expect(m.record(1)!.correct).toBe(1);
    expect(m.record(2)!.answered).toBe(1);
    expect(m.ranking().map((r) => r.playerId)).toEqual([1, 2]);
  });

  it('accepts only the first answer, valid options, and stamps inside the window', () => {
    const m = setup([1, 2, 3]);
    const start = toFirstQuestion(m);
    expect(m.answer(1, 9, start + 1000, start + 1000)).toEqual([]);
    expect(m.answer(1, -1, start + 1000, start + 1000)).toEqual([]);
    expect(m.answer(1, 0, start - 201, start + 10)).toEqual([]);
    expect(m.answer(1, 0, start + TIMING.questionMs + 301, start + TIMING.questionMs + 400)).toEqual([]);
    expect(m.answer(99, 0, start + 1000, start + 1000)).toEqual([]);
    expect(m.answer(1, 0, start - 150, start + 10)).toHaveLength(1);
    expect(m.answers.get(1)).toEqual({ option: 0, timeMs: 0 });
    expect(m.answer(1, 1, start + 2000, start + 2000)).toEqual([]);
    expect(m.answers.get(1)!.option).toBe(0);
    // Late press inside tolerance lands, clamped to the limit.
    expect(m.answer(2, 0, start + TIMING.questionMs + 250, start + TIMING.questionMs + 400)).toHaveLength(1);
    expect(m.answers.get(2)!.timeMs).toBe(TIMING.questionMs);
  });

  it('ignores answers outside the question phase', () => {
    const m = setup([1]);
    expect(m.answer(1, 0, T0 + 100, T0 + 100)).toEqual([]);
    m.tick(T0 + TIMING.startMs);
    expect(m.phase).toBe('intro');
    expect(m.answer(1, 0, T0 + TIMING.startMs + 100, T0 + TIMING.startMs + 100)).toEqual([]);
  });

  it('freezes the clock while held and keeps answer timing fair across the pause', () => {
    const m = setup([1, 2]);
    const start = toFirstQuestion(m);
    const deadlineBefore = m.deadlineServer(start);
    m.tick(start + 2000);
    m.setHeld(true, start + 2000);
    expect(m.held).toBe(true);
    // Time passes while held: nothing advances, answers are ignored.
    expect(m.tick(start + 60_000)).toEqual([]);
    expect(m.phase).toBe('question');
    expect(m.timeLeft(start + 60_000)).toBe(TIMING.questionMs - 2000);
    expect(m.answer(1, m.question.answer, start + 5000, start + 5000)).toEqual([]);
    m.setHeld(false, start + 12_000);
    expect(m.deadlineServer(start + 12_000)).toBe(deadlineBefore + 10_000);
    // Pressed 1 s after resume: 2 s before the pause + 1 s after = 3 s of answer time.
    m.answer(1, m.question.answer, start + 13_000, start + 13_100);
    expect(m.answers.get(1)!.timeMs).toBe(3000);
    // Without answers from player 2, the question still closes at the shifted deadline + grace.
    const revealAt = nextPhase(m, start + 13_100);
    expect(revealAt).toBe(deadlineBefore + 10_000 + TIMING.closeGraceMs);
  });

  it('lets a mid-question joiner play from the next question with 0 points', () => {
    const m = setup([1]);
    const start = toFirstQuestion(m);
    m.syncPlayers(
      [
        { id: 1, connected: true },
        { id: 7, connected: true },
      ],
      start + 1000,
    );
    expect(m.isParticipant(7)).toBe(false);
    expect(m.answer(7, 0, start + 1500, start + 1500)).toEqual([]);
    // Player 7 does not block the early end.
    m.answer(1, m.question.answer, start + 2000, start + 2000);
    expect(m.waitingFor()).toEqual([]);
    const revealAt = nextPhase(m, start + 2000);
    expect(m.outcomes.map((o) => o.playerId)).toEqual([1]);
    expect(m.record(7)!.score).toBe(0);
    expect(m.record(7)!.asked).toBe(0);
    const introAt = nextPhase(m, revealAt);
    nextPhase(m, introAt);
    expect(m.phase).toBe('question');
    expect(m.isParticipant(7)).toBe(true);
  });

  it('players joining during the intro play the coming question', () => {
    const m = setup([1]);
    m.tick(T0 + TIMING.startMs);
    m.syncPlayers(
      [
        { id: 1, connected: true },
        { id: 5, connected: true },
      ],
      T0 + TIMING.startMs + 100,
    );
    m.tick(Q_START);
    expect(m.isParticipant(5)).toBe(true);
  });

  it('a reconnecting participant can still answer the running question', () => {
    const m = setup([1, 2]);
    const start = toFirstQuestion(m);
    m.syncPlayers(
      [
        { id: 1, connected: true },
        { id: 2, connected: false },
      ],
      start + 100,
    );
    m.answer(1, 0, start + 500, start + 500);
    expect(m.allAnsweredAt).not.toBeNull();
    m.syncPlayers(
      [
        { id: 1, connected: true },
        { id: 2, connected: true },
      ],
      start + 600,
    );
    expect(m.allAnsweredAt).toBeNull();
    expect(m.answer(2, 1, start + 900, start + 900)).toHaveLength(1);
  });

  it('builds streaks, doubles after three, and resets on a miss', () => {
    const m = setup([1], 6);
    let now = toFirstQuestion(m);
    const totals: number[] = [];
    for (let i = 0; i < 5; i++) {
      const before = m.record(1)!.score;
      const opt = i === 4 ? wrongOf(m) : m.question.answer;
      m.answer(1, opt, now + TIMING.questionMs, now + TIMING.questionMs);
      const revealAt = nextPhase(m, now + TIMING.questionMs);
      totals.push(m.record(1)!.score - before);
      const introAt = nextPhase(m, revealAt);
      now = nextPhase(m, introAt);
    }
    // At the limit: 500 + 0 speed + streak bonus; the 4th question (streak 3 before) is doubled.
    expect(totals).toEqual([500, 600, 700, 1600, 0]);
    expect(m.record(1)!.bestStreak).toBe(4);
    expect(m.record(1)!.streak).toBe(0);
  });

  it('removes kicked players from the roster and ranking', () => {
    const m = setup([1, 2]);
    m.syncPlayers([{ id: 1, connected: true }], T0 + 10);
    expect(m.roster.map((r) => r.id)).toEqual([1]);
    expect(m.ranking().map((r) => r.playerId)).toEqual([1]);
  });
});

/* ------------------------------------------------------------------ awards and result */

describe('computeAwards', () => {
  const base = { asked: 10, answered: 10, correctTimeMs: 0, bestStreak: 0, correct: 0 };

  it('gives every player an award when possible', () => {
    const awards = computeAwards([
      { ...base, id: 1, correct: 8, correctTimeMs: 8 * 4000, bestStreak: 5 },
      { ...base, id: 2, correct: 6, correctTimeMs: 6 * 2500, bestStreak: 3 },
      { ...base, id: 3, correct: 5, correctTimeMs: 5 * 6000, bestStreak: 2 },
      { ...base, id: 4, correct: 2, answered: 7, correctTimeMs: 2 * 5000, bestStreak: 1 },
    ]);
    const byPlayer = (id: number) => awards.filter((a) => a.playerId === id).map((a) => a.title);
    expect(byPlayer(1)).toEqual(['Otak Encer', 'Beruntun Terpanjang']);
    expect(byPlayer(2)).toEqual(['Jari Kilat']);
    expect(byPlayer(3)).toEqual(['Pantang Menyerah']);
    expect(byPlayer(4)).toEqual(['Peserta Hebat']);
    expect(awards.find((a) => a.title === 'Jari Kilat')!.icon).toBe('zap');
    expect(awards.find((a) => a.title === 'Jari Kilat')!.desc).toContain('2,5');
  });

  it('breaks merit ties toward players without an award, then by ranking order', () => {
    const awards = computeAwards([
      { ...base, id: 1, correct: 5, correctTimeMs: 5 * 3000, bestStreak: 3 },
      { ...base, id: 2, correct: 5, correctTimeMs: 5 * 3000, bestStreak: 3 },
      { ...base, id: 3, correct: 5, correctTimeMs: 5 * 3000, bestStreak: 3 },
    ]);
    expect(awards.map((a) => [a.playerId, a.icon])).toEqual([
      [1, 'brain'],
      [2, 'zap'],
      [3, 'fire'],
    ]);
  });

  it('skips merit awards nobody earned', () => {
    const awards = computeAwards([
      { ...base, id: 1, answered: 3 },
      { ...base, id: 2 },
    ]);
    expect(awards.map((a) => [a.playerId, a.icon])).toEqual([
      [1, 'star'],
      [2, 'heart'],
    ]);
  });
});

describe('buildResult', () => {
  function play(m: KuisMatch, picks: Record<number, 'right' | 'wrong' | null>[], timeMs = 3000) {
    let now = toFirstQuestion(m);
    for (const round of picks) {
      for (const [id, pick] of Object.entries(round)) {
        if (pick === null) continue;
        const opt = pick === 'right' ? m.question.answer : wrongOf(m);
        m.answer(Number(id), opt, now + timeMs, now + timeMs);
      }
      const revealAt = nextPhase(m, now + timeMs);
      now = nextPhase(m, revealAt);
      if (m.phase === 'intro') now = nextPhase(m, now);
    }
    return now;
  }

  it('names the winner with score and accuracy, ranks everyone', () => {
    const m = setup([1, 2], 2);
    play(m, [
      { 1: 'right', 2: 'wrong' },
      { 1: 'right', 2: 'right' },
    ]);
    expect(m.phase).toBe('final');
    const names: Record<number, string> = { 1: 'Rina', 2: 'Budi' };
    const r = buildResult(m, (id) => names[id] ?? '?');
    expect(r.title).toBe('Rina juara kuis!');
    // 900 + (900 + 100 streak) = 1900
    expect(r.subtitle).toBe('Skor 1.900 · 2 dari 2 benar');
    expect(r.ranking).toEqual([
      { playerId: 1, score: 1900, rank: 1, label: '2/2 benar' },
      { playerId: 2, score: 900, rank: 2, label: '1/2 benar' },
    ]);
    const players = new Set(r.awards!.map((a) => a.playerId));
    expect(players).toEqual(new Set([1, 2]));
  });

  it('announces shared wins', () => {
    const m = setup([1, 2], 1);
    play(m, [{ 1: 'right', 2: 'right' }]);
    const r = buildResult(m, (id) => (id === 1 ? 'Rina' : 'Budi'));
    expect(r.title).toBe('Rina dan Budi juara bersama!');
    expect(r.ranking.map((x) => x.rank)).toEqual([1, 1]);
  });
});

/* ------------------------------------------------------------------ phone views */

describe('viewFor', () => {
  it('shows a message during start and intro', () => {
    const m = setup([1]);
    expect(viewFor(m, 1, T0)).toMatchObject({ kind: 'message', avatarOf: 1 });
    m.tick(T0 + TIMING.startMs);
    expect(viewFor(m, 1, T0 + TIMING.startMs)).toMatchObject({
      kind: 'message',
      eyebrow: 'Soal 1 dari 3',
      title: m.question.category,
    });
    expect(viewFor(m, 99, T0)).toBeNull();
  });

  it('builds the choice view with colors, deadline and progress', () => {
    const m = setup([1, 2]);
    const start = toFirstQuestion(m);
    const v = viewFor(m, 1, start + 100);
    expect(v).toMatchObject({
      kind: 'choice',
      title: 'Soal 1 dari 3',
      prompt: m.question.q,
      progress: { done: 0, total: 3 },
      deadline: start + TIMING.questionMs,
      streak: 0,
    });
    if (v?.kind !== 'choice') return;
    expect(v.options.map((o) => o.id)).toEqual(['A', 'B', 'C', 'D']);
    expect(v.options[0]).toMatchObject({ color: '#FF8A3D', dark: '#C9601E', label: m.question.options[0] });
    expect(v.options[3]).toMatchObject({ color: '#2DD4BF', dark: '#15A08F' });
  });

  it('builds the locked view with time chip, fastest chip and who is still thinking', () => {
    const m = setup([1, 2, 3]);
    const start = toFirstQuestion(m);
    m.answer(1, 2, start + 3200, start + 3300);
    const v = viewFor(m, 1, start + 3300);
    expect(v).toEqual({
      kind: 'locked',
      label: m.question.options[2],
      key: 'C',
      color: '#FFC928',
      dark: '#C99A12',
      title: 'Terkunci!',
      chips: ['3,2 detik', 'Tercepat sejauh ini'],
      waitingFor: [2, 3],
    });
    m.answer(2, 0, start + 2000, start + 3400);
    const v1 = viewFor(m, 1, start + 3400);
    expect(v1?.kind === 'locked' && v1.chips).toEqual(['3,2 detik']);
    expect(v1?.kind === 'locked' && v1.waitingFor).toEqual([3]);
  });

  it('builds good and bad result views with breakdown, rank and streak meter', () => {
    const m = setup([1, 2]);
    const start = toFirstQuestion(m);
    m.answer(1, m.question.answer, start + 7500, start + 7500);
    m.answer(2, wrongOf(m), start + 1000, start + 7600);
    nextPhase(m, start + 7600);
    expect(viewFor(m, 1, start + 9000)).toEqual({
      kind: 'result',
      tone: 'good',
      title: 'Benar!',
      big: '+750',
      chips: ['Benar +500', 'Kecepatan +250'],
      stats: [
        { label: 'Peringkat', value: '1 dari 2' },
        { label: 'Beruntun', value: '1 benar' },
      ],
      streak: { done: 1, total: 3, label: '2 benar lagi untuk poin dobel!' },
    });
    const bad = viewFor(m, 2, start + 9000);
    expect(bad).toMatchObject({
      kind: 'result',
      tone: 'bad',
      title: 'Belum tepat',
      big: '+0',
      streak: { done: 0, total: 3 },
    });
    if (bad?.kind !== 'result') return;
    expect(bad.subtitle).toContain(m.question.options[m.question.answer]!);
  });

  it('marks missed questions and shows spectators a waiting message', () => {
    const m = setup([1]);
    const start = toFirstQuestion(m);
    m.syncPlayers(
      [
        { id: 1, connected: true },
        { id: 2, connected: true },
      ],
      start + 100,
    );
    expect(viewFor(m, 2, start + 100)).toMatchObject({ kind: 'message', title: 'Kamu ikut soal berikutnya' });
    nextPhase(m, start + 100);
    expect(viewFor(m, 1, start + 20_000)).toMatchObject({
      kind: 'result',
      tone: 'bad',
      title: 'Waktu habis!',
    });
    expect(viewFor(m, 2, start + 20_000)).toMatchObject({ kind: 'message', title: 'Bersiap!' });
  });

  it('shows win/lose with rank, total and awards at the end', () => {
    const m = setup([1, 2], 1);
    const start = toFirstQuestion(m);
    m.answer(1, m.question.answer, start + 1500, start + 1500);
    m.answer(2, wrongOf(m), start + 1500, start + 1500);
    const revealAt = nextPhase(m, start + 1500);
    nextPhase(m, revealAt);
    expect(m.phase).toBe('final');
    const win = viewFor(m, 1, revealAt + TIMING.revealMs);
    expect(win).toMatchObject({ kind: 'result', tone: 'win', title: 'Juara kuis!', big: '950' });
    if (win?.kind !== 'result') return;
    expect(win.chips).toContain('Otak Encer');
    expect(win.stats?.[1]).toEqual({ label: 'Jawaban benar', value: '1 dari 1' });
    expect(viewFor(m, 2, revealAt + TIMING.revealMs)).toMatchObject({
      tone: 'lose',
      title: 'Peringkat 2',
      big: '0',
    });
  });

  it('keeps the choice deadline stable while running (so views are not resent every tick)', () => {
    const m = setup([1]);
    const start = toFirstQuestion(m);
    expect(viewFor(m, 1, start + 10)).toEqual(viewFor(m, 1, start + 4321));
  });
});

describe('helpers', () => {
  it('formats numbers and seconds the Indonesian way', () => {
    expect(formatNumber(6850)).toBe('6.850');
    expect(formatNumber(1234567)).toBe('1.234.567');
    expect(formatNumber(0)).toBe('0');
    expect(formatSeconds(3240)).toBe('3,2');
    expect(formatSeconds(15_000)).toBe('15,0');
  });

  it('maps phone action ids to option indexes', () => {
    expect(optionIndex('A')).toBe(0);
    expect(optionIndex('d')).toBe(3);
    expect(optionIndex('E')).toBe(-1);
    expect(optionIndex(undefined)).toBe(-1);
  });
});

/* ------------------------------------------------------------------ solo score attack */

describe('solo score attack', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Plays a whole one-player match, answering right on the listed questions. */
  function playSolo(m: KuisMatch, right: boolean[]): number {
    let now = toFirstQuestion(m);
    for (const ok of right) {
      m.answer(1, ok ? m.question.answer : wrongOf(m), now + 2000, now + 2000);
      const revealAt = nextPhase(m, now + 2000);
      now = nextPhase(m, revealAt);
      if (m.phase === 'intro') now = nextPhase(m, now);
    }
    return now;
  }

  it('plays a one-player match from start to the end', () => {
    const m = setup([1], 3);
    expect(m.solo).toBe(true);
    const finalAt = playSolo(m, [true, false, true]);
    expect(m.phase).toBe('final');
    nextPhase(m, finalAt);
    expect(m.phase).toBe('ended');
    expect(m.record(1)!.correct).toBe(2);
    expect(setup([1, 2]).solo).toBe(false);
  });

  it('builds a score headline with the record line instead of a champion', () => {
    const m = setup([1], 2);
    playSolo(m, [true, true]);
    const score = m.record(1)!.score;
    const rec = soloRecord(submitRecord('kuis-test', '2', score), score);
    // Node has no localStorage: the helper always reports a first record.
    expect(rec).toEqual({ text: `Rekor pertama tercatat: ${formatNumber(score)}`, isNew: false });
    const r = buildResult(m, () => 'Rina', rec);
    expect(r.title).toBe(`Skor ${formatNumber(score)}!`);
    expect(r.subtitle).toBe(rec.text);
    expect(r.ranking).toEqual([{ playerId: 1, score, rank: 1, label: '2/2 benar' }]);
    expect(r.title).not.toMatch(/juara/i);
    // Without a record (multiplayer path) nothing changes.
    expect(buildResult(m, () => 'Rina').title).toBe('Rina juara kuis!');
  });

  it('shows the record on the phone at the end, without a rank', () => {
    const m = setup([1], 1);
    playSolo(m, [true]);
    const v = viewFor(m, 1, T0 + 60_000, { text: 'Rekor baru! 950 (sebelumnya 800)', isNew: true });
    expect(v).toMatchObject({
      kind: 'result',
      tone: 'win',
      title: 'Kuis selesai!',
      big: formatNumber(m.record(1)!.score),
    });
    if (v?.kind !== 'result') return;
    expect(v.subtitle).toBe('Rekor baru! 950 (sebelumnya 800)');
    expect(v.stats?.map((x) => x.label)).not.toContain('Peringkat');
  });

  it('describes first, new, equal and short records', () => {
    expect(recordKind({ best: 900, previous: null, isNew: false }, 900)).toBe('first');
    expect(recordLine({ best: 1250, previous: 980, isNew: true }, 1250)).toBe(
      'Rekor baru! 1.250 (sebelumnya 980)',
    );
    expect(recordLine({ best: 1250, previous: 1250, isNew: false }, 1250)).toBe('Menyamai rekor: 1.250');
    expect(recordLine({ best: 6850, previous: 6850, isNew: false }, 5200)).toBe(
      'Rekor: 6.850, kurang 1.650 lagi',
    );
    for (const t of [recordLine({ best: 1, previous: null, isNew: false }, 1)]) {
      expect(t).not.toContain(String.fromCharCode(0x2014));
    }
  });

  it('keeps a record per mode across matches on the same main screen', () => {
    const mem = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => mem.set(k, v),
    });
    expect(soloRecord(submitRecord('kuis', '5', 3000), 3000).text).toBe('Rekor pertama tercatat: 3.000');
    expect(soloRecord(submitRecord('kuis', '5', 2500), 2500).text).toBe('Rekor: 3.000, kurang 500 lagi');
    expect(soloRecord(submitRecord('kuis', '5', 4100), 4100)).toEqual({
      text: 'Rekor baru! 4.100 (sebelumnya 3.000)',
      isNew: true,
    });
    expect(submitRecord('kuis', '10', 100).previous).toBeNull();
  });
});
