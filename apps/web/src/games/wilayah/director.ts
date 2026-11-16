/**
 * Glue between the Hoorah SDK, the pure match logic, the Phaser world and the DOM HUD. Owns the
 * paused-aware clock, the fixed-step advance, sound cues, phone views and the final result.
 *
 * Computer players (PRD 6.4): a lone person plays against three to five opponents (more as the
 * remembered skill rises). With two or more people there are none, but a brain keeps a dropped
 * phone's runner safe at home until the phone is back. Brains steer exactly like a phone's
 * joystick: a target angle every step, under the same turn-rate limit.
 */
import { FRUITS, PLAYER_COLORS, type PlayerInfo, type RelayedInput } from '@hoorah/protocol';
import type { GameResult, HoorahGame } from '@hoorah/sdk';
import type * as Phaser from 'phaser';
import { celebrate } from '../../shared/confetti';
import { bySkill, cpuSkill, isCpu, reportSoloResult, soloOpponents } from '../common/cpu';
import { fieldSkills, styleFor, TAKEOVER_STYLE, TerritoryBrain } from './brain';
import { GameClock } from './clock';
import type { BoardRow, Hud, HudState, Overlay } from './hud';
import { type MatchEvent, parseMinutes, type Runner, WilayahMatch } from './logic';
import { buildResult, soloOutcome } from './results';
import type { WilayahScene } from './scene';
import { formatClock, formatPct, STR } from './strings';
import { viewFor } from './views';

const HUD_MS = 100;
/** Phone views: at most 4 per second per player, and only when they changed. */
const VIEW_MS = 250;
const GO_MS = 950;
const WARN_MS = 1600;
const HINT_MS = 9000;
const CAPTURE_SFX_MS = 150;
/** A loop shorter than this (units) is a dip along the own border: no sound, no buzz. */
const QUIET_LOOP = 3;
const OUT_SFX_MS = 120;
/** Captures smaller than this share (%) get no pop-up. */
const FLOAT_MIN_PCT = 0.25;
const FEED_BIG_PCT = 5;
const OUT_RED = '#FF6B5E';

export class Director {
  private readonly clock = new GameClock();
  private readonly match: WilayahMatch;
  private readonly minutes: number;
  /** Computer opponents added because exactly one person started the game. */
  private cpus: PlayerInfo[];
  private readonly online = new Set<number>();
  /** Last view sent to each phone, serialized, so unchanged views are not re-sent. */
  private readonly sent = new Map<number, string>();
  /** People whose phone dropped; a brain keeps their runner home until they return. */
  private readonly takeover = new Set<number>();
  private result: GameResult | null = null;
  private ended = false;
  private reported = false;
  private goAt = Number.NEGATIVE_INFINITY;
  private warnAt = Number.NEGATIVE_INFINITY;
  private lastHud = Number.NEGATIVE_INFINITY;
  private lastViews = Number.NEGATIVE_INFINITY;
  private lastCaptureSfx = Number.NEGATIVE_INFINITY;
  private lastOutSfx = Number.NEGATIVE_INFINITY;
  private readonly at = { x: 0, y: 0 };

  constructor(
    private readonly game: HoorahGame,
    private readonly scene: WilayahScene,
    private readonly hud: Hud,
    private readonly phaser: Phaser.Game,
  ) {
    const skill = cpuSkill(game.gameId);
    this.cpus = soloOpponents(game.players, Math.round(bySkill(skill, 3, 5)));
    this.minutes = parseMinutes(game.settings.rounds);
    this.match = new WilayahMatch({
      players: [...game.allPlayers, ...this.cpus],
      minutes: this.minutes,
      now: this.clock.now(),
    });
    const skills = fieldSkills(skill, this.cpus.length);
    this.cpus.forEach((cpu, i) => {
      this.match.setPilot(cpu.id, new TerritoryBrain(styleFor(skills[i] ?? skill)));
    });
    scene.setup(this.match);
  }

  start(): void {
    this.game.on('players', () => this.onPlayers());
    this.game.on('input', (input) => this.onInput(input));
    this.game.on('pause', (paused) => this.setHold('shell', paused));
    this.phaser.events.on('hidden', () => this.setHold('hidden', true));
    this.phaser.events.on('visible', () => this.setHold('hidden', false));
    if (this.game.paused) this.setHold('shell', true);
    this.onPlayers();
    this.game.music('wilayah');
    this.scene.onFrame = () => this.frame();
  }

  /* ------------------------------------------------------------------ SDK events */

  private setHold(reason: string, on: boolean): void {
    if (on) this.clock.hold(reason);
    else this.clock.release(reason);
    const paused = this.clock.paused;
    this.hud.setPaused(paused);
    if (paused) this.phaser.pause();
    else this.phaser.resume();
  }

  private onPlayers(): void {
    const all = this.game.allPlayers;
    this.restyleCpus(all);
    this.updateTakeover(all);
    this.match.setPlayers([...all, ...this.cpus], this.clock.now());
    const present = new Set<number>();
    for (const p of all) {
      present.add(p.id);
      if (p.connected && !this.online.has(p.id)) {
        this.online.add(p.id);
        this.sendView(p.id, true);
      } else if (!p.connected) this.online.delete(p.id);
    }
    for (const id of this.online) if (!present.has(id)) this.online.delete(id);
    this.lastHud = Number.NEGATIVE_INFINITY;
  }

  /**
   * Someone who joins mid-game may get the colour or fruit a computer player already wears: the
   * computer player switches to a free one so every territory stays distinguishable.
   */
  private restyleCpus(all: readonly PlayerInfo[]): void {
    if (this.cpus.length === 0) return;
    const people = all.filter((p) => p.connected);
    const colors = new Set(people.map((p) => p.color.toUpperCase()));
    const fruits = new Set<string>(people.map((p) => p.fruit));
    for (const c of this.cpus) {
      colors.add(c.color.toUpperCase());
      fruits.add(c.fruit);
    }
    this.cpus.forEach((cpu, i) => {
      const clashColor = people.some((p) => p.color.toUpperCase() === cpu.color.toUpperCase());
      const clashFruit = people.some((p) => p.fruit === cpu.fruit);
      if (!clashColor && !clashFruit) return;
      const color = clashColor ? PLAYER_COLORS.find((c) => !colors.has(c.toUpperCase())) : cpu.color;
      const fruit = clashFruit ? FRUITS.find((f) => !fruits.has(f)) : cpu.fruit;
      if (color) colors.add(color.toUpperCase());
      if (fruit) fruits.add(fruit);
      this.cpus[i] = { ...cpu, color: color ?? cpu.color, fruit: fruit ?? cpu.fruit };
    });
  }

  private updateTakeover(all: readonly PlayerInfo[]): void {
    for (const p of all) {
      const r = this.match.runner(p.id);
      if (!r) continue;
      if (p.connected && this.takeover.delete(p.id)) this.match.setPilot(p.id, null);
      else if (!p.connected && !this.takeover.has(p.id)) {
        this.takeover.add(p.id);
        this.match.setPilot(p.id, new TerritoryBrain(TAKEOVER_STYLE, Math.random, true));
      }
    }
    const ids = new Set(all.map((p) => p.id));
    for (const id of this.takeover) if (!ids.has(id)) this.takeover.delete(id);
  }

  private onInput(input: RelayedInput & { atMs: number }): void {
    if (this.ended) return;
    if (this.clock.paused) {
      // Input made during a pause is dropped, never replayed: the runner goes straight until the
      // phone's next stick frame (repeated while held) after the pause.
      this.match.absorb(input.from);
      return;
    }
    this.match.input(input.from, input.op, input.buttons, this.clock.now());
  }

  /* ------------------------------------------------------------------ frame */

  private frame(): void {
    if (this.ended) return;
    const t = this.clock.now();
    const match = this.match;
    match.advance(t);
    const events = match.drainEvents();
    for (let i = 0; i < events.length; i++) this.onEvent(events[i]!, t);
    if (this.ended) return;
    this.scene.frameT = t;
    this.scene.alpha = match.alpha(t);
    if (t - this.lastViews >= VIEW_MS) {
      this.lastViews = t;
      this.sendViews(false);
    }
    if (t - this.lastHud >= HUD_MS) {
      this.lastHud = t;
      this.hud.setState(this.hudState(t));
    }
  }

  private onEvent(e: MatchEvent, t: number): void {
    const match = this.match;
    this.scene.onEvent(e, t);
    switch (e.type) {
      case 'count':
        this.game.sfx('count');
        this.lastHud = Number.NEGATIVE_INFINITY;
        this.sendViews(true);
        return;
      case 'go':
        this.goAt = t;
        this.game.sfx('go');
        this.lastHud = Number.NEGATIVE_INFINITY;
        this.sendViews(true);
        return;
      case 'spawn':
        if (!e.first) {
          this.buzz(e.id, 50);
          this.sendView(e.id, true);
        }
        return;
      case 'capture': {
        const pct = e.gained * 100;
        const r = match.runner(e.id);
        if (!r) return;
        if (e.loop < QUIET_LOOP && pct < FLOAT_MIN_PCT) return;
        if (pct >= FLOAT_MIN_PCT) {
          this.scene.toWorld(e.x, e.y, this.at);
          const size = Math.round(Math.min(64, 26 + pct * 4));
          this.hud.float(STR.gainFloat(formatPct(pct)), this.at.x, this.at.y, r.color, size);
        }
        // Small computer captures stay quiet so a busy solo floor does not chatter.
        const audible = !isCpu(e.id) || pct >= 1.2;
        if (audible && t - this.lastCaptureSfx >= CAPTURE_SFX_MS) {
          this.lastCaptureSfx = t;
          this.game.sfx(pct >= 4 ? 'super' : pct >= 1.2 ? 'perfect' : 'drop');
        }
        this.buzz(e.id, pct >= 2 ? [30, 40, 70] : 25);
        if (pct >= FEED_BIG_PCT) this.hud.pushFeed(STR.feedBig(r.name, formatPct(pct, 0)), r.color);
        this.sendView(e.id, false);
        return;
      }
      case 'out': {
        const r = match.runner(e.id);
        const by = e.by === null ? undefined : match.runner(e.by);
        this.scene.toWorld(e.x, e.y, this.at);
        this.hud.float(STR.outFloat, this.at.x, this.at.y - 18, OUT_RED, 34, 40);
        if (t - this.lastOutSfx >= OUT_SFX_MS) {
          this.lastOutSfx = t;
          this.game.sfx(e.cause === 'cut' || e.cause === 'wiped' ? 'explode' : 'hit');
        }
        this.buzz(e.id, [140, 60, 220]);
        if (by) this.buzz(by.id, [40, 30, 40]);
        if (r) this.pushOutFeed(e, r, by);
        this.sendView(e.id, true);
        if (by) this.sendView(by.id, false);
        return;
      }
      case 'warning':
        this.warnAt = t;
        this.game.sfx('tension');
        return;
      case 'second':
        this.game.sfx('tick');
        return;
      case 'timeUp': {
        this.game.sfx('whistle');
        window.setTimeout(() => this.game.sfx('cheer'), 380);
        this.scene.flash();
        this.result = this.finalResult();
        this.reportSolo(this.result);
        celebrate();
        this.lastHud = Number.NEGATIVE_INFINITY;
        this.sendViews(true);
        return;
      }
      case 'done':
        this.ended = true;
        this.game.end(this.result ?? this.finalResult());
        return;
      case 'leave':
        return;
    }
  }

  private pushOutFeed(e: Extract<MatchEvent, { type: 'out' }>, r: Runner, by: Runner | undefined): void {
    switch (e.cause) {
      case 'cut':
        if (by) this.hud.pushFeed(STR.feedCut(by.name, r.name), by.color);
        return;
      case 'wiped':
        if (by) this.hud.pushFeed(STR.feedWiped(by.name, r.name), by.color);
        return;
      case 'self':
        this.hud.pushFeed(STR.feedSelf(r.name), r.color);
        return;
      case 'crash':
        this.hud.pushFeed(STR.feedCrash(r.name), r.color);
        return;
    }
  }

  /* ------------------------------------------------------------------ results */

  private finalResult(): GameResult {
    const result = buildResult(this.match.standings(), this.match.field.size, this.minutes);
    const ids = new Set(result.ranking.map((r) => r.playerId));
    const cpus = this.cpus.filter((c) => ids.has(c.id));
    return cpus.length ? { ...result, cpuPlayers: cpus } : result;
  }

  /** Teach the remembered skill how the lone person did, once per match. */
  private reportSolo(result: GameResult): void {
    if (this.reported || this.cpus.length === 0) return;
    const people = this.match.all().filter((r) => !isCpu(r.id));
    if (people.length !== 1) return;
    const outcome = soloOutcome(result, people[0]!.id);
    if (!outcome) return;
    this.reported = true;
    reportSoloResult(this.game.gameId, outcome);
  }

  /* ------------------------------------------------------------------ phones */

  /** Vibrate a real, connected phone (never a computer runner or a dropped phone). */
  private buzz(id: number, pattern: number | number[]): void {
    if (this.online.has(id)) this.game.vibrate(id, pattern);
  }

  private sendViews(force: boolean): void {
    for (const id of this.online) this.sendView(id, force);
  }

  private sendView(id: number, force: boolean): void {
    if (!this.online.has(id)) return;
    const view = viewFor({ match: this.match, id, t: this.clock.now(), result: this.result });
    if (!view) return;
    const key = JSON.stringify(view);
    if (!force && this.sent.get(id) === key) return;
    this.sent.set(id, key);
    this.game.setView(id, view);
  }

  /* ------------------------------------------------------------------ HUD */

  private rows(t: number): BoardRow[] {
    const m = this.match;
    const list = m.standings();
    const lead = Math.max(1, list[0]?.cells ?? 1);
    const sole = list.filter((s) => s.rank === 1).length === 1 && (list[0]?.cells ?? 0) > 0;
    return list.map((s, order) => ({
      id: s.runner.id,
      name: s.runner.name,
      fruit: s.runner.fruit,
      color: s.runner.color,
      pct: formatPct((s.cells * 100) / m.field.size),
      share: s.cells / lead,
      rank: s.rank,
      lead: sole && s.rank === 1,
      order,
      alive: s.runner.alive,
      respawn: s.runner.alive ? null : Math.max(1, Math.ceil((s.runner.respawnAt - t) / 1000)),
      away: this.takeover.has(s.runner.id),
    }));
  }

  private overlay(t: number): Overlay {
    const m = this.match;
    switch (m.phase) {
      case 'countdown':
        return { kind: 'count', value: Math.max(1, m.countValue) };
      case 'play':
        if (t - this.goAt < GO_MS) return { kind: 'go' };
        if (t - this.warnAt < WARN_MS) return { kind: 'warning' };
        return { kind: 'none' };
      case 'over':
      case 'done': {
        const res = this.result ?? this.finalResult();
        const top = res.ranking.filter((r) => r.rank === 1);
        const winners = top
          .map((r) => m.runner(r.playerId))
          .filter((r): r is Runner => r !== undefined && m.cells(r) > 0)
          .slice(0, 3)
          .map((r) => ({ id: r.id, fruit: r.fruit, color: r.color }));
        const best = top[0];
        return {
          kind: 'timeUp',
          title: res.title,
          sub: best && winners.length > 0 ? STR.winnerSub(formatPct(best.score)) : '',
          winners,
        };
      }
    }
  }

  private hudState(t: number): HudState {
    const m = this.match;
    const left = m.timeLeft(t);
    return {
      live: true,
      timer: formatClock(left),
      urgent: m.phase === 'play' && left <= m.tuning.warnMs,
      rows: this.rows(t),
      overlay: this.overlay(t),
      hint: m.phase === 'countdown' || (m.phase === 'play' && t - this.goAt < HINT_MS),
    };
  }
}
