/**
 * Long-distance play: the display state the Host's Ular Tangga publishes and a far-away main
 * screen draws. Moves travel as their plans (path, ladder/snake, start times) so the far screen
 * hops the token itself with the same motion as the Host; panels, overlays and shouts travel as
 * what the Host shows. Times cross as server ms, shout positions in board cells (the two screens
 * have different pixel sizes). Pure.
 */
import { type Fruit, isFruit, type Look, parseLook } from '@hoorah/protocol';
import { FRAME } from './art';
import { type Board, type BoardSize, makeBoard } from './board';
import type { Banner, Bubble, CardModel, DuelModel, HudModel, HudPlayer, PlayerCard, Shout } from './hud';
import { type CardId, DECK } from './logic';
import type { DuelStage, MotionPlan } from './motion';

export const MIRROR_VERSION = 1;

type Person = [id: number, name: string, fruit: Fruit, look: Look, color: string];
/** id, square shown in the list, rank, flags (active 1, offline 2, shield 4, skip 8), square it rests on. */
type Row = [id: number, pos: number, rank: number, flags: number, rest: number];
/** player, from, path, landed, ladder/snake taken (1) or not (0), hopStart, jumpStart, end. */
type Plan = [
  player: number,
  from: number,
  path: number[],
  landed: number,
  jump: 0 | 1,
  hop: number,
  jumpAt: number,
  end: number,
];
type MirrorBanner =
  | { k: 'intro'; key: number; title: string; sub: string; first: string | null; rules: string }
  | { k: 'last'; key: number; title: string; sub: string }
  | { k: 'finale'; key: number; title: string; sub: string; winner: number | null };
type MirrorShout = [
  id: number,
  x: number,
  y: number,
  text: string,
  sub: string,
  tone: Shout['tone'],
  until: number,
];
type MirrorBubble = [id: number, who: number, text: string, tone: Bubble['tone'], until: number];
type MirrorDuel = [
  key: number,
  a: number,
  b: number,
  tapsA: number,
  tapsB: number,
  stage: DuelStage,
  winner: number | null,
  start: number,
  end: number,
];

export interface UlarMirror {
  v: typeof MIRROR_VERSION;
  size: BoardSize;
  people: Person[];
  /** round, maxRounds, lastRound, who, extra, eyebrow, empty, hint, timer. */
  m: [number, number, 0 | 1, number | null, 0 | 1, string, string, string, 0 | 1];
  rows: Row[];
  banner: MirrorBanner | null;
  card: [key: number, who: number, card: CardId] | null;
  duel: MirrorDuel | null;
  shouts: MirrorShout[];
  bubbles: MirrorBubble[];
  plans: Plan[];
  /** Last dice throw: hops start (server ms) and face. */
  dice: [hopStart: number, face: number] | null;
  /** Someone may roll now: blank die, glowing token, auto-roll ring until `deadline`. */
  roll: [active: number | null, deadline: number] | null;
  frozen: number | null;
}

/** A plan as the Host's driver keeps it (`MovePlan` fits). */
export interface SourcePlan extends MotionPlan {
  playerId: number;
}

export interface MirrorSource {
  board: Board;
  model: HudModel;
  banner: Banner | null;
  card: CardModel | null;
  duel: DuelModel | null;
  duelTimes: { start: number; end: number } | null;
  shouts: readonly Shout[];
  bubbles: readonly Bubble[];
  /** Host layout's square size in px (shouts are stored in board px). */
  cell: number;
  /** Square each token rests on, in turn order. */
  rest: ReadonlyMap<number, number>;
  plans: readonly SourcePlan[];
  dice: { hopStart: number; face: number | null } | null;
  roll: { active: number | null; deadline: number } | null;
  frozenAt: number | null;
  toServer(t: number): number;
}

const ROW_ACTIVE = 1;
const ROW_OFFLINE = 2;
const ROW_SHIELD = 4;
const ROW_SKIP = 8;
const round3 = (v: number) => Math.round(v * 1000) / 1000;

export function toMirror(src: MirrorSource): UlarMirror {
  const t = (v: number) => Math.round(src.toServer(v));
  const people = new Map<number, Person>();
  const add = (p: PlayerCard): number => {
    people.set(p.id, [p.id, p.name, p.fruit, p.look, p.color]);
    return p.id;
  };
  const m = src.model;
  const rows: Row[] = m.players.map((p) => [
    add(p),
    p.pos,
    p.rank,
    (p.active ? ROW_ACTIVE : 0) |
      (p.offline ? ROW_OFFLINE : 0) |
      (p.shield ? ROW_SHIELD : 0) |
      (p.skip ? ROW_SKIP : 0),
    src.rest.get(p.id) ?? p.pos,
  ]);
  const b = src.banner;
  const banner: MirrorBanner | null = !b
    ? null
    : b.kind === 'intro'
      ? { k: 'intro', key: b.key, title: b.title, sub: b.sub, first: b.first, rules: b.rules }
      : b.kind === 'last'
        ? { k: 'last', key: b.key, title: b.title, sub: b.sub }
        : { k: 'finale', key: b.key, title: b.title, sub: b.sub, winner: b.winner ? add(b.winner) : null };
  const d = src.duel;
  const dt = src.duelTimes;
  const state: Omit<UlarMirror, 'people'> = {
    v: MIRROR_VERSION,
    size: src.board.size,
    m: [
      m.round,
      m.maxRounds,
      m.lastRound ? 1 : 0,
      m.who ? add(m.who) : null,
      m.extra ? 1 : 0,
      m.eyebrow,
      m.empty,
      m.hint,
      m.timer ? 1 : 0,
    ],
    rows,
    banner,
    card: src.card ? [src.card.key, add(src.card.who), src.card.id] : null,
    duel:
      d && dt
        ? [d.key, add(d.a), add(d.b), d.tapsA, d.tapsB, d.stage, d.winner, t(dt.start), t(dt.end)]
        : null,
    shouts: src.shouts.map((s) => [
      s.id,
      round3((s.x - FRAME) / src.cell),
      round3((s.y - FRAME) / src.cell),
      s.text,
      s.sub,
      s.tone,
      t(s.until),
    ]),
    bubbles: src.bubbles.map((x) => [x.id, add(x.who), x.text, x.tone, t(x.until)]),
    plans: src.plans.map((p) => [
      p.playerId,
      p.from,
      [...p.path],
      p.landed,
      p.jump ? 1 : 0,
      t(p.hopStart),
      t(p.jumpStart),
      t(p.end),
    ]),
    dice: src.dice ? [t(src.dice.hopStart), src.dice.face ?? 0] : null,
    roll: src.roll ? [src.roll.active, t(src.roll.deadline)] : null,
    frozen: src.frozenAt === null ? null : t(src.frozenAt),
  };
  // The roster goes last: every id referenced above has been added by now.
  return { ...state, people: [...people.values()] };
}

/* ------------------------------------------------------------------ validation */

const COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
const MAX_TEXT = 160;
const MAX_PLAYERS = 16;
const MAX_PATH = 24;
const TONES: readonly Shout['tone'][] = ['good', 'bad', 'info'];
const BUBBLE_TONES: readonly Bubble['tone'][] = ['cheer', 'boo', 'rematch'];
const STAGES: readonly DuelStage[] = ['intro', 'live', 'result'];

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);
const isText = (v: unknown, max = MAX_TEXT): v is string => typeof v === 'string' && v.length <= max;
const isFlag = (v: unknown): v is 0 | 1 => v === 0 || v === 1;
const oneOf = <T>(list: readonly T[], v: unknown): v is T => (list as readonly unknown[]).includes(v);

function fail(): never {
  throw new Error('bad mirror state');
}

function tuple(v: unknown, n: number): unknown[] {
  if (!Array.isArray(v) || v.length !== n) fail();
  return v as unknown[];
}

function list<T>(v: unknown, max: number, each: (x: unknown) => T): T[] {
  if (!Array.isArray(v) || v.length > max) fail();
  return v.map(each);
}

function person(v: unknown): PlayerCard {
  const [id, name, fruit, rawLook, color] = tuple(v, 5);
  const look = parseLook(rawLook);
  if (!isInt(id) || !isText(name, 40) || !isFruit(fruit) || !look) fail();
  if (typeof color !== 'string' || !COLOR_RE.test(color)) fail();
  return { id, name, fruit, look, color };
}

/** A plan the far screen can hop: `MotionPlan` with its player. */
export interface ShownPlan extends MotionPlan {
  playerId: number;
}

/** The validated display state, ready for the HUD store. Shouts stay in board cells. */
export interface UlarShown {
  board: Board;
  model: HudModel;
  /** Square each token rests on, in turn order. */
  rest: { id: number; sq: number }[];
  banner: Banner | null;
  card: CardModel | null;
  duel: DuelModel | null;
  duelTimes: { start: number; end: number } | null;
  shouts: Shout[];
  bubbles: Bubble[];
  plans: ShownPlan[];
  dice: { hopStart: number; face: number } | null;
  roll: { active: number | null; deadline: number } | null;
  frozen: number | null;
}

/** Validates a published state; null when anything is off (the screen keeps the last good one). */
export function applyMirror(raw: unknown): UlarShown | null {
  try {
    return parse(raw);
  } catch {
    return null;
  }
}

function parse(raw: unknown): UlarShown {
  if (!isRec(raw) || raw.v !== MIRROR_VERSION) fail();
  const r = raw;
  if (r.size !== 50 && r.size !== 100) fail();
  const board = makeBoard(r.size);
  const square = (v: unknown): number => (isInt(v) && v >= 0 && v <= board.size ? v : fail());
  const people = new Map(list(r.people, MAX_PLAYERS * 2, person).map((p) => [p.id, p]));
  const who = (id: unknown): PlayerCard => (isInt(id) ? people.get(id) : undefined) ?? fail();
  const [round, maxRounds, lastRound, whoId, extra, eyebrow, empty, hint, timer] = tuple(r.m, 9);
  if (!isInt(round) || !isInt(maxRounds) || !isFlag(lastRound) || !isFlag(extra) || !isFlag(timer)) fail();
  if (!isText(eyebrow) || !isText(empty) || !isText(hint)) fail();
  const rest: UlarShown['rest'] = [];
  const players: HudPlayer[] = list(r.rows, MAX_PLAYERS, (v) => {
    const [id, pos, rank, flags, at] = tuple(v, 5);
    if (!isInt(rank) || !isInt(flags)) fail();
    const card = who(id);
    rest.push({ id: card.id, sq: square(at) });
    return {
      ...card,
      pos: square(pos),
      rank,
      active: (flags & ROW_ACTIVE) !== 0,
      offline: (flags & ROW_OFFLINE) !== 0,
      shield: (flags & ROW_SHIELD) !== 0,
      skip: (flags & ROW_SKIP) !== 0,
    };
  });
  const model: HudModel = {
    size: board.size,
    round,
    maxRounds,
    lastRound: lastRound === 1,
    players,
    who: whoId === null ? null : who(whoId),
    extra: extra === 1,
    eyebrow,
    empty,
    hint,
    timer: timer === 1,
  };
  let banner: Banner | null = null;
  const b = r.banner;
  if (b !== null) {
    if (!isRec(b) || !isInt(b.key) || !isText(b.title) || !isText(b.sub)) fail();
    if (b.k === 'intro') {
      if ((b.first !== null && !isText(b.first)) || !isText(b.rules, 400)) fail();
      banner = { kind: 'intro', key: b.key, title: b.title, sub: b.sub, first: b.first, rules: b.rules };
    } else if (b.k === 'last') {
      banner = { kind: 'last', key: b.key, title: b.title, sub: b.sub };
    } else if (b.k === 'finale') {
      banner = {
        kind: 'finale',
        key: b.key,
        title: b.title,
        sub: b.sub,
        winner: b.winner === null ? null : who(b.winner),
      };
    } else fail();
  }
  let card: CardModel | null = null;
  if (r.card !== null) {
    const [key, id, cardId] = tuple(r.card, 3);
    if (!isInt(key) || !oneOf(DECK, cardId)) fail();
    card = { key, who: who(id), id: cardId };
  }
  let duel: DuelModel | null = null;
  let duelTimes: UlarShown['duelTimes'] = null;
  if (r.duel !== null) {
    const [key, a, bb, tapsA, tapsB, stage, winner, start, end] = tuple(r.duel, 9);
    if (!isInt(key) || !isInt(tapsA) || !isInt(tapsB) || !oneOf(STAGES, stage)) fail();
    if ((winner !== null && !isInt(winner)) || !isNum(start) || !isNum(end)) fail();
    duel = { key, a: who(a), b: who(bb), tapsA, tapsB, stage, winner };
    duelTimes = { start, end };
  }
  const shouts = list(r.shouts, 8, (v): Shout => {
    const [id, x, y, text, sub, tone, until] = tuple(v, 7);
    if (!isInt(id) || !isNum(x) || !isNum(y) || !isText(text) || !isText(sub) || !oneOf(TONES, tone)) fail();
    if (!isNum(until)) fail();
    return { id, x, y, text, sub, tone, until };
  });
  const bubbles = list(r.bubbles, 8, (v): Bubble => {
    const [id, whoId2, text, tone, until] = tuple(v, 5);
    if (!isInt(id) || !isText(text) || !oneOf(BUBBLE_TONES, tone) || !isNum(until)) fail();
    return { id, who: who(whoId2), text, tone, until };
  });
  const plans = list(r.plans, MAX_PLAYERS, (v): ShownPlan => {
    const [playerId, from, path, landed, jump, hopStart, jumpStart, end] = tuple(v, 8);
    if (!isInt(playerId) || !isFlag(jump) || !isNum(hopStart) || !isNum(jumpStart) || !isNum(end)) fail();
    const at = square(landed);
    const j = jump === 1 ? (board.jumpAt.get(at) ?? fail()) : null;
    return {
      playerId,
      from: square(from),
      path: list(path, MAX_PATH, square),
      landed: at,
      jump: j,
      hopStart,
      jumpStart,
      end,
    };
  });
  let dice: UlarShown['dice'] = null;
  if (r.dice !== null) {
    const [hopStart, face] = tuple(r.dice, 2);
    if (!isNum(hopStart) || !isInt(face) || face < 0 || face > 6) fail();
    dice = { hopStart, face };
  }
  let roll: UlarShown['roll'] = null;
  if (r.roll !== null) {
    const [active, deadline] = tuple(r.roll, 2);
    if ((active !== null && !isInt(active)) || !isNum(deadline)) fail();
    roll = { active, deadline };
  }
  const frozen = r.frozen;
  if (frozen !== null && !isNum(frozen)) fail();
  return { board, model, rest, banner, card, duel, duelTimes, shouts, bubbles, plans, dice, roll, frozen };
}
