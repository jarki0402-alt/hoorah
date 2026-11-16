/**
 * Graphics diagnostics (`/?diag=1`): what this browser reports, how fast its GPU is, and which
 * level the 3D games will start at. The owner opens it on a Smart TV and takes a photo; the level
 * can also be chosen by hand here. Works with a TV remote (arrow keys move between buttons).
 */
import '../shared/base.css';
import './diag.css';
import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  GFX_TIERS,
  type GfxProbe,
  type GfxProfile,
  type GfxTier,
  gfxProfile,
  looksLikeTvBrowser,
  resetGfx,
  retestGfx,
  setForcedTier,
} from '../games/common/gfx';
import { REASON, STR, TIER_NAME } from './strings';

interface NavigatorExtras {
  deviceMemory?: number;
}

/** Display refresh as the page sees it (a 50 Hz TV shows 50 here). */
function useRefreshRate(): number {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let frames = 0;
    let start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      frames++;
      if (now - start >= 1000) {
        setFps(Math.round((frames * 1000) / (now - start)));
        frames = 0;
        start = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return fps;
}

/** Arrow keys move focus between the buttons in reading order (TV remotes). */
function useArrowFocus(root: { current: HTMLElement | null }): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!step || !root.current) return;
      const buttons = Array.from(root.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      if (!buttons.length) return;
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = at < 0 ? 0 : Math.min(buttons.length - 1, Math.max(0, at + step));
      buttons[next]?.focus();
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [root]);
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div class="dg-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Diag() {
  const [probe, setProbe] = useState<GfxProbe | null>(null);
  const [testing, setTesting] = useState(true);
  const [missing, setMissing] = useState(false);
  const [profile, setProfile] = useState<GfxProfile>(gfxProfile);
  const fps = useRefreshRate();
  const root = useRef<HTMLElement>(null);
  useArrowFocus(root);

  const test = async () => {
    setTesting(true);
    // Let the "testing" label paint before the GPU is busy.
    await new Promise((r) => setTimeout(r, 50));
    const p = await retestGfx();
    setProbe(p);
    setMissing(!p);
    setProfile(gfxProfile());
    setTesting(false);
  };
  useEffect(() => {
    void test();
    root.current?.querySelector('button')?.focus();
  }, []);

  const choose = (t: GfxTier | null) => {
    setForcedTier(t);
    setProfile(gfxProfile());
  };
  const reset = () => {
    resetGfx();
    void test();
  };

  const dpr = window.devicePixelRatio || 1;
  const nav = navigator as Navigator & NavigatorExtras;
  const cores = navigator.hardwareConcurrency || null;
  const ram = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null;
  const tv = looksLikeTvBrowser(navigator.userAgent, navigator.maxTouchPoints || 0);
  const gpuText = testing
    ? STR.testing
    : missing
      ? STR.noWebgl
      : `${probe?.gpu || STR.unknown}${probe?.vendor ? ` (${probe.vendor})` : ''}`;

  return (
    <main class="dg" ref={root}>
      <h1 class="display">{STR.title}</h1>
      <p class="dg-lead">{STR.lead}</p>
      <dl class="dg-list">
        <Row label={STR.level} value={`${TIER_NAME[profile.tier]} · ${REASON[profile.reason]}`} />
        <Row
          label={STR.test}
          value={testing ? STR.testing : probe ? STR.perLayer(probe.layerMs) : STR.noWebgl}
        />
        <Row label={STR.gpu} value={gpuText} />
        <Row label={STR.tv} value={tv ? STR.yes : STR.no} />
        <Row label={STR.slow} value={profile.slowAt ? TIER_NAME[profile.slowAt] : STR.none} />
        <Row
          label={STR.screen}
          value={STR.screenSize(
            window.innerWidth,
            window.innerHeight,
            Math.round(dpr * 100) / 100,
            Math.round(window.screen.width * dpr),
            Math.round(window.screen.height * dpr),
          )}
        />
        <Row label={STR.refresh} value={STR.fps(fps)} />
        <Row label={STR.webgl} value={probe ? STR.webglInfo(probe.webgl2, probe.maxTexture) : '-'} />
        <Row label={STR.device} value={STR.deviceInfo(cores, ram)} />
        <Row label={STR.browser} value={navigator.userAgent} />
      </dl>
      <h2 class="dg-sub">{STR.choose}</h2>
      <div class="dg-buttons">
        <button type="button" class={profile.forced === null ? 'on' : ''} onClick={() => choose(null)}>
          {STR.auto}
        </button>
        {[...GFX_TIERS].reverse().map((t) => (
          <button key={t} type="button" class={profile.forced === t ? 'on' : ''} onClick={() => choose(t)}>
            {TIER_NAME[t]}
          </button>
        ))}
      </div>
      <div class="dg-buttons">
        <button type="button" disabled={testing} onClick={() => void test()}>
          {STR.retest}
        </button>
        <button type="button" disabled={testing} onClick={reset}>
          {STR.reset}
        </button>
        <button type="button" onClick={() => location.assign('/')}>
          {STR.back}
        </button>
      </div>
      <p class="dg-note">{STR.saved}</p>
    </main>
  );
}

const app = document.getElementById('app');
if (app) render(<Diag />, app);
