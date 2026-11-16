/**
 * Game time in ms that stops while paused. The source is injected so tests can drive it.
 * Several independent reasons can hold the clock (shell pause, hidden tab); it runs only when
 * none of them are active.
 */
export class GameClock {
  private offset: number;
  private heldAt: number | null = null;
  private readonly holds = new Set<string>();

  constructor(private readonly source: () => number = () => performance.now()) {
    this.offset = source();
  }

  now(): number {
    return (this.heldAt ?? this.source()) - this.offset;
  }

  get paused(): boolean {
    return this.heldAt !== null;
  }

  hold(reason: string): void {
    this.holds.add(reason);
    if (this.heldAt === null) this.heldAt = this.source();
  }

  release(reason: string): void {
    this.holds.delete(reason);
    if (this.holds.size > 0 || this.heldAt === null) return;
    this.offset += this.source() - this.heldAt;
    this.heldAt = null;
  }
}
