import type { GameIcon } from '@hoorah/sdk';
import { useEffect, useState } from 'preact/hooks';
import { GAMES } from '../../shared/games';
import { KeyArt } from '../../shared/keyart';
import { Avatar, Icon, type IconName } from '../../shared/ui';
import { FocusButton } from '../components';
import { setFocusMap } from '../nav';
import { goHome, lastResult, players, restartGame, sfx } from '../store';

const AWARD_ICON: Record<GameIcon, { icon: IconName; tint: string }> = {
  zap: { icon: 'zap', tint: '#FFC928' },
  fire: { icon: 'fire', tint: '#FF8A3D' },
  heart: { icon: 'heart', tint: '#5AA9FF' },
  star: { icon: 'star', tint: '#FFC928' },
  crown: { icon: 'crown', tint: '#FF5A1F' },
  target: { icon: 'target', tint: '#2DD4BF' },
  brain: { icon: 'brain', tint: '#FF5C9A' },
  build: { icon: 'build', tint: '#22B35E' },
};

const AUTOPLAY_S = 10;

export function ResultsPage() {
  const res = lastResult.value;
  const [left, setLeft] = useState(AUTOPLAY_S);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    return setFocusMap(
      {
        rows: [['again', 'change', 'done']],
        onOk: (id) => {
          if (id === 'again') restartGame();
          else goHome();
        },
        onBack: () => {
          sfx('back');
          goHome();
        },
        onMove: () => {
          sfx('tick');
          setAuto(false);
        },
      },
      'again',
    );
  }, []);

  useEffect(() => {
    if (!auto) return;
    if (left <= 0) {
      setAuto(false);
      restartGame();
      return;
    }
    const t = window.setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [left, auto]);

  if (!res) return null;
  const { result, gameId } = res;
  const byId = new Map([...(result.cpuPlayers ?? []), ...players.value].map((p) => [p.id, p]));
  const top = result.ranking.slice(0, 3);
  // One person chasing a record: no crown, no "1", just their score.
  const solo = result.ranking.length === 1;
  // Classic podium order: 2nd, 1st, 3rd.
  const order = top.length === 3 ? [top[1]!, top[0]!, top[2]!] : top.length === 2 ? [top[0]!, top[1]!] : top;
  const heights = [148, 108, 84];

  return (
    <div class="page">
      <div style={{ position: 'absolute', inset: 0 }}>
        <KeyArt id={gameId} width={1280} logo={false} />
      </div>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(17,18,20,0.86)' }} />

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 34,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--text-3)' }}>
          {GAMES[gameId].title.toUpperCase()} · SELESAI
        </div>
        <h1 class="display outline-text results-title">{result.title}</h1>
        {result.subtitle && <div style={{ fontSize: 17, color: 'var(--text-2)' }}>{result.subtitle}</div>}
      </div>

      <div class="podium" style={{ position: 'absolute', left: 100, top: 190, width: 500, height: 310 }}>
        {order.map((r) => {
          const p = byId.get(r.playerId);
          const rankIdx = Math.min(2, r.rank - 1);
          const first = r.rank === 1;
          return (
            <div class="podium-col" key={r.playerId} style={{ animationDelay: `${0.2 + rankIdx * 0.12}s` }}>
              {first && !solo && (
                <svg class="crown" width="44" height="34" viewBox="0 0 24 18" role="img" aria-label="Juara">
                  <path
                    d="M2 16 L4 4 L9 9 L12 1 L15 9 L20 4 L22 16 Z"
                    fill="#FFC928"
                    stroke="#111214"
                    stroke-width="1.5"
                    stroke-linejoin="round"
                  />
                </svg>
              )}
              {p ? (
                <Avatar
                  fruit={p.fruit}
                  ring={p.color}
                  size={first ? 124 : 92}
                  face={first ? 'happy' : 'wow'}
                />
              ) : (
                <div style={{ width: 92, height: 92 }} />
              )}
              <div
                class="podium-block"
                style={{
                  width: first ? 180 : 150,
                  height: heights[rankIdx],
                  background: first ? 'var(--orange)' : rankIdx === 1 ? '#5AA9FF' : 'var(--yellow)',
                }}
              >
                {!solo && (
                  <div class="display" style={{ fontSize: first ? 44 : 34 }}>
                    {r.rank}
                  </div>
                )}
                <div style={{ fontSize: 16, fontWeight: 800 }}>{p?.name ?? 'Pemain'}</div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  {r.label ?? r.score.toLocaleString('id-ID')}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          position: 'absolute',
          left: 640,
          top: 190,
          width: 520,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {(result.awards?.length ?? 0) > 0 && (
          <div style={{ fontSize: 15, fontWeight: 800 }}>Penghargaan malam ini</div>
        )}
        {(result.awards ?? []).slice(0, 4).map((a, i) => {
          const p = byId.get(a.playerId);
          const look = AWARD_ICON[a.icon] ?? AWARD_ICON.star;
          return (
            <div
              class="award"
              key={`${a.playerId}-${a.title}`}
              style={{ animationDelay: `${0.5 + i * 0.12}s` }}
            >
              <div class="award-icon" style={{ background: look.tint }}>
                <Icon name={look.icon} size={24} color="#111214" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{a.title}</div>
                <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{a.desc}</div>
              </div>
              {p && <Avatar fruit={p.fruit} ring={p.color} size={40} />}
            </div>
          );
        })}
        {result.ranking.length > 3 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {result.ranking.slice(3).map((r) => {
              const p = byId.get(r.playerId);
              return (
                <div class="chip" key={r.playerId}>
                  <b style={{ color: '#fff' }}>{r.rank}.</b> {p?.name ?? 'Pemain'} · {r.label ?? r.score}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 50,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', gap: 12 }}>
          <FocusButton
            id="again"
            class="btn primary"
            style={{ fontSize: 17, padding: '10px 20px 10px 12px' }}
          >
            {auto ? (
              <span style={{ position: 'relative', width: 30, height: 30, display: 'inline-block' }}>
                <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
                  <circle cx="15" cy="15" r="12" fill="none" stroke="rgba(17,18,20,0.25)" stroke-width="4" />
                  <circle
                    cx="15"
                    cy="15"
                    r="12"
                    fill="none"
                    stroke="#111214"
                    stroke-width="4"
                    stroke-linecap="round"
                    stroke-dasharray={`${(left / AUTOPLAY_S) * 75.4} 75.4`}
                    transform="rotate(-90 15 15)"
                    style={{ transition: 'stroke-dasharray 1s linear' }}
                  />
                </svg>
                <span
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  {left}
                </span>
              </span>
            ) : (
              <Icon name="play" size={16} color="#111214" />
            )}
            Main lagi
          </FocusButton>
          <FocusButton id="change" class="btn">
            Ganti game
          </FocusButton>
          <FocusButton id="done" class="btn">
            Selesai
          </FocusButton>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
          {auto
            ? `Lanjut otomatis dalam ${left} detik · Host bisa memilih lain dari HP`
            : 'Pilih langkah berikutnya'}
        </div>
      </div>
    </div>
  );
}
