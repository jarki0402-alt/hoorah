/**
 * "Main bareng teman jauh" (long-distance play, owner 2026-11-24). On the Host's main screen: the
 * home button, the panel with the far-away link and its QR, the top bar chip. On a far-away main
 * screen: the chip naming the Host, the corner QR for the phones there, and the waiting/ended card.
 */
import { formatRoomCode } from '@hoorah/protocol';
import { useEffect } from 'preact/hooks';
import { pointerMoved } from '../shared/cursor';
import { Icon } from '../shared/ui';
import { FocusButton, inviteUrl, joinOrigin, QrCard } from './components';
import { mirrorPath } from './mirror';
import { focus, focused, setFocusMap } from './nav';
import {
  closeRemotePanel,
  code,
  host,
  inviting,
  isMirror,
  leadOnline,
  mirrorCount,
  mirrorEnd,
  mirrorKey,
  netStatus,
  openRemotePanel,
  page,
  retryMirror,
  sfx,
  stopMirrors,
  toast,
} from './store';
import { REMOTE } from './strings';

export const REMOTE_ID = 'remote';

/** The far-away main screen link as people read and copy it (`192.168.1.5:1010/J/482917-K7M2Q9XA`). */
export function mirrorUrl(roomCode: string, key: string): string {
  return `${joinOrigin()}${mirrorPath(roomCode, key)}`;
}

/** Copying needs a secure page (HTTPS or localhost); elsewhere the button is left out. */
const canCopy = typeof navigator !== 'undefined' && !!navigator.clipboard && window.isSecureContext;

function copyLink(text: string): void {
  void navigator.clipboard.writeText(text).then(
    () => {
      toast(REMOTE.copied);
      sfx('select');
    },
    () => {
      toast(REMOTE.copyFailed);
      sfx('wrong');
    },
  );
}

/**
 * Home top bar, left: opens the panel. While a far-away main screen watches it turns into the
 * green "Teman jauh tersambung" chip (still opening the panel). Not on a far-away main screen.
 */
export function RemoteButton() {
  if (isMirror) return null;
  const on = mirrorCount.value > 0;
  return (
    <button
      type="button"
      class={`chip glass remote-btn focusable ${on ? 'is-on' : ''} ${focused.value === REMOTE_ID ? 'focused' : ''}`}
      onMouseEnter={() => pointerMoved() && focus(REMOTE_ID, true)}
      onClick={openRemotePanel}
    >
      <span class="remote-btn-icon">
        <Icon name="wifi" size={18} stroke={2.6} color="#111214" />
      </span>
      <span class="remote-btn-text">
        <b class="remote-btn-title">{on ? REMOTE.chipOn : REMOTE.button}</b>
        <small class="remote-btn-sub">{on ? REMOTE.connected(mirrorCount.value) : REMOTE.buttonSub}</small>
      </span>
    </button>
  );
}

/** Far-away main screen, top bar: whose room this is (the Host's name). */
export function RemoteChip() {
  if (!isMirror) return null;
  const h = host.value;
  return (
    <div class="chip remote-chip">
      <Icon name="wifi" size={15} stroke={2.6} color="#111214" />
      {REMOTE.farChip}
      {h && <span class="remote-chip-host">{REMOTE.farHost(h.name)}</span>}
    </div>
  );
}

/** The panel over the home page: link, QR, steps, status, copy and stop. Owns the focus while open. */
export function RemotePanel() {
  const n = mirrorCount.value;
  const key = mirrorKey.value;
  const roomCode = code.value;
  const ready = key !== '' && roomCode !== '';
  const link = ready ? mirrorUrl(roomCode, key) : '';
  const shown = link.replace(/^https?:\/\//, '');
  const on = n > 0;
  const ids = [...(canCopy && ready ? ['remote-copy'] : []), ...(on ? ['remote-stop'] : []), 'remote-close'];
  const idsKey = ids.join(',');

  useEffect(
    () =>
      setFocusMap(
        {
          rows: [ids],
          onOk: (id) => {
            if (id === 'remote-copy') return copyLink(link);
            if (id === 'remote-stop') return stopMirrors();
            closeRemotePanel();
          },
          onBack: closeRemotePanel,
          onMenu: closeRemotePanel,
          onMove: () => sfx('tick'),
        },
        ids.includes(focused.peek()) ? focused.peek() : 'remote-close',
      ),
    [idsKey, link],
  );

  return (
    <div class="overlay" style={{ background: 'rgba(17,18,20,0.9)' }}>
      <div class="invite-panel remote-panel on-surface">
        <div class="remote-copy">
          <div class="eyebrow">{REMOTE.eyebrow.toUpperCase()}</div>
          <h1 class="display remote-title">{REMOTE.title}</h1>
          <div class="remote-link-label">{REMOTE.linkLabel}</div>
          <div class="remote-link">{shown || '···'}</div>
          <ol class="remote-steps">
            {REMOTE.steps.map((s, i) => (
              <li key={s}>
                <span class="howto-num">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
          <div class={`remote-status ${on ? 'is-on' : ''}`} role="status">
            {on ? <span class="dot" /> : <span class="spinner" />}
            {on ? REMOTE.connected(n) : REMOTE.waiting}
          </div>
          <div class="remote-note">{REMOTE.gamesNote}</div>
          <div class="remote-actions">
            {canCopy && ready && (
              <FocusButton id="remote-copy" class="menu-item">
                {REMOTE.copy}
              </FocusButton>
            )}
            {on && (
              <FocusButton id="remote-stop" class="menu-item">
                {REMOTE.stop}
              </FocusButton>
            )}
            <FocusButton id="remote-close" class="menu-item">
              {REMOTE.close}
            </FocusButton>
          </div>
        </div>
        {ready && (
          <div class="remote-qr" role="img" aria-label={REMOTE.qrLabel}>
            {/* Capitals: the compact QR mode, like the invite (main.ts reads any case). */}
            <QrCard text={link.toUpperCase()} size={250} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Pages of a far-away main screen that keep a small join QR in the corner for the phones there. */
const BADGE_PAGES = ['home', 'detail', 'results', 'party'] as const;

/** Far-away main screen: the room's join QR in the corner, so phones there can join any time. */
export function FarBadge() {
  const p = page.value;
  if (!isMirror || inviting.value || !code.value || !(BADGE_PAGES as readonly string[]).includes(p))
    return null;
  return (
    <div class={`far-badge ${p === 'detail' ? 'is-top' : ''}`}>
      <QrCard text={inviteUrl(code.value)} size={104} />
      <div class="far-badge-copy">
        <span>{REMOTE.farJoin}</span>
        <b class="display far-badge-code">{formatRoomCode(code.value)}</b>
      </div>
    </div>
  );
}

/** Far-away main screen: the Host's main screen is away (waiting), or the link stopped working. */
export function FarOverlay() {
  const end = mirrorEnd.value;
  const waiting = !end && netStatus.value === 'open' && !leadOnline.value;
  useEffect(() => {
    if (!end) return;
    // A remote or keyboard on this screen can still try again (Enter / OK).
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') retryMirror();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [end]);
  if (!isMirror || (!end && !waiting)) return null;
  return (
    <div class="overlay pause-screen far-overlay" role="status">
      <div class="pause-card">
        {end ? <Icon name="wifi" size={64} color="#FFC928" /> : <span class="spinner far-spinner" />}
        <h1 class="display far-title">{end ? REMOTE.farEndTitle : REMOTE.farWaitTitle}</h1>
        <div class="far-text">{end ? REMOTE.farEnd[end] : REMOTE.farWaitText}</div>
        {end && (
          <button type="button" class="btn primary" onClick={retryMirror}>
            {REMOTE.retry}
          </button>
        )}
      </div>
    </div>
  );
}
