/** Phone controller views for Ludo. Pure builders; the driver decides who gets what. */
import type { ControllerView, ViewStat } from '@hoorah/protocol';
import { SWATCH } from './colors';
import { type ColorId, HOME, LAST_TRACK, type MoveOption } from './logic';
import { STR } from './strings';

const REMATCH = [{ id: 'rematch', label: STR.phoneRematch, style: 'primary' as const }];

export function rollView(color: ColorId, bonus: boolean, needSix: boolean, deadline: number): ControllerView {
  const name = STR.color(color);
  return {
    kind: 'button',
    eyebrow: bonus ? STR.phoneBonusEyebrow(name) : STR.phoneTurnEyebrow(name),
    title: bonus ? STR.phoneBonusTitle : STR.phoneRollTitle,
    label: STR.phoneRollLabel,
    hint: STR.phoneRollHint(needSix),
    deadline: Math.round(deadline),
  };
}

/** What a move does, in a few words. */
export function moveLabel(o: MoveOption, victimNames: (o: MoveOption) => string): string {
  if (o.captures.length) return STR.pickCapture(victimNames(o));
  if (o.home) return STR.pickHome;
  if (o.exit) return STR.pickExit;
  if (o.to > LAST_TRACK) return STR.pickToHome(HOME - o.to);
  if (o.safe) return STR.pickSafe(o.to - o.from);
  return STR.pickStep(o.to - o.from);
}

export function pickView(
  color: ColorId,
  value: number,
  options: readonly MoveOption[],
  victimNames: (o: MoveOption) => string,
  deadline: number,
): ControllerView {
  const s = SWATCH[color];
  return {
    kind: 'choice',
    title: STR.phoneTurnEyebrow(STR.color(color)),
    prompt: STR.phonePickTitle(value),
    deadline: Math.round(deadline),
    options: options.map((o) => ({
      id: String(o.pawn + 1),
      label: moveLabel(o, victimNames),
      color: s.main,
      dark: s.dark,
    })),
  };
}

/** The roller while the dice tumble or the pawn walks. */
export function rolledView(value: number | null): ControllerView {
  return {
    kind: 'message',
    eyebrow: STR.phoneRolledEyebrow,
    title: value === null ? STR.phoneRollingSub : STR.phoneRolled(value),
    subtitle: value === null ? undefined : STR.phoneMovingSub,
    tone: 'good',
  };
}

export function passView(reason: 'none' | 'triple', needSix: boolean): ControllerView {
  return reason === 'triple'
    ? { kind: 'message', title: STR.phoneTripleTitle, subtitle: STR.phoneTripleSub, tone: 'bad' }
    : { kind: 'message', title: STR.phoneNoneTitle, subtitle: STR.toastNoneSub(needSix), tone: 'warn' };
}

export interface WatchInfo {
  rollerId: number;
  rollerName: string;
  rollerColor: ColorId;
  /** Same colour as the viewer (teammate rolling). */
  mate: boolean;
  doing: string;
  myColor: ColorId | null;
  myHome: number;
  pawns: number;
  teams: boolean;
}

export function watchView(w: WatchInfo): ControllerView {
  const stats: ViewStat[] = [];
  if (w.myColor !== null) {
    stats.push({ label: w.teams ? STR.phoneYourTeam : STR.phoneYourColor, value: STR.color(w.myColor) });
    stats.push({ label: STR.phoneHome, value: `${w.myHome}/${w.pawns}` });
  }
  return {
    kind: 'message',
    eyebrow: w.mate ? STR.phoneMateEyebrow : STR.phoneWatchEyebrow(STR.color(w.rollerColor)),
    title: w.rollerName,
    subtitle: w.doing,
    avatarOf: w.rollerId,
    stats,
  };
}

export function introView(color: ColorId | null, mate: string | null): ControllerView {
  if (color === null) return spectatorView();
  const name = STR.color(color);
  return {
    kind: 'message',
    eyebrow: STR.phoneIntroEyebrow,
    title: STR.phoneIntroTitle,
    subtitle: mate ? STR.phoneIntroTeam(name, mate) : STR.phoneIntroSub(name),
    tone: 'neutral',
  };
}

export function spectatorView(): ControllerView {
  return { kind: 'message', title: STR.phoneSpectator, subtitle: STR.phoneSpectatorSub, tone: 'neutral' };
}

export interface FinalInfo {
  rank: number;
  teams: boolean;
  headline: string;
  home: number;
  pawns: number;
  captures: number;
  sixes: number;
}

export function finalView(f: FinalInfo): ControllerView {
  const win = f.rank === 1;
  return {
    kind: 'result',
    tone: win ? 'win' : 'neutral',
    title: win ? (f.teams ? STR.phoneTeamWin : STR.phoneWinTitle) : STR.phoneRank(f.rank),
    big: `${f.home}/${f.pawns}`,
    subtitle: STR.phoneFinalSub(f.headline),
    stats: [
      { label: STR.phoneCaptures, value: String(f.captures) },
      { label: STR.phoneSixes, value: String(f.sixes) },
    ],
    actions: REMATCH,
  };
}
