/**
 * Haptics on every phone, as far as each browser allows.
 *
 * - Android (and any browser with the Vibration API): `navigator.vibrate`.
 * - iPhone (Safari has no Vibration API): toggling an `<input type="checkbox" switch>` makes iOS 18+
 *   play its own light system tick. A hidden switch is toggled through its label; one tick per
 *   "on" segment of a pattern, spaced at least `tickGap` apart. Safari only honours it inside a
 *   user gesture, so a tick asked for while a finger is down without a usable gesture is replayed
 *   on release (`releaseFallback`).
 * - Nothing to vibrate with: a small flash on the screen edge stands in.
 *
 * Never throws, never takes focus or scrolls, and stays out of the accessibility tree.
 */
import { CONTROL_TUNING } from './controls';

export type HapticMethod = 'vibrate' | 'switch' | 'none';

/** Most ticks one pattern turns into (a long pattern must not buzz on for seconds). */
const MAX_TICKS = 12;
/** A tick deferred to the release is dropped when the finger stays down longer than this (ms). */
const RELEASE_WINDOW_MS = 700;

let method: HapticMethod | null = null;
let sw: HTMLLabelElement | null = null;
let flashEl: HTMLDivElement | null = null;
let listening = false;
let fingersDown = 0;
let pendingAt = 0;
const timers = new Set<number>();

function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Which way this browser can buzz (decided once). */
export function hapticMethod(): HapticMethod {
  if (method) return method;
  try {
    if (typeof navigator.vibrate === 'function') method = 'vibrate';
    else if (isIos() && 'switch' in HTMLInputElement.prototype) method = 'switch';
    else method = 'none';
  } catch {
    method = 'none';
  }
  return method;
}

interface UserActivationLike {
  isActive: boolean;
}

/** Whether the page is inside a user gesture right now (unknown counts as yes). */
function gestureActive(): boolean {
  const ua = (navigator as Navigator & { userActivation?: UserActivationLike }).userActivation;
  return ua ? ua.isActive : true;
}

function stop(e: Event): void {
  e.stopPropagation();
}

/** The hidden switch: display none, so it never takes focus, scrolls, or reaches a screen reader. */
function switchLabel(): HTMLLabelElement | null {
  if (sw?.isConnected) return sw;
  if (!document.body) return null;
  const label = document.createElement('label');
  label.setAttribute('aria-hidden', 'true');
  label.style.display = 'none';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.tabIndex = -1;
  label.appendChild(input);
  // The synthetic clicks must not reach the page's own click handlers.
  label.addEventListener('click', stop);
  label.addEventListener('change', stop);
  label.addEventListener('input', stop);
  document.body.appendChild(label);
  sw = label;
  return label;
}

function switchTick(): void {
  try {
    switchLabel()?.click();
  } catch {
    // Nothing to do: the flash (if enabled) is the only feedback left.
  }
}

/** Track fingers on the page so a tick without a gesture can wait for the release. */
function listen(): void {
  if (listening) return;
  listening = true;
  const count = (e: TouchEvent) => e.changedTouches?.length || 1;
  const down = (e: TouchEvent) => {
    fingersDown += count(e);
  };
  const up = (e: TouchEvent) => {
    fingersDown = Math.max(0, fingersDown - count(e));
    if (pendingAt && performance.now() - pendingAt <= RELEASE_WINDOW_MS) {
      pendingAt = 0;
      switchTick();
    }
    pendingAt = 0;
  };
  const opts: AddEventListenerOptions = { capture: true, passive: true };
  window.addEventListener('touchstart', down, opts);
  window.addEventListener('touchend', up, opts);
  window.addEventListener(
    'touchcancel',
    (e: TouchEvent) => {
      fingersDown = Math.max(0, fingersDown - count(e));
      pendingAt = 0;
    },
    opts,
  );
}

/** Start watching fingers early on iPhones, so the very first touch can defer its tick. */
export function primeHaptics(): void {
  try {
    if (hapticMethod() === 'switch') listen();
  } catch {
    // Haptics are optional.
  }
}

/** Start times (ms) of the "on" segments of a vibration pattern, at least `gap` apart. */
export function tickTimes(pattern: number | readonly number[], gap: number): number[] {
  if (typeof pattern === 'number') return pattern > 0 ? [0] : [];
  const out: number[] = [];
  let t = 0;
  for (let i = 0; i < pattern.length && out.length < MAX_TICKS; i++) {
    const seg = Math.max(0, Number(pattern[i]) || 0);
    if (i % 2 === 0 && seg > 0) {
      const last = out[out.length - 1];
      out.push(last === undefined ? t : Math.max(t, last + gap));
    }
    t += seg;
  }
  return out;
}

/** The screen-edge flash that stands in when nothing can buzz. */
export function flash(): void {
  try {
    if (!document.body) return;
    if (!flashEl?.isConnected) {
      const el = document.createElement('div');
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText =
        'position:fixed;inset:0;pointer-events:none;z-index:2147483646;opacity:0;' +
        'box-shadow:inset 0 0 0 4px rgba(255,201,40,.85),inset 0 0 28px rgba(255,201,40,.35);';
      document.body.appendChild(el);
      flashEl = el;
    }
    const el = flashEl;
    if (typeof el.animate === 'function') {
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease-out' });
    } else {
      el.style.transition = 'none';
      el.style.opacity = '1';
      requestAnimationFrame(() => {
        el.style.transition = 'opacity 160ms ease-out';
        el.style.opacity = '0';
      });
    }
  } catch {
    // Purely cosmetic.
  }
}

function wantFlash(m: HapticMethod): boolean {
  const mode = CONTROL_TUNING.haptic.flash;
  return mode === 'always' || (mode === 'auto' && m === 'none');
}

/** `count` iPhone ticks `gap` ms apart (Lab tests; Android vibrates as many short pulses). */
export function ticks(count: number, gap = CONTROL_TUNING.haptic.tickGap): void {
  const n = Math.max(1, Math.min(MAX_TICKS, Math.round(count)));
  const pattern: number[] = [];
  for (let i = 0; i < n; i++) pattern.push(12, i < n - 1 ? Math.max(0, gap - 12) : 0);
  play(pattern.slice(0, -1));
}

/** Cancel ticks still waiting from an earlier pattern. */
function clearTimers(): void {
  for (const id of timers) window.clearTimeout(id);
  timers.clear();
}

/** Play a vibration pattern (ms on, ms off, ...) the best way this phone allows. */
export function play(pattern: number | readonly number[]): void {
  try {
    const m = hapticMethod();
    if (wantFlash(m)) flash();
    if (m === 'vibrate') {
      navigator.vibrate(typeof pattern === 'number' ? pattern : [...pattern]);
      return;
    }
    if (m !== 'switch') return;
    listen();
    const times = tickTimes(pattern, CONTROL_TUNING.haptic.tickGap);
    if (times.length === 0) return;
    clearTimers();
    if (gestureActive()) switchTick();
    else if (CONTROL_TUNING.haptic.releaseFallback && fingersDown > 0) pendingAt = performance.now();
    else {
      // No gesture and no finger down (a game event): try anyway, and show the flash as well,
      // since Safari will most likely stay silent.
      switchTick();
      if (CONTROL_TUNING.haptic.flash === 'auto') flash();
    }
    for (const at of times.slice(1)) {
      const id = window.setTimeout(() => {
        timers.delete(id);
        switchTick();
      }, at);
      timers.add(id);
    }
  } catch {
    // Some browsers throw without a recent user gesture; haptics are a nicety only.
  }
}
