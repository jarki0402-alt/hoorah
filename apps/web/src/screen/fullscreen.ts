import { signal } from '@preact/signals';

type FsDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void>;
};
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };

const doc = document as FsDocument;
const root = document.documentElement as FsElement;

const current = () => Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement);

/** True while the TV page is fullscreen. */
export const isFullscreen = signal(current());

export const canFullscreen = Boolean(root.requestFullscreen ?? root.webkitRequestFullscreen);

for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) {
  document.addEventListener(ev, () => {
    isFullscreen.value = current();
    if (isFullscreen.value) disarm();
  });
}

/**
 * Browsers only grant fullscreen inside a gesture on this device. A press relayed from the
 * Host's phone is not one, so the request is kept and fulfilled by the next click, tap or key
 * on the main screen (Esc and F excluded: Esc means "back", F toggles fullscreen itself).
 */
const ARM_EVENTS = ['pointerdown', 'keydown'] as const;
let armed = false;

function onArmedGesture(e: Event): void {
  if (e instanceof KeyboardEvent && ['Escape', 'f', 'F'].includes(e.key)) return;
  disarm();
  request();
}

function arm(): void {
  if (armed) return;
  armed = true;
  for (const ev of ARM_EVENTS) window.addEventListener(ev, onArmedGesture, true);
}

function disarm(): void {
  if (!armed) return;
  armed = false;
  for (const ev of ARM_EVENTS) window.removeEventListener(ev, onArmedGesture, true);
}

/** Without a gesture-activation API (old Smart TV browsers) assume a gesture and just try. */
function hasGesture(): boolean {
  const ua = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
  return ua ? ua.isActive : true;
}

function request(): void {
  if (current() || !canFullscreen) return;
  const req = root.requestFullscreen?.bind(root) ?? root.webkitRequestFullscreen?.bind(root);
  try {
    // Older WebKit returns undefined instead of a promise.
    void Promise.resolve(req?.()).catch(() => {});
  } catch {
    // Refused synchronously (not allowed here): stay windowed.
  }
}

/**
 * Enters fullscreen now when called inside a gesture on this device, otherwise on the next
 * gesture on the main screen (e.g. "Mulai" pressed from the Host's phone).
 * Returns true when it has to wait for that gesture.
 */
export function enterFullscreen(): boolean {
  if (current() || !canFullscreen) return false;
  if (hasGesture()) {
    request();
    return false;
  }
  arm();
  return true;
}

/** Leaving needs no gesture, so it also works from the Host's phone. Returns true like enterFullscreen. */
export function toggleFullscreen(): boolean {
  if (!current()) return enterFullscreen();
  disarm();
  const exit = doc.exitFullscreen?.bind(doc) ?? doc.webkitExitFullscreen?.bind(doc);
  try {
    void Promise.resolve(exit?.()).catch(() => {});
  } catch {
    // Already windowed.
  }
  return false;
}
