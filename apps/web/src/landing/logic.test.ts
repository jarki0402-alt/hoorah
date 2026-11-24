import { describe, expect, it } from 'vitest';
import { GAMES } from '../shared/games';
import {
  arrowDir,
  type Box,
  completeCode,
  countUp,
  driftOffset,
  easeOutCubic,
  filterGames,
  formatCodeInput,
  HERO_GAMES,
  joinPath,
  MOOD_FILTERS,
  nextIndex,
  parseNearby,
  partyPool,
  pickGames,
  pickNeighbor,
  pinOffset,
  playableCatalog,
  sectionProgress,
  splitRows,
  stepAt,
} from './logic';

describe('room code typing', () => {
  it('groups the digits like the main screen shows them', () => {
    expect(formatCodeInput('')).toBe('');
    expect(formatCodeInput('48')).toBe('48');
    expect(formatCodeInput('482')).toBe('482');
    expect(formatCodeInput('4829')).toBe('482 9');
    expect(formatCodeInput('482917')).toBe('482 917');
  });

  it('drops spaces, dashes and letters and stops at six digits', () => {
    expect(formatCodeInput('482 917')).toBe('482 917');
    expect(formatCodeInput('482-917')).toBe('482 917');
    expect(formatCodeInput('a4b8c2 9x17')).toBe('482 917');
    expect(formatCodeInput('4829175555')).toBe('482 917');
  });

  it('knows a complete code', () => {
    expect(completeCode('482 91')).toBeNull();
    expect(completeCode('482 917')).toBe('482917');
  });

  it('joins through the invite link only with all six digits', () => {
    expect(joinPath('482 917')).toBe('/R/482917');
    expect(joinPath('48291')).toBeNull();
    expect(joinPath('')).toBeNull();
  });
});

describe('parseNearby', () => {
  it('keeps well-formed rooms and drops broken players', () => {
    const rooms = parseNearby([
      {
        code: '482917',
        seatsLeft: 1,
        players: [
          { name: 'Rina', fruit: 'durian', color: '#F2453D' },
          { name: 'X', fruit: 'apel', color: '#fff' },
          null,
        ],
      },
      { code: 'ABCDEF', players: [] },
      { code: '123456' },
      'junk',
    ]);
    expect(rooms).toEqual([
      { code: '482917', seatsLeft: 1, players: [{ name: 'Rina', fruit: 'durian', color: '#F2453D' }] },
    ]);
  });

  it('returns nothing for a non-list and caps the count', () => {
    expect(parseNearby({ code: '482917' })).toEqual([]);
    const many = Array.from({ length: 6 }, (_, i) => ({ code: `10000${i}`, players: [] }));
    expect(parseNearby(many)).toHaveLength(3);
  });
});

describe('games', () => {
  it('filters by mood and keeps catalog order', () => {
    const all = playableCatalog();
    expect(filterGames(all, 'all')).toEqual(all);
    for (const mood of MOOD_FILTERS) {
      if (mood === 'all') continue;
      const list = filterGames(all, mood);
      expect(list.length).toBeGreaterThan(0);
      expect(list.every((id) => GAMES[id].mood === mood)).toBe(true);
      expect(list).toEqual(all.filter((id) => list.includes(id)));
    }
  });

  it('deals games into two alternating rows', () => {
    expect(splitRows([1, 2, 3, 4, 5])).toEqual([
      [1, 3, 5],
      [2, 4],
    ]);
    expect(splitRows([])).toEqual([[], []]);
  });

  it('cycles the hero games through playable ones', () => {
    expect(HERO_GAMES.every((id) => GAMES[id].available)).toBe(true);
    expect(nextIndex(HERO_GAMES.length - 1, HERO_GAMES.length)).toBe(0);
    expect(nextIndex(3, 0)).toBe(0);
  });

  it('picks distinct party games without long ones', () => {
    const pool = partyPool();
    expect(pool.some((id) => GAMES[id].long)).toBe(false);
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const picked = pickGames(pool, 5, random);
    expect(picked).toHaveLength(5);
    expect(new Set(picked).size).toBe(5);
    expect(picked.every((id) => pool.includes(id))).toBe(true);
    expect(pickGames(['kuis', 'tarik'], 5, random)).toHaveLength(2);
  });
});

describe('scroll mapping', () => {
  it('maps a section passing through the screen to 0..1', () => {
    expect(sectionProgress(1000, 500, 1000)).toBe(0);
    expect(sectionProgress(-500, 500, 1000)).toBe(1);
    expect(sectionProgress(250, 500, 1000)).toBe(0.5);
    expect(sectionProgress(5000, 500, 1000)).toBe(0);
    expect(sectionProgress(0, 0, 0)).toBe(0);
  });

  it('drifts a wide row across its whole overflow, the second row the other way', () => {
    expect(driftOffset(0, 3000, 1000, false)).toBe(-0);
    expect(driftOffset(1, 3000, 1000, false)).toBe(-2000);
    expect(driftOffset(0.5, 3000, 1000, false)).toBe(-1000);
    expect(driftOffset(0, 3000, 1000, true)).toBe(-2000);
    expect(driftOffset(1, 3000, 1000, true)).toBe(-0);
    expect(driftOffset(2, 3000, 1000, false)).toBe(-2000);
  });

  it('centers a row that fits', () => {
    expect(driftOffset(0.3, 600, 1000, false)).toBe(200);
    expect(pinOffset(0, 100, 600, 1000)).toBe(200);
  });

  it('pins a focused card mid-screen without showing past the row ends', () => {
    expect(pinOffset(1450, 100, 3000, 1000)).toBe(-1000);
    expect(pinOffset(0, 100, 3000, 1000)).toBe(0);
    expect(pinOffset(2900, 100, 3000, 1000)).toBe(-2000);
  });

  it('picks the step for a progress', () => {
    expect(stepAt(0, 3)).toBe(0);
    expect(stepAt(0.34, 3)).toBe(1);
    expect(stepAt(0.99, 3)).toBe(2);
    expect(stepAt(1, 3)).toBe(2);
    expect(stepAt(-1, 3)).toBe(0);
    expect(stepAt(0.5, 0)).toBe(0);
  });

  it('counts up with an ease-out and lands on the target', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(countUp(0, 1000, 30)).toBe(0);
    expect(countUp(500, 1000, 30)).toBeGreaterThan(15);
    expect(countUp(1000, 1000, 30)).toBe(30);
    expect(countUp(5000, 1000, 16)).toBe(16);
    expect(countUp(10, 0, 16)).toBe(16);
  });
});

describe('remote navigation', () => {
  const box = (left: number, top: number, w = 100, h = 40): Box => ({
    left,
    top,
    right: left + w,
    bottom: top + h,
  });

  it('reads arrow keys, old Smart TV names included', () => {
    expect(arrowDir('ArrowDown')).toBe('down');
    expect(arrowDir('Left')).toBe('left');
    expect(arrowDir('Enter')).toBeNull();
  });

  //  [a]  [b]
  //  [c]       [d]
  //       [e]
  const a = box(0, 0);
  const b = box(200, 0);
  const c = box(0, 100);
  const d = box(400, 100);
  const e = box(150, 200);
  const all = [a, b, c, d, e];

  it('moves to the nearest box in line first', () => {
    expect(pickNeighbor(a, all, 'right')).toBe(1);
    expect(pickNeighbor(a, all, 'down')).toBe(2);
    expect(pickNeighbor(c, all, 'up')).toBe(0);
    expect(pickNeighbor(c, all, 'right')).toBe(3);
    expect(pickNeighbor(b, all, 'left')).toBe(0);
  });

  it('reaches boxes that are not in line', () => {
    expect(pickNeighbor(c, all, 'down')).toBe(4);
    expect(pickNeighbor(b, all, 'down')).toBe(4);
    expect(pickNeighbor(e, all, 'up')).toBe(1);
  });

  it('finds nothing past the edge', () => {
    expect(pickNeighbor(a, all, 'up')).toBe(-1);
    expect(pickNeighbor(a, all, 'left')).toBe(-1);
    expect(pickNeighbor(e, all, 'down')).toBe(-1);
  });
});
