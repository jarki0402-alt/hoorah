/** Per-IP token bucket: `perSecond` requests a second, bursts up to `burst` (default twice that). */
export class IpLimiter {
  private readonly buckets = new Map<string, { tokens: number; at: number }>();

  constructor(
    private readonly perSecond: number,
    private readonly burst: number = perSecond * 2,
  ) {}

  allow(ip: string, now: number): boolean {
    const cap = this.burst;
    const b = this.buckets.get(ip) ?? { tokens: cap, at: now };
    // A clock that steps back never takes tokens away.
    b.tokens = Math.min(cap, b.tokens + (Math.max(0, now - b.at) / 1000) * this.perSecond);
    b.at = Math.max(b.at, now);
    const ok = b.tokens >= 1;
    if (ok) b.tokens -= 1;
    this.buckets.set(ip, b);
    // Forget quiet senders now and then so the map can't grow without bound.
    if (this.buckets.size > 5000) {
      // A bucket is only forgotten once it would have refilled anyway.
      const fullMs = Math.max(60_000, (cap / this.perSecond) * 1000);
      for (const [key, x] of this.buckets) if (now - x.at > fullMs) this.buckets.delete(key);
    }
    return ok;
  }
}
