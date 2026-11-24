import type { PlayerInfo } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { KompakMatch, TIMING } from './logic';
import { applyMirror, type KompakMirror, type MirrorExtras, MirrorScene, toMirror } from './mirror';

function player(id: number): PlayerInfo {
  return {
    id,
    name: `Pemain ${id}`,
    fruit: 'semangka',
    look: { c: 'putri' },
    color: '#FF5C9A',
    connected: true,
    isHost: id === 1,
  };
}

function startMatch(ids: number[], rounds = 4): KompakMatch {
  return new KompakMatch({ seed: 9, rounds, now: 0, players: ids.map((id) => ({ id, connected: true })) });
}

function runTo(m: KompakMatch, phase: KompakMatch['phase'], from: number): number {
  let t = from;
  for (let i = 0; i < 10_000 && m.phase !== phase; i++) {
    t += 50;
    m.tick(t);
  }
  expect(m.phase).toBe(phase);
  return t;
}

const extras = (ids: number[]): MirrorExtras => ({ players: ids.map(player), waiting: false });

function wire(state: KompakMirror): KompakMirror {
  const parsed = applyMirror(JSON.parse(JSON.stringify(state)));
  if (!parsed) throw new Error('rejected');
  return parsed;
}

describe('kompak mirror', () => {
  it('round-trips a prompt with answers coming in, without the picks', () => {
    const ids = [1, 2, 3];
    const m = startMatch(ids);
    const t = runTo(m, 'question', 0);
    m.answer(2, 3, t, t);
    const state = toMirror(m, t + 1000, false, extras(ids));
    expect(state.res).toBeNull();
    const scene = new MirrorScene(wire(state));
    expect(scene.phase).toBe('question');
    expect(scene.prompt.q).toBe(m.prompt.q);
    expect(scene.prompt.options).toEqual(m.prompt.options);
    expect(scene.prompts).toHaveLength(m.total);
    expect(scene.participants).toEqual(m.participants);
    expect(scene.answers.has(2)).toBe(true);
    expect(scene.answers.has(1)).toBe(false);
    expect(scene.coop).toBe(false);
    expect(scene.timeLeft(t + 1000)).toBe(Math.round(m.timeLeft(t + 1000)));
    expect(scene.timeLeft(t + 6000)).toBe(Math.round(m.timeLeft(t + 6000)));
    expect(scene.info(3)?.name).toBe('Pemain 3');
  });

  it('round-trips the reveal, the co-op meter and the ranking', () => {
    const ids = [1, 2];
    const m = startMatch(ids);
    let t = runTo(m, 'question', 0);
    m.answer(1, 1, t, t);
    m.answer(2, 1, t + 10, t + 10);
    t = runTo(m, 'reveal', t);
    const scene = new MirrorScene(wire(toMirror(m, t, false, extras(ids))));
    expect(scene.coop).toBe(true);
    expect(scene.result).toEqual({
      mode: m.result?.mode,
      counts: m.result?.counts,
      winners: m.result?.winners,
      unanimous: m.result?.unanimous,
      outcomes: m.result?.outcomes.map((o) => ({
        playerId: o.playerId,
        option: o.option,
        kind: o.kind,
        points: o.points,
      })),
    });
    expect(scene.outcomeOf(2)?.kind).toBe('sehati');
    expect([scene.coopRounds, scene.coopHits, scene.coopPercent]).toEqual([
      m.coopRounds,
      m.coopHits,
      m.coopPercent,
    ]);
    expect(scene.roster.map((r) => [r.id, r.score, r.prevScore, r.hits, r.played])).toEqual(
      m.roster.map((r) => [r.id, r.score, r.prevScore, r.hits, r.played]),
    );
    expect(scene.ranking()).toEqual(m.ranking());
  });

  it('freezes the countdown while held or locally paused', () => {
    const ids = [1, 2, 3];
    const m = startMatch(ids);
    const t = runTo(m, 'question', 0);
    m.setHeld(true, t + 4000);
    const held = new MirrorScene(wire(toMirror(m, t + 5000, true, extras(ids))));
    expect(held.timeLeft(t + 90_000)).toBe(Math.round(m.timeLeft(t + 5000)));
    expect(held.timeLeft(t + 90_000)).toBeLessThanOrEqual(TIMING.questionMs - 4000);

    m.setHeld(false, t + 5000);
    const live = new MirrorScene(wire(toMirror(m, t + 5000, false, extras(ids))));
    const before = live.timeLeft(t + 6000);
    live.setLocalPause(true, t + 6000);
    expect(live.timeLeft(t + 9000)).toBe(before);
    live.setLocalPause(false, t + 9000);
    expect(live.timeLeft(t + 9000)).toBe(before - 3000);
  });

  it('rejects malformed states without throwing', () => {
    const ids = [1, 2, 3];
    const m = startMatch(ids);
    const good = JSON.parse(JSON.stringify(toMirror(m, 0, false, extras(ids)))) as Record<string, unknown>;
    expect(applyMirror(good)).not.toBeNull();
    const bad: unknown[] = [
      null,
      true,
      { ...good, v: 2 },
      { ...good, ph: 'party' },
      { ...good, r: -1 },
      { ...good, co: [1] },
      { ...good, q: { c: 'x', q: 'y', o: [] } },
      { ...good, res: { m: 'group', k: [1], w: [0], u: false, oc: [[1, 0, 'great', 100]] } },
      { ...good, ro: [[1, true, 0, 0, 0, -1, 0]] },
      { ...good, pl: [{ id: -3, name: 'A', color: '#000', look: { c: 'putri' } }] },
      { ...good, part: Array.from({ length: 99 }, (_, i) => i) },
    ];
    for (const b of bad) expect(applyMirror(b)).toBeNull();
  });

  it('stays small for a full room', () => {
    const ids = Array.from({ length: 16 }, (_, i) => i + 1);
    const m = startMatch(ids);
    let t = runTo(m, 'question', 0);
    for (const id of ids) m.answer(id, id % 4, t, t);
    t = runTo(m, 'reveal', t);
    expect(JSON.stringify(toMirror(m, t, false, extras(ids))).length).toBeLessThan(4096);
  });
});
