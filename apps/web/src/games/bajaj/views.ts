/** Phone controller views for Bajaj Rush: the pre-race menus, the drive view and after-race choices. */
import { type ControllerView, type DriveItemIcon, type MenuOption, PLAYER_COLORS } from '@hoorah/protocol';
import { type ItemKind, MODES, type Mode } from './logic';
import { CIRCUITS, type CircuitId } from './maps/types';
import { formatClock, formatTime, STR } from './strings';

export const MODE_COLORS: Record<Mode, string> = {
  gp: '#FF5A1F',
  duel: '#2F8CFF',
  arena: '#F2453D',
  time: '#22B35E',
};

export const MAP_COLORS: Record<CircuitId, string> = {
  kota: '#FFC928',
  pantai: '#2F8CFF',
  puncak: '#22B35E',
};

export const KART_COLORS: readonly string[] = PLAYER_COLORS;

const NEXT = { id: 'next', label: STR.menuNext, style: 'primary' as const };
const BACK = { id: 'back', label: STR.menuBack, style: 'secondary' as const };

export function modeMenu(isHost: boolean, mode: Mode, hostName: string): ControllerView {
  const options: MenuOption[] = MODES.map((m) => ({
    id: m,
    label: STR.modes[m].name,
    sub: STR.modes[m].sub,
    color: MODE_COLORS[m],
    thumb: `mode-${m}`,
  }));
  const base = {
    kind: 'menu' as const,
    eyebrow: STR.menuModeEyebrow(mode === 'arena' ? 2 : 3),
    title: STR.menuModeTitle,
    options,
    selected: mode,
  };
  return isHost
    ? { ...base, confirm: NEXT, hint: STR.menuHintMode }
    : { ...base, locked: true, waiting: STR.menuWaiting(hostName) };
}

export function mapMenu(isHost: boolean, circuit: CircuitId, hostName: string): ControllerView {
  const options: MenuOption[] = CIRCUITS.map((c) => ({
    id: c,
    label: STR.maps[c].name,
    sub: STR.maps[c].desc,
    color: MAP_COLORS[c],
    thumb: `map-${c}`,
  }));
  const base = {
    kind: 'menu' as const,
    eyebrow: STR.menuMapEyebrow,
    title: STR.menuMapTitle,
    options,
    selected: circuit,
  };
  return isHost
    ? { ...base, confirm: NEXT, back: BACK, hint: STR.menuHintMap }
    : { ...base, locked: true, waiting: STR.menuWaiting(hostName) };
}

export interface KartMenuState {
  me: number;
  isHost: boolean;
  picks: ReadonlyMap<number, string>;
  names: ReadonlyMap<number, string>;
  ready: boolean;
  readyCount: number;
  total: number;
  step: number;
  steps: number;
  autoS: number | null;
}

export function kartMenu(s: KartMenuState): ControllerView {
  const mine = s.picks.get(s.me);
  const options: MenuOption[] = KART_COLORS.map((c) => {
    let owner: number | undefined;
    for (const [id, col] of s.picks) if (col === c && id !== s.me) owner = id;
    const o: MenuOption = { id: c, label: STR.colorNames[c] ?? c, color: c };
    if (owner !== undefined) {
      o.disabled = true;
      o.badge = STR.takenBy(s.names.get(owner) ?? STR.unknownPlayer);
    }
    return o;
  });
  const view: ControllerView = {
    kind: 'menu',
    layout: 'swatch',
    eyebrow: STR.menuKartEyebrow(s.step, s.steps),
    title: STR.menuKartTitle,
    options,
    selected: mine,
    hint:
      s.autoS !== null
        ? `${STR.menuReadyCount(s.readyCount, s.total)} · ${STR.menuAutoReady(s.autoS)}`
        : STR.menuHintKart,
  };
  if (!s.ready) {
    view.confirm = { id: 'ready', label: STR.menuReady, style: 'primary' };
    if (s.isHost) view.back = BACK;
  } else {
    view.back = { id: 'unready', label: STR.menuUnready, style: 'secondary' };
    if (s.isHost) {
      view.confirm = { id: 'start', label: STR.menuStart, style: 'yellow' };
      view.hint = STR.menuHintHostStart;
    }
  }
  return view;
}

export function postMenu(isHost: boolean, hostName: string, autoS: number): ControllerView {
  if (!isHost) {
    return {
      kind: 'message',
      eyebrow: STR.postEyebrow,
      title: STR.phoneMenuWait,
      subtitle: STR.postWaiting(hostName),
      tone: 'neutral',
    };
  }
  return {
    kind: 'menu',
    eyebrow: STR.postEyebrow,
    title: STR.postTitle,
    options: [
      { id: 'again', label: STR.postAgain, sub: STR.postAgainSub, color: '#FF5A1F' },
      { id: 'change', label: STR.postChange, sub: STR.postChangeSub, color: '#2F8CFF' },
      { id: 'done', label: STR.postDone, sub: STR.postDoneSub, color: '#22B35E' },
    ],
    hint: STR.postAuto(autoS),
  };
}

export interface DriveState {
  mode: Mode;
  color: string;
  place: number;
  total: number;
  lap: number;
  laps: number;
  lives: number;
  out: boolean;
  clockMs: number;
  best: number | null;
  item: ItemKind | null;
  rolling: boolean;
  finishTime: number | null;
  hint: string;
  locked: boolean;
}

const ICONS: Record<ItemKind, DriveItemIcon> = {
  durian: 'durian',
  firecracker: 'firecracker',
  boost: 'boost',
  oil: 'oil',
  shield: 'shield',
  horn: 'horn',
};

export function driveView(s: DriveState): ControllerView {
  const finished = s.finishTime !== null;
  let place: string;
  let lap: string;
  if (s.mode === 'arena') {
    place = s.out ? STR.phoneOut : STR.phoneLives(s.lives);
    lap = STR.phoneClock(formatClock(s.clockMs));
  } else if (s.mode === 'time') {
    place = s.best !== null ? STR.phoneBest(formatTime(s.best)) : STR.phoneNoBest;
    lap = finished ? STR.phoneFinishedTime(formatTime(s.finishTime!)) : STR.phoneLap(s.lap, s.laps);
  } else {
    place = finished ? STR.phoneFinishedPlace(s.place, s.total) : STR.phonePlace(s.place, s.total);
    lap = finished ? STR.phoneFinishedTime(formatTime(s.finishTime!)) : STR.phoneLap(s.lap, s.laps);
  }
  return {
    kind: 'drive',
    color: s.color,
    place,
    lap,
    item: s.rolling
      ? { icon: 'box', name: STR.itemRolling }
      : s.item
        ? { icon: ICONS[s.item], name: STR.items[s.item] }
        : null,
    hint: s.hint,
    locked: s.locked,
  };
}

/** For players who joined after the start: they watch this race. */
export function spectatorView(): ControllerView {
  return {
    kind: 'message',
    eyebrow: 'Bajaj Rush',
    title: STR.spectator,
    subtitle: STR.phoneHintSpectator,
    tone: 'neutral',
  };
}
