import type { AdminPass } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { csvCell, csvDateTime, csvFileName, PASS_CSV_HEADER, passesCsv, toCsv } from './csv';
import { DAY } from './format';
import { CSV_KINDS } from './strings';

/** Monday 23 November 2026, 14.05 local time. */
const NOW = new Date(2026, 10, 23, 14, 5, 9).getTime();
const END = new Date(2027, 1, 21, 23, 59).getTime();

const pass = (over: Partial<AdminPass>): AdminPass => ({
  id: 1,
  code: 'K7M2P9QX',
  label: 'Toko Sabtu',
  kind: 'single',
  durationMs: 30 * DAY,
  maxUses: null,
  uses: 0,
  firstStartedAt: null,
  lastRunsUntil: null,
  maxPlayers: 16,
  maxRooms: null,
  expiresAt: END,
  revokedAt: null,
  createdAt: NOW,
  status: 'active',
  liveRooms: 0,
  roomsUsed: 0,
  peakPlayers: 0,
  lastUsedAt: null,
  ...over,
});

describe('csvCell', () => {
  it('leaves plain text and numbers as they are, null empty', () => {
    expect(csvCell('ABC123')).toBe('ABC123');
    expect(csvCell(30)).toBe('30');
    expect(csvCell(null)).toBe('');
  });

  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('Main, bareng')).toBe('"Main, bareng"');
    expect(csvCell('Kata "seru"')).toBe('"Kata ""seru"""');
    expect(csvCell('a\nb')).toBe('"a\nb"');
  });

  it('defuses text a spreadsheet would run as a formula', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+62 812')).toBe("'+62 812");
    expect(csvCell('@admin')).toBe("'@admin");
    // Negative numbers stay numbers.
    expect(csvCell(-5)).toBe('-5');
  });
});

describe('toCsv', () => {
  it('joins rows with CRLF and ends with one', () => {
    expect(
      toCsv([
        ['a', 'b'],
        [1, null],
      ]),
    ).toBe('a,b\r\n1,\r\n');
  });
});

describe('passesCsv', () => {
  it('writes the header and one row per code, in order', () => {
    const csv = passesCsv(
      [
        pass({ id: 1 }),
        pass({ id: 2, code: 'ZZ99ZZ99', label: 'Promo, akhir tahun', kind: 'promo', durationMs: 7 * DAY }),
      ],
      CSV_KINDS,
    );
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe(PASS_CSV_HEADER.join(','));
    expect(lines[1]).toBe('K7M2P9QX,Toko Sabtu,sekali pakai,30,2027-02-21 23:59');
    expect(lines[2]).toBe('ZZ99ZZ99,"Promo, akhir tahun",promo,7,2027-02-21 23:59');
    expect(lines).toHaveLength(3);
  });

  it('leaves the duration empty for a shared code', () => {
    const csv = passesCsv([pass({ kind: 'shared', durationMs: null })], CSV_KINDS);
    expect(csv.split('\r\n')[1]).toBe('K7M2P9QX,Toko Sabtu,bersama,,2027-02-21 23:59');
  });
});

describe('dates and file name', () => {
  it('writes local time as YYYY-MM-DD HH:MM', () => {
    expect(csvDateTime(new Date(2026, 0, 5, 7, 3).getTime())).toBe('2026-01-05 07:03');
  });

  it('names the file after the moment it was made', () => {
    expect(csvFileName(NOW)).toBe('kacaw-pass-20261123-1405.csv');
  });
});
