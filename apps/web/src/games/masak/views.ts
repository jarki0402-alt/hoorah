/** Phone controller views for Jago Masak. Pure builders; the driver decides who gets what. */
import type { ControllerView } from '@hoorah/protocol';
import type { Grade, GradeReason, PlayerStats } from './logic';
import { DISH_COLOR, type DishId, type StepDef } from './recipes';
import type { SoloRecord, Standing } from './results';
import { STR } from './strings';

/** Progress is quantised so a phone gets at most a few updates per second. */
export const quantize = (p: number) => Math.round(Math.max(0, Math.min(1, p)) * 20) / 20;

function base(step: StepDef, dish: DishId) {
  const v: Extract<ControllerView, { kind: 'gesture' }> = {
    kind: 'gesture',
    mode: step.mode,
    eyebrow: '',
    title: STR.step(step.id).title,
    hint: STR.step(step.id).hint,
    color: DISH_COLOR[dish],
    icon: step.icon,
  };
  if (step.dir) v.dir = step.dir;
  return v;
}

export function introView(dish: DishId, index: number, count: number): ControllerView {
  return {
    kind: 'message',
    eyebrow: STR.phoneIntroEyebrow(index + 1, count),
    title: STR.dish(dish),
    subtitle: STR.phoneIntroSub,
    tone: 'neutral',
  };
}

/** Before the step starts: the phone shows what is coming, locked. */
export function readyView(step: StepDef, dish: DishId, i: number, n: number): ControllerView {
  return {
    ...base(step, dish),
    eyebrow: STR.phoneStep(dish, i + 1, n),
    hint: STR.phoneReadyHint,
    progress: 0,
    locked: true,
  };
}

export function cookView(
  step: StepDef,
  dish: DishId,
  i: number,
  n: number,
  progress: number,
  deadline: number,
): ControllerView {
  return {
    ...base(step, dish),
    eyebrow: STR.phoneStep(dish, i + 1, n),
    progress: quantize(progress),
    deadline: Math.round(deadline),
  };
}

/** Finished (or the step is over): the grade, locked until the next step. */
export function gradedView(
  step: StepDef,
  dish: DishId,
  i: number,
  n: number,
  grade: Grade,
  reason: GradeReason,
  points: number,
  progress: number,
  waiting: boolean,
): ControllerView {
  const over = step.hold?.over ?? null;
  return {
    ...base(step, dish),
    eyebrow: STR.phoneGradeEyebrow(i + 1, n, points),
    title: STR.grade(grade),
    hint: `${STR.reason(reason, over)} · ${waiting ? STR.phoneDoneHint : STR.phoneWatch}`,
    progress: quantize(progress),
    locked: true,
  };
}

export function dishView(dish: DishId, stars: number, points: number, s: PlayerStats): ControllerView {
  return {
    kind: 'result',
    tone: stars >= 3 ? 'win' : stars === 2 ? 'good' : 'neutral',
    title: STR.phoneDishTitle(dish),
    big: STR.phoneStarsBig(stars),
    subtitle: STR.phoneDishSub(points),
    streak: { done: stars, total: 3, label: STR.phoneStarsLabel(stars) },
    stats: [
      { label: STR.phonePerfects, value: String(s.perfects) },
      { label: STR.phoneTotal, value: STR.points(s.score) },
    ],
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
    big: STR.phoneFinalScore(s.score),
    subtitle: solo && record ? record.text : STR.phoneFinalSub(s.stars),
    stats: [
      { label: STR.phoneStarsTotal, value: String(s.stars) },
      { label: STR.phonePerfects, value: String(s.perfects) },
      { label: STR.phoneBestStreak, value: String(s.bestStreak) },
    ],
  };
}

export function idleView(): ControllerView {
  return { kind: 'message', title: STR.phoneIdle, subtitle: STR.phoneWatch, tone: 'neutral' };
}
