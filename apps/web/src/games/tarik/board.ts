/**
 * What the HUD shows, as plain facts: the Host's director reads them off the match, a far-away
 * main screen rebuilds them from published state. `hudFrom` turns either into the same HudState,
 * so both screens draw the broadcast HUD with one set of rules.
 */
import type { HudMember, HudState, Overlay, TeamHud } from './hud';
import { type Member, otherTeam, type Phase, type RoundReason, type TarikMatch, type Team } from './logic';
import { formatClock, formatRate, STR } from './strings';
import { FULL_RATE } from './views';

const GO_OVERLAY_MS = 800;
const HINT_MS = 12_000;
const URGENT_MS = 10_000;

export interface BoardFacts {
  phase: Phase;
  round: number;
  totalRounds: number;
  winsNeeded: number;
  wins: Record<Team, number>;
  suddenDeath: boolean;
  /** Ms left on the round clock (frozen between rounds). */
  timeLeft: number;
  /** Ms of game clock since the pull started; only meaningful during the pull. */
  sincePull: number;
  /** 3, 2, 1 during the countdown. */
  countValue: number;
  /** Rope position in [-1, 1], negative = toward Merah. */
  p: number;
  /** Real tap rate per connected player (taps/s). */
  rate: Record<Team, number>;
  teams: Record<Team, HudMember[]>;
  /** Connected players while the game waits for a second one; null when that overlay is off. */
  waiting: HudMember[] | null;
  history: readonly (Team | null)[];
  lastWinner: Team | null;
  lastReason: RoundReason;
  matchWinner: Team | null;
  /** Both teams are one round win away from the match. */
  decider: boolean;
}

const asHud = (m: Member, connected: boolean): HudMember => ({
  id: m.id,
  name: m.name,
  look: m.look,
  connected,
});

/** Facts of a live match at game time `t`; `shown` says whether a member looks connected. */
export function factsOf(match: TarikMatch, t: number, shown: (m: Member) => boolean): BoardFacts {
  const team = (side: Team): HudMember[] => match.roster(side).map((m) => asHud(m, shown(m)));
  const waiting =
    match.phase === 'waiting' && match.connectedCount() < 2
      ? match
          .allMembers()
          .filter((m) => m.connected)
          .map((m) => asHud(m, true))
      : null;
  return {
    phase: match.phase,
    round: match.round,
    totalRounds: match.totalRounds,
    winsNeeded: match.winsNeeded,
    wins: { red: match.wins.red, blue: match.wins.blue },
    suddenDeath: match.suddenDeath,
    timeLeft: match.timeLeft(),
    sincePull: match.phase === 'pull' ? Math.max(0, t - match.pullStart) : 0,
    countValue: match.countValue,
    p: match.p,
    rate: { red: match.teamRate('red'), blue: match.teamRate('blue') },
    teams: { red: team('red'), blue: team('blue') },
    waiting,
    history: [...match.history],
    lastWinner: match.lastWinner,
    lastReason: match.lastReason,
    matchWinner: match.matchWinner,
    decider: match.isDecider(),
  };
}

function teamHud(f: BoardFacts, team: Team): TeamHud {
  const rate = f.rate[team];
  return {
    team,
    members: f.teams[team],
    wins: f.wins[team],
    rate: formatRate(rate),
    segments: Math.min(10, Math.round((rate / FULL_RATE) * 10)),
  };
}

function leadText(p: number): string {
  const pct = Math.round(Math.abs(p) * 50);
  if (pct === 0) return STR.even;
  return STR.leadPercent(p < 0 ? 'red' : 'blue', pct);
}

function overlay(f: BoardFacts): Overlay {
  switch (f.phase) {
    case 'waiting':
      return f.waiting ? { kind: 'waiting', players: f.waiting } : { kind: 'none' };
    case 'countdown':
      return { kind: 'count', value: f.countValue, round: STR.roundOf(f.round, f.totalRounds) };
    case 'pull':
      return f.sincePull < GO_OVERLAY_MS ? { kind: 'go' } : { kind: 'none' };
    case 'roundEnd': {
      const w = f.lastWinner;
      const reason = !w ? STR.reasonDraw : f.lastReason === 'line' ? STR.reasonLine(w) : STR.reasonTime(w);
      return { kind: 'roundEnd', winner: w, reason };
    }
    case 'scoreboard': {
      const next = f.lastReason === 'draw' ? f.round : f.round + 1;
      return {
        kind: 'scoreboard',
        round: f.round,
        history: [...f.history],
        next: f.decider ? STR.boardFinal : STR.boardNext(next),
      };
    }
    case 'matchEnd':
    case 'done': {
      const w = f.matchWinner ?? 'red';
      return { kind: 'matchEnd', winner: w, score: STR.winScore(f.wins[w], f.wins[otherTeam(w)]) };
    }
  }
}

export function hudFrom(f: BoardFacts): HudState {
  const pulling = f.phase === 'pull';
  return {
    live: f.phase === 'countdown' || pulling || f.phase === 'roundEnd' || f.phase === 'scoreboard',
    roundLabel: STR.roundOf(f.round, f.totalRounds),
    suddenDeath: pulling && f.suddenDeath,
    timer: formatClock(f.timeLeft),
    urgent: pulling && f.timeLeft <= URGENT_MS,
    winsNeeded: f.winsNeeded,
    red: teamHud(f, 'red'),
    blue: teamHud(f, 'blue'),
    prompt: pulling,
    hint: pulling && f.history.length === 0 && f.sincePull < HINT_MS,
    lead: leadText(f.p),
    overlay: overlay(f),
  };
}

/** The side pulling harder right now (Merah on a tie), for the bigger '+N' floater. */
export const strongerOf = (force: Record<Team, number>): Team => (force.red >= force.blue ? 'red' : 'blue');
