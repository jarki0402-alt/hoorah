import { describe, expect, it } from 'vitest';
import { ObbyMatch } from './logic';
import { JUMP_BUTTON, viewFor } from './views';

const racers = [1, 2].map((id) => ({
  id,
  name: `P${id}`,
  fruit: 'jeruk' as const,
  look: { c: 'tara' as const },
  color: '#2F8CFF',
  cpu: false,
}));
const ctx = (m: ObbyMatch, id: number) => ({
  match: m,
  id,
  guests: [],
  sinceFall: Infinity,
  finalRank: null,
  titles: new Map(),
});

describe('obby phone views', () => {
  it('counts down, then shows the landscape pad with one big LOMPAT button', () => {
    const m = new ObbyMatch({ racers, tracks: 1, seed: 1 });
    expect(viewFor(ctx(m, 1)).kind).toBe('countdown');
    for (let i = 0; i < 8 * 60 && m.phase !== 'race'; i++) m.tick(1 / 60);
    const v = viewFor(ctx(m, 1));
    expect(v.kind).toBe('pad');
    if (v.kind !== 'pad') return;
    expect(v.mode).toBe('stick');
    expect(v.buttons).toEqual([JUMP_BUTTON]);
    expect(JUMP_BUTTON.press).toBe('tap');
    expect(v.title).toBe('Lari ke titik simpan 1');
  });

  it('tells a runner who was brought back, and lets finishers cheer', () => {
    const m = new ObbyMatch({ racers, tracks: 1, seed: 1 });
    for (let i = 0; i < 8 * 60 && m.phase !== 'race'; i++) m.tick(1 / 60);
    m.racer(1)!.sincePull = 0.5;
    const v = viewFor(ctx(m, 1));
    expect(v.kind === 'pad' && v.alert?.title).toBe('Dipindah ke titik simpan');
    m.racer(2)!.finishedAt = 30;
    m.racer(2)!.place = 1;
    const f = viewFor(ctx(m, 2));
    expect(f.kind === 'message' && f.reactions).toBe(true);
  });
});
