/** One pass in the list: code, status, usage, and its actions. */
import type { AdminPass, PassStatus } from '@hoorah/protocol';
import { useState } from 'preact/hooks';
import { api, errorCode } from './api';
import { CodeButton, CopyButton } from './copy-button';
import { formatDateTime, formatDuration, formatRelative } from './format';
import { effectiveStatus } from './logic';
import { ExtendSheet, passMessage } from './pass-forms';
import { showToast } from './state';
import { ERRORS, STATUS, STR } from './strings';
import { AdminIcon, type AdminIconName, ConfirmDialog } from './ui';

type Dialog = 'extend' | 'revoke' | 'delete' | null;

interface PassCardProps {
  pass: AdminPass;
  now: number;
  onChange: (p: AdminPass) => void;
  onRemove: (id: number) => void;
}

function Fact({ icon, text, live = false }: { icon: AdminIconName; text: string; live?: boolean }) {
  return (
    <li class={`ad-fact${live ? ' is-live' : ''}`}>
      <AdminIcon name={icon} size={16} />
      <span>{text}</span>
    </li>
  );
}

function timeLine(p: AdminPass, status: PassStatus, now: number): { main: string; sub: string | null } {
  if (status === 'revoked') {
    return {
      main: STR.revokedAt(formatDateTime(p.revokedAt ?? now, { now })),
      sub: STR.until(formatDateTime(p.expiresAt, { now })),
    };
  }
  if (status === 'expired')
    return { main: STR.endedAt(formatDateTime(p.expiresAt, { weekday: 'none', now })), sub: null };
  return {
    main: STR.remaining(formatDuration(p.expiresAt - now)),
    sub: STR.until(formatDateTime(p.expiresAt, { now })),
  };
}

export function PassCard({ pass, now, onChange, onRemove }: PassCardProps) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = effectiveStatus(pass, now);
  const time = timeLine(pass, status, now);
  const soon = status === 'active' && pass.expiresAt - now < 3 * 60 * 60_000;

  const open = (d: Dialog) => {
    setError(null);
    setDialog(d);
  };
  const close = () => {
    if (!busy) setDialog(null);
  };

  const setRevoked = async (revoked: boolean) => {
    setBusy(true);
    setError(null);
    try {
      onChange(await api.updatePass(pass.id, { revoked }));
      showToast(revoked ? STR.revoked : STR.reactivated);
      setDialog(null);
    } catch (err) {
      const c = errorCode(err);
      if (c === 'unauthorized') return;
      if (revoked) setError(ERRORS[c]);
      else showToast(ERRORS[c], 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.deletePass(pass.id);
      showToast(STR.removed);
      setDialog(null);
      onRemove(pass.id);
    } catch (err) {
      const c = errorCode(err);
      if (c === 'unauthorized') return;
      if (c === 'not_found') {
        // Already gone (another device deleted it): drop it here too.
        setDialog(null);
        onRemove(pass.id);
        return;
      }
      setError(ERRORS[c]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article class={`ad-card ad-pass is-${status}`} aria-label={pass.code}>
      <div class="ad-pass-head">
        <CodeButton code={pass.code} />
        <span class={`ad-badge ad-badge--${status}`}>{STATUS[status]}</span>
      </div>
      <p class="ad-pass-label">{pass.label}</p>

      <p class={`ad-pass-time${soon ? ' is-soon' : ''}`}>
        <strong>{time.main}</strong>
        {time.sub && <span>{time.sub}</span>}
      </p>

      <ul class="ad-facts">
        <Fact icon="users" text={STR.upToPlayers(pass.maxPlayers)} />
        {(status === 'active' || pass.liveRooms > 0) && (
          <Fact icon="tv" text={STR.liveRooms(pass.liveRooms, pass.maxRooms)} live={pass.liveRooms > 0} />
        )}
        <Fact icon="grid" text={STR.usage(pass.roomsUsed, pass.peakPlayers)} />
        {pass.lastUsedAt !== null && (
          <Fact icon="clock" text={STR.lastUsed(formatRelative(pass.lastUsedAt, now))} />
        )}
      </ul>

      <fieldset class="ad-actions">
        <legend class="sr-only">{STR.actionsFor(pass.code)}</legend>
        {status === 'active' && (
          <CopyButton class="ad-btn ad-btn--small" label={STR.copyMessage} text={() => passMessage(pass)} />
        )}
        {status !== 'revoked' && (
          <button type="button" class="ad-btn ad-btn--small" onClick={() => open('extend')}>
            <AdminIcon name="clock" />
            <span>{STR.extend}</span>
          </button>
        )}
        {status === 'active' && (
          <button type="button" class="ad-btn ad-btn--small ad-btn--ghost" onClick={() => open('revoke')}>
            <AdminIcon name="lock" />
            <span>{STR.revoke}</span>
          </button>
        )}
        {status === 'revoked' && (
          <button
            type="button"
            class="ad-btn ad-btn--small"
            disabled={busy}
            onClick={() => void setRevoked(false)}
          >
            <AdminIcon name="undo" />
            <span>{busy ? STR.saving : STR.reactivate}</span>
          </button>
        )}
        <button
          type="button"
          class="ad-btn ad-btn--small ad-btn--ghost ad-btn--quiet-danger"
          onClick={() => open('delete')}
        >
          <AdminIcon name="trash" />
          <span>{STR.remove}</span>
        </button>
      </fieldset>

      {dialog === 'extend' && <ExtendSheet pass={pass} onClose={close} onSaved={onChange} />}
      {dialog === 'revoke' && (
        <ConfirmDialog
          title={STR.revokeTitle(pass.code)}
          body={STR.revokeBody}
          confirm={STR.revokeConfirm}
          busy={busy}
          error={error}
          onConfirm={() => void setRevoked(true)}
          onClose={close}
        />
      )}
      {dialog === 'delete' && (
        <ConfirmDialog
          title={STR.removeTitle(pass.code)}
          body={STR.removeBody}
          confirm={STR.removeConfirm}
          busy={busy}
          error={error}
          onConfirm={() => void remove()}
          onClose={close}
        />
      )}
    </article>
  );
}
