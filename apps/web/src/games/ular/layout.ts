/**
 * Where the board, the turn panel and the player list go on the stage (stage px). Two shapes:
 * - side:   turn panel | board | players  (square 100 board on wide screens)
 * - bottom: board over a turn bar, players on the right  (2:1 50 board, and taller screens)
 * Whichever gives the bigger squares wins, so 16:9, 16:10 and 4:3 all get the largest board.
 */
import { FRAME } from './art';
import type { BoardSize } from './board';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  mode: 'side' | 'bottom';
  cell: number;
  board: Rect;
  turn: Rect;
  players: Rect;
}

const MARGIN = 28;
const GAP = 22;
export const PANEL_W = 272;
export const BAR_H = 150;

export function computeLayout(size: BoardSize, W: number, H: number): Layout {
  const cols = 10;
  const rows = size / cols;
  const fit = (w: number, h: number) => Math.floor(Math.min((w - 2 * FRAME) / cols, (h - 2 * FRAME) / rows));
  const sideCell = fit(W - 2 * MARGIN - 2 * PANEL_W - 2 * GAP, H - 2 * MARGIN);
  const bottomCell = fit(W - 2 * MARGIN - PANEL_W - GAP, H - 2 * MARGIN - BAR_H - GAP);
  if (sideCell >= bottomCell) {
    const cell = sideCell;
    const bw = cell * cols + 2 * FRAME;
    const bh = cell * rows + 2 * FRAME;
    const x0 = Math.round((W - (2 * PANEL_W + 2 * GAP + bw)) / 2);
    const y0 = Math.round((H - bh) / 2);
    const bx = x0 + PANEL_W + GAP;
    return {
      mode: 'side',
      cell,
      board: { x: bx, y: y0, w: bw, h: bh },
      turn: { x: x0, y: y0, w: PANEL_W, h: bh },
      players: { x: bx + bw + GAP, y: y0, w: PANEL_W, h: bh },
    };
  }
  const cell = bottomCell;
  const bw = cell * cols + 2 * FRAME;
  const bh = cell * rows + 2 * FRAME;
  const groupH = bh + GAP + BAR_H;
  const x0 = Math.round((W - (bw + GAP + PANEL_W)) / 2);
  const y0 = Math.round((H - groupH) / 2);
  return {
    mode: 'bottom',
    cell,
    board: { x: x0, y: y0, w: bw, h: bh },
    turn: { x: x0, y: y0 + bh + GAP, w: bw, h: BAR_H },
    players: { x: x0 + bw + GAP, y: y0, w: PANEL_W, h: groupH },
  };
}
