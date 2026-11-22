/**
 * Satu Tali courses: a route (Tebing Senja, Hutan Bambu, Puncak Salju) is played as a run of short
 * sections ("bagian"), each climbing forward along +x and up: a start pad with a flag, three
 * obstacle segments with a save pad after the second, and a finish pad with a big flag. Platforms
 * are wide so a whole team on one rope fits. Pure data: the same route, section and seed always
 * build the same section.
 */
import { rng, shuffle, type V3, v3 } from '../../shared/kotak/math';
import type { SolidDef } from '../../shared/kotak/solids';

export type RouteId = 'senja' | 'bambu' | 'salju';
export const ROUTES: readonly RouteId[] = ['senja', 'bambu', 'salju'];

export function isRouteId(v: unknown): v is RouteId {
  return typeof v === 'string' && (ROUTES as readonly string[]).includes(v);
}

export type SegmentKind = 'gap' | 'steps' | 'mover' | 'bar' | 'climb' | 'beam' | 'lift';

/** Renderer looks (palette keys in scene.ts, per route). */
export type Look =
  | 'start'
  | 'save'
  | 'finish'
  | 'ground'
  | 'ground2'
  | 'plank'
  | 'mover'
  | 'climb'
  | 'beam'
  | 'bar'
  | 'pole'
  | 'lift';

export interface SavePad {
  index: number;
  solid: number;
  pos: V3;
  hx: number;
  hz: number;
}

export interface Section {
  route: RouteId;
  /** 0-based section number in the session. */
  no: number;
  level: 0 | 1 | 2;
  solids: SolidDef[];
  /** Start pad (0) and the save pad half way (1). */
  saves: SavePad[];
  segments: { kind: SegmentKind; x0: number; x1: number }[];
  startX: number;
  finishX: number;
  /** Solid index of the finish pad. */
  finish: number;
  killY: number;
  /** Seconds a smooth team needs (stars). */
  par: number;
}

/** Each route leans on one obstacle that suits its world. */
const FAVOUR: Record<RouteId, SegmentKind> = { senja: 'steps', bambu: 'beam', salju: 'lift' };

const POOL: Record<0 | 1 | 2, SegmentKind[]> = {
  0: ['gap', 'steps', 'mover'],
  1: ['gap', 'mover', 'bar', 'beam', 'steps', 'lift'],
  2: ['bar', 'climb', 'beam', 'mover', 'lift', 'gap'],
};

const HZ = 2.7;

class Builder {
  readonly solids: SolidDef[] = [];
  readonly saves: SavePad[] = [];
  readonly segments: Section['segments'] = [];
  x = 0;
  y = 0;
  private shade = 0;

  constructor(
    readonly level: 0 | 1 | 2,
    private readonly rnd: () => number,
  ) {}

  ground(): Look {
    this.shade++;
    return this.shade % 2 ? 'ground' : 'ground2';
  }

  /** A block whose top is at `top`, spanning x0..x1 and z -hz..hz, reaching `depth` down. */
  block(
    x0: number,
    x1: number,
    top: number,
    hz: number,
    look: Look,
    extra: Partial<SolidDef> = {},
    depth = 2.4,
  ): number {
    this.solids.push({
      pos: v3((x0 + x1) / 2, top - depth / 2, 0),
      half: v3((x1 - x0) / 2, depth / 2, hz),
      look,
      ...extra,
    });
    return this.solids.length - 1;
  }

  start(): void {
    const id = this.block(-7, 0, 0, HZ + 0.3, 'start', { role: 'checkpoint', tag: 0 }, 3);
    this.saves.push({ index: 0, solid: id, pos: v3(-3.5, 0, 0), hx: 3.5, hz: HZ });
    this.x = 0;
    this.y = 0;
  }

  save(): void {
    const index = this.saves.length;
    const x0 = this.x;
    const id = this.block(x0, x0 + 5, this.y, HZ, 'save', { role: 'checkpoint', tag: index }, 3);
    this.saves.push({ index, solid: id, pos: v3(x0 + 2.5, this.y, 0), hx: 2.5, hz: HZ });
    this.x = x0 + 5;
  }

  finish(): number {
    const x0 = this.x;
    const id = this.block(x0, x0 + 7, this.y, HZ + 0.3, 'finish', { role: 'finish' }, 3);
    this.x = x0 + 7;
    return id;
  }

  segment(kind: SegmentKind): void {
    const x0 = this.x;
    switch (kind) {
      case 'gap':
        this.gap();
        break;
      case 'steps':
        this.steps();
        break;
      case 'mover':
        this.mover();
        break;
      case 'bar':
        this.bar();
        break;
      case 'climb':
        this.climb();
        break;
      case 'beam':
        this.beam();
        break;
      case 'lift':
        this.lift();
        break;
    }
    this.segments.push({ kind, x0, x1: this.x });
  }

  /** Islands with gaps to jump together, each a little higher. */
  private gap(): void {
    const gap = [1.6, 2.1, 2.6][this.level]!;
    const rise = [0, 0.4, 0.6][this.level]!;
    let x = this.x;
    for (let i = 0; i < 3; i++) {
      x += gap;
      this.y += rise;
      const len = 3.4 - this.level * 0.3;
      this.block(x, x + len, this.y, HZ - 0.3, this.ground());
      x += len;
    }
    this.x = x;
  }

  /** Steps too tall to walk up: jump, jump, jump. */
  private steps(): void {
    const n = 3 + (this.level > 0 ? 1 : 0);
    const rise = [1.0, 1.15, 1.3][this.level]!;
    const len = 2.8;
    const look = this.ground();
    for (let i = 0; i < n; i++) {
      const x0 = this.x + i * len;
      this.block(x0, x0 + len, this.y + rise * (i + 1), HZ, look, {}, rise * (i + 1) + 2.4);
    }
    this.x += n * len;
    this.y += rise * n;
  }

  /** A raft sliding back and forth across a wide gap. */
  private mover(): void {
    const gap = 7;
    const half = 1.4;
    const period = [4.8, 4.2, 3.6][this.level]!;
    const travel = gap / 2 - half - 0.45;
    this.solids.push({
      pos: v3(this.x + gap / 2, this.y - 0.3, 0),
      half: v3(half, 0.3, half + 0.4),
      look: 'mover',
      motion: { type: 'slide', offset: v3(travel, 0, 0), period, phase: this.rnd() * Math.PI * 2 },
    });
    this.x += gap;
    this.block(this.x, this.x + 3, this.y, HZ, this.ground());
    this.x += 3;
  }

  /** A wide plate with a low bar sweeping round: everyone jumps as it passes. */
  private bar(): void {
    const len = 9;
    const x0 = this.x;
    this.block(x0, x0 + len, this.y, HZ + 0.3, this.ground());
    this.block(x0 + len / 2 - 0.35, x0 + len / 2 + 0.35, this.y + 1.3, 0.35, 'pole', { role: 'wall' }, 1.3);
    const speed = [1.2, 1.55, 1.9][this.level]! * (this.rnd() < 0.5 ? 1 : -1);
    this.solids.push({
      pos: v3(x0 + len / 2, this.y + 0.45, 0),
      half: v3(4.3, 0.2, 0.2),
      role: 'sweeper',
      look: 'bar',
      motion: { type: 'spin', speed, phase: this.rnd() * Math.PI * 2 },
    });
    this.x = x0 + len;
  }

  /** A climbing wall too tall to jump: hold PEGANG against it to climb, then pull the others up. */
  private climb(): void {
    const x0 = this.x;
    this.block(x0, x0 + 3, this.y, HZ, this.ground());
    const height = this.level >= 2 ? 3.9 : 3.3;
    this.y += height;
    this.block(x0 + 3, x0 + 7, this.y, HZ, 'climb', { role: 'wall' }, height + 2.4);
    this.x = x0 + 7;
  }

  /** A narrow beam over the drop; it rocks on the hardest sections. */
  private beam(): void {
    const len = 8;
    const x0 = this.x + 0.8;
    this.solids.push({
      pos: v3(x0 + len / 2, this.y - 0.3, 0),
      half: v3(len / 2, 0.3, 0.6),
      look: 'beam',
      ...(this.level >= 2 ? { motion: { type: 'swing' as const, amp: 0.14, period: 3.6 } } : {}),
    });
    this.x = x0 + len + 0.8;
    this.block(this.x, this.x + 3, this.y, HZ, this.ground());
    this.x += 3;
  }

  /** A lift going up and down to a higher ledge. */
  private lift(): void {
    const half = 1.5;
    const rise = 2.6;
    const x0 = this.x + 0.6;
    this.solids.push({
      pos: v3(x0 + half, this.y - 0.3 + rise / 2, 0),
      half: v3(half, 0.3, half + 0.5),
      look: 'lift',
      motion: {
        type: 'slide',
        offset: v3(0, rise / 2, 0),
        period: [5.2, 4.6, 4.0][this.level]!,
        phase: -Math.PI / 2,
      },
    });
    this.x = x0 + half * 2 + 0.6;
    this.y += rise;
    this.block(this.x, this.x + 3.5, this.y, HZ, this.ground(), {}, rise + 2.4);
    this.x += 3.5;
  }
}

/** Segments of a section: from the level's pool, the route's favourite in, the climb at the top. */
export function sectionPlan(route: RouteId, no: number, total: number, rnd: () => number): SegmentKind[] {
  const level = levelOf(no, total);
  const pool = POOL[level];
  const order = shuffle(pool, rnd).slice(0, 3);
  const fav = FAVOUR[route];
  if (pool.includes(fav) && !order.includes(fav)) order[1] = fav;
  if (no === total - 1 && total > 1) {
    // The summit: the climbing wall comes last.
    const i = order.indexOf('climb');
    if (i >= 0) order.splice(i, 1);
    order.length = 2;
    order.push('climb');
  } else if (level >= 1 && !order.includes('bar') && no === Math.floor(total / 2)) {
    order[0] = 'bar';
  }
  return order;
}

/** Difficulty of section `no` of `total`: warm-up, escalation, summit. */
export function levelOf(no: number, total: number): 0 | 1 | 2 {
  if (total <= 1) return 0;
  const k = no / (total - 1);
  return k < 0.34 ? 0 : k < 0.67 ? 1 : 2;
}

export function buildSection(route: RouteId, no: number, total: number, seed: number): Section {
  const level = levelOf(no, total);
  const rnd = rng(seed + no * 7919 + ROUTES.indexOf(route) * 104729);
  const b = new Builder(level, rnd);
  b.start();
  const plan = sectionPlan(route, no, total, rnd);
  for (let i = 0; i < plan.length; i++) {
    b.segment(plan[i]!);
    if (i === 1) b.save();
  }
  const finish = b.finish();
  const minY = Math.min(...b.solids.map((s) => s.pos.y - s.half.y));
  return {
    route,
    no,
    level,
    solids: b.solids,
    saves: b.saves,
    segments: b.segments,
    startX: 0,
    finishX: b.x - 7,
    finish,
    killY: minY - 6,
    par: 38 + plan.length * 6 + level * 10,
  };
}
