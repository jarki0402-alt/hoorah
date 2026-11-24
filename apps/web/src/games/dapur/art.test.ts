import { type Look, lookAt, lookOfFruit } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { SKIN_PALETTE } from '../../shared/art/people';
import { chefHead, chefMarkup, lookId, skinColor } from './art';
import { DapurMatch } from './logic';

describe('cooks wear the player look', () => {
  it('draws the head from the look, cut at the collar, on the chef sprite grid', () => {
    const a = chefHead({ c: 'mia' }, 'happy', 'u1');
    expect(a.startsWith('<svg x="0" y="0" width="64"')).toBe(true);
    expect(a).toContain('viewBox="0 0 200 160"');
    expect(chefHead({ c: 'bram' }, 'happy', 'u1')).not.toBe(a);
    expect(chefHead({ c: 'mia', oc: 4 }, 'happy', 'u1')).not.toBe(a);
    expect(chefHead({ c: 'mia' }, 'effort', 'u1')).not.toBe(a);
  });

  it('gives every look its own stable id for textures', () => {
    expect(lookId({ c: 'mia' })).toBe(lookId({ c: 'mia' }));
    const looks: Look[] = [
      { c: 'mia' },
      { c: 'mia', s: 2 },
      { c: 'mia', h: 'bram' },
      { c: 'mia', hc: 1 },
      { c: 'mia', oc: 1 },
    ];
    const ids = new Set(looks.map(lookId));
    expect(ids.size).toBe(5);
  });

  it('tints the hands with the skin tone of the look', () => {
    expect(skinColor({ c: 'mia', s: 5 })).toBe(SKIN_PALETTE[4]);
    expect(skinColor({ c: 'mia', s: 1 })).toBe(SKIN_PALETTE[0]);
  });

  it('key art still takes a fruit (its matching character) or a look', () => {
    const byFruit = chefMarkup('semangka', '#FF5A1F', 100, 100, 1);
    expect(byFruit).toContain(skinColor(lookOfFruit('semangka')));
    expect(chefMarkup(lookAt(3), '#FF5A1F', 100, 100, 1)).toContain('<svg x="0" y="0" width="64"');
  });

  it('match cooks carry and follow the look', () => {
    const m = new DapurMatch({
      kitchen: 'warung',
      difficulty: 'normal',
      cooks: [{ id: 1, name: 'A', fruit: 'jeruk', look: { c: 'mia', oc: 2 }, color: '#FF5A1F', side: 0 }],
      now: 0,
    });
    expect(m.chef(1)?.look).toEqual({ c: 'mia', oc: 2 });
    m.restyle(1, { look: { c: 'bram' } });
    expect(m.chef(1)?.look).toEqual({ c: 'bram' });
  });
});
