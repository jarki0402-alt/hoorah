/**
 * Free tier, Hoorah Pass and the free trial (owner decisions 2026-11-23), shared by the server, the
 * main screen, the phones and the admin dashboard.
 *
 * - A room is `free` (2 players, the free games), `trial` (60 minutes once per main screen: every
 *   game, Mode Pesta, up to the Pass seats, no ads), `pass` (a Hoorah Pass: the same until it ends)
 *   or `open` (the admin's "Mode uji coba: semua terbuka" switch: everything, no ads).
 * - The main screen is recognised by a random id it keeps in its browser (`screen` in its hello),
 *   so a single-use Pass code and the trial stay with that screen across rooms.
 * - Which games are free and the promo breaks between games are decided on the main screen from
 *   `AppConfig`; the server only says what the room has (`RoomAccess`).
 */

/** What a room has. */
export type AccessKind = 'free' | 'trial' | 'pass' | 'open';

export interface RoomAccess {
  kind: AccessKind;
  /** Epoch ms when a trial or Pass ends; null for free and open. */
  until: number | null;
  /** This main screen already used its free trial (the offer then only shows the Pass code). */
  trialUsed: boolean;
}

export const FREE_ACCESS: RoomAccess = { kind: 'free', until: null, trialUsed: false };

/** Paid-for features are on: every game, Mode Pesta, more than two players, no promo breaks. */
export function isPremium(a: RoomAccess | null | undefined): boolean {
  return a !== null && a !== undefined && a.kind !== 'free';
}

/** Settings the owner changes in the admin dashboard without a deploy. */
export interface AppConfig {
  /** "Mode uji coba: semua terbuka": every room is `open` (all games, no ads). */
  openAll: boolean;
  /** Promo breaks between games for free rooms. */
  adsEnabled: boolean;
  /** Length of one break, seconds (cannot be skipped). */
  adSeconds: number;
  /** A break comes before the next game once this many games have finished since the last one. */
  adEveryGames: number;
  /** At least this many minutes between two breaks. */
  adMinGapMin: number;
  /** Length of the free trial, minutes. */
  trialMinutes: number;
  /** "Game Minggu Ini" chosen by the owner (a game id); null = automatic weekly rotation. */
  weeklyGame: string | null;
}

export const DEFAULT_CONFIG: AppConfig = {
  openAll: false,
  adsEnabled: true,
  adSeconds: 15,
  adEveryGames: 2,
  adMinGapMin: 10,
  trialMinutes: 60,
  weeklyGame: null,
};

/** Bounds the dashboard and the server keep every number in. */
export const CONFIG_LIMITS = {
  adSeconds: [5, 30],
  adEveryGames: [1, 10],
  adMinGapMin: [0, 120],
  trialMinutes: [10, 240],
} as const;

const GAME_ID = /^[a-z0-9]{2,24}$/;

function clampInt(v: unknown, [lo, hi]: readonly [number, number], fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

/** A full, valid config from anything (missing or broken fields fall back to `base`). */
export function parseAppConfig(v: unknown, base: AppConfig = DEFAULT_CONFIG): AppConfig {
  const m = typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
  return {
    openAll: typeof m.openAll === 'boolean' ? m.openAll : base.openAll,
    adsEnabled: typeof m.adsEnabled === 'boolean' ? m.adsEnabled : base.adsEnabled,
    adSeconds: clampInt(m.adSeconds, CONFIG_LIMITS.adSeconds, base.adSeconds),
    adEveryGames: clampInt(m.adEveryGames, CONFIG_LIMITS.adEveryGames, base.adEveryGames),
    adMinGapMin: clampInt(m.adMinGapMin, CONFIG_LIMITS.adMinGapMin, base.adMinGapMin),
    trialMinutes: clampInt(m.trialMinutes, CONFIG_LIMITS.trialMinutes, base.trialMinutes),
    weeklyGame:
      m.weeklyGame === null
        ? null
        : typeof m.weeklyGame === 'string' && GAME_ID.test(m.weeklyGame)
          ? m.weeklyGame
          : base.weeklyGame,
  };
}

/** The main screen's id in its hello: random, kept in its browser. */
export const SCREEN_ID_RE = /^[A-Za-z0-9_-]{16,64}$/;

export function isScreenId(v: unknown): v is string {
  return typeof v === 'string' && SCREEN_ID_RE.test(v);
}

/** Why the free trial did not start. */
export type TrialReject = 'used' | 'rate_limited' | 'not_free';

/* ---------------- Reports ("Laporkan masalah", `POST /api/report`) ---------------- */

export const REPORT_KINDS = ['teknis', 'pass', 'saran', 'lainnya'] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
export const REPORT_TEXT_MAX = 1000;
export const REPORT_CONTACT_MAX = 100;

/** Technical context sent along automatically, so the owner never has to ask "which phone?". */
export interface ClientContext {
  role: 'screen' | 'controller';
  /** App build (commit) the device runs. */
  version: string;
  userAgent: string;
  page?: string;
  gameId?: string;
  room?: string;
  /** Round trip to the server, ms. */
  rtt?: number;
  /** `direct` (WebRTC on the same Wi-Fi) or `relay`. */
  link?: string;
  /** Viewport, e.g. "412x915". */
  viewport?: string;
}

export interface ReportInput {
  kind: ReportKind;
  text: string;
  /** Optional WhatsApp number or e-mail to reply to. */
  contact: string | null;
  context: ClientContext;
}

/** Errors that happen on a device (`POST /api/errors`), grouped by message in the dashboard. */
export interface ErrorInput {
  message: string;
  stack: string | null;
  context: ClientContext;
}

export const ERROR_MESSAGE_MAX = 300;
export const ERROR_STACK_MAX = 2000;

function str(v: unknown, max: number): string | null {
  return typeof v === 'string' ? v.slice(0, max) : null;
}

function parseContext(v: unknown): ClientContext | null {
  if (typeof v !== 'object' || v === null) return null;
  const m = v as Record<string, unknown>;
  if (m.role !== 'screen' && m.role !== 'controller') return null;
  const ctx: ClientContext = {
    role: m.role,
    version: str(m.version, 40) ?? '',
    userAgent: str(m.userAgent, 300) ?? '',
  };
  const page = str(m.page, 24);
  const gameId = str(m.gameId, 24);
  const room = str(m.room, 12);
  const link = str(m.link, 12);
  const viewport = str(m.viewport, 16);
  if (page) ctx.page = page;
  if (gameId) ctx.gameId = gameId;
  if (room) ctx.room = room;
  if (link) ctx.link = link;
  if (viewport) ctx.viewport = viewport;
  if (typeof m.rtt === 'number' && Number.isFinite(m.rtt)) ctx.rtt = Math.max(0, Math.round(m.rtt));
  return ctx;
}

export function parseReportInput(v: unknown): ReportInput | null {
  if (typeof v !== 'object' || v === null) return null;
  const m = v as Record<string, unknown>;
  if (!(REPORT_KINDS as readonly unknown[]).includes(m.kind)) return null;
  const text = typeof m.text === 'string' ? m.text.trim() : '';
  if (text.length < 3 || text.length > REPORT_TEXT_MAX) return null;
  const contact = typeof m.contact === 'string' ? m.contact.trim().slice(0, REPORT_CONTACT_MAX) : '';
  const context = parseContext(m.context);
  if (!context) return null;
  return { kind: m.kind as ReportKind, text, contact: contact || null, context };
}

export function parseErrorInput(v: unknown): ErrorInput | null {
  if (typeof v !== 'object' || v === null) return null;
  const m = v as Record<string, unknown>;
  const message = typeof m.message === 'string' ? m.message.trim().slice(0, ERROR_MESSAGE_MAX) : '';
  if (!message) return null;
  const context = parseContext(m.context);
  if (!context) return null;
  return { message, stack: str(m.stack, ERROR_STACK_MAX), context };
}
