/**
 * Home of the main screen, one calm screen instead of a long scroll (owner 2026-11-22): the focused
 * item up top (big art, name, one line), one row of shelf tabs (the same groups as the Host's phone
 * picker) and one grid of cards, two rows of five in view. Every shelf opens with the two special
 * cards, Mode Pesta and Acak (owner 2026-11-23), and home opens on Mode Pesta with its big poster.
 * Down/up moves top bar → shelves → grid; a shelf follows the tab in focus at once, and a long
 * shelf glides one card row at a time.
 */
import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { GAMES, type GameId, gamesForTab, MOODS, playsRemote } from '../../shared/games';
import { allGames, cardTag, type HomeRow, type HomeSection, homeRows } from '../../shared/homeRows';
import { KeyArt } from '../../shared/keyart';
import { Icon } from '../../shared/ui';
import { AccessTag, FocusButton, InvitePanel, TopBar } from '../components';
import { cardFocusId, cardGame, PARTY_ID, RANDOM_ID, shelfId, shelfOf } from '../homeFocus';
import { focus, focused, focusFromPointer, press, setFocusMap } from '../nav';
import { PARTY_GAMES, partyPool } from '../party';
import { REMOTE_ID, RemoteButton, RemoteChip, RemotePanel } from '../remote';
import { PartyCardArt, PartyHeroArt, RandomCardArt, RandomHeroArt } from '../specialArt';
import {
  connected,
  goJoin,
  homeJump,
  homeTab,
  homeView,
  inviting,
  isMirror,
  offer,
  openDetail,
  openRemotePanel,
  recent,
  remoteOn,
  remotePanel,
  runTopBar,
  setInviting,
  sfx,
  startParty,
  TOP_BAR_IDS,
  wheelView,
} from '../store';
import { HOME, REMOTE } from '../strings';
import { OfferLayer } from './OfferOverlay';
import { WheelOverlay } from './WheelOverlay';
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

/** The two special cards that open every shelf. */
const SPECIALS = [PARTY_ID, RANDOM_ID] as const;
type Special = (typeof SPECIALS)[number];

/** Games on a shelf: a home row, or every game ordered for this screen ("Semua"). */
function shelfGames(
  shelf: HomeSection,
  rows: readonly HomeRow[],
  n: number,
  played: readonly string[],
): GameId[] {
  if (shelf === 'all') return allGames(n, played, true);
  return rows.find((r) => r.id === shelf)?.games ?? [];
}

/** Grid rows of focus ids: the special cards first, then the shelf's games, five to a row. */
function gridOf(games: readonly GameId[], shelf: HomeSection): string[][] {
  return chunk([...SPECIALS, ...games.map((g) => cardFocusId(g, shelf))], GRID_COLS);
}

/** Random picks for the special cards' art (a fresh look each time home opens). */
function sample(list: readonly GameId[], count: number): GameId[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a.slice(0, count);
}

const shelfLabel = (s: HomeSection): string =>
  s === 'fit' ? HOME.shelfFit : s === 'all' ? HOME.allTab : MOODS[s].label;

export function HomePage() {
  const n = connected.value.length;
  const played = recent.value;
  const rows = homeRows(n, played).filter((r) => r.games.length > 0);
  const shelves: HomeSection[] = ['all', ...rows.map((r) => r.id)];
  // A far-away main screen shows the Host's home as it is: shelf, card row, hero, art, wheel.
  const far = isMirror ? homeView.value : null;
  const [shelfState, setShelf] = useState<HomeSection>(lastShelf);
  const shelfWanted = far ? far.shelf : shelfState;
  const shelf = shelves.includes(shelfWanted) ? shelfWanted : 'all';
  lastShelf = shelf;
  const games = shelfGames(shelf, rows, n, played);
  const gridRows = gridOf(games, shelf);
  const invitingNow = inviting.value;
  const remoteOpen = remotePanel.value;
  const remote = remoteOn.value;
  const [wheelState, setWheelOpen] = useState(false);
  const wheelOpen = isMirror ? wheelView.value !== null : wheelState;
  // The Hoorah Pass offer owns the focus while open (Mode Pesta or a locked pick from the wheel).
  const offerOpen = offer.value !== null;
  const fid = focused.value;
  const jump = homeJump.value;

  const nav: NavRow[] = [
    { key: 'top', ids: isMirror ? [...TOP_BAR_IDS] : [REMOTE_ID, 'invite', ...TOP_BAR_IDS] },
    { key: 'shelves', ids: shelves.map(shelfId) },
    ...gridRows.map((ids, i) => ({ key: `grid${i}`, ids })),
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

  // Art of the special cards: party games for the poster, fitting games for the wheel.
  const [ownArt] = useState(() => ({
    party: sample(partyPool(Math.max(1, n), remote), 3),
    wheel: sample(
      gamesForTab('fit', Math.max(1, n)).filter((id) => !remote || playsRemote(id)),
      8,
    ),
  }));
  const art = far ? far.art : ownArt;

  /* ------------------------------------------------------------ focus map */
  const jumpTo = (section: HomeSection) => {
    const target = shelvesRef.current.includes(section) ? section : 'all';
    setShelf(target);
    focus(shelfId(target));
  };

  // The offer replaces the wheel (a pick this room cannot start).
  useEffect(() => {
    if (offerOpen) setWheelOpen(false);
  }, [offerOpen]);

  useEffect(() => {
    // The invite and long-distance panels, the wheel and the offer own the focus while open; this
    // map comes back after.
    if (invitingNow || wheelOpen || offerOpen || remoteOpen) return;
    const all = nav.flatMap((r) => r.ids);
    const current = focused.peek();
    // A card that left the grid (other shelf, a new game played) hands over to the shelf tab.
    const initial =
      current === 'close'
        ? 'invite'
        : current.startsWith('remote-')
          ? REMOTE_ID
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
          if (id === REMOTE_ID) return openRemotePanel();
          if (id === PARTY_ID) return startParty();
          if (id === RANDOM_ID) {
            sfx('select');
            return setWheelOpen(true);
          }
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
  }, [navKey, invitingNow, wheelOpen, offerOpen, remoteOpen]);

  // A group tapped in the Host's phone picker: show that shelf with its tab in focus.
  useEffect(() => {
    if (seenJump === jump || invitingNow || wheelOpen || offerOpen || remoteOpen) return;
    seenJump = jump;
    jumpTo(homeTab.peek());
  }, [jump]);

  /* ------------------------------------------------------------ follow the focus */
  const scroller = useRef<HTMLDivElement>(null);
  const [topRow, setTopRow] = useState(0);
  // The item the hero shows while the focus is on the tabs or the top bar: the last card visited.
  const [pinned, setPinned] = useState<GameId | Special>(PARTY_ID);

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
    else if (fid === PARTY_ID || fid === RANDOM_ID) setPinned(fid);
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

  const top = Math.min(far ? far.top : topRow, Math.max(0, gridRows.length - ROWS_IN_VIEW));
  const pinnedNow = far ? far.pinned : pinned;

  // Far-away main screens draw this home as it is (the store sends it on every change).
  useEffect(() => {
    if (isMirror) return;
    homeView.value = { shelf, top, pinned, art: ownArt };
  }, [shelf, top, pinned]);
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    // Measured from the first row, so the top padding (room for the focus ring) is never scrolled away.
    const first = scroller.current?.querySelector<HTMLElement>('[data-nav="grid0"]');
    const el = scroller.current?.querySelector<HTMLElement>(`[data-nav="grid${top}"]`);
    setOffset(el && first ? el.offsetTop - first.offsetTop : 0);
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
  const shown: GameId | Special =
    fidGame ?? (fid === PARTY_ID || fid === RANDOM_ID ? fid : null) ?? pinnedNow;
  const hint =
    gridRows.length > ROWS_IN_VIEW
      ? HOME.hintRows(top + 1, top + ROWS_IN_VIEW, gridRows.length)
      : shelf === 'fit'
        ? HOME.hintFit(n)
        : HOME.hintCount(games.length);
  const partyCount = Math.min(PARTY_GAMES, partyPool(Math.max(1, n), remote).length);
  // The hero's button does what OK on the shown card does (for a mouse or a touch screen).
  const heroGo = () => {
    if (shown === PARTY_ID) return startParty();
    if (shown === RANDOM_ID) {
      sfx('select');
      return setWheelOpen(true);
    }
    openDetail(shown);
  };

  return (
    <div class="page home">
      {shown === PARTY_ID ? (
        <PartyHeroArt games={art.party} />
      ) : shown === RANDOM_ID ? (
        <RandomHeroArt games={art.wheel} />
      ) : (
        <div class="hero-art" key={shown}>
          <KeyArt id={shown} width={1100} logo={false} />
        </div>
      )}
      <div class="scrim-left" />
      <div class="scrim-bottom" />
      <TopBar extra={<RemoteChip />}>
        <RemoteButton />
      </TopBar>

      <div class="home-body">
        <section class="home-hero">
          {shown === PARTY_ID ? (
            <HeroText
              eyebrow={HOME.partyEyebrow(partyCount)}
              title={HOME.partyTitle}
              line={HOME.partyText(partyCount)}
              sub={HOME.partySub}
            />
          ) : shown === RANDOM_ID ? (
            <HeroText eyebrow={HOME.randomEyebrow} title={HOME.randomTitle} line={HOME.randomText} />
          ) : (
            <GameHero id={shown} n={n} />
          )}
          <button
            type="button"
            tabIndex={-1}
            class={`hero-go ${shown === RANDOM_ID ? 'is-yellow' : ''}`}
            onClick={heroGo}
          >
            <Icon name="play" size={16} color="#111214" />
            {shown === PARTY_ID ? HOME.partyGo : shown === RANDOM_ID ? HOME.randomGo : HOME.openGo}
          </button>
        </section>

        <nav class="home-shelf" aria-label={HOME.shelvesLabel}>
          {shelves.map((s) => (
            <FocusButton key={s} id={shelfId(s)} class={`home-shelf-tab ${shelf === s ? 'on' : ''}`}>
              {s !== 'fit' && s !== 'all' && <Icon name={MOODS[s].icon} size={16} stroke={2.6} />}
              <span class="home-shelf-label">{shelfLabel(s)}</span>
              <span class="home-shelf-count">{shelfGames(s, rows, n, played).length}</span>
            </FocusButton>
          ))}
          <span class="home-shelf-hint">{hint}</span>
        </nav>

        <div class="home-grid-viewport" onWheel={onWheel}>
          <div class="home-scroll" ref={scroller} style={{ transform: `translateY(${-offset}px)` }}>
            {gridRows.map((ids, i) => (
              <div
                class={`home-grid-row ${i < top || i >= top + ROWS_IN_VIEW ? 'off' : ''}`}
                data-nav={`grid${i}`}
                key={`${shelf}-${i}`}
              >
                {ids.map((id) => {
                  const g = cardGame(id);
                  if (g)
                    return <GameCard key={id} id={g} shelf={shelf} n={n} on={fid === id} remote={remote} />;
                  return id === PARTY_ID ? (
                    <SpecialCard key={id} id={PARTY_ID} title={HOME.partyCard}>
                      <AccessTag game="party" />
                      <PartyCardArt width={CARD_W} />
                    </SpecialCard>
                  ) : (
                    <SpecialCard key={id} id={RANDOM_ID} title={HOME.randomCard}>
                      <RandomCardArt width={CARD_W} games={art.wheel} />
                    </SpecialCard>
                  );
                })}
              </div>
            ))}
            {games.length === 0 && <div class="cards-empty">{HOME.empty}</div>}
          </div>
        </div>
      </div>
      {invitingNow && <InvitePanel />}
      {remoteOpen && <RemotePanel />}
      {wheelOpen && <WheelOverlay players={n} onClose={() => setWheelOpen(false)} />}
      <OfferLayer />
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

/** The focused game: mood, players, tag, controls and phone grip, big name and two lines about it. */
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
        <AccessTag game={id} />
        <span class="home-hero-fact">
          <Icon name="tap" size={14} stroke={2.4} />
          {g.control}
        </span>
        <span class="home-hero-fact">
          <Icon name="rotate" size={14} stroke={2.4} />
          {HOME.phoneHold(g.orientation)}
        </span>
      </span>
      <h1 class="home-hero-title display">{g.title}</h1>
      {/* The full description (two lines), not only the one-liner: owner 2026-11-23. */}
      <p class="home-hero-desc">{g.description}</p>
    </div>
  );
}

function GameCard({
  id,
  shelf,
  n,
  on,
  remote,
}: {
  id: GameId;
  shelf: HomeSection;
  n: number;
  on: boolean;
  /** A far-away main screen watches: games it cannot show yet say so. */
  remote: boolean;
}) {
  const info = GAMES[id];
  const tag = cardTag(id);
  const fits = n === 0 || (n >= info.minPlayers && n <= info.maxPlayers);
  const farOff = remote && !playsRemote(id);
  return (
    <FocusButton
      id={cardFocusId(id, shelf)}
      class={`card ${info.available ? '' : 'soon'} ${fits && !farOff ? '' : 'short'} ${on ? 'on' : ''}`}
    >
      <div class="card-art">
        {tag && <span class={`tag card-badge card-badge-${tag.toLowerCase()}`}>{tag}</span>}
        <AccessTag game={id} />
        {farOff && <span class="tag remote-tag">{REMOTE.tag}</span>}
        <KeyArt id={id} width={CARD_W} radius={12} />
      </div>
      <span class="card-title">{info.title}</span>
    </FocusButton>
  );
}

/** Mode Pesta or Acak in the grid: its own art, the same size and focus ring as a game card. */
function SpecialCard({ id, title, children }: { id: Special; title: string; children: ComponentChildren }) {
  return (
    <FocusButton id={id} class={`card special-card ${focused.value === id ? 'on' : ''}`}>
      <div class="card-art">{children}</div>
      <span class="card-title">{title}</span>
    </FocusButton>
  );
}
