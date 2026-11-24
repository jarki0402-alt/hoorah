import { lookAt } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { canAddToPlate, food, glass, type Item, itemLook, plate, plateDish, stainOf } from './items';
import {
  CHOP_MS,
  COLS,
  COOK_MS,
  COUNTDOWN_MS,
  cellOf,
  type Difficulty,
  DOUSE_MS,
  FILL_MS,
  KITCHEN_DEFS,
  KITCHENS,
  type KitchenId,
  OVERFILL_MS,
  PLATE_RETURN_MS,
  ROWS,
  type Side,
  STAGGER_MS,
  sideOfX,
  starsFor,
  starThresholds,
  TUNING,
  WASH_MS,
} from './kitchens';
import { type Chef, DapurMatch, type MatchEvent, STEP_MS, type Station } from './logic';
import { PART_LINES, RECIPES } from './recipes';

const cook = (id: number, side: Side, name = `P${id}`) => ({
  id,
  name,
  fruit: 'jeruk' as const,
  look: lookAt(id),
  color: '#FF5A1F',
  side,
});

function setup(kitchen: KitchenId = 'terbelah', difficulty: Difficulty = 'normal', sides: Side[] = [0, 1]) {
  const m = new DapurMatch({
    kitchen,
    difficulty,
    cooks: sides.map((s, i) => cook(i + 1, s)),
    now: 0,
    seed: 7,
  });
  let t = 0;
  const events: MatchEvent[] = [];
  const run = (ms: number) => {
    const end = t + ms;
    while (t < end - 1e-6) {
      t += STEP_MS;
      m.step(t);
      events.push(...m.drainEvents());
    }
  };
  run(COUNTDOWN_MS + STEP_MS);
  return { m, run, events, now: () => t };
}

/** The station at a tile. */
function at(m: DapurMatch, x: number, y: number): Station {
  const s = m.stationAt(x, y);
  if (!s) throw new Error(`no station at ${x},${y}`);
  return s;
}

/** Stand next to a station tile, facing it. */
function face(m: DapurMatch, id: number, s: Station): Chef {
  const c = m.chef(id)!;
  const cx = s.x + 0.5;
  const cy = s.y + 0.5;
  // Pick the free neighbour tile on the cook's side.
  const opts: [number, number][] = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ];
  for (const [dx, dy] of opts) {
    const nx = s.x + dx;
    const ny = s.y + dy;
    if (m.solid(nx, ny)) continue;
    if (m.def.split && sideOfX(nx + 0.5) !== sideOfX(c.x)) continue;
    m.place(id, nx + 0.5 - dx * 0.15, ny + 0.5 - dy * 0.15, cx - (nx + 0.5), cy - (ny + 0.5));
    return c;
  }
  throw new Error('no free side');
}

describe('kitchen data', () => {
  it('every grid is 14x7 with known tiles', () => {
    for (const id of KITCHENS) {
      const g = KITCHEN_DEFS[id].grid;
      expect(g).toHaveLength(ROWS);
      for (const row of g) {
        expect(row).toHaveLength(COLS);
        for (const ch of row) expect(() => cellOf(ch)).not.toThrow();
      }
    }
  });

  it('every kitchen has what its menu needs, with one pass, sink, rack and trash per side', () => {
    for (const id of KITCHENS) {
      const def = KITCHEN_DEFS[id];
      const m = new DapurMatch({ kitchen: id, difficulty: 'normal', cooks: [], now: 0 });
      const kinds = new Set(m.stations.map((s) => s.kind));
      for (const k of ['pass', 'sink', 'rack', 'trash', 'board', 'cups', 'soda'] as const)
        expect(kinds, `${id} ${k}`).toContain(k);
      const sources = new Set(m.stations.map((s) => s.source).filter(Boolean));
      for (const dish of def.menu) {
        for (const part of RECIPES[dish].parts) {
          for (const line of PART_LINES[part]) {
            if (line === 'gelas' || line === 'piring') continue;
            expect(sources, `${id} ${dish} ${line}`).toContain(line);
          }
        }
      }
      expect(m.stations.filter((s) => s.kind === 'pass')).toHaveLength(1);
      // Every station except plain corner counters has a floor tile next to it.
      for (const s of m.stations) {
        if (s.kind === 'counter' && !s.item) continue;
        const free = [...Array(s.w).keys()].some((i) =>
          [
            [0, 1],
            [0, -1],
            [1, 0],
            [-1, 0],
          ].some(([dx, dy]) => !m.solid(s.x + i + dx!, s.y + dy!)),
        );
        expect(free, `${id} ${s.kind} at ${s.x},${s.y}`).toBe(true);
      }
      if (def.split) {
        // Food can only be thrown away into a bin on the side it is on.
        expect(m.stations.some((s) => s.kind === 'trash' && sideOfX(s.x + 0.5) === 0)).toBe(true);
        expect(m.stations.some((s) => s.kind === 'trash' && sideOfX(s.x + 0.5) === 1)).toBe(true);
      }
    }
  });

  it('star thresholds grow with the crew and the difficulty', () => {
    const def = KITCHEN_DEFS.terbelah;
    const two = starThresholds(def, 'normal', 2);
    expect(two).toEqual([...def.stars]);
    expect(starThresholds(def, 'normal', 4)[1]).toBeGreaterThan(two[1]);
    expect(starThresholds(def, 'santai', 2)[1]).toBeLessThan(two[1]);
    expect(starThresholds(def, 'heboh', 2)[1]).toBeGreaterThan(two[1]);
    expect(starsFor(0, two)).toBe(0);
    expect(starsFor(two[0], two)).toBe(1);
    expect(starsFor(two[1] + 1, two)).toBe(2);
    expect(starsFor(two[2], two)).toBe(3);
  });
});

describe('items and plates', () => {
  it('plates accept parts of a dish in any order, no duplicates, no strangers', () => {
    expect(canAddToPlate([], 'roti')).toBe(true);
    expect(canAddToPlate(['seladaPotong'], 'dagingMatang')).toBe(true);
    expect(canAddToPlate(['roti'], 'roti')).toBe(false);
    expect(canAddToPlate(['roti'], 'kentangGoreng')).toBe(false);
    expect(canAddToPlate([], 'daging')).toBe(false); // raw meat never goes on a plate
    expect(canAddToPlate([], 'tomat')).toBe(false); // whole tomato must be chopped first
    expect(plateDish(['seladaPotong', 'tomatPotong'])).toBe('salad');
    expect(plateDish(['roti', 'dagingMatang', 'tomatPotong', 'seladaPotong'])).toBe('burger');
    expect(plateDish(['roti', 'dagingMatang'])).toBeNull();
    expect(itemLook(plate(['kentangGoreng']))).toBe('kentangGoreng');
    expect(itemLook(glass(1))).toBe('soda');
  });

  it('stains take the colour of what hit', () => {
    expect(stainOf(food('tomatPotong'))).toBe('tomat');
    expect(stainOf(food('telur'))).toBe('telur');
    expect(stainOf(glass(1))).toBe('soda');
    expect(stainOf(plate(['nasiGoreng']))).toBe('kuah');
  });
});

describe('stations', () => {
  it('baskets hand out food, take it back, and fill a held plate', () => {
    const { m } = setup();
    const roti = at(m, 1, 0);
    face(m, 1, roti);
    expect(m.grab(1)).toBe(true);
    expect(m.chef(1)!.held).toEqual(food('roti'));
    expect(m.grab(1)).toBe(true);
    expect(m.chef(1)!.held).toBeNull();
    m.chef(1)!.held = plate();
    expect(m.grab(1)).toBe(true);
    expect(m.chef(1)!.held).toEqual(plate(['roti']));
  });

  it('chopping takes the full time of holding Kerja, and keeps its progress when picked up', () => {
    const { m, run } = setup();
    const board = at(m, 1, 6);
    face(m, 1, board);
    m.chef(1)!.held = food('tomat');
    m.grab(1);
    expect(board.item).toEqual(food('tomat'));
    m.hold(1, true);
    run(CHOP_MS / 2);
    m.hold(1, false);
    expect(board.item?.k === 'food' && board.item.food).toBe('tomat');
    m.grab(1); // pick up half-chopped
    const half = m.chef(1)!.held;
    expect(half?.k === 'food' && (half.chop ?? 0)).toBeGreaterThan(0.4);
    m.grab(1); // back on the board
    m.hold(1, true);
    run(CHOP_MS / 2 + 100);
    expect(board.item).toEqual(food('tomatPotong'));
    expect(m.chef(1)!.stats.chops).toBe(1);
  });

  it('a counter combines food and plate either way round', () => {
    const { m } = setup();
    const counter = at(m, 9, 6);
    face(m, 2, counter);
    m.chef(2)!.held = plate();
    m.grab(2);
    expect(counter.item).toEqual(plate());
    m.chef(2)!.held = food('dagingMatang');
    m.grab(2);
    expect(counter.item).toEqual(plate(['dagingMatang']));
    counter.item = food('roti');
    m.chef(2)!.held = plate(['tomatPotong']);
    m.grab(2);
    expect(m.chef(2)!.held).toEqual(plate(['roti', 'tomatPotong']));
    expect(counter.item).toBeNull();
  });

  it('nothing in reach: the item is set down on the floor and can be picked up again', () => {
    const { m } = setup();
    m.place(1, 3.5, 3.5, 1, 0);
    m.chef(1)!.held = food('kentang');
    expect(m.grab(1)).toBe(true);
    expect(m.floor).toHaveLength(1);
    expect(m.grab(1)).toBe(true);
    expect(m.chef(1)!.held).toEqual(food('kentang'));
    expect(m.floor).toHaveLength(0);
  });
});

describe('cooking and burning', () => {
  function stoveWithMeat(d: Difficulty) {
    const g = setup('terbelah', d);
    const stove = at(g.m, 8, 0);
    face(g.m, 2, stove);
    g.m.chef(2)!.held = food('daging');
    expect(g.m.grab(2)).toBe(true);
    return { ...g, stove };
  }

  it('meat cooks on the stove, then plates straight from it', () => {
    const { m, run, stove } = stoveWithMeat('normal');
    run(COOK_MS.stove - 200);
    expect(stove.item).toEqual(food('daging'));
    run(400);
    expect(stove.item).toEqual(food('dagingMatang'));
    m.chef(2)!.held = plate(['roti']);
    m.grab(2);
    expect(m.chef(2)!.held).toEqual(plate(['roti', 'dagingMatang']));
    expect(stove.item).toBeNull();
  });

  it('Santai never burns', () => {
    const { run, stove } = stoveWithMeat('santai');
    run(COOK_MS.stove + 60_000);
    expect(stove.item).toEqual(food('dagingMatang'));
  });

  it('Normal warns, then burns without fire', () => {
    const { run, stove, events } = stoveWithMeat('normal');
    const burn = TUNING.normal.burnMs!;
    run(COOK_MS.stove + burn - 2_000);
    expect(events.some((e) => e.type === 'burnWarn')).toBe(true);
    expect(stove.item).toEqual(food('dagingMatang'));
    run(2_200);
    expect(stove.item).toEqual(food('gosong'));
    expect(stove.fire).toBe(false);
    expect(events.some((e) => e.type === 'burnt' && e.by === 2)).toBe(true);
  });

  it('Heboh burns into a fire that blocks the stove until put out with the extinguisher', () => {
    const { m, run, stove } = stoveWithMeat('heboh');
    run(COOK_MS.stove + TUNING.heboh.burnMs! + 100);
    expect(stove.fire).toBe(true);
    // Blocked while burning.
    expect(m.grab(2)).toBe(false);
    m.chef(2)!.held = { k: 'extinguisher' };
    face(m, 2, stove);
    m.hold(2, true);
    run(DOUSE_MS + 50);
    expect(stove.fire).toBe(false);
    expect(m.chef(2)!.stats.firesOut).toBe(1);
    expect(m.chef(1)!.stats.burnt + m.chef(2)!.stats.burnt).toBe(1);
  });

  it('the wok needs both rice and egg, in any order', () => {
    const { m, run } = setup();
    const wok = at(m, 10, 0);
    face(m, 2, wok);
    m.chef(2)!.held = food('telur');
    m.grab(2);
    run(COOK_MS.wok + 500);
    expect(wok.item).toBeNull();
    expect(wok.pot).toEqual(['telur']);
    m.chef(2)!.held = food('nasi');
    m.grab(2);
    run(COOK_MS.wok + 100);
    expect(wok.item).toEqual(food('nasiGoreng'));
  });

  it('the fryer only takes chopped potato', () => {
    const { m } = setup();
    const fryer = at(m, 11, 0);
    face(m, 2, fryer);
    m.chef(2)!.held = food('kentang');
    expect(m.grab(2)).toBe(false);
    m.chef(2)!.held = food('kentangPotong');
    expect(m.grab(2)).toBe(true);
    expect(fryer.item).toEqual(food('kentangPotong'));
  });
});

describe('soda', () => {
  it('fills while Kerja is held at the machine', () => {
    const { m, run } = setup();
    const cups = at(m, 13, 1);
    face(m, 2, cups);
    m.grab(2);
    expect(m.chef(2)!.held).toEqual(glass(0));
    face(m, 2, at(m, 12, 0));
    m.hold(2, true);
    run(FILL_MS + 1_500);
    const g = m.chef(2)!.held as Extract<Item, { k: 'glass' }>;
    expect(g.fill).toBe(1); // Normal stops at full
  });

  it('Heboh spills when held too long past full', () => {
    const { m, run, events } = setup('terbelah', 'heboh');
    m.chef(2)!.held = glass(0);
    face(m, 2, at(m, 12, 0));
    m.hold(2, true);
    run(FILL_MS + OVERFILL_MS + 100);
    expect(m.chef(2)!.held).toBeNull();
    expect(events.some((e) => e.type === 'spill')).toBe(true);
  });
});

describe('movement', () => {
  it('the divider cannot be crossed', () => {
    const { m, run } = setup();
    m.place(1, 5.2, 3.5, 1, 0);
    m.steer(1, 1, 0);
    run(2_000);
    expect(m.chef(1)!.x).toBeLessThan(6);
  });

  it('cooks stop at counters', () => {
    const { m, run } = setup();
    m.place(1, 3.5, 3.5, 0, -1);
    m.steer(1, 0, -1);
    run(2_000);
    expect(m.chef(1)!.y).toBeGreaterThanOrEqual(1 + 0.29);
  });
});

describe('throwing', () => {
  it('flies to the nearest teammate across the divider and is caught by empty hands', () => {
    const { m, run, events } = setup('terbelah', 'normal', [0, 1, 1]);
    m.place(1, 5.5, 3.5, 1, 0);
    m.place(2, 8.5, 3.5);
    m.place(3, 12.5, 1.5);
    m.chef(1)!.held = food('tomatPotong');
    expect(m.throwItem(1)).toBe(true);
    expect(m.flights[0]!.toChef).toBe(2);
    run(1_100);
    expect(m.chef(2)!.held).toEqual(food('tomatPotong'));
    expect(m.chef(2)!.stats.catches).toBe(1);
    expect(m.chef(1)!.stats.goodThrows).toBe(1);
    expect(events.some((e) => e.type === 'catch')).toBe(true);
  });

  it('full hands on Normal: the item drops, the receiver is stained and staggers', () => {
    const { m, run, now } = setup();
    m.place(1, 5.5, 3.5, 1, 0);
    m.place(2, 8.5, 3.5);
    m.chef(2)!.held = food('roti');
    m.chef(1)!.held = food('tomat');
    m.throwItem(1);
    run(1_000);
    const r = m.chef(2)!;
    expect(r.held).toEqual(food('roti'));
    expect(r.stains).toHaveLength(1);
    expect(r.stains[0]!.kind).toBe('tomat');
    expect(r.staggerUntil).toBeGreaterThan(now() - 1_000);
    expect(r.staggerUntil - r.hitAt).toBeCloseTo(STAGGER_MS);
    expect(m.floor.map((f) => f.item)).toEqual([food('tomat')]);
    // The dropped food lies on the receiver's side.
    expect(sideOfX(m.floor[0]!.x)).toBe(1);
  });

  it('plated food breaks and a full soda spills; the plate comes back later', () => {
    const { m, run, events } = setup();
    m.place(1, 5.5, 3.5, 1, 0);
    m.place(2, 8.5, 3.5);
    m.chef(2)!.held = food('roti');
    m.chef(1)!.held = plate(['kentangGoreng']);
    m.throwItem(1);
    run(1_000);
    expect(events.some((e) => e.type === 'hit' && e.broke)).toBe(true);
    expect(m.floor).toHaveLength(0);
    expect(m.chef(1)!.stats.badThrows).toBe(1);
    run(PLATE_RETURN_MS);
    expect(m.stations.find((s) => s.kind === 'sink')!.dirty).toBe(1);
  });

  it('Santai skips full hands and lands on a free counter across, nobody gets hit', () => {
    const { m, run } = setup('terbelah', 'santai');
    m.place(1, 5.5, 3.5, 1, 0);
    m.place(2, 8.5, 3.5);
    m.chef(2)!.held = food('roti');
    m.chef(1)!.held = food('tomatPotong');
    m.throwItem(1);
    expect(m.flights[0]!.toChef).toBeNull();
    const to = m.stations[m.flights[0]!.toStation!]!;
    expect(sideOfX(to.x + 0.5)).toBe(1);
    run(1_100);
    expect(to.item).toEqual(food('tomatPotong'));
    expect(m.chef(2)!.stains).toHaveLength(0);
  });

  it('Santai: hands filled during the flight still never hurt', () => {
    const { m, run } = setup('terbelah', 'santai');
    m.place(1, 5.5, 3.5, 1, 0);
    m.place(2, 8.5, 3.5);
    m.chef(1)!.held = food('telur');
    m.throwItem(1);
    expect(m.flights[0]!.toChef).toBe(2);
    m.chef(2)!.held = food('nasi');
    run(1_100);
    expect(m.chef(2)!.stains).toHaveLength(0);
    expect(m.stations.some((s) => s.item?.k === 'food' && s.item.food === 'telur')).toBe(true);
  });

  it('nobody across: lands on the nearest free counter across', () => {
    const { m, run } = setup('terbelah', 'normal', [0, 0]);
    m.place(1, 5.5, 3.5, 1, 0);
    m.chef(1)!.held = food('daging');
    expect(m.throwItem(1)).toBe(true);
    run(1_100);
    const landed = m.stations.find((s) => s.item?.k === 'food' && s.item.food === 'daging');
    expect(landed && sideOfX(landed.x + 0.5)).toBe(1);
  });

  it('open kitchen: the throw goes to the nearest teammate anywhere', () => {
    const { m } = setup('warung', 'normal', [0, 1, 1]);
    m.place(1, 3.5, 2.5, 1, 0);
    m.place(2, 4.5, 4.5);
    m.place(3, 11.5, 2.5);
    m.chef(1)!.held = food('roti');
    m.throwItem(1);
    expect(m.flights[0]!.toChef).toBe(2);
  });

  it('a stained apron is cleaned at the sink with empty hands', () => {
    const { m, run } = setup();
    const c = m.chef(1)!;
    c.stains.push({ kind: 'telur', u: 0, v: 0, s: 1 });
    face(m, 1, at(m, 0, 2));
    m.hold(1, true);
    run(1_000);
    expect(c.stains).toHaveLength(0);
  });
});

describe('plates cycle and orders', () => {
  it('serving a dish scores with a tip, sends the plate back dirty, washing refills the rack', () => {
    const { m, run } = setup();
    const pass = m.stations.find((s) => s.kind === 'pass')!;
    const rack = m.stations.find((s) => s.kind === 'rack')!;
    const sink = m.stations.find((s) => s.kind === 'sink')!;
    expect(m.orders.tickets[0]!.dish).toBe('kentang');
    face(m, 2, rack);
    const before = rack.plates;
    m.grab(2);
    expect(rack.plates).toBe(before - 1);
    m.chef(2)!.held = plate(['kentangGoreng']);
    face(m, 2, pass);
    expect(m.grab(2)).toBe(true);
    const served = m.drainEvents().find((e) => e.type === 'served');
    expect(served?.type === 'served' && served.served.complete).toBe(true);
    expect(m.score).toBeGreaterThan(RECIPES.kentang.points);
    expect(m.orders.delivered).toBe(1);
    expect(m.chef(2)!.stats.deliveries).toBe(1);
    run(PLATE_RETURN_MS + 50);
    expect(sink.dirty).toBe(1);
    face(m, 1, sink);
    m.hold(1, true);
    run(WASH_MS + 50);
    expect(sink.dirty).toBe(0);
    expect(rack.plates).toBe(before);
    expect(m.chef(1)!.stats.washed).toBe(1);
  });

  it('a wrong dish is refused at the pass', () => {
    const { m } = setup();
    const pass = m.stations.find((s) => s.kind === 'pass')!;
    m.chef(2)!.held = plate(['nasiGoreng']);
    face(m, 2, pass);
    expect(m.grab(2)).toBe(false);
    expect(m.chef(2)!.held).toEqual(plate(['nasiGoreng']));
  });

  it('tickets run out with a penalty and new ones keep coming, never more than four', () => {
    const { m, run, events } = setup();
    run(140_000);
    expect(m.orders.missed).toBeGreaterThan(0);
    expect(m.orders.tickets.length).toBeLessThanOrEqual(4);
    expect(events.filter((e) => e.type === 'order').length).toBeGreaterThan(4);
    expect(m.score).toBe(0); // never below zero
  });

  it('a paket needs both the burger and the soda', () => {
    const { m } = setup();
    const k = { id: 99, dish: 'paket' as const, t0: m.now, waitMs: 90_000, got: [] };
    m.orders.tickets.splice(0, m.orders.tickets.length, k);
    const r1 = m.orders.serve('soda', m.now);
    expect(r1?.complete).toBe(false);
    const r2 = m.orders.serve('burger', m.now);
    expect(r2?.complete).toBe(true);
    expect(r2!.points).toBe(RECIPES.paket.points);
  });

  it('the round ends with time up, then done', () => {
    const { m, run, events } = setup('warung', 'normal');
    run(TUNING.normal.roundMs + 10_000);
    expect(events.some((e) => e.type === 'warning')).toBe(true);
    expect(events.some((e) => e.type === 'timeUp')).toBe(true);
    expect(events.some((e) => e.type === 'done')).toBe(true);
    expect(m.phase).toBe('done');
  });
});

describe('Jam Sibuk', () => {
  it('announces, then moves the stoves with their contents', () => {
    const { m, run, events } = setup('sibuk');
    const stove = at(m, 8, 0);
    stove.item = food('daging');
    run(TUNING.normal.roundMs / 2 + 100);
    expect(events.findIndex((e) => e.type === 'moveWarn')).toBeLessThan(
      events.findIndex((e) => e.type === 'move'),
    );
    expect(m.stationAt(8, 6)).toBe(stove);
    expect(m.stationAt(8, 0)?.kind).toBe('counter');
    expect(stove.item?.k).toBe('food');
  });
});

describe('joining and leaving', () => {
  it('a leaver drops what they held; a newcomer joins the smaller side', () => {
    const { m } = setup('terbelah', 'normal', [0, 0, 1]);
    m.chef(3)!.held = food('roti');
    m.removeChef(3);
    expect(m.floor).toHaveLength(1);
    expect(m.smallerSide()).toBe(1);
    const c = m.addChef(
      { id: 9, name: 'Baru', fruit: 'nanas', look: lookAt(9), color: '#22B35E' },
      m.smallerSide(),
    );
    expect(sideOfX(c.x)).toBe(1);
  });
});

describe('targeting', () => {
  // Warung Pagi, back row: Tomat basket at (3,0), Selada basket at (4,0); the cook stands below.
  const Y = 1.3;

  it('where two counters meet, the one the cook is lined up with wins', () => {
    const { m } = setup('warung', 'normal', [0]);
    const tomat = at(m, 3, 0);
    const selada = at(m, 4, 0);
    m.chef(1)!.target = null;
    m.place(1, 3.9, Y, 0, -1);
    expect(m.chef(1)!.target).toBe(tomat.id);
    m.chef(1)!.target = null;
    m.place(1, 4.1, Y, 0, -1);
    expect(m.chef(1)!.target).toBe(selada.id);
  });

  it('keeps the current station until another one is clearly better', () => {
    const { m } = setup('warung', 'normal', [0]);
    const tomat = at(m, 3, 0);
    const selada = at(m, 4, 0);
    m.place(1, 3.5, Y, 0, -1);
    expect(m.chef(1)!.target).toBe(tomat.id);
    // Just past the seam: still Tomat, no flicker.
    m.place(1, 4.05, Y, 0, -1);
    expect(m.chef(1)!.target).toBe(tomat.id);
    // Well in front of Selada: it takes over.
    m.place(1, 4.4, Y, 0, -1);
    expect(m.chef(1)!.target).toBe(selada.id);
  });

  it('holding Kerja locks the station while it stays in reach', () => {
    const { m } = setup('warung', 'normal', [0]);
    const tomat = at(m, 3, 0);
    const selada = at(m, 4, 0);
    m.place(1, 3.5, Y, 0, -1);
    m.hold(1, true);
    m.place(1, 4.4, Y, 0, -1);
    expect(m.chef(1)!.target).toBe(tomat.id);
    m.hold(1, false);
    m.place(1, 4.4, Y, 0, -1);
    expect(m.chef(1)!.target).toBe(selada.id);
  });

  it('scores the two-tile pass from whichever of its tiles is nearer', () => {
    const { m } = setup('warung', 'normal', [0]);
    const pass = at(m, 7, 6);
    expect(at(m, 8, 6)).toBe(pass);
    for (const x of [7.5, 8.5]) {
      m.chef(1)!.target = null;
      m.place(1, x, 5.7, 0, 1);
      expect(m.chef(1)!.target).toBe(pass.id);
    }
  });
});
