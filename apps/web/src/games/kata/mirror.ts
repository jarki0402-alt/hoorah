/**
 * Long-distance play: the display state the Host's main screen publishes and a far-away main
 * screen draws with the same page components. Pure (no DOM, no SDK): `toMirror` reads the scene,
 * `applyMirror` validates untrusted JSON, `MirrorScene` turns it back into a `KataScene`.
 */

import { parseLook } from '@hoorah/protocol';
import type {
  KataScene,
  NextTurn,
  Phase,
  Reason,
  SceneAttempt,
  SceneLink,
  SceneSeat,
  StartKind,
} from './logic';
import type { Banner, LogEntry, SeatInfo, ThenStart } from './screen';

const PHASES: readonly Phase[] = ['intro', 'turn', 'verdict', 'final', 'ended'];
const STARTS: readonly StartKind[] = ['first', 'chain', 'fresh', 'stuck'];
const REASONS: readonly Reason[] = ['timeout', 'start', 'short', 'used', 'unknown'];
/** Notebook lines sent: more than the tallest stage shows (the page keeps the newest it fits). */
export const MIRROR_LOG = 16;
const MAX_SEATS = 32;
const MAX_WORD = 40;

/** Compact wire shape (short keys: it crosses the network on every change). */
export interface KataMirror {
  v: 1;
  ph: Phase;
  rd: number;
  lv: number;
  tm: number;
  tn: number;
  cur: number;
  px: string;
  sk: StartKind;
  sf: string | null;
  win: number | null;
  /** Server ms the current turn runs out (only meaningful in 'turn' and while not held). */
  end: number;
  /** Turn time left when the state was made, for a held (paused) game. */
  left: number;
  held: boolean;
  ch: number;
  ll: SceneLink | null;
  at: SceneAttempt | null;
  nx: NextTurn | null;
  /** Seats in order: id, lives, words. */
  se: [number, number, number][];
  log: LogEntry[];
  bn: Banner | null;
  pl: SeatInfo[];
  wait: boolean;
}

export interface MirrorInput {
  scene: KataScene;
  /** Game time now, on the scene's clock. */
  now: number;
  /** Game time -> server time. */
  toServer: (t: number) => number;
  held: boolean;
  log: readonly LogEntry[];
  banner: Banner | null;
  info: (id: number) => SeatInfo | undefined;
  waiting: boolean;
}

const linkOf = (l: SceneLink): SceneLink => ({
  word: l.word,
  by: l.by,
  join: l.join,
  tail: l.tail,
  ms: l.ms,
});
const attemptOf = (a: SceneAttempt): SceneAttempt => ({
  by: a.by,
  word: a.word,
  prefix: a.prefix,
  ok: a.ok,
  reason: a.reason,
  ms: a.ms,
  out: a.out,
});

function entryOf(e: LogEntry): LogEntry {
  const after = 'after' in e && e.after ? { after: { prefix: e.after.prefix, stuck: e.after.stuck } } : {};
  switch (e.kind) {
    case 'start':
      return { kind: 'start', key: e.key, prefix: e.prefix, start: e.start, stuckFrom: e.stuckFrom };
    case 'word':
      return { kind: 'word', key: e.key, link: linkOf(e.link), ...after };
    case 'miss':
      return { kind: 'miss', key: e.key, attempt: attemptOf(e.attempt), ...after };
  }
}

export function toMirror(x: MirrorInput): KataMirror {
  const m = x.scene;
  const live = m.phase === 'turn';
  const left = live ? Math.max(0, Math.round(m.deadline - x.now)) : 0;
  const pl: SeatInfo[] = [];
  for (const s of m.seats) {
    const p = x.info(s.id);
    if (p) pl.push({ id: p.id, name: p.name, color: p.color, look: p.look });
  }
  return {
    v: 1,
    ph: m.phase,
    rd: m.round,
    lv: m.lives,
    tm: m.turnMs,
    tn: m.turnNo,
    cur: m.current,
    px: m.prefix,
    sk: m.startKind,
    sf: m.stuckFrom,
    win: m.winner,
    end: live ? Math.round(x.toServer(m.deadline)) : 0,
    left,
    held: x.held,
    ch: m.chainLength,
    ll: m.lastLink ? linkOf(m.lastLink) : null,
    at: m.attempt ? attemptOf(m.attempt) : null,
    nx: m.next ? { ...m.next } : null,
    se: m.seats.map((s) => [s.id, s.lives, s.words]),
    log: x.log.slice(-MIRROR_LOG).map(entryOf),
    bn: x.banner ? { key: x.banner.key, text: x.banner.text } : null,
    pl,
    wait: x.waiting,
  };
}

/* ------------------------------------------------------------------ validation */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isNat = (v: unknown): v is number => isInt(v) && v >= 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isMs = (v: unknown): v is number => isNum(v) && v >= 0;
const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const isWord = (v: unknown): v is string => isText(v, MAX_WORD);
const isNullableWord = (v: unknown): v is string | null => v === null || isWord(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v);

function parseLink(v: unknown): SceneLink | null {
  if (!isObj(v) || !isWord(v.word) || !isInt(v.by) || !isNat(v.join) || !isNat(v.tail) || !isMs(v.ms)) {
    return null;
  }
  return { word: v.word, by: v.by, join: v.join, tail: v.tail, ms: v.ms };
}

function parseAttempt(v: unknown): SceneAttempt | null {
  if (!isObj(v) || !isInt(v.by) || !isWord(v.word) || !isWord(v.prefix) || !isBool(v.ok)) return null;
  if (v.reason !== null && !oneOf(REASONS, v.reason)) return null;
  if (!isMs(v.ms) || !isBool(v.out)) return null;
  return { by: v.by, word: v.word, prefix: v.prefix, ok: v.ok, reason: v.reason, ms: v.ms, out: v.out };
}

function parseNext(v: unknown): NextTurn | null {
  if (!isObj(v) || !isNat(v.index) || !isWord(v.prefix) || !oneOf(STARTS, v.kind)) return null;
  if (!isNullableWord(v.stuckFrom)) return null;
  return { index: v.index, prefix: v.prefix, kind: v.kind, stuckFrom: v.stuckFrom };
}

function parseThen(v: unknown): ThenStart | null {
  if (!isObj(v) || !isWord(v.prefix) || !isBool(v.stuck)) return null;
  return { prefix: v.prefix, stuck: v.stuck };
}

function parseEntry(v: unknown): LogEntry | null {
  if (!isObj(v) || !isText(v.key, 16)) return null;
  let after: { after?: ThenStart } = {};
  if (v.after !== undefined) {
    const then = parseThen(v.after);
    if (!then) return null;
    after = { after: then };
  }
  switch (v.kind) {
    case 'start':
      if (!isWord(v.prefix) || !oneOf(STARTS, v.start) || !isNullableWord(v.stuckFrom)) return null;
      return { kind: 'start', key: v.key, prefix: v.prefix, start: v.start, stuckFrom: v.stuckFrom };
    case 'word': {
      const link = parseLink(v.link);
      return link ? { kind: 'word', key: v.key, link, ...after } : null;
    }
    case 'miss': {
      const attempt = parseAttempt(v.attempt);
      return attempt ? { kind: 'miss', key: v.key, attempt, ...after } : null;
    }
    default:
      return null;
  }
}

function parseSeat(v: unknown): [number, number, number] | null {
  if (!Array.isArray(v) || v.length !== 3) return null;
  const [id, lives, words] = v as unknown[];
  return isInt(id) && isNat(lives) && isNat(words) ? [id, lives, words] : null;
}

function parsePlayer(v: unknown): SeatInfo | null {
  if (!isObj(v) || !isInt(v.id) || !isText(v.name, 40) || !isText(v.color, 16)) return null;
  const look = parseLook(v.look);
  return look ? { id: v.id, name: v.name, color: v.color, look } : null;
}

function parseBanner(v: unknown): Banner | null | undefined {
  if (v === null) return null;
  if (!isObj(v) || !isInt(v.key) || !isText(v.text, 120)) return undefined;
  return { key: v.key, text: v.text };
}

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

/** `null` stays null; anything else must parse. Returns undefined when it does not. */
function nullable<T>(v: unknown, parse: (x: unknown) => T | null): T | null | undefined {
  if (v === null) return null;
  return parse(v) ?? undefined;
}

/** Validates a published state from the network; null if anything is off. */
export function applyMirror(json: unknown): KataMirror | null {
  if (!isObj(json) || json.v !== 1) return null;
  const j = json;
  if (!oneOf(PHASES, j.ph) || !oneOf(STARTS, j.sk)) return null;
  if (!isNat(j.rd) || !isNat(j.lv) || !isNat(j.tm) || !isNat(j.tn) || !isInt(j.cur) || !isNat(j.ch))
    return null;
  if (!isWord(j.px) || !isNullableWord(j.sf)) return null;
  if (j.win !== null && !isInt(j.win)) return null;
  if (!isNum(j.end) || !isNum(j.left) || j.left < 0 || !isBool(j.held) || !isBool(j.wait)) return null;
  const ll = nullable(j.ll, parseLink);
  const at = nullable(j.at, parseAttempt);
  const nx = nullable(j.nx, parseNext);
  const bn = parseBanner(j.bn);
  const se = parseList(j.se, MAX_SEATS, parseSeat);
  const log = parseList(j.log, MIRROR_LOG, parseEntry);
  const pl = parseList(j.pl, MAX_SEATS, parsePlayer);
  if (ll === undefined || at === undefined || nx === undefined || bn === undefined) return null;
  if (!se || !log || !pl) return null;
  return {
    v: 1,
    ph: j.ph,
    rd: j.rd,
    lv: j.lv,
    tm: j.tm,
    tn: j.tn,
    cur: j.cur,
    px: j.px,
    sk: j.sk,
    sf: j.sf,
    win: j.win,
    end: j.end,
    left: j.left,
    held: j.held,
    ch: j.ch,
    ll,
    at,
    nx,
    se,
    log,
    bn,
    pl,
    wait: j.wait,
  };
}

/* ------------------------------------------------------------------ mirror scene */

/**
 * A `KataScene` drawn from published states. Its clock is server time, frozen while the Host's
 * game is held or this screen is paused, so the page's turn ring counts down by itself. One
 * instance lives for the whole match; `set` swaps each new state in.
 */
export class MirrorScene implements KataScene {
  private state: KataMirror;
  private frozenAt: number | null = null;
  private localPause = false;
  private deadlineAt = 0;

  constructor(state: KataMirror, now: number) {
    this.state = state;
    this.set(state, now);
  }

  get current(): number {
    return this.state.cur;
  }

  get mirror(): KataMirror {
    return this.state;
  }

  set(state: KataMirror, now: number): void {
    this.state = state;
    if (state.held) {
      this.frozenAt ??= now;
      this.deadlineAt = this.frozenAt + state.left;
      return;
    }
    if (!this.localPause) this.frozenAt = null;
    this.deadlineAt = state.end;
  }

  /** This screen's own pause (the shell's pause button): hold the ring where it is. */
  setLocalPause(paused: boolean, now: number): void {
    this.localPause = paused;
    if (paused) this.frozenAt ??= now;
    else if (!this.state.held) this.frozenAt = null;
  }

  get frozen(): boolean {
    return this.frozenAt !== null;
  }

  /** The time the page's frame bus should emit for this server time. */
  time(now: number): number {
    return this.frozenAt ?? now;
  }

  get phase(): Phase {
    return this.state.ph;
  }
  get round(): number {
    return this.state.rd;
  }
  get lives(): number {
    return this.state.lv;
  }
  get turnMs(): number {
    return this.state.tm;
  }
  get turnNo(): number {
    return this.state.tn;
  }
  get prefix(): string {
    return this.state.px;
  }
  get startKind(): StartKind {
    return this.state.sk;
  }
  get stuckFrom(): string | null {
    return this.state.sf;
  }
  get winner(): number | null {
    return this.state.win;
  }
  get deadline(): number {
    return this.deadlineAt;
  }
  get chainLength(): number {
    return this.state.ch;
  }
  get lastLink(): SceneLink | undefined {
    return this.state.ll ?? undefined;
  }
  get attempt(): SceneAttempt | null {
    return this.state.at;
  }
  get next(): NextTurn | null {
    return this.state.nx;
  }
  get seats(): SceneSeat[] {
    return this.state.se.map(([id, lives, words], index) => ({ id, index, lives, words }));
  }
  get currentSeat(): SceneSeat | undefined {
    return this.seats[this.state.cur];
  }
  seatOf(id: number): SceneSeat | undefined {
    return this.seats.find((s) => s.id === id);
  }

  log(): readonly LogEntry[] {
    return this.state.log;
  }
  banner(): Banner | null {
    return this.state.bn;
  }
  info(id: number): SeatInfo | undefined {
    return this.state.pl.find((p) => p.id === id);
  }
}
