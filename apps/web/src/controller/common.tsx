import { type ControllerView, type Fruit, formatRoomCode, type Look } from '@hoorah/protocol';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Avatar, Icon } from '../shared/ui';
import { code, me, netStatus, players, roomAccess, serverNow, view } from './store';
import { STR } from './strings';

export type V<K extends ControllerView['kind']> = Extract<ControllerView, { kind: K }>;

/* ------------------------------------------------------------------ helpers */

export function useSecondsLeft(deadline?: number): number | null {
  const calc = () => (deadline ? Math.max(0, Math.ceil((deadline - serverNow()) / 1000)) : null);
  const [left, setLeft] = useState(calc);
  useEffect(() => {
    if (!deadline) return;
    setLeft(calc());
    const t = window.setInterval(() => setLeft(calc()), 200);
    return () => window.clearInterval(t);
  }, [deadline]);
  return left;
}

export function Timer({ deadline }: { deadline?: number }) {
  const left = useSecondsLeft(deadline);
  if (left === null) return null;
  return <div class={`display timer ${left <= 3 ? 'is-low' : ''}`}>{left}</div>;
}

/** Connection, HOST badge (centred) and room code, at the top of the lobby, Host pad and picker. */
export function StatusRow() {
  const p = me.value;
  return (
    <div class="status-row">
      <span class="pill">
        <span
          class="dot"
          style={{ background: netStatus.value === 'open' ? 'var(--green)' : 'var(--yellow)' }}
        />
        <span class="status-label">{netStatus.value === 'open' ? 'Terhubung' : 'Menyambung…'}</span>
      </span>
      {p?.isHost ? (
        <span class="badge">
          <Icon name="crown" size={13} color="#111214" /> HOST
        </span>
      ) : (
        <span />
      )}
      <span class="pill">
        <span class="status-label">Kode</span>{' '}
        <b style={{ color: 'var(--yellow)' }}>{formatRoomCode(code.value)}</b>
      </span>
    </div>
  );
}

/** This player's avatar; `look`/`fruit` when the phone steers another character (solo: the second one). */
export function Me({ size = 38, look, fruit }: { size?: number; look?: Look; fruit?: Fruit }) {
  const p = me.value;
  if (!p) return null;
  return <Avatar look={look ?? (fruit ? undefined : p.look)} fruit={fruit} ring={p.color} size={size} />;
}

export function PlayerAvatar({ id, size }: { id: number; size: number }) {
  // Room players first, then computer opponents the current view lists (negative ids).
  const p = players.value.find((x) => x.id === id) ?? view.value?.guests?.find((g) => g.id === id);
  return p ? <Avatar look={p.look} fruit={p.fruit} ring={p.color} size={size} /> : null;
}

/** Press feedback that never waits for the network. */
export function usePress(): [boolean, () => void] {
  const [pressed, setPressed] = useState(false);
  const timer = useRef(0);
  const fire = () => {
    setPressed(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPressed(false), 140);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return [pressed, fire];
}

/**
 * What the room has, on the phone too (owner 2026-11-23): grey "Gratis", orange "Coba gratis ·
 * 42 mnt", yellow "PASS" or blue "Uji coba".
 */
export function AccessBadge() {
  const a = roomAccess.value;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (a.kind !== 'trial') return;
    const t = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(t);
  }, [a.kind]);
  if (a.kind === 'trial' && a.until !== null) {
    const min = Math.max(1, Math.ceil((a.until - now) / 60_000));
    return <span class="access-badge is-trial">{STR.accessTrial(min)}</span>;
  }
  if (a.kind === 'pass') {
    return (
      <span class="access-badge is-pass">
        <Icon name="crown" size={12} color="#111214" /> {STR.accessPass}
      </span>
    );
  }
  if (a.kind === 'open') return <span class="access-badge is-open">{STR.accessOpen}</span>;
  return <span class="access-badge is-free">{STR.accessFree}</span>;
}
