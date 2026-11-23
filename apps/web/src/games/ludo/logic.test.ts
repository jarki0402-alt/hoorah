import { describe, expect, it } from 'vitest';
import { choosePawn } from './brain';
import { geometryFor, layoutPawns, pawnPoint, polyFrame, TRACK } from './geometry';
import {
  AWAY_MS,
  absOf,
  BASE,
  bestOption,
  boardFor,
  colorsFor,
  DICE_MS,
  INTRO_MS,
  type LudoEvent,
  LudoLogic,
  PASS_MS,
  ROLL_MS,
  standings,
} from './logic';

const CLASSIC = boardFor(4);
const HOME = CLASSIC.home;
const classic = geometryFor(CLASSIC);

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
      const col = classic.homeColumn(c);
      const last = col[col.length - 1]!;
      // The last square touches the 3x3 centre (cells 6..8, centres 6.5..8.5).
      expect(Math.abs(last.x - 7.5) + Math.abs(last.y - 7.5)).toBe(2);
      const entry = pawnPoint(classic, c, 50, 0, 4);
      const first = pawnPoint(classic, c, 51, 0, 4);
      expect(Math.abs(entry.x - first.x) + Math.abs(entry.y - first.y)).toBe(1);
    }
  });

  it('keeps base slots inside the base and fans out shared squares', () => {
    const s = classic.baseSlot(2, 3, 4);
    expect(s.x).toBeGreaterThan(9);
    expect(s.y).toBeGreaterThan(9);
    const placed = layoutPawns(
      classic,
      [
        { seat: 0, color: 0, pawn: 0, progress: 5 },
        { seat: 1, color: 2, pawn: 0, progress: 31 },
      ],
      2,
    );
    expect(absOf(CLASSIC, 0, 5)).toBe(absOf(CLASSIC, 2, 31));
    expect(placed[0]!.scale).toBeLessThan(1);
    expect(Math.hypot(placed[0]!.x - placed[1]!.x, placed[0]!.y - placed[1]!.y)).toBeGreaterThan(0.3);
  });
});

describe('boards', () => {
  it('uses the classic cross up to 4 colours', () => {
    for (const n of [1, 2, 3, 4]) expect(boardFor(n)).toBe(CLASSIC);
    expect(CLASSIC.trackLen).toBe(52);
    expect(CLASSIC.home).toBe(56);
    expect([...CLASSIC.safe].sort((a, b) => a - b)).toEqual([0, 8, 13, 21, 26, 34, 39, 47]);
  });

  it('builds a polygon with one side per colour for 5 to 8', () => {
    const want: Record<number, [number, number]> = { 5: [11, 55], 6: [9, 54], 7: [7, 49], 8: [7, 56] };
    for (const n of [5, 6, 7, 8]) {
      const b = boardFor(n);
      const [perSide, lap] = want[n]!;
      expect(b.sides).toBe(n);
      expect(b.perSide).toBe(perSide);
      expect(b.trackLen).toBe(lap);
      expect(b.home).toBe(lap + 4);
      const mid = (perSide - 1) / 2;
      for (let c = 0; c < n; c++) {
        // Start two squares past the middle of its own side; the home column leaves the middle.
        expect(b.start[c]).toBe(c * perSide + mid + 2);
        expect((b.start[c]! + b.lastTrack) % lap).toBe(c * perSide + mid);
        expect(b.star[c]).toBe((b.start[c]! + Math.round((8 * perSide) / 13)) % lap);
      }
      // Starts and stars never touch: no two safe squares side by side.
      const safe = [...b.safe].sort((x, y) => x - y);
      expect(safe).toHaveLength(2 * n);
      for (let i = 0; i < safe.length; i++) {
        const gap = (safe[(i + 1) % safe.length]! - safe[i]! + lap) % lap || lap;
        expect(gap).toBeGreaterThan(1);
      }
    }
  });

  it('caps the board at 8 colours', () => {
    expect(boardFor(12).sides).toBe(8);
    expect(colorsFor(5)).toEqual([0, 1, 2, 3, 4]);
    expect(colorsFor(8)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('polygon geometry', () => {
  for (const n of [5, 6, 7, 8]) {
    it(`lays out a ${n}-sided board inside the classic frame`, () => {
      const b = boardFor(n);
      const g = geometryFor(b);
      const f = polyFrame(b);
      const pts: { x: number; y: number }[] = [];
      for (let abs = 0; abs < b.trackLen; abs++) pts.push(g.track(abs));
      // Neighbouring loop squares sit about one square apart, the loop closes and never repeats.
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!;
        const c = pts[(i + 1) % pts.length]!;
        const dist = Math.hypot(a.x - c.x, a.y - c.y);
        expect(dist).toBeGreaterThan(g.cell * 0.55);
        expect(dist).toBeLessThan(g.cell * 1.3);
      }
      for (const p of pts) {
        expect(p.x).toBeGreaterThan(-0.5);
        expect(p.x).toBeLessThan(15.5);
        expect(p.y).toBeGreaterThan(-0.5);
        expect(p.y).toBeLessThan(15.5);
      }
      for (let c = 0; c < n; c++) {
        const col = g.homeColumn(c as 0);
        // The home column starts next to its entry square and walks towards the centre.
        const entry = pawnPoint(g, c as 0, b.lastTrack, 0, 4);
        expect(Math.hypot(entry.x - col[0]!.x, entry.y - col[0]!.y)).toBeLessThan(g.cell * 1.2);
        const d0 = Math.hypot(col[0]!.x - f.cx, col[0]!.y - f.cy);
        const d4 = Math.hypot(col[4]!.x - f.cx, col[4]!.y - f.cy);
        expect(d4).toBeLessThan(d0);
        expect(d4).toBeGreaterThan(0);
        // Base slots sit in the base circle, clear of every square.
        const yard = f.yard(c);
        for (let k = 0; k < 4; k++) {
          const s = g.baseSlot(c as 0, k, 4);
          expect(Math.hypot(s.x - yard.x, s.y - yard.y)).toBeLessThan(yard.r);
          for (const p of pts) expect(Math.hypot(s.x - p.x, s.y - p.y)).toBeGreaterThan(g.cell * 0.6);
        }
        const home = g.homeSpot(c as 0, 0, 2);
        expect(Math.hypot(home.x - f.cx, home.y - f.cy)).toBeLessThan(f.hub * 1.25);
      }
    });
  }
});

describe('seats', () => {
  it('gives every player their own colour, opposite when two', () => {
    expect(colorsFor(2)).toEqual([0, 2]);
    expect(colorsFor(4)).toEqual([0, 1, 2, 3]);
    const g = make(6, []);
    expect(g.L.seats.map((t) => [t.player, t.color])).toEqual([
      [1, 0],
      [2, 1],
      [3, 2],
      [4, 3],
      [5, 4],
      [6, 5],
    ]);
    expect(g.L.board.sides).toBe(6);
  });

  it('turns go round every player once', () => {
    // Every roll is a 1: nobody can leave the base, turns rotate.
    const g = make(8, []);
    const rollers: number[] = [];
    for (let k = 0; k < 9; k++) {
      rollers.push(g.L.roller);
      g.roll();
    }
    expect(rollers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 1]);
  });

  it('keeps the bonus roll with the player who rolled the 6', () => {
    const g = make(6, [6, 2]);
    expect(g.L.roller).toBe(1);
    g.roll();
    expect(g.L.bonus).toBe(true);
    expect(g.L.roller).toBe(1);
  });

  it('plays a dropped colour by itself instead of handing it to someone', () => {
    const g = make(5, []);
    g.L.setRoster([{ id: 1, connected: false }], g.now());
    expect(g.L.roller).toBe(1);
    expect(g.L.deadline - g.now()).toBeLessThanOrEqual(AWAY_MS);
  });
});

describe('polygon rules', () => {
  it('captures across the end of the loop and never on a start or star', () => {
    const g = make(5, []);
    const b = g.L.board;
    const [red, green] = g.L.seats as [(typeof g.L.seats)[0], (typeof g.L.seats)[0]];
    // Green walks past the end of the loop index (54 → 0) onto a plain square Red stands on.
    const target = 1;
    expect(b.safe.has(target)).toBe(false);
    const greenAt = (target - b.start[1]! + b.trackLen) % b.trackLen;
    red.pawns[0] = (target - b.start[0]! + b.trackLen) % b.trackLen;
    green.pawns[0] = greenAt - 3;
    expect(absOf(b, 1, greenAt)).toBe(target);
    expect(g.L.optionFor(green, 0, 3)!.captures).toEqual([{ seat: 0, pawn: 0, from: red.pawns[0] }]);
    // Red's star is safe.
    red.pawns[0] = (b.star[0]! - b.start[0]! + b.trackLen) % b.trackLen;
    const toStar = (b.star[0]! - b.start[1]! + b.trackLen) % b.trackLen;
    green.pawns[0] = toStar - 2;
    const opt = g.L.optionFor(green, 0, 2)!;
    expect(opt.safe).toBe(true);
    expect(opt.captures).toEqual([]);
  });

  it('needs the exact roll to reach home on every board', () => {
    for (const n of [5, 6, 7, 8]) {
      const g = make(n, []);
      const t = g.L.seats[n - 1]!;
      t.pawns[0] = g.L.board.home - 3;
      expect(g.L.optionFor(t, 0, 4)).toBeNull();
      expect(g.L.optionFor(t, 0, 3)!.home).toBe(true);
    }
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
    expect(g.L.seats[0]!.pawns).toEqual([0, BASE]);
    expect(g.L.current).toBe(0);
    expect(g.L.bonus).toBe(true);
    g.roll(); // 2: one pawn out, moves by itself
    expect(g.L.seats[0]!.pawns).toEqual([2, BASE]);
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
    expect(g.L.seats[0]!.pawns).toEqual([0, 0]);
  });

  it('forfeits the turn on the third 6 in a row', () => {
    const g = make(2, [6, 6, 6]);
    g.roll();
    g.roll();
    g.pick(1); // first pawn from 0 to 6
    expect(g.L.seats[0]!.pawns).toEqual([6, BASE]);
    g.roll(); // third 6: void
    expect(g.all.some((e) => e.type === 'pass' && e.reason === 'triple')).toBe(true);
    expect(g.L.seats[0]!.pawns).toEqual([6, BASE]);
    expect(g.L.current).toBe(1);
    expect(g.L.bonus).toBe(false);
  });

  it('captures an opponent and sends it back to its base', () => {
    const g = make(2, []);
    const red = g.L.seats[0]!;
    const yellow = g.L.seats[1]!;
    // Yellow pawn on loop square 31 = yellow progress 5. Red at progress 28 rolls 3 → square 31.
    yellow.pawns[0] = 5;
    red.pawns[0] = 28;
    expect(absOf(CLASSIC, 2, 5)).toBe(31);
    const opt = g.L.optionFor(red, 0, 3)!;
    expect(opt.captures).toEqual([{ seat: 1, pawn: 0, from: 5 }]);
    const L2 = make(2, [3]);
    L2.L.seats[1]!.pawns[0] = 5;
    L2.L.seats[0]!.pawns[0] = 28;
    L2.roll();
    expect(L2.L.seats[1]!.pawns[0]).toBe(BASE);
    expect(L2.L.seats[1]!.lost).toBe(1);
    expect(L2.L.stats.get(1)!.captures).toBe(1);
    const move = L2.all.find((e) => e.type === 'move');
    expect(move && move.type === 'move' && move.move.captures.length).toBe(1);
  });

  it('never captures on safe squares', () => {
    const g = make(2, []);
    const red = g.L.seats[0]!;
    const yellow = g.L.seats[1]!;
    // Loop square 34 is a star; yellow progress 8 sits there.
    expect(CLASSIC.safe.has(34)).toBe(true);
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
    const red = g.L.seats[0]!;
    red.pawns[0] = HOME - 3;
    expect(g.L.optionFor(red, 0, 4)).toBeNull();
    expect(g.L.optionFor(red, 0, 3)!.home).toBe(true);
    expect(g.L.optionFor(red, 0, 2)!.to).toBe(HOME - 1);
  });

  it('passes when the roll is too big for every pawn', () => {
    const g = make(2, [5]);
    g.L.seats[0]!.pawns = [HOME - 2, HOME];
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
    g.L.seats[0]!.pawns[0] = 28;
    g.L.seats[1]!.pawns[0] = 5;
    g.roll(); // 3: pawn 1 at 28 can capture, base pawn cannot move
    // Only one legal move (base needs a 6), so it moved by itself.
    expect(g.L.seats[1]!.pawns[0]).toBe(BASE);
    const opts = [
      { pawn: 0, from: 10, to: 13, captures: [], exit: false, home: false, safe: false },
      {
        pawn: 1,
        from: 2,
        to: 5,
        captures: [{ seat: 1, pawn: 0, from: 1 }],
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
    const red = g.L.seats[0]!;
    red.pawns = [HOME, HOME - 2];
    g.L.seats[1]!.pawns = [HOME, 3];
    g.L.seats[2]!.pawns = [10, BASE];
    g.roll();
    expect(g.all.some((e) => e.type === 'finish' && e.seat === 0)).toBe(true);
    expect(g.L.phase).toBe('ended');
    expect(g.all[g.all.length - 1]).toEqual({ type: 'end' });
    expect(g.L.winner).toBe(0);
    expect(g.L.stats.get(1)!.home).toBe(1);
    const s = standings(g.L);
    expect(s.map((r) => [r.seat, r.rank])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
    ]);
  });

  for (const n of [2, 3, 4, 5, 6, 7, 8]) {
    it(`plays a whole ${n}-player game to the end with computer moves`, () => {
      const roster = Array.from({ length: n }, (_, i) => ({ id: i + 1, connected: true }));
      const L = new LudoLogic({ pawns: 4, roster, now: 0, seed: 40 + n });
      let t = 0;
      let ended = false;
      let captures = 0;
      for (let k = 0; k < 200_000 && !ended; k++) {
        if (L.phase === 'roll') L.roll(L.roller, t);
        else if (L.phase === 'pick')
          L.pick(L.roller, choosePawn(L.board, L.options, L.seat, L.seats, 1, () => 0) + 1, t);
        else {
          t = Math.max(t + 1, L.deadline);
          L.tick(t);
        }
        for (const e of L.drain()) {
          if (e.type === 'end') ended = true;
          if (e.type === 'move') {
            captures += e.move.captures.length;
            // Nobody is ever captured on a safe square.
            if (e.move.captures.length) expect(e.move.safe).toBe(false);
          }
        }
      }
      expect(ended).toBe(true);
      expect(L.winner).not.toBeNull();
      expect(L.homeCount(L.seats[L.winner!]!)).toBe(4);
      expect(L.seats).toHaveLength(n);
      expect(new Set(L.seats.map((x) => x.color)).size).toBe(n);
      if (n >= 3) expect(captures).toBeGreaterThan(0);
    });
  }

  it('ignores input from the wrong player or phase', () => {
    const g = make(2, [6]);
    expect(g.L.roll(2, g.now())).toBe(false);
    expect(g.L.pick(1, 1, g.now())).toBe(false);
    expect(g.L.roll(99, g.now())).toBe(false);
  });
});
