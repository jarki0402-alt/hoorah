/** Phone controller views for Rusun. Pure builders; the driver decides who gets what. */
import type { ControllerView, ViewAction } from '@hoorah/protocol';
import type { BalanceZone, PlayerStats } from './logic';
import type { SoloRecord, Standing } from './results';
import { STR } from './strings';

const REACTIONS: ViewAction[] = [
  { id: 'cheer', label: STR.phoneCheer, style: 'yellow' },
  { id: 'boo', label: STR.phoneBoo, style: 'secondary' },
];

const AGAIN: ViewAction[] = [{ id: 'rematch', label: STR.phoneAgain, style: 'primary' }];
const REMATCH: ViewAction[] = [{ id: 'rematch', label: STR.phoneRematch, style: 'primary' }];

/** Deadline is server ms. No position indicator: players watch the crane on the main screen. */
export function turnView(floorNumber: number, deadline: number): ControllerView {
  return {
    kind: 'button',
    eyebrow: STR.phoneTurnEyebrow,
    title: STR.phoneTurnTitle(floorNumber),
    label: STR.phoneTurnLabel,
    hint: STR.phoneTurnHint,
    deadline: Math.round(deadline),
  };
}

export function watchView(
  currentId: number,
  currentName: string,
  height: number,
  zone: BalanceZone,
): ControllerView {
  return {
    kind: 'message',
    eyebrow: STR.phoneWaitEyebrow,
    title: currentName,
    avatarOf: currentId,
    stats: [
      { label: STR.phoneHeight, value: STR.phoneHeightValue(height) },
      { label: STR.phoneBalance, value: STR.balance[zone] },
    ],
    actions: REACTIONS,
  };
}

export function introView(round: number, rounds: number, firstName: string | null): ControllerView {
  return {
    kind: 'message',
    eyebrow: STR.phoneIntroEyebrow(round, rounds),
    title: STR.phoneIntroTitle,
    subtitle: firstName ? STR.introFirst(firstName) : STR.phoneNoPlayers,
    tone: 'neutral',
  };
}

/** Heads-up for whoever goes next while the crane fetches the floor. */
export function readyView(id: number): ControllerView {
  return {
    kind: 'message',
    eyebrow: STR.phoneNextEyebrow,
    title: STR.phoneIntroTitle,
    avatarOf: id,
    tone: 'warn',
  };
}

export function idleView(): ControllerView {
  return { kind: 'message', title: STR.phoneNoPlayers, tone: 'warn' };
}

export function missView(strikes: number, max: number): ControllerView {
  return {
    kind: 'result',
    tone: 'bad',
    title: STR.phoneMissTitle,
    subtitle: STR.phoneMissSub(strikes, max),
    chips: [STR.phoneMissChip(strikes, max)],
  };
}

export function toppedView(s: PlayerStats, height: number): ControllerView {
  return {
    kind: 'result',
    tone: 'win',
    title: STR.phoneToppedTitle,
    big: STR.popupPoints(3),
    subtitle: STR.phoneToppedSub(height),
    stats: ownStats(s),
  };
}

export function landView(pas: boolean, points: number, streak: number): ControllerView {
  return {
    kind: 'result',
    tone: 'good',
    title: pas ? STR.phonePas : STR.phoneLanded,
    big: STR.popupPoints(points),
    subtitle: pas ? STR.phonePasSub(streak) : STR.phoneLandSub,
  };
}

function ownStats(s: PlayerStats) {
  return [
    { label: STR.phoneFloors, value: String(s.floors) },
    { label: STR.phonePasCount, value: String(s.pas) },
  ];
}

export interface CollapseViewContext {
  lastRound: boolean;
  solo: boolean;
  height: number;
  collapserName: string;
  /** Overall leader(s) after the bonus, shown on the final collapse. */
  winnerName: string | null;
}

export function collapserView(s: PlayerStats, ctx: CollapseViewContext): ControllerView {
  const subtitle = ctx.solo
    ? STR.phoneSoloLoseSub(ctx.height)
    : ctx.lastRound
      ? STR.phoneLoseSubFinal(ctx.winnerName)
      : STR.phoneLoseSubNext;
  return {
    kind: 'result',
    tone: 'lose',
    title: STR.phoneLoseTitle,
    subtitle,
    stats: ownStats(s),
    ...(ctx.lastRound ? { actions: ctx.solo ? AGAIN : REMATCH } : {}),
  };
}

export function survivorView(s: PlayerStats, ctx: CollapseViewContext): ControllerView {
  return {
    kind: 'result',
    tone: 'win',
    title: STR.phoneWinTitle,
    big: STR.popupPoints(3),
    subtitle: STR.phoneWinSub(ctx.collapserName),
    stats: ownStats(s),
  };
}

export function finalView(
  s: Standing,
  solo: boolean,
  headline: string,
  record: SoloRecord | null = null,
): ControllerView {
  return {
    kind: 'result',
    tone: s.rank === 1 ? 'win' : 'neutral',
    title: solo ? headline : s.rank === 1 ? STR.phoneFinalWin : STR.phoneFinalRank(s.rank),
    // Solo: the headline already gives the tower height (warung included); a second, smaller
    // floor count next to the record line only confuses.
    ...(solo && record ? {} : { big: solo ? STR.phoneFinalSolo(s.floors) : STR.phoneFinalScore(s.score) }),
    subtitle: solo ? record?.text : STR.phoneFinalSub(headline),
    stats: [...ownStats(s), { label: STR.phoneBestStreak, value: String(s.bestStreak) }],
    actions: solo && record ? AGAIN : REMATCH,
  };
}
