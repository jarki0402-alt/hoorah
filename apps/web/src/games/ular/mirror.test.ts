import { lookAt } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { FRAME } from './art';
import { cellCenter, makeBoard } from './board';
import type { HudModel, PlayerCard } from './hud';
import { DUEL_INTRO_MS, DUEL_MS, HOP_MS, jumpMs, LAND_MS } from './logic';
import { applyMirror, type MirrorSource, type SourcePlan, toMirror, type UlarMirror } from './mirror';
import { dieAt, duelClock, planPose } from './motion';

const OFFSET = 70_000;
const CELL = 60;
const board = makeBoard(50);

const card = (id: number): PlayerCard => ({
  id,
  name: `Pemain ${id}`,
  fruit: 'nanas',
  look: lookAt(id),
  color: '#FFB020',
});

function model(n: number): HudModel {
  return {
    size: 50,
    round: 2,
    maxRounds: 12,
    lastRound: false,
    players: Array.from({ length: n }, (_, i) => ({
      ...card(i + 1),
      pos: 3 * i,
      rank: i + 1,
      active: i === 0,
      offline: i === 2,
      shield: i === 1,
      skip: false,
    })),
    who: card(1),
    extra: false,
    eyebrow: 'GILIRAN',
    empty: 'Menunggu',
    hint: 'Lempar dadu',
    timer: false,
  };
}

/** A dice move of three hops that lands on the first ladder and climbs it. */
function ladderPlan(start: number): SourcePlan {
  const ladder = board.ladders.find((l) => l.from >= 4)!;
  const hopStart = start + 1100;
  const jumpStart = hopStart + 3 * HOP_MS;
  return {
    playerId: 1,
    from: ladder.from - 3,
    path: [ladder.from - 2, ladder.from - 1, ladder.from],
    landed: ladder.from,
    jump: ladder,
    hopStart,
    jumpStart,
    end: jumpStart + jumpMs(board, ladder) + LAND_MS,
  };
}

function source(n = 4, plans: SourcePlan[] = []): MirrorSource {
  const m = model(n);
  return {
    board,
    model: m,
    banner: { kind: 'finale', key: 3, title: 'JUARA', sub: 'Sampai 50', winner: card(2) },
    card: { key: 5, who: card(1), id: 'ojek' },
    duel: { key: 6, a: card(1), b: card(3), tapsA: 4, tapsB: 7, stage: 'live', winner: null },
    duelTimes: { start: 2000, end: 2000 + DUEL_MS },
    shouts: [
      {
        id: 8,
        x: FRAME + 2.5 * CELL,
        y: FRAME + 4.25 * CELL,
        text: 'NAIK!',
        sub: 'x',
        tone: 'good',
        until: 900,
      },
    ],
    bubbles: [{ id: 9, who: card(2), text: 'Hore', tone: 'cheer', until: 1500 }],
    cell: CELL,
    rest: new Map(m.players.map((p) => [p.id, p.pos + 1])),
    plans,
    dice: { hopStart: 1100, face: 3 },
    roll: null,
    frozenAt: null,
    toServer: (t) => t + OFFSET,
  };
}

const wire = (s: UlarMirror): unknown => JSON.parse(JSON.stringify(s));

describe('ular mirror', () => {
  it('round trip rebuilds the HUD, overlays and rest squares', () => {
    const src = source();
    const shown = applyMirror(wire(toMirror(src)))!;
    expect(shown).not.toBeNull();
    expect(shown.board).toBe(board);
    expect(shown.model).toEqual(src.model);
    expect(shown.banner).toEqual(src.banner);
    expect(shown.card).toEqual(src.card);
    expect(shown.duel).toEqual(src.duel);
    expect(shown.duelTimes).toEqual({ start: 2000 + OFFSET, end: 2000 + DUEL_MS + OFFSET });
    expect(shown.rest).toEqual(src.model.players.map((p) => ({ id: p.id, sq: p.pos + 1 })));
    expect(shown.shouts).toEqual([{ ...src.shouts[0], x: 2.5, y: 4.25, until: 900 + OFFSET }]);
    expect(shown.bubbles).toEqual([{ ...src.bubbles[0], until: 1500 + OFFSET }]);
    expect(shown.dice).toEqual({ hopStart: 1100 + OFFSET, face: 3 });
  });

  it('a move plan hops and climbs exactly like on the Host', () => {
    const plan = ladderPlan(0);
    const shown = applyMirror(wire(toMirror(source(4, [plan]))))!;
    const far = shown.plans[0]!;
    expect(far.playerId).toBe(1);
    expect(far.jump).toBe(board.jumpAt.get(plan.landed));
    for (let t = plan.hopStart - 200; t < plan.end; t += 37) {
      const a = planPose(board, plan, t);
      const b = planPose(shown.board, far, t + OFFSET);
      expect(b).toEqual(a);
    }
    // The pose walks the path, then climbs to the top of the ladder.
    expect(planPose(board, plan, plan.hopStart + HOP_MS * 0.5).hops).toBe(1);
    expect(planPose(board, plan, plan.jumpStart - 1).jumping).toBe(false);
    const top = planPose(board, plan, plan.jumpStart + jumpMs(board, plan.jump!) + 1);
    expect(top.jumping).toBe(true);
    expect(top.p).toEqual(cellCenter(board, plan.jump!.to));
  });

  it('dice, duel clock and pause cross the wire', () => {
    const src = { ...source(), roll: { active: 2, deadline: 9000 }, frozenAt: 1234 };
    const shown = applyMirror(wire(toMirror(src)))!;
    expect(shown.roll).toEqual({ active: 2, deadline: 9000 + OFFSET });
    expect(shown.frozen).toBe(1234 + OFFSET);
    expect(dieAt(true, shown.dice, 0)).toEqual({ face: 0, rolling: false });
    expect(dieAt(false, shown.dice, 1000 + OFFSET).rolling).toBe(true);
    expect(dieAt(false, shown.dice, 1200 + OFFSET)).toEqual({ face: 3, rolling: false });
    expect(duelClock('intro', 5000, 0, 5000 - DUEL_INTRO_MS + 1).text).toBe('3');
    expect(duelClock('live', 0, DUEL_MS, DUEL_MS / 2).frac).toBeCloseTo(0.5);
    expect(duelClock('result', 0, 0, 0)).toEqual({ frac: 0, text: 'VS' });
  });

  it('rejects malformed states without throwing', () => {
    const good = toMirror(source(4, [ladderPlan(0)]));
    const plan = good.plans[0]!;
    const bad: unknown[] = [
      null,
      1,
      [],
      { ...good, v: 3 },
      { ...good, size: 64 },
      { ...good, people: [[1, 'A', 'kiwi', {}, '#fff']] },
      { ...good, rows: [[99, 0, 1, 0, 0]] },
      { ...good, rows: [[1, 51, 1, 0, 0]] },
      { ...good, m: [1, 2, 0, null, 0, 'a', 'b'] },
      { ...good, banner: { k: 'party', key: 1, title: 'a', sub: 'b' } },
      { ...good, card: [1, 1, 'joker'] },
      { ...good, duel: [1, 1, 3, 0, 0, 'boxing', null, 0, 0] },
      { ...good, shouts: [[1, 'x', 0, 'a', 'b', 'good', 0]] },
      { ...good, bubbles: [[1, 2, 'a', 'yell', 0]] },
      // A ladder flag on a square without a ladder or snake.
      { ...good, plans: [[1, 1, [2], 2, 1, 0, 0, 0]] },
      { ...good, plans: [[1, 1, Array(40).fill(2), 2, 0, 0, 0, 0]] },
      { ...good, plans: [[...plan.slice(0, 7)]] },
      { ...good, dice: [0, 9] },
      { ...good, roll: ['me', 0] },
      { ...good, frozen: 'later' },
    ];
    for (const b of bad) expect(applyMirror(b)).toBeNull();
  });

  it('stays small for a full table', () => {
    const plans = [ladderPlan(0), { ...ladderPlan(0), playerId: 2 }];
    expect(JSON.stringify(toMirror(source(8, plans))).length).toBeLessThan(3000);
  });
});
