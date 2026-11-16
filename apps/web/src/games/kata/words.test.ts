import { describe, expect, it } from 'vitest';
import { Lexicon } from './lexicon';
import { FRESH_MIN_WORDS } from './logic';
import { isWordShape, listProblems, wordList } from './words';

const words = wordList();
const lex = new Lexicon(words);

describe('word list', () => {
  it('has at least 4000 everyday words', () => {
    expect(words.length).toBeGreaterThanOrEqual(4000);
  });

  it('is clean: a-z only, 3-12 letters, no duplicates, filed under the right letter', () => {
    expect(listProblems()).toEqual({ invalid: [], duplicates: [], misplaced: [] });
    for (const w of words) expect(isWordShape(w), w).toBe(true);
  });

  it('rejects odd shapes', () => {
    expect(isWordShape('ab')).toBe(false);
    expect(isWordShape('abcdefghijklm')).toBe(false);
    expect(isWordShape('Buku')).toBe(false);
    expect(isWordShape('kupu-kupu')).toBe(false);
    expect(isWordShape('buku')).toBe(true);
  });

  it('keeps rude words out', () => {
    const rude = ['bangsat', 'bajingan', 'tolol', 'goblok', 'brengsek', 'kampret', 'sialan', 'bego', 'tai'];
    for (const w of rude) expect(lex.has(w), w).toBe(false);
  });

  it('contains the classic chain', () => {
    for (const w of ['buku', 'kuda', 'daun', 'unta', 'makan', 'kantor', 'santai', 'nyanyi']) {
      expect(lex.has(w), w).toBe(true);
    }
  });
});

describe('lexicon', () => {
  it('finds words by prefix with a binary search', () => {
    for (const p of ['ku', 'ba', 'ngan', 'nya', 'z', 'str', 'xyz']) {
      expect(lex.withPrefix(p)).toEqual(words.filter((w) => w.startsWith(p)));
    }
    expect(lex.withPrefix('')).toHaveLength(words.length);
  });

  it('counts free words', () => {
    const all = lex.withPrefix('kuda');
    expect(lex.countFree('kuda', new Set())).toBe(all.length);
    expect(lex.countFree('kuda', new Set(['kuda']))).toBe(all.length - 1);
    expect(lex.freeWithPrefix('kuda', new Set(['kuda']))).not.toContain('kuda');
  });

  it('indexes words by their first syllable', () => {
    expect(lex.byStart.get('ku')).toContain('kuda');
    expect(lex.byStart.get('kan')).toContain('kantor');
    let total = 0;
    for (const list of lex.byStart.values()) total += list.length;
    expect(total).toBe(lex.size);
  });

  it('has plenty of fresh starts with many answers', () => {
    const starters = lex.starters(FRESH_MIN_WORDS, new Set()).filter((s) => /^[^aiueo]+[aiueo]$/.test(s));
    expect(starters.length).toBeGreaterThanOrEqual(40);
    expect(starters).toEqual(expect.arrayContaining(['ba', 'ka', 'ma', 'pe', 'se']));
  });

  it('de-duplicates and sorts its input', () => {
    const small = new Lexicon(['kuda', 'buku', 'kuda']);
    expect(small.words).toEqual(['buku', 'kuda']);
    expect(small.size).toBe(2);
  });
});
