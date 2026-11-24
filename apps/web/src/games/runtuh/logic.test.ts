import { type Fruit, lookAt, lookOfFruit } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { rng } from '../../shared/kotak/math';
import {
  COLS,
  colorLayout,
  makeSum,
  numberLayout,
  randomFaces,
  spreadTiles,
  startTiles,
  symbolLayout,
  TILES,
  tileAt,
  tileCenter,
} from './arena';
import { ContestantBrain } from './brain';
import { type PlayerInfo, RULES, RuntuhMatch, SURVIVE_POINTS, TIMING } from './logic';

const FRUITS: Fruit[] = ['jeruk', 'semangka', 'durian', 'nanas', 'mangga', 'stroberi', 'alpukat', 'rambutan'];
const DT = 1 / 60;

function players(n: number, cpu = false): PlayerInfo[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `P${i + 1}`,
    fruit: FRUITS[i]!,
    look: lookOfFruit(FRUITS[i]!),
    color: '#2F8CFF',
    cpu,
  }));
}

function runUntil(m: RuntuhMatch, done: () => boolean, maxSeconds: number): void {
  for (let i = 0; i < maxSeconds / DT && !done(); i++) m.tick(DT);
}

describe('stage layouts', () => {
  const rnd = rng(4);

  it('maps tiles to positions and back', () => {
    for (let i = 0; i < TILES; i++) {
      const c = tileCenter(i);
      expect(tileAt(c.x, c.z)).toBe(i);
    }
    expect(tileAt(100, 0)).toBe(-1);
    expect(new Set(startTiles(8)).size).toBe(8);
  });

  it('makes exactly the targets answer a colour, symbol or number call', () => {
    const faces = randomFaces(rnd);
    const targets = spreadTiles(6, rnd);
    expect(new Set(targets).size).toBe(6);
    const byColor = colorLayout(faces, 'kuning', targets, rnd);
    expect(byColor.flatMap((f, i) => (f.color === 'kuning' ? [i] : [])).sort()).toEqual([...targets].sort());
    const bySymbol = symbolLayout(faces, 'hati', targets, rnd);
    expect(bySymbol.flatMap((f, i) => (f.symbol === 'hati' ? [i] : [])).sort()).toEqual([...targets].sort());
    const byNumber = numberLayout(faces, 7, targets, rnd);
    expect(byNumber.flatMap((f, i) => (f.number === 7 ? [i] : [])).sort()).toEqual([...targets].sort());
  });

  it('asks sums with answers from 2 to 9', () => {
    for (let k = 0; k < 3; k++)
      for (let i = 0; i < 50; i++) {
        const s = makeSum(k, rnd);
        expect(s.op === '+' ? s.a + s.b : s.a - s.b).toBe(s.answer);
        expect(s.answer).toBeGreaterThanOrEqual(2);
        expect(s.answer).toBeLessThanOrEqual(9);
        expect(Math.max(s.a, s.b)).toBeLessThanOrEqual(9);
      }
  });
});

describe('lantai runtuh rounds', () => {
  it('carries each player look and restyles it', () => {
    const m = new RuntuhMatch({ players: players(2), seed: 1 });
    expect(m.player(1)!.look).toEqual(lookOfFruit('jeruk'));
    m.restyle(1, { look: lookAt(5) });
    expect(m.player(1)!.look).toEqual(lookAt(5));
    expect(m.player(2)!.look).toEqual(lookOfFruit('semangka'));
  });

  it('plays seven rules in order with the dark final last', () => {
    const m = new RuntuhMatch({ players: players(2), seed: 1 });
    expect(m.rules).toEqual([...RULES]);
    expect(m.drainEvents()[0]).toMatchObject({ k: 'round', no: 0, rule: 'acak' });
    const short = new RuntuhMatch({ players: players(2), seed: 1, rounds: 4 });
    expect(short.rules).toEqual(['acak', 'angka', 'warna', 'gelap']);
  });

  it('holds everyone still during the rule card, then lets them move', () => {
    const m = new RuntuhMatch({ players: players(1), seed: 2 });
    const b = m.sim.body(1)!;
    const x0 = b.pos.x;
    m.steer(1, 1, 0);
    runUntil(m, () => m.phase === 'play', 5);
    expect(b.pos.x).toBeCloseTo(x0, 3);
    m.steer(1, 1, 0);
    runUntil(m, () => false, 0.3);
    expect(b.pos.x).toBeGreaterThan(x0 + 0.5);
  });

  it('drops every tile but the answer in a colour call', () => {
    const m = new RuntuhMatch({ players: players(1), seed: 3, rounds: 4 });
    runUntil(m, () => m.rule === 'warna' && m.phase === 'play' && m.callStage === 'count', 120);
    const call = m.call!;
    expect(call.color).toBeDefined();
    const targets = new Set(call.targets);
    for (let i = 0; i < TILES; i++) expect(m.faces[i]!.color === call.color).toBe(targets.has(i));
    // Stand on a target and wait for the drop.
    const t = tileCenter(call.targets[0]!);
    m.sim.place(1, { x: t.x, y: 0, z: t.z });
    runUntil(m, () => m.callStage === 'drop', 10);
    runUntil(m, () => false, 0.8);
    for (let i = 0; i < TILES; i++) expect(m.sim.solids[i]!.state === 'gone').toBe(!targets.has(i));
    expect(m.player(1)!.out).toBe(false);
    runUntil(m, () => m.callStage === 'rest', 5);
    expect(m.sim.solids.every((s) => s.state === 'solid')).toBe(true);
  });

  it('a fall keeps the points for the time survived; standing scores 50, the final double', () => {
    const m = new RuntuhMatch({ players: players(2), seed: 5, rounds: 2 });
    runUntil(m, () => m.phase === 'play', 5);
    runUntil(m, () => false, 10);
    // Player 2 steps off the stage.
    m.sim.place(2, { x: 30, y: 0, z: 0 });
    runUntil(m, () => m.player(2)!.out, 3);
    const fall = m.drainEvents().find((e) => e.k === 'fall');
    expect(fall).toMatchObject({ k: 'fall', id: 2, by: null });
    // Player 1 stays on whatever is solid until the round ends.
    for (let i = 0; i < 40 / DT && m.phase === 'play'; i++) {
      const b = m.sim.body(1)!;
      const here = tileAt(b.pos.x, b.pos.z);
      if (here < 0 || m.sim.solids[here]!.state !== 'solid') {
        const safe = m.sim.solids.find((s) => s.state === 'solid');
        if (safe) m.sim.place(1, { x: safe.def.pos.x, y: 0, z: safe.def.pos.z });
      }
      m.tick(DT);
    }
    const p1 = m.player(1)!;
    const p2 = m.player(2)!;
    expect(p1.rounds[0]).toBe(SURVIVE_POINTS);
    expect(p2.rounds[0]).toBeGreaterThanOrEqual(10);
    expect(p2.rounds[0]).toBeLessThan(SURVIVE_POINTS);
    expect(p2.rounds[0]! % 5).toBe(0);
    // Everyone is back for the next round.
    runUntil(m, () => m.phase === 'intro' || m.round === 1, TIMING.end + 1);
    expect(m.player(2)!.out).toBe(false);
    expect(m.isFinal).toBe(true);
    expect(m.multiplier).toBe(2);
  });

  it('DORONG shoves the player in front and then rests 3 seconds', () => {
    const m = new RuntuhMatch({ players: players(2), seed: 6 });
    runUntil(m, () => m.phase === 'play', 5);
    const c = tileCenter(2 * COLS + 3);
    m.sim.place(1, { x: c.x - 0.5, y: 0, z: c.z }, Math.PI / 2);
    m.sim.place(2, { x: c.x + 0.7, y: 0, z: c.z });
    m.drainEvents();
    expect(m.push(1)).toBe(true);
    expect(m.drainEvents()).toContainEqual({ k: 'push', id: 1, target: 2 });
    expect(m.sim.body(2)!.stunLeft).toBeGreaterThan(0);
    expect(m.push(1)).toBe(false);
    expect(m.pushRest(1)).toBeGreaterThan(2.9);
    runUntil(m, () => false, TIMING.pushCooldown + 0.1);
    expect(m.pushRest(1)).toBe(0);
    expect(m.player(1)!.stats.pushHits).toBe(1);
  });

  it('credits the pusher when the shoved player falls off the edge', () => {
    const m = new RuntuhMatch({ players: players(2), seed: 7 });
    runUntil(m, () => m.phase === 'play', 5);
    // Right edge of the stage, pushing towards +x.
    const edge = tileCenter(2 * COLS + COLS - 1);
    m.sim.place(1, { x: edge.x - 0.2, y: 0, z: edge.z }, Math.PI / 2);
    m.sim.place(2, { x: edge.x + 0.6, y: 0, z: edge.z });
    m.push(1);
    runUntil(m, () => m.player(2)!.out, 3);
    expect(m.player(2)!.out).toBe(true);
    expect(m.player(1)!.stats.knockouts).toBe(1);
  });

  it('computer contestants survive most calls and the session ends', () => {
    const m = new RuntuhMatch({ players: players(4, true), seed: 2026 });
    let seed = 1;
    for (const p of m.players) m.setPilot(p.id, new ContestantBrain(0.85, rng(seed++)));
    let elapsed = 0;
    for (let i = 0; i < 400 / DT && m.phase !== 'done'; i++) {
      m.tick(DT);
      elapsed += DT;
    }
    expect(m.phase).toBe('done');
    // About five minutes for seven rounds.
    expect(elapsed).toBeGreaterThan(200);
    expect(elapsed).toBeLessThan(330);
    const survived = m.players.reduce((s, p) => s + p.stats.survived, 0);
    expect(survived).toBeGreaterThan(m.players.length * 2);
    for (const p of m.players) expect(p.rounds).toHaveLength(7);
  }, 30_000);
});
