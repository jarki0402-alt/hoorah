import { describe, expect, it } from 'vitest';
import { biomeOf, LEVELS } from './levels';
import {
  HINT_IDLE_S,
  INTRO_S,
  isOpen,
  type Person,
  resumeLevel,
  SKIP_AFTER_S,
  scoreStage,
  votesNeeded,
  WarnaMatch,
  worldStars,
} from './logic';
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

/** Picks the world's resume stage and starts. */
function begin(m: WarnaMatch): void {
  m.toLevels();
  m.start();
}

/** Puts every character on a door of its colour. */
function toDoors(m: WarnaMatch): void {
  const w = m.sim!;
  for (const c of w.chars) {
    const door = w.level.exits.find((e) => e.slot % w.colors === c.slot)!;
    c.x = door.x + (1 - TUNE.charW) / 2;
    c.y = door.y + 1 - TUNE.charH;
    c.cpX = c.x;
    c.cpY = c.y;
  }
}

describe('session', () => {
  it('runs world picker, level picker, intro and play for the chosen stages', () => {
    const m = new WarnaMatch(3);
    m.setPeople([P(1), P(2)]);
    expect(m.pickWorld('gurun')).toBe(false);
    expect(m.pickWorld('gua')).toBe(true);
    expect(m.pickLevel('gua-1')).toBe(false);
    expect(m.toLevels()).toBe(true);
    expect(LEVELS[m.pick]?.id).toBe('gua-1');
    expect(m.pickLevel('gua-2')).toBe(false);
    expect(m.toWorlds()).toBe(true);
    expect(m.pickWorld('hutan')).toBe(true);
    m.toLevels();
    expect(m.pickLevel('hutan-1')).toBe(true);
    m.start();
    expect(m.order).toEqual([0, 1, 2]);
    expect(m.phase).toBe('intro');
    expect(m.sim?.chars).toHaveLength(2);
    play(m, INTRO_S + 0.1);
    expect(m.phase).toBe('play');
  });

  it('gives a lone player two characters and swaps between them', () => {
    const m = new WarnaMatch(1);
    m.setPeople([P(7)]);
    begin(m);
    play(m, INTRO_S + 0.1);
    expect(m.solo).toBe(true);
    expect(m.sim?.chars.map((c) => c.slot)).toEqual([0, 1]);
    expect(m.charOf(7)).toBe(0);
    m.setStick(7, 1, false);
    expect(m.sim!.chars[0]!.inX).toBe(1);
    m.swap(7);
    expect(m.charOf(7)).toBe(1);
    expect(m.sim!.chars[0]!.inX).toBe(0);
    expect(m.sim!.chars[1]!.inX).toBe(1);
  });

  it('restarts after enough votes (solo: a double tap)', () => {
    expect(votesNeeded(1)).toBe(1);
    expect(votesNeeded(2)).toBe(2);
    expect(votesNeeded(5)).toBe(3);
    const m = new WarnaMatch(1);
    m.setPeople([P(1), P(2), P(3)]);
    begin(m);
    play(m, INTRO_S + 0.1);
    const before = m.sim;
    m.restart(1);
    expect(m.votes.size).toBe(1);
    m.restart(1);
    expect(m.sim).toBe(before);
    m.restart(2);
    expect(m.sim).not.toBe(before);
    expect(m.phase).toBe('play');

    const s = new WarnaMatch(1);
    s.setPeople([P(9)]);
    begin(s);
    play(s, INTRO_S + 0.1);
    const w = s.sim;
    s.restart(9);
    expect(s.sim).toBe(w);
    s.restart(9);
    expect(s.sim).not.toBe(w);
  });

  it('scores a stage: clear, all gems, under par', () => {
    const lv = LEVELS[0]!;
    expect(scoreStage(lv, lv.par - 1, 4, 4).stars).toBe(3);
    expect(scoreStage(lv, lv.par + 1, 3, 4).stars).toBe(1);
    expect(scoreStage(lv, lv.par + 1, 4, 4).stars).toBe(2);
  });

  it('clears a stage when everyone stands at a door of their colour, and records it', () => {
    const m = new WarnaMatch(1);
    m.setPeople([P(1), P(2)]);
    begin(m);
    play(m, INTRO_S + 0.1);
    toDoors(m);
    play(m, 1);
    expect(m.phase).toBe('clear');
    expect(m.scores).toHaveLength(1);
    expect(m.progress['hutan-1']).toBeGreaterThanOrEqual(1);
    play(m, 6);
    expect(m.phase).toBe('done');
    const res = buildResult(m, [1, 2]);
    expect(res.ranking.every((r) => r.rank === 1)).toBe(true);
    expect(new Set(res.awards?.map((a) => a.playerId))).toEqual(new Set([1, 2]));
  });
});

describe('worlds and progress', () => {
  it('opens stages in order and resumes at the first unfinished one', () => {
    const hutan = biomeOf('hutan').levels;
    expect(isOpen(hutan[0]!, {})).toBe(true);
    expect(isOpen(hutan[1]!, {})).toBe(false);
    expect(isOpen(hutan[1]!, { 'hutan-1': 0 })).toBe(true);
    expect(resumeLevel('hutan', {})?.id).toBe('hutan-1');
    expect(resumeLevel('hutan', { 'hutan-1': 3, 'hutan-2': 1 })?.id).toBe('hutan-3');
    expect(worldStars('hutan', { 'hutan-1': 3, 'hutan-2': 1 })).toEqual({ got: 4, of: 90 });
    const m = new WarnaMatch(2, { 'hutan-1': 2 });
    expect(LEVELS[m.pick]?.id).toBe('hutan-2');
    m.toLevels();
    expect(m.pickLevel('hutan-3')).toBe(false);
    expect(m.pickLevel('hutan-1')).toBe(true);
  });

  it('lets the Host skip after a long time: no stars, the next stage opens', () => {
    const m = new WarnaMatch(1);
    m.setPeople([P(1), P(2)]);
    begin(m);
    play(m, INTRO_S + 0.1);
    expect(m.skip()).toBe(false);
    play(m, SKIP_AFTER_S);
    expect(m.canSkip()).toBe(true);
    expect(m.skip()).toBe(true);
    expect(m.phase).toBe('clear');
    expect(m.lastScore()?.skipped).toBe(true);
    expect(m.progress['hutan-1']).toBe(0);
    expect(isOpen(LEVELS[1]!, m.progress)).toBe(true);
  });

  it('gives staged hints and pulses the hint button when nothing moves forward', () => {
    const lv = biomeOf('hutan').levels[3]!;
    const m = new WarnaMatch(1, { 'hutan-1': 1, 'hutan-2': 1, 'hutan-3': 1 });
    m.setPeople([P(1), P(2)]);
    m.toLevels();
    expect(m.pickLevel(lv.id)).toBe(true);
    m.start();
    play(m, INTRO_S + 0.1);
    expect(m.currentHint()).toBeNull();
    m.hint(1);
    const h1 = m.currentHint();
    expect(h1?.level).toBe(1);
    expect(h1?.kind).toBe('plate');
    m.hint(2);
    expect(m.currentHint()?.level).toBe(2);
    expect(m.currentHint()?.from).not.toBeNull();
    expect(m.hintPulse()).toBe(false);
    play(m, HINT_IDLE_S + 0.5);
    expect(m.hintPulse()).toBe(true);
    expect(m.currentHint()).toBeNull();
  });
});

describe('awards', () => {
  it('gives every player a title', () => {
    const base = { jumps: 0, deaths: 0, gems: 0, pushed: 0, helped: 0, firstIn: 0 };
    const awards = pickAwards(
      [
        { ...base, id: 1, pushed: 12, gems: 3 },
        { ...base, id: 2, gems: 4 },
        { ...base, id: 3, jumps: 3 },
        { ...base, id: 4 },
      ],
      [1, 2, 3, 4],
    );
    expect(awards.map((a) => a.playerId).sort()).toEqual([1, 2, 3, 4]);
    expect(awards.find((a) => a.playerId === 1)?.title).toBe('Pendorong Andal');
    expect(awards.find((a) => a.playerId === 2)?.title).toBe('Pemburu Permata');
  });
});
