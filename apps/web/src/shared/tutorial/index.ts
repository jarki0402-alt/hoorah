/**
 * Tutorial registry: each game's `games/<id>/tutorial.ts`, loaded on demand (small chunks; a
 * tutorial file imports only shared art and shared/tutorial/draw, never the game itself).
 */
import type { GameId } from '../games';
import type { Tutorial } from './types';

type Loader = () => Promise<{ TUTORIAL: Tutorial }>;

export const TUTORIAL_LOADERS: Record<GameId, Loader> = {
  tarik: () => import('../../games/tarik/tutorial'),
  kuis: () => import('../../games/kuis/tutorial'),
  rusun: () => import('../../games/rusun/tutorial'),
  bajaj: () => import('../../games/bajaj/tutorial'),
  masak: () => import('../../games/masak/tutorial'),
  ular: () => import('../../games/ular/tutorial'),
  congklak: () => import('../../games/congklak/tutorial'),
  kerupuk: () => import('../../games/kerupuk/tutorial'),
  karung: () => import('../../games/karung/tutorial'),
  kompak: () => import('../../games/kompak/tutorial'),
  ludo: () => import('../../games/ludo/tutorial'),
  catur: () => import('../../games/catur/tutorial'),
  arena: () => import('../../games/arena/tutorial'),
  wilayah: () => import('../../games/wilayah/tutorial'),
  lari: () => import('../../games/lari/tutorial'),
  kata: () => import('../../games/kata/tutorial'),
  juragan: () => import('../../games/juragan/tutorial'),
  dapur: () => import('../../games/dapur/tutorial'),
  obby: () => import('../../games/obby/tutorial'),
  tali: () => import('../../games/tali/tutorial'),
  bom: () => import('../../games/bom/tutorial'),
  runtuh: () => import('../../games/runtuh/tutorial'),
  es: () => import('../../games/es/tutorial'),
  langkah: () => import('../../games/langkah/tutorial'),
  nyebrang: () => import('../../games/nyebrang/tutorial'),
  penyusup: () => import('../../games/penyusup/tutorial'),
  eja: () => import('../../games/eja/tutorial'),
  siluman: () => import('../../games/siluman/tutorial'),
  warna: () => import('../../games/warna/tutorial'),
  hantu: () => import('../../games/hantu/tutorial'),
};

const cache = new Map<GameId, Tutorial>();

/** The game's tutorial, or null if it fails to load (the game then simply starts). */
export async function loadTutorial(id: GameId): Promise<Tutorial | null> {
  const hit = cache.get(id);
  if (hit) return hit;
  try {
    const t = (await TUTORIAL_LOADERS[id]()).TUTORIAL;
    cache.set(id, t);
    return t;
  } catch {
    return null;
  }
}

/** Already loaded (sync), for rendering without waiting. */
export function cachedTutorial(id: GameId): Tutorial | null {
  return cache.get(id) ?? null;
}
