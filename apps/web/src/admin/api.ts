/**
 * Typed client for `/api/admin/*`. The session lives in an httpOnly cookie; every request that
 * changes something carries the dashboard header, or the server answers 403.
 */
import {
  ADMIN_HEADER,
  type AdminEgress,
  type AdminError,
  type AdminEvent,
  type AdminMe,
  type AdminPass,
  type AdminPassCreate,
  type AdminPassUpdate,
  type AdminRoom,
  type AdminStats,
  type AdminSystem,
  type AdminSystemHistory,
  type AdminUsage,
  type SystemHistoryHours,
  type UsageDays,
} from '@hoorah/protocol';
import type { ErrorCode } from './strings';

const BASE = '/api/admin';
const TIMEOUT_MS = 15_000;

const KNOWN_ERRORS: ReadonlySet<string> = new Set<AdminError>([
  'unauthorized',
  'invalid_login',
  'rate_limited',
  'bad_request',
  'not_found',
  'code_taken',
  'wrong_password',
  'weak_password',
  'expired_time',
]);

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
  ) {
    super(`admin api ${status} ${code}`);
    this.name = 'ApiError';
  }
}

/** The error code to show for anything a call throws. */
export function errorCode(err: unknown): ErrorCode {
  return err instanceof ApiError ? err.code : 'network';
}

let onUnauthorized: () => void = () => {};

/** Called on any 401 outside the login call: the session is gone. */
export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function codeFrom(status: number, body: unknown): ErrorCode {
  if (isObj(body) && typeof body.error === 'string' && KNOWN_ERRORS.has(body.error)) {
    // A 500 also answers bad_request; it is not the admin's input that failed.
    return status >= 500 ? 'server' : (body.error as AdminError);
  }
  if (status === 401) return 'unauthorized';
  if (status === 429) return 'rate_limited';
  if (status === 404) return 'not_found';
  return status >= 500 ? 'server' : 'bad_request';
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

async function request(method: Method, path: string, body?: unknown): Promise<unknown> {
  const headers: Record<string, string> = {};
  if (method !== 'GET') headers[ADMIN_HEADER] = '1';
  if (body !== undefined) headers['content-type'] = 'application/json';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  let data: unknown = null;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: ctrl.signal,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (res.status !== 204) {
      const text = await res.text();
      if (text) {
        try {
          data = JSON.parse(text) as unknown;
        } catch {
          data = null;
        }
      }
    }
  } catch {
    throw new ApiError(0, 'network');
  } finally {
    clearTimeout(timer);
  }
  if (res.ok) return data;
  if (res.status === 401 && path !== '/login') onUnauthorized();
  throw new ApiError(res.status, codeFrom(res.status, data));
}

/** Light shape checks: the server is ours, but a proxy error page must not crash the page. */
function shape<T>(ok: boolean, value: unknown): T {
  if (!ok) throw new ApiError(200, 'server');
  return value as T;
}

const isPass = (v: unknown): v is AdminPass =>
  isObj(v) &&
  typeof v.id === 'number' &&
  typeof v.code === 'string' &&
  typeof v.label === 'string' &&
  typeof v.expiresAt === 'number' &&
  typeof v.status === 'string';

const isRoom = (v: unknown): v is AdminRoom =>
  isObj(v) && typeof v.code === 'string' && typeof v.players === 'number';

function passOf(data: unknown): AdminPass {
  const pass = isObj(data) ? data.pass : undefined;
  return shape<AdminPass>(isPass(pass), pass);
}

export const api = {
  async me(): Promise<AdminMe> {
    const data = await request('GET', '/me');
    return shape<AdminMe>(isObj(data) && typeof data.username === 'string', data);
  },

  async login(username: string, password: string): Promise<AdminMe> {
    const data = await request('POST', '/login', { username, password });
    return shape<AdminMe>(isObj(data) && typeof data.username === 'string', data);
  },

  async logout(): Promise<void> {
    await request('POST', '/logout');
  },

  async changePassword(current: string, next: string): Promise<void> {
    await request('POST', '/password', { current, next });
  },

  async passes(): Promise<AdminPass[]> {
    const data = await request('GET', '/passes');
    const list = isObj(data) ? data.passes : undefined;
    return shape<AdminPass[]>(Array.isArray(list) && list.every(isPass), list);
  },

  async createPass(input: AdminPassCreate): Promise<AdminPass> {
    return passOf(await request('POST', '/passes', input));
  },

  async updatePass(id: number, input: AdminPassUpdate): Promise<AdminPass> {
    return passOf(await request('PATCH', `/passes/${id}`, input));
  },

  async deletePass(id: number): Promise<void> {
    await request('DELETE', `/passes/${id}`);
  },

  async rooms(): Promise<AdminRoom[]> {
    const data = await request('GET', '/rooms');
    const list = isObj(data) ? data.rooms : undefined;
    return shape<AdminRoom[]>(Array.isArray(list) && list.every(isRoom), list);
  },

  async stats(): Promise<AdminStats> {
    const data = await request('GET', '/stats');
    return shape<AdminStats>(
      isObj(data) && typeof data.rssMb === 'number' && typeof data.uptimeSec === 'number',
      data,
    );
  },

  async system(): Promise<AdminSystem> {
    const data = await request('GET', '/system');
    return shape<AdminSystem>(
      isObj(data) && isObj(data.host) && isObj(data.process) && isObj(data.live),
      data,
    );
  },

  async history(hours: SystemHistoryHours): Promise<AdminSystemHistory> {
    const data = await request('GET', `/system/history?hours=${hours}`);
    return shape<AdminSystemHistory>(isObj(data) && Array.isArray(data.samples), data);
  },

  async egress(): Promise<AdminEgress> {
    const data = await request('GET', '/egress');
    return shape<AdminEgress>(isObj(data) && isObj(data.month) && Array.isArray(data.daily), data);
  },

  async usage(days: UsageDays): Promise<AdminUsage> {
    const data = await request('GET', `/usage?days=${days}`);
    return shape<AdminUsage>(
      isObj(data) && Array.isArray(data.series) && Array.isArray(data.heatmap) && isObj(data.totals),
      data,
    );
  },

  async events(): Promise<AdminEvent[]> {
    const data = await request('GET', '/events');
    const list = isObj(data) ? data.events : undefined;
    return shape<AdminEvent[]>(Array.isArray(list), list);
  },
};
