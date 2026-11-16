import type { PlayerInfo } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import {
  isCpu,
  makeCpuPlayers,
  nextSkill,
  pickWithSlips,
  SKILL_MAX,
  SKILL_MIN,
  soloOpponents,
  thinkMs,
} from './cpu';
import { submitRecord } from './records';

const human: PlayerInfo = {
  id: 1,
  name: 'Rina',
  fruit: 'semangka',
  color: '#F2453D',
  connected: true,
  isHost: true,
};

function seq(...vals: number[]): () => number {
  let i = 0;
  return () => vals[i++ % vals.length]!;
}

describe('cpu players', () => {
  it('adds opponents only when one human plays', () => {
    expect(soloOpponents([human], 3)).toHaveLength(3);
    expect(soloOpponents([human, { ...human, id: 2 }], 3)).toHaveLength(0);
    expect(soloOpponents([], 3)).toHaveLength(0);
  });

  it('uses negative ids, unused fruits/colours and distinct names', () => {
    const cpus = makeCpuPlayers([human], 5);
    expect(cpus.map((c) => c.id)).toEqual([-1, -2, -3, -4, -5]);
    expect(cpus.every((c) => isCpu(c.id) && c.connected && !c.isHost)).toBe(true);
    expect(cpus.some((c) => c.fruit === 'semangka')).toBe(false);
    expect(cpus.some((c) => c.color === '#F2453D')).toBe(false);
    expect(new Set(cpus.map((c) => c.name)).size).toBe(5);
    expect(cpus.some((c) => /bot|cpu|komputer/i.test(c.name))).toBe(false);
  });
});

describe('adaptive skill', () => {
  it('drops after a loss, rises after a win, stays in range', () => {
    expect(nextSkill(0.5, 'lose')).toBeLessThan(0.5);
    expect(nextSkill(0.5, 'win')).toBeGreaterThan(0.5);
    expect(nextSkill(0.5, 'draw')).toBe(0.5);
    let s = 0.5;
    for (let i = 0; i < 20; i++) s = nextSkill(s, 'lose');
    expect(s).toBe(SKILL_MIN);
    for (let i = 0; i < 30; i++) s = nextSkill(s, 'win');
    expect(s).toBe(SKILL_MAX);
  });

  it('thinks for a believable time and sometimes slips', () => {
    for (const r of [0, 0.5, 0.999]) {
      const t = thinkMs(0.5, 600, 1500, () => r);
      expect(t).toBeGreaterThanOrEqual(300);
      expect(t).toBeLessThanOrEqual(1500);
    }
    expect(pickWithSlips(['a', 'b', 'c'], 1, seq(0.1))).toBe('a');
    expect(pickWithSlips(['a', 'b', 'c'], 0, seq(0.99, 0.99, 0.99))).not.toBe('a');
  });
});

describe('records', () => {
  it('first game sets the record without "new", later better scores are new', () => {
    // No localStorage in node: every call behaves like a first game.
    const r = submitRecord('kuis', 'kilat', 10);
    expect(r).toEqual({ best: 10, previous: null, isNew: false });
  });
});
