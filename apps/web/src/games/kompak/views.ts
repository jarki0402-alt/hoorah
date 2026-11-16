/**
 * Declarative phone screens for each phase. Pure: derived from the match only, so the driver can
 * recompute them at any time (e.g. when a phone reconnects) and send only what changed.
 */

import type { ControllerView } from '@hoorah/protocol';
import { coopTitle, type KompakMatch } from './logic';
import { formatNumber, LETTERS, STR } from './strings';

export interface OptionColor {
  color: string;
  dark: string;
}

/** Option colours A–D, shared by the main screen cards and phone buttons (ink text on all). */
export const OPTION_COLORS: readonly OptionColor[] = [
  { color: '#FF8A3D', dark: '#C25A1C' },
  { color: '#3FC489', dark: '#22875A' },
  { color: '#FFC928', dark: '#C99A12' },
  { color: '#5AB4F0', dark: '#2C80BA' },
];

/** Displayed option index from a phone action id ('A'..'D'); -1 if not an option. */
export function optionIndex(id: string | undefined): number {
  if (!id) return -1;
  return (LETTERS as readonly string[]).indexOf(id.trim().toUpperCase());
}

export function viewFor(match: KompakMatch, playerId: number, now: number): ControllerView | null {
  const rec = match.record(playerId);
  if (!rec?.present) return null;
  const n = match.round + 1;
  const total = match.total;
  const q = match.prompt;
  const coop = match.coop;

  switch (match.phase) {
    case 'start':
      return {
        kind: 'message',
        eyebrow: STR.phoneStartEyebrow,
        title: STR.phoneStartTitle,
        subtitle: coop ? STR.phoneStartCoop(total) : STR.phoneStartGroup(total),
        avatarOf: playerId,
        tone: 'neutral',
      };

    case 'intro':
      return {
        kind: 'message',
        eyebrow: STR.questionOf(n, total),
        title: q.category,
        subtitle: STR.phoneIntroText,
        avatarOf: playerId,
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
          options: q.options.map((label, i) => ({
            id: LETTERS[i]!,
            label,
            color: OPTION_COLORS[i]!.color,
            dark: OPTION_COLORS[i]!.dark,
          })),
        };
      }
      return {
        kind: 'locked',
        label: q.options[mine.option] ?? '',
        key: LETTERS[mine.option] ?? '',
        color: OPTION_COLORS[mine.option]!.color,
        dark: OPTION_COLORS[mine.option]!.dark,
        title: STR.lockedTitle,
        chips: [coop ? STR.lockedChipCoop : STR.lockedChipGroup],
        waitingFor: match.waitingFor(),
      };
    }

    case 'reveal': {
      const o = match.outcomeOf(playerId);
      const result = match.result;
      if (!o || !result) {
        return {
          kind: 'message',
          eyebrow: STR.questionOf(n, total),
          title: STR.spectatorRevealTitle,
          subtitle: STR.spectatorRevealText,
          avatarOf: playerId,
          tone: 'neutral',
        };
      }
      const label = o.option !== null ? (q.options[o.option] ?? '') : '';
      const top = result.winners[0];
      const topLine = top !== undefined ? STR.resultTopPick(q.options[top] ?? '') : STR.resultNoTop;
      const stats =
        result.mode === 'sehati'
          ? [
              { label: STR.statMeter, value: STR.meterValue(match.coopPercent) },
              { label: STR.statKompak, value: STR.statKompakValue(match.coopHits, match.coopRounds) },
            ]
          : [
              {
                label: STR.statRank,
                value: STR.statRankValue(match.rankOf(playerId)?.rank ?? 1, match.roster.length),
              },
              { label: STR.statKompak, value: STR.statKompakValue(rec.hits, rec.played) },
            ];
      switch (o.kind) {
        case 'kompak': {
          const chips = [STR.chipKompak(o.points - o.bonus)];
          if (o.bonus > 0) chips.push(STR.chipAll(o.bonus));
          return {
            kind: 'result',
            tone: 'good',
            title: o.bonus > 0 ? STR.resultAll : STR.resultKompak,
            big: `+${formatNumber(o.points)}`,
            subtitle: STR.resultYourPick(label, result.counts[o.option ?? 0] ?? 1),
            chips,
            stats,
          };
        }
        case 'sehati':
          return {
            kind: 'result',
            tone: 'good',
            title: STR.resultSehati,
            big: `+${formatNumber(o.points)}`,
            subtitle: STR.resultBothPick(label),
            chips: [STR.chipSehati(o.points)],
            stats,
          };
        case 'apart': {
          const partner = result.outcomes.find((x) => x.playerId !== playerId);
          const theirs = partner?.option != null ? (q.options[partner.option] ?? '') : '';
          return {
            kind: 'result',
            tone: 'bad',
            title: STR.resultApart,
            big: '+0',
            subtitle: theirs ? STR.resultPartnerPick(theirs) : STR.resultYourPick(label, 1),
            stats,
          };
        }
        case 'alone':
        case 'minority':
          return {
            kind: 'result',
            tone: 'bad',
            title: o.kind === 'alone' ? STR.resultAlone : STR.resultMinority,
            big: '+0',
            subtitle: o.kind === 'alone' ? STR.resultYourPick(label, 1) : topLine,
            stats,
          };
        case 'solo':
          return {
            kind: 'result',
            tone: 'neutral',
            title: STR.resultSolo,
            big: '+0',
            subtitle: STR.resultSoloText,
          };
        default:
          return {
            kind: 'result',
            tone: 'bad',
            title: STR.resultMissed,
            big: '+0',
            subtitle: topLine,
            stats,
          };
      }
    }

    case 'final':
    case 'ended': {
      if (coop && match.coopRounds > 0) {
        const pct = match.coopPercent;
        const t = coopTitle(pct);
        return {
          kind: 'result',
          tone: pct >= 50 ? 'win' : 'neutral',
          title: t.title,
          big: STR.meterValue(pct),
          subtitle: t.text,
          stats: [
            { label: STR.statKompak, value: STR.statKompakValue(match.coopHits, match.coopRounds) },
            { label: STR.finalTotal, value: formatNumber(rec.score) },
          ],
        };
      }
      const rank = match.rankOf(playerId)?.rank ?? 1;
      const win = rank === 1 && rec.score > 0;
      return {
        kind: 'result',
        tone: win ? 'win' : 'lose',
        title: win ? STR.finalWin : STR.finalRank(rank),
        big: formatNumber(rec.score),
        subtitle: STR.finalTotal,
        stats: [
          { label: STR.statRank, value: STR.statRankValue(rank, match.roster.length) },
          { label: STR.statKompak, value: STR.statKompakValue(rec.hits, rec.played) },
        ],
      };
    }
  }
}
