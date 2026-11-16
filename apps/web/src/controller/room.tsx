import type { ControllerView, NavKey } from '@hoorah/protocol';
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Avatar, Icon } from '../shared/ui';
import { StatusRow } from './common';
import { HostMenu, MenuPill, PlayerMenu } from './ingame';
import {
  canFullscreen,
  enterFullscreen,
  fullscreenLater,
  keepAsHeld,
  type Orientation,
  rotateTo,
  showFullscreenPrompt,
} from './screenmode';
import {
  host,
  hostPlayer,
  leave,
  me,
  nav,
  netStatus,
  platform,
  react,
  screenOnline,
  setVibration,
  vibrationOn,
  view,
} from './store';
import { STR } from './strings';
import { useControllerTheme } from './themes';
import { GameView } from './views';

/* ------------------------------------------------------------------ lobby */

function Lobby() {
  const p = me.value;
  const host = hostPlayer.value;
  const pg = platform.value;
  const message =
    pg.page === 'detail'
      ? `${host?.name ?? 'Host'} sedang melihat ${pg.gameTitle ?? 'game'}.`
      : pg.page === 'results'
        ? 'Lihat hasilnya di layar!'
        : pg.page === 'game'
          ? 'Bersiap, game dimulai…'
          : `Lihat layar utama, ${host?.name ?? 'Host'} sedang memilih game.`;
  return (
    <div class="ctrl lobby">
      <StatusRow />
      <div class="panes">
        <div class="pane lobby-hello">
          <div class="hero-avatar">{p && <Avatar fruit={p.fruit} ring={p.color} size={168} />}</div>
          <h1 class="title">Halo, {p?.name ?? 'kamu'}!</h1>
          <div class="muted lobby-msg">
            Kamu sudah masuk.
            <br />
            {message}
          </div>
          <div class="spacer" />
        </div>
        <div class="pane">
          <div class="duo">
            <button type="button" class="big-btn yellow react-btn" onPointerDown={() => react('cheer')}>
              Sorak!
            </button>
            <button type="button" class="big-btn secondary react-btn" onPointerDown={() => react('clap')}>
              Tepuk tangan
            </button>
          </div>
          <Footer />
        </div>
      </div>
    </div>
  );
}

function Footer({ bricks = false }: { bricks?: boolean }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <div class={bricks ? 'host-bricks-foot' : 'ctrl-footer'}>
        <button
          type="button"
          role="switch"
          aria-checked={vibrationOn.value}
          class={`foot-pill ${vibrationOn.value ? 'on' : ''}`}
          onClick={() => setVibration(!vibrationOn.value)}
        >
          <Icon name="vibrate" size={18} stroke={2.2} />
          Getar
          <span class="foot-dot" aria-hidden="true" />
        </button>
        <button type="button" class="foot-pill is-danger" onClick={() => setConfirm(true)}>
          <Icon name="exit" size={18} stroke={2.2} />
          Keluar
        </button>
      </div>
      {confirm && <LeaveSheet onClose={() => setConfirm(false)} />}
    </>
  );
}

/**
 * Identity of the screen a view shows. A view keeps its component (and DOM) while only its
 * numbers change: progress, rate, waiting lists, place, item, lock. It mounts fresh, with its
 * entry animation, only when the screen itself changes: a new question, turn, round, step or
 * result. Remounting on every update replayed the fade-in several times a second (flicker),
 * reloaded avatars, replayed confetti and cancelled held thumbs.
 */
export function viewKey(v: ControllerView): string {
  switch (v.kind) {
    case 'drive':
      return 'drive';
    case 'gesture':
      return `gesture|${v.mode}|${v.eyebrow}|${v.title}`;
    case 'tap':
      // `round` carries the running clock ("R1 · 0:42"), so it must not be part of the identity;
      // new rounds arrive after a between-rounds message view anyway.
      return `tap|${v.teamName}|${v.teamColor}`;
    case 'button':
      // A new turn always has a new deadline/swing, so a used button never carries over.
      return `button|${v.eyebrow}|${v.title}|${v.deadline ?? v.swing?.start ?? ''}`;
    case 'choice':
      return `choice|${v.title}|${v.prompt ?? ''}|${v.deadline ?? ''}|${v.options.map((o) => o.id).join(',')}`;
    case 'locked':
      return `locked|${v.key}|${v.title}`;
    case 'countdown':
      return `countdown|${v.title}`;
    case 'message':
      return `message|${v.tone ?? ''}|${v.eyebrow ?? ''}|${v.title}`;
    case 'result':
      return `result|${v.tone}|${v.title}|${v.big ?? ''}`;
    case 'menu':
      return `menu|${v.layout ?? 'list'}|${v.eyebrow ?? ''}|${v.title}`;
    case 'chess':
      // One board for the whole game: moves, clocks, votes and turns update it in place.
      return `chess|${v.side}`;
    case 'pad':
      // Scores and banners update in place; held thumbs must survive them.
      return `pad|${v.mode}|${v.color}`;
    case 'word':
      // A new turn (or a refused word) starts with an empty input.
      return `word|${v.turn}`;
  }
}

export function LeaveSheet({ onClose }: { onClose: () => void }) {
  return (
    <div class="sheet">
      <div class="sheet-card" role="dialog" aria-modal="true">
        <h2 class="title sheet-title">Keluar dari room?</h2>
        <div class="muted">Kursimu akan dilepas untuk pemain lain.</div>
        <button type="button" class="big-btn" onClick={leave}>
          Ya, keluar
        </button>
        <button type="button" class="big-btn secondary" onClick={onClose}>
          Tetap main
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ host pad */

function PadButton({
  k,
  label,
  class: cls,
  radius,
}: {
  k: NavKey;
  label: string;
  class?: string;
  radius?: string;
}) {
  const [down, setDown] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      class={`${cls ?? ''} ${down ? 'pressed' : ''}`}
      style={radius ? { borderRadius: radius } : undefined}
      onPointerDown={(e) => {
        e.preventDefault();
        setDown(true);
        nav(k);
      }}
      onPointerUp={() => setDown(false)}
      onPointerLeave={() => setDown(false)}
      onPointerCancel={() => setDown(false)}
    >
      {k === 'ok' ? (
        'OK'
      ) : (
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="#fff"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path
            d={
              k === 'up'
                ? 'M6 15 L12 9 L18 15'
                : k === 'down'
                  ? 'M6 9 L12 15 L18 9'
                  : k === 'left'
                    ? 'M15 6 L9 12 L15 18'
                    : 'M9 6 L15 12 L9 18'
            }
          />
        </svg>
      )}
    </button>
  );
}

type PickerModule = typeof import('./picker');
let pickerModule: PickerModule | null = null;
let pickerLoading: Promise<PickerModule> | null = null;

/** The picker (and the poster art it needs) loads on demand; the Host pad prefetches it. */
function loadPicker(): Promise<PickerModule> {
  pickerLoading ??= import('./picker').then((m) => {
    pickerModule = m;
    return m;
  });
  return pickerLoading;
}

function HostPad() {
  const p = me.value;
  const pg = platform.value;
  const [picking, setPicking] = useState(false);
  const [, setLoaded] = useState(pickerModule !== null);
  useEffect(() => {
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number })
      .requestIdleCallback;
    const t = idle ? idle(() => void loadPicker()) : window.setTimeout(() => void loadPicker(), 1200);
    return () => {
      if (!idle) window.clearTimeout(t);
    };
  }, []);
  // A game starting (or the menu pages going away) closes the picker.
  useEffect(() => {
    if (pg.page === 'game' || pg.page === 'loading') setPicking(false);
  }, [pg.page]);

  const openPicker = () => {
    setPicking(true);
    if (!pickerModule) void loadPicker().then(() => setLoaded(true));
  };

  if (picking) {
    const Picker = pickerModule?.GamePicker;
    return Picker ? (
      <Picker onClose={() => setPicking(false)} />
    ) : (
      <div class="ctrl" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div class="spinner big" />
        <div class="muted">{STR.pickerLoading}</div>
      </div>
    );
  }

  const canPick = pg.page === 'join' || pg.page === 'home' || pg.page === 'detail' || pg.page === 'results';
  return (
    <div class="ctrl hostpad landscape-split">
      <div class="panes">
        <div class="pane host-side">
          <StatusRow />
          <div class="row host-who t-panel">
            {p && <Avatar fruit={p.fruit} ring={p.color} size={40} />}
            <div class="host-name">{p?.name}</div>
            {canPick && (
              <button type="button" class="big-btn yellow pick-btn" onClick={openPicker}>
                <Icon name="grid" size={18} stroke={2.4} />
                {pg.page === 'results' ? STR.changeGame : STR.pickGame}
              </button>
            )}
          </div>
          <div class="host-bricks">
            <KeyButton k="back" icon="undo" label={STR.back} />
            <KeyButton k="home" icon="home" label={STR.home} />
            <Footer bricks />
          </div>
        </div>
        <div class="pane zone dpad-zone">
          <div class="dpad-ring">
            <div class="dpad">
              <div />
              <PadButton k="up" label="Atas" radius="22px 22px 10px 10px" />
              <div />
              <PadButton k="left" label="Kiri" radius="22px 10px 10px 22px" />
              <PadButton k="ok" label="OK" class="ok" />
              <PadButton k="right" label="Kanan" radius="10px 22px 22px 10px" />
              <div />
              <PadButton k="down" label="Bawah" radius="10px 10px 22px 22px" />
              <div />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KeyButton({ k, icon, label }: { k: NavKey; icon: 'undo' | 'home'; label: string }) {
  return (
    <button type="button" class="host-key" onPointerDown={() => nav(k)}>
      <Icon name={icon} size={22} stroke={2.4} />
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ router */

export function RoomView() {
  const pg = platform.value;
  const isHost = me.value?.isHost ?? false;
  const v = view.value;
  const inGame = pg.page === 'game';
  // The Host's pause request is in flight until the main screen reports `paused`.
  const [hostOpening, setHostOpening] = useState(false);
  const [playerMenu, setPlayerMenu] = useState(false);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (pg.paused || !inGame) setHostOpening(false);
    if (!inGame) setPlayerMenu(false);
  }, [pg.paused, inGame]);
  const hostMenu = isHost && inGame && (pg.paused || hostOpening);
  const menuOpen = hostMenu || playerMenu;
  const showPill = inGame && !menuOpen;
  // The pill sits at the top centre, above the game controls, never on top of them.
  useEffect(() => {
    document.documentElement.classList.toggle('has-pill', showPill);
    return () => document.documentElement.classList.remove('has-pill');
  }, [showPill]);
  const playing = inGame && !menuOpen;
  const watching = pg.page === 'results' && v !== null && !isHost;
  // While the phone shows the game's own screens it wears that game's theme; menus, the Host
  // pad, the lobby and setup stay in the neutral Hoorah style.
  useControllerTheme(playing || watching ? (pg.gameId ?? null) : null);
  let content: JSX.Element;
  if (hostMenu) {
    content = <HostMenu onClose={() => setHostOpening(false)} />;
  } else if (playerMenu) {
    content = <PlayerMenu onClose={() => setPlayerMenu(false)} onLeave={() => setLeaving(true)} />;
  } else if (playing) {
    content = v ? <GameView key={viewKey(v)} v={v} /> : <Waiting text="Bersiap, game sedang dimuat…" />;
  } else if (watching && v) {
    content = <GameView key={viewKey(v)} v={v} />;
  } else if (isHost) {
    content = <HostPad />;
  } else {
    content = <Lobby />;
  }
  return (
    <>
      {content}
      {showPill && (
        <MenuPill
          isHost={isHost}
          paused={pg.paused}
          onOpen={() => {
            if (isHost) {
              setHostOpening(true);
              host('pause');
            } else {
              setPlayerMenu(true);
            }
          }}
        />
      )}
      {leaving && <LeaveSheet onClose={() => setLeaving(false)} />}
      <Overlays />
    </>
  );
}

function Waiting({ text }: { text: string }) {
  return (
    <div class="ctrl" style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
      <div class="spinner big" />
      <h1 class="title" style={{ fontSize: 24 }}>
        {text}
      </h1>
    </div>
  );
}

/**
 * The phone is held the wrong way for this game and could not be turned automatically
 * (iPhone, or Android before fullscreen): a landscape game held upright, or a portrait game
 * still held sideways after a landscape one.
 */
function RotateScreen({ to }: { to: Orientation }) {
  const landscape = to === 'landscape';
  return (
    <div class={`rotate-screen to-${to}`} role="alertdialog" aria-label={STR.rotateTitle}>
      <div class="rotate-phone" aria-hidden="true">
        <Icon name="rotate" size={72} stroke={1.8} />
      </div>
      <h2 class="title">{STR.rotateTitle}</h2>
      <div class="muted">{landscape ? STR.rotateBody : STR.rotateBodyPortrait}</div>
      {canFullscreen ? (
        <button type="button" class="big-btn" onClick={enterFullscreen}>
          {STR.rotateGo}
        </button>
      ) : (
        // iPhone rotation lock only ever keeps the phone upright, so it matters for landscape only.
        landscape && <div class="muted rotate-ios">{STR.rotateIos}</div>
      )}
      <button type="button" class="link-btn" onClick={keepAsHeld}>
        {landscape ? STR.keepPortrait : STR.keepLandscape}
      </button>
    </div>
  );
}

function Overlays() {
  const [offlineFor, setOfflineFor] = useState(0);
  const status = netStatus.value;
  useEffect(() => {
    if (status === 'open') {
      setOfflineFor(0);
      return;
    }
    const t = window.setInterval(() => setOfflineFor((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [status]);
  return (
    <>
      {status !== 'open' && offlineFor >= 1 && (
        <div class="banner" role="status">
          <span class="spinner" />
          Menyambung ulang… {offlineFor > 4 ? 'tetap di halaman ini' : ''}
        </div>
      )}
      {rotateTo.value !== null && <RotateScreen to={rotateTo.value} />}
      {showFullscreenPrompt.value && (
        <div class="sheet" style={{ alignItems: 'center' }}>
          <div class="sheet-card" style={{ alignItems: 'center', textAlign: 'center' }}>
            <div class="round-icon big" aria-hidden="true">
              <Icon name="expand" size={30} stroke={2.4} />
            </div>
            <h2 class="title sheet-title">{STR.fullTitle}</h2>
            <div class="muted">{STR.fullBody}</div>
            <button type="button" class="big-btn" style={{ alignSelf: 'stretch' }} onClick={enterFullscreen}>
              {STR.fullGo}
            </button>
            <button type="button" class="link-btn" onClick={fullscreenLater}>
              {STR.fullLater}
            </button>
          </div>
        </div>
      )}
      {status === 'open' && !screenOnline.value && (
        <div class="sheet" style={{ alignItems: 'center' }}>
          <div class="sheet-card" style={{ alignItems: 'center', textAlign: 'center' }}>
            <div class="spinner big" />
            <h2 class="title sheet-title">Menunggu layar utama</h2>
            <div class="muted">Layar utama terputus. Kami sambungkan lagi otomatis.</div>
          </div>
        </div>
      )}
    </>
  );
}
