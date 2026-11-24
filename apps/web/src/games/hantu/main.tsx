/**
 * Hantu Tak Terlihat entry: connect to the shell, start Phaser (canvas 1.5x the stage) under a
 * Preact HUD, then hand control to the driver (or, on a far-away screen in long-distance play, to
 * the replica that draws the Host's house). The scene rasterizes player faces as looks show up.
 */
import { connect, type HoorahGame } from '@hoorah/sdk';
import * as Phaser from 'phaser';
import { fontsReady, mountStage } from '../common/stage';
import './hantu.css';
import { Driver } from './driver';
import { Hud } from './hud';
import { HantuReplica } from './replica';
import { HantuScene } from './scene';
import { STR } from './strings';
import { RENDER_SCALE } from './textures';

/** Rounds when the shell does not say (`settings.rounds`). */
const DEFAULT_ROUNDS = 2;

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

function roundsFrom(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.min(8, Math.floor(n)) : DEFAULT_ROUNDS;
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

  const world = layer(stage, 'ht-world');
  const hudHost = layer(stage, 'ht-hud-host');
  const scene = new HantuScene();
  const width = stageWidth() * RENDER_SCALE;
  const height = stageHeight() * RENDER_SCALE;
  const phaser = new Phaser.Game({
    type: Phaser.AUTO,
    parent: world,
    width,
    height,
    backgroundColor: '#050608',
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
  scene.setViewSize(stageWidth(), stageHeight());
  onResize((h, w) => {
    phaser.scale.resize(w * RENDER_SCALE, h * RENDER_SCALE);
    scene.setViewSize(w, h);
  });
  if (game.isMirror) {
    // Long-distance play: draw the Host's house from its published state, run nothing of our own.
    new HantuReplica(game, scene, hud, phaser).start();
  } else {
    new Driver(game, scene, hud, phaser, roundsFrom(game.settings.rounds)).start();
  }
  await nextFrame();
  await nextFrame();
  game.ready();
}

void boot();
