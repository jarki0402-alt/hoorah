import { lookOfFruit } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { THUMBS } from '../../controller/thumbs/tali';
import { ROUTES } from './course';
import { SACK_ID, TaliMatch, TIMING } from './logic';
import { pickView, viewFor } from './views';

const climbers = (n: number) =>
  (['jeruk', 'semangka'] as const)
    .slice(0, n)
    .map((fruit, i) => ({ id: i + 1, name: `P${i + 1}`, fruit, look: lookOfFruit(fruit), color: '#2F8CFF' }));

function climbing(n: number): TaliMatch {
  const m = new TaliMatch({ climbers: climbers(n), route: 'senja', sections: 3, seed: 1 });
  for (let i = 0; i < (TIMING.intro + TIMING.count + 0.1) * 60; i++) m.tick(1 / 60);
  m.drainEvents();
  return m;
}

describe('Satu Tali phone views', () => {
  it('gives the Host a picture for every route; others watch it locked', () => {
    const host = pickView({ route: 'bambu', isHost: true, hostName: 'Rina', humans: 2, best: { senja: 75 } });
    expect(host.kind).toBe('menu');
    if (host.kind !== 'menu') return;
    expect(host.options.map((o) => o.thumb)).toEqual([...ROUTES]);
    for (const o of host.options) expect(THUMBS[o.thumb!]!()).toContain('<svg');
    expect(host.options[0]!.sub).toContain('1:15');
    expect(host.selected).toBe('bambu');
    const guest = pickView({ route: 'bambu', isHost: false, hostName: 'Rina', humans: 2, best: {} });
    expect(guest.kind === 'menu' && guest.locked).toBe(true);
    expect(guest.kind === 'menu' && guest.confirm).toBeUndefined();
  });

  it('shows the joystick with LOMPAT and PEGANG, plus LEMPAR when alone', () => {
    const team = climbing(2);
    const v = viewFor({ match: team, id: 1, guests: [], sinceWipe: Infinity, titles: new Map() });
    expect(v.kind === 'pad' && v.buttons?.map((b) => b.id)).toEqual(['jump', 'grip']);
    expect(v.kind === 'pad' && v.buttons?.[1]?.press).toBe('hold');
    const solo = climbing(1);
    const s = viewFor({ match: solo, id: 1, guests: [], sinceWipe: Infinity, titles: new Map() });
    expect(s.kind === 'pad' && s.buttons?.map((b) => b.id)).toEqual(['jump', 'grip', 'throw']);
    expect(s.kind === 'pad' && s.hint).toContain('Karung');
    expect(solo.sim.body(SACK_ID)).toBeDefined();
  });

  it('turns LOMPAT into PANJAT and warns teammates while someone hangs', () => {
    const m = climbing(2);
    m.climber(2)!.hanging = true;
    const me = viewFor({ match: m, id: 2, guests: [], sinceWipe: Infinity, titles: new Map() });
    expect(me.kind === 'pad' && me.buttons?.[0]?.label).toBe('PANJAT');
    const mate = viewFor({ match: m, id: 1, guests: [], sinceWipe: Infinity, titles: new Map() });
    expect(mate.kind === 'pad' && mate.alert?.title).toBe('Temanmu jatuh!');
  });

  it('lets a fifth phone cheer from the side', () => {
    const m = climbing(2);
    const v = viewFor({ match: m, id: 9, guests: [], sinceWipe: Infinity, titles: new Map() });
    expect(v.kind === 'message' && v.reactions).toBe(true);
  });
});
