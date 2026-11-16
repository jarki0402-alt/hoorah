/** Builds each map once (on demand or in the background) and keeps it for the session. */
import { getArena } from '../arena';
import { buildCity } from '../city';
import {
  asphaltTexture,
  gantryTexture,
  gradientMap,
  grainTexture,
  signAtlas,
  skylineTexture,
  waterTexture,
  windowTexture,
} from '../textures';
import { getTrack } from '../tracks';
import { buildLapangan } from './lapangan';
import { buildPantai } from './pantai';
import { buildPuncak } from './puncak';
import type { MapId, MapScene } from './types';

export const MUSIC: Record<MapId, string> = {
  kota: 'bajaj',
  pantai: 'bajaj-pantai',
  puncak: 'bajaj-puncak',
  arena: 'bajaj-arena',
};

export class MapLibrary {
  private readonly cache = new Map<MapId, MapScene>();
  private queue: MapId[] = [];
  private timer = 0;

  has(id: MapId): boolean {
    return this.cache.has(id);
  }

  get(id: MapId): MapScene {
    let m = this.cache.get(id);
    if (!m) {
      m = build(id);
      this.cache.set(id, m);
    }
    return m;
  }

  /** Build the given maps one per idle slot so menus stay responsive. */
  prebuild(ids: readonly MapId[], gapMs = 120): void {
    for (const id of ids) if (!this.cache.has(id) && !this.queue.includes(id)) this.queue.push(id);
    if (this.timer) return;
    const next = () => {
      this.timer = 0;
      const id = this.queue.shift();
      if (!id) return;
      if (!this.cache.has(id)) this.get(id);
      this.timer = window.setTimeout(next, gapMs);
    };
    this.timer = window.setTimeout(next, gapMs);
  }
}

function build(id: MapId): MapScene {
  switch (id) {
    case 'kota':
      return buildCity(getTrack('kota'), {
        signs: signAtlas(),
        gantry: gantryTexture(),
        windows: windowTexture(),
        asphalt: asphaltTexture(),
        grain: grainTexture(),
        water: waterTexture(),
        skyline: skylineTexture(),
        gradient: gradientMap(),
      });
    case 'pantai':
      return buildPantai(getTrack('pantai'));
    case 'puncak':
      return buildPuncak(getTrack('puncak'));
    case 'arena':
      return buildLapangan(getArena());
  }
}
