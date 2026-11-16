import { useEffect, useRef, useState } from 'preact/hooks';
import { GAMES } from '../../shared/games';
import { KeyArt } from '../../shared/keyart';
import { Avatar, Icon, LogoMark } from '../../shared/ui';
import { InvitePanel } from '../components';
import { setFocusMap } from '../nav';
import {
  type ActiveGame,
  activeGame,
  attachGame,
  connected,
  detachGame,
  inviting,
  players,
  togglePause,
} from '../store';

function Loading({ g }: { g: ActiveGame }) {
  const info = GAMES[g.id];
  const [pct, setPct] = useState(8);
  useEffect(() => {
    const t = window.setInterval(() => setPct((p) => Math.min(92, p + (100 - p) * 0.12)), 120);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div class="overlay" style={{ background: 'var(--ink)' }}>
      <div class="loading-box">
        <KeyArt id={g.id} width={320} radius={16} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 15, color: 'var(--text-3)' }}>Memuat</div>
          <h1 class="display" style={{ margin: '6px 0 0', fontSize: 44 }}>
            {info.title}
          </h1>
        </div>
        <div style={{ width: '100%' }}>
          <div
            class="progress"
            role="progressbar"
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10 }}>
          {connected.value.map((p) => (
            <div key={p.id} class="chip" style={{ padding: '4px 12px 4px 4px' }}>
              <Avatar fruit={p.fruit} ring={p.color} size={30} />
              <b style={{ color: '#fff' }}>{p.name}</b>
            </div>
          ))}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            border: '1px solid var(--line)',
            borderRadius: 14,
            padding: '12px 16px',
            width: '100%',
          }}
        >
          <Icon name="tv" size={22} color="#FFC928" />
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--yellow)' }}>
              TIPS PRO
            </div>
            <div style={{ fontSize: 15, color: 'var(--text-2)' }}>
              {info.tips[g.run % Math.max(1, info.tips.length)] ?? ''}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Paused: a calm full screen with the Hoorah logo, no menu list (owner decision 2026-11-14). The
 * Host runs the pause menu from the phone; a remote or keyboard can still resume with OK/Back.
 */
function PauseScreen({ g }: { g: ActiveGame }) {
  useEffect(() => {
    return setFocusMap(
      {
        rows: [['resume']],
        onOk: () => togglePause(false),
        onBack: () => togglePause(false),
        onMenu: () => togglePause(false),
      },
      'resume',
    );
  }, []);
  const host = players.value.find((p) => p.isHost);
  return (
    <div class="overlay pause-screen">
      <div class="pause-card">
        <LogoMark size={96} />
        <h1 class="display pause-title">Dijeda</h1>
        <div class="pause-game">{GAMES[g.id].title}</div>
        <div class="pause-hint">
          {host ? (
            <>
              <Avatar fruit={host.fruit} ring={host.color} size={34} />
              <span>
                <b>{host.name}</b> bisa melanjutkan dari HP
              </span>
            </>
          ) : (
            <span>Lanjutkan dari HP Host</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** "Tambah pemain": the join QR and code over the paused game. */
export function GamePage() {
  const g = activeGame.value;
  const frame = useRef<HTMLIFrameElement>(null);

  // Attach before the iframe loads so its "hello" is answered.
  useEffect(() => {
    if (!g || !frame.current) return;
    const el = frame.current;
    attachGame(el, g);
    return () => detachGame(el);
  }, [g?.run]);

  // While playing, the only TV control is the menu (pause).
  useEffect(() => {
    if (!g || g.paused) return;
    return setFocusMap(
      { rows: [['game']], onOk: () => {}, onBack: () => togglePause(true), onMenu: () => togglePause(true) },
      'game',
    );
  }, [g?.run, g?.paused]);

  if (!g) return null;
  return (
    <div class="page" style={{ animation: 'none' }}>
      <iframe
        key={g.run}
        ref={frame}
        class="game-frame"
        title={GAMES[g.id].title}
        src={`/games/${g.id}/?run=${g.run}`}
        allow="autoplay; fullscreen"
      />
      {!g.ready && <Loading g={g} />}
      {g.paused && (inviting.value ? <InvitePanel inGame /> : <PauseScreen g={g} />)}
    </div>
  );
}
