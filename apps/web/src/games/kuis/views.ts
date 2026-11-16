/**
 * Declarative phone screens for each phase. Pure: derived from the match only, so the driver
 * can recompute them at any time (e.g. when a phone reconnects) and send only what changed.
 */

import type { ControllerView } from '@hoorah/protocol';
import { computeAwards, type KuisMatch, SCORING, type SoloRecord } from './logic';
import { formatNumber, formatSeconds, LETTERS, STR } from './strings';

export interface OptionColor {
  color: string;
  dark: string;
}

/** Answer colors A–D, shared by TV tiles and phone buttons. */
export const OPTION_COLORS: readonly OptionColor[] = [
  { color: '#FF8A3D', dark: '#C9601E' },
  { color: '#5AA9FF', dark: '#2F7FD6' },
  { color: '#FFC928', dark: '#C99A12' },
  { color: '#2DD4BF', dark: '#15A08F' },
];

/** Displayed option index from a phone action id ('A'..'D'); -1 if not an option. */
export function optionIndex(id: string | undefined): number {
  if (!id) return -1;
  return (LETTERS as readonly string[]).indexOf(id.trim().toUpperCase());
}

function streakMeter(streak: number): { done: number; total: number; label: string } {
  const total = SCORING.doubleFrom;
  if (streak <= 0) return { done: 0, total, label: STR.streakBroken };
  if (streak >= total) return { done: total, total, label: STR.streakHot };
  return { done: streak, total, label: STR.streakNeed(total - streak) };
}

/**
 * The view a given player should see right now, or null if they are unknown to the match.
 * `record` is the solo record line, once a solo match has reached its final card.
 */
export function viewFor(
  match: KuisMatch,
  playerId: number,
  now: number,
  record: SoloRecord | null = null,
): ControllerView | null {
  const rec = match.record(playerId);
  if (!rec?.present) return null;
  const n = match.round + 1;
  const total = match.total;
  const q = match.question;

  switch (match.phase) {
    case 'start':
      return {
        kind: 'message',
        eyebrow: STR.phoneStartEyebrow,
        title: STR.phoneStartTitle,
        subtitle: STR.phoneStartText(total),
        avatarOf: playerId,
        tone: 'neutral',
      };

    case 'intro':
      return {
        kind: 'message',
        eyebrow: STR.questionOf(n, total),
        title: q.category,
        subtitle: STR.phoneIntroText,
        tone: 'neutral',
      };

    case 'question': {
      if (!match.isParticipant(playerId)) {
        return {
          kind: 'message',
          eyebrow: STR.questionOf(n, total),
          title: STR.spectatorTitle,
          subtitle: STR.spectatorText,
          avatarOf: playerId,
          tone: 'neutral',
        };
      }
      const mine = match.answers.get(playerId);
      if (!mine) {
        return {
          kind: 'choice',
          title: STR.questionOf(n, total),
          prompt: q.q,
          progress: { done: match.round, total },
          deadline: Math.round(match.deadlineServer(now)),
          streak: rec.streak,
          options: q.options.map((label, i) => ({
            id: LETTERS[i]!,
            label,
            color: OPTION_COLORS[i]!.color,
            dark: OPTION_COLORS[i]!.dark,
          })),
        };
      }
      const chips = [STR.seconds(formatSeconds(mine.timeMs))];
      if (match.participants.length > 1 && match.fastestAnswer() === playerId) chips.push(STR.fastestSoFar);
      return {
        kind: 'locked',
        label: q.options[mine.option] ?? '',
        key: LETTERS[mine.option] ?? '',
        color: OPTION_COLORS[mine.option]!.color,
        dark: OPTION_COLORS[mine.option]!.dark,
        title: STR.lockedTitle,
        chips,
        waitingFor: match.waitingFor(),
      };
    }

    case 'reveal': {
      const outcome = match.outcomes.find((o) => o.playerId === playerId);
      if (!outcome) {
        return {
          kind: 'message',
          eyebrow: STR.questionOf(n, total),
          title: STR.spectatorRevealTitle,
          subtitle: STR.spectatorRevealText,
          avatarOf: playerId,
          tone: 'neutral',
        };
      }
      const rank = match.rankOf(playerId);
      const stats = [
        match.solo
          ? { label: STR.finalTotal, value: formatNumber(rec.score) }
          : { label: STR.statRank, value: STR.statRankValue(rank?.rank ?? 1, match.roster.length) },
        { label: STR.statStreak, value: STR.statStreakValue(rec.streak) },
      ];
      const s = outcome.score;
      if (s.correct) {
        const chips = [STR.chipBase(s.base), STR.chipSpeed(s.speed)];
        if (s.streakBonus > 0) chips.push(STR.chipStreak(s.streakBonus));
        if (s.doubled) chips.push(STR.chipDouble);
        return {
          kind: 'result',
          tone: 'good',
          title: STR.resultCorrect,
          big: `+${formatNumber(s.total)}`,
          chips,
          stats,
          streak: streakMeter(rec.streak),
        };
      }
      return {
        kind: 'result',
        tone: 'bad',
        title: outcome.option === null ? STR.resultMissed : STR.resultWrong,
        big: '+0',
        subtitle: STR.resultAnswer(LETTERS[q.answer] ?? '', q.options[q.answer] ?? ''),
        stats,
        streak: streakMeter(rec.streak),
      };
    }

    case 'final':
    case 'ended': {
      const rank = match.rankOf(playerId)?.rank ?? 1;
      const awards = computeAwards(match.awardStats()).filter((a) => a.playerId === playerId);
      if (match.solo && record) {
        return {
          kind: 'result',
          tone: record.isNew ? 'win' : 'good',
          title: STR.phoneSoloDone,
          big: formatNumber(rec.score),
          subtitle: record.text,
          chips: awards.map((a) => a.title),
          stats: [
            { label: STR.statCorrect, value: STR.statCorrectValue(rec.correct, rec.asked) },
            { label: STR.statBestStreak, value: String(rec.bestStreak) },
          ],
        };
      }
      return {
        kind: 'result',
        tone: rank === 1 ? 'win' : 'lose',
        title: rank === 1 ? STR.finalWin : STR.finalRank(rank),
        big: formatNumber(rec.score),
        subtitle: STR.finalTotal,
        chips: awards.map((a) => a.title),
        stats: [
          { label: STR.statRank, value: STR.statRankValue(rank, match.roster.length) },
          { label: STR.statCorrect, value: STR.statCorrectValue(rec.correct, rec.asked) },
          { label: STR.statBestStreak, value: String(rec.bestStreak) },
        ],
      };
    }
  }
}
