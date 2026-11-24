/**
 * Long-distance play: the display state the Host's main screen publishes about 15 times a second
 * during a run, and what a far-away main screen does with it. Pure (no DOM, no SDK).
 *
 * Traffic is never streamed. Every lane is a closed-form function of the ronde's world (map, seed,
 * finish row) and the match time, so a packet carries the world once per ronde plus an anchor:
 * the Host's match time `mt` at server time `t`. `matchTimeAt` turns server time back into match
 * time (standing still while the Host is paused), and the far-away screen computes every angkot,
 * log and train at that time, exactly where the Host has it at the same server moment.
 *
 * What is streamed: the camera (with the level, `camAt` extrapolates it at the base speed), and
 * each runner in board order: position, the hop in flight (start in match time), riding, death,
 * and running counters (hops, deaths and near misses this match, place this ronde) so a packet
 * that is skipped or merged loses nothing: `MarkReader` turns counter differences into effects.
 * `restPose` replays the deterministic part of a runner (landing on a log, drifting with it).
 */
import { type Look, parseLook } from '@hoorah/protocol';
import type { BoardRow, HudState, Overlay, ScoreRow } from './hud';
import { COLS, type Lane, MAPS, type MapId, platformAt, World } from './lanes';
import type { DeathKind, Dir, MapPick, Mode, NyebrangMatch, Phase, Runner, SetupStep } from './logic';
import { TUNING } from './logic';
import { CLOCK_AHEAD_MAX_MS, sinceStamp } from './playout';
import { formatClock } from './strings';

/** Publish interval while runners move (every 4th frame at 60 fps; the shell holds each 50 ms). */
export const MIRROR_LIVE_MS = 60;
/** Publish interval otherwise (setup, intro, results). */
export const MIRROR_IDLE_MS = 250;

const PHASES: readonly Phase[] = ['setup', 'intro', 'count', 'run', 'roundEnd', 'final', 'ended'];
const MODES: readonly Mode[] = ['balapan', 'bertahan'];
const STEPS: readonly SetupStep[] = ['mode', 'map'];
const PICKS: readonly MapPick[] = [...MAPS, 'acak'];
/** Codes on the wire: index = code. */
export const DIRS: readonly Dir[] = ['up', 'down', 'left', 'right'];
export const STATES: readonly Runner['state'][] = ['run', 'dead', 'out', 'done'];
export const DEATHS: readonly DeathKind[] = ['hit', 'train', 'water', 'drift', 'edge'];

const MAX_RUNNERS = 24;
const MAX_ROUNDS = 5;
const NAME_MAX = 40;
const TEXT_MAX = 200;
/** Generous bounds for numbers from the network. */
const MAX_ROW = 100_000;
const MAX_T = 1_000_000;
const MAX_X = 100;
const MAX_COUNT = 1_000_000;
const COLOR = /^#[0-9a-fA-F]{3,8}$/;

/* ------------------------------------------------------------------ wire shape */

/** Hop in flight: from x, from row, to x, to row, start (match s), direction code. */
export type HopWire = [number, number, number, number, number, number];

/**
 * Runner, in board order: id, name, look, color, dim (phone dropped, 0/1), state code, x, row,
 * hop, riding (0/1), death code (-1 none), dead at (match s), death x, death row, best row, place,
 * deaths this ronde, then match counters: hops, deaths, near misses.
 */
export type RunnerWire = [
  number,
  string,
  Look,
  string,
  number,
  number,
  number,
  number,
  HopWire | null,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/** Ronde result row: id, distance, near misses, points this ronde, total, rank. */
export type ScoreWire = [number, number, number, number, number, number];

/** Overlay on the wire, a tagged tuple per `Overlay` kind (the countdown is read at server time). */
export type OverlayWire =
  | ['n']
  | ['s', SetupStep, Mode, MapPick, string]
  | ['i', MapId, Mode, number, number, number]
  | ['c', number]
  | ['g']
  | ['b', string, number]
  | ['e', number, ScoreWire[], string, string | null]
  | ['f', ScoreWire[]];

/** Compact wire shape (short keys: it crosses the network up to 20 times a second). */
export interface NyebrangMirror {
  v: 1;
  /** Server ms the state was made, and the Host's match time (s) right then. */
  t: number;
  mt: number;
  /** The Host's screen is paused (1): match time stands still. */
  hold: number;
  ph: Phase;
  mo: Mode;
  /** Ronde index (-1 during setup) and rondes in the match. */
  r: number;
  n: number;
  /** World of the ronde: map, seed, Balapan finish row (null: endless). */
  w: [MapId, number, number | null];
  /** Camera bottom row, level, seconds of the run, seconds left of the current non-run phase. */
  cam: number;
  lv: number;
  rt: number;
  pl: number;
  ov: OverlayWire;
  rs: RunnerWire[];
  /** Horns blown so far by players who are out, and the road row of the last one. */
  hn: [number, number];
}

/** Everything the Host knows that the far-away screen draws. */
export interface MirrorSource {
  /** Server time (game.now()). */
  server: number;
  match: NyebrangMatch;
  /** The overlay the Host's HUD shows now. */
  overlay: Overlay;
  held: boolean;
  /** Avatar and ring colour of a runner. */
  look: (id: number) => { look: Look; color: string };
  horns: number;
  hornRow: number;
}

const r3 = (v: number): number => Math.round(v * 1000) / 1000;
const bit = (b: boolean): number => (b ? 1 : 0);

function scoreWire(rows: readonly ScoreRow[]): ScoreWire[] {
  return rows.map((s) => [s.id, s.dist, s.near, s.gained, s.total, s.rank]);
}

function overlayWire(o: Overlay): OverlayWire {
  switch (o.kind) {
    case 'none':
      return ['n'];
    case 'setup':
      return ['s', o.step, o.mode, o.map, o.host];
    case 'intro':
      return ['i', o.map, o.mode, o.round, o.rounds, bit(o.final)];
    case 'count':
      return ['c', o.value];
    case 'go':
      return ['g'];
    case 'banner':
      return ['b', o.text, o.tone === 'red' ? 1 : 0];
    case 'roundEnd':
      return ['e', o.round, scoreWire(o.rows), o.next, o.record];
    case 'final':
      return ['f', scoreWire(o.rows)];
  }
}

function runnerWire(r: Runner, src: MirrorSource): RunnerWire {
  const h = r.hop;
  const look = src.look(r.id);
  return [
    r.id,
    r.name,
    look.look,
    look.color,
    bit(r.takeover),
    STATES.indexOf(r.state),
    r3(r.x),
    r.row,
    h ? [r3(h.fx), h.fr, r3(h.tx), h.tr, r3(h.t0), DIRS.indexOf(h.dir)] : null,
    bit(r.riding),
    r.death ? DEATHS.indexOf(r.death) : -1,
    r3(r.deadAt),
    r3(r.deathX),
    r3(r.deathRow),
    r.best,
    r.place,
    r.deaths,
    r.total.hops,
    r.total.deaths,
    r.total.near,
  ];
}

export function toMirror(src: MirrorSource): NyebrangMirror {
  const m = src.match;
  return {
    v: 1,
    t: Math.round(src.server),
    mt: r3(m.t),
    hold: bit(src.held),
    ph: m.phase,
    mo: m.mode,
    r: m.round,
    n: m.rounds,
    w: [m.map, m.worldSeed, m.world.finish],
    cam: r3(m.cam),
    lv: m.level,
    rt: r3(m.runT),
    pl: r3(m.phaseLeft),
    ov: overlayWire(src.overlay),
    rs: m.ranking().map((r) => runnerWire(r, src)),
    hn: [src.horns, src.hornRow],
  };
}

/* ------------------------------------------------------------------ validation */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isNat = (v: unknown, max = MAX_COUNT): v is number => isInt(v) && v >= 0 && v <= max;
const isNum = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const isBit = (v: unknown): v is number => v === 0 || v === 1;
const isCode = (v: unknown, n: number): v is number => isInt(v) && v >= 0 && v < n;
const isText = (v: unknown, max = TEXT_MAX): v is string => typeof v === 'string' && v.length <= max;
const isColor = (v: unknown): v is string => typeof v === 'string' && COLOR.test(v);
const oneOf = <T extends string>(v: unknown, list: readonly T[]): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v);

function parseList<T>(v: unknown, item: (x: unknown) => T | null, max: number): T[] | null {
  if (!Array.isArray(v) || v.length > max) return null;
  const out: T[] = [];
  for (const x of v) {
    const parsed = item(x);
    if (parsed === null) return null;
    out.push(parsed);
  }
  return out;
}

const tuple = (v: unknown, n: number): unknown[] | null => (Array.isArray(v) && v.length === n ? v : null);

function parseHop(v: unknown): HopWire | null {
  const a = tuple(v, 6);
  if (!a) return null;
  const [fx, fr, tx, tr, t0, dir] = a;
  if (!isNum(fx, -MAX_X, MAX_X) || !isNat(fr, MAX_ROW) || !isNum(tx, -MAX_X, MAX_X) || !isNat(tr, MAX_ROW))
    return null;
  if (!isNum(t0, 0, MAX_T) || !isCode(dir, DIRS.length)) return null;
  return [fx, fr, tx, tr, t0, dir];
}

function parseRunner(v: unknown): RunnerWire | null {
  const a = tuple(v, 20);
  if (!a) return null;
  const [id, name, rawLook, color, dim, st, x, row, rawHop, riding, death, deadAt, dx, dr, ...rest] = a;
  if (!isInt(id) || !isText(name, NAME_MAX) || !isColor(color) || !isBit(dim) || !isCode(st, STATES.length))
    return null;
  if (!isNum(x, -MAX_X, MAX_X) || !isNat(row, MAX_ROW) || !isBit(riding)) return null;
  if (!isInt(death) || death < -1 || death >= DEATHS.length || !isNum(deadAt, 0, MAX_T)) return null;
  if (!isNum(dx, -MAX_X, MAX_X) || !isNum(dr, -1, MAX_ROW)) return null;
  const [best, place, deaths, hops, total, near] = rest;
  if (!isNat(best, MAX_ROW) || !isNat(place, MAX_RUNNERS) || !isNat(deaths) || !isNat(hops)) return null;
  if (!isNat(total) || !isNat(near)) return null;
  const hop = rawHop === null ? null : parseHop(rawHop);
  if (rawHop !== null && !hop) return null;
  const look = parseLook(rawLook);
  if (!look) return null;
  return [
    id,
    name,
    look,
    color,
    dim,
    st,
    x,
    row,
    hop,
    riding,
    death,
    deadAt,
    dx,
    dr,
    best,
    place,
    deaths,
    hops,
    total,
    near,
  ];
}

function parseScore(v: unknown): ScoreWire | null {
  const a = tuple(v, 6);
  if (!a) return null;
  const [id, dist, near, gained, total, rank] = a;
  if (!isInt(id) || !isNat(dist) || !isNat(near) || !isNat(gained) || !isNat(total) || !isNat(rank, 64))
    return null;
  return [id, dist, near, gained, total, rank];
}

function parseOverlay(v: unknown): OverlayWire | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const a: unknown[] = v;
  switch (a[0]) {
    case 'n':
      return a.length === 1 ? ['n'] : null;
    case 'g':
      return a.length === 1 ? ['g'] : null;
    case 's':
      return a.length === 5 && oneOf(a[1], STEPS) && oneOf(a[2], MODES) && oneOf(a[3], PICKS) && isText(a[4])
        ? ['s', a[1], a[2], a[3], a[4]]
        : null;
    case 'i':
      return a.length === 6 &&
        oneOf(a[1], MAPS) &&
        oneOf(a[2], MODES) &&
        isNat(a[3], MAX_ROUNDS) &&
        isNat(a[4], MAX_ROUNDS) &&
        isBit(a[5])
        ? ['i', a[1], a[2], a[3], a[4], a[5]]
        : null;
    case 'c':
      return a.length === 2 && isNat(a[1], 9) ? ['c', a[1]] : null;
    case 'b':
      return a.length === 3 && isText(a[1]) && isBit(a[2]) ? ['b', a[1], a[2]] : null;
    case 'e': {
      if (a.length !== 5 || !isNat(a[1], MAX_ROUNDS) || !isText(a[3])) return null;
      if (a[4] !== null && !isText(a[4])) return null;
      const rows = parseList(a[2], parseScore, MAX_RUNNERS);
      return rows ? ['e', a[1], rows, a[3], a[4]] : null;
    }
    case 'f': {
      const rows = a.length === 2 ? parseList(a[1], parseScore, MAX_RUNNERS) : null;
      return rows ? ['f', rows] : null;
    }
    default:
      return null;
  }
}

function parseWorld(v: unknown): NyebrangMirror['w'] | null {
  const a = tuple(v, 3);
  if (!a) return null;
  const [map, seed, finish] = a;
  if (!oneOf(map, MAPS) || !isNat(seed, 0xffffffff)) return null;
  if (finish !== null && (!isNat(finish, MAX_ROW) || finish < 1)) return null;
  return [map, seed, finish];
}

/** Validates a published state from the network; null if anything is off. */
export function applyMirror(raw: unknown): NyebrangMirror | null {
  if (!isObj(raw) || raw.v !== 1) return null;
  const j = raw;
  if (!isNum(j.t, 0, Number.MAX_SAFE_INTEGER) || !isNum(j.mt, 0, MAX_T) || !isBit(j.hold)) return null;
  if (!oneOf(j.ph, PHASES) || !oneOf(j.mo, MODES)) return null;
  if (!isInt(j.r) || j.r < -1 || j.r >= MAX_ROUNDS || !isInt(j.n) || j.n < 1 || j.n > MAX_ROUNDS) return null;
  if (!isNum(j.cam, -MAX_ROW, MAX_ROW) || !isNat(j.lv, 10_000) || j.lv < 1) return null;
  if (!isNum(j.rt, 0, MAX_T) || !isNum(j.pl, 0, 60)) return null;
  const hn = tuple(j.hn, 2);
  if (!hn || !isNat(hn[0]) || !isInt(hn[1]) || hn[1] < -1 || hn[1] > MAX_ROW) return null;
  const w = parseWorld(j.w);
  const ov = parseOverlay(j.ov);
  const rs = parseList(j.rs, parseRunner, MAX_RUNNERS);
  if (!w || !ov || !rs) return null;
  return {
    v: 1,
    t: j.t,
    mt: j.mt,
    hold: j.hold,
    ph: j.ph,
    mo: j.mo,
    r: j.r,
    n: j.n,
    w,
    cam: j.cam,
    lv: j.lv,
    rt: j.rt,
    pl: j.pl,
    ov,
    rs,
    hn: [hn[0], hn[1]],
  };
}

/* ------------------------------------------------------------------ rebuilding */

/** The Host's match time at server time `now`, read from packet `s` (stands still while held). */
export function matchTimeAt(s: NyebrangMirror, now: number): number {
  return s.mt + (s.hold ? 0 : sinceStamp(s.t, now) / 1000);
}

/** Anchor changes up to this (s) are eased; larger ones (a Host hitch or restart) are taken at once. */
const OFFSET_SNAP_S = 0.15;
/** Share of an anchor change taken per packet. */
const OFFSET_GAIN = 0.2;

/**
 * The match time this screen draws, eased: each packet's anchor carries a few ms of frame jitter
 * (a train crosses a cell in 30 ms), so the offset between match and server time follows the
 * packets smoothly instead of jumping with each one. Exact while the Host is paused; never reads
 * further past the newest packet than `matchTimeAt` (a dead link stops the traffic).
 */
export class MatchClock {
  /** Match seconds minus server seconds. */
  private offset: number | null = null;
  private last: NyebrangMirror | null = null;

  push(s: NyebrangMirror): void {
    const target = s.mt - s.t / 1000;
    const prev = this.last;
    this.last = s;
    const jump = this.offset === null || Math.abs(target - this.offset) > OFFSET_SNAP_S;
    if (s.hold || jump || !prev || prev.hold || worldKey(prev) !== worldKey(s)) this.offset = target;
    else this.offset = (this.offset ?? target) + (target - (this.offset ?? target)) * OFFSET_GAIN;
  }

  /** Match time to draw at server ms `now` (0 before any packet). */
  at(now: number): number {
    const s = this.last;
    if (!s || this.offset === null) return 0;
    if (s.hold) return s.mt;
    const t = now / 1000 + this.offset;
    return Math.max(s.mt - OFFSET_SNAP_S, Math.min(s.mt + CLOCK_AHEAD_MAX_MS / 1000, t));
  }
}

/** Identity of the packet's world: a new one means a new ronde (or the setup world). */
export const worldKey = (s: NyebrangMirror): string => `${s.w[0]}|${s.w[1]}|${s.w[2] ?? '-'}`;

export function worldOf(s: NyebrangMirror): World {
  return new World(s.w[0], s.w[1], s.w[2]);
}

/**
 * The Host's camera at match time `mt`: still before the run's grace ends, then at the level's
 * base speed (the catch-up toward a runaway leader shows up with the next packet), never past the
 * finish stop.
 */
export function camAt(s: NyebrangMirror, mt: number): number {
  if (s.ph !== 'run' || s.hold) return s.cam;
  let dt = mt - s.mt;
  if (dt <= 0) return s.cam;
  if (s.rt < TUNING.graceS) {
    const wait = TUNING.graceS - s.rt;
    if (dt <= wait) return s.cam;
    dt -= wait;
  }
  const speed = TUNING.camBase[s.mo] + TUNING.camStep[s.mo] * (s.lv - 1);
  const stop = s.w[2] !== null ? s.w[2] - TUNING.lead - 1 : Number.POSITIVE_INFINITY;
  return Math.max(s.cam, Math.min(stop, s.cam + speed * dt));
}

/** Where a riding runner may drift on this screen before the Host's verdict arrives. */
const DRIFT_MIN = -0.6;
const DRIFT_MAX = COLS - 0.4;

function riddenX(lane: Lane, x: number, dt: number): number {
  return Math.max(DRIFT_MIN, Math.min(DRIFT_MAX, x + lane.speed * dt));
}

/**
 * Where a runner of packet `s` stands at match time `mt`, without the hop arc: the end of a hop
 * in flight (snapped onto the log it lands on, then drifting with it, as the Host does), a
 * riding runner carried along, or simply its cell.
 */
export function restPose(world: World, w: RunnerWire, sMt: number, mt: number): { x: number; row: number } {
  const hop = w[8];
  if (hop) {
    const [, , tx, tr, t0] = hop;
    const land = t0 + TUNING.hop;
    const lane = world.lane(tr);
    if (lane.kind === 'river') {
      const plat = platformAt(lane, land, tx);
      if (plat) {
        const slot = Math.max(0, Math.min(plat.len - 1, Math.round(tx - plat.left - 0.5)));
        return { x: riddenX(lane, plat.left + slot + 0.5, Math.max(0, mt - land)), row: tr };
      }
    }
    return { x: tx, row: tr };
  }
  if (w[9]) return { x: riddenX(world.lane(w[7]), w[6], Math.max(0, mt - sMt)), row: w[7] };
  return { x: w[6], row: w[7] };
}

/** Seconds left of the run at server time `now`. */
function timeLeft(s: NyebrangMirror, since: number): number {
  const cap = s.mo === 'balapan' ? TUNING.raceS : TUNING.surviveS;
  return s.ph === 'run' ? Math.max(0, cap - (s.rt + since)) : cap;
}

function scoreRows(rows: readonly ScoreWire[], s: NyebrangMirror): ScoreRow[] {
  const out: ScoreRow[] = [];
  for (const [id, dist, near, gained, total, rank] of rows) {
    const w = s.rs.find((x) => x[0] === id);
    if (!w) continue;
    out.push({ id, name: w[1], look: w[2], color: w[3], dist, near, gained, total, rank });
  }
  return out;
}

/** The overlay the Host shows at server time `now`; the countdown runs on server time. */
export function mirrorOverlay(s: NyebrangMirror, now: number): Overlay {
  const o = s.ov;
  const since = s.hold ? 0 : sinceStamp(s.t, now) / 1000;
  switch (o[0]) {
    case 'n':
      return { kind: 'none' };
    case 'g':
      return { kind: 'go' };
    case 's':
      return { kind: 'setup', step: o[1], mode: o[2], map: o[3], host: o[4] };
    case 'i':
      return { kind: 'intro', map: o[1], mode: o[2], round: o[3], rounds: o[4], final: o[5] === 1 };
    case 'c': {
      if (s.ph !== 'count') return { kind: 'count', value: o[1] };
      const left = s.pl - since;
      return left > 0 ? { kind: 'count', value: Math.max(1, Math.ceil(left)) } : { kind: 'go' };
    }
    case 'b':
      return { kind: 'banner', text: o[1], tone: o[2] === 1 ? 'red' : 'yellow' };
    case 'e':
      return { kind: 'roundEnd', round: o[1], rows: scoreRows(o[2], s), next: o[3], record: o[4] };
    case 'f':
      return { kind: 'final', rows: scoreRows(o[1], s) };
  }
}

/**
 * The HUD as the Host shows it, with the clock, countdown and comeback seconds read at server
 * time `now` (match time `mt`). `danger` comes from this screen's stage.
 */
export function mirrorHud(s: NyebrangMirror, now: number, mt: number, danger: boolean): HudState {
  const since = s.hold ? 0 : sinceStamp(s.t, now) / 1000;
  const left = timeLeft(s, since);
  const rows: BoardRow[] = s.rs.map((w) => ({
    id: w[0],
    name: w[1],
    look: w[2],
    color: w[3],
    dist: Math.max(0, w[14] - 1),
    state: STATES[w[5]] ?? 'run',
    back: Math.max(1, Math.ceil(TUNING.respawnS - (mt - w[11]))),
    place: w[15],
  }));
  return {
    show: s.ph === 'run' || s.ph === 'count' || s.ph === 'intro',
    mode: s.mo,
    map: s.w[0],
    round: s.r + 1,
    rounds: s.n,
    final: s.r === s.n - 1,
    clock: formatClock(left),
    urgent: s.ph === 'run' && left <= 10,
    level: s.lv,
    rows,
    overlay: mirrorOverlay(s, now),
    hint: s.ph === 'run' && s.rt + since < 6,
    danger,
  };
}

/* ------------------------------------------------------------------ replaying effects */

export type MirrorAction =
  | { type: 'hop'; id: number; dir: Dir | null }
  | { type: 'death'; id: number; kind: DeathKind; x: number; row: number }
  | { type: 'respawn'; id: number }
  | { type: 'near'; id: number }
  | { type: 'finish'; id: number; place: number }
  | { type: 'horn'; row: number };

interface Seen {
  hops: number;
  deaths: number;
  near: number;
  place: number;
  state: number;
}

/**
 * Compares each packet's counters with the previous one and returns what the stage should play.
 * A runner seen for the first time, a new ronde, or counters that went back (the Host restarted)
 * only set a baseline.
 */
export class MarkReader {
  private readonly seen = new Map<number, Seen>();
  private round = Number.NaN;
  private horns: number | null = null;

  read(s: NyebrangMirror): MirrorAction[] {
    const out: MirrorAction[] = [];
    if (s.r !== this.round) {
      this.round = s.r;
      this.seen.clear();
    }
    for (const w of s.rs) {
      const id = w[0];
      const now: Seen = { hops: w[17], deaths: w[18], near: w[19], place: w[15], state: w[5] };
      const was = this.seen.get(id);
      this.seen.set(id, now);
      if (!was || now.hops < was.hops || now.deaths < was.deaths || now.near < was.near) continue;
      if (now.hops > was.hops) {
        const hop = w[8];
        out.push({ type: 'hop', id, dir: hop ? (DIRS[hop[5]] ?? null) : null });
      }
      if (now.deaths > was.deaths)
        out.push({ type: 'death', id, kind: DEATHS[w[10]] ?? 'hit', x: w[12], row: w[13] });
      else if (was.state === 1 && now.state === 0) out.push({ type: 'respawn', id });
      if (now.near > was.near) out.push({ type: 'near', id });
      if (now.place > 0 && was.place === 0) out.push({ type: 'finish', id, place: now.place });
    }
    const horns = this.horns;
    this.horns = s.hn[0];
    if (horns !== null && s.hn[0] > horns && s.hn[1] >= 0) out.push({ type: 'horn', row: s.hn[1] });
    return out;
  }
}
