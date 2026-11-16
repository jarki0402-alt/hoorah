/** Final standings, awards and the GameResult for the shell. Pure. */
import type { GameAward, GameIcon, GameResult } from '@hoorah/sdk';
import type { RecordResult } from '../common/records';
import type { PlayerStats } from './logic';
import { STR } from './strings';

export interface Standing extends PlayerStats {
  rank: number;
  /** What the ranking is sorted by: score, or floors when playing solo. */
  points: number;
}

/** Best first; ties share a rank (1, 1, 3). Join order breaks display ties. */
export function rankStandings(stats: readonly PlayerStats[], solo: boolean): Standing[] {
  const rows = stats.map((s, i) => ({ s, i, points: solo ? s.floors : s.score }));
  rows.sort((a, b) => b.points - a.points || a.i - b.i);
  const out: Standing[] = [];
  for (let k = 0; k < rows.length; k++) {
    const r = rows[k]!;
    const prev = out[k - 1];
    const rank = prev && prev.points === r.points ? prev.rank : k + 1;
    out.push({ ...r.s, rank, points: r.points });
  }
  return out;
}

interface AwardDef {
  title: string;
  icon: GameIcon;
  metric: (s: PlayerStats) => number;
  min: number;
  desc: (v: number) => string;
}

const MAIN_AWARDS: AwardDef[] = [
  { title: STR.awardArchitect, icon: 'crown', metric: (s) => s.floors, min: 1, desc: STR.awardArchitectDesc },
  { title: STR.awardCraftsman, icon: 'build', metric: (s) => s.pas, min: 1, desc: STR.awardCraftsmanDesc },
  { title: STR.awardSteady, icon: 'target', metric: (s) => s.bestStreak, min: 2, desc: STR.awardSteadyDesc },
];

/**
 * Awards spread so everyone gets one when possible: each main award goes to the best player who
 * has none yet; if nobody new qualifies it goes to the true leader. Collapsers without an award
 * get 'Pemberani', anyone else who built something gets 'Pekerja Keras'.
 */
export function pickAwards(stats: readonly PlayerStats[]): GameAward[] {
  const out: GameAward[] = [];
  const has = new Set<number>();
  for (const def of MAIN_AWARDS) {
    const ranked = stats
      .map((s, i) => ({ s, i, v: def.metric(s) }))
      .filter((r) => r.v >= def.min)
      .sort((a, b) => b.v - a.v || b.s.score - a.s.score || a.i - b.i);
    const pick = ranked.find((r) => !has.has(r.s.id)) ?? ranked[0];
    if (!pick) continue;
    has.add(pick.s.id);
    out.push({ playerId: pick.s.id, title: def.title, desc: def.desc(pick.v), icon: def.icon });
  }
  for (const s of stats) {
    if (has.has(s.id) || s.collapses < 1) continue;
    has.add(s.id);
    out.push({ playerId: s.id, title: STR.awardBrave, desc: STR.awardBraveDesc(s.collapses), icon: 'heart' });
  }
  for (const s of stats) {
    if (has.has(s.id) || s.floors < 1) continue;
    has.add(s.id);
    out.push({ playerId: s.id, title: STR.awardWorker, desc: STR.awardWorkerDesc(s.floors), icon: 'zap' });
  }
  return out;
}

/** Names of everyone sharing first place. */
export function leaders(standings: readonly Standing[], name: (id: number) => string): string[] {
  return standings.filter((s) => s.rank === 1).map((s) => name(s.id));
}

export function headline(
  standings: readonly Standing[],
  name: (id: number) => string,
  solo: boolean,
  best: number,
) {
  if (solo) return STR.finaleSolo(best);
  const top = leaders(standings, name);
  if (top.length === 1) return STR.finaleWinner(top[0]!);
  return STR.finaleTie(top);
}

/* ------------------------------------------------------------------ solo records */

export type RecordKind = 'first' | 'new' | 'tie' | 'short';

/** How this game's tallest tower compares with the stored record (see `submitRecord`). */
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

export interface ResultContext {
  solo: boolean;
  bestHeight: number;
  rounds: number;
  name: (id: number) => string;
  /** Solo with exactly one person: the record line replaces the subtitle. */
  record?: SoloRecord | null;
}

export function buildResult(stats: readonly PlayerStats[], ctx: ResultContext): GameResult {
  const standings = rankStandings(stats, ctx.solo);
  const first = standings[0];
  const subtitle =
    ctx.solo && ctx.record
      ? ctx.record.text
      : ctx.solo && first
        ? STR.resultSoloSubtitle(first.pas, first.bestStreak)
        : STR.resultSubtitle(ctx.bestHeight, ctx.rounds);
  return {
    title: headline(standings, ctx.name, ctx.solo, ctx.bestHeight),
    subtitle,
    ranking: standings.map((s) => ({
      playerId: s.id,
      score: s.points,
      rank: s.rank,
      label: STR.rankLabel(s.floors, s.pas, s.misses),
    })),
    awards: pickAwards(stats),
  };
}
