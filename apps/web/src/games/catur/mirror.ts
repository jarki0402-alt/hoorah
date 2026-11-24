/**
 * Long-distance play: the display state the Host's Catur publishes and a far-away main screen
 * draws. `toMirror` reads only what the main-screen view shows; `applyMirror` validates the
 * network copy and turns it back into a `MatchView` (no rules: the replica cannot play a move).
 * Pure.
 */
import { type Fruit, isFruit, type Look, type PlayerInfo, parseLook } from '@hoorah/protocol';
import { type Color, opposite } from './chess';
import type { EndReason, Mode, Outcome, Phase } from './logic';
import type { MatchView, ShownMove, ShownVote } from './tv';

export const MIRROR_VERSION = 1;

/** One player as the view draws them (avatar, ring colour, name, dimmed when offline). */
export type MirrorPerson = [id: number, name: string, fruit: Fruit, look: Look, color: string, on: 0 | 1];

/** One team-vote proposal: UCI, SAN, count, voter ids. */
export type MirrorVote = [move: string, san: string, count: number, voters: number[]];

export interface CaturMirror {
  v: typeof MIRROR_VERSION;
  mode: Mode;
  min: number;
  /** Increment per move, ms. */
  inc: number;
  phase: Phase;
  w: number[];
  b: number[];
  turn: Color;
  held: boolean;
  /** Server ms: intro/over countdown and the team vote. */
  pu: number;
  vu: number;
  /** Clocks: ms left for white and black at server time `at` (the side to move runs from there). */
  ck: [w: number, b: number, at: number];
  /** 64 FEN letters, a8 first, '.' = empty. */
  board: string;
  /** Every move so far in SAN, the first played by `c0`. */
  san: string[];
  c0: Color;
  /** UCI of the last move (the slide and the from/to marks), null before the first move. */
  last: string | null;
  check: string | null;
  out: [winner: Color | null, reason: EndReason] | null;
  /** Captured pieces per capturing colour, FEN letters in display order. */
  cap: [w: string, b: string];
  mat: number;
  tally: MirrorVote[];
  people: MirrorPerson[];
  notice: string | null;
}

/** What `toMirror` reads (`CaturMatch` fits): the view plus the raw chess clocks. */
export interface MirrorSource extends MatchView {
  /** Ms left per colour at server time `clockAt` (the side to move runs from there). */
  readonly clock: { readonly w: number; readonly b: number };
  readonly clockAt: number;
}

export function toMirror(
  match: MirrorSource,
  board: string,
  notice: string | null,
  info: (id: number) => PlayerInfo | undefined,
): CaturMirror {
  const ids = new Set<number>([...match.sides.w, ...match.sides.b]);
  const tally = match.mode === 'team' && match.phase === 'play' ? match.tally() : [];
  for (const t of tally) for (const id of t.voters) ids.add(id);
  const people: MirrorPerson[] = [];
  for (const id of ids) {
    const p = info(id);
    if (p) people.push([p.id, p.name, p.fruit, p.look, p.color, match.isConnected(id) ? 1 : 0]);
  }
  const cap = match.captures();
  const last = match.lastMove();
  const out = match.outcome;
  return {
    v: MIRROR_VERSION,
    mode: match.mode,
    min: match.minutes,
    inc: match.increment,
    phase: match.phase,
    w: [...match.sides.w],
    b: [...match.sides.b],
    turn: match.turn,
    held: match.held,
    pu: Math.round(match.phaseUntil),
    vu: Math.round(match.voteUntil),
    ck: [Math.round(match.clock.w), Math.round(match.clock.b), Math.round(match.clockAt)],
    board,
    san: match.history.map((m) => m.san),
    c0: match.history[0]?.color ?? 'w',
    last: last?.uci ?? null,
    check: match.checkSquare() ?? null,
    out: out ? [out.winner, out.reason] : null,
    cap: [cap.w.join(''), cap.b.join('')],
    mat: match.material(),
    tally: tally.map((t) => [t.move, match.sanOf(t.move), t.count, [...t.voters]]),
    people,
    notice,
  };
}

/* ------------------------------------------------------------------ validation */

const MODES: readonly Mode[] = ['duel', 'team'];
const PHASES: readonly Phase[] = ['intro', 'play', 'over', 'ended'];
const REASONS: readonly EndReason[] = [
  'checkmate',
  'timeout',
  'resign',
  'stalemate',
  'insufficient',
  'repetition',
  'fifty',
  'timeout-draw',
];
const BOARD_RE = /^[.pnbrqkPNBRQK]{64}$/;
const SQUARE_RE = /^[a-h][1-8]$/;
const UCI_RE = /^[a-h][1-8][a-h][1-8][nbrq]?$/;
const SAN_RE = /^[A-Za-z0-9+#=\-x]{1,10}$/;
const PIECES_RE = /^[pnbrqkPNBRQK]{0,16}$/;
const COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
const MAX_PLIES = 1200;
const MAX_IDS = 32;
const MAX_TEXT = 120;

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);
const isColor = (v: unknown): v is Color => v === 'w' || v === 'b';
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v);
const text = (v: unknown, max = MAX_TEXT): v is string => typeof v === 'string' && v.length <= max;

function ids(v: unknown): number[] | null {
  if (!Array.isArray(v) || v.length > MAX_IDS || !v.every(isInt)) return null;
  return v as number[];
}

function person(v: unknown): PlayerInfo | null {
  if (!Array.isArray(v) || v.length !== 6) return null;
  const [id, name, fruit, rawLook, color, on] = v as unknown[];
  const look = parseLook(rawLook);
  if (!isInt(id) || !text(name, 40) || !isFruit(fruit) || !look) return null;
  if (typeof color !== 'string' || !COLOR_RE.test(color) || (on !== 0 && on !== 1)) return null;
  return { id, name, fruit, look, color, connected: on === 1, isHost: false };
}

function vote(v: unknown): ShownVote & { san: string } {
  if (!Array.isArray(v) || v.length !== 4) throw new Error('vote');
  const [move, sanText, count, voters] = v as unknown[];
  const list = ids(voters);
  if (typeof move !== 'string' || !UCI_RE.test(move) || typeof sanText !== 'string') throw new Error('vote');
  if (!SAN_RE.test(sanText) || !isInt(count) || count < 0 || !list) throw new Error('vote');
  return { move, san: sanText, count, voters: list };
}

/** The validated display state, ready to draw. */
export interface CaturShown {
  match: MatchView;
  board: string;
  people: PlayerInfo[];
  notice: string | null;
}

/** Validates a published state; null when anything is off (the screen keeps the last good one). */
export function applyMirror(raw: unknown): CaturShown | null {
  try {
    return parse(raw);
  } catch {
    return null;
  }
}

function parse(raw: unknown): CaturShown | null {
  if (!isRec(raw) || raw.v !== MIRROR_VERSION) return null;
  const r = raw;
  if (!oneOf(MODES, r.mode) || !oneOf(PHASES, r.phase) || !isColor(r.turn) || !isColor(r.c0)) return null;
  if (!isNum(r.min) || !isNum(r.inc) || !isNum(r.pu) || !isNum(r.vu) || typeof r.held !== 'boolean')
    return null;
  if (!isNum(r.mat) || typeof r.board !== 'string' || !BOARD_RE.test(r.board)) return null;
  const w = ids(r.w);
  const b = ids(r.b);
  if (!w || !b) return null;
  const ck = r.ck;
  if (!Array.isArray(ck) || ck.length !== 3 || !ck.every(isNum)) return null;
  const [cw, cb, at] = ck as [number, number, number];
  if (!Array.isArray(r.san) || r.san.length > MAX_PLIES) return null;
  if (!r.san.every((s) => typeof s === 'string' && SAN_RE.test(s))) return null;
  const last = r.last;
  if (last !== null && (typeof last !== 'string' || !UCI_RE.test(last))) return null;
  const check = r.check;
  if (check !== null && (typeof check !== 'string' || !SQUARE_RE.test(check))) return null;
  let outcome: Outcome | null = null;
  if (r.out !== null) {
    if (!Array.isArray(r.out) || r.out.length !== 2) return null;
    const [winner, reason] = r.out as unknown[];
    if ((winner !== null && !isColor(winner)) || !oneOf(REASONS, reason)) return null;
    outcome = { winner, reason };
  }
  const cap = r.cap;
  if (!Array.isArray(cap) || cap.length !== 2) return null;
  const [capW, capB] = cap as unknown[];
  if (typeof capW !== 'string' || typeof capB !== 'string' || !PIECES_RE.test(capW) || !PIECES_RE.test(capB))
    return null;
  if (!Array.isArray(r.tally) || r.tally.length > 64) return null;
  const tally = r.tally.map(vote);
  if (!Array.isArray(r.people) || r.people.length > MAX_IDS) return null;
  const people: PlayerInfo[] = [];
  for (const p of r.people) {
    const ok = person(p);
    if (ok) people.push(ok);
  }
  const notice = r.notice;
  if (notice !== null && !text(notice)) return null;

  const c0: Color = r.c0;
  const sans = r.san as string[];
  const history: ShownMove[] = sans.map((s, i) => ({
    uci: i === sans.length - 1 ? (last ?? '') : '',
    san: s,
    color: i % 2 === 0 ? c0 : opposite(c0),
  }));
  const on = new Set(people.filter((p) => p.connected).map((p) => p.id));
  const sanOf = new Map(tally.map((t) => [t.move, t.san]));
  const held = r.held;
  const phase = r.phase;
  const turn = r.turn;
  const running = phase === 'play' && !held;
  const clock = { w: cw, b: cb };
  const match: MatchView = {
    mode: r.mode,
    minutes: r.min,
    increment: r.inc,
    phase,
    sides: { w, b },
    outcome,
    turn,
    running,
    held,
    phaseUntil: r.pu,
    voteUntil: r.vu,
    history,
    lastMove: () => history[history.length - 1],
    checkSquare: () => check ?? undefined,
    tally: () => tally.map(({ move, count, voters }) => ({ move, count, voters })),
    captures: () => ({ w: capW.split(''), b: capB.split('') }),
    material: () => r.mat as number,
    timeLeft: (c, now) => Math.max(0, running && turn === c ? clock[c] - (now - at) : clock[c]),
    isConnected: (id) => on.has(id),
    sanOf: (move) => sanOf.get(move) ?? move,
  };
  return { match, board: r.board, people, notice };
}
