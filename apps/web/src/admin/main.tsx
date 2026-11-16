/**
 * Admin dashboard (`/admin/`): the owner signs in to hand out Hoorah Pass codes and watch rooms
 * and the server. Mobile first: most passes are made on a phone and shared over WhatsApp.
 */
import '@fontsource/baloo-2/latin-800.css';
import '@fontsource/plus-jakarta-sans/latin-400.css';
import '@fontsource/plus-jakarta-sans/latin-600.css';
import '@fontsource/plus-jakarta-sans/latin-700.css';
import '@fontsource/plus-jakarta-sans/latin-800.css';
import '../shared/base.css';
import './admin.css';
import type { JSX } from 'preact';
import { render } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { LogoMark } from '../shared/ui';
import { AccountTab } from './account-tab';
import { api, errorCode, setUnauthorizedHandler } from './api';
import { Login } from './login';
import { PassTab } from './pass-tab';
import { RoomTab } from './room-tab';
import { SecurityTab } from './security-tab';
import { ServerTab } from './server-tab';
import { openTab, session, TAB_IDS, type TabId, tab, toast } from './state';
import { ERRORS, STR, TABS } from './strings';
import { AdminIcon } from './ui';
import { UsageTab } from './usage-tab';

setUnauthorizedHandler(() => {
  if (session.value.state === 'in') session.value = { state: 'out', notice: STR.sessionEnded };
});

/* ------------------------------------------------------------------ Tabs */

function TabBar() {
  const refs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});
  // On a phone the tabs scroll sideways: keep the open one in view.
  useEffect(() => {
    refs.current[tab.value]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [tab.value]);
  const onKey = (e: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
    const at = TAB_IDS.indexOf(tab.value);
    const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };
    let next: TabId | undefined;
    if (e.key in step) next = TAB_IDS[(at + (step[e.key] ?? 0) + TAB_IDS.length) % TAB_IDS.length];
    else if (e.key === 'Home') next = TAB_IDS[0];
    else if (e.key === 'End') next = TAB_IDS[TAB_IDS.length - 1];
    if (!next) return;
    e.preventDefault();
    openTab(next);
    refs.current[next]?.focus();
  };
  return (
    <div class="ad-tabs" role="tablist" aria-label={STR.tabsLabel} onKeyDown={onKey}>
      {TAB_IDS.map((id) => {
        const on = tab.value === id;
        return (
          <button
            key={id}
            ref={(el) => {
              refs.current[id] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${id}`}
            class={`ad-tab${on ? ' is-on' : ''}`}
            aria-selected={on}
            aria-controls={on ? `panel-${id}` : undefined}
            tabIndex={on ? 0 : -1}
            onClick={() => openTab(id)}
          >
            {TABS[id]}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ Shell */

function TopBar({ username }: { username: string }) {
  const [busy, setBusy] = useState(false);
  const logout = async () => {
    setBusy(true);
    try {
      await api.logout();
    } catch {
      // Signed out locally either way; the cookie expires on its own.
    }
    session.value = { state: 'out', notice: null };
  };
  return (
    <div class="ad-topbar">
      <div class="ad-brand">
        <LogoMark size={30} />
        <span class="ad-wordmark display">hoorah</span>
        <span class="ad-pill">{STR.admin}</span>
      </div>
      <div class="ad-user">
        <span class="ad-username" title={STR.signedInAs(username)}>
          {username}
        </span>
        <button
          type="button"
          class="ad-btn ad-btn--small ad-btn--ghost"
          onClick={() => void logout()}
          disabled={busy}
        >
          <AdminIcon name="exit" />
          <span>{STR.logout}</span>
        </button>
      </div>
    </div>
  );
}

function Panel({ username }: { username: string }) {
  switch (tab.value) {
    case 'pass':
      return <PassTab />;
    case 'room':
      return <RoomTab />;
    case 'server':
      return <ServerTab />;
    case 'usage':
      return <UsageTab />;
    case 'security':
      return <SecurityTab />;
    case 'account':
      return <AccountTab username={username} />;
  }
}

function Dashboard({ username }: { username: string }) {
  const id = tab.value;
  return (
    <div class="ad-shell">
      <header class="ad-header">
        <div class="ad-header-inner">
          <TopBar username={username} />
          <TabBar />
        </div>
      </header>
      <main class="ad-main">
        <div id={`panel-${id}`} role="tabpanel" aria-labelledby={`tab-${id}`}>
          <Panel key={id} username={username} />
        </div>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ Toast */

function ToastHost() {
  const t = toast.value;
  return createPortal(
    <div class="ad-toast-host" role="status" aria-live="polite">
      {t && (
        <p key={t.id} class={`ad-toast is-${t.tone}`}>
          {t.tone === 'ok' && <AdminIcon name="check" size={16} />}
          <span>{t.text}</span>
        </p>
      )}
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ App */

function Checking({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <main class="ad-boot">
      <LogoMark size={44} />
      {error ? (
        <div class="ad-banner" role="alert">
          <span>{error}</span>
          <button type="button" class="ad-btn ad-btn--small" onClick={onRetry}>
            {STR.retry}
          </button>
        </div>
      ) : (
        <p class="ad-loading">{STR.loading}</p>
      )}
    </main>
  );
}

function App() {
  const [bootError, setBootError] = useState<string | null>(null);
  const check = async () => {
    setBootError(null);
    try {
      const me = await api.me();
      session.value = { state: 'in', username: me.username };
    } catch (err) {
      const c = errorCode(err);
      if (c === 'unauthorized') session.value = { state: 'out', notice: null };
      else setBootError(ERRORS[c]);
    }
  };
  useEffect(() => {
    void check();
  }, []);

  const s = session.value;
  return (
    <>
      {s.state === 'checking' && <Checking error={bootError} onRetry={() => void check()} />}
      {s.state === 'out' && <Login notice={s.notice} />}
      {s.state === 'in' && <Dashboard username={s.username} />}
      <ToastHost />
    </>
  );
}

const root = document.getElementById('app');
if (root) render(<App />, root);
