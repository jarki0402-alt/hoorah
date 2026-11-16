import { describe, expect, it } from 'vitest';
import {
  AUTO_MS,
  applyStep,
  assignTeams,
  autoPick,
  type CongklakEvent,
  CongklakMatch,
  dropGap,
  GameClock,
  holeNumber,
  holePos,
  INTRO_MS,
  moveDuration,
  newBoard,
  nextPos,
  opposite,
  type RosterEntry,
  type Side,
  seedsOnSide,
  sow,
  stepTimes,
  storeOf,
  sweep,
  TURN_MS,
  validHoles,
} from './logic';

const total = (b: readonly number[]) => b.reduce((s, n) => s + n, 0);

/** Board from two rows as players see them (hole 1 … 7) plus the stores. */
function board(side0: number[], side1: number[], store0 = 0, store1 = 0): number[] {
  return [...side0, store0, ...side1, store1];
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('board geometry', () => {
  it('starts with 7 seeds in each of the 14 holes and empty stores', () => {
    const b = newBoard();
    expect(b).toHaveLength(16);
    expect(total(b)).toBe(98);
    expect(b[7]).toBe(0);
    expect(b[15]).toBe(0);
  });

  it('numbers holes 1–7 towards the own store and pairs opposite holes', () => {
    expect(holeNumber(0)).toBe(1);
    expect(holeNumber(6)).toBe(7);
    expect(holeNumber(8)).toBe(1);
    expect(holeNumber(14)).toBe(7);
    expect(holePos(1, 3)).toBe(10);
    expect(opposite(0)).toBe(14);
    expect(opposite(6)).toBe(8);
    expect(opposite(10)).toBe(4);
  });

  it('skips only the opponent store', () => {
    expect(nextPos(6, 0)).toBe(7);
    expect(nextPos(14, 0)).toBe(0);
    expect(nextPos(14, 1)).toBe(15);
    expect(nextPos(15, 1)).toBe(0);
    expect(nextPos(6, 1)).toBe(8);
  });
});

describe('sowing', () => {
  it('sows one seed per hole from the next hole on and moves again from the store', () => {
    const t = sow(newBoard(), 0, 0);
    expect(t.steps[0]).toEqual({ t: 'take', pos: 0, n: 7 });
    expect(t.steps.slice(1).map((s) => (s.t === 'drop' ? s.pos : -1))).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(t.outcome).toBe('store');
    expect(t.after[0]).toBe(0);
    expect(t.after[7]).toBe(1);
    expect(t.after[1]).toBe(8);
  });

  it('never drops into the opponent store', () => {
    const b = board([0, 0, 0, 0, 0, 0, 20], [0, 0, 0, 0, 0, 0, 0]);
    const t = sow(b, 0, 6);
    expect(t.after[15]).toBe(0);
    expect(t.steps.some((s) => s.t === 'drop' && s.pos === 15)).toBe(false);
    expect(total(t.after)).toBe(20);
  });

  it('keeps sowing from a non-empty hole (relay)', () => {
    // Side 0 hole 7 (pos 6) with 2 seeds: store, then side 1 hole 1 (pos 8) which holds 3.
    const b = board([0, 0, 0, 0, 0, 0, 2], [3, 0, 0, 0, 0, 0, 0]);
    const t = sow(b, 0, 6);
    expect(t.relays).toBe(1);
    expect(t.steps).toContainEqual({ t: 'take', pos: 8, n: 4 });
    // 4 seeds from pos 8: 9, 10, 11, 12 (all empty) → turn ends on the opponent side.
    expect(t.outcome).toBe('empty-opp');
    expect(t.lastPos).toBe(12);
    expect(t.after).toEqual(board([0, 0, 0, 0, 0, 0, 0], [0, 1, 1, 1, 1, 0, 0], 1));
  });

  it('captures the opposite hole when the last seed lands in an empty own hole (tembak)', () => {
    // Side 0 hole 1 with 2 seeds: 1, then 2 (empty). Across pos 2 is pos 12 with 5.
    const b = board([2, 1, 0, 4, 0, 0, 0], [0, 0, 0, 0, 5, 0, 0]);
    const t = sow(b, 0, 0);
    expect(t.outcome).toBe('capture');
    expect(t.captured).toBe(6);
    expect(t.steps.at(-1)).toEqual({ t: 'capture', pos: 2, opp: 12, n: 6 });
    expect(t.after[7]).toBe(6);
    expect(t.after[2]).toBe(0);
    expect(t.after[12]).toBe(0);
    expect(total(t.after)).toBe(total(b));
  });

  it('ends the turn on an empty own hole with nothing across', () => {
    const b = board([1, 0, 0, 0, 0, 0, 0], [3, 3, 3, 3, 3, 0, 3]);
    const t = sow(b, 0, 0);
    expect(t.outcome).toBe('empty-own');
    expect(t.after[1]).toBe(1);
    expect(t.after[7]).toBe(0);
  });

  it('ends the turn on an empty opponent hole', () => {
    const b = board([0, 0, 0, 0, 0, 0, 2], [0, 4, 4, 4, 4, 4, 4]);
    const t = sow(b, 0, 6);
    expect(t.outcome).toBe('empty-opp');
    expect(t.after[7]).toBe(1);
    expect(t.after[8]).toBe(1);
  });

  it('works the same for side 1 (its store is 15, side 0 store skipped)', () => {
    const b = board([0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 3]);
    const t = sow(b, 1, 14);
    // 15 (own store), 0, 1 → pos 1 empty on the opponent side.
    expect(t.steps.filter((s) => s.t === 'drop').map((s) => s.pos)).toEqual([15, 0, 1]);
    expect(t.outcome).toBe('empty-opp');
    expect(t.after[7]).toBe(0);
  });

  it('rejects empty holes and holes of the other side', () => {
    expect(() => sow(board([0, 1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1, 1]), 0, 0)).toThrow();
    expect(() => sow(newBoard(), 0, 8)).toThrow();
    expect(() => sow(newBoard(), 1, 15)).toThrow();
  });

  it('stops an overly long relay without losing seeds (guard)', () => {
    const t = sow(newBoard(), 0, 1, 5);
    expect(t.outcome).toBe('guard');
    expect(t.drops).toBeGreaterThanOrEqual(5);
    expect(total(t.after)).toBe(98);
  });

  it('replays to the same board step by step and conserves seeds on random boards', () => {
    const r = rng(42);
    for (let k = 0; k < 400; k++) {
      const b = Array.from({ length: 16 }, (_, i) => (i === 7 || i === 15 ? 0 : Math.floor(r() * 9)));
      const side: Side = r() < 0.5 ? 0 : 1;
      const valid = validHoles(b, side);
      if (!valid.length) continue;
      const pit = valid[Math.floor(r() * valid.length)]!;
      const t = sow(b, side, pit);
      expect(total(t.after)).toBe(total(b));
      expect(t.after[storeOf(side === 0 ? 1 : 0)]).toBe(b[storeOf(side === 0 ? 1 : 0)]);
      const replay = b.slice();
      let hand = 0;
      for (const s of t.steps) hand = applyStep(replay, hand, s, side);
      expect(hand).toBe(0);
      expect(replay).toEqual(t.after);
    }
  });
});

describe('round end and auto pick', () => {
  it('sweeps the remaining seeds to their owners', () => {
    const b = board([1, 2, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 4], 40, 51);
    const { board: after, swept } = sweep(b);
    expect(swept).toEqual([3, 4]);
    expect(after[7]).toBe(43);
    expect(after[15]).toBe(55);
    expect(seedsOnSide(after, 0) + seedsOnSide(after, 1)).toBe(0);
  });

  it('prefers the move that brings the most into the store', () => {
    // A single seed into the store beats a move that only feeds the opponent.
    expect(autoPick(board([0, 0, 0, 0, 0, 3, 1], [0, 0, 0, 0, 0, 0, 0]), 0)).toBe(6);
    // A capture of 10 beats a single seed into the store.
    expect(autoPick(board([2, 0, 0, 0, 0, 0, 1], [0, 0, 0, 0, 9, 0, 0]), 0)).toBe(0);
    // On a fresh board it picks the best of all seven.
    const fresh = newBoard();
    const gain = (p: number) => sow(fresh, 0, p).after[7]!;
    const best = Math.max(...validHoles(fresh, 0).map(gain));
    expect(gain(autoPick(fresh, 0))).toBeGreaterThanOrEqual(best - 1);
    expect(() => autoPick(board([0, 0, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0, 0]), 0)).toThrow();
  });
});

describe('timing', () => {
  it('sows quick and speeds up on long relays', () => {
    expect(dropGap(0)).toBeGreaterThan(dropGap(10));
    expect(dropGap(500)).toBe(36);
    const t = sow(newBoard(), 0, 0);
    const { at, total: ms } = stepTimes(t.steps);
    expect(at).toHaveLength(t.steps.length);
    for (let i = 1; i < at.length; i++) expect(at[i]!).toBeGreaterThan(at[i - 1]!);
    expect(ms).toBeGreaterThan(1000);
    expect(ms).toBeLessThan(2500);
    expect(moveDuration(t)).toBeGreaterThan(ms);
  });
});

describe('teams', () => {
  it('alternates players between the sides in join order', () => {
    expect(assignTeams([1, 2])).toEqual([[1], [2]]);
    expect(assignTeams([1, 2, 3, 4, 5])).toEqual([
      [1, 3, 5],
      [2, 4],
    ]);
  });
});

describe('clock', () => {
  it('stands still while paused and continues after', () => {
    let server = 1000;
    const c = new GameClock(() => server);
    expect(c.now()).toBe(1000);
    c.pause();
    server = 5000;
    expect(c.now()).toBe(1000);
    c.resume();
    server = 5500;
    expect(c.now()).toBe(1500);
    expect(c.toServer(1500)).toBe(5500);
  });
});

/* ------------------------------------------------------------------ match */

const roster = (...ids: number[]): RosterEntry[] => ids.map((id) => ({ id, connected: true }));

function makeMatch(ids: number[], rounds = 1) {
  const m = new CongklakMatch({ rounds, roster: roster(...ids), now: 0 });
  return m;
}

/** Runs the match to the end, every player picking `choose` instantly. */
function playOut(m: CongklakMatch, choose: (m: CongklakMatch) => number | null, limit = 5000) {
  let now = 0;
  const events: CongklakEvent[] = [...m.drain()];
  for (let i = 0; i < limit && m.phase !== 'ended'; i++) {
    if (m.phase === 'turn' && m.current !== null) {
      const n = choose(m);
      if (n !== null) {
        expect(m.pick(m.current, n, now)).toBe(true);
        events.push(...m.drain());
        continue;
      }
    }
    now = Math.max(now + 1, m.phase === 'turn' ? m.deadline : m.phaseEnd);
    m.tick(now);
    events.push(...m.drain());
  }
  return { events, now };
}

const firstValid = (m: CongklakMatch) => {
  const p = validHoles(m.board, m.turnSide)[0];
  return p === undefined ? null : holeNumber(p);
};

describe('match', () => {
  it('starts with an intro, then side 0 picks', () => {
    const m = makeMatch([1, 2]);
    expect(m.phase).toBe('intro');
    expect(m.drain()).toEqual([{ type: 'intro', round: 1, first: 0 }]);
    m.tick(INTRO_MS);
    expect(m.phase).toBe('turn');
    expect(m.current).toBe(1);
    expect(m.deadline).toBe(INTRO_MS + TURN_MS);
    expect(m.drain()[0]).toMatchObject({ type: 'turn', side: 0, playerId: 1, extra: false });
  });

  it('rejects picks from the wrong player, of empty holes, and outside a turn', () => {
    const m = makeMatch([1, 2]);
    expect(m.pick(1, 1, 0)).toBe(false); // intro
    m.tick(INTRO_MS);
    expect(m.pick(2, 1, INTRO_MS)).toBe(false);
    expect(m.pick(1, 0, INTRO_MS)).toBe(false);
    expect(m.pick(1, 8, INTRO_MS)).toBe(false);
    expect(m.pick(1, 2.5, INTRO_MS)).toBe(false);
    m.board[holePos(0, 3)] = 0;
    expect(m.pick(1, 3, INTRO_MS)).toBe(false);
    expect(m.pick(1, 1, INTRO_MS)).toBe(true);
    expect(m.phase).toBe('sowing');
    expect(m.pick(1, 2, INTRO_MS)).toBe(false);
  });

  it('gives the same player another turn after the last seed lands in the store', () => {
    const m = makeMatch([1, 2, 3, 4]);
    m.tick(INTRO_MS);
    expect(m.current).toBe(1);
    m.pick(1, 1, INTRO_MS); // 7 seeds from hole 1 end in the store
    const move = m.move!;
    expect(move.trace.outcome).toBe('store');
    m.tick(move.endAt);
    expect(m.phase).toBe('turn');
    expect(m.turnSide).toBe(0);
    expect(m.extra).toBe(true);
    expect(m.current).toBe(1);
    expect(m.stats.get(1)!.extras).toBe(1);
  });

  it('rotates team members for their side and passes the turn', () => {
    const m = makeMatch([1, 2, 3, 4, 5]);
    expect(m.members).toEqual([
      [1, 3, 5],
      [2, 4],
    ]);
    expect(m.teamMode).toBe(true);
    const seen: number[] = [];
    let now = INTRO_MS;
    m.tick(now);
    for (let i = 0; i < 6 && m.phase === 'turn'; i++) {
      if (!m.extra) seen.push(m.current!);
      // Hole 2 never ends in the store on a fresh-ish board, so turns pass.
      const p = validHoles(m.board, m.turnSide).find((x) => sow(m.board, m.turnSide, x).outcome !== 'store');
      if (p === undefined) break;
      m.pick(m.current!, holeNumber(p), now);
      now = m.move!.endAt;
      m.tick(now);
    }
    expect(seen.slice(0, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('picks automatically when the time runs out', () => {
    const m = makeMatch([1, 2]);
    m.tick(INTRO_MS);
    m.drain();
    m.tick(INTRO_MS + TURN_MS);
    const ev = m.drain().find((e) => e.type === 'move');
    expect(ev).toMatchObject({ type: 'move', playerId: 1, auto: true });
    expect(m.stats.get(1)!.timeouts).toBe(1);
    expect(m.move!.trace.pit).toBe(autoPick(newBoard(), 0));
  });

  it('moves by itself for a side with nobody connected, and hands over when someone returns', () => {
    const m = new CongklakMatch({
      rounds: 1,
      roster: [
        { id: 1, connected: false },
        { id: 2, connected: true },
      ],
      now: 0,
    });
    m.tick(INTRO_MS);
    expect(m.current).toBeNull();
    expect(m.deadline).toBe(INTRO_MS + AUTO_MS);
    m.setRoster(roster(1, 2), INTRO_MS + 100);
    expect(m.current).toBe(1);
    expect(m.deadline).toBe(INTRO_MS + 100 + TURN_MS);
    m.setRoster(
      [
        { id: 1, connected: false },
        { id: 2, connected: true },
      ],
      INTRO_MS + 200,
    );
    expect(m.current).toBeNull();
    expect(m.deadline).toBe(INTRO_MS + 200 + AUTO_MS);
  });

  it('puts late joiners on the smaller side', () => {
    const m = makeMatch([1, 2, 3]);
    m.setRoster(roster(1, 2, 3, 9), 10);
    expect(m.members[1]).toContain(9);
    expect(m.stats.get(9)!.side).toBe(1);
  });

  it('ends the round when the side to move is empty and gives leftovers to their owners', () => {
    const m = makeMatch([1, 2]);
    m.tick(INTRO_MS);
    // Side 1 still has seeds in hole 3 only, side 0 will be empty after its move.
    m.board = board([0, 0, 0, 0, 0, 0, 1], [0, 0, 3, 0, 0, 0, 0], 50, 44);
    m.pick(1, 7, INTRO_MS); // the seed goes to the store: extra turn, but side 0 is now empty
    m.drain();
    m.tick(m.move!.endAt);
    const evs = m.drain();
    const end = evs.find((e) => e.type === 'roundEnd');
    expect(end).toMatchObject({
      type: 'roundEnd',
      last: true,
      result: { round: 1, stores: [51, 47], swept: [0, 3], winner: 0 },
    });
    expect(m.phase).toBe('final');
    expect(m.totals).toEqual([51, 47]);
    m.tick(m.phaseEnd);
    expect(m.phase).toBe('ended');
    expect(m.drain()).toEqual([{ type: 'end' }]);
  });

  it('plays a full match to the end with all seeds in the stores', () => {
    const m = makeMatch([1, 2]);
    const { events } = playOut(m, firstValid);
    expect(m.phase).toBe('ended');
    expect(m.results).toHaveLength(1);
    const [a, b] = m.results[0]!.stores;
    expect(a + b).toBe(98);
    expect(events.at(-1)).toEqual({ type: 'end' });
    expect(events.filter((e) => e.type === 'move').length).toBeGreaterThan(3);
  });

  it('plays three rounds with fresh boards, alternating who starts, and sums the totals', () => {
    const m = makeMatch([1, 2, 3], 3);
    const { events } = playOut(m, () => null); // nobody picks: every move is a timeout
    expect(m.phase).toBe('ended');
    const intros = events.filter((e) => e.type === 'intro');
    expect(intros.map((e) => (e.type === 'intro' ? e.first : -1))).toEqual([0, 1, 0]);
    expect(m.results).toHaveLength(3);
    const [a, b] = m.totals;
    expect(a + b).toBe(3 * 98);
    expect(m.leader).toBe(a === b ? null : a > b ? 0 : 1);
    let timeouts = 0;
    for (const s of m.stats.values()) timeouts += s.timeouts;
    expect(timeouts).toBe(events.filter((e) => e.type === 'move' && e.playerId !== null).length);
  });

  it('plays random full matches without getting stuck', () => {
    const r = rng(7);
    for (let g = 0; g < 30; g++) {
      const m = makeMatch([1, 2, 3, 4], 1);
      playOut(m, (mm) => {
        const v = validHoles(mm.board, mm.turnSide);
        return holeNumber(v[Math.floor(r() * v.length)]!);
      });
      expect(m.phase).toBe('ended');
      expect(total(m.board)).toBe(98);
    }
  });
});
