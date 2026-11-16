import { describe, expect, it } from 'vitest';
import { CITY_TILES, type CityTile, TILANG_TILE, TILES } from './board';
import { CARD_IDS, type CardId } from './cards';
import {
  AWAY_MS,
  BUY_MS,
  clampRounds,
  emptyTiles,
  INTRO_MS,
  type JuraganEvent,
  JuraganLogic,
  netWorth,
  type Phase,
  RENOVATE_MS,
  type RosterEntry,
  rentAt,
  standings,
  TAKEOVER_MS,
  takeoverPrice,
  taxAt,
  UPGRADE_MS,
  upgradeCost,
  valueAt,
} from './logic';

const TWO: RosterEntry[] = [
  { id: 1, connected: true },
  { id: 2, connected: true },
];

/** A game driven by hand: fixed dice, fixed cards, time moved deadline by deadline. */
class Sim {
  now = 0;
  readonly L: JuraganLogic;
  readonly events: JuraganEvent[] = [];
  private readonly rolls: [number, number][];

  constructor(
    opts: { roster?: RosterEntry[]; rolls?: [number, number][]; deck?: CardId[]; rounds?: number } = {},
  ) {
    this.rolls = [...(opts.rolls ?? [])];
    const L = new JuraganLogic({
      roster: opts.roster ?? TWO,
      rounds: opts.rounds ?? 12,
      now: 0,
      seed: 7,
      dice: () => this.rolls.shift() ?? [1, 2],
      deck: opts.deck,
    });
    this.L = L;
    this.pull();
  }

  push(...r: [number, number][]): void {
    this.rolls.push(...r);
  }

  private pull(): void {
    this.events.push(...this.L.drain());
  }

  /** Let time run (timeouts included) until `pred` holds. */
  until(pred: () => boolean, max = 400): void {
    for (let i = 0; i < max && !pred(); i++) {
      this.now = Math.max(this.now, this.L.deadline);
      this.L.tick(this.now);
      this.pull();
    }
    expect(pred()).toBe(true);
  }

  phase(p: Phase, player?: number): void {
    this.until(() => this.L.phase === p && (player === undefined || this.L.player.id === player));
  }

  roll(): void {
    expect(this.L.roll(this.L.player.id, this.now)).toBe(true);
    this.pull();
  }

  decide(choice: string): void {
    expect(this.L.decide(this.L.player.id, choice, this.now)).toBe(true);
    this.pull();
  }

  p(id: number) {
    return this.L.playerById(id)!;
  }

  of<T extends JuraganEvent['type']>(type: T): Extract<JuraganEvent, { type: T }>[] {
    return this.events.filter((e): e is Extract<JuraganEvent, { type: T }> => e.type === type);
  }
}

describe('setup', () => {
  it('seats connected players with Rp 1,5 jt on Gajian and starts putaran 1 after the intro', () => {
    const s = new Sim();
    expect(s.L.players.map((p) => [p.id, p.cash, p.pos])).toEqual([
      [1, 1500, 0],
      [2, 1500, 0],
    ]);
    expect(s.L.phase).toBe('intro');
    expect(s.L.round).toBe(0);
    s.phase('roll', 1);
    expect(s.now).toBe(INTRO_MS);
    expect(s.L.round).toBe(1);
    expect(s.L.rounds).toBe(12);
    expect(s.of('round')).toEqual([{ type: 'round', round: 1, last: false }]);
  });

  it('clamps the number of putaran', () => {
    expect(clampRounds(14)).toBe(14);
    expect(clampRounds('10')).toBe(10);
    expect(clampRounds(1)).toBe(4);
    expect(clampRounds(500)).toBe(40);
    expect(clampRounds(undefined)).toBe(12);
    expect(clampRounds('abc')).toBe(12);
  });
});

describe('board tables', () => {
  it('derives rents and upgrade costs from the price', () => {
    const medan = TILES[1] as CityTile;
    const jakarta = TILES[23] as CityTile;
    expect(medan.rent).toEqual([20, 60, 140, 300]);
    expect(medan.upgrade).toEqual([50, 80, 100]);
    expect(jakarta.rent).toEqual([70, 220, 500, 1080]);
    expect(jakarta.upgrade).toEqual([180, 270, 360]);
  });

  it('makes every level dearer and pay steeply more on every city', () => {
    for (const i of CITY_TILES) {
      const t = TILES[i] as CityTile;
      expect(t.upgrade[0]).toBeLessThan(t.upgrade[1]);
      expect(t.upgrade[1]).toBeLessThan(t.upgrade[2]);
      expect(t.upgrade[2]).toBe(t.price);
      expect(t.rent[1] / t.rent[0]).toBeGreaterThanOrEqual(2.5);
      expect(t.rent[2] / t.rent[1]).toBeGreaterThanOrEqual(2);
      expect(t.rent[3] / t.rent[2]).toBeGreaterThanOrEqual(2);
      for (const v of [...t.rent, ...t.upgrade]) expect(v % 10).toBe(0);
    }
  });
});

describe('moving around', () => {
  it('pays salary when passing Gajian', () => {
    const s = new Sim({ rolls: [[3, 2]] });
    s.phase('roll', 1);
    s.p(1).pos = 20;
    s.roll();
    s.phase('buy');
    expect(s.p(1).pos).toBe(1);
    expect(s.p(1).cash).toBe(1700);
    const pay = s.of('pay').find((e) => e.reason === 'salary');
    expect(pay).toMatchObject({ to: 1, amount: 200, step: 3 });
    expect(s.of('move').at(-1)?.path).toEqual([21, 22, 23, 0, 1]);
  });

  it('adds a payday bonus for landing exactly on Gajian', () => {
    const s = new Sim({ rolls: [[1, 3]] });
    s.phase('roll', 1);
    s.p(1).pos = 20;
    s.roll();
    s.phase('roll', 2);
    expect(s.p(1).pos).toBe(0);
    expect(s.p(1).cash).toBe(1800);
  });

  it('gives another roll after doubles', () => {
    const s = new Sim({ rolls: [[2, 2]] });
    s.phase('roll', 1);
    s.roll();
    s.phase('buy');
    expect(s.p(1).pos).toBe(4);
    s.decide('skip');
    s.until(() => s.L.phase === 'roll');
    expect(s.L.player.id).toBe(1);
    expect(s.of('turn').at(-1)).toEqual({ type: 'turn', player: 1, bonus: true });
  });

  it('sends the third doubles in a row to Pos Tilang and ends the turn', () => {
    const s = new Sim({
      rolls: [
        [1, 1],
        [2, 2],
        [3, 3],
        [1, 2],
      ],
      deck: ['lomba'],
    });
    s.phase('roll', 1);
    s.roll(); // 2: Kabar (lomba +50)
    s.phase('roll', 1);
    s.roll(); // 6: Pos Tilang, just visiting
    s.phase('roll', 1);
    expect(s.p(1).pos).toBe(6);
    expect(s.p(1).jailed).toBe(false);
    s.roll(); // third doubles
    s.phase('roll', 2);
    expect(s.of('triple')).toHaveLength(1);
    expect(s.p(1).pos).toBe(TILANG_TILE);
    expect(s.p(1).jailed).toBe(true);
    expect(s.of('move').at(-1)).toMatchObject({ path: [TILANG_TILE], kind: 'jump' });
  });

  it('sends a pawn landing on Razia to Pos Tilang without salary', () => {
    const s = new Sim({ rolls: [[1, 2]] });
    s.phase('roll', 1);
    s.p(1).pos = 15;
    s.roll();
    s.phase('roll', 2);
    expect(s.p(1).pos).toBe(TILANG_TILE);
    expect(s.p(1).jailed).toBe(true);
    expect(s.of('jailed').at(-1)).toMatchObject({ player: 1, reason: 'razia' });
  });
});

describe('Pos Tilang', () => {
  function jailedSim(cash: number) {
    const s = new Sim({
      rolls: [
        [1, 2],
        [1, 2],
        [1, 2],
      ],
    });
    s.phase('roll', 1);
    s.p(1).pos = 15;
    s.roll();
    s.phase('roll', 2);
    s.p(1).cash = cash;
    s.roll();
    return s;
  }

  it('pays the fine and rolls', () => {
    const s = jailedSim(1000);
    s.phase('jail', 1);
    s.decide('pay');
    expect(s.p(1).cash).toBe(950);
    expect(s.p(1).jailed).toBe(false);
    expect(s.L.phase).toBe('roll');
    expect(s.L.player.id).toBe(1);
  });

  it('waits out one turn for free', () => {
    const s = jailedSim(1000);
    s.phase('jail', 1);
    s.decide('wait');
    s.phase('roll', 2);
    expect(s.p(1).cash).toBe(1000);
    expect(s.p(1).pos).toBe(TILANG_TILE);
    expect(s.p(1).jailed).toBe(false);
  });

  it('decides by itself when time runs out', () => {
    const rich = jailedSim(1000);
    rich.phase('jail', 1);
    rich.until(() => rich.L.phase !== 'jail');
    expect(rich.of('jailPay').at(-1)).toMatchObject({ auto: true });
    const poor = jailedSim(120);
    poor.phase('jail', 1);
    poor.until(() => poor.L.phase !== 'jail');
    expect(poor.of('jailWait').at(-1)).toMatchObject({ auto: true });
    expect(poor.p(1).cash).toBe(120);
  });
});

describe('buying', () => {
  it('buys the city on offer', () => {
    const s = new Sim({ rolls: [[1, 3]] });
    s.phase('roll', 1);
    s.roll();
    s.phase('buy');
    expect(s.L.offerTile).toBe(4);
    s.decide('buy');
    expect(s.L.tiles[4]).toEqual({ owner: 1, level: 1 });
    expect(s.p(1).cash).toBe(1500 - 140);
    expect(s.of('buy').at(-1)).toMatchObject({ player: 1, tile: 4, price: 140, auto: false });
  });

  it('buys by itself on timeout only when a reserve is left', () => {
    const s = new Sim({
      rolls: [
        [1, 3],
        [3, 4],
      ],
    });
    s.phase('roll', 1);
    s.roll();
    s.phase('buy');
    s.until(() => s.L.phase !== 'buy');
    expect(s.L.tiles[4]!.owner).toBe(1);
    expect(s.of('buy').at(-1)?.auto).toBe(true);
    s.phase('roll', 2);
    s.p(2).cash = 200;
    s.roll(); // 7: Makassar 180, would leave 20
    s.phase('buy');
    s.until(() => s.L.phase !== 'buy');
    expect(s.L.tiles[7]!.owner).toBeNull();
    expect(s.of('skip').at(-1)).toMatchObject({ player: 2, tile: 7, auto: true });
  });

  it('skips the offer when the player cannot pay', () => {
    const s = new Sim({ rolls: [[1, 3]] });
    s.phase('roll', 1);
    s.p(1).cash = 100;
    s.roll();
    s.until(() => s.of('cantAfford').length > 0);
    expect(s.L.phase).not.toBe('buy');
  });

  it('refuses decisions from someone else or out of phase', () => {
    const s = new Sim({ rolls: [[1, 3]] });
    s.phase('roll', 1);
    expect(s.L.decide(1, 'buy', s.now)).toBe(false);
    expect(s.L.roll(2, s.now)).toBe(false);
    s.roll();
    s.phase('buy');
    expect(s.L.decide(2, 'buy', s.now)).toBe(false);
    expect(s.L.decide(1, 'upgrade', s.now)).toBe(false);
    expect(s.L.decide(1, 'takeover', s.now)).toBe(false);
  });

  it('buys a transport tile without a level', () => {
    const s = new Sim({ rolls: [[4, 4]] });
    s.phase('roll', 1);
    s.roll();
    s.phase('buy');
    s.decide('buy');
    expect(s.L.tiles[8]).toEqual({ owner: 1, level: 0 });
  });
});

describe('rent', () => {
  it('charges the rent of the building level, doubled at every level for a whole island', () => {
    const t = emptyTiles();
    t[1] = { owner: 2, level: 1 };
    expect(rentAt(t, 1)).toBe(20);
    t[3] = { owner: 2, level: 1 };
    expect(rentAt(t, 1)).toBe(40);
    expect(rentAt(t, 3)).toBe(40);
    t[1]!.level = 2;
    expect(rentAt(t, 1)).toBe(120);
    t[1]!.level = 4;
    expect(rentAt(t, 1)).toBe(600);
    t[3]!.owner = 5;
    expect(rentAt(t, 1)).toBe(300);
    t[23] = { owner: 2, level: 3 };
    expect(rentAt(t, 23)).toBe(500);
    expect(rentAt(t, 2)).toBe(0);
    expect(rentAt(t, 5)).toBe(0);
  });

  it('charges transport rent by the number owned', () => {
    const t = emptyTiles();
    t[8]!.owner = 3;
    expect(rentAt(t, 8)).toBe(40);
    t[20]!.owner = 3;
    expect(rentAt(t, 8)).toBe(100);
    expect(rentAt(t, 20)).toBe(100);
    t[20]!.owner = 4;
    expect(rentAt(t, 20)).toBe(40);
  });

  it('moves the rent from the visitor to the owner', () => {
    const s = new Sim({ rolls: [[1, 2]] });
    s.L.tiles[1] = { owner: 2, level: 1 };
    s.L.tiles[3] = { owner: 2, level: 1 };
    s.phase('roll', 1);
    s.p(1).pos = 22;
    s.roll();
    s.phase('roll', 2);
    // +200 salary, -40 rent for Medan's Rumah with the whole of Sumatra; the takeover timed out.
    expect(s.p(1).cash).toBe(1660);
    expect(s.p(2).cash).toBe(1540);
    expect(s.p(2).stats.rentCollected).toBe(40);
    expect(s.p(1).stats.rentPaid).toBe(40);
    expect(s.of('pay').find((e) => e.reason === 'rent')).toMatchObject({
      from: 1,
      to: 2,
      amount: 40,
      tile: 1,
    });
    expect(s.L.tiles[1]!.owner).toBe(2);
  });

  it('taxes a flat amount or a tenth of the cash', () => {
    expect(taxAt(10, 5000)).toBe(100);
    expect(taxAt(22, 1234)).toBe(130);
    expect(taxAt(22, 1200)).toBe(120);
    expect(taxAt(22, 100)).toBe(50);
    expect(taxAt(1, 1000)).toBe(0);
  });
});

describe('upgrades', () => {
  it('prices each level higher and counts upgrades in the value', () => {
    expect(upgradeCost(1, 1)).toBe(50);
    expect(upgradeCost(1, 2)).toBe(80);
    expect(upgradeCost(1, 3)).toBe(100);
    expect(upgradeCost(1, 4)).toBeNull();
    expect(upgradeCost(1, 0)).toBeNull();
    expect(upgradeCost(8, 0)).toBeNull();
    const t = emptyTiles();
    t[1] = { owner: 1, level: 1 };
    expect(valueAt(t, 1)).toBe(100);
    t[1]!.level = 3;
    expect(valueAt(t, 1)).toBe(230);
    t[1]!.level = 4;
    expect(valueAt(t, 1)).toBe(330);
    t[8] = { owner: 1, level: 0 };
    expect(valueAt(t, 8)).toBe(200);
    expect(valueAt(t, 4)).toBe(0);
    expect(netWorth({ id: 1, cash: 50 }, t)).toBe(50 + 330 + 200);
  });

  it('offers one level up on an own city without needing the whole island', () => {
    const s = new Sim({ rolls: [[1, 3]] });
    s.L.tiles[4] = { owner: 1, level: 1 };
    s.phase('roll', 1);
    s.roll();
    s.phase('upgrade', 1);
    expect(s.L.offerTile).toBe(4);
    expect(s.L.offerCost).toBe(70);
    expect(s.L.deadline - s.now).toBe(UPGRADE_MS);
    expect(s.of('upgradeOffer').at(-1)).toMatchObject({ player: 1, tile: 4, level: 2, cost: 70 });
    s.decide('upgrade');
    expect(s.L.tiles[4]!.level).toBe(2);
    expect(s.p(1).cash).toBe(1430);
    expect(s.of('upgrade').at(-1)).toMatchObject({ player: 1, tile: 4, level: 2, cost: 70, free: false });
    expect(s.of('pay').at(-1)).toMatchObject({ from: 1, to: null, amount: 70, reason: 'upgrade' });
    // One level per landing.
    expect(s.L.decide(1, 'upgrade', s.now)).toBe(false);
    s.phase('roll', 2);
    expect(s.L.tiles[4]!.level).toBe(2);
    expect(s.p(1).stats.built).toBe(1);
  });

  it('climbs Rumah, Toko, Gedung, Hotel one landing at a time with the rent rising', () => {
    const s = new Sim();
    s.L.tiles[4] = { owner: 1, level: 1 };
    const rents = [rentAt(s.L.tiles, 4)];
    for (let k = 0; k < 4; k++) {
      s.phase('roll', 1);
      s.p(1).pos = 0;
      s.push([1, 3]);
      s.roll();
      if (k < 3) {
        s.phase('upgrade', 1);
        s.decide('upgrade');
        rents.push(rentAt(s.L.tiles, 4));
      }
      s.phase('roll', 2);
      s.roll();
    }
    expect(rents).toEqual([30, 80, 200, 420]);
    expect(s.L.tiles[4]!.level).toBe(4);
    expect(s.of('upgradeOffer')).toHaveLength(3);
    expect(s.of('noUpgrade').at(-1)).toMatchObject({ player: 1, tile: 4, reason: 'max' });
    expect(s.p(1).stats.built).toBe(3);
  });

  it('says no by itself on timeout and is not offered without the cash', () => {
    const s = new Sim({ rolls: [[1, 3]] });
    s.L.tiles[4] = { owner: 1, level: 1 };
    s.phase('roll', 1);
    s.roll();
    s.phase('upgrade', 1);
    s.until(() => s.L.phase !== 'upgrade');
    expect(s.L.tiles[4]!.level).toBe(1);
    expect(s.of('decline').at(-1)).toMatchObject({ player: 1, tile: 4, what: 'upgrade', auto: true });
    expect(s.p(1).cash).toBe(1500);
    const poor = new Sim({ rolls: [[1, 3]] });
    poor.L.tiles[4] = { owner: 1, level: 1 };
    poor.phase('roll', 1);
    poor.p(1).cash = 60;
    poor.roll();
    poor.phase('roll', 2);
    expect(poor.of('upgradeOffer')).toHaveLength(0);
    expect(poor.of('noUpgrade').at(-1)).toMatchObject({ reason: 'cash' });
  });

  it('no longer builds at the end of a turn', () => {
    const s = new Sim({ rolls: [[1, 2]] });
    s.L.tiles[1] = { owner: 1, level: 1 };
    s.L.tiles[3] = { owner: 1, level: 1 };
    s.phase('roll', 1);
    s.p(1).pos = 10;
    s.roll();
    s.until(() => s.L.player.id === 2);
    expect(s.L.phase).toBe('roll');
    expect(s.of('upgradeOffer')).toHaveLength(0);
  });
});

describe('takeover (Rebut)', () => {
  /** Player 1 rolls onto Pontianak (tile 4), owned by player 2 at `level`. */
  function visit(level: number, cash = 1500): Sim {
    const s = new Sim({ rolls: [[1, 3]] });
    s.L.tiles[4] = { owner: 2, level };
    s.phase('roll', 1);
    s.p(1).cash = cash;
    s.roll();
    return s;
  }

  it('prices a city at twice its value and never a Hotel or a transport tile', () => {
    const t = emptyTiles();
    t[4] = { owner: 2, level: 1 };
    expect(takeoverPrice(t, 4)).toBe(280);
    t[4]!.level = 3;
    expect(takeoverPrice(t, 4)).toBe(2 * (140 + 70 + 110));
    t[4]!.level = 4;
    expect(takeoverPrice(t, 4)).toBeNull();
    t[8] = { owner: 2, level: 0 };
    expect(takeoverPrice(t, 8)).toBeNull();
    expect(takeoverPrice(t, 5)).toBeNull();
  });

  it('charges rent first, then sells the city with its building to the visitor, paid to the owner', () => {
    const s = visit(2);
    s.phase('takeover', 1);
    expect(s.p(1).cash).toBe(1500 - 80);
    expect(s.L.deadline - s.now).toBe(TAKEOVER_MS);
    expect(s.of('takeoverOffer').at(-1)).toMatchObject({ player: 1, owner: 2, tile: 4, price: 420 });
    s.decide('takeover');
    expect(s.L.tiles[4]).toEqual({ owner: 1, level: 2 });
    expect(s.p(1).cash).toBe(1500 - 80 - 420);
    expect(s.p(2).cash).toBe(1500 + 80 + 420);
    expect(s.p(1).stats.takeovers).toBe(1);
    expect(s.p(2).stats.lost).toBe(1);
    expect(s.of('takeover').at(-1)).toMatchObject({ player: 1, from: 2, tile: 4, price: 420, level: 2 });
    expect(s.of('pay').at(-1)).toMatchObject({ from: 1, to: 2, amount: 420, reason: 'takeover', tile: 4 });
    // The taker pays the city's value on top of it; the old owner (city worth 210) gains as much.
    expect(netWorth(s.p(1), s.L.tiles)).toBe(1500 - 80 - 210);
    expect(netWorth(s.p(2), s.L.tiles)).toBe(1500 + 210 + 80 + 210);
    s.phase('roll', 2);
  });

  it('says no by itself when time runs out', () => {
    const s = visit(1);
    s.phase('takeover', 1);
    s.until(() => s.L.phase !== 'takeover');
    expect(s.L.tiles[4]!.owner).toBe(2);
    expect(s.of('decline').at(-1)).toMatchObject({ player: 1, tile: 4, what: 'takeover', auto: true });
    expect(s.p(1).cash).toBe(1500 - 30);
  });

  it('is never offered on a Hotel or when the cash left after rent falls short', () => {
    const hotel = visit(4);
    hotel.phase('roll', 2);
    expect(hotel.of('takeoverOffer')).toHaveLength(0);
    expect(hotel.p(1).cash).toBe(1500 - 420);
    expect(hotel.L.tiles[4]!.owner).toBe(2);
    // Rumah: rent 30, price 280.
    const short = visit(1, 309);
    short.phase('roll', 2);
    expect(short.of('takeoverOffer')).toHaveLength(0);
    const exact = visit(1, 310);
    exact.phase('takeover', 1);
    exact.decide('takeover');
    expect(exact.p(1).cash).toBe(0);
    expect(exact.L.tiles[4]!.owner).toBe(1);
  });

  it('lets the old owner take the city back under the same rules', () => {
    const s = visit(1);
    s.phase('takeover', 1);
    s.decide('takeover');
    s.phase('roll', 2);
    s.p(2).pos = 0;
    s.push([1, 3]);
    s.roll();
    s.phase('takeover', 2);
    expect(s.L.offerCost).toBe(280);
    s.decide('takeover');
    expect(s.L.tiles[4]!.owner).toBe(2);
    expect(s.p(2).stats.takeovers).toBe(1);
    expect(s.p(1).stats.lost).toBe(1);
  });

  it('completes the island for the taker, doubling its rents there', () => {
    const s = new Sim({ rolls: [[1, 3]] });
    s.L.tiles[4] = { owner: 2, level: 1 };
    s.L.tiles[5] = { owner: 1, level: 1 };
    s.phase('roll', 1);
    s.roll();
    s.phase('takeover', 1);
    expect(rentAt(s.L.tiles, 5)).toBe(30);
    s.decide('takeover');
    expect(rentAt(s.L.tiles, 4)).toBe(60);
    expect(rentAt(s.L.tiles, 5)).toBe(60);
  });

  it('is not offered when the rent itself bankrupts the visitor', () => {
    const s = visit(3, 100);
    s.until(() => s.L.phase === 'finale');
    expect(s.p(1).bankrupt).toBe(true);
    expect(s.of('takeoverOffer')).toHaveLength(0);
  });

  it('can still end in bankruptcy later: the taken city goes back to the bank with the rest', () => {
    const s = visit(2, 500);
    s.L.tiles[23] = { owner: 2, level: 4 };
    s.phase('takeover', 1);
    s.decide('takeover');
    expect(s.p(1).cash).toBe(0);
    s.phase('roll', 2);
    s.roll();
    s.phase('roll', 1);
    s.p(1).pos = 20;
    s.push([1, 2]);
    s.roll();
    s.until(() => s.L.phase === 'finale');
    // Jakarta's Hotel: Rp 1,08 jt. The Toko goes for half its upgrade, then the city for half price.
    expect(s.of('sell').map((e) => [e.tile, e.what, e.amount])).toEqual([
      [4, 'building', 35],
      [4, 'property', 70],
    ]);
    expect(s.p(1).bankrupt).toBe(true);
    expect(s.L.tiles[4]).toEqual({ owner: null, level: 0 });
    expect(s.of('finish').at(-1)).toMatchObject({ winner: 2, reason: 'last' });
  });
});

describe('short of cash', () => {
  it('sells upgrades, then loose properties, then whole islands, then goes bankrupt', () => {
    const s = new Sim({ rolls: [[1, 2]] });
    const t = s.L.tiles;
    t[1] = { owner: 1, level: 2 };
    t[3] = { owner: 1, level: 2 };
    t[7] = { owner: 1, level: 1 };
    t[19] = { owner: 2, level: 1 };
    t[21] = { owner: 2, level: 1 };
    t[23] = { owner: 2, level: 3 };
    s.phase('roll', 1);
    s.p(1).cash = 0;
    s.p(1).pos = 20;
    s.roll();
    s.until(() => s.L.phase === 'finale');
    const sells = s.of('sell').map((e) => [e.tile, e.what, e.amount]);
    expect(sells).toEqual([
      [1, 'building', 25],
      [3, 'building', 30],
      [7, 'property', 90],
      [1, 'property', 50],
      [3, 'property', 60],
    ]);
    expect(s.of('pay').find((e) => e.reason === 'rent')).toMatchObject({ from: 1, to: 2, amount: 255 });
    expect(s.p(1).bankrupt).toBe(true);
    expect(s.p(1).cash).toBe(0);
    expect(s.p(2).cash).toBe(1755);
    expect(t.filter((x) => x.owner === 1)).toHaveLength(0);
    expect(s.of('bankrupt')).toEqual([{ type: 'bankrupt', player: 1, to: 2 }]);
    expect(s.of('finish')).toEqual([{ type: 'finish', winner: 2, reason: 'last' }]);
    s.until(() => s.L.phase === 'ended');
  });

  it('raises just enough, cheapest upgrade first, and keeps the rest', () => {
    const s = new Sim({ rolls: [[1, 2]] });
    const t = s.L.tiles;
    t[1] = { owner: 1, level: 3 };
    t[3] = { owner: 1, level: 3 };
    t[4] = { owner: 1, level: 1 };
    t[23] = { owner: 2, level: 1 };
    s.phase('roll', 1);
    s.p(1).cash = 10;
    s.p(1).pos = 20;
    s.roll();
    s.phase('roll', 2);
    // Jakarta's Rumah, loose: rent 70. Medan's Gedung (40 back) and Toko (25 back) go.
    expect(s.of('sell').map((e) => [e.tile, e.level, e.amount])).toEqual([
      [1, 2, 40],
      [1, 1, 25],
    ]);
    expect(t[3]!.level).toBe(3);
    expect(s.p(1).cash).toBe(5);
    expect(s.p(1).bankrupt).toBe(false);
    expect(t[4]!.owner).toBe(1);
  });

  it('ends the game when the only human is bankrupt even with computer players left', () => {
    const s = new Sim({
      roster: [
        { id: 1, connected: true },
        { id: -1, connected: true, cpu: true },
        { id: -2, connected: true, cpu: true },
      ],
      rolls: [[1, 2]],
    });
    s.L.tiles[23] = { owner: -1, level: 4 };
    s.phase('roll', 1);
    s.p(1).cash = 0;
    s.p(1).pos = 20;
    s.roll();
    s.until(() => s.L.phase === 'finale');
    expect(s.L.winner).toBe(-1);
    expect(s.L.endReason).toBe('last');
  });
});

describe('cards', () => {
  it('collects from every other player', () => {
    const three: RosterEntry[] = [...TWO, { id: 3, connected: true }];
    const s = new Sim({ roster: three, rolls: [[1, 2]], deck: ['festival'] });
    s.phase('roll', 1);
    s.p(1).pos = 23;
    s.roll();
    s.phase('roll', 2);
    expect(s.of('card').at(-1)).toMatchObject({ player: 1, card: 'festival' });
    expect(s.p(1).cash).toBe(1500 + 200 + 60);
    expect(s.p(2).cash).toBe(1470);
    expect(s.p(3).cash).toBe(1470);
  });

  it('treats every other player', () => {
    const three: RosterEntry[] = [...TWO, { id: 3, connected: true }];
    const s = new Sim({ roster: three, rolls: [[1, 2]], deck: ['traktir'] });
    s.phase('roll', 1);
    s.p(1).pos = 12;
    s.roll();
    s.phase('roll', 2);
    expect(s.p(1).cash).toBe(1460);
    expect(s.p(2).cash).toBe(1520);
    expect(s.p(3).cash).toBe(1520);
  });

  it('walks to Gajian with salary and payday bonus', () => {
    const s = new Sim({ rolls: [[1, 2]], deck: ['mudik'] });
    s.phase('roll', 1);
    s.p(1).pos = 12;
    s.roll();
    s.phase('roll', 2);
    expect(s.p(1).pos).toBe(0);
    expect(s.p(1).cash).toBe(1800);
  });

  it('walks back without salary', () => {
    const s = new Sim({ rolls: [[1, 2]], deck: ['salah'] });
    s.phase('roll', 1);
    s.p(1).pos = 12;
    s.roll();
    s.phase('roll', 2);
    expect(s.p(1).pos).toBe(12);
    expect(s.of('move').at(-1)).toMatchObject({ path: [14, 13, 12], kind: 'back' });
    expect(s.p(1).cash).toBe(1500);
  });

  it('goes to the nearest transport ahead', () => {
    const s = new Sim({ rolls: [[1, 2]], deck: ['promo'] });
    s.phase('roll', 1);
    s.p(1).pos = 12;
    s.roll();
    s.phase('buy');
    expect(s.p(1).pos).toBe(20);
    expect(s.L.offerTile).toBe(20);
  });

  it('charges repairs per building level with a minimum', () => {
    const s = new Sim({ rolls: [[1, 2]], deck: ['banjir', 'banjir'] });
    s.phase('roll', 1);
    s.p(1).pos = 12;
    s.roll();
    s.phase('roll', 2);
    expect(s.p(1).cash).toBe(1450);
    s.L.tiles[19] = { owner: 2, level: 1 };
    s.L.tiles[21] = { owner: 2, level: 1 };
    s.L.tiles[23] = { owner: 2, level: 3 };
    s.p(2).pos = 12;
    s.roll();
    s.until(() => s.L.player.id === 1);
    // Rumah + Rumah + Gedung: 5 levels at Rp 20 rb.
    expect(s.p(2).cash).toBe(1500 - 100);
  });

  it('gives a free upgrade where it adds the most rent, or cash without a city', () => {
    const s = new Sim({
      rolls: [
        [1, 2],
        [1, 2],
      ],
      deck: ['investor'],
    });
    for (const i of [19, 21, 23]) s.L.tiles[i] = { owner: 1, level: 1 };
    s.L.tiles[1] = { owner: 1, level: 4 };
    s.phase('roll', 1);
    s.p(1).pos = 12;
    s.roll();
    s.until(() => s.of('upgrade').length > 0);
    // Jakarta: Rumah 70 to Toko 220, doubled for the whole of Jawa. A Hotel can't go up.
    expect(s.of('upgrade')[0]).toMatchObject({ player: 1, tile: 23, level: 2, cost: 0, free: true });
    expect(s.L.tiles[23]!.level).toBe(2);
    expect(s.p(1).cash).toBe(1500);
    s.phase('roll', 2);
    s.p(2).pos = 12;
    s.roll();
    s.until(() => s.L.player.id === 1 && s.L.phase === 'roll');
    expect(s.p(2).cash).toBe(1600);
  });

  /** Player 1 draws `card` (from Ngopi Dulu onto the Kabar at 15) owning `owned` (tile, level). */
  function draw(card: CardId, owned: [number, number][]): Sim {
    const s = new Sim({ rolls: [[1, 2]], deck: [card] });
    for (const [i, level] of owned) s.L.tiles[i] = { owner: 1, level };
    s.phase('roll', 1);
    s.p(1).pos = 12;
    s.roll();
    return s;
  }

  it('has 15 cards, three of them free upgrades', () => {
    expect(CARD_IDS).toHaveLength(15);
    expect(CARD_IDS).toEqual(expect.arrayContaining(['investor', 'umkm', 'renovasi']));
  });

  it('Bantuan UMKM lifts the cheapest city that is not a Hotel yet', () => {
    const s = draw('umkm', [
      [1, 4],
      [3, 1],
      [23, 1],
    ]);
    s.until(() => s.of('upgrade').length > 0);
    expect(s.of('upgrade')[0]).toMatchObject({ player: 1, tile: 3, level: 2, cost: 0, free: true });
    expect(s.L.tiles[1]!.level).toBe(4);
    expect(s.p(1).cash).toBe(1500);
    expect(s.p(1).stats.built).toBe(1);
  });

  it('pays Rp 100 rb instead without a city below Hotel', () => {
    for (const card of ['umkm', 'renovasi'] as CardId[]) {
      const none = draw(card, []);
      none.phase('roll', 2);
      expect(none.p(1).cash).toBe(1600);
      expect(none.of('upgrade')).toHaveLength(0);
      const hotels = draw(card, [[1, 4]]);
      hotels.phase('roll', 2);
      expect(hotels.p(1).cash).toBe(1600);
      expect(hotels.L.tiles[1]!.level).toBe(4);
      expect(hotels.of('renovateOffer')).toHaveLength(0);
    }
  });

  it('Renovasi Gotong Royong lets the player pick a city below Hotel on the phone', () => {
    const s = draw('renovasi', [
      [1, 4],
      [4, 1],
      [23, 2],
    ]);
    s.phase('renovate', 1);
    expect(s.L.renovateOptions).toEqual([4, 23]);
    expect(s.L.deadline - s.now).toBe(RENOVATE_MS);
    // Jakarta's Toko to Gedung adds the most rent: the timeout choice.
    expect(s.of('renovateOffer').at(-1)).toMatchObject({ player: 1, options: [4, 23], best: 23 });
    expect(s.L.decide(1, 'renovate-1', s.now)).toBe(false);
    expect(s.L.decide(2, 'renovate-4', s.now)).toBe(false);
    s.decide('renovate-4');
    expect(s.L.tiles[4]!.level).toBe(2);
    expect(s.L.tiles[23]!.level).toBe(2);
    expect(s.of('upgrade').at(-1)).toMatchObject({ player: 1, tile: 4, level: 2, cost: 0, free: true });
    expect(s.p(1).cash).toBe(1500);
    s.phase('roll', 2);
  });

  it('Renovasi picks the city where it adds the most rent when time runs out', () => {
    const s = draw('renovasi', [
      [4, 1],
      [23, 2],
    ]);
    s.phase('renovate', 1);
    s.until(() => s.L.phase !== 'renovate');
    expect(s.L.tiles[23]!.level).toBe(3);
    expect(s.L.tiles[4]!.level).toBe(1);
  });

  it('Renovasi lifts a lone candidate straight away', () => {
    const s = draw('renovasi', [
      [1, 4],
      [4, 3],
    ]);
    s.phase('roll', 2);
    expect(s.of('renovateOffer')).toHaveLength(0);
    expect(s.L.tiles[4]!.level).toBe(4);
  });

  it('sends a Kena Razia card to Pos Tilang', () => {
    const s = new Sim({ rolls: [[1, 2]], deck: ['razia'] });
    s.phase('roll', 1);
    s.p(1).pos = 12;
    s.roll();
    s.phase('roll', 2);
    expect(s.p(1).pos).toBe(TILANG_TILE);
    expect(s.p(1).jailed).toBe(true);
  });
});

describe('putaran and results', () => {
  it('counts a putaran when everyone has had a turn and ends after the last one', () => {
    const s = new Sim({ rounds: 4 });
    s.until(() => s.L.phase === 'finale', 5000);
    expect(s.L.endReason).toBe('rounds');
    expect(s.of('round').map((e) => [e.round, e.last])).toEqual([
      [1, false],
      [2, false],
      [3, false],
      [4, true],
    ]);
    const turns = s.of('turn').filter((e) => !e.bonus).length + s.of('jail').length;
    expect(turns).toBe(8);
    const top = standings(s.L)[0]!;
    expect(s.L.winner).toBe(top.id);
    expect(s.of('finish')).toEqual([{ type: 'finish', winner: top.id, reason: 'rounds' }]);
  });

  it('skips bankrupt seats and counts doubles inside the same turn', () => {
    const three: RosterEntry[] = [...TWO, { id: 3, connected: true }];
    const s = new Sim({ roster: three, rounds: 5, rolls: [[2, 2]] });
    s.p(2).bankrupt = true;
    s.phase('roll', 1);
    expect(s.L.roundsLeft).toBe(4.5);
    s.until(() => s.L.phase === 'finale', 5000);
    expect(s.of('round')).toHaveLength(5);
    expect(s.of('turn').filter((e) => e.bonus)).toHaveLength(1);
    expect(
      s
        .of('turn')
        .filter((e) => !e.bonus)
        .map((e) => e.player),
    ).toEqual([1, 3, 1, 3, 1, 3, 1, 3, 1, 3]);
  });

  it('ranks by net worth, ties shared, bankrupt players last', () => {
    const s = new Sim({ roster: [...TWO, { id: 3, connected: true }, { id: 4, connected: true }] });
    s.L.tiles[23] = { owner: 1, level: 2 };
    expect(netWorth(s.p(1), s.L.tiles)).toBe(1500 + 360 + 180);
    s.p(2).cash = 2040;
    s.p(3).bankrupt = true;
    s.p(3).bankruptOrder = 1;
    s.p(4).bankrupt = true;
    s.p(4).bankruptOrder = 2;
    expect(standings(s.L).map((r) => [r.id, r.rank])).toEqual([
      [1, 1],
      [2, 1],
      [4, 3],
      [3, 4],
    ]);
  });

  it('shortens the deadline when the current phone drops', () => {
    const s = new Sim();
    s.phase('roll', 1);
    expect(s.L.deadline - s.now).toBe(15_000);
    s.L.setRoster([{ id: 1, connected: false }], s.now);
    expect(s.L.deadline - s.now).toBe(AWAY_MS);
    s.L.setRoster([{ id: 1, connected: true }], s.now);
    expect(s.L.deadline - s.now).toBe(5000);
    expect(BUY_MS).toBeGreaterThan(AWAY_MS);
  });
});
