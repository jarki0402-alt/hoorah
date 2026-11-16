/** Final standings, awards and the GameResult for the shell. Pure. */
import type { GameAward, GameIcon, GameResult } from '@hoorah/sdk';
import type { RecordResult } from '../common/records';
import type { PlayerStats } from './logic';
import type { DishId } from './recipes';
import { STR } from './strings';

export interface Standing extends PlayerStats {
  rank: number;
}

/** Best score first; ties share a rank (1, 1, 3). Join order breaks display ties. */
export function rankStandings(stats: readonly PlayerStats[]): Standing[] {
  const rows = stats.map((s, i) => ({ s, i }));
  rows.sort((a, b) => b.s.score - a.s.score || a.i - b.i);
  const out: Standing[] = [];
  for (let k = 0; k < rows.length; k++) {
    const r = rows[k]!;
    const prev = out[k - 1];
    const rank = prev && prev.score === r.s.score ? prev.rank : k + 1;
    out.push({ ...r.s, rank });
  }
  return out;
}

const avg = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : Infinity);

interface AwardDef {
  title: string;
  icon: GameIcon;
  /** Higher is better; null = not eligible. */
  metric: (s: PlayerStats) => number | null;
  desc: (s: PlayerStats) => string;
}

const AWARDS: AwardDef[] = [
  {
    title: STR.awardStars,
    icon: 'crown',
    metric: (s) => (s.stars > 0 ? s.stars * 1000 + s.score / 1000 : null),
    desc: (s) => STR.awardStarsDesc(s.stars),
  },
  {
    title: STR.awardKnife,
    icon: 'zap',
    metric: (s) => (s.knifeMs.length ? -avg(s.knifeMs) : null),
    desc: (s) => STR.awardKnifeDesc(STR.secs(avg(s.knifeMs))),
  },
  {
    title: STR.awardHeat,
    icon: 'fire',
    metric: (s) => (s.burns === 0 && s.holdErrors.length ? -avg(s.holdErrors) : null),
    desc: () => STR.awardHeatDesc,
  },
  {
    title: STR.awardStir,
    icon: 'target',
    metric: (s) => (s.stirMs.length ? -avg(s.stirMs) : null),
    desc: (s) => STR.awardStirDesc(STR.secs(avg(s.stirMs))),
  },
  {
    title: STR.awardStreak,
    icon: 'star',
    metric: (s) => (s.bestStreak >= 3 ? s.bestStreak : null),
    desc: (s) => STR.awardStreakDesc(s.bestStreak),
  },
];

/**
 * Awards spread so everyone gets one when possible: each award goes to the best eligible player
 * who has none yet, else to the true best. At most four (what the results page shows); solo
 * players get at most three. Anyone left without one gets "Koki Pantang Menyerah".
 */
export function pickAwards(stats: readonly PlayerStats[]): GameAward[] {
  const out: GameAward[] = [];
  const has = new Set<number>();
  const limit = stats.length <= 1 ? 3 : 4;
  for (const def of AWARDS) {
    if (out.length >= limit) break;
    const ranked = stats
      .map((s, i) => ({ s, i, v: def.metric(s) }))
      .filter((r): r is { s: PlayerStats; i: number; v: number } => r.v !== null)
      .sort((a, b) => b.v - a.v || b.s.score - a.s.score || a.i - b.i);
    const pick = ranked.find((r) => !has.has(r.s.id)) ?? ranked[0];
    if (!pick) continue;
    has.add(pick.s.id);
    out.push({ playerId: pick.s.id, title: def.title, desc: def.desc(pick.s), icon: def.icon });
  }
  for (const s of stats) {
    if (out.length >= limit) break;
    if (has.has(s.id)) continue;
    has.add(s.id);
    out.push({ playerId: s.id, title: STR.awardBrave, desc: STR.awardBraveDesc, icon: 'heart' });
  }
  return out;
}

export function headline(standings: readonly Standing[], name: (id: number) => string, maxStars: number) {
  const first = standings[0];
  if (!first) return STR.finalTitle;
  if (standings.length === 1) return STR.resultSolo(first.stars, maxStars);
  const top = standings.filter((s) => s.rank === 1).map((s) => name(s.id));
  return top.length === 1 ? STR.resultWinner(top[0]!) : STR.resultTie(top);
}

/* ------------------------------------------------------------------ solo records */

export type RecordKind = 'first' | 'new' | 'tie' | 'short';

/** How this game's score compares with the stored record (see `submitRecord`). */
export function recordKind(r: RecordResult, value: number): RecordKind {
  if (r.previous === null) return 'first';
  if (r.isNew) return 'new';
  return value >= r.best ? 'tie' : 'short';
}

/** What the main screen and the phone say about the record at the end of a solo game. */
export interface SoloRecord {
  text: string;
  isNew: boolean;
}

export function soloRecord(r: RecordResult, value: number): SoloRecord {
  const kind = recordKind(r, value);
  const text =
    kind === 'first'
      ? STR.recordFirst(value)
      : kind === 'new'
        ? STR.recordNew(r.best, r.previous ?? 0)
        : kind === 'tie'
          ? STR.recordTie(r.best)
          : STR.recordShort(r.best, r.best - value);
  return { text, isNew: kind === 'new' };
}

/** `record` (exactly one person played) replaces the dish list under the headline. */
export function buildResult(
  stats: readonly PlayerStats[],
  dishes: readonly DishId[],
  name: (id: number) => string,
  record: SoloRecord | null = null,
): GameResult {
  const standings = rankStandings(stats);
  return {
    title: headline(standings, name, dishes.length * 3),
    subtitle: record && stats.length === 1 ? record.text : STR.resultSubtitle([...dishes]),
    ranking: standings.map((s) => ({
      playerId: s.id,
      score: s.score,
      rank: s.rank,
      label: STR.rankLabel(s.stars, s.perfects),
    })),
    awards: pickAwards(stats),
  };
}
