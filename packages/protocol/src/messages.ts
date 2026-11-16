import type { Fruit } from './constants';
import type { PassReject, RoomPass } from './pass';

export interface PlayerInfo {
  id: number;
  name: string;
  fruit: Fruit;
  color: string;
  connected: boolean;
  isHost: boolean;
}

/**
 * `p` = platform shell traffic, `g` = game traffic (via the SDK), `r` = WebRTC set-up between the
 * main screen and one phone (see RtcSignal).
 */
export type Channel = 'p' | 'g' | 'r';
export type RelayTarget = number | 'all' | 'screen';

export type ClientMsg =
  | { t: 'hello'; role: 'screen'; v: number; resume?: { code: string; token: string } }
  | {
      t: 'hello';
      role: 'controller';
      v: number;
      code: string;
      name: string;
      fruit: Fruit;
      token?: string;
      /** A Hoorah Pass code this phone remembers: opens the room's seats on the way in. */
      pass?: string;
    }
  | { t: 'relay'; ch: Channel; to: RelayTarget; data: unknown }
  /** Enter a Hoorah Pass code for the room (any phone in it, or the main screen). */
  | { t: 'pass'; code: string }
  /**
   * Main screen only: what it shows now, for the admin dashboard (page traffic itself may go direct).
   * `direct`: phones linked to the screen over WebRTC right now (sent again whenever it changes).
   */
  | { t: 'status'; page: PlatformPage; gameId: string | null; direct?: number }
  | { t: 'ping'; id: number; ct: number }
  | { t: 'host'; id: number }
  | { t: 'kick'; id: number }
  | { t: 'leave' };

export type ErrorCode =
  | 'version'
  | 'room_not_found'
  | 'room_full'
  | 'bad_request'
  | 'rate_limited'
  | 'session_replaced'
  | 'room_closed'
  | 'not_allowed'
  /** The room is full and the pass code given on the way in did not open it. */
  | 'pass_invalid'
  | 'pass_expired'
  | 'pass_busy';

export type ServerMsg =
  | {
      t: 'welcome';
      role: 'screen';
      code: string;
      token: string;
      players: PlayerInfo[];
      maxPlayers: number;
      pass: RoomPass | null;
      resumed: boolean;
    }
  | {
      t: 'welcome';
      role: 'controller';
      code: string;
      id: number;
      token: string;
      players: PlayerInfo[];
      maxPlayers: number;
      pass: RoomPass | null;
      screenOnline: boolean;
      resumed: boolean;
    }
  | { t: 'players'; players: PlayerInfo[] }
  /** Seats or pass of the room changed (pass entered, extended, ended). */
  | { t: 'room'; maxPlayers: number; pass: RoomPass | null }
  /** Answer to the sender's pass code (also sent after joining when a remembered code failed). */
  | { t: 'pass'; ok: true; pass: RoomPass }
  | { t: 'pass'; ok: false; reason: PassReject }
  | { t: 'relay'; ch: Channel; from: number; data: unknown }
  | { t: 'pong'; id: number; ct: number; st: number }
  | { t: 'screen'; online: boolean }
  | { t: 'error'; code: ErrorCode; fatal: boolean }
  | { t: 'kicked' };

/* ---------------- Nearby screens (`GET /api/nearby`) ---------------- */

/**
 * A main screen on the same network as the asking phone (same public address), so the phone can
 * offer "join this one" without scanning. Only names and fruits already shown on that screen.
 */
export interface NearbyRoom {
  code: string;
  players: { name: string; fruit: Fruit; color: string }[];
  seatsLeft: number;
}

/* ---------------- WebRTC set-up channel (`r`) ---------------- */

/**
 * The main screen offers each phone a direct link on the same Wi-Fi (WebRTC data channels); the
 * relay only carries this set-up. `gen` ties an answer to its offer. Complete SDP (no trickle ICE).
 */
export type RtcSignal =
  | { k: 'offer'; gen: number; sdp: string }
  | { k: 'answer'; gen: number; sdp: string }
  | { k: 'hangup'; gen: number };

/** Validates an RtcSignal received over the relay. */
export function parseRtcSignal(v: unknown): RtcSignal | null {
  if (typeof v !== 'object' || v === null) return null;
  const m = v as Record<string, unknown>;
  if (typeof m.gen !== 'number' || !Number.isInteger(m.gen) || m.gen < 0) return null;
  if (m.k === 'hangup') return { k: 'hangup', gen: m.gen };
  if (
    (m.k === 'offer' || m.k === 'answer') &&
    typeof m.sdp === 'string' &&
    m.sdp.length > 0 &&
    m.sdp.length < 7000
  ) {
    return { k: m.k, gen: m.gen, sdp: m.sdp };
  }
  return null;
}

/* ---------------- Platform channel (`p`) ---------------- */

export const PLATFORM_PAGES = ['join', 'home', 'detail', 'loading', 'game', 'results'] as const;
export type PlatformPage = (typeof PLATFORM_PAGES)[number];

export type PlatformToController =
  | {
      k: 'page';
      page: PlatformPage;
      gameId?: string;
      gameTitle?: string;
      paused?: boolean;
      /** Main-screen settings and state, mirrored in the in-game menu on the phones. */
      music?: boolean;
      sound?: boolean;
      /** The main screen shows the join QR ("Tambah pemain"). */
      invite?: boolean;
      /** Seats in this Room (2 free, 16 with Hoorah Pass). */
      seats?: number;
      /** Recently played games, most recent first (the Host's game picker lists them first). */
      recent?: string[];
      /** Tab of the game list on the main screen's home ('fit' or a category id). */
      tab?: string;
    }
  | { k: 'reaction'; from: number; r: Reaction }
  | { k: 'vibrate'; pattern: number | number[] };

export type NavKey = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back' | 'menu' | 'home';
export const NAV_KEYS: readonly NavKey[] = ['up', 'down', 'left', 'right', 'ok', 'back', 'menu', 'home'];
export type Reaction = 'cheer' | 'clap' | 'boo' | 'rematch';

/** What the Host's in-game menu (the pill at the top of the phone) asks the main screen to do. */
export const HOST_COMMANDS = [
  'pause',
  'resume',
  'restart',
  'quit',
  'invite-on',
  'invite-off',
  'music-on',
  'music-off',
  'sound-on',
  'sound-off',
] as const;
export type HostCommand = (typeof HOST_COMMANDS)[number];

export type ControllerToPlatform =
  | { k: 'nav'; key: NavKey }
  /** The Host picked a game in the phone's game list: the main screen opens its detail page. */
  | { k: 'open'; game: string }
  /** The Host switched tabs in the phone's game list: the main screen's home row follows. */
  | { k: 'tab'; tab: string }
  | { k: 'react'; r: Reaction }
  | { k: 'start' }
  | { k: 'host'; cmd: HostCommand };

/* ---------------- Game channel (`g`) ---------------- */

export interface ViewStat {
  label: string;
  value: string;
}

export interface ViewAction {
  id: string;
  label: string;
  style?: 'primary' | 'secondary' | 'yellow';
}

/** A crane/pendulum the controller can animate locally from server time. */
export interface SwingIndicator {
  /** Server time (ms) when phase 0 started. */
  start: number;
  /** Full period in ms. */
  period: number;
  /** Half-width of the PAS zone as a fraction of the swing (0..1). */
  zone: number;
  /** Caption above the track; defaults to Rusun's crane caption. */
  label?: string;
}

/**
 * Input bits for the `drive` view, sent in the binary frame's `buttons` field while held.
 * The `taps` counter goes up once per press of the item button (loss-proof); the `buttons` of
 * that same frame say whether REM was held, which games use to throw the item backwards.
 */
export const DRIVE_LEFT = 1;
export const DRIVE_RIGHT = 2;
export const DRIVE_GAS = 4;
export const DRIVE_BRAKE = 8;

/**
 * Input of the `gesture` view, all in the binary frame:
 * - tap:   `taps` +1 per tap on the pad (chop, pound, sprinkle).
 * - stir:  `taps` +1 per quarter turn of the finger around the ring; GESTURE_HOLD while touching.
 * - swipe: `taps` +1 per swipe in `dir` (swipes in other directions are ignored on the phone).
 * - hold:  GESTURE_HOLD while the finger is down; the frame's `at` dates the press and the release.
 */
export const GESTURE_HOLD = 1;

/**
 * Input of the `pad` view, all in the binary frame's `buttons`:
 * - steer: PAD_LEFT / PAD_RIGHT while that half is held, PAD_ACTION while the action button is held.
 * - dpad:  every press of an arrow bumps `taps`; that frame's `buttons` holds the arrow's bit
 *          (exactly one of PAD_UP/DOWN/LEFT/RIGHT). Read the direction from the frame whose taps rose.
 * - swipe: every swipe bumps `taps` with its direction bit in that frame's `buttons`; a tap
 *          without movement sends PAD_ACTION the same way.
 */
export const PAD_LEFT = 1;
export const PAD_RIGHT = 2;
export const PAD_UP = 4;
export const PAD_DOWN = 8;
export const PAD_ACTION = 16;
export const PAD_DIRS = PAD_LEFT | PAD_RIGHT | PAD_UP | PAD_DOWN;

/**
 * A right-thumb button of the `pad` view in `stick` mode (up to 3).
 * - `tap`: every press sends `action(id)` over the reliable game channel (never lost).
 * - `hold`: PAD_ACTION in INPUT_OP frames while pressed (at most one per view), e.g. chop.
 */
export interface PadButton {
  id: string;
  label: string;
  /** Small second line, e.g. "tahan" or "atau taruh". */
  sub?: string;
  icon: PadButtonIcon;
  tone: 'yellow' | 'orange' | 'cream';
  press: 'tap' | 'hold';
  /** The main button is drawn larger and sits nearest the thumb. */
  big?: boolean;
}
export type PadButtonIcon = 'hand' | 'knife' | 'throw' | 'zap';

export type DriveItemIcon = 'boost' | 'oil' | 'horn' | 'shield' | 'durian' | 'firecracker' | 'box';
export type GestureIcon = 'knife' | 'spoon' | 'pan' | 'hand' | 'fire' | 'shaker' | 'pestle' | 'roll';

/** One entry of a `menu` view. */
export interface MenuOption {
  id: string;
  label: string;
  /** Second line, e.g. "Semua pemain + lawan CPU". */
  sub?: string;
  /** Accent colour; in the `swatch` layout it fills the whole tile. */
  color?: string;
  /** Small tag, e.g. who already took this colour. */
  badge?: string;
  disabled?: boolean;
}

/** One side of a `chess` view: who plays it (a player, or a whole team in team mode). */
export interface ChessSide {
  /** Shown next to the clock, e.g. a name or "Tim Putih". */
  label: string;
  /** Players on this side (avatars). */
  ids: number[];
}

/**
 * Chess clock of a `chess` view: `w`/`b` are the ms each side had left at server time `at`.
 * The side in `run` is ticking (counted down locally on the phone); null = stopped.
 */
export interface ChessClock {
  w: number;
  b: number;
  run: 'w' | 'b' | null;
  at: number;
}

/** A move proposed by a team in a `chess` view's vote. */
export interface ChessVote {
  /** UCI move, e.g. "e2e4". */
  move: string;
  count: number;
}

/** Board squares of a `chess` view: 64 FEN letters from a8 to h1, '.' for an empty square. */
export const CHESS_BOARD = /^[pnbrqkPNBRQK.]{64}$/;
/** A move in UCI form: from, to, optional promotion piece ("e2e4", "e7e8q"). */
export const CHESS_MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

/**
 * A computer opponent (negative id) that a view mentions. Phones only know room players, so a view
 * that shows an opponent's avatar lists it here to draw its fruit and colour (PRD 6.4).
 */
export interface GuestPlayer {
  id: number;
  name: string;
  fruit: Fruit;
  color: string;
}

/** Declarative controller screens. Games describe *what*, the controller app decides *how*. */
export type ControllerView = ControllerViewBody & {
  /** Computer opponents mentioned by ids in this view (avatars), see `GuestPlayer`. */
  guests?: GuestPlayer[];
};

type ControllerViewBody =
  | {
      kind: 'message';
      title: string;
      subtitle?: string;
      eyebrow?: string;
      avatarOf?: number;
      tone?: 'neutral' | 'good' | 'bad' | 'warn';
      stats?: ViewStat[];
      actions?: ViewAction[];
      /**
       * Waiting for someone else's turn: the phone offers the platform reactions (cheer, boo),
       * shown as bubbles with the player's fruit on the main screen. The game never sees them.
       */
      reactions?: boolean;
    }
  | {
      kind: 'choice';
      title: string;
      prompt?: string;
      progress?: { done: number; total: number };
      deadline?: number;
      streak?: number;
      options: { id: string; label: string; color: string; dark: string }[];
    }
  | {
      kind: 'locked';
      label: string;
      key: string;
      color: string;
      dark: string;
      title: string;
      chips: string[];
      waitingFor?: number[];
    }
  | {
      kind: 'button';
      eyebrow: string;
      title: string;
      label: string;
      hint?: string;
      deadline?: number;
      swing?: SwingIndicator;
    }
  | {
      kind: 'tap';
      teamName: string;
      teamColor: string;
      label: string;
      round: string;
      ring?: { start: number; period: number };
      rate?: string;
      power?: number;
      combo?: number;
      lead?: string;
    }
  | {
      kind: 'countdown';
      value: string;
      title: string;
      subtitle?: string;
      color: string;
      opponents?: number[];
    }
  | {
      /**
       * A pre-game menu (mode, map, colour). Tapping an option sends `action('pick', id)` and can
       * be repeated to change the choice; `confirm`/`back` send `action(id)`. The game echoes the
       * choice back in `selected` and mirrors the menu on the main screen.
       */
      kind: 'menu';
      eyebrow?: string;
      title: string;
      hint?: string;
      /** `list`: rows with a second line. `swatch`: colour tiles in a grid. */
      layout?: 'list' | 'swatch';
      options: MenuOption[];
      selected?: string;
      confirm?: ViewAction;
      back?: ViewAction;
      /** Someone else is choosing: show the options read-only with `waiting`. */
      locked?: boolean;
      waiting?: string;
    }
  | {
      /** Kart controls: hold left/right to steer, hold GAS/REM, tap the item button. */
      kind: 'drive';
      /** The player's kart colour. */
      color: string;
      /** Short status, e.g. "Posisi 2/6". */
      place: string;
      /** e.g. "Putaran 2/3". */
      lap: string;
      /** Item ready to use; null or absent = none. */
      item?: { icon: DriveItemIcon; name: string } | null;
      hint?: string;
      /** Disable the controls (e.g. during the countdown or after finishing). */
      locked?: boolean;
    }
  | {
      /** One cooking-style gesture on the phone; the TV judges it. */
      kind: 'gesture';
      mode: 'tap' | 'stir' | 'swipe' | 'hold';
      eyebrow: string;
      title: string;
      hint: string;
      color: string;
      icon?: GestureIcon;
      /** swipe: the direction to swipe. */
      dir?: 'up' | 'down' | 'left' | 'right';
      /** 0..1, drawn as a progress bar (the TV is authoritative). */
      progress?: number;
      deadline?: number;
      /** Disable input (e.g. while the TV shows the result of the step). */
      locked?: boolean;
    }
  | {
      /**
       * A tappable chessboard. Tap a piece, its legal targets light up, tap one: the phone sends
       * `action('move', uci)` (with a promotion picker when needed). Only moves listed in
       * `moves` can be sent, so the phone never proposes an illegal move.
       */
      kind: 'chess';
      /** See CHESS_BOARD. */
      board: string;
      /** Colour drawn at the bottom of the phone (the player's own colour). */
      side: 'w' | 'b';
      /** Side to move. */
      turn: 'w' | 'b';
      /** Legal UCI moves this phone may send now; absent or empty = watch only. */
      moves?: string[];
      /** Last move played (UCI), highlighted. */
      last?: string;
      /** Square of the king in check, e.g. "e1". */
      check?: string;
      players: { w: ChessSide; b: ChessSide };
      clock?: ChessClock;
      /** Short status line on top, e.g. "GILIRANMU". */
      eyebrow: string;
      hint?: string;
      /** Team mode: the team's proposals so far, and this phone's own. */
      votes?: ChessVote[];
      myVote?: string;
      /** Team mode: server time the vote closes. */
      deadline?: number;
      /** Extra buttons under the board, e.g. resign. Ids starting with "resign" ask to confirm first. */
      actions?: ViewAction[];
      /** Board shown but no input (intro, game over). */
      locked?: boolean;
    }
  | {
      /**
       * Directional controls (see PAD_*). `steer`: hold the left or right half to turn, hold the
       * action button (e.g. boost). `dpad`: four big arrows, one press = one turn. `swipe`: swipe
       * anywhere to change lane, jump or duck (arrow buttons as a fallback).
       */
      kind: 'pad';
      /**
       * `stick`: an analog joystick (STICK_OP frames, any direction) plus an optional held action
       * button on the other thumb (PAD_ACTION in INPUT_OP frames).
       */
      mode: 'steer' | 'dpad' | 'swipe' | 'stick';
      /** The player's colour. */
      color: string;
      /** Short status line, e.g. "Panjang 42" or "Wilayah 18%". */
      title: string;
      eyebrow?: string;
      /** Up to 3 small chips under the title (rank, score, time). */
      stats?: ViewStat[];
      /** Label of the action button (steer) or of a tap (swipe), e.g. "NGEBUT". Absent = no action. */
      actionLabel?: string;
      /** `stick` mode: up to 3 buttons on the right thumb instead of the single action button. */
      buttons?: PadButton[];
      /** What the player holds, shown as a chip in the status row ("Dibawa: Tomat"). */
      carry?: { label: string; color: string };
      /** A callout that does not block input, e.g. "Siap tangkap!" (`yellow`) or a warning (`red`). */
      alert?: { title: string; body?: string; tone: 'yellow' | 'red' };
      hint?: string;
      /** Shown over the controls while input is off, e.g. "Hidup lagi dalam 3…". */
      banner?: string;
      /** Disable input (countdown, knocked out, finished). */
      locked?: boolean;
    }
  | {
      /**
       * Word entry with the controller's own letter keyboard (A–Z, no system keyboard). Submitting
       * sends `action('word', text)` with the full word, `prefix` included.
       */
      kind: 'word';
      eyebrow: string;
      title: string;
      /** Fixed start of the word, shown locked in the input (e.g. the syllable to continue from). */
      prefix?: string;
      hint?: string;
      /** Server time the turn ends. */
      deadline?: number;
      lives?: { left: number; total: number };
      /** Longest word accepted, prefix included (default 20). */
      maxLength?: number;
      /** Someone else's turn: input shown but disabled. */
      locked?: boolean;
      /** Why the last word was refused, shown in red until the next view. */
      error?: string;
      /** Changes on every new turn (and refusal) so the phone clears the typed letters. */
      turn: number;
    }
  | {
      kind: 'result';
      tone: 'win' | 'lose' | 'good' | 'bad' | 'neutral';
      title: string;
      big?: string;
      subtitle?: string;
      chips?: string[];
      stats?: ViewStat[];
      streak?: { done: number; total: number; label: string };
      actions?: ViewAction[];
    };

export type GameToController =
  | { k: 'view'; view: ControllerView }
  | { k: 'vibrate'; pattern: number | number[] };

export type ControllerToGame = { k: 'action'; id: string; value?: string; at: number };
