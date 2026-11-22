import { describe, expect, it } from 'vitest';
import { type Lang, normalizeWord, RAW_WORDS, WORDS } from './words';

const LANGS: Lang[] = ['id', 'en'];
/** Banned in player text (CLAUDE.md); built from its code so this file stays free of it. */
const EM_DASH = String.fromCharCode(0x2014);

describe('Juara Eja word bank', () => {
  for (const lang of LANGS) {
    describe(lang, () => {
      const list = WORDS[lang];

      it('has at least 200 words, with every tier well stocked', () => {
        expect(list.length).toBeGreaterThanOrEqual(200);
        for (const tier of [1, 2, 3] as const) {
          expect(list.filter((w) => w.tier === tier).length, `tier ${tier}`).toBeGreaterThanOrEqual(60);
        }
      });

      it('has no duplicate words in the written lists', () => {
        const words = RAW_WORDS[lang].map((w) => w.word);
        const dupes = words.filter((w, i) => words.indexOf(w) !== i);
        expect(dupes).toEqual([]);
      });

      it('keeps words to plain letters a-z', () => {
        for (const w of list) {
          expect(w.word, w.word).toMatch(/^[a-z]{3,14}$/);
          expect(normalizeWord(w.word)).toBe(w.word);
        }
      });

      it('never gives the word away in its own definition', () => {
        for (const w of list) {
          expect(normalizeWord(w.def), `${w.word}: ${w.def}`).not.toContain(w.word);
        }
      });

      it('writes short definitions that end like a sentence, without em dashes', () => {
        for (const w of list) {
          expect(w.def.length, w.word).toBeGreaterThanOrEqual(8);
          expect(w.def.length, w.word).toBeLessThanOrEqual(90);
          expect(w.def, w.word).toMatch(/[.!?]$/);
          expect(w.def, w.word).not.toContain(EM_DASH);
        }
      });

      it('makes the hard tier longer on average than the easy tier', () => {
        const avg = (tier: number) => {
          const ws = list.filter((w) => w.tier === tier);
          return ws.reduce((s, w) => s + w.word.length, 0) / ws.length;
        };
        expect(avg(3)).toBeGreaterThan(avg(1));
      });
    });
  }

  it('normalizes typed input to lowercase letters', () => {
    expect(normalizeWord(' Ang-klung! ')).toBe('angklung');
    expect(normalizeWord('Café')).toBe('cafe');
    expect(normalizeWord('12')).toBe('');
  });
});
