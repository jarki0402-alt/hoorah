/**
 * Entering a Hoorah Pass code on the phone (trial stage, see packages/protocol/src/pass.ts):
 * inline on the "room full" page (joins with it), or in a sheet from the invite card in the room.
 */
import { isPassCode, normalizePassCode, PASS_CODE_MAX } from '@hoorah/protocol';
import { useEffect, useRef, useState } from 'preact/hooks';
import { formatUntil } from '../shared/when';
import { passState, resetPassState, roomSeats, submitPass } from './store';
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

export function PassSheet({ onClose }: { onClose: () => void }) {
  const ok = passState.value.s === 'ok';
  // The parent re-renders with a new callback on every player update; keep the timer steady.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    resetPassState();
    return resetPassState;
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
        <button type="button" class="big-btn secondary" onClick={onClose}>
          {STR.passClose}
        </button>
      </div>
    </div>
  );
}
