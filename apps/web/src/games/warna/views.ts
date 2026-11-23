/**
 * Phone screens of Petualangan Warna (pure). Picking: the Host chooses a world, then a stage of
 * it (locked stages greyed). Playing, the phone is held sideways (owner 2026-11-22, after
 * Roblox): the joystick on the left half and the whole right half as LOMPAT, with small pills
 * top right: TUKAR when one person steers two characters (TANDA in a group), ? for a hint
 * (pulsing when the group seems stuck), LEWATI for the Host after a long time, and ULANG.
 */
import type { ControllerView, MenuOption, PadButton } from '@hoorah/protocol';
import { BIOMES, biomeOf, LEVELS, type Slot } from './levels';
import { isOpen, type Progress, secondFruit, type WarnaMatch, worldStars } from './logic';
import { BIOME_TEXT, formatClock, levelName, SLOT_NAME, SLOT_SYMBOL, STR, stars } from './strings';

/** Colours on the phone: the same four as the stage. */
export const SLOT_HEX: Record<Slot, string> = { 0: '#F2453D', 1: '#2F7DF6', 2: '#22B35E', 3: '#FFC928' };

const JUMP: PadButton = {
  id: 'jump',
  label: STR.btnJump,
  icon: 'jump',
  tone: 'yellow',
  press: 'hold',
  big: true,
};
const PING: PadButton = {
  id: 'ping',
  label: STR.btnPing,
  icon: 'zap',
  tone: 'cream',
  press: 'tap',
  cooldownMs: 1500,
};
const RESTART: PadButton = {
  id: 'restart',
  label: STR.btnRestart,
  icon: 'restart',
  tone: 'cream',
  press: 'tap',
};
const SKIP: PadButton = {
  id: 'skip',
  label: STR.btnSkip,
  icon: 'skip',
  tone: 'orange',
  press: 'tap',
};

function hintButton(pulse: boolean): PadButton {
  return {
    id: 'hint',
    label: STR.btnHint,
    sub: STR.btnHintSub,
    icon: 'hint',
    tone: pulse ? 'yellow' : 'cream',
    press: 'tap',
    cooldownMs: 600,
    ...(pulse ? { pulse: true } : {}),
  };
}

export interface ViewContext {
  hostId: number | null;
  hostName: string;
  /** Best stars per stage id remembered on this screen. */
  progress: Progress;
}

function worldMenu(m: WarnaMatch, progress: Progress): Extract<ControllerView, { kind: 'menu' }> {
  const options: MenuOption[] = BIOMES.map((b) => {
    const st = worldStars(b.id, progress);
    return {
      id: `w:${b.id}`,
      label: BIOME_TEXT[b.id].name,
      sub: b.ready ? `${BIOME_TEXT[b.id].sub} · ${STR.worldStars(st.got, st.of)}` : STR.soon,
      thumb: `biome-${b.id}`,
      ...(b.ready ? {} : { disabled: true, badge: STR.soon }),
    };
  });
  return {
    kind: 'menu',
    eyebrow: STR.pickEyebrow,
    title: STR.pickTitle,
    hint: STR.pickHint(m.stages),
    options,
    selected: `w:${m.world}`,
    confirm: { id: 'next', label: STR.pickNext, style: 'yellow' },
  };
}

function levelMenu(m: WarnaMatch, progress: Progress): Extract<ControllerView, { kind: 'menu' }> {
  const options: MenuOption[] = biomeOf(m.world).levels.map((lv) => {
    const open = isOpen(lv, progress);
    const best = progress[lv.id];
    return {
      id: lv.id,
      label: STR.levelLabel(lv.number),
      sub: open ? `${levelName(lv.id)}${best !== undefined ? ` · ${stars(best)}` : ''}` : STR.levelLocked,
      thumb: `lvl-${lv.id}`,
      ...(open ? {} : { disabled: true, badge: STR.levelLocked }),
    };
  });
  return {
    kind: 'menu',
    eyebrow: STR.levelEyebrow(BIOME_TEXT[m.world].name),
    title: STR.levelTitle,
    hint: STR.levelHint,
    options,
    selected: LEVELS[m.pick]?.id,
    confirm: { id: 'start', label: STR.pickStart, style: 'yellow' },
    back: { id: 'back', label: STR.pickBack },
  };
}

function pickView(m: WarnaMatch, me: number, ctx: ViewContext): ControllerView {
  const view = m.pickStep === 'world' ? worldMenu(m, ctx.progress) : levelMenu(m, ctx.progress);
  if (me === ctx.hostId) return view;
  const { confirm: _c, back: _b, hint: _h, ...rest } = view;
  return { ...rest, locked: true, waiting: STR.pickWaiting(ctx.hostName) };
}

function otherColors(m: WarnaMatch, mine: Slot): string {
  const k = m.sim?.colors ?? 2;
  const out: string[] = [];
  for (let s = 0; s < k; s++) if (s !== mine) out.push(SLOT_NAME[s as Slot].toLowerCase());
  return out.join(', ');
}

function padView(m: WarnaMatch, me: number, ctx: ViewContext): ControllerView {
  const w = m.sim;
  const key = m.charOf(me);
  const c = w && key >= 0 ? w.chars[key] : undefined;
  if (!w || !c) return watchView();
  const slot = c.slot;
  const gems = w.gemTotals(slot);
  const door = w.exitCount(slot);
  const buttons: PadButton[] = [JUMP];
  let eyebrow = STR.phoneEyebrow;
  let hint = STR.hintSafe(SLOT_NAME[slot].toLowerCase(), otherColors(m, slot));
  if (m.solo) {
    const other = (slot === 0 ? 1 : 0) as Slot;
    buttons.push({
      id: 'swap',
      label: STR.btnSwap,
      sub: STR.btnSwapSub(SLOT_NAME[other]),
      icon: 'swap',
      tone: 'orange',
      press: 'tap',
    });
    eyebrow = STR.soloEyebrow;
    hint = STR.hintSolo(SLOT_NAME[other]);
  } else buttons.push(PING);
  buttons.push(hintButton(m.hintPulse()));
  if (me === ctx.hostId && m.canSkip()) buttons.push(SKIP);
  buttons.push(RESTART);
  const stats = [
    { label: STR.statGems, value: `${gems.taken}/${gems.total}` },
    { label: STR.statDoor, value: `${door.in}/${door.total}` },
    { label: STR.statTime, value: formatClock(m.playT) },
  ];
  let alert: Extract<ControllerView, { kind: 'pad' }>['alert'];
  if (m.voteLeft > 0) {
    alert = {
      title: `${STR.voteTitle} ${STR.voteCount(m.votes.size, m.voteNeed())}`,
      body: m.solo ? STR.voteSoloBody : m.votes.has(me) ? undefined : STR.voteBody,
      tone: 'yellow',
    };
  } else if (c.dead) alert = { title: STR.alertBack, tone: 'red' };
  else if (c.inExit) alert = { title: STR.alertDoor, body: STR.alertDoorBody, tone: 'yellow' };
  return {
    kind: 'pad',
    mode: 'stick',
    jumpZone: true,
    color: SLOT_HEX[slot],
    ...(c.sub === 1 ? { fruit: secondFruit(m.person(me)?.fruit) } : {}),
    title: `${SLOT_NAME[slot]} ${SLOT_SYMBOL[slot]}`,
    eyebrow,
    stats,
    buttons,
    hint,
    ...(alert ? { alert } : {}),
    ...(m.phase === 'play' ? {} : { locked: true }),
  };
}

function watchView(): ControllerView {
  return { kind: 'message', title: STR.watchTitle, subtitle: STR.watchSub, tone: 'neutral', reactions: true };
}

export function viewFor(m: WarnaMatch, me: number, ctx: ViewContext): ControllerView {
  switch (m.phase) {
    case 'select':
      return pickView(m, me, ctx);
    case 'intro': {
      if (!m.inCast(me)) return watchView();
      const slot = m.slotOf(me) ?? 0;
      return {
        kind: 'countdown',
        value: String(Math.max(1, Math.ceil(3.2 - m.phaseT))),
        title: STR.countTitle(levelName(m.level.id)),
        subtitle: m.solo ? STR.countSubSolo : STR.countSub(SLOT_NAME[slot], SLOT_SYMBOL[slot]),
        color: SLOT_HEX[slot],
      };
    }
    case 'play':
      return m.inCast(me) ? padView(m, me, ctx) : watchView();
    case 'clear': {
      const s = m.lastScore();
      return {
        kind: 'message',
        eyebrow: STR.stageOf(m.stage + 1, m.order.length).toUpperCase(),
        title: s?.skipped ? STR.skippedTitle : STR.clearPhoneTitle,
        subtitle: s ? STR.clearPhoneSub(stars(s.stars), formatClock(s.time)) : undefined,
        tone: 'good',
        avatarOf: me,
        reactions: true,
      };
    }
    default:
      return {
        kind: 'message',
        title: STR.phoneDone,
        subtitle: STR.phoneDoneSub(m.totalStars(), m.maxStars()),
        tone: 'good',
        avatarOf: me,
      };
  }
}

/** Phone result once the session is over. */
export function resultView(m: WarnaMatch, me: number, chips: string[]): ControllerView {
  const t = m.tallies.get(me);
  return {
    kind: 'result',
    tone: m.totalStars() >= m.maxStars() * 0.66 ? 'win' : 'good',
    title: STR.phoneDone,
    big: stars(Math.round((m.totalStars() / Math.max(1, m.maxStars())) * 3)),
    subtitle: STR.phoneDoneSub(m.totalStars(), m.maxStars()),
    stats: [
      { label: STR.statStars, value: `${m.totalStars()}/${m.maxStars()}` },
      { label: STR.statGems, value: String(t?.gems ?? 0) },
      { label: STR.statStage, value: String(m.scores.length) },
    ],
    ...(chips.length ? { chips } : {}),
  };
}
