import { lookAt, lookOfFruit } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { planShot, toEdge } from './brain';
import {
  collide,
  type EsEvent,
  EsMatch,
  launchVelocity,
  PHYS,
  type PlayerInfo,
  REACH,
  rng,
  shrinkEdge,
  slow,
  startEdge,
  TIMING,
} from './logic';
import { pickAwards } from './results';
import { viewFor } from './views';

const FRUITS = ['semangka', 'alpukat', 'durian', 'nanas', 'jeruk', 'stroberi', 'mangga', 'rambutan'] as const;

function players(n: number, cpu = false): PlayerInfo[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `P${i + 1}`,
    fruit: FRUITS[i % FRUITS.length]!,
    look: lookOfFruit(FRUITS[i % FRUITS.length]!),
    color: '#F2453D',
    cpu,
  }));
}

function run(m: EsMatch, seconds: number, dt = 1 / 60): EsEvent[] {
  const out: EsEvent[] = [];
  for (let t = 0; t < seconds; t += dt) {
    m.tick(dt);
    out.push(...m.drainEvents());
  }
  return out;
}

function toAim(m: EsMatch): void {
  m.drainEvents();
  run(m, TIMING.intro + 0.05);
  expect(m.phase).toBe('aim');
}

describe('ice physics', () => {
  it('slides a full-power launch about REACH metres', () => {
    const b = { pos: { x: 0, y: 0 }, vel: launchVelocity({ x: 1, y: 0 }) };
    let t = 0;
    while (Math.hypot(b.vel.x, b.vel.y) > 0) {
      b.pos.x += b.vel.x * PHYS.step;
      slow(b.vel, PHYS.step, PHYS.decel);
      t += PHYS.step;
    }
    expect(b.pos.x).toBeGreaterThan(REACH * 0.97);
    expect(b.pos.x).toBeLessThan(REACH * 1.03);
    expect(t).toBeLessThan(3);
  });

  it('ignores aims weaker than the minimum', () => {
    expect(launchVelocity({ x: 0.05, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(launchVelocity(null)).toEqual({ x: 0, y: 0 });
  });

  it('passes the speed on in a head-on bump and keeps momentum', () => {
    const a = { pos: { x: 0, y: 0 }, vel: { x: 5, y: 0 } };
    const b = { pos: { x: 1.05, y: 0 }, vel: { x: 0, y: 0 } };
    const closing = collide(a, b, PHYS.radius, PHYS.restitution);
    expect(closing).toBeCloseTo(5, 6);
    expect(a.vel.x + b.vel.x).toBeCloseTo(5, 6);
    expect(b.vel.x).toBeGreaterThan(4.5);
    expect(a.vel.x).toBeLessThan(0.5);
    expect(b.pos.x - a.pos.x).toBeCloseTo(PHYS.radius * 2, 6);
  });

  it('does not bump discs that move apart', () => {
    const a = { pos: { x: 0, y: 0 }, vel: { x: -1, y: 0 } };
    const b = { pos: { x: 1, y: 0 }, vel: { x: 1, y: 0 } };
    expect(collide(a, b, PHYS.radius, PHYS.restitution)).toBe(0);
    expect(a.vel.x).toBe(-1);
  });

  it('shrinks the floe down to a minimum', () => {
    let e = startEdge(8);
    for (let i = 0; i < 30; i++) e = shrinkEdge(e);
    expect(e).toBe(PHYS.minEdge);
    expect(startEdge(8)).toBeGreaterThan(startEdge(2));
  });
});

describe('brain', () => {
  it('measures the distance to the edge along a direction', () => {
    expect(toEdge({ x: 0, y: 0 }, { x: 1, y: 0 }, 5)).toBeCloseTo(5, 6);
    expect(toEdge({ x: 3, y: 0 }, { x: 1, y: 0 }, 5)).toBeCloseTo(2, 6);
  });

  it('aims at an opponent and locks before time is up', () => {
    const r = rng(3);
    for (let i = 0; i < 20; i++) {
      const plan = planShot(
        { me: { x: -2, y: 0 }, others: [{ id: 7, x: 2, y: 0 }], edge: 6, next: 5, skill: 0.95 },
        r,
      );
      expect(plan.lockAt).toBeLessThan(TIMING.aim);
      expect(plan.previewAt).toBeLessThan(plan.lockAt);
      expect(Math.hypot(plan.aim.x, plan.aim.y)).toBeLessThanOrEqual(1 + 1e-9);
      if (plan.target === 7) expect(plan.aim.x).toBeGreaterThan(0);
    }
  });

  it('glides back towards the middle from the cracked rim', () => {
    const plan = planShot({ me: { x: 4.8, y: 0 }, others: [], edge: 5.5, next: 4.5, skill: 0.8 }, rng(1));
    expect(plan.aim.x).toBeLessThan(0);
  });
});

describe('match flow', () => {
  it('carries each player look and restyles it', () => {
    const m = new EsMatch({ players: players(2), rounds: 2, seed: 7 });
    expect(m.player(1)!.look).toEqual(lookOfFruit('semangka'));
    m.restyle(1, { name: 'P1', color: '#2F8CFF', fruit: 'jeruk', look: lookAt(5) });
    expect(m.player(1)!.look).toEqual(lookAt(5));
    expect(m.player(2)!.look).toEqual(lookOfFruit('alpukat'));
  });

  it('starts with an intro, then everyone aims at once', () => {
    const m = new EsMatch({ players: players(3), rounds: 3, seed: 1 });
    expect(m.phase).toBe('intro');
    toAim(m);
    expect(m.shot).toBe(1);
    expect(m.nextEdge).toBeLessThan(m.edge);
    expect(m.aimLeft).toBe(TIMING.aim);
  });

  it('ticks the seconds, rings at time up and launches after the grace', () => {
    const m = new EsMatch({ players: players(2), rounds: 1, seed: 2 });
    toAim(m);
    const ev = run(m, TIMING.aim + TIMING.grace + 0.05);
    expect(ev.filter((e) => e.k === 'second').map((e) => (e.k === 'second' ? e.left : 0))).toEqual([
      4, 3, 2, 1,
    ]);
    expect(ev.some((e) => e.k === 'timeUp')).toBe(true);
    expect(ev.some((e) => e.k === 'launch')).toBe(true);
    expect(m.phase).not.toBe('aim');
  });

  it('takes locks and re-aims only while aiming', () => {
    const m = new EsMatch({ players: players(2), rounds: 1, seed: 2 });
    expect(m.lock(1, { x: 0.5, y: 0 })).toBe(false);
    toAim(m);
    expect(m.lock(1, { x: 0.05, y: 0 })).toBe(false);
    expect(m.lock(1, { x: 0.5, y: 0 })).toBe(true);
    expect(m.lock(1, { x: 0, y: 0.6 })).toBe(true);
    const locks = m.drainEvents().filter((e) => e.k === 'lock');
    expect(locks).toEqual([
      { k: 'lock', id: 1, again: false },
      { k: 'lock', id: 1, again: true },
    ]);
    expect(m.locks()).toBe(1);
    expect(m.lock(99, { x: 0.5, y: 0 })).toBe(false);
  });

  it('accepts a lock that arrives during the grace window', () => {
    const m = new EsMatch({ players: players(2), rounds: 1, seed: 2 });
    toAim(m);
    run(m, TIMING.aim + 0.1);
    expect(m.phase).toBe('aim');
    expect(m.lock(2, { x: 0.4, y: 0.4 })).toBe(true);
  });

  it('knocks a skater off with a full shot and scores the survivor', () => {
    const m = new EsMatch({ players: players(2), rounds: 2, seed: 4 });
    toAim(m);
    const a = m.player(1)!;
    const b = m.player(2)!;
    a.pos = { x: -1.5, y: 0 };
    b.pos = { x: 1.5, y: 0 };
    m.lock(1, { x: 1, y: 0 });
    const ev = run(m, TIMING.aim + TIMING.grace + TIMING.slideMax + TIMING.settle + 1);
    const fall = ev.find((e) => e.k === 'fall');
    expect(fall).toMatchObject({ k: 'fall', id: 2, by: 1, crack: false });
    expect(ev.some((e) => e.k === 'hit')).toBe(true);
    const end = ev.find((e) => e.k === 'roundEnd');
    expect(end && end.k === 'roundEnd' && end.winner).toBe(1);
    expect(a.total).toBe(1 + 3);
    expect(b.total).toBe(0);
    expect(a.stats.knockouts).toBe(1);
    expect(a.stats.wins).toBe(1);
    expect(a.rounds[0]).toBe(4);
  });

  it('drops whoever stands on the cracked rim', () => {
    const m = new EsMatch({ players: players(3), rounds: 1, seed: 5 });
    toAim(m);
    const rim = m.player(3)!;
    rim.pos = { x: (m.edge + m.nextEdge) / 2, y: 0 };
    m.player(1)!.pos = { x: -1, y: 0 };
    m.player(2)!.pos = { x: 0, y: 1.5 };
    const ev = run(m, TIMING.aim + TIMING.grace + 0.2 + TIMING.settle + 1);
    expect(ev.find((e) => e.k === 'crack')).toBeTruthy();
    expect(ev.find((e) => e.k === 'fall')).toMatchObject({ id: 3, crack: true, by: null });
    expect(rim.out).toBe(true);
  });

  it('doubles the points of the final round and ends with final, then done', () => {
    const m = new EsMatch({ players: players(2), rounds: 1, seed: 6 });
    toAim(m);
    m.player(1)!.pos = { x: -1.5, y: 0 };
    m.player(2)!.pos = { x: 1.5, y: 0 };
    m.lock(1, { x: 1, y: 0 });
    const ev = run(m, 40);
    expect(m.player(1)!.total).toBe((1 + 3) * 2);
    expect(m.player(1)!.rounds).toEqual([8]);
    expect(ev.some((e) => e.k === 'final')).toBe(true);
    expect(ev.some((e) => e.k === 'done')).toBe(true);
    expect(m.phase).toBe('done');
  });

  it('plays a whole session of computer skaters to the end', () => {
    const m = new EsMatch({ players: players(6, true), rounds: 3, seed: 9, skill: 0.6 });
    const ev = run(m, 400, 1 / 30);
    expect(m.phase).toBe('done');
    const ends = ev.filter((e) => e.k === 'roundEnd');
    expect(ends.length).toBe(3);
    for (const p of m.players) expect(p.rounds.length).toBe(3);
    const awards = pickAwards(m.players);
    expect(awards.length).toBe(6);
    expect(new Set(awards.map((a) => a.playerId)).size).toBe(6);
  });

  it('lets a late joiner wait for the next round', () => {
    const m = new EsMatch({ players: players(2), rounds: 2, seed: 7 });
    toAim(m);
    m.addPlayer({ id: 9, name: 'Late', fruit: 'nanas', look: lookAt(5), color: '#2F8CFF', cpu: false });
    const late = m.player(9)!;
    expect(late.look).toEqual(lookAt(5));
    expect(late.inRound).toBe(false);
    expect(m.lock(9, { x: 0.5, y: 0 })).toBe(false);
    expect(viewFor({ match: m, id: 9, guests: [], titles: new Map(), deadline: 0 })).toMatchObject({
      kind: 'message',
      reactions: true,
    });
  });

  it('ends the round when a removal leaves one skater', () => {
    const m = new EsMatch({ players: players(2), rounds: 2, seed: 8 });
    toAim(m);
    m.removePlayer(2);
    expect(m.phase).toBe('end');
  });
});

describe('phone views', () => {
  it('shows the slingshot with a radar while aiming and locks it while sliding', () => {
    const m = new EsMatch({ players: players(3), rounds: 2, seed: 10 });
    toAim(m);
    m.lock(1, { x: 0.3, y: -0.4 });
    const v = viewFor({ match: m, id: 1, guests: [], titles: new Map(), deadline: 1234 });
    expect(v.kind).toBe('sling');
    if (v.kind !== 'sling') return;
    expect(v.deadline).toBe(1234);
    expect(v.aim).toEqual({ x: 0.3, y: -0.4 });
    expect(v.map?.others.length).toBe(2);
    expect(v.map?.next).toBeLessThan(v.map?.edge ?? 0);
    expect(v.locked).toBeFalsy();
    run(m, TIMING.aim + TIMING.grace + 0.05);
    const s = viewFor({ match: m, id: 1, guests: [], titles: new Map(), deadline: 0 });
    expect(s.kind === 'sling' && s.locked).toBe(true);
  });

  it('offers cheers to whoever fell in', () => {
    const m = new EsMatch({ players: players(3), rounds: 2, seed: 11 });
    toAim(m);
    const p = m.player(2)!;
    p.out = true;
    const v = viewFor({ match: m, id: 2, guests: [], titles: new Map(), deadline: 0 });
    expect(v).toMatchObject({ kind: 'message', reactions: true, tone: 'bad' });
  });
});
