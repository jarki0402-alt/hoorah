/**
 * Phone screens for every phase of Kampung Siluman (pure: derived from the match, so the driver
 * can recompute and resend them at any time, e.g. after a reconnect). Roles only ever travel in
 * the player's own card. At night every view is `silent` (no vibration, not even tap feedback)
 * and every phone not called is `dark`, so nothing in the room shows who is awake.
 */
import type { ControllerView, MenuOption } from '@hoorah/protocol';
import { EXTRAS, MIN_PLAYERS, PENGKHIANAT_MIN, type Seat, type SilumanMatch, sideOf, TALKS } from './logic';
import {
  EXTRAS_NAME,
  EXTRAS_SUB,
  ROLE_DUTY,
  ROLE_NAME,
  SIDE_NAME,
  STR,
  TALK_NAME,
  TALK_SUB,
} from './strings';

const SETUP_COLORS = ['#FF8A1F', '#FFC928', '#14B8C4', '#22B35E'] as const;

export interface ViewContext {
  hostId: number | null;
  name: (id: number) => string;
  color: (id: number) => string;
  /** Discussion: this player is looking at their card instead of the suspect list. */
  showsCard: (id: number) => boolean;
}

type Menu = Extract<ControllerView, { kind: 'menu' }>;

function setupView(m: SilumanMatch, me: number, ctx: ViewContext): ControllerView {
  const enough = m.present.length >= MIN_PLAYERS;
  let view: Menu;
  if (m.step === 'roles') {
    const allowed = m.pengkhianatAllowed();
    view = {
      kind: 'menu',
      eyebrow: STR.menuEyebrow(1, 2),
      title: STR.menuRolesTitle,
      hint: enough ? STR.menuRolesHint : STR.needPlayers(MIN_PLAYERS),
      options: EXTRAS.map((x, i) => {
        const locked = (x === 'pengkhianat' || x === 'keduanya') && !allowed;
        return {
          id: x,
          label: EXTRAS_NAME[x],
          sub: locked ? STR.pengkhianatLocked(PENGKHIANAT_MIN) : EXTRAS_SUB[x],
          color: SETUP_COLORS[i],
          thumb: `extra-${x}`,
          disabled: locked,
        };
      }),
      selected: m.settings.extras,
      confirm: { id: 'next', label: STR.menuNext, style: 'primary' },
    };
  } else {
    view = {
      kind: 'menu',
      eyebrow: STR.menuEyebrow(2, 2),
      title: STR.menuTalkTitle,
      hint: enough ? STR.menuTalkHint : STR.needPlayers(MIN_PLAYERS),
      options: TALKS.map((t, i) => ({
        id: t,
        label: TALK_NAME[t],
        sub: TALK_SUB[t],
        color: SETUP_COLORS[i],
        thumb: `talk-${t}`,
      })),
      selected: m.settings.talk,
      ...(enough ? { confirm: { id: 'start', label: STR.menuStart, style: 'yellow' as const } } : {}),
      back: { id: 'back', label: STR.menuBack, style: 'secondary' },
    };
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

/** Secret small print on the card: duty, then who the player knows about. */
function cardCaption(m: SilumanMatch, s: Seat, ctx: ViewContext): string {
  const parts: string[] = [ROLE_DUTY[s.role]];
  if (s.role === 'siluman') {
    const kawan = m.holders('siluman').filter((x) => x.id !== s.id);
    parts.push(kawan.length ? STR.kawan(kawan.map((k) => ctx.name(k.id))) : STR.noKawan);
  } else if (s.role === 'pengkhianat') {
    parts.push(STR.traitorKnows(m.holders('siluman').map((k) => ctx.name(k.id))));
  } else if (s.role === 'dukun' && m.sights.length > 0) {
    parts.push(STR.notes(m.sights.map((x) => STR.noteItem(ctx.name(x.target), ROLE_NAME[x.role]))));
  }
  return parts.join(' ');
}

function card(
  m: SilumanMatch,
  s: Seat,
  ctx: ViewContext,
  extra: Partial<Extract<ControllerView, { kind: 'peek' }>>,
): ControllerView {
  return {
    kind: 'peek',
    eyebrow: STR.cardEyebrow,
    title: STR.cardTitle,
    word: ROLE_NAME[s.role].toUpperCase(),
    caption: cardCaption(m, s, ctx),
    tag: STR.cardTag,
    hint: STR.cardHint,
    deal: 1,
    ...extra,
  };
}

function message(
  title: string,
  subtitle: string,
  extra: Partial<Extract<ControllerView, { kind: 'message' }>> = {},
) {
  return { kind: 'message', title, subtitle, tone: 'neutral', ...extra } as ControllerView;
}

/** Eyes closed: black, silent. */
function dark(s: Seat): ControllerView {
  return {
    kind: 'message',
    title: STR.phoneDarkTitle,
    subtitle: s.alive ? STR.phoneDarkSub : STR.phoneDarkGhost,
    tone: 'neutral',
    dark: true,
    silent: true,
  };
}

function playerOptions(ctx: ViewContext, ids: number[], me: number): MenuOption[] {
  return ids.map((id) => ({
    id: String(id),
    label: id === me ? `${ctx.name(id)} (${STR.you})` : ctx.name(id),
    color: ctx.color(id),
    avatarOf: id,
  }));
}

function nightView(m: SilumanMatch, s: Seat, ctx: ViewContext): ControllerView {
  const role = m.calling;
  if (!role || !s.alive || s.role !== role) return dark(s);
  const eyebrow = STR.phoneNightEyebrow(m.night, ROLE_NAME[s.role]);
  const alive = m.alive.map((x) => x.id);
  switch (role) {
    case 'siluman': {
      const targets = m.alive.filter((x) => x.role !== 'siluman').map((x) => x.id);
      const options = playerOptions(ctx, targets, s.id).map((o) => {
        const by = [...m.silumanPicks.entries()]
          .filter(([from, to]) => from !== s.id && String(to) === o.id)
          .map(([from]) => ctx.name(from));
        return by.length ? { ...o, badge: STR.silumanBadge(by) } : o;
      });
      const mine = m.silumanPicks.get(s.id);
      return {
        kind: 'menu',
        eyebrow,
        title: STR.silumanTitle,
        hint: STR.silumanHint,
        options,
        ...(mine !== undefined ? { selected: String(mine) } : {}),
        silent: true,
      };
    }
    case 'dukun': {
      const sight = m.dukunPick !== null ? m.sights[m.sights.length - 1] : undefined;
      if (sight && sight.night === m.night) {
        const isSiluman = sight.role === 'siluman';
        return {
          kind: 'message',
          eyebrow,
          title: STR.dukunSaw(ctx.name(sight.target), ROLE_NAME[sight.role]),
          subtitle: isSiluman ? STR.dukunSawSiluman : STR.dukunSawOther,
          tone: isSiluman ? 'bad' : 'good',
          avatarOf: sight.target,
          silent: true,
        };
      }
      return {
        kind: 'menu',
        eyebrow,
        title: STR.dukunTitle,
        hint: STR.dukunHint,
        options: playerOptions(
          ctx,
          alive.filter((id) => id !== s.id),
          s.id,
        ),
        silent: true,
      };
    }
    case 'tabib':
      return {
        kind: 'menu',
        eyebrow,
        title: STR.tabibTitle,
        hint: STR.tabibHint,
        options: playerOptions(ctx, alive, s.id).map((o) =>
          o.id === String(m.lastProtected) ? { ...o, disabled: true, sub: STR.tabibLast } : o,
        ),
        ...(m.tabibPick !== null ? { selected: String(m.tabibPick) } : {}),
        silent: true,
      };
  }
}

function discussView(m: SilumanMatch, s: Seat, ctx: ViewContext): ControllerView {
  if (!s.alive) return message(STR.ghostTitle, STR.ghostSub, { reactions: true });
  if (ctx.showsCard(s.id)) {
    return card(m, s, ctx, {
      eyebrow: STR.dayChip(m.night),
      action: { id: 'suspect', label: STR.suspectBtn, style: 'yellow' },
    });
  }
  const marks = new Map(m.suspicions().map((x) => [x.id, x.by.length]));
  const options = playerOptions(
    ctx,
    m.alive.filter((x) => x.id !== s.id).map((x) => x.id),
    s.id,
  ).map((o) => {
    const n = marks.get(Number(o.id)) ?? 0;
    return n > 0 ? { ...o, badge: STR.suspectCount(n) } : o;
  });
  return {
    kind: 'menu',
    eyebrow: `${STR.dayChip(m.night)} · ${STR.discussTitle}`,
    title: STR.suspectTitle,
    hint: STR.suspectHint,
    options,
    ...(s.suspect !== null ? { selected: String(s.suspect) } : {}),
    confirm: s.ready
      ? { id: 'unready', label: STR.unreadyBtn, style: 'secondary' }
      : { id: 'ready', label: STR.readyBtn, style: 'yellow' },
    back: { id: 'card', label: STR.myCard, style: 'secondary' },
  };
}

function voteView(m: SilumanMatch, s: Seat, ctx: ViewContext): ControllerView {
  if (s.locked) return message(STR.voteSentTitle, STR.voteSentSub, { tone: 'good', reactions: !s.alive });
  const targets = m.alive.filter((x) => x.id !== s.id).map((x) => x.id);
  const options = playerOptions(ctx, targets, s.id);
  if (s.alive) options.push({ id: '0', label: STR.voteSkip, color: '#5B5E66' });
  const picked = s.vote !== null;
  return {
    kind: 'menu',
    eyebrow: STR.dayChip(m.night),
    title: s.alive ? STR.votePhoneTitle : STR.guessPhoneTitle,
    hint: s.alive ? STR.votePhoneHint : STR.guessPhoneHint,
    options,
    ...(picked ? { selected: String(s.vote) } : {}),
    ...(picked
      ? { confirm: { id: 'lock', label: s.alive ? STR.voteSend : STR.guessSend, style: 'yellow' as const } }
      : {}),
  };
}

export function viewFor(m: SilumanMatch, me: number, ctx: ViewContext): ControllerView | null {
  const s = m.seat(me);
  if (!s?.present) return null;
  if (m.phase === 'setup') return setupView(m, me, ctx);
  if (!s.inGame)
    return message(STR.watchTitle, STR.watchSub, { reactions: m.phase !== 'dusk' && m.phase !== 'night' });

  switch (m.phase) {
    case 'intro':
      return message(STR.introPhoneTitle, STR.introPhoneSub, {
        ...(me === ctx.hostId
          ? { actions: [{ id: 'skip', label: STR.introSkip, style: 'secondary' as const }] }
          : {}),
      });
    case 'deal':
      return card(
        m,
        s,
        ctx,
        s.ready
          ? { hint: STR.cardWaiting }
          : { action: { id: 'ready', label: STR.cardSeen, style: 'yellow' } },
      );
    case 'dusk':
      return dark(s);
    case 'night':
      return nightView(m, s, ctx);
    case 'dawn': {
      const v = m.dawnVictim;
      if (v === me) return message(STR.phoneDawnYou, STR.phoneDawnYouSub, { tone: 'bad' });
      if (v === null) return message(STR.dawnNone, STR.dawnNoneSub, { tone: 'good' });
      return message(
        STR.dawnTaken(ctx.name(v)),
        STR.dawnRole(ctx.name(v), ROLE_NAME[m.seat(v)?.role ?? 'warga']),
        {
          avatarOf: v,
        },
      );
    }
    case 'hunt': {
      const hunter = m.hunter;
      if (hunter === me && m.huntShot === null) {
        return {
          kind: 'menu',
          eyebrow: ROLE_NAME.pemburu,
          title: STR.huntPhoneTitle,
          hint: STR.huntPhoneHint,
          options: playerOptions(
            ctx,
            m.alive.map((x) => x.id),
            me,
          ),
        };
      }
      if (m.huntShot === me) return message(STR.phoneOutYou, STR.phoneOutYouSub, { tone: 'bad' });
      if (m.huntShot !== null) {
        const shot = m.huntShot;
        return message(STR.huntShot(ctx.name(shot), ROLE_NAME[m.seat(shot)?.role ?? 'warga']), '', {
          avatarOf: shot,
        });
      }
      return message(STR.huntPhoneWait(hunter !== null ? ctx.name(hunter) : ''), STR.huntPhoneHint, {
        ...(hunter !== null ? { avatarOf: hunter } : {}),
      });
    }
    case 'discuss':
      return discussView(m, s, ctx);
    case 'defense': {
      const d = m.defender;
      if (d === me) {
        return message(STR.defensePhoneYou, STR.defensePhoneYouSub, {
          tone: 'warn',
          actions: [{ id: 'done', label: STR.defenseDone, style: 'secondary' }],
        });
      }
      return message(STR.defensePhoneOther(d !== null ? ctx.name(d) : ''), STR.defensePhoneOtherSub, {
        ...(d !== null ? { avatarOf: d } : {}),
        reactions: !s.alive,
      });
    }
    case 'vote':
      return voteView(m, s, ctx);
    case 'tally':
      return message(STR.tallyPhone, STR.voteSub);
    case 'reveal': {
      const out = m.tally?.out ?? null;
      if (out === me) return message(STR.phoneOutYou, STR.phoneOutYouSub, { tone: 'bad' });
      if (out === null) return message(m.tally?.tie ? STR.revealTie : STR.revealNone, '');
      return message(STR.revealOut(ctx.name(out)), STR.revealRole(ROLE_NAME[m.seat(out)?.role ?? 'warga']), {
        avatarOf: out,
      });
    }
    case 'final':
    case 'ended': {
      const side = m.winner ?? 'warga';
      const won = sideOf(s.role) === side;
      return {
        kind: 'result',
        tone: won ? 'win' : 'neutral',
        title: STR.phoneFinal(won, SIDE_NAME[side]),
        big: String(s.score),
        subtitle: `${STR.phoneFinalSub(ROLE_NAME[s.role])} · ${STR.points(s.score)}`,
      };
    }
    default:
      return null;
  }
}
