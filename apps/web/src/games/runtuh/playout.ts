/**
 * Long-distance play, far-away main screen: when to draw the Host's stage, and how to read the
 * Host's clocks. The same file sits in every game folder that mirrors a moving stage (games never
 * import each other): change all copies together.
 *
 * `PlayoutClock` draws the stage `lag + buffer` behind server time. `lag` is the shortest recent
 * trip (arrival minus the Host's stamp, both in server time), `buffer` follows the measured packet
 * gap and jitter: `clamp(1.5 gap + 2 jitter, 60, 250)` ms, so a fast direct link plays about
 * 60-80 ms behind the Host and a jittery relay stays smooth. The drawn point never jumps: it drifts
 * toward the target at a bounded share of play speed, so a route change mid-game (a direct link
 * coming up, or falling back to the relay) re-converges within a second or two without a stutter.
 * When packets keep coming but later than the drawn point, it holds at the newest one and goes on
 * from there rather than skipping ahead.
 *
 * `sinceStamp` reads a Host clock at server time: countdowns, round clocks, rhythm rings and
 * schedules are drawn from server time, not from the delayed stage, so a far-away player sees the
 * moment the Host judges.
 */

/** Smallest and largest buffer kept on top of the trip (ms). */
export const BUFFER_MIN_MS = 60;
export const BUFFER_MAX_MS = 250;
/** A Host clock is read at most this far past the newest packet (ms): a dead link stops it. */
export const CLOCK_AHEAD_MAX_MS = 2000;

/** Trips kept for the shortest-trip estimate (about half a second of packets). */
const TRIP_WINDOW = 8;
/** Packet gap assumed before any was measured (ms). */
const GAP_START_MS = 70;
/** Gaps longer than this are a calm phase or a pause in publishing, not the play rate (ms). */
const GAP_PLAY_MAX_MS = 200;
/** Packets count as still flowing while the last one arrived within this (ms). */
const FLOWING_MS = 400;
/** Smoothing per packet of the gap and of the jitter (the jitter as in RFC 3550). */
const GAP_GAIN = 1 / 8;
const JITTER_GAIN = 1 / 16;
/** Time constant of the drift toward the target (ms). */
const EASE_MS = 800;
/** Largest drift per ms of play: the stage runs at most 25% slower or 10% faster than real time. */
const SLOW_MAX = 0.25;
const FAST_MAX = 0.1;
/** A target this far from the drawn point (a stalled tab, a re-synced clock) is taken at once (ms). */
const SNAP_MS = 1500;
/** Longest frame step counted toward the drift (ms): a frozen tab is not play. */
const STEP_MAX_MS = 100;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Server ms of Host play since a packet stamped `sent`, read at server ms `now` (0..CLOCK_AHEAD_MAX_MS). */
export function sinceStamp(sent: number, now: number): number {
  return clamp(now - sent, 0, CLOCK_AHEAD_MAX_MS);
}

export class PlayoutClock {
  private readonly trips: number[] = [];
  private lastSent: number | null = null;
  private lastTrip: number | null = null;
  /** Newest stamp seen and when the last packet arrived (server ms). */
  private newest = Number.NEGATIVE_INFINITY;
  private lastArrival = Number.NEGATIVE_INFINITY;
  private gap = GAP_START_MS;
  private jitter = 0;
  /** How far behind server time the stage is drawn now (ms), null before the first packet. */
  private behind: number | null = null;
  private lastNow: number | null = null;

  /** A packet the Host stamped at server ms `sent` arrived at server ms `now`. */
  observe(sent: number, now: number): void {
    if (!Number.isFinite(sent) || !Number.isFinite(now)) return;
    const trip = now - sent;
    if (this.lastSent !== null) {
      const gap = sent - this.lastSent;
      if (gap > 0 && gap <= GAP_PLAY_MAX_MS) this.gap += (gap - this.gap) * GAP_GAIN;
    }
    if (this.lastTrip !== null) this.jitter += (Math.abs(trip - this.lastTrip) - this.jitter) * JITTER_GAIN;
    this.lastSent = sent;
    this.lastTrip = trip;
    this.newest = Math.max(this.newest, sent);
    this.lastArrival = now;
    this.trips.push(trip);
    if (this.trips.length > TRIP_WINDOW) this.trips.shift();
  }

  /** Shortest recent trip (ms), null before the first packet. */
  get lagMs(): number | null {
    return this.trips.length > 0 ? Math.min(...this.trips) : null;
  }

  /** Smoothed gap between packets (ms). */
  get gapMs(): number {
    return this.gap;
  }

  /** Smoothed trip-to-trip variation (ms). */
  get jitterMs(): number {
    return this.jitter;
  }

  /** Buffer the target keeps on top of the trip (ms). */
  get bufferMs(): number {
    return clamp(this.gap * 1.5 + this.jitter * 2, BUFFER_MIN_MS, BUFFER_MAX_MS);
  }

  /** Where the drawn point heads: trip plus buffer (ms behind server time), null before any packet. */
  get targetMs(): number | null {
    const lag = this.lagMs;
    return lag === null ? null : lag + this.bufferMs;
  }

  /** How far behind server time the stage was last drawn (ms), null before any packet. */
  get behindMs(): number | null {
    return this.behind;
  }

  /**
   * Server time of the Host's stage to draw at server time `now`. Moves the drawn point toward the
   * target; calling it again with the same `now` changes nothing.
   */
  drawAt(now: number): number {
    const target = this.targetMs;
    if (target === null) return now;
    const behind = this.behind;
    if (behind === null || Math.abs(target - behind) > SNAP_MS) {
      this.behind = target;
    } else if (this.lastNow !== null && now > this.lastNow) {
      const dt = Math.min(now - this.lastNow, STEP_MAX_MS);
      const want = (target - behind) * Math.min(1, dt / EASE_MS);
      this.behind = behind + clamp(want, -FAST_MAX * dt, SLOW_MAX * dt);
    }
    // Packets still flow but later than the drawn point (the route got slower): hold at the newest
    // one and carry on from there, instead of skipping ahead once the late packets arrive.
    const drawn = now - (this.behind ?? target);
    if (drawn > this.newest && now - this.lastArrival <= FLOWING_MS) this.behind = now - this.newest;
    this.lastNow = now;
    return now - (this.behind ?? target);
  }
}
