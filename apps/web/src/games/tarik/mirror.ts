/**
 * Long-distance play: the display state the Host's main screen publishes about 15 times a second
 * while the rope moves, and what a far-away main screen does with it. Pure (no DOM, no SDK):
 * `toMirror` packs the board, `applyMirror` validates untrusted JSON, `mirrorFacts` rebuilds the
 * HUD facts, `MirrorTimeline` interpolates the moving values a little in the past (an adaptive
 * delay, see `playout.ts`) so the rope glides between packets, `mirrorClocks` reads the countdown
 * and the round clock at server time (what the Host judges, not the delayed stage), and
 * `TapPacer` spreads tap bursts back out over time.
 */
import { type Look, parseLook } from '@hoorah/protocol';
import type { BoardFacts } from './board';
import type { TickerLine } from './commentary';
import type { HudMember } from './hud';
import type { Phase, RoundReason, Team } from './logic';
import { PlayoutClock, sinceStamp } from './playout';

const PHASES: readonly Phase[] = [
  'waiting',
  'countdown',
  'pull',
  'roundEnd',
  'scoreboard',
  'matchEnd',
  'done',
];
const REASONS: readonly RoundReason[] = ['line', 'time', 'draw'];
const SIDES: readonly Team[] = ['red', 'blue'];
const MAX_PLAYERS = 32;
const MAX_ROUNDS = 9;
const MAX_HISTORY = 64;
const MAX_SUPERS = 8;
const NAME_MAX = 40;
const TICKER_MAX = 200;
/** Longest countdown step and countdown accepted from the network (ms). */
const COUNT_STEP_MAX = 5000;
const COUNT_LEFT_MAX = 3 * COUNT_STEP_MAX;

/** A super pull the mirror should replay: match-wide sequence number, team, combo. */
export interface SuperMark {
  n: number;
  team: Team;
  combo: number;
}

/** Supers kept in every packet, so one lost packet does not lose a flourish. */
export const SUPERS_KEPT = 6;

/** Everything the Host knows that the far-away screen draws. */
export interface MirrorSource {
  facts: BoardFacts;
  /** Server time the state was made (game.now()). */
  server: number;
  /** Effective pulling force per player, super bonus included (drives the pullers' strain). */
  force: Record<Team, number>;
  /** Counted taps per team since the match began (the mirror bobs pullers on the difference). */
  taps: Record<Team, number>;
  /** The latest supers, oldest first. */
  supers: readonly SuperMark[];
  ticker: TickerLine | null;
  /** Server time the current ring cycle grid starts at, and the cycle length. */
  ringStart: number;
  ringPeriod: number;
  /** Countdown: ms of game time until the pull starts (0 outside the countdown), and one step. */
  countLeft: number;
  countStep: number;
  /** The Host's screen is paused. */
  held: boolean;
}

/** Player row: id, name, look. */
type PlayerRow = [number, string, Look];
/** Super row: sequence, team, combo. */
type SuperRow = [number, Team, number];

/** Compact wire shape (short keys: it crosses the network up to 20 times a second). */
export interface TarikMirror {
  v: 1;
  /** Server ms the state was made. */
  t: number;
  ph: Phase;
  /** Round, rounds in the match, wins needed. */
  r: number;
  n: number;
  wn: number;
  /** Round wins: Merah, Biru. */
  w: [number, number];
  sd: boolean;
  /** Round clock ms left, ms since the pull started, countdown value. */
  left: number;
  sp: number;
  cv: number;
  /** Rope position, 3 decimals. */
  p: number;
  /** Force and real tap rate per player: Merah, Biru. */
  f: [number, number];
  rt: [number, number];
  /** Cumulative counted taps: Merah, Biru. */
  tp: [number, number];
  su: SuperRow[];
  /** Finished rounds: 'r' Merah, 'b' Biru, '-' draw. */
  h: string;
  lw: Team | null;
  lr: RoundReason;
  mw: Team | null;
  dec: boolean;
  /** Team rosters in pulling order (ids), Merah then Biru. */
  tm: [number[], number[]];
  /** Ids drawn as disconnected. */
  off: number[];
  /** Waiting overlay ids, or null when it is off. */
  wt: number[] | null;
  pl: PlayerRow[];
  /** Commentator line: key, bold, text. */
  tk: [number, string, string] | null;
  /** Ring grid start (server ms) and period. */
  ring: [number, number];
  /** Countdown: ms until the pull starts and one step (ms), null outside the countdown. */
  cd: [number, number] | null;
  hold: boolean;
}

const roundTo = (v: number, digits: number): number => {
  const k = 10 ** digits;
  return Math.round(v * k) / k;
};

const pair = (rec: Record<Team, number>, digits: number): [number, number] => [
  roundTo(rec.red, digits),
  roundTo(rec.blue, digits),
];

const HISTORY_CODE = { red: 'r', blue: 'b' } as const;

export function toMirror(src: MirrorSource): TarikMirror {
  const f = src.facts;
  const players = new Map<number, PlayerRow>();
  const off: number[] = [];
  const ids = (list: readonly HudMember[], track: boolean): number[] =>
    list.map((m) => {
      if (!players.has(m.id)) players.set(m.id, [m.id, m.name, m.look]);
      if (track && !m.connected) off.push(m.id);
      return m.id;
    });
  const tm: [number[], number[]] = [ids(f.teams.red, true), ids(f.teams.blue, true)];
  const wt = f.waiting ? ids(f.waiting, false) : null;
  const tk = src.ticker;
  return {
    v: 1,
    t: Math.round(src.server),
    ph: f.phase,
    r: f.round,
    n: f.totalRounds,
    wn: f.winsNeeded,
    w: [f.wins.red, f.wins.blue],
    sd: f.suddenDeath,
    left: Math.round(f.timeLeft),
    sp: Math.round(f.sincePull),
    cv: f.countValue,
    p: roundTo(f.p, 3),
    f: pair(src.force, 2),
    rt: pair(f.rate, 2),
    tp: [src.taps.red, src.taps.blue],
    su: src.supers.slice(-SUPERS_KEPT).map((s) => [s.n, s.team, s.combo]),
    h: f.history.map((w) => (w ? HISTORY_CODE[w] : '-')).join(''),
    lw: f.lastWinner,
    lr: f.lastReason,
    mw: f.matchWinner,
    dec: f.decider,
    tm,
    off,
    wt,
    pl: [...players.values()],
    tk: tk ? [tk.key, tk.bold, tk.text] : null,
    ring: [Math.round(src.ringStart), src.ringPeriod],
    cd: f.phase === 'countdown' ? [Math.max(0, Math.round(src.countLeft)), Math.round(src.countStep)] : null,
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
const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v);
const teamOrNull = (v: unknown): Team | null | undefined =>
  v === null ? null : oneOf(SIDES, v) ? v : undefined;

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

const idOrNull = (x: unknown): number | null => (isInt(x) ? x : null);

function parsePair(v: unknown, ok: (x: unknown) => x is number): [number, number] | null {
  if (!Array.isArray(v) || v.length !== 2 || !ok(v[0]) || !ok(v[1])) return null;
  return [v[0], v[1]];
}

function parsePlayer(v: unknown): PlayerRow | null {
  if (!Array.isArray(v) || v.length !== 3) return null;
  const [id, name, rawLook] = v as unknown[];
  if (!isInt(id) || !isText(name, NAME_MAX)) return null;
  const look = parseLook(rawLook);
  return look ? [id, name, look] : null;
}

function parseSuper(v: unknown): SuperRow | null {
  if (!Array.isArray(v) || v.length !== 3) return null;
  const [n, team, combo] = v as unknown[];
  return isNat(n) && oneOf(SIDES, team) && isNat(combo) ? [n, team, combo] : null;
}

function parseCount(v: unknown): TarikMirror['cd'] | undefined {
  if (v === null) return null;
  const cd = parsePair(v, isNat);
  if (!cd || cd[0] > COUNT_LEFT_MAX || cd[1] < 1 || cd[1] > COUNT_STEP_MAX) return undefined;
  return cd;
}

function parseTicker(v: unknown): TarikMirror['tk'] | undefined {
  if (v === null) return null;
  if (!Array.isArray(v) || v.length !== 3) return undefined;
  const [key, bold, text] = v as unknown[];
  return isNat(key) && isText(bold, TICKER_MAX) && isText(text, TICKER_MAX) ? [key, bold, text] : undefined;
}

/** Validates a published state from the network; null if anything is off. */
export function applyMirror(json: unknown): TarikMirror | null {
  if (!isObj(json) || json.v !== 1) return null;
  const j = json;
  if (!isNum(j.t) || !oneOf(PHASES, j.ph) || !oneOf(REASONS, j.lr)) return null;
  if (!isInt(j.n) || j.n < 1 || j.n > MAX_ROUNDS || !isInt(j.r) || j.r < 1 || j.r > MAX_HISTORY) return null;
  if (!isInt(j.wn) || j.wn < 1 || j.wn > j.n) return null;
  if (!isBool(j.sd) || !isBool(j.dec) || !isBool(j.hold)) return null;
  if (!isNat(j.left) || !isNat(j.sp) || !isNat(j.cv) || j.cv > 3) return null;
  if (!isNum(j.p) || j.p < -1 || j.p > 1) return null;
  if (typeof j.h !== 'string' || j.h.length > MAX_HISTORY || !/^[rb-]*$/.test(j.h)) return null;
  const lw = teamOrNull(j.lw);
  const mw = teamOrNull(j.mw);
  const w = parsePair(j.w, isNat);
  const f = parsePair(j.f, isNum);
  const rt = parsePair(j.rt, isNum);
  const tp = parsePair(j.tp, isNat);
  const ring = parsePair(j.ring, isNum);
  if (lw === undefined || mw === undefined || !w || !f || !rt || !tp || !ring || ring[1] <= 0) return null;
  const su = parseList(j.su, parseSuper, MAX_SUPERS);
  const pl = parseList(j.pl, parsePlayer);
  const off = parseList(j.off, idOrNull);
  const wt = j.wt === null ? null : parseList(j.wt, idOrNull);
  const tk = parseTicker(j.tk);
  const cd = parseCount(j.cd);
  if (!su || !pl || !off || (j.wt !== null && !wt) || tk === undefined || cd === undefined) return null;
  if (!Array.isArray(j.tm) || j.tm.length !== 2) return null;
  const red = parseList(j.tm[0], idOrNull);
  const blue = parseList(j.tm[1], idOrNull);
  if (!red || !blue) return null;
  // Every id drawn must come with a name and a look.
  const known = new Set(pl.map(([id]) => id));
  if (![...red, ...blue, ...(wt ?? [])].every((id) => known.has(id))) return null;
  return {
    v: 1,
    t: j.t,
    ph: j.ph,
    r: j.r,
    n: j.n,
    wn: j.wn,
    w,
    sd: j.sd,
    left: j.left,
    sp: j.sp,
    cv: j.cv,
    p: j.p,
    f,
    rt,
    tp,
    su,
    h: j.h,
    lw,
    lr: j.lr,
    mw,
    dec: j.dec,
    tm: [red, blue],
    off,
    wt,
    pl,
    tk,
    ring,
    cd,
    hold: j.hold,
  };
}

/* ------------------------------------------------------------------ rebuilding */

/** The values that move continuously, interpolated between packets. */
export interface Sampled {
  p: number;
  force: Record<Team, number>;
  rate: Record<Team, number>;
}

/** The Host's clocks at a moment in server time (what the Host judges right then). */
export interface Clocks {
  /** Phase for the HUD: the countdown turns into the pull at the server moment it ends. */
  phase: Phase;
  left: number;
  sincePull: number;
  countValue: number;
}

/**
 * The countdown and the round clock at server time `now`, read from the newest packet `s` (not
 * from the delayed stage), so the far-away screen shows GO and the clock when the Host does.
 * They stand still while the Host is paused.
 */
export function mirrorClocks(s: TarikMirror, now: number): Clocks {
  const run = s.hold ? 0 : sinceStamp(s.t, now);
  if (s.ph === 'pull')
    return { phase: s.ph, left: Math.max(0, s.left - run), sincePull: s.sp + run, countValue: 0 };
  if (s.ph === 'countdown' && s.cd) {
    const rest = s.cd[0] - run;
    if (rest > 0) {
      const value = Math.min(3, Math.max(1, Math.ceil(rest / s.cd[1])));
      return { phase: s.ph, left: s.left, sincePull: 0, countValue: value };
    }
    return { phase: 'pull', left: Math.max(0, s.left + rest), sincePull: -rest, countValue: 0 };
  }
  return { phase: s.ph, left: s.left, sincePull: s.sp, countValue: s.cv };
}

const HISTORY_TEAM: Record<string, Team | null> = { r: 'red', b: 'blue', '-': null };

/**
 * HUD facts from a validated state; the moving values come from `live` (interpolated), the
 * countdown and clock from `clocks` (server time).
 */
export function mirrorFacts(s: TarikMirror, live: Sampled, clocks: Clocks): BoardFacts {
  const info = new Map(s.pl.map((row) => [row[0], row]));
  const off = new Set(s.off);
  const members = (ids: readonly number[], connected: (id: number) => boolean): HudMember[] => {
    const out: HudMember[] = [];
    for (const id of ids) {
      const row = info.get(id);
      if (row) out.push({ id, name: row[1], look: row[2], connected: connected(id) });
    }
    return out;
  };
  const shown = (id: number) => !off.has(id);
  return {
    phase: clocks.phase,
    round: s.r,
    totalRounds: s.n,
    winsNeeded: s.wn,
    wins: { red: s.w[0], blue: s.w[1] },
    suddenDeath: s.sd,
    timeLeft: clocks.left,
    sincePull: clocks.sincePull,
    countValue: clocks.countValue,
    p: live.p,
    rate: { red: live.rate.red, blue: live.rate.blue },
    teams: { red: members(s.tm[0], shown), blue: members(s.tm[1], shown) },
    waiting: s.wt ? members(s.wt, () => true) : null,
    history: [...s.h].map((c) => HISTORY_TEAM[c] ?? null),
    lastWinner: s.lw,
    lastReason: s.lr,
    matchWinner: s.mw,
    decider: s.dec,
  };
}

/** Roster entries for the scene: ids in pulling order with looks and connection. */
export function mirrorRoster(s: TarikMirror, team: Team): { id: number; look: Look; connected: boolean }[] {
  const info = new Map(s.pl.map((row) => [row[0], row]));
  const off = new Set(s.off);
  const out: { id: number; look: Look; connected: boolean }[] = [];
  for (const id of s.tm[team === 'red' ? 0 : 1]) {
    const row = info.get(id);
    if (row) out.push({ id, look: row[2], connected: !off.has(id) });
  }
  return out;
}

/* ------------------------------------------------------------------ interpolation */

const BUFFER = 8;

/** Packets that differ in these are separate stretches: the stage snaps instead of blending. */
const stretchKey = (s: TarikMirror): string => `${s.ph}|${s.r}|${s.hold ? 1 : 0}|${s.sd ? 1 : 0}`;

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

/**
 * The last few packets, played back a little behind server time by a `PlayoutClock`: the shortest
 * recent trip plus a buffer that follows the packet gap and jitter, eased so a route change never
 * makes the rope jump.
 */
export class MirrorTimeline {
  private readonly buf: TarikMirror[] = [];
  private readonly clock = new PlayoutClock();
  private readonly out: Sampled = {
    p: 0,
    force: { red: 0, blue: 0 },
    rate: { red: 0, blue: 0 },
  };

  get latest(): TarikMirror | null {
    return this.buf[this.buf.length - 1] ?? null;
  }

  /** Shortest recent Host-to-here trip in ms (null before the first packet). */
  get lag(): number | null {
    return this.clock.lagMs;
  }

  /** How far behind server time the rope was last drawn (ms), null before the first packet. */
  get behind(): number | null {
    return this.clock.behindMs;
  }

  /**
   * Adds a packet that arrived at server time `now`. True when it starts a new stretch (first
   * packet, new phase or round, pause, sudden death, Host restarted): draw it right away.
   */
  push(s: TarikMirror, now: number): boolean {
    this.clock.observe(s.t, now);
    const last = this.latest;
    const snap = !last || s.t <= last.t || stretchKey(s) !== stretchKey(last);
    if (snap) this.buf.length = 0;
    this.buf.push(s);
    if (this.buf.length > BUFFER) this.buf.shift();
    return snap;
  }

  /** The moving values as the Host showed them at the playback point. Reused object. */
  sample(now: number): Sampled {
    const out = this.out;
    const buf = this.buf;
    const first = buf[0];
    const last = buf[buf.length - 1];
    if (!first || !last) return out;
    const at = this.clock.drawAt(now);
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
    out.p = lerp(a.p, b.p, k);
    out.force.red = lerp(a.f[0], b.f[0], k);
    out.force.blue = lerp(a.f[1], b.f[1], k);
    out.rate.red = lerp(a.rt[0], b.rt[0], k);
    out.rate.blue = lerp(a.rt[1], b.rt[1], k);
    return out;
  }
}

/* ------------------------------------------------------------------ taps */

/** Taps are released at most this often per team. */
export const TAP_STEP_MS = 40;
/** Taps waiting to be shown beyond this are dropped (the stage only bobs, nothing is counted). */
const TAP_BACKLOG = 40;

/**
 * Turns the Host's cumulative tap counters into small bursts spread over time, so a packet with
 * eight taps in it bobs the pullers several times like on the Host instead of once.
 */
export class TapPacer {
  private seen: [number, number] | null = null;
  private readonly pending: Record<Team, number> = { red: 0, blue: 0 };
  private readonly nextAt: Record<Team, number> = { red: 0, blue: 0 };

  /** New counters from a packet. The first one (or a lower one, after a Host restart) is the baseline. */
  feed(tp: readonly [number, number]): void {
    const seen = this.seen;
    if (seen && tp[0] >= seen[0] && tp[1] >= seen[1]) {
      this.pending.red = Math.min(TAP_BACKLOG, this.pending.red + tp[0] - seen[0]);
      this.pending.blue = Math.min(TAP_BACKLOG, this.pending.blue + tp[1] - seen[1]);
    }
    this.seen = [tp[0], tp[1]];
  }

  /** Drop taps not shown yet (a round ended). */
  clear(): void {
    this.pending.red = 0;
    this.pending.blue = 0;
  }

  /** Taps to show for a team at time `now`: a third of the backlog (at least one) every step. */
  take(team: Team, now: number): number {
    const n = this.pending[team];
    if (n <= 0 || now < this.nextAt[team]) return 0;
    this.nextAt[team] = now + TAP_STEP_MS;
    const c = Math.min(n, Math.max(1, Math.ceil(n / 3)));
    this.pending[team] = n - c;
    return c;
  }
}

/** Supers in a packet that came after `seen`, oldest first. */
export function newSupers(s: TarikMirror, seen: number): SuperMark[] {
  const out: SuperMark[] = [];
  for (const [n, team, combo] of s.su) if (n > seen) out.push({ n, team, combo });
  return out;
}
