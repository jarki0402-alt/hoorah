/** Game time that stops while the shell is paused (deadlines and animations freeze with it). */
export class GameClock {
  private offset = 0;
  private pausedAt: number | null = null;
  private last = Number.NEGATIVE_INFINITY;

  constructor(private readonly server: () => number) {}

  get paused(): boolean {
    return this.pausedAt !== null;
  }

  /** Never goes backwards, even if the server clock estimate is corrected. */
  now(): number {
    const t = this.pausedAt ?? this.server() - this.offset;
    if (t < this.last) return this.last;
    this.last = t;
    return t;
  }

  pause(): void {
    if (this.pausedAt === null) this.pausedAt = this.now();
  }

  resume(): void {
    if (this.pausedAt === null) return;
    this.offset = this.server() - this.pausedAt;
    this.pausedAt = null;
  }

  toServer(t: number): number {
    return t + this.offset;
  }
}
