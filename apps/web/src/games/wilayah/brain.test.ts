import { FRUITS, lookOfFruit, type PlayerInfo } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { fieldSkills, styleFor, TAKEOVER_STYLE, TerritoryBrain } from './brain';
import { type Arena, arenaFor, type OutCause, type Runner, WilayahMatch } from './logic';

const COLORS = ['#F2453D', '#2F8CFF', '#22B35E', '#FFC928', '#FF8A3D', '#FF5C9A', '#14B8A6', '#C4C7CC'];

function players(n: number): PlayerInfo[] {
  return Array.from({ length: n }, (_, i) => ({
    id: -(i + 1),
    name: `C${i + 1}`,
    fruit: FRUITS[i % FRUITS.length]!,
    look: lookOfFruit(FRUITS[i % FRUITS.length]!),
    color: COLORS[i % COLORS.length]!,
    connected: true,
    isHost: false,
  }));
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface SimResult {
  m: WilayahMatch;
  outs: Record<OutCause, number>;
  captures: number;
  /** Captures per 30 s window of play. */
  windows: number[];
  /** Mean time of one advance() call, ms (a frame's worth of logic). */
  meanMs: number;
}

/** A computer-only match, advanced like the main screen does (one call per 60 Hz frame). */
function simulate(
  n: number,
  skill: number,
  seconds: number,
  seed: number,
  arena: Arena = arenaFor(n),
): SimResult {
  const m = new WilayahMatch({ players: players(n), minutes: 10, now: 0, rnd: rng(seed), arena });
  const r = rng(seed * 31);
  for (const p of m.all()) m.setPilot(p.id, new TerritoryBrain(styleFor(skill), r));
  const outs: Record<OutCause, number> = { self: 0, cut: 0, crash: 0, wiped: 0 };
  let captures = 0;
  const windows: number[] = [];
  let spent = 0;
  let frames = 0;
  for (let t = 0; t <= m.goAt + seconds * 1000; t += 1000 / 60) {
    const t0 = performance.now();
    m.advance(t);
    spent += performance.now() - t0;
    frames++;
    for (const e of m.drainEvents()) {
      if (e.type === 'out') outs[e.cause]++;
      if (e.type === 'capture' && e.loop >= 1) {
        captures++;
        const w = Math.floor((t - m.goAt) / 30_000);
        windows[w] = (windows[w] ?? 0) + 1;
      }
    }
  }
  return { m, outs, captures, windows, meanMs: spent / frames };
}

describe('computer players', () => {
  it('scale with skill and spread around the remembered level', () => {
    const lo = styleFor(0.1);
    const hi = styleFor(0.9);
    expect(hi.depth[1]).toBeGreaterThan(lo.depth[1]);
    expect(hi.thinkMs).toBeLessThan(lo.thinkMs);
    expect(hi.notice).toBeGreaterThan(lo.notice);
    expect(hi.wobble).toBeLessThan(lo.wobble);
    const s = fieldSkills(0.5, 5);
    expect(s).toHaveLength(5);
    expect(Math.min(...s)).toBeLessThan(0.5);
    expect(Math.max(...s)).toBeGreaterThan(0.5);
    expect(fieldSkills(0.99, 3).every((v) => v <= 0.97)).toBe(true);
  });

  it('steer with finite angles and draw loops that come home', () => {
    const { m, outs, captures } = simulate(1, 0.6, 40, 3);
    const r = m.all()[0]!;
    expect(outs.self).toBe(0);
    expect(r.alive).toBe(true);
    expect(captures).toBeGreaterThan(5);
    expect(m.percent(r)).toBeGreaterThan(5);
    expect(Number.isFinite(r.angle)).toBe(true);
  });

  it('run home when an opponent heads for the trail', () => {
    const m = new WilayahMatch({ players: players(2), minutes: 3, now: 0, rnd: rng(5), arena: arenaFor(2) });
    let t = m.goAt;
    m.advance(t);
    const [cpu, foe] = m.all() as [Runner, Runner];
    m.setPilot(
      cpu.id,
      new TerritoryBrain({ ...styleFor(0.9), notice: 1, chase: 0, depth: [12, 12], width: [14, 14] }, rng(2)),
    );
    let longest = 0;
    let returned = false;
    for (let k = 0; k < 900 && !returned; k++) {
      // The foe charges straight at the computer's head.
      m.steer(foe.id, Math.atan2(cpu.y - foe.y, cpu.x - foe.x), t);
      t += m.arena.stepMs;
      m.advance(t);
      m.drainEvents();
      const len = cpu.trail.arcTo(cpu.x, cpu.y) / m.geo.unit;
      longest = Math.max(longest, len);
      if (longest > 3 && cpu.trail.len === 0 && cpu.alive) returned = true;
    }
    expect(cpu.alive).toBe(true);
    expect(returned).toBe(true);
    // It cut the planned loop (12 deep, 14 wide: about 40 units of trail) short.
    expect(longest).toBeLessThan(36);
  });

  it('keeps a dropped phone safe at home', () => {
    const m = new WilayahMatch({ players: players(1), minutes: 3, now: 0, rnd: rng(4), arena: arenaFor(1) });
    const r = m.all()[0]!;
    m.setPilot(r.id, new TerritoryBrain(TAKEOVER_STYLE, rng(4), true));
    let outside = 0;
    for (let t = 0; t <= m.goAt + 20_000; t += 1000 / 60) {
      m.advance(t);
      if (r.trail.len > 0) outside++;
    }
    expect(r.alive).toBe(true);
    expect(outside).toBe(0);
  });

  it('play a whole match among themselves without crashing, capturing steadily', () => {
    const { m, outs, captures, windows, meanMs } = simulate(6, 0.55, 180, 11);
    // Every 30 s of the 3 minutes sees fresh captures.
    expect(windows).toHaveLength(6);
    for (const w of windows) expect(w).toBeGreaterThan(8);
    expect(captures).toBeGreaterThan(80);
    // Everyone took part, and running into your own trail stays rare.
    for (const r of m.all()) expect(r.stats.captures).toBeGreaterThan(3);
    expect(outs.self).toBeLessThanOrEqual(4);
    const owned = m.all().reduce((s, r) => s + m.cells(r), 0);
    expect(owned / m.field.size).toBeGreaterThan(0.25);
    expect(owned).toBeLessThanOrEqual(m.field.size);
    // A frame's logic (six brains included) stays far below the 16.7 ms of a 60 fps frame; the
    // bound is loose because the whole suite runs in parallel on a busy machine.
    expect(meanMs).toBeLessThan(4);
  }, 30_000);

  it('are deterministic for a given seed', () => {
    const a = simulate(3, 0.4, 20, 5);
    const b = simulate(3, 0.4, 20, 5);
    expect(a.m.all().map((r) => a.m.cells(r))).toEqual(b.m.all().map((r) => b.m.cells(r)));
  });
});
