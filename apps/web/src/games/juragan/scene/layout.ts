/**
 * Board geometry in world units (y up, the main screen camera looks from +z). The ring of 24 tiles
 * fills an 8 x 8 square: four 1.5-unit corners and five 1-unit tiles per side, on a base with a
 * 0.2-unit rim. Gajian is the near-left corner; pawns walk right along the near edge, away along
 * the right edge, left along the far edge and back down the left edge. Every print on the board
 * reads upright from the camera.
 */
import { SIDE, sideOf, TILANG_TILE } from '../board';

export const CORNER = 1.5;
export const CELL = 1;
/** Half the tile ring. */
export const HALF = 4;
/** Half the board base (ring + rim). */
export const BASE_HALF = 4.2;
/** Height of the tile tops above the base top (y = 0). */
export const TILE_H = 0.07;
/** Groove between neighbouring tiles. */
export const GAP = 0.045;
/** Depth of the island colour band on city tiles. */
export const BAND = 0.3;

export interface TileRect {
  index: number;
  side: number;
  corner: boolean;
  cx: number;
  cz: number;
  /** Size along x and z. */
  w: number;
  d: number;
  /** Unit vector pointing to the centre of the board. */
  inX: number;
  inZ: number;
}

const INWARD: readonly [number, number][] = [
  [0, -1],
  [-1, 0],
  [0, 1],
  [1, 0],
];

export function tileRect(i: number): TileRect {
  const side = sideOf(i);
  const k = i % SIDE;
  const [inX, inZ] = INWARD[side]!;
  const mid = HALF - CORNER / 2;
  if (k === 0) {
    const corners: [number, number][] = [
      [-mid, mid],
      [mid, mid],
      [mid, -mid],
      [-mid, -mid],
    ];
    const [cx, cz] = corners[side]!;
    return { index: i, side, corner: true, cx, cz, w: CORNER, d: CORNER, inX, inZ };
  }
  const along = HALF - CORNER - (k - 0.5) * CELL;
  switch (side) {
    case 0:
      return { index: i, side, corner: false, cx: -along, cz: mid, w: CELL, d: CORNER, inX, inZ };
    case 1:
      return { index: i, side, corner: false, cx: mid, cz: along, w: CORNER, d: CELL, inX, inZ };
    case 2:
      return { index: i, side, corner: false, cx: along, cz: -mid, w: CELL, d: CORNER, inX, inZ };
    default:
      return { index: i, side, corner: false, cx: -mid, cz: -along, w: CORNER, d: CELL, inX, inZ };
  }
}

/**
 * A point on a tile in its own frame: `u` across the tile (to the right when looking at the board
 * centre from outside), `v` towards the board centre. Both in world units from the tile centre.
 */
export function onTile(r: TileRect, u: number, v: number): [number, number] {
  // Right-hand vector when facing inward: (-inZ, inX) rotated so that u grows along the walk.
  const rx = -r.inZ;
  const rz = r.inX;
  return [r.cx + rx * u + r.inX * v, r.cz + rz * u + r.inZ * v];
}

/** Pawn spots on a plain tile for n pawns (u, v), kept off the colour band. */
const SPOTS: readonly (readonly [number, number])[][] = [
  [],
  [[0, -0.18]],
  [
    [-0.22, -0.18],
    [0.22, -0.18],
  ],
  [
    [-0.22, -0.02],
    [0.22, -0.02],
    [0, -0.4],
  ],
  [
    [-0.22, 0],
    [0.22, 0],
    [-0.22, -0.42],
    [0.22, -0.42],
  ],
  [
    [-0.22, 0.12],
    [0.22, 0.12],
    [-0.22, -0.22],
    [0.22, -0.22],
    [0, -0.55],
  ],
  [
    [-0.22, 0.12],
    [0.22, 0.12],
    [-0.22, -0.22],
    [0.22, -0.22],
    [-0.22, -0.56],
    [0.22, -0.56],
  ],
];

/**
 * Side-column tiles are wide on screen and short: pawns line up across the screen (along v)
 * instead of one behind the other, a second row only from four pawns.
 */
const SIDE_SPOTS: readonly (readonly [number, number])[][] = [
  [],
  [[0, -0.18]],
  [
    [0, -0.44],
    [0, 0.08],
  ],
  [
    [0, -0.56],
    [0, -0.16],
    [0, 0.24],
  ],
  [
    [-0.18, -0.5],
    [-0.18, -0.02],
    [0.2, -0.3],
    [0.2, 0.18],
  ],
  [
    [-0.2, -0.56],
    [-0.2, -0.16],
    [-0.2, 0.24],
    [0.2, -0.4],
    [0.2, 0.02],
  ],
  [
    [-0.2, -0.56],
    [-0.2, -0.16],
    [-0.2, 0.24],
    [0.2, -0.56],
    [0.2, -0.16],
    [0.2, 0.24],
  ],
];

/** Corner spots in world offsets (x right, z towards the camera): a loose 3 x 2 cluster. */
const CORNER_SPOTS: readonly (readonly [number, number])[] = [
  [-0.38, 0.22],
  [0.38, 0.22],
  [0, 0.3],
  [-0.38, -0.2],
  [0.38, -0.2],
  [0, -0.16],
];

/** Pos Tilang: visitors stand on the outer L, ticketed pawns inside the striped box (inner quadrant). */
const VISIT_SPOTS: readonly (readonly [number, number])[] = [
  [-0.52, -0.52],
  [-0.1, -0.56],
  [0.3, -0.58],
  [-0.56, -0.12],
  [-0.58, 0.3],
  [0.56, -0.58],
];
const JAIL_SPOTS: readonly (readonly [number, number])[] = [
  [0.18, 0.18],
  [0.48, 0.2],
  [0.2, 0.5],
  [0.5, 0.5],
  [0.34, 0.34],
  [0.06, 0.4],
];

/**
 * World x/z of pawn `slot` among `count` pawns standing on tile `i`. On Pos Tilang the ticketed
 * (jailed) pawns use their own box.
 */
export function pawnSpot(i: number, slot: number, count: number, jailed = false): [number, number] {
  const r = tileRect(i);
  if (i === TILANG_TILE) {
    const list = jailed ? JAIL_SPOTS : VISIT_SPOTS;
    const [a, b] = list[slot % list.length]!;
    // Corner frame: a along the near edge (x), b towards the far side (-z) for the near-right corner.
    return [r.cx - a, r.cz - b];
  }
  if (r.corner) {
    const [dx, dz] = CORNER_SPOTS[slot % CORNER_SPOTS.length]!;
    return [r.cx + dx, r.cz + dz];
  }
  const table = r.side % 2 === 1 ? SIDE_SPOTS : SPOTS;
  const set = table[Math.max(1, Math.min(6, count))]!;
  const [u, v] = set[slot % set.length]!;
  return onTile(r, u, v);
}

/** Where a city's building stands: on the colour band, nudged out so the Hotel's podium fits. */
export function buildingSpot(i: number): [number, number] {
  const r = tileRect(i);
  const depth = r.side % 2 === 0 ? r.d : r.w;
  return onTile(r, 0, depth / 2 - BAND / 2 - 0.045);
}

/** Where a transport tile's owner marker stands: on the printed ship or plane, at the outer end. */
export function markerSpot(i: number): [number, number] {
  const r = tileRect(i);
  const depth = r.side % 2 === 0 ? r.d : r.w;
  return onTile(r, 0, -depth / 2 + 0.34);
}

/** Centre-of-board spots for the bank's coins, the Kabar deck and the dice. */
export const BANK_SPOT: [number, number] = [-1.55, 1.55];
export const DECK_SPOT: [number, number] = [1.55, 1.5];
export const DICE_SPOT: [number, number] = [0.05, 1.45];
