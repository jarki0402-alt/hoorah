/** Phone controller views for Juragan Nusantara. Pure builders; the driver decides who gets what. */
import type { ControllerView, ViewAction, ViewStat } from '@hoorah/protocol';
import { rp, STR } from './strings';

/** A player's money at a glance, shown on every phone screen. */
export interface Wallet {
  cash: number;
  worth: number;
  /** Cities and transport tiles owned. */
  cities: number;
  rank: number;
  of: number;
}

const REMATCH: ViewAction[] = [{ id: 'rematch', label: STR.phoneRematch, style: 'primary' }];

export function walletStats(w: Wallet): ViewStat[] {
  return [
    { label: STR.myCash, value: rp(w.cash) },
    { label: STR.myWorth, value: rp(w.worth) },
    { label: STR.myCities, value: String(w.cities) },
    { label: STR.myRank, value: `${w.rank} / ${w.of}` },
  ];
}

export function introView(w: Wallet | null, rounds: number): ControllerView {
  if (!w) return spectatorView();
  return {
    kind: 'message',
    eyebrow: STR.phoneIntroEyebrow,
    title: STR.phoneIntroTitle,
    subtitle: STR.phoneIntroSub(rounds),
    tone: 'neutral',
    stats: walletStats(w),
  };
}

export function rollView(bonus: boolean, w: Wallet, place: string, deadline: number): ControllerView {
  return {
    kind: 'button',
    eyebrow: bonus ? STR.phoneBonusEyebrow : STR.phoneTurnEyebrow,
    title: STR.phoneRollTitle,
    label: STR.phoneRollLabel,
    hint: STR.phoneRollHint(rp(w.cash), place),
    deadline: Math.round(deadline),
  };
}

/** The roller while the dice tumble and the pawn walks. */
export function rolledView(dice: [number, number] | null, doubles: boolean, w: Wallet): ControllerView {
  return {
    kind: 'message',
    eyebrow: STR.phoneRolledEyebrow,
    title: dice ? STR.phoneRolled(dice[0], dice[1]) : STR.phoneRolling,
    subtitle: dice ? (doubles ? STR.phoneRolledDoubles : STR.phoneRolledSub) : undefined,
    tone: doubles && dice ? 'good' : 'neutral',
    stats: walletStats(w),
  };
}

export interface Offer {
  place: string;
  price: number;
  /** Lowest rent (cities) or the one-transport rent. */
  rent: number;
  transport: boolean;
}

export function buyView(o: Offer, w: Wallet): ControllerView {
  return {
    kind: 'message',
    eyebrow: STR.phoneBuyEyebrow,
    title: STR.phoneBuyTitle(o.place),
    subtitle: o.transport ? STR.phoneBuySubTransport : STR.phoneBuySub(rp(o.rent)),
    tone: 'neutral',
    stats: [
      { label: STR.cash, value: rp(w.cash) },
      { label: STR.phonePrice, value: rp(o.price) },
      { label: STR.phoneAfter, value: rp(w.cash - o.price) },
      { label: STR.cardRent, value: rp(o.rent) },
    ],
    actions: [
      { id: 'buy', label: STR.phoneBuy, style: 'primary' },
      { id: 'skip', label: STR.phoneSkip, style: 'secondary' },
    ],
  };
}

export interface UpgradeOffer {
  place: string;
  /** Level name after the upgrade. */
  level: string;
  cost: number;
  /** Rent now and after the upgrade (island doubling included). */
  rentNow: number;
  rentNext: number;
  /** The upgrade makes a Hotel (safe from takeovers). */
  hotel: boolean;
}

/** Landed on an own city: one level up, or skip (the timeout skips). */
export function upgradeView(o: UpgradeOffer, w: Wallet): ControllerView {
  const from = rp(o.rentNow);
  const to = rp(o.rentNext);
  return {
    kind: 'message',
    eyebrow: STR.phoneUpgradeEyebrow,
    title: STR.phoneUpgradeTitle(o.place, o.level),
    subtitle: o.hotel ? STR.phoneUpgradeSubHotel(from, to) : STR.phoneUpgradeSub(from, to),
    tone: 'good',
    stats: [
      { label: STR.cash, value: rp(w.cash) },
      { label: STR.phoneCost, value: rp(o.cost) },
      { label: STR.phoneAfter, value: rp(w.cash - o.cost) },
      { label: STR.phoneNewRent, value: to },
    ],
    actions: [
      { id: 'upgrade', label: STR.phoneUpgrade(o.level, rp(o.cost)), style: 'primary' },
      { id: 'skip', label: STR.phoneSkip, style: 'secondary' },
    ],
  };
}

export interface TakeoverOffer {
  place: string;
  ownerId: number;
  owner: string;
  price: number;
  /** Rent just paid on the city. */
  rent: number;
  /** Building level name on the city. */
  level: string;
}

/** After the rent on a rival's city: take it over for twice its value, or not (the timeout says no). */
export function takeoverView(o: TakeoverOffer, w: Wallet): ControllerView {
  return {
    kind: 'message',
    eyebrow: STR.phoneTakeoverEyebrow,
    title: STR.phoneTakeoverTitle(o.place),
    subtitle: STR.phoneTakeoverSub(rp(o.rent), o.owner, rp(o.price), o.level),
    tone: 'warn',
    avatarOf: o.ownerId,
    stats: [
      { label: STR.cash, value: rp(w.cash) },
      { label: STR.phoneTakeoverPrice, value: rp(o.price) },
      { label: STR.phoneAfter, value: rp(w.cash - o.price) },
      { label: STR.phoneBuilding, value: o.level },
    ],
    actions: [
      { id: 'takeover', label: STR.phoneTakeover(rp(o.price)), style: 'primary' },
      { id: 'skip', label: STR.phoneNo, style: 'secondary' },
    ],
  };
}

/** A takeover, seen by the new owner (`took`) or the old one: shown until the next turn. */
export function takeoverDoneView(
  took: boolean,
  place: string,
  amount: number,
  other: string,
  w: Wallet,
): ControllerView {
  return {
    kind: 'message',
    eyebrow: STR.phoneTookEyebrow,
    title: took ? STR.phoneTookTitle(place) : STR.phoneTakenTitle,
    subtitle: took ? STR.phoneTook(rp(amount), other) : STR.phoneTaken(other, place, rp(amount)),
    tone: took ? 'good' : 'warn',
    stats: walletStats(w),
    reactions: !took,
  };
}

export interface RenovateChoice {
  tile: number;
  place: string;
  /** Level names now and after the free upgrade. */
  from: string;
  to: string;
  rentNow: number;
  rentNext: number;
  /** Island colour of the city. */
  color: string;
}

/** Renovasi Gotong Royong: tap a city (shown on the board too), then confirm. Timeout: the best one. */
export function renovateView(choices: readonly RenovateChoice[], picked: number): ControllerView {
  return {
    kind: 'menu',
    eyebrow: STR.phoneRenovateEyebrow,
    title: STR.phoneRenovateTitle,
    hint: STR.phoneRenovateHint,
    layout: 'list',
    options: choices.map((c) => ({
      id: String(c.tile),
      label: c.place,
      sub: STR.phoneRenovateSub(c.from, c.to, rp(c.rentNow), rp(c.rentNext)),
      color: c.color,
    })),
    selected: String(picked),
    confirm: { id: 'renovate', label: STR.phoneRenovateConfirm, style: 'primary' },
  };
}

export function jailView(fine: number, w: Wallet): ControllerView {
  return {
    kind: 'message',
    eyebrow: STR.phoneJailEyebrow,
    title: STR.phoneJailTitle,
    subtitle: STR.phoneJailSub,
    tone: 'warn',
    stats: [
      { label: STR.cash, value: rp(w.cash) },
      { label: STR.cities, value: String(w.cities) },
    ],
    actions: [
      { id: 'pay', label: STR.phoneJailPay(rp(fine)), style: 'primary' },
      { id: 'wait', label: STR.phoneJailWait, style: 'secondary' },
    ],
  };
}

export function watchView(
  rollerId: number,
  rollerName: string,
  doing: string,
  w: Wallet | null,
): ControllerView {
  return {
    kind: 'message',
    eyebrow: STR.phoneWatchEyebrow(rollerName),
    title: rollerName,
    subtitle: doing,
    avatarOf: rollerId,
    stats: w ? walletStats(w) : undefined,
    reactions: true,
  };
}

/** Rent changing hands: shown on both phones until the next turn (the owner is the one waiting). */
export function rentView(paid: boolean, amount: number, other: string, w: Wallet): ControllerView {
  return {
    kind: 'message',
    eyebrow: STR.cardRent.toUpperCase(),
    title: paid ? STR.phonePaidTitle : STR.phoneGotTitle,
    subtitle: paid ? STR.phonePaid(rp(amount), other) : STR.phoneGot(rp(amount), other),
    tone: paid ? 'bad' : 'good',
    stats: walletStats(w),
    reactions: !paid,
  };
}

/** The drawer's phone while a Kabar card is revealed. */
export function cardView(
  title: string,
  body: string,
  tone: 'good' | 'bad' | 'move',
  w: Wallet,
): ControllerView {
  return {
    kind: 'message',
    eyebrow: STR.phoneCardEyebrow,
    title,
    subtitle: body,
    tone: tone === 'good' ? 'good' : tone === 'bad' ? 'bad' : 'neutral',
    stats: walletStats(w),
  };
}

export function bankruptView(): ControllerView {
  return {
    kind: 'message',
    title: STR.phoneBankruptTitle,
    subtitle: STR.phoneBankruptSub,
    tone: 'bad',
    reactions: true,
  };
}

export function spectatorView(): ControllerView {
  return {
    kind: 'message',
    title: STR.phoneSpectator,
    subtitle: STR.phoneSpectatorSub,
    tone: 'neutral',
    reactions: true,
  };
}

export interface FinalInfo {
  rank: number;
  bankrupt: boolean;
  worth: number;
  headline: string;
  cities: number;
  rent: number;
}

export function finalView(f: FinalInfo): ControllerView {
  const win = f.rank === 1 && !f.bankrupt;
  return {
    kind: 'result',
    tone: win ? 'win' : f.bankrupt ? 'bad' : 'neutral',
    title: win ? STR.phoneWinTitle : STR.phoneRank(f.rank),
    big: f.bankrupt ? STR.rankBankrupt : rp(f.worth),
    subtitle: STR.phoneFinalSub(f.headline),
    stats: [
      { label: STR.cities, value: String(f.cities) },
      { label: STR.phoneRentGot, value: rp(f.rent) },
    ],
    actions: REMATCH,
  };
}
