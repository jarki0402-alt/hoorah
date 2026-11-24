/**
 * Nyebrang entry: connect to the shell, start Phaser (pixel art, canvas 1.5x the stage) under the
 * DOM HUD, then hand control to the driver (or, on a far-away mirror screen, to the replica). The
 * scene rasterizes pixel avatars as looks show up.
 */
import { connect, type HoorahGame } from '@hoorah/sdk';
import * as Phaser from 'phaser';
import { fontsReady, mountStage } from '../common/stage';
import { Driver } from './driver';
import { Hud } from './hud';
import { parseRounds } from './logic';
import { NyebrangReplica } from './replica';
import { NyebrangScene, RENDER_SCALE } from './scene';
import { STR } from './strings';
import './nyebrang.css';

function layer(stage: HTMLElement, className: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  stage.appendChild(el);
  return el;
}

function showError(stage: HTMLElement): void {
  const el = layer(stage, 'display');
  el.style.cssText =
    'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:36px;color:#FFC928;text-align:center;padding:40px';
  el.textContent = STR.loadError;
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] ?? Date.now();
}

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

  const world = layer(stage, 'nb-world');
  const hudHost = layer(stage, 'nb-hud');
  const scene = new NyebrangScene();
  const width = stageWidth() * RENDER_SCALE;
  const height = stageHeight() * RENDER_SCALE;
  const phaser = new Phaser.Game({
    type: Phaser.AUTO,
    parent: world,
    width,
    height,
    backgroundColor: '#2B1D14',
    banner: false,
    pixelArt: true,
    audio: { noAudio: true },
    input: { keyboard: false, mouse: false, touch: false, gamepad: false },
    render: { antialias: false, roundPixels: true, powerPreference: 'high-performance' },
    scale: { mode: Phaser.Scale.NONE, width, height, zoom: 1 / RENDER_SCALE },
    fps: { target: 60 },
    scene: [scene],
  });
  await scene.ready;
  scene.setViewSize(stageWidth(), stageHeight());
  const hud = new Hud(hudHost);
  onResize((h, w) => {
    phaser.scale.resize(w * RENDER_SCALE, h * RENDER_SCALE);
    scene.setViewSize(w, h);
  });
  if (game.isMirror) {
    // Long-distance play: draw the Host's crossing from its published state, run nothing of our own.
    new NyebrangReplica(game, scene, hud, phaser).start();
  } else {
    const driver = new Driver(game, scene, hud, phaser, parseRounds(game.settings.rounds), randomSeed());
    if (import.meta.env.DEV) (window as unknown as { __nyebrang?: Driver }).__nyebrang = driver;
    driver.start();
  }
  // Let the first frame paint before the shell removes its loading screen.
  await nextFrame();
  await nextFrame();
  game.ready();
}

void boot();
