/**
 * Controller views for every phase, built from match state only (pure, testable).
 */
import type { ControllerView, GuestPlayer } from '@hoorah/protocol';
import type { GameResult } from '@hoorah/sdk';
import { isCpu } from '../common/cpu';
import { type Member, otherTeam, type TarikMatch, type Team } from './logic';
import { formatClock, formatRate, STR } from './strings';

export const TEAM_COLOR: Record<Team, string> = { red: '#F2453D', blue: '#2F8CFF' };

/** Phone meters treat 10 taps/s as full power. */
export const FULL_RATE = 10;

function opponents(match: TarikMatch, team: Team): number[] {
  return match
    .roster(otherTeam(team))
    .filter((m) => m.connected)
    .map((m) => m.id);
}

/** Computer opponents on the other team: phones only know room players, so their looks travel along. */
function guests(match: TarikMatch, team: Team): GuestPlayer[] {
  return match
    .roster(otherTeam(team))
    .filter((m) => isCpu(m.id))
    .map((m) => ({ id: m.id, name: m.name, fruit: m.fruit, look: m.look, color: m.color }));
}

export function waitingView(match: TarikMatch, id: number): ControllerView {
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

function countdownSubtitle(match: TarikMatch, team: Team): string {
  if (match.history.length === 0) return STR.countdownFirst;
  if (match.isDecider()) return STR.countdownFinal;
  const last = match.history[match.history.length - 1];
  if (last === null || last === undefined) return STR.countdownDraw;
  return last === team ? STR.countdownWon(match.history.length) : STR.countdownLost(match.history.length);
}

export function countdownView(match: TarikMatch, m: Member & { team: Team }): ControllerView {
  return {
    kind: 'countdown',
    value: String(Math.max(1, match.countValue)),
    title: STR.teamUpper(m.team),
    subtitle: countdownSubtitle(match, m.team),
    color: TEAM_COLOR[m.team],
    opponents: opponents(match, m.team),
    guests: guests(match, m.team),
  };
}

export function leadLabel(match: TarikMatch): string {
  const lead = match.leader();
  return lead ? STR.leadShort(lead) : STR.even;
}

export function tapView(match: TarikMatch, m: Member & { team: Team }, server: number): ControllerView {
  const rate = match.playerRate(m.id);
  return {
    kind: 'tap',
    teamName: STR.teamUpper(m.team),
    teamColor: TEAM_COLOR[m.team],
    label: STR.go,
    round: STR.phoneRound(match.round, formatClock(match.timeLeft())),
    ring: { start: match.ringStart, period: match.tuning.ringPeriodMs },
    rate: formatRate(rate),
    power: Math.round(Math.min(1, rate / FULL_RATE) * 100) / 100,
    combo: match.comboOf(m.id, server),
    lead: leadLabel(match),
  };
}

export function betweenView(match: TarikMatch, m: Member & { team: Team }): ControllerView {
  const winner = match.lastWinner;
  const won = winner === m.team;
  return {
    kind: 'message',
    eyebrow: STR.roundEyebrow(match.round),
    title: winner === null ? STR.betweenDraw : won ? STR.betweenWon : STR.betweenLost,
    subtitle: STR.betweenScore(match.wins.red, match.wins.blue),
    tone: winner === null ? 'neutral' : won ? 'good' : 'bad',
    avatarOf: m.id,
    stats: [
      { label: STR.statTaps, value: String(m.roundTaps) },
      { label: STR.statSupers, value: String(m.roundSupers) },
    ],
  };
}

export function resultView(
  match: TarikMatch,
  m: Member & { team: Team },
  result: GameResult,
): ControllerView {
  const winner = match.matchWinner ?? 'red';
  const won = m.team === winner;
  const chips = (result.awards ?? []).filter((a) => a.playerId === m.id).map((a) => a.title);
  return {
    kind: 'result',
    tone: won ? 'win' : 'lose',
    title: won ? STR.resultWinTitle(winner) : STR.resultLoseTitle,
    subtitle: won
      ? STR.winScore(match.wins[winner], match.wins[otherTeam(winner)])
      : STR.resultLoseSubtitle(m.team, match.wins[m.team], match.wins[winner]),
    stats: [
      { label: STR.statTaps, value: String(m.taps) },
      { label: STR.statSupers, value: String(m.supers) },
      { label: STR.statCombo, value: `x${m.maxCombo}` },
    ],
    chips: chips.length ? chips : [STR.teamLabel(m.team)],
  };
}

const hasTeam = (m: Member): m is Member & { team: Team } => m.team !== null;

/** What a given phone should show right now (used for periodic updates and reconnects). */
export function viewFor(
  match: TarikMatch,
  id: number,
  server: number,
  result: GameResult | null,
): ControllerView | null {
  const m = match.member(id);
  if (!m) return null;
  if (match.phase === 'waiting' || !hasTeam(m)) return waitingView(match, id);
  switch (match.phase) {
    case 'countdown':
      return countdownView(match, m);
    case 'pull':
      return tapView(match, m, server);
    case 'roundEnd':
    case 'scoreboard':
      return betweenView(match, m);
    case 'matchEnd':
    case 'done':
      return result ? resultView(match, m, result) : betweenView(match, m);
  }
}
