/**
 * Lantai Runtuh phone views (pure, testable): the landscape pad with the joystick and the DORONG
 * button (its 3-second rest drawn as a ring on the phone), a waiting screen with cheers for whoever
 * fell, the round cards and the final result.
 */
import type { ControllerView, GuestPlayer, PadButton } from '@hoorah/protocol';
import { type Contestant, type RuntuhMatch, TIMING } from './logic';
import { formatSeconds, STR } from './strings';

export const PUSH_BUTTON: PadButton = {
  id: 'push',
  label: STR.push,
  icon: 'push',
  tone: 'orange',
  press: 'tap',
  big: true,
  cooldownMs: TIMING.pushCooldown * 1000,
};

export interface ViewContext {
  match: RuntuhMatch;
  id: number;
  guests: GuestPlayer[];
  titles: ReadonlyMap<number, string>;
}

function rank(m: RuntuhMatch, p: Contestant): number {
  return m.standings().indexOf(p) + 1;
}

function instruction(m: RuntuhMatch): string {
  const c = m.call;
  if (c && m.callStage === 'show') return STR.phoneRule.gelap;
  if (c && (m.callStage === 'count' || m.callStage === 'drop')) return STR.phoneCall(c);
  return STR.phoneRule[m.rule];
}

export function padView(m: RuntuhMatch, p: Contestant): ControllerView {
  const left = m.secondsLeft;
  const view: ControllerView = {
    kind: 'pad',
    mode: 'stick',
    color: p.color,
    eyebrow: STR.roundOf(m.round, m.rules.length),
    title: instruction(m),
    stats: [
      { label: STR.statScore, value: String(p.total) },
      { label: STR.statRank, value: `${rank(m, p)}/${m.players.length}` },
      { label: STR.statTime, value: formatSeconds(left) },
    ],
    buttons: [PUSH_BUTTON],
    hint: STR.hint,
  };
  if (m.isFinal) view.alert = { title: STR.double, tone: 'yellow' };
  return view;
}

export function viewFor(ctx: ViewContext): ControllerView {
  const { match: m, id } = ctx;
  const p = m.player(id);
  if (!p) {
    return {
      kind: 'message',
      eyebrow: STR.gameTitle,
      title: STR.spectatorTitle,
      subtitle: STR.spectatorSub,
      tone: 'neutral',
      avatarOf: id,
      reactions: true,
    };
  }
  const withGuests = (v: ControllerView): ControllerView =>
    ctx.guests.length > 0 ? { ...v, guests: ctx.guests } : v;
  switch (m.phase) {
    case 'intro':
      return withGuests({
        kind: 'countdown',
        value: String(Math.max(1, Math.ceil(TIMING.intro - m.phaseT))),
        title: STR.introTitle(m.round, m.rule),
        subtitle: STR.rules[m.rule].desc,
        color: p.color,
        opponents: m.players.filter((o) => o.id !== id).map((o) => o.id),
      });
    case 'play': {
      if (!p.out) return padView(m, p);
      const fresh = p.rounds.length < m.round;
      const next = m.round + 1 < m.rules.length ? m.rules[m.round + 1]! : null;
      return {
        kind: 'message',
        eyebrow: STR.roundOf(m.round, m.rules.length),
        title: fresh ? STR.waitTitle : STR.fellTitle,
        subtitle: fresh ? STR.waitSub : STR.fellSub(next, m.round),
        tone: fresh ? 'neutral' : 'bad',
        avatarOf: id,
        stats: [
          { label: STR.fellStat, value: String(m.roundPoints(p)) },
          { label: STR.statScore, value: String(p.total) },
        ],
        reactions: true,
      };
    }
    case 'end': {
      const pts = p.rounds[p.rounds.length - 1] ?? 0;
      return {
        kind: 'message',
        eyebrow: STR.roundOf(m.round, m.rules.length),
        title: STR.endTitle(pts),
        subtitle: STR.endSub(!p.out),
        tone: p.out ? 'neutral' : 'good',
        avatarOf: id,
        stats: [
          { label: STR.statScore, value: String(p.total) },
          { label: STR.statRank, value: `${rank(m, p)}/${m.players.length}` },
        ],
        reactions: true,
      };
    }
    case 'final':
    case 'done': {
      const r = rank(m, p);
      const title = ctx.titles.get(id);
      const view: ControllerView = {
        kind: 'result',
        tone: r === 1 ? 'win' : r <= 3 ? 'good' : 'neutral',
        title: STR.resultPhoneTitle(r),
        big: String(p.total),
        subtitle: STR.resultPhoneSub(p.stats.survived, m.rules.length),
        stats: [
          { label: STR.statSurvived, value: String(p.stats.survived) },
          { label: STR.statFalls, value: String(p.stats.falls) },
        ],
      };
      return title ? { ...view, chips: [title] } : view;
    }
  }
}
