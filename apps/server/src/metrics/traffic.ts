/** In-memory counters on the hot path: bytes the relay sends, and whether Cloudflare sits in front. */
import { HOUR_MS } from './zone';

/** A WebSocket frame from the server: the payload plus its 2, 4 or 10 byte header (no mask). */
export function wsFrameBytes(payloadBytes: number): number {
  return payloadBytes + (payloadBytes < 126 ? 2 : payloadBytes < 65_536 ? 4 : 10);
}

/**
 * Counts bytes as they are sent. `mark` (once a second) keeps a short trail of totals for the live
 * rate; `take` hands the bytes since the previous take to the 5-minute sample.
 */
export class ByteMeter {
  private total = 0;
  private taken = 0;
  private readonly marks: { at: number; total: number }[] = [];

  constructor(private readonly windowMs = 30_000) {}

  add(bytes: number): void {
    this.total += bytes;
  }

  mark(now: number): void {
    this.marks.push({ at: now, total: this.total });
    // Keep exactly one mark at least a window old, so the rate always spans a full window.
    while (this.marks.length > 2 && now - (this.marks[1]?.at ?? now) >= this.windowMs) this.marks.shift();
  }

  /** Bytes per second since the oldest mark (about the last `windowMs`); 0 before a second has passed. */
  rate(now: number): number {
    const first = this.marks[0];
    if (!first || now - first.at < 1000) return 0;
    return (this.total - first.total) / ((now - first.at) / 1000);
  }

  take(): number {
    const n = this.total - this.taken;
    this.taken = this.total;
    return n;
  }
}

/** The dashboard warns while Cloudflare's proxy was seen this recently. */
export const CLOUDFLARE_ACTIVE_MS = 24 * HOUR_MS;

/**
 * Cloudflare's proxy (orange cloud) adds `cf-ray` and `cf-connecting-ip` to every request it
 * forwards; straight from a browser they are absent. Traffic through the proxy is not part of the
 * free Standard-tier egress and takes a longer path from Indonesia, so the dashboard warns about it.
 * A forged header only makes the warning show; nothing else reads it.
 */
export class CloudflareWatch {
  constructor(private seen: number | null = null) {}

  get seenAt(): number | null {
    return this.seen;
  }

  /** `header`: the value of `cf-ray` or `cf-connecting-ip` ('' when absent). */
  note(header: string, now: number): void {
    if (header) this.seen = now;
  }

  state(now: number): { seenAt: number | null; active: boolean } {
    return { seenAt: this.seen, active: this.seen !== null && now - this.seen < CLOUDFLARE_ACTIVE_MS };
  }
}
