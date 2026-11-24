import { DEFAULT_CONFIG, FREE_ACCESS, type RoomAccess } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import {
  canPlay,
  FREE_GAMES,
  isFreeGame,
  limitedRun,
  playableGames,
  weekIndex,
  weeklyGame,
  weeklyPool,
} from './freeTier';
import { CATALOG, GAMES } from './games';

const at = (iso: string) => Date.parse(iso);
const access = (kind: RoomAccess['kind']): RoomAccess => ({ kind, until: null, trialUsed: false });

describe('free tier', () => {
  it('lists the free games, all of them in the catalog and playable', () => {
    expect([...FREE_GAMES].sort()).toEqual(
      ['bajaj', 'catur', 'congklak', 'kompak', 'kuis', 'rusun', 'tarik', 'ular', 'warna'].sort(),
    );
    for (const id of FREE_GAMES) expect(GAMES[id].available).toBe(true);
  });

  it('rotates the weekly game through the non-free games in catalog order', () => {
    const pool = weeklyPool();
    expect(pool.length).toBe(CATALOG.filter((id) => GAMES[id].available).length - FREE_GAMES.length);
    for (const id of pool) expect(FREE_GAMES).not.toContain(id);
    expect(pool).toEqual(CATALOG.filter((id) => pool.includes(id)));
  });

  it('changes the weekly game on Monday 00:00 WIB, not on UTC midnight', () => {
    // Monday 2026-11-23 00:00 WIB = Sunday 2026-11-22 17:00 UTC.
    const sundayLate = at('2026-11-22T16:59:59Z');
    const mondayStart = at('2026-11-22T17:00:00Z');
    const sundayNight = at('2026-11-29T16:59:59Z');
    expect(weekIndex(mondayStart)).toBe(weekIndex(sundayLate) + 1);
    expect(weekIndex(sundayNight)).toBe(weekIndex(mondayStart));
    expect(weeklyGame(DEFAULT_CONFIG, mondayStart)).not.toBe(weeklyGame(DEFAULT_CONFIG, sundayLate));
    expect(weeklyGame(DEFAULT_CONFIG, sundayNight)).toBe(weeklyGame(DEFAULT_CONFIG, mondayStart));
    const pool = weeklyPool();
    const a = pool.indexOf(weeklyGame(DEFAULT_CONFIG, sundayLate)!);
    const b = pool.indexOf(weeklyGame(DEFAULT_CONFIG, mondayStart)!);
    expect(b).toBe((a + 1) % pool.length);
  });

  it('uses the owner pick when it is a real, playable game, else the rotation', () => {
    const now = at('2026-11-25T05:00:00Z');
    expect(weeklyGame({ ...DEFAULT_CONFIG, weeklyGame: 'ludo' }, now)).toBe('ludo');
    expect(weeklyGame({ ...DEFAULT_CONFIG, weeklyGame: 'nope' }, now)).toBe(weeklyGame(DEFAULT_CONFIG, now));
    expect(weeklyGame(null, now)).toBe(weeklyGame(DEFAULT_CONFIG, now));
  });

  it('lets each access kind play what it should', () => {
    const now = at('2026-11-25T05:00:00Z');
    const config = { ...DEFAULT_CONFIG, weeklyGame: 'ludo' };
    const locked = CATALOG.find((id) => !FREE_GAMES.includes(id) && id !== 'ludo')!;
    expect(canPlay('tarik', FREE_ACCESS, config, now)).toBe(true);
    expect(canPlay('ludo', FREE_ACCESS, config, now)).toBe(true);
    expect(canPlay(locked, FREE_ACCESS, config, now)).toBe(false);
    expect(canPlay(locked, null, config, now)).toBe(false);
    for (const kind of ['trial', 'pass', 'open'] as const)
      expect(canPlay(locked, access(kind), config, now)).toBe(true);
    expect(isFreeGame('ludo', config, now)).toBe(true);
    expect(isFreeGame(locked, config, now)).toBe(false);
  });

  it('limits Warna in a free room unless it is the weekly game or the room is premium', () => {
    const now = at('2026-11-25T05:00:00Z');
    expect(limitedRun('warna', FREE_ACCESS, DEFAULT_CONFIG, now)).toBe(true);
    expect(limitedRun('warna', access('trial'), DEFAULT_CONFIG, now)).toBe(false);
    expect(limitedRun('warna', FREE_ACCESS, { ...DEFAULT_CONFIG, weeklyGame: 'warna' }, now)).toBe(false);
  });

  it('keeps only playable games on the wheel without premium, every game with it', () => {
    const now = at('2026-11-25T05:00:00Z');
    const config = { ...DEFAULT_CONFIG, weeklyGame: 'ludo' };
    const pool = playableGames(CATALOG, FREE_ACCESS, config, now);
    expect([...pool].sort()).toEqual([...FREE_GAMES, 'ludo'].sort());
    expect(playableGames(CATALOG, access('pass'), config, now)).toEqual(CATALOG);
  });
});
