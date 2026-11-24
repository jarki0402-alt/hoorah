/**
 * Long-distance play: the display state the Host's Ludo publishes and a far-away main screen
 * draws. `toMirror` reads the HUD model the Host's screen renders (players become ids plus one
 * roster), `applyMirror` validates the network copy and rebuilds that model. Times cross as
 * server ms so the far screen counts down by itself. Pure.
 */
import { type Fruit, isFruit, type Look, parseLook } from '@hoorah/protocol';
import type { PawnRef } from './geometry';
import { BASE, type ColorId, MAX_SEATS } from './logic';
import type { Banner, Burst, HudModel, PlayerCard, SeatCard, ShownMove, Toast } from './store';

export const MIRROR_VERSION = 1;

/** The last move, numbered so the far screen animates each one once. `at` = server ms. */
export interface MirrorMove extends ShownMove {
  n: number;
  at: number;
}

type Person = [id: number, name: string, fruit: Fruit, look: Look, color: string, on: 0 | 1];
type Seat = [index: number, color: ColorId, player: number, pawns: number[], home: number, flags: number];
type Turn = [seat: number, color: ColorId, player: number, bonus: 0 | 1, auto: 0 | 1];
type MirrorBanner =
  | { k: 'intro'; key: number; first: string | null; note: string | null }
  | { k: 'finale'; key: number; title: string; sub: string; winners: number[]; color: ColorId };

export interface LudoMirror {
  v: typeof MIRROR_VERSION;
  people: Person[];
  pp: number;
  sides: number;
  colors: ColorId[];
  seats: Seat[];
  turn: Turn | null;
  dice: number | null;
  rolling: boolean;
  rollId: number;
  hint: string;
  six: boolean;
  over: boolean;
  legal: string[];
  banner: MirrorBanner | null;
  move: MirrorMove | null;
  toast: Toast | null;
  bursts: Burst[];
  /** Turn timer ring: deadline (server ms) and its full length, null when not counting. */
  ring: [deadline: number, total: number] | null;
  /** Server ms the Host's game froze at (paused), else null. */
  frozen: number | null;
}

/** Everything `toMirror` reads, in the Host's game time (`toServer` converts it). */
export interface MirrorSource {
  model: HudModel;
  move: MirrorMove | null;
  toast: Toast | null;
  bursts: readonly Burst[];
  ring: { deadline: number; total: number } | null;
  /** Game time now while paused, else null. */
  frozenAt: number | null;
  toServer(t: number): number;
}

const SEAT_ACTIVE = 1;
const SEAT_WINNER = 2;

export function toMirror(src: MirrorSource): LudoMirror {
  const m = src.model;
  const t = (v: number) => Math.round(src.toServer(v));
  const people = new Map<number, Person>();
  const add = (p: PlayerCard) => {
    people.set(p.id, [p.id, p.name, p.fruit, p.look, p.color, p.connected ? 1 : 0]);
    return p.id;
  };
  const seats: Seat[] = m.seats.map((s) => [
    s.index,
    s.color,
    add(s.player),
    [...s.pawns],
    s.home,
    (s.active ? SEAT_ACTIVE : 0) | (s.winner ? SEAT_WINNER : 0),
  ]);
  const turn: Turn | null = m.turn
    ? [m.turn.seat, m.turn.color, add(m.turn.player), m.turn.bonus ? 1 : 0, m.turn.auto ? 1 : 0]
    : null;
  const b = m.banner;
  const banner: MirrorBanner | null = !b
    ? null
    : b.kind === 'intro'
      ? { k: 'intro', key: b.key, first: b.first, note: b.note }
      : { k: 'finale', key: b.key, title: b.title, sub: b.sub, winners: b.winners.map(add), color: b.color };
  return {
    v: MIRROR_VERSION,
    people: [...people.values()],
    pp: m.pawnsPer,
    sides: m.sides,
    colors: [...m.colors],
    seats,
    turn,
    dice: m.dice,
    rolling: m.rolling,
    rollId: m.rollId,
    hint: m.hint,
    six: m.six,
    over: m.over,
    legal: [...m.legal],
    banner,
    move: src.move ? { ...src.move, at: t(src.move.at) } : null,
    toast: src.toast ? { ...src.toast, until: t(src.toast.until) } : null,
    bursts: src.bursts.map((x) => ({ ...x, until: t(x.until) })),
    ring: src.ring ? [t(src.ring.deadline), src.ring.total] : null,
    frozen: src.frozenAt === null ? null : t(src.frozenAt),
  };
}

/* ------------------------------------------------------------------ validation */

const COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
const KEY_RE = /^\d{1,2}-\d{1,2}$/;
const MAX_TEXT = 160;
const MAX_PROGRESS = 200;
const TOAST_TONES: readonly Toast['tone'][] = ['six', 'capture', 'home', 'bad', 'exit'];

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);
const isText = (v: unknown, max = MAX_TEXT): v is string => typeof v === 'string' && v.length <= max;
const isColorId = (v: unknown): v is ColorId => isInt(v) && v >= 0 && v < MAX_SEATS;
const isFlag = (v: unknown): v is 0 | 1 => v === 0 || v === 1;
const textOrNull = (v: unknown): v is string | null => v === null || isText(v);

/** Throws on anything malformed; `applyMirror` turns that into null. */
function fail(): never {
  throw new Error('bad mirror state');
}

function list<T>(v: unknown, max: number, each: (x: unknown) => T): T[] {
  if (!Array.isArray(v) || v.length > max) fail();
  return v.map(each);
}

function person(v: unknown): PlayerCard {
  if (!Array.isArray(v) || v.length !== 6) fail();
  const [id, name, fruit, rawLook, color, on] = v as unknown[];
  const look = parseLook(rawLook);
  if (!isInt(id) || !isText(name, 40) || !isFruit(fruit) || !look) fail();
  if (typeof color !== 'string' || !COLOR_RE.test(color) || !isFlag(on)) fail();
  return { id, name, fruit, look, color, connected: on === 1 };
}

function toast(v: unknown): Toast | null {
  if (v === null) return null;
  if (!isRec(v) || !isInt(v.id) || !isText(v.text) || !textOrNull(v.sub)) fail();
  if (!(TOAST_TONES as readonly unknown[]).includes(v.tone) || !isNum(v.until)) fail();
  return { id: v.id, text: v.text, sub: v.sub, tone: v.tone as Toast['tone'], until: v.until };
}

function burst(v: unknown): Burst {
  if (!isRec(v) || !isInt(v.id) || !isNum(v.x) || !isNum(v.y) || !isNum(v.until)) fail();
  if (typeof v.color !== 'string' || !COLOR_RE.test(v.color)) fail();
  return { id: v.id, x: v.x, y: v.y, color: v.color, until: v.until };
}

function progress(v: unknown): number {
  if (!isInt(v) || v < BASE || v > MAX_PROGRESS) fail();
  return v;
}

function move(v: unknown, seats: number, perColor: number): MirrorMove | null {
  if (v === null) return null;
  if (!isRec(v) || !isInt(v.n) || !isNum(v.at) || !isColorId(v.color)) fail();
  const { seat, pawn } = v;
  if (!isInt(seat) || seat < 0 || seat >= seats || !isInt(pawn) || pawn < 0 || pawn >= perColor) fail();
  const path = list(v.path, MAX_PROGRESS, progress);
  const captures = list(v.captures, MAX_SEATS * 4, (c) => {
    if (!isRec(c) || !isInt(c.seat) || !isInt(c.pawn)) fail();
    return { seat: c.seat, pawn: c.pawn };
  });
  return { n: v.n, at: v.at, seat, pawn, color: v.color, path, captures };
}

/** The validated display state, ready for the store. */
export interface LudoShown {
  model: HudModel;
  pawns: PawnRef[];
  move: MirrorMove | null;
  toast: Toast | null;
  bursts: Burst[];
  ring: { deadline: number; total: number } | null;
  /** Server ms the Host froze at, or null while it runs. */
  frozen: number | null;
}

/** Validates a published state; null when anything is off (the screen keeps the last good one). */
export function applyMirror(raw: unknown): LudoShown | null {
  try {
    return parse(raw);
  } catch {
    return null;
  }
}

function parse(raw: unknown): LudoShown {
  if (!isRec(raw) || raw.v !== MIRROR_VERSION) fail();
  const r = raw;
  if (!isInt(r.pp) || r.pp < 1 || r.pp > 4 || !isInt(r.sides) || r.sides < 4 || r.sides > MAX_SEATS) fail();
  const people = new Map(list(r.people, MAX_SEATS * 2, person).map((p) => [p.id, p]));
  const who = (id: unknown): PlayerCard => {
    const p = isInt(id) ? people.get(id) : undefined;
    if (!p) fail();
    return p;
  };
  const pp = r.pp;
  const colors = list(r.colors, MAX_SEATS, (c) => (isColorId(c) ? c : fail()));
  const seats: SeatCard[] = list(r.seats, MAX_SEATS, (v) => {
    if (!Array.isArray(v) || v.length !== 6) fail();
    const [index, color, player, pawns, home, flags] = v as unknown[];
    if (!isInt(index) || !isColorId(color) || !isInt(home) || !isInt(flags)) fail();
    const ps = list(pawns, 4, progress);
    if (ps.length !== pp) fail();
    return {
      index,
      color,
      player: who(player),
      pawns: ps,
      home,
      active: (flags & SEAT_ACTIVE) !== 0,
      winner: (flags & SEAT_WINNER) !== 0,
    };
  });
  let turn: HudModel['turn'] = null;
  if (r.turn !== null) {
    if (!Array.isArray(r.turn) || r.turn.length !== 5) fail();
    const [seat, color, player, bonus, auto] = r.turn as unknown[];
    if (!isInt(seat) || !isColorId(color) || !isFlag(bonus) || !isFlag(auto)) fail();
    turn = { seat, color, player: who(player), bonus: bonus === 1, auto: auto === 1 };
  }
  let banner: Banner | null = null;
  const b = r.banner;
  if (b !== null) {
    if (!isRec(b) || !isInt(b.key)) fail();
    if (b.k === 'intro') {
      if (!textOrNull(b.first) || !textOrNull(b.note)) fail();
      banner = { kind: 'intro', key: b.key, first: b.first, note: b.note };
    } else if (b.k === 'finale') {
      if (!isText(b.title) || !isText(b.sub) || !isColorId(b.color)) fail();
      banner = {
        kind: 'finale',
        key: b.key,
        title: b.title,
        sub: b.sub,
        winners: list(b.winners, MAX_SEATS, who),
        color: b.color,
      };
    } else fail();
  }
  const dice = r.dice;
  if (dice !== null && (!isInt(dice) || dice < 1 || dice > 6)) fail();
  if (typeof r.rolling !== 'boolean' || typeof r.six !== 'boolean' || typeof r.over !== 'boolean') fail();
  if (!isInt(r.rollId) || !isText(r.hint)) fail();
  const legal = list(r.legal, MAX_SEATS * 4, (k) => (typeof k === 'string' && KEY_RE.test(k) ? k : fail()));
  let ring: LudoShown['ring'] = null;
  if (r.ring !== null) {
    if (!Array.isArray(r.ring) || r.ring.length !== 2 || !r.ring.every(isNum)) fail();
    const [deadline, total] = r.ring as [number, number];
    if (total <= 0) fail();
    ring = { deadline, total };
  }
  const frozen = r.frozen;
  if (frozen !== null && !isNum(frozen)) fail();
  const model: HudModel = {
    pawnsPer: pp,
    sides: r.sides,
    colors,
    seats,
    turn,
    dice,
    rolling: r.rolling,
    rollId: r.rollId,
    hint: r.hint,
    six: r.six,
    over: r.over,
    legal,
    banner,
  };
  return {
    model,
    pawns: pawnRefs(seats),
    move: move(r.move, seats.length, pp),
    toast: toast(r.toast),
    bursts: list(r.bursts, 8, burst),
    ring,
    frozen,
  };
}

/** Every pawn of every seat, in the order the Host's driver lists them. */
export function pawnRefs(seats: readonly SeatCard[]): PawnRef[] {
  return seats.flatMap((s) =>
    s.pawns.map((progress, pawn) => ({ seat: s.index, color: s.color, pawn, progress })),
  );
}
