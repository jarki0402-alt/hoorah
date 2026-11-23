import {
  type ControllerView,
  type ErrorCode,
  encodeInput,
  FRUITS,
  type Fruit,
  type HostCommand,
  isFruit,
  isPassCode,
  isRoomCode,
  LIMITS,
  type NavKey,
  normalizePassCode,
  normalizeRoomCode,
  type PassReject,
  type PlatformPage,
  type PlayerInfo,
  PROTOCOL_VERSION,
  packStick,
  type Reaction,
  type RoomPass,
  type ServerMsg,
  STICK_OP,
  sanitizeName,
} from '@hoorah/protocol';
import { batch, computed, signal } from '@preact/signals';
import { prefs, session, vibrate } from '../shared/device';
import { primeHaptics } from '../shared/haptics';
import { Net, type NetStatus } from '../shared/net';
import { ControllerRtc } from './rtc';

export type Stage = 'code' | 'profile' | 'joining' | 'room' | 'error';

export const stage = signal<Stage>('code');
export const code = signal('');
export const name = signal(prefs.get('name', ''));
// New players start on a random fruit (not always semangka), so a room of quick joiners doesn't
// look like eight identical avatars.
export const fruit = signal<Fruit>(
  isFruit(prefs.get('fruit', '')) ? prefs.get<Fruit>('fruit', 'semangka') : randomFruitOf(),
);
export const meId = signal(0);
export const players = signal<PlayerInfo[]>([]);
export interface PlatformState {
  page: PlatformPage;
  gameId?: string;
  gameTitle?: string;
  paused: boolean;
  /** Main-screen settings, mirrored for the Host's in-game menu. */
  music: boolean;
  sound: boolean;
  invite: boolean;
  seats: number;
  /** Recently played games on this main screen, most recent first. */
  recent?: string[];
  /** Tab of the main screen's game list. */
  tab?: string;
  /** The main screen shows the game's tutorial: who already pressed "Paham!". */
  tutorial?: { ready: number[] };
}
export const platform = signal<PlatformState>({
  page: 'join',
  paused: false,
  music: true,
  sound: true,
  invite: false,
  seats: 2,
});
export const view = signal<ControllerView | null>(null);
export const screenOnline = signal(true);
export const netStatus = signal<NetStatus>('connecting');
export const error = signal<ErrorCode | 'kicked' | null>(null);
export const vibrationOn = signal(prefs.get('vibrate', true));
// iPhones: watch fingers from the first touch so a tick without a gesture can wait for the release.
primeHaptics();
/** Seats and Hoorah Pass of the room, straight from the server. */
export const roomSeats = signal<number>(LIMITS.freePlayers);
export const roomPass = signal<RoomPass | null>(null);
/** The last pass code this phone typed: being checked, accepted, or why not. */
export type PassState =
  | { s: 'idle' }
  | { s: 'sending' }
  | { s: 'ok'; pass: RoomPass }
  | { s: 'error'; reason: PassReject };
export const passState = signal<PassState>({ s: 'idle' });
/** The pending Host offer this phone is part of (it made it, or it was asked), from the server. */
export const hostOffer = signal<{ from: number; to: number } | null>(null);
/** A short notice about the Host role on this phone: a new Host, or how this phone's offer ended. */
export type HostNotice = {
  id: number;
  kind: 'now' | 'declined' | 'expired' | 'cancelled';
  who: number;
  name: string;
};
export const hostNotice = signal<HostNotice | null>(null);

export const me = computed(() => players.value.find((p) => p.id === meId.value) ?? null);
export const hostPlayer = computed(() => players.value.find((p) => p.isHost) ?? null);

let net: Net | null = null;
let seq = 0;
let taps = 0;
/** Bitmask of buttons currently held (drive/gesture views), sent with every binary frame. */
let held = 0;
let heldTimer = 0;

/**
 * Haptic feedback for a touch (Android vibration, iPhone switch ticks, or a flash). Call it from
 * the pointer/touch handler itself: iPhones only tick inside the user's gesture.
 */
export function haptic(pattern: number | number[]): void {
  if (vibrationOn.value && !view.value?.silent) vibrate(pattern);
}

export function serverNow(): number {
  return net ? net.now() : Date.now();
}

/* ------------------------------------------------------------------ Hoorah Pass */

interface RememberedPass {
  code: string;
  expiresAt: number;
}

/**
 * A pass that worked is remembered on this phone until it ends, and sent along when joining,
 * so the next room opens its seats without typing again.
 */
function rememberedPass(): string | null {
  const p = prefs.get<RememberedPass | null>('pass', null);
  if (!p || !isPassCode(p.code) || typeof p.expiresAt !== 'number' || p.expiresAt <= Date.now()) return null;
  return p.code;
}

function rememberPass(passCode: string, pass: RoomPass): void {
  prefs.set('pass', { code: passCode, expiresAt: pass.expiresAt } satisfies RememberedPass);
}

function forgetPass(passCode: string): void {
  if (prefs.get<RememberedPass | null>('pass', null)?.code === passCode) prefs.set('pass', null);
}

/** Code sent in the latest hello (typed on the "room full" page, or remembered). */
let helloPass: string | null = null;
/** Code typed while in the room, waiting for the server's answer. */
let pendingPass: string | null = null;

/** Enter a pass code: in the room it is checked at once; turned away from a full room it joins with it. */
export function submitPass(raw: string): void {
  const passCode = normalizePassCode(raw);
  if (!isPassCode(passCode)) return;
  passState.value = { s: 'sending' };
  if (stage.value === 'room' && net) {
    pendingPass = passCode;
    net.send({ t: 'pass', code: passCode });
    return;
  }
  connect(passCode);
}

export function resetPassState(): void {
  passState.value = { s: 'idle' };
}

/* ------------------------------------------------------------------ setup */

export function setCode(raw: string): boolean {
  const c = normalizeRoomCode(raw);
  code.value = c;
  return isRoomCode(c);
}

export function pickFruit(f: Fruit): void {
  fruit.value = f;
  prefs.set('fruit', f);
}

export function randomFruit(): Fruit {
  return randomFruitOf();
}

function randomFruitOf(): Fruit {
  return FRUITS[Math.floor(Math.random() * FRUITS.length)]!;
}

export function join(): void {
  const cleaned = sanitizeName(name.value);
  if (!cleaned || !isRoomCode(code.value)) return;
  name.value = cleaned;
  prefs.set('name', cleaned);
  prefs.set('fruit', fruit.value);
  session.set('last', { code: code.value });
  connect();
}

function connect(typedPass?: string): void {
  net?.stop();
  error.value = null;
  stage.value = 'joining';
  const roomCode = code.value;
  const n = new Net(() => {
    const token = session.get<string>(`token.${roomCode}`);
    // Reconnects of the same tab resend the typed code until it has been accepted or refused.
    helloPass = typedPass ?? rememberedPass();
    return {
      t: 'hello',
      role: 'controller',
      v: PROTOCOL_VERSION,
      code: roomCode,
      name: name.value,
      fruit: fruit.value,
      ...(token ? { token } : {}),
      ...(helloPass ? { pass: helloPass } : {}),
    };
  });
  n.on('status', (s) => {
    netStatus.value = s;
  });
  n.on('message', onServer);
  n.on('fatal', (c) => {
    if (c === 'room_not_found' || c === 'room_closed') {
      session.remove(`token.${roomCode}`);
      session.remove('last');
    }
    if (helloPass && (c === 'pass_invalid' || c === 'pass_expired')) forgetPass(helloPass);
    if (typedPass) {
      typedPass = undefined;
      passState.value = { s: 'idle' };
    }
    batch(() => {
      error.value = c;
      stage.value = 'error';
      view.value = null;
    });
  });
  // Direct link to the main screen on the same Wi-Fi (falls back to the relay by itself).
  const rtc = new ControllerRtc(n);
  // Development builds only: lets tests break the direct link on purpose.
  if (import.meta.env.DEV) (window as unknown as { __hoorahRtc?: ControllerRtc }).__hoorahRtc = rtc;
  net = n;
  n.start();
}

export function retry(): void {
  connect();
}

export function leave(): void {
  net?.send({ t: 'leave' });
  net?.stop();
  net = null;
  session.remove(`token.${code.value}`);
  session.remove('last');
  batch(() => {
    view.value = null;
    players.value = [];
    stage.value = 'code';
    error.value = null;
    hostOffer.value = null;
  });
}

export function changeCode(): void {
  net?.stop();
  net = null;
  batch(() => {
    error.value = null;
    stage.value = 'code';
  });
}

/** After an accidental refresh: rejoin the same room seamlessly. */
export function tryResume(urlCode: string | null): void {
  if (urlCode && setCode(urlCode)) {
    const hasToken = session.get<string>(`token.${code.value}`);
    stage.value = hasToken && name.value ? 'joining' : 'profile';
    if (hasToken && name.value) connect();
    return;
  }
  const last = session.get<{ code: string }>('last');
  if (last && setCode(last.code) && name.value && session.get<string>(`token.${last.code}`)) {
    connect();
  }
}

function onServer(m: ServerMsg): void {
  switch (m.t) {
    case 'welcome':
      if (m.role !== 'controller') return;
      session.set(`token.${m.code}`, m.token);
      // The room has a pass now: keep the code that was sent (a refusal follows if it was not ours).
      if (helloPass && m.pass) rememberPass(helloPass, m.pass);
      batch(() => {
        meId.value = m.id;
        players.value = m.players;
        // A reconnect ends any offer on the server side.
        hostOffer.value = null;
        screenOnline.value = m.screenOnline;
        roomSeats.value = m.maxPlayers;
        roomPass.value = m.pass;
        if (passState.value.s === 'sending')
          passState.value = m.pass ? { s: 'ok', pass: m.pass } : { s: 'idle' };
        stage.value = 'room';
      });
      if (!m.resumed) haptic([30, 40, 30]);
      return;
    case 'players':
      players.value = m.players;
      return;
    case 'screen':
      screenOnline.value = m.online;
      return;
    case 'room':
      batch(() => {
        roomSeats.value = m.maxPlayers;
        roomPass.value = m.pass;
      });
      return;
    case 'pass':
      onPassAnswer(m);
      return;
    case 'relay':
      if (m.ch === 'p') onPlatform(m.data);
      else if (m.ch === 'g') onGame(m.data);
      return;
    case 'hostOffer':
      hostOffer.value = { from: m.from, to: m.to };
      if (m.to === meId.value) haptic([30, 40, 30]);
      return;
    case 'hostOfferEnd':
      onHostOfferEnd(m);
      return;
    case 'hostChanged':
      showHostNotice('now', m.id);
      if (m.id === meId.value) haptic([20, 30, 20]);
      return;
    default:
      return;
  }
}

/* ------------------------------------------------------------------ Host offers */

/** This phone withdrew or replaced its own offer: the "cancelled" answer needs no notice. */
let quietCancel = false;
let noticeSeq = 0;

function showHostNotice(kind: HostNotice['kind'], id: number): void {
  const name = players.value.find((p) => p.id === id)?.name ?? 'Pemain';
  hostNotice.value = { id: ++noticeSeq, kind, who: id, name };
}

function onHostOfferEnd(m: Extract<ServerMsg, { t: 'hostOfferEnd' }>): void {
  const cur = hostOffer.value;
  if (cur && cur.from === m.from && cur.to === m.to) hostOffer.value = null;
  if (m.from !== meId.value) return;
  if (m.result === 'cancelled' && quietCancel) {
    quietCancel = false;
    return;
  }
  // Accepted is announced by `hostChanged` to everyone.
  if (m.result !== 'accepted') showHostNotice(m.result, m.to);
}

/** The Host asks player `id` to take over (they must accept on their phone). */
export function offerHost(id: number): void {
  haptic(12);
  if (hostOffer.value) quietCancel = true;
  net?.send({ t: 'hostOffer', id });
}

/** The Host withdraws its pending offer. */
export function cancelHostOffer(): void {
  haptic(12);
  quietCancel = true;
  net?.send({ t: 'hostOfferCancel' });
}

/** The asked player answers the pending offer. */
export function replyHostOffer(accept: boolean): void {
  haptic(accept ? 20 : 12);
  net?.send({ t: 'hostReply', accept });
}

function onPassAnswer(m: Extract<ServerMsg, { t: 'pass' }>): void {
  // An answer to a code typed in the room, or a refused remembered code after joining.
  const sent = pendingPass ?? helloPass;
  pendingPass = null;
  if (m.ok) {
    if (sent) rememberPass(sent, m.pass);
    passState.value = { s: 'ok', pass: m.pass };
    haptic([20, 30, 20]);
    return;
  }
  if (sent && (m.reason === 'invalid' || m.reason === 'expired')) forgetPass(sent);
  // A remembered code failing quietly in the background is not this phone's business to show.
  if (passState.value.s === 'sending') passState.value = { s: 'error', reason: m.reason };
  helloPass = null;
}

function onPlatform(data: unknown): void {
  if (typeof data !== 'object' || data === null) return;
  const d = data as { k?: string };
  if (d.k === 'page') {
    const p = data as Partial<PlatformState> & { page: PlatformPage };
    const leavingGame = platform.value.page === 'game' && p.page !== 'game' && p.page !== 'results';
    const enteringGame = p.page === 'game' && platform.value.page !== 'game';
    batch(() => {
      platform.value = {
        page: p.page,
        paused: p.paused === true,
        music: p.music !== false,
        sound: p.sound !== false,
        invite: p.invite === true,
        seats: typeof p.seats === 'number' ? p.seats : platform.value.seats,
        ...(p.gameId ? { gameId: p.gameId } : {}),
        ...(p.gameTitle ? { gameTitle: p.gameTitle } : {}),
        ...(Array.isArray(p.recent)
          ? { recent: p.recent.filter((x): x is string => typeof x === 'string').slice(0, 8) }
          : {}),
        ...(typeof p.tab === 'string' ? { tab: p.tab } : {}),
        ...(p.tutorial && Array.isArray(p.tutorial.ready)
          ? { tutorial: { ready: p.tutorial.ready.filter((x): x is number => typeof x === 'number') } }
          : {}),
      };
      if (leavingGame || enteringGame) view.value = null;
    });
  } else if (d.k === 'vibrate') {
    haptic((data as { pattern: number | number[] }).pattern);
  }
}

function onGame(data: unknown): void {
  if (typeof data !== 'object' || data === null) return;
  const d = data as { k?: string; view?: ControllerView; pattern?: number | number[] };
  if (d.k === 'view' && d.view && typeof d.view === 'object') {
    view.value = d.view;
  } else if (d.k === 'vibrate' && d.pattern !== undefined) {
    haptic(d.pattern);
  }
}

/* ------------------------------------------------------------------ outgoing */

export function nav(key: NavKey): void {
  haptic(12);
  net?.send({ t: 'relay', ch: 'p', to: 'screen', data: { k: 'nav', key } });
}

/** The Host tapped a game in the picker: the main screen opens its detail page. */
export function openGame(game: string): void {
  haptic(12);
  net?.send({ t: 'relay', ch: 'p', to: 'screen', data: { k: 'open', game } });
}

/** The Host switched tabs in the picker: the main screen's home row follows. */
export function setScreenTab(tab: string): void {
  haptic(8);
  net?.send({ t: 'relay', ch: 'p', to: 'screen', data: { k: 'tab', tab } });
}

/** Host-only commands from the in-game menu (the screen ignores them from anyone else). */
export function host(cmd: HostCommand): void {
  haptic(12);
  net?.send({ t: 'relay', ch: 'p', to: 'screen', data: { k: 'host', cmd } });
}

/** "Paham!" during a game's tutorial on the main screen. */
export function understood(): void {
  haptic(20);
  net?.send({ t: 'relay', ch: 'p', to: 'screen', data: { k: 'understood' } });
}

export function react(r: Reaction): void {
  haptic(20);
  net?.send({ t: 'relay', ch: 'p', to: 'screen', data: { k: 'react', r } });
}

export function action(id: string, value?: string): void {
  const data: { k: 'action'; id: string; at: number; value?: string } = { k: 'action', id, at: serverNow() };
  if (value !== undefined) data.value = value;
  net?.send({ t: 'relay', ch: 'g', to: 'screen', data });
}

function sendFrame(): void {
  seq = (seq + 1) & 0xffff;
  net?.sendBinary(encodeInput({ seq, buttons: held, taps, at: serverNow() }));
}

/** One tap = one tiny binary frame with a cumulative counter (loss-proof) and its exact time. */
export function tap(): void {
  taps = (taps + 1) & 0xffff;
  sendFrame();
}

/**
 * A discrete press that carries extra bits (a d-pad arrow, a swipe direction): one frame with the
 * counter bumped and `bits` added to the held buttons for that frame only.
 */
export function tapWith(bits: number): number {
  taps = (taps + 1) & 0xffff;
  seq = (seq + 1) & 0xffff;
  net?.sendBinary(encodeInput({ seq, buttons: (held | bits) & 0xffff, taps, at: serverNow() }));
  return taps;
}

/* ------------------------------------------------------------------ joystick (STICK_OP frames) */

/** At most 30 stick frames a second; while deflected the position repeats so a lost frame heals. */
const STICK_MIN_MS = 33;
const STICK_REPEAT_MS = 250;
let stick = 0;
let stickSentAt = 0;
let stickTimer = 0;
let stickRepeat = 0;

function sendStick(): void {
  window.clearTimeout(stickTimer);
  stickTimer = 0;
  seq = (seq + 1) & 0xffff;
  stickSentAt = performance.now();
  net?.sendBinary(encodeInput({ op: STICK_OP, seq, buttons: stick, taps, at: serverNow() }));
}

/** Joystick position, each axis -1..1 (+x right, +y down). Sends only changes, throttled. */
export function setStick(x: number, y: number): void {
  const next = packStick(x, y);
  if (next === stick) return;
  stick = next;
  window.clearInterval(stickRepeat);
  stickRepeat = stick ? window.setInterval(sendStick, STICK_REPEAT_MS) : 0;
  // Releasing is sent at once; movement waits for the throttle window.
  const wait = STICK_MIN_MS - (performance.now() - stickSentAt);
  if (!stick || wait <= 0) sendStick();
  else if (!stickTimer) stickTimer = window.setTimeout(sendStick, wait);
}

/**
 * Held buttons (steering, drift, hold-to-fry). A frame goes out on every change; while
 * something is held it is repeated every 400 ms so a reconnect can't leave a stale state.
 */
export function setHeld(mask: number): void {
  const next = mask & 0xffff;
  if (next === held) return;
  held = next;
  sendFrame();
  window.clearInterval(heldTimer);
  heldTimer = held ? window.setInterval(sendFrame, 400) : 0;
}

// Never leave a button "held" when the phone locks or the tab is hidden.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  setHeld(0);
  setStick(0, 0);
});

export function setVibration(on: boolean): void {
  vibrationOn.value = on;
  prefs.set('vibrate', on);
  if (on) vibrate(30);
}
