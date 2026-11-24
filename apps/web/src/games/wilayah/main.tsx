/**
 * Rebut Wilayah entry: connect to the shell, then stack three layers: the
 * ground canvas (courtyard, floor and smooth territories, drawn on demand), a transparent Phaser
 * canvas (trails, markers, effects; 1.5x the stage, camera zoom 1.5 over the 1280x720 world) and
 * the Preact HUD. Then hand control to the director.
 */
import { connect, type HoorahGame } from '@hoorah/sdk';
import * as Phaser from 'phaser';
import { fontsReady, mountStage } from '../common/stage';
import './hud.css';
import { Director } from './director';
import { Hud } from './hud';
import { WilayahScene } from './scene';
import { STR } from './strings';
import { RENDER_SCALE } from './textures';

function layer(stage: HTMLElement, className: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  el.style.cssText = 'position:absolute;inset:0';
  stage.appendChild(el);
  return el;
}

function showError(stage: HTMLElement): void {
  const el = layer(stage, 'wl-error');
  el.style.cssText += ';display:flex;align-items:center;justify-content:center;font-size:40px;color:#FFC928';
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

  const groundHost = layer(stage, 'wl-ground');
  const world = layer(stage, 'wl-world');
  const hudHost = layer(stage, 'wl-hud-host');
  hudHost.style.pointerEvents = 'none';

  const scene = new WilayahScene(groundHost);
  const width = stageWidth() * RENDER_SCALE;
  const height = stageHeight() * RENDER_SCALE;
  const phaser = new Phaser.Game({
    type: Phaser.AUTO,
    parent: world,
    width,
    height,
    // The ground layer below shows through.
    transparent: true,
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
    const o = scene.worldOrigin({ x: 0, y: 0 });
    hud.setOrigin(o.x, o.y);
  };
  fit(stageWidth(), stageHeight());
  onResize((h, w) => {
    phaser.scale.resize(w * RENDER_SCALE, h * RENDER_SCALE);
    fit(w, h);
  });

  new Director(game, scene, hud, phaser).start();
  // Let the first frame paint before the shell removes its loading screen.
  await nextFrame();
  await nextFrame();
  game.ready();
}

void boot();
