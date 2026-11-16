/**
 * Tiny localStorage wrapper for the main screen's per-device memory (CPU skill, personal records).
 * Storage may be missing or throw (private mode, previews, unit tests); everything falls back.
 */
const PREFIX = 'hoorah.';

export function loadJson<T>(key: string, fallback: T): T {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function saveJson(key: string, value: unknown): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Convenience only.
  }
}
