/**
 * Long-distance play: the display state the Host's main screen publishes and a far-away main
 * screen draws with the same stage components. Pure (no DOM, no SDK): `toMirror` reads the match,
 * `applyMirror` validates untrusted JSON, `MirrorScene` turns it back into a `SilumanScene`.
 *
 * Only what the Host's main screen shows goes out: a role travels only while the screen turns
 * that card over (morning news, the Pemburu's shot, the vote reveal, the final cast), ready and
 * locked ticks only in the phases that draw them, suspicion markers as counts (never who
 * suspects whom), and the chronicle only at the end. Night picks, Dukun sights and phone views
 * never leave the Host.
 */

import { type PlayerInfo, parseLook } from '@hoorah/protocol';
import {
  EXTRAS,
  type Extras,
  INTRO_CUES,
  type IntroCue,
  type Mark,
  NIGHT_ORDER,
  type NightRole,
  type Phase,
  type Role,
  type SceneSeat,
  type SetupStep,
  type Side,
  type SilumanScene,
  TALKS,
  type Talk,
  tallyStepMs,
  type Vote,
} from './logic';
import type { SeatInfo } from './screen';

const PHASES: readonly Phase[] = [
  'setup',
  'intro',
  'deal',
  'dusk',
  'night',
  'dawn',
  'hunt',
  'discuss',
  'defense',
  'vote',
  'tally',
  'reveal',
  'final',
  'ended',
];
const ROLES: readonly Role[] = ['warga', 'siluman', 'dukun', 'tabib', 'pemburu', 'pengkhianat'];
const SIDES: readonly Side[] = ['warga', 'siluman'];
const STEPS: readonly SetupStep[] = ['roles', 'talk'];
const MAX_SEATS = 32;
const MAX_DAYS_SENT = 64;

/** Seat flags. */
const F_PRESENT = 1;
const F_IN_GAME = 2;
const F_ALIVE = 4;
const F_READY = 8;
const F_LOCKED = 16;
const F_ALL = 31;

/** One seat: id, flags, role (only while the screen shows it). */
type SeatRow = [number, number, Role | null];
/** One night of the chronicle: night, victim, saved by the Tabib. */
type NightRow = [number, number | null, number | null];
/** One day of the chronicle: day, voted out. */
type DayRow = [number, number | null];

/** Compact wire shape (short keys: it crosses the network on every change). */
export interface SilumanMirror {
  v: 1;
  ph: Phase;
  sp: SetupStep;
  st: [Extras, Talk];
  /** Night/day number. */
  n: number;
  /** Host (setup hint). */
  h: number | null;
  w: Side | null;
  cue: IntroCue | null;
  call: NightRole | null;
  /** Server ms the clock reaches zero (only meaningful while not held). */
  end: number;
  /** Remaining ms when the state was made, for a held (paused) clock. */
  left: number;
  /** Full length of the clock ring. */
  cl: number;
  held: boolean;
  /** Tally only: server ms the phase started, and ms into it when the state was made. */
  ps: number;
  el: number;
  /** Morning victim, Pemburu, Pemburu's shot, defender (each only in its own phase). */
  dv: number | null;
  hu: number | null;
  hs: number | null;
  df: number | null;
  /** Tally and reveal: votes as flat voter/target pairs, out, tie. */
  ta: { o: number[]; x: number | null; t: boolean } | null;
  ni: NightRow[];
  da: DayRow[];
  se: SeatRow[];
  /** Suspicion markers: id, count. */
  mk: [number, number][];
  pl: SeatInfo[];
}

/** The ids whose role card the Host's main screen shows in this phase. */
function shownRoles(m: SilumanScene): Set<number> {
  const ids = new Set<number>();
  switch (m.phase) {
    case 'final':
    case 'ended':
      for (const s of m.table) ids.add(s.id);
      break;
    case 'dawn':
      if (m.dawnVictim !== null) ids.add(m.dawnVictim);
      break;
    case 'hunt':
      if (m.huntShot !== null) ids.add(m.huntShot);
      break;
    case 'reveal':
      if (m.tally?.out != null) ids.add(m.tally.out);
      break;
    default:
      break;
  }
  return ids;
}

function seatRows(m: SilumanScene): SeatRow[] {
  const shown = shownRoles(m);
  const ticks = m.phase === 'deal' || m.phase === 'discuss';
  const locks = m.phase === 'vote';
  const inGame = new Set(m.table.map((s) => s.id));
  const seen = new Set<number>();
  const rows: SeatRow[] = [];
  // Present players first in join order, then the table seats that are away (also join order).
  const seats = [...m.present, ...m.table];
  for (const s of seats) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    let flags = 0;
    if (s.present) flags |= F_PRESENT;
    if (inGame.has(s.id)) flags |= F_IN_GAME;
    if (s.alive) flags |= F_ALIVE;
    if (ticks && s.ready) flags |= F_READY;
    if (locks && s.locked) flags |= F_LOCKED;
    rows.push([s.id, flags, shown.has(s.id) ? s.role : null]);
  }
  return rows;
}

const inPhase = (m: SilumanScene, phase: Phase, v: number | null): number | null =>
  m.phase === phase ? v : null;

/**
 * The Host's display state. `now` is the server-synced clock, `elapsed` the ms since the current
 * phase began (the match's own clock), `host` the Host's player id.
 */
export function toMirror(
  m: SilumanScene,
  now: number,
  elapsed: number,
  held: boolean,
  host: number | null,
  players: readonly PlayerInfo[],
): SilumanMirror {
  const left = Math.max(0, Math.round(m.msLeft()));
  const tallying = m.phase === 'tally';
  const showTally = m.tally !== null && (tallying || m.phase === 'reveal');
  const final = m.phase === 'final' || m.phase === 'ended';
  const se = seatRows(m);
  const ids = new Set(se.map((r) => r[0]));
  if (host !== null) ids.add(host);
  const el = tallying ? Math.max(0, Math.round(elapsed)) : 0;
  return {
    v: 1,
    ph: m.phase,
    sp: m.step,
    st: [m.settings.extras, m.settings.talk],
    n: m.night,
    h: host,
    w: final ? m.winner : null,
    cue: m.introCue,
    call: m.calling,
    end: Math.round(now) + left,
    left,
    cl: m.clockLength(),
    held,
    ps: tallying ? Math.round(now) - el : 0,
    el,
    dv: inPhase(m, 'dawn', m.dawnVictim),
    hu: inPhase(m, 'hunt', m.hunter),
    hs: inPhase(m, 'hunt', m.huntShot),
    df: m.phase === 'defense' ? m.defender : null,
    ta:
      showTally && m.tally
        ? { o: m.tally.order.flatMap((v) => [v.from, v.to]), x: m.tally.out, t: m.tally.tie }
        : null,
    ni: final
      ? m.nights.map((r) => [
          r.night,
          r.victim,
          r.victim === null && r.attacked !== null && r.attacked === r.protected ? r.attacked : null,
        ])
      : [],
    da: final ? m.days.map((d) => [d.day, d.out]) : [],
    se,
    mk: m.phase === 'discuss' || m.phase === 'defense' ? m.marks().map((x) => [x.id, x.n]) : [],
    pl: players
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
const isId = (v: unknown): v is number => isInt(v) && v > 0;
const isIdOrNull = (v: unknown): v is number | null => v === null || isId(v);

function oneOfOrNull<T extends string>(list: readonly T[], v: unknown): T | null | undefined {
  if (v === null) return null;
  return oneOf(list, v) ? v : undefined;
}

function parseList<T>(v: unknown, item: (x: unknown) => T | null, max = MAX_SEATS): T[] | null {
  if (!Array.isArray(v) || v.length > max) return null;
  const out: T[] = [];
  for (const x of v) {
    const parsed = item(x);
    if (parsed === null) return null;
    out.push(parsed);
  }
  return out;
}

function parseSeat(v: unknown): SeatRow | null {
  if (!Array.isArray(v) || v.length !== 3) return null;
  const [id, flags, role] = v as unknown[];
  if (!isId(id) || !isNat(flags) || flags > F_ALL) return null;
  const r = oneOfOrNull(ROLES, role);
  return r === undefined ? null : [id, flags, r];
}

function parseNight(v: unknown): NightRow | null {
  if (!Array.isArray(v) || v.length !== 3) return null;
  const [night, victim, saved] = v as unknown[];
  if (!isId(night) || !isIdOrNull(victim) || !isIdOrNull(saved)) return null;
  return [night, victim, saved];
}

function parseDay(v: unknown): DayRow | null {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const [day, out] = v as unknown[];
  if (!isId(day) || !isIdOrNull(out)) return null;
  return [day, out];
}

function parseMark(v: unknown): [number, number] | null {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const [id, n] = v as unknown[];
  return isId(id) && isId(n) && n <= MAX_SEATS ? [id, n] : null;
}

function parsePlayer(v: unknown): SeatInfo | null {
  if (!isObj(v) || !isId(v.id) || !isText(v.name, 40) || !isText(v.color, 16)) return null;
  const look = parseLook(v.look);
  return look ? { id: v.id, name: v.name, color: v.color, look } : null;
}

function parseTally(v: unknown): SilumanMirror['ta'] | undefined {
  if (v === null) return null;
  if (!isObj(v) || !isIdOrNull(v.x) || !isBool(v.t)) return undefined;
  const o = v.o;
  if (!Array.isArray(o) || o.length % 2 !== 0 || o.length > MAX_SEATS * 2) return undefined;
  for (let i = 0; i < o.length; i++) if (!(i % 2 === 0 ? isId(o[i]) : isNat(o[i]))) return undefined;
  return { o: o as number[], x: v.x, t: v.t };
}

/** Validates a published state from the network; null if anything is off. */
export function applyMirror(json: unknown): SilumanMirror | null {
  if (!isObj(json) || json.v !== 1) return null;
  const j = json;
  if (!oneOf(PHASES, j.ph) || !oneOf(STEPS, j.sp)) return null;
  if (!Array.isArray(j.st) || j.st.length !== 2 || !oneOf(EXTRAS, j.st[0]) || !oneOf(TALKS, j.st[1]))
    return null;
  if (!isNat(j.n) || j.n > MAX_DAYS_SENT || !isIdOrNull(j.h)) return null;
  const w = oneOfOrNull(SIDES, j.w);
  const cue = oneOfOrNull(INTRO_CUES, j.cue);
  const call = oneOfOrNull(NIGHT_ORDER, j.call);
  if (w === undefined || cue === undefined || call === undefined) return null;
  if (!isNum(j.end) || !isNum(j.left) || j.left < 0 || !isNat(j.cl) || !isBool(j.held)) return null;
  if (!isNum(j.ps) || !isNum(j.el) || j.el < 0) return null;
  if (!isIdOrNull(j.dv) || !isIdOrNull(j.hu) || !isIdOrNull(j.hs) || !isIdOrNull(j.df)) return null;
  const ta = parseTally(j.ta);
  const ni = parseList(j.ni, parseNight, MAX_DAYS_SENT);
  const da = parseList(j.da, parseDay, MAX_DAYS_SENT);
  const se = parseList(j.se, parseSeat);
  const mk = parseList(j.mk, parseMark);
  const pl = parseList(j.pl, parsePlayer);
  if (ta === undefined || !ni || !da || !se || !mk || !pl) return null;
  return {
    v: 1,
    ph: j.ph,
    sp: j.sp,
    st: [j.st[0], j.st[1]],
    n: j.n,
    h: j.h,
    w,
    cue,
    call,
    end: j.end,
    left: j.left,
    cl: j.cl,
    held: j.held,
    ps: j.ps,
    el: j.el,
    dv: j.dv,
    hu: j.hu,
    hs: j.hs,
    df: j.df,
    ta,
    ni,
    da,
    se,
    mk,
    pl,
  };
}

/* ------------------------------------------------------------------ mirror scene */

interface Derived {
  seats: Map<number, SceneSeat>;
  table: SceneSeat[];
  alive: SceneSeat[];
  present: SceneSeat[];
  order: Vote[];
  marks: Mark[];
  info: Map<number, SeatInfo>;
}

function derive(s: SilumanMirror): Derived {
  const seats = new Map<number, SceneSeat>();
  const table: SceneSeat[] = [];
  const present: SceneSeat[] = [];
  for (const [id, flags, role] of s.se) {
    const seat: SceneSeat = {
      id,
      present: (flags & F_PRESENT) !== 0,
      // Hidden cards read as a plain warga; the screen never draws them.
      role: role ?? 'warga',
      alive: (flags & F_ALIVE) !== 0,
      ready: (flags & F_READY) !== 0,
      locked: (flags & F_LOCKED) !== 0,
    };
    seats.set(id, seat);
    if (flags & F_IN_GAME) table.push(seat);
    if (seat.present) present.push(seat);
  }
  const order: Vote[] = [];
  const o = s.ta?.o ?? [];
  for (let i = 0; i + 1 < o.length; i += 2) order.push({ from: o[i] ?? 0, to: o[i + 1] ?? 0 });
  return {
    seats,
    table,
    alive: table.filter((x) => x.alive),
    present,
    order,
    marks: s.mk.map(([id, n]) => ({ id, n })),
    info: new Map(s.pl.map((p) => [p.id, p])),
  };
}

/**
 * A `SilumanScene` drawn from published states. One instance lives for the whole match; `set`
 * swaps each new state in. Clocks and the tally run locally from server times (`clock` is the
 * synced server clock) and freeze while either screen is paused.
 */
export class MirrorScene implements SilumanScene {
  private state: SilumanMirror;
  private d: Derived;
  private frozen: { left: number; el: number } | null = null;

  constructor(
    state: SilumanMirror,
    private readonly clock: () => number,
  ) {
    this.state = state;
    this.d = derive(state);
  }

  get current(): SilumanMirror {
    return this.state;
  }

  set(state: SilumanMirror): void {
    this.state = state;
    this.d = derive(state);
    if (this.frozen) this.frozen = this.live();
  }

  /** The local screen paused or resumed: hold the clocks where they are. */
  setLocalPause(paused: boolean): void {
    if (paused) this.frozen ??= this.live();
    // On resume the Host's times are the truth again (it republishes after its own resume).
    else this.frozen = null;
  }

  private live(): { left: number; el: number } {
    const s = this.state;
    if (s.held) return { left: s.left, el: s.el };
    const now = this.clock();
    return { left: Math.max(0, s.end - now), el: Math.max(0, now - s.ps) };
  }

  get phase(): Phase {
    return this.state.ph;
  }
  get step(): SetupStep {
    return this.state.sp;
  }
  get settings(): { extras: Extras; talk: Talk } {
    return { extras: this.state.st[0], talk: this.state.st[1] };
  }
  get night(): number {
    return this.state.n;
  }
  get winner(): Side | null {
    return this.state.w;
  }
  get dawnVictim(): number | null {
    return this.state.dv;
  }
  get hunter(): number | null {
    return this.state.hu;
  }
  get huntShot(): number | null {
    return this.state.hs;
  }
  get defender(): number | null {
    return this.state.df;
  }
  get host(): number | null {
    return this.state.h;
  }
  get tally(): { order: Vote[]; out: number | null; tie: boolean } | null {
    const t = this.state.ta;
    return t ? { order: this.d.order, out: t.x, tie: t.t } : null;
  }
  get nights(): {
    night: number;
    victim: number | null;
    attacked: number | null;
    protected: number | null;
  }[] {
    return this.state.ni.map(([night, victim, saved]) => ({
      night,
      victim,
      attacked: saved,
      protected: saved,
    }));
  }
  get days(): { day: number; out: number | null }[] {
    return this.state.da.map(([day, out]) => ({ day, out }));
  }
  get table(): SceneSeat[] {
    return this.d.table;
  }
  get alive(): SceneSeat[] {
    return this.d.alive;
  }
  get present(): SceneSeat[] {
    return this.d.present;
  }
  get calling(): NightRole | null {
    return this.state.call;
  }
  get introCue(): IntroCue | null {
    return this.state.cue;
  }

  seat(id: number): SceneSeat | undefined {
    return this.d.seats.get(id);
  }

  msLeft(): number {
    return (this.frozen ?? this.live()).left;
  }

  clockLength(): number {
    return this.state.cl;
  }

  tallyShown(): number {
    const order = this.d.order;
    if (this.state.ph !== 'tally') return order.length;
    const el = (this.frozen ?? this.live()).el;
    let at = 0;
    let n = 0;
    for (let i = 0; i < order.length; i++) {
      at += tallyStepMs(i);
      if (el >= at) n++;
    }
    return n;
  }

  marks(): Mark[] {
    return this.d.marks;
  }

  info(id: number): SeatInfo | undefined {
    return this.d.info.get(id);
  }
}
