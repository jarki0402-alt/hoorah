import { describe, expect, it } from 'vitest';
import { EjaMatch, TIMING } from './logic';
import { viewFor } from './views';

describe('Juara Eja phone views', () => {
  it('never sends the word before the reveal, then shows the verdict', () => {
    let now = 1_000;
    const m = new EjaMatch({
      words: 6,
      seed: 3,
      now,
      players: [1, 2].map((id) => ({ id, connected: true })),
    });
    const ctx = { hostId: 1, name: (id: number) => `P${id}` };
    m.start(now);
    const word = m.word!.word;
    const leaks = (id: number) =>
      JSON.stringify(viewFor(m, id, now, ctx))
        .toLowerCase()
        .includes(`"${word}"`);
    expect(leaks(1)).toBe(false);
    for (let t = 0; t < TIMING.introMs + 100; t += 250) {
      now += 250;
      m.tick(now);
    }
    const v = viewFor(m, 1, now, ctx);
    expect(v).toMatchObject({ kind: 'word', slots: true, maxLength: word.length });
    expect(JSON.stringify(v).toLowerCase()).not.toContain(word);
    m.submit(1, word, now);
    m.submit(2, 'zz', now);
    expect(viewFor(m, 1, now, ctx)).toMatchObject({ kind: 'result', tone: 'good' });
    expect(viewFor(m, 2, now, ctx)).toMatchObject({
      kind: 'result',
      tone: 'bad',
      chips: [word.toUpperCase()],
    });
  });

  it('lets only the Host choose the language', () => {
    const m = new EjaMatch({
      words: 6,
      seed: 3,
      now: 0,
      players: [1, 2].map((id) => ({ id, connected: true })),
    });
    const ctx = { hostId: 1, name: (id: number) => `P${id}` };
    expect(viewFor(m, 1, 0, ctx)).toMatchObject({ kind: 'menu', confirm: { id: 'start' } });
    expect(viewFor(m, 2, 0, ctx)).toMatchObject({ kind: 'menu', locked: true });
  });
});
