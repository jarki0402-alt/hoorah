import { describe, expect, it } from 'vitest';
import { focus, focused, focusFromPointer, press, setFocusMap } from './nav';

describe('focus source', () => {
  it('marks a mouse focus so the page does not glide, and clears it on a key press', () => {
    const off = setFocusMap({ rows: [['a', 'b', 'c']], onOk: () => {} }, 'a');
    focus('b', true);
    expect(focused.value).toBe('b');
    expect(focusFromPointer()).toBe(true);
    press('right');
    expect(focused.value).toBe('c');
    expect(focusFromPointer()).toBe(false);
    focus('a');
    expect(focusFromPointer()).toBe(false);
    off();
  });
});
