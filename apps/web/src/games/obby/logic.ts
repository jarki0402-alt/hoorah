/**
 * Obby rules (pure, no rendering): a session of short obstacle races. Each track: intro card,
 * 3-2-1, the race, then a podium. Falling sends a runner back to their own save pad. Places give
 * points; the total over all tracks decides the winner.
 *
 * Cameras (owner 2026-11-24): they look forward along the course, from behind the runners. Up to
 * four people each get their own part of the main screen (1 full, 2 side by side, 3-4 in a 2x2
 * grid; with three the fourth part shows the whole pack). Five or more share one camera on the
 * pack, and whoever stays off that screen for more than 2 seconds is brought to the save pad
 * nearest the pack and held still for 1 second (owner's decision 2026-11-22).
 */

import type { Fruit, Look } from '@hoorah/protocol';
import { type CameraRig, DEFAULT_RIG, GroupCamera } from '../../shared/kotak/camera';
import { SaveTrail, spawnSpot } from '../../shared/kotak/checkpoints';
import type { V3 } from '../../shared/kotak/math';
import { KotakSim } from '../../shared/kotak/sim';
import type { PilotInput } from './brain';
import { buildCourse, type Course } from './course';

export interface RacerInfo {
  id: number;
  name: string;
  fruit: Fruit;
  look: Look;
  color: string;
  cpu: boolean;
}

/** A part of the main screen, as fractions (y from the top). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ObbyViewport {
  /** The runner this camera follows, or null for the camera on the whole pack. */
  id: number | null;
  cam: GroupCamera;
  rect: Rect;
}

/** Most people with a screen part of their own; more share the pack camera. */
export const MAX_SPLIT = 4;

/** Screen parts for `n` cameras: 1 full, 2 side by side, 3-4 in a 2x2 grid. */
export function splitRects(n: number): Rect[] {
  if (n <= 1) return [{ x: 0, y: 0, w: 1, h: 1 }];
  if (n === 2)
    return [
      { x: 0, y: 0, w: 0.5, h: 1 },
      { x: 0.5, y: 0, w: 0.5, h: 1 },
    ];
  return [
    { x: 0, y: 0, w: 0.5, h: 0.5 },
    { x: 0.5, y: 0, w: 0.5, h: 0.5 },
    { x: 0, y: 0.5, w: 0.5, h: 0.5 },
    { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
  ];
}

/** Behind one runner, a little above, looking ahead along the course (+x). */
export const FOLLOW_RIG: CameraRig = {
  ...DEFAULT_RIG,
  fov: 58,
  pitch: 0.42,
  yaw: -Math.PI / 2,
  minDist: 9,
  maxDist: 9,
  fill: 0.9,
  followRate: 5,
  zoomRate: 2,
  // Looks a few metres ahead; the runner stands in the lower third, whole, feet to head.
  lead: { x: 3, y: 1.2, z: 0 },
};

/** Behind the whole pack, higher, zooming out as the pack spreads. */
export const PACK_RIG: CameraRig = {
  ...DEFAULT_RIG,
  fov: 50,
  pitch: 0.5,
  yaw: -Math.PI / 2,
  minDist: 11,
  maxDist: 32,
  fill: 0.8,
  followRate: 3.2,
  zoomRate: 1.8,
  lead: { x: 4, y: 0.6, z: 0 },
};

/** A phone stick (x right, y down) as a move on the course, seen from behind (forward = +x). */
export function stickToCourse(x: number, y: number): { x: number; z: number } {
  return { x: -y, z: x };
}

export type Phase = 'intro' | 'count' | 'race' | 'podium' | 'done';

export const TIMING = {
  intro: 3.4,
  count: 3,
  /** Longest race per track (s). */
  raceMax: 105,
  /** Time the others still get after the first runner finishes (s). */
  afterFirst: 18,
  podium: 7.5,
  /** Off screen this long: brought to the pack (s). */
  offscreen: 2,
  /** Held still after being brought to the pack (s). */
  pullFreeze: 1,
  /** After a pull, not judged off screen again for this long (s). */
  grace: 2.5,
  /** Held still after a fall respawn (s). */
  fallFreeze: 0.45,
  /** Racers further than this behind the leader stop counting for the camera (m). */
  pack: 15,
} as const;

/** Points per place in a track; runners who did not finish get half. */
export const PLACE_POINTS = [10, 8, 6, 5, 4, 3, 2, 1] as const;

export interface RacerStats {
  falls: number;
  pulls: number;
  sweeps: number;
  springs: number;
  jumps: number;
  /** Highest drop landed from (m). */
  flight: number;
  /** Fastest finish time over the session (s). */
  best: number | null;
  wins: number;
  /** Save pads reached first in their track. */
  firstSaves: number;
}

export interface Racer extends RacerInfo {
  save: number;
  finishedAt: number | null;
  place: number | null;
  offFor: number;
  graceLeft: number;
  /** Seconds since the last pull (HUD and phone alert), Infinity = none yet. */
  sincePull: number;
  stats: RacerStats;
  points: number[];
  total: number;
}

export interface TrackResult {
  id: number;
  place: number;
  time: number | null;
  points: number;
}

export type ObbyEvent =
  | { k: 'track'; no: number }
  | { k: 'count'; value: number }
  | { k: 'go' }
  | { k: 'jump'; id: number }
  | { k: 'land'; id: number; speed: number }
  | { k: 'spring'; id: number }
  | { k: 'sweep'; id: number }
  | { k: 'bump'; a: number; b: number }
  | { k: 'crack'; solid: number }
  | { k: 'vanish'; solid: number }
  | { k: 'save'; id: number; index: number }
  | { k: 'fall'; id: number; at: V3 }
  | { k: 'pulled'; id: number }
  | { k: 'finish'; id: number; place: number; time: number }
  | { k: 'hurry' }
  | { k: 'second'; left: number }
  | { k: 'trackEnd'; results: TrackResult[] }
  | { k: 'done' };

export interface Pilot {
  think(m: ObbyMatch, id: number, dt: number): PilotInput;
  resync(m: ObbyMatch, id: number): void;
}

export interface MatchOptions {
  racers: RacerInfo[];
  tracks: number;
  seed: number;
  aspect?: number;
}

const newStats = (): RacerStats => ({
  falls: 0,
  pulls: 0,
  sweeps: 0,
  springs: 0,
  jumps: 0,
  flight: 0,
  best: null,
  wins: 0,
  firstSaves: 0,
});

export class ObbyMatch {
  readonly racers: Racer[];
  readonly tracks: number;
  readonly seed: number;
  trackNo = 0;
  phase: Phase = 'intro';
  /** Time in the current phase (s). */
  phaseT = 0;
  /** Race clock of the current track (s). */
  raceT = 0;
  firstFinishAt: number | null = null;
  course!: Course;
  sim!: KotakSim;
  trail!: SaveTrail;
  /** The cameras and their parts of the main screen (see `layoutViews`). */
  views: ObbyViewport[] = [];
  private aspect: number;
  /** Interpolation factor of the last advance. */
  alpha = 0;
  lastResults: TrackResult[] = [];
  /** Second place lost by less than this many seconds (podium call-out), or null. */
  closeCall: { id: number; gap: number } | null = null;
  private readonly pilots = new Map<number, Pilot>();
  private events: ObbyEvent[] = [];
  private savedFirst = new Set<number>();
  private lastSecond = -1;
  private countShown = 0;

  constructor(opts: MatchOptions) {
    this.racers = opts.racers.map((r) => this.makeRacer(r));
    this.tracks = Math.max(1, Math.min(5, Math.floor(opts.tracks)));
    this.seed = opts.seed;
    this.aspect = opts.aspect ?? 16 / 9;
    this.layoutViews();
    this.loadTrack(0);
  }

  private makeRacer(r: RacerInfo): Racer {
    return {
      ...r,
      save: 0,
      finishedAt: null,
      place: null,
      offFor: 0,
      graceLeft: 0,
      sincePull: Infinity,
      stats: newStats(),
      points: [],
      total: 0,
    };
  }

  racer(id: number): Racer | undefined {
    return this.racers.find((r) => r.id === id);
  }

  /** The first camera (the whole screen when there is only one). */
  get camera(): GroupCamera {
    return this.views[0]!.cam;
  }

  /** True when everyone shares the pack camera (five or more people, or nobody to follow). */
  get shared(): boolean {
    return this.views.length === 1 && this.views[0]!.id === null;
  }

  setAspect(aspect: number): void {
    this.aspect = aspect;
    for (const v of this.views) v.cam.aspect = (aspect * v.rect.w) / v.rect.h;
  }

  /** One camera per person (up to four), else one on the pack; kept when the lineup changes. */
  private layoutViews(): void {
    const people = this.racers.filter((r) => !r.cpu).map((r) => r.id);
    const ids: (number | null)[] =
      people.length === 0 || people.length > MAX_SPLIT
        ? [null]
        : people.length === 3
          ? [...people, null]
          : people;
    const rects = splitRects(ids.length);
    const old = new Map(this.views.map((v) => [v.id, v.cam]));
    this.views = ids.map((id, i) => ({
      id,
      rect: rects[i]!,
      cam: old.get(id) ?? new GroupCamera(id === null ? PACK_RIG : FOLLOW_RIG),
    }));
    this.setAspect(this.aspect);
    if (this.sim) this.snapViews();
  }

  private viewPoints(v: ObbyViewport): V3[] {
    const ids = v.id === null ? this.packIds() : [v.id];
    const pts: V3[] = [];
    for (const id of ids) {
      const b = this.sim.body(id);
      // Frame the feet and the head so jumps stay in the picture.
      if (b) pts.push(b.pos, { x: b.pos.x, y: b.pos.y + 1.6, z: b.pos.z });
    }
    return pts;
  }

  private snapViews(): void {
    for (const v of this.views) {
      const pts = this.viewPoints(v);
      if (pts.length > 0) v.cam.snap(pts);
    }
  }

  setPilot(id: number, pilot: Pilot | null): void {
    if (pilot) {
      this.pilots.set(id, pilot);
      pilot.resync(this, id);
    } else this.pilots.delete(id);
    if (!pilot) this.sim.setMove(id, 0, 0);
  }

  piloted(id: number): boolean {
    return this.pilots.has(id);
  }

  drainEvents(): ObbyEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /* ------------------------------------------------------------------ lineup */

  addRacer(info: RacerInfo): void {
    if (this.racer(info.id)) return;
    const r = this.makeRacer(info);
    // Late joiners score nothing for the tracks they missed.
    r.points = this.racers[0]?.points.map(() => 0) ?? [];
    this.racers.push(r);
    const slot = this.racers.length - 1;
    if (this.phase === 'race') {
      const sp = this.trail.nearestBehind(this.packRearX(), 0);
      this.trail.reach(r.id, sp.index);
      r.save = sp.index;
      this.sim.addBody({ id: r.id, pos: spawnSpot(sp, slot % 8), yaw: Math.PI / 2 });
      this.sim.place(r.id, spawnSpot(sp, slot % 8), Math.PI / 2, TIMING.pullFreeze);
      r.graceLeft = TIMING.grace;
    } else {
      const sp = this.trail.point(0);
      this.sim.addBody({ id: r.id, pos: spawnSpot(sp, slot % 8), yaw: Math.PI / 2 });
      this.sim.place(r.id, spawnSpot(sp, slot % 8), Math.PI / 2, 999);
    }
    this.layoutViews();
  }

  removeRacer(id: number): void {
    const i = this.racers.findIndex((r) => r.id === id);
    if (i < 0) return;
    this.racers.splice(i, 1);
    this.pilots.delete(id);
    this.sim.removeBody(id);
    this.layoutViews();
  }

  restyle(id: number, look: Partial<Pick<RacerInfo, 'name' | 'fruit' | 'look' | 'color'>>): void {
    const r = this.racer(id);
    if (r) Object.assign(r, look);
  }

  /* ------------------------------------------------------------------ input */

  steer(id: number, x: number, y: number): void {
    if (this.pilots.has(id)) return;
    const r = this.racer(id);
    if (!r || r.finishedAt !== null || this.phase !== 'race') {
      this.sim.setMove(id, 0, 0);
      return;
    }
    const move = stickToCourse(x, y);
    this.sim.setMove(id, move.x, move.z);
  }

  jump(id: number): void {
    if (this.pilots.has(id) || this.phase !== 'race') return;
    const r = this.racer(id);
    if (r && r.finishedAt === null) this.sim.jump(id);
  }

  /* ------------------------------------------------------------------ tracks */

  private loadTrack(no: number): void {
    this.trackNo = no;
    this.course = buildCourse(no, this.seed);
    this.sim = new KotakSim({ killY: this.course.killY });
    for (const def of this.course.solids) this.sim.addSolid(def);
    this.trail = new SaveTrail(
      this.course.saves.map((s) => ({ index: s.index, pos: s.pos, hx: s.hx, hz: s.hz, solid: s.solid })),
    );
    this.savedFirst = new Set();
    this.firstFinishAt = null;
    this.raceT = 0;
    this.phase = 'intro';
    this.phaseT = 0;
    this.lastSecond = -1;
    this.countShown = 0;
    this.closeCall = null;
    const start = this.trail.point(0);
    this.racers.forEach((r, i) => {
      r.save = 0;
      r.finishedAt = null;
      r.place = null;
      r.offFor = 0;
      r.graceLeft = 0;
      r.sincePull = Infinity;
      const pos = spawnSpot(start, i % 8);
      this.sim.addBody({ id: r.id, pos, yaw: Math.PI / 2 });
      this.sim.place(r.id, pos, Math.PI / 2, 999);
    });
    this.snapViews();
    for (const [id, p] of this.pilots) p.resync(this, id);
    this.events.push({ k: 'track', no });
  }

  /** 0..1 along the course (1 = finished). */
  progress(r: Racer): number {
    if (r.finishedAt !== null) return 1;
    const b = this.sim.body(r.id);
    if (!b) return 0;
    const span = Math.max(1, this.course.finishX - this.course.startX);
    return Math.max(0, Math.min(0.999, (b.pos.x - this.course.startX) / span));
  }

  /** Live order: finishers by time, then by distance. */
  standings(): Racer[] {
    return [...this.racers].sort((a, b) => {
      if (a.finishedAt !== null || b.finishedAt !== null) {
        if (a.finishedAt === null) return 1;
        if (b.finishedAt === null) return -1;
        return a.finishedAt - b.finishedAt;
      }
      return this.progress(b) - this.progress(a) || b.save - a.save;
    });
  }

  /** Session order by total points (ties: better last track). */
  sessionStandings(): Racer[] {
    const lastPlace = new Map(this.lastResults.map((t) => [t.id, t.place]));
    return [...this.racers].sort(
      (a, b) => b.total - a.total || (lastPlace.get(a.id) ?? 99) - (lastPlace.get(b.id) ?? 99),
    );
  }

  timeLeft(): number {
    if (this.phase !== 'race') return TIMING.raceMax;
    const hard = TIMING.raceMax - this.raceT;
    if (this.firstFinishAt === null) return Math.max(0, hard);
    return Math.max(0, Math.min(hard, this.firstFinishAt + TIMING.afterFirst - this.raceT));
  }

  get countValue(): number {
    return Math.max(1, Math.ceil(TIMING.count - this.phaseT));
  }

  /* ------------------------------------------------------------------ tick */

  tick(dt: number): void {
    if (this.phase === 'done') return;
    this.phaseT += dt;
    switch (this.phase) {
      case 'intro':
        this.alpha = this.sim.advance(dt);
        this.drainSim();
        if (this.phaseT >= TIMING.intro) this.enter('count');
        break;
      case 'count': {
        this.alpha = this.sim.advance(dt);
        this.drainSim();
        const v = this.countValue;
        if (v !== this.countShown && this.phaseT < TIMING.count) {
          this.countShown = v;
          this.events.push({ k: 'count', value: v });
        }
        if (this.phaseT >= TIMING.count) this.enter('race');
        break;
      }
      case 'race':
        this.race(dt);
        break;
      case 'podium':
        this.alpha = this.sim.advance(dt);
        this.drainSim();
        if (this.phaseT >= TIMING.podium) {
          if (this.trackNo + 1 < this.tracks) this.loadTrack(this.trackNo + 1);
          else {
            this.phase = 'done';
            this.events.push({ k: 'done' });
          }
        }
        break;
    }
    this.updateCamera(dt);
  }

  private enter(phase: Phase): void {
    this.phase = phase;
    this.phaseT = 0;
    if (phase === 'count') {
      this.countShown = 0;
    } else if (phase === 'race') {
      for (const r of this.racers) {
        const b = this.sim.body(r.id);
        if (b) b.frozenLeft = 0;
      }
      this.events.push({ k: 'go' });
    }
  }

  private race(dt: number): void {
    this.raceT += dt;
    for (const [id, pilot] of this.pilots) {
      const r = this.racer(id);
      if (!r || r.finishedAt !== null) continue;
      const out = pilot.think(this, id, dt);
      this.sim.setMove(id, out.x, out.z);
      if (out.jump) this.sim.jump(id);
    }
    this.alpha = this.sim.advance(dt);
    this.drainSim();
    for (const r of this.racers) {
      r.sincePull += dt;
      r.graceLeft = Math.max(0, r.graceLeft - dt);
      const b = this.sim.body(r.id);
      if (!b || r.finishedAt !== null || b.ground < 0) continue;
      const s = this.sim.solids[b.ground]!;
      if (s.def.role === 'checkpoint') {
        const index = this.trail.bySolid(s.id);
        if (index > 0 && this.trail.reach(r.id, index)) {
          r.save = index;
          if (!this.savedFirst.has(index)) {
            this.savedFirst.add(index);
            r.stats.firstSaves++;
          }
          this.events.push({ k: 'save', id: r.id, index });
        }
      } else if (s.def.role === 'finish') this.finish(r);
    }
    this.offscreen(dt);
    const left = this.timeLeft();
    if (left <= 10 && left > 0) {
      const sec = Math.ceil(left);
      if (sec !== this.lastSecond) {
        this.lastSecond = sec;
        this.events.push({ k: 'second', left: sec });
      }
    }
    if (left <= 0 || this.racers.every((r) => r.finishedAt !== null)) this.endTrack();
  }

  private finish(r: Racer): void {
    r.finishedAt = this.raceT;
    r.place = this.racers.filter((o) => o.finishedAt !== null).length;
    this.sim.setMove(r.id, 0, 0);
    if (r.stats.best === null || this.raceT < r.stats.best) r.stats.best = this.raceT;
    if (r.place === 1) {
      r.stats.wins++;
      this.firstFinishAt = this.raceT;
      if (this.racers.length > 1) this.events.push({ k: 'hurry' });
    }
    this.events.push({ k: 'finish', id: r.id, place: r.place, time: this.raceT });
  }

  private endTrack(): void {
    const order = this.standings();
    const results: TrackResult[] = order.map((r, i) => {
      const base = PLACE_POINTS[Math.min(i, PLACE_POINTS.length - 1)]!;
      const points = r.finishedAt !== null ? base : Math.floor(base / 2);
      r.points.push(points);
      r.total += points;
      return { id: r.id, place: i + 1, time: r.finishedAt, points };
    });
    this.lastResults = results;
    const [a, b] = results;
    this.closeCall =
      a && b && a.time !== null && b.time !== null && b.time - a.time < 0.6
        ? { id: b.id, gap: b.time - a.time }
        : null;
    for (const r of this.racers) this.sim.setMove(r.id, 0, 0);
    this.phase = 'podium';
    this.phaseT = 0;
    this.events.push({ k: 'trackEnd', results });
  }

  /* ------------------------------------------------------------------ physics events */

  private drainSim(): void {
    for (const e of this.sim.drainEvents()) {
      switch (e.k) {
        case 'jump': {
          const r = this.racer(e.id);
          if (r) r.stats.jumps++;
          this.events.push({ k: 'jump', id: e.id });
          break;
        }
        case 'land': {
          const r = this.racer(e.id);
          if (r)
            r.stats.flight = Math.max(r.stats.flight, (e.speed * e.speed) / (2 * this.sim.tuning.gravity));
          if (e.speed > 9) this.events.push({ k: 'land', id: e.id, speed: e.speed });
          break;
        }
        case 'spring': {
          const r = this.racer(e.id);
          if (r) r.stats.springs++;
          this.events.push({ k: 'spring', id: e.id });
          break;
        }
        case 'sweep': {
          const r = this.racer(e.id);
          if (r) r.stats.sweeps++;
          this.events.push({ k: 'sweep', id: e.id });
          break;
        }
        case 'bump':
          this.events.push({ k: 'bump', a: e.a, b: e.b });
          break;
        case 'crack':
          this.events.push({ k: 'crack', solid: e.solid });
          break;
        case 'vanish':
          this.events.push({ k: 'vanish', solid: e.solid });
          break;
        case 'fall':
          this.respawn(e.id);
          break;
        default:
          break;
      }
    }
  }

  /** Back to the runner's own save pad after falling. */
  private respawn(id: number): void {
    const r = this.racer(id);
    const b = this.sim.body(id);
    if (!r || !b) return;
    const at = { ...b.pos };
    if (this.phase === 'race' && r.finishedAt === null) r.stats.falls++;
    const sp = this.trail.point(this.trail.of(id));
    const slot = this.racers.indexOf(r);
    this.sim.place(id, spawnSpot(sp, slot % 8), Math.PI / 2, TIMING.fallFreeze);
    r.offFor = 0;
    this.pilots.get(id)?.resync(this, id);
    this.events.push({ k: 'fall', id, at });
  }

  /* ------------------------------------------------------------------ camera and stragglers */

  /** Who the camera frames: the pack around the leader, plus anyone just brought back. */
  packIds(): number[] {
    const running = this.racers.filter((r) => r.finishedAt === null && this.sim.body(r.id)?.active);
    const list = running.length > 0 ? running : this.racers;
    let lead = -Infinity;
    for (const r of list) lead = Math.max(lead, this.sim.body(r.id)?.pos.x ?? -Infinity);
    return list
      .filter((r) => {
        const b = this.sim.body(r.id);
        return !!b && (b.pos.x >= lead - TIMING.pack || r.graceLeft > 0) && !b.fallen;
      })
      .map((r) => r.id);
  }

  private packRearX(exclude = 0): number {
    let rear = Infinity;
    for (const id of this.packIds()) {
      const r = this.racer(id);
      if (id === exclude || !r || r.graceLeft > 0) continue;
      rear = Math.min(rear, this.sim.body(id)?.pos.x ?? Infinity);
    }
    return Number.isFinite(rear) ? rear : 0;
  }

  private updateCamera(dt: number): void {
    for (const v of this.views) {
      const pts = this.viewPoints(v);
      if (pts.length > 0) v.cam.update(pts, dt);
    }
  }

  /** Only the shared pack camera leaves people behind; a camera of one's own never does. */
  private offscreen(dt: number): void {
    const shared = this.shared;
    for (const r of this.racers) {
      const b = this.sim.body(r.id);
      if (!shared || !b || r.finishedAt !== null || b.frozenLeft > 0 || r.graceLeft > 0 || b.fallen) {
        r.offFor = 0;
        continue;
      }
      const head = { x: b.pos.x, y: b.pos.y + 0.8, z: b.pos.z };
      if (this.camera.visible(head, 0.02)) r.offFor = Math.max(0, r.offFor - dt * 2);
      else r.offFor += dt;
      if (r.offFor >= TIMING.offscreen) this.pull(r);
    }
  }

  /** Bring a straggler to the save pad nearest the pack, held still for a second. */
  private pull(r: Racer): void {
    const sp = this.trail.nearestBehind(this.packRearX(r.id), this.trail.of(r.id));
    this.trail.reach(r.id, sp.index);
    r.save = Math.max(r.save, sp.index);
    const slot = this.racers.indexOf(r);
    this.sim.place(r.id, spawnSpot(sp, slot % 8), Math.PI / 2, TIMING.pullFreeze);
    r.offFor = 0;
    r.graceLeft = TIMING.grace + TIMING.pullFreeze;
    r.sincePull = 0;
    r.stats.pulls++;
    this.pilots.get(r.id)?.resync(this, r.id);
    this.events.push({ k: 'pulled', id: r.id });
  }
}
