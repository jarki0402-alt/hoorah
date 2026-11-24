import { describe, expect, it } from 'vitest';
import { focus, focused, followFocus, followOnly, press, setFocusMap } from './nav';

describe('follower focus (far-away main screen)', () => {
  it('only moves with the Host screen: keys, mouse and page start items change nothing', () => {
    followOnly();
    let oks = 0;
    followFocus('b');
    const off = setFocusMap({ rows: [['a', 'b', 'c']], onOk: () => oks++ }, 'a');
    expect(focused.value).toBe('b');
    press('right');
    press('ok');
    focus('c', true);
    expect(focused.value).toBe('b');
    expect(oks).toBe(0);
    followFocus('c');
    expect(focused.value).toBe('c');
    // An id the page here does not have (the Host's panel) is still followed.
    followFocus('remote-close');
    expect(focused.value).toBe('remote-close');
    off();
  });
});
