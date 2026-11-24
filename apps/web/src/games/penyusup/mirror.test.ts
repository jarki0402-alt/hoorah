import type { PlayerInfo } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { PenyusupMatch, TIMING } from './logic';
import { applyMirror, type MirrorExtras, MirrorScene, type PenyusupMirror, toMirror } from './mirror';

function player(id: number, name = `Pemain ${id}`): PlayerInfo {
  return {
    id,
    name,
    fruit: 'semangka',
    look: { c: 'nara' },
    color: '#FF5C9A',
    connected: true,
    isHost: id === 1,
  };
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

function setup(n: number, mode: 'lisan' | 'ketik' = 'lisan', seed = 7) {
  const clock = { now: 1_000 };
  const m = new PenyusupMatch({
    rounds: 2,
    seed,
    now: clock.now,
    players: ids(n).map((id) => ({ id, connected: true })),
  });
  const step = (ms: number) => {
    clock.now += ms;
    return m.tick(clock.now);
  };
  const run = (ms: number) => {
    for (let left = ms; left > 0; left -= 250) step(Math.min(250, left));
  };
  m.pick('id');
  m.next(clock.now);
  m.pick(mode);
  m.next(clock.now);
  m.next(clock.now);
  return { m, clock, step, run };
}

type Setup = ReturnType<typeof setup>;

function toClue({ m, clock, run }: Setup): void {
  for (const s of m.table) m.ready(s.id, clock.now);
  run(TIMING.dealMinMs + 300);
  expect(m.phase).toBe('clue');
}

function toVote(t: Setup): void {
  toClue(t);
  const { m, clock, run } = t;
  for (let guard = 0; m.phase === 'clue' && guard < 100; guard++) {
    run(TIMING.clueMinMs + 50);
    const id = m.speaker;
    if (id !== null) m.done(id, clock.now);
  }
  expect(m.phase).toBe('vote');
}

/** Everyone votes the impostor (the impostor votes a warga), then the count shows. */
function toTally(t: Setup): void {
  toVote(t);
  voteImpostor(t);
}

function voteImpostor(t: Setup): void {
  const { m, clock, step } = t;
  const imp = m.table.find((s) => s.role === 'penyusup')!;
  const warga = m.table.find((s) => s.role === 'warga')!;
  for (const s of m.voters) {
    m.vote(s.id, s.id === imp.id ? warga.id : imp.id, clock.now);
    m.lock(s.id, clock.now);
  }
  step(10);
  expect(m.phase).toBe('tally');
}

function extras(n: number, name?: (id: number) => string): MirrorExtras {
  return { players: ids(n).map((id) => player(id, name?.(id))), hostId: 1 };
}

function wire(state: PenyusupMirror): PenyusupMirror {
  const parsed = applyMirror(JSON.parse(JSON.stringify(state)));
  if (!parsed) throw new Error('rejected');
  return parsed;
}

function scene(t: Setup, n: number): MirrorScene {
  return new MirrorScene(wire(toMirror(t.m, extras(n))), () => t.clock.now);
}

/** No word of the pair appears anywhere in the published JSON. */
function expectNoWords(m: PenyusupMatch, state: PenyusupMirror): void {
  const json = JSON.stringify(state);
  for (const w of [m.wargaWord, m.bedaWord]) expect(json).not.toContain(`"${w}"`);
}

describe('penyusup mirror', () => {
  it('round-trips the setup poster', () => {
    const m = new PenyusupMatch({
      rounds: 3,
      seed: 1,
      now: 0,
      players: ids(4).map((id) => ({ id, connected: true })),
    });
    m.pick('en');
    m.next(0);
    const s = new MirrorScene(wire(toMirror(m, extras(4))), () => 0);
    expect(s.phase).toBe('setup');
    expect(s.step).toBe('mode');
    expect(s.settings).toEqual(m.settings);
    expect(s.round).toBe(-1);
    expect(s.rounds).toBe(3);
    expect(s.hostId()).toBe(1);
    expect(s.roster.map((r) => [r.id, r.present])).toEqual(m.roster.map((r) => [r.id, r.present]));
    expect(s.info(2)?.name).toBe('Pemain 2');
  });

  it('round-trips a typed clue turn without roles or words', () => {
    const t = setup(5, 'ketik');
    toClue(t);
    const { m, clock, run } = t;
    run(TIMING.clueMinMs + 50);
    const first = m.speaker!;
    m.clue(first, 'zzq', clock.now);
    const state = toMirror(m, extras(5));
    expectNoWords(m, state);
    expect(state.rl).toEqual([]);
    expect(state.wd).toBeNull();
    expect(state.sc).toEqual([]);
    const s = new MirrorScene(wire(state), () => clock.now);
    expect(s.phase).toBe('clue');
    expect(s.speaker).toBe(m.speaker);
    expect(s.spoken).toEqual(m.spoken);
    expect(s.upcoming).toEqual(m.upcoming);
    expect([s.circuit, s.circuits]).toEqual([m.circuit, m.circuits]);
    expect(s.lastClue).toEqual(m.lastClue);
    expect(s.clueWall).toEqual(m.clueWall.map((c) => ({ id: c.id, text: c.text })));
    expect(s.roster.every((r) => r.role === null && r.word === null)).toBe(true);
    expect(s.msLeft()).toBe(m.msLeft());
    expect(s.phaseLength()).toBe(m.phaseLength());
    clock.now += 500;
    expect(s.msLeft()).toBe(m.msLeft() - 500);
  });

  it('keeps scores and roles hidden through the vote count, then reveals only the caught card', () => {
    const t = setup(6);
    toVote(t);
    const voting = toMirror(t.m, extras(6));
    expectNoWords(t.m, voting);
    const v = new MirrorScene(wire(voting), () => t.clock.now);
    expect(v.voters.map((s) => s.id)).toEqual(t.m.voters.map((s) => s.id));
    expect(v.votersLeft).toHaveLength(t.m.votersLeft.length);

    voteImpostor(t);
    const { m } = t;
    // Correct votes have already scored on the Host's side: they must not show early.
    expect(m.roster.some((r) => r.score > 0)).toBe(true);
    const counted = toMirror(m, extras(6));
    expect(counted.sc).toEqual([]);
    expect(counted.ga).toEqual([]);
    expect(counted.rl).toEqual([]);
    expectNoWords(m, counted);
    const ts = new MirrorScene(wire(counted), () => t.clock.now);
    expect(ts.tally).toEqual(m.tally);
    expect(ts.roster.every((r) => r.score === 0)).toBe(true);

    t.run(TIMING.tallyMs + 100);
    expect(m.phase).toBe('reveal');
    const out = m.tally!.out!;
    const rs = scene(t, 6);
    expect(rs.seat(out)?.role).toBe(m.seat(out)?.role);
    expect(rs.seat(out)?.word).toBe(m.seat(out)?.word);
    expect(rs.roster.filter((r) => r.id !== out).every((r) => r.role === null && r.word === null)).toBe(true);
    expect(JSON.stringify(toMirror(m, extras(6)))).not.toContain(`"${m.wargaWord}"`);
  });

  it('round-trips the ronde end and the final standings', () => {
    const t = setup(4);
    toTally(t);
    const { m } = t;
    for (let guard = 0; m.phase !== 'roundEnd' && guard < 200; guard++) t.run(250);
    expect(m.phase).toBe('roundEnd');
    const end = scene(t, 4);
    expect(end.outcome).toEqual({
      side: m.outcome!.side,
      reason: m.outcome!.reason,
      wargaWord: m.outcome!.wargaWord,
      bedaWord: m.outcome!.bedaWord,
    });
    expect(end.table.map((s) => [s.id, s.role, s.gained])).toEqual(
      m.table.map((s) => [s.id, s.role, s.gained]),
    );
    expect(end.roster.every((r) => r.score === 0)).toBe(true);
    expect(end.msLeft()).toBe(m.msLeft());

    // Jump to the closing screen by finishing every ronde on the clock.
    for (let guard = 0; m.phase !== 'final' && guard < 2_000; guard++) {
      if (m.phase === 'deal') for (const s of m.table) m.ready(s.id, t.clock.now);
      t.run(250);
    }
    expect(m.phase).toBe('final');
    const fin = scene(t, 4);
    expect(fin.standings().map(({ seat, rank }) => [seat.id, seat.score, rank])).toEqual(
      m.standings().map(({ seat, rank }) => [seat.id, seat.score, rank]),
    );
    expect(fin.roster.every((r) => r.role === null)).toBe(true);
  });

  it('freezes the clock while held or locally paused', () => {
    const t = setup(4);
    toClue(t);
    const { m, clock } = t;
    t.run(2_000);
    m.setHeld(true, clock.now);
    const held = scene(t, 4);
    const left = m.msLeft();
    clock.now += 60_000;
    expect(held.msLeft()).toBe(left);

    m.setHeld(false, clock.now);
    const live = scene(t, 4);
    const before = live.msLeft();
    live.setLocalPause(true);
    clock.now += 3_000;
    expect(live.msLeft()).toBe(before);
    live.setLocalPause(false);
    expect(live.msLeft()).toBe(before - 3_000);
  });

  it('rejects malformed states without throwing', () => {
    const t = setup(5);
    toTally(t);
    const good = JSON.parse(JSON.stringify(toMirror(t.m, extras(5)))) as Record<string, unknown>;
    expect(applyMirror(good)).not.toBeNull();
    const bad: unknown[] = [
      null,
      7,
      [],
      { ...good, v: 2 },
      { ...good, ph: 'party' },
      { ...good, st: 'x' },
      { ...good, se: ['fr', 'lisan', false] },
      { ...good, r: 9, n: 3 },
      { ...good, vo: 99 },
      { ...good, end: Number.NaN },
      { ...good, left: -1 },
      { ...good, ro: [[1, 64]] },
      { ...good, rl: [[1, 'raja']] },
      { ...good, wd: [1, 'x'.repeat(200)] },
      { ...good, sc: [[1, 1.5]] },
      { ...good, ord: [-1] },
      { ...good, ci: [0] },
      { ...good, cw: Array.from({ length: 9 }, (_, i) => [i, 'A']) },
      { ...good, lc: [1, 'x'.repeat(30)] },
      { ...good, ta: { c: [[1, 2, ['a']]], o: 1, t: false } },
      { ...good, gu: ['A', 'ya'] },
      { ...good, oc: ['warga', 'kabur', 'A', 'B'] },
      { ...good, pl: [{ id: 1, name: 'A', color: '#000', look: { c: 'bukan' } }] },
      { ...good, pl: undefined },
      { ...good, ro: Array.from({ length: 99 }, (_, i) => [i, 1]) },
    ];
    for (const b of bad) expect(applyMirror(b)).toBeNull();
  });

  it('stays small for a full room', () => {
    const name = (id: number) => `Pemain Nomor${id}`.slice(0, 12);
    let max = 0;
    const measure = (m: PenyusupMatch) => {
      max = Math.max(max, JSON.stringify(toMirror(m, extras(16, name))).length);
    };
    const t = setup(16, 'ketik');
    toClue(t);
    const { m, clock, run } = t;
    for (let guard = 0; m.phase === 'clue' && guard < 200; guard++) {
      run(TIMING.clueMinMs + 50);
      const id = m.speaker;
      if (id !== null) m.clue(id, 'qwertyuiopasdfgh', clock.now);
      measure(m);
      run(TIMING.clueShowMs + 50);
    }
    expect(m.phase).toBe('vote');
    // Votes spread over many targets: the biggest count table.
    const voters = m.voters;
    voters.forEach((s, i) => {
      m.vote(s.id, voters[(i + 1) % voters.length]!.id, clock.now);
      m.lock(s.id, clock.now);
    });
    t.step(10);
    measure(m);
    for (let guard = 0; m.phase !== 'final' && guard < 4_000; guard++) {
      if (m.phase === 'deal') for (const s of m.table) m.ready(s.id, clock.now);
      if (m.phase === 'roundEnd' || m.phase === 'reveal') measure(m);
      run(250);
    }
    measure(m);
    expect(max).toBeGreaterThan(500);
    expect(max).toBeLessThan(4096);
  });
});
