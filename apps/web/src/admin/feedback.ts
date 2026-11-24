/** Pure rules behind the "Pengaduan" and "Galat" tabs: order, filters, status moves, context rows. */
import type {
  AdminErrorGroup,
  AdminReport,
  AdminReportList,
  ClientContext,
  ReportStatus,
} from '@hoorah/protocol';
import { CONTEXT, ROLE_LABEL } from './strings';

export const REPORT_STATUSES: readonly ReportStatus[] = ['baru', 'diproses', 'selesai'];
export type ReportFilter = ReportStatus | 'all';
export const REPORT_FILTERS: readonly ReportFilter[] = ['baru', 'diproses', 'selesai', 'all'];

export function isReportStatus(v: unknown): v is ReportStatus {
  return typeof v === 'string' && (REPORT_STATUSES as readonly string[]).includes(v);
}

/** Newest report first (ties: higher id first). */
export function newestReports(reports: readonly AdminReport[]): AdminReport[] {
  return [...reports].sort((a, b) => b.createdAt - a.createdAt || b.id - a.id);
}

export function reportTotal(counts: Record<ReportStatus, number>): number {
  return counts.baru + counts.diproses + counts.selesai;
}

/**
 * The list after one report moved to `status`: counts follow, and the report leaves a list filtered
 * on another status. Unknown ids leave the list as it was.
 */
export function applyReportStatus(
  list: AdminReportList,
  id: number,
  status: ReportStatus,
  filter: ReportFilter,
): AdminReportList {
  const report = list.reports.find((r) => r.id === id);
  if (!report || report.status === status) return list;
  const counts = { ...list.counts };
  counts[report.status] = Math.max(0, counts[report.status] - 1);
  counts[status] += 1;
  const reports =
    filter === 'all' || filter === status
      ? list.reports.map((r) => (r.id === id ? { ...r, status } : r))
      : list.reports.filter((r) => r.id !== id);
  return { reports, counts };
}

/** Error groups seen most recently first. */
export function latestErrors(groups: readonly AdminErrorGroup[]): AdminErrorGroup[] {
  return [...groups].sort((a, b) => b.lastAt - a.lastAt || b.id - a.id);
}

/** Times all groups happened together. */
export function errorTotal(groups: readonly AdminErrorGroup[]): number {
  return groups.reduce((n, g) => n + g.count, 0);
}

export interface ContextRow {
  label: string;
  value: string;
  /** Shown in the monospace face (ids, versions, browser strings). */
  mono?: boolean;
}

/** The technical context as label/value rows, skipping what the device did not send. */
export function contextRows(ctx: ClientContext, gameTitle: (id: string) => string | undefined): ContextRow[] {
  const rows: ContextRow[] = [{ label: CONTEXT.role, value: ROLE_LABEL[ctx.role] ?? ctx.role }];
  if (ctx.page) rows.push({ label: CONTEXT.page, value: ctx.page, mono: true });
  if (ctx.gameId) {
    const title = gameTitle(ctx.gameId);
    rows.push({ label: CONTEXT.game, value: title ? `${title} (${ctx.gameId})` : ctx.gameId });
  }
  if (ctx.room) rows.push({ label: CONTEXT.room, value: ctx.room, mono: true });
  if (ctx.version) rows.push({ label: CONTEXT.version, value: ctx.version, mono: true });
  if (ctx.viewport) rows.push({ label: CONTEXT.viewport, value: ctx.viewport, mono: true });
  if (ctx.rtt !== undefined) rows.push({ label: CONTEXT.rtt, value: CONTEXT.rttValue(ctx.rtt) });
  if (ctx.link) rows.push({ label: CONTEXT.link, value: CONTEXT.links[ctx.link] ?? ctx.link });
  if (ctx.userAgent) rows.push({ label: CONTEXT.userAgent, value: ctx.userAgent, mono: true });
  return rows;
}
