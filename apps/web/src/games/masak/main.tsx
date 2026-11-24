/**
 * Jago Masak bootstrap: connect to the shell, mount the stage, the 3D view and the DOM HUD.
 *
 * `?poster=1` skips the shell and renders the key-art hero shot at the stage size (always the
 * high graphics level unless `&gfx=` says otherwise), then sets `window.__posterReady`. Adding
 * `&demo=grid&n=4&dish=sate&step=2&p=0.5&grade=sempurna` shows a live station grid instead (layout,
 * look and speed checks without phones) at this device's level; `&gfx=low|medium|high` forces one
 * and `&adapt=0` keeps its starting quality (no automatic steps).
 * `window.__masakGfx()` returns the level, the current rung and every quality step taken.
 */
import { lookAt, PLAYER_COLORS } from '@hoorah/protocol';
import { connect, type HoorahGame } from '@hoorah/sdk';
import { render } from 'preact';
import { ensureGfxProfile, type GfxProfile, type GfxReason, type GfxTier, isGfxTier } from '../common/gfx';
import { fontsReady, mountStage } from '../common/stage';
import { MasakDriver } from './driver';
import { Hud, type HudModel, HudStore } from './hud';
import type { Grade, Phase } from './logic';
import { DISHES, type DishId } from './recipes';
import type { StationModel } from './scene/model';
import type { Rung } from './scene/quality';
import { MasakView } from './scene/view';
import { STR } from './strings';
import './masak.css';

interface GfxState {
  tier: GfxTier;
  reason: GfxReason;
  rung: Rung;
  steps: string[];
  bottom: boolean;
}

declare global {
  interface Window {
    __posterReady?: boolean;
    __masakFps?: () => number;
    __masakGfx?: () => GfxState;
  }
}

function layer(stage: HTMLElement, cls?: string): HTMLDivElement {
  const el = document.createElement('div');
  if (cls) el.className = cls;
  stage.appendChild(el);
  return el;
}

/** Rendered frames per second since the previous call, and the quality state, for tests. */
function installProbes(view: MasakView, profile: Pick<GfxProfile, 'tier' | 'reason'>): void {
  let last = { t: performance.now(), f: view.framesRendered };
  window.__masakFps = () => {
    const now = performance.now();
    const f = view.framesRendered;
    const fps = ((f - last.f) * 1000) / Math.max(1, now - last.t);
    last = { t: now, f };
    return fps;
  };
  window.__masakGfx = () => ({
    tier: profile.tier,
    reason: profile.reason,
    rung: view.quality.rung,
    steps: [...view.quality.log],
    bottom: view.quality.atBottom,
  });
}

async function boot(): Promise<void> {
  const root = document.getElementById('app')!;
  const params = new URLSearchParams(window.location.search);
  if (params.get('poster') === '1') {
    await poster(root, params);
    return;
  }
  let game: HoorahGame;
  try {
    game = await connect();
  } catch {
    root.textContent = STR.noShell;
    return;
  }
  const { stage, width, height, onResize } = mountStage(root);
  // The level decides the WebGL context flags (antialiasing), so it comes before the renderer.
  const [profile] = await Promise.all([ensureGfxProfile(), fontsReady()]);
  const view = new MasakView(layer(stage, 'mk-canvas'), height(), { width: width(), tier: profile.tier });
  installProbes(view, profile);
  const hud = new HudStore();
  render(<Hud store={hud} />, layer(stage));
  const driver = new MasakDriver(game, view, hud);
  onResize((h, w) => {
    view.setSize(w, h);
    driver.relayout();
  });
  driver.start();
  game.ready();
  game.music('masak');
}

/* ------------------------------------------------------------------ poster + demo */

function demoStation(
  id: number,
  dish: DishId,
  step: number,
  p: number,
  grade: Grade | null,
  poster: boolean,
): StationModel {
  const steps = DISHES[dish].steps;
  const st = steps[Math.min(step, steps.length - 1)]!;
  const hold = st.hold;
  const finals = steps.map((s, i) => (i < step ? (s.hold ? s.hold.sweet : 1) : Number.NaN));
  return {
    id,
    dish,
    stepIndex: step,
    phase: grade ? 'reveal' : 'cook',
    progress: p,
    amount: hold ? p * hold.burn : 0,
    held: Boolean(hold) && !grade,
    pulses: 0,
    grade,
    reason: grade ? 'fast' : null,
    finals,
    connected: true,
    plated: step >= steps.length,
    poster,
  };
}

async function poster(root: HTMLElement, params: URLSearchParams): Promise<void> {
  const { stage, width, height } = mountStage(root);
  const demo = params.get('demo') === 'grid';
  const forced = params.get('gfx');
  // Key art is always drawn at the top level; the live demo uses this device's level.
  const [profile] = await Promise.all([
    demo || isGfxTier(forced)
      ? ensureGfxProfile()
      : Promise.resolve<Pick<GfxProfile, 'tier' | 'reason'>>({ tier: 'high', reason: 'forced' }),
    fontsReady(),
  ]);
  const view = new MasakView(layer(stage, 'mk-canvas'), height(), {
    preserve: true,
    width: width(),
    tier: profile.tier,
    adaptive: demo && params.get('adapt') !== '0',
  });
  installProbes(view, profile);
  const n = Math.max(1, Math.min(8, Number(params.get('n') ?? 2)));
  const dish = (params.get('dish') ?? 'nasgor') as DishId;
  const step = Number(params.get('step') ?? 3);
  const p = Number(params.get('p') ?? 0.6);
  const grade = (params.get('grade') as Grade | null) ?? null;
  view.setStations(demo ? n : 1);
  const cam = params.get('cam');
  if (cam) view.posterCam = cam.split(',').map(Number);
  const stations = demo
    ? Array.from({ length: n }, (_, i) =>
        demoStation(i + 1, dish, step, Math.min(1, p * (0.6 + 0.15 * i)), i === 0 ? grade : null, false),
      )
    : [demoStation(1, 'nasgor', 3, 0.85, null, true)];

  if (demo) {
    const hud = new HudStore();
    render(<Hud store={hud} />, layer(stage));
    const steps = DISHES[dish].steps;
    const plated = step >= steps.length;
    const phase: Phase = plated ? 'showcase' : grade ? 'reveal' : 'cook';
    const model: HudModel = {
      mode: 'grid',
      phase,
      dish,
      dishIndex: 0,
      dishCount: 3,
      stepIndex: Math.min(step, steps.length - 1),
      step: steps[Math.min(step, steps.length - 1)]!,
      steps,
      chefLine: grade ? STR.chefSempurna[0]! : null,
      stations: stations.map((s, i) => ({
        id: s.id,
        name: ['Rina', 'Budi', 'Sari', 'Dewi', 'Agus', 'Tono', 'Lala', 'Joko'][i]!,
        look: lookAt(i),
        color: PLAYER_COLORS[i % PLAYER_COLORS.length]!,
        connected: true,
        score: 420 - i * 40,
        grade: s.grade,
        reason: s.reason,
        points: 110,
        streak: 2,
        stars: plated ? 3 - (i % 3) : null,
        dishPoints: plated ? 480 - i * 50 : null,
      })),
      rects: [...view.stationRects],
      players: [],
      final: null,
      goKey: 0,
    };
    hud.model.value = model;
    let prev = 0;
    const tick = (now: number) => {
      requestAnimationFrame(tick);
      if (!view.beginFrame(now)) return;
      const dt = prev ? Math.min(0.05, (now - prev) / 1000) : 1 / 60;
      prev = now;
      const t = now / 1000;
      for (const s of stations) if (!s.grade && t % 0.5 < 0.02) s.pulses++;
      view.render({
        t,
        dt,
        mode: 'grid',
        dish,
        focus: plated ? (dish === 'martabak' ? 'board' : 'plate') : steps[step]!.focus,
        stations,
        heroStation: 0,
        heroShot: 'intro',
        orbit: plated,
      });
      hud.frame({ secs: 5, ring: 0.6, progress: stations.map((s) => s.progress) });
    };
    requestAnimationFrame(tick);
    window.setTimeout(() => {
      window.__posterReady = true;
    }, 2500);
    return;
  }

  // Key art: a fixed virtual clock so the captured frame is the same every time.
  view.react('happy', 0, 1e9);
  const st = stations[0]!;
  let frame = 0;
  const FRAMES = 150;
  const tick = () => {
    if (frame < FRAMES) requestAnimationFrame(tick);
    const t = 1 + frame / 60;
    if (frame % 20 === 0) st.pulses++;
    view.render({
      t,
      dt: 1 / 60,
      mode: 'hero',
      dish: 'nasgor',
      focus: 'wok',
      stations,
      heroStation: 0,
      heroShot: 'poster',
      orbit: false,
    });
    frame++;
    if (frame === FRAMES) window.__posterReady = true;
  };
  requestAnimationFrame(tick);
}

void boot();
