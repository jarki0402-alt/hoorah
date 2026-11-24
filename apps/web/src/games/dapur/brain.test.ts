import { lookAt } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { seeded } from '../../shared/art/svg';
import { CookBrain, styleFor } from './brain';
import { food } from './items';
import { COUNTDOWN_MS, type Difficulty, type KitchenId, type Side, sideOfX, TUNING } from './kitchens';
import { DapurMatch, STEP_MS } from './logic';

function simulate(kitchen: KitchenId, difficulty: Difficulty, sides: Side[], skill: number, seed = 1) {
  const m = new DapurMatch({
    kitchen,
    difficulty,
    cooks: sides.map((side, i) => ({
      id: i + 1,
      name: `C${i + 1}`,
      fruit: 'nanas' as const,
      look: lookAt(i),
      color: '#22B35E',
      side,
    })),
    now: 0,
    seed,
  });
  const rnd = seeded(seed * 31 + 7);
  for (const c of m.chefs) m.setPilot(c.id, new CookBrain(styleFor(skill), c.side, rnd));
  let t = 0;
  const end = COUNTDOWN_MS + TUNING[difficulty].roundMs + 100;
  while (t < end) {
    t += STEP_MS;
    m.step(t);
    m.drainEvents();
  }
  return m;
}

describe('computer cooks', () => {
  it('two brains run Dapur Terbelah across the divider and earn stars', () => {
    const m = simulate('terbelah', 'normal', [0, 1], 0.6);
    expect(m.orders.delivered).toBeGreaterThanOrEqual(4);
    expect(m.stars()).toBeGreaterThanOrEqual(1);
    // Everyone stayed on their own side of the wall.
    for (const c of m.chefs) expect(sideOfX(c.x)).toBe(c.side);
  });

  it('a sharper pair does better than a gentle one (on average over seeds)', () => {
    let gentle = 0;
    let sharp = 0;
    for (const seed of [1, 2, 3]) {
      gentle += simulate('terbelah', 'normal', [0, 1], 0.1, seed).score;
      sharp += simulate('terbelah', 'normal', [0, 1], 0.9, seed).score;
    }
    expect(sharp).toBeGreaterThan(gentle);
  });

  it('works the open kitchen, the Masak helper leaving the chopping to the other cook', () => {
    const m = simulate('warung', 'normal', [0, 1], 0.6);
    expect(m.orders.delivered).toBeGreaterThanOrEqual(3);
    expect(m.chef(2)!.stats.chops).toBe(0);
  });

  it('copes with Heboh fires', () => {
    const m = simulate('sibuk', 'heboh', [0, 1], 0.6);
    expect(m.stations.some((s) => s.fire)).toBe(false);
    expect(m.orders.delivered).toBeGreaterThanOrEqual(2);
  });

  it('sets full hands down when something is thrown at it', () => {
    const m = new DapurMatch({
      kitchen: 'terbelah',
      difficulty: 'normal',
      cooks: [
        { id: 1, name: 'A', fruit: 'jeruk', look: lookAt(1), color: '#FF5A1F', side: 0 },
        { id: 2, name: 'B', fruit: 'nanas', look: lookAt(2), color: '#22B35E', side: 1 },
      ],
      now: 0,
    });
    let t = 0;
    while (t < COUNTDOWN_MS + 50) {
      t += STEP_MS;
      m.step(t);
    }
    m.place(1, 5.5, 3.5, 1, 0);
    m.place(2, 9.5, 3.5);
    m.chef(2)!.held = food('roti');
    m.setPilot(2, new CookBrain(styleFor(1), 1, () => 0.99));
    m.chef(1)!.held = food('tomat');
    m.throwItem(1);
    // Fly slower than usual so the reaction is what is tested.
    m.flights[0]!.dur = 3_000;
    for (let i = 0; i < 200; i++) {
      t += STEP_MS;
      m.step(t);
    }
    expect(m.chef(2)!.stains).toHaveLength(0);
    expect(m.chef(2)!.held).toEqual(food('tomat'));
  });
});
