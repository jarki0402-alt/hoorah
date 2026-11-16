/**
 * The word list as a searchable dictionary: membership, words by letter prefix (binary search on
 * the sorted list) and an index of words by their first syllable, used to deal fresh starts that
 * have plenty of answers. Pure; built once per game.
 */
import { firstSyllable } from './syllables';

/** First index in `sorted` whose word is >= `key`. */
function lowerBound(sorted: readonly string[], key: string): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid]! < key) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export class Lexicon {
  /** Sorted, unique. */
  readonly words: readonly string[];
  /** Words grouped by their first syllable ("ba" -> bata, batu, ...). */
  readonly byStart: ReadonlyMap<string, readonly string[]>;
  private readonly set: ReadonlySet<string>;

  constructor(words: Iterable<string>) {
    this.words = [...new Set(words)].sort();
    this.set = new Set(this.words);
    const index = new Map<string, string[]>();
    for (const w of this.words) {
      const s = firstSyllable(w);
      const list = index.get(s);
      if (list) list.push(w);
      else index.set(s, [w]);
    }
    this.byStart = index;
  }

  get size(): number {
    return this.words.length;
  }

  has(word: string): boolean {
    return this.set.has(word);
  }

  /** Every word that starts with `prefix` (letters), in alphabetical order. */
  withPrefix(prefix: string): readonly string[] {
    if (!prefix) return this.words;
    const from = lowerBound(this.words, prefix);
    // "{" sorts right after "z", so prefix + "{" bounds every word with that prefix.
    const to = lowerBound(this.words, `${prefix}{`);
    return this.words.slice(from, to);
  }

  /** Words starting with `prefix` that are not in `used`. */
  freeWithPrefix(prefix: string, used: ReadonlySet<string>): string[] {
    return this.withPrefix(prefix).filter((w) => !used.has(w));
  }

  /** How many words starting with `prefix` are still free. */
  countFree(prefix: string, used: ReadonlySet<string>): number {
    let n = 0;
    for (const w of this.withPrefix(prefix)) if (!used.has(w)) n++;
    return n;
  }

  /**
   * Start syllables with at least `min` free words (by letter prefix), most common first. These are
   * the fresh starts dealt after a mistake or a dead end.
   */
  starters(min: number, used: ReadonlySet<string>): string[] {
    const out: { s: string; n: number }[] = [];
    for (const s of this.byStart.keys()) {
      const n = this.countFree(s, used);
      if (n >= min) out.push({ s, n });
    }
    out.sort((a, b) => b.n - a.n || (a.s < b.s ? -1 : 1));
    return out.map((x) => x.s);
  }
}
