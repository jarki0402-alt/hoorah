import { lookOfFruit } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { THUMBS } from '../../controller/thumbs/bom';
import { v3 } from '../../shared/kotak/math';
import { ARENAS } from './arena';
import { BomMatch, RULES } from './logic';
import { pickView, viewFor } from './views';

const runners = (n: number) =>
  (['jeruk', 'semangka', 'alpukat'] as const)
    .slice(0, n)
    .map((fruit, i) => ({ id: i + 1, name: `P${i + 1}`, fruit, look: lookOfFruit(fruit), color: '#2F8CFF' }));

function playing(n: number): BomMatch {
  const m = new BomMatch({ runners: runners(n), arena: 'halaman', rounds: 5, seed: 3 });
  for (let i = 0; i < (RULES.intro + RULES.drop + 0.4) * 60; i++) m.tick(1 / 60);
  m.drainEvents();
  return m;
}

describe('Bom Oper phone views', () => {
  it('gives the Host a picture for every arena', () => {
    const v = pickView({ arena: 'pasar', isHost: true, hostName: 'Rina' });
    expect(v.kind === 'menu' && v.options.map((o) => o.thumb)).toEqual([...ARENAS]);
    for (const id of ARENAS) expect(THUMBS[id]!()).toContain('<svg');
    const g = pickView({ arena: 'pasar', isHost: false, hostName: 'Rina' });
    expect(g.kind === 'menu' && g.locked).toBe(true);
  });

  it('lights OPER with "Dekat!" only while holding the bomb next to someone', () => {
    const m = playing(2);
    const holder = m.bombs[0]!.holder;
    const other = holder === 1 ? 2 : 1;
    m.sim.place(holder, v3(-3, 0.02, 1.5), 0);
    m.sim.place(other, v3(-8, 0.02, 1.5), 0);
    const far = viewFor({ match: m, id: holder, guests: [], titles: new Map() });
    expect(far.kind === 'pad' && far.buttons?.[0]?.sub).toBe('kejar teman');
    m.sim.place(other, v3(-2, 0.02, 1.5), 0);
    const near = viewFor({ match: m, id: holder, guests: [], titles: new Map() });
    expect(near.kind === 'pad' && near.buttons?.[0]).toMatchObject({ tone: 'orange', sub: 'Dekat!' });
    const runner = viewFor({ match: m, id: other, guests: [], titles: new Map() });
    expect(runner.kind === 'pad' && runner.buttons?.[0]?.tone).toBe('cream');
    expect(runner.kind === 'pad' && runner.title).toContain('Kabur!');
  });

  it('never shows the fuse time, and lets a knocked-out runner cheer', () => {
    const m = playing(3);
    const v = viewFor({ match: m, id: 1, guests: [], titles: new Map() });
    expect(JSON.stringify(v)).not.toMatch(/\d+(,\d)? ?dtk/);
    const r = m.runner(2)!;
    r.lives = 0;
    r.out = true;
    const out = viewFor({ match: m, id: 2, guests: [], titles: new Map() });
    expect(out.kind === 'message' && out.reactions).toBe(true);
  });
});
