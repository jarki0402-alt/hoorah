/**
 * Long-distance play: the display state the Host's main screen publishes about 14 times a second,
 * and what a far-away main screen rebuilds from it. Pure (no DOM, no SDK).
 *
 * The floor raster (up to 336x189 cells) is far too big to send whole in every packet, so:
 * - every packet carries the owner changes since the previous packet as a numbered delta, and
 *   repeats the last few deltas, so one lost packet loses no land;
 * - every packet also carries a few bands of rows in full (run-length coded), cycling through the
 *   whole floor about every 2 s, and through all of it within a few packets after a far-away
 *   screen connects. Whatever a lost delta left wrong heals by itself on the next pass, so the
 *   far-away screen never asks for anything;
 * - heads and trails go in every packet (trails delta-coded, thinned out when very long).
 * Numbers are packed as base64 digits of 5 bits each (6th bit: more digits follow) inside JSON
 * strings, and every packet stays under `PACKET_MAX` characters of JSON.
 *
 * `MirrorFeed` (Host) keeps the numbering, `toMirror` packs, `applyMirror` validates untrusted
 * JSON, `MirrorGrid` (far-away screen) rebuilds the raster, `MirrorTimeline` interpolates heads a
 * little in the past (an adaptive delay, see `playout.ts`), `mirrorClocks` reads the countdown and
 * the round clock at server time (what the Host judges, not the delayed stage) and `mirrorHud`
 * rebuilds the HUD.
 */
import { type Look, parseLook } from '@hoorah/protocol';
import type { HudState, Overlay } from './hud';
import {
  MAX_SLOTS,
  type MatchEvent,
  type OutCause,
  type Phase,
  type Runner,
  type WilayahMatch,
} from './logic';
import { PlayoutClock, sinceStamp } from './playout';
import { formatClock, formatPct } from './strings';
import { wrapAngle } from './trail';

/** Publish interval while a far-away screen watches. */
export const MIRROR_MS = 70;
/** Hard ceiling of one packet (JSON characters); the shell's limit is about 7.5 KB. */
export const PACKET_MAX = 7000;
/** Rows per refresh band. */
export const BAND_ROWS = 4;
/** Deltas are repeated in every packet for this long (newest first, while they fit `DELTA_BUDGET`). */
const DELTA_KEEP_MS = 600;
export const DELTAS_KEPT = 8;
/** Effect events are repeated in every packet for this long. */
const EVENT_KEEP_MS = 1000;
export const EVENTS_KEPT = 12;
/** Characters for all trails together; longer trails are thinned out. */
const TRAIL_BUDGET = 2400;
/** Characters for the repeated deltas together. */
const DELTA_BUDGET = 2000;
/** In steady play the bands cycle through the floor in this many packets (about 1.8 s at 60 fps). */
const CYCLE_PACKETS = 22;
/** Position steps per raster cell. */
const Q = 8;
const ANGLE_Q = 100;

const PHASES: readonly Phase[] = ['countdown', 'play', 'over', 'done'];
const CAUSES: readonly OutCause[] = ['cut', 'self', 'crash', 'wiped'];
const NAME_MAX = 40;
const TEXT_MAX = 200;
const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const MAX_DIM = 512;
/** Longest countdown accepted from the network (ms). */
const GO_MAX_MS = 60_000;
/** One coded string longer than this is refused outright. */
const CODE_MAX = 16_000;

/* ------------------------------------------------------------------ digits */

const DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const DIGIT_VALUE = new Int8Array(128).fill(-1);
for (let i = 0; i < DIGITS.length; i++) DIGIT_VALUE[DIGITS.charCodeAt(i)] = i;

function putUint(out: string[], value: number): void {
  let rest = value;
  do {
    let d = rest % 32;
    rest = Math.floor(rest / 32);
    if (rest > 0) d += 32;
    out.push(DIGITS[d]!);
  } while (rest > 0);
}

const zig = (v: number): number => (v >= 0 ? v * 2 : -v * 2 - 1);
const unzig = (u: number): number => (u % 2 === 0 ? u / 2 : -(u + 1) / 2);

/** Reads numbers packed by `putUint`; -1 for anything malformed. */
class DigitReader {
  private pos = 0;

  constructor(private readonly s: string) {}

  get done(): boolean {
    return this.pos >= this.s.length;
  }

  uint(): number {
    let v = 0;
    let scale = 1;
    for (let k = 0; k < 7; k++) {
      if (this.pos >= this.s.length) return -1;
      const c = this.s.charCodeAt(this.pos++);
      const d = c < 128 ? DIGIT_VALUE[c]! : -1;
      if (d < 0) return -1;
      v += (d % 32) * scale;
      scale *= 32;
      if (d < 32) return v;
    }
    return -1;
  }
}

/* ------------------------------------------------------------------ raster coding */

/** Number of refresh bands of a floor with `rows` rows. */
export const bandCount = (rows: number): number => Math.ceil(rows / BAND_ROWS);

/**
 * Owner changes from `prev` to `cur` as (gap, length - 1, owner) runs; '' when nothing changed.
 * Brings `prev` up to date and adds the bands it touched to `touched`.
 */
export function encodeDiff(prev: Uint8Array, cur: Uint8Array, cols: number, touched: Set<number>): string {
  const out: string[] = [];
  const n = cur.length;
  let end = 0;
  let i = 0;
  while (i < n) {
    if (cur[i] === prev[i]) {
      i++;
      continue;
    }
    const v = cur[i]!;
    let j = i + 1;
    while (j < n && cur[j] === v && prev[j] !== v) j++;
    putUint(out, i - end);
    putUint(out, j - i - 1);
    putUint(out, v);
    const last = ((j - 1) / cols / BAND_ROWS) | 0;
    for (let b = (i / cols / BAND_ROWS) | 0; b <= last; b++) touched.add(b);
    prev.fill(v, i, j);
    end = j;
    i = j;
  }
  return out.join('');
}

/** Delta runs as flat (start, length, owner) triples, or null if malformed. */
function decodeDiff(code: string, size: number): number[] | null {
  const r = new DigitReader(code);
  const out: number[] = [];
  let at = 0;
  while (!r.done) {
    const gap = r.uint();
    const len = r.uint() + 1;
    const v = r.uint();
    if (gap < 0 || len < 1 || v < 0 || v > MAX_SLOTS) return null;
    const start = at + gap;
    if (start + len > size) return null;
    out.push(start, len, v);
    at = start + len;
  }
  return out;
}

/** One band of rows as (length - 1, owner) runs. */
export function encodeBand(owner: Uint8Array, cols: number, rows: number, band: number): string {
  const out: string[] = [];
  const from = band * BAND_ROWS * cols;
  const to = Math.min(rows, (band + 1) * BAND_ROWS) * cols;
  let i = from;
  while (i < to) {
    const v = owner[i]!;
    let j = i + 1;
    while (j < to && owner[j] === v) j++;
    putUint(out, j - i - 1);
    putUint(out, v);
    i = j;
  }
  return out.join('');
}

function decodeBand(code: string, cells: number): Uint8Array | null {
  const out = new Uint8Array(cells);
  const r = new DigitReader(code);
  let at = 0;
  while (!r.done) {
    const len = r.uint() + 1;
    const v = r.uint();
    if (len < 1 || v < 0 || v > MAX_SLOTS || at + len > cells) return null;
    out.fill(v, at, at + len);
    at += len;
  }
  return at === cells ? out : null;
}

/* ------------------------------------------------------------------ trail coding */

interface TrailLike {
  readonly len: number;
  readonly xs: ArrayLike<number>;
  readonly ys: ArrayLike<number>;
}

const quant = (v: number): number => Math.max(0, Math.round(v * Q));

/** Trail points, every `stride`-th one plus the last: first absolute, then steps. */
function encodeTrail(tr: TrailLike, stride: number): string {
  if (tr.len === 0) return '';
  const out: string[] = [];
  let px = quant(tr.xs[0]!);
  let py = quant(tr.ys[0]!);
  putUint(out, px);
  putUint(out, py);
  const last = tr.len - 1;
  for (let k = stride; k < last + stride; k += stride) {
    const at = Math.min(k, last);
    const x = quant(tr.xs[at]!);
    const y = quant(tr.ys[at]!);
    putUint(out, zig(x - px));
    putUint(out, zig(y - py));
    px = x;
    py = y;
  }
  return out.join('');
}

function decodeTrail(code: string, cols: number, rows: number): MirrorTrail | null {
  const xs: number[] = [];
  const ys: number[] = [];
  if (code === '') return { len: 0, xs, ys };
  const r = new DigitReader(code);
  let x = r.uint();
  let y = r.uint();
  const maxX = cols * Q;
  const maxY = rows * Q;
  for (;;) {
    if (x < 0 || y < 0 || x > maxX || y > maxY) return null;
    xs.push(x / Q);
    ys.push(y / Q);
    if (r.done) break;
    const dx = r.uint();
    const dy = r.uint();
    if (dx < 0 || dy < 0) return null;
    x += unzig(dx);
    y += unzig(dy);
  }
  return { len: xs.length, xs, ys };
}

/** All trails within `TRAIL_BUDGET`, thinning every trail alike when they are too long. */
function packTrails(runners: readonly Runner[]): string[] {
  let longest = 0;
  for (const r of runners) if (r.alive) longest = Math.max(longest, r.trail.len);
  for (let stride = 1; ; stride *= 2) {
    const out = runners.map((r) => (r.alive ? encodeTrail(r.trail, stride) : ''));
    let total = 0;
    for (const s of out) total += s.length;
    if (total <= TRAIL_BUDGET || stride >= longest) return out;
  }
}

/* ------------------------------------------------------------------ wire shapes */

/** Runner row: id, owner value, name, look, colour, x and y (1/8 cells), heading (1/100 rad), flags, cells, rank, respawn s. */
export type RunnerRow = [
  number,
  number,
  string,
  Look,
  string,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

const F_ALIVE = 1;
const F_SHIELD = 2;
const F_HOME = 4;
const F_AWAY = 8;

/** Effect events: capture (gain in 1/10000 of the floor), knock-out (by -1: nobody), respawn. */
export type EventRow =
  | [number, 'c', number, number, number, number]
  | [number, 'o', number, number, OutCause, number, number]
  | [number, 's', number, number, number];

/** Overlay: none, countdown value, go, warning, time up (title, sub, winner ids). */
export type OverlayRow = ['n'] | ['c', number] | ['g'] | ['w'] | ['u', string, string, number[]];

/** Compact wire shape (short keys: it crosses the network about 14 times a second). */
export interface WilayahMirror {
  v: 1;
  /** The Host's match (a new number when the Host starts again). */
  e: number;
  /** Server ms the state was made. */
  t: number;
  /** Raster columns, rows, cells per unit. */
  c: number;
  rw: number;
  u: number;
  ph: Phase;
  /** Round clock ms left; ms until the round starts (countdown only, else 0). */
  left: number;
  go: number;
  urg: boolean;
  hint: boolean;
  hold: boolean;
  ov: OverlayRow;
  /** Runners in standings order, and their trails in the same order. */
  pl: RunnerRow[];
  tr: string[];
  /** Newest delta number: the bands below show the floor with every delta up to it. */
  n: number;
  /** Recent deltas, oldest first: number, runs. */
  d: [number, string][];
  /** Full bands: index, runs. */
  b: [number, string][];
  /** Recent effect events, oldest first, and the newest event number. */
  ev: EventRow[];
  en: number;
}

/** Everything the Host knows that the far-away screen draws. */
export interface MirrorSource {
  match: WilayahMatch;
  /** Match clock time (protection and respawn timers run on it). */
  t: number;
  /** Server time the state was made (game.now()). */
  server: number;
  overlay: Overlay;
  hint: boolean;
  /** People whose dropped phone the computer covers. */
  away: ReadonlySet<number>;
  /** The Host's screen is paused. */
  held: boolean;
}

/** The floor and effect part of a packet, chosen by `MirrorFeed`. */
export interface FeedPart {
  n: number;
  d: [number, string][];
  b: [number, string][];
  ev: EventRow[];
  en: number;
}

const q = (v: number): number => Math.round(v * Q);

function overlayRow(o: Overlay): OverlayRow {
  switch (o.kind) {
    case 'none':
      return ['n'];
    case 'count':
      return ['c', o.value];
    case 'go':
      return ['g'];
    case 'warning':
      return ['w'];
    case 'timeUp':
      return ['u', o.title, o.sub, o.winners.map((w) => w.id)];
  }
}

/** Packs one packet (pure). */
export function toMirror(src: MirrorSource, part: FeedPart, epoch: number): WilayahMirror {
  const m = src.match;
  const t = src.t;
  const standings = m.standings();
  const runners = standings.map((s) => s.runner);
  const pl: RunnerRow[] = standings.map(({ runner: r, cells, rank }) => {
    const flags =
      (r.alive ? F_ALIVE : 0) |
      (m.isProtected(r, t) ? F_SHIELD : 0) |
      (r.alive && m.isHome(r) ? F_HOME : 0) |
      (src.away.has(r.id) ? F_AWAY : 0);
    const respawn = r.alive ? 0 : Math.max(1, Math.ceil((r.respawnAt - t) / 1000));
    return [
      r.id,
      r.v,
      r.name,
      r.look,
      r.color,
      q(r.x),
      q(r.y),
      Math.round(r.angle * ANGLE_Q),
      flags,
      cells,
      rank,
      respawn,
    ];
  });
  return {
    v: 1,
    e: epoch,
    t: Math.round(src.server),
    c: m.field.cols,
    rw: m.field.rows,
    u: m.geo.unit,
    ph: m.phase,
    left: Math.round(m.timeLeft(t)),
    go: m.phase === 'countdown' ? Math.max(0, Math.round(m.goAt - t)) : 0,
    urg: m.phase === 'play' && m.timeLeft(t) <= m.tuning.warnMs,
    hint: src.hint,
    hold: src.held,
    ov: overlayRow(src.overlay),
    pl,
    tr: packTrails(runners),
    n: part.n,
    d: part.d,
    b: part.b,
    ev: part.ev,
    en: part.en,
  };
}

/* ------------------------------------------------------------------ Host side */

/**
 * The Host's bookkeeping for the mirror: the floor as last published, the numbered deltas, the
 * band cycle and the recent effect events.
 */
export class MirrorFeed {
  private last: Uint8Array | null = null;
  private seq = 0;
  /** Recent deltas with the server time they were made. */
  private deltas: { n: number; code: string; at: number }[] = [];
  private cursor = 0;
  /** Bands still to send at full speed after a far-away screen connected. */
  private catchUp = 0;
  private resyncing = true;
  /** Bands a delta too big to ship touched: sent before the cycle continues. */
  private readonly urgent = new Set<number>();
  /** Recent events with the server time they were first sent (null: not yet). */
  private events: { row: EventRow; at: number | null }[] = [];
  private eventSeq = 0;

  constructor(readonly epoch: number = Math.floor(Math.random() * 1_000_000_000)) {}

  /** A far-away screen connected: send the whole floor again as fast as packets allow. */
  resync(): void {
    this.resyncing = true;
  }

  /** Remember an effect event the far-away screen should replay. */
  note(e: MatchEvent): void {
    const row = this.eventRow(e, this.eventSeq + 1);
    if (!row) return;
    this.eventSeq++;
    this.events.push({ row, at: null });
    if (this.events.length > EVENTS_KEPT) this.events.shift();
  }

  private eventRow(e: MatchEvent, n: number): EventRow | null {
    switch (e.type) {
      case 'capture':
        return [n, 'c', e.id, Math.round(e.gained * 10_000), q(e.x), q(e.y)];
      case 'out':
        return [n, 'o', e.id, e.by ?? -1, e.cause, q(e.x), q(e.y)];
      case 'spawn':
        return [n, 's', e.id, q(e.x), q(e.y)];
      default:
        return null;
    }
  }

  /** The next packet. */
  pack(src: MirrorSource): WilayahMirror {
    const f = src.match.field;
    const bands = bandCount(f.rows);
    if (!this.last || this.last.length !== f.size) {
      this.last = new Uint8Array(f.size);
      this.deltas = [];
      this.urgent.clear();
      this.cursor = 0;
      this.resyncing = true;
    }
    if (this.resyncing) {
      this.resyncing = false;
      this.catchUp = bands;
    }
    const touched = new Set<number>();
    const code = encodeDiff(this.last, f.owner, f.cols, touched);
    if (code !== '') {
      this.deltas.push({ n: ++this.seq, code, at: src.server });
      if (this.deltas.length > DELTAS_KEPT) this.deltas.shift();
    }
    const d: [number, string][] = [];
    let used = 0;
    for (let k = this.deltas.length - 1; k >= 0; k--) {
      const delta = this.deltas[k]!;
      if (src.server - delta.at > DELTA_KEEP_MS || used + delta.code.length > DELTA_BUDGET) break;
      used += delta.code.length;
      d.unshift([delta.n, delta.code]);
    }
    // A delta too big to ship: send the bands it touched instead.
    if (code !== '' && d[d.length - 1]?.[0] !== this.seq) for (const b of touched) this.urgent.add(b);
    for (const e of this.events) e.at ??= src.server;
    this.events = this.events.filter((e) => e.at !== null && src.server - e.at <= EVENT_KEEP_MS);
    const grid: FeedPart = { n: this.seq, d, b: [], ev: this.events.map((e) => e.row), en: this.eventSeq };
    const packet = toMirror(src, grid, this.epoch);
    // Fill what room is left with bands: urgent ones first, then the cycle.
    let room = PACKET_MAX - JSON.stringify(packet).length;
    const steady = Math.ceil(bands / CYCLE_PACKETS);
    let sent = 0;
    const take = (b: number): boolean => {
      const runs = encodeBand(f.owner, f.cols, f.rows, b);
      const cost = runs.length + 12;
      if (cost > room) return false;
      room -= cost;
      grid.b.push([b, runs]);
      sent++;
      return true;
    };
    for (const b of [...this.urgent]) {
      if (!take(b)) break;
      this.urgent.delete(b);
    }
    for (let k = 0; k < bands; k++) {
      if (this.catchUp <= 0 && sent >= steady) break;
      const b = this.cursor;
      if (!grid.b.some((row) => row[0] === b) && !take(b)) {
        // It waits for a roomier packet, unless nothing fits at all (then it is skipped this pass).
        if (sent === 0) this.cursor = (b + 1) % bands;
        break;
      }
      this.cursor = (b + 1) % bands;
      this.catchUp = Math.max(0, this.catchUp - 1);
    }
    return packet;
  }
}

/* ------------------------------------------------------------------ validation */

export interface MirrorTrail {
  len: number;
  xs: number[];
  ys: number[];
}

export interface MirrorRunner {
  id: number;
  v: number;
  name: string;
  look: Look;
  color: string;
  x: number;
  y: number;
  angle: number;
  alive: boolean;
  shield: boolean;
  home: boolean;
  away: boolean;
  cells: number;
  rank: number;
  respawn: number | null;
  trail: MirrorTrail;
}

export type MirrorEvent =
  | { n: number; type: 'capture'; id: number; gained: number; x: number; y: number }
  | { n: number; type: 'out'; id: number; by: number | null; cause: OutCause; x: number; y: number }
  | { n: number; type: 'spawn'; id: number; x: number; y: number };

export type MirrorOverlay =
  | { kind: 'none' }
  | { kind: 'count'; value: number }
  | { kind: 'go' }
  | { kind: 'warning' }
  | { kind: 'timeUp'; title: string; sub: string; winners: number[] };

/** A validated, decoded packet. */
export interface MirrorState {
  epoch: number;
  t: number;
  cols: number;
  rows: number;
  unit: number;
  phase: Phase;
  left: number;
  /** Ms until the round starts (countdown only, else 0). */
  goIn: number;
  urgent: boolean;
  hint: boolean;
  hold: boolean;
  overlay: MirrorOverlay;
  runners: MirrorRunner[];
  seq: number;
  /** Delta runs as flat (start, length, owner) triples. */
  deltas: { n: number; runs: number[] }[];
  bands: { index: number; cells: Uint8Array }[];
  events: MirrorEvent[];
  /** Newest effect event number on the Host. */
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

function parseOverlay(v: unknown): MirrorOverlay | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const [kind, a, b, c] = v as unknown[];
  switch (kind) {
    case 'n':
      return { kind: 'none' };
    case 'g':
      return { kind: 'go' };
    case 'w':
      return { kind: 'warning' };
    case 'c':
      return isNat(a) && a <= 9 ? { kind: 'count', value: a } : null;
    case 'u': {
      const winners = parseList(c, MAX_SLOTS, (x) => (isInt(x) ? x : null));
      return isText(a, TEXT_MAX) && isText(b, TEXT_MAX) && winners
        ? { kind: 'timeUp', title: a, sub: b, winners }
        : null;
    }
    default:
      return null;
  }
}

function parseEvent(v: unknown, cols: number, rows: number): MirrorEvent | null {
  if (!Array.isArray(v)) return null;
  const row = v as unknown[];
  const n = row[0];
  const id = row[2];
  if (!isNat(n) || !isInt(id)) return null;
  const inside = (x: unknown, y: unknown): boolean => isNat(x) && isNat(y) && x <= cols * Q && y <= rows * Q;
  switch (row[1]) {
    case 'c': {
      const [, , , gain, x, y] = row;
      if (row.length !== 6 || !isNat(gain) || gain > 10_000 || !inside(x, y)) return null;
      return {
        n,
        type: 'capture',
        id,
        gained: (gain as number) / 10_000,
        x: (x as number) / Q,
        y: (y as number) / Q,
      };
    }
    case 'o': {
      const [, , , by, cause, x, y] = row;
      if (row.length !== 7 || !isInt(by) || !oneOf(CAUSES, cause) || !inside(x, y)) return null;
      return {
        n,
        type: 'out',
        id,
        by: by < 0 ? null : by,
        cause,
        x: (x as number) / Q,
        y: (y as number) / Q,
      };
    }
    case 's': {
      const [, , , x, y] = row;
      if (row.length !== 5 || !inside(x, y)) return null;
      return { n, type: 'spawn', id, x: (x as number) / Q, y: (y as number) / Q };
    }
    default:
      return null;
  }
}

function parseRunner(v: unknown, rawTrail: unknown, cols: number, rows: number): MirrorRunner | null {
  if (!Array.isArray(v) || v.length !== 12 || !isText(rawTrail, CODE_MAX)) return null;
  const [id, val, name, rawLook, color, x, y, angle, flags, cells, rank, respawn] = v as unknown[];
  if (!isInt(id) || !isInt(val) || val < 1 || val > MAX_SLOTS || !isText(name, NAME_MAX)) return null;
  if (typeof color !== 'string' || !COLOR_RE.test(color)) return null;
  if (!isNat(x) || !isNat(y) || x > cols * Q || y > rows * Q || !isInt(angle) || Math.abs(angle) > 700)
    return null;
  if (!isNat(flags) || flags > 15 || !isNat(cells) || cells > cols * rows || !isNat(rank) || !isNat(respawn))
    return null;
  const look = parseLook(rawLook);
  const trail = decodeTrail(rawTrail, cols, rows);
  if (!look || !trail) return null;
  const alive = (flags & F_ALIVE) !== 0;
  return {
    id,
    v: val,
    name,
    look,
    color,
    x: x / Q,
    y: y / Q,
    angle: angle / ANGLE_Q,
    alive,
    shield: (flags & F_SHIELD) !== 0,
    home: (flags & F_HOME) !== 0,
    away: (flags & F_AWAY) !== 0,
    cells,
    rank,
    respawn: alive ? null : respawn,
    trail,
  };
}

/** Validates and decodes a published state from the network; null if anything is off. */
export function applyMirror(json: unknown): MirrorState | null {
  if (!isObj(json) || json.v !== 1) return null;
  const j = json;
  if (!isNat(j.e) || !isNum(j.t) || !oneOf(PHASES, j.ph)) return null;
  const cols = j.c;
  const rows = j.rw;
  if (!isInt(cols) || !isInt(rows) || cols < 8 || rows < 8 || cols > MAX_DIM || rows > MAX_DIM) return null;
  if (!isInt(j.u) || j.u < 1 || j.u > 8 || !isNat(j.left) || !isNat(j.n) || !isNat(j.en)) return null;
  if (!isBool(j.urg) || !isBool(j.hint) || !isBool(j.hold)) return null;
  if (!isNat(j.go) || j.go > GO_MAX_MS) return null;
  const overlay = parseOverlay(j.ov);
  if (!overlay || !Array.isArray(j.pl) || !Array.isArray(j.tr) || j.pl.length !== j.tr.length) return null;
  const size = cols * rows;
  const trails = j.tr as unknown[];
  if (j.pl.length > MAX_SLOTS) return null;
  const runners: MirrorRunner[] = [];
  for (let k = 0; k < j.pl.length; k++) {
    const r = parseRunner(j.pl[k], trails[k], cols, rows);
    if (!r) return null;
    runners.push(r);
  }
  const deltas = parseList(j.d, DELTAS_KEPT, (x) => {
    if (!Array.isArray(x) || x.length !== 2 || !isNat(x[0]) || !isText(x[1], CODE_MAX)) return null;
    const runs = decodeDiff(x[1], size);
    return runs ? { n: x[0], runs } : null;
  });
  const total = bandCount(rows);
  const bands = parseList(j.b, total, (x) => {
    if (!Array.isArray(x) || x.length !== 2 || !isNat(x[0]) || x[0] >= total || !isText(x[1], CODE_MAX)) {
      return null;
    }
    const cells = (Math.min(rows, (x[0] + 1) * BAND_ROWS) - x[0] * BAND_ROWS) * cols;
    const decoded = decodeBand(x[1], cells);
    return decoded ? { index: x[0], cells: decoded } : null;
  });
  const events = parseList(j.ev, EVENTS_KEPT, (x) => parseEvent(x, cols, rows));
  if (!deltas || !bands || !events) return null;
  for (let k = 1; k < deltas.length; k++) if (deltas[k]!.n <= deltas[k - 1]!.n) return null;
  const seq = j.n;
  const eventTop = j.en;
  if (deltas.some((d) => d.n > seq) || events.some((e) => e.n > eventTop)) return null;
  return {
    epoch: j.e,
    t: j.t,
    cols,
    rows,
    unit: j.u,
    phase: j.ph,
    left: j.left,
    goIn: j.go,
    urgent: j.urg,
    hint: j.hint,
    hold: j.hold,
    overlay,
    runners,
    seq,
    deltas,
    bands,
    events,
    eventTop,
  };
}

/* ------------------------------------------------------------------ far-away raster */

/** Cells whose owner changed in one `MirrorGrid.apply`. */
export interface GridChanges {
  /** A new match or floor size: everything was rebuilt. */
  reset: boolean;
  /** Became someone's land (deltas). */
  fresh: number[];
  /** Became neutral (deltas). */
  cleared: number[];
  /** Corrected by a band (a delta was lost, or the first picture). */
  fixed: number[];
}

/** The floor as a far-away screen knows it: deltas in order, bands on top. */
export class MirrorGrid {
  epoch = -1;
  cols = 0;
  rows = 0;
  owner = new Uint8Array(0);
  /** Highest delta number applied (or skipped because a band already covered it). */
  have = -1;
  /** Deltas that never arrived (the bands healed them). */
  missed = 0;

  apply(s: MirrorState): GridChanges {
    const out: GridChanges = { reset: false, fresh: [], cleared: [], fixed: [] };
    if (s.epoch !== this.epoch || s.cols !== this.cols || s.rows !== this.rows) {
      this.epoch = s.epoch;
      this.cols = s.cols;
      this.rows = s.rows;
      this.owner = new Uint8Array(s.cols * s.rows);
      this.have = -1;
      out.reset = true;
    }
    const owner = this.owner;
    for (const d of s.deltas) {
      if (d.n <= this.have) continue;
      if (this.have >= 0 && d.n > this.have + 1) this.missed += d.n - this.have - 1;
      this.have = d.n;
      const runs = d.runs;
      for (let k = 0; k < runs.length; k += 3) {
        const start = runs[k]!;
        const end = start + runs[k + 1]!;
        const v = runs[k + 2]!;
        const list = v === 0 ? out.cleared : out.fresh;
        for (let i = start; i < end; i++) {
          if (owner[i] === v) continue;
          owner[i] = v;
          list.push(i);
        }
      }
    }
    if (this.have >= 0 && s.seq > this.have) this.missed += s.seq - this.have;
    // The bands show the floor at `seq`: an older delta arriving later must not undo them.
    this.have = Math.max(this.have, s.seq);
    for (const b of s.bands) {
      const from = b.index * BAND_ROWS * this.cols;
      const cells = b.cells;
      for (let k = 0; k < cells.length; k++) {
        const v = cells[k]!;
        if (owner[from + k] === v) continue;
        owner[from + k] = v;
        out.fixed.push(from + k);
      }
    }
    return out;
  }
}

/* ------------------------------------------------------------------ interpolation */

const BUFFER = 8;
/** A head that moved further than this between two packets was respawned: no gliding (cells). */
const JUMP_CELLS = 15;

/** Packets that differ in these are separate stretches: the stage snaps instead of blending. */
const stretchKey = (s: MirrorState): string => `${s.epoch}|${s.phase}|${s.hold ? 1 : 0}`;

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

/** Two packets around the playback point, and how far between them it is. */
export interface Span {
  /** The packet at or before the playback point: discrete state (trails, flags, HUD). */
  a: MirrorState;
  b: MirrorState;
  k: number;
}

/**
 * The last few packets, played back a little behind server time by a `PlayoutClock`: the shortest
 * recent trip plus a buffer that follows the packet gap and jitter, eased so a route change never
 * makes the heads jump.
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
   * packet, new phase, pause, Host restarted): draw it right away.
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

/** Where a runner's head is drawn. */
export interface Pose {
  x: number;
  y: number;
  angle: number;
}

/** A runner's head between packets `a` and `b` (glides only while it ran in both). */
export function poseAt(a: MirrorRunner, b: MirrorRunner | undefined, k: number, out: Pose): Pose {
  if (!b || !a.alive || !b.alive || Math.hypot(b.x - a.x, b.y - a.y) > JUMP_CELLS) {
    out.x = a.x;
    out.y = a.y;
    out.angle = a.angle;
    return out;
  }
  out.x = lerp(a.x, b.x, k);
  out.y = lerp(a.y, b.y, k);
  out.angle = a.angle + wrapAngle(b.angle - a.angle) * k;
  return out;
}

/* ------------------------------------------------------------------ HUD */

/** The Host's clocks at a moment in server time (what the Host judges right then). */
export interface Clocks {
  left: number;
  /** The countdown overlay as the Host shows it then; null: the packet's own overlay. */
  overlay: Overlay | null;
}

/**
 * The countdown and round clock at server time `now`, read from the newest packet `s` (not from
 * the delayed stage), so the far-away screen shows GO and the clock when the Host does. They
 * stand still while the Host is paused.
 */
export function mirrorClocks(s: MirrorState, now: number): Clocks {
  const run = s.hold ? 0 : sinceStamp(s.t, now);
  if (s.phase === 'play') return { left: Math.max(0, s.left - run), overlay: null };
  if (s.phase === 'countdown' && s.goIn > 0 && !s.hold) {
    const rest = s.goIn - run;
    if (rest > 0) return { left: s.left, overlay: { kind: 'count', value: Math.ceil(rest / 1000) } };
    return { left: Math.max(0, s.left + rest), overlay: { kind: 'go' } };
  }
  return { left: s.left, overlay: null };
}

/** The HUD the Host shows, rebuilt from a packet, with the countdown and clock from `clocks`. */
export function mirrorHud(s: MirrorState, clocks: Clocks): HudState {
  const size = s.cols * s.rows;
  const list = s.runners;
  const lead = Math.max(1, list[0]?.cells ?? 1);
  const sole = list.filter((r) => r.rank === 1).length === 1 && (list[0]?.cells ?? 0) > 0;
  const byId = new Map(list.map((r) => [r.id, r]));
  let overlay: Overlay;
  if (s.overlay.kind === 'timeUp') {
    const winners = s.overlay.winners
      .map((id) => byId.get(id))
      .filter((r): r is MirrorRunner => r !== undefined)
      .map((r) => ({ id: r.id, look: r.look, color: r.color }));
    overlay = { kind: 'timeUp', title: s.overlay.title, sub: s.overlay.sub, winners };
  } else overlay = s.overlay;
  return {
    live: true,
    timer: formatClock(clocks.left),
    urgent: s.urgent,
    rows: list.map((r, order) => ({
      id: r.id,
      name: r.name,
      look: r.look,
      color: r.color,
      pct: formatPct((r.cells * 100) / size),
      share: r.cells / lead,
      rank: r.rank,
      lead: sole && r.rank === 1,
      order,
      alive: r.alive,
      respawn: r.respawn,
      away: r.away,
    })),
    overlay: clocks.overlay ?? overlay,
    hint: s.hint,
  };
}

/** Effect events in a packet that came after `seen`, oldest first. */
export function newEvents(s: MirrorState, seen: number): MirrorEvent[] {
  return s.events.filter((e) => e.n > seen);
}
