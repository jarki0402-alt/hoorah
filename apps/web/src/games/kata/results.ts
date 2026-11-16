/** Final ranking, awards and the GameResult for the shell. Pure. */
import type { GameAward, GameResult } from '@hoorah/sdk';
import { type KataMatch, standings } from './logic';
import { STR } from './strings';

/** Awards: longest word, fastest answer, most words. Ties go to whoever did it first. */
export function pickAwards(m: KataMatch): GameAward[] {
  const out: GameAward[] = [];
  let longest: { by: number; word: string } | null = null;
  let fastest: { by: number; word: string; ms: number } | null = null;
  for (const link of m.chain) {
    if (!longest || link.word.length > longest.word.length) longest = { by: link.by, word: link.word };
    if (!fastest || link.ms < fastest.ms) fastest = { by: link.by, word: link.word, ms: link.ms };
  }
  if (longest && longest.word.length >= 5) {
    out.push({
      playerId: longest.by,
      title: STR.awardLongest,
      desc: STR.awardLongestDesc(longest.word),
      icon: 'star',
    });
  }
  if (fastest) {
    out.push({
      playerId: fastest.by,
      title: STR.awardFastest,
      desc: STR.awardFastestDesc(fastest.word, fastest.ms),
      icon: 'zap',
    });
  }
  const order = new Map(standings(m).map((s, i) => [s.id, i]));
  const most = [...m.seats]
    .filter((s) => s.words >= 2)
    .sort((a, b) => b.words - a.words || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))[0];
  if (most) {
    out.push({ playerId: most.id, title: STR.awardMost, desc: STR.awardMostDesc(most.words), icon: 'fire' });
  }
  return out;
}

export function buildResult(m: KataMatch, name: (id: number) => string): GameResult {
  const rows = standings(m);
  const ranking: GameResult['ranking'] = rows.map((r) => ({
    playerId: r.id,
    rank: r.rank,
    score: r.words,
    label: STR.rankLabel(r.words, r.lives, r.alive),
  }));
  return {
    title: m.winner !== null ? STR.resultTitle(name(m.winner)) : STR.finalNone,
    subtitle: STR.resultSubtitle(m.chain.length, Math.max(1, m.round)),
    ranking,
    awards: pickAwards(m),
  };
}
