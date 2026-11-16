/**
 * Controller views for every phase, built from match state only (pure, testable).
 */
import type { ControllerView } from '@hoorah/protocol';
import type { GameResult } from '@hoorah/sdk';
import { isCpu } from '../common/cpu';
import type { KarungMatch, Racer } from './logic';
import { formatClock, formatRate, STR } from './strings';

export function waitingView(match: KarungMatch, id: number): ControllerView {
  const enough = match.connectedCount() >= 2;
  return {
    kind: 'message',
    eyebrow: STR.gameTitle,
    title: enough ? STR.phoneReadyTitle : STR.phoneWaitingTitle,
    subtitle: enough ? STR.phoneReadySubtitle : STR.phoneWaitingSubtitle,
    tone: enough ? 'neutral' : 'warn',
    avatarOf: id,
  };
}

function spectatorView(match: KarungMatch, id: number): ControllerView {
  return {
    kind: 'message',
    eyebrow: STR.raceOf(match.race, match.totalRaces),
    title: STR.spectatorTitle,
    subtitle: STR.spectatorSubtitle,
    tone: 'neutral',
    avatarOf: id,
  };
}

export function countdownView(match: KarungMatch, r: Racer): ControllerView {
  const subtitle =
    match.race === 1
      ? STR.countdownFirst
      : match.isFinalRace()
        ? STR.countdownFinal
        : STR.countdownNext(match.race);
  return {
    kind: 'countdown',
    value: String(Math.max(1, match.countValue)),
    title: STR.countdownTitle((r.lane ?? 0) + 1),
    subtitle,
    color: r.color,
    opponents: match
      .field()
      .filter((o) => o.id !== r.id && o.connected)
      .map((o) => o.id),
    // Phones only know room players, so computer opponents' looks travel along.
    guests: match
      .field()
      .filter((o) => isCpu(o.id))
      .map((o) => ({ id: o.id, name: o.name, fruit: o.fruit, color: o.color })),
  };
}

/** One status line: tumbling, leading, or place and metres to go. */
export function statusLine(match: KarungMatch, r: Racer, server: number): string {
  if (match.stumbling(r.id, server)) return STR.statusStumble;
  const total = match.field().length;
  const place = match.placeOf(r.id);
  if (place === 1 && r.dist > 0) return STR.statusLead(total);
  return STR.statusPlace(place, total, STR.meters(match.tuning.trackLength - r.dist));
}

export function tapView(match: KarungMatch, r: Racer, server: number): ControllerView {
  return {
    kind: 'tap',
    teamName: STR.lane((r.lane ?? 0) + 1),
    teamColor: r.color,
    label: STR.label,
    round: STR.phoneRace(match.race, formatClock(match.elapsed())),
    ring: { start: match.anchor, period: match.tuning.beatMs },
    rate: formatRate(match.tapRate(r.id, server)),
    power: Math.round(Math.min(1, r.dist / match.tuning.trackLength) * 100) / 100,
    combo: match.streakOf(r.id, server),
    lead: statusLine(match, r, server),
  };
}

function finishedView(match: KarungMatch, r: Racer): ControllerView {
  return {
    kind: 'message',
    eyebrow: STR.finishedEyebrow(match.race),
    title: STR.finishedTitle(match.placeOf(r.id)),
    subtitle: STR.finishedSubtitle,
    tone: 'good',
    avatarOf: r.id,
    stats: raceStats(r),
  };
}

function raceStats(r: Racer) {
  return [
    { label: STR.statOnBeat, value: String(r.raceOnBeat) },
    { label: STR.statSupers, value: String(r.raceSupers) },
    { label: STR.statStumbles, value: String(r.raceStumbles) },
  ];
}

export function raceDoneView(match: KarungMatch, r: Racer): ControllerView {
  const place = r.place ?? match.placeOf(r.id);
  return {
    kind: 'message',
    eyebrow: STR.raceDoneEyebrow(match.race),
    title: STR.raceDoneTitle(place),
    subtitle: STR.raceDoneSubtitle(r.racePoints, r.points),
    tone: place === 1 ? 'good' : place === 2 || place === 3 ? 'neutral' : 'bad',
    avatarOf: r.id,
    stats: raceStats(r),
  };
}

export function resultView(r: Racer, result: GameResult): ControllerView {
  const entry = result.ranking.find((x) => x.playerId === r.id);
  const rank = entry?.rank ?? result.ranking.length;
  const chips = (result.awards ?? []).filter((a) => a.playerId === r.id).map((a) => a.title);
  return {
    kind: 'result',
    tone: rank === 1 ? 'win' : 'lose',
    title: rank === 1 ? STR.resultWinTitle : STR.resultPlaceTitle(rank),
    subtitle: STR.resultSubtitle(r.points, r.wins),
    stats: [
      { label: STR.statPoints, value: String(r.points) },
      { label: STR.statSupers, value: String(r.supers) },
      { label: STR.statStreak, value: `x${r.maxStreak}` },
    ],
    ...(chips.length ? { chips } : {}),
  };
}

/** What a given phone should show right now (used for periodic updates and reconnects). */
export function viewFor(
  match: KarungMatch,
  id: number,
  server: number,
  result: GameResult | null,
): ControllerView | null {
  const r = match.racer(id);
  if (!r) return null;
  switch (match.phase) {
    case 'waiting':
      return waitingView(match, id);
    case 'countdown':
      return r.lane === null ? spectatorView(match, id) : countdownView(match, r);
    case 'race':
      if (r.lane === null) return spectatorView(match, id);
      return r.finishAt === null ? tapView(match, r, server) : finishedView(match, r);
    case 'raceEnd':
    case 'standings':
      return r.lane === null || r.place === null ? spectatorView(match, id) : raceDoneView(match, r);
    case 'matchEnd':
    case 'done':
      if (result) return resultView(r, result);
      return r.place === null ? spectatorView(match, id) : raceDoneView(match, r);
  }
}
