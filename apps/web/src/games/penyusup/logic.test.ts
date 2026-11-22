import { describe, expect, it } from 'vitest';
import {
  circuitsFor,
  clueProblem,
  impostorCount,
  KOSONG_MIN,
  MAX_VOTES,
  PenyusupMatch,
  POINTS,
  TIMING,
} from './logic';

const players = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1, connected: true }));

function setup(
  n: number,
  opts: { mode?: 'lisan' | 'ketik'; kosong?: boolean; rounds?: number; seed?: number } = {},
) {
  let now = 1_000;
  const m = new PenyusupMatch({ rounds: opts.rounds ?? 3, seed: opts.seed ?? 7, now, players: players(n) });
  const step = (ms: number) => {
    now += ms;
    return m.tick(now);
  };
  const at = () => now;
  m.pick('id');
  m.next(now);
  m.pick(opts.mode ?? 'lisan');
  m.next(now);
  if (opts.kosong) expect(m.pick('on')).toBe(true);
  m.next(now);
  return { m, step, at };
}

/** Run time forward in small steps (the clock caps one step at a second). */
function run(step: (ms: number) => unknown, ms: number) {
  for (let left = ms; left > 0; left -= 250) step(Math.min(250, left));
}

function toVote(m: PenyusupMatch, step: (ms: number) => unknown, at: () => number) {
  for (const s of m.table) m.ready(s.id, at());
  run(step, TIMING.dealMinMs + 300);
  expect(m.phase).toBe('clue');
  let guard = 0;
  while (m.phase === 'clue' && guard++ < 100) {
    run(step, TIMING.clueMinMs + 50);
    const id = m.speaker;
    if (id !== null) m.done(id, at());
  }
  expect(m.phase).toBe('vote');
}

function voteAll(m: PenyusupMatch, target: (voter: number) => number, at: () => number) {
  for (const s of m.voters) {
    m.vote(s.id, target(s.id), at());
    m.lock(s.id, at());
  }
}

describe('Penyusup rules', () => {
  it('scales impostors and circuits with the table', () => {
    expect(impostorCount(3)).toBe(1);
    expect(impostorCount(7)).toBe(1);
    expect(impostorCount(8)).toBe(2);
    expect(impostorCount(16)).toBe(3);
    expect(circuitsFor(4, true)).toBe(2);
    expect(circuitsFor(6, true)).toBe(1);
    expect(circuitsFor(4, false)).toBe(1);
  });

  it('refuses typed clues that give the own word away', () => {
    expect(clueProblem('kopi', 'Kopi')).toBe('own');
    expect(clueProblem('KOPIHITAM', 'Kopi')).toBe('own');
    expect(clueProblem('ayam', 'Mi Ayam')).toBe('own');
    expect(clueProblem('pahit', 'Kopi')).toBeNull();
    expect(clueProblem('a', 'Kopi')).toBe('empty');
    expect(clueProblem('apa saja', '')).toBeNull();
  });

  it('does not start under three players and keeps Si Kosong off for small tables', () => {
    const m = new PenyusupMatch({ rounds: 3, seed: 1, now: 0, players: players(2) });
    expect(m.start(0)).toEqual([]);
    expect(m.phase).toBe('setup');
    const four = new PenyusupMatch({ rounds: 3, seed: 1, now: 0, players: players(KOSONG_MIN - 1) });
    four.next(0);
    four.next(0);
    expect(four.pick('on')).toBe(false);
  });

  it('deals one word to the majority, another to the impostor, none to Si Kosong', () => {
    const { m } = setup(6, { kosong: true });
    expect(m.phase).toBe('deal');
    const roles = m.table.map((s) => s.role);
    expect(roles.filter((r) => r === 'penyusup')).toHaveLength(1);
    expect(roles.filter((r) => r === 'kosong')).toHaveLength(1);
    const warga = m.table.filter((s) => s.role === 'warga');
    expect(new Set(warga.map((s) => s.word)).size).toBe(1);
    const imp = m.table.find((s) => s.role === 'penyusup')!;
    expect(imp.word).not.toBe(warga[0]!.word);
    expect(m.table.find((s) => s.role === 'kosong')!.word).toBe('');
    // The first ronde draws an easy pair.
    expect(m.pair?.easy).toBe(true);
  });

  it('never lets Si Kosong open the first circuit', () => {
    for (let seed = 1; seed < 30; seed++) {
      const { m, step, at } = setup(5, { kosong: true, seed });
      for (const s of m.table) m.ready(s.id, at());
      run(step, TIMING.dealMinMs + 300);
      expect(m.seat(m.order[0]!)?.role).not.toBe('kosong');
    }
  });

  it('catching the impostor wins the ronde for the warga', () => {
    const { m, step, at } = setup(4);
    toVote(m, step, at);
    const imp = m.table.find((s) => s.role === 'penyusup')!;
    const anyWarga = m.table.find((s) => s.role === 'warga')!;
    voteAll(m, (v) => (v === imp.id ? anyWarga.id : imp.id), at);
    step(10);
    expect(m.phase).toBe('tally');
    expect(m.tally?.out).toBe(imp.id);
    run(step, TIMING.tallyMs + 100);
    expect(m.phase).toBe('reveal');
    run(step, TIMING.revealMs + 100);
    expect(m.phase).toBe('roundEnd');
    expect(m.outcome?.side).toBe('warga');
    expect(m.outcome?.reason).toBe('caught');
    // Each warga: correct vote + win + alive bonus.
    expect(anyWarga.score).toBe(POINTS.correctVote + POINTS.wargaWin + POINTS.wargaAlive);
    expect(imp.score).toBe(0);
  });

  it('the impostor wins when they outnumber the warga', () => {
    const { m, step, at } = setup(3);
    toVote(m, step, at);
    const imp = m.table.find((s) => s.role === 'penyusup')!;
    const victim = m.table.find((s) => s.role === 'warga')!;
    voteAll(m, (v) => (v === victim.id ? imp.id : victim.id), at);
    step(10);
    run(step, TIMING.tallyMs + TIMING.revealMs + 200);
    expect(m.phase).toBe('roundEnd');
    expect(m.outcome?.side).toBe('beda');
    expect(imp.score).toBe(POINTS.bedaWin + POINTS.bedaAlive);
  });

  it('a tie sends nobody home, and the impostor slips away after the last vote', () => {
    const { m, step, at } = setup(4);
    const ids = m.table.map((s) => s.id);
    for (let v = 0; v < MAX_VOTES; v++) {
      toVote(m, step, at);
      // Two pairs vote for each other: a tie.
      const alive = m.alive.map((s) => s.id);
      voteAll(m, (voter) => alive[(alive.indexOf(voter) + 1) % alive.length]!, at);
      step(10);
      expect(m.tally?.tie).toBe(true);
      run(step, TIMING.tallyMs + 100);
    }
    expect(m.phase).toBe('roundEnd');
    expect(m.outcome?.reason).toBe('escaped');
    expect(m.alive.map((s) => s.id).sort()).toEqual(ids.sort());
  });

  it('a caught Si Kosong steals the ronde with the right word', () => {
    const { m, step, at } = setup(5, { kosong: true, seed: 3 });
    toVote(m, step, at);
    const kos = m.table.find((s) => s.role === 'kosong')!;
    const other = m.table.find((s) => s.role === 'warga')!;
    voteAll(m, (v) => (v === kos.id ? other.id : kos.id), at);
    step(10);
    run(step, TIMING.tallyMs + TIMING.revealMs + 200);
    expect(m.phase).toBe('guess');
    m.guess(kos.id, m.wargaWord.toLowerCase().replace(/ /g, ''), at());
    expect(m.guessed?.correct).toBe(true);
    run(step, TIMING.guessShowMs + 100);
    expect(m.phase).toBe('roundEnd');
    expect(m.outcome?.side).toBe('kosong');
    expect(kos.score).toBe(POINTS.kosongSteal);
  });

  it('a wrong guess lets the ronde play on', () => {
    const { m, step, at } = setup(6, { kosong: true, seed: 5 });
    toVote(m, step, at);
    const kos = m.table.find((s) => s.role === 'kosong')!;
    const other = m.table.find((s) => s.role === 'warga')!;
    voteAll(m, (v) => (v === kos.id ? other.id : kos.id), at);
    step(10);
    run(step, TIMING.tallyMs + TIMING.revealMs + 200);
    m.guess(kos.id, 'salah', at());
    run(step, TIMING.guessShowMs + 100);
    expect(m.phase).toBe('clue');
    expect(kos.alive).toBe(false);
  });

  it('Ketik mode records clues, refuses the own word and moves on', () => {
    const { m, step, at } = setup(4, { mode: 'ketik' });
    for (const s of m.table) m.ready(s.id, at());
    run(step, TIMING.dealMinMs + 300);
    const id = m.speaker!;
    const seat = m.seat(id)!;
    expect(m.clue(id, seat.word, at()).problem).toBe('own');
    expect(m.clue(id, 'zzzz', at()).problem).toBeNull();
    expect(m.lastClue?.text).toBe('ZZZZ');
    run(step, TIMING.clueShowMs + 100);
    expect(m.speaker).not.toBe(id);
    // A silent turn leaves an empty card.
    const quiet = m.speaker!;
    run(step, TIMING.clueMs + 100);
    expect(m.clueWall.find((c) => c.id === quiet)?.text).toBe('');
  });

  it('pausing stops the clock', () => {
    const { m, step, at } = setup(3);
    m.setHeld(true, at());
    run(step, TIMING.dealMs * 2);
    expect(m.phase).toBe('deal');
    m.setHeld(false, at());
    run(step, TIMING.dealMs + 200);
    expect(m.phase).toBe('clue');
  });

  it('skips a speaker who left and doubles points in the final ronde', () => {
    const { m, step, at } = setup(4, { rounds: 1 });
    expect(m.isFinal).toBe(true);
    expect(m.multiplier).toBe(2);
    for (const s of m.table) m.ready(s.id, at());
    run(step, TIMING.dealMinMs + 300);
    const gone = m.speaker!;
    m.syncPlayers(
      players(4).map((p) => ({ ...p, connected: p.id !== gone })),
      at(),
    );
    step(10);
    expect(m.speaker).not.toBe(gone);
  });

  it('plays every ronde to the end', () => {
    const { m, step, at } = setup(4, { rounds: 2 });
    for (let r = 0; r < 2; r++) {
      toVote(m, step, at);
      const imp = m.table.find((s) => s.role === 'penyusup')!;
      const w = m.table.find((s) => s.role === 'warga')!;
      voteAll(m, (v) => (v === imp.id ? w.id : imp.id), at);
      step(10);
      run(step, TIMING.tallyMs + TIMING.revealMs + TIMING.roundEndMs + 400);
    }
    expect(m.phase).toBe('final');
    run(step, TIMING.finalMs + 100);
    expect(m.phase).toBe('ended');
    expect(m.played).toHaveLength(2);
    expect(new Set(m.played).size).toBe(2);
  });
});
