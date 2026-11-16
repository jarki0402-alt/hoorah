import { describe, expect, it } from 'vitest';
import { jumpShape, speedAt, timeAtDistance } from './logic';
import { FIRST_ROW, type Obstacle, Track } from './track';

const shape = jumpShape();
const make = (seed: number) =>
  new Track({
    seed,
    speedAt: (d) => speedAt(timeAtDistance(d)),
    airTime: shape.airTime,
    jumpPeak: shape.peak,
  });
const vAt = (d: number) => speedAt(timeAtDistance(d));

function rows(t: Track): Map<number, Obstacle[]> {
  const out = new Map<number, Obstacle[]>();
  for (const o of t.obstacles) {
    const list = out.get(o.row) ?? [];
    list.push(o);
    out.set(o.row, list);
  }
  return out;
}

describe('track generation', () => {
  it('is deterministic per seed and differs between seeds', () => {
    const a = make(7);
    const b = make(7);
    const c = make(8);
    a.ensure(2000);
    b.ensure(2000);
    c.ensure(2000);
    const sig = (t: Track) => t.obstacles.map((o) => `${o.kind}${o.lane}${o.d.toFixed(2)}`).join('|');
    expect(sig(a)).toBe(sig(b));
    expect(sig(a)).not.toBe(sig(c));
  });

  it('keeps obstacles and coins sorted, roofs contiguous or separated by a gap', () => {
    const t = make(3);
    t.ensure(4000);
    for (let i = 1; i < t.obstacles.length; i++)
      expect(t.obstacles[i]!.d).toBeGreaterThanOrEqual(t.obstacles[i - 1]!.d);
    for (let i = 1; i < t.coins.length; i++) expect(t.coins[i]!.d).toBeGreaterThanOrEqual(t.coins[i - 1]!.d);
    const gaps = t.obstacles.filter((o) => o.kind === 'gap');
    for (let i = 1; i < t.roofs.length; i++) {
      const prev = t.roofs[i - 1]!;
      const cur = t.roofs[i]!;
      if (cur.start === prev.end) continue;
      const gap = gaps.find((g) => Math.abs(g.d - g.len / 2 - prev.end) < 1e-6);
      expect(gap, `gap after roof ${prev.id}`).toBeDefined();
      expect(gap!.d + gap!.len / 2).toBeCloseTo(cur.start, 6);
    }
    expect(gaps.length).toBeGreaterThan(10);
  });

  it('starts calm and always leaves a lane without a block', () => {
    for (const seed of [1, 2, 3, 4, 5, 99, 1234]) {
      const t = make(seed);
      t.ensure(5000);
      const first = t.obstacles[0]!;
      expect(first.d - first.len / 2).toBeGreaterThanOrEqual(FIRST_ROW - 1e-6);
      for (const [row, list] of rows(t)) {
        if (list[0]!.kind === 'gap') continue;
        const blocked = new Set(list.filter((o) => o.kind === 'block').map((o) => o.lane));
        expect(blocked.size, `row ${row} (seed ${seed})`).toBeLessThan(3);
        for (const o of list) if (o.kind === 'block') expect(o.span).toBe(1);
      }
    }
  });

  it('spaces rows by at least a second at the speed of the pack there', () => {
    const t = make(11);
    t.ensure(6000);
    const list = [...rows(t).values()].map((os) => ({
      front: Math.min(...os.map((o) => o.d - o.len / 2)),
      back: Math.max(...os.map((o) => o.d + o.len / 2)),
      gap: os[0]!.kind === 'gap',
    }));
    list.sort((a, b) => a.front - b.front);
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1]!;
      const b = list[i]!;
      const seconds = (b.front - a.back) / vAt(b.front);
      // Rows before a gap keep a full second; landing after a gap keeps ~0.9 s.
      expect(seconds, `rows at ${a.back.toFixed(1)} and ${b.front.toFixed(1)}`).toBeGreaterThanOrEqual(
        a.gap || b.gap ? 0.85 : 1.0,
      );
    }
  });

  it('makes every gap at most half a jump long', () => {
    const t = make(21);
    t.ensure(8000);
    for (const g of t.obstacles.filter((o) => o.kind === 'gap')) {
      const reach = vAt(g.d - g.len / 2) * shape.airTime;
      expect(g.len).toBeLessThanOrEqual(reach * 0.5 + 1e-9);
      expect(g.len).toBeGreaterThanOrEqual(2.2 - 1e-9);
    }
  });

  it('never puts a reachable coin inside a block or low over a gap', () => {
    const t = make(5);
    t.ensure(5000);
    const blocks = t.obstacles.filter((o) => o.kind === 'block');
    const gaps = t.obstacles.filter((o) => o.kind === 'gap');
    for (const c of t.coins) {
      for (const b of blocks)
        if (b.lane === c.lane)
          expect(Math.abs(c.d - b.d) >= b.len / 2, `coin ${c.id} in block ${b.id}`).toBe(true);
      for (const g of gaps) if (Math.abs(c.d - g.d) < g.len / 2) expect(c.y).toBeGreaterThan(1.2);
    }
  });

  it('prunes what is behind', () => {
    const t = make(9);
    t.ensure(3000);
    const before = t.obstacles.length;
    t.prune(1500);
    expect(t.obstacles.length).toBeLessThan(before);
    expect(t.obstacles.every((o) => o.d + o.len / 2 >= 1500 - 8)).toBe(true);
    expect(t.roofs.every((r) => r.end >= 1500)).toBe(true);
    expect(t.coins.every((c) => c.d >= 1500)).toBe(true);
    expect(t.gapAt(-50)).toBeNull();
  });
});
