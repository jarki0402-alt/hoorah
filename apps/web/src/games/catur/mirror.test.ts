import { lookAt, type PlayerInfo } from '@hoorah/protocol';
import type { HoorahGame } from '@hoorah/sdk';
import { describe, expect, it } from 'vitest';
import { boardString } from './chess';
import { CaturMatch, INTRO_MS } from './logic';
import { applyMirror, type CaturMirror, toMirror } from './mirror';
import { CaturReplica } from './replica';
import { index64 } from './sprites';

const T0 = 1_000_000;

const info = (id: number): PlayerInfo => ({
  id,
  name: `Pemain ${id}`,
  fruit: 'mangga',
  look: lookAt(id),
  color: '#E8352E',
  connected: true,
  isHost: id === 1,
});

function match(n: number) {
  const m = new CaturMatch({
    seed: 7,
    now: T0,
    minutes: 3,
    players: Array.from({ length: n }, (_, i) => ({ id: i + 1, connected: true })),
  });
  m.tick(T0 + INTRO_MS);
  return { m, t: T0 + INTRO_MS };
}

/** Plays UCI moves in a duel, one second apart. */
function play(m: CaturMatch, t: number, moves: string[]): number {
  let now = t;
  for (const mv of moves) {
    now += 1000;
    const id = m.sides[m.turn][0]!;
    expect(m.submit(id, mv, now).length).toBeGreaterThan(0);
  }
  return now;
}

const publish = (m: CaturMatch, notice: string | null = null): CaturMirror =>
  toMirror(m, boardString(m.pos), notice, info);

const wire = (s: CaturMirror): unknown => JSON.parse(JSON.stringify(s));

describe('catur mirror', () => {
  it('round trip keeps everything the view draws', () => {
    const { m, t } = match(2);
    const now = play(m, t, ['e2e4', 'd7d5', 'e4d5', 'g8f6', 'f1b5']);
    const shown = applyMirror(wire(publish(m, 'Langkah acak')));
    expect(shown).not.toBeNull();
    const v = shown!.match;
    expect(shown!.board).toBe(boardString(m.pos));
    expect(shown!.notice).toBe('Langkah acak');
    expect(v.mode).toBe('duel');
    expect(v.phase).toBe('play');
    expect(v.turn).toBe(m.turn);
    expect(v.sides).toEqual(m.sides);
    expect(v.history.map((h) => [h.san, h.color])).toEqual(m.history.map((h) => [h.san, h.color]));
    expect(v.lastMove()?.uci).toBe('f1b5');
    expect(v.checkSquare()).toBe(m.checkSquare());
    expect(v.checkSquare()).toBe('e8');
    expect(v.captures()).toEqual(m.captures());
    expect(v.material()).toBe(m.material());
    for (const at of [now, now + 4321, now + 60_000]) {
      expect(v.timeLeft('w', at)).toBe(m.timeLeft('w', at));
      expect(v.timeLeft('b', at)).toBe(m.timeLeft('b', at));
    }
    expect(shown!.people.map((p) => p.id).sort()).toEqual([1, 2]);
    expect(v.isConnected(1)).toBe(true);
  });

  it('held clocks stop on the mirror too', () => {
    const { m, t } = match(2);
    const now = play(m, t, ['e2e4']);
    m.setHeld(true, now + 2000);
    const v = applyMirror(wire(publish(m)))!.match;
    expect(v.held).toBe(true);
    expect(v.timeLeft('b', now + 90_000)).toBe(m.timeLeft('b', now + 90_000));
  });

  it('team votes carry their SAN and voters', () => {
    const { m, t } = match(4);
    const [a, b] = m.sides[m.turn];
    m.submit(a!, 'e2e4', t + 500);
    m.submit(b!, 'g1f3', t + 600);
    const v = applyMirror(wire(publish(m)))!.match;
    const tally = v.tally();
    expect(tally.map((x) => x.move).sort()).toEqual(['e2e4', 'g1f3']);
    expect(v.sanOf('e2e4')).toBe('e4');
    expect(v.sanOf('g1f3')).toBe('Nf3');
    expect(tally.flatMap((x) => x.voters).sort()).toEqual([a, b].sort());
  });

  it('checkmate outcome survives', () => {
    const { m, t } = match(2);
    play(m, t, ['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    const v = applyMirror(wire(publish(m)))!.match;
    expect(v.phase).toBe('over');
    expect(v.outcome).toEqual({ winner: 'b', reason: 'checkmate' });
  });

  it('rejects malformed states without throwing', () => {
    const { m, t } = match(2);
    play(m, t, ['e2e4']);
    const good = publish(m);
    const bad: unknown[] = [
      null,
      42,
      'x',
      [],
      {},
      { ...good, v: 2 },
      { ...good, board: 'rnb' },
      { ...good, board: `${good.board.slice(0, 63)}X` },
      { ...good, phase: 'dance' },
      { ...good, turn: 'red' },
      { ...good, ck: [1, 2] },
      { ...good, ck: [1, 2, 'x'] },
      { ...good, san: ['e4', { x: 1 }] },
      { ...good, san: ['<script>'] },
      { ...good, last: 'e2' },
      { ...good, check: 'z9' },
      { ...good, out: ['w', 'boom'] },
      { ...good, cap: ['ppX', ''] },
      { ...good, tally: [['e2e4', 'e4', 1, ['a']]] },
      { ...good, w: [1.5] },
      { ...good, people: 'all' },
      { ...good, notice: 'x'.repeat(500) },
      { ...good, mat: Number.NaN },
    ];
    for (const b of bad) expect(applyMirror(b)).toBeNull();
    // A broken person is dropped, the rest still draws.
    const shown = applyMirror({ ...(wire(good) as CaturMirror), people: [[1, 'A', 'nope', {}, '#fff', 1]] });
    expect(shown?.people).toEqual([]);
  });

  it('stays small for a busy team game', () => {
    const { m, t } = match(8);
    const voters = m.sides[m.turn];
    voters.forEach((id, i) => {
      m.submit(id, ['e2e4', 'd2d4', 'g1f3', 'c2c4'][i % 4], t + 100 + i);
    });
    const size = JSON.stringify(publish(m)).length;
    expect(size).toBeLessThan(3000);
  });

  it('a move slides the same sprite on the mirror', () => {
    const { m, t } = match(2);
    const fake = { on: () => () => {}, now: () => t } as unknown as HoorahGame;
    const replica = new CaturReplica(fake);
    replica.apply(wire(publish(m)));
    const pawn = replica.sprites.find((s) => s.sq === index64('e2'))!;
    play(m, t, ['e2e4']);
    replica.apply(wire(publish(m)));
    const moved = replica.sprites.find((s) => s.id === pawn.id)!;
    expect(moved.sq).toBe(index64('e4'));
    expect(replica.version.value).toBe(2);
    // A capture fades the victim out.
    play(m, t + 1000, ['d7d5']);
    replica.apply(wire(publish(m)));
    const victim = replica.sprites.find((s) => s.sq === index64('d5'))!;
    play(m, t + 2000, ['e4d5']);
    replica.apply(wire(publish(m)));
    expect(replica.sprites.find((s) => s.id === victim.id)?.gone).toBe(true);
    expect(replica.sprites.find((s) => s.id === pawn.id)?.sq).toBe(index64('d5'));
    // Garbage keeps the last good state.
    replica.apply({ v: 1 });
    expect(replica.version.value).toBe(4);
  });
});
