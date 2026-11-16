/** Phone controller views for Makan Kerupuk. Pure builders; the driver decides who gets what. */
import type { ControllerView, ViewAction } from '@hoorah/protocol';
import { BITES, type Placement, type PlayerStats, type RoundEndInfo, soloScore } from './logic';
import type { Standing } from './results';
import { STR } from './strings';

const REMATCH: ViewAction[] = [{ id: 'rematch', label: STR.phoneRematch, style: 'primary' }];
const AGAIN: ViewAction[] = [{ id: 'rematch', label: STR.phoneAgain, style: 'primary' }];

export interface BiteViewInput {
  round: number;
  rounds: number;
  bites: number;
  last: 'perfect' | 'bite' | null;
  /** Server time (ms) when the swing phase was 0, and its period. */
  start: number;
  period: number;
  zone: number;
}

/** GIGIT button with the player's own swing mirrored on the phone. */
export function biteView(v: BiteViewInput): ControllerView {
  return {
    kind: 'button',
    eyebrow: STR.phoneEyebrow(v.round, v.rounds),
    title: STR.phoneBiteTitle(v.bites, BITES, v.last),
    label: STR.phoneBiteLabel,
    hint: STR.phoneBiteHint,
    swing: {
      start: Math.round(v.start),
      period: Math.round(v.period * 100) / 100,
      zone: Math.round(v.zone * 1000) / 1000,
    },
  };
}

export function introView(id: number, round: number, rounds: number): ControllerView {
  return {
    kind: 'message',
    eyebrow: STR.phoneEyebrow(round, rounds),
    title: STR.phoneIntroTitle,
    subtitle: STR.phoneIntroSub,
    avatarOf: id,
    tone: 'neutral',
  };
}

export function chokeView(bites: number): ControllerView {
  return {
    kind: 'result',
    tone: 'bad',
    title: STR.phoneChokeTitle,
    big: STR.phoneChokeBig,
    subtitle: STR.phoneChokeSub,
    chips: [STR.phoneProgressChip(bites, BITES)],
  };
}

export function watchView(): ControllerView {
  return { kind: 'message', title: STR.phoneWatchTitle, subtitle: STR.phoneWatchSub, tone: 'neutral' };
}

export function idleView(): ControllerView {
  return { kind: 'message', title: STR.phoneNoPlayers, tone: 'warn' };
}

function ownStats(s: PlayerStats) {
  return [
    { label: STR.phoneScoreStat, value: String(s.score) },
    { label: STR.phonePerfectStat, value: String(s.perfect) },
  ];
}

export function roundEndView(
  p: Placement,
  info: RoundEndInfo,
  s: PlayerStats,
  winnerName: string | null,
): ControllerView {
  const won = info.finisher === p.id;
  const subtitle = won
    ? STR.phoneRoundWinSub(info.time ?? 0)
    : info.reason === 'finish' && winnerName
      ? STR.phoneRoundLoseSub(winnerName)
      : STR.phoneRoundTimeSub;
  return {
    kind: 'result',
    tone: won || (p.rank === 1 && p.bites > 0) ? 'win' : p.points > 0 ? 'good' : 'neutral',
    title: won ? STR.phoneRoundWin : STR.phoneRoundRank(p.rank),
    big: STR.placePoints(p.points),
    subtitle,
    chips: [STR.phoneProgressChip(p.bites, BITES)],
    stats: ownStats(s),
  };
}

export function finalView(s: Standing, headline: string): ControllerView {
  return {
    kind: 'result',
    tone: s.rank === 1 ? 'win' : s.score > 0 ? 'good' : 'neutral',
    title: s.rank === 1 ? STR.phoneFinalWin : STR.phoneFinalRank(s.rank),
    big: STR.phoneFinalScore(s.score),
    subtitle: headline,
    stats: [
      { label: STR.phoneBitesStat, value: String(s.bites) },
      { label: STR.phonePerfectStat, value: String(s.perfect) },
      { label: STR.phoneChokeStat, value: String(s.chokes) },
    ],
    actions: REMATCH,
  };
}

/* ------------------------------------------------------------------ solo (score attack) */

function soloStats(s: PlayerStats) {
  return [
    { label: STR.phoneSoloScoreStat, value: STR.soloScore(soloScore(s)) },
    { label: STR.phonePerfectStat, value: String(s.perfect) },
  ];
}

/** Round result for a lone player: points this round instead of a placement. */
export function soloRoundEndView(
  p: Placement,
  info: RoundEndInfo,
  s: PlayerStats,
  gain: number,
): ControllerView {
  const finished = info.finisher === p.id;
  return {
    kind: 'result',
    tone: finished ? 'win' : p.bites > 0 ? 'good' : 'neutral',
    title: finished ? STR.phoneRoundSoloWin : STR.phoneRoundSoloTime,
    big: STR.soloGain(gain),
    subtitle: finished ? STR.phoneRoundWinSub(info.time ?? 0) : STR.phoneRoundSoloTimeSub(p.bites, BITES),
    chips: [STR.phoneProgressChip(p.bites, BITES)],
    stats: soloStats(s),
  };
}

/** Final screen for a lone player: score and the record line. */
export function soloFinalView(s: PlayerStats, isNew: boolean, recordText: string): ControllerView {
  return {
    kind: 'result',
    tone: isNew ? 'win' : 'good',
    title: STR.phoneSoloDone,
    big: STR.soloLabel(soloScore(s)),
    subtitle: recordText,
    stats: [
      { label: STR.phoneBitesStat, value: String(s.bites) },
      { label: STR.phonePerfectStat, value: String(s.perfect) },
      { label: STR.phoneChokeStat, value: String(s.chokes) },
    ],
    actions: AGAIN,
  };
}
