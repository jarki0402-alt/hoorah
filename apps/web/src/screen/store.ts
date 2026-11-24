import {
  type AppConfig,
  type ControllerToGame,
  type ControllerToPlatform,
  type ControllerView,
  DEFAULT_CONFIG,
  type ErrorCode,
  FREE_ACCESS,
  HOST_COMMANDS,
  type HostCommand,
  isPremium,
  isScreenId,
  LIMITS,
  NAV_KEYS,
  type PlatformPage,
  type PlatformToController,
  type PlayerInfo,
  PROTOCOL_VERSION,
  type Reaction,
  type RelayedInput,
  type RoomAccess,
  type RoomPass,
  type ServerMsg,
  type TrialReject,
} from '@hoorah/protocol';
import type { GameResult, MusicIntensity } from '@hoorah/sdk';
import { batch, computed, effect, signal } from '@preact/signals';
import { audio, type Sfx, type Track } from '../shared/audio';
import { autoRounds } from '../shared/automode';
import { celebrate } from '../shared/confetti';
import { prefs, session } from '../shared/device';
import { canPlay, limitedRun, playableGames } from '../shared/freeTier';
import { GAMES, type GameId, playsRemote } from '../shared/games';
import { DEFAULT_SECTION, type HomeSection, isHomeSection } from '../shared/homeRows';
import { Net, type NetStatus } from '../shared/net';
import { adPlanner } from './ads';
import { type BridgeInit, GameBridge } from './bridge';
import { FarLink, FarLinks } from './farlink';
import { canFullscreen, enterFullscreen, toggleFullscreen } from './fullscreen';
import { cardGame, focusSection } from './homeFocus';
import {
  changedKeys,
  type FarPath,
  type GameSettings,
  type GameSnap,
  type HomeSnap,
  MAX_FX,
  type MirrorPacket,
  type MusicSnap,
  PacketOrder,
  parseMirrorPacket,
  type RunSettings,
  relayNeeded,
  type ShellSnap,
  type ShellTimer,
  type TimerId,
  type WheelSnap,
} from './mirror';
import { MIRROR } from './mode';
import { focused, followFocus, followOnly, press } from './nav';
import { moveTo, newParty, type Party, partyStep, pickLineup, scoreGame } from './party';
import { ScreenRtc } from './rtc';
import { OFFER, REMOTE, STR } from './strings';

/** `party`: Mode Pesta between games (the lineup slots, the table, the champion). */
export type Page = 'join' | 'home' | 'detail' | 'game' | 'results' | 'party';

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
/** What the room has (free, trial, Pass, open), from the server. */
export const access = signal<RoomAccess>(FREE_ACCESS);
/** The owner's settings from the admin dashboard (free games, promo breaks, trial length). */
export const appConfig = signal<AppConfig>(DEFAULT_CONFIG);
/** Every game, Mode Pesta and more seats are open (trial, Pass or open mode). */
export const premium = computed(() => isPremium(access.value));

/**
 * Why the Hoorah Pass offer is on screen: a locked game, Mode Pesta, a full room, or the trial
 * just ended.
 */
export type OfferReason =
  | { kind: 'game'; game: GameId }
  | { kind: 'party' }
  | { kind: 'full' }
  | { kind: 'ended' }
  | { kind: 'passEnded' };
/** The Hoorah Pass offer over the current page, or null. */
export const offer = signal<OfferReason | null>(null);
export const netStatus = signal<NetStatus>('connecting');
export const rtt = signal(0);
export const page = signal<Page>('join');
export const selected = signal<GameId>('tarik');
export const activeGame = signal<ActiveGame | null>(null);
export const lastResult = signal<{ gameId: GameId; result: GameResult } | null>(null);
export const audioOn = signal(false);
export const muted = signal(prefs.get('muted', false));

/**
 * "Cara main" on the main screen (owner 2026-11-22). `intro`: before a game's first round on this
 * screen; the game loads once everyone pressed "Paham!", the Host skipped, or the steps ran out.
 * `view`: opened again from the detail page or the pause screen, nothing waits on it.
 */
export interface TutorialRun {
  id: GameId;
  mode: 'intro' | 'view';
  ready: number[];
}
export const tutorial = signal<TutorialRun | null>(null);
const seenTutorials = new Set<string>(prefs.get<string[]>('tutorials', []));
export const musicOn = signal(prefs.get('music', true));
/** The join QR is on screen so more players can scan in (the Host's "Tambah pemain"). */
export const inviting = signal(false);
export const toasts = signal<Toast[]>([]);
export const reactions = signal<ReactionBubble[]>([]);
export const notice = signal<string | null>(null);
/** Tab of the home row; the Host's phone picker and the main screen always show the same one. */
/** The home group the Host last asked for from the phone picker (the home screen jumps to it). */
export const homeTab = signal<HomeSection>(DEFAULT_SECTION);
/** Bumped on every group request from the phone, so the home screen jumps even to the same group. */
export const homeJump = signal(0);
/** Mode Pesta in progress (lineup, current game, party points), or null. */
export const party = signal<Party | null>(null);
/** Bumped on every Mode Pesta start, so "Pesta lagi" on the party screen begins a fresh reveal. */
export const partyRun = signal(0);
/** Recently played games, most recent first (remembered on this screen; listed first in the Host's picker). */
export const recent = signal<GameId[]>(
  prefs
    .get<string[]>('recent', [])
    .filter((id): id is GameId => id in GAMES)
    .slice(0, 4),
);

export const connected = computed(() => players.value.filter((p) => p.connected));
export const host = computed(() => players.value.find((p) => p.isHost) ?? null);

/* ------------------------------------------------------------------ long-distance play */

/** This screen is a far-away one: it follows the Host's main screen and controls nothing. */
export const isMirror = MIRROR !== null;
/** Host's main screen: far-away main screens watching now, and the secret of their link. */
export const mirrorCount = signal(0);
export const mirrorKey = signal('');
/** Host's main screen: the "Main bareng teman jauh" panel is open (never shown far away). */
export const remotePanel = signal(false);
/** Far-away main screen: the Host's main screen is connected. */
export const leadOnline = signal(true);
/** Far-away main screen: why it stopped following (the link no longer works), or null. */
export type MirrorEnd = 'stopped' | 'gone' | 'full' | 'limited';
export const mirrorEnd = signal<MirrorEnd | null>(null);
/**
 * A far-away main screen is in the room (on it, always): only games marked `remote` start, and
 * Mode Pesta and Acak draw from those only.
 */
export const remoteOn = computed(() => isMirror || mirrorCount.value > 0);
/** Home page parts beyond the focus (shelf, card row, hero, art), for the far-away screens. */
export const homeView = signal<HomeSnap | null>(null);
/**
 * The running game's init settings as the Host's screen started it. A far-away screen starts its
 * copy only once these arrived for that run (GamePage waits), and with exactly these.
 */
export const runSettings = signal<RunSettings | null>(null);
/** The Acak wheel while it is open (its slices, pick and spin), for the far-away screens. */
export const wheelView = signal<WheelSnap | null>(null);
/**
 * How the far-away main screens are reached: over a direct link (and its round trip) or through
 * the server. On a far-away screen: its own link to the Host's main screen.
 */
export const farPath = signal<FarPath>({ direct: 0, total: 0, rtt: null });
/**
 * The shell countdown running now (results, Mode Pesta, tutorial, ad break) with its deadline in
 * server time: set on the Host's main screen (screen/countdown.ts), followed on a far-away one.
 */
export const shellTimer = signal<ShellTimer | null>(null);

/* Host's main screen: what goes to the far-away screens with the next packet (see flushMirrors). */
let fxQueue: string[] = [];
let gameOut: GameSnap | null = null;
/** The running game's latest published state (a far-away screen that joins gets it at once). */
let lastGameState: GameSnap | null = null;
/** The shell state last sent, as JSON ('' = send it whole with the next packet). */
let sentShell = '';
let flushTimer = 0;
/** Far-away main screens watching (server ids) and the number of the last packet sent to them. */
let mirrorIds: readonly number[] = [];
let mirrorSeq = 0;

/* Far-away main screen: what the Host's main screen sent last. */
let appliedShell: ShellSnap | null = null;
let mirrorGame: GameSnap | null = null;
/** Packets arrive over the relay and the direct link: older parts than the newest applied are dropped. */
const packetOrder = new PacketOrder();
/** Run of the game that finished loading here (the loading screen waits for both screens). */
let readyRun = -1;

/** Whether this room can start `id` with a far-away screen watching (always without one). */
export function remoteAllows(id: GameId): boolean {
  return !remoteOn.value || playsRemote(id);
}

/* ------------------------------------------------------------------ net */

const bridge = new GameBridge();
const lastViews = new Map<number, ControllerView>();
let uid = 0;

/**
 * This main screen's own id (random, kept in its browser): a single-use Pass code and the free
 * trial stay with it across rooms. Without storage it lives as long as the page.
 */
const SCREEN_ID = ((): string => {
  const kept = prefs.get<unknown>('screenId', null);
  if (isScreenId(kept)) return kept;
  const id = randomScreenId();
  prefs.set('screenId', id);
  return id;
})();

function randomScreenId(): string {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  // 64 symbols: every byte maps evenly onto one of them.
  return Array.from(bytes, (b) => abc[b & 63]).join('');
}

const net = new Net(() => {
  if (MIRROR) return { t: 'hello', role: 'mirror', v: PROTOCOL_VERSION, code: MIRROR.code, key: MIRROR.key };
  const saved = session.get<{ code: string; token: string }>('screen');
  return saved
    ? { t: 'hello', role: 'screen', v: PROTOCOL_VERSION, resume: saved, screen: SCREEN_ID }
    : { t: 'hello', role: 'screen', v: PROTOCOL_VERSION, screen: SCREEN_ID };
});

// Relays to 'all' go out as one numbered copy per connected phone (see shared/linkseq.ts).
net.setRecipients(() => players.value.filter((p) => p.connected).map((p) => p.id));
// Direct links to the phones on the same Wi-Fi; the relay stays the fallback. A far-away main
// screen has no phones of its own.
if (!MIRROR) new ScreenRtc(net, (open) => reportDirect(open));
else followOnly();
// Long-distance play: a direct link between the two main screens, the relay stays the fallback.
// A link that opens or closes gets the whole shell state again, whichever path it now takes.
const farLinks = MIRROR
  ? null
  : new FarLinks(net, (path, linksChanged) => {
      farPath.value = path;
      if (linksChanged && mirrorCount.peek() > 0) resendMirrors();
    });
if (MIRROR)
  new FarLink(net, onMirrorPacket, (path) => {
    farPath.value = path;
  });
// Development builds only: lets latency tests listen to the input stream.
if (import.meta.env.DEV) (window as unknown as { __hoorahNet?: Net }).__hoorahNet = net;

net.on('status', (s) => {
  netStatus.value = s;
});

net.on('message', (m) => onServer(m));
net.on('input', (i: RelayedInput) => bridge.input(i));
net.on('fatal', (codeName) => {
  if (MIRROR) {
    onMirrorFatal(codeName);
    return;
  }
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
      if (m.role === 'mirror' && MIRROR) {
        batch(() => {
          code.value = m.code;
          maxPlayers.value = m.maxPlayers;
          roomPass.value = m.pass;
          access.value = m.access;
          appConfig.value = m.config;
          players.value = m.players;
          leadOnline.value = m.screenOnline;
          mirrorEnd.value = null;
        });
        return;
      }
      if (m.role !== 'screen' || MIRROR) return;
      session.set('screen', { code: m.code, token: m.token });
      reportedStatus = '';
      batch(() => {
        code.value = m.code;
        maxPlayers.value = m.maxPlayers;
        roomPass.value = m.pass;
        access.value = m.access;
        appConfig.value = m.config;
        players.value = m.players;
        mirrorKey.value = m.mirrorKey;
      });
      mirrorIds = m.mirrorIds;
      farLinks?.sync(m.mirrorIds);
      onMirrorCount(m.mirrors, true);
      sendPage();
      return;
    case 'mirrors':
      mirrorKey.value = m.key;
      mirrorIds = m.ids;
      farLinks?.sync(m.ids);
      onMirrorCount(m.count);
      return;
    case 'screen':
      if (MIRROR) leadOnline.value = m.online;
      return;
    case 'room':
      onRoom(m.maxPlayers, m.pass, m.access);
      return;
    case 'config':
      appConfig.value = m.config;
      return;
    case 'trial':
      if (!m.ok) onTrialReject(m.reason);
      return;
    case 'turnedAway':
      // A phone found the room full: offer more seats (not when the room already has them).
      if (!isPremium(access.value)) openOffer({ kind: 'full' });
      return;
    case 'players':
      onPlayers(m.players);
      return;
    case 'hostChanged': {
      const p = players.value.find((x) => x.id === m.id);
      if (p) toast(STR.hostNow(p.name), p);
      return;
    }
    case 'relay':
      if (MIRROR) {
        if (m.ch === 'p' && m.from === 0) onMirrorPacket(m.data);
        return;
      }
      if (m.ch === 'p') onPlatform(m.from, m.data);
      else if (m.ch === 'g') onGameAction(m.from, m.data);
      return;
    default:
      return;
  }
}

/** A phone entered a Hoorah Pass, the trial started, the owner changed either, or it ended. */
function onRoom(seats: number, pass: RoomPass | null, next: RoomAccess): void {
  const was = roomPass.value;
  const before = access.value;
  batch(() => {
    maxPlayers.value = seats;
    roomPass.value = pass;
    access.value = next;
  });
  if (pass && !was) {
    toast(STR.passOn(seats));
    sfx('join');
  } else if (before.kind === 'pass' && next.kind === 'free') {
    // A Pass ran out (or was revoked): the running game finishes, then the offer shows once.
    toast(OFFER.passEnded);
    openOffer({ kind: 'passEnded' });
  } else if (!pass && was) {
    toast(STR.passOff);
  } else if (next.kind === 'trial' && before.kind !== 'trial') {
    toast(OFFER.trialOn(seats));
    sfx('join');
  } else if (before.kind === 'trial' && next.kind === 'free') {
    toast(OFFER.trialOff);
    openOffer({ kind: 'ended' });
  }
  // The offer is answered once the room has everything.
  if (isPremium(next)) {
    offer.value = null;
    pendingOffer = null;
  }
  sendPage();
}

/** Minutes before a trial or Pass ends when the main screen reminds everyone. */
const REMIND_AT_MIN = [30, 5] as const;
let remindTimers: number[] = [];

// Reminders 30 and 5 minutes before the trial or Pass ends (re-planned whenever the end moves).
effect(() => {
  const a = access.value;
  for (const t of remindTimers) window.clearTimeout(t);
  remindTimers = [];
  if ((a.kind !== 'trial' && a.kind !== 'pass') || a.until === null) return;
  const what = a.kind;
  for (const min of REMIND_AT_MIN) {
    const wait = a.until - min * 60_000 - Date.now();
    if (wait <= 0) continue;
    remindTimers.push(
      window.setTimeout(() => {
        toast(OFFER.endsSoon(what, min));
        sfx('tick');
      }, wait),
    );
  }
});

/* ------------------------------------------------------------------ Hoorah Pass offer */

/** Whether this room can start the game now (free list, this week's game, or premium). */
export function canPlayGame(id: GameId): boolean {
  return canPlay(id, access.value, appConfig.value, Date.now());
}

/** The games of `ids` this room can start (the Acak wheel without premium). */
export function playableNow(ids: readonly GameId[]): GameId[] {
  return playableGames(ids, access.value, appConfig.value, Date.now());
}

/** Pages that show the offer (they mount `OfferLayer`); a running game is never covered. */
const OFFER_PAGES: readonly Page[] = ['home', 'detail', 'results', 'party'];
/** An offer asked for elsewhere (a game, the join page): it shows on the next page that can. */
let pendingOffer: OfferReason | null = null;

/** Opens the Hoorah Pass offer over the current page, or on the next page that shows it. */
export function openOffer(reason: OfferReason): void {
  if (isMirror) return;
  if (!OFFER_PAGES.includes(page.peek())) {
    pendingOffer = reason;
    return;
  }
  offer.value = reason;
  sfx('select');
}

export function closeOffer(): void {
  if (isMirror) return;
  if (!offer.value) return;
  offer.value = null;
  sfx('back');
}

effect(() => {
  if (!OFFER_PAGES.includes(page.value) || !pendingOffer) return;
  const reason = pendingOffer;
  pendingOffer = null;
  if (!isPremium(access.peek())) openOffer(reason);
});

/** "Coba gratis": asks the server to start this screen's free trial (a `room` message answers). */
export function requestTrial(): void {
  if (isMirror) return;
  if (!net.send({ t: 'trial' })) {
    toast(OFFER.trialFailed);
    sfx('wrong');
  }
}

function onTrialReject(reason: TrialReject): void {
  if (reason === 'not_free') return;
  toast(reason === 'used' ? OFFER.trialUsed : OFFER.trialRateLimited);
  sfx('wrong');
  if (reason === 'used') access.value = { ...access.value, trialUsed: true };
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
  } else if (msg.k === 'tab' && player.isHost && isHomeSection(msg.tab)) {
    tabFromPhone(msg.tab);
  } else if (msg.k === 'host' && player.isHost && HOST_COMMANDS.includes(msg.cmd)) {
    hostCommand(msg.cmd);
  } else if (msg.k === 'react' && ['cheer', 'clap', 'boo', 'rematch'].includes(msg.r)) {
    react(player, msg.r);
  } else if (msg.k === 'understood') {
    understood(player.id);
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
  if (page.value === 'game' || page.value === 'home' || adBreak.value) return;
  sfx('back');
  goHome();
}

/** A game tapped in the Host's game picker: show its detail page (not while a game runs). */
function openFromPhone(id: string): void {
  if (page.value === 'game' || adBreak.value || !(id in GAMES)) return;
  openDetail(id as GameId);
}

/** A group tapped in the Host's picker: the home screen jumps to the same row (home comes up if needed). */
function tabFromPhone(tab: HomeSection): void {
  if (page.value === 'game') return;
  setHomeTab(tab);
  if (page.value !== 'home') goHome();
}

export function setHomeTab(tab: HomeSection): void {
  if (isMirror) return;
  // Asked again (same group): still jump, the Host may have scrolled away since.
  homeTab.value = tab;
  homeJump.value++;
  sfx('tick');
  sendPage();
}

/** The Host's in-game menu on the phone (pill at the top) drives the main screen. */
function hostCommand(cmd: HostCommand): void {
  switch (cmd) {
    case 'tutorial-skip':
      finishTutorial();
      return;
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
  if (isMirror) return;
  if (inviting.value === on) return;
  inviting.value = on;
  sfx(on ? 'select' : 'back');
  sendPage();
}

function relay(to: number | 'all', data: PlatformToController): void {
  if (isMirror) return;
  net.send({ t: 'relay', ch: 'p', to, data });
}

function relayGame(to: number | 'all', data: unknown): void {
  if (isMirror) return;
  net.send({ t: 'relay', ch: 'g', to, data });
}

function platformPage(): PlatformPage {
  // The party screen and a promo break are between games: phones show "a game is coming" (the
  // Host keeps the remote, which moves between the break's two buttons).
  return page.value === 'party' || adBreak.value ? 'loading' : page.value;
}

export function sendPage(to: number | 'all' = 'all'): void {
  if (isMirror) return;
  const g = activeGame.value;
  // On the home rows the focused card is the game "on the screen" (the picker marks it).
  const home = page.value === 'home';
  const card = home ? cardGame(focused.value) : null;
  const gameId =
    page.value === 'detail'
      ? selected.value
      : home
        ? (card ?? undefined)
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
    // The group in focus on the home screen, so the picker opens on the same games.
    tab: (home ? focusSection(focused.value) : null) ?? homeTab.value,
  };
  if (remoteOn.value) data.remote = true;
  const tu = tutorial.value;
  if (tu?.mode === 'intro' && page.value === 'game') data.tutorial = { ready: tu.ready };
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

/**
 * A sound of the shell. On a far-away main screen the shell's own sounds stay quiet: the Host's
 * main screen sends every sound it plays (`fx`), so both rooms hear the same thing once.
 */
export function sfx(name: Sfx): void {
  if (isMirror) return;
  playSfx(name);
}

/** Plays here and, with far-away main screens watching, there too. */
function playSfx(name: Sfx): void {
  audio.sfx(name);
  if (mirrorCount.peek() === 0) return;
  fxQueue.push(name);
  scheduleFlush();
}

/** The song, its layers and tempo as set here (far-away main screens play the same). */
const musicNow = signal<MusicSnap>({ track: null, intensity: 0, hurry: false });

/** A new song always starts calm and at its written tempo (see audio.music). */
function setMusic(track: Track | null): void {
  audio.music(track);
  if (musicNow.peek().track !== track) musicNow.value = { track, intensity: 0, hurry: false };
}

function setMusicIntensity(level: MusicIntensity): void {
  audio.musicIntensity(level);
  musicNow.value = { ...musicNow.peek(), intensity: level };
}

function setMusicHurry(on: boolean): void {
  audio.musicHurry(on);
  musicNow.value = { ...musicNow.peek(), hurry: on };
}

function syncMusic(): void {
  if (page.value === 'game') return;
  setMusic('menu');
}

/** No input on the menus for this long fades the menu song out (owner 2026-11-23). */
const MUSIC_IDLE_MS = 2 * 60_000;
let musicIdleTimer = 0;

/** Any move, page change or player arrival counts as activity; games keep their music. */
function musicActivity(): void {
  audio.setMusicIdle(false);
  window.clearTimeout(musicIdleTimer);
  musicIdleTimer = window.setTimeout(() => {
    if (page.peek() !== 'game') audio.setMusicIdle(true);
  }, MUSIC_IDLE_MS);
}

effect(() => {
  void focused.value;
  void page.value;
  void connected.value.length;
  musicActivity();
});

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
  // A far-away main screen only follows the Host's main screen.
  if (isMirror) return;
  remotePanel.value = false;
  // Arrivals were already shown in the join list; don't replay them on the next screen.
  if (page.value === 'join') toasts.value = [];
  // Moving on answers the offer ("Nanti saja"); one still waiting shows on the new page.
  offer.value = null;
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
  if (isMirror) return;
  // The game list is outside any party: back home, the party is over.
  party.value = null;
  go('home');
}

export function openDetail(id: GameId): void {
  if (isMirror) return;
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
  if (isMirror) return;
  // A promo break is playing: it cannot be skipped or replaced by another pick.
  if (adBreak.value) return;
  const info = GAMES[id];
  // A far-away main screen watches: only the games it can show start (staged rollout).
  if (!remoteAllows(id)) {
    toast(REMOTE.notYet(info.title));
    sfx('wrong');
    return;
  }
  if (!canPlayGame(id)) {
    openOffer({ kind: 'game', game: id });
    return;
  }
  if (connected.value.length < info.minPlayers) {
    toast(`${info.title} butuh minimal ${info.minPlayers} pemain`);
    sfx('wrong');
    return;
  }
  // Free rooms: a short promo break before the next game now and then (ads.ts has the rules).
  const now = Date.now();
  if (activeGame.value === null && adPlanner.due(access.value, appConfig.value, now, party.value !== null)) {
    adPlanner.shown(now);
    offer.value = null;
    adBreak.value = { next: id };
    sendPage();
    return;
  }
  launchGame(id);
}

/** A promo break before `next` is playing (screen/pages/AdBreak.tsx), or null. */
export const adBreak = signal<{ next: GameId } | null>(null);

/** The break is over (or the trial started during it): the waiting game starts now. */
export function finishBreak(): void {
  if (isMirror) return;
  const b = adBreak.value;
  adBreak.value = null;
  if (b) launchGame(b.next);
  else sendPage();
}

/** "Punya kode Pass?" during a break: the code is typed on the Host's phone. */
export function passHint(): void {
  if (isMirror) return;
  toast(STR.passHint);
  sfx('select');
}

// The trial (or a Pass) started during a break: no more waiting, the game starts at once.
effect(() => {
  if (adBreak.value && isPremium(access.value)) finishBreak();
});

function launchGame(id: GameId): void {
  if (isMirror) return;
  lastViews.clear();
  selected.value = id;
  recent.value = [id, ...recent.value.filter((r) => r !== id)].slice(0, 4);
  prefs.set('recent', recent.value);
  activeGame.value = { id, run: ++uid, ready: false, paused: false };
  tutorial.value = seenTutorials.has(id) ? null : { id, mode: 'intro', ready: [] };
  lastGameState = null;
  gameOut = null;
  setMusic(null);
  sfx('select');
  offer.value = null;
  page.value = 'game';
  sendPage();
}

/* ------------------------------------------------------------------ Mode Pesta */

/**
 * Starts Mode Pesta: a fresh, hidden lineup on every press (never the same twice in a row), then
 * the party screen reveals its first game.
 */
export function startParty(): void {
  if (isMirror) return;
  if (!premium.value) {
    openOffer({ kind: 'party' });
    return;
  }
  const lineup = pickLineup(connected.value.length, recent.value, Math.random, remoteOn.value);
  if (lineup.length === 0) {
    toast(STR.partyNone);
    sfx('wrong');
    return;
  }
  batch(() => {
    party.value = newParty(lineup);
    partyRun.value++;
  });
  sfx('select');
  go('party');
}

/** Results page during a party: on to the party screen (table, next reveal or the champion). */
export function nextPartyGame(): void {
  if (!party.value) return;
  go('party');
}

/** Party screen: play the game just revealed. */
export function playPartyGame(): void {
  if (isMirror) return;
  const p = party.value;
  const slot = p ? partyStep(p).reveal : null;
  if (!p || slot === null) return;
  party.value = moveTo(p, slot);
  startGame(p.lineup[slot]!);
}

/** Ends the party (after the final, or when the Host leaves it). */
export function endParty(): void {
  if (isMirror) return;
  party.value = null;
}

export function restartGame(): void {
  const id = activeGame.value?.id ?? lastResult.value?.gameId;
  if (id) startGame(id);
}

/* ------------------------------------------------------------------ tutorial */

/** Ends the tutorial; an intro one is then marked seen on this screen and the game loads. */
export function finishTutorial(): void {
  if (isMirror) return;
  const tu = tutorial.value;
  if (!tu) return;
  if (tu.mode === 'intro') {
    seenTutorials.add(tu.id);
    prefs.set('tutorials', [...seenTutorials]);
  }
  tutorial.value = null;
  sfx('select');
  sendPage();
}

/** Opens a game's tutorial again ("Cara main" on the detail page or the pause screen). */
export function openTutorial(id: GameId): void {
  if (isMirror) return;
  tutorial.value = { id, mode: 'view', ready: [] };
  sfx('select');
}

/** "Paham!" from a phone: once every connected player pressed it, the game starts. */
function understood(id: number): void {
  const tu = tutorial.value;
  if (tu?.mode !== 'intro' || tu.ready.includes(id)) return;
  const ready = [...tu.ready, id];
  tutorial.value = { ...tu, ready };
  sfx('tick');
  if (connected.value.every((p) => ready.includes(p.id))) finishTutorial();
  else sendPage();
}

export function quitGame(): void {
  if (isMirror) return;
  // Leaving a game mid-party ends the party.
  party.value = null;
  tutorial.value = null;
  inviting.value = false;
  activeGame.value = null;
  lastViews.clear();
  sfx('back');
  go('home');
}

export function togglePause(force?: boolean): void {
  if (isMirror) return;
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
  if (isMirror) {
    attachMirrorGame(frame, g);
    return;
  }
  // Length is automatic (no mode picker), fixed for this run by the players connected at its start.
  const rounds = autoRounds(g.id, connected.peek().length);
  // `limited`: a free room plays the game's free part only (Petualangan Warna: Hutan 1-5).
  const settings: GameSettings = {
    rounds,
    limited: limitedRun(g.id, access.peek(), appConfig.peek(), Date.now()),
  };
  // Far-away main screens start their copy with exactly these (their player count may differ).
  runSettings.value = { run: g.run, values: settings };
  const init = (): BridgeInit => ({
    players: players.value,
    clockOffset: net.clock.offset,
    settings,
    muted: muted.value,
  });
  bridge.attach(frame, g.id, {
    init,
    // A far-away main screen already watches: the game publishes from its first frame.
    inited: () => {
      if (mirrorCount.peek() > 0) bridge.mirrors(true);
    },
    publish: (state) => {
      const snap: GameSnap = { run: g.run, state };
      lastGameState = snap;
      if (mirrorCount.peek() === 0) return;
      gameOut = snap;
      scheduleFlush();
    },
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
      adPlanner.gameFinished();
      batch(() => {
        if (party.value) party.value = scoreGame(party.value, g.id, result.ranking);
        lastResult.value = { gameId: g.id, result };
        activeGame.value = null;
        page.value = 'results';
      });
      setMusic('menu');
      sfx('win');
      celebrate();
      sendPage();
    },
    sfx: (name) => playSfx(name as Sfx),
    music: (track) => setMusic((track as Track | null) ?? null),
    musicIntensity: (level) => setMusicIntensity(level),
    musicHurry: (on) => setMusicHurry(on),
    quit: () => quitGame(),
  });
}

/**
 * Far-away main screen: the same game in mirror mode. It gets the Host's game's published state
 * and runs no rules; whatever it says back (views, the end, sounds) is dropped here, because the
 * Host's main screen does all of that.
 */
function attachMirrorGame(frame: HTMLIFrameElement, g: ActiveGame): void {
  const deliver = () => {
    if (mirrorGame?.run === g.run) bridge.mirror(mirrorGame.state);
  };
  const ignore = () => {};
  bridge.attach(frame, g.id, {
    init: () => ({
      players: players.value,
      clockOffset: net.clock.offset,
      // Exactly the Host's settings for this run (GamePage only attaches once they are here).
      settings: runSettings.peek()?.run === g.run ? runSettings.peek()!.values : {},
      muted: muted.value,
      mirror: true,
    }),
    // The game listens for states once `connect()` resolved: the latest one goes right after the
    // init, again a moment later and on `ready` (a game may register its listener after loading).
    inited: () => {
      deliver();
      window.setTimeout(deliver, MIRROR_DELIVER_RETRY_MS);
    },
    publish: ignore,
    ready: () => {
      readyRun = g.run;
      if (appliedShell?.game) activeGame.value = followedGame(appliedShell.game);
      // A game that loads slowly may only listen from here on.
      deliver();
    },
    view: ignore,
    vibrate: ignore,
    end: ignore,
    sfx: ignore,
    music: ignore,
    musicIntensity: ignore,
    musicHurry: ignore,
    quit: ignore,
  });
}

export function detachGame(frame: HTMLIFrameElement): void {
  bridge.detach(frame);
}

/* ------------------------------------------------------------------ long-distance play: sync */

/** Changes within this time go to the far-away main screens as one packet. */
const MIRROR_FLUSH_MS = 50;
/** A packet must fit one relay message, with room for the relay around it. */
const PACKET_MAX = LIMITS.messageBytes - 256;
/** Far-away main screen: the latest game state goes to a fresh game copy again after this. */
const MIRROR_DELIVER_RETRY_MS = 250;
/** A far-away main screen turned away for now (full, too many tries) tries again after this. */
const MIRROR_RETRY_MS = 20_000;

/** The shell's display state now (reading it inside an effect subscribes to all of it). */
function shellSnap(): ShellSnap {
  const p = page.value;
  return {
    page: p,
    focus: focused.value,
    selected: selected.value,
    tab: homeTab.value,
    home: p === 'home' ? homeView.value : null,
    wheel: p === 'home' ? wheelView.value : null,
    inviting: inviting.value,
    game: activeGame.value,
    // Only the results page draws the last result: no need to carry it everywhere.
    result: p === 'results' ? lastResult.value : null,
    party: party.value,
    partyRun: partyRun.value,
    tutorial: tutorial.value,
    offer: offer.value,
    adBreak: adBreak.value,
    recent: recent.value,
    music: musicNow.value,
    settings: p === 'game' ? runSettings.value : null,
    timer: shellTimer.value,
  };
}

/** Synced server time in ms (the clock both main screens share for countdowns). */
export function serverNow(): number {
  return net.now();
}

/** Host's main screen: a shell countdown starts (or moves on a step); far-away screens follow it. */
export function publishTimer(timer: ShellTimer): void {
  if (isMirror) return;
  shellTimer.value = timer;
}

/** Host's main screen: the countdown `id` stopped (finished, cancelled, or its page closed). */
export function clearTimer(id: TimerId): void {
  if (isMirror || shellTimer.peek()?.id !== id) return;
  shellTimer.value = null;
}

/** When the last packet went out (performance clock), for the 50 ms spacing. */
let lastFlushAt = -Infinity;

/**
 * At most one packet per MIRROR_FLUSH_MS, sent as early as that allows: when the spacing has
 * already passed, changes made in the same task still ride one packet (a 0 ms timer), otherwise
 * the packet waits only for the rest of the spacing. A game publishing every 50-60 ms then
 * really reaches 16-20 packets per second instead of being merged down to about 10.
 */
function scheduleFlush(): void {
  if (isMirror || flushTimer) return;
  const wait = Math.max(0, lastFlushAt + MIRROR_FLUSH_MS - performance.now());
  flushTimer = window.setTimeout(flushMirrors, wait);
}

/** Sends what changed since the last packet: the shell state when it differs, game state, sounds. */
function flushMirrors(): void {
  flushTimer = 0;
  lastFlushAt = performance.now();
  if (mirrorCount.peek() === 0) {
    fxQueue = [];
    gameOut = null;
    return;
  }
  const shell = shellSnap();
  const key = JSON.stringify(shell);
  const packet: MirrorPacket = {};
  if (key !== sentShell) packet.s = shell;
  if (gameOut) packet.g = gameOut;
  if (fxQueue.length > 0) packet.fx = fxQueue.slice(-MAX_FX);
  fxQueue = [];
  gameOut = null;
  if (!packet.s && !packet.g && !packet.fx) return;
  // Not sent (the socket is down): the next packet carries the whole shell state again.
  sentShell = sendPacket(packet) ? key : '';
}

/** One relay message, or two when shell and game state do not fit together. */
function sendPacket(packet: MirrorPacket): boolean {
  if (JSON.stringify(packet).length <= PACKET_MAX) return relayMirrors(packet);
  const { g, ...rest } = packet;
  const okRest = rest.s || rest.fx ? sendAlone(rest) : true;
  return (g ? sendAlone({ g }) : true) && okRest;
}

function sendAlone(packet: MirrorPacket): boolean {
  if (JSON.stringify(packet).length > PACKET_MAX) {
    // Too big for one message (a game publishing too much): far-away screens miss this one.
    if (import.meta.env.DEV) console.warn('mirror packet too large', Object.keys(packet));
    return true;
  }
  return relayMirrors(packet);
}

/**
 * One numbered packet to every far-away main screen: over its direct link when that is open, the
 * relay carries it to the rest (all of them when no link is open). False when it reached nobody.
 */
function relayMirrors(packet: MirrorPacket): boolean {
  const out: MirrorPacket = { ...packet, e: net.epoch, n: ++mirrorSeq };
  const reached = farLinks?.send(out) ?? [];
  if (!relayNeeded(mirrorIds, reached)) return true;
  return net.send(
    reached.length > 0
      ? { t: 'relay', ch: 'p', to: 'mirror', data: out, skip: reached }
      : { t: 'relay', ch: 'p', to: 'mirror', data: out },
  );
}

/** Everything goes out again with the next packet: the whole shell state and the latest game state. */
function resendMirrors(): void {
  sentShell = '';
  gameOut = lastGameState;
  scheduleFlush();
}

/**
 * How many far-away main screens watch. One more (or `fresh`: this screen just (re)connected)
 * means everything goes out again; the game is told whether to publish at all.
 */
function onMirrorCount(n: number, fresh = false): void {
  const before = mirrorCount.peek();
  mirrorCount.value = n;
  if (n > 0 && (n > before || fresh)) {
    if (bridge.active) bridge.mirrors(true);
    resendMirrors();
  } else if (n === 0 && before > 0 && bridge.active) {
    bridge.mirrors(false);
  }
  // The Host's picker marks the games a far-away screen cannot show yet.
  if (n > 0 !== before > 0) sendPage();
}

// Host's main screen: any change of what is on screen goes to the far-away screens (debounced).
if (!isMirror) {
  effect(() => {
    if (mirrorCount.value === 0) return;
    shellSnap();
    scheduleFlush();
  });
}

/** "Main bareng teman jauh" on the home page: the link, its QR and the steps. */
export function openRemotePanel(): void {
  if (isMirror || remotePanel.value) return;
  remotePanel.value = true;
  sfx('select');
}

export function closeRemotePanel(): void {
  if (!remotePanel.value) return;
  remotePanel.value = false;
  sfx('back');
}

/** Disconnects every far-away main screen; the server makes a new link (the old one stops working). */
export function stopMirrors(): void {
  if (isMirror) return;
  if (net.send({ t: 'mirrorsOff' })) {
    toast(REMOTE.stopped);
    sfx('back');
  } else {
    toast(REMOTE.offline);
    sfx('wrong');
  }
}

/* Far-away main screen. */

/** A packet from the Host's main screen. */
function onMirrorPacket(data: unknown): void {
  const parsed = parseMirrorPacket(data);
  const p = parsed && packetOrder.filter(parsed);
  if (!p) return;
  if (p.s) applyShell(p.s);
  if (p.g) {
    mirrorGame = p.g;
    if (bridge.active && activeGame.peek()?.run === p.g.run) bridge.mirror(p.g.state);
  }
  // Unknown names play nothing (audio.sfx).
  if (p.fx) for (const name of p.fx) audio.sfx(name as Sfx);
}

/** The game as the Host's screen shows it, still loading here until this screen's copy is ready. */
function followedGame(g: ActiveGame | null): ActiveGame | null {
  return g ? { ...g, ready: g.ready && readyRun === g.run } : null;
}

/** Draws what the Host's main screen shows: only the parts that changed touch their signal. */
function applyShell(next: ShellSnap): void {
  const before = appliedShell;
  const keys = changedKeys(before, next);
  appliedShell = next;
  batch(() => {
    for (const k of keys) {
      switch (k) {
        case 'page':
          page.value = next.page;
          break;
        case 'selected':
          selected.value = next.selected;
          break;
        case 'tab':
          homeTab.value = next.tab;
          break;
        case 'home':
          if (next.home) homeView.value = next.home;
          break;
        case 'wheel':
          wheelView.value = next.wheel;
          break;
        case 'inviting':
          inviting.value = next.inviting;
          break;
        case 'game':
          activeGame.value = followedGame(next.game);
          break;
        case 'result':
          if (next.result) lastResult.value = next.result;
          break;
        case 'party':
          party.value = next.party;
          break;
        case 'partyRun':
          partyRun.value = next.partyRun;
          break;
        case 'tutorial':
          tutorial.value = next.tutorial;
          break;
        case 'offer':
          offer.value = next.offer;
          break;
        case 'adBreak':
          adBreak.value = next.adBreak;
          break;
        case 'recent':
          recent.value = next.recent;
          break;
        case 'music':
          followMusic(next.music);
          break;
        case 'settings':
          if (next.settings) runSettings.value = next.settings;
          break;
        case 'timer':
          shellTimer.value = next.timer;
          break;
        case 'focus':
          break;
      }
    }
    followFocus(next.focus);
  });
  if (before?.page === 'game' && next.page === 'results') celebrate();
}

function followMusic(m: MusicSnap): void {
  const cur = musicNow.peek();
  if (m.track !== cur.track) audio.music(m.track as Track | null);
  if (m.track !== cur.track || m.intensity !== cur.intensity) audio.musicIntensity(m.intensity);
  if (m.track !== cur.track || m.hurry !== cur.hurry) audio.musicHurry(m.hurry);
  musicNow.value = m;
}

let retryTimer = 0;

/** The server turned this far-away screen away or ended it: say why (and try again when it may help). */
function onMirrorFatal(codeName: ErrorCode | 'kicked'): void {
  const end: MirrorEnd =
    codeName === 'mirror_stopped'
      ? 'stopped'
      : codeName === 'room_full'
        ? 'full'
        : codeName === 'rate_limited'
          ? 'limited'
          : 'gone';
  mirrorEnd.value = end;
  window.clearTimeout(retryTimer);
  if (end === 'full' || end === 'limited') retryTimer = window.setTimeout(retryMirror, MIRROR_RETRY_MS);
}

/** "Coba lagi" on the far-away screen's end card. */
export function retryMirror(): void {
  if (!isMirror) return;
  window.clearTimeout(retryTimer);
  mirrorEnd.value = null;
  net.start();
}
