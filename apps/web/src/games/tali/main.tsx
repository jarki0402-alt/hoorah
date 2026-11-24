/**
 * Satu Tali bootstrap. Normal mode connects to the Hoorah shell. `?demo=N` runs offline with N
 * idle climbers on `?route=senja|bambu|salju` (layout and performance checks, no phones needed);
 * `?pick=1` shows the route picker instead.
 *
 * Graphics: the shared device profile (common/gfx.ts, `?gfx=low|medium|high` forces a level)
 * picks MSAA, shadows and pixel ratio; the quality ladder steps down while climbing if frames run
 * slow. Debug pins: `?q=0..3` shadow tier, `?k=` pixel ratio.
 *
 * Long-distance play: the Host's screen publishes its display state (director.ts); a far-away
 * mirror screen (`game.isMirror`) draws the same climb and HUD from it with `TaliReplica`.
 */
import { FRUITS, lookOfFruit, PLAYER_COLORS, type PlayerInfo } from '@hoorah/protocol';
import { connect, type GameResult, type HoorahGame } from '@hoorah/sdk';
import { render } from 'preact';
import { LEVELS, QualityLadder, readOverrides, startRatio } from '../bajaj/quality';
import { ensureGfxProfile } from '../common/gfx';
import { fontsReady, mountStage } from '../common/stage';
import { isRouteId } from './course';
import { Director, type GameLike } from './director';
import { Hud, HudStore } from './hud';
import { TaliReplica } from './replica';
import { TaliScene } from './scene';
import { STR } from './strings';
import './tali.css';

/** Offline stand-in for the shell: idle climbers (ids 1..n, no phones). */
class DemoGame implements GameLike {
  readonly allPlayers: PlayerInfo[];
  readonly settings = { rounds: 6 };
  readonly paused = false;
  readonly gameId = 'tali';
  result: GameResult | null = null;

  constructor(n: number) {
    const names = ['Rina', 'Budi', 'Sari', 'Joko'];
    this.allPlayers = Array.from({ length: n }, (_, i) => ({
      id: i + 1,
      name: names[i]!,
      fruit: FRUITS[i % FRUITS.length]!,
      look: lookOfFruit(FRUITS[i % FRUITS.length]!),
      color: PLAYER_COLORS[i % PLAYER_COLORS.length]!,
      connected: true,
      isHost: i === 0,
    }));
  }
  get players(): PlayerInfo[] {
    return this.allPlayers;
  }
  player(id: number): PlayerInfo | undefined {
    return this.allPlayers.find((p) => p.id === id);
  }
  on(): () => void {
    return () => {};
  }
  setView(): void {}
  vibrate(): void {}
  sfx(): void {}
  music(): void {}
  musicIntensity(): void {}
  musicHurry(): void {}
  end(result: GameResult): void {
    this.result = result;
  }
}

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;
  const params = new URLSearchParams(window.location.search);
  const profileP = ensureGfxProfile();
  const demo = Math.min(4, Math.max(0, Math.floor(Number(params.get('demo') ?? 0))));
  let game: GameLike & { ready?: () => void };
  let sdk: HoorahGame | null = null;
  if (demo > 0) game = new DemoGame(demo);
  else {
    try {
      sdk = await connect();
      game = sdk;
    } catch {
      root.textContent = STR.noShell;
      return;
    }
  }

  const { stage, width, height, onResize, scale } = mountStage(root);
  await fontsReady();
  const host = document.createElement('div');
  host.className = 'tl-host';
  stage.appendChild(host);
  const tags = document.createElement('div');
  tags.className = 'kt-tags';
  stage.appendChild(tags);
  const hudHost = document.createElement('div');
  stage.appendChild(hudHost);

  const level = (await profileP).tier;
  const pins = readOverrides(params);
  const spec = LEVELS[level];
  let scene: TaliScene;
  try {
    scene = new TaliScene(host, tags, level, pins.aa ?? spec.msaa, pins.shadow ?? spec.shadow);
  } catch {
    root.textContent = STR.loadFailed;
    return;
  }
  const ratio = () => startRatio(level, scale(), width(), window.devicePixelRatio);
  let k = pins.k ?? ratio();
  scene.stage.setSize(width(), height(), k);
  onResize((h, w) => scene.stage.setSize(w, h, k));
  const ladder = new QualityLadder(level, {
    shadows: scene.stage,
    ratio: () => k,
    setRatio: (v) => {
      k = v;
      scene.stage.setSize(width(), height(), k);
    },
    ratioPinned: pins.k !== null,
  });

  const hud = new HudStore();
  render(<Hud store={hud} />, hudHost);
  if (sdk?.isMirror) {
    bootMirror(sdk, scene, hud, ladder);
    return;
  }
  const route = params.get('route');
  const director = new Director(
    game,
    scene,
    hud,
    (now) => ladder.pacer.due(now),
    demo > 0 && params.get('pick') !== '1' ? (isRouteId(route) ? route : 'senja') : null,
  );
  director.onFrame = (now, running) => ladder.frame(now, running);
  director.onFps = (fps) => ladder.second(performance.now(), fps);
  if (sdk) {
    const link = sdk;
    director.mirror = { active: () => link.mirrored, now: () => link.now(), send: (s) => link.publish(s) };
    link.on('mirrors', (on) => {
      if (on) director.publishNow();
    });
  }
  director.start();
  scene.stage.warmUp();
  game.ready?.();
}

/** Far-away screen: the climb and HUD posed from the Host's published states (no rules, no phones). */
function bootMirror(game: HoorahGame, scene: TaliScene, hud: HudStore, ladder: QualityLadder): void {
  const replica = new TaliReplica(scene, hud);
  game.on('mirror', (state) => replica.push(state, game.now()));
  game.on('pause', (paused) => replica.setLocalPause(paused));
  replica.setLocalPause(game.paused);
  let last = -1;
  let frames = 0;
  let fpsAt = 0;
  const loop = (now: number): void => {
    requestAnimationFrame(loop);
    if (!ladder.pacer.due(now)) return;
    const dt = last < 0 ? 0 : Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    replica.frame(game.now(), dt);
    ladder.frame(now, replica.running);
    frames++;
    if (now - fpsAt >= 1000) {
      ladder.second(performance.now(), (frames * 1000) / (now - fpsAt));
      frames = 0;
      fpsAt = now;
    }
  };
  requestAnimationFrame(loop);
  scene.stage.warmUp();
  game.ready();
}

void boot();
