import { describe, expect, it } from 'vitest';
import { type BoardSize, cellCenter, crowdOffset, makeBoard, snakePoint, squareCell } from './board';
import {
  CARD_MS,
  CARDS,
  type CardId,
  DECK,
  DICE_MS,
  DUEL_BACK,
  DUEL_INTRO_MS,
  DUEL_MS,
  DUEL_RESULT_MS,
  FINALE_MS,
  GameClock,
  HOP_MS,
  INTRO_MS,
  jumpMs,
  LAND_MS,
  MAX_TAP_RATE,
  maxRoundsFor,
  ROLL_MS,
  SKIP_MS,
  type UlarEvent,
  UlarLogic,
} from './logic';

const T0 = 1_000_000;

/** A generator that yields the given dice faces first, then a fixed seeded stream. */
function dice(...faces: number[]): () => number {
  const queue = [...faces];
  let s = 7;
  return () => {
    const f = queue.shift();
    if (f !== undefined) return (f - 1) / 6 + 0.01;
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function game(players: number, size: BoardSize = 50, rng?: () => number) {
  const roster = Array.from({ length: players }, (_, i) => ({ id: i + 1, connected: true }));
  const L = new UlarLogic({ size, roster, now: T0, seed: 42, rng });
  const log: UlarEvent[] = [];
  let t = T0;
  const pump = () => log.push(...L.drain());
  pump();
  /** Advance game time in small ticks (like the driver does). */
  const run = (ms: number) => {
    const end = t + ms;
    while (t < end) {
      t = Math.min(end, t + 50);
      L.tick(t);
      pump();
    }
  };
  /** Run until the logic reaches a phase (or fail). */
  const until = (phase: UlarLogic['phase'], max = 120_000) => {
    const end = t + max;
    while (L.phase !== phase) {
      if (t >= end) throw new Error(`never reached ${phase}, stuck in ${L.phase}`);
      t += 50;
      L.tick(t);
      pump();
    }
  };
  const roll = (id = L.current!) => {
    const ok = L.roll(id, t);
    pump();
    return ok;
  };
  return { L, log, run, until, roll, now: () => t };
}

describe('board', () => {
  for (const size of [50, 100] as const) {
    it(`has a fair, well-formed ${size} layout`, () => {
      const b = makeBoard(size);
      expect(b.rows * b.cols).toBe(size);
      const ends = new Set<number>();
      for (const j of [...b.ladders, ...b.snakes]) {
        for (const n of [j.from, j.to]) {
          expect(n).toBeGreaterThan(1);
          expect(n).toBeLessThan(size);
          expect(ends.has(n), `square ${n} used twice`).toBe(false);
          ends.add(n);
        }
        const rowFrom = squareCell(j.from).row;
        const rowTo = squareCell(j.to).row;
        if (j.kind === 'ladder') expect(rowTo).toBeGreaterThan(rowFrom);
        else expect(rowTo).toBeLessThan(rowFrom);
      }
      for (const s of b.surprises) {
        expect(ends.has(s)).toBe(false);
        expect(s).toBeGreaterThan(1);
        expect(s).toBeLessThan(size);
      }
      expect(b.snakes.length).toBeGreaterThanOrEqual(b.ladders.length);
    });
  }

  it('numbers squares boustrophedon from the bottom left', () => {
    expect(squareCell(1)).toEqual({ col: 0, row: 0 });
    expect(squareCell(10)).toEqual({ col: 9, row: 0 });
    expect(squareCell(11)).toEqual({ col: 9, row: 1 });
    expect(squareCell(20)).toEqual({ col: 0, row: 1 });
    expect(squareCell(21)).toEqual({ col: 0, row: 2 });
    const b = makeBoard(50);
    expect(cellCenter(b, 1)).toEqual({ x: 0.5, y: 4.5 });
    expect(cellCenter(b, 50)).toEqual({ x: 9.5, y: 0.5 });
  });

  it('draws snakes that start on the head square and end on the tail square', () => {
    const b = makeBoard(100);
    for (const s of b.snakes) {
      const h = snakePoint(b, s, 0);
      const e = snakePoint(b, s, 1);
      const ch = cellCenter(b, s.from);
      const ce = cellCenter(b, s.to);
      expect(h.x).toBeCloseTo(ch.x);
      expect(h.y).toBeCloseTo(ch.y);
      expect(e.x).toBeCloseTo(ce.x);
      expect(e.y).toBeCloseTo(ce.y);
    }
  });

  it('spreads tokens that share a square', () => {
    for (let n = 1; n <= 6; n++) {
      const pts = Array.from({ length: n }, (_, i) => crowdOffset(i, n));
      const keys = new Set(pts.map((p) => `${p.x},${p.y}`));
      expect(keys.size).toBe(n);
      for (const p of pts) expect(Math.abs(p.x) <= 0.3 && Math.abs(p.y) <= 0.3).toBe(true);
    }
  });
});

describe('turns and moves', () => {
  it('opens with an intro, then the first player rolls', () => {
    const g = game(3);
    expect(g.L.phase).toBe('intro');
    expect(g.L.upcoming()).toBe(1);
    expect(g.log[0]).toEqual({ type: 'intro' });
    g.run(INTRO_MS);
    expect(g.L.phase).toBe('roll');
    expect(g.L.current).toBe(1);
    expect(g.L.round).toBe(1);
    expect(g.log.some((e) => e.type === 'turn' && e.playerId === 1)).toBe(true);
  });

  it('only lets the current player roll, once', () => {
    const g = game(2, 50, dice(4));
    g.run(INTRO_MS);
    expect(g.roll(2)).toBe(false);
    expect(g.roll(1)).toBe(true);
    expect(g.roll(1)).toBe(false);
    const plan = g.L.plan!;
    expect(plan.dice).toBe(4);
    expect(plan.path).toEqual([2, 3, 4, 5]);
    expect(plan.hopStart).toBe(plan.start + DICE_MS);
    expect(plan.end).toBe(plan.hopStart + 4 * HOP_MS + LAND_MS);
  });

  it('hands the dice to the next player after the move', () => {
    const g = game(2, 50, dice(1, 1));
    g.run(INTRO_MS);
    g.roll();
    g.run(DICE_MS + HOP_MS + LAND_MS);
    expect(g.L.phase).toBe('roll');
    expect(g.L.current).toBe(2);
    expect(g.L.player(1)!.pos).toBe(2);
  });

  it('rolls by itself when the phone stays quiet', () => {
    const g = game(2, 50, dice(3));
    g.run(INTRO_MS);
    g.run(ROLL_MS - 100);
    expect(g.L.phase).toBe('roll');
    g.run(200);
    const mv = g.log.find((e) => e.type === 'move');
    expect(mv && mv.type === 'move' && mv.auto).toBe(true);
    expect(g.L.player(1)!.pos).toBe(4);
  });

  it('climbs ladders and slides down snakes', () => {
    const g = game(2, 50, dice(2, 3));
    g.run(INTRO_MS);
    g.L.player(1)!.pos = 1; // 1 + 2 = 3: ladder to 23
    g.roll();
    expect(g.L.plan!.jump).toMatchObject({ kind: 'ladder', from: 3, to: 23 });
    expect(g.L.player(1)!.pos).toBe(23);
    expect(g.L.plan!.end).toBe(g.L.plan!.jumpStart + jumpMs(g.L.board, g.L.plan!.jump!) + LAND_MS);
    g.until('roll');
    g.L.player(2)!.pos = 24; // 24 + 3 = 27: snake to 7
    g.roll();
    expect(g.L.plan!.jump).toMatchObject({ kind: 'snake', from: 27, to: 7 });
    expect(g.L.player(2)!.pos).toBe(7);
    expect(g.L.player(1)!.stats).toMatchObject({ ladders: 1, climbed: 20 });
    expect(g.L.player(2)!.stats).toMatchObject({ snakes: 1, fell: 20 });
  });

  it('bounces back from the last square when the roll overshoots', () => {
    const g = game(2, 50, dice(6));
    g.run(INTRO_MS);
    g.L.player(1)!.pos = 45;
    g.roll();
    const plan = g.L.plan!;
    expect(plan.path).toEqual([46, 47, 48, 49, 50, 49]);
    expect(plan.bounced).toBe(true);
    expect(plan.landed).toBe(49);
    expect(g.L.player(1)!.pos).toBe(30); // 49 is a snake head
  });

  it('bounces onto an empty square', () => {
    const g = game(2, 50, dice(5));
    g.run(INTRO_MS);
    g.L.player(1)!.pos = 47;
    g.roll();
    expect(g.L.plan!.path).toEqual([48, 49, 50, 49, 48]);
    expect(g.L.plan!.jump).toBeNull();
    expect(g.L.player(1)!.pos).toBe(48);
  });

  it('wins on an exact landing and ends after the finale', () => {
    const g = game(3, 50, dice(3));
    g.run(INTRO_MS);
    g.L.player(1)!.pos = 47;
    g.L.player(2)!.pos = 30;
    g.L.player(3)!.pos = 30;
    g.roll();
    g.until('finale');
    expect(g.log.find((e) => e.type === 'finale')).toEqual({ type: 'finale', winner: 1, reason: 'finish' });
    const s = g.L.standings();
    expect(s[0]).toMatchObject({ id: 1, rank: 1, pos: 50, finished: true });
    expect(s[1]!.rank).toBe(2);
    expect(s[2]!.rank).toBe(2);
    g.run(FINALE_MS);
    expect(g.L.phase).toBe('ended');
    expect(g.log.at(-1)).toEqual({ type: 'end' });
  });

  it('is deterministic for a seed', () => {
    const play = () => {
      const roster = [1, 2, 3].map((id) => ({ id, connected: true }));
      const L = new UlarLogic({ size: 100, roster, now: 0, seed: 99 });
      let t = 0;
      while (L.phase !== 'ended' && t < 3_600_000) {
        t += 100;
        L.tick(t);
      }
      return { t, pos: [...L.players.values()].map((p) => p.pos), winner: L.winner };
    };
    expect(play()).toEqual(play());
  });
});

describe('kotak kejutan', () => {
  /** Player 1 lands on surprise square 6 with a 5 and draws `card`. */
  function drawn(card: CardId, ...more: number[]) {
    const g = game(2, 50, dice(5, ...more));
    g.L.stackDeck([card]);
    g.run(INTRO_MS);
    g.roll();
    g.until('card');
    expect(g.L.card).toEqual({ playerId: 1, id: card });
    expect(g.log.some((e) => e.type === 'card' && e.card === card)).toBe(true);
    return g;
  }

  it('has a balanced deck', () => {
    let net = 0;
    for (const id of DECK) {
      const fx = CARDS[id];
      if (fx.kind === 'move') net += fx.steps;
    }
    expect(net).toBeGreaterThanOrEqual(0);
    expect(net).toBeLessThanOrEqual(4);
    expect(DECK).toHaveLength(9);
  });

  it('moves forward with "naik ojek"', () => {
    const g = drawn('ojek');
    g.run(CARD_MS);
    expect(g.L.plan).toMatchObject({ kind: 'card', from: 6, path: [7, 8, 9], to: 29 }); // 9: ladder
    g.until('roll');
    expect(g.L.current).toBe(2);
  });

  it('moves back with "kena macet" and lands on what is there', () => {
    const g = game(2, 50, dice(1));
    g.L.stackDeck(['macet']);
    g.run(INTRO_MS);
    g.L.player(1)!.pos = 42; // 43 is a surprise; back 2 = 41
    g.roll();
    g.until('card');
    g.run(CARD_MS);
    expect(g.L.plan).toMatchObject({ kind: 'card', path: [42, 41], to: 41 });
  });

  it('gives an extra roll with "lomba kerupuk"', () => {
    const g = drawn('kerupuk');
    g.run(CARD_MS);
    expect(g.L.phase).toBe('roll');
    expect(g.L.current).toBe(1);
    expect(g.log.filter((e) => e.type === 'turn').at(-1)).toEqual({ type: 'turn', playerId: 1, extra: true });
  });

  it('skips the next turn with "ketiduran"', () => {
    const g = drawn('tidur', 1);
    g.run(CARD_MS);
    expect(g.L.current).toBe(2);
    g.roll();
    g.until('skip');
    expect(g.L.current).toBe(1);
    expect(g.log.some((e) => e.type === 'skip' && e.playerId === 1)).toBe(true);
    g.run(SKIP_MS);
    expect(g.L.phase).toBe('roll');
    expect(g.L.current).toBe(2);
    expect(g.L.player(1)!.skip).toBe(false);
  });

  it('blocks the next snake with "sepatu bot"', () => {
    const g = drawn('bot', 1, 3);
    g.run(CARD_MS);
    expect(g.L.player(1)!.shield).toBe(true);
    g.roll(); // player 2: 1 -> 2
    g.until('roll');
    g.L.player(1)!.pos = 24; // +3 = 27, the snake head
    g.roll();
    expect(g.L.plan!.blocked).toMatchObject({ kind: 'snake', from: 27 });
    expect(g.L.plan!.jump).toBeNull();
    expect(g.L.player(1)!.pos).toBe(27);
    expect(g.L.player(1)!.shield).toBe(false);
    expect(g.L.player(1)!.stats.blocked).toBe(1);
  });

  it('draws only on dice landings, never from a card move', () => {
    const g = game(2, 50, dice(1));
    g.L.stackDeck(['ojek', 'layangan']); // layangan is drawn first: 13 + 2 = 15
    g.run(INTRO_MS);
    g.L.player(1)!.pos = 12;
    g.roll(); // 13 is a surprise square
    g.until('card');
    g.run(CARD_MS);
    g.until('roll');
    expect(g.L.player(1)!.pos).toBe(15);
    expect(g.log.filter((e) => e.type === 'card')).toHaveLength(1);
  });
});

describe('duel kilat', () => {
  /** Player 1 lands on player 2's square (10) and a duel starts. */
  function duel() {
    const g = game(3, 50, dice(2));
    g.run(INTRO_MS);
    g.L.player(1)!.pos = 8;
    g.L.player(2)!.pos = 10;
    g.roll();
    g.until('duelIntro');
    expect(g.L.duel).toMatchObject({ a: 1, b: 2, square: 10 });
    return g;
  }

  it('starts when landing on another player, after a countdown', () => {
    const g = duel();
    g.run(DUEL_INTRO_MS);
    expect(g.L.phase).toBe('duel');
    expect(g.log.some((e) => e.type === 'duelStart')).toBe(true);
  });

  it('counts taps only from the duelists during the window', () => {
    const g = duel();
    expect(g.L.tap(1, 5, g.now())).toBe(0); // too early (baseline only)
    g.run(DUEL_INTRO_MS + 1000);
    expect(g.L.tap(1, 6, g.now())).toBe(1);
    expect(g.L.tap(1, 8, g.now())).toBe(2);
    expect(g.L.tap(3, 50, g.now())).toBe(0); // spectator
    expect(g.L.tap(2, 1, g.now())).toBe(1); // first frame ever counts one
    expect(g.L.tap(2, 1, g.now())).toBe(0); // same counter
    expect(g.L.tap(2, 200, g.now())).toBe(0); // absurd jump resyncs
    expect(g.L.duel).toMatchObject({ tapsA: 3, tapsB: 1 });
  });

  it('caps taps at a human rate', () => {
    const g = duel();
    g.run(DUEL_INTRO_MS + 1000);
    for (let i = 1; i <= 20; i++) g.L.tap(1, i * 5, g.now());
    expect(g.L.duel!.tapsA).toBeLessThanOrEqual(MAX_TAP_RATE + 3);
  });

  it('sends the loser back a few squares', () => {
    const g = duel();
    g.run(DUEL_INTRO_MS + 500);
    for (let i = 1; i <= 6; i++) g.L.tap(2, i, g.now());
    g.L.tap(1, 1, g.now());
    g.run(DUEL_MS);
    expect(g.L.phase).toBe('duelResult');
    expect(g.L.duel!.winner).toBe(2);
    g.run(DUEL_RESULT_MS);
    expect(g.L.plan).toMatchObject({ kind: 'duel', playerId: 1, from: 10, path: [9, 8, 7] });
    expect(g.L.player(1)!.pos).toBe(10 - DUEL_BACK);
    expect(g.L.player(2)!.stats.duelsWon).toBe(1);
    expect(g.L.player(1)!.stats.duelsLost).toBe(1);
    g.until('roll');
    expect(g.L.current).toBe(2);
  });

  it('keeps everyone in place on a tie', () => {
    const g = duel();
    g.run(DUEL_INTRO_MS + DUEL_MS + DUEL_RESULT_MS);
    expect(g.log.find((e) => e.type === 'duelEnd')).toMatchObject({ duel: { winner: null } });
    expect(g.L.phase).toBe('roll');
    expect(g.L.player(1)!.pos).toBe(10);
    expect(g.L.player(2)!.pos).toBe(10);
  });

  it('never duels on the start square or with offline players', () => {
    const g = game(2, 50, dice(2));
    g.run(INTRO_MS);
    g.L.player(1)!.pos = 8;
    g.L.player(2)!.pos = 10;
    g.L.setRoster(
      [
        { id: 1, connected: true },
        { id: 2, connected: false },
      ],
      g.now(),
    );
    g.roll();
    g.run(5000);
    expect(g.log.some((e) => e.type === 'duelIntro')).toBe(false);
  });
});

describe('length and roster', () => {
  it('scales the round cap with the number of players', () => {
    expect(maxRoundsFor(50, 2)).toBe(30);
    expect(maxRoundsFor(50, 6)).toBe(11);
    expect(maxRoundsFor(100, 2)).toBe(40);
    expect(maxRoundsFor(100, 6)).toBe(18);
  });

  it('ends at the round cap with the leader as winner', () => {
    const g = game(2, 50, () => 0.5); // always a 4
    const cap = g.L.maxRounds;
    // Keep everyone near the start so nobody can finish: 8 + 4 = 12, an empty square.
    for (let t = 0; g.L.phase !== 'finale' && t < 3_600_000; t += 50) {
      if (g.L.phase === 'roll') {
        g.L.player(1)!.pos = 8;
        g.L.player(2)!.pos = g.L.current === 1 ? 10 : 8;
      }
      g.run(50);
    }
    expect(g.L.phase).toBe('finale');
    expect(g.L.round).toBe(cap);
    expect(g.log.some((e) => e.type === 'round' && e.last && e.round === cap)).toBe(true);
    expect(g.log.filter((e) => e.type === 'turn')).toHaveLength(cap * 2);
    expect(g.L.endReason).toBe('cap');
    expect(g.L.winner).toBe(g.L.leader());
    expect(g.log.find((e) => e.type === 'finale')).toMatchObject({ reason: 'cap' });
  });

  it('passes over offline players and waits when nobody is left', () => {
    const g = game(3);
    g.run(INTRO_MS);
    expect(g.L.current).toBe(1);
    g.L.setRoster(
      [
        { id: 1, connected: false },
        { id: 2, connected: false },
        { id: 3, connected: true },
      ],
      g.now(),
    );
    expect(g.L.current).toBe(3);
    g.L.setRoster(
      [
        { id: 1, connected: false },
        { id: 2, connected: false },
        { id: 3, connected: false },
      ],
      g.now(),
    );
    g.run(ROLL_MS + 5000);
    expect(g.L.phase).toBe('waiting');
    g.L.setRoster([{ id: 2, connected: true }], g.now());
    expect(g.L.phase).toBe('roll');
    expect(g.L.current).toBe(2);
  });

  it('lets late joiners in at the start square', () => {
    const g = game(2);
    g.run(INTRO_MS);
    g.L.setRoster([{ id: 9, connected: true }], g.now());
    expect(g.L.order).toEqual([1, 2, 9]);
    expect(g.L.player(9)!.pos).toBe(1);
  });

  it('usually finishes a Kilat game before the cap', () => {
    let capped = 0;
    let turns = 0;
    const games = 200;
    for (let k = 0; k < games; k++) {
      const roster = [1, 2, 3, 4].map((id) => ({ id, connected: true }));
      const L = new UlarLogic({ size: 50, roster, now: 0, seed: k + 1 });
      let t = 0;
      while (L.phase !== 'finale' && t < 7_200_000) {
        t += 200;
        L.tick(t);
        for (const e of L.drain()) if (e.type === 'turn') turns++;
      }
      if (L.endReason === 'cap') capped++;
    }
    expect(capped / games).toBeLessThan(0.35);
    // Around 6 minutes at ~5 s a turn.
    expect(turns / games).toBeGreaterThan(25);
    expect(turns / games).toBeLessThan(70);
  });
});

describe('clock', () => {
  it('freezes while paused', () => {
    let server = 1000;
    const c = new GameClock(() => server);
    expect(c.now()).toBe(1000);
    c.pause();
    server = 5000;
    expect(c.now()).toBe(1000);
    c.resume();
    expect(c.now()).toBe(1000);
    server = 5500;
    expect(c.now()).toBe(1500);
    expect(c.toServer(1500)).toBe(5500);
    expect(c.toGame(5500)).toBe(1500);
  });
});
