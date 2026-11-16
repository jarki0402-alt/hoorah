/**
 * "Server" tab: live monitors for the VM (refreshed every 30 s), what is connected right now, the
 * egress against Google's free allowance, the VM, the Hoorah process, the database, and the 5-minute
 * history kept by the server.
 */
import type { AdminEgress, AdminSystem } from '@hoorah/protocol';
import { signal } from '@preact/signals';
import { useCallback, useState } from 'preact/hooks';
import { api, errorCode } from './api';
import { type ChartPoint, LineChart, Meter } from './charts';
import { EgressCard } from './egress-card';
import {
  formatBytes,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatPercent,
  formatRate,
} from './format';
import { HistoryCard } from './history-card';
import { usePolling } from './hooks';
import { MEMORY_TARGET_MB, memoryLevel, pushReading, type Reading, share, usageLevel } from './logic';
import { ERRORS, LEVELS, MON, STR, TABLE_LABELS } from './strings';
import { LoadError, Row, Stat } from './ui';

const REFRESH_MS = 30_000;
const MB = 1024 * 1024;

/** Kept outside the component, so switching tabs keeps the session's readings. */
const ramReadings = signal<Reading[]>([]);
const cpuReadings = signal<Reading[]>([]);

const loadShare = (s: AdminSystem) => share(s.host.load[0], s.host.cpus);
const ramShare = (s: AdminSystem) =>
  share(s.host.memTotalBytes - s.host.memAvailableBytes, s.host.memTotalBytes);

function readingPoints(list: readonly Reading[]): ChartPoint[] {
  return list.map((r) => ({ value: r.value, label: '', detail: formatDateTime(r.at, { weekday: 'none' }) }));
}

function Monitor({
  title,
  fraction,
  value,
  readings,
}: {
  title: string;
  fraction: number;
  value: string;
  readings: readonly Reading[];
}) {
  const level = usageLevel(fraction);
  return (
    <div class="ad-card ad-monitor">
      <div class="ad-monitor-head">
        <h3 class="ad-monitor-title">{title}</h3>
        <span class={`ad-level is-${level}`}>{LEVELS[level]}</span>
      </div>
      <p class="ad-monitor-value">
        <strong class="ad-monitor-pct">{formatPercent(fraction)}</strong>
        <span class="ad-monitor-sub">{value}</span>
      </p>
      {readings.length > 1 ? (
        <LineChart
          points={readingPoints(readings)}
          format={formatPercent}
          label={MON.sparkLabel(title)}
          floorMax={1}
          mini
        />
      ) : (
        <p class="ad-spark-wait">{MON.sparkWaiting}</p>
      )}
      <p class="ad-monitor-hint">{MON.sparkHint}</p>
    </div>
  );
}

function LiveNumbers({ live }: { live: AdminSystem['live'] }) {
  return (
    <dl class="ad-stats ad-stats--3">
      <Stat label={MON.screens} value={formatNumber(live.screens)} hint={MON.screensHint} />
      <Stat label={MON.phones} value={formatNumber(live.phones)} hint={MON.phonesHint} />
      <Stat label={MON.rooms} value={formatNumber(live.rooms)} hint={MON.roomsHint} />
      <Stat label={MON.players} value={formatNumber(live.players)} hint={MON.playersHint} />
      <Stat
        label={MON.direct}
        value={MON.directValue(live.direct, live.phones)}
        hint={MON.directHint(Math.max(0, live.phones - live.direct))}
      />
      <Stat label={MON.relay} value={formatRate(live.relayBytesPerSec)} hint={MON.relayHint} />
    </dl>
  );
}

function ServerCard({ s }: { s: AdminSystem }) {
  const h = s.host;
  const ramUsed = h.memTotalBytes - h.memAvailableBytes;
  const ram = share(ramUsed, h.memTotalBytes);
  const swap = share(h.swapUsedBytes, h.swapTotalBytes);
  const diskUsed = s.disk ? s.disk.totalBytes - s.disk.freeBytes : 0;
  const disk = s.disk ? share(diskUsed, s.disk.totalBytes) : 0;
  const loadText = h.load
    .map((l) => `${formatNumber(l, 2)} (${formatPercent(share(l, h.cpus))})`)
    .join(' / ');
  return (
    <article class="ad-card ad-panel">
      <h3 class="ad-card-title">{MON.serverCard}</h3>
      <Row
        label={MON.ramUsed}
        value={MON.withPct(
          MON.ofTotal(formatBytes(ramUsed), formatBytes(h.memTotalBytes)),
          formatPercent(ram),
        )}
      >
        <Meter fraction={ram} level={usageLevel(ram)} />
      </Row>
      <Row
        label={MON.swapUsed}
        value={
          h.swapTotalBytes > 0
            ? MON.withPct(
                MON.ofTotal(formatBytes(h.swapUsedBytes), formatBytes(h.swapTotalBytes)),
                formatPercent(swap),
              )
            : MON.noSwap
        }
      >
        {h.swapTotalBytes > 0 && <Meter fraction={swap} level={usageLevel(swap)} />}
      </Row>
      <Row label={MON.load(h.cpus)} value={loadText} />
      <Row
        label={MON.disk}
        value={
          s.disk
            ? MON.withPct(
                MON.ofTotal(formatBytes(diskUsed), formatBytes(s.disk.totalBytes)),
                formatPercent(disk),
              )
            : MON.diskUnknown
        }
      >
        {s.disk && <Meter fraction={disk} level={usageLevel(disk)} />}
      </Row>
      <Row label={MON.vmUptime} value={formatDuration(h.uptimeSec * 1000)} />
      {!h.fromProc && <p class="ad-note">{MON.notProc}</p>}
    </article>
  );
}

function AppCard({ s }: { s: AdminSystem }) {
  const p = s.process;
  const rssMb = p.rssBytes / MB;
  return (
    <article class="ad-card ad-panel">
      <h3 class="ad-card-title">{MON.appCard}</h3>
      <Row label={MON.rss} value={MON.rssValue(formatBytes(p.rssBytes), formatBytes(MEMORY_TARGET_MB * MB))}>
        <Meter fraction={rssMb / MEMORY_TARGET_MB} level={memoryLevel(rssMb)} />
      </Row>
      <Row
        label={MON.heap}
        value={MON.ofTotal(formatBytes(p.heapUsedBytes), formatBytes(p.heapTotalBytes))}
      />
      <Row label={MON.node} value={p.node} />
      <Row
        label={MON.running}
        value={MON.runningValue(formatDuration(p.uptimeSec * 1000), formatDateTime(p.startedAt))}
      />
    </article>
  );
}

function DatabaseCard({ s }: { s: AdminSystem }) {
  return (
    <article class="ad-card ad-panel">
      <h3 class="ad-card-title">{MON.dbCard}</h3>
      <Row label={MON.dbFile} value={formatBytes(s.database.bytes)} />
      <ul class="ad-table-list">
        {s.database.tables.map((t) => (
          <li key={t.name}>
            <span>
              {TABLE_LABELS[t.name] ?? t.name} <code>{t.name}</code>
            </span>
            <span class="ad-row-value">{MON.rows(formatNumber(t.rows))}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

export function ServerTab() {
  const [sys, setSys] = useState<AdminSystem | null>(null);
  const [egress, setEgress] = useState<AdminEgress | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, e] = await Promise.all([api.system(), api.egress().catch(() => null)]);
      setSys(s);
      if (e) setEgress(e);
      ramReadings.value = pushReading(ramReadings.value, { at: s.at, value: ramShare(s) });
      cpuReadings.value = pushReading(cpuReadings.value, { at: s.at, value: loadShare(s) });
      setLoadError(null);
    } catch (err) {
      const c = errorCode(err);
      if (c !== 'unauthorized') setLoadError(ERRORS[c]);
    }
  }, []);
  usePolling(load, REFRESH_MS);

  const ram = sys ? ramShare(sys) : 0;
  const cpu = sys ? loadShare(sys) : 0;
  return (
    <section class="ad-section" aria-labelledby="server-title">
      <div class="ad-section-head">
        <div>
          <h1 id="server-title" class="ad-title">
            {STR.serverTitle}
          </h1>
          <p class="ad-lead">{STR.serverLead}</p>
        </div>
      </div>

      {loadError && <LoadError text={loadError} onRetry={() => void load()} />}

      {sys === null ? (
        !loadError && <p class="ad-loading">{STR.loading}</p>
      ) : (
        <>
          <h2 class="ad-subtitle">{MON.liveTitle}</h2>
          <div class="ad-monitors">
            <Monitor
              title={MON.ram}
              fraction={ram}
              value={MON.ofTotal(
                formatBytes(sys.host.memTotalBytes - sys.host.memAvailableBytes),
                formatBytes(sys.host.memTotalBytes),
              )}
              readings={ramReadings.value}
            />
            <Monitor
              title={MON.cpu}
              fraction={cpu}
              value={MON.cpuValue(formatNumber(sys.host.load[0], 2), sys.host.cpus)}
              readings={cpuReadings.value}
            />
          </div>

          <h2 class="ad-subtitle">{MON.nowTitle}</h2>
          <LiveNumbers live={sys.live} />

          {egress && <EgressCard egress={egress} />}

          <div class="ad-panels">
            <ServerCard s={sys} />
            <AppCard s={sys} />
          </div>
          <DatabaseCard s={sys} />
          <HistoryCard />
        </>
      )}
    </section>
  );
}
