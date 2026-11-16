/** Final standings, awards and the GameResult for the shell. Pure. */
import type { GameAward, GameIcon, GameResult } from '@hoorah/sdk';
import type { RecordResult } from '../common/records';
import { type PlayerStats, soloScore } from './logic';
import { STR } from './strings';

export interface Standing extends PlayerStats {
  rank: number;
}

/** Best first: points, then bites. Ties share a rank (1, 1, 3). Join order breaks display ties. */
export function rankStandings(stats: readonly PlayerStats[]): Standing[] {
  const rows = stats.map((s, i) => ({ s, i }));
  rows.sort((a, b) => b.s.score - a.s.score || b.s.bites - a.s.bites || a.i - b.i);
  const out: Standing[] = [];
  for (let k = 0; k < rows.length; k++) {
    const r = rows[k]!;
    const prev = out[k - 1];
    const rank = prev && prev.score === r.s.score && prev.bites === r.s.bites ? prev.rank : k + 1;
    out.push({ ...r.s, rank });
  }
  return out;
}

interface AwardDef {
  title: string;
  icon: GameIcon;
  /** Higher is better; null = does not qualify. */
  metric: (s: PlayerStats) => number | null;
  desc: (s: PlayerStats) => string;
}

const AWARDS: AwardDef[] = [
  {
    title: STR.awardFast,
    icon: 'zap',
    metric: (s) => (s.bestTime === null ? null : -s.bestTime),
    desc: (s) => STR.awardFastDesc(s.bestTime ?? 0),
  },
  {
    title: STR.awardJaw,
    icon: 'fire',
    metric: (s) => (s.bites > 0 ? s.bites : null),
    desc: (s) => STR.awardJawDesc(s.bites),
  },
  {
    title: STR.awardSharp,
    icon: 'target',
    metric: (s) => (s.perfect > 0 ? s.perfect : null),
    desc: (s) => STR.awardSharpDesc(s.perfect),
  },
  {
    title: STR.awardCough,
    icon: 'heart',
    metric: (s) => (s.chokes >= 2 ? s.chokes : null),
    desc: (s) => STR.awardCoughDesc(s.chokes),
  },
];

/** Each award goes to the best player who has none yet (or the true best if nobody new qualifies). */
export function pickAwards(stats: readonly PlayerStats[]): GameAward[] {
  const out: GameAward[] = [];
  const has = new Set<number>();
  for (const def of AWARDS) {
    const ranked = stats
      .map((s, i) => ({ s, i, v: def.metric(s) }))
      .filter((r): r is { s: PlayerStats; i: number; v: number } => r.v !== null)
      .sort((a, b) => b.v - a.v || b.s.score - a.s.score || a.i - b.i);
    const pick = ranked.find((r) => !has.has(r.s.id)) ?? ranked[0];
    if (!pick) continue;
    has.add(pick.s.id);
    out.push({ playerId: pick.s.id, title: def.title, desc: def.desc(pick.s), icon: def.icon });
  }
  return out;
}

export function headline(standings: readonly Standing[], name: (id: number) => string): string {
  const top = standings.filter((s) => s.rank === 1).map((s) => name(s.id));
  if (top.length === 1) return STR.finaleWinner(top[0]!);
  return STR.finaleTie(top);
}

/* ------------------------------------------------------------------ solo records */

export type RecordKind = 'first' | 'new' | 'tie' | 'short';

/** How this game's score compares with the stored record (see `submitRecord`). */
export function recordKind(r: RecordResult, value: number): RecordKind {
  if (r.previous === null) return 'first';
  if (r.isNew) return 'new';
  return value >= r.best ? 'tie' : 'short';
}

/** The line shown under a solo game's score: new record, first record, or how far off it was. */
export function recordLine(r: RecordResult, value: number): string {
  switch (recordKind(r, value)) {
    case 'first':
      return STR.recordFirst(value);
    case 'new':
      return STR.recordNew(r.best, r.previous ?? 0);
    case 'tie':
      return STR.recordTie(r.best);
    case 'short':
      return STR.recordShort(r.best, r.best - value);
  }
}

/** A lone player's result: their score, the record line, personal awards. */
export function buildSoloResult(stats: PlayerStats, record: RecordResult): GameResult {
  const score = soloScore(stats);
  return {
    title: STR.finaleSolo(score),
    subtitle: recordLine(record, score),
    ranking: [{ playerId: stats.id, score, rank: 1, label: STR.soloLabel(score) }],
    awards: pickAwards([stats]),
  };
}

export function buildResult(
  stats: readonly PlayerStats[],
  rounds: number,
  name: (id: number) => string,
): GameResult {
  const standings = rankStandings(stats);
  const total = stats.reduce((n, s) => n + s.bites, 0);
  return {
    title: headline(standings, name),
    subtitle: STR.resultSubtitle(rounds, total),
    ranking: standings.map((s) => ({
      playerId: s.id,
      score: s.score,
      rank: s.rank,
      label: STR.rankLabel(s.bites, s.wins),
    })),
    awards: pickAwards(stats),
  };
}
