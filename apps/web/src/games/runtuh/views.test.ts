import { lookOfFruit } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { RuntuhMatch } from './logic';
import { PUSH_BUTTON, viewFor } from './views';

const players = [1, 2].map((id) => ({
  id,
  name: `P${id}`,
  fruit: 'jeruk' as const,
  look: lookOfFruit('jeruk'),
  color: '#2F8CFF',
  cpu: false,
}));
const ctx = (m: RuntuhMatch, id: number) => ({ match: m, id, guests: [], titles: new Map() });

describe('lantai runtuh phone views', () => {
  it('shows DORONG with the 3-second rest ring on the phone', () => {
    expect(PUSH_BUTTON).toMatchObject({ id: 'push', press: 'tap', cooldownMs: 3000, big: true });
    const m = new RuntuhMatch({ players, seed: 1 });
    expect(viewFor(ctx(m, 1)).kind).toBe('countdown');
    for (let i = 0; i < 5 * 60 && m.phase !== 'play'; i++) m.tick(1 / 60);
    const v = viewFor(ctx(m, 1));
    expect(v.kind === 'pad' && v.buttons).toEqual([PUSH_BUTTON]);
  });

  it('a fallen player waits with cheers and hears which round they rejoin', () => {
    const m = new RuntuhMatch({ players, seed: 1 });
    for (let i = 0; i < 5 * 60 && m.phase !== 'play'; i++) m.tick(1 / 60);
    m.sim.place(2, { x: 40, y: 0, z: 0 });
    for (let i = 0; i < 2 * 60 && !m.player(2)!.out; i++) m.tick(1 / 60);
    const v = viewFor(ctx(m, 2));
    expect(v.kind).toBe('message');
    if (v.kind !== 'message') return;
    expect(v.reactions).toBe(true);
    expect(v.title).toBe('Kamu jatuh!');
    expect(v.subtitle).toContain('babak 2: Angka');
  });
});
