/**
 * Long-distance play: the display state the Host's main screen publishes and a far-away main
 * screen draws with the same stage components. Pure (no DOM, no SDK): `toMirror` reads the match,
 * `applyMirror` validates untrusted JSON, `MirrorScene` turns it back into a `PenyusupScene`.
 *
 * Only what the Host's main screen shows goes out: roles, words, scores and votes stay home until
 * the stage reveals them (a mid-round score would give away who voted for an impostor).
 */
import { type PlayerInfo, parseLook } from '@hoorah/protocol';
import {
  CLUE_MAX,
  clockLength,
  MAX_VOTES,
  type Mode,
  type PenyusupMatch,
  type PenyusupScene,
  type Phase,
  type Role,
  type RoundOutcome,
  rankStandings,
  type SceneSeat,
  type Settings,
  type SetupStep,
  type Side,
  type Tally,
} from './logic';
import type { SeatInfo } from './screen';
import type { Lang } from './words';

const PHASES: readonly Phase[] = [
  'setup',
  'deal',
  'clue',
  'vote',
  'tally',
  'reveal',
  'guess',
  'roundEnd',
  'final',
  'ended',
];
const STEPS: readonly SetupStep[] = ['lang', 'mode', 'kosong'];
const LANGS: readonly Lang[] = ['id', 'en'];
const MODES: readonly Mode[] = ['lisan', 'ketik'];
const ROLES: readonly Role[] = ['warga', 'penyusup', 'kosong'];
const SIDES: readonly Side[] = ['warga', 'beda', 'kosong'];
const REASONS: readonly RoundOutcome['reason'][] = ['caught', 'outnumber', 'escaped', 'steal'];
const MAX_PLAYERS = 32;
const MAX_ROUNDS = 10;
/** Typed clue cards the stage shows at once. */
const WALL_MAX = 8;
/** Words, guesses and names: generous caps, the stage clips anything longer anyway. */
const TEXT_MAX = 40;

/** Seat flags, packed into one number per seat. */
const F_PRESENT = 1;
const F_IN_ROUND = 2;
const F_ALIVE = 4;
const F_READY = 8;
const F_LOCKED = 16;
const F_ALL = 31;

/** Compact wire shape (short keys: it crosses the network on every change). */
export interface PenyusupMirror {
  v: 1;
  ph: Phase;
  st: SetupStep;
  se: [Lang, Mode, boolean];
  /** Ronde index (-1 before the first deal) and rondes in the session. */
  r: number;
  n: number;
  /** Vote cycles already held this ronde. */
  vo: number;
  /** Host's player id (the setup poster names them). */
  h: number | null;
  /** Server ms the clock reaches zero (0 when none runs or while held). */
  end: number;
  /** Remaining ms on a held clock (0 otherwise). */
  left: number;
  held: boolean;
  /** Roster in join order: id, flags. */
  ro: [number, number][];
  /** Roles the stage shows right now (the voted-out card, everyone at the ronde's end). */
  rl: [number, Role][];
  /** The voted-out player's word while their card is turned. */
  wd: [number, string] | null;
  /** Total scores (final standings only). */
  sc: [number, number][];
  /** Points gained this ronde (ronde end only). */
  ga: [number, number][];
  /** Clue order, turn index, circuit, circuits (clue phase only). */
  ord: number[];
  tu: number;
  ci: [number, number];
  /** Clue just shown and the typed clue wall (clue phase only). */
  lc: [number, string] | null;
  cw: [number, string][];
  /** Vote count: per target id, votes, voters; out; tie (tally, reveal, guess). */
  ta: { c: [number, number, number[]][]; o: number | null; t: boolean } | null;
  /** Si Kosong's guess: text, correct (guess phase only). */
  gu: [string, boolean] | null;
  /** Ronde result: side, reason, warga word, other word (ronde end only). */
  oc: [Side, RoundOutcome['reason'], string, string] | null;
  pl: SeatInfo[];
}

export interface MirrorExtras {
  players: readonly PlayerInfo[];
  hostId: number | null;
}

function flagsOf(s: SceneSeat): number {
  return (
    (s.present ? F_PRESENT : 0) |
    (s.inRound ? F_IN_ROUND : 0) |
    (s.alive ? F_ALIVE : 0) |
    (s.ready ? F_READY : 0) |
    (s.locked ? F_LOCKED : 0)
  );
}

export function toMirror(match: PenyusupMatch, extras: MirrorExtras): PenyusupMirror {
  const m = match;
  const ph = m.phase;
  const roster = m.roster;
  const ids = new Set(roster.map((s) => s.id));
  const turned = ph === 'reveal' || ph === 'guess';
  const out = turned ? (m.tally?.out ?? null) : null;
  const outSeat = out !== null ? m.seat(out) : undefined;
  const clue = ph === 'clue';
  const tally = m.tally && (ph === 'tally' || turned) ? m.tally : null;
  const o = ph === 'roundEnd' ? m.outcome : null;
  return {
    v: 1,
    ph,
    st: m.step,
    se: [m.settings.lang, m.settings.mode, m.settings.kosong],
    r: m.round,
    n: m.rounds,
    vo: m.votes,
    h: extras.hostId,
    end: m.held ? 0 : m.clockEnd(),
    left: m.held ? Math.round(m.msLeft()) : 0,
    held: m.held,
    ro: roster.map((s) => [s.id, flagsOf(s)]),
    rl: ph === 'roundEnd' ? m.table.map((s) => [s.id, s.role]) : outSeat ? [[outSeat.id, outSeat.role]] : [],
    wd: outSeat ? [outSeat.id, outSeat.word] : null,
    sc: ph === 'final' || ph === 'ended' ? roster.map((s) => [s.id, s.score]) : [],
    ga: ph === 'roundEnd' ? m.table.map((s) => [s.id, s.gained]) : [],
    ord: clue ? [...m.order] : [],
    tu: clue ? m.turn : 0,
    ci: clue ? [m.circuit, m.circuits] : [0, 1],
    lc: clue && m.lastClue ? [m.lastClue.id, m.lastClue.text] : null,
    cw: clue && m.settings.mode === 'ketik' ? m.clueWall.slice(-WALL_MAX).map((c) => [c.id, c.text]) : [],
    ta: tally
      ? { c: tally.counts.map((c) => [c.id, c.votes, [...c.from]]), o: tally.out, t: tally.tie }
      : null,
    gu: ph === 'guess' && m.guessed ? [m.guessed.text, m.guessed.correct] : null,
    oc: o ? [o.side, o.reason, o.wargaWord, o.bedaWord] : null,
    pl: extras.players
      .filter((p) => ids.has(p.id))
      .map((p) => ({ id: p.id, name: p.name, color: p.color, look: p.look })),
  };
}

/* ------------------------------------------------------------------ validation */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isNat = (v: unknown): v is number => isInt(v) && v >= 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v);
const isTuple = (v: unknown, n: number): v is unknown[] => Array.isArray(v) && v.length === n;

function parseList<T>(v: unknown, item: (x: unknown) => T | null, max = MAX_PLAYERS): T[] | null {
  if (!Array.isArray(v) || v.length > max) return null;
  const out: T[] = [];
  for (const x of v) {
    const parsed = item(x);
    if (parsed === null) return null;
    out.push(parsed);
  }
  return out;
}

const natOrNull = (x: unknown): number | null => (isNat(x) ? x : null);

function idText(max: number) {
  return (v: unknown): [number, string] | null =>
    isTuple(v, 2) && isNat(v[0]) && isText(v[1], max) ? [v[0], v[1]] : null;
}

function idInt(v: unknown): [number, number] | null {
  return isTuple(v, 2) && isNat(v[0]) && isInt(v[1]) ? [v[0], v[1]] : null;
}

function parseSeatRow(v: unknown): [number, number] | null {
  return isTuple(v, 2) && isNat(v[0]) && isNat(v[1]) && v[1] <= F_ALL ? [v[0], v[1]] : null;
}

function parseRole(v: unknown): [number, Role] | null {
  return isTuple(v, 2) && isNat(v[0]) && oneOf(ROLES, v[1]) ? [v[0], v[1]] : null;
}

function parseTallyRow(v: unknown): [number, number, number[]] | null {
  if (!isTuple(v, 3) || !isNat(v[0]) || !isNat(v[1])) return null;
  const from = parseList(v[2], natOrNull);
  return from ? [v[0], v[1], from] : null;
}

/** undefined = malformed (null is a valid "nothing to show"). */
function parseTally(v: unknown): PenyusupMirror['ta'] | undefined {
  if (v === null) return null;
  if (!isObj(v) || !isBool(v.t) || (v.o !== null && !isNat(v.o))) return undefined;
  const c = parseList(v.c, parseTallyRow);
  return c ? { c, o: v.o, t: v.t } : undefined;
}

function parseOutcome(v: unknown): PenyusupMirror['oc'] | undefined {
  if (v === null) return null;
  if (!isTuple(v, 4) || !oneOf(SIDES, v[0]) || !oneOf(REASONS, v[1])) return undefined;
  if (!isText(v[2], TEXT_MAX) || !isText(v[3], TEXT_MAX)) return undefined;
  return [v[0], v[1], v[2], v[3]];
}

function parseGuess(v: unknown): [string, boolean] | null {
  return isTuple(v, 2) && isText(v[0], TEXT_MAX) && isBool(v[1]) ? [v[0], v[1]] : null;
}

function parseOptional<T>(v: unknown, item: (x: unknown) => T | null): T | null | undefined {
  if (v === null) return null;
  return item(v) ?? undefined;
}

function parsePlayer(v: unknown): SeatInfo | null {
  if (!isObj(v) || !isNat(v.id) || !isText(v.name, TEXT_MAX) || !isText(v.color, 16)) return null;
  const look = parseLook(v.look);
  return look ? { id: v.id, name: v.name, color: v.color, look } : null;
}

function parseSettings(v: unknown): PenyusupMirror['se'] | null {
  if (!isTuple(v, 3) || !oneOf(LANGS, v[0]) || !oneOf(MODES, v[1]) || !isBool(v[2])) return null;
  return [v[0], v[1], v[2]];
}

/** Validates a published state from the network; null if anything is off. */
export function applyMirror(json: unknown): PenyusupMirror | null {
  if (!isObj(json) || json.v !== 1) return null;
  const j = json;
  if (!oneOf(PHASES, j.ph) || !oneOf(STEPS, j.st)) return null;
  if (!isInt(j.n) || j.n < 1 || j.n > MAX_ROUNDS || !isInt(j.r) || j.r < -1 || j.r >= j.n) return null;
  if (!isNat(j.vo) || j.vo > MAX_VOTES || (j.h !== null && !isNat(j.h))) return null;
  if (!isNum(j.end) || !isNum(j.left) || j.left < 0 || !isBool(j.held)) return null;
  if (!isNat(j.tu) || !isTuple(j.ci, 2) || !isNat(j.ci[0]) || !isNat(j.ci[1])) return null;
  const se = parseSettings(j.se);
  const ro = parseList(j.ro, parseSeatRow);
  const rl = parseList(j.rl, parseRole);
  const wd = parseOptional(j.wd, idText(TEXT_MAX));
  const sc = parseList(j.sc, idInt);
  const ga = parseList(j.ga, idInt);
  const ord = parseList(j.ord, natOrNull);
  const lc = parseOptional(j.lc, idText(CLUE_MAX));
  const cw = parseList(j.cw, idText(CLUE_MAX), WALL_MAX);
  const ta = parseTally(j.ta);
  const gu = parseOptional(j.gu, parseGuess);
  const oc = parseOutcome(j.oc);
  const pl = parseList(j.pl, parsePlayer);
  if (!se || !ro || !rl || wd === undefined || !sc || !ga || !ord || lc === undefined || !cw) return null;
  if (ta === undefined || gu === undefined || oc === undefined || !pl) return null;
  return {
    v: 1,
    ph: j.ph,
    st: j.st,
    se,
    r: j.r,
    n: j.n,
    vo: j.vo,
    h: j.h,
    end: j.end,
    left: j.left,
    held: j.held,
    ro,
    rl,
    wd,
    sc,
    ga,
    ord,
    tu: j.tu,
    ci: [j.ci[0], j.ci[1]],
    lc,
    cw,
    ta,
    gu,
    oc,
    pl,
  };
}

/* ------------------------------------------------------------------ mirror scene */

function seatsOf(state: PenyusupMirror): SceneSeat[] {
  const roles = new Map(state.rl);
  const scores = new Map(state.sc);
  const gains = new Map(state.ga);
  return state.ro.map(([id, f], joinIndex) => ({
    id,
    joinIndex,
    present: (f & F_PRESENT) !== 0,
    inRound: (f & F_IN_ROUND) !== 0,
    alive: (f & F_ALIVE) !== 0,
    ready: (f & F_READY) !== 0,
    locked: (f & F_LOCKED) !== 0,
    role: roles.get(id) ?? null,
    word: state.wd && state.wd[0] === id ? state.wd[1] : null,
    score: scores.get(id) ?? 0,
    gained: gains.get(id) ?? 0,
  }));
}

/**
 * A `PenyusupScene` drawn from published states. One instance lives for the whole match; `set`
 * swaps each new state in. The clock runs locally from the end time and freezes while either
 * screen is paused.
 */
export class MirrorScene implements PenyusupScene {
  private state: PenyusupMirror;
  private seats: SceneSeat[];
  private frozenLeft: number | null = null;

  constructor(
    state: PenyusupMirror,
    private readonly now: () => number,
  ) {
    this.state = state;
    this.seats = seatsOf(state);
  }

  get current(): PenyusupMirror {
    return this.state;
  }

  set(state: PenyusupMirror): void {
    this.state = state;
    this.seats = seatsOf(state);
    if (this.frozenLeft !== null) this.frozenLeft = this.liveLeft();
  }

  /** The local screen paused or resumed: hold the clock where it is. */
  setLocalPause(paused: boolean): void {
    if (paused) this.frozenLeft ??= this.msLeft();
    // On resume the Host's end time is the truth again (it republishes after its own resume).
    else this.frozenLeft = null;
  }

  private liveLeft(): number {
    const s = this.state;
    if (s.held) return s.left;
    return s.end > 0 ? Math.max(0, s.end - this.now()) : 0;
  }

  get phase(): Phase {
    return this.state.ph;
  }
  get step(): SetupStep {
    return this.state.st;
  }
  get settings(): Settings {
    const [lang, mode, kosong] = this.state.se;
    return { lang, mode, kosong };
  }
  get round(): number {
    return this.state.r;
  }
  get rounds(): number {
    return this.state.n;
  }
  get isFinal(): boolean {
    return this.state.r === this.state.n - 1;
  }
  get votes(): number {
    return this.state.vo;
  }
  get roster(): readonly SceneSeat[] {
    return this.seats;
  }
  get table(): SceneSeat[] {
    return this.seats.filter((s) => s.inRound);
  }
  get voters(): SceneSeat[] {
    return this.seats.filter((s) => s.inRound && s.alive && s.present);
  }
  get votersLeft(): SceneSeat[] {
    return this.voters.filter((s) => !s.locked);
  }
  get speaker(): number | null {
    return this.state.ph === 'clue' ? (this.state.ord[this.state.tu] ?? null) : null;
  }
  get spoken(): number[] {
    return this.state.ph === 'clue' ? this.state.ord.slice(0, this.state.tu) : [];
  }
  get upcoming(): number[] {
    return this.state.ph === 'clue' ? this.state.ord.slice(this.state.tu + 1) : [];
  }
  get circuit(): number {
    return this.state.ci[0];
  }
  get circuits(): number {
    return this.state.ci[1];
  }
  get lastClue(): { id: number; text: string } | null {
    const lc = this.state.lc;
    return lc ? { id: lc[0], text: lc[1] } : null;
  }
  get clueWall(): { id: number; text: string }[] {
    return this.state.cw.map(([id, text]) => ({ id, text }));
  }
  get tally(): Tally | null {
    const t = this.state.ta;
    if (!t) return null;
    return { counts: t.c.map(([id, votes, from]) => ({ id, votes, from })), out: t.o, tie: t.t };
  }
  get guessed(): { text: string; correct: boolean } | null {
    const g = this.state.gu;
    return g ? { text: g[0], correct: g[1] } : null;
  }
  get outcome(): Omit<RoundOutcome, 'kosongId'> | null {
    const o = this.state.oc;
    return o ? { side: o[0], reason: o[1], wargaWord: o[2], bedaWord: o[3] } : null;
  }

  seat(id: number): SceneSeat | undefined {
    return this.seats.find((s) => s.id === id);
  }

  standings(): { seat: SceneSeat; rank: number }[] {
    return rankStandings(this.seats);
  }

  msLeft(): number {
    return this.frozenLeft ?? this.liveLeft();
  }

  phaseLength(): number {
    return clockLength(this.state.ph);
  }

  hostId(): number | null {
    return this.state.h;
  }

  info(id: number): SeatInfo | undefined {
    return this.state.pl.find((p) => p.id === id);
  }
}
