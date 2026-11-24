/** "Pass" tab: create button, status filter, and the list of pass cards (refreshed every 15 s). */
import type { AdminPass } from '@hoorah/protocol';
import { useCallback, useRef, useState } from 'preact/hooks';
import { api, errorCode } from './api';
import { useNow, usePolling } from './hooks';
import {
  countByStatus,
  filterByKind,
  filterPasses,
  KIND_FILTERS,
  type KindFilter,
  PASS_FILTERS,
  type PassFilter,
  upsertPass,
  upsertPasses,
} from './logic';
import { PassCard } from './pass-card';
import { CreatePassSheet } from './pass-forms';
import { EMPTY, ERRORS, FILTERS, KIND_FILTER_LABEL, STR } from './strings';
import { AdminIcon, EmptyState, LoadError } from './ui';

const REFRESH_MS = 15_000;

export function PassTab() {
  const [passes, setPasses] = useState<AdminPass[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<PassFilter>('active');
  const [kind, setKind] = useState<KindFilter>('all');
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
  const created = (added: AdminPass[]) => {
    edits.current++;
    setPasses((list) => upsertPasses(list ?? [], added));
    setFilter('active');
    setKind('all');
  };

  const current = Date.now();
  const ofKind = passes ? filterByKind(passes, kind) : [];
  const counts = passes ? countByStatus(ofKind, current) : null;
  const shown = filterPasses(ofKind, filter, current);
  // The kind row only helps once there is more than one kind to tell apart.
  const kinds = passes ? new Set(passes.map((p) => p.kind)).size : 0;

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

      {(kinds > 1 || kind !== 'all') && (
        <fieldset class="ad-filters ad-filters--kinds">
          <legend class="sr-only">{STR.kindFiltersLabel}</legend>
          {KIND_FILTERS.map((k) => (
            <button
              key={k}
              type="button"
              class={`ad-filter ad-filter--quiet${kind === k ? ' is-on' : ''}`}
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
            >
              {k === 'all' ? STR.allKinds : KIND_FILTER_LABEL[k]}
            </button>
          ))}
        </fieldset>
      )}

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
