import { type AppConfig, DEFAULT_CONFIG, type RoomAccess } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import { GAMES } from '../shared/games';
import { AdPlanner, showcaseGames } from './ads';

const MIN = 60_000;
const T0 = 1_000_000;
const FREE: RoomAccess = { kind: 'free', until: null, trialUsed: false };
const CFG: AppConfig = { ...DEFAULT_CONFIG, adsEnabled: true, adEveryGames: 2, adMinGapMin: 10 };

function played(p: AdPlanner, n: number): AdPlanner {
  for (let i = 0; i < n; i++) p.gameFinished();
  return p;
}

describe('AdPlanner', () => {
  it('never shows a break before the first game of the session', () => {
    const p = new AdPlanner(T0);
    expect(p.due(FREE, { ...CFG, adEveryGames: 1, adMinGapMin: 0 }, T0 + 60 * MIN)).toBe(false);
  });

  it('shows a break once enough games finished and enough time passed', () => {
    const p = played(new AdPlanner(T0), 2);
    expect(p.due(FREE, CFG, T0 + 10 * MIN)).toBe(true);
  });

  it('waits for adEveryGames finished games', () => {
    const p = played(new AdPlanner(T0), 1);
    expect(p.due(FREE, CFG, T0 + 60 * MIN)).toBe(false);
    p.gameFinished();
    expect(p.due(FREE, CFG, T0 + 60 * MIN)).toBe(true);
  });

  it('counts the first gap from the session start', () => {
    const p = played(new AdPlanner(T0), 5);
    expect(p.due(FREE, CFG, T0 + 10 * MIN - 1)).toBe(false);
    expect(p.due(FREE, CFG, T0 + 10 * MIN)).toBe(true);
  });

  it('keeps adMinGapMin minutes between two breaks and restarts the game count', () => {
    const p = played(new AdPlanner(T0), 2);
    p.shown(T0 + 20 * MIN);
    expect(p.due(FREE, CFG, T0 + 21 * MIN)).toBe(false);
    played(p, 2);
    expect(p.due(FREE, CFG, T0 + 29 * MIN)).toBe(false);
    expect(p.due(FREE, CFG, T0 + 30 * MIN)).toBe(true);
    expect(p.count).toBe(1);
  });

  it('after a break, needs adEveryGames new games even when the gap has passed', () => {
    const p = played(new AdPlanner(T0), 3);
    p.shown(T0 + 15 * MIN);
    played(p, 1);
    expect(p.due(FREE, CFG, T0 + 90 * MIN)).toBe(false);
  });

  it('never shows a break in a premium room', () => {
    const p = played(new AdPlanner(T0), 4);
    const now = T0 + 60 * MIN;
    for (const kind of ['trial', 'pass', 'open'] as const) {
      expect(p.due({ kind, until: now + MIN, trialUsed: kind === 'trial' }, CFG, now)).toBe(false);
    }
    expect(p.due(FREE, CFG, now)).toBe(true);
  });

  it('treats unknown access as free', () => {
    const p = played(new AdPlanner(T0), 2);
    expect(p.due(null, CFG, T0 + 10 * MIN)).toBe(true);
  });

  it('never shows a break when ads are off', () => {
    const p = played(new AdPlanner(T0), 4);
    expect(p.due(FREE, { ...CFG, adsEnabled: false }, T0 + 60 * MIN)).toBe(false);
  });

  it('never shows a break during Mode Pesta', () => {
    const p = played(new AdPlanner(T0), 4);
    expect(p.due(FREE, CFG, T0 + 60 * MIN, true)).toBe(false);
  });

  it('with no minimum gap, a break can follow every finished game', () => {
    const cfg = { ...CFG, adEveryGames: 1, adMinGapMin: 0 };
    const p = played(new AdPlanner(T0), 1);
    expect(p.due(FREE, cfg, T0)).toBe(true);
    p.shown(T0);
    expect(p.due(FREE, cfg, T0)).toBe(false);
    p.gameFinished();
    expect(p.due(FREE, cfg, T0)).toBe(true);
  });

  it('reset starts a fresh session', () => {
    const p = played(new AdPlanner(T0), 4);
    p.shown(T0 + 20 * MIN);
    p.reset(T0 + 30 * MIN);
    expect(p.count).toBe(0);
    expect(p.due(FREE, CFG, T0 + 90 * MIN)).toBe(false);
    played(p, 2);
    expect(p.due(FREE, CFG, T0 + 39 * MIN)).toBe(false);
    expect(p.due(FREE, CFG, T0 + 40 * MIN)).toBe(true);
  });
});

describe('showcaseGames', () => {
  it('shows three newest wave 3 games, never the next game', () => {
    const list = showcaseGames('hantu');
    expect(list).toHaveLength(3);
    expect(list).not.toContain('hantu');
    for (const id of list) expect(GAMES[id].wave).toBe(3);
    expect(new Set(list).size).toBe(3);
  });

  it('rotates between breaks', () => {
    expect(showcaseGames('kuis', 0)).not.toEqual(showcaseGames('kuis', 1));
  });
});
