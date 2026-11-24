/**
 * Remembers on this device that it has run the main screen. The landing page at `/` then offers
 * "Lanjutkan sebagai layar utama" as its main button (owner 2026-11-24: `/` always shows the
 * landing page, it no longer jumps to `/main`). Kept tiny: the site entry imports it.
 */
const SCREEN_USED_KEY = 'hoorah.screenUsed';

export function screenUsed(): boolean {
  try {
    return localStorage.getItem(SCREEN_USED_KEY) === '1';
  } catch {
    return false;
  }
}

export function markScreenUsed(): void {
  try {
    localStorage.setItem(SCREEN_USED_KEY, '1');
  } catch {
    // Private mode: the landing page simply shows the newcomer button next time.
  }
}
