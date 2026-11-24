import { formatRoomCode } from '@hoorah/protocol';
import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import qrcode from 'qrcode-generator';
import { pointerMoved } from '../shared/cursor';
import { isFreeGame, weeklyGame } from '../shared/freeTier';
import type { GameId } from '../shared/games';
import { Avatar, Icon, Logo } from '../shared/ui';
import { COUNTDOWN_UNDER_MS, formatCountdown, formatUntil } from '../shared/when';
import { canFullscreen, isFullscreen } from './fullscreen';
import { focus, focused, press, setFocusMap } from './nav';
import {
  access,
  appConfig,
  audioOn,
  code,
  connected,
  isMirror,
  maxPlayers,
  mirrorEnd,
  muted,
  netStatus,
  page,
  premium,
  pressFullscreen,
  pressSound,
  reactions,
  roomPass,
  setInviting,
  toasts,
} from './store';
import { OFFER, REMOTE, STR } from './strings';

/** Where phones should go. In dev on localhost we use the LAN origin injected by the dev script. */
/**
 * The invite link the QR carries: `HTTPS://HOST/R/482917` in capitals. QR codes store capitals,
 * digits and `/:.` in a compact mode, so the code has fewer, larger squares (29 × 29 instead of
 * 33 × 33) and phone cameras lock on faster from across the room. `main.ts` turns it back into
 * `/?r=482917`; hosts and paths are case-insensitive up to that point.
 */
export function inviteUrl(roomCode: string): string {
  return `${joinOrigin()}/r/${roomCode}`.toUpperCase();
}

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

/** `extra`: chips at the start of the right side (the long-distance play chip on home). */
export function TopBar({ children, extra }: { children?: ComponentChildren; extra?: ComponentChildren }) {
  const list = connected.value;
  return (
    <div class="topbar">
      <div class="topbar-left">
        {/* "About" opens the landing page in a new tab, so the room on this screen stays open. */}
        <a
          class="topbar-home"
          href="/"
          target="_blank"
          rel="noopener"
          title={STR.about}
          aria-label={STR.about}
        >
          <Logo size={30} />
        </a>
        {children}
      </div>
      <div class="topbar-right">
        {extra}
        {list.length > 0 && (
          <div class="chip glass" style={{ padding: '4px 12px 4px 4px' }}>
            <div class="avatar-stack">
              {list.slice(0, 5).map((p) => (
                <Avatar key={p.id} look={p.look} ring={p.color} size={30} />
              ))}
            </div>
            <span style={{ fontWeight: 700, color: '#fff' }}>
              {list.length <= 2 ? list.map((p) => p.name).join(', ') : `${list.length} pemain`}
            </span>
            <span class="dot" />
          </div>
        )}
        <AccessChip />
        {/* A far-away main screen cannot open the QR panel (the Host's screen does); its corner QR stays. */}
        {!isMirror && <InviteButton />}
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

/** Time left on the free trial: minutes, the last minute in seconds. */
export function trialLeft(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s >= 60 ? OFFER.minutes(Math.ceil(s / 60)) : OFFER.seconds(s);
}

/**
 * What the room has, always in the top bar (owner 2026-11-23: see at a glance whether the Pass is
 * on): grey "Gratis · 2 pemain", orange "Coba gratis · 42 menit", yellow "PASS · sisa 23:41:05"
 * (a live countdown under 48 hours, otherwise "PASS · sampai Sab, 21 Nov 10.00") or "Uji coba".
 */
export function AccessChip() {
  const a = access.value;
  const ticking = a.kind === 'trial' || (a.kind === 'pass' && a.until !== null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [ticking, a.until]);
  if (a.kind === 'trial' && a.until !== null) {
    return (
      <div class="chip access-chip is-trial" role="timer">
        <Icon name="clock" size={15} stroke={2.6} color="#111214" />
        {OFFER.trialChip(trialLeft(a.until - now))}
      </div>
    );
  }
  if (a.kind === 'pass') {
    const left = a.until === null ? null : a.until - now;
    return (
      <div
        class="chip access-chip is-pass"
        role={left !== null && left < COUNTDOWN_UNDER_MS ? 'timer' : undefined}
      >
        <Icon name="crown" size={15} color="#111214" />
        {left === null
          ? OFFER.chipPassUntil('-')
          : left < COUNTDOWN_UNDER_MS
            ? OFFER.chipPassLeft(formatCountdown(left))
            : OFFER.chipPassUntil(formatUntil(a.until ?? now, now))}
      </div>
    );
  }
  if (a.kind === 'open') return <div class="chip access-chip is-open">{OFFER.chipOpen}</div>;
  return <div class="chip glass access-chip is-free">{OFFER.chipFree(maxPlayers.value)}</div>;
}

/**
 * On a free main screen: "PASS" on a game (or Mode Pesta, `party`) the room cannot start,
 * "GRATIS MINGGU INI" on this week's game. Nothing with Hoorah Pass, the trial or open mode.
 */
export function AccessTag({ game }: { game: GameId | 'party' }) {
  if (premium.value) return null;
  const config = appConfig.value;
  const now = Date.now();
  if (game !== 'party' && weeklyGame(config, now) === game) {
    return <span class="tag access-weekly">{OFFER.chipWeekly}</span>;
  }
  if (game !== 'party' && isFreeGame(game, config, now)) return null;
  return (
    <span class="tag access-pass">
      <Icon name="lock" size={11} stroke={3} color="#111214" />
      {OFFER.chipPass}
    </span>
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
        <QrCard text={inviteUrl(code.value)} size={260} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ QR */

/**
 * Light margin round the code, in squares. 2 instead of the standard 4 (owner 2026-11-23): on a
 * screen the edge is sharp anyway and less bright area dazzles the camera less in a dark room.
 * Not thinner: the finder squares need light round them, or the dark page reads as part of the code.
 */
const QUIET = 2;
/**
 * Grey, not white (owner 2026-11-23): a bright screen in a dark room blinds the camera and the
 * black squares bleed. Black on this grey is still about 10 : 1: clear in a bright room too.
 */
const QR_PAPER = '#B8B8B8';
const QR_INK = '#000000';

export function QrCode({ text, size }: { text: string; size: number }) {
  const { d, n } = useMemo(() => {
    // Fewest, largest squares for the fastest scan (owner 2026-11-23): capitals in the compact
    // alphanumeric mode and the low error level, which a clean code on a screen never needs more
    // than. No logo on top, so nothing has to be corrected: 25 × 25 for the production link.
    const qr = qrcode(0, 'L');
    qr.addData(text, /^[0-9A-Z $%*+\-./:]*$/.test(text) ? 'Alphanumeric' : 'Byte');
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
      viewBox={`-${QUIET} -${QUIET} ${n + 2 * QUIET} ${n + 2 * QUIET}`}
      role="img"
      aria-label="QR Code untuk bergabung"
      shape-rendering="crispEdges"
    >
      <rect x={-QUIET} y={-QUIET} width={n + 2 * QUIET} height={n + 2 * QUIET} fill={QR_PAPER} />
      <path d={d} fill={QR_INK} />
    </svg>
  );
}

/** The join QR on a white card with the orange ring. */
export function QrCard({ text, size }: { text: string; size: number }) {
  return (
    <div class="qr-card">
      <QrCode text={text} size={size} />
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
          {t.player && <Avatar look={t.player.look} ring={t.player.color} size={28} />}
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
          <Avatar look={r.player.look} ring={r.player.color} size={28} />
          {r.player.name}: {REACTION_TEXT[r.r]}
        </div>
      ))}
    </div>
  );
}

export function NetBanner() {
  const s = netStatus.value;
  // A far-away main screen whose link ended shows its own card instead.
  if (s === 'open' || mirrorEnd.value) return null;
  return (
    <div class="net-banner" role="status">
      <span class="spinner" />
      {isMirror
        ? s === 'connecting'
          ? REMOTE.farConnecting
          : REMOTE.farReconnecting
        : s === 'connecting'
          ? 'Menyiapkan room…'
          : 'Menyambung ulang ke server…'}
    </div>
  );
}
