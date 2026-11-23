import { formatRoomCode } from '@hoorah/protocol';
import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useMemo } from 'preact/hooks';
import qrcode from 'qrcode-generator';
import { pointerMoved } from '../shared/cursor';
import { Avatar, Icon, Logo, LogoMark } from '../shared/ui';
import { formatUntil } from '../shared/when';
import { canFullscreen, isFullscreen } from './fullscreen';
import { focus, focused, press, setFocusMap } from './nav';
import {
  audioOn,
  code,
  connected,
  maxPlayers,
  muted,
  netStatus,
  page,
  pressFullscreen,
  pressSound,
  reactions,
  roomPass,
  setInviting,
  toasts,
} from './store';
import { STR } from './strings';

/** Where phones should go. In dev on localhost we use the LAN origin injected by the dev script. */
export function joinOrigin(): string {
  const lan = import.meta.env.VITE_PUBLIC_ORIGIN as string | undefined;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  return local && lan ? lan : location.origin;
}

/* ------------------------------------------------------------------ focusable */

interface FocusButtonProps {
  id: string;
  class?: string;
  style?: JSX.CSSProperties;
  children: ComponentChildren;
  'aria-label'?: string;
}

/** A button that participates in spatial focus; mouse hover focuses, click activates. */
export function FocusButton({ id, class: cls = '', style, children, ...rest }: FocusButtonProps) {
  const isFocused = focused.value === id;
  return (
    <button
      type="button"
      class={`focusable ${cls} ${isFocused ? 'focused' : ''}`}
      style={style}
      aria-label={rest['aria-label']}
      onMouseEnter={() => pointerMoved() && focus(id, true)}
      onClick={() => {
        focus(id, true);
        press('ok');
      }}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ chrome */

export function TopBar({ children }: { children?: ComponentChildren }) {
  const list = connected.value;
  return (
    <div class="topbar">
      <div class="topbar-left">
        <Logo size={30} />
        {children}
      </div>
      <div class="topbar-right">
        {list.length > 0 && (
          <div class="chip glass" style={{ padding: '4px 12px 4px 4px' }}>
            <div class="avatar-stack">
              {list.slice(0, 5).map((p) => (
                <Avatar key={p.id} fruit={p.fruit} ring={p.color} size={30} />
              ))}
            </div>
            <span style={{ fontWeight: 700, color: '#fff' }}>
              {list.length <= 2 ? list.map((p) => p.name).join(', ') : `${list.length} pemain`}
            </span>
            <span class="dot" />
          </div>
        )}
        <InviteButton />
        <div class="chip glass">
          Kode
          <span class="display" style={{ fontSize: 18, color: 'var(--yellow)', letterSpacing: '0.06em' }}>
            {formatRoomCode(code.value) || '··· ···'}
          </span>
        </div>
        <SoundButton />
        <FullscreenButton />
      </div>
    </div>
  );
}

/** Before the browser allows sound this reads "tap for sound"; afterwards it is a mute toggle. */
export function SoundButton() {
  const locked = !audioOn.value;
  return (
    <button
      type="button"
      class={`chip glass focusable ${focused.value === 'sound' ? 'focused' : ''}`}
      style={{ border: 'none', padding: locked ? '7px 12px' : 8, cursor: 'pointer' }}
      aria-label={locked ? 'Nyalakan suara' : muted.value ? 'Nyalakan suara' : 'Matikan suara'}
      onMouseEnter={() => pointerMoved() && focus('sound', true)}
      onClick={pressSound}
    >
      <Icon name={locked || muted.value ? 'mute' : 'volume'} size={17} color="#DADCE0" />
      {locked && <span>Klik untuk suara</span>}
    </button>
  );
}

export function FullscreenButton({ label = false }: { label?: boolean }) {
  if (!canFullscreen) return null;
  const on = isFullscreen.value;
  return (
    <button
      type="button"
      class={`chip glass focusable ${focused.value === 'fullscreen' ? 'focused' : ''}`}
      style={{ border: 'none', padding: label ? '7px 12px' : 8, cursor: 'pointer' }}
      aria-label={on ? 'Keluar layar penuh' : 'Layar penuh'}
      onMouseEnter={() => pointerMoved() && focus('fullscreen', true)}
      onClick={pressFullscreen}
    >
      <Icon name={on ? 'compress' : 'expand'} size={17} color="#DADCE0" />
      {label && <span>{on ? 'Keluar layar penuh' : 'Layar penuh'}</span>}
    </button>
  );
}

/** "+ Tambah pemain" in the home top bar: opens the QR panel without leaving the page. */
export function InviteButton() {
  return (
    <button
      type="button"
      class={`chip glass invite-chip focusable ${focused.value === 'invite' ? 'focused' : ''}`}
      onMouseEnter={() => pointerMoved() && focus('invite', true)}
      onClick={() => setInviting(true)}
    >
      <Icon name="plus" size={16} color="#111214" />
      Tambah pemain
    </button>
  );
}

/**
 * QR and code over the current page (home, or the pause menu). Owns the focus while open; the
 * page underneath reinstalls its own map when `inviting` goes back to false.
 */
export function InvitePanel({ inGame = false }: { inGame?: boolean }) {
  useEffect(() => {
    return setFocusMap(
      {
        rows: [['close']],
        onOk: () => setInviting(false),
        onBack: () => setInviting(false),
        onMenu: () => setInviting(false),
      },
      'close',
    );
  }, []);
  const origin = joinOrigin();
  const used = connected.value.length;
  const pass = roomPass.value;
  const full = used >= maxPlayers.value;
  return (
    <div class="overlay" style={{ background: 'rgba(17,18,20,0.86)' }}>
      <div class="invite-panel on-surface">
        <div class="invite-copy">
          <div class="eyebrow">Tambah pemain</div>
          <h1 class="display" style={{ margin: 0, fontSize: 40, lineHeight: 1.05 }}>
            Scan untuk ikut main
          </h1>
          <div class="invite-hint">
            atau buka <b>{origin.replace(/^https?:\/\//, '')}</b> lalu ketik
          </div>
          <div class="display room-code invite-code">{formatRoomCode(code.value)}</div>
          <div class={`invite-seats ${full ? 'is-full' : ''}`}>
            {pass ? (
              STR.seatsPass(used, maxPlayers.value, formatUntil(pass.expiresAt))
            ) : full ? (
              STR.seatsFull(used, maxPlayers.value)
            ) : inGame ? (
              <>
                Kursi terisi {used}/{maxPlayers.value}. Pemain baru ikut mulai giliran atau game berikutnya.
              </>
            ) : (
              <>
                Kursi terisi {used}/{maxPlayers.value}. HP di Wi-Fi yang sama juga bisa langsung memilih layar
                ini.
              </>
            )}
          </div>
          <FocusButton id="close" class="menu-item" style={{ alignSelf: 'flex-start' }}>
            Selesai
          </FocusButton>
        </div>
        <QrWithLogo text={`${origin}/?r=${code.value}`} size={260} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ QR */

export function QrCode({ text, size }: { text: string; size: number }) {
  const { d, n } = useMemo(() => {
    const qr = qrcode(0, 'Q');
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    let path = '';
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) if (qr.isDark(r, c)) path += `M${c} ${r}h1v1h-1z`;
    }
    return { d: path, n: count };
  }, [text]);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`-1 -1 ${n + 2} ${n + 2}`}
      role="img"
      aria-label="QR Code untuk bergabung"
      shape-rendering="crispEdges"
    >
      <rect x="-1" y="-1" width={n + 2} height={n + 2} fill="#fff" />
      <path d={d} fill="#111214" />
    </svg>
  );
}

export function QrWithLogo({ text, size }: { text: string; size: number }) {
  return (
    <div class="qr-card">
      <QrCode text={text} size={size} />
      <div class="qr-logo">
        <LogoMark size={Math.round(size * 0.16)} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ overlays */

export function Toasts() {
  // On the join screen the player list already announces arrivals, so only replies to the
  // Host's own commands (toasts without a player) show there.
  const list = page.value === 'join' ? toasts.value.filter((t) => !t.player) : toasts.value;
  if (list.length === 0) return null;
  return (
    <div class="toasts" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} class={`toast ${t.player ? '' : 'plain'}`}>
          {t.player && <Avatar fruit={t.player.fruit} ring={t.player.color} size={28} />}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

const REACTION_TEXT = {
  cheer: 'Sorak!',
  clap: 'Tepuk tangan!',
  boo: 'Huuu~',
  rematch: 'Minta revans!',
} as const;

export function Reactions() {
  return (
    <div class="reactions" aria-hidden="true">
      {reactions.value.map((r, i) => (
        <div
          key={r.id}
          class={`reaction ${r.r === 'boo' ? 'boo' : ''}`}
          style={{ left: `${(i * 47) % 160}px` }}
        >
          <Avatar fruit={r.player.fruit} ring={r.player.color} size={28} />
          {r.player.name}: {REACTION_TEXT[r.r]}
        </div>
      ))}
    </div>
  );
}

export function NetBanner() {
  const s = netStatus.value;
  if (s === 'open') return null;
  return (
    <div class="net-banner" role="status">
      <span class="spinner" />
      {s === 'connecting' ? 'Menyiapkan room…' : 'Menyambung ulang ke server…'}
    </div>
  );
}
