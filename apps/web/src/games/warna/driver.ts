/**
 * Glue between the Hoorah SDK, the pure session (logic.ts + world.ts), the Phaser scene and the
 * DOM HUD: phone input, Host menu actions, sounds, adaptive music, phone views (throttled and
 * deduplicated), the stage picker memory (best stars per stage on this screen) and the result.
 */
import { lookOfFruit, type PlayerInfo, type RelayedInput } from '@hoorah/protocol';
import type { GameResult, HoorahGame, MusicIntensity } from '@hoorah/sdk';
import type * as Phaser from 'phaser';
import { celebrate } from '../../shared/confetti';
import { loadJson, saveJson } from '../common/store';
import { GameClock } from './clock';
import type { Hud, HudState, LegendRow, Overlay } from './hud';
import { type StickCommand, StickInputs } from './input';
import { BIOMES, biomeOf, Cell, LEVELS, type Slot } from './levels';
import {
  canPlayLevel,
  type MatchEvent,
  needsPass,
  type Person,
  type Progress,
  secondLook,
  WarnaMatch,
  worldNeedsPass,
  worldStars,
} from './logic';
import { buildResult } from './results';
import type { CharLook, WarnaScene } from './scene';
import { BIOME_TEXT, formatClock, levelName, levelTip, STR } from './strings';
import { resultView, type ViewContext, viewFor } from './views';
import { TUNE, type World, type WorldEvent } from './world';

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
  }

  private drain(): void {
    const m = this.match;
    if (m.sim && m.sim !== this.attached) {
      this.attached = m.sim;
      this.scene.attach(m.sim, (key) => this.look(key));
    }
    for (const e of m.drainEvents()) this.onEvent(e);
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
        this.hud.float(STR.restarted, this.scene.ox + 640, this.scene.oy + 360, '#FFE27A');
        return;
      case 'swap':
        this.sfx('select');
        this.sendViews();
        return;
      case 'ping': {
        const c = m.sim?.chars[e.key];
        if (!c) return;
        this.sfx('bell', 250);
        const p = this.scene.toStage(c.x + TUNE.charW / 2, c.y);
        this.hud.float(STR.pingFloat, p.x, p.y - 74, '#FFFFFF');
        return;
      }
      case 'stage':
        return;
      case 'hint':
        this.sfx(e.level === 1 ? 'select' : 'reveal');
        this.lastHud = Number.NEGATIVE_INFINITY;
        this.sendViews();
        return;
      case 'skip':
        this.sfx('back');
        this.hud.float(STR.skipFloat, this.scene.ox + 640, this.scene.oy + 300, '#FFE27A');
        this.saveProgress();
        return;
      case 'world':
        this.onWorld(e.e);
        return;
    }
  }

  private onWorld(e: WorldEvent): void {
    const w = this.match.sim;
    if (!w) return;
    switch (e.type) {
      case 'jump':
        this.scene.onJump(e.key);
        this.sfx('jump', 70);
        return;
      case 'land':
        this.scene.onLand(e.key, e.hard);
        if (e.hard) this.sfx('drop', 120);
        return;
      case 'die': {
        this.scene.onDie(e.key, e.x, e.y);
        this.sfx('splash', 120);
        const c = w.chars[e.key];
        if (c) {
          this.buzz(c.owner, [60, 40, 60]);
          const p = this.scene.toStage(e.x, e.y);
          this.hud.float(STR.backFloat, p.x, p.y - 30, '#FFFFFF');
        }
        this.sendViews();
        return;
      }
      case 'respawn':
        this.scene.onRespawn(e.key);
        this.sfx('ready', 120);
        this.sendViews();
        return;
      case 'gem': {
        this.scene.onGem(e.gem);
        this.sfx('ding');
        const g = w.gems[e.gem];
        const c = w.chars[e.key];
        if (g) {
          const p = this.scene.toStage(g.x + 0.5, g.y);
          this.hud.float(STR.gemFloat, p.x, p.y - 8, '#FFE27A');
        }
        if (c) this.buzz(c.owner, 30);
        return;
      }
      case 'checkpoint': {
        this.scene.onCheckpoint(e.x, e.y);
        this.sfx('correct');
        const p = this.scene.toStage(e.x + 0.5, e.y);
        this.hud.float(STR.checkpointFloat, p.x, p.y - 12, '#FFE27A');
        return;
      }
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
        this.scene.onBounce(e.x, e.y);
        this.sfx('jump', 70);
        return;
      case 'assist':
        this.scene.onAssist(e.y, e.x0, e.x1);
        this.sfx('reveal', 300);
        return;
      case 'clear':
        this.scene.onClear();
        return;
    }
  }

  /** A plate that only moves a lift says so; others open doors. */
  private plateHint(target: string): string {
    const ch = Number(target.slice(2));
    const lv = this.match.level;
    const door = lv.meta.some((m, i) => m === ch && lv.cells[i] === Cell.Door);
    return !door && lv.lifts.some((l) => l.ch === ch) ? STR.hintLift : STR.hintPlate;
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

  private legend(): LegendRow[] {
    const m = this.match;
    const w = m.sim;
    if (!w) return [];
    const rows: LegendRow[] = [];
    for (let s = 0; s < w.colors; s++) {
      const people = w.chars
        .filter((c) => c.slot === s)
        .map((c) => {
          const look = this.look(c.key);
          return { name: look.name, look: look.look, color: m.person(c.owner)?.color ?? '#FFFFFF' };
        });
      rows.push({ slot: s as Slot, people });
    }
    return rows;
  }

  private overlay(): Overlay {
    const m = this.match;
    const worldName = BIOME_TEXT[m.level.biome].name;
    switch (m.phase) {
      case 'select': {
        const host = this.nameOf(this.hostId());
        if (m.pickStep === 'world') {
          return {
            kind: 'worlds',
            host,
            selected: m.world,
            worlds: BIOMES.map((b) => {
              const pass = b.ready && worldNeedsPass(b.id, m.limited);
              return {
                id: b.id,
                name: BIOME_TEXT[b.id].name,
                sub: pass ? STR.passSub : b.ready ? BIOME_TEXT[b.id].sub : STR.soon,
                ready: b.ready,
                pass,
                ...worldStars(b.id, m.progress),
              };
            }),
          };
        }
        const levels = biomeOf(m.world).levels;
        return {
          kind: 'journey',
          host,
          world: m.world,
          title: STR.screenLevelTitle(BIOME_TEXT[m.world].name),
          selected: LEVELS[m.pick]?.id ?? '',
          nodes: levels.map((lv) => ({
            id: lv.id,
            number: lv.number,
            name: levelName(lv.id),
            stars: m.progress[lv.id] ?? 0,
            done: m.progress[lv.id] !== undefined,
            open: canPlayLevel(lv, m.progress, m.limited),
            pass: needsPass(lv, m.limited),
          })),
        };
      }
      case 'intro':
        return {
          kind: 'intro',
          eyebrow: STR.worldLevel(worldName, m.level.number),
          name: levelName(m.level.id),
          tip: levelTip(m.level.id),
          goal: STR.goal,
          legend: this.legend(),
          solo: m.solo,
        };
      case 'clear':
      case 'next': {
        const s = m.lastScore();
        const next = m.nextLevel();
        const choosing = m.phase === 'next';
        const host = this.nameOf(this.hostId());
        return {
          kind: 'clear',
          eyebrow: STR.worldLevel(worldName, m.level.number),
          title: s?.skipped ? STR.skippedTitle : STR.clearTitle,
          stars: s?.skipped
            ? []
            : [
                { label: STR.starClear, on: true },
                { label: STR.starGems, on: Boolean(s?.starGems) },
                { label: STR.starTime(formatClock(m.level.par)), on: Boolean(s?.starTime) },
              ],
          time: s?.skipped ? STR.skippedNote : STR.clearTime(formatClock(s?.time ?? 0)),
          gems: s?.skipped ? '' : STR.clearGems(s?.gems ?? 0, s?.gemTotal ?? 0),
          next: !choosing
            ? next
              ? STR.nextStage(levelName(next.id))
              : m.nextNeedsPass()
                ? STR.passNext
                : STR.lastStage
            : next
              ? STR.nextIn(next.number, Math.ceil(m.nextLeft()), host)
              : m.nextNeedsPass()
                ? STR.passNextHost(host)
                : STR.worldDone(host),
        };
      }
      default:
        return { kind: 'none' };
    }
  }

  private hudState(): HudState {
    const m = this.match;
    const w = m.sim;
    const playing = m.phase === 'play' && w !== null;
    const chips = [];
    if (w) for (let s = 0; s < w.colors; s++) chips.push({ slot: s as Slot, ...w.exitCount(s as Slot) });
    const g = w?.allGems() ?? { taken: 0, total: 0 };
    const showTip = playing && m.playT - this.tipFrom < TIP_S;
    const hint = m.currentHint();
    const hintText = hint
      ? hint.kind === 'box'
        ? STR.hintBox
        : hint.kind === 'plate'
          ? this.plateHint(hint.target)
          : hint.kind === 'lever'
            ? STR.hintLever
            : STR.hintExit
      : '';
    return {
      show: m.phase === 'play' || m.phase === 'clear' || m.phase === 'next',
      stage: STR.worldLevel(BIOME_TEXT[m.level.biome].name, m.level.number),
      name: levelName(m.level.id),
      timer: formatClock(m.playT),
      gems: `${STR.hudGems} ${g.taken}/${g.total}`,
      chips,
      tip: hintText || (showTip ? levelTip(m.level.id) : ''),
      hint: Boolean(hintText),
      vote: playing && m.voteLeft > 0 ? `${STR.voteTitle} ${STR.voteCount(m.votes.size, m.voteNeed())}` : '',
      overlay: this.overlay(),
    };
  }
}
