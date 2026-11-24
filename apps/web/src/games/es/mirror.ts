/**
 * Long-distance play: the display state the Host's main screen publishes for Seluncur Es and how
 * a far-away main screen turns it back into a moving floe. Pure (no DOM, no SDK, no Three.js):
 * `toMirror` reads the running match, `applyMirror` validates untrusted JSON, `MirrorTimeline`
 * buffers the states and interpolates skaters between them a little in the past (an adaptive
 * delay, see `playout.ts`), so the far-away screen moves smoothly although the states arrive about
 * 15 times a second. `aimSecondsNow` reads the aim countdown at server time (what the Host judges
 * locks by, not the delayed floe).
 *
 * The floe size (edge and the rim about to break) travels as state, so a far-away screen that
 * missed a state still breaks the rim and starts each round on the right floe.
 */
import { type Fruit, isFruit, type Look, parseLook } from '@hoorah/protocol';
import type { EndRow, FinalRow, IntroCard } from './hud';
import { type EsMatch, PHYS, type Phase, TIMING, type Vec } from './logic';
import { PlayoutClock, sinceStamp } from './playout';
import type { ShowEvent } from './show';

/**
 * Host: periodic state while skaters aim, slide or fall (ms), every 4th frame at 60 fps; events
 * publish at once. Not 50: the shell holds each publish 50 ms, so closer states would merge and
 * halve the rate.
 */
export const PUBLISH_MS = 60;
/** A skater that moved further than this between two states jumped (m): no blending. */
export const TELEPORT_M = 3;
/** Events kept in each state: at most this many, and none older than `EVENT_KEEP_S`. */
export const MAX_EVENTS = 12;
export const EVENT_KEEP_S = 3;
/** Mirror: states kept for interpolation. */
const BUFFER = 8;

const PHASES: readonly Phase[] = ['intro', 'aim', 'slide', 'settle', 'end', 'final', 'done'];
const MAX_SKATERS = 8;
const MAX_ROUNDS = 9;
/** Largest floe radius any lineup starts on (m), with room to spare. */
const MAX_EDGE = 20;

/** Skater flags (bit mask). */
export const FLAG = { inRound: 1, out: 2, locked: 4, live: 8, stunned: 16, offline: 32 } as const;
const ALL_FLAGS = 63;
/** A bump wobbles the avatar this long (s), as on the Host. */
const STUN_S = 0.55;

/** id, x, y, vx, vy, aim x, aim y (locked or live, see flags), falling s (-1 = not), score, flags. */
export type SkaterRow = [number, number, number, number, number, number, number, number, number, number];
/** End-of-round row: id, points, winner. */
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
  /** Game time it happened (s). */
  t: number;
  e: ShowEvent;
}

/** Compact wire shape (short keys: it crosses the network about 15 times a second). */
export interface EsMirror {
  v: 1;
  /** Server ms the Host made this state (`game.now()`). */
  at: number;
  /** Game time (s, pause-aware). */
  st: number;
  /** The Host's game clock is held (pause menu or hidden tab). */
  pz: boolean;
  /** Rounds in the session. */
  rn: number;
  /** Round index (0-based). */
  rd: number;
  sh: number;
  ph: Phase;
  pt: number;
  /** Floe radius now and after this shot's rim breaks (m). */
  ed: number;
  ne: number;
  pl: PlayerRow[];
  sk: SkaterRow[];
  ic: IntroCard | null;
  en: { t: string; r: EndWire[] } | null;
  fi: { c: number; r: FinalWire[] } | null;
  /** First-shot help line. */
  hp: boolean;
  ev: EventEntry[];
}

export interface MirrorSource {
  at: number;
  /** Game time (s). */
  t: number;
  paused: boolean;
  match: EsMatch;
  offline: (id: number) => boolean;
  intro: IntroCard | null;
  end: { title: string; rows: readonly EndRow[] } | null;
  final: { cols: number; rows: readonly FinalRow[] } | null;
  help: boolean;
  events: readonly EventEntry[];
}

/** The Host's side of the link (main.tsx fills it from the SDK). */
export interface MirrorLink {
  active(): boolean;
  now(): number;
  send(state: EsMirror): void;
}

const r2 = (v: number): number => Math.round(v * 100) / 100;
const r3 = (v: number): number => Math.round(v * 1000) / 1000;
const rv = (v: Vec): Vec => ({ x: r2(v.x), y: r2(v.y) });

function roundEvent(e: ShowEvent): ShowEvent {
  switch (e.k) {
    case 'hit':
      return { k: 'hit', at: rv(e.at), speed: r2(e.speed) };
    case 'fall':
      return { ...e, at: rv(e.at) };
    case 'nearMiss':
      return { ...e, gap: r3(e.gap) };
    default:
      return e;
  }
}

/** Host: the recent flourishes, numbered so a mirror replays each one once. */
export class EventLog {
  private seq = 0;
  private rows: EventEntry[] = [];

  push(e: ShowEvent, t: number): void {
    this.rows.push({ n: ++this.seq, t: r3(t), e: roundEvent(e) });
    if (this.rows.length > MAX_EVENTS) this.rows.shift();
  }

  /** Entries still worth sending at game time `t`. */
  recent(t: number): EventEntry[] {
    return this.rows.filter((r) => r.t >= t - EVENT_KEEP_S);
  }
}

function skaterRow(m: EsMatch, id: number, offline: boolean): SkaterRow | null {
  const p = m.player(id);
  if (!p) return null;
  const aim = p.aim ?? p.live;
  const flags =
    (p.inRound ? FLAG.inRound : 0) |
    (p.out ? FLAG.out : 0) |
    (p.aim ? FLAG.locked : p.live ? FLAG.live : 0) |
    (p.bumped < STUN_S ? FLAG.stunned : 0) |
    (offline ? FLAG.offline : 0);
  return [
    p.id,
    r2(p.pos.x),
    r2(p.pos.y),
    r2(p.vel.x),
    r2(p.vel.y),
    aim ? r3(aim.x) : 0,
    aim ? r3(aim.y) : 0,
    p.falling === null ? -1 : r3(p.falling),
    m.liveTotal(p),
    flags,
  ];
}

export function toMirror(src: MirrorSource): EsMirror {
  const m = src.match;
  const pl: PlayerRow[] = [];
  const sk: SkaterRow[] = [];
  for (const p of m.players.slice(0, MAX_SKATERS)) {
    pl.push({ id: p.id, n: p.name, f: p.fruit, l: p.look, c: p.color });
    const row = skaterRow(m, p.id, src.offline(p.id));
    if (row) sk.push(row);
  }
  return {
    v: 1,
    at: Math.round(src.at),
    st: r3(Math.max(0, src.t)),
    pz: src.paused,
    rn: m.roundCount,
    rd: m.round,
    sh: m.shot,
    ph: m.phase,
    pt: r3(m.phaseT),
    ed: r3(m.edge),
    ne: r3(m.nextEdge),
    pl,
    sk,
    ic: src.intro,
    en: src.end
      ? { t: src.end.title, r: src.end.rows.map((r): EndWire => [r.id, r.points, r.winner ? 1 : 0]) }
      : null,
    fi: src.final
      ? { c: src.final.cols, r: src.final.rows.map((r): FinalWire => [r.id, [...r.rounds], r.total, r.rank]) }
      : null,
    hp: src.help,
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
/** Skater ids: phones are positive, computer skaters negative. */
const isId = (v: unknown): v is number => isInt(v) && v !== 0 && Math.abs(v) < 1e9;
const isCoord = (v: unknown): v is number => isNum(v) && Math.abs(v) < 1000;
const isPoints = (v: unknown): v is number => isNat(v) && v < 10_000;
const isEdge = (v: unknown): v is number => isNum(v) && v > 0 && v <= MAX_EDGE;

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

function parseSkater(v: unknown): SkaterRow | null {
  if (!Array.isArray(v) || v.length !== 10) return null;
  const [id, x, y, vx, vy, ax, ay, fall, score, flags] = v as unknown[];
  if (!isId(id) || !isCoord(x) || !isCoord(y) || !isCoord(vx) || !isCoord(vy)) return null;
  if (!isNum(ax) || Math.abs(ax) > 2 || !isNum(ay) || Math.abs(ay) > 2) return null;
  if (!isNum(fall) || fall < -1 || fall > 10 || !isPoints(score)) return null;
  if (!isNat(flags) || flags > ALL_FLAGS) return null;
  return [id, x, y, vx, vy, ax, ay, fall, score, flags];
}

function parseIntro(v: unknown): IntroCard | null | undefined {
  if (v === null) return null;
  if (!isObj(v) || !isText(v.of, 80) || !isText(v.name, 80) || !isText(v.desc, 200)) return undefined;
  if (!isBool(v.double)) return undefined;
  return { of: v.of, name: v.name, desc: v.desc, double: v.double };
}

function parseEndRow(v: unknown): EndWire | null {
  if (!Array.isArray(v) || v.length !== 3) return null;
  const [id, points, winner] = v as unknown[];
  return isId(id) && isPoints(points) && isBit(winner) ? [id, points, winner] : null;
}

function parseEnd(v: unknown): EsMirror['en'] | undefined {
  if (v === null) return null;
  if (!isObj(v) || !isText(v.t, 160)) return undefined;
  const r = parseList(v.r, parseEndRow, MAX_SKATERS);
  return r ? { t: v.t, r } : undefined;
}

function parseFinalRow(v: unknown): FinalWire | null {
  if (!Array.isArray(v) || v.length !== 4) return null;
  const [id, rounds, total, rank] = v as unknown[];
  if (!isId(id) || !isPoints(total) || !isInt(rank) || rank < 1 || rank > MAX_SKATERS) return null;
  const per = parseList(rounds, (x) => (isPoints(x) ? x : null), MAX_ROUNDS);
  return per ? [id, per, total, rank] : null;
}

function parseFinal(v: unknown): EsMirror['fi'] | undefined {
  if (v === null) return null;
  if (!isObj(v) || !isInt(v.c) || v.c < 1 || v.c > MAX_ROUNDS) return undefined;
  const r = parseList(v.r, parseFinalRow, MAX_SKATERS);
  return r ? { c: v.c, r } : undefined;
}

function parseVec(v: unknown): Vec | null {
  return isObj(v) && isCoord(v.x) && isCoord(v.y) ? { x: v.x, y: v.y } : null;
}

function parseShow(v: unknown): ShowEvent | null {
  if (!isObj(v)) return null;
  switch (v.k) {
    case 'launch':
    case 'party':
      return { k: v.k };
    case 'hit': {
      const at = parseVec(v.at);
      return at && isNum(v.speed) && v.speed >= 0 && v.speed < 100 ? { k: 'hit', at, speed: v.speed } : null;
    }
    case 'fall': {
      const at = parseVec(v.at);
      if (!at || !isId(v.id) || !isBool(v.crack)) return null;
      if (v.by !== null && !isId(v.by)) return null;
      return { k: 'fall', id: v.id, by: v.by, crack: v.crack, at };
    }
    case 'nearMiss':
      return isId(v.id) && isNum(v.gap) && v.gap >= 0 && v.gap <= PHYS.nearGap
        ? { k: 'nearMiss', id: v.id, gap: v.gap }
        : null;
    case 'win':
      return isId(v.id) ? { k: 'win', id: v.id } : null;
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
export function applyMirror(json: unknown): EsMirror | null {
  if (!isObj(json) || json.v !== 1) return null;
  const j = json;
  if (!isNum(j.at) || !isNum(j.st) || j.st < 0 || !isBool(j.pz) || !isBool(j.hp)) return null;
  if (!isInt(j.rn) || j.rn < 1 || j.rn > MAX_ROUNDS || !isNat(j.rd) || j.rd >= j.rn) return null;
  if (!isNat(j.sh) || j.sh > PHYS.maxShots || !oneOf(PHASES, j.ph) || !isNum(j.pt) || j.pt < 0) return null;
  if (!isEdge(j.ed) || !isEdge(j.ne)) return null;
  const pl = parseList(j.pl, parsePlayer, MAX_SKATERS);
  const sk = parseList(j.sk, parseSkater, MAX_SKATERS);
  const ic = parseIntro(j.ic);
  const en = parseEnd(j.en);
  const fi = parseFinal(j.fi);
  const ev = parseList(j.ev, parseEvent, MAX_EVENTS);
  if (!pl || !sk || ic === undefined || en === undefined || fi === undefined || !ev) return null;
  return {
    v: 1,
    at: j.at,
    st: j.st,
    pz: j.pz,
    rn: j.rn,
    rd: j.rd,
    sh: j.sh,
    ph: j.ph,
    pt: j.pt,
    ed: j.ed,
    ne: j.ne,
    pl,
    sk,
    ic,
    en,
    fi,
    hp: j.hp,
    ev,
  };
}

/* ------------------------------------------------------------------ interpolation */

export interface PosedSkater {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Aim shown on the ice: locked (solid) or live (faded), per `flags`. */
  ax: number;
  ay: number;
  /** Seconds since it left the ice, null while it stands. */
  falling: number | null;
  score: number;
  flags: number;
}

export interface Posed {
  /** The state whose discrete facts (phase, floe, cards) are on screen. */
  s: EsMirror;
  simT: number;
  phaseT: number;
  skaters: PosedSkater[];
}

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const AIM_BITS = FLAG.locked | FLAG.live;

const jumped = (a: SkaterRow, b: SkaterRow): boolean => Math.hypot(b[1] - a[1], b[2] - a[2]) > TELEPORT_M;

function still(r: SkaterRow): PosedSkater {
  return {
    id: r[0],
    x: r[1],
    y: r[2],
    vx: r[3],
    vy: r[4],
    ax: r[5],
    ay: r[6],
    falling: r[7] < 0 ? null : r[7],
    score: r[8],
    flags: r[9],
  };
}

function blend(a: SkaterRow, b: SkaterRow, k: number): PosedSkater {
  const sameAim = (a[9] & AIM_BITS) !== 0 && (a[9] & AIM_BITS) === (b[9] & AIM_BITS);
  const fall = a[7] >= 0 && b[7] >= 0 ? lerp(a[7], b[7], k) : a[7];
  return {
    id: a[0],
    x: lerp(a[1], b[1], k),
    y: lerp(a[2], b[2], k),
    vx: lerp(a[3], b[3], k),
    vy: lerp(a[4], b[4], k),
    ax: sameAim ? lerp(a[5], b[5], k) : a[5],
    ay: sameAim ? lerp(a[6], b[6], k) : a[6],
    falling: fall < 0 ? null : fall,
    score: a[8],
    flags: a[9],
  };
}

/**
 * The floe at server time `at`, between state `a` (at or before) and `b` (after, or null when
 * `a` is the newest). Positions, speeds, aims and falls blend; a skater that jumped (placed on
 * the ring of a new round) snaps; phase time only blends inside one phase of one shot.
 */
export function pose(a: EsMirror, b: EsMirror | null, at: number): Posed {
  const span = b ? b.at - a.at : 0;
  const k = b && span > 0 ? Math.min(1, Math.max(0, (at - a.at) / span)) : 0;
  const simT = b ? lerp(a.st, b.st, k) : a.st;
  const same = b !== null && b.ph === a.ph && b.rd === a.rd && b.sh === a.sh;
  const phaseT = same && b ? lerp(a.pt, b.pt, k) : a.pt + Math.max(0, simT - a.st);
  const skaters = a.sk.map((ra): PosedSkater => {
    const next = b && b.rd === a.rd ? b.sk.find((r) => r[0] === ra[0]) : undefined;
    if (!next) return still(ra);
    if (jumped(ra, next)) return still(k < 0.5 ? ra : next);
    return blend(ra, next, k);
  });
  return { s: a, simT, phaseT, skaters };
}

/**
 * Mirror: the states received so far and the clock to draw them by: a `PlayoutClock` keeps the
 * draw time the shortest recent trip plus a buffer (following the state gap and jitter) behind
 * server time, eased so a route change never makes the floe jump.
 */
export class MirrorTimeline {
  private buf: EsMirror[] = [];
  private readonly clock = new PlayoutClock();

  /** Adds a state received at server time `now`; false if it is old or a repeat. */
  push(s: EsMirror, now: number): boolean {
    const last = this.buf[this.buf.length - 1];
    if (last && s.at <= last.at) return false;
    this.buf.push(s);
    if (this.buf.length > BUFFER) this.buf.shift();
    this.clock.observe(s.at, now);
    return true;
  }

  get latest(): EsMirror | null {
    return this.buf[this.buf.length - 1] ?? null;
  }

  /** Shortest recent delivery delay (ms), null before the first state. */
  get lagMs(): number | null {
    return this.clock.lagMs;
  }

  /** How far behind server time the floe was last drawn (ms), null before the first state. */
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
    return pose(buf[i]!, buf[i + 1] ?? null, at);
  }
}

/**
 * Whole seconds of aiming left at server time `now`, read from the newest state `s` of the shot
 * on screen (at least 1, as the Host shows it; 1 once the Host has moved on to the slide). Stands
 * still while the Host is paused.
 */
export function aimSecondsNow(s: EsMirror, now: number): number {
  if (s.ph !== 'aim') return 1;
  const phaseT = s.pt + (s.pz ? 0 : sinceStamp(s.at, now) / 1000);
  return Math.max(1, Math.ceil(TIMING.aim - phaseT - 1e-6));
}
