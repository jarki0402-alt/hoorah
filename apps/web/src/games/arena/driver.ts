/**
 * Glue between the Hoorah SDK, the pure match, the Phaser scene and the DOM HUD: owns the paused
 * aware clock, phone input (joystick + held boost), computer snakes, sounds, phone views (throttled,
 * deduplicated) and the HUD state.
 *
 * Long-distance play: while a far-away main screen watches, the stage is published to it about
 * 16 times a second (mirror.ts), and at once on a phase change, a knock-out or a pause.
 *
 * Computer snakes (PRD 6.4): a lone player gets four opponents that look like normal players. With
 * two or more people there are none, but the same brain steers a snake whose phone dropped until
 * it reconnects.
 */
import type { PlayerInfo, RelayedInput } from '@hoorah/protocol';
import type { GameResult, HoorahGame } from '@hoorah/sdk';
import type * as Phaser from 'phaser';
import { celebrate } from '../../shared/confetti';
import { cpuSkill, isCpu, reportSoloResult, soloOpponents } from '../common/cpu';
import { fieldSkills, Sensors, SnakeBrain, TAKEOVER_SKILL } from './brain';
import { GameClock } from './clock';
import { FEED_MS, GO_MS, koFlourish, leadFlourish, warningFlourish } from './effects';
import type { BoardRow, Hud, HudState, Overlay, PodiumPlace } from './hud';
import { type PadCommand, PadInputs } from './input';
import { panelRect } from './layout';
import { type ArenaEvent, ArenaMatch, type Snake } from './logic';
import { MIRROR_MS, MirrorFeed } from './mirror';
import { buildResult, soloOutcome } from './results';
import { type ArenaScene, HEAD_SCALE } from './scene';
import { formatClock, STR } from './strings';
import { viewFor } from './views';

/** Opponents for someone playing alone. */
const SOLO_OPPONENTS = 4;
const HUD_MS = 100;
const VIEW_MS = 250;
const WARN_SHOW_MS = 2200;
const SFX_EAT_MS = 80;
const SFX_BIG_MS = 120;
const SFX_BOOST_MS = 260;

export class Driver {
  readonly match: ArenaMatch;
  private readonly clock = new GameClock();
  private readonly sensors = new Sensors();
  private readonly cpus: PlayerInfo[];
  private readonly brains = new Map<number, SnakeBrain>();
  /** People whose phone dropped; a brain steers their snake until they return. */
  private readonly takeover = new Set<number>();
  private readonly online = new Set<number>();
  private readonly pads = new PadInputs();
  private readonly applyPad = (id: number, cmd: PadCommand): void => {
    this.match.setStick(id, cmd.x, cmd.y, cmd.boost);
  };
  private readonly sent = new Map<number, string>();
  private result: GameResult | null = null;
  private ended = false;
  private reported = false;
  private lastT = 0;
  private lastHud = Number.NEGATIVE_INFINITY;
  private lastViews = Number.NEGATIVE_INFINITY;
  private warnAt = Number.NEGATIVE_INFINITY;
  private readonly lastSfx = new Map<string, number>();
  private readonly pt = { x: 0, y: 0 };
  private readonly mirror = new MirrorFeed();
  private lastMirror = Number.NEGATIVE_INFINITY;
  /** Something a far-away screen should see at once happened this frame. */
  private mirrorNow = false;
  private stageW = 1280;
  private stageH = 720;

  constructor(
    private readonly game: HoorahGame,
    private readonly scene: ArenaScene,
    private readonly hud: Hud,
    private readonly phaser: Phaser.Game,
    roundMs: number,
    aspect: number,
  ) {
    this.match = new ArenaMatch({ roundMs, aspect });
    this.cpus = soloOpponents(game.players, SOLO_OPPONENTS);
    const skills = fieldSkills(cpuSkill(game.gameId), this.cpus.length);
    this.cpus.forEach((cpu, i) => {
      this.brains.set(cpu.id, new SnakeBrain(skills[i] ?? 0.5));
    });
    this.onPlayers();
  }

  start(): void {
    this.game.on('players', () => this.onPlayers());
    this.game.on('input', (input) => this.onInput(input));
    this.game.on('pause', (paused) => this.setHold('shell', paused));
    this.game.on('mirrors', (on) => {
      if (!on) return;
      this.mirror.resync();
      this.publishMirror(this.clock.now(), true);
    });
    this.phaser.events.on('hidden', () => this.setHold('hidden', true));
    this.phaser.events.on('visible', () => this.setHold('hidden', false));
    if (this.game.paused) this.setHold('shell', true);
    this.game.music('arena');
    this.lastT = this.clock.now();
    this.scene.onFrame = () => this.frame();
    this.sendViews();
  }

  /* ------------------------------------------------------------------ SDK events */

  private setHold(reason: string, on: boolean): void {
    if (on) this.clock.hold(reason);
    else this.clock.release(reason);
    const paused = this.clock.paused;
    this.hud.setPaused(paused);
    if (paused) this.phaser.pause();
    else this.phaser.resume();
    // No frames run while paused, so tell a far-away screen right here.
    this.publishMirror(this.clock.now(), true);
  }

  private onPlayers(): void {
    const all = this.game.allPlayers;
    this.updateTakeover(all);
    this.match.setPlayers(this.cpus.length ? [...all, ...this.cpus] : all);
    const present = new Set<number>();
    for (const p of all) {
      present.add(p.id);
      if (p.connected && !this.online.has(p.id)) {
        this.online.add(p.id);
        this.sent.delete(p.id);
        this.sendView(p.id);
      } else if (!p.connected) {
        this.online.delete(p.id);
        this.pads.delete(p.id);
      }
    }
    for (const id of this.online) if (!present.has(id)) this.online.delete(id);
    this.lastHud = Number.NEGATIVE_INFINITY;
  }

  /** Brains cover dropped phones once the round is underway, and step aside on reconnect. */
  private updateTakeover(all: readonly PlayerInfo[]): void {
    const present = new Set<number>();
    for (const p of all) {
      present.add(p.id);
      if (p.connected) {
        if (this.takeover.delete(p.id)) {
          this.brains.delete(p.id);
          this.match.setInput(p.id, 0, false);
        }
        continue;
      }
      if (this.takeover.has(p.id) || !this.match.snake(p.id)) continue;
      this.takeover.add(p.id);
      this.brains.set(p.id, new SnakeBrain(TAKEOVER_SKILL));
    }
    for (const id of this.takeover) {
      if (present.has(id)) continue;
      this.takeover.delete(id);
      this.brains.delete(id);
    }
  }

  private onInput(input: RelayedInput & { atMs: number }): void {
    if (this.ended || this.takeover.has(input.from) || isCpu(input.from)) return;
    const cmd = this.pads.frame(input.from, input.op, input.buttons, this.clock.now());
    if (cmd) this.applyPad(input.from, cmd);
  }

  /* ------------------------------------------------------------------ frame */

  private frame(): void {
    if (this.ended) return;
    const t = this.clock.now();
    const dt = t - this.lastT;
    this.lastT = t;
    const m = this.match;
    this.pads.releaseStale(t, this.applyPad);
    if (m.phase === 'play') {
      for (const [id, brain] of this.brains) {
        const s = m.snake(id);
        if (!s || s.gone) continue;
        const cmd = brain.update(m, s, this.sensors);
        m.setInput(id, cmd.turn, cmd.boost);
      }
    }
    m.update(dt);
    const events = m.drainEvents();
    for (let i = 0; i < events.length; i++) {
      const e = events[i]!;
      this.mirror.note(e);
      this.onEvent(e, t);
    }
    this.publishMirror(t, this.mirrorNow);
    this.mirrorNow = false;
    if (this.ended) return;
    this.placeTags();
    if (t - this.lastViews >= VIEW_MS) {
      this.lastViews = t;
      this.sendViews();
    }
    if (t - this.lastHud >= HUD_MS) {
      this.lastHud = t;
      this.hud.setState(this.hudState(t));
      this.hud.pruneFeed(t, FEED_MS);
    }
  }

  private sfx(name: string, gapMs = 0): void {
    const t = this.clock.now();
    if (gapMs > 0 && t - (this.lastSfx.get(name) ?? Number.NEGATIVE_INFINITY) < gapMs) return;
    this.lastSfx.set(name, t);
    this.game.sfx(name);
  }

  /** Vibrate a real, connected phone (never a computer snake or a covered seat). */
  private buzz(id: number, pattern: number | number[]): void {
    if (this.online.has(id) && !this.takeover.has(id)) this.game.vibrate(id, pattern);
  }

  private onEvent(e: ArenaEvent, t: number): void {
    const m = this.match;
    switch (e.type) {
      case 'phase':
        this.lastHud = Number.NEGATIVE_INFINITY;
        this.mirrorNow = true;
        if (e.phase === 'podium') {
          this.sfx('win');
          celebrate();
        } else if (e.phase === 'done') {
          this.finish();
        }
        this.sendViews();
        return;
      case 'count':
        this.sfx('count');
        this.mirrorNow = true;
        this.sendViews();
        return;
      case 'go':
        this.sfx('go');
        this.mirrorNow = true;
        this.sendViews();
        return;
      case 'spawn': {
        this.scene.onSpawn(e.id, e.x, e.y);
        if (m.phase === 'play') {
          this.sfx('ready', 200);
          const s = m.snake(e.id);
          if (s && e.first) this.hud.pushFeed(STR.feedJoin(s.name), s.color, t);
          this.buzz(e.id, [30, 40, 30]);
        }
        this.sendView(e.id);
        return;
      }
      case 'eat':
        this.scene.onEat(e.id, e.x, e.y, e.value, e.color);
        // Burst seeds get a brighter blip than the everyday ones.
        if (e.value >= 3) this.sfx('select', SFX_BIG_MS);
        else this.sfx('tick', SFX_EAT_MS);
        return;
      case 'boost':
        if (e.on) {
          this.scene.onBoost(e.id);
          this.sfx('boost', SFX_BOOST_MS);
        }
        return;
      case 'ko':
        this.onKo(e, t);
        return;
      case 'removed':
        this.scene.onRemoved(e.id);
        return;
      case 'lead': {
        const s = m.snake(e.id);
        if (!s) return;
        this.sfx('ding', 600);
        leadFlourish(this.scene, this.hud, s, t);
        return;
      }
      case 'warning':
        this.warnAt = t;
        this.sfx('tension');
        warningFlourish(this.scene);
        return;
      case 'tick':
        this.sfx('count');
        return;
      case 'timeUp':
        this.scene.urgent = false;
        this.sfx('whistle');
        window.setTimeout(() => this.game.sfx('cheer'), 350);
        this.result = this.finalResult();
        this.reportSolo(this.result);
        this.mirrorNow = true;
        this.sendViews();
        return;
    }
  }

  private onKo(e: Extract<ArenaEvent, { type: 'ko' }>, t: number): void {
    const m = this.match;
    const killer = e.by === null ? undefined : m.snake(e.by);
    koFlourish(this.scene, this.hud, e, m.snake(e.id), killer, t);
    this.mirrorNow = true;
    this.sfx('hit', 90);
    if (e.len >= 60) this.sfx('explode', 300);
    this.buzz(e.id, [80, 40, 160]);
    if (e.cause === 'body' && killer) {
      this.buzz(killer.id, 40);
      this.sendView(killer.id);
    }
    this.sendView(e.id);
  }

  /* ------------------------------------------------------------------ result */

  private finalResult(): GameResult {
    const result = buildResult(this.match.standings());
    const ids = new Set(result.ranking.map((r) => r.playerId));
    const cpus = this.cpus.filter((c) => ids.has(c.id));
    return cpus.length ? { ...result, cpuPlayers: cpus } : result;
  }

  /** Teach the remembered skill how the lone player did, once per match. */
  private reportSolo(result: GameResult): void {
    if (this.reported || this.cpus.length === 0) return;
    const people = this.match.field().filter((s) => !isCpu(s.id));
    if (people.length !== 1) return;
    const outcome = soloOutcome(result, people[0]!.id);
    if (!outcome) return;
    this.reported = true;
    reportSoloResult(this.game.gameId, outcome);
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    this.game.end(this.result ?? this.finalResult());
  }

  /* ------------------------------------------------------------------ phones */

  private sendViews(): void {
    if (this.online.size === 0) return;
    const order = this.match.order();
    for (const id of this.online) {
      const i = order.findIndex((s) => s.id === id);
      this.sendViewWith(id, i + 1, order.length);
    }
  }

  private sendView(id: number): void {
    if (!this.online.has(id)) return;
    const order = this.match.order();
    const i = order.findIndex((s) => s.id === id);
    this.sendViewWith(id, i + 1, order.length);
  }

  private sendViewWith(id: number, rank: number, total: number): void {
    if (!this.online.has(id) || this.takeover.has(id)) return;
    const view = viewFor(this.match, id, Math.max(1, rank), Math.max(1, total), this.result);
    const key = JSON.stringify(view);
    // Identical views are never re-sent (a reconnect clears the memory first).
    if (this.sent.get(id) === key) return;
    this.sent.set(id, key);
    this.game.setView(id, view);
  }

  /* ------------------------------------------------------------------ HUD */

  private placeTags(): void {
    const m = this.match;
    const all = m.all;
    const s = this.scene.view.s;
    const showNames = m.phase === 'intro' || m.phase === 'countdown' || m.phase === 'play';
    for (let i = 0; i < 16; i++) {
      const sn: Snake | undefined = all[i];
      if (!sn || !showNames || !sn.alive || sn.gone || !sn.inMatch) {
        this.hud.tag(i, false, 0, 0, '', '', false);
        continue;
      }
      const p = this.scene.toStage(sn.x, sn.y, this.pt);
      const lift = sn.radius * HEAD_SCALE * s + 6;
      this.hud.tag(i, true, p.x, p.y - lift, sn.name, sn.color, m.leaderId === sn.id);
    }
  }

  private rows(): BoardRow[] {
    const m = this.match;
    return m.order().map((s) => ({
      id: s.id,
      name: s.name,
      look: s.look,
      color: s.color,
      len: m.shown(s.len),
      kos: s.kos,
      alive: s.alive,
      back: s.alive ? 0 : Math.ceil(m.respawnLeft(s) / 1000),
      leader: m.leaderId === s.id,
      connected: isCpu(s.id) || s.connected,
    }));
  }

  private podium(): PodiumPlace[] {
    return this.match
      .standings()
      .slice(0, 3)
      .map((r) => ({
        id: r.snake.id,
        name: r.snake.name,
        look: r.snake.look,
        color: r.snake.color,
        rank: r.rank,
        len: r.final,
        kos: r.snake.kos,
      }));
  }

  private overlay(t: number): Overlay {
    const m = this.match;
    switch (m.phase) {
      case 'intro':
        return { kind: 'intro' };
      case 'countdown':
        return { kind: 'count', value: Math.max(1, m.countValue) };
      case 'play': {
        const left = m.timeLeft();
        if (m.now - m.playStart < GO_MS) return { kind: 'go' };
        if (left <= 5000) return { kind: 'final', value: Math.max(1, Math.ceil(left / 1000)) };
        if (t - this.warnAt < WARN_SHOW_MS) return { kind: 'warning' };
        return { kind: 'none' };
      }
      case 'over':
        return { kind: 'timeUp' };
      default: {
        const res = this.result ?? this.finalResult();
        return { kind: 'podium', title: res.title, sub: res.subtitle ?? '', places: this.podium() };
      }
    }
  }

  private hudState(t: number): HudState {
    const m = this.match;
    const v = this.scene.view;
    return {
      timer: formatClock(m.timeLeft()),
      urgent: m.phase === 'play' && m.timeLeft() <= m.tuning.warnMs,
      rows: this.rows(),
      overlay: this.overlay(t),
      panel: panelRect(this.stageW, this.stageH),
      arena: { x: v.x, y: v.y, w: v.w, h: v.h },
    };
  }

  /* ------------------------------------------------------------------ long-distance play */

  /** The stage for far-away screens, throttled unless `now` is set. */
  private publishMirror(t: number, now: boolean): void {
    if (!this.game.mirrored) return;
    if (!now && t - this.lastMirror < MIRROR_MS) return;
    this.lastMirror = t;
    this.game.publish(
      this.mirror.pack({
        match: this.match,
        server: this.game.now(),
        overlay: this.overlay(t),
        held: this.clock.paused,
      }),
    );
  }

  setStage(w: number, h: number): void {
    this.stageW = w;
    this.stageH = h;
    this.lastHud = Number.NEGATIVE_INFINITY;
  }
}
