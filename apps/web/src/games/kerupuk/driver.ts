/**
 * Glue between the Hoorah SDK, the pure rules, the Phaser scene, the DOM HUD and the phones:
 * owns the game clock (frozen while paused), turns logic events into sounds, floating words,
 * commentary and phone views.
 */
import { type ControllerToGame, type ControllerView, lookOfFruit, type PlayerInfo } from '@hoorah/protocol';
import type { GameResult, HoorahGame } from '@hoorah/sdk';
import type { Sfx } from '../../shared/audio';
import { celebrate } from '../../shared/confetti';
import { type RecordResult, readRecord, submitRecord } from '../common/records';
import { Commentator, type CommentEvent } from './commentary';
import { GO_SHOW_MS, type Hud, type Overlay, type PlateModel, type PopKind, type ResultRow } from './hud';
import { FEET_Y, laneLayout, PLATE_MAX_W, PopStack } from './layout';
import {
  BITES,
  COUNT_MS,
  GameClock,
  type KerupukEvent,
  KerupukLogic,
  type PlayerStats,
  type RoundEndInfo,
  soloScore,
  swingZone,
} from './logic';
import { type MirrorLaneSource, toMirror } from './mirror';
import { buildResult, buildSoloResult, rankStandings, recordKind, recordLine } from './results';
import type { LaneModel, SceneDriver } from './scene';
import { STR } from './strings';
import * as V from './views';

const TICK_MS = 100;
/** The round-end card waits a moment so everyone sees the last bite. */
const CARD_DELAY_MS = 1300;
const REACTION_GAP_MS = 1500;
/** Key for the solo records (PRD 6.4); the variant is the number of rounds. */
const GAME_ID = 'kerupuk';

export function parseRounds(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 ? Math.min(5, Math.floor(n)) : 3;
}

export class KerupukDriver implements SceneDriver {
  readonly clock: GameClock;
  onPause: (paused: boolean) => void = () => {};
  effects: {
    bite: (id: number, perfect: boolean, finished: boolean) => void;
    choke: (id: number) => void;
  } = { bite: () => {}, choke: () => {} };

  private logicRef: KerupukLogic | null = null;
  private models: LaneModel[] = [];
  private readonly sent = new Map<number, string>();
  /** One-off phone screens (choke, round result) that stay until replaced. */
  private readonly transient = new Map<number, ControllerView>();
  private finalViews: Map<number, ControllerView> | null = null;
  private readonly lastBite = new Map<number, 'perfect' | 'bite'>();
  private readonly comment = new Commentator();
  private readonly reactAt = new Map<number, number>();
  private readonly pops = new PopStack();
  private result: GameResult | null = null;
  private overlay: Overlay = { kind: 'none' };
  private pendingOverlay: { at: number; overlay: Overlay } | null = null;
  private connected = new Set<number>();
  private firstBite = true;
  private lastCount = 0;
  private goShownUntil = 0;
  private seq = 0;
  private timer = 0;
  private ended = false;
  private readonly origin = { x: 0, y: 0 };
  /** Solo: the stored record when the game started (null before the first solo game). */
  private recordBefore: number | null = null;
  /** Solo: the record after this game, set once at the finale. */
  private record: RecordResult | null = null;
  /** Solo: score and PAS count at the start of the current round, for the round card. */
  private roundBase = 0;
  private perfectBase = 0;

  constructor(
    private readonly game: HoorahGame,
    private readonly hud: Hud,
  ) {
    this.clock = new GameClock(() => game.now());
  }

  get logic(): KerupukLogic {
    if (!this.logicRef) throw new Error('Makan Kerupuk has not started');
    return this.logicRef;
  }

  /* ---------------------------------------------------------------- SceneDriver */

  now(): number {
    return this.clock.now();
  }

  lanes(): readonly LaneModel[] {
    return this.models;
  }

  /* ---------------------------------------------------------------- lifecycle */

  start(): void {
    const rounds = parseRounds(this.game.settings.rounds);
    this.recordBefore = readRecord(GAME_ID, String(rounds));
    this.connected = new Set(this.game.allPlayers.filter((p) => p.connected).map((p) => p.id));
    this.logicRef = new KerupukLogic({ rounds, roster: this.roster(), now: this.clock.now() });
    this.logicRef.setFarPlay(this.game.mirrored);
    this.game.on('players', () => this.onPlayers());
    // Long-distance play: phones at a far-away screen press late, so judging waits for them.
    this.game.on('mirrors', (on) => {
      this.logicRef?.setFarPlay(on);
      if (on) this.publishMirror();
    });
    this.game.on('action', (from, a) => this.onAction(from, a));
    this.game.on('pause', (p) => this.setPaused(p));
    if (this.game.paused) this.setPaused(true);
    this.flush();
    this.refresh();
    this.timer = window.setInterval(() => this.step(), TICK_MS);
  }

  /** Stage px of world (0, 0), from the scene. */
  setOrigin(x: number, y: number): void {
    this.origin.x = x;
    this.origin.y = y;
    if (this.logicRef) this.refreshHud();
  }

  private step(): void {
    const L = this.logicRef;
    if (!L || this.ended || this.clock.paused) return;
    const now = this.clock.now();
    L.tick(now);
    this.flush();
    if (this.pendingOverlay && now >= this.pendingOverlay.at) {
      this.overlay = this.pendingOverlay.overlay;
      this.pendingOverlay = null;
    }
    if (L.phase === 'intro') {
      const left = L.goAt - now;
      const secs = Math.ceil(left / 1000);
      if (left <= COUNT_MS && secs >= 1 && secs !== this.lastCount) {
        this.lastCount = secs;
        this.sfx('count');
      }
    }
    if (L.phase === 'play' && this.comment.idle(now)) this.hud.line.value = this.comment.current;
    this.refreshHud();
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
    this.refresh();
  }

  private onAction(from: number, a: ControllerToGame): void {
    if (!this.logicRef || this.ended || this.clock.paused || a.k !== 'action') return;
    switch (a.id) {
      case 'drop': {
        const at = typeof a.at === 'number' && Number.isFinite(a.at) ? this.clock.toGame(a.at) : Number.NaN;
        this.logicRef.bite(from, at, this.clock.now());
        this.flush();
        // Even an ignored press gets a fresh button (its lane's press counter changed).
        this.syncViews();
        return;
      }
      case 'rematch':
      case 'cheer':
        this.react(from);
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
    // Swing starts are sent in server time, which shifted while paused.
    if (!paused && this.logicRef) this.syncViews();
    // No ticks run while paused, so tell a far-away screen right here.
    this.publishMirror();
  }

  private react(from: number): void {
    const now = this.clock.now();
    if (now - (this.reactAt.get(from) ?? Number.NEGATIVE_INFINITY) < REACTION_GAP_MS) return;
    if (!this.game.player(from)) return;
    this.reactAt.set(from, now);
    this.sfx('cheer');
    const [bold, text] = this.logic.solo ? STR.cAgain(this.name(from)) : STR.cRematch(this.name(from));
    this.hud.line.value = { key: ++this.seq + 10_000, bold, text };
  }

  /* ---------------------------------------------------------------- events */

  private flush(): void {
    const L = this.logicRef;
    if (!L) return;
    const events = L.drain();
    if (!events.length) return;
    for (const e of events) this.handle(e);
    this.refresh();
  }

  private say(e: CommentEvent): void {
    if (this.comment.event(e, this.clock.now())) this.hud.line.value = this.comment.current;
  }

  private handle(e: KerupukEvent): void {
    const L = this.logic;
    switch (e.type) {
      case 'intro': {
        this.transient.clear();
        this.lastBite.clear();
        this.comment.clear();
        this.hud.line.value = null;
        this.firstBite = true;
        this.lastCount = 0;
        this.overlay = { kind: 'none' };
        this.pendingOverlay = null;
        this.roundBase = this.soloTotal();
        this.perfectBase = L.solo ? (L.stats.get(L.order[0]!)?.perfect ?? 0) : 0;
        this.sfx('whistle');
        return;
      }
      case 'go':
        this.goShownUntil = this.clock.now() + GO_SHOW_MS;
        this.sfx('go');
        for (const id of L.participants) this.game.vibrate(id, 60);
        this.say({ type: 'go' });
        return;
      case 'bite': {
        this.lastBite.set(e.id, e.perfect ? 'perfect' : 'bite');
        const finished = e.bites >= BITES;
        this.sfx('chop');
        if (e.perfect) this.sfx('perfect');
        this.game.vibrate(e.id, e.perfect ? [30, 30, 50] : 35);
        this.effects.bite(e.id, e.perfect, finished);
        this.pop(
          e.id,
          finished ? STR.popFinish : e.perfect ? STR.popPerfect : STR.popBite,
          finished ? 'finish' : e.perfect ? 'perfect' : 'bite',
        );
        this.say({
          type: 'bite',
          name: this.name(e.id),
          bites: e.bites,
          perfect: e.perfect,
          firstOfRound: this.firstBite,
        });
        this.firstBite = false;
        return;
      }
      case 'choke':
        this.sfx('wrong');
        this.game.vibrate(e.id, [120, 60, 120]);
        this.effects.choke(e.id);
        this.pop(e.id, STR.popChoke, 'choke');
        this.transient.set(e.id, V.chokeView(L.lane(e.id)?.bites ?? 0));
        this.say({ type: 'choke', name: this.name(e.id) });
        return;
      case 'recover':
        this.transient.delete(e.id);
        this.game.vibrate(e.id, 25);
        return;
      case 'warn':
        this.sfx('tension');
        this.say({ type: 'warn' });
        return;
      case 'roundEnd':
        this.onRoundEnd(e.info);
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

  private onRoundEnd(info: RoundEndInfo): void {
    const L = this.logic;
    const winnerId = info.finisher ?? (info.placements[0]?.bites ? info.placements[0].id : null);
    if (info.reason === 'finish') {
      this.sfx('cheer');
      this.say({ type: 'finish', name: this.name(info.finisher!), solo: L.solo });
    } else {
      this.sfx('whistle');
      this.say({ type: 'time' });
    }
    if (winnerId !== null) this.game.vibrate(winnerId, [80, 40, 80, 40, 160]);
    const winnerName = winnerId !== null ? this.name(winnerId) : null;
    // The previous round's card must not flash up while this one waits.
    this.overlay = { kind: 'none' };
    if (L.solo) {
      this.onSoloRoundEnd(info);
      return;
    }
    for (const p of info.placements) {
      const s = L.stats.get(p.id)!;
      this.transient.set(p.id, V.roundEndView(p, info, s, winnerName));
    }
    const rows: ResultRow[] = info.placements.slice(0, 4).map((p) => ({
      ...this.card(p.id),
      rank: p.rank,
      detail: STR.placeBites(p.bites, BITES),
      points: STR.placePoints(p.points),
    }));
    const title =
      info.reason === 'finish' && info.finisher !== null
        ? STR.roundWinTitle(this.name(info.finisher))
        : STR.roundTimeTitle;
    const sub =
      info.reason === 'finish' && info.time !== null
        ? STR.roundWinSub(info.time)
        : STR.roundTimeSub(winnerName);
    this.pendingOverlay = {
      at: this.clock.now() + CARD_DELAY_MS,
      overlay: {
        kind: 'roundEnd',
        key: ++this.seq,
        title,
        sub,
        next: info.lastRound ? null : STR.roundNext(info.round + 1, L.rounds),
        rows,
      },
    };
  }

  /** Solo round card: points won this round instead of a ranking. */
  private onSoloRoundEnd(info: RoundEndInfo): void {
    const L = this.logic;
    const p = info.placements[0];
    if (!p) return;
    const s = L.stats.get(p.id)!;
    const gain = this.soloTotal() - this.roundBase;
    this.transient.set(p.id, V.soloRoundEndView(p, info, s, gain));
    const finished = info.reason === 'finish' && info.finisher !== null;
    this.pendingOverlay = {
      at: this.clock.now() + CARD_DELAY_MS,
      overlay: {
        kind: 'roundEnd',
        key: ++this.seq,
        title: finished ? STR.roundWinTitle(this.name(p.id)) : STR.roundTimeTitle,
        sub:
          finished && info.time !== null
            ? STR.roundWinSub(info.time)
            : STR.roundTimeSoloSub(this.name(p.id), p.bites),
        next: info.lastRound ? null : STR.roundNext(info.round + 1, L.rounds),
        rows: [
          {
            ...this.card(p.id),
            rank: 0,
            detail: STR.soloRoundDetail(p.bites, BITES, s.perfect - this.perfectBase),
            points: STR.soloGain(gain),
          },
        ],
      },
    };
  }

  /** Solo: the lone player's score so far (0 in multiplayer). */
  private soloTotal(): number {
    const L = this.logic;
    const id = L.solo ? L.order[0] : undefined;
    const s = id !== undefined ? L.stats.get(id) : undefined;
    return s ? soloScore(s) : 0;
  }

  private buildResult(): GameResult {
    const L = this.logic;
    const me = L.solo ? L.stats.get(L.order[0]!) : undefined;
    if (me) return buildSoloResult(me, this.soloRecord(me));
    return buildResult(this.statsList(), L.rounds, (id) => this.name(id));
  }

  /** Stores the lone player's score once (PRD 6.4) and returns how it compares. */
  private soloRecord(me: PlayerStats): RecordResult {
    if (!this.record) this.record = submitRecord(GAME_ID, String(this.logic.rounds), soloScore(me));
    return this.record;
  }

  private onFinale(): void {
    const L = this.logic;
    const me = L.solo ? L.stats.get(L.order[0]!) : undefined;
    if (me) {
      this.onSoloFinale(me);
      return;
    }
    this.result = this.buildResult();
    const standings = rankStandings(this.statsList());
    this.finalViews = new Map(standings.map((s) => [s.id, V.finalView(s, this.result!.title)]));
    this.pendingOverlay = null;
    this.overlay = {
      kind: 'finale',
      key: ++this.seq,
      title: this.result.title,
      sub: STR.finaleSub,
      rows: standings.slice(0, 5).map((s) => ({
        ...this.card(s.id),
        rank: s.rank,
        detail: STR.rankLabel(s.bites, s.wins),
        points: STR.points(s.score),
      })),
    };
    celebrate();
    this.sfx('win');
  }

  private onSoloFinale(s: PlayerStats): void {
    this.result = this.buildResult();
    const score = soloScore(s);
    const record = this.soloRecord(s);
    const text = recordLine(record, score);
    const isNew = recordKind(record, score) === 'new';
    this.finalViews = new Map([[s.id, V.soloFinalView(s, isNew, text)]]);
    this.pendingOverlay = null;
    this.overlay = {
      kind: 'finale',
      key: ++this.seq,
      title: this.result.title,
      sub: text,
      record: { text, isNew },
      rows: [
        {
          ...this.card(s.id),
          rank: 0,
          detail: STR.soloDetail(s.bites, s.perfect),
          points: STR.soloLabel(score),
        },
      ],
    };
    celebrate();
    this.sfx(isNew ? 'super' : 'win');
  }

  private pop(id: number, text: string, kind: PopKind): void {
    const L = this.logic;
    const i = L.lanes.findIndex((l) => l.id === id);
    if (i < 0) return;
    const at = this.pops.place(id, i, L.lanes.length, this.clock.now(), this.origin);
    this.hud.pop(at.x, at.y, text, kind);
  }

  /* ---------------------------------------------------------------- HUD + views */

  private statsList() {
    const L = this.logic;
    return L.order.map((id) => L.stats.get(id)!).filter(Boolean);
  }

  private player(id: number): PlayerInfo | undefined {
    return this.game.player(id);
  }

  private name(id: number): string {
    return this.player(id)?.name ?? STR.unknownPlayer;
  }

  private card(id: number) {
    const p = this.player(id);
    return {
      id,
      name: p?.name ?? STR.unknownPlayer,
      look: p?.look ?? lookOfFruit('semangka'),
      color: p?.color ?? '#C4C7CC',
    };
  }

  /** Lane models for the scene, HUD and phones after anything changed. */
  private refresh(): void {
    this.syncModels();
    this.refreshHud();
    this.syncViews();
  }

  private syncModels(): void {
    const L = this.logic;
    const end = L.phase === 'roundEnd' || L.phase === 'finale' || L.phase === 'ended';
    const places = end && L.lastRoundEnd ? L.lastRoundEnd.placements : [];
    this.models = L.lanes.map((l) => {
      const c = this.card(l.id);
      const p = places.find((x) => x.id === l.id);
      const mood: LaneModel['mood'] = !p
        ? 'play'
        : L.solo
          ? l.finishedAt !== null
            ? 'win'
            : p.bites > 0
              ? 'ok'
              : 'sad'
          : p.rank === 1 && p.bites > 0
            ? 'win'
            : p.points > 0
              ? 'ok'
              : 'sad';
      return {
        id: l.id,
        look: c.look,
        color: c.color,
        connected: this.player(l.id)?.connected ?? false,
        bites: l.bites,
        swing: l.swing,
        finished: l.finishedAt !== null,
        chokeUntil: l.choking ? l.chokeUntil : 0,
        mood,
      };
    });
  }

  private refreshHud(): void {
    const L = this.logic;
    const now = this.clock.now();
    const lay = laneLayout(L.lanes.length);
    const plateW = Math.min(PLATE_MAX_W, lay.spacing - 12);
    const end = L.phase === 'roundEnd' || L.phase === 'finale' || L.phase === 'ended';
    const places = end && L.lastRoundEnd ? L.lastRoundEnd.placements : [];
    const solo = L.solo;
    const plates: PlateModel[] = L.lanes.map((l, i) => {
      const s = L.stats.get(l.id)!;
      const p = places.find((x) => x.id === l.id);
      const score = solo ? soloScore(s) : s.score;
      return {
        ...this.card(l.id),
        bites: l.bites,
        score,
        connected: this.player(l.id)?.connected ?? false,
        choking: l.choking && now < l.chokeUntil,
        finished: l.finishedAt !== null,
        gain: p ? (solo ? score - this.roundBase : p.points) : null,
        x: this.origin.x + lay.xs[i]!,
      };
    });
    let overlay = this.overlay;
    if (L.phase === 'intro') {
      const left = L.goAt - now;
      overlay = {
        kind: 'intro',
        key: L.round,
        title: STR.introTitle(L.round, L.rounds),
        sub: STR.introSub(L.round, L.rounds, solo),
        hint: STR.introHint,
        count: left <= COUNT_MS ? String(Math.max(1, Math.ceil(left / 1000))) : null,
        record: solo && this.recordBefore !== null ? STR.recordBefore(this.recordBefore) : null,
      };
      if (!L.lanes.length) overlay = { kind: 'waiting' };
    } else if (L.phase === 'play') {
      overlay =
        now < this.goShownUntil
          ? { kind: 'intro', key: L.round, title: '', sub: '', hint: '', count: STR.countGo }
          : L.lanes.length
            ? { kind: 'none' }
            : { kind: 'waiting' };
    }
    const playing = L.phase === 'play' || L.phase === 'intro';
    const secs = playing ? Math.ceil(L.remainingMs(now) / 1000) : null;
    this.hud.model.value = {
      chip: STR.roundChip(L.round, L.rounds),
      secs,
      urgent: L.phase === 'play' && secs !== null && secs <= 10,
      plates,
      plateW,
      plateY: this.origin.y + FEET_Y + 14,
      overlay,
    };
    this.publishMirror();
  }

  /**
   * Long-distance play: the stage for a far-away main screen. It holds no clock, only the
   * schedule and swings in server time, so it changes (and is sent) only when something happens.
   */
  private publishMirror(): void {
    const L = this.logicRef;
    if (!L || !this.game.mirrored) return;
    const plates = this.hud.model.value.plates;
    const lanes: MirrorLaneSource[] = [];
    for (const m of this.models) {
      const s = L.stats.get(m.id);
      const plate = plates.find((p) => p.id === m.id);
      if (!s || !plate) continue;
      lanes.push({
        id: m.id,
        name: plate.name,
        look: m.look,
        color: m.color,
        connected: m.connected,
        bites: m.bites,
        swing: m.swing,
        chokeUntil: m.chokeUntil,
        finished: m.finished,
        mood: m.mood,
        score: plate.score,
        gain: plate.gain,
        marks: { bites: s.bites, perfect: s.perfect, chokes: s.chokes },
      });
    }
    this.game.publish(
      toMirror({
        phase: L.phase,
        round: L.round,
        rounds: L.rounds,
        now: this.clock.now(),
        goAt: L.goAt,
        endsAt: L.roundEndsAt,
        held: this.clock.paused,
        toServer: (t) => this.clock.toServer(t),
        lanes,
        overlay: this.hud.model.value.overlay,
        line: this.hud.line.value,
      }),
    );
  }

  private viewFor(id: number): ControllerView {
    if (this.finalViews) return this.finalViews.get(id) ?? V.idleView();
    const t = this.transient.get(id);
    if (t) return t;
    const L = this.logic;
    const lane = L.lane(id);
    if (!lane) return V.watchView();
    switch (L.phase) {
      case 'intro':
        return V.introView(id, L.round, L.rounds);
      case 'play': {
        // Shifting the start by a whole period keeps the same motion but gives the phone a new
        // button identity, so every handled press re-enables GIGIT.
        const start = this.clock.toServer(lane.swing.start) - (lane.presses % 2) * lane.swing.period;
        return V.biteView({
          round: L.round,
          rounds: L.rounds,
          bites: lane.bites,
          last: this.lastBite.get(id) ?? null,
          start,
          period: lane.swing.period,
          zone: swingZone(lane.bites),
        });
      }
      default:
        return V.watchView();
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
