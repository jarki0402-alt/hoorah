/**
 * Glue between the Hoorah SDK, the pure rules, the DOM board and the HUD: owns the game clock
 * (frozen while paused), animates tokens and dice from the logic's move plans, turns logic
 * events into sounds, phone views and HUD state.
 */
import type { ControllerToGame, ControllerView, PlayerInfo, RelayedInput } from '@hoorah/protocol';
import type { GameResult, HoorahGame } from '@hoorah/sdk';
import type { Sfx } from '../../shared/audio';
import { celebrate } from '../../shared/confetti';
import { cpuSkill, isCpu, reportSoloResult } from '../common/cpu';
import { FRAME } from './art';
import { cellCenter, crowdOffset, jumpPoint, type Pt, parseSize } from './board';
import { DuelTapper, rollDelay, soloOutcome, ularOpponents } from './brain';
import type { Banner, HudModel, HudPlayer, HudStore, PlayerCard } from './hud';
import type { Layout } from './layout';
import {
  DUEL_BACK,
  DUEL_INTRO_MS,
  DUEL_MS,
  GameClock,
  HOP_MS,
  jumpMs,
  type MovePlan,
  ROLL_MS,
  type UlarEvent,
  UlarLogic,
} from './logic';
import { buildResult } from './results';
import { STR } from './strings';
import * as V from './views';

const TICK_MS = 100;
const REACTION_GAP_MS = 700;
const BUBBLE_MS = 2600;
const SHOUT_MS = 1700;
const LAST_BANNER_MS = 2600;
/** Duelists' tap views refresh at most this often. */
const DUEL_VIEW_MS = 250;
const PULL_SFX_MS = 120;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const easeIn = (k: number) => k * k * (1.6 - 0.6 * k);

interface TokenState {
  /** Smoothed crowd offset (cell units). */
  ox: number;
  oy: number;
  /** Last written transform, to skip identical writes. */
  css: string;
  z: number;
  active: boolean | null;
}

interface PlanFx {
  hop: number;
  settled: boolean;
  jumped: boolean;
}

interface PendingView {
  id: number;
  view: ControllerView;
  at: number;
}

export class UlarDriver {
  readonly clock: GameClock;
  onPause: (paused: boolean) => void = () => {};

  private L!: UlarLogic;
  private layout!: Layout;
  private readonly sent = new Map<number, string>();
  private readonly transient = new Map<number, ControllerView>();
  private pending: PendingView[] = [];
  private finalViews: Map<number, ControllerView> | null = null;
  private result: GameResult | null = null;
  private readonly plans = new Map<number, MovePlan>();
  private readonly planFx = new Map<number, PlanFx>();
  private lastDicePlan: MovePlan | null = null;
  private readonly tokens = new Map<number, TokenState>();
  private readonly reactAt = new Map<number, number>();
  private connected = new Set<number>();
  private seq = 0;
  private timer = 0;
  private raf = 0;
  private ended = false;
  private lastCount = 0;
  private lastDuelSync = 0;
  private lastPull = 0;
  private extra = false;
  private bannerUntil = 0;
  private hudJson = '';
  /** Computer opponents (solo play only), seated after the human. */
  private cpus: PlayerInfo[] = [];
  private skill = 0;
  /** The human of a solo game (for the adaptive skill report). */
  private soloHuman: number | null = null;
  /** When the brain rolls for the current turn, keyed by player and roll deadline. */
  private brainRoll: { key: string; at: number } | null = null;
  /** Duel tappers for seats the brain plays, keyed by duel start. */
  private tappers = new Map<number, DuelTapper>();
  private tappersFor = -1;

  constructor(
    private readonly game: HoorahGame,
    private readonly hud: HudStore,
  ) {
    this.clock = new GameClock(() => game.now());
  }

  get logic(): UlarLogic {
    return this.L;
  }

  setLayout(layout: Layout): void {
    this.layout = layout;
    this.hud.layout.value = layout;
    for (const t of this.tokens.values()) t.css = '';
  }

  start(): void {
    const size = parseSize(this.game.settings.rounds);
    this.cpus = ularOpponents(this.game.players);
    this.skill = cpuSkill(this.game.gameId);
    this.soloHuman = this.cpus.length ? (this.game.players[0]?.id ?? null) : null;
    this.connected = new Set(this.game.allPlayers.filter((p) => p.connected).map((p) => p.id));
    this.L = new UlarLogic({
      size,
      roster: this.roster(),
      now: this.clock.now(),
      seed: (Math.random() * 0x7fffffff) | 0,
    });
    this.game.on('players', () => this.onPlayers());
    this.game.on('action', (from, a) => this.onAction(from, a));
    this.game.on('input', (input) => this.onInput(input));
    this.game.on('pause', (p) => this.setPaused(p));
    if (this.game.paused) this.setPaused(true);
    this.flush();
    this.refreshHud();
    this.syncViews();
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
    const loop = () => {
      this.frame();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /* ---------------------------------------------------------------- SDK input */

  /**
   * The logic's view of who can take a turn: computer seats and dropped phones (the brain plays
   * them) count as present while at least one human is here; with nobody here the game waits.
   */
  private roster() {
    const anyone = this.connected.size > 0;
    return [
      ...this.game.allPlayers.map((p) => ({ id: p.id, connected: anyone })),
      ...this.cpus.map((p) => ({ id: p.id, connected: anyone })),
    ];
  }

  /** A real phone is connected for this seat (computer seats always count as online). */
  private online(id: number): boolean {
    return isCpu(id) || !!this.game.player(id)?.connected;
  }

  /** Seats the brain plays right now. */
  private brainSeat(id: number): boolean {
    return this.connected.size > 0 && (isCpu(id) || !this.online(id));
  }

  /** Vibrate a human's phone (never a computer seat). */
  private buzz(id: number, pattern: number[]): void {
    if (!isCpu(id) && this.game.player(id)?.connected) this.game.vibrate(id, pattern);
  }

  /* ---------------------------------------------------------------- computer seats */

  private think(now: number): void {
    const L = this.L;
    if (L.phase === 'roll' && L.current !== null && this.brainSeat(L.current)) {
      const key = `${L.current}:${L.deadline}`;
      if (this.brainRoll?.key !== key) {
        this.brainRoll = { key, at: now + rollDelay(this.skill, !isCpu(L.current)) };
      } else if (now >= this.brainRoll.at) {
        this.brainRoll = null;
        if (L.roll(L.current, now)) this.flush();
      }
    } else {
      this.brainRoll = null;
    }
    const d = L.duel;
    if (L.phase !== 'duel' || !d) return;
    if (this.tappersFor !== d.start) {
      this.tappersFor = d.start;
      this.tappers.clear();
    }
    for (const id of [d.a, d.b]) {
      if (!this.brainSeat(id)) {
        this.tappers.delete(id);
        continue;
      }
      let t = this.tappers.get(id);
      if (!t) {
        t = new DuelTapper(this.skill, Math.max(d.start, now));
        this.tappers.set(id, t);
      }
      const n = t.advance(Math.min(now, d.end));
      if (n > 0 && L.addTaps(id, n, now) > 0) this.onTapped(now);
    }
  }

  private onPlayers(): void {
    if (this.ended) return;
    const now = new Set(this.game.allPlayers.filter((p) => p.connected).map((p) => p.id));
    for (const id of now) if (!this.connected.has(id)) this.sent.delete(id);
    this.connected = now;
    this.L.setRoster(this.roster(), this.clock.now());
    this.flush();
    this.refreshHud();
    this.syncViews();
  }

  private onAction(from: number, a: ControllerToGame): void {
    if (this.ended || this.clock.paused || a.k !== 'action') return;
    switch (a.id) {
      case 'drop':
      case 'roll':
        if (this.L.roll(from, this.clock.now())) this.flush();
        return;
      case 'cheer':
      case 'boo':
      case 'rematch':
        this.react(from, a.id);
        return;
      default:
        return;
    }
  }

  private onInput(input: RelayedInput & { atMs: number }): void {
    if (this.ended) return;
    if (this.clock.paused) {
      this.L.absorbTaps(input.from, input.taps);
      return;
    }
    const now = this.clock.now();
    if (this.L.tap(input.from, input.taps, now) > 0) this.onTapped(now);
  }

  private onTapped(now: number): void {
    this.updateDuelHud();
    if (now - this.lastPull >= PULL_SFX_MS) {
      this.lastPull = now;
      this.sfx('pull');
    }
  }

  private setPaused(paused: boolean): void {
    if (paused === this.clock.paused) return;
    if (paused) this.clock.pause();
    else this.clock.resume();
    this.hud.paused.value = paused;
    this.onPause(paused);
    // Deadlines go to the phones in server time, which shifted while paused.
    if (!paused) this.syncViews();
  }

  private react(from: number, kind: 'cheer' | 'boo' | 'rematch'): void {
    const now = this.clock.now();
    if (now - (this.reactAt.get(from) ?? Number.NEGATIVE_INFINITY) < REACTION_GAP_MS) return;
    if (!this.game.player(from)) return;
    this.reactAt.set(from, now);
    this.sfx(kind === 'boo' ? 'boo' : kind === 'cheer' ? 'cheer' : 'clap');
    const text = kind === 'cheer' ? STR.reactCheer : kind === 'boo' ? STR.reactBoo : STR.reactRematch;
    this.hud.addBubble({ id: ++this.seq, who: this.card(from), text, tone: kind, until: now + BUBBLE_MS });
  }

  /* ---------------------------------------------------------------- time */

  private tick(): void {
    if (this.ended) return;
    const now = this.clock.now();
    this.L.tick(now);
    this.flush();
    if (!this.clock.paused) this.think(now);
    if (this.pending.length) {
      const due = this.pending.filter((p) => p.at <= now);
      if (due.length) {
        this.pending = this.pending.filter((p) => p.at > now);
        for (const p of due) this.transient.set(p.id, p.view);
      }
    }
    if (this.banner()?.kind === 'last' && now >= this.bannerUntil) this.hud.banner.value = null;
    // Roll countdown beeps in the last three seconds.
    if (this.L.phase === 'roll') {
      const secs = Math.ceil((this.L.deadline - now) / 1000);
      if (secs >= 1 && secs <= 3 && secs !== this.lastCount) {
        this.lastCount = secs;
        this.sfx('count');
      }
    }
    if (this.L.phase === 'duelIntro' && this.L.duel) {
      const v = this.duelCountValue(now);
      if (v !== this.lastCount) {
        this.lastCount = v;
        this.sfx('count');
      }
    }
    this.hud.expire(now);
    this.refreshHud();
    if (this.L.phase !== 'duel' || now - this.lastDuelSync >= DUEL_VIEW_MS) {
      this.lastDuelSync = now;
      this.syncViews();
    }
  }

  private duelCountValue(now: number): number {
    const d = this.L.duel!;
    return Math.max(1, Math.ceil((d.start - now) / (DUEL_INTRO_MS / 3)));
  }

  /* ---------------------------------------------------------------- events */

  private flush(): void {
    const events = this.L.drain();
    if (!events.length) return;
    for (const e of events) this.handle(e);
    this.refreshHud();
    this.syncViews();
  }

  private handle(e: UlarEvent): void {
    const L = this.L;
    const now = this.clock.now();
    switch (e.type) {
      case 'intro': {
        const first = L.upcoming();
        this.hud.banner.value = {
          kind: 'intro',
          key: ++this.seq,
          title: STR.introTitle,
          sub: STR.introSub(L.size, L.maxRounds),
          first: first !== null ? STR.introFirst(this.name(first)) : null,
          rules: STR.introRules,
        };
        return;
      }
      case 'round':
        if (e.last && L.maxRounds > 1) {
          this.sfx('tension');
          this.bannerUntil = now + LAST_BANNER_MS;
          this.hud.banner.value = {
            kind: 'last',
            key: ++this.seq,
            title: STR.shoutLastRound,
            sub: STR.shoutLastRoundSub,
          };
        }
        return;
      case 'turn':
        this.transient.clear();
        this.pending = [];
        this.lastCount = 0;
        this.extra = e.extra;
        this.hud.card.value = null;
        this.hud.duel.value = null;
        if (this.banner()?.kind === 'intro') {
          this.hud.banner.value = null;
          this.sfx('go');
        } else {
          this.sfx('ready');
        }
        this.buzz(e.playerId, [80, 40, 80]);
        return;
      case 'skip': {
        this.transient.clear();
        this.hud.card.value = null;
        this.hud.duel.value = null;
        this.extra = false;
        this.transient.set(e.playerId, V.skipView());
        this.sfx('leave');
        const at = this.pxOf(L.player(e.playerId)!.pos);
        this.hud.addShout({
          id: ++this.seq,
          x: at.x,
          y: at.y,
          text: STR.shoutSkip,
          sub: STR.shoutSkipSub(this.name(e.playerId)),
          tone: 'bad',
          until: now + SHOUT_MS,
        });
        return;
      }
      case 'move':
        this.onMove(e.plan);
        return;
      case 'card':
        this.sfx('reveal');
        this.hud.card.value = { key: ++this.seq, who: this.card(e.playerId), id: e.card };
        this.transient.set(e.playerId, V.cardView(e.card));
        return;
      case 'duelIntro': {
        this.hud.card.value = null;
        this.sfx('whistle');
        this.lastCount = 0;
        this.buzz(e.duel.a, [120, 60, 120]);
        this.buzz(e.duel.b, [120, 60, 120]);
        this.updateDuelHud();
        return;
      }
      case 'duelStart':
        this.sfx('go');
        this.updateDuelHud();
        return;
      case 'duelEnd': {
        const d = e.duel;
        this.sfx(d.winner === null ? 'back' : 'correct');
        this.updateDuelHud();
        const nameA = this.name(d.a);
        const nameB = this.name(d.b);
        const outcome = (me: number): 'win' | 'lose' | 'tie' =>
          d.winner === null ? 'tie' : d.winner === me ? 'win' : 'lose';
        this.transient.set(d.a, V.duelResultView(outcome(d.a), d.tapsA, d.tapsB, nameB, DUEL_BACK));
        this.transient.set(d.b, V.duelResultView(outcome(d.b), d.tapsB, d.tapsA, nameA, DUEL_BACK));
        if (d.winner !== null) this.buzz(d.winner === d.a ? d.b : d.a, [200, 80, 200]);
        return;
      }
      case 'waiting':
        return;
      case 'finale':
        this.onFinale(e.winner);
        return;
      case 'end':
        this.ended = true;
        window.clearInterval(this.timer);
        this.game.end(this.result ?? this.buildResult());
        return;
    }
  }

  private onMove(plan: MovePlan): void {
    this.plans.set(plan.playerId, plan);
    this.planFx.set(plan.id, { hop: 0, settled: plan.kind !== 'dice', jumped: false });
    if (plan.kind === 'dice') {
      this.lastDicePlan = plan;
      this.sfx('throw');
      this.transient.set(plan.playerId, V.movingView(plan.playerId, plan.dice ?? 0));
    }
    if (plan.kind === 'card') this.hud.card.value = null;
    if (plan.kind === 'duel') this.hud.duel.value = null;
    const land = V.landView(plan);
    if (land) this.pending.push({ id: plan.playerId, view: land, at: plan.end - 200 });
  }

  private onFinale(winner: number | null): void {
    const L = this.L;
    this.hud.card.value = null;
    this.hud.duel.value = null;
    this.result = this.buildResult();
    const standings = L.standings();
    if (this.soloHuman !== null) {
      reportSoloResult(this.game.gameId, soloOutcome(standings, winner, this.soloHuman));
      this.soloHuman = null;
    }
    const title = this.result.title;
    this.finalViews = new Map(standings.map((s) => [s.id, V.finalView(s, title)]));
    this.hud.banner.value = {
      kind: 'finale',
      key: ++this.seq,
      title,
      sub: L.endReason === 'finish' ? STR.finaleFinish(L.last) : STR.finaleCap,
      winner: winner !== null ? this.card(winner) : null,
    };
    celebrate();
    this.sfx('win');
  }

  private buildResult(): GameResult {
    const L = this.L;
    const r = buildResult(L.standings(), {
      reason: L.endReason ?? 'cap',
      rounds: L.round,
      name: (id) => this.name(id),
    });
    return this.cpus.length ? { ...r, cpuPlayers: this.cpus } : r;
  }

  private banner(): Banner | null {
    return this.hud.banner.value;
  }

  private updateDuelHud(): void {
    const d = this.L.duel;
    if (!d) return;
    const stage = this.L.phase === 'duelIntro' ? 'intro' : this.L.phase === 'duel' ? 'live' : 'result';
    const prev = this.hud.duel.value;
    this.hud.duel.value = {
      key: prev && prev.a.id === d.a && prev.b.id === d.b ? prev.key : ++this.seq,
      a: this.card(d.a),
      b: this.card(d.b),
      tapsA: d.tapsA,
      tapsB: d.tapsB,
      stage,
      winner: d.winner,
    };
  }

  /* ---------------------------------------------------------------- per frame */

  private pxOf(n: number): Pt {
    const c = cellCenter(this.L.board, n);
    const cell = this.layout.cell;
    return { x: FRAME + c.x * cell, y: FRAME + c.y * cell };
  }

  /** Token position in cell units and its hop height, for game time `now`. */
  private tokenAt(id: number, now: number): { p: Pt; lift: number; moving: boolean } {
    const L = this.L;
    const plan = this.plans.get(id);
    if (!plan || now >= plan.end)
      return { p: cellCenter(L.board, L.player(id)!.pos), lift: 0, moving: false };
    const fx = this.planFx.get(plan.id)!;
    if (now < plan.hopStart) return { p: cellCenter(L.board, plan.from), lift: 0, moving: true };
    if (!fx.settled) {
      fx.settled = true;
      this.sfx('drop');
    }
    const k = (now - plan.hopStart) / HOP_MS;
    if (k < plan.path.length) {
      const i = Math.floor(k);
      const u = k - i;
      if (i + 1 > fx.hop) {
        fx.hop = i + 1;
        this.sfx('jump');
        const sq = plan.path[i]!;
        if (plan.bounced && sq === L.last) this.bounceShout();
      }
      const a = cellCenter(L.board, i === 0 ? plan.from : plan.path[i - 1]!);
      const b = cellCenter(L.board, plan.path[i]!);
      const e = easeInOut(u);
      return {
        p: { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e },
        lift: Math.sin(Math.PI * u) * 0.42,
        moving: true,
      };
    }
    const j = plan.jump;
    if (now >= plan.jumpStart && !fx.jumped && (j || plan.blocked)) {
      fx.jumped = true;
      this.jumpFx(plan);
    }
    if (!j || now < plan.jumpStart) return { p: cellCenter(L.board, plan.landed), lift: 0, moving: true };
    const u = clamp01((now - plan.jumpStart) / jumpMs(L.board, j));
    const t = j.kind === 'snake' ? easeIn(u) : easeInOut(u);
    return {
      p: jumpPoint(L.board, j, t),
      lift: j.kind === 'ladder' ? Math.sin(Math.PI * u) * 0.12 : 0,
      moving: true,
    };
  }

  private jumpFx(plan: MovePlan): void {
    const now = this.clock.now();
    const at = this.pxOf(plan.landed);
    const name = this.name(plan.playerId);
    if (plan.blocked) {
      this.sfx('ding');
      this.hud.addShout({
        id: ++this.seq,
        x: at.x,
        y: at.y,
        text: STR.shoutBlocked,
        sub: STR.shoutBlockedSub,
        tone: 'good',
        until: now + SHOUT_MS,
      });
      return;
    }
    const j = plan.jump!;
    const ladder = j.kind === 'ladder';
    this.sfx(ladder ? 'lap' : 'wrong');
    if (!ladder) this.buzz(plan.playerId, [160, 60, 160]);
    this.hud.addShout({
      id: ++this.seq,
      x: at.x,
      y: at.y,
      text: ladder ? STR.shoutLadder : STR.shoutSnake,
      sub: STR.climbSub(name, j.from, j.to),
      tone: ladder ? 'good' : 'bad',
      until: now + SHOUT_MS,
    });
  }

  private bounceShout(): void {
    const now = this.clock.now();
    const at = this.pxOf(this.L.last);
    this.sfx('back');
    this.hud.addShout({
      id: ++this.seq,
      x: at.x,
      y: at.y,
      text: STR.shoutBounce,
      sub: STR.shoutBounceSub(this.L.last),
      tone: 'info',
      until: now + SHOUT_MS,
    });
  }

  frame(): void {
    if (!this.L || !this.layout) return;
    const now = this.clock.now();
    const L = this.L;
    const cell = this.layout.cell;
    const size = Math.round(cell * 0.66);
    // Group resting tokens by square so they can share it.
    const resting = new Map<number, number[]>();
    const where = new Map<number, ReturnType<UlarDriver['tokenAt']>>();
    for (const id of L.order) {
      const w = this.tokenAt(id, now);
      where.set(id, w);
      if (!w.moving) {
        const sq = L.player(id)!.pos;
        const list = resting.get(sq);
        if (list) list.push(id);
        else resting.set(sq, [id]);
      }
    }
    const active = L.phase === 'roll' ? L.current : null;
    for (const id of L.order) {
      const el = this.hud.tokens.get(id);
      if (!el) continue;
      let st = this.tokens.get(id);
      if (!st) {
        st = { ox: 0, oy: 0, css: '', z: 0, active: null };
        this.tokens.set(id, st);
      }
      const w = where.get(id)!;
      let tx = 0;
      let ty = 0;
      if (!w.moving) {
        const list = resting.get(L.player(id)!.pos)!;
        const o = crowdOffset(list.indexOf(id), list.length);
        tx = o.x;
        ty = o.y;
      }
      st.ox += (tx - st.ox) * 0.2;
      st.oy += (ty - st.oy) * 0.2;
      const crowd = w.moving ? 1 : (resting.get(L.player(id)!.pos)?.length ?? 1);
      const scale = w.moving ? 1.12 : crowd >= 4 ? 0.64 : crowd > 1 ? 0.78 : 1;
      const x = FRAME + (w.p.x + st.ox) * cell - size / 2;
      const y = FRAME + (w.p.y + st.oy - w.lift) * cell - size / 2;
      const css = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${scale})`;
      if (css !== st.css) {
        st.css = css;
        el.style.transform = css;
      }
      const z = w.moving ? 1000 : Math.round(y);
      if (z !== st.z) {
        st.z = z;
        el.style.zIndex = String(z);
      }
      const isActive = id === active;
      if (isActive !== st.active) {
        st.active = isActive;
        el.classList.toggle('is-active', isActive);
      }
    }
    // Dice: tumble until the plan's hops start, then show the face.
    const dp = this.lastDicePlan;
    if (L.phase === 'roll' || !dp) this.hud.setDie(0, false);
    else if (now < dp.hopStart) this.hud.setDie(1 + ((Math.floor(now / 85) * 5 + 3) % 6), true);
    else this.hud.setDie(dp.dice ?? 0, false);
    // Auto-roll ring.
    if (L.phase === 'roll') {
      const rem = Math.max(0, L.deadline - now);
      this.hud.setRing(rem / ROLL_MS, Math.ceil(rem / 1000));
    }
    // Duel clock.
    const d = L.duel;
    if (d && (L.phase === 'duelIntro' || L.phase === 'duel' || L.phase === 'duelResult')) {
      if (L.phase === 'duelIntro') this.hud.setDuelClock(1, String(this.duelCountValue(now)));
      else if (L.phase === 'duel') this.hud.setDuelClock(clamp01((d.end - now) / DUEL_MS), STR.duelGo);
      else this.hud.setDuelClock(0, 'VS');
    }
  }

  /* ---------------------------------------------------------------- HUD + views */

  private player(id: number): PlayerInfo | undefined {
    return this.game.player(id) ?? this.cpus.find((p) => p.id === id);
  }

  private name(id: number): string {
    return this.player(id)?.name ?? STR.unknownPlayer;
  }

  private card(id: number): PlayerCard {
    const p = this.player(id);
    return {
      id,
      name: p?.name ?? STR.unknownPlayer,
      fruit: p?.fruit ?? 'semangka',
      color: p?.color ?? '#C4C7CC',
    };
  }

  /** The square a player's token shows right now (no spoilers while it is still moving). */
  private shownPos(id: number, now: number): number {
    const plan = this.plans.get(id);
    if (plan && now < plan.end) return plan.from;
    return this.L.player(id)!.pos;
  }

  /** Ranks by shown square; ties share a rank. */
  private ranks(now: number): Map<number, number> {
    const L = this.L;
    const rows = L.order.map((id) => ({ id, pos: id === L.winner ? L.last + 1 : this.shownPos(id, now) }));
    rows.sort((a, b) => b.pos - a.pos);
    const out = new Map<number, number>();
    rows.forEach((r, i) => {
      const prev = rows[i - 1];
      out.set(r.id, prev && prev.pos === r.pos ? out.get(prev.id)! : i + 1);
    });
    return out;
  }

  private refreshHud(): void {
    const L = this.L;
    const now = this.clock.now();
    const ranks = this.ranks(now);
    const whoId =
      L.phase === 'intro' ? L.upcoming() : L.phase === 'finale' || L.phase === 'ended' ? L.winner : L.current;
    const players: HudPlayer[] = L.order.map((id) => {
      const p = L.player(id)!;
      return {
        ...this.card(id),
        pos: this.shownPos(id, now),
        rank: ranks.get(id) ?? 1,
        active: id === L.current && L.phase !== 'finale' && L.phase !== 'ended',
        offline: !this.online(id),
        shield: p.shield,
        skip: p.skip,
      };
    });
    let hint = '';
    switch (L.phase) {
      case 'intro':
        hint = STR.introRules;
        break;
      case 'roll':
        hint = STR.turnHint;
        break;
      case 'move': {
        const dp = this.lastDicePlan;
        if (L.plan?.kind === 'dice' && dp && now >= dp.hopStart) hint = STR.rolled(dp.dice ?? 0);
        break;
      }
      case 'card':
        hint = STR.cardEyebrow;
        break;
      case 'skip':
        hint = STR.shoutSkipSub(this.name(L.current ?? 0));
        break;
      case 'duelIntro':
      case 'duel':
      case 'duelResult':
        hint = STR.duelTitle;
        break;
      case 'waiting':
        hint = STR.waitingHint;
        break;
      default:
        break;
    }
    const model: HudModel = {
      size: L.size,
      round: L.round,
      maxRounds: L.maxRounds,
      lastRound: L.round > 0 && L.round === L.maxRounds,
      players,
      who: whoId !== null && whoId !== undefined ? this.card(whoId) : null,
      extra: this.extra && L.phase === 'roll',
      eyebrow:
        L.phase === 'intro'
          ? STR.turnFirst
          : L.phase === 'finale' || L.phase === 'ended'
            ? STR.turnWinner
            : this.extra && L.phase === 'roll'
              ? STR.turnExtra
              : STR.turnEyebrow,
      empty: L.phase === 'finale' || L.phase === 'ended' ? STR.finaleTie : STR.waitingTitle,
      hint,
      timer: L.phase === 'roll',
    };
    const json = JSON.stringify(model);
    if (json === this.hudJson) return;
    this.hudJson = json;
    this.hud.model.value = model;
  }

  private mine(id: number): V.Mine {
    const now = this.clock.now();
    const r = this.ranks(now);
    return { pos: this.shownPos(id, now), rank: r.get(id) ?? 1, total: this.L.order.length };
  }

  /** The next connected player after the current one (for the heads-up view). */
  private nextUp(): number | null {
    const L = this.L;
    if (L.current === null) return null;
    const i = L.order.indexOf(L.current);
    for (let k = 1; k < L.order.length; k++) {
      const id = L.order[(i + k) % L.order.length]!;
      if (L.player(id)?.connected) return id;
    }
    return null;
  }

  private viewFor(id: number): ControllerView {
    if (this.finalViews) return this.finalViews.get(id) ?? V.idleView();
    const L = this.L;
    const now = this.clock.now();
    const d = L.duel;
    const inDuel = d && (id === d.a || id === d.b);
    if (d && inDuel && (L.phase === 'duelIntro' || L.phase === 'duel')) {
      const other = id === d.a ? d.b : d.a;
      const color = this.card(id).color;
      if (L.phase === 'duelIntro')
        return V.duelCountView(this.duelCountValue(now), color, other, this.name(other));
      const me = id === d.a ? d.tapsA : d.tapsB;
      const them = id === d.a ? d.tapsB : d.tapsA;
      const elapsed = Math.max(0.5, (now - d.start) / 1000);
      const secs = Math.max(0, Math.ceil((d.end - now) / 1000));
      return V.duelTapView(color, this.name(other), secs, me, them, me / elapsed);
    }
    const t = this.transient.get(id);
    if (t) return t;
    switch (L.phase) {
      case 'intro': {
        const first = L.upcoming();
        return V.introView(L.size, first !== null ? this.name(first) : null);
      }
      case 'roll': {
        const cur = L.current!;
        if (cur === id) {
          return V.rollView(L.player(id)!.pos, L.last, this.clock.toServer(L.deadline), this.extra);
        }
        if (this.nextUp() === id) return V.nextView(id, this.mine(id));
        return V.watchView(cur, this.name(cur), this.mine(id));
      }
      case 'duelIntro':
      case 'duel':
      case 'duelResult':
        if (d) return V.duelWatchView(d.a, this.name(d.a), this.name(d.b), this.mine(id));
        return V.idleView();
      case 'move':
      case 'card':
      case 'skip': {
        const cur = L.current;
        if (cur === null) return V.idleView();
        return V.watchView(cur, this.name(cur), this.mine(id));
      }
      default:
        return V.idleView();
    }
  }

  private syncViews(): void {
    for (const p of this.game.allPlayers) {
      if (!p.connected) continue;
      const view = this.withGuests(this.viewFor(p.id));
      const json = JSON.stringify(view);
      if (this.sent.get(p.id) === json) continue;
      this.sent.set(p.id, json);
      this.game.setView(p.id, view);
    }
  }

  /** Phones only know room players: describe any computer opponent the view shows by id. */
  private withGuests(view: ControllerView): ControllerView {
    if (!this.cpus.length) return view;
    const ids = new Set<number>();
    if ('avatarOf' in view && view.avatarOf !== undefined) ids.add(view.avatarOf);
    if ('opponents' in view && view.opponents) for (const id of view.opponents) ids.add(id);
    const guests = this.cpus
      .filter((c) => ids.has(c.id))
      .map((c) => ({ id: c.id, name: c.name, fruit: c.fruit, color: c.color }));
    return guests.length ? { ...view, guests } : view;
  }

  private sfx(name: Sfx): void {
    this.game.sfx(name);
  }

  dispose(): void {
    window.clearInterval(this.timer);
    cancelAnimationFrame(this.raf);
  }
}
