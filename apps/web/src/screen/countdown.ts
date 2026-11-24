/**
 * Shell countdowns (results auto-continue, Mode Pesta, ad break) that a far-away main screen shows
 * exactly like the Host's. The Host's main screen runs each one against a deadline in server time
 * and publishes it with the shell state; a far-away screen only draws what that deadline says, so
 * neither the relay delay nor its own page timing shifts the seconds shown.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { secondsLeft, type TimerId } from './mirror';
import { clearTimer, isMirror, publishTimer, serverNow, shellTimer } from './store';

/** How often the seconds shown are recomputed from the deadline. */
const TICK_MS = 200;

/**
 * Seconds left of countdown `id`, or null while it does not run. On the Host's main screen it runs
 * while `running` and calls `onDone` once at 0; on a far-away screen it shows the Host's countdown
 * and never acts.
 */
export function useShellCountdown(
  id: TimerId,
  seconds: number,
  running: boolean,
  onDone: () => void,
): number | null {
  const [left, setLeft] = useState(seconds);
  const [, redraw] = useState(0);
  const done = useRef(onDone);
  done.current = onDone;

  // Host's main screen: the countdown itself.
  useEffect(() => {
    if (isMirror || !running) return;
    const end = serverNow() + seconds * 1000;
    publishTimer({ id, step: 0, end });
    setLeft(seconds);
    let finished = false;
    const timer = window.setInterval(() => {
      const now = secondsLeft(end, serverNow());
      setLeft(now);
      if (now > 0 || finished) return;
      finished = true;
      window.clearInterval(timer);
      clearTimer(id);
      done.current();
    }, TICK_MS);
    return () => {
      window.clearInterval(timer);
      clearTimer(id);
    };
  }, [id, seconds, running]);

  // Far-away main screen: redraw while the Host's countdown runs.
  const followed = isMirror && shellTimer.value?.id === id ? shellTimer.value : null;
  const followedEnd = followed?.end ?? null;
  useEffect(() => {
    if (followedEnd === null) return;
    const timer = window.setInterval(() => redraw((n) => n + 1), TICK_MS);
    return () => window.clearInterval(timer);
  }, [followedEnd]);

  if (isMirror) return followed ? secondsLeft(followed.end, serverNow()) : null;
  return running ? left : null;
}

/** How far into a countdown step `end` (server ms) of `ms` length the clock is now, in ms. */
export function elapsedOf(end: number, ms: number): number {
  return Math.min(ms, Math.max(0, ms - (end - serverNow())));
}
