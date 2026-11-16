import { describe, expect, it } from 'vitest';
import { assignSides, Setup } from './setup';

describe('side assignment', () => {
  it('gives Sisi Persiapan ceil(n/2) cooks by join order', () => {
    expect([...assignSides([1, 2]).values()]).toEqual([0, 1]);
    expect([...assignSides([1, 2, 3]).values()]).toEqual([0, 0, 1]);
    expect([...assignSides([1, 2, 3, 4]).values()]).toEqual([0, 0, 1, 1]);
    expect([...assignSides([1, 2, 3, 4, 5, 6, 7]).values()]).toEqual([0, 0, 0, 0, 1, 1, 1]);
    expect([...assignSides([1]).values()]).toEqual([0]);
  });

  it('solo: the person preps, the computer helper (negative id) cooks', () => {
    const s = new Setup({ humans: 1 });
    s.sync([5, -1], 1);
    expect(s.sideOf(5)).toBe(0);
    expect(s.sideOf(-1)).toBe(1);
    expect(s.kitchen).toBe('warung');
  });

  it('newcomers join the smaller side and nobody else moves', () => {
    const s = new Setup({ humans: 2 });
    s.sync([1, 2], 2);
    s.sync([1, 2, 3], 3);
    expect(s.sideOf(3)).toBe(0);
    s.sync([1, 2, 3, 4], 4);
    expect(s.sideOf(4)).toBe(1);
    expect([s.sideOf(1), s.sideOf(2)]).toEqual([0, 1]);
  });

  it('a side that runs empty takes the last cook of the other side', () => {
    const s = new Setup({ humans: 3 });
    s.sync([1, 2, 3], 3);
    s.sync([1, 2], 2); // 3 (Masak) left
    expect(s.count(0)).toBe(1);
    expect(s.count(1)).toBe(1);
  });

  it('swapping moves a cook across, trading places when their side would be empty', () => {
    const s = new Setup({ humans: 3 });
    s.sync([1, 2, 3], 3);
    expect(s.swap(1).kind).toBe('changed');
    expect(s.sideOf(1)).toBe(1);
    expect(s.count(0)).toBe(1);
    expect(s.swap(2).kind).toBe('changed'); // last on Persiapan: trades with the last on Masak
    expect(s.count(0)).toBe(1);
    expect(s.count(1)).toBe(2);
    expect(s.sideOf(2)).toBe(1);
    const solo = new Setup({ humans: 1 });
    solo.sync([1], 1);
    expect(solo.swap(1).kind).toBe('refused');
  });

  it('the suggested kitchen follows the head count until the Host picks', () => {
    const s = new Setup({ humans: 1 });
    s.sync([1, -1], 1);
    expect(s.kitchen).toBe('warung');
    s.sync([1, 2], 2);
    expect(s.kitchen).toBe('terbelah');
    s.act('pick', 'gerobak');
    s.sync([1, 2, 3], 3);
    expect(s.kitchen).toBe('gerobak');
  });

  it('walks kitchen -> level -> sides -> start (open kitchens skip sides)', () => {
    const s = new Setup({ humans: 2, kitchen: 'terbelah' });
    s.sync([1, 2], 2);
    expect(s.act('pick', 'nope').kind).toBe('none');
    expect(s.act('next', undefined).kind).toBe('changed');
    expect(s.step).toBe('level');
    expect(s.act('pick', 'heboh').kind).toBe('changed');
    expect(s.difficulty).toBe('heboh');
    s.act('next', undefined);
    expect(s.step).toBe('sides');
    expect(s.act('pick', '1').kind).toBe('changed');
    expect(s.act('start', undefined).kind).toBe('start');
    const w = new Setup({ humans: 2, kitchen: 'warung' });
    w.sync([1, 2], 2);
    w.act('next', undefined);
    expect(w.act('start', undefined).kind).toBe('start');
  });
});
