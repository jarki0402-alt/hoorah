import { describe, expect, it } from 'vitest';
import { COLS, hitAt, isLand, isOpen, type Lane } from './lanes';
import { FAR, NyebrangMatch, type Runner, TUNING } from './logic';

const FRAME = 1 / 60;

function start(far: boolean): NyebrangMatch {
  const m = new NyebrangMatch({
    rounds: 1,
    seed: 42,
    runners: [
      { id: 1, name: 'Jauh', cpu: false },
      { id: 2, name: 'Dekat', cpu: false },
    ],
  });
  m.far = far;
  m.pick('balapan');
  m.next();
  m.pick('kota');
  m.next();
  for (let i = 0; i < Math.round((TUNING.introS + TUNING.countS + 0.05) / FRAME); i++) m.step(FRAME);
  expect(m.phase).toBe('run');
  return m;
}

/** A road row with land on both sides, high enough that the camera never reaches it here. */
function roadBetweenLand(m: NyebrangMatch): { row: number; col: number; lane: Lane } {
  for (let row = 20; row < 400; row++) {
    const lane = m.world.lane(row);
    const below = m.world.lane(row - 1);
    const above = m.world.lane(row + 1);
    if (lane.kind !== 'road' || !isLand(below.kind) || !isLand(above.kind)) continue;
    const col = [...Array(COLS).keys()].find((c) => isOpen(below, c) && isOpen(above, c));
    if (col !== undefined) return { row, col, lane };
  }
  throw new Error('no road between land rows');
}

const hitBetween = (lane: Lane, x: number, a: number, b: number, step = 1 / 240): boolean => {
  for (let t = a; t <= b; t += step) if (hitAt(lane, t, x)) return true;
  return false;
};

/** Both runners of both matches stand at the same cell; the leader (id 2) stays far ahead. */
function place(ms: NyebrangMatch[], row: number, col: number): void {
  for (const m of ms) {
    const r = m.runner(1)!;
    r.row = row;
    r.x = col;
    const lead = m.runner(2)!;
    lead.row = row + 3;
    lead.x = col;
    // Keep the leader out of harm's way: it is not part of these tests.
    lead.state = 'done';
  }
}

const snapshot = (r: Runner) => ({
  x: r.x,
  row: r.row,
  state: r.state,
  hop: r.hop,
  death: r.death,
  deadAt: r.deadAt,
  hops: r.hops,
});

describe('Nyebrang judging on the Host (not mirrored)', () => {
  it('ignores stamps and lag: exactly the local judging', () => {
    const a = start(false);
    const b = start(false);
    const { row, col } = roadBetweenLand(a);
    place([a, b], row - 1, col);
    a.setLag(1, 0.4);
    expect(a.pressedAt(0.3)).toBeUndefined();
    for (let i = 0; i < 600; i++) {
      if (i % 7 === 0) {
        const dir = i % 21 === 0 ? 'down' : 'up';
        a.input(1, dir, a.t - 0.3);
        b.input(1, dir);
      }
      a.step(FRAME);
      b.step(FRAME);
      expect(snapshot(a.runner(1)!)).toEqual(snapshot(b.runner(1)!));
    }
  });
});

describe('Nyebrang judging while a far-away screen watches', () => {
  it('bounds phone stamps', () => {
    const m = start(true);
    expect(m.pressedAt(0.25)).toBeCloseTo(m.t - 0.25, 9);
    expect(m.pressedAt(-0.1)).toBe(m.t);
    expect(m.pressedAt(FAR.maxAge + 0.01)).toBeUndefined();
    expect(m.pressedAt(-FAR.maxAhead - 0.01)).toBeUndefined();
    expect(m.pressedAt(Number.NaN)).toBeUndefined();
  });

  it('measures a phone lag that rises at once and eases down', () => {
    const m = start(true);
    const r = m.runner(1)!;
    m.setLag(1, 0.3);
    expect(r.lag).toBeCloseTo(0.3, 9);
    m.setLag(1, FAR.maxAge + 0.5);
    expect(r.lag).toBeCloseTo(0.3, 9);
    m.setLag(1, 0.1);
    expect(r.lag).toBeGreaterThan(0.25);
    expect(r.lag).toBeLessThan(0.3);
  });

  it('judges a late hop at its stamp: a far player who crossed in the gap is not run over', () => {
    const LAG = 0.3;
    const SECOND = 9; // frames between the two swipes (0.15 s)
    const far = start(true);
    const local = start(false);
    const { row, col, lane } = roadBetweenLand(far);
    place([far, local], row - 1, col);
    let found = false;
    for (let i = 0; i < 60 * 40 && !found; i++) {
      const t = far.t;
      // On the far screen: up at t - LAG and again 0.15 s later, both while the road is clear.
      const a = t - LAG;
      const clear = !hitBetween(lane, col, a + TUNING.hop / 2, a + SECOND * FRAME + TUNING.hop / 2);
      // On arrival the same two hops would stand on the road while a car comes through.
      let hitLate = false;
      for (let k = 4; k <= SECOND + 3; k++) if (hitAt(lane, t + k * FRAME, col)) hitLate = true;
      if (clear && hitLate && a > far.t - far.runT + 0.01) {
        found = true;
        // As the driver does with every frame from the phone.
        far.setLag(1, LAG);
        far.input(1, 'up', far.pressedAt(LAG));
        local.input(1, 'up', local.pressedAt(LAG));
        for (let k = 0; k < SECOND; k++) {
          far.step(FRAME);
          local.step(FRAME);
        }
        far.setLag(1, LAG);
        far.input(1, 'up', far.pressedAt(LAG));
        local.input(1, 'up', local.pressedAt(LAG));
        for (let k = 0; k < 30; k++) {
          far.step(FRAME);
          local.step(FRAME);
        }
        break;
      }
      far.step(FRAME);
      local.step(FRAME);
    }
    expect(found).toBe(true);
    const r = far.runner(1)!;
    expect(r.state).toBe('run');
    expect(r.row).toBe(row + 1);
    const l = local.runner(1)!;
    expect(l.state).toBe('dead');
    expect(l.death).toBe('hit');
  });

  it('holds a hit open for a lagging phone: a hop swiped just before it gets away', () => {
    const LAG = 0.3;
    const far = start(true);
    const local = start(false);
    const { row, col, lane } = roadBetweenLand(far);
    // Stand on the road at a clear moment.
    while (hitBetween(lane, col, far.t - 0.2, far.t + 0.2)) {
      far.step(FRAME);
      local.step(FRAME);
    }
    place([far, local], row, col);
    far.setLag(1, LAG);
    // Wait for the car.
    let guard = 0;
    while (local.runner(1)!.state === 'run' && guard++ < 60 * 30) {
      far.step(FRAME);
      local.step(FRAME);
    }
    const hitAtT = local.runner(1)!.deadAt;
    const r = far.runner(1)!;
    expect(r.state).toBe('run');
    expect(r.pending?.at).toBeCloseTo(hitAtT, 9);
    // The swipe made 0.1 s before the hit arrives 0.2 s after it.
    for (let k = 0; k < 12; k++) far.step(FRAME);
    expect(r.state).toBe('run');
    far.input(1, 'up', far.pressedAt(far.t - (hitAtT - 0.1)));
    expect(r.pending).toBeNull();
    for (let k = 0; k < 20; k++) far.step(FRAME);
    expect(r.state).toBe('run');
    expect(r.row).toBe(row + 1);
  });

  it('confirms a held hit when no earlier swipe comes, at the moment it happened', () => {
    const far = start(true);
    const { row, col, lane } = roadBetweenLand(far);
    while (hitBetween(lane, col, far.t - 0.2, far.t + 0.2)) far.step(FRAME);
    place([far], row, col);
    far.setLag(1, 0.3);
    const r = far.runner(1)!;
    let guard = 0;
    while (!r.pending && guard++ < 60 * 30) far.step(FRAME);
    const hit = r.pending!;
    expect(hit.until - hit.at).toBeCloseTo(Math.min(FAR.rescueMax, r.lag + FAR.rescueExtra), 9);
    // A swipe made after the hit does not save it.
    far.input(1, 'up', far.t);
    expect(r.pending).not.toBeNull();
    while (r.state === 'run' && guard++ < 60 * 30) far.step(FRAME);
    expect(r.state).toBe('dead');
    expect(r.death).toBe('hit');
    expect(r.deadAt).toBeCloseTo(hit.at, 9);
  });

  it('judges a near phone like a local one', () => {
    const far = start(true);
    const { row, col, lane } = roadBetweenLand(far);
    while (hitBetween(lane, col, far.t - 0.2, far.t + 0.2)) far.step(FRAME);
    place([far], row, col);
    far.setLag(1, 0.02);
    const r = far.runner(1)!;
    let guard = 0;
    while (r.state === 'run' && guard++ < 60 * 30) {
      far.step(FRAME);
      expect(r.pending).toBeNull();
    }
    expect(r.death).toBe('hit');
  });
});
