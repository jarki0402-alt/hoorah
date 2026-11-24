import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  isPremium,
  isScreenId,
  parseAppConfig,
  parseErrorInput,
  parseReportInput,
} from './access';
import { PASS_MAX_BATCH, parseAdminPassCreate } from './admin';
import { parseClientMsg } from './validate';

const SCREEN = 'layar-utama-0123456789';

describe('screen id and trial messages', () => {
  it('keeps a valid screen id in the screen hello and drops a malformed one', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'hello', role: 'screen', v: 1, screen: SCREEN }))).toEqual({
      t: 'hello',
      role: 'screen',
      v: 1,
      screen: SCREEN,
    });
    const resume = { code: '482917', token: 'token-0123456789ab' };
    expect(
      parseClientMsg(JSON.stringify({ t: 'hello', role: 'screen', v: 1, resume, screen: SCREEN })),
    ).toEqual({ t: 'hello', role: 'screen', v: 1, resume, screen: SCREEN });
    for (const screen of ['pendek', 'a'.repeat(65), 'ada spasi di sini 123', 42, null]) {
      const msg = parseClientMsg(JSON.stringify({ t: 'hello', role: 'screen', v: 1, screen }));
      expect(msg).toEqual({ t: 'hello', role: 'screen', v: 1 });
    }
    expect(
      parseClientMsg(JSON.stringify({ t: 'hello', role: 'screen', v: 1, resume: { code: 'x' } })),
    ).toBeNull();
  });

  it('accepts the trial request', () => {
    expect(parseClientMsg('{"t":"trial"}')).toEqual({ t: 'trial' });
    expect(parseClientMsg('{"t":"trial","minutes":999}')).toEqual({ t: 'trial' });
  });

  it('recognises screen ids', () => {
    expect(isScreenId(SCREEN)).toBe(true);
    expect(isScreenId('a'.repeat(15))).toBe(false);
    expect(isScreenId(undefined)).toBe(false);
  });
});

describe('access and settings', () => {
  it('treats every kind but free as premium', () => {
    expect(isPremium({ kind: 'free', until: null, trialUsed: true })).toBe(false);
    expect(isPremium({ kind: 'trial', until: 1, trialUsed: true })).toBe(true);
    expect(isPremium({ kind: 'open', until: null, trialUsed: false })).toBe(true);
    expect(isPremium(null)).toBe(false);
  });

  it('parses settings against a base, clamping numbers and keeping valid fields only', () => {
    expect(parseAppConfig(null)).toEqual(DEFAULT_CONFIG);
    const base = { ...DEFAULT_CONFIG, weeklyGame: 'ludo' };
    expect(
      parseAppConfig({ openAll: true, adSeconds: 99, trialMinutes: 1, weeklyGame: '<x>' }, base),
    ).toEqual({
      ...base,
      openAll: true,
      adSeconds: 30,
      trialMinutes: 10,
    });
    expect(parseAppConfig({ weeklyGame: null, adEveryGames: 3.4 }, base)).toMatchObject({
      weeklyGame: null,
      adEveryGames: 3,
    });
  });
});

describe('reports and device errors', () => {
  const context = {
    role: 'controller',
    version: 'abc123',
    userAgent: 'Mozilla/5.0',
    rtt: 210.6,
    room: '482917',
  };

  it('accepts a report with its context and trims the contact', () => {
    expect(
      parseReportInput({ kind: 'teknis', text: '  Layar macet  ', contact: '  0812 ', context }),
    ).toEqual({
      kind: 'teknis',
      text: 'Layar macet',
      contact: '0812',
      context: { role: 'controller', version: 'abc123', userAgent: 'Mozilla/5.0', rtt: 211, room: '482917' },
    });
    expect(parseReportInput({ kind: 'saran', text: 'Tambah game', contact: '', context })).toMatchObject({
      contact: null,
    });
  });

  it('refuses reports with an unknown kind, too little or too much text, or no context', () => {
    expect(parseReportInput({ kind: 'spam', text: 'halo halo', context })).toBeNull();
    expect(parseReportInput({ kind: 'teknis', text: 'ya', context })).toBeNull();
    expect(parseReportInput({ kind: 'teknis', text: 'x'.repeat(1001), context })).toBeNull();
    expect(parseReportInput({ kind: 'teknis', text: 'halo halo' })).toBeNull();
    expect(parseReportInput({ kind: 'teknis', text: 'halo halo', context: { role: 'tv' } })).toBeNull();
    expect(parseReportInput('teks')).toBeNull();
  });

  it('accepts errors with a message, cutting long fields', () => {
    const e = parseErrorInput({ message: 'x'.repeat(400), stack: 's'.repeat(3000), context });
    expect(e?.message).toHaveLength(300);
    expect(e?.stack).toHaveLength(2000);
    expect(parseErrorInput({ message: 'boom', context })).toMatchObject({ stack: null });
    expect(parseErrorInput({ message: '   ', context })).toBeNull();
    expect(parseErrorInput({ message: 'boom' })).toBeNull();
  });
});

describe('pass kinds in the create body', () => {
  const ok = { label: 'Pembeli', expiresAt: 2_000_000_000_000, maxPlayers: 16, maxRooms: null };

  it('defaults to shared and ignores single/promo fields there', () => {
    expect(parseAdminPassCreate({ ...ok, durationDays: 30, count: 9 })).toEqual({ ...ok, kind: 'shared' });
    expect(parseAdminPassCreate({ ...ok, kind: 'vip' })).toBeNull();
  });

  it('needs a run length for single and promo codes', () => {
    expect(parseAdminPassCreate({ ...ok, kind: 'single' })).toBeNull();
    expect(parseAdminPassCreate({ ...ok, kind: 'single', durationDays: 0 })).toBeNull();
    expect(parseAdminPassCreate({ ...ok, kind: 'single', durationDays: 367 })).toBeNull();
    expect(parseAdminPassCreate({ ...ok, kind: 'single', durationDays: 30 })).toEqual({
      ...ok,
      kind: 'single',
      durationDays: 30,
      count: 1,
    });
  });

  it('makes single codes in batches without a chosen code', () => {
    expect(parseAdminPassCreate({ ...ok, kind: 'single', durationDays: 7, count: 50 })).toMatchObject({
      count: 50,
    });
    expect(
      parseAdminPassCreate({ ...ok, kind: 'single', durationDays: 7, count: PASS_MAX_BATCH + 1 }),
    ).toBeNull();
    expect(
      parseAdminPassCreate({ ...ok, kind: 'single', durationDays: 7, count: 2, code: 'BELI1' }),
    ).toBeNull();
    expect(
      parseAdminPassCreate({ ...ok, kind: 'single', durationDays: 7, count: 1, code: 'BELI1' }),
    ).toMatchObject({ code: 'BELI1' });
  });

  it('limits promo uses', () => {
    const promo = { ...ok, kind: 'promo', durationDays: 3 };
    expect(parseAdminPassCreate(promo)).toEqual({ ...promo, maxUses: null });
    expect(parseAdminPassCreate({ ...promo, maxUses: 100 })).toMatchObject({ maxUses: 100 });
    expect(parseAdminPassCreate({ ...promo, maxUses: 0 })).toBeNull();
    expect(parseAdminPassCreate({ ...promo, maxUses: 1.5 })).toBeNull();
  });
});
