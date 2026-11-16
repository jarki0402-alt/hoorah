/**
 * Jago Masak recipes: numbers only (targets, time limits, hold windows). Every player-facing
 * word lives in strings.ts, keyed by the same ids.
 */
import type { GestureIcon } from '@hoorah/protocol';

export type GestureMode = 'tap' | 'stir' | 'swipe' | 'hold';
export type SwipeDir = 'up' | 'down' | 'left' | 'right';
export type DishId = 'nasgor' | 'sate' | 'martabak';

/** Where on the cooking island the camera looks during a step. */
export type Focus = 'board' | 'cobek' | 'bowl' | 'tray' | 'wok' | 'pan' | 'grill' | 'loyang' | 'plate';

/** Skill family, used for awards and sounds. */
export type Skill = 'knife' | 'pound' | 'stir' | 'swipe' | 'heat' | 'pour' | 'sprinkle';

export type StepId =
  | 'nasgor-chop'
  | 'nasgor-pound'
  | 'nasgor-saute'
  | 'nasgor-toss'
  | 'nasgor-egg'
  | 'nasgor-plate'
  | 'sate-cut'
  | 'sate-skewer'
  | 'sate-fan'
  | 'sate-flip'
  | 'sate-sauce'
  | 'sate-sprinkle'
  | 'mart-mix'
  | 'mart-pour'
  | 'mart-butter'
  | 'mart-sprinkle'
  | 'mart-fold'
  | 'mart-cut';

/**
 * Hold steps: the amount grows by 1 per `fillMs` of holding (presses add up). Releasing at or
 * above `lo` finishes the step; reaching `burn` while holding finishes it as a failure.
 */
export interface HoldSpec {
  fillMs: number;
  /** Golden window. */
  lo: number;
  hi: number;
  /** Center of the window and the half-width around it that counts as Sempurna. */
  sweet: number;
  perfect: number;
  /** Burnt (fry) or spilled (pour). */
  burn: number;
  over: 'burn' | 'spill';
}

export interface StepDef {
  id: StepId;
  mode: GestureMode;
  icon: GestureIcon;
  dir?: SwipeDir;
  focus: Focus;
  skill: Skill;
  /** Cooking time limit. */
  timeMs: number;
  /** Count steps: taps / quarter turns / swipes needed. Hold steps: 1. */
  target: number;
  /** Count steps finished within this many ms are Sempurna. */
  perfectMs: number;
  hold?: HoldSpec;
}

export interface Dish {
  id: DishId;
  steps: StepDef[];
}

const EGG: HoldSpec = { fillMs: 4000, lo: 0.6, hi: 0.82, sweet: 0.71, perfect: 0.055, burn: 1, over: 'burn' };
const SAUCE: HoldSpec = {
  fillMs: 3200,
  lo: 0.56,
  hi: 0.8,
  sweet: 0.68,
  perfect: 0.06,
  burn: 1,
  over: 'spill',
};
const BATTER: HoldSpec = {
  fillMs: 3400,
  lo: 0.6,
  hi: 0.82,
  sweet: 0.71,
  perfect: 0.055,
  burn: 1,
  over: 'spill',
};

export const DISHES: Record<DishId, Dish> = {
  nasgor: {
    id: 'nasgor',
    steps: [
      {
        id: 'nasgor-chop',
        mode: 'tap',
        icon: 'knife',
        focus: 'board',
        skill: 'knife',
        timeMs: 8000,
        target: 14,
        perfectMs: 4200,
      },
      {
        id: 'nasgor-pound',
        mode: 'tap',
        icon: 'pestle',
        focus: 'cobek',
        skill: 'pound',
        timeMs: 9000,
        target: 18,
        perfectMs: 4800,
      },
      {
        id: 'nasgor-saute',
        mode: 'stir',
        icon: 'spoon',
        focus: 'wok',
        skill: 'stir',
        timeMs: 8000,
        target: 12,
        perfectMs: 4200,
      },
      {
        id: 'nasgor-toss',
        mode: 'stir',
        icon: 'spoon',
        focus: 'wok',
        skill: 'stir',
        timeMs: 9000,
        target: 20,
        perfectMs: 5400,
      },
      {
        id: 'nasgor-egg',
        mode: 'hold',
        icon: 'pan',
        focus: 'pan',
        skill: 'heat',
        timeMs: 9000,
        target: 1,
        perfectMs: 0,
        hold: EGG,
      },
      {
        id: 'nasgor-plate',
        mode: 'swipe',
        icon: 'spoon',
        dir: 'down',
        focus: 'plate',
        skill: 'swipe',
        timeMs: 7000,
        target: 4,
        perfectMs: 3600,
      },
    ],
  },
  sate: {
    id: 'sate',
    steps: [
      {
        id: 'sate-cut',
        mode: 'tap',
        icon: 'knife',
        focus: 'board',
        skill: 'knife',
        timeMs: 8000,
        target: 14,
        perfectMs: 4200,
      },
      {
        id: 'sate-skewer',
        mode: 'swipe',
        icon: 'hand',
        dir: 'right',
        focus: 'tray',
        skill: 'swipe',
        timeMs: 7500,
        target: 5,
        perfectMs: 3800,
      },
      {
        id: 'sate-fan',
        mode: 'swipe',
        icon: 'hand',
        dir: 'left',
        focus: 'grill',
        skill: 'swipe',
        timeMs: 7500,
        target: 7,
        perfectMs: 4000,
      },
      {
        id: 'sate-flip',
        mode: 'swipe',
        icon: 'hand',
        dir: 'up',
        focus: 'grill',
        skill: 'swipe',
        timeMs: 7000,
        target: 4,
        perfectMs: 3400,
      },
      {
        id: 'sate-sauce',
        mode: 'hold',
        icon: 'spoon',
        focus: 'plate',
        skill: 'pour',
        timeMs: 9000,
        target: 1,
        perfectMs: 0,
        hold: SAUCE,
      },
      {
        id: 'sate-sprinkle',
        mode: 'tap',
        icon: 'shaker',
        focus: 'plate',
        skill: 'sprinkle',
        timeMs: 7000,
        target: 12,
        perfectMs: 3800,
      },
    ],
  },
  martabak: {
    id: 'martabak',
    steps: [
      {
        id: 'mart-mix',
        mode: 'stir',
        icon: 'spoon',
        focus: 'bowl',
        skill: 'stir',
        timeMs: 9000,
        target: 20,
        perfectMs: 5400,
      },
      {
        id: 'mart-pour',
        mode: 'hold',
        icon: 'pan',
        focus: 'loyang',
        skill: 'pour',
        timeMs: 9000,
        target: 1,
        perfectMs: 0,
        hold: BATTER,
      },
      {
        id: 'mart-butter',
        mode: 'stir',
        icon: 'spoon',
        focus: 'loyang',
        skill: 'stir',
        timeMs: 8000,
        target: 12,
        perfectMs: 4200,
      },
      {
        id: 'mart-sprinkle',
        mode: 'tap',
        icon: 'shaker',
        focus: 'loyang',
        skill: 'sprinkle',
        timeMs: 7500,
        target: 14,
        perfectMs: 4200,
      },
      {
        id: 'mart-fold',
        mode: 'swipe',
        icon: 'hand',
        dir: 'left',
        focus: 'loyang',
        skill: 'swipe',
        timeMs: 6500,
        target: 3,
        perfectMs: 3000,
      },
      {
        id: 'mart-cut',
        mode: 'tap',
        icon: 'knife',
        focus: 'board',
        skill: 'knife',
        timeMs: 7000,
        target: 8,
        perfectMs: 3600,
      },
    ],
  },
};

export const DISH_IDS: readonly DishId[] = ['nasgor', 'sate', 'martabak'];

/** Accent colour per dish (phone progress bar, HUD chips). No violet. */
export const DISH_COLOR: Record<DishId, string> = {
  nasgor: '#FF5A1F',
  sate: '#FFC928',
  martabak: '#22B35E',
};

/**
 * Dishes to cook. Three or more: the full menu in a fixed order (nasi goreng first, it is the
 * easiest). Fewer: a seeded pick so quick games vary between runs.
 */
export function dishOrder(count: number, seed: number): DishId[] {
  const n = Math.max(1, Math.min(DISH_IDS.length, Math.floor(count)));
  if (n >= DISH_IDS.length) return [...DISH_IDS];
  const pool = [...DISH_IDS];
  const out: DishId[] = [];
  let s = Math.abs(Math.floor(seed)) >>> 0;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
    const pick = pool.splice(s % pool.length, 1)[0]!;
    out.push(pick);
  }
  return out;
}
