/**
 * Phone screens of Hantu Tak Terlihat (pure). The role is dealt on a hold-to-peek card. While
 * hunting, residents get the joystick (it also aims the flashlight), LARI (held, uses stamina),
 * SENTER (on/off) and the heartbeat meter; the ghost gets the joystick, its two powers with their
 * rests, and the secret map that only its phone shows; caught residents fly as fireflies.
 */
import type { ControllerView, MenuOption, PadButton, PadRadar } from '@hoorah/protocol';
import type { HauntMatch } from './logic';
import { COLS, MAP_IDS, ROWS, Tile, tileAt } from './maps';
import { FRIGHT_DESC, FRIGHT_NAME, formatClock, MAP_DESC, MAP_NAME, STR } from './strings';
import { type HauntWorld, type Resident, TUNE } from './world';

const GHOST_COLOR = '#A6F4E6';
const RESIDENT_COLOR = '#FFD27A';
const FLY_COLOR = '#FFE7A8';

export interface ViewContext {
  hostId: number | null;
  hostName: string;
  name: (id: number) => string;
  color: (id: number) => string;
}

function setupView(m: HauntMatch, me: number, ctx: ViewContext): ControllerView {
  let view: Extract<ControllerView, { kind: 'menu' }>;
  if (m.step === 'map') {
    const options: MenuOption[] = MAP_IDS.map((id) => ({
      id,
      label: MAP_NAME[id],
      sub: MAP_DESC[id],
      thumb: `map-${id}`,
    }));
    view = {
      kind: 'menu',
      eyebrow: STR.menuEyebrow(1, 2),
      title: STR.menuMapTitle,
      hint: STR.menuMapHint,
      options,
      selected: m.map,
      confirm: { id: 'next', label: STR.menuNext, style: 'primary' },
    };
  } else {
    view = {
      kind: 'menu',
      eyebrow: STR.menuEyebrow(2, 2),
      title: STR.menuFrightTitle,
      hint: STR.menuFrightHint,
      options: (['ringan', 'beneran'] as const).map((id) => ({
        id,
        label: FRIGHT_NAME[id],
        sub: FRIGHT_DESC[id],
        thumb: `seram-${id}`,
      })),
      selected: m.fright,
      confirm: { id: 'start', label: STR.menuStart, style: 'yellow' },
      back: { id: 'back', label: STR.menuBack, style: 'secondary' },
    };
  }
  if (me === ctx.hostId) return view;
  const { confirm: _c, back: _b, hint: _h, ...rest } = view;
  return { ...rest, locked: true, waiting: STR.menuWaiting(ctx.hostName) };
}

function revealView(m: HauntMatch, me: number): ControllerView {
  const role = m.roleOf(me);
  const ghost = role === 'ghost';
  return {
    kind: 'peek',
    eyebrow: STR.revealEyebrow(m.round + 1, m.rounds),
    title: STR.revealTitle,
    word: ghost ? STR.revealGhost : STR.revealResident,
    caption: ghost ? STR.revealGhostCaption : STR.revealResidentCaption,
    blank: STR.revealBlank,
    hint: STR.revealHint,
    deal: m.round + 1,
  };
}

/** The map as the ghost's phone draws it (doors and exit in their current state). */
export function radarGrid(w: HauntWorld): string[] {
  const rows: string[] = [];
  for (let y = 0; y < ROWS; y++) {
    let row = '';
    for (let x = 0; x < COLS; x++) {
      const t = tileAt(w.map, x, y);
      row +=
        t === Tile.Wall
          ? '#'
          : t === Tile.Prop
            ? 'o'
            : t === Tile.Tree
              ? 'T'
              : t === Tile.Fuse
                ? 'F'
                : t === Tile.Door
                  ? w.isShut(x, y)
                    ? 'D'
                    : 'd'
                  : t === Tile.Exit
                    ? w.exitOpen
                      ? 'x'
                      : 'X'
                    : '.';
    }
    rows.push(row);
  }
  return rows;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function radarFor(w: HauntWorld, ctx: ViewContext): PadRadar {
  const g = w.ghost;
  const marks: PadRadar['marks'] = [];
  for (const k of w.keys) if (!k.taken) marks.push({ x: k.x + 0.5, y: k.y + 0.5, k: 'key' });
  marks.push({
    x: w.map.fuse.x + 0.5,
    y: w.map.fuse.y + 0.5,
    k: 'fuse',
    p: r1(w.fuse),
    ...(w.fuseOn ? { on: true } : {}),
  });
  const ex = w.map.exits;
  if (ex.length) {
    const cx = ex.reduce((s, e) => s + e.x + 0.5, 0) / ex.length;
    const cy = ex.reduce((s, e) => s + e.y + 0.5, 0) / ex.length;
    marks.push({ x: cx, y: cy, k: 'exit', ...(w.exitOpen ? { on: true } : {}) });
  }
  return {
    grid: radarGrid(w),
    me: { x: r1(g.x), y: r1(g.y) },
    people: w.residents
      .filter((r) => r.state !== 'out')
      .map((r) => ({
        x: r1(r.x),
        y: r1(r.y),
        c: ctx.color(r.id),
        ...(r.state === 'fly' ? { f: true } : {}),
      })),
    marks,
    ...(g.litBy.length ? { lit: true } : {}),
  };
}

function ghostView(m: HauntMatch, w: HauntWorld, ctx: ViewContext): ControllerView {
  const g = w.ghost;
  const buttons: PadButton[] = [
    {
      id: 'lights',
      label: STR.btnLights,
      sub: STR.btnLightsSub,
      icon: 'dark',
      tone: 'yellow',
      press: 'tap',
      big: true,
      cooldownMs: TUNE.lightsCd * 1000,
    },
    {
      id: 'door',
      label: STR.btnDoor,
      sub: STR.btnDoorSub,
      icon: 'door',
      tone: 'orange',
      press: 'tap',
      cooldownMs: TUNE.doorCd * 1000,
    },
  ];
  let alert: Extract<ControllerView, { kind: 'pad' }>['alert'];
  if (g.silau > 0) alert = { title: STR.alertSilau, tone: 'red' };
  else if (g.litBy.length)
    alert = { title: STR.alertLit(ctx.name(g.litBy[0]!)), body: STR.alertLitBody, tone: 'red' };
  return {
    kind: 'pad',
    mode: 'stick',
    color: GHOST_COLOR,
    eyebrow: STR.phoneGhost,
    title: STR.phoneCatches(g.catches, w.residents.length),
    stats: [{ label: STR.statTime, value: formatClock(w.timeLeft) }],
    buttons,
    hint: STR.hintGhost,
    radar: radarFor(w, ctx),
    ...(alert ? { alert } : {}),
    ...(m.phase === 'hunt' ? {} : { locked: true }),
  };
}

function quant(n: number, step: number): number {
  return Math.round(n / step) * step;
}

function residentView(m: HauntMatch, w: HauntWorld, r: Resident): ControllerView {
  if (r.state === 'out')
    return {
      kind: 'message',
      title: STR.escapedTitle,
      subtitle: STR.escapedSub,
      tone: 'good',
      avatarOf: r.id,
      reactions: true,
    };
  const fuse = w.fuseOn ? STR.hudFuseOn : w.fuse > 0 ? STR.hudFusePct(quant(w.fuse, 0.1)) : STR.hudFuseOff;
  if (r.state === 'fly') {
    return {
      kind: 'pad',
      mode: 'stick',
      color: FLY_COLOR,
      eyebrow: STR.phoneFly,
      title: STR.phoneFlyTitle,
      stats: [
        { label: STR.statKeys, value: `${w.keysFound}/${w.keys.length}` },
        { label: STR.statFuse, value: fuse },
        { label: STR.statTime, value: formatClock(w.timeLeft) },
      ],
      hint: STR.phoneFlyHint,
      ...(m.phase === 'hunt' ? {} : { locked: true }),
    };
  }
  const torch = quant(r.battery, 0.1);
  const buttons: PadButton[] = [
    {
      id: 'run',
      label: STR.btnRun,
      sub: STR.btnRunSub(quant(r.stamina, 0.1)),
      icon: 'run',
      tone: 'yellow',
      press: 'hold',
      big: true,
    },
    {
      id: 'torch',
      label: STR.btnTorch,
      sub: r.light ? STR.btnTorchOn : STR.btnTorchOff,
      icon: 'light',
      tone: r.light ? 'cream' : 'orange',
      press: 'tap',
    },
  ];
  const heart = quant(r.heart, 0.1);
  let alert: Extract<ControllerView, { kind: 'pad' }>['alert'];
  if (heart >= 0.8) alert = { title: STR.alertNear, body: STR.alertNearBody, tone: 'red' };
  else if (w.exitOpen) alert = { title: STR.alertExit, body: STR.alertExitBody, tone: 'yellow' };
  else if (r.battery <= 0.02 && !r.light)
    alert = { title: STR.alertBattery, body: STR.alertBatteryBody, tone: 'yellow' };
  return {
    kind: 'pad',
    mode: 'stick',
    color: RESIDENT_COLOR,
    eyebrow: STR.phoneResident,
    title: STR.phoneKeys(w.keysFound, w.keys.length),
    stats: [
      { label: STR.statFuse, value: fuse },
      { label: STR.statTorch, value: `${Math.round(torch * 100)}%` },
      { label: STR.statTime, value: formatClock(w.timeLeft) },
    ],
    buttons,
    heart,
    ...(alert ? { alert } : {}),
    ...(m.phase === 'hunt' ? {} : { locked: true }),
  };
}

function watchView(): ControllerView {
  return { kind: 'message', title: STR.watchTitle, subtitle: STR.watchSub, tone: 'neutral', reactions: true };
}

function endView(m: HauntMatch, me: number): ControllerView {
  const res = m.lastResult();
  const role = res?.ghostId === me ? 'hantu' : 'penghuni';
  const won = res?.winner === role;
  const pts = res?.points.get(me);
  return {
    kind: 'message',
    eyebrow: STR.revealEyebrow(m.round + 1, m.rounds),
    title: res ? (won ? STR.endPhoneWin : STR.endPhoneLose) : STR.watchTitle,
    subtitle: pts !== undefined ? STR.endPhonePoints(pts) : undefined,
    tone: won ? 'good' : 'bad',
    avatarOf: me,
    reactions: true,
  };
}

export function viewFor(m: HauntMatch, me: number, ctx: ViewContext): ControllerView {
  switch (m.phase) {
    case 'setup':
      return setupView(m, me, ctx);
    case 'reveal':
      return m.roleOf(me) ? revealView(m, me) : watchView();
    case 'hunt': {
      const w = m.world;
      if (!w) return watchView();
      if (w.ghost.id === me) return ghostView(m, w, ctx);
      const r = w.resident(me);
      return r ? residentView(m, w, r) : watchView();
    }
    case 'end':
      return m.roleOf(me) ? endView(m, me) : watchView();
    default:
      return watchView();
  }
}

export function resultView(m: HauntMatch, me: number, rank: number, chips: string[]): ControllerView {
  const t = m.tallies.get(me);
  return {
    kind: 'result',
    tone: rank === 1 ? 'win' : rank <= 3 ? 'good' : 'neutral',
    title: rank === 1 ? STR.resultWin : STR.resultPlace(rank),
    subtitle: STR.resultSub(t?.points ?? 0),
    stats: [
      { label: STR.statPoints, value: String(t?.points ?? 0) },
      { label: STR.statEscapes, value: String(t?.escapes ?? 0) },
      { label: STR.statCatches, value: String(t?.catches ?? 0) },
    ],
    ...(chips.length ? { chips } : {}),
  };
}
