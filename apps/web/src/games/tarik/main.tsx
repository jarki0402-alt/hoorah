/**
 * Tarik Tambang entry: connect to the shell, rasterize art, start Phaser (canvas 1.5x the stage,
 * camera zoom 1.5 over a 1280x720 world plus side wings) under a Preact HUD, then hand control to
 * the director.
 */
import { connect, type HoorahGame } from '@hoorah/sdk';
import * as Phaser from 'phaser';
import { fontsReady, mountStage } from '../common/stage';
import './hud.css';
import { Director } from './director';
import { Hud } from './hud';
import { TarikReplica } from './replica';
import { TarikScene } from './scene';
import { STR } from './strings';
import { loadTextures, RENDER_SCALE } from './textures';

function layer(stage: HTMLElement, className: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  el.style.cssText = 'position:absolute;inset:0';
  stage.appendChild(el);
  return el;
}

function showError(stage: HTMLElement): void {
  const el = layer(stage, 'display');
  el.style.cssText += ';display:flex;align-items:center;justify-content:center;font-size:40px;color:#FFC928';
  el.textContent = STR.loadError;
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;
  const { stage, width: stageWidth, height: stageHeight, onResize } = mountStage(root);
  // Start the slow work while the shell handshake runs.
  const textures = loadTextures();
  const fonts = fontsReady();
  let game: HoorahGame;
  try {
    game = await connect();
  } catch {
    showError(stage);
    return;
  }
  const images = await textures;
  await fonts;

  const world = layer(stage, 'tk-world');
  const hudHost = layer(stage, 'tk-hud-host');
  hudHost.style.pointerEvents = 'none';

  const scene = new TarikScene(images);
  const width = stageWidth() * RENDER_SCALE;
  const height = stageHeight() * RENDER_SCALE;
  const phaser = new Phaser.Game({
    type: Phaser.AUTO,
    parent: world,
    width,
    height,
    backgroundColor: '#9ADBFF',
    banner: false,
    audio: { noAudio: true },
    input: { keyboard: false, mouse: false, touch: false, gamepad: false },
    render: { antialias: true, powerPreference: 'high-performance' },
    // The stage element is already scaled to the window; the canvas keeps a 1.5x backing store
    // and fills the stage (1280x720 on 16:9, wider or taller on other screens).
    scale: { mode: Phaser.Scale.NONE, width, height, zoom: 1 / RENDER_SCALE },
    fps: { target: 60 },
    scene: [scene],
  });
  await scene.ready;
  const hud = new Hud(hudHost);
  const fit = (w: number, h: number) => {
    scene.setViewSize(w, h);
    scene.worldOrigin(hud.origin);
  };
  fit(stageWidth(), stageHeight());
  onResize((h, w) => {
    phaser.scale.resize(w * RENDER_SCALE, h * RENDER_SCALE);
    fit(w, h);
  });

  if (game.isMirror) {
    // Long-distance play: draw the Host's match from its published state, run nothing of our own.
    new TarikReplica(game, scene, hud, phaser).start();
  } else {
    new Director(game, scene, hud, phaser).start();
  }
  // Let the first frame paint before the shell removes its loading screen.
  await nextFrame();
  await nextFrame();
  game.ready();
  // The Host's music reaches a far-away screen through the shell.
  if (!game.isMirror) game.music('tarik');
}

void boot();
