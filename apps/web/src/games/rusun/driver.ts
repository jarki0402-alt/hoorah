/**
 * Glue between the Hoorah SDK, the pure rules, the Phaser scene and the DOM HUD: owns the game
 * clock (frozen while paused), turns logic events into sounds, phone views and HUD state.
 */
import type { ControllerToGame, ControllerView, PlayerInfo } from '@hoorah/protocol';
import type { GameResult, HoorahGame } from '@hoorah/sdk';
import type { Face } from '../../shared/art/fruits';
import { floorWidth } from '../../shared/art/rusun';
import type { Sfx } from '../../shared/audio';
import { celebrate } from '../../shared/confetti';
import { CONTROL_TUNING } from '../../shared/controls';
import { readRecord as readSoloRecord, submitRecord } from '../common/records';
import type { Banner, HudPlayer, HudStore, PlayerCard } from './hud';
import {
  balanceZone,
  type CollapseInfo,
  type Fall,
  FLOOR_H,
  GameClock,
  GROUND_Y,
  MAX_STRIKES,
  type RusunEvent,
  RusunLogic,
  type ToppedInfo,
  TURN_MS,
} from './logic';
import { buildResult, leaders, rankStandings, type SoloRecord, type Standing, soloRecord } from './results';
import type { SceneDriver } from './scene';
import { STR } from './strings';
import * as V from './views';

const RECORD_KEY = 'hoorah:rusun:record';
/** Key for the solo records (PRD 6.4); the variant is the number of towers. */
const GAME_ID = 'rusun';
const REACTION_GAP_MS = 700;
const TICK_MS = 200;
const POPUP_MS = 1500;
const BUBBLE_MS = 2600;
const SHOUT_MS = 1500;
/** Records shorter than this are not worth a ruler mark. */
const MIN_RECORD = 3;
/** HUD card edges (stage px) the hanging floor can slide behind. */
const TURN_CARD_RIGHT = 92 + 300;
/** Side panel's left edge measured from the stage's right edge (right 24 + width 210). */
const SIDE_PANEL_INSET = 24 + 210;

function readRecord(): number {
  try {
    const v = Number(window.sessionStorage.getItem(RECORD_KEY));
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  } catch {
    return 0;
  }
}

function writeRecord(n: number): void {
  try {
    window.sessionStorage.setItem(RECORD_KEY, String(n));
  } catch {
    // Storage blocked: the record just won't survive a reload.
  }
}

export function parseRounds(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 ? Math.min(5, Math.floor(n)) : 1;
}

export class RusunDriver implements SceneDriver {
  readonly clock: GameClock;
  /** Scene hook: pause/resume rendering and tweens. */
  onPause: (paused: boolean) => void = () => {};

  private logicRef: RusunLogic | null = null;
  /** Live stage width and the world frame's x offset in it (see `setStage`). */
  private stageW = 1280;
  private padX = 0;
  private readonly listeners = new Set<(e: RusunEvent) => void>();
  private readonly sent = new Map<number, string>();
  /** One-off result screens that stay until the next turn view. */
  private readonly transient = new Map<number, ControllerView>();
  private finalViews: Map<number, ControllerView> | null = null;
  private result: GameResult | null = null;
  private banner: Banner | null = null;
  private seq = 0;
  private lastCount = 0;
  private ringFrac = 1;
  private ringSecs = TURN_MS / 1000;
  private readonly reactAt = new Map<number, number>();
  private readonly storedRecord: number;
  /** A lone player started the game: the ruler chases their own record, not the tab's. */
  private soloStart = false;
  /** Solo: the personal record when the game started (null before the first solo game). */
  private recordBefore: number | null = null;
  /** Solo: how this game compares with the record, set once at the finale. */
  private record: SoloRecord | null = null;
  /** Tallest finished tower this game. */
  private completedBest = 0;
  private recordCelebrated = false;
  private connected = new Set<number>();
  private timer = 0;
  private ended = false;
  private side: 1 | -1 = -1;
  private bubbleSide = 0;

  constructor(
    private readonly game: HoorahGame,
    private readonly hud: HudStore,
  ) {
    this.clock = new GameClock(() => game.now());
    this.storedRecord = readRecord();
  }

  get logic(): RusunLogic {
    if (!this.logicRef) throw new Error('Rusun has not started');
    return this.logicRef;
  }

  /** Best height to mark on the ruler: earlier towers (this tab session) or the current one. */
  get recordFloors(): number {
    const prev = Math.max(this.recordBase, this.completedBest);
    if (prev < MIN_RECORD || !this.logicRef) return 0;
    return Math.max(prev, this.logicRef.height);
  }

  /** Height to beat before this game: the solo record, or the tab's record in multiplayer. */
  private get recordBase(): number {
    return this.soloNow ? (this.recordBefore ?? 0) : this.storedRecord;
  }

  /** Still exactly one person in a game that started solo. */
  private get soloNow(): boolean {
    return this.soloStart && this.logicRef?.order.length === 1;
  }

  now(): number {
    return this.clock.now();
  }

  /** The toppling floors hit the street. */
  impact(): void {
    this.sfx('collapse');
  }

  onEvent(fn: (e: RusunEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  start(): void {
    const rounds = parseRounds(this.game.settings.rounds);
    this.connected = new Set(this.game.allPlayers.filter((p) => p.connected).map((p) => p.id));
    // Swing timing comes from the Lab Kontrol settings of this (main screen) browser.
    this.logicRef = new RusunLogic({
      rounds,
      roster: this.roster(),
      now: this.clock.now(),
      swing: { ...CONTROL_TUNING.rusun },
    });
    this.soloStart = this.logicRef.order.length === 1;
    if (this.soloStart) this.recordBefore = readSoloRecord(GAME_ID, String(rounds));
    this.game.on('players', () => this.onPlayers());
    this.game.on('action', (from, a) => this.onAction(from, a));
    this.game.on('pause', (p) => this.setPaused(p));
    if (this.game.paused) this.setPaused(true);
    this.flush();
    this.refreshHud();
    this.syncViews();
    this.timer = window.setInterval(() => this.step(), TICK_MS);
  }

  step(): void {
    const L = this.logicRef;
    if (!L || this.ended) return;
    const now = this.clock.now();
    L.tick(now);
    this.flush();
    if (L.phase === 'aim') {
      const rem = L.deadline - now;
      const secs = Math.ceil(rem / 1000);
      if (secs >= 1 && secs <= 3 && secs !== this.lastCount) {
        this.lastCount = secs;
        this.sfx('count');
      }
    }
  }

  /** The stage grew or shrank: HUD cards sit at the stage edges, the world frame stays centred. */
  setStage(w: number): void {
    this.stageW = w;
    this.padX = Math.max(0, (w - 1280) / 2);
  }

  frame(camY: number, now: number, _dtMs: number): void {
    const L = this.logicRef;
    if (!L) return;
    if (L.phase === 'aim') {
      const rem = Math.max(0, L.deadline - now);
      this.ringFrac = rem / TURN_MS;
      this.ringSecs = Math.ceil(rem / 1000);
    } else if (L.phase !== 'falling') {
      this.ringFrac = 1;
      this.ringSecs = TURN_MS / 1000;
    }
    // Fade a HUD card while the hanging floor swings behind it.
    let fadeLeft = false;
    let fadeRight = false;
    if (L.phase === 'aim' || L.phase === 'waiting') {
      const x = L.swingX(now);
      const half = floorWidth(L.floorIndex) / 2 + 6;
      fadeLeft = this.padX + x - half < TURN_CARD_RIGHT;
      fadeRight = this.padX + x + half > this.stageW - SIDE_PANEL_INSET;
    }
    this.hud.frame({
      camY,
      ring: this.ringFrac,
      secs: this.ringSecs,
      time: now,
      fadeLeft,
      fadeRight,
    });
  }

  /* ---------------------------------------------------------------- SDK input */

  private roster() {
    return this.game.allPlayers.map((p) => ({ id: p.id, connected: p.connected }));
  }

  private onPlayers(): void {
    if (!this.logicRef || this.ended) return;
    const now = new Set(this.game.allPlayers.filter((p) => p.connected).map((p) => p.id));
    // Anyone who (re)connected gets their current view again.
    for (const id of now) if (!this.connected.has(id)) this.sent.delete(id);
    this.connected = now;
    this.logicRef.setRoster(this.roster(), this.clock.now());
    this.flush();
    this.refreshHud();
    this.syncViews();
  }

  private onAction(from: number, a: ControllerToGame): void {
    if (!this.logicRef || this.ended || this.clock.paused || a.k !== 'action') return;
    switch (a.id) {
      case 'drop': {
        const at = typeof a.at === 'number' && Number.isFinite(a.at) ? this.clock.toGame(a.at) : Number.NaN;
        this.logicRef.drop(from, at, this.clock.now());
        this.flush();
        return;
      }
      case 'cheer':
      case 'boo':
      case 'rematch':
        this.react(from, a.id);
        return;
      default:
        return;
    }
  }

  private setPaused(paused: boolean): void {
    if (paused === this.clock.paused) return;
    if (paused) this.clock.pause();
    else this.clock.resume();
    this.hud.paused.value = paused;
    this.onPause(paused);
    // Swing start and deadline are sent in server time, which shifted while paused.
    if (!paused && this.logicRef) this.syncViews();
  }

  private react(from: number, kind: 'cheer' | 'boo' | 'rematch'): void {
    const now = this.clock.now();
    if (now - (this.reactAt.get(from) ?? Number.NEGATIVE_INFINITY) < REACTION_GAP_MS) return;
    if (!this.game.player(from)) return;
    this.reactAt.set(from, now);
    this.sfx(kind === 'boo' ? 'boo' : kind === 'cheer' ? 'cheer' : 'clap');
    const left = this.bubbleSide++ % 2 === 0;
    const x = left ? 120 + Math.random() * 260 : 880 + Math.random() * 120;
    const again = this.soloNow ? STR.phoneAgain : STR.reactRematch;
    const text = kind === 'cheer' ? STR.reactCheer : kind === 'boo' ? STR.reactBoo : again;
    this.hud.addBubble({ id: ++this.seq, who: this.card(from), text, tone: kind, x, until: now + BUBBLE_MS });
  }

  /* ---------------------------------------------------------------- events */

  private flush(): void {
    const L = this.logicRef;
    if (!L) return;
    const events = L.drain();
    if (!events.length) return;
    for (const e of events) {
      this.handle(e);
      for (const fn of this.listeners) fn(e);
    }
    this.refreshHud();
    this.syncViews();
  }

  private handle(e: RusunEvent): void {
    const L = this.logic;
    switch (e.type) {
      case 'intro': {
        this.transient.clear();
        this.recordCelebrated = false;
        const first = L.upcoming();
        this.banner = {
          kind: 'intro',
          key: ++this.seq,
          title: STR.introTitle(e.round, L.rounds),
          sub: STR.introSub(L.rounds),
          first: this.soloNow
            ? this.recordBefore !== null && this.recordBefore >= MIN_RECORD
              ? STR.recordSolo(this.recordBefore)
              : null
            : first !== null
              ? STR.introFirst(this.name(first))
              : null,
        };
        return;
      }
      case 'turn':
        this.transient.clear();
        this.lastCount = 0;
        this.game.vibrate(e.playerId, [80, 40, 80]);
        if (this.banner?.kind === 'intro') {
          this.banner = null;
          this.sfx('go');
        }
        return;
      case 'waiting':
        this.transient.clear();
        if (this.banner?.kind === 'intro') this.banner = null;
        return;
      case 'drop':
        return;
      case 'land':
        this.onLand(e.fall, e.pas, e.points, e.streak, e.enteredRed);
        return;
      case 'miss':
        this.onMiss(e.fall, e.strikes);
        return;
      case 'collapse':
        this.onCollapse(e.info);
        return;
      case 'topped':
        this.onTopped(e.info);
        return;
      case 'finale':
        this.onFinale();
        return;
      case 'end':
        this.ended = true;
        window.clearInterval(this.timer);
        this.game.end(this.result ?? this.buildResult());
        return;
    }
  }

  private onLand(f: Fall, pas: boolean, points: number, streak: number, enteredRed: boolean): void {
    this.sfx('drop');
    if (pas) {
      this.sfx('perfect');
      this.game.vibrate(f.playerId, 260);
    }
    if (enteredRed) this.sfx('tension');
    this.transient.set(f.playerId, V.landView(pas, points, streak));

    const now = this.clock.now();
    const topY = GROUND_Y - (f.floorIndex + 1) * FLOOR_H;
    this.side = this.side === 1 ? -1 : 1;
    const px = Math.max(150, Math.min(1130, f.outcome.x + this.side * (f.width / 2 + 84)));
    this.hud.addPopup({
      id: ++this.seq,
      x: px,
      y: topY - 24,
      kind: pas ? 'pas' : 'land',
      text: pas ? `${STR.popupPas} ${STR.popupPoints(points)}` : STR.popupPoints(points),
      sub: pas && streak > 1 ? STR.popupStreak(streak) : null,
      tilt: this.side * -6,
      until: now + POPUP_MS,
    });

    const L = this.logic;
    const prev = Math.max(this.recordBase, this.completedBest);
    if (!this.recordCelebrated && prev >= 3 && L.height === prev + 1) {
      this.recordCelebrated = true;
      this.sfx('correct');
      this.hud.addPopup({
        id: ++this.seq,
        x: f.outcome.x,
        y: topY - 80,
        kind: 'record',
        text: STR.popupRecord,
        sub: null,
        tilt: 3,
        until: now + POPUP_MS,
      });
    }
  }

  private onMiss(f: Fall, strikes: number): void {
    this.sfx('wrong');
    this.game.vibrate(f.playerId, [140, 60, 140]);
    this.transient.set(f.playerId, V.missView(strikes, MAX_STRIKES));
    // On the final strike the ROBOH banner tells the story instead.
    if (strikes >= MAX_STRIKES) return;
    const now = this.clock.now();
    this.hud.shout.value = {
      id: ++this.seq,
      text: STR.shoutMiss,
      sub: STR.shoutMissSub(this.name(f.playerId), strikes, MAX_STRIKES),
      until: now + SHOUT_MS,
    };
  }

  private onTopped(info: ToppedInfo): void {
    const L = this.logic;
    this.sfx('win');
    celebrate();
    this.completedBest = Math.max(this.completedBest, info.height);
    writeRecord(Math.max(this.storedRecord, this.completedBest));
    for (const id of L.participants) this.transient.set(id, V.toppedView(L.stats.get(id)!, info.height));
    this.banner = {
      kind: 'topped',
      key: ++this.seq,
      title: STR.toppedTitle,
      sub: STR.toppedSub(info.height),
      next: info.lastRound ? null : STR.toppedNext(info.round + 1, L.rounds),
    };
  }

  private onCollapse(info: CollapseInfo): void {
    const L = this.logic;
    this.hud.shout.value = null;
    // The 'collapse' sound plays when the toppling floors hit the street (see impact()).
    this.game.vibrate(info.playerId, [300, 80, 300]);
    this.completedBest = Math.max(this.completedBest, info.height);
    writeRecord(Math.max(this.storedRecord, this.completedBest));
    const standings = rankStandings(this.statsList(), L.solo);
    const top = leaders(standings, (id) => this.name(id));
    const ctx: V.CollapseViewContext = {
      lastRound: info.lastRound,
      solo: L.solo,
      height: info.height,
      collapserName: this.name(info.playerId),
      winnerName: top.length === 1 ? top[0]! : null,
    };
    for (const id of L.participants) {
      const s = L.stats.get(id)!;
      this.transient.set(id, id === info.playerId ? V.collapserView(s, ctx) : V.survivorView(s, ctx));
    }
    this.banner = this.robohBanner(info, standings);
  }

  private robohBanner(info: CollapseInfo, standings: Standing[]): Banner {
    const L = this.logic;
    const parts = L.participants;
    const leadersIds = standings.filter((s) => s.rank === 1).map((s) => s.id);
    let winner: number | null = null;
    let highlight = '';
    let rest = STR.robohHeight(info.height);
    if (L.solo) {
      rest = rest.trimStart();
    } else if (info.lastRound) {
      if (leadersIds.length === 1) {
        winner = leadersIds[0]!;
        highlight = STR.robohWinner(this.name(winner));
      } else {
        highlight = STR.robohTie;
      }
    } else {
      const others = parts.filter((id) => id !== info.playerId);
      if (others.length === 1) {
        winner = others[0]!;
        highlight = STR.robohWinner(this.name(winner));
      } else {
        highlight = STR.robohOthers;
      }
      rest = STR.robohNext(info.round + 1, L.rounds);
    }
    return {
      kind: 'roboh',
      key: ++this.seq,
      collapser: this.card(info.playerId),
      winner: winner !== null ? this.card(winner) : null,
      who: info.reason === 'strikes' ? STR.robohStrikes(MAX_STRIKES) : STR.robohWho(info.floorNumber),
      highlight,
      rest,
    };
  }

  private buildResult(): GameResult {
    const L = this.logic;
    return buildResult(this.statsList(), {
      solo: L.solo,
      bestHeight: L.bestHeight,
      rounds: L.rounds,
      name: (id) => this.name(id),
      record: this.submitSolo(),
    });
  }

  /** Exactly one person played: store the tallest tower once (PRD 6.4). Null otherwise. */
  private submitSolo(): SoloRecord | null {
    const L = this.logic;
    if (this.record || L.order.length !== 1) return this.record;
    const r = submitRecord(GAME_ID, String(L.rounds), L.bestHeight);
    this.record = soloRecord(r, L.bestHeight);
    return this.record;
  }

  private onFinale(): void {
    const L = this.logic;
    this.result = this.buildResult();
    const standings = rankStandings(this.statsList(), L.solo);
    const title = this.result.title;
    const record = this.record;
    this.finalViews = new Map(standings.map((s) => [s.id, V.finalView(s, L.solo, title, record)]));
    const winners = standings.filter((s) => s.rank === 1);
    this.banner = {
      kind: 'finale',
      key: ++this.seq,
      title,
      sub: record
        ? STR.resultSoloSubtitle(standings[0]?.pas ?? 0, standings[0]?.bestStreak ?? 0)
        : (this.result.subtitle ?? ''),
      winner: winners.length === 1 ? this.card(winners[0]!.id) : null,
      record,
    };
    celebrate();
    this.sfx(record?.isNew ? 'super' : 'win');
  }

  /* ---------------------------------------------------------------- HUD + views */

  private statsList() {
    const L = this.logic;
    return L.participants.map((id) => L.stats.get(id)!);
  }

  private player(id: number): PlayerInfo | undefined {
    return this.game.player(id);
  }

  private name(id: number): string {
    return this.player(id)?.name ?? STR.unknownPlayer;
  }

  private card(id: number): PlayerCard {
    const p = this.player(id);
    return {
      id,
      name: p?.name ?? STR.unknownPlayer,
      fruit: p?.fruit ?? 'semangka',
      color: p?.color ?? '#C4C7CC',
    };
  }

  private refreshHud(): void {
    const L = this.logic;
    const phase = L.phase;
    const upcoming = L.upcoming();
    const showTurn = phase === 'aim' || phase === 'falling' || phase === 'settle' || phase === 'waiting';
    const prev = Math.max(this.recordBase, this.completedBest);
    const recordHint = prev >= MIN_RECORD ? STR.toRecord(prev - L.height - 1, L.height) : '';
    const zone = balanceZone(L.balance);
    const robohShown =
      (phase === 'collapse' || phase === 'finale' || phase === 'ended') && L.collapse !== null;
    const standings = robohShown ? rankStandings(this.statsList(), L.solo) : [];
    const leaderIds = standings.filter((s) => s.rank === 1).map((s) => s.id);
    const players: HudPlayer[] = L.participants.map((id) => {
      const s = L.stats.get(id)!;
      const connected = this.player(id)?.connected ?? false;
      let stat = STR.playerStat(s.floors, s.pas);
      let dim = id === upcoming ? 1 : 0.75;
      let face: Face = id === upcoming ? 'effort' : 'happy';
      if (robohShown && L.collapse) {
        const c = L.collapse;
        if (id === c.playerId) {
          stat = STR.statCollapsed(c.floorNumber);
          dim = 0.6;
          face = 'sad';
        } else {
          const winner = c.lastRound
            ? leaderIds.length === 1 && leaderIds[0] === id
            : L.participants.length === 2;
          stat = winner ? STR.statWinner(s.floors, s.pas) : STR.statSafe(s.floors, s.pas);
          dim = 1;
          face = winner ? 'wow' : 'happy';
        }
      }
      if (!connected) {
        stat = STR.offline;
        dim = 0.45;
      }
      return {
        ...this.card(id),
        stat,
        score: L.solo || robohShown ? null : s.score,
        active: showTurn && id === upcoming,
        dim,
        face,
      };
    });
    this.hud.model.value = {
      showTurn,
      floorNumber: L.floorIndex + 1,
      turn: showTurn && upcoming !== null ? this.card(upcoming) : null,
      recordHint,
      players,
      zone,
      balance: L.balance,
      record: this.recordFloors,
      recordSolo: this.soloNow,
      banner: this.banner,
    };
  }

  private viewFor(id: number): ControllerView {
    if (this.finalViews) return this.finalViews.get(id) ?? V.idleView();
    const t = this.transient.get(id);
    if (t) return t;
    const L = this.logic;
    switch (L.phase) {
      case 'intro': {
        const first = L.upcoming();
        return V.introView(L.round, L.rounds, first !== null ? this.name(first) : null);
      }
      case 'settle': {
        const next = L.upcoming();
        if (next === null) return V.idleView();
        if (next === id) return V.readyView(id);
        return V.watchView(next, this.name(next), L.height, balanceZone(L.balance));
      }
      case 'aim':
      case 'falling': {
        const cur = L.current;
        if (cur === null) return V.idleView();
        if (cur === id) {
          return V.turnView(L.floorIndex + 1, this.clock.toServer(L.deadline));
        }
        return V.watchView(cur, this.name(cur), L.height, balanceZone(L.balance));
      }
      default:
        return V.idleView();
    }
  }

  private syncViews(): void {
    if (!this.logicRef) return;
    for (const p of this.game.allPlayers) {
      if (!p.connected) continue;
      const view = this.viewFor(p.id);
      const json = JSON.stringify(view);
      if (this.sent.get(p.id) === json) continue;
      this.sent.set(p.id, json);
      this.game.setView(p.id, view);
    }
  }

  private sfx(name: Sfx): void {
    this.game.sfx(name);
  }
}
