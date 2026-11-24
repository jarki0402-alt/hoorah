/**
 * Entering a Hoorah Pass code on the phone (see packages/protocol/src/pass.ts): inline on the
 * "room full" page (joins with it), or in a sheet in the room (Host pad, lobby, in-game menus),
 * which also offers the main screen's free trial while it is unused.
 */
import { isPassCode, isPremium, normalizePassCode, PASS_CODE_MAX } from '@hoorah/protocol';
import { useEffect, useRef, useState } from 'preact/hooks';
import { formatUntil } from '../shared/when';
import {
  appConfig,
  haptic,
  passState,
  requestTrial,
  resetPassState,
  resetTrialState,
  roomAccess,
  roomSeats,
  submitPass,
  trialState,
} from './store';
import { STR } from './strings';

/** How long the "Pass aktif" confirmation stays before the sheet closes by itself. */
const CLOSE_AFTER_OK_MS = 2200;

export function PassForm({ joining }: { joining: boolean }) {
  const [value, setValue] = useState('');
  const st = passState.value;
  const busy = st.s === 'sending';
  const valid = isPassCode(value);
  return (
    <form
      class="pass-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && !busy) submitPass(value);
      }}
    >
      <label class="pass-field">
        <span class="muted pass-label">{STR.passLabel}</span>
        <input
          class="text-input pass-input"
          value={value}
          maxLength={PASS_CODE_MAX + 4}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellcheck={false}
          enterKeyHint="go"
          placeholder={STR.passPlaceholder}
          aria-invalid={st.s === 'error'}
          onInput={(e) => {
            setValue(normalizePassCode((e.target as HTMLInputElement).value));
            if (passState.value.s === 'error') resetPassState();
          }}
        />
      </label>
      {st.s === 'error' && (
        <div class="pass-msg is-error" role="alert">
          {STR.passErr[st.reason]}
        </div>
      )}
      {st.s === 'ok' && (
        <div class="pass-msg is-ok" role="status">
          {STR.passOk(roomSeats.value, formatUntil(st.pass.expiresAt))}
        </div>
      )}
      <button class="big-btn" type="submit" disabled={!valid || busy}>
        {busy ? STR.passSending : joining ? STR.passJoin : STR.passGo}
      </button>
    </form>
  );
}

/** "Coba gratis N menit" in the Pass sheet: only on a free room whose main screen has not used it. */
function TrialOffer() {
  const access = roomAccess.value;
  const st = trialState.value;
  if (access.kind !== 'free' || access.trialUsed) {
    return st.s === 'error' && st.reason === 'used' ? (
      <div class="pass-msg is-error" role="alert">
        {STR.trialErr.used}
      </div>
    ) : null;
  }
  return (
    <>
      <div class="muted">{STR.passOr}</div>
      {st.s === 'error' && (
        <div class="pass-msg is-error" role="alert">
          {STR.trialErr[st.reason]}
        </div>
      )}
      <button type="button" class="big-btn yellow" disabled={st.s === 'sending'} onClick={requestTrial}>
        {st.s === 'sending' ? STR.trialSending : STR.trialGo(appConfig.value.trialMinutes)}
      </button>
    </>
  );
}

export function PassSheet({ onClose }: { onClose: () => void }) {
  // Closes by itself once a Pass works or the trial starts from here (a Pass can still be typed
  // during a trial that was already running).
  const trialAtOpen = useRef(roomAccess.peek().kind === 'trial');
  const trialOn = !trialAtOpen.current && roomAccess.value.kind === 'trial';
  const ok = passState.value.s === 'ok' || trialOn;
  // The parent re-renders with a new callback on every player update; keep the timer steady.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    resetPassState();
    resetTrialState();
    return () => {
      resetPassState();
      resetTrialState();
    };
  }, []);
  useEffect(() => {
    if (!ok) return;
    const t = window.setTimeout(() => close.current(), CLOSE_AFTER_OK_MS);
    return () => window.clearTimeout(t);
  }, [ok]);
  return (
    <div class="sheet">
      <div class="sheet-card" role="dialog" aria-modal="true" aria-label={STR.passTitle}>
        <h2 class="title sheet-title">{STR.passTitle}</h2>
        <div class="muted">{STR.passBody}</div>
        <PassForm joining={false} />
        {trialOn ? (
          <div class="pass-msg is-ok" role="status">
            {STR.trialOk}
          </div>
        ) : (
          <TrialOffer />
        )}
        <button type="button" class="big-btn secondary" onClick={onClose}>
          {STR.passClose}
        </button>
      </div>
    </div>
  );
}

/**
 * "Punya kode Hoorah Pass?" in the room (Host pad, lobby): opens the Pass sheet. Hidden while the
 * room has everything already (Pass, trial or open mode).
 */
export function PassEntry({ class: cls = '' }: { class?: string }) {
  const [open, setOpen] = useState(false);
  if (isPremium(roomAccess.value) && !open) return null;
  return (
    <>
      <button
        type="button"
        class={`report-link pass-entry ${cls}`}
        onClick={() => {
          haptic(10);
          setOpen(true);
        }}
      >
        {STR.passEntry}
      </button>
      {open && <PassSheet onClose={() => setOpen(false)} />}
    </>
  );
}
