/**
 * Glue between the Hoorah SDK, the pure Seluncur Es rules, the 3D stage and the DOM HUD: the
 * pause-aware clock, slingshot input (live aim frames + locked aims), computer skaters, sounds
 * and adaptive music, vibration, phone views and the final result.
 *
 * Fairness: an aim is locked on the phone and sent once; the main screen keeps taking locks for a
 * short grace after the countdown, so a slow connection never costs a shot.
 *
 * Long-distance play: with a `mirror` link the display state goes out about 13 times a second
 * while skaters aim, slide or fall, and at once on every event, so a far-away main screen draws
 * the same floe (mirror.ts, replica.ts). Flourishes go through show.ts and a numbered log.
 */
import {
  type ControllerToGame,
  type GuestPlayer,
  type PlayerInfo,
  parseAim,
  type RelayedInput,
  STICK_OP,
  sameLook,
  unpackStick,
} from '@hoorah/protocol';
import type { GameAward, GameResult, HoorahGame, MusicIntensity } from '@hoorah/sdk';
import { cpuSkill, isCpu, reportSoloResult, soloOpponents } from '../common/cpu';
import { GameClock } from '../dapur/clock';
import { boardOf, type Chip as HudChip, type HudStore } from './hud';
import type { EsEvent, EsMatch, PlayerInfo as Seat } from './logic';
import { EventLog, type MirrorLink, PUBLISH_MS, toMirror } from './mirror';
import { buildResult, pickAwards } from './results';
import type { EsScene } from './scene';
import { type ShowEvent, type ShowTarget, showCrack, showEvent } from './show';
import { STR } from './strings';
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
    .map((p) => ({ id: p.id, name: p.name, fruit: p.fruit, look: p.look, color: p.color, cpu: isCpu(p.id) }));
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
  /** Far-away main screens (long-distance play), null offline. */
  mirror: MirrorLink | null = null;
  private readonly log = new EventLog();
  private mirrorDirty = true;
  private lastPublish = Number.NEGATIVE_INFINITY;
  private readonly target: ShowTarget;

  constructor(
    private readonly game: GameLike,
    private readonly m: EsMatch,
    private readonly cpus: PlayerInfo[],
    private readonly scene: EsScene,
    private readonly hud: HudStore,
    private readonly due: (now: number) => boolean = () => true,
  ) {
    this.target = {
      hud,
      scene,
      chip: (id) => this.chip(id),
      posOf: (id) => {
        const p = this.m.player(id);
        return p ? { x: p.pos.x, y: p.pos.y } : null;
      },
    };
  }

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
    return this.cpus.map((c) => ({ id: c.id, name: c.name, fruit: c.fruit, look: c.look, color: c.color }));
  }

  private chip(id: number): HudChip | null {
    const p = this.m.player(id);
    return p ? { id, name: p.name, fruit: p.fruit, look: p.look, color: p.color } : null;
  }

  private syncLooks(): void {
    this.scene.setPlayers(
      this.m.players.map((p) => ({ id: p.id, name: p.name, fruit: p.fruit, look: p.look, color: p.color })),
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
    if (was !== this.clock.paused) this.publishNow();
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
          m.addPlayer({ id: p.id, name: p.name, fruit: p.fruit, look: p.look, color: p.color, cpu: false });
        continue;
      }
      if (p.connected && this.takeover.delete(p.id)) m.setAuto(p.id, false);
      else if (!p.connected && !this.takeover.has(p.id)) {
        this.takeover.add(p.id);
        m.setAuto(p.id, true);
      }
      if (c.name !== p.name || c.color !== p.color || c.fruit !== p.fruit || !sameLook(c.look, p.look))
        m.restyle(p.id, { name: p.name, color: p.color, fruit: p.fruit, look: p.look });
    }
    this.syncLooks();
    this.drain();
    this.lastHud = Number.NEGATIVE_INFINITY;
    this.sendViews(true);
    this.mirrorDirty = true;
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
    // Read the clock again: events logged during this frame must not be newer than the state.
    if (!this.ended) this.flushMirror(this.clock.now());
  };

  private drain(): void {
    for (const e of this.m.drainEvents()) {
      // Locks and countdown seconds change nothing a far-away screen cannot wait 75 ms for.
      if (e.k !== 'lock' && e.k !== 'second') this.mirrorDirty = true;
      this.onEvent(e);
    }
  }

  /** Shows a flourish here and logs it for far-away screens. */
  private show(e: ShowEvent): void {
    this.log.push(e, this.clock.now() / 1000);
    showEvent(e, this.target);
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
            this.mirrorDirty = true;
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
        this.show({ k: 'launch' });
        this.game.sfx('go');
        for (const p of m.standing()) this.buzz(p.id, 60);
        this.sendViews(true);
        return;
      case 'hit': {
        this.show({ k: 'hit', at: e.at, speed: e.speed });
        this.game.sfx('hit');
        const strong = e.speed > 4 ? [70, 30, 70] : 45;
        this.buzz(e.a, strong);
        this.buzz(e.b, strong);
        return;
      }
      case 'fall': {
        if (!m.player(e.id)) return;
        this.show({ k: 'fall', id: e.id, by: e.by, crack: e.crack, at: e.at });
        window.setTimeout(() => this.game.sfx('splash'), 450);
        this.game.sfx('stinger-fall');
        this.buzz(e.id, [160, 60, 80]);
        this.sendView(e.id, true);
        return;
      }
      case 'nearMiss': {
        this.show({ k: 'nearMiss', id: e.id, gap: e.gap });
        this.game.sfx('perfect');
        this.buzz(e.id, 40);
        return;
      }
      case 'crack':
        this.scene.crack(e.from, e.to);
        showCrack(this.target);
        this.game.sfx('collapse');
        return;
      case 'roundEnd': {
        this.setHurry(false);
        this.setIntensity(0);
        this.hud.center.value = null;
        const winner = e.winner !== null ? m.player(e.winner) : undefined;
        if (winner) {
          this.show({ k: 'win', id: winner.id });
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
        if (top && !isCpu(top.id)) this.show({ k: 'party' });
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
    this.publishNow();
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

  /* ------------------------------------------------------------------ far-away screens */

  /** Sends the display state now (a far-away screen just connected, a pause, the end). */
  publishNow(): void {
    this.mirrorDirty = true;
    this.flushMirror(this.clock.now());
  }

  /** Periodic state while skaters aim, slide or fall; a change (event, players) goes at once. */
  private flushMirror(t: number): void {
    const link = this.mirror;
    if (!link?.active()) return;
    const ph = this.m.phase;
    const moving = ph === 'aim' || ph === 'slide' || ph === 'settle';
    const due = moving && !this.clock.paused && t - this.lastPublish >= PUBLISH_MS;
    if (!this.mirrorDirty && !due) return;
    this.mirrorDirty = false;
    this.lastPublish = t;
    const h = this.hud;
    link.send(
      toMirror({
        at: link.now(),
        t: t / 1000,
        paused: this.clock.paused,
        match: this.m,
        offline: (id) => this.offline(id),
        intro: h.intro.peek(),
        end: h.end.peek(),
        final: h.final.peek(),
        help: h.help.peek(),
        events: this.log.recent(t / 1000),
      }),
    );
  }

  /* ------------------------------------------------------------------ HUD */

  private offline(id: number): boolean {
    return !isCpu(id) && !this.online.has(id);
  }

  private pushHud(): void {
    const m = this.m;
    this.hud.setBoard(
      boardOf(
        m,
        m.roundCount,
        (p) => m.liveTotal(p),
        (id) => this.offline(id),
      ),
    );
  }
}
