/**
 * "Data keluar VM": what the VM's network card sent this billing month against the 200 GiB of
 * Standard-tier egress Google gives free each month, the pace to the month end, the last 14 days,
 * the Always Free checks, and a warning when Cloudflare's proxy (orange cloud) is in front.
 */
import type { AdminEgress } from '@hoorah/protocol';
import { BarChart, type ChartPoint, Meter } from './charts';
import {
  formatBytes,
  formatDateTime,
  formatDay,
  formatNumber,
  formatPercent,
  formatRelative,
} from './format';
import { type MemoryLevel, seriesFigures, share, weekdayOfKey } from './logic';
import { EGRESS, FREE_TIER, WEEKDAYS_SHORT } from './strings';
import { Row } from './ui';

const LOCAL_TZ = 'Asia/Jakarta';

/** Billing month name; the start is midnight Pacific, so half a day later is safely inside it. */
function monthName(start: number): string {
  return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(start + 12 * 3_600_000);
}

function Figure({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div class="ad-fig">
      <dt>{label}</dt>
      <dd class="ad-fig-value">{value}</dd>
      <dd class="ad-fig-hint">{hint}</dd>
    </div>
  );
}

function FreeTier({ egress }: { egress: AdminEgress }) {
  return (
    <ul class="ad-checks">
      {egress.freeTier.map((c) => {
        const bytes = c.bytes === null ? '' : formatBytes(c.bytes);
        const text =
          c.ok === null ? EGRESS.freeUnknown(bytes) : c.ok ? EGRESS.freeOk(bytes) : EGRESS.freeOver(bytes);
        return (
          <li key={c.id}>
            <span>{FREE_TIER[c.id]}</span>
            <span class={`ad-tag is-${c.ok === null ? 'unknown' : c.ok ? 'ok' : 'over'}`}>{text}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Cloudflare({ egress, now }: { egress: AdminEgress; now: number }) {
  if (egress.cloudflare.active && egress.cloudflare.seenAt !== null) {
    return (
      <p class="ad-warn" role="alert">
        {EGRESS.cloudflare(formatRelative(egress.cloudflare.seenAt, now))}
      </p>
    );
  }
  return (
    <div class="ad-row-line ad-row">
      <span class="ad-row-label">{EGRESS.route}</span>
      <span class="ad-tag is-ok">{EGRESS.routeDirect}</span>
    </div>
  );
}

export function EgressCard({ egress }: { egress: AdminEgress }) {
  const now = Date.now();
  const anyOver = egress.freeTier.some((c) => c.ok === false);

  if (egress.measuredSince === null) {
    return (
      <article class="ad-card ad-panel ad-egress">
        <h3 class="ad-card-title">{EGRESS.title}</h3>
        <Cloudflare egress={egress} now={now} />
        <p class="ad-big-muted">{EGRESS.notMeasured}</p>
        <p class="ad-note">{EGRESS.notMeasuredBody}</p>
        <FreeTier egress={egress} />
        <p class="ad-note">{EGRESS.freeUnjudged}</p>
        {anyOver && <p class="ad-warn">{EGRESS.freeWarn}</p>}
      </article>
    );
  }

  const { month, previous } = egress;
  const used = share(month.txBytes, egress.freeBytes);
  const projected = share(egress.projectedBytes, egress.freeBytes);
  const level: MemoryLevel = used > 0.9 ? 'over' : used > 0.7 || projected > 1 ? 'warn' : 'ok';
  const points: ChartPoint[] = egress.daily.map((d) => ({
    value: d.txBytes,
    label: formatDay(d.start, LOCAL_TZ),
    detail: `${WEEKDAYS_SHORT[weekdayOfKey(d.day)] ?? ''}, ${formatDay(d.start, LOCAL_TZ)}`,
  }));
  const figs = seriesFigures(egress.daily.map((d) => d.txBytes));
  const peak = points[figs.peakIndex];
  const paceDays = EGRESS.paceDays(formatNumber(egress.paceDays, egress.paceDays < 1 ? 1 : 0));

  return (
    <article class="ad-card ad-panel ad-egress">
      <div class="ad-card-head">
        <h3 class="ad-card-title">{EGRESS.title}</h3>
        <span class="ad-card-meta">{EGRESS.month(monthName(month.start))}</span>
      </div>
      <Cloudflare egress={egress} now={now} />
      <Row
        label={EGRESS.allowance(formatBytes(egress.freeBytes), formatPercent(used))}
        value={`${formatBytes(month.txBytes)} / ${formatBytes(egress.freeBytes)}`}
      >
        <Meter fraction={Math.max(used, used > 0 ? 0.01 : 0)} level={level} />
      </Row>
      <dl class="ad-figs">
        <Figure
          label={EGRESS.soFar}
          value={formatBytes(month.txBytes)}
          hint={EGRESS.soFarHint(formatPercent(used))}
        />
        <Figure
          label={EGRESS.projected}
          value={formatBytes(egress.projectedBytes)}
          hint={
            egress.paceDays >= 1
              ? EGRESS.projectedHint(formatPercent(projected), formatBytes(egress.perDayBytes), paceDays)
              : EGRESS.projectedRough(formatPercent(projected))
          }
        />
        <Figure
          label={EGRESS.today}
          value={formatBytes(egress.today.txBytes)}
          hint={EGRESS.todayHint(formatBytes(egress.yesterday.txBytes))}
        />
        <Figure
          label={EGRESS.previous}
          value={formatBytes(previous.txBytes)}
          hint={
            previous.complete
              ? formatPercent(share(previous.txBytes, egress.freeBytes))
              : EGRESS.previousPartial
          }
        />
      </dl>
      <Row label={EGRESS.inbound} value={EGRESS.inboundValue(formatBytes(month.rxBytes))} />

      <h4 class="ad-chart-title">{EGRESS.dailyTitle}</h4>
      <BarChart points={points} format={formatBytes} label={EGRESS.dailyTitle} scale="bytes" />
      <p class="ad-chart-figs">
        <span>
          {EGRESS.total} <strong class="ad-chart-fig">{formatBytes(figs.total)}</strong>
        </span>
        <span>
          {EGRESS.perDayAvg} <strong class="ad-chart-fig">{formatBytes(figs.average)}</strong>
        </span>
        {peak && figs.total > 0 && (
          <span>
            {EGRESS.peak} <strong class="ad-chart-fig">{formatBytes(peak.value ?? 0)}</strong> ({peak.detail})
          </span>
        )}
      </p>

      <FreeTier egress={egress} />
      {anyOver && <p class="ad-warn">{EGRESS.freeWarn}</p>}
      {!egress.available && <p class="ad-warn">{EGRESS.stale}</p>}
      <p class="ad-note">
        {EGRESS.measured(egress.iface ?? '?', formatDateTime(egress.measuredSince))} {EGRESS.billingNote}
      </p>
    </article>
  );
}
