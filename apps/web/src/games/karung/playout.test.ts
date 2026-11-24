import { describe, expect, it } from 'vitest';
import { BUFFER_MAX_MS, BUFFER_MIN_MS, CLOCK_AHEAD_MAX_MS, PlayoutClock, sinceStamp } from './playout';

/** Deterministic noise in [0, 1). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

interface Frame {
  now: number;
  /** Server time drawn. */
  at: number;
  /** Newest stamp arrived by then. */
  newest: number;
}

/**
 * Sends a packet every `gapMs` for `ms`, each taking `trip(sent)` ms, into a fresh clock, and
 * draws a frame every 16 ms. Returns the clock and every frame.
 */
function play(ms: number, gapMs: number, trip: (sent: number) => number) {
  const clock = new PlayoutClock();
  const arrivals: { sent: number; at: number }[] = [];
  for (let sent = 0; sent < ms; sent += gapMs) arrivals.push({ sent, at: sent + trip(sent) });
  arrivals.sort((a, b) => a.at - b.at);
  const frames: Frame[] = [];
  let newest = Number.NEGATIVE_INFINITY;
  let k = 0;
  for (let now = 0; now < ms; now += 16) {
    while (k < arrivals.length && arrivals[k]!.at <= now) {
      const a = arrivals[k++]!;
      clock.observe(a.sent, a.at);
      newest = Math.max(newest, a.sent);
    }
    if (clock.targetMs === null) continue;
    frames.push({ now, at: clock.drawAt(now), newest });
  }
  return { clock, frames };
}

/** Frames in [from, to) that found no packet at or past the drawn point. */
const starved = (frames: readonly Frame[], from: number, to: number): number =>
  frames.filter((f) => f.now >= from && f.now < to && f.at > f.newest).length;

/** Frames in [from, to) that showed the newest packet without anything to blend toward. */
const held = (frames: readonly Frame[], from: number, to: number): number =>
  frames.filter((f) => f.now >= from && f.now < to && f.at >= f.newest).length;

const jittery = (trip: number, jitter: number, seed: number): (() => number) => {
  const r = rng(seed);
  return () => trip + r() * jitter;
};

describe('PlayoutClock', () => {
  it('plays a fast direct link about 60-90 ms behind the shortest trip', () => {
    const { clock, frames } = play(6000, 50, jittery(30, 4, 1));
    expect(clock.lagMs).toBeGreaterThanOrEqual(30);
    expect(clock.lagMs).toBeLessThan(32);
    expect(clock.bufferMs).toBeGreaterThanOrEqual(BUFFER_MIN_MS);
    expect(clock.bufferMs).toBeLessThan(90);
    expect(clock.behindMs! - clock.lagMs!).toBeLessThan(90);
    expect(held(frames, 0, 6000)).toBe(0);
  });

  it('keeps a bigger buffer on a jittery relay and seldom runs out of packets', () => {
    const { clock, frames } = play(8000, 66, jittery(220, 120, 3));
    expect(clock.bufferMs).toBeGreaterThan(140);
    expect(clock.bufferMs).toBeLessThanOrEqual(BUFFER_MAX_MS);
    expect(held(frames, 2000, 8000) / frames.length).toBeLessThan(0.05);
  });

  it('never draws backwards and never runs much faster than real time', () => {
    const r = rng(9);
    const { frames } = play(10_000, 60, (sent) => (sent < 5000 ? 260 + r() * 100 : 40 + r() * 10));
    for (let i = 1; i < frames.length; i++) {
      const step = frames[i]!.at - frames[i - 1]!.at;
      expect(step).toBeGreaterThanOrEqual(0);
      expect(step).toBeLessThan(16 * 1.11);
    }
  });

  it('re-converges smoothly when a direct link comes up mid-game', () => {
    const relay = jittery(250, 40, 4);
    const direct = jittery(35, 5, 5);
    const { clock, frames } = play(9000, 60, (sent) => (sent < 5000 ? relay() : direct()));
    const before = frames.find((f) => f.now >= 4900)!;
    expect(clock.lagMs).toBeLessThan(40);
    expect(before.now - before.at - (clock.behindMs ?? 0)).toBeGreaterThan(150);
    expect(clock.behindMs! - clock.targetMs!).toBeLessThan(30);
    expect(clock.behindMs! - clock.lagMs!).toBeLessThan(130);
    expect(held(frames, 5000, 9000)).toBe(0);
  });

  it('holds briefly, then plays on smoothly when the link falls back to the relay mid-game', () => {
    const direct = jittery(35, 5, 6);
    const relay = jittery(260, 60, 7);
    const { clock, frames } = play(11_000, 60, (sent) => (sent < 4000 ? direct() : relay()));
    expect(clock.lagMs).toBeGreaterThanOrEqual(260);
    expect(clock.behindMs!).toBeGreaterThan(clock.lagMs! + BUFFER_MIN_MS - 1);
    // Never past the newest packet while they keep coming: no skipping ahead afterwards.
    expect(starved(frames, 4300, 11_000)).toBe(0);
    // The hold at the switch stays short, and once settled nothing runs dry.
    expect(held(frames, 4000, 11_000) * 16).toBeLessThan(800);
    expect(held(frames, 7000, 11_000)).toBe(0);
  });

  it('jumps once for a target far away (stalled tab or re-synced clock)', () => {
    const c = new PlayoutClock();
    c.observe(0, 100);
    expect(c.drawAt(100)).toBe(100 - c.targetMs!);
    for (let i = 1; i < 9; i++) c.observe(i * 60, i * 60 + 3000);
    const at = c.drawAt(3600);
    expect(3600 - at).toBeCloseTo(c.targetMs!, 5);
  });

  it('is idempotent within one frame and draws at now before any packet', () => {
    const c = new PlayoutClock();
    expect(c.drawAt(500)).toBe(500);
    c.observe(400, 450);
    const a = c.drawAt(500);
    expect(c.drawAt(500)).toBe(a);
  });

  it('ignores idle gaps when measuring the packet rate', () => {
    const c = new PlayoutClock();
    for (let i = 0; i < 40; i++) c.observe(i * 50, i * 50 + 30);
    const gap = c.gapMs;
    c.observe(40 * 50 + 2000, 40 * 50 + 2030);
    expect(c.gapMs).toBe(gap);
    expect(gap).toBeGreaterThan(49);
    expect(gap).toBeLessThan(60);
  });
});

describe('sinceStamp', () => {
  it('counts Host play since a stamp, never negative and never past the cap', () => {
    expect(sinceStamp(1000, 1250)).toBe(250);
    expect(sinceStamp(1000, 900)).toBe(0);
    expect(sinceStamp(1000, 1000 + CLOCK_AHEAD_MAX_MS * 3)).toBe(CLOCK_AHEAD_MAX_MS);
  });
});
