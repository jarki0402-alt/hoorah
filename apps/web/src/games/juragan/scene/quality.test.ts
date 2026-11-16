import { describe, expect, it } from 'vitest';
import { type LadderState, nextRung, pickTier, QUALITY, type Rung, rungLabel } from './quality';

/** Applies rungs until the ladder ends; returns the labels in order. */
function walk(start: LadderState): string[] {
  const s = { ...start };
  const out: string[] = [];
  for (let i = 0; i < 30; i++) {
    const r: Rung = nextRung(s);
    out.push(rungLabel(r));
    if (r.kind === 'none') break;
    if (r.kind === 'shadow') s.shadowMap = r.size;
    else if (r.kind === 'ratio') s.ratio = r.ratio;
    else s.cap30 = true;
  }
  return out;
}

describe('juragan quality', () => {
  it('maps the debug parameter before the profile', () => {
    expect(pickTier('high', '?q=1')).toBe('low');
    expect(pickTier('low', '?q=2')).toBe('medium');
    expect(pickTier('low', '?q=3&demo=6')).toBe('high');
    expect(pickTier('medium', '?q=9')).toBe('medium');
    expect(pickTier('low', '')).toBe('low');
  });

  it('keeps the levels ordered', () => {
    const { high, medium, low } = QUALITY;
    expect(high.antialias && medium.antialias && !low.antialias).toBe(true);
    expect(high.maxRatio).toBeGreaterThan(medium.maxRatio);
    expect(medium.maxRatio).toBeGreaterThan(low.maxRatio);
    expect(low.minRatio).toBe(0.5);
    expect(low.shadowMap).toBe(0);
    expect(low.rich).toBe(false);
    expect(low.boardPrint).toBeLessThan(medium.boardPrint);
  });

  it('walks high down: shadows, resolution to 0.75, then 30 fps', () => {
    const q = QUALITY.high;
    expect(walk({ shadowMap: q.shadowMap, ratio: 1.5, minRatio: q.minRatio, cap30: false })).toEqual([
      'shadow 1024',
      'shadow off',
      'ratio 1.35',
      'ratio 1.20',
      'ratio 1.05',
      'ratio 0.90',
      'ratio 0.75',
      'cap30',
      'none',
    ]);
  });

  it('walks low down from 0.75 to 0.5 without shadow steps', () => {
    const q = QUALITY.low;
    expect(walk({ shadowMap: q.shadowMap, ratio: q.maxRatio, minRatio: q.minRatio, cap30: false })).toEqual([
      'ratio 0.60',
      'ratio 0.50',
      'cap30',
      'none',
    ]);
  });

  it('never steps the resolution below the floor or up', () => {
    const r = nextRung({ shadowMap: 0, ratio: 0.7, minRatio: 0.65, cap30: false });
    expect(r).toEqual({ kind: 'ratio', ratio: 0.65 });
    const small = nextRung({ shadowMap: 0, ratio: 0.6, minRatio: 0.65, cap30: false });
    expect(small).toEqual({ kind: 'cap30' });
  });
});
