import type { PlayerInfo } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { isCpu } from '../common/cpu';
import { actDelay, choosePawn, ludoOpponents, rankOptions, threatened } from './brain';
import { absOf, BASE, HOME, LudoLogic, type MoveOption, rng } from './logic';

const human = (id: number): PlayerInfo => ({
  id,
  name: `P${id}`,
  fruit: id === 1 ? 'semangka' : 'mangga',
  color: id === 1 ? '#F2453D' : '#2F80ED',
  connected: true,
  isHost: id === 1,
});

/** Two colours (Merah at 0, Kuning at 26) with the given pawns. */
function board(mine: number[], theirs: number[]) {
  const L = new LudoLogic({
    pawns: Math.max(mine.length, theirs.length) >= 3 ? 4 : 2,
    roster: [
      { id: 1, connected: true },
      { id: -1, connected: true },
    ],
    now: 0,
  });
  const [me, them] = L.teams as [(typeof L.teams)[0], (typeof L.teams)[0]];
  me.pawns = [...mine];
  them.pawns = [...theirs];
  return { L, me, them };
}

/** Progress on Kuning's path that sits on loop square `abs`. */
const yellowAt = (abs: number) => (abs - 26 + 52) % 52;

describe('solo lineup', () => {
  it('adds exactly one opponent for one human', () => {
    const cpus = ludoOpponents([human(1)]);
    expect(cpus).toHaveLength(1);
    expect(isCpu(cpus[0]!.id)).toBe(true);
    expect(cpus[0]!.fruit).not.toBe('semangka');
    expect(cpus[0]!.name.length).toBeGreaterThan(0);
  });

  it('adds nobody for two humans', () => {
    expect(ludoOpponents([human(1), human(2)])).toHaveLength(0);
  });

  it('seats the opponent on the opposite corner', () => {
    const [cpu] = ludoOpponents([human(1)]);
    const L = new LudoLogic({
      pawns: 4,
      roster: [
        { id: 1, connected: true },
        { id: cpu!.id, connected: true },
      ],
      now: 0,
    });
    expect(L.teams.map((t) => [t.members, t.color])).toEqual([
      [[1], 0],
      [[cpu!.id], 2],
    ]);
  });
});

describe('threat', () => {
  it('sees an opponent up to six squares behind, never on a safe square', () => {
    const { me, L } = board([BASE, BASE], [yellowAt(10), BASE]);
    expect(threatened(14, me, L.teams)).toBe(true);
    expect(threatened(16, me, L.teams)).toBe(true);
    expect(threatened(17, me, L.teams)).toBe(false);
    expect(threatened(10, me, L.teams)).toBe(false);
    expect(threatened(13, me, L.teams)).toBe(false);
  });
});

describe('pawn choice', () => {
  const pawnsOf = (opts: MoveOption[]) => opts.map((o) => o.pawn);

  it('captures before reaching home', () => {
    // Pawn 0 on loop 10 hits Kuning on 14 with a 4; pawn 1 reaches home with a 4.
    const { L, me } = board([10, HOME - 4], [yellowAt(14), BASE]);
    const ranked = rankOptions(L.legalMoves(me, 4), me, L.teams);
    expect(ranked[0]!.captures).toHaveLength(1);
    expect(pawnsOf(ranked)).toEqual([0, 1]);
  });

  it('reaches home before leaving the base', () => {
    const { L, me } = board([BASE, HOME - 6], [BASE, BASE]);
    const ranked = rankOptions(L.legalMoves(me, 6), me, L.teams);
    expect(ranked[0]!.home).toBe(true);
    expect(ranked[1]!.exit).toBe(true);
  });

  it('leaves the base on a 6 before walking a pawn', () => {
    const { L, me } = board([BASE, 20], [BASE, BASE]);
    const ranked = rankOptions(L.legalMoves(me, 6), me, L.teams);
    expect(ranked[0]!.exit).toBe(true);
  });

  it('prefers a safe square', () => {
    // Pawn 1 at 5 reaches the star on 8 with a 3; pawn 0 at 30 would land on a plain square.
    const { L, me } = board([30, 5], [BASE, BASE]);
    const ranked = rankOptions(L.legalMoves(me, 3), me, L.teams);
    expect(ranked[0]!.pawn).toBe(1);
    expect(ranked[0]!.safe).toBe(true);
  });

  it('runs away from danger', () => {
    // Pawn 1 on loop 18 has Kuning three squares behind; pawn 0 is further ahead and calm.
    const { L, me } = board([40, 18], [yellowAt(15), BASE]);
    expect(threatened(absOf(0, 18)!, me, L.teams)).toBe(true);
    const ranked = rankOptions(L.legalMoves(me, 5), me, L.teams);
    expect(ranked[0]!.pawn).toBe(1);
  });

  it('otherwise advances the leading pawn', () => {
    const { L, me } = board([30, 15], [BASE, BASE]);
    const ranked = rankOptions(L.legalMoves(me, 2), me, L.teams);
    expect(ranked[0]!.pawn).toBe(0);
  });

  it('avoids landing right in front of an opponent', () => {
    // Pawn 0 (ahead) would land on 33 with Kuning on 30 behind it; pawn 1 lands on calm 17.
    const { L, me } = board([31, 15], [yellowAt(30), BASE]);
    const ranked = rankOptions(L.legalMoves(me, 2), me, L.teams);
    expect(ranked[0]!.pawn).toBe(1);
  });

  it('plays the best move at full skill and slips sometimes when gentle', () => {
    const { L, me } = board([10, HOME - 4], [yellowAt(14), BASE]);
    const opts = L.legalMoves(me, 4);
    expect(choosePawn(opts, me, L.teams, 1, () => 0)).toBe(0);
    const r = rng(7);
    let slips = 0;
    for (let i = 0; i < 400; i++) if (choosePawn(opts, me, L.teams, 0, r) !== 0) slips++;
    expect(slips).toBeGreaterThan(60);
    expect(slips).toBeLessThan(340);
  });
});

describe('timing', () => {
  it('never acts instantly; takeover seats wait about 1.5 to 3 seconds', () => {
    const r = rng(3);
    for (let i = 0; i < 200; i++) {
      const roll = actDelay('roll', r(), true, 1, r);
      expect(roll).toBeGreaterThanOrEqual(1500);
      expect(roll).toBeLessThanOrEqual(3000);
      expect(actDelay('pick', r(), true, 2, r)).toBeLessThanOrEqual(2000);
      expect(actDelay('roll', r(), false, 1, r)).toBeGreaterThanOrEqual(600);
      expect(actDelay('pick', r(), false, 3, r)).toBeGreaterThanOrEqual(750);
    }
  });
});

describe('whole games', () => {
  /** Plays one game; colour 0 picks randomly, colour 1 uses the brain. Returns the winner. */
  function play(seed: number, skill: number): number {
    const L = new LudoLogic({
      pawns: 4,
      roster: [
        { id: 1, connected: true },
        { id: -1, connected: true },
      ],
      now: 0,
      seed,
    });
    const r = rng(seed * 31 + 1);
    let t = 0;
    for (let k = 0; k < 20_000; k++) {
      L.drain();
      if (L.phase === 'ended') break;
      if (L.phase === 'roll') L.roll(L.roller, t);
      else if (L.phase === 'pick') {
        const pawn =
          L.roller < 0
            ? choosePawn(L.options, L.team, L.teams, skill, r)
            : L.options[Math.floor(r() * L.options.length)]!.pawn;
        L.pick(L.roller, pawn + 1, t);
      } else {
        t = Math.max(t + 1, L.deadline);
        L.tick(t);
      }
    }
    expect(L.phase).toBe('ended');
    return L.winner!;
  }

  it('finishes every game and a sharp brain beats random moves most of the time', () => {
    let wins = 0;
    const games = 80;
    for (let s = 1; s <= games; s++) if (play(s, 0.95) === 1) wins++;
    expect(wins / games).toBeGreaterThan(0.6);
  });
});
