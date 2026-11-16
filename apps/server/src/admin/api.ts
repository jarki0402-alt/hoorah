/**
 * `/api/admin/*` on the uWS app: reads the request, checks the session, calls AdminService or
 * AdminAuth, writes JSON. Changing requests must carry `x-hoorah-admin: 1` (with the SameSite
 * cookie, this keeps other sites from acting on a logged-in admin's behalf).
 */
import type * as UWS from 'uWebSockets.js';
import {
  ADMIN_HEADER,
  type AdminError,
  parseAdminLogin,
  parseAdminPassCreate,
  parseAdminPassUpdate,
  parseAdminPasswordChange,
  parseHistoryHours,
  parseUsageDays,
} from '@hoorah/protocol';
import type { Logger } from '../log';
import type { SecurityLog } from '../metrics/security';
import type { CloudflareWatch } from '../metrics/traffic';
import { type AdminAuth, type AdminSession, SESSION_MS } from './auth';
import type { AdminService } from './service';

const COOKIE = 'hoorah_admin';
const BODY_MAX = 4096;
const STATUS: Record<number, string> = {
  200: '200 OK',
  201: '201 Created',
  204: '204 No Content',
  400: '400 Bad Request',
  401: '401 Unauthorized',
  403: '403 Forbidden',
  404: '404 Not Found',
  409: '409 Conflict',
  413: '413 Payload Too Large',
  415: '415 Unsupported Media Type',
  429: '429 Too Many Requests',
  500: '500 Internal Server Error',
};

interface Reply {
  status: number;
  body?: unknown;
  cookie?: string;
}

interface Req {
  ip: string;
  token: string | null;
  json: boolean;
  fromDashboard: boolean;
  https: boolean;
  param: string;
  /** Raw query string (without '?'). */
  query: string;
  /** `cf-ray` or `cf-connecting-ip`: set when Cloudflare's proxy forwarded the request. */
  cloudflare: string;
}

interface Ctx {
  req: Req;
  /** Present on routes that require a login. */
  session: AdminSession;
  body: unknown;
}

export interface AdminApiDeps {
  auth: AdminAuth;
  service: AdminService;
  now: () => number;
  log: Logger;
  /** Sign-ins and password changes go to the dashboard's security log. */
  security?: SecurityLog;
  cloudflare?: CloudflareWatch;
}

const fail = (status: number, error: AdminError): Reply => ({ status, body: { error } });
const decoder = new TextDecoder();

function cookieValue(header: string, name: string): string | null {
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim() || null;
  }
  return null;
}

function sessionCookie(token: string, https: boolean): string {
  return `${COOKIE}=${token}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MS / 1000}${https ? '; Secure' : ''}`;
}

function clearCookie(https: boolean): string {
  return `${COOKIE}=; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=0${https ? '; Secure' : ''}`;
}

/** Everything needed from the request, read synchronously (uWS invalidates `req` after the handler). */
function readReq(res: UWS.HttpResponse, req: UWS.HttpRequest): Req {
  const forwarded = req.getHeader('x-forwarded-for').split(',')[0]?.trim();
  return {
    ip: forwarded || decoder.decode(res.getRemoteAddressAsText()),
    token: cookieValue(req.getHeader('cookie'), COOKIE),
    json: req.getHeader('content-type').toLowerCase().startsWith('application/json'),
    fromDashboard: req.getHeader(ADMIN_HEADER) === '1',
    https: req.getHeader('x-forwarded-proto') === 'https',
    param: req.getParameter(0) ?? '',
    query: req.getQuery() ?? '',
    cloudflare: req.getHeader('cf-ray') || req.getHeader('cf-connecting-ip'),
  };
}

const TOO_LARGE = Symbol('too_large');
const BAD_JSON = Symbol('bad_json');

/** Must be called before the handler returns (uWS drops body chunks that arrive unobserved). */
function readJson(res: UWS.HttpResponse, max: number): Promise<unknown> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    res.onData((chunk, isLast) => {
      if (done) return;
      size += chunk.byteLength;
      if (size > max) {
        done = true;
        resolve(TOO_LARGE);
        return;
      }
      // uWS reuses the chunk's memory after this callback: copy it.
      chunks.push(Buffer.from(chunk.slice(0)));
      if (!isLast) return;
      done = true;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        resolve(BAD_JSON);
      }
    });
  });
}

function send(res: UWS.HttpResponse, reply: Reply): void {
  res.cork(() => {
    res.writeStatus(STATUS[reply.status] ?? '500 Internal Server Error');
    res.writeHeader('cache-control', 'no-store');
    res.writeHeader('x-content-type-options', 'nosniff');
    res.writeHeader('referrer-policy', 'no-referrer');
    if (reply.cookie) res.writeHeader('set-cookie', reply.cookie);
    if (reply.body === undefined) {
      res.end();
      return;
    }
    res.writeHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(reply.body));
  });
}

type Method = 'get' | 'post' | 'patch' | 'del';

export function registerAdminApi(app: UWS.TemplatedApp, deps: AdminApiDeps): void {
  const { auth, service, now, log, security } = deps;

  const route = (
    method: Method,
    pattern: string,
    opts: { login: boolean; body: boolean },
    handler: (ctx: Ctx) => Reply | Promise<Reply>,
  ): void => {
    app[method](pattern, (res, uReq) => {
      let aborted = false;
      res.onAborted(() => {
        aborted = true;
      });
      const req = readReq(res, uReq);
      deps.cloudflare?.note(req.cloudflare, now());
      // Runs synchronously up to readJson, so onData is attached before this handler returns.
      const run = async (): Promise<Reply> => {
        if (method !== 'get' && !req.fromDashboard) return fail(403, 'bad_request');
        let body: unknown;
        if (opts.body) {
          if (!req.json) return fail(415, 'bad_request');
          body = await readJson(res, BODY_MAX);
          if (body === TOO_LARGE) return fail(413, 'bad_request');
          if (body === BAD_JSON) return fail(400, 'bad_request');
        }
        const session = auth.session(req.token, now());
        if (opts.login && !session) return { ...fail(401, 'unauthorized'), cookie: clearCookie(req.https) };
        return handler({ req, session: session as AdminSession, body });
      };
      run().then(
        (reply) => {
          if (!aborted) send(res, reply);
        },
        (err: unknown) => {
          log.error('admin_api_failed', { path: pattern, err: String(err) });
          if (!aborted) send(res, fail(500, 'bad_request'));
        },
      );
    });
  };

  const idOf = (req: Req): number | null => {
    const id = Number(req.param);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  };

  route('post', '/api/admin/login', { login: false, body: true }, async ({ req, body }) => {
    const input = parseAdminLogin(body);
    if (!input) return fail(400, 'bad_request');
    const r = await auth.login(input.username, input.password, req.ip, now());
    if (!r.ok) {
      log.warn('admin_login_failed', { ip: req.ip, reason: r.error });
      security?.record(r.error === 'rate_limited' ? 'login_limited' : 'login_failed', req.ip, now());
      return fail(r.error === 'rate_limited' ? 429 : 401, r.error);
    }
    log.info('admin_login', { username: r.username, ip: req.ip });
    security?.record('login_ok', req.ip, now(), r.username);
    return { status: 200, body: { username: r.username }, cookie: sessionCookie(r.token, req.https) };
  });

  route('post', '/api/admin/logout', { login: false, body: false }, ({ req }) => {
    auth.logout(req.token);
    return { status: 204, cookie: clearCookie(req.https) };
  });

  route('get', '/api/admin/me', { login: true, body: false }, ({ session }) => ({
    status: 200,
    body: { username: session.username },
  }));

  route('post', '/api/admin/password', { login: true, body: true }, async ({ req, session, body }) => {
    const input = parseAdminPasswordChange(body);
    if (!input) return fail(400, 'bad_request');
    const r = await auth.changePassword(session, input.current, input.next, now());
    if (r === 'wrong_password') security?.record('password_failed', req.ip, now(), session.username);
    if (r !== 'ok') return fail(400, r);
    log.info('admin_password_changed', { username: session.username });
    security?.record('password_changed', req.ip, now(), session.username);
    return { status: 204 };
  });

  route('get', '/api/admin/passes', { login: true, body: false }, () => ({
    status: 200,
    body: { passes: service.listPasses() },
  }));

  route('post', '/api/admin/passes', { login: true, body: true }, ({ session, body }) => {
    const input = parseAdminPassCreate(body);
    if (!input) return fail(400, 'bad_request');
    const r = service.createPass(input, session.adminId);
    if (typeof r === 'string') return fail(r === 'code_taken' ? 409 : r === 'not_found' ? 404 : 400, r);
    log.info('pass_created', { passId: r.id, by: session.username, expiresAt: r.expiresAt });
    return { status: 201, body: { pass: r } };
  });

  route('patch', '/api/admin/passes/:id', { login: true, body: true }, ({ req, session, body }) => {
    const id = idOf(req);
    if (id === null) return fail(404, 'not_found');
    const input = parseAdminPassUpdate(body);
    if (!input) return fail(400, 'bad_request');
    const r = service.updatePass(id, input);
    if (typeof r === 'string') return fail(r === 'not_found' ? 404 : 400, r);
    log.info('pass_updated', { passId: id, by: session.username, fields: Object.keys(input) });
    return { status: 200, body: { pass: r } };
  });

  route('del', '/api/admin/passes/:id', { login: true, body: false }, ({ req, session }) => {
    const id = idOf(req);
    if (id === null || !service.deletePass(id)) return fail(404, 'not_found');
    log.info('pass_deleted', { passId: id, by: session.username });
    return { status: 204 };
  });

  route('get', '/api/admin/rooms', { login: true, body: false }, () => ({
    status: 200,
    body: { rooms: service.rooms() },
  }));

  route('get', '/api/admin/stats', { login: true, body: false }, () => ({
    status: 200,
    body: service.stats(),
  }));

  route('get', '/api/admin/system', { login: true, body: false }, async () => {
    const body = await service.system();
    return body ? { status: 200, body } : fail(404, 'not_found');
  });

  route('get', '/api/admin/system/history', { login: true, body: false }, ({ req }) => {
    const body = service.history(parseHistoryHours(new URLSearchParams(req.query).get('hours')));
    return body ? { status: 200, body } : fail(404, 'not_found');
  });

  route('get', '/api/admin/egress', { login: true, body: false }, async () => {
    const body = await service.egress();
    return body ? { status: 200, body } : fail(404, 'not_found');
  });

  route('get', '/api/admin/usage', { login: true, body: false }, ({ req }) => {
    const body = service.usage(parseUsageDays(new URLSearchParams(req.query).get('days')));
    return body ? { status: 200, body } : fail(404, 'not_found');
  });

  route('get', '/api/admin/events', { login: true, body: false }, () => ({
    status: 200,
    body: { events: service.events() },
  }));
}
