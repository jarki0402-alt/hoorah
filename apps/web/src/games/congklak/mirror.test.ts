import { lookAt } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { newBoard, type Side, sow, stepTimes } from './logic';
import {
  applyMirror,
  type CongklakMirror,
  decodeSteps,
  encodeSteps,
  hudFor,
  type MirrorMoveSrc,
  type MirrorSource,
  toMirror,
} from './mirror';
import { SowReplay } from './replay';
import type { HudModel, PlayerCard } from './tv';

const OFFSET = 30_000;

const card = (id: number): PlayerCard => ({
  id,
  name: `Pemain ${id}`,
  fruit: 'durian',
  look: lookAt(id),
  color: '#E8352E',
  connected: true,
});

/** A HUD as the Host's driver builds it for `counts` (one round, no totals). */
function hud(counts: readonly number[]): HudModel {
  const lead: Side | null = counts[7] === counts[15] ? null : counts[7]! > counts[15]! ? 0 : 1;
  return {
    chip: 'Ronde 1',
    panels: [
      {
        side: 0,
        label: 'Pemain 1',
        members: [card(1)],
        mover: 1,
        store: counts[7]!,
        total: null,
        status: 'Menabur...',
        active: true,
        lead: lead === 0,
      },
      {
        side: 1,
        label: 'Pemain 2',
        members: [card(2), card(3)],
        mover: null,
        store: counts[15]!,
        total: null,
        status: 'Menunggu',
        active: false,
        lead: lead === 1,
      },
    ],
    banner: null,
  };
}

function source(counts: readonly number[], move: MirrorMoveSrc | null): MirrorSource {
  return {
    hud: hud(counts),
    counts,
    move,
    sum: [0, 0],
    live: true,
    tot: false,
    turn: null,
    flash: [3],
    flashKey: 4,
    toasts: [{ id: 1, text: 'TEMBAK!', kind: 'capture', x: 300, y: 200, until: 900 }],
    bubbles: [[{ id: 2, text: 'Hore', who: 'Pemain 1', tone: 'cheer', until: 800 }], []],
    timer: { side: 0, deadline: 5000 },
    frozenAt: null,
    toServer: (t) => t + OFFSET,
  };
}

const wire = (s: CongklakMirror): unknown => JSON.parse(JSON.stringify(s));

const opening = () => {
  const before = newBoard();
  const trace = sow(before, 0, 2);
  return { before, trace };
};

describe('congklak mirror', () => {
  it('steps survive the compact encoding', () => {
    const { before, trace } = opening();
    expect(decodeSteps(encodeSteps(trace.steps), before, 0)).toEqual(trace.steps);
    // A capture: last seed into an empty own hole with seeds across.
    const b = [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0];
    const cap = sow(b, 0, 1);
    expect(cap.outcome).toBe('capture');
    expect(decodeSteps(encodeSteps(cap.steps), b, 0)).toEqual(cap.steps);
  });

  it('round trip: the far screen rebuilds the HUD and replays the move to the same board', () => {
    const { before, trace } = opening();
    const move: MirrorMoveSrc = { n: 1, before, steps: trace.steps, side: 0, startAt: 1000 };
    const shown = applyMirror(wire(toMirror(source(before, move))))!;
    expect(shown).not.toBeNull();
    expect(shown.move?.startAt).toBe(1000 + OFFSET);
    expect(shown.timer).toEqual({ side: 0, deadline: 5000 + OFFSET });
    expect(shown.toasts[0]?.until).toBe(900 + OFFSET);
    expect(shown.bubbles[0][0]?.until).toBe(800 + OFFSET);
    // Same replay as the Host's at every moment.
    const host = new SowReplay(before, trace.steps, 0, 1000);
    const far = new SowReplay(shown.move!.before, shown.move!.steps, 0, shown.move!.startAt);
    const total = stepTimes(trace.steps).total;
    for (let t = 0; t <= total + 10; t += 97) {
      host.advance(1000 + t);
      far.advance(1000 + OFFSET + t);
      expect(far.board).toEqual(host.board);
      expect(far.handAt()).toEqual(host.handAt());
      expect(hudFor(shown, far.board)).toEqual(hud(host.board));
    }
    expect(far.done).toBe(true);
    expect(far.board).toEqual(trace.after);
  });

  it('a later state with the same move keeps the replay, a new number starts the next one', () => {
    const { before, trace } = opening();
    const a = applyMirror(
      wire(toMirror(source(before, { n: 4, before, steps: trace.steps, side: 0, startAt: 0 }))),
    )!;
    const next = sow(
      trace.after,
      1,
      trace.after.findIndex((n, i) => i >= 8 && i < 15 && n > 0),
    );
    const b = applyMirror(
      wire(
        toMirror(
          source(trace.after, { n: 5, before: trace.after, steps: next.steps, side: 1, startAt: 9000 }),
        ),
      ),
    )!;
    expect(a.move?.n).toBe(4);
    expect(b.move?.n).toBe(5);
    expect(b.board).toEqual(trace.after);
  });

  it('between rounds the board travels as is', () => {
    const counts = newBoard();
    const shown = applyMirror(wire(toMirror(source(counts, null))))!;
    expect(shown.move).toBeNull();
    expect(shown.board).toEqual(counts);
    expect(hudFor(shown, shown.board)).toEqual(hud(counts));
  });

  it('totals over several rounds follow the stores', () => {
    const counts = newBoard();
    counts[7] = 12;
    counts[15] = 3;
    const shown = applyMirror(wire(toMirror({ ...source(counts, null), sum: [40, 50], tot: true })))!;
    const h = hudFor(shown, counts);
    expect(h.panels[0].total).toBe(52);
    expect(h.panels[1].total).toBe(53);
    expect(h.panels[1].lead).toBe(true);
  });

  it('rejects malformed states without throwing', () => {
    const { before, trace } = opening();
    const good = toMirror(source(before, { n: 1, before, steps: trace.steps, side: 0, startAt: 0 }));
    const bad: unknown[] = [
      null,
      'x',
      [],
      { ...good, v: 0 },
      { ...good, panels: [good.panels[0]] },
      { ...good, panels: [good.panels[0], ['B', [99], null, 's', 0]] },
      { ...good, people: [[1, 'A', 'apel?', {}, '#fff', 1]] },
      { ...good, mv: [1, 0, 0, before.slice(0, 5), [0]] },
      { ...good, mv: [1, 0, 0, before, [0]] },
      { ...good, mv: [1, 0, 0, before, [99]] },
      { ...good, mv: [1, 2, 0, before, []] },
      { ...good, mv: null, board: [1, 2] },
      { ...good, turn: 3 },
      { ...good, flash: [40] },
      { ...good, toasts: [{ id: 1, text: 'a', kind: 'boom', x: 0, y: 0, until: 0 }] },
      { ...good, bubbles: [[], [{ id: 1, text: 'a', who: 'b', tone: 'cheer', until: 'x' }]] },
      { ...good, timer: [0] },
      { ...good, banner: { kind: 'final', key: 1, title: 't', sub: '', next: null, winner: 5 } },
      { ...good, chip: 'x'.repeat(999) },
      { ...good, frozen: {} },
    ];
    for (const b of bad) expect(applyMirror(b)).toBeNull();
  });

  it('stays small even for a long relay', () => {
    let worst = 0;
    for (let pit = 0; pit < 7; pit++) {
      const before = newBoard();
      const trace = sow(before, 0, pit);
      const move = { n: 1, before, steps: trace.steps, side: 0 as Side, startAt: 0 };
      worst = Math.max(worst, JSON.stringify(toMirror(source(before, move))).length);
    }
    expect(worst).toBeLessThan(3000);
  });
});
