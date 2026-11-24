/**
 * Lantai Runtuh rules (pure, no rendering): seven rounds on one tile stage, each with its own
 * rule (Kotak acak, Angka, Warna, Simbol, Jangan diam, Gelombang, Gelap). Wrong tiles crumble
 * into the dark. Surviving a round scores 50, falling keeps points for the time survived, and
 * the fallen come back next round. The last round (Gelap) scores double. DORONG shoves the
 * nearest player in front, then rests 3 seconds (owner's decision 2026-11-22).
 */
import type { Fruit, Look } from '@hoorah/protocol';
import { rng, shuffle, type V3 } from '../../shared/kotak/math';
import { KotakSim } from '../../shared/kotak/sim';
import {
  COLOR_IDS,
  COLS,
  type ColorId,
  colOf,
  colorLayout,
  makeSum,
  numberLayout,
  ROWS,
  randomFaces,
  rowOf,
  type Sum,
  SYMBOL_IDS,
  type SymbolId,
  spreadTiles,
  startTiles,
  symbolLayout,
  TILES,
  type TileFace,
  tileCenter,
  tileSolids,
} from './arena';

export const RULES = ['acak', 'angka', 'warna', 'simbol', 'diam', 'gelombang', 'gelap'] as const;
export type Rule = (typeof RULES)[number];

export interface PlayerInfo {
  id: number;
  name: string;
  fruit: Fruit;
  look: Look;
  color: string;
  cpu: boolean;
}

export type Phase = 'intro' | 'play' | 'end' | 'final' | 'done';

export const TIMING = {
  intro: 4,
  end: 3.4,
  final: 7,
  /** DORONG rest (s). */
  pushCooldown: 3,
  pushReach: 1.9,
  pushSpeed: 8,
  /** A fall within this long after a shove counts for the pusher (s). */
  pushCredit: 2.5,
  /** Moved off a tile this long before it fell: a near miss (s). */
  nearMiss: 0.5,
  /** Continuous rounds last this long (s). */
  continuous: 34,
} as const;

export const SURVIVE_POINTS = 50;
/** Call rounds: how long the wrong tiles stay down, then the pause before the next call (s). */
const DROP_S = 2.2;
const REST_S = 1.1;

/** One call of a call round: a target to stand on, then the wrong tiles drop. */
export interface Call {
  /** Seconds to get there (after the show for Gelap). */
  count: number;
  /** Gelap: seconds the safe tiles glow first. */
  show: number;
  targets: number[];
  color?: ColorId;
  symbol?: SymbolId;
  sum?: Sum;
}

export type CallStage = 'show' | 'count' | 'drop' | 'rest';

export interface Stats {
  survived: number;
  falls: number;
  pushes: number;
  pushHits: number;
  /** Players who fell within a moment of this player's shove. */
  knockouts: number;
  nearMisses: number;
  /** Metres moved. */
  distance: number;
  /** Survived the final round. */
  finalSurvivor: boolean;
}

export interface Contestant extends PlayerInfo {
  /** Points per round so far. */
  rounds: number[];
  total: number;
  /** Fell in the current round. */
  out: boolean;
  /** Sim time when the last push happened (cooldown), -Infinity = never. */
  pushedAt: number;
  stats: Stats;
}

export type RuntuhEvent =
  | { k: 'round'; no: number; rule: Rule }
  | { k: 'play' }
  | { k: 'call'; index: number; call: Call }
  | { k: 'reveal' }
  | { k: 'drop'; tiles: number[] }
  | { k: 'restore' }
  | { k: 'wave'; tiles: number[] }
  | { k: 'crack'; tile: number }
  | { k: 'vanish'; tile: number }
  | { k: 'second'; left: number }
  | { k: 'fall'; id: number; at: V3; by: number | null }
  | { k: 'push'; id: number; target: number | null }
  | { k: 'nearMiss'; id: number; gap: number }
  | { k: 'roundEnd'; no: number; points: Map<number, number> }
  | { k: 'final' }
  | { k: 'done' };

export interface Pilot {
  think(m: RuntuhMatch, id: number, dt: number): { x: number; z: number; push: boolean };
}

const newStats = (): Stats => ({
  survived: 0,
  falls: 0,
  pushes: 0,
  pushHits: 0,
  knockouts: 0,
  nearMisses: 0,
  distance: 0,
  finalSurvivor: false,
});

export interface MatchOptions {
  players: PlayerInfo[];
  rounds?: number;
  seed: number;
}

export class RuntuhMatch {
  readonly players: Contestant[];
  readonly rules: Rule[];
  readonly sim: KotakSim;
  readonly rnd: () => number;
  round = 0;
  phase: Phase = 'intro';
  phaseT = 0;
  /** Faces of every tile; `faceVersion` changes whenever they do (renderer). */
  faces: TileFace[];
  faceVersion = 0;
  /** Call rounds: the current call and its stage. */
  calls: Call[] = [];
  callIndex = -1;
  callStage: CallStage = 'rest';
  callT = 0;
  /** Gelap: lights are down. */
  dark = false;
  /** Tiles glowing as safe right now (Gelap show, and every call's targets while counting). */
  glow = new Set<number>();
  /** Round length (continuous rounds) or the sum of the calls (s). */
  roundLength = 0;
  /** Interpolation factor of the last simulation advance (renderer). */
  alpha = 0;
  private readonly pilots = new Map<number, Pilot>();
  private events: RuntuhEvent[] = [];
  private nextWave = 0;
  private lastSecond = -1;
  private readonly onTile = new Map<number, { tile: number; since: number; last: number; leftAt: number }>();
  private readonly shovedBy = new Map<number, { by: number; t: number }>();
  private readonly fellAt = new Map<number, number>();

  constructor(opts: MatchOptions) {
    this.rnd = rng(opts.seed);
    const n = Math.max(1, Math.min(RULES.length, Math.floor(opts.rounds ?? RULES.length)));
    // Fewer rounds keep the opener and the dark final.
    this.rules = n >= RULES.length ? [...RULES] : [...RULES.slice(0, n - 1), 'gelap'];
    this.players = opts.players.map((p) => this.makeContestant(p));
    this.sim = new KotakSim({ speed: 5.4, killY: -3, crowd: 1, stun: 0.55 });
    for (const def of tileSolids()) this.sim.addSolid(def);
    this.faces = randomFaces(this.rnd);
    const spots = startTiles(this.players.length);
    this.players.forEach((p, i) => {
      const c = tileCenter(spots[i] ?? i);
      this.sim.addBody({ id: p.id, pos: { x: c.x, y: 0, z: c.z } });
    });
    this.startRound(0);
  }

  private makeContestant(p: PlayerInfo): Contestant {
    return { ...p, rounds: [], total: 0, out: false, pushedAt: -Infinity, stats: newStats() };
  }

  get rule(): Rule {
    return this.rules[this.round]!;
  }

  get isFinal(): boolean {
    return this.round === this.rules.length - 1;
  }

  get multiplier(): number {
    return this.isFinal ? 2 : 1;
  }

  player(id: number): Contestant | undefined {
    return this.players.find((p) => p.id === id);
  }

  setPilot(id: number, pilot: Pilot | null): void {
    if (pilot) this.pilots.set(id, pilot);
    else {
      this.pilots.delete(id);
      this.sim.setMove(id, 0, 0);
    }
  }

  drainEvents(): RuntuhEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /* ------------------------------------------------------------------ lineup */

  addPlayer(info: PlayerInfo): void {
    if (this.player(info.id)) return;
    const p = this.makeContestant(info);
    p.rounds = this.players[0]?.rounds.map(() => 0) ?? [];
    // Joins at the next round, watching until then.
    p.out = this.phase !== 'intro';
    this.players.push(p);
    const c = tileCenter(startTiles(8)[(this.players.length - 1) % 8] ?? 0);
    const b = this.sim.addBody({ id: p.id, pos: { x: c.x, y: 0, z: c.z } });
    if (p.out) b.active = false;
    else this.sim.place(p.id, { x: c.x, y: 0, z: c.z }, 0, 99);
  }

  removePlayer(id: number): void {
    const i = this.players.findIndex((p) => p.id === id);
    if (i < 0) return;
    this.players.splice(i, 1);
    this.pilots.delete(id);
    this.sim.removeBody(id);
  }

  restyle(id: number, look: Partial<Pick<PlayerInfo, 'name' | 'fruit' | 'look' | 'color'>>): void {
    const p = this.player(id);
    if (p) Object.assign(p, look);
  }

  /* ------------------------------------------------------------------ input */

  steer(id: number, x: number, y: number): void {
    if (this.pilots.has(id)) return;
    this.sim.setMove(id, this.phase === 'play' ? x : 0, this.phase === 'play' ? y : 0);
  }

  /** DORONG: shove the nearest player in front. Returns false while resting or not allowed. */
  push(id: number): boolean {
    const p = this.player(id);
    const b = this.sim.body(id);
    if (!p || !b || p.out || this.phase !== 'play' || !b.active || b.frozenLeft > 0) return false;
    if (this.sim.t - p.pushedAt < TIMING.pushCooldown) return false;
    p.pushedAt = this.sim.t;
    p.stats.pushes++;
    const fx = Math.sin(b.yaw);
    const fz = Math.cos(b.yaw);
    let best: number | null = null;
    let bestScore = Infinity;
    for (const o of this.sim.bodies) {
      if (o.id === id || !o.active || o.fallen) continue;
      const dx = o.pos.x - b.pos.x;
      const dz = o.pos.z - b.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > TIMING.pushReach || Math.abs(o.pos.y - b.pos.y) > 1) continue;
      const facing = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
      // In front (within about 75 degrees), or very close in any direction.
      if (facing < 0.26 && d > 1.1) continue;
      const score = d - facing * 0.6;
      if (score < bestScore) {
        bestScore = score;
        best = o.id;
      }
    }
    if (best !== null) {
      const o = this.sim.body(best)!;
      const dx = o.pos.x - b.pos.x;
      const dz = o.pos.z - b.pos.z;
      const len = Math.hypot(dx, dz);
      this.sim.shove(best, len > 0.01 ? dx : fx, len > 0.01 ? dz : fz, TIMING.pushSpeed, id);
      this.shovedBy.set(best, { by: id, t: this.sim.t });
      p.stats.pushHits++;
    }
    this.events.push({ k: 'push', id, target: best });
    return true;
  }

  /** Seconds until DORONG is ready again (0 = ready). */
  pushRest(id: number): number {
    const p = this.player(id);
    if (!p) return 0;
    return Math.max(0, TIMING.pushCooldown - (this.sim.t - p.pushedAt));
  }

  /* ------------------------------------------------------------------ rounds */

  private startRound(no: number): void {
    this.round = no;
    this.phase = 'intro';
    this.phaseT = 0;
    this.callIndex = -1;
    this.callStage = 'rest';
    this.calls = [];
    this.dark = false;
    this.glow = new Set();
    this.nextWave = 0;
    this.lastSecond = -1;
    this.onTile.clear();
    this.shovedBy.clear();
    this.fellAt.clear();
    for (const s of this.sim.solids) this.sim.restore(s.id);
    this.faces = randomFaces(this.rnd);
    this.faceVersion++;
    const spots = shuffle(startTiles(this.players.length), this.rnd);
    this.players.forEach((p, i) => {
      p.out = false;
      const c = tileCenter(spots[i % spots.length] ?? 0);
      this.sim.place(p.id, { x: c.x, y: 0, z: c.z }, 0, 999);
    });
    this.calls = this.planCalls();
    this.roundLength =
      this.calls.length > 0
        ? this.calls.reduce((s, c) => s + c.show + c.count + DROP_S + REST_S, 0)
        : TIMING.continuous;
    this.sim.drainEvents();
    this.events.push({ k: 'round', no, rule: this.rule });
  }

  private planCalls(): Call[] {
    const n = this.players.length;
    const atLeast = (k: number) => Math.max(3, Math.min(k, TILES - 4));
    switch (this.rule) {
      case 'angka':
        return [7, 6, 5].map((count, i) => ({
          count,
          show: 0,
          sum: makeSum(i, this.rnd),
          targets: spreadTiles(atLeast([6, 5, 4][i]!), this.rnd),
        }));
      case 'warna':
        return [5, 4.5, 4].map((count, i) => ({
          count,
          show: 0,
          color: COLOR_IDS[Math.floor(this.rnd() * COLOR_IDS.length)]!,
          targets: spreadTiles(atLeast([8, 6, 5][i]!), this.rnd),
        }));
      case 'simbol':
        return [5, 4.5, 4].map((count, i) => ({
          count,
          show: 0,
          symbol: SYMBOL_IDS[Math.floor(this.rnd() * SYMBOL_IDS.length)]!,
          targets: spreadTiles(atLeast([8, 6, 5][i]!), this.rnd),
        }));
      case 'gelap':
        return [0, 1, 2].map((i) => ({
          count: [2.6, 2.3, 2][i]!,
          show: [2.2, 1.8, 1.5][i]!,
          targets: spreadTiles(atLeast(Math.max([6, 5, 4][i]!, Math.ceil(n / 2))), this.rnd),
        }));
      default:
        return [];
    }
  }

  /** The call being played, if any. */
  get call(): Call | null {
    return this.calls[this.callIndex] ?? null;
  }

  /** Seconds left of the current call's countdown, or of a continuous round. */
  get secondsLeft(): number {
    if (this.phase !== 'play') return 0;
    const c = this.call;
    if (c) {
      if (this.callStage === 'show') return c.show - this.callT + c.count;
      if (this.callStage === 'count') return c.count - this.callT;
      return 0;
    }
    return this.calls.length > 0 ? 0 : Math.max(0, TIMING.continuous - this.phaseT);
  }

  alive(): Contestant[] {
    return this.players.filter((p) => !p.out);
  }

  /** Total order (ties: more rounds survived). */
  standings(): Contestant[] {
    return [...this.players].sort((a, b) => b.total - a.total || b.stats.survived - a.stats.survived);
  }

  /* ------------------------------------------------------------------ tick */

  tick(dt: number): void {
    if (this.phase === 'done') return;
    this.phaseT += dt;
    switch (this.phase) {
      case 'intro':
        this.alpha = this.sim.advance(dt);
        this.sim.drainEvents();
        if (this.phaseT >= TIMING.intro) {
          this.phase = 'play';
          this.phaseT = 0;
          for (const p of this.players) {
            const b = this.sim.body(p.id);
            if (b) b.frozenLeft = 0;
          }
          this.events.push({ k: 'play' });
          if (this.calls.length > 0) this.nextCall();
        }
        break;
      case 'play':
        this.play(dt);
        break;
      case 'end':
        this.alpha = this.sim.advance(dt);
        this.sim.drainEvents();
        if (this.phaseT >= TIMING.end) {
          if (this.round + 1 < this.rules.length) this.startRound(this.round + 1);
          else {
            this.phase = 'final';
            this.phaseT = 0;
            this.events.push({ k: 'final' });
          }
        }
        break;
      case 'final':
        if (this.phaseT >= TIMING.final) {
          this.phase = 'done';
          this.events.push({ k: 'done' });
        }
        break;
    }
  }

  private play(dt: number): void {
    for (const [id, pilot] of this.pilots) {
      const p = this.player(id);
      if (!p || p.out) continue;
      const out = pilot.think(this, id, dt);
      this.sim.setMove(id, out.x, out.z);
      if (out.push) this.push(id);
    }
    const before = new Map(this.sim.bodies.map((b) => [b.id, { x: b.pos.x, z: b.pos.z }]));
    this.alpha = this.sim.advance(dt);
    for (const b of this.sim.bodies) {
      const p = this.player(b.id);
      const was = before.get(b.id);
      if (p && was && !p.out) p.stats.distance += Math.hypot(b.pos.x - was.x, b.pos.z - was.z);
    }
    this.trackTiles();
    switch (this.rule) {
      case 'acak':
        this.ruleRandom();
        break;
      case 'diam':
        this.ruleStill();
        break;
      case 'gelombang':
        this.ruleWave();
        break;
      default:
        this.ruleCalls(dt);
        break;
    }
    this.drainSim();
    const left = this.secondsLeft;
    if (left > 0 && left <= 5 && (this.calls.length === 0 || this.callStage === 'count')) {
      const sec = Math.ceil(left);
      if (sec !== this.lastSecond) {
        this.lastSecond = sec;
        this.events.push({ k: 'second', left: sec });
      }
    }
    const over =
      this.calls.length > 0 ? this.callIndex >= this.calls.length : this.phaseT >= TIMING.continuous;
    if (over || this.alive().length === 0) this.endRound();
  }

  /** Who stands on which tile, for "Jangan diam" and near misses. */
  private trackTiles(): void {
    const t = this.sim.t;
    for (const b of this.sim.bodies) {
      if (!b.active) continue;
      const tile = b.ground >= 0 ? (this.sim.solids[b.ground]?.def.tag ?? -1) : -1;
      const cur = this.onTile.get(b.id);
      if (!cur) {
        this.onTile.set(b.id, { tile, since: t, last: -1, leftAt: -Infinity });
        continue;
      }
      if (tile !== cur.tile && tile >= 0) {
        if (cur.tile >= 0) {
          cur.last = cur.tile;
          cur.leftAt = t;
        }
        cur.tile = tile;
        cur.since = t;
      }
    }
  }

  /* ------------------------------------------------------------------ rules */

  private dropTiles(tiles: number[], warn: number, gone: number): void {
    for (const i of tiles) this.sim.crumble(i, warn, gone);
  }

  private solidTiles(): number[] {
    return this.sim.solids.filter((s) => s.state === 'solid').map((s) => s.id);
  }

  /** Kotak acak: waves of random tiles blink white and fall, faster and more as time goes. */
  private ruleRandom(): void {
    const k = Math.min(1, this.phaseT / TIMING.continuous);
    if (this.phaseT < this.nextWave) return;
    this.nextWave = this.phaseT + 2.6 - 1.3 * k;
    const n = Math.round(3 + 5 * k);
    const pick = shuffle(this.solidTiles(), this.rnd).slice(0, n);
    this.dropTiles(pick, 1.1 - 0.25 * k, 2.6);
    this.events.push({ k: 'wave', tiles: pick });
  }

  /** Jangan diam: a tile you stand on too long cracks; a few random tiles fall too. */
  private ruleStill(): void {
    const t = this.sim.t;
    for (const [id, s] of this.onTile) {
      if (s.tile < 0 || this.player(id)?.out !== false) continue;
      const solid = this.sim.solids[s.tile];
      if (solid?.state === 'solid' && t - s.since > 0.9) this.sim.crumble(s.tile, 0.65, 3.5);
    }
    if (this.phaseT >= this.nextWave) {
      this.nextWave = this.phaseT + 3;
      if (this.phaseT > 1) this.dropTiles(shuffle(this.solidTiles(), this.rnd).slice(0, 2), 0.9, 3);
    }
  }

  /** Gelombang: a side of the stage sweeps down column by column (or row by row), then rises. */
  private ruleWave(): void {
    if (this.phaseT < this.nextWave) return;
    const k = Math.min(1, this.phaseT / TIMING.continuous);
    this.nextWave = this.phaseT + 3.8 - 1.4 * k;
    const side = Math.floor(this.rnd() * 4);
    const horizontal = side < 2;
    const lines = horizontal ? COLS : ROWS;
    const depth = horizontal ? 3 + (k > 0.5 ? 1 : 0) : 2 + (k > 0.6 ? 1 : 0);
    const warn = 1.4 - 0.4 * k;
    const tiles: number[] = [];
    for (let i = 0; i < TILES; i++) {
      const line = horizontal ? colOf(i) : rowOf(i);
      const fromEdge = side % 2 === 0 ? line : lines - 1 - line;
      if (fromEdge >= depth) continue;
      tiles.push(i);
      // The wave rolls in from the edge: inner lines fall a little later.
      this.sim.crumble(i, warn + fromEdge * 0.16, 1.5);
    }
    this.events.push({ k: 'wave', tiles });
  }

  private nextCall(): void {
    this.callIndex++;
    this.callT = 0;
    const c = this.call;
    if (!c) {
      this.glow = new Set();
      return;
    }
    // Lay the stage out so exactly the targets answer the call.
    if (c.color) this.faces = colorLayout(this.faces, c.color, c.targets, this.rnd);
    else if (c.symbol) this.faces = symbolLayout(this.faces, c.symbol, c.targets, this.rnd);
    else if (c.sum) this.faces = numberLayout(this.faces, c.sum.answer, c.targets, this.rnd);
    this.faceVersion++;
    if (this.rule === 'gelap') {
      this.dark = true;
      this.callStage = 'show';
      this.glow = new Set(c.targets);
    } else {
      this.callStage = 'count';
      this.glow = new Set();
    }
    this.lastSecond = -1;
    this.events.push({ k: 'call', index: this.callIndex, call: c });
  }

  private ruleCalls(dt: number): void {
    const c = this.call;
    if (!c) return;
    this.callT += dt;
    switch (this.callStage) {
      case 'show':
        if (this.callT >= c.show) {
          this.callStage = 'count';
          this.callT = 0;
          this.glow = new Set();
        }
        break;
      case 'count':
        if (this.callT >= c.count) {
          this.callStage = 'drop';
          this.callT = 0;
          const keep = new Set(c.targets);
          const drop = Array.from({ length: TILES }, (_, i) => i).filter((i) => !keep.has(i));
          this.dropTiles(drop, 0.45, Infinity);
          this.glow = keep;
          if (this.rule === 'gelap') this.events.push({ k: 'reveal' });
          this.events.push({ k: 'drop', tiles: drop });
        }
        break;
      case 'drop':
        if (this.callT >= DROP_S) {
          this.callStage = 'rest';
          this.callT = 0;
          for (const s of this.sim.solids) this.sim.restore(s.id);
          this.glow = new Set();
          this.events.push({ k: 'restore' });
        }
        break;
      case 'rest':
        if (this.callT >= REST_S) this.nextCall();
        break;
    }
  }

  /* ------------------------------------------------------------------ physics events */

  private drainSim(): void {
    const t = this.sim.t;
    for (const e of this.sim.drainEvents()) {
      if (e.k === 'crack') this.events.push({ k: 'crack', tile: e.solid });
      else if (e.k === 'vanish') {
        this.events.push({ k: 'vanish', tile: e.solid });
        // Near miss: someone stepped off this tile a moment ago.
        for (const [id, s] of this.onTile) {
          const p = this.player(id);
          if (!p || p.out || s.last !== e.solid || s.tile === e.solid) continue;
          const gap = t - s.leftAt;
          if (gap >= 0 && gap < TIMING.nearMiss) {
            p.stats.nearMisses++;
            s.last = -1;
            this.events.push({ k: 'nearMiss', id, gap });
          }
        }
      } else if (e.k === 'fall') this.fall(e.id);
    }
  }

  private fall(id: number): void {
    const p = this.player(id);
    const b = this.sim.body(id);
    if (!p || !b || p.out || this.phase !== 'play') return;
    p.out = true;
    p.stats.falls++;
    b.active = false;
    this.fellAt.set(id, this.phaseT);
    const shove = this.shovedBy.get(id);
    const by = shove && this.sim.t - shove.t < TIMING.pushCredit ? shove.by : null;
    if (by !== null) {
      const pusher = this.player(by);
      if (pusher) pusher.stats.knockouts++;
    }
    this.events.push({ k: 'fall', id, at: { ...b.pos }, by });
  }

  /** Points a player has so far this round (fallen: kept; standing: survival points). */
  roundPoints(p: Contestant): number {
    const m = this.multiplier;
    if (!p.out) return SURVIVE_POINTS * m;
    const at = this.fellAt.get(p.id);
    if (at === undefined) return 0;
    const k = Math.max(0, Math.min(1, at / Math.max(1, this.roundLength)));
    return (10 + Math.round((30 * k) / 5) * 5) * m;
  }

  private endRound(): void {
    const points = new Map<number, number>();
    for (const p of this.players) {
      const late = p.out && !this.fellAt.has(p.id);
      const pts = late ? 0 : this.roundPoints(p);
      p.rounds.push(pts);
      p.total += pts;
      points.set(p.id, pts);
      if (!p.out) {
        p.stats.survived++;
        if (this.isFinal) p.stats.finalSurvivor = true;
      }
    }
    for (const p of this.players) this.sim.setMove(p.id, 0, 0);
    this.dark = false;
    this.glow = new Set();
    this.phase = 'end';
    this.phaseT = 0;
    this.events.push({ k: 'roundEnd', no: this.round, points });
  }

  /* ------------------------------------------------------------------ helpers for brains and views */

  /** Tiles a careful player would stand on right now. */
  safeTiles(): number[] {
    const c = this.call;
    if (c && (this.callStage === 'count' || this.callStage === 'show' || this.callStage === 'drop'))
      return c.targets;
    return this.sim.solids.filter((s) => s.state === 'solid').map((s) => s.id);
  }

  /** The tile a player stands on (-1 in the air). */
  tileOf(id: number): number {
    return this.onTile.get(id)?.tile ?? -1;
  }

  /** How long a player has stood on their tile (s). */
  stillFor(id: number): number {
    const s = this.onTile.get(id);
    return s ? this.sim.t - s.since : 0;
  }
}
