/**
 * Fullscreen and orientation for the phone (owner decision 2026-11-14).
 *
 *  - Android/Chrome: the "Masuk" tap also enters fullscreen (browsers only allow it from a tap).
 *    If fullscreen is lost later (app switch, Back, reload) a prompt offers it again.
 *  - Every game locks the phone to its orientation while it runs: "Mendatar" games to landscape,
 *    "Tegak" games to portrait (so a portrait game after a landscape one turns back upright).
 *    Locking only works in fullscreen, so it follows the fullscreen state; leaving the game
 *    unlocks again.
 *  - Where the lock is unavailable (iPhone Safari, Android without fullscreen) a "Putar HP-mu"
 *    screen asks the player to turn the phone instead, and disappears once it is held right.
 *  - The Host remote and every other screen simply follow how the phone is held.
 */
import { computed, effect, signal } from '@preact/signals';
import { session } from '../shared/device';
import { GAMES, type GameId } from '../shared/games';
import { platform, stage } from './store';

type FsDocument = Document & { webkitFullscreenElement?: Element | null; webkitFullscreenEnabled?: boolean };
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
export type Orientation = 'landscape' | 'portrait';
/** `lock` is missing from TypeScript's DOM types (support differs per browser). */
type LockableOrientation = ScreenOrientation & { lock?: (o: Orientation) => Promise<void> };

const doc = document as FsDocument;
const root = document.documentElement as FsElement;
/** The simulator shows phones as fixed portrait frames that cannot rotate. */
const inSimulator = new URLSearchParams(location.search).has('sim');

/** Element fullscreen exists here (Android Chrome and most Android browsers; not iPhone Safari). */
export const canFullscreen =
  !inSimulator &&
  Boolean(document.fullscreenEnabled || doc.webkitFullscreenEnabled) &&
  typeof (root.requestFullscreen ?? root.webkitRequestFullscreen) === 'function';

const fsElement = (): Element | null => document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;

export const isFullscreen = signal(fsElement() !== null);
/** Fullscreen was used in this tab, so losing it brings the prompt back. */
const wanted = signal(session.get<boolean>('fullscreen') === true);
/**
 * "Nanti saja" on the prompt: quiet for the rest of this tab (landscape games still offer
 * fullscreen on their rotate screen).
 */
const later = signal(false);

const portraitQuery = window.matchMedia('(orientation: portrait)');
export const portrait = signal(portraitQuery.matches);

/** "Tetap tegak" / "Tetap mendatar" on the rotate screen, remembered for the current game only. */
const keepAsHeldFor = signal<string | null>(null);

/** How the game on the main screen is played, or null outside a game (follow the hand). */
export const gameOrientation = computed<Orientation | null>(() => {
  const p = platform.value;
  if (stage.value !== 'room' || p.page !== 'game' || !p.gameId) return null;
  // "Cara main" on the main screen: the phone only shows Paham!, held any way (no rotate prompt).
  if (p.tutorial) return null;
  const game = GAMES[p.gameId as GameId];
  if (!game) return null;
  return game.orientation === 'Mendatar' ? 'landscape' : 'portrait';
});

/** The way the player should turn the phone, or null when it is already held right. */
export const rotateTo = computed<Orientation | null>(() => {
  const want = gameOrientation.value;
  if (inSimulator || want === null || keepAsHeldFor.value === platform.value.gameId) return null;
  return portrait.value === (want === 'portrait') ? null : want;
});

export const showRotate = computed(() => rotateTo.value !== null);

export const showFullscreenPrompt = computed(
  () =>
    canFullscreen &&
    stage.value === 'room' &&
    wanted.value &&
    !isFullscreen.value &&
    !later.value &&
    // The rotate screen carries its own fullscreen button.
    !showRotate.value,
);

/** Call straight from a tap handler (browsers refuse fullscreen otherwise). */
export function enterFullscreen(): void {
  if (!canFullscreen || fsElement()) return;
  wanted.value = true;
  later.value = false;
  session.set('fullscreen', true);
  try {
    const r = root.requestFullscreen
      ? root.requestFullscreen({ navigationUI: 'hide' })
      : root.webkitRequestFullscreen?.();
    void Promise.resolve(r)
      .then(applyOrientation)
      .catch(() => {});
  } catch {
    // Refused (no gesture, policy): the prompt stays available.
  }
}

export function fullscreenLater(): void {
  later.value = true;
}

/** Play this game the way the phone is held now; the rotate screen stays away until the next game. */
export function keepAsHeld(): void {
  keepAsHeldFor.value = platform.value.gameId ?? null;
}

/**
 * The orientation last requested from the browser. Set when asking (not when the promise
 * settles) so a game that ends before the lock resolves still gets unlocked.
 */
let lockedTo: Orientation | null = null;

function applyOrientation(): void {
  const o = screen.orientation as LockableOrientation | undefined;
  if (!o) return;
  const want = fsElement() ? gameOrientation.value : null;
  if (want === lockedTo) return;
  if (want !== null && typeof o.lock === 'function') {
    lockedTo = want;
    o.lock(want).catch(() => {
      // Refused (no fullscreen, unsupported): the rotate screen asks the player instead,
      // and the next fullscreen change tries again.
      if (lockedTo === want) lockedTo = null;
    });
    return;
  }
  if (lockedTo === null) return;
  lockedTo = null;
  try {
    o.unlock();
  } catch {
    // Already unlocked (leaving fullscreen releases the lock by itself).
  }
}

export function startScreenMode(): void {
  const onFs = () => {
    isFullscreen.value = fsElement() !== null;
    applyOrientation();
  };
  document.addEventListener('fullscreenchange', onFs);
  document.addEventListener('webkitfullscreenchange', onFs);
  const onOrient = () => {
    portrait.value = portraitQuery.matches;
  };
  if (portraitQuery.addEventListener) portraitQuery.addEventListener('change', onOrient);
  else portraitQuery.addListener(onOrient);
  window.addEventListener('resize', onOrient);
  // Lock to the game's orientation when it starts or changes, unlock when it ends.
  effect(() => {
    void gameOrientation.value;
    applyOrientation();
  });
}
