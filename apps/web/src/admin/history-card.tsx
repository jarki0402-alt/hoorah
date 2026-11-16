/** "Riwayat": the server's 5-minute samples over 24 hours, 7 days or 14 days. */
import { type AdminSystemHistory, SYSTEM_HISTORY_HOURS, type SystemHistoryHours } from '@hoorah/protocol';
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { api, errorCode } from './api';
import { type ChartPoint, LineChart } from './charts';
import { formatBytes, formatDateTime, formatDay, formatHour, formatNumber, formatPercent } from './format';
import { ERRORS, HISTORY_RANGES, MON } from './strings';
import { RangeButtons } from './ui';

/** Samples come every 5 minutes; a minute is plenty. */
const REFRESH_MS = 60_000;

function ChartCard({ title, note, children }: { title: string; note?: string; children: ComponentChildren }) {
  return (
    <div class="ad-chart-card">
      <h4 class="ad-chart-title">{title}</h4>
      {children}
      {note && <p class="ad-note">{note}</p>}
    </div>
  );
}

export function HistoryCard() {
  const [hours, setHours] = useState<SystemHistoryHours>(24);
  const [data, setData] = useState<AdminSystemHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      setBusy(true);
      try {
        const h = await api.history(hours);
        if (!alive) return;
        setData(h);
        setError(null);
      } catch (err) {
        const c = errorCode(err);
        if (alive && c !== 'unauthorized') setError(ERRORS[c]);
      } finally {
        if (alive) setBusy(false);
      }
    };
    void run();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void run();
    }, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [hours]);

  const now = Date.now();
  const samples = data?.samples ?? [];
  const label = (at: number) => (data && data.hours <= 24 ? formatHour(at) : formatDay(at));
  const series = (pick: (s: (typeof samples)[number]) => number | null): ChartPoint[] =>
    samples.map((s) => ({ value: pick(s), label: label(s.at), detail: formatDateTime(s.at, { now }) }));
  const measured = samples.some((s) => s.txBytes !== null);
  const bytes = series((s) => (measured ? s.txBytes : s.relayBytes));
  const totalBytes = bytes.reduce((n, p) => n + (p.value ?? 0), 0);
  const bucket =
    data && data.bucketSec >= 3600
      ? MON.bucketHour
      : MON.bucketMinutes(Math.round((data?.bucketSec ?? 300) / 60));

  return (
    <article class="ad-card ad-panel">
      <div class="ad-card-head">
        <div>
          <h3 class="ad-card-title">{MON.historyTitle}</h3>
          <p class="ad-card-lead">{MON.historyLead}</p>
        </div>
        <RangeButtons
          label={MON.historyRanges}
          options={SYSTEM_HISTORY_HOURS}
          value={hours}
          names={HISTORY_RANGES}
          onChange={setHours}
        />
      </div>
      {error && <p class="ad-warn">{error}</p>}
      {data === null ? (
        !error && <p class="ad-loading">{MON.noData}</p>
      ) : samples.length === 0 ? (
        <p class="ad-note">{MON.historyEmpty}</p>
      ) : (
        <div class={`ad-charts${busy ? ' is-busy' : ''}`}>
          <ChartCard title={MON.chartRam}>
            <LineChart
              points={series((s) => s.ram)}
              format={formatPercent}
              label={MON.chartRam}
              floorMax={1}
              empty={MON.chartEmptyRange}
            />
          </ChartCard>
          <ChartCard title={MON.chartCpu}>
            <LineChart
              points={series((s) => s.load)}
              format={formatPercent}
              label={MON.chartCpu}
              floorMax={1}
              empty={MON.chartEmptyRange}
            />
          </ChartCard>
          <ChartCard title={MON.chartPlayers}>
            <LineChart
              points={series((s) => s.players)}
              format={(v) => formatNumber(v)}
              label={MON.chartPlayers}
              floorMax={4}
              scale="integer"
              empty={MON.chartEmptyRange}
            />
          </ChartCard>
          <ChartCard
            title={measured ? MON.chartEgress : MON.chartRelay}
            note={`${MON.chartBytesNote(formatBytes(totalBytes), bucket)}${measured ? '' : ` ${MON.chartRelayNote}`}`}
          >
            <LineChart
              points={bytes}
              format={formatBytes}
              scale="bytes"
              label={measured ? MON.chartEgress : MON.chartRelay}
              empty={MON.chartEmptyRange}
            />
          </ChartCard>
        </div>
      )}
    </article>
  );
}
