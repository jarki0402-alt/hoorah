/**
 * Screen layout in stage px (`width` x `height`: 1280x720 on 16:9, wider or taller elsewhere).
 * Pure, shared by the 3D renderer (scissor viewports) and the DOM HUD (labels on each station).
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const STAGE_W = 1280;
/** Header strip with the dish, the step and the timer. */
export const HEADER_H = 118;
export const MARGIN = 16;
export const GAP = 12;
/** Chef Mangga's little 3D window at the left of the header. */
export const CHEF_RECT: Rect = { x: 12, y: 6, w: 148, h: 106 };

export function gridShape(n: number): { cols: number; rows: number } {
  if (n <= 1) return { cols: 1, rows: 1 };
  if (n === 2) return { cols: 2, rows: 1 };
  if (n <= 4) return { cols: 2, rows: 2 };
  if (n <= 6) return { cols: 3, rows: 2 };
  return { cols: 4, rows: 2 };
}

/** One rect per station, row-major, filling the stage width. A short last row is centered. */
export function stationRects(n: number, height: number, width = STAGE_W): Rect[] {
  const count = Math.max(1, Math.min(8, Math.floor(n)));
  const { cols, rows } = gridShape(count);
  const top = HEADER_H + 4;
  const areaW = Math.max(STAGE_W, width) - 2 * MARGIN;
  const areaH = Math.max(200, height - top - MARGIN);
  const w = Math.floor((areaW - (cols - 1) * GAP) / cols);
  const h = Math.floor((areaH - (rows - 1) * GAP) / rows);
  const out: Rect[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const inRow = row === rows - 1 ? count - row * cols : cols;
    const col = i - row * cols;
    const rowW = inRow * w + (inRow - 1) * GAP;
    const x0 = MARGIN + Math.floor((areaW - rowW) / 2);
    out.push({ x: x0 + col * (w + GAP), y: top + row * (h + GAP), w, h });
  }
  return out;
}

/** Size class for HUD typography. */
export function density(n: number): 'large' | 'medium' | 'compact' {
  return n <= 2 ? 'large' : n <= 4 ? 'medium' : 'compact';
}
