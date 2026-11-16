import { useEffect, useRef, useState } from 'preact/hooks';

/** Two refreshes closer than this (focus and visibilitychange fire together) count as one. */
const MIN_GAP_MS = 1500;

/**
 * Calls `load` now, then every `intervalMs` while the browser tab is visible, and again as soon as
 * the window comes back (tab shown or window focused). Never runs two loads at once.
 */
export function usePolling(load: () => Promise<void>, intervalMs: number): void {
  const latest = useRef(load);
  latest.current = load;

  useEffect(() => {
    let busy = false;
    let last = 0;
    let alive = true;
    const run = (force: boolean) => {
      if (busy || !alive) return;
      if (!force && (document.visibilityState !== 'visible' || Date.now() - last < MIN_GAP_MS)) return;
      busy = true;
      last = Date.now();
      latest.current().finally(() => {
        busy = false;
      });
    };
    const tick = () => run(false);
    const onVisible = () => {
      if (document.visibilityState === 'visible') run(false);
    };
    run(true);
    const timer = setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', tick);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', tick);
    };
  }, [intervalMs]);
}

/** Current time, refreshed every `intervalMs`, so "Sisa 5 menit" keeps counting between loads. */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
