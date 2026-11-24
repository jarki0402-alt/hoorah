/**
 * Glue between the Hoorah SDK, the pure Bom Oper rules, the 3D yard and the DOM HUD: the arena
 * picker (Host's phone, mirrored on the main screen), the pause-aware clock, input, computer
 * runners, sounds and the adaptive music, the fuse felt in the phones, phone views and the result.
 *
 * Computer runners (PRD 6.4): exactly one person gets three opponents that look like normal
 * players; their skill adapts silently. A dropped phone's runner is run by a gentle brain until it
 * reconnects, so a bomb never gets stuck in an empty hand.
 *
 * Long-distance play: with a `mirror` link the display state goes out about 15 times a second
 * while the chase runs and at once on every event; flourishes are logged for the far-away screen.
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
import type { GameAward, HoorahGame, MusicIntensity } from '@hoorah/sdk';
import { rng } from '../../shared/kotak/math';
import { cpuSkill, isCpu, reportSoloResult, soloOpponents } from '../common/cpu';
import { loadJson, saveJson } from '../common/store';
import { GameClock } from '../dapur/clock';
import { ARENAS, type ArenaId, isArenaId } from './arena';
import { BomBrain } from './brain';
import type { CardRow, HudStore, RunnerChip } from './hud';
import { type BomEvent, BomMatch, RULES, type RunnerInfo } from './logic';
import { EventLog, type MirrorLink, PUBLISH_MS, toMirror } from './mirror';
import { buildResult, pickAwards } from './results';
import type { BomScene } from './scene';
import { type ShowEvent, showEvent } from './show';
import { STR } from './strings';
import { pickView, viewFor } from './views';

const HUD_MS = 100;
const VIEW_MS = 250;
const SOLO_OPPONENTS = 3;
const MAX_RUNNERS = 8;
const TAKEOVER_SKILL = 0.3;
const ARENA_KEY = 'bom.arena';

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
  private match: BomMatch | null = null;
  private stage: 'pick' | 'play' | 'ended' = 'pick';
  private arena: ArenaId;
  private cpus: PlayerInfo[] = [];
  private readonly online = new Set<number>();
  private readonly sent = new Map<number, string>();
  private readonly takeover = new Set<number>();
  private readonly skill: number;
  private titles = new Map<number, string>();
  private awards: GameAward[] = [];
  private lastFrame = -1;
  private lastHud = Number.NEGATIVE_INFINITY;
  private lastViews = Number.NEGATIVE_INFINITY;
  /** Next vibration pulse per phone (clock ms). */
  private readonly nextPulse = new Map<number, number>();
  private intensity: MusicIntensity = 0;
  private hurry = false;
  private raf = 0;
  onFrame: ((now: number, running: boolean) => void) | null = null;
  onFps: ((fps: number) => void) | null = null;
  private fpsFrames = 0;
  private fpsAt = 0;
  /** Far-away main screens watching (set by main.tsx; null offline). */
  mirror: MirrorLink | null = null;
  private readonly log = new EventLog();
  private mirrorDirty = true;
  private lastPublish = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly game: GameLike,
    private readonly scene: BomScene,
    private readonly hud: HudStore,
    private readonly due: (now: number) => boolean = () => true,
    /** Skip the picker with this arena (offline demo). */
    private readonly autoArena: ArenaId | null = null,
  ) {
    this.skill = cpuSkill(game.gameId);
    const last = loadJson<unknown>(ARENA_KEY, 'halaman');
    this.arena = isArenaId(last) ? last : 'halaman';
  }

  start(): void {
    for (const p of this.game.allPlayers) if (p.connected) this.online.add(p.id);
    this.game.on('players', () => this.onPlayers());
    this.game.on('input', (input) => this.onInput(input));
    this.game.on('action', (from, a) => this.onAction(from, a));
    this.game.on('pause', (paused) => this.setHold('shell', paused));
    document.addEventListener('visibilitychange', () => this.setHold('hidden', document.hidden));
    if (this.game.paused) this.setHold('shell', true);
    this.game.music('bom');
    this.setIntensity(0);
    if (this.autoArena) {
      this.arena = this.autoArena;
      this.begin();
    } else this.pushPick();
    this.raf = requestAnimationFrame(this.loop);
  }

  get running(): boolean {
    return !this.clock.paused && this.match?.phase === 'play';
  }

  private rounds(): number {
    const n = Number(this.game.settings.rounds);
    return Number.isFinite(n) && n > 0 ? n : 5;
  }

  private humans(): PlayerInfo[] {
    return this.game.players.filter((p) => p.connected);
  }

  private info(p: PlayerInfo): RunnerInfo {
    return { id: p.id, name: p.name, fruit: p.fruit, look: p.look, color: p.color };
  }

  private chip(id: number): RunnerChip | null {
    const r = this.match?.runner(id);
    return r ? { id, name: r.name, fruit: r.fruit, look: r.look, color: r.color } : null;
  }

  private guests(): GuestPlayer[] {
    return this.cpus.map((c) => ({ id: c.id, name: c.name, fruit: c.fruit, look: c.look, color: c.color }));
  }

  /* ------------------------------------------------------------------ picker */

  private canPick(from: number): boolean {
    if (this.game.player(from)?.isHost) return true;
    return !this.game.allPlayers.some((p) => p.isHost && p.connected);
  }

  private pushPick(): void {
    const host = this.game.allPlayers.find((p) => p.isHost);
    const n = Math.max(1, Math.min(MAX_RUNNERS, this.humans().length));
    this.hud.pick.value = {
      selected: this.arena,
      options: ARENAS.map((id) => ({ id, name: STR.arenas[id].name, sub: STR.arenas[id].sub })),
      sub: STR.pickScreenSub(host?.name ?? ''),
      note: STR.pickNote(n === 1 ? 1 + SOLO_OPPONENTS : n, this.rounds()),
    };
    this.mirrorDirty = true;
    this.sendViews(false);
  }

  private begin(): void {
    const humans = this.humans().slice(0, MAX_RUNNERS);
    if (humans.length === 0) return;
    saveJson(ARENA_KEY, this.arena);
    this.cpus = soloOpponents(humans, SOLO_OPPONENTS);
    const runners = [...humans, ...this.cpus].slice(0, MAX_RUNNERS).map((p) => this.info(p));
    this.match = new BomMatch({
      runners,
      arena: this.arena,
      rounds: this.rounds(),
      seed: Math.floor(Math.random() * 0x7fffffff),
      aspect: this.scene.stage.aspect,
    });
    // Computer runners (and every runner of the offline demo, whose ids are all negative).
    let k = 1;
    for (const r of runners)
      if (isCpu(r.id)) this.match.setPilot(r.id, new BomBrain(this.skill, rng(k++ * 7919)));
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
    this.mirrorDirty = true;
  }

  private syncLooks(): void {
    const m = this.match;
    if (!m) return;
    this.scene.setPlayers(
      m.runners.map((r) => ({ id: r.id, name: r.name, fruit: r.fruit, look: r.look, color: r.color })),
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
      for (const r of [...m.runners]) {
        if (isCpu(r.id)) continue;
        if (!all.some((p) => p.id === r.id)) {
          m.removeRunner(r.id);
          this.takeover.delete(r.id);
        }
      }
      for (const p of all) {
        const r = m.runner(p.id);
        if (!r) {
          if (p.connected && m.phase !== 'done' && m.runners.length < MAX_RUNNERS) m.addRunner(this.info(p));
          continue;
        }
        if (p.connected && this.takeover.delete(p.id)) m.setPilot(p.id, null);
        else if (!p.connected && !this.takeover.has(p.id)) {
          this.takeover.add(p.id);
          m.setPilot(p.id, new BomBrain(TAKEOVER_SKILL));
        }
        if (r.name !== p.name || r.color !== p.color || r.fruit !== p.fruit || !sameLook(r.look, p.look))
          m.restyle(p.id, { name: p.name, color: p.color, fruit: p.fruit, look: p.look });
      }
      this.syncLooks();
    }
    if (this.stage === 'pick') this.pushPick();
    this.lastHud = Number.NEGATIVE_INFINITY;
    this.mirrorDirty = true;
    this.sendViews(true);
  }

  private onInput(input: RelayedInput & { atMs: number }): void {
    const m = this.match;
    if (!m || this.stage !== 'play' || this.clock.paused) return;
    if (input.op === STICK_OP) {
      const s = unpackStick(input.buttons);
      m.steer(input.from, s.x, s.y);
    }
  }

  private onAction(from: number, a: ControllerToGame): void {
    if (a.k !== 'action') return;
    if (this.stage === 'pick') {
      if (!this.canPick(from)) return;
      if (a.id === 'pick' && isArenaId(a.value)) {
        if (a.value !== this.arena) this.game.sfx('tick');
        this.arena = a.value;
        this.pushPick();
      } else if (a.id === 'start') {
        this.game.sfx('select');
        this.begin();
      }
      return;
    }
    const m = this.match;
    if (!m || this.stage !== 'play' || this.clock.paused || m.piloted(from)) return;
    if (a.id === 'pass') m.pass(from);
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
      this.pulses(t);
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
    this.flushMirror(t);
  };

  /**
   * The fuse in the hands: the holder's phone ticks faster as the fuse burns, and a runner the
   * holder closes in on feels it too.
   */
  private pulses(t: number): void {
    const m = this.match;
    if (m?.phase !== 'play') return;
    let hot = 0;
    for (const b of m.bombs) {
      if (b.exploded) continue;
      const k = m.burnt(b);
      hot = Math.max(hot, k);
      this.pulse(b.holder, t, 900 - 700 * k, 18);
      const h = m.sim.body(b.holder);
      if (!h) continue;
      for (const r of m.alive()) {
        if (r.id === b.holder) continue;
        const o = m.sim.body(r.id);
        if (!o) continue;
        const d = Math.hypot(o.pos.x - h.pos.x, o.pos.z - h.pos.z);
        if (d < 4) this.pulse(r.id, t, 250 + d * 120, 12);
      }
    }
    if (!this.hurry) this.setIntensity(m.finalRound ? 3 : hot > 0.5 ? 2 : 1);
    this.setHurry(hot > 0.85);
  }

  private pulse(id: number, t: number, every: number, ms: number): void {
    if ((this.nextPulse.get(id) ?? 0) > t) return;
    this.nextPulse.set(id, t + Math.max(160, every));
    this.buzz(id, ms);
  }

  private drain(): void {
    if (!this.match) return;
    for (const e of this.match.drainEvents()) {
      this.onEvent(e);
      // Bumps change nothing on screen; the periodic state covers them.
      if (e.k !== 'bump') this.mirrorDirty = true;
    }
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

  /** A flourish on this screen, logged for far-away screens to replay. */
  private show(e: ShowEvent): void {
    showEvent(e, { hud: this.hud, scene: this.scene, chip: (id) => this.chip(id) });
    this.log.push(e, this.match?.sim.t ?? 0);
  }

  private buzz(id: number, pattern: number | number[]): void {
    if (this.online.has(id) && !isCpu(id) && !this.takeover.has(id)) this.game.vibrate(id, pattern);
  }

  private onEvent(e: BomEvent): void {
    const m = this.match;
    if (!m) return;
    switch (e.k) {
      case 'round': {
        this.hud.score.value = null;
        this.hud.brand.value = STR.brand(e.no, m.rounds);
        const final = e.bombs === 2;
        this.hud.intro.value = {
          of: STR.roundLong(e.no, m.rounds),
          name: final ? STR.finalName : STR.roundName(e.no),
          line: final ? STR.finalLine : STR.roundLine,
          final,
          how: e.no === 0,
        };
        this.hud.banner.value = null;
        this.scene.players?.setTags(false);
        for (const r of m.runners) this.scene.players?.setCheer(r.id, false);
        this.setHurry(false);
        this.setIntensity(final ? 1 : 0);
        this.game.sfx('round');
        if (final) this.show({ k: 'final' });
        this.sendViews(true);
        return;
      }
      case 'drop':
        this.hud.intro.value = null;
        this.scene.players?.setTags(true);
        this.game.sfx('whistle');
        for (const id of e.ids) this.buzz(id, [60, 40, 60]);
        this.sendViews(true);
        return;
      case 'go':
        this.show({ k: 'go' });
        this.game.sfx('go');
        this.setIntensity(m.finalRound ? 3 : 1);
        this.sendViews(true);
        return;
      case 'pass': {
        this.show({ k: 'pass', from: e.from, to: e.to, near: e.near });
        this.game.sfx(e.near ? 'perfect' : 'throw');
        this.buzz(e.from, 30);
        this.buzz(e.to, [80, 30, 80]);
        this.sendView(e.from, true);
        this.sendView(e.to, true);
        return;
      }
      case 'refused':
        this.show({ k: 'refused', id: e.id });
        this.buzz(e.id, 15);
        return;
      case 'boom': {
        const r = m.runner(e.id);
        this.show({ k: 'boom', id: e.id, out: e.out, at: { ...e.at } });
        if (r) this.hud.banner.value = { title: STR.boomBanner(r.name), sub: STR.bannerSub, tone: 'boom' };
        this.game.sfx('explode');
        window.setTimeout(() => this.game.sfx(e.out ? 'stinger-fall' : 'boo'), 350);
        this.buzz(e.id, [200, 60, 200]);
        for (const o of m.alive()) if (o.id !== e.id) this.buzz(o.id, 40);
        this.setHurry(false);
        this.setIntensity(0);
        this.sendViews(true);
        return;
      }
      case 'back':
        this.sendViews(true);
        return;
      case 'score':
        this.onScore();
        return;
      case 'bump':
        this.game.sfx('pull');
        return;
      case 'done':
        this.finishSession();
        return;
    }
  }

  private onScore(): void {
    const m = this.match;
    if (!m) return;
    const last = m.over();
    const lost = new Set(m.lastBoom);
    this.hud.banner.value = null;
    this.hud.score.value = {
      title: STR.scoreTitle(m.roundNo),
      line: STR.scoreBoom(m.lastBoom.map((id) => m.runner(id)?.name ?? '').filter((n) => n)),
      sub: last ? STR.scoreLast : STR.scoreNext(RULES.score),
      rows: m
        .standings()
        .map((r) => ({ ...this.chip(r.id)!, lives: r.lives, lost: lost.has(r.id), out: r.out })),
    };
    for (const r of m.runners) this.scene.players?.setCheer(r.id, !r.out && !lost.has(r.id));
    this.game.sfx(last ? 'gong' : 'cheer');
    if (last) {
      this.awards = pickAwards(m);
      this.titles = new Map(this.awards.map((a) => [a.playerId, a.title]));
    }
    this.sendViews(true);
  }

  private finishSession(): void {
    const m = this.match;
    if (!m || this.stage === 'ended') return;
    this.stage = 'ended';
    const awards = this.awards.length > 0 ? this.awards : pickAwards(m);
    this.titles = new Map(awards.map((a) => [a.playerId, a.title]));
    const result = buildResult(m, awards, this.cpus);
    const top = m.standings()[0];
    if (this.cpus.length > 0) {
      const human = m.runners.find((r) => !isCpu(r.id));
      if (human && top) reportSoloResult(this.game.gameId, top.id === human.id ? 'win' : 'lose');
    }
    if (top && !isCpu(top.id)) this.show({ k: 'win' });
    this.game.sfx('stinger-win');
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
    const m = this.match;
    let view: ReturnType<typeof viewFor>;
    if (this.stage === 'pick' || !m) {
      const host = this.game.allPlayers.find((p) => p.isHost);
      view = pickView({ arena: this.arena, isHost: this.canPick(id), hostName: host?.name ?? '' });
    } else view = viewFor({ match: m, id, guests: this.guests(), titles: this.titles });
    const key = JSON.stringify(view);
    if (!force && this.sent.get(id) === key) return;
    this.sent.set(id, key);
    this.game.setView(id, view);
  }

  /* ------------------------------------------------------------------ far-away screens */

  /** Sends the display state now (a far-away screen just connected, or the session ended). */
  publishNow(): void {
    this.mirrorDirty = true;
    this.flushMirror(this.clock.now());
  }

  /** Periodic state while the chase runs; a change (event, pause, players, picker) goes at once. */
  private flushMirror(t: number): void {
    const link = this.mirror;
    if (!link?.active()) return;
    const due = this.stage === 'play' && !this.clock.paused && t - this.lastPublish >= PUBLISH_MS;
    if (!this.mirrorDirty && !due) return;
    this.mirrorDirty = false;
    this.lastPublish = t;
    const m = this.match;
    const h = this.hud;
    link.send(
      toMirror({
        at: link.now(),
        stage: this.stage,
        paused: this.clock.paused,
        arena: this.arena,
        rounds: this.rounds(),
        pick: h.pick.peek(),
        match: m,
        offline: (id) => !isCpu(id) && !this.online.has(id),
        brand: h.brand.peek(),
        banner: h.banner.peek(),
        intro: h.intro.peek(),
        score: h.score.peek(),
        events: this.log.recent(m?.sim.t ?? 0),
      }),
    );
  }

  /* ------------------------------------------------------------------ HUD */

  private pushHud(): void {
    const m = this.match;
    if (!m) return;
    const h = this.hud;
    const holders = m.bombs.filter((b) => !b.exploded).map((b) => m.runner(b.holder)?.name ?? '');
    if (m.phase === 'drop') h.banner.value = { title: STR.dropBanner, sub: STR.bannerSub, tone: 'drop' };
    else if (m.phase === 'play' && holders.length > 0)
      h.banner.value = { title: STR.holderBanner(holders), sub: STR.bannerSub, tone: 'bomb' };
    else if (m.phase !== 'boom') h.banner.value = null;
    h.cards.value = m.runners.map(
      (r): CardRow => ({
        ...this.chip(r.id)!,
        lives: r.lives,
        bomb: !!m.bombOf(r.id) && (m.phase === 'play' || m.phase === 'drop'),
        out: r.out,
        immune: m.immuneLeft(r) > 0,
        offline: !isCpu(r.id) && !this.online.has(r.id),
      }),
    );
    if (m.phase === 'score' && h.score.value) {
      const sub = m.over() ? STR.scoreLast : STR.scoreNext(RULES.score - m.phaseT);
      if (h.score.value.sub !== sub) h.score.value = { ...h.score.value, sub };
    }
  }
}
