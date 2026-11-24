import type { PlayerInfo } from '@hoorah/protocol';
import { lookOfFruit } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { seeded } from '../../shared/art/svg';
import { type BeatGrid, fieldSkills, HopBrain } from './brain';
import { BEAT_MS, KarungMatch } from './logic';

const OFFSET = 1_000_000;
const NAMES = ['Rina', 'Bang Jali', 'Mpok Minah', 'Pak Darto'];

function player(id: number, i: number): PlayerInfo {
  return {
    id,
    name: NAMES[i] ?? `P${i}`,
    fruit: 'semangka',
    look: lookOfFruit('semangka'),
    color: '#F2453D',
    connected: true,
    isHost: i === 0,
  };
}

/** Every tap a brain makes over `beats` beats of a grid starting at 0, polled every 16 ms. */
function tapsOver(brain: HopBrain, beats: number): { taps: number[]; grid: BeatGrid } {
  const grid: BeatGrid = { anchor: 0, beatMs: BEAT_MS, startAt: 0 };
  brain.startRace(grid);
  const out: number[] = [];
  for (let now = -BEAT_MS; now <= beats * BEAT_MS; now += 16) out.push(...brain.update(now));
  return { taps: out, grid };
}

/** Share of taps within 110 ms of a beat. */
function onBeatShare(taps: number[]): number {
  const hits = taps.filter((at) => {
    const off = at - Math.round(at / BEAT_MS) * BEAT_MS;
    return Math.abs(off) <= 110;
  }).length;
  return hits / taps.length;
}

interface RaceRun {
  m: KarungMatch;
  /** Finish time (ms after the go beat) per id of the first race; null when not finished. */
  times: Map<number, number | null>;
}

/** A match where every racer is a brain; returns finish times of race 1. */
function brainRace(skills: number[], seed: number, rounds = 1): RaceRun {
  const m = new KarungMatch({ rounds });
  const ids = skills.map((_, i) => (i === 0 ? 1 : -i));
  m.setPlayers(ids.map((id, i) => player(id, i)));
  const rnd = seeded(seed);
  const brains = new Map(ids.map((id, i) => [id, new HopBrain(skills[i]!, rnd)]));
  const counters = new Map<number, number>();
  const times = new Map<number, number | null>();
  let t = 0;
  while (m.phase !== 'done' && t < 900_000) {
    t += 10;
    const server = t + OFFSET;
    m.advance(t, server);
    for (const e of m.drainEvents()) {
      if (e.type === 'countdown') {
        for (const b of brains.values())
          b.startRace({ anchor: m.anchor, beatMs: m.tuning.beatMs, startAt: m.raceStartServer });
      }
      if (e.type === 'raceEnd' && times.size === 0) {
        for (const r of m.field()) times.set(r.id, m.finishTime(r));
      }
    }
    if (m.phase !== 'race') continue;
    for (const [id, brain] of brains) {
      const r = m.racer(id);
      if (!r || r.finishAt !== null) continue;
      for (const at of brain.update(server)) {
        const c = ((counters.get(id) ?? 0) + 1) & 0xffff;
        counters.set(id, c);
        m.input(id, c, at, t, server);
      }
    }
  }
  return { m, times };
}

describe('HopBrain', () => {
  it('taps about once per beat', () => {
    for (const skill of [0, 0.5, 1]) {
      const { taps } = tapsOver(new HopBrain(skill, seeded(3)), 100);
      expect(taps.length).toBeGreaterThan(85);
      expect(taps.length).toBeLessThan(108);
    }
  });

  it('lands on the beat more often with skill, never every time', () => {
    const share = (skill: number) => {
      let sum = 0;
      for (let seed = 1; seed <= 5; seed++)
        sum += onBeatShare(tapsOver(new HopBrain(skill, seeded(seed)), 80).taps);
      return sum / 5;
    };
    const gentle = share(0);
    const middle = share(0.5);
    const sharp = share(1);
    expect(gentle).toBeLessThan(0.7);
    expect(middle).toBeGreaterThan(gentle);
    expect(sharp).toBeGreaterThan(middle);
    expect(sharp).toBeGreaterThan(0.9);
    expect(sharp).toBeLessThan(1);
  });

  it('is not metronomic', () => {
    const { taps } = tapsOver(new HopBrain(1, seeded(8)), 60);
    const offsets = taps.map((at) => at - Math.round(at / BEAT_MS) * BEAT_MS);
    expect(new Set(offsets.map((o) => Math.round(o))).size).toBeGreaterThan(30);
  });

  it('starts at the go beat, never before', () => {
    const brain = new HopBrain(1, seeded(2));
    const grid: BeatGrid = { anchor: 0, beatMs: BEAT_MS, startAt: 6 * BEAT_MS };
    brain.startRace(grid);
    const out: number[] = [];
    for (let now = 0; now <= 10 * BEAT_MS; now += 16) out.push(...brain.update(now));
    expect(out.length).toBeGreaterThan(2);
    expect(Math.min(...out)).toBeGreaterThan(6 * BEAT_MS - 250);
  });

  it('drops the backlog after a long gap instead of replaying it', () => {
    const brain = new HopBrain(0.8, seeded(4));
    brain.startRace({ anchor: 0, beatMs: BEAT_MS, startAt: 0 });
    for (let now = 0; now <= 3_000; now += 16) brain.update(now);
    expect(brain.update(12_000).length).toBe(0);
    const next: number[] = [];
    for (let now = 12_016; now <= 15_000; now += 16) next.push(...brain.update(now));
    expect(next.length).toBeGreaterThan(2);
    expect(Math.min(...next)).toBeGreaterThan(12_000);
  });

  it('spreads the solo field around the skill: one sharper, one gentler', () => {
    expect(fieldSkills(0.5, 3)).toEqual([0.62, 0.5, 0.38]);
    expect(fieldSkills(0.95, 3)[0]).toBe(1);
    expect(fieldSkills(0.05, 3)[2]).toBe(0);
  });
});

describe('HopBrain in a real race', () => {
  it('scores through the same rules as phones: hops, supers and stumbles', () => {
    let supers = 0;
    let stumbles = 0;
    let finished = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const { m } = brainRace([0.95, 0.5, 0.2, 0.05], seed);
      for (const r of m.all()) {
        supers += r.supers;
        stumbles += r.stumbles;
        if (r.place !== null) finished++;
      }
      expect(m.phase).toBe('done');
    }
    expect(finished).toBe(16);
    expect(supers).toBeGreaterThan(20);
    expect(stumbles).toBeGreaterThan(0);
  });

  it('a sharp racer is quick but beatable, a gentle one slow', () => {
    const sharp: number[] = [];
    const gentle: number[] = [];
    for (let seed = 1; seed <= 6; seed++) {
      const { times } = brainRace([1, 0], seed);
      const a = times.get(1);
      const b = times.get(-1);
      if (a != null) sharp.push(a);
      if (b != null) gentle.push(b);
      // Sharp finishes, and ahead of the gentle one.
      expect(a).not.toBeNull();
      if (b != null && a != null) expect(a).toBeLessThan(b);
    }
    const avg = sharp.reduce((x, y) => x + y, 0) / sharp.length;
    // A perfect rhythm needs ~22 s: the sharpest brain is close to it, not on it.
    expect(avg).toBeGreaterThan(22_500);
    expect(avg).toBeLessThan(28_000);
  });

  it('a middle racer finishes in a time a decent player can match', () => {
    const times: number[] = [];
    for (let seed = 1; seed <= 6; seed++) {
      const t = brainRace([0.45, 0.45], seed).times.get(1);
      if (t != null) times.push(t);
    }
    expect(times.length).toBeGreaterThan(3);
    const avg = times.reduce((x, y) => x + y, 0) / times.length;
    expect(avg).toBeGreaterThan(27_000);
    expect(avg).toBeLessThan(40_000);
  });

  it('the solo field differs: the sharper opponent usually beats the gentler one', () => {
    let wins = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const skills = fieldSkills(0.5, 3);
      const { m } = brainRace([0.5, ...skills], seed, 3);
      const a = m.racer(-1)!;
      const c = m.racer(-3)!;
      if (a.points > c.points) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(7);
  });
});
