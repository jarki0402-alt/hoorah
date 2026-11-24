import type { ComponentChild } from 'preact';
import { useEffect } from 'preact/hooks';
import { GAMES, MOODS, playsRemote } from '../../shared/games';
import { cardTag } from '../../shared/homeRows';
import { KeyArt } from '../../shared/keyart';
import { Avatar, Icon, type IconName } from '../../shared/ui';
import { AccessTag, FocusButton } from '../components';
import { setFocusMap } from '../nav';
import {
  canPlayGame,
  connected,
  goHome,
  offer,
  openTutorial,
  remoteOn,
  selected,
  sfx,
  startGame,
  tutorial,
} from '../store';
import { OFFER, REMOTE } from '../strings';
import { OfferLayer } from './OfferOverlay';

export function DetailPage() {
  const id = selected.value;
  const g = GAMES[id];
  // Same tag as the home cards: "Baru" only for the newest wave.
  const tag = cardTag(id);

  const reading = tutorial.value !== null;
  const offerOpen = offer.value !== null;
  // A locked game still shows its page and "Cara main"; its play button opens the Pass offer.
  const locked = !canPlayGame(id);
  // A far-away main screen watches and cannot show this game yet (long-distance play).
  const remote = remoteOn.value;
  const farOff = remote && !playsRemote(id);
  useEffect(() => {
    // "Cara main" or the Pass offer open on top: it owns the remote until it closes.
    if (reading || offerOpen) return;
    return setFocusMap(
      {
        rows: [['play'], ['howto'], ['back']],
        onOk: (fid) => {
          // startGame opens the offer for a game this room cannot start.
          if (fid === 'play') return startGame(id);
          if (fid === 'howto') return openTutorial(id);
          if (fid === 'back') {
            sfx('back');
            return goHome();
          }
        },
        onBack: () => {
          sfx('back');
          goHome();
        },
        onMove: () => sfx('tick'),
      },
      'play',
    );
  }, [id, reading, offerOpen]);

  const mood = MOODS[g.mood];
  const list = connected.value;
  const enough = list.length >= g.minPlayers;
  const facts: { k: string; icon: IconName; v: ComponentChild }[] = [
    { k: 'Pemain', icon: 'users', v: `${g.minPlayers}–${g.maxPlayers}` },
    { k: 'Suasana', icon: mood.icon, v: <span class={`mood-pill mood-${g.mood}`}>{mood.label}</span> },
    { k: 'Kontrol', icon: 'tap', v: g.control },
    { k: 'Posisi HP', icon: 'tv', v: g.orientation },
  ];

  return (
    <div class="page">
      <div style={{ position: 'absolute', left: 0, top: -150 }}>
        <KeyArt id={id} width={1280} logo={false} />
      </div>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(0deg, #111214 0%, #111214 52%, rgba(17,18,20,0.35) 74%, rgba(17,18,20,0.1) 100%)',
        }}
      />
      <div
        class="chip glass"
        style={{ position: 'absolute', left: 48, top: 24, fontWeight: 700, color: '#fff' }}
      >
        <Icon name="back" size={16} />
        Beranda
      </div>

      <div class="detail-copy">
        <div style={{ display: 'flex', gap: 8 }}>
          {tag && <span class={`tag card-badge-${tag.toLowerCase()}`}>{tag}</span>}
          <AccessTag game={id} />
          {farOff && <span class="tag remote-tag">{REMOTE.tag}</span>}
        </div>
        <h1
          class="display outline-text hero-title"
          style={{ fontSize: 60, color: g.logoColor === '#FFFFFF' ? '#FFC928' : g.logoColor }}
        >
          {g.title}
        </h1>
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: 'var(--text-2)', maxWidth: 640 }}>
          {g.description}
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          {facts.map((f) => (
            <div class="fact" key={f.k}>
              <Icon name={f.icon} size={20} color="#FFC928" />
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{f.k}</div>
                <div style={{ fontSize: 14, fontWeight: 800 }}>{f.v}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 6, fontSize: 15, fontWeight: 800 }}>Cara main</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
          {g.howTo.map((h, i) => (
            <div class="howto" key={h.t}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span class="howto-num">{i + 1}</span>
                <span style={{ fontSize: 14, fontWeight: 800 }}>{h.t}</span>
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--text-3)' }}>{h.d}</div>
            </div>
          ))}
        </div>
      </div>

      <div class="side-panel on-surface">
        <div style={{ fontSize: 15, fontWeight: 800 }}>
          {enough ? 'Siap main' : `Butuh minimal ${g.minPlayers} pemain`}
        </div>
        {remote && (
          <div class={`remote-detail ${farOff ? 'is-off' : ''}`}>
            <Icon name="wifi" size={16} stroke={2.6} />
            {farOff ? REMOTE.detailNote : REMOTE.detailOk}
          </div>
        )}
        {list.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Belum ada pemain. Scan QR di layar awal.</div>
        )}
        {list.slice(0, 4).map((p) => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar look={p.look} ring={p.color} size={40} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>{p.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{p.isHost ? 'Host' : 'Pemain'}</div>
            </div>
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 13,
                fontWeight: 800,
                color: 'var(--green-text)',
              }}
            >
              <Icon name="check" size={14} stroke={3.2} />
              Siap
            </span>
          </div>
        ))}
        {list.length > 4 && (
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>+{list.length - 4} pemain lain</div>
        )}
        <div style={{ height: 1, background: 'var(--surface-2)' }} />
        <FocusButton
          id="play"
          class="btn primary"
          style={{
            marginTop: 4,
            fontSize: 17,
            padding: 13,
            opacity: (enough || locked) && !farOff ? 1 : 0.6,
          }}
        >
          <Icon name={locked || farOff ? 'lock' : 'play'} size={16} color="#111214" />
          {farOff ? REMOTE.tag : locked ? OFFER.playLocked : 'Main'}
        </FocusButton>
        <FocusButton id="howto" class="btn" style={{ padding: 9, fontSize: 14 }}>
          <Icon name="tap" size={14} />
          Cara main
        </FocusButton>
        <FocusButton id="back" class="btn" style={{ padding: 9, fontSize: 14 }}>
          Kembali
        </FocusButton>
        <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>{g.tips[0]}</div>
      </div>
      <OfferLayer />
    </div>
  );
}
