import { describe, expect, it } from 'vitest';
import { DEFAULT_RIG, frameTarget, GroupCamera, onScreen } from './camera';
import { SaveTrail, spawnSpot } from './checkpoints';
import { v3 } from './math';
import { KotakSim, STEP } from './sim';
import { poseAt, surfaceVelocity } from './solids';

/** A 20 x 20 floor with its top at y = 0. */
function floorSim(): KotakSim {
  const sim = new KotakSim();
  sim.addSolid({ pos: v3(0, -0.5, 0), half: v3(10, 0.5, 10) });
  return sim;
}

const run = (sim: KotakSim, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / STEP); i++) sim.step();
};

describe('box world movement', () => {
  it('stands on the floor and runs at top speed quickly', () => {
    const sim = floorSim();
    const b = sim.addBody({ id: 1, pos: v3(0, 0, 0) });
    run(sim, 0.5);
    expect(b.ground).toBe(0);
    expect(b.pos.y).toBeCloseTo(0, 2);
    sim.setMove(1, 1, 0);
    run(sim, 0.25);
    expect(b.vel.x).toBeCloseTo(sim.tuning.speed, 1);
    expect(b.yaw).toBeCloseTo(Math.PI / 2, 3);
    expect(b.ground).toBe(0);
  });

  it('jumps about 1.9 m high and lands again', () => {
    const sim = floorSim();
    const b = sim.addBody({ id: 1, pos: v3(0, 0, 0) });
    run(sim, 0.1);
    sim.jump(1);
    let peak = 0;
    for (let i = 0; i < 90; i++) {
      sim.step();
      peak = Math.max(peak, b.pos.y);
    }
    expect(peak).toBeGreaterThan(1.7);
    expect(peak).toBeLessThan(2.3);
    expect(b.ground).toBe(0);
    const kinds = sim.drainEvents().map((e) => e.k);
    expect(kinds).toContain('jump');
    expect(kinds).toContain('land');
  });

  it('remembers a jump pressed just before landing (buffer)', () => {
    const sim = floorSim();
    const b = sim.addBody({ id: 1, pos: v3(0, 0.6, 0) });
    // Falling from 0.6 m takes about 0.19 s; press 0.1 s before touching down.
    run(sim, 0.09);
    expect(b.ground).toBe(-1);
    sim.jump(1);
    run(sim, 0.2);
    expect(b.vel.y > 0 || b.pos.y > 0.3).toBe(true);
  });

  it('still jumps a moment after running off an edge (coyote time)', () => {
    const sim = new KotakSim();
    sim.addSolid({ pos: v3(0, -0.5, 0), half: v3(2, 0.5, 2) });
    const b = sim.addBody({ id: 1, pos: v3(1.5, 0, 0) });
    run(sim, 0.05);
    sim.setMove(1, 1, 0);
    let left = -1;
    for (let i = 0; i < 60 && left < 0; i++) {
      sim.step();
      if (b.ground < 0) left = i;
    }
    expect(left).toBeGreaterThanOrEqual(0);
    sim.step();
    sim.step();
    sim.jump(1);
    sim.step();
    expect(b.vel.y).toBeGreaterThan(5);
  });

  it('falls off the world and reports it once', () => {
    const sim = new KotakSim({ killY: -3 });
    const b = sim.addBody({ id: 1, pos: v3(0, 0, 0) });
    run(sim, 1);
    expect(b.fallen).toBe(true);
    expect(sim.drainEvents().filter((e) => e.k === 'fall')).toHaveLength(1);
    sim.place(1, v3(0, 5, 0), 0, 1);
    expect(b.fallen).toBe(false);
    run(sim, 0.5);
    expect(b.pos.y).toBe(5); // frozen: no gravity
  });

  it('is pushed out of walls instead of walking through them', () => {
    const sim = floorSim();
    sim.addSolid({ pos: v3(3, 1, 0), half: v3(0.5, 1, 3) });
    const b = sim.addBody({ id: 1, pos: v3(0, 0, 0) });
    sim.setMove(1, 1, 0);
    run(sim, 1.5);
    expect(b.pos.x).toBeLessThanOrEqual(2.5 - sim.tuning.radius + 0.01);
    expect(b.pos.x).toBeGreaterThan(2);
  });

  it('climbs a low step without jumping but not a high one', () => {
    const sim = floorSim();
    sim.addSolid({ pos: v3(3, 0.1, 0), half: v3(1, 0.1, 2) }); // 0.2 m step
    sim.addSolid({ pos: v3(3, 0.5, 4), half: v3(1, 0.5, 1) }); // 1 m block
    const a = sim.addBody({ id: 1, pos: v3(0, 0, 0) });
    const b = sim.addBody({ id: 2, pos: v3(0, 0, 4) });
    sim.setMove(1, 1, 0);
    sim.setMove(2, 1, 0);
    run(sim, 0.6);
    expect(a.pos.y).toBeCloseTo(0.2, 2);
    expect(b.pos.y).toBeCloseTo(0, 2);
  });
});

describe('moving solids', () => {
  it('slides on a sine and reports the matching surface speed', () => {
    const def = {
      pos: v3(0, 0, 0),
      half: v3(1, 0.2, 1),
      motion: { type: 'slide' as const, offset: v3(0, 0, 3), period: 4 },
    };
    expect(poseAt(def, 1).z).toBeCloseTo(3, 5);
    expect(poseAt(def, 3).z).toBeCloseTo(-3, 5);
    const v = surfaceVelocity(def, 0, 0, 0);
    expect(v.z).toBeCloseTo((3 * Math.PI * 2) / 4, 5);
  });

  it('carries a body standing on a sliding platform', () => {
    const sim = new KotakSim();
    sim.addSolid({
      pos: v3(0, -0.25, 0),
      half: v3(1.5, 0.25, 1.5),
      motion: { type: 'slide', offset: v3(4, 0, 0), period: 8 },
    });
    const b = sim.addBody({ id: 1, pos: v3(0, 0, 0) });
    run(sim, 2);
    expect(b.ground).toBe(0);
    // One step of slide happens before the first landing.
    expect(Math.abs(b.pos.x - poseAt(sim.solids[0]!.def, sim.t).x)).toBeLessThan(0.1);
  });

  it('turns a body around with a spinning disc', () => {
    const sim = new KotakSim();
    sim.addSolid({
      pos: v3(0, -0.25, 0),
      half: v3(3, 0.25, 3),
      motion: { type: 'spin', speed: Math.PI / 2 },
    });
    const b = sim.addBody({ id: 1, pos: v3(2, 0, 0) });
    run(sim, 1);
    // A quarter turn counter-clockwise from above moves +x to -z.
    expect(b.pos.x).toBeCloseTo(0, 0);
    expect(b.pos.z).toBeCloseTo(-2, 0);
  });

  it('moves a body along a conveyor belt', () => {
    const sim = new KotakSim();
    sim.addSolid({ pos: v3(0, -0.25, 0), half: v3(10, 0.25, 2), conveyor: { x: -3, z: 0 } });
    const b = sim.addBody({ id: 1, pos: v3(0, 0, 0) });
    run(sim, 1);
    expect(b.pos.x).toBeCloseTo(-3, 0);
  });

  it('launches from a spring', () => {
    const sim = floorSim();
    sim.addSolid({ pos: v3(0, 0.1, 0), half: v3(0.8, 0.1, 0.8), spring: 18, role: 'spring' });
    const b = sim.addBody({ id: 1, pos: v3(0, 0.5, 0) });
    let peak = 0;
    for (let i = 0; i < 120; i++) {
      sim.step();
      peak = Math.max(peak, b.pos.y);
    }
    expect(peak).toBeGreaterThan(4);
    expect(sim.drainEvents().some((e) => e.k === 'spring')).toBe(true);
  });

  it('knocks a body away with a sweeper bar', () => {
    const sim = floorSim();
    sim.addSolid({
      pos: v3(0, 0.45, 0),
      half: v3(4, 0.2, 0.2),
      role: 'sweeper',
      motion: { type: 'spin', speed: 2.5 },
    });
    const b = sim.addBody({ id: 1, pos: v3(3, 0, 1.2) });
    run(sim, 1.6);
    expect(sim.drainEvents().some((e) => e.k === 'sweep')).toBe(true);
    expect(Math.hypot(b.pos.x - 3, b.pos.z - 1.2)).toBeGreaterThan(0.5);
  });

  it('crumbles fragile floor after it is stepped on, then brings it back', () => {
    const sim = new KotakSim({ killY: -50 });
    const tile = sim.addSolid({
      pos: v3(0, -0.25, 0),
      half: v3(1, 0.25, 1),
      fragile: { warn: 0.5, gone: 1 },
    });
    const b = sim.addBody({ id: 1, pos: v3(0, 0, 0) });
    sim.step();
    expect(tile.state).toBe('warn');
    run(sim, 0.6);
    expect(tile.state).toBe('gone');
    run(sim, 0.3);
    expect(b.ground).toBe(-1);
    expect(b.pos.y).toBeLessThan(-0.2);
    run(sim, 1);
    expect(tile.state).toBe('solid');
    const kinds = sim.drainEvents().map((e) => e.k);
    expect(kinds).toEqual(expect.arrayContaining(['crack', 'vanish', 'restore']));
  });

  it('answers where the ground is, now or later', () => {
    const sim = new KotakSim();
    sim.addSolid({
      pos: v3(0, -0.25, 0),
      half: v3(1, 0.25, 1),
      motion: { type: 'slide', offset: v3(5, 0, 0), period: 4 },
    });
    expect(sim.supportAt(0, 0, 1)).toBeCloseTo(0, 5);
    expect(sim.supportAt(5, 0, 1)).toBeNull();
    expect(sim.supportAt(5, 0, 1, 1)).toBeCloseTo(0, 5);
  });
});

describe('players together', () => {
  it('push each other apart and can be shoved', () => {
    const sim = floorSim();
    const a = sim.addBody({ id: 1, pos: v3(0, 0, 0) });
    const b = sim.addBody({ id: 2, pos: v3(0.2, 0, 0) });
    run(sim, 0.3);
    expect(Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z)).toBeGreaterThanOrEqual(
      sim.tuning.radius * 2 - 0.02,
    );
    sim.shove(2, 1, 0, 8, 1);
    expect(b.stunLeft).toBeGreaterThan(0);
    run(sim, 0.4);
    expect(b.pos.x).toBeGreaterThan(1.5);
    expect(sim.drainEvents().some((e) => e.k === 'shove' && e.by === 1)).toBe(true);
  });
});

describe('group camera', () => {
  it('frames every point and zooms out only up to the limit', () => {
    const rig = { ...DEFAULT_RIG, minDist: 10, maxDist: 30 };
    const near = [v3(-2, 0, 0), v3(2, 0, 0)];
    const t1 = frameTarget(rig, 16 / 9, near);
    expect(t1.dist).toBe(10);
    const wide = [v3(-14, 0, 0), v3(14, 0, 0)];
    const t2 = frameTarget(rig, 16 / 9, wide);
    expect(t2.dist).toBeGreaterThan(10);
    for (const p of wide) expect(onScreen(rig, t2, 16 / 9, p)).toBe(true);
    const huge = [v3(-200, 0, 0), v3(200, 0, 0)];
    expect(frameTarget(rig, 16 / 9, huge).dist).toBe(30);
    expect(onScreen(rig, frameTarget(rig, 16 / 9, huge), 16 / 9, huge[0]!)).toBe(false);
  });

  it('a 4:3 screen needs a bit more distance than 16:9 for a wide group', () => {
    const pts = [v3(-9, 0, 0), v3(9, 0, 0)];
    expect(frameTarget(DEFAULT_RIG, 4 / 3, pts).dist).toBeGreaterThan(
      frameTarget(DEFAULT_RIG, 16 / 9, pts).dist,
    );
  });

  it('follows smoothly and tells who is off screen', () => {
    const cam = new GroupCamera({ ...DEFAULT_RIG }, 16 / 9);
    cam.snap([v3(0, 0, 0)]);
    cam.update([v3(10, 0, 0)], 1 / 60);
    expect(cam.view.focus.x).toBeGreaterThan(0);
    expect(cam.view.focus.x).toBeLessThan(2);
    expect(cam.visible(v3(cam.view.focus.x, 0, 0))).toBe(true);
    expect(cam.visible(v3(cam.view.focus.x - 80, 0, 0))).toBe(false);
  });
});

describe('save points', () => {
  const pts = [0, 20, 40, 60].map((x, i) => ({ index: i, pos: v3(x, 0, 0), hx: 2, hz: 4, solid: 10 + i }));

  it('keeps the furthest pad and finds the one behind the pack', () => {
    const trail = new SaveTrail(pts);
    expect(trail.reach(1, 2)).toBe(true);
    expect(trail.reach(1, 1)).toBe(false);
    expect(trail.of(1)).toBe(2);
    expect(trail.nearestBehind(45).index).toBe(2);
    expect(trail.nearestBehind(5, 1).index).toBe(1);
    expect(trail.bySolid(13)).toBe(3);
  });

  it('spreads spawn spots over the pad', () => {
    const spots = Array.from({ length: 8 }, (_, i) => spawnSpot(pts[1]!, i));
    const keys = new Set(spots.map((s) => `${s.x.toFixed(2)},${s.z.toFixed(2)}`));
    expect(keys.size).toBe(8);
    for (const s of spots) {
      expect(Math.abs(s.x - 20)).toBeLessThan(2);
      expect(Math.abs(s.z)).toBeLessThan(4);
    }
  });
});
