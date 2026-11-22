/**
 * Phone screens for every phase of Juara Eja (pure: derived from the match, so the driver can
 * recompute and resend them at any time, e.g. after a reconnect). The word itself never travels
 * to a phone before the reveal.
 */
import type { ControllerView } from '@hoorah/protocol';
import { type EjaMatch, LIVES, type Seat } from './logic';
import { LANG_NAME, NEAR_TEXT, STR, TIER_NAME } from './strings';

const SETUP_COLORS = { id: '#FF5A1F', en: '#2E7D4F' } as const;

export interface ViewContext {
  hostId: number | null;
  name: (id: number) => string;
}

function setupView(m: EjaMatch, me: number, ctx: ViewContext): ControllerView {
  const view: Extract<ControllerView, { kind: 'menu' }> = {
    kind: 'menu',
    eyebrow: STR.menuEyebrow,
    title: STR.menuLangTitle,
    hint: STR.menuLangHint,
    options: (['id', 'en'] as const).map((l) => ({
      id: l,
      label: LANG_NAME[l],
      sub: STR.langSub[l],
      color: SETUP_COLORS[l],
      thumb: `lang-${l}`,
    })),
    selected: m.lang,
    confirm: { id: 'start', label: STR.menuStart, style: 'yellow' },
  };
  if (me !== ctx.hostId) {
    const { confirm: _c, hint: _h, ...rest } = view;
    return {
      ...rest,
      locked: true,
      waiting: STR.menuWaiting(ctx.hostId !== null ? ctx.name(ctx.hostId) : 'Host'),
    };
  }
  return view;
}

function eyebrow(m: EjaMatch, s: Seat): string {
  const tier = TIER_NAME[m.tier];
  return m.solo ? STR.phoneEyebrowSolo(s.streak, tier) : STR.phoneEyebrow(m.index + 1, m.total, tier);
}

/** The word's letters, as shown on the phone after the reveal. */
const upper = (w: string) => w.toUpperCase();

function revealView(m: EjaMatch, s: Seat): ControllerView {
  const word = upper(m.word?.word ?? '');
  const yours = s.answer ? STR.phoneYours(upper(s.answer)) : undefined;
  if (s.verdict === 'correct') {
    return {
      kind: 'result',
      tone: 'good',
      title: STR.phoneCorrect,
      big: s.practice ? undefined : STR.plus(s.gained),
      subtitle: s.practice ? STR.phonePractice : m.solo ? STR.streak(s.streak) : undefined,
      chips: [word],
    };
  }
  const title =
    s.verdict === 'near' && s.near
      ? NEAR_TEXT[s.near]
      : s.verdict === 'none'
        ? STR.phoneTimeout
        : STR.phoneWrong;
  const life = s.practice ? STR.phonePractice : STR.phoneLifeLost(s.lives);
  return {
    kind: 'result',
    tone: s.verdict === 'near' ? 'neutral' : 'bad',
    title,
    subtitle: yours ? `${yours} · ${life}` : life,
    chips: [word],
  };
}

export function viewFor(m: EjaMatch, me: number, now: number, ctx: ViewContext): ControllerView | null {
  const s = m.seat(me);
  if (!s?.present) return null;
  if (m.phase === 'setup') return setupView(m, me, ctx);
  if (m.phase === 'final' || m.phase === 'ended') {
    const row = m.standings().find((r) => r.seat.id === me);
    const rank = row?.rank ?? 1;
    return {
      kind: 'result',
      tone: rank === 1 ? 'win' : 'neutral',
      title: m.solo ? STR.phoneFinalSolo(s.stats.bestStreak) : STR.phoneFinal(rank),
      big: String(s.score),
      subtitle: `${STR.points(s.score)} · ${STR.kamusLabel}`,
      chips: s.spelled.slice(-12).map(upper),
    };
  }
  if (!s.inWord)
    return { kind: 'message', title: STR.phoneWatchTitle, subtitle: STR.phoneWatchSub, tone: 'neutral' };

  switch (m.phase) {
    case 'intro':
      return {
        kind: 'message',
        eyebrow: eyebrow(m, s),
        title: STR.phoneIntroTitle,
        subtitle: STR.phoneIntroSub,
        tone: 'neutral',
      };
    case 'spell': {
      if (s.answer !== null) {
        return {
          kind: 'message',
          eyebrow: eyebrow(m, s),
          title: STR.phoneSentTitle,
          subtitle: STR.phoneSentSub,
          tone: 'good',
        };
      }
      const practice = s.lives <= 0;
      const length = m.word?.word.length ?? 8;
      return {
        kind: 'word',
        eyebrow: eyebrow(m, s),
        title: practice ? STR.phoneTitlePractice : STR.phoneTitle,
        hint: practice ? STR.phoneHintPractice : STR.phoneHint,
        lives: { left: s.lives, total: LIVES },
        maxLength: length,
        slots: true,
        extra: { id: 'replay', label: STR.replay, style: 'secondary' },
        turn: m.index * 10 + 1,
        ...(m.deadlineAt(now) !== undefined ? { deadline: m.deadlineAt(now) } : {}),
      };
    }
    case 'reveal':
      return revealView(m, s);
    default:
      return null;
  }
}
