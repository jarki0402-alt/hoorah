/**
 * Bom Oper phone views (pure, testable): the Host's arena picker (others watch it locked), the
 * landscape pad (joystick + one big OPER button that lights up "Dekat!" when someone is in reach),
 * BUM and round cards, the waiting view with cheer buttons once out of lives, and the result.
 */
import type { ControllerView, GuestPlayer, MenuOption, PadButton } from '@hoorah/protocol';
import { ARENAS, type ArenaId } from './arena';
import { type BomMatch, RULES, type Runner } from './logic';
import { directionWord, STR } from './strings';

const ARENA_COLOR: Record<ArenaId, string> = { halaman: '#22B35E', pasar: '#FF8A3D', atap: '#2F8CFF' };

export interface PickContext {
  arena: ArenaId;
  isHost: boolean;
  hostName: string;
}

export function pickView(ctx: PickContext): ControllerView {
  const options: MenuOption[] = ARENAS.map((id) => ({
    id,
    label: STR.arenas[id].name,
    sub: STR.arenas[id].sub,
    color: ARENA_COLOR[id],
    thumb: id,
  }));
  const view: ControllerView = {
    kind: 'menu',
    eyebrow: STR.pickEyebrow,
    title: STR.pickTitle,
    hint: STR.pickHint,
    options,
    selected: ctx.arena,
    confirm: { id: 'start', label: STR.pickStart, style: 'yellow' },
  };
  if (ctx.isHost) return view;
  const { confirm: _c, hint: _h, ...rest } = view;
  return { ...rest, locked: true, waiting: STR.pickWaiting(ctx.hostName) };
}

export interface ViewContext {
  match: BomMatch;
  id: number;
  guests: GuestPlayer[];
  titles: ReadonlyMap<number, string>;
}

const hearts = (n: number) => `${'♥'.repeat(Math.max(0, n))}${'♡'.repeat(Math.max(0, RULES.lives - n))}`;

function holders(m: BomMatch): Runner[] {
  return m.bombs
    .filter((b) => !b.exploded)
    .map((b) => m.runner(b.holder))
    .filter((r): r is Runner => !!r);
}

/** "Budi 2 langkah di kanan" towards the runner OPER would reach, or the nearest catchable one. */
function chaseHint(m: BomMatch, r: Runner): string {
  const me = m.sim.body(r.id);
  if (!me) return STR.chaseHint;
  let best: { name: string; d: number; dx: number; dz: number } | null = null;
  let immune: Runner | null = null;
  for (const o of m.alive()) {
    if (o.id === r.id) continue;
    const b = m.sim.body(o.id);
    if (!b) continue;
    if (!m.canReceive(o)) {
      if (m.immuneLeft(o) > 0 && !immune) immune = o;
      continue;
    }
    const dx = b.pos.x - me.pos.x;
    const dz = b.pos.z - me.pos.z;
    const d = Math.hypot(dx, dz);
    if (!best || d < best.d) best = { name: o.name, d, dx, dz };
  }
  const parts: string[] = [];
  if (best)
    parts.push(
      STR.nearestHint(best.name, Math.max(1, Math.round(best.d / 0.9)), directionWord(best.dx, best.dz)),
    );
  else parts.push(STR.chaseHint);
  if (immune) parts.push(STR.immuneHint(immune.name, m.immuneLeft(immune)));
  return parts.join(' · ');
}

/** Where the closest bomb holder is coming from. */
function fleeHint(m: BomMatch, r: Runner): { hint: string; close: boolean } {
  const me = m.sim.body(r.id);
  let best: { name: string; d: number; dx: number; dz: number } | null = null;
  for (const h of holders(m)) {
    const b = m.sim.body(h.id);
    if (!b || !me) continue;
    const dx = b.pos.x - me.pos.x;
    const dz = b.pos.z - me.pos.z;
    const d = Math.hypot(dx, dz);
    if (!best || d < best.d) best = { name: h.name, d, dx, dz };
  }
  if (!best) return { hint: STR.bannerSub, close: false };
  if (best.d < 7)
    return { hint: STR.closingHint(best.name, directionWord(best.dx, best.dz)), close: best.d < 3.5 };
  return { hint: STR.farHint(best.name), close: false };
}

export function padView(m: BomMatch, r: Runner): ControllerView {
  const holding = !!m.bombOf(r.id);
  const reach = holding && m.phase === 'play' && !!m.passTarget(r.id);
  const button: PadButton = {
    id: 'pass',
    label: STR.pass,
    sub: holding ? (reach ? STR.passNear : STR.passFar) : STR.passIdle,
    icon: 'throw',
    tone: holding ? (reach ? 'orange' : 'yellow') : 'cream',
    press: 'tap',
    big: true,
  };
  const names = holders(m)
    .filter((h) => h.id !== r.id)
    .map((h) => h.name);
  const view: ControllerView = {
    kind: 'pad',
    mode: 'stick',
    color: r.color,
    eyebrow: STR.roundOf(m.roundNo, m.rounds),
    title: holding ? STR.holdTitle : STR.runTitle(names),
    stats: [
      { label: STR.statLives, value: hearts(r.lives) },
      { label: STR.statRound, value: `${m.roundNo + 1}/${m.rounds}` },
    ],
    buttons: [button],
  };
  if (holding) {
    view.hint = chaseHint(m, r);
    if (reach) view.alert = { title: STR.nearAlert, tone: 'yellow' };
  } else {
    const f = fleeHint(m, r);
    view.hint = f.hint;
    if (f.close) view.alert = { title: STR.dangerAlert, tone: 'red' };
  }
  return view;
}

export function viewFor(ctx: ViewContext): ControllerView {
  const { match: m, id } = ctx;
  const r = m.runner(id);
  if (!r) {
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
  const lives = [{ label: STR.statLives, value: hearts(r.lives) }];
  if (m.phase === 'done') {
    const rank = m.standings().indexOf(r) + 1;
    const title = ctx.titles.get(id);
    const view: ControllerView = {
      kind: 'result',
      tone: rank === 1 ? 'win' : rank <= 3 ? 'good' : 'neutral',
      title: STR.resultPhoneTitle(rank),
      big: STR.resultPhoneBig(r.lives),
      subtitle: STR.resultPhoneSub(r.stats.passes),
      stats: [
        { label: STR.statPasses, value: String(r.stats.passes) },
        { label: STR.statNear, value: String(r.stats.nearMisses) },
      ],
    };
    return title ? { ...view, chips: [title] } : view;
  }
  if (r.out) {
    return withGuests({
      kind: 'message',
      eyebrow: STR.roundOf(m.roundNo, m.rounds),
      title: STR.outTitle,
      subtitle: STR.outSub,
      tone: 'bad',
      avatarOf: id,
      stats: lives,
      reactions: true,
    });
  }
  switch (m.phase) {
    case 'intro':
      return withGuests({
        kind: 'countdown',
        value: String(m.roundNo + 1),
        title: STR.introPhoneTitle(m.roundNo),
        subtitle: STR.introPhoneSub(m.finalRound && m.alive().length >= 3),
        color: r.color,
        opponents: m
          .alive()
          .filter((o) => o.id !== id)
          .map((o) => o.id),
      });
    case 'drop': {
      const mine = !!m.bombOf(id);
      return withGuests({
        kind: 'message',
        eyebrow: STR.roundOf(m.roundNo, m.rounds),
        title: mine ? STR.dropYou : STR.dropOther,
        subtitle: mine ? STR.dropYouSub : STR.dropOtherSub(holders(m).map((h) => h.name)),
        tone: mine ? 'warn' : 'neutral',
        avatarOf: id,
        stats: lives,
      });
    }
    case 'play':
      return withGuests(padView(m, r));
    case 'boom': {
      const me = m.lastBoom[m.lastBoom.length - 1] === id;
      if (!me && m.bombs.some((b) => !b.exploded)) return withGuests(padView(m, r));
      const victim = m.runner(m.lastBoom[m.lastBoom.length - 1] ?? 0);
      return withGuests({
        kind: 'message',
        eyebrow: STR.roundOf(m.roundNo, m.rounds),
        title: me ? STR.boomYou : STR.boomOther,
        subtitle: me ? STR.boomYouSub : STR.boomOtherSub(victim?.name ?? ''),
        tone: me ? 'bad' : 'good',
        avatarOf: id,
        stats: lives,
      });
    }
    case 'score':
      return withGuests({
        kind: 'message',
        eyebrow: STR.roundOf(m.roundNo, m.rounds),
        title: STR.scorePhone(m.roundNo),
        subtitle: STR.scorePhoneSub(r.lives),
        tone: 'neutral',
        avatarOf: id,
        stats: lives,
        reactions: true,
      });
  }
}
