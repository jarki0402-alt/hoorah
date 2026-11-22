/**
 * Obby courses: a straight run of toy-block obstacles along +x over the sea, built from segments
 * (jump islands, vanishing floor, sweeper bar, conveyor against you, springs, sliding platforms,
 * stairs, a turning disc, a swinging beam) with a save pad between segments. Pure data: the same
 * seed always builds the same course, and the computer runners follow its `route`.
 */
import { rng, shuffle, type V3, v3 } from '../../shared/kotak/math';
import type { SolidDef } from '../../shared/kotak/solids';

export type SegmentKind =
  | 'islands'
  | 'vanish'
  | 'sweeper'
  | 'conveyor'
  | 'springs'
  | 'movers'
  | 'stairs'
  | 'disc'
  | 'beam';

/** Renderer looks (palette keys in scene.ts). */
export type Look =
  | 'start'
  | 'save'
  | 'finish'
  | 'red'
  | 'blue'
  | 'green'
  | 'yellow'
  | 'orange'
  | 'teal'
  | 'fragile'
  | 'belt'
  | 'spring'
  | 'bar'
  | 'pole';

/** A point on the computer runners' path. `jump`: jump when reaching it; `mover`: wait for a ride. */
export interface RoutePoint {
  x: number;
  y: number;
  z: number;
  jump?: boolean;
  /** Solid index to wait for (a sliding platform) before jumping. */
  ride?: number;
  /** Solid index of a sweeper to watch while crossing. */
  sweeper?: number;
  /** Keep the current sideways position (jumping off a platform that slides sideways). */
  lane?: boolean;
}

export interface SavePad {
  index: number;
  /** Solid index of the pad. */
  solid: number;
  pos: V3;
  hx: number;
  hz: number;
}

export interface Course {
  /** 0-based track number in the session. */
  no: number;
  level: 0 | 1 | 2;
  solids: SolidDef[];
  saves: SavePad[];
  route: RoutePoint[];
  /** Segments in order, with their x range (HUD progress bar marks). */
  segments: { kind: SegmentKind; x0: number; x1: number }[];
  startX: number;
  finishX: number;
  /** Below this a runner has fallen. */
  killY: number;
}

const TRACK_SEGMENTS = 7;
const COLORS: Look[] = ['red', 'blue', 'green', 'yellow', 'orange', 'teal'];

/** Segment pools per level: easy obstacles first, the hard ones join later tracks. */
const POOL: Record<0 | 1 | 2, SegmentKind[]> = {
  0: ['islands', 'vanish', 'conveyor', 'stairs', 'springs', 'sweeper', 'movers'],
  1: ['islands', 'vanish', 'sweeper', 'conveyor', 'springs', 'movers', 'disc', 'stairs', 'beam'],
  2: ['vanish', 'sweeper', 'movers', 'disc', 'beam', 'springs', 'conveyor', 'islands', 'stairs'],
};

class Builder {
  readonly solids: SolidDef[] = [];
  readonly saves: SavePad[] = [];
  readonly route: RoutePoint[] = [];
  readonly segments: Course['segments'] = [];
  /** Front edge of the course so far and the floor height there. */
  x = 0;
  y = 0;
  private color = 0;

  constructor(
    readonly level: 0 | 1 | 2,
    private readonly rnd: () => number,
  ) {}

  nextColor(): Look {
    const c = COLORS[this.color % COLORS.length]!;
    this.color++;
    return c;
  }

  /** A block whose top is at `top`, spanning x0..x1 and z -hz..hz (plus z offset). */
  block(
    x0: number,
    x1: number,
    top: number,
    hz: number,
    look: Look,
    extra: Partial<SolidDef> = {},
    z = 0,
    depth = 0.6,
  ): number {
    const def: SolidDef = {
      pos: v3((x0 + x1) / 2, top - depth / 2, z),
      half: v3((x1 - x0) / 2, depth / 2, hz),
      look,
      ...extra,
    };
    this.solids.push(def);
    return this.solids.length - 1;
  }

  go(x: number, y: number, z = 0, more: Partial<RoutePoint> = {}): void {
    this.route.push({ x, y, z, ...more });
  }

  start(): void {
    const id = this.block(-9, 0, 0, 4.5, 'start', { role: 'checkpoint', tag: 0 }, 0, 1);
    this.saves.push({ index: 0, solid: id, pos: v3(-4.5, 0, 0), hx: 4.5, hz: 4.5 });
    this.x = 0;
    this.y = 0;
    this.go(-0.6, 0);
  }

  save(): void {
    const index = this.saves.length;
    const x0 = this.x;
    const id = this.block(x0, x0 + 4, this.y, 4, 'save', { role: 'checkpoint', tag: index }, 0, 0.8);
    this.saves.push({ index, solid: id, pos: v3(x0 + 2, this.y, 0), hx: 2, hz: 4 });
    this.go(x0 + 3.4, this.y);
    this.x = x0 + 4;
  }

  finish(): void {
    const x0 = this.x;
    this.block(x0, x0 + 8, this.y, 4.5, 'finish', { role: 'finish' }, 0, 1);
    this.go(x0 + 3, this.y);
    this.x = x0 + 8;
  }

  segment(kind: SegmentKind): void {
    const x0 = this.x;
    switch (kind) {
      case 'islands':
        this.islands();
        break;
      case 'vanish':
        this.vanish();
        break;
      case 'sweeper':
        this.sweeper();
        break;
      case 'conveyor':
        this.conveyor();
        break;
      case 'springs':
        this.springs();
        break;
      case 'movers':
        this.movers();
        break;
      case 'stairs':
        this.stairs();
        break;
      case 'disc':
        this.disc();
        break;
      case 'beam':
        this.beam();
        break;
    }
    this.segments.push({ kind, x0, x1: this.x });
  }

  /** Three islands with jumps between them, zig-zagging a little. */
  private islands(): void {
    const look = this.nextColor();
    const gap = [1.7, 2.1, 2.5][this.level]!;
    let x = this.x + gap;
    for (let i = 0; i < 3; i++) {
      const z = i === 1 ? (this.rnd() < 0.5 ? -1.4 : 1.4) : 0;
      const len = 2.8 - this.level * 0.2;
      this.go(x - gap - 0.15, this.y, z * 0.5, { jump: true });
      this.block(x, x + len, this.y, 1.8, look, {}, z);
      this.go(x + len - 0.5, this.y, z);
      x += len + gap;
    }
    this.go(x - gap - 0.15, this.y, 0, { jump: true });
    this.x = x;
  }

  /** A field of yellow tiles that crumble a moment after being stepped on. */
  private vanish(): void {
    const cols = 4 + this.level;
    const rows = 3;
    const size = 1.8;
    const gap = 0.24;
    const warn = [0.75, 0.6, 0.48][this.level]!;
    for (let c = 0; c < cols; c++)
      for (let r = 0; r < rows; r++) {
        const x0 = this.x + c * (size + gap);
        const z = (r - 1) * (size + gap);
        this.block(x0, x0 + size, this.y, size / 2, 'fragile', { fragile: { warn, gone: 2.4 } }, z, 0.4);
      }
    const end = this.x + cols * (size + gap) - gap;
    this.go(end - 0.4, this.y, 0);
    this.x = end;
  }

  /** A wide plate with a low bar sweeping round: jump over it. */
  private sweeper(): void {
    const look = this.nextColor();
    const len = 9;
    const x0 = this.x;
    this.block(x0, x0 + len, this.y, 4.5, look, {}, 0, 0.8);
    const speed = [1.5, 2.0, 2.5][this.level]! * (this.rnd() < 0.5 ? 1 : -1);
    this.block(
      x0 + len / 2 - 0.35,
      x0 + len / 2 + 0.35,
      this.y + 1.2,
      0.35,
      'pole',
      { role: 'wall' },
      0,
      1.2,
    );
    this.solids.push({
      pos: v3(x0 + len / 2, this.y + 0.45, 0),
      half: v3(4.2, 0.2, 0.2),
      role: 'sweeper',
      look: 'bar',
      motion: { type: 'spin', speed, phase: this.rnd() * Math.PI * 2 },
    });
    const bar = this.solids.length - 1;
    // Around the pole on the side away from the bar's pivot: keep to z = 2.6.
    this.go(x0 + 1.5, this.y, 2.6, { sweeper: bar });
    this.go(x0 + len - 1.5, this.y, 2.6, { sweeper: bar });
    this.go(x0 + len - 0.3, this.y, 0);
    this.x = x0 + len;
  }

  /** A long belt running against the direction of the race. */
  private conveyor(): void {
    const len = 11;
    const x0 = this.x;
    const speed = [2.2, 2.9, 3.5][this.level]!;
    this.block(x0, x0 + len, this.y, 2.2, 'belt', { conveyor: { x: -speed, z: 0 } }, 0, 0.6);
    this.go(x0 + len - 0.3, this.y, 0);
    this.x = x0 + len;
  }

  /** Springs on a low ledge throw you up onto a higher plate across a gap. */
  private springs(): void {
    const x0 = this.x;
    const look = this.nextColor();
    this.block(x0, x0 + 3.5, this.y, 3, look, {}, 0, 0.8);
    for (const z of [-1.4, 1.4])
      this.block(x0 + 2.4, x0 + 3.5, this.y + 0.2, 0.6, 'spring', { spring: 19, role: 'spring' }, z, 0.2);
    const rise = 2.4;
    const gap = 3 + this.level * 0.3;
    const x1 = x0 + 3.5 + gap;
    this.go(x0 + 2.8, this.y + 0.2, 1.4);
    this.go(x1 + 1.2, this.y + rise, 1);
    this.y += rise;
    this.block(x1, x1 + 3.5, this.y, 3, look, {}, 0, 1);
    this.go(x1 + 3.2, this.y, 0);
    this.x = x1 + 3.5;
  }

  /** Platforms sliding across the gap: hop on when one comes by. */
  private movers(): void {
    const look = this.nextColor();
    const period = [4.2, 3.6, 3.0][this.level]!;
    let x = this.x + 1.6;
    for (let i = 0; i < 2; i++) {
      this.solids.push({
        pos: v3(x + 1.3, this.y - 0.3, 0),
        half: v3(1.3, 0.3, 1.3),
        look,
        motion: { type: 'slide', offset: v3(0, 0, 3.4), period, phase: i * Math.PI },
      });
      const id = this.solids.length - 1;
      this.go(x - 1.6 - 0.2, this.y, 0, { jump: true, ride: id, lane: i > 0 });
      this.go(x + 1.3, this.y, 0, { ride: id });
      x += 2.6 + 1.6;
    }
    this.go(x - 1.6 - 0.2, this.y, 0, { jump: true, lane: true });
    this.x = x;
  }

  /** Steps too tall to walk up: jump, jump, jump. */
  private stairs(): void {
    const look = this.nextColor();
    const steps = 3 + (this.level > 0 ? 1 : 0);
    const len = 2.2;
    for (let i = 0; i < steps; i++) {
      const x0 = this.x + i * len;
      const top = this.y + 0.85 * (i + 1);
      this.go(x0 - 0.35, top - 0.85, 0, { jump: true });
      this.block(x0, x0 + len, top, 3, look, {}, 0, top - this.y + 0.8);
    }
    this.x += steps * len;
    this.y += 0.85 * steps;
    this.go(this.x - 0.4, this.y, 0);
  }

  /** A square disc turning over a gap: jump on, ride, jump off. */
  private disc(): void {
    const look = this.nextColor();
    const gap = 1.4;
    const x0 = this.x + gap;
    const half = 2.8;
    this.solids.push({
      pos: v3(x0 + half, this.y - 0.3, 0),
      half: v3(half, 0.3, half),
      look,
      motion: { type: 'spin', speed: [0.6, 0.85, 1.1][this.level]! * (this.rnd() < 0.5 ? 1 : -1) },
    });
    const id = this.solids.length - 1;
    this.go(this.x - 0.25, this.y, 0, { jump: true });
    this.go(x0 + half, this.y, 0, { ride: id });
    this.go(x0 + half * 2 - 0.4, this.y, 0, { jump: true });
    this.x = x0 + half * 2 + gap;
    this.block(this.x, this.x + 2.5, this.y, 3, look, {}, 0, 0.8);
    this.go(this.x + 2.2, this.y, 0);
    this.x += 2.5;
  }

  /** A narrow beam that rocks from side to side. */
  private beam(): void {
    const len = 10;
    const x0 = this.x;
    this.solids.push({
      pos: v3(x0 + len / 2, this.y - 0.3, 0),
      half: v3(len / 2, 0.3, 0.75 - this.level * 0.08),
      look: 'orange',
      motion: { type: 'swing', amp: [0.12, 0.18, 0.24][this.level]!, period: 3.4 },
    });
    this.go(x0 + len - 0.4, this.y, 0);
    this.x = x0 + len;
  }
}

/**
 * Build track `no` (0-based) of a session. Later tracks are harder; segments are drawn from the
 * level's pool without repeats, so each track feels different.
 */
export function buildCourse(no: number, seed: number): Course {
  const level = Math.min(2, Math.max(0, no)) as 0 | 1 | 2;
  const rnd = rng(seed + no * 7919);
  const b = new Builder(level, rnd);
  b.start();
  const pool = POOL[level];
  // Keep a gentle opener: the first segment of the first track is always the islands.
  const order = shuffle(pool, rnd).slice(0, TRACK_SEGMENTS);
  if (no === 0) {
    const i = order.indexOf('islands');
    if (i > 0) [order[0], order[i]] = [order[i]!, order[0]!];
    else if (i < 0) order[0] = 'islands';
  }
  for (let i = 0; i < order.length; i++) {
    b.segment(order[i]!);
    if (i < order.length - 1) b.save();
  }
  b.finish();
  const minY = Math.min(...b.solids.map((s) => s.pos.y - s.half.y));
  return {
    no,
    level,
    solids: b.solids,
    saves: b.saves,
    route: b.route,
    segments: b.segments,
    startX: 0,
    finishX: b.x - 8,
    killY: minY - 7,
  };
}
