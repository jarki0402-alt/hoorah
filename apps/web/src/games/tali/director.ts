/**
 * Glue between the Hoorah SDK, the pure Satu Tali rules, the 3D scene and the DOM HUD: the route
 * picker (Host's phone, mirrored on the main screen), the pause-aware clock, input, sounds and the
 * adaptive music, vibration, phone views and the final team result.
 *
 * Main sendiri (PRD 6.4, owner's decision 2026-11-22): no computer teammates; a lone climber is
 * tied to the sandbag instead. A dropped phone's climber stands still and holds the rope until it
 * reconnects.
 */
import {
  type ControllerToGame,
  INPUT_OP,
  PAD_ACTION,
  type PlayerInfo,
  type RelayedInput,
  STICK_OP,
  sameLook,
  unpackStick,
} from '@hoorah/protocol';
import type { GameAward, GameResult, HoorahGame, MusicIntensity } from '@hoorah/sdk';
import { celebrate } from '../../shared/confetti';
import { loadJson, saveJson } from '../common/store';
import { GameClock } from '../dapur/clock';
import { isRouteId, ROUTES, type RouteId } from './course';
import type { ClimberChip, HudStore, RosterRow } from './hud';
import { type ClimberInfo, SACK_ID, type TaliEvent, TaliMatch } from './logic';
import { buildResult, pickAwards } from './results';
import type { TaliScene } from './scene';
import { formatClock, STR } from './strings';
import { flagLeft, pickView, viewFor } from './views';

const HUD_MS = 100;
const VIEW_MS = 250;
const MAX_CLIMBERS = 4;
const BEST_KEY = 'tali.best';
const ROUTE_KEY = 'tali.route';

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

function loadBest(): Partial<Record<RouteId, number>> {
  const raw = loadJson<Record<string, unknown>>(BEST_KEY, {});
  const out: Partial<Record<RouteId, number>> = {};
  for (const id of ROUTES) {
    const v = raw?.[id];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[id] = v;
  }
  return out;
}

export class Director {
  private readonly clock = new GameClock();
  private match: TaliMatch | null = null;
  private stage: 'pick' | 'play' | 'ended' = 'pick';
  private route: RouteId;
  private readonly online = new Set<number>();
  private readonly sent = new Map<number, string>();
  private titles = new Map<number, string>();
  private awards: GameAward[] = [];
  private wipeAt = Number.NEGATIVE_INFINITY;
  private lastFrame = -1;
  private lastHud = Number.NEGATIVE_INFINITY;
  private lastViews = Number.NEGATIVE_INFINITY;
  private intensity: MusicIntensity = 0;
  private hurry = false;
  private raf = 0;
  onFrame: ((now: number, running: boolean) => void) | null = null;
  onFps: ((fps: number) => void) | null = null;
  private fpsFrames = 0;
  private fpsAt = 0;

  constructor(
    private readonly game: GameLike,
    private readonly scene: TaliScene,
    private readonly hud: HudStore,
    private readonly due: (now: number) => boolean = () => true,
    /** Skip the picker with this route (offline demo). */
    private readonly autoRoute: RouteId | null = null,
  ) {
    const last = loadJson<unknown>(ROUTE_KEY, 'senja');
    this.route = isRouteId(last) ? last : 'senja';
  }

  start(): void {
    for (const p of this.game.allPlayers) if (p.connected) this.online.add(p.id);
    this.game.on('players', () => this.onPlayers());
    this.game.on('input', (input) => this.onInput(input));
    this.game.on('action', (from, a) => this.onAction(from, a));
    this.game.on('pause', (paused) => this.setHold('shell', paused));
    document.addEventListener('visibilitychange', () => this.setHold('hidden', document.hidden));
    if (this.game.paused) this.setHold('shell', true);
    this.game.music('tali');
    this.setIntensity(0);
    if (this.autoRoute) {
      this.route = this.autoRoute;
      this.begin();
    } else this.pushPick();
    this.raf = requestAnimationFrame(this.loop);
  }

  get running(): boolean {
    return !this.clock.paused && this.match?.phase === 'climb';
  }

  private humans(): PlayerInfo[] {
    return this.game.players.filter((p) => p.connected);
  }

  private info(p: PlayerInfo): ClimberInfo {
    return { id: p.id, name: p.name, fruit: p.fruit, look: p.look, color: p.color };
  }

  private chip(id: number): ClimberChip | null {
    const c = this.match?.climber(id);
    return c ? { id, name: c.name, fruit: c.fruit, look: c.look, color: c.color } : null;
  }

  /* ------------------------------------------------------------------ picker */

  private canPick(from: number): boolean {
    if (this.game.player(from)?.isHost) return true;
    // Nobody can hold the game hostage: without a connected Host anyone picks.
    return !this.game.allPlayers.some((p) => p.isHost && p.connected);
  }

  private pushPick(): void {
    const host = this.game.allPlayers.find((p) => p.isHost);
    const best = loadBest();
    const n = Math.min(MAX_CLIMBERS, this.humans().length);
    this.hud.pick.value = {
      selected: this.route,
      options: ROUTES.map((id) => ({
        id,
        name: STR.routes[id].name,
        sub: best[id] !== undefined ? STR.recordLabel(formatClock(best[id]!)) : STR.routes[id].sub,
      })),
      sub: STR.pickScreenSub(host?.name ?? ''),
      note: n <= 1 ? STR.pickSolo : STR.pickTeam(n),
    };
    this.sendViews(false);
  }

  private begin(): void {
    const climbers = this.humans()
      .slice(0, MAX_CLIMBERS)
      .map((p) => this.info(p));
    if (climbers.length === 0) return;
    saveJson(ROUTE_KEY, this.route);
    const sections = Number(this.game.settings.rounds);
    this.match = new TaliMatch({
      climbers,
      route: this.route,
      sections: Number.isFinite(sections) && sections > 0 ? sections : 6,
      seed: Math.floor(Math.random() * 0x7fffffff),
      aspect: this.scene.stage.aspect,
    });
    this.stage = 'play';
    this.hud.pick.value = null;
    this.syncLooks();
    this.drain();
  }

  /* ------------------------------------------------------------------ SDK events */

  private setHold(reason: string, on: boolean): void {
    if (on) this.clock.hold(reason);
    else this.clock.release(reason);
    this.hud.paused.value = this.clock.paused;
  }

  private syncLooks(): void {
    const m = this.match;
    if (!m) return;
    this.scene.setPlayers(
      m.climbers.map((c) => ({ id: c.id, name: c.name, fruit: c.fruit, look: c.look, color: c.color })),
    );
  }

  private onPlayers(): void {
    const all = this.game.allPlayers;
    for (const p of all) {
      if (p.connected && !this.online.has(p.id)) {
        this.online.add(p.id);
        this.sent.delete(p.id);
      } else if (!p.connected) this.online.delete(p.id);
    }
    const m = this.match;
    if (m) {
      for (const c of [...m.climbers]) if (!all.some((p) => p.id === c.id)) m.removeClimber(c.id);
      for (const p of all) {
        const c = m.climber(p.id);
        if (!c) {
          if (p.connected && m.phase !== 'done' && m.climbers.length < MAX_CLIMBERS)
            m.addClimber(this.info(p));
          continue;
        }
        m.setOffline(p.id, !p.connected);
        if (c.name !== p.name || c.color !== p.color || c.fruit !== p.fruit || !sameLook(c.look, p.look))
          m.restyle(p.id, { name: p.name, color: p.color, fruit: p.fruit, look: p.look });
      }
      this.syncLooks();
    }
    if (this.stage === 'pick') this.pushPick();
    this.lastHud = Number.NEGATIVE_INFINITY;
    this.sendViews(true);
  }

  private onInput(input: RelayedInput & { atMs: number }): void {
    const m = this.match;
    if (!m || this.stage !== 'play' || this.clock.paused) return;
    if (input.op === STICK_OP) {
      const s = unpackStick(input.buttons);
      m.steer(input.from, s.x, s.y);
    } else if (input.op === INPUT_OP) m.hold(input.from, (input.buttons & PAD_ACTION) !== 0);
  }

  private onAction(from: number, a: ControllerToGame): void {
    if (a.k !== 'action') return;
    if (this.stage === 'pick') {
      if (!this.canPick(from)) return;
      if (a.id === 'pick' && isRouteId(a.value)) {
        if (a.value !== this.route) this.game.sfx('tick');
        this.route = a.value;
        this.pushPick();
      } else if (a.id === 'start') {
        this.game.sfx('select');
        this.begin();
      }
      return;
    }
    const m = this.match;
    if (!m || this.stage !== 'play' || this.clock.paused) return;
    if (a.id === 'jump') m.jump(from);
    else if (a.id === 'throw') {
      if (!m.throwSack(from)) this.buzz(from, 20);
    }
  }

  /* ------------------------------------------------------------------ frame */

  private readonly loop = (now: number): void => {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.due(now)) return;
    const t = this.clock.now();
    const dt = this.lastFrame < 0 ? 0 : Math.min(0.1, Math.max(0, (t - this.lastFrame) / 1000));
    this.lastFrame = t;
    const m = this.match;
    if (m && this.stage === 'play' && dt > 0) {
      m.tick(dt);
      this.drain();
    }
    if (m) this.scene.frame(m, this.clock.paused ? 0 : dt);
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
    if (!this.match) return;
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

  private baseIntensity(): MusicIntensity {
    const m = this.match;
    if (!m) return 0;
    return m.section.level === 0 ? 1 : 2;
  }

  private floatAbove(id: number, text: string, tone: 'good' | 'bad' | 'info'): void {
    const s = this.scene.players?.screenOf(id);
    if (s) this.hud.float(text, s.x, s.y, tone);
  }

  private buzz(id: number, pattern: number | number[]): void {
    const c = this.match?.climber(id);
    if (this.online.has(id) && c && !c.offline) this.game.vibrate(id, pattern);
  }

  private onEvent(e: TaliEvent): void {
    const m = this.match;
    if (!m) return;
    const fx = this.scene.fx;
    switch (e.k) {
      case 'section': {
        this.scene.load(m);
        this.hud.flagCard.value = null;
        this.hud.intro.value = {
          of: STR.sectionLong(e.no, m.sections),
          name: STR.routes[m.route].name,
          level: STR.levelName[m.section.level],
          segments: m.section.segments.map((s) => STR.segments[s.kind]),
          solo: m.sack,
        };
        this.hud.brand.value = STR.brand(m.route, e.no, m.sections);
        this.scene.players?.setTags(false);
        for (const c of m.climbers) this.scene.players?.setCheer(c.id, false);
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
        this.game.sfx('go');
        this.setIntensity(this.baseIntensity());
        if (m.sectionNo === 0) {
          this.hud.help.value = m.sack ? STR.helpSolo : STR.help;
          window.setTimeout(() => {
            this.hud.help.value = null;
          }, 8000);
        }
        for (const c of m.climbers) this.buzz(c.id, 60);
        this.sendViews(true);
        return;
      case 'jump':
        this.game.sfx('jump');
        return;
      case 'sync':
        for (const id of e.ids) this.floatAbove(id, STR.syncFloat, 'good');
        this.game.sfx('perfect');
        return;
      case 'land': {
        const b = m.sim.body(e.id);
        if (b) fx.dust(b.pos.x, b.pos.y, b.pos.z, Math.min(1.6, e.speed / 10));
        this.game.sfx('drop');
        return;
      }
      case 'sweep':
        this.floatAbove(e.id, STR.sweepFloat, 'bad');
        this.game.sfx('hit');
        this.buzz(e.id, [70, 30, 70]);
        return;
      case 'catch': {
        const c = m.climber(e.id);
        const by = e.by.map((id) => m.climber(id)?.name ?? '').filter((n) => n);
        if (c) this.hud.toast(STR.catchToast(c.name, by), c);
        this.floatAbove(e.id, STR.catchFloat, 'good');
        this.game.sfx('tension');
        this.buzz(e.id, [80, 40, 80]);
        // The holders feel a satisfying thump.
        for (const id of e.by) this.buzz(id, [40, 30, 120]);
        this.setIntensity(3);
        this.sendViews(true);
        return;
      }
      case 'rescued': {
        const c = m.climber(e.id);
        const by = e.by.map((id) => m.climber(id)?.name ?? '').filter((n) => n);
        if (c) this.hud.toast(STR.rescueToast(c.name, by), c);
        const b = m.sim.body(e.id);
        if (c && b) fx.sparkle(b.pos.x, b.pos.y + 0.8, b.pos.z, c.color);
        this.game.sfx('cheer');
        for (const id of [e.id, ...e.by]) this.buzz(id, 40);
        this.setIntensity(this.baseIntensity());
        this.sendViews(true);
        return;
      }
      case 'climbUp': {
        const c = m.climber(e.id);
        if (c) this.hud.toast(STR.climbToast(c.name), c);
        this.floatAbove(e.id, STR.climbFloat, 'good');
        this.game.sfx('super');
        this.buzz(e.id, 40);
        return;
      }
      case 'ropeClimb':
        this.game.sfx('pull');
        this.buzz(e.id, 15);
        return;
      case 'ledge':
        this.game.sfx('select');
        this.buzz(e.id, 25);
        this.sendView(e.id, true);
        return;
      case 'save': {
        const sp = m.trail.point(e.index);
        const c = m.climber(e.id);
        if (c) fx.sparkle(sp.pos.x, sp.pos.y + 0.5, sp.pos.z, c.color);
        this.hud.toast(STR.saveToast, c ?? undefined);
        this.floatAbove(e.id, STR.saveFloat, 'info');
        this.game.sfx('lap');
        for (const o of m.climbers) this.buzz(o.id, 40);
        return;
      }
      case 'wipe': {
        const c = m.climber(e.id);
        fx.fall(e.at.x, Math.max(e.at.y, m.section.killY + 3), e.at.z, c?.color ?? '#B98B5A');
        this.wipeAt = this.clock.now();
        this.scene.rope.reset();
        if (m.phase === 'climb') {
          this.hud.toast(STR.wipeToast, c ?? undefined);
          this.game.sfx('stinger-fall');
          for (const o of m.climbers) this.buzz(o.id, [120, 40, 60]);
          this.setIntensity(this.baseIntensity());
        }
        this.sendViews(true);
        return;
      }
      case 'throw': {
        const s = m.sim.body(SACK_ID);
        if (s) fx.dust(s.pos.x, s.pos.y, s.pos.z, 0.8, '#E9D2A6');
        this.hud.toast(STR.throwToast);
        this.game.sfx('throw');
        return;
      }
      case 'second':
        this.game.sfx(e.left % 2 === 0 ? 'tick' : 'tock');
        if (e.left <= 10) this.setHurry(true);
        return;
      case 'flag':
        this.onFlag(e.result);
        return;
      case 'done':
        this.finishSession();
        return;
    }
  }

  private onFlag(r: { no: number; time: number; wipes: number; stars: number; done: boolean }): void {
    const m = this.match;
    if (!m) return;
    this.setHurry(false);
    this.setIntensity(0);
    if (r.done) {
      this.hud.shout(STR.flagTitle(r.no), 'end');
      this.game.sfx(r.stars === 3 ? 'stinger-win' : 'gong');
      const pad = m.section.solids[m.section.finish]!;
      this.scene.fx.confetti(pad.pos.x, pad.pos.y + pad.half.y + 2, 0, r.stars === 3 ? 1.3 : 0.8);
      for (const c of m.climbers) {
        this.scene.players?.setCheer(c.id, true);
        this.buzz(c.id, [60, 40, 60, 40, 120]);
      }
      if (r.stars === 3) celebrate();
    } else {
      this.hud.shout(STR.timeoutTitle, 'end');
      this.game.sfx('weker');
    }
    const last = m.sectionNo + 1 >= m.sections;
    if (last) {
      this.awards = pickAwards(m.climbers);
      this.titles = new Map(this.awards.map((a) => [a.playerId, a.title]));
    }
    window.setTimeout(() => {
      if (this.match?.phase !== 'flag') return;
      this.hud.flagCard.value = {
        title: r.done ? STR.flagTitle(r.no) : STR.timeoutTitle,
        done: r.done,
        stars: r.stars,
        lines: r.done
          ? [
              STR.flagTime(formatClock(r.time)),
              STR.flagWipes(r.wipes),
              STR.starsOf(m.stars, m.results.length * 3),
            ]
          : [STR.timeoutSub],
        sub: last ? STR.flagLast : STR.flagNext(flagLeft(m)),
      };
    }, 1300);
    this.sendViews(true);
  }

  private finishSession(): void {
    const m = this.match;
    if (!m || this.stage === 'ended') return;
    this.stage = 'ended';
    const awards = this.awards.length > 0 ? this.awards : pickAwards(m.climbers);
    this.titles = new Map(awards.map((a) => [a.playerId, a.title]));
    const best = loadBest();
    const complete = m.results.length === m.sections && m.results.every((r) => r.done);
    const record = complete && (best[m.route] === undefined || m.teamTime < best[m.route]!);
    if (record) saveJson(BEST_KEY, { ...best, [m.route]: Math.round(m.teamTime * 10) / 10 });
    const result: GameResult = buildResult(m, awards, record);
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
    if (!this.online.has(id)) return;
    const m = this.match;
    let view: ReturnType<typeof viewFor>;
    if (this.stage === 'pick' || !m) {
      const host = this.game.allPlayers.find((p) => p.isHost);
      view = pickView({
        route: this.route,
        isHost: this.canPick(id),
        hostName: host?.name ?? '',
        humans: this.humans().length,
        best: loadBest(),
      });
    } else {
      view = viewFor({
        match: m,
        id,
        guests: [],
        sinceWipe: (this.clock.now() - this.wipeAt) / 1000,
        titles: this.titles,
      });
    }
    const key = JSON.stringify(view);
    if (!force && this.sent.get(id) === key) return;
    this.sent.set(id, key);
    this.game.setView(id, view);
  }

  /* ------------------------------------------------------------------ HUD */

  private pushHud(): void {
    const m = this.match;
    const h = this.hud;
    if (!m) return;
    h.playing.value = m.phase === 'climb';
    h.clock.value = formatClock(m.teamTime + (m.phase === 'climb' ? m.sectionT : 0));
    const left = m.timeLeft();
    h.left.value = m.phase === 'climb' && left <= 20 ? STR.leftLabel(Math.ceil(left)) : null;
    const done = Array.from({ length: m.sections }, (_, i) => m.results[i]?.done === true);
    h.flags.value = { total: m.sections, done, current: m.sectionNo };
    h.progress.value = m.progress();
    h.tension.value = m.rope.maxStrain();
    h.catches.value = m.catches;
    h.roster.value = m.climbers.map((c): RosterRow => {
      const chip = this.chip(c.id)!;
      const state: RosterRow['state'] = c.offline ? 'off' : c.hanging ? 'hang' : c.grip ? 'grip' : 'ok';
      return { ...chip, state };
    });
    if (m.phase === 'flag' && h.flagCard.value) {
      const last = m.sectionNo + 1 >= m.sections;
      const sub = last ? STR.flagLast : STR.flagNext(flagLeft(m));
      if (h.flagCard.value.sub !== sub) h.flagCard.value = { ...h.flagCard.value, sub };
    }
    if (m.phase === 'climb' && this.intensity !== 3 && m.climbers.some((c) => c.hanging))
      this.setIntensity(3);
  }
}
