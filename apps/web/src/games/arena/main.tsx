/**
 * Ular Arena entry: connect to the shell, start Phaser (canvas 1.5x the stage) under a Preact HUD,
 * then hand control to the driver (or, on a far-away screen in long-distance play, to the replica
 * that draws the Host's match). Player heads are rasterized by the scene as looks show up.
 */
import { connect, type HoorahGame } from '@hoorah/sdk';
import * as Phaser from 'phaser';
import { fontsReady, mountStage } from '../common/stage';
import './arena.css';
import { Driver } from './driver';
import { Hud } from './hud';
import { boxAspect } from './layout';
import { parseRounds } from './logic';
import { ArenaReplica } from './replica';
import { ArenaScene } from './scene';
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
  // Start the slow work while the shell handshake runs.
  const fonts = fontsReady();
  let game: HoorahGame;
  try {
    game = await connect();
  } catch {
    showError(stage);
    return;
  }
  await fonts;

  const world = layer(stage, 'ua-world');
  const hudHost = layer(stage, 'ua-hud-host');

  const scene = new ArenaScene();
  const width = stageWidth() * RENDER_SCALE;
  const height = stageHeight() * RENDER_SCALE;
  const phaser = new Phaser.Game({
    type: Phaser.AUTO,
    parent: world,
    width,
    height,
    backgroundColor: '#0A1A14',
    banner: false,
    audio: { noAudio: true },
    input: { keyboard: false, mouse: false, touch: false, gamepad: false },
    render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' },
    // The stage element is already scaled to the window; the canvas keeps a 1.5x backing store.
    scale: { mode: Phaser.Scale.NONE, width, height, zoom: 1 / RENDER_SCALE },
    fps: { target: 60 },
    scene: [scene],
  });
  await scene.ready;
  const hud = new Hud(hudHost);
  // Long-distance play: a far-away screen draws the Host's match from its published state and
  // runs nothing of its own.
  const control = game.isMirror
    ? new ArenaReplica(game, scene, hud, phaser)
    : new Driver(
        game,
        scene,
        hud,
        phaser,
        parseRounds(game.settings.rounds) * 60_000,
        boxAspect(stageWidth(), stageHeight()),
      );
  const fit = (w: number, h: number) => {
    scene.setViewSize(w, h);
    control.setStage(w, h);
  };
  fit(stageWidth(), stageHeight());
  onResize((h, w) => {
    phaser.scale.resize(w * RENDER_SCALE, h * RENDER_SCALE);
    fit(w, h);
  });
  if (control instanceof Driver) await scene.attach(control.match);
  control.start();
  // Let the first frame paint before the shell removes its loading screen.
  await nextFrame();
  await nextFrame();
  game.ready();
}

void boot();
