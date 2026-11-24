/**
 * The Nyebrang world as pure data: an endless column of lanes (rows) generated from a seed, the
 * same on every run of the same ronde. Moving things are closed-form functions of time (no
 * simulation state), so the logic, the computer runners and the renderer all ask the same
 * question ("where is that angkot at time t?") and always get the same answer.
 *
 * Coordinates: columns 0..COLS-1 are playable (cell c spans [c-0.5, c+0.5]); lanes extend past
 * both sides for scenery and for traffic to enter and leave off screen. Row 0 is the start line;
 * rows grow upward.
 */

export const COLS = 11;
/** Columns of scenery drawn past each side of the playable strip. */
export const EXT = 9;
/** Where traffic wraps around, well off screen on both sides. */
export const X_MIN = -EXT - 4;
export const X_MAX = COLS - 1 + EXT + 4;
export const SPAN = X_MAX - X_MIN;
/** Rows of safe start area. */
export const START_ROWS = 3;
/** Seconds a train's warning light flashes before it arrives. */
export const TRAIN_WARN = 1.5;

export type MapId = 'kota' | 'sungai' | 'rel' | 'malam';
export const MAPS: readonly MapId[] = ['kota', 'sungai', 'rel', 'malam'];

export type LaneKind = 'start' | 'grass' | 'road' | 'river' | 'rail' | 'finish';
export type ItemKind = 'motor' | 'angkot' | 'bajaj' | 'bus' | 'truk' | 'log' | 'pad';
export type PropKind = 'pohon' | 'pot' | 'batu' | 'semak' | 'lampu' | 'peti' | 'tiang';

export interface Item {
  /** Left edge (cells) at t = 0 along the wrap, before X_MIN is added. */
  start: number;
  len: number;
  kind: ItemKind;
  /** Visual variant (colour). */
  tint: number;
}

export interface Lane {
  row: number;
  kind: LaneKind;
  /** Cells per second; positive moves right. 0 for static lanes. */
  speed: number;
  items: Item[];
  /** Static obstacles per playable column (grass lanes). */
  props: (PropKind | null)[];
  /** Visual variant: e.g. a sidewalk instead of grass next to a road. */
  variant: number;
  /** Rail lanes: seconds between trains, phase offset, train length and speed. */
  train?: { period: number; offset: number; len: number; speed: number };
}

export interface ItemPos {
  left: number;
  len: number;
  kind: ItemKind;
  tint: number;
  /** Stable id of this item pass (changes each wrap), for near-miss bookkeeping. */
  key: number;
}

/* ------------------------------------------------------------------ rng */

export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mod = (a: number, n: number): number => ((a % n) + n) % n;

/* ------------------------------------------------------------------ positions */

/** Every moving item of a road or river lane at time t (rail lanes: the train, if present). */
export function itemsAt(lane: Lane, t: number, out: ItemPos[] = []): ItemPos[] {
  out.length = 0;
  if (lane.kind === 'rail') {
    const tr = trainAt(lane, t);
    if (tr) out.push(tr);
    return out;
  }
  for (let i = 0; i < lane.items.length; i++) {
    const it = lane.items[i]!;
    const raw = it.start + lane.speed * t;
    const left = X_MIN + mod(raw, SPAN);
    out.push({ left, len: it.len, kind: it.kind, tint: it.tint, key: i * 1000 + Math.floor(raw / SPAN) });
  }
  return out;
}

/** 0 = no train near, 1 = warning light, 2 = train passing. */
export function trainState(lane: Lane, t: number): 0 | 1 | 2 {
  const tr = lane.train;
  if (!tr) return 0;
  const phase = mod(t + tr.offset, tr.period);
  if (phase < TRAIN_WARN) return 1;
  const pass = (SPAN + tr.len) / Math.abs(tr.speed);
  return phase < TRAIN_WARN + pass ? 2 : 0;
}

export function trainAt(lane: Lane, t: number): ItemPos | null {
  const tr = lane.train;
  if (!tr) return null;
  const phase = mod(t + tr.offset, tr.period);
  const run = phase - TRAIN_WARN;
  const pass = (SPAN + tr.len) / Math.abs(tr.speed);
  if (run < 0 || run >= pass) return null;
  const left = tr.speed > 0 ? X_MIN - tr.len + run * tr.speed : X_MAX + run * tr.speed;
  return { left, len: tr.len, kind: 'truk', tint: -1, key: Math.floor((t + tr.offset) / tr.period) };
}

/** Half-width of a runner's body (cells) for collisions. */
export const BODY = 0.3;
/** Vehicles are drawn with a little air; this much of each end does not hurt. */
const SOFT = 0.1;

/** The vehicle or train in `lane` hitting a runner at x, if any. */
export function hitAt(lane: Lane, t: number, x: number, buf: ItemPos[] = []): ItemPos | null {
  if (lane.kind !== 'road' && lane.kind !== 'rail') return null;
  for (const it of itemsAt(lane, t, buf)) {
    if (x + BODY > it.left + SOFT && x - BODY < it.left + it.len - SOFT) return it;
  }
  return null;
}

/** Closest gap (cells) between a runner at x and any vehicle of the lane; Infinity if none. */
export function gapAt(lane: Lane, t: number, x: number, buf: ItemPos[] = []): { gap: number; key: number } {
  let best = Number.POSITIVE_INFINITY;
  let key = -1;
  if (lane.kind !== 'road' && lane.kind !== 'rail') return { gap: best, key };
  for (const it of itemsAt(lane, t, buf)) {
    const g = Math.max(it.left + SOFT - (x + BODY), x - BODY - (it.left + it.len - SOFT));
    if (g < best) {
      best = g;
      key = it.key;
    }
  }
  return { gap: best, key };
}

/** The log or lily pad under x in a river lane at time t, or null (water). */
export function platformAt(lane: Lane, t: number, x: number, buf: ItemPos[] = []): ItemPos | null {
  if (lane.kind !== 'river') return null;
  for (const it of itemsAt(lane, t, buf)) {
    if (x > it.left - 0.22 && x < it.left + it.len + 0.22) return it;
  }
  return null;
}

/** Can a runner stand on this cell of a land lane? */
export function isOpen(lane: Lane, col: number): boolean {
  if (col < 0 || col > COLS - 1) return false;
  if (lane.kind === 'river') return false;
  return !lane.props[col];
}

export function isLand(kind: LaneKind): boolean {
  return kind === 'start' || kind === 'grass' || kind === 'finish';
}

/* ------------------------------------------------------------------ generation */

interface Recipe {
  /** Weights of the next segment kind after a grass strip. */
  segments: { kind: 'road' | 'river' | 'rail'; w: number }[];
  vehicles: ItemKind[];
  props: PropKind[];
  /** Base and extra (at full difficulty) lane speed, cells/s. */
  speed: [number, number];
}

const RECIPES: Record<MapId, Recipe> = {
  kota: {
    segments: [
      { kind: 'road', w: 8 },
      { kind: 'river', w: 1 },
      { kind: 'rail', w: 1 },
    ],
    vehicles: ['motor', 'angkot', 'angkot', 'bajaj', 'bus'],
    props: ['pohon', 'pot', 'pohon', 'semak'],
    speed: [1.6, 2.4],
  },
  sungai: {
    segments: [
      { kind: 'river', w: 7 },
      { kind: 'road', w: 2 },
    ],
    vehicles: ['motor', 'angkot', 'bajaj'],
    props: ['batu', 'semak', 'pohon', 'batu'],
    speed: [1.0, 1.6],
  },
  rel: {
    segments: [
      { kind: 'rail', w: 5 },
      { kind: 'road', w: 4 },
      { kind: 'river', w: 1 },
    ],
    vehicles: ['motor', 'angkot', 'truk'],
    props: ['peti', 'tiang', 'semak', 'peti'],
    speed: [1.5, 2.2],
  },
  malam: {
    segments: [
      { kind: 'road', w: 7 },
      { kind: 'rail', w: 2 },
      { kind: 'river', w: 1 },
    ],
    vehicles: ['motor', 'angkot', 'bajaj', 'truk'],
    props: ['lampu', 'pohon', 'pot', 'lampu'],
    speed: [1.4, 2.2],
  },
};

const VEHICLE_LEN: Record<ItemKind, number> = {
  motor: 1,
  angkot: 2,
  bajaj: 1,
  bus: 3,
  truk: 3,
  log: 3,
  pad: 1,
};

function pickWeighted<T extends { w: number }>(list: readonly T[], rnd: () => number): T {
  const total = list.reduce((s, x) => s + x.w, 0);
  let r = rnd() * total;
  for (const x of list) {
    r -= x.w;
    if (r <= 0) return x;
  }
  return list[list.length - 1]!;
}

/**
 * Lanes of one ronde, generated on demand and cached. Static rows (grass, lily pads) always
 * leave a path: every grass row keeps open columns that the row below can reach.
 */
export class World {
  readonly map: MapId;
  /** Balapan finish row, or null for Bertahan (endless). */
  readonly finish: number | null;
  /** The seed the lanes grow from (a far-away screen rebuilds the same world from it). */
  readonly seed: number;
  private readonly rnd: () => number;
  private readonly lanes: Lane[] = [];
  /** Plan of upcoming lane kinds (segments are planned a few rows at a time). */
  private plan: LaneKind[] = [];
  private lastDir = 1;

  constructor(map: MapId, seed: number, finish: number | null) {
    this.map = map;
    this.finish = finish;
    this.seed = seed >>> 0;
    this.rnd = mulberry(this.seed);
  }

  lane(row: number): Lane {
    if (row < 0) return this.lane(0);
    while (this.lanes.length <= row) this.lanes.push(this.make(this.lanes.length));
    return this.lanes[row]!;
  }

  /** Difficulty 0..1 by distance. */
  static difficulty(row: number): number {
    return Math.max(0, Math.min(1, (row - START_ROWS) / 110));
  }

  private make(row: number): Lane {
    const blank = (kind: LaneKind): Lane => ({
      row,
      kind,
      speed: 0,
      items: [],
      props: new Array<PropKind | null>(COLS).fill(null),
      variant: 0,
    });
    if (row < START_ROWS) return blank('start');
    if (this.finish !== null && row >= this.finish) return blank('finish');
    if (this.plan.length === 0) this.planSegment(row);
    const kind = this.plan.shift() ?? 'grass';
    const d = World.difficulty(row);
    const prev = this.lanes[row - 1];
    switch (kind) {
      case 'road':
        return this.road(row, d);
      case 'river':
        return this.river(row, d, prev);
      case 'rail':
        return this.rail(row, d);
      default:
        return this.grass(row, d, prev);
    }
  }

  /** Next block: a strip of grass, then a run of the map's hazard. */
  private planSegment(row: number): void {
    const d = World.difficulty(row);
    const r = RECIPES[this.map];
    const grass = 1 + (this.rnd() < 0.45 - d * 0.3 ? 1 : 0);
    for (let i = 0; i < grass; i++) this.plan.push('grass');
    const seg = pickWeighted(r.segments, this.rnd).kind;
    const maxRun = seg === 'rail' ? 2 : seg === 'river' ? 2 + Math.round(d * 3) : 2 + Math.round(d * 3);
    const run = 1 + Math.floor(this.rnd() * maxRun);
    for (let i = 0; i < run; i++) this.plan.push(seg);
  }

  private grass(row: number, d: number, prev: Lane | undefined): Lane {
    const props = new Array<PropKind | null>(COLS).fill(null);
    const r = RECIPES[this.map];
    // Columns the row below can reach (land: open cells; hazards: everything).
    const reach: boolean[] = [];
    for (let c = 0; c < COLS; c++) {
      if (!prev) reach.push(true);
      else if (isLand(prev.kind)) reach.push(!prev.props[c]);
      else if (prev.kind === 'river' && prev.speed === 0)
        reach.push(prev.items.some((it) => it.start + X_MIN === c - 0.5));
      else reach.push(true);
    }
    const count = Math.floor(this.rnd() * (2 + d * 3.5));
    const order = Array.from({ length: COLS }, (_, i) => i).sort(() => this.rnd() - 0.5);
    let placed = 0;
    for (const c of order) {
      if (placed >= count) break;
      props[c] = r.props[Math.floor(this.rnd() * r.props.length)]!;
      placed++;
    }
    // Keep at least three columns open that the row below can reach.
    const openReach = () => props.filter((p, c) => !p && reach[c]).length;
    for (let c = 0; c < COLS && openReach() < 3; c++) {
      const col = (Math.floor(COLS / 2) + (c % 2 ? -Math.ceil(c / 2) : Math.ceil(c / 2)) + COLS) % COLS;
      if (reach[col]) props[col] = null;
    }
    const lane: Lane = { row, kind: 'grass', speed: 0, items: [], props, variant: 0 };
    const near = prev && (prev.kind === 'road' || prev.kind === 'rail');
    lane.variant = this.map === 'kota' || this.map === 'malam' ? (near ? 1 : 0) : this.map === 'rel' ? 2 : 0;
    return lane;
  }

  private road(row: number, d: number): Lane {
    const r = RECIPES[this.map];
    this.lastDir = this.rnd() < 0.7 ? -this.lastDir : this.lastDir;
    const dir = this.lastDir;
    const kind = r.vehicles[Math.floor(this.rnd() * r.vehicles.length)]!;
    const fast = kind === 'motor' || kind === 'bajaj';
    const base = r.speed[0] + r.speed[1] * d;
    const speed =
      dir * base * (fast ? 1.35 : kind === 'bus' || kind === 'truk' ? 0.75 : 1) * (0.85 + this.rnd() * 0.3);
    const len = VEHICLE_LEN[kind];
    // Gaps shrink with difficulty but always leave room to cross.
    const minGap = Math.max(2.4, 5.2 - d * 2.6) + len * 0.4;
    const items: Item[] = [];
    let x = this.rnd() * 4;
    while (x + len < SPAN - minGap * 0.6) {
      items.push({ start: x, len, kind, tint: Math.floor(this.rnd() * 4) });
      x += len + minGap + this.rnd() * (4 - d * 2);
    }
    return {
      row,
      kind: 'road',
      speed,
      items,
      props: new Array<PropKind | null>(COLS).fill(null),
      variant: 0,
    };
  }

  private river(row: number, d: number, prev: Lane | undefined): Lane {
    // A single row of lily pads between land rows; otherwise drifting logs.
    const padsOk = prev && isLand(prev.kind) && this.plan[0] !== 'river';
    if (padsOk && this.rnd() < 0.45) {
      const items: Item[] = [];
      const cols: number[] = [];
      for (let c = 0; c < COLS; c++) if (!prev!.props[c] && this.rnd() < 0.55 - d * 0.15) cols.push(c);
      // Pads must be reachable from the row below.
      for (let c = 0; cols.length < 3 && c < COLS; c++)
        if (!prev!.props[c] && !cols.includes(c)) cols.push(c);
      for (const c of cols)
        items.push({ start: c - 0.5 - X_MIN, len: 1, kind: 'pad', tint: Math.floor(this.rnd() * 3) });
      return {
        row,
        kind: 'river',
        speed: 0,
        items,
        props: new Array<PropKind | null>(COLS).fill(null),
        variant: 1,
      };
    }
    this.lastDir = -this.lastDir;
    const speed = this.lastDir * (0.9 + d * 1.1) * (0.85 + this.rnd() * 0.35);
    const items: Item[] = [];
    const maxLen = Math.max(2, Math.round(4 - d * 1.5));
    let x = this.rnd() * 2;
    while (x < SPAN - 2) {
      const len = 2 + Math.floor(this.rnd() * (maxLen - 1));
      items.push({ start: x, len, kind: 'log', tint: Math.floor(this.rnd() * 3) });
      x += len + 1.2 + d * 1.4 + this.rnd() * (1.6 + d * 1.2);
    }
    return {
      row,
      kind: 'river',
      speed,
      items,
      props: new Array<PropKind | null>(COLS).fill(null),
      variant: 0,
    };
  }

  private rail(row: number, d: number): Lane {
    const dir = this.rnd() < 0.5 ? -1 : 1;
    const period = Math.max(4.2, 8.5 - d * 3.5) + this.rnd() * 3;
    return {
      row,
      kind: 'rail',
      speed: 0,
      items: [],
      props: new Array<PropKind | null>(COLS).fill(null),
      variant: 0,
      train: {
        period,
        offset: this.rnd() * period,
        len: 9 + Math.floor(this.rnd() * 6),
        speed: dir * (24 + d * 8),
      },
    };
  }
}
