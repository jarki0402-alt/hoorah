/**
 * Game showcase: two rows of key-art cards that drift in opposite directions as the section
 * scrolls by, filtered by mood. A focused card pulls its row so the card sits mid-screen (remote
 * and keyboard users can reach every card); hover or focus lifts a card and shows its tagline.
 */
import type { RefObject } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { isFreeListed } from '../shared/freeTier';
import { GAMES, type GameId, MOODS } from '../shared/games';
import { Icon } from '../shared/ui';
import { artUrl } from './artLoader';
import {
  driftOffset,
  filterGames,
  MOOD_FILTERS,
  type MoodFilter,
  pinOffset,
  playableCatalog,
  sectionProgress,
  splitRows,
} from './logic';
import { onScrollFrame, reducedMotion, requestFrame, useInView, useLiveSection, useReveal } from './motion';
import { STR } from './strings';

function GameCard({ id, art }: { id: GameId; art: boolean }) {
  const g = GAMES[id];
  const url = art ? artUrl.value : null;
  const [open, setOpen] = useState(false);
  return (
    <li class="lp-card-li">
      <button type="button" class={`lp-card${open ? ' is-open' : ''}`} onClick={() => setOpen(!open)}>
        <span class="lp-card-art" style={{ background: g.logoColor }}>
          {url ? (
            <img
              src={url(id)}
              width={320}
              height={180}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
            />
          ) : (
            <span class="lp-card-ph display">{g.title}</span>
          )}
          {isFreeListed(id) && <span class="lp-chip lp-chip-free">{STR.free}</span>}
          <span class="lp-card-info">
            <span class="lp-card-tagline">{g.tagline}</span>
            <span class="lp-card-meta">
              <span class={`lp-mood lp-mood-${g.mood}`}>{MOODS[g.mood].label}</span>
              <span class="lp-card-players">
                <Icon name="users" size={14} />
                {STR.players(g.minPlayers, g.maxPlayers)}
              </span>
            </span>
          </span>
        </span>
        <span class="lp-card-title">{g.title}</span>
      </button>
    </li>
  );
}

/** One drifting row. `reverse` runs it the other way. */
function Row({
  ids,
  section,
  reverse,
  art,
}: {
  ids: readonly GameId[];
  section: RefObject<HTMLElement>;
  reverse: boolean;
  art: boolean;
}) {
  const view = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLUListElement>(null);
  const pinned = useRef<number | null>(null);
  const key = ids.join(',');

  useEffect(() => {
    const v = view.current;
    const t = track.current;
    const s = section.current;
    if (!v || !t || !s) return;
    pinned.current = null;
    let lastX = 0;
    const stop = onScrollFrame(({ h }) => {
      if (pinned.current !== null) return undefined;
      const r = s.getBoundingClientRect();
      if (r.bottom < -h * 0.25 || r.top > h * 1.25) return undefined;
      const x = Math.round(
        driftOffset(sectionProgress(r.top, r.height, h), t.offsetWidth, v.clientWidth, reverse),
      );
      return () => {
        lastX = x;
        t.style.transform = `translate3d(${x}px, 0, 0)`;
      };
    });
    // A focused card stops its row; one partly off screen pulls the row so it sits mid-screen.
    const onFocusIn = (e: FocusEvent) => {
      const card = (e.target as HTMLElement | null)?.closest<HTMLElement>('.lp-card-li');
      if (!card) return;
      const c = card.getBoundingClientRect();
      const inside = c.left >= 8 && c.right <= window.innerWidth - 8;
      const x = inside
        ? lastX
        : Math.round(pinOffset(card.offsetLeft, card.offsetWidth, t.offsetWidth, v.clientWidth));
      pinned.current = x;
      lastX = x;
      t.classList.add('is-gliding');
      t.style.transform = `translate3d(${x}px, 0, 0)`;
    };
    let settle = 0;
    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget;
      if (next instanceof Node && t.contains(next)) return;
      pinned.current = null;
      requestFrame();
      // Glide back to the scroll position, then follow the scroll frame by frame again.
      window.clearTimeout(settle);
      settle = window.setTimeout(() => {
        if (pinned.current === null) t.classList.remove('is-gliding');
      }, 400);
    };
    t.addEventListener('focusin', onFocusIn);
    t.addEventListener('focusout', onFocusOut);
    return () => {
      stop();
      window.clearTimeout(settle);
      t.removeEventListener('focusin', onFocusIn);
      t.removeEventListener('focusout', onFocusOut);
    };
  }, [key, reverse, section]);

  return (
    <div
      ref={view}
      class="lp-row"
      // A focused card must not scroll the clipped row natively; the transform moves it instead.
      onScroll={(e) => {
        e.currentTarget.scrollLeft = 0;
      }}
    >
      <ul ref={track} class="lp-row-track">
        {ids.map((id) => (
          <GameCard key={id} id={id} art={art} />
        ))}
      </ul>
    </div>
  );
}

export function Showcase() {
  const all = useMemo(playableCatalog, []);
  const [mood, setMood] = useState<MoodFilter>('all');
  const games = filterGames(all, mood);
  const [rowA, rowB] = splitRows(games);
  const sec = useRef<HTMLElement>(null);
  const head = useRef<HTMLDivElement>(null);
  // Key art is generated only when the section comes near (it is the heaviest work on the page).
  const near = useInView(sec, '700px 0px', true);
  const still = reducedMotion.value;
  useLiveSection(sec);
  useReveal(head);
  return (
    <section ref={sec} id="game" class="lp-sec lp-games" aria-labelledby="lp-games-title">
      <div class="lp-wrap">
        <div ref={head} class="lp-head rv">
          <h2 id="lp-games-title" class="lp-title display">
            {STR.gamesTitle(all.length)}
          </h2>
          <p class="lp-sub">{STR.gamesSub}</p>
          <fieldset class="lp-filterset">
            <legend class="sr-only">{STR.moodGroup}</legend>
            <div class="lp-filters">
              {MOOD_FILTERS.map((m) => (
                <button
                  key={m}
                  type="button"
                  class={`lp-filter${m === mood ? ' is-on' : ''}`}
                  aria-pressed={m === mood}
                  onClick={() => setMood(m)}
                >
                  {m !== 'all' && <Icon name={MOODS[m].icon} size={18} />}
                  {m === 'all' ? STR.moodAll : MOODS[m].label}
                </button>
              ))}
            </div>
          </fieldset>
          <p class="sr-only" aria-live="polite">
            {STR.shown(games.length)}
          </p>
        </div>
      </div>
      {still ? (
        <div class="lp-wrap">
          <ul class="lp-grid">
            {games.map((id) => (
              <GameCard key={id} id={id} art={near} />
            ))}
          </ul>
        </div>
      ) : (
        <div class="lp-rows">
          <Row ids={rowA} section={sec} reverse={false} art={near} />
          {rowB.length > 0 && <Row ids={rowB} section={sec} reverse art={near} />}
        </div>
      )}
    </section>
  );
}
