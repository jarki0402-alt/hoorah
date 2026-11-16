/**
 * Admin dashboard API (`/api/admin/*`), shared by the server and the `/admin/` page.
 * Bodies are JSON; the session is an httpOnly cookie; every request that changes something also
 * carries the `x-hoorah-admin: 1` header (a cross-site page cannot send it without CORS).
 */
import { LIMITS } from './constants';
import { isPassCode, normalizePassCode } from './pass';

export const ADMIN_HEADER = 'x-hoorah-admin';
export const ADMIN_USERNAME_MAX = 32;
export const ADMIN_PASSWORD_MIN = 10;
export const ADMIN_PASSWORD_MAX = 200;
export const PASS_LABEL_MAX = 60;
/** A pass may run at most this long (the trial hands out short ones). */
export const PASS_MAX_DURATION_MS = 366 * 24 * 60 * 60_000;
/** A pass opens at least one seat more than a free room. */
export const PASS_MIN_PLAYERS = LIMITS.freePlayers + 1;
export const PASS_MAX_ROOMS = 50;

export type PassStatus = 'active' | 'expired' | 'revoked';

export interface AdminPass {
  id: number;
  code: string;
  label: string;
  maxPlayers: number;
  /** Rooms that may use the pass at the same time; null = no limit. */
  maxRooms: number | null;
  expiresAt: number;
  revokedAt: number | null;
  createdAt: number;
  status: PassStatus;
  /** Rooms using it right now. */
  liveRooms: number;
  /** Rooms that have ever used it. */
  roomsUsed: number;
  /** Most players seen in one room with this pass. */
  peakPlayers: number;
  lastUsedAt: number | null;
}

export interface AdminPassCreate {
  label: string;
  /** Omitted: the server generates one. */
  code?: string;
  expiresAt: number;
  maxPlayers: number;
  maxRooms: number | null;
}

export interface AdminPassUpdate {
  label?: string;
  expiresAt?: number;
  maxPlayers?: number;
  maxRooms?: number | null;
  revoked?: boolean;
}

export interface AdminRoom {
  code: string;
  screenOnline: boolean;
  /** Seats taken, including players whose phone dropped and whose seat is still held. */
  players: number;
  connected: number;
  maxPlayers: number;
  /** Page on the main screen ('home', 'game', ...), when known. */
  page: string | null;
  gameId: string | null;
  pass: { id: number; code: string; expiresAt: number } | null;
  createdAt: number;
  lastActivity: number;
}

export interface AdminStats {
  startedAt: number;
  uptimeSec: number;
  rssMb: number;
  heapUsedMb: number;
  rooms: number;
  players: number;
  sockets: number;
  node: string;
  dbKb: number;
}

/* ------------------------------------------------------------------ Monitoring */

/** Live counts of the relay, read when the dashboard asks (no history). */
export interface AdminLive {
  /** Rooms whose main screen is connected right now. */
  screens: number;
  /** Phones connected right now. */
  phones: number;
  rooms: number;
  /** Seats taken, including phones that dropped and whose seat is still held. */
  players: number;
  /** Phones talking to their screen over a direct WebRTC link (the rest go through the server). */
  direct: number;
  sockets: number;
  /** Bytes the server sent over WebSockets per second, averaged over the last half minute. */
  relayBytesPerSec: number;
}

/** The VM and the server process now (`GET /api/admin/system`). Sizes are bytes. */
export interface AdminSystem {
  at: number;
  host: {
    memTotalBytes: number;
    memAvailableBytes: number;
    swapTotalBytes: number;
    swapUsedBytes: number;
    /** Load average over 1, 5 and 15 minutes. */
    load: [number, number, number];
    cpus: number;
    uptimeSec: number;
    /** False when /proc/meminfo could not be read (not Linux) and Node's own numbers stand in. */
    fromProc: boolean;
  };
  disk: { totalBytes: number; freeBytes: number } | null;
  process: {
    rssBytes: number;
    heapUsedBytes: number;
    heapTotalBytes: number;
    startedAt: number;
    uptimeSec: number;
    node: string;
  };
  database: { bytes: number; tables: { name: string; rows: number }[] };
  live: AdminLive;
}

/** Ranges of the "Riwayat" chart, in hours. */
export const SYSTEM_HISTORY_HOURS = [24, 168, 336] as const;
export type SystemHistoryHours = (typeof SYSTEM_HISTORY_HOURS)[number];

/** One bucket of the 5-minute system samples. Fractions are 0 to 1 (load may pass 1). */
export interface AdminSystemSample {
  at: number;
  ram: number | null;
  /** Load average per CPU core. */
  load: number | null;
  disk: number | null;
  rssBytes: number;
  /** Most players / phones / screens seen in the bucket. */
  players: number;
  phones: number;
  screens: number;
  /** Bytes the VM's network card sent in the bucket; null where it could not be read. */
  txBytes: number | null;
  /** Bytes the server itself sent over WebSockets in the bucket. */
  relayBytes: number;
}

export interface AdminSystemHistory {
  hours: SystemHistoryHours;
  bucketSec: number;
  samples: AdminSystemSample[];
}

export type FreeTierCheckId = 'ram' | 'disk';

/** Everything the VM sent out (`GET /api/admin/egress`), from the host's network card counters. */
export interface AdminEgress {
  /** The card could be read at the last sample. */
  available: boolean;
  iface: string | null;
  /** First reading ever; null = never measured (no host /sys mounted). */
  measuredSince: number | null;
  /** Free Standard-tier internet egress per month for the billing account. */
  freeBytes: number;
  /** Billing month, cut in Google's Pacific time. */
  month: { start: number; end: number; txBytes: number; rxBytes: number };
  /** `complete` is false when measuring began after that month started. */
  previous: { start: number; end: number; txBytes: number; complete: boolean };
  /** Average per day over the last 7 days (or since measuring began, when shorter). */
  perDayBytes: number;
  /** Days the average above covers (0 to 7). */
  paceDays: number;
  /** This month so far plus the average for the days left. */
  projectedBytes: number;
  /** Days in Asia/Jakarta. */
  today: { txBytes: number; rxBytes: number };
  yesterday: { txBytes: number };
  /** The last 14 Jakarta days, oldest first, empty ones as 0. `day` is YYYY-MM-DD. */
  daily: { day: string; start: number; txBytes: number; rxBytes: number }[];
  /** Requests that came through Cloudflare's proxy (orange cloud); `active` = seen in the last 24 h. */
  cloudflare: { seenAt: number | null; active: boolean };
  /** Always Free limits the VM must stay within; `ok` is null when it could not be read. */
  freeTier: { id: FreeTierCheckId; ok: boolean | null; bytes: number | null; limitBytes: number }[];
}

/** Ranges of the "Pemakaian" tab, in days. */
export const USAGE_DAYS = [1, 7, 30] as const;
export type UsageDays = (typeof USAGE_DAYS)[number];

export interface AdminUsageTotals {
  roomsCreated: number;
  gameStarts: number;
  /** Players in the room summed over every game start (average = this / gameStarts). */
  startPlayers: number;
  roomsClosed: number;
  /** Lifetime of the closed rooms, summed. */
  roomSeconds: number;
  /** Closed rooms that had at least one player, and the most players each had, summed. */
  roomsPlayed: number;
  roomPlayers: number;
  passActivations: number;
}

export interface AdminUsagePoint {
  /** Start of the hour (1 day) or of the Jakarta day (7 and 30 days). */
  at: number;
  roomsCreated: number;
  gameStarts: number;
  startPlayers: number;
}

/** Aggregated use, no names or codes (`GET /api/admin/usage?days=`). */
export interface AdminUsage {
  days: UsageDays;
  bucket: 'hour' | 'day';
  from: number;
  to: number;
  series: AdminUsagePoint[];
  /** Game starts by weekday (Monday first) and hour, Asia/Jakarta: 7 rows of 24. */
  heatmap: number[][];
  totals: AdminUsageTotals;
  /** Most played first. */
  games: { gameId: string; plays: number; players: number }[];
}

export type AdminEventKind =
  | 'login_ok'
  | 'login_failed'
  | 'login_limited'
  | 'password_changed'
  | 'password_failed'
  | 'pass_wrong'
  | 'pass_limited';

/** Security log entry; repeats of the same kind from one address in one minute are counted together. */
export interface AdminEvent {
  id: number;
  at: number;
  kind: AdminEventKind;
  ip: string;
  count: number;
  /** Admin username for sign-ins and password changes; null otherwise. */
  detail: string | null;
}

/** `?hours=` of the history request; anything else falls back to 24. */
export function parseHistoryHours(raw: string | null | undefined): SystemHistoryHours {
  const n = Number(raw);
  return (SYSTEM_HISTORY_HOURS as readonly number[]).includes(n) ? (n as SystemHistoryHours) : 24;
}

/** `?days=` of the usage request; anything else falls back to 7. */
export function parseUsageDays(raw: string | null | undefined): UsageDays {
  const n = Number(raw);
  return (USAGE_DAYS as readonly number[]).includes(n) ? (n as UsageDays) : 7;
}

export interface AdminMe {
  username: string;
}

export type AdminError =
  | 'unauthorized'
  | 'invalid_login'
  | 'rate_limited'
  | 'bad_request'
  | 'not_found'
  | 'code_taken'
  | 'wrong_password'
  | 'weak_password'
  | 'expired_time';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** Single line, no control characters or angle brackets, trimmed to `max` characters. */
export function sanitizeLabel(raw: string, max = PASS_LABEL_MAX): string {
  // Line breaks and tabs become spaces first, so "Main\nbareng" keeps its word gap.
  const cleaned = raw
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point.
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim();
  return Array.from(cleaned).slice(0, max).join('');
}

const isSeats = (v: unknown): v is number => isInt(v) && v >= PASS_MIN_PLAYERS && v <= LIMITS.maxPlayers;
const isMaxRooms = (v: unknown): v is number | null =>
  v === null || (isInt(v) && v >= 1 && v <= PASS_MAX_ROOMS);
const isTime = (v: unknown): v is number => isInt(v) && v > 0;

/** Validates a create body (shape only; the server checks the time against its own clock). */
export function parseAdminPassCreate(v: unknown): AdminPassCreate | null {
  if (!isObj(v) || typeof v.label !== 'string') return null;
  const label = sanitizeLabel(v.label);
  if (!label || !isTime(v.expiresAt) || !isSeats(v.maxPlayers) || !isMaxRooms(v.maxRooms)) return null;
  const out: AdminPassCreate = {
    label,
    expiresAt: v.expiresAt,
    maxPlayers: v.maxPlayers,
    maxRooms: v.maxRooms,
  };
  if (v.code !== undefined && v.code !== '') {
    if (typeof v.code !== 'string') return null;
    const code = normalizePassCode(v.code);
    if (!isPassCode(code)) return null;
    out.code = code;
  }
  return out;
}

/** Validates an update body; at least one field must be present. */
export function parseAdminPassUpdate(v: unknown): AdminPassUpdate | null {
  if (!isObj(v)) return null;
  const out: AdminPassUpdate = {};
  if (v.label !== undefined) {
    if (typeof v.label !== 'string') return null;
    const label = sanitizeLabel(v.label);
    if (!label) return null;
    out.label = label;
  }
  if (v.expiresAt !== undefined) {
    if (!isTime(v.expiresAt)) return null;
    out.expiresAt = v.expiresAt;
  }
  if (v.maxPlayers !== undefined) {
    if (!isSeats(v.maxPlayers)) return null;
    out.maxPlayers = v.maxPlayers;
  }
  if (v.maxRooms !== undefined) {
    if (!isMaxRooms(v.maxRooms)) return null;
    out.maxRooms = v.maxRooms;
  }
  if (v.revoked !== undefined) {
    if (typeof v.revoked !== 'boolean') return null;
    out.revoked = v.revoked;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function parseAdminLogin(v: unknown): { username: string; password: string } | null {
  if (!isObj(v) || typeof v.username !== 'string' || typeof v.password !== 'string') return null;
  const username = v.username.trim();
  if (!username || username.length > ADMIN_USERNAME_MAX) return null;
  if (!v.password || v.password.length > ADMIN_PASSWORD_MAX) return null;
  return { username, password: v.password };
}

export function parseAdminPasswordChange(v: unknown): { current: string; next: string } | null {
  if (!isObj(v) || typeof v.current !== 'string' || typeof v.next !== 'string') return null;
  if (!v.current || v.current.length > ADMIN_PASSWORD_MAX || v.next.length > ADMIN_PASSWORD_MAX) return null;
  return { current: v.current, next: v.next };
}

/** Usernames: letters, digits, dot, dash, underscore. */
export function isAdminUsername(v: string): boolean {
  return /^[A-Za-z0-9._-]{3,32}$/.test(v);
}

export function isStrongPassword(v: string): boolean {
  return v.length >= ADMIN_PASSWORD_MIN && v.length <= ADMIN_PASSWORD_MAX;
}
