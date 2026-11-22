/**
 * One Petualangan Warna stage as a fixed-step platformer simulation (pure, no rendering).
 *
 * Units are tiles, +y down, positions are top-left corners. Every step runs in this order:
 * triggers (plates, levers) → doors → lifts → boxes → characters (lowest first, so a character
 * standing on another one rides along) → pickups, checkpoints and exits. Riders move with what
 * they stand on (lift, box, another character).
 *
 * Forgiving jumps: coyote time after leaving a ledge, a jump buffer before landing, a lower
 * jump when the button is released early and a short hang at the top. Characters never block
 * each other sideways (no shoving matches), only from above (standing on a friend's shoulders).
 */
import {
  Cell,
  COLS,
  cellAt,
  colorCount,
  foldSlot,
  type Level,
  type LiftDef,
  metaAt,
  ROWS,
  type Slot,
} from './levels';

export const TUNE = {
  step: 1 / 120,
  run: 6.4,
  accelGround: 72,
  accelAir: 46,
  decelGround: 90,
  gravity: 52,
  jumpV: 16,
  fallMax: 20,
  /** Gravity multiplier while rising with the button released (short hop). */
  cut: 2.4,
  /** Gravity multiplier near the apex while the button is held. */
  hang: 0.6,
  hangBand: 1.4,
  coyote: 0.11,
  buffer: 0.14,
  charW: 0.76,
  charH: 0.9,
  pushLight: 3.4,
  pushHeavy: 2.2,
  liftSpeed: 3.2,
  respawnDelay: 0.8,
  /** All characters at their doors this long finishes the stage. */
  exitHold: 0.6,
  poolSurface: 0.3,
  poolFloor: 0.55,
  stepUp: 0.6,
  leverSpeed: 0.8,
} as const;

const EPS = 1e-4;

export interface CharSpec {
  owner: number;
  sub: 0 | 1;
}

export type Support = { kind: 'char' | 'box' | 'lift'; i: number } | null;

export interface Char {
  readonly key: number;
  readonly owner: number;
  readonly sub: 0 | 1;
  readonly slot: Slot;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  grounded: boolean;
  support: Support;
  coyote: number;
  buffer: number;
  inX: number;
  inJump: boolean;
  prevJump: boolean;
  /** Owner connected and controlling (counts for the exit check). */
  active: boolean;
  dead: boolean;
  respawnIn: number;
  cpX: number;
  cpY: number;
  inExit: boolean;
  pingAt: number;
  /** Displacement during the current step (riders copy it). */
  dx: number;
  dy: number;
  stats: CharStats;
}

export interface CharStats {
  jumps: number;
  deaths: number;
  gems: number;
  /** Seconds a friend stood on this character. */
  carried: number;
  /** Seconds spent pushing a moving box. */
  pushed: number;
  /** Seconds on a pressure plate or levers flipped (x3 s each). */
  helped: number;
  /** Stages this character reached its door first. */
  firstIn: number;
}

export interface Box {
  readonly heavy: boolean;
  x: number;
  y: number;
  readonly w: number;
  readonly h: number;
  vx: number;
  vy: number;
  support: Support;
  dx: number;
  dy: number;
  /** Characters pushing it right now / how many it needs. */
  pushers: number;
  need: number;
}

export interface Lift {
  readonly def: LiftDef;
  y: number;
  dy: number;
  moving: boolean;
}

export interface Gem {
  x: number;
  y: number;
  slot: Slot;
  taken: boolean;
  by: number;
}

export type WorldEvent =
  | { type: 'jump'; key: number }
  | { type: 'land'; key: number; hard: boolean }
  | { type: 'die'; key: number; x: number; y: number }
  | { type: 'respawn'; key: number }
  | { type: 'gem'; key: number; gem: number }
  | { type: 'checkpoint'; key: number; x: number; y: number }
  | { type: 'plate'; ch: number; on: boolean; x: number; y: number }
  | { type: 'lever'; ch: number; on: boolean; x: number; y: number }
  | { type: 'door'; ch: number; open: boolean }
  | { type: 'lift'; i: number }
  | { type: 'push'; box: number }
  | { type: 'exit'; key: number; first: boolean }
  | { type: 'clear' };

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** -1 tile, else box index. */
  box: number;
}

export interface WorldOptions {
  /** One person steering two characters: heavy boxes move with a single pusher. */
  solo: boolean;
}

function overlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 - EPS && a1 > b0 + EPS;
}

function approach(v: number, target: number, rate: number): number {
  return v < target ? Math.min(target, v + rate) : Math.max(target, v - rate);
}

export class World {
  readonly level: Level;
  readonly colors: number;
  readonly chars: Char[] = [];
  readonly boxes: Box[] = [];
  readonly lifts: Lift[] = [];
  readonly gems: Gem[] = [];
  readonly plateOn: boolean[];
  readonly leverOn: boolean[];
  readonly checkpointLit: boolean[];
  /** Door openness per channel (0 closed .. 1 open) and the logical state. */
  readonly doorOpen = new Map<number, boolean>();
  readonly doorShown = new Map<number, number>();
  readonly active = new Map<number, boolean>();
  t = 0;
  cleared = false;
  private acc = 0;
  private allIn = 0;
  private anyIn = false;
  private events: WorldEvent[] = [];
  private readonly scratch: Rect[] = [];
  private scratchN = 0;
  private readonly order: Char[] = [];

  constructor(level: Level, specs: readonly CharSpec[], opts: WorldOptions = { solo: false }) {
    this.level = level;
    this.colors = colorCount(specs.length);
    specs.forEach((s, i) => {
      const sp = level.spawns[i % Math.max(1, level.spawns.length)] ?? { x: 2, y: ROWS - 3 };
      // A reused spawn cell is shifted a little so stacked starts are still readable.
      const round = Math.floor(i / Math.max(1, level.spawns.length));
      const x = sp.x + (1 - TUNE.charW) / 2 + (round % 2 ? 0.12 : -0.12) * Math.min(1, round);
      const y = sp.y + 1 - TUNE.charH;
      this.chars.push({
        key: i,
        owner: s.owner,
        sub: s.sub,
        slot: foldSlot(i, this.colors),
        x,
        y,
        vx: 0,
        vy: 0,
        facing: 1,
        grounded: false,
        support: null,
        coyote: 0,
        buffer: 0,
        inX: 0,
        inJump: false,
        prevJump: false,
        active: true,
        dead: false,
        respawnIn: 0,
        cpX: x,
        cpY: y,
        inExit: false,
        pingAt: Number.NEGATIVE_INFINITY,
        dx: 0,
        dy: 0,
        stats: { jumps: 0, deaths: 0, gems: 0, carried: 0, pushed: 0, helped: 0, firstIn: 0 },
      });
    });
    for (const b of level.boxes) {
      const size = b.heavy ? 2 : 1;
      this.boxes.push({
        heavy: b.heavy,
        x: b.x + 0.02,
        y: b.y + 0.04,
        w: size - 0.04,
        h: size - 0.04,
        vx: 0,
        vy: 0,
        support: null,
        dx: 0,
        dy: 0,
        pushers: 0,
        need: b.heavy && !opts.solo ? 2 : 1,
      });
    }
    for (const def of level.lifts) this.lifts.push({ def, y: def.yDown, dy: 0, moving: false });
    for (const g of level.gems)
      this.gems.push({ x: g.x, y: g.y, slot: foldSlot(g.slot, this.colors), taken: false, by: -1 });
    this.plateOn = level.plates.map(() => false);
    this.leverOn = level.levers.map(() => false);
    this.checkpointLit = level.checkpoints.map(() => false);
    for (const ch of level.channels) this.active.set(ch, false);
    for (let i = 0; i < level.cells.length; i++) {
      if (level.cells[i] === Cell.Door) {
        const ch = level.meta[i]!;
        this.doorOpen.set(ch, false);
        this.doorShown.set(ch, 0);
      }
    }
  }

  /* ------------------------------------------------------------------ input */

  setInput(key: number, x: number, jump: boolean): void {
    const c = this.chars[key];
    if (!c) return;
    c.inX = Math.abs(x) < 0.18 ? 0 : Math.max(-1, Math.min(1, x));
    c.inJump = jump;
  }

  setActive(key: number, on: boolean): void {
    const c = this.chars[key];
    if (c) c.active = on;
  }

  ping(key: number): void {
    const c = this.chars[key];
    if (c && !c.dead) c.pingAt = this.t;
  }

  drainEvents(): WorldEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /** Advances by `dt` seconds in fixed steps. */
  update(dt: number): void {
    this.acc = Math.min(this.acc + Math.max(0, dt), 0.25);
    while (this.acc >= TUNE.step) {
      this.acc -= TUNE.step;
      this.step(TUNE.step);
    }
  }

  /* ------------------------------------------------------------------ queries */

  /** Solid part of a cell for `who` (a slot, or -1 for boxes) as [top, bottom] offsets, or null. */
  private cellSolid(cx: number, cy: number, who: number): [number, number] | null {
    switch (cellAt(this.level, cx, cy)) {
      case Cell.Rock:
        return [0, 1];
      case Cell.Door:
        return this.doorOpen.get(metaAt(this.level, cx, cy)) ? null : [0, 1];
      case Cell.Gate:
        return who >= 0 && foldSlot(metaAt(this.level, cx, cy), this.colors) === who ? null : [0, 1];
      case Cell.Pool:
        return [TUNE.poolFloor, 1];
      default:
        return null;
    }
  }

  private rect(x: number, y: number, w: number, h: number, box: number): void {
    let r = this.scratch[this.scratchN];
    if (!r) {
      r = { x, y, w, h, box };
      this.scratch.push(r);
    } else {
      r.x = x;
      r.y = y;
      r.w = w;
      r.h = h;
      r.box = box;
    }
    this.scratchN++;
  }

  /** Solid rects overlapping the region, into the scratch list (tiles, then boxes except `skipBox`). */
  private gather(x: number, y: number, w: number, h: number, who: number, skipBox: number): number {
    this.scratchN = 0;
    const x0 = Math.floor(x + EPS);
    const x1 = Math.floor(x + w - EPS);
    const y0 = Math.floor(y + EPS);
    const y1 = Math.floor(y + h - EPS);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const s = this.cellSolid(cx, cy, who);
        if (s) this.rect(cx, cy + s[0], 1, s[1] - s[0], -1);
      }
    }
    for (let i = 0; i < this.boxes.length; i++) {
      if (i === skipBox) continue;
      const b = this.boxes[i]!;
      if (overlap(x, x + w, b.x, b.x + b.w) && overlap(y, y + h, b.y, b.y + b.h))
        this.rect(b.x, b.y, b.w, b.h, i);
    }
    return this.scratchN;
  }

  private blocked(x: number, y: number, w: number, h: number, who: number, skipBox: number): boolean {
    const n = this.gather(x, y, w, h, who, skipBox);
    for (let i = 0; i < n; i++) {
      const r = this.scratch[i]!;
      if (overlap(x, x + w, r.x, r.x + r.w) && overlap(y, y + h, r.y, r.y + r.h)) return true;
    }
    return false;
  }

  /** Horizontal move with collisions; returns the box index hit (or -1 tile, -2 nothing). */
  private moveX(
    b: { x: number; y: number },
    w: number,
    h: number,
    dx: number,
    who: number,
    skipBox: number,
  ): number {
    if (dx === 0) return -2;
    const nx = b.x + dx;
    const n = this.gather(Math.min(b.x, nx), b.y, w + Math.abs(dx), h, who, skipBox);
    let limit = nx;
    let hit = -2;
    for (let i = 0; i < n; i++) {
      const r = this.scratch[i]!;
      if (!overlap(b.y, b.y + h, r.y, r.y + r.h)) continue;
      if (dx > 0 && r.x >= b.x + w - EPS * 10 && r.x - w < limit) {
        limit = r.x - w;
        hit = r.box;
      } else if (dx < 0 && r.x + r.w <= b.x + EPS * 10 && r.x + r.w > limit) {
        limit = r.x + r.w;
        hit = r.box;
      }
    }
    b.x = limit;
    return hit;
  }

  /** Vertical move; returns what stopped it (null = free fall). One-way tops: lifts, and characters when `rider`. */
  private moveY(
    b: { x: number; y: number },
    w: number,
    h: number,
    dy: number,
    who: number,
    skipBox: number,
    rider: Char | null,
  ): { hit: boolean; support: Support } {
    if (dy === 0) return { hit: false, support: null };
    const ny = b.y + dy;
    const n = this.gather(b.x, Math.min(b.y, ny), w, h + Math.abs(dy), who, skipBox);
    let limit = ny;
    let support: Support = null;
    let hit = false;
    for (let i = 0; i < n; i++) {
      const r = this.scratch[i]!;
      if (!overlap(b.x, b.x + w, r.x, r.x + r.w)) continue;
      if (dy > 0 && r.y >= b.y + h - EPS * 10 && r.y - h < limit) {
        limit = r.y - h;
        hit = true;
        support = r.box >= 0 ? { kind: 'box', i: r.box } : null;
      } else if (dy < 0 && r.y + r.h <= b.y + EPS * 10 && r.y + r.h > limit) {
        limit = r.y + r.h;
        hit = true;
      }
    }
    if (dy > 0) {
      const bottom = b.y + h;
      for (let i = 0; i < this.lifts.length; i++) {
        const l = this.lifts[i]!;
        const top = l.y;
        if (bottom > top + 0.02 || !overlap(b.x, b.x + w, l.def.x, l.def.x + l.def.w)) continue;
        if (top - h < limit) {
          limit = top - h;
          hit = true;
          support = { kind: 'lift', i };
        }
      }
      if (rider) {
        for (const o of this.chars) {
          if (o === rider || o.dead) continue;
          // Shoulders: a decent horizontal overlap, so brushing a friend's edge does not count.
          const ov = Math.min(b.x + w, o.x + TUNE.charW) - Math.max(b.x, o.x);
          if (ov < 0.22 || bottom > o.y + 0.02) continue;
          if (o.y - h < limit) {
            limit = o.y - h;
            hit = true;
            support = { kind: 'char', i: o.key };
          }
        }
      }
    }
    b.y = limit;
    return { hit, support };
  }

  /* ------------------------------------------------------------------ step */

  private step(dt: number): void {
    this.t += dt;
    this.updateTriggers(dt);
    this.updateDoors(dt);
    this.updateLifts(dt);
    this.updateBoxes(dt);
    this.updateChars(dt);
    this.updatePickups();
    this.updateExits(dt);
  }

  private bodyOn(x0: number, y0: number, x1: number, y1: number): boolean {
    for (const c of this.chars) {
      if (!c.dead && overlap(c.x, c.x + TUNE.charW, x0, x1) && overlap(c.y, c.y + TUNE.charH, y0, y1))
        return true;
    }
    for (const b of this.boxes) {
      if (overlap(b.x, b.x + b.w, x0, x1) && overlap(b.y, b.y + b.h, y0, y1)) return true;
    }
    return false;
  }

  private updateTriggers(dt: number): void {
    const lv = this.level;
    lv.plates.forEach((p, i) => {
      const on = this.bodyOn(p.x + 0.08, p.y + 0.78, p.x + 0.92, p.y + 1);
      if (on !== this.plateOn[i]) {
        this.plateOn[i] = on;
        this.events.push({ type: 'plate', ch: p.ch, on, x: p.x, y: p.y });
      }
      if (on) {
        for (const c of this.chars) {
          if (
            !c.dead &&
            overlap(c.x, c.x + TUNE.charW, p.x + 0.08, p.x + 0.92) &&
            overlap(c.y, c.y + TUNE.charH, p.y + 0.78, p.y + 1)
          )
            c.stats.helped += dt;
        }
      }
    });
    lv.levers.forEach((l, i) => {
      for (const c of this.chars) {
        if (
          c.dead ||
          !overlap(c.x, c.x + TUNE.charW, l.x + 0.25, l.x + 0.75) ||
          !overlap(c.y, c.y + TUNE.charH, l.y, l.y + 1)
        )
          continue;
        const want = c.vx > TUNE.leverSpeed ? true : c.vx < -TUNE.leverSpeed ? false : this.leverOn[i];
        if (want !== this.leverOn[i]) {
          this.leverOn[i] = Boolean(want);
          c.stats.helped += 3;
          this.events.push({ type: 'lever', ch: l.ch, on: Boolean(want), x: l.x, y: l.y });
        }
      }
    });
    for (const ch of this.active.keys()) {
      let on = false;
      lv.plates.forEach((p, i) => {
        if (p.ch === ch && this.plateOn[i]) on = true;
      });
      lv.levers.forEach((l, i) => {
        if (l.ch === ch && this.leverOn[i]) on = true;
      });
      this.active.set(ch, on);
    }
  }

  /** True when anything overlaps a door cell of this channel (a door never closes on someone). */
  private doorBusy(ch: number): boolean {
    const lv = this.level;
    for (let i = 0; i < lv.cells.length; i++) {
      if (lv.cells[i] !== Cell.Door || lv.meta[i] !== ch) continue;
      const x = i % COLS;
      const y = Math.floor(i / COLS);
      if (this.bodyOn(x, y, x + 1, y + 1)) return true;
    }
    return false;
  }

  private updateDoors(dt: number): void {
    for (const [ch, open] of this.doorOpen) {
      const want = this.active.get(ch) ?? false;
      if (want !== open && (want || !this.doorBusy(ch))) {
        this.doorOpen.set(ch, want);
        this.events.push({ type: 'door', ch, open: want });
      }
      const shown = this.doorShown.get(ch) ?? 0;
      this.doorShown.set(ch, approach(shown, this.doorOpen.get(ch) ? 1 : 0, dt * 5));
    }
  }

  private updateLifts(dt: number): void {
    this.lifts.forEach((l, i) => {
      const target = this.active.get(l.def.ch) ? l.def.yUp : l.def.yDown;
      const ny = approach(l.y, target, TUNE.liftSpeed * dt);
      l.dy = ny - l.y;
      const moving = l.dy !== 0;
      if (moving && !l.moving) this.events.push({ type: 'lift', i });
      l.moving = moving;
      l.y = ny;
    });
  }

  private supportDelta(s: Support): [number, number] {
    if (!s) return [0, 0];
    if (s.kind === 'lift') return [0, this.lifts[s.i]?.dy ?? 0];
    if (s.kind === 'box') {
      const b = this.boxes[s.i];
      return b ? [b.dx, b.dy] : [0, 0];
    }
    const c = this.chars[s.i];
    return c && !c.dead ? [c.dx, c.dy] : [0, 0];
  }

  private updateBoxes(dt: number): void {
    const order = this.boxes.map((_, i) => i).sort((a, b) => this.boxes[b]!.y - this.boxes[a]!.y);
    for (const i of order) {
      const b = this.boxes[i]!;
      const x0 = b.x;
      const y0 = b.y;
      // Who pushes: grounded characters pressing into a side.
      let right = 0;
      let left = 0;
      for (const c of this.chars) {
        if (c.dead || !c.grounded || c.inX === 0) continue;
        if (!overlap(c.y, c.y + TUNE.charH, b.y + 0.1, b.y + b.h - 0.1)) continue;
        if (c.inX > 0 && Math.abs(c.x + TUNE.charW - b.x) < 0.06) right++;
        else if (c.inX < 0 && Math.abs(c.x - (b.x + b.w)) < 0.06) left++;
      }
      const net = right - left;
      b.pushers = Math.abs(net);
      const speed = b.heavy ? TUNE.pushHeavy : TUNE.pushLight;
      b.vx = b.pushers >= b.need && b.support?.kind !== 'char' ? Math.sign(net) * speed : 0;
      const [sdx, sdy] = this.supportDelta(b.support);
      if (sdx) this.moveX(b, b.w, b.h, sdx, -1, i);
      if (sdy) this.moveY(b, b.w, b.h, sdy, -1, i, null);
      const wasMoving = b.dx !== 0;
      if (b.vx !== 0) {
        const hit = this.moveX(b, b.w, b.h, b.vx * dt, -1, i);
        if (hit !== -2) b.vx = 0;
      }
      b.vy = Math.min(b.vy + TUNE.gravity * dt, TUNE.fallMax);
      const res = this.moveY(b, b.w, b.h, b.vy * dt, -1, i, null);
      if (res.hit) {
        if (b.vy > 0) b.support = res.support;
        b.vy = 0;
      } else b.support = null;
      b.dx = b.x - x0;
      b.dy = b.y - y0;
      if (Math.abs(b.dx) > EPS && !wasMoving && b.vx !== 0) this.events.push({ type: 'push', box: i });
      if (b.vx !== 0 && Math.abs(b.dx) > EPS) {
        for (const c of this.chars) {
          if (c.dead || !c.grounded) continue;
          const side = b.vx > 0 ? Math.abs(c.x + TUNE.charW - x0) < 0.08 : Math.abs(c.x - (x0 + b.w)) < 0.08;
          if (side && overlap(c.y, c.y + TUNE.charH, b.y, b.y + b.h)) c.stats.pushed += dt;
        }
      }
    }
  }

  private updateChars(dt: number): void {
    const order = this.order;
    order.length = 0;
    for (const c of this.chars) order.push(c);
    // Lowest first: a character standing on another one moves after its support.
    order.sort((a, b) => b.y - a.y);
    for (const c of order) {
      if (c.dead) {
        c.dx = 0;
        c.dy = 0;
        c.respawnIn -= dt;
        if (c.respawnIn <= 0) this.respawn(c);
        continue;
      }
      this.stepChar(c, dt);
    }
    for (const c of this.chars) {
      if (c.dead || c.support?.kind !== 'char') continue;
      const under = this.chars[c.support.i];
      if (under && !under.dead) under.stats.carried += dt;
    }
  }

  private stepChar(c: Char, dt: number): void {
    const w = TUNE.charW;
    const h = TUNE.charH;
    const x0 = c.x;
    const y0 = c.y;
    const who = c.slot;
    // A box that fell onto a character lifts it on top instead of trapping it.
    for (const b of this.boxes) {
      if (overlap(c.x, c.x + w, b.x, b.x + b.w) && overlap(c.y, c.y + h, b.y, b.y + b.h)) {
        if (!this.blocked(c.x, b.y - h, w, h, who, -1)) c.y = b.y - h;
      }
    }
    // Ride whatever we stand on.
    const [sdx, sdy] = this.supportDelta(c.support);
    if (sdx) this.moveX(c, w, h, sdx, who, -1);
    if (sdy) this.moveY(c, w, h, sdy, who, -1, null);

    // Run.
    const target = c.inX * TUNE.run;
    const rate = c.grounded ? (c.inX === 0 ? TUNE.decelGround : TUNE.accelGround) : TUNE.accelAir;
    c.vx = approach(c.vx, target, rate * dt);
    if (c.inX !== 0) c.facing = c.inX > 0 ? 1 : -1;
    if (c.vx !== 0) {
      const before = c.x;
      const hit = this.moveX(c, w, h, c.vx * dt, who, -1);
      if (hit >= 0) {
        // Pushing a box: walk at its pace.
        const b = this.boxes[hit]!;
        const max = Math.abs(b.vx);
        if (Math.sign(b.vx) !== Math.sign(c.vx) || max === 0) c.vx = 0;
        else c.vx = Math.sign(c.vx) * Math.min(Math.abs(c.vx), max);
      } else if (hit === -1) {
        if (!(c.grounded && this.tryStepUp(c, before + c.vx * dt))) c.vx = 0;
      }
    }

    // Jump with coyote time and buffer.
    if (c.inJump && !c.prevJump) c.buffer = TUNE.buffer;
    c.prevJump = c.inJump;
    if (c.grounded) c.coyote = TUNE.coyote;
    else c.coyote -= dt;
    if (c.buffer > 0 && c.coyote > 0) {
      c.vy = -TUNE.jumpV;
      c.buffer = 0;
      c.coyote = 0;
      c.grounded = false;
      c.support = null;
      c.stats.jumps++;
      this.events.push({ type: 'jump', key: c.key });
    }
    c.buffer -= dt;

    let g = TUNE.gravity;
    if (c.vy < 0 && !c.inJump) g *= TUNE.cut;
    else if (c.inJump && Math.abs(c.vy) < TUNE.hangBand) g *= TUNE.hang;
    c.vy = Math.min(c.vy + g * dt, TUNE.fallMax);
    const fall = c.vy;
    const res = this.moveY(c, w, h, c.vy * dt, who, -1, c);
    const wasGrounded = c.grounded;
    if (res.hit) {
      if (c.vy > 0) {
        c.grounded = true;
        c.support = res.support;
        if (!wasGrounded) this.events.push({ type: 'land', key: c.key, hard: fall > 14 });
      }
      c.vy = 0;
    } else {
      c.grounded = false;
      c.support = null;
    }
    c.dx = c.x - x0;
    c.dy = c.y - y0;
    if (this.inHazard(c)) this.die(c);
    else if (c.y > ROWS + 1 || c.x < -1 || c.x > COLS + 1) this.die(c);
  }

  /** Small ledges (a pool's edge, a lift's lip) are climbed by walking. */
  private tryStepUp(c: Char, wantX: number): boolean {
    const w = TUNE.charW;
    const h = TUNE.charH;
    const bottom = c.y + h;
    for (let up = 0.05; up <= TUNE.stepUp + EPS; up += 0.05) {
      if (!this.blocked(wantX, c.y - up, w, h, c.slot, -1)) {
        // Only when there is ground right under the new spot (a real step, not a wall top far above).
        if (this.blocked(wantX, bottom - up, w, 0.06, c.slot, -1) || up < 0.06) {
          c.x = wantX;
          c.y -= up;
          return true;
        }
        return false;
      }
    }
    return false;
  }

  private inHazard(c: Char): boolean {
    const x0 = Math.floor(c.x + EPS);
    const x1 = Math.floor(c.x + TUNE.charW - EPS);
    const y0 = Math.floor(c.y + EPS);
    const y1 = Math.floor(c.y + TUNE.charH - EPS);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (cellAt(this.level, cx, cy) !== Cell.Pool) continue;
        if (foldSlot(metaAt(this.level, cx, cy), this.colors) === c.slot) continue;
        // A little margin at the sides so a toe over the edge is forgiven.
        if (
          overlap(c.x, c.x + TUNE.charW, cx + 0.12, cx + 0.88) &&
          overlap(c.y, c.y + TUNE.charH, cy + TUNE.poolSurface, cy + 1)
        )
          return true;
      }
    }
    return false;
  }

  private die(c: Char): void {
    if (c.dead) return;
    c.dead = true;
    c.respawnIn = TUNE.respawnDelay;
    c.stats.deaths++;
    c.inExit = false;
    this.events.push({ type: 'die', key: c.key, x: c.x + TUNE.charW / 2, y: c.y + TUNE.charH / 2 });
    c.vx = 0;
    c.vy = 0;
    c.support = null;
    c.grounded = false;
  }

  private respawn(c: Char): void {
    c.dead = false;
    c.x = c.cpX;
    c.y = c.cpY;
    c.vx = 0;
    c.vy = 0;
    c.buffer = 0;
    c.coyote = 0;
    this.events.push({ type: 'respawn', key: c.key });
  }

  private updatePickups(): void {
    for (const c of this.chars) {
      if (c.dead) continue;
      this.gems.forEach((g, i) => {
        if (g.taken || g.slot !== c.slot) return;
        if (
          overlap(c.x, c.x + TUNE.charW, g.x + 0.05, g.x + 0.95) &&
          overlap(c.y, c.y + TUNE.charH, g.y + 0.05, g.y + 0.95)
        ) {
          g.taken = true;
          g.by = c.key;
          c.stats.gems++;
          this.events.push({ type: 'gem', key: c.key, gem: i });
        }
      });
      this.level.checkpoints.forEach((k, i) => {
        if (
          !overlap(c.x, c.x + TUNE.charW, k.x + 0.2, k.x + 0.8) ||
          !overlap(c.y, c.y + TUNE.charH, k.y, k.y + 1)
        )
          return;
        const x = k.x + (1 - TUNE.charW) / 2;
        const y = k.y + 1 - TUNE.charH;
        if (c.cpX === x && c.cpY === y) return;
        c.cpX = x;
        c.cpY = y;
        const first = !this.checkpointLit[i];
        this.checkpointLit[i] = true;
        if (first) this.events.push({ type: 'checkpoint', key: c.key, x: k.x, y: k.y });
      });
    }
  }

  private updateExits(dt: number): void {
    let all = true;
    let counted = 0;
    for (const c of this.chars) {
      const was = c.inExit;
      c.inExit = false;
      if (!c.dead && c.grounded) {
        const mx = c.x + TUNE.charW / 2;
        const my = c.y + TUNE.charH / 2;
        for (const e of this.level.exits) {
          if (foldSlot(e.slot, this.colors) !== c.slot) continue;
          if (mx > e.x + 0.1 && mx < e.x + 0.9 && my > e.y - 1 && my < e.y + 1) {
            c.inExit = true;
            break;
          }
        }
      }
      if (c.inExit && !was) {
        const first = !this.anyIn;
        this.anyIn = true;
        if (first) c.stats.firstIn++;
        this.events.push({ type: 'exit', key: c.key, first });
      }
      if (!c.active) continue;
      counted++;
      if (!c.inExit) all = false;
    }
    if (this.cleared) return;
    this.allIn = all && counted > 0 ? this.allIn + dt : 0;
    if (this.allIn >= TUNE.exitHold) {
      this.cleared = true;
      this.events.push({ type: 'clear' });
    }
  }

  /* ------------------------------------------------------------------ read-outs */

  gemTotals(slot: Slot): { taken: number; total: number } {
    let taken = 0;
    let total = 0;
    for (const g of this.gems) {
      if (g.slot !== slot) continue;
      total++;
      if (g.taken) taken++;
    }
    return { taken, total };
  }

  allGems(): { taken: number; total: number } {
    return { taken: this.gems.filter((g) => g.taken).length, total: this.gems.length };
  }

  /** Characters of a colour at their door / in play. */
  exitCount(slot: Slot): { in: number; total: number } {
    let n = 0;
    let total = 0;
    for (const c of this.chars) {
      if (c.slot !== slot || !c.active) continue;
      total++;
      if (c.inExit) n++;
    }
    return { in: n, total };
  }
}
