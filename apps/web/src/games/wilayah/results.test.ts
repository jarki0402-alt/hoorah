import { FRUITS, type PlayerInfo } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { type Arena, type RunnerStats, type Standing, WilayahMatch } from './logic';
import { buildResult, pickAwards, soloOutcome } from './results';
import { formatClock, formatPct } from './strings';
import { Trail } from './trail';
import { viewFor } from './views';

const SIZE = 1000;

function stats(over: Partial<RunnerStats> = {}): RunnerStats {
  return { kills: 0, outs: 0, captures: 0, captured: 0, bestCapture: 0, peak: 0, longestLoop: 0, ...over };
}

function standing(id: number, cells: number, rank: number, s: Partial<RunnerStats> = {}): Standing {
  return {
    cells,
    rank,
    runner: {
      id,
      slot: id - 1,
      v: id,
      name: `P${id}`,
      fruit: FRUITS[id % FRUITS.length]!,
      color: '#F2453D',
      connected: true,
      alive: true,
      x: 0,
      y: 0,
      angle: 0,
      px: 0,
      py: 0,
      pangle: 0,
      target: null,
      stickAt: 0,
      trail: new Trail(),
      respawnAt: 0,
      protectUntil: 0,
      spawnedAt: 0,
      stats: stats(s),
    },
  };
}

describe('formatting', () => {
  it('writes percentages the Indonesian way', () => {
    expect(formatPct(18.44)).toBe('18,4');
    expect(formatPct(20)).toBe('20');
    expect(formatPct(0.04)).toBe('0');
    expect(formatPct(7.96, 0)).toBe('8');
  });

  it('rounds the clock up', () => {
    expect(formatClock(120_000)).toBe('2:00');
    expect(formatClock(59_001)).toBe('1:00');
    expect(formatClock(400)).toBe('0:01');
    expect(formatClock(-5)).toBe('0:00');
  });
});

describe('result', () => {
  it('ranks by share with labels and names the winner', () => {
    const r = buildResult([standing(2, 300, 1), standing(1, 120, 2), standing(3, 0, 3)], SIZE, 3);
    expect(r.title).toBe('P2 menguasai lantai!');
    expect(r.subtitle).toBe('Wilayah terluas 30% dalam 3 menit');
    expect(r.ranking.map((x) => [x.playerId, x.rank, x.label])).toEqual([
      [2, 1, '30%'],
      [1, 2, '12%'],
      [3, 3, '0%'],
    ]);
  });

  it('shares first place on a tie', () => {
    const r = buildResult([standing(1, 200, 1), standing(2, 200, 1)], SIZE, 2);
    expect(r.title).toBe('P1 dan P2 sama luas!');
    expect(soloOutcome(r, 1)).toBe('draw');
  });

  it('reports the lone person as winner or loser', () => {
    const r = buildResult([standing(-1, 400, 1), standing(1, 100, 2)], SIZE, 3);
    expect(soloOutcome(r, 1)).toBe('lose');
    expect(soloOutcome(r, -1)).toBe('win');
    expect(soloOutcome(r, 99)).toBeNull();
  });

  it('spreads awards so more players get one', () => {
    const rows = [
      {
        id: 1,
        name: 'A',
        pct: 30,
        rank: 1,
        stats: stats({ bestCapture: 120, kills: 3, peak: 320, captures: 4 }),
      },
      {
        id: 2,
        name: 'B',
        pct: 10,
        rank: 2,
        stats: stats({ bestCapture: 60, kills: 1, peak: 100, captures: 2, outs: 1 }),
      },
      { id: 3, name: 'C', pct: 5, rank: 3, stats: stats({ longestLoop: 40, captures: 1, outs: 3 }) },
    ];
    const awards = pickAwards(rows, SIZE);
    const owners = new Set(awards.map((a) => a.playerId));
    expect(owners.size).toBe(3);
    expect(awards.find((a) => a.title === 'Sapu Bersih')?.playerId).toBe(1);
    expect(awards.find((a) => a.title === 'Pemburu Jejak')?.playerId).toBe(2);
    expect(awards.find((a) => a.title === 'Penjelajah')?.playerId).toBe(3);
    const emDash = String.fromCharCode(0x2014);
    expect(awards.every((a) => !a.desc.includes(emDash) && !a.title.includes(emDash))).toBe(true);
  });
});

describe('phone views', () => {
  const ARENA: Arena = { cols: 96, rows: 54, unit: 3, speed: 8, stepMs: 20 };
  const people: PlayerInfo[] = [1, 2].map((id) => ({
    id,
    name: `P${id}`,
    fruit: FRUITS[id]!,
    color: id === 1 ? '#F2453D' : '#2F8CFF',
    connected: true,
    isHost: id === 1,
  }));

  it('counts down, then shows the joystick with share, rank and time', () => {
    const m = new WilayahMatch({ players: people, minutes: 2, now: 0, rnd: () => 0.3, arena: ARENA });
    const count = viewFor({ match: m, id: 1, t: 0, result: null });
    expect(count).toMatchObject({ kind: 'countdown', value: '3', subtitle: 'Wilayahmu berwarna Merah' });
    m.advance(m.goAt);
    const pad = viewFor({ match: m, id: 1, t: m.goAt, result: null });
    expect(pad).toMatchObject({ kind: 'pad', mode: 'stick', color: '#F2453D', eyebrow: 'Aman' });
    if (pad?.kind !== 'pad') throw new Error('expected pad');
    expect(pad.actionLabel).toBeUndefined();
    expect(pad.title).toBe(`Wilayah ${formatPct(m.percent(m.runner(1)!), 1)}%`);
    expect(pad.hint).toContain('joystick');
    expect(pad.stats).toEqual([
      { label: 'Peringkat', value: '1/2' },
      { label: 'Waktu', value: '2:00' },
    ]);
    expect(pad.locked).toBeUndefined();
  });

  it('locks the joystick with a countdown banner while knocked out', () => {
    const m = new WilayahMatch({ players: people, minutes: 2, now: 0, rnd: () => 0.3, arena: ARENA });
    m.advance(m.goAt);
    const r = m.runner(1)!;
    r.alive = false;
    r.respawnAt = m.goAt + 2500;
    const v = viewFor({ match: m, id: 1, t: m.goAt, result: null });
    expect(v).toMatchObject({ kind: 'pad', locked: true, banner: 'Hidup lagi dalam 3…' });
  });

  it('shows the final result and turns away a ninth player', () => {
    const m = new WilayahMatch({ players: people, minutes: 1, now: 0, rnd: () => 0.3, arena: ARENA });
    for (let t = 0; t <= m.endAt; t += 50) m.advance(t);
    const result = buildResult(m.standings(), m.field.size, 1);
    const v = viewFor({ match: m, id: 2, t: m.endAt, result });
    expect(v?.kind).toBe('result');
    m.spectators.add(9);
    expect(viewFor({ match: m, id: 9, t: m.endAt, result })).toMatchObject({
      kind: 'message',
      title: 'Lantai penuh',
    });
    expect(viewFor({ match: m, id: 42, t: m.endAt, result })).toBeNull();
  });
});
