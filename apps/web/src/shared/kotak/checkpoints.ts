/**
 * Save points of a box-world course: each is a pad (a solid) with spawn spots spread over it, so a
 * group that respawns together does not stack up. Players keep the furthest pad they reached.
 */
import type { V3 } from './math';

export interface SavePoint {
  /** Order along the course (0 = start). */
  index: number;
  /** Pad centre on its top surface. */
  pos: V3;
  /** Half size of the pad top (x, z). */
  hx: number;
  hz: number;
  /** Solid id of the pad (to detect standing on it). */
  solid: number;
}

/** Spawn spot `slot` (0..n) on a pad: a 4-wide grid, centred, inside the pad edges. */
export function spawnSpot(sp: SavePoint, slot: number, of = 8): V3 {
  const cols = Math.min(4, Math.max(1, of));
  const rows = Math.max(1, Math.ceil(of / cols));
  const c = slot % cols;
  const r = Math.floor(slot / cols) % rows;
  const gx = Math.min(1.1, (sp.hx * 2 - 1) / Math.max(1, rows));
  const gz = Math.min(1.3, (sp.hz * 2 - 1) / Math.max(1, cols));
  return {
    x: sp.pos.x + (r - (rows - 1) / 2) * gx,
    y: sp.pos.y + 0.02,
    z: sp.pos.z + (c - (cols - 1) / 2) * gz,
  };
}

export class SaveTrail {
  private readonly reached = new Map<number, number>();

  constructor(readonly points: readonly SavePoint[]) {}

  /** Furthest save point index of a player (0 = start). */
  of(id: number): number {
    return this.reached.get(id) ?? 0;
  }

  point(index: number): SavePoint {
    return this.points[Math.max(0, Math.min(this.points.length - 1, index))]!;
  }

  /** Record standing on pad `index`; true when that is further than before. */
  reach(id: number, index: number): boolean {
    if (index <= this.of(id)) return false;
    this.reached.set(id, index);
    return true;
  }

  reset(id?: number): void {
    if (id === undefined) this.reached.clear();
    else this.reached.delete(id);
  }

  /** Index of the save point whose pad is under `solid`, or -1. */
  bySolid(solid: number): number {
    const sp = this.points.find((p) => p.solid === solid);
    return sp ? sp.index : -1;
  }

  /**
   * The furthest save point at or behind `x` (along +x courses), never behind `floor`: where a
   * straggler is brought back close to the pack.
   */
  nearestBehind(x: number, floor = 0): SavePoint {
    let best = this.point(floor);
    for (const p of this.points)
      if (p.index >= floor && p.pos.x <= x + 0.01 && p.index > best.index) best = p;
    return best;
  }
}
