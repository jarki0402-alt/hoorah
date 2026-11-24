/**
 * HUD content read from a Langkah Maut match: the Host's director and the far-away mirror screen
 * (replica.ts) both fill the HUD with these, so the two screens show the same cue strip, walker
 * list and cards at the same babak time. Pure apart from `fillHud`, which only writes signals.
 */
import type { Chip, CueStrip, EndRow, FinalRow, HudStore, IntroCard, SetupCard, WalkerRow } from './hud';
import { type Dir, type LangkahMatch, STAGES } from './logic';
import { cueWord, formatSpeed, STAGE_INFO, STR } from './strings';

export interface SetupBoard {
  cards: SetupCard[];
  selected: string;
  waiting: string;
}

export interface EndBoard {
  title: string;
  sub: string;
  rows: EndRow[];
}

export interface FinalBoard {
  rows: FinalRow[];
  cols: number;
}

export function chipOf(m: LangkahMatch, id: number): Chip | null {
  const p = m.player(id);
  return p ? { id, name: p.name, fruit: p.fruit, look: p.look, color: p.color } : null;
}

/** The Host's babak menu as the main screen shows it (`rounds`: babak count for Acak). */
export function setupBoard(pick: string, rounds: number, hostName: string): SetupBoard {
  return {
    cards: [
      { id: 'acak', label: STR.acak, sub: STR.acakSub(rounds) },
      ...STAGES.map((s) => ({ id: s, label: STAGE_INFO[s].name, sub: STAGE_INFO[s].short })),
    ],
    selected: pick,
    waiting: STR.setupWaiting(hostName),
  };
}

export function introCard(m: LangkahMatch): IntroCard {
  return {
    of: STR.babakCard(m.babak, m.babakCount),
    stage: m.stage,
    name: STAGE_INFO[m.stage].name,
    desc: STAGE_INFO[m.stage].desc,
    double: m.isFinal,
  };
}

/** Survivors of the babak that just ended, with their babak points. */
export function endBoard(m: LangkahMatch): EndBoard {
  const contestants = m.contestants();
  const survivors = contestants.filter((p) => !p.fallen).length;
  const rows: EndRow[] = [];
  for (const p of contestants) {
    const chip = chipOf(m, p.id);
    if (chip) rows.push({ ...chip, points: p.babakPoints, steps: p.step, safe: !p.fallen });
  }
  rows.sort((a, b) => b.points - a.points);
  return {
    title: survivors > 0 ? STR.babakDone : STR.allDown,
    sub: STR.survivors(survivors),
    rows,
  };
}

export function finalBoard(m: LangkahMatch): FinalBoard {
  const rows: FinalRow[] = [];
  m.standings().forEach((p, i) => {
    const chip = chipOf(m, p.id);
    if (chip) rows.push({ ...chip, rounds: p.rounds, best: p.stats.best, total: p.total, rank: i + 1 });
  });
  return { cols: m.babakCount, rows };
}

/**
 * Index of the cue the group is on: the slowest walker still standing, moved past cues whose window
 * has closed (nobody can press those any more; whoever missed one falls once the grace ends).
 * Null when nobody stands.
 */
export function groupCue(m: LangkahMatch): number | null {
  const alive = m.alive();
  if (alive.length === 0) return null;
  let idx = Math.min(...alive.map((p) => p.next));
  while (idx < m.cues.length && m.cues[idx]!.close < m.t) idx++;
  return idx;
}

const WAIT: CueStrip = { mode: 'wait', now: null, next: [], memo: [], memoSeconds: 0, recallLen: 0 };

export function cueStrip(m: LangkahMatch): CueStrip | null {
  if (m.phase !== 'play') return null;
  if (m.stage === 'ingat' && m.memo) {
    if (m.t < m.memo.recallAt)
      return {
        mode: 'memo',
        now: null,
        next: [],
        memo: m.memoCues().map((c) => c.dir),
        memoSeconds: Math.max(1, Math.ceil(m.memo.recallAt - m.t)),
        recallLen: 0,
      };
    return { mode: 'recall', now: null, next: [], memo: [], memoSeconds: 0, recallLen: m.memo.length };
  }
  const idx = groupCue(m);
  if (idx === null) return null;
  const c = m.cues[idx];
  if (!c || c.show > m.t) return WAIT;
  const span = Math.max(0.05, c.close - c.show);
  const next: Dir[] = [];
  if (m.stage !== 'gua')
    for (let i = idx + 1; i < m.cues.length && next.length < 2; i++) next.push(m.cues[i]!.dir);
  return {
    mode: 'walk',
    now: {
      dir: c.dir,
      word: cueWord(m.stage, c.dir),
      hidden: c.hide !== null && m.t >= c.hide,
      left: Math.max(0, Math.min(1, (c.close - m.t) / span)),
    },
    next,
    memo: [],
    memoSeconds: 0,
    recallLen: 0,
  };
}

export function walkerRows(m: LangkahMatch, offline: (id: number) => boolean): WalkerRow[] {
  return [...m.players]
    .sort((a, b) => Number(a.fallen) - Number(b.fallen) || b.step - a.step)
    .map((p) => ({
      id: p.id,
      name: p.name,
      fruit: p.fruit,
      look: p.look,
      color: p.color,
      steps: p.step,
      fallen: p.inRound && p.fallen,
      waiting: !p.inRound,
      offline: offline(p.id),
    }));
}

/** The running HUD (title, counters, cue strip, walker list) for the match as it is now. */
export function fillHud(h: HudStore, m: LangkahMatch, offline: (id: number) => boolean): void {
  if (m.phase === 'setup') return;
  h.title.value = STR.babakTitle(m.babak, m.stage);
  h.double.value = m.isFinal;
  h.step.value = m.stepNo;
  h.alive.value = `${m.alive().length}/${m.contestants().length}`;
  h.speed.value = formatSpeed(m.phase === 'play' ? m.speed : 1);
  h.record.value = m.record ? STR.record(m.record.name, m.record.steps) : '';
  const left = m.secondsLeft;
  h.seconds.value = m.phase === 'play' && left <= 10 ? Math.ceil(left) : null;
  h.cue.value = cueStrip(m);
  h.rows.value = walkerRows(m, offline);
}
