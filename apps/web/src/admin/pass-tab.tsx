/** "Pass" tab: create button, status filter, and the list of pass cards (refreshed every 15 s). */
import type { AdminPass } from '@hoorah/protocol';
import { useCallback, useRef, useState } from 'preact/hooks';
import { api, errorCode } from './api';
import { useNow, usePolling } from './hooks';
import { countByStatus, filterPasses, PASS_FILTERS, type PassFilter, upsertPass } from './logic';
import { PassCard } from './pass-card';
import { CreatePassSheet } from './pass-forms';
import { EMPTY, ERRORS, FILTERS, STR } from './strings';
import { AdminIcon, EmptyState, LoadError } from './ui';

const REFRESH_MS = 15_000;

export function PassTab() {
  const [passes, setPasses] = useState<AdminPass[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<PassFilter>('active');
  const [creating, setCreating] = useState(false);
  // Re-renders every 30 s so the remaining times keep counting between refreshes.
  useNow(30_000);
  /** Bumped on every local change, so a list fetched before it does not undo it. */
  const edits = useRef(0);

  const load = useCallback(async () => {
    const seen = edits.current;
    try {
      const list = await api.passes();
      if (seen === edits.current) setPasses(list);
      setLoadError(null);
    } catch (err) {
      const c = errorCode(err);
      if (c !== 'unauthorized') setLoadError(ERRORS[c]);
    }
  }, []);
  usePolling(load, REFRESH_MS);

  const change = (p: AdminPass) => {
    edits.current++;
    setPasses((list) => upsertPass(list ?? [], p));
  };
  const remove = (id: number) => {
    edits.current++;
    setPasses((list) => (list ?? []).filter((p) => p.id !== id));
  };
  const created = (p: AdminPass) => {
    change(p);
    setFilter('active');
  };

  const current = Date.now();
  const counts = passes ? countByStatus(passes, current) : null;
  const shown = passes ? filterPasses(passes, filter, current) : [];

  return (
    <section class="ad-section" aria-labelledby="pass-title">
      <div class="ad-section-head">
        <div>
          <h1 id="pass-title" class="ad-title">
            {STR.passTitle}
          </h1>
          <p class="ad-lead">{STR.passLead}</p>
        </div>
        <button type="button" class="ad-btn ad-btn--primary ad-create" onClick={() => setCreating(true)}>
          <AdminIcon name="plus" size={20} />
          <span>{STR.createPass}</span>
        </button>
      </div>

      <fieldset class="ad-filters">
        <legend class="sr-only">{STR.filtersLabel}</legend>
        {PASS_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            class={`ad-filter${filter === f ? ' is-on' : ''}`}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {FILTERS[f]}
            {f === 'active' && counts && <span class="ad-filter-count">{counts.active}</span>}
          </button>
        ))}
      </fieldset>

      {loadError && <LoadError text={loadError} onRetry={() => void load()} />}

      {passes === null ? (
        !loadError && <p class="ad-loading">{STR.loading}</p>
      ) : shown.length === 0 ? (
        <EmptyState icon="ticket" title={EMPTY[filter].title} body={EMPTY[filter].body} />
      ) : (
        <div class="ad-list ad-list--passes">
          {shown.map((p) => (
            <PassCard key={p.id} pass={p} now={current} onChange={change} onRemove={remove} />
          ))}
        </div>
      )}

      {creating && <CreatePassSheet onClose={() => setCreating(false)} onCreated={created} />}
    </section>
  );
}
