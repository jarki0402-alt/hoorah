/**
 * Main screen mouse cursor (owner 2026-11-22): it fades away after a short rest or as soon as a
 * key/remote button is pressed, and comes back the moment the mouse really moves. Only real
 * movement counts: browsers also send mouse events when the page slides under a resting cursor,
 * and those must neither show the cursor nor move the focus (see `pointerMoved`).
 */

const IDLE_MS = 2500;
const STYLE_ID = 'hoorah-cursor-idle';
const CSS = 'html.cursor-idle, html.cursor-idle * { cursor: none !important; }';

let lastMove = Number.NEGATIVE_INFINITY;

/** True when the mouse really moved within the last `withinMs` (hover may then move the focus). */
export function pointerMoved(withinMs = 400): boolean {
  return performance.now() - lastMove < withinMs;
}

/** Auto-hides the cursor in `doc` (the screen itself or a game iframe). Returns a disposer. */
export function autoHideCursor(doc: Document): () => void {
  const root = doc.documentElement;
  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    doc.head.appendChild(style);
  }
  let timer = 0;
  const hide = () => root.classList.add('cursor-idle');
  const onMove = (e: MouseEvent) => {
    // A move of zero is the browser re-checking hover after the page slid, not the mouse.
    if (e.movementX === 0 && e.movementY === 0) return;
    lastMove = performance.now();
    root.classList.remove('cursor-idle');
    window.clearTimeout(timer);
    timer = window.setTimeout(hide, IDLE_MS);
  };
  const onKey = () => {
    window.clearTimeout(timer);
    lastMove = Number.NEGATIVE_INFINITY;
    hide();
  };
  timer = window.setTimeout(hide, IDLE_MS);
  doc.addEventListener('mousemove', onMove, { passive: true });
  doc.addEventListener('keydown', onKey, true);
  return () => {
    window.clearTimeout(timer);
    doc.removeEventListener('mousemove', onMove);
    doc.removeEventListener('keydown', onKey, true);
    root.classList.remove('cursor-idle');
  };
}
