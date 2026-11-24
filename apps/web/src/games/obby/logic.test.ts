import { type Fruit, lookOfFruit } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { rng } from '../../shared/kotak/math';
import { RunnerBrain } from './brain';
import { buildCourse } from './course';
import { ObbyMatch, PLACE_POINTS, type RacerInfo, splitRects, stickToCourse, TIMING } from './logic';

const FRUITS: Fruit[] = ['jeruk', 'semangka', 'durian', 'nanas', 'mangga', 'stroberi', 'alpukat', 'rambutan'];

function racers(n: number, cpu = false): RacerInfo[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `P${i + 1}`,
    fruit: FRUITS[i]!,
    look: lookOfFruit(FRUITS[i]!),
    color: '#FF8A3D',
    cpu,
  }));
}

const DT = 1 / 60;

function runUntil(m: ObbyMatch, done: () => boolean, maxSeconds: number): void {
  for (let i = 0; i < maxSeconds / DT && !done(); i++) m.tick(DT);
}

describe('courses', () => {
  it('are the same for the same seed and differ per track', () => {
    const a = buildCourse(1, 42);
    const b = buildCourse(1, 42);
    expect(a.solids).toEqual(b.solids);
    expect(buildCourse(0, 42).segments.map((s) => s.kind)).not.toEqual(a.segments.map((s) => s.kind));
  });

  it('have a start, six save pads and a finish, in order along the run', () => {
    for (let no = 0; no < 3; no++) {
      const c = buildCourse(no, 7);
      expect(c.saves).toHaveLength(7);
      expect(c.segments).toHaveLength(7);
      for (let i = 1; i < c.saves.length; i++)
        expect(c.saves[i]!.pos.x).toBeGreaterThan(c.saves[i - 1]!.pos.x);
      expect(c.finishX).toBeGreaterThan(c.saves[6]!.pos.x);
      expect(c.solids.some((s) => s.role === 'finish')).toBe(true);
      expect(c.killY).toBeLessThan(-5);
    }
    expect(buildCourse(0, 99).segments[0]!.kind).toBe('islands');
  });
});

describe('obby race', () => {
  it('runs intro, countdown and race, then holds still runners at the start', () => {
    const m = new ObbyMatch({ racers: racers(2), tracks: 1, seed: 1 });
    expect(m.phase).toBe('intro');
    expect(m.drainEvents()[0]).toEqual({ k: 'track', no: 0 });
    m.steer(1, 1, 0);
    runUntil(m, () => m.phase === 'race', 10);
    const kinds = m.drainEvents().map((e) => e.k);
    expect(kinds.filter((k) => k === 'count')).toHaveLength(3);
    expect(kinds).toContain('go');
    // Input before GO is ignored.
    expect(m.sim.body(1)!.pos.x).toBeLessThan(0);
  });

  it('respawns a fallen runner on their own save pad', () => {
    const m = new ObbyMatch({ racers: racers(1), tracks: 1, seed: 3 });
    runUntil(m, () => m.phase === 'race', 10);
    m.drainEvents();
    const b = m.sim.body(1)!;
    m.sim.place(1, { x: b.pos.x, y: m.course.killY + 0.5, z: 20 });
    runUntil(m, () => m.racer(1)!.stats.falls > 0, 2);
    expect(m.racer(1)!.stats.falls).toBe(1);
    expect(b.pos.x).toBeLessThan(0);
    expect(b.frozenLeft).toBeGreaterThan(0);
    expect(m.drainEvents().some((e) => e.k === 'fall')).toBe(true);
  });

  it('brings a straggler off the shared screen for 2 s to the save pad near the pack, frozen 1 s', () => {
    // Five people share one pack camera; fewer each have a camera of their own (never pulled).
    const m = new ObbyMatch({ racers: racers(5), tracks: 1, seed: 5 });
    expect(m.shared).toBe(true);
    runUntil(m, () => m.phase === 'race', 10);
    const leadPad = m.course.saves[3]!;
    // The leader stands on save pad 3; the straggler waits at the start.
    m.sim.place(1, { x: leadPad.pos.x, y: leadPad.pos.y, z: 0 });
    m.drainEvents();
    runUntil(m, () => m.racer(2)!.stats.pulls > 0, TIMING.offscreen + 3);
    const r2 = m.racer(2)!;
    expect(r2.stats.pulls).toBe(1);
    expect(m.trail.of(2)).toBe(3);
    const b2 = m.sim.body(2)!;
    expect(Math.abs(b2.pos.x - leadPad.pos.x)).toBeLessThan(leadPad.hx + 0.01);
    expect(b2.frozenLeft).toBeGreaterThan(0.9);
    expect(m.drainEvents().some((e) => e.k === 'pulled' && e.id === 2)).toBe(true);
  });

  it('scores places, gives half points to unfinished runners and ends after the last track', () => {
    const m = new ObbyMatch({ racers: racers(3), tracks: 1, seed: 9 });
    runUntil(m, () => m.phase === 'race', 10);
    const finish = m.sim.solids.find((s) => s.def.role === 'finish')!;
    const top = finish.def.pos.y + finish.def.half.y;
    m.sim.place(2, { x: finish.def.pos.x, y: top, z: 0 });
    runUntil(m, () => m.racer(2)!.finishedAt !== null, 1);
    expect(m.racer(2)!.place).toBe(1);
    expect(m.drainEvents().some((e) => e.k === 'hurry')).toBe(true);
    runUntil(m, () => m.phase === 'podium', TIMING.afterFirst + 2);
    expect(m.lastResults[0]).toMatchObject({ id: 2, place: 1, points: PLACE_POINTS[0] });
    expect(m.lastResults[1]!.points).toBe(Math.floor(PLACE_POINTS[1] / 2));
    runUntil(m, () => m.phase === 'done', TIMING.podium + 1);
    expect(m.phase).toBe('done');
    expect(m.sessionStandings()[0]!.id).toBe(2);
  });

  it('computer runners can finish every track of a session', () => {
    const m = new ObbyMatch({ racers: racers(4, true), tracks: 3, seed: 2026 });
    let seed = 1;
    for (const r of m.racers) m.setPilot(r.id, new RunnerBrain(0.9, rng(seed++)));
    const finishers: number[] = [];
    const times: number[] = [];
    let track = 0;
    for (let i = 0; i < (3 * 130) / DT && m.phase !== 'done'; i++) {
      m.tick(DT);
      for (const e of m.drainEvents()) {
        if (e.k === 'finish' && e.place === 1) times.push(e.time);
        if (e.k === 'trackEnd') {
          finishers[track] = e.results.filter((r) => r.time !== null).length;
          track++;
        }
      }
    }
    expect(m.phase).toBe('done');
    expect(finishers).toHaveLength(3);
    for (const n of finishers) expect(n).toBeGreaterThan(0);
    // Each track is a short race: the winner needs well under the time limit.
    for (const t of times) {
      expect(t).toBeGreaterThan(20);
      expect(t).toBeLessThan(TIMING.raceMax);
    }
  });
});

describe('obby cameras (split screen, looking forward)', () => {
  it('gives each of up to four people a part of the screen, with the pack in the fourth part for three', () => {
    expect(new ObbyMatch({ racers: racers(1), tracks: 1, seed: 1 }).views.map((v) => v.id)).toEqual([1]);
    expect(new ObbyMatch({ racers: racers(2), tracks: 1, seed: 1 }).views.map((v) => v.id)).toEqual([1, 2]);
    expect(new ObbyMatch({ racers: racers(3), tracks: 1, seed: 1 }).views.map((v) => v.id)).toEqual([
      1,
      2,
      3,
      null,
    ]);
    expect(new ObbyMatch({ racers: racers(4), tracks: 1, seed: 1 }).views).toHaveLength(4);
    expect(new ObbyMatch({ racers: racers(6), tracks: 1, seed: 1 }).views.map((v) => v.id)).toEqual([null]);
    // Computer opponents never get a part: one person playing alone fills the screen.
    const solo = new ObbyMatch({ racers: [...racers(1), ...racers(3, true).slice(1)], tracks: 1, seed: 1 });
    expect(solo.views.map((v) => v.id)).toEqual([1]);
  });

  it('splits the screen into halves and quarters that cover it exactly once', () => {
    for (const n of [1, 2, 4]) {
      const area = splitRects(n).reduce((a, r) => a + r.w * r.h, 0);
      expect(area).toBeCloseTo(1, 6);
    }
    expect(splitRects(2).map((r) => r.x)).toEqual([0, 0.5]);
  });

  it('re-lays the screen out when someone joins or leaves', () => {
    const m = new ObbyMatch({ racers: racers(2), tracks: 1, seed: 1 });
    m.addRacer(racers(3)[2]!);
    expect(m.views.map((v) => v.id)).toEqual([1, 2, 3, null]);
    m.removeRacer(3);
    expect(m.views.map((v) => v.id)).toEqual([1, 2]);
  });

  it('steers seen from behind: stick up runs forward along the course, right goes right', () => {
    expect(stickToCourse(0, -1)).toEqual({ x: 1, z: 0 });
    expect(stickToCourse(1, 0)).toEqual({ x: -0, z: 1 });
    const m = new ObbyMatch({ racers: racers(1), tracks: 1, seed: 2 });
    runUntil(m, () => m.phase === 'race', 10);
    const x0 = m.sim.body(1)!.pos.x;
    for (let i = 0; i < 30; i++) {
      m.steer(1, 0, -1);
      m.tick(DT);
    }
    expect(m.sim.body(1)!.pos.x).toBeGreaterThan(x0 + 0.5);
  });
});

describe('obby follow camera', () => {
  it('keeps its own runner whole in the picture, feet to head', () => {
    const m = new ObbyMatch({ racers: racers(2), tracks: 1, seed: 4 });
    runUntil(m, () => m.phase === 'race', 10);
    for (let i = 0; i < 60; i++) m.tick(DT);
    for (const v of m.views) {
      const b = m.sim.body(v.id!)!;
      expect(v.cam.visible(b.pos)).toBe(true);
      expect(v.cam.visible({ x: b.pos.x, y: b.pos.y + 1.6, z: b.pos.z })).toBe(true);
    }
  });
});
