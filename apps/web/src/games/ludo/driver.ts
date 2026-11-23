/**
 * Glue between the Hoorah SDK, the pure rules and the main-screen view: owns the game clock
 * (frozen while paused) and turns logic events into sounds, pawn animations, phone views and
 * HUD state.
 */
import type { ControllerToGame, ControllerView, PlayerInfo } from '@hoorah/protocol';
import type { GameResult, HoorahGame } from '@hoorah/sdk';
import type { Sfx } from '../../shared/audio';
import { celebrate, confetti } from '../../shared/confetti';
import { cpuSkill, isCpu, reportSoloResult } from '../common/cpu';
import { actDelay, choosePawn, ludoOpponents } from './brain';
import { GameClock } from './clock';
import { SWATCH } from './colors';
import { type BoardGeom, geometryFor, layoutPawns, type PawnRef, pawnPoint } from './geometry';
import {
  BASE,
  clampPawns,
  HOP_MS,
  type LudoEvent,
  LudoLogic,
  type MoveInfo,
  type MoveOption,
  PICK_MS,
  ROLL_MS,
  standings,
} from './logic';
import { buildResult, headline, seatTitle } from './results';
import type { Banner, LudoStore, PlayerCard, SeatCard } from './store';
import { joinNames, STR } from './strings';
import * as V from './views';

const TOAST_MS = 1700;
/** The logic keeps ticking even if rAF is throttled. */
const FALLBACK_TICK_MS = 250;

function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] ?? Date.now();
}

export class LudoDriver {
  readonly clock: GameClock;
  private logicRef: LudoLogic | null = null;
  private readonly sent = new Map<number, string>();
  /** One-off phone screens (roll result, pass) that stay until the next turn view. */
  private readonly transient = new Map<number, ControllerView>();
  private finalViews: Map<number, ControllerView> | null = null;
  private result: GameResult | null = null;
  private connected = new Set<number>();
  private seq = 0;
  private lastCount = 0;
  private raf = 0;
  private interval = 0;
  private ended = false;
  private rollId = 0;
  private banner: Banner | null = null;
  /** Computer opponents (solo play only), seated after the human. */
  private cpus: PlayerInfo[] = [];
  private skill = 0;
  /** The computer's next action for the current roll/pick, keyed by phase, roller and phase start. */
  private brainPlan: { key: string; at: number } | null = null;

  constructor(
    private readonly game: HoorahGame,
    private readonly store: LudoStore,
  ) {
    this.clock = new GameClock(() => game.now());
  }

  get logic(): LudoLogic {
    if (!this.logicRef) throw new Error('Ludo has not started');
    return this.logicRef;
  }

  private get geom(): BoardGeom {
    return geometryFor(this.logic.board);
  }

  start(): void {
    this.cpus = ludoOpponents(this.game.players);
    this.skill = cpuSkill(this.game.gameId);
    const roster = this.roster();
    this.connected = new Set(roster.filter((r) => r.connected).map((r) => r.id));
    this.logicRef = new LudoLogic({
      pawns: clampPawns(this.game.settings.rounds),
      roster,
      now: this.clock.now(),
      seed: randomSeed(),
    });
    // Dev-only hook for local harnesses (never in builds).
    if (import.meta.env.DEV) (window as unknown as { __ludo?: LudoLogic }).__ludo = this.logicRef;
    this.store.pawns.value = this.pawnRefs();
    this.game.on('players', () => this.onPlayers());
    this.game.on('action', (from, a) => this.onAction(from, a));
    this.game.on('pause', (p) => this.setPaused(p));
    if (this.game.paused) this.setPaused(true);
    this.flush();
    this.refreshHud();
    this.syncViews();
    const loop = () => {
      this.step();
      if (!this.ended) this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    this.interval = window.setInterval(() => this.step(), FALLBACK_TICK_MS);
  }

  private step(): void {
    const L = this.logicRef;
    if (!L) return;
    const now = this.clock.now();
    if (!this.ended) {
      L.tick(now);
      this.flush();
      if (!this.clock.paused) this.think(now);
    }
    const timed = (L.phase === 'roll' || L.phase === 'pick') && L.isConnected(L.roller);
    const total = L.phase === 'pick' ? PICK_MS : ROLL_MS;
    const left = Math.max(0, L.deadline - now);
    const secs = Math.ceil(left / 1000);
    if (timed && secs >= 1 && secs <= 3 && secs !== this.lastCount) {
      this.lastCount = secs;
      this.sfx('count');
    }
    this.store.frame(now, timed ? Math.min(1, left / total) : 1, secs, timed);
  }

  /* ---------------------------------------------------------------- SDK input */

  private roster() {
    return [
      ...this.game.allPlayers.map((p) => ({ id: p.id, connected: p.connected })),
      ...this.cpus.map((p) => ({ id: p.id, connected: true })),
    ];
  }

  /* ---------------------------------------------------------------- computer seats */

  /** Seats the brain plays: computer opponents, and dropped phones while someone is still here. */
  private brainSeat(id: number): boolean {
    if (isCpu(id)) return true;
    const p = this.game.player(id);
    return !!p && !p.connected && this.connected.size > 0;
  }

  /** Roll or pick for a computer seat once its thinking pause is over. */
  private think(now: number): void {
    const L = this.logic;
    if ((L.phase !== 'roll' && L.phase !== 'pick') || !this.brainSeat(L.roller)) {
      this.brainPlan = null;
      return;
    }
    const key = `${L.phase}:${L.roller}:${L.since}`;
    if (this.brainPlan?.key !== key) {
      const delay = actDelay(L.phase, this.skill, !isCpu(L.roller), L.options.length);
      this.brainPlan = { key, at: now + delay };
      return;
    }
    if (now < this.brainPlan.at) return;
    this.brainPlan = null;
    const ok =
      L.phase === 'roll'
        ? L.roll(L.roller, now)
        : L.pick(L.roller, choosePawn(L.board, L.options, L.seat, L.seats, this.skill) + 1, now);
    if (ok) this.flush();
  }

  /** Vibrate a human's phone (never a computer seat). */
  private buzz(id: number, pattern: number[]): void {
    if (!isCpu(id) && this.game.player(id)?.connected) this.game.vibrate(id, pattern);
  }

  private onPlayers(): void {
    if (!this.logicRef) return;
    const now = new Set(this.game.allPlayers.filter((p) => p.connected).map((p) => p.id));
    for (const id of now) if (!this.connected.has(id)) this.sent.delete(id);
    this.connected = now;
    if (!this.ended) {
      this.logicRef.setRoster(this.roster(), this.clock.now());
      this.flush();
    }
    this.updateHold();
    this.refreshHud();
    this.syncViews();
  }

  private onAction(from: number, a: ControllerToGame): void {
    const L = this.logicRef;
    if (!L || this.ended || this.clock.paused || a.k !== 'action') return;
    const now = this.clock.now();
    let ok = false;
    if (a.id === 'drop' || a.id === 'roll') ok = L.roll(from, now);
    else if (a.id === 'answer' || a.id === 'pick') ok = L.pick(from, Number(a.value), now);
    else return;
    if (ok) this.flush();
    else {
      // Late or out of turn: make sure the phone shows the real state again.
      this.sent.delete(from);
      this.syncViews();
    }
  }

  private shellPaused = false;

  private setPaused(paused: boolean): void {
    this.shellPaused = paused;
    this.updateHold();
  }

  /** Freeze the game while the shell is paused or nobody is connected. */
  private updateHold(): void {
    const nobody = this.connected.size === 0 && !this.ended;
    const hold = this.shellPaused || nobody;
    if (hold === this.clock.paused) return;
    if (hold) this.clock.pause();
    else this.clock.resume();
    this.store.paused.value = hold;
    for (const anim of document.getAnimations()) {
      if (hold) anim.pause();
      else anim.play();
    }
    // Deadlines are sent in server time, which shifted while paused.
    if (!hold) {
      this.sent.clear();
      this.syncViews();
    }
  }

  /* ---------------------------------------------------------------- events */

  private flush(): void {
    const L = this.logicRef;
    if (!L) return;
    const events = L.drain();
    if (!events.length) return;
    for (const e of events) this.handle(e);
    this.refreshHud();
    this.syncViews();
  }

  private handle(e: LudoEvent): void {
    const L = this.logic;
    switch (e.type) {
      case 'intro': {
        const first = L.seats[0]?.player;
        this.banner = {
          kind: 'intro',
          key: ++this.seq,
          first: first !== undefined ? STR.firstTurn(this.name(first)) : null,
          note: L.board.sides > 4 ? STR.boardNote(L.board.sides) : null,
        };
        this.sfx('reveal');
        return;
      }
      case 'turn':
        if (this.banner?.kind === 'intro') {
          this.banner = null;
          this.sfx('go');
        }
        this.transient.clear();
        this.lastCount = 0;
        if (L.isConnected(e.player)) {
          this.buzz(e.player, [70, 40, 70]);
          if (!e.bonus) this.sfx('ready');
        }
        return;
      case 'roll':
        this.rollId++;
        this.sfx('clap');
        this.transient.set(e.player, V.rolledView(null));
        window.setTimeout(() => {
          if (this.ended) return;
          this.sfx(e.value === 6 ? 'correct' : 'drop');
        }, 820);
        return;
      case 'pick':
        this.transient.delete(e.player);
        return;
      case 'move':
        this.onMove(e.move);
        return;
      case 'pass': {
        const needSix = this.needsSix(e.seat);
        this.transient.set(e.player, V.passView(e.reason, needSix));
        this.sfx(e.reason === 'triple' ? 'boo' : 'wrong');
        if (e.reason === 'triple') this.showToast(STR.toastTriple, STR.toastTripleSub, 'bad');
        else this.showToast(STR.toastNone, STR.toastNoneSub(needSix), 'bad');
        return;
      }
      case 'finish':
        this.onFinish(e.seat);
        return;
      case 'end':
        this.finish();
        return;
    }
  }

  private needsSix(seat: number): boolean {
    const L = this.logic;
    const t = L.seats[seat]!;
    return t.pawns.every((p) => p === BASE || p >= L.board.home);
  }

  private onMove(m: MoveInfo): void {
    const L = this.logic;
    const prev = this.store.pawns.value;
    const g = this.geom;
    const before = layoutPawns(g, prev, L.pawnCount);
    const next = this.pawnRefs();
    const after = layoutPawns(g, next, L.pawnCount);
    this.store.pawns.value = next;
    const t = L.seats[m.seat]!;
    const key = `${m.seat}-${m.pawn}`;
    const find = (list: typeof before, k: string) => list.find((p) => `${p.seat}-${p.pawn}` === k);
    const from = find(before, key);
    const to = find(after, key);
    const walk = m.path.length * HOP_MS;
    if (from && to) {
      const pts = m.path.map((p) => pawnPoint(g, t.color, p, m.pawn, L.pawnCount));
      this.store.animateMove(key, from, pts, to, HOP_MS);
    }
    // Footsteps: a soft tick per square.
    for (let i = 0; i < m.path.length; i++) {
      window.setTimeout(
        () => {
          if (!this.clock.paused) this.sfx(m.exit ? 'jump' : 'tick');
        },
        i * HOP_MS + HOP_MS * 0.8,
      );
    }
    this.transient.set(m.player, V.rolledView(L.dice));
    if (m.captures.length) {
      const victims = m.captures.map((c) => seatTitle(L, c.seat, (id) => this.name(id)));
      const uniq = [...new Set(victims)];
      for (const c of m.captures) {
        const k = `${c.seat}-${c.pawn}`;
        const a = find(before, k);
        const b = find(after, k);
        if (a && b) this.store.animateHomeward(k, a, b, walk);
      }
      const end = to ?? from;
      window.setTimeout(() => {
        if (this.ended) return;
        this.sfx('hit');
        this.sfx('cheer');
        if (end)
          this.store.addBurst({
            id: ++this.seq,
            x: end.x,
            y: end.y,
            color: SWATCH[t.color].main,
            until: this.clock.now() + 900,
          });
        this.showToast(STR.toastCapture(this.name(m.player), joinNames(uniq)), null, 'capture');
      }, walk);
      for (const c of m.captures) this.buzz(L.seats[c.seat]!.player, [200, 60, 200]);
    } else if (m.home) {
      window.setTimeout(() => {
        if (this.ended) return;
        this.sfx('perfect');
        this.showToast(STR.toastHome(STR.color(t.color)), null, 'home');
      }, walk);
    }
  }

  private onFinish(seat: number): void {
    const L = this.logic;
    const t = L.seats[seat]!;
    this.result = this.makeResult();
    this.reportSolo(seat);
    const rows = standings(L);
    const head = headline(L, (id) => this.name(id));
    this.finalViews = new Map();
    for (const r of rows) {
      const id = L.seats[r.seat]!.player;
      const s = L.stats.get(id)!;
      this.finalViews.set(
        id,
        V.finalView({
          rank: r.rank,
          headline: head,
          home: r.home,
          pawns: L.pawnCount,
          captures: s.captures,
          sixes: s.sixes,
        }),
      );
    }
    this.banner = {
      kind: 'finale',
      key: ++this.seq,
      title: STR.finaleTitle(seatTitle(L, seat, (id) => this.name(id)).toUpperCase()),
      sub: STR.finaleSub(L.pawnCount),
      winners: [this.card(t.player)],
      color: t.color,
    };
    this.sfx('win');
    celebrate();
    window.setTimeout(() => confetti({ y: 0.4, count: 90, power: 0.8 }), 600);
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    cancelAnimationFrame(this.raf);
    window.clearInterval(this.interval);
    this.game.end(this.result ?? this.makeResult());
  }

  private makeResult(): GameResult {
    const r = buildResult(this.logic, (id) => this.name(id));
    return this.cpus.length ? { ...r, cpuPlayers: this.cpus } : r;
  }

  private soloReported = false;

  /** A solo game against the computer just ended: nudge its skill for next time. */
  private reportSolo(winner: number): void {
    if (!this.cpus.length || this.soloReported) return;
    this.soloReported = true;
    const won = !isCpu(this.logic.seats[winner]!.player);
    reportSoloResult(this.game.gameId, won ? 'win' : 'lose');
  }

  private showToast(
    text: string,
    sub: string | null,
    tone: 'six' | 'capture' | 'home' | 'bad' | 'exit',
  ): void {
    this.store.toast.value = { id: ++this.seq, text, sub, tone, until: this.clock.now() + TOAST_MS };
  }

  /* ---------------------------------------------------------------- HUD + views */

  private pawnRefs(): PawnRef[] {
    const L = this.logic;
    return L.seats.flatMap((t) =>
      t.pawns.map((progress, pawn) => ({ seat: t.index, color: t.color, pawn, progress })),
    );
  }

  private info(id: number): PlayerInfo | undefined {
    return this.game.player(id) ?? this.cpus.find((p) => p.id === id);
  }

  private name(id: number): string {
    return this.info(id)?.name ?? STR.unknownPlayer;
  }

  private card(id: number): PlayerCard {
    const p = this.info(id);
    return {
      id,
      name: p?.name ?? STR.unknownPlayer,
      fruit: p?.fruit ?? 'semangka',
      color: p?.color ?? '#C4C7CC',
      connected: p?.connected ?? false,
    };
  }

  private refreshHud(): void {
    const L = this.logic;
    const live = L.phase !== 'intro' && L.phase !== 'finale' && L.phase !== 'ended';
    const seats: SeatCard[] = L.seats.map((t) => ({
      index: t.index,
      color: t.color,
      player: this.card(t.player),
      pawns: [...t.pawns],
      home: L.homeCount(t),
      active: live && t.index === L.current,
      winner: L.winner === t.index,
    }));
    const t = L.seat;
    const auto = !L.isConnected(t.player);
    let hint = '';
    switch (L.phase) {
      case 'roll':
        hint = auto
          ? STR.hintRollAuto
          : this.needsSix(t.index)
            ? `${STR.hintRoll} ${STR.hintNeedSix}`
            : STR.hintRoll;
        break;
      case 'rolling':
        hint = STR.hintRolling;
        break;
      case 'pick':
        hint = STR.hintPick;
        break;
      case 'moving':
        hint = STR.hintMoving;
        break;
      default:
        hint = '';
    }
    this.store.model.value = {
      pawnsPer: L.pawnCount,
      sides: L.board.sides,
      colors: L.seats.map((x) => x.color),
      seats,
      turn: live
        ? { seat: t.index, color: t.color, player: this.card(L.roller), bonus: L.bonus, auto }
        : null,
      dice: L.dice,
      rolling: L.phase === 'rolling',
      rollId: this.rollId,
      hint,
      six: live && L.dice === 6 && L.phase !== 'rolling' && L.sixes < 3,
      over: L.phase === 'finale' || L.phase === 'ended',
      legal: L.phase === 'pick' ? this.legalKeys(t.index, L.options) : [],
      banner: this.banner,
    };
  }

  /** Every pawn the roller may move (pawns sharing a square all bounce). */
  private legalKeys(seat: number, options: readonly MoveOption[]): string[] {
    const t = this.logic.seats[seat]!;
    const froms = new Set(options.map((o) => o.from));
    return t.pawns.flatMap((p, i) => (froms.has(p) ? [`${seat}-${i}`] : []));
  }

  private victimNames = (o: MoveOption): string => {
    const L = this.logic;
    const names = [...new Set(o.captures.map((c) => seatTitle(L, c.seat, (id) => this.name(id))))];
    return joinNames(names);
  };

  private viewFor(id: number): ControllerView {
    if (this.finalViews) return this.finalViews.get(id) ?? V.spectatorView();
    const L = this.logic;
    const mine = L.seatOf(id);
    if (L.phase === 'intro') return V.introView(mine ? mine.color : null);
    const tr = this.transient.get(id);
    if (tr) return tr;
    const t = L.seat;
    if (id === L.roller) {
      if (L.phase === 'roll')
        return V.rollView(t.color, L.bonus, this.needsSix(t.index), this.clock.toServer(L.deadline));
      if (L.phase === 'pick')
        return V.pickView(
          L.board,
          t.color,
          L.dice ?? 1,
          L.options,
          this.victimNames,
          this.clock.toServer(L.deadline),
        );
      return V.rolledView(L.dice);
    }
    let doing = STR.phoneWatchRoll;
    if (L.phase === 'pick') doing = STR.phoneWatchPick(L.dice ?? 1);
    else if ((L.phase === 'moving' || L.phase === 'pass') && L.dice !== null)
      doing = STR.phoneWatchMove(L.dice);
    else if (L.phase === 'rolling') doing = STR.hintRolling.toLowerCase();
    return V.watchView({
      rollerId: L.roller,
      rollerName: this.name(L.roller),
      rollerColor: t.color,
      doing,
      myColor: mine ? mine.color : null,
      myHome: mine ? L.homeCount(mine) : 0,
      pawns: L.pawnCount,
    });
  }

  private syncViews(): void {
    if (!this.logicRef || this.clock.paused) return;
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
}
