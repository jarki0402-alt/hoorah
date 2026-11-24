/**
 * Glue between the Hoorah SDK, the pure rules, the 3D tabletop and the HUD: owns the game clock
 * (frozen while paused), plays the computer seats, and turns logic events into pawn hops, dice,
 * coins, buildings, sounds, toasts and phone views.
 */
import {
  type ControllerToGame,
  type ControllerView,
  type Look,
  lookOfFruit,
  type PlayerInfo,
} from '@hoorah/protocol';
import type { GameResult, HoorahGame } from '@hoorah/sdk';
import type { Sfx } from '../../shared/audio';
import { celebrate, confetti } from '../../shared/confetti';
import { cpuSkill, isCpu, reportSoloResult } from '../common/cpu';
import { GameClock } from '../ludo/clock';
import {
  GROUP_COLOR,
  isOwnable,
  MAX_LEVEL,
  TILANG_FINE,
  TILES,
  TRANSPORT_RENT,
  TRANSPORT_TILES,
} from './board';
import {
  actDelay,
  type BrainAct,
  chooseRenovate,
  jailChoice,
  juraganOpponents,
  shouldBuy,
  shouldTakeover,
  shouldUpgrade,
} from './brain';
import { cardTone } from './cards';
import type { CardLine, FrameValues, HudModel, HudPlayer, HudStore, TileCardModel, Toast } from './hud';
import {
  BUY_MS,
  CARD_MS,
  cityRent,
  DEFAULT_ROUNDS,
  DICE_MS,
  type EndReason,
  HOP_MS,
  INTRO_MS,
  JAIL_MS,
  JUMP_MS,
  type JuraganEvent,
  JuraganLogic,
  ownsGroup,
  type PayReason,
  propertiesOf,
  RENOVATE_MS,
  ROLL_MS,
  rentAt,
  standings,
  TAKEOVER_MS,
  takeoverPrice,
  UPGRADE_MS,
  upgradeCost,
} from './logic';
import { FX_KEEP, type MirrorFx, type MirrorFxBody, toMirror } from './mirror';
import { buildResult, headline } from './results';
import type { Anchor, JuraganView } from './scene/view';
import {
  CARD_TEXT,
  CITY_NAME,
  CORNER_NAME,
  GROUP_NAME,
  KABAR_NAME,
  LEVEL_NAME,
  rp,
  STR,
  TAX_NAME,
  TRANSPORT_NAME,
} from './strings';
import * as V from './views';

/** The logic keeps ticking even if rAF is throttled. */
const FALLBACK_TICK_MS = 250;
/** Look of a seat that has left the room (its pawn and HUD row stay). */
const UNKNOWN_LOOK: Look = lookOfFruit('semangka');
const TOAST_GAP_MS = 1500;
const TOAST_LIFE_MS = 2400;
const DELTA_LIFE_MS = 1800;
/** How long the "last putaran" banner stays over the board. */
const LAST_ROUND_BANNER_MS = 2600;

/** Decision time of each deciding phase (the HUD ring). */
const DECISION_MS: Partial<Record<JuraganLogic['phase'], number>> = {
  roll: ROLL_MS,
  buy: BUY_MS,
  upgrade: UPGRADE_MS,
  takeover: TAKEOVER_MS,
  renovate: RENOVATE_MS,
  jail: JAIL_MS,
};

function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] ?? Date.now();
}

/** A tile's printed name. */
export function tileName(i: number): string {
  const t = TILES[i]!;
  switch (t.kind) {
    case 'city':
      return CITY_NAME[t.key];
    case 'transport':
      return TRANSPORT_NAME[t.key];
    case 'corner':
      return CORNER_NAME[t.key];
    case 'tax':
      return TAX_NAME[t.key];
    default:
      return KABAR_NAME;
  }
}

export class JuraganDriver {
  readonly clock: GameClock;
  private L: JuraganLogic | null = null;
  private readonly sent = new Map<number, string>();
  /** One-off phone screens (rent paid or received) that stay until the next turn starts. */
  private readonly transient = new Map<number, ControllerView>();
  private finalViews: Map<number, ControllerView> | null = null;
  private result: GameResult | null = null;
  private connected = new Set<number>();
  private cpus: PlayerInfo[] = [];
  private skill = 0;
  private seq = 0;
  private raf = 0;
  private interval = 0;
  private ended = false;
  private lastGame: number | null = null;
  private lastCount = 0;
  private bonus = false;
  private doubles = false;
  private hint = '';
  private brainPlan: { key: string; at: number } | null = null;
  private model: HudModel;
  private readonly toastQueue: Omit<Toast, 'key'>[] = [];
  private toastUntil = 0;
  private toastGone = 0;
  private cardUntil = 0;
  private readonly deltas = new Map<number, { key: number; amount: number; until: number }[]>();
  /** Game-time callbacks (paused with the game). */
  private readonly later: { at: number; fn: () => void }[] = [];
  /** What the board shows beyond the rules' state, for far-away main screens (long-distance play). */
  private activePawn: number | null = null;
  private focusPawn: number | null = null;
  private glow: { tile: number; color: string } | null = null;
  /** Recent board effects (dice, walks, coins, Kabar cards), numbered, newest last. */
  private readonly fx: MirrorFx[] = [];
  private soloReported = false;
  private shellPaused = false;
  /** Offline demo (`?demo=N`): the brain plays every seat. */
  autopilot = false;
  /** The last rent paid (the takeover offer mentions it). */
  private lastRent = 0;
  /** Renovasi Gotong Royong: the city highlighted on the phone (confirmed with one tap). */
  private renovatePick = -1;

  constructor(
    private readonly game: HoorahGame,
    private readonly view: JuraganView,
    private readonly hud: HudStore,
  ) {
    this.clock = new GameClock(() => game.now());
    this.model = {
      players: [],
      turn: null,
      dice: null,
      rolling: false,
      tile: null,
      card: null,
      banner: null,
      toast: null,
      round: { n: 0, of: 0 },
      lastRound: false,
    };
  }

  private get logic(): JuraganLogic {
    if (!this.L) throw new Error('Juragan has not started');
    return this.L;
  }

  start(): void {
    this.cpus = juraganOpponents(this.game.players);
    this.skill = cpuSkill(this.game.gameId);
    const roster = this.roster();
    this.connected = new Set(this.game.allPlayers.filter((p) => p.connected).map((p) => p.id));
    this.L = new JuraganLogic({
      roster,
      rounds: Number(this.game.settings.rounds ?? DEFAULT_ROUNDS),
      now: this.clock.now(),
      seed: randomSeed(),
    });
    // Dev-only hook for local harnesses (never in builds).
    if (import.meta.env.DEV) (window as unknown as { __juragan?: JuraganLogic }).__juragan = this.L;
    const L = this.L;
    this.model.round = { n: 0, of: L.rounds };
    this.view.setPawns(
      L.players.map((p) => {
        const info = this.info(p.id);
        return { id: p.id, look: info?.look ?? UNKNOWN_LOOK, color: info?.color ?? '#C4C7CC' };
      }),
    );
    this.view.place(this.places(), true);
    this.game.on('players', () => this.onPlayers());
    this.game.on('action', (from, a) => this.onAction(from, a));
    this.game.on('pause', (p) => this.setPaused(p));
    this.game.on('mirrors', (on) => {
      if (on) this.publish();
    });
    if (this.game.paused) this.setPaused(true);
    this.flush();
    this.refreshHud();
    this.syncViews();
    // Shader warm-up and the opening fly-in are not a measure of the device's speed.
    this.view.holdGovernor(INTRO_MS + 500);
    const loop = () => {
      this.frame();
      if (!this.ended) this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    this.interval = window.setInterval(() => this.step(), FALLBACK_TICK_MS);
  }

  /* ---------------------------------------------------------------- loop */

  private frame(): void {
    const now = performance.now();
    this.step();
    // Capped at 30 fps on a slow screen: the next due frame covers this one's time.
    if (!this.view.due(now)) return;
    // The view runs on game time, so a hitch never leaves a pawn walking after its move is over.
    const g = this.clock.now();
    const dt = this.lastGame === null ? 0 : Math.min(1, Math.max(0, (g - this.lastGame) / 1000));
    this.lastGame = g;
    this.view.frame(dt, now);
  }

  private step(): void {
    const L = this.L;
    if (!L) return;
    const now = this.clock.now();
    if (!this.ended && !this.clock.paused) {
      L.tick(now);
      this.flush();
      this.think(now);
      this.runLater(now);
      this.pumpToasts(now);
    }
    const human = L.deciding && !this.brainSeat(L.player.id);
    const total = DECISION_MS[L.phase] ?? ROLL_MS;
    const left = Math.max(0, L.deadline - now);
    const secs = Math.ceil(left / 1000);
    if (human && secs >= 1 && secs <= 3 && secs !== this.lastCount) {
      this.lastCount = secs;
      this.sfx('count');
    }
    const v: FrameValues = {
      decision: human ? { frac: Math.min(1, left / total), secs } : null,
    };
    this.hud.frame(v);
  }

  private runLater(now: number): void {
    if (!this.later.length) return;
    const due = this.later.filter((x) => x.at <= now);
    if (!due.length) return;
    for (const d of due) this.later.splice(this.later.indexOf(d), 1);
    for (const d of due) d.fn();
    this.refreshHud();
  }

  private after(ms: number, fn: () => void): void {
    if (ms <= 0) {
      fn();
      return;
    }
    this.later.push({ at: this.clock.now() + ms, fn });
  }

  /* ---------------------------------------------------------------- players */

  private roster() {
    return [
      ...this.game.allPlayers.map((p) => ({ id: p.id, connected: p.connected })),
      ...this.cpus.map((p) => ({ id: p.id, connected: true, cpu: true })),
    ];
  }

  private info(id: number): PlayerInfo | undefined {
    return this.game.player(id) ?? this.cpus.find((p) => p.id === id);
  }

  private name(id: number | null): string {
    if (id === null) return STR.bank;
    return this.info(id)?.name ?? STR.unknownPlayer;
  }

  private color(id: number): string {
    return this.info(id)?.color ?? '#C4C7CC';
  }

  private onPlayers(): void {
    const L = this.L;
    if (!L) return;
    const now = new Set(this.game.allPlayers.filter((p) => p.connected).map((p) => p.id));
    for (const id of now) if (!this.connected.has(id)) this.sent.delete(id);
    this.connected = now;
    if (!this.ended) {
      L.setRoster(this.roster(), this.clock.now());
      this.flush();
    }
    this.updateHold();
    this.refreshHud();
    this.syncViews();
  }

  private onAction(from: number, a: ControllerToGame): void {
    const L = this.L;
    if (!L || this.ended || this.clock.paused || a.k !== 'action') return;
    const now = this.clock.now();
    let ok = false;
    if (a.id === 'drop' || a.id === 'roll') ok = L.roll(from, now);
    else if (a.id === 'pick') ok = this.pickRenovate(from, a.value);
    else if (a.id === 'renovate') ok = L.decide(from, `renovate-${this.renovatePick}`, now);
    else if (a.id !== 'rematch') ok = L.decide(from, a.id, now);
    if (ok) this.flush();
    else {
      // Late or out of turn: make sure the phone shows the real state again.
      this.sent.delete(from);
      this.syncViews();
    }
  }

  /** The renovating player taps a city on the phone: highlight it on the board and the phone. */
  private pickRenovate(from: number, value: string | undefined): boolean {
    const L = this.logic;
    const tile = Number(value);
    if (L.phase !== 'renovate' || from !== L.player.id || !L.renovateOptions.includes(tile)) return false;
    if (tile !== this.renovatePick) {
      this.renovatePick = tile;
      this.sfx('tick');
    }
    this.updateFocus();
    this.refreshHud();
    this.syncViews();
    return true;
  }

  private setPaused(paused: boolean): void {
    this.shellPaused = paused;
    this.updateHold();
  }

  /** Freeze the game while the shell is paused or nobody is connected. */
  private updateHold(): void {
    const nobody = this.connected.size === 0 && !this.ended;
    const hold = this.shellPaused || nobody;
    if (hold === this.clock.paused) return;
    if (hold) this.clock.pause();
    else this.clock.resume();
    this.hud.paused.value = hold;
    this.publish();
    // Deadlines are sent in server time, which shifted while paused.
    if (!hold) {
      this.view.holdGovernor(1000);
      this.sent.clear();
      this.syncViews();
    }
  }

  /* ---------------------------------------------------------------- computer seats */

  /** Seats the brain plays: computer opponents, and dropped phones while someone is still here. */
  private brainSeat(id: number): boolean {
    if (this.autopilot || isCpu(id)) return true;
    const p = this.game.player(id);
    return !!p && !p.connected && this.connected.size > 0;
  }

  private think(now: number): void {
    const L = this.logic;
    if (!L.deciding || !this.brainSeat(L.player.id)) {
      this.brainPlan = null;
      return;
    }
    const me = L.player;
    const key = `${L.phase}:${me.id}:${L.since}`;
    if (this.brainPlan?.key !== key) {
      const kind: BrainAct =
        L.phase === 'roll' ||
        L.phase === 'buy' ||
        L.phase === 'upgrade' ||
        L.phase === 'takeover' ||
        L.phase === 'renovate'
          ? L.phase
          : 'jail';
      this.brainPlan = { key, at: now + actDelay(kind, this.skill, !isCpu(me.id)) };
      return;
    }
    if (now < this.brainPlan.at) return;
    this.brainPlan = null;
    const board = { players: L.players, tiles: L.tiles, roundsLeft: L.roundsLeft };
    const tile = L.offerTile;
    let ok = false;
    switch (L.phase) {
      case 'roll':
        ok = L.roll(me.id, now);
        break;
      case 'buy':
        ok = L.decide(me.id, tile !== null && shouldBuy(board, me, tile, this.skill) ? 'buy' : 'skip', now);
        break;
      case 'upgrade':
        ok = L.decide(
          me.id,
          tile !== null && shouldUpgrade(board, me, tile, this.skill) ? 'upgrade' : 'skip',
          now,
        );
        break;
      case 'takeover':
        ok = L.decide(
          me.id,
          tile !== null && shouldTakeover(board, me, tile, this.skill) ? 'takeover' : 'skip',
          now,
        );
        break;
      case 'renovate':
        ok = L.decide(me.id, `renovate-${chooseRenovate(board, L.renovateOptions, this.skill)}`, now);
        break;
      case 'jail':
        ok = L.decide(me.id, jailChoice(board, me, this.skill), now);
        break;
      default:
        break;
    }
    if (ok) this.flush();
  }

  /* ---------------------------------------------------------------- events */

  private flush(): void {
    const L = this.L;
    if (!L) return;
    const events = L.drain();
    if (!events.length) return;
    for (const e of events) this.handle(e);
    this.syncTiles();
    this.updateFocus();
    this.refreshHud();
    this.syncViews();
  }

  private places() {
    return this.logic.players.map((p) => ({ id: p.id, tile: p.pos, jailed: p.jailed, out: p.bankrupt }));
  }

  private handle(e: JuraganEvent): void {
    const L = this.logic;
    switch (e.type) {
      case 'intro':
        this.model.banner = {
          kind: 'intro',
          key: ++this.seq,
          title: STR.intro,
          sub: STR.introSub,
          line: STR.introFirst(this.name(L.players[0]?.id ?? null), L.rounds),
          winner: null,
        };
        this.sfx('reveal');
        return;
      case 'round':
        this.model.round = { n: e.round, of: L.rounds };
        if (e.last && e.round > 1) this.lastRoundBanner();
        return;
      case 'turn':
      case 'jail': {
        if (this.model.banner?.kind === 'intro') {
          this.model.banner = null;
          this.sfx('go');
        }
        const bonus = e.type === 'turn' && e.bonus;
        if (!bonus) this.transient.clear();
        this.bonus = bonus;
        this.lastCount = 0;
        this.setActive(e.player);
        this.hint =
          e.type === 'jail' ? STR.hintJail : this.brainSeat(e.player) ? STR.hintRollAuto : STR.hintRoll;
        if (!this.brainSeat(e.player)) {
          this.buzz(e.player, [70, 40, 70]);
          if (!bonus) this.sfx('ready');
        }
        if (e.type === 'jail') this.sfx('whistle');
        return;
      }
      case 'jailPay':
        this.toast(STR.toastFine(this.name(e.player)), rp(TILANG_FINE), 'bad');
        return;
      case 'jailWait':
        this.toast(STR.toastWait(this.name(e.player)), null, 'neutral');
        return;
      case 'roll': {
        this.doubles = e.doubles;
        this.model.dice = e.dice;
        this.model.rolling = true;
        this.hint = STR.hintRolling;
        this.view.rollDice(e.dice, this.view.pawnPoint(e.player), (DICE_MS / 1000) * 0.88);
        this.effect({ k: 'd', p: e.player, v: [e.dice[0], e.dice[1]] });
        this.sfx('clap');
        this.after(DICE_MS * 0.7, () => {
          this.sfx(e.doubles ? 'correct' : 'drop');
          this.model.rolling = false;
          if (e.doubles) this.toast(STR.doubles, STR.doublesSub, 'gold');
        });
        return;
      }
      case 'triple':
        this.toast(STR.toastTriple, null, 'bad');
        return;
      case 'move': {
        this.view.place(this.places());
        this.view.walk(e.player, e.path, e.kind, HOP_MS / 1000, JUMP_MS / 1000);
        this.effect({ k: 'w', p: e.player, m: e.kind, path: [...e.path] });
        if (e.kind === 'jump') {
          this.sfx('jump');
        } else {
          this.hint = STR.hintMoving(e.path.length);
          for (let k = 0; k < e.path.length; k++)
            this.after(k * HOP_MS + HOP_MS * 0.85, () => this.sfx('tick'));
        }
        return;
      }
      case 'jailed':
        this.toast(STR.toastJailed(this.name(e.player)), null, 'bad');
        this.sfx('whistle');
        this.buzz(e.player, [200, 80, 200]);
        return;
      case 'land':
        return;
      case 'offer':
        this.hint = STR.hintBuy(tileName(e.tile));
        if (!this.brainSeat(e.player)) this.buzz(e.player, [40]);
        return;
      case 'cantAfford':
        this.toast(STR.toastCantBuy(tileName(e.tile)), null, 'neutral');
        return;
      case 'buy':
        this.toast(STR.toastBuy(this.name(e.player), tileName(e.tile)), rp(e.price), 'neutral');
        this.hint = TILES[e.tile]!.kind === 'city' ? STR.hintBought(tileName(e.tile)) : tileName(e.tile);
        this.sfx('ding');
        return;
      case 'skip':
        this.sfx('back');
        return;
      case 'pay':
        this.onPay(e);
        return;
      case 'sell':
        this.toast(
          e.what === 'building'
            ? STR.toastSellBuilding(this.name(e.player), LEVEL_NAME[e.level + 1] ?? '', tileName(e.tile))
            : STR.toastSell(this.name(e.player), tileName(e.tile)),
          `+${rp(e.amount)}`,
          'neutral',
        );
        this.coins(null, e.player, e.amount);
        this.addDelta(e.player, e.amount);
        return;
      case 'bankrupt':
        this.toast(STR.toastBankrupt(this.name(e.player)), null, 'bad');
        this.sfx('collapse');
        this.after(500, () => this.sfx('boo'));
        this.buzz(e.player, [300, 100, 300]);
        this.view.place(this.places());
        return;
      case 'card': {
        const text = CARD_TEXT[e.card];
        this.hint = text.title;
        this.view.drawCard();
        this.effect({ k: 'k' });
        this.sfx('reveal');
        this.after(420, () => {
          this.model.card = { key: ++this.seq, title: text.title, body: text.body, tone: cardTone(e.card) };
          this.cardUntil = this.clock.now() + CARD_MS;
          this.sfx(cardTone(e.card) === 'bad' ? 'wrong' : 'correct');
        });
        this.after(CARD_MS + 300, () => {
          if (this.clock.now() >= this.cardUntil) this.model.card = null;
        });
        return;
      }
      case 'upgradeOffer':
        this.hint = STR.hintUpgrade(tileName(e.tile), LEVEL_NAME[e.level] ?? '');
        if (!this.brainSeat(e.player)) this.buzz(e.player, [40]);
        return;
      case 'noUpgrade':
        this.toast(
          e.reason === 'max' ? STR.toastTopLevel(tileName(e.tile)) : STR.toastNoUpgrade(tileName(e.tile)),
          null,
          'neutral',
        );
        return;
      case 'upgrade': {
        const level = LEVEL_NAME[e.level] ?? '';
        this.hint = STR.hintUpgraded(tileName(e.tile), level);
        this.toast(
          e.free
            ? STR.toastUpgradeFree(level, tileName(e.tile))
            : STR.toastUpgrade(this.name(e.player), level, tileName(e.tile)),
          e.free ? null : rp(e.cost),
          e.free ? 'gold' : 'good',
        );
        this.after(120, () => this.sfx('super'));
        return;
      }
      case 'renovateOffer':
        this.renovatePick = e.best;
        this.hint = STR.hintRenovate;
        if (!this.brainSeat(e.player)) this.buzz(e.player, [40, 30, 40]);
        return;
      case 'takeoverOffer':
        this.hint = STR.hintTakeover(tileName(e.tile));
        if (!this.brainSeat(e.player)) this.buzz(e.player, [40, 30, 40]);
        return;
      case 'takeover': {
        const place = tileName(e.tile);
        this.hint = STR.hintTaken(place);
        this.toast(STR.toastTakeover(this.name(e.player), place, this.name(e.from)), rp(e.price), 'gold');
        this.sfx('horn');
        this.after(450, () => this.sfx('splash'));
        this.transient.set(
          e.player,
          V.takeoverDoneView(true, place, e.price, this.name(e.from), this.wallet(e.player)),
        );
        this.transient.set(
          e.from,
          V.takeoverDoneView(false, place, e.price, this.name(e.player), this.wallet(e.from)),
        );
        this.buzz(e.from, [200, 60, 200]);
        return;
      }
      case 'decline':
        this.sfx('back');
        return;
      case 'finish':
        this.onFinish(e.winner, e.reason);
        return;
      case 'end':
        this.finish();
        return;
    }
  }

  /** "Putaran terakhir!" over the board for a moment; the putaran counter stays red after. */
  private lastRoundBanner(): void {
    this.model.lastRound = true;
    const key = ++this.seq;
    this.model.banner = {
      kind: 'last',
      key,
      title: STR.lastRound,
      sub: STR.lastRoundSub,
      line: null,
      winner: null,
    };
    this.sfx('tension');
    this.after(LAST_ROUND_BANNER_MS, () => {
      if (this.model.banner?.key === key) this.model.banner = null;
    });
  }

  private onPay(e: Extract<JuraganEvent, { type: 'pay' }>): void {
    const delay = e.step !== undefined ? (e.step + 1) * HOP_MS : 0;
    this.after(delay, () => {
      this.coins(e.from, e.to, e.amount);
      if (e.from !== null) this.addDelta(e.from, -e.amount);
      if (e.to !== null) this.after(500, () => this.addDelta(e.to as number, e.amount));
      const sound: Partial<Record<PayReason, Sfx>> = {
        salary: 'perfect',
        payday: 'cheer',
        rent: e.amount >= 300 ? 'boo' : 'wrong',
        tax: 'wrong',
        card: e.to !== null && e.from === null ? 'ding' : undefined,
      };
      const s = sound[e.reason];
      if (s) this.sfx(s);
    });
    const L = this.logic;
    switch (e.reason) {
      case 'salary':
        this.after(delay, () => this.toast(STR.toastSalary, `+${rp(e.amount)}`, 'good'));
        return;
      case 'payday':
        this.toast(STR.toastPayday, `+${rp(e.amount)}`, 'gold');
        return;
      case 'rent': {
        if (e.from === null || e.to === null) return;
        this.lastRent = e.amount;
        this.toast(STR.toastRent(this.name(e.from), this.name(e.to)), rp(e.amount), 'bad');
        const payer = L.playerById(e.from);
        const owner = L.playerById(e.to);
        if (payer && !payer.bankrupt)
          this.transient.set(e.from, V.rentView(true, e.amount, this.name(e.to), this.wallet(e.from)));
        if (owner)
          this.transient.set(e.to, V.rentView(false, e.amount, this.name(e.from), this.wallet(e.to)));
        this.buzz(e.from, [120, 60, 120]);
        this.buzz(e.to, [40, 30, 40]);
        return;
      }
      case 'tax':
        if (e.from !== null) this.toast(STR.toastTax(this.name(e.from)), rp(e.amount), 'bad');
        return;
      case 'card':
        if (e.from !== null && e.to !== null)
          this.toast(STR.toastCardPay(this.name(e.from), this.name(e.to)), rp(e.amount), 'neutral');
        return;
      default:
        return;
    }
  }

  /** Bring the board's owner frames and buildings in line with the rules' state. */
  private syncTiles(): void {
    this.view.showTiles(this.logic.tiles, (id) => this.color(id));
  }

  private updateFocus(): void {
    const L = this.logic;
    if (L.phase === 'intro' || L.phase === 'finale' || L.phase === 'ended') {
      this.focusPawn = null;
      this.glow = null;
      this.view.focusPawn(null);
      this.view.highlight(null);
      if (L.phase !== 'intro') this.setActive(null);
      return;
    }
    this.focusPawn = L.player.id;
    this.view.focusPawn(L.player.id);
    const offer = L.phase === 'buy' || L.phase === 'upgrade' || L.phase === 'takeover' ? L.offerTile : null;
    const pick = L.phase === 'renovate' && this.renovatePick >= 0 ? this.renovatePick : null;
    const tile = pick ?? offer;
    const color =
      L.phase === 'takeover' ? '#FF6B5E' : L.phase === 'upgrade' || pick !== null ? '#5BD08A' : '#FFC928';
    this.glow = tile === null ? null : { tile, color };
    this.view.highlight(tile, color);
  }

  private setActive(id: number | null): void {
    this.activePawn = id;
    this.view.setActive(id);
  }

  /** Coins fly between two pawns (null is the bank). */
  private coins(from: number | null, to: number | null, amount: number): void {
    const anchor = (id: number | null): Anchor => (id === null ? 'bank' : { pawn: id });
    this.view.coins(anchor(from), anchor(to), amount);
    this.effect({ k: 'c', f: from, t: to, a: amount });
  }

  /** Remember a board effect so a far-away main screen plays it too. */
  private effect(fx: MirrorFxBody): void {
    this.fx.push({ ...fx, n: ++this.seq, at: this.clock.now() });
    while (this.fx.length > FX_KEEP) this.fx.shift();
  }

  private onFinish(winner: number | null, reason: EndReason): void {
    const L = this.logic;
    this.result = this.makeResult();
    this.reportSolo(winner);
    const head = headline(L, (id) => this.name(id));
    const rows = standings(L);
    this.finalViews = new Map();
    for (const r of rows) {
      const p = L.playerById(r.id)!;
      this.finalViews.set(
        r.id,
        V.finalView({
          rank: r.rank,
          bankrupt: r.bankrupt,
          worth: r.worth,
          headline: head,
          cities: propertiesOf(L.tiles, r.id).length,
          rent: p.stats.rentCollected,
        }),
      );
    }
    const w = winner === null ? null : this.info(winner);
    const worth = winner === null ? 0 : L.worth(L.playerById(winner)!);
    this.model.card = null;
    this.model.banner = {
      kind: 'finale',
      key: ++this.seq,
      title: w ? STR.finaleTitle(w.name.toUpperCase()) : STR.roundsUp,
      sub: reason === 'rounds' ? STR.roundsUp : STR.finaleLast,
      line: w ? STR.finaleSub(rp(worth)) : null,
      winner: w ? { name: w.name, look: w.look, color: w.color } : null,
    };
    this.setActive(null);
    this.focusPawn = null;
    this.view.focusOn(null);
    this.sfx('win');
    celebrate();
    window.setTimeout(() => confetti({ y: 0.4, count: 90, power: 0.8 }), 600);
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    window.clearInterval(this.interval);
    // Keep rendering a moment so the finale doesn't freeze mid-animation.
    window.setTimeout(() => cancelAnimationFrame(this.raf), 400);
    this.game.end(this.result ?? this.makeResult());
  }

  private makeResult(): GameResult {
    const r = buildResult(this.logic, (id) => this.name(id));
    return this.cpus.length ? { ...r, cpuPlayers: this.cpus } : r;
  }

  /** A solo game against the computer just ended: nudge its skill for next time. */
  private reportSolo(winner: number | null): void {
    if (!this.cpus.length || this.soloReported) return;
    this.soloReported = true;
    reportSoloResult(this.game.gameId, winner !== null && !isCpu(winner) ? 'win' : 'lose');
  }

  /* ---------------------------------------------------------------- HUD */

  private toast(text: string, amount: string | null, tone: Toast['tone']): void {
    this.toastQueue.push({ text, amount, tone });
    if (this.toastQueue.length > 3) this.toastQueue.shift();
    this.pumpToasts(this.clock.now());
  }

  private pumpToasts(now: number): void {
    if (this.toastQueue.length && now >= this.toastUntil) {
      const t = this.toastQueue.shift()!;
      this.model.toast = { ...t, key: ++this.seq };
      this.toastUntil = now + TOAST_GAP_MS;
      this.toastGone = now + TOAST_LIFE_MS;
      this.refreshHud();
    } else if (this.model.toast && now >= this.toastGone) {
      this.model.toast = null;
      this.refreshHud();
    }
  }

  private addDelta(id: number, amount: number): void {
    const list = this.deltas.get(id) ?? [];
    const until = this.clock.now() + DELTA_LIFE_MS;
    list.push({ key: ++this.seq, amount, until });
    while (list.length > 2) list.shift();
    this.deltas.set(id, list);
    this.after(DELTA_LIFE_MS + 50, () => {
      const l = this.deltas.get(id);
      if (l)
        this.deltas.set(
          id,
          l.filter((d) => d.until > this.clock.now()),
        );
    });
  }

  private wallet(id: number): V.Wallet {
    const L = this.logic;
    const p = L.playerById(id);
    const rows = standings(L);
    const rank = rows.find((r) => r.id === id)?.rank ?? rows.length;
    return {
      cash: p?.cash ?? 0,
      worth: p ? L.worth(p) : 0,
      cities: propertiesOf(L.tiles, id).length,
      rank,
      of: rows.length,
    };
  }

  private tileCard(i: number): TileCardModel {
    const L = this.logic;
    const t = TILES[i]!;
    const s = L.tiles[i]!;
    const ownerInfo = s.owner === null ? null : this.info(s.owner);
    const owner = ownerInfo ? { name: ownerInfo.name, look: ownerInfo.look, color: ownerInfo.color } : null;
    const forSale = L.phase === 'buy' && L.offerTile === i;
    const base: TileCardModel = {
      tile: i,
      eyebrow: '',
      name: tileName(i),
      color: '#1E1F24',
      price: null,
      rows: [],
      double: false,
      lines: [],
      owner,
      note: null,
      forSale,
      level: 0,
    };
    switch (t.kind) {
      case 'city': {
        const whole = s.owner !== null && ownsGroup(L.tiles, s.owner, t.group);
        const rows = [1, 2, 3, 4].map((lvl) => ({
          label: LEVEL_NAME[lvl] ?? '',
          value: cityRent(t, lvl) * (whole ? 2 : 1),
          current: s.owner !== null && s.level === lvl,
        }));
        const lines: CardLine[] = [];
        const next = s.owner === null ? null : upgradeCost(i, s.level);
        if (s.owner === null) lines.push({ label: STR.cardUpgrade(LEVEL_NAME[2]), value: rp(t.upgrade[0]) });
        else if (next !== null)
          lines.push({ label: STR.cardUpgrade(LEVEL_NAME[s.level + 1] ?? ''), value: rp(next) });
        const take = takeoverPrice(L.tiles, i);
        if (take !== null)
          lines.push({ label: STR.cardTakeover, value: rp(take), strong: L.phase === 'takeover' });
        else if (s.owner !== null && s.level >= MAX_LEVEL)
          lines.push({ label: STR.cardHotelSafe, value: '', strong: true });
        return {
          ...base,
          eyebrow: STR.cardIsland(GROUP_NAME[t.group]),
          color: GROUP_COLOR[t.group],
          price: t.price,
          rows,
          double: whole,
          lines,
          note: s.owner === null ? STR.cardIslandNote : null,
          level: s.level,
        };
      }
      case 'transport': {
        const n = s.owner === null ? 0 : TRANSPORT_TILES.filter((k) => L.tiles[k]!.owner === s.owner).length;
        return {
          ...base,
          eyebrow: STR.cardTransport,
          color: '#21344F',
          price: t.price,
          rows: [
            { label: STR.cardTransportOne, value: TRANSPORT_RENT[0], current: n === 1 },
            { label: STR.cardTransportTwo, value: TRANSPORT_RENT[1], current: n === 2 },
          ],
          note: STR.cardTransportNote,
        };
      }
      case 'corner': {
        const notes = {
          start: STR.noteStart,
          tilang: STR.noteTilang,
          rehat: STR.noteRehat,
          razia: STR.noteRazia,
        };
        const colors = { start: '#C98A00', tilang: '#C2410C', rehat: '#7A4A28', razia: '#C92D25' };
        return { ...base, eyebrow: STR.cardCorner, color: colors[t.key], note: notes[t.key] };
      }
      case 'tax':
        return {
          ...base,
          eyebrow: STR.cardTax,
          color: '#8C3B2E',
          note: t.key === 'usaha' ? STR.noteTaxUsaha : STR.noteTaxKekayaan,
        };
      default:
        return { ...base, eyebrow: STR.cardKabar, color: '#B07A00', note: STR.noteKabar };
    }
  }

  private refreshHud(): void {
    const L = this.L;
    if (!L) return;
    const rows = standings(L);
    const live = L.phase !== 'intro' && L.phase !== 'finale' && L.phase !== 'ended';
    const now = this.clock.now();
    const players: HudPlayer[] = L.players.map((p) => {
      const info = this.info(p.id);
      return {
        id: p.id,
        name: info?.name ?? STR.unknownPlayer,
        look: info?.look ?? UNKNOWN_LOOK,
        color: info?.color ?? '#C4C7CC',
        cash: p.cash,
        worth: p.bankrupt ? 0 : L.worth(p),
        cities: propertiesOf(L.tiles, p.id).length,
        rank: rows.find((r) => r.id === p.id)?.rank ?? 0,
        active: live && L.player.id === p.id,
        jailed: p.jailed,
        bankrupt: p.bankrupt,
        connected: isCpu(p.id) || L.isConnected(p.id),
        deltas: (this.deltas.get(p.id) ?? [])
          .filter((d) => d.until > now)
          .map((d) => ({ key: d.key, amount: d.amount })),
      };
    });
    const cur = L.player;
    const info = this.info(cur.id);
    const focus =
      L.phase === 'renovate' && this.renovatePick >= 0
        ? this.renovatePick
        : L.phase === 'buy' && L.offerTile !== null
          ? L.offerTile
          : (L.focusTile ?? (live ? cur.pos : null));
    this.model = {
      ...this.model,
      players,
      turn:
        live && info
          ? {
              id: cur.id,
              name: info.name,
              look: info.look,
              color: info.color,
              hint: this.hint,
              bonus: this.bonus,
            }
          : null,
      tile: focus === null ? null : this.tileCard(focus),
    };
    this.hud.model.value = this.model;
    this.publish();
  }

  /** Long-distance play: what this screen shows, for far-away main screens (only while watched). */
  private publish(): void {
    const L = this.L;
    if (!L || !this.game.mirrored) return;
    const human = L.deciding && !this.brainSeat(L.player.id);
    this.game.publish(
      toMirror({
        model: this.model,
        tiles: L.tiles,
        places: this.places(),
        active: this.activePawn,
        focus: this.focusPawn,
        highlight: this.glow,
        fx: this.fx,
        ring: human ? { deadline: L.deadline, total: DECISION_MS[L.phase] ?? ROLL_MS } : null,
        frozenAt: this.clock.paused ? this.clock.now() : null,
        toServer: (t) => this.clock.toServer(t),
      }),
    );
  }

  /* ---------------------------------------------------------------- phones */

  private doing(): string {
    const L = this.logic;
    switch (L.phase) {
      case 'roll':
        return STR.phoneWatchRoll;
      case 'rolling':
        return STR.hintRolling.toLowerCase();
      case 'moving': {
        const d = L.dice;
        return d ? STR.phoneWatchMove(d[0] + d[1]) : STR.phoneWatchWait;
      }
      case 'buy':
        return STR.phoneWatchBuy(L.offerTile === null ? '' : tileName(L.offerTile));
      case 'upgrade':
        return STR.phoneWatchUpgrade(L.offerTile === null ? '' : tileName(L.offerTile));
      case 'takeover':
        return STR.phoneWatchTakeover(L.offerTile === null ? '' : tileName(L.offerTile));
      case 'renovate':
        return STR.phoneWatchRenovate;
      case 'jail':
        return STR.phoneWatchJail;
      case 'card':
        return STR.phoneWatchCard(L.card ? CARD_TEXT[L.card].title : KABAR_NAME);
      default:
        return STR.phoneWatchWait;
    }
  }

  private viewFor(id: number): ControllerView {
    if (this.finalViews) return this.finalViews.get(id) ?? V.spectatorView();
    const L = this.logic;
    const me = L.playerById(id);
    if (!me) return V.spectatorView();
    if (L.phase === 'intro') return V.introView(this.wallet(id), L.rounds);
    if (me.bankrupt) return V.bankruptView();
    // A decision always wins over a one-off screen (rent paid just before building, say).
    const deciding = id === L.player.id && L.deciding;
    if (deciding) this.transient.delete(id);
    const tr = this.transient.get(id);
    if (tr) return tr;
    const w = this.wallet(id);
    if (id === L.player.id) {
      switch (L.phase) {
        case 'roll':
          return V.rollView(this.bonus, w, tileName(me.pos), this.clock.toServer(L.deadline));
        case 'buy': {
          const i = L.offerTile;
          const t = i === null ? null : TILES[i]!;
          if (i !== null && t && isOwnable(t)) {
            const rent = t.kind === 'city' ? t.rent[0] : TRANSPORT_RENT[0];
            return V.buyView(
              { place: tileName(i), price: t.price, rent, transport: t.kind === 'transport' },
              w,
            );
          }
          break;
        }
        case 'upgrade': {
          const i = L.offerTile;
          const t = i === null ? null : TILES[i]!;
          if (i !== null && t?.kind === 'city') {
            const s = L.tiles[i]!;
            const mult = ownsGroup(L.tiles, id, t.group) ? 2 : 1;
            return V.upgradeView(
              {
                place: tileName(i),
                level: LEVEL_NAME[s.level + 1] ?? '',
                cost: L.offerCost,
                rentNow: rentAt(L.tiles, i),
                rentNext: cityRent(t, s.level + 1) * mult,
                hotel: s.level + 1 >= MAX_LEVEL,
              },
              w,
            );
          }
          break;
        }
        case 'takeover': {
          const i = L.offerTile;
          const owner = i === null ? null : L.tiles[i]!.owner;
          if (i !== null && owner !== null) {
            return V.takeoverView(
              {
                place: tileName(i),
                ownerId: owner,
                owner: this.name(owner),
                price: L.offerCost,
                rent: this.lastRent,
                level: LEVEL_NAME[L.tiles[i]!.level] ?? '',
              },
              w,
            );
          }
          break;
        }
        case 'renovate':
          return V.renovateView(
            L.renovateOptions.map((i) => this.renovateChoice(i)),
            this.renovatePick,
          );
        case 'jail':
          return V.jailView(TILANG_FINE, w);
        case 'card':
          if (L.card) {
            const c = CARD_TEXT[L.card];
            return V.cardView(c.title, c.body, cardTone(L.card), w);
          }
          break;
        default:
          break;
      }
      return V.rolledView(L.dice, this.doubles, w);
    }
    return V.watchView(L.player.id, this.name(L.player.id), this.doing(), w);
  }

  /** One row of the Renovasi list: the city, its level now and next, and the rent it brings. */
  private renovateChoice(i: number): V.RenovateChoice {
    const L = this.logic;
    const t = TILES[i]!;
    const s = L.tiles[i]!;
    const mult = t.kind === 'city' && s.owner !== null && ownsGroup(L.tiles, s.owner, t.group) ? 2 : 1;
    return {
      tile: i,
      place: tileName(i),
      from: LEVEL_NAME[s.level] ?? '',
      to: LEVEL_NAME[s.level + 1] ?? '',
      toLevel: s.level + 1,
      rentNow: rentAt(L.tiles, i),
      rentNext: t.kind === 'city' ? cityRent(t, s.level + 1) * mult : 0,
      color: t.kind === 'city' ? GROUP_COLOR[t.group] : '#21344F',
    };
  }

  private syncViews(): void {
    if (!this.L || this.clock.paused) return;
    for (const p of this.game.allPlayers) {
      if (!p.connected) continue;
      const view = this.withGuests(this.viewFor(p.id));
      const json = JSON.stringify(view);
      if (this.sent.get(p.id) === json) continue;
      this.sent.set(p.id, json);
      this.game.setView(p.id, view);
    }
  }

  /** Phones only know room players: describe any computer opponent the view shows by id. */
  private withGuests(view: ControllerView): ControllerView {
    if (!this.cpus.length) return view;
    const ids = new Set<number>();
    if ('avatarOf' in view && view.avatarOf !== undefined) ids.add(view.avatarOf);
    const guests = this.cpus
      .filter((c) => ids.has(c.id))
      .map((c) => ({ id: c.id, name: c.name, fruit: c.fruit, look: c.look, color: c.color }));
    return guests.length ? { ...view, guests } : view;
  }

  /** Vibrate a human's phone (never a computer seat). */
  private buzz(id: number, pattern: number[]): void {
    if (!isCpu(id) && this.game.player(id)?.connected) this.game.vibrate(id, pattern);
  }

  private sfx(name: Sfx): void {
    this.game.sfx(name);
  }

  /** Stage layout changed: nothing to recompute in the rules, only the HUD. */
  relayout(): void {
    this.refreshHud();
  }
}
