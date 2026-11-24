/**
 * The HUD picture (pure): built from a `HudSource`, which the Host's driver fills from its match
 * and a far-away main screen (long-distance play) fills from the published state, so both
 * screens show the same cards, chips and lines.
 */
import type { HudState, LegendRow, Overlay } from './hud';
import { BIOMES, type BiomeId, biomeOf, Cell, LEVELS, type Level, type Slot } from './levels';
import {
  canPlayLevel,
  type HintInfo,
  needsPass,
  nextLevelOf,
  nextNeedsPassOf,
  type Phase,
  type PickStep,
  type Progress,
  type StageScore,
  worldNeedsPass,
  worldStars,
} from './logic';
import type { CharLook } from './scene';
import { BIOME_TEXT, formatClock, levelName, levelTip, STR } from './strings';
import type { World } from './world';

/** What the clear card shows of the last stage. */
export type ScoreLine = Pick<StageScore, 'time' | 'gems' | 'gemTotal' | 'starGems' | 'starTime' | 'skipped'>;

export interface HudSource {
  phase: Phase;
  pickStep: PickStep;
  /** World highlighted in the picker. */
  world: BiomeId;
  /** Level index (into LEVELS) highlighted in the picker. */
  pick: number;
  /** Level of the current stage (or the picked one before the first stage). */
  level: Level;
  progress: Progress;
  limited: boolean;
  host: string;
  /** Seconds played in this stage. */
  playT: number;
  /** Seconds before the next level starts by itself (0: it does not). */
  nextLeft: number;
  /** The stage tip still shows. */
  tip: boolean;
  hint: HintInfo | null;
  vote: { count: number; need: number } | null;
  score: ScoreLine | null;
  solo: boolean;
  sim: World | null;
  look: (key: number) => CharLook;
  /** Player colour of a person. */
  color: (owner: number) => string;
}

/** A plate that only moves a lift says so; others open doors. */
function plateHint(lv: Level, target: string): string {
  const ch = Number(target.slice(2));
  const door = lv.meta.some((m, i) => m === ch && lv.cells[i] === Cell.Door);
  return !door && lv.lifts.some((l) => l.ch === ch) ? STR.hintLift : STR.hintPlate;
}

function hintText(lv: Level, hint: HintInfo | null): string {
  if (!hint) return '';
  switch (hint.kind) {
    case 'box':
      return STR.hintBox;
    case 'plate':
      return plateHint(lv, hint.target);
    case 'lever':
      return STR.hintLever;
    default:
      return STR.hintExit;
  }
}

function legend(src: HudSource): LegendRow[] {
  const w = src.sim;
  if (!w) return [];
  const rows: LegendRow[] = [];
  for (let s = 0; s < w.colors; s++) {
    const people = w.chars
      .filter((c) => c.slot === s)
      .map((c) => {
        const look = src.look(c.key);
        return { name: look.name, look: look.look, color: src.color(c.owner) };
      });
    rows.push({ slot: s as Slot, people });
  }
  return rows;
}

function pickerOverlay(src: HudSource): Overlay {
  if (src.pickStep === 'world') {
    return {
      kind: 'worlds',
      host: src.host,
      selected: src.world,
      worlds: BIOMES.map((b) => {
        const pass = b.ready && worldNeedsPass(b.id, src.limited);
        return {
          id: b.id,
          name: BIOME_TEXT[b.id].name,
          sub: pass ? STR.passSub : b.ready ? BIOME_TEXT[b.id].sub : STR.soon,
          ready: b.ready,
          pass,
          ...worldStars(b.id, src.progress),
        };
      }),
    };
  }
  const levels = biomeOf(src.world).levels;
  return {
    kind: 'journey',
    host: src.host,
    world: src.world,
    title: STR.screenLevelTitle(BIOME_TEXT[src.world].name),
    selected: LEVELS[src.pick]?.id ?? '',
    nodes: levels.map((lv) => ({
      id: lv.id,
      number: lv.number,
      name: levelName(lv.id),
      stars: src.progress[lv.id] ?? 0,
      done: src.progress[lv.id] !== undefined,
      open: canPlayLevel(lv, src.progress, src.limited),
      pass: needsPass(lv, src.limited),
    })),
  };
}

function clearOverlay(src: HudSource): Overlay {
  const lv = src.level;
  const s = src.score;
  const next = nextLevelOf(lv, src.limited);
  const pass = nextNeedsPassOf(lv, src.limited);
  const choosing = src.phase === 'next';
  const skipped = Boolean(s?.skipped);
  return {
    kind: 'clear',
    eyebrow: STR.worldLevel(BIOME_TEXT[lv.biome].name, lv.number),
    title: skipped ? STR.skippedTitle : STR.clearTitle,
    stars: skipped
      ? []
      : [
          { label: STR.starClear, on: true },
          { label: STR.starGems, on: Boolean(s?.starGems) },
          { label: STR.starTime(formatClock(lv.par)), on: Boolean(s?.starTime) },
        ],
    time: skipped ? STR.skippedNote : STR.clearTime(formatClock(s?.time ?? 0)),
    gems: skipped ? '' : STR.clearGems(s?.gems ?? 0, s?.gemTotal ?? 0),
    next: !choosing
      ? next
        ? STR.nextStage(levelName(next.id))
        : pass
          ? STR.passNext
          : STR.lastStage
      : next
        ? STR.nextIn(next.number, Math.ceil(src.nextLeft), src.host)
        : pass
          ? STR.passNextHost(src.host)
          : STR.worldDone(src.host),
  };
}

export function overlayOf(src: HudSource): Overlay {
  const lv = src.level;
  switch (src.phase) {
    case 'select':
      return pickerOverlay(src);
    case 'intro':
      return {
        kind: 'intro',
        eyebrow: STR.worldLevel(BIOME_TEXT[lv.biome].name, lv.number),
        name: levelName(lv.id),
        tip: levelTip(lv.id),
        goal: STR.goal,
        legend: legend(src),
        solo: src.solo,
      };
    case 'clear':
    case 'next':
      return clearOverlay(src);
    default:
      return { kind: 'none' };
  }
}

export function hudOf(src: HudSource): HudState {
  const w = src.sim;
  const lv = src.level;
  const playing = src.phase === 'play' && w !== null;
  const chips = [];
  if (w) for (let s = 0; s < w.colors; s++) chips.push({ slot: s as Slot, ...w.exitCount(s as Slot) });
  const g = w?.allGems() ?? { taken: 0, total: 0 };
  const hint = hintText(lv, src.hint);
  return {
    show: src.phase === 'play' || src.phase === 'clear' || src.phase === 'next',
    stage: STR.worldLevel(BIOME_TEXT[lv.biome].name, lv.number),
    name: levelName(lv.id),
    timer: formatClock(src.playT),
    gems: `${STR.hudGems} ${g.taken}/${g.total}`,
    chips,
    tip: hint || (playing && src.tip ? levelTip(lv.id) : ''),
    hint: Boolean(hint),
    vote: playing && src.vote ? `${STR.voteTitle} ${STR.voteCount(src.vote.count, src.vote.need)}` : '',
    overlay: overlayOf(src),
  };
}
