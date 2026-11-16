import { useEffect, useRef, useState } from 'preact/hooks';
import {
  FEATURED,
  GAMES,
  type GameId,
  gamesForTab,
  HOME_TABS,
  type HomeTab,
  MOODS,
} from '../../shared/games';
import { KeyArt } from '../../shared/keyart';
import { Icon, type IconName } from '../../shared/ui';
import { FocusButton, InvitePanel, TopBar } from '../components';
import { focused, setFocusMap } from '../nav';
import {
  connected,
  goJoin,
  homeTab,
  inviting,
  openDetail,
  recent,
  runTopBar,
  setHomeTab,
  setInviting,
  sfx,
  TOP_BAR_IDS,
} from '../store';

const CARD_W = 224;
const CARD_GAP = 16;

export function HomePage() {
  const [hero, setHero] = useState(0);
  // The game whose card was focused last: the big banner shows it until another card or tab.
  const [pinned, setPinned] = useState<GameId | null>(null);
  const featured = pinned ?? (FEATURED[hero % FEATURED.length] as GameId);
  const g = GAMES[featured];
  const heroRef = useRef<GameId>(featured);
  heroRef.current = featured;

  // The row follows the tab (picked here with the remote, or in the Host's phone picker).
  const tab = homeTab.value;
  const n = connected.value.length;
  const list = gamesForTab(tab, n, recent.value, true);
  const listKey = `${tab}|${list.join(',')}`;
  const invitingNow = inviting.value;

  useEffect(() => {
    // The invite panel owns the focus while open; this map comes back when it closes.
    if (invitingNow) return;
    const cards = list.map((id) => `card-${id}`);
    const tabs = HOME_TABS.map((t) => `tab-${t.id}`);
    const current = focused.peek();
    // Stay where focus is; a card that left the row hands over to the row's first card; coming
    // from another page starts on the hero button.
    const top = [...tabs, 'invite', ...TOP_BAR_IDS];
    const known = [...top, 'close', 'hero-play', 'hero-how', ...cards].includes(current);
    const initial =
      current === 'close'
        ? 'invite'
        : known
          ? current
          : current.startsWith('card-') && cards[0]
            ? cards[0]
            : 'hero-play';
    return setFocusMap(
      {
        rows: [top, ['hero-play', 'hero-how'], cards],
        onOk: (id) => {
          if (runTopBar(id)) return;
          if (id === 'invite') return setInviting(true);
          if (id.startsWith('tab-')) return setHomeTab(id.slice(4) as HomeTab);
          if (id === 'hero-play' || id === 'hero-how') return openDetail(heroRef.current);
          openDetail(id.slice(5) as GameId);
        },
        onBack: () => {
          sfx('back');
          goJoin();
        },
        onMove: () => sfx('tick'),
      },
      initial,
    );
  }, [listKey, invitingNow]);

  // Featured games rotate on the banner until someone looks at a card; a new tab starts over.
  useEffect(() => {
    if (pinned) return;
    const t = window.setInterval(() => {
      if (!focused.value.startsWith('hero')) return;
      setHero((h) => h + 1);
    }, 7000);
    return () => window.clearInterval(t);
  }, [pinned]);
  useEffect(() => setPinned(null), [tab]);

  // Keep the focused card in view when the row is wider than the screen.
  const viewport = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);
  const fid = focused.value;
  // A new tab starts the row from the left.
  useEffect(() => setShift(0), [tab]);
  useEffect(() => {
    if (!fid.startsWith('card-')) return;
    const id = fid.slice(5) as GameId;
    const i = list.indexOf(id);
    if (i < 0) return;
    // The banner follows the card in focus (the white ring).
    setPinned(id);
    // The viewport bleeds 48px past the left margin; keep a 36px margin on the right.
    const visible = (viewport.current?.clientWidth ?? 1280) - 84;
    const left = i * (CARD_W + CARD_GAP);
    const right = left + CARD_W;
    setShift((s) => Math.min(left, Math.max(s, right - visible)));
  }, [fid]);

  const fits = n >= g.minPlayers && n <= g.maxPlayers;
  const mood = MOODS[g.mood];
  const chips: { key: string; icon: IconName; text: string; cls?: string }[] = [
    { key: 'players', icon: 'users', text: `${g.minPlayers}–${g.maxPlayers} pemain` },
    { key: 'mood', icon: mood.icon, text: mood.label, cls: `mood-${g.mood}` },
    { key: 'control', icon: 'tap', text: g.control },
  ];

  return (
    <div class="page">
      <div class="hero-art" key={featured}>
        <KeyArt id={featured} width={1100} logo={false} />
      </div>
      <div class="scrim-left" />
      <div class="scrim-bottom" />
      <TopBar>
        <nav aria-label="Kategori" class="home-tabs">
          {HOME_TABS.map((t) => (
            <FocusButton key={t.id} id={`tab-${t.id}`} class={`home-tab ${tab === t.id ? 'on' : ''}`}>
              {t.label}
            </FocusButton>
          ))}
        </nav>
      </TopBar>

      <div class="hero-copy" key={`copy-${featured}`}>
        <div style={{ display: 'flex', gap: 8 }}>
          {g.badge && <span class="tag">{g.badge}</span>}
          {featured === 'tarik' && (
            <span class="tag" style={{ background: '#E8352E', color: '#fff' }}>
              EDISI 17-AN
            </span>
          )}
        </div>
        <h1
          class="display outline-text hero-title"
          style={{ color: g.logoColor === '#FFFFFF' ? '#FFC928' : g.logoColor }}
        >
          {g.title}
        </h1>
        <p style={{ margin: 0, fontSize: 17, lineHeight: 1.5, color: 'var(--text-2)' }}>{g.description}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {chips.map((c) => (
            <span class={`meta-chip ${c.cls ?? ''}`} key={c.key}>
              <Icon name={c.icon} size={15} />
              {c.text}
            </span>
          ))}
          {n > 0 && (
            <span class={`meta-chip ${fits ? 'good' : ''}`}>
              <Icon name={fits ? 'check' : 'users'} size={15} />
              {fits
                ? n === 2
                  ? 'Cocok untuk kalian berdua'
                  : 'Cocok untuk kalian'
                : `Butuh ${g.minPlayers} pemain`}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
          <FocusButton id="hero-play" class="btn primary" style={{ fontSize: 17, padding: '12px 24px' }}>
            <Icon name="play" size={16} color="#111214" />
            Main sekarang
          </FocusButton>
          <FocusButton id="hero-how" class="btn glass">
            Cara main
          </FocusButton>
        </div>
        {!pinned && (
          <div class="dots" aria-hidden="true">
            {FEATURED.map((id, i) => (
              <span key={id} class={i === hero % FEATURED.length ? 'on' : ''} />
            ))}
          </div>
        )}
      </div>

      <div class="row-section">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
            {tab !== 'fit'
              ? (HOME_TABS.find((t) => t.id === tab)?.label ?? '')
              : n === 2
                ? 'Pas untuk 2 pemain'
                : 'Main sekarang'}
          </h2>
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
            {n > 0
              ? `Bisa dimainkan ${connected.value.map((p) => p.name).join(' & ')} sekarang`
              : 'Scan QR dulu untuk bergabung'}
          </div>
        </div>
        <div class="cards-viewport" ref={viewport}>
          <div class="cards" style={{ transform: `translateX(${-shift}px)` }}>
            {list.length === 0 && (
              <div class="cards-empty">Belum ada game di sini untuk jumlah pemain ini.</div>
            )}
            {list.map((id) => {
              const info = GAMES[id];
              const cardId = `card-${id}`;
              return (
                <FocusButton key={id} id={cardId} class={`card ${info.available ? '' : 'soon'}`}>
                  <div class="card-art">
                    {info.badge && (
                      <span
                        class="tag card-badge"
                        style={
                          info.badge === 'SEGERA'
                            ? { background: '#111214', color: '#fff' }
                            : info.badge === 'FAVORIT'
                              ? { background: '#FF5A1F' }
                              : undefined
                        }
                      >
                        {info.badge}
                      </span>
                    )}
                    <KeyArt id={id} width={CARD_W} radius={12} />
                  </div>
                  <div class="card-meta">
                    <span class="card-title">{info.title}</span>
                    {info.available ? (
                      <span class="card-sub">
                        <span class={`mood-pill mood-${info.mood}`}>{MOODS[info.mood].label}</span>
                        {info.minPlayers}–{info.maxPlayers} pemain
                      </span>
                    ) : (
                      <span class="card-sub">Segera</span>
                    )}
                  </div>
                </FocusButton>
              );
            })}
          </div>
        </div>
      </div>
      {invitingNow && <InvitePanel />}
    </div>
  );
}
