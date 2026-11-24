/**
 * Glue between the Hoorah SDK, the pure Lantai Runtuh rules, the 3D stage and the DOM HUD: the
 * pause-aware clock, input, computer contestants, sounds and adaptive music, vibration, phone
 * views and the final result.
 *
 * Computer contestants (PRD 6.4): exactly one person gets three opponents that look like normal
 * players; their skill adapts silently. A dropped phone keeps playing with the same brain.
 */
import {
  type ControllerToGame,
  type GuestPlayer,
  type PlayerInfo,
  type RelayedInput,
  STICK_OP,
  sameLook,
  unpackStick,
} from '@hoorah/protocol';
import type { GameAward, GameResult, HoorahGame, MusicIntensity } from '@hoorah/sdk';
import { celebrate } from '../../shared/confetti';
import { cpuSkill, isCpu, reportSoloResult, soloOpponents } from '../common/cpu';
import { GameClock } from '../dapur/clock';
import { COLOR_HEX } from './arena';
import { ContestantBrain, TAKEOVER_SKILL } from './brain';
import type { Chip, HudStore } from './hud';
import type { RuntuhEvent, RuntuhMatch, PlayerInfo as Seat } from './logic';
import { buildResult, pickAwards } from './results';
import type { RuntuhScene } from './scene';
import { formatGap, STR } from './strings';
import { viewFor } from './views';

const HUD_MS = 100;
const VIEW_MS = 250;
const CRACK_SFX_MS = 220;

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
  private readonly skill: number;
  private titles = new Map<number, string>();
  private awards: GameAward[] = [];
  private result: GameResult | null = null;
  private ended = false;
  private lastFrame = -1;
  private lastHud = Number.NEGATIVE_INFINITY;
  private lastViews = Number.NEGATIVE_INFINITY;
  private lastCrack = Number.NEGATIVE_INFINITY;
  private intensity: MusicIntensity = 0;
  private hurry = false;
  private raf = 0;
  private fpsFrames = 0;
  private fpsAt = 0;
  onFrame: ((now: number, running: boolean) => void) | null = null;
  onFps: ((fps: number) => void) | null = null;

  constructor(
    private readonly game: GameLike,
    private readonly m: RuntuhMatch,
    private readonly cpus: PlayerInfo[],
    private readonly scene: RuntuhScene,
    private readonly hud: HudStore,
    private readonly due: (now: number) => boolean = () => true,
  ) {
    this.skill = cpuSkill(game.gameId);
  }

  start(): void {
    for (const p of this.game.allPlayers) if (p.connected) this.online.add(p.id);
    for (const p of this.m.players) if (p.cpu) this.m.setPilot(p.id, new ContestantBrain(this.skill));
    this.game.on('players', () => this.onPlayers());
    this.game.on('input', (input) => this.onInput(input));
    this.game.on('action', (from, a) => this.onAction(from, a));
    this.game.on('pause', (paused) => this.setHold('shell', paused));
    document.addEventListener('visibilitychange', () => this.setHold('hidden', document.hidden));
    if (this.game.paused) this.setHold('shell', true);
    this.syncLooks();
    this.game.music('runtuh');
    this.game.musicIntensity(0);
    this.drain();
    this.raf = requestAnimationFrame(this.loop);
  }

  get running(): boolean {
    return !this.clock.paused && this.m.phase === 'play';
  }

  private guests(): GuestPlayer[] {
    return this.cpus.map((c) => ({ id: c.id, name: c.name, fruit: c.fruit, look: c.look, color: c.color }));
  }

  private chip(id: number): Chip | null {
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
    if (on) this.clock.hold(reason);
    else this.clock.release(reason);
    this.hud.paused.value = this.clock.paused;
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
      if (p.connected && this.takeover.delete(p.id)) m.setPilot(p.id, null);
      else if (!p.connected && !this.takeover.has(p.id)) {
        this.takeover.add(p.id);
        m.setPilot(p.id, new ContestantBrain(TAKEOVER_SKILL));
      }
      if (c.name !== p.name || c.color !== p.color || c.fruit !== p.fruit || !sameLook(c.look, p.look))
        m.restyle(p.id, { name: p.name, color: p.color, fruit: p.fruit, look: p.look });
    }
    this.syncLooks();
    this.lastHud = Number.NEGATIVE_INFINITY;
    this.sendViews(true);
  }

  private onInput(input: RelayedInput & { atMs: number }): void {
    if (this.ended || this.clock.paused) return;
    if (input.op === STICK_OP) {
      const s = unpackStick(input.buttons);
      this.m.steer(input.from, s.x, s.y);
    }
  }

  private onAction(from: number, a: ControllerToGame): void {
    if (a.k !== 'action' || this.ended || this.clock.paused) return;
    if (a.id === 'push') this.m.push(from);
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
    this.scene.frame(this.m.alpha, this.clock.paused ? 0 : dt);
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

  private floatAbove(id: number, text: string): void {
    const s = this.scene.players.screenOf(id);
    if (s) this.hud.float(text, s.x, s.y);
  }

  private onEvent(e: RuntuhEvent): void {
    const m = this.m;
    const fx = this.scene.fx;
    switch (e.k) {
      case 'round':
        this.hud.end.value = null;
        this.hud.intro.value = {
          of: STR.roundOf(e.no, m.rules.length),
          name: STR.rules[e.rule].name,
          desc: STR.rules[e.rule].desc,
          double: m.isFinal,
        };
        this.scene.players.setTags(false);
        this.setHurry(false);
        this.setIntensity(0);
        this.game.sfx(m.isFinal ? 'gong' : 'round');
        this.sendViews(true);
        return;
      case 'play':
        this.hud.intro.value = null;
        this.scene.players.setTags(true);
        this.hud.shout(STR.go);
        this.hud.help.value = m.round === 0;
        window.setTimeout(() => {
          this.hud.help.value = false;
        }, 7000);
        this.game.sfx('go');
        this.setIntensity(m.isFinal ? 2 : 1);
        for (const id of this.online) this.buzz(id, 50);
        this.sendViews(true);
        return;
      case 'call':
        this.game.sfx(m.rule === 'gelap' ? 'tension' : 'reveal');
        this.setIntensity(m.isFinal || e.index >= 2 ? 3 : 2);
        this.sendViews(true);
        return;
      case 'second':
        this.game.sfx(e.left % 2 === 0 ? 'tick' : 'tock');
        return;
      case 'drop':
        this.hud.shout(STR.drop);
        this.game.sfx('collapse');
        this.setIntensity(m.isFinal ? 2 : 1);
        return;
      case 'reveal':
        this.scene.flashReveal();
        return;
      case 'restore':
        this.sendViews(true);
        return;
      case 'wave':
        this.game.sfx(m.rule === 'gelombang' ? 'tension' : 'tock');
        return;
      case 'crack': {
        const t = this.clock.now();
        if (t - this.lastCrack > CRACK_SFX_MS) {
          this.lastCrack = t;
          this.game.sfx('tick');
        }
        return;
      }
      case 'vanish': {
        const s = m.sim.solids[e.tile];
        const f = m.faces[e.tile];
        if (s && f) {
          const p = m.sim.pose(s.id);
          fx.debris(p.x, p.y + s.def.half.y, p.z, s.def.half.x * 2, s.def.half.z * 2, COLOR_HEX[f.color]);
        }
        return;
      }
      case 'fall': {
        const p = m.player(e.id);
        if (p) fx.fall(e.at.x, Math.max(-1, e.at.y), e.at.z, p.color);
        const next = m.round + 1 < m.rules.length ? m.round + 1 : null;
        const by = e.by !== null ? m.player(e.by) : undefined;
        if (p) {
          if (by) this.hud.toast(STR.pushedOff(by.name, p.name), 'bad', this.chip(e.id) ?? undefined);
          else this.hud.toast(STR.fallToast(p.name, next), 'bad', this.chip(e.id) ?? undefined);
        }
        this.game.sfx('stinger-fall');
        this.buzz(e.id, [160, 60, 80]);
        this.sendView(e.id, true);
        return;
      }
      case 'push':
        this.floatAbove(e.id, e.target !== null ? STR.pushFloat : STR.whiff);
        this.game.sfx(e.target !== null ? 'hit' : 'throw');
        if (e.target !== null) {
          const b = m.sim.body(e.target);
          if (b) fx.dust(b.pos.x, b.pos.y, b.pos.z, 0.8);
          this.buzz(e.target, [60, 30, 60]);
        }
        return;
      case 'nearMiss': {
        const p = m.player(e.id);
        if (p) this.hud.flashBanner(STR.nearMiss(p.name, formatGap(e.gap)));
        this.game.sfx('perfect');
        this.buzz(e.id, 40);
        return;
      }
      case 'roundEnd': {
        this.setHurry(false);
        this.setIntensity(0);
        const alive = m.alive().length;
        this.game.sfx(alive > 0 ? 'cheer' : 'boo');
        this.hud.end.value = {
          title: STR.roundDone,
          sub: STR.survivors(alive),
          rows: m.players.map((p) => ({
            ...this.chip(p.id)!,
            points: e.points.get(p.id) ?? 0,
            survived: !p.out,
          })),
        };
        for (const p of m.players) if (!p.out) this.buzz(p.id, [40, 30, 40]);
        this.sendViews(true);
        return;
      }
      case 'final': {
        this.hud.end.value = null;
        this.awards = pickAwards(m.players);
        this.titles = new Map(this.awards.map((a) => [a.playerId, a.title]));
        this.result = buildResult(m, this.awards, this.cpus);
        this.hud.final.value = {
          cols: m.rules.length,
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
    const view = viewFor({ match: this.m, id, guests: this.guests(), titles: this.titles });
    const key = JSON.stringify(view);
    if (!force && this.sent.get(id) === key) return;
    this.sent.set(id, key);
    this.game.setView(id, view);
  }

  /* ------------------------------------------------------------------ HUD */

  private pushHud(): void {
    const m = this.m;
    const h = this.hud;
    h.round.value = STR.roundOf(m.round, m.rules.length);
    h.alive.value = STR.alive(m.alive().length, m.players.length);
    h.scores.value = m.standings().map((p) => ({
      id: p.id,
      name: p.name,
      fruit: p.fruit,
      look: p.look,
      color: p.color,
      score: p.total + (m.phase === 'play' ? m.roundPoints(p) : 0),
      out: m.phase === 'play' && p.out,
      offline: !isCpu(p.id) && !this.online.has(p.id),
    }));
    if (m.phase !== 'play') return;
    const c = m.call;
    const left = m.secondsLeft;
    // The last 10 seconds of a long round speed the music up a little.
    if (!c) this.setHurry(left > 0 && left <= 10);
    let head = '';
    let target = STR.ruleLive[m.rule] ?? STR.rules[m.rule].name;
    let tint: string | null = null;
    if (c) {
      if (m.callStage === 'show') {
        target = STR.callDarkShow;
      } else if (m.rule === 'gelap') {
        target = STR.callDarkCount;
      } else {
        head = c.sum ? STR.callSum : STR.callHead;
        target = STR.callTarget(c);
        tint = c.color ? COLOR_HEX[c.color] : null;
      }
    }
    h.rule.value = {
      title: STR.roundTitle(m.round, m.rule),
      head,
      target,
      tint,
      seconds: left > 0 && (!c || m.callStage === 'count' || m.callStage === 'show') ? Math.ceil(left) : null,
      double: m.isFinal,
    };
  }
}
