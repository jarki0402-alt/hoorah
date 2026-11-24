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
import { factsOf, hudFrom, strongerOf } from './board';
import { PullBrain, type Ring, TAKEOVER_SKILL } from './brain';
import { GameClock } from './clock';
import { Commentator } from './commentary';
import { StageEffects } from './effects';
import type { Hud } from './hud';
import {
  buildResult,
  type MatchEvent,
  type Member,
  otherTeam,
  parseRounds,
  TarikMatch,
  type Team,
} from './logic';
import { SUPERS_KEPT, type SuperMark, toMirror } from './mirror';
import type { RosterEntry, TarikScene } from './scene';
import { viewFor } from './views';

const HUD_MS = 100;
/** Phone 'tap' views: at most 4 per second per player. */
const VIEW_MS = 250;
const COMMENT_MS = 250;
/** 'pull' sfx at most 6 per second in total. */
const PULL_SFX_MS = 1000 / 6;
const SUPER_SFX_MS = 150;
const RING_SYNC_MS = 5000;
/**
 * Long-distance play: display state for a far-away screen, ~15 Hz while pulling (every 4th frame
 * at 60 fps; not 50 ms, because the shell holds each publish 50 ms and closer states would merge
 * and halve the rate), 4 Hz otherwise.
 */
const MIRROR_LIVE_MS = 60;
const MIRROR_IDLE_MS = 250;

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
  private lastMirror = Number.NEGATIVE_INFINITY;
  private lastComment = Number.NEGATIVE_INFINITY;
  private lastRingSync = Number.NEGATIVE_INFINITY;
  private lastPullSfx = Number.NEGATIVE_INFINITY;
  private lastSuperSfx = Number.NEGATIVE_INFINITY;
  private readonly fx: StageEffects;
  /** Counted taps per team over the whole match, and the latest supers, for a far-away screen. */
  private readonly tapTotals: Record<Team, number> = { red: 0, blue: 0 };
  private readonly supers: SuperMark[] = [];
  private superSeq = 0;
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
    this.fx = new StageEffects(scene, hud);
    this.cpus = soloOpponents(game.players, 1);
    const skill = cpuSkill(game.gameId);
    for (const cpu of this.cpus) this.brains.set(cpu.id, new PullBrain(skill));
  }

  start(): void {
    this.game.on('players', () => this.onPlayers());
    this.game.on('input', (input) => this.onInput(input));
    this.game.on('pause', (paused) => this.setHold('shell', paused));
    this.game.on('mirrors', (on) => {
      if (on) this.publishMirror(this.clock.now(), true);
    });
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
    // No frames run while paused, so tell a far-away screen right here.
    this.publishMirror(this.clock.now(), true);
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
      this.tapTotals[team] += r.counted;
      this.fx.taps(team, r.counted);
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

  private readonly shown = (m: Member): boolean => this.shownConnected(m);

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
    this.fx.superPull(team, combo);
    this.supers.push({ n: ++this.superSeq, team, combo });
    if (this.supers.length > SUPERS_KEPT) this.supers.shift();
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
      this.fx.floats(t, strongerOf(view.force));
      if (t - this.lastComment >= COMMENT_MS) {
        this.lastComment = t;
        this.sampleCommentary(t);
      }
      if (t - this.lastRingSync >= RING_SYNC_MS) this.syncRing();
    }
    if (t - this.lastHud >= HUD_MS) {
      this.lastHud = t;
      this.hud.setState(hudFrom(factsOf(match, t, this.shown)));
    }
    this.publishMirror(t, false);
  }

  private onEvent(e: MatchEvent, t: number, server: number): void {
    const match = this.match;
    this.lastHud = Number.NEGATIVE_INFINITY;
    this.lastMirror = Number.NEGATIVE_INFINITY;
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
        this.fx.resetFloats(t);
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
      this.match.roster(team).map((m) => ({ id: m.id, look: m.look, connected: this.shownConnected(m) }));
    this.scene.setRoster(entries('red'), entries('blue'));
  }

  /** Long-distance play: the board for a far-away screen, throttled unless `now` is set. */
  private publishMirror(t: number, now: boolean): void {
    if (!this.game.mirrored) return;
    const match = this.match;
    if (!now && t - this.lastMirror < (match.phase === 'pull' ? MIRROR_LIVE_MS : MIRROR_IDLE_MS)) return;
    this.lastMirror = t;
    this.game.publish(
      toMirror({
        facts: factsOf(match, t, this.shown),
        server: this.game.now(),
        force: { red: match.teamForce('red'), blue: match.teamForce('blue') },
        taps: this.tapTotals,
        supers: this.supers,
        ticker: this.commentator.current,
        ringStart: match.ringStart,
        ringPeriod: match.tuning.ringPeriodMs,
        countLeft: match.phase === 'countdown' ? 3 * match.tuning.countStepMs - (t - match.phaseStart) : 0,
        countStep: match.tuning.countStepMs,
        held: this.clock.paused,
      }),
    );
  }
}
