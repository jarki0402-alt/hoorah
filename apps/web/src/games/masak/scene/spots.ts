/** World layout of the cooking-show set (metres). Island top at y = 0; the chef stands behind it. */
import type { Focus } from '../recipes';

export const ISLAND = { x0: -1.45, x1: 1.45, z0: -0.42, z1: 0.42, top: 0 } as const;
export const FLOOR_Y = -0.9;
export const WALL_Z = -1.6;
export const BACK_COUNTER_Z = -1.02;

/** Gas stove on the island: body top and burner positions. */
export const STOVE = { x0: 0.38, x1: 1.32, z: 0.04, top: 0.085, left: 0.62, right: 1.08 } as const;
/** Height of a pan bottom resting on the burner grates. */
export const ON_STOVE = STOVE.top + 0.035;

export type Vec3 = [number, number, number];

export const SPOT: Record<Focus, Vec3> = {
  board: [-0.98, 0, 0.07],
  cobek: [-0.42, 0, 0.1],
  bowl: [-0.42, 0, 0.1],
  tray: [-0.42, 0, 0.08],
  plate: [0.1, 0, 0.16],
  wok: [STOVE.left, ON_STOVE, STOVE.z],
  loyang: [STOVE.left, ON_STOVE, STOVE.z],
  grill: [0.8, 0, 0.04],
  pan: [STOVE.right, ON_STOVE, STOVE.z + 0.02],
};

/** How much of the scene around the spot the station camera shows (radius) and its elevation. */
export const FRAME: Record<Focus, { radius: number; elev: number; lookY: number }> = {
  board: { radius: 0.25, elev: 0.68, lookY: 0.03 },
  cobek: { radius: 0.17, elev: 0.76, lookY: 0.04 },
  bowl: { radius: 0.21, elev: 0.74, lookY: 0.05 },
  tray: { radius: 0.24, elev: 0.78, lookY: 0.02 },
  plate: { radius: 0.2, elev: 0.7, lookY: 0.04 },
  wok: { radius: 0.25, elev: 0.74, lookY: 0.08 },
  loyang: { radius: 0.21, elev: 0.76, lookY: 0.05 },
  grill: { radius: 0.3, elev: 0.7, lookY: 0.09 },
  pan: { radius: 0.18, elev: 0.8, lookY: 0.03 },
};

export const CHEF_POS: Vec3 = [0.08, -0.17, -0.7];
