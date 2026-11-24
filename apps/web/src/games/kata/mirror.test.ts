import type { PlayerInfo } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { Lexicon } from './lexicon';
import { KataMatch, TIMING } from './logic';
import { applyMirror, type KataMirror, MIRROR_LOG, type MirrorInput, MirrorScene, toMirror } from './mirror';
import type { LogEntry } from './screen';
import { wordList } from './words';

const LEX = new Lexicon(wordList());
const OFFSET = 1_000_000;

function player(id: number): PlayerInfo {
  return {
    id,
    name: id < 0 ? 'Bang Jali' : `Pemain ${id}`,
    fruit: 'semangka',
    look: { c: 'nara', hc: 3 },
    color: '#22B35E',
    connected: true,
    isHost: id === 1,
  };
}

function makeMatch(ids: number[] = [1, -1]): KataMatch {
  return new KataMatch({
    seats: ids.map((id) => ({ id, connected: true })),
    lives: 3,
    lexicon: LEX,
    seed: 11,
    now: 0,
    computers: new Set(ids.filter((id) => id < 0)),
  });
}

function input(m: KataMatch, now: number, over: Partial<MirrorInput> = {}): MirrorInput {
  return {
    scene: m,
    now,
    toServer: (t) => t + OFFSET,
    held: false,
    log: [],
    banner: null,
    info: player,
    waiting: false,
    ...over,
  };
}

function wire(state: KataMirror): KataMirror {
  const parsed = applyMirror(JSON.parse(JSON.stringify(state)));
  if (!parsed) throw new Error('rejected');
  return parsed;
}

function toTurn(m: KataMatch): number {
  m.tick(TIMING.introMs);
  m.drain();
  expect(m.phase).toBe('turn');
  return TIMING.introMs;
}

describe('kata mirror', () => {
  it('round-trips a running turn, including the computer seat and its card', () => {
    const m = makeMatch();
    const t = toTurn(m) + 2000;
    const scene = new MirrorScene(wire(toMirror(input(m, t))), t + OFFSET);
    expect(scene.phase).toBe('turn');
    expect(scene.prefix).toBe(m.prefix);
    expect(scene.current).toBe(m.current);
    expect(scene.currentSeat).toEqual({
      id: m.currentSeat?.id,
      index: m.current,
      lives: 3,
      words: 0,
    });
    expect(scene.seats.map((s) => s.id)).toEqual([1, -1]);
    expect(scene.info(-1)?.name).toBe('Bang Jali');
    // The ring reads deadline minus frame time: same seconds left as on the Host.
    const now = t + 500 + OFFSET;
    expect(scene.deadline - scene.time(now)).toBe(m.deadline - (t + 500));
  });

  it('round-trips a verdict with the notebook lines and the banner', () => {
    const m = makeMatch([1, 2]);
    const t0 = toTurn(m);
    const seat = m.currentSeat;
    if (!seat) throw new Error('no seat');
    const word = m.freeWords()[0];
    if (!word) throw new Error('no word');
    expect(m.submit(seat.id, word, t0 + 1500)).toBe(true);
    m.tick(t0 + 1500);
    const link = m.lastLink;
    if (!link) throw new Error('no link');
    const log: LogEntry[] = [
      { kind: 'start', key: 's1', prefix: 'ba', start: 'first', stuckFrom: null },
      { kind: 'word', key: 'w1', link, after: { prefix: 'ka', stuck: true } },
    ];
    const state = wire(toMirror(input(m, t0 + 1600, { log, banner: { key: 3, text: 'Ronde 2' } })));
    const scene = new MirrorScene(state, t0 + 1600 + OFFSET);
    expect(scene.phase).toBe(m.phase);
    expect(scene.attempt?.word).toBe(word);
    expect(scene.attempt?.ok).toBe(true);
    expect(scene.lastLink).toEqual({
      word: link.word,
      by: link.by,
      join: link.join,
      tail: link.tail,
      ms: link.ms,
    });
    expect(scene.chainLength).toBe(1);
    expect(scene.log()).toEqual([
      log[0],
      { kind: 'word', key: 'w1', link: scene.lastLink, after: { prefix: 'ka', stuck: true } },
    ]);
    expect(scene.banner()).toEqual({ key: 3, text: 'Ronde 2' });
    expect(scene.seatOf(seat.id)?.words).toBe(1);
  });

  it('freezes the ring while the Host is held or this screen is paused', () => {
    const m = makeMatch();
    const t = toTurn(m) + 3000;
    const held = new MirrorScene(wire(toMirror(input(m, t, { held: true }))), 5_000_000);
    expect(held.frozen).toBe(true);
    expect(held.deadline - held.time(9_000_000)).toBe(TIMING.turnStartMs - 3000);

    const live = new MirrorScene(wire(toMirror(input(m, t))), t + OFFSET);
    live.setLocalPause(true, t + OFFSET + 1000);
    expect(live.deadline - live.time(t + OFFSET + 8000)).toBe(TIMING.turnStartMs - 4000);
    live.setLocalPause(false, t + OFFSET + 8000);
    expect(live.frozen).toBe(false);
  });

  it('rejects malformed states without throwing', () => {
    const m = makeMatch();
    const good = JSON.parse(JSON.stringify(toMirror(input(m, toTurn(m))))) as Record<string, unknown>;
    expect(applyMirror(good)).not.toBeNull();
    const bad: unknown[] = [
      undefined,
      null,
      'turn',
      { ...good, v: 0 },
      { ...good, ph: 'nap' },
      { ...good, sk: 'odd' },
      { ...good, px: 42 },
      { ...good, se: [[1, 'x', 0]] },
      { ...good, log: [{ kind: 'word', key: 'w', link: { word: 'a' } }] },
      {
        ...good,
        log: Array.from({ length: MIRROR_LOG + 1 }, (_, i) => ({
          kind: 'start',
          key: `s${i}`,
          prefix: 'a',
          start: 'first',
          stuckFrom: null,
        })),
      },
      { ...good, at: { by: 1, word: 'x', prefix: 'x', ok: true, reason: 'because', ms: 1, out: false } },
      { ...good, bn: { key: 'x' } },
      { ...good, pl: [{ id: 1, name: 'A', color: '#fff', look: null }] },
      { ...good, end: Number.NaN },
    ];
    for (const b of bad) expect(applyMirror(b)).toBeNull();
  });

  it('stays small with a full notebook and a full room', () => {
    const ids = Array.from({ length: 16 }, (_, i) => i + 1);
    const m = makeMatch(ids);
    const t = toTurn(m);
    const log: LogEntry[] = Array.from({ length: 40 }, (_, i) => ({
      kind: 'word',
      key: `w${i}`,
      link: { word: 'kelapamuda', by: (i % 16) + 1, join: 2, tail: 2, ms: 4321, turn: i, fresh: false },
      after: { prefix: 'da', stuck: false },
    }));
    const state = toMirror(input(m, t, { log }));
    expect(state.log).toHaveLength(MIRROR_LOG);
    expect(JSON.stringify(state).length).toBeLessThan(5000);
  });
});
