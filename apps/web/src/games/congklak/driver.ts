/**
 * Glue between the Hoorah SDK, the pure rules and the main-screen view: owns the game clock
 * (frozen while paused), replays each move seed by seed on the board, and turns logic events
 * into sounds, toasts, banners and phone views.
 */
import type { ControllerToGame, ControllerView, PlayerInfo } from '@hoorah/protocol';
import type { GameResult, HoorahGame } from '@hoorah/sdk';
import { pitXY } from '../../shared/art/congklak';
import type { Sfx } from '../../shared/audio';
import { celebrate } from '../../shared/confetti';
import { cpuSkill, isCpu, reportSoloResult, soloOpponents, thinkMs } from '../common/cpu';
import { chooseHole } from './brain';
import {
  type ActiveMove,
  applyStep,
  type CongklakEvent,
  CongklakMatch,
  GameClock,
  holeNumber,
  type RoundResult,
  type Side,
  type Step,
  stepTimes,
  storeOf,
  TURN_MS,
  validHoles,
} from './logic';
import { buildResult, headline, sideLabel } from './results';
import { STR } from './strings';
import type { PanelModel, PlayerCard, TvStore } from './tv';
import * as V from './views';

const FALLBACK_TICK_MS = 250;
const REACTION_GAP_MS = 700;
const BUBBLE_MS = 2600;
const TOAST_MS = 1700;
/** Shortest gap between two seed-drop clicks, so long relays do not turn into noise. */
const DROP_SFX_GAP_MS = 70;
/** Skill of the brain that plays for a side whose phones all dropped (multiplayer). */
const TAKEOVER_SKILL = 0.6;
/** Pause before such a side moves: 1.5 to 2.8 s, like someone thinking. */
const takeoverDelay = () => 1500 + Math.round(Math.random() * 1300);

export function parseRounds(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 ? Math.min(5, Math.floor(n)) : 1;
}

interface Anim {
  move: ActiveMove;
  at: number[];
  applied: number;
  board: number[];
  hand: number;
}

export class CongklakDriver {
  readonly clock: GameClock;
  readonly match: CongklakMatch;
  private readonly sent = new Map<number, string>();
  private readonly reactAt = new Map<number, number>();
  private connected = new Set<number>();
  private anim: Anim | null = null;
  /** What the board shows (lags the logic while a move is replayed). */
  private counts: number[];
  private roundViews: Map<number, ControllerView> | null = null;
  private finalViews: Map<number, ControllerView> | null = null;
  private result: GameResult | null = null;
  private seq = 0;
  private lastCount = 0;
  private lastDropSfx = 0;
  private ended = false;
  private raf = 0;
  private interval = 0;
  /** Computer opponents (solo only) and how sharp they play this time. */
  private readonly cpus: PlayerInfo[];
  private readonly skill: number;
  /** The computer's planned pick for the current turn. */
  private cpuPlan: { key: string; at: number } | null = null;
  private reported = false;

  constructor(
    private readonly game: HoorahGame,
    private readonly tv: TvStore,
  ) {
    this.clock = new GameClock(() => game.now());
    this.cpus = soloOpponents(game.allPlayers, 1);
    this.skill = cpuSkill(game.gameId);
    this.connected = this.connectedIds();
    this.match = new CongklakMatch({
      rounds: parseRounds(game.settings.rounds),
      roster: this.roster(),
      now: this.clock.now(),
      autoChoose: (board, side) => chooseHole(board, side, TAKEOVER_SKILL),
      autoDelay: takeoverDelay,
    });
    this.counts = this.match.board.slice();
  }

  start(): void {
    this.game.on('players', () => this.onPlayers());
    this.game.on('action', (from, a) => this.onAction(from, a));
    this.game.on('pause', (p) => this.setPaused(p));
    if (this.game.paused) this.setPaused(true);
    this.flush();
    this.pushBoard();
    this.refreshHud();
    this.syncViews();
    const loop = () => {
      this.step();
      if (!this.ended) this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    this.interval = window.setInterval(() => this.step(), FALLBACK_TICK_MS);
  }

  /* ---------------------------------------------------------------- loop */

  private step(): void {
    if (this.ended) return;
    const now = this.clock.now();
    this.match.tick(now);
    this.flush();
    this.cpuTurn(now);
    this.animate(now);
    this.expire(now);
    const M = this.match;
    if (M.phase === 'turn' && M.current !== null) {
      const rem = Math.max(0, M.deadline - now);
      const secs = Math.ceil(rem / 1000);
      this.tv.setTimer(M.turnSide, rem / TURN_MS, secs);
      if (secs >= 1 && secs <= 3 && secs !== this.lastCount) {
        this.lastCount = secs;
        this.sfx('count');
      }
    } else {
      this.tv.setTimer(null, 0, 0);
    }
  }

  /** A computer opponent on turn thinks for a moment, then picks like a player would. */
  private cpuTurn(now: number): void {
    const M = this.match;
    const id = M.current;
    if (M.phase !== 'turn' || id === null || !isCpu(id) || this.clock.paused) {
      this.cpuPlan = null;
      return;
    }
    const key = `${M.round}:${M.deadline}`;
    if (this.cpuPlan?.key !== key) {
      // An extra turn comes a little quicker: the plan is often obvious.
      const ms = M.extra ? thinkMs(this.skill, 700, 1600) : thinkMs(this.skill, 900, 2400);
      this.cpuPlan = { key, at: now + ms };
      return;
    }
    if (now < this.cpuPlan.at) return;
    this.cpuPlan = null;
    const pos = chooseHole(M.board, M.turnSide, this.skill);
    if (M.pick(id, holeNumber(pos), now)) this.flush();
  }

  /** Replays the steps of the current move that are due by `now`. */
  private animate(now: number): void {
    const a = this.anim;
    if (!a) return;
    const steps = a.move.trace.steps;
    const elapsed = now - a.move.startAt;
    const side = a.move.trace.side;
    let changed = false;
    while (a.applied < steps.length && a.at[a.applied]! <= elapsed) {
      const s = steps[a.applied]!;
      a.hand = applyStep(a.board, a.hand, s, side);
      a.applied++;
      changed = true;
      this.onStep(s, side, a.applied === 1, now);
    }
    if (!changed) return;
    this.counts = a.board.slice();
    if (a.applied >= steps.length) {
      this.onMoveDone(a.move, now);
      this.anim = null;
    }
    this.pushBoard();
    this.refreshHud();
  }

  private onStep(s: Step, side: Side, first: boolean, now: number): void {
    switch (s.t) {
      case 'take':
        if (!first) this.sfx('pull');
        return;
      case 'drop':
        if (now - this.lastDropSfx >= DROP_SFX_GAP_MS) {
          this.lastDropSfx = now;
          this.sfx('tick');
        }
        return;
      case 'capture': {
        this.sfx('super');
        this.flash([s.pos, s.opp, storeOf(side)]);
        const { x } = pitXY(s.pos);
        this.toast(STR.toastCapture(s.n), 'capture', x, 200, now);
        const mover = this.anim?.move.playerId;
        if (mover !== null && mover !== undefined && !isCpu(mover)) this.game.vibrate(mover, [40, 30, 120]);
        return;
      }
    }
  }

  private onMoveDone(move: ActiveMove, now: number): void {
    const t = move.trace;
    if (t.outcome === 'store') {
      this.sfx('correct');
      const st = storeOf(t.side);
      this.flash([st]);
      const { x } = pitXY(st);
      this.toast(STR.toastExtra, 'extra', x < 590 ? x + 150 : x - 150, 200, now);
    } else if (t.outcome === 'guard') {
      this.toast(STR.toastGuard, 'info', 590, 200, now);
    }
  }

  private expire(now: number): void {
    const toasts = this.tv.toasts.value;
    if (toasts.some((t) => t.until <= now)) this.tv.toasts.value = toasts.filter((t) => t.until > now);
    for (const b of this.tv.bubbles) {
      if (b.value.some((x) => x.until <= now)) b.value = b.value.filter((x) => x.until > now);
    }
  }

  private toast(text: string, kind: 'extra' | 'capture' | 'info', x: number, y: number, now: number): void {
    this.tv.toasts.value = [
      ...this.tv.toasts.value,
      { id: ++this.seq, text, kind, x, y, until: now + TOAST_MS },
    ];
  }

  private flash(pos: number[]): void {
    this.tv.board.value = { ...this.tv.board.value, flash: pos, flashKey: ++this.seq };
  }

  /* ---------------------------------------------------------------- SDK input */

  private roster() {
    return [...this.game.allPlayers, ...this.cpus].map((p) => ({ id: p.id, connected: p.connected }));
  }

  private connectedIds(): Set<number> {
    return new Set(
      this.roster()
        .filter((p) => p.connected)
        .map((p) => p.id),
    );
  }

  private player(id: number): PlayerInfo | undefined {
    return this.game.player(id) ?? this.cpus.find((p) => p.id === id);
  }

  private onPlayers(): void {
    if (this.ended) return;
    const now = this.connectedIds();
    for (const id of now) if (!this.connected.has(id)) this.sent.delete(id);
    this.connected = now;
    this.match.setRoster(this.roster(), this.clock.now());
    this.flush();
    this.refreshHud();
    this.syncViews();
  }

  private onAction(from: number, a: ControllerToGame): void {
    if (this.ended || a.k !== 'action') return;
    switch (a.id) {
      case 'answer':
      case 'pick': {
        if (this.clock.paused) return;
        const n = Number(a.value);
        if (!this.match.pick(from, n, this.clock.now())) {
          this.sent.delete(from);
          this.syncViews();
          return;
        }
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
    this.tv.paused.value = paused;
    // Deadlines go to the phones in server time, which moved on while paused.
    if (!paused) this.syncViews();
  }

  private react(from: number, kind: 'cheer' | 'boo' | 'rematch'): void {
    const now = this.clock.now();
    if (now - (this.reactAt.get(from) ?? Number.NEGATIVE_INFINITY) < REACTION_GAP_MS) return;
    const p = this.player(from);
    const side = this.match.sideOfPlayer(from);
    if (!p || side === null) return;
    this.reactAt.set(from, now);
    this.sfx(kind === 'boo' ? 'boo' : kind === 'cheer' ? 'cheer' : 'clap');
    const text = kind === 'cheer' ? STR.reactCheer : kind === 'boo' ? STR.reactBoo : STR.reactRematch;
    const list = this.tv.bubbles[side];
    list.value = [
      ...list.value.slice(-2),
      { id: ++this.seq, who: p.name, text, tone: kind, until: now + BUBBLE_MS },
    ];
  }

  /* ---------------------------------------------------------------- events */

  private flush(): void {
    const events = this.match.drain();
    if (!events.length) return;
    for (const e of events) this.handle(e);
    this.pushBoard();
    this.refreshHud();
    this.syncViews();
  }

  private handle(e: CongklakEvent): void {
    const M = this.match;
    switch (e.type) {
      case 'intro':
        this.roundViews = null;
        this.anim = null;
        this.counts = M.board.slice();
        this.tv.toasts.value = [];
        this.sfx('reveal');
        return;
      case 'turn':
        this.lastCount = 0;
        if (e.playerId !== null && !isCpu(e.playerId)) this.game.vibrate(e.playerId, [70, 40, 70]);
        if (M.round >= 1 && !e.extra && this.isFirstTurn()) this.sfx('go');
        return;
      case 'move': {
        const at = stepTimes(e.trace.steps).at;
        // A move that starts before the previous replay finished (should not happen) snaps it.
        this.counts = e.trace.before.slice();
        this.anim = { move: { ...e }, at, applied: 0, board: e.trace.before.slice(), hand: 0 };
        this.sfx('select');
        this.flash([e.trace.pit]);
        if (e.auto && e.playerId !== null) {
          const { x, y } = pitXY(e.trace.pit);
          this.toast(STR.toastTimeout, 'info', x, e.trace.side === 0 ? y + 70 : y - 70, e.startAt);
        }
        return;
      }
      case 'roundEnd':
        this.onRoundEnd(e.result, e.last);
        return;
      case 'end':
        this.ended = true;
        cancelAnimationFrame(this.raf);
        window.clearInterval(this.interval);
        this.game.end(this.withCpus(this.result ?? buildResult(M, (id) => this.name(id))));
        return;
    }
  }

  private turnsThisRound = 0;
  private lastRoundSeen = 0;

  private isFirstTurn(): boolean {
    if (this.lastRoundSeen !== this.match.round) {
      this.lastRoundSeen = this.match.round;
      this.turnsThisRound = 0;
    }
    return this.turnsThisRound++ === 0;
  }

  private onRoundEnd(r: RoundResult, last: boolean): void {
    const M = this.match;
    const now = this.clock.now();
    this.anim = null;
    this.counts = M.board.slice();
    if (r.swept[0] + r.swept[1] > 0) {
      this.toast(STR.toastSweep(r.swept[0], r.swept[1]), 'info', 590, 200, now);
      this.flash([7, 15]);
    }
    const name = (id: number) => this.name(id);
    const outcomeFor = (side: Side, winner: Side | null): 'win' | 'lose' | 'tie' =>
      winner === null ? 'tie' : winner === side ? 'win' : 'lose';
    if (last) {
      this.result = buildResult(M, name);
      const totals = M.totals;
      const lead = M.leader;
      this.reportSolo(lead);
      this.finalViews = new Map();
      for (const p of this.game.allPlayers) {
        const side = M.sideOfPlayer(p.id);
        if (side === null) continue;
        const s = M.stats.get(p.id);
        this.finalViews.set(
          p.id,
          V.finalView(outcomeFor(side, lead), totals[side], totals[side === 0 ? 1 : 0], s ?? null),
        );
      }
      this.sfx('win');
      celebrate();
    } else {
      this.roundViews = new Map();
      for (const p of this.game.allPlayers) {
        const side = M.sideOfPlayer(p.id);
        if (side === null) continue;
        this.roundViews.set(
          p.id,
          V.roundEndView(r.round, outcomeFor(side, r.winner), r.stores[side], r.stores[side === 0 ? 1 : 0]),
        );
      }
      this.sfx('whistle');
    }
  }

  /** Solo game over: nudges the computer's skill for next time (once). */
  private reportSolo(lead: Side | null): void {
    if (this.reported || this.cpus.length === 0) return;
    const human = this.game.allPlayers[0];
    const side = human ? this.match.sideOfPlayer(human.id) : null;
    if (side === null) return;
    this.reported = true;
    reportSoloResult(this.game.gameId, lead === null ? 'draw' : lead === side ? 'win' : 'lose');
  }

  /** The results page needs the computer players' names and fruits. */
  private withCpus(result: GameResult): GameResult {
    return this.cpus.length ? { ...result, cpuPlayers: this.cpus } : result;
  }

  /* ---------------------------------------------------------------- HUD + views */

  private name(id: number): string {
    return this.player(id)?.name ?? STR.unknownPlayer;
  }

  private label(side: Side): string {
    return sideLabel(this.match, side, (id) => this.name(id));
  }

  private card(id: number): PlayerCard {
    const p = this.player(id);
    return {
      id,
      name: p?.name ?? STR.unknownPlayer,
      fruit: p?.fruit ?? 'semangka',
      color: p?.color ?? '#C4C7CC',
      connected: p?.connected ?? false,
    };
  }

  private pushBoard(): void {
    const M = this.match;
    const a = this.anim;
    let hand = null;
    if (a && a.applied < a.move.trace.steps.length) {
      const next = a.move.trace.steps[a.applied]!;
      const prevAt = a.applied > 0 ? a.at[a.applied - 1]! : 0;
      hand = { pos: next.pos, n: a.hand, ms: a.at[a.applied]! - prevAt };
    }
    const activeSide = M.phase === 'turn' ? M.turnSide : a ? a.move.trace.side : null;
    this.tv.board.value = { ...this.tv.board.value, counts: this.counts.slice(), hand, activeSide };
  }

  /** Store totals of finished rounds plus what the board shows now. */
  private shownTotals(): [number, number] {
    const M = this.match;
    const t: [number, number] = [0, 0];
    for (const r of M.results) {
      t[0] += r.stores[0];
      t[1] += r.stores[1];
    }
    if (M.results.length < M.round) {
      t[0] += this.counts[7]!;
      t[1] += this.counts[15]!;
    }
    return t;
  }

  private refreshHud(): void {
    const M = this.match;
    const totals = this.shownTotals();
    const lead: Side | null = totals[0] === totals[1] ? null : totals[0] > totals[1] ? 0 : 1;
    const moving = this.anim?.move ?? (M.phase === 'sowing' ? M.move : null);
    const panel = (side: Side): PanelModel => {
      const members = M.members[side].map((id) => this.card(id));
      const turn = M.phase === 'turn' && M.turnSide === side;
      const sowing = moving !== null && moving.trace.side === side;
      const mover = turn ? M.current : sowing ? moving.playerId : null;
      const who = M.teamMode && mover !== null ? `${this.name(mover)} · ` : '';
      let status: string = STR.statusWaiting;
      if (turn)
        status = M.current === null ? STR.statusAuto : M.extra ? STR.statusPickingExtra : STR.statusPicking;
      else if (sowing) status = STR.statusSowing;
      if (!members.some((m) => m.connected)) status = STR.statusOffline;
      return {
        side,
        label: this.label(side),
        members,
        mover,
        store: this.counts[storeOf(side)]!,
        total: M.rounds > 1 && M.round > 1 ? totals[side] : null,
        status: (turn || sowing) && who ? `${who}${status}` : status,
        active: turn || sowing,
        lead: lead === side,
      };
    };
    const labels: [string, string] = [this.label(0), this.label(1)];
    let banner = this.tv.hud.value?.banner ?? null;
    if (M.phase === 'intro') {
      if (banner?.kind !== 'intro' || banner.title !== STR.introTitle(M.round, M.rounds)) {
        banner = {
          kind: 'intro',
          key: ++this.seq,
          title: STR.introTitle(M.round, M.rounds),
          sub: STR.introFirst(labels[M.turnSide]),
          hint: STR.introHint,
          side: M.turnSide,
        };
      }
    } else if (M.phase === 'roundEnd' || M.phase === 'final' || M.phase === 'ended') {
      const r = M.results.at(-1);
      const final = M.phase !== 'roundEnd';
      if (r && (banner?.kind !== (final ? 'final' : 'round') || banner === null)) {
        const name = (id: number) => this.name(id);
        banner = final
          ? {
              kind: 'final',
              key: ++this.seq,
              title: headline(M, name),
              sub: M.rounds > 1 ? STR.finalTotal(M.rounds) : '',
              next: null,
              winner: M.leader,
              stores: M.rounds > 1 ? M.totals : r.stores,
              labels,
            }
          : {
              kind: 'round',
              key: ++this.seq,
              title: r.winner === null ? STR.roundTie(r.round) : STR.roundWin(labels[r.winner], r.round),
              sub: '',
              next: STR.roundNext(r.round + 1),
              winner: r.winner,
              stores: r.stores,
              labels,
            };
      }
    } else {
      banner = null;
    }
    this.tv.hud.value = {
      chip: STR.roundChip(M.round, M.rounds),
      panels: [panel(0), panel(1)],
      banner,
    };
  }

  private viewFor(id: number): ControllerView {
    if (this.finalViews) return this.finalViews.get(id) ?? V.idleView();
    const M = this.match;
    const mySide = M.sideOfPlayer(id);
    const team = M.teamMode && mySide !== null ? STR.teamName[mySide] : null;
    const stores: [number, number] =
      M.phase === 'sowing' && M.move
        ? [M.move.trace.before[7]!, M.move.trace.before[15]!]
        : [M.board[7]!, M.board[15]!];
    const scores: V.ScoreLine = { labels: [this.label(0), this.label(1)], stores };
    switch (M.phase) {
      case 'intro':
        return V.introView(M.round, M.rounds, team, mySide, this.label(M.turnSide));
      case 'turn': {
        if (M.current === id) {
          const holes = validHoles(M.board, M.turnSide).map((pos) => ({ pos, seeds: M.board[pos]! }));
          return V.turnView(holes, this.clock.toServer(M.deadline), M.extra, team);
        }
        const cur = M.current;
        return V.watchView(
          cur,
          cur !== null ? this.name(cur) : '',
          this.label(M.turnSide),
          M.teamMode,
          mySide === M.turnSide,
          scores,
          mySide,
        );
      }
      case 'sowing': {
        const mv = M.move;
        if (!mv) return V.idleView();
        const pid = mv.playerId;
        return V.sowingView(pid, pid === id, pid !== null ? this.name(pid) : '', scores, mySide);
      }
      case 'roundEnd':
        return this.roundViews?.get(id) ?? V.idleView();
      default:
        return V.idleView();
    }
  }

  private syncViews(): void {
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
