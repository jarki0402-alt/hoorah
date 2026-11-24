/** "Pengaduan" tab: reports players sent from the main screen or a phone, with their status. */
import type { AdminReport, AdminReportList, ReportStatus } from '@hoorah/protocol';
import { useCallback, useId, useRef, useState } from 'preact/hooks';
import { api, errorCode } from './api';
import { ContextList, Disclosure } from './client-context';
import { CopyButton } from './copy-button';
import {
  applyReportStatus,
  isReportStatus,
  newestReports,
  REPORT_FILTERS,
  REPORT_STATUSES,
  type ReportFilter,
  reportTotal,
} from './feedback';
import { formatDateTime, formatRelative } from './format';
import { usePolling } from './hooks';
import { newReports, showToast } from './state';
import { ERRORS, REPORT_KINDS_LABEL, REPORT_STATUS_LABEL, REPORTS, STR } from './strings';
import { EmptyState, LoadError } from './ui';

const REFRESH_MS = 60_000;

function ReportCard({
  report,
  now,
  onStatus,
}: {
  report: AdminReport;
  now: number;
  onStatus: (id: number, status: ReportStatus) => Promise<void>;
}) {
  const selectId = useId();
  const [busy, setBusy] = useState(false);
  const change = async (next: string) => {
    if (!isReportStatus(next) || next === report.status) return;
    setBusy(true);
    await onStatus(report.id, next);
    setBusy(false);
  };
  return (
    <article class={`ad-card ad-report is-${report.status}`} aria-label={REPORT_KINDS_LABEL[report.kind]}>
      <div class="ad-report-head">
        <span class={`ad-tag ad-report-kind is-${report.kind}`}>
          {REPORT_KINDS_LABEL[report.kind] ?? report.kind}
        </span>
        <span class={`ad-badge ad-badge--${report.status}`}>{REPORT_STATUS_LABEL[report.status]}</span>
      </div>
      <p class="ad-report-text">{report.text}</p>
      <div class="ad-report-meta">
        <time
          dateTime={new Date(report.createdAt).toISOString()}
          title={formatDateTime(report.createdAt, { now })}
        >
          {formatRelative(report.createdAt, now)}, {formatDateTime(report.createdAt, { now })}
        </time>
      </div>
      <div class="ad-report-contact">
        {report.contact ? (
          <>
            <span class="ad-report-contact-label">{REPORTS.contact}</span>
            <span class="ad-report-contact-value">{report.contact}</span>
            <CopyButton
              class="ad-btn ad-btn--small ad-btn--ghost"
              label={REPORTS.copyContact}
              text={() => report.contact ?? ''}
            />
          </>
        ) : (
          <span class="ad-report-contact-label">{REPORTS.noContact}</span>
        )}
      </div>
      <Disclosure summary={REPORTS.context}>
        <ContextList ctx={report.context} />
      </Disclosure>
      <div class="ad-report-status">
        <label class="ad-label ad-label--inline" for={selectId}>
          {REPORTS.statusField}
        </label>
        <select
          id={selectId}
          class="ad-input ad-select ad-select--small"
          value={report.status}
          disabled={busy}
          onChange={(e) => void change(e.currentTarget.value)}
        >
          {REPORT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {REPORT_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
    </article>
  );
}

export function ReportsTab() {
  const [filter, setFilter] = useState<ReportFilter>('baru');
  const [data, setData] = useState<AdminReportList | null>(null);
  /** Kept while another filter loads, so the chips keep their numbers. */
  const [counts, setCounts] = useState<AdminReportList['counts'] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  /** Bumped on every local change, so a list fetched before it does not undo it. */
  const edits = useRef(0);
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const dataRef = useRef(data);
  dataRef.current = data;

  const load = useCallback(async () => {
    const seen = edits.current;
    const asked = filterRef.current;
    try {
      const list = await api.reports(asked === 'all' ? undefined : asked);
      if (seen !== edits.current || asked !== filterRef.current) return;
      setData({ reports: newestReports(list.reports), counts: list.counts });
      setCounts(list.counts);
      newReports.value = list.counts.baru;
      setNow(Date.now());
      setLoadError(null);
    } catch (err) {
      const c = errorCode(err);
      if (c !== 'unauthorized') setLoadError(ERRORS[c]);
    }
  }, []);
  usePolling(load, REFRESH_MS);

  const pick = (f: ReportFilter) => {
    if (f === filter) return;
    filterRef.current = f;
    setFilter(f);
    setData(null);
    void load();
  };

  const setStatus = async (id: number, status: ReportStatus) => {
    try {
      await api.setReportStatus(id, status);
      edits.current++;
      // Read the list as it is now: a refresh may have replaced it while the request ran.
      const current = dataRef.current;
      if (current) {
        const next = applyReportStatus(current, id, status, filterRef.current);
        setData(next);
        setCounts(next.counts);
        newReports.value = next.counts.baru;
      }
      showToast(REPORTS.statusChanged(REPORT_STATUS_LABEL[status]));
    } catch (err) {
      const c = errorCode(err);
      if (c === 'unauthorized') return;
      if (c === 'not_found') {
        void load();
        return;
      }
      showToast(ERRORS[c], 'error');
    }
  };

  const countOf = (f: ReportFilter) => (counts ? (f === 'all' ? reportTotal(counts) : counts[f]) : null);

  return (
    <section class="ad-section" aria-labelledby="reports-title">
      <div class="ad-section-head">
        <div>
          <h1 id="reports-title" class="ad-title">
            {REPORTS.title}
          </h1>
          <p class="ad-lead">{REPORTS.lead}</p>
        </div>
      </div>

      <fieldset class="ad-filters">
        <legend class="sr-only">{REPORTS.filtersLabel}</legend>
        {REPORT_FILTERS.map((f) => {
          const n = countOf(f);
          return (
            <button
              key={f}
              type="button"
              class={`ad-filter${filter === f ? ' is-on' : ''}`}
              aria-pressed={filter === f}
              onClick={() => pick(f)}
            >
              {f === 'all' ? REPORTS.all : REPORT_STATUS_LABEL[f]}
              {n !== null && <span class="ad-filter-count">{n}</span>}
            </button>
          );
        })}
      </fieldset>

      {loadError && <LoadError text={loadError} onRetry={() => void load()} />}

      {data === null ? (
        !loadError && <p class="ad-loading">{STR.loading}</p>
      ) : data.reports.length === 0 ? (
        <EmptyState icon="chat" title={REPORTS.empty[filter].title} body={REPORTS.empty[filter].body} />
      ) : (
        <div class="ad-list ad-list--reports">
          {data.reports.map((r) => (
            <ReportCard key={r.id} report={r} now={now} onStatus={setStatus} />
          ))}
        </div>
      )}
    </section>
  );
}

/** Keeps the "Pengaduan" tab badge current while another tab is open. */
export function useNewReportsBadge(active: boolean): void {
  const load = useCallback(async () => {
    if (active) return;
    try {
      const list = await api.reports('baru');
      newReports.value = list.counts.baru;
    } catch {
      // The badge is a hint; the tab itself shows load errors.
    }
  }, [active]);
  usePolling(load, REFRESH_MS);
}
