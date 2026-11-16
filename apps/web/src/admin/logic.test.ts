import type { AdminPass } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { DAY, HOUR, MINUTE } from './format';
import {
  countByStatus,
  effectiveStatus,
  endOfDay,
  extendEnd,
  filterPasses,
  isValidEnd,
  memoryFill,
  memoryLevel,
  presetEnd,
  upsertPass,
} from './logic';

/** Monday 16 November 2026, 14.23.17 local time. */
const NOW = new Date(2026, 10, 16, 14, 23, 17).getTime();

const pass = (over: Partial<AdminPass>): AdminPass => ({
  id: 1,
  code: 'SABTU16',
  label: 'Main bareng',
  maxPlayers: 16,
  maxRooms: null,
  expiresAt: NOW + DAY,
  revokedAt: null,
  createdAt: NOW - DAY,
  status: 'active',
  liveRooms: 0,
  roomsUsed: 0,
  peakPlayers: 0,
  lastUsedAt: null,
  ...over,
});

describe('presetEnd', () => {
  it('runs hour presets exactly, up to the next whole minute', () => {
    expect(presetEnd('3h', NOW)).toBe(new Date(2026, 10, 16, 17, 24).getTime());
  });

  it('runs day presets to 23.59 of the last day', () => {
    expect(presetEnd('1d', NOW)).toBe(new Date(2026, 10, 17, 23, 59).getTime());
    expect(presetEnd('3d', NOW)).toBe(new Date(2026, 10, 19, 23, 59).getTime());
    expect(presetEnd('7d', NOW)).toBe(new Date(2026, 10, 23, 23, 59).getTime());
    expect(presetEnd('30d', NOW)).toBe(new Date(2026, 11, 16, 23, 59).getTime());
  });

  it('keeps every preset inside the window the server accepts', () => {
    for (const p of ['3h', '1d', '3d', '7d', '30d'] as const)
      expect(isValidEnd(presetEnd(p, NOW), NOW)).toBe(true);
  });

  it('crosses month ends', () => {
    expect(endOfDay(new Date(2026, 10, 30, 9, 0).getTime(), 1)).toBe(new Date(2026, 11, 1, 23, 59).getTime());
  });
});

describe('extendEnd', () => {
  it('adds to the current end while the pass still runs', () => {
    expect(extendEnd(NOW + 2 * HOUR, '3h', NOW)).toBe(NOW + 5 * HOUR);
    expect(extendEnd(NOW + 2 * HOUR, '7d', NOW)).toBe(NOW + 2 * HOUR + 7 * DAY);
  });

  it('adds to now once the pass has run out', () => {
    expect(extendEnd(NOW - 5 * DAY, '1d', NOW)).toBe(NOW + DAY);
  });
});

describe('isValidEnd', () => {
  it('wants at least a minute ahead and at most 366 days', () => {
    expect(isValidEnd(NOW + 30_000, NOW)).toBe(false);
    expect(isValidEnd(NOW + MINUTE, NOW)).toBe(true);
    expect(isValidEnd(NOW + 366 * DAY, NOW)).toBe(true);
    expect(isValidEnd(NOW + 367 * DAY, NOW)).toBe(false);
    expect(isValidEnd(Number.NaN, NOW)).toBe(false);
  });
});

describe('statuses and filters', () => {
  const list = [
    pass({ id: 3 }),
    pass({ id: 2, expiresAt: NOW - 1, status: 'active' }),
    pass({ id: 1, status: 'revoked', revokedAt: NOW - HOUR }),
    pass({ id: 4, expiresAt: NOW - DAY, status: 'expired' }),
  ];

  it('treats an active pass past its end as expired', () => {
    expect(effectiveStatus(list[1] as AdminPass, NOW)).toBe('expired');
    expect(effectiveStatus(list[0] as AdminPass, NOW)).toBe('active');
  });

  it('counts and filters by that status', () => {
    expect(countByStatus(list, NOW)).toEqual({ active: 1, expired: 2, revoked: 1 });
    expect(filterPasses(list, 'expired', NOW).map((p) => p.id)).toEqual([2, 4]);
    expect(filterPasses(list, 'all', NOW)).toHaveLength(4);
  });

  it('replaces a pass in place or puts a new one first', () => {
    const changed = upsertPass(list, pass({ id: 1, status: 'active' }));
    expect(changed.map((p) => p.id)).toEqual([3, 2, 1, 4]);
    expect(changed[2]?.status).toBe('active');
    expect(upsertPass(list, pass({ id: 9 })).map((p) => p.id)).toEqual([9, 3, 2, 1, 4]);
  });
});

describe('memory', () => {
  it('turns yellow above 250 MB and red above 300 MB', () => {
    expect(memoryLevel(120)).toBe('ok');
    expect(memoryLevel(250)).toBe('ok');
    expect(memoryLevel(251)).toBe('warn');
    expect(memoryLevel(301)).toBe('over');
  });

  it('fills the bar against the 300 MB target', () => {
    expect(memoryFill(150)).toBe(0.5);
    expect(memoryFill(450)).toBe(1);
    expect(memoryFill(-1)).toBe(0);
  });
});
