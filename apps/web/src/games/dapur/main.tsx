/**
 * Dapur Heboh entry: connect to the shell, rasterize the art, then stack the Phaser kitchen and
 * the Preact HUD on the stage and hand control to the director (or, on a far-away screen in
 * long-distance play, to the replica that draws the Host's kitchen).
 */
import { connect, type HoorahGame } from '@hoorah/sdk';
import * as Phaser from 'phaser';
import { fontsReady, mountStage } from '../common/stage';
import './hud.css';
import { Director } from './director';
import { Hud } from './hud';
import { DapurReplica } from './replica';
import { DapurScene } from './scene';
import { STR } from './strings';
import {
  loadCommonTextures,
  lowerRenderScale,
  pickResolution,
  RENDER_SCALE,
  updateRenderScale,
} from './textures';

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

/** Frame rate below which the kitchen counts as stuttering, and for how long before stepping down. */
const SLOW_FPS = 40;
const SLOW_SECONDS = 4;
const GRACE_SECONDS = 2;

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
  pickResolution();
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
  // The canvas follows the device pixels the stage covers, so it is re-sized both when the stage
  // shape changes and when only its scale does (entering fullscreen, moving to another monitor).
  const applySize = () => {
    phaser.scale.setZoom(1 / RENDER_SCALE);
    phaser.scale.resize(stageWidth() * RENDER_SCALE, stageHeight() * RENDER_SCALE);
    fit(stageWidth(), stageHeight());
  };
  onResize(() => {
    updateRenderScale();
    applySize();
  });
  window.addEventListener('resize', () => {
    if (updateRenderScale()) applySize();
  });
  // Every second: follow the shell's scale, then the safety net: a device that stays below SLOW_FPS
  // for SLOW_SECONDS in a row drops one sharpness step and gets a short grace period to settle.
  // Hidden tabs do not count.
  let slow = 0;
  window.setInterval(() => {
    if (document.hidden) {
      slow = 0;
      return;
    }
    // The shell can rescale the game without resizing its iframe (fullscreen, window drag):
    // follow it here, since no resize event reaches this page then.
    if (updateRenderScale()) applySize();
    slow = phaser.loop.actualFps < SLOW_FPS ? slow + 1 : Math.min(slow, 0);
    if (slow >= SLOW_SECONDS && lowerRenderScale()) {
      slow = -GRACE_SECONDS;
      applySize();
    }
  }, 1000);

  if (game.isMirror) {
    // Long-distance play: draw the Host's kitchen from its published state, run nothing of our own.
    new DapurReplica(game, scene, hud, phaser).start();
  } else {
    new Director(game, scene, hud, phaser).start();
  }
  await nextFrame();
  await nextFrame();
  game.ready();
}

void boot();
