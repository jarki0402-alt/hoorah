/**
 * Glue between the Hoorah SDK, the pure session (logic.ts + world.ts), the Phaser scene and the
 * DOM HUD: phone input, Host menu and power actions, the computer ghost (alone, or covering a
 * ghost whose phone dropped), sounds, adaptive music by how close the ghost is, phone views
 * (throttled and deduplicated; the ghost's carries the secret map), the result, and in
 * long-distance play the display state far-away main screens draw (mirror.ts).
 */
import { lookOfFruit, type PlayerInfo, type RelayedInput } from '@hoorah/protocol';
import type { GameResult, HoorahGame, MusicIntensity } from '@hoorah/sdk';
import type * as Phaser from 'phaser';
import { celebrate } from '../../shared/confetti';
import { cpuSkill, makeCpuPlayers, reportSoloResult } from '../common/cpu';
import { loadJson, saveJson } from '../common/store';
import { GhostBrain } from './brain';
import { GameClock } from './clock';
import type { EndRow, Hud, HudState, Overlay, Who } from './hud';
import { type StickCommand, StickInputs } from './input';
import { HauntMatch, type MatchEvent } from './logic';
import { FxLog, goalHud, HURRY_S, MIRROR_IDLE_MS, MIRROR_LIVE_MS, toMirror } from './mirror';
import { buildResult, standings } from './results';
import type { HantuScene, ResidentLook } from './scene';
import { FRIGHT_NAME, MAP_NAME, SKIN_NAME, STR } from './strings';
import { resultView, type ViewContext, viewFor } from './views';
import type { HauntEvent } from './world';

const HUD_MS = 100;
const VIEW_MS = 280;
const FEED_MS = 6000;
const CALLOUT_MS = 2000;
const TAKEOVER_SKILL = 0.5;
const OFFSET_KEY = 'hantu.next';

export class Driver {
  readonly match: HauntMatch;
  private readonly clock = new GameClock();
  private readonly pads = new StickInputs();
  private readonly online = new Set<number>();
  private readonly sent = new Map<number, string>();
  private readonly lastSfx = new Map<string, number>();
  private readonly cpu: PlayerInfo;
  private readonly solo: boolean;
  private readonly skill: number;
  private brain: GhostBrain | null = null;
  private attached: unknown = null;
  private result: GameResult | null = null;
  private ended = false;
  private lastT = 0;
  private lastHud = Number.NEGATIVE_INFINITY;
  private lastViews = Number.NEGATIVE_INFINITY;
  private callout = '';
  private calloutAt = Number.NEGATIVE_INFINITY;
  private intensity: MusicIntensity = 0;
  private hurry = false;
  private lastFuseTick = 0;
  private lastFuseProgress = 0;
  private reported = false;
  /** Long-distance play: this session's number, the flashes to replay, the last publish. */
  private readonly epoch = Math.floor(Math.random() * 1_000_000_000);
  private readonly fx = new FxLog();
  private lastMirror = Number.NEGATIVE_INFINITY;
  private readonly apply = (id: number, cmd: StickCommand): void => {
    const w = this.match.world;
    if (!w || this.match.phase !== 'hunt') return;
    w.setStick(id, cmd.x, cmd.y);
    w.setRun(id, cmd.held);
  };

  constructor(
    private readonly game: HoorahGame,
    private readonly scene: HantuScene,
    private readonly hud: Hud,
    private readonly phaser: Phaser.Game,
    rounds: number,
  ) {
    this.cpu = makeCpuPlayers(game.players, 1)[0]!;
    this.solo = game.players.length <= 1;
    this.skill = cpuSkill(game.gameId);
    const offset = loadJson<number>(OFFSET_KEY, 0);
    this.match = new HauntMatch({
      rounds,
      offset: typeof offset === 'number' && Number.isFinite(offset) ? offset : 0,
      cpuId: this.cpu.id,
    });
    this.match.cpuSpeed = new GhostBrain(this.skill).speed();
    this.onPlayers();
  }

  start(): void {
    this.game.on('players', () => this.onPlayers());
    this.game.on('input', (input) => this.onInput(input));
    this.game.on('action', (from, a) => this.onAction(from, a.id, a.value));
    this.game.on('pause', (paused) => this.setHold('shell', paused));
    this.game.on('mirrors', (on) => {
      if (on) this.publishMirror(this.clock.now(), true);
    });
    this.phaser.events.on('hidden', () => this.setHold('hidden', true));
    this.phaser.events.on('visible', () => this.setHold('hidden', false));
    if (this.game.paused) this.setHold('shell', true);
    this.game.music('hantu');
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
    this.publishMirror(this.clock.now(), true);
  }

  private onPlayers(): void {
    const all = this.game.allPlayers;
    this.match.setPeople(all.map((p) => ({ id: p.id, name: p.name, connected: p.connected })));
    for (const p of all) {
      if (p.connected && !this.online.has(p.id)) {
        this.online.add(p.id);
        this.sent.delete(p.id);
      } else if (!p.connected) {
        this.online.delete(p.id);
        this.pads.delete(p.id);
        const w = this.match.world;
        if (w) {
          w.setStick(p.id, 0, 0);
          w.setRun(p.id, false);
        }
      }
    }
    for (const id of this.online) if (!all.some((p) => p.id === id)) this.online.delete(id);
    this.lastHud = Number.NEGATIVE_INFINITY;
    this.sendViews();
  }

  private hostId(): number | null {
    return this.game.players.find((p) => p.isHost)?.id ?? this.game.players[0]?.id ?? null;
  }

  private info(id: number): PlayerInfo | undefined {
    return id === this.cpu.id ? this.cpu : this.game.player(id);
  }

  private nameOf(id: number): string {
    return this.info(id)?.name ?? 'Host';
  }

  /** The ghost's own phone is gone: the computer haunts for it. */
  private ghostCovered(): boolean {
    const w = this.match.world;
    return Boolean(w && !this.match.ghostIsCpu && !this.online.has(w.ghost.id));
  }

  private onAction(from: number, id: string, value?: string): void {
    if (this.ended) return;
    const m = this.match;
    const host = from === this.hostId();
    const w = m.world;
    switch (id) {
      case 'pick':
        if (host && typeof value === 'string' && m.pick(value)) this.sfx('select');
        break;
      case 'next':
        if (host) m.next();
        break;
      case 'back':
        if (host) m.back();
        break;
      case 'start':
        if (host && m.phase === 'setup' && m.step === 'fright') m.start();
        break;
      case 'torch':
        if (w && m.phase === 'hunt' && w.toggleLight(from)) this.sfx('tock');
        break;
      case 'lights':
        if (w && m.phase === 'hunt' && w.ghost.id === from) w.lightsOut();
        break;
      case 'door':
        if (w && m.phase === 'hunt' && w.ghost.id === from && !w.slam()) this.buzz(from, 20);
        break;
      default:
        return;
    }
    this.drain();
    this.sendViews();
    this.publishMirror(this.clock.now(), true);
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
    const dt = Math.min(250, t - this.lastT) / 1000;
    this.lastT = t;
    this.pads.releaseStale(t, this.apply);
    const m = this.match;
    const w = m.world;
    if (w && m.phase === 'hunt') {
      if (m.ghostIsCpu || this.ghostCovered()) {
        if (!this.brain) this.brain = new GhostBrain(m.ghostIsCpu ? this.skill : TAKEOVER_SKILL);
        const s = this.brain.update(w, dt);
        w.setStick(w.ghost.id, s.x, s.y);
      } else if (this.brain) {
        this.brain = null;
        w.setStick(w.ghost.id, 0, 0);
      }
      // A soft tick about once a second while someone charges the fuse.
      if (!w.fuseOn && w.fuse > this.lastFuseProgress && t - this.lastFuseTick > 900) {
        this.lastFuseTick = t;
        this.sfx('tick');
      }
      this.lastFuseProgress = w.fuse;
    }
    m.update(dt);
    this.drain();
    if (this.ended) return;
    if (t - this.lastViews >= VIEW_MS) {
      this.lastViews = t;
      this.sendViews();
    }
    if (t - this.lastHud >= HUD_MS) {
      this.lastHud = t;
      this.hud.setState(this.hudState(t));
      this.hud.pruneFeed(t, FEED_MS);
      this.updateMusic();
    }
    this.publishMirror(t, false);
  }

  private drain(): void {
    const m = this.match;
    if (m.world && m.world !== this.attached) {
      this.attached = m.world;
      this.brain = null;
      this.lastFuseProgress = 0;
      this.scene.attach(m.world, (id) => this.look(id));
    }
    for (const e of m.drainEvents()) this.onEvent(e);
  }

  private look(id: number): ResidentLook {
    const p = this.info(id);
    return {
      name: p?.name ?? '',
      look: p?.look ?? lookOfFruit('jeruk'),
      color: Number.parseInt((p?.color ?? '#FFFFFF').slice(1), 16),
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

  private say(text: string): void {
    this.callout = text;
    this.calloutAt = this.clock.now();
    this.lastHud = Number.NEGATIVE_INFINITY;
  }

  private scary(): boolean {
    return this.match.fright === 'beneran';
  }

  private onEvent(e: MatchEvent): void {
    // Anything that happened goes to a far-away screen with the next frame, not the next tick.
    this.lastMirror = Number.NEGATIVE_INFINITY;
    switch (e.type) {
      case 'phase':
        this.lastHud = Number.NEGATIVE_INFINITY;
        if (e.phase === 'reveal') this.sfx('reveal');
        else if (e.phase === 'hunt') this.sfx('gong');
        else if (e.phase === 'end') this.onRoundEnd();
        else if (e.phase === 'done') this.finish();
        this.sendViews();
        return;
      case 'round':
        this.hurry = false;
        this.game.musicHurry(false);
        return;
      case 'world':
        this.onWorld(e.e);
        return;
    }
  }

  private onWorld(e: HauntEvent): void {
    const w = this.match.world;
    if (!w) return;
    const t = this.clock.now();
    switch (e.type) {
      case 'key':
        this.sfx('ding');
        this.hud.pushFeed(STR.feedKey(this.nameOf(e.id), e.found, w.keys.length), t);
        this.buzz(e.id, 30);
        return;
      case 'fuseOn':
        this.sfx('super');
        window.setTimeout(() => this.game.sfx('bell'), 300);
        this.scene.flash(1);
        this.fx.note(1);
        this.hud.pushFeed(STR.feedFuse(this.nameOf(e.id)), t);
        return;
      case 'exitOpen':
        this.sfx('gong');
        this.say(STR.hudExitOpen);
        this.hud.pushFeed(STR.feedExit, t);
        for (const r of w.residents) if (r.state === 'in') this.buzz(r.id, [40, 60, 40]);
        return;
      case 'catch':
        if (this.scary()) {
          this.sfx('growl');
          this.sfx('stinger-fall');
          this.scene.flash(0.6);
          this.fx.note(0.6);
        } else this.sfx('boo');
        this.hud.pushFeed(STR.feedCatch(this.nameOf(e.id)), t);
        this.buzz(e.id, [120, 60, 200]);
        this.buzz(w.ghost.id, [40, 30, 40]);
        this.sendViews();
        return;
      case 'escape':
        this.sfx('cheer');
        this.hud.pushFeed(STR.feedEscape(this.nameOf(e.id)), t);
        this.sendViews();
        return;
      case 'silau':
        this.sfx('reveal');
        this.say(STR.hudSilau);
        this.buzz(w.ghost.id, [80, 40, 80]);
        return;
      case 'lit':
        this.sfx('tension', 3000);
        this.say(STR.hudGhostLit);
        this.hud.pushFeed(STR.feedLit(this.nameOf(e.by)), t);
        this.buzz(w.ghost.id, 40);
        return;
      case 'lightsOut':
        this.sfx(this.scary() ? 'collapse' : 'drop');
        this.say(STR.hudLightsOut);
        return;
      case 'slam':
        this.sfx('hit');
        this.hud.pushFeed(STR.feedSlam, t);
        return;
      case 'near':
        this.sfx('skid', 800);
        this.say(STR.feedNear);
        return;
      case 'battery':
        this.sfx('back');
        this.hud.pushFeed(STR.feedBattery(this.nameOf(e.id)), t);
        return;
      case 'over':
        this.game.musicHurry(false);
        return;
    }
  }

  private onRoundEnd(): void {
    const res = this.match.lastResult();
    if (!res) return;
    if (res.winner === 'penghuni') {
      this.sfx('stinger-win');
      celebrate();
    } else this.sfx(this.scary() ? 'stinger-fall' : 'boo');
    // Alone against the computer: one adaptive nudge per session, from the first round.
    if (this.solo && !this.reported) {
      this.reported = true;
      reportSoloResult(this.game.gameId, res.winner === 'penghuni' ? 'win' : 'lose');
    }
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    saveJson(OFFSET_KEY, this.match.nextOffset());
    const ids = this.participants();
    this.result = buildResult(this.match, ids, (id) => this.nameOf(id));
    const withCpu = ids.includes(this.cpu.id) ? { ...this.result, cpuPlayers: [this.cpu] } : this.result;
    const rows = standings(
      ids.map((id) => this.match.tallies.get(id)).filter((x) => x !== undefined),
      ids,
    );
    for (const id of this.online) {
      const rank = rows.find((r) => r.t.id === id)?.rank ?? rows.length;
      const chips = (this.result.awards ?? []).filter((a) => a.playerId === id).map((a) => a.title);
      this.game.setView(id, resultView(this.match, id, rank, chips));
    }
    this.game.musicIntensity(0);
    this.game.end(withCpu);
  }

  /** Everyone who played a round, the computer ghost included when it haunted. */
  private participants(): number[] {
    const ids = new Set<number>();
    for (const r of this.match.results) {
      ids.add(r.ghostId);
      for (const id of r.points.keys()) ids.add(id);
    }
    return [...ids];
  }

  /* ------------------------------------------------------------------ music */

  private updateMusic(): void {
    const m = this.match;
    const w = m.world;
    let level: MusicIntensity = 0;
    if (w && m.phase === 'hunt') {
      let near = Number.POSITIVE_INFINITY;
      for (const r of w.residents)
        if (r.state === 'in') near = Math.min(near, Math.hypot(r.x - w.ghost.x, r.y - w.ghost.y));
      level = w.flash > 0 ? 0 : near < 2.5 ? 3 : near < 5 ? 2 : near < 9 ? 1 : 0;
      const hurry = w.timeLeft <= HURRY_S;
      if (hurry !== this.hurry) {
        this.hurry = hurry;
        this.game.musicHurry(hurry);
      }
    } else if (m.phase === 'reveal') level = 1;
    if (level !== this.intensity) {
      this.intensity = level;
      this.game.musicIntensity(level);
    }
  }

  /* ------------------------------------------------------------------ phones */

  private ctx(): ViewContext {
    const host = this.hostId();
    return {
      hostId: host,
      hostName: host === null ? 'Host' : this.nameOf(host),
      name: (id) => this.nameOf(id),
      color: (id) => this.info(id)?.color ?? '#FFFFFF',
    };
  }

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

  private who(id: number): Who {
    const p = this.info(id);
    return { id, name: p?.name ?? '', look: p?.look ?? lookOfFruit('jeruk'), color: p?.color ?? '#FFFFFF' };
  }

  private overlay(): Overlay {
    const m = this.match;
    switch (m.phase) {
      case 'setup':
        return { kind: 'setup', step: m.step, map: m.map, fright: m.fright, host: this.ctx().hostName };
      case 'reveal':
        return {
          kind: 'reveal',
          eyebrow: STR.revealEyebrow(m.round + 1, m.rounds),
          title: m.ghostIsCpu ? STR.screenRevealSolo : STR.screenReveal,
          people: m.cast.map((id) => this.who(id)),
        };
      case 'end': {
        const res = m.lastResult();
        const w = m.world;
        if (!res || !w) return { kind: 'none' };
        const rows: EndRow[] = [...res.points.entries()]
          .map(([id, points]) => {
            const r = w.resident(id);
            const note =
              id === res.ghostId
                ? `${SKIN_NAME[res.skin]} · ${w.ghost.catches}×`
                : r?.state === 'out'
                  ? STR.noteEscaped
                  : r?.state === 'fly'
                    ? STR.phoneFly
                    : '';
            return { ...this.who(id), points, note };
          })
          .sort((a, b) => b.points - a.points);
        const last = m.round + 1 >= m.rounds;
        return {
          kind: 'end',
          eyebrow: STR.revealEyebrow(m.round + 1, m.rounds),
          title: res.winner === 'penghuni' ? STR.endResidents : STR.endGhost,
          sub: STR.endEscaped(res.escaped, res.residents),
          ghost: STR.endGhostWas(this.nameOf(res.ghostId), SKIN_NAME[res.skin]),
          good: res.winner === 'penghuni',
          rows,
          next: last ? STR.endLast : STR.endNext(m.round + 2),
        };
      }
      default:
        return { kind: 'none' };
    }
  }

  private hudState(t: number): HudState {
    const m = this.match;
    const w = m.world;
    const hunting = m.phase === 'hunt' && w !== null;
    const goal = w
      ? goalHud({
          keysFound: w.keysFound,
          keysTotal: w.keys.length,
          fuse: w.fuse,
          fuseOn: w.fuseOn,
          exitOpen: w.exitOpen,
          left: w.timeLeft,
          inside: w.residents.filter((r) => r.state === 'in').length,
        })
      : { keys: '', fuse: '', fuseOn: false, exitOpen: false, timer: '', urgent: false, safe: '' };
    return {
      show: hunting,
      place: MAP_NAME[m.map],
      fright: FRIGHT_NAME[m.fright],
      ...goal,
      callout: this.liveCallout(t),
      overlay: this.overlay(),
    };
  }

  /** The centre callout still showing at game time `t` ('' once it has run its time). */
  private liveCallout(t: number): string {
    if (t - this.calloutAt > CALLOUT_MS) this.callout = '';
    return this.callout;
  }

  /* ------------------------------------------------------------------ long-distance play */

  /** The stage for far-away screens: every 60 ms in the hunt, 250 ms otherwise, at once when `now`. */
  private publishMirror(t: number, now: boolean): void {
    if (!this.game.mirrored || this.ended) return;
    if (!now && t - this.lastMirror < (this.match.phase === 'hunt' ? MIRROR_LIVE_MS : MIRROR_IDLE_MS)) return;
    this.lastMirror = t;
    const server = this.game.now();
    this.game.publish(
      toMirror(
        {
          match: this.match,
          server,
          held: this.clock.paused,
          overlay: this.overlay(),
          callout: this.liveCallout(t),
          feed: this.hud.feed.value,
          who: (id) => this.who(id),
          fx: this.fx.recent(server),
          fxTop: this.fx.top,
        },
        this.epoch,
      ),
    );
  }
}
