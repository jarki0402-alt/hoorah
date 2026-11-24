/** Phone views for Catur. Pure builders: the driver decides when to send them. */
import type { ChessSide, ControllerView, GuestPlayer, ViewStat } from '@hoorah/protocol';
import { boardString, type Color, findMove, opposite, san, uci } from './chess';
import type { CaturMatch } from './logic';
import { STR } from './strings';

export type NameOf = (id: number) => string;

export function sideInfo(match: CaturMatch, c: Color, nameOf: NameOf): ChessSide {
  const ids = match.sides[c];
  if (match.mode === 'team') return { label: STR.team(c), ids: [...ids] };
  const id = ids[0];
  return { label: id === undefined ? STR.waitingPlayer : nameOf(id), ids: id === undefined ? [] : [id] };
}

/** "e2e4" -> "e4" in the current position (for the vote hint). */
function sanOf(match: CaturMatch, move: string): string {
  const m = findMove(match.moves, move);
  return m ? san(match.pos, m, match.moves) : move;
}

/** The board view every player sees during the game (and the intro). */
export function boardView(
  match: CaturMatch,
  id: number,
  nameOf: NameOf,
  guests: readonly GuestPlayer[] = [],
): ControllerView {
  const own = match.colorOf(id);
  const both = match.sides.w.includes(id) && match.sides.b.includes(id);
  const side: Color = own ?? 'w';
  const turn = match.turn;
  const last = match.lastMove();
  const check = match.checkSquare();
  const playing = match.phase === 'play';
  const myTurn = playing && match.canAct(id);
  const view: Extract<ControllerView, { kind: 'chess' }> = {
    kind: 'chess',
    board: boardString(match.pos),
    side: both ? 'w' : side,
    turn,
    players: { w: sideInfo(match, 'w', nameOf), b: sideInfo(match, 'b', nameOf) },
    clock: {
      w: Math.round(match.clock.w),
      b: Math.round(match.clock.b),
      run: match.running ? turn : null,
      at: Math.round(match.clockAt),
    },
    eyebrow: '',
    // Phones only know room players, so a computer opponent's looks travel along.
    ...(guests.length
      ? {
          guests: guests.map(({ id: g, name, fruit, look, color }) => ({
            id: g,
            name,
            fruit,
            ...(look ? { look } : {}),
            color,
          })),
        }
      : {}),
  };
  if (last) view.last = last.uci;
  if (check) view.check = check;

  if (match.phase === 'intro') {
    view.eyebrow = STR.phoneIntro;
    view.hint = own
      ? match.mode === 'team'
        ? STR.phoneTeamYouAre(own)
        : STR.phoneYouAre(own)
      : STR.phoneWatchHint;
    view.locked = true;
    return view;
  }
  if (!own) {
    view.eyebrow = STR.phoneWatch;
    view.hint = STR.phoneWatchHint;
    view.locked = true;
    return view;
  }
  if (match.held) {
    view.eyebrow = STR.phonePaused;
    view.locked = true;
    return view;
  }
  if (myTurn) {
    view.moves = match.moves.map(uci);
    if (match.mode === 'team') {
      view.eyebrow = STR.phoneTeamVote;
      const mine = match.voteOf(id);
      view.hint = mine ? STR.phoneTeamVoted(sanOf(match, mine)) : STR.phoneTeamVoteHint;
      view.votes = match.tally().map((t) => ({ move: t.move, count: t.count }));
      if (mine) view.myVote = mine;
      view.deadline = Math.round(match.voteUntil);
    } else {
      view.eyebrow = STR.phoneYourTurn;
      view.hint = STR.phoneYourTurnHint;
    }
  } else {
    const other = opposite(side);
    view.eyebrow =
      match.mode === 'team' ? STR.phoneTeamWait(other) : STR.phoneWait(sideInfo(match, other, nameOf).label);
    view.hint = STR.phoneWaitHint;
  }
  if (match.mode === 'duel' && !both)
    view.actions = [{ id: 'resign', label: STR.resign, style: 'secondary' }];
  return view;
}

/** After the game: own result on the phone, with the final board kept on the main screen. */
export function resultView(match: CaturMatch, id: number): ControllerView {
  const out = match.outcome;
  const own = match.colorOf(id);
  const team = match.mode === 'team';
  const s = match.stats.get(id);
  const stats: ViewStat[] = [{ label: STR.resultGame, value: STR.resultGameValue(match.history.length) }];
  if (s && own) {
    stats.unshift({ label: team ? STR.resultMovesTeam : STR.resultMoves, value: String(s.moves) });
    stats.push({ label: STR.resultCaptured, value: String(s.captured) });
  }
  const reasonLoser = out?.winner ? opposite(out.winner) : match.turn;
  const loserLabel = team ? STR.team(reasonLoser) : STR.color[reasonLoser];
  const subtitle = out ? STR.reason(out.reason, loserLabel) : undefined;
  const actions = [{ id: 'rematch', label: STR.rematch, style: 'primary' as const }];
  if (!out || out.winner === null || !own) {
    return {
      kind: 'result',
      tone: 'neutral',
      title: out ? STR.overTitle(out.reason) : STR.phoneOver,
      ...(out?.winner ? { big: STR.overWinner(team ? STR.team(out.winner) : STR.color[out.winner]) } : {}),
      ...(subtitle ? { subtitle } : {}),
      stats,
      actions,
    };
  }
  const won = out.winner === own;
  return {
    kind: 'result',
    tone: won ? 'win' : 'lose',
    title: won ? (team ? STR.resultTeamWin : STR.resultWin) : team ? STR.resultTeamLose : STR.resultLose,
    big: STR.overTitle(out.reason),
    ...(subtitle ? { subtitle } : {}),
    stats,
    actions,
  };
}
