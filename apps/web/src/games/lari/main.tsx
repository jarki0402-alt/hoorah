/**
 * Lari Terus bootstrap. Normal mode connects to the Hoorah shell. `?poster=1` renders the key-art
 * frame; `?demo=N` runs offline with N runners on autopilot (`&mode=sprint|survive`, `&skip=1`
 * to start running at once) for layout and performance checks; `?showroom=<pose>` lines up all
 * eight runners facing the camera in one pose (run, idle, air, slide, stumble, fall, climb,
 * ready, cheer).
 *
 * Graphics: the device profile (common/gfx.ts, `?gfx=low|medium|high` forces a level) picks the
 * starting settings (bajaj/quality.ts); the quality ladder steps down while running. Debug pins:
 * `?q=0..3` shadow tier, `?k=` pixel ratio, `?aa=0|1` MSAA.
 *
 * The model packs (public/models/lari) load in parallel with the shell connection; the shell
 * keeps its loading screen up until `ready()`.
 */
import { FRUITS, PLAYER_COLORS, type PlayerInfo } from '@hoorah/protocol';
import { connect, type GameResult } from '@hoorah/sdk';
import { render } from 'preact';
import * as THREE from 'three';
import { LEVELS, QualityLadder, type Rung, readOverrides, startRatio } from '../bajaj/quality';
import { ensureGfxProfile, type GfxTier } from '../common/gfx';
import { fontsReady, mountStage } from '../common/stage';
import { type LariAssets, loadLariAssets } from './assets';
import { type GameLike, LariDriver } from './driver';
import { Hud, HudStore } from './hud';
import './lari.css';
import { LariRun, type Mode } from './logic';
import type { PoseState } from './runner3d';
import { LariScene } from './scene';
import { STR } from './strings';
import type { Obstacle } from './track';

interface DebugWindow {
  __posterReady?: boolean;
  __lari?: {
    fps: number;
    k: number;
    level: GfxTier;
    tier: number;
    steps: readonly Rung[];
    calls: number;
    tris: number;
    beat: string;
    d: number;
    speed: number;
  };
  __lariDriver?: LariDriver;
  __lariResult?: GameResult | null;
  __lariScene?: THREE.Scene;
}
const dbg = window as unknown as DebugWindow;

/** Offline stand-in for the shell. */
class DemoGame implements GameLike {
  readonly allPlayers: PlayerInfo[];
  readonly settings: Record<string, string | number | boolean>;
  readonly paused = false;
  result: GameResult | null = null;

  constructor(n: number, mode: Mode) {
    const names = ['Rina', 'Budi', 'Sari', 'Joko', 'Dewi', 'Agus', 'Wati', 'Yudi'];
    this.allPlayers = Array.from({ length: n }, (_, i) => ({
      id: i + 1,
      name: names[i]!,
      fruit: FRUITS[i % FRUITS.length]!,
      color: PLAYER_COLORS[i % PLAYER_COLORS.length]!,
      connected: true,
      isHost: i === 0,
    }));
    this.settings = { rounds: mode === 'sprint' ? 1 : 2 };
  }
  now(): number {
    return Date.now();
  }
  on(): () => void {
    return () => {};
  }
  setView(): void {}
  vibrate(): void {}
  sfx(): void {}
  music(): void {}
  ready(): void {}
  end(result: GameResult): void {
    this.result = result;
    dbg.__lariResult = result;
  }
}

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;
  const params = new URLSearchParams(window.location.search);
  const assetsP = loadLariAssets();
  // The GPU test (once per browser) runs while the models load; MSAA and materials need it.
  const profileP = ensureGfxProfile();
  let assets: LariAssets;
  try {
    assets = await assetsP;
  } catch {
    root.textContent = STR.loadFailed;
    return;
  }
  if (params.get('poster') === '1' || params.has('showroom')) {
    await bootPoster(root, params, assets);
    return;
  }
  const demo = Math.min(8, Math.max(0, Math.floor(Number(params.get('demo') ?? 0))));
  const demoMode: Mode = params.get('mode') === 'sprint' ? 'sprint' : 'survive';
  let game: GameLike;
  if (demo > 0) game = new DemoGame(demo, demoMode);
  else {
    try {
      game = await connect();
    } catch {
      root.textContent = STR.noShell;
      return;
    }
  }

  const { stage, width, height, onResize, scale } = mountStage(root);
  await fontsReady();
  const host = document.createElement('div');
  host.className = 'lr-host';
  stage.appendChild(host);
  const hudHost = document.createElement('div');
  stage.appendChild(hudHost);
  const hud = new HudStore();
  const level = (await profileP).tier;
  const pins = readOverrides(params);
  const scene = new LariScene(host, assets, level, pins.aa ?? LEVELS[level].msaa);
  const secs = Number(params.get('secs') ?? 0);
  const driver = new LariDriver(
    game,
    hud,
    scene,
    demo > 0
      ? { autopilot: true, mode: demoMode, ...(secs > 0 ? { tuning: { sprintSeconds: secs } } : {}) }
      : {},
  );

  const ratio = () => startRatio(level, scale(), width(), window.devicePixelRatio);
  let k = pins.k ?? ratio();
  scene.setSize(width(), height(), k);
  onResize((h, w) => scene.setSize(w, h, k));
  window.addEventListener('resize', () => {
    if (pins.k === null) k = Math.min(k, ratio());
    scene.setSize(width(), height(), k);
  });
  const ladder = new QualityLadder(level, {
    shadows: scene.rig,
    ratio: () => k,
    setRatio: (v) => {
      k = v;
      scene.setSize(width(), height(), k);
    },
    ratioPinned: pins.k !== null,
  });
  driver.pacer = ladder.pacer;
  // Judged only while running: the intro and countdown compile shaders and upload the city.
  driver.onFrame = (now) => ladder.frame(now, driver.running);
  driver.onFps = (fps) => {
    ladder.second(performance.now(), fps);
    const info = scene.renderer.info;
    const d = driver.debug();
    dbg.__lari = {
      fps: Math.round(fps * 10) / 10,
      k,
      level,
      tier: scene.rig.tier,
      steps: ladder.steps,
      calls: info.render.calls,
      tris: info.render.triangles,
      beat: d.beat,
      d: Math.round(d.d),
      speed: Math.round(d.speed * 10) / 10,
    };
  };

  render(<Hud store={hud} />, hudHost);
  await scene.warmUp();
  if (params.get('skip') === '1') driver.skipIntro();
  driver.start();
  game.ready();
  dbg.__lariDriver = driver;
  dbg.__lariScene = scene.scene;
}

/* ------------------------------------------------------------------ poster */

/**
 * Key art: four runners mid-move over a laundry line and a pipe rack, coins arcing, the city in
 * golden light. Open sky at the top left for the logo.
 */
async function bootPoster(root: HTMLElement, params: URLSearchParams, assets: LariAssets): Promise<void> {
  const { stage, width, height } = mountStage(root);
  await fontsReady();
  const host = document.createElement('div');
  host.className = 'lr-host';
  stage.appendChild(host);
  const scene = new LariScene(host, assets);
  if (params.has('showroom')) {
    showroom(scene, params, width(), height());
    return;
  }
  scene.setSize(width(), height(), Number(params.get('k') ?? 1.5));
  const looks: [string, (typeof FRUITS)[number]][] = [
    ['#FF8A3D', 'jeruk'],
    ['#2F8CFF', 'semangka'],
    ['#22B35E', 'durian'],
    ['#F2453D', 'stroberi'],
  ];
  const run = new LariRun({
    mode: 'sprint',
    runners: looks.map((_, i) => ({ id: i + 1, cpu: true })),
    seed: Number(params.get('seed') ?? 2),
  });
  scene.setRunners(looks.map(([color, fruit], i) => ({ id: i + 1, fruit, color })));
  run.start();
  // Run a little so the pack is up to speed, then pose everyone by hand.
  for (let i = 0; i < 60 * 20; i++) run.step(1 / 60);
  const base = run.packD;
  const track = run.track;
  // Clear the stretch in front and stage our own obstacles and coins.
  const keep = (o: Obstacle) => o.d < base - 6 || o.d > base + 60;
  const staged = track.obstacles.filter(keep);
  track.obstacles.length = 0;
  for (const o of staged) track.obstacles.push(o);
  const mk = (
    id: number,
    kind: Obstacle['kind'],
    lane: number,
    d: number,
    len: number,
    variant: number,
    span: 1 | 3 = 1,
  ) => ({ id, row: id, kind, lane, span, d, len, variant }) as Obstacle;
  track.obstacles.push(mk(90001, 'high', 1, base + 3.0, 0.35, 1), mk(90002, 'low', 0, base + 4.4, 0.5, 0));
  track.obstacles.sort((a, b) => a.d - b.d);
  track.coins.length = 0;
  for (let i = 0; i < 4; i++)
    track.coins.push({ id: 80000 + i, lane: 0, d: base + 2.2 - i * 2.2, y: 0.85, taken: false });
  for (let i = 0; i < 3; i++) {
    const u = i / 2;
    track.coins.push({
      id: 80100 + i,
      lane: -1,
      d: base + 2.4 - i * 1.6,
      y: 0.85 + Math.sin(u * Math.PI) * 0.9,
      taken: false,
    });
  }
  track.coins.sort((a, b) => a.d - b.d);
  // [lane x, d offset, y, state, vertical speed]
  const W = run.tuning.laneW;
  const pose: [number, number, number, 'air' | 'slide' | 'run', number][] = [
    [0, 4.4, 1.05, 'air', 2],
    [W, 3.0, 0, 'slide', 0],
    [-W, 0.4, 0, 'run', 0],
    [-W, -4.6, 0.55, 'air', 3.5],
  ];
  run.runners.forEach((r, i) => {
    const [x, dd, y, st, vy] = pose[i]!;
    r.d = r.prevD = base + dd;
    r.x = r.prevX = x;
    r.y = r.prevY = y;
    r.lane = Math.round(x / W);
    r.air = st === 'air';
    r.vy = vy;
    r.slideT = st === 'slide' ? 0.5 : 0;
    r.speed = 15;
  });
  run.packD = base + 3.6;
  run.speed = 15;
  // The rules stay frozen from here: only the camera and the animation move.
  const num = (key: string, fallback: number) => Number(params.get(key) ?? fallback);
  scene.freeCam = {
    pos: new THREE.Vector3(num('cx', 2.6), num('cy', 1.0), -(base + num('cd', 8.6))),
    look: new THREE.Vector3(num('lx', -0.3), num('ly', 1.85), -(base + num('ld', 0))),
    fov: num('fov', 50),
  };
  let n = 0;
  const tick = () => {
    scene.render(run, 1, 1 / 60, 'free', 1);
    if (++n < 90) requestAnimationFrame(tick);
    else dbg.__posterReady = true;
  };
  requestAnimationFrame(tick);
}

/* ------------------------------------------------------------------ showroom */

const POSES: readonly PoseState[] = [
  'run',
  'idle',
  'air',
  'slide',
  'stumble',
  'fall',
  'climb',
  'ready',
  'cheer',
];

/** All eight fruits side by side on a roof, facing the camera, in one pose (model review). */
function showroom(scene: LariScene, params: URLSearchParams, w: number, h: number): void {
  scene.setSize(w, h, Number(params.get('k') ?? 1.5));
  const want = params.get('showroom') as PoseState;
  scene.forcePose = POSES.includes(want) ? want : 'idle';
  const run = new LariRun({
    mode: 'sprint',
    runners: FRUITS.map((_, i) => ({ id: i + 1, cpu: true })),
    seed: 3,
  });
  scene.setRunners(FRUITS.map((fruit, i) => ({ id: i + 1, fruit, color: PLAYER_COLORS[i]! })));
  run.start();
  for (let i = 0; i < 60 * 3; i++) run.step(1 / 60);
  const base = run.packD;
  run.track.obstacles.length = 0;
  run.track.coins.length = 0;
  run.runners.forEach((r, i) => {
    r.d = r.prevD = base;
    r.x = r.prevX = (i - 3.5) * 1.05;
    r.y = r.prevY = 0;
    r.air = false;
    r.slideT = 0;
  });
  const num = (key: string, fallback: number) => Number(params.get(key) ?? fallback);
  scene.freeCam = {
    pos: new THREE.Vector3(num('cx', 0), num('cy', 1.5), -(base + num('cd', 7.5))),
    look: new THREE.Vector3(0, num('ly', 0.85), -base),
    fov: num('fov', 42),
  };
  let n = 0;
  const tick = () => {
    scene.render(run, 1, 1 / 60, 'free', 1);
    n++;
    if (n === 90) dbg.__posterReady = true;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

void boot();
