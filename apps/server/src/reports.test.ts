import { describe, expect, it } from 'vitest';
import { openDb } from './db';
import { ErrorRepository, errorKey, FeedbackIntake, ReportRepository } from './reports';

const NOW = 1_800_000_000_000;
const MIN = 60_000;
const context = { role: 'controller', version: 'abc123', userAgent: 'Mozilla/5.0 (Android)', gameId: 'ludo' };

function setup() {
  const db = openDb(':memory:');
  const reports = new ReportRepository(db);
  const errors = new ErrorRepository(db);
  return { db, reports, errors, intake: new FeedbackIntake(reports, errors) };
}

describe('reports', () => {
  it('stores a valid report as new and lists it with the counts', () => {
    const { intake, reports } = setup();
    expect(
      intake.report('1.1.1.1', { kind: 'pass', text: 'Kode tidak bisa', contact: '0812', context }, NOW),
    ).toBe(204);
    expect(intake.report('1.1.1.1', { kind: 'pass', text: '', context }, NOW)).toBe(400);
    const list = reports.list();
    expect(list.counts).toEqual({ baru: 1, diproses: 0, selesai: 0 });
    expect(list.reports[0]).toMatchObject({
      kind: 'pass',
      text: 'Kode tidak bisa',
      contact: '0812',
      status: 'baru',
      createdAt: NOW,
      context: { role: 'controller', gameId: 'ludo' },
    });
  });

  it('changes the status and filters by it', () => {
    const { intake, reports } = setup();
    intake.report('1.1.1.1', { kind: 'saran', text: 'Tambah game balap', context }, NOW);
    intake.report('1.1.1.1', { kind: 'teknis', text: 'Layar macet', context }, NOW + 1);
    const [newest] = reports.list().reports;
    if (!newest) throw new Error('no report');
    expect(newest.text).toBe('Layar macet');
    expect(reports.setStatus(newest.id, 'selesai')).toBe(true);
    expect(reports.setStatus(9999, 'selesai')).toBe(false);
    const done = reports.list('selesai');
    expect(done.reports.map((r) => r.id)).toEqual([newest.id]);
    expect(done.counts).toEqual({ baru: 1, diproses: 0, selesai: 1 });
  });

  it('allows five reports per address per ten minutes', () => {
    const { intake } = setup();
    const body = { kind: 'lainnya', text: 'Halo pemilik', context };
    for (let i = 0; i < 5; i++) expect(intake.report('2.2.2.2', body, NOW)).toBe(204);
    expect(intake.report('2.2.2.2', body, NOW)).toBe(429);
    expect(intake.report('3.3.3.3', body, NOW)).toBe(204);
    expect(intake.report('2.2.2.2', body, NOW + 2 * MIN + 1000)).toBe(204);
  });
});

describe('device errors', () => {
  it('groups the same message on the same role and game and counts it', () => {
    const { intake, errors } = setup();
    const e = { message: 'TypeError: x is undefined', stack: 'at a.js:1', context };
    expect(intake.error('1.1.1.1', e, NOW)).toBe(204);
    expect(
      intake.error('1.1.1.1', { ...e, stack: null, context: { ...context, version: 'def456' } }, NOW + MIN),
    ).toBe(204);
    expect(intake.error('1.1.1.1', { ...e, context: { ...context, gameId: 'catur' } }, NOW + 2 * MIN)).toBe(
      204,
    );
    expect(intake.error('1.1.1.1', { message: '', context }, NOW)).toBe(400);
    const groups = errors.list();
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ gameId: 'catur', count: 1 });
    expect(groups[1]).toMatchObject({
      message: 'TypeError: x is undefined',
      role: 'controller',
      gameId: 'ludo',
      count: 2,
      firstAt: NOW,
      lastAt: NOW + MIN,
      // A report without a stack keeps the one seen before.
      stack: 'at a.js:1',
      last: { version: 'def456' },
    });
  });

  it('keys groups by role, game and message only', () => {
    const base = {
      message: 'boom',
      stack: null,
      context: { role: 'screen' as const, version: '', userAgent: '' },
    };
    expect(errorKey(base)).toBe(errorKey({ ...base, stack: 'x' }));
    expect(errorKey(base)).not.toBe(errorKey({ ...base, context: { ...base.context, role: 'controller' } }));
    expect(errorKey(base)).not.toBe(errorKey({ ...base, context: { ...base.context, gameId: 'ludo' } }));
  });

  it('deletes one group or all of them', () => {
    const { intake, errors } = setup();
    intake.error('1.1.1.1', { message: 'satu', context }, NOW);
    intake.error('1.1.1.1', { message: 'dua', context }, NOW);
    const [first] = errors.list();
    if (!first) throw new Error('no group');
    expect(errors.delete(first.id)).toBe(true);
    expect(errors.delete(first.id)).toBe(false);
    expect(errors.list()).toHaveLength(1);
    expect(errors.clear()).toBe(1);
    expect(errors.list()).toEqual([]);
  });

  it('allows thirty errors per address per minute', () => {
    const { intake } = setup();
    for (let i = 0; i < 30; i++)
      expect(intake.error('4.4.4.4', { message: `e${i}`, context }, NOW)).toBe(204);
    expect(intake.error('4.4.4.4', { message: 'lagi', context }, NOW)).toBe(429);
  });
});
