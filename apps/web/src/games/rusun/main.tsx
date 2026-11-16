/** Rusun bootstrap: connect to the shell, build textures, start Phaser + the DOM HUD. */
import { connect, type HoorahGame } from '@hoorah/sdk';
import * as Phaser from 'phaser';
import { render } from 'preact';
import { fontsReady, mountStage } from '../common/stage';
import { RusunDriver } from './driver';
import { Hud, HudStore } from './hud';
import { RusunScene } from './scene';
import { STR } from './strings';
import { preloadTextures, TEX_SCALE } from './textures';
import './rusun.css';

async function boot(): Promise<void> {
  const root = document.getElementById('app')!;
  let game: HoorahGame;
  try {
    game = await connect();
  } catch {
    root.textContent = STR.noShell;
    return;
  }

  const { stage, width, height, onResize } = mountStage(root);
  const [images] = await Promise.all([preloadTextures(), fontsReady()]);

  const canvasHost = document.createElement('div');
  canvasHost.className = 'rs-canvas';
  stage.appendChild(canvasHost);
  const hudHost = document.createElement('div');
  stage.appendChild(hudHost);

  const scene = new RusunScene(images);
  const phaser = new Phaser.Game({
    type: Phaser.AUTO,
    parent: canvasHost,
    width: width() * TEX_SCALE,
    height: height() * TEX_SCALE,
    backgroundColor: '#79C6F2',
    // The stage is already scaled to the viewport with a CSS transform, so Phaser must not
    // measure its parent (that would double-scale). Backing store is 1.5x the stage size.
    scale: { mode: Phaser.Scale.NONE, zoom: 1 / TEX_SCALE },
    render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' },
    audio: { noAudio: true },
    input: { keyboard: false, mouse: false, touch: false, gamepad: false },
    banner: false,
    fps: { target: 60 },
    scene,
  });
  await scene.ready;
  const hud = new HudStore();
  render(<Hud store={hud} />, hudHost);
  const driver = new RusunDriver(game, hud);
  const fit = (w: number, h: number) => {
    scene.setViewSize(w, h);
    driver.setStage(w);
    hud.setOrigin(Math.max(0, (w - 1280) / 2), Math.max(0, h - 720));
  };
  fit(width(), height());
  onResize((h, w) => {
    phaser.scale.resize(w * TEX_SCALE, h * TEX_SCALE);
    fit(w, h);
  });
  driver.onPause = (paused) => {
    if (paused) phaser.scene.pause('rusun');
    else phaser.scene.resume('rusun');
  };
  driver.start();
  scene.attach(driver);

  game.ready();
  game.music('rusun');
}

void boot();
