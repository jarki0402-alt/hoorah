/**
 * Game key art comes from the shared art generators, the heaviest code the landing page uses. It
 * loads as its own chunk right after first paint, so the page text and buttons never wait for it.
 */
import { signal } from '@preact/signals';
import type { GameId } from '../shared/games';

export type ArtUrl = (id: GameId) => string;

/** The key art URL builder once loaded, null before. */
export const artUrl = signal<ArtUrl | null>(null);

let loading = false;

export function loadArt(): void {
  if (loading || artUrl.value) return;
  loading = true;
  import('../shared/keyart')
    .then((m) => {
      artUrl.value = m.keyArtUrl;
    })
    .catch(() => {
      // Offline or a failed deploy swap: the cards keep their flat title tiles; a later call retries.
      loading = false;
    });
}
