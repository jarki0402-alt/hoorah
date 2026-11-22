/**
 * Pictures for option lists (`menu` and `choice` views): each game ships a small set of SVG
 * thumbnails in `thumbs/<gameId>.ts` exporting `THUMBS: Record<string, () => string>`, keyed by
 * the option's `thumb`. A set is its own chunk, fetched only when that game first shows an option
 * with a picture, so the phone's first load stays small.
 *
 * Thumbnails are drawn on a 160×120 canvas (`thumbSvg`), shown at 4:3 on the phone and free to
 * reuse on the main screen (games import their own `thumbs/<gameId>.ts` directly).
 */
import { thumbKey } from '@hoorah/protocol';
import { useEffect, useState } from 'preact/hooks';
import { svgUrl } from '../../shared/art/svg';

export type ThumbSet = Readonly<Record<string, () => string>>;

type ThumbLoader = () => Promise<{ THUMBS: ThumbSet }>;

/** One line per game with pictures. */
const LOADERS: Readonly<Record<string, ThumbLoader>> = {
  bajaj: () => import('./bajaj'),
  dapur: () => import('./dapur'),
  eja: () => import('./eja'),
  juragan: () => import('./juragan'),
  langkah: () => import('./langkah'),
  nyebrang: () => import('./nyebrang'),
  penyusup: () => import('./penyusup'),
  siluman: () => import('./siluman'),
  warna: () => import('./warna'),
  hantu: () => import('./hantu'),
  tali: () => import('./tali'),
  bom: () => import('./bom'),
};

const loaded = new Map<string, ThumbSet>();
const pending = new Map<string, Promise<ThumbSet | null>>();

/** The thumbnail set of a game, or null when it has none (or its chunk failed to load). */
export function loadThumbs(gameId: string): Promise<ThumbSet | null> {
  const ready = loaded.get(gameId);
  if (ready) return Promise.resolve(ready);
  const loader = LOADERS[gameId];
  if (!loader) return Promise.resolve(null);
  let p = pending.get(gameId);
  if (!p) {
    p = loader().then(
      (m) => {
        loaded.set(gameId, m.THUMBS);
        return m.THUMBS;
      },
      () => {
        // A dropped connection must not leave the menu blank: text options still work, and the
        // next menu tries again.
        pending.delete(gameId);
        return null;
      },
    );
    pending.set(gameId, p);
  }
  return p;
}

/** True when any option asks for a picture this game can draw. */
export function wantsThumbs(gameId: string | undefined, options: readonly { thumb?: string }[]): boolean {
  return Boolean(gameId && LOADERS[gameId] && options.some((o) => thumbKey(o.thumb)));
}

/**
 * The game's thumbnail set once loaded (null before, or when not wanted). Re-renders when the
 * chunk arrives; already loaded sets are returned on the first render with no flash.
 */
export function useThumbs(gameId: string | undefined, wanted: boolean): ThumbSet | null {
  const [set, setSet] = useState<ThumbSet | null>(() => (gameId ? (loaded.get(gameId) ?? null) : null));
  useEffect(() => {
    if (!wanted || !gameId) return;
    const ready = loaded.get(gameId);
    if (ready) {
      setSet(ready);
      return;
    }
    let alive = true;
    void loadThumbs(gameId).then((s) => {
      if (alive) setSet(s);
    });
    return () => {
      alive = false;
    };
  }, [gameId, wanted]);
  return wanted && gameId && set === loaded.get(gameId) ? set : null;
}

/** Image URL of one option's picture, or null when the key is invalid or missing from the set. */
export function thumbSrc(gameId: string, set: ThumbSet | null, raw: unknown): string | null {
  const key = thumbKey(raw);
  if (!set || !key || !Object.hasOwn(set, key)) return null;
  const build = set[key]!;
  return svgUrl(`thumb:${gameId}:${key}`, build);
}
