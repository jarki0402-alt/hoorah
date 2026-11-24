import { formatRoomCode, LIMITS, type NearbyRoom, ROOM_CODE_LENGTH } from '@hoorah/protocol';
import { useEffect, useRef, useState } from 'preact/hooks';
import { switchRole } from '../shared/device';
import { Avatar, Icon, Logo } from '../shared/ui';
import { PassForm } from './pass';
import { enterFullscreen } from './screenmode';
import { changeCode, code, error, join, name, retry, setCode, stage } from './store';
import { STR } from './strings';

export function CodePage() {
  const input = useRef<HTMLInputElement>(null);
  const c = code.value;
  const valid = c.length === ROOM_CODE_LENGTH;
  useEffect(() => input.current?.focus(), []);
  return (
    <div class="ctrl setup">
      <div class="panes">
        <div class="pane">
          <div class="setup-logo">
            <Logo size={30} />
          </div>
          <div class="setup-head">
            <h1 class="title">{STR.codeTitle}</h1>
            <div class="muted">{STR.codeSub}</div>
          </div>
          <NearbyScreens />
        </div>
        <form
          class="pane setup-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) stage.value = 'profile';
          }}
        >
          <label class="code-boxes" aria-label={STR.codeLabel}>
            {Array.from({ length: ROOM_CODE_LENGTH }, (_, i) => (
              <div key={i} class={`code-box ${i === c.length ? 'active' : ''}`} aria-hidden="true">
                {c[i] ?? ''}
              </div>
            ))}
            <input
              ref={input}
              class="code-input"
              value={c}
              maxLength={12}
              autoComplete="one-time-code"
              autoCorrect="off"
              autoCapitalize="off"
              spellcheck={false}
              inputMode="numeric"
              pattern="[0-9]*"
              enterKeyHint="go"
              aria-label={STR.codeLabel}
              onInput={(e) => setCode((e.target as HTMLInputElement).value)}
            />
          </label>
          <div class="muted setup-note">{STR.codeNote}</div>
          <button class="big-btn" type="submit" disabled={!valid}>
            Lanjut
          </button>
          <div class="spacer" />
          <button type="button" class="link-btn setup-switch" onClick={() => switchRole('screen')}>
            Jadikan perangkat ini layar utama
          </button>
        </form>
      </div>
    </div>
  );
}

/** How often the code page asks for main screens on this Wi-Fi. */
const NEARBY_POLL_MS = 5000;

/**
 * Main screens on the same Wi-Fi (same public address, see the server's /api/nearby): one tap
 * picks that room, no scanning or typing. Shows nothing when there are none.
 */
function NearbyScreens() {
  const [rooms, setRooms] = useState<NearbyRoom[]>([]);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch('/api/nearby', { cache: 'no-store' });
        if (!res.ok) return;
        const list = (await res.json()) as unknown;
        if (alive && Array.isArray(list)) setRooms(list.filter(isNearbyRoom).slice(0, 3));
      } catch {
        // Offline or no server: the code field still works.
      }
    };
    void load();
    const t = window.setInterval(() => void load(), NEARBY_POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);
  if (rooms.length === 0) return null;
  return (
    <div class="nearby">
      <div class="nearby-title">{STR.nearbyTitle}</div>
      {rooms.map((r) => (
        <button
          type="button"
          class="nearby-room"
          key={r.code}
          onClick={() => {
            setCode(r.code);
            stage.value = 'profile';
          }}
        >
          <span class="avatar-stack">
            {r.players.slice(0, 4).map((p) => (
              <Avatar key={p.name} look={p.look} fruit={p.fruit} ring={p.color} size={30} />
            ))}
          </span>
          <span class="nearby-text">
            <span class="nearby-names">{STR.nearbyPlayers(r.players.map((p) => p.name))}</span>
            <span class="nearby-code">
              {STR.codeChip} {formatRoomCode(r.code)}
            </span>
          </span>
          <span class="nearby-join">{STR.nearbyJoin}</span>
        </button>
      ))}
      <div class="nearby-or">{STR.orTypeCode}</div>
    </div>
  );
}

function isNearbyRoom(v: unknown): v is NearbyRoom {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r.code === 'string' && /^\d{6}$/.test(r.code) && Array.isArray(r.players);
}

export function ProfilePage() {
  const n = name.value;
  return (
    <form
      class="ctrl setup profile"
      onSubmit={(e) => {
        e.preventDefault();
        // The Masuk tap is the user gesture browsers require for fullscreen (Android only).
        enterFullscreen();
        join();
      }}
    >
      <div class="panes">
        <div class="pane">
          <div class="row">
            <button
              type="button"
              class="link-btn"
              style={{ textDecoration: 'none', display: 'flex', gap: 4 }}
              onClick={() => (stage.value = 'code')}
            >
              <Icon name="back" size={18} /> Kode {code.value}
            </button>
          </div>
          <h1 class="title">Siapa namamu?</h1>
          <label class="profile-name">
            <span class="muted profile-label">Nama (maks. {LIMITS.nameMax} huruf)</span>
            <input
              class="text-input"
              value={n}
              maxLength={LIMITS.nameMax}
              autoComplete="nickname"
              enterKeyHint="done"
              placeholder="Contoh: Rina"
              onInput={(e) => {
                name.value = (e.target as HTMLInputElement).value;
              }}
            />
          </label>
          <div class="spacer" />
          <button class="big-btn profile-go" type="submit" disabled={!n.trim()}>
            Masuk
          </button>
        </div>
      </div>
    </form>
  );
}

export function JoiningPage() {
  return (
    <div class="ctrl" style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
      <div class="spinner big" />
      <h1 class="title" style={{ fontSize: 26 }}>
        Masuk ke room {code.value}…
      </h1>
    </div>
  );
}

const ERRORS: Record<string, { title: string; body: string; retry: boolean }> = {
  room_not_found: {
    title: 'Kode tidak ditemukan',
    body: 'Periksa lagi kode di layar utama. Room bisa berganti kalau layar utama dimuat ulang.',
    retry: false,
  },
  room_full: { title: STR.fullTitleRoom, body: STR.fullBodyRoom, retry: true },
  pass_invalid: { title: STR.passInvalidTitle, body: STR.passErr.invalid, retry: true },
  pass_expired: { title: STR.passExpiredTitle, body: STR.passErr.expired, retry: true },
  pass_busy: { title: STR.passBusyTitle, body: STR.passErr.busy, retry: true },
  // A single-use code already spent on another main screen (if the server refuses the join with it).
  pass_used: { title: STR.passUsedTitle, body: STR.passErr.used, retry: true },
  room_closed: {
    title: 'Room sudah ditutup',
    body: 'Layar utama sudah lama tidak aktif. Scan QR yang baru di layar utama.',
    retry: false,
  },
  kicked: { title: 'Kamu dikeluarkan', body: 'Host mengeluarkanmu dari room ini.', retry: false },
  session_replaced: {
    title: 'Dibuka di tab lain',
    body: 'Room ini sekarang aktif di tab atau HP lain.',
    retry: true,
  },
  version: {
    title: 'Perlu muat ulang',
    body: 'Aplikasi baru saja diperbarui. Muat ulang halaman ini.',
    retry: false,
  },
  rate_limited: { title: 'Terlalu cepat', body: 'Tunggu sebentar lalu coba lagi.', retry: true },
};

/** Errors where typing a Hoorah Pass code can still get this phone in. */
const PASS_ERRORS = new Set(['room_full', 'pass_invalid', 'pass_expired', 'pass_busy']);

export function ErrorPage() {
  const withPass = PASS_ERRORS.has(error.value ?? '');
  const e = ERRORS[error.value ?? ''] ?? {
    title: 'Ada yang salah',
    body: 'Koneksi ke room terputus.',
    retry: true,
  };
  return (
    <div class="ctrl error-page">
      <div class="panes">
        <div class="pane">
          <div class="error-icon">
            <Icon name={withPass ? 'lock' : 'wifi'} size={44} color="#FFC928" />
          </div>
          <h1 class="title">{e.title}</h1>
          <div class="muted error-body">{e.body}</div>
          <div class="spacer" />
        </div>
        <div class="pane error-actions">
          {withPass && <PassForm joining />}
          {error.value === 'version' ? (
            <button type="button" class="big-btn" onClick={() => location.reload()}>
              Muat ulang
            </button>
          ) : (
            e.retry && (
              <button type="button" class={`big-btn ${withPass ? 'secondary' : ''}`} onClick={retry}>
                Coba lagi
              </button>
            )
          )}
          <button type="button" class="big-btn secondary" onClick={changeCode}>
            Ganti kode
          </button>
        </div>
      </div>
    </div>
  );
}
