/**
 * NTP-style clock sync. Keeps the lowest-RTT samples, which are the least distorted
 * by queueing, and reports the offset from local time to server time.
 */
export class ClockSync {
  private samples: { rtt: number; offset: number }[] = [];
  private readonly keep: number;

  constructor(keep = 8) {
    this.keep = keep;
  }

  /** ct = local send time, st = server time, now = local receive time. */
  add(ct: number, st: number, now: number): void {
    const rtt = Math.max(0, now - ct);
    const offset = st - (ct + rtt / 2);
    this.samples.push({ rtt, offset });
    this.samples.sort((a, b) => a.rtt - b.rtt);
    if (this.samples.length > this.keep) this.samples.length = this.keep;
  }

  get ready(): boolean {
    return this.samples.length > 0;
  }

  /** Median offset of the best samples. */
  get offset(): number {
    if (!this.samples.length) return 0;
    const best = this.samples.slice(0, Math.max(1, Math.ceil(this.samples.length / 2)));
    const sorted = best.map((s) => s.offset).sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? 0;
  }

  get rtt(): number {
    return this.samples[0]?.rtt ?? 0;
  }
}
