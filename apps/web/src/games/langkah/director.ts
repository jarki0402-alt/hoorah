/**
 * Glue between the Hoorah SDK, the pure Langkah Maut rules, the 3D stage and the DOM HUD: the
 * Host's babak choice, the pause-aware clock, d-pad presses judged at the moment they happened on
 * the phone, computer walkers, sounds and adaptive music, vibration, budgeted phone views and the
 * final result.
 *
 * Phone updates share a budget (the server drops a room that floods it): at most VIEW_BUDGET phones
 * get a fresh view per tick, round robin, so 16 phones never exceed about 30 views a second. The
 * arrow preview on the phone is only shown while views arrive fast enough to be right.
 */
import {
  type ControllerToGame,
  type GuestPlayer,
  PAD_ARROW_ACTION,
  PAD_DOWN,
  PAD_LEFT,
  PAD_RIGHT,
  PAD_UP,
  type PlayerInfo,
  parseArrowPress,
  type RelayedInput,
  STICK_OP,
  sameLook,
} from '@hoorah/protocol';
import type { GameAward, GameResult, HoorahGame, MusicIntensity } from '@hoorah/sdk';
import { celebrate } from '../../shared/confetti';
import { cpuSkill, isCpu, reportSoloResult, soloOpponents } from '../common/cpu';
import { GameClock } from '../dapur/clock';
import type { Chip, CueStrip, HudStore } from './hud';
import {
  type Dir,
  type LangkahEvent,
  type LangkahMatch,
  type PlayerInfo as Seat,
  STAGES,
  TIMING,
} from './logic';
import { type Press, PressQueue } from './presses';
import { buildResult, pickAwards } from './results';
import type { LangkahScene } from './scene';
import { cueWord, formatSpeed, STAGE_INFO, STR } from './strings';
import { viewFor } from './views';

const HUD_MS = 50;
const VIEW_MS = 250;
const VIEW_BUDGET = 7;

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

export function lineup(game: Pick<GameLike, 'players'>): { seats: Seat[]; cpus: PlayerInfo[] } {
  const humans = game.players;
  const cpus = soloOpponents(humans, SOLO_OPPONENTS);
  const seats = [...humans, ...cpus]
    .slice(0, 16)
    .map((p) => ({ id: p.id, name: p.name, fruit: p.fruit, look: p.look, color: p.color, cpu: isCpu(p.id) }));
  return { seats, cpus };
}

function dirOf(buttons: number): Dir | null {
  if (buttons & PAD_UP) return 'up';
  if (buttons & PAD_DOWN) return 'down';
  if (buttons & PAD_LEFT) return 'left';
  if (buttons & PAD_RIGHT) return 'right';
  return null;
}

export class Director {
  private readonly clock = new GameClock();
  private readonly online = new Set<number>();
  private readonly sent = new Map<number, string>();
  private readonly takeover = new Set<number>();
  /** Each press arrives as a fast frame and a reliable copy: first one wins, in counter order. */
  private readonly presses = new PressQueue();
  private titles = new Map<number, string>();
  private awards: GameAward[] = [];
  private result: GameResult | null = null;
  private ended = false;
  private lastFrame = -1;
  private lastHud = Number.NEGATIVE_INFINITY;
  private lastViews = Number.NEGATIVE_INFINITY;
  private intensity: MusicIntensity = 0;
  private hurry = false;
  private soundCue = -1;
  private beat = 0;
  private lastFallSfx = Number.NEGATIVE_INFINITY;
  private rr = 0;
  private raf = 0;
  private fpsFrames = 0;
  private fpsAt = 0;
  onFrame: ((now: number, running: boolean) => void) | null = null;
  onFps: ((fps: number) => void) | null = null;

  constructor(
    private readonly game: GameLike,
    private readonly m: LangkahMatch,
    private readonly cpus: PlayerInfo[],
    private readonly scene: LangkahScene,
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
    this.game.music('langkah');
    this.game.musicIntensity(0);
    this.pushSetup();
    this.drain();
    this.raf = requestAnimationFrame(this.loop);
  }

  get running(): boolean {
    return !this.clock.paused && this.m.phase === 'play';
  }

  private hostId(): number | null {
    return this.game.allPlayers.find((p) => p.isHost)?.id ?? null;
  }

  private hostName(): string {
    return this.game.allPlayers.find((p) => p.isHost)?.name ?? 'Host';
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
        this.presses.forget(c.id);
        this.takeover.delete(c.id);
      }
    }
    for (const p of all) {
      const c = m.player(p.id);
      if (!c) {
        if (p.connected && m.phase !== 'final' && m.phase !== 'done' && m.players.length < 16)
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
    if (m.phase === 'setup') this.pushSetup();
    this.lastHud = Number.NEGATIVE_INFINITY;
    this.sendViews(true);
  }

  private onInput(input: RelayedInput & { atMs: number }): void {
    if (input.op === STICK_OP) return;
    const dir = dirOf(input.buttons);
    if (!dir) return;
    this.takePress(input.from, { counter: input.taps & 0xffff, dir, atMs: input.atMs });
  }

  /** One copy of a press (fast frame or reliable action); judged once, in the phone's order. */
  private takePress(from: number, press: Press): void {
    for (const p of this.presses.push(from, press, performance.now())) this.judge(from, p);
  }

  private judge(from: number, p: Press): void {
    if (this.ended || this.clock.paused || this.m.phase !== 'play') return;
    // Judge the moment of the press on the phone, not its arrival (bounded so nobody can claim more).
    const lag = Math.min(TIMING.maxLag, Math.max(0, (this.game.now() - p.atMs) / 1000));
    this.m.press(from, p.dir, Math.max(0, this.m.t - lag));
    this.drain();
  }

  private onAction(from: number, a: ControllerToGame): void {
    if (a.k !== 'action' || this.ended) return;
    if (a.id === PAD_ARROW_ACTION) {
      const arrow = parseArrowPress(a.value);
      const dir = arrow ? dirOf(arrow.bit) : null;
      if (arrow && dir && Number.isFinite(a.at))
        this.takePress(from, { counter: arrow.counter, dir, atMs: a.at });
      return;
    }
    const m = this.m;
    if (m.phase !== 'setup' || from !== this.hostId()) return;
    if (a.id === 'pick' && typeof a.value === 'string') {
      if (m.choose(a.value)) this.game.sfx('select');
    } else if (a.id === 'start') {
      if (m.start()) this.hud.setup.value = null;
    } else return;
    this.pushSetup();
    this.drain();
    this.sendViews(true);
  }

  /* ------------------------------------------------------------------ frame */

  private readonly loop = (now: number): void => {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.due(now)) return;
    const t = this.clock.now();
    const dt = this.lastFrame < 0 ? 0 : Math.min(0.1, Math.max(0, (t - this.lastFrame) / 1000));
    this.lastFrame = t;
    for (const { id, press } of this.presses.flush(performance.now())) this.judge(id, press);
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

  private tempoIntensity(): MusicIntensity {
    const s = this.m.speed;
    const base = s < 1.35 ? 1 : s < 1.9 ? 2 : 3;
    return Math.min(3, base + (this.m.isFinal ? 1 : 0)) as MusicIntensity;
  }

  private onEvent(e: LangkahEvent): void {
    const m = this.m;
    switch (e.k) {
      case 'babak':
        this.hud.end.value = null;
        this.hud.setup.value = null;
        this.hud.intro.value = {
          of: STR.babakCard(e.no, m.babakCount),
          stage: e.stage,
          name: STAGE_INFO[e.stage].name,
          desc: STAGE_INFO[e.stage].desc,
          double: m.isFinal,
        };
        this.scene.resetBabak(e.stage);
        this.scene.setTags(false);
        this.soundCue = -1;
        this.setHurry(false);
        this.setIntensity(0);
        this.game.sfx(m.isFinal ? 'gong' : 'round');
        this.sendViews(true);
        return;
      case 'play':
        this.hud.intro.value = null;
        this.scene.setTags(true);
        this.hud.shout(STR.go);
        this.hud.help.value = m.babak === 0;
        window.setTimeout(() => {
          this.hud.help.value = false;
        }, 6000);
        this.game.sfx('go');
        this.setIntensity(this.tempoIntensity());
        for (const p of m.alive()) this.buzz(p.id, 50);
        this.sendViews(true);
        return;
      case 'cue': {
        if (m.stage === 'lift') {
          this.game.sfx('tension');
          this.scene.jolt(0.18);
        } else if (m.stage === 'gua' && e.i % 3 === 0) this.scene.jolt(0.1);
        return;
      }
      case 'memorize':
        this.game.sfx('bell');
        this.sendViews(true);
        return;
      case 'recall':
        this.game.sfx('go');
        this.sendViews(true);
        return;
      case 'step': {
        const c = m.cues[e.i];
        if (c) this.scene.step(e.id, c.dir);
        if (e.i > this.soundCue) {
          this.soundCue = e.i;
          this.beat++;
          this.game.sfx(e.judge === 'pas' ? (this.beat % 2 ? 'tick' : 'tock') : 'select');
        }
        if (e.judge === 'pas' && m.contestants().length <= 6) {
          const s = this.scene.screenOf(e.id);
          if (s) this.hud.float(STR.pas, s.x, s.y);
        }
        return;
      }
      case 'fall': {
        const p = m.player(e.id);
        this.scene.fall(e.id);
        if (p) this.hud.toast(STR.fellToast(p.name, e.step), this.chip(e.id) ?? undefined);
        const now = performance.now();
        if (now - this.lastFallSfx > 300) {
          this.lastFallSfx = now;
          this.game.sfx('stinger-fall');
        }
        this.buzz(e.id, [160, 60, 80]);
        this.sendView(e.id, true);
        return;
      }
      case 'speed':
        this.hud.flashBanner(STR.speedUp);
        this.game.sfx('reveal');
        this.setIntensity(this.tempoIntensity());
        return;
      case 'second':
        this.game.sfx('count');
        this.setHurry(true);
        return;
      case 'babakEnd': {
        this.setHurry(false);
        this.setIntensity(0);
        const safe = new Set(e.survivors);
        this.scene.celebrate(e.survivors);
        this.game.sfx(e.survivors.length > 0 ? 'cheer' : 'boo');
        for (const id of e.survivors) this.buzz(id, [40, 30, 40]);
        this.hud.end.value = {
          title: e.survivors.length > 0 ? STR.babakDone : STR.allDown,
          sub: STR.survivors(e.survivors.length),
          rows: m
            .contestants()
            .map((p) => ({
              ...this.chip(p.id)!,
              points: e.points.get(p.id) ?? 0,
              steps: p.step,
              safe: safe.has(p.id),
            }))
            .sort((a, b) => b.points - a.points),
        };
        this.scene.setTags(false);
        this.sendViews(true);
        return;
      }
      case 'final': {
        this.hud.end.value = null;
        this.awards = pickAwards(m.players);
        this.titles = new Map(this.awards.map((a) => [a.playerId, a.title]));
        this.result = buildResult(m, this.awards, this.cpus);
        this.hud.final.value = {
          cols: m.babakCount,
          rows: m.standings().map((p, i) => ({
            ...this.chip(p.id)!,
            rounds: p.rounds,
            best: p.stats.best,
            total: p.total,
            rank: i + 1,
          })),
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

  /** True while views reach each phone fast enough for the arrow preview to be right. */
  private previewOk(): boolean {
    const phones = Math.max(1, [...this.online].filter((id) => !isCpu(id)).length);
    const refresh = (VIEW_MS / 1000) * Math.ceil(phones / VIEW_BUDGET) + 0.15;
    return refresh < this.m.interval * 0.5;
  }

  private sendViews(force: boolean): void {
    const ids = [...this.online].filter((id) => !isCpu(id));
    if (force) {
      for (const id of ids) this.sendView(id, true);
      return;
    }
    let budget = VIEW_BUDGET;
    for (let k = 0; k < ids.length && budget > 0; k++) {
      const id = ids[(this.rr + k) % ids.length]!;
      if (this.sendView(id, false)) budget--;
    }
    this.rr = ids.length > 0 ? (this.rr + VIEW_BUDGET) % ids.length : 0;
  }

  /** Sends a phone its view if it changed (or when forced). Returns true when one went out. */
  private sendView(id: number, force: boolean): boolean {
    if (!this.online.has(id) || isCpu(id)) return false;
    const view = viewFor({
      match: this.m,
      id,
      hostId: this.hostId(),
      hostName: this.hostName(),
      guests: this.guests(),
      titles: this.titles,
      preview: this.m.phase === 'play' && this.previewOk(),
    });
    const key = JSON.stringify(view);
    if (!force && this.sent.get(id) === key) return false;
    this.sent.set(id, key);
    this.game.setView(id, view);
    return true;
  }

  /* ------------------------------------------------------------------ HUD */

  private pushSetup(): void {
    const m = this.m;
    if (m.phase !== 'setup') {
      this.hud.setup.value = null;
      return;
    }
    this.hud.setup.value = {
      cards: [
        { id: 'acak', label: STR.acak, sub: STR.acakSub(m.rounds) },
        ...STAGES.map((s) => ({ id: s, label: STAGE_INFO[s].name, sub: STAGE_INFO[s].short })),
      ],
      selected: m.pick,
      waiting: STR.setupWaiting(this.hostName()),
    };
  }

  private cueStrip(): CueStrip | null {
    const m = this.m;
    if (m.phase !== 'play') return null;
    if (m.stage === 'ingat' && m.memo) {
      if (m.t < m.memo.recallAt)
        return {
          mode: 'memo',
          now: null,
          next: [],
          memo: m.memoCues().map((c) => c.dir),
          memoSeconds: Math.max(1, Math.ceil(m.memo.recallAt - m.t)),
          recallLen: 0,
        };
      return { mode: 'recall', now: null, next: [], memo: [], memoSeconds: 0, recallLen: m.memo.length };
    }
    const alive = m.alive();
    if (alive.length === 0) return null;
    const idx = Math.min(...alive.map((p) => p.next));
    const c = m.cues[idx];
    if (!c || c.show > m.t)
      return { mode: 'wait', now: null, next: [], memo: [], memoSeconds: 0, recallLen: 0 };
    const span = Math.max(0.05, c.close - c.show);
    const next: Dir[] = [];
    if (m.stage !== 'gua')
      for (let i = idx + 1; i < m.cues.length && next.length < 2; i++) {
        next.push(m.cues[i]!.dir);
      }
    return {
      mode: 'walk',
      now: {
        dir: c.dir,
        word: cueWord(m.stage, c.dir),
        hidden: c.hide !== null && m.t >= c.hide,
        left: Math.max(0, Math.min(1, (c.close - m.t) / span)),
      },
      next,
      memo: [],
      memoSeconds: 0,
      recallLen: 0,
    };
  }

  private pushHud(): void {
    const m = this.m;
    const h = this.hud;
    if (m.phase === 'setup') return;
    h.title.value = STR.babakTitle(m.babak, m.stage);
    h.double.value = m.isFinal;
    h.step.value = m.stepNo;
    h.alive.value = `${m.alive().length}/${m.contestants().length}`;
    h.speed.value = formatSpeed(m.phase === 'play' ? m.speed : 1);
    h.record.value = m.record ? STR.record(m.record.name, m.record.steps) : '';
    const left = m.secondsLeft;
    h.seconds.value = m.phase === 'play' && left <= 10 ? Math.ceil(left) : null;
    if (m.phase === 'play' && left <= 10) this.setHurry(true);
    h.cue.value = this.cueStrip();
    h.rows.value = [...m.players]
      .sort((a, b) => Number(a.fallen) - Number(b.fallen) || b.step - a.step)
      .map((p) => ({
        id: p.id,
        name: p.name,
        fruit: p.fruit,
        look: p.look,
        color: p.color,
        steps: p.step,
        fallen: p.inRound && p.fallen,
        waiting: !p.inRound,
        offline: !isCpu(p.id) && !this.online.has(p.id),
      }));
    if (m.phase === 'play') this.setIntensity(this.tempoIntensity());
  }
}
