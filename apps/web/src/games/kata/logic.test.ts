import { describe, expect, it } from 'vitest';
import { Lexicon } from './lexicon';
import {
  clampLives,
  KataMatch,
  type KataOptions,
  MIN_CHAIN_OPTIONS,
  normalizeWord,
  standings,
  TIMING,
  turnMsFor,
} from './logic';
import { buildResult, pickAwards } from './results';
import { lastSyllable } from './syllables';
import { turnKey, viewFor } from './views';
import { wordList } from './words';

const LEX = new Lexicon(wordList());
const NAMES: Record<number, string> = {
  1: 'Rina',
  2: 'Budi',
  3: 'Sari',
  [-1]: 'Bang Jali',
  [-2]: 'Mpok Minah',
};
const ctx = { name: (id: number) => NAMES[id] ?? 'Pemain', toServer: (t: number) => t + 1_000_000 };

function makeMatch(over: Partial<KataOptions> = {}): KataMatch {
  return new KataMatch({
    seats: [
      { id: 1, connected: true },
      { id: 2, connected: true },
      { id: 3, connected: true },
    ],
    lives: 3,
    lexicon: LEX,
    seed: 11,
    now: 0,
    ...over,
  });
}

/** Run the intro and return the time the first turn started. */
function start(m: KataMatch): number {
  m.tick(TIMING.introMs);
  m.drain();
  return TIMING.introMs;
}

/** A good word for the current start that keeps the chain going (not a dead end). */
function goodWord(m: KataMatch, chain = true): string {
  const free = m.freeWords();
  const keep = free.find((w) => {
    const n = LEX.countFree(lastSyllable(w), new Set([...m.used, w]));
    return chain ? n >= MIN_CHAIN_OPTIONS : n < MIN_CHAIN_OPTIONS;
  });
  if (!keep) throw new Error(`no ${chain ? 'chain' : 'dead end'} word for ${m.prefix}`);
  return keep;
}

/** Finish the verdict and open the next turn; returns the new time. */
function nextTurn(m: KataMatch, t: number): number {
  const ok = m.attempt?.ok ?? false;
  const at = t + (ok ? TIMING.acceptMs : TIMING.refuseMs);
  m.tick(at);
  return at;
}

describe('helpers', () => {
  it('clamps lives and shrinks turn time per round', () => {
    expect(clampLives(2)).toBe(2);
    expect(clampLives('3')).toBe(3);
    expect(clampLives(0)).toBe(1);
    expect(clampLives(99)).toBe(5);
    expect(clampLives('x')).toBe(3);
    expect(turnMsFor(1)).toBe(15_000);
    expect(turnMsFor(2)).toBe(14_000);
    expect(turnMsFor(9)).toBe(7000);
    expect(turnMsFor(30)).toBe(7000);
  });

  it('normalises typed words', () => {
    expect(normalizeWord('  KUDA ')).toBe('kuda');
    expect(normalizeWord(42)).toBe('');
    expect(normalizeWord(undefined)).toBe('');
  });
});

describe('a match', () => {
  it('opens with the intro, then deals a fresh start with plenty of answers', () => {
    const m = makeMatch();
    expect(m.phase).toBe('intro');
    m.tick(TIMING.introMs - 1);
    expect(m.phase).toBe('intro');
    m.tick(TIMING.introMs);
    expect(m.phase).toBe('turn');
    expect(m.turnNo).toBe(1);
    expect(m.round).toBe(1);
    expect(m.turnMs).toBe(15_000);
    expect(m.startKind).toBe('first');
    expect(m.prefix).toMatch(/^[^aiueo]+[aiueo]$/);
    expect(m.freeWords().length).toBeGreaterThanOrEqual(20);
    const events = m.drain().map((e) => e.type);
    expect(events).toContain('turn');
  });

  it('accepts a good word and passes its last syllable to the next player', () => {
    const m = makeMatch();
    const t = start(m);
    const first = m.currentSeat!;
    const word = goodWord(m);
    expect(m.submit(first.id, word.toUpperCase(), t + 2500)).toBe(true);
    expect(m.phase).toBe('verdict');
    expect(m.attempt).toMatchObject({ ok: true, word, by: first.id, ms: 2500 });
    expect(m.chain).toHaveLength(1);
    expect(m.chain[0]).toMatchObject({ word, join: m.attempt!.prefix.length, fresh: true });
    expect(m.used.has(word)).toBe(true);
    expect(m.next).toMatchObject({ kind: 'chain', prefix: lastSyllable(word) });
    expect(first.words).toBe(1);
    const events = m.drain().map((e) => e.type);
    expect(events).toEqual(['phase', 'accepted']);
    nextTurn(m, t + 2500);
    expect(m.phase).toBe('turn');
    expect(m.currentSeat!.id).not.toBe(first.id);
    expect(m.prefix).toBe(lastSyllable(word));
    expect(m.startKind).toBe('chain');
    expect(m.turnNo).toBe(2);
  });

  it('ignores words from other players, outside the turn and after the deadline', () => {
    const m = makeMatch();
    expect(m.submit(1, 'kuda', 10)).toBe(false);
    const t = start(m);
    const other = m.seats.find((s) => s.id !== m.currentSeat!.id)!;
    expect(m.submit(other.id, goodWord(m), t + 100)).toBe(false);
    expect(m.submit(m.currentSeat!.id, goodWord(m), t + 15_000 + TIMING.graceMs + 1)).toBe(false);
  });

  it('accepts an answer sent just before the deadline that arrives a moment late', () => {
    const m = makeMatch();
    const t = start(m);
    const id = m.currentSeat!.id;
    expect(m.submit(id, goodWord(m), t + 15_000 + 200, t + 14_900)).toBe(true);
    expect(m.attempt?.ok).toBe(true);
    expect(m.attempt?.ms).toBe(14_900);
  });

  it.each([
    ['start', (m: KataMatch) => LEX.words.find((w) => !w.startsWith(m.prefix))!],
    ['short', (m: KataMatch) => m.prefix.slice(0, 2)],
    ['unknown', (m: KataMatch) => `${m.prefix}qqq`],
    ['unknown', (m: KataMatch) => `${m.prefix}-ku`],
  ] as const)('refuses a word (%s), costs a life and deals a fresh start', (reason, pick) => {
    const m = makeMatch();
    const t = start(m);
    const seat = m.currentSeat!;
    const word = pick(m);
    m.submit(seat.id, word, t + 1000);
    expect(m.attempt).toMatchObject({ ok: false, reason, livesLeft: 2, out: false });
    expect(seat.lives).toBe(2);
    expect(m.chain).toHaveLength(0);
    expect(m.next?.kind).toBe('fresh');
    expect(LEX.countFree(m.next!.prefix, m.used)).toBeGreaterThanOrEqual(20);
    nextTurn(m, t + 1000);
    expect(m.currentSeat!.id).not.toBe(seat.id);
    expect(m.startKind).toBe('fresh');
  });

  it('refuses a word that was already used', () => {
    const m = makeMatch();
    const t = start(m);
    const word = m.freeWords()[0]!;
    m.used.add(word);
    m.submit(m.currentSeat!.id, word, t + 700);
    expect(m.attempt).toMatchObject({ ok: false, reason: 'used', word });
  });

  it('times out after the deadline plus a short grace', () => {
    const m = makeMatch();
    const t = start(m);
    const seat = m.currentSeat!;
    m.tick(t + 15_000);
    expect(m.phase).toBe('turn');
    m.tick(t + 15_000 + TIMING.graceMs);
    expect(m.phase).toBe('verdict');
    expect(m.attempt).toMatchObject({ ok: false, reason: 'timeout', word: '', by: seat.id });
  });

  it('counts down the last three seconds', () => {
    const m = makeMatch();
    const t = start(m);
    const cues: number[] = [];
    for (let at = t; at < t + 15_000; at += 100) {
      m.tick(at);
      for (const e of m.drain()) if (e.type === 'cue') cues.push(e.secondsLeft);
    }
    expect(cues).toEqual([3, 2, 1]);
  });

  it('shrinks the turn time every full round', () => {
    const m = makeMatch();
    let t = start(m);
    const seen: number[] = [];
    for (let i = 0; i < 7; i++) {
      seen.push(m.turnMs);
      m.submit(m.currentSeat!.id, goodWord(m), t + 1000);
      t = nextTurn(m, t + 1000);
    }
    expect(seen).toEqual([15_000, 15_000, 15_000, 14_000, 14_000, 14_000, 13_000]);
    expect(m.round).toBe(3);
  });

  it('gives a fresh start when the last syllable has no words left', () => {
    const m = makeMatch();
    const t = start(m);
    const word = goodWord(m, false);
    m.submit(m.currentSeat!.id, word, t + 800);
    expect(m.next?.kind).toBe('stuck');
    expect(m.next?.stuckFrom).toBe(lastSyllable(word));
    expect(LEX.countFree(m.next!.prefix, m.used)).toBeGreaterThanOrEqual(20);
  });

  it('knocks players out and ends with the last one standing', () => {
    const m = makeMatch({
      seats: [
        { id: 1, connected: true },
        { id: 2, connected: true },
      ],
      lives: 1,
    });
    let t = start(m);
    const loser = m.currentSeat!;
    m.tick(t + 15_000 + TIMING.graceMs);
    const events = m.drain();
    expect(events.some((e) => e.type === 'out' && e.id === loser.id)).toBe(true);
    expect(loser.outRank).toBe(1);
    expect(m.winner).not.toBeNull();
    expect(m.winner).not.toBe(loser.id);
    expect(m.next).toBeNull();
    t = nextTurn(m, t + 15_000 + TIMING.graceMs);
    expect(m.phase).toBe('final');
    m.tick(t + TIMING.finalMs);
    expect(m.phase).toBe('ended');
  });

  it('skips players who are out', () => {
    const m = makeMatch({ lives: 1 });
    let t = start(m);
    const loser = m.currentSeat!;
    m.tick(t + 15_000 + TIMING.graceMs);
    t = nextTurn(m, t + 15_000 + TIMING.graceMs);
    for (let i = 0; i < 4; i++) {
      expect(m.currentSeat!.id).not.toBe(loser.id);
      m.submit(m.currentSeat!.id, goodWord(m), t + 500);
      t = nextTurn(m, t + 500);
    }
  });

  it('ends a solo game as soon as the person is out', () => {
    const m = makeMatch({
      seats: [
        { id: 1, connected: true },
        { id: -1, connected: true },
        { id: -2, connected: true },
      ],
      lives: 1,
      computers: new Set([-1, -2]),
    });
    let t = start(m);
    // Let everyone time out until the human goes out.
    while (m.seatOf(1)!.lives > 0 && m.phase !== 'final') {
      if (m.phase === 'turn' && m.currentSeat!.id !== 1) {
        m.submit(m.currentSeat!.id, goodWord(m), t + 300);
        t = nextTurn(m, t + 300);
        continue;
      }
      m.tick(t + 15_000 + TIMING.graceMs);
      t = nextTurn(m, t + 15_000 + TIMING.graceMs);
    }
    expect(m.phase).toBe('final');
    expect(m.winner === -1 || m.winner === -2).toBe(true);
  });

  it('takes a player who left out of the game and moves on without a penalty', () => {
    const m = makeMatch();
    const t = start(m);
    const leaving = m.currentSeat!;
    const prefix = m.prefix;
    m.setPresence(
      m.seats.filter((s) => s.id !== leaving.id).map((s) => ({ id: s.id, connected: true })),
      t + 500,
    );
    expect(leaving.present).toBe(false);
    expect(leaving.lives).toBe(0);
    expect(m.phase).toBe('turn');
    expect(m.currentSeat!.id).not.toBe(leaving.id);
    expect(m.prefix).toBe(prefix);
    expect(m.drain().some((e) => e.type === 'out' && e.left)).toBe(true);
  });

  it('marks a dropped phone as disconnected but keeps the seat', () => {
    const m = makeMatch();
    start(m);
    m.setPresence(
      m.seats.map((s) => ({ id: s.id, connected: s.id !== 2 })),
      TIMING.introMs + 100,
    );
    expect(m.seatOf(2)).toMatchObject({ present: true, connected: false, lives: 3 });
  });
});

describe('standings and results', () => {
  function played(): KataMatch {
    const m = makeMatch({ lives: 1, seed: 5 });
    let t = start(m);
    // Two good words, then the next two players miss.
    for (let i = 0; i < 2; i++) {
      m.submit(m.currentSeat!.id, goodWord(m), t + 1200 + i * 500);
      t = nextTurn(m, t + 1200 + i * 500);
    }
    for (let i = 0; i < 2; i++) {
      m.tick(t + 15_000 + TIMING.graceMs);
      t = nextTurn(m, t + 15_000 + TIMING.graceMs);
    }
    return m;
  }

  it('ranks the winner first, then the last one out', () => {
    const m = played();
    expect(m.phase).toBe('final');
    const rows = standings(m);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ id: m.winner, rank: 1, alive: true });
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    const out = m.seats.filter((s) => s.outRank > 0).sort((a, b) => b.outRank - a.outRank);
    expect(rows.slice(1).map((r) => r.id)).toEqual(out.map((s) => s.id));
  });

  it('builds the shell result with labels and awards', () => {
    const m = played();
    const r = buildResult(m, ctx.name);
    expect(r.title).toBe(`${ctx.name(m.winner!)} juara!`);
    expect(r.subtitle).toContain('Rantai 2 kata');
    expect(r.ranking[0]!.label).toMatch(/kata · 1 nyawa$/);
    const awards = pickAwards(m);
    const fastest = awards.find((a) => a.icon === 'zap');
    expect(fastest?.playerId).toBe(m.chain[0]!.by);
    expect(fastest?.desc).toContain('1,2 detik');
    for (const a of awards) expect(a.desc).not.toContain(String.fromCharCode(0x2014));
  });

  it('shares a rank between equal players still in at the turn cap', () => {
    const m = makeMatch();
    start(m);
    // Force the end with everyone still in and equal.
    (m as unknown as { checkEnd: (f: boolean) => boolean }).checkEnd(true);
    const rows = standings(m);
    expect(rows[0]!.rank).toBe(1);
    expect(rows[1]!.rank).toBe(2);
    expect(rows[2]!.rank).toBe(2);
  });
});

describe('phone views', () => {
  it('lets only the current player type, with the start locked in', () => {
    const m = makeMatch();
    const t = start(m);
    const me = m.currentSeat!.id;
    const other = m.seats.find((s) => s.id !== me)!.id;
    const mine = viewFor(m, me, ctx);
    expect(mine).toMatchObject({
      kind: 'word',
      title: 'Giliranmu!',
      prefix: m.prefix,
      deadline: t + 15_000 + 1_000_000,
      lives: { left: 3, total: 3 },
      maxLength: 12,
      turn: turnKey(m),
    });
    expect(mine.kind === 'word' && mine.locked).toBeFalsy();
    const theirs = viewFor(m, other, ctx);
    expect(theirs).toMatchObject({
      kind: 'word',
      locked: true,
      title: `Giliran ${ctx.name(me)}`,
      prefix: m.prefix,
    });
  });

  it('shows the refusal to the player who made it and clears their input', () => {
    const m = makeMatch();
    const t = start(m);
    const me = m.currentSeat!.id;
    const before = turnKey(m);
    m.submit(me, `${m.prefix}qqq`, t + 900);
    const v = viewFor(m, me, ctx);
    expect(v).toMatchObject({ kind: 'word', locked: true, error: 'Tidak ada di kamus' });
    expect(v.kind === 'word' && v.turn).not.toBe(before);
    nextTurn(m, t + 900);
    expect(viewFor(m, me, ctx)).toMatchObject({ error: 'Tidak ada di kamus' });
    const someoneElse = m.seats.find((s) => s.id !== me)!.id;
    expect(viewFor(m, someoneElse, ctx)).not.toHaveProperty('error');
  });

  it('sends players who are out, late joiners and the final card a message', () => {
    const m = makeMatch({
      seats: [
        { id: 1, connected: true },
        { id: 2, connected: true },
      ],
      lives: 1,
    });
    const t = start(m);
    const loser = m.currentSeat!.id;
    expect(viewFor(m, 99, ctx)).toMatchObject({ kind: 'message', title: 'Permainan sedang berjalan' });
    m.tick(t + 15_000 + TIMING.graceMs);
    nextTurn(m, t + 15_000 + TIMING.graceMs);
    expect(m.phase).toBe('final');
    expect(viewFor(m, m.winner!, ctx)).toMatchObject({ kind: 'message', title: 'Kamu juara!', tone: 'good' });
    expect(viewFor(m, loser, ctx)).toMatchObject({ kind: 'message', tone: 'neutral' });
  });

  it('shows the intro as a locked keyboard', () => {
    const m = makeMatch();
    expect(viewFor(m, 1, ctx)).toMatchObject({ kind: 'word', locked: true, title: 'Siap-siap!', turn: 0 });
  });
});
