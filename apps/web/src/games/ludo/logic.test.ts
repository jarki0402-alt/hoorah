import { describe, expect, it } from 'vitest';
import { baseSlot, homeColumn, layoutPawns, pawnPoint, TRACK } from './geometry';
import {
  AWAY_MS,
  absOf,
  BASE,
  bestOption,
  colorsFor,
  DICE_MS,
  HOME,
  INTRO_MS,
  type LudoEvent,
  LudoLogic,
  makeTeams,
  PASS_MS,
  ROLL_MS,
  SAFE_ABS,
  standings,
} from './logic';

/** Dice that follow a script (then repeat 1s). */
function scripted(values: number[]): () => number {
  let i = 0;
  return () => values[i++] ?? 1;
}

function make(players: number, dice: number[], pawns = 2, connected = true) {
  const roster = Array.from({ length: players }, (_, i) => ({ id: i + 1, connected }));
  const L = new LudoLogic({ pawns, roster, now: 0, dice: scripted(dice) });
  let t = 0;
  const all: LudoEvent[] = [...L.drain()];
  const advance = (ms: number) => {
    t += ms;
    L.tick(t);
    all.push(...L.drain());
  };
  /** Run the clock until the logic waits for the roller (roll or pick) or the game ends. */
  const settle = () => {
    for (let k = 0; k < 400; k++) {
      if (L.phase === 'roll' || L.phase === 'pick' || L.phase === 'ended') return;
      advance(Math.max(1, L.deadline - t));
    }
    throw new Error('logic never settled');
  };
  const roll = () => {
    expect(L.roll(L.roller, t)).toBe(true);
    all.push(...L.drain());
    settle();
  };
  const pick = (pawn: number) => {
    expect(L.pick(L.roller, pawn, t)).toBe(true);
    all.push(...L.drain());
    settle();
  };
  settle();
  return { L, all, roll, pick, settle, advance, now: () => t };
}

describe('board geometry', () => {
  it('has a closed loop of 52 neighbouring squares (diagonal only at the inner corners)', () => {
    expect(TRACK).toHaveLength(52);
    let diagonal = 0;
    for (let i = 0; i < 52; i++) {
      const a = TRACK[i]!;
      const b = TRACK[(i + 1) % 52]!;
      expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBe(1);
      if (a.x !== b.x && a.y !== b.y) diagonal++;
    }
    expect(diagonal).toBe(4);
    expect(new Set(TRACK.map((p) => `${p.x},${p.y}`)).size).toBe(52);
  });

  it('enters each home column next to the last loop square and ends at the centre', () => {
    for (const c of [0, 1, 2, 3] as const) {
      const col = homeColumn(c);
      const last = col[col.length - 1]!;
      // The last square touches the 3x3 centre (cells 6..8).
      expect(Math.abs(last.x - 7) + Math.abs(last.y - 7)).toBe(2);
      const entry = pawnPoint(c, 50, 0, 4);
      const first = pawnPoint(c, 51, 0, 4);
      expect(Math.abs(entry.x - first.x) + Math.abs(entry.y - first.y)).toBe(1);
    }
  });

  it('keeps base slots inside the base and fans out shared squares', () => {
    const s = baseSlot(2, 3, 4);
    expect(s.x).toBeGreaterThan(9);
    expect(s.y).toBeGreaterThan(9);
    const placed = layoutPawns(
      [
        { team: 0, color: 0, pawn: 0, progress: 5 },
        { team: 1, color: 2, pawn: 0, progress: 31 },
      ],
      2,
    );
    expect(absOf(0, 5)).toBe(absOf(2, 31));
    expect(placed[0]!.scale).toBeLessThan(1);
    expect(Math.hypot(placed[0]!.x - placed[1]!.x, placed[0]!.y - placed[1]!.y)).toBeGreaterThan(0.3);
  });
});

describe('teams', () => {
  it('gives up to four players a colour each, opposite when two', () => {
    expect(makeTeams([1, 2])).toEqual([[1], [2]]);
    expect(colorsFor(2)).toEqual([0, 2]);
    expect(colorsFor(4)).toEqual([0, 1, 2, 3]);
  });

  it('pairs five to eight players per colour', () => {
    expect(makeTeams([1, 2, 3, 4, 5])).toEqual([[1, 4], [2, 5], [3]]);
    expect(makeTeams([1, 2, 3, 4, 5, 6, 7, 8])).toEqual([
      [1, 5],
      [2, 6],
      [3, 7],
      [4, 8],
    ]);
  });

  it('alternates teammates on each turn of their colour', () => {
    // 6 players → 3 teams of 2. Every roll is a 1: nobody can leave the base, turns rotate.
    const g = make(6, []);
    const rollers: number[] = [];
    for (let k = 0; k < 6; k++) {
      rollers.push(g.L.roller);
      g.roll();
    }
    expect(rollers).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('keeps a bonus roll with the player who rolled the 6', () => {
    const g = make(6, [6, 2]);
    expect(g.L.roller).toBe(1);
    g.roll();
    expect(g.L.bonus).toBe(true);
    expect(g.L.roller).toBe(1);
  });

  it('hands the turn to a connected teammate', () => {
    const g = make(6, []);
    g.L.setRoster([{ id: 4, connected: false }], g.now());
    // Team 0 is [1, 4]; player 1 rolls first, then the colour comes back with 4 offline.
    for (let k = 0; k < 3; k++) g.roll();
    expect(g.L.current).toBe(0);
    expect(g.L.roller).toBe(1);
  });
});

describe('rules', () => {
  it('starts after the intro with the first colour', () => {
    const g = make(2, []);
    expect(g.all[0]).toEqual({ type: 'intro' });
    expect(g.now()).toBe(INTRO_MS);
    expect(g.L.phase).toBe('roll');
    expect(g.L.current).toBe(0);
  });

  it('needs a 6 to leave the base and then rolls again', () => {
    const g = make(2, [3, 1, 6, 2]);
    g.roll(); // 3: no move, passes
    expect(g.all.some((e) => e.type === 'pass' && e.reason === 'none')).toBe(true);
    expect(g.L.current).toBe(1);
    g.roll(); // player 2 rolls 1
    expect(g.L.current).toBe(0);
    g.roll(); // 6: only one distinct move (both pawns in base), so it moves by itself
    expect(g.L.teams[0]!.pawns).toEqual([0, BASE]);
    expect(g.L.current).toBe(0);
    expect(g.L.bonus).toBe(true);
    g.roll(); // 2: one pawn out, moves by itself
    expect(g.L.teams[0]!.pawns).toEqual([2, BASE]);
    expect(g.L.current).toBe(1);
  });

  it('asks which pawn when the moves differ', () => {
    const g = make(2, [6, 6]);
    g.roll();
    g.roll();
    expect(g.L.phase).toBe('pick');
    expect(g.L.options.map((o) => o.pawn)).toEqual([0, 1]);
    expect(g.L.options[1]!.exit).toBe(true);
    g.pick(2);
    expect(g.L.teams[0]!.pawns).toEqual([0, 0]);
  });

  it('forfeits the turn on the third 6 in a row', () => {
    const g = make(2, [6, 6, 6]);
    g.roll();
    g.roll();
    g.pick(1); // first pawn from 0 to 6
    expect(g.L.teams[0]!.pawns).toEqual([6, BASE]);
    g.roll(); // third 6: void
    expect(g.all.some((e) => e.type === 'pass' && e.reason === 'triple')).toBe(true);
    expect(g.L.teams[0]!.pawns).toEqual([6, BASE]);
    expect(g.L.current).toBe(1);
    expect(g.L.bonus).toBe(false);
  });

  it('captures an opponent and sends it back to its base', () => {
    const g = make(2, []);
    const red = g.L.teams[0]!;
    const yellow = g.L.teams[1]!;
    // Yellow pawn on loop square 31 = yellow progress 5. Red at progress 28 rolls 3 → square 31.
    yellow.pawns[0] = 5;
    red.pawns[0] = 28;
    expect(absOf(2, 5)).toBe(31);
    const opt = g.L.optionFor(red, 0, 3)!;
    expect(opt.captures).toEqual([{ team: 1, pawn: 0, from: 5 }]);
    const L2 = make(2, [3]);
    L2.L.teams[1]!.pawns[0] = 5;
    L2.L.teams[0]!.pawns[0] = 28;
    L2.roll();
    expect(L2.L.teams[1]!.pawns[0]).toBe(BASE);
    expect(L2.L.teams[1]!.lost).toBe(1);
    expect(L2.L.stats.get(1)!.captures).toBe(1);
    const move = L2.all.find((e) => e.type === 'move');
    expect(move && move.type === 'move' && move.move.captures.length).toBe(1);
  });

  it('never captures on safe squares', () => {
    const g = make(2, []);
    const red = g.L.teams[0]!;
    const yellow = g.L.teams[1]!;
    // Loop square 34 is a star; yellow progress 8 sits there.
    expect(SAFE_ABS.has(34)).toBe(true);
    yellow.pawns[0] = 8;
    red.pawns[0] = 30;
    const opt = g.L.optionFor(red, 0, 4)!;
    expect(opt.safe).toBe(true);
    expect(opt.captures).toEqual([]);
    // Yellow's start square (26) is safe too.
    yellow.pawns[0] = 0;
    red.pawns[0] = 20;
    expect(g.L.optionFor(red, 0, 6)!.captures).toEqual([]);
  });

  it('needs the exact roll to reach home', () => {
    const g = make(2, []);
    const red = g.L.teams[0]!;
    red.pawns[0] = HOME - 3;
    expect(g.L.optionFor(red, 0, 4)).toBeNull();
    expect(g.L.optionFor(red, 0, 3)!.home).toBe(true);
    expect(g.L.optionFor(red, 0, 2)!.to).toBe(HOME - 1);
  });

  it('passes when the roll is too big for every pawn', () => {
    const g = make(2, [5]);
    g.L.teams[0]!.pawns = [HOME - 2, HOME];
    g.roll();
    expect(g.all.some((e) => e.type === 'pass' && e.reason === 'none')).toBe(true);
    expect(g.L.current).toBe(1);
  });

  it('walks one hop per square and one hop out of the base', () => {
    const g = make(2, [6, 4]);
    g.roll();
    g.roll();
    const moves = g.all.flatMap((e) => (e.type === 'move' ? [e.move] : []));
    expect(moves[0]!.path).toEqual([0]);
    expect(moves[1]!.path).toEqual([1, 2, 3, 4]);
  });
});

describe('timeouts', () => {
  it('rolls by itself when the roller waits too long', () => {
    const g = make(2, [2]);
    g.advance(ROLL_MS);
    const roll = g.all.find((e) => e.type === 'roll');
    expect(roll && roll.type === 'roll' && roll.auto).toBe(true);
    g.settle();
    expect(g.L.current).toBe(1);
  });

  it('picks by itself, preferring a capture', () => {
    const g = make(2, [6, 3]);
    g.roll(); // red out
    g.L.teams[0]!.pawns[0] = 28;
    g.L.teams[1]!.pawns[0] = 5;
    g.roll(); // 3: pawn 1 at 28 can capture, base pawn cannot move
    // Only one legal move (base needs a 6), so it moved by itself.
    expect(g.L.teams[1]!.pawns[0]).toBe(BASE);
    const opts = [
      { pawn: 0, from: 10, to: 13, captures: [], exit: false, home: false, safe: false },
      {
        pawn: 1,
        from: 2,
        to: 5,
        captures: [{ team: 1, pawn: 0, from: 1 }],
        exit: false,
        home: false,
        safe: false,
      },
    ];
    expect(bestOption(opts).pawn).toBe(1);
  });

  it('moves after the pick deadline', () => {
    const g = make(2, [6, 6]);
    g.roll();
    g.roll();
    expect(g.L.phase).toBe('pick');
    g.advance(g.L.deadline - g.now());
    expect(g.all.some((e) => e.type === 'move' && e.move.auto)).toBe(true);
  });

  it('plays a disconnected colour quickly', () => {
    const g = make(2, [1, 1]);
    g.roll();
    expect(g.L.current).toBe(1);
    g.L.setRoster([{ id: 2, connected: false }], g.now());
    expect(g.L.deadline - g.now()).toBeLessThanOrEqual(AWAY_MS);
    g.advance(AWAY_MS);
    expect(g.L.phase).toBe('rolling');
    g.advance(DICE_MS);
    g.advance(PASS_MS);
    expect(g.L.current).toBe(0);
  });
});

describe('winning', () => {
  it('ends when a colour brings every pawn home and ranks the rest', () => {
    const g = make(3, [2]);
    const red = g.L.teams[0]!;
    red.pawns = [HOME, HOME - 2];
    g.L.teams[1]!.pawns = [HOME, 3];
    g.L.teams[2]!.pawns = [10, BASE];
    g.roll();
    expect(g.all.some((e) => e.type === 'finish' && e.team === 0)).toBe(true);
    expect(g.L.phase).toBe('ended');
    expect(g.all[g.all.length - 1]).toEqual({ type: 'end' });
    expect(g.L.winner).toBe(0);
    expect(g.L.stats.get(1)!.home).toBe(1);
    const s = standings(g.L);
    expect(s.map((r) => [r.team, r.rank])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
    ]);
  });

  it('plays a whole game to the end with random dice', () => {
    const roster = [1, 2, 3, 4].map((id) => ({ id, connected: true }));
    const L = new LudoLogic({ pawns: 4, roster, now: 0, seed: 42 });
    let t = 0;
    let ended = false;
    for (let k = 0; k < 20_000 && !ended; k++) {
      t = Math.max(t + 1, L.deadline);
      L.tick(t);
      for (const e of L.drain()) if (e.type === 'end') ended = true;
    }
    expect(ended).toBe(true);
    expect(L.winner).not.toBeNull();
    expect(L.homeCount(L.teams[L.winner!]!)).toBe(4);
  });

  it('ignores input from the wrong player or phase', () => {
    const g = make(2, [6]);
    expect(g.L.roll(2, g.now())).toBe(false);
    expect(g.L.pick(1, 1, g.now())).toBe(false);
    expect(g.L.roll(99, g.now())).toBe(false);
  });
});
