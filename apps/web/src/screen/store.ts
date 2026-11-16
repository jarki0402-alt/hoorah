import {
  type ControllerToGame,
  type ControllerToPlatform,
  type ControllerView,
  HOST_COMMANDS,
  type HostCommand,
  NAV_KEYS,
  type PlatformPage,
  type PlatformToController,
  type PlayerInfo,
  PROTOCOL_VERSION,
  type Reaction,
  type RelayedInput,
  type RoomPass,
  type ServerMsg,
} from '@hoorah/protocol';
import type { GameResult } from '@hoorah/sdk';
import { batch, computed, effect, signal } from '@preact/signals';
import { audio, type Sfx, type Track } from '../shared/audio';
import { autoRounds } from '../shared/automode';
import { celebrate } from '../shared/confetti';
import { prefs, session } from '../shared/device';
import { GAMES, type GameId, type HomeTab, isHomeTab } from '../shared/games';
import { Net, type NetStatus } from '../shared/net';
import { GameBridge } from './bridge';
import { canFullscreen, enterFullscreen, toggleFullscreen } from './fullscreen';
import { focused, press } from './nav';
import { ScreenRtc } from './rtc';
import { STR } from './strings';

export type Page = 'join' | 'home' | 'detail' | 'game' | 'results';

export interface Toast {
  id: number;
  text: string;
  player?: PlayerInfo;
}

export interface ReactionBubble {
  id: number;
  player: PlayerInfo;
  r: Reaction;
}

export interface ActiveGame {
  id: GameId;
  run: number;
  ready: boolean;
  paused: boolean;
}

/* ------------------------------------------------------------------ state */

export const code = signal('');
export const players = signal<PlayerInfo[]>([]);
export const maxPlayers = signal(2);
/** Hoorah Pass opening this room's seats, from the server. */
export const roomPass = signal<RoomPass | null>(null);
export const netStatus = signal<NetStatus>('connecting');
export const rtt = signal(0);
export const page = signal<Page>('join');
export const selected = signal<GameId>('tarik');
export const activeGame = signal<ActiveGame | null>(null);
export const lastResult = signal<{ gameId: GameId; result: GameResult } | null>(null);
export const audioOn = signal(false);
export const muted = signal(prefs.get('muted', false));
export const musicOn = signal(prefs.get('music', true));
/** The join QR is on screen so more players can scan in (the Host's "Tambah pemain"). */
export const inviting = signal(false);
export const toasts = signal<Toast[]>([]);
export const reactions = signal<ReactionBubble[]>([]);
export const notice = signal<string | null>(null);
/** Tab of the home row; the Host's phone picker and the main screen always show the same one. */
export const homeTab = signal<HomeTab>('fit');
/** Recently played games, most recent first (remembered on this screen; listed first in the Host's picker). */
export const recent = signal<GameId[]>(
  prefs
    .get<string[]>('recent', [])
    .filter((id): id is GameId => id in GAMES)
    .slice(0, 4),
);

export const connected = computed(() => players.value.filter((p) => p.connected));
export const host = computed(() => players.value.find((p) => p.isHost) ?? null);

/* ------------------------------------------------------------------ net */

const bridge = new GameBridge();
const lastViews = new Map<number, ControllerView>();
let uid = 0;

const net = new Net(() => {
  const saved = session.get<{ code: string; token: string }>('screen');
  return saved
    ? { t: 'hello', role: 'screen', v: PROTOCOL_VERSION, resume: saved }
    : { t: 'hello', role: 'screen', v: PROTOCOL_VERSION };
});

// Relays to 'all' go out as one numbered copy per connected phone (see shared/linkseq.ts).
net.setRecipients(() => players.value.filter((p) => p.connected).map((p) => p.id));
// Direct links to the phones on the same Wi-Fi; the relay stays the fallback.
new ScreenRtc(net, (open) => reportDirect(open));
// Development builds only: lets latency tests listen to the input stream.
if (import.meta.env.DEV) (window as unknown as { __hoorahNet?: Net }).__hoorahNet = net;

net.on('status', (s) => {
  netStatus.value = s;
});

net.on('message', (m) => onServer(m));
net.on('input', (i: RelayedInput) => bridge.input(i));
net.on('fatal', (codeName) => {
  if (codeName === 'room_closed' || codeName === 'room_not_found') {
    // The old room is gone: quietly open a fresh one.
    session.remove('screen');
    window.setTimeout(() => net.start(), 600);
    return;
  }
  if (codeName === 'session_replaced') notice.value = 'Room ini dibuka di tab lain.';
  else if (codeName === 'rate_limited') notice.value = 'Terlalu banyak room dibuat. Coba lagi sebentar lagi.';
  else notice.value = 'Koneksi ke server gagal.';
});

export function startNet(): void {
  net.start();
  window.setInterval(() => {
    rtt.value = Math.round(net.rtt);
    if (bridge.active) bridge.clock(net.clock.offset);
  }, 2000);
}

function onServer(m: ServerMsg): void {
  switch (m.t) {
    case 'welcome':
      if (m.role !== 'screen') return;
      session.set('screen', { code: m.code, token: m.token });
      reportedStatus = '';
      batch(() => {
        code.value = m.code;
        maxPlayers.value = m.maxPlayers;
        roomPass.value = m.pass;
        players.value = m.players;
      });
      sendPage();
      return;
    case 'room':
      onRoom(m.maxPlayers, m.pass);
      return;
    case 'players':
      onPlayers(m.players);
      return;
    case 'relay':
      if (m.ch === 'p') onPlatform(m.from, m.data);
      else if (m.ch === 'g') onGameAction(m.from, m.data);
      return;
    default:
      return;
  }
}

/** A phone entered a Hoorah Pass, the owner changed it, or it ended. */
function onRoom(seats: number, pass: RoomPass | null): void {
  const was = roomPass.value;
  batch(() => {
    maxPlayers.value = seats;
    roomPass.value = pass;
  });
  if (pass && !was) {
    toast(STR.passOn(seats));
    sfx('join');
  } else if (!pass && was) {
    toast(STR.passOff);
  }
  sendPage();
}

function onPlayers(next: PlayerInfo[]): void {
  const prev = new Map(players.value.map((p) => [p.id, p]));
  players.value = next;
  for (const p of next) {
    const before = prev.get(p.id);
    if (!before) {
      toast(`${p.name} bergabung!`, p);
      sfx('join');
      sendPage(p.id);
    } else if (!before.connected && p.connected) {
      toast(`${p.name} kembali`, p);
      sendPage(p.id);
      const view = lastViews.get(p.id);
      if (view && activeGame.value) relayGame(p.id, { k: 'view', view });
    } else if (before.connected && !p.connected) {
      toast(`${p.name} terputus, menunggu…`, p);
    }
  }
  for (const [id, p] of prev) {
    if (!next.some((n) => n.id === id)) {
      toast(`${p.name} keluar`, p);
      sfx('leave');
    }
  }
  if (bridge.active) bridge.players(next);
}

function onPlatform(from: number, data: unknown): void {
  if (typeof data !== 'object' || data === null) return;
  const msg = data as ControllerToPlatform;
  const player = players.value.find((p) => p.id === from);
  if (!player) return;
  if (msg.k === 'nav' && player.isHost && NAV_KEYS.includes(msg.key)) {
    if (msg.key === 'home') goHomeFromPhone();
    else press(msg.key);
  } else if (msg.k === 'open' && player.isHost && typeof msg.game === 'string') {
    openFromPhone(msg.game);
  } else if (msg.k === 'tab' && player.isHost && isHomeTab(msg.tab)) {
    tabFromPhone(msg.tab);
  } else if (msg.k === 'host' && player.isHost && HOST_COMMANDS.includes(msg.cmd)) {
    hostCommand(msg.cmd);
  } else if (msg.k === 'react' && ['cheer', 'clap', 'boo', 'rematch'].includes(msg.r)) {
    react(player, msg.r);
  }
}

function onGameAction(from: number, data: unknown): void {
  if (!bridge.active || typeof data !== 'object' || data === null) return;
  const a = data as Partial<ControllerToGame>;
  if (a.k !== 'action' || typeof a.id !== 'string' || a.id.length > 32 || typeof a.at !== 'number') return;
  const action: ControllerToGame = { k: 'action', id: a.id, at: a.at };
  if (typeof a.value === 'string' && a.value.length <= 64) action.value = a.value;
  bridge.action(from, action);
}

/** "Beranda" on the Host's remote: straight back to the game list from any menu page. */
function goHomeFromPhone(): void {
  if (page.value === 'game' || page.value === 'home') return;
  sfx('back');
  goHome();
}

/** A game tapped in the Host's game picker: show its detail page (not while a game runs). */
function openFromPhone(id: string): void {
  if (page.value === 'game' || !(id in GAMES)) return;
  openDetail(id as GameId);
}

/** A tab tapped in the Host's picker: the home row shows the same games (home comes up if needed). */
function tabFromPhone(tab: HomeTab): void {
  if (page.value === 'game') return;
  setHomeTab(tab);
  if (page.value !== 'home') goHome();
}

export function setHomeTab(tab: HomeTab): void {
  if (homeTab.value === tab) return;
  homeTab.value = tab;
  sfx('tick');
  sendPage();
}

/** The Host's in-game menu on the phone (pill at the top) drives the main screen. */
function hostCommand(cmd: HostCommand): void {
  switch (cmd) {
    case 'pause':
      togglePause(true);
      return;
    case 'resume':
      togglePause(false);
      return;
    case 'restart':
      restartGame();
      return;
    case 'quit':
      quitGame();
      return;
    case 'invite-on':
    case 'invite-off':
      setInviting(cmd === 'invite-on');
      return;
    case 'music-on':
    case 'music-off':
      if (musicOn.value !== (cmd === 'music-on'))
        toast(cmd === 'music-on' ? 'Musik dinyalakan' : 'Musik dimatikan');
      setMusicOn(cmd === 'music-on');
      return;
    case 'sound-on':
    case 'sound-off':
      if (muted.value !== (cmd === 'sound-off'))
        toast(cmd === 'sound-on' ? 'Suara dinyalakan' : 'Suara dimatikan');
      setMuted(cmd === 'sound-off');
      return;
  }
}

export function setInviting(on: boolean): void {
  if (inviting.value === on) return;
  inviting.value = on;
  sfx(on ? 'select' : 'back');
  sendPage();
}

function relay(to: number | 'all', data: PlatformToController): void {
  net.send({ t: 'relay', ch: 'p', to, data });
}

function relayGame(to: number | 'all', data: unknown): void {
  net.send({ t: 'relay', ch: 'g', to, data });
}

function platformPage(): PlatformPage {
  return page.value === 'game' ? 'game' : page.value;
}

export function sendPage(to: number | 'all' = 'all'): void {
  const g = activeGame.value;
  // On the home row the focused card is the game "on the screen" (the picker marks it).
  const card = page.value === 'home' && focused.value.startsWith('card-') ? focused.value.slice(5) : null;
  const gameId =
    page.value === 'detail'
      ? selected.value
      : page.value === 'home'
        ? card && card in GAMES
          ? (card as GameId)
          : undefined
        : (g?.id ?? lastResult.value?.gameId);
  const data: PlatformToController = {
    k: 'page',
    page: platformPage(),
    paused: g?.paused ?? false,
    music: musicOn.value,
    sound: !muted.value,
    invite: inviting.value,
    seats: maxPlayers.value,
    recent: recent.value,
    tab: homeTab.value,
  };
  if (gameId) {
    data.gameId = gameId;
    data.gameTitle = GAMES[gameId].title;
  }
  relay(to, data);
  reportStatus(data.page, gameId ?? null);
}

/** Last page/game told to the server; cleared on every welcome so a new or resumed room hears it. */
let reportedStatus = '';
/** What the status carries now: page, game and phones on a direct link. */
let statusPage: PlatformPage | null = null;
let statusGame: string | null = null;
let directLinks = 0;

/** Tells the server what the main screen shows (admin dashboard), only when it changes. */
function reportStatus(p: PlatformPage, gameId: string | null): void {
  statusPage = p;
  statusGame = gameId;
  const key = `${p}:${gameId ?? ''}:${directLinks}`;
  if (key === reportedStatus) return;
  if (net.send({ t: 'status', page: p, gameId, direct: directLinks })) reportedStatus = key;
}

/** A direct link opened or closed: the dashboard shows how many phones skip the relay. */
function reportDirect(open: number): void {
  directLinks = open;
  if (statusPage) reportStatus(statusPage, statusGame);
}

/* ------------------------------------------------------------------ feedback */

export function sfx(name: Sfx): void {
  audio.sfx(name);
}

function syncMusic(): void {
  if (page.value === 'game') return;
  audio.music('menu');
}

// Sound settings survive a reload of the main screen.
audio.setMuted(muted.value);
audio.setMusicOn(musicOn.value);

audio.onReady(() => {
  audioOn.value = true;
});

/**
 * Try to play straight away (allowed when the browser trusts this site already), otherwise
 * sound starts on the first touch, click or remote key anywhere on the screen.
 */
export function initAudio(): void {
  syncMusic();
  audio.unlock();
}

export function unlockAudio(): void {
  audio.unlock();
}

/* ------------------------------------------------------------------ top bar buttons */

const TOUCH_FOR_FULLSCREEN = 'Klik layar ini sekali untuk layar penuh';
const TOUCH_FOR_SOUND = 'Klik layar ini sekali untuk menyalakan suara';

/**
 * Fullscreen from a click here or from the Host's remote. A remote press cannot enter it
 * (browsers need a gesture on this device), so the screen asks for one click and enters then.
 */
export function startFullscreen(): void {
  if (enterFullscreen()) toast(TOUCH_FOR_FULLSCREEN);
}

export function pressFullscreen(): void {
  if (toggleFullscreen()) toast(TOUCH_FOR_FULLSCREEN);
}

/** Mute toggle once sound runs; before that, try to start it (a remote press may not be allowed to). */
export function pressSound(): void {
  if (audioOn.value) {
    toggleMute();
    return;
  }
  unlockAudio();
  window.setTimeout(() => {
    if (!audioOn.value) toast(TOUCH_FOR_SOUND);
  }, 400);
}

/** Focus ids of the top bar buttons, in on-screen order (the fullscreen one only where supported). */
export const TOP_BAR_IDS: readonly string[] = canFullscreen ? ['sound', 'fullscreen'] : ['sound'];

/** Runs a top bar button picked with the remote/keyboard; false when `id` is not one. */
export function runTopBar(id: string): boolean {
  if (id === 'sound') pressSound();
  else if (id === 'fullscreen') pressFullscreen();
  else return false;
  return true;
}

export function toast(text: string, player?: PlayerInfo): void {
  const t: Toast = { id: ++uid, text, ...(player ? { player } : {}) };
  toasts.value = [...toasts.value.slice(-2), t];
  window.setTimeout(() => {
    toasts.value = toasts.value.filter((x) => x.id !== t.id);
  }, 3200);
}

function react(player: PlayerInfo, r: Reaction): void {
  const bubble: ReactionBubble = { id: ++uid, player, r };
  reactions.value = [...reactions.value.slice(-5), bubble];
  window.setTimeout(() => {
    reactions.value = reactions.value.filter((x) => x.id !== bubble.id);
  }, 2600);
  sfx(r === 'boo' ? 'boo' : r === 'clap' ? 'clap' : r === 'rematch' ? 'select' : 'cheer');
}

/* ------------------------------------------------------------------ navigation */

function go(next: Page): void {
  // Arrivals were already shown in the join list; don't replay them on the next screen.
  if (page.value === 'join') toasts.value = [];
  page.value = next;
  syncMusic();
  sendPage();
}

// Moving along the home row tells the Host's phone which game is on the screen.
let lastFocusSent = '';
effect(() => {
  const f = focused.value;
  if (page.peek() !== 'home' || f === lastFocusSent) return;
  lastFocusSent = f;
  sendPage();
});

export function goJoin(): void {
  go('join');
}

export function goHome(): void {
  go('home');
}

export function openDetail(id: GameId): void {
  if (!GAMES[id].available) {
    toast(`${GAMES[id].title} segera hadir!`);
    sfx('back');
    return;
  }
  selected.value = id;
  sfx('select');
  go('detail');
}

export function startGame(id: GameId = selected.value): void {
  const info = GAMES[id];
  if (connected.value.length < info.minPlayers) {
    toast(`${info.title} butuh minimal ${info.minPlayers} pemain`);
    sfx('wrong');
    return;
  }
  lastViews.clear();
  selected.value = id;
  recent.value = [id, ...recent.value.filter((r) => r !== id)].slice(0, 4);
  prefs.set('recent', recent.value);
  activeGame.value = { id, run: ++uid, ready: false, paused: false };
  audio.music(null);
  sfx('select');
  page.value = 'game';
  sendPage();
}

export function restartGame(): void {
  const id = activeGame.value?.id ?? lastResult.value?.gameId;
  if (id) startGame(id);
}

export function quitGame(): void {
  inviting.value = false;
  activeGame.value = null;
  lastViews.clear();
  sfx('back');
  go('home');
}

export function togglePause(force?: boolean): void {
  const g = activeGame.value;
  if (!g?.ready) return;
  const paused = force ?? !g.paused;
  if (paused === g.paused) return;
  if (!paused) inviting.value = false;
  activeGame.value = { ...g, paused };
  bridge.pause(paused);
  sfx(paused ? 'back' : 'select');
  sendPage();
}

export function toggleMute(): void {
  setMuted(!muted.value);
}

export function setMuted(on: boolean): void {
  muted.value = on;
  prefs.set('muted', on);
  audio.setMuted(on);
  bridge.mute(on);
  sendPage();
}

export function setMusicOn(on: boolean): void {
  musicOn.value = on;
  prefs.set('music', on);
  audio.setMusicOn(on);
  sendPage();
}

/* ------------------------------------------------------------------ game iframe */

export function attachGame(frame: HTMLIFrameElement, g: ActiveGame): void {
  // Length is automatic (no mode picker), fixed for this run by the players connected at its start.
  const rounds = autoRounds(g.id, connected.peek().length);
  bridge.attach(frame, g.id, {
    init: () => ({
      players: players.value,
      clockOffset: net.clock.offset,
      settings: { rounds },
      muted: muted.value,
    }),
    ready: () => {
      const cur = activeGame.value;
      if (cur && cur.run === g.run) activeGame.value = { ...cur, ready: true };
    },
    view: (to, view) => {
      if (to === 'all') for (const p of players.value) lastViews.set(p.id, view);
      else lastViews.set(to, view);
      relayGame(to, { k: 'view', view });
    },
    vibrate: (to, pattern) => relayGame(to, { k: 'vibrate', pattern }),
    end: (result) => {
      batch(() => {
        lastResult.value = { gameId: g.id, result };
        activeGame.value = null;
        page.value = 'results';
      });
      audio.music('menu');
      sfx('win');
      celebrate();
      sendPage();
    },
    sfx: (name) => audio.sfx(name as Sfx),
    music: (track) => audio.music((track as Track | null) ?? null),
    quit: () => quitGame(),
  });
}

export function detachGame(frame: HTMLIFrameElement): void {
  bridge.detach(frame);
}
