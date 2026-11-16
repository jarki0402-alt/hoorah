/**
 * Geometry of Rebut Wilayah's free movement: angle helpers, point-to-segment distance and the
 * trail polyline. Coordinates are field cells (floats); the field raster cell `i` spans [i, i+1).
 *
 * A trail is the list of points a runner laid since it left home, sampled every half unit of
 * travel, plus a "live" segment from the last point to the moving head. Points live in growable
 * typed arrays (no allocation per step), with the arc length at every point (for "ignore the
 * part right behind my own head") and a bounding box (for cheap rejection in collision checks).
 */

const TAU = Math.PI * 2;

/** `a` folded into [-PI, PI). */
export function wrapAngle(a: number): number {
  let r = (a + Math.PI) % TAU;
  if (r < 0) r += TAU;
  return r - Math.PI;
}

/** Squared distance from (px, py) to the segment a-b. */
export function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let k = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  k = Math.max(0, Math.min(1, k));
  const ex = ax + dx * k - px;
  const ey = ay + dy * k - py;
  return ex * ex + ey * ey;
}

export class Trail {
  xs: Float64Array;
  ys: Float64Array;
  /** Arc length from the first point to each point. */
  ss: Float64Array;
  len = 0;
  minX = Number.POSITIVE_INFINITY;
  minY = Number.POSITIVE_INFINITY;
  maxX = Number.NEGATIVE_INFINITY;
  maxY = Number.NEGATIVE_INFINITY;

  constructor(capacity = 256) {
    this.xs = new Float64Array(capacity);
    this.ys = new Float64Array(capacity);
    this.ss = new Float64Array(capacity);
  }

  clear(): void {
    this.len = 0;
    this.minX = Number.POSITIVE_INFINITY;
    this.minY = Number.POSITIVE_INFINITY;
    this.maxX = Number.NEGATIVE_INFINITY;
    this.maxY = Number.NEGATIVE_INFINITY;
  }

  push(x: number, y: number): void {
    const n = this.len;
    if (n === this.xs.length) this.grow();
    this.xs[n] = x;
    this.ys[n] = y;
    this.ss[n] = n === 0 ? 0 : this.ss[n - 1]! + Math.hypot(x - this.xs[n - 1]!, y - this.ys[n - 1]!);
    this.len = n + 1;
    if (x < this.minX) this.minX = x;
    if (x > this.maxX) this.maxX = x;
    if (y < this.minY) this.minY = y;
    if (y > this.maxY) this.maxY = y;
  }

  lastX(): number {
    return this.xs[this.len - 1] ?? 0;
  }

  lastY(): number {
    return this.ys[this.len - 1] ?? 0;
  }

  /** Arc length from the first point to a head at (hx, hy), through the last point. */
  arcTo(hx: number, hy: number): number {
    const n = this.len;
    if (n === 0) return 0;
    return this.ss[n - 1]! + Math.hypot(hx - this.xs[n - 1]!, hy - this.ys[n - 1]!);
  }

  /**
   * True when (px, py) lies within `r` of the trail extended to its head (hx, hy). The last
   * `skip` of arc length before the head is ignored (a runner's own fresh trail behind its head),
   * and so is everything up to `from` (where its trail leaves its land).
   */
  hits(px: number, py: number, hx: number, hy: number, r: number, skip: number, from = 0): boolean {
    const n = this.len;
    if (n === 0) return false;
    if (
      px < Math.min(this.minX, hx) - r ||
      px > Math.max(this.maxX, hx) + r ||
      py < Math.min(this.minY, hy) - r ||
      py > Math.max(this.maxY, hy) + r
    ) {
      return false;
    }
    const r2 = r * r;
    const { xs, ys, ss } = this;
    const limit = this.arcTo(hx, hy) - skip;
    for (let i = 0; i + 1 < n; i++) {
      if (ss[i + 1]! > limit) return false;
      if (ss[i + 1]! <= from) continue;
      if (segDist2(px, py, xs[i]!, ys[i]!, xs[i + 1]!, ys[i + 1]!) <= r2) return true;
    }
    if (skip > 0) return false;
    return segDist2(px, py, xs[n - 1]!, ys[n - 1]!, hx, hy) <= r2;
  }

  /** Squared distance from (px, py) to the nearest trail point (every `stride`-th), or Infinity. */
  nearest2(px: number, py: number, stride = 1): number {
    let best = Number.POSITIVE_INFINITY;
    const { xs, ys } = this;
    for (let i = 0; i < this.len; i += stride) {
      const dx = xs[i]! - px;
      const dy = ys[i]! - py;
      const d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
    return best;
  }

  /** Index of the trail point nearest to (px, py) (every `stride`-th), or -1. */
  nearestIndex(px: number, py: number, stride = 1): number {
    let best = Number.POSITIVE_INFINITY;
    let at = -1;
    const { xs, ys } = this;
    for (let i = 0; i < this.len; i += stride) {
      const dx = xs[i]! - px;
      const dy = ys[i]! - py;
      const d = dx * dx + dy * dy;
      if (d < best) {
        best = d;
        at = i;
      }
    }
    return at;
  }

  /** The points as a flat [x0, y0, x1, y1, ...] list (copies; for events, not per frame). */
  toArray(stride = 1): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.len; i += stride) out.push(this.xs[i]!, this.ys[i]!);
    return out;
  }

  private grow(): void {
    const cap = this.xs.length * 2;
    const xs = new Float64Array(cap);
    const ys = new Float64Array(cap);
    const ss = new Float64Array(cap);
    xs.set(this.xs);
    ys.set(this.ys);
    ss.set(this.ss);
    this.xs = xs;
    this.ys = ys;
    this.ss = ss;
  }
}
