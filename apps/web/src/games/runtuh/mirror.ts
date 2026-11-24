/**
 * Long-distance play: the display state the Host's main screen publishes for Lantai Runtuh and how
 * a far-away main screen turns it back into a moving stage. Pure (no DOM, no SDK, no Three.js):
 * `toMirror` reads the running match, `applyMirror` validates untrusted JSON, `MirrorTimeline`
 * buffers the states and interpolates players between them a little in the past (an adaptive
 * delay, see `playout.ts`), so the far-away screen moves smoothly although the states arrive about
 * 15 times a second.
 *
 * Tiles: every state carries the full schedule of each tile that is not plain solid (state, when it
 * began, when it ends, how long it stays gone after the warning), grouped by equal timing. The
 * schedule is a pure function of sim time, so the far-away screen cracks, drops and raises every
 * tile at the exact sim time the Host did, and a lost state loses nothing: the next one carries the
 * same schedule. The tiles and the rule card's countdown are read at server time from the newest
 * state (`tilesNow`, `ruleNow`), not from the delayed stage, so a far-away player sees a tile crack
 * and drop, and the count run out, when the Host judges it.
 */
import { type Fruit, isFruit, type Look, parseLook } from '@hoorah/protocol';
import type { SolidState } from '../../shared/kotak/solids';
import { COLOR_IDS, SYMBOL_IDS, TILES, type TileFace } from './arena';
import type { EndRow, FinalRow, IntroCard, RuleCard, ScoreRow } from './hud';
import { type Phase, RULES, type Rule, type RuntuhMatch } from './logic';
import { PlayoutClock, sinceStamp } from './playout';
import type { ShowEvent } from './show';

/**
 * Host: periodic state while a round runs (ms), every 4th frame at 60 fps; events publish at once.
 * Not 50: the shell holds each publish 50 ms, so closer states would merge and halve the rate.
 */
export const PUBLISH_MS = 60;
/** A player who moved further than this between two states jumped (m): no blending. */
export const TELEPORT_M = 4;
/** Events kept in each state: at most this many, and none older than `EVENT_KEEP_S`. */
export const MAX_EVENTS = 12;
export const EVENT_KEEP_S = 3;
/** Solid tiles restored within this long (sim s) still travel, so the rise animation replays. */
export const RISEN_KEEP_S = 2.5;
/** Mirror: states kept for interpolation. */
const BUFFER = 8;

const PHASES: readonly Phase[] = ['intro', 'play', 'end', 'final', 'done'];
const MAX_PLAYERS = 8;
/** Longest rule countdown accepted from the network (s). */
const SECONDS_MAX = 600;

/** Player flags (bit mask). */
export const FLAG = { hidden: 1, stunned: 2, frozen: 4 } as const;
const ALL_FLAGS = 7;

/** Tile states on the wire. */
const TILE_CODES: readonly SolidState[] = ['solid', 'warn', 'gone'];

/** id, x, y, z, yaw, flags. */
export type RunnerRow = [number, number, number, number, number, number];
/** state code (0 solid, 1 warn, 2 gone), since, until (-1 = never), gone for after warn (-1 = until restored), tiles. */
export type TileGroup = [0 | 1 | 2, number, number, number, number[]];
/** Live scoreboard row: id, score, out, offline. */
export type ScoreWire = [number, number, 0 | 1, 0 | 1];
/** Round summary row: id, points, survived. */
export type EndWire = [number, number, 0 | 1];
/** Final table row: id, points per round, total, rank. */
export type FinalWire = [number, number[], number, number];

export interface PlayerRow {
  id: number;
  n: string;
  f: Fruit;
  l: Look;
  c: string;
}

export interface EventEntry {
  /** Sequence number (grows by one per event). */
  n: number;
  /** Sim time it happened. */
  t: number;
  e: ShowEvent;
}

/** Compact wire shape (short keys: it crosses the network about 15 times a second). */
export interface RuntuhMirror {
  v: 1;
  /** Server ms the Host made this state (`game.now()`). */
  at: number;
  /** Sim time of the match (s). */
  st: number;
  /** The Host's game clock is held (pause menu or hidden tab). */
  pz: boolean;
  /** Rule of every round, and the round on stage. */
  rl: Rule[];
  ro: number;
  ph: Phase;
  /** Gelap: lights down. */
  dk: boolean;
  /** Tiles glowing as safe. */
  gl: number[];
  /** Faces: three digits per tile (colour, symbol, number). */
  fc: string;
  tg: TileGroup[];
  pl: PlayerRow[];
  ru: RunnerRow[];
  /** HUD: round chip, survivors chip, rule card, scoreboard, intro, round summary, final table, help. */
  hr: string;
  ha: string;
  rc: RuleCard | null;
  /** Seconds left on the rule card's countdown when the state was made (unrounded, 0 = none). */
  sl: number;
  sc: ScoreWire[];
  ic: IntroCard | null;
  en: { t: string; s: string; r: EndWire[] } | null;
  fi: { c: number; r: FinalWire[] } | null;
  hp: boolean;
  ev: EventEntry[];
}

/** HUD contents as the Host shows them (read from its signals). */
export interface HudSnapshot {
  round: string;
  alive: string;
  rule: RuleCard | null;
  scores: readonly ScoreRow[];
  intro: IntroCard | null;
  end: { title: string; sub: string; rows: readonly EndRow[] } | null;
  final: { rows: readonly FinalRow[]; cols: number } | null;
  help: boolean;
}

export interface MirrorSource {
  at: number;
  paused: boolean;
  match: RuntuhMatch;
  hud: HudSnapshot;
  events: readonly EventEntry[];
}

/** The Host's side of the link (main.tsx fills it from the SDK). */
export interface MirrorLink {
  active(): boolean;
  now(): number;
  send(state: RuntuhMirror): void;
}

const r2 = (v: number): number => Math.round(v * 100) / 100;
const r3 = (v: number): number => Math.round(v * 1000) / 1000;
const finite = (v: number): number => (Number.isFinite(v) ? r3(v) : -1);
const bit = (on: boolean): 0 | 1 => (on ? 1 : 0);

function roundEvent(e: ShowEvent): ShowEvent {
  if (e.k === 'fall') return { ...e, at: { x: r2(e.at.x), y: r2(e.at.y), z: r2(e.at.z) } };
  if (e.k === 'near') return { ...e, gap: r3(e.gap) };
  return e;
}

/** Host: the recent flourishes, numbered so a mirror replays each one once. */
export class EventLog {
  private seq = 0;
  private rows: EventEntry[] = [];

  push(e: ShowEvent, t: number): void {
    this.rows.push({ n: ++this.seq, t: r3(t), e: roundEvent(e) });
    if (this.rows.length > MAX_EVENTS) this.rows.shift();
  }

  /** Entries still worth sending at sim time `t`. */
  recent(t: number): EventEntry[] {
    return this.rows.filter((r) => r.t >= t - EVENT_KEEP_S);
  }
}

/* ------------------------------------------------------------------ faces and tiles */

export function encodeFaces(faces: readonly TileFace[]): string {
  let out = '';
  for (const f of faces) out += `${COLOR_IDS.indexOf(f.color)}${SYMBOL_IDS.indexOf(f.symbol)}${f.number}`;
  return out;
}

const FACES_RE = new RegExp(`^(?:[0-${COLOR_IDS.length - 1}][0-${SYMBOL_IDS.length - 1}][1-9]){${TILES}}$`);

/** Faces from the wire, or null if malformed. */
export function decodeFaces(s: string): TileFace[] | null {
  if (!FACES_RE.test(s)) return null;
  const out: TileFace[] = [];
  for (let i = 0; i < TILES; i++) {
    out.push({
      color: COLOR_IDS[Number(s[i * 3])]!,
      symbol: SYMBOL_IDS[Number(s[i * 3 + 1])]!,
      number: Number(s[i * 3 + 2]),
    });
  }
  return out;
}

/** One tile's schedule (the fields of a kotak `Solid` that change). */
export interface TileNow {
  state: SolidState;
  /** Sim time the state began (0 = since the start). */
  since: number;
  /** Sim time it ends (Infinity = stays). */
  until: number;
  /** After `warn`: gone this long (Infinity = until restored). */
  goneFor: number;
}

const PLAIN: TileNow = { state: 'solid', since: 0, until: Infinity, goneFor: 0 };

interface TileSource {
  state: SolidState;
  since: number;
  until: number;
  goneFor: number;
}

/** Groups the tiles worth sending at sim time `t` by equal schedule. */
export function tileGroups(solids: readonly TileSource[], t: number): TileGroup[] {
  const groups = new Map<string, TileGroup>();
  solids.forEach((s, i) => {
    if (i >= TILES) return;
    if (s.state === 'solid' && (s.since <= 0 || t - s.since > RISEN_KEEP_S)) return;
    const code = TILE_CODES.indexOf(s.state) as 0 | 1 | 2;
    const since = r3(s.since);
    const until = s.state === 'solid' ? -1 : finite(s.until);
    const goneFor = s.state === 'warn' ? finite(s.goneFor) : -1;
    const key = `${code}|${since}|${until}|${goneFor}`;
    const g = groups.get(key);
    if (g) g[4].push(i);
    else groups.set(key, [code, since, until, goneFor, [i]]);
  });
  return [...groups.values()];
}

/** The schedule of every tile as listed in a state (plain solid when absent). */
export function tilesOf(groups: readonly TileGroup[]): TileNow[] {
  const out: TileNow[] = Array.from({ length: TILES }, () => PLAIN);
  for (const [code, since, until, goneFor, tiles] of groups) {
    const now: TileNow = {
      state: TILE_CODES[code]!,
      since,
      until: until < 0 ? Infinity : until,
      goneFor: goneFor < 0 ? Infinity : goneFor,
    };
    for (const i of tiles) out[i] = now;
  }
  return out;
}

/** A schedule carried forward to sim time `t`, as the kotak sim would (warn, gone, solid again). */
export function advanceTile(s: TileNow, t: number): TileNow {
  let cur = s;
  for (let i = 0; i < 3; i++) {
    if (cur.state === 'warn' && t >= cur.until) {
      cur = { state: 'gone', since: cur.until, until: cur.until + cur.goneFor, goneFor: cur.goneFor };
    } else if (cur.state === 'gone' && t >= cur.until) {
      cur = { state: 'solid', since: cur.until, until: Infinity, goneFor: 0 };
    } else break;
  }
  return cur;
}

/* ------------------------------------------------------------------ Host */

export function toMirror(src: MirrorSource): RuntuhMirror {
  const m = src.match;
  const pl: PlayerRow[] = [];
  const ru: RunnerRow[] = [];
  for (const p of m.players.slice(0, MAX_PLAYERS)) {
    pl.push({ id: p.id, n: p.name, f: p.fruit, l: p.look, c: p.color });
    const b = m.sim.body(p.id);
    if (!b) continue;
    const flags =
      (b.active ? 0 : FLAG.hidden) |
      (b.stunLeft > 0 ? FLAG.stunned : 0) |
      (b.frozenLeft > 0 ? FLAG.frozen : 0);
    ru.push([p.id, r2(b.pos.x), r2(b.pos.y), r2(b.pos.z), r2(b.yaw), flags]);
  }
  const h = src.hud;
  return {
    v: 1,
    at: Math.round(src.at),
    st: r3(m.sim.t),
    pz: src.paused,
    rl: [...m.rules],
    ro: m.round,
    ph: m.phase,
    dk: m.dark,
    gl: [...m.glow].filter((i) => i >= 0 && i < TILES),
    fc: encodeFaces(m.faces),
    tg: tileGroups(m.sim.solids, m.sim.t),
    pl,
    ru,
    hr: h.round,
    ha: h.alive,
    rc: h.rule ? { ...h.rule } : null,
    sl: m.phase === 'play' ? Math.max(0, r2(m.secondsLeft)) : 0,
    sc: h.scores.slice(0, MAX_PLAYERS).map((r) => [r.id, r.score, bit(r.out), bit(r.offline)]),
    ic: h.intro ? { ...h.intro } : null,
    en: h.end
      ? {
          t: h.end.title,
          s: h.end.sub,
          r: h.end.rows.slice(0, MAX_PLAYERS).map((r) => [r.id, r.points, bit(r.survived)]),
        }
      : null,
    fi: h.final
      ? {
          c: h.final.cols,
          r: h.final.rows.slice(0, MAX_PLAYERS).map((r) => [r.id, [...r.rounds], r.total, r.rank]),
        }
      : null,
    hp: h.help,
    ev: [...src.events],
  };
}

/* ------------------------------------------------------------------ validation */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isNat = (v: unknown): v is number => isInt(v) && v >= 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isBit = (v: unknown): v is 0 | 1 => v === 0 || v === 1;
const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v);
/** Player ids: phones are positive, computer contestants negative. */
const isId = (v: unknown): v is number => isInt(v) && v !== 0 && Math.abs(v) < 1e9;
const isCoord = (v: unknown): v is number => isNum(v) && Math.abs(v) < 1000;
const isTile = (v: unknown): v is number => isNat(v) && v < TILES;
/** Sim times: -1 stands for "never". */
const isTime = (v: unknown): v is number => isNum(v) && v >= -1;
const isPoints = (v: unknown): v is number => isInt(v) && Math.abs(v) < 1e6;

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

function parsePlayer(v: unknown): PlayerRow | null {
  if (!isObj(v) || !isId(v.id) || !isText(v.n, 40) || !isFruit(v.f) || !isText(v.c, 16)) return null;
  const l = parseLook(v.l);
  return l ? { id: v.id, n: v.n, f: v.f, l, c: v.c } : null;
}

function parseRunner(v: unknown): RunnerRow | null {
  if (!Array.isArray(v) || v.length !== 6) return null;
  const [id, x, y, z, yaw, flags] = v as unknown[];
  if (!isId(id) || !isCoord(x) || !isCoord(y) || !isCoord(z) || !isCoord(yaw)) return null;
  if (!isNat(flags) || flags > ALL_FLAGS) return null;
  return [id, x, y, z, yaw, flags];
}

function parseTileGroup(v: unknown): TileGroup | null {
  if (!Array.isArray(v) || v.length !== 5) return null;
  const [code, since, until, goneFor, tiles] = v as unknown[];
  if ((code !== 0 && code !== 1 && code !== 2) || !isNum(since) || since < 0) return null;
  if (!isTime(until) || !isTime(goneFor)) return null;
  const list = parseList(tiles, (x) => (isTile(x) ? x : null), TILES);
  return list && list.length > 0 ? [code, since, until, goneFor, list] : null;
}

function parseRule(v: unknown): RuleCard | null | undefined {
  if (v === null) return null;
  if (!isObj(v) || !isText(v.title, 120) || !isText(v.head, 80) || !isText(v.target, 120)) return undefined;
  if (!(v.tint === null || isText(v.tint, 16)) || !isBool(v.double)) return undefined;
  const seconds = v.seconds;
  if (!(seconds === null || (isNat(seconds) && seconds < 1000))) return undefined;
  return { title: v.title, head: v.head, target: v.target, tint: v.tint, seconds, double: v.double };
}

function parseIntro(v: unknown): IntroCard | null | undefined {
  if (v === null) return null;
  if (!isObj(v) || !isText(v.of, 80) || !isText(v.name, 80) || !isText(v.desc, 200) || !isBool(v.double))
    return undefined;
  return { of: v.of, name: v.name, desc: v.desc, double: v.double };
}

function parseScore(v: unknown): ScoreWire | null {
  if (!Array.isArray(v) || v.length !== 4) return null;
  const [id, score, out, off] = v as unknown[];
  return isId(id) && isPoints(score) && isBit(out) && isBit(off) ? [id, score, out, off] : null;
}

function parseEndRow(v: unknown): EndWire | null {
  if (!Array.isArray(v) || v.length !== 3) return null;
  const [id, points, survived] = v as unknown[];
  return isId(id) && isPoints(points) && isBit(survived) ? [id, points, survived] : null;
}

function parseEnd(v: unknown): RuntuhMirror['en'] | undefined {
  if (v === null) return null;
  if (!isObj(v) || !isText(v.t, 120) || !isText(v.s, 160)) return undefined;
  const r = parseList(v.r, parseEndRow, MAX_PLAYERS);
  return r ? { t: v.t, s: v.s, r } : undefined;
}

function parseFinalRow(v: unknown): FinalWire | null {
  if (!Array.isArray(v) || v.length !== 4) return null;
  const [id, rounds, total, rank] = v as unknown[];
  const list = parseList(rounds, (x) => (isPoints(x) ? x : null), RULES.length);
  if (!isId(id) || !list || !isPoints(total) || !isNat(rank) || rank > MAX_PLAYERS) return null;
  return [id, list, total, rank];
}

function parseFinal(v: unknown): RuntuhMirror['fi'] | undefined {
  if (v === null) return null;
  if (!isObj(v) || !isNat(v.c) || v.c < 1 || v.c > RULES.length) return undefined;
  const r = parseList(v.r, parseFinalRow, MAX_PLAYERS);
  return r ? { c: v.c, r } : undefined;
}

function parseShow(v: unknown): ShowEvent | null {
  if (!isObj(v)) return null;
  switch (v.k) {
    case 'go':
    case 'drop':
    case 'reveal':
    case 'win':
      return { k: v.k };
    case 'fall': {
      const at = v.at;
      if (!isObj(at) || !isCoord(at.x) || !isCoord(at.y) || !isCoord(at.z)) return null;
      if (!isId(v.id) || !(v.by === null || isId(v.by))) return null;
      if (!(v.next === null || (isNat(v.next) && v.next < RULES.length))) return null;
      return { k: 'fall', id: v.id, at: { x: at.x, y: at.y, z: at.z }, by: v.by, next: v.next };
    }
    case 'push':
      return isId(v.id) && (v.target === null || isId(v.target))
        ? { k: 'push', id: v.id, target: v.target }
        : null;
    case 'near':
      return isId(v.id) && isNum(v.gap) && v.gap >= 0 && v.gap < 10
        ? { k: 'near', id: v.id, gap: v.gap }
        : null;
    default:
      return null;
  }
}

function parseEvent(v: unknown): EventEntry | null {
  if (!isObj(v) || !isNat(v.n) || !isNum(v.t) || v.t < 0) return null;
  const e = parseShow(v.e);
  return e ? { n: v.n, t: v.t, e } : null;
}

/** Validates a published state from the network; null if anything is off. */
export function applyMirror(json: unknown): RuntuhMirror | null {
  if (!isObj(json) || json.v !== 1) return null;
  const j = json;
  if (!isNum(j.at) || !isNum(j.st) || j.st < 0 || !isBool(j.pz) || !isBool(j.dk) || !isBool(j.hp))
    return null;
  const rl = parseList(j.rl, (x) => (oneOf(RULES, x) ? x : null), RULES.length);
  if (!rl || rl.length === 0 || !isNat(j.ro) || j.ro >= rl.length || !oneOf(PHASES, j.ph)) return null;
  if (!isText(j.fc, TILES * 3) || !isText(j.hr, 60) || !isText(j.ha, 60)) return null;
  if (!decodeFaces(j.fc)) return null;
  if (!isNum(j.sl) || j.sl < 0 || j.sl > SECONDS_MAX) return null;
  const gl = parseList(j.gl, (x) => (isTile(x) ? x : null), TILES);
  const tg = parseList(j.tg, parseTileGroup, TILES);
  const pl = parseList(j.pl, parsePlayer, MAX_PLAYERS);
  const ru = parseList(j.ru, parseRunner, MAX_PLAYERS);
  const sc = parseList(j.sc, parseScore, MAX_PLAYERS);
  const ev = parseList(j.ev, parseEvent, MAX_EVENTS);
  const rc = parseRule(j.rc);
  const ic = parseIntro(j.ic);
  const en = parseEnd(j.en);
  const fi = parseFinal(j.fi);
  if (!gl || !tg || !pl || !ru || !sc || !ev || rc === undefined || ic === undefined) return null;
  if (en === undefined || fi === undefined) return null;
  return {
    v: 1,
    at: j.at,
    st: j.st,
    pz: j.pz,
    rl,
    ro: j.ro,
    ph: j.ph,
    dk: j.dk,
    gl,
    fc: j.fc,
    tg,
    pl,
    ru,
    hr: j.hr,
    ha: j.ha,
    rc,
    sl: j.sl,
    sc,
    ic,
    en,
    fi,
    hp: j.hp,
    ev,
  };
}

/* ------------------------------------------------------------------ interpolation */

export interface PosedRunner {
  id: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Velocity (m per sim second), for the run animation. */
  vx: number;
  vy: number;
  vz: number;
  flags: number;
}

export interface Posed {
  /** The state whose discrete facts (round, glow, HUD) are on screen. */
  s: RuntuhMirror;
  simT: number;
  runners: PosedRunner[];
  /** Every tile's schedule at `simT`. */
  tiles: TileNow[];
}

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
/** Times on the wire are rounded to the millisecond. */
const TIME_EPS = 5e-4;

function lerpAngle(a: number, b: number, k: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

function velocity(a: RunnerRow, b: RunnerRow, dt: number): [number, number, number] {
  if (dt <= 1e-3) return [0, 0, 0];
  return [(b[1] - a[1]) / dt, (b[2] - a[2]) / dt, (b[3] - a[3]) / dt];
}

const jumped = (a: RunnerRow, b: RunnerRow): boolean => Math.hypot(b[1] - a[1], b[3] - a[3]) > TELEPORT_M;

/**
 * Tiles at sim time `t`: a tile whose schedule in the next state `b` already began by `t` takes it
 * (a crack or restore shows at its exact sim time), otherwise state `a`'s schedule carried forward.
 */
function poseTiles(a: RuntuhMirror, b: RuntuhMirror | null, t: number): TileNow[] {
  const ta = tilesOf(a.tg);
  const tb = b ? tilesOf(b.tg) : null;
  return ta.map((sa, i) => {
    const sb = tb?.[i];
    const use = sb && sb !== PLAIN && sb.since <= t + TIME_EPS ? sb : sa;
    return advanceTile(use, t);
  });
}

/**
 * The stage at server time `at`, between state `a` (at or before) and `b` (after, or null when
 * `a` is the newest). `prev` is the state before `a`, for the running speed when there is no `b`.
 * Positions and facing blend; a player who jumped (to a start tile) snaps.
 */
export function pose(prev: RuntuhMirror | null, a: RuntuhMirror, b: RuntuhMirror | null, at: number): Posed {
  const span = b ? b.at - a.at : 0;
  const k = b && span > 0 ? Math.min(1, Math.max(0, (at - a.at) / span)) : 0;
  const simT = b ? lerp(a.st, b.st, k) : a.st;
  const runners = a.ru.map((ra): PosedRunner => {
    const next = b?.ru.find((r) => r[0] === ra[0]);
    const [id, , , , , flags] = ra;
    if (b && next) {
      if (jumped(ra, next)) {
        const at2 = k < 0.5 ? ra : next;
        return { id, x: at2[1], y: at2[2], z: at2[3], yaw: at2[4], vx: 0, vy: 0, vz: 0, flags: at2[5] };
      }
      const [vx, vy, vz] = velocity(ra, next, b.st - a.st);
      return {
        id,
        x: lerp(ra[1], next[1], k),
        y: lerp(ra[2], next[2], k),
        z: lerp(ra[3], next[3], k),
        yaw: lerpAngle(ra[4], next[4], k),
        vx,
        vy,
        vz,
        flags,
      };
    }
    const before = prev?.ru.find((r) => r[0] === id);
    const [vx, vy, vz] =
      prev && before && !jumped(before, ra) ? velocity(before, ra, a.st - prev.st) : [0, 0, 0];
    return { id, x: ra[1], y: ra[2], z: ra[3], yaw: ra[4], vx, vy, vz, flags };
  });
  return { s: a, simT, runners, tiles: poseTiles(a, b, simT) };
}

/**
 * Mirror: the states received so far and the clock to draw them by: a `PlayoutClock` keeps the
 * draw time the shortest recent trip plus a buffer (following the state gap and jitter) behind
 * server time, eased so a route change never makes the stage jump.
 */
export class MirrorTimeline {
  private buf: RuntuhMirror[] = [];
  private readonly clock = new PlayoutClock();

  /** Adds a state received at server time `now`; false if it is old or a repeat. */
  push(s: RuntuhMirror, now: number): boolean {
    const last = this.buf[this.buf.length - 1];
    if (last && s.at <= last.at) return false;
    this.buf.push(s);
    if (this.buf.length > BUFFER) this.buf.shift();
    this.clock.observe(s.at, now);
    return true;
  }

  get latest(): RuntuhMirror | null {
    return this.buf[this.buf.length - 1] ?? null;
  }

  /** Shortest recent delivery delay (ms), null before the first state. */
  get lagMs(): number | null {
    return this.clock.lagMs;
  }

  /** How far behind server time the stage was last drawn (ms), null before the first state. */
  get behindMs(): number | null {
    return this.clock.behindMs;
  }

  /** Server time the screen should show at local server time `now`. */
  drawAt(now: number): number {
    return this.clock.drawAt(now);
  }

  sample(now: number): Posed | null {
    const buf = this.buf;
    if (buf.length === 0) return null;
    const at = this.drawAt(now);
    let i = 0;
    for (let j = buf.length - 1; j >= 0; j--) {
      if (buf[j]!.at <= at) {
        i = j;
        break;
      }
    }
    return pose(buf[i - 1] ?? null, buf[i]!, buf[i + 1] ?? null, at);
  }
}

/* ------------------------------------------------------------------ server time */

/** The Host's sim time at server time `now`, read ahead from the newest state (still while paused). */
export function simNow(s: RuntuhMirror, now: number): number {
  return s.st + (s.pz ? 0 : sinceStamp(s.at, now) / 1000);
}

/** Every tile as the Host has it at sim time `t`: the newest state's schedules carried forward. */
export function tilesNow(s: RuntuhMirror, t: number): TileNow[] {
  return poseTiles(s, null, t);
}

/** The rule card with its countdown at server time `now`, read from the newest state. */
export function ruleNow(s: RuntuhMirror, now: number): RuleCard | null {
  const rc = s.rc;
  if (!rc || rc.seconds === null) return rc;
  const rest = s.sl - (s.pz ? 0 : sinceStamp(s.at, now) / 1000);
  return { ...rc, seconds: rest > 0 ? Math.ceil(rest - 1e-6) : null };
}
