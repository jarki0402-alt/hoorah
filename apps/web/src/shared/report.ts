/**
 * "Laporkan masalah" and automatic error logs, shared by the main screen and the phones.
 *
 * - `buildContext` collects what the owner would otherwise have to ask for (app version, browser,
 *   viewport, page, game, room, latency, link).
 * - `sendReport` posts a player's report to `POST /api/report`.
 * - `installErrorReporter` sends uncaught errors and unhandled rejections to `POST /api/errors`,
 *   each distinct message once per page load and at most `ERRORS_PER_LOAD` in all.
 */
import {
  type ClientContext,
  ERROR_MESSAGE_MAX,
  ERROR_STACK_MAX,
  type ErrorInput,
  type ReportInput,
} from '@hoorah/protocol';

export type ClientRole = ClientContext['role'];

/** Context fields the caller knows (the rest is filled in here). */
export type ContextExtra = Partial<Pick<ClientContext, 'page' | 'gameId' | 'room' | 'rtt' | 'link'>>;

export const ERRORS_PER_LOAD = 10;
const REPORT_TIMEOUT_MS = 8000;
const ERROR_TIMEOUT_MS = 5000;

/** The build's version (vite.config.ts `define`); 'dev' when not built by Vite (unit tests). */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

/** Flag icon path (24×24 viewBox) for the "Laporkan masalah" buttons. */
export const FLAG_ICON_PATH = 'M5 21V4m0 0h11l-2 4 2 4H5';

export interface EnvInfo {
  userAgent: string;
  width: number;
  height: number;
}

function browserEnv(): EnvInfo {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const w = typeof window !== 'undefined' ? window.innerWidth : 0;
  const h = typeof window !== 'undefined' ? window.innerHeight : 0;
  return { userAgent: ua, width: w, height: h };
}

/** The `link` attribute the WebRTC code sets on <html> (`direct` or `relay`), if any. */
export function currentLink(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  return document.documentElement.dataset.link || undefined;
}

/** A complete context: fixed device facts plus whatever the caller knows right now. */
export function buildContext(
  role: ClientRole,
  extra: ContextExtra = {},
  env: EnvInfo = browserEnv(),
): ClientContext {
  const ctx: ClientContext = { role, version: APP_VERSION, userAgent: env.userAgent.slice(0, 300) };
  if (env.width > 0 && env.height > 0) ctx.viewport = `${Math.round(env.width)}x${Math.round(env.height)}`;
  if (extra.page) ctx.page = extra.page.slice(0, 24);
  if (extra.gameId) ctx.gameId = extra.gameId.slice(0, 24);
  if (extra.room) ctx.room = extra.room.slice(0, 12);
  if (extra.link) ctx.link = extra.link.slice(0, 12);
  if (typeof extra.rtt === 'number' && Number.isFinite(extra.rtt) && extra.rtt > 0) {
    ctx.rtt = Math.round(extra.rtt);
  }
  return ctx;
}

/** POST JSON with keepalive and a timeout; resolves to the status, or 0 when it never arrived. */
async function postJson(path: string, body: unknown, timeoutMs: number): Promise<number> {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
      credentials: 'same-origin',
      ...(ctrl ? { signal: ctrl.signal } : {}),
    });
    return res.status;
  } catch {
    return 0;
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

export type ReportResult = 'ok' | 'invalid' | 'limited' | 'failed';

export async function sendReport(input: ReportInput): Promise<ReportResult> {
  const status = await postJson('/api/report', input, REPORT_TIMEOUT_MS);
  if (status >= 200 && status < 300) return 'ok';
  if (status === 400) return 'invalid';
  if (status === 429) return 'limited';
  return 'failed';
}

export async function sendError(input: ErrorInput): Promise<boolean> {
  const status = await postJson('/api/errors', input, ERROR_TIMEOUT_MS);
  return status >= 200 && status < 300;
}

/* ------------------------------------------------------------------ error reporter */

/** Browser noise that says nothing about our code. */
const IGNORED = [/^Script error\.?$/i, /ResizeObserver loop/i];

/** Message and stack of anything thrown or rejected. */
export function describeError(err: unknown): { message: string; stack: string | null } {
  if (err instanceof Error) {
    const message = `${err.name && err.name !== 'Error' ? `${err.name}: ` : ''}${err.message}`;
    return { message, stack: typeof err.stack === 'string' ? err.stack : null };
  }
  if (typeof err === 'string') return { message: err, stack: null };
  try {
    return { message: JSON.stringify(err) ?? String(err), stack: null };
  } catch {
    return { message: String(err), stack: null };
  }
}

export interface ErrorReporter {
  /** Reports one error (deduped by message, capped per page load). */
  capture(err: unknown, extra?: ContextExtra): void;
  /** How many reports were sent this page load. */
  readonly sent: number;
}

export function createErrorReporter(
  role: ClientRole,
  getExtra: () => ContextExtra,
  send: (input: ErrorInput) => Promise<boolean> = sendError,
  max: number = ERRORS_PER_LOAD,
): ErrorReporter {
  const seen = new Set<string>();
  let sent = 0;
  return {
    capture(err, extra) {
      const d = describeError(err);
      const message = d.message.trim().slice(0, ERROR_MESSAGE_MAX);
      if (!message || IGNORED.some((re) => re.test(message))) return;
      if (seen.has(message) || sent >= max) return;
      seen.add(message);
      sent++;
      let base: ContextExtra = {};
      try {
        base = getExtra();
      } catch {
        // Reporting must never throw itself.
      }
      void send({
        message,
        stack: d.stack ? d.stack.slice(0, ERROR_STACK_MAX) : null,
        context: buildContext(role, { ...base, ...extra }),
      }).catch(() => {});
    },
    get sent() {
      return sent;
    },
  };
}

/** Listens for uncaught errors and unhandled rejections on `target`; returns the disposer. */
export function listenForErrors(target: EventTarget, onError: (err: unknown) => void): () => void {
  const onErr = (e: Event) => {
    const ev = e as Partial<ErrorEvent>;
    if (ev.error !== undefined && ev.error !== null) onError(ev.error);
    else if (typeof ev.message === 'string' && ev.message) {
      const where = ev.filename ? ` (${ev.filename}:${ev.lineno ?? 0}:${ev.colno ?? 0})` : '';
      onError(`${ev.message}${where}`);
    }
  };
  const onRejection = (e: Event) => {
    const reason = (e as Partial<PromiseRejectionEvent>).reason;
    onError(reason instanceof Error ? reason : `Unhandled rejection: ${describeError(reason).message}`);
  };
  target.addEventListener('error', onErr);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onErr);
    target.removeEventListener('unhandledrejection', onRejection);
  };
}

let active: ErrorReporter | null = null;

/**
 * Installs this page's error reporter on `target` (the window). Only the first call installs;
 * later calls return the same reporter.
 */
export function installErrorReporter(
  role: ClientRole,
  getExtra: () => ContextExtra,
  target: EventTarget = window,
): ErrorReporter {
  if (active) return active;
  const reporter = createErrorReporter(role, getExtra);
  listenForErrors(target, (err) => reporter.capture(err));
  active = reporter;
  return reporter;
}

/** Reports an error through the installed reporter (no-op before `installErrorReporter`). */
export function reportError(err: unknown, extra?: ContextExtra): void {
  active?.capture(err, extra);
}
