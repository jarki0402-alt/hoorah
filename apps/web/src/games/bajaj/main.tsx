/**
 * Bajaj Rush bootstrap. Normal mode connects to the Hoorah shell and opens the pre-race menus.
 * `?poster=1` renders a hero shot for the home screen key art; `?demo=N` runs offline with N
 * simulated players (`&mode=gp|duel|arena|time&map=kota|pantai|puncak`, or `&menu=1` to stay in
 * the menus) for layout and performance testing.
 *
 * Graphics: the device profile (common/gfx.ts, `?gfx=low|medium|high` forces a level) picks the
 * starting settings (quality.ts); the quality ladder steps down while racing. Debug pins: `?q=0..3`
 * shadow tier, `?k=` pixel ratio, `?aa=0|1` MSAA.
 */
import { FRUITS, PLAYER_COLORS, type PlayerInfo } from '@hoorah/protocol';
import { connect, type GameResult } from '@hoorah/sdk';
import { render } from 'preact';
import * as THREE from 'three';
import { ensureGfxProfile, type GfxTier } from '../common/gfx';
import { fontsReady, mountStage } from '../common/stage';
import { BajajDriver, type GameLike, parseLaps } from './driver';
import { Hud, HudStore } from './hud';
import { MODES, type Mode, Race, type RacerSetup } from './logic';
import { MapLibrary } from './maps';
import { CIRCUITS, type CircuitId } from './maps/types';
import { LEVELS, QualityLadder, type Rung, readOverrides, startRatio } from './quality';
import { RaceView } from './raceview';
import { RaceRenderer } from './scene';
import { STR } from './strings';
import './bajaj.css';

interface DebugWindow {
  __posterReady?: boolean;
  __bajaj?: {
    fps: number;
    k: number;
    level: GfxTier;
    shadow: number;
    steps: readonly Rung[];
    calls: number;
    tris: number;
    step: string;
    phase: string;
    result: GameResult | null;
  };
  __bajajDriver?: BajajDriver;
  __bajajScene?: THREE.Scene;
}
const dbg = window as unknown as DebugWindow;

/** Offline stand-in for the shell: N players driven by the autopilot. */
class DemoGame implements GameLike {
  readonly allPlayers: PlayerInfo[];
  readonly settings: Record<string, string | number | boolean>;
  readonly paused = false;
  result: GameResult | null = null;

  constructor(n: number, laps: number) {
    const names = ['Rina', 'Budi', 'Sari', 'Joko', 'Dewi', 'Agus', 'Wati', 'Yudi'];
    this.allPlayers = Array.from({ length: n }, (_, i) => ({
      id: i + 1,
      name: names[i]!,
      fruit: FRUITS[i]!,
      color: PLAYER_COLORS[i]!,
      connected: true,
      isHost: i === 0,
    }));
    this.settings = { rounds: laps };
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
  }
}

async function boot(): Promise<void> {
  const root = document.getElementById('app')!;
  const params = new URLSearchParams(window.location.search);
  if (params.get('poster') === '1') {
    await bootPoster(root);
    return;
  }
  const demo = Math.min(8, Math.max(0, Math.floor(Number(params.get('demo') ?? 0))));
  // The GPU test (once per browser) runs while the shell connects; MSAA and materials need it.
  const profileP = ensureGfxProfile();
  let game: GameLike;
  if (demo > 0) {
    game = new DemoGame(demo, parseLaps(params.get('laps') ?? 2));
  } else {
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
  host.className = 'bj-host';
  stage.appendChild(host);
  const hudHost = document.createElement('div');
  stage.appendChild(hudHost);

  const hud = new HudStore();
  const level = (await profileP).tier;
  const pins = readOverrides(params);
  const renderer = new RaceRenderer(host, pins.aa ?? LEVELS[level].msaa, level);
  const maps = new MapLibrary();
  const driver = new BajajDriver(game, hud, renderer, maps);

  const ratio = () => startRatio(level, scale(), width(), window.devicePixelRatio);
  let k = pins.k ?? ratio();
  renderer.setSize(width(), height(), k);
  driver.setStageSize(width(), height());
  onResize((h, w) => {
    renderer.setSize(w, h, k);
    driver.setStageSize(w, h);
  });
  window.addEventListener('resize', () => {
    if (pins.k === null) k = Math.min(k, ratio());
    renderer.setSize(width(), height(), k);
  });
  const ladder = new QualityLadder(level, {
    shadows: renderer.rig,
    ratio: () => k,
    setRatio: (v) => {
      k = v;
      renderer.setSize(width(), height(), k);
    },
    ratioPinned: pins.k !== null,
  });
  driver.pacer = ladder.pacer;
  let views = 0;
  driver.onFrame = (now) => {
    // A new split (players joined or left) builds shadow maps and compiles: judge it later.
    if (renderer.viewports.length !== views) {
      views = renderer.viewports.length;
      ladder.hold(now, 3000);
    }
    ladder.frame(now, driver.racing);
  };
  driver.onFps = (fps) => {
    ladder.second(performance.now(), fps);
    const info = renderer.renderer.info;
    dbg.__bajaj = {
      fps: Math.round(fps * 10) / 10,
      k,
      level,
      shadow: renderer.rig.tier,
      steps: ladder.steps,
      calls: info.render.calls,
      tris: info.render.triangles,
      step: driver.step,
      phase: driver.race?.phase ?? '-',
      result: game instanceof DemoGame ? game.result : null,
    };
  };

  render(<Hud store={hud} />, hudHost);
  driver.start();
  game.ready();
  // Read-only debug handles for the screenshot and soak scripts (state lives in this iframe only).
  dbg.__bajajDriver = driver;
  dbg.__bajajScene = renderer.scene;

  if (demo > 0) {
    const mode = params.get('mode') as Mode | null;
    const map = params.get('map') as CircuitId | null;
    if (mode && MODES.includes(mode)) driver.mode = mode;
    if (map && CIRCUITS.includes(map)) driver.circuit = map;
    if (params.get('menu') === 'map') driver.debugStep('map');
    else if (params.get('menu') === 'kart') driver.debugStep('kart');
    else if (!params.has('menu')) {
      driver.debugStep('race');
      for (const kart of driver.race?.karts ?? []) kart.autopilot = true;
    }
  }
}

/* ------------------------------------------------------------------ poster */

async function bootPoster(root: HTMLElement): Promise<void> {
  const { stage, width, height } = mountStage(root);
  await fontsReady();
  const host = document.createElement('div');
  host.className = 'bj-host';
  stage.appendChild(host);
  const looks: [string, (typeof FRUITS)[number]][] = [
    ['#FF8A3D', 'jeruk'],
    ['#2F8CFF', 'semangka'],
    ['#22B35E', 'durian'],
    ['#F2453D', 'stroberi'],
  ];
  const racers: RacerSetup[] = looks.map(([color, fruit], i) => ({
    id: i + 1,
    human: true,
    name: '',
    color,
    fruit,
  }));
  const params = new URLSearchParams(window.location.search);
  const circuit = (params.get('map') as CircuitId | null) ?? 'kota';
  const race = new Race({ mode: 'gp', laps: 3, racers, circuit, seed: 5 });
  race.phase = 'race';
  const T = race.track!;
  // Default hero shot: the pack charging over the flyover deck, open sky top-left for the logo.
  const base = params.has('pb') ? Number(params.get('pb')) : (T.marks.flyover?.top1 ?? 120) - 7.7;
  // [s offset, lateral, extra heading, steer]
  const spots: [number, number, number, number][] = [
    [0, 2.0, 0.42, -1],
    [-6, -3.6, 0, 0.2],
    [-11, 4.6, -0.12, 1],
    [-17, 0.2, 0, 0],
  ];
  race.karts.forEach((kart, i) => {
    const [ds, d, dh, steer] = spots[i]!;
    const s = base + ds;
    const p = T.point(s, d);
    kart.x = kart.prevX = p.x;
    kart.z = kart.prevZ = p.z;
    kart.y = kart.prevY = p.y;
    kart.h = kart.prevH = T.headingAt(s) + dh;
    kart.s = s;
    kart.speed = 24;
    kart.gas = true;
    kart.steer = steer;
  });
  race.karts[1]!.boostT = 99;
  race.karts[3]!.shield = true;

  const renderer = new RaceRenderer(host);
  renderer.setSize(width(), height(), 1.5);
  const map = new MapLibrary().get(circuit);
  renderer.setMap(map);
  const view = new RaceView(renderer, race, map);
  renderer.setContent(view);
  const camS = Number(params.get('cs') ?? base + 7);
  const camD = Number(params.get('cd') ?? -0.5);
  const cp = T.point(camS, camD);
  const lookS = Number(params.get('ls') ?? base - 16);
  const lp = T.point(lookS, Number(params.get('ld') ?? 1.5));
  if (params.has('ka')) {
    // Model inspection: orbit kart 0 at angle `ka` (deg, 0 = behind), distance `kd`.
    const lead = race.karts[0]!;
    const a = lead.h + Math.PI + (Number(params.get('ka')) * Math.PI) / 180;
    const dist = Number(params.get('kd') ?? 5);
    cp.x = lead.x + Math.sin(a) * dist;
    cp.z = lead.z + Math.cos(a) * dist;
    cp.y = lead.y;
    lp.x = lead.x;
    lp.z = lead.z;
    lp.y = lead.y;
  }
  renderer.setLayout([
    {
      x: 0,
      y: 0,
      w: width(),
      h: height(),
      kind: 'free',
      kart: 0,
      free: {
        pos: new THREE.Vector3(cp.x, cp.y + Number(params.get('ch') ?? 0.85), cp.z),
        look: new THREE.Vector3(lp.x, lp.y + Number(params.get('lh') ?? 2.7), lp.z),
        fov: Number(params.get('fov') ?? 44),
      },
    },
  ]);
  let n = 0;
  const tick = () => {
    renderer.render(1, 1 / 60);
    if (++n < 75) requestAnimationFrame(tick);
    else dbg.__posterReady = true;
  };
  requestAnimationFrame(tick);
}

void boot();
