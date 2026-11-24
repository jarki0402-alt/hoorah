/**
 * Long-distance play: the display state the Host's main screen publishes for Bom Oper and how a
 * far-away main screen turns it back into a moving yard. Pure (no DOM, no SDK, no Three.js):
 * `toMirror` reads the running match, `applyMirror` validates untrusted JSON, `MirrorTimeline`
 * buffers the states and interpolates runners between them a little in the past (an adaptive
 * delay, see `playout.ts`), so the far-away screen moves smoothly although the states arrive about
 * 15 times a second.
 *
 * The fuse stays secret here too: only how much of it has burnt (0..1) crosses the network.
 * `FuseClock` reads that share at server time (what the Host's bomb is at right then, not the
 * delayed stage), from how fast it grew over the last states.
 */
import { type Fruit, isFruit, type Look, parseLook } from '@hoorah/protocol';
import { type ArenaId, isArenaId } from './arena';
import type { Banner, IntroCard, PickCard, ScoreCard } from './hud';
import type { BomMatch, Phase } from './logic';
import { PlayoutClock, sinceStamp } from './playout';
import type { ShowEvent } from './show';

/**
 * Host: periodic state while the chase runs (ms), every 4th frame at 60 fps; events publish at
 * once. Not 50: the shell holds each publish 50 ms, so closer states would merge and halve the rate.
 */
export const PUBLISH_MS = 60;
/** A runner that moved further than this between two states jumped (m): no blending. */
export const TELEPORT_M = 4;
/** Events kept in each state: at most this many, and none older than `EVENT_KEEP_S`. */
export const MAX_EVENTS = 8;
export const EVENT_KEEP_S = 3;
/** Mirror: states kept for interpolation. */
const BUFFER = 8;

const PHASES: readonly Phase[] = ['intro', 'drop', 'play', 'boom', 'score', 'done'];
const STAGES = ['pick', 'play', 'ended'] as const;
export type Stage = (typeof STAGES)[number];
const BANNER_TONES: readonly Banner['tone'][] = ['bomb', 'drop', 'boom'];
const MAX_RUNNERS = 8;
const MAX_BOMBS = 2;

/** Runner flags (bit mask). */
export const FLAG = { out: 1, immune: 2, frozen: 4, stunned: 8, offline: 16 } as const;
const ALL_FLAGS = 31;

/** id, x, y, z, yaw, lives, flags. */
export type RunnerRow = [number, number, number, number, number, number, number];
/** holder, burnt 0..1, exploded, pass flight [from, sim time it left] or null. */
export type BombRow = [number, number, 0 | 1, [number, number] | null];
/** Score card row: id, lives, lost a life this round, out. */
export type ScoreRow = [number, number, 0 | 1, 0 | 1];

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
export interface BomMirror {
  v: 1;
  /** Server ms the Host made this state (`game.now()`). */
  at: number;
  /** Sim time of the match (s, 0 before it starts). */
  st: number;
  sg: Stage;
  /** The Host's game clock is held (pause menu or hidden tab). */
  pz: boolean;
  ar: ArenaId;
  /** Arena picker card while the Host picks (selected = `ar`). */
  pk: { sub: string; note: string } | null;
  rn: number;
  no: number;
  ph: Phase;
  pt: number;
  pl: PlayerRow[];
  ru: RunnerRow[];
  bo: BombRow[];
  br: string;
  bn: Banner | null;
  ic: IntroCard | null;
  sc: { t: string; l: string; s: string; r: ScoreRow[] } | null;
  ev: EventEntry[];
}

export interface MirrorSource {
  at: number;
  stage: Stage;
  paused: boolean;
  arena: ArenaId;
  rounds: number;
  pick: PickCard | null;
  match: BomMatch | null;
  offline: (id: number) => boolean;
  brand: string;
  banner: Banner | null;
  intro: IntroCard | null;
  score: ScoreCard | null;
  events: readonly EventEntry[];
}

/** The Host's side of the link (main.tsx fills it from the SDK). */
export interface MirrorLink {
  active(): boolean;
  now(): number;
  send(state: BomMirror): void;
}

const r2 = (v: number): number => Math.round(v * 100) / 100;
const r3 = (v: number): number => Math.round(v * 1000) / 1000;

function roundEvent(e: ShowEvent): ShowEvent {
  return e.k === 'boom' ? { ...e, at: { x: r2(e.at.x), y: r2(e.at.y), z: r2(e.at.z) } } : e;
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

export function toMirror(src: MirrorSource): BomMirror {
  const m = src.match;
  const pl: PlayerRow[] = [];
  const ru: RunnerRow[] = [];
  const bo: BombRow[] = [];
  if (m) {
    for (const r of m.runners) {
      pl.push({ id: r.id, n: r.name, f: r.fruit, l: r.look, c: r.color });
      const b = m.sim.body(r.id);
      if (!b) continue;
      const flags =
        (r.out ? FLAG.out : 0) |
        (m.immuneLeft(r) > 0 ? FLAG.immune : 0) |
        (b.frozenLeft > 0 ? FLAG.frozen : 0) |
        (b.stunLeft > 0 ? FLAG.stunned : 0) |
        (src.offline(r.id) ? FLAG.offline : 0);
      ru.push([r.id, r2(b.pos.x), r2(b.pos.y), r2(b.pos.z), r2(b.yaw), r.lives, flags]);
    }
    for (const b of m.bombs.slice(0, MAX_BOMBS)) {
      bo.push([
        b.holder,
        r3(m.burnt(b)),
        b.exploded ? 1 : 0,
        b.flight ? [b.flight.from, r3(b.flight.at)] : null,
      ]);
    }
  }
  const score = src.score;
  return {
    v: 1,
    at: Math.round(src.at),
    st: m ? r3(m.sim.t) : 0,
    sg: src.stage,
    pz: src.paused,
    ar: m ? m.arena.id : src.arena,
    pk: src.pick ? { sub: src.pick.sub, note: src.pick.note } : null,
    rn: m ? m.rounds : Math.max(1, Math.min(9, Math.floor(src.rounds))),
    no: m ? m.roundNo : 0,
    ph: m ? m.phase : 'intro',
    pt: m ? r2(m.phaseT) : 0,
    pl,
    ru,
    bo,
    br: src.brand,
    bn: src.banner,
    ic: src.intro,
    sc: score
      ? {
          t: score.title,
          l: score.line,
          s: score.sub,
          r: score.rows.map((x) => [x.id, x.lives, x.lost ? 1 : 0, x.out ? 1 : 0]),
        }
      : null,
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
/** Runner ids: phones are positive, computer runners negative. */
const isId = (v: unknown): v is number => isInt(v) && v !== 0 && Math.abs(v) < 1e9;
const isCoord = (v: unknown): v is number => isNum(v) && Math.abs(v) < 1000;

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
  if (!Array.isArray(v) || v.length !== 7) return null;
  const [id, x, y, z, yaw, lives, flags] = v as unknown[];
  if (!isId(id) || !isCoord(x) || !isCoord(y) || !isCoord(z) || !isCoord(yaw)) return null;
  if (!isNat(lives) || lives > 9 || !isNat(flags) || flags > ALL_FLAGS) return null;
  return [id, x, y, z, yaw, lives, flags];
}

function parseBomb(v: unknown): BombRow | null {
  if (!Array.isArray(v) || v.length !== 4) return null;
  const [holder, burnt, exploded, flight] = v as unknown[];
  if (!isId(holder) || !isNum(burnt) || burnt < 0 || burnt > 1 || !isBit(exploded)) return null;
  if (flight === null) return [holder, burnt, exploded, null];
  if (!Array.isArray(flight) || flight.length !== 2) return null;
  const [from, at] = flight as unknown[];
  if (!isId(from) || !isNum(at) || at < 0) return null;
  return [holder, burnt, exploded, [from, at]];
}

function parseBanner(v: unknown): Banner | null | undefined {
  if (v === null) return null;
  if (!isObj(v) || !isText(v.title, 160) || !isText(v.sub, 160) || !oneOf(BANNER_TONES, v.tone))
    return undefined;
  return { title: v.title, sub: v.sub, tone: v.tone };
}

function parseIntro(v: unknown): IntroCard | null | undefined {
  if (v === null) return null;
  if (!isObj(v) || !isText(v.of, 80) || !isText(v.name, 80) || !isText(v.line, 200)) return undefined;
  if (!isBool(v.final) || !isBool(v.how)) return undefined;
  return { of: v.of, name: v.name, line: v.line, final: v.final, how: v.how };
}

function parseScoreRow(v: unknown): ScoreRow | null {
  if (!Array.isArray(v) || v.length !== 4) return null;
  const [id, lives, lost, out] = v as unknown[];
  if (!isId(id) || !isNat(lives) || lives > 9 || !isBit(lost) || !isBit(out)) return null;
  return [id, lives, lost, out];
}

function parseScore(v: unknown): BomMirror['sc'] | undefined {
  if (v === null) return null;
  if (!isObj(v) || !isText(v.t, 120) || !isText(v.l, 300) || !isText(v.s, 120)) return undefined;
  const r = parseList(v.r, parseScoreRow, MAX_RUNNERS);
  return r ? { t: v.t, l: v.l, s: v.s, r } : undefined;
}

function parsePick(v: unknown): BomMirror['pk'] | undefined {
  if (v === null) return null;
  if (!isObj(v) || !isText(v.sub, 120) || !isText(v.note, 160)) return undefined;
  return { sub: v.sub, note: v.note };
}

function parseV3(v: unknown): { x: number; y: number; z: number } | null {
  if (!isObj(v) || !isCoord(v.x) || !isCoord(v.y) || !isCoord(v.z)) return null;
  return { x: v.x, y: v.y, z: v.z };
}

function parseShow(v: unknown): ShowEvent | null {
  if (!isObj(v)) return null;
  switch (v.k) {
    case 'final':
    case 'go':
    case 'win':
      return { k: v.k };
    case 'pass':
      return isId(v.from) && isId(v.to) && isBool(v.near)
        ? { k: 'pass', from: v.from, to: v.to, near: v.near }
        : null;
    case 'refused':
      return isId(v.id) ? { k: 'refused', id: v.id } : null;
    case 'boom': {
      const at = parseV3(v.at);
      return isId(v.id) && isBool(v.out) && at ? { k: 'boom', id: v.id, out: v.out, at } : null;
    }
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
export function applyMirror(json: unknown): BomMirror | null {
  if (!isObj(json) || json.v !== 1) return null;
  const j = json;
  if (!isNum(j.at) || !isNum(j.st) || j.st < 0 || !oneOf(STAGES, j.sg) || !isBool(j.pz)) return null;
  if (!isArenaId(j.ar) || !oneOf(PHASES, j.ph) || !isNum(j.pt) || j.pt < 0) return null;
  if (!isInt(j.rn) || j.rn < 1 || j.rn > 9 || !isNat(j.no) || j.no >= j.rn) return null;
  if (!isText(j.br, 60)) return null;
  const pk = parsePick(j.pk);
  const pl = parseList(j.pl, parsePlayer, MAX_RUNNERS);
  const ru = parseList(j.ru, parseRunner, MAX_RUNNERS);
  const bo = parseList(j.bo, parseBomb, MAX_BOMBS);
  const bn = parseBanner(j.bn);
  const ic = parseIntro(j.ic);
  const sc = parseScore(j.sc);
  const ev = parseList(j.ev, parseEvent, MAX_EVENTS);
  if (
    pk === undefined ||
    !pl ||
    !ru ||
    !bo ||
    bn === undefined ||
    ic === undefined ||
    sc === undefined ||
    !ev
  )
    return null;
  return {
    v: 1,
    at: j.at,
    st: j.st,
    sg: j.sg,
    pz: j.pz,
    ar: j.ar,
    pk,
    rn: j.rn,
    no: j.no,
    ph: j.ph,
    pt: j.pt,
    pl,
    ru,
    bo,
    br: j.br,
    bn,
    ic,
    sc,
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
  lives: number;
  flags: number;
}

export interface Posed {
  /** The state whose discrete facts (phase, holders, HUD) are on screen. */
  s: BomMirror;
  simT: number;
  phaseT: number;
  runners: PosedRunner[];
  /** Burnt share of each bomb in `s.bo`. */
  burnt: number[];
}

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

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
 * The yard at server time `at`, between state `a` (at or before) and `b` (after, or null when
 * `a` is the newest). `prev` is the state before `a`, for the running speed when there is no `b`.
 * Positions and facing blend; a runner that jumped (back to a spawn spot) snaps; phase time and
 * the fuse only blend inside one phase.
 */
export function pose(prev: BomMirror | null, a: BomMirror, b: BomMirror | null, at: number): Posed {
  const span = b ? b.at - a.at : 0;
  const k = b && span > 0 ? Math.min(1, Math.max(0, (at - a.at) / span)) : 0;
  const simT = b ? lerp(a.st, b.st, k) : a.st;
  const same = b !== null && b.sg === a.sg && b.ph === a.ph && b.no === a.no;
  const phaseT = same && b ? lerp(a.pt, b.pt, k) : a.pt + Math.max(0, simT - a.st);
  const runners = a.ru.map((ra): PosedRunner => {
    const next = b?.ru.find((r) => r[0] === ra[0]);
    const [id, , , , , lives, flags] = ra;
    if (b && next) {
      if (jumped(ra, next)) {
        const at2 = k < 0.5 ? ra : next;
        return { id, x: at2[1], y: at2[2], z: at2[3], yaw: at2[4], vx: 0, vy: 0, vz: 0, lives, flags };
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
        lives,
        flags,
      };
    }
    const before = prev?.ru.find((r) => r[0] === id);
    const [vx, vy, vz] =
      prev && before && !jumped(before, ra) ? velocity(before, ra, a.st - prev.st) : [0, 0, 0];
    return { id, x: ra[1], y: ra[2], z: ra[3], yaw: ra[4], vx, vy, vz, lives, flags };
  });
  const burnt = a.bo.map((bomb, i) => {
    const nb = b?.bo[i];
    return same && nb && nb[2] === 0 && bomb[2] === 0 ? lerp(bomb[1], nb[1], k) : bomb[1];
  });
  return { s: a, simT, phaseT, runners, burnt };
}

/**
 * Mirror: the states received so far and the clock to draw them by: a `PlayoutClock` keeps the
 * draw time the shortest recent trip plus a buffer (following the state gap and jitter) behind
 * server time, eased so a route change never makes the yard jump.
 */
export class MirrorTimeline {
  private buf: BomMirror[] = [];
  private readonly clock = new PlayoutClock();

  /** Adds a state received at server time `now`; false if it is old or a repeat. */
  push(s: BomMirror, now: number): boolean {
    const last = this.buf[this.buf.length - 1];
    if (last && s.at <= last.at) return false;
    this.buf.push(s);
    if (this.buf.length > BUFFER) this.buf.shift();
    this.clock.observe(s.at, now);
    return true;
  }

  get latest(): BomMirror | null {
    return this.buf[this.buf.length - 1] ?? null;
  }

  /** Shortest recent delivery delay (ms), null before the first state. */
  get lagMs(): number | null {
    return this.clock.lagMs;
  }

  /** How far behind server time the yard was last drawn (ms), null before the first state. */
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

/* ------------------------------------------------------------------ fuse at server time */

/** Sim seconds of burning the rate is measured over before the fuse is read ahead. */
const FUSE_BASE_S = 1;

interface FuseMark {
  round: number;
  st: number;
  burnt: number;
}

/**
 * Mirror: the share of each fuse burnt at server time. The stage is drawn a little in the past, but
 * the sputter should tell a far-away player how close the bomb is to going off right now, as the
 * Host's bomb (and the holder's phone) has it. The fuse burns evenly in sim time, so its rate comes
 * from the states themselves (the share burnt over sim time since the fuse was first seen lit).
 */
export class FuseClock {
  private readonly marks: (FuseMark | null)[] = [];

  /** Note a state as it arrives (in order). */
  observe(s: BomMirror): void {
    for (let i = 0; i < MAX_BOMBS; i++) {
      const row = s.bo[i];
      if (!row || row[2] === 1 || s.ph !== 'play' || row[1] <= 0) {
        this.marks[i] = null;
        continue;
      }
      const mark = this.marks[i];
      if (!mark || mark.round !== s.no || row[1] < mark.burnt || s.st < mark.st) {
        this.marks[i] = { round: s.no, st: s.st, burnt: row[1] };
      }
    }
  }

  /**
   * Burnt share of bomb `index` at server time `now`, read ahead from the newest state `s`; null
   * when it cannot be told yet (just lit, exploded, or not in the chase).
   */
  burntAt(s: BomMirror, index: number, now: number): number | null {
    const row = s.bo[index];
    const mark = this.marks[index];
    if (!row || !mark || row[2] === 1 || s.ph !== 'play' || mark.round !== s.no) return null;
    const span = s.st - mark.st;
    const grown = row[1] - mark.burnt;
    if (span < FUSE_BASE_S || grown <= 0) return null;
    const ahead = s.pz ? 0 : sinceStamp(s.at, now) / 1000;
    return Math.min(1, row[1] + (grown / span) * ahead);
  }
}
