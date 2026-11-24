/** "Pengaturan" tab: the switches and numbers every main screen follows (`/api/admin/config`). */
import { type AdminConfig, CONFIG_LIMITS, parseAppConfig } from '@hoorah/protocol';
import { useCallback, useEffect, useId, useState } from 'preact/hooks';
import { CATALOG, GAMES } from '../shared/games';
import { api, errorCode } from './api';
import { formatDateTime } from './format';
import { configChanged } from './logic';
import { showToast } from './state';
import { ERRORS, SETTINGS, STR } from './strings';
import { ErrorText, LoadError, Stepper, Switch } from './ui';

type NumberKey = keyof typeof CONFIG_LIMITS;

/** Games for the "Game Minggu Ini" list, by title. */
const WEEKLY_OPTIONS = [...CATALOG]
  .map((id) => ({ id, title: GAMES[id].title }))
  .sort((a, b) => a.title.localeCompare(b.title, 'id'));

function NumberSetting({
  label,
  field,
  draft,
  onChange,
  help,
  disabled = false,
}: {
  label: string;
  field: NumberKey;
  draft: AdminConfig;
  onChange: (next: AdminConfig) => void;
  help?: string;
  disabled?: boolean;
}) {
  const [min, max] = CONFIG_LIMITS[field];
  return (
    <Stepper
      label={label}
      value={draft[field]}
      min={min}
      max={max}
      onChange={(n) => onChange({ ...draft, [field]: n })}
      lessLabel={SETTINGS.less(label)}
      moreLabel={SETTINGS.more(label)}
      help={help ? `${help} ${SETTINGS.between(min, max)}` : SETTINGS.between(min, max)}
      disabled={disabled}
    />
  );
}

export function SettingsTab() {
  const weeklyId = useId();
  const weeklyHelpId = useId();
  const [saved, setSaved] = useState<AdminConfig | null>(null);
  const [draft, setDraft] = useState<AdminConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const config = await api.config();
      setSaved(config);
      setDraft(config);
      setLoadError(null);
    } catch (err) {
      const c = errorCode(err);
      if (c !== 'unauthorized') setLoadError(ERRORS[c]);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const dirty = saved !== null && draft !== null && configChanged(saved, draft);

  const edit = (next: AdminConfig) => {
    setDraft(next);
    setError(null);
    setSavedAt(null);
  };

  const save = async (e: Event) => {
    e.preventDefault();
    if (busy || !draft) return;
    // The steppers already keep every number in bounds; this also covers a stale or odd value.
    const clean = parseAppConfig(draft);
    setBusy(true);
    setError(null);
    try {
      const kept = await api.saveConfig(clean);
      setSaved(kept);
      setDraft(kept);
      setSavedAt(Date.now());
      showToast(SETTINGS.saved);
    } catch (err) {
      const c = errorCode(err);
      if (c !== 'unauthorized') setError(ERRORS[c]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section class="ad-section" aria-labelledby="settings-title">
      <div class="ad-section-head">
        <div>
          <h1 id="settings-title" class="ad-title">
            {SETTINGS.title}
          </h1>
          <p class="ad-lead">{SETTINGS.lead}</p>
        </div>
      </div>

      {loadError && <LoadError text={loadError} onRetry={() => void load()} />}

      {draft === null ? (
        !loadError && <p class="ad-loading">{STR.loading}</p>
      ) : (
        <form class="ad-form ad-settings" onSubmit={(e) => void save(e)} noValidate>
          <article class={`ad-card ad-panel ad-setting${draft.openAll ? ' is-open' : ''}`}>
            <Switch
              label={SETTINGS.openAll}
              checked={draft.openAll}
              onChange={(openAll) => edit({ ...draft, openAll })}
              help={SETTINGS.openAllHelp}
            />
            {saved?.openAll && <p class="ad-setting-note">{SETTINGS.openAllOn}</p>}
          </article>

          <article class="ad-card ad-panel">
            <h2 class="ad-card-title">{SETTINGS.adsTitle}</h2>
            <Switch
              label={SETTINGS.adsEnabled}
              checked={draft.adsEnabled}
              onChange={(adsEnabled) => edit({ ...draft, adsEnabled })}
              help={SETTINGS.adsEnabledHelp}
            />
            <div class="ad-setting-grid">
              <NumberSetting
                label={SETTINGS.adSeconds}
                field="adSeconds"
                draft={draft}
                onChange={edit}
                disabled={!draft.adsEnabled}
              />
              <NumberSetting
                label={SETTINGS.adEveryGames}
                field="adEveryGames"
                draft={draft}
                onChange={edit}
                disabled={!draft.adsEnabled}
              />
              <NumberSetting
                label={SETTINGS.adMinGapMin}
                field="adMinGapMin"
                draft={draft}
                onChange={edit}
                disabled={!draft.adsEnabled}
              />
            </div>
          </article>

          <article class="ad-card ad-panel">
            <h2 class="ad-card-title">{SETTINGS.trialTitle}</h2>
            <NumberSetting
              label={SETTINGS.trialMinutes}
              field="trialMinutes"
              draft={draft}
              onChange={edit}
              help={SETTINGS.trialHelp}
            />
          </article>

          <article class="ad-card ad-panel">
            <h2 class="ad-card-title">{SETTINGS.weeklyTitle}</h2>
            <div class="ad-field">
              <label class="ad-label" for={weeklyId}>
                {SETTINGS.weeklyField}
              </label>
              <select
                id={weeklyId}
                class="ad-input ad-select"
                value={draft.weeklyGame ?? ''}
                aria-describedby={weeklyHelpId}
                onChange={(e) => edit({ ...draft, weeklyGame: e.currentTarget.value || null })}
              >
                <option value="">{SETTINGS.weeklyAuto}</option>
                {/* A game this build no longer lists still shows, so saving does not drop it silently. */}
                {draft.weeklyGame && !WEEKLY_OPTIONS.some((o) => o.id === draft.weeklyGame) && (
                  <option value={draft.weeklyGame}>{draft.weeklyGame}</option>
                )}
                {WEEKLY_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title}
                  </option>
                ))}
              </select>
              <p id={weeklyHelpId} class="ad-help">
                {SETTINGS.weeklyHelp}
              </p>
            </div>
          </article>

          <div class={`ad-savebar${dirty ? ' is-dirty' : ''}`}>
            <p class="ad-savebar-state" aria-live="polite">
              {dirty ? SETTINGS.unsaved : savedAt !== null ? SETTINGS.savedAt(formatDateTime(savedAt)) : ''}
            </p>
            <ErrorText text={error} />
            <div class="ad-savebar-actions">
              <button
                type="button"
                class="ad-btn ad-btn--ghost"
                disabled={!dirty || busy}
                onClick={() => saved && edit(saved)}
              >
                {SETTINGS.reset}
              </button>
              <button type="submit" class="ad-btn ad-btn--primary" disabled={!dirty || busy}>
                {busy ? STR.saving : SETTINGS.save}
              </button>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}
