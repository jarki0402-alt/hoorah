/**
 * Copy and share. The Clipboard and Web Share APIs only exist on HTTPS (and localhost); over plain
 * HTTP on the LAN the copy falls back to a hidden textarea, and "Bagikan" is hidden.
 */

function copyWithTextarea(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.top = '0';
  area.style.left = '0';
  area.style.opacity = '0';
  area.style.pointerEvents = 'none';
  document.body.appendChild(area);
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  area.select();
  area.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  active?.focus({ preventScroll: true });
  return ok;
}

export async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or document not focused: try the old way.
    }
  }
  return copyWithTextarea(text);
}

export function canShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/** Opens the system share sheet; false when it failed (cancelling counts as done). */
export async function shareText(text: string): Promise<boolean> {
  if (!canShare()) return false;
  try {
    await navigator.share({ text });
    return true;
  } catch (err) {
    return err instanceof DOMException && err.name === 'AbortError';
  }
}

/** Saves `text` as a file through a temporary link; false when the browser refused. */
export function downloadText(fileName: string, text: string, mime = 'text/csv;charset=utf-8'): boolean {
  let url: string | null = null;
  try {
    // The byte order mark makes Excel read the file as UTF-8.
    url = URL.createObjectURL(new Blob(['﻿', text], { type: mime }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
  } catch {
    return false;
  } finally {
    // Revoke after the click has been handled, or some browsers cancel the download.
    const done = url;
    if (done) setTimeout(() => URL.revokeObjectURL(done), 10_000);
  }
}
