import { lookAt } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { GUIDE_DONE_MS, Guide, type GuideStepId, SKIP_CONFIRM_MS } from './guide';
import { food } from './items';
import { CHOP_MS, COOK_MS, COUNTDOWN_MS, type KitchenId, type Side, sideOfX, TUNING } from './kitchens';
import { type Chef, DapurMatch, PRACTICE_DISH, STEP_MS, type Station } from './logic';
import { STR } from './strings';
import { padView } from './views';

interface Cook {
  side: Side;
  cpu?: boolean;
}

function practice(kitchen: KitchenId, cooks: Cook[], difficulty: 'normal' | 'heboh' = 'normal') {
  const m = new DapurMatch({
    kitchen,
    difficulty,
    cooks: cooks.map((c, i) => ({
      id: c.cpu ? -(i + 1) : i + 1,
      name: `K${i + 1}`,
      fruit: 'jeruk' as const,
      look: lookAt(i),
      color: '#FF5A1F',
      side: c.side,
      cpu: c.cpu ?? false,
    })),
    now: 0,
    seed: 3,
    practice: true,
  });
  const g = Guide.for(m);
  if (!g) throw new Error('no guide');
  let t = 0;
  const seen: GuideStepId[] = [];
  const run = (ms: number) => {
    const end = t + ms;
    while (t < end - 1e-6) {
      t += STEP_MS;
      m.step(t);
      for (const e of m.drainEvents()) g.onEvent(e, t);
      g.update(m, t);
      if (seen[seen.length - 1] !== g.step) seen.push(g.step);
    }
  };
  run(COUNTDOWN_MS + STEP_MS);
  /** Try the joystick (step 1) before teleporting next to stations. */
  const stroll = (id = 1) => {
    for (const [x, y] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      m.steer(id, x, y);
      run(300);
      m.steer(id, 0, 0);
      if ((m.chef(id)?.walked ?? 0) >= 0.6) return;
    }
    throw new Error('could not walk');
  };
  return { m, g, run, seen, stroll, now: () => t };
}

function station(m: DapurMatch, pick: (s: Station) => boolean): Station {
  const s = m.stations.find(pick);
  if (!s) throw new Error('no station');
  return s;
}

/** Stand next to a station tile on the cook's side, facing it. */
function face(m: DapurMatch, id: number, s: Station): Chef {
  const c = m.chef(id)!;
  for (const [dx, dy] of [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ] as const) {
    const nx = s.x + dx;
    const ny = s.y + dy;
    if (m.solid(nx, ny)) continue;
    if (m.def.split && sideOfX(nx + 0.5) !== c.side) continue;
    m.place(id, nx + 0.5 - dx * 0.15, ny + 0.5 - dy * 0.15, s.x + 0.5 - (nx + 0.5), s.y + 0.5 - (ny + 0.5));
    return c;
  }
  throw new Error('no free side');
}

const isBasket = (s: Station) => s.kind === 'basket' && s.source === 'kentang';

describe('practice match', () => {
  it('opens with the practice dish, no clock, no new tickets, no misses', () => {
    const { m, run } = practice('warung', [{ side: 0 }]);
    expect(m.practice).toBe(true);
    expect(m.phase).toBe('play');
    expect(m.orders.tickets.map((k) => k.dish)).toEqual([PRACTICE_DISH]);
    run(TUNING.normal.roundMs + 10_000);
    expect(m.phase).toBe('play');
    expect(m.timeLeft(m.now)).toBe(TUNING.normal.roundMs);
    expect(m.orders.tickets).toHaveLength(1);
    expect(m.orders.missed).toBe(0);
  });

  it('nothing burns while practising, even on Heboh', () => {
    const { m, run } = practice('warung', [{ side: 0 }], 'heboh');
    const fryer = station(m, (s) => s.kind === 'fryer');
    fryer.item = food('kentangPotong');
    run(COOK_MS.fryer + 60_000);
    expect(fryer.item).toEqual(food('kentangGoreng'));
    expect(fryer.fire).toBe(false);
  });

  it('endPractice resets the kitchen and starts the real countdown', () => {
    const { m, run, now } = practice('terbelah', [{ side: 0 }, { side: 1 }]);
    const basket = station(m, isBasket);
    face(m, 1, basket);
    m.grab(1);
    station(m, (s) => s.kind === 'rack').plates = 0;
    m.chef(1)!.stats.chops = 3;
    run(STEP_MS);
    const t = now();
    m.endPractice(t);
    expect(m.practice).toBe(false);
    expect(m.phase).toBe('countdown');
    expect(m.goAt).toBe(t + COUNTDOWN_MS);
    expect(m.endAt).toBe(m.goAt + TUNING.normal.roundMs);
    expect(m.chef(1)!.held).toBeNull();
    expect(m.chef(1)!.stats.chops).toBe(0);
    expect(station(m, (s) => s.kind === 'rack').plates).toBe(m.def.plates);
    expect(m.orders.tickets).toHaveLength(0);
    expect(m.score).toBe(0);
    run(COUNTDOWN_MS + STEP_MS);
    expect(m.phase).toBe('play');
    expect(m.orders.tickets.map((k) => k.dish)).toEqual([m.def.first]);
    run(1_000);
    expect(m.timeLeft(m.now)).toBeLessThan(TUNING.normal.roundMs);
  });
});

describe('guide', () => {
  it('open kitchen: every step shows only after it was done, with the arrow and button for it', () => {
    const { m, g, run, seen, now } = practice('warung', [{ side: 0 }]);
    const me = m.chef(1)!;
    const basket = station(m, isBasket);
    const fryer = station(m, (s) => s.kind === 'fryer');
    const rack = station(m, (s) => s.kind === 'rack');
    const pass = station(m, (s) => s.kind === 'pass');
    expect(g.steps).not.toContain('throw');
    expect(g.total).toBe(9);

    expect(g.step).toBe('order');
    expect(g.target(m)).toEqual({ kind: 'ticket' });
    expect(g.buttonFor(me)).toBeNull();
    run(2_000);
    expect(g.step).toBe('order');
    m.steer(1, 1, 0);
    run(400);
    m.steer(1, 0, 0);
    expect(g.step).toBe('walk');
    expect(g.target(m)).toEqual({ kind: 'station', id: basket.id });

    face(m, 1, basket);
    run(STEP_MS);
    expect(g.step).toBe('take');
    expect(g.buttonFor(me)).toBe('grab');

    m.grab(1);
    run(STEP_MS);
    expect(g.step).toBe('board');
    const target = g.target(m);
    expect(target?.kind).toBe('station');
    const board = m.stations[target?.kind === 'station' ? target.id : -1]!;
    expect(board.kind).toBe('board');

    face(m, 1, board);
    m.grab(1);
    run(STEP_MS);
    expect(g.step).toBe('chop');
    expect(g.buttonFor(me)).toBe('work');
    m.hold(1, true);
    run(CHOP_MS / 2);
    expect(g.step).toBe('chop');
    run(CHOP_MS);
    m.hold(1, false);
    expect(g.step).toBe('fry');
    // The arrow first shows where the chopped potato is, then the fryer once it is in hand.
    expect(g.target(m)).toEqual({ kind: 'station', id: board.id });
    m.grab(1);
    run(STEP_MS);
    expect(g.target(m)).toEqual({ kind: 'station', id: fryer.id });

    face(m, 1, fryer);
    m.grab(1);
    run(STEP_MS);
    expect(g.step).toBe('rack');
    expect(g.target(m)).toEqual({ kind: 'station', id: rack.id });

    face(m, 1, rack);
    m.grab(1);
    run(STEP_MS);
    expect(g.step).toBe('plate');
    expect(g.waiting).toBe(true);
    expect(g.buttonFor(me)).toBeNull();
    run(COOK_MS.fryer);
    expect(g.waiting).toBe(false);
    expect(g.buttonFor(me)).toBe('grab');

    face(m, 1, fryer);
    m.grab(1);
    run(STEP_MS);
    expect(g.step).toBe('serve');
    expect(g.target(m)).toEqual({ kind: 'station', id: pass.id });

    face(m, 1, pass);
    m.grab(1);
    run(STEP_MS);
    expect(g.finished).toBe(true);
    expect(g.target(m)).toBeNull();
    expect(g.over(now())).toBe(false);
    run(GUIDE_DONE_MS + 50);
    expect(g.over(now())).toBe(true);
    expect(seen).toEqual(['order', 'walk', 'take', 'board', 'chop', 'fry', 'rack', 'plate', 'serve']);
  });

  it('goes back a step when the potato is put back, and skips ahead when two things happen at once', () => {
    const { m, g, run, stroll } = practice('warung', [{ side: 0 }]);
    stroll();
    const basket = station(m, isBasket);
    face(m, 1, basket);
    m.grab(1);
    run(STEP_MS);
    // Picking it up straight away also counts as having walked there.
    expect(g.step).toBe('board');
    m.grab(1);
    run(STEP_MS);
    expect(m.chef(1)!.held).toBeNull();
    expect(g.step).toBe('take');
  });

  it('split kitchen with a lone player: Lempar step, then the idle helper takes over its side', () => {
    const { m, g, run } = practice('terbelah', [{ side: 0 }, { side: 1, cpu: true }]);
    const me = m.chef(1)!;
    const helper = m.chef(-2)!;
    expect(g.steps).toContain('throw');
    expect(g.total).toBe(10);
    expect(g.helper(m)).toBeNull();

    const basket = station(m, isBasket);
    face(m, 1, basket);
    m.grab(1);
    run(STEP_MS);
    const board = station(m, (s) => s.kind === 'board' && s.x < 7);
    face(m, 1, board);
    m.grab(1);
    m.hold(1, true);
    run(CHOP_MS + 100);
    m.hold(1, false);
    expect(g.step).toBe('throw');
    expect(g.buttonFor(me)).toBe('grab');
    expect(g.helper(m)).toBeNull();
    m.grab(1);
    run(STEP_MS);
    expect(g.buttonFor(me)).toBe('throw');
    expect(g.target(m)).toEqual({ kind: 'chef', id: helper.id });

    m.throwItem(1);
    run(STEP_MS);
    expect(g.step).toBe('throw');
    run(1_100);
    expect(helper.held).toEqual(food('kentangPotong'));
    expect(g.step).toBe('fry');
    expect(g.side).toBe(1);
    expect(g.canAct(me)).toBe(false);
    expect(g.buttonFor(me)).toBeNull();
    expect(g.helper(m)?.id).toBe(helper.id);
  });

  it('two people in a split kitchen: no helper, each side does its own steps', () => {
    const { m, g } = practice('terbelah', [{ side: 0 }, { side: 1 }]);
    face(m, 1, station(m, isBasket));
    m.grab(1);
    expect(g.helper(m)).toBeNull();
  });

  it('Lewati needs a second tap within a few seconds', () => {
    const { g } = practice('warung', [{ side: 0 }]);
    expect(g.skip(1, 1_000)).toBe(false);
    expect(g.armed(1, 1_000 + SKIP_CONFIRM_MS - 1)).toBe(true);
    expect(g.armed(2, 1_000)).toBe(false);
    expect(g.skip(1, 1_000 + SKIP_CONFIRM_MS + 1)).toBe(false);
    expect(g.skip(1, 1_000 + SKIP_CONFIRM_MS + 500)).toBe(true);
    expect(g.skipped).toBe(true);
    expect(g.over(0)).toBe(true);
  });

  it('is built for every kitchen', () => {
    for (const k of ['warung', 'terbelah', 'gerobak', 'sibuk'] as const) {
      const { g } = practice(k, [{ side: 0 }, { side: 1 }]);
      expect(g.steps[0]).toBe('order');
      expect(g.steps[g.steps.length - 1]).toBe('serve');
    }
  });
});

describe('practice phone views', () => {
  it('marks the button to press, puts Lewati in the third slot and shows the step', () => {
    const { m, g, run, stroll, now } = practice('warung', [{ side: 0 }]);
    stroll();
    face(m, 1, station(m, isBasket));
    run(STEP_MS);
    const v = padView(m, m.chef(1)!, now(), g);
    if (v.kind !== 'pad') throw new Error('pad expected');
    expect(v.eyebrow).toBe(STR.guide.phoneEyebrow(3, 9));
    expect(v.title).toBe(STR.guide.steps.take.phone);
    expect(v.buttons?.[0]).toMatchObject({ id: 'grab', pulse: true, sub: STR.guide.tapNow });
    expect(v.buttons?.[1]?.pulse).toBeUndefined();
    expect(v.buttons?.[2]).toMatchObject({ id: 'skip', label: STR.guide.skip });
    expect(v.alert?.tone).toBe('yellow');

    g.skip(1, now());
    const armed = padView(m, m.chef(1)!, now(), g);
    expect(armed.kind === 'pad' && armed.buttons?.[2]?.label).toBe(STR.guide.skipSure);
  });

  it('keeps Lempar for the thrower during the throw step', () => {
    const { m, g, run, now } = practice('terbelah', [{ side: 0 }, { side: 1 }]);
    const me = m.chef(1)!;
    face(m, 1, station(m, isBasket));
    m.grab(1);
    run(STEP_MS);
    face(
      m,
      1,
      station(m, (s) => s.kind === 'board' && s.x < 7),
    );
    m.grab(1);
    m.hold(1, true);
    run(CHOP_MS + 100);
    m.hold(1, false);
    m.grab(1);
    run(STEP_MS);
    expect(g.step).toBe('throw');
    const v = padView(m, me, now(), g);
    expect(v.kind === 'pad' && v.buttons?.[2]).toMatchObject({ id: 'throw', pulse: true });
    const other = padView(m, m.chef(2)!, now(), g);
    expect(other.kind === 'pad' && other.title).toBe(STR.guide.watch);
    expect(other.kind === 'pad' && other.buttons?.[2]?.id).toBe('skip');
  });
});
