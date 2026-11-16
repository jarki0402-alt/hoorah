/**
 * Juragan Nusantara bootstrap: connect to the shell, mount the stage, the 3D tabletop and the DOM HUD.
 *
 * `?poster=1` skips the shell and renders the key-art shot at the stage size, then sets
 * `window.__posterReady` (add `&cam=x,y,z,tx,ty,tz,fov` to tune the camera).
 * `?demo=N` runs offline with N players (1-8) all played by the computer, for layout and
 * performance tests; `window.__juraganStats()` reports the renderer state.
 * Graphics level: the device profile (`?gfx=low|medium|high` forces one), `?q=1|2|3` overrides it.
 */
import { FRUITS, type Fruit, PLAYER_COLORS } from '@hoorah/protocol';
import { connect, HoorahGame } from '@hoorah/sdk';
import { render } from 'preact';
import { ensureGfxProfile, type GfxTier, isGfxTier } from '../common/gfx';
import { fontsReady, mountStage } from '../common/stage';
import { JuraganDriver } from './driver';
import { Hud, HudStore } from './hud';
import { pickTier } from './scene/quality';
import { type Frame, JuraganView, type ViewStats } from './scene/view';
import { STR } from './strings';
import './juragan.css';

declare global {
  interface Window {
    __posterReady?: boolean;
    __juraganFps?: () => number;
    __juraganStats?: () => ViewStats;
  }
}

/** Free stage area between the HUD columns (players left, turn and tile card right). */
const HUD_FRAME: Frame = { left: 270, right: 292, top: 12, bottom: 8 };

function layer(stage: HTMLElement, cls?: string): HTMLDivElement {
  const el = document.createElement('div');
  if (cls) el.className = cls;
  stage.appendChild(el);
  return el;
}

/** Counts rendered frames so tests can measure fps. */
function installFpsProbe(): void {
  let frames = 0;
  const count = () => {
    frames++;
    requestAnimationFrame(count);
  };
  requestAnimationFrame(count);
  let last = { t: performance.now(), f: 0 };
  window.__juraganFps = () => {
    const now = performance.now();
    const fps = ((frames - last.f) * 1000) / Math.max(1, now - last.t);
    last = { t: now, f: frames };
    return fps;
  };
}

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;
  const params = new URLSearchParams(window.location.search);
  installFpsProbe();
  if (params.get('poster') === '1') {
    await poster(root, params);
    return;
  }
  const demo = Math.min(8, Math.max(0, Math.floor(Number(params.get('demo') ?? 0))));
  let game: HoorahGame;
  if (demo > 0) game = demoGame(demo);
  else {
    try {
      game = await connect();
    } catch {
      const { stage } = mountStage(root);
      render(<div class="jg-noshell">{STR.noShell}</div>, stage);
      return;
    }
  }
  const { stage, width, height, onResize } = mountStage(root);
  // The level decides the WebGL context (antialiasing), so it is known before the renderer exists.
  const [profile] = await Promise.all([ensureGfxProfile(), fontsReady()]);
  const tier = pickTier(profile.tier, window.location.search);
  const view = new JuraganView(layer(stage, 'jg-canvas'), width(), height(), HUD_FRAME, { tier });
  window.__juraganStats = () => view.stats();
  await view.warmUp();
  const hud = new HudStore();
  render(<Hud store={hud} />, layer(stage));
  const driver = new JuraganDriver(game, view, hud);
  driver.autopilot = demo > 0;
  onResize((h, w) => {
    view.setSize(w, h, HUD_FRAME);
    driver.relayout();
  });
  driver.start();
  game.ready();
  game.music('juragan');
}

/** Offline stand-in for the shell: `n` connected players, messages to phones go nowhere. */
function demoGame(n: number): HoorahGame {
  return new HoorahGame({
    gameId: 'juragan',
    players: Array.from({ length: n }, (_, i) => ({
      id: i + 1,
      name: STR.demoNames[i % STR.demoNames.length] ?? STR.unknownPlayer,
      fruit: FRUITS[i % FRUITS.length]!,
      color: PLAYER_COLORS[i % PLAYER_COLORS.length]!,
      connected: true,
      isHost: i === 0,
    })),
    clockOffset: 0,
    settings: {},
    muted: true,
  });
}

/* ------------------------------------------------------------------ poster */

interface PosterPawn {
  id: number;
  fruit: Fruit;
  color: string;
  tile: number;
}

const POSTER_PAWNS: PosterPawn[] = [
  { id: 1, fruit: 'mangga', color: '#F2453D', tile: 1 },
  { id: 2, fruit: 'semangka', color: '#2F8CFF', tile: 3 },
  { id: 3, fruit: 'nanas', color: '#22B35E', tile: 23 },
  { id: 4, fruit: 'rambutan', color: '#FFC928', tile: 5 },
];

async function poster(root: HTMLElement, params: URLSearchParams): Promise<void> {
  const { stage, width, height } = mountStage(root);
  await fontsReady();
  // Key art is always the full look unless a level is asked for.
  const gfx = params.get('gfx');
  const forced: GfxTier = isGfxTier(gfx) ? gfx : 'high';
  const view = new JuraganView(
    layer(stage, 'jg-canvas'),
    width(),
    height(),
    { left: 0, right: 0, top: 0, bottom: 0 },
    {
      preserve: true,
      tier: pickTier(forced, window.location.search),
    },
  );
  window.__juraganStats = () => view.stats();
  const cam = params.get('cam');
  view.posterCam = cam ? cam.split(',').map(Number) : [-5.2, 3.4, 7.6, -0.6, 0.1, 1.6, 30];
  view.setPawns(POSTER_PAWNS.map((p) => ({ id: p.id, fruit: p.fruit, color: p.color })));
  view.place(
    POSTER_PAWNS.map((p) => ({ id: p.id, tile: p.tile, jailed: false, out: false })),
    true,
  );
  // A board in full swing: every building level on show, a harbour lighthouse in yellow.
  const owned: [number, number, string][] = [
    [1, 4, '#F2453D'],
    [3, 3, '#F2453D'],
    [4, 2, '#2F8CFF'],
    [5, 1, '#2F8CFF'],
    [19, 1, '#22B35E'],
    [21, 2, '#22B35E'],
    [23, 4, '#22B35E'],
    [8, 1, '#FFC928'],
    [7, 2, '#FFC928'],
  ];
  for (const [tile, level, color] of owned) {
    view.setOwner(tile, color, false);
    view.setBuilding(tile, level, color, false);
  }
  view.setActive(2);
  // Key art: a fixed virtual clock so the captured frame is the same every time.
  const FRAMES = 150;
  let frame = 0;
  const tick = () => {
    if (frame < FRAMES) requestAnimationFrame(tick);
    if (frame === 40) view.walk(2, [2, 3], 'walk', 0.4, 1);
    if (frame === 112) view.rollDice([6, 5], view.pawnPoint(4), 1.4);
    if (frame === 126) view.coins({ pawn: 2 }, { pawn: 1 }, 220);
    view.render(1 / 60);
    frame++;
    if (frame === FRAMES) window.__posterReady = true;
  };
  requestAnimationFrame(tick);
}

void boot();
