/**
 * Glue between the Hoorah SDK, the pure match logic, the Phaser world and the DOM HUD.
 * Owns the paused-aware game clock, the music restart that puts the song on the beat grid,
 * phone view throttling, sound cues and commentary.
 *
 * Computer racers (PRD 6.4): a lone player races three opponents, and in a race of two or more
 * people the same brain hops for a lane whose phone dropped until it reconnects. Brain taps go
 * through exactly the same `KarungMatch.input` path as phone taps.
 */
import type { PlayerInfo, RelayedInput } from '@hoorah/protocol';
import type { GameResult, HoorahGame } from '@hoorah/sdk';
import type * as Phaser from 'phaser';
import { celebrate } from '../../shared/confetti';
import { cpuSkill, isCpu, reportSoloResult, soloOpponents } from '../common/cpu';
import { type BeatGrid, fieldSkills, HopBrain, TAKEOVER_SKILL } from './brain';
import { GameClock } from './clock';
import { Commentator } from './commentary';
import type { BoardRow, Hud, HudState, Overlay, Plate } from './hud';
import { buildResult, KarungMatch, type MatchEvent, parseRounds, type Racer } from './logic';
import type { KarungScene, RosterEntry } from './scene';
import { formatClock, formatTime, STR } from './strings';
import { viewFor } from './views';

const HUD_MS = 100;
/** Phone 'tap' views: at most 4 per second per player. */
const VIEW_MS = 250;
const COMMENT_MS = 300;
const JUMP_SFX_MS = 90;
const STUMBLE_SFX_MS = 200;
const RING_SYNC_MS = 5000;
const GO_OVERLAY_MS = 900;
const HINT_MS = 12_000;
const PLATE_X = 12;
/** Opponents for someone playing alone: four sacks in the race. */
const SOLO_OPPONENTS = 3;

export class Director {
  private readonly match: KarungMatch;
  private readonly clock = new GameClock();
  private readonly commentator = new Commentator();
  /** Last view sent to each phone, serialized, so unchanged views are not re-sent. */
  private readonly sent = new Map<number, string>();
  private readonly online = new Set<number>();
  private result: GameResult | null = null;
  private ended = false;
  private lastHud = Number.NEGATIVE_INFINITY;
  private lastViews = Number.NEGATIVE_INFINITY;
  private lastComment = Number.NEGATIVE_INFINITY;
  private lastRingSync = Number.NEGATIVE_INFINITY;
  private lastJumpSfx = Number.NEGATIVE_INFINITY;
  private lastStumbleSfx = Number.NEGATIVE_INFINITY;
  private finishers = 0;
  private readonly anchor = { x: 0, y: 0 };
  /** Computer opponents added because exactly one person started the game. */
  private readonly cpus: PlayerInfo[];
  /** Brain per computer-played lane: the opponents plus any dropped phone being covered. */
  private readonly brains = new Map<number, HopBrain>();
  /** People whose phone dropped mid-game; their lane is raced by a brain until they return. */
  private readonly takeover = new Set<number>();
  /** The first countdown has started. */
  private started = false;
  private reported = false;

  constructor(
    private readonly game: HoorahGame,
    private readonly scene: KarungScene,
    private readonly hud: Hud,
    private readonly phaser: Phaser.Game,
  ) {
    this.match = new KarungMatch({ rounds: parseRounds(game.settings.rounds) });
    scene.trackLength = this.match.tuning.trackLength;
    scene.hopMs = this.match.tuning.hopMs;
    this.cpus = soloOpponents(game.players, SOLO_OPPONENTS);
    const skills = fieldSkills(cpuSkill(game.gameId), this.cpus.length);
    this.cpus.forEach((cpu, i) => {
      this.brains.set(cpu.id, new HopBrain(skills[i] ?? 0.5));
    });
  }

  start(): void {
    this.game.on('players', () => this.onPlayers());
    this.game.on('input', (input) => this.onInput(input));
    this.game.on('pause', (paused) => this.setHold('shell', paused));
    this.phaser.events.on('hidden', () => this.setHold('hidden', true));
    this.phaser.events.on('visible', () => this.setHold('hidden', false));
    if (this.game.paused) this.setHold('shell', true);
    this.onPlayers();
    // The song starts with each countdown; play it now only if we are going to wait a while.
    if (this.match.connectedCount() < 2) this.game.music('karung');
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
      return;
    }
    this.phaser.resume();
    // The music kept playing during the pause: a countdown starts over on the beat.
    this.match.resync(this.clock.now(), this.game.now());
    if (this.match.phase === 'race') this.syncRing();
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
  private applyTap(from: number, taps: number, atMs: number, t: number, server: number): void {
    const r = this.match.input(from, taps, atMs, t, server);
    const id = r.playerId;
    switch (r.kind) {
      case 'none':
        return;
      case 'stumble': {
        this.scene.stumble(id, this.match.tuning.stumbleMs);
        const a = this.scene.headAnchor(id, this.anchor);
        if (a)
          this.hud.float(STR.stumbleFloat, a.x, a.y - 26, {
            kind: 'stumble',
            size: 30,
            color: '#F2453D',
            rotate: 8,
          });
        this.buzz(id, [90, 50, 160]);
        if (t - this.lastStumbleSfx >= STUMBLE_SFX_MS) {
          this.lastStumbleSfx = t;
          this.game.sfx('hit');
        }
        const m = this.match.racer(id);
        if (m) this.comment({ type: 'stumble', name: m.name }, t);
        this.sendView(id, false);
        return;
      }
      default:
        this.scene.hop(id, r.kind, r.to);
        if (t - this.lastJumpSfx >= JUMP_SFX_MS) {
          this.lastJumpSfx = t;
          this.game.sfx('jump');
        }
        if (r.kind === 'super') this.onSuper(id, t);
        else if (r.streak >= 6 && r.streak % 6 === 0) {
          const m = this.match.racer(id);
          if (m) this.comment({ type: 'streak', name: m.name, streak: r.streak }, t);
        }
    }
  }

  private onSuper(id: number, t: number): void {
    const m = this.match.racer(id);
    const a = this.scene.headAnchor(id, this.anchor);
    if (a)
      this.hud.float(STR.superFloat, a.x + 20, a.y - 40, {
        kind: 'super',
        size: 34,
        color: '#FFC928',
        rotate: -6,
        rise: 60,
      });
    if (m) this.hud.flashRing(m.color);
    this.game.sfx('super');
    this.buzz(id, 40);
    if (m) this.comment({ type: 'super', name: m.name }, t);
  }

  /* ------------------------------------------------------------------ computer lanes */

  /** Players for the match: the room (dropped phones that a brain covers stay in), then opponents. */
  private lineup(all: readonly PlayerInfo[]): PlayerInfo[] {
    const people = all.map((p) => (this.takeover.has(p.id) ? { ...p, connected: true } : p));
    return this.cpus.length ? [...people, ...this.cpus] : people;
  }

  /** People taking part in this match (raced, or have a lane now). */
  private humans(): Racer[] {
    return this.match.all().filter((r) => !isCpu(r.id) && (r.lane !== null || r.races > 0));
  }

  private grid(): BeatGrid {
    const m = this.match;
    return { anchor: m.anchor, beatMs: m.tuning.beatMs, startAt: m.raceStartServer };
  }

  /** Start or stop covering dropped phones. Only once racing started and only with 2+ people. */
  private updateTakeover(all: readonly PlayerInfo[]): void {
    const present = new Set<number>();
    for (const p of all) {
      present.add(p.id);
      if (p.connected) {
        if (this.takeover.delete(p.id)) this.brains.delete(p.id);
        continue;
      }
      if (this.takeover.has(p.id) || !this.started || !this.match.racer(p.id)) continue;
      if (this.humans().length < 2) continue;
      const brain = new HopBrain(TAKEOVER_SKILL);
      const phase = this.match.phase;
      if (phase === 'countdown' || phase === 'race') brain.startRace(this.grid(), this.game.now());
      this.takeover.add(p.id);
      this.brains.set(p.id, brain);
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
    for (const [id, brain] of this.brains) {
      const r = match.racer(id);
      if (!r || r.lane === null || r.finishAt !== null) continue;
      for (const at of brain.update(server)) {
        if (this.ended || match.phase !== 'race' || r.finishAt !== null) break;
        this.applyTap(id, (Math.max(0, r.lastTaps) + 1) & 0xffff, at, t, server);
      }
    }
  }

  /** Shown as connected: a dropped phone keeps its marker even while a brain covers the lane. */
  private shownConnected(r: Racer): boolean {
    return r.connected && !this.takeover.has(r.id);
  }

  /** Vibrate a real, connected phone (never a computer lane or a dropped phone). */
  private buzz(id: number, pattern: number | number[]): void {
    if (this.online.has(id)) this.game.vibrate(id, pattern);
  }

  private finalResult(): GameResult {
    const result = buildResult(this.match);
    const ids = new Set(result.ranking.map((r) => r.playerId));
    const cpus = this.cpus.filter((c) => ids.has(c.id));
    return cpus.length ? { ...result, cpuPlayers: cpus } : result;
  }

  /** Teach the remembered skill how the lone player did, once per match. */
  private reportSolo(result: GameResult): void {
    if (this.reported || this.cpus.length === 0) return;
    const people = this.humans();
    if (people.length !== 1) return;
    const me = result.ranking.find((r) => r.playerId === people[0]!.id);
    if (!me) return;
    this.reported = true;
    const shared = result.ranking.filter((r) => r.rank === 1).length > 1;
    reportSoloResult(this.game.gameId, me.rank !== 1 ? 'lose' : shared ? 'draw' : 'win');
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
    if (match.phase === 'race' && this.brains.size > 0) {
      this.driveBrains(t, server);
      events = match.drainEvents();
      for (let i = 0; i < events.length; i++) this.onEvent(events[i]!, t, server);
      if (this.ended) return;
    }

    const beat = match.tuning.beatMs;
    const phase = (server - match.anchor) / beat;
    this.scene.beatPhase = phase - Math.floor(phase);

    if (match.phase === 'race') {
      if (t - this.lastViews >= VIEW_MS) {
        this.lastViews = t;
        this.sendViews(false);
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
      case 'roster':
        this.syncRoster();
        return;
      case 'waiting':
        this.game.music('karung');
        this.sendViews(true);
        return;
      case 'countdown':
        this.started = true;
        for (const brain of this.brains.values()) brain.startRace(this.grid());
        // Restart the song so its beat 0 lands on the race's beat 0 (anchor).
        this.game.music(null);
        this.game.music('karung');
        this.finishers = 0;
        this.syncRoster();
        this.scene.resetRace();
        this.commentator.resetRace();
        this.hud.syncRing(e.anchor, match.tuning.beatMs, server);
        this.lastRingSync = t;
        this.sendViews(true);
        return;
      case 'count':
        this.game.sfx('count');
        this.sendViews(true);
        return;
      case 'go':
        this.game.sfx('go');
        this.scene.go();
        this.syncRing();
        this.sendViews(true);
        this.comment({ type: 'start', race: e.race, final: match.isFinalRace() && match.totalRaces > 1 }, t);
        return;
      case 'finish': {
        this.finishers++;
        const first = this.finishers === 1;
        this.scene.finish(e.id, first);
        const m = match.racer(e.id);
        const a = this.scene.headAnchor(e.id, this.anchor);
        if (a)
          this.hud.float(STR.finishedFloat(e.place), a.x, a.y - 30, {
            kind: 'super',
            size: 40,
            color: first ? '#FFC928' : '#FFFFFF',
            rise: 40,
            duration: 1300,
          });
        this.game.sfx(first ? 'win' : 'ding');
        this.buzz(e.id, first ? [60, 40, 60, 40, 160] : [60, 40, 120]);
        if (e.close) {
          this.scene.flash();
          this.game.sfx('reveal');
          this.comment({ type: 'photo' }, t);
        } else if (m) {
          this.comment({ type: 'finish', name: m.name, first }, t);
        }
        this.sendView(e.id, true);
        return;
      }
      case 'lastCall':
        this.game.sfx('tension');
        this.comment({ type: 'lastCall' }, t);
        return;
      case 'warning':
        this.game.sfx('tension');
        this.comment({ type: 'warning' }, t);
        return;
      case 'raceEnd': {
        this.game.sfx('whistle');
        window.setTimeout(() => this.game.sfx('cheer'), 350);
        this.scene.raceEnd(match.lastOrder);
        if (e.photo) this.scene.flash();
        for (const r of match.field()) this.buzz(r.id, r.place === 1 ? [70, 50, 140] : 200);
        const winner = e.winner === null ? null : match.racer(e.winner);
        this.comment({ type: 'raceEnd', name: winner?.name ?? null, race: e.race }, t);
        this.sendViews(true);
        return;
      }
      case 'standings':
        this.sendViews(true);
        return;
      case 'matchEnd':
        this.result = this.finalResult();
        this.reportSolo(this.result);
        this.game.sfx('win');
        celebrate();
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
    const order = this.match
      .order()
      .filter((r) => r.connected)
      .map((r) => ({ id: r.id, name: r.name, dist: r.dist }));
    if (this.commentator.sample({ order }, t)) this.hud.setTicker(this.commentator.current);
  }

  private syncRing(): void {
    this.lastRingSync = this.clock.now();
    this.hud.syncRing(this.match.anchor, this.match.tuning.beatMs, this.game.now());
  }

  /* ------------------------------------------------------------------ phones */

  /** Only real, connected phones get views (never a computer lane or a dropped phone). */
  private sendViews(force: boolean): void {
    for (const id of this.online) this.sendView(id, force);
  }

  private sendView(id: number, force: boolean): void {
    if (!this.online.has(id)) return;
    const view = viewFor(this.match, id, this.game.now(), this.result);
    if (!view) return;
    const key = JSON.stringify(view);
    if (!force && this.sent.get(id) === key) return;
    this.sent.set(id, key);
    this.game.setView(id, view);
  }

  /* ------------------------------------------------------------------ world + HUD state */

  /** Racers on the track: the race field, or (before the first race) everyone connected. */
  private shownRacers(): Racer[] {
    const field = this.match.field();
    if (field.length > 0) return field;
    return this.match
      .all()
      .filter((r) => r.connected)
      .slice(0, this.match.tuning.maxRacers);
  }

  private syncRoster(): void {
    const entries: RosterEntry[] = this.shownRacers().map((r) => ({
      id: r.id,
      look: r.look,
      color: r.color,
      connected: this.shownConnected(r),
      dist: r.dist,
    }));
    this.scene.setRoster(entries);
  }

  private plates(): Plate[] {
    const list = this.shownRacers();
    const { centers, spacing } = this.scene.lanes;
    const o = this.hud.origin;
    const order = this.match.phase === 'race' || this.match.phase === 'raceEnd' ? this.match.order() : [];
    const server = this.game.now();
    const h = Math.round(Math.min(56, spacing - 6));
    return list.map((r, i) => {
      const idx = order.findIndex((x) => x.id === r.id);
      const moved = r.dist > 0 || r.finishAt !== null;
      return {
        id: r.id,
        name: r.name,
        look: r.look,
        color: r.color,
        connected: this.shownConnected(r),
        place: this.match.phase === 'raceEnd' ? (r.place ?? 0) : idx >= 0 && moved ? idx + 1 : 0,
        streak: this.match.streakOf(r.id, server),
        finished: r.finishAt !== null,
        stumble: this.match.stumbling(r.id, server),
        x: o.x + PLATE_X,
        y: o.y + (centers[i] ?? 0),
        h,
      };
    });
  }

  private boardRows(): BoardRow[] {
    const list = this.match.standings();
    let rank = 0;
    return list.map((r, i) => {
      const prev = list[i - 1];
      if (!prev || prev.points !== r.points || prev.wins !== r.wins) rank = i + 1;
      return {
        id: r.id,
        name: r.name,
        look: r.look,
        color: r.color,
        rank,
        racePlace: r.place,
        plus: r.racePoints,
        total: r.points,
      };
    });
  }

  private overlay(t: number): Overlay {
    const m = this.match;
    switch (m.phase) {
      case 'waiting':
        if (m.connectedCount() >= 2) return { kind: 'none' };
        return {
          kind: 'waiting',
          players: m
            .all()
            .filter((x) => x.connected)
            .map((x) => ({ id: x.id, look: x.look, color: x.color })),
        };
      case 'countdown':
        return { kind: 'count', value: Math.max(1, m.countValue), label: STR.raceOf(m.race, m.totalRaces) };
      case 'race':
        return t - m.raceStartT < GO_OVERLAY_MS ? { kind: 'go' } : { kind: 'none' };
      case 'raceEnd': {
        const id = m.lastOrder[0];
        const w = id === undefined ? undefined : m.racer(id);
        if (!w || w.racePoints === 0) {
          return {
            kind: 'raceEnd',
            title: STR.notFinished,
            sub: STR.raceNoFinish(m.race),
            look: null,
            color: '#FFC928',
            photo: false,
          };
        }
        const time = m.finishTime(w);
        const second = m.lastOrder[1] === undefined ? undefined : m.racer(m.lastOrder[1]);
        let sub = time === null ? STR.raceNoFinish(m.race) : STR.raceWinnerSub(m.race, formatTime(time));
        if (m.lastPhoto && second?.finishAt != null && w.finishAt !== null) {
          sub = STR.photoGap(formatTime(second.finishAt - w.finishAt));
        }
        return {
          kind: 'raceEnd',
          title: STR.raceWinner(w.name),
          sub,
          look: w.look,
          color: w.color,
          photo: m.lastPhoto,
        };
      }
      case 'standings':
        return {
          kind: 'standings',
          eyebrow: STR.boardEyebrow(m.race, m.totalRaces),
          rows: this.boardRows(),
          next: m.isFinalRace() ? STR.boardLast : STR.boardNext(m.race + 1),
        };
      case 'matchEnd':
      case 'done': {
        const res = this.result ?? buildResult(m);
        const winners = res.ranking
          .filter((r) => r.rank === 1)
          .map((r) => m.racer(r.playerId))
          .filter((r): r is Racer => r !== undefined)
          .slice(0, 4)
          .map((r) => ({ id: r.id, look: r.look, color: r.color }));
        return { kind: 'matchEnd', title: res.title, sub: res.subtitle ?? '', winners };
      }
    }
  }

  private hudState(t: number): HudState {
    const m = this.match;
    const racing = m.phase === 'race';
    const grace = m.graceLeft();
    return {
      live: m.phase === 'countdown' || racing || m.phase === 'raceEnd' || m.phase === 'standings',
      raceLabel: STR.raceOf(m.race, m.totalRaces),
      timer: formatClock(m.elapsed()),
      grace: grace === null ? null : STR.graceLeft(Math.ceil(grace / 1000)),
      prompt: racing || m.phase === 'countdown',
      hint: m.race === 1 && (m.phase === 'countdown' || (racing && t - m.raceStartT < HINT_MS)),
      plates: this.plates(),
      overlay: this.overlay(t),
    };
  }
}
