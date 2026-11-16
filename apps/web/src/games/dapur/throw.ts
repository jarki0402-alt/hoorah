/**
 * Who catches a throw. There is no aiming: the held item flies to the nearest teammate on the
 * other side of the divider (split kitchens) or to the nearest teammate (open kitchen). On Santai
 * only empty-handed teammates are picked; when nobody fits, it lands on a free counter instead.
 */
import { sideOfX } from './kitchens';
import type { Chef, Station } from './logic';

export interface ReceiverRules {
  split: boolean;
  /** Santai: only teammates with empty hands and nothing already flying at them. */
  safe: boolean;
  incoming: (id: number) => boolean;
  /** Game time, to skip staggered cooks on Santai. */
  now: number;
}

export function pickReceiver(chefs: readonly Chef[], from: Chef, rules: ReceiverRules): Chef | null {
  const mySide = sideOfX(from.x);
  let best: Chef | null = null;
  let bd = Infinity;
  for (const c of chefs) {
    if (c.id === from.id) continue;
    if (rules.split && sideOfX(c.x) === mySide) continue;
    if (rules.safe && (c.held || rules.incoming(c.id) || rules.now < c.staggerUntil)) continue;
    const d = Math.hypot(c.x - from.x, c.y - from.y);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

/** Minimum distance for a counter landing in an open kitchen (a throw is not a hand-over). */
const OPEN_MIN = 1.5;

/**
 * A free counter for a throw nobody can catch: across the divider (split) or a little away from
 * the thrower (open), nearest first. Counters something is already flying to are skipped.
 */
export function pickLandingCounter(
  stations: readonly Station[],
  from: Chef,
  split: boolean,
  taken: (id: number) => boolean,
): Station | null {
  const mySide = sideOfX(from.x);
  let best: Station | null = null;
  let bd = Infinity;
  for (const s of stations) {
    if (s.kind !== 'counter' || s.item || s.fire || taken(s.id)) continue;
    const cx = s.x + s.w / 2;
    const cy = s.y + 0.5;
    if (split && sideOfX(cx) === mySide) continue;
    const d = Math.hypot(cx - from.x, cy - from.y);
    if (!split && d < OPEN_MIN) continue;
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best;
}
