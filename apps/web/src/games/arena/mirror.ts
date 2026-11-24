/**
 * Long-distance play: the display state the Host's main screen publishes about 16 times a second,
 * and how a far-away main screen reads it. Pure (no DOM, no SDK).
 *
 * Snake bodies can be thousands of points long and the seed pool holds hundreds of seeds, far too
 * much to send whole in every packet, so:
 * - every trail point has a match-wide number (`Snake.serial`) and never moves once laid. Every
 *   packet carries the newest `RECENT_POINTS` points of each body (about 0.7 s of boosting, so a
 *   few lost packets lose nothing); the far-away screen keeps every point it ever got and draws
 *   the body along them exactly like the Host (`pointAt`), from the head's distance travelled;
 * - bodies are also sent in bands of `BODY_BAND` points, cycling through every body about every
 *   2 s (and as fast as packets allow right after a far-away screen connects), so whatever a lost
 *   stretch left out heals by itself;
 * - seeds go as numbered changes (added, eaten by whom, faded), repeated for a while so one lost
 *   packet loses nothing, plus bands of `PELLET_BAND` slots in full on the same kind of cycle;
 * - heads, standings and the HUD go in every packet; effect events are numbered and repeated.
 * Numbers inside the coded strings are base64 digits of 5 bits each (6th bit: more digits
 * follow), and every packet stays under `PACKET_MAX` characters of JSON.
 *
 * `MirrorFeed` (Host) keeps the numbering, `toMirror` packs, `applyMirror` validates untrusted
 * JSON, `MirrorTimeline` plays packets back a little in the past (an adaptive delay, see
 * `playout.ts`), `mirrorClocks` reads the countdown and the round clock at server time and
 * `mirrorHud` rebuilds the HUD. The far-away screen's model of the stage lives in `remote.ts`.
 */
import { type Look, parseLook } from '@hoorah/protocol';
import { isCpu } from '../common/cpu';
import { GO_MS } from './effects';
import type { BoardRow, HudState, Overlay, PodiumPlace } from './hud';
import type { Rect } from './layout';
import {
  type ArenaEvent,
  type ArenaMatch,
  colorNumber,
  DEFAULT_TUNING,
  type KoCause,
  MAX_SNAKES,
  PELLET_AMBIENT,
  PELLET_FREE,
  type Phase,
  SEED_COLORS,
  type Snake,
  wrapAngle,
} from './logic';
import { PlayoutClock, sinceStamp } from './playout';
import { formatClock } from './strings';

/** Publish interval while a far-away screen watches. */
export const MIRROR_MS = 60;
/** Hard ceiling of one packet (JSON characters); the shell's limit is about 7.5 KB. */
export const PACKET_MAX = 5800;
/** Newest trail points of every body in every packet. */
export const RECENT_POINTS = 24;
/** Trail points per body band. */
export const BODY_BAND = 32;
/** Seed slots per seed band, and the slots there are. */
export const PELLET_BAND = 64;
export const PELLET_CAP = DEFAULT_TUNING.maxPellets;
/** Seed changes are repeated for this long (newest first, while they fit `DELTA_BUDGET`). */
const DELTA_KEEP_MS = 600;
export const DELTAS_KEPT = 10;
const DELTA_BUDGET = 1500;
/** Effect events are repeated in every packet for this long. */
const EVENT_KEEP_MS = 1000;
export const EVENTS_KEPT = 24;
/** In steady play the bands cycle in this many packets (about 1.8 s). */
const CYCLE_PACKETS = 30;
/** Characters of body bands per packet in steady play: very long bodies cycle more slowly. */
const BODY_STEADY = 1200;
/** Steps per world unit: trail points, heads, seeds. */
const TQ = 2;
const HQ = 4;
const ANGLE_Q = 100;
/** Gap and drawn length steps per unit of length; radius steps per world unit. */
const LEN_Q = 8;
const RADIUS_Q = 10;
const STEER_Q = 10;
/** Extra colours (beyond the seed colours) a match may use for dropped seeds. */
const PALETTE_MAX = 32;
/** Seconds of life left are sent in tenths. */
const LIFE_Q = 100;
const LIFE_MAX = 1200;
const VALUE_MAX = 12;

const PHASES: readonly Phase[] = ['intro', 'countdown', 'play', 'over', 'podium', 'done'];
const CAUSES: readonly KoCause[] = ['body', 'head', 'wall'];
const NAME_MAX = 40;
const TEXT_MAX = 200;
const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
/** Largest arena side accepted, and how far outside it a point may sit (world units). */
const MAX_DIM = 6000;
const OUTSIDE = 400;
const GO_MAX_MS = 60_000;
const ROUND_MAX_MS = 10 * 60_000;
/** One coded string longer than this is refused outright. */
const CODE_MAX = 16_000;
const SERIAL_MAX = 2 ** 40;
/** Snake flags. */
const F_ALIVE = 1;
const F_BOOST = 2;
const F_SAFE = 4;
const F_ONLINE = 8;

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
    for (let k = 0; k < 8; k++) {
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

  /** A signed number, or NaN when malformed. */
  int(): number {
    const u = this.uint();
    return u < 0 ? Number.NaN : unzig(u);
  }
}

/* ------------------------------------------------------------------ trail points */

/** Trail points a body is drawn along: number `top` first, then `top - 1`, ... */
export interface Points {
  top: number;
  xs: number[];
  ys: number[];
}

/** Trail points the body of `s` is drawn along right now (0 when it is not on the field). */
export function bodyDepth(s: Snake): number {
  if (!s.alive || s.trailCount === 0) return 0;
  return Math.min(s.trailCount, Math.ceil(s.bodyLen) + 2);
}

/** `count` trail points of `s` from number `top` down: first absolute, then steps (1/2 unit). */
export function encodePoints(s: Snake, top: number, count: number): string {
  if (count <= 0) return '';
  const out: string[] = [];
  const j0 = s.serial - top;
  let px = Math.round(s.px(j0) * TQ);
  let py = Math.round(s.py(j0) * TQ);
  putUint(out, zig(px));
  putUint(out, zig(py));
  for (let k = 1; k < count; k++) {
    const x = Math.round(s.px(j0 + k) * TQ);
    const y = Math.round(s.py(j0 + k) * TQ);
    putUint(out, zig(x - px));
    putUint(out, zig(y - py));
    px = x;
    py = y;
  }
  return out.join('');
}

function decodePoints(code: string, top: number, limit: number): Points | null {
  const xs: number[] = [];
  const ys: number[] = [];
  if (code === '') return { top, xs, ys };
  const r = new DigitReader(code);
  let x = r.int();
  let y = r.int();
  for (;;) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > limit || Math.abs(y) > limit) return null;
    xs.push(x / TQ);
    ys.push(y / TQ);
    if (r.done) break;
    if (xs.length > top + 1 || xs.length >= 4096) return null;
    x += r.int();
    y += r.int();
  }
  return { top, xs, ys };
}

/* ------------------------------------------------------------------ wire shapes */

/**
 * Snake row: id, name, look, colour, head x and y (1/4 unit), heading (1/100 rad), steer (1/10),
 * newest trail point number, gap to it and drawn length (1/8 unit of length), radius (1/10 unit),
 * flags, shown length, knock-outs, seconds until back.
 */
export type SnakeRow = [
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
  number,
  number,
  number,
  number,
  number,
];

/** Effect events: spawn (first: 1), knock-out (by null: nobody), removed, new leader, warning. */
export type EventRow =
  | [number, 's', number, number, number, number]
  | [number, 'k', number, number | null, KoCause, number, number, number]
  | [number, 'r', number]
  | [number, 'l', number]
  | [number, 'w'];

/** Podium place: id, rank, shown length, knock-outs. */
export type PlaceRow = [number, number, number, number];

/** Overlay: none, intro, count, go, warning, final seconds, time up, podium. */
export type OverlayRow =
  | ['n']
  | ['i']
  | ['c', number]
  | ['g']
  | ['w']
  | ['f', number]
  | ['u']
  | ['p', string, string, PlaceRow[]];

/** Compact wire shape (short keys: it crosses the network about 16 times a second). */
export interface ArenaMirror {
  v: 1;
  /** The Host's match (a new number when the Host starts again). */
  e: number;
  /** Server ms the state was made. */
  t: number;
  /** Arena width, height and corner radius (world units). */
  w: number;
  h: number;
  cr: number;
  ph: Phase;
  /** Round clock ms left; ms until play starts (intro and countdown); ms of play so far. */
  left: number;
  go: number;
  el: number;
  hold: boolean;
  ov: OverlayRow;
  /** Longest snake (crowned), null: none. */
  lead: number | null;
  /** Extra seed colours (0xRRGGBB); seed colour codes past the seed colours index this. */
  pal: number[];
  /** Snakes on the field in standings order, and the newest trail points of each, same order. */
  sn: SnakeRow[];
  bd: string[];
  /** Body bands: snake id, number of the band's newest point, points. */
  kb: [number, number, string][];
  /** Newest seed change number: the seed bands below show the pool with every change up to it. */
  pn: number;
  /** Recent seed changes, oldest first: number, ops. */
  pd: [number, string][];
  /** Full seed bands: index, seeds. */
  pb: [number, string][];
  /** Recent effect events, oldest first, and the newest event number. */
  ev: EventRow[];
  en: number;
}

/** Everything the Host knows that the far-away screen draws. */
export interface MirrorSource {
  match: ArenaMatch;
  /** Server time the state was made (game.now()). */
  server: number;
  overlay: Overlay;
  /** The Host's screen is paused. */
  held: boolean;
}

/** The seed, band and effect part of a packet, chosen by `MirrorFeed`. */
export interface FeedPart {
  pal: number[];
  kb: [number, number, string][];
  pn: number;
  pd: [number, string][];
  pb: [number, string][];
  ev: EventRow[];
  en: number;
}

const r1 = (v: number): number => Math.round(v);

function overlayRow(o: Overlay): OverlayRow {
  switch (o.kind) {
    case 'none':
      return ['n'];
    case 'intro':
      return ['i'];
    case 'count':
      return ['c', o.value];
    case 'go':
      return ['g'];
    case 'warning':
      return ['w'];
    case 'final':
      return ['f', o.value];
    case 'timeUp':
      return ['u'];
    case 'podium':
      return ['p', o.title, o.sub, o.places.map((p): PlaceRow => [p.id, p.rank, p.len, p.kos])];
  }
}

function snakeRow(m: ArenaMatch, s: Snake): SnakeRow {
  const flags =
    (s.alive ? F_ALIVE : 0) |
    (s.alive && s.boosting ? F_BOOST : 0) |
    (m.isProtected(s) ? F_SAFE : 0) |
    (isCpu(s.id) || s.connected ? F_ONLINE : 0);
  const alive = s.alive;
  return [
    s.id,
    s.name,
    s.look,
    s.color,
    r1(s.x * HQ),
    r1(s.y * HQ),
    r1(wrapAngle(s.angle) * ANGLE_Q),
    r1(s.steer * STEER_Q),
    alive ? s.serial : 0,
    alive ? Math.min(LEN_Q * DEFAULT_TUNING.spacing, r1(s.gap * LEN_Q)) : 0,
    alive ? r1(s.bodyLen * LEN_Q) : 0,
    r1(s.radius * RADIUS_Q),
    flags,
    alive ? m.shown(s.len) : 0,
    s.kos,
    alive ? 0 : Math.ceil(m.respawnLeft(s) / 1000),
  ];
}

/** Packs one packet (pure). */
export function toMirror(src: MirrorSource, part: FeedPart, epoch: number): ArenaMirror {
  const m = src.match;
  const order = m.order();
  return {
    v: 1,
    e: epoch,
    t: Math.round(src.server),
    w: m.width,
    h: m.height,
    cr: m.corner,
    ph: m.phase,
    left: Math.round(m.timeLeft()),
    go: Math.round(m.startsIn()),
    el: m.phase === 'play' ? Math.round(m.now - m.playStart) : 0,
    hold: src.held,
    ov: overlayRow(src.overlay),
    lead: m.leaderId,
    pal: part.pal,
    sn: order.map((s) => snakeRow(m, s)),
    bd: order.map((s) => {
      const n = Math.min(bodyDepth(s), RECENT_POINTS);
      return encodePoints(s, s.serial, n);
    }),
    kb: part.kb,
    pn: part.pn,
    pd: part.pd,
    pb: part.pb,
    ev: part.ev,
    en: part.en,
  };
}

/* ------------------------------------------------------------------ Host side */

/**
 * The Host's bookkeeping for the mirror: the seed pool as last published, the numbered seed
 * changes, the band cycles, the extra colours and the recent effect events.
 */
export class MirrorFeed {
  private readonly palette: number[] = [];
  private readonly lastKind = new Uint8Array(PELLET_CAP);
  private readonly lastGen = new Uint32Array(PELLET_CAP);
  private primed = false;
  private seq = 0;
  /** Recent seed changes with the server time they were made. */
  private deltas: { n: number; code: string; at: number }[] = [];
  /** Seeds eaten since the last packet: slot, eater. */
  private readonly eats = new Map<number, number>();
  private pelletCursor = 0;
  private pelletCatchUp = 0;
  /** Seed bands a change too big to ship touched: sent before the cycle continues. */
  private readonly urgent = new Set<number>();
  private bodyCursor = 0;
  private bodyCatchUp = 0;
  private resyncing = true;
  /** Recent events with the server time they were first sent (null: not yet). */
  private events: { row: EventRow; at: number | null }[] = [];
  private eventSeq = 0;

  constructor(readonly epoch: number = Math.floor(Math.random() * 1_000_000_000)) {}

  /** A far-away screen connected: send every body and seed again as fast as packets allow. */
  resync(): void {
    this.resyncing = true;
  }

  /**
   * Remember an event the far-away screen should replay. Bites ride on the seed changes and boosts
   * on the snake flags, so a busy field never crowds knock-outs out of the event list.
   */
  note(e: ArenaEvent): void {
    if (e.type === 'eat') {
      this.eats.set(e.slot, e.id);
      return;
    }
    const n = this.eventSeq + 1;
    let row: EventRow | null = null;
    switch (e.type) {
      case 'spawn':
        row = [n, 's', e.id, r1(e.x), r1(e.y), e.first ? 1 : 0];
        break;
      case 'ko':
        row = [n, 'k', e.id, e.by, e.cause, r1(e.x), r1(e.y), Math.max(0, Math.floor(e.len))];
        break;
      case 'removed':
        row = [n, 'r', e.id];
        break;
      case 'lead':
        row = [n, 'l', e.id];
        break;
      case 'warning':
        row = [n, 'w'];
        break;
      default:
        break;
    }
    if (!row) return;
    this.eventSeq = n;
    this.events.push({ row, at: null });
    if (this.events.length > EVENTS_KEPT) this.events.shift();
  }

  private colorCode(color: number): number {
    const seed = SEED_COLORS.indexOf(color);
    if (seed >= 0) return seed;
    let k = this.palette.indexOf(color);
    if (k < 0) {
      if (this.palette.length >= PALETTE_MAX) return 0;
      k = this.palette.length;
      this.palette.push(color);
    }
    return SEED_COLORS.length + k;
  }

  private putPellet(out: string[], m: ArenaMatch, i: number): void {
    const P = m.pellets;
    putUint(out, Math.max(0, r1(P.x[i]!)));
    putUint(out, Math.max(0, r1(P.y[i]!)));
    putUint(out, Math.min(VALUE_MAX, Math.max(1, P.value[i]!)) - 1);
    putUint(out, this.colorCode(P.color[i]!));
    const life =
      P.kind[i] === PELLET_AMBIENT
        ? 0
        : Math.min(LIFE_MAX, Math.max(1, Math.ceil((P.expires[i]! - m.now) / LIFE_Q)));
    putUint(out, life);
  }

  /** Seed changes since the last packet (slot * 2 + added, then the seed or the eater); '' when none. */
  private diffPellets(m: ArenaMatch, touched: Set<number>): string {
    const P = m.pellets;
    const out: string[] = [];
    const span = Math.min(PELLET_CAP, P.span);
    for (let i = 0; i < span; i++) {
      const kind = P.kind[i]!;
      const gen = P.gen[i]!;
      const was = this.lastKind[i] !== PELLET_FREE;
      const changed = kind === PELLET_FREE ? was : !was || gen !== this.lastGen[i];
      if (!changed) continue;
      if (was) {
        const eater = this.eats.get(i);
        putUint(out, i * 2);
        putUint(out, eater === undefined ? 0 : zig(eater) + 1);
      }
      if (kind !== PELLET_FREE) {
        putUint(out, i * 2 + 1);
        this.putPellet(out, m, i);
      }
      touched.add(Math.floor(i / PELLET_BAND));
      this.lastKind[i] = kind;
      this.lastGen[i] = gen;
    }
    return out.join('');
  }

  private snapshot(m: ArenaMatch): void {
    const P = m.pellets;
    const span = Math.min(PELLET_CAP, P.span);
    for (let i = 0; i < span; i++) {
      this.lastKind[i] = P.kind[i]!;
      this.lastGen[i] = P.gen[i]!;
    }
  }

  /** One seed band: (slot gap, seed) for every seed in it. */
  private encodePelletBand(m: ArenaMatch, band: number): string {
    const P = m.pellets;
    const out: string[] = [];
    const from = band * PELLET_BAND;
    const to = Math.min(PELLET_CAP, P.cap, from + PELLET_BAND);
    let prev = from - 1;
    for (let i = from; i < to; i++) {
      if (P.kind[i] === PELLET_FREE) continue;
      putUint(out, i - prev - 1);
      prev = i;
      this.putPellet(out, m, i);
    }
    return out.join('');
  }

  /** Body bands of every snake on the field, newest first, leaving out what `bd` already carries. */
  private bodyBands(m: ArenaMatch): { s: Snake; top: number; count: number }[] {
    const list: { s: Snake; top: number; count: number }[] = [];
    // Seating order, not standings: the cycle must not reshuffle as lengths change.
    for (const s of m.all) {
      if (s.gone || !s.inMatch) continue;
      const depth = bodyDepth(s);
      if (depth <= RECENT_POINTS) continue;
      const low = s.serial - depth + 1;
      const high = s.serial - RECENT_POINTS;
      for (let b = Math.floor(high / BODY_BAND); b >= Math.floor(low / BODY_BAND); b--) {
        const top = Math.min(high, b * BODY_BAND + BODY_BAND - 1);
        const bottom = Math.max(low, b * BODY_BAND);
        if (top >= bottom) list.push({ s, top, count: top - bottom + 1 });
      }
    }
    return list;
  }

  /** The next packet. */
  pack(src: MirrorSource): ArenaMirror {
    const m = src.match;
    const P = m.pellets;
    const pelletBands = Math.ceil(Math.max(1, Math.min(PELLET_CAP, P.span)) / PELLET_BAND);
    // Every colour in the pool gets its code before anything is measured.
    for (let i = 0; i < P.span; i++) if (P.kind[i] !== PELLET_FREE) this.colorCode(P.color[i]!);
    const bodies = this.bodyBands(m);
    if (this.resyncing) {
      this.resyncing = false;
      this.pelletCatchUp = pelletBands;
      this.bodyCatchUp = bodies.length;
      this.pelletCursor = 0;
      this.bodyCursor = 0;
    }
    if (!this.primed) {
      // The first packet: the bands bring the pool, the changes start from here.
      this.primed = true;
      this.snapshot(m);
      this.eats.clear();
    }
    const touched = new Set<number>();
    const code = this.diffPellets(m, touched);
    this.eats.clear();
    if (code !== '') {
      this.deltas.push({ n: ++this.seq, code, at: src.server });
      if (this.deltas.length > DELTAS_KEPT) this.deltas.shift();
    }
    const pd: [number, string][] = [];
    let used = 0;
    for (let k = this.deltas.length - 1; k >= 0; k--) {
      const delta = this.deltas[k]!;
      if (src.server - delta.at > DELTA_KEEP_MS || used + delta.code.length > DELTA_BUDGET) break;
      used += delta.code.length;
      pd.unshift([delta.n, delta.code]);
    }
    // A change too big to ship: send the bands it touched instead.
    if (code !== '' && pd[pd.length - 1]?.[0] !== this.seq) for (const b of touched) this.urgent.add(b);
    for (const e of this.events) e.at ??= src.server;
    this.events = this.events.filter((e) => e.at !== null && src.server - e.at <= EVENT_KEEP_MS);
    const part: FeedPart = {
      pal: [...this.palette],
      kb: [],
      pn: this.seq,
      pd,
      pb: [],
      ev: this.events.map((e) => e.row),
      en: this.eventSeq,
    };
    const packet = toMirror(src, part, this.epoch);
    let room = PACKET_MAX - JSON.stringify(packet).length;

    const takePellets = (b: number): boolean => {
      const seeds = this.encodePelletBand(m, b);
      const cost = seeds.length + 10;
      if (cost > room) return false;
      room -= cost;
      part.pb.push([b, seeds]);
      return true;
    };
    for (const b of [...this.urgent]) {
      if (b >= pelletBands) {
        this.urgent.delete(b);
        continue;
      }
      if (!takePellets(b)) break;
      this.urgent.delete(b);
    }

    // Bodies: newest first right after a connect, then a steady cycle.
    if (bodies.length > 0) {
      const steady = Math.ceil(bodies.length / CYCLE_PACKETS);
      let sent = 0;
      let chars = 0;
      for (let k = 0; k < bodies.length; k++) {
        if (this.bodyCatchUp <= 0 && (sent >= steady || chars >= BODY_STEADY)) break;
        const at = this.bodyCursor % bodies.length;
        const band = bodies[at]!;
        const pts = encodePoints(band.s, band.top, band.count);
        const cost = pts.length + 24;
        if (cost > room) break;
        room -= cost;
        chars += cost;
        part.kb.push([band.s.id, band.top, pts]);
        sent++;
        this.bodyCursor = at + 1;
        this.bodyCatchUp = Math.max(0, this.bodyCatchUp - 1);
      }
    } else {
      this.bodyCatchUp = 0;
    }

    const steadySeeds = Math.ceil(pelletBands / CYCLE_PACKETS);
    let seedsSent = 0;
    for (let k = 0; k < pelletBands; k++) {
      if (this.pelletCatchUp <= 0 && seedsSent >= steadySeeds) break;
      const b = this.pelletCursor % pelletBands;
      if (!part.pb.some((row) => row[0] === b)) {
        if (!takePellets(b)) break;
        seedsSent++;
      }
      this.pelletCursor = b + 1;
      this.pelletCatchUp = Math.max(0, this.pelletCatchUp - 1);
    }
    return packet;
  }
}

/* ------------------------------------------------------------------ validation */

/** A snake as a packet shows it. */
export interface MirrorSnake {
  id: number;
  name: string;
  look: Look;
  color: string;
  colorNum: number;
  x: number;
  y: number;
  angle: number;
  steer: number;
  /** Newest trail point and the head's distance past it (world units). */
  serial: number;
  gap: number;
  bodyLen: number;
  radius: number;
  alive: boolean;
  boosting: boolean;
  safe: boolean;
  online: boolean;
  len: number;
  kos: number;
  back: number;
  recent: Points;
}

export interface PelletSeed {
  slot: number;
  x: number;
  y: number;
  value: number;
  color: number;
  /** Ms of life left, 0: ambient (never fades). */
  life: number;
}

export type PelletOp = { add: true; seed: PelletSeed } | { add: false; slot: number; eater: number | null };

export type MirrorEvent =
  | { n: number; type: 'spawn'; id: number; x: number; y: number; first: boolean }
  | {
      n: number;
      type: 'ko';
      id: number;
      by: number | null;
      cause: KoCause;
      x: number;
      y: number;
      len: number;
    }
  | { n: number; type: 'removed'; id: number }
  | { n: number; type: 'lead'; id: number }
  | { n: number; type: 'warning' };

export type MirrorOverlay =
  | { kind: 'none' }
  | { kind: 'intro' }
  | { kind: 'count'; value: number }
  | { kind: 'go' }
  | { kind: 'warning' }
  | { kind: 'final'; value: number }
  | { kind: 'timeUp' }
  | {
      kind: 'podium';
      title: string;
      sub: string;
      places: { id: number; rank: number; len: number; kos: number }[];
    };

/** A validated, decoded packet. */
export interface MirrorState {
  epoch: number;
  t: number;
  width: number;
  height: number;
  corner: number;
  phase: Phase;
  left: number;
  /** Ms until play starts (intro and countdown, else 0) and ms of play so far. */
  goIn: number;
  elapsed: number;
  hold: boolean;
  overlay: MirrorOverlay;
  leader: number | null;
  snakes: MirrorSnake[];
  bodies: { id: number; points: Points }[];
  seq: number;
  deltas: { n: number; ops: PelletOp[] }[];
  bands: { index: number; seeds: PelletSeed[] }[];
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
const isId = (v: unknown): v is number => isInt(v) && Math.abs(v) <= 1_000_000;
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
    case 'i':
      return { kind: 'intro' };
    case 'g':
      return { kind: 'go' };
    case 'w':
      return { kind: 'warning' };
    case 'u':
      return { kind: 'timeUp' };
    case 'c':
      return isNat(a) && a <= 9 ? { kind: 'count', value: a } : null;
    case 'f':
      return isNat(a) && a <= 60 ? { kind: 'final', value: a } : null;
    case 'p': {
      const places = parseList(c, MAX_SNAKES, (x) => {
        if (!Array.isArray(x) || x.length !== 4) return null;
        const [id, rank, len, kos] = x as unknown[];
        return isId(id) && isNat(rank) && isNat(len) && isNat(kos) ? { id, rank, len, kos } : null;
      });
      return isText(a, TEXT_MAX) && isText(b, TEXT_MAX) && places
        ? { kind: 'podium', title: a, sub: b, places }
        : null;
    }
    default:
      return null;
  }
}

/** Bounds of a decoded world point. */
interface Box {
  w: number;
  h: number;
}

const inBox = (x: unknown, y: unknown, box: Box): boolean =>
  isNum(x) && isNum(y) && x >= -OUTSIDE && y >= -OUTSIDE && x <= box.w + OUTSIDE && y <= box.h + OUTSIDE;

function parseEvent(v: unknown, box: Box): MirrorEvent | null {
  if (!Array.isArray(v)) return null;
  const row = v as unknown[];
  const n = row[0];
  if (!isNat(n)) return null;
  const kind = row[1];
  if (kind === 'w') return row.length === 2 ? { n, type: 'warning' } : null;
  const id = row[2];
  if (!isId(id)) return null;
  switch (kind) {
    case 's': {
      const [, , , x, y, first] = row;
      if (row.length !== 6 || !inBox(x, y, box) || (first !== 0 && first !== 1)) return null;
      return { n, type: 'spawn', id, x: x as number, y: y as number, first: first === 1 };
    }
    case 'k': {
      const [, , , by, cause, x, y, len] = row;
      if (row.length !== 8 || !(by === null || isId(by)) || !oneOf(CAUSES, cause)) return null;
      if (!inBox(x, y, box) || !isNat(len)) return null;
      return { n, type: 'ko', id, by, cause, x: x as number, y: y as number, len };
    }
    case 'r':
      return row.length === 3 ? { n, type: 'removed', id } : null;
    case 'l':
      return row.length === 3 ? { n, type: 'lead', id } : null;
    default:
      return null;
  }
}

function parseSnake(v: unknown, rawRecent: unknown, box: Box): MirrorSnake | null {
  if (!Array.isArray(v) || v.length !== 16 || !isText(rawRecent, CODE_MAX)) return null;
  const [id, name, rawLook, color, x, y, angle, steer, serial, gap, bodyLen, radius, flags, len, kos, back] =
    v as unknown[];
  if (!isId(id) || !isText(name, NAME_MAX) || typeof color !== 'string' || !COLOR_RE.test(color)) return null;
  if (!isInt(x) || !isInt(y) || !inBox(x / HQ, y / HQ, box)) return null;
  if (!isInt(angle) || Math.abs(angle) > 700 || !isInt(steer) || Math.abs(steer) > STEER_Q) return null;
  if (!isNat(serial) || serial > SERIAL_MAX || !isNat(gap) || gap > LEN_Q * DEFAULT_TUNING.spacing)
    return null;
  if (!isNat(bodyLen) || bodyLen > LEN_Q * (DEFAULT_TUNING.maxLen + 8)) return null;
  if (!isNat(radius) || radius > 100 * RADIUS_Q || !isNat(flags) || flags > 15) return null;
  if (!isNat(len) || !isNat(kos) || !isNat(back) || back > 600) return null;
  const look = parseLook(rawLook);
  if (!look) return null;
  const limit = (Math.max(box.w, box.h) + OUTSIDE) * TQ;
  const recent = decodePoints(rawRecent, serial, limit);
  if (!recent) return null;
  const alive = (flags & F_ALIVE) !== 0;
  return {
    id,
    name,
    look,
    color,
    colorNum: colorNumber(color),
    x: x / HQ,
    y: y / HQ,
    angle: angle / ANGLE_Q,
    steer: steer / STEER_Q,
    serial,
    gap: gap / LEN_Q,
    bodyLen: bodyLen / LEN_Q,
    radius: radius / RADIUS_Q,
    alive,
    boosting: (flags & F_BOOST) !== 0,
    safe: (flags & F_SAFE) !== 0,
    online: (flags & F_ONLINE) !== 0,
    len,
    kos,
    back: alive ? 0 : back,
    recent,
  };
}

/** Reads one seed (after its slot); null when malformed. */
function readSeed(r: DigitReader, slot: number, palette: readonly number[], box: Box): PelletSeed | null {
  const x = r.uint();
  const y = r.uint();
  const value = r.uint() + 1;
  const code = r.uint();
  const life = r.uint();
  if (x < 0 || y < 0 || value < 1 || value > VALUE_MAX || code < 0 || life < 0 || life > LIFE_MAX)
    return null;
  if (x > box.w + OUTSIDE || y > box.h + OUTSIDE) return null;
  const color = code < SEED_COLORS.length ? SEED_COLORS[code] : palette[code - SEED_COLORS.length];
  if (color === undefined) return null;
  return { slot, x, y, value, color, life: life * LIFE_Q };
}

function decodeOps(code: string, palette: readonly number[], box: Box): PelletOp[] | null {
  const r = new DigitReader(code);
  const out: PelletOp[] = [];
  while (!r.done) {
    const head = r.uint();
    if (head < 0) return null;
    const slot = Math.floor(head / 2);
    if (slot >= PELLET_CAP) return null;
    if (head % 2 === 1) {
      const seed = readSeed(r, slot, palette, box);
      if (!seed) return null;
      out.push({ add: true, seed });
    } else {
      const e = r.uint();
      if (e < 0) return null;
      out.push({ add: false, slot, eater: e === 0 ? null : unzig(e - 1) });
    }
  }
  return out;
}

function decodeSeedBand(
  code: string,
  band: number,
  palette: readonly number[],
  box: Box,
): PelletSeed[] | null {
  const r = new DigitReader(code);
  const out: PelletSeed[] = [];
  const end = Math.min(PELLET_CAP, (band + 1) * PELLET_BAND);
  let slot = band * PELLET_BAND - 1;
  while (!r.done) {
    const gap = r.uint();
    if (gap < 0) return null;
    slot += gap + 1;
    if (slot >= end) return null;
    const seed = readSeed(r, slot, palette, box);
    if (!seed) return null;
    out.push(seed);
  }
  return out;
}

/** Validates and decodes a published state from the network; null if anything is off. */
export function applyMirror(json: unknown): MirrorState | null {
  if (!isObj(json) || json.v !== 1) return null;
  const j = json;
  if (!isNat(j.e) || !isNum(j.t) || !oneOf(PHASES, j.ph)) return null;
  const w = j.w;
  const h = j.h;
  if (!isNum(w) || !isNum(h) || w < 100 || h < 100 || w > MAX_DIM || h > MAX_DIM) return null;
  if (!isNum(j.cr) || j.cr < 0 || j.cr > Math.min(w, h) / 2) return null;
  if (!isNat(j.left) || j.left > ROUND_MAX_MS || !isNat(j.go) || j.go > GO_MAX_MS) return null;
  if (!isNat(j.el) || j.el > ROUND_MAX_MS || !isBool(j.hold) || !isNat(j.pn) || !isNat(j.en)) return null;
  if (!(j.lead === null || isId(j.lead))) return null;
  const overlay = parseOverlay(j.ov);
  const palette = parseList(j.pal, PALETTE_MAX, (x) => (isNat(x) && x <= 0xffffff ? x : null));
  if (!overlay || !palette) return null;
  const box: Box = { w, h };
  if (
    !Array.isArray(j.sn) ||
    !Array.isArray(j.bd) ||
    j.sn.length !== j.bd.length ||
    j.sn.length > MAX_SNAKES
  ) {
    return null;
  }
  const recent = j.bd as unknown[];
  const snakes: MirrorSnake[] = [];
  const ids = new Set<number>();
  for (let k = 0; k < j.sn.length; k++) {
    const s = parseSnake(j.sn[k], recent[k], box);
    if (!s || ids.has(s.id)) return null;
    ids.add(s.id);
    snakes.push(s);
  }
  const limit = (Math.max(w, h) + OUTSIDE) * TQ;
  const bodies = parseList(j.kb, 512, (x) => {
    if (!Array.isArray(x) || x.length !== 3) return null;
    const [id, top, code] = x as unknown[];
    if (!isId(id) || !isNat(top) || top > SERIAL_MAX || !isText(code, CODE_MAX)) return null;
    const points = decodePoints(code, top, limit);
    return points ? { id, points } : null;
  });
  const deltas = parseList(j.pd, DELTAS_KEPT, (x) => {
    if (!Array.isArray(x) || x.length !== 2 || !isNat(x[0]) || !isText(x[1], CODE_MAX)) return null;
    const ops = decodeOps(x[1], palette, box);
    return ops ? { n: x[0], ops } : null;
  });
  const bandTotal = Math.ceil(PELLET_CAP / PELLET_BAND);
  const bands = parseList(j.pb, bandTotal, (x) => {
    if (!Array.isArray(x) || x.length !== 2 || !isNat(x[0]) || x[0] >= bandTotal || !isText(x[1], CODE_MAX)) {
      return null;
    }
    const seeds = decodeSeedBand(x[1], x[0], palette, box);
    return seeds ? { index: x[0], seeds } : null;
  });
  const events = parseList(j.ev, EVENTS_KEPT, (x) => parseEvent(x, box));
  if (!bodies || !deltas || !bands || !events) return null;
  for (let k = 1; k < deltas.length; k++) if (deltas[k]!.n <= deltas[k - 1]!.n) return null;
  for (let k = 1; k < events.length; k++) if (events[k]!.n <= events[k - 1]!.n) return null;
  const seq = j.pn;
  const eventTop = j.en;
  if (deltas.some((d) => d.n > seq) || events.some((e) => e.n > eventTop)) return null;
  return {
    epoch: j.e,
    t: j.t,
    width: w,
    height: h,
    corner: j.cr,
    phase: j.ph,
    left: j.left,
    goIn: j.go,
    elapsed: j.el,
    hold: j.hold,
    overlay,
    leader: j.lead,
    snakes,
    bodies,
    seq,
    deltas,
    bands,
    events,
    eventTop,
  };
}

/** Effect events in a packet that came after `seen`, oldest first. */
export function newEvents(s: MirrorState, seen: number): MirrorEvent[] {
  return s.events.filter((e) => e.n > seen);
}

/* ------------------------------------------------------------------ interpolation */

const BUFFER = 8;
/** A head that moved further than this between two packets was put somewhere else: no gliding. */
const JUMP = 150;

/** Packets that differ in these are separate stretches: the stage snaps instead of blending. */
const stretchKey = (s: MirrorState): string => `${s.epoch}|${s.phase}|${s.hold ? 1 : 0}`;

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

/** Two packets around the playback point, and how far between them it is. */
export interface Span {
  /** The packet at or before the playback point: discrete state (flags, HUD). */
  a: MirrorState;
  b: MirrorState;
  k: number;
}

/**
 * The last few packets, played back a little behind server time by a `PlayoutClock`: the shortest
 * recent trip plus a buffer that follows the packet gap and jitter, eased so a route change never
 * makes the snakes jump.
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

/** Where a snake is drawn between two packets. */
export interface SnakePose {
  x: number;
  y: number;
  angle: number;
  steer: number;
  /** The head's distance travelled along its trail (world units): newest point * spacing + gap. */
  odo: number;
  bodyLen: number;
  radius: number;
}

const odometer = (s: MirrorSnake): number => s.serial * DEFAULT_TUNING.spacing + s.gap;

/** A snake between packets `a` and `b` (glides only while it was on the field in both). */
export function poseAt(a: MirrorSnake, b: MirrorSnake | undefined, k: number, out: SnakePose): SnakePose {
  const glide =
    b !== undefined && a.alive && b.alive && b.serial >= a.serial && Math.hypot(b.x - a.x, b.y - a.y) <= JUMP;
  if (!glide || !b) {
    out.x = a.x;
    out.y = a.y;
    out.angle = a.angle;
    out.steer = a.steer;
    out.odo = odometer(a);
    out.bodyLen = a.bodyLen;
    out.radius = a.radius;
    return out;
  }
  out.x = lerp(a.x, b.x, k);
  out.y = lerp(a.y, b.y, k);
  out.angle = wrapAngle(a.angle + wrapAngle(b.angle - a.angle) * k);
  out.steer = lerp(a.steer, b.steer, k);
  out.odo = lerp(odometer(a), odometer(b), k);
  out.bodyLen = lerp(a.bodyLen, b.bodyLen, k);
  out.radius = lerp(a.radius, b.radius, k);
  return out;
}

/* ------------------------------------------------------------------ HUD */

/** The Host's clocks at a moment in server time (what the Host judges right then). */
export interface Clocks {
  left: number;
  urgent: boolean;
  /** The overlay as the Host shows it then; null: the packet's own overlay. */
  overlay: MirrorOverlay | null;
}

/**
 * The intro, countdown, GO, the last seconds and the round clock at server time `now`, read from
 * the newest packet `s` (not from the delayed stage), so the far-away screen shows them when the
 * Host does. They stand still while the Host is paused.
 */
export function mirrorClocks(s: MirrorState, now: number): Clocks {
  const t = DEFAULT_TUNING;
  const run = s.hold ? 0 : sinceStamp(s.t, now);
  if ((s.phase === 'intro' || s.phase === 'countdown') && s.goIn > 0) {
    const rest = s.goIn - run;
    if (rest > 3 * t.countMs) return { left: s.left, urgent: false, overlay: { kind: 'intro' } };
    if (rest > 0)
      return { left: s.left, urgent: false, overlay: { kind: 'count', value: Math.ceil(rest / t.countMs) } };
    return { left: Math.max(0, s.left + rest), urgent: false, overlay: { kind: 'go' } };
  }
  if (s.phase === 'play') {
    const left = Math.max(0, s.left - run);
    const urgent = left <= t.warnMs;
    if (s.elapsed + run < GO_MS) return { left, urgent, overlay: { kind: 'go' } };
    if (left <= 5000)
      return { left, urgent, overlay: { kind: 'final', value: Math.max(1, Math.ceil(left / 1000)) } };
    return { left, urgent, overlay: s.overlay.kind === 'warning' ? s.overlay : { kind: 'none' } };
  }
  return { left: s.left, urgent: false, overlay: null };
}

/** The HUD the Host shows, rebuilt from a packet, with the clocks from `clocks`. */
export function mirrorHud(s: MirrorState, clocks: Clocks, panel: Rect, arena: Rect): HudState {
  const byId = new Map(s.snakes.map((r) => [r.id, r]));
  const rows: BoardRow[] = s.snakes.map((r) => ({
    id: r.id,
    name: r.name,
    look: r.look,
    color: r.color,
    len: r.len,
    kos: r.kos,
    alive: r.alive,
    back: r.back,
    leader: s.leader === r.id,
    connected: r.online,
  }));
  const o = clocks.overlay ?? s.overlay;
  let overlay: Overlay;
  if (o.kind === 'podium') {
    const places: PodiumPlace[] = [];
    for (const p of o.places) {
      const r = byId.get(p.id);
      if (r)
        places.push({
          id: r.id,
          name: r.name,
          look: r.look,
          color: r.color,
          rank: p.rank,
          len: p.len,
          kos: p.kos,
        });
    }
    overlay = { kind: 'podium', title: o.title, sub: o.sub, places };
  } else overlay = o;
  return { timer: formatClock(clocks.left), urgent: clocks.urgent, rows, overlay, panel, arena };
}
