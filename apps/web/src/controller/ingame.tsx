/**
 * In-game menu: a pill at the top centre of the phone (portrait and landscape).
 *
 * - Host: tapping the pill pauses the game on the main screen and opens the Host menu here:
 *   resume, add players (join QR on the main screen), restart, hand over the Host role, quit the
 *   game, and switches (main-screen music and sound, vibration on this phone).
 * - Everyone else: the pill opens a personal menu without pausing the game for the others:
 *   invite a friend (room code), Pass code, vibration, leave the room.
 *
 * Both are one fixed screen on every phone (owner 2026-11-23): no scrolling, no shrinking.
 * "Laporkan masalah" is a small link in the header row, so it takes no key's place.
 */
import { formatRoomCode } from '@hoorah/protocol';
import { useEffect, useState } from 'preact/hooks';
import { Icon, type IconName } from '../shared/ui';
import { formatUntil } from '../shared/when';
import { Me } from './common';
import { HostSwapSheet } from './hostoffer';
import { PassSheet } from './pass';
import { ReportLink, ReportSheet } from './report';
import { code, haptic, host, me, platform, players, roomPass, setVibration, vibrationOn } from './store';
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

/**
 * One key of the in-game menus, in the remote's style: a chunky 3D brick with a big icon on a
 * coloured tile and the label under it. As a switch (`on` given) the tile is green when on.
 */
function Brick({
  icon,
  label,
  onClick,
  on,
  danger = false,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  on?: boolean;
  danger?: boolean;
}) {
  const isSwitch = on !== undefined;
  const face = (
    <span class="ig-brick-icon">
      <Icon name={icon} size={22} stroke={2.4} />
    </span>
  );
  const press = () => {
    haptic(10);
    onClick();
  };
  return isSwitch ? (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      class={`ig-brick ${on ? '' : 'is-off'}`}
      onClick={press}
    >
      {face}
      <span class="ig-brick-label">{label}</span>
      <span class="ig-brick-state">{on ? STR.igOn : STR.igOff}</span>
    </button>
  ) : (
    <button type="button" class={`ig-brick ${danger ? 'is-danger' : ''}`} onClick={press}>
      {face}
      <span class="ig-brick-label">{label}</span>
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
    <div class="sheet" style={{ alignItems: 'center' }}>
      <div class="sheet-card" role="alertdialog" aria-modal="true">
        <h2 class="title sheet-title">{title}</h2>
        <div class="muted">{body}</div>
        <div class="duo">
          <button type="button" class="big-btn secondary" onClick={onNo}>
            {STR.igCancel}
          </button>
          <button type="button" class="big-btn" onClick={onYes}>
            {yes}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Menu header: avatar, the game's name, the menu's title, and "Laporkan masalah" on the right. */
function MenuHead({ title, onReport }: { title: string; onReport: () => void }) {
  const pg = platform.value;
  return (
    <div class="row ig-top">
      <Me size={40} />
      <div class="ig-head">
        <div class="ig-eyebrow">{pg.gameTitle ?? 'Game'}</div>
        <div class="ig-title">{title}</div>
      </div>
      <ReportLink class="ig-report" onOpen={onReport} />
    </div>
  );
}

/**
 * "Tambah pemain" on the Host's phone: the QR, the code and how to join are on the main screen
 * already, so the phone only offers Selesai and the Pass code (owner 2026-11-23).
 */
function AddPlayers({ onDone }: { onDone: () => void }) {
  const [askPass, setAskPass] = useState(false);
  const pass = roomPass.value;
  return (
    <div class="ig-actions ig-add">
      <div class="ig-add-line">
        <Icon name="scan" size={18} stroke={2.4} />
        {pass ? STR.igPassOn(formatUntil(pass.expiresAt)) : STR.igScanHint}
      </div>
      <div class={`ig-grid ${pass ? 'is-one' : ''}`}>
        <Brick icon="check" label={STR.igDone} onClick={onDone} />
        {!pass && <Brick icon="ticket" label={STR.igPass} onClick={() => setAskPass(true)} />}
      </div>
      {askPass && <PassSheet onClose={() => setAskPass(false)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ Host menu */

/**
 * The Host's pause menu, one screen on every phone without scrolling or shrinking: the big
 * Lanjutkan, four action keys (2 × 2) and one row of switches. Held sideways: Lanjutkan and the
 * switches on the left, the actions on the right.
 */
export function HostMenu({ onClose }: { onClose: () => void }) {
  const pg = platform.value;
  const [ask, setAsk] = useState<'restart' | 'quit' | null>(null);
  const [swap, setSwap] = useState(false);
  const [reporting, setReporting] = useState(false);
  const resume = () => {
    host('invite-off');
    host('resume');
    onClose();
  };
  return (
    <div class="ctrl ig-menu">
      <MenuHead title={STR.igPaused} onReport={() => setReporting(true)} />

      <div class="ig-body">
        <button type="button" class="big-btn ig-resume" onClick={resume}>
          <Icon name="play" size={22} />
          {STR.igResume}
        </button>

        {pg.invite ? (
          <AddPlayers onDone={() => host('invite-off')} />
        ) : (
          <div class="ig-actions ig-grid">
            <Brick icon="plus" label={STR.igAdd} onClick={() => host('invite-on')} />
            <Brick icon="restart" label={STR.igRestart} onClick={() => setAsk('restart')} />
            <Brick icon="crown" label={STR.hostSwap} onClick={() => setSwap(true)} />
            <Brick icon="exit" label={STR.igQuit} danger onClick={() => setAsk('quit')} />
          </div>
        )}

        <div class="ig-switches">
          <Brick
            icon="music"
            label={STR.igMusic}
            on={pg.music}
            onClick={() => host(pg.music ? 'music-off' : 'music-on')}
          />
          <Brick
            icon={pg.sound ? 'volume' : 'mute'}
            label={STR.igSound}
            on={pg.sound}
            onClick={() => host(pg.sound ? 'sound-off' : 'sound-on')}
          />
          <Brick
            icon="vibrate"
            label={STR.igVibrate}
            on={vibrationOn.value}
            onClick={() => setVibration(!vibrationOn.value)}
          />
        </div>
      </div>

      {swap && <HostSwapSheet onClose={() => setSwap(false)} />}
      {reporting && <ReportSheet onClose={() => setReporting(false)} />}
      {ask === 'restart' && (
        <Confirm
          title={STR.igRestartTitle}
          body={STR.igRestartBody}
          yes={STR.igRestartYes}
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
          title={STR.igQuitTitle}
          body={STR.igQuitBody}
          yes={STR.igQuitYes}
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

/**
 * Everyone else's menu (the game keeps running): back to the game, the room code to invite a
 * friend (the main screen is showing the game, not the QR), the Pass code, vibration, leave.
 */
export function PlayerMenu({ onClose, onLeave }: { onClose: () => void; onLeave: () => void }) {
  const pg = platform.value;
  const [askPass, setAskPass] = useState(false);
  const [reporting, setReporting] = useState(false);
  const pass = roomPass.value;
  // Close by itself when the game ends or changes underneath.
  useEffect(() => {
    if (pg.page !== 'game') onClose();
  }, [pg.page]);
  return (
    <div class="ctrl ig-menu">
      <MenuHead title={STR.igPlayerTitle} onReport={() => setReporting(true)} />
      <div class="ig-body">
        <button type="button" class="big-btn ig-resume" onClick={onClose}>
          <Icon name="play" size={22} />
          {STR.igPlayerResume}
        </button>

        <div class="ig-actions ig-code-card">
          <span class="ig-eyebrow">{STR.igInvite}</span>
          <span class="ig-code">{formatRoomCode(code.value)}</span>
          <span class="ig-code-host">{location.host}</span>
        </div>

        <div class="ig-switches">
          {!pass && <Brick icon="ticket" label={STR.igPass} onClick={() => setAskPass(true)} />}
          <Brick
            icon="vibrate"
            label={STR.igVibrate}
            on={vibrationOn.value}
            onClick={() => setVibration(!vibrationOn.value)}
          />
          <Brick icon="exit" label={STR.igLeaveRoom} danger onClick={onLeave} />
        </div>
      </div>
      {askPass && <PassSheet onClose={() => setAskPass(false)} />}
      {reporting && <ReportSheet onClose={() => setReporting(false)} />}
    </div>
  );
}

/** Small "who is Host" line for the paused banner on other phones. */
export function pausedBy(): string {
  const h = players.value.find((p) => p.isHost);
  return h && h.id !== me.value?.id ? `Dijeda oleh ${h.name}` : 'Dijeda oleh Host';
}
