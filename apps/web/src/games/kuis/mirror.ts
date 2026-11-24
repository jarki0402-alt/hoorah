/**
 * Long-distance play: the display state the Host's main screen publishes and a far-away main
 * screen draws with the same stage components. Pure (no DOM, no SDK): `toMirror` reads a scene,
 * `applyMirror` validates untrusted JSON, `MirrorScene` turns it back into a `KuisScene`.
 */

import { type PlayerInfo, parseLook } from '@hoorah/protocol';
import {
  type KuisScene,
  type Phase,
  type RankEntry,
  rankScores,
  type SceneOutcome,
  type SceneQuestion,
  type SceneRecord,
  type SoloRecord,
} from './logic';
import type { SeatInfo } from './tv';

const PHASES: readonly Phase[] = ['start', 'intro', 'question', 'reveal', 'final', 'ended'];
/** Upper bounds that keep a hostile or broken state from blowing up the page. */
const MAX_PLAYERS = 32;
const MAX_ROUNDS = 200;
const MAX_TEXT = 400;

export type MirrorPlayer = SeatInfo;

/** Compact wire shape (short keys: it crosses the network on every change). */
export interface KuisMirror {
  v: 1;
  ph: Phase;
  r: number;
  n: number;
  solo: boolean;
  q: { c: string; t?: string; q: string; o: string[]; a: number; f: string };
  /** Server ms the visible countdown reaches zero (only meaningful while not held). */
  end: number;
  /** Remaining ms when the state was made, for a held (paused) clock. */
  left: number;
  held: boolean;
  /** Every connected participant has answered. */
  aa: boolean;
  part: number[];
  ans: number[];
  oc: { p: number; o: number | null; t: number | null; c: boolean; s: number; d: boolean }[];
  fc: number | null;
  /** Roster: id, connected, joinedRound, score, prevScore, correct, asked. */
  ro: [number, boolean, number, number, number, number, number][];
  pl: MirrorPlayer[];
  wait: boolean;
  rb: number | null;
  rec: SoloRecord | null;
}

export interface MirrorExtras {
  players: readonly PlayerInfo[];
  waiting: boolean;
  recordBefore: number | null;
  record: SoloRecord | null;
}

/** The answer and the fun fact stay on the Host's screen until the reveal. */
function answerVisible(phase: Phase): boolean {
  return phase === 'reveal' || phase === 'final' || phase === 'ended';
}

export function toMirror(scene: KuisScene, now: number, held: boolean, extras: MirrorExtras): KuisMirror {
  const q = scene.question;
  const shown = answerVisible(scene.phase);
  const raw = Math.max(0, scene.timeLeft(now));
  const left = Math.round(raw);
  const roster = scene.roster;
  const ids = new Set(roster.map((r) => r.id));
  const question: KuisMirror['q'] = {
    c: q.category,
    q: q.q,
    o: [...q.options],
    a: shown ? q.answer : -1,
    f: shown ? q.fact : '',
  };
  if (q.topic) question.t = q.topic;
  return {
    v: 1,
    ph: scene.phase,
    r: scene.round,
    n: scene.total,
    solo: scene.solo,
    q: question,
    end: Math.round(now + raw),
    left,
    held,
    aa: scene.allAnsweredAt !== null,
    part: roster.filter((r) => scene.isParticipant(r.id)).map((r) => r.id),
    ans: scene.phase === 'question' ? roster.filter((r) => scene.answers.has(r.id)).map((r) => r.id) : [],
    oc:
      scene.phase === 'reveal'
        ? scene.outcomes.map((o) => ({
            p: o.playerId,
            o: o.option,
            t: o.timeMs,
            c: o.score.correct,
            s: o.score.total,
            d: o.score.doubled,
          }))
        : [],
    fc: scene.fastestCorrect,
    ro: roster.map((r) => [r.id, r.connected, r.joinedRound, r.score, r.prevScore, r.correct, r.asked]),
    pl: extras.players
      .filter((p) => ids.has(p.id))
      .map((p) => ({ id: p.id, name: p.name, color: p.color, look: p.look })),
    wait: extras.waiting,
    rb: extras.recordBefore,
    rec: extras.record,
  };
}

/* ------------------------------------------------------------------ validation */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isId = (v: unknown): v is number => isInt(v) && v >= 0;
const isText = (v: unknown, max = MAX_TEXT): v is string => typeof v === 'string' && v.length <= max;
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isNullableInt = (v: unknown): v is number | null => v === null || isInt(v);

function idList(v: unknown): number[] | null {
  if (!Array.isArray(v) || v.length > MAX_PLAYERS) return null;
  return v.every(isId) ? (v as number[]) : null;
}

function parseQuestion(v: unknown): KuisMirror['q'] | null {
  if (!isObj(v)) return null;
  if (!isText(v.c, 40) || !isText(v.q) || !isText(v.f) || !isInt(v.a)) return null;
  if (v.t !== undefined && !isText(v.t, 60)) return null;
  if (!Array.isArray(v.o) || v.o.length < 2 || v.o.length > 4 || !v.o.every((o) => isText(o, 120)))
    return null;
  if (v.a < -1 || v.a >= v.o.length) return null;
  const q: KuisMirror['q'] = { c: v.c, q: v.q, o: v.o as string[], a: v.a, f: v.f };
  if (typeof v.t === 'string') q.t = v.t;
  return q;
}

function parseOutcome(v: unknown): KuisMirror['oc'][number] | null {
  if (!isObj(v)) return null;
  if (!isId(v.p) || !isNullableInt(v.o) || !isNullableInt(v.t)) return null;
  if (!isBool(v.c) || !isInt(v.s) || !isBool(v.d)) return null;
  return { p: v.p, o: v.o, t: v.t, c: v.c, s: v.s, d: v.d };
}

function parseRosterRow(v: unknown): KuisMirror['ro'][number] | null {
  if (!Array.isArray(v) || v.length !== 7) return null;
  const [id, connected, joined, score, prev, correct, asked] = v as unknown[];
  if (!isId(id) || !isBool(connected) || !isInt(joined)) return null;
  if (!isInt(score) || !isInt(prev) || !isInt(correct) || !isInt(asked)) return null;
  return [id, connected, joined, score, prev, correct, asked];
}

function parsePlayer(v: unknown): MirrorPlayer | null {
  if (!isObj(v) || !isId(v.id) || !isText(v.name, 40) || !isText(v.color, 16)) return null;
  const look = parseLook(v.look);
  if (!look) return null;
  return { id: v.id, name: v.name, color: v.color, look };
}

function parseRecord(v: unknown): SoloRecord | null | undefined {
  if (v === null) return null;
  if (!isObj(v) || !isText(v.text, 120) || !isBool(v.isNew)) return undefined;
  return { text: v.text, isNew: v.isNew };
}

function parseList<T>(v: unknown, item: (x: unknown) => T | null): T[] | null {
  if (!Array.isArray(v) || v.length > MAX_PLAYERS) return null;
  const out: T[] = [];
  for (const x of v) {
    const parsed = item(x);
    if (parsed === null) return null;
    out.push(parsed);
  }
  return out;
}

/** Validates a published state from the network; null if anything is off. */
export function applyMirror(json: unknown): KuisMirror | null {
  if (!isObj(json) || json.v !== 1) return null;
  const ph = json.ph;
  if (typeof ph !== 'string' || !(PHASES as readonly string[]).includes(ph)) return null;
  if (!isInt(json.n) || json.n < 1 || json.n > MAX_ROUNDS) return null;
  if (!isInt(json.r) || json.r < 0 || json.r >= json.n) return null;
  if (!isBool(json.solo) || !isBool(json.held) || !isBool(json.aa) || !isBool(json.wait)) return null;
  if (!isNum(json.end) || !isNum(json.left) || json.left < 0) return null;
  if (!isNullableInt(json.fc) || !isNullableInt(json.rb)) return null;
  const q = parseQuestion(json.q);
  const part = idList(json.part);
  const ans = idList(json.ans);
  const oc = parseList(json.oc, parseOutcome);
  const ro = parseList(json.ro, parseRosterRow);
  const pl = parseList(json.pl, parsePlayer);
  const rec = parseRecord(json.rec);
  if (!q || !part || !ans || !oc || !ro || !pl || rec === undefined) return null;
  return {
    v: 1,
    ph: ph as Phase,
    r: json.r,
    n: json.n,
    solo: json.solo,
    q,
    end: json.end,
    left: json.left,
    held: json.held,
    aa: json.aa,
    part,
    ans,
    oc,
    fc: json.fc,
    ro,
    pl,
    wait: json.wait,
    rb: json.rb,
    rec,
  };
}

/* ------------------------------------------------------------------ mirror scene */

/** Keys for the progress pips (the mirror never needs the other questions themselves). */
function questionKeys(n: number): { id: string }[] {
  return Array.from({ length: n }, (_, i) => ({ id: String(i) }));
}

/**
 * A `KuisScene` drawn from published states. One instance lives for the whole match (the stage
 * keys effects on its identity); `set` swaps the state in. The countdown runs locally from the
 * end time and freezes while either screen is paused.
 */
export class MirrorScene implements KuisScene {
  private state: KuisMirror;
  private questionList: { id: string }[];
  private frozenLeft: number | null = null;

  constructor(state: KuisMirror) {
    this.state = state;
    this.questionList = questionKeys(state.n);
  }

  set(state: KuisMirror, now: number): void {
    if (state.n !== this.state.n) this.questionList = questionKeys(state.n);
    this.state = state;
    if (this.frozenLeft !== null) this.frozenLeft = state.held ? state.left : Math.max(0, state.end - now);
  }

  get current(): KuisMirror {
    return this.state;
  }

  /** The local screen paused or resumed: hold the countdown where it is. */
  setLocalPause(paused: boolean, now: number): void {
    if (paused) {
      if (this.frozenLeft === null) this.frozenLeft = this.timeLeft(now);
      return;
    }
    // The Host's end time is the truth again; after its own resume it publishes a fresh one.
    this.frozenLeft = null;
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

  get solo(): boolean {
    return this.state.solo;
  }

  get questions(): readonly { id: string }[] {
    return this.questionList;
  }

  get question(): SceneQuestion {
    const q = this.state.q;
    return {
      id: String(this.state.r),
      category: q.c,
      topic: q.t,
      q: q.q,
      options: q.o,
      answer: q.a,
      fact: q.f,
    };
  }

  get roster(): SceneRecord[] {
    return this.state.ro.map(([id, connected, joinedRound, score, prevScore, correct, asked]) => ({
      id,
      connected,
      joinedRound,
      score,
      prevScore,
      correct,
      asked,
    }));
  }

  get outcomes(): SceneOutcome[] {
    return this.state.oc.map((o) => ({
      playerId: o.p,
      option: o.o,
      timeMs: o.t,
      score: { correct: o.c, total: o.s, doubled: o.d },
    }));
  }

  get fastestCorrect(): number | null {
    return this.state.fc;
  }

  get allAnsweredAt(): number | null {
    return this.state.aa ? 0 : null;
  }

  get answers(): { has(id: number): boolean } {
    const set = new Set(this.state.ans);
    return { has: (id: number) => set.has(id) };
  }

  timeLeft(now: number): number {
    if (this.frozenLeft !== null) return this.frozenLeft;
    if (this.state.held) return this.state.left;
    return Math.max(0, this.state.end - now);
  }

  isParticipant(id: number): boolean {
    return this.state.part.includes(id);
  }

  ranking(): RankEntry[] {
    return rankScores(this.state.ro.map(([playerId, , , score]) => ({ playerId, score })));
  }

  /** Player cards as the Host's screen knows them (the mirror needs no phones of its own). */
  info(id: number): SeatInfo | undefined {
    return this.state.pl.find((x) => x.id === id);
  }
}
