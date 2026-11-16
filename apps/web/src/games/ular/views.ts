/** Phone controller views for Ular Tangga. Pure builders; the driver decides who gets what. */
import type { ControllerView, ViewAction, ViewStat } from '@hoorah/protocol';
import type { CardId, MovePlan, PlayerStats, Standing } from './logic';
import { CARD_TEXT, STR } from './strings';

const REACTIONS: ViewAction[] = [
  { id: 'cheer', label: STR.phoneCheer, style: 'yellow' },
  { id: 'boo', label: STR.phoneBoo, style: 'secondary' },
];

const REMATCH: ViewAction[] = [{ id: 'rematch', label: STR.phoneRematch, style: 'primary' }];

export interface Mine {
  pos: number;
  rank: number;
  total: number;
}

function mineStats(m: Mine): ViewStat[] {
  return [
    { label: STR.phonePos, value: STR.phonePosValue(m.pos) },
    { label: STR.phoneRank, value: STR.phoneRankValue(m.rank, m.total) },
  ];
}

export function introView(size: number, firstName: string | null): ControllerView {
  return {
    kind: 'message',
    eyebrow: STR.phoneIntroEyebrow(size),
    title: STR.phoneIntroTitle,
    subtitle: firstName ? STR.introFirst(firstName) : STR.phoneNoPlayers,
    tone: 'neutral',
  };
}

/** Your turn: one big LEMPAR button. `deadline` is server ms (auto-roll). */
export function rollView(pos: number, last: number, deadline: number, extra: boolean): ControllerView {
  return {
    kind: 'button',
    eyebrow: extra ? STR.phoneRollEyebrowExtra : STR.phoneRollEyebrow,
    title: STR.phoneRollTitle(pos, last),
    label: STR.phoneRollLabel,
    hint: STR.phoneRollHint,
    deadline: Math.round(deadline),
  };
}

export function watchView(currentId: number, currentName: string, mine: Mine): ControllerView {
  return {
    kind: 'message',
    eyebrow: STR.phoneWaitEyebrow,
    title: currentName,
    avatarOf: currentId,
    stats: mineStats(mine),
    actions: REACTIONS,
  };
}

/** Heads-up for whoever goes next. */
export function nextView(id: number, mine: Mine): ControllerView {
  return {
    kind: 'message',
    eyebrow: STR.phoneNextEyebrow,
    title: STR.phoneIntroTitle,
    avatarOf: id,
    tone: 'warn',
    stats: mineStats(mine),
  };
}

export function idleView(): ControllerView {
  return { kind: 'message', title: STR.phoneNoPlayers, tone: 'warn' };
}

/** The roller while the dice tumble and the token hops. */
export function movingView(id: number, dice: number): ControllerView {
  return {
    kind: 'message',
    eyebrow: STR.phoneMovingEyebrow,
    title: STR.phoneMovingTitle(dice),
    subtitle: STR.phoneMovingSub,
    avatarOf: id,
    tone: 'neutral',
  };
}

/** After a ladder, a snake or a blocked bite. Null when the move was plain. */
export function landView(plan: MovePlan): ControllerView | null {
  if (plan.jump?.kind === 'ladder') {
    return {
      kind: 'result',
      tone: 'good',
      title: STR.phoneLadder,
      big: STR.phoneLanded(plan.to),
      subtitle: STR.phoneLadderSub(plan.jump.from, plan.jump.to),
    };
  }
  if (plan.jump?.kind === 'snake') {
    return {
      kind: 'result',
      tone: 'bad',
      title: STR.phoneSnake,
      big: STR.phoneLanded(plan.to),
      subtitle: STR.phoneSnakeSub(plan.jump.from, plan.jump.to),
    };
  }
  if (plan.blocked) {
    return {
      kind: 'result',
      tone: 'good',
      title: STR.phoneBlocked,
      big: STR.phoneLanded(plan.to),
      subtitle: STR.phoneBlockedSub,
    };
  }
  return null;
}

export function cardView(card: CardId): ControllerView {
  const c = CARD_TEXT[card];
  return {
    kind: 'result',
    tone: c.good ? 'good' : 'bad',
    title: c.title,
    big: c.effect,
    subtitle: c.text,
    chips: [STR.phoneCardEyebrow],
  };
}

export function skipView(): ControllerView {
  return { kind: 'result', tone: 'bad', title: STR.phoneSkipTitle, subtitle: STR.phoneSkipSub };
}

export function duelCountView(
  value: number,
  color: string,
  opponentId: number,
  opponentName: string,
): ControllerView {
  return {
    kind: 'countdown',
    value: String(value),
    title: STR.phoneDuelCount,
    subtitle: STR.phoneDuelVs(opponentName),
    color,
    opponents: [opponentId],
  };
}

export function duelTapView(
  color: string,
  opponentName: string,
  secs: number,
  me: number,
  them: number,
  rate: number,
): ControllerView {
  return {
    kind: 'tap',
    teamName: STR.phoneDuelTeam,
    teamColor: color,
    label: STR.duelGo,
    round: STR.phoneDuelRound(opponentName, secs),
    rate: rate.toFixed(1).replace('.', ','),
    power: Math.round(Math.min(1, rate / 10) * 100) / 100,
    lead: STR.phoneDuelLead(me, them),
  };
}

export function duelWatchView(a: number, aName: string, bName: string, mine: Mine): ControllerView {
  return {
    kind: 'message',
    eyebrow: STR.phoneDuelEyebrow,
    title: STR.phoneDuelWatch(aName, bName),
    subtitle: STR.phoneDuelWatchSub,
    avatarOf: a,
    tone: 'warn',
    stats: mineStats(mine),
    actions: REACTIONS,
  };
}

export function duelResultView(
  outcome: 'win' | 'lose' | 'tie',
  me: number,
  them: number,
  opponentName: string,
  back: number,
): ControllerView {
  if (outcome === 'tie') {
    return {
      kind: 'result',
      tone: 'neutral',
      title: STR.phoneDuelTie,
      big: STR.phoneDuelScore(me, them),
      subtitle: STR.phoneDuelTieSub,
    };
  }
  const won = outcome === 'win';
  return {
    kind: 'result',
    tone: won ? 'win' : 'lose',
    title: won ? STR.phoneDuelWin : STR.phoneDuelLose,
    big: STR.phoneDuelScore(me, them),
    subtitle: won ? STR.phoneDuelWinSub(opponentName, back) : STR.phoneDuelLoseSub(back),
  };
}

function ownStats(s: PlayerStats): ViewStat[] {
  return [
    { label: STR.phoneLadders, value: String(s.ladders) },
    { label: STR.phoneSnakes, value: String(s.snakes) },
    { label: STR.phoneDuels, value: String(s.duelsWon) },
  ];
}

export function finalView(s: Standing, headline: string): ControllerView {
  return {
    kind: 'result',
    tone: s.rank === 1 ? 'win' : 'neutral',
    title: s.rank === 1 ? STR.phoneFinalWin : STR.phoneFinalRank(s.rank),
    big: s.finished ? STR.rankFinished : STR.phonePosValue(s.pos),
    subtitle: STR.phoneFinalSub(headline),
    stats: ownStats(s.stats),
    actions: REMATCH,
  };
}
