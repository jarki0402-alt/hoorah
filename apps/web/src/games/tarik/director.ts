/**
 * Glue between the Hoorah SDK, the pure match logic, the Phaser world and the DOM HUD.
 * Owns the paused-aware game clock, phone view throttling, sound cues and commentary.
 *
 * Computer seats (PRD 6.4): a lone player gets one opponent on the other team, and in a game of two
 * or more people the same brain pulls for a seat whose phone dropped until it reconnects. Brain taps
 * go through exactly the same `TarikMatch.input` path as phone taps.
 */
import type { PlayerInfo, RelayedInput } from '@hoorah/protocol';
import type { GameResult, HoorahGame } from '@hoorah/sdk';
import type * as Phaser from 'phaser';
import { celebrate } from '../../shared/confetti';
import { cpuSkill, isCpu, reportSoloResult, soloOpponents } from '../common/cpu';
import { PullBrain, type Ring, TAKEOVER_SKILL } from './brain';
import { GameClock } from './clock';
import { Commentator } from './commentary';
import type { Hud, HudMember, HudState, Overlay, TeamHud } from './hud';
import {
  buildResult,
  type MatchEvent,
  type Member,
  otherTeam,
  parseRounds,
  TarikMatch,
  TEAMS,
  type Team,
} from './logic';
import type { RosterEntry, TarikScene } from './scene';
import { formatClock, formatRate, STR } from './strings';
import { FULL_RATE, TEAM_COLOR, viewFor } from './views';

const HUD_MS = 100;
/** Phone 'tap' views: at most 4 per second per player. */
const VIEW_MS = 250;
const FLOAT_MS = 500;
const COMMENT_MS = 250;
/** 'pull' sfx at most 6 per second in total. */
const PULL_SFX_MS = 1000 / 6;
const SUPER_SFX_MS = 150;
const RING_SYNC_MS = 5000;
const GO_OVERLAY_MS = 800;
const HINT_MS = 12_000;
const URGENT_MS = 10_000;

export class Director {
  private readonly match: TarikMatch;
  private readonly clock = new GameClock();
  private readonly commentator = new Commentator();
  /** Last view sent to each phone, serialized, so unchanged views are not re-sent. */
  private readonly sent = new Map<number, string>();
  private readonly online = new Set<number>();
  private result: GameResult | null = null;
  private ended = false;
  private lastHud = Number.NEGATIVE_INFINITY;
  private lastViews = Number.NEGATIVE_INFINITY;
  private lastFloat = Number.NEGATIVE_INFINITY;
  private lastComment = Number.NEGATIVE_INFINITY;
  private lastRingSync = Number.NEGATIVE_INFINITY;
  private lastPullSfx = Number.NEGATIVE_INFINITY;
  private lastSuperSfx = Number.NEGATIVE_INFINITY;
  private readonly floatTaps: Record<Team, number> = { red: 0, blue: 0 };
  private floatTurn = 0;
  private readonly anchor = { x: 0, y: 0 };
  /** Computer opponents added because exactly one person started the game. */
  private readonly cpus: PlayerInfo[];
  /** Brain per computer-played seat: the opponents plus any dropped phone being covered. */
  private readonly brains = new Map<number, PullBrain>();
  /** People whose phone dropped mid-game; their seat is played by a brain until they return. */
  private readonly takeover = new Set<number>();
  /** Teams have been formed (the first countdown started). */
  private started = false;
  private reported = false;

  constructor(
    private readonly game: HoorahGame,
    private readonly scene: TarikScene,
    private readonly hud: Hud,
    private readonly phaser: Phaser.Game,
  ) {
    this.match = new TarikMatch({ rounds: parseRounds(game.settings.rounds) });
    this.cpus = soloOpponents(game.players, 1);
    const skill = cpuSkill(game.gameId);
    for (const cpu of this.cpus) this.brains.set(cpu.id, new PullBrain(skill));
  }

  start(): void {
    this.game.on('players', () => this.onPlayers());
    this.game.on('input', (input) => this.onInput(input));
    this.game.on('pause', (paused) => this.setHold('shell', paused));
    this.phaser.events.on('hidden', () => this.setHold('hidden', true));
    this.phaser.events.on('visible', () => this.setHold('hidden', false));
    if (this.game.paused) this.setHold('shell', true);
    this.onPlayers();
    this.scene.onFrame = () => this.frame();
  }

  /* ------------------------------------------------------------------ SDK events */

  private setHold(reason: string, on: boolean): void {
    if (on) this.clock.hold(reason);
    else this.clock.release(reason);
    const paused = this.clock.paused;
    this.hud.setPaused(paused);
    if (paused) {
      this.phaser.pause();
    } else {
      this.phaser.resume();
      if (this.match.phase === 'pull') this.syncRing();
    }
  }

  private onPlayers(): void {
    const all = this.game.allPlayers;
    this.updateTakeover(all);
    this.match.setPlayers(this.lineup(all));
    const present = new Set<number>();
    for (const p of all) {
      present.add(p.id);
      if (p.connected && !this.online.has(p.id)) {
        this.online.add(p.id);
        // (Re)connected: show them where we are right now.
        this.sendView(p.id, true);
      } else if (!p.connected) {
        this.online.delete(p.id);
      }
    }
    for (const id of this.online) if (!present.has(id)) this.online.delete(id);
    // A covered seat stays "connected" for the match, so refresh the dimmed marker here.
    this.syncRoster();
    this.lastHud = Number.NEGATIVE_INFINITY;
  }

  private onInput(input: RelayedInput & { atMs: number }): void {
    if (this.ended) return;
    if (this.clock.paused) {
      this.match.absorb(input.from, input.taps);
      return;
    }
    this.applyTap(input.from, input.taps, input.atMs, this.clock.now(), this.game.now());
  }

  /** One tap frame, from a phone or a brain: the same rules, the same effects. */
  private applyTap(id: number, taps: number, atMs: number, t: number, server: number): void {
    const r = this.match.input(id, taps, atMs, t, server);
    const team = r.team;
    if (!team) return;
    if (r.counted > 0) {
      this.floatTaps[team] += r.counted;
      this.scene.teamTap(team, r.counted);
      if (t - this.lastPullSfx >= PULL_SFX_MS) {
        this.lastPullSfx = t;
        this.game.sfx('pull');
      }
    }
    if (r.super) this.onSuper(r.playerId, team, r.combo, t);
  }

  /* ------------------------------------------------------------------ computer seats */

  /** Players for the match: the room (dropped phones that a brain covers stay in), then opponents. */
  private lineup(all: readonly PlayerInfo[]): PlayerInfo[] {
    const people = all.map((p) => (this.takeover.has(p.id) ? { ...p, connected: true } : p));
    return this.cpus.length ? [...people, ...this.cpus] : people;
  }

  /** People who play this match (have a team). */
  private humans(): Member[] {
    return this.match.allMembers().filter((m) => !isCpu(m.id) && m.team !== null);
  }

  /** Start or stop covering dropped phones. Only once teams exist and only with 2+ people. */
  private updateTakeover(all: readonly PlayerInfo[]): void {
    const present = new Set<number>();
    for (const p of all) {
      present.add(p.id);
      if (p.connected) {
        if (this.takeover.delete(p.id)) this.brains.delete(p.id);
        continue;
      }
      if (this.takeover.has(p.id) || !this.started) continue;
      if (!this.match.member(p.id)?.team || this.humans().length < 2) continue;
      this.takeover.add(p.id);
      this.brains.set(p.id, new PullBrain(TAKEOVER_SKILL));
    }
    for (const id of this.takeover) {
      if (present.has(id)) continue;
      this.takeover.delete(id);
      this.brains.delete(id);
    }
  }

  /** Feed the brains' taps for this frame into the match. */
  private driveBrains(t: number, server: number): void {
    const match = this.match;
    const tu = match.tuning;
    const ring: Ring = {
      start: match.ringStart,
      period: tu.ringPeriodMs,
      window: tu.superWindowMs,
      quiet: tu.superQuietMs,
    };
    for (const [id, brain] of this.brains) {
      const m = match.member(id);
      if (!m?.team) continue;
      const behind = m.team === 'red' ? match.p : -match.p;
      for (const at of brain.update(server, { ring, behind })) {
        if (this.ended || match.phase !== 'pull') return;
        this.applyTap(id, (Math.max(0, m.lastTaps) + 1) & 0xffff, at, t, server);
      }
    }
  }

  /** Shown as connected: a dropped phone keeps its marker even while a brain covers the seat. */
  private shownConnected(m: Member): boolean {
    return m.connected && !this.takeover.has(m.id);
  }

  private finalResult(): GameResult {
    const result = buildResult(this.match);
    const ids = new Set(result.ranking.map((r) => r.playerId));
    const cpus = this.cpus.filter((c) => ids.has(c.id));
    return cpus.length ? { ...result, cpuPlayers: cpus } : result;
  }

  /** Teach the remembered skill how the lone player did, once per match. */
  private reportSolo(winner: Team): void {
    if (this.reported || this.cpus.length === 0) return;
    const people = this.humans();
    if (people.length !== 1) return;
    this.reported = true;
    reportSoloResult(this.game.gameId, people[0]!.team === winner ? 'win' : 'lose');
  }

  private onSuper(id: number, team: Team, combo: number, t: number): void {
    this.scene.superPull(team);
    this.hud.flashRing(TEAM_COLOR[team]);
    const a = this.scene.headAnchor(team, this.anchor);
    const side = team === 'red' ? -1 : 1;
    this.hud.float(STR.superFloat, a.x + side * 16, a.y - 215, {
      kind: 'super',
      size: 46,
      color: '#FFC928',
      rotate: side * 6,
      rise: 60,
    });
    if (combo >= 2) {
      this.hud.float(STR.combo(combo), a.x + side * 30, a.y - 92, {
        kind: 'combo',
        rotate: side * 6,
        rise: 26,
        duration: 1300,
      });
    }
    if (t - this.lastSuperSfx >= SUPER_SFX_MS) {
      this.lastSuperSfx = t;
      this.game.sfx('super');
    }
    const m = this.match.member(id);
    if (!m) return;
    const rival = this.match.roster(otherTeam(team)).find((r) => r.connected)?.name ?? null;
    if (this.commentator.event({ type: 'super', name: m.name, combo, rival }, t)) {
      this.hud.setTicker(this.commentator.current);
    }
  }

  /* ------------------------------------------------------------------ frame */

  private frame(): void {
    if (this.ended) return;
    const t = this.clock.now();
    const server = this.game.now();
    const match = this.match;
    match.advance(t, server);
    let events = match.drainEvents();
    for (let i = 0; i < events.length; i++) this.onEvent(events[i]!, t, server);
    if (this.ended) return;
    if (match.phase === 'pull' && this.brains.size > 0) {
      this.driveBrains(t, server);
      events = match.drainEvents();
      for (let i = 0; i < events.length; i++) this.onEvent(events[i]!, t, server);
      if (this.ended) return;
    }

    const view = this.scene.view;
    view.p = match.p;
    view.force.red = match.teamForce('red');
    view.force.blue = match.teamForce('blue');
    view.pulling = match.phase === 'pull';
    this.hud.setRope(match.p);

    if (view.pulling) {
      if (t - this.lastViews >= VIEW_MS) {
        this.lastViews = t;
        this.sendViews(false);
      }
      if (t - this.lastFloat >= FLOAT_MS) {
        this.lastFloat = t;
        this.emitFloats();
      }
      if (t - this.lastComment >= COMMENT_MS) {
        this.lastComment = t;
        this.sampleCommentary(t);
      }
      if (t - this.lastRingSync >= RING_SYNC_MS) this.syncRing();
    }
    if (t - this.lastHud >= HUD_MS) {
      this.lastHud = t;
      this.hud.setState(this.hudState(t));
    }
  }

  private onEvent(e: MatchEvent, t: number, server: number): void {
    const match = this.match;
    this.lastHud = Number.NEGATIVE_INFINITY;
    switch (e.type) {
      case 'teams':
        this.syncRoster();
        return;
      case 'waiting':
        this.sendViews(true);
        return;
      case 'countdown':
        this.started = true;
        this.scene.resetRound();
        this.commentator.resetRound();
        this.syncRoster();
        return;
      case 'count':
        this.game.sfx('count');
        this.sendViews(true);
        return;
      case 'go':
        for (const brain of this.brains.values()) brain.startRound(server);
        this.game.sfx('go');
        this.floatTaps.red = 0;
        this.floatTaps.blue = 0;
        this.lastFloat = t;
        this.hud.syncRing(e.ringStart, match.tuning.ringPeriodMs, server);
        this.lastRingSync = t;
        this.sendViews(true);
        this.comment(
          { type: 'roundStart', round: e.round, decider: match.isDecider() && match.history.length > 0 },
          t,
        );
        return;
      case 'warning':
        this.game.sfx('tension');
        this.comment({ type: 'warning' }, t);
        return;
      case 'suddenDeath':
        this.game.sfx('tension');
        this.comment({ type: 'suddenDeath' }, t);
        return;
      case 'roundEnd':
        this.game.sfx('whistle');
        if (e.winner) window.setTimeout(() => this.game.sfx('cheer'), 350);
        this.scene.roundEnd(e.winner);
        this.vibrateRound(e.winner);
        this.sendViews(true);
        this.comment({ type: 'roundEnd', round: e.round, winner: e.winner }, t);
        return;
      case 'scoreboard':
        return;
      case 'matchEnd':
        this.result = this.finalResult();
        this.reportSolo(e.winner);
        this.game.sfx('win');
        celebrate();
        this.scene.celebrate(e.winner);
        this.sendViews(true);
        return;
      case 'done':
        this.ended = true;
        this.game.end(this.result ?? this.finalResult());
        return;
    }
  }

  private comment(e: Parameters<Commentator['event']>[0], t: number): void {
    if (this.commentator.event(e, t)) this.hud.setTicker(this.commentator.current);
  }

  private sampleCommentary(t: number): void {
    let fastest: { name: string; rate: number } | null = null;
    for (const m of this.match.allMembers()) {
      if (!m.connected || !m.team) continue;
      const rate = this.match.playerRate(m.id);
      if (!fastest || rate > fastest.rate) fastest = { name: m.name, rate };
    }
    if (this.commentator.sample({ p: this.match.p, fastest }, t))
      this.hud.setTicker(this.commentator.current);
  }

  private syncRing(): void {
    this.lastRingSync = this.clock.now();
    this.hud.syncRing(this.match.ringStart, this.match.tuning.ringPeriodMs, this.game.now());
  }

  /** '+N' floaters near each team: taps landed in the last half second, bigger for the stronger side. */
  private emitFloats(): void {
    const stronger: Team = this.match.teamForce('red') >= this.match.teamForce('blue') ? 'red' : 'blue';
    for (const team of TEAMS) {
      const n = this.floatTaps[team];
      this.floatTaps[team] = 0;
      if (n <= 0) continue;
      const strong = team === stronger;
      const a = this.scene.headAnchor(team, this.anchor);
      this.floatTurn = (this.floatTurn + 1) % 3;
      const side = team === 'red' ? -1 : 1;
      this.hud.float(STR.plus(n), a.x - side * 10 + (this.floatTurn - 1) * 22, a.y - 140, {
        kind: 'plus',
        size: strong ? 40 : 30,
        rotate: side * 7,
        rise: strong ? 50 : 40,
      });
    }
  }

  private vibrateRound(winner: Team | null): void {
    if (!winner) return;
    for (const m of this.match.allMembers()) {
      if (!this.online.has(m.id) || !m.team) continue;
      this.game.vibrate(m.id, m.team === winner ? [70, 50, 140] : 380);
    }
  }

  /* ------------------------------------------------------------------ phones */

  /** Only real, connected phones get views (never a computer seat or a dropped phone). */
  private sendViews(force: boolean): void {
    for (const id of this.online) this.sendView(id, force);
  }

  private sendView(id: number, force: boolean): void {
    if (isCpu(id)) return;
    const view = viewFor(this.match, id, this.game.now(), this.result);
    if (!view) return;
    const key = JSON.stringify(view);
    if (!force && this.sent.get(id) === key) return;
    this.sent.set(id, key);
    this.game.setView(id, view);
  }

  /* ------------------------------------------------------------------ world + HUD state */

  private syncRoster(): void {
    const entries = (team: Team): RosterEntry[] =>
      this.match.roster(team).map((m) => ({ id: m.id, fruit: m.fruit, connected: this.shownConnected(m) }));
    this.scene.setRoster(entries('red'), entries('blue'));
  }

  private teamHud(team: Team): TeamHud {
    const members: HudMember[] = this.match
      .roster(team)
      .map((m) => ({ id: m.id, name: m.name, fruit: m.fruit, connected: this.shownConnected(m) }));
    const rate = this.match.teamRate(team);
    return {
      team,
      members,
      wins: this.match.wins[team],
      rate: formatRate(rate),
      segments: Math.min(10, Math.round((rate / FULL_RATE) * 10)),
    };
  }

  private leadText(): string {
    const p = this.match.p;
    const pct = Math.round(Math.abs(p) * 50);
    if (pct === 0) return STR.even;
    return STR.leadPercent(p < 0 ? 'red' : 'blue', pct);
  }

  private overlay(t: number): Overlay {
    const m = this.match;
    switch (m.phase) {
      case 'waiting':
        if (m.connectedCount() >= 2) return { kind: 'none' };
        return {
          kind: 'waiting',
          players: m
            .allMembers()
            .filter((x) => x.connected)
            .map((x) => ({ id: x.id, name: x.name, fruit: x.fruit, connected: true })),
        };
      case 'countdown':
        return { kind: 'count', value: m.countValue, round: STR.roundOf(m.round, m.totalRounds) };
      case 'pull':
        return t - m.pullStart < GO_OVERLAY_MS ? { kind: 'go' } : { kind: 'none' };
      case 'roundEnd': {
        const w = m.lastWinner;
        const reason = !w ? STR.reasonDraw : m.lastReason === 'line' ? STR.reasonLine(w) : STR.reasonTime(w);
        return { kind: 'roundEnd', winner: w, reason };
      }
      case 'scoreboard': {
        const next = m.lastReason === 'draw' ? m.round : m.round + 1;
        return {
          kind: 'scoreboard',
          round: m.round,
          history: [...m.history],
          next: m.isDecider() ? STR.boardFinal : STR.boardNext(next),
        };
      }
      case 'matchEnd':
      case 'done': {
        const w = m.matchWinner ?? 'red';
        return { kind: 'matchEnd', winner: w, score: STR.winScore(m.wins[w], m.wins[otherTeam(w)]) };
      }
    }
  }

  private hudState(t: number): HudState {
    const m = this.match;
    const pulling = m.phase === 'pull';
    const left = m.timeLeft();
    return {
      live: m.phase === 'countdown' || pulling || m.phase === 'roundEnd' || m.phase === 'scoreboard',
      roundLabel: STR.roundOf(m.round, m.totalRounds),
      suddenDeath: pulling && m.suddenDeath,
      timer: formatClock(left),
      urgent: pulling && left <= URGENT_MS,
      winsNeeded: m.winsNeeded,
      red: this.teamHud('red'),
      blue: this.teamHud('blue'),
      prompt: pulling,
      hint: pulling && m.history.length === 0 && t - m.pullStart < HINT_MS,
      lead: this.leadText(),
      overlay: this.overlay(t),
    };
  }
}
