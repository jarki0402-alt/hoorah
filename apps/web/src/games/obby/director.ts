/**
 * Glue between the Hoorah SDK, the pure Obby rules, the 3D scene and the DOM HUD: the pause-aware
 * clock, input, computer runners, sounds and adaptive music, vibration, phone views and the final
 * result.
 *
 * Computer runners (PRD 6.4): exactly one person gets three opponents that look like normal
 * players; their skill adapts silently. A dropped phone's runner keeps going with the same brain
 * until it reconnects.
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
import { RunnerBrain, TAKEOVER_SKILL } from './brain';
import type { HudStore, RunnerChip, StandRow } from './hud';
import { type ObbyEvent, ObbyMatch, type RacerInfo, TIMING } from './logic';
import { buildResult, pickAwards } from './results';
import type { ObbyScene } from './scene';
import { formatClock, formatGap, formatTime, STR } from './strings';
import { viewFor } from './views';

const HUD_MS = 100;
const VIEW_MS = 250;
const SOLO_OPPONENTS = 3;
const CRACK_SFX_MS = 160;

/** The subset of the SDK the director needs (a demo stand-in implements it too). */
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

export class Director {
  private readonly clock = new GameClock();
  private match!: ObbyMatch;
  private cpus: PlayerInfo[] = [];
  private readonly online = new Set<number>();
  private readonly sent = new Map<number, string>();
  private readonly takeover = new Set<number>();
  private readonly fellAt = new Map<number, number>();
  private readonly skill: number;
  private awards: GameAward[] = [];
  private titles = new Map<number, string>();
  private result: GameResult | null = null;
  private ended = false;
  private lastFrame = -1;
  private lastHud = Number.NEGATIVE_INFINITY;
  private lastViews = Number.NEGATIVE_INFINITY;
  private lastCrack = Number.NEGATIVE_INFINITY;
  private intensity: MusicIntensity = 0;
  private hurry = false;
  private raf = 0;
  /** Called every rendered frame (quality ladder) and with the fps once a second. */
  onFrame: ((now: number, running: boolean) => void) | null = null;
  onFps: ((fps: number) => void) | null = null;
  private fpsFrames = 0;
  private fpsAt = 0;

  constructor(
    private readonly game: GameLike,
    private readonly scene: ObbyScene,
    private readonly hud: HudStore,
    /** Frame pacing (skips frames when capped at 30 fps). */
    private readonly due: (now: number) => boolean = () => true,
  ) {
    this.skill = cpuSkill(game.gameId);
  }

  start(): void {
    const humans = this.game.players;
    this.cpus = soloOpponents(humans, SOLO_OPPONENTS);
    for (const p of this.game.allPlayers) if (p.connected) this.online.add(p.id);
    const racers: RacerInfo[] = [...humans, ...this.cpus].slice(0, 8).map((p) => this.info(p));
    const tracks = Number(this.game.settings.rounds);
    this.match = new ObbyMatch({
      racers,
      tracks: Number.isFinite(tracks) && tracks > 0 ? tracks : 3,
      seed: Math.floor(Math.random() * 0x7fffffff),
      aspect: this.scene.stage.aspect,
    });
    for (const r of racers) if (r.cpu) this.match.setPilot(r.id, new RunnerBrain(this.skill));
    this.game.on('players', () => this.onPlayers());
    this.game.on('input', (input) => this.onInput(input));
    this.game.on('action', (from, a) => this.onAction(from, a));
    this.game.on('pause', (paused) => this.setHold('shell', paused));
    document.addEventListener('visibilitychange', () => this.setHold('hidden', document.hidden));
    if (this.game.paused) this.setHold('shell', true);
    this.syncLooks();
    this.game.music('obby');
    this.setIntensity(0);
    this.drain();
    this.raf = requestAnimationFrame(this.loop);
  }

  get running(): boolean {
    return !this.clock.paused && this.match?.phase === 'race';
  }

  private info(p: PlayerInfo): RacerInfo {
    return { id: p.id, name: p.name, fruit: p.fruit, look: p.look, color: p.color, cpu: isCpu(p.id) };
  }

  private chip(id: number): RunnerChip | null {
    const r = this.match.racer(id);
    return r ? { id, name: r.name, fruit: r.fruit, look: r.look, color: r.color } : null;
  }

  private guests(): GuestPlayer[] {
    return this.cpus.map((c) => ({ id: c.id, name: c.name, fruit: c.fruit, look: c.look, color: c.color }));
  }

  private syncLooks(): void {
    this.scene.setPlayers(
      this.match.racers.map((r) => ({
        id: r.id,
        name: r.name,
        fruit: r.fruit,
        look: r.look,
        color: r.color,
      })),
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
    const m = this.match;
    for (const p of all) {
      if (p.connected && !this.online.has(p.id)) {
        this.online.add(p.id);
        this.sent.delete(p.id);
      } else if (!p.connected) this.online.delete(p.id);
    }
    for (const r of [...m.racers]) {
      if (isCpu(r.id)) continue;
      if (!all.some((p) => p.id === r.id)) {
        m.removeRacer(r.id);
        this.takeover.delete(r.id);
      }
    }
    for (const p of all) {
      const r = m.racer(p.id);
      if (!r) {
        if (p.connected && m.phase !== 'done' && m.racers.length < 8) m.addRacer(this.info(p));
        continue;
      }
      if (p.connected && this.takeover.delete(p.id)) m.setPilot(p.id, null);
      else if (!p.connected && !this.takeover.has(p.id)) {
        this.takeover.add(p.id);
        m.setPilot(p.id, new RunnerBrain(TAKEOVER_SKILL));
      }
      if (r.name !== p.name || r.color !== p.color || r.fruit !== p.fruit || !sameLook(r.look, p.look))
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
      this.match.steer(input.from, s.x, s.y);
    }
  }

  private onAction(from: number, a: ControllerToGame): void {
    if (a.k !== 'action' || this.ended || this.clock.paused) return;
    if (a.id === 'jump') this.match.jump(from);
  }

  /* ------------------------------------------------------------------ frame */

  private readonly loop = (now: number): void => {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.due(now)) return;
    const t = this.clock.now();
    const dt = this.lastFrame < 0 ? 0 : Math.min(0.1, Math.max(0, (t - this.lastFrame) / 1000));
    this.lastFrame = t;
    const m = this.match;
    if (!this.ended && dt > 0) {
      m.tick(dt);
      this.drain();
    }
    this.scene.frame(m, this.clock.paused ? 0 : dt);
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
    for (const e of this.match.drainEvents()) this.onEvent(e);
  }

  private setIntensity(level: MusicIntensity): void {
    if (level === this.intensity && level !== 0) return;
    this.intensity = level;
    this.game.musicIntensity(level);
  }

  private setHurry(on: boolean): void {
    if (on === this.hurry) return;
    this.hurry = on;
    this.game.musicHurry(on);
  }

  private floatAbove(id: number, text: string, tone: 'good' | 'bad' | 'info'): void {
    const s = this.scene.players?.screenOf(id);
    if (s) this.hud.float(text, s.x, s.y, tone);
  }

  private buzz(id: number, pattern: number | number[]): void {
    if (this.online.has(id) && !isCpu(id) && !this.takeover.has(id)) this.game.vibrate(id, pattern);
  }

  private onEvent(e: ObbyEvent): void {
    const m = this.match;
    const fx = this.scene.fx;
    switch (e.k) {
      case 'track': {
        this.scene.load(m);
        this.hud.podium.value = null;
        this.hud.intro.value = {
          name: STR.trackName(e.no),
          of: STR.trackOf(e.no, m.tracks),
          level: STR.levelName[m.course.level],
          segments: m.course.segments.map((s) => STR.segments[s.kind]),
        };
        this.hud.brand.value = STR.trackBrand(e.no, m.tracks);
        const span = Math.max(1, m.course.finishX - m.course.startX);
        this.hud.saves.value = m.course.saves.slice(1).map((s) => (s.pos.x - m.course.startX) / span);
        this.scene.players?.setTags(false);
        this.setHurry(false);
        this.setIntensity(0);
        this.game.sfx('round');
        this.sendViews(true);
        return;
      }
      case 'count':
        this.hud.intro.value = null;
        this.scene.players?.setTags(true);
        this.hud.shout(String(e.value), 'count');
        this.game.sfx('count');
        this.sendViews(true);
        return;
      case 'go':
        this.hud.shout(STR.go, 'go');
        this.hud.help.value = m.trackNo === 0;
        window.setTimeout(() => {
          this.hud.help.value = false;
        }, 7000);
        this.game.sfx('go');
        this.setIntensity(1);
        for (const id of this.online) this.buzz(id, 60);
        this.sendViews(true);
        return;
      case 'jump':
        if (!isCpu(e.id)) this.game.sfx('jump');
        return;
      case 'land': {
        const b = m.sim.body(e.id);
        if (b) fx.dust(b.pos.x, b.pos.y, b.pos.z, Math.min(1.6, e.speed / 10));
        this.game.sfx('drop');
        return;
      }
      case 'spring': {
        const b = m.sim.body(e.id);
        if (b) fx.dust(b.pos.x, b.pos.y, b.pos.z, 0.8, '#FFF7F0');
        this.floatAbove(e.id, STR.springFloat, 'info');
        this.game.sfx('boost');
        this.buzz(e.id, 30);
        return;
      }
      case 'sweep':
        this.floatAbove(e.id, STR.sweepFloat, 'bad');
        this.game.sfx('hit');
        this.buzz(e.id, [70, 30, 70]);
        return;
      case 'bump':
        this.game.sfx('pull');
        return;
      case 'crack': {
        const t = this.clock.now();
        if (t - this.lastCrack > CRACK_SFX_MS) {
          this.lastCrack = t;
          this.game.sfx('tock');
        }
        return;
      }
      case 'vanish': {
        const s = m.sim.solids[e.solid];
        if (s) {
          const p = m.sim.pose(s.id);
          fx.debris(p.x, p.y + s.def.half.y, p.z, s.def.half.x * 2, s.def.half.z * 2, '#FFD84D');
        }
        this.scene.resetTile(e.solid);
        return;
      }
      case 'save': {
        const r = m.racer(e.id);
        const b = m.sim.body(e.id);
        if (r && b) fx.sparkle(b.pos.x, b.pos.y, b.pos.z, r.color);
        if (r) this.hud.toast(STR.saveToast(r.name, e.index, m.course.saves.length - 1), r);
        this.game.sfx('lap');
        this.buzz(e.id, 40);
        // The music rises with the race.
        const lead = Math.max(...m.racers.map((o) => m.progress(o)));
        if (!this.hurry) this.setIntensity(lead > 0.5 ? 2 : 1);
        this.sendView(e.id, true);
        return;
      }
      case 'fall': {
        const r = m.racer(e.id);
        if (r) fx.fall(e.at.x, Math.max(e.at.y, m.course.killY + 3), e.at.z, r.color);
        this.fellAt.set(e.id, this.clock.now());
        if (m.phase === 'race') {
          this.game.sfx('splash');
          this.buzz(e.id, [120, 40, 60]);
          const b = m.sim.body(e.id);
          if (r && b) window.setTimeout(() => fx.sparkle(b.pos.x, b.pos.y, b.pos.z, r.color), 50);
        }
        this.sendView(e.id, true);
        return;
      }
      case 'pulled': {
        const r = m.racer(e.id);
        const b = m.sim.body(e.id);
        if (r && b) fx.sparkle(b.pos.x, b.pos.y, b.pos.z, r.color);
        if (r) this.hud.toast(STR.pulledToast(r.name), r);
        this.game.sfx('whistle');
        this.buzz(e.id, [40, 40, 40]);
        this.sendView(e.id, true);
        return;
      }
      case 'finish': {
        const r = m.racer(e.id);
        const b = m.sim.body(e.id);
        if (b) fx.confetti(b.pos.x, b.pos.y + 1.5, b.pos.z, e.place === 1 ? 1.2 : 0.6);
        this.scene.players?.setCheer(e.id, true);
        this.floatAbove(e.id, STR.finishFloat(e.place), 'good');
        if (e.place === 1 && r) {
          this.hud.toast(STR.firstFinish(r.name), r);
          this.game.sfx('stinger-win');
        } else this.game.sfx('cheer');
        this.buzz(e.id, e.place === 1 ? [60, 40, 60, 40, 120] : [60, 40, 60]);
        this.sendView(e.id, true);
        return;
      }
      case 'hurry':
        this.setIntensity(3);
        this.setHurry(true);
        return;
      case 'second':
        this.game.sfx(e.left % 2 === 0 ? 'tick' : 'tock');
        return;
      case 'trackEnd':
        this.onTrackEnd(e.results);
        return;
      case 'done':
        this.finishSession();
        return;
    }
  }

  private onTrackEnd(results: { id: number; place: number; time: number | null; points: number }[]): void {
    const m = this.match;
    const allIn = results.every((r) => r.time !== null);
    this.hud.shout(allIn ? STR.allIn : STR.timeUp, 'end');
    this.game.sfx(allIn ? 'gong' : 'weker');
    this.setHurry(false);
    this.setIntensity(0);
    for (const r of m.racers)
      this.scene.players?.setCheer(r.id, results.find((x) => x.id === r.id)!.place <= 3);
    const last = m.trackNo + 1 >= m.tracks;
    if (last) {
      this.awards = pickAwards(m.racers);
      this.titles = new Map(this.awards.map((a) => [a.playerId, a.title]));
      this.result = buildResult(m, this.awards, this.cpus);
    }
    window.setTimeout(() => {
      const first = results[0];
      this.hud.podium.value = {
        title: STR.podiumTitle(m.trackNo, m.tracks),
        sub: last ? STR.podiumLast : STR.podiumNext(TIMING.podium - 1.5),
        rows: results.map((t) => {
          const c = this.chip(t.id)!;
          const r = m.racer(t.id);
          const gap = t.time !== null && first?.time != null && t.place > 1 ? t.time - first.time : null;
          const note = gap !== null && gap < 0.6 ? STR.closeCall(formatGap(gap)) : undefined;
          return {
            ...c,
            place: t.place,
            value: t.time !== null ? formatTime(t.time) : STR.notFinished,
            points: STR.pointsShort(t.points),
            total: STR.totalShort(r?.total ?? 0),
            ...(note ? { note } : {}),
          };
        }),
      };
      if (results[0] && !isCpu(results[0].id)) celebrate();
    }, 1500);
    this.sendViews(true);
  }

  private finishSession(): void {
    if (this.ended) return;
    this.ended = true;
    const m = this.match;
    const result = this.result ?? buildResult(m, pickAwards(m.racers), this.cpus);
    if (this.cpus.length > 0) {
      const human = m.racers.find((r) => !isCpu(r.id));
      const top = m.sessionStandings()[0];
      if (human && top) reportSoloResult(this.game.gameId, top.id === human.id ? 'win' : 'lose');
    }
    this.game.sfx('win');
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
    const fell = this.fellAt.get(id);
    const view = viewFor({
      match: this.match,
      id,
      guests: this.guests(),
      sinceFall: fell === undefined ? Infinity : (this.clock.now() - fell) / 1000,
      finalRank: this.ended ? this.match.sessionStandings().findIndex((r) => r.id === id) + 1 || null : null,
      titles: this.titles,
    });
    const key = JSON.stringify(view);
    if (!force && this.sent.get(id) === key) return;
    this.sent.set(id, key);
    this.game.setView(id, view);
  }

  /* ------------------------------------------------------------------ HUD */

  private pushHud(): void {
    const m = this.match;
    const h = this.hud;
    h.racing.value = m.phase === 'race' || m.phase === 'count';
    const left = m.timeLeft();
    h.clock.value = formatClock(left);
    h.urgent.value = m.phase === 'race' && left <= 10;
    const rows: StandRow[] = m.standings().map((r, i) => ({
      id: r.id,
      name: r.name,
      fruit: r.fruit,
      look: r.look,
      color: r.color,
      place: i + 1,
      finished: r.finishedAt !== null,
      offline: !isCpu(r.id) && !this.online.has(r.id),
      progress: m.progress(r),
    }));
    h.standings.value = rows;
    const panes = m.views.map((v) => ({
      key: v.id === null ? 'pack' : String(v.id),
      ...v.rect,
      who: v.id === null ? null : this.chip(v.id),
    }));
    if (panes.length !== h.split.value.length || panes.some((p, i) => p.key !== h.split.value[i]?.key))
      h.split.value = panes;
    h.off.value =
      m.phase === 'race'
        ? m.racers
            .filter((r) => r.offFor > 0.35)
            .map((r) => ({
              id: r.id,
              name: r.name,
              fruit: r.fruit,
              look: r.look,
              color: r.color,
              k: Math.min(1, r.offFor / TIMING.offscreen),
              left: TIMING.offscreen - r.offFor,
            }))
        : [];
  }
}
