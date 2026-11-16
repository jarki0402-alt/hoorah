/** Game time that stops while the game is held (shell paused or nobody connected). */
export class GameClock {
  private offset = 0;
  private heldAt: number | null = null;
  private last = Number.NEGATIVE_INFINITY;

  constructor(private readonly server: () => number) {}

  get held(): boolean {
    return this.heldAt !== null;
  }

  /** Never goes backwards, even if the server clock estimate is corrected. */
  now(): number {
    const t = this.heldAt ?? this.server() - this.offset;
    if (t < this.last) return this.last;
    this.last = t;
    return t;
  }

  hold(): void {
    if (this.heldAt === null) this.heldAt = this.now();
  }

  release(): void {
    if (this.heldAt === null) return;
    this.offset = this.server() - this.heldAt;
    this.heldAt = null;
  }

  /** Game time -> server time (phone countdowns). */
  toServer(t: number): number {
    return t + this.offset;
  }

  /** Server time -> game time. */
  fromServer(t: number): number {
    return t - this.offset;
  }
}
