/**
 * Arrow-key navigation for Smart TV remotes (and keyboards): an arrow moves focus to the nearest
 * button or link in that direction. Stretches with nothing to focus (illustrations, text) scroll
 * by part of a screen instead, so every section can be seen. On a desktop the arrows only take
 * over once a keyboard has focused something; until then they scroll the page as usual.
 */
import { arrowDir, type Box, type Dir, pickNeighbor } from './logic';
import { reducedMotion } from './motion';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), summary, [tabindex="0"]';

function isShown(el: HTMLElement): boolean {
  if (el.closest('[aria-hidden="true"], [inert]')) return false;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  return getComputedStyle(el).visibility !== 'hidden';
}

function onScreen(r: Box, vh: number): boolean {
  return r.bottom > 0 && r.top < vh;
}

/** Keyboard (not mouse) focus. Old browsers without `:focus-visible` count every focus. */
function keyboardFocus(el: Element): boolean {
  try {
    return el.matches(':focus-visible');
  } catch {
    return true;
  }
}

function scrollStep(dir: Dir): void {
  const dy = dir === 'down' ? 1 : dir === 'up' ? -1 : 0;
  if (dy === 0) return;
  window.scrollBy({ top: dy * window.innerHeight * 0.6, behavior: reducedMotion.value ? 'auto' : 'smooth' });
}

/** Scrolls the element to the middle of the screen when it sits near or past an edge. */
function bringIntoView(el: HTMLElement): void {
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight;
  if (r.top >= vh * 0.12 && r.bottom <= vh * 0.88) return;
  window.scrollTo({
    top: window.scrollY + r.top - Math.max(16, (vh - r.height) / 2),
    behavior: reducedMotion.value ? 'auto' : 'smooth',
  });
}

/** Starts arrow navigation inside `root`. `tv` takes the arrows even before anything has focus. */
export function bindRemote(root: HTMLElement, tv: boolean): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const dir = arrowDir(e.key);
    if (!dir) return;
    const focused = document.activeElement;
    const active = focused instanceof HTMLElement && root.contains(focused) ? focused : null;
    if (!tv && (!active || !keyboardFocus(active))) return;
    // Left and right move the caret inside the code field.
    if (active instanceof HTMLInputElement && (dir === 'left' || dir === 'right')) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const activeBox = active?.getBoundingClientRect() ?? null;
    const fromVisible = activeBox !== null && onScreen(activeBox, vh);
    const candidates = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => (el !== active || !fromVisible) && isShown(el),
    );
    const boxes = candidates.map((el) => el.getBoundingClientRect());
    // Focus scrolled away (or none yet): start from the edge of the screen the arrow leaves.
    const from: Box =
      fromVisible && activeBox
        ? activeBox
        : dir === 'down'
          ? { left: vw / 2, right: vw / 2, top: -1, bottom: -1 }
          : dir === 'up'
            ? { left: vw / 2, right: vw / 2, top: vh + 1, bottom: vh + 1 }
            : { left: vw / 2, right: vw / 2, top: vh / 2, bottom: vh / 2 };
    const i = pickNeighbor(from, boxes, dir);
    e.preventDefault();
    const target = candidates[i];
    const box = boxes[i];
    if (!target || !box) {
      scrollStep(dir);
      return;
    }
    // The next button is far below or above: show what lies between first.
    if ((dir === 'down' && box.top > vh * 1.4) || (dir === 'up' && box.bottom < -vh * 0.4)) {
      scrollStep(dir);
      return;
    }
    target.focus({ preventScroll: true });
    bringIntoView(target);
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
