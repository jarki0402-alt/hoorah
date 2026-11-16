import '@fontsource/baloo-2/latin-800.css';
import '../shared/base.css';
import './controller.css';
import '../games/arena/controller-theme.css';
import '../games/catur/controller-theme.css';
import '../games/congklak/controller-theme.css';
import '../games/dapur/controller-theme.css';
import '../games/juragan/controller-theme.css';
import '../games/kata/controller-theme.css';
import '../games/karung/controller-theme.css';
import '../games/kerupuk/controller-theme.css';
import '../games/kompak/controller-theme.css';
import '../games/ludo/controller-theme.css';
import '../games/ular/controller-theme.css';
import '../games/lari/controller-theme.css';
import '../games/wilayah/controller-theme.css';

import { isFruit } from '@hoorah/protocol';
import { render } from 'preact';
import { useState } from 'preact/hooks';
import { KeepAwake } from '../shared/device';
import { startAutoFit } from './fit';
import { LeaveSheet, RoomView } from './room';
import { startScreenMode } from './screenmode';
import { CodePage, ErrorPage, JoiningPage, ProfilePage } from './setup';
import { fruit, join, name, stage, tryResume } from './store';

let confirmLeave: (() => void) | null = null;

function App() {
  const [asking, setAsking] = useState(false);
  confirmLeave = () => setAsking(true);
  const s = stage.value;
  return (
    <>
      {s === 'code' && <CodePage />}
      {s === 'profile' && <ProfilePage />}
      {s === 'joining' && <JoiningPage />}
      {s === 'room' && <RoomView />}
      {s === 'error' && <ErrorPage />}
      {asking && s === 'room' && <LeaveSheet onClose={() => setAsking(false)} />}
    </>
  );
}

const params = new URLSearchParams(location.search);
// Swallow the browser back gesture while in a room so a swipe never kicks you out mid-game.
history.pushState({ hoorah: true }, '');
window.addEventListener('popstate', () => {
  if (stage.value === 'room') {
    history.pushState({ hoorah: true }, '');
    confirmLeave?.();
  }
});
window.addEventListener('beforeunload', (e) => {
  if (stage.value === 'room') e.preventDefault();
});
document.addEventListener('contextmenu', (e) => e.preventDefault());
// iOS only applies :active styles when a touch listener exists.
document.addEventListener('touchstart', () => {}, { passive: true });

// iOS Safari ignores user-scalable=no. CSS (touch-action: pan-x pan-y) stops most zooming; these
// catch the rest: Safari's own pinch gesture events and multi-finger moves outside the controls.
// Pointer events still fire, so two thumbs on the wheel and pedals keep working.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}
// Nothing on the controller scrolls (every screen fits, see fit.ts), so a finger drag never moves
// or bounces the page. Text fields keep their native behaviour.
document.addEventListener(
  'touchmove',
  (e) => {
    const t = e.target as HTMLElement | null;
    if (e.touches.length > 1) return e.preventDefault();
    // The game list in the Host's picker is the one part that scrolls.
    if (!t?.closest('input, textarea, select, .scroll-y')) e.preventDefault();
  },
  { passive: false },
);
// No double-tap zoom: a second tap within 350 ms has its default (zoom) cancelled. Game buttons
// act on pointerdown, so they still register every tap; text fields are left alone.
let lastTouchEnd = 0;
document.addEventListener(
  'touchend',
  (e) => {
    const now = e.timeStamp;
    const target = e.target as HTMLElement | null;
    const typing = target?.closest('input, textarea, select, [contenteditable]');
    if (!typing && now - lastTouchEnd < 350) e.preventDefault();
    lastTouchEnd = now;
  },
  { passive: false },
);
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
// If the page still ends up zoomed in (e.g. an accessibility zoom), snap it back to 1×.
const viewportMeta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
window.visualViewport?.addEventListener('resize', () => {
  const vv = window.visualViewport;
  if (!vv || !viewportMeta || vv.scale <= 1.01) return;
  const content = viewportMeta.content;
  viewportMeta.content = `${content}, minimum-scale=1`;
  requestAnimationFrame(() => {
    viewportMeta.content = content;
  });
});

// One screen, never scrolled. Browsers without dvh get the visible height from innerHeight
// (controller.css reads --app-h and --vh).
const root = document.documentElement;
if (!window.CSS?.supports?.('height', '1dvh')) {
  const fit = () => {
    root.style.setProperty('--app-h', `${window.innerHeight}px`);
    root.style.setProperty('--vh', `${window.innerHeight / 100}px`);
  };
  fit();
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', () => window.setTimeout(fit, 120));
}
// The keyboard may pan the page to show a text field; once nothing is being typed, put the page
// back at the top (iOS often leaves it shifted after the keyboard closes).
const typing = () => {
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
};
const unshift = () => {
  if (!typing() && (window.scrollX !== 0 || window.scrollY !== 0)) window.scrollTo(0, 0);
};
window.addEventListener('scroll', unshift, { passive: true });
document.addEventListener('focusout', () => window.setTimeout(unshift, 80));
window.visualViewport?.addEventListener('resize', () => window.setTimeout(unshift, 80));

const awake = new KeepAwake();
window.addEventListener('pointerdown', () => void awake.enable(), { once: true });

startAutoFit();
startScreenMode();
tryResume(params.get('r'));
// Simulator / test hook: /?ctrl=1&r=CODE&name=Bot&fruit=durian&auto=1 joins straight away.
if (params.has('auto') && stage.value === 'profile') {
  const f = params.get('fruit');
  name.value = params.get('name') ?? 'Bot';
  if (isFruit(f)) fruit.value = f;
  join();
}
render(<App />, document.getElementById('app')!);
