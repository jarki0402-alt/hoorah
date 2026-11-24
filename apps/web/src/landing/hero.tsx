/**
 * The hero: headline, the start button and the code entry. A phone sees the code entry first
 * (and screens on its Wi-Fi), a big screen sees "Mulai main sekarang" first with the code entry
 * behind "Gabung pakai kode". On the right, a screen cycling key art with three phones around it.
 */
import { formatRoomCode, type NearbyRoom, PLAYER_COLORS } from '@hoorah/protocol';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { PersonId } from '../shared/art/people';
import { GAMES } from '../shared/games';
import { PersonBadge } from '../shared/person';
import { Avatar, Icon, LogoMark } from '../shared/ui';
import { screenUsed } from '../shared/visit';
import { artUrl } from './artLoader';
import { FloatPerson } from './cast';
import { formatCodeInput, HERO_GAMES, joinPath, nextIndex, parseNearby } from './logic';
import { reducedMotion, useInView } from './motion';
import { STR } from './strings';

/** Where "Mulai main" goes: this device becomes the main screen. */
export const START_PATH = '/main';
/** The same from a phone, which would open as a controller at `/main` without the flag. */
export const PHONE_SCREEN_PATH = '/main?tv=1';
/** The id of the code field, so other buttons can bring it into view and focus it. */
export const CODE_INPUT_ID = 'lp-code';

/** Brings the code field into view and puts the cursor in it. */
export function focusCodeInput(): void {
  const input = document.getElementById(CODE_INPUT_ID);
  if (!(input instanceof HTMLInputElement)) return;
  input.focus({ preventScroll: true });
  input.scrollIntoView({ block: 'center', behavior: reducedMotion.value ? 'auto' : 'smooth' });
}

/* ------------------------------------------------------------------ code entry */

function CodeForm({ autoFocus = false, onEscape }: { autoFocus?: boolean; onEscape?: () => void }) {
  const [value, setValue] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const path = joinPath(value);
  useEffect(() => {
    if (autoFocus) input.current?.focus({ preventScroll: true });
  }, [autoFocus]);
  return (
    <form
      class="lp-code-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (path) location.assign(path);
        else input.current?.focus();
      }}
    >
      <input
        ref={input}
        id={CODE_INPUT_ID}
        class="lp-code-input display"
        value={value}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoCorrect="off"
        autoCapitalize="off"
        spellcheck={false}
        enterKeyHint="go"
        placeholder={STR.codePlaceholder}
        aria-label={STR.codeLabel}
        aria-describedby="lp-code-hint"
        onKeyDown={(e) => {
          if (e.key === 'Escape' && onEscape) {
            e.preventDefault();
            onEscape();
          }
        }}
        onInput={(e) => {
          const v = formatCodeInput(e.currentTarget.value);
          e.currentTarget.value = v;
          setValue(v);
        }}
      />
      <button type="submit" class="lp-btn lp-btn-primary lp-code-go" disabled={!path}>
        {STR.codeJoin}
      </button>
      <p id="lp-code-hint" class="lp-code-hint">
        {STR.codeHint}
      </p>
    </form>
  );
}

/** How often a phone on the landing page asks for main screens on its Wi-Fi. */
const NEARBY_POLL_MS = 6000;

/** Main screens on the same Wi-Fi (same public address): one tap joins. Nothing when none. */
function NearbyScreens() {
  const [rooms, setRooms] = useState<NearbyRoom[]>([]);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch('/api/nearby', { cache: 'no-store' });
        if (!res.ok) return;
        const list = parseNearby((await res.json()) as unknown);
        if (alive) setRooms(list);
      } catch {
        // Offline or no server: the code field still works.
      }
    };
    void load();
    const t = window.setInterval(() => void load(), NEARBY_POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);
  if (rooms.length === 0) return null;
  return (
    <section class="lp-nearby" aria-label={STR.nearbyTitle}>
      <div class="lp-nearby-title">
        <Icon name="wifi" size={20} />
        {STR.nearbyTitle}
      </div>
      {rooms.map((r) => {
        const code = formatRoomCode(r.code);
        const path = joinPath(r.code);
        return (
          <div key={r.code} class="lp-nearby-room">
            <span class="lp-nearby-avatars" aria-hidden="true">
              {r.players.slice(0, 4).map((p, i) => (
                <Avatar key={`${p.name}-${i}`} look={p.look} fruit={p.fruit} ring={p.color} size={34} />
              ))}
              {r.players.length === 0 && <LogoMark size={34} />}
            </span>
            <span class="lp-nearby-text">
              <span class="lp-nearby-code">{STR.nearbyCode(code)}</span>
              <span class="lp-nearby-players">{STR.nearbyPlayers(r.players.length)}</span>
            </span>
            <button
              type="button"
              class="lp-btn lp-btn-primary lp-btn-sm"
              aria-label={STR.nearbyJoinLabel(code)}
              onClick={() => path && location.assign(path)}
            >
              {STR.nearbyJoin}
            </button>
          </div>
        );
      })}
      <div class="lp-nearby-or">{STR.nearbyOr}</div>
    </section>
  );
}

/** The phone's first card: screens on this Wi-Fi, then the six digit code. */
function PhoneJoin() {
  return (
    <div class="lp-join-card">
      <NearbyScreens />
      <h2 class="lp-join-title display">{STR.codeTitle}</h2>
      <p class="lp-join-sub">{STR.codeSub}</p>
      <CodeForm />
    </div>
  );
}

/** A big screen's code entry, opened by "Gabung pakai kode". */
function CodePanel({ onClose }: { onClose: () => void }) {
  const host = location.host || 'hoorah.gg';
  return (
    <div id="lp-code-panel" class="lp-code-panel">
      <div class="lp-code-panel-head">
        <span class="lp-code-panel-phone" aria-hidden="true">
          <Icon name="scan" size={26} />
        </span>
        <div>
          <h2 class="lp-code-panel-title">{STR.codePanelTitle}</h2>
          <p class="lp-code-panel-text">{STR.codePanelText(host)}</p>
        </div>
      </div>
      <CodeForm autoFocus onEscape={onClose} />
    </div>
  );
}

/* ------------------------------------------------------------------ hero art */

const HERO_PHONES: { person: PersonId; color: string; cls: string }[] = [
  { person: 'leo', color: PLAYER_COLORS[0], cls: 'p1' },
  { person: 'putri', color: PLAYER_COLORS[1], cls: 'p2' },
  { person: 'bayu', color: PLAYER_COLORS[2], cls: 'p3' },
];

/** Speech bubbles of each floating character, taken in turn from the shared list. */
const says = (from: number): string[] =>
  STR.heroReactions.map((_, i) => STR.heroReactions[(from + i) % STR.heroReactions.length] ?? '');

/** Cycles the hero screen's key art every few seconds while the hero is on screen. */
function useHeroCycle(active: boolean): { cur: number; prev: number | null } {
  const [state, setState] = useState<{ cur: number; prev: number | null }>({ cur: 0, prev: null });
  const url = artUrl.value;
  const reduced = reducedMotion.value;
  useEffect(() => {
    if (!active || reduced || !url) return;
    const t = window.setInterval(() => {
      if (document.hidden) return;
      setState((s) => ({ cur: nextIndex(s.cur, HERO_GAMES.length), prev: s.cur }));
    }, 3000);
    return () => window.clearInterval(t);
  }, [active, reduced, url]);
  // Warm the next poster so the crossfade never shows a half-loaded image.
  useEffect(() => {
    if (!url) return;
    const next = HERO_GAMES[nextIndex(state.cur, HERO_GAMES.length)];
    if (next) new Image().src = url(next);
  }, [state.cur, url]);
  return state;
}

function HeroArt() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const { cur, prev } = useHeroCycle(inView);
  const url = artUrl.value;
  const curId = HERO_GAMES[cur] ?? 'bajaj';
  const prevId = prev === null ? null : (HERO_GAMES[prev] ?? null);
  return (
    <div ref={ref} class="lp-hero-art" aria-hidden="true">
      <div class="lp-hero-box">
        <svg
          class="lp-signals"
          viewBox="0 0 1000 860"
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <path class="lp-signal" d="M110 560 C120 500 190 470 270 452" />
          <path class="lp-signal s2" d="M640 610 C640 560 620 520 600 470" />
          <path class="lp-signal s3" d="M905 530 C900 480 850 455 770 450" />
        </svg>
        <div class="lp-screen">
          <div class="lp-screen-glass">
            <div class="lp-screen-boot">
              <LogoMark size={64} />
            </div>
            {url && prevId && (
              <img
                key={`p-${prevId}`}
                class="lp-screen-img"
                src={url(prevId)}
                width={640}
                height={360}
                alt=""
                decoding="async"
                draggable={false}
              />
            )}
            {url && (
              <img
                key={`c-${curId}`}
                class="lp-screen-img is-cur"
                src={url(curId)}
                width={640}
                height={360}
                alt=""
                decoding="async"
                draggable={false}
              />
            )}
            {url && (
              <span key={`t-${curId}`} class="lp-screen-title">
                {GAMES[curId].title}
              </span>
            )}
          </div>
          <span class="lp-screen-stand" />
        </div>
        {HERO_PHONES.map((p) => (
          <div key={p.cls} class={`lp-hero-phone ${p.cls}`}>
            <div class="lp-phone-body">
              <div class="lp-phone-glass">
                <PersonBadge id={p.person} ring={p.color} class="lp-phone-avatar" />
                <span class="lp-phone-btn" />
              </div>
            </div>
          </div>
        ))}
        <FloatPerson id="lala" faces={['laugh', 'wow', 'win']} says={says(0)} cls="f1" speed={-0.08} />
        <FloatPerson
          id="kiki"
          faces={['wow', 'happy', 'love']}
          says={says(3)}
          cls="f2"
          speed={-0.14}
          delay={1}
        />
        <FloatPerson
          id="doni"
          faces={['laugh', 'grin', 'wink']}
          says={says(5)}
          cls="f3"
          speed={-0.05}
          delay={2}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ hero */

function Headline() {
  return (
    <>
      <h1 id="lp-hero-title" class="lp-hero-title display">
        {STR.heroTitleA}
        <span class="lp-hl">{STR.heroTitleEm}</span> <span class="lp-hl-2">{STR.heroTitleB}</span>
      </h1>
      <p class="lp-hero-sub">{STR.heroSub}</p>
    </>
  );
}

export function Hero({ phone }: { phone: boolean }) {
  const [panel, setPanel] = useState(false);
  // This device already ran the main screen: the main button picks up where it left off.
  const [returning] = useState(screenUsed);
  const toggle = useRef<HTMLButtonElement>(null);
  const close = () => {
    setPanel(false);
    toggle.current?.focus();
  };
  if (phone) {
    return (
      <section class="lp-hero is-phone" aria-labelledby="lp-hero-title">
        <div class="lp-wrap lp-hero-grid">
          <PhoneJoin />
          <div class="lp-hero-copy">
            <Headline />
          </div>
          <HeroArt />
          <div class="lp-hero-phone-alt">
            <a class="lp-btn lp-btn-ghost lp-btn-sm" href={PHONE_SCREEN_PATH}>
              <Icon name="tv" size={18} />
              {STR.phoneAsScreen}
            </a>
            <p class="lp-note">{STR.phoneAsScreenNote}</p>
          </div>
        </div>
      </section>
    );
  }
  return (
    <section class="lp-hero" aria-labelledby="lp-hero-title">
      <div class="lp-wrap lp-hero-grid">
        <div class="lp-hero-copy">
          <span class="lp-chip lp-chip-yellow">{STR.heroChip}</span>
          <Headline />
          <div class="lp-cta-row">
            <a id="lp-start" class="lp-btn lp-btn-primary lp-btn-lg" href={START_PATH}>
              <Icon name="play" size={22} />
              {returning ? STR.startAgain : STR.start}
            </a>
            <button
              ref={toggle}
              type="button"
              class="lp-btn lp-btn-ghost lp-btn-lg"
              aria-expanded={panel}
              aria-controls="lp-code-panel"
              onClick={() => setPanel(!panel)}
            >
              <Icon name="tap" size={22} />
              {STR.joinWithCode}
            </button>
          </div>
          {panel ? (
            <CodePanel onClose={close} />
          ) : (
            <p class="lp-note">{returning ? STR.startAgainNote : STR.startNote}</p>
          )}
        </div>
        <HeroArt />
      </div>
    </section>
  );
}
