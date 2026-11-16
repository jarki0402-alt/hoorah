/** Phone views for every phase, built from match state only (pure, testable). */
import { type ControllerView, type GuestPlayer, PLAYER_COLOR_NAMES } from '@hoorah/protocol';
import type { GameResult } from '@hoorah/sdk';
import { isCpu } from '../common/cpu';
import type { Runner, WilayahMatch } from './logic';
import { formatClock, formatPct, STR } from './strings';

/** The start hint stays on the phone for the first seconds of play. */
const HINT_MS = 15_000;

export interface ViewContext {
  match: WilayahMatch;
  id: number;
  /** Game clock (ms). */
  t: number;
  /** Final result once time is up. */
  result: GameResult | null;
}

function guests(match: WilayahMatch): GuestPlayer[] {
  return match
    .all()
    .filter((r) => isCpu(r.id))
    .map((r) => ({ id: r.id, name: r.name, fruit: r.fruit, color: r.color }));
}

function countdownView(match: WilayahMatch, r: Runner): ControllerView {
  const colorName = PLAYER_COLOR_NAMES[r.color.toUpperCase()];
  const view: ControllerView = {
    kind: 'countdown',
    value: String(Math.max(1, match.countValue)),
    title: STR.countdownTitle,
    subtitle: colorName ? STR.countdownSub(colorName) : STR.countdownSubPlain,
    color: r.color,
    opponents: match
      .all()
      .filter((o) => o.id !== r.id)
      .map((o) => o.id),
  };
  const g = guests(match);
  return g.length > 0 ? { ...view, guests: g } : view;
}

/** One decimal while small (a fresh square is 0,5%), whole numbers after. */
function phonePct(pct: number): string {
  return pct < 10 ? formatPct(pct, 1) : String(Math.floor(pct));
}

function padView(match: WilayahMatch, r: Runner, t: number): ControllerView {
  const total = match.all().length;
  const stats = [
    { label: STR.statRank, value: STR.rankOf(match.rankOf(r.id), total) },
    { label: STR.statTime, value: formatClock(match.timeLeft(t)) },
  ];
  if (!r.alive) {
    const left = Math.max(1, Math.ceil((r.respawnAt - t) / 1000));
    return {
      kind: 'pad',
      mode: 'stick',
      color: r.color,
      title: STR.padTitle('0'),
      eyebrow: STR.eyebrowDown,
      stats,
      banner: STR.respawnIn(left),
      locked: true,
    };
  }
  const outside = r.trail.len > 0 || !match.isHome(r);
  const eyebrow = match.isProtected(r, t) ? STR.eyebrowShield : outside ? STR.eyebrowOut : STR.eyebrowHome;
  const view: ControllerView = {
    kind: 'pad',
    mode: 'stick',
    color: r.color,
    title: STR.padTitle(phonePct(match.percent(r))),
    eyebrow,
    stats,
  };
  return t - match.goAt < HINT_MS ? { ...view, hint: STR.padHint } : view;
}

function resultView(match: WilayahMatch, r: Runner, result: GameResult): ControllerView {
  const me = result.ranking.find((x) => x.playerId === r.id);
  const rank = me?.rank ?? match.rankOf(r.id);
  const shared = result.ranking.filter((x) => x.rank === 1).length > 1;
  const title = rank === 1 ? (shared ? STR.resultTie : STR.resultWin) : STR.resultPlace(rank);
  return {
    kind: 'result',
    tone: rank === 1 ? 'win' : rank <= 3 ? 'good' : 'neutral',
    title,
    big: `${formatPct(match.percent(r))}%`,
    subtitle: result.title,
    stats: [
      { label: STR.resultStatKills, value: String(r.stats.kills) },
      { label: STR.resultStatBest, value: `${formatPct((r.stats.bestCapture * 100) / match.field.size)}%` },
      { label: STR.resultStatPeak, value: `${formatPct((r.stats.peak * 100) / match.field.size)}%` },
    ],
  };
}

export function viewFor(ctx: ViewContext): ControllerView | null {
  const { match, id, t, result } = ctx;
  const r = match.runner(id);
  if (!r) {
    if (!match.spectators.has(id)) return null;
    return {
      kind: 'message',
      eyebrow: STR.gameTitle,
      title: STR.spectatorTitle,
      subtitle: STR.spectatorSubtitle,
      tone: 'neutral',
      avatarOf: id,
    };
  }
  switch (match.phase) {
    case 'countdown':
      return countdownView(match, r);
    case 'play':
      return padView(match, r, t);
    case 'over':
    case 'done':
      return result ? resultView(match, r, result) : padView(match, r, t);
  }
}
