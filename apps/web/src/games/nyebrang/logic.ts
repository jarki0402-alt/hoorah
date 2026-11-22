/**
 * Nyebrang match logic (pure): runners hop one cell per input across roads, rivers and rails
 * while the camera keeps moving up. Whoever drops below the bottom edge, gets hit, falls in the
 * water or drifts off with a log is out: back in 3 seconds in Balapan, out for the ronde in
 * Bertahan. Time is seconds of game time, advanced only by `step` (the driver stops it while
 * paused). The world itself is closed-form (lanes.ts), so nothing here depends on frame rate.
 */
import {
  COLS,
  gapAt,
  hitAt,
  type ItemPos,
  isLand,
  isOpen,
  type Lane,
  MAPS,
  type MapId,
  platformAt,
  START_ROWS,
  trainState,
  World,
} from './lanes';

export type Mode = 'balapan' | 'bertahan';
export type Dir = 'up' | 'down' | 'left' | 'right';
export type Phase = 'setup' | 'intro' | 'count' | 'run' | 'roundEnd' | 'final' | 'ended';
export type MapPick = MapId | 'acak';
export type DeathKind = 'hit' | 'train' | 'water' | 'drift' | 'edge';
export type SetupStep = 'mode' | 'map';

export const TUNING = {
  /** Seconds one hop takes (fast, so input feels instant). */
  hop: 0.11,
  /** Hops waiting behind the current one. */
  queue: 2,
  introS: 2.4,
  countS: 3,
  roundEndS: 8,
  finalS: 4.5,
  /** Balapan: seconds out before coming back. */
  respawnS: 3,
  /** Seconds of the run before the camera starts to move. */
  graceS: 2,
  /** Camera speed (rows/s) at the start and per level; a level every `levelS` seconds. */
  camBase: { balapan: 0.62, bertahan: 0.5 },
  camStep: { balapan: 0.15, bertahan: 0.13 },
  levelS: 20,
  /** The leader never gets further than this many rows above the bottom edge. */
  lead: 7,
  /** Balapan: finish row and time cap. Bertahan: time cap. */
  raceRows: 100,
  raceS: 120,
  surviveS: 90,
  /** A pass this close (cells between body and bumper) is a near miss. */
  nearGap: 0.42,
  nearCooldown: 1.2,
  nearPoints: 2,
} as const;

/** Bonus by place: Balapan finish order, Bertahan survival order. */
export const PLACE_BONUS = [25, 18, 12, 8, 6, 4, 2, 1] as const;

export interface RunnerInfo {
  id: number;
  name: string;
  cpu: boolean;
}

export interface Hop {
  fx: number;
  fr: number;
  tx: number;
  tr: number;
  t0: number;
  dir: Dir;
}

export interface Runner {
  id: number;
  name: string;
  cpu: boolean;
  joinIndex: number;
  /** Phone dropped: a computer brain steers until it comes back. */
  takeover: boolean;
  x: number;
  row: number;
  hop: Hop | null;
  queue: Dir[];
  facing: Dir;
  /** River lanes: riding a log or pad (x follows it). */
  riding: boolean;
  state: 'run' | 'dead' | 'out' | 'done';
  deadAt: number;
  death: DeathKind | null;
  /** Where the runner was when it went out (for the effect). */
  deathX: number;
  deathRow: number;
  /** Best row this ronde. */
  best: number;
  /** Order out (Bertahan) or finish place (Balapan); 0 = none. */
  place: number;
  outAt: number;
  lastNear: number;
  nearKeys: Set<string>;
  /** Ronde stats. */
  hops: number;
  near: number;
  deaths: number;
  riverHops: number;
  railCrossings: number;
  /** Session totals. */
  score: number;
  gained: number;
  total: Totals;
}

export interface Totals {
  distance: number;
  near: number;
  deaths: number;
  riverHops: number;
  railCrossings: number;
  wins: number;
  hops: number;
  backHops: number;
  bestRow: number;
}

export type NyebrangEvent =
  | { type: 'phase'; phase: Phase }
  | { type: 'hop'; id: number; dir: Dir; river: boolean }
  | { type: 'bump'; id: number }
  | { type: 'death'; id: number; kind: DeathKind }
  | { type: 'respawn'; id: number }
  | { type: 'near'; id: number; x: number; row: number }
  | { type: 'finish'; id: number; place: number }
  | { type: 'train'; row: number }
  | { type: 'level'; level: number }
  | { type: 'last10' };

export interface MatchOptions {
  rounds: number;
  seed: number;
  runners: readonly RunnerInfo[];
}

const emptyTotals = (): Totals => ({
  distance: 0,
  near: 0,
  deaths: 0,
  riverHops: 0,
  railCrossings: 0,
  wins: 0,
  hops: 0,
  backHops: 0,
  bestRow: 0,
});

export function parseRounds(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 ? Math.min(5, Math.floor(n)) : 3;
}

/** Map of each ronde: the Host's pick, or a shuffled cycle through all maps for "acak". */
export function mapsFor(pick: MapPick, rounds: number, rnd: () => number): MapId[] {
  if (pick !== 'acak') return Array.from({ length: rounds }, () => pick);
  const order = [...MAPS];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return Array.from({ length: rounds }, (_, i) => order[i % order.length]!);
}

export class NyebrangMatch {
  readonly rounds: number;
  phase: Phase = 'setup';
  setupStep: SetupStep = 'mode';
  mode: Mode = 'balapan';
  mapPick: MapPick = 'acak';
  maps: MapId[] = [];
  round = -1;
  world: World;
  /** Seconds of game time since the match was created. */
  t = 0;
  /** Seconds since the run of this ronde started (0 before). */
  runT = 0;
  /** Bottom edge row of the camera (float). */
  cam = 0;
  camSpeed = 0;
  level = 1;
  places = 0;
  private phaseT = 0;
  private readonly seed: number;
  private readonly rnd: () => number;
  private readonly runners = new Map<number, Runner>();
  private joinCounter = 0;
  private events: NyebrangEvent[] = [];
  private readonly buf: ItemPos[] = [];
  private warned = new Set<string>();
  private last10 = false;

  constructor(opts: MatchOptions) {
    this.rounds = Math.max(1, Math.min(5, Math.floor(opts.rounds)));
    this.seed = opts.seed >>> 0;
    this.rnd = (() => {
      let a = this.seed ^ 0x9e3779b9;
      return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let x = a;
        x = Math.imul(x ^ (x >>> 15), x | 1);
        x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
      };
    })();
    this.world = new World('kota', this.seed, null);
    this.setRunners(opts.runners);
  }

  /* ------------------------------------------------------------------ queries */

  get roster(): Runner[] {
    return [...this.runners.values()].sort((a, b) => a.joinIndex - b.joinIndex);
  }

  runner(id: number): Runner | undefined {
    return this.runners.get(id);
  }

  get map(): MapId {
    return this.world.map;
  }

  get isFinal(): boolean {
    return this.round === this.rounds - 1;
  }

  get timeCap(): number {
    return this.mode === 'balapan' ? TUNING.raceS : TUNING.surviveS;
  }

  get timeLeft(): number {
    return this.phase === 'run' ? Math.max(0, this.timeCap - this.runT) : this.timeCap;
  }

  /** Seconds left of the current non-run phase (intro, countdown, ronde end). */
  get phaseLeft(): number {
    const len =
      this.phase === 'intro'
        ? TUNING.introS
        : this.phase === 'count'
          ? TUNING.countS
          : this.phase === 'roundEnd'
            ? TUNING.roundEndS
            : this.phase === 'final'
              ? TUNING.finalS
              : 0;
    return Math.max(0, len - (this.t - this.phaseT));
  }

  /** Float position of a runner (mid-hop interpolated) and the hop height 0..1. */
  pose(r: Runner): { x: number; row: number; lift: number } {
    if (!r.hop) return { x: r.x, row: r.row, lift: 0 };
    const p = Math.min(1, (this.t - r.hop.t0) / TUNING.hop);
    return {
      x: r.hop.fx + (r.hop.tx - r.hop.fx) * p,
      row: r.hop.fr + (r.hop.tr - r.hop.fr) * p,
      lift: Math.sin(p * Math.PI),
    };
  }

  /** Runners still in the ronde (Bertahan) or not finished (Balapan). */
  get alive(): Runner[] {
    return this.roster.filter((r) => r.state === 'run' || r.state === 'dead');
  }

  /** Live order for the board: finished by place, then furthest first. */
  ranking(): Runner[] {
    return this.roster.slice().sort((a, b) => {
      const pa = this.mode === 'balapan' ? a.place || 999 : 0;
      const pb = this.mode === 'balapan' ? b.place || 999 : 0;
      if (pa !== pb) return pa - pb;
      if (this.mode === 'bertahan') {
        const oa = a.state === 'out' ? a.outAt : Number.POSITIVE_INFINITY;
        const ob = b.state === 'out' ? b.outAt : Number.POSITIVE_INFINITY;
        if (oa !== ob) return ob - oa;
      }
      return b.best - a.best || a.joinIndex - b.joinIndex;
    });
  }

  standings(): { r: Runner; rank: number }[] {
    const rows = this.roster.slice().sort((a, b) => b.score - a.score || b.total.distance - a.total.distance);
    let rank = 0;
    let prev = Number.NaN;
    return rows.map((r, i) => {
      if (r.score !== prev) rank = i + 1;
      prev = r.score;
      return { r, rank };
    });
  }

  /* ------------------------------------------------------------------ roster */

  setRunners(list: readonly RunnerInfo[]): void {
    for (const info of list) {
      if (this.runners.has(info.id)) {
        const r = this.runners.get(info.id)!;
        r.name = info.name;
        continue;
      }
      const r: Runner = {
        id: info.id,
        name: info.name,
        cpu: info.cpu,
        joinIndex: this.joinCounter++,
        takeover: false,
        x: 0,
        row: 0,
        hop: null,
        queue: [],
        facing: 'up',
        riding: false,
        state: this.phase === 'run' || this.phase === 'count' ? 'out' : 'run',
        deadAt: 0,
        death: null,
        deathX: 0,
        deathRow: 0,
        best: 0,
        place: 0,
        outAt: 0,
        lastNear: -10,
        nearKeys: new Set(),
        hops: 0,
        near: 0,
        deaths: 0,
        riverHops: 0,
        railCrossings: 0,
        score: 0,
        gained: 0,
        total: emptyTotals(),
      };
      this.runners.set(info.id, r);
      if (this.phase === 'setup' || this.phase === 'intro') this.placeAtStart();
    }
  }

  setTakeover(id: number, on: boolean): void {
    const r = this.runners.get(id);
    if (r) r.takeover = on;
  }

  /* ------------------------------------------------------------------ setup (Host) */

  pick(value: string): boolean {
    if (this.phase !== 'setup') return false;
    if (this.setupStep === 'mode' && (value === 'balapan' || value === 'bertahan')) {
      this.mode = value;
      return true;
    }
    if (this.setupStep === 'map' && (value === 'acak' || (MAPS as readonly string[]).includes(value))) {
      this.mapPick = value as MapPick;
      return true;
    }
    return false;
  }

  next(): NyebrangEvent[] {
    if (this.phase !== 'setup') return [];
    if (this.setupStep === 'mode') {
      this.setupStep = 'map';
      return [{ type: 'phase', phase: 'setup' }];
    }
    return this.start();
  }

  back(): boolean {
    if (this.phase !== 'setup' || this.setupStep !== 'map') return false;
    this.setupStep = 'mode';
    return true;
  }

  start(): NyebrangEvent[] {
    if (this.phase !== 'setup') return [];
    this.maps = mapsFor(this.mapPick, this.rounds, this.rnd);
    this.beginRound();
    return this.flush();
  }

  /* ------------------------------------------------------------------ input */

  /** Queue a hop (phones and computer runners). */
  input(id: number, dir: Dir): void {
    const r = this.runners.get(id);
    if (!r || this.phase !== 'run' || r.state !== 'run') return;
    if (!r.hop) {
      this.tryHop(r, dir);
      return;
    }
    if (r.queue.length < TUNING.queue) r.queue.push(dir);
  }

  /* ------------------------------------------------------------------ clock */

  step(dt: number): NyebrangEvent[] {
    const d = Math.max(0, Math.min(0.1, dt));
    this.t += d;
    switch (this.phase) {
      case 'intro':
        if (this.t - this.phaseT >= TUNING.introS) this.enter('count');
        break;
      case 'count':
        if (this.t - this.phaseT >= TUNING.countS) {
          this.enter('run');
          this.runT = 0;
        }
        break;
      case 'run':
        this.runStep(d);
        break;
      case 'roundEnd':
        if (this.t - this.phaseT >= TUNING.roundEndS) {
          if (this.round + 1 >= this.rounds) this.enter('final');
          else this.beginRound();
        }
        break;
      case 'final':
        if (this.t - this.phaseT >= TUNING.finalS) this.enter('ended');
        break;
      default:
        break;
    }
    return this.flush();
  }

  /* ------------------------------------------------------------------ flow */

  private flush(): NyebrangEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  private enter(phase: Phase): void {
    this.phase = phase;
    this.phaseT = this.t;
    this.events.push({ type: 'phase', phase });
  }

  private beginRound(): void {
    this.round++;
    const map = this.maps[this.round] ?? 'kota';
    const finish = this.mode === 'balapan' ? TUNING.raceRows : null;
    this.world = new World(map, (this.seed + this.round * 7919) >>> 0, finish);
    this.cam = 0;
    this.camSpeed = 0;
    this.level = 1;
    this.places = 0;
    this.runT = 0;
    this.warned.clear();
    this.last10 = false;
    for (const r of this.runners.values()) {
      r.state = 'run';
      r.hop = null;
      r.queue = [];
      r.riding = false;
      r.death = null;
      r.place = 0;
      r.outAt = 0;
      r.best = 0;
      r.hops = 0;
      r.near = 0;
      r.deaths = 0;
      r.riverHops = 0;
      r.railCrossings = 0;
      r.gained = 0;
      r.nearKeys.clear();
      r.facing = 'up';
    }
    this.placeAtStart();
    this.enter('intro');
  }

  /** Spread everyone along the start row, centre first. */
  private placeAtStart(): void {
    const list = this.roster;
    const mid = Math.floor(COLS / 2);
    list.forEach((r, i) => {
      const off = i % 2 === 0 ? i / 2 : -Math.ceil(i / 2);
      const col = Math.max(0, Math.min(COLS - 1, mid + off * (list.length > 6 ? 1 : 2)));
      r.x = col;
      r.row = 1;
      r.best = 1;
    });
  }

  private runStep(dt: number): void {
    this.runT += dt;
    this.moveCamera(dt);
    for (const r of this.runners.values()) this.updateRunner(r, dt);
    this.announceTrains();
    if (!this.last10 && this.timeCap - this.runT <= 10) {
      this.last10 = true;
      this.events.push({ type: 'last10' });
    }
    if (this.roundOver()) this.endRound();
  }

  private moveCamera(dt: number): void {
    if (this.runT < TUNING.graceS) return;
    const lvl = 1 + Math.floor((this.runT - TUNING.graceS) / TUNING.levelS);
    if (lvl !== this.level) {
      this.level = lvl;
      this.events.push({ type: 'level', level: lvl });
    }
    const base = TUNING.camBase[this.mode] + TUNING.camStep[this.mode] * (lvl - 1);
    let lead = Number.NEGATIVE_INFINITY;
    for (const r of this.runners.values()) if (r.state === 'run') lead = Math.max(lead, r.row);
    // Catch up with the leader smoothly so nobody runs off the top of the screen.
    const over = lead - (this.cam + TUNING.lead);
    const catchUp = over > 0 ? over * 2.2 : 0;
    this.camSpeed = base + catchUp;
    const stop = this.world.finish !== null ? this.world.finish - TUNING.lead - 1 : Number.POSITIVE_INFINITY;
    this.cam = Math.min(stop, this.cam + this.camSpeed * dt);
  }

  private updateRunner(r: Runner, dt: number): void {
    if (r.state === 'dead') {
      if (this.mode === 'balapan' && this.t - r.deadAt >= TUNING.respawnS) this.respawn(r);
      return;
    }
    if (r.state !== 'run') return;
    if (r.hop) {
      if (this.t - r.hop.t0 >= TUNING.hop) this.land(r);
    } else if (r.riding) {
      const lane = this.world.lane(r.row);
      r.x += lane.speed * dt;
      if (r.x < -0.45 || r.x > COLS - 0.55) {
        this.kill(r, 'drift');
        return;
      }
    }
    if (r.state !== 'run') return;
    const pose = this.pose(r);
    const p = r.hop ? Math.min(1, (this.t - r.hop.t0) / TUNING.hop) : 1;
    const row = r.hop ? (p < 0.5 ? r.hop.fr : r.hop.tr) : r.row;
    const lane = this.world.lane(row);
    const hit = hitAt(lane, this.t, pose.x, this.buf);
    if (hit) {
      this.kill(r, lane.kind === 'rail' ? 'train' : 'hit');
      return;
    }
    if (pose.row < this.cam - 0.5) {
      this.kill(r, 'edge');
      return;
    }
    this.checkNear(r, lane, pose.x, pose.row);
  }

  private checkNear(r: Runner, lane: Lane, x: number, row: number): void {
    if (lane.kind !== 'road' && lane.kind !== 'rail') return;
    const { gap, key } = gapAt(lane, this.t, x, this.buf);
    if (gap > TUNING.nearGap || key < 0) return;
    const id = `${lane.row}:${key}`;
    if (r.nearKeys.has(id) || this.t - r.lastNear < TUNING.nearCooldown) return;
    r.nearKeys.add(id);
    if (r.nearKeys.size > 40) r.nearKeys.delete(r.nearKeys.values().next().value as string);
    r.lastNear = this.t;
    r.near++;
    r.total.near++;
    this.events.push({ type: 'near', id: r.id, x, row });
  }

  private tryHop(r: Runner, dir: Dir): void {
    r.facing = dir;
    const fromLane = this.world.lane(r.row);
    let tr = r.row;
    let tx = r.x;
    if (dir === 'up') tr++;
    else if (dir === 'down') tr--;
    else tx += dir === 'left' ? -1 : 1;
    if (tr < 0) {
      this.events.push({ type: 'bump', id: r.id });
      return;
    }
    const to = this.world.lane(tr);
    if (to.kind === 'river') {
      if (tx < -0.35 || tx > COLS - 0.65) {
        this.events.push({ type: 'bump', id: r.id });
        return;
      }
    } else {
      tx = Math.round(tx);
      if (!isOpen(to, tx)) {
        this.events.push({ type: 'bump', id: r.id });
        return;
      }
    }
    r.hop = { fx: r.x, fr: r.row, tx, tr, t0: this.t, dir };
    r.riding = false;
    r.hops++;
    r.total.hops++;
    if (dir === 'down') r.total.backHops++;
    if (to.kind === 'river') {
      r.riverHops++;
      r.total.riverHops++;
    }
    if (fromLane.kind === 'rail' && tr > r.row) {
      r.railCrossings++;
      r.total.railCrossings++;
    }
    r.row = tr;
    this.events.push({ type: 'hop', id: r.id, dir, river: to.kind === 'river' });
  }

  private land(r: Runner): void {
    const hop = r.hop!;
    r.hop = null;
    r.x = hop.tx;
    r.row = hop.tr;
    const lane = this.world.lane(r.row);
    if (lane.kind === 'river') {
      const plat = platformAt(lane, this.t, r.x, this.buf);
      if (!plat) {
        this.kill(r, 'water');
        return;
      }
      // Settle on the nearest slot of the log (pads: their centre).
      const slot = Math.max(0, Math.min(plat.len - 1, Math.round(r.x - plat.left - 0.5)));
      r.x = plat.left + slot + 0.5;
      r.riding = true;
      if (r.x < -0.45 || r.x > COLS - 0.55) {
        this.kill(r, 'drift');
        return;
      }
    }
    if (r.row > r.best) r.best = r.row;
    if (this.world.finish !== null && r.row >= this.world.finish && r.state === 'run') {
      r.state = 'done';
      r.place = ++this.places;
      r.queue = [];
      this.events.push({ type: 'finish', id: r.id, place: r.place });
      return;
    }
    const next = r.queue.shift();
    if (next) this.tryHop(r, next);
  }

  private kill(r: Runner, kind: DeathKind): void {
    const pose = this.pose(r);
    r.deathX = pose.x;
    r.deathRow = pose.row;
    r.hop = null;
    r.queue = [];
    r.riding = false;
    r.death = kind;
    r.deadAt = this.t;
    r.deaths++;
    r.total.deaths++;
    if (this.mode === 'balapan') {
      r.state = 'dead';
    } else {
      r.state = 'out';
      r.outAt = this.t;
    }
    this.events.push({ type: 'death', id: r.id, kind });
  }

  /** Back on the first safe land row above the bottom edge, near the middle. */
  private respawn(r: Runner): void {
    const from = Math.max(START_ROWS - 2, Math.ceil(this.cam + 1));
    for (let row = from; row < from + 14; row++) {
      const lane = this.world.lane(row);
      if (!isLand(lane.kind)) continue;
      const mid = Math.floor(COLS / 2);
      for (let k = 0; k < COLS; k++) {
        const col = mid + (k % 2 ? -Math.ceil(k / 2) : Math.ceil(k / 2));
        if (isOpen(lane, col)) {
          r.x = col;
          r.row = row;
          r.state = 'run';
          r.death = null;
          r.nearKeys.clear();
          this.events.push({ type: 'respawn', id: r.id });
          return;
        }
      }
    }
    // No land in reach yet: try again next frame.
  }

  private announceTrains(): void {
    const lo = Math.floor(this.cam);
    for (let row = lo; row < lo + 16; row++) {
      const lane = this.world.lane(row);
      if (lane.kind !== 'rail' || !lane.train) continue;
      const state = trainState(lane, this.t);
      const key = `${row}:${Math.floor((this.t + lane.train.offset) / lane.train.period)}`;
      if (state === 1 && !this.warned.has(key)) {
        this.warned.add(key);
        this.events.push({ type: 'train', row });
      }
    }
    if (this.warned.size > 64) this.warned.clear();
  }

  private roundOver(): boolean {
    if (this.runT >= this.timeCap) return true;
    const list = [...this.runners.values()];
    if (list.length === 0) return false;
    if (this.mode === 'balapan') return list.every((r) => r.state === 'done');
    const alive = list.filter((r) => r.state === 'run');
    const humans = list.filter((r) => !r.cpu);
    if (humans.length > 0 && humans.every((r) => r.state === 'out')) return true;
    return list.length > 1 ? alive.length <= 1 : alive.length === 0;
  }

  private endRound(): void {
    const mult = this.isFinal ? 2 : 1;
    const order = this.ranking();
    order.forEach((r, i) => {
      const distance = Math.max(0, r.best - 1);
      const placed = this.mode === 'balapan' ? r.place > 0 : true;
      const bonus = placed ? (PLACE_BONUS[i] ?? 0) : 0;
      r.gained = (distance + r.near * TUNING.nearPoints + bonus) * mult;
      r.score += r.gained;
      r.total.distance += distance;
      r.total.bestRow = Math.max(r.total.bestRow, distance);
      if (i === 0) r.total.wins++;
    });
    this.enter('roundEnd');
  }
}
