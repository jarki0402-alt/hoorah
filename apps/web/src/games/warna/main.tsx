/**
 * Petualangan Warna entry: connect to the shell, start Phaser (canvas 1.5x the stage) under a
 * Preact HUD, then hand control to the driver. The scene rasterizes player faces as looks show up.
 */
import { connect, type HoorahGame } from '@hoorah/sdk';
import * as Phaser from 'phaser';
import { fontsReady, mountStage } from '../common/stage';
import './warna.css';
import { Driver } from './driver';
import { Hud } from './hud';
import { WarnaScene } from './scene';
import { STR } from './strings';
import { RENDER_SCALE } from './textures';

function layer(stage: HTMLElement, className: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  stage.appendChild(el);
  return el;
}

function showError(stage: HTMLElement): void {
  const el = layer(stage, 'display');
  el.style.cssText =
    'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:40px;color:#FFC928';
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
  await fonts;

  const world = layer(stage, 'wa-world');
  const hudHost = layer(stage, 'wa-hud-host');
  const scene = new WarnaScene();
  const width = stageWidth() * RENDER_SCALE;
  const height = stageHeight() * RENDER_SCALE;
  const phaser = new Phaser.Game({
    type: Phaser.AUTO,
    parent: world,
    width,
    height,
    backgroundColor: '#0B1F26',
    banner: false,
    audio: { noAudio: true },
    input: { keyboard: false, mouse: false, touch: false, gamepad: false },
    render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' },
    scale: { mode: Phaser.Scale.NONE, width, height, zoom: 1 / RENDER_SCALE },
    fps: { target: 60 },
    scene: [scene],
  });
  await scene.ready;
  const hud = new Hud(hudHost);
  const driver = new Driver(game, scene, hud, phaser);
  scene.setViewSize(stageWidth(), stageHeight());
  onResize((h, w) => {
    phaser.scale.resize(w * RENDER_SCALE, h * RENDER_SCALE);
    scene.setViewSize(w, h);
  });
  driver.start();
  await nextFrame();
  await nextFrame();
  game.ready();
}

void boot();
