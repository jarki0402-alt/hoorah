/**
 * Auto-fit: every controller screen stays inside the space the phone really gives it.
 *
 * CSS sizes follow the viewport height, but real phones also lose space to the notch, the home
 * indicator, rounded corners and browser bars (safe-area insets, dynamic toolbars) that no
 * emulator reproduces. So after every layout change the screen is measured:
 *   1. natural layout fits -> nothing to do;
 *   2. otherwise `html.fit-compact` tightens gaps, paddings and button heights;
 *   3. still too big -> the whole screen is scaled down uniformly (`--fit-s`) until it fits.
 * The result: one screen on any phone and orientation, never clipped, never scrolled.
 *
 * Pop-up sheets (`.sheet`) sit over the screen and never change its size, so opening or closing
 * one does not re-measure: that briefly re-laid the screen behind it, which looked like the
 * background moving (owner 2026-11-23).
 */

const MIN_SCALE = 0.55;
const root = document.documentElement;
let raf = 0;
let timer = 0;

function screenEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>('#app .ctrl');
}

function overflow(el: HTMLElement): { h: number; w: number } {
  return {
    h: el.scrollHeight / Math.max(1, el.clientHeight),
    w: el.scrollWidth / Math.max(1, el.clientWidth),
  };
}

function fits(el: HTMLElement): boolean {
  return el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1;
}

function setScale(s: number): void {
  if (s >= 0.999) {
    root.classList.remove('fit-scale');
    root.style.removeProperty('--fit-s');
  } else {
    root.classList.add('fit-scale');
    root.style.setProperty('--fit-s', s.toFixed(3));
  }
}

function measure(): void {
  raf = 0;
  const el = screenEl();
  if (!el) return;
  // Start from the natural layout every time, so a screen that has room again grows back.
  root.classList.remove('fit-compact');
  setScale(1);
  if (fits(el)) return;
  root.classList.add('fit-compact');
  if (fits(el)) return;
  // Uniform scale-down. The scaled box gets 1/s more layout room, so refine a few times.
  let s = 1;
  for (let i = 0; i < 4 && !fits(el); i++) {
    const o = overflow(el);
    s = Math.max(MIN_SCALE, s / Math.max(o.h, o.w) - 0.005);
    setScale(s);
    if (s <= MIN_SCALE) break;
  }
}

/** Re-measure on the next frame (coalesced). */
export function requestFit(): void {
  if (!raf) raf = requestAnimationFrame(measure);
}

function requestFitSoon(): void {
  window.clearTimeout(timer);
  timer = window.setTimeout(requestFit, 90);
}

/**
 * Short-lived effects (a "+1" floating off a tap) carry `data-fx`. They come and go many times a
 * second and never change the layout, so they must not trigger a re-measure: that rescaled the
 * whole screen mid-tap.
 */
function isFx(n: Node): boolean {
  return n instanceof Element && (n.hasAttribute('data-fx') || n.classList.contains('sheet'));
}

function onMutations(records: MutationRecord[]): void {
  const changed = (list: NodeList) => {
    for (let i = 0; i < list.length; i++) if (!isFx(list[i]!)) return true;
    return false;
  };
  // Changes inside an open sheet (a typed Pass code, a spinner) do not touch the screen either.
  const inSheet = (r: MutationRecord) => r.target instanceof Element && r.target.closest('.sheet') !== null;
  if (records.some((r) => !inSheet(r) && (changed(r.addedNodes) || changed(r.removedNodes))))
    requestFitSoon();
}

export function startAutoFit(): void {
  const app = document.getElementById('app');
  if (!app) return;
  // New screens, new rows, longer texts.
  new MutationObserver(onMutations).observe(app, { childList: true, subtree: true });
  // Rotation, browser bars sliding in and out, keyboard.
  window.addEventListener('resize', requestFit);
  window.visualViewport?.addEventListener('resize', requestFit);
  window.addEventListener('orientationchange', () => window.setTimeout(requestFit, 150));
  void document.fonts?.ready.then(requestFit);
  requestFit();
}
