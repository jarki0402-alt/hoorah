/**
 * Glue between the Hoorah SDK, the setup, the pure kitchen logic, the Phaser world and the DOM
 * HUD. Owns the pause-aware clock, the fixed-step advance, sounds, vibration, phone views and the
 * final result.
 *
 * Flow: setup (the Host picks kitchen, difficulty and sides from the phone, mirrored on the main
 * screen) -> countdown -> about three minutes of cooking -> the kitchen's result screen -> the
 * platform results (podium with the awards).
 *
 * Computer cooks (PRD 6.4): exactly one person gets one helper on Sisi Masak; it looks like a
 * normal player. A dropped phone's cook is kept working by the same brain until it reconnects.
 *
 * Practice (owner 2026-11-24): the first game on a main screen starts with a guided practice in
 * the real kitchen (guide.ts) right after the countdown: an arrow over the next station, a step
 * card on the screen, the button to press marked on the phones, no clock and no score. It ends
 * after the last step (or Lewati on any phone, tapped twice) with the real countdown.
 */
import {
  type ControllerToGame,
  FRUITS,
  type GuestPlayer,
  INPUT_OP,
  PAD_ACTION,
  PERSON_IDS,
  PLAYER_COLORS,
  type PlayerInfo,
  type RelayedInput,
  STICK_OP,
  sameLook,
  unpackStick,
} from '@hoorah/protocol';
import type { GameAward, GameResult, HoorahGame } from '@hoorah/sdk';
import type * as Phaser from 'phaser';
import { celebrate } from '../../shared/confetti';
import { cpuSkill, isCpu, makeCpuPlayers, reportSoloResult } from '../common/cpu';
import { loadJson, saveJson } from '../common/store';
import { CookBrain, styleFor, TAKEOVER_STYLE } from './brain';
import { GameClock } from './clock';
import { Guide } from './guide';
import type { CookChip, GuideState, Hud, Overlay, PlayState, ResultState, SetupState } from './hud';
import { DIFFICULTIES, type Difficulty, KITCHENS, type KitchenId, type Side } from './kitchens';
import { type CookInfo, DapurMatch, type MatchEvent } from './logic';
import { type GuideSource, MIRROR_MS, MirrorFeed } from './mirror';
import { guidePanel, playPanel, type ResultInfo, resultPanel, type SetupInfo, setupPanel } from './panels';
import { buildResult, helperOutcome, pickAwards, summarize } from './results';
import { type DapurScene, markOf } from './scene';
import { Setup, type SetupAction } from './setup';
import { STR } from './strings';
import { loadBackdrop } from './textures';
import { playViewFor, type RoundSummary, setupView } from './views';

const HUD_MS = 100;
const VIEW_MS = 250;
const GO_MS = 950;
const WARN_MS = 1_600;
const MOVE_MS = 2_600;
const HINT_MS = 9_000;
const TIME_UP_MS = 1_500;
const CHOP_SFX_MS = 230;
const LOOP_SFX_MS = 650;
const RED = '#FF6B5E';
const GREEN = '#5BE08F';

interface LastChoice {
  kitchen: KitchenId;
  difficulty: Difficulty;
}

const LAST_KEY = 'dapur.last';
const BEST_KEY = 'dapur.best';
/** Set once the practice ran (or was skipped) on this main screen. */
const GUIDE_KEY = 'dapur.tutorialDone';

function loadLast(): Partial<LastChoice> {
  const v = loadJson<Partial<LastChoice> | null>(LAST_KEY, null);
  if (!v || typeof v !== 'object') return {};
  const out: Partial<LastChoice> = {};
  if (typeof v.kitchen === 'string' && (KITCHENS as readonly string[]).includes(v.kitchen))
    out.kitchen = v.kitchen;
  if (typeof v.difficulty === 'string' && (DIFFICULTIES as readonly string[]).includes(v.difficulty))
    out.difficulty = v.difficulty;
  return out;
}

function loadBest(): Record<string, number> {
  const v = loadJson<Record<string, number> | null>(BEST_KEY, null);
  return v && typeof v === 'object' ? v : {};
}

export class Director {
  private readonly clock = new GameClock();
  private readonly setup: Setup;
  private match: DapurMatch | null = null;
  private stage: 'setup' | 'loading' | 'round' = 'setup';
  /** The practice while it runs (first game on this main screen). */
  private guide: Guide | null = null;
  /** The computer helper while exactly one person plays. */
  private cpus: PlayerInfo[] = [];
  private readonly online = new Set<number>();
  private readonly sent = new Map<number, string>();
  private readonly takeover = new Set<number>();
  private readonly skill: number;
  private summary: RoundSummary | null = null;
  private awards: GameAward[] = [];
  private result: GameResult | null = null;
  private newBest = false;
  private ended = false;
  private reported = false;
  private goAt = Number.NEGATIVE_INFINITY;
  private warnAt = Number.NEGATIVE_INFINITY;
  private moveAt = Number.NEGATIVE_INFINITY;
  private upAt = Number.NEGATIVE_INFINITY;
  private lastHud = Number.NEGATIVE_INFINITY;
  private lastViews = Number.NEGATIVE_INFINITY;
  private lastChop = Number.NEGATIVE_INFINITY;
  private lastLoop = Number.NEGATIVE_INFINITY;
  private readonly at = { x: 0, y: 0 };
  /** Long-distance play: what far-away main screens draw. */
  private readonly feed = new MirrorFeed();
  private lastMirror = Number.NEGATIVE_INFINITY;
  private mirrorPhase: string | null = null;

  constructor(
    private readonly game: HoorahGame,
    private readonly scene: DapurScene,
    private readonly hud: Hud,
    private readonly phaser: Phaser.Game,
  ) {
    this.skill = cpuSkill(game.gameId);
    const last = loadLast();
    this.setup = new Setup({
      kitchen: last.kitchen ?? null,
      difficulty: last.difficulty ?? null,
      humans: game.players.length,
    });
  }

  start(): void {
    this.game.on('players', () => this.onPlayers());
    this.game.on('input', (input) => this.onInput(input));
    this.game.on('action', (from, a) => this.onAction(from, a));
    this.game.on('pause', (paused) => this.setHold('shell', paused));
    this.game.on('mirrors', (on) => {
      if (on) this.publishMirror(true);
    });
    this.phaser.events.on('hidden', () => this.setHold('hidden', true));
    this.phaser.events.on('visible', () => this.setHold('hidden', false));
    if (this.game.paused) this.setHold('shell', true);
    this.onPlayers();
    this.game.music('dapur');
    this.scene.onFrame = () => this.frame();
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
    this.publishMirror(true);
  }

  private humans(): PlayerInfo[] {
    return this.game.players;
  }

  private info(id: number): PlayerInfo | undefined {
    return this.game.player(id) ?? this.cpus.find((c) => c.id === id);
  }

  private onPlayers(): void {
    const all = this.game.allPlayers;
    for (const p of all) {
      if (p.connected && !this.online.has(p.id)) {
        this.online.add(p.id);
        this.sent.delete(p.id);
      } else if (!p.connected) this.online.delete(p.id);
    }
    for (const id of [...this.online]) if (!all.some((p) => p.id === id)) this.online.delete(id);
    if (this.stage === 'setup') {
      this.syncLineup();
      this.pushSetup();
      return;
    }
    const m = this.match;
    if (!m) return;
    this.restyleCpus();
    // Leavers drop what they hold; newcomers join the smaller side.
    for (const c of [...m.chefs]) {
      if (isCpu(c.id)) continue;
      if (!all.some((p) => p.id === c.id)) {
        m.removeChef(c.id);
        this.takeover.delete(c.id);
      }
    }
    for (const p of all) {
      const c = m.chef(p.id);
      if (!c) {
        if (p.connected && m.phase !== 'over' && m.phase !== 'done')
          m.addChef(this.cookInfo(p), m.smallerSide());
        continue;
      }
      if (p.connected && this.takeover.delete(p.id)) m.setPilot(p.id, null);
      else if (!p.connected && !this.takeover.has(p.id)) {
        this.takeover.add(p.id);
        m.setPilot(p.id, new CookBrain(TAKEOVER_STYLE, c.side));
      }
      if (c.name !== p.name || c.color !== p.color || c.fruit !== p.fruit || !sameLook(c.look, p.look))
        m.restyle(p.id, this.cookInfo(p));
    }
    this.lastHud = Number.NEGATIVE_INFINITY;
    this.sendViews(true);
  }

  private cookInfo(p: PlayerInfo): CookInfo {
    return { id: p.id, name: p.name, fruit: p.fruit, look: p.look, color: p.color };
  }

  /** Setup: the helper exists only while exactly one person is here. */
  private syncLineup(): void {
    const humans = this.humans();
    if (humans.length === 1) {
      if (this.cpus.length === 0) this.cpus = makeCpuPlayers(humans, 1);
      this.restyleCpus();
    } else this.cpus = [];
    this.setup.sync([...humans.map((p) => p.id), ...this.cpus.map((c) => c.id)], humans.length);
  }

  /** A newcomer may wear the helper's colour, fruit or character: the helper switches to a free one. */
  private restyleCpus(): void {
    if (this.cpus.length === 0) return;
    const people = this.game.allPlayers.filter((p) => p.connected);
    const colors = new Set(people.map((p) => p.color.toUpperCase()));
    const fruits = new Set<string>(people.map((p) => p.fruit));
    const cast = new Set<string>(people.map((p) => p.look.c));
    this.cpus = this.cpus.map((cpu) => {
      const clashColor = colors.has(cpu.color.toUpperCase());
      const clashFruit = fruits.has(cpu.fruit);
      const clashLook = cast.has(cpu.look.c);
      if (!clashColor && !clashFruit && !clashLook) return cpu;
      const color = clashColor
        ? (PLAYER_COLORS.find((c) => !colors.has(c.toUpperCase())) ?? cpu.color)
        : cpu.color;
      const fruit = clashFruit ? (FRUITS.find((f) => !fruits.has(f)) ?? cpu.fruit) : cpu.fruit;
      const free = PERSON_IDS.find((c) => !cast.has(c));
      const look = clashLook && free ? { c: free } : cpu.look;
      const next = { ...cpu, color, fruit, look };
      this.match?.restyle(cpu.id, { color, fruit, look });
      return next;
    });
  }

  private onInput(input: RelayedInput & { atMs: number }): void {
    const m = this.match;
    if (!m || this.ended || this.stage !== 'round') return;
    if (this.clock.paused) {
      m.absorb(input.from);
      return;
    }
    if (input.op === STICK_OP) {
      const s = unpackStick(input.buttons);
      m.steer(input.from, s.x, s.y);
    } else if (input.op === INPUT_OP) {
      m.hold(input.from, (input.buttons & PAD_ACTION) !== 0);
    }
  }

  private onAction(from: number, a: ControllerToGame): void {
    if (a.k !== 'action' || this.ended) return;
    if (this.stage === 'setup') {
      this.onSetupAction(from, a);
      return;
    }
    const m = this.match;
    if (!m || this.stage !== 'round' || this.clock.paused) return;
    if (a.id === 'skip') {
      this.onSkip(m, from);
      return;
    }
    if (a.id === 'grab') m.grab(from);
    else if (a.id === 'throw') m.throwItem(from);
    // Answer at once so the carry chip and hint follow the tap.
    this.drainEvents(this.clock.now());
    this.sendView(from, false);
  }

  /* ------------------------------------------------------------------ setup */

  private onSetupAction(from: number, a: Extract<ControllerToGame, { k: 'action' }>): void {
    if (!this.game.player(from)?.isHost) return;
    const res: SetupAction = this.setup.act(a.id, a.value);
    if (res.kind === 'start') {
      this.game.sfx('select');
      void this.beginRound();
      return;
    }
    if (res.kind === 'changed') this.game.sfx(a.id === 'back' ? 'back' : 'tick');
    else if (res.kind === 'refused') this.game.sfx('wrong');
    this.pushSetup();
  }

  private pushSetup(): void {
    this.hud.set({ mode: 'setup', setup: this.setupState(), overlay: { kind: 'none' } });
    this.sendViews(false);
    this.publishMirror(true);
  }

  private chip(id: number): CookChip | null {
    const p = this.info(id);
    return p ? { id, name: p.name, fruit: p.fruit, look: p.look, color: p.color } : null;
  }

  private setupState(): SetupState {
    return setupPanel(this.setupInfo());
  }

  private setupInfo(): SetupInfo {
    const s = this.setup;
    const all = loadBest();
    const best = {} as Record<KitchenId, number>;
    for (const k of KITCHENS) {
      const b = all[`${k}.${s.difficulty}`];
      best[k] = typeof b === 'number' && b > 0 ? Math.min(3, Math.floor(b)) : 0;
    }
    const chips = (ids: number[]) => ids.map((id) => this.chip(id)).filter((c): c is CookChip => c !== null);
    const host = this.game.allPlayers.find((p) => p.isHost);
    return {
      step: s.step,
      kitchen: s.kitchen,
      difficulty: s.difficulty,
      humans: this.humans().length,
      best,
      sides: s.split ? [chips(s.members(0)), chips(s.members(1))] : null,
      everyone: chips(s.order),
      hostName: host?.name ?? '',
    };
  }

  private guests(): GuestPlayer[] {
    return this.cpus.map((c) => ({ id: c.id, name: c.name, fruit: c.fruit, look: c.look, color: c.color }));
  }

  private async beginRound(): Promise<void> {
    if (this.stage !== 'setup') return;
    this.stage = 'loading';
    const s = this.setup;
    saveJson(LAST_KEY, { kitchen: s.kitchen, difficulty: s.difficulty });
    try {
      this.scene.addCanvases(await loadBackdrop(s.kitchen));
    } catch {
      // The kitchen still plays on the plain stage colour.
    }
    const cooks = s.order
      .map((id) => {
        const p = this.info(id);
        return p ? { ...this.cookInfo(p), side: s.sideOf(id), cpu: isCpu(id) } : null;
      })
      .filter((c): c is CookInfo & { side: Side; cpu: boolean } => c !== null);
    try {
      await this.scene.preloadHeads(cooks.map((c) => c.look));
    } catch {
      // Heads that failed show up blank; the round still plays.
    }
    const practice = !loadJson<boolean>(GUIDE_KEY, false);
    const m = new DapurMatch({
      kitchen: s.kitchen,
      difficulty: s.difficulty,
      cooks,
      now: this.clock.now(),
      seed: Math.floor(Math.random() * 0x7fffffff),
      practice,
    });
    this.guide = practice ? Guide.for(m) : null;
    if (practice && !this.guide) m.endPractice(this.clock.now());
    for (const c of m.chefs) {
      // During the practice the helper waits until a step needs it (guideFrame).
      if (c.cpu) m.setPilot(c.id, this.guide ? null : this.cpuBrain(c.side));
      else if (!this.game.player(c.id)?.connected) {
        this.takeover.add(c.id);
        m.setPilot(c.id, new CookBrain(TAKEOVER_STYLE, c.side));
      }
    }
    this.match = m;
    this.scene.setup(m);
    this.stage = 'round';
    this.feed.reset();
    this.hud.set({ mode: 'play', setup: null });
    this.lastHud = Number.NEGATIVE_INFINITY;
    this.sendViews(true);
  }

  private cpuBrain(side: Side): CookBrain {
    return new CookBrain(styleFor(this.skill), side);
  }

  /* ------------------------------------------------------------------ practice */

  /** After every advance: follow the steps, wake or rest the helper, start the round when done. */
  private guideFrame(m: DapurMatch, g: Guide, t: number): void {
    if (!m.practice) return;
    if (g.update(m, t)) {
      this.lastMirror = Number.NEGATIVE_INFINITY;
      this.game.sfx('correct');
      for (const id of this.online) this.buzz(id, 30);
      this.lastHud = Number.NEGATIVE_INFINITY;
      this.sendViews(true);
    }
    const helper = g.helper(m);
    for (const c of m.chefs) {
      if (!c.cpu) continue;
      const want = helper?.id === c.id;
      if (want && !c.pilot) m.setPilot(c.id, this.cpuBrain(c.side));
      else if (!want && c.pilot) m.setPilot(c.id, null);
    }
    if (g.over(t)) this.endGuide(m, t);
  }

  /** Lewati: the first tap asks "Yakin?", the second (within a few seconds) ends the practice. */
  private onSkip(m: DapurMatch, from: number): void {
    const g = this.guide;
    if (!g || !m.practice) return;
    const t = this.clock.now();
    if (g.skip(from, t)) {
      this.game.sfx('select');
      this.endGuide(m, t);
      return;
    }
    this.game.sfx('tick');
    this.sendView(from, true);
  }

  private endGuide(m: DapurMatch, t: number): void {
    saveJson(GUIDE_KEY, true);
    this.guide = null;
    m.endPractice(t);
    for (const c of m.chefs) if (c.cpu && !c.pilot) m.setPilot(c.id, this.cpuBrain(c.side));
    this.goAt = Number.NEGATIVE_INFINITY;
    this.lastHud = Number.NEGATIVE_INFINITY;
    this.sendViews(true);
  }

  /** The practice as plain facts: the step card and what the arrow points at. */
  private guideSource(m: DapurMatch, g: Guide): GuideSource {
    const helper = g.helper(m);
    const target = g.target(m);
    // The button shown on the screen: what a person who can act would press.
    const actors = m.chefs.filter((c) => !c.cpu && g.buttonFor(c) !== null);
    const actor = actors.find((c) => g.buttonFor(c) === 'throw') ?? actors[0];
    return {
      info: {
        step: g.step,
        index: g.index,
        total: g.total,
        waiting: g.waiting,
        helper: helper ? helper.name : null,
        button: actor && !helper ? g.buttonFor(actor) : null,
        ticket: target?.kind === 'ticket',
      },
      target,
    };
  }

  /** The step card and the arrow for the HUD. */
  private guideState(m: DapurMatch, g: Guide): GuideState {
    const src = this.guideSource(m, g);
    let arrow: GuideState['arrow'] = null;
    if (src.target && src.target.kind !== 'ticket') {
      const at = { x: 0, y: 0, up: false };
      if (this.scene.anchorOf(src.target, at)) arrow = at;
    }
    return guidePanel(src.info, arrow);
  }

  /* ------------------------------------------------------------------ frame */

  private frame(): void {
    const m = this.match;
    if (this.ended || !m || this.stage !== 'round') return;
    const t = this.clock.now();
    m.advance(t);
    this.drainEvents(t);
    if (this.ended) return;
    if (this.guide) this.guideFrame(m, this.guide, t);
    this.scene.frameT = t;
    this.scene.alpha = m.alpha(t);
    this.workSounds(t);
    if (t - this.lastViews >= VIEW_MS) {
      this.lastViews = t;
      this.sendViews(false);
    }
    if (t - this.lastHud >= HUD_MS) {
      this.lastHud = t;
      this.pushHud(t);
    }
    this.publishMirror(false);
  }

  private drainEvents(t: number): void {
    const m = this.match;
    if (!m) return;
    const events = m.drainEvents();
    for (let i = 0; i < events.length; i++) this.onEvent(m, events[i]!, t);
  }

  /** Rhythmic sounds while someone holds Kerja (chopping, washing, filling, putting out fire). */
  private workSounds(t: number): void {
    const m = this.match;
    if (m?.phase !== 'play') return;
    let chop = false;
    let loop: 'splash' | 'pour' | null = null;
    for (const c of m.chefs) {
      if (c.busy === 'chop') chop = true;
      else if (c.busy === 'fill') loop = 'pour';
      else if (c.busy === 'wash' || c.busy === 'clean' || c.busy === 'douse') loop = loop ?? 'splash';
    }
    if (chop && t - this.lastChop >= CHOP_SFX_MS) {
      this.lastChop = t;
      this.game.sfx('chop');
    }
    if (loop && t - this.lastLoop >= LOOP_SFX_MS) {
      this.lastLoop = t;
      this.game.sfx(loop);
    }
  }

  /** A pop-up over a kitchen spot (logic tiles), also shown on far-away screens. */
  private floatAt(text: string, x: number, y: number, color: string, size = 30, sub?: string): void {
    this.scene.toWorld(x, y, this.at);
    this.hud.float(text, this.at.x, this.at.y - 40, color, size, sub);
    this.feed.float({ text, sub, x, y, color, size, world: false });
  }

  /** A pop-up at world px, also shown on far-away screens. */
  private floatWorld(text: string, x: number, y: number, color: string, size: number, sub?: string): void {
    this.hud.float(text, x, y, color, size, sub);
    this.feed.float({ text, sub, x, y, color, size, world: true });
  }

  private cheer(): void {
    celebrate();
    this.feed.celebrate();
  }

  private onEvent(m: DapurMatch, e: MatchEvent, t: number): void {
    const mark = markOf(e, m);
    if (mark) {
      this.scene.mark(mark, t);
      this.feed.mark(mark);
    }
    if (this.guide && m.practice) this.guide.onEvent(e, t);
    switch (e.type) {
      case 'count':
        this.game.sfx('count');
        this.lastHud = Number.NEGATIVE_INFINITY;
        this.sendViews(true);
        return;
      case 'go':
        this.goAt = t;
        this.game.sfx('go');
        this.lastHud = Number.NEGATIVE_INFINITY;
        this.sendViews(true);
        return;
      case 'order':
        if (e.ticket.id > 1) this.game.sfx('reveal');
        this.lastHud = Number.NEGATIVE_INFINITY;
        return;
      case 'served': {
        if (!e.served.complete) {
          this.game.sfx('correct');
          this.floatAt(STR.partial, e.x, e.y, '#FFC928', 26);
          return;
        }
        this.game.sfx('ding');
        window.setTimeout(() => this.game.sfx('clap'), 160);
        if (m.practice) {
          this.floatAt(STR.guide.served, e.x, e.y, GREEN, 40);
          this.cheer();
          this.buzz(e.by, [30, 40, 60]);
          this.lastHud = Number.NEGATIVE_INFINITY;
          return;
        }
        this.floatAt(
          STR.served(e.served.points + e.served.tip),
          e.x,
          e.y,
          GREEN,
          40,
          e.served.tip > 0 ? STR.tip(e.served.tip) : undefined,
        );
        this.buzz(e.by, [30, 40, 60]);
        this.lastHud = Number.NEGATIVE_INFINITY;
        return;
      }
      case 'missed':
        this.game.sfx('wrong');
        this.floatWorld(STR.missed, 640, 150, RED, 30, STR.penalty(e.penalty));
        this.lastHud = Number.NEGATIVE_INFINITY;
        return;
      case 'fail':
        if (e.reason === 'noOrder' || e.reason === 'wrong') {
          const c = m.chef(e.id);
          const s = c && c.target !== null ? m.stations[c.target] : null;
          if (s?.kind === 'pass') {
            this.game.sfx('wrong');
            this.floatAt(STR.wrongDish, s.x + 1, s.y + 0.2, RED, 22);
          }
        } else if (e.reason === 'empty') {
          const c = m.chef(e.id);
          const s = c && c.target !== null ? m.stations[c.target] : null;
          if (s?.kind === 'rack') this.floatAt(STR.noPlates, s.x + 0.5, s.y + 0.2, RED, 22);
        }
        return;
      case 'throw': {
        this.game.sfx('throw');
        if (e.flight.toChef !== null) {
          this.buzz(e.flight.toChef, [40, 40, 40]);
          this.sendView(e.flight.toChef, true);
        }
        this.sendView(e.flight.from, true);
        return;
      }
      case 'catch':
        this.game.sfx('drop');
        this.buzz(e.by, 30);
        this.sendView(e.by, true);
        return;
      case 'hit': {
        this.game.sfx('hit');
        if (e.broke) window.setTimeout(() => this.game.sfx('collapse'), 90);
        const c = m.chef(e.to);
        if (c && e.broke) {
          const it = e.flight.item;
          this.floatAt(it.k === 'glass' ? STR.spilled : STR.broke, c.x, c.y - 0.6, RED, 30);
        }
        this.buzz(e.to, [120, 60, 120]);
        this.sendView(e.to, true);
        return;
      }
      case 'land':
        this.game.sfx('drop');
        return;
      case 'chopped':
        this.game.sfx('select');
        this.buzz(e.id, 25);
        return;
      case 'cookStart':
        this.game.sfx('sizzle');
        return;
      case 'cooked':
        this.game.sfx('perfect');
        return;
      case 'burnWarn':
        this.game.sfx('tension');
        return;
      case 'burnt': {
        this.game.sfx('wrong');
        const s = m.stations[e.station];
        if (s) this.floatAt(STR.burnt, s.x + 0.5, s.y + 0.3, '#A8ABB2', 30);
        return;
      }
      case 'fire': {
        this.game.sfx('explode');
        const s = m.stations[e.station];
        if (s) this.floatAt(STR.fire, s.x + 0.5, s.y + 0.6, RED, 34);
        for (const id of this.online) this.game.vibrate(id, [200, 80, 200]);
        this.sendViews(true);
        return;
      }
      case 'fireOut': {
        this.game.sfx('splash');
        const s = m.stations[e.station];
        if (s) this.floatAt(STR.fireOut, s.x + 0.5, s.y + 0.6, '#5AA9FF', 30);
        return;
      }
      case 'filled':
        this.game.sfx('correct');
        this.buzz(e.id, 40);
        this.sendView(e.id, true);
        return;
      case 'spill': {
        this.game.sfx('splash');
        const c = m.chef(e.id);
        if (c) this.floatAt(STR.spilled, c.x, c.y - 0.6, RED, 30);
        this.buzz(e.id, [80, 40, 80]);
        return;
      }
      case 'washed':
      case 'cleaned':
        this.game.sfx('splash');
        return;
      case 'moveWarn':
        this.moveAt = t;
        this.game.sfx('tension');
        return;
      case 'move':
        this.game.sfx('collapse');
        this.sendViews(true);
        return;
      case 'warning':
        this.warnAt = t;
        this.game.sfx('tension');
        return;
      case 'second':
        this.game.sfx('tick');
        return;
      case 'timeUp':
        this.timeUp(m, t);
        return;
      case 'done':
        this.ended = true;
        this.game.music(null);
        this.game.end(this.result ?? this.finish(m));
        return;
      case 'pickup':
      case 'putdown':
      case 'plateBack':
        return;
    }
  }

  /* ------------------------------------------------------------------ results */

  private finish(m: DapurMatch): GameResult {
    this.awards = pickAwards(m.chefs.map((c) => ({ id: c.id, stats: c.stats })));
    this.summary = summarize(m, this.awards);
    this.result = buildResult(m, this.summary, this.awards, this.cpus);
    return this.result;
  }

  private timeUp(m: DapurMatch, t: number): void {
    this.upAt = t;
    this.game.sfx('whistle');
    this.scene.flash();
    this.feed.flash();
    this.finish(m);
    const stars = this.summary?.stars ?? 0;
    window.setTimeout(() => this.game.sfx(stars >= 2 ? 'win' : 'cheer'), 420);
    if (stars >= 2) this.cheer();
    // Best stars on this main screen, per kitchen and difficulty.
    const best = loadBest();
    const key = `${m.def.id}.${m.difficulty}`;
    const prev = best[key] ?? 0;
    this.newBest = stars > prev;
    if (this.newBest) saveJson(BEST_KEY, { ...best, [key]: stars });
    if (!this.reported && this.cpus.length > 0 && m.chefs.some((c) => c.cpu)) {
      this.reported = true;
      reportSoloResult(this.game.gameId, helperOutcome(stars));
    }
    for (const id of this.online) this.game.vibrate(id, stars >= 2 ? [60, 40, 60, 40, 120] : 120);
    this.lastHud = Number.NEGATIVE_INFINITY;
    this.sendViews(true);
  }

  private resultInfo(m: DapurMatch, s: RoundSummary): ResultInfo {
    return {
      kitchen: m.def.id,
      thresholds: m.thresholds,
      stars: s.stars,
      score: s.score,
      delivered: s.delivered,
      missed: s.missed,
      tips: s.tips,
      awards: this.awards,
      newBest: this.newBest,
    };
  }

  private resultState(m: DapurMatch, s: RoundSummary): ResultState {
    const cooks = new Map<number, CookChip>(
      m.chefs.map((c) => [c.id, { id: c.id, name: c.name, fruit: c.fruit, look: c.look, color: c.color }]),
    );
    return resultPanel(this.resultInfo(m, s), cooks);
  }

  /* ------------------------------------------------------------------ phones */

  private buzz(id: number, pattern: number | number[]): void {
    if (this.online.has(id) && !isCpu(id)) this.game.vibrate(id, pattern);
  }

  private sendViews(force: boolean): void {
    for (const id of this.online) this.sendView(id, force);
  }

  private sendView(id: number, force: boolean): void {
    if (!this.online.has(id)) return;
    let view: ReturnType<typeof setupView>;
    if (this.stage !== 'round' || !this.match) {
      const host = this.game.allPlayers.find((p) => p.isHost);
      const names = new Map<number, string>();
      for (const p of this.game.allPlayers) names.set(p.id, p.name);
      for (const c of this.cpus) names.set(c.id, c.name);
      view = setupView({
        setup: this.setup,
        me: id,
        isHost: !!this.game.player(id)?.isHost,
        hostName: host?.name ?? '',
        names,
        humans: this.humans().length,
        guests: this.guests(),
      });
    } else {
      view = playViewFor({
        match: this.match,
        id,
        t: this.clock.now(),
        summary: this.summary,
        guests: this.guests(),
        guide: this.guide,
      });
    }
    const key = JSON.stringify(view);
    if (!force && this.sent.get(id) === key) return;
    this.sent.set(id, key);
    this.game.setView(id, view);
  }

  /* ------------------------------------------------------------------ HUD */

  private overlay(m: DapurMatch, t: number): Overlay {
    switch (m.phase) {
      case 'countdown':
        return { kind: 'count', value: Math.max(1, m.countValue) };
      case 'play':
        if (m.practice) {
          if (this.guide?.finished) return { kind: 'guideDone' };
          return t - this.goAt < GO_MS * 2 ? { kind: 'guideGo' } : { kind: 'none' };
        }
        if (t - this.goAt < GO_MS) return { kind: 'go' };
        if (t - this.moveAt < MOVE_MS) return { kind: 'move' };
        if (t - this.warnAt < WARN_MS) return { kind: 'warning' };
        return { kind: 'none' };
      case 'over':
      case 'done':
        return t - this.upAt < TIME_UP_MS ? { kind: 'timeUp' } : { kind: 'none' };
    }
  }

  private playState(m: DapurMatch, t: number): PlayState {
    return playPanel({
      kitchen: m.def.id,
      difficulty: m.difficulty,
      phase: m.phase,
      practice: m.practice,
      left: m.timeLeft(t),
      score: m.score,
      stars: m.stars(),
      thresholds: m.thresholds,
      tickets: m.orders.tickets.map((k) => ({
        id: k.id,
        dish: k.dish,
        got: k.got,
        left: m.orders.patience(k, t),
      })),
      cooks: m.chefs,
    });
  }

  /** The result card shows once the time-up banner is gone. */
  private showsResult(m: DapurMatch, t: number): boolean {
    return (m.phase === 'over' || m.phase === 'done') && t - this.upAt >= TIME_UP_MS && this.summary !== null;
  }

  private hintOn(m: DapurMatch, t: number): boolean {
    return m.phase === 'play' && !m.practice && t - this.goAt < HINT_MS;
  }

  private pushHud(t: number): void {
    const m = this.match;
    if (!m) return;
    const showResult = this.showsResult(m, t);
    this.hud.set({
      mode: showResult ? 'result' : 'play',
      play: this.playState(m, t),
      overlay: this.overlay(m, t),
      result: showResult && this.summary ? this.resultState(m, this.summary) : null,
      hint: this.hintOn(m, t),
      guide:
        this.guide && m.practice && m.phase === 'play' && !this.guide.finished
          ? this.guideState(m, this.guide)
          : null,
    });
  }

  /* ------------------------------------------------------------------ long-distance play */

  /**
   * The stage for far-away screens: every MIRROR_MS while cooking, at once when `now`, when
   * effects were noted or the phase changed.
   */
  private publishMirror(now: boolean): void {
    if (!this.game.mirrored) return;
    const t = this.clock.now();
    const m = this.stage === 'round' ? this.match : null;
    const phase = m ? `${m.phase}${m.practice ? '-p' : ''}` : this.stage;
    const urgent = now || this.feed.pending || phase !== this.mirrorPhase;
    if (!urgent && t - this.lastMirror < MIRROR_MS) return;
    this.lastMirror = t;
    this.mirrorPhase = phase;
    const g = this.guide;
    this.game.publish(
      this.feed.pack({
        server: this.game.now(),
        held: this.clock.paused,
        setup: m ? null : this.setupInfo(),
        round: m
          ? {
              match: m,
              t,
              overlay: this.overlay(m, t),
              hint: this.hintOn(m, t),
              showResult: this.showsResult(m, t),
              result: this.summary ? this.resultInfo(m, this.summary) : null,
              guide: g && m.practice && m.phase === 'play' && !g.finished ? this.guideSource(m, g) : null,
            }
          : null,
      }),
    );
  }
}
