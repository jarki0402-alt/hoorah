/**
 * Glue between the Hoorah SDK, the pure Seluncur Es rules, the 3D stage and the DOM HUD: the
 * pause-aware clock, slingshot input (live aim frames + locked aims), computer skaters, sounds
 * and adaptive music, vibration, phone views and the final result.
 *
 * Fairness: an aim is locked on the phone and sent once; the main screen keeps taking locks for a
 * short grace after the countdown, so a slow connection never costs a shot.
 */
import {
  type ControllerToGame,
  type GuestPlayer,
  type PlayerInfo,
  parseAim,
  type RelayedInput,
  STICK_OP,
  unpackStick,
} from '@hoorah/protocol';
import type { GameAward, GameResult, HoorahGame, MusicIntensity } from '@hoorah/sdk';
import { celebrate } from '../../shared/confetti';
import { cpuSkill, isCpu, reportSoloResult, soloOpponents } from '../common/cpu';
import { GameClock } from '../dapur/clock';
import type { ChipStatus, Chip as HudChip, HudStore } from './hud';
import type { EsEvent, EsMatch, PlayerInfo as Seat, Skater } from './logic';
import { buildResult, pickAwards } from './results';
import type { EsScene } from './scene';
import { formatGap, STR } from './strings';
import { viewFor } from './views';

const HUD_MS = 100;
const VIEW_MS = 250;

export type GameLike = Pick<
  HoorahGame,
  | 'allPlayers'
  | 'players'
  | 'player'
  | 'settings'
  | 'paused'
  | 'gameId'
  | 'on'
  | 'setView'
  | 'vibrate'
  | 'sfx'
  | 'music'
  | 'musicIntensity'
  | 'musicHurry'
  | 'end'
  | 'now'
>;

export const SOLO_OPPONENTS = 3;

/** The starting lineup: the people, plus computer opponents for someone playing alone. */
export function lineup(game: Pick<GameLike, 'players'>): { seats: Seat[]; cpus: PlayerInfo[] } {
  const humans = game.players;
  const cpus = soloOpponents(humans, SOLO_OPPONENTS);
  const seats = [...humans, ...cpus]
    .slice(0, 8)
    .map((p) => ({ id: p.id, name: p.name, fruit: p.fruit, color: p.color, cpu: isCpu(p.id) }));
  return { seats, cpus };
}

export class Director {
  private readonly clock = new GameClock();
  private readonly online = new Set<number>();
  private readonly sent = new Map<number, string>();
  private readonly takeover = new Set<number>();
  private titles = new Map<number, string>();
  private awards: GameAward[] = [];
  private result: GameResult | null = null;
  private ended = false;
  private lastFrame = -1;
  private lastHud = Number.NEGATIVE_INFINITY;
  private lastViews = Number.NEGATIVE_INFINITY;
  private intensity: MusicIntensity = 0;
  private hurry = false;
  /** Server time this shot's aiming closes (phones count down to it). */
  private deadline = 0;
  private raf = 0;
  private fpsFrames = 0;
  private fpsAt = 0;
  onFrame: ((now: number, running: boolean) => void) | null = null;
  onFps: ((fps: number) => void) | null = null;

  constructor(
    private readonly game: GameLike,
    private readonly m: EsMatch,
    private readonly cpus: PlayerInfo[],
    private readonly scene: EsScene,
    private readonly hud: HudStore,
    private readonly due: (now: number) => boolean = () => true,
  ) {}

  static skill(game: Pick<GameLike, 'gameId'>): number {
    return cpuSkill(game.gameId);
  }

  start(): void {
    for (const p of this.game.allPlayers) if (p.connected) this.online.add(p.id);
    this.game.on('players', () => this.onPlayers());
    this.game.on('input', (input) => this.onInput(input));
    this.game.on('action', (from, a) => this.onAction(from, a));
    this.game.on('pause', (paused) => this.setHold('shell', paused));
    document.addEventListener('visibilitychange', () => this.setHold('hidden', document.hidden));
    if (this.game.paused) this.setHold('shell', true);
    this.syncLooks();
    this.game.music('es');
    this.game.musicIntensity(0);
    this.drain();
    this.raf = requestAnimationFrame(this.loop);
  }

  get running(): boolean {
    return !this.clock.paused && (this.m.phase === 'aim' || this.m.phase === 'slide');
  }

  private guests(): GuestPlayer[] {
    return this.cpus.map((c) => ({ id: c.id, name: c.name, fruit: c.fruit, color: c.color }));
  }

  private chip(id: number): HudChip | null {
    const p = this.m.player(id);
    return p ? { id, name: p.name, fruit: p.fruit, color: p.color } : null;
  }

  private syncLooks(): void {
    this.scene.setPlayers(
      this.m.players.map((p) => ({ id: p.id, name: p.name, fruit: p.fruit, color: p.color })),
    );
  }

  /* ------------------------------------------------------------------ SDK events */

  private setHold(reason: string, on: boolean): void {
    const was = this.clock.paused;
    if (on) this.clock.hold(reason);
    else this.clock.release(reason);
    this.hud.paused.value = this.clock.paused;
    // The countdown on the phones restarts from what is left after a pause.
    if (was && !this.clock.paused && this.m.phase === 'aim') {
      this.stampDeadline();
      this.sendViews(true);
    }
  }

  private stampDeadline(): void {
    this.deadline = Math.round(this.game.now() + this.m.aimRemaining * 1000);
  }

  private onPlayers(): void {
    const all = this.game.allPlayers;
    const m = this.m;
    for (const p of all) {
      if (p.connected && !this.online.has(p.id)) {
        this.online.add(p.id);
        this.sent.delete(p.id);
      } else if (!p.connected) this.online.delete(p.id);
    }
    for (const c of [...m.players]) {
      if (isCpu(c.id)) continue;
      if (!all.some((p) => p.id === c.id)) {
        m.removePlayer(c.id);
        this.takeover.delete(c.id);
      }
    }
    for (const p of all) {
      const c = m.player(p.id);
      if (!c) {
        if (p.connected && m.phase !== 'final' && m.phase !== 'done' && m.players.length < 8)
          m.addPlayer({ id: p.id, name: p.name, fruit: p.fruit, color: p.color, cpu: false });
        continue;
      }
      if (p.connected && this.takeover.delete(p.id)) m.setAuto(p.id, false);
      else if (!p.connected && !this.takeover.has(p.id)) {
        this.takeover.add(p.id);
        m.setAuto(p.id, true);
      }
      if (c.name !== p.name || c.color !== p.color || c.fruit !== p.fruit)
        m.restyle(p.id, { name: p.name, color: p.color, fruit: p.fruit });
    }
    this.syncLooks();
    this.drain();
    this.lastHud = Number.NEGATIVE_INFINITY;
    this.sendViews(true);
  }

  private onInput(input: RelayedInput & { atMs: number }): void {
    if (this.ended || this.clock.paused || input.op !== STICK_OP) return;
    this.m.stream(input.from, unpackStick(input.buttons));
  }

  private onAction(from: number, a: ControllerToGame): void {
    if (a.k !== 'action' || this.ended || this.clock.paused || a.id !== 'aim') return;
    const aim = parseAim(a.value);
    if (aim && this.m.lock(from, aim)) {
      this.drain();
      this.sendViews(false);
    }
  }

  /* ------------------------------------------------------------------ frame */

  private readonly loop = (now: number): void => {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.due(now)) return;
    const t = this.clock.now();
    const dt = this.lastFrame < 0 ? 0 : Math.min(0.1, Math.max(0, (t - this.lastFrame) / 1000));
    this.lastFrame = t;
    if (!this.ended && dt > 0) {
      this.m.tick(dt);
      this.drain();
    }
    this.scene.frame(this.clock.paused ? 0 : dt);
    this.onFrame?.(now, this.running);
    this.fpsFrames++;
    if (now - this.fpsAt >= 1000) {
      this.onFps?.((this.fpsFrames * 1000) / (now - this.fpsAt));
      this.fpsFrames = 0;
      this.fpsAt = now;
    }
    if (t - this.lastHud >= HUD_MS) {
      this.lastHud = t;
      this.pushHud();
    }
    if (t - this.lastViews >= VIEW_MS) {
      this.lastViews = t;
      this.sendViews(false);
    }
  };

  private drain(): void {
    for (const e of this.m.drainEvents()) this.onEvent(e);
  }

  private setIntensity(level: MusicIntensity): void {
    if (level === this.intensity) return;
    this.intensity = level;
    this.game.musicIntensity(level);
  }

  private setHurry(on: boolean): void {
    if (on === this.hurry) return;
    this.hurry = on;
    this.game.musicHurry(on);
  }

  private buzz(id: number, pattern: number | number[]): void {
    if (this.online.has(id) && !isCpu(id) && !this.takeover.has(id)) this.game.vibrate(id, pattern);
  }

  private onEvent(e: EsEvent): void {
    const m = this.m;
    switch (e.k) {
      case 'round':
        this.hud.end.value = null;
        this.hud.center.value = null;
        this.hud.intro.value = {
          of: STR.roundCard(e.no, m.roundCount),
          name: STR.roundName(m.isFinal),
          desc: STR.roundDesc(m.isFinal),
          double: m.isFinal,
        };
        this.scene.resetRound();
        this.syncLooks();
        this.setHurry(false);
        this.setIntensity(0);
        this.game.sfx(m.isFinal ? 'gong' : 'round');
        this.sendViews(true);
        return;
      case 'aim':
        this.hud.intro.value = null;
        this.hud.help.value = m.round === 0 && e.shot === 1;
        if (this.hud.help.value)
          window.setTimeout(() => {
            this.hud.help.value = false;
          }, 6000);
        this.stampDeadline();
        this.setIntensity(m.isFinal || m.standing().length <= 2 ? 2 : 1);
        this.game.sfx('ready');
        for (const p of m.standing()) this.buzz(p.id, 40);
        this.sendViews(true);
        return;
      case 'second':
        this.game.sfx(e.left % 2 === 0 ? 'tick' : 'tock');
        this.setHurry(e.left <= 2);
        return;
      case 'timeUp':
        this.game.sfx('weker');
        return;
      case 'lock':
        this.game.sfx('select');
        return;
      case 'launch':
        this.setHurry(false);
        this.setIntensity(m.isFinal || m.standing().length <= 3 ? 3 : 2);
        this.hud.shout(STR.slideTitle);
        this.game.sfx('go');
        for (const p of m.standing()) this.buzz(p.id, 60);
        this.sendViews(true);
        return;
      case 'hit': {
        const s = this.scene.screenAt(e.at);
        if (s) this.hud.float(STR.hit, s.x, s.y, 'hit');
        this.scene.hit(e.at, e.speed);
        this.game.sfx('hit');
        const strong = e.speed > 4 ? [70, 30, 70] : 45;
        this.buzz(e.a, strong);
        this.buzz(e.b, strong);
        return;
      }
      case 'fall': {
        const p = m.player(e.id);
        if (!p) return;
        window.setTimeout(() => {
          const s = this.scene.screenAt(e.at, 0.6);
          if (s) this.hud.float(STR.splash, s.x, s.y, 'splash');
          this.scene.splash({ x: p.pos.x, y: p.pos.y });
          this.game.sfx('splash');
        }, 450);
        const by = e.by !== null ? m.player(e.by) : undefined;
        const who = this.chip(e.id) ?? undefined;
        if (by) this.hud.toast(STR.pushedOff(by.name, p.name), who);
        else if (e.crack) this.hud.toast(STR.crackToast(p.name), who);
        else this.hud.toast(STR.fallToast(p.name), who);
        this.game.sfx('stinger-fall');
        this.buzz(e.id, [160, 60, 80]);
        this.sendView(e.id, true);
        return;
      }
      case 'nearMiss': {
        const p = m.player(e.id);
        if (p) this.hud.flashBanner(STR.nearMiss(p.name, formatGap(e.gap)));
        this.game.sfx('perfect');
        this.buzz(e.id, 40);
        return;
      }
      case 'crack':
        this.scene.crack(e.from, e.to);
        this.hud.shout(STR.crack);
        this.game.sfx('collapse');
        return;
      case 'roundEnd': {
        this.setHurry(false);
        this.setIntensity(0);
        this.hud.center.value = null;
        const winner = e.winner !== null ? m.player(e.winner) : undefined;
        if (winner) {
          this.scene.celebrate(winner.id);
          this.game.sfx('cheer');
          this.buzz(winner.id, [40, 30, 40, 30, 80]);
        } else this.game.sfx('boo');
        this.hud.end.value = {
          title: winner ? STR.winnerRound(winner.name) : STR.nobodyRound,
          rows: m
            .contestants()
            .map((p) => ({ ...this.chip(p.id)!, points: e.points.get(p.id) ?? 0, winner: p.id === e.winner }))
            .sort((a, b) => b.points - a.points),
        };
        this.sendViews(true);
        return;
      }
      case 'final': {
        this.hud.end.value = null;
        this.awards = pickAwards(m.players);
        this.titles = new Map(this.awards.map((a) => [a.playerId, a.title]));
        this.result = buildResult(m, this.awards, this.cpus);
        this.hud.final.value = {
          cols: m.roundCount,
          rows: m
            .standings()
            .map((p, i) => ({ ...this.chip(p.id)!, rounds: p.rounds, total: p.total, rank: i + 1 })),
        };
        this.game.sfx('stinger-win');
        const top = m.standings()[0];
        if (top && !isCpu(top.id)) celebrate();
        this.sendViews(true);
        return;
      }
      case 'done':
        this.finish();
        return;
    }
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    const m = this.m;
    const result = this.result ?? buildResult(m, pickAwards(m.players), this.cpus);
    if (this.cpus.length > 0) {
      const human = m.players.find((p) => !isCpu(p.id));
      const top = m.standings()[0];
      if (human && top) reportSoloResult(this.game.gameId, top.id === human.id ? 'win' : 'lose');
    }
    this.game.music(null);
    this.sendViews(true);
    cancelAnimationFrame(this.raf);
    this.game.end(result);
  }

  /* ------------------------------------------------------------------ phones */

  private sendViews(force: boolean): void {
    for (const id of this.online) this.sendView(id, force);
  }

  private sendView(id: number, force: boolean): void {
    if (!this.online.has(id) || isCpu(id)) return;
    const view = viewFor({
      match: this.m,
      id,
      guests: this.guests(),
      titles: this.titles,
      deadline: this.deadline,
    });
    const key = JSON.stringify(view);
    if (!force && this.sent.get(id) === key) return;
    this.sent.set(id, key);
    this.game.setView(id, view);
  }

  /* ------------------------------------------------------------------ HUD */

  private status(p: Skater): ChipStatus {
    const m = this.m;
    if (!p.inRound) return 'wait';
    if (p.out || p.falling !== null) return 'out';
    if (m.phase === 'aim') return p.aim ? 'locked' : 'aiming';
    return 'safe';
  }

  private pushHud(): void {
    const m = this.m;
    const h = this.hud;
    h.round.value = STR.roundOf(m.round, m.roundCount);
    h.double.value = m.isFinal;
    const active = m.phase === 'aim' || m.phase === 'slide' || m.phase === 'settle';
    h.shot.value = active && m.shot > 0 ? STR.shotLine(m.shot, m.nextEdge < m.edge) : '';
    h.onIce.value = active ? `${m.standing().length}/${m.contestants().length}` : '';
    h.locks.value = m.phase === 'aim' ? STR.locked(m.locks()) : '';
    if (m.phase === 'aim') h.center.value = { mode: 'aim', seconds: Math.max(1, m.aimLeft) };
    else if (m.phase === 'slide') h.center.value = { mode: 'slide', seconds: 0 };
    else h.center.value = null;
    h.chips.value = m.players.map((p) => ({
      id: p.id,
      name: p.name,
      fruit: p.fruit,
      color: p.color,
      status: this.status(p),
      score: p.total + (active ? m.roundPoints(p) : 0),
      offline: !isCpu(p.id) && !this.online.has(p.id),
    }));
  }
}
