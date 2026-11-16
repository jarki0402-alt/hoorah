import { type ControllerView, formatRoomCode } from '@hoorah/protocol';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Avatar, Icon } from '../shared/ui';
import { code, me, netStatus, players, serverNow, view } from './store';

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
        {netStatus.value === 'open' ? 'Terhubung' : 'Menyambung…'}
      </span>
      {p?.isHost ? (
        <span class="badge">
          <Icon name="crown" size={13} color="#111214" /> HOST
        </span>
      ) : (
        <span />
      )}
      <span class="pill">
        Kode <b style={{ color: 'var(--yellow)' }}>{formatRoomCode(code.value)}</b>
      </span>
    </div>
  );
}

export function Me({ size = 38 }: { size?: number }) {
  const p = me.value;
  return p ? <Avatar fruit={p.fruit} ring={p.color} size={size} /> : null;
}

export function PlayerAvatar({ id, size }: { id: number; size: number }) {
  // Room players first, then computer opponents the current view lists (negative ids).
  const p = players.value.find((x) => x.id === id) ?? view.value?.guests?.find((g) => g.id === id);
  return p ? <Avatar fruit={p.fruit} ring={p.color} size={size} /> : null;
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
