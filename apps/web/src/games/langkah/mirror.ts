/**
 * Long-distance play: the display state the Host's main screen publishes for Langkah Maut and how
 * a far-away main screen reads it back. Pure (no DOM, no SDK, no Three.js).
 *
 * Fairness rests on the server clock. Presses are judged by the moment they happened on the phone
 * (server clock), and the cue schedule is fixed once built, so the state carries the cues with
 * their babak times plus the babak clock anchored in server time (`o`: server ms at babak time 0,
 * already shifted by every pause). The far-away screen draws each cue at `game.now()` through that
 * anchor, not when the packet lands: a cue appears there at the same server moment as on the
 * Host's screen, and a press made on seeing it gets the same verdict as a press made at the Host.
 * While the clock stands (menu, intro card, babak summary, pause) the state carries the frozen
 * babak time (`h`) instead.
 *
 * Verdicts (who stepped, who fell, points) exist only on the Host and show on the far screen when
 * they arrive. They travel as per-walker counters (steps taken, fallen), which cannot be lost when
 * the shell drops intermediate states: the far screen replays the hop or fall for each change.
 */
import { type Fruit, isFruit, type Look, parseLook, sameLook } from '@hoorah/protocol';
import { isCpu } from '../common/cpu';
import {
  type Choice,
  type Cue,
  DIRS,
  isChoice,
  type LangkahMatch,
  type Phase,
  type PlayerInfo,
  STAGES,
  type Stage,
  TIMING,
  type Walker,
} from './logic';

/** Host: shortest gap between two published states while the babak runs (ms). */
export const PUBLISH_MS = 50;
/** Host: the anchor moves only when the babak clock drifts further than this from it (ms). */
export const ANCHOR_SLACK_MS = 15;
/** Cues kept in a state, from the oldest still on screen. */
export const MAX_CUES = 32;
/** A cue stays in the state this long after its window closed (s), for the laser beams. */
const CUE_KEEP_S = 1;
const MAX_WALKERS = 16;
const MAX_BABAK = 8;

const PHASES: readonly Phase[] = ['setup', 'intro', 'play', 'end', 'final', 'done'];

/** Walker flags (bit mask). */
export const FLAG = { fallen: 1, inRound: 2, pas: 4, offline: 8 } as const;
const ALL_FLAGS = 15;

export interface PlayerRow {
  id: number;
  n: string;
  f: Fruit;
  l: Look;
  c: string;
}

/** id, steps this babak, flags, babak points, total, best steps, points per babak. */
export type WalkerRow = [number, number, number, number, number, number, number[]];
/** index, direction (index in DIRS), show, open, at, close, hide (-1 = stays), group. */
export type CueRow = [number, number, number, number, number, number, number, number];
/** Ingat Jalan sequence: group, length, show time, recall time. */
export type MemoRow = [number, number, number, number];

/** Compact wire shape (short keys: it crosses the network many times a second). */
export interface LangkahMirror {
  v: 1;
  /** Host session (random per Host game), so a restarted Host is not mistaken for an old one. */
  ss: number;
  /** Grows by one per published change, for ordering. */
  sq: number;
  ph: Phase;
  pk: Choice;
  rn: number;
  /** The babak plan (empty before the Host starts). */
  pn: Stage[];
  no: number;
  /**
   * Server ms at babak time 0 while the babak clock runs (intro card or play, not paused), else
   * null. During the intro card it lies ahead: the moment play begins.
   */
  o: number | null;
  /** Babak time (s) while the clock stands, else null. Exactly one of `o` and `h` is set. */
  h: number | null;
  /** The Host's game clock is held (pause menu or hidden tab). */
  pz: boolean;
  /** Host's name, for the menu's "is choosing" line. */
  hn: string;
  pl: PlayerRow[];
  wk: WalkerRow[];
  cu: CueRow[];
  mo: MemoRow | null;
  /** Session record: id, name, steps. */
  rc: [number, string, number] | null;
}

export interface MirrorSource {
  match: LangkahMatch;
  session: number;
  seq: number;
  /** Server ms at babak time 0 while the babak clock runs (see `BabakAnchor`), else null. */
  anchor: number | null;
  paused: boolean;
  hostName: string;
  offline: (id: number) => boolean;
}

/** The Host's side of the link (main.tsx fills it from the SDK). */
export interface MirrorLink {
  active(): boolean;
  now(): number;
  send(state: LangkahMirror): void;
}

const r3 = (v: number): number => Math.round(v * 1000) / 1000;

/**
 * Host: the babak clock in server time. `update` gets the babak time and the server time read at
 * the same moment; the anchor only moves when they drift more than `ANCHOR_SLACK_MS` apart (a long
 * frame, a clock resync), so consecutive states stay equal and are not resent.
 */
export class BabakAnchor {
  private o: number | null = null;

  update(running: boolean, serverMs: number, t: number): number | null {
    if (!running) {
      this.o = null;
      return null;
    }
    const est = serverMs - t * 1000;
    if (this.o === null || Math.abs(est - this.o) > ANCHOR_SLACK_MS) this.o = Math.round(est);
    return this.o;
  }
  /** The anchor of the last update (null while the clock stands). */
  get value(): number | null {
    return this.o;
  }
}

/**
 * Babak time (s) a state shows at server time `serverMs` (0 until play begins: during the intro
 * card the anchor lies ahead).
 */
export function babakTimeAt(s: Pick<LangkahMirror, 'o' | 'h'>, serverMs: number): number {
  if (s.h !== null || s.o === null) return s.h ?? 0;
  return Math.max(0, Math.min(TIMING.babak, (serverMs - s.o) / 1000));
}

/** Index of the oldest cue still worth drawing at babak time `t`. */
function firstLive(cues: readonly Cue[], t: number): number {
  let i = 0;
  while (i < cues.length && cues[i]!.close + CUE_KEEP_S < t) i++;
  return Math.max(0, i - 1);
}

function cueRow(c: Cue): CueRow {
  return [
    c.i,
    DIRS.indexOf(c.dir),
    r3(c.show),
    r3(c.open),
    r3(c.at),
    r3(c.close),
    c.hide === null ? -1 : r3(c.hide),
    c.group,
  ];
}

export function rowToCue(r: CueRow): Cue {
  return {
    i: r[0],
    dir: DIRS[r[1]]!,
    show: r[2],
    open: r[3],
    at: r[4],
    close: r[5],
    hide: r[6] < 0 ? null : r[6],
    group: r[7],
  };
}

/** Phases whose babak clock runs: the intro card counts down to babak time 0. */
const clocked = (ph: Phase): boolean => ph === 'intro' || ph === 'play';

/**
 * Host: the babak clock the anchor follows. Negative during the intro card (time until play), so
 * the anchor is already the server moment play begins and a far-away screen starts it then.
 */
export function babakClock(m: LangkahMatch): number {
  return m.phase === 'intro' ? m.phaseT - TIMING.intro : m.t;
}

export function toMirror(src: MirrorSource): LangkahMirror {
  const m = src.match;
  const running = src.anchor !== null && clocked(m.phase) && !src.paused;
  const lo = firstLive(m.cues, m.t);
  return {
    v: 1,
    ss: src.session,
    sq: src.seq,
    ph: m.phase,
    pk: m.pick,
    rn: m.rounds,
    pn: [...m.plan],
    no: m.babak,
    o: running ? src.anchor : null,
    h: running ? null : r3(m.t),
    pz: src.paused,
    hn: src.hostName,
    pl: m.players.map((p) => ({ id: p.id, n: p.name, f: p.fruit, l: p.look, c: p.color })),
    wk: m.players.map((p) => [
      p.id,
      p.step,
      (p.fallen ? FLAG.fallen : 0) |
        (p.inRound ? FLAG.inRound : 0) |
        (p.lastJudge === 'pas' ? FLAG.pas : 0) |
        (src.offline(p.id) ? FLAG.offline : 0),
      p.babakPoints,
      p.total,
      p.stats.best,
      p.rounds.slice(0, MAX_BABAK),
    ]),
    cu: clocked(m.phase) ? m.cues.slice(lo, lo + MAX_CUES).map(cueRow) : [],
    mo: m.memo ? [m.memo.group, m.memo.length, r3(m.memo.showAt), r3(m.memo.recallAt)] : null,
    rc: m.record ? [m.record.id, m.record.name, m.record.steps] : null,
  };
}

/* ------------------------------------------------------------------ validation */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isNat = (v: unknown): v is number => isInt(v) && v >= 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v);
/** Walker ids: phones are positive, computer walkers negative. */
const isId = (v: unknown): v is number => isInt(v) && v !== 0 && Math.abs(v) < 1e9;
/** A babak time (s): a babak lasts at most `TIMING.babak`, cues are built a little ahead. */
const isTime = (v: unknown): v is number => isNum(v) && v >= 0 && v <= TIMING.babak + 30;
const isPoints = (v: unknown): v is number => isInt(v) && Math.abs(v) < 1e7;

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

function parseWalker(v: unknown): WalkerRow | null {
  if (!Array.isArray(v) || v.length !== 7) return null;
  const [id, step, flags, bp, total, best, rounds] = v as unknown[];
  if (!isId(id) || !isNat(step) || step > 10_000 || !isNat(flags) || flags > ALL_FLAGS) return null;
  if (!isPoints(bp) || !isPoints(total) || !isNat(best) || best > 10_000) return null;
  const r = parseList(rounds, (x) => (isPoints(x) ? x : null), MAX_BABAK);
  return r ? [id, step, flags, bp, total, best, r] : null;
}

function parseCue(v: unknown): CueRow | null {
  if (!Array.isArray(v) || v.length !== 8) return null;
  const [i, d, show, open, at, close, hide, group] = v as unknown[];
  if (!isNat(i) || i > 10_000 || !isNat(d) || d >= DIRS.length) return null;
  if (!isTime(show) || !isTime(open) || !isTime(at) || !isTime(close)) return null;
  if (!(hide === -1 || isTime(hide)) || !isNat(group) || group > 10_000) return null;
  if (open < show || at < open || close < at) return null;
  return [i, d, show, open, at, close, hide, group];
}

function parseMemo(v: unknown): MemoRow | null | undefined {
  if (v === null) return null;
  if (!Array.isArray(v) || v.length !== 4) return undefined;
  const [group, length, showAt, recallAt] = v as unknown[];
  if (!isNat(group) || group > 10_000 || !isNat(length) || length > MAX_CUES) return undefined;
  if (!isTime(showAt) || !isTime(recallAt) || recallAt < showAt) return undefined;
  return [group, length, showAt, recallAt];
}

function parseRecord(v: unknown): LangkahMirror['rc'] | undefined {
  if (v === null) return null;
  if (!Array.isArray(v) || v.length !== 3) return undefined;
  const [id, name, steps] = v as unknown[];
  return isId(id) && isText(name, 40) && isNat(steps) && steps <= 10_000 ? [id, name, steps] : undefined;
}

/** Validates a published state from the network; null if anything is off. */
export function applyMirror(json: unknown): LangkahMirror | null {
  if (!isObj(json) || json.v !== 1) return null;
  const j = json;
  if (!isNat(j.ss) || !isNat(j.sq) || !oneOf(PHASES, j.ph) || !isChoice(j.pk)) return null;
  if (!isInt(j.rn) || j.rn < 1 || j.rn > MAX_BABAK || !isNat(j.no) || !isBool(j.pz)) return null;
  if (!isText(j.hn, 40)) return null;
  const pn = parseList(j.pn, (x) => (oneOf(STAGES, x) ? x : null), MAX_BABAK);
  if (!pn || (pn.length > 0 && j.no >= pn.length) || (pn.length === 0 && j.no !== 0)) return null;
  // Exactly one clock: running (anchor in server ms) or standing (frozen babak time).
  const running = j.o !== null;
  if (running ? !isNum(j.o) || j.h !== null || !clocked(j.ph) : !isTime(j.h)) return null;
  const pl = parseList(j.pl, parsePlayer, MAX_WALKERS);
  const wk = parseList(j.wk, parseWalker, MAX_WALKERS);
  const cu = parseList(j.cu, parseCue, MAX_CUES);
  const mo = parseMemo(j.mo);
  const rc = parseRecord(j.rc);
  if (!pl || !wk || !cu || mo === undefined || rc === undefined) return null;
  if (wk.length !== pl.length || wk.some((w, i) => w[0] !== pl[i]!.id)) return null;
  for (let k = 1; k < cu.length; k++) if (cu[k]![0] !== cu[k - 1]![0] + 1) return null;
  return {
    v: 1,
    ss: j.ss,
    sq: j.sq,
    ph: j.ph,
    pk: j.pk,
    rn: j.rn,
    pn,
    no: j.no,
    o: running ? (j.o as number) : null,
    h: running ? null : (j.h as number),
    pz: j.pz,
    hn: j.hn,
    pl,
    wk,
    cu,
    mo,
    rc,
  };
}

/* ------------------------------------------------------------------ far-away screen */

const seat = (p: PlayerRow): PlayerInfo => ({
  id: p.id,
  name: p.n,
  fruit: p.f,
  look: p.l,
  color: p.c,
  cpu: isCpu(p.id),
});

const sameRow = (w: Walker, p: PlayerRow): boolean =>
  w.name === p.n && w.fruit === p.f && w.color === p.c && sameLook(w.look, p.l);

/**
 * Far-away screen: writes a state into a local match that never ticks (phase, babak, memory
 * sequence, record, the lineup in the Host's order and each walker's counters). The babak time and
 * the cues are set per frame from `MirrorClock` and `CueBook`; `phase` is the one on screen (play
 * once the intro card's anchor has passed, see `MirrorClock.playing`). Returns true when the lineup
 * or a look changed (the stage then rebuilds its walkers).
 */
export function poseMatch(m: LangkahMatch, s: LangkahMirror, phase: Phase = s.ph): boolean {
  m.pick = s.pk;
  m.plan = [...s.pn];
  m.babak = s.no;
  m.phase = phase;
  m.memo = s.mo ? { group: s.mo[0], length: s.mo[1], showAt: s.mo[2], recallAt: s.mo[3] } : null;
  m.record = s.rc ? { id: s.rc[0], name: s.rc[1], steps: s.rc[2] } : null;
  let changed = m.players.length !== s.pl.length;
  const ids = new Set(s.pl.map((p) => p.id));
  for (const p of [...m.players]) if (!ids.has(p.id)) m.removePlayer(p.id);
  s.pl.forEach((p, i) => {
    const w = m.player(p.id);
    if (!w) m.addPlayer(seat(p));
    else if (!sameRow(w, p)) m.restyle(p.id, { name: p.n, fruit: p.f, look: p.l, color: p.c });
    else if (m.players[i] === w) return;
    changed = true;
  });
  if (changed) {
    // Lanes follow the Host's order.
    const order = new Map(s.pl.map((p, i) => [p.id, i]));
    m.players.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }
  for (const [id, step, flags, babakPoints, total, best, rounds] of s.wk) {
    const p = m.player(id);
    if (!p) continue;
    p.step = step;
    p.next = step;
    p.fallen = (flags & FLAG.fallen) !== 0;
    p.inRound = (flags & FLAG.inRound) !== 0;
    p.lastJudge = flags & FLAG.pas ? 'pas' : step > 0 ? 'ok' : null;
    p.babakPoints = babakPoints;
    p.total = total;
    p.stats.best = best;
    p.rounds = [...rounds];
  }
  return changed;
}

/** Fills an index the far screen never received (it joined mid-babak): long closed, never drawn. */
function gapCue(i: number): Cue {
  return { i, dir: 'up', show: 0, open: 0, at: 0, close: 0, hide: null, group: -1 };
}

/**
 * Far-away screen: the cues of the current babak, gathered from every state (each carries only a
 * window), as a dense list indexed like the Host's (`cues[i].i === i`).
 */
export class CueBook {
  private key = '';
  private readonly known = new Map<number, Cue>();
  private list: Cue[] = [];
  private dirty = false;

  /** Merges the cues of a state; a new Host session or babak starts over. */
  take(s: LangkahMirror): void {
    const key = `${s.ss}:${s.no}`;
    if (key !== this.key) {
      this.key = key;
      this.known.clear();
      this.list = [];
    }
    for (const row of s.cu) {
      if (this.known.has(row[0])) continue;
      this.known.set(row[0], rowToCue(row));
      this.dirty = true;
    }
  }

  get cues(): Cue[] {
    if (!this.dirty) return this.list;
    this.dirty = false;
    let top = -1;
    for (const i of this.known.keys()) top = Math.max(top, i);
    this.list = Array.from({ length: top + 1 }, (_, i) => this.known.get(i) ?? gapCue(i));
    return this.list;
  }
}

/**
 * Far-away screen: the newest state and the babak time to draw. The time follows the server clock
 * through the state's anchor and never runs backwards inside one running babak (a moved anchor
 * after a long Host frame holds it still for a moment instead); it snaps on a new babak, phase or
 * pause.
 */
export class MirrorClock {
  private s: LangkahMirror | null = null;
  private shown = 0;
  private run = '';

  /** False for an old or repeated state (same Host session, not newer). */
  push(s: LangkahMirror): boolean {
    const last = this.s;
    if (last && last.ss === s.ss && s.sq <= last.sq) return false;
    this.s = s;
    return true;
  }

  get latest(): LangkahMirror | null {
    return this.s;
  }

  /** True once play has begun at server time `serverMs` (the intro card's anchor has passed). */
  playing(serverMs: number): boolean {
    const s = this.s;
    if (!s) return false;
    return s.ph === 'play' || (s.ph === 'intro' && s.o !== null && serverMs >= s.o);
  }

  /** Babak time (s) at local server time `serverMs`. */
  at(serverMs: number): number {
    const s = this.s;
    if (!s) return 0;
    const t = babakTimeAt(s, serverMs);
    const run = s.o === null ? '' : `${s.ss}:${s.no}`;
    if (run === '' || run !== this.run) {
      this.run = run;
      this.shown = t;
      return t;
    }
    this.shown = Math.max(this.shown, t);
    return this.shown;
  }
}
