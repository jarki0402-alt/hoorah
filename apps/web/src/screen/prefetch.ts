/**
 * Warms the next game while something else is on screen (a promo break): its page's scripts,
 * module preloads and stylesheets go into the browser cache, so the iframe loads from disk.
 */
import type { GameId } from '../shared/games';

/** The page a game's iframe loads (GamePage adds `?run=`). */
export function gamePageUrl(id: GameId): string {
  return `/games/${id}/`;
}

const TAG = /<(script|link)\b([^>]*)>/gi;
const ATTR = /([a-z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;

function attrs(raw: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of raw.matchAll(ATTR)) {
    out.set(m[1]!.toLowerCase(), m[2] ?? m[3] ?? m[4] ?? '');
  }
  return out;
}

/**
 * Same-origin script, module preload and stylesheet URLs of a game page, absolute, in page order,
 * without duplicates. `base` is the page's own absolute URL.
 */
export function assetUrls(html: string, base: string): string[] {
  const origin = new URL(base).origin;
  const seen = new Set<string>();
  for (const m of html.matchAll(TAG)) {
    const a = attrs(m[2]!);
    let ref: string | undefined;
    if (m[1]!.toLowerCase() === 'script') ref = a.get('src');
    else {
      const rel = (a.get('rel') ?? '').toLowerCase().split(/\s+/);
      if (rel.includes('modulepreload') || rel.includes('stylesheet')) ref = a.get('href');
    }
    if (!ref) continue;
    let url: URL;
    try {
      url = new URL(ref, base);
    } catch {
      continue;
    }
    if (url.origin !== origin) continue;
    seen.add(url.href);
  }
  return [...seen];
}

const warmed = new Set<string>();

function addPrefetch(href: string): void {
  if (warmed.has(href)) return;
  warmed.add(href);
  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = href;
  document.head.appendChild(link);
}

/** Prefetches a game's page assets; failures are ignored (the iframe simply loads normally). */
export async function prefetchGame(id: GameId): Promise<void> {
  try {
    const page = new URL(gamePageUrl(id), location.href).href;
    const res = await fetch(page, { credentials: 'same-origin' });
    if (!res.ok) return;
    for (const href of assetUrls(await res.text(), page)) addPrefetch(href);
  } catch {
    // Offline or blocked: nothing to warm.
  }
}
