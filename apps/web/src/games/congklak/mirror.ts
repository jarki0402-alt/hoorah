/**
 * Long-distance play: the display state the Host's Congklak publishes and a far-away main
 * screen draws. A move travels whole (board before it, its steps, start time) so the far screen
 * sows it seed by seed by itself; scores that change while seeds land are rebuilt from the
 * replayed board, not streamed. Times cross as server ms. Pure.
 */
import { type Fruit, isFruit, type Look, parseLook } from '@hoorah/protocol';
import { type Side, type Step, storeOf } from './logic';
import type { Banner, Bubble, HudModel, PanelModel, PlayerCard, Toast } from './tv';

export const MIRROR_VERSION = 1;
const PITS = 16;

/** The move the far screen replays. `n` numbers moves so each one is replayed once. */
export interface MirrorMoveSrc {
  n: number;
  before: number[];
  steps: readonly Step[];
  side: Side;
  /** Host game time. */
  startAt: number;
}

type Person = [id: number, name: string, fruit: Fruit, look: Look, color: string, on: 0 | 1];
type Panel = [label: string, members: number[], mover: number | null, status: string, active: 0 | 1];
type Hand = [n: number, side: Side, startAt: number, before: number[], steps: number[]];

export interface CongklakMirror {
  v: typeof MIRROR_VERSION;
  people: Person[];
  chip: string;
  panels: [Panel, Panel];
  banner: Banner | null;
  /** Store totals of finished rounds; `live` adds the stores on the board; `tot` shows totals. */
  sum: [number, number];
  live: boolean;
  tot: boolean;
  /** Board when no move is replayed (between rounds), else ignored for `mv[3]`. */
  board: number[];
  mv: Hand | null;
  /** Side picking right now (its row glows), null while seeds are sown or between turns. */
  turn: Side | null;
  flash: number[];
  fk: number;
  toasts: Toast[];
  bubbles: [Bubble[], Bubble[]];
  /** Turn timer: side and deadline (server ms). */
  timer: [side: Side, deadline: number] | null;
  frozen: number | null;
}

export interface MirrorSource {
  hud: HudModel;
  /** Shown board when no move is replayed. */
  counts: readonly number[];
  move: MirrorMoveSrc | null;
  sum: [number, number];
  live: boolean;
  tot: boolean;
  turn: Side | null;
  flash: readonly number[];
  flashKey: number;
  toasts: readonly Toast[];
  bubbles: readonly [readonly Bubble[], readonly Bubble[]];
  timer: { side: Side; deadline: number } | null;
  frozenAt: number | null;
  toServer(t: number): number;
}

/* ------------------------------------------------------------------ steps on the wire */

/** drop = pos, take = 16 + pos, capture = 32 + pos (counts and the hole across follow). */
export function encodeSteps(steps: readonly Step[]): number[] {
  return steps.map((s) => (s.t === 'drop' ? s.pos : s.t === 'take' ? PITS + s.pos : 2 * PITS + s.pos));
}

/** Rebuilds the steps by sowing them on a copy of `before`; throws on an impossible move. */
export function decodeSteps(codes: readonly number[], before: readonly number[], side: Side): Step[] {
  const b = before.slice();
  let hand = 0;
  return codes.map((c): Step => {
    if (!Number.isInteger(c) || c < 0 || c >= 3 * PITS) throw new Error('step');
    const pos = c % PITS;
    if (c < PITS) {
      if (hand <= 0) throw new Error('step');
      hand--;
      b[pos]!++;
      return { t: 'drop', pos };
    }
    if (c < 2 * PITS) {
      const n = b[pos]!;
      hand += n;
      b[pos] = 0;
      return { t: 'take', pos, n };
    }
    const opp = 14 - pos;
    if (pos === 7 || pos === 15) throw new Error('step');
    const n = b[pos]! + b[opp]!;
    const st = storeOf(side);
    b[st] = b[st]! + n;
    b[pos] = 0;
    b[opp] = 0;
    return { t: 'capture', pos, opp, n };
  });
}

/* ------------------------------------------------------------------ build */

export function toMirror(src: MirrorSource): CongklakMirror {
  const t = (v: number) => Math.round(src.toServer(v));
  const people = new Map<number, Person>();
  const panel = (p: PanelModel): Panel => {
    for (const m of p.members)
      people.set(m.id, [m.id, m.name, m.fruit, m.look, m.color, m.connected ? 1 : 0]);
    return [p.label, p.members.map((m) => m.id), p.mover, p.status, p.active ? 1 : 0];
  };
  const mv = src.move;
  return {
    v: MIRROR_VERSION,
    chip: src.hud.chip,
    panels: [panel(src.hud.panels[0]), panel(src.hud.panels[1])],
    people: [...people.values()],
    banner: src.hud.banner,
    sum: [...src.sum],
    live: src.live,
    tot: src.tot,
    board: mv ? [] : [...src.counts],
    mv: mv ? [mv.n, mv.side, t(mv.startAt), [...mv.before], encodeSteps(mv.steps)] : null,
    turn: src.turn,
    flash: [...src.flash],
    fk: src.flashKey,
    toasts: src.toasts.map((x) => ({ ...x, until: t(x.until) })),
    bubbles: [
      src.bubbles[0].map((x) => ({ ...x, until: t(x.until) })),
      src.bubbles[1].map((x) => ({ ...x, until: t(x.until) })),
    ],
    timer: src.timer ? [src.timer.side, t(src.timer.deadline)] : null,
    frozen: src.frozenAt === null ? null : t(src.frozenAt),
  };
}

/* ------------------------------------------------------------------ validation */

const COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
const MAX_TEXT = 160;
const MAX_SEEDS = 200;
const MAX_STEPS = 1500;
const MAX_MEMBERS = 16;

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);
const isText = (v: unknown, max = MAX_TEXT): v is string => typeof v === 'string' && v.length <= max;
const isSide = (v: unknown): v is Side => v === 0 || v === 1;
const isFlag = (v: unknown): v is 0 | 1 => v === 0 || v === 1;

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

function board(v: unknown): number[] {
  const b = list(v, PITS, (n) => (isInt(n) && n >= 0 && n <= MAX_SEEDS ? n : fail()));
  if (b.length !== PITS) fail();
  return b;
}

function pair(v: unknown): [number, number] {
  if (!Array.isArray(v) || v.length !== 2 || !v.every((n) => isInt(n) && n >= 0)) fail();
  return [v[0] as number, v[1] as number];
}

function banner(v: unknown): Banner | null {
  if (v === null) return null;
  if (!isRec(v) || !isInt(v.key) || !isText(v.title) || !isText(v.sub)) fail();
  if (v.kind === 'intro') {
    if (!isText(v.hint) || !isSide(v.side)) fail();
    return { kind: 'intro', key: v.key, title: v.title, sub: v.sub, hint: v.hint, side: v.side };
  }
  if (v.kind !== 'round' && v.kind !== 'final') fail();
  if ((v.next !== null && !isText(v.next)) || (v.winner !== null && !isSide(v.winner))) fail();
  const labels = v.labels;
  if (!Array.isArray(labels) || labels.length !== 2 || !labels.every((l) => isText(l))) fail();
  return {
    kind: v.kind,
    key: v.key,
    title: v.title,
    sub: v.sub,
    next: v.next,
    winner: v.winner,
    stores: pair(v.stores),
    labels: [labels[0] as string, labels[1] as string],
  };
}

function toast(v: unknown): Toast {
  if (!isRec(v) || !isInt(v.id) || !isText(v.text) || !isNum(v.x) || !isNum(v.y) || !isNum(v.until)) fail();
  if (v.kind !== 'extra' && v.kind !== 'capture' && v.kind !== 'info') fail();
  return { id: v.id, text: v.text, kind: v.kind, x: v.x, y: v.y, until: v.until };
}

function bubble(v: unknown): Bubble {
  if (!isRec(v) || !isInt(v.id) || !isText(v.text) || !isText(v.who, 40) || !isNum(v.until)) fail();
  if (v.tone !== 'cheer' && v.tone !== 'boo' && v.tone !== 'rematch') fail();
  return { id: v.id, text: v.text, who: v.who, tone: v.tone, until: v.until };
}

/** A panel without the numbers that follow the seeds (store, total, lead). */
export type PanelBase = Omit<PanelModel, 'store' | 'total' | 'lead'>;

export interface ShownMove {
  n: number;
  side: Side;
  startAt: number;
  before: number[];
  steps: Step[];
}

/** The validated display state. */
export interface CongklakShown {
  chip: string;
  panels: [PanelBase, PanelBase];
  banner: Banner | null;
  sum: [number, number];
  live: boolean;
  tot: boolean;
  board: number[];
  move: ShownMove | null;
  turn: Side | null;
  flash: number[];
  flashKey: number;
  toasts: Toast[];
  bubbles: [Bubble[], Bubble[]];
  timer: { side: Side; deadline: number } | null;
  frozen: number | null;
}

/** Validates a published state; null when anything is off (the screen keeps the last good one). */
export function applyMirror(raw: unknown): CongklakShown | null {
  try {
    return parse(raw);
  } catch {
    return null;
  }
}

function parse(raw: unknown): CongklakShown {
  if (!isRec(raw) || raw.v !== MIRROR_VERSION) fail();
  const r = raw;
  const people = new Map(list(r.people, MAX_MEMBERS * 2, person).map((p) => [p.id, p]));
  const who = (id: unknown): PlayerCard => {
    const p = isInt(id) ? people.get(id) : undefined;
    return p ?? fail();
  };
  if (!Array.isArray(r.panels) || r.panels.length !== 2) fail();
  const panels = (r.panels as unknown[]).map((v, i): PanelBase => {
    if (!Array.isArray(v) || v.length !== 5) fail();
    const [label, members, mover, status, active] = v as unknown[];
    if (!isText(label) || !isText(status) || !isFlag(active) || (mover !== null && !isInt(mover))) fail();
    return {
      side: i as Side,
      label,
      members: list(members, MAX_MEMBERS, who),
      mover,
      status,
      active: active === 1,
    };
  }) as [PanelBase, PanelBase];
  if (!isText(r.chip) || typeof r.live !== 'boolean' || typeof r.tot !== 'boolean') fail();
  let move: ShownMove | null = null;
  if (r.mv !== null) {
    if (!Array.isArray(r.mv) || r.mv.length !== 5) fail();
    const [n, side, startAt, before, codes] = r.mv as unknown[];
    if (!isInt(n) || !isSide(side) || !isNum(startAt)) fail();
    const b = board(before);
    const steps = decodeSteps(
      list(codes, MAX_STEPS, (c) => (isInt(c) ? c : fail())),
      b,
      side,
    );
    move = { n, side, startAt, before: b, steps };
  }
  const turn = r.turn;
  if (turn !== null && !isSide(turn)) fail();
  if (!isInt(r.fk)) fail();
  const timerRaw = r.timer;
  let timer: CongklakShown['timer'] = null;
  if (timerRaw !== null) {
    if (!Array.isArray(timerRaw) || timerRaw.length !== 2) fail();
    const [side, deadline] = timerRaw as unknown[];
    if (!isSide(side) || !isNum(deadline)) fail();
    timer = { side, deadline };
  }
  const frozen = r.frozen;
  if (frozen !== null && !isNum(frozen)) fail();
  if (!Array.isArray(r.bubbles) || r.bubbles.length !== 2) fail();
  const [b0, b1] = r.bubbles as unknown[];
  return {
    chip: r.chip,
    panels,
    banner: banner(r.banner),
    sum: pair(r.sum),
    live: r.live,
    tot: r.tot,
    board: move ? move.before : board(r.board),
    move,
    turn,
    flash: list(r.flash, PITS, (p) => (isInt(p) && p >= 0 && p < PITS ? p : fail())),
    flashKey: r.fk,
    toasts: list(r.toasts, 8, toast),
    bubbles: [list(b0, 6, bubble), list(b1, 6, bubble)],
    timer,
    frozen,
  };
}

/**
 * The HUD for a board the far screen shows right now: stores, totals and the leader follow the
 * seeds exactly like on the Host's screen.
 */
export function hudFor(s: CongklakShown, counts: readonly number[]): HudModel {
  const totals: [number, number] = [0, 1].map(
    (side) => s.sum[side]! + (s.live ? counts[storeOf(side as Side)]! : 0),
  ) as [number, number];
  const lead: Side | null = totals[0] === totals[1] ? null : totals[0] > totals[1] ? 0 : 1;
  const panel = (p: PanelBase): PanelModel => ({
    ...p,
    store: counts[storeOf(p.side)]!,
    total: s.tot ? totals[p.side] : null,
    lead: lead === p.side,
  });
  return { chip: s.chip, panels: [panel(s.panels[0]), panel(s.panels[1])], banner: s.banner };
}
