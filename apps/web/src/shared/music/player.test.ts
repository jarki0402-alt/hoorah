import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NoteEvent } from './score';
import { Channel, type Song } from './synth';

const { songs } = vi.hoisted(() => {
  const tone = {
    kind: 'tone' as const,
    layers: [{ wave: 'sine' as const }],
    env: { a: 0.01, d: 0.1, s: 0.5, r: 0.1 },
    range: [48, 84] as const,
  };
  const base = {
    title: 'Test',
    bpm: 120,
    gain: 1,
    form: ['A'],
    sections: {
      A: {
        bars: 1,
        chords: 'C',
        parts: {
          lead: 'c5 . c5 . c5 . c5 . c5 . c5 . c5 . c5 .',
          drums: 'c4 . . . c4 . . . c4 . . . c4 . . .',
        },
      },
    },
  };
  const songs: Record<string, unknown> = {
    plain: { ...base, id: 'plain', inst: { lead: { ...tone, level: 0.3 }, drums: { ...tone, level: 0.3 } } },
    layered: {
      ...base,
      id: 'layered',
      inst: { lead: { ...tone, level: 0.3 }, drums: { ...tone, level: 0.3, tier: 2 } },
      sections: {
        A: {
          bars: 1,
          chords: 'C',
          parts: {
            lead: 'c5 . c5 . c5 . c5 . c5 . c5 . c5 . c5 .',
            drums: 'c4 . c4 . c4 . c4 . c4 . c4 . c4 . c4 .',
          },
        },
      },
    },
  };
  return { songs };
});

vi.mock('./songs', () => ({ getSong: (id: string) => songs[id] as Song | undefined }));

const { MusicPlayer } = await import('./player');

/** A Web Audio stand-in: every property and call returns another stand-in; numbers read as 0. */
function stub(): BaseAudioContext {
  const handler: ProxyHandler<() => void> = {
    get: (_t, key) => {
      if (key === Symbol.toPrimitive) return () => 0;
      if (key === 'then') return undefined;
      return make();
    },
    set: () => true,
    apply: () => make(),
  };
  const make = (): unknown => new Proxy(() => {}, handler);
  return make() as BaseAudioContext;
}

function record(): { inst: string; t: number }[] {
  const played: { inst: string; t: number }[] = [];
  vi.spyOn(Channel.prototype, 'play').mockImplementation(function (this: Channel, e: NoteEvent, t: number) {
    played.push({ inst: e.inst, t });
  });
  return played;
}

afterEach(() => vi.restoreAllMocks());

describe('music player, adaptive layers', () => {
  it('plays songs without tiers in full at every intensity', () => {
    const played = record();
    const p = new MusicPlayer(stub(), stub() as unknown as AudioNode, { realtime: false, lite: true });
    p.play('plain', 0);
    p.scheduleUntil(2);
    expect(played.filter((n) => n.inst === 'drums').length).toBeGreaterThan(0);
    expect(played.filter((n) => n.inst === 'lead').length).toBeGreaterThan(0);
  });

  it('holds back a tier 2 layer until the intensity reaches 2, without restarting the song', () => {
    const played = record();
    const p = new MusicPlayer(stub(), stub() as unknown as AudioNode, { realtime: false, lite: true });
    p.play('layered', 0);
    p.scheduleUntil(2);
    expect(played.some((n) => n.inst === 'drums')).toBe(false);
    const leadBefore = played.filter((n) => n.inst === 'lead').length;
    p.setIntensity(1);
    p.scheduleUntil(4);
    expect(played.some((n) => n.inst === 'drums')).toBe(false);
    p.setIntensity(2);
    p.scheduleUntil(6);
    const drums = played.filter((n) => n.inst === 'drums');
    expect(drums.length).toBeGreaterThan(0);
    expect(drums[0]!.t).toBeGreaterThan(3.98);
    // The base layer kept its steady grid the whole time.
    const lead = played.filter((n) => n.inst === 'lead');
    expect(lead.length).toBeGreaterThan(leadBefore);
    expect(p.current).toBe('layered');
  });

  it('keeps the old song on its exact written grid', () => {
    const played = record();
    const p = new MusicPlayer(stub(), stub() as unknown as AudioNode, { realtime: false, lite: true });
    p.play('plain', 0);
    p.scheduleUntil(4);
    const lead = played.filter((n) => n.inst === 'lead');
    // 120 bpm: an 8th note every 0.25 s (timing jitter is under 10 ms).
    lead.forEach((n, i) => {
      expect(Math.abs(n.t - i * 0.25)).toBeLessThan(0.01);
    });
  });

  it('hurry tightens the grid gradually, about 8% at most', () => {
    const played = record();
    const p = new MusicPlayer(stub(), stub() as unknown as AudioNode, { realtime: false, lite: true });
    p.play('plain', 0);
    p.setHurry(true);
    p.scheduleUntil(20);
    const lead = played.filter((n) => n.inst === 'lead').map((n) => n.t);
    const gaps = lead.slice(1).map((t, i) => t - lead[i]!);
    const first = gaps[0]!;
    const last = gaps[gaps.length - 1]!;
    expect(first).toBeGreaterThan(0.24);
    expect(last).toBeGreaterThan(0.25 / 1.08 - 0.012);
    expect(last).toBeLessThan(0.25 / 1.04);
  });
});
