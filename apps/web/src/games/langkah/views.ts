/**
 * Langkah Maut phone views (pure, testable): the Host's picture menu of babak (everyone else sees
 * it read-only), the round countdown, the d-pad with steps, streak and the arrow preview, the
 * "you fell" screen with cheers and the near-record line, the babak cards and the final result.
 */
import type { ControllerView, GuestPlayer, MenuOption, ViewStat } from '@hoorah/protocol';
import { type LangkahMatch, STAGES, TIMING, type Walker } from './logic';
import { ARROW, STAGE_INFO, STR } from './strings';

export interface ViewContext {
  match: LangkahMatch;
  id: number;
  hostId: number | null;
  guests: GuestPlayer[];
  titles: ReadonlyMap<number, string>;
  /**
   * The phone gets fresh views often enough for the arrow preview to be right (the director
   * turns it off when many phones share the update budget and the tempo is high).
   */
  preview: boolean;
  hostName?: string;
}

const MENU_COLORS: Record<string, string> = {
  acak: '#FF5A1F',
  eskalator: '#2F8CFF',
  titian: '#FFC928',
  tangga: '#FF8A3D',
  laser: '#F2453D',
  batu: '#14B8A6',
  gua: '#8C6A4A',
  ingat: '#22B35E',
  lift: '#C4C7CC',
};

export function setupView(
  m: LangkahMatch,
  me: number,
  hostId: number | null,
  hostName = 'Host',
): ControllerView {
  const options: MenuOption[] = [
    { id: 'acak', label: STR.acak, sub: STR.acakSub(m.rounds), color: MENU_COLORS.acak, thumb: 'acak' },
    ...STAGES.map((s) => ({
      id: s,
      label: STAGE_INFO[s].name,
      sub: STAGE_INFO[s].short,
      color: MENU_COLORS[s],
      thumb: s,
    })),
  ];
  const view: Extract<ControllerView, { kind: 'menu' }> = {
    kind: 'menu',
    eyebrow: STR.gameTitle,
    title: STR.setupTitle,
    hint: STR.setupHint,
    options,
    selected: m.pick,
    confirm: { id: 'start', label: STR.setupStart, style: 'yellow' },
  };
  if (me !== hostId) {
    const { confirm: _c, hint: _h, ...rest } = view;
    return { ...rest, locked: true, waiting: STR.setupWaiting(hostName) };
  }
  return view;
}

function babakRank(m: LangkahMatch, p: Walker): number {
  const list = m.contestants().sort((a, b) => b.step - a.step);
  return list.findIndex((o) => o.id === p.id) + 1;
}

function rank(m: LangkahMatch, p: Walker): number {
  return m.standings().indexOf(p) + 1;
}

function padView(ctx: ViewContext, p: Walker): ControllerView {
  const m = ctx.match;
  const stats: ViewStat[] = [];
  const cue = m.cueFor(p);
  const visible = cue && (cue.hide === null || cue.hide > m.t) && m.stage !== 'ingat';
  if (ctx.preview && visible && cue) stats.push({ label: STR.statNow, value: ARROW[cue.dir] });
  const next = m.nextCueFor(p);
  if (ctx.preview && next && m.stage !== 'ingat' && m.stage !== 'gua')
    stats.push({ label: STR.statNext, value: ARROW[next.dir] });
  stats.push({ label: STR.statStreak, value: String(p.streak) });
  if (stats.length < 3) stats.push({ label: STR.statPoints, value: String(p.total + p.babakPoints) });
  const view: ControllerView = {
    kind: 'pad',
    mode: 'dpad',
    // Every press also goes over the reliable channel: a lost fast frame must never be a fall.
    reliable: true,
    color: p.color,
    eyebrow: m.isFinal ? STR.phoneEyebrowFinal(m.babak, m.stage) : STR.phoneEyebrow(m.babak, m.stage),
    title: STR.phoneTitle(p.step),
    stats,
    hint: STR.phoneHint,
  };
  if (m.stage === 'ingat' && m.memo) {
    view.alert =
      m.t < m.memo.recallAt
        ? { title: STR.phoneMemo, tone: 'yellow' }
        : { title: STR.phoneRecall, tone: 'yellow' };
  }
  return view;
}

function fellView(ctx: ViewContext, p: Walker): ControllerView {
  const m = ctx.match;
  const lines: string[] = [];
  if (p.why) lines.push(STR.fellWhy[p.why]);
  const best = p.prevBest;
  if (best > 0 && p.step > best) lines.push(STR.newRecord(p.step));
  else if (best > 0 && p.step < best && best - p.step <= 3) lines.push(STR.nearRecord(best - p.step, best));
  const nextNo = m.babak + 1;
  const nextStage = m.plan[nextNo];
  lines.push(nextStage ? STR.nextBabak(nextNo, nextStage) : STR.lastBabak);
  return {
    kind: 'message',
    eyebrow: STR.phoneEyebrow(m.babak, m.stage),
    title: STR.fellTitle(p.step),
    subtitle: lines.join(' '),
    tone: 'bad',
    avatarOf: p.id,
    stats: [
      { label: STR.statSteps, value: String(p.step) },
      { label: STR.statBestStreak, value: String(p.stats.bestStreak) },
      { label: STR.statRank, value: `${babakRank(m, p)}/${m.contestants().length}` },
    ],
    reactions: true,
  };
}

export function viewFor(ctx: ViewContext): ControllerView {
  const { match: m, id } = ctx;
  const p = m.player(id);
  if (m.phase === 'setup') return setupView(m, id, ctx.hostId, ctx.hostName);
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
        title: STR.introTitle(m.babak, m.stage),
        subtitle: STAGE_INFO[m.stage].desc,
        color: p.color,
        opponents: m
          .contestants()
          .filter((o) => o.id !== id)
          .slice(0, 7)
          .map((o) => o.id),
      });
    case 'play':
      if (!p.inRound)
        return {
          kind: 'message',
          eyebrow: STR.babakOf(m.babak, m.babakCount),
          title: STR.waitTitle,
          subtitle: STR.waitSub,
          tone: 'neutral',
          avatarOf: id,
          reactions: true,
        };
      return p.fallen ? fellView(ctx, p) : padView(ctx, p);
    case 'end': {
      const pts = p.rounds[m.babak] ?? 0;
      const safe = p.inRound && !p.fallen;
      return {
        kind: 'message',
        eyebrow: STR.babakOf(m.babak, m.babakCount),
        title: STR.endTitle(pts),
        subtitle: safe ? STR.endSafe : STR.endSub,
        tone: safe ? 'good' : 'neutral',
        avatarOf: id,
        stats: [
          { label: STR.statPoints, value: String(p.total) },
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
        subtitle: STR.resultPhoneSub(p.stats.best),
        stats: [
          { label: STR.statBest, value: String(p.stats.best) },
          { label: STR.statFalls, value: String(p.stats.falls) },
        ],
      };
      return title ? { ...view, chips: [title] } : view;
    }
  }
}
