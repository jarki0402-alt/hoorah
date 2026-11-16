/** Sign-in screen. */
import { ADMIN_PASSWORD_MAX, ADMIN_USERNAME_MAX } from '@hoorah/protocol';
import { useId, useState } from 'preact/hooks';
import { Logo } from '../shared/ui';
import { api, errorCode } from './api';
import { session } from './state';
import { ERRORS, STR } from './strings';
import { ErrorText } from './ui';

export function Login({ notice }: { notice: string | null }) {
  const userId = useId();
  const passId = useId();
  const errId = useId();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (busy) return;
    const name = username.trim();
    if (!name || !password) {
      setError(STR.loginMissing);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const me = await api.login(name, password);
      session.value = { state: 'in', username: me.username };
    } catch (err) {
      setError(ERRORS[errorCode(err)]);
      setBusy(false);
    }
  };

  return (
    <main class="ad-login">
      <form class="ad-login-card" onSubmit={(e) => void submit(e)} noValidate aria-describedby={errId}>
        <div class="ad-login-brand">
          <Logo size={34} />
          <span class="ad-pill">{STR.admin}</span>
        </div>
        <h1 class="sr-only">{STR.pageTitle}</h1>
        <p class={`ad-login-lead${notice ? ' is-notice' : ''}`}>{notice ?? STR.loginLead}</p>
        <div class="ad-field">
          <label class="ad-label" for={userId}>
            {STR.username}
          </label>
          <input
            id={userId}
            class="ad-input"
            type="text"
            name="username"
            value={username}
            maxLength={ADMIN_USERNAME_MAX}
            autoComplete="username"
            autoCapitalize="none"
            spellcheck={false}
            autoFocus
            aria-invalid={error ? true : undefined}
            onInput={(e) => setUsername(e.currentTarget.value)}
          />
        </div>
        <div class="ad-field">
          <label class="ad-label" for={passId}>
            {STR.password}
          </label>
          <input
            id={passId}
            class="ad-input"
            type="password"
            name="password"
            value={password}
            maxLength={ADMIN_PASSWORD_MAX}
            autoComplete="current-password"
            aria-invalid={error ? true : undefined}
            onInput={(e) => setPassword(e.currentTarget.value)}
          />
        </div>
        <ErrorText id={errId} text={error} />
        <button type="submit" class="ad-btn ad-btn--primary ad-btn--wide ad-btn--tall" disabled={busy}>
          {busy ? STR.loggingIn : STR.login}
        </button>
      </form>
    </main>
  );
}
