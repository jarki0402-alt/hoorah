/**
 * Computer players (PRD 6.4) and the stand-in for a dropped phone, for free movement. A brain is
 * a Pilot: every step it hands the match a target angle, exactly like a phone's joystick, and the
 * same turn-rate limit applies.
 *
 * Play style:
 * - At home it plans a rounded loop out of its land: a half ellipse (depth out, width along the
 *   land) toward open or enemy floor, then the way home. Loops grow with skill.
 * - Out on a trail it looks around every `thinkMs` (reaction time): when an opponent's head gets
 *   about as close to its trail as it is to home, or the trail gets long, it runs home along the
 *   shortest route that does not cross its own trail. Routes come from short look-ahead rollouts
 *   of the real movement model (stepMotion), so turning circles and the edge slide are respected.
 * - It goes after exposed trails within reach, and shies away from heads while outside.
 * - Skill silently scales loop size, reaction time, how reliably it notices danger, how eagerly
 *   it hunts and how steady its steering is. Low skill means real slips (late or missed reactions).
 */
import { bySkill, wobble } from '../common/cpu';
import { type Motion, type Pilot, type Runner, stepMotion, type WilayahMatch } from './logic';
import { wrapAngle } from './trail';

export interface BrainStyle {
  /** Loop depth (how far out) and width ranges, units. */
  depth: readonly [number, number];
  width: readonly [number, number];
  /** Spare units kept between an opponent and the trail before running home. */
  margin: number;
  /** Chance per look-around to notice a threat. */
  notice: number;
  /** Chance to hunt an exposed trail in reach. */
  chase: number;
  /** How far (units) a trail may be to be hunted. */
  reach: number;
  /** Trail length (units) that sends it home no matter what. */
  maxTrail: number;
  /** Ms between look-arounds (reaction time). */
  thinkMs: number;
  /** Steering noise (radians). */
  wobble: number;
}

export function styleFor(skill: number): BrainStyle {
  return {
    depth: [bySkill(skill, 2.5, 4), bySkill(skill, 5, 11)],
    width: [bySkill(skill, 3, 5), bySkill(skill, 6, 14)],
    margin: bySkill(skill, -1, 3),
    notice: bySkill(skill, 0.35, 0.95),
    chase: bySkill(skill, 0.08, 0.8),
    reach: bySkill(skill, 4, 14),
    maxTrail: bySkill(skill, 24, 55),
    thinkMs: bySkill(skill, 240, 90),
    wobble: bySkill(skill, 0.22, 0.05),
  };
}

/** Skills for the solo opponents: spread around the remembered level so the field feels mixed. */
export function fieldSkills(base: number, count: number): number[] {
  const offsets = [0, -0.14, 0.1, -0.06, 0.05, -0.1, 0.12];
  return Array.from({ length: count }, (_, i) => Math.min(0.97, Math.max(0.03, base + (offsets[i] ?? 0))));
}

/** A dropped phone's stand-in: circles inside its land and keeps it safe until the phone is back. */
export const TAKEOVER_STYLE: BrainStyle = {
  depth: [0, 0],
  width: [0, 0],
  margin: 4,
  notice: 1,
  chase: 0,
  reach: 0,
  maxTrail: 0,
  thinkMs: 120,
  wobble: 0,
};

type Mode = 'home' | 'loop' | 'hunt' | 'flee';

/** Candidate headings for the way home. */
const ROUTES = 16;
/** Look-ahead step (units). */
const SIM_STEP = 0.34;
/** Waypoints of a loop, as angles (x PI) around the lobe: from beside the exit, over the far side, back. */
const LOBE = [-0.2, 0.15, 0.5, 0.85, 1.2] as const;
const MAX_WAYPOINTS = LOBE.length + 1;

/** Path search buffers shared by every brain on one floor size (the match runs on one thread). */
class Search {
  readonly seen: Uint32Array;
  readonly prev: Int32Array;
  readonly dist: Int32Array;
  readonly queue: Int32Array;
  gen = 0;

  constructor(size: number) {
    this.seen = new Uint32Array(size);
    this.prev = new Int32Array(size);
    this.dist = new Int32Array(size);
    this.queue = new Int32Array(size);
  }
}

const searches = new Map<number, Search>();
function searchFor(size: number): Search {
  let s = searches.get(size);
  if (!s) {
    s = new Search(size);
    searches.set(size, s);
  }
  return s;
}

export class TerritoryBrain implements Pilot {
  private mode: Mode = 'home';
  /** Waypoints (cells) of the current loop, and the one being steered to. */
  private readonly wx = new Float64Array(MAX_WAYPOINTS);
  private readonly wy = new Float64Array(MAX_WAYPOINTS);
  private wn = 0;
  private wk = 0;
  /** Steering intent: toward a point, or along an angle (null = straight). */
  private hasPoint = false;
  private pointX = 0;
  private pointY = 0;
  private aim: number | null = null;
  /** Circling the anchor (1 or -1 for the direction), 0 when not. */
  private orbitDir = 0;
  /** Steering noise added to the intent; a dodge (absolute angle) overrides it for a moment. */
  private wob = 0;
  private dodge: number | null = null;
  private nextThink = Number.NEGATIVE_INFINITY;
  private prey: number | null = null;
  /** A point known to be well inside our land. */
  private anchorX = Number.NaN;
  private anchorY = Number.NaN;
  private spawnSeen = Number.NaN;
  /** Last best way home: units to get there, and the heading. */
  private homeDist = Number.POSITIVE_INFINITY;
  private homeAngle = 0;
  private readonly sim: Motion = { x: 0, y: 0, angle: 0 };

  constructor(
    private readonly style: BrainStyle,
    private readonly rnd: () => number = Math.random,
    /** Stay home (stand-in for a dropped phone). */
    private readonly homebody = false,
  ) {}

  steer(match: WilayahMatch, me: Runner, t: number): number | null {
    if (me.spawnedAt !== this.spawnSeen) this.reset(me);
    if (this.hasPoint && this.mode === 'loop' && this.reached(match, me)) this.nextWaypoint(match, me);
    if (t >= this.nextThink) {
      this.think(match, me, t);
      this.nextThink = t + this.style.thinkMs * (0.7 + 0.6 * this.rnd());
    }
    if (this.orbitDir !== 0) return this.orbitAngle(match, me);
    const base = this.hasPoint ? Math.atan2(this.pointY - me.y, this.pointX - me.x) : this.aim;
    if (base === null) return null;
    if (this.dodge !== null) return this.dodge;
    return wrapAngle(base + this.wob);
  }

  /* ------------------------------------------------------------------ decisions */

  private reset(me: Runner): void {
    this.spawnSeen = me.spawnedAt;
    this.mode = 'home';
    this.wn = 0;
    this.wk = 0;
    this.hasPoint = false;
    this.aim = null;
    this.orbitDir = 0;
    this.prey = null;
    this.dodge = null;
    this.anchorX = me.x;
    this.anchorY = me.y;
  }

  private think(match: WilayahMatch, me: Runner, t: number): void {
    const home = match.isHome(me) && me.trail.len === 0;
    this.wob = this.style.wobble * wobble(this.rnd);
    this.dodge = null;
    if (!home) this.orbitDir = 0;
    if (home) {
      this.noteAnchor(match, me);
      if (this.homebody) {
        this.orbit(match, me);
        return;
      }
      if (this.mode === 'flee' || this.mode === 'hunt') {
        this.mode = 'home';
        this.prey = null;
      }
      if (this.mode === 'home') {
        const prey = this.findPrey(match, me, t);
        if (prey !== null && this.rnd() < this.style.chase) {
          this.prey = prey;
          this.mode = 'hunt';
          this.orbitDir = 0;
        } else if (this.makePlan(match, me)) {
          this.mode = 'loop';
          this.orbitDir = 0;
        } else this.orbit(match, me);
      }
      if (this.mode === 'hunt') this.chasePrey(match, me);
      return;
    }

    // Outside: look for danger first.
    const g = match.geo;
    this.homeRoute(match, me);
    // Pushed off our land without a plan (it got captured around us, or an orbit drifted out).
    if (this.mode === 'home') this.flee();
    if (this.mode !== 'flee') {
      const trailUnits = me.trail.arcTo(me.x, me.y) / g.unit;
      const threat = this.threat(match, me);
      const danger = threat <= this.homeDist + this.style.margin || trailUnits >= this.style.maxTrail;
      if (this.homebody || (danger && this.rnd() < this.style.notice)) this.flee();
    }
    if (this.mode === 'hunt') this.chasePrey(match, me);
    if (this.mode === 'loop' && this.wk >= this.wn) this.flee();
    if (this.mode !== 'flee' && !this.safeAhead(match, me)) this.flee();
    if (this.mode === 'flee') {
      this.hasPoint = false;
      this.aim = Number.isFinite(this.homeDist)
        ? this.homeAngle
        : Math.atan2(this.anchorY - me.y, this.anchorX - me.x);
    }
    this.dodgeHeads(match, me);
  }

  private flee(): void {
    this.mode = 'flee';
    this.prey = null;
    this.wn = 0;
    this.wk = 0;
  }

  /** Keep a point that is solidly inside our land, so there is always a known way back. */
  private noteAnchor(match: WilayahMatch, me: Runner): void {
    if (!Number.isNaN(this.anchorX) && this.deep(match, me, this.anchorX, this.anchorY)) return;
    if (Number.isNaN(this.anchorX) || this.deep(match, me, me.x, me.y)) {
      this.anchorX = me.x;
      this.anchorY = me.y;
    }
  }

  private deep(match: WilayahMatch, me: Runner, x: number, y: number): boolean {
    const d = 1.5 * match.geo.unit;
    const f = match.field;
    return (
      f.ownerAt(x, y) === me.v &&
      f.ownerAt(x + d, y) === me.v &&
      f.ownerAt(x - d, y) === me.v &&
      f.ownerAt(x, y + d) === me.v &&
      f.ownerAt(x, y - d) === me.v
    );
  }

  /** Start circling the anchor (the way we are already turning), close enough to stay inside the land. */
  private orbit(match: WilayahMatch, me: Runner): void {
    this.hasPoint = false;
    this.aim = null;
    if (this.orbitDir !== 0) return;
    const rx = me.x - this.anchorX;
    const ry = me.y - this.anchorY;
    this.orbitDir = rx * Math.sin(me.angle) - ry * Math.cos(me.angle) >= 0 ? 1 : -1;
    void match;
  }

  /**
   * Hold a circle just wider than our turning circle around the anchor: head along the circle,
   * bending inward when outside it and outward when inside it.
   */
  private orbitAngle(match: WilayahMatch, me: Runner): number {
    const g = match.geo;
    const radius = (g.stepCells / g.maxTurn) * 1.25;
    const dx = me.x - this.anchorX;
    const dy = me.y - this.anchorY;
    const phi = Math.atan2(dy, dx);
    const err = clamp((Math.hypot(dx, dy) - radius) / radius, -1, 1);
    return wrapAngle(phi + this.orbitDir * (Math.PI / 2) * (1 + 0.6 * err));
  }

  /* ------------------------------------------------------------------ loops */

  /** Plan a half-ellipse loop out of the land. False when there is no room. */
  private makePlan(match: WilayahMatch, me: Runner): boolean {
    const f = match.field;
    const u = match.geo.unit;
    const [dLo, dHi] = this.style.depth;
    const [wLo, wHi] = this.style.width;
    if (dHi <= 0) return false;
    let best = Number.NEGATIVE_INFINITY;
    let theta = 0;
    let edge = 0;
    let room = 0;
    const turn = this.rnd() * Math.PI * 2;
    for (let k = 0; k < 12; k++) {
      const a = turn + (k * Math.PI) / 6;
      const cx = Math.cos(a);
      const cy = Math.sin(a);
      let s = 0;
      let x = me.x;
      let y = me.y;
      const limit = 30 * u;
      while (s < limit && f.inBounds(x | 0, y | 0) && f.ownerAt(x, y) === me.v) {
        x += cx;
        y += cy;
        s += 1;
      }
      if (!f.inBounds(x | 0, y | 0) || s >= limit) continue;
      let r = 0;
      let enemy = 0;
      while (f.inBounds(x | 0, y | 0) && r < (dHi + 2) * u) {
        const o = f.ownerAt(x, y);
        if (o !== 0 && o !== me.v) enemy++;
        x += cx;
        y += cy;
        r++;
      }
      if (r < 2.5 * u) continue;
      const score = (Math.min(r, dHi * u) * 2 - s * 0.6 + enemy * 0.5) / u + this.rnd() * 5;
      if (score > best) {
        best = score;
        theta = a;
        edge = s;
        room = r;
      }
    }
    if (best === Number.NEGATIVE_INFINITY) return false;
    const depth = Math.max(2, Math.min(room / u - 1, dLo + this.rnd() * (dHi - dLo))) * u;
    const width = Math.max(wLo + this.rnd() * (wHi - wLo), (depth / u) * 0.7) * u;
    const tx = Math.cos(theta);
    const ty = Math.sin(theta);
    const ex = me.x + tx * edge;
    const ey = me.y + ty * edge;
    // Bend toward the roomier side (sometimes the other one).
    const sideRoom = (s: number) => {
      const nx = -ty * s;
      const ny = tx * s;
      let n = 0;
      let x = ex + tx * depth * 0.5;
      let y = ey + ty * depth * 0.5;
      while (f.inBounds(x | 0, y | 0) && n < width * 1.5) {
        x += nx;
        y += ny;
        n++;
      }
      return n;
    };
    let side = sideRoom(1) >= sideRoom(-1) ? 1 : -1;
    if (this.rnd() < 0.35 && sideRoom(-side) > width * 0.6) side = -side;
    // A round lobe on the land's edge: an ellipse `width` across and `depth` out, entered and
    // left close to the exit point, swept around its far side.
    const nx = -ty * side;
    const ny = tx * side;
    const cx = ex + tx * depth * 0.5;
    const cy = ey + ty * depth * 0.5;
    const lo = match.geo.edge + 1;
    this.wn = 0;
    for (const psi of LOBE) {
      const p = psi * Math.PI;
      this.wx[this.wn] = clamp(
        cx + nx * width * 0.5 * Math.cos(p) + tx * depth * 0.5 * Math.sin(p),
        lo,
        f.cols - lo,
      );
      this.wy[this.wn] = clamp(
        cy + ny * width * 0.5 * Math.cos(p) + ty * depth * 0.5 * Math.sin(p),
        lo,
        f.rows - lo,
      );
      this.wn++;
    }
    // Then back into our land behind the exit, so the loop closes.
    this.wx[this.wn] = ex - tx * u;
    this.wy[this.wn] = ey - ty * u;
    this.wn++;
    this.wk = 0;
    this.hasPoint = true;
    this.pointX = this.wx[0]!;
    this.pointY = this.wy[0]!;
    return true;
  }

  /** Close enough to the waypoint, or it slid behind us inside a turning circle. */
  private reached(match: WilayahMatch, me: Runner): boolean {
    const g = match.geo;
    const dx = this.pointX - me.x;
    const dy = this.pointY - me.y;
    const d = Math.hypot(dx, dy);
    if (d < 1.2 * g.unit) return true;
    const turning = g.stepCells / g.maxTurn;
    return d < turning * 3 && dx * Math.cos(me.angle) + dy * Math.sin(me.angle) < 0;
  }

  private nextWaypoint(match: WilayahMatch, me: Runner): void {
    this.wk++;
    if (this.wk < this.wn) {
      this.pointX = this.wx[this.wk]!;
      this.pointY = this.wy[this.wk]!;
      return;
    }
    // Loop drawn: head home now.
    this.hasPoint = false;
    this.flee();
    this.homeRoute(match, me);
    this.aim = Number.isFinite(this.homeDist)
      ? this.homeAngle
      : Math.atan2(this.anchorY - me.y, this.anchorX - me.x);
  }

  /* ------------------------------------------------------------------ hunting */

  private findPrey(match: WilayahMatch, me: Runner, t: number): number | null {
    if (this.style.chase <= 0) return null;
    const u = match.geo.unit;
    let best: number | null = null;
    let bestD = this.style.reach;
    for (const q of match.all()) {
      if (q === me || !q.alive || q.trail.len < 4 || match.isProtected(q, t)) continue;
      const k = q.trail.nearestIndex(me.x, me.y, 2);
      if (k < 0) continue;
      const px = q.trail.xs[k]!;
      const py = q.trail.ys[k]!;
      const d = Math.hypot(px - me.x, py - me.y) / u;
      // Only worth it if we get there before they can be home and safe.
      const theirs = Math.hypot(px - q.x, py - q.y) / u;
      if (d < bestD && d <= theirs + 6) {
        bestD = d;
        best = q.id;
      }
    }
    return best;
  }

  /** Steer at the prey's trail point nearest to us; give up once it is gone or out of reach. */
  private chasePrey(match: WilayahMatch, me: Runner): void {
    const q = this.prey === null ? undefined : match.runner(this.prey);
    const u = match.geo.unit;
    const k = q?.alive ? this.preyPoint(q, me, u) : -1;
    if (!q || k < 0) {
      this.prey = null;
      if (match.isHome(me) && me.trail.len === 0) this.mode = 'home';
      else this.flee();
      return;
    }
    const px = q.trail.xs[k]!;
    const py = q.trail.ys[k]!;
    if (Math.hypot(px - me.x, py - me.y) / u > this.style.reach + 8) {
      this.flee();
      return;
    }
    this.hasPoint = true;
    this.pointX = px;
    this.pointY = py;
  }

  /** The prey's trail point nearest to us, away from its head (meeting its head would be a crash). */
  private preyPoint(q: Runner, me: Runner, u: number): number {
    const tr = q.trail;
    const keep = (3 * u) ** 2;
    let best = Number.POSITIVE_INFINITY;
    let at = -1;
    for (let i = 0; i < tr.len; i++) {
      const x = tr.xs[i]!;
      const y = tr.ys[i]!;
      if ((x - q.x) ** 2 + (y - q.y) ** 2 < keep) continue;
      const d = (x - me.x) ** 2 + (y - me.y) ** 2;
      if (d < best) {
        best = d;
        at = i;
      }
    }
    return at;
  }

  /* ------------------------------------------------------------------ danger */

  /** Units between the nearest opponent head and our trail (or head). */
  private threat(match: WilayahMatch, me: Runner): number {
    const u = match.geo.unit;
    let best = Number.POSITIVE_INFINITY;
    for (const q of match.all()) {
      if (q === me || !q.alive) continue;
      best = Math.min(best, Math.hypot(q.x - me.x, q.y - me.y), Math.sqrt(me.trail.nearest2(q.x, q.y, 2)));
    }
    return best / u;
  }

  /**
   * Outside our land a head-on knocks us out: sidestep a head that is close and closing in,
   * or turn away outright when it is very close. Slower brains sometimes miss it.
   */
  private dodgeHeads(match: WilayahMatch, me: Runner): void {
    const u = match.geo.unit;
    const mx = Math.cos(me.angle);
    const my = Math.sin(me.angle);
    for (const q of match.all()) {
      if (q === me || !q.alive) continue;
      const dx = q.x - me.x;
      const dy = q.y - me.y;
      const d = Math.hypot(dx, dy);
      if (d > 5 * u || d === 0) continue;
      const closing = (dx * (mx - Math.cos(q.angle)) + dy * (my - Math.sin(q.angle))) / d;
      if (closing < 0.2 && d > 2 * u) continue;
      if (this.rnd() > this.style.notice + 0.1) return;
      const toward = Math.atan2(dy, dx);
      if (d < 2.2 * u) {
        this.dodge = wrapAngle(toward + Math.PI);
        return;
      }
      const left = wrapAngle(toward - Math.PI / 2);
      const right = wrapAngle(toward + Math.PI / 2);
      this.dodge =
        Math.abs(wrapAngle(left - me.angle)) < Math.abs(wrapAngle(right - me.angle)) ? left : right;
      return;
    }
  }

  /** Would holding the current intent run us into our own trail within a few units? */
  private safeAhead(match: WilayahMatch, me: Runner): boolean {
    if (me.trail.len === 0) return true;
    const want = this.hasPoint ? Math.atan2(this.pointY - me.y, this.pointX - me.x) : this.aim;
    return this.rollout(match, me, want, 3.5, false) >= 0;
  }

  /**
   * Best way home over ROUTES headings: fewest units to own land without crossing our own
   * trail. When no straight run gets there (a wide loop beside a small land), a path search on
   * the raster finds the way around. Sets `homeDist` (Infinity when cut off) and `homeAngle`.
   */
  private homeRoute(match: WilayahMatch, me: Runner): void {
    const u = match.geo.unit;
    const horizon = Math.min(60, Math.hypot(this.anchorX - me.x, this.anchorY - me.y) / u + 14);
    let best = Number.POSITIVE_INFINITY;
    let bestAngle = me.angle;
    for (let k = 0; k < ROUTES; k++) {
      const a = me.angle + (k * Math.PI * 2) / ROUTES;
      const d = this.rollout(match, me, a, horizon, true);
      if (d < 0) continue;
      // Prefer gentle turns on near ties.
      const cost = d + Math.abs(wrapAngle(a - me.angle)) * 0.4;
      if (cost < best) {
        best = cost;
        bestAngle = a;
      }
    }
    if (best === Number.POSITIVE_INFINITY && this.pathHome(match, me)) return;
    this.homeDist = best;
    this.homeAngle = wrapAngle(bestAngle);
  }

  /** Breadth-first search over the raster to our land, around our own trail. */
  private pathHome(match: WilayahMatch, me: Runner): boolean {
    const f = match.field;
    const g = match.geo;
    const search = searchFor(f.size);
    search.gen = (search.gen + 1) >>> 0 || 1;
    const { seen, prev, dist, queue } = search;
    const gen = search.gen;
    const cols = f.cols;
    const old = me.trail.arcTo(me.x, me.y) - g.selfSkip;
    const start = f.cellAt(me.x, me.y);
    let head = 0;
    let tail = 0;
    seen[start] = gen;
    prev[start] = -1;
    dist[start] = 0;
    queue[tail++] = start;
    let goal = -1;
    while (head < tail && goal < 0) {
      const i = queue[head++]!;
      const x = i % cols;
      const d = dist[i]! + 1;
      for (let k = 0; k < 4; k++) {
        if ((k === 0 && x === 0) || (k === 1 && x === cols - 1)) continue;
        const n = k === 0 ? i - 1 : k === 1 ? i + 1 : k === 2 ? i - cols : i + cols;
        if (n < 0 || n >= f.size || seen[n] === gen) continue;
        seen[n] = gen;
        if (f.trail[n] === me.v && this.oldTrail(f.trailArc[n]!, g.startSkip, old + d)) continue;
        prev[n] = i;
        dist[n] = d;
        if (f.owner[n] === me.v) {
          goal = n;
          break;
        }
        queue[tail++] = n;
      }
    }
    if (goal < 0) return false;
    // Steer at the path cell about 2.5 units ahead.
    const ahead = Math.max(0, dist[goal]! - Math.round(2.5 * g.unit));
    let c = goal;
    while (dist[c]! > ahead && prev[c]! >= 0) c = prev[c]!;
    this.homeDist = dist[goal]! / g.unit;
    this.homeAngle = Math.atan2(f.yOf(c) + 0.5 - me.y, f.xOf(c) + 0.5 - me.x);
    return true;
  }

  /** Own trail laid at `arc` counts as an obstacle (past where it leaves the land, not right behind the head). */
  private oldTrail(arc: number, from: number, upTo: number): boolean {
    return arc > from && arc <= upTo;
  }

  /**
   * Simulate holding `target` for up to `horizon` units. Returns units travelled until home
   * (`stopAtHome`) or the horizon, -1 when our own trail is in the way (or home is not reached).
   */
  private rollout(
    match: WilayahMatch,
    me: Runner,
    target: number | null,
    horizon: number,
    stopAtHome: boolean,
  ): number {
    const g = match.geo;
    const f = match.field;
    const s = this.sim;
    s.x = me.x;
    s.y = me.y;
    s.angle = me.angle;
    const step = SIM_STEP * g.unit;
    const turn = (g.maxTurn * step) / g.stepCells;
    const limit = horizon * g.unit;
    // The same rule as the match: trail laid more than `selfSkip` behind the head counts.
    const old = me.trail.arcTo(me.x, me.y) - g.selfSkip;
    for (let d = step; d <= limit; d += step) {
      stepMotion(s, target, turn, step, f, g.edge, me.v);
      const c = f.cellAt(s.x, s.y);
      if (stopAtHome && f.owner[c] === me.v) return d / g.unit;
      if (f.trail[c] === me.v && this.oldTrail(f.trailArc[c]!, g.startSkip, old + d)) return -1;
    }
    return stopAtHome ? -1 : horizon;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
