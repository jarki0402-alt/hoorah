import '@fontsource/baloo-2/latin-700.css';
import '@fontsource/baloo-2/latin-800.css';
import '@fontsource/plus-jakarta-sans/latin-400.css';
import '@fontsource/plus-jakarta-sans/latin-600.css';
import '@fontsource/plus-jakarta-sans/latin-700.css';
import '@fontsource/plus-jakarta-sans/latin-800.css';
import '../../shared/base.css';
import './stage.css';

export const STAGE_W = 1280;
export const STAGE_H = 720;

export interface Stage {
  stage: HTMLDivElement;
  scale: () => number;
  /** Stage width in stage px: 1280 on 16:9 and taller, wider on 16:10-in-a-browser, 2:1 and 21:9. */
  width: () => number;
  /** Stage height in stage px: 720 on 16:9 and wider, taller on 16:10 laptops and 4:3 tablets. */
  height: () => number;
  /** Called with the new size whenever it changes (window resize, entering fullscreen). */
  onResize: (fn: (height: number, width: number) => void) => void;
}

/**
 * Every game is authored on a 1280x720 stage scaled to the viewport. The scale keeps the whole
 * 1280x720 core visible; the stage then grows along the spare axis so it fills the screen edge
 * to edge: taller screens add height (games show more sky), wider screens add width (games show
 * more world to the sides). At most one axis grows, so the stage is never smaller than 1280x720.
 * Games keep their key content centred in the stage and pin HUD to its corners.
 */
export function mountStage(root: HTMLElement): Stage {
  document.body.classList.add('game-page');
  const stage = document.createElement('div');
  stage.className = 'game-stage';
  root.appendChild(stage);
  const listeners: ((height: number, width: number) => void)[] = [];
  let current = 1;
  let width = STAGE_W;
  let height = STAGE_H;
  const fit = () => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const s = Math.min(vw / STAGE_W, vh / STAGE_H);
    const w = Math.max(STAGE_W, Math.ceil(vw / s));
    const h = Math.max(STAGE_H, Math.ceil(vh / s));
    current = s;
    stage.style.width = `${w}px`;
    stage.style.height = `${h}px`;
    stage.style.transform = `translate(-50%, -50%) scale(${s})`;
    if (w !== width || h !== height) {
      width = w;
      height = h;
      for (const fn of listeners) fn(h, w);
    }
  };
  fit();
  window.addEventListener('resize', fit);
  return {
    stage,
    scale: () => current,
    width: () => width,
    height: () => height,
    onResize: (fn) => {
      listeners.push(fn);
    },
  };
}

/**
 * Device px per CSS px of this game page, including the main screen's own scaling: the game runs
 * in an iframe inside a stage the shell enlarges with a CSS transform (1280 px base), so a canvas
 * sized from devicePixelRatio alone is stretched, soft and pixelated, on any screen bigger than
 * that base. The iframe is same-origin, so its on-screen box tells the extra factor.
 */
export function deviceScale(): number {
  const dpr =
    Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
  let outer = 1;
  try {
    const frame = window.frameElement;
    const w = frame ? frame.getBoundingClientRect().width : 0;
    if (w > 0 && window.innerWidth > 0) outer = w / window.innerWidth;
  } catch {
    // Not same-origin (or no parent): only the pixel ratio is known.
  }
  return dpr * outer;
}

/** Wait for the brand fonts so canvas/Phaser text renders with the right face. */
export async function fontsReady(): Promise<void> {
  try {
    await Promise.all([
      document.fonts.load('800 32px "Baloo 2"'),
      document.fonts.load('700 16px "Plus Jakarta Sans"'),
    ]);
  } catch {
    // Fall back to system fonts.
  }
}

/** Rasterize an SVG data URL into an <img> ready for Phaser's texture manager. */
export function loadImage(url: string, width?: number, height?: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (width) img.width = width;
    if (height) img.height = height;
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = url;
  });
}
