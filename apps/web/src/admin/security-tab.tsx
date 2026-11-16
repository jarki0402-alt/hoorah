/** "Keamanan" tab: the server's security log (admin sign-ins, password changes, wrong Pass codes). */
import type { AdminEvent, AdminEventKind } from '@hoorah/protocol';
import { useCallback, useState } from 'preact/hooks';
import { api, errorCode } from './api';
import { formatDateTime, formatNumber, formatRelative } from './format';
import { usePolling } from './hooks';
import { recentCount } from './logic';
import { ERRORS, EVENT_LABELS, SECURITY, STR } from './strings';
import { EmptyState, LoadError, Stat } from './ui';

const REFRESH_MS = 30_000;

/** Kinds that mean someone got something wrong (shown in red). */
const BAD: ReadonlySet<AdminEventKind> = new Set<AdminEventKind>([
  'login_failed',
  'login_limited',
  'password_failed',
  'pass_wrong',
  'pass_limited',
]);

function EventItem({ e, now }: { e: AdminEvent; now: number }) {
  const bad = BAD.has(e.kind);
  return (
    <li class={`ad-event${bad ? ' is-bad' : ''}`}>
      <div class="ad-event-line">
        <span class="ad-event-kind">
          <span class="ad-event-dot" aria-hidden="true" />
          {EVENT_LABELS[e.kind] ?? e.kind}
          {e.count > 1 && <span class="ad-event-count">{SECURITY.times(e.count)}</span>}
        </span>
        <time
          class="ad-event-time"
          dateTime={new Date(e.at).toISOString()}
          title={formatDateTime(e.at, { now })}
        >
          {formatRelative(e.at, now)}
        </time>
      </div>
      <div class="ad-event-meta">
        <code>{e.ip}</code>
        {e.detail && <span>{SECURITY.byUser(e.detail)}</span>}
        <span>{formatDateTime(e.at, { now })}</span>
      </div>
    </li>
  );
}

export function SecurityTab() {
  const [events, setEvents] = useState<AdminEvent[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      setEvents(await api.events());
      setNow(Date.now());
      setLoadError(null);
    } catch (err) {
      const c = errorCode(err);
      if (c !== 'unauthorized') setLoadError(ERRORS[c]);
    }
  }, []);
  usePolling(load, REFRESH_MS);

  return (
    <section class="ad-section" aria-labelledby="security-title">
      <div class="ad-section-head">
        <div>
          <h1 id="security-title" class="ad-title">
            {SECURITY.title}
          </h1>
          <p class="ad-lead">{SECURITY.lead}</p>
        </div>
      </div>

      {loadError && <LoadError text={loadError} onRetry={() => void load()} />}

      {events === null ? (
        !loadError && <p class="ad-loading">{STR.loading}</p>
      ) : (
        <>
          <dl class="ad-stats ad-stats--2">
            <Stat
              label={SECURITY.failedLogins}
              value={formatNumber(recentCount(events, ['login_failed', 'login_limited'], now))}
              hint={SECURITY.last24h}
            />
            <Stat
              label={SECURITY.wrongPasses}
              value={formatNumber(recentCount(events, ['pass_wrong', 'pass_limited'], now))}
              hint={SECURITY.last24h}
            />
          </dl>
          {events.length === 0 ? (
            <EmptyState icon="shield" title={SECURITY.emptyTitle} body={SECURITY.emptyBody} />
          ) : (
            <article class="ad-card ad-panel">
              <h3 class="ad-card-title">{SECURITY.listTitle}</h3>
              <ul class="ad-events">
                {events.map((e) => (
                  <EventItem key={e.id} e={e} now={now} />
                ))}
              </ul>
              <p class="ad-note">{SECURITY.note}</p>
            </article>
          )}
        </>
      )}
    </section>
  );
}
