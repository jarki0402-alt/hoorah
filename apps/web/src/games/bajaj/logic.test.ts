import {
  DRIVE_BRAKE,
  DRIVE_GAS,
  DRIVE_LEFT,
  DRIVE_RIGHT,
  lookOfFruit,
  type PlayerInfo,
} from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { allowedSpeed, safeSpeed } from './ai';
import { getArena } from './arena';
import { buildRacers, cpuCount, layoutFor, parseLaps } from './driver';
import {
  CHECKPOINTS,
  COUNT_MS,
  FINISH_GRACE_MS,
  INTRO_MS,
  itemWeights,
  type Kart,
  type Mode,
  Race,
  type RaceEvent,
  type RacerSetup,
  RESULTS_MS,
  rampSteer,
  rollItem,
  STEP_MS,
  steerFromButtons,
  TUNE,
  yawCap,
} from './logic';
import { CIRCUITS, type CircuitId } from './maps/types';
import { buildResult, finalRows, pickAwards } from './results';
import { formatDelta, formatTime, STR } from './strings';
import { ROAD_HALF, WALL_DEFAULT, WALL_FLYOVER } from './track';
import { BRIDGE_HEIGHT, getTrack, PIER_HEIGHT } from './tracks';
import { driveView, kartMenu, modeMenu, postMenu } from './views';

const DT = 1 / 60;

function racers(humans: number, cpus: number): RacerSetup[] {
  const out: RacerSetup[] = [];
  for (let i = 0; i < cpus; i++)
    out.push({
      id: -(i + 1),
      human: false,
      name: `CPU${i}`,
      color: '#22B35E',
      fruit: 'jeruk',
      look: lookOfFruit('jeruk'),
    });
  for (let i = 0; i < humans; i++)
    out.push({
      id: i + 1,
      human: true,
      name: `P${i + 1}`,
      color: '#2F8CFF',
      fruit: 'semangka',
      look: lookOfFruit('semangka'),
    });
  return out;
}

function newRace(
  mode: Mode,
  humans: number,
  cpus: number,
  circuit: CircuitId = 'kota',
  laps = 1,
  seed = 1,
  arenaMs?: number,
): Race {
  return new Race({ mode, laps, racers: racers(humans, cpus), circuit, seed, arenaMs });
}

function stepUntil(race: Race, pred: () => boolean, maxSteps = 60 * 600): RaceEvent[] {
  const all: RaceEvent[] = [];
  for (let i = 0; i < maxSteps && !pred(); i++) {
    race.step();
    all.push(...race.drain());
  }
  return all;
}

function toRace(race: Race): void {
  stepUntil(race, () => race.phase === 'race');
}

/** Teleports a kart smoothly along the centreline (as if driving perfectly). */
function driveTo(race: Race, k: Kart, targetU: number, stepM = 0.8): void {
  const T = race.track!;
  while (k.u < targetU) {
    const s = T.wrap(k.s + stepM);
    const p = T.point(s, 0);
    k.x = p.x;
    k.z = p.z;
    k.h = T.headingAt(s);
    k.vx = 0;
    k.vz = 0;
    race.step();
    race.drain();
    if (k.finishT !== null) return;
  }
}

/** Puts a kart on a circuit at arc length s, lateral d, rolling at `speed` along the road. */
function placeOnTrack(race: Race, k: Kart, s: number, d: number, speed: number): void {
  const T = race.track!;
  const p = T.point(s, d);
  k.x = k.prevX = p.x;
  k.z = k.prevZ = p.z;
  k.y = p.y;
  k.h = T.headingAt(s);
  k.vx = Math.sin(k.h) * speed;
  k.vz = Math.cos(k.h) * speed;
  k.speed = speed;
  const pr = T.projectGlobal(p.x, p.z);
  k.hint = pr.i;
  k.s = pr.s;
}

const lateral = (k: Kart) => k.vx * -Math.cos(k.h) + k.vz * Math.sin(k.h);

describe('circuits', () => {
  it.each(CIRCUITS)('%s is a closed loop with a clockwise full turn', (id) => {
    const T = getTrack(id);
    expect(T.length).toBeGreaterThan(850);
    expect(T.length).toBeLessThan(1250);
    const a = T.frame(0);
    const b = T.frame(T.length - 0.01);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(0.5);
    let sum = 0;
    for (let i = 0; i < T.n; i++) sum += T.curv[i]! * T.step;
    expect(sum).toBeCloseTo(Math.PI * 2, 1);
    for (let i = 0; i < T.n; i++) {
      expect(T.wallL[i]!).toBeGreaterThan(ROAD_HALF);
      expect(T.wallR[i]!).toBeGreaterThan(ROAD_HALF);
    }
    // A straight behind the start line for the grid.
    for (let s = -40; s < 0; s += 2) expect(Math.abs(T.curv[T.index(s)]!)).toBe(0);
    expect(T.marks.itemRows.length).toBeGreaterThanOrEqual(4);
  });

  it.each(CIRCUITS)('%s projects points back to the right arc length and side', (id) => {
    const T = getTrack(id);
    for (const s of [10, 250, 400, 650, 850]) {
      const p = T.point(s, 3);
      const pr = T.projectGlobal(p.x, p.z);
      expect(Math.abs(T.delta(s, pr.s))).toBeLessThan(0.6);
      expect(pr.d).toBeCloseTo(3, 0);
    }
  });

  it('Lingkar Kota rises over the flyover and narrows its walls there', () => {
    const T = getTrack('kota');
    const f = T.marks.flyover!;
    const mid = (f.top0 + f.top1) / 2;
    expect(T.heightAt(mid)).toBeGreaterThan(7);
    expect(T.wallL[T.index(mid)]).toBeCloseTo(WALL_FLYOVER, 1);
    expect(T.wallL[T.index(10)]).toBeCloseTo(WALL_DEFAULT, 1);
  });

  it('Pesisir Pantai has a raised pier and a humpback bridge', () => {
    const T = getTrack('pantai');
    const p = T.marks.pier!;
    expect(T.heightAt((p.s0 + p.s1) / 2)).toBeCloseTo(PIER_HEIGHT, 1);
    const b = T.marks.bridge!;
    expect(Math.abs(T.heightAt(b.top) - BRIDGE_HEIGHT)).toBeLessThan(0.15);
    expect(T.heightAt(b.s1 + 1)).toBe(0);
  });

  it('Jalur Puncak climbs to the ridge and narrows into the tunnel', () => {
    const T = getTrack('puncak');
    const t = T.marks.tunnel!;
    expect(T.heightAt((t.s0 + t.s1) / 2)).toBeGreaterThan(14);
    expect(T.wallL[T.index((t.s0 + t.s1) / 2)]).toBeLessThan(WALL_DEFAULT);
    expect(T.marks.hairpins!.length).toBe(2);
    let min = Infinity;
    for (let i = 0; i < T.n; i++) min = Math.min(min, T.y[i]!);
    expect(min).toBeGreaterThanOrEqual(-0.1);
  });
});

describe('arena ground', () => {
  const A = getArena();
  it('pushes karts back inside the walls and out of obstacles', () => {
    const out = A.resolve(A.halfW + 5, 0, 1.2)!;
    expect(out.x).toBeLessThan(A.halfW);
    expect(out.nx).toBeLessThan(0);
    const f = A.resolve(0.5, 0.5, 1.2)!;
    expect(Math.hypot(f.x, f.z)).toBeGreaterThanOrEqual(6 + 1.2 - 1e-6);
    expect(A.resolve(-10, -20, 1.2)).toBeNull();
  });

  it('raises kicker ramps to a peak in the middle', () => {
    const r = A.ramps[0]!;
    expect(A.heightAt(r.x, r.z)).toBeCloseTo(r.h, 2);
    expect(A.heightAt(r.x + Math.sin(r.rot) * (r.len / 2 + 1), r.z + Math.cos(r.rot) * (r.len / 2 + 1))).toBe(
      0,
    );
  });

  it('spawns everyone and every item box on free ground', () => {
    for (const s of A.spawns) expect(A.free(s.x, s.z, 1.3)).toBe(true);
    for (const b of A.boxSpots) expect(A.free(b.x, b.z, 0.6)).toBe(true);
  });
});

describe('handling', () => {
  it('maps phone buttons to steering', () => {
    expect(steerFromButtons(0)).toBe(0);
    expect(steerFromButtons(DRIVE_LEFT)).toBe(-1);
    expect(steerFromButtons(DRIVE_RIGHT | DRIVE_GAS)).toBe(1);
    expect(steerFromButtons(DRIVE_LEFT | DRIVE_RIGHT)).toBe(0);
  });

  it('ramps steering to full in about a quarter second and eases back', () => {
    let s = 0;
    for (let i = 0; i < 9; i++) s = rampSteer(s, 1, DT);
    expect(s).toBeLessThan(0.7);
    for (let i = 0; i < 6; i++) s = rampSteer(s, 1, DT);
    expect(s).toBeGreaterThanOrEqual(0.99);
    s = rampSteer(s, 0, DT);
    expect(s).toBeGreaterThan(0.85);
    for (let i = 0; i < 12; i++) s = rampSteer(s, 0, DT);
    expect(s).toBe(0);
  });

  it('turns less sharply the faster it goes', () => {
    expect(yawCap(3)).toBeGreaterThan(yawCap(12));
    expect(yawCap(12)).toBeGreaterThan(yawCap(TUNE.topSpeed));
    expect(yawCap(TUNE.topSpeed)).toBeLessThan(1);
    // Minimum radius at top speed is wider than a city lane change: about 28 m.
    expect(TUNE.topSpeed / yawCap(TUNE.topSpeed)).toBeGreaterThan(25);
  });

  it('needs the gas: no pedal, no movement', () => {
    const race = newRace('gp', 1, 0);
    toRace(race);
    const k = race.karts[0]!;
    for (let i = 0; i < 120; i++) race.step();
    expect(Math.abs(k.speed)).toBeLessThan(0.01);
    for (let i = 0; i < 60 * 3; i++) {
      race.input(1, DRIVE_GAS, 0);
      race.step();
    }
    expect(k.speed).toBeGreaterThan(TUNE.topSpeed * 0.75);
    expect(k.speed).toBeLessThanOrEqual(TUNE.topSpeed + 0.01);
  });

  it('coasts down slowly without pedals', () => {
    const race = newRace('gp', 1, 0);
    toRace(race);
    const k = race.karts[0]!;
    placeOnTrack(race, k, 20, 0, 20);
    for (let i = 0; i < 60; i++) race.step();
    expect(k.speed).toBeGreaterThan(16);
    expect(k.speed).toBeLessThan(19.5);
  });

  it('brakes to a stop, then reverses slowly out of trouble', () => {
    const race = newRace('gp', 1, 0);
    toRace(race);
    const k = race.karts[0]!;
    placeOnTrack(race, k, 20, 0, 22);
    let stopped = -1;
    for (let i = 0; i < 60 * 4; i++) {
      race.input(1, DRIVE_BRAKE, 0);
      race.step();
      if (stopped < 0 && k.speed <= 0.3) stopped = i;
    }
    expect(stopped).toBeGreaterThan(0);
    expect(stopped * DT).toBeLessThan(1.4);
    expect(k.speed).toBeLessThan(-3);
    expect(k.speed).toBeGreaterThanOrEqual(-TUNE.reverseMax - 0.01);
    expect(k.braking).toBe(false);
  });

  it('holds its line through a full-lock turn at speed (no slide)', () => {
    const race = newRace('arena', 1, 0);
    toRace(race);
    const k = race.karts[0]!;
    k.x = k.prevX = -10;
    k.z = k.prevZ = -18;
    k.h = Math.PI / 2;
    k.vx = 20;
    k.vz = 0;
    let maxSlip = 0;
    for (let i = 0; i < 60; i++) {
      race.input(1, DRIVE_GAS | DRIVE_RIGHT, 0);
      race.step();
      if (i > 20) maxSlip = Math.max(maxSlip, Math.abs(lateral(k)));
    }
    expect(maxSlip).toBeLessThan(1.2);
    expect(Math.abs(Math.atan2(maxSlip, Math.abs(k.speed)))).toBeLessThan((4 * Math.PI) / 180);
  });

  it('kills a sideways shove within a fraction of a second', () => {
    const race = newRace('gp', 1, 0);
    toRace(race);
    const k = race.karts[0]!;
    placeOnTrack(race, k, 30, 0, 20);
    k.vx += -Math.cos(k.h) * 5;
    k.vz += Math.sin(k.h) * 5;
    for (let i = 0; i < 12; i++) {
      race.input(1, DRIVE_GAS, 0);
      race.step();
    }
    expect(Math.abs(lateral(k))).toBeLessThan(0.15);
  });

  it('cannot turn while standing still', () => {
    const race = newRace('gp', 1, 0);
    toRace(race);
    const k = race.karts[0]!;
    const h0 = k.h;
    for (let i = 0; i < 60; i++) {
      race.input(1, DRIVE_LEFT, 0);
      race.step();
    }
    expect(k.h).toBeCloseTo(h0, 5);
  });
});

describe('race flow', () => {
  it('counts down 3-2-1 then goes, with karts held on the grid', () => {
    const race = newRace('gp', 1, 5);
    const start = race.karts.map((k) => [k.x, k.z]);
    const events = stepUntil(race, () => race.phase === 'race');
    expect(events.filter((e) => e.type === 'count').map((e) => (e as { n: number }).n)).toEqual([3, 2, 1]);
    expect(events.some((e) => e.type === 'go')).toBe(true);
    expect(race.t).toBeGreaterThanOrEqual(INTRO_MS + 3 * COUNT_MS - STEP_MS);
    race.karts.forEach((k, i) => {
      expect(k.x).toBeCloseTo(start[i]![0]!, 1);
      expect(k.z).toBeCloseTo(start[i]![1]!, 1);
    });
  });

  it('counts laps through every checkpoint and finishes', () => {
    const race = newRace('gp', 1, 0, 'kota', 2, 2);
    toRace(race);
    const k = race.karts[0]!;
    driveTo(race, k, 5);
    expect(k.lap).toBe(1);
    driveTo(race, k, race.track!.length + 5);
    expect(k.lap).toBe(2);
    driveTo(race, k, 2 * race.track!.length + 5);
    expect(k.finishT).not.toBeNull();
    expect(k.lapTimes.length).toBe(2);
    expect(k.nextCp).toBe(2 * CHECKPOINTS + 1);
  });

  it('cannot skip ahead: a teleport only counts a few metres', () => {
    const race = newRace('gp', 1, 0, 'pantai');
    toRace(race);
    const k = race.karts[0]!;
    driveTo(race, k, 5);
    const before = k.u;
    const p = race.track!.point(500, 0);
    k.x = p.x;
    k.z = p.z;
    race.step();
    expect(k.u - before).toBeLessThan(4);
  });

  it('does not double count when reversing over the line', () => {
    const race = newRace('gp', 1, 0, 'kota', 3, 2);
    toRace(race);
    const k = race.karts[0]!;
    driveTo(race, k, 6);
    for (let i = 0; i < 20; i++) {
      const p = race.track!.point(race.track!.wrap(k.s - 0.8), 0);
      k.x = p.x;
      k.z = p.z;
      race.step();
    }
    expect(k.u).toBeLessThan(0);
    driveTo(race, k, 8);
    expect(k.lap).toBe(1);
    expect(k.lapTimes.length).toBe(0);
  });

  it('keeps karts inside the barriers when driven into them', () => {
    for (const id of CIRCUITS) {
      const race = newRace('gp', 1, 0, id);
      toRace(race);
      const k = race.karts[0]!;
      for (let i = 0; i < 60 * 6; i++) {
        race.input(1, DRIVE_GAS | DRIVE_RIGHT, 0);
        race.step();
        const T = race.track!;
        const pr = T.projectGlobal(k.x, k.z);
        const wall = pr.d > 0 ? T.wallR[pr.i]! : T.wallL[pr.i]!;
        expect(Math.abs(pr.d)).toBeLessThan(wall + 0.5);
      }
    }
  });

  it('launches fast karts off the humpback bridge', () => {
    const race = newRace('gp', 1, 0, 'pantai');
    toRace(race);
    const k = race.karts[0]!;
    const b = race.track!.marks.bridge!;
    placeOnTrack(race, k, b.s0 - 8, 0, 22);
    const ev = stepUntil(race, () => race.track!.delta(b.s1 + 15, k.s) > 0, 200);
    expect(ev.some((e) => e.type === 'jump')).toBe(true);
    expect(ev.some((e) => e.type === 'land')).toBe(true);
  });

  it.each(['kota', 'pantai', 'puncak'] as const)('runs a deterministic all-CPU Grand Prix on %s', (id) => {
    const run = () => {
      const race = newRace('gp', 0, 6, id, 1, 42);
      const ev = stepUntil(race, () => race.phase === 'done', 60 * 400);
      return { race, ev };
    };
    const a = run();
    const b = run();
    expect(a.race.phase).toBe('done');
    expect(a.race.karts.every((k) => k.finishT !== null)).toBe(true);
    expect(a.race.order).toEqual(b.race.order);
    expect(a.ev.some((e) => e.type === 'use')).toBe(true);
    expect(a.ev.filter((e) => e.type === 'rescue').length).toBeLessThanOrEqual(1);
    const best = Math.min(...a.race.karts.map((k) => k.finishT!));
    expect(best).toBeGreaterThan(30_000);
    expect(best).toBeLessThan(75_000);
  });

  it('ends once every human has finished, then shows results', () => {
    const race = newRace('gp', 1, 5, 'kota', 1, 4);
    toRace(race);
    const h = race.karts.find((k) => k.human)!;
    driveTo(race, h, race.track!.length + 5, 1.6);
    race.step();
    expect(race.phase).toBe('results');
    const ev = stepUntil(race, () => race.phase === 'done', Math.ceil(RESULTS_MS / STEP_MS) + 5);
    expect(ev.some((e) => e.type === 'end')).toBe(true);
  });

  it('gives the other humans 30 seconds after the first one finishes', () => {
    const race = newRace('duel', 2, 0, 'kota', 1, 4);
    toRace(race);
    const [a, b] = race.karts as [Kart, Kart];
    driveTo(race, a, race.track!.length + 5, 2);
    expect(race.endsAt).toBeCloseTo(race.t + FINISH_GRACE_MS, -3);
    stepUntil(race, () => race.phase !== 'race', Math.ceil(FINISH_GRACE_MS / STEP_MS) + 10);
    expect(race.phase).toBe('results');
    expect(b.finishT).toBeNull();
    expect(race.order[0]).toBe(a.idx);
  });
});

describe('items', () => {
  function withItem(item: Kart['item'], mode: Mode = 'gp', cpus = 1) {
    const race = newRace(mode, 1, cpus, 'kota', 3, 5);
    toRace(race);
    const me = race.kartOf(1)!;
    me.item = item;
    return { race, me, cpu: race.karts.find((k) => !k.human)! };
  }
  const tap = (race: Race, n: number, buttons = 0) => race.input(1, buttons, n);

  it('rolls an item from a kardus after a short shuffle', () => {
    const race = newRace('gp', 1, 0, 'kota', 3, 6);
    toRace(race);
    const k = race.karts[0]!;
    const box = race.boxes[2]!;
    k.x = box.x;
    k.z = box.z;
    race.step();
    expect(race.drain().some((e) => e.type === 'pickup')).toBe(true);
    expect(k.rollT).toBeGreaterThan(0);
    stepUntil(race, () => k.item !== null, 120);
    expect(k.item).not.toBeNull();
    expect(k.stats.boxes).toBe(1);
    stepUntil(race, () => box.active, Math.ceil((TUNE.boxRespawnS * 1000) / STEP_MS) + 5);
    expect(box.active).toBe(true);
  });

  it('gives leaders defence and the back of the pack speed and homing petasan', () => {
    const lead = itemWeights(0);
    const last = itemWeights(1);
    expect(lead.firecracker).toBeLessThan(0.05);
    expect(last.firecracker + last.boost).toBeGreaterThan(lead.firecracker + lead.boost + 0.5);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) {
      const it = rollItem(0.5, i / 1000, true);
      counts[it] = (counts[it] ?? 0) + 1;
    }
    expect(counts.durian).toBeGreaterThan(200);
  });

  it('uses the item once per tap, with a wrapping u16 counter', () => {
    const { race, me } = withItem('boost');
    tap(race, 65534);
    race.step();
    expect(me.item).toBe('boost');
    tap(race, 1);
    race.step();
    expect(me.item).toBeNull();
    expect(me.boostT).toBeGreaterThan(0);
  });

  it('ignores item taps while paused', () => {
    const { race, me } = withItem('boost');
    tap(race, 10);
    race.input(1, 0, 11, false);
    race.step();
    expect(me.item).toBe('boost');
  });

  it('throws a durian forward along the road into the kart ahead', () => {
    const { race, me, cpu } = withItem('durian');
    placeOnTrack(race, me, 40, 0, 15);
    placeOnTrack(race, cpu, 62, 0, 0);
    tap(race, 1);
    tap(race, 2);
    const ev = stepUntil(race, () => cpu.spinT > 0, 90);
    expect(ev.some((e) => e.type === 'throw' && e.kind === 'durian')).toBe(true);
    expect(cpu.spinT).toBeGreaterThan(0);
    expect(me.stats.hitsGiven).toBe(1);
  });

  it('lobs the durian backwards when REM is held at the tap', () => {
    const { race, me } = withItem('durian');
    placeOnTrack(race, me, 40, 0, 10);
    tap(race, 1, DRIVE_BRAKE);
    tap(race, 2, DRIVE_BRAKE);
    race.step();
    expect(race.projectiles.length).toBe(0);
    expect(race.hazards.length).toBe(1);
    expect(race.hazards[0]!.kind).toBe('durian');
    const h = race.hazards[0]!;
    const T = race.track!;
    expect(T.delta(T.projectGlobal(h.x, h.z).s, me.s)).toBeGreaterThan(1);
  });

  it('sends a petasan after the kart directly ahead, and it explodes on it', () => {
    const race = newRace('gp', 1, 2, 'kota', 3, 9);
    toRace(race);
    const me = race.kartOf(1)!;
    const [far, near] = race.karts.filter((k) => !k.human) as [Kart, Kart];
    placeOnTrack(race, me, 30, 0, 12);
    placeOnTrack(race, near, 60, 4, 8);
    placeOnTrack(race, far, 120, -4, 8);
    race.step();
    me.item = 'firecracker';
    tap(race, 1);
    tap(race, 2);
    const ev = stepUntil(race, () => race.events.some((e) => e.type === 'boom') || near.spinT > 0, 240);
    expect(ev.some((e) => e.type === 'throw' && e.kind === 'firecracker')).toBe(true);
    stepUntil(race, () => near.spinT > 0, 240);
    expect(near.spinT).toBeGreaterThan(0);
    expect(far.spinT).toBe(0);
  });

  it('Tumpahan Oli spins whoever drives through it', () => {
    const { race, me, cpu } = withItem('oil');
    tap(race, 1);
    tap(race, 2);
    race.step();
    expect(race.hazards.length).toBe(1);
    const o = race.hazards[0]!;
    cpu.x = o.x;
    cpu.z = o.z;
    race.step();
    expect(cpu.spinT).toBeGreaterThan(0);
    expect(race.hazards.length).toBe(0);
    expect(me.stats.hitsGiven).toBe(1);
  });

  it('Klakson Telolet wobbles nearby rivals and Helm Baja blocks one hit', () => {
    const { race, me, cpu } = withItem('horn');
    cpu.x = me.x + 4;
    cpu.z = me.z;
    cpu.shield = true;
    cpu.shieldT = 10;
    tap(race, 1);
    tap(race, 2);
    race.step();
    expect(race.drain().some((e) => e.type === 'blocked')).toBe(true);
    expect(cpu.wobbleT).toBe(0);
    me.item = 'horn';
    tap(race, 3);
    race.step();
    expect(cpu.wobbleT).toBeGreaterThan(0);
  });

  it('Turbo Kopi pushes past top speed', () => {
    const { race, me } = withItem('boost');
    placeOnTrack(race, me, 20, 0, TUNE.topSpeed);
    tap(race, 1);
    tap(race, 2, DRIVE_GAS);
    for (let i = 0; i < 40; i++) {
      race.input(1, DRIVE_GAS, 2);
      race.step();
    }
    expect(me.speed).toBeGreaterThan(TUNE.topSpeed * 1.15);
  });
});

describe('arena', () => {
  it('takes a life per hit, knocks out at zero, and the last one standing wins', () => {
    const race = newRace('arena', 1, 2, 'kota', 1, 3);
    toRace(race);
    const me = race.kartOf(1)!;
    const [a, b] = race.karts.filter((k) => !k.human) as [Kart, Kart];
    expect(me.lives).toBe(3);
    race.hit(a, me.idx, 'durian');
    expect(a.lives).toBe(2);
    // Invulnerable for a moment after a hit.
    race.hit(a, me.idx, 'durian');
    expect(a.lives).toBe(2);
    a.invulnT = 0;
    race.hit(a, me.idx, 'oil');
    a.invulnT = 0;
    race.hit(a, me.idx, 'firecracker');
    expect(a.out).toBe(true);
    b.lives = 1;
    race.hit(b, me.idx, 'durian');
    expect(b.out).toBe(true);
    race.step();
    expect(race.phase).toBe('results');
    const rows = finalRows(race);
    expect(rows[0]!.idx).toBe(me.idx);
    expect(me.stats.hitsGiven).toBe(4);
  });

  it('horns wobble but never cost a life', () => {
    const race = newRace('arena', 1, 1);
    toRace(race);
    const cpu = race.karts.find((k) => !k.human)!;
    race.hit(cpu, 1, 'horn');
    expect(cpu.lives).toBe(3);
    expect(cpu.wobbleT).toBeGreaterThan(0);
  });

  it('ends on the clock with the most lives on top', () => {
    const race = newRace('arena', 1, 2, 'kota', 1, 3, 4000);
    toRace(race);
    const cpu = race.karts.find((k) => !k.human)!;
    for (const k of race.karts) k.autopilot = false;
    cpu.lives = 3;
    race.kartOf(1)!.lives = 1;
    race.karts.find((k) => !k.human && k !== cpu)!.lives = 2;
    stepUntil(race, () => race.phase === 'results', 60 * 6);
    expect(race.phase).toBe('results');
    expect(finalRows(race)[0]!.idx).toBe(cpu.idx);
  });

  it('runs a full CPU battle to a winner within the time limit', () => {
    const race = newRace('arena', 0, 4, 'kota', 1, 8);
    stepUntil(race, () => race.phase === 'done', 60 * 260);
    expect(race.phase).toBe('done');
    expect(race.karts.some((k) => k.out)).toBe(true);
  });
});

describe('Lawan Waktu', () => {
  it('has no kardus, no collisions, and ranks by best lap with sector splits', () => {
    const race = newRace('time', 2, 0, 'kota', 2, 1);
    expect(race.boxes.length).toBe(0);
    toRace(race);
    const [a, b] = race.karts as [Kart, Kart];
    b.x = a.x;
    b.z = a.z;
    race.step();
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(0.01);
    const L = race.track!.length;
    // a drives two laps, the second one faster: a split vs its best appears.
    driveTo(race, a, L + 2, 0.6);
    const ev: RaceEvent[] = [];
    while (a.u < 2 * L + 2 && a.finishT === null) {
      const s = race.track!.wrap(a.s + 0.9);
      const p = race.track!.point(s, 0);
      a.x = p.x;
      a.z = p.z;
      a.h = race.track!.headingAt(s);
      race.step();
      ev.push(...race.drain());
    }
    const splits = ev.filter((e) => e.type === 'split') as Extract<RaceEvent, { type: 'split' }>[];
    expect(splits.length).toBeGreaterThanOrEqual(3);
    expect(splits.every((sp) => sp.delta !== null && sp.delta < 0)).toBe(true);
    expect(ev.some((e) => e.type === 'lap' && e.best)).toBe(true);
    driveTo(race, b, L + 2, 0.4);
    const rows = finalRows(race);
    expect(rows[0]!.idx).toBe(a.idx);
  });
});

describe('reconnect', () => {
  it('hands a disconnected human to the autopilot and back', () => {
    const race = newRace('gp', 1, 1);
    toRace(race);
    const me = race.kartOf(1)!;
    race.input(1, DRIVE_LEFT | DRIVE_GAS, 0);
    race.setConnected(1, false);
    expect(me.autopilot).toBe(true);
    expect(me.buttons).toBe(0);
    for (let i = 0; i < 60 * 5; i++) race.step();
    expect(me.u).toBeGreaterThan(40);
    race.setConnected(1, true);
    expect(me.autopilot).toBe(false);
  });
});

describe('CPU drivers', () => {
  it('slow down for tight corners and run flat out on straights', () => {
    const T = getTrack('puncak');
    const hp = T.marks.hairpins![0]!;
    expect(allowedSpeed(T, hp - 30, 24, 0.9)).toBeLessThan(20);
    expect(allowedSpeed(getTrack('kota'), 20, 20, 0.9)).toBeGreaterThan(TUNE.topSpeed);
    expect(safeSpeed(1 / 20, 0.9)).toBeLessThan(safeSpeed(1 / 44, 0.9));
  });
});

describe('results and setup', () => {
  it('ranks humans by overall place and labels per mode', () => {
    const race = newRace('gp', 2, 4, 'kota', 1, 9);
    stepUntil(race, () => race.phase === 'done', 60 * 400);
    const res = buildResult(race, STR.maps.kota.name);
    expect(res.ranking.length).toBe(2);
    expect(res.ranking[0]!.rank).toBeLessThan(res.ranking[1]!.rank);
    for (const r of res.ranking) expect(r.label).toContain(`Ke-${r.rank}`);
    expect(res.subtitle).toContain('Lingkar Kota');
    expect(pickAwards(race).length).toBeLessThanOrEqual(4);
    expect(pickAwards(race).every((a) => a.title !== 'Raja Ngepot')).toBe(true);
  });

  it('fills grids per mode', () => {
    expect(cpuCount('gp', 2)).toBe(4);
    expect(cpuCount('duel', 1)).toBe(1);
    expect(cpuCount('duel', 2)).toBe(0);
    expect(cpuCount('duel', 3)).toBe(0);
    expect(cpuCount('arena', 1)).toBe(3);
    expect(cpuCount('arena', 6)).toBe(0);
    expect(cpuCount('time', 1)).toBe(0);
  });

  it('builds racers with picked colours and distinct CPU colours', () => {
    const players: PlayerInfo[] = [
      {
        id: 1,
        name: 'Rina',
        fruit: 'semangka',
        look: lookOfFruit('semangka'),
        color: '#F2453D',
        connected: true,
        isHost: true,
      },
      {
        id: 2,
        name: 'Budi',
        fruit: 'alpukat',
        look: lookOfFruit('alpukat'),
        color: '#2F8CFF',
        connected: true,
        isHost: false,
      },
    ];
    const r = buildRacers(players, 'gp', STR.cpuNames, new Map([[1, '#FFC928']]));
    expect(r.length).toBe(6);
    expect(r.find((x) => x.id === 1)!.color).toBe('#FFC928');
    expect(new Set(r.map((x) => x.color)).size).toBe(6);
    expect(buildRacers(players, 'duel', STR.cpuNames).length).toBe(2);
    expect(buildRacers(players.slice(0, 1), 'duel', STR.cpuNames).length).toBe(2);
    expect(buildRacers(players, 'arena', STR.cpuNames).length).toBe(4);
    // Humans keep their look; computer racers get characters nobody picked.
    expect(r.find((x) => x.id === 2)!.look).toEqual(lookOfFruit('alpukat'));
    const people = r.map((x) => x.look.c);
    expect(new Set(people).size).toBe(6);
  });

  it('splits the screen by the number of humans', () => {
    expect(layoutFor([5], 720).map((v) => v.kind)).toEqual(['chase']);
    expect(layoutFor([4, 5], 720).map((v) => v.w)).toEqual([1280, 1280]);
    expect(layoutFor([3, 4, 5], 720).map((v) => v.kind)).toEqual(['chase', 'chase', 'chase', 'overview']);
    expect(layoutFor([0, 1, 2, 3, 4, 5], 720).map((v) => v.kind)).toEqual(['broadcast']);
  });

  it('fills a stage wider than 16:9 edge to edge', () => {
    const W = 1707;
    expect(layoutFor([5], 720, W)[0]!.w).toBe(W);
    expect(layoutFor([4, 5], 720, W).map((v) => v.w)).toEqual([W, W]);
    const quad = layoutFor([2, 3, 4, 5], 720, W);
    expect(quad[0]!.x).toBe(0);
    expect(quad[1]!.x + quad[1]!.w).toBe(W);
    expect(quad[1]!.x - (quad[0]!.x + quad[0]!.w)).toBe(6);
  });

  it('parses the lap count from the shell mode', () => {
    expect(parseLaps(2)).toBe(2);
    expect(parseLaps('3')).toBe(3);
    expect(parseLaps(undefined)).toBe(3);
  });
});

describe('phone views', () => {
  it('drive view per mode', () => {
    const base = {
      color: '#F2453D',
      place: 2,
      total: 6,
      lap: 1,
      laps: 3,
      lives: 2,
      out: false,
      clockMs: 95_000,
      best: null,
      item: 'durian' as const,
      rolling: false,
      finishTime: null,
      hint: 'x',
      locked: false,
    };
    expect(driveView({ ...base, mode: 'gp' })).toMatchObject({
      kind: 'drive',
      place: 'Posisi 2/6',
      lap: 'Putaran 1/3',
      item: { icon: 'durian', name: 'Durian' },
    });
    expect(driveView({ ...base, mode: 'arena' })).toMatchObject({ place: 'Nyawa 2/3', lap: 'Sisa 1:35' });
    expect(driveView({ ...base, mode: 'time', best: 41_230 })).toMatchObject({ place: 'Terbaik 0:41.23' });
    expect(driveView({ ...base, mode: 'gp', item: 'firecracker' })).toMatchObject({
      item: { icon: 'firecracker', name: 'Petasan' },
    });
    expect(driveView({ ...base, mode: 'gp', rolling: true })).toMatchObject({ item: { icon: 'box' } });
  });

  it('only the Host can pick the mode', () => {
    const host = modeMenu(true, 'arena', 'Rina');
    expect(host).toMatchObject({ kind: 'menu', selected: 'arena', confirm: { id: 'next' } });
    const other = modeMenu(false, 'arena', 'Rina');
    expect(other).toMatchObject({ kind: 'menu', locked: true });
    expect((other as { waiting?: string }).waiting).toContain('Rina');
  });

  it('greys out colours taken by someone else', () => {
    const v = kartMenu({
      me: 2,
      isHost: false,
      picks: new Map([
        [1, '#F2453D'],
        [2, '#2F8CFF'],
      ]),
      names: new Map([
        [1, 'Rina'],
        [2, 'Budi'],
      ]),
      ready: false,
      readyCount: 0,
      total: 2,
      step: 3,
      steps: 3,
      autoS: null,
    });
    if (v.kind !== 'menu') throw new Error('expected a menu');
    expect(v.layout).toBe('swatch');
    expect(v.selected).toBe('#2F8CFF');
    const red = v.options.find((o) => o.id === '#F2453D')!;
    expect(red.disabled).toBe(true);
    expect(red.badge).toBe('Rina');
    expect(v.confirm?.id).toBe('ready');
  });

  it('offers race again / change mode / done to the Host only', () => {
    expect(postMenu(true, 'Rina', 20)).toMatchObject({ kind: 'menu' });
    expect(postMenu(false, 'Rina', 20)).toMatchObject({ kind: 'message' });
  });
});

describe('strings', () => {
  it('never says TV and never mentions drifting', () => {
    const text = JSON.stringify(STR);
    expect(text).not.toMatch(/\bTV\b/i);
    expect(text).not.toMatch(/ngepot|drift/i);
  });

  it('formats times and deltas', () => {
    expect(formatTime(83456)).toBe('1:23.46');
    expect(formatDelta(-420)).toBe('-0.42');
    expect(formatDelta(1234)).toBe('+1.23');
  });
});
