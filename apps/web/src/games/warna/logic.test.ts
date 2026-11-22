import { describe, expect, it } from 'vitest';
import { LEVELS } from './levels';
import { INTRO_S, type Person, scoreStage, votesNeeded, WarnaMatch } from './logic';
import { buildResult, pickAwards } from './results';
import { TUNE } from './world';

const P = (id: number, connected = true): Person => ({
  id,
  name: `P${id}`,
  fruit: 'jeruk',
  color: '#2F8CFF',
  connected,
});

function play(m: WarnaMatch, seconds: number): void {
  for (let t = 0; t < seconds; t += 1 / 60) m.update(1 / 60);
}

describe('session', () => {
  it('runs picker, intro and play for the chosen stages', () => {
    const m = new WarnaMatch(3);
    m.setPeople([P(1), P(2)]);
    expect(m.pickLevel('lift')).toBe(true);
    expect(m.pickLevel('nope')).toBe(false);
    m.start();
    expect(m.order).toEqual([3, 4, 5]);
    expect(m.phase).toBe('intro');
    expect(m.world?.chars).toHaveLength(2);
    play(m, INTRO_S + 0.1);
    expect(m.phase).toBe('play');
  });

  it('gives a lone player two characters and swaps between them', () => {
    const m = new WarnaMatch(1);
    m.setPeople([P(7)]);
    m.start();
    play(m, INTRO_S + 0.1);
    expect(m.solo).toBe(true);
    expect(m.world?.chars.map((c) => c.slot)).toEqual([0, 1]);
    expect(m.charOf(7)).toBe(0);
    m.setStick(7, 1, false);
    expect(m.world!.chars[0]!.inX).toBe(1);
    m.swap(7);
    expect(m.charOf(7)).toBe(1);
    expect(m.world!.chars[0]!.inX).toBe(0);
    expect(m.world!.chars[1]!.inX).toBe(1);
  });

  it('restarts after enough votes (solo: a double tap)', () => {
    expect(votesNeeded(1)).toBe(1);
    expect(votesNeeded(2)).toBe(2);
    expect(votesNeeded(5)).toBe(3);
    const m = new WarnaMatch(1);
    m.setPeople([P(1), P(2), P(3)]);
    m.start();
    play(m, INTRO_S + 0.1);
    const before = m.world;
    m.restart(1);
    expect(m.votes.size).toBe(1);
    m.restart(1);
    expect(m.world).toBe(before);
    m.restart(2);
    expect(m.world).not.toBe(before);
    expect(m.phase).toBe('play');

    const s = new WarnaMatch(1);
    s.setPeople([P(9)]);
    s.start();
    play(s, INTRO_S + 0.1);
    const w = s.world;
    s.restart(9);
    expect(s.world).toBe(w);
    s.restart(9);
    expect(s.world).not.toBe(w);
  });

  it('scores a stage: clear, all gems, under par', () => {
    const lv = LEVELS[0]!;
    expect(scoreStage(lv, lv.par - 1, 4, 4).stars).toBe(3);
    expect(scoreStage(lv, lv.par + 1, 3, 4).stars).toBe(1);
    expect(scoreStage(lv, lv.par + 1, 4, 4).stars).toBe(2);
  });

  it('clears the tutorial stage when both colours reach their doors', () => {
    const m = new WarnaMatch(1);
    m.setPeople([P(1), P(2)]);
    m.start();
    play(m, INTRO_S + 0.1);
    const w = m.world!;
    // Biru (slot 1) takes the bottom lane, whose pool and door fold onto blue with two colours.
    // Merah is carried to its door for the test.
    const red = w.chars[0]!;
    const door = w.level.exits.find((e) => e.slot === 0)!;
    red.x = door.x + (1 - TUNE.charW) / 2;
    red.y = door.y + 1 - TUNE.charH;
    red.cpX = red.x;
    red.cpY = red.y;
    m.setStick(2, 1, false);
    let died = false;
    for (let i = 0; i < 60 * 12 && m.phase === 'play'; i++) {
      m.update(1 / 60);
      for (const e of m.drainEvents()) if (e.type === 'world' && e.e.type === 'die') died = true;
    }
    expect(died).toBe(false);
    expect(m.phase).toBe('clear');
    expect(m.scores).toHaveLength(1);
    play(m, 6);
    expect(m.phase).toBe('done');
    const res = buildResult(m, [1, 2]);
    expect(res.ranking.every((r) => r.rank === 1)).toBe(true);
    expect(new Set(res.awards?.map((a) => a.playerId))).toEqual(new Set([1, 2]));
  });
});

describe('awards', () => {
  it('gives every player a title', () => {
    const base = { jumps: 0, deaths: 0, gems: 0, carried: 0, pushed: 0, helped: 0, firstIn: 0 };
    const awards = pickAwards(
      [
        { ...base, id: 1, carried: 12, gems: 3 },
        { ...base, id: 2, gems: 4 },
        { ...base, id: 3, jumps: 3 },
        { ...base, id: 4 },
      ],
      [1, 2, 3, 4],
    );
    expect(awards.map((a) => a.playerId).sort()).toEqual([1, 2, 3, 4]);
    expect(awards.find((a) => a.playerId === 1)?.title).toBe('Tiang Kokoh');
    expect(awards.find((a) => a.playerId === 2)?.title).toBe('Pemburu Permata');
  });
});
