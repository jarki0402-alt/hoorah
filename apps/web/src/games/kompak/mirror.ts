/**
 * Long-distance play: the display state the Host's main screen publishes and a far-away main
 * screen draws with the same stage components. Pure (no DOM, no SDK): `toMirror` reads a scene,
 * `applyMirror` validates untrusted JSON, `MirrorScene` turns it back into a `KompakScene`.
 */

import { type PlayerInfo, parseLook } from '@hoorah/protocol';
import {
  type KompakScene,
  type OutcomeKind,
  type Phase,
  percent,
  type RankEntry,
  type RoundMode,
  rankScores,
  type SceneOutcome,
  type ScenePrompt,
  type SceneRecord,
  type SceneResult,
} from './logic';
import type { SeatInfo } from './tv';

const PHASES: readonly Phase[] = ['start', 'intro', 'question', 'reveal', 'final', 'ended'];
const MODES: readonly RoundMode[] = ['group', 'sehati', 'solo'];
const KINDS: readonly OutcomeKind[] = ['kompak', 'minority', 'alone', 'sehati', 'apart', 'missed', 'solo'];
const MAX_PLAYERS = 32;
const MAX_ROUNDS = 200;

/** One reveal outcome: player id, option picked, kind, points. */
type OutcomeRow = [number, number | null, OutcomeKind, number];

/** Compact wire shape (short keys: it crosses the network on every change). */
export interface KompakMirror {
  v: 1;
  ph: Phase;
  r: number;
  n: number;
  q: { c: string; q: string; o: string[] };
  /** Server ms the visible countdown reaches zero (only meaningful while not held). */
  end: number;
  /** Remaining ms when the state was made, for a held (paused) clock. */
  left: number;
  held: boolean;
  /** Every connected participant has answered. */
  aa: boolean;
  part: number[];
  ans: number[];
  /** Latest reveal (sent only while it is on screen). */
  res: { m: RoundMode; k: number[]; w: number[]; u: boolean; oc: OutcomeRow[] } | null;
  /** Co-op meter: rounds, hits. */
  co: [number, number];
  /** Roster: id, connected, joinedRound, score, prevScore, hits, played. */
  ro: [number, boolean, number, number, number, number, number][];
  pl: SeatInfo[];
  wait: boolean;
}

export interface MirrorExtras {
  players: readonly PlayerInfo[];
  waiting: boolean;
}

export function toMirror(scene: KompakScene, now: number, held: boolean, extras: MirrorExtras): KompakMirror {
  const raw = Math.max(0, scene.timeLeft(now));
  const roster = scene.roster;
  const ids = new Set(roster.map((r) => r.id));
  const res = scene.result;
  const showRes = res !== null && scene.phase === 'reveal';
  return {
    v: 1,
    ph: scene.phase,
    r: scene.round,
    n: scene.total,
    q: { c: scene.prompt.category, q: scene.prompt.q, o: [...scene.prompt.options] },
    end: Math.round(now + raw),
    left: Math.round(raw),
    held,
    aa: scene.allAnsweredAt !== null,
    part: [...scene.participants],
    ans: scene.phase === 'question' ? roster.filter((r) => scene.answers.has(r.id)).map((r) => r.id) : [],
    res: showRes
      ? {
          m: res.mode,
          k: [...res.counts],
          w: [...res.winners],
          u: res.unanimous,
          oc: res.outcomes.map((o) => [o.playerId, o.option, o.kind, o.points]),
        }
      : null,
    co: [scene.coopRounds, scene.coopHits],
    ro: roster.map((r) => [r.id, r.connected, r.joinedRound, r.score, r.prevScore, r.hits, r.played]),
    pl: extras.players
      .filter((p) => ids.has(p.id))
      .map((p) => ({ id: p.id, name: p.name, color: p.color, look: p.look })),
    wait: extras.waiting,
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

function parsePrompt(v: unknown): KompakMirror['q'] | null {
  if (!isObj(v) || !isText(v.c, 40) || !isText(v.q, 200)) return null;
  if (!Array.isArray(v.o) || v.o.length < 2 || v.o.length > 4 || !v.o.every((o) => isText(o, 60)))
    return null;
  return { c: v.c, q: v.q, o: v.o as string[] };
}

function parseOutcome(v: unknown): OutcomeRow | null {
  if (!Array.isArray(v) || v.length !== 4) return null;
  const [id, option, kind, points] = v as unknown[];
  if (!isNat(id) || (option !== null && !isNat(option)) || !oneOf(KINDS, kind) || !isInt(points)) return null;
  return [id, option, kind, points];
}

function parseResult(v: unknown): KompakMirror['res'] | undefined {
  if (v === null) return null;
  if (!isObj(v) || !oneOf(MODES, v.m) || !isBool(v.u)) return undefined;
  const k = parseList(v.k, natOrNull, 4);
  const w = parseList(v.w, natOrNull, 4);
  const oc = parseList(v.oc, parseOutcome);
  if (!k || !w || !oc) return undefined;
  return { m: v.m, k, w, u: v.u, oc };
}

function parseRosterRow(v: unknown): KompakMirror['ro'][number] | null {
  if (!Array.isArray(v) || v.length !== 7) return null;
  const [id, connected, joined, score, prev, hits, played] = v as unknown[];
  if (!isNat(id) || !isBool(connected) || !isInt(joined)) return null;
  if (!isInt(score) || !isInt(prev) || !isNat(hits) || !isNat(played)) return null;
  return [id, connected, joined, score, prev, hits, played];
}

function parsePlayer(v: unknown): SeatInfo | null {
  if (!isObj(v) || !isNat(v.id) || !isText(v.name, 40) || !isText(v.color, 16)) return null;
  const look = parseLook(v.look);
  return look ? { id: v.id, name: v.name, color: v.color, look } : null;
}

/** Validates a published state from the network; null if anything is off. */
export function applyMirror(json: unknown): KompakMirror | null {
  if (!isObj(json) || json.v !== 1) return null;
  const j = json;
  if (!oneOf(PHASES, j.ph)) return null;
  if (!isInt(j.n) || j.n < 1 || j.n > MAX_ROUNDS || !isInt(j.r) || j.r < 0 || j.r >= j.n) return null;
  if (!isBool(j.held) || !isBool(j.aa) || !isBool(j.wait)) return null;
  if (!isNum(j.end) || !isNum(j.left) || j.left < 0) return null;
  if (!Array.isArray(j.co) || j.co.length !== 2 || !isNat(j.co[0]) || !isNat(j.co[1])) return null;
  const q = parsePrompt(j.q);
  const part = parseList(j.part, natOrNull);
  const ans = parseList(j.ans, natOrNull);
  const res = parseResult(j.res);
  const ro = parseList(j.ro, parseRosterRow);
  const pl = parseList(j.pl, parsePlayer);
  if (!q || !part || !ans || res === undefined || !ro || !pl) return null;
  return {
    v: 1,
    ph: j.ph,
    r: j.r,
    n: j.n,
    q,
    end: j.end,
    left: j.left,
    held: j.held,
    aa: j.aa,
    part,
    ans,
    res,
    co: [j.co[0], j.co[1]],
    ro,
    pl,
    wait: j.wait,
  };
}

/* ------------------------------------------------------------------ mirror scene */

/** Keys for the progress pips (the mirror never needs the other prompts themselves). */
function promptKeys(n: number): { id: string }[] {
  return Array.from({ length: n }, (_, i) => ({ id: String(i) }));
}

/**
 * A `KompakScene` drawn from published states. One instance lives for the whole match (the stage
 * keys effects on its identity); `set` swaps each new state in. The countdown runs locally from
 * the end time and freezes while either screen is paused.
 */
export class MirrorScene implements KompakScene {
  private state: KompakMirror;
  private keys: { id: string }[];
  private frozenLeft: number | null = null;

  constructor(state: KompakMirror) {
    this.state = state;
    this.keys = promptKeys(state.n);
  }

  get current(): KompakMirror {
    return this.state;
  }

  set(state: KompakMirror, now: number): void {
    if (state.n !== this.state.n) this.keys = promptKeys(state.n);
    this.state = state;
    if (this.frozenLeft !== null) this.frozenLeft = state.held ? state.left : Math.max(0, state.end - now);
  }

  /** The local screen paused or resumed: hold the countdown where it is. */
  setLocalPause(paused: boolean, now: number): void {
    if (paused) this.frozenLeft ??= this.timeLeft(now);
    // On resume the Host's end time is the truth again (it republishes after its own resume).
    else this.frozenLeft = null;
  }

  get phase(): Phase {
    return this.state.ph;
  }
  get round(): number {
    return this.state.r;
  }
  get total(): number {
    return this.state.n;
  }
  get coop(): boolean {
    return this.state.ro.length === 2;
  }
  get coopRounds(): number {
    return this.state.co[0];
  }
  get coopHits(): number {
    return this.state.co[1];
  }
  get coopPercent(): number {
    return percent(this.coopHits, this.coopRounds);
  }
  get prompts(): readonly { id: string }[] {
    return this.keys;
  }
  get prompt(): ScenePrompt {
    const q = this.state.q;
    return { id: String(this.state.r), category: q.c, q: q.q, options: q.o };
  }
  get roster(): SceneRecord[] {
    return this.state.ro.map(([id, connected, joinedRound, score, prevScore, hits, played]) => ({
      id,
      connected,
      joinedRound,
      score,
      prevScore,
      hits,
      played,
    }));
  }
  get participants(): readonly number[] {
    return this.state.part;
  }
  get answers(): { has(id: number): boolean } {
    const set = new Set(this.state.ans);
    return { has: (id: number) => set.has(id) };
  }
  get result(): SceneResult | null {
    const r = this.state.res;
    if (!r) return null;
    return {
      mode: r.m,
      counts: r.k,
      winners: r.w,
      unanimous: r.u,
      outcomes: r.oc.map(([playerId, option, kind, points]) => ({ playerId, option, kind, points })),
    };
  }
  get allAnsweredAt(): number | null {
    return this.state.aa ? 0 : null;
  }

  timeLeft(now: number): number {
    if (this.frozenLeft !== null) return this.frozenLeft;
    if (this.state.held) return this.state.left;
    return Math.max(0, this.state.end - now);
  }

  isParticipant(id: number): boolean {
    return this.state.part.includes(id);
  }

  outcomeOf(id: number): SceneOutcome | undefined {
    return this.result?.outcomes.find((o) => o.playerId === id);
  }

  ranking(): RankEntry[] {
    return rankScores(this.state.ro.map(([playerId, , , score]) => ({ playerId, score })));
  }

  info(id: number): SeatInfo | undefined {
    return this.state.pl.find((p) => p.id === id);
  }
}
