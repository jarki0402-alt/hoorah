import type { PlayerInfo } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { EjaMatch, TIMING } from './logic';
import { applyMirror, type EjaMirror, type MirrorInput, MirrorScene, toMirror } from './mirror';

const players = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1, connected: true }));

function info(id: number): PlayerInfo {
  return {
    id,
    name: `Pemain ${id}`,
    fruit: 'semangka',
    look: { c: 'bima', oc: 4 },
    color: '#FFC928',
    connected: true,
    isHost: id === 1,
  };
}

function make(n: number) {
  let now = 1_000;
  const m = new EjaMatch({ words: 10, seed: 7, now, players: players(n) });
  const step = (ms: number) => {
    now += ms;
    for (let left = ms; left > 0; left -= 500) m.tick(now - left + Math.min(500, left));
  };
  return { m, step, at: () => now };
}

function input(m: EjaMatch, now: number, over: Partial<MirrorInput> = {}): MirrorInput {
  return { scene: m, now, held: m.held, reads: 0, hostId: 1, record: null, info, ...over };
}

function wire(state: EjaMirror): EjaMirror {
  const parsed = applyMirror(JSON.parse(JSON.stringify(state)));
  if (!parsed) throw new Error('rejected');
  return parsed;
}

describe('eja mirror', () => {
  it('round-trips the spelling phase without leaking typed answers', () => {
    const g = make(3);
    g.m.start(g.at());
    g.step(TIMING.introMs + 50);
    expect(g.m.phase).toBe('spell');
    g.m.submit(2, 'salah', g.at());
    g.step(1000);
    const state = toMirror(input(g.m, g.at(), { reads: 2 }));
    expect(JSON.stringify(state)).not.toContain('salah');
    const scene = new MirrorScene(wire(state), () => g.at() + 3000);
    expect(scene.phase).toBe('spell');
    expect(scene.word).toEqual({ word: g.m.word?.word, def: g.m.word?.def });
    expect(scene.lang).toBe(g.m.lang);
    expect(scene.tier).toBe(g.m.tier);
    expect(scene.index).toBe(g.m.index);
    expect(scene.total).toBe(g.m.total);
    expect(scene.phaseLength()).toBe(g.m.phaseLength());
    expect(scene.msLeft()).toBe(Math.round(g.m.msLeft()) - 3000);
    expect(scene.roster.map((s) => [s.id, s.answer !== null])).toEqual([
      [1, false],
      [2, true],
      [3, false],
    ]);
    expect(scene.mirror.reads).toBe(2);
    expect(scene.info(3)?.name).toBe('Pemain 3');
  });

  it('round-trips the reveal and the standings', () => {
    const g = make(2);
    g.m.start(g.at());
    g.step(TIMING.introMs + 50);
    const word = g.m.word?.word ?? '';
    g.m.submit(1, word, g.at());
    g.m.submit(2, 'zzz', g.at());
    g.step(600);
    expect(g.m.phase).toBe('reveal');
    const scene = new MirrorScene(wire(toMirror(input(g.m, g.at()))), g.at);
    const pick = (s: (typeof scene.roster)[number]) => [
      s.id,
      s.verdict,
      s.gained,
      s.score,
      s.lives,
      s.spelled.length,
    ];
    expect(scene.roster.map(pick)).toEqual(g.m.roster.map(pick));
    expect(scene.standings().map((r) => [r.seat.id, r.rank])).toEqual(
      g.m.standings().map((r) => [r.seat.id, r.rank]),
    );
  });

  it('freezes the clock while the Host is held or this screen is paused', () => {
    const g = make(1);
    g.m.start(g.at());
    g.step(TIMING.introMs + 50);
    g.m.setHeld(true, g.at());
    const left = Math.round(g.m.msLeft());
    let clock = g.at();
    const held = new MirrorScene(wire(toMirror(input(g.m, g.at()))), () => clock);
    clock += 60_000;
    expect(held.msLeft()).toBe(left);

    g.m.setHeld(false, g.at());
    clock = g.at();
    const live = new MirrorScene(wire(toMirror(input(g.m, g.at()))), () => clock);
    clock += 1000;
    live.setLocalPause(true);
    clock += 9000;
    expect(live.msLeft()).toBe(left - 1000);
    live.setLocalPause(false);
    expect(live.msLeft()).toBe(left - 10_000);
  });

  it('rejects malformed states without throwing', () => {
    const g = make(2);
    const good = JSON.parse(JSON.stringify(toMirror(input(g.m, g.at())))) as Record<string, unknown>;
    expect(applyMirror(good)).not.toBeNull();
    const seat = (good.se as Record<string, unknown>[])[0];
    const bad: unknown[] = [
      null,
      [],
      { ...good, v: 9 },
      { ...good, ph: 'sleep' },
      { ...good, lang: 'fr' },
      { ...good, tier: 4 },
      { ...good, wd: { w: 'x'.repeat(500), d: '' } },
      { ...good, se: [{ ...seat, vd: 'great' }] },
      { ...good, se: [{ ...seat, lv: -1 }] },
      { ...good, pl: [{ id: 1, name: 'A', color: '#000' }] },
      { ...good, rec: { best: 'x', isNew: true } },
      { ...good, left: -5 },
    ];
    for (const b of bad) expect(applyMirror(b)).toBeNull();
  });

  it('stays small for a full room', () => {
    const g = make(16);
    g.m.start(g.at());
    g.step(TIMING.introMs + 50);
    expect(JSON.stringify(toMirror(input(g.m, g.at()))).length).toBeLessThan(4096);
  });
});
