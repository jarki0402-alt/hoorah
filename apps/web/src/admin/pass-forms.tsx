/** Sheets that write a pass: "Buat Pass" (with the share card after it) and "Perpanjang". */
import {
  type AdminPass,
  isPassCode,
  LIMITS,
  normalizePassCode,
  PASS_CODE_MIN,
  PASS_LABEL_MAX,
  PASS_MIN_PLAYERS,
} from '@hoorah/protocol';
import type { JSX } from 'preact';
import { useId, useState } from 'preact/hooks';
import { api, errorCode } from './api';
import { CodeButton, CopyButton } from './copy-button';
import { formatDateTime, fromLocalInput, toLocalInput } from './format';
import { useNow } from './hooks';
import {
  CREATE_PRESET_IDS,
  type CreatePreset,
  DEFAULT_CREATE_PRESET,
  EXTEND_STEP_IDS,
  type ExtendStep,
  endOfDay,
  extendEnd,
  isValidEnd,
  presetEnd,
} from './logic';
import { canShare, shareText } from './share';
import { showToast } from './state';
import { CREATE_PRESETS, ERRORS, EXTEND_STEPS, STR, shareMessage } from './strings';
import { AdminIcon, type ChipOption, ChipRadios, ErrorText, Modal, Stepper } from './ui';

const CUSTOM = 'custom';
type Custom = typeof CUSTOM;

/** "Sabtu, 21 Nov 23.59": the long form used in the share message and the success card. */
export const untilText = (ms: number) => formatDateTime(ms, { weekday: 'long' });

/** The message friends receive for this pass. */
export const passMessage = (p: AdminPass) => shareMessage(p.code, untilText(p.expiresAt), p.maxPlayers);

/* ------------------------------------------------------------------ End time field */

interface EndFieldProps<T extends string> {
  legend: string;
  options: readonly ChipOption<T | Custom>[];
  choice: T | Custom;
  onChoice: (v: T | Custom) => void;
  custom: string;
  onCustom: (v: string) => void;
  now: number;
  /** Resulting end, or null when the typed date is not valid. */
  end: number | null;
  summaryLabel: string;
  error: string | null;
}

function EndField<T extends string>(p: EndFieldProps<T>) {
  const dateId = useId();
  const errorId = useId();
  const maxInput = toLocalInput(p.now + 365 * 24 * 60 * 60_000);
  return (
    <ChipRadios legend={p.legend} options={p.options} value={p.choice} onChange={p.onChoice}>
      {p.choice === CUSTOM && (
        <div class="ad-subfield">
          <label class="ad-label ad-label--sub" for={dateId}>
            {STR.endDateField}
          </label>
          <input
            id={dateId}
            class="ad-input"
            type="datetime-local"
            value={p.custom}
            min={toLocalInput(p.now)}
            max={maxInput}
            aria-invalid={p.error ? true : undefined}
            aria-describedby={p.error ? errorId : undefined}
            onInput={(e) => p.onCustom(e.currentTarget.value)}
          />
        </div>
      )}
      <p class="ad-summary" aria-live="polite">
        <span class="ad-summary-label">{p.summaryLabel}</span>{' '}
        <strong class="ad-summary-value">{p.end === null ? STR.dash : untilText(p.end)}</strong>
      </p>
      <ErrorText id={errorId} text={p.error} />
    </ChipRadios>
  );
}

/* ------------------------------------------------------------------ Create */

type RoomsChoice = 'none' | '1' | '2' | '3' | '5';
const ROOM_OPTIONS: readonly ChipOption<RoomsChoice>[] = [
  { value: 'none', label: STR.unlimited },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '5', label: '5' },
];
const PRESET_OPTIONS: readonly ChipOption<CreatePreset | Custom>[] = [
  ...CREATE_PRESET_IDS.map((id) => ({ value: id, label: CREATE_PRESETS[id] })),
  { value: CUSTOM, label: STR.pickDate },
];

interface CreateErrors {
  label: string | null;
  code: string | null;
  end: string | null;
  form: string | null;
}
const NO_ERRORS: CreateErrors = { label: null, code: null, end: null, form: null };

export function CreatePassSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (p: AdminPass) => void;
}) {
  const now = useNow(30_000);
  const formId = useId();
  const labelId = useId();
  const labelErrId = useId();
  const codeId = useId();
  const codeHelpId = useId();
  const [label, setLabel] = useState('');
  const [code, setCode] = useState('');
  const [preset, setPreset] = useState<CreatePreset | Custom>(DEFAULT_CREATE_PRESET);
  const [custom, setCustom] = useState(() => toLocalInput(endOfDay(Date.now(), 1)));
  const [maxPlayers, setMaxPlayers] = useState<number>(LIMITS.maxPlayers);
  const [rooms, setRooms] = useState<RoomsChoice>('none');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<CreateErrors>(NO_ERRORS);
  const [created, setCreated] = useState<AdminPass | null>(null);

  const endAt = (t: number) => (preset === CUSTOM ? fromLocalInput(custom) : presetEnd(preset, t));
  const end = endAt(now);

  const onCode = (e: JSX.TargetedEvent<HTMLInputElement>) => {
    const next = normalizePassCode(e.currentTarget.value);
    // Keep the field in step even when normalising leaves the state unchanged ("AB-" stays "AB").
    e.currentTarget.value = next;
    setCode(next);
    if (errors.code) setErrors({ ...errors, code: null });
  };

  const submit = async (e: Event) => {
    e.preventDefault();
    if (busy) return;
    const t = Date.now();
    const expiresAt = endAt(t);
    const trimmed = label.trim();
    const found: CreateErrors = {
      label: trimmed ? null : STR.labelMissing,
      code: code && !isPassCode(code) ? STR.codeTooShort(PASS_CODE_MIN) : null,
      end: expiresAt !== null && isValidEnd(expiresAt, t) ? null : ERRORS.expired_time,
      form: null,
    };
    setErrors(found);
    if (found.label || found.code || found.end || expiresAt === null) return;
    setBusy(true);
    try {
      const pass = await api.createPass({
        label: trimmed,
        ...(code ? { code } : {}),
        expiresAt,
        maxPlayers,
        maxRooms: rooms === 'none' ? null : Number(rooms),
      });
      onCreated(pass);
      setCreated(pass);
    } catch (err) {
      const c = errorCode(err);
      if (c === 'unauthorized') return;
      if (c === 'code_taken') setErrors({ ...NO_ERRORS, code: ERRORS.code_taken });
      else if (c === 'expired_time') setErrors({ ...NO_ERRORS, end: ERRORS.expired_time });
      else setErrors({ ...NO_ERRORS, form: ERRORS[c] });
    } finally {
      setBusy(false);
    }
  };

  if (created) return <CreatedSheet pass={created} onClose={onClose} />;

  return (
    <Modal
      title={STR.createTitle}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <button type="button" class="ad-btn ad-btn--ghost" onClick={onClose} disabled={busy}>
            {STR.cancel}
          </button>
          <button type="submit" form={formId} class="ad-btn ad-btn--primary" disabled={busy}>
            {busy ? STR.creating : STR.createPass}
          </button>
        </>
      }
    >
      <form id={formId} class="ad-form" onSubmit={(e) => void submit(e)} noValidate>
        <div class="ad-field">
          <div class="ad-label-row">
            <label class="ad-label" for={labelId}>
              {STR.labelField}
            </label>
            <span class="ad-count" aria-hidden="true">
              {label.length}/{PASS_LABEL_MAX}
            </span>
          </div>
          <input
            id={labelId}
            class="ad-input"
            type="text"
            value={label}
            maxLength={PASS_LABEL_MAX}
            placeholder={STR.labelPlaceholder}
            autoComplete="off"
            required
            data-autofocus
            aria-invalid={errors.label ? true : undefined}
            aria-describedby={labelErrId}
            onInput={(e) => {
              setLabel(e.currentTarget.value);
              if (errors.label) setErrors({ ...errors, label: null });
            }}
          />
          <ErrorText id={labelErrId} text={errors.label} />
          {!errors.label && <p class="ad-help">{STR.labelHelp}</p>}
        </div>

        <div class="ad-field">
          <div class="ad-label-row">
            <label class="ad-label" for={codeId}>
              {STR.codeField}
            </label>
            <span class="ad-count">{STR.codeOptional}</span>
          </div>
          <input
            id={codeId}
            class="ad-input ad-input--code"
            type="text"
            value={code}
            placeholder="SABTU16"
            autoComplete="off"
            autoCapitalize="characters"
            spellcheck={false}
            aria-invalid={errors.code ? true : undefined}
            aria-describedby={codeHelpId}
            onInput={onCode}
          />
          {errors.code ? (
            <ErrorText id={codeHelpId} text={errors.code} />
          ) : (
            <p id={codeHelpId} class="ad-help">
              {STR.codeHelp}
            </p>
          )}
        </div>

        <EndField
          legend={STR.durationField}
          options={PRESET_OPTIONS}
          choice={preset}
          onChoice={(v) => {
            setPreset(v);
            setErrors({ ...errors, end: null });
          }}
          custom={custom}
          onCustom={(v) => {
            setCustom(v);
            setErrors({ ...errors, end: null });
          }}
          now={now}
          end={end}
          summaryLabel={STR.untilLabel}
          error={errors.end}
        />

        <Stepper
          label={STR.maxPlayersField}
          value={maxPlayers}
          min={PASS_MIN_PLAYERS}
          max={LIMITS.maxPlayers}
          onChange={setMaxPlayers}
          help={STR.maxPlayersHelp(PASS_MIN_PLAYERS, LIMITS.maxPlayers)}
        />

        <ChipRadios
          legend={STR.maxRoomsField}
          options={ROOM_OPTIONS}
          value={rooms}
          onChange={setRooms}
          help={STR.maxRoomsHelp}
        />

        <ErrorText text={errors.form} />
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ Success */

function CreatedSheet({ pass, onClose }: { pass: AdminPass; onClose: () => void }) {
  const message = passMessage(pass);
  const share = async () => {
    if (!(await shareText(message))) showToast(STR.copyFailed, 'error');
  };
  return (
    <Modal
      title={STR.createdTitle}
      onClose={onClose}
      footer={
        <button type="button" class="ad-btn ad-btn--ghost ad-btn--wide" onClick={onClose}>
          {STR.done}
        </button>
      }
    >
      <div class="ad-created">
        <p class="ad-created-lead">{STR.createdLead}</p>
        <CodeButton code={pass.code} big />
        <p class="ad-created-meta">
          {STR.until(untilText(pass.expiresAt))}
          <br />
          {STR.upToPlayers(pass.maxPlayers)}
        </p>
        <div class="ad-created-actions">
          <CopyButton class="ad-btn ad-btn--primary" label={STR.copyMessage} text={() => message} />
          {canShare() && (
            <button type="button" class="ad-btn" onClick={() => void share()}>
              <AdminIcon name="share" />
              <span>{STR.share}</span>
            </button>
          )}
        </div>
        <pre class="ad-message">{message}</pre>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ Extend */

const STEP_OPTIONS: readonly ChipOption<ExtendStep | Custom>[] = [
  ...EXTEND_STEP_IDS.map((id) => ({ value: id, label: EXTEND_STEPS[id] })),
  { value: CUSTOM, label: STR.pickDate },
];

export function ExtendSheet({
  pass,
  onClose,
  onSaved,
}: {
  pass: AdminPass;
  onClose: () => void;
  onSaved: (p: AdminPass) => void;
}) {
  const now = useNow(30_000);
  const [step, setStep] = useState<ExtendStep | Custom>('1d');
  const [custom, setCustom] = useState(() => toLocalInput(extendEnd(pass.expiresAt, '1d', Date.now())));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const endAt = (t: number) =>
    step === CUSTOM ? fromLocalInput(custom) : extendEnd(pass.expiresAt, step, t);
  const end = endAt(now);

  const save = async () => {
    if (busy) return;
    const t = Date.now();
    const expiresAt = endAt(t);
    if (expiresAt === null || !isValidEnd(expiresAt, t)) {
      setError(ERRORS.expired_time);
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      onSaved(await api.updatePass(pass.id, { expiresAt }));
      showToast(STR.extended);
      onClose();
    } catch (err) {
      const c = errorCode(err);
      if (c === 'unauthorized') return;
      if (c === 'expired_time') setError(ERRORS.expired_time);
      else setFormError(ERRORS[c]);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={STR.extendTitle(pass.code)}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <button type="button" class="ad-btn ad-btn--ghost" onClick={onClose} disabled={busy}>
            {STR.cancel}
          </button>
          <button type="button" class="ad-btn ad-btn--primary" onClick={() => void save()} disabled={busy}>
            {busy ? STR.saving : STR.save}
          </button>
        </>
      }
    >
      <div class="ad-form">
        <p class="ad-summary ad-summary--plain">
          <span class="ad-summary-label">{STR.currentEnd}</span>{' '}
          <strong class="ad-summary-value">{untilText(pass.expiresAt)}</strong>
        </p>
        <EndField
          legend={STR.extend}
          options={STEP_OPTIONS}
          choice={step}
          onChoice={(v) => {
            setStep(v);
            setError(null);
          }}
          custom={custom}
          onCustom={(v) => {
            setCustom(v);
            setError(null);
          }}
          now={now}
          end={end}
          summaryLabel={STR.newEnd}
          error={error}
        />
        <ErrorText text={formError} />
      </div>
    </Modal>
  );
}
