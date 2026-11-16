import { describe, expect, it } from 'vitest';
import { decideTier, FrameGovernor, FramePacer, looksLikeTvBrowser, type TierInput } from './gfx';

const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0 Safari/537.36';
const WEBVIEW_TV =
  'Mozilla/5.0 (Linux; Android 11; PLD 43BUG Build/RP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Safari/537.36';
const GOOGLE_TV =
  'Mozilla/5.0 (Linux; Android 12; Google TV Streamer) AppleWebKit/537.36 Chrome/120.0 Safari/537.36';
const PIXEL = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36';

const base: TierInput = { ua: MAC, maxTouchPoints: 0, gpu: '', layerMs: null, slowAt: null, forced: null };

describe('graphics profile', () => {
  it('recognises TV browsers, including Android without a touch screen', () => {
    expect(looksLikeTvBrowser(GOOGLE_TV, 0)).toBe(true);
    expect(looksLikeTvBrowser(WEBVIEW_TV, 0)).toBe(true);
    expect(looksLikeTvBrowser(WEBVIEW_TV, 5)).toBe(false);
    expect(looksLikeTvBrowser(PIXEL, 5)).toBe(false);
    expect(looksLikeTvBrowser(MAC, 0)).toBe(false);
  });

  it('falls back on the user agent and GPU name before the test has run', () => {
    expect(decideTier(base)).toEqual({ tier: 'high', reason: 'desktop' });
    expect(decideTier({ ...base, ua: PIXEL, maxTouchPoints: 5 })).toEqual({
      tier: 'medium',
      reason: 'mobile',
    });
    expect(decideTier({ ...base, ua: WEBVIEW_TV })).toEqual({ tier: 'low', reason: 'tv' });
    // A TV browser pretending to be a desktop is caught by its GPU.
    expect(decideTier({ ...base, gpu: 'Mali-G52 MC1' })).toEqual({ tier: 'low', reason: 'weak-gpu' });
    expect(decideTier({ ...base, gpu: 'Google SwiftShader', layerMs: 0.2 })).toEqual({
      tier: 'low',
      reason: 'software',
    });
  });

  it('trusts the measured speed, but keeps TVs at most at medium', () => {
    expect(decideTier({ ...base, gpu: 'Apple M1', layerMs: 0.32 }).tier).toBe('high');
    expect(decideTier({ ...base, layerMs: 2.1 }).tier).toBe('medium');
    expect(decideTier({ ...base, layerMs: 9 })).toEqual({ tier: 'low', reason: 'probe' });
    expect(decideTier({ ...base, ua: GOOGLE_TV, layerMs: 0.1 })).toEqual({ tier: 'medium', reason: 'probe' });
    // The measurement beats the GPU name.
    expect(decideTier({ ...base, gpu: 'Mali-G52 MC1', layerMs: 0.4 }).tier).toBe('high');
  });

  it('starts below a level a game could not hold, and a manual choice wins', () => {
    expect(decideTier({ ...base, slowAt: 'high' })).toEqual({ tier: 'medium', reason: 'remembered' });
    expect(decideTier({ ...base, slowAt: 'medium' })).toEqual({ tier: 'low', reason: 'remembered' });
    // Already lower than the remembered level: nothing changes.
    expect(decideTier({ ...base, ua: WEBVIEW_TV, slowAt: 'high' })).toEqual({ tier: 'low', reason: 'tv' });
    expect(decideTier({ ...base, slowAt: 'low', forced: 'high' })).toEqual({
      tier: 'high',
      reason: 'forced',
    });
  });
});

describe('frame pacer', () => {
  it('renders every frame, or every second 60 Hz frame when capped', () => {
    const p = new FramePacer();
    const at = (n: number) => n * (1000 / 60);
    expect([0, 1, 2, 3].map((n) => p.due(at(n)))).toEqual([true, true, true, true]);
    p.cap30 = true;
    const rendered = Array.from({ length: 12 }, (_, n) => p.due(at(n + 4))).filter(Boolean).length;
    expect(rendered).toBe(6);
    expect(p.targetMs).toBeCloseTo(33.3, 1);
  });
});

describe('frame governor', () => {
  const feed = (g: FrameGovernor, from: number, ms: number, frameMs: number, target?: number) => {
    let asked = 0;
    for (let t = from; t < from + ms; t += frameMs) if (g.frame(t, target)) asked++;
    return asked;
  };

  it('asks for a step after two slow seconds, then waits for the change to settle', () => {
    const g = new FrameGovernor();
    expect(feed(g, 0, 5000, 1000 / 60)).toBe(0);
    // 30 fps against a 60 fps target: the first step comes after two windows, the second needs
    // the 1.5 s settle time plus two more windows.
    expect(feed(g, 5000, 2200, 1000 / 30)).toBe(1);
    expect(feed(g, 7200, 1400, 1000 / 30)).toBe(0);
    expect(feed(g, 8600, 2200, 1000 / 30)).toBe(1);
  });

  it('judges a 30 fps cap against its own target, and ignores held time and hitches', () => {
    const g = new FrameGovernor();
    expect(feed(g, 0, 6000, 1000 / 30, 1000 / 30)).toBe(0);
    g.hold(10_000);
    expect(feed(g, 6000, 4000, 1000 / 10)).toBe(0);
    expect(g.frame(10_100)).toBe(false);
    expect(g.frame(13_000)).toBe(false);
  });

  it('still steps down on a device drawing about one frame a second', () => {
    const g = new FrameGovernor();
    expect(feed(g, 0, 4000, 900)).toBe(1);
  });

  it('does not count one long hitch among normal frames', () => {
    const g = new FrameGovernor();
    let asked = feed(g, 0, 2000, 1000 / 60);
    if (g.frame(2700)) asked++;
    asked += feed(g, 2716, 3000, 1000 / 60);
    expect(asked).toBe(0);
  });
});
