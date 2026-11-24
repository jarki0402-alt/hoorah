/**
 * Long-distance play: the display state the Host's main screen publishes for Satu Tali and how a
 * far-away main screen turns it back into a moving climb. Pure (no DOM, no SDK, no Three.js):
 * `toMirror` reads the running match, `applyMirror` validates untrusted JSON, `MirrorTimeline`
 * buffers the states and interpolates the team between them a little in the past (an adaptive
 * delay, see `playout.ts`), so the far-away screen moves smoothly although the states arrive about
 * 15 times a second.
 *
 * The course itself never crosses the network: route, seed and section number rebuild the same
 * blocks, and moving blocks are a pure function of the section's sim time. Per state only the
 * bodies (team and sandbag), each rope link's slack length and stretch, the clocks and the HUD
 * cards travel. The far-away screen bends the rope over ledges and frames the camera itself.
 */
import { type Fruit, isFruit, type Look, parseLook } from '@hoorah/protocol';
import { isRouteId, type RouteId } from './course';
import type { FlagCard, IntroCard, PickCard } from './hud';
import { type Phase, SACK_ID, type TaliMatch, TIMING } from './logic';
import { PlayoutClock, sinceStamp } from './playout';
import type { ShowEvent } from './show';

/**
 * Host: periodic state while climbing (ms), every 4th frame at 60 fps; events publish at once.
 * Not 50: the shell holds each publish 50 ms, so closer states would merge and halve the rate.
 */
export const PUBLISH_MS = 60;
/** A body that moved further than this between two states jumped (m): no blending. */
export const TELEPORT_M = 5;
/** Events kept in each state: at most this many, and none older than `EVENT_KEEP_S`. */
export const MAX_EVENTS = 10;
export const EVENT_KEEP_S = 3;
/** Mirror: states kept for interpolation. */
const BUFFER = 8;

const PHASES: readonly Phase[] = ['intro', 'count', 'climb', 'flag', 'done'];
const STAGES = ['pick', 'play', 'ended'] as const;
export type Stage = (typeof STAGES)[number];
const HELPS = ['team', 'solo'] as const;
export const MAX_CLIMBERS = 4;
/** The team and the solo sandbag. */
const MAX_BODIES = MAX_CLIMBERS + 1;
const MAX_LINKS = MAX_BODIES - 1;
const MAX_SECTIONS = 8;
const MAX_SEED = 0x7fffffff;

/** Body flags (bit mask). */
export const FLAG = { ground: 1, frozen: 2, stunned: 4, grip: 8, hang: 16, offline: 32 } as const;
const ALL_FLAGS = 63;

/** id, x, y, z, yaw, flags. */
export type BodyRow = [number, number, number, number, number, number];
/** Rope link (in tie order): slack length, current length (m). */
export type LinkRow = [number, number];

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
  /** Game time it happened (s, see `TaliMirror.gt`). */
  t: number;
  e: ShowEvent;
}

/** Compact wire shape (short keys: it crosses the network about 15 times a second). */
export interface TaliMirror {
  v: 1;
  /** Server ms the Host made this state (`game.now()`). */
  at: number;
  /** Game time: seconds the match has run over the whole session (never resets). */
  gt: number;
  /** Sim time of the current section (s, moving blocks are posed from it). */
  st: number;
  sg: Stage;
  /** The Host's game clock is held (pause menu or hidden tab). */
  pz: boolean;
  ro: RouteId;
  /** Route picker card while the Host picks (selected = `ro`); `os` = each route's sub line. */
  pk: { sub: string; note: string; os: string[] } | null;
  /** Course seed and number of sections (0 and the setting before the climb starts). */
  sd: number;
  sn: number;
  no: number;
  ph: Phase;
  pt: number;
  /** Climb clock of this section and of the finished ones (s). */
  ct: number;
  tt: number;
  /** Tied to the solo sandbag this section. */
  sk: boolean;
  /** Catches over the session. */
  ca: number;
  /** Finished sections: 1 = flag raised, 0 = time ran out. */
  fd: (0 | 1)[];
  pl: PlayerRow[];
  /** Bodies in tie order (climbers, then the sandbag). */
  bo: BodyRow[];
  rp: LinkRow[];
  br: string;
  ic: IntroCard | null;
  fc: FlagCard | null;
  ev: EventEntry[];
}

export interface MirrorSource {
  at: number;
  stage: Stage;
  paused: boolean;
  route: RouteId;
  sections: number;
  pick: PickCard | null;
  match: TaliMatch | null;
  gameT: number;
  brand: string;
  intro: IntroCard | null;
  flagCard: FlagCard | null;
  events: readonly EventEntry[];
}

/** The Host's side of the link (main.tsx fills it from the SDK). */
export interface MirrorLink {
  active(): boolean;
  now(): number;
  send(state: TaliMirror): void;
}

const r2 = (v: number): number => Math.round(v * 100) / 100;
const r3 = (v: number): number => Math.round(v * 1000) / 1000;
const clampSections = (n: number): number =>
  Number.isFinite(n) ? Math.max(1, Math.min(MAX_SECTIONS, Math.floor(n))) : 6;

function roundEvent(e: ShowEvent): ShowEvent {
  if (e.k === 'wipe') return { ...e, at: { x: r2(e.at.x), y: r2(e.at.y), z: r2(e.at.z) } };
  if (e.k === 'land') return { ...e, speed: Math.round(e.speed * 10) / 10 };
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

  /** Entries still worth sending at game time `t`. */
  recent(t: number): EventEntry[] {
    return this.rows.filter((r) => r.t >= t - EVENT_KEEP_S);
  }
}

function bodyRows(m: TaliMatch): BodyRow[] {
  const rows: BodyRow[] = [];
  for (const id of m.chainIds()) {
    const b = m.sim.body(id);
    if (!b) continue;
    const c = id === SACK_ID ? undefined : m.climber(id);
    const flags =
      (b.ground >= 0 ? FLAG.ground : 0) |
      (b.frozenLeft > 0 ? FLAG.frozen : 0) |
      (b.stunLeft > 0 ? FLAG.stunned : 0) |
      (c?.grip ? FLAG.grip : 0) |
      (c?.hanging ? FLAG.hang : 0) |
      (c?.offline ? FLAG.offline : 0);
    rows.push([id, r2(b.pos.x), r2(b.pos.y), r2(b.pos.z), r2(b.yaw), flags]);
  }
  return rows;
}

export function toMirror(src: MirrorSource): TaliMirror {
  const m = src.match;
  const pick = src.pick;
  return {
    v: 1,
    at: Math.round(src.at),
    gt: r3(Math.max(0, src.gameT)),
    st: m ? r3(m.sim.t) : 0,
    sg: src.stage,
    pz: src.paused,
    ro: m ? m.route : src.route,
    pk: pick ? { sub: pick.sub, note: pick.note, os: pick.options.map((o) => o.sub) } : null,
    sd: m ? m.seed : 0,
    sn: m ? m.sections : clampSections(src.sections),
    no: m ? m.sectionNo : 0,
    ph: m ? m.phase : 'intro',
    pt: m ? r2(m.phaseT) : 0,
    ct: m ? r2(m.sectionT) : 0,
    tt: m ? r2(m.teamTime) : 0,
    sk: m ? m.sack : false,
    ca: m ? m.catches : 0,
    fd: m ? m.results.map((r) => (r.done ? 1 : 0)) : [],
    pl: m ? m.climbers.map((c) => ({ id: c.id, n: c.name, f: c.fruit, l: c.look, c: c.color })) : [],
    bo: m ? bodyRows(m) : [],
    rp: m ? m.rope.links.map((_, i): LinkRow => [r2(m.rope.restOf(i)), r2(m.rope.length[i] ?? 0)]) : [],
    br: src.brand,
    ic: src.intro,
    fc: src.flagCard,
    ev: [...src.events],
  };
}

/**
 * The team clock at server time `now`, read ahead from the newest state `s` (what the Host's clock
 * shows right then, not the delayed stage): the running total and, while climbing, the seconds left.
 */
export function clockAt(s: TaliMirror, now: number): { total: number; left: number | null } {
  if (s.sg !== 'play' || s.ph !== 'climb') return { total: s.tt, left: null };
  const ct = s.ct + (s.pz ? 0 : sinceStamp(s.at, now) / 1000);
  return { total: s.tt + ct, left: Math.max(0, TIMING.sectionMax - ct) };
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
/** Body ids: phones are positive, the sandbag negative. */
const isId = (v: unknown): v is number => isInt(v) && v !== 0 && Math.abs(v) < 1e9;
const isCoord = (v: unknown): v is number => isNum(v) && Math.abs(v) < 1000;
/** Seconds on a clock (a session is at most a few thousand). */
const isTime = (v: unknown): v is number => isNum(v) && v >= 0 && v < 1e6;

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

const parseText =
  (max: number) =>
  (v: unknown): string | null =>
    isText(v, max) ? v : null;

const parseIdItem = (v: unknown): number | null => (isId(v) ? v : null);

function parsePlayer(v: unknown): PlayerRow | null {
  if (!isObj(v) || !isId(v.id) || !isText(v.n, 40) || !isFruit(v.f) || !isText(v.c, 16)) return null;
  const l = parseLook(v.l);
  return l ? { id: v.id, n: v.n, f: v.f, l, c: v.c } : null;
}

function parseBody(v: unknown): BodyRow | null {
  if (!Array.isArray(v) || v.length !== 6) return null;
  const [id, x, y, z, yaw, flags] = v as unknown[];
  if (!isId(id) || !isCoord(x) || !isCoord(y) || !isCoord(z) || !isCoord(yaw)) return null;
  if (!isNat(flags) || flags > ALL_FLAGS) return null;
  return [id, x, y, z, yaw, flags];
}

function parseLink(v: unknown): LinkRow | null {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const [rest, len] = v as unknown[];
  if (!isNum(rest) || rest < 0 || rest > 50 || !isNum(len) || len < 0 || len > 500) return null;
  return [rest, len];
}

function parsePick(v: unknown): TaliMirror['pk'] | undefined {
  if (v === null) return null;
  if (!isObj(v) || !isText(v.sub, 120) || !isText(v.note, 160)) return undefined;
  const os = parseList(v.os, parseText(80), 3);
  return os ? { sub: v.sub, note: v.note, os } : undefined;
}

function parseIntro(v: unknown): IntroCard | null | undefined {
  if (v === null) return null;
  if (!isObj(v) || !isText(v.of, 80) || !isText(v.name, 80) || !isText(v.level, 80)) return undefined;
  const segments = parseList(v.segments, parseText(60), 12);
  if (!segments || !isBool(v.solo)) return undefined;
  return { of: v.of, name: v.name, level: v.level, segments, solo: v.solo };
}

function parseFlagCard(v: unknown): FlagCard | null | undefined {
  if (v === null) return null;
  if (!isObj(v) || !isText(v.title, 120) || !isBool(v.done) || !isText(v.sub, 160)) return undefined;
  if (!isNat(v.stars) || v.stars > 3) return undefined;
  const lines = parseList(v.lines, parseText(160), 4);
  return lines ? { title: v.title, done: v.done, stars: v.stars, lines, sub: v.sub } : undefined;
}

function parseV3(v: unknown): { x: number; y: number; z: number } | null {
  if (!isObj(v) || !isCoord(v.x) || !isCoord(v.y) || !isCoord(v.z)) return null;
  return { x: v.x, y: v.y, z: v.z };
}

function parseShow(v: unknown): ShowEvent | null {
  if (!isObj(v)) return null;
  switch (v.k) {
    case 'count':
      return isInt(v.value) && v.value >= 1 && v.value <= 9 ? { k: 'count', value: v.value } : null;
    case 'go':
      if (v.help === null) return { k: 'go', help: null };
      return oneOf(HELPS, v.help) ? { k: 'go', help: v.help } : null;
    case 'sync': {
      const ids = parseList(v.ids, parseIdItem, MAX_CLIMBERS);
      return ids ? { k: 'sync', ids } : null;
    }
    case 'land':
      return isId(v.id) && isNum(v.speed) && v.speed >= 0 && v.speed < 200
        ? { k: 'land', id: v.id, speed: v.speed }
        : null;
    case 'sweep':
    case 'climbUp':
      return isId(v.id) ? { k: v.k, id: v.id } : null;
    case 'catch':
    case 'rescued': {
      const by = parseList(v.by, parseIdItem, MAX_CLIMBERS);
      return isId(v.id) && by ? { k: v.k, id: v.id, by } : null;
    }
    case 'save':
      return isNat(v.index) && v.index < 50 && isId(v.id) ? { k: 'save', index: v.index, id: v.id } : null;
    case 'wipe': {
      const at = parseV3(v.at);
      return isId(v.id) && at && isBool(v.live) ? { k: 'wipe', id: v.id, at, live: v.live } : null;
    }
    case 'throw':
      return { k: 'throw' };
    case 'flag':
      return isBool(v.done) && isNat(v.no) && v.no < MAX_SECTIONS && isNat(v.stars) && v.stars <= 3
        ? { k: 'flag', done: v.done, no: v.no, stars: v.stars }
        : null;
    default:
      return null;
  }
}

function parseEvent(v: unknown): EventEntry | null {
  if (!isObj(v) || !isNat(v.n) || !isTime(v.t)) return null;
  const e = parseShow(v.e);
  return e ? { n: v.n, t: v.t, e } : null;
}

/** Validates a published state from the network; null if anything is off. */
export function applyMirror(json: unknown): TaliMirror | null {
  if (!isObj(json) || json.v !== 1) return null;
  const j = json;
  if (!isNum(j.at) || !isTime(j.gt) || !isTime(j.st) || !oneOf(STAGES, j.sg) || !isBool(j.pz)) return null;
  if (!isRouteId(j.ro) || !oneOf(PHASES, j.ph) || !isTime(j.pt)) return null;
  if (!isNat(j.sd) || j.sd > MAX_SEED || !isInt(j.sn) || j.sn < 1 || j.sn > MAX_SECTIONS) return null;
  if (!isNat(j.no) || j.no >= j.sn || !isTime(j.ct) || !isTime(j.tt)) return null;
  if (!isBool(j.sk) || !isNat(j.ca) || j.ca > 1e6 || !isText(j.br, 80)) return null;
  const fd = parseList(j.fd, (x) => (isBit(x) ? x : null), j.sn);
  const pk = parsePick(j.pk);
  const pl = parseList(j.pl, parsePlayer, MAX_CLIMBERS);
  const bo = parseList(j.bo, parseBody, MAX_BODIES);
  const rp = parseList(j.rp, parseLink, MAX_LINKS);
  const ic = parseIntro(j.ic);
  const fc = parseFlagCard(j.fc);
  const ev = parseList(j.ev, parseEvent, MAX_EVENTS);
  if (!fd || pk === undefined || !pl || !bo || !rp || ic === undefined || fc === undefined || !ev)
    return null;
  return {
    v: 1,
    at: j.at,
    gt: j.gt,
    st: j.st,
    sg: j.sg,
    pz: j.pz,
    ro: j.ro,
    pk,
    sd: j.sd,
    sn: j.sn,
    no: j.no,
    ph: j.ph,
    pt: j.pt,
    ct: j.ct,
    tt: j.tt,
    sk: j.sk,
    ca: j.ca,
    fd,
    pl,
    bo,
    rp,
    br: j.br,
    ic,
    fc,
    ev,
  };
}

/* ------------------------------------------------------------------ interpolation */

export interface PosedBody {
  id: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Velocity (m per sim second), for the run and fall animation. */
  vx: number;
  vy: number;
  vz: number;
  flags: number;
}

export interface Posed {
  /** The state whose discrete facts (phase, section, HUD) are on screen. */
  s: TaliMirror;
  gameT: number;
  simT: number;
  phaseT: number;
  sectionT: number;
  bodies: PosedBody[];
  rope: LinkRow[];
  /** Some body jumped (a team respawn): the drawn rope should forget its shape. */
  snap: boolean;
}

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

function lerpAngle(a: number, b: number, k: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

function velocity(a: BodyRow, b: BodyRow, dt: number): [number, number, number] {
  if (dt <= 1e-3) return [0, 0, 0];
  return [(b[1] - a[1]) / dt, (b[2] - a[2]) / dt, (b[3] - a[3]) / dt];
}

/** A respawn: far apart, or frozen in place since the state before. */
const jumped = (a: BodyRow, b: BodyRow): boolean =>
  Math.hypot(b[1] - a[1], b[2] - a[2], b[3] - a[3]) > TELEPORT_M ||
  ((b[5] & FLAG.frozen) !== 0 && (a[5] & FLAG.frozen) === 0);

/** Both states show the same section of the same course. */
const sameSection = (a: TaliMirror, b: TaliMirror): boolean =>
  a.sg === b.sg && a.sd === b.sd && a.no === b.no && a.ro === b.ro && b.st >= a.st;

/**
 * The climb at server time `at`, between state `a` (at or before) and `b` (after, or null when `a`
 * is the newest). `prev` is the state before `a`, for the speed when there is no `b`. Positions,
 * facing and the rope blend inside one section; a body that jumped (a team respawn) snaps; phase
 * time only blends inside one phase.
 */
export function pose(prev: TaliMirror | null, a: TaliMirror, b: TaliMirror | null, at: number): Posed {
  const span = b ? b.at - a.at : 0;
  const k = b && span > 0 ? Math.min(1, Math.max(0, (at - a.at) / span)) : 0;
  const gameT = b && b.gt >= a.gt ? lerp(a.gt, b.gt, k) : a.gt;
  const same = b !== null && sameSection(a, b);
  const nb = same ? b : null;
  const simT = nb ? lerp(a.st, nb.st, k) : a.st;
  const phaseT = nb && nb.ph === a.ph ? lerp(a.pt, nb.pt, k) : a.pt + Math.max(0, simT - a.st);
  const sectionT = nb && nb.ph === a.ph ? lerp(a.ct, nb.ct, k) : a.ct;
  let snap = false;
  const bodies = a.bo.map((ra): PosedBody => {
    const next = nb?.bo.find((r) => r[0] === ra[0]);
    const [id, , , , , flags] = ra;
    if (nb && next) {
      if (jumped(ra, next)) {
        snap = true;
        const to = k < 0.5 ? ra : next;
        return { id, x: to[1], y: to[2], z: to[3], yaw: to[4], vx: 0, vy: 0, vz: 0, flags: to[5] };
      }
      const [vx, vy, vz] = velocity(ra, next, nb.st - a.st);
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
    const before = prev && sameSection(prev, a) ? prev.bo.find((r) => r[0] === id) : undefined;
    const [vx, vy, vz] =
      prev && before && !jumped(before, ra) ? velocity(before, ra, a.st - prev.st) : [0, 0, 0];
    return { id, x: ra[1], y: ra[2], z: ra[3], yaw: ra[4], vx, vy, vz, flags };
  });
  const rope =
    nb && nb.rp.length === a.rp.length && !snap
      ? a.rp.map((l, i): LinkRow => [lerp(l[0], nb.rp[i]![0], k), lerp(l[1], nb.rp[i]![1], k)])
      : a.rp.map((l): LinkRow => [l[0], l[1]]);
  return { s: a, gameT, simT, phaseT, sectionT, bodies, rope, snap };
}

/**
 * Mirror: the states received so far and the clock to draw them by: a `PlayoutClock` keeps the
 * draw time the shortest recent trip plus a buffer (following the state gap and jitter) behind
 * server time, eased so a route change never makes the climb jump.
 */
export class MirrorTimeline {
  private buf: TaliMirror[] = [];
  private readonly clock = new PlayoutClock();

  /** Adds a state received at server time `now`; false if it is old or a repeat. */
  push(s: TaliMirror, now: number): boolean {
    const last = this.buf[this.buf.length - 1];
    if (last && s.at <= last.at) return false;
    this.buf.push(s);
    if (this.buf.length > BUFFER) this.buf.shift();
    this.clock.observe(s.at, now);
    return true;
  }

  get latest(): TaliMirror | null {
    return this.buf[this.buf.length - 1] ?? null;
  }

  /** Shortest recent delivery delay (ms), null before the first state. */
  get lagMs(): number | null {
    return this.clock.lagMs;
  }

  /** How far behind server time the climb was last drawn (ms), null before the first state. */
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
