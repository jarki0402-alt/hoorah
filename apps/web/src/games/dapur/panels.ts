/**
 * The HUD panels (setup screen, play bar, practice card, result) built from plain facts, so the
 * Host's director and a far-away main screen in long-distance play (replica.ts) draw exactly the
 * same screen from the same inputs. Pure: no DOM, no SDK.
 */
import { lookOfFruit } from '@hoorah/protocol';
import type { GameIcon } from '@hoorah/sdk';
import { kitchenThumb } from './art';
import type { GuideButton, GuideStepId } from './guide';
import type { CookChip, GuideState, PlayState, ResultState, SetupState } from './hud';
import {
  DIFFICULTIES,
  type Difficulty,
  KITCHEN_DEFS,
  KITCHENS,
  type KitchenId,
  recommended,
  type Side,
} from './kitchens';
import type { Phase } from './logic';
import { type DishId, type Part, RECIPES } from './recipes';
import { toNextStar } from './results';
import type { SetupStep } from './setup';
import { formatClock, formatScore, STR } from './strings';
import { PAD_BUTTONS } from './views';

/* ------------------------------------------------------------------ setup */

export interface SetupInfo {
  step: SetupStep;
  kitchen: KitchenId;
  difficulty: Difficulty;
  /** People in the room (the helper not counted). */
  humans: number;
  /** Best stars per kitchen at the chosen difficulty on the Host's main screen (0: none yet). */
  best: Record<KitchenId, number>;
  /** Split kitchens: the two sides; open kitchen: null. */
  sides: [CookChip[], CookChip[]] | null;
  everyone: CookChip[];
  hostName: string;
}

export function setupPanel(s: SetupInfo): SetupState {
  const rec = recommended(Math.max(1, s.humans));
  return {
    step: s.step,
    cooks: Math.max(1, s.humans),
    recommendedName: STR.kitchens[rec].name,
    kitchens: KITCHENS.map((k) => {
      const def = KITCHEN_DEFS[k];
      const b = s.best[k];
      return {
        id: k,
        no: def.no,
        name: STR.kitchens[k].name,
        desc: STR.kitchens[k].desc,
        thumb: `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="118" viewBox="0 0 252 118" preserveAspectRatio="none">${kitchenThumb(def, 252, 118)}</svg>`,
        recommended: k === rec,
        selected: k === s.kitchen,
        best: b > 0 ? b : null,
      };
    }),
    sides: s.sides,
    everyone: s.everyone,
    levels: DIFFICULTIES.map((d, i) => ({
      id: d,
      name: STR.levels[d].name,
      desc: STR.levels[d].desc,
      chilies: i + 1,
      selected: d === s.difficulty,
    })),
    hostName: s.hostName,
  };
}

/* ------------------------------------------------------------------ play bar */

export interface TicketInfo {
  id: number;
  dish: DishId;
  got: readonly Part[];
  /** 0..1 patience left. */
  left: number;
}

export interface PlayInfo {
  kitchen: KitchenId;
  difficulty: Difficulty;
  phase: Phase;
  practice: boolean;
  /** Round clock left (ms). */
  left: number;
  score: number;
  stars: 0 | 1 | 2 | 3;
  thresholds: readonly [number, number, number];
  tickets: readonly TicketInfo[];
  cooks: readonly { name: string; side: Side }[];
}

export function playPanel(p: PlayInfo): PlayState {
  const th = p.thresholds;
  const split = KITCHEN_DEFS[p.kitchen].split;
  // The practice scores nothing: the bar shows a fresh round.
  const score = p.practice ? 0 : p.score;
  const stars = p.practice ? 0 : p.stars;
  const lo = stars === 0 ? 0 : th[stars - 1]!;
  const hi = stars >= 3 ? lo : th[stars as 0 | 1 | 2];
  const names = (side: Side) =>
    p.cooks
      .filter((c) => c.side === side)
      .map((c) => c.name)
      .join(', ');
  return {
    kitchen: STR.kitchens[p.kitchen].name,
    level: STR.levels[p.difficulty].name,
    chilies: DIFFICULTIES.indexOf(p.difficulty) + 1,
    tickets: p.tickets.map((k) => {
      const r = RECIPES[k.dish];
      const done: string[] = [];
      if (k.got.includes('soda')) done.push('soda');
      if (k.got.includes('burger')) done.push('roti', 'dagingMatang', 'tomatPotong', 'seladaPotong');
      const left = p.practice ? 1 : Math.max(0, Math.min(1, k.left));
      return {
        id: k.id,
        title: STR.dishes[k.dish],
        icon: r.icon,
        parts: [...r.shows],
        left,
        urgent: left < 0.25,
        done,
      };
    }),
    timer: formatClock(p.left),
    urgent: p.phase === 'play' && p.left <= 30_000,
    score: formatScore(score),
    stars,
    progress: stars >= 3 ? 1 : Math.max(0, Math.min(1, (score - lo) / Math.max(1, hi - lo))),
    sides: split ? [`${names(0)} · ${STR.sideShort[0]}`, `${names(1)} · ${STR.sideShort[1]}`] : null,
    open: split ? null : `${p.cooks.map((c) => c.name).join(', ')} · ${STR.openShort}`,
  };
}

/* ------------------------------------------------------------------ practice */

export interface GuideInfo {
  step: GuideStepId;
  index: number;
  total: number;
  waiting: boolean;
  /** Name of the computer helper doing this step, or null. */
  helper: string | null;
  /** The button a person who can act should press, or null. */
  button: GuideButton | null;
  /** Point at the first order ticket instead of the stage. */
  ticket: boolean;
}

/** The step card; `arrow` is where the stage arrow points (world px), or null. */
export function guidePanel(g: GuideInfo, arrow: GuideState['arrow']): GuideState {
  const text = STR.guide.steps[g.step];
  const want = g.helper ? null : g.button;
  const b = want ? PAD_BUTTONS.find((x) => x.id === want) : undefined;
  const sub = g.helper
    ? STR.guide.helper(g.helper)
    : g.waiting
      ? STR.guide.waitSub
      : g.step === 'throw' && want === 'throw'
        ? STR.guide.throwNow
        : text.sub;
  return {
    eyebrow: STR.guide.eyebrow(g.index + 1, g.total),
    title: g.waiting ? STR.guide.waitTitle : text.title,
    sub,
    button: b
      ? {
          verb: b.press === 'hold' ? STR.guide.hold : STR.guide.press,
          label: b.label.toUpperCase(),
          tone: b.tone,
        }
      : null,
    arrow,
    ticket: g.ticket,
    key: `${g.step}${g.waiting ? '-wait' : ''}`,
  };
}

/* ------------------------------------------------------------------ result */

export interface AwardInfo {
  playerId: number;
  title: string;
  desc: string;
  icon: GameIcon;
}

export interface ResultInfo {
  kitchen: KitchenId;
  thresholds: readonly [number, number, number];
  stars: 0 | 1 | 2 | 3;
  score: number;
  delivered: number;
  missed: number;
  tips: number;
  awards: readonly AwardInfo[];
  newBest: boolean;
}

/** The kitchen's result card; `cooks` gives the award winners' faces. */
export function resultPanel(r: ResultInfo, cooks: ReadonlyMap<number, CookChip>): ResultState {
  const th = r.thresholds;
  const next = toNextStar(r.score, th);
  const def = KITCHEN_DEFS[r.kitchen];
  return {
    eyebrow: STR.resultEyebrow(def.no, STR.kitchens[r.kitchen].name),
    title: STR.resultTitle[r.stars],
    sub: STR.resultSub(r.missed),
    stars: r.stars,
    score: formatScore(r.score),
    fill: Math.min(1, r.score / th[2]),
    notch: next ? th[next.star - 1]! / th[2] : null,
    next: next ? STR.toNextStar(next.left, next.star) : STR.allStars,
    delivered: r.delivered,
    missed: r.missed,
    tips: `+${formatScore(r.tips)}`,
    awards: r.awards.map((a) => {
      const c = cooks.get(a.playerId);
      return {
        name: c?.name ?? '',
        fruit: c?.fruit ?? 'jeruk',
        look: c?.look ?? lookOfFruit(c?.fruit ?? 'jeruk'),
        color: c?.color ?? '#FFFFFF',
        title: a.title,
        desc: a.desc,
        icon: a.icon,
      };
    }),
    newBest: r.newBest,
  };
}
