import type { PlayerInfo } from '@hoorah/protocol';
import { lookOfFruit } from '@hoorah/protocol';
import { describe, expect, it } from 'vitest';
import {
  actDelay,
  type BoardView,
  chooseRenovate,
  dangerAhead,
  groupEffect,
  jailChoice,
  juraganOpponents,
  reserveFor,
  shouldBuy,
  shouldTakeover,
  shouldUpgrade,
  takeoverScore,
  visitsAhead,
} from './brain';
import { emptyTiles, type PlayerState, type TileState } from './logic';

const human = (id: number): PlayerInfo => ({
  id,
  name: `P${id}`,
  fruit: 'mangga',
  look: lookOfFruit('mangga'),
  color: '#F2453D',
  connected: true,
  isHost: id === 1,
});

function player(id: number, cash: number, pos = 0): PlayerState {
  return {
    id,
    seat: 0,
    cpu: id < 0,
    cash,
    pos,
    jailed: false,
    bankrupt: false,
    bankruptOrder: 0,
    stats: {
      rentCollected: 0,
      rentPaid: 0,
      bought: 0,
      built: 0,
      takeovers: 0,
      lost: 0,
      salaries: 0,
      cards: 0,
    },
  };
}

/** Always takes the top-ranked option (sharp, no slips). */
const sure = () => 0;
/** Always slips to the other option. */
const slip = () => 0.99;
const SHARP = 0.95;
const GENTLE = 0.05;

/** Me (-1) and two rivals (2, 3) on `tiles`, `roundsLeft` putaran to go. */
function board(tiles: TileState[], me: PlayerState, roundsLeft = 10): BoardView {
  return { players: [me, player(2, 1500), player(3, 1500)], tiles, roundsLeft };
}

describe('opponents', () => {
  it('adds two computer players for a lone human and none otherwise', () => {
    const solo = juraganOpponents([human(1)], () => 0.3);
    expect(solo).toHaveLength(2);
    expect(solo.every((p) => p.id < 0)).toBe(true);
    expect(juraganOpponents([human(1), human(2)])).toEqual([]);
  });
});

describe('danger and reserve', () => {
  it('looks for the steepest rent within one roll', () => {
    const tiles = emptyTiles();
    const me = player(-1, 1000, 20);
    tiles[23] = { owner: 2, level: 4 };
    tiles[1] = { owner: -1, level: 4 };
    const view: BoardView = { players: [me], tiles };
    expect(dangerAhead(view, me)).toBe(1080);
    me.pos = 0;
    expect(dangerAhead(view, me)).toBe(0);
  });

  it('keeps more cash in hand when sharp and in danger', () => {
    const tiles = emptyTiles();
    tiles[23] = { owner: 2, level: 4 };
    const me = player(-1, 1000, 20);
    const view: BoardView = { players: [me], tiles };
    expect(reserveFor(view, me, 0.95)).toBeGreaterThan(reserveFor(view, me, 0.05));
    expect(reserveFor(view, me, 0.95)).toBeGreaterThan(900);
  });
});

describe('buying', () => {
  it('knows when a purchase completes or blocks an island', () => {
    const tiles = emptyTiles();
    const me = player(-1, 1000);
    tiles[1]!.owner = -1;
    const view: BoardView = { players: [me], tiles };
    expect(groupEffect(view, me, 3)).toBe('complete');
    tiles[19]!.owner = 5;
    tiles[21]!.owner = 5;
    expect(groupEffect(view, me, 23)).toBe('block');
    tiles[21]!.owner = 6;
    expect(groupEffect(view, me, 23)).toBe('none');
    expect(groupEffect(view, me, 8)).toBe('none');
  });

  it('buys with cash to spare and holds back when a big rent waits ahead', () => {
    const tiles = emptyTiles();
    const me = player(-1, 1500, 0);
    const view: BoardView = { players: [me], tiles };
    expect(shouldBuy(view, me, 4, SHARP, sure)).toBe(true);
    const poor = player(-1, 600, 13);
    tiles[19] = { owner: 2, level: 3 };
    tiles[21] = { owner: 2, level: 3 };
    tiles[23] = { owner: 2, level: 3 };
    expect(shouldBuy({ players: [poor], tiles }, poor, 16, SHARP, sure)).toBe(false);
  });

  it('dips into the reserve to complete an island', () => {
    const tiles = emptyTiles();
    tiles[1]!.owner = -1;
    tiles[16] = { owner: 2, level: 1 };
    tiles[17] = { owner: 2, level: 1 };
    const me = player(-1, 300, 6);
    const view: BoardView = { players: [me], tiles };
    expect(shouldBuy(view, me, 3, SHARP, sure)).toBe(true);
    expect(shouldBuy(view, me, 7, SHARP, sure)).toBe(false);
  });

  it('never buys what it cannot pay', () => {
    const me = player(-1, 100);
    expect(shouldBuy({ players: [me], tiles: emptyTiles() }, me, 23, SHARP, () => 0.99)).toBe(false);
  });
});

describe('upgrading', () => {
  it('upgrades with cash to spare and holds back when poor', () => {
    const tiles = emptyTiles();
    tiles[1] = { owner: -1, level: 1 };
    const rich = player(-1, 1500, 1);
    expect(shouldUpgrade(board(tiles, rich), rich, 1, SHARP, sure)).toBe(true);
    const poor = player(-1, 80, 1);
    expect(shouldUpgrade(board(tiles, poor), poor, 1, SHARP, sure)).toBe(false);
  });

  it('never upgrades a Hotel, a rival city or what it cannot pay', () => {
    const tiles = emptyTiles();
    tiles[1] = { owner: -1, level: 4 };
    tiles[3] = { owner: 2, level: 1 };
    const me = player(-1, 5000, 1);
    expect(shouldUpgrade(board(tiles, me), me, 1, SHARP, sure)).toBe(false);
    expect(shouldUpgrade(board(tiles, me), me, 3, SHARP, sure)).toBe(false);
    tiles[1]!.level = 1;
    const broke = player(-1, 40, 1);
    expect(shouldUpgrade(board(tiles, broke), broke, 1, GENTLE, slip)).toBe(false);
  });

  it('never slips into an upgrade that leaves less than half the rent waiting ahead', () => {
    const tiles = emptyTiles();
    tiles[13] = { owner: -1, level: 1 };
    tiles[23] = { owner: 2, level: 4 };
    const me = player(-1, 600, 13);
    expect(dangerAhead(board(tiles, me), me)).toBe(1080);
    // Ambon to Toko costs 110 and would leave 490, under half of Jakarta's Hotel rent.
    expect(shouldUpgrade(board(tiles, me), me, 13, GENTLE, slip)).toBe(false);
  });
});

describe('taking over', () => {
  it('expects fewer rival visits as the game runs out', () => {
    const me = player(-1, 1000);
    expect(visitsAhead(board(emptyTiles(), me, 12), me)).toBeCloseTo((2 * 12 * 1.17) / 24);
    expect(visitsAhead(board(emptyTiles(), me, 0), me)).toBe(0);
  });

  it('takes a rival city that completes its own island', () => {
    const tiles = emptyTiles();
    tiles[4] = { owner: 2, level: 2 };
    tiles[5] = { owner: -1, level: 2 };
    const me = player(-1, 1500, 4);
    expect(takeoverScore(board(tiles, me), me, 4, SHARP)).toBeGreaterThan(0);
    expect(shouldTakeover(board(tiles, me), me, 4, SHARP, sure)).toBe(true);
  });

  it('leaves a loose city alone when the game is nearly over', () => {
    const tiles = emptyTiles();
    tiles[7] = { owner: 2, level: 1 };
    const me = player(-1, 3000, 7);
    expect(shouldTakeover(board(tiles, me, 1), me, 7, SHARP, sure)).toBe(false);
  });

  it('is keener when gentle than when sharp', () => {
    const tiles = emptyTiles();
    tiles[7] = { owner: 2, level: 3 };
    const me = player(-1, 3000, 7);
    expect(shouldTakeover(board(tiles, me), me, 7, SHARP, sure)).toBe(false);
    expect(shouldTakeover(board(tiles, me), me, 7, GENTLE, sure)).toBe(true);
  });

  it('breaks a rival island worth more than the price', () => {
    const tiles = emptyTiles();
    for (const i of [19, 21, 23]) tiles[i] = { owner: 2, level: 3 };
    tiles[21]!.level = 2;
    const me = player(-1, 4000, 21);
    expect(shouldTakeover(board(tiles, me), me, 21, SHARP, sure)).toBe(true);
  });

  it('never takes a Hotel, an own city or more than the cash in hand', () => {
    const tiles = emptyTiles();
    tiles[4] = { owner: 2, level: 4 };
    tiles[5] = { owner: -1, level: 1 };
    tiles[7] = { owner: 2, level: 1 };
    const me = player(-1, 5000, 4);
    expect(shouldTakeover(board(tiles, me), me, 4, GENTLE, slip)).toBe(false);
    expect(shouldTakeover(board(tiles, me), me, 5, GENTLE, slip)).toBe(false);
    const poor = player(-1, 300, 7);
    expect(shouldTakeover(board(tiles, poor), poor, 7, GENTLE, slip)).toBe(false);
  });

  it('never slips into a takeover that leaves less than half the rent waiting ahead', () => {
    const tiles = emptyTiles();
    tiles[13] = { owner: 2, level: 1 };
    tiles[23] = { owner: 3, level: 4 };
    const me = player(-1, 900, 13);
    // Ambon costs 440 and would leave 460, under half of Jakarta's Hotel rent.
    expect(shouldTakeover(board(tiles, me), me, 13, GENTLE, slip)).toBe(false);
  });
});

describe('renovating', () => {
  it('picks the most rent, a new Hotel counting extra, and never a Hotel', () => {
    const tiles = emptyTiles();
    tiles[1] = { owner: -1, level: 4 };
    tiles[4] = { owner: -1, level: 3 };
    tiles[23] = { owner: -1, level: 2 };
    const me = player(-1, 1000);
    // Pontianak Gedung to Hotel: +220 (x1.5 for a Hotel) beats Jakarta Toko to Gedung: +280.
    expect(chooseRenovate(board(tiles, me), [1, 4, 23], SHARP, sure)).toBe(4);
    tiles[4]!.level = 1;
    expect(chooseRenovate(board(tiles, me), [4, 23], SHARP, sure)).toBe(23);
    expect(chooseRenovate(board(tiles, me), [1, 4], GENTLE, slip)).toBe(4);
  });
});

describe('Pos Tilang', () => {
  it('pays while the board is open and waits once it is full', () => {
    const tiles = emptyTiles();
    const me = player(-1, 1200, 6);
    expect(jailChoice({ players: [me], tiles }, me, SHARP, sure)).toBe('pay');
    tiles.forEach((s, i) => {
      if ([1, 3, 4, 5, 7, 8, 9, 11, 13, 14, 16, 17, 19, 20, 21, 23].includes(i)) s.owner = 9;
    });
    expect(jailChoice({ players: [me], tiles }, me, SHARP, sure)).toBe('wait');
  });
});

describe('pace', () => {
  it('pauses like a person, quicker when sharp, steady when taking over', () => {
    for (const r of [0, 0.5, 0.99]) {
      const rnd = () => r;
      expect(actDelay('roll', 0.5, false, rnd)).toBeGreaterThanOrEqual(400);
      expect(actDelay('buy', 0.5, false, rnd)).toBeLessThanOrEqual(2100);
      expect(actDelay('upgrade', 0.5, false, rnd)).toBeLessThanOrEqual(1800);
      expect(actDelay('takeover', 0.5, false, rnd)).toBeGreaterThanOrEqual(1100);
      const t = actDelay('jail', 0.5, true, rnd);
      expect(t).toBeGreaterThanOrEqual(1200);
      expect(t).toBeLessThanOrEqual(2400);
    }
    expect(actDelay('buy', 0.95, false, () => 0.5)).toBeLessThan(actDelay('buy', 0.05, false, () => 0.5));
  });
});
