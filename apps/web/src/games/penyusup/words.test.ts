import { describe, expect, it } from 'vitest';
import { type Lang, normalizeWord, PAIRS, pairKey } from './words';

const LANGS: Lang[] = ['id', 'en'];
/** Banned in player text (CLAUDE.md); built from its code so this file stays free of it. */
const EM_DASH = String.fromCharCode(0x2014);

describe('Penyusup word bank', () => {
  for (const lang of LANGS) {
    describe(lang, () => {
      const pairs = PAIRS[lang];

      it('has at least 150 pairs, enough of them easy for the first ronde', () => {
        expect(pairs.length).toBeGreaterThanOrEqual(150);
        expect(pairs.filter((p) => p.easy).length).toBeGreaterThanOrEqual(40);
      });

      it('has no duplicate pair, in either order', () => {
        const keys = pairs.map((p) => pairKey(lang, p));
        const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
        expect(dupes).toEqual([]);
      });

      it('pairs two different words', () => {
        for (const p of pairs) {
          expect(normalizeWord(p.a), `${p.a}|${p.b}`).not.toBe(normalizeWord(p.b));
          expect(normalizeWord(p.a).length).toBeGreaterThanOrEqual(2);
          expect(normalizeWord(p.b).length).toBeGreaterThanOrEqual(2);
        }
      });

      it('uses only letters and single spaces, short enough for the card', () => {
        for (const p of pairs) {
          for (const w of [p.a, p.b]) {
            expect(w, w).toMatch(/^[A-Za-z]+( [A-Za-z]+)*$/);
            expect(w.length, w).toBeLessThanOrEqual(14);
            expect(w).not.toContain(EM_DASH);
          }
        }
      });
    });
  }

  it('normalizes typed guesses', () => {
    expect(normalizeWord('Mi Ayam')).toBe('MIAYAM');
    expect(normalizeWord('miayam')).toBe('MIAYAM');
    expect(pairKey('id', { a: 'Teh', b: 'Kopi', easy: true })).toBe(
      pairKey('id', { a: 'kopi', b: 'teh', easy: false }),
    );
  });
});
