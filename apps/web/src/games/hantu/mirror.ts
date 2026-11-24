/**
 * Long-distance play: the display state the Host's main screen publishes (about 16 times a second
 * during the hunt, 4 otherwise) and what a far-away main screen rebuilds from it. Pure (no DOM, no
 * SDK, no Phaser).
 *
 * Secrecy: only what the Host's main screen draws goes out. The ghost's spot, heading and costume
 * travel only while some of it can show there (dazzled, the fuse flash, the round's end, or its
 * sprite touching a flashlight beam or a firefly's glow: `ghostShown`), and the red ping only
 * while it blinks. A resident's heartbeat (how close the ghost is) travels as the scared face the
 * Host draws, never as a number. Phone views and the ghost's own screen never leave the Host.
 *
 * `toMirror` packs, `applyMirror` validates untrusted JSON, `MirrorTimeline` plays packets back a
 * little in the past (an adaptive delay, see `playout.ts`), `MirrorWorld` is the `StageModel` the
 * far-away scene draws, `mirrorHud` rebuilds the HUD with the round clock read at server time.
 */
import { type Look, parseLook } from '@hoorah/protocol';
import type { EndRow, HudState, Overlay, Who } from './hud';
import {
  CONE_RAYS,
  conePolygon,
  FLY_MASK_SHARE,
  GHOST_LIFT_TILES,
  GHOST_SPRITE_TILES,
  type Opaque,
  opaqueFor,
} from './light';
import type { HauntMatch, Phase } from './logic';
import { COLS, type HauntMap, MAP_IDS, MAPS, type MapId, ROWS } from './maps';
import { PlayoutClock, sinceStamp } from './playout';
import type { StageGhost, StageModel, StageResident } from './scene';
import { FRIGHT_NAME, formatClock, MAP_NAME, STR } from './strings';
import {
  FRIGHT,
  type Fright,
  type FrightTune,
  type GhostPing,
  type HauntWorld,
  PING_S,
  SKINS,
  type Skin,
  TUNE,
} from './world';

/** Publish interval during the hunt (every 4th frame at 60 fps: the shell holds each publish 50 ms). */
export const MIRROR_LIVE_MS = 60;
/** Publish interval in the calm phases (menu, role deal, round end). */
export const MIRROR_IDLE_MS = 250;
/** The last seconds of a round: the clock turns red and the music hurries. */
export const HURRY_S = 30;
/** Effect events are repeated in every packet for this long, so one lost packet loses none. */
const FX_KEEP_MS = 1000;
export const FX_KEPT = 12;
/** Position steps per tile and angle steps per radian on the wire. */
const Q = 100;
const ANGLE_Q = 100;

const PHASES: readonly Phase[] = ['setup', 'reveal', 'hunt', 'end', 'done'];
const FRIGHTS: readonly Fright[] = ['ringan', 'beneran'];
const ALL_SKINS: readonly Skin[] = [...SKINS.rumah, ...SKINS.kampung];
const STATES: readonly StageResident['state'][] = ['in', 'fly', 'out'];
const MAX_PEOPLE = 16;
const MAX_KEYS = 8;
const FEED_KEPT = 4;
const NAME_MAX = 40;
const TEXT_MAX = 200;
const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const ROUND_MAX_MS = 600_000;
const FLASH_MAX_MS = 10_000;

/* ------------------------------------------------------------------ what the Host shows */

/** The flat box around the ghost sprite (tiles): bob, tilt and a little slack included. */
const GHOST_BOX_HALF = GHOST_SPRITE_TILES / 2 + 0.2;

/** True when segment (x0, y0)-(x1, y1) touches the box centred at (cx, cy) with half size h. */
function segmentTouchesBox(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  h: number,
): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return (
    clip(-dx, x0 - (cx - h)) && clip(dx, cx + h - x0) && clip(-dy, y0 - (cy - h)) && clip(dy, cy + h - y0)
  );
}

function pointInPolygon(pts: readonly number[], x: number, y: number): boolean {
  let inside = false;
  const n = pts.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i * 2]!;
    const yi = pts[i * 2 + 1]!;
    const xj = pts[j * 2]!;
    const yj = pts[j * 2 + 1]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** True when the closed polygon (flat x, y pairs) and the box overlap at all. */
export function polygonTouchesBox(pts: readonly number[], cx: number, cy: number, h: number): boolean {
  const n = pts.length / 2;
  if (n < 2) return false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    if (segmentTouchesBox(pts[j * 2]!, pts[j * 2 + 1]!, pts[i * 2]!, pts[i * 2 + 1]!, cx, cy, h)) return true;
  }
  return pointInPolygon(pts, cx, cy);
}

function circleTouchesBox(x: number, y: number, r: number, cx: number, cy: number, h: number): boolean {
  const dx = Math.max(0, Math.abs(x - cx) - h);
  const dy = Math.max(0, Math.abs(y - cy) - h);
  return dx * dx + dy * dy <= r * r;
}

const scratch: number[] = [];

/**
 * True when some of the ghost can show on the Host's main screen right now: revealed in full, or
 * its sprite touching a beam or a firefly's glow (the scene masks it to exactly those shapes).
 */
export function ghostShown(w: HauntWorld): boolean {
  if (w.ghostRevealed()) return true;
  const g = w.ghost;
  const cx = g.x;
  const cy = g.y - GHOST_LIFT_TILES;
  const h = GHOST_BOX_HALF;
  for (const r of w.residents) {
    if (r.state === 'fly') {
      if (circleTouchesBox(r.x, r.y, TUNE.flyGlow * FLY_MASK_SHARE, cx, cy, h)) return true;
      continue;
    }
    if (!w.shining(r)) continue;
    const pts = conePolygon(w.sight(), r.x, r.y, r.face, TUNE.coneHalf, w.tune.range, CONE_RAYS, scratch);
    if (polygonTouchesBox(pts, cx, cy, h)) return true;
  }
  return false;
}

/** The scared face the scene draws for a resident (it reads the heartbeat this way and no other). */
export const scaredFace = (state: StageResident['state'], heart: number): boolean =>
  state === 'in' && heart >= 0.7;

/** The goal chips, clock and head count of the HUD (shared by the Host and a far-away screen). */
export interface GoalFacts {
  keysFound: number;
  keysTotal: number;
  fuse: number;
  fuseOn: boolean;
  exitOpen: boolean;
  /** Seconds left in the round. */
  left: number;
  inside: number;
}

export function goalHud(
  f: GoalFacts,
): Pick<HudState, 'keys' | 'fuse' | 'fuseOn' | 'exitOpen' | 'timer' | 'urgent' | 'safe'> {
  return {
    keys: STR.hudKeys(f.keysFound, f.keysTotal),
    fuse: f.fuseOn ? STR.hudFuseOn : f.fuse > 0 ? STR.hudFusePct(f.fuse) : STR.hudFuseOff,
    fuseOn: f.fuseOn,
    exitOpen: f.exitOpen,
    timer: formatClock(f.left),
    urgent: f.left <= HURRY_S,
    safe: STR.hudSafe(f.inside),
  };
}

/* ------------------------------------------------------------------ wire shapes */

/** Resident: id, name, look, colour, x, y (1/100 tile), heading (1/100 rad), flags. */
export type ResidentRow = [number, string, Look, string, number, number, number, number];
const R_STATE = 3;
const R_SHINING = 4;
const R_SCARED = 8;
const R_LOW = 16;

/** Ghost while it shows: x, y (1/100 tile), flags (flipped, dazzled, revealed), costume. */
export type GhostRow = [number, number, number, Skin];
const G_FLIP = 1;
const G_SILAU = 2;
const G_REVEALED = 4;

/** The red ping while it blinks: x, y (1/100 tile), age ms. */
export type PingRow = [number, number, number];

export type WhoRow = [number, string, Look, string];
export type EndRowW = [number, string, Look, string, number, string];

/** Centre card: none, setup menu, role deal, round end (texts exactly as the Host shows them). */
export type OverlayRow =
  | ['n']
  | ['s', 'map' | 'fright', MapId, Fright, string]
  | ['r', string, string, WhoRow[]]
  | ['e', string, string, string, string, boolean, EndRowW[], string];

/** A white flash on the stage (catch, fuse): event number, strength in 1/100. */
export type FxRow = [number, number];

/** The round's house as the Host draws it. */
export interface StageRow {
  /** Round index (with the epoch it names the round's world). */
  rd: number;
  /** Round clock ms left. */
  left: number;
  /** Key spots (tiles) and whether each is taken. */
  k: [number, number, 0 | 1][];
  /** Shut doors (indices into the map's doors). */
  dr: number[];
  /** Fuse charge in 1/1000. */
  fu: number;
  fo: boolean;
  xo: boolean;
  /** Fuse flash ms left. */
  fl: number;
  /** Ceiling lamps lit. */
  lp: boolean;
  rs: ResidentRow[];
  gh: GhostRow | null;
  pg: PingRow | null;
}

/** Compact wire shape (short keys: it crosses the network about 16 times a second). */
export interface HantuMirror {
  v: 1;
  /** The Host's session (a new number when the Host starts again). */
  e: number;
  /** Server ms the state was made. */
  t: number;
  ph: Phase;
  hold: boolean;
  mp: MapId;
  fr: Fright;
  ov: OverlayRow;
  /** Centre callout ('' none) and the feed lines (key, text). */
  co: string;
  fd: [number, string][];
  w: StageRow | null;
  /** Recent flashes, oldest first, and the newest flash number. */
  fx: FxRow[];
  fn: number;
}

/** Everything the Host knows that the far-away screen draws. */
export interface MirrorSource {
  match: HauntMatch;
  /** Server time the state was made (game.now()). */
  server: number;
  /** The Host's screen is paused. */
  held: boolean;
  overlay: Overlay;
  callout: string;
  feed: readonly { key: number; text: string }[];
  who: (id: number) => Who;
  fx: FxRow[];
  fxTop: number;
}

const q = (v: number): number => Math.round(v * Q);
const whoRow = (w: Who): WhoRow => [w.id, w.name, w.look, w.color];

function overlayRow(o: Overlay): OverlayRow {
  switch (o.kind) {
    case 'none':
      return ['n'];
    case 'setup':
      return ['s', o.step, o.map, o.fright, o.host];
    case 'reveal':
      return ['r', o.eyebrow, o.title, o.people.map(whoRow)];
    case 'end':
      return [
        'e',
        o.eyebrow,
        o.title,
        o.sub,
        o.ghost,
        o.good,
        o.rows.map((r) => [r.id, r.name, r.look, r.color, r.points, r.note]),
        o.next,
      ];
  }
}

function stageRow(w: HauntWorld, round: number, who: (id: number) => Who): StageRow {
  const g = w.ghost;
  const gh: GhostRow | null = ghostShown(w)
    ? [
        q(g.x),
        q(g.y),
        (g.inX < 0 ? G_FLIP : 0) | (g.silau > 0 ? G_SILAU : 0) | (w.ghostRevealed() ? G_REVEALED : 0),
        g.skin,
      ]
    : null;
  const shut: number[] = [];
  w.doorShut.forEach((s, i) => {
    if (s > 0) shut.push(i);
  });
  return {
    rd: round,
    left: Math.round(w.timeLeft * 1000),
    k: w.keys.map((k) => [k.x, k.y, k.taken ? 1 : 0]),
    dr: shut,
    fu: Math.round(w.fuse * 1000),
    fo: w.fuseOn,
    xo: w.exitOpen,
    fl: Math.round(w.flash * 1000),
    lp: w.lampOn(),
    rs: w.residents.map((r) => {
      const p = who(r.id);
      const flags =
        STATES.indexOf(r.state) |
        (w.shining(r) ? R_SHINING : 0) |
        (scaredFace(r.state, r.heart) ? R_SCARED : 0) |
        (r.battery < 0.15 ? R_LOW : 0);
      return [r.id, p.name, p.look, p.color, q(r.x), q(r.y), Math.round(r.face * ANGLE_Q), flags];
    }),
    gh,
    pg: w.ping ? [q(w.ping.x), q(w.ping.y), Math.round(w.ping.age * 1000)] : null,
  };
}

/** Packs one packet (pure). */
export function toMirror(src: MirrorSource, epoch: number): HantuMirror {
  const m = src.match;
  return {
    v: 1,
    e: epoch,
    t: Math.round(src.server),
    ph: m.phase,
    hold: src.held,
    mp: m.map,
    fr: m.fright,
    ov: overlayRow(src.overlay),
    co: src.callout,
    fd: src.feed.map((f) => [f.key, f.text]),
    w: m.world ? stageRow(m.world, m.round, src.who) : null,
    fx: src.fx,
    fn: src.fxTop,
  };
}

/** The Host's recent flashes, numbered, for a far-away screen to replay once each. */
export class FxLog {
  private rows: { row: FxRow; at: number | null }[] = [];
  private seq = 0;

  get top(): number {
    return this.seq;
  }

  note(strength: number): void {
    this.seq++;
    this.rows.push({ row: [this.seq, Math.round(Math.max(0, Math.min(1, strength)) * 100)], at: null });
    if (this.rows.length > FX_KEPT) this.rows.shift();
  }

  /** The flashes to send in a packet made at server ms `server`. */
  recent(server: number): FxRow[] {
    for (const r of this.rows) r.at ??= server;
    this.rows = this.rows.filter((r) => r.at !== null && server - r.at <= FX_KEEP_MS);
    return this.rows.map((r) => r.row);
  }
}

/* ------------------------------------------------------------------ validation */

export interface MirrorResident extends StageResident {
  name: string;
  look: Look;
  color: string;
  shine: boolean;
}

export interface MirrorGhost extends StageGhost {
  revealed: boolean;
}

export interface MirrorStage {
  round: number;
  left: number;
  keys: { x: number; y: number; taken: boolean }[];
  shut: number[];
  fuse: number;
  fuseOn: boolean;
  exitOpen: boolean;
  /** Fuse flash seconds left. */
  flash: number;
  lamps: boolean;
  residents: MirrorResident[];
  ghost: MirrorGhost | null;
  ping: GhostPing | null;
}

/** A validated, decoded packet. */
export interface MirrorState {
  epoch: number;
  t: number;
  phase: Phase;
  hold: boolean;
  map: MapId;
  fright: Fright;
  overlay: Overlay;
  callout: string;
  feed: { key: number; text: string }[];
  stage: MirrorStage | null;
  fx: { n: number; strength: number }[];
  fxTop: number;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isNat = (v: unknown): v is number => isInt(v) && v >= 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const isColor = (v: unknown): v is string => typeof v === 'string' && COLOR_RE.test(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v);
const inX = (v: unknown): v is number => isNat(v) && v <= COLS * Q;
const inY = (v: unknown): v is number => isNat(v) && v <= ROWS * Q;

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

function parseWho(v: unknown): Who | null {
  if (!Array.isArray(v) || v.length !== 4) return null;
  const [id, name, rawLook, color] = v as unknown[];
  const look = parseLook(rawLook);
  if (!isInt(id) || !isText(name, NAME_MAX) || !isColor(color) || !look) return null;
  return { id, name, look, color };
}

function parseEndRow(v: unknown): EndRow | null {
  if (!Array.isArray(v) || v.length !== 6) return null;
  const who = parseWho(v.slice(0, 4));
  const [, , , , points, note] = v as unknown[];
  if (!who || !isNat(points) || points > 999 || !isText(note, TEXT_MAX)) return null;
  return { ...who, points, note };
}

function parseOverlay(v: unknown): Overlay | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const row = v as unknown[];
  switch (row[0]) {
    case 'n':
      return row.length === 1 ? { kind: 'none' } : null;
    case 's': {
      const [, step, map, fright, host] = row;
      if (row.length !== 5 || (step !== 'map' && step !== 'fright')) return null;
      if (!oneOf(MAP_IDS, map) || !oneOf(FRIGHTS, fright) || !isText(host, NAME_MAX)) return null;
      return { kind: 'setup', step, map, fright, host };
    }
    case 'r': {
      const [, eyebrow, title, rawPeople] = row;
      const people = parseList(rawPeople, MAX_PEOPLE, parseWho);
      if (row.length !== 4 || !isText(eyebrow, TEXT_MAX) || !isText(title, TEXT_MAX) || !people) return null;
      return { kind: 'reveal', eyebrow, title, people };
    }
    case 'e': {
      const [, eyebrow, title, sub, ghost, good, rawRows, next] = row;
      const rows = parseList(rawRows, MAX_PEOPLE, parseEndRow);
      if (row.length !== 8 || !rows || !isBool(good)) return null;
      if (!isText(eyebrow, TEXT_MAX) || !isText(title, TEXT_MAX) || !isText(sub, TEXT_MAX)) return null;
      if (!isText(ghost, TEXT_MAX) || !isText(next, TEXT_MAX)) return null;
      return { kind: 'end', eyebrow, title, sub, ghost, good, rows, next };
    }
    default:
      return null;
  }
}

function parseResident(v: unknown): MirrorResident | null {
  if (!Array.isArray(v) || v.length !== 8) return null;
  const who = parseWho(v.slice(0, 4));
  const [, , , , x, y, face, flags] = v as unknown[];
  if (!who || !inX(x) || !inY(y) || !isInt(face) || Math.abs(face) > 700) return null;
  if (!isNat(flags) || flags > 31) return null;
  const state = STATES[flags & R_STATE];
  if (!state) return null;
  return {
    id: who.id,
    name: who.name,
    look: who.look,
    color: who.color,
    x: x / Q,
    y: y / Q,
    face: face / ANGLE_Q,
    state,
    shine: (flags & R_SHINING) !== 0,
    heart: (flags & R_SCARED) !== 0 ? 1 : 0,
    battery: (flags & R_LOW) !== 0 ? 0.1 : 1,
  };
}

function parseGhost(v: unknown): MirrorGhost | null {
  if (!Array.isArray(v) || v.length !== 4) return null;
  const [x, y, flags, skin] = v as unknown[];
  if (!inX(x) || !inY(y) || !isNat(flags) || flags > 7 || !oneOf(ALL_SKINS, skin)) return null;
  return {
    x: x / Q,
    y: y / Q,
    inX: (flags & G_FLIP) !== 0 ? -1 : 1,
    silau: (flags & G_SILAU) !== 0 ? 1 : 0,
    revealed: (flags & G_REVEALED) !== 0,
    skin,
  };
}

function parsePing(v: unknown): GhostPing | null {
  if (!Array.isArray(v) || v.length !== 3) return null;
  const [x, y, age] = v as unknown[];
  if (!inX(x) || !inY(y) || !isNat(age) || age > PING_S * 1000) return null;
  return { x: x / Q, y: y / Q, age: age / 1000 };
}

function parseStage(v: unknown, map: MapId): MirrorStage | null {
  if (!isObj(v)) return null;
  const doors = MAPS[map].doors.length;
  if (!isNat(v.rd) || v.rd > 16 || !isNat(v.left) || v.left > ROUND_MAX_MS) return null;
  if (!isNat(v.fu) || v.fu > 1000 || !isBool(v.fo) || !isBool(v.xo) || !isBool(v.lp)) return null;
  if (!isNat(v.fl) || v.fl > FLASH_MAX_MS) return null;
  const keys = parseList(v.k, MAX_KEYS, (x) => {
    if (!Array.isArray(x) || x.length !== 3) return null;
    const [kx, ky, taken] = x as unknown[];
    if (!isNat(kx) || kx >= COLS || !isNat(ky) || ky >= ROWS || (taken !== 0 && taken !== 1)) return null;
    return { x: kx, y: ky, taken: taken === 1 };
  });
  const shut = parseList(v.dr, doors, (x) => (isNat(x) && x < doors ? x : null));
  const residents = parseList(v.rs, MAX_PEOPLE, parseResident);
  if (!keys || !shut || !residents) return null;
  const ghost = v.gh === null ? null : parseGhost(v.gh);
  const ping = v.pg === null ? null : parsePing(v.pg);
  if ((v.gh !== null && !ghost) || (v.pg !== null && !ping)) return null;
  return {
    round: v.rd,
    left: v.left,
    keys,
    shut,
    fuse: v.fu / 1000,
    fuseOn: v.fo,
    exitOpen: v.xo,
    flash: v.fl / 1000,
    lamps: v.lp,
    residents,
    ghost,
    ping,
  };
}

/** Validates and decodes a published state from the network; null if anything is off. */
export function applyMirror(raw: unknown): MirrorState | null {
  if (!isObj(raw) || raw.v !== 1) return null;
  const j = raw;
  if (!isNat(j.e) || !isNum(j.t) || !oneOf(PHASES, j.ph) || !isBool(j.hold)) return null;
  if (!oneOf(MAP_IDS, j.mp) || !oneOf(FRIGHTS, j.fr) || !isText(j.co, TEXT_MAX) || !isNat(j.fn)) return null;
  const overlay = parseOverlay(j.ov);
  const feed = parseList(j.fd, FEED_KEPT, (x) =>
    Array.isArray(x) && x.length === 2 && isNat(x[0]) && isText(x[1], TEXT_MAX)
      ? { key: x[0], text: x[1] }
      : null,
  );
  const fx = parseList(j.fx, FX_KEPT, (x) =>
    Array.isArray(x) && x.length === 2 && isNat(x[0]) && isNat(x[1]) && x[1] <= 100
      ? { n: x[0], strength: x[1] / 100 }
      : null,
  );
  if (!overlay || !feed || !fx) return null;
  const fxTop = j.fn;
  if (fx.some((f) => f.n > fxTop)) return null;
  const stage = j.w === null ? null : parseStage(j.w, j.mp);
  if (j.w !== null && !stage) return null;
  return {
    epoch: j.e,
    t: j.t,
    phase: j.ph,
    hold: j.hold,
    map: j.mp,
    fright: j.fr,
    overlay,
    callout: j.co,
    feed,
    stage,
    fx,
    fxTop,
  };
}

/* ------------------------------------------------------------------ playback */

const BUFFER = 8;
/** A body that moved further than this between two packets jumped: no gliding (tiles). */
const JUMP_TILES = 3;

/** Packets that differ in these are separate stretches: the stage snaps instead of blending. */
const stretchKey = (s: MirrorState): string =>
  `${s.epoch}|${s.phase}|${s.hold ? 1 : 0}|${s.stage ? s.stage.round : -1}`;

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

function wrapAngle(a: number): number {
  let d = a % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Two packets around the playback point, and how far between them it is. */
export interface Span {
  /** The packet at or before the playback point: discrete state (flags, doors, HUD). */
  a: MirrorState;
  b: MirrorState;
  k: number;
  /** Server time of the playback point. */
  at: number;
}

/**
 * The last few packets, played back a little behind server time by a `PlayoutClock`: the shortest
 * recent trip plus a buffer that follows the packet gap and jitter, eased so a route change never
 * makes the residents jump.
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

  /**
   * Adds a packet that arrived at server time `now`. True when it starts a new stretch (first
   * packet, new phase or round, pause, Host restarted): draw it right away.
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
    if (at <= first.t) return { a: first, b: first, k: 0, at };
    if (at >= last.t) return { a: last, b: last, k: 0, at };
    for (let i = 0; i < buf.length - 1; i++) {
      const b = buf[i + 1]!;
      if (at > b.t) continue;
      const a = buf[i]!;
      return { a, b, k: (at - a.t) / (b.t - a.t), at };
    }
    return { a: last, b: last, k: 0, at };
  }
}

/** A resident as the far-away scene draws it (mutable, refreshed every frame). */
export interface ReplicaResident {
  id: number;
  x: number;
  y: number;
  face: number;
  state: StageResident['state'];
  heart: number;
  battery: number;
  shine: boolean;
  name: string;
  look: Look;
  color: string;
}

/**
 * The round's house on a far-away screen, as a `StageModel` the scene draws: discrete state from
 * the packet at the playback point, bodies glided toward the next one. The ghost exists here only
 * while the Host showed it.
 */
export class MirrorWorld implements StageModel {
  readonly map: HauntMap;
  readonly tune: FrightTune;
  readonly round: number;
  keys: { x: number; y: number; taken: boolean }[];
  readonly residents: ReplicaResident[];
  ghost: MirrorGhost | null = null;
  ping: GhostPing | null = null;
  exitOpen = false;
  fuse = 0;
  fuseOn = false;
  flash = 0;
  private lamps = true;
  private revealed = false;
  private readonly shut = new Set<number>();
  private readonly doorIndex = new Map<number, number>();
  private readonly opaque: Opaque;
  private readonly openOpaque: Opaque;

  constructor(s: MirrorState & { stage: MirrorStage }) {
    this.map = MAPS[s.map];
    this.tune = FRIGHT[s.fright];
    this.round = s.stage.round;
    this.keys = s.stage.keys.map((k) => ({ ...k }));
    this.residents = s.stage.residents.map((r) => ({
      id: r.id,
      x: r.x,
      y: r.y,
      face: r.face,
      state: r.state,
      heart: r.heart,
      battery: r.battery,
      shine: r.shine,
      name: r.name,
      look: r.look,
      color: r.color,
    }));
    this.map.doors.forEach((d, i) => {
      this.doorIndex.set(d.y * COLS + d.x, i);
    });
    const shut = (x: number, y: number) => this.isShut(x, y);
    this.opaque = opaqueFor(this.map, shut, false);
    this.openOpaque = opaqueFor(this.map, shut, true);
  }

  resident(id: number): ReplicaResident | undefined {
    return this.residents.find((r) => r.id === id);
  }

  isShut(x: number, y: number): boolean {
    const i = this.doorIndex.get(y * COLS + x);
    return i !== undefined && this.shut.has(i);
  }

  sight(): Opaque {
    return this.exitOpen ? this.openOpaque : this.opaque;
  }

  shining(r: StageResident): boolean {
    return this.resident(r.id)?.shine ?? false;
  }

  ghostRevealed(): boolean {
    return this.revealed;
  }

  lampOn(): boolean {
    return this.lamps;
  }

  /** The house at the playback point of `span` (both packets carry this round's stage). */
  update(span: Span): void {
    const a = span.a.stage;
    if (!a) return;
    const b = span.b.stage?.round === a.round ? span.b.stage : a;
    const k = span.k;
    this.keys = a.keys.map((x) => ({ ...x }));
    this.shut.clear();
    for (const i of a.shut) this.shut.add(i);
    this.exitOpen = a.exitOpen;
    this.fuseOn = a.fuseOn;
    this.fuse = lerp(a.fuse, b.fuse, k);
    this.flash = lerp(a.flash, b.flash, k);
    this.lamps = a.lamps;
    for (const src of a.residents) {
      const view = this.resident(src.id);
      if (!view) continue;
      const next = b.residents.find((r) => r.id === src.id);
      const glide =
        next !== undefined &&
        next.state === src.state &&
        Math.hypot(next.x - src.x, next.y - src.y) <= JUMP_TILES;
      view.x = glide ? lerp(src.x, next.x, k) : src.x;
      view.y = glide ? lerp(src.y, next.y, k) : src.y;
      view.face = glide ? src.face + wrapAngle(next.face - src.face) * k : src.face;
      view.state = src.state;
      view.heart = src.heart;
      view.battery = src.battery;
      view.shine = src.shine;
      view.name = src.name;
      view.look = src.look;
      view.color = src.color;
    }
    const g = a.ghost;
    if (!g) this.ghost = null;
    else {
      const n = b.ghost;
      const glide = n !== null && Math.hypot(n.x - g.x, n.y - g.y) <= JUMP_TILES;
      this.ghost = { ...g, x: glide ? lerp(g.x, n.x, k) : g.x, y: glide ? lerp(g.y, n.y, k) : g.y };
    }
    this.revealed = g?.revealed ?? false;
    const p = a.ping;
    const run = span.a.hold ? 0 : Math.max(0, span.at - span.a.t) / 1000;
    this.ping = p && p.age + run < PING_S ? { x: p.x, y: p.y, age: p.age + run } : null;
  }
}

/* ------------------------------------------------------------------ HUD */

/**
 * Seconds left in the round at server time `now`, read from the newest packet `s` (not from the
 * delayed stage), so the far-away clock shows what the Host's does. It stands still while the
 * Host is paused and outside the hunt.
 */
export function mirrorLeft(s: MirrorState, now: number): number {
  const st = s.stage;
  if (!st) return 0;
  const run = s.phase === 'hunt' && !s.hold ? sinceStamp(s.t, now) : 0;
  return Math.max(0, st.left - run) / 1000;
}

/** The HUD the Host shows, rebuilt from a packet, with the round clock `left` (seconds). */
export function mirrorHud(s: MirrorState, left: number): HudState {
  const st = s.stage;
  const goal = st
    ? goalHud({
        keysFound: st.keys.filter((k) => k.taken).length,
        keysTotal: st.keys.length,
        fuse: st.fuse,
        fuseOn: st.fuseOn,
        exitOpen: st.exitOpen,
        left,
        inside: st.residents.filter((r) => r.state === 'in').length,
      })
    : { keys: '', fuse: '', fuseOn: false, exitOpen: false, timer: '', urgent: false, safe: '' };
  return {
    show: s.phase === 'hunt' && st !== null,
    place: MAP_NAME[s.map],
    fright: FRIGHT_NAME[s.fright],
    ...goal,
    callout: s.callout,
    overlay: s.overlay,
  };
}

/** Flashes in a packet that came after `seen`, oldest first. */
export function newFx(s: MirrorState, seen: number): { n: number; strength: number }[] {
  return s.fx.filter((f) => f.n > seen);
}
