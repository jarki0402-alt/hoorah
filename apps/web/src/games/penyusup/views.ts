/**
 * Phone screens for every phase (pure: derived from the match, so the driver can recompute and
 * resend them at any time, e.g. after a reconnect). The secret word only ever travels in the
 * player's own `peek` view.
 */
import type { ControllerView, MenuOption } from '@hoorah/protocol';
import { KOSONG_MIN, MIN_PLAYERS, type PenyusupMatch, type Seat } from './logic';
import { LANG_NAME, LANG_TAG, MODE_NAME, ROLE_NAME, STR } from './strings';

export const ACCENT = '#FFC928';
const SETUP_COLORS = ['#FFC928', '#FF8A1F', '#14B8C4', '#22B35E'] as const;

export interface ViewContext {
  hostId: number | null;
  name: (id: number) => string;
  color: (id: number) => string;
  /** The last refused typed clue of this player this turn (text + how many so far). */
  refusal?: (id: number) => { text: string; n: number } | undefined;
}

function setupView(m: PenyusupMatch, me: number, ctx: ViewContext): ControllerView {
  const steps = 3;
  let view: Extract<ControllerView, { kind: 'menu' }>;
  switch (m.step) {
    case 'lang':
      view = {
        kind: 'menu',
        eyebrow: STR.menuEyebrow(1, steps),
        title: STR.menuLangTitle,
        hint: STR.menuLangHint,
        options: (['id', 'en'] as const).map((l, i) => ({
          id: l,
          label: LANG_NAME[l],
          sub: STR.langSub[l],
          color: SETUP_COLORS[i],
          thumb: `lang-${l}`,
        })),
        selected: m.settings.lang,
        confirm: { id: 'next', label: STR.menuNext, style: 'primary' },
      };
      break;
    case 'mode':
      view = {
        kind: 'menu',
        eyebrow: STR.menuEyebrow(2, steps),
        title: STR.menuModeTitle,
        hint: STR.menuModeHint,
        options: (['lisan', 'ketik'] as const).map((md, i) => ({
          id: md,
          label: MODE_NAME[md],
          sub: STR.modeSub[md],
          color: SETUP_COLORS[i + 1],
          thumb: `mode-${md}`,
        })),
        selected: m.settings.mode,
        confirm: { id: 'next', label: STR.menuNext, style: 'primary' },
        back: { id: 'back', label: STR.menuBack, style: 'secondary' },
      };
      break;
    case 'kosong': {
      const allowed = m.kosongAllowed();
      const enough = m.roster.filter((s) => s.present).length >= MIN_PLAYERS;
      const options: MenuOption[] = [
        {
          id: 'on',
          label: STR.kosongOn,
          sub: allowed ? STR.kosongOnSub : STR.kosongOnLocked,
          color: SETUP_COLORS[2],
          disabled: !allowed,
          thumb: 'kosong-on',
        },
        {
          id: 'off',
          label: STR.kosongOff,
          sub: STR.kosongOffSub,
          color: SETUP_COLORS[3],
          thumb: 'kosong-off',
        },
      ];
      view = {
        kind: 'menu',
        eyebrow: STR.menuEyebrow(3, steps),
        title: STR.menuKosongTitle,
        hint: enough ? STR.menuKosongHint : STR.needPlayers(MIN_PLAYERS),
        options,
        selected: m.settings.kosong ? 'on' : 'off',
        confirm: { id: 'start', label: STR.menuStart, style: 'yellow' },
        back: { id: 'back', label: STR.menuBack, style: 'secondary' },
      };
      break;
    }
  }
  if (me !== ctx.hostId) {
    const { confirm: _c, back: _b, hint: _h, ...rest } = view;
    return {
      ...rest,
      locked: true,
      waiting: STR.menuWaiting(ctx.hostId !== null ? ctx.name(ctx.hostId) : 'Host'),
    };
  }
  return view;
}

/** The player's card, face down until held. */
function card(
  m: PenyusupMatch,
  s: Seat,
  now: number,
  extra: Partial<Extract<ControllerView, { kind: 'peek' }>>,
): ControllerView {
  const blank = s.role === 'kosong';
  return {
    kind: 'peek',
    eyebrow: STR.cardEyebrow,
    title: STR.cardTitle(m.round + 1, LANG_NAME[m.settings.lang]),
    word: blank ? '' : s.word.toUpperCase(),
    blank: STR.cardBlank,
    caption: blank ? STR.cardBlankCaption : STR.cardCaption,
    tag: LANG_TAG[m.settings.lang],
    hint: blank ? STR.cardHintKosong : STR.cardHint,
    deal: m.round + 1,
    ...(m.deadlineAt(now) !== undefined ? { deadline: m.deadlineAt(now) } : {}),
    ...extra,
  };
}

function waiting(title: string, subtitle: string, reactions = true): ControllerView {
  return { kind: 'message', title, subtitle, tone: 'neutral', reactions };
}

function voteView(m: PenyusupMatch, s: Seat, ctx: ViewContext): ControllerView {
  if (s.locked) {
    return {
      kind: 'message',
      title: STR.voteLockedTitle,
      subtitle: STR.voteLockedSub,
      tone: 'good',
      eyebrow: STR.voteMenuEyebrow(m.round + 1),
    };
  }
  const order = m.table;
  const options: MenuOption[] = m.alive
    .filter((t) => t.id !== s.id)
    .map((t) => ({
      id: String(t.id),
      label: ctx.name(t.id),
      sub: STR.voteSeat(order.indexOf(t) + 1),
      color: ctx.color(t.id),
    }));
  return {
    kind: 'menu',
    eyebrow: STR.voteMenuEyebrow(m.round + 1),
    title: s.alive ? STR.voteMenuTitle : STR.guessMenuTitle,
    hint: s.alive ? STR.voteMenuHint : STR.guessMenuHint,
    options,
    ...(s.vote !== null ? { selected: String(s.vote) } : {}),
    confirm: { id: 'lock', label: STR.voteLock, style: 'yellow' },
  };
}

function roundStats(s: Seat) {
  return [
    { label: STR.roundPoints, value: STR.gained(s.gained) },
    { label: STR.totalPoints, value: String(s.score) },
  ];
}

export function viewFor(m: PenyusupMatch, me: number, now: number, ctx: ViewContext): ControllerView | null {
  const s = m.seat(me);
  if (!s?.present) return null;
  if (m.phase === 'setup') return setupView(m, me, ctx);
  if (m.phase === 'final' || m.phase === 'ended') {
    const row = m.standings().find((r) => r.seat.id === me);
    const rank = row?.rank ?? 1;
    return {
      kind: 'result',
      tone: rank === 1 ? 'win' : 'neutral',
      title: STR.finalTitlePhone(rank),
      big: String(s.score),
      subtitle: STR.points(s.score),
    };
  }
  if (!s.inRound) return waiting(STR.watchTitle, STR.watchSub);

  switch (m.phase) {
    case 'deal':
      return card(m, s, now, {
        ...(s.ready
          ? { hint: STR.cardWaiting }
          : { action: { id: 'ready', label: STR.cardSeen, style: 'yellow' } }),
      });
    case 'clue': {
      if (!s.alive) return waiting(STR.outTitle, STR.outSub);
      const speaker = m.speaker;
      const position = m.order.indexOf(me) + 1;
      if (speaker === me) {
        if (m.settings.mode === 'ketik') {
          if (m.lastClue?.id === me) {
            return card(m, s, now, { title: STR.turnMine, spotlight: true, hint: STR.turnOtherHint });
          }
          const refused = ctx.refusal?.(me);
          return {
            kind: 'word',
            eyebrow: STR.typeEyebrow,
            title: STR.typeTitle,
            hint: STR.typeHint,
            maxLength: 16,
            turn: (m.round * 1000 + m.votes * 100 + m.circuit * 20 + m.turn) * 50 + (refused?.n ?? 0),
            ...(refused ? { error: refused.text } : {}),
            ...(m.deadlineAt(now) !== undefined ? { deadline: m.deadlineAt(now) } : {}),
          };
        }
        return card(m, s, now, {
          title: STR.turnMine,
          hint: STR.turnMineHint,
          spotlight: true,
          action: { id: 'done', label: STR.turnDone, style: 'yellow' },
        });
      }
      return card(m, s, now, {
        title: speaker !== null ? STR.turnOther(ctx.name(speaker)) : STR.cardEyebrow,
        eyebrow: position > 0 ? STR.turnOrder(position) : STR.cardEyebrow,
        hint: STR.turnOtherHint,
      });
    }
    case 'vote':
      return voteView(m, s, ctx);
    case 'tally':
      return waiting(STR.tallyPhoneTitle, STR.tallyPhoneSub, false);
    case 'reveal': {
      const out = m.tally?.out ?? null;
      if (out === me) return { kind: 'message', title: STR.revealYouOut, subtitle: STR.outSub, tone: 'bad' };
      return waiting(
        out !== null ? STR.revealOtherOut(ctx.name(out)) : STR.tallyPhoneTitle,
        STR.tallyPhoneSub,
      );
    }
    case 'guess': {
      const out = m.tally?.out ?? null;
      if (out === me && !m.guessed) {
        return {
          kind: 'word',
          eyebrow: STR.guessPhoneEyebrow,
          title: STR.guessPhoneTitle,
          hint: STR.guessPhoneHint,
          maxLength: 16,
          turn: 90_000 + m.round * 10 + m.votes,
          ...(m.deadlineAt(now) !== undefined ? { deadline: m.deadlineAt(now) } : {}),
        };
      }
      return waiting(STR.guessWaitTitle(out !== null ? ctx.name(out) : ''), STR.guessWaitSub);
    }
    case 'roundEnd': {
      const won =
        m.outcome !== null &&
        ((m.outcome.side === 'warga' && s.role === 'warga') ||
          (m.outcome.side === 'beda' && s.role !== 'warga') ||
          (m.outcome.side === 'kosong' && s.role === 'kosong'));
      return {
        kind: 'message',
        eyebrow: STR.sideTitle[m.outcome?.side ?? 'warga'],
        title: STR.roundYou(ROLE_NAME[s.role], s.word.toUpperCase()),
        subtitle: m.outcome ? STR.reasonText[m.outcome.reason] : undefined,
        tone: won ? 'good' : 'neutral',
        stats: roundStats(s),
      };
    }
    default:
      return null;
  }
}

/** Si Kosong only counts when it can actually be dealt (table size). */
export function kosongActive(m: PenyusupMatch): boolean {
  return m.settings.kosong && m.table.length >= KOSONG_MIN;
}
