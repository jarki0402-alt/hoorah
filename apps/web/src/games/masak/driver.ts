/**
 * Glue between the Hoorah SDK, the pure rules, the 3D view and the DOM HUD. Owns the game clock
 * (frozen while paused), turns logic events into sounds, chef reactions, phone views and HUD
 * state, and runs the render loop.
 */
import { type ControllerView, type Look, lookOfFruit, type PlayerInfo } from '@hoorah/protocol';
import type { GameResult, HoorahGame } from '@hoorah/sdk';
import type { Sfx } from '../../shared/audio';
import { celebrate, confetti } from '../../shared/confetti';
import { readRecord, submitRecord } from '../common/records';
import type { HudModel, HudPlayer, HudStation, HudStore } from './hud';
import {
  type DishResult,
  GameClock,
  GRADE_VALUE,
  type MasakEvent,
  MasakLogic,
  parseRounds,
  type StepResult,
} from './logic';
import { DISHES, type DishId, dishOrder, type Focus } from './recipes';
import { buildResult, rankStandings, type SoloRecord, soloRecord } from './results';
import type { Mood } from './scene/chef';
import type { StationModel } from './scene/model';
import type { MasakView, ViewFrame } from './scene/view';
import { STR } from './strings';
import * as V from './views';

const TICK_MS = 100;
/** Key for the solo records (PRD 6.4); the variant is the number of dishes. */
const GAME_ID = 'masak';
/** Look of a cook who has left the room (their station and HUD row stay). */
const UNKNOWN_LOOK: Look = lookOfFruit('mangga');
/** Phones get progress updates at most this often. */
const VIEW_SYNC_MS = 200;
const SHOWCASE_FOCUS: Record<DishId, Focus> = { nasgor: 'plate', sate: 'plate', martabak: 'board' };
const SFX_GAP: Partial<Record<Sfx, number>> = {
  chop: 55,
  stir: 110,
  flip: 90,
  tick: 60,
  sizzle: 650,
  pour: 520,
};

function randomSeed(): number {
  try {
    const b = new Uint32Array(1);
    crypto.getRandomValues(b);
    return b[0] ?? 1;
  } catch {
    return Date.now();
  }
}

export class MasakDriver {
  readonly clock: GameClock;
  private L: MasakLogic | null = null;
  private readonly sent = new Map<number, string>();
  private finalViews: Map<number, ControllerView> | null = null;
  private result: GameResult | null = null;
  private connected = new Set<number>();
  private timer = 0;
  private raf = 0;
  private ended = false;
  private lastSync = 0;
  private lastFrameT = 0;
  private lastCount = 0;
  private readonly sfxAt = new Map<Sfx, number>();
  private chefLine: string | null = null;
  private goKey = 0;
  private seq = 0;
  private lastShowcase: DishResult[] = [];
  /** Solo: the record when the game started (null before the first solo game). */
  private recordBefore: number | null = null;
  /** Solo: how this game compares with the record, set once at the final card. */
  private record: SoloRecord | null = null;

  constructor(
    private readonly game: HoorahGame,
    private readonly view: MasakView,
    private readonly hud: HudStore,
  ) {
    this.clock = new GameClock(() => game.now());
  }

  start(): void {
    const rounds = parseRounds(this.game.settings.rounds);
    const dishes = dishOrder(rounds, randomSeed());
    this.recordBefore = readRecord(GAME_ID, String(rounds));
    this.connected = new Set(this.game.allPlayers.filter((p) => p.connected).map((p) => p.id));
    this.L = new MasakLogic({ dishes, roster: this.roster(), now: this.clock.now() });
    this.view.setStations(this.L.participants.length);
    this.game.on('players', () => this.onPlayers());
    this.game.on('input', (i) => this.onInput(i.from, i.taps, i.buttons, i.atMs));
    this.game.on('pause', (p) => this.setPaused(p));
    if (this.game.paused) this.setPaused(true);
    this.flush();
    this.refreshHud();
    this.syncViews();
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
    this.lastFrameT = this.clock.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      if (this.view.beginFrame(now)) this.frame();
    };
    this.raf = requestAnimationFrame(loop);
  }

  /* ---------------------------------------------------------------- SDK */

  private roster() {
    return this.game.allPlayers.map((p) => ({ id: p.id, connected: p.connected }));
  }

  private onPlayers(): void {
    const L = this.L;
    if (!L || this.ended) return;
    const now = new Set(this.game.allPlayers.filter((p) => p.connected).map((p) => p.id));
    for (const id of now) {
      if (this.connected.has(id)) continue;
      this.sent.delete(id);
    }
    this.connected = now;
    L.setRoster(this.roster(), this.clock.now());
    this.view.setStations(L.participants.length);
    this.flush();
    this.refreshHud();
    this.syncViews();
  }

  private onInput(from: number, taps: number, buttons: number, atMs: number): void {
    const L = this.L;
    if (!L || this.ended) return;
    const now = this.clock.now();
    const frame = { taps, buttons, at: this.clock.toGame(atMs) };
    if (this.clock.paused) {
      L.absorb(from, frame, now);
      this.flush();
      return;
    }
    const r = L.input(from, frame, now);
    const step = L.step;
    if (r.counted > 0) {
      switch (step.skill) {
        case 'knife':
        case 'pound':
          this.sfx('chop');
          break;
        case 'stir':
          this.sfx('stir');
          break;
        case 'swipe':
          this.sfx('flip');
          break;
        case 'sprinkle':
          this.sfx('tick');
          break;
        default:
          break;
      }
    }
    if (r.pressed) this.sfx(step.hold?.over === 'spill' ? 'pour' : 'sizzle');
    this.flush();
  }

  private setPaused(paused: boolean): void {
    if (paused === this.clock.paused) return;
    if (paused) this.clock.pause();
    else this.clock.resume();
    this.hud.paused.value = paused;
    // Deadlines are sent in server time, which moved while paused.
    if (!paused && this.L) this.syncViews();
  }

  /* ---------------------------------------------------------------- loop */

  private tick(): void {
    const L = this.L;
    if (!L || this.ended) return;
    const now = this.clock.now();
    L.tick(now);
    this.flush();
    if (L.phase === 'cook') {
      const secs = Math.ceil((L.deadline - now) / 1000);
      if (secs >= 1 && secs <= 3 && secs !== this.lastCount && L.allDoneAt === null) {
        this.lastCount = secs;
        this.sfx('count');
      }
      // Keep the fryer / pour sound going while someone holds.
      if (L.step.hold && !this.clock.paused) {
        for (const id of L.participants) {
          const run = L.runs.get(id);
          if (run && run.pressAt !== null && run.doneAt === null) {
            this.sfx(L.step.hold.over === 'spill' ? 'pour' : 'sizzle');
            break;
          }
        }
      }
    }
    if (now - this.lastSync >= VIEW_SYNC_MS) this.syncViews();
  }

  private frame(): void {
    const L = this.L;
    if (!L) return;
    const now = this.clock.now();
    const dt = Math.min(0.05, Math.max(0, (now - this.lastFrameT) / 1000));
    this.lastFrameT = now;
    if (!this.ended) L.tick(now);
    this.flush();
    const f = this.buildFrame(now, dt);
    this.view.render(f);
    const cook = L.phase === 'cook';
    const left = Math.max(0, L.deadline - now);
    this.hud.frame({
      secs: cook ? Math.ceil(left / 1000) : null,
      ring: cook ? left / L.step.timeMs : 1,
      progress: f.stations.map((s) => (L.step.hold ? s.amount / L.step.hold.burn : s.progress)),
    });
  }

  private buildFrame(now: number, dt: number): ViewFrame {
    const L = this.L!;
    const plated = L.phase === 'showcase' || L.phase === 'final' || L.phase === 'ended';
    const stations: StationModel[] = L.participants.map((id) => {
      const run = L.runs.get(id);
      const s = L.stats.get(id)!;
      const hold = Boolean(L.step.hold);
      return {
        id,
        dish: L.dishId,
        stepIndex: L.stepIndex,
        phase: L.phase,
        progress: run ? L.progressAt(id, now) : 0,
        amount: run && hold ? L.amountAt(id, now) : 0,
        held: Boolean(run && run.pressAt !== null && run.doneAt === null),
        pulses: run?.pulses ?? 0,
        grade: run?.grade ?? null,
        reason: run?.reason ?? null,
        finals: s.amounts[L.dishIndex] ?? [],
        connected: L.isConnected(id),
        plated,
      };
    });
    const hero = L.phase === 'intro' || L.phase === 'final' || L.phase === 'ended';
    let heroStation = 0;
    if (L.phase === 'final' || L.phase === 'ended') {
      const top = rankStandings(L.participants.map((id) => L.stats.get(id)!))[0];
      heroStation = top ? Math.max(0, L.participants.indexOf(top.id)) : 0;
    }
    return {
      t: now / 1000,
      dt: this.clock.paused ? 0 : dt,
      mode: hero ? 'hero' : 'grid',
      dish: L.dishId,
      focus: L.phase === 'showcase' ? SHOWCASE_FOCUS[L.dishId] : L.step.focus,
      stations,
      heroStation,
      heroShot: hero && L.phase !== 'intro' ? 'final' : 'intro',
      orbit: L.phase === 'showcase',
    };
  }

  /* ---------------------------------------------------------------- events */

  private flush(): void {
    const L = this.L;
    if (!L) return;
    const events = L.drain();
    if (!events.length) return;
    for (const e of events) this.handle(e);
    this.refreshHud();
    this.syncViews();
  }

  private handle(e: MasakEvent): void {
    const L = this.L!;
    const t = this.clock.now() / 1000;
    switch (e.type) {
      case 'intro':
        this.chefLine = e.dishIndex === 0 ? STR.chefIntroFirst(L.dishId) : STR.chefIntro(L.dishId);
        this.react('talk', t, 2600);
        this.sfx('reveal');
        return;
      case 'ready':
        this.chefLine = null;
        this.lastCount = 0;
        this.react('talk', t, 900);
        this.sfx('select');
        return;
      case 'cook':
        this.goKey++;
        this.sfx('go');
        return;
      case 'done':
        this.onDone(e, t);
        return;
      case 'reveal':
        this.onReveal(e.results, t);
        return;
      case 'showcase':
        this.onShowcase(e.results, t);
        return;
      case 'final':
        this.onFinal(t);
        return;
      case 'end':
        this.ended = true;
        window.clearInterval(this.timer);
        this.game.end(this.result ?? this.buildResult());
        return;
    }
  }

  private onDone(e: StepResult, t: number): void {
    const L = this.L!;
    // Graded at the step's end (timeouts): the reveal handles sound and mood.
    if (L.phase !== 'cook') return;
    switch (e.grade) {
      case 'sempurna':
        this.sfx('perfect');
        this.game.vibrate(e.id, [40, 30, 90]);
        if (this.view.chef.current === 'idle') this.react('happy', t, 900);
        break;
      case 'bagus':
        this.sfx('correct');
        break;
      case 'lumayan':
        this.sfx('select');
        break;
      case 'gagal':
        this.sfx('wrong');
        this.game.vibrate(e.id, 220);
        if (e.reason === 'burnt') this.react('wow', t, 1200);
        break;
    }
  }

  private onReveal(results: StepResult[], t: number): void {
    const L = this.L!;
    if (!results.length) {
      this.chefLine = null;
      return;
    }
    // Late graders (timeouts) still get their buzz.
    for (const r of results) {
      const run = L.runs.get(r.id);
      if (run && run.doneAt !== null && run.doneAt >= L.deadline && r.grade === 'gagal')
        this.game.vibrate(r.id, 220);
    }
    const avg = results.reduce((a, r) => a + GRADE_VALUE[r.grade], 0) / results.length;
    const burnt = results.some((r) => r.reason === 'burnt');
    const over = L.step.hold?.over;
    let mood: Mood;
    let line: string;
    if (avg >= 2.5) {
      mood = 'cheer';
      line = this.pick(STR.chefSempurna);
    } else if (avg >= 1.5) {
      mood = 'happy';
      line = this.pick(STR.chefBagus);
    } else if (avg >= 0.75) {
      mood = 'wow';
      line = this.pick(STR.chefLumayan);
    } else {
      mood = 'sad';
      line = this.pick(STR.chefGagal);
    }
    if (burnt && avg < 2.5) {
      mood = 'sad';
      line = over === 'spill' ? STR.chefSpilled : STR.chefBurnt;
    } else if (avg < 1.5 && results.every((r) => r.reason === 'raw' || r.reason === 'idle')) {
      line = L.step.hold ? STR.chefRaw : line;
    }
    this.chefLine = line;
    this.react(mood, t, 2000);
    this.sfx(avg >= 1.5 ? 'clap' : 'reveal');
  }

  private onShowcase(results: DishResult[], t: number): void {
    this.lastShowcase = results;
    this.chefLine = null;
    const best = Math.max(0, ...results.map((r) => r.stars));
    this.react(best >= 2 ? 'cheer' : 'happy', t, 3000);
    this.sfx('ding');
    window.setTimeout(() => this.sfx(best >= 2 ? 'cheer' : 'clap'), 900);
    if (best >= 3) confetti({ y: 0.35, count: 90, power: 0.8 });
  }

  private onFinal(t: number): void {
    const L = this.L!;
    this.result = this.buildResult();
    const standings = rankStandings(L.participants.map((id) => L.stats.get(id)!));
    const title = this.result.title;
    const record = this.record;
    this.finalViews = new Map(standings.map((s) => [s.id, V.finalView(s, L.solo, title, record)]));
    this.chefLine = record ? STR.chefFinalSolo : STR.chefFinal;
    this.react('cheer', t, 4000);
    this.sfx(record?.isNew ? 'super' : 'win');
    celebrate();
  }

  private buildResult(): GameResult {
    const L = this.L!;
    return buildResult(
      L.participants.map((id) => L.stats.get(id)!),
      L.dishes,
      (id) => this.name(id),
      this.submitSolo(),
    );
  }

  /** Exactly one person played: store their score once (PRD 6.4). Null otherwise. */
  private submitSolo(): SoloRecord | null {
    const L = this.L!;
    const id = L.participants.length === 1 ? L.participants[0] : undefined;
    const s = id !== undefined ? L.stats.get(id) : undefined;
    if (this.record || !s) return this.record;
    this.record = soloRecord(submitRecord(GAME_ID, String(L.dishes.length), s.score), s.score);
    return this.record;
  }

  /* ---------------------------------------------------------------- HUD + phones */

  private name(id: number): string {
    return this.game.player(id)?.name ?? STR.unknownPlayer;
  }

  private hudPlayer(id: number): HudPlayer {
    const p: PlayerInfo | undefined = this.game.player(id);
    const L = this.L!;
    return {
      id,
      name: p?.name ?? STR.unknownPlayer,
      look: p?.look ?? UNKNOWN_LOOK,
      color: p?.color ?? '#C4C7CC',
      connected: L.isConnected(id),
      score: L.stats.get(id)?.score ?? 0,
    };
  }

  private refreshHud(): void {
    const L = this.L;
    if (!L) return;
    const hero = L.phase === 'intro' || L.phase === 'final' || L.phase === 'ended';
    const stations: HudStation[] = L.participants.map((id) => {
      const run = L.runs.get(id);
      const s = L.stats.get(id)!;
      const show = L.phase === 'showcase' ? this.lastShowcase.find((r) => r.id === id) : undefined;
      return {
        ...this.hudPlayer(id),
        grade: run?.grade ?? null,
        reason: run?.reason ?? null,
        points: run?.points ?? 0,
        streak: s.streak,
        stars: show ? show.stars : null,
        dishPoints: show ? show.points : null,
      };
    });
    let final: HudModel['final'] = null;
    if (L.phase === 'final' || L.phase === 'ended') {
      const standings = rankStandings(L.participants.map((id) => L.stats.get(id)!));
      final = {
        title: this.result?.title ?? STR.finalTitle,
        rows: standings.map((s) => ({ ...this.hudPlayer(s.id), rank: s.rank, stars: s.stars })),
        solo: this.record !== null,
        record: this.record,
      };
    }
    this.hud.model.value = {
      mode: hero ? 'hero' : 'grid',
      phase: L.phase,
      dish: L.dishId,
      dishIndex: L.dishIndex,
      dishCount: L.dishes.length,
      stepIndex: L.stepIndex,
      step: L.step,
      steps: DISHES[L.dishId].steps,
      chefLine: this.chefLine,
      stations,
      rects: [...this.view.stationRects],
      players: L.participants.map((id) => this.hudPlayer(id)),
      final,
      recordBefore:
        L.participants.length === 1 && this.recordBefore !== null
          ? STR.recordBefore(this.recordBefore)
          : null,
      goKey: this.goKey,
    };
  }

  private viewFor(id: number): ControllerView {
    const L = this.L!;
    if (this.finalViews) return this.finalViews.get(id) ?? V.idleView();
    const s = L.stats.get(id);
    if (!s) return V.idleView();
    const step = L.step;
    const n = L.dish.steps.length;
    const i = L.stepIndex;
    const dish = L.dishId;
    const run = L.runs.get(id);
    switch (L.phase) {
      case 'intro':
        return V.introView(dish, L.dishIndex, L.dishes.length);
      case 'ready':
        return V.readyView(step, dish, i, n);
      case 'cook':
        if (run?.grade) {
          return V.gradedView(step, dish, i, n, run.grade, run.reason!, run.points, run.amount, true);
        }
        return V.cookView(
          step,
          dish,
          i,
          n,
          L.progressAt(id, this.clock.now()),
          this.clock.toServer(L.deadline),
        );
      case 'reveal':
        if (run?.grade) {
          return V.gradedView(step, dish, i, n, run.grade, run.reason!, run.points, run.amount, false);
        }
        return V.readyView(step, dish, i, n);
      case 'showcase': {
        const r = this.lastShowcase.find((x) => x.id === id);
        return r ? V.dishView(dish, r.stars, r.points, s) : V.idleView();
      }
      default:
        return V.idleView();
    }
  }

  private syncViews(): void {
    if (!this.L) return;
    this.lastSync = this.clock.now();
    for (const p of this.game.allPlayers) {
      if (!p.connected) continue;
      const view = this.viewFor(p.id);
      const json = JSON.stringify(view);
      if (this.sent.get(p.id) === json) continue;
      this.sent.set(p.id, json);
      this.game.setView(p.id, view);
    }
  }

  /* ---------------------------------------------------------------- helpers */

  private react(mood: Mood, t: number, ms: number): void {
    this.view.react(mood, t, ms);
  }

  private pick(list: readonly string[]): string {
    return list[this.seq++ % list.length] ?? list[0] ?? '';
  }

  private sfx(name: Sfx): void {
    const now = performance.now();
    const gap = SFX_GAP[name] ?? 40;
    if (now - (this.sfxAt.get(name) ?? Number.NEGATIVE_INFINITY) < gap) return;
    this.sfxAt.set(name, now);
    this.game.sfx(name);
  }

  /** The stage changed size: station rects moved. */
  relayout(): void {
    this.refreshHud();
  }

  dispose(): void {
    window.clearInterval(this.timer);
    cancelAnimationFrame(this.raf);
  }
}
