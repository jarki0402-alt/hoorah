import { PAD_ACTION, PAD_DOWN, PAD_LEFT, PAD_RIGHT, PAD_UP, type PlayerInfo } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { fieldSkills, RunnerBrain } from './brain';
import {
  distanceAt,
  jumpShape,
  LANE_QUEUE,
  LariRun,
  type Mode,
  parseMode,
  type Runner,
  speedAt,
  TUNING,
  timeAtDistance,
} from './logic';
import { buildResult, finalRows, pickAwards, soloOutcome } from './results';
import { type Coin, type Obstacle, seededRandom, Track } from './track';
import { countdownView, padView } from './views';

const DT = 1 / 60;
const shape = jumpShape();

/** A track with one endless roof and only the obstacles and coins a test puts there. */
function openTrack(): Track {
  const t = new Track({ seed: 1, speedAt: () => 10, airTime: shape.airTime, jumpPeak: shape.peak });
  t.roofs.push({ id: 1, start: -400, end: 1e7, look: 0 });
  return t;
}

let nextId = 1000;
function obstacle(kind: Obstacle['kind'], lane: number, d: number, len = 0.5, span: 1 | 3 = 1): Obstacle {
  return { id: nextId++, row: nextId, kind, lane, span, d, len, variant: 0 };
}

function setup(
  mode: Mode,
  runners: { id: number; cpu: boolean }[],
  items: (Obstacle | Coin)[] = [],
): { run: LariRun; track: Track } {
  const track = openTrack();
  for (const it of items) {
    if ('kind' in it) track.obstacles.push(it);
    else track.coins.push(it);
  }
  track.obstacles.sort((a, b) => a.d - b.d);
  track.coins.sort((a, b) => a.d - b.d);
  const run = new LariRun({ mode, runners, seed: 1, track });
  run.start();
  return { run, track };
}

/** Step until `cond` (or `max` seconds). */
function stepUntil(run: LariRun, cond: () => boolean, max = 30): void {
  for (let i = 0; i < max * 60 && !cond(); i++) run.step(DT);
}

function seconds(run: LariRun, s: number): void {
  for (let i = 0; i < Math.round(s * 60); i++) run.step(DT);
}

const solo = (cpu: boolean) => [{ id: 1, cpu }];

describe('settings and speed', () => {
  it('maps rounds to the mode', () => {
    expect(parseMode(1)).toBe('sprint');
    expect(parseMode(2)).toBe('survive');
    expect(parseMode('1')).toBe('sprint');
    expect(parseMode(undefined)).toBe('survive');
  });

  it('speeds up over time and inverts distance and time', () => {
    expect(speedAt(0)).toBe(8.5);
    for (let t = 0; t < 400; t += 5) expect(speedAt(t + 5)).toBeGreaterThanOrEqual(speedAt(t));
    expect(speedAt(1000)).toBe(21);
    for (const t of [0, 3, 40, 77, 150, 260, 500]) expect(timeAtDistance(distanceAt(t))).toBeCloseTo(t, 3);
  });

  it('has a forgiving jump', () => {
    expect(shape.airTime).toBeGreaterThan(0.65);
    expect(shape.peak).toBeGreaterThan(1);
  });
});

describe('moves and touches', () => {
  it('jumping clears a low barrier, running into it trips', () => {
    const a = setup('survive', solo(true), [obstacle('low', 0, 20)]);
    const r = a.run.runner(1)!;
    stepUntil(a.run, () => 20 - r.d < a.run.speed * 0.28);
    a.run.act(r, 'jump');
    seconds(a.run, 2);
    expect(r.stumbles).toBe(0);
    expect(r.jumps).toBe(1);

    const b = setup('survive', solo(true), [obstacle('low', 0, 20)]);
    seconds(b.run, 4);
    expect(b.run.runner(1)!.stumbles).toBe(1);
  });

  it('sliding passes under a high bar, jumping into it trips', () => {
    const a = setup('survive', solo(true), [obstacle('high', 0, 20, 0.35, 3)]);
    const r = a.run.runner(1)!;
    stepUntil(a.run, () => 20 - r.d < a.run.speed * 0.3);
    a.run.act(r, 'slide');
    seconds(a.run, 2);
    expect(r.stumbles).toBe(0);

    const b = setup('survive', solo(true), [obstacle('high', 0, 20, 0.35, 3)]);
    const s = b.run.runner(1)!;
    stepUntil(b.run, () => 20 - s.d < b.run.speed * 0.15);
    b.run.act(s, 'jump');
    seconds(b.run, 2);
    expect(s.stumbles).toBe(1);
  });

  it('changing lane avoids a block; hitting one bounces into a free lane', () => {
    const a = setup('survive', solo(true), [obstacle('block', 0, 20, 1.3)]);
    const r = a.run.runner(1)!;
    stepUntil(a.run, () => 20 - r.d < a.run.speed * 0.4);
    a.run.act(r, 'left');
    seconds(a.run, 2);
    expect(r.stumbles).toBe(0);
    expect(r.lane).toBe(-1);

    const b = setup('survive', solo(true), [obstacle('block', 0, 20, 1.3), obstacle('block', -1, 20, 1.3)]);
    const s = b.run.runner(1)!;
    seconds(b.run, 4);
    expect(s.stumbles).toBe(1);
    expect(s.lane).toBe(1);
  });

  it('keeps lanes inside the roof', () => {
    const { run } = setup('survive', solo(true));
    const r = run.runner(1)!;
    run.act(r, 'left');
    run.act(r, 'left');
    run.act(r, 'left');
    seconds(run, 0.5);
    expect(r.lane).toBe(-1);
    expect(r.x).toBeCloseTo(-TUNING.laneW, 5);
  });

  it('a gap needs a jump; falling in costs a stumble and climbs out on the far side', () => {
    const gap = obstacle('gap', 0, 32, 3.4, 3);
    const a = setup('survive', solo(true), [gap]);
    const r = a.run.runner(1)!;
    stepUntil(a.run, () => gap.d - gap.len / 2 - r.d < a.run.speed * 0.1);
    a.run.act(r, 'jump');
    seconds(a.run, 2);
    expect(r.stumbles).toBe(0);

    const b = setup('survive', solo(true), [gap]);
    const s = b.run.runner(1)!;
    seconds(b.run, 6);
    expect(s.stumbles).toBe(1);
    expect(s.d).toBeGreaterThan(gap.d + gap.len / 2);
    expect(s.y).toBe(0);
  });

  it('a slide in the air drops fast and slides on landing', () => {
    const { run } = setup('survive', solo(true));
    const r = run.runner(1)!;
    run.act(r, 'jump');
    seconds(run, 0.15);
    run.act(r, 'slide');
    stepUntil(run, () => !r.air, 2);
    run.step(DT);
    expect(r.slideT).toBeGreaterThan(0);
  });
});

describe('lane changes', () => {
  const W = TUNING.laneW;
  /** Largest move of the body in one step: the eased change at its steepest. */
  const MAX_STEP = (1.5 * W * DT) / TUNING.laneTime + 1e-9;

  /** Step for `s` seconds and record the runner's x after every step. */
  function trace(run: LariRun, r: Runner, s: number): number[] {
    const xs: number[] = [];
    for (let i = 0; i < Math.round(s * 60); i++) {
      run.step(DT);
      xs.push(r.x);
    }
    return xs;
  }

  /** Every step moves the body a little, in one direction only. */
  function expectSmooth(from: number, xs: number[], dir: 1 | -1): void {
    let prev = from;
    for (const x of xs) {
      expect(Math.abs(x - prev)).toBeLessThanOrEqual(MAX_STEP);
      expect((x - prev) * dir).toBeGreaterThanOrEqual(-1e-9);
      prev = x;
    }
  }

  /** A person's runner settled in the left lane. */
  function inLeftLane(items: Obstacle[] = []): { run: LariRun; r: Runner } {
    const { run } = setup('survive', solo(false), items);
    const r = run.runner(1)!;
    run.input(1, 1, PAD_LEFT, 0);
    seconds(run, 0.5);
    expect(r.x).toBe(-W);
    return { run, r };
  }

  it('moves exactly one lane per lateral input, eased across in about 0.2 s', () => {
    const { run } = setup('survive', solo(false));
    const r = run.runner(1)!;
    expect(TUNING.laneTime).toBeGreaterThanOrEqual(0.18);
    expect(TUNING.laneTime).toBeLessThanOrEqual(0.22);
    run.input(1, 1, PAD_RIGHT, 0.25);
    expect(r.lane).toBe(1);
    // Nothing jumps when the swipe arrives, however late it was.
    expect(r.x).toBe(0);
    const xs = trace(run, r, 0.5);
    expectSmooth(0, xs, 1);
    const settled = xs.indexOf(W) + 1;
    expect(settled * DT).toBeGreaterThanOrEqual(0.18);
    expect(settled * DT).toBeLessThanOrEqual(0.22 + DT);
    expect(r.lane).toBe(1);
    expect(Math.max(...xs)).toBe(W);
  });

  it('runs a quick double move one lane after the other: left, middle, right', () => {
    const { run, r } = inLeftLane();
    run.input(1, 2, PAD_RIGHT, 0);
    run.step(DT);
    run.step(DT);
    run.input(1, 3, PAD_RIGHT, 0);
    // The second move waits for the first.
    expect(r.lane).toBe(0);
    expect(r.laneQueue).toHaveLength(1);
    const before = r.x;
    const xs = trace(run, r, 0.7);
    expectSmooth(before, xs, 1);
    // It reaches the middle lane before setting off again.
    expect(xs).toContain(0);
    const settled = xs.indexOf(W) + 3;
    expect(settled * DT).toBeGreaterThanOrEqual(2 * TUNING.laneTime);
    expect(settled * DT).toBeLessThanOrEqual(2 * TUNING.laneTime + 3 * DT);
    expect(r.lane).toBe(1);
    expect(r.laneQueue).toHaveLength(0);
  });

  it('keeps at most the moves that fit on the roof, and a newer one replaces the extra', () => {
    const { run, r } = inLeftLane();
    const events: string[] = [];
    run.input(1, 2, PAD_RIGHT, 0);
    run.input(1, 3, PAD_RIGHT, 0);
    run.input(1, 4, PAD_RIGHT, 0);
    run.input(1, 5, PAD_RIGHT, 0);
    for (const e of run.events) events.push(e.type);
    expect(r.laneQueue.length).toBeLessThanOrEqual(LANE_QUEUE);
    expect(events.filter((t) => t === 'bump')).toHaveLength(2);
    seconds(run, 1);
    expect(r.lane).toBe(1);
    expect(r.x).toBe(W);
  });

  it('a move into the roof edge from an outer lane only bumps', () => {
    const { run, r } = inLeftLane();
    run.events.length = 0;
    run.input(1, 2, PAD_LEFT, 0);
    expect(run.events).toContainEqual({ type: 'bump', id: 1, dir: -1 });
    expect(r.lane).toBe(-1);
    const xs = trace(run, r, 0.4);
    expect(xs.every((x) => x === -W)).toBe(true);
    // The same on the right edge.
    run.input(1, 3, PAD_RIGHT, 0);
    run.input(1, 4, PAD_RIGHT, 0);
    seconds(run, 0.6);
    run.events.length = 0;
    run.input(1, 5, PAD_RIGHT, 0);
    expect(run.events).toContainEqual({ type: 'bump', id: 1, dir: 1 });
    seconds(run, 0.3);
    expect(r.x).toBe(W);
  });

  it('a move back turns the change around or cancels the waiting move', () => {
    const { run } = setup('survive', solo(false));
    const r = run.runner(1)!;
    run.input(1, 1, PAD_RIGHT, 0);
    seconds(run, 0.1);
    const mid = r.x;
    expect(mid).toBeGreaterThan(0.2);
    run.input(1, 2, PAD_LEFT, 0);
    expect(r.lane).toBe(0);
    const back = trace(run, r, 0.4);
    expectSmooth(mid, back, -1);
    expect(r.x).toBe(0);

    const b = inLeftLane();
    b.run.input(1, 2, PAD_RIGHT, 0);
    b.run.input(1, 3, PAD_RIGHT, 0);
    b.run.input(1, 4, PAD_LEFT, 0);
    expect(b.r.laneQueue).toHaveLength(0);
    seconds(b.run, 0.8);
    expect(b.r.lane).toBe(0);
    expect(b.r.x).toBe(0);
  });

  it('never skips a lane at top speed', () => {
    const { run, r } = inLeftLane();
    run.t = 400;
    run.step(DT);
    expect(run.speed).toBe(21);
    run.input(1, 2, PAD_RIGHT, 0.2);
    run.input(1, 3, PAD_RIGHT, 0.2);
    const xs = trace(run, r, 0.8);
    expectSmooth(-W, xs, 1);
    expect(xs).toContain(0);
    expect(r.x).toBe(W);
  });

  it('dodges a block at top speed and forgives a late sidestep as of the press', () => {
    const block = obstacle('block', 0, 60, 1.3);
    const a = setup('survive', solo(false), [block]);
    const r = a.run.runner(1)!;
    a.run.t = 400;
    stepUntil(a.run, () => block.d - block.len / 2 - r.d < a.run.speed * 0.3);
    a.run.input(1, 1, PAD_LEFT, 0);
    seconds(a.run, 1.5);
    expect(r.stumbles).toBe(0);
    expect(r.lane).toBe(-1);

    const b = setup('survive', solo(false), [block]);
    const s = b.run.runner(1)!;
    b.run.t = 400;
    stepUntil(b.run, () => s.pending !== null);
    b.run.step(DT);
    // Pressed before the touch, arrived after it: the body has not moved yet.
    b.run.input(1, 1, PAD_RIGHT, 0.2);
    expect(s.x).toBe(0);
    seconds(b.run, 1.5);
    expect(s.stumbles).toBe(0);
    expect(s.lane).toBe(1);
  });

  it('changes lane in the air and while sliding without touching the jump or the slide', () => {
    const { airTime } = jumpShape();
    const { run } = setup('survive', solo(false));
    const r = run.runner(1)!;
    run.input(1, 1, PAD_UP, 0);
    run.step(DT);
    run.input(1, 2, PAD_RIGHT, 0);
    const xs = trace(run, r, 0.3);
    expectSmooth(0, xs, 1);
    expect(r.x).toBe(W);
    expect(r.air).toBe(true);
    stepUntil(run, () => !r.air, 2);
    expect(run.t).toBeCloseTo(airTime + DT, 1);
    expect(r.x).toBe(W);

    run.input(1, 3, PAD_DOWN, 0);
    run.input(1, 4, PAD_LEFT, 0);
    seconds(run, 0.25);
    expect(r.slideT).toBeGreaterThan(0);
    expect(r.x).toBe(0);
    // A jump right after a lane change starts at once, the body keeps easing across.
    seconds(run, 1);
    run.input(1, 5, PAD_LEFT, 0);
    run.step(DT);
    run.input(1, 6, PAD_UP, 0);
    expect(r.air).toBe(true);
    const from = r.x;
    expect(from).toBeLessThan(0);
    expectSmooth(from, trace(run, r, 0.3), -1);
    expect(r.x).toBe(-W);
  });

  it('jumps a low barrier in the lane it is changing into', () => {
    const low = obstacle('low', 1, 30);
    const { run } = setup('survive', solo(false), [low]);
    const r = run.runner(1)!;
    stepUntil(run, () => low.d - r.d < run.speed * 0.5);
    run.input(1, 1, PAD_RIGHT, 0);
    seconds(run, 0.1);
    run.input(1, 2, PAD_UP, 0);
    seconds(run, 1.5);
    expect(r.stumbles).toBe(0);
    expect(r.lane).toBe(1);
  });
});

describe('latency', () => {
  it('forgives a touch when the jump was pressed before it but arrived after', () => {
    const { run } = setup('survive', solo(false), [obstacle('low', 0, 20)]);
    const r = run.runner(1)!;
    stepUntil(run, () => r.pending !== null);
    expect(r.pending).not.toBeNull();
    seconds(run, 0.1);
    // Pressed 0.15 s ago, i.e. 0.05 s before the touch.
    run.input(1, 1, PAD_UP, 0.15);
    seconds(run, 1.5);
    expect(r.stumbles).toBe(0);
  });

  it('still trips on a press made well after the touch', () => {
    const { run } = setup('survive', solo(false), [obstacle('low', 0, 20)]);
    const r = run.runner(1)!;
    stepUntil(run, () => r.pending !== null);
    seconds(run, 0.18);
    run.input(1, 1, PAD_UP, 0);
    seconds(run, 1.5);
    expect(r.stumbles).toBe(1);
  });

  it('applies a late lane change as of the press', () => {
    const { run } = setup('survive', solo(false), [obstacle('block', 0, 20, 1.3)]);
    const r = run.runner(1)!;
    stepUntil(run, () => r.pending !== null);
    run.input(1, 5, PAD_RIGHT, 0.2);
    seconds(run, 1.5);
    expect(r.stumbles).toBe(0);
    expect(r.lane).toBe(1);
  });
});

describe('phone input', () => {
  it('reads the swipe direction from the frame whose counter rose', () => {
    const { run } = setup('survive', solo(false));
    const r = run.runner(1)!;
    run.input(1, 10, PAD_LEFT, 0);
    expect(r.lane).toBe(-1);
    run.input(1, 10, PAD_RIGHT, 0); // same counter: a repeat, ignored
    expect(r.lane).toBe(-1);
    run.input(1, 11, PAD_RIGHT, 0);
    expect(r.lane).toBe(0);
    run.input(1, 12, PAD_ACTION, 0);
    expect(r.air).toBe(true);
    run.input(1, 900, PAD_LEFT, 0); // counter reset: ignored
    expect(r.lane).toBe(0);
    seconds(run, 1);
    run.input(1, 901, PAD_DOWN, 0);
    expect(r.slideT).toBeGreaterThan(0);
  });

  it('ignores the phone while the computer covers a dropped seat, and before the start', () => {
    const track = openTrack();
    const run = new LariRun({ mode: 'survive', runners: solo(false), seed: 1, track });
    const r = run.runner(1)!;
    run.input(1, 1, PAD_LEFT, 0);
    expect(r.lane).toBe(0);
    run.start();
    run.setTakeover(1, true);
    run.input(1, 2, PAD_LEFT, 0);
    expect(r.lane).toBe(0);
    run.setTakeover(1, false);
    run.input(1, 3, PAD_LEFT, 0);
    expect(r.lane).toBe(-1);
  });
});

describe('coins and modes', () => {
  it('a coin goes to the first runner that reaches it', () => {
    const coin: Coin = { id: 1, lane: 0, d: 12, y: 0.85, taken: false };
    const { run } = setup(
      'sprint',
      [
        { id: 1, cpu: true },
        { id: 2, cpu: true },
      ],
      [coin],
    );
    const b = run.runner(2)!;
    run.act(b, 'right');
    run.act(b, 'left'); // back to lane... runner 2 starts in lane -1, now in lane 0 behind runner 1
    seconds(run, 3);
    expect(coin.taken).toBe(true);
    expect(run.runner(1)!.coins + b.coins).toBe(1);
  });

  it('Sprint ends after 90 s and scores distance plus coins minus stumbles', () => {
    const { run } = setup('sprint', solo(true), [obstacle('low', 0, 30)]);
    const r = run.runner(1)!;
    r.coins = 4;
    stepUntil(run, () => run.phase === 'done', 120);
    expect(run.t).toBeCloseTo(90, 1);
    expect(r.stumbles).toBe(1);
    expect(run.distOf(r)).toBeCloseTo(r.d - TUNING.stumbleCost, 6);
    expect(run.scoreOf(r)).toBe(Math.round(r.d - TUNING.stumbleCost) + 4 * TUNING.coinPoints);
    expect(r.place).toBe(1);
  });

  it('Sprint drags runners along the bottom of the screen instead of dropping them', () => {
    const { run } = setup('sprint', [
      { id: 1, cpu: true },
      { id: 2, cpu: true },
    ]);
    seconds(run, 2);
    run.runner(2)!.d -= 40;
    run.step(DT);
    expect(run.runner(2)!.out).toBe(false);
    expect(run.runner(2)!.d).toBeCloseTo(run.outLine, 6);
  });

  it('Bertahan drops runners behind the line and ends with one left', () => {
    const { run } = setup('survive', [
      { id: 1, cpu: false },
      { id: 2, cpu: false },
      { id: 3, cpu: false },
    ]);
    seconds(run, 2);
    run.runner(3)!.d -= 30;
    run.step(DT);
    expect(run.runner(3)!.out).toBe(true);
    expect(run.runner(3)!.place).toBe(3);
    expect(run.phase).toBe('run');
    run.runner(1)!.d -= 30;
    run.step(DT);
    expect(run.phase).toBe('done');
    expect(run.runner(2)!.place).toBe(1);
    expect(run.runner(1)!.place).toBe(2);
    const events = run.events.map((e) => e.type);
    expect(events.filter((e) => e === 'out')).toHaveLength(2);
    expect(events).toContain('finish');
  });

  it('drops the runner furthest behind first when several fall back at once', () => {
    const { run } = setup('survive', [
      { id: 1, cpu: false },
      { id: 2, cpu: false },
      { id: 3, cpu: false },
    ]);
    seconds(run, 2);
    run.runner(2)!.d -= 30;
    run.runner(3)!.d -= 40;
    run.step(DT);
    expect(run.runner(3)!.place).toBe(3);
    expect(run.runner(2)!.place).toBe(2);
    expect(run.runner(1)!.place).toBe(1);
    expect(run.phase).toBe('done');
  });

  it('Bertahan alone against the computer ends when the person drops out', () => {
    const { run } = setup('survive', [
      { id: 1, cpu: false },
      { id: -1, cpu: true },
      { id: -2, cpu: true },
    ]);
    seconds(run, 2);
    run.runner(1)!.d -= 30;
    run.step(DT);
    expect(run.phase).toBe('done');
    expect(run.runner(1)!.place).toBe(3);
  });

  it('shrinks the safe distance over time', () => {
    const { run } = setup('survive', solo(true));
    expect(run.backLimit()).toBe(TUNING.backStart);
    run.t = 400;
    expect(run.backLimit()).toBe(TUNING.backEnd);
  });
});

describe('computer runners', () => {
  function field(skill: number, seed: number, secs: number): Runner[] {
    const runners = [1, 2, 3, 4].map((i) => ({ id: -i, cpu: true }));
    const run = new LariRun({ mode: 'sprint', runners, seed, tuning: { sprintSeconds: secs } });
    const rnd = seededRandom(seed * 31 + Math.round(skill * 100));
    const brains = run.runners.map(() => new RunnerBrain(skill, rnd));
    run.start();
    while (run.phase === 'run') {
      run.runners.forEach((r, i) => {
        brains[i]!.update(run, r);
      });
      run.step(DT);
    }
    return run.runners;
  }

  it('sharp runners rarely stumble, gentle ones stumble more', () => {
    let sharp = 0;
    let gentle = 0;
    for (const seed of [1, 2, 3]) {
      sharp += field(0.95, seed, 80).reduce((s, r) => s + r.stumbles, 0);
      gentle += field(0.05, seed, 80).reduce((s, r) => s + r.stumbles, 0);
    }
    // 12 runner-runs of 80 s each.
    expect(sharp / 12).toBeLessThan(2.5);
    expect(gentle).toBeGreaterThan(sharp);
  });

  it('spreads skills around the remembered level', () => {
    const s = fieldSkills(0.5, 4, seededRandom(4));
    expect(s).toHaveLength(4);
    expect(Math.max(...s) - Math.min(...s)).toBeGreaterThan(0.15);
    for (const k of s) expect(k).toBeGreaterThan(0);
  });
});

describe('results', () => {
  const players: Record<number, string> = { 1: 'Rina', 2: 'Budi', 3: 'Sari', [-1]: 'Joko' };
  const nameOf = (id: number) => players[id] ?? '?';

  it('ranks Sprint by score and names the awards', () => {
    const { run } = setup('sprint', [
      { id: 1, cpu: false },
      { id: 2, cpu: false },
      { id: 3, cpu: false },
    ]);
    run.runner(1)!.coins = 9;
    run.runner(2)!.stumbles = 3;
    stepUntil(run, () => run.phase === 'done', 120);
    const res = buildResult(run, nameOf, []);
    expect(res.ranking.map((r) => r.playerId)[0]).toBe(1);
    expect(res.ranking[res.ranking.length - 1]!.playerId).toBe(2);
    expect(res.title).toContain('Rina');
    const titles = (res.awards ?? []).map((a) => a.playerId);
    expect(titles).toContain(1);
    expect(res.cpuPlayers).toBeUndefined();
  });

  it('describes computer runners and the solo outcome', () => {
    const cpu: PlayerInfo = {
      id: -1,
      name: 'Joko',
      fruit: 'durian',
      color: '#22B35E',
      connected: true,
      isHost: false,
    };
    const { run } = setup('survive', [
      { id: 1, cpu: false },
      { id: -1, cpu: true },
    ]);
    seconds(run, 1);
    run.runner(-1)!.d -= 40;
    run.step(DT);
    const rows = finalRows(run);
    expect(rows[0]!.id).toBe(1);
    expect(soloOutcome(rows, 1)).toBe('win');
    const res = buildResult(run, nameOf, [cpu]);
    expect(res.cpuPlayers).toHaveLength(1);
    expect(res.ranking).toHaveLength(2);
    expect(pickAwards(rows.slice(0, 1))).toEqual([]);
  });
});

describe('phone views', () => {
  it('shows the swipe pad while running and locks it with a banner once out', () => {
    const { run } = setup('survive', [
      { id: 1, cpu: false },
      { id: 2, cpu: false },
      { id: 3, cpu: false },
    ]);
    seconds(run, 2);
    const live = padView(run, run.runner(1)!, 1, '#F2453D');
    expect(live).toMatchObject({ kind: 'pad', mode: 'swipe', actionLabel: 'LOMPAT' });
    expect(live.kind === 'pad' && live.locked).toBeFalsy();
    expect(live.kind === 'pad' && live.title).toMatch(/^Jarak \d+ m$/);
    run.runner(3)!.d -= 30;
    run.step(DT);
    const out = padView(run, run.runner(3)!, 3, '#22B35E');
    expect(out).toMatchObject({ kind: 'pad', locked: true });
    expect(out.kind === 'pad' && out.banner).toBeTruthy();
    expect(countdownView(3, '#fff')).toMatchObject({ kind: 'countdown', value: '3' });
  });
});
