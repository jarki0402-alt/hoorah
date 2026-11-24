/**
 * Phone views for every phase, built from match state only (pure, testable).
 */
import type { ControllerView, GuestPlayer, PadButton } from '@hoorah/protocol';
import type { GameResult } from '@hoorah/sdk';
import { isCpu } from '../common/cpu';
import type { ArenaMatch, Snake } from './logic';
import { formatClock, STR } from './strings';

/** Show the steering hint for this long after the start (ms of play). */
export const HINT_MS = 12_000;

/** NGEBUT: one big round button under the right thumb, held to boost (PAD_ACTION, like Dapur Heboh's Kerja). */
const BOOST: PadButton = {
  id: 'boost',
  label: STR.actionLabel,
  sub: STR.actionSub,
  icon: 'zap',
  tone: 'yellow',
  press: 'hold',
  big: true,
};

function guests(m: ArenaMatch): GuestPlayer[] {
  return m
    .field()
    .filter((o) => isCpu(o.id))
    .map((o) => ({ id: o.id, name: o.name, fruit: o.fruit, look: o.look, color: o.color }));
}

export function countdownView(m: ArenaMatch, s: Snake): ControllerView {
  const cpus = guests(m);
  return {
    kind: 'countdown',
    value: String(Math.max(1, m.countValue)),
    title: STR.countdownTitle,
    subtitle: STR.countdownSub,
    color: s.color,
    opponents: m
      .field()
      .filter((o) => o.id !== s.id)
      .map((o) => o.id),
    ...(cpus.length ? { guests: cpus } : {}),
  };
}

function knockedEyebrow(m: ArenaMatch, s: Snake): string {
  const by = s.lastKiller === null ? undefined : m.snake(s.lastKiller);
  if (s.lastCause === 'wall' || !by) return STR.knockedWall;
  return s.lastCause === 'head' ? STR.knockedHead(by.name) : STR.knockedBody(by.name);
}

/** The joystick pad while playing: length, rank, time and knock-outs; locked while knocked out. */
export function padView(m: ArenaMatch, s: Snake, rank: number, total: number): ControllerView {
  const stats = [
    { label: STR.statRank, value: STR.rankValue(rank, total) },
    { label: STR.statTime, value: formatClock(m.timeLeft()) },
    { label: STR.statKo, value: String(s.kos) },
  ];
  const base = {
    kind: 'pad' as const,
    mode: 'stick' as const,
    color: s.color,
    stats,
    buttons: [BOOST],
  };
  if (m.phase === 'intro') {
    return {
      ...base,
      title: STR.lengthTitle(m.shown(m.tuning.baseLen)),
      eyebrow: STR.phoneEyebrow,
      banner: STR.ready,
      hint: STR.hintSteer,
      locked: true,
    };
  }
  if (!s.alive) {
    const first = s.deaths === 0;
    const left = Math.max(1, Math.ceil(m.respawnLeft(s) / 1000));
    return {
      ...base,
      title: first ? STR.lengthTitle(m.shown(m.tuning.baseLen)) : STR.knockedTitle,
      eyebrow: first ? STR.phoneEyebrow : knockedEyebrow(m, s),
      banner: first ? STR.joinIn : STR.respawnIn(left),
      locked: true,
    };
  }
  const played = m.now - m.playStart;
  const hint = m.isProtected(s)
    ? STR.hintSafe
    : played < HINT_MS
      ? STR.hintSteer
      : s.wantBoost && s.len <= m.tuning.minBoostLen
        ? STR.hintShort
        : undefined;
  return {
    ...base,
    title: STR.lengthTitle(m.shown(s.len)),
    eyebrow: m.isProtected(s) ? STR.safeEyebrow : m.leaderId === s.id ? STR.leadEyebrow : STR.phoneEyebrow,
    ...(hint ? { hint } : {}),
  };
}

export function watchView(id: number): ControllerView {
  return {
    kind: 'message',
    eyebrow: STR.phoneEyebrow,
    title: STR.watchTitle,
    subtitle: STR.watchSubtitle,
    tone: 'neutral',
    avatarOf: id,
  };
}

export function resultView(m: ArenaMatch, s: Snake, result: GameResult): ControllerView {
  const entry = result.ranking.find((r) => r.playerId === s.id);
  const rank = entry?.rank ?? result.ranking.length;
  const chips = (result.awards ?? []).filter((a) => a.playerId === s.id).map((a) => a.title);
  return {
    kind: 'result',
    // A podium place in a bigger field is worth a cheer; last of a duel is not.
    tone: rank === 1 ? 'win' : rank <= 3 && result.ranking.length >= 4 ? 'good' : 'lose',
    title: rank === 1 ? STR.phoneWin : STR.phonePlace(rank),
    subtitle: STR.phoneSubtitle(entry?.score ?? 0),
    stats: [
      { label: STR.statBest, value: String(m.shown(s.best)) },
      { label: STR.statKo, value: String(s.kos) },
      { label: STR.statEaten, value: String(s.eaten) },
    ],
    ...(chips.length ? { chips } : {}),
  };
}

/** What a phone should show right now (periodic updates and reconnects). */
export function viewFor(
  m: ArenaMatch,
  id: number,
  rank: number,
  total: number,
  result: GameResult | null,
): ControllerView {
  const s = m.snake(id);
  if (!s?.inMatch || s.gone) return watchView(id);
  switch (m.phase) {
    case 'intro':
      return padView(m, s, rank, total);
    case 'countdown':
      return countdownView(m, s);
    case 'play':
      return padView(m, s, rank, total);
    default:
      return result
        ? resultView(m, s, result)
        : {
            kind: 'message',
            eyebrow: STR.phoneEyebrow,
            title: STR.timeUpTitle,
            subtitle: STR.timeUpSubtitle,
            tone: 'neutral',
            avatarOf: id,
          };
  }
}
