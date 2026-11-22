/**
 * One title for every player at the end of a game ("semua dapat panggung"). Titles are offered in
 * priority order; each goes to the best-scoring player who has none yet (a null score means "not
 * eligible"). Whoever is left gets the fallback, which may repeat.
 */

export interface TitleRule<K extends string> {
  key: K;
  /** Higher is better; null = this player cannot get it. */
  score: (id: number) => number | null;
}

export function assignTitles<K extends string>(
  ids: readonly number[],
  rules: readonly TitleRule<K>[],
  fallback: K,
): Map<number, K> {
  const out = new Map<number, K>();
  for (const rule of rules) {
    let best: number | null = null;
    let bestScore = -Infinity;
    for (const id of ids) {
      if (out.has(id)) continue;
      const s = rule.score(id);
      if (s === null || !Number.isFinite(s)) continue;
      if (s > bestScore) {
        bestScore = s;
        best = id;
      }
    }
    if (best !== null) out.set(best, rule.key);
    if (out.size === ids.length) break;
  }
  for (const id of ids) if (!out.has(id)) out.set(id, fallback);
  return out;
}
