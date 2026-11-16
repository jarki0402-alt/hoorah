/**
 * Board geometry on a 15x15 grid (cell units; a cell's centre is at x + 0.5, y + 0.5).
 * Bases sit in the corners (Merah top left, Hijau top right, Kuning bottom right, Biru bottom
 * left) and pawns travel clockwise. Pure, shared by the board drawing and the pawn layer.
 */
import { BASE, type ColorId, HOME, HOME_COL, LAST_TRACK, START_ABS, TRACK_LEN } from './logic';

export const GRID = 15;

export interface Pt {
  x: number;
  y: number;
}

/** The 52 loop squares, index 0 = Merah's start square, clockwise. */
export const TRACK: readonly Pt[] = (() => {
  const out: Pt[] = [];
  const run = (x: number, y: number, dx: number, dy: number, n: number) => {
    for (let i = 0; i < n; i++) out.push({ x: x + dx * i, y: y + dy * i });
  };
  run(1, 6, 1, 0, 5);
  run(6, 5, 0, -1, 6);
  run(7, 0, 1, 0, 2);
  run(8, 1, 0, 1, 5);
  run(9, 6, 1, 0, 6);
  run(14, 7, 0, 1, 2);
  run(13, 8, -1, 0, 5);
  run(8, 9, 0, 1, 6);
  run(7, 14, -1, 0, 2);
  run(6, 13, 0, -1, 5);
  run(5, 8, -1, 0, 6);
  run(0, 7, 0, -1, 2);
  if (out.length !== TRACK_LEN) throw new Error('ludo track must have 52 squares');
  return out;
})();

/** Step from the home-column entry towards the centre, per colour. */
const HOME_DIR: readonly Pt[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

/** Home-column squares (5 per colour), from the entry to the centre. */
export function homeColumn(color: ColorId): Pt[] {
  const entry = TRACK[(START_ABS[color] + LAST_TRACK) % TRACK_LEN]!;
  const d = HOME_DIR[color]!;
  return Array.from({ length: HOME_COL }, (_, i) => ({
    x: entry.x + d.x * (i + 1),
    y: entry.y + d.y * (i + 1),
  }));
}

/** Top-left cell of each colour's 6x6 base. */
export const BASE_ORIGIN: readonly Pt[] = [
  { x: 0, y: 0 },
  { x: 9, y: 0 },
  { x: 9, y: 9 },
  { x: 0, y: 9 },
];

/** Pawn slots inside a base (centres, cell units), for 2 or 4 pawns. */
export function baseSlot(color: ColorId, pawn: number, pawns: number): Pt {
  const o = BASE_ORIGIN[color]!;
  if (pawns <= 2) {
    const k = pawn === 0 ? 0 : 1;
    return { x: o.x + 2 + k * 2, y: o.y + 2 + k * 2 };
  }
  const col = pawn % 2;
  const row = Math.floor(pawn / 2);
  return { x: o.x + 2 + col * 2, y: o.y + 2 + row * 2 };
}

/** Where finished pawns gather: inside the colour's triangle in the centre. */
export function homeSpot(color: ColorId, pawn: number, pawns: number): Pt {
  const d = HOME_DIR[color]!;
  // The triangle's centroid sits 1 cell from the board centre, against the colour's side.
  const cx = 7.5 - d.x * 1;
  const cy = 7.5 - d.y * 1;
  const spread = pawns <= 2 ? [-0.32, 0.32] : [-0.6, -0.2, 0.2, 0.6];
  const s = spread[pawn] ?? 0;
  return { x: cx + d.y * s, y: cy + d.x * s };
}

/** Centre point (cell units) of a pawn at a given progress. */
export function pawnPoint(color: ColorId, progress: number, pawn: number, pawns: number): Pt {
  if (progress === BASE) return baseSlot(color, pawn, pawns);
  if (progress >= HOME) return homeSpot(color, pawn, pawns);
  if (progress > LAST_TRACK) {
    const c = homeColumn(color)[progress - LAST_TRACK - 1]!;
    return { x: c.x + 0.5, y: c.y + 0.5 };
  }
  const c = TRACK[(START_ABS[color] + progress) % TRACK_LEN]!;
  return { x: c.x + 0.5, y: c.y + 0.5 };
}

export interface PawnRef {
  team: number;
  color: ColorId;
  pawn: number;
  progress: number;
}

export interface PlacedPawn extends PawnRef {
  x: number;
  y: number;
  /** 1 alone on a square, smaller when sharing it. */
  scale: number;
  /** Paint order: lower first. */
  z: number;
}

/** Final positions of every pawn, fanning out pawns that share a square. */
export function layoutPawns(pawns: readonly PawnRef[], perColor: number): PlacedPawn[] {
  const groups = new Map<string, PawnRef[]>();
  const out: PlacedPawn[] = [];
  for (const p of pawns) {
    if (p.progress === BASE || p.progress >= HOME) {
      const pt = pawnPoint(p.color, p.progress, p.pawn, perColor);
      out.push({ ...p, ...pt, scale: p.progress >= HOME ? 0.62 : 1, z: pt.y });
      continue;
    }
    const pt = pawnPoint(p.color, p.progress, p.pawn, perColor);
    const key = `${pt.x},${pt.y}`;
    const g = groups.get(key);
    if (g) g.push(p);
    else groups.set(key, [p]);
  }
  for (const g of groups.values()) {
    const first = g[0]!;
    const c = pawnPoint(first.color, first.progress, first.pawn, perColor);
    const n = g.length;
    g.forEach((p, i) => {
      if (n === 1) {
        out.push({ ...p, x: c.x, y: c.y, scale: 1, z: c.y });
        return;
      }
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const r = n === 2 ? 0.2 : 0.26;
      const x = c.x + Math.cos(a) * r;
      const y = c.y + Math.sin(a) * r;
      out.push({ ...p, x, y, scale: n === 2 ? 0.8 : 0.68, z: y });
    });
  }
  return out;
}
