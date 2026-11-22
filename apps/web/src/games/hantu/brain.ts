/**
 * The computer ghost (PRD 6.4): plays against someone alone, and covers for a ghost whose phone
 * dropped. It patrols the objectives (keys, fuse, exit), hears running and sees flashlights,
 * chases the last place it noticed someone, backs out of a beam, and uses its powers now and
 * then. Skill (0..1, adapted silently between games) sets its speed, senses and reaction time.
 *
 * Paths: breadth-first search over the cells the ghost can float through (everything but walls
 * and the exit), recomputed a few times a second.
 */
import { bySkill } from '../common/cpu';
import { angleDiff, lineOfSight } from './light';
import { COLS, type HauntMap, type Pt, ROWS, Tile, tileAt } from './maps';
import type { HauntWorld, Resident } from './world';

const REPATH_S = 0.4;

function passable(m: HauntMap, x: number, y: number): boolean {
  const t = tileAt(m, x, y);
  return t !== Tile.Wall && t !== Tile.Exit;
}

/** Next cell centre on a shortest path from (sx, sy) to (tx, ty), or null when unreachable. */
export function nextStep(m: HauntMap, sx: number, sy: number, tx: number, ty: number): Pt | null {
  const start = sy * COLS + sx;
  const goal = ty * COLS + tx;
  if (start === goal) return { x: tx, y: ty };
  const prev = new Int16Array(COLS * ROWS).fill(-1);
  prev[start] = start;
  const queue = [start];
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi]!;
    if (cur === goal) break;
    const cx = cur % COLS;
    const cy = Math.floor(cur / COLS);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const ni = ny * COLS + nx;
      if (prev[ni] !== -1 || !passable(m, nx, ny)) continue;
      prev[ni] = cur;
      queue.push(ni);
    }
  }
  if (prev[goal] === -1) return null;
  let at = goal;
  while (prev[at] !== start) at = prev[at]!;
  return { x: at % COLS, y: Math.floor(at / COLS) };
}

export class GhostBrain {
  private target: Pt | null = null;
  private chasing: number | null = null;
  private repath = 0;
  private waypoint: Pt | null = null;
  private react = 0;
  private flee = 0;
  private fleeAngle = 0;
  private powerT = 0;
  private stuck = 0;
  private lastPos: Pt = { x: 0, y: 0 };

  constructor(
    readonly skill: number,
    private readonly rnd: () => number = Math.random,
  ) {}

  /** Speed multiplier for this skill (a gentle ghost is noticeably slower). */
  speed(): number {
    return bySkill(this.skill, 0.8, 1.0);
  }

  /** Stick for this frame; may also use a power on the world. */
  update(w: HauntWorld, dt: number): { x: number; y: number } {
    const g = w.ghost;
    const sight = w.sight();
    this.repath -= dt;
    this.powerT -= dt;
    this.react = Math.max(0, this.react - dt);
    this.flee = Math.max(0, this.flee - dt);

    // In a beam: back out sideways.
    if (g.litBy.length && this.flee <= 0) {
      const r = w.resident(g.litBy[0]!);
      if (r) {
        const away = Math.atan2(g.y - r.y, g.x - r.x);
        const side = angleDiff(away, r.face) > 0 ? 1 : -1;
        this.fleeAngle = r.face + side * (Math.PI / 2);
        this.flee = bySkill(this.skill, 0.5, 0.9);
      }
    }
    if (this.flee > 0) return { x: Math.cos(this.fleeAngle), y: Math.sin(this.fleeAngle) };

    // Senses: who can it notice?
    const hear = bySkill(this.skill, 6, 10);
    const feel = bySkill(this.skill, 2.5, 4.5);
    const see = bySkill(this.skill, 7, 11);
    let prey: Resident | null = null;
    let preyD = Number.POSITIVE_INFINITY;
    for (const r of w.residents) {
      if (r.state !== 'in') continue;
      const d = Math.hypot(r.x - g.x, r.y - g.y);
      const noticed =
        d < feel ||
        (r.running && d < hear) ||
        (w.shining(r) && d < see && lineOfSight(sight, g.x, g.y, r.x, r.y)) ||
        (d < see * 0.6 && lineOfSight(sight, g.x, g.y, r.x, r.y));
      if (noticed && d < preyD) {
        prey = r;
        preyD = d;
      }
    }
    if (prey) {
      if (this.chasing !== prey.id) {
        this.chasing = prey.id;
        this.react = bySkill(this.skill, 0.8, 0.25) * (0.6 + this.rnd() * 0.8);
      }
      this.target = { x: Math.floor(prey.x), y: Math.floor(prey.y) };
      this.usePowers(w, prey, preyD);
    } else {
      this.chasing = null;
      if (!this.target || (Math.floor(g.x) === this.target.x && Math.floor(g.y) === this.target.y))
        this.target = this.patrol(w);
    }
    if (this.react > 0) return { x: 0, y: 0 };

    // Stuck against something: pick a new patrol point.
    if (Math.hypot(g.x - this.lastPos.x, g.y - this.lastPos.y) < 0.01 * dt * 60) this.stuck += dt;
    else this.stuck = 0;
    this.lastPos = { x: g.x, y: g.y };
    if (this.stuck > 1.2) {
      this.stuck = 0;
      this.target = this.patrol(w);
      this.repath = 0;
    }

    const tgt = this.target;
    if (!tgt) return { x: 0, y: 0 };
    // Close and in plain sight: go straight at it.
    if (prey && preyD < 2.2) {
      const d = Math.max(1e-3, preyD);
      return { x: (prey.x - g.x) / d, y: (prey.y - g.y) / d };
    }
    if (this.repath <= 0 || !this.waypoint) {
      this.repath = REPATH_S;
      this.waypoint = nextStep(w.map, Math.floor(g.x), Math.floor(g.y), tgt.x, tgt.y);
    }
    const wp = this.waypoint;
    if (!wp) return { x: 0, y: 0 };
    const dx = wp.x + 0.5 - g.x;
    const dy = wp.y + 0.5 - g.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.15) {
      this.waypoint = null;
      return { x: 0, y: 0 };
    }
    return { x: dx / d, y: dy / d };
  }

  /** Somewhere worth haunting: an untaken key, the fuse while it is off, the exit late on. */
  private patrol(w: HauntWorld): Pt {
    const spots: Pt[] = [];
    for (const k of w.keys) if (!k.taken) spots.push(k);
    if (!w.fuseOn) spots.push(w.map.fuse, w.map.fuse);
    if (w.exitOpen || w.keysFound >= 2) for (const e of w.map.exits) spots.push({ x: e.x, y: e.y - 1 });
    for (const l of w.map.lamps) spots.push(l);
    const pick = spots[Math.floor(this.rnd() * spots.length)] ?? w.map.ghost;
    // A floor cell next to solid spots (the fuse box) so the path can end there.
    for (const [dx, dy] of [
      [0, 0],
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const) {
      if (passable(w.map, pick.x + dx, pick.y + dy) && tileAt(w.map, pick.x + dx, pick.y + dy) !== Tile.Fuse)
        return { x: pick.x + dx, y: pick.y + dy };
    }
    return { x: w.map.ghost.x, y: w.map.ghost.y };
  }

  private usePowers(w: HauntWorld, prey: Resident, d: number): void {
    if (this.powerT > 0) return;
    this.powerT = bySkill(this.skill, 3, 1.2);
    const g = w.ghost;
    if (g.lightsCd <= 0 && w.shining(prey) && d < 6 && this.rnd() < bySkill(this.skill, 0.25, 0.7)) {
      w.lightsOut();
      return;
    }
    if (g.doorCd > 0 || this.rnd() > bySkill(this.skill, 0.2, 0.6)) return;
    // Shut the door nearest to the prey when the prey is about to pass it.
    let best = -1;
    let bestD = 2.5;
    w.map.doors.forEach((door, i) => {
      const dd = Math.hypot(door.x + 0.5 - prey.x, door.y + 0.5 - prey.y);
      if (dd < bestD && dd > 0.9) {
        best = i;
        bestD = dd;
      }
    });
    if (best >= 0) w.slam(best);
  }
}
