import { ERROR_MESSAGE_MAX, type ErrorInput, parseErrorInput, parseReportInput } from '@hoorah/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  APP_VERSION,
  buildContext,
  createErrorReporter,
  describeError,
  ERRORS_PER_LOAD,
  listenForErrors,
  sendReport,
} from './report';

const ENV = { userAgent: 'Mozilla/5.0 (Linux; Android 14)', width: 412.4, height: 915 };

function mockFetch(status: number) {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

function sentBodies(fn: ReturnType<typeof mockFetch>): ErrorInput[] {
  return fn.mock.calls.map((c) => JSON.parse(String(c[1]?.body)) as ErrorInput);
}

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildContext', () => {
  it('fills the device facts and keeps only known extras', () => {
    const ctx = buildContext(
      'controller',
      { page: 'game', gameId: 'bom', room: '482917', rtt: 183.6, link: 'direct' },
      ENV,
    );
    expect(ctx).toEqual({
      role: 'controller',
      version: APP_VERSION,
      userAgent: ENV.userAgent,
      viewport: '412x915',
      page: 'game',
      gameId: 'bom',
      room: '482917',
      rtt: 184,
      link: 'direct',
    });
  });

  it('drops empty and unknown values', () => {
    const ctx = buildContext(
      'screen',
      { page: '', rtt: 0, room: undefined },
      { userAgent: '', width: 0, height: 0 },
    );
    expect(ctx).toEqual({ role: 'screen', version: APP_VERSION, userAgent: '' });
  });

  it('is accepted by the server parser', () => {
    const context = buildContext('screen', { page: 'home', room: '123456' }, ENV);
    const report = parseReportInput({ kind: 'teknis', text: 'Layar macet', contact: null, context });
    expect(report?.context).toEqual(context);
  });
});

describe('sendReport', () => {
  it('posts JSON with keepalive and maps the status', async () => {
    const fn = mockFetch(204);
    const input = {
      kind: 'saran' as const,
      text: 'Tambah game',
      contact: null,
      context: buildContext('controller', {}, ENV),
    };
    expect(await sendReport(input)).toBe('ok');
    const [url, init] = fn.mock.calls[0]!;
    expect(url).toBe('/api/report');
    expect(init?.method).toBe('POST');
    expect(init?.keepalive).toBe(true);
    expect(JSON.parse(String(init?.body))).toEqual(input);
    mockFetch(429);
    expect(await sendReport(input)).toBe('limited');
    mockFetch(400);
    expect(await sendReport(input)).toBe('invalid');
    mockFetch(500);
    expect(await sendReport(input)).toBe('failed');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('offline'))),
    );
    expect(await sendReport(input)).toBe('failed');
  });
});

describe('error reporter', () => {
  it('sends each distinct message once per page load', async () => {
    const fn = mockFetch(204);
    const rep = createErrorReporter('screen', () => ({ page: 'game', room: '482917' }));
    rep.capture(new Error('boom'));
    rep.capture(new Error('boom'));
    rep.capture(new TypeError('x is undefined'), { gameId: 'bom' });
    await flush();
    expect(fn).toHaveBeenCalledTimes(2);
    const [a, b] = sentBodies(fn);
    expect(a?.message).toBe('boom');
    expect(a?.context.room).toBe('482917');
    expect(b?.message).toBe('TypeError: x is undefined');
    expect(b?.context.gameId).toBe('bom');
    expect(fn.mock.calls[0]?.[0]).toBe('/api/errors');
    expect(parseErrorInput(a)).not.toBeNull();
  });

  it(`stops after ${ERRORS_PER_LOAD} sends`, async () => {
    const fn = mockFetch(204);
    const rep = createErrorReporter('controller', () => ({}));
    for (let i = 0; i < 25; i++) rep.capture(new Error(`err ${i}`));
    await flush();
    expect(fn).toHaveBeenCalledTimes(ERRORS_PER_LOAD);
    expect(rep.sent).toBe(ERRORS_PER_LOAD);
  });

  it('ignores browser noise and trims long messages', async () => {
    const fn = mockFetch(204);
    const rep = createErrorReporter('screen', () => ({}));
    rep.capture('Script error.');
    rep.capture('ResizeObserver loop completed with undelivered notifications.');
    rep.capture('a'.repeat(ERROR_MESSAGE_MAX + 50));
    await flush();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sentBodies(fn)[0]?.message).toHaveLength(ERROR_MESSAGE_MAX);
  });

  it('never throws when sending fails or getExtra throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('offline'))),
    );
    const rep = createErrorReporter('screen', () => {
      throw new Error('no store');
    });
    expect(() => rep.capture(new Error('boom'))).not.toThrow();
    await flush();
    expect(rep.sent).toBe(1);
  });

  it('hears window errors and unhandled rejections', () => {
    const target = new EventTarget();
    const got: unknown[] = [];
    const off = listenForErrors(target, (e) => got.push(e));
    const err = new Error('thrown');
    target.dispatchEvent(Object.assign(new Event('error'), { error: err }));
    target.dispatchEvent(
      Object.assign(new Event('error'), { message: 'Uncaught x', filename: 'a.js', lineno: 3, colno: 9 }),
    );
    target.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: 'nope' }));
    off();
    target.dispatchEvent(Object.assign(new Event('error'), { error: err }));
    expect(got).toEqual([err, 'Uncaught x (a.js:3:9)', 'Unhandled rejection: nope']);
  });
});

describe('describeError', () => {
  it('handles errors, strings and objects', () => {
    expect(describeError(new RangeError('r')).message).toBe('RangeError: r');
    expect(describeError('s')).toEqual({ message: 's', stack: null });
    expect(describeError({ a: 1 }).message).toBe('{"a":1}');
  });
});
