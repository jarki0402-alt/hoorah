import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BRAND, iconMarkup, iconSvg, wavePath, wordmark } from './brand';

const publicFile = (name: string) => fileURLToPath(new URL(`../../../public/${name}`, import.meta.url));

/** The icon files in `public/` are generated from brand.ts; `UPDATE_ICONS=1` rewrites them. */
const ICON_FILES = [
  ['icon.svg', iconSvg('one')],
  ['icon-app.svg', iconSvg('two')],
] as const;

describe('brand', () => {
  it('draws the wordmark with every letter and two w waves, in both layouts and tones', () => {
    for (const layout of ['stack', 'line'] as const) {
      for (const tone of ['dark', 'light'] as const) {
        const art = wordmark(layout, tone);
        const letters = [...art.markup.matchAll(/>([a-z])<\/text>/g)].map((m) => m[1]).join('');
        expect(letters).toBe('kacabala');
        expect(art.markup.match(/<path /g)).toHaveLength(2);
        expect(art.markup).not.toMatch(/NaN|undefined/);
        expect(art.markup).toContain(tone === 'dark' ? BRAND.yellow : BRAND.orange);
        expect(art.aspect).toBeGreaterThan(layout === 'line' ? 6 : 1.5);
      }
    }
  });

  it('keeps the two lines of the stacked wordmark right aligned (the w column)', () => {
    const xs = [...wordmark('stack').markup.matchAll(/<path d="M ([\d.-]+) /g)].map((m) => Number(m[1]));
    expect(xs).toHaveLength(2);
    expect(Math.abs(xs[0]! - xs[1]!)).toBeLessThan(0.01);
  });

  it('draws one w shape: the wave is symmetric', () => {
    const nums = wavePath(0, 0, 144, 100, 33, '#000')
      .match(/-?[\d.]+/g)!
      .map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0 && i < 26);
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(144, 1);
  });

  it('builds both icons from constants only', () => {
    for (const kind of ['one', 'two'] as const) {
      const m = iconMarkup(kind);
      expect(m).not.toMatch(/NaN|undefined/);
      expect(m.match(/<path /g)).toHaveLength(kind === 'one' ? 1 : 2);
      expect(iconMarkup(kind, true)).not.toContain('rx="52"');
    }
  });

  it('matches the icon files in public/', () => {
    for (const [name, svg] of ICON_FILES) {
      if (process.env.UPDATE_ICONS) writeFileSync(publicFile(name), svg);
      expect(readFileSync(publicFile(name), 'utf8')).toBe(svg);
    }
  });
});
