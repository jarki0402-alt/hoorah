/**
 * Bom Oper bootstrap. Normal mode connects to the Hoorah shell. `?demo=N` runs offline with N
 * computer runners in `?arena=halaman|pasar|atap` (layout and performance checks, no phones needed);
 * `?pick=1` shows the arena picker instead.
 *
 * Graphics: the shared device profile (common/gfx.ts, `?gfx=low|medium|high` forces a level)
 * picks MSAA, shadows and pixel ratio; the quality ladder steps down while chasing if frames run
 * slow. Debug pins: `?q=0..3` shadow tier, `?k=` pixel ratio.
 */
import { FRUITS, PLAYER_COLORS, type PlayerInfo } from '@hoorah/protocol';
import { connect, type GameResult } from '@hoorah/sdk';
import { render } from 'preact';
import { LEVELS, QualityLadder, readOverrides, startRatio } from '../bajaj/quality';
import { ensureGfxProfile } from '../common/gfx';
import { fontsReady, mountStage } from '../common/stage';
import { isArenaId } from './arena';
import { Director, type GameLike } from './director';
import { Hud, HudStore } from './hud';
import { BomScene } from './scene';
import { STR } from './strings';
import './bom.css';

/** Offline stand-in for the shell: every runner is a computer (negative ids, no phones). */
class DemoGame implements GameLike {
  readonly allPlayers: PlayerInfo[];
  readonly settings = { rounds: 5 };
  readonly paused = false;
  readonly gameId = 'bom';
  result: GameResult | null = null;

  constructor(n: number) {
    const names = ['Rina', 'Budi', 'Sari', 'Joko', 'Dewi', 'Agus', 'Wati', 'Yudi'];
    this.allPlayers = Array.from({ length: n }, (_, i) => ({
      id: -(i + 1),
      name: names[i]!,
      fruit: FRUITS[i % FRUITS.length]!,
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
  const asked = Math.floor(Number(params.get('demo') ?? 0));
  const demo = asked > 0 ? Math.min(8, Math.max(2, asked)) : 0;
  let game: GameLike & { ready?: () => void };
  if (demo > 0) game = new DemoGame(demo);
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
  host.className = 'bo-host';
  stage.appendChild(host);
  const tags = document.createElement('div');
  tags.className = 'kt-tags';
  stage.appendChild(tags);
  const hudHost = document.createElement('div');
  stage.appendChild(hudHost);

  const level = (await profileP).tier;
  const pins = readOverrides(params);
  const spec = LEVELS[level];
  let scene: BomScene;
  try {
    scene = new BomScene(host, tags, level, pins.aa ?? spec.msaa, pins.shadow ?? spec.shadow);
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
  const arena = params.get('arena');
  const director = new Director(
    game,
    scene,
    hud,
    (now) => ladder.pacer.due(now),
    demo > 0 && params.get('pick') !== '1' ? (isArenaId(arena) ? arena : 'halaman') : null,
  );
  director.onFrame = (now, running) => ladder.frame(now, running);
  director.onFps = (fps) => ladder.second(performance.now(), fps);
  director.start();
  scene.stage.warmUp();
  game.ready?.();
}

void boot();
