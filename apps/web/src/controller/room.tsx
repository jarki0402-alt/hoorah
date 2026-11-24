import { type ControllerView, LIMITS, type Look, type NavKey } from '@hoorah/protocol';
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Avatar, Icon } from '../shared/ui';
import { AvatarEditor, PickPage } from './avatar-editor';
import { AccessBadge, StatusRow } from './common';
import { HostOfferLayer, HostSwapSheet } from './hostoffer';
import { HostMenu, MenuPill, PlayerMenu } from './ingame';
import { PassSheet } from './pass';
import { ReportSheet } from './report';
import { RingPad } from './ringpad';
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
  look,
  me,
  name,
  nav,
  netStatus,
  picking,
  platform,
  react,
  saveProfile,
  screenOnline,
  setVibration,
  vibrationOn,
  view,
} from './store';
import { AVATAR, STR } from './strings';
import { useControllerTheme } from './themes';
import { TutorialPhone } from './tutorial';
import { GameView } from './views';

/* ------------------------------------------------------------------ lobby */

/** Lobby "Ubah": a new name and avatar before the game starts. */
function ProfileSheet({ onClose }: { onClose: () => void }) {
  const p = me.value;
  const [draft, setDraft] = useState<Look>(p?.look ?? look.value);
  const [newName, setNewName] = useState(p?.name ?? name.value);
  return (
    <div class="sheet">
      <form
        class="sheet-card profile-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={AVATAR.sheetTitle}
        onSubmit={(e) => {
          e.preventDefault();
          if (saveProfile(newName, draft)) onClose();
        }}
      >
        <h2 class="title sheet-title">{AVATAR.sheetTitle}</h2>
        <label class="profile-name">
          <span class="muted profile-label">{AVATAR.nameLabel}</span>
          <input
            class="text-input"
            value={newName}
            maxLength={LIMITS.nameMax}
            autoComplete="nickname"
            enterKeyHint="done"
            onInput={(e) => setNewName((e.target as HTMLInputElement).value)}
          />
        </label>
        <AvatarEditor value={draft} onChange={setDraft} />
        <div class="duo">
          <button type="button" class="big-btn secondary" onClick={onClose}>
            {AVATAR.cancel}
          </button>
          <button type="submit" class="big-btn" disabled={!newName.trim()}>
            {AVATAR.save}
          </button>
        </div>
      </form>
    </div>
  );
}

function Lobby() {
  const p = me.value;
  const [editing, setEditing] = useState(false);
  const host = hostPlayer.value;
  const pg = platform.value;
  const message =
    pg.page === 'detail'
      ? `${host?.name ?? 'Host'} sedang melihat ${pg.gameTitle ?? 'game'}.`
      : pg.page === 'results'
        ? 'Lihat hasilnya di layar!'
        : pg.page === 'game' || pg.page === 'loading'
          ? 'Bersiap, game dimulai…'
          : `Lihat layar utama, ${host?.name ?? 'Host'} sedang memilih game.`;
  return (
    <div class="ctrl lobby">
      <StatusRow />
      <div class="panes">
        <div class="pane lobby-hello">
          <div class="hero-avatar">{p && <Avatar look={p.look} ring={p.color} size={168} />}</div>
          <h1 class="title">Halo, {p?.name ?? 'kamu'}!</h1>
          {pg.page !== 'game' && pg.page !== 'loading' && (
            <button type="button" class="link-btn lobby-edit" onClick={() => setEditing(true)}>
              {AVATAR.edit}
            </button>
          )}
          <AccessBadge />
          <div class="muted lobby-msg">
            Kamu sudah masuk.
            <br />
            {message}
          </div>
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
      {editing && <ProfileSheet onClose={() => setEditing(false)} />}
    </div>
  );
}

/**
 * "Lainnya": the Pass code and "Laporkan masalah" live here (owner 2026-11-23), away from the d-pad
 * and the main keys, where a thumb used to hit them by accident.
 */
function MoreSheet({ onClose }: { onClose: () => void }) {
  const [inner, setInner] = useState<'pass' | 'report' | null>(null);
  if (inner === 'pass') return <PassSheet onClose={onClose} />;
  if (inner === 'report') return <ReportSheet onClose={onClose} />;
  return (
    <div class="sheet" style={{ alignItems: 'center' }}>
      <div class="sheet-card more-sheet" role="dialog" aria-modal="true" aria-label={STR.moreTitle}>
        <h2 class="title sheet-title">{STR.moreTitle}</h2>
        <button type="button" class="more-row" onClick={() => setInner('pass')}>
          <span class="more-icon t-yellow">
            <Icon name="ticket" size={22} stroke={2.4} />
          </span>
          <span class="more-text">
            <b>{STR.morePass}</b>
            <span>{STR.morePassSub}</span>
          </span>
        </button>
        <button type="button" class="more-row" onClick={() => setInner('report')}>
          <span class="more-icon t-blue">
            <Icon name="flag" size={22} stroke={2.4} />
          </span>
          <span class="more-text">
            <b>{STR.moreReport}</b>
            <span>{STR.moreReportSub}</span>
          </span>
        </button>
        <button type="button" class="big-btn secondary" onClick={onClose}>
          {STR.moreClose}
        </button>
      </div>
    </div>
  );
}

function Footer({ bricks = false }: { bricks?: boolean }) {
  const [confirm, setConfirm] = useState(false);
  const [swap, setSwap] = useState(false);
  const [more, setMore] = useState(false);
  const isHost = me.value?.isHost ?? false;
  return (
    <>
      <div class={bricks ? 'host-bricks-foot' : 'ctrl-footer'}>
        {isHost && (
          <button type="button" class="foot-pill" onClick={() => setSwap(true)}>
            <Icon name="crown" size={18} stroke={2.2} />
            {STR.hostSwap}
          </button>
        )}
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
        <button type="button" class="foot-pill" onClick={() => setMore(true)}>
          <Icon name="menu" size={18} stroke={2.2} />
          {STR.more}
        </button>
        <button type="button" class="foot-pill is-danger" onClick={() => setConfirm(true)}>
          <Icon name="exit" size={18} stroke={2.2} />
          Keluar
        </button>
      </div>
      {confirm && <LeaveSheet onClose={() => setConfirm(false)} />}
      {swap && <HostSwapSheet onClose={() => setSwap(false)} />}
      {more && <MoreSheet onClose={() => setMore(false)} />}
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
    case 'peek':
      // A new deal turns the card face down; turns and timers update it in place.
      return `peek|${v.deal}`;
    case 'sling':
      // A new shot drops the local aim; lock counts and timers update it in place.
      return `sling|${v.shot}`;
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
            {p && <Avatar look={p.look} ring={p.color} size={40} />}
            <div class="host-id">
              <div class="host-name">{p?.name}</div>
              <AccessBadge />
            </div>
            {canPick && (
              <button type="button" class="big-btn yellow pick-btn" onClick={openPicker}>
                <Icon name="grid" size={18} stroke={2.4} />
                {pg.page === 'results' ? STR.changeGame : STR.pickGame}
              </button>
            )}
          </div>
          {/* Its own width decides the key layout: one row, or 3 + 2 when the labels would touch. */}
          <div class="host-bricks-box">
            <div class="host-bricks">
              <KeyButton k="back" icon="undo" label={STR.back} />
              <KeyButton k="home" icon="home" label={STR.home} />
              <Footer bricks />
            </div>
          </div>
        </div>
        <div class="pane zone dpad-zone">
          <RingPad />
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
  const learning = inGame && pg.tutorial !== undefined;
  const hostMenu = isHost && inGame && !learning && (pg.paused || hostOpening);
  const menuOpen = hostMenu || playerMenu;
  // A dark night screen (Kampung Siluman) shows nothing lit, not even the menu pill.
  const nightDark = v?.kind === 'message' && v.dark === true;
  const showPill = inGame && !menuOpen && !nightDark && !learning;
  // The pill sits at the top centre, above the game controls, never on top of them.
  useEffect(() => {
    document.documentElement.classList.toggle('has-pill', showPill);
    return () => document.documentElement.classList.remove('has-pill');
  }, [showPill]);
  const playing = inGame && !menuOpen && !learning;
  const watching = pg.page === 'results' && v !== null && !isHost;
  // While the phone shows the game's own screens it wears that game's theme; menus, the Host
  // pad, the lobby and setup stay in the neutral Hoorah style.
  useControllerTheme(playing || watching ? (pg.gameId ?? null) : null);
  let content: JSX.Element;
  if (picking.value && !inGame) {
    content = <PickPage />;
  } else if (learning) {
    content = <TutorialPhone ready={pg.tutorial?.ready ?? []} gameTitle={pg.gameTitle} />;
  } else if (hostMenu) {
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
      <HostOfferLayer />
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
