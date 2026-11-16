/** Phone controller views for Congklak. Pure builders; the driver decides who gets what. */
import type { ControllerView, ViewAction, ViewStat } from '@hoorah/protocol';
import { holeNumber } from './logic';
import { STR } from './strings';

const REACTIONS: ViewAction[] = [
  { id: 'cheer', label: STR.phoneCheer, style: 'yellow' },
  { id: 'boo', label: STR.phoneBoo, style: 'secondary' },
];

const REMATCH: ViewAction[] = [{ id: 'rematch', label: STR.phoneRematch, style: 'primary' }];

/** Hole buttons are light wood; the controller theme turns their number disc into a carved hole. */
const HOLE_COLOR = '#F2C98E';
const HOLE_DARK = '#9C5F2A';

/** Store counts of both sides, the viewer's own side first when known. */
export interface ScoreLine {
  labels: [string, string];
  stores: [number, number];
}

function scoreStats(s: ScoreLine, mySide: 0 | 1 | null): ViewStat[] {
  const order: (0 | 1)[] = mySide === 1 ? [1, 0] : [0, 1];
  return order.map((i) => ({ label: STR.phoneStore(s.labels[i]), value: STR.seeds(s.stores[i]) }));
}

/**
 * Your turn: one button per hole you may pick (empty holes are left out), hole 1 … 7.
 * The action is `answer` with the hole number as value.
 */
export function turnView(
  holes: { pos: number; seeds: number }[],
  deadline: number,
  extra: boolean,
  team: string | null,
): ControllerView {
  return {
    kind: 'choice',
    title: extra ? STR.phoneExtraTitle : STR.phoneTurnTitle,
    prompt: STR.phoneTurnPrompt(team),
    deadline: Math.round(deadline),
    options: holes.map((h) => ({
      id: String(holeNumber(h.pos)),
      label: STR.seeds(h.seeds),
      color: HOLE_COLOR,
      dark: HOLE_DARK,
    })),
  };
}

export function watchView(
  moverId: number | null,
  moverName: string,
  sideName: string,
  teamMode: boolean,
  teammate: boolean,
  scores: ScoreLine,
  mySide: 0 | 1 | null,
): ControllerView {
  if (moverId === null) {
    return {
      kind: 'message',
      eyebrow: STR.phoneWaitEyebrow,
      title: STR.phoneAutoTitle,
      subtitle: STR.phoneAutoSub(sideName),
      tone: 'neutral',
      stats: scoreStats(scores, mySide),
      actions: REACTIONS,
    };
  }
  return {
    kind: 'message',
    eyebrow: teammate ? STR.phoneTeamEyebrow : STR.phoneWaitEyebrow,
    title: moverName,
    avatarOf: moverId,
    subtitle: teamMode ? STR.phoneWaitSub(sideName) : STR.phoneWaitSolo,
    stats: scoreStats(scores, mySide),
    actions: REACTIONS,
  };
}

/** While seeds travel. The mover sees their own avatar. */
export function sowingView(
  moverId: number | null,
  mine: boolean,
  moverName: string,
  scores: ScoreLine,
  mySide: 0 | 1 | null,
): ControllerView {
  return {
    kind: 'message',
    eyebrow: STR.phoneSowingEyebrow,
    title: mine ? STR.phoneSowingMine : moverId === null ? STR.phoneAutoTitle : moverName,
    ...(moverId !== null ? { avatarOf: moverId } : {}),
    subtitle: STR.phoneSowingSub,
    stats: scoreStats(scores, mySide),
    ...(mine ? {} : { actions: REACTIONS }),
  };
}

export function introView(
  round: number,
  rounds: number,
  team: string | null,
  mySide: 0 | 1 | null,
  first: string,
): ControllerView {
  return {
    kind: 'message',
    eyebrow: STR.phoneIntroEyebrow(round, rounds),
    title: team ? STR.phoneIntroTeam(team) : STR.phoneIntroSolo,
    subtitle: mySide === null ? STR.introFirst(first) : STR.phoneIntroWhere(mySide === 0),
    tone: 'neutral',
  };
}

export function idleView(): ControllerView {
  return { kind: 'message', title: STR.phoneNoPlayers, tone: 'warn' };
}

export function roundEndView(
  round: number,
  outcome: 'win' | 'lose' | 'tie',
  mine: number,
  opp: number,
): ControllerView {
  return {
    kind: 'result',
    tone: outcome === 'win' ? 'win' : outcome === 'lose' ? 'lose' : 'neutral',
    title:
      outcome === 'win'
        ? STR.phoneRoundWin(round)
        : outcome === 'lose'
          ? STR.phoneRoundLose(round)
          : STR.phoneRoundTie(round),
    big: STR.seeds(mine),
    subtitle: STR.phoneRoundSub(opp, round + 1),
  };
}

export interface OwnStats {
  captured: number;
  extras: number;
  longest: number;
}

export function finalView(
  outcome: 'win' | 'lose' | 'tie',
  mine: number,
  opp: number,
  s: OwnStats | null,
): ControllerView {
  return {
    kind: 'result',
    tone: outcome === 'win' ? 'win' : outcome === 'lose' ? 'lose' : 'neutral',
    title:
      outcome === 'win' ? STR.phoneFinalWin : outcome === 'lose' ? STR.phoneFinalLose : STR.phoneFinalTie,
    big: STR.seeds(mine),
    subtitle: STR.phoneFinalSub(opp),
    ...(s
      ? {
          stats: [
            { label: STR.phoneStatCaptures, value: STR.seeds(s.captured) },
            { label: STR.phoneStatExtras, value: `${s.extras}x` },
            { label: STR.phoneStatLongest, value: STR.seeds(s.longest) },
          ],
        }
      : {}),
    actions: REMATCH,
  };
}
