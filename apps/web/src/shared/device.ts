import { play } from './haptics';

/**
 * Short vibration: `navigator.vibrate` on Android, system ticks from a hidden switch on iPhone,
 * a small screen-edge flash where neither exists (see `haptics.ts`). Never throws.
 */
export function vibrate(pattern: number | number[]): void {
  play(pattern);
}

export const isTouchDevice = (): boolean => 'ontouchstart' in window || navigator.maxTouchPoints > 0;

/** Phones and tablets are controllers; everything else (laptop, desktop, TV) is a screen. */
/**
 * Phones become controllers. Tablets, laptops, desktops and TVs become the big screen,
 * so a tablet on a stand works as a console out of the box.
 */
export function looksLikePhone(): boolean {
  const ua = navigator.userAgent;
  if (/iPhone|iPod|Android.+Mobile|Windows Phone/i.test(ua)) return true;
  if (/iPad|Tablet/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
    return false;
  return isTouchDevice() && Math.min(window.screen.width, window.screen.height) < 600;
}

/** Remember a manual role choice for this device and reload into it (same URL for everyone). */
export function switchRole(role: 'screen' | 'controller'): void {
  try {
    localStorage.setItem('hoorah.mode', role);
  } catch {
    // Without storage the query flag below still works for this visit.
  }
  location.replace(role === 'screen' ? '/?tv=1' : '/?ctrl=1');
}

export function looksLikeTv(): boolean {
  return /SMART-TV|SmartTV|Tizen|Web0S|webOS|HbbTV|BRAVIA|AFT|CrKey|GoogleTV|Android TV/i.test(
    navigator.userAgent,
  );
}

/** Keeps the screen awake. Uses the Wake Lock API when available (secure contexts only). */
export class KeepAwake {
  private lock: { release(): Promise<void> } | null = null;
  private active = false;

  async enable(): Promise<void> {
    this.active = true;
    document.addEventListener('visibilitychange', this.onVisible);
    await this.request();
  }

  disable(): void {
    this.active = false;
    document.removeEventListener('visibilitychange', this.onVisible);
    void this.lock?.release().catch(() => {});
    this.lock = null;
  }

  private async request(): Promise<void> {
    const wl = (
      navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }
    ).wakeLock;
    if (!wl || !window.isSecureContext) return;
    try {
      this.lock = await wl.request('screen');
    } catch {
      this.lock = null;
    }
  }

  private readonly onVisible = (): void => {
    if (this.active && document.visibilityState === 'visible') void this.request();
  };
}

/** Remembered per device (not secret): last name and fruit. */
export const prefs = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(`hoorah.${key}`);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown): void {
    try {
      localStorage.setItem(`hoorah.${key}`, JSON.stringify(value));
    } catch {
      // Private mode or storage full: preferences are a convenience only.
    }
  },
};

/** Per-tab session data (reconnect tokens). */
export const session = {
  get<T>(key: string): T | null {
    try {
      const raw = sessionStorage.getItem(`hoorah.${key}`);
      return raw === null ? null : (JSON.parse(raw) as T);
    } catch {
      return null;
    }
  },
  set(key: string, value: unknown): void {
    try {
      sessionStorage.setItem(`hoorah.${key}`, JSON.stringify(value));
    } catch {
      // ignore
    }
  },
  remove(key: string): void {
    try {
      sessionStorage.removeItem(`hoorah.${key}`);
    } catch {
      // ignore
    }
  },
};
