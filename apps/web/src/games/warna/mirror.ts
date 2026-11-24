/**
 * Long-distance play: the display state the Host's main screen publishes about 16 times a second,
 * and what a far-away main screen rebuilds from it. Pure (no DOM, no SDK).
 *
 * Stage maps are static data both screens hold, so a packet names the level by its index and
 * carries only what moves or changes: characters (position, speed, facing and pose flags), boxes,
 * lifts, door openness, switches, gems, checkpoints and helper planks, plus who plays which
 * character. The menus and cards (world picker, journey map, intro, clear and the Host's choice
 * after it) are rebuilt from the phase, the picker state, the progress and the last score.
 * Effects (jumps, landings, falls, respawns, gems, flags, bounces, pings, restarts) are numbered
 * events repeated for a short while, so a lost packet loses none of them.
 *
 * `MirrorFeed` (Host) numbers the events, `toMirror` packs, `applyMirror` validates untrusted
 * JSON, `MirrorTimeline` plays the stage a little in the past (an adaptive delay, see
 * `playout.ts`), `poseWorld` moves a local World to the playback point and `mirrorClocks` reads
 * the stage clock at server time (what the Host shows, not the delayed stage).
 */
import { type Look, parseLook } from '@hoorah/protocol';
import type { FxEvent } from './effects';
import type { ScoreLine } from './hudstate';
import { BIOME_IDS, type BiomeId, Cell, COLS, type HintTarget, LEVELS, type Level, ROWS } from './levels';
import type { HintInfo, Phase, PickStep, Progress, WarnaMatch } from './logic';
import { PlayoutClock, sinceStamp } from './playout';
import type { CharLook } from './scene';
import { TUNE, type World } from './world';

/** Publish interval while a far-away screen watches. */
export const MIRROR_MS = 60;
/** Packets stay well under this many JSON characters (the shell's limit is about 7.5 KB). */
export const PACKET_MAX = 6000;
/** Effect events are repeated in every packet for this long, at most this many. */
const EVENT_KEEP_MS = 800;
export const EVENTS_KEPT = 24;
/** Position steps per tile, speed steps per tile/s, door openness steps. */
const Q = 100;
const VQ = 10;
const DQ = 100;
/** Most characters in a stage (16 players; a lone player steers two). */
export const MAX_CHARS = 32;
/** Characters may be this far outside the map (tiles) while falling. */
const POS_PAD = 8;
const NAME_MAX = 40;
const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const BITS_RE = /^[01]*$/;
const PROGRESS_RE = /^[-0-3]*$/;
/** Longest stage clock and auto-start wait accepted from the network (ms). */
const PLAY_MAX_MS = 24 * 3600 * 1000;
const NEXT_MAX_MS = 60_000;

const PHASES: readonly Phase[] = ['select', 'intro', 'play', 'clear', 'next', 'done'];
const STEPS: readonly PickStep[] = ['world', 'level'];
const TARGETS: readonly HintTarget[] = ['box', 'ch1', 'ch2', 'ch3', 'exit'];
const KINDS: readonly HintInfo['kind'][] = ['box', 'plate', 'lever', 'exit'];

/* Character flags. */
const F_LEFT = 1;
const F_GROUND = 2;
const F_MOVE = 4;
const F_ACTIVE = 8;
const F_DEAD = 16;
const F_EXIT = 32;
const F_ALL = 63;

/* Score flags. */
const S_GEMS = 1;
const S_TIME = 2;
const S_SKIP = 4;

/* ------------------------------------------------------------------ packet */

/** Who plays a character: owner, sub (a lone player's second), name, look, player colour. */
export type CastRow = [owner: number, sub: number, name: string, look: Look, color: string];
/** A character: x, y (top-left, tiles x Q), speed (tiles/s x VQ), flags. */
export type CharRow = [x: number, y: number, vx: number, flags: number];
/** An effect: number, kind letter, then its fields. */
export type EventRow = (number | string)[];
export type HintRow = [target: HintTarget, kind: HintInfo['kind'], x: number, y: number, level: number];
/** Last stage: time (ms), gems, gem total, flags. */
export type ScoreRow = [time: number, gems: number, gemTotal: number, flags: number];

/** The stage being drawn (the Host's current World). */
export interface StageRow {
  /** Stage number on the Host (a restart is a new stage). */
  n: number;
  /** Level index of the World. */
  l: number;
  so: boolean;
  /** Solo: which of the two characters is steered. */
  st: number;
  cs: CastRow[];
  ch: CharRow[];
  /** Boxes as flat (x, y, pushers). */
  bx: number[];
  /** Lift tops. */
  lf: number[];
  /** Gems taken, plates down, levers on, checkpoints lit: one '0'/'1' each. */
  gm: string;
  pl: string;
  lv: string;
  cp: string;
  /** Channels on (bit per channel). */
  ac: number;
  /** Door openness per door channel, in map order. */
  dr: number[];
  /** Pool cells covered by a helper plank. */
  as: number[];
}

/** One published state. Keys are short on purpose: it goes out about 16 times a second. */
export interface WarnaMirror {
  v: 1;
  /** Host session (a new one starts the far-away screen over). */
  e: number;
  /** Server ms the state was made. */
  t: number;
  ph: Phase;
  ps: PickStep;
  wd: BiomeId;
  /** Level index highlighted in the picker, and of the current stage. */
  pk: number;
  lvl: number;
  /** Best stars per level index: '-' not finished, else 0..3. */
  pr: string;
  lim: boolean;
  /** Host name. */
  hn: string;
  hold: boolean;
  /** Stage clock and the wait before the next level starts by itself (ms). */
  pt: number;
  nl: number;
  tip: boolean;
  hi: HintRow | null;
  /** Restart vote: votes, needed. */
  vo: [number, number] | null;
  sc: ScoreRow | null;
  sg: StageRow | null;
  /** Recent effect events, oldest first, and the newest event number. */
  ev: EventRow[];
  en: number;
}

/** Everything the Host knows that the far-away screen draws. */
export interface MirrorSource {
  match: WarnaMatch;
  /** Server time the state was made (game.now()). */
  server: number;
  /** Number of the stage the match's World belongs to. */
  serial: number;
  host: string;
  /** The Host's screen is paused. */
  held: boolean;
  /** The stage tip still shows. */
  tip: boolean;
  look: (key: number) => CharLook;
  /** Player colour of a person. */
  color: (owner: number) => string;
}

const q = (v: number): number => Math.round(v * Q);
const bits = (list: readonly boolean[]): string => list.map((b) => (b ? '1' : '0')).join('');

/** Door channels of a level in the order a World lists them (first door cell in map order). */
const doorCache = new Map<number, number[]>();
export function doorChannels(lv: Level): number[] {
  let list = doorCache.get(lv.index);
  if (list) return list;
  list = [];
  for (let i = 0; i < lv.cells.length; i++) {
    const ch = lv.meta[i]!;
    if (lv.cells[i] === Cell.Door && !list.includes(ch)) list.push(ch);
  }
  doorCache.set(lv.index, list);
  return list;
}

function progressCode(p: Progress): string {
  return LEVELS.map((lv) => {
    const s = p[lv.id];
    return s === undefined ? '-' : String(Math.max(0, Math.min(3, Math.floor(s))));
  }).join('');
}

function stageRow(w: World, src: MirrorSource): StageRow {
  const m = src.match;
  let ac = 0;
  for (const [ch, on] of w.active) if (on && ch >= 0 && ch < 4) ac |= 1 << ch;
  const bx: number[] = [];
  for (const b of w.boxes) bx.push(q(b.x), q(b.y), b.pushers);
  return {
    n: src.serial,
    l: w.level.index,
    so: m.solo,
    st: m.steer,
    cs: w.chars.map((c) => {
      const look = src.look(c.key);
      return [c.owner, c.sub, look.name.slice(0, NAME_MAX), look.look, src.color(c.owner)];
    }),
    ch: w.chars.map((c) => [
      q(c.x),
      q(c.y),
      Math.round(c.vx * VQ),
      (c.facing < 0 ? F_LEFT : 0) |
        (c.grounded ? F_GROUND : 0) |
        (c.inX !== 0 ? F_MOVE : 0) |
        (c.active ? F_ACTIVE : 0) |
        (c.dead ? F_DEAD : 0) |
        (c.inExit ? F_EXIT : 0),
    ]),
    bx,
    lf: w.lifts.map((l) => q(l.y)),
    gm: bits(w.gems.map((g) => g.taken)),
    pl: bits(w.plateOn),
    lv: bits(w.leverOn),
    cp: bits(w.checkpointLit),
    ac,
    dr: doorChannels(w.level).map((ch) => Math.round((w.doorShown.get(ch) ?? 0) * DQ)),
    as: [...w.assist].sort((a, b) => a - b),
  };
}

/** Packs one state (pure). */
export function toMirror(src: MirrorSource, ev: EventRow[], en: number, epoch: number): WarnaMirror {
  const m = src.match;
  const s = m.lastScore();
  const h = m.currentHint();
  const color = (owner: number): string => {
    const c = src.color(owner);
    return COLOR_RE.test(c) ? c : '#FFFFFF';
  };
  return {
    v: 1,
    e: epoch,
    t: Math.round(src.server),
    ph: m.phase,
    ps: m.pickStep,
    wd: m.world,
    pk: m.pick,
    lvl: m.level.index,
    pr: progressCode(m.progress),
    lim: m.limited,
    hn: src.host.slice(0, NAME_MAX),
    hold: src.held,
    // Clocks show whole seconds rounded down (the wait: up), so ms are cut the same way.
    pt: Math.floor(m.playT * 1000),
    nl: Math.ceil(m.nextLeft() * 1000),
    tip: src.tip,
    hi: h ? [h.target, h.kind, q(h.x), q(h.y), h.level] : null,
    vo: m.phase === 'play' && m.voteLeft > 0 ? [m.votes.size, m.voteNeed()] : null,
    sc: s
      ? [
          Math.floor(s.time * 1000),
          s.gems,
          s.gemTotal,
          (s.starGems ? S_GEMS : 0) | (s.starTime ? S_TIME : 0) | (s.skipped ? S_SKIP : 0),
        ]
      : null,
    sg: m.sim ? stageRow(m.sim, { ...src, color }) : null,
    ev,
    en,
  };
}

function eventRow(e: FxEvent, n: number): EventRow {
  switch (e.type) {
    case 'jump':
      return [n, 'j', e.key];
    case 'land':
      return [n, 'l', e.key, e.hard ? 1 : 0];
    case 'die':
      return [n, 'd', e.key, q(e.x), q(e.y)];
    case 'respawn':
      return [n, 'r', e.key];
    case 'gem':
      return [n, 'g', e.key, e.gem];
    case 'checkpoint':
      return [n, 'k', e.key, e.x, e.y];
    case 'bounce':
      return [n, 'b', e.key, q(e.x), q(e.y)];
    case 'assist':
      return [n, 'a', e.y, e.x0, e.x1];
    case 'clear':
      return [n, 'c'];
    case 'ping':
      return [n, 'p', e.key];
    case 'restart':
      return [n, 'R'];
    case 'skip':
      return [n, 'S'];
  }
}

/* ------------------------------------------------------------------ Host side */

/** The Host's bookkeeping for the mirror: the numbered effect events of the current stage. */
export class MirrorFeed {
  /** Recent events with the server time they were first sent (null: not yet). */
  private events: { row: EventRow; at: number | null }[] = [];
  private seq = 0;

  constructor(readonly epoch: number = Math.floor(Math.random() * 1_000_000_000)) {}

  /** Remember an effect the far-away screen should replay. */
  note(e: FxEvent): void {
    this.events.push({ row: eventRow(e, ++this.seq), at: null });
    if (this.events.length > EVENTS_KEPT) this.events.shift();
  }

  /** A new stage: the old stage's effects are not replayed on it. */
  newStage(): void {
    this.events = [];
  }

  /** The next packet. */
  pack(src: MirrorSource): WarnaMirror {
    for (const e of this.events) e.at ??= src.server;
    this.events = this.events.filter((e) => e.at !== null && src.server - e.at <= EVENT_KEEP_MS);
    return toMirror(
      src,
      this.events.map((e) => e.row),
      this.seq,
      this.epoch,
    );
  }
}

/* ------------------------------------------------------------------ validation */

export interface MirrorChar {
  owner: number;
  sub: 0 | 1;
  name: string;
  look: Look;
  color: string;
  x: number;
  y: number;
  vx: number;
  facing: 1 | -1;
  grounded: boolean;
  /** The stick is pushed (the effort face). */
  moving: boolean;
  active: boolean;
  dead: boolean;
  inExit: boolean;
}

export interface MirrorStage {
  serial: number;
  level: Level;
  solo: boolean;
  steer: 0 | 1;
  chars: MirrorChar[];
  boxes: { x: number; y: number; pushers: number }[];
  lifts: number[];
  gems: boolean[];
  plates: boolean[];
  levers: boolean[];
  checkpoints: boolean[];
  /** Channels on (bit per channel). */
  active: number;
  /** Door openness 0..1 per `doorChannels(level)`. */
  doors: number[];
  assist: number[];
}

export interface MirrorHint {
  target: HintTarget;
  kind: HintInfo['kind'];
  x: number;
  y: number;
  level: 1 | 2;
}

export interface MirrorEvent {
  n: number;
  e: FxEvent;
}

/** A validated, decoded state. */
export interface MirrorState {
  epoch: number;
  t: number;
  phase: Phase;
  pickStep: PickStep;
  world: BiomeId;
  pick: number;
  level: Level;
  progress: Progress;
  limited: boolean;
  host: string;
  hold: boolean;
  /** Seconds. */
  playT: number;
  nextLeft: number;
  tip: boolean;
  hint: MirrorHint | null;
  vote: { count: number; need: number } | null;
  score: ScoreLine | null;
  stage: MirrorStage | null;
  events: MirrorEvent[];
  eventTop: number;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isNat = (v: unknown): v is number => isInt(v) && v >= 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v);
const inX = (v: unknown): v is number => isInt(v) && v >= -POS_PAD * Q && v <= (COLS + POS_PAD) * Q;
const inY = (v: unknown): v is number => isInt(v) && v >= -POS_PAD * Q && v <= (ROWS + POS_PAD) * Q;

function parseList<T>(v: unknown, max: number, item: (x: unknown) => T | null): T[] | null {
  if (!Array.isArray(v) || v.length > max) return null;
  const out: T[] = [];
  for (const x of v) {
    const parsed = item(x);
    if (parsed === null) return null;
    out.push(parsed);
  }
  return out;
}

function parseBits(v: unknown, length: number): boolean[] | null {
  if (typeof v !== 'string' || v.length !== length || !BITS_RE.test(v)) return null;
  return [...v].map((c) => c === '1');
}

function parseProgress(v: unknown): Progress | null {
  if (typeof v !== 'string' || v.length !== LEVELS.length || !PROGRESS_RE.test(v)) return null;
  const out: Progress = {};
  LEVELS.forEach((lv, i) => {
    const c = v[i]!;
    if (c !== '-') out[lv.id] = Number(c);
  });
  return out;
}

function parseHint(v: unknown): MirrorHint | null {
  if (!Array.isArray(v) || v.length !== 5) return null;
  const [target, kind, x, y, level] = v as unknown[];
  if (!oneOf(TARGETS, target) || !oneOf(KINDS, kind) || !inX(x) || !inY(y)) return null;
  if (level !== 1 && level !== 2) return null;
  return { target, kind, x: x / Q, y: y / Q, level };
}

function parseScore(v: unknown): ScoreLine | null {
  if (!Array.isArray(v) || v.length !== 4) return null;
  const [time, gems, total, flags] = v as unknown[];
  if (!isNat(time) || time > PLAY_MAX_MS || !isNat(gems) || !isNat(total) || gems > total || total > 999)
    return null;
  if (!isNat(flags) || flags > 7) return null;
  return {
    time: time / 1000,
    gems,
    gemTotal: total,
    starGems: (flags & S_GEMS) !== 0,
    starTime: (flags & S_TIME) !== 0,
    skipped: (flags & S_SKIP) !== 0,
  };
}

function parseCast(v: unknown): Pick<MirrorChar, 'owner' | 'sub' | 'name' | 'look' | 'color'> | null {
  if (!Array.isArray(v) || v.length !== 5) return null;
  const [owner, sub, name, rawLook, color] = v as unknown[];
  if (!isInt(owner) || (sub !== 0 && sub !== 1) || !isText(name, NAME_MAX)) return null;
  if (typeof color !== 'string' || !COLOR_RE.test(color)) return null;
  const look = parseLook(rawLook);
  return look ? { owner, sub, name, look, color } : null;
}

function parseChar(v: unknown): Omit<MirrorChar, 'owner' | 'sub' | 'name' | 'look' | 'color'> | null {
  if (!Array.isArray(v) || v.length !== 4) return null;
  const [x, y, vx, flags] = v as unknown[];
  if (!inX(x) || !inY(y) || !isInt(vx) || Math.abs(vx) > 100 * VQ || !isNat(flags) || flags > F_ALL)
    return null;
  return {
    x: x / Q,
    y: y / Q,
    vx: vx / VQ,
    facing: flags & F_LEFT ? -1 : 1,
    grounded: (flags & F_GROUND) !== 0,
    moving: (flags & F_MOVE) !== 0,
    active: (flags & F_ACTIVE) !== 0,
    dead: (flags & F_DEAD) !== 0,
    inExit: (flags & F_EXIT) !== 0,
  };
}

function parseStage(v: unknown): MirrorStage | null {
  if (!isObj(v)) return null;
  const { n, l, so, st } = v;
  if (!isNat(n) || !isNat(l) || !isBool(so) || (st !== 0 && st !== 1)) return null;
  const level = LEVELS[l];
  if (!level) return null;
  const cast = parseList(v.cs, MAX_CHARS, parseCast);
  const states = parseList(v.ch, MAX_CHARS, parseChar);
  if (!cast || !states || cast.length === 0 || states.length !== cast.length) return null;
  const chars = cast.map((c, i) => ({ ...c, ...states[i]! }));
  const bx = v.bx;
  if (!Array.isArray(bx) || bx.length !== level.boxes.length * 3) return null;
  const boxes: MirrorStage['boxes'] = [];
  for (let i = 0; i < bx.length; i += 3) {
    const [x, y, pushers] = [bx[i], bx[i + 1], bx[i + 2]];
    if (!inX(x) || !inY(y) || !isNat(pushers) || pushers > MAX_CHARS) return null;
    boxes.push({ x: x / Q, y: y / Q, pushers });
  }
  const lifts = parseList(v.lf, level.lifts.length, (x) => (inY(x) ? x / Q : null));
  if (!lifts || lifts.length !== level.lifts.length) return null;
  const gems = parseBits(v.gm, level.gems.length);
  const plates = parseBits(v.pl, level.plates.length);
  const levers = parseBits(v.lv, level.levers.length);
  const checkpoints = parseBits(v.cp, level.checkpoints.length);
  if (!gems || !plates || !levers || !checkpoints) return null;
  if (!isNat(v.ac) || v.ac > 15) return null;
  const channels = doorChannels(level);
  const doors = parseList(v.dr, channels.length, (x) => (isNat(x) && x <= DQ ? x / DQ : null));
  if (!doors || doors.length !== channels.length) return null;
  const assist = parseList(v.as, COLS * ROWS, (x) => (isNat(x) && x < COLS * ROWS ? x : null));
  if (!assist) return null;
  return {
    serial: n,
    level,
    solo: so,
    steer: st,
    chars,
    boxes,
    lifts,
    gems,
    plates,
    levers,
    checkpoints,
    active: v.ac,
    doors,
    assist,
  };
}

function parseEvent(v: unknown): MirrorEvent | null {
  if (!Array.isArray(v) || v.length < 2) return null;
  const row = v as unknown[];
  const [n, kind, a, b, c] = row;
  if (!isNat(n)) return null;
  const key = (x: unknown): x is number => isNat(x) && x < MAX_CHARS;
  const len = (k: number): boolean => row.length === k;
  let e: FxEvent | null = null;
  switch (kind) {
    case 'j':
      if (len(3) && key(a)) e = { type: 'jump', key: a };
      break;
    case 'l':
      if (len(4) && key(a) && (b === 0 || b === 1)) e = { type: 'land', key: a, hard: b === 1 };
      break;
    case 'd':
      if (len(5) && key(a) && inX(b) && inY(c)) e = { type: 'die', key: a, x: b / Q, y: c / Q };
      break;
    case 'r':
      if (len(3) && key(a)) e = { type: 'respawn', key: a };
      break;
    case 'g':
      if (len(4) && key(a) && isNat(b) && b < 999) e = { type: 'gem', key: a, gem: b };
      break;
    case 'k':
      if (len(5) && key(a) && isNat(b) && b < COLS && isNat(c) && c < ROWS)
        e = { type: 'checkpoint', key: a, x: b, y: c };
      break;
    case 'b':
      if (len(5) && key(a) && inX(b) && inY(c)) e = { type: 'bounce', key: a, x: b / Q, y: c / Q };
      break;
    case 'a': {
      const x1 = row[4];
      if (len(5) && isNat(a) && a < ROWS && isNat(b) && isNat(x1) && b <= x1 && x1 < COLS)
        e = { type: 'assist', y: a, x0: b, x1 };
      break;
    }
    case 'c':
      if (len(2)) e = { type: 'clear' };
      break;
    case 'p':
      if (len(3) && key(a)) e = { type: 'ping', key: a };
      break;
    case 'R':
      if (len(2)) e = { type: 'restart' };
      break;
    case 'S':
      if (len(2)) e = { type: 'skip' };
      break;
    default:
      break;
  }
  return e ? { n, e } : null;
}

/** Validates and decodes a published state from the network; null if anything is off. */
export function applyMirror(json: unknown): MirrorState | null {
  if (!isObj(json) || json.v !== 1) return null;
  const s = json;
  if (!isNat(s.e) || !isNum(s.t) || !oneOf(PHASES, s.ph) || !oneOf(STEPS, s.ps) || !oneOf(BIOME_IDS, s.wd))
    return null;
  if (!isNat(s.pk) || !isNat(s.lvl)) return null;
  const level = LEVELS[s.lvl];
  if (!level || s.pk >= LEVELS.length) return null;
  const progress = parseProgress(s.pr);
  if (!progress || !isBool(s.lim) || !isText(s.hn, NAME_MAX) || !isBool(s.hold) || !isBool(s.tip))
    return null;
  if (!isNat(s.pt) || s.pt > PLAY_MAX_MS || !isNat(s.nl) || s.nl > NEXT_MAX_MS) return null;
  const hint = s.hi === null ? null : parseHint(s.hi);
  if (s.hi !== null && !hint) return null;
  let vote: MirrorState['vote'] = null;
  if (s.vo !== null) {
    if (!Array.isArray(s.vo) || s.vo.length !== 2) return null;
    const [count, need] = s.vo as unknown[];
    if (!isNat(count) || !isNat(need) || count > MAX_CHARS || need > MAX_CHARS) return null;
    vote = { count, need };
  }
  const score = s.sc === null ? null : parseScore(s.sc);
  if (s.sc !== null && !score) return null;
  const stage = s.sg === null ? null : parseStage(s.sg);
  if (s.sg !== null && !stage) return null;
  const events = parseList(s.ev, EVENTS_KEPT * 2, parseEvent);
  if (!events || !isNat(s.en)) return null;
  return {
    epoch: s.e,
    t: s.t,
    phase: s.ph,
    pickStep: s.ps,
    world: s.wd,
    pick: s.pk,
    level,
    progress,
    limited: s.lim,
    host: s.hn,
    hold: s.hold,
    playT: s.pt / 1000,
    nextLeft: s.nl / 1000,
    tip: s.tip,
    hint,
    vote,
    score,
    stage,
    events,
    eventTop: s.en,
  };
}

/* ------------------------------------------------------------------ interpolation */

const BUFFER = 8;
/** A character that moved further than this between two packets respawned: no gliding (tiles). */
export const SNAP_TILES = 2.5;
/** Packets that differ in these are separate stretches: the stage snaps instead of blending. */
const stretchKey = (s: MirrorState): string =>
  `${s.epoch}|${s.stage?.serial ?? -1}|${s.phase}|${s.hold ? 1 : 0}`;
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

/** Two packets around the playback point, and how far between them it is. */
export interface Span {
  /** The packet at or before the playback point: discrete state (flags, switches, HUD). */
  a: MirrorState;
  b: MirrorState;
  k: number;
}

/**
 * The last few packets, played back a little behind server time by a `PlayoutClock`: the shortest
 * recent trip plus a buffer that follows the packet gap and jitter, eased so a route change never
 * makes the characters jump.
 */
export class MirrorTimeline {
  private readonly buf: MirrorState[] = [];
  private readonly clock = new PlayoutClock();

  get latest(): MirrorState | null {
    return this.buf[this.buf.length - 1] ?? null;
  }

  /** Shortest recent Host-to-here trip in ms (null before the first packet). */
  get lag(): number | null {
    return this.clock.lagMs;
  }

  /** How far behind server time the stage was last drawn (ms), null before the first packet. */
  get behind(): number | null {
    return this.clock.behindMs;
  }

  /**
   * Adds a packet that arrived at server time `now`. True when it starts a new stretch (first
   * packet, new stage, new phase, pause, Host restarted): draw it right away.
   */
  push(s: MirrorState, now: number): boolean {
    this.clock.observe(s.t, now);
    const last = this.latest;
    const snap = !last || s.t <= last.t || stretchKey(s) !== stretchKey(last);
    if (snap) this.buf.length = 0;
    this.buf.push(s);
    if (this.buf.length > BUFFER) this.buf.shift();
    return snap;
  }

  /** Server time of the Host state shown now. */
  playhead(now: number): number {
    return this.clock.drawAt(now);
  }

  sample(now: number): Span | null {
    const buf = this.buf;
    const first = buf[0];
    const last = buf[buf.length - 1];
    if (!first || !last) return null;
    const at = this.playhead(now);
    if (at <= first.t) return { a: first, b: first, k: 0 };
    if (at >= last.t) return { a: last, b: last, k: 0 };
    for (let i = 0; i < buf.length - 1; i++) {
      const b = buf[i + 1]!;
      if (at > b.t) continue;
      const a = buf[i]!;
      return { a, b, k: (at - a.t) / (b.t - a.t) };
    }
    return { a: last, b: last, k: 0 };
  }
}

/** Where a character is drawn between packets: glides only while alive in both and close. */
export function charAt(a: MirrorChar, b: MirrorChar | undefined, k: number): { x: number; y: number } {
  if (!b || a.dead || b.dead || Math.hypot(b.x - a.x, b.y - a.y) > SNAP_TILES) return { x: a.x, y: a.y };
  return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) };
}

/**
 * Moves a World built from the same level and cast to the playback point: everything that glides
 * (characters, boxes, lifts, doors) between `a` and `b`, the rest as in `a`. `b` must be the same
 * stage (or null).
 */
export function poseWorld(w: World, a: MirrorStage, b: MirrorStage | null, k: number): void {
  const nb = b && b.serial === a.serial && b.level === a.level ? b : null;
  w.chars.forEach((c, i) => {
    const ca = a.chars[i];
    if (!ca) return;
    const p = charAt(ca, nb?.chars[i], k);
    c.x = p.x;
    c.y = p.y;
    c.vx = ca.vx;
    c.facing = ca.facing;
    c.grounded = ca.grounded;
    c.inX = ca.moving ? ca.facing : 0;
    c.active = ca.active;
    c.dead = ca.dead;
    c.inExit = ca.inExit;
  });
  w.boxes.forEach((box, i) => {
    const ba = a.boxes[i];
    if (!ba) return;
    const bb = nb?.boxes[i];
    const glide = bb && Math.hypot(bb.x - ba.x, bb.y - ba.y) <= SNAP_TILES;
    box.x = glide ? lerp(ba.x, bb.x, k) : ba.x;
    box.y = glide ? lerp(ba.y, bb.y, k) : ba.y;
    box.pushers = ba.pushers;
  });
  w.lifts.forEach((l, i) => {
    const ya = a.lifts[i];
    if (ya === undefined) return;
    l.y = lerp(ya, nb?.lifts[i] ?? ya, k);
  });
  w.gems.forEach((g, i) => {
    g.taken = a.gems[i] ?? g.taken;
  });
  a.plates.forEach((on, i) => {
    w.plateOn[i] = on;
  });
  a.levers.forEach((on, i) => {
    w.leverOn[i] = on;
  });
  a.checkpoints.forEach((on, i) => {
    w.checkpointLit[i] = on;
  });
  for (const ch of w.active.keys()) w.active.set(ch, ch >= 0 && ch < 4 && (a.active & (1 << ch)) !== 0);
  doorChannels(a.level).forEach((ch, i) => {
    const da = a.doors[i] ?? 0;
    const shown = lerp(da, nb?.doors[i] ?? da, k);
    w.doorShown.set(ch, shown);
    w.doorOpen.set(ch, shown > 0.5);
  });
  if (w.assist.size !== a.assist.length || a.assist.some((i) => !w.assist.has(i))) {
    w.assist.clear();
    for (const i of a.assist) w.assist.add(i);
  }
}

/** How a far-away screen labels a character (the scene's look callback). */
export function castLook(stage: MirrorStage, key: number): CharLook | null {
  const c = stage.chars[key];
  if (!c) return null;
  return { name: c.name, look: c.look, idle: stage.solo && c.sub !== stage.steer };
}

/** The hint the Host shows, its path starting from the character nearest the group (as the Host). */
export function hintAt(h: MirrorHint, w: World): HintInfo {
  const live = w.chars.filter((c) => !c.dead && c.active);
  const cx = live.length ? live.reduce((n, c) => n + c.x, 0) / live.length : 2;
  const cy = live.length ? live.reduce((n, c) => n + c.y, 0) / live.length : 14;
  let from: { x: number; y: number } | null = null;
  let best = Number.POSITIVE_INFINITY;
  for (const c of live) {
    const p = { x: c.x + TUNE.charW / 2, y: c.y + TUNE.charH / 2 };
    const d = Math.hypot(p.x - cx, p.y - cy);
    if (d < best) {
      best = d;
      from = p;
    }
  }
  return { target: h.target, kind: h.kind, x: h.x, y: h.y, level: h.level, from };
}

/* ------------------------------------------------------------------ clocks */

/** The Host's stage clock and next-level wait at server time `now`, read from packet `s`. */
export function mirrorClocks(s: MirrorState, now: number): { playT: number; nextLeft: number } {
  const run = s.hold ? 0 : sinceStamp(s.t, now) / 1000;
  return {
    playT: s.phase === 'play' ? s.playT + run : s.playT,
    nextLeft: s.phase === 'next' ? Math.max(0, s.nextLeft - run) : s.nextLeft,
  };
}

/** Effect events in a packet that came after `seen`, oldest first. */
export function newEvents(s: MirrorState, seen: number): MirrorEvent[] {
  return s.events.filter((e) => e.n > seen);
}
