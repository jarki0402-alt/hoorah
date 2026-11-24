/** "Galat" tab: errors from main screens and phones, grouped by message, newest first. */
import type { AdminErrorGroup } from '@hoorah/protocol';
import { useCallback, useRef, useState } from 'preact/hooks';
import { api, errorCode } from './api';
import { ContextList, Disclosure, gameTitle } from './client-context';
import { errorTotal, latestErrors } from './feedback';
import { formatDateTime, formatNumber, formatRelative } from './format';
import { usePolling } from './hooks';
import { showToast } from './state';
import { ERRORS, GALAT, ROLE_LABEL, STR } from './strings';
import { AdminIcon, ConfirmDialog, EmptyState, LoadError } from './ui';

const REFRESH_MS = 60_000;

function ErrorCard({
  group,
  now,
  onRemove,
}: {
  group: AdminErrorGroup;
  now: number;
  onRemove: (id: number) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    setBusy(true);
    await onRemove(group.id);
    setBusy(false);
  };
  const game = group.gameId ? (gameTitle(group.gameId) ?? group.gameId) : null;
  return (
    <article class="ad-card ad-galat" aria-label={group.message}>
      <div class="ad-galat-head">
        <span class="ad-tag ad-galat-count">{GALAT.times(formatNumber(group.count))}</span>
        <span class="ad-tag">{ROLE_LABEL[group.role] ?? group.role}</span>
        {game && <span class="ad-tag">{game}</span>}
      </div>
      <p class="ad-galat-message">{group.message}</p>
      <dl class="ad-galat-times">
        <div>
          <dt>{GALAT.last}</dt>
          <dd>
            <time
              dateTime={new Date(group.lastAt).toISOString()}
              title={formatDateTime(group.lastAt, { now })}
            >
              {formatRelative(group.lastAt, now)}
            </time>
          </dd>
        </div>
        <div>
          <dt>{GALAT.first}</dt>
          <dd>
            <time dateTime={new Date(group.firstAt).toISOString()}>
              {formatDateTime(group.firstAt, { now })}
            </time>
          </dd>
        </div>
      </dl>
      <Disclosure summary={GALAT.stack}>
        {group.stack ? <pre class="ad-stack">{group.stack}</pre> : <p class="ad-help">{GALAT.noStack}</p>}
      </Disclosure>
      <Disclosure summary={GALAT.latest}>
        <ContextList ctx={group.last} />
      </Disclosure>
      <div class="ad-galat-actions">
        <button
          type="button"
          class="ad-btn ad-btn--small ad-btn--ghost ad-btn--quiet-danger"
          disabled={busy}
          onClick={() => void remove()}
        >
          <AdminIcon name="trash" />
          <span>{busy ? STR.saving : GALAT.remove}</span>
        </button>
      </div>
    </article>
  );
}

export function ErrorsTab() {
  const [groups, setGroups] = useState<AdminErrorGroup[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  /** Bumped on every local change, so a list fetched before it does not undo it. */
  const edits = useRef(0);

  const load = useCallback(async () => {
    const seen = edits.current;
    try {
      const list = await api.errors();
      if (seen !== edits.current) return;
      setGroups(latestErrors(list));
      setNow(Date.now());
      setLoadError(null);
    } catch (err) {
      const c = errorCode(err);
      if (c !== 'unauthorized') setLoadError(ERRORS[c]);
    }
  }, []);
  usePolling(load, REFRESH_MS);

  const drop = (id: number) => {
    edits.current++;
    setGroups((list) => (list ?? []).filter((g) => g.id !== id));
  };

  const removeOne = async (id: number) => {
    try {
      await api.deleteError(id);
      drop(id);
      showToast(GALAT.removed);
    } catch (err) {
      const c = errorCode(err);
      if (c === 'unauthorized') return;
      // Already gone (cleared on another device): drop it here too.
      if (c === 'not_found') drop(id);
      else showToast(ERRORS[c], 'error');
    }
  };

  const clearAll = async () => {
    setClearing(true);
    setClearError(null);
    try {
      await api.clearErrors();
      edits.current++;
      setGroups([]);
      setConfirming(false);
      showToast(GALAT.removedAll);
    } catch (err) {
      const c = errorCode(err);
      if (c !== 'unauthorized') setClearError(ERRORS[c]);
    } finally {
      setClearing(false);
    }
  };

  return (
    <section class="ad-section" aria-labelledby="errors-title">
      <div class="ad-section-head">
        <div>
          <h1 id="errors-title" class="ad-title">
            {GALAT.title}
          </h1>
          <p class="ad-lead">{GALAT.lead}</p>
        </div>
        {groups !== null && groups.length > 0 && (
          <button
            type="button"
            class="ad-btn ad-btn--ghost ad-btn--quiet-danger"
            onClick={() => {
              setClearError(null);
              setConfirming(true);
            }}
          >
            <AdminIcon name="trash" />
            <span>{GALAT.removeAll}</span>
          </button>
        )}
      </div>

      {loadError && <LoadError text={loadError} onRetry={() => void load()} />}

      {groups === null ? (
        !loadError && <p class="ad-loading">{STR.loading}</p>
      ) : groups.length === 0 ? (
        <EmptyState icon="alert" title={GALAT.emptyTitle} body={GALAT.emptyBody} />
      ) : (
        <>
          <p class="ad-note ad-galat-summary">
            {GALAT.summary(formatNumber(groups.length), formatNumber(errorTotal(groups)))}
          </p>
          <div class="ad-list">
            {groups.map((g) => (
              <ErrorCard key={g.id} group={g} now={now} onRemove={removeOne} />
            ))}
          </div>
        </>
      )}

      {confirming && (
        <ConfirmDialog
          title={GALAT.removeAllTitle}
          body={GALAT.removeAllBody}
          confirm={GALAT.removeAllConfirm}
          busy={clearing}
          error={clearError}
          onConfirm={() => void clearAll()}
          onClose={() => {
            if (!clearing) setConfirming(false);
          }}
        />
      )}
    </section>
  );
}
