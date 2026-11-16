import '@fontsource/baloo-2/latin-700.css';
import '@fontsource/baloo-2/latin-800.css';
import '@fontsource/plus-jakarta-sans/latin-400.css';
import '@fontsource/plus-jakarta-sans/latin-600.css';
import '@fontsource/plus-jakarta-sans/latin-700.css';
import '@fontsource/plus-jakarta-sans/latin-800.css';
import '../shared/base.css';
import './screen.css';
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { ensureGfxProfile } from '../games/common/gfx';
import { KeepAwake } from '../shared/device';
import { NetBanner, Reactions, Toasts } from './components';
import { toggleFullscreen } from './fullscreen';
import { bindKeyboard } from './nav';
import { DetailPage } from './pages/DetailPage';
import { GamePage } from './pages/GamePage';
import { HomePage } from './pages/HomePage';
import { JoinPage } from './pages/JoinPage';
import { ResultsPage } from './pages/ResultsPage';
import { audioOn, initAudio, notice, page, startNet, unlockAudio } from './store';

/**
 * The whole TV UI is authored at 1280x720 and scaled to fit any screen (720p, 1080p, 4K, laptops).
 * The stage takes the screen's shape (taller on 16:10 and 4:3, wider on ultrawide) so fullscreen
 * fills edge to edge; pages are fluid and use the extra room.
 */
function useStage(): { w: number; h: number; scale: number } {
  const calc = () => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Pick the stage width in whole stage px, then fit the scale to it exactly, so the stage is
    // exactly as wide as the screen (no half-pixel overhang that shows as a hairline at an edge).
    const fit = Math.min(vw / 1280, vh / 720);
    const w = Math.max(1280, Math.round(vw / fit));
    const scale = vw / w;
    return { w, h: Math.max(720, Math.ceil(vh / scale)), scale };
  };
  const [stage, setStage] = useState(calc);
  useEffect(() => {
    const onResize = () => setStage(calc());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return stage;
}

function App() {
  const { w, h, scale } = useStage();
  const p = page.value;
  return (
    <div class="tv-stage" style={{ width: `${w}px`, height: `${h}px`, transform: `scale(${scale})` }}>
      {p === 'join' && <JoinPage />}
      {p === 'home' && <HomePage />}
      {p === 'detail' && <DetailPage />}
      {p === 'game' && <GamePage />}
      {p === 'results' && <ResultsPage />}
      <Toasts />
      <Reactions />
      <NetBanner />
      {notice.value && (
        <div class="overlay" style={{ background: 'rgba(17,18,20,0.92)', zIndex: 100 }}>
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h1 class="display" style={{ margin: 0, fontSize: 40 }}>
              {notice.value}
            </h1>
            <button type="button" class="btn primary" onClick={() => location.reload()}>
              Muat ulang
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const awake = new KeepAwake();
initAudio();

// Browsers unlock sound on the first real interaction with this page. Keep listening until it
// works (a click, a tap or any remote/keyboard key), then stop.
const firstInput = () => {
  unlockAudio();
  void awake.enable();
  if (audioOn.value) {
    for (const ev of GESTURES) window.removeEventListener(ev, firstInput, true);
  }
};
const GESTURES = ['pointerdown', 'touchend', 'keydown'] as const;
for (const ev of GESTURES) window.addEventListener(ev, firstInput, true);
bindKeyboard(firstInput);
window.addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') toggleFullscreen();
});
startNet();
render(<App />, document.getElementById('app')!);
// Measure the GPU once per browser while the join page is idle, so the first 3D game already
// starts at a level this screen can hold (Smart TV browsers rarely say they are a TV).
window.setTimeout(() => void ensureGfxProfile(), 2500);
