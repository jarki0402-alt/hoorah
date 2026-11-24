/**
 * Long-distance play: the display state the Host's main screen publishes about 14 times a second
 * during a race, and what a far-away main screen does with it. Pure (no DOM, no SDK):
 * `MirrorMarks` counts hops, supers, stumbles and finishes on the Host, `toMirror` packs the
 * board, `applyMirror` validates untrusted JSON, `MarkReader` turns counters back into stage
 * actions, `mirrorHud` rebuilds the HUD, and `MirrorTimeline` plays packets back a little in the
 * past so hops keep the Host's rhythm even when packets arrive unevenly.
 */
import { type Look, parseLook } from '@hoorah/protocol';
import type { TickerLine } from './commentary';
import { type BoardRow, type HudState, type Overlay, type Plate, plateBox } from './hud';
import type { HopKind, Phase } from './logic';
import { formatClock, STR } from './strings';

const PHASES: readonly Phase[] = ['waiting', 'countdown', 'race', 'raceEnd', 'standings', 'matchEnd', 'done'];
/** Hop kinds on the wire: index = code. */
export const HOP_KINDS = ['long', 'short', 'super'] as const;
export type MirrorHop = (typeof HOP_KINDS)[number];

const MAX_RACERS = 16;
const MAX_PLAYERS = 40;
const MAX_RACES = 64;
const NAME_MAX = 40;
const TEXT_MAX = 200;
const MAX_DIST = 1000;
const COLOR = /^#[0-9a-fA-F]{3,8}$/;

/* ------------------------------------------------------------------ Host side counters */

interface Marks {
  hops: number;
  kind: number;
  supers: number;
  stumbles: number;
}

/**
 * What happened to each racer, as running counters (never reset during a match), so a packet
 * that is skipped or merged loses nothing: the mirror replays the difference.
 */
export class MirrorMarks {
  private readonly racers = new Map<number, Marks>();
  /** Place of each racer that finished the current race. */
  private readonly places = new Map<number, number>();
  /** Camera flashes (photo finishes) so far. */
  flashes = 0;

  private of(id: number): Marks {
    let m = this.racers.get(id);
    if (!m) {
      m = { hops: 0, kind: 0, supers: 0, stumbles: 0 };
      this.racers.set(id, m);
    }
    return m;
  }

  hop(id: number, kind: HopKind): void {
    const code = HOP_KINDS.indexOf(kind as MirrorHop);
    if (code < 0) return;
    const m = this.of(id);
    m.hops++;
    m.kind = code;
    if (kind === 'super') m.supers++;
  }

  stumble(id: number): void {
    this.of(id).stumbles++;
  }

  finish(id: number, place: number): void {
    this.places.set(id, place);
  }

  flash(): void {
    this.flashes++;
  }

  /** A new race: nobody has finished yet. */
  newRace(): void {
    this.places.clear();
  }

  get(id: number): Readonly<Marks> {
    return this.racers.get(id) ?? { hops: 0, kind: 0, supers: 0, stumbles: 0 };
  }

  place(id: number): number {
    return this.places.get(id) ?? 0;
  }
}

/* ------------------------------------------------------------------ wire shape */

/** Everything the Host knows that the far-away screen draws. */
export interface MirrorSource {
  /** Server time the state was made (game.now()). */
  server: number;
  phase: Phase;
  race: number;
  totalRaces: number;
  /** Race clock ms and ms left of the finish grace (null when nobody finished). */
  elapsed: number;
  grace: number | null;
  /** Beat 0 of the current race (server ms) and the beat length. */
  anchor: number;
  beatMs: number;
  trackLength: number;
  hopMs: number;
  stumbleMs: number;
  /** The HUD as the Host shows it now; plates are the racers on the track in lane order. */
  hud: HudState;
  /** Distance covered by a racer on the track. */
  dist: (id: number) => number;
  marks: MirrorMarks;
  /** Finishing order of the last race. */
  lastOrder: readonly number[];
  ticker: TickerLine | null;
  /** The Host's screen is paused. */
  held: boolean;
}

/**
 * Racer on the track, in lane order: id, name, look, color, connected, dist, hops, last hop kind,
 * supers, stumbles, finish place this race (0 = racing), live place, streak, finished, stumbling.
 */
export type RacerRow = [
  number,
  string,
  Look,
  string,
  boolean,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  boolean,
  boolean,
];
/** Face on an overlay: id, look, color. */
type FaceRow = [number, Look, string];
/** Standings row: id, name, look, color, rank, place this race, points this race, total. */
type BoardWire = [number, string, Look, string, number, number | null, number, number];

/** Overlay on the wire, a tagged tuple per `Overlay` kind. */
export type OverlayWire =
  | ['n']
  | ['w', FaceRow[]]
  | ['c', number, string]
  | ['g']
  | ['e', string, string, Look | null, string, boolean]
  | ['s', string, BoardWire[], string]
  | ['m', string, string, FaceRow[]];

/** Compact wire shape (short keys: it crosses the network up to 20 times a second). */
export interface KarungMirror {
  v: 1;
  /** Server ms the state was made. */
  t: number;
  ph: Phase;
  /** Race and races in the match. */
  r: number;
  n: number;
  /** Race clock ms, finish grace ms left or null. */
  el: number;
  gr: number | null;
  /** Beat 0 (server ms) and beat length. */
  an: number;
  bm: number;
  /** Track length (m), hop ms, stumble ms. */
  tl: number;
  hm: number;
  sm: number;
  /** HUD flags: race HUD shown, tap prompt, first-race hint. */
  lv: boolean;
  pr: boolean;
  hn: boolean;
  rc: RacerRow[];
  ov: OverlayWire;
  /** Finishing order of the last race. */
  lo: number[];
  /** Camera flashes so far. */
  fl: number;
  /** Commentator line: key, bold, text. */
  tk: [number, string, string] | null;
  hold: boolean;
}

const roundTo = (v: number, digits: number): number => {
  const k = 10 ** digits;
  return Math.round(v * k) / k;
};

const faces = (list: readonly { id: number; look: Look; color: string }[]): FaceRow[] =>
  list.map((p) => [p.id, p.look, p.color]);

function overlayWire(o: Overlay): OverlayWire {
  switch (o.kind) {
    case 'none':
      return ['n'];
    case 'waiting':
      return ['w', faces(o.players)];
    case 'count':
      return ['c', o.value, o.label];
    case 'go':
      return ['g'];
    case 'raceEnd':
      return ['e', o.title, o.sub, o.look, o.color, o.photo];
    case 'standings':
      return [
        's',
        o.eyebrow,
        o.rows.map((r) => [r.id, r.name, r.look, r.color, r.rank, r.racePlace, r.plus, r.total]),
        o.next,
      ];
    case 'matchEnd':
      return ['m', o.title, o.sub, faces(o.winners)];
  }
}

function racerRow(p: Plate, src: MirrorSource): RacerRow {
  const m = src.marks.get(p.id);
  return [
    p.id,
    p.name,
    p.look,
    p.color,
    p.connected,
    roundTo(src.dist(p.id), 2),
    m.hops,
    m.kind,
    m.supers,
    m.stumbles,
    src.marks.place(p.id),
    p.place,
    p.streak,
    p.finished,
    p.stumble,
  ];
}

export function toMirror(src: MirrorSource): KarungMirror {
  const h = src.hud;
  const tk = src.ticker;
  return {
    v: 1,
    t: Math.round(src.server),
    ph: src.phase,
    r: src.race,
    n: src.totalRaces,
    el: Math.round(src.elapsed),
    gr: src.grace === null ? null : Math.round(src.grace),
    an: Math.round(src.anchor),
    bm: roundTo(src.beatMs, 3),
    tl: src.trackLength,
    hm: src.hopMs,
    sm: src.stumbleMs,
    lv: h.live,
    pr: h.prompt,
    hn: h.hint,
    rc: h.plates.map((p) => racerRow(p, src)),
    ov: overlayWire(h.overlay),
    lo: [...src.lastOrder],
    fl: src.marks.flashes,
    tk: tk ? [tk.key, tk.bold, tk.text] : null,
    hold: src.held,
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

function parseRacer(v: unknown): RacerRow | null {
  const a = tuple(v, 15);
  if (!a) return null;
  const [id, name, rawLook, color, conn, dist, hops, kind, supers, stumbles, fin, place, streak, done, trip] =
    a;
  if (!isInt(id) || !isText(name, NAME_MAX) || !isColor(color) || !isBool(conn)) return null;
  if (!isNum(dist) || dist < 0 || dist > MAX_DIST) return null;
  if (!isNat(hops) || !isNat(kind) || kind >= HOP_KINDS.length || !isNat(supers) || !isNat(stumbles))
    return null;
  if (!isNat(fin) || fin > MAX_PLAYERS || !isNat(place) || place > MAX_PLAYERS || !isNat(streak)) return null;
  if (!isBool(done) || !isBool(trip)) return null;
  const look = parseLook(rawLook);
  if (!look) return null;
  return [id, name, look, color, conn, dist, hops, kind, supers, stumbles, fin, place, streak, done, trip];
}

function parseFace(v: unknown): FaceRow | null {
  const a = tuple(v, 3);
  if (!a || !isInt(a[0]) || !isColor(a[2])) return null;
  const look = parseLook(a[1]);
  return look ? [a[0], look, a[2]] : null;
}

function parseBoard(v: unknown): BoardWire | null {
  const a = tuple(v, 8);
  if (!a) return null;
  const [id, name, rawLook, color, rank, racePlace, plus, total] = a;
  if (!isInt(id) || !isText(name, NAME_MAX) || !isColor(color) || !isNat(rank)) return null;
  if (racePlace !== null && !isNat(racePlace)) return null;
  if (!isNat(plus) || !isNat(total)) return null;
  const look = parseLook(rawLook);
  return look ? [id, name, look, color, rank, racePlace, plus, total] : null;
}

function parseOverlay(v: unknown): OverlayWire | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const a: unknown[] = v;
  switch (a[0]) {
    case 'n':
      return a.length === 1 ? ['n'] : null;
    case 'g':
      return a.length === 1 ? ['g'] : null;
    case 'w': {
      const list = a.length === 2 ? parseList(a[1], parseFace, MAX_PLAYERS) : null;
      return list ? ['w', list] : null;
    }
    case 'c':
      return a.length === 3 && isNat(a[1]) && a[1] <= 9 && isText(a[2]) ? ['c', a[1], a[2]] : null;
    case 'e': {
      if (a.length !== 6 || !isText(a[1]) || !isText(a[2]) || !isColor(a[4]) || !isBool(a[5])) return null;
      const look = a[3] === null ? null : parseLook(a[3]);
      if (a[3] !== null && !look) return null;
      return ['e', a[1], a[2], look, a[4], a[5]];
    }
    case 's': {
      if (a.length !== 4 || !isText(a[1]) || !isText(a[3])) return null;
      const rows = parseList(a[2], parseBoard, MAX_PLAYERS);
      return rows ? ['s', a[1], rows, a[3]] : null;
    }
    case 'm': {
      if (a.length !== 4 || !isText(a[1]) || !isText(a[2])) return null;
      const list = parseList(a[3], parseFace, MAX_PLAYERS);
      return list ? ['m', a[1], a[2], list] : null;
    }
    default:
      return null;
  }
}

function parseTicker(v: unknown): KarungMirror['tk'] | undefined {
  if (v === null) return null;
  const a = tuple(v, 3);
  if (!a) return undefined;
  const [key, bold, text] = a;
  return isNat(key) && isText(bold) && isText(text) ? [key, bold, text] : undefined;
}

const idOrNull = (x: unknown): number | null => (isInt(x) ? x : null);

/** Validates a published state from the network; null if anything is off. */
export function applyMirror(json: unknown): KarungMirror | null {
  if (!isObj(json) || json.v !== 1) return null;
  const j = json;
  if (!isNum(j.t) || !(PHASES as readonly unknown[]).includes(j.ph)) return null;
  const ph = j.ph as Phase;
  if (!isInt(j.n) || j.n < 1 || j.n > MAX_RACES || !isInt(j.r) || j.r < 1 || j.r > MAX_RACES) return null;
  if (!isNat(j.el) || (j.gr !== null && !isNat(j.gr))) return null;
  if (!isNum(j.an) || !isNum(j.bm) || j.bm <= 0) return null;
  if (!isNum(j.tl) || j.tl <= 0 || j.tl > MAX_DIST || !isNat(j.hm) || !isNat(j.sm) || !isNat(j.fl))
    return null;
  if (!isBool(j.lv) || !isBool(j.pr) || !isBool(j.hn) || !isBool(j.hold)) return null;
  const rc = parseList(j.rc, parseRacer, MAX_RACERS);
  const ov = parseOverlay(j.ov);
  const lo = parseList(j.lo, idOrNull, MAX_PLAYERS);
  const tk = parseTicker(j.tk);
  if (!rc || !ov || !lo || tk === undefined) return null;
  return {
    v: 1,
    t: j.t,
    ph,
    r: j.r,
    n: j.n,
    el: j.el,
    gr: j.gr,
    an: j.an,
    bm: j.bm,
    tl: j.tl,
    hm: j.hm,
    sm: j.sm,
    lv: j.lv,
    pr: j.pr,
    hn: j.hn,
    rc,
    ov,
    lo,
    fl: j.fl,
    tk,
    hold: j.hold,
  };
}

/* ------------------------------------------------------------------ rebuilding */

/** The values that move continuously, interpolated between packets. */
export interface Sampled {
  elapsed: number;
  grace: number | null;
}

/** Roster entries for the scene, in lane order. */
export function mirrorRoster(
  s: KarungMirror,
): { id: number; look: Look; color: string; connected: boolean; dist: number }[] {
  return s.rc.map((r) => ({ id: r[0], look: r[2], color: r[3], connected: r[4], dist: r[5] }));
}

const faceOf = ([id, look, color]: FaceRow) => ({ id, look, color });

function overlayOf(w: OverlayWire): Overlay {
  switch (w[0]) {
    case 'n':
      return { kind: 'none' };
    case 'g':
      return { kind: 'go' };
    case 'w':
      return { kind: 'waiting', players: w[1].map(faceOf) };
    case 'c':
      return { kind: 'count', value: w[1], label: w[2] };
    case 'e':
      return { kind: 'raceEnd', title: w[1], sub: w[2], look: w[3], color: w[4], photo: w[5] };
    case 's':
      return {
        kind: 'standings',
        eyebrow: w[1],
        rows: w[2].map(
          ([id, name, look, color, rank, racePlace, plus, total]): BoardRow => ({
            id,
            name,
            look,
            color,
            rank,
            racePlace,
            plus,
            total,
          }),
        ),
        next: w[3],
      };
    case 'm':
      return { kind: 'matchEnd', title: w[1], sub: w[2], winners: w[3].map(faceOf) };
  }
}

/** The HUD the Host showed, with plates placed on this screen's lanes and the moving clock. */
export function mirrorHud(
  s: KarungMirror,
  live: Sampled,
  lanes: { centers: readonly number[]; spacing: number },
  origin: { x: number; y: number },
): HudState {
  return {
    live: s.lv,
    raceLabel: STR.raceOf(s.r, s.n),
    timer: formatClock(live.elapsed),
    grace: live.grace === null ? null : STR.graceLeft(Math.ceil(live.grace / 1000)),
    prompt: s.pr,
    hint: s.hn,
    plates: s.rc.map(
      (r, i): Plate => ({
        id: r[0],
        name: r[1],
        look: r[2],
        color: r[3],
        connected: r[4],
        place: r[11],
        streak: r[12],
        finished: r[13],
        stumble: r[14],
        ...plateBox(i, lanes.centers, lanes.spacing, origin),
      }),
    ),
    overlay: overlayOf(s.ov),
  };
}

/* ------------------------------------------------------------------ replaying actions */

export type MirrorAction =
  | { type: 'hop'; id: number; kind: MirrorHop; to: number; color: string }
  | { type: 'stumble'; id: number; durMs: number }
  | { type: 'finish'; id: number; place: number }
  | { type: 'flash' };

interface Seen {
  hops: number;
  supers: number;
  stumbles: number;
  place: number;
}

/**
 * Compares each packet's counters with the previous one and returns what the stage should play.
 * A racer seen for the first time (or after the Host restarted its counters) only sets a baseline.
 */
export class MarkReader {
  private readonly seen = new Map<number, Seen>();
  private flashes: number | null = null;

  read(s: KarungMirror): MirrorAction[] {
    const out: MirrorAction[] = [];
    for (const r of s.rc) {
      const [id, , , color, , dist, hops, kind, supers, stumbles, place] = r;
      const was = this.seen.get(id);
      this.seen.set(id, { hops, supers, stumbles, place });
      if (!was || hops < was.hops || supers < was.supers || stumbles < was.stumbles) continue;
      if (hops > was.hops) {
        const hop = supers > was.supers ? 'super' : (HOP_KINDS[kind] ?? 'long');
        out.push({ type: 'hop', id, kind: hop, to: dist, color });
      }
      if (stumbles > was.stumbles) out.push({ type: 'stumble', id, durMs: s.sm });
      if (place > 0 && was.place === 0) out.push({ type: 'finish', id, place });
    }
    const fl = this.flashes;
    this.flashes = s.fl;
    if (fl !== null && s.fl > fl) out.push({ type: 'flash' });
    return out;
  }
}

/* ------------------------------------------------------------------ playback */

/** How far behind the newest packet the mirror draws, so there is usually a packet on each side. */
export const RENDER_DELAY_MS = 100;
const BUFFER = 8;
/** Packets waiting to be shown beyond this are shown at once (this screen stopped drawing). */
const MAX_PENDING = 40;
/** A packet this much later than usual means the route changed: start measuring afresh. */
const RESYNC_MS = 600;
/** The measured delay creeps up this much per packet, so one lucky fast packet is not kept forever. */
const CREEP_MS = 2;

/** Packets that differ in these are separate stretches: the stage snaps instead of waiting. */
const stretchKey = (s: KarungMirror): string => `${s.ph}|${s.r}|${s.hold ? 1 : 0}`;

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

/**
 * The last few packets, played back `RENDER_DELAY_MS` behind the newest one. The delay between
 * the Host making a packet and it arriving is measured (lowest seen, creeping up slowly), so
 * packets that arrive a little late still land before the playback point reaches them.
 * Packets are handed out in order once the playback point passes them (`due`), or all at once
 * when a new stretch starts (`flush`).
 */
export class MirrorTimeline {
  private readonly buf: KarungMirror[] = [];
  private readonly pending: KarungMirror[] = [];
  private offset: number | null = null;
  private readonly out: Sampled = { elapsed: 0, grace: null };

  get latest(): KarungMirror | null {
    return this.buf[this.buf.length - 1] ?? null;
  }

  /** Measured Host-to-here delay in ms (null before the first packet). */
  get lag(): number | null {
    return this.offset;
  }

  /**
   * Adds a packet that arrived at server time `now`. True when it starts a new stretch (first
   * packet, new phase or race, pause, Host restarted): `flush` and draw it right away.
   */
  push(s: KarungMirror, now: number): boolean {
    const lag = now - s.t;
    if (this.offset === null || lag < this.offset || lag - this.offset > RESYNC_MS) this.offset = lag;
    else this.offset += Math.min(CREEP_MS, lag - this.offset);
    const last = this.latest;
    const snap = !last || s.t <= last.t || stretchKey(s) !== stretchKey(last);
    if (snap) this.buf.length = 0;
    this.buf.push(s);
    if (this.buf.length > BUFFER) this.buf.shift();
    this.pending.push(s);
    return snap;
  }

  private playback(now: number): number {
    return now - (this.offset ?? 0) - RENDER_DELAY_MS;
  }

  /** Packets whose moment has come by `now`, oldest first. */
  due(now: number): KarungMirror[] {
    const at = this.playback(now);
    let n = 0;
    while (n < this.pending.length && (this.pending[n]!.t <= at || this.pending.length - n > MAX_PENDING))
      n++;
    return this.pending.splice(0, n);
  }

  /** Every packet not shown yet, oldest first. */
  flush(): KarungMirror[] {
    return this.pending.splice(0, this.pending.length);
  }

  /** The moving values as the Host showed them `RENDER_DELAY_MS` before the newest packet. Reused object. */
  sample(now: number): Sampled {
    const out = this.out;
    const buf = this.buf;
    const first = buf[0];
    const last = buf[buf.length - 1];
    if (!first || !last) return out;
    const at = this.playback(now);
    let a = last;
    let b = last;
    let k = 0;
    if (at <= first.t) {
      a = first;
      b = first;
    } else if (at < last.t) {
      for (let i = 0; i < buf.length - 1; i++) {
        const next = buf[i + 1]!;
        if (at > next.t) continue;
        a = buf[i]!;
        b = next;
        k = (at - a.t) / (b.t - a.t);
        break;
      }
    }
    out.elapsed = lerp(a.el, b.el, k);
    out.grace = a.gr !== null && b.gr !== null ? lerp(a.gr, b.gr, k) : k < 1 ? a.gr : b.gr;
    return out;
  }
}
