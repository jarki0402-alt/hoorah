/** "Akun" tab: who is signed in, and changing the password (other devices are signed out). */
import { ADMIN_PASSWORD_MAX, isStrongPassword } from '@hoorah/protocol';
import { useId, useState } from 'preact/hooks';
import { api, errorCode } from './api';
import { ERRORS, STR } from './strings';
import { ErrorText } from './ui';

interface PasswordFieldProps {
  label: string;
  value: string;
  onInput: (v: string) => void;
  autoComplete: 'current-password' | 'new-password';
  describedBy?: string;
  invalid?: boolean;
}

function PasswordField({ label, value, onInput, autoComplete, describedBy, invalid }: PasswordFieldProps) {
  const id = useId();
  return (
    <div class="ad-field">
      <label class="ad-label" for={id}>
        {label}
      </label>
      <input
        id={id}
        class="ad-input"
        type="password"
        value={value}
        maxLength={ADMIN_PASSWORD_MAX}
        autoComplete={autoComplete}
        aria-describedby={describedBy}
        aria-invalid={invalid ? true : undefined}
        onInput={(e) => onInput(e.currentTarget.value)}
      />
    </div>
  );
}

export function AccountTab({ username }: { username: string }) {
  const helpId = useId();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field: 'current' | 'next' | 'repeat' | null; text: string } | null>(
    null,
  );
  const [done, setDone] = useState(false);

  const edit = (set: (v: string) => void) => (v: string) => {
    set(v);
    setError(null);
    setDone(false);
  };

  const submit = async (e: Event) => {
    e.preventDefault();
    if (busy) return;
    setDone(false);
    if (!current) return setError({ field: 'current', text: STR.passwordMissing });
    if (!isStrongPassword(next)) return setError({ field: 'next', text: STR.passwordShort });
    if (next !== repeat) return setError({ field: 'repeat', text: STR.passwordMismatch });
    if (next === current) return setError({ field: 'next', text: STR.passwordSame });
    setBusy(true);
    setError(null);
    try {
      await api.changePassword(current, next);
      setCurrent('');
      setNext('');
      setRepeat('');
      setDone(true);
    } catch (err) {
      const c = errorCode(err);
      if (c === 'unauthorized') return;
      setError({
        field: c === 'wrong_password' ? 'current' : c === 'weak_password' ? 'next' : null,
        text: ERRORS[c],
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section class="ad-section" aria-labelledby="account-title">
      <div class="ad-section-head">
        <h1 id="account-title" class="ad-title">
          {STR.accountTitle}
        </h1>
      </div>

      <div class="ad-account">
        <dl class="ad-card ad-whoami">
          <dt class="ad-stat-label">{STR.accountUser}</dt>
          <dd class="ad-whoami-name">{username}</dd>
        </dl>

        <form class="ad-card ad-form ad-password" onSubmit={(e) => void submit(e)} noValidate>
          <h2 class="ad-card-title">{STR.changePassword}</h2>
          {/* Lets password managers pair the new password with this account. */}
          <input
            type="text"
            class="sr-only"
            name="username"
            value={username}
            autoComplete="username"
            readOnly
            tabIndex={-1}
            aria-hidden="true"
          />
          <PasswordField
            label={STR.currentPassword}
            value={current}
            onInput={edit(setCurrent)}
            autoComplete="current-password"
            invalid={error?.field === 'current'}
          />
          <PasswordField
            label={STR.newPassword}
            value={next}
            onInput={edit(setNext)}
            autoComplete="new-password"
            describedBy={helpId}
            invalid={error?.field === 'next'}
          />
          <p id={helpId} class="ad-help ad-help--tight">
            {STR.passwordHelp}
          </p>
          <PasswordField
            label={STR.repeatPassword}
            value={repeat}
            onInput={edit(setRepeat)}
            autoComplete="new-password"
            invalid={error?.field === 'repeat'}
          />
          <ErrorText text={error?.text ?? null} />
          <p class="ad-success" role="status">
            {done ? STR.passwordChanged : ''}
          </p>
          <button type="submit" class="ad-btn ad-btn--primary ad-btn--wide" disabled={busy}>
            {busy ? STR.changingPassword : STR.changePassword}
          </button>
        </form>
      </div>
    </section>
  );
}
