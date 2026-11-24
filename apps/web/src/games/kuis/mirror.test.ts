import type { PlayerInfo } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { KuisMatch, TIMING } from './logic';
import { applyMirror, type KuisMirror, type MirrorExtras, MirrorScene, toMirror } from './mirror';

const T0 = 1_000_000;
const Q_START = T0 + TIMING.startMs + TIMING.introMs;

function player(id: number): PlayerInfo {
  return {
    id,
    name: `Pemain ${id}`,
    fruit: 'semangka',
    look: { c: 'leo', s: 2 },
    color: '#2F8CFF',
    connected: true,
    isHost: id === 1,
  };
}

function setup(ids: number[] = [1, 2]): KuisMatch {
  return new KuisMatch({ seed: 7, rounds: 5, now: T0, players: ids.map((id) => ({ id, connected: true })) });
}

function extras(ids: number[] = [1, 2]): MirrorExtras {
  return { players: ids.map(player), waiting: false, recordBefore: null, record: null };
}

/** What the far screen receives: the state after a JSON trip over the network. */
function wire(state: KuisMirror): KuisMirror {
  const parsed = applyMirror(JSON.parse(JSON.stringify(state)));
  if (!parsed) throw new Error('rejected');
  return parsed;
}

/** Tick in 10 ms steps until the reveal; returns the time it opened. */
function untilReveal(m: KuisMatch, from: number): number {
  let t = from;
  while (m.phase !== 'reveal') {
    t += 10;
    m.tick(t);
  }
  return t;
}

function toQuestion(m: KuisMatch): void {
  m.tick(T0 + TIMING.startMs);
  m.tick(Q_START);
  expect(m.phase).toBe('question');
}

describe('kuis mirror', () => {
  it('round-trips a question with one answer locked in', () => {
    const m = setup();
    toQuestion(m);
    m.answer(1, 2, Q_START + 2000, Q_START + 2100);
    const now = Q_START + 3000;
    const scene = new MirrorScene(wire(toMirror(m, now, false, extras())));
    expect(scene.phase).toBe('question');
    expect(scene.round).toBe(0);
    expect(scene.total).toBe(5);
    expect(scene.questions).toHaveLength(5);
    expect(scene.question.q).toBe(m.question.q);
    expect(scene.question.options).toEqual(m.question.options);
    expect(scene.answers.has(1)).toBe(true);
    expect(scene.answers.has(2)).toBe(false);
    expect(scene.isParticipant(2)).toBe(true);
    expect(scene.timeLeft(now)).toBe(Math.round(m.timeLeft(now)));
    expect(scene.timeLeft(now + 4000)).toBe(Math.round(m.timeLeft(now + 4000)));
    expect(scene.info(2)?.name).toBe('Pemain 2');
  });

  it('keeps the answer and the fact hidden until the reveal', () => {
    const m = setup();
    toQuestion(m);
    const q = toMirror(m, Q_START + 10, false, extras()).q;
    expect(q.a).toBe(-1);
    expect(q.f).toBe('');
  });

  it('round-trips the reveal: outcomes, scores, ranking', () => {
    const m = setup();
    toQuestion(m);
    m.answer(1, m.question.answer, Q_START + 1000, Q_START + 1100);
    m.answer(2, (m.question.answer + 1) % 4, Q_START + 2000, Q_START + 2100);
    let t = Q_START + 2100;
    t = untilReveal(m, t);
    const scene = new MirrorScene(wire(toMirror(m, t, false, extras())));
    expect(scene.question.answer).toBe(m.question.answer);
    expect(scene.question.fact).toBe(m.question.fact);
    expect(scene.fastestCorrect).toBe(1);
    expect(scene.outcomes.map((o) => [o.playerId, o.score.correct, o.score.total])).toEqual(
      m.outcomes.map((o) => [o.playerId, o.score.correct, o.score.total]),
    );
    expect(scene.roster).toEqual(
      m.roster.map((r) => ({
        id: r.id,
        connected: r.connected,
        joinedRound: r.joinedRound,
        score: r.score,
        prevScore: r.prevScore,
        correct: r.correct,
        asked: r.asked,
      })),
    );
    expect(scene.ranking()).toEqual(m.ranking());
  });

  it('freezes the countdown while held or locally paused', () => {
    const m = setup();
    toQuestion(m);
    m.setHeld(true, Q_START + 5000);
    const held = new MirrorScene(wire(toMirror(m, Q_START + 6000, true, extras())));
    expect(held.timeLeft(Q_START + 60_000)).toBe(TIMING.questionMs - 5000);

    const running = new MirrorScene(wire(toMirror(setupAt(), Q_START + 1000, false, extras())));
    running.setLocalPause(true, Q_START + 2000);
    expect(running.timeLeft(Q_START + 9000)).toBe(TIMING.questionMs - 2000);
    running.setLocalPause(false, Q_START + 9000);
    expect(running.timeLeft(Q_START + 9000)).toBe(TIMING.questionMs - 9000);
  });

  it('rejects malformed states without throwing', () => {
    const m = setup();
    toQuestion(m);
    const good = JSON.parse(JSON.stringify(toMirror(m, Q_START, false, extras()))) as Record<string, unknown>;
    expect(applyMirror(good)).not.toBeNull();
    const bad: unknown[] = [
      null,
      42,
      'x',
      [],
      { ...good, v: 2 },
      { ...good, ph: 'dance' },
      { ...good, r: 99 },
      { ...good, end: 'soon' },
      { ...good, q: { ...(good.q as object), o: ['a'] } },
      { ...good, q: { ...(good.q as object), a: 9 } },
      { ...good, ro: [[1, true]] },
      { ...good, pl: [{ id: 1, name: 'x', color: '#fff', look: { c: 'nobody' } }] },
      { ...good, oc: Array.from({ length: 100 }, () => ({ p: 1, o: 0, t: 0, c: true, s: 1, d: false })) },
      { ...good, rec: { text: 5 } },
    ];
    for (const b of bad) expect(applyMirror(b)).toBeNull();
  });

  it('stays small for a full room', () => {
    const ids = Array.from({ length: 16 }, (_, i) => i + 1);
    const m = setup(ids);
    toQuestion(m);
    for (const id of ids) m.answer(id, id % 4, Q_START + 100 * id, Q_START + 100 * id + 50);
    let t = Q_START + 2000;
    t = untilReveal(m, t);
    const size = JSON.stringify(toMirror(m, t, false, extras(ids))).length;
    expect(size).toBeLessThan(4096);
  });
});

function setupAt(): KuisMatch {
  const m = setup();
  toQuestion(m);
  return m;
}
