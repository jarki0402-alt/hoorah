/**
 * Glue between the Hoorah SDK, the pure session (logic.ts + world.ts), the Phaser scene and the
 * DOM HUD: phone input, Host menu actions, sounds, adaptive music, phone views (throttled and
 * deduplicated), the stage picker memory (best stars per stage on this screen) and the result.
 * In long-distance play it also publishes the display state for far-away main screens.
 */
import { lookOfFruit, type PlayerInfo, type RelayedInput } from '@hoorah/protocol';
import type { GameResult, HoorahGame, MusicIntensity } from '@hoorah/sdk';
import type * as Phaser from 'phaser';
import { celebrate } from '../../shared/confetti';
import { loadJson, saveJson } from '../common/store';
import { GameClock } from './clock';
import { type FxEvent, isFx, showEffect } from './effects';
import type { Hud, HudState } from './hud';
import { hudOf } from './hudstate';
import { type StickCommand, StickInputs } from './input';
import { LEVELS } from './levels';
import { type MatchEvent, type Person, type Progress, secondLook, WarnaMatch } from './logic';
import { MIRROR_MS, MirrorFeed } from './mirror';
import { buildResult } from './results';
import type { CharLook, WarnaScene } from './scene';
import { resultView, type ViewContext, viewFor } from './views';
import type { World, WorldEvent } from './world';

const HUD_MS = 100;

function loadProgress(): Progress {
  const raw = loadJson<unknown>(PROGRESS_KEY, {});
  const out: Progress = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [id, v] of Object.entries(raw)) {
    if (typeof v === 'number' && Number.isFinite(v) && LEVELS.some((l) => l.id === id))
      out[id] = Math.max(0, Math.min(3, Math.floor(v)));
  }
  return out;
}
const VIEW_MS = 300;
const TIP_S = 12;
/** Stars per stage on this screen (v2: world stages, owner 2026-11-22). */
const PROGRESS_KEY = 'warna.progress.v2';
/** The opening that shows the exits lasts into play this long (s). */
const GOAL_PLAY_S = 2;

export class Driver {
  readonly match: WarnaMatch;
  private readonly clock = new GameClock();
  private readonly pads = new StickInputs();
  private readonly online = new Set<number>();
  private readonly sent = new Map<number, string>();
  private readonly lastSfx = new Map<string, number>();
  private attached: World | null = null;
  private result: GameResult | null = null;
  private ended = false;
  private lastT = 0;
  private lastHud = Number.NEGATIVE_INFINITY;
  private lastViews = Number.NEGATIVE_INFINITY;
  private tipFrom = 0;
  private intensity: MusicIntensity = 0;
  /** Long-distance play: effect numbering, last publish, and the number of the stage on screen. */
  private readonly mirror = new MirrorFeed();
  private lastMirror = Number.NEGATIVE_INFINITY;
  private serial = 0;
  private readonly apply = (id: number, cmd: StickCommand): void => this.match.setStick(id, cmd.x, cmd.jump);

  constructor(
    private readonly game: HoorahGame,
    private readonly scene: WarnaScene,
    private readonly hud: Hud,
    private readonly phaser: Phaser.Game,
  ) {
    // A free main screen sends `limited: true`; a missing setting keeps every stage open.
    this.match = new WarnaMatch(loadProgress(), game.settings.limited === true);
    this.onPlayers();
  }

  start(): void {
    this.game.on('players', () => this.onPlayers());
    this.game.on('input', (input) => this.onInput(input));
    this.game.on('action', (from, a) => this.onAction(from, a.id, a.value));
    this.game.on('pause', (paused) => this.setHold('shell', paused));
    this.game.on('mirrors', (on) => {
      if (on) this.publishMirror(true);
    });
    this.phaser.events.on('hidden', () => this.setHold('hidden', true));
    this.phaser.events.on('visible', () => this.setHold('hidden', false));
    if (this.game.paused) this.setHold('shell', true);
    this.game.music('warna');
    this.game.musicIntensity(0);
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
    this.publishMirror(true);
  }

  private people(all: readonly PlayerInfo[]): Person[] {
    return all.map((p) => ({
      id: p.id,
      name: p.name,
      fruit: p.fruit,
      look: p.look,
      color: p.color,
      connected: p.connected,
    }));
  }

  private onPlayers(): void {
    const all = this.game.allPlayers;
    this.match.setPeople(this.people(all));
    for (const p of all) {
      if (p.connected && !this.online.has(p.id)) {
        this.online.add(p.id);
        this.sent.delete(p.id);
      } else if (!p.connected) {
        this.online.delete(p.id);
        this.pads.delete(p.id);
        this.match.setStick(p.id, 0, false);
      }
    }
    for (const id of this.online) if (!all.some((p) => p.id === id)) this.online.delete(id);
    this.lastHud = Number.NEGATIVE_INFINITY;
    this.sendViews();
  }

  private hostId(): number | null {
    return this.game.players.find((p) => p.isHost)?.id ?? this.game.players[0]?.id ?? null;
  }

  private nameOf(id: number | null): string {
    if (id === null) return 'Host';
    return this.game.player(id)?.name ?? 'Host';
  }

  private onAction(from: number, id: string, value?: string): void {
    if (this.ended) return;
    const m = this.match;
    const host = from === this.hostId();
    switch (id) {
      case 'pick':
        if (!host || typeof value !== 'string') break;
        if (m.pickStep === 'world' ? m.pickWorld(value.replace(/^w:/, '')) : m.pickLevel(value))
          this.sfx('select');
        break;
      case 'next':
        if (host && m.toLevels()) this.sfx('select');
        break;
      case 'back':
        if (host && m.toWorlds()) this.sfx('back');
        break;
      case 'start':
        if (host && m.phase === 'select') m.start();
        break;
      // After a level (owner 2026-11-23): play on, pick another level, or end with the result.
      case 'go-next':
        if (host && m.playNext()) this.sfx('select');
        break;
      case 'go-map':
        if (host && m.toMap()) this.sfx('back');
        break;
      case 'go-done':
        if (host) m.finish();
        break;
      case 'hint':
        m.hint(from);
        break;
      case 'skip':
        if (host) m.skip();
        break;
      case 'swap':
        m.swap(from);
        break;
      case 'ping':
        m.ping(from);
        break;
      case 'restart':
        m.restart(from);
        break;
      default:
        return;
    }
    this.drain();
    this.sendViews();
    this.publishMirror(true);
  }

  private onInput(input: RelayedInput & { atMs: number }): void {
    if (this.ended) return;
    const cmd = this.pads.frame(input.from, input.op, input.buttons, this.clock.now());
    if (cmd) this.apply(input.from, cmd);
  }

  /* ------------------------------------------------------------------ frame */

  private frame(): void {
    if (this.ended) return;
    const t = this.clock.now();
    const dt = Math.min(250, t - this.lastT);
    this.lastT = t;
    this.pads.releaseStale(t, this.apply);
    this.match.update(dt / 1000);
    this.drain();
    if (this.ended) return;
    const m = this.match;
    this.scene.setGoal(m.phase === 'intro' || (m.phase === 'play' && m.playT < GOAL_PLAY_S));
    this.scene.setHint(m.currentHint());
    if (t - this.lastViews >= VIEW_MS) {
      this.lastViews = t;
      this.sendViews();
    }
    if (t - this.lastHud >= HUD_MS) {
      this.lastHud = t;
      this.hud.setState(this.hudState());
      this.updateMusic();
    }
    this.publishMirror(false);
  }

  private drain(): void {
    const m = this.match;
    if (m.sim && m.sim !== this.attached) {
      this.attached = m.sim;
      this.serial++;
      this.mirror.newStage();
      this.scene.attach(m.sim, (key) => this.look(key));
    }
    let urgent = false;
    for (const e of m.drainEvents()) {
      this.onEvent(e);
      // Motion effects ride the regular packets; everything else goes out at once.
      const motion =
        e.type === 'world' && (e.e.type === 'jump' || e.e.type === 'land' || e.e.type === 'bounce');
      if (!motion && e.type !== 'vote' && e.type !== 'voteEnd') urgent = true;
    }
    if (urgent) this.publishMirror(true);
  }

  private look(key: number): CharLook {
    const m = this.match;
    const c = m.sim?.chars[key];
    const p = c ? m.person(c.owner) : undefined;
    const idle = Boolean(m.solo && c && c.sub !== m.steer);
    return {
      name: p?.name ?? '',
      look: (c?.sub === 1 ? secondLook(p?.look) : p?.look) ?? lookOfFruit('jeruk'),
      idle,
    };
  }

  private sfx(name: string, gapMs = 0): void {
    const t = this.clock.now();
    if (gapMs > 0 && t - (this.lastSfx.get(name) ?? Number.NEGATIVE_INFINITY) < gapMs) return;
    this.lastSfx.set(name, t);
    this.game.sfx(name);
  }

  private buzz(id: number, pattern: number | number[]): void {
    if (this.online.has(id)) this.game.vibrate(id, pattern);
  }

  private onEvent(e: MatchEvent): void {
    const m = this.match;
    switch (e.type) {
      case 'phase':
        this.lastHud = Number.NEGATIVE_INFINITY;
        if (e.phase === 'intro') this.sfx('round');
        else if (e.phase === 'play') {
          this.tipFrom = m.playT;
          this.sfx('go');
        } else if (e.phase === 'clear') this.onClear();
        else if (e.phase === 'done') this.finish();
        this.sendViews();
        return;
      case 'vote':
        this.sfx('tick');
        return;
      case 'voteEnd':
        return;
      case 'restart':
        this.sfx('back');
        this.tipFrom = 0;
        this.effect(e);
        return;
      case 'swap':
        this.sfx('select');
        this.sendViews();
        return;
      case 'ping':
        if (!m.sim?.chars[e.key]) return;
        this.sfx('bell', 250);
        this.effect(e);
        return;
      case 'stage':
        return;
      case 'hint':
        this.sfx(e.level === 1 ? 'select' : 'reveal');
        this.lastHud = Number.NEGATIVE_INFINITY;
        this.sendViews();
        return;
      case 'skip':
        this.sfx('back');
        this.effect(e);
        this.saveProgress();
        return;
      case 'world':
        this.onWorld(e.e);
        return;
    }
  }

  /** Plays an effect on this screen and keeps it for far-away screens. */
  private effect(e: FxEvent): void {
    showEffect(this.scene, this.hud, this.match.sim, e);
    if (this.game.mirrored) this.mirror.note(e);
  }

  private onWorld(e: WorldEvent): void {
    const w = this.match.sim;
    if (!w) return;
    if (isFx(e)) this.effect(e);
    switch (e.type) {
      case 'jump':
        this.sfx('jump', 70);
        return;
      case 'land':
        if (e.hard) this.sfx('drop', 120);
        return;
      case 'die': {
        this.sfx('splash', 120);
        const c = w.chars[e.key];
        if (c) this.buzz(c.owner, [60, 40, 60]);
        this.sendViews();
        return;
      }
      case 'respawn':
        this.sfx('ready', 120);
        this.sendViews();
        return;
      case 'gem': {
        this.sfx('ding');
        const c = w.chars[e.key];
        if (c) this.buzz(c.owner, 30);
        return;
      }
      case 'checkpoint':
        this.sfx('correct');
        return;
      case 'plate':
        this.sfx(e.on ? 'tick' : 'tock', 80);
        return;
      case 'lever':
        this.sfx('tock');
        return;
      case 'door':
        if (e.open) this.sfx('reveal', 300);
        else this.sfx('drop', 300);
        return;
      case 'lift':
        this.sfx('pull', 400);
        return;
      case 'push':
        this.sfx('pull', 500);
        return;
      case 'exit': {
        this.sfx(e.first ? 'select' : 'correct', 120);
        const c = w.chars[e.key];
        if (c) this.buzz(c.owner, 25);
        this.sendViews();
        return;
      }
      case 'bounce':
        this.sfx('jump', 70);
        return;
      case 'assist':
        this.sfx('reveal', 300);
        return;
      case 'clear':
        return;
    }
  }

  private saveProgress(): void {
    saveJson(PROGRESS_KEY, this.match.progress);
  }

  private onClear(): void {
    const s = this.match.lastScore();
    this.sfx('stinger-win');
    window.setTimeout(() => this.game.sfx('cheer'), 400);
    if (!s?.skipped) celebrate();
    this.saveProgress();
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    const ids = this.match.cast.length ? [...this.everyone()] : this.game.allPlayers.map((p) => p.id);
    this.result = buildResult(this.match, ids);
    for (const id of this.online) {
      const chips = (this.result.awards ?? []).filter((a) => a.playerId === id).map((a) => a.title);
      this.game.setView(id, resultView(this.match, id, chips));
    }
    this.game.musicIntensity(0);
    this.game.end(this.result);
  }

  /** Everyone who played at least one stage. */
  private everyone(): number[] {
    const ids: number[] = [];
    for (const [id, t] of this.match.tallies) {
      const played = t.jumps + t.deaths + t.gems + t.pushed + t.helped + t.firstIn > 0;
      if (played || this.match.inCast(id)) ids.push(id);
    }
    return ids;
  }

  /* ------------------------------------------------------------------ music */

  private updateMusic(): void {
    const m = this.match;
    let level: MusicIntensity = 0;
    if (m.phase === 'play' && m.sim) {
      const active = m.sim.chars.filter((c) => c.active);
      const inside = active.filter((c) => c.inExit).length;
      level = inside >= active.length - 1 && active.length > 1 ? 3 : inside * 2 >= active.length ? 2 : 1;
    } else if (m.phase === 'clear') level = 3;
    else if (m.phase === 'next') level = 2;
    else if (m.phase === 'intro') level = 1;
    if (level !== this.intensity) {
      this.intensity = level;
      this.game.musicIntensity(level);
    }
  }

  /* ------------------------------------------------------------------ phones */

  private ctx(): ViewContext {
    const host = this.hostId();
    return { hostId: host, hostName: this.nameOf(host), progress: this.match.progress };
  }

  /** Sends every phone its view; identical views are never re-sent (a reconnect clears the memory). */
  private sendViews(): void {
    if (this.ended) return;
    const ctx = this.ctx();
    for (const id of this.online) {
      const view = viewFor(this.match, id, ctx);
      const key = JSON.stringify(view);
      if (this.sent.get(id) === key) continue;
      this.sent.set(id, key);
      this.game.setView(id, view);
    }
  }

  /* ------------------------------------------------------------------ HUD */

  private hudState(): HudState {
    const m = this.match;
    const score = m.lastScore();
    return hudOf({
      phase: m.phase,
      pickStep: m.pickStep,
      world: m.world,
      pick: m.pick,
      level: m.level,
      progress: m.progress,
      limited: m.limited,
      host: this.nameOf(this.hostId()),
      playT: m.playT,
      nextLeft: m.nextLeft(),
      tip: this.tipShown(),
      hint: m.currentHint(),
      vote: m.phase === 'play' && m.voteLeft > 0 ? { count: m.votes.size, need: m.voteNeed() } : null,
      score: score ?? null,
      solo: m.solo,
      sim: m.sim,
      look: (key) => this.look(key),
      color: (owner) => this.colorOf(owner),
    });
  }

  private tipShown(): boolean {
    const m = this.match;
    return m.phase === 'play' && m.playT - this.tipFrom < TIP_S;
  }

  private colorOf(owner: number): string {
    return this.match.person(owner)?.color ?? '#FFFFFF';
  }

  /* ------------------------------------------------------------------ long-distance play */

  /** The display state for far-away screens, throttled unless `now` is set. */
  private publishMirror(now: boolean): void {
    // The last state (phase done) still goes out after the end: no more frames follow it.
    if (!this.game.mirrored) return;
    const t = this.clock.now();
    if (!now && t - this.lastMirror < MIRROR_MS) return;
    this.lastMirror = t;
    this.game.publish(
      this.mirror.pack({
        match: this.match,
        server: this.game.now(),
        serial: this.serial,
        host: this.nameOf(this.hostId()),
        held: this.clock.paused,
        tip: this.tipShown(),
        look: (key) => this.look(key),
        color: (owner) => this.colorOf(owner),
      }),
    );
  }
}
