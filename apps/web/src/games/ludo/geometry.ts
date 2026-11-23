/**
 * Board geometry in board units: the board spans -0.5..15.5 on both axes (the classic board is a
 * 15x15 grid of 1-unit cells, its frame half a unit wide). Pawns travel clockwise. Pure, shared by
 * the board drawing and the pawn layer.
 *
 * - Classic (2 to 4 colours): bases in the corners (Merah top left, Hijau top right, Kuning bottom
 *   right, Biru bottom left).
 * - Polygon (5 to 8 colours): one side per colour, side 0 (Merah) on top. Each side holds
 *   `perSide` loop squares; the home column leaves the side's middle square towards the centre and
 *   the base sits inside, in the wedge towards the colour's start square.
 */
import { BASE, type BoardSpec, type ColorId, HOME_COL } from './logic';

export const GRID = 15;
/** Board centre. */
const MID = GRID / 2;

export interface Pt {
  x: number;
  y: number;
}

/** A colour's base as drawn: a rounded square (classic) or a circle (polygon). */
export interface BaseArea {
  x: number;
  y: number;
  w: number;
  h: number;
  round: boolean;
}

export interface BoardGeom {
  spec: BoardSpec;
  /** Size of one loop square in board units (1 on the classic board). */
  cell: number;
  /** Centre of a loop square. */
  track(abs: number): Pt;
  /** Centres of a colour's home-column squares, from the entry to the centre. */
  homeColumn(color: ColorId): Pt[];
  /** Pawn slot inside a base, for 2 or 4 pawns. */
  baseSlot(color: ColorId, pawn: number, pawns: number): Pt;
  /** Where finished pawns gather: inside the colour's triangle in the centre. */
  homeSpot(color: ColorId, pawn: number, pawns: number): Pt;
  base(color: ColorId): BaseArea;
}

/* ------------------------------------------------------------------ classic */

/** The 52 classic loop squares (top-left corners), index 0 = Merah's start square, clockwise. */
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
  if (out.length !== 52) throw new Error('ludo track must have 52 squares');
  return out;
})();

/** Step from the home-column entry towards the centre, per classic colour. */
const HOME_DIR: readonly Pt[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

/** Top-left cell of each classic colour's 6x6 base. */
export const BASE_ORIGIN: readonly Pt[] = [
  { x: 0, y: 0 },
  { x: 9, y: 0 },
  { x: 9, y: 9 },
  { x: 0, y: 9 },
];

function classicGeom(spec: BoardSpec): BoardGeom {
  const at = (p: Pt): Pt => ({ x: p.x + 0.5, y: p.y + 0.5 });
  return {
    spec,
    cell: 1,
    track: (abs) => at(TRACK[abs]!),
    homeColumn(color) {
      const entry = TRACK[(spec.start[color]! + spec.lastTrack) % spec.trackLen]!;
      const d = HOME_DIR[color]!;
      return Array.from({ length: HOME_COL }, (_, i) =>
        at({ x: entry.x + d.x * (i + 1), y: entry.y + d.y * (i + 1) }),
      );
    },
    baseSlot(color, pawn, pawns) {
      const o = BASE_ORIGIN[color]!;
      if (pawns <= 2) {
        const k = pawn === 0 ? 0 : 1;
        return { x: o.x + 2 + k * 2, y: o.y + 2 + k * 2 };
      }
      return { x: o.x + 2 + (pawn % 2) * 2, y: o.y + 2 + Math.floor(pawn / 2) * 2 };
    },
    homeSpot(color, pawn, pawns) {
      const d = HOME_DIR[color]!;
      // The triangle's centroid sits 1 cell from the board centre, against the colour's side.
      const spread = pawns <= 2 ? [-0.32, 0.32] : [-0.6, -0.2, 0.2, 0.6];
      const s = spread[pawn] ?? 0;
      return { x: MID - d.x + d.y * s, y: MID - d.y + d.x * s };
    },
    base(color) {
      const o = BASE_ORIGIN[color]!;
      return { x: o.x, y: o.y, w: 6, h: 6, round: false };
    },
  };
}

/* ------------------------------------------------------------------ polygon */

/** Frame width around a polygon board, in board units. */
export const POLY_FRAME = 0.62;
/** Space the drawn frame may use: the classic board's outer edge. */
const POLY_SPAN = GRID + 0.84;

/** Everything needed to draw and place things on a polygon board. */
export interface PolyFrame {
  n: number;
  L: number;
  cx: number;
  cy: number;
  /** Circumradius of the loop's outer edge. */
  R: number;
  /** Circumradius of the loop's inner edge. */
  Ri: number;
  /** Apothem of the loop's inner edge (where the home columns start). */
  ap: number;
  /** Depth of a loop square = width of a home-column square. */
  d: number;
  /** Depth of a home-column square (a little shorter than `d` when the centre needs room). */
  laneDepth: number;
  /** Apothem of the central hub (where the home columns end). */
  hub: number;
  /** Vertex i of the polygon of circumradius r (vertex i starts side i). */
  vertex(i: number, r: number): Pt;
  /** Corners of loop square `abs` (outer edge first, clockwise). */
  square(abs: number): Pt[];
  /** Corners of home-column square j of a colour. */
  lane(color: number, j: number): Pt[];
  /** Base circle of a colour. */
  yard(color: number): { x: number; y: number; r: number };
}

const polyCache = new Map<number, PolyFrame>();

export function polyFrame(spec: BoardSpec): PolyFrame {
  const cached = polyCache.get(spec.sides);
  if (cached) return cached;
  const n = spec.sides;
  const L = spec.perSide;
  const step = (2 * Math.PI) / n;
  const half = Math.PI / n;
  const ang = (i: number) => -Math.PI / 2 + step * (i - 0.5);
  // Fit the outer frame into the classic board's square, centred on its bounding box.
  let minX = 0;
  let maxX = 0;
  let minY = 0;
  let maxY = 0;
  for (let i = 0; i < n; i++) {
    const x = Math.cos(ang(i));
    const y = Math.sin(ang(i));
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const outer = POLY_SPAN / Math.max(maxX - minX, maxY - minY);
  const R = outer - POLY_FRAME / Math.cos(half);
  const cx = MID - ((maxX + minX) / 2) * outer;
  const cy = MID - ((maxY + minY) / 2) * outer;
  const side = 2 * R * Math.sin(half);
  const d = side / L;
  const Ri = R - d / Math.cos(half);
  const ap = Ri * Math.cos(half);
  // Keep the centre big enough for every colour's triangle and the finished pawns.
  const laneDepth = Math.min(d, (ap - R * 0.28) / HOME_COL);
  const hub = ap - HOME_COL * laneDepth;
  const vertex = (i: number, r: number): Pt => ({
    x: cx + r * Math.cos(ang(i)),
    y: cy + r * Math.sin(ang(i)),
  });
  const along = (i: number, t: number, r: number): Pt => {
    const a = vertex(i, r);
    const b = vertex(i + 1, r);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  };
  const f: PolyFrame = {
    n,
    L,
    cx,
    cy,
    R,
    Ri,
    ap,
    d,
    laneDepth,
    hub,
    vertex,
    square(abs) {
      const i = Math.floor(abs / L);
      const k = abs % L;
      return [along(i, k / L, R), along(i, (k + 1) / L, R), along(i, (k + 1) / L, Ri), along(i, k / L, Ri)];
    },
    lane(color, j) {
      const th = -Math.PI / 2 + step * color;
      const u = { x: Math.cos(th), y: Math.sin(th) };
      const p = { x: -u.y, y: u.x };
      const at = (r: number, w: number): Pt => ({ x: cx + u.x * r + p.x * w, y: cy + u.y * r + p.y * w });
      const r0 = ap - j * laneDepth;
      const r1 = ap - (j + 1) * laneDepth;
      return [at(r0, -d / 2), at(r0, d / 2), at(r1, d / 2), at(r1, -d / 2)];
    },
    yard(color) {
      const a = ang(color + 1);
      const pos = Ri * 0.62;
      const room = pos * Math.sin(half) - d / 2 - R * 0.025;
      const r = Math.max(R * 0.09, Math.min(R * 0.24, room));
      return { x: cx + pos * Math.cos(a), y: cy + pos * Math.sin(a), r };
    },
  };
  polyCache.set(n, f);
  return f;
}

function centroid(pts: readonly Pt[]): Pt {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
}

function polyGeom(spec: BoardSpec): BoardGeom {
  const f = polyFrame(spec);
  const hubR = f.hub / Math.cos(Math.PI / f.n);
  return {
    spec,
    cell: f.d,
    track: (abs) => centroid(f.square(abs)),
    homeColumn: (color) => Array.from({ length: HOME_COL }, (_, j) => centroid(f.lane(color, j))),
    baseSlot(color, pawn, pawns) {
      const y = f.yard(color);
      const off = y.r * 0.38;
      const k = pawns <= 2 ? (pawn === 0 ? 0 : 3) : pawn;
      return { x: y.x + (k % 2 ? off : -off), y: y.y + (k >= 2 ? off : -off) };
    },
    homeSpot(color, pawn, pawns) {
      const a = f.vertex(color, hubR);
      const b = f.vertex(color + 1, hubR);
      const c = centroid([{ x: f.cx, y: f.cy }, a, b]);
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const ux = (b.x - a.x) / len;
      const uy = (b.y - a.y) / len;
      const spread = pawns <= 2 ? [-0.18, 0.18] : [-0.33, -0.11, 0.11, 0.33];
      const s = (spread[pawn] ?? 0) * len;
      return { x: c.x + ux * s, y: c.y + uy * s };
    },
    base(color) {
      const y = f.yard(color);
      return { x: y.x - y.r, y: y.y - y.r, w: y.r * 2, h: y.r * 2, round: true };
    },
  };
}

const geoms = new Map<number, BoardGeom>();

/** Geometry of a board (cached per shape). */
export function geometryFor(spec: BoardSpec): BoardGeom {
  let g = geoms.get(spec.sides);
  if (!g) {
    g = spec.sides === 4 ? classicGeom(spec) : polyGeom(spec);
    geoms.set(spec.sides, g);
  }
  return g;
}

/* ------------------------------------------------------------------ pawns */

/** Centre point (board units) of a pawn at a given progress. */
export function pawnPoint(g: BoardGeom, color: ColorId, progress: number, pawn: number, pawns: number): Pt {
  const s = g.spec;
  if (progress === BASE) return g.baseSlot(color, pawn, pawns);
  if (progress >= s.home) return g.homeSpot(color, pawn, pawns);
  if (progress > s.lastTrack) return g.homeColumn(color)[progress - s.lastTrack - 1]!;
  return g.track((s.start[color]! + progress) % s.trackLen);
}

export interface PawnRef {
  seat: number;
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
export function layoutPawns(g: BoardGeom, pawns: readonly PawnRef[], perColor: number): PlacedPawn[] {
  const groups = new Map<string, { at: Pt; list: PawnRef[] }>();
  const out: PlacedPawn[] = [];
  const home = g.spec.home;
  for (const p of pawns) {
    const pt = pawnPoint(g, p.color, p.progress, p.pawn, perColor);
    if (p.progress === BASE || p.progress >= home) {
      out.push({ ...p, ...pt, scale: p.progress >= home ? 0.62 : 1, z: pt.y });
      continue;
    }
    const key = `${pt.x.toFixed(3)},${pt.y.toFixed(3)}`;
    const grp = groups.get(key);
    if (grp) grp.list.push(p);
    else groups.set(key, { at: pt, list: [p] });
  }
  for (const { at: c, list } of groups.values()) {
    const n = list.length;
    list.forEach((p, i) => {
      if (n === 1) {
        out.push({ ...p, x: c.x, y: c.y, scale: 1, z: c.y });
        return;
      }
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const r = (n === 2 ? 0.2 : 0.26) * g.cell;
      const x = c.x + Math.cos(a) * r;
      const y = c.y + Math.sin(a) * r;
      out.push({ ...p, x, y, scale: n === 2 ? 0.8 : 0.68, z: y });
    });
  }
  return out;
}
