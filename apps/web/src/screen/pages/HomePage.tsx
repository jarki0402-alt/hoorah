/**
 * Home of the main screen: the Mode Pesta and Acak! posters on top, then rows stacked downwards
 * ("Pas untuk kalian", one per mood) and the full catalog as a 5-column grid with category tabs.
 * Up/down moves between rows (each row remembers its card), left/right along a row; the page
 * glides so the focused row stays in view. The same groups are in the Host's phone picker.
 */
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { CATEGORIES, GAMES, type GameId, gamesForTab, MOODS } from '../../shared/games';
import { cardTag, GRID_TABS, type GridTab, gridGames, type HomeRow, homeRows } from '../../shared/homeRows';
import { KeyArt } from '../../shared/keyart';
import { Icon } from '../../shared/ui';
import { FocusButton, InvitePanel, TopBar } from '../components';
import { type CardRow, cardFocusId, cardGame, gridTabId, PARTY_ID, RANDOM_ID } from '../homeFocus';
import { focus, focused, press, setFocusMap } from '../nav';
import {
  connected,
  goJoin,
  homeJump,
  homeTab,
  inviting,
  openDetail,
  page,
  partyLineup,
  recent,
  runTopBar,
  setInviting,
  sfx,
  startParty,
  TOP_BAR_IDS,
} from '../store';
import { HOME } from '../strings';
import './home.css';

const CARD_W = 224;
const CARD_GAP = 16;
const GRID_COLS = 5;
/** Space kept above the focused row when the page glides to it. */
const ROW_PAD = 6;
const GRID_ROW_PAD = 10;

/** Where focus was when home was left; restored on return while that item is still there. */
let lastFocus = '';
/** Last phone jump handled, so returning home does not replay an old one. */
let seenJump = homeJump.peek();

interface NavRow {
  key: string;
  ids: string[];
}

function chunk<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

const gridLabel = (t: GridTab): string =>
  t === 'all' ? HOME.allTab : (CATEGORIES.find((c) => c.id === t)?.label ?? t);

type Spin = { phase: 'idle' } | { phase: 'spin' | 'done'; shown: GameId };

export function HomePage() {
  const n = connected.value.length;
  const recentNow = recent.value;
  const rows = homeRows(n, recentNow).filter((r) => r.games.length > 0);
  const [gridTab, setGridTab] = useState<GridTab>('all');
  const grid = gridGames(gridTab);
  const gridRows = chunk(grid, GRID_COLS);
  const invitingNow = inviting.value;
  const fid = focused.value;
  const jump = homeJump.value;

  const nav: NavRow[] = [
    { key: 'top', ids: ['invite', ...TOP_BAR_IDS] },
    { key: 'posters', ids: [PARTY_ID, RANDOM_ID] },
    ...rows.map((r) => ({ key: r.id, ids: r.games.map((g) => cardFocusId(g, r.id)) })),
    { key: 'gtabs', ids: GRID_TABS.map(gridTabId) },
    ...gridRows.map((c, i) => ({ key: `grid${i}`, ids: c.map((g) => cardFocusId(g, 'all')) })),
  ];
  const navKey = nav.map((r) => r.ids.join(',')).join('|');
  const navRef = useRef(nav);
  navRef.current = nav;
  const gridTabRef = useRef(gridTab);
  gridTabRef.current = gridTab;
  /** Card each row was left on, so coming back lands where you were. */
  const memory = useRef<Record<string, number>>({});

  // The party lineup is shown on the poster before it starts; a new one when the room changes.
  const [lineup, setLineup] = useState<GameId[]>(() => partyLineup());
  useEffect(() => setLineup(partyLineup()), [n]);
  const lineupRef = useRef(lineup);
  lineupRef.current = lineup;

  /* ------------------------------------------------------------ Acak! */
  const [spin, setSpin] = useState<Spin>({ phase: 'idle' });
  const spinning = useRef(false);
  const timers = useRef<number[]>([]);
  useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
    },
    [],
  );
  const spinRef = useRef<() => void>(() => {});
  spinRef.current = () => {
    if (spinning.current) return;
    const pool = gamesForTab('fit', n);
    if (pool.length === 0) {
      sfx('wrong');
      return;
    }
    spinning.current = true;
    const pick = pool[Math.floor(Math.random() * pool.length)]!;
    const start = Math.floor(Math.random() * pool.length);
    const steps = 14;
    let t = 0;
    for (let i = 0; i < steps; i++) {
      // Slows down like a wheel: short steps first, longer ones near the end.
      t += 55 + i * i * 1.1;
      const last = i === steps - 1;
      const shown = last ? pick : pool[(start + i) % pool.length]!;
      timers.current.push(
        window.setTimeout(() => {
          setSpin({ phase: last ? 'done' : 'spin', shown });
          sfx(last ? 'select' : 'tick');
        }, t),
      );
    }
    timers.current.push(
      window.setTimeout(() => {
        spinning.current = false;
        setSpin({ phase: 'idle' });
        if (page.peek() === 'home') openDetail(pick);
      }, t + 700),
    );
  };

  /* ------------------------------------------------------------ focus map */
  const jumpTo = (section: string) => {
    if (section === 'all') return focus(gridTabId(gridTabRef.current));
    const row = navRef.current.find((r) => r.key === section);
    const id = row?.ids[memory.current[section] ?? 0] ?? row?.ids[0];
    if (id) focus(id);
  };

  useEffect(() => {
    // The invite panel owns the focus while open; this map comes back when it closes.
    if (invitingNow) return;
    const all = nav.flatMap((r) => r.ids);
    const current = focused.peek();
    // A card that left its row (a new game played, another tab) hands over to that row's first card.
    const sameRow = (id: string) => {
      const at = id.indexOf('@');
      if (!id.startsWith('card-') || at < 0) return undefined;
      const row = id.slice(at + 1);
      return nav.find((r) => r.key === row || (row === 'all' && r.key === 'grid0'))?.ids[0];
    };
    const initial =
      current === 'close'
        ? 'invite'
        : all.includes(current)
          ? current
          : all.includes(lastFocus)
            ? lastFocus
            : (sameRow(current) ?? sameRow(lastFocus) ?? PARTY_ID);
    const dispose = setFocusMap(
      {
        rows: nav.map((r) => r.ids),
        onOk: (id) => {
          if (runTopBar(id)) return;
          if (id === 'invite') return setInviting(true);
          if (id === PARTY_ID) return startParty(lineupRef.current);
          if (id === RANDOM_ID) return spinRef.current();
          if (id.startsWith('gtab-')) return;
          const g = cardGame(id);
          if (g) openDetail(g);
        },
        onBack: () => {
          sfx('back');
          goJoin();
        },
        onMove: () => sfx('tick'),
        pickCol: (to, from, col) => {
          const toKey = navRef.current[to]?.key ?? '';
          const fromKey = navRef.current[from]?.key ?? '';
          if (toKey === 'top') return undefined;
          // Down the grid: same column. Onto the tabs: the tab in use.
          if (toKey.startsWith('grid') && fromKey.startsWith('grid')) return col;
          if (toKey === 'gtabs') return GRID_TABS.indexOf(gridTabRef.current);
          return memory.current[toKey] ?? 0;
        },
      },
      initial,
    );
    if (seenJump !== homeJump.peek()) {
      seenJump = homeJump.peek();
      jumpTo(homeTab.peek());
    }
    return dispose;
  }, [navKey, invitingNow]);

  // A group tapped in the Host's phone picker: jump to that row (or the grid).
  useEffect(() => {
    if (seenJump === jump || invitingNow) return;
    seenJump = jump;
    jumpTo(homeTab.peek());
  }, [jump]);

  /* ------------------------------------------------------------ glide to the focused row */
  const viewport = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(0);
  const [shifts, setShifts] = useState<Record<string, number>>({});
  const [pinned, setPinned] = useState<GameId | null>(null);

  useEffect(() => {
    const at = nav.findIndex((r) => r.ids.includes(fid));
    if (at < 0) return;
    const row = nav[at]!;
    const col = row.ids.indexOf(fid);
    memory.current[row.key] = col;
    lastFocus = fid;
    const game = cardGame(fid);
    if (game) setPinned(game);
    // The grid follows the tab in focus at once (no OK needed on a remote).
    if (row.key === 'gtabs') {
      const t = GRID_TABS[col]!;
      if (t !== gridTabRef.current) setGridTab(t);
    }

    const box = scroller.current;
    const view = viewport.current;
    if (!box || !view) return;
    // Vertical: the posters keep the page at the top; any other row slides up under the top bar.
    let y = 0;
    if (row.key !== 'top' && row.key !== 'posters') {
      const el = box.querySelector<HTMLElement>(`[data-nav="${row.key}"]`);
      const pad = row.key.startsWith('grid') && row.key !== 'grid0' ? GRID_ROW_PAD : ROW_PAD;
      const target = row.key === 'grid0' ? box.querySelector<HTMLElement>('[data-nav="gtabs"]') : el;
      if (target) y = target.offsetTop - pad;
    }
    const max = Math.max(0, box.scrollHeight - view.clientHeight);
    setScrollY(Math.round(Math.max(0, Math.min(max, y))));

    // Horizontal: a row wider than the screen slides to keep the focused card in view.
    const strip = box.querySelector<HTMLElement>(`[data-nav="${row.key}"] .cards-viewport`);
    if (strip) {
      // The strip bleeds 48px past the left margin; keep a 36px margin on the right.
      const visible = strip.clientWidth - 84;
      const left = col * (CARD_W + CARD_GAP);
      const right = left + CARD_W;
      setShifts((s) => {
        const cur = s[row.key] ?? 0;
        const next = Math.max(0, Math.min(left, Math.max(cur, right - visible)));
        return next === cur ? s : { ...s, [row.key]: next };
      });
    }
  }, [fid, navKey]);
  // A changed row (new recent game, other tab) starts from its left end again.
  useEffect(() => setShifts({}), [navKey]);

  // Mouse wheel and trackpads step through the rows like the arrow keys.
  const lastWheel = useRef(0);
  const onWheel = (e: JSX.TargetedWheelEvent<HTMLDivElement>) => {
    const now = performance.now();
    if (Math.abs(e.deltaY) < 8 || now - lastWheel.current < 220) return;
    lastWheel.current = now;
    press(e.deltaY > 0 ? 'down' : 'up');
  };

  /* ------------------------------------------------------------ render */
  const fidGame = cardGame(fid);
  const featured: GameId =
    fidGame ??
    (fid === RANDOM_ID && spin.phase !== 'idle' ? spin.shown : null) ??
    (fid === PARTY_ID ? lineup[0] : null) ??
    pinned ??
    lineup[0] ??
    rows[0]?.games[0] ??
    'bajaj';
  const rowOf = (key: string) => nav.find((r) => r.ids.includes(fid))?.key === key;

  return (
    <div class="page home">
      <div class="hero-art" key={featured}>
        <KeyArt id={featured} width={1100} logo={false} />
      </div>
      <div class="scrim-left" />
      <div class="scrim-bottom" />
      <div class={`home-dim ${scrollY > 0 ? 'deep' : ''}`} />
      <TopBar />

      <div class="home-viewport" ref={viewport} onWheel={onWheel}>
        <div class="home-scroll" ref={scroller} style={{ transform: `translateY(${-scrollY}px)` }}>
          <section class="home-posters" data-nav="posters">
            <PartyPoster lineup={lineup} />
            <RandomPoster spin={spin} />
          </section>

          {rows.map((r) => (
            <section class="home-row" data-nav={r.id} key={r.id}>
              <RowHead row={r} n={n} focusGame={rowOf(r.id) ? fidGame : null} />
              <div class="cards-viewport">
                <div class="cards" style={{ transform: `translateX(${-(shifts[r.id] ?? 0)}px)` }}>
                  {r.games.map((id) => (
                    <GameCard key={id} id={id} row={r.id} n={n} on={fid === cardFocusId(id, r.id)} />
                  ))}
                </div>
              </div>
            </section>
          ))}

          <section class="home-all" data-nav="gtabs">
            <div class="home-row-head">
              <h2 class="home-row-title">{HOME.allTitle}</h2>
              <nav class="home-gtabs" aria-label={HOME.allTitle}>
                {GRID_TABS.map((t) => (
                  <FocusButton key={t} id={gridTabId(t)} class={`home-gtab ${gridTab === t ? 'on' : ''}`}>
                    <span class="home-gtab-label">{gridLabel(t)}</span>
                    <span class="home-gtab-count">{gridGames(t).length}</span>
                  </FocusButton>
                ))}
              </nav>
              {fidGame && fid.endsWith('@all') && <FocusLine id={fidGame} />}
            </div>
            <div class="home-grid">
              {grid.length === 0 && <div class="cards-empty">{HOME.empty}</div>}
              {gridRows.map((c, i) => (
                <div class="home-grid-row" data-nav={`grid${i}`} key={`${gridTab}-${i}`}>
                  {c.map((id) => (
                    <GameCard key={id} id={id} row="all" n={n} on={fid === cardFocusId(id, 'all')} />
                  ))}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
      {invitingNow && <InvitePanel />}
    </div>
  );
}

/* ------------------------------------------------------------------ parts */

function RowHead({ row, n, focusGame }: { row: HomeRow; n: number; focusGame: GameId | null }) {
  const mood = row.id === 'fit' ? null : MOODS[row.id];
  return (
    <div class="home-row-head">
      <h2 class={`home-row-title ${mood ? `mood-text-${row.id}` : ''}`}>
        {mood && <Icon name={mood.icon} size={18} stroke={2.6} />}
        {mood ? mood.label : HOME.rowFit}
      </h2>
      <span class="home-row-sub">{mood ? HOME.rowMoodSub(row.games.length) : HOME.rowFitSub(n)}</span>
      {focusGame && <FocusLine id={focusGame} />}
    </div>
  );
}

/** The focused game's name and tagline, at the right of its row's heading. */
function FocusLine({ id }: { id: GameId }) {
  const g = GAMES[id];
  return (
    <span class="home-focus" key={id}>
      <b class="home-focus-title">{g.title}</b>
      <span class="home-focus-tagline">{g.tagline}</span>
    </span>
  );
}

function GameCard({ id, row, n, on }: { id: GameId; row: CardRow; n: number; on: boolean }) {
  const info = GAMES[id];
  const tag = cardTag(id);
  const fits = n === 0 || (n >= info.minPlayers && n <= info.maxPlayers);
  return (
    <FocusButton id={cardFocusId(id, row)} class={`card ${info.available ? '' : 'soon'}`}>
      <div class="card-art">
        {tag && <span class={`tag card-badge card-badge-${tag.toLowerCase()}`}>{tag}</span>}
        <KeyArt id={id} width={CARD_W} radius={12} />
      </div>
      <div class="card-meta">
        <span class="card-title">{info.title}</span>
        {info.available ? (
          <span class="card-sub">
            <span class={`mood-pill mood-${info.mood}`}>{MOODS[info.mood].label}</span>
            {on && (
              <span class={`card-players ${fits ? '' : 'short'}`}>
                {fits ? HOME.players(info.minPlayers, info.maxPlayers) : HOME.needs(info.minPlayers)}
              </span>
            )}
          </span>
        ) : (
          <span class="card-sub">{HOME.soon}</span>
        )}
      </div>
    </FocusButton>
  );
}

function PartyPoster({ lineup }: { lineup: GameId[] }) {
  return (
    <FocusButton id={PARTY_ID} class="poster poster-party">
      <span class="poster-copy">
        <span class="poster-eyebrow">{HOME.partyEyebrow}</span>
        <span class="poster-title display">{HOME.partyTitle(lineup.length)}</span>
        <span class="poster-text">{HOME.partyText}</span>
        <span class="poster-cta">
          <Icon name="play" size={15} color="#fff" />
          {HOME.partyCta}
        </span>
      </span>
      <span class="poster-lineup" aria-hidden="true">
        {lineup.map((id, i) => (
          <span class="lineup-card" key={id} style={{ '--i': i } as JSX.CSSProperties}>
            <KeyArt id={id} width={150} radius={10} />
            <span class="lineup-no">{i + 1}</span>
          </span>
        ))}
        <span class="lineup-names">{lineup.map((id) => GAMES[id].title).join(' · ')}</span>
      </span>
    </FocusButton>
  );
}

function RandomPoster({ spin }: { spin: Spin }) {
  const shown = spin.phase === 'idle' ? null : spin.shown;
  return (
    <FocusButton id={RANDOM_ID} class={`poster poster-random is-${spin.phase}`}>
      <span class="poster-copy">
        <span class="poster-eyebrow">
          {spin.phase === 'idle'
            ? HOME.randomEyebrow
            : spin.phase === 'done'
              ? HOME.randomPicked
              : HOME.randomSpinning}
        </span>
        <span class="poster-title display">{shown ? GAMES[shown].title : HOME.randomTitle}</span>
        {!shown && <span class="poster-text">{HOME.randomText}</span>}
        {!shown && (
          <span class="poster-cta">
            <Icon name="restart" size={15} color="#fff" />
            {HOME.randomCta}
          </span>
        )}
      </span>
      {shown ? (
        <span class="random-window" key={shown}>
          <KeyArt id={shown} width={176} radius={12} />
        </span>
      ) : (
        <svg class="random-die" viewBox="0 0 80 80" aria-hidden="true">
          <rect x="6" y="6" width="68" height="68" rx="16" fill="#fff" stroke="#111214" stroke-width="5" />
          <circle cx="24" cy="24" r="6.5" fill="#111214" />
          <circle cx="56" cy="24" r="6.5" fill="#111214" />
          <circle cx="40" cy="40" r="6.5" fill="#FF5A1F" />
          <circle cx="24" cy="56" r="6.5" fill="#111214" />
          <circle cx="56" cy="56" r="6.5" fill="#111214" />
        </svg>
      )}
    </FocusButton>
  );
}
