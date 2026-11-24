/**
 * Glue between the Hoorah SDK, the pure match, the Phaser scene and the DOM HUD: phone input
 * (swipe frames -> hops), computer runners, sounds, adaptive music, phone views (throttled and
 * deduplicated) and the HUD state.
 *
 * Computer runners (PRD 6.4): a lone player gets three that look like normal players. With two or
 * more people there are none, but the same brain steers a runner whose phone dropped.
 *
 * Long-distance play: while a far-away main screen watches, the match judges swipes at the
 * phone's stamp (`NyebrangMatch.far`) and the display state is published about 15 times a second
 * during a run (4 otherwise, at once on events, actions and pauses), see `mirror.ts`.
 */
import {
  lookOfFruit,
  PAD_ACTION,
  PAD_DOWN,
  PAD_LEFT,
  PAD_RIGHT,
  PAD_UP,
  type PlayerInfo,
  type RelayedInput,
  u16Delta,
} from '@hoorah/protocol';
import type { GameResult, HoorahGame, MusicIntensity } from '@hoorah/sdk';
import type * as Phaser from 'phaser';
import { celebrate } from '../../shared/confetti';
import { cpuSkill, isCpu, reportSoloResult, soloOpponents } from '../common/cpu';
import { submitRecord } from '../common/records';
import { fieldSkills, HopBrain, TAKEOVER_SKILL } from './brain';
import { StageEffects } from './effects';
import type { BoardRow, Hud, Overlay, ScoreRow } from './hud';
import { type Dir, type NyebrangEvent, NyebrangMatch, type Runner, TUNING } from './logic';
import { MIRROR_IDLE_MS, MIRROR_LIVE_MS, toMirror } from './mirror';
import { buildResult, soloOutcome } from './results';
import type { NyebrangScene, RunnerLook } from './scene';
import { formatClock, STR } from './strings';
import { viewFor } from './views';

const SOLO_OPPONENTS = 3;
const HUD_MS = 100;
const VIEW_MS = 200;
const HOP_SFX_MS = 70;
const BANNER_MS = 1300;
const GAME_ID = 'nyebrang';

export class Driver {
  readonly match: NyebrangMatch;
  private readonly cpus: PlayerInfo[];
  private readonly brains = new Map<number, HopBrain>();
  private readonly looks = new Map<number, RunnerLook>();
  private readonly lastTaps = new Map<number, number>();
  private readonly online = new Set<number>();
  private readonly sent = new Map<number, string>();
  private paused = false;
  private ended = false;
  private lastHud = Number.NEGATIVE_INFINITY;
  private lastViews = Number.NEGATIVE_INFINITY;
  private lastHop = 0;
  private lastTick = -1;
  private hurry = false;
  private intensity: MusicIntensity = 0;
  private banner: { overlay: Overlay; until: number } | null = null;
  private record: string | null = null;
  private readonly hornAt = new Map<number, number>();
  private readonly fx: StageEffects;
  private lastMirror = Number.NEGATIVE_INFINITY;
  /** Server ms matching the match time `match.t` (taken each frame, and on pause and resume). */
  private anchor: number | null = null;
  private horns = 0;
  private hornRow = -1;

  constructor(
    private readonly game: HoorahGame,
    private readonly scene: NyebrangScene,
    private readonly hud: Hud,
    private readonly phaser: Phaser.Game,
    rounds: number,
    seed: number,
  ) {
    this.cpus = soloOpponents(game.players, SOLO_OPPONENTS);
    const skills = fieldSkills(cpuSkill(GAME_ID), this.cpus.length);
    this.cpus.forEach((cpu, i) => {
      this.brains.set(cpu.id, new HopBrain(skills[i] ?? 0.5));
    });
    this.match = new NyebrangMatch({ rounds, seed, runners: this.runnerList() });
    this.fx = new StageEffects(scene, hud);
    this.syncLooks();
  }

  start(): void {
    this.game.on('players', () => this.onPlayers());
    this.game.on('input', (i) => this.onInput(i));
    this.game.on('action', (from, a) => {
      if (a.k === 'action') this.onAction(from, a.id, a.value);
    });
    this.game.on('pause', (p) => this.setPaused(p));
    this.match.far = this.game.mirrored;
    this.game.on('mirrors', (on) => {
      this.match.far = on;
      if (on) this.publishMirror(true);
    });
    this.phaser.events.on('hidden', () => this.setPaused(true));
    this.phaser.events.on('visible', () => this.setPaused(this.game.paused));
    if (this.game.paused) this.setPaused(true);
    this.game.music('nyebrang');
    this.scene.attach(this.match, this.looks);
    this.scene.onFrame = (ms) => this.frame(ms);
    this.onPlayers();
  }

  /* ------------------------------------------------------------------ roster */

  private runnerList() {
    return [...this.game.allPlayers, ...this.cpus].map((p) => ({ id: p.id, name: p.name, cpu: isCpu(p.id) }));
  }

  private info(id: number): PlayerInfo | undefined {
    return this.game.player(id) ?? this.cpus.find((c) => c.id === id);
  }

  private syncLooks(): void {
    for (const p of [...this.game.allPlayers, ...this.cpus])
      this.looks.set(p.id, { look: p.look, color: p.color });
    this.scene.setLooks(this.looks);
  }

  private hostId(): number | null {
    return this.game.players.find((p) => p.isHost)?.id ?? this.game.players[0]?.id ?? null;
  }

  private onPlayers(): void {
    this.match.setRunners(this.runnerList());
    this.syncLooks();
    for (const p of this.game.allPlayers) {
      if (p.connected && !this.online.has(p.id)) {
        this.online.add(p.id);
        this.sent.delete(p.id);
        this.lastTaps.delete(p.id);
      } else if (!p.connected) {
        this.online.delete(p.id);
      }
      const r = this.match.runner(p.id);
      if (!r) continue;
      if (!p.connected && !r.takeover) {
        this.match.setTakeover(p.id, true);
        this.brains.set(p.id, new HopBrain(TAKEOVER_SKILL));
      } else if (p.connected && r.takeover) {
        this.match.setTakeover(p.id, false);
        this.brains.delete(p.id);
      }
    }
    this.sendViews(true);
    this.publishMirror(true);
  }

  /* ------------------------------------------------------------------ input */

  private onInput(i: RelayedInput & { atMs: number }): void {
    // Long-distance play: how long ago the phone sent this (server clock), for judging at its stamp.
    const age = (this.game.now() - i.atMs) / 1000;
    if (this.match.far) this.match.setLag(i.from, age);
    const prev = this.lastTaps.get(i.from);
    const counter = i.taps & 0xffff;
    this.lastTaps.set(i.from, counter);
    if (this.paused) return;
    // The first frame seen from a phone is its first swipe: count it as one hop.
    const delta = prev === undefined ? 1 : u16Delta(prev, counter);
    // A big jump is a reconnect or a counter reset, not dozens of swipes.
    if (delta === 0 || delta > 30) return;
    let dir: Dir | null = null;
    if (i.buttons & PAD_LEFT) dir = 'left';
    else if (i.buttons & PAD_RIGHT) dir = 'right';
    else if (i.buttons & PAD_DOWN) dir = 'down';
    else if (i.buttons & (PAD_UP | PAD_ACTION)) dir = 'up';
    if (dir) this.match.input(i.from, dir, this.match.pressedAt(age));
  }

  private onAction(from: number, id: string, value: string | undefined): void {
    const m = this.match;
    const host = from === this.hostId();
    let events: NyebrangEvent[] = [];
    switch (id) {
      case 'pick':
        if (host && typeof value === 'string') m.pick(value);
        break;
      case 'next':
        if (host) events = m.next();
        break;
      case 'back':
        if (host) m.back();
        break;
      case 'start':
        if (host) events = m.start();
        break;
      case 'horn': {
        const r = m.runner(from);
        const last = this.hornAt.get(from) ?? 0;
        if (m.phase !== 'run' || r?.state !== 'out' || performance.now() - last < 1500) break;
        this.hornAt.set(from, performance.now());
        this.game.sfx('horn');
        const roads: number[] = [];
        for (let row = Math.floor(m.cam); row < m.cam + 10; row++)
          if (m.world.lane(row).kind === 'road') roads.push(row);
        const row = roads[Math.floor(Math.random() * roads.length)];
        if (row !== undefined) {
          this.scene.fxHorn(row);
          this.horns++;
          this.hornRow = row;
        }
        break;
      }
      default:
        return;
    }
    if (events.length) this.handle(events);
    this.updateHud(true);
    this.sendViews(true);
    this.publishMirror(true);
  }

  private setPaused(p: boolean): void {
    this.paused = p;
    this.hud.setPaused(p);
    if (p) this.phaser.pause();
    else this.phaser.resume();
    if (p && this.hurry) {
      this.hurry = false;
      this.game.musicHurry(false);
    }
    // No frames run while paused, so tell a far-away screen right here; match time goes on from now.
    this.anchor = this.game.now();
    this.publishMirror(true);
  }

  /* ------------------------------------------------------------------ frame */

  private frame(deltaMs: number): void {
    if (this.ended || this.paused) return;
    const m = this.match;
    for (const r of m.roster) {
      if (!r.cpu && !r.takeover) continue;
      const brain = this.brains.get(r.id);
      const dir = brain?.decide(m, r);
      if (dir) m.input(r.id, dir);
    }
    const events = m.step(deltaMs / 1000);
    this.anchor = this.game.now();
    if (events.length) this.handle(events);
    this.clockSounds();
    this.setMusic();
    this.fx.tags(m, (id) => {
      const r = m.runner(id);
      return r ? { name: r.name, color: this.looks.get(id)?.color ?? '#FFC928', dim: r.takeover } : null;
    });
    this.hud.tidy();
    const now = performance.now();
    if (now - this.lastHud >= HUD_MS) this.updateHud(false);
    if (now - this.lastViews >= VIEW_MS) this.sendViews(false);
    this.publishMirror(false);
  }

  private clockSounds(): void {
    const m = this.match;
    if (m.phase === 'count') {
      const s = Math.ceil(m.phaseLeft);
      if (s !== this.lastTick && s >= 1 && s <= 3) {
        this.lastTick = s;
        this.game.sfx('count');
      }
      return;
    }
    if (m.phase !== 'run') return;
    const left = m.timeLeft;
    const hurry = left <= 10;
    if (hurry !== this.hurry) {
      this.hurry = hurry;
      this.game.musicHurry(hurry);
    }
    const s = Math.ceil(left);
    if (s <= 5 && s >= 1 && s !== this.lastTick) {
      this.lastTick = s;
      this.game.sfx(s % 2 === 0 ? 'tock' : 'tick');
    }
  }

  private setMusic(): void {
    const m = this.match;
    let level: MusicIntensity = 0;
    if (m.phase === 'intro' || m.phase === 'count' || m.phase === 'roundEnd' || m.phase === 'final')
      level = 1;
    else if (m.phase === 'run') {
      const all = m.roster.length;
      const alive = m.roster.filter((r) => r.state === 'run').length;
      level = 1;
      if (m.level >= 3 || (m.mode === 'bertahan' && alive <= Math.ceil(all / 2))) level = 2;
      if (m.timeLeft <= 15 || (m.mode === 'bertahan' && all >= 3 && alive <= 2) || m.isFinal) level = 3;
    }
    if (level !== this.intensity) {
      this.intensity = level;
      this.game.musicIntensity(level);
    }
  }

  private flash(overlay: Overlay, ms = BANNER_MS): void {
    this.banner = { overlay, until: performance.now() + ms };
  }

  private handle(events: NyebrangEvent[]): void {
    const m = this.match;
    for (const e of events) {
      switch (e.type) {
        case 'phase':
          this.onPhase(e.phase);
          break;
        case 'hop': {
          const now = performance.now();
          if (now - this.lastHop > HOP_SFX_MS) {
            this.lastHop = now;
            this.game.sfx('jump');
          }
          const r = m.runner(e.id);
          if (r) this.fx.hop(e.id, r.x, StageEffects.dustRow(r.row, e.dir));
          else this.scene.landed(e.id);
          break;
        }
        case 'bump':
          this.scene.landed(e.id);
          break;
        case 'death': {
          const r = m.runner(e.id);
          if (!r) break;
          if (e.kind === 'water' || e.kind === 'drift') this.game.sfx('splash');
          else if (e.kind === 'edge') this.game.sfx('stinger-fall');
          else this.game.sfx(e.kind === 'train' ? 'explode' : 'hit');
          if (!isCpu(e.id)) this.game.vibrate(e.id, [80, 40, 80]);
          this.fx.death(e.kind, r.deathX, r.deathRow, m.mode);
          break;
        }
        case 'respawn':
          this.fx.respawn(e.id);
          break;
        case 'near': {
          this.game.sfx('perfect');
          if (!isCpu(e.id)) this.game.vibrate(e.id, 25);
          this.fx.near(e.x, e.row);
          break;
        }
        case 'finish': {
          const r = m.runner(e.id);
          this.game.sfx(e.place === 1 ? 'stinger-win' : 'correct');
          if (r) this.fx.finish(e.place, r.x, r.row);
          if (!isCpu(e.id)) this.game.vibrate(e.id, [30, 30, 60]);
          break;
        }
        case 'train':
          this.game.sfx('bell');
          break;
        case 'level':
          this.game.sfx('whistle');
          this.flash({ kind: 'banner', text: STR.levelUp, tone: 'yellow' });
          break;
        case 'last10':
          this.flash({ kind: 'banner', text: STR.last10, tone: 'red' });
          break;
      }
    }
    this.updateHud(true);
    this.sendViews(true);
    this.publishMirror(true);
  }

  private onPhase(phase: NyebrangMatch['phase']): void {
    const m = this.match;
    this.lastTick = -1;
    switch (phase) {
      case 'intro':
        this.record = null;
        this.game.sfx('round');
        break;
      case 'run':
        this.game.sfx('go');
        this.flash({ kind: 'go' }, 700);
        break;
      case 'roundEnd': {
        if (this.hurry) {
          this.hurry = false;
          this.game.musicHurry(false);
        }
        this.game.sfx('weker');
        window.setTimeout(() => {
          if (!this.ended) this.game.sfx('gong');
        }, 600);
        const humans = m.roster.filter((r) => !r.cpu);
        if (this.cpus.length > 0 && humans.length === 1) {
          const best = Math.max(0, humans[0]!.best - 1);
          const rec = submitRecord(GAME_ID, `${m.mode}-${m.map}`, best);
          this.record = rec.isNew ? STR.record : null;
        }
        break;
      }
      case 'final':
        this.game.sfx('win');
        window.setTimeout(celebrate, 300);
        break;
      case 'ended':
        this.finish();
        break;
      default:
        break;
    }
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    this.game.musicHurry(false);
    const result: GameResult = buildResult(this.match, this.cpus);
    const humans = this.game.allPlayers;
    if (this.cpus.length > 0 && humans.length === 1) {
      const outcome = soloOutcome(result, humans[0]!.id);
      if (outcome) reportSoloResult(GAME_ID, outcome);
    }
    this.game.end(result);
  }

  /* ------------------------------------------------------------------ HUD + views */

  private scoreRows(): ScoreRow[] {
    return this.match.standings().map(({ r, rank }) => {
      const look = this.looks.get(r.id);
      return {
        id: r.id,
        name: r.name,
        look: look?.look ?? lookOfFruit('jeruk'),
        color: look?.color ?? '#FFC928',
        dist: Math.max(0, r.best - 1),
        near: r.near,
        gained: r.gained,
        total: r.score,
        rank,
      };
    });
  }

  /** The centre overlay the HUD shows at `now` (performance ms). */
  private overlay(now: number): Overlay {
    const m = this.match;
    let overlay: Overlay = { kind: 'none' };
    switch (m.phase) {
      case 'setup': {
        const host = this.hostId();
        overlay = {
          kind: 'setup',
          step: m.setupStep,
          mode: m.mode,
          map: m.mapPick,
          host: host !== null ? (this.info(host)?.name ?? 'Host') : 'Host',
        };
        break;
      }
      case 'intro':
        overlay = {
          kind: 'intro',
          map: m.map,
          mode: m.mode,
          round: m.round + 1,
          rounds: m.rounds,
          final: m.isFinal,
        };
        break;
      case 'count':
        overlay = { kind: 'count', value: Math.max(1, Math.ceil(m.phaseLeft)) };
        break;
      case 'roundEnd': {
        const s = Math.ceil(m.phaseLeft);
        overlay = {
          kind: 'roundEnd',
          round: m.round + 1,
          rows: this.scoreRows(),
          next: m.round + 1 >= m.rounds ? STR.finalSoon(s) : STR.nextRound(s),
          record: this.record,
        };
        break;
      }
      case 'final':
      case 'ended':
        overlay = { kind: 'final', rows: this.scoreRows() };
        break;
      default:
        if (this.banner && now < this.banner.until) overlay = this.banner.overlay;
        break;
    }
    return overlay;
  }

  private updateHud(force: boolean): void {
    const now = performance.now();
    if (!force && now - this.lastHud < HUD_MS) return;
    this.lastHud = now;
    const m = this.match;
    const overlay = this.overlay(now);
    const rows: BoardRow[] = m.ranking().map((r: Runner) => {
      const look = this.looks.get(r.id);
      return {
        id: r.id,
        name: r.name,
        look: look?.look ?? lookOfFruit('jeruk'),
        color: look?.color ?? '#FFC928',
        dist: Math.max(0, r.best - 1),
        state: r.state,
        back: Math.max(1, Math.ceil(TUNING.respawnS - (m.t - r.deadAt))),
        place: r.place,
      };
    });
    const running = m.phase === 'run' || m.phase === 'count' || m.phase === 'intro';
    const danger = m.phase === 'run' && m.roster.some((r) => r.state === 'run' && r.row - m.cam < 1.2);
    this.hud.set({
      show: running,
      mode: m.mode,
      map: m.map,
      round: m.round + 1,
      rounds: m.rounds,
      final: m.isFinal,
      clock: formatClock(m.timeLeft),
      urgent: m.phase === 'run' && m.timeLeft <= 10,
      level: m.level,
      rows,
      overlay,
      hint: m.phase === 'run' && m.runT < 6,
      danger,
    });
  }

  private sendViews(force: boolean): void {
    const now = performance.now();
    if (!force && now - this.lastViews < VIEW_MS) return;
    this.lastViews = now;
    const ctx = {
      hostId: this.hostId(),
      name: (id: number) => this.info(id)?.name ?? '?',
      color: (id: number) => this.info(id)?.color ?? '#FFC928',
      guests: this.cpus.map((c) => ({
        id: c.id,
        name: c.name,
        fruit: c.fruit,
        look: c.look,
        color: c.color,
      })),
    };
    for (const p of this.game.players) {
      const view = viewFor(this.match, p.id, ctx);
      if (!view) continue;
      const key = JSON.stringify(view);
      if (this.sent.get(p.id) === key) continue;
      this.sent.set(p.id, key);
      this.game.setView(p.id, view);
    }
  }

  /* ------------------------------------------------------------------ long-distance play */

  /** The display state for a far-away screen, throttled unless `force` is set. */
  private publishMirror(force: boolean): void {
    if (!this.game.mirrored || this.ended) return;
    const now = performance.now();
    const m = this.match;
    if (!force && now - this.lastMirror < (m.phase === 'run' ? MIRROR_LIVE_MS : MIRROR_IDLE_MS)) return;
    this.lastMirror = now;
    this.game.publish(
      toMirror({
        server: this.anchor ?? this.game.now(),
        match: m,
        overlay: this.overlay(now),
        held: this.paused,
        look: (id) => this.looks.get(id) ?? { look: lookOfFruit('jeruk'), color: '#FFC928' },
        horns: this.horns,
        hornRow: this.hornRow,
      }),
    );
  }
}
