/**
 * Dapur Heboh entry: connect to the shell, rasterize the art, then stack the Phaser kitchen and
 * the Preact HUD on the stage and hand control to the director.
 */
import { connect, type HoorahGame } from '@hoorah/sdk';
import * as Phaser from 'phaser';
import { fontsReady, mountStage } from '../common/stage';
import './hud.css';
import { Director } from './director';
import { Hud } from './hud';
import { DapurScene } from './scene';
import { STR } from './strings';
import { loadCommonTextures, RENDER_SCALE } from './textures';

function layer(stage: HTMLElement, className: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  el.style.cssText = 'position:absolute;inset:0';
  stage.appendChild(el);
  return el;
}

function showError(stage: HTMLElement): void {
  const el = layer(stage, 'dp-error');
  el.textContent = STR.loadError;
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;
  const { stage, width: stageWidth, height: stageHeight, onResize } = mountStage(root);
  const fonts = fontsReady();
  let game: HoorahGame;
  try {
    game = await connect();
  } catch {
    showError(stage);
    return;
  }
  // Labels are drawn with the brand font, so wait for it before rasterizing.
  await fonts;
  let textures: Map<string, HTMLCanvasElement>;
  try {
    textures = await loadCommonTextures();
  } catch {
    showError(stage);
    return;
  }

  const world = layer(stage, 'dp-world');
  const hudHost = layer(stage, 'dp-hud-host');
  hudHost.style.pointerEvents = 'none';

  const scene = new DapurScene(textures);
  const width = stageWidth() * RENDER_SCALE;
  const height = stageHeight() * RENDER_SCALE;
  const phaser = new Phaser.Game({
    type: Phaser.AUTO,
    parent: world,
    width,
    height,
    backgroundColor: '#111214',
    banner: false,
    audio: { noAudio: true },
    input: { keyboard: false, mouse: false, touch: false, gamepad: false },
    render: { antialias: true, powerPreference: 'high-performance' },
    scale: { mode: Phaser.Scale.NONE, width, height, zoom: 1 / RENDER_SCALE },
    fps: { target: 60 },
    scene: [scene],
  });
  await scene.ready;
  const hud = new Hud(hudHost);
  const fit = (w: number, h: number) => {
    scene.setViewSize(w, h);
    const o = scene.worldOrigin({ x: 0, y: 0 });
    hud.setOrigin(o.x, o.y);
  };
  fit(stageWidth(), stageHeight());
  onResize((h, w) => {
    phaser.scale.resize(w * RENDER_SCALE, h * RENDER_SCALE);
    fit(w, h);
  });

  new Director(game, scene, hud, phaser).start();
  await nextFrame();
  await nextFrame();
  game.ready();
}

void boot();
