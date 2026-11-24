import type { AdminErrorGroup, AdminReport, AdminReportList, ClientContext } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import {
  applyReportStatus,
  contextRows,
  errorTotal,
  latestErrors,
  newestReports,
  reportTotal,
} from './feedback';
import {
  PASS_KINDS,
  REPORT_KINDS_LABEL,
  REPORT_STATUS_LABEL,
  ROLE_LABEL,
  STR,
  shareMessageRunning,
} from './strings';

const CTX: ClientContext = { role: 'controller', version: 'abc1234', userAgent: 'Mozilla/5.0 (Android)' };

const report = (over: Partial<AdminReport>): AdminReport => ({
  id: 1,
  createdAt: 1000,
  kind: 'teknis',
  text: 'Layar macet',
  contact: null,
  status: 'baru',
  context: CTX,
  ...over,
});

const group = (over: Partial<AdminErrorGroup>): AdminErrorGroup => ({
  id: 1,
  message: 'TypeError: x is undefined',
  stack: null,
  role: 'screen',
  gameId: null,
  count: 1,
  firstAt: 1000,
  lastAt: 1000,
  last: { ...CTX, role: 'screen' },
  ...over,
});

describe('reports', () => {
  it('lists the newest first', () => {
    const list = [
      report({ id: 1, createdAt: 10 }),
      report({ id: 2, createdAt: 30 }),
      report({ id: 3, createdAt: 20 }),
    ];
    expect(newestReports(list).map((r) => r.id)).toEqual([2, 3, 1]);
  });

  const list: AdminReportList = {
    reports: [report({ id: 1 }), report({ id: 2 })],
    counts: { baru: 2, diproses: 1, selesai: 4 },
  };

  it('moves the counts with a status change', () => {
    const next = applyReportStatus(list, 1, 'selesai', 'all');
    expect(next.counts).toEqual({ baru: 1, diproses: 1, selesai: 5 });
    expect(next.reports.find((r) => r.id === 1)?.status).toBe('selesai');
    expect(reportTotal(next.counts)).toBe(7);
  });

  it('drops the report from a list filtered on its old status', () => {
    const next = applyReportStatus(list, 2, 'diproses', 'baru');
    expect(next.reports.map((r) => r.id)).toEqual([1]);
    expect(next.counts).toEqual({ baru: 1, diproses: 2, selesai: 4 });
  });

  it('leaves the list alone for an unknown id or the same status', () => {
    expect(applyReportStatus(list, 9, 'selesai', 'all')).toBe(list);
    expect(applyReportStatus(list, 1, 'baru', 'baru')).toBe(list);
  });
});

describe('errors', () => {
  it('orders groups by their latest time and sums them', () => {
    const groups = [group({ id: 1, lastAt: 5, count: 3 }), group({ id: 2, lastAt: 9, count: 4 })];
    expect(latestErrors(groups).map((g) => g.id)).toEqual([2, 1]);
    expect(errorTotal(groups)).toBe(7);
  });
});

describe('contextRows', () => {
  it('shows only what the device sent', () => {
    const rows = contextRows(CTX, () => undefined);
    expect(rows.map((r) => r.label)).toEqual(['Perangkat', 'Versi aplikasi', 'Browser']);
    expect(rows[0]?.value).toBe('HP');
  });

  it('names the game, the link and the ping', () => {
    const rows = contextRows(
      {
        ...CTX,
        role: 'screen',
        gameId: 'kuis',
        room: '482917',
        rtt: 180,
        link: 'direct',
        viewport: '1920x1080',
        page: 'game',
      },
      (id) => (id === 'kuis' ? 'Kuis Nusantara' : undefined),
    );
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(byLabel.Perangkat).toBe('Layar utama');
    expect(byLabel.Game).toBe('Kuis Nusantara (kuis)');
    expect(byLabel['Ping ke server']).toBe('180 ms');
    expect(byLabel.Jalur).toBe('Langsung (WebRTC)');
    expect(byLabel.Room).toBe('482917');
  });

  it('falls back to raw ids it does not know', () => {
    const rows = contextRows({ ...CTX, gameId: 'baru', link: 'turn' }, () => undefined);
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(byLabel.Game).toBe('baru');
    expect(byLabel.Jalur).toBe('turn');
  });
});

describe('labels', () => {
  it('names every kind and status in Bahasa Indonesia', () => {
    expect(REPORT_KINDS_LABEL).toEqual({
      teknis: 'Masalah teknis',
      pass: 'Pass dan pembayaran',
      saran: 'Saran',
      lainnya: 'Lainnya',
    });
    expect(REPORT_STATUS_LABEL).toEqual({ baru: 'Baru', diproses: 'Diproses', selesai: 'Selesai' });
    expect(PASS_KINDS).toEqual({ shared: 'Kode bersama', single: 'Kode sekali pakai', promo: 'Kode promo' });
    expect(ROLE_LABEL.screen).toBe('Layar utama');
  });

  it('counts the screens a code was used on', () => {
    expect(STR.usesPromo(3, 50)).toBe('Dipakai 3/50 layar');
    expect(STR.usesPromo(3, null)).toBe('Dipakai di 3 layar');
    expect(STR.usesSingle(0)).toBe('Belum dipakai');
    expect(STR.usesSingle(1)).toBe('Dipakai di 1 layar');
  });

  it('tells friends how long a running code lasts, without em dashes', () => {
    const text = shareMessageRunning('K7M2P9QX', 30, 'Minggu, 21 Feb 23.59', 16);
    expect(text).toContain('Berlaku 30 hari sejak pertama dipakai di layar utama, sampai 16 pemain.');
    expect(text).toContain('Pakai sebelum Minggu, 21 Feb 23.59.');
    expect(text).not.toContain(String.fromCharCode(0x2014));
  });
});
