import { lookAt, lookOfFruit } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { rng } from '../../shared/kotak/math';
import { buildSection, isRouteId, levelOf, ROUTES, sectionPlan } from './course';
import { type ClimberInfo, SACK_ID, starsFor, type TaliEvent, TaliMatch, TIMING } from './logic';

const people = (n: number): ClimberInfo[] =>
  (['jeruk', 'semangka', 'alpukat', 'nanas'] as const).slice(0, n).map((fruit, i) => ({
    id: i + 1,
    name: `P${i + 1}`,
    fruit,
    look: lookOfFruit(fruit),
    color: ['#2F8CFF', '#F2453D', '#22B35E', '#FFC928'][i]!,
  }));

const STEP = 1 / 60;

function run(m: TaliMatch, seconds: number, each?: () => void): TaliEvent[] {
  const out: TaliEvent[] = [];
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    each?.();
    m.tick(STEP);
    out.push(...m.drainEvents());
  }
  return out;
}

function toClimb(m: TaliMatch): void {
  run(m, TIMING.intro + TIMING.count + 0.1);
  expect(m.phase).toBe('climb');
}

/** Stand every climber on the finish pad. */
function onFinish(m: TaliMatch): void {
  const pad = m.section.solids[m.section.finish]!;
  m.climbers.forEach((c, i) => {
    m.sim.place(c.id, { x: pad.pos.x - 1 + i * 0.9, y: pad.pos.y + pad.half.y + 0.02, z: 0 }, 0);
  });
  if (m.sack) m.sim.place(SACK_ID, { x: pad.pos.x + 1.5, y: pad.pos.y + pad.half.y + 0.02, z: 1 }, 0);
}

describe('Satu Tali courses', () => {
  it('builds sections with a start pad, a save pad, a finish pad and a floor of death below', () => {
    for (const route of ROUTES)
      for (let no = 0; no < 6; no++) {
        const s = buildSection(route, no, 6, 1234);
        expect(s.saves).toHaveLength(2);
        expect(s.solids[s.saves[0]!.solid]!.role).toBe('checkpoint');
        expect(s.solids[s.finish]!.role).toBe('finish');
        expect(s.segments).toHaveLength(3);
        for (const d of s.solids) expect(d.pos.y - d.half.y).toBeGreaterThan(s.killY);
        expect(s.finishX).toBeGreaterThan(s.startX + 10);
        expect(s.par).toBeGreaterThan(30);
      }
  });

  it('warms up, escalates and ends on the climbing wall', () => {
    expect([0, 1, 2, 3, 4, 5].map((n) => levelOf(n, 6))).toEqual([0, 0, 1, 1, 2, 2]);
    const last = sectionPlan('senja', 5, 6, rng(9));
    expect(last[last.length - 1]).toBe('climb');
    expect(sectionPlan('bambu', 0, 6, rng(3))).not.toContain('climb');
    expect(sectionPlan('bambu', 3, 6, rng(3))).toContain('beam');
  });

  it('is deterministic for the same seed', () => {
    expect(buildSection('salju', 2, 6, 77)).toEqual(buildSection('salju', 2, 6, 77));
    expect(isRouteId('senja')).toBe(true);
    expect(isRouteId('mars')).toBe(false);
  });

  it('rates sections with stars', () => {
    expect(starsFor(40, 0, 50)).toBe(3);
    expect(starsFor(60, 1, 50)).toBe(2);
    expect(starsFor(200, 5, 50)).toBe(1);
  });
});

describe('Satu Tali match', () => {
  it('carries each climber look and restyles it', () => {
    const m = new TaliMatch({ climbers: people(2), route: 'senja', sections: 1, seed: 1 });
    expect(m.climber(1)!.look).toEqual(lookOfFruit('jeruk'));
    m.restyle(1, { look: lookAt(5) });
    expect(m.climber(1)!.look).toEqual(lookAt(5));
    expect(m.climber(2)!.look).toEqual(lookOfFruit('semangka'));
  });

  it('ties a lone climber to a sandbag, and a team only to each other', () => {
    const solo = new TaliMatch({ climbers: people(1), route: 'senja', sections: 3, seed: 1 });
    expect(solo.sack).toBe(true);
    expect(solo.chainIds()).toEqual([1, SACK_ID]);
    expect(solo.sim.body(SACK_ID)).toBeDefined();
    const team = new TaliMatch({ climbers: people(3), route: 'senja', sections: 3, seed: 1 });
    expect(team.sack).toBe(false);
    expect(team.chainIds()).toEqual([1, 2, 3]);
    expect(team.rope.links).toHaveLength(2);
  });

  it('runs intro, countdown and then the climb', () => {
    const m = new TaliMatch({ climbers: people(2), route: 'bambu', sections: 2, seed: 5 });
    const ev = run(m, TIMING.intro + TIMING.count + 0.1);
    expect(ev.filter((e) => e.k === 'count').map((e) => (e as { value: number }).value)).toEqual([3, 2, 1]);
    expect(ev.some((e) => e.k === 'go')).toBe(true);
    expect(m.phase).toBe('climb');
  });

  it('sends the whole team back to the save pad when someone falls off', () => {
    const m = new TaliMatch({ climbers: people(2), route: 'senja', sections: 2, seed: 2 });
    toClimb(m);
    m.sim.place(2, { x: 0, y: m.section.killY - 1, z: 0 }, 0);
    const ev = run(m, 0.2);
    expect(ev.some((e) => e.k === 'wipe' && e.id === 2)).toBe(true);
    expect(m.wipes).toBe(1);
    expect(m.climber(2)!.stats.falls).toBe(1);
    const start = m.section.saves[0]!.pos;
    for (const c of m.climbers) expect(Math.abs(m.sim.body(c.id)!.pos.x - start.x)).toBeLessThan(3.6);
  });

  it('raises the flag when everyone stands on the finish pad, then loads the next section', () => {
    const m = new TaliMatch({ climbers: people(2), route: 'senja', sections: 2, seed: 3 });
    toClimb(m);
    onFinish(m);
    const ev = run(m, 1);
    const flag = ev.find((e) => e.k === 'flag');
    expect(flag).toBeDefined();
    if (flag?.k === 'flag') {
      expect(flag.result.done).toBe(true);
      expect(flag.result.stars).toBe(3);
    }
    expect(m.phase).toBe('flag');
    const next = run(m, TIMING.flag);
    expect(next.some((e) => e.k === 'section' && e.no === 1)).toBe(true);
    expect(m.sectionNo).toBe(1);
  });

  it('a gripping teammate catches a friend who falls off the side', () => {
    const m = new TaliMatch({ climbers: people(2), route: 'senja', sections: 2, seed: 4 });
    toClimb(m);
    m.sim.place(1, { x: -3.5, y: 0.02, z: 0.4 }, 0);
    m.sim.place(2, { x: -3.5, y: 0.02, z: 3.7 }, 0);
    m.hold(1, true);
    const ev = run(m, 2.5);
    const c = ev.find((e) => e.k === 'catch');
    expect(c).toBeDefined();
    if (c?.k === 'catch') {
      expect(c.id).toBe(2);
      expect(c.by).toEqual([1]);
    }
    expect(m.climber(1)!.stats.catches).toBe(1);
    expect(m.climber(2)!.hanging).toBe(true);
    expect(m.catches).toBe(1);
    // Hand over hand back up: the friend reaches the lip and scrambles over.
    const up = run(m, 4, () => m.jump(2));
    expect(up.some((e) => e.k === 'ropeClimb')).toBe(true);
    expect(m.sim.body(2)!.pos.y).toBeGreaterThan(-0.3);
  });

  it('climbs a wall while holding PEGANG', () => {
    const m = new TaliMatch({ climbers: people(1), route: 'senja', sections: 2, seed: 8 });
    toClimb(m);
    onFinish(m);
    run(m, 1 + TIMING.flag + TIMING.intro + TIMING.count + 0.2);
    expect(m.sectionNo).toBe(1);
    expect(m.phase).toBe('climb');
    const wall = m.section.solids.find((d) => d.look === 'climb')!;
    expect(wall).toBeDefined();
    const top = wall.pos.y + wall.half.y;
    const x = wall.pos.x - wall.half.x - 0.4;
    const floor = m.sim.supportAt(x, 0, top - 1)!;
    m.sim.place(1, { x, y: floor + 0.02, z: 0 }, Math.PI / 2);
    m.sim.place(SACK_ID, { x: x - 1.5, y: floor + 0.02, z: 0 }, 0);
    m.hold(1, true);
    const ev = run(m, 3, () => m.steer(1, 1, 0));
    expect(ev.some((e) => e.k === 'climbUp')).toBe(true);
    expect(m.climber(1)!.stats.climbs).toBe(1);
    expect(m.sim.body(1)!.pos.y).toBeGreaterThan(top - 0.6);
  });

  it('throws the sandbag ahead when it is within reach', () => {
    const m = new TaliMatch({ climbers: people(1), route: 'salju', sections: 1, seed: 6 });
    toClimb(m);
    m.sim.place(1, { x: -2, y: 0.02, z: 0 }, Math.PI / 2);
    m.sim.place(SACK_ID, { x: -3, y: 0.02, z: 0 }, 0);
    run(m, 0.1);
    expect(m.canThrow(1)).toBe(true);
    expect(m.throwSack(1)).toBe(true);
    const ev = run(m, 0.6);
    expect(ev.some((e) => e.k === 'throw')).toBe(true);
    expect(m.sim.body(SACK_ID)!.pos.x).toBeGreaterThan(-1);
    expect(m.climber(1)!.stats.throws).toBe(1);
    m.sim.place(SACK_ID, { x: -6, y: 0.02, z: 0 }, 0);
    expect(m.throwSack(1)).toBe(false);
  });

  it('alone, PEGANG reels a sandbag hanging over the side back up onto the pad', () => {
    const m = new TaliMatch({ climbers: people(1), route: 'senja', sections: 1, seed: 11 });
    toClimb(m);
    m.sim.place(1, { x: -3.5, y: 0.02, z: 0.4 }, 0);
    m.sim.place(SACK_ID, { x: -3.5, y: 0.02, z: 3.7 }, 0);
    // Gripping, the sandbag cannot drag you over; it reels in at once.
    m.hold(1, true);
    run(m, 0.5);
    expect(m.sim.body(SACK_ID)!.pos.y).toBeLessThan(-0.5);
    run(m, 4);
    const s = m.sim.body(SACK_ID)!;
    expect(s.pos.y).toBeGreaterThan(-0.1);
    expect(s.pos.z).toBeLessThan(3.2);
    expect(m.sim.body(1)!.ground).toBeGreaterThanOrEqual(0);
  });

  it('counts jumps together as kompak', () => {
    const m = new TaliMatch({ climbers: people(2), route: 'senja', sections: 1, seed: 7 });
    toClimb(m);
    m.jump(1);
    m.jump(2);
    const ev = run(m, 0.3);
    expect(ev.some((e) => e.k === 'sync')).toBe(true);
    expect(m.climber(1)!.stats.syncJumps).toBe(1);
    expect(m.climber(2)!.stats.syncJumps).toBe(1);
  });

  it('moves on with no stars when time runs out, and ends after the last section', () => {
    const m = new TaliMatch({ climbers: people(2), route: 'senja', sections: 1, seed: 9 });
    toClimb(m);
    const ev = run(m, TIMING.sectionMax + 0.2);
    const flag = ev.find((e) => e.k === 'flag');
    expect(flag?.k === 'flag' && flag.result.stars).toBe(0);
    expect(ev.filter((e) => e.k === 'second')).toHaveLength(10);
    const end = run(m, TIMING.flag + 0.1);
    expect(end.some((e) => e.k === 'done')).toBe(true);
    expect(m.phase).toBe('done');
  });

  it('adds and removes climbers on the rope', () => {
    const m = new TaliMatch({ climbers: people(2), route: 'senja', sections: 2, seed: 10 });
    m.addClimber(people(3)[2]!);
    expect(m.chainIds()).toEqual([1, 2, 3]);
    m.removeClimber(2);
    expect(m.chainIds()).toEqual([1, 3]);
    expect(m.sim.body(2)).toBeUndefined();
    m.setOffline(3, true);
    m.steer(3, 1, 0);
    expect(m.climber(3)!.sx).toBe(0);
  });
});
