/**
 * Flourishes the Host's driver and a far-away screen's replica both play (long-distance play):
 * knock-out bursts, floats and feed lines, the new-leader call and the last-seconds warning. Sounds,
 * vibration and phone views stay with the driver.
 */
import type { Hud } from './hud';
import type { KoCause } from './logic';
import type { ArenaScene } from './scene';
import { STR } from './strings';

/** "GO" stays up this long after the start (ms of play). */
export const GO_MS = 900;
/** Feed lines fade after this long. */
export const FEED_MS = 7000;
/** Fairy lights flash this warm orange for the last-seconds warning. */
const WARN_LIGHTS = 0xff9a3d;

/** What a flourish needs to know about a snake. */
export interface FxSnake {
  readonly name: string;
  readonly color: string;
  readonly colorNum: number;
  readonly x: number;
  readonly y: number;
  readonly alive: boolean;
}

export interface KoFx {
  id: number;
  by: number | null;
  cause: KoCause;
  x: number;
  y: number;
  /** Length at the knock-out. */
  len: number;
}

const pt = { x: 0, y: 0 };

/** A knock-out: burst and rings on the scene, "TUMBANG!" (once for a head-on pair), "+1 KO" and a feed line. */
export function koFlourish(
  scene: ArenaScene,
  hud: Hud,
  e: KoFx,
  victim: FxSnake | undefined,
  killer: FxSnake | undefined,
  now: number,
): void {
  scene.onKo(e.id, e.x, e.y, e.len);
  // A head-on knock-out has two victims at one spot: one float is enough.
  if (e.cause !== 'head' || e.by === null || e.id < e.by) {
    const p = scene.toStage(e.x, e.y, pt);
    hud.float(STR.koFloat, p.x, p.y - 10, { size: 30, color: victim?.color ?? '#FFFFFF', rise: 46 });
  }
  if (e.cause === 'body' && e.by !== null) {
    if (!killer) return;
    if (killer.alive) {
      const k = scene.toStage(killer.x, killer.y, pt);
      hud.float(STR.koPlus, k.x, k.y - 40, { size: 24, color: '#FFC928', rise: 36, duration: 1000 });
    }
    hud.pushFeed(STR.feedKo(killer.name, victim?.name ?? ''), killer.color, now);
  } else if (e.cause === 'head') {
    if (e.by === null || e.id < e.by) {
      hud.pushFeed(STR.feedHead(victim?.name ?? '', killer?.name ?? ''), victim?.color ?? '#FFFFFF', now);
    }
  } else if (victim) {
    hud.pushFeed(STR.feedWall(victim.name), victim.color, now);
  }
}

/** A new longest snake: feed line, "TERPANJANG!" over its head and the lights in its colour. */
export function leadFlourish(scene: ArenaScene, hud: Hud, s: FxSnake, now: number): void {
  hud.pushFeed(STR.feedLead(s.name), s.color, now);
  const p = scene.toStage(s.x, s.y, pt);
  hud.float(STR.leadFloat, p.x, p.y - 46, { size: 24, color: '#FFC928', rise: 34, duration: 1100 });
  scene.flashLights(s.colorNum, 700);
}

/** "10 detik lagi": the lights flash and twinkle faster until the whistle. */
export function warningFlourish(scene: ArenaScene): void {
  scene.urgent = true;
  scene.flashLights(WARN_LIGHTS, 900);
}
