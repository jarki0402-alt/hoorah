/**
 * What a stage event looks like on the main screen (scene effects and floating texts, no sound):
 * the Host's driver plays it as it happens, a far-away main screen (long-distance play) when its
 * delayed stage reaches the packet that brought it.
 */
import type { Hud } from './hud';
import type { WarnaScene } from './scene';
import { STR } from './strings';
import { TUNE, type World, type WorldEvent } from './world';

/** Stage events with something to see. */
export type FxEvent =
  | Extract<
      WorldEvent,
      { type: 'jump' | 'land' | 'die' | 'respawn' | 'gem' | 'checkpoint' | 'bounce' | 'assist' | 'clear' }
    >
  | { type: 'ping'; key: number }
  | { type: 'restart' }
  | { type: 'skip' };

const FX_TYPES: ReadonlySet<string> = new Set([
  'jump',
  'land',
  'die',
  'respawn',
  'gem',
  'checkpoint',
  'bounce',
  'assist',
  'clear',
]);

export function isFx(e: WorldEvent): e is Extract<FxEvent, WorldEvent> {
  return FX_TYPES.has(e.type);
}

const YELLOW = '#FFE27A';
const WHITE = '#FFFFFF';

export function showEffect(scene: WarnaScene, hud: Hud, w: World | null, e: FxEvent): void {
  switch (e.type) {
    case 'jump':
      scene.onJump(e.key);
      return;
    case 'land':
      scene.onLand(e.key, e.hard);
      return;
    case 'die': {
      scene.onDie(e.key, e.x, e.y);
      if (!w?.chars[e.key]) return;
      const p = scene.toStage(e.x, e.y);
      hud.float(STR.backFloat, p.x, p.y - 30, WHITE);
      return;
    }
    case 'respawn':
      scene.onRespawn(e.key);
      return;
    case 'gem': {
      scene.onGem(e.gem);
      const g = w?.gems[e.gem];
      if (!g) return;
      const p = scene.toStage(g.x + 0.5, g.y);
      hud.float(STR.gemFloat, p.x, p.y - 8, YELLOW);
      return;
    }
    case 'checkpoint': {
      scene.onCheckpoint(e.x, e.y);
      const p = scene.toStage(e.x + 0.5, e.y);
      hud.float(STR.checkpointFloat, p.x, p.y - 12, YELLOW);
      return;
    }
    case 'bounce':
      scene.onBounce(e.x, e.y);
      return;
    case 'assist':
      scene.onAssist(e.y, e.x0, e.x1);
      return;
    case 'clear':
      scene.onClear();
      return;
    case 'ping': {
      const c = w?.chars[e.key];
      if (!c) return;
      const p = scene.toStage(c.x + TUNE.charW / 2, c.y);
      hud.float(STR.pingFloat, p.x, p.y - 74, WHITE);
      return;
    }
    case 'restart':
      hud.float(STR.restarted, scene.ox + 640, scene.oy + 360, YELLOW);
      return;
    case 'skip':
      hud.float(STR.skipFloat, scene.ox + 640, scene.oy + 300, YELLOW);
      return;
  }
}
