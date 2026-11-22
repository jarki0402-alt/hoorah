import { describe, expect, it } from 'vitest';
import { SilumanMatch as Match, type SilumanMatch, TIMING } from './logic';
import { viewFor } from './views';

function setup(n = 6) {
  let now = 1_000;
  const m = new Match({
    seed: 5,
    now,
    players: Array.from({ length: n }, (_, i) => ({ id: i + 1, connected: true })),
  });
  const step = (ms: number) => {
    for (let left = ms; left > 0; left -= 250) {
      now += Math.min(250, left);
      m.tick(now);
    }
  };
  const ctx = {
    hostId: 1,
    name: (id: number) => `P${id}`,
    color: () => '#FFC928',
    showsCard: () => false,
  };
  return { m, step, ctx, at: () => now };
}

function toNight(g: ReturnType<typeof setup>) {
  g.m.start(g.at());
  g.m.skipIntro(g.at());
  for (const s of g.m.table) g.m.ready(s.id, g.at());
  g.step(TIMING.dealMinMs + TIMING.duskMs + 600);
  expect(g.m.calling).toBe('siluman');
}

const views = (m: SilumanMatch, ctx: ReturnType<typeof setup>['ctx']) =>
  m.table.map((s) => ({ s, v: viewFor(m, s.id, ctx)! }));

describe('Kampung Siluman phone views', () => {
  it('keeps every phone silent at night, and dark unless its role is called', () => {
    const g = setup();
    toNight(g);
    for (const { s, v } of views(g.m, g.ctx)) {
      expect(v.silent, `${s.role}`).toBe(true);
      if (s.role === 'siluman') expect(v.kind).toBe('menu');
      else expect(v).toMatchObject({ kind: 'message', dark: true });
    }
    g.step(TIMING.turnMs + TIMING.gapMs + 100);
    expect(g.m.calling).toBe('dukun');
    for (const { s, v } of views(g.m, g.ctx)) {
      expect(v.silent).toBe(true);
      expect(v.kind === 'menu').toBe(s.role === 'dukun');
    }
  });

  it('shows the role only on the player own card', () => {
    const g = setup();
    g.m.start(g.at());
    g.m.skipIntro(g.at());
    for (const { s, v } of views(g.m, g.ctx)) {
      expect(v.kind).toBe('peek');
      if (v.kind !== 'peek') continue;
      expect(v.word.toLowerCase()).toBe(s.role);
      for (const other of g.m.table) {
        if (other.id === s.id || other.role === s.role) continue;
        expect(JSON.stringify(v)).not.toContain(other.role.toUpperCase());
      }
    }
  });

  it('tells each siluman who the others are, and nobody else', () => {
    const g = setup(8);
    g.m.start(g.at());
    g.m.skipIntro(g.at());
    const sil = g.m.table.filter((s) => s.role === 'siluman');
    expect(sil).toHaveLength(2);
    const [a, b] = [sil[0]!, sil[1]!];
    const va = viewFor(g.m, a.id, g.ctx);
    expect(va?.kind === 'peek' && va.caption).toContain(`P${b.id}`);
    for (const s of g.m.table.filter((x) => x.role !== 'siluman' && x.role !== 'pengkhianat')) {
      const v = viewFor(g.m, s.id, g.ctx);
      expect(v?.kind === 'peek' && v.caption).not.toContain('Kawan');
    }
  });
});
