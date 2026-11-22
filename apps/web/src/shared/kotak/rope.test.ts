import { describe, expect, it } from 'vitest';
import { v3 } from './math';
import { Rope, RopeStrand } from './rope';
import { KotakSim, STEP } from './sim';

/** A ledge from x = -6 to x = 5 (top y = 0) over a deep drop. */
function ledge(): { sim: KotakSim; rope: Rope } {
  const sim = new KotakSim({ killY: -30 });
  sim.addSolid({ pos: v3(-0.5, -0.5, 0), half: v3(5.5, 0.5, 3) });
  const rope = new Rope();
  sim.afterStep = (dt) => rope.solve(sim, dt);
  return { sim, rope };
}

const run = (sim: KotakSim, seconds: number, each?: () => void) => {
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    each?.();
    sim.step();
  }
};

const dist = (sim: KotakSim, a: number, b: number) => {
  const A = sim.body(a)!.pos;
  const B = sim.body(b)!.pos;
  return Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z);
};

describe('rope links', () => {
  it('does nothing while slack', () => {
    const { sim, rope } = ledge();
    sim.addBody({ id: 1, pos: v3(-2, 0, 0) });
    sim.addBody({ id: 2, pos: v3(0, 0, 0) });
    rope.chain([1, 2]);
    run(sim, 1);
    expect(rope.tension[0]).toBe(0);
    expect(rope.strain(0)).toBe(0);
    expect(sim.body(1)!.pos.x).toBeCloseTo(-2, 3);
    expect(sim.body(2)!.pos.x).toBeCloseTo(0, 3);
  });

  it('never lets a link stretch far past its hard limit', () => {
    const { sim, rope } = ledge();
    sim.addBody({ id: 1, pos: v3(-5, 0, 0) });
    sim.addBody({ id: 2, pos: v3(-4, 0, 0) });
    rope.chain([1, 2]);
    let longest = 0;
    run(sim, 2, () => {
      sim.setMove(2, 1, 0);
      longest = Math.max(longest, dist(sim, 1, 2));
    });
    expect(longest).toBeLessThan(rope.tuning.max + 0.15);
    // The runner towed the one standing still along.
    expect(sim.body(1)!.pos.x).toBeGreaterThan(-4.5);
  });

  it('a gripping teammate catches a friend who walks off the edge', () => {
    const { sim, rope } = ledge();
    sim.addBody({ id: 1, pos: v3(2.5, 0, 0) });
    sim.addBody({ id: 2, pos: v3(5.6, 0, 0) });
    rope.chain([1, 2]);
    rope.setGrip(1, true);
    run(sim, 3);
    const a = sim.body(1)!;
    const b = sim.body(2)!;
    expect(a.ground).toBe(0);
    expect(a.pos.x).toBeLessThan(5);
    expect(b.ground).toBe(-1);
    expect(b.pos.y).toBeGreaterThan(-rope.tuning.max - 0.2);
    expect(Math.abs(b.vel.y)).toBeLessThan(1.5);
    expect(b.fallen).toBe(false);
  });

  it('a careless teammate standing still is dragged over the edge', () => {
    const { sim, rope } = ledge();
    sim.addBody({ id: 1, pos: v3(2.5, 0, 0) });
    sim.addBody({ id: 2, pos: v3(5.6, 0, 0) });
    rope.chain([1, 2]);
    run(sim, 4);
    expect(sim.body(1)!.pos.y).toBeLessThan(-2);
    expect(sim.body(2)!.pos.y).toBeLessThan(-2);
  });

  it('a gripping anchor holds a hanging friend through a teammate in the middle', () => {
    const { sim, rope } = ledge();
    sim.addBody({ id: 1, pos: v3(-1.5, 0, 0) });
    sim.addBody({ id: 2, pos: v3(1.5, 0, 0) });
    sim.addBody({ id: 3, pos: v3(5.6, 0, 0) });
    rope.chain([1, 2, 3]);
    rope.setGrip(1, true);
    run(sim, 3);
    expect(sim.body(1)!.ground).toBe(0);
    expect(sim.body(2)!.ground).toBe(0);
    expect(sim.body(3)!.fallen).toBe(false);
  });

  it('a heavy sandbag with good footing holds a hanging player', () => {
    const { sim, rope } = ledge();
    sim.addBody({ id: 9, pos: v3(2, 0, 0) });
    sim.addBody({ id: 1, pos: v3(5.6, 0, 0) });
    rope.chain([1, 9]);
    rope.setWeight(9, 0.5);
    rope.setHold(9, 40);
    run(sim, 3);
    expect(sim.body(9)!.ground).toBe(0);
    expect(sim.body(9)!.pos.x).toBeLessThan(5);
    expect(sim.body(1)!.pos.y).toBeGreaterThan(-6);
  });

  it('walking away while gripping hauls a hanging friend back up', () => {
    const { sim, rope } = ledge();
    sim.addBody({ id: 1, pos: v3(2.5, 0, 0) });
    sim.addBody({ id: 2, pos: v3(5.6, 0, 0) });
    rope.chain([1, 2]);
    rope.setGrip(1, true);
    run(sim, 2);
    expect(sim.body(2)!.pos.y).toBeLessThan(-1);
    run(sim, 4, () => sim.setMove(1, -0.5, 0));
    // Up to the lip: the game lets a hauled player scramble over from there.
    expect(sim.body(2)!.pos.y).toBeGreaterThan(-1.3);
    expect(sim.body(1)!.ground).toBe(0);
  });

  it('climbing hand over hand shortens a link and lifts the climber; it pays out again', () => {
    const { sim, rope } = ledge();
    sim.addBody({ id: 1, pos: v3(2.5, 0, 0) });
    sim.addBody({ id: 2, pos: v3(5.6, 0, 0) });
    rope.chain([1, 2]);
    rope.setGrip(1, true);
    run(sim, 2);
    const low = sim.body(2)!.pos.y;
    for (let i = 0; i < 3; i++) rope.shorten(0, 0.7);
    expect(rope.restOf(0)).toBeCloseTo(rope.tuning.rest - 2.1, 5);
    expect(rope.maxOf(0)).toBeCloseTo(rope.restOf(0) + rope.tuning.max - rope.tuning.rest, 5);
    run(sim, 1.5);
    expect(sim.body(2)!.pos.y).toBeGreaterThan(low + 0.6);
    for (let i = 0; i < 120; i++) rope.relax(0, 2, 1 / 60);
    expect(rope.links[0]!.rest).toBeUndefined();
    expect(rope.restOf(0)).toBe(rope.tuning.rest);
  });

  it('reports strain from slack to the hard limit', () => {
    const { sim, rope } = ledge();
    sim.addBody({ id: 1, pos: v3(-5, 0, 0) });
    sim.addBody({ id: 2, pos: v3(-1, 0, 0) });
    rope.chain([1, 2]);
    rope.setGrip(1, true);
    run(sim, 0.05);
    expect(rope.strain(0)).toBeGreaterThan(0.3);
    expect(rope.strain(0)).toBeLessThan(0.7);
    expect(rope.neighbours(2)).toEqual([1]);
    expect(rope.linkOf(2, 1)).toBe(0);
  });
});

describe('drawn rope', () => {
  it('pins both ends and sags while slack', () => {
    const s = new RopeStrand(8);
    const a = v3(0, 2, 0);
    const b = v3(2, 2, 0);
    for (let i = 0; i < 120; i++) s.update(a, b, 3, 1 / 60);
    expect(s.points[0]).toEqual(a);
    expect(s.points[8]).toEqual(b);
    expect(s.points[4]!.y).toBeLessThan(1.6);
  });

  it('rests on a floor instead of sinking through it', () => {
    const s = new RopeStrand(8);
    const a = v3(0, 0.6, 0);
    const b = v3(1, 0.6, 0);
    for (let i = 0; i < 120; i++) s.update(a, b, 4, 1 / 60, () => 0);
    for (const p of s.points) expect(p.y).toBeGreaterThanOrEqual(0.04);
  });

  it('is straight when pulled tight', () => {
    const s = new RopeStrand(6);
    const a = v3(0, 1, 0);
    const b = v3(5, 1, 0);
    for (let i = 0; i < 60; i++) s.update(a, b, 3, 1 / 60);
    for (const p of s.points) expect(p.y).toBeCloseTo(1, 1);
  });
});
