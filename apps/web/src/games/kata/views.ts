/**
 * Phone screens, derived from the match only (pure), so the driver can recompute them at any time
 * and send just what changed. Everyone in the game gets the `word` view: the player whose turn it
 * is can type, the others see the same start locked. Players who are out, late joiners and the
 * final card use `message` views.
 */
import type { ControllerView } from '@hoorah/protocol';
import type { KataMatch } from './logic';
import { STR } from './strings';
import { MAX_WORD } from './words';

export interface ViewContext {
  name: (id: number) => string;
  /** Game time -> server time (phone countdowns). */
  toServer: (t: number) => number;
}

/**
 * Changes on every new turn and again when that turn's verdict comes in, so the phone clears the
 * typed letters after a refusal (and never keeps a stale word).
 */
export function turnKey(m: KataMatch): number {
  return m.turnNo * 2 + (m.phase === 'verdict' ? 1 : 0);
}

export function viewFor(m: KataMatch, id: number, ctx: ViewContext): ControllerView {
  const seat = m.seatOf(id);
  if (!seat) {
    return {
      kind: 'message',
      eyebrow: STR.phoneEyebrow,
      title: STR.phoneSpectatorTitle,
      subtitle: STR.phoneSpectatorText,
      avatarOf: id,
      tone: 'neutral',
    };
  }

  if (m.phase === 'final' || m.phase === 'ended') {
    const won = m.winner === id;
    return {
      kind: 'message',
      eyebrow: STR.phoneEyebrow,
      title: won
        ? STR.phoneWinTitle
        : m.winner !== null
          ? STR.phoneWinnerIs(ctx.name(m.winner))
          : STR.finalNone,
      subtitle: STR.phoneEndText,
      avatarOf: id,
      tone: won ? 'good' : 'neutral',
      stats: [
        { label: STR.statWords, value: String(seat.words) },
        ...(seat.longest ? [{ label: STR.statLongest, value: seat.longest.toUpperCase() }] : []),
      ],
    };
  }

  const lives = { left: seat.lives, total: m.lives };
  if (seat.lives <= 0) {
    return {
      kind: 'message',
      eyebrow: STR.phoneEyebrow,
      title: STR.phoneOutTitle,
      subtitle: STR.phoneOutText,
      avatarOf: id,
      tone: 'bad',
      stats: [{ label: STR.statWords, value: String(seat.words) }],
    };
  }

  const base = { kind: 'word' as const, lives, maxLength: MAX_WORD, turn: turnKey(m) };

  if (m.phase === 'intro') {
    return {
      ...base,
      eyebrow: STR.phoneEyebrow,
      title: STR.phoneReady,
      hint: STR.phoneReadyHint,
      locked: true,
    };
  }

  const error = missFor(m, id);
  const eyebrow = STR.phoneRound(Math.max(1, m.round));

  if (m.phase === 'turn') {
    const mine = m.currentSeat?.id === id;
    if (mine) {
      return {
        ...base,
        eyebrow,
        title: STR.phoneYourTurn,
        prefix: m.prefix,
        hint: STR.phoneStartHint(m.prefix),
        deadline: Math.round(ctx.toServer(m.deadline)),
      };
    }
    const turnOf = m.currentSeat ? ctx.name(m.currentSeat.id) : STR.unknownPlayer;
    return {
      ...base,
      eyebrow,
      title: STR.phoneTurnOf(turnOf),
      prefix: m.prefix,
      hint: STR.phoneWaitHint,
      deadline: Math.round(ctx.toServer(m.deadline)),
      locked: true,
      ...(error ? { error } : {}),
    };
  }

  // Verdict: show who plays next and from which start.
  const next = m.next ? m.seats[m.next.index] : undefined;
  const accepted = m.attempt?.ok ? m.attempt.word : null;
  return {
    ...base,
    eyebrow,
    title: next ? (next.id === id ? STR.phoneNextYou : STR.phoneTurnOf(ctx.name(next.id))) : STR.phoneReady,
    ...(m.next ? { prefix: m.next.prefix } : {}),
    hint: accepted ? STR.phoneAccepted(accepted) : STR.phoneWaitHint,
    locked: true,
    ...(error ? { error } : {}),
  };
}

/** The refusal reason for this player's last word, while it is still news. */
function missFor(m: KataMatch, id: number): string | undefined {
  const miss = m.lastMiss;
  if (!miss || miss.by !== id || !miss.reason) return undefined;
  const fresh =
    (m.phase === 'verdict' && m.turnNo === miss.turn) ||
    (m.phase === 'turn' && m.turnNo === miss.turn + 1 && m.currentSeat?.id !== id);
  return fresh ? STR.reason(miss.reason, miss.prefix) : undefined;
}
