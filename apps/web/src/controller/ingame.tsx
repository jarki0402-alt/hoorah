/**
 * In-game menu: a pill at the top centre of the phone (portrait and landscape).
 *
 * - Host: tapping the pill pauses the game on the main screen and opens the Host menu here:
 *   resume, add players (join QR on the main screen), restart, quit the game, and settings
 *   (main-screen music and sound, vibration on this phone).
 * - Everyone else: the pill opens a personal menu without pausing the game for the others:
 *   invite a friend (room code), vibration, leave the room.
 */
import { formatRoomCode } from '@hoorah/protocol';
import { useEffect, useState } from 'preact/hooks';
import { Icon, type IconName } from '../shared/ui';
import { formatUntil } from '../shared/when';
import { Me } from './common';
import { PassSheet } from './pass';
import {
  code,
  haptic,
  host,
  me,
  platform,
  players,
  roomPass,
  roomSeats,
  setVibration,
  vibrationOn,
} from './store';
import { STR } from './strings';

/* ------------------------------------------------------------------ pill */

/**
 * While the Host has paused the game, other phones read the reason in the pill itself (no banner
 * covering it); tapping still opens their own menu.
 */
export function MenuPill({
  isHost,
  paused,
  onOpen,
}: {
  isHost: boolean;
  paused: boolean;
  onOpen: () => void;
}) {
  const waiting = paused && !isHost;
  return (
    <button
      type="button"
      class={`menu-pill ${waiting ? 'is-paused' : ''}`}
      aria-label={isHost ? 'Jeda game' : 'Menu'}
      onClick={() => {
        haptic(15);
        onOpen();
      }}
    >
      <Icon name={isHost || waiting ? 'pause' : 'menu'} size={14} stroke={2.6} />
      {isHost ? 'Jeda' : waiting ? pausedBy() : 'Menu'}
    </button>
  );
}

/* ------------------------------------------------------------------ building blocks */

function Toggle({
  label,
  sub,
  on,
  onChange,
}: {
  label: string;
  sub?: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      class={`ig-toggle ${on ? 'on' : ''}`}
      onClick={() => {
        haptic(10);
        onChange(!on);
      }}
    >
      <span class="ig-toggle-text">
        <span class="ig-toggle-label">{label}</span>
        {sub && <span class="ig-toggle-sub">{sub}</span>}
      </span>
      <span class="ig-switch" aria-hidden="true">
        <span />
      </span>
    </button>
  );
}

function Tile({
  icon,
  label,
  onClick,
  tone,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  tone?: 'danger';
}) {
  return (
    <button type="button" class={`ig-tile ${tone === 'danger' ? 'is-danger' : ''}`} onClick={onClick}>
      <Icon name={icon} size={24} stroke={2.4} />
      {label}
    </button>
  );
}

function Confirm({
  title,
  body,
  yes,
  onYes,
  onNo,
}: {
  title: string;
  body: string;
  yes: string;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <div class="sheet">
      <div class="sheet-card" role="alertdialog" aria-modal="true">
        <h2 class="title" style={{ fontSize: 24 }}>
          {title}
        </h2>
        <div class="muted">{body}</div>
        <button type="button" class="big-btn" onClick={onYes}>
          {yes}
        </button>
        <button type="button" class="big-btn secondary" onClick={onNo}>
          Batal
        </button>
      </div>
    </div>
  );
}

function joinHost(): string {
  return location.host;
}

/** Room code and how to join, for "Tambah pemain" / "Ajak teman". */
function InviteCard({ onDone, onScreen }: { onDone?: () => void; onScreen: boolean }) {
  const [askPass, setAskPass] = useState(false);
  const used = players.value.filter((p) => p.connected).length;
  const seats = roomSeats.value;
  const pass = roomPass.value;
  const full = used >= seats;
  return (
    <div class={`ig-invite ${onDone ? 'has-done' : ''}`}>
      <div class="ig-eyebrow">{onScreen ? 'QR tampil di layar utama' : 'Ajak teman'}</div>
      <div class="ig-code">{formatRoomCode(code.value)}</div>
      <div class="ig-invite-hint">
        Buka <b>{joinHost()}</b> di HP teman lalu ketik kode ini{onScreen ? ', atau scan QR di layar.' : '.'}
      </div>
      <div class={`ig-seats ${full && !pass ? 'is-full' : ''}`}>
        {pass
          ? STR.seatsPass(used, seats, formatUntil(pass.expiresAt))
          : full
            ? STR.seatsFull(used, seats)
            : STR.seatsFree(used, seats)}
      </div>
      {!pass && (
        <button type="button" class="link-btn ig-pass" onClick={() => setAskPass(true)}>
          {STR.passAsk}
        </button>
      )}
      {askPass && <PassSheet onClose={() => setAskPass(false)} />}
      {onDone && (
        <button type="button" class="big-btn secondary" onClick={onDone}>
          Selesai
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Host menu */

export function HostMenu({ onClose }: { onClose: () => void }) {
  const pg = platform.value;
  const [ask, setAsk] = useState<'restart' | 'quit' | null>(null);
  const resume = () => {
    host('invite-off');
    host('resume');
    onClose();
  };
  return (
    <div class="ctrl ig-menu">
      <div class="row">
        <Me size={40} />
        <div class="ig-head">
          <div class="ig-eyebrow">{pg.gameTitle ?? 'Game'}</div>
          <div class="ig-title">Game dijeda</div>
        </div>
      </div>

      <div class="ig-body">
        <div class="ig-col">
          <button type="button" class="big-btn ig-resume" onClick={resume}>
            <Icon name="play" size={22} />
            Lanjutkan
          </button>
          {pg.invite ? (
            <InviteCard onScreen onDone={() => host('invite-off')} />
          ) : (
            <div class="ig-tiles">
              <Tile icon="plus" label="Tambah pemain" onClick={() => host('invite-on')} />
              <Tile icon="restart" label="Ulang dari awal" onClick={() => setAsk('restart')} />
              <Tile icon="exit" label="Keluar game" tone="danger" onClick={() => setAsk('quit')} />
            </div>
          )}
        </div>

        <div class="ig-col">
          <div class="ig-section">Pengaturan</div>
          <Toggle
            label="Musik"
            sub="di layar utama"
            on={pg.music}
            onChange={(on) => host(on ? 'music-on' : 'music-off')}
          />
          <Toggle
            label="Suara"
            sub="efek suara di layar utama"
            on={pg.sound}
            onChange={(on) => host(on ? 'sound-on' : 'sound-off')}
          />
          <Toggle label="Getar" sub="di HP ini" on={vibrationOn.value} onChange={setVibration} />
        </div>
      </div>

      {ask === 'restart' && (
        <Confirm
          title="Ulang dari awal?"
          body="Permainan ini dimulai lagi dan skor sekarang hilang."
          yes="Ya, ulang"
          onYes={() => {
            setAsk(null);
            host('restart');
            onClose();
          }}
          onNo={() => setAsk(null)}
        />
      )}
      {ask === 'quit' && (
        <Confirm
          title="Keluar dari game?"
          body="Permainan berakhir dan semua kembali ke beranda."
          yes="Ya, keluar"
          onYes={() => {
            setAsk(null);
            host('quit');
            onClose();
          }}
          onNo={() => setAsk(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ player menu */

export function PlayerMenu({ onClose, onLeave }: { onClose: () => void; onLeave: () => void }) {
  const pg = platform.value;
  // Close by itself when the game ends or changes underneath.
  useEffect(() => {
    if (pg.page !== 'game') onClose();
  }, [pg.page]);
  return (
    <div class="ctrl ig-menu">
      <div class="row">
        <Me size={40} />
        <div class="ig-head">
          <div class="ig-eyebrow">{pg.gameTitle ?? 'Game'}</div>
          <div class="ig-title">Menu</div>
        </div>
      </div>
      <div class="ig-body">
        <div class="ig-col">
          <button type="button" class="big-btn ig-resume" onClick={onClose}>
            <Icon name="play" size={22} />
            Lanjut main
          </button>
          <div class="ig-note">Game tetap berjalan. Hanya Host yang bisa menjeda.</div>
          <InviteCard onScreen={false} />
        </div>
        <div class="ig-col">
          <div class="ig-section">Pengaturan</div>
          <Toggle label="Getar" sub="di HP ini" on={vibrationOn.value} onChange={setVibration} />
          <Tile icon="exit" label="Keluar dari room" tone="danger" onClick={onLeave} />
        </div>
      </div>
    </div>
  );
}

/** Small "who is Host" line for the paused banner on other phones. */
export function pausedBy(): string {
  const h = players.value.find((p) => p.isHost);
  return h && h.id !== me.value?.id ? `Dijeda oleh ${h.name}` : 'Dijeda oleh Host';
}
