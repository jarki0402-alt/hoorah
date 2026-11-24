/**
 * Long-distance play: the display state the Host's main screen publishes, and the tower a
 * far-away main screen rebuilds from it. Pure (no DOM, no SDK, no Phaser).
 *
 * The swing is never streamed. Rusun's rules run in game time (server time minus pauses), so the
 * Host publishes its game clock (offset and pause point) plus the current swing schedule, and the
 * far screen computes the hanging floor from its own synced clock every frame: at the same server
 * time both screens draw the floor at the same x, which is where the Host judges a press stamped
 * then (see RusunLogic.pressWindowMs). Results arrive late, so every drop carries a number and the
 * far screen replays the fall and its landing itself when a new number shows up.
 */
import { FRUITS, type Fruit, type Look, parseLook } from '@hoorah/protocol';
import type { Face } from '../../shared/art/fruits';
import { floorWidth } from '../../shared/art/rusun';
import type { Banner, Bubble, HudModel, HudPlayer, PlayerCard, Popup } from './hud';
import {
  type BalanceZone,
  CENTER_X,
  type CollapseInfo,
  type CollapseReason,
  type DropKind,
  FALL_MS,
  type Fall,
  type Floor,
  INTRO_MS,
  MAX_HEIGHT,
  type Phase,
  type RusunEvent,
  SETTLE_MS,
  SWING_DEFAULTS,
  type Swing,
  swingX,
} from './logic';
import type { SceneLogic } from './scene';

const PHASES: readonly Phase[] = [
  'intro',
  'aim',
  'waiting',
  'falling',
  'settle',
  'collapse',
  'topped',
  'finale',
  'ended',
];
const KINDS: readonly DropKind[] = ['land', 'pas', 'miss', 'topple'];
const ZONES: readonly BalanceZone[] = ['green', 'yellow', 'red'];
const FACES: readonly Face[] = ['happy', 'effort', 'wow', 'sad'];
const POPUP_KINDS: readonly Popup['kind'][] = ['pas', 'land', 'record'];
const TONES: readonly Bubble['tone'][] = ['cheer', 'boo', 'rematch'];
const MAX_PLAYERS = 32;
const MAX_ROUNDS = 5;
const NAME_MAX = 40;
const TEXT_MAX = 160;
const COLOR_MAX = 32;
/** Never more than MAX_HEIGHT floors stand (warung included). */
const MAX_FLOORS = MAX_HEIGHT;
/** Call-outs kept in every packet, so one lost packet does not lose a popup. */
export const FX_KEPT = 6;
const FX_MAX = 12;
/** A call-out never stays longer than this. */
const FX_MS_MAX = 10_000;

/* ------------------------------------------------------------------ wire shape */

type Dir = 1 | -1;
/** Card row: id, name, fruit, look, color. */
type CardRow = [number, string, Fruit, Look, string];
/** HUD player row: id, stat line, score (null = hidden), active, dim, face. */
type PlayerRow = [number, string, number | null, boolean, number, Face];

/** What became of a fall once it landed on the Host. */
export interface FallResultRow {
  /** Third miss in the round: floors from this index topple to this side. */
  s: [number, Dir] | null;
  /** The tower reached MAX_HEIGHT with this floor. */
  t: boolean;
}

/** The latest drop: number (counts every drop of the game), who, where, how it resolves. */
export interface FallRow {
  n: number;
  p: number;
  /** Floor index, released x, judged x (2 decimals), auto drop. */
  i: number;
  fx: number;
  dx: number;
  a: boolean;
  /** Outcome: kind, offset from the top center, tips off the edge, collapse it causes. */
  k: DropKind;
  o: number;
  tp: boolean;
  c: [number, Dir] | null;
  /** Null while it is still falling on the Host. */
  r: FallResultRow | null;
}

type BannerRow =
  | { kind: 'intro'; key: number; title: string; sub: string; first: string | null }
  | {
      kind: 'roboh';
      key: number;
      collapser: number;
      winner: number | null;
      who: string;
      highlight: string;
      rest: string;
    }
  | { kind: 'topped'; key: number; title: string; sub: string; next: string | null }
  | {
      kind: 'finale';
      key: number;
      title: string;
      sub: string;
      winner: number | null;
      record: { text: string; isNew: boolean } | null;
    };

/** HUD model with cards replaced by ids (see `pl`). */
export interface HudRow {
  st: boolean;
  fn: number;
  tu: number | null;
  rh: string;
  zo: BalanceZone;
  ba: number;
  rc: number;
  rs: boolean;
  ps: PlayerRow[];
  bn: BannerRow | null;
}

/**
 * A HUD call-out: sequence number, the drop number it follows (the far screen holds it until it
 * has replayed that drop), how long it shows.
 */
export type FxRow =
  | {
      n: number;
      g: number;
      ms: number;
      k: 'p';
      x: number;
      y: number;
      pk: Popup['kind'];
      tx: string;
      sb: string | null;
      tl: number;
    }
  | { n: number; g: number; ms: number; k: 's'; tx: string; sb: string }
  | { n: number; g: number; ms: number; k: 'b'; w: CardRow; tx: string; tn: Bubble['tone']; x: number };

/** Compact wire shape. It only changes on game events, so the same state is never sent twice. */
export interface RusunMirror {
  v: 1;
  /** Game clock: game ms = server ms - off, frozen at pz while the Host is paused. */
  off: number;
  pz: number | null;
  ph: Phase;
  /** Round, rounds, rounds started so far (a new value = a new tower). */
  rd: number;
  rn: number;
  ik: number;
  /** End of the current timed phase, the turn deadline, swing start and period (game ms). */
  pe: number;
  dl: number;
  sw: [number, number];
  /** Standing floors' x, bottom up (widths follow from the index). */
  fl: number[];
  fa: FallRow | null;
  fx: FxRow[];
  hud: HudRow;
  pl: CardRow[];
}

/* ------------------------------------------------------------------ packing (Host) */

/** The latest drop as the Host's driver tracks it. */
export interface MirrorFall {
  n: number;
  fall: Fall;
  /** Set once it landed: a strike-out collapse and whether the tower topped out. */
  result: { strikes: { fromIndex: number; dir: Dir } | null; topped: boolean } | null;
}

export interface MirrorSource {
  clock: { offset: number; pausedAt: number | null };
  phase: Phase;
  round: number;
  rounds: number;
  intros: number;
  phaseEndsAt: number;
  deadline: number;
  swing: Swing;
  floors: readonly Floor[];
  fall: MirrorFall | null;
  fx: readonly FxRow[];
  hud: HudModel;
}

const roundTo = (v: number, digits: number): number => {
  const k = 10 ** digits;
  return Math.round(v * k) / k;
};
const px = (v: number): number => roundTo(v, 2);

const cardRow = (c: PlayerCard): CardRow => [c.id, c.name, c.fruit, c.look, c.color];

function bannerRow(b: Banner, card: (c: PlayerCard) => number): BannerRow {
  switch (b.kind) {
    case 'intro':
      return { kind: 'intro', key: b.key, title: b.title, sub: b.sub, first: b.first };
    case 'topped':
      return { kind: 'topped', key: b.key, title: b.title, sub: b.sub, next: b.next };
    case 'roboh':
      return {
        kind: 'roboh',
        key: b.key,
        collapser: card(b.collapser),
        winner: b.winner ? card(b.winner) : null,
        who: b.who,
        highlight: b.highlight,
        rest: b.rest,
      };
    case 'finale':
      return {
        kind: 'finale',
        key: b.key,
        title: b.title,
        sub: b.sub,
        winner: b.winner ? card(b.winner) : null,
        record: b.record ? { text: b.record.text, isNew: b.record.isNew } : null,
      };
  }
}

function fallRow(m: MirrorFall): FallRow {
  const f = m.fall;
  const o = f.outcome;
  const r = m.result;
  return {
    n: m.n,
    p: f.playerId,
    i: f.floorIndex,
    fx: px(f.fromX),
    dx: px(f.dropX),
    a: f.auto,
    k: o.kind,
    o: px(o.offset),
    tp: o.tip,
    c: o.collapse ? [o.collapse.fromIndex, o.collapse.dir] : null,
    r: r ? { s: r.strikes ? [r.strikes.fromIndex, r.strikes.dir] : null, t: r.topped } : null,
  };
}

export function toMirror(src: MirrorSource): RusunMirror {
  const cards = new Map<number, CardRow>();
  const card = (c: PlayerCard): number => {
    if (!cards.has(c.id)) cards.set(c.id, cardRow(c));
    return c.id;
  };
  const h = src.hud;
  const ps: PlayerRow[] = h.players.map((p) => [
    card(p),
    p.stat,
    p.score,
    p.active,
    roundTo(p.dim, 2),
    p.face,
  ]);
  return {
    v: 1,
    off: src.clock.offset,
    pz: src.clock.pausedAt,
    ph: src.phase,
    rd: src.round,
    rn: src.rounds,
    ik: src.intros,
    pe: src.phaseEndsAt,
    dl: src.deadline,
    sw: [src.swing.start, src.swing.period],
    fl: src.floors.map((f) => px(f.x)),
    fa: src.fall ? fallRow(src.fall) : null,
    fx: src.fx.slice(-FX_KEPT),
    hud: {
      st: h.showTurn,
      fn: h.floorNumber,
      tu: h.turn ? card(h.turn) : null,
      rh: h.recordHint,
      zo: h.zone,
      ba: roundTo(h.balance, 3),
      rc: h.record,
      rs: h.recordSolo,
      ps,
      bn: h.banner ? bannerRow(h.banner, card) : null,
    },
    pl: [...cards.values()],
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
const isTextOrNull = (v: unknown): v is string | null => v === null || isText(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v);
const isDir = (v: unknown): v is Dir => v === 1 || v === -1;
/** Stage x (world units): generous bounds around the 1280 frame. */
const isX = (v: unknown): v is number => isNum(v) && Math.abs(v) <= 10_000;

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

function parseCard(v: unknown): CardRow | null {
  if (!Array.isArray(v) || v.length !== 5) return null;
  const [id, name, fruit, rawLook, color] = v as unknown[];
  if (!isInt(id) || !isText(name, NAME_MAX) || !oneOf(FRUITS, fruit) || !isText(color, COLOR_MAX))
    return null;
  const look = parseLook(rawLook);
  return look ? [id, name, fruit, look, color] : null;
}

function parsePlayerRow(v: unknown): PlayerRow | null {
  if (!Array.isArray(v) || v.length !== 6) return null;
  const [id, stat, score, active, dim, face] = v as unknown[];
  if (!isInt(id) || !isText(stat) || !(score === null || isNum(score)) || !isBool(active)) return null;
  if (!isNum(dim) || dim < 0 || dim > 1 || !oneOf(FACES, face)) return null;
  return [id, stat, score, active, dim, face];
}

function parseCollapse(v: unknown): [number, Dir] | null | undefined {
  if (v === null) return null;
  if (!Array.isArray(v) || v.length !== 2) return undefined;
  const [from, dir] = v as unknown[];
  return isInt(from) && from >= 1 && from <= MAX_FLOORS && isDir(dir) ? [from, dir] : undefined;
}

function parseFall(v: unknown): FallRow | null | undefined {
  if (v === null) return null;
  if (!isObj(v)) return undefined;
  if (!isInt(v.n) || v.n < 1 || !isInt(v.p) || !isInt(v.i) || v.i < 1 || v.i >= MAX_FLOORS) return undefined;
  if (!isX(v.fx) || !isX(v.dx) || !isBool(v.a) || !oneOf(KINDS, v.k) || !isX(v.o) || !isBool(v.tp)) {
    return undefined;
  }
  const c = parseCollapse(v.c);
  if (c === undefined) return undefined;
  let r: FallResultRow | null = null;
  if (v.r !== null) {
    if (!isObj(v.r) || !isBool(v.r.t)) return undefined;
    const s = parseCollapse(v.r.s);
    if (s === undefined) return undefined;
    r = { s, t: v.r.t };
  }
  return { n: v.n, p: v.p, i: v.i, fx: v.fx, dx: v.dx, a: v.a, k: v.k, o: v.o, tp: v.tp, c, r };
}

function parseFx(v: unknown): FxRow | null {
  if (!isObj(v) || !isNat(v.n) || !isNat(v.g) || !isNum(v.ms) || v.ms < 0 || v.ms > FX_MS_MAX) return null;
  const base = { n: v.n, g: v.g, ms: v.ms };
  switch (v.k) {
    case 'p':
      if (!isX(v.x) || !isX(v.y) || !oneOf(POPUP_KINDS, v.pk) || !isText(v.tx) || !isTextOrNull(v.sb))
        return null;
      if (!isNum(v.tl) || Math.abs(v.tl) > 45) return null;
      return { ...base, k: 'p', x: v.x, y: v.y, pk: v.pk, tx: v.tx, sb: v.sb, tl: v.tl };
    case 's':
      return isText(v.tx) && isText(v.sb) ? { ...base, k: 's', tx: v.tx, sb: v.sb } : null;
    case 'b': {
      const w = parseCard(v.w);
      if (!w || !isText(v.tx) || !oneOf(TONES, v.tn) || !isX(v.x)) return null;
      return { ...base, k: 'b', w, tx: v.tx, tn: v.tn, x: v.x };
    }
    default:
      return null;
  }
}

function parseBanner(v: unknown, known: (id: unknown) => id is number): BannerRow | null | undefined {
  if (v === null) return null;
  if (!isObj(v) || !isNat(v.key)) return undefined;
  const winner = v.winner === null || known(v.winner) ? (v.winner as number | null) : undefined;
  switch (v.kind) {
    case 'intro':
      return isText(v.title) && isText(v.sub) && isTextOrNull(v.first)
        ? { kind: 'intro', key: v.key, title: v.title, sub: v.sub, first: v.first }
        : undefined;
    case 'topped':
      return isText(v.title) && isText(v.sub) && isTextOrNull(v.next)
        ? { kind: 'topped', key: v.key, title: v.title, sub: v.sub, next: v.next }
        : undefined;
    case 'roboh':
      if (!known(v.collapser) || winner === undefined) return undefined;
      return isText(v.who) && isText(v.highlight) && isText(v.rest)
        ? {
            kind: 'roboh',
            key: v.key,
            collapser: v.collapser,
            winner,
            who: v.who,
            highlight: v.highlight,
            rest: v.rest,
          }
        : undefined;
    case 'finale': {
      if (!isText(v.title) || !isText(v.sub) || winner === undefined) return undefined;
      let record: { text: string; isNew: boolean } | null = null;
      if (v.record !== null) {
        if (!isObj(v.record) || !isText(v.record.text) || !isBool(v.record.isNew)) return undefined;
        record = { text: v.record.text, isNew: v.record.isNew };
      }
      return { kind: 'finale', key: v.key, title: v.title, sub: v.sub, winner, record };
    }
    default:
      return undefined;
  }
}

function parseHud(v: unknown, known: (id: unknown) => id is number): HudRow | null {
  if (!isObj(v) || !isBool(v.st) || !isInt(v.fn) || !isText(v.rh) || !oneOf(ZONES, v.zo)) return null;
  if (!isNum(v.ba) || v.ba < 0 || !isNat(v.rc) || !isBool(v.rs)) return null;
  if (!(v.tu === null || known(v.tu))) return null;
  const ps = parseList(v.ps, parsePlayerRow, MAX_PLAYERS);
  const bn = parseBanner(v.bn, known);
  if (!ps || bn === undefined || !ps.every((p) => known(p[0]))) return null;
  return { st: v.st, fn: v.fn, tu: v.tu, rh: v.rh, zo: v.zo, ba: v.ba, rc: v.rc, rs: v.rs, ps, bn };
}

/** Validates a published state from the network; null if anything is off. */
export function applyMirror(raw: unknown): RusunMirror | null {
  if (!isObj(raw) || raw.v !== 1) return null;
  const j = raw;
  if (!isNum(j.off) || !(j.pz === null || isNum(j.pz)) || !oneOf(PHASES, j.ph)) return null;
  if (!isInt(j.rn) || j.rn < 1 || j.rn > MAX_ROUNDS || !isInt(j.rd) || j.rd < 1 || j.rd > j.rn) return null;
  if (!isNat(j.ik) || !isNum(j.pe) || !isNum(j.dl)) return null;
  if (!Array.isArray(j.sw) || j.sw.length !== 2 || !isNum(j.sw[0]) || !isNum(j.sw[1]) || j.sw[1] <= 0)
    return null;
  const fl = parseList(j.fl, (x) => (isX(x) ? x : null), MAX_FLOORS);
  if (!fl || fl.length < 1) return null;
  const fa = parseFall(j.fa);
  const fx = parseList(j.fx, parseFx, FX_MAX);
  const pl = parseList(j.pl, parseCard, MAX_PLAYERS);
  if (fa === undefined || !fx || !pl) return null;
  const ids = new Set(pl.map((c) => c[0]));
  const known = (id: unknown): id is number => isInt(id) && ids.has(id);
  const hud = parseHud(j.hud, known);
  if (!hud) return null;
  return {
    v: 1,
    off: j.off,
    pz: j.pz,
    ph: j.ph,
    rd: j.rd,
    rn: j.rn,
    ik: j.ik,
    pe: j.pe,
    dl: j.dl,
    sw: [j.sw[0], j.sw[1]],
    fl,
    fa,
    fx,
    hud,
    pl,
  };
}

/* ------------------------------------------------------------------ HUD (far screen) */

const cardOf = (row: CardRow): PlayerCard => ({
  id: row[0],
  name: row[1],
  fruit: row[2],
  look: row[3],
  color: row[4],
});

/** The Host's HUD model from a validated state. */
export function mirrorHud(s: RusunMirror): HudModel {
  const cards = new Map(s.pl.map((row) => [row[0], cardOf(row)]));
  // applyMirror checked that every id has a card.
  const card = (id: number): PlayerCard => cards.get(id)!;
  const h = s.hud;
  const players: HudPlayer[] = h.ps.map(([id, stat, score, active, dim, face]) => ({
    ...card(id),
    stat,
    score,
    active,
    dim,
    face,
  }));
  let banner: Banner | null = null;
  const b = h.bn;
  if (b) {
    switch (b.kind) {
      case 'intro':
      case 'topped':
        banner = { ...b };
        break;
      case 'roboh':
        banner = { ...b, collapser: card(b.collapser), winner: b.winner === null ? null : card(b.winner) };
        break;
      case 'finale':
        banner = { ...b, winner: b.winner === null ? null : card(b.winner) };
        break;
    }
  }
  return {
    showTurn: h.st,
    floorNumber: h.fn,
    turn: h.tu === null ? null : card(h.tu),
    recordHint: h.rh,
    players,
    zone: h.zo,
    balance: h.ba,
    record: h.rc,
    recordSolo: h.rs,
    banner,
  };
}

export const bubbleCard = (row: FxRow & { k: 'b' }): PlayerCard => cardOf(row.w);

/* ------------------------------------------------------------------ tower (far screen) */

const floorsOf = (xs: readonly number[]): Floor[] => xs.map((x, i) => ({ x, width: floorWidth(i) }));

function sameFloors(a: readonly Floor[], b: readonly Floor[]): boolean {
  return a.length === b.length && a.every((f, i) => Math.abs(f.x - b[i]!.x) < 0.02);
}

/** Phases in which the floor hangs from the crane (where a new drop lets go from). */
const HANGING: readonly Phase[] = ['intro', 'aim', 'waiting', 'settle'];

/**
 * The far screen's tower. It follows the Host's state, except that a new drop is replayed here
 * from the moment it arrives: the floor lets go where it hangs on this screen, glides to where the
 * Host judged it while falling, lands, and only then do the tower and HUD take the Host's state.
 * Events go to the scene exactly as RusunLogic's would.
 */
export class MirrorTower implements SceneLogic {
  phase: Phase = 'intro';
  phaseEndsAt = 0;
  deadline = 0;
  floors: Floor[] = floorsOf([CENTER_X]);
  fall: Fall | null = null;
  swing: Swing = { start: 0, period: SWING_DEFAULTS.periodMs };
  /** The standing tower changed without an event (joined late, missed a step): redraw it. */
  resync = false;

  private latest: RusunMirror | null = null;
  /** Highest drop number started (or skipped) and landed here. */
  private seenFall = 0;
  private landedFall = 0;
  private pending: { row: FallRow; fall: Fall } | null = null;
  private readonly listeners = new Set<(e: RusunEvent) => void>();

  get state(): RusunMirror | null {
    return this.latest;
  }

  get top(): Floor {
    return this.floors[this.floors.length - 1]!;
  }

  get floorIndex(): number {
    return this.floors.length;
  }

  /** A drop is being replayed (or waits for its result): the HUD keeps showing what came before. */
  get replaying(): boolean {
    return this.pending !== null;
  }

  /** Drops up to this number have landed on this screen. */
  get landed(): number {
    return this.landedFall;
  }

  /** Number of the drop being replayed, or null. */
  get pendingDrop(): number | null {
    return this.pending?.row.n ?? null;
  }

  swingX(t: number): number {
    return swingX(this.swing, t);
  }

  /** The Host's game time at server time `server` (frozen while the Host is paused). */
  gameNow(server: number): number {
    const s = this.latest;
    if (!s) return server;
    return s.pz ?? server - s.off;
  }

  onEvent(fn: (e: RusunEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** A validated state arrived at server time `server`. */
  push(s: RusunMirror, server: number): void {
    const prev = this.latest;
    this.latest = s;
    const t = this.gameNow(server);
    const fa = s.fa;
    if (!prev) {
      // Joined: everything shown has happened already; a floor still in the air is replayed.
      this.adopt(s);
      this.seenFall = fa ? (fa.r ? fa.n : fa.n - 1) : 0;
      this.landedFall = this.seenFall;
      this.resync = true;
      if (fa && !fa.r) this.startFall(fa, t);
      return;
    }
    if (s.ik !== prev.ik) {
      // A new tower (next round, or the Host started over): the old one sinks away.
      this.pending = null;
      this.seenFall = Math.max(this.seenFall, fa?.n ?? 0);
      this.landedFall = this.seenFall;
      this.adopt(s);
      this.emit({ type: 'intro', round: s.rd, at: s.pe - INTRO_MS });
      if (s.fl.length > 1) this.resync = true;
      return;
    }
    if (fa && fa.n > this.seenFall) {
      if (this.pending) {
        // An older drop never finished here (this screen was frozen): show the tower as it stands.
        this.landedFall = this.pending.row.n;
        this.pending = null;
        this.adopt(s, prev.fl);
        this.resync = true;
      }
      this.startFall(fa, t);
      return;
    }
    if (this.pending) {
      if (fa && fa.n === this.pending.row.n) this.pending.row = fa;
      return;
    }
    this.adopt(
      s,
      this.floors.map((f) => f.x),
    );
  }

  /** Lands a replayed drop once its time has come and the Host's result is known. */
  tick(server: number): void {
    const p = this.pending;
    const s = this.latest;
    if (!p || !s || !p.row.r || this.gameNow(server) < p.fall.landAt) return;
    this.pending = null;
    this.land(p.fall, p.row, p.row.r, s);
    this.landedFall = p.row.n;
    this.adopt(
      s,
      this.floors.map((f) => f.x),
    );
  }

  private emit(e: RusunEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  /** Take the Host's steady state; `shown` (floor x's drawn now) flags a mismatch to redraw. */
  private adopt(s: RusunMirror, shown?: readonly number[]): void {
    if (s.ph === 'falling') {
      // Only reached before a replay starts: hold the floor on the hook meanwhile.
      this.phase = 'settle';
      this.phaseEndsAt = s.pe + SETTLE_MS;
    } else {
      this.phase = s.ph;
      this.phaseEndsAt = s.pe;
    }
    this.fall = null;
    this.deadline = s.dl;
    this.swing = { start: s.sw[0], period: s.sw[1] };
    const floors = floorsOf(s.fl);
    if (shown && !sameFloors(floorsOf(shown), floors)) this.resync = true;
    this.floors = floors;
  }

  private startFall(fa: FallRow, t: number): void {
    const width = floorWidth(fa.i);
    // Let go where the floor hangs on this screen right now, then glide to where it was judged.
    const fromX = HANGING.includes(this.phase) ? this.swingX(t) : fa.fx;
    const fall: Fall = {
      playerId: fa.p,
      floorIndex: fa.i,
      width,
      at: t,
      startAt: t,
      landAt: t + FALL_MS,
      fromX,
      dropX: fa.dx,
      auto: fa.a,
      outcome: {
        kind: fa.k,
        offset: fa.o,
        x: fa.dx,
        tip: fa.tp,
        balance: 0,
        points: 0,
        collapse: fa.c ? { fromIndex: fa.c[0], dir: fa.c[1] } : null,
      },
    };
    this.seenFall = fa.n;
    this.pending = { row: fa, fall };
    this.fall = fall;
    this.phase = 'falling';
    this.phaseEndsAt = fall.landAt;
    this.emit({ type: 'drop', fall });
  }

  private collapseInfo(
    fall: Fall,
    reason: CollapseReason,
    at: [number, Dir],
    dropped: boolean,
    s: RusunMirror,
  ): CollapseInfo {
    return {
      playerId: fall.playerId,
      reason,
      floorNumber: fall.floorIndex + 1,
      height: dropped ? this.floors.length - 1 : this.floors.length,
      fromIndex: at[0],
      dropped,
      dir: at[1],
      at: fall.landAt,
      round: s.rd,
      lastRound: s.rd >= s.rn,
    };
  }

  /** Same order as RusunLogic.land: floors change first, then the scene hears about it. */
  private land(fall: Fall, row: FallRow, r: FallResultRow, s: RusunMirror): void {
    const o = fall.outcome;
    if (o.kind === 'miss') {
      this.emit({ type: 'miss', fall, strikes: 0 });
      if (r.s) {
        const info = this.collapseInfo(fall, 'strikes', r.s, false, s);
        this.floors = this.floors.slice(0, Math.min(this.floors.length, info.fromIndex));
        this.phase = 'collapse';
        this.emit({ type: 'collapse', info, fall });
      }
      return;
    }
    this.floors = [...this.floors, { x: o.x, width: fall.width }];
    if (row.c) {
      const info = this.collapseInfo(fall, 'topple', row.c, true, s);
      this.floors = this.floors.slice(0, Math.min(this.floors.length, info.fromIndex));
      this.phase = 'collapse';
      this.emit({ type: 'collapse', info, fall });
      return;
    }
    this.phase = 'settle';
    this.emit({
      type: 'land',
      fall,
      pas: o.kind === 'pas',
      points: 0,
      streak: 0,
      enteredRed: false,
      newRecord: false,
    });
    if (r.t) {
      this.phase = 'topped';
      const info = { height: this.floors.length, at: fall.landAt, round: s.rd, lastRound: s.rd >= s.rn };
      this.emit({ type: 'topped', info });
    }
  }
}
