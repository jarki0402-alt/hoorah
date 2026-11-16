/**
 * Lari Terus track: a seeded, endless line of city rooftops with gaps between buildings,
 * obstacles in three lanes and coins. Pure (no DOM, no three.js): the rules, the computer
 * runners and the 3D view all read it, and the tests check that every row can be passed.
 *
 * Distances are metres along the run (d grows forward). Lanes are -1 (left), 0 and 1 (right).
 * The track is generated one whole roof at a time, so a roof, its obstacles and its coins appear
 * together. Arrays stay sorted by `d` (obstacles by centre) so lookups can binary search.
 *
 * Fairness rules (checked by the tests):
 *  - every row leaves at least one lane without a block,
 *  - rows are at least ~1 s apart at the speed the pack will have there,
 *  - nothing stands right before or right after a gap, and every gap is at most half a jump long.
 */

export type ObstacleKind = 'low' | 'high' | 'block' | 'gap';

export interface Obstacle {
  readonly id: number;
  /** Rows group the obstacles placed side by side. */
  readonly row: number;
  readonly kind: ObstacleKind;
  /** Lane of a one-lane obstacle; 0 for obstacles spanning the roof. */
  readonly lane: number;
  /** 1 = one lane, 3 = every lane (gaps always span every lane). */
  readonly span: 1 | 3;
  /** Centre along the run (m). */
  readonly d: number;
  /** Extent along the run (m). */
  readonly len: number;
  /** Visual variant for the 3D view (see `VARIANTS`). */
  readonly variant: number;
}

export interface Roof {
  readonly id: number;
  readonly start: number;
  readonly end: number;
  /** 0..1, stable per roof: picks the building's look. */
  readonly look: number;
}

export interface Coin {
  readonly id: number;
  readonly lane: number;
  readonly d: number;
  /** Height of the coin centre above the roof (m). */
  readonly y: number;
  taken: boolean;
}

/**
 * Visual variants per kind. low: 0 pipe rack, 1 striped sawhorse, 2 duct across the roof.
 * high: 0 signboard on posts, 1 laundry line, 2 laundry line across the roof.
 * block: 0 AC stack, 1 water tank on a stand, 2 crate stack, 3 row of AC units (long).
 */
export const VARIANTS = {
  low: { single: [0, 1], wide: 2 },
  high: { single: [0, 1], wide: 2 },
  block: { single: [0, 1, 2], long: 3 },
} as const;

/** Extent along the run of each block variant (m). */
export const BLOCK_LEN = [1.3, 1.7, 1.3] as const;
export const LOW_LEN = 0.5;
export const HIGH_LEN = 0.35;

export interface TrackOptions {
  seed: number;
  /** Pack speed (m/s) expected when the pack reaches distance d. */
  speedAt: (d: number) => number;
  /** Seconds a jump stays in the air. */
  airTime: number;
  /** Jump apex height of the feet (m). */
  jumpPeak: number;
}

/** First obstacle row: about five seconds of free running after the start. */
export const FIRST_ROW = 46;
/** Height of a coin line (centre). */
export const COIN_Y = 0.85;

type Pattern =
  | 'low1'
  | 'block1'
  | 'high1'
  | 'low3'
  | 'high3'
  | 'block2'
  | 'mix'
  | 'block2low'
  | 'block2high'
  | 'long';

/** [pattern, weight at the start, weight at full difficulty] */
const PATTERNS: readonly [Pattern, number, number][] = [
  ['low1', 3, 1.2],
  ['block1', 3, 1],
  ['high1', 2, 1],
  ['low3', 1.2, 1.4],
  ['high3', 0.8, 1.4],
  ['block2', 0.8, 2.4],
  ['mix', 0, 2],
  ['block2low', 0, 1.5],
  ['block2high', 0, 1.5],
  ['long', 0.6, 1.4],
];

/** Mulberry32: tiny, fast and good enough for level layouts. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 0 at the start, 1 from about 2.6 km on (eased). */
export function difficultyAt(d: number): number {
  const k = Math.min(1, Math.max(0, d / 2600));
  return k * (2 - k);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Index of the first item whose `d` is >= `d` (items sorted by d). */
export function lowerBound(items: readonly { d: number }[], d: number): number {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid]!.d < d) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export class Track {
  readonly roofs: Roof[] = [];
  readonly obstacles: Obstacle[] = [];
  readonly coins: Coin[] = [];
  private readonly rnd: () => number;
  private nextId = 1;
  private nextRow = 1;
  private nextRoof = 1;
  private roofStart = -220;
  private roofEnd: number;
  /** Where the next row may start. */
  private cursor = FIRST_ROW;
  /** Obstacles and coins of the roof being filled; sorted and published when it closes. */
  private pendingObs: Obstacle[] = [];
  private pendingCoins: Coin[] = [];
  /** Lane of the last coin line, so lines wander a little. */
  private coinLane = 0;

  constructor(private readonly opts: TrackOptions) {
    this.rnd = seededRandom(opts.seed);
    this.roofEnd = 150 + this.rnd() * 50;
  }

  /** Far end of the generated track. */
  get end(): number {
    const last = this.roofs[this.roofs.length - 1];
    return last ? last.end : this.roofStart;
  }

  /** Generate whole roofs until the track reaches `upTo`. */
  ensure(upTo: number): void {
    let guard = 0;
    while (this.end < upTo && guard++ < 10_000) this.step();
  }

  /** Forget everything that ends before `before` (behind the pack). */
  prune(before: number): void {
    dropWhile(this.roofs, (r) => r.end < before);
    dropWhile(this.obstacles, (o) => o.d + o.len / 2 < before - 8);
    dropWhile(this.coins, (c) => c.d < before);
  }

  /** The gap under distance `d`, if any. */
  gapAt(d: number): Obstacle | null {
    const obs = this.obstacles;
    for (let i = Math.max(0, lowerBound(obs, d - 8)); i < obs.length; i++) {
      const o = obs[i]!;
      if (o.d - o.len / 2 > d) break;
      if (o.kind === 'gap' && Math.abs(d - o.d) < o.len / 2) return o;
    }
    return null;
  }

  /** The roof under distance `d`, if any (null over a gap). */
  roofAt(d: number): Roof | null {
    for (const r of this.roofs) if (d >= r.start && d < r.end) return r;
    return null;
  }

  /* ---------------------------------------------------------------- generation */

  private id(): number {
    return this.nextId++;
  }

  private step(): void {
    const d = this.cursor;
    const v = this.opts.speedAt(d);
    const diff = difficultyAt(d);
    const pattern = this.pick(diff);
    const longLen = pattern === 'long' ? lerp(6, 11, this.rnd()) : 0;
    const need = Math.max(longLen, 1.8);
    // Keep about a second of open roof before the edge so the gap gets its own jump.
    if (d + need + v * 1.0 > this.roofEnd) {
      this.closeRoof();
      return;
    }
    this.placeRow(pattern, d, longLen, diff);
    const gapT = lerp(2.3, 1.15, diff) * (1 + this.rnd() * 0.4);
    const hard = pattern === 'mix' || pattern.startsWith('block2') ? 0.15 : 0;
    const next = d + need + v * (gapT + hard);
    this.addCoinLine(pattern, d + need, Math.min(next, this.roofEnd - 1));
    this.cursor = next;
  }

  private pick(diff: number): Pattern {
    let total = 0;
    for (const [, a, b] of PATTERNS) total += lerp(a, b, diff);
    let x = this.rnd() * total;
    for (const [p, a, b] of PATTERNS) {
      x -= lerp(a, b, diff);
      if (x <= 0) return p;
    }
    return 'low1';
  }

  private lane(): number {
    return Math.floor(this.rnd() * 3) - 1;
  }

  private choice<T>(list: readonly T[]): T {
    return list[Math.floor(this.rnd() * list.length) % list.length]!;
  }

  private obstacle(
    row: number,
    kind: ObstacleKind,
    lane: number,
    span: 1 | 3,
    front: number,
    len: number,
    variant: number,
  ): Obstacle {
    const o: Obstacle = { id: this.id(), row, kind, lane, span, d: front + len / 2, len, variant };
    this.pendingObs.push(o);
    return o;
  }

  private single(row: number, kind: 'low' | 'high' | 'block', lane: number, front: number): Obstacle {
    if (kind === 'low')
      return this.obstacle(row, 'low', lane, 1, front, LOW_LEN, this.choice(VARIANTS.low.single));
    if (kind === 'high')
      return this.obstacle(row, 'high', lane, 1, front, HIGH_LEN, this.choice(VARIANTS.high.single));
    const variant = this.choice(VARIANTS.block.single);
    return this.obstacle(row, 'block', lane, 1, front, BLOCK_LEN[variant as 0 | 1 | 2], variant);
  }

  private placeRow(p: Pattern, d: number, longLen: number, diff: number): void {
    const row = this.nextRow++;
    const free = this.lane();
    const others = [-1, 0, 1].filter((l) => l !== free);
    switch (p) {
      case 'low1': {
        const o = this.single(row, 'low', this.lane(), d);
        if (this.rnd() < 0.45) this.addArc(o.lane, o.d);
        break;
      }
      case 'block1':
        this.single(row, 'block', this.lane(), d);
        break;
      case 'high1':
        this.single(row, 'high', this.lane(), d);
        break;
      case 'low3': {
        const o = this.obstacle(row, 'low', 0, 3, d, 0.7, VARIANTS.low.wide);
        if (this.rnd() < 0.5) this.addArc(this.lane(), o.d);
        break;
      }
      case 'high3':
        this.obstacle(row, 'high', 0, 3, d, HIGH_LEN, VARIANTS.high.wide);
        break;
      case 'block2':
        for (const l of others) this.single(row, 'block', l, d);
        break;
      case 'block2low':
      case 'block2high':
        for (const l of others) this.single(row, 'block', l, d);
        this.single(row, p === 'block2low' ? 'low' : 'high', free, d);
        break;
      case 'mix': {
        const kinds: ('low' | 'high' | 'block')[] = ['low', 'high', 'block'];
        for (let i = kinds.length - 1; i > 0; i--) {
          const j = Math.floor(this.rnd() * (i + 1));
          [kinds[i], kinds[j]] = [kinds[j]!, kinds[i]!];
        }
        [-1, 0, 1].forEach((l, i) => {
          this.single(row, kinds[i]!, l, d);
        });
        break;
      }
      case 'long': {
        // One long row of AC units, two when the run is hard; the free lane gets coins.
        const lanes = diff > 0.35 && this.rnd() < 0.5 ? others : [this.choice(others)];
        for (const l of lanes) this.obstacle(row, 'block', l, 1, d, longLen, VARIANTS.block.long);
        if (this.rnd() < 0.8) {
          const n = Math.max(3, Math.floor(longLen / 2));
          for (let i = 0; i < n; i++)
            this.coin(free, d + 1 + (i * (longLen - 2)) / Math.max(1, n - 1), COIN_Y);
        }
        break;
      }
    }
  }

  private coin(lane: number, d: number, y: number): void {
    this.pendingCoins.push({ id: this.id(), lane, d, y, taken: false });
  }

  /** Coins along a jump arc centred on `centre` (over a low barrier or a gap). */
  private addArc(lane: number, centre: number, half = 3.2): void {
    const n = 5;
    for (let i = 0; i < n; i++) {
      const u = (i / (n - 1)) * 2 - 1;
      this.coin(lane, centre + u * half, COIN_Y + this.opts.jumpPeak * 0.95 * (1 - u * u));
    }
  }

  /** A line of coins on the open roof between two rows. */
  private addCoinLine(p: Pattern, from: number, to: number): void {
    if (p === 'long' || this.rnd() > 0.55) return;
    const start = from + 3;
    const stop = to - 3;
    const n = Math.min(9, Math.floor((stop - start) / 2.2));
    if (n < 3) return;
    const step = this.rnd() < 0.5 ? 0 : this.rnd() < 0.5 ? -1 : 1;
    this.coinLane = Math.max(-1, Math.min(1, this.coinLane + step));
    for (let i = 0; i < n; i++) this.coin(this.coinLane, start + i * 2.2, COIN_Y);
  }

  private closeRoof(): void {
    const end = this.roofEnd;
    const v = this.opts.speedAt(end);
    const diff = difficultyAt(end);
    let next = end;
    if (this.rnd() < lerp(0.55, 0.85, diff)) {
      const max = 0.5 * v * this.opts.airTime;
      const len = Math.max(2.2, Math.min(max, lerp(2.6, 4.4, diff) * (0.9 + this.rnd() * 0.2)));
      const row = this.nextRow++;
      this.obstacle(row, 'gap', 0, 3, end, len, 0);
      if (this.rnd() < 0.5) this.addArc(this.lane(), end + len / 2, Math.max(2.6, len * 0.75));
      next = end + len;
    }
    this.publish();
    this.roofs.push({ id: this.nextRoof++, start: this.roofStart, end, look: this.rnd() });
    this.roofStart = next;
    this.roofEnd = next + lerp(95, 50, diff) * (0.75 + this.rnd() * 0.6);
    // Land on open roof: rows wait a beat after a gap.
    const vNext = this.opts.speedAt(next);
    this.cursor = Math.max(this.cursor, next + (next > end ? vNext * 0.9 : 2));
  }

  private publish(): void {
    this.pendingObs.sort((a, b) => a.d - b.d);
    this.pendingCoins.sort((a, b) => a.d - b.d);
    for (const o of this.pendingObs) this.obstacles.push(o);
    for (const c of this.pendingCoins) this.coins.push(c);
    this.pendingObs = [];
    this.pendingCoins = [];
  }
}

function dropWhile<T>(list: T[], dead: (t: T) => boolean): void {
  let n = 0;
  while (n < list.length && dead(list[n]!)) n++;
  if (n > 0) list.splice(0, n);
}
