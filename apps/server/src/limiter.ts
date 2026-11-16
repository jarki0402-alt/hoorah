/** Per-IP token bucket: `perSecond` requests a second, bursts up to twice that. */
export class IpLimiter {
  private readonly buckets = new Map<string, { tokens: number; at: number }>();

  constructor(private readonly perSecond: number) {}

  allow(ip: string, now: number): boolean {
    const cap = this.perSecond * 2;
    const b = this.buckets.get(ip) ?? { tokens: cap, at: now };
    b.tokens = Math.min(cap, b.tokens + ((now - b.at) / 1000) * this.perSecond);
    b.at = now;
    const ok = b.tokens >= 1;
    if (ok) b.tokens -= 1;
    this.buckets.set(ip, b);
    // Forget quiet senders now and then so the map can't grow without bound.
    if (this.buckets.size > 5000) {
      for (const [key, x] of this.buckets) if (now - x.at > 60_000) this.buckets.delete(key);
    }
    return ok;
  }
}
