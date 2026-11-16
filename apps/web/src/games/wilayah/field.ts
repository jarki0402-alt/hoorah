/**
 * The occupancy raster of Rebut Wilayah: who owns each small cell, whose trail lies on it, and
 * the capture flood fill. Runners move freely in continuous coordinates (cells as floats); this
 * raster is only the bookkeeping behind it, fine enough (3 cells per unit, 3–4 world px each)
 * that the smoothed drawing of it reads as organic shapes, never as blocks.
 *
 * - Owner and trail values are `slot + 1`; 0 means neutral / no trail.
 * - A cell belongs to a shape when its centre (x + 0.5, y + 0.5) lies inside the shape.
 * - A trail becomes land as a round-capped band of radius `r` around its polyline. With r above
 *   0.71 cells the band blocks the 4-connected flood fill even on diagonals.
 * - The trail layer marks where a head would cut a trail (a wider band), with the arc length at
 *   which it was laid, so look-aheads can tell old trail from the stretch right behind a head.
 *
 * Pure and allocation-light: scratch buffers are reused for every capture.
 */
import { segDist2 } from './trail';

export interface Capture {
  /** Every cell that became the capturer's: the trail band first, then the enclosed area. */
  cells: number[];
  /** Wave distance (cells from the trail band) for each entry of `cells`, non-decreasing. */
  dist: number[];
  /** Cells taken from other owners, by owner value. */
  stolen: Map<number, number>;
}

/** What `band` does to each cell it covers. */
const OP_PAINT_TRAIL = 0;
const OP_CLEAR_TRAIL = 1;
const OP_TAKE = 2;

export class Field {
  readonly cols: number;
  readonly rows: number;
  readonly size: number;
  /** Owner per cell: 0 = neutral, otherwise slot + 1. */
  readonly owner: Uint8Array;
  /** Trail per cell: 0 = none, otherwise slot + 1 (the latest trail laid over the cell). */
  readonly trail: Uint8Array;
  /** Arc length (cells along its trail) where the trail on each cell was laid. */
  readonly trailArc: Float32Array;
  /** Cells per owner value; index 0 counts neutral cells. */
  readonly counts: Int32Array;
  private readonly mark: Uint8Array;
  private readonly queue: Int32Array;
  private readonly depth: Uint16Array;
  /** Output of the capture in progress (OP_TAKE appends here). */
  private takeV = 0;
  private takeCells: number[] = [];
  private takeDist: number[] = [];
  private takeStolen = new Map<number, number>();
  private paintArc = 0;

  constructor(cols: number, rows: number, owners = 8) {
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 8 || rows < 8) {
      throw new Error(`Field: bad size ${cols}x${rows}`);
    }
    this.cols = cols;
    this.rows = rows;
    this.size = cols * rows;
    this.owner = new Uint8Array(this.size);
    this.trail = new Uint8Array(this.size);
    this.trailArc = new Float32Array(this.size);
    this.counts = new Int32Array(owners + 1);
    this.counts[0] = this.size;
    this.mark = new Uint8Array(this.size);
    this.queue = new Int32Array(this.size);
    this.depth = new Uint16Array(this.size);
  }

  index(x: number, y: number): number {
    return y * this.cols + x;
  }

  xOf(i: number): number {
    return i % this.cols;
  }

  yOf(i: number): number {
    return (i / this.cols) | 0;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
  }

  /** The cell under a continuous point, clamped into the field. */
  cellAt(x: number, y: number): number {
    const cx = x < 0 ? 0 : x >= this.cols ? this.cols - 1 : x | 0;
    const cy = y < 0 ? 0 : y >= this.rows ? this.rows - 1 : y | 0;
    return cy * this.cols + cx;
  }

  ownerAt(x: number, y: number): number {
    return this.owner[this.cellAt(x, y)]!;
  }

  trailAt(x: number, y: number): number {
    return this.trail[this.cellAt(x, y)]!;
  }

  setOwner(i: number, v: number): void {
    const old = this.owner[i]!;
    if (old === v) return;
    this.counts[old]!--;
    this.counts[v]!++;
    this.owner[i] = v;
  }

  /** Give every cell whose centre lies within `r` of (cx, cy) to `v`. Returns the cells that changed. */
  fillDisc(cx: number, cy: number, r: number, v: number): number[] {
    const out: number[] = [];
    const r2 = r * r;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(this.cols - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(this.rows - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - cy;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        if (dx * dx + dy * dy > r2) continue;
        const i = y * this.cols + x;
        if (this.owner[i] === v) continue;
        this.setOwner(i, v);
        out.push(i);
      }
    }
    return out;
  }

  /** Give a rectangle of cells (clipped to the field) to `v`. Returns the cells that changed. */
  fillRect(x0: number, y0: number, w: number, h: number, v: number): number[] {
    const out: number[] = [];
    const x1 = Math.min(this.cols, x0 + w);
    const y1 = Math.min(this.rows, y0 + h);
    for (let y = Math.max(0, y0); y < y1; y++) {
      for (let x = Math.max(0, x0); x < x1; x++) {
        const i = this.index(x, y);
        if (this.owner[i] === v) continue;
        this.setOwner(i, v);
        out.push(i);
      }
    }
    return out;
  }

  /** Make every cell of `v` neutral. Returns the cells that changed. */
  clearOwner(v: number): number[] {
    const out: number[] = [];
    if (v === 0 || this.counts[v] === 0) return out;
    const owner = this.owner;
    for (let i = 0; i < this.size; i++) {
      if (owner[i] === v) out.push(i);
    }
    for (const i of out) this.setOwner(i, 0);
    return out;
  }

  /**
   * Lay a band of trail `v` along a-b (cells under another trail are taken over), noting `arc`
   * (how far along the trail b lies) on every cell.
   */
  paintTrail(ax: number, ay: number, bx: number, by: number, r: number, v: number, arc: number): void {
    this.paintArc = arc;
    this.band(ax, ay, bx, by, r, OP_PAINT_TRAIL, v);
  }

  /** Lift trail `v` from the band along a polyline (cells another trail has since covered keep it). */
  clearTrail(v: number, xs: ArrayLike<number>, ys: ArrayLike<number>, n: number, r: number): void {
    if (n === 1) this.band(xs[0]!, ys[0]!, xs[0]!, ys[0]!, r, OP_CLEAR_TRAIL, v);
    for (let k = 0; k + 1 < n; k++) this.band(xs[k]!, ys[k]!, xs[k + 1]!, ys[k + 1]!, r, OP_CLEAR_TRAIL, v);
  }

  /**
   * `v` came home along the polyline (xs, ys)[0..n) and on to (hx, hy): the band around it
   * becomes `v`'s land, then every cell the land now encloses (not reachable from the field's
   * edge without crossing `v`) becomes `v`'s too, including other players' cells. The trail is
   * lifted from the raster.
   */
  capture(
    v: number,
    xs: ArrayLike<number>,
    ys: ArrayLike<number>,
    n: number,
    hx: number,
    hy: number,
    r: number,
  ): Capture {
    this.clearTrail(v, xs, ys, n, r);
    if (n > 0) this.band(xs[n - 1]!, ys[n - 1]!, hx, hy, r, OP_CLEAR_TRAIL, v);
    this.takeV = v;
    this.takeCells = [];
    this.takeDist = [];
    this.takeStolen = new Map();
    for (let k = 0; k + 1 < n; k++) this.band(xs[k]!, ys[k]!, xs[k + 1]!, ys[k + 1]!, r, OP_TAKE, v);
    if (n > 0) this.band(xs[n - 1]!, ys[n - 1]!, hx, hy, r, OP_TAKE, v);
    const bandCount = this.takeCells.length;
    this.encloseFrom(v, bandCount);
    const out: Capture = { cells: this.takeCells, dist: this.takeDist, stolen: this.takeStolen };
    this.takeCells = [];
    this.takeDist = [];
    this.takeStolen = new Map();
    return out;
  }

  /** Captures whatever `v`'s land already encloses (tests, and pockets left by a knock-out). */
  enclose(v: number): Capture {
    this.takeV = v;
    this.takeCells = [];
    this.takeDist = [];
    this.takeStolen = new Map();
    this.encloseFrom(v, 0);
    const out: Capture = { cells: this.takeCells, dist: this.takeDist, stolen: this.takeStolen };
    this.takeCells = [];
    this.takeDist = [];
    return out;
  }

  /* ------------------------------------------------------------------ internals */

  private take(i: number, d: number): void {
    const v = this.takeV;
    const old = this.owner[i]!;
    if (old === v) return;
    if (old !== 0) this.takeStolen.set(old, (this.takeStolen.get(old) ?? 0) + 1);
    this.setOwner(i, v);
    this.takeCells.push(i);
    this.takeDist.push(d);
  }

  /** Apply `op` to every cell whose centre lies within `r` of the segment a-b. */
  private band(ax: number, ay: number, bx: number, by: number, r: number, op: number, v: number): void {
    const r2 = r * r;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r - 0.5));
    const x1 = Math.min(this.cols - 1, Math.ceil(Math.max(ax, bx) + r));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r - 0.5));
    const y1 = Math.min(this.rows - 1, Math.ceil(Math.max(ay, by) + r));
    const cols = this.cols;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (segDist2(x + 0.5, y + 0.5, ax, ay, bx, by) > r2) continue;
        const i = y * cols + x;
        if (op === OP_PAINT_TRAIL) {
          this.trail[i] = v;
          this.trailArc[i] = this.paintArc;
        } else if (op === OP_CLEAR_TRAIL) {
          if (this.trail[i] === v) this.trail[i] = 0;
        } else this.take(i, 0);
      }
    }
  }

  /**
   * Flood from the edge over everything that is not `v`: whatever it cannot reach is enclosed and
   * becomes `v`'s, in waves outward from the first `seeds` entries of the capture (the band).
   */
  private encloseFrom(v: number, seeds: number): void {
    const { owner, mark, queue, depth, cols, rows, size } = this;
    mark.fill(0);
    let head = 0;
    let tail = 0;
    const seed = (i: number) => {
      if (mark[i] === 0 && owner[i] !== v) {
        mark[i] = 1;
        queue[tail++] = i;
      }
    };
    for (let x = 0; x < cols; x++) {
      seed(x);
      seed((rows - 1) * cols + x);
    }
    for (let y = 1; y < rows - 1; y++) {
      seed(y * cols);
      seed(y * cols + cols - 1);
    }
    while (head < tail) {
      const i = queue[head++]!;
      const x = i % cols;
      if (x > 0) seed(i - 1);
      if (x < cols - 1) seed(i + 1);
      if (i >= cols) seed(i - cols);
      if (i < size - cols) seed(i + cols);
    }

    let enclosed = 0;
    for (let i = 0; i < size; i++) {
      if (mark[i] === 0 && owner[i] !== v) {
        mark[i] = 2;
        enclosed++;
      }
    }
    if (enclosed === 0) return;

    // Fill wave: breadth-first from the band into the enclosed area.
    head = 0;
    tail = 0;
    const band = this.takeCells;
    for (let k = 0; k < seeds; k++) {
      const i = band[k]!;
      queue[tail++] = i;
      depth[i] = 0;
    }
    let deepest = 0;
    while (head < tail) {
      const i = queue[head++]!;
      const d = depth[i]! + 1;
      const x = i % cols;
      for (let k = 0; k < 4; k++) {
        if ((k === 0 && x === 0) || (k === 1 && x === cols - 1)) continue;
        const n = k === 0 ? i - 1 : k === 1 ? i + 1 : k === 2 ? i - cols : i + cols;
        if (n < 0 || n >= size || mark[n] !== 2) continue;
        mark[n] = 3;
        depth[n] = Math.min(65535, d);
        queue[tail++] = n;
        if (d > deepest) deepest = d;
        this.take(n, d);
      }
    }
    // Pockets that do not touch the band (left behind when a knocked-out owner's cells went
    // neutral inside v's land) arrive last.
    for (let i = 0; i < size; i++) {
      if (mark[i] === 2) this.take(i, deepest + 1);
    }
  }
}
