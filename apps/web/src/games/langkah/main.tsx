/**
 * Langkah Maut bootstrap. Normal mode connects to the Hoorah shell. `?demo=N` runs offline with
 * N computer walkers (layout and performance checks on any screen, no phones needed); the demo
 * starts at once with Acak, or with one babak via `?babak=laser` (`?setup=1`: stay on the menu).
 *
 * Graphics: the shared device profile (common/gfx.ts, `?gfx=low|medium|high` forces a level)
 * picks MSAA, shadows and pixel ratio (bajaj/quality.ts levels); the quality ladder steps down
 * while a babak plays if frames run slow. Debug pins: `?q=0..3` shadow tier, `?k=` pixel ratio.
 */
import { FRUITS, PLAYER_COLORS, type PlayerInfo } from '@hoorah/protocol';
import { connect, type GameResult } from '@hoorah/sdk';
import { render } from 'preact';
import { LEVELS, QualityLadder, readOverrides, startRatio } from '../bajaj/quality';
import { ensureGfxProfile } from '../common/gfx';
import { fontsReady, mountStage } from '../common/stage';
import '../../shared/kotak/render/kotak.css';
import { Director, type GameLike, lineup } from './director';
import './langkah.css';
import { Hud, HudStore } from './hud';
import { LangkahMatch } from './logic';
import { LangkahScene } from './scene';
import { STR } from './strings';

/** Offline stand-in for the shell: every walker is a computer (negative ids, no phones). */
class DemoGame implements GameLike {
  readonly allPlayers: PlayerInfo[];
  readonly settings = { rounds: 4 };
  readonly paused = false;
  readonly gameId = 'langkah';
  result: GameResult | null = null;

  constructor(n: number) {
    const names = [
      'Rina',
      'Budi',
      'Sari',
      'Joko',
      'Dewi',
      'Agus',
      'Wati',
      'Yudi',
      'Tini',
      'Eko',
      'Lina',
      'Bayu',
      'Nur',
      'Dani',
      'Fitri',
      'Hadi',
    ];
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
  player(): PlayerInfo | undefined {
    return undefined;
  }
  on(): () => void {
    return () => {};
  }
  now(): number {
    return Date.now();
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
  const demo = Math.min(16, Math.max(0, Math.floor(Number(params.get('demo') ?? 0))));
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
  host.className = 'lm-host';
  stage.appendChild(host);
  const tags = document.createElement('div');
  tags.className = 'kt-tags';
  stage.appendChild(tags);
  const hudHost = document.createElement('div');
  stage.appendChild(hudHost);

  const { seats, cpus } = lineup(game);
  const rounds = Number(game.settings.rounds);
  const match = new LangkahMatch({
    players: seats,
    rounds: Number.isFinite(rounds) && rounds > 0 ? rounds : 4,
    seed: Math.floor(Math.random() * 0x7fffffff),
    skill: Director.skill(game),
  });

  const level = (await profileP).tier;
  const pins = readOverrides(params);
  const spec = LEVELS[level];
  let scene: LangkahScene;
  try {
    scene = new LangkahScene(host, tags, level, pins.aa ?? spec.msaa, pins.shadow ?? spec.shadow, match);
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
  const director = new Director(game, match, cpus, scene, hud, (now) => ladder.pacer.due(now));
  director.onFrame = (now, running) => ladder.frame(now, running);
  director.onFps = (fps) => ladder.second(performance.now(), fps);
  director.start();
  // `?setup=1` keeps the demo on the Host's babak menu (layout checks).
  if (demo > 0 && params.get('setup') !== '1') {
    match.choose(params.get('babak') ?? 'acak');
    match.start();
  }
  scene.stage.warmUp();
  game.ready?.();
}

void boot();
