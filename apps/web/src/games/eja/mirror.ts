/**
 * Long-distance play: the display state the Host's main screen publishes and a far-away main
 * screen draws with the same page components. Pure (no DOM, no SDK): `toMirror` reads the scene,
 * `applyMirror` validates untrusted JSON, `MirrorScene` turns it back into an `EjaScene`.
 *
 * The current word travels too: the far screen reads it aloud with its own voice whenever the
 * Host's screen does (`reads` goes up), so the far group hears it as well.
 */

import { parseLook } from '@hoorah/protocol';
import {
  type EjaScene,
  type NearKind,
  type Phase,
  phaseLengthOf,
  rankSeats,
  type SceneSeat,
  type Verdict,
} from './logic';
import type { FinalRecord, SeatInfo } from './screen';
import type { Lang, Tier } from './words';

const PHASES: readonly Phase[] = ['setup', 'intro', 'spell', 'reveal', 'final', 'ended'];
const VERDICTS: readonly Verdict[] = ['correct', 'near', 'wrong', 'none'];
const NEARS: readonly NearKind[] = ['missing', 'extra', 'swap', 'typo'];
const MAX_SEATS = 32;
const MAX_WORD = 40;
const MAX_DEF = 400;

/** One seat on the wire. */
export interface MirrorSeat {
  id: number;
  p: boolean;
  iw: boolean;
  /** Locked in (the typed answer itself stays on the Host's screen). */
  lk: boolean;
  vd: Verdict;
  nr: NearKind | null;
  g: number;
  lv: number;
  st: number;
  sc: number;
  /** Words spelled right (the page shows the count). */
  sp: number;
  bs: number;
  c: number;
}

/** Compact wire shape (short keys: it crosses the network on every change). */
export interface EjaMirror {
  v: 1;
  ph: Phase;
  lang: Lang;
  solo: boolean;
  i: number;
  w: number;
  n: number;
  tier: Tier;
  mul: number;
  wd: { w: string; d: string } | null;
  /** Server ms the clock reaches zero (only meaningful while not held). */
  end: number;
  /** Clock ms left when the state was made, for a held (paused) game. */
  left: number;
  held: boolean;
  se: MirrorSeat[];
  /** Goes up each time the Host's screen reads the word aloud. */
  reads: number;
  host: number | null;
  rec: FinalRecord | null;
  pl: SeatInfo[];
}

export interface MirrorInput {
  scene: EjaScene;
  /** Server time now. */
  now: number;
  held: boolean;
  reads: number;
  hostId: number | null;
  record: FinalRecord | null;
  info: (id: number) => SeatInfo | undefined;
}

export function toMirror(x: MirrorInput): EjaMirror {
  const m = x.scene;
  const left = Math.max(0, Math.round(m.msLeft()));
  const pl: SeatInfo[] = [];
  for (const s of m.roster) {
    const p = x.info(s.id);
    if (p) pl.push({ id: p.id, name: p.name, color: p.color, look: p.look });
  }
  return {
    v: 1,
    ph: m.phase,
    lang: m.lang,
    solo: m.solo,
    i: m.index,
    w: m.words,
    n: m.total,
    tier: m.tier,
    mul: m.multiplier,
    wd: m.word ? { w: m.word.word, d: m.word.def } : null,
    end: Math.round(x.now + left),
    left,
    held: x.held,
    se: m.roster.map((s) => ({
      id: s.id,
      p: s.present,
      iw: s.inWord,
      lk: s.answer !== null,
      vd: s.verdict,
      nr: s.near,
      g: s.gained,
      lv: s.lives,
      st: s.streak,
      sc: s.score,
      sp: s.spelled.length,
      bs: s.stats.bestStreak,
      c: s.stats.correct,
    })),
    reads: x.reads,
    host: x.hostId,
    rec: x.record ? { best: x.record.best, isNew: x.record.isNew } : null,
    pl,
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

function parseSeat(v: unknown): MirrorSeat | null {
  if (!isObj(v) || !isInt(v.id) || !isBool(v.p) || !isBool(v.iw) || !isBool(v.lk)) return null;
  if (!oneOf(VERDICTS, v.vd) || (v.nr !== null && !oneOf(NEARS, v.nr))) return null;
  if (!isNat(v.g) || !isNat(v.lv) || !isNat(v.st) || !isInt(v.sc)) return null;
  if (!isNat(v.sp) || !isNat(v.bs) || !isNat(v.c)) return null;
  return {
    id: v.id,
    p: v.p,
    iw: v.iw,
    lk: v.lk,
    vd: v.vd,
    nr: v.nr,
    g: v.g,
    lv: v.lv,
    st: v.st,
    sc: v.sc,
    sp: v.sp,
    bs: v.bs,
    c: v.c,
  };
}

function parsePlayer(v: unknown): SeatInfo | null {
  if (!isObj(v) || !isInt(v.id) || !isText(v.name, 40) || !isText(v.color, 16)) return null;
  const look = parseLook(v.look);
  return look ? { id: v.id, name: v.name, color: v.color, look } : null;
}

function parseList<T>(v: unknown, item: (x: unknown) => T | null): T[] | null {
  if (!Array.isArray(v) || v.length > MAX_SEATS) return null;
  const out: T[] = [];
  for (const x of v) {
    const parsed = item(x);
    if (parsed === null) return null;
    out.push(parsed);
  }
  return out;
}

/** Validates a published state from the network; null if anything is off. */
export function applyMirror(json: unknown): EjaMirror | null {
  if (!isObj(json) || json.v !== 1) return null;
  const j = json;
  if (!oneOf(PHASES, j.ph) || (j.lang !== 'id' && j.lang !== 'en')) return null;
  if (j.tier !== 1 && j.tier !== 2 && j.tier !== 3) return null;
  if (!isBool(j.solo) || !isBool(j.held) || !isInt(j.i) || j.i < -1) return null;
  if (!isNat(j.w) || !isNat(j.n) || !isNat(j.mul) || !isNat(j.reads)) return null;
  if (!isNum(j.end) || !isNum(j.left) || j.left < 0) return null;
  if (j.host !== null && !isInt(j.host)) return null;
  let wd: EjaMirror['wd'] = null;
  if (j.wd !== null) {
    if (!isObj(j.wd) || !isText(j.wd.w, MAX_WORD) || !isText(j.wd.d, MAX_DEF)) return null;
    wd = { w: j.wd.w, d: j.wd.d };
  }
  let rec: FinalRecord | null = null;
  if (j.rec !== null) {
    if (!isObj(j.rec) || !isNat(j.rec.best) || !isBool(j.rec.isNew)) return null;
    rec = { best: j.rec.best, isNew: j.rec.isNew };
  }
  const se = parseList(j.se, parseSeat);
  const pl = parseList(j.pl, parsePlayer);
  if (!se || !pl) return null;
  return {
    v: 1,
    ph: j.ph,
    lang: j.lang,
    solo: j.solo,
    i: j.i,
    w: j.w,
    n: j.n,
    tier: j.tier,
    mul: j.mul,
    wd,
    end: j.end,
    left: j.left,
    held: j.held,
    se,
    reads: j.reads,
    host: j.host,
    rec,
    pl,
  };
}

/* ------------------------------------------------------------------ mirror scene */

const seatOf = (s: MirrorSeat): SceneSeat => ({
  id: s.id,
  present: s.p,
  inWord: s.iw,
  answer: s.lk ? '' : null,
  verdict: s.vd,
  near: s.nr,
  gained: s.g,
  lives: s.lv,
  streak: s.st,
  score: s.sc,
  spelled: { length: s.sp },
  stats: { bestStreak: s.bs, correct: s.c },
});

/**
 * An `EjaScene` drawn from published states. The clock counts down locally from the Host's end
 * time (`clock` = server time) and freezes while the Host is held or this screen is paused.
 */
export class MirrorScene implements EjaScene {
  private state: EjaMirror;
  private seats: SceneSeat[];
  private frozenLeft: number | null = null;

  constructor(
    state: EjaMirror,
    private readonly clock: () => number,
  ) {
    this.state = state;
    this.seats = state.se.map(seatOf);
  }

  get mirror(): EjaMirror {
    return this.state;
  }

  set(state: EjaMirror): void {
    this.state = state;
    this.seats = state.se.map(seatOf);
    if (this.frozenLeft !== null) this.frozenLeft = this.liveLeft();
  }

  /** This screen's own pause: hold the clock where it is until the Host's next state. */
  setLocalPause(paused: boolean): void {
    this.frozenLeft = paused ? this.msLeft() : null;
  }

  private liveLeft(): number {
    return this.state.held ? this.state.left : Math.max(0, this.state.end - this.clock());
  }

  get phase(): Phase {
    return this.state.ph;
  }
  get lang(): Lang {
    return this.state.lang;
  }
  get solo(): boolean {
    return this.state.solo;
  }
  get index(): number {
    return this.state.i;
  }
  get words(): number {
    return this.state.w;
  }
  get total(): number {
    return this.state.n;
  }
  get tier(): Tier {
    return this.state.tier;
  }
  get multiplier(): number {
    return this.state.mul;
  }
  get word(): { word: string; def: string } | null {
    const wd = this.state.wd;
    return wd ? { word: wd.w, def: wd.d } : null;
  }
  get roster(): readonly SceneSeat[] {
    return this.seats;
  }

  msLeft(): number {
    return this.frozenLeft ?? this.liveLeft();
  }

  phaseLength(): number {
    return phaseLengthOf(this.state.ph, this.state.tier);
  }

  standings(): { seat: SceneSeat; rank: number }[] {
    return rankSeats(this.seats, this.state.solo);
  }

  info(id: number): SeatInfo | undefined {
    return this.state.pl.find((p) => p.id === id);
  }
}
