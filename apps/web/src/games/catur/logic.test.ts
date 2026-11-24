import { lookAt } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import {
  type CaturEvent,
  CaturMatch,
  INTRO_MS,
  incrementFor,
  OVER_MS,
  rankings,
  VOTE_MS,
  VOTE_SETTLE_MS,
} from './logic';
import { boardView } from './views';

const T0 = 1_000_000;

function duel(opts: { fen?: string; minutes?: number; seed?: number } = {}) {
  const m = new CaturMatch({
    seed: opts.seed ?? 7,
    now: T0,
    minutes: opts.minutes ?? 3,
    players: [
      { id: 1, connected: true },
      { id: 2, connected: true },
    ],
    ...(opts.fen ? { fen: opts.fen } : {}),
  });
  m.tick(T0 + INTRO_MS);
  const white = m.sides.w[0]!;
  const black = m.sides.b[0]!;
  return { m, white, black, t: T0 + INTRO_MS };
}

function team(n: number, seed = 3) {
  const m = new CaturMatch({
    seed,
    now: T0,
    minutes: 3,
    players: Array.from({ length: n }, (_, i) => ({ id: i + 1, connected: true })),
  });
  m.tick(T0 + INTRO_MS);
  return { m, t: T0 + INTRO_MS };
}

const types = (ev: CaturEvent[]) => ev.map((e) => e.type);

describe('setup', () => {
  it('two players: one per colour, random but seeded', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed < 20; seed++) {
      const { m } = duel({ seed });
      expect(m.mode).toBe('duel');
      expect([...m.sides.w, ...m.sides.b].sort()).toEqual([1, 2]);
      seen.add(m.sides.w[0]!);
    }
    expect(seen).toEqual(new Set([1, 2]));
    expect(duel({ seed: 5 }).m.sides).toEqual(duel({ seed: 5 }).m.sides);
  });

  it('three to eight players: two balanced teams', () => {
    for (let n = 3; n <= 8; n++) {
      const { m } = team(n);
      expect(m.mode).toBe('team');
      expect(Math.abs(m.sides.w.length - m.sides.b.length)).toBeLessThanOrEqual(1);
      expect(m.sides.w.length + m.sides.b.length).toBe(n);
    }
  });

  it('waits for the intro, then starts white clock', () => {
    const m = new CaturMatch({
      seed: 1,
      now: T0,
      minutes: 3,
      players: [
        { id: 1, connected: true },
        { id: 2, connected: true },
      ],
    });
    expect(m.tick(T0 + 1000)).toEqual([]);
    expect(m.phase).toBe('intro');
    expect(m.canAct(m.sides.w[0]!)).toBe(false);
    expect(types(m.tick(T0 + INTRO_MS))).toEqual(['start']);
    expect(m.timeLeft('w', T0 + INTRO_MS + 1000)).toBe(180_000 - 1000);
    expect(m.timeLeft('b', T0 + INTRO_MS + 1000)).toBe(180_000);
  });

  it('uses 2 s increment in Kilat and 5 s in Normal', () => {
    expect(incrementFor(3)).toBe(2000);
    expect(incrementFor(10)).toBe(5000);
  });
});

describe('duel', () => {
  it("plays fool's mate to checkmate and ends after the result screen", () => {
    const { m, white, black, t } = duel();
    expect(types(m.submit(white, 'f2f3', t + 1000))).toEqual(['move']);
    // Out of turn and illegal input are ignored.
    expect(m.submit(white, 'e2e4', t + 1100)).toEqual([]);
    expect(m.submit(black, 'e7e4', t + 1200)).toEqual([]);
    expect(m.submit(black, 'nonsense', t + 1200)).toEqual([]);
    m.submit(black, 'e7e5', t + 2000);
    m.submit(white, 'g2g4', t + 3000);
    const ev = m.submit(black, 'd8h4', t + 4000);
    expect(types(ev)).toEqual(['move', 'over']);
    expect(m.outcome).toEqual({ winner: 'b', reason: 'checkmate' });
    expect(m.lastMove()?.san).toBe('Qh4#');
    expect(m.checkSquare()).toBe('e1');
    expect(m.phase).toBe('over');
    expect(m.submit(white, 'e2e4', t + 5000)).toEqual([]);
    expect(types(m.tick(t + 4000 + OVER_MS))).toEqual(['ended']);
    const rows = rankings(m, (c, won) => `${c}:${won}`);
    expect(rows).toEqual([
      { playerId: black, score: 2, rank: 1, label: 'b:true' },
      { playerId: white, score: 0, rank: 2, label: 'w:false' },
    ]);
  });

  it('runs the clocks with increment and loses on time', () => {
    const { m, white, black, t } = duel();
    m.submit(white, 'e2e4', t + 10_000);
    expect(m.clock.w).toBe(180_000 - 10_000 + 2000);
    expect(m.timeLeft('b', t + 15_000)).toBe(180_000 - 5000);
    expect(m.timeLeft('w', t + 15_000)).toBe(172_000);
    // Black never moves.
    const low = m.tick(t + 10_000 + 170_500);
    expect(low).toEqual([{ type: 'low', color: 'b', seconds: 10 }]);
    expect(m.tick(t + 10_000 + 170_700)).toEqual([]);
    const ev = m.tick(t + 10_000 + 180_000);
    expect(types(ev)).toEqual(['over']);
    expect(m.outcome).toEqual({ winner: 'w', reason: 'timeout' });
    expect(m.timeLeft('b', t + 400_000)).toBe(0);
    // A move that arrives after the flag fell does not count.
    expect(m.submit(black, 'e7e5', t + 400_000)).toEqual([]);
  });

  it('draws on time when the opponent cannot mate', () => {
    const { m: m2 } = duel({ fen: '8/8/8/4k3/3pp3/8/8/4KN2 w - - 0 1' });
    m2.tick(T0 + INTRO_MS + 180_001);
    // White (the side to move) flags; black has pawns and can mate: black wins.
    expect(m2.outcome).toEqual({ winner: 'b', reason: 'timeout' });
    const { m: m3 } = duel({ fen: '8/8/8/4k3/3pp3/8/8/4KN2 b - - 0 1' });
    m3.tick(T0 + INTRO_MS + 180_001);
    // Black flags; white's lone knight could still mate (black has pawns to block): white wins.
    expect(m3.outcome).toEqual({ winner: 'w', reason: 'timeout' });
    const { m: m4 } = duel({ fen: '8/8/8/4k3/8/8/8/4K1R1 w - - 0 1' });
    m4.tick(T0 + INTRO_MS + 180_001);
    // White flags; black has a bare king and cannot mate: draw.
    expect(m4.outcome).toEqual({ winner: null, reason: 'timeout-draw' });
  });

  it('freezes clocks while paused', () => {
    const { m, white, t } = duel();
    m.setHeld(true, t + 5000);
    expect(m.timeLeft('w', t + 60_000)).toBe(175_000);
    expect(m.canAct(white)).toBe(false);
    expect(m.submit(white, 'e2e4', t + 60_000)).toEqual([]);
    expect(m.tick(t + 500_000)).toEqual([]);
    m.setHeld(false, t + 60_000);
    expect(m.timeLeft('w', t + 61_000)).toBe(174_000);
    expect(types(m.submit(white, 'e2e4', t + 61_000))).toEqual(['move']);
  });

  it('pauses the intro too', () => {
    const m = new CaturMatch({
      seed: 1,
      now: T0,
      minutes: 3,
      players: [
        { id: 1, connected: true },
        { id: 2, connected: true },
      ],
    });
    m.setHeld(true, T0 + 1000);
    m.setHeld(false, T0 + 50_000);
    expect(m.tick(T0 + INTRO_MS + 1000)).toEqual([]);
    expect(types(m.tick(T0 + 49_000 + INTRO_MS))).toEqual(['start']);
  });

  it('resigns', () => {
    const { m, white, t } = duel();
    expect(types(m.resign(white, t + 1000))).toEqual(['over']);
    expect(m.outcome).toEqual({ winner: 'b', reason: 'resign' });
  });

  it('draws by stalemate', () => {
    const { m, white } = duel({ fen: '7k/8/5Q2/6K1/8/8/8/8 w - - 0 1' });
    m.submit(white, 'f6f7', T0 + INTRO_MS + 100);
    expect(m.outcome).toEqual({ winner: null, reason: 'stalemate' });
  });

  it('draws by insufficient material after a capture', () => {
    const { m, white } = duel({ fen: '8/8/8/4k3/8/8/4n3/4K3 w - - 0 1' });
    m.submit(white, 'e1e2', T0 + INTRO_MS + 100);
    expect(m.outcome).toEqual({ winner: null, reason: 'insufficient' });
  });

  it('draws by threefold repetition', () => {
    const { m, white, black, t } = duel();
    const shuffleKnights = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
    let at = t;
    for (const mv of [...shuffleKnights, ...shuffleKnights]) {
      expect(m.outcome).toBeNull();
      at += 500;
      m.submit(m.turn === 'w' ? white : black, mv, at);
    }
    expect(m.outcome).toEqual({ winner: null, reason: 'repetition' });
  });

  it('draws by the 50-move rule', () => {
    const { m, white } = duel({ fen: '8/8/8/4k3/8/8/4R3/4K3 w - - 99 80' });
    m.submit(white, 'e2d2', T0 + INTRO_MS + 100);
    expect(m.outcome).toEqual({ winner: null, reason: 'fifty' });
  });

  it('promotes on request', () => {
    const { m, white } = duel({ fen: '7k/P7/8/8/8/8/8/K7 w - - 0 1' });
    m.submit(white, 'a7a8n', T0 + INTRO_MS + 100);
    expect(m.lastMove()).toMatchObject({ san: 'a8=N', promo: 'n' });
    expect(m.pos.board[0]).toBe('N');
  });

  it('lets late joiners watch', () => {
    const { m, t } = duel();
    m.syncPlayers(
      [
        { id: 1, connected: true },
        { id: 2, connected: true },
        { id: 3, connected: true },
      ],
      t,
    );
    expect(m.spectators).toEqual([3]);
    expect(m.canAct(3)).toBe(false);
  });

  it('tracks captures and material', () => {
    const { m, white, black, t } = duel();
    for (const [i, mv] of ['e2e4', 'd7d5', 'e4d5', 'd8d5'].entries()) {
      m.submit(i % 2 ? black : white, mv, t + i * 100);
    }
    expect(m.captures()).toEqual({ w: ['p'], b: ['P'] });
    expect(m.material()).toBe(0);
    expect(m.stats.get(white)?.captured).toBe(1);
  });
});

describe('team vote (Catur Rame)', () => {
  it('plays the most-voted move once everyone voted', () => {
    const { m, t } = team(6);
    const [a, b, c] = m.sides.w;
    expect(m.canAct(m.sides.b[0]!)).toBe(false);
    expect(types(m.submit(a!, 'e2e4', t + 1000))).toEqual(['vote']);
    m.submit(b!, 'd2d4', t + 1500);
    // Changing your vote counts once.
    m.submit(b!, 'e2e4', t + 1800);
    expect(m.tally()).toEqual([{ move: 'e2e4', count: 2, voters: [a, b], first: 1 }]);
    m.submit(c!, 'g1f3', t + 2000);
    // Everyone voted: settles shortly, not at the full deadline.
    expect(m.voteUntil).toBe(t + 2000 + VOTE_SETTLE_MS);
    expect(m.tick(t + 2000 + VOTE_SETTLE_MS - 1)).toEqual([]);
    const ev = m.tick(t + 2000 + VOTE_SETTLE_MS);
    expect(ev[0]).toMatchObject({ type: 'move', random: false, move: { uci: 'e2e4', by: [a, b] } });
    expect(m.turn).toBe('b');
    expect(m.tally()).toEqual([]);
    expect(m.stats.get(a!)?.moves).toBe(1);
    expect(m.stats.get(c!)?.moves).toBe(0);
  });

  it('breaks ties by the earliest proposal', () => {
    const { m, t } = team(4);
    const [a, b] = m.sides.w;
    m.submit(a!, 'g1f3', t + 100);
    m.submit(b!, 'e2e4', t + 200);
    const ev = m.tick(t + 300 + VOTE_SETTLE_MS);
    expect(ev[0]).toMatchObject({ type: 'move', move: { uci: 'g1f3' } });
  });

  it('plays a random legal move if nobody votes', () => {
    const { m, t } = team(3);
    expect(m.tick(t + VOTE_MS - 1)).toEqual([]);
    const ev = m.tick(t + VOTE_MS);
    expect(ev[0]).toMatchObject({ type: 'move', random: true, move: { by: [] } });
    expect(m.turn).toBe('b');
    expect(m.voteUntil).toBe(t + VOTE_MS + VOTE_MS);
  });

  it('plays the leading proposal when the vote times out', () => {
    const { m, t } = team(5);
    m.submit(m.sides.w[0]!, 'b1c3', t + 100);
    const ev = m.tick(t + VOTE_MS);
    expect(ev[0]).toMatchObject({ type: 'move', random: false, move: { uci: 'b1c3' } });
  });

  it('settles when the last missing voter disconnects', () => {
    const { m, t } = team(4);
    const [a, b] = m.sides.w;
    m.submit(a!, 'e2e4', t + 100);
    m.syncPlayers(
      [1, 2, 3, 4].map((id) => ({ id, connected: id !== b })),
      t + 500,
    );
    expect(m.voteUntil).toBe(t + 500 + VOTE_SETTLE_MS);
  });

  it('adds late joiners to the smaller team', () => {
    const { m, t } = team(3);
    const small = m.sides.w.length < m.sides.b.length ? 'w' : 'b';
    m.syncPlayers(
      [1, 2, 3, 4].map((id) => ({ id, connected: true })),
      t,
    );
    expect(m.sides[small]).toContain(4);
  });

  it('freezes the vote while paused', () => {
    const { m, t } = team(3);
    m.setHeld(true, t + 5000);
    m.setHeld(false, t + 100_000);
    expect(m.tick(t + 100_000 + VOTE_MS - 5001)).toEqual([]);
    expect(types(m.tick(t + 100_000 + VOTE_MS - 5000))).toContain('move');
  });

  it('cannot resign as a team', () => {
    const { m, t } = team(4);
    expect(m.resign(m.sides.w[0]!, t)).toEqual([]);
  });

  it('a draw ranks everyone first', () => {
    const d = duel({ fen: '7k/8/5Q2/6K1/8/8/8/8 w - - 0 1' });
    d.m.submit(d.white, 'f6f7', T0 + INTRO_MS + 1);
    expect(rankings(d.m, () => '').map((r) => r.rank)).toEqual([1, 1]);
  });
});

describe('computer seats', () => {
  it('a solo duel uses fixed seats for the human and the computer', () => {
    for (const seats of [
      { w: 1, b: -1 },
      { w: -1, b: 1 },
    ]) {
      const m = new CaturMatch({
        seed: 9,
        now: T0,
        minutes: 3,
        players: [
          { id: 1, connected: true },
          { id: -1, connected: true },
        ],
        seats,
      });
      expect(m.mode).toBe('duel');
      expect(m.sides).toEqual({ w: [seats.w], b: [seats.b] });
    }
  });

  it('autoMove plays for the side to move at once, also in team mode', () => {
    const d = duel();
    const ev = d.m.autoMove('e2e4', [d.white], d.t + 1500);
    expect(types(ev)).toEqual(['move']);
    expect(d.m.turn).toBe('b');
    expect(d.m.stats.get(d.white)!.moves).toBe(1);
    // Illegal or out-of-phase input is ignored.
    expect(d.m.autoMove('e2e4', [d.black], d.t + 1600)).toEqual([]);

    const t = team(4);
    const ev2 = t.m.autoMove('d2d4', [], t.t + 2000);
    expect(types(ev2)).toEqual(['move']);
    expect(t.m.history[0]!.by).toEqual([]);
    expect(t.m.turn).toBe('b');
  });

  it('autoMove spends the mover clock and still loses on time if it ran out', () => {
    const d = duel({ minutes: 1 });
    d.m.autoMove('e2e4', [d.white], d.t + 2000);
    expect(d.m.clock.w).toBe(60_000 - 2000 + incrementFor(1));
    const late = d.m.autoMove('e7e5', [d.black], d.t + 2000 + 61_000);
    expect(types(late)).toEqual(['over']);
    expect(d.m.outcome).toEqual({ winner: 'w', reason: 'timeout' });
  });

  it('the board view tells phones how a computer opponent looks', () => {
    const d = duel();
    const look = lookAt(3);
    const view = boardView(d.m, 1, (id) => `P${id}`, [
      { id: 2, name: 'Komputer', fruit: 'mangga', look, color: '#2F8CFF' },
    ]);
    expect('guests' in view && view.guests).toEqual([
      { id: 2, name: 'Komputer', fruit: 'mangga', look, color: '#2F8CFF' },
    ]);
  });

  it('counts repeated positions', () => {
    const d = duel();
    const start = d.m.pos;
    expect(d.m.timesSeen(start)).toBe(1);
    ['g1f3', 'g8f6', 'f3g1', 'f6g8'].forEach((mv, i) => {
      d.m.autoMove(mv, [], d.t + 100 * (i + 1));
    });
    expect(d.m.timesSeen(d.m.pos)).toBe(2);
  });
});
