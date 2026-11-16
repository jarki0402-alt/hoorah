/**
 * Where things sit on the stage (stage px): the leaderboard panel on the right, the arena in the
 * rest. Pure so the scene, the HUD and the driver agree on one layout.
 */

/** Width of the leaderboard panel. */
export const PANEL_W = 256;
export const MARGIN = 22;
/** Gap between the arena's hedge and the panel. */
export const GAP = 14;
/** Hedge and fairy lights around the lawn, drawn outside the playable rect. */
export const BORDER = 18;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ArenaView extends Rect {
  /** Stage px per world unit. */
  s: number;
}

export function panelRect(stageW: number, stageH: number): Rect {
  return { x: stageW - MARGIN - PANEL_W, y: MARGIN, w: PANEL_W, h: stageH - 2 * MARGIN };
}

/** The space the lawn may use (inside the hedge). */
export function arenaBox(stageW: number, stageH: number): Rect {
  const x = MARGIN + BORDER;
  const y = MARGIN + BORDER;
  return {
    x,
    y,
    w: Math.max(200, stageW - PANEL_W - 2 * MARGIN - GAP - 2 * BORDER),
    h: Math.max(200, stageH - 2 * MARGIN - 2 * BORDER),
  };
}

/** Width / height of the lawn space, the arena's preferred shape on this screen. */
export function boxAspect(stageW: number, stageH: number): number {
  const b = arenaBox(stageW, stageH);
  return b.w / b.h;
}

/** The arena (world w x h) scaled into the lawn space and centred in it. */
export function fitArena(stageW: number, stageH: number, worldW: number, worldH: number): ArenaView {
  const b = arenaBox(stageW, stageH);
  const s = Math.min(b.w / worldW, b.h / worldH);
  const w = worldW * s;
  const h = worldH * s;
  return { x: b.x + (b.w - w) / 2, y: b.y + (b.h - h) / 2, w, h, s };
}
