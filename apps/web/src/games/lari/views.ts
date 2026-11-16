/** Phone views for Lari Terus: the swipe pad while running, the countdown and the end card. */
import type { ControllerView } from '@hoorah/protocol';
import type { LariRun, Runner } from './logic';
import { formatClock, formatInt, STR } from './strings';

/** The swipe pad, or the same pad locked with a banner (intro, dropped out). */
export function padView(
  run: LariRun,
  r: Runner,
  rank: number,
  color: string,
  banner?: string,
): ControllerView {
  const dist = Math.round(run.distOf(r));
  const eyebrow =
    run.mode === 'sprint'
      ? STR.phoneEyebrowSprint(formatClock(run.timeLeft))
      : STR.phoneEyebrowSurvive(run.alive);
  const stats =
    run.mode === 'sprint'
      ? [
          { label: STR.statScore, value: formatInt(run.scoreOf(r)) },
          { label: STR.statRank, value: STR.rankOf(rank, run.runners.length) },
        ]
      : [
          { label: STR.statCoins, value: String(r.coins) },
          { label: STR.statRank, value: STR.rankOf(rank, run.runners.length) },
        ];
  const locked = run.phase !== 'run' || r.out || banner !== undefined;
  const view: ControllerView = {
    kind: 'pad',
    mode: 'swipe',
    color,
    title: STR.phoneTitle(dist),
    eyebrow,
    stats,
    actionLabel: STR.actionJump,
    hint: STR.phoneHint,
  };
  if (r.out) {
    view.banner = STR.phoneOut;
    view.locked = true;
  } else if (banner !== undefined) {
    view.banner = banner;
    view.locked = true;
  } else if (locked) view.locked = true;
  return view;
}

export function countdownView(value: number, color: string): ControllerView {
  return {
    kind: 'countdown',
    value: String(value),
    title: STR.phoneCountTitle,
    subtitle: STR.phoneCountSub,
    color,
  };
}

export function doneView(run: LariRun, r: Runner): ControllerView {
  return {
    kind: 'message',
    eyebrow: STR.gameTitle,
    title: STR.phoneDoneTitle,
    subtitle: STR.phoneDoneSub(r.place ?? run.runners.length, run.runners.length),
    avatarOf: r.id,
    tone: r.place === 1 ? 'good' : 'neutral',
    stats: [
      { label: STR.statDistance, value: `${formatInt(run.distOf(r))} m` },
      { label: STR.statCoins, value: String(r.coins) },
    ],
  };
}

export function waitView(): ControllerView {
  return { kind: 'message', eyebrow: STR.gameTitle, title: STR.phoneWaitTitle, subtitle: STR.phoneWaitSub };
}
