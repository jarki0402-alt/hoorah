/**
 * Long-distance play: the display state the Host's main screen publishes, and what a far-away
 * main screen does with it. Pure (no DOM, no SDK).
 *
 * The swing is never streamed. Every kerupuk is a pure function of time, so the Host publishes
 * each lane's swing anchored in server time (start, period) plus the round schedule (GIGIT and
 * the time cap, server ms), and the far screen draws every kerupuk from its own `game.now()` each
 * frame. A player there sees their kerupuk exactly where the Host will judge their stamped press.
 * Results (bites, chokes, kerupuk left, scores, cards) come as state; bites and chokes are
 * running counters per player, so a skipped packet loses no crumbs: `MarkReader` replays the
 * difference. A packet only changes when something happens (no clock in it), so the Host sends
 * a few a second at most and identical states are deduplicated by the SDK.
 */
import { type Look, parseLook } from '@hoorah/protocol';
import type { Line } from './commentary';
import { GO_SHOW_MS, type HudModel, type Overlay, type PlateModel, type ResultRow } from './hud';
import { FEET_Y, laneLayout, PLATE_MAX_W } from './layout';
import { BASE_PERIOD, BITES, COUNT_MS, type Phase, ROUND_MS, type Swing } from './logic';
import type { LaneModel } from './scene';
import { STR } from './strings';

const PHASES: readonly Phase[] = ['intro', 'play', 'roundEnd', 'finale', 'ended'];
const MOODS: readonly LaneModel['mood'][] = ['play', 'win', 'ok', 'sad'];
/** Kacaw Pass allows 16 players: one lane each. */
const MAX_LANES = 16;
const MAX_ROWS = 16;
const MAX_ROUNDS = 9;
const NAME_MAX = 40;
const TEXT_MAX = 200;
const COLOR = /^#[0-9a-fA-F]{3,8}$/;

/* ------------------------------------------------------------------ Host side */

/** Running totals over the whole game (never reset), replayed as effects on the far screen. */
export interface LaneMarks {
  bites: number;
  perfect: number;
  chokes: number;
}

/** One contestant as the Host draws it. Times are game time; `toMirror` maps them to server time. */
export interface MirrorLaneSource {
  id: number;
  name: string;
  look: Look;
  color: string;
  connected: boolean;
  /** Bites of this round's kerupuk. */
  bites: number;
  swing: Swing;
  /** Choking until this game time, 0 when not choking. */
  chokeUntil: number;
  finished: boolean;
  mood: LaneModel['mood'];
  score: number;
  /** Round result badge, null while playing. */
  gain: number | null;
  marks: LaneMarks;
}

/** Everything the Host knows that the far-away screen draws. */
export interface MirrorSource {
  phase: Phase;
  round: number;
  rounds: number;
  /** Game time now, GIGIT and the time cap of the running round. */
  now: number;
  goAt: number;
  endsAt: number;
  /** The Host's screen is paused (its game time stands still). */
  held: boolean;
  /** Game time to server time (the Host's clock offset). */
  toServer: (t: number) => number;
  lanes: readonly MirrorLaneSource[];
  /** The overlay the Host shows (an intro countdown is redrawn from the schedule over there). */
  overlay: Overlay;
  line: Line | null;
}

/**
 * Lane: id, name, look, color, connected, bites, swing start (server ms), period, choking until
 * (server ms, 0 = not), finished, mood, score, gain, total bites, total PAS, total chokes.
 */
export type LaneRow = [
  number,
  string,
  Look,
  string,
  boolean,
  number,
  number,
  number,
  number,
  boolean,
  number,
  number,
  number | null,
  number,
  number,
  number,
];

/** Result card row: id, name, look, color, rank, detail, points. */
export type CardRow = [number, string, Look, string, number, string, string];

/** Overlay: none, waiting, intro texts, round card, finale (with the solo record line). */
export type OverlayWire =
  | ['n']
  | ['w']
  | ['i', number, string, string, string, string | null]
  | ['e', number, string, string, string | null, CardRow[]]
  | ['f', number, string, string, CardRow[], [string, boolean] | null];

/** Compact wire shape (short keys). */
export interface KerupukMirror {
  v: 1;
  ph: Phase;
  /** Round and rounds in the game. */
  r: number;
  n: number;
  /** GIGIT and the time cap of the running round, server ms. */
  go: number;
  end: number;
  /** Server ms the Host's game time stands still at, null while it runs. */
  hd: number | null;
  ln: LaneRow[];
  ov: OverlayWire;
  /** Commentator line: key, bold, text. */
  tk: [number, string, string] | null;
}

const roundTo = (v: number, digits: number): number => {
  const k = 10 ** digits;
  return Math.round(v * k) / k;
};

const cardRows = (rows: readonly ResultRow[]): CardRow[] =>
  rows.map((r) => [r.id, r.name, r.look, r.color, r.rank, r.detail, r.points]);

function overlayWire(o: Overlay): OverlayWire {
  switch (o.kind) {
    case 'none':
      return ['n'];
    case 'waiting':
      return ['w'];
    case 'intro':
      // The countdown digit is left out: the far screen counts down from the schedule itself.
      return ['i', o.key, o.title, o.sub, o.hint, o.record ?? null];
    case 'roundEnd':
      return ['e', o.key, o.title, o.sub, o.next, cardRows(o.rows)];
    case 'finale':
      return [
        'f',
        o.key,
        o.title,
        o.sub,
        cardRows(o.rows),
        o.record ? [o.record.text, o.record.isNew] : null,
      ];
  }
}

function laneRow(l: MirrorLaneSource, toServer: (t: number) => number): LaneRow {
  return [
    l.id,
    l.name,
    l.look,
    l.color,
    l.connected,
    l.bites,
    Math.round(toServer(l.swing.start)),
    roundTo(l.swing.period, 3),
    l.chokeUntil > 0 ? Math.round(toServer(l.chokeUntil)) : 0,
    l.finished,
    MOODS.indexOf(l.mood),
    l.score,
    l.gain,
    l.marks.bites,
    l.marks.perfect,
    l.marks.chokes,
  ];
}

export function toMirror(src: MirrorSource): KerupukMirror {
  const line = src.line;
  return {
    v: 1,
    ph: src.phase,
    r: src.round,
    n: src.rounds,
    go: Math.round(src.toServer(src.goAt)),
    end: Math.round(src.toServer(src.endsAt)),
    hd: src.held ? Math.round(src.toServer(src.now)) : null,
    ln: src.lanes.map((l) => laneRow(l, src.toServer)),
    ov: overlayWire(src.overlay),
    tk: line ? [line.key, line.bold, line.text] : null,
  };
}

/* ------------------------------------------------------------------ validation */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isNat = (v: unknown): v is number => isInt(v) && v >= 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isText = (v: unknown, max = TEXT_MAX): v is string => typeof v === 'string' && v.length <= max;
const isColor = (v: unknown): v is string => typeof v === 'string' && COLOR.test(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
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

function parseLane(v: unknown): LaneRow | null {
  const a = tuple(v, 16);
  if (!a) return null;
  const [id, name, rawLook, color, conn, bites, start, period, cu, fin, mood, score, gain, tb, tp, tc] = a;
  const look = parseLook(rawLook);
  if (!look || !isInt(id) || !isText(name, NAME_MAX) || !isColor(color)) return null;
  if (!isBool(conn) || !isBool(fin) || !isNat(bites) || bites > BITES) return null;
  if (!isNum(start) || !isNum(period) || period <= 0 || period > BASE_PERIOD * 2) return null;
  if (!isNat(cu) || !isNat(mood) || mood >= MOODS.length || !isInt(score)) return null;
  if (gain !== null && !isInt(gain)) return null;
  if (!isNat(tb) || !isNat(tp) || !isNat(tc) || tp > tb) return null;
  return [id, name, look, color, conn, bites, start, period, cu, fin, mood, score, gain, tb, tp, tc];
}

function parseCardRow(v: unknown): CardRow | null {
  const a = tuple(v, 7);
  if (!a) return null;
  const [id, name, rawLook, color, rank, detail, points] = a;
  const look = parseLook(rawLook);
  if (!look || !isInt(id) || !isText(name, NAME_MAX) || !isColor(color) || !isNat(rank)) return null;
  return isText(detail) && isText(points) ? [id, name, look, color, rank, detail, points] : null;
}

const textOrNull = (v: unknown): string | null | undefined => (v === null ? null : isText(v) ? v : undefined);

function parseOverlay(v: unknown): OverlayWire | null {
  if (!Array.isArray(v) || v.length < 1) return null;
  const a = v as unknown[];
  switch (a[0]) {
    case 'n':
      return a.length === 1 ? ['n'] : null;
    case 'w':
      return a.length === 1 ? ['w'] : null;
    case 'i': {
      if (a.length !== 6) return null;
      const [, key, title, sub, hint, rawRecord] = a;
      const record = textOrNull(rawRecord);
      if (!isNat(key) || !isText(title) || !isText(sub) || !isText(hint) || record === undefined) return null;
      return ['i', key, title, sub, hint, record];
    }
    case 'e': {
      if (a.length !== 6) return null;
      const [, key, title, sub, rawNext, rawRows] = a;
      const next = textOrNull(rawNext);
      const rows = parseList(rawRows, parseCardRow, MAX_ROWS);
      if (!isNat(key) || !isText(title) || !isText(sub) || next === undefined || !rows) return null;
      return ['e', key, title, sub, next, rows];
    }
    case 'f': {
      if (a.length !== 6) return null;
      const [, key, title, sub, rawRows, rawRecord] = a;
      const rows = parseList(rawRows, parseCardRow, MAX_ROWS);
      if (!isNat(key) || !isText(title) || !isText(sub) || !rows) return null;
      let record: [string, boolean] | null = null;
      if (rawRecord !== null) {
        const r = tuple(rawRecord, 2);
        if (!r || !isText(r[0]) || !isBool(r[1])) return null;
        record = [r[0], r[1]];
      }
      return ['f', key, title, sub, rows, record];
    }
    default:
      return null;
  }
}

function parseLine(v: unknown): KerupukMirror['tk'] | undefined {
  if (v === null) return null;
  const a = tuple(v, 3);
  if (!a) return undefined;
  const [key, bold, text] = a;
  return isNat(key) && isText(bold) && isText(text) ? [key, bold, text] : undefined;
}

/** Validates a published state from the network; null if anything is off. */
export function applyMirror(raw: unknown): KerupukMirror | null {
  if (!isObj(raw) || raw.v !== 1) return null;
  const j = raw;
  if (!oneOf(PHASES, j.ph)) return null;
  if (!isInt(j.n) || j.n < 1 || j.n > MAX_ROUNDS || !isInt(j.r) || j.r < 1 || j.r > j.n) return null;
  if (!isNum(j.go) || !isNum(j.end) || j.end < j.go) return null;
  if (j.hd !== null && !isNum(j.hd)) return null;
  const ln = parseList(j.ln, parseLane, MAX_LANES);
  const ov = parseOverlay(j.ov);
  const tk = parseLine(j.tk);
  if (!ln || !ov || tk === undefined) return null;
  // One lane per player.
  if (new Set(ln.map((row) => row[0])).size !== ln.length) return null;
  return { v: 1, ph: j.ph, r: j.r, n: j.n, go: j.go, end: j.end, hd: j.hd, ln, ov, tk };
}

/* ------------------------------------------------------------------ rebuilding */

/** The far screen's clock: server time, or the instant the Host's game stands still at. */
export function mirrorNow(s: KerupukMirror, server: number): number {
  return s.hd ?? server;
}

/**
 * The phase at time `now` by the schedule: biting starts at GIGIT on this screen's own clock,
 * not when the Host's next packet says so.
 */
export function mirrorPhase(s: KerupukMirror, now: number): Phase {
  return s.ph === 'intro' && now >= s.go ? 'play' : s.ph;
}

/** Scene lanes; swings and choke ends are in server time (the scene clock is `mirrorNow`). */
export function mirrorLanes(s: KerupukMirror): LaneModel[] {
  return s.ln.map((r) => ({
    id: r[0],
    look: r[2],
    color: r[3],
    connected: r[4],
    bites: r[5],
    swing: { start: r[6], period: r[7] },
    finished: r[9],
    chokeUntil: r[8],
    mood: MOODS[r[10]] ?? 'play',
  }));
}

const cardsOf = (rows: readonly CardRow[]): ResultRow[] =>
  rows.map(([id, name, look, color, rank, detail, points]) => ({
    id,
    name,
    look,
    color,
    rank,
    detail,
    points,
  }));

function overlayAt(s: KerupukMirror, phase: Phase, now: number): Overlay {
  if (phase === 'play') {
    if (!s.ln.length) return { kind: 'waiting' };
    return now < s.go + GO_SHOW_MS
      ? { kind: 'intro', key: s.r, title: '', sub: '', hint: '', count: STR.countGo }
      : { kind: 'none' };
  }
  const o = s.ov;
  switch (o[0]) {
    case 'n':
      return { kind: 'none' };
    case 'w':
      return { kind: 'waiting' };
    case 'i': {
      const left = s.go - now;
      const count =
        phase === 'intro' && left <= COUNT_MS ? String(Math.max(1, Math.ceil(left / 1000))) : null;
      return { kind: 'intro', key: o[1], title: o[2], sub: o[3], hint: o[4], count, record: o[5] };
    }
    case 'e':
      return { kind: 'roundEnd', key: o[1], title: o[2], sub: o[3], next: o[4], rows: cardsOf(o[5]) };
    case 'f':
      return {
        kind: 'finale',
        key: o[1],
        title: o[2],
        sub: o[3],
        rows: cardsOf(o[4]),
        record: o[5] ? { text: o[5][0], isNew: o[5][1] } : null,
      };
  }
}

/** The HUD at time `now` (from `mirrorNow`), plates on this screen's lanes; origin = stage px of world (0, 0). */
export function mirrorHud(s: KerupukMirror, now: number, origin: { x: number; y: number }): HudModel {
  const phase = mirrorPhase(s, now);
  const lay = laneLayout(s.ln.length);
  const plates: PlateModel[] = s.ln.map((r, i) => ({
    id: r[0],
    name: r[1],
    look: r[2],
    color: r[3],
    bites: r[5],
    score: r[11],
    connected: r[4],
    choking: r[8] > now,
    finished: r[9],
    gain: r[12],
    x: origin.x + (lay.xs[i] ?? 0),
  }));
  const secs =
    phase === 'play'
      ? Math.ceil(Math.max(0, s.end - now) / 1000)
      : phase === 'intro'
        ? Math.ceil(ROUND_MS / 1000)
        : null;
  return {
    chip: STR.roundChip(s.r, s.n),
    secs,
    urgent: phase === 'play' && secs !== null && secs <= 10,
    plates,
    plateW: Math.min(PLATE_MAX_W, lay.spacing - 12),
    plateY: origin.y + FEET_Y + 14,
    overlay: overlayAt(s, phase, now),
  };
}

/* ------------------------------------------------------------------ effects */

export type StageMark =
  | { type: 'bite'; id: number; perfect: boolean; finished: boolean }
  | { type: 'choke'; id: number };

/**
 * Turns the Host's running bite and choke totals back into stage effects. The first packet (or a
 * player whose totals went down: the Host's game restarted) is only the baseline.
 */
export class MarkReader {
  private readonly seen = new Map<number, LaneMarks>();
  private started = false;

  read(s: KerupukMirror): StageMark[] {
    const out: StageMark[] = [];
    const first = !this.started;
    this.started = true;
    for (const r of s.ln) {
      const id = r[0];
      const next: LaneMarks = { bites: r[13], perfect: r[14], chokes: r[15] };
      const prev = this.seen.get(id);
      this.seen.set(id, next);
      if (first || !prev) continue;
      if (next.bites < prev.bites || next.perfect < prev.perfect || next.chokes < prev.chokes) continue;
      if (next.bites > prev.bites) {
        out.push({ type: 'bite', id, perfect: next.perfect > prev.perfect, finished: r[5] >= BITES });
      }
      if (next.chokes > prev.chokes) out.push({ type: 'choke', id });
    }
    return out;
  }
}
