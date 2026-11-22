import { FRUITS } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { rng, v3 } from '../../shared/kotak/math';
import { ARENAS, buildArena, isArenaId } from './arena';
import { BomBrain } from './brain';
import { type BomEvent, BomMatch, RULES, type RunnerInfo } from './logic';

const STEP = 1 / 60;

const people = (n: number): RunnerInfo[] =>
  FRUITS.slice(0, n).map((fruit, i) => ({ id: i + 1, name: `P${i + 1}`, fruit, color: '#2F8CFF' }));

function run(m: BomMatch, seconds: number, each?: () => void): BomEvent[] {
  const out: BomEvent[] = [];
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    each?.();
    m.tick(STEP);
    out.push(...m.drainEvents());
  }
  return out;
}

function toPlay(m: BomMatch): BomEvent[] {
  const ev = run(m, RULES.intro + RULES.drop + 0.05);
  expect(m.phase).toBe('play');
  return ev;
}

/** Stand two runners side by side in the open middle of the yard. */
function together(m: BomMatch, a: number, b: number, gap = 1.2): void {
  m.sim.place(a, v3(-3, 0.02, 1.5), 0);
  m.sim.place(b, v3(-3 + gap, 0.02, 1.5), 0);
}

describe('Bom Oper arenas', () => {
  it('fences every yard and keeps start spots clear of obstacles', () => {
    for (const id of ARENAS) {
      const a = buildArena(id);
      expect(a.solids.filter((s) => s.look === 'fence')).toHaveLength(4);
      for (const sp of a.spawns) {
        expect(Math.abs(sp.x)).toBeLessThan(a.hx - 0.4);
        expect(Math.abs(sp.z)).toBeLessThan(a.hz - 0.4);
        for (const s of a.solids) {
          if (s.look === 'floor' || s.look === 'fence') continue;
          const reach = Math.hypot(s.half.x, s.half.z) + 0.4;
          expect(Math.hypot(sp.x - s.pos.x, sp.z - s.pos.z)).toBeGreaterThan(reach * 0.9);
        }
      }
    }
    expect(isArenaId('pasar')).toBe(true);
    expect(isArenaId('bulan')).toBe(false);
  });
});

describe('Bom Oper match', () => {
  it('drops the bomb on someone, lights a secret fuse and blows up the holder', () => {
    const m = new BomMatch({ runners: people(3), arena: 'halaman', rounds: 5, seed: 1 });
    const ev = toPlay(m);
    const drop = ev.find((e) => e.k === 'drop');
    expect(drop?.k === 'drop' && drop.ids).toHaveLength(1);
    expect(m.bombs).toHaveLength(1);
    const b = m.bombs[0]!;
    expect(b.fuse).toBeGreaterThanOrEqual(RULES.fuse[0]);
    expect(b.fuse).toBeLessThanOrEqual(RULES.fuse[1]);
    const holder = b.holder;
    let boom: BomEvent | undefined;
    for (let i = 0; i < (RULES.fuse[1] + 1) * 60 && !boom; i++) {
      m.tick(STEP);
      boom = m.drainEvents().find((e) => e.k === 'boom');
    }
    expect(boom?.k === 'boom' && boom.id).toBe(holder);
    expect(m.runner(holder)!.lives).toBe(RULES.lives - 1);
    expect(m.phase).toBe('boom');
    const after = run(m, RULES.boom + RULES.score + 0.1);
    expect(after.some((e) => e.k === 'score')).toBe(true);
    expect(after.some((e) => e.k === 'round' && e.no === 1)).toBe(true);
  });

  it('passes to the nearest runner in reach, and never straight back', () => {
    const m = new BomMatch({ runners: people(2), arena: 'halaman', rounds: 5, seed: 2 });
    toPlay(m);
    const a = m.bombs[0]!.holder;
    const b = a === 1 ? 2 : 1;
    together(m, a, b);
    run(m, RULES.holdMin + 0.05);
    expect(m.pass(a)).toBe(true);
    expect(m.bombOf(b)).toBeDefined();
    expect(m.runner(a)!.stats.passes).toBe(1);
    expect(m.immuneLeft(m.runner(a)!)).toBeGreaterThan(1.5);
    run(m, RULES.holdMin + RULES.flight + 0.05);
    // Immune: the bomb cannot come back yet.
    expect(m.pass(b)).toBe(false);
    run(m, RULES.immune);
    expect(m.pass(b)).toBe(true);
    expect(m.bombOf(a)).toBeDefined();
  });

  it('refuses a pass with nobody in reach', () => {
    const m = new BomMatch({ runners: people(2), arena: 'pasar', rounds: 5, seed: 3 });
    toPlay(m);
    const a = m.bombs[0]!.holder;
    const b = a === 1 ? 2 : 1;
    together(m, a, b, RULES.passRange + 2);
    run(m, RULES.holdMin + 0.05);
    const ev: BomEvent[] = [];
    expect(m.pass(a)).toBe(false);
    ev.push(...m.drainEvents());
    expect(ev.some((e) => e.k === 'refused')).toBe(true);
  });

  it('lets the holder run a little faster than everyone else', () => {
    const m = new BomMatch({ runners: people(2), arena: 'atap', rounds: 5, seed: 4 });
    toPlay(m);
    const a = m.bombs[0]!.holder;
    const b = a === 1 ? 2 : 1;
    m.sim.place(a, v3(-8, 0.02, 0), 0);
    m.sim.place(b, v3(-8, 0.02, -2), 0);
    run(m, 0.6, () => {
      m.steer(a, 1, 0);
      m.steer(b, 1, 0);
    });
    const va = m.sim.body(a)!.vel.x;
    const vb = m.sim.body(b)!.vel.x;
    expect(va).toBeCloseTo(RULES.baseSpeed * RULES.holderBoost, 1);
    expect(vb).toBeCloseTo(RULES.baseSpeed, 1);
  });

  it('counts a pass just before the bang as nyaris', () => {
    const m = new BomMatch({ runners: people(2), arena: 'halaman', rounds: 5, seed: 5 });
    toPlay(m);
    const bomb = m.bombs[0]!;
    const a = bomb.holder;
    const b = a === 1 ? 2 : 1;
    together(m, a, b);
    bomb.litAt = m.sim.t - bomb.fuse + 0.4;
    bomb.heldSince = m.sim.t - 1;
    expect(m.pass(a)).toBe(true);
    const ev = m.drainEvents();
    expect(ev.some((e) => e.k === 'pass' && e.near)).toBe(true);
    expect(m.runner(a)!.stats.nearMisses).toBe(1);
  });

  it('knocks a runner out after three bangs and ends when one is left', () => {
    const m = new BomMatch({ runners: people(2), arena: 'halaman', rounds: 9, seed: 6 });
    const victim = 1;
    let done = false;
    for (let round = 0; round < 3 && !done; round++) {
      toPlay(m);
      const bomb = m.bombs[0]!;
      bomb.holder = victim;
      bomb.litAt = m.sim.t - bomb.fuse;
      const ev = run(m, RULES.boom + RULES.score + 0.2);
      done = ev.some((e) => e.k === 'done');
    }
    expect(m.runner(victim)!.lives).toBe(0);
    expect(m.runner(victim)!.out).toBe(true);
    expect(m.phase).toBe('done');
    expect(m.standings()[0]!.id).toBe(2);
    expect(m.canReceive(m.runner(victim)!)).toBe(false);
  });

  it('drops two bombs in the final round and pauses the second fuse during the first bang', () => {
    const m = new BomMatch({ runners: people(4), arena: 'pasar', rounds: 1, seed: 7 });
    toPlay(m);
    expect(m.finalRound).toBe(true);
    expect(m.bombs).toHaveLength(2);
    expect(new Set(m.bombs.map((b) => b.holder)).size).toBe(2);
    const [first, second] = m.bombs;
    first!.litAt = m.sim.t - first!.fuse;
    second!.litAt = m.sim.t - second!.fuse + 1;
    const ev = run(m, 0.1);
    expect(ev.filter((e) => e.k === 'boom')).toHaveLength(1);
    run(m, RULES.boom + 0.1);
    expect(m.phase).toBe('play');
    expect(second!.exploded).toBe(false);
    const more = run(m, 1.2);
    expect(more.filter((e) => e.k === 'boom')).toHaveLength(1);
    const end = run(m, RULES.boom + RULES.score + 0.2);
    expect(end.some((e) => e.k === 'done')).toBe(true);
  });

  it('hands the bomb on when its holder leaves', () => {
    const m = new BomMatch({ runners: people(3), arena: 'halaman', rounds: 5, seed: 8 });
    toPlay(m);
    const holder = m.bombs[0]!.holder;
    m.removeRunner(holder);
    expect(m.runner(holder)).toBeUndefined();
    expect(m.bombs[0]!.exploded).toBe(false);
    expect(m.runner(m.bombs[0]!.holder)).toBeDefined();
  });

  it('gives a late joiner the weakest lives still in play', () => {
    const m = new BomMatch({ runners: people(2), arena: 'halaman', rounds: 5, seed: 9 });
    m.runner(1)!.lives = 1;
    m.addRunner(people(3)[2]!);
    expect(m.runner(3)!.lives).toBe(1);
    expect(m.sim.body(3)).toBeDefined();
  });
});

describe('Bom Oper computer runners', () => {
  it('chase with the bomb and pass it on', () => {
    const m = new BomMatch({ runners: people(3), arena: 'halaman', rounds: 5, seed: 10 });
    for (const r of m.runners) m.setPilot(r.id, new BomBrain(0.8, rng(r.id)));
    toPlay(m);
    const ev = run(m, 12);
    expect(ev.some((e) => e.k === 'pass')).toBe(true);
  });

  it('run away from the holder', () => {
    const m = new BomMatch({ runners: people(2), arena: 'atap', rounds: 5, seed: 11 });
    toPlay(m);
    const holder = m.bombs[0]!.holder;
    const other = holder === 1 ? 2 : 1;
    m.setPilot(other, new BomBrain(0.9, rng(3)));
    m.sim.place(holder, v3(0, 0.02, 4.5), 0);
    m.sim.place(other, v3(2, 0.02, 4.5), 0);
    run(m, 0.8);
    const h = m.sim.body(holder)!.pos;
    const o = m.sim.body(other)!.pos;
    expect(Math.hypot(o.x - h.x, o.z - h.z)).toBeGreaterThan(3);
  });
});
