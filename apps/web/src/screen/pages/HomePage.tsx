/**
 * Home of the main screen, one calm screen instead of a long scroll (owner 2026-11-22): the focused
 * game up top (big art, name, players, one line), the Mode Pesta and Acak quick starts under it,
 * one row of shelf tabs (the same groups as the Host's phone picker) and one grid of cards, two
 * rows of five in view. Down/up moves top bar → quick starts → shelves → grid; a shelf follows the
 * tab in focus at once, and a long shelf glides one card row at a time.
 */
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { GAMES, type GameId, gamesForTab, MOODS } from '../../shared/games';
import { cardTag, catalogByCategory, type HomeRow, type HomeSection, homeRows } from '../../shared/homeRows';
import { KeyArt } from '../../shared/keyart';
import { Icon } from '../../shared/ui';
import { FocusButton, InvitePanel, TopBar } from '../components';
import { cardFocusId, cardGame, PARTY_ID, RANDOM_ID, shelfId, shelfOf } from '../homeFocus';
import { focus, focused, focusFromPointer, press, setFocusMap } from '../nav';
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
const GRID_COLS = 5;
/** Card rows in view at once; a longer shelf glides. */
const ROWS_IN_VIEW = 2;

/** Where focus was when home was left; restored on return while that item is still there. */
let lastFocus = '';
/** Shelf shown when home was left. */
let lastShelf: HomeSection = homeTab.peek();
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

/** Games on a shelf: a home row, or the whole catalog grouped like the phone's "Semua". */
function shelfGames(shelf: HomeSection, rows: readonly HomeRow[]): GameId[] {
  if (shelf === 'all') return catalogByCategory();
  return rows.find((r) => r.id === shelf)?.games ?? [];
}

const shelfLabel = (s: HomeSection): string =>
  s === 'fit' ? HOME.shelfFit : s === 'all' ? HOME.allTab : MOODS[s].label;

type Spin = { phase: 'idle' } | { phase: 'spin' | 'done'; shown: GameId };

export function HomePage() {
  const n = connected.value.length;
  const rows = homeRows(n, recent.value).filter((r) => r.games.length > 0);
  const shelves: HomeSection[] = [...rows.map((r) => r.id), 'all'];
  const [shelfState, setShelf] = useState<HomeSection>(lastShelf);
  const shelf = shelves.includes(shelfState) ? shelfState : 'fit';
  lastShelf = shelf;
  const games = shelfGames(shelf, rows);
  const gridRows = chunk(games, GRID_COLS);
  const invitingNow = inviting.value;
  const fid = focused.value;
  const jump = homeJump.value;

  const nav: NavRow[] = [
    { key: 'top', ids: ['invite', ...TOP_BAR_IDS] },
    { key: 'quick', ids: [PARTY_ID, RANDOM_ID] },
    { key: 'shelves', ids: shelves.map(shelfId) },
    ...gridRows.map((c, i) => ({ key: `grid${i}`, ids: c.map((g) => cardFocusId(g, shelf)) })),
  ];
  const navKey = nav.map((r) => r.ids.join(',')).join('|');
  const navRef = useRef(nav);
  navRef.current = nav;
  const shelvesRef = useRef(shelves);
  shelvesRef.current = shelves;
  const shelfRef = useRef(shelf);
  shelfRef.current = shelf;
  /** Column each row was left on, so coming back lands where you were. */
  const memory = useRef<Record<string, number>>({});

  // The party lineup is shown up top before it starts; a new one when the room changes.
  const [lineup, setLineup] = useState<GameId[]>(() => partyLineup());
  useEffect(() => setLineup(partyLineup()), [n]);
  const lineupRef = useRef(lineup);
  lineupRef.current = lineup;

  /* ------------------------------------------------------------ Acak */
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
  const jumpTo = (section: HomeSection) => {
    const target = shelvesRef.current.includes(section) ? section : 'all';
    setShelf(target);
    focus(shelfId(target));
  };

  useEffect(() => {
    // The invite panel owns the focus while open; this map comes back when it closes.
    if (invitingNow) return;
    const all = nav.flatMap((r) => r.ids);
    const current = focused.peek();
    // A card that left the grid (other shelf, a new game played) hands over to the shelf tab.
    const initial =
      current === 'close'
        ? 'invite'
        : all.includes(current)
          ? current
          : all.includes(lastFocus)
            ? lastFocus
            : cardGame(current) || cardGame(lastFocus)
              ? shelfId(shelfRef.current)
              : PARTY_ID;
    const dispose = setFocusMap(
      {
        rows: nav.map((r) => r.ids),
        onOk: (id) => {
          if (runTopBar(id)) return;
          if (id === 'invite') return setInviting(true);
          if (id === PARTY_ID) return startParty(lineupRef.current);
          if (id === RANDOM_ID) return spinRef.current();
          // OK on a shelf tab steps into its grid.
          if (shelfOf(id)) return press('down');
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
          // Up and down the grid: same column. Onto the tabs: the shelf in use.
          if (toKey.startsWith('grid') && fromKey.startsWith('grid')) return col;
          if (toKey === 'shelves') return shelvesRef.current.indexOf(shelfRef.current);
          return memory.current[toKey.startsWith('grid') ? 'grid' : toKey] ?? 0;
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

  // A group tapped in the Host's phone picker: show that shelf with its tab in focus.
  useEffect(() => {
    if (seenJump === jump || invitingNow) return;
    seenJump = jump;
    jumpTo(homeTab.peek());
  }, [jump]);

  /* ------------------------------------------------------------ follow the focus */
  const scroller = useRef<HTMLDivElement>(null);
  const [topRow, setTopRow] = useState(0);
  const [pinned, setPinned] = useState<GameId | null>(null);

  useEffect(() => {
    const at = nav.findIndex((r) => r.ids.includes(fid));
    if (at < 0) return;
    const row = nav[at]!;
    const col = row.ids.indexOf(fid);
    const isGrid = row.key.startsWith('grid');
    memory.current[isGrid ? 'grid' : row.key] = col;
    lastFocus = fid;
    const game = cardGame(fid);
    if (game) setPinned(game);
    // The grid follows the shelf tab in focus at once (no OK needed on a remote).
    if (row.key === 'shelves') {
      const next = shelvesRef.current[col]!;
      if (next !== shelfRef.current) {
        setShelf(next);
        memory.current.grid = 0;
      }
    }
    // A long shelf glides so the focused card row is in view. A mouse hover never slides it.
    if (isGrid && !focusFromPointer()) {
      const i = Number(row.key.slice(4));
      setTopRow((top) => (i < top ? i : i > top + ROWS_IN_VIEW - 1 ? i - ROWS_IN_VIEW + 1 : top));
    }
  }, [fid, navKey]);
  // Another shelf starts from its first row.
  useEffect(() => setTopRow(0), [shelf]);

  const top = Math.min(topRow, Math.max(0, gridRows.length - ROWS_IN_VIEW));
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const el = scroller.current?.querySelector<HTMLElement>(`[data-nav="grid${top}"]`);
    setOffset(el ? el.offsetTop : 0);
  }, [top, navKey]);

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
  const spinShown = fid === RANDOM_ID && spin.phase !== 'idle' ? spin.shown : null;
  const featured: GameId =
    fidGame ??
    spinShown ??
    (fid === PARTY_ID ? lineup[0] : null) ??
    pinned ??
    games[0] ??
    lineup[0] ??
    'bajaj';
  const hint =
    gridRows.length > ROWS_IN_VIEW
      ? HOME.hintRows(top + 1, top + ROWS_IN_VIEW, gridRows.length)
      : shelf === 'fit'
        ? HOME.hintFit(n)
        : HOME.hintCount(games.length);

  return (
    <div class="page home">
      <div class="hero-art" key={featured}>
        <KeyArt id={featured} width={1100} logo={false} />
      </div>
      <div class="scrim-left" />
      <div class="scrim-bottom" />
      <TopBar />

      <div class="home-body">
        <section class="home-hero">
          {fid === PARTY_ID ? (
            <HeroText
              eyebrow={HOME.partyEyebrow}
              title={HOME.partyTitle(lineup.length)}
              line={lineup.map((id) => GAMES[id].title).join(' · ')}
              sub={HOME.partyText}
            />
          ) : fid === RANDOM_ID ? (
            <HeroText
              eyebrow={
                spin.phase === 'idle'
                  ? HOME.randomEyebrow
                  : spin.phase === 'done'
                    ? HOME.randomPicked
                    : HOME.randomSpinning
              }
              title={spinShown ? GAMES[spinShown].title : HOME.randomTitle}
              line={spinShown ? GAMES[spinShown].tagline : HOME.randomText}
            />
          ) : (
            <GameHero id={featured} n={n} />
          )}
          <div class="home-quick">
            <FocusButton id={PARTY_ID} class="quick quick-party">
              <Icon name="play" size={16} color="#111214" />
              {HOME.partyButton}
              <span class="quick-count">{lineup.length}</span>
            </FocusButton>
            <FocusButton id={RANDOM_ID} class={`quick quick-random is-${spin.phase}`}>
              <Die />
              {spin.phase === 'spin' ? HOME.randomSpinning : HOME.randomButton}
            </FocusButton>
          </div>
        </section>

        <nav class="home-shelf" aria-label={HOME.shelvesLabel}>
          {shelves.map((s) => (
            <FocusButton key={s} id={shelfId(s)} class={`home-shelf-tab ${shelf === s ? 'on' : ''}`}>
              {s !== 'fit' && s !== 'all' && <Icon name={MOODS[s].icon} size={16} stroke={2.6} />}
              <span class="home-shelf-label">{shelfLabel(s)}</span>
              <span class="home-shelf-count">{shelfGames(s, rows).length}</span>
            </FocusButton>
          ))}
          <span class="home-shelf-hint">{hint}</span>
        </nav>

        <div class="home-grid-viewport" onWheel={onWheel}>
          <div class="home-scroll" ref={scroller} style={{ transform: `translateY(${-offset}px)` }}>
            {games.length === 0 && <div class="cards-empty">{HOME.empty}</div>}
            {gridRows.map((c, i) => (
              <div
                class={`home-grid-row ${i < top || i >= top + ROWS_IN_VIEW ? 'off' : ''}`}
                data-nav={`grid${i}`}
                key={`${shelf}-${i}`}
              >
                {c.map((id) => (
                  <GameCard key={id} id={id} shelf={shelf} n={n} on={fid === cardFocusId(id, shelf)} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      {invitingNow && <InvitePanel />}
    </div>
  );
}

/* ------------------------------------------------------------------ parts */

function HeroText({
  eyebrow,
  title,
  line,
  sub,
}: {
  eyebrow: string;
  title: string;
  line: string;
  sub?: string;
}) {
  return (
    <div class="home-hero-copy" key={title}>
      <span class="home-hero-eyebrow">{eyebrow}</span>
      <h1 class="home-hero-title display">{title}</h1>
      <p class="home-hero-line">{line}</p>
      {sub && <p class="home-hero-sub">{sub}</p>}
    </div>
  );
}

/** The focused game: mood, players, tag, big name and its one-line pitch. */
function GameHero({ id, n }: { id: GameId; n: number }) {
  const g = GAMES[id];
  const tag = cardTag(id);
  const fits = n === 0 || (n >= g.minPlayers && n <= g.maxPlayers);
  return (
    <div class="home-hero-copy" key={id}>
      <span class="home-hero-chips">
        <span class={`mood-pill mood-${g.mood}`}>{MOODS[g.mood].label}</span>
        <span class={`home-hero-players ${fits ? '' : 'short'}`}>
          {fits ? HOME.players(g.minPlayers, g.maxPlayers) : HOME.needs(g.minPlayers)}
        </span>
        {tag && <span class={`tag card-badge-${tag.toLowerCase()}`}>{tag}</span>}
      </span>
      <h1 class="home-hero-title display">{g.title}</h1>
      <p class="home-hero-line">{g.tagline}</p>
    </div>
  );
}

function GameCard({ id, shelf, n, on }: { id: GameId; shelf: HomeSection; n: number; on: boolean }) {
  const info = GAMES[id];
  const tag = cardTag(id);
  const fits = n === 0 || (n >= info.minPlayers && n <= info.maxPlayers);
  return (
    <FocusButton
      id={cardFocusId(id, shelf)}
      class={`card ${info.available ? '' : 'soon'} ${fits ? '' : 'short'} ${on ? 'on' : ''}`}
    >
      <div class="card-art">
        {tag && <span class={`tag card-badge card-badge-${tag.toLowerCase()}`}>{tag}</span>}
        <KeyArt id={id} width={CARD_W} radius={12} />
      </div>
      <span class="card-title">{info.title}</span>
    </FocusButton>
  );
}

function Die() {
  return (
    <svg class="quick-die" viewBox="0 0 80 80" aria-hidden="true">
      <rect x="6" y="6" width="68" height="68" rx="16" fill="#fff" stroke="#111214" stroke-width="6" />
      <circle cx="24" cy="24" r="7" fill="#111214" />
      <circle cx="56" cy="24" r="7" fill="#111214" />
      <circle cx="40" cy="40" r="7" fill="#FF5A1F" />
      <circle cx="24" cy="56" r="7" fill="#111214" />
      <circle cx="56" cy="56" r="7" fill="#111214" />
    </svg>
  );
}
