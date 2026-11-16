import type { PlayerInfo } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { answerDelay, decide, kataOpponents, rankWords, SOLO_OPPONENTS, slipChance } from './brain';
import { Lexicon } from './lexicon';
import { MIN_CHAIN_OPTIONS, makeRng } from './logic';
import { lastSyllable } from './syllables';
import { wordList } from './words';

const LEX = new Lexicon(wordList());

const human = (id: number, name: string): PlayerInfo => ({
  id,
  name,
  fruit: 'jeruk',
  color: '#FF8A3D',
  connected: true,
  isHost: id === 1,
});

describe('opponents', () => {
  it('seats three computer players for one person and none for a group', () => {
    const solo = kataOpponents([human(1, 'Rina')], makeRng(1));
    expect(solo).toHaveLength(SOLO_OPPONENTS);
    for (const c of solo) {
      expect(c.id).toBeLessThan(0);
      expect(c.name).not.toMatch(/bot|cpu/i);
    }
    expect(kataOpponents([human(1, 'Rina'), human(2, 'Budi')])).toEqual([]);
  });
});

describe('decide', () => {
  it('types a free word with the right start, inside the turn', () => {
    const rnd = makeRng(7);
    for (let i = 0; i < 300; i++) {
      const move = decide({ prefix: 'ba', lexicon: LEX, used: new Set(), skill: 0.5, turnMs: 12_000, rnd });
      if (move.kind === 'freeze') continue;
      expect(move.word.startsWith('ba')).toBe(true);
      expect(LEX.has(move.word)).toBe(true);
      expect(move.delayMs).toBeGreaterThanOrEqual(600);
      expect(move.delayMs).toBeLessThanOrEqual(12_000 - 1300);
    }
  });

  it('freezes when no word is left', () => {
    const all = new Set(LEX.withPrefix('nya'));
    expect(decide({ prefix: 'nya', lexicon: LEX, used: all, skill: 1, turnMs: 9000 })).toEqual({
      kind: 'freeze',
    });
  });

  it('slips more often when gentle than when sharp', () => {
    const rate = (skill: number) => {
      const rnd = makeRng(99);
      let slips = 0;
      const n = 800;
      for (let i = 0; i < n; i++) {
        const move = decide({ prefix: 'ka', lexicon: LEX, used: new Set(), skill, turnMs: 15_000, rnd });
        if (move.kind === 'freeze' || move.slip) slips++;
      }
      return slips / n;
    };
    const gentle = rate(0.05);
    const sharp = rate(0.95);
    expect(gentle).toBeGreaterThan(0.12);
    expect(sharp).toBeLessThan(0.1);
    expect(gentle).toBeGreaterThan(sharp * 2);
  });

  it('repeats a used word as a slip only when one exists', () => {
    const used = new Set(LEX.withPrefix('ku').slice(0, 5));
    const rnd = makeRng(3);
    let repeats = 0;
    for (let i = 0; i < 600; i++) {
      const move = decide({ prefix: 'ku', lexicon: LEX, used, skill: 0.05, turnMs: 8000, rnd });
      if (move.kind === 'word' && move.slip) {
        repeats++;
        expect(used.has(move.word)).toBe(true);
      }
      if (move.kind === 'word' && !move.slip) expect(used.has(move.word)).toBe(false);
    }
    expect(repeats).toBeGreaterThan(0);
  });

  it('leaves sharper traps when sharp', () => {
    const trapScore = (skill: number) => {
      const rnd = makeRng(5);
      let total = 0;
      let n = 0;
      for (let i = 0; i < 400; i++) {
        const move = decide({ prefix: 'ma', lexicon: LEX, used: new Set(), skill, turnMs: 15_000, rnd });
        if (move.kind !== 'word' || move.slip) continue;
        const free = LEX.countFree(lastSyllable(move.word), new Set([move.word]));
        if (free >= MIN_CHAIN_OPTIONS) {
          total += free;
          n++;
        }
      }
      return total / Math.max(1, n);
    };
    expect(trapScore(0.95)).toBeLessThan(trapScore(0.05));
  });
});

describe('helpers', () => {
  it('ranks words that leave few answers first, dead ends last', () => {
    const ranked = rankWords(LEX.withPrefix('ta'), LEX, new Set());
    const free = (w: string) => LEX.countFree(lastSyllable(w), new Set([w]));
    const first = free(ranked[0]!);
    expect(first).toBeGreaterThanOrEqual(MIN_CHAIN_OPTIONS);
    expect(first).toBeLessThan(10);
    expect(free(ranked[ranked.length - 1]!)).toBeGreaterThanOrEqual(0);
  });

  it('keeps the slip chance in a sane range and rising under pressure', () => {
    expect(slipChance(0.5, 15_000, 50)).toBeLessThan(slipChance(0.5, 7000, 50));
    expect(slipChance(0.5, 15_000, 50)).toBeLessThan(slipChance(0.5, 15_000, 3));
    for (const s of [0, 0.5, 1]) {
      for (const t of [7000, 15_000]) {
        const c = slipChance(s, t, 2);
        expect(c).toBeGreaterThanOrEqual(0.02);
        expect(c).toBeLessThanOrEqual(0.6);
      }
    }
  });

  it('answers faster when sharp', () => {
    const rnd = () => 0.5;
    expect(answerDelay(0.95, 15_000, 'kancil', 40, rnd)).toBeLessThan(
      answerDelay(0.05, 15_000, 'kancil', 40, rnd),
    );
  });
});
