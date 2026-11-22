import { describe, expect, it } from 'vitest';
import {
  EjaMatch,
  LIVES,
  nearMiss,
  POINTS,
  SOLO_MAX_WORDS,
  TIMING,
  tierForIndex,
  tierForLevel,
} from './logic';

const players = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1, connected: true }));

function make(n: number, words = 10, seed = 7) {
  let now = 1_000;
  const m = new EjaMatch({ words, seed, now, players: players(n) });
  const step = (ms: number) => {
    now += ms;
    // Feed the clock in small steps, like the frame loop does.
    const events = [];
    for (let left = ms; left > 0; left -= 500) events.push(...m.tick(now - left + Math.min(500, left)));
    return events;
  };
  return { m, step, at: () => now };
}

/** Run the intro so the word is open for typing. */
function openWord(g: ReturnType<typeof make>) {
  g.step(TIMING.introMs + 50);
  expect(g.m.phase).toBe('spell');
}

describe('near misses', () => {
  it('names the kind of one-letter slip', () => {
    expect(nearMiss('angkung', 'angklung')).toBe('missing');
    expect(nearMiss('angkllung', 'angklung')).toBe('extra');
    expect(nearMiss('angklong', 'angklung')).toBe('typo');
    expect(nearMiss('angkulng', 'angklung')).toBe('swap');
  });

  it('is null for a right answer or a far one', () => {
    expect(nearMiss('angklung', 'angklung')).toBeNull();
    expect(nearMiss('angklu', 'angklung')).toBeNull();
    expect(nearMiss('xyz', 'angklung')).toBeNull();
    expect(nearMiss('', 'angklung')).toBeNull();
  });
});

describe('tiers', () => {
  it('goes Mudah, Sedang, Sulit through a group session', () => {
    const tiers = Array.from({ length: 10 }, (_, i) => tierForIndex(i, 10));
    expect(tiers[0]).toBe(1);
    expect(tiers[9]).toBe(3);
    expect(tiers).toEqual([...tiers].sort());
    expect(tiers).toContain(2);
  });

  it('follows the hidden level solo', () => {
    expect(tierForLevel(0)).toBe(1);
    expect(tierForLevel(4)).toBe(2);
    expect(tierForLevel(9)).toBe(3);
  });
});

describe('group play', () => {
  it('needs the Host to start, then reads the first word', () => {
    const g = make(3);
    expect(g.m.phase).toBe('setup');
    expect(g.m.pick('en')).toBe(true);
    expect(g.m.pick('fr')).toBe(false);
    g.m.start(g.at());
    expect(g.m.phase).toBe('intro');
    expect(g.m.solo).toBe(false);
    expect(g.m.lang).toBe('en');
    expect(g.m.word?.tier).toBe(1);
  });

  it('reveals as soon as everyone answered, scoring right answers and the fastest', () => {
    const g = make(3);
    g.m.start(g.at());
    openWord(g);
    const word = g.m.word!.word;
    g.step(1_000);
    g.m.submit(1, word, g.at());
    g.step(1_000);
    g.m.submit(2, word.toUpperCase(), g.at());
    expect(g.m.phase).toBe('spell');
    const events = g.m.submit(3, `${word}x`, g.at());
    expect(events.some((e) => e.type === 'phase' && e.phase === 'reveal')).toBe(true);
    const [a, b, c] = [g.m.seat(1)!, g.m.seat(2)!, g.m.seat(3)!];
    expect(a.gained).toBe(POINTS.correct + POINTS.fastest);
    expect(b.gained).toBe(POINTS.correct);
    expect(c.verdict).toBe('near');
    expect(c.near).toBe('extra');
    expect(c.lives).toBe(LIVES - 1);
    expect(a.spelled).toEqual([word]);
  });

  it('takes one answer per word and ignores answers outside the typing time', () => {
    const g = make(2);
    g.m.start(g.at());
    expect(g.m.submit(1, 'abc', g.at())).toEqual([]);
    openWord(g);
    expect(g.m.submit(1, 'abc', g.at()).length).toBe(1);
    expect(g.m.submit(1, 'abcd', g.at())).toEqual([]);
    expect(g.m.seat(1)!.answer).toBe('abc');
    expect(g.m.submit(2, '123', g.at())).toEqual([]);
  });

  it('costs a life when the time runs out without an answer', () => {
    const g = make(2);
    g.m.start(g.at());
    openWord(g);
    g.step(TIMING.spellMs[1] + TIMING.graceMs + 100);
    expect(g.m.phase).toBe('reveal');
    expect(g.m.seat(1)!.verdict).toBe('none');
    expect(g.m.seat(1)!.lives).toBe(LIVES - 1);
  });

  it('doubles the points of the Sulit words', () => {
    const g = make(2, 4);
    g.m.start(g.at());
    for (let i = 0; i < 3; i++) {
      openWord(g);
      if (g.m.tier === 3) break;
      const w = g.m.word!.word;
      g.m.submit(1, w, g.at());
      g.m.submit(2, w, g.at());
      g.step(TIMING.revealMs + 50);
    }
    if (g.m.phase === 'intro') openWord(g);
    expect(g.m.tier).toBe(3);
    expect(g.m.multiplier).toBe(2);
    const w = g.m.word!.word;
    g.m.submit(2, w, g.at());
    g.m.submit(1, 'zz', g.at());
    expect(g.m.seat(2)!.gained).toBe((POINTS.correct + POINTS.fastest) * 2);
  });

  it('keeps a player without lives typing in Latihan for no points', () => {
    const g = make(2, 10);
    g.m.start(g.at());
    for (let i = 0; i < LIVES; i++) {
      openWord(g);
      g.m.submit(1, 'zzz', g.at());
      g.m.submit(2, g.m.word!.word, g.at());
      g.step(TIMING.revealMs + 50);
    }
    expect(g.m.seat(1)!.lives).toBe(0);
    openWord(g);
    const before = g.m.seat(1)!.score;
    g.m.submit(1, g.m.word!.word, g.at());
    g.m.submit(2, 'zzz', g.at());
    expect(g.m.seat(1)!.practice).toBe(true);
    expect(g.m.seat(1)!.score).toBe(before);
    expect(g.m.seat(1)!.stats.practice).toBe(1);
  });

  it('ends after the last word and never deals a word twice', () => {
    const g = make(2, 5);
    g.m.start(g.at());
    const seen = new Set<string>();
    for (let i = 0; i < 5; i++) {
      openWord(g);
      seen.add(g.m.word!.word);
      g.m.submit(1, g.m.word!.word, g.at());
      g.m.submit(2, g.m.word!.word, g.at());
      g.step(TIMING.revealMs + 50);
    }
    expect(seen.size).toBe(5);
    expect(g.m.phase).toBe('final');
    g.step(TIMING.finalMs + 50);
    expect(g.m.phase).toBe('ended');
    const st = g.m.standings();
    expect(st[0]!.rank).toBe(1);
  });

  it('lets a late joiner in from the next word', () => {
    const g = make(2);
    g.m.start(g.at());
    openWord(g);
    g.m.syncPlayers([...players(2), { id: 9, connected: true }], g.at());
    expect(g.m.seat(9)!.inWord).toBe(false);
    g.m.submit(1, 'aa', g.at());
    g.m.submit(2, 'aa', g.at());
    expect(g.m.phase).toBe('reveal');
    g.step(TIMING.revealMs + 50);
    expect(g.m.seat(9)!.inWord).toBe(true);
  });

  it('stops the clock while held', () => {
    const g = make(2);
    g.m.start(g.at());
    openWord(g);
    const left = g.m.msLeft();
    g.m.setHeld(true, g.at());
    g.step(60_000);
    expect(g.m.phase).toBe('spell');
    expect(g.m.msLeft()).toBe(left);
  });
});

describe('solo', () => {
  it('climbs the tiers with a streak and ends when the lives run out', () => {
    const g = make(1);
    g.m.start(g.at());
    expect(g.m.solo).toBe(true);
    for (let i = 0; i < 8; i++) {
      openWord(g);
      g.m.submit(1, g.m.word!.word, g.at());
      g.step(TIMING.revealMs + 50);
    }
    expect(g.m.seat(1)!.stats.bestStreak).toBe(8);
    expect(g.m.tier).toBe(3);
    for (let i = 0; i < LIVES; i++) {
      openWord(g);
      g.m.submit(1, 'qqq', g.at());
      g.step(TIMING.revealMs + 50);
    }
    expect(g.m.phase).toBe('final');
    expect(g.m.seat(1)!.score).toBe(8 * POINTS.correct);
  });

  it('never scores the fastest bonus alone and has a word cap', () => {
    const g = make(1);
    g.m.start(g.at());
    openWord(g);
    g.m.submit(1, g.m.word!.word, g.at());
    expect(g.m.seat(1)!.gained).toBe(POINTS.correct);
    expect(g.m.total).toBe(SOLO_MAX_WORDS);
  });
});
