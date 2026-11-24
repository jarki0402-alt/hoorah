/**
 * Catur entry: connects to the Hoorah shell, mounts the main-screen stage and drives the pure
 * match logic from SDK events and a frame loop. Side effects (sound, vibration, confetti, phone
 * views) all happen here, in response to logic events.
 */
import type { ControllerToGame, PlayerInfo } from '@hoorah/protocol';
import { connect, type GameAward, type GameResult, type HoorahGame } from '@hoorah/sdk';
import { type Signal, signal } from '@preact/signals';
import { render } from 'preact';
import type { Sfx } from '../../shared/audio';
import { celebrate } from '../../shared/confetti';
import { cpuSkill, isCpu, reportSoloResult, soloOpponents, thinkMs } from '../common/cpu';
import { fontsReady, mountStage } from '../common/stage';
import { loadJson, saveJson } from '../common/store';
import { boardString, type Color, uci } from './chess';
import { chooseMove } from './engine';
import { type CaturEvent, CaturMatch, type PlayedMove, type PlayerPresence, rankings } from './logic';
import { toMirror } from './mirror';
import { CaturReplica } from './replica';
import { reconcile, type Sprite, spritesFrom } from './sprites';
import { STR } from './strings';
import { CaturTv, FrameBus, type StageSize, type TvModel } from './tv';
import { boardView, resultView } from './views';
import './catur.css';

const DEFAULT_MINUTES = 3;
/** Logic keeps ticking even if rAF is throttled (e.g. the main-screen tab loses focus). */
const FALLBACK_TICK_MS = 250;
const NOTICE_MS = 2600;
/** Engine strength when it plays for a seat or team whose phones dropped. */
const TAKEOVER_SKILL = 0.5;
/** Pause before such a move: 1.5 to 3 s instead of waiting out the whole clock. */
const takeoverDelay = () => 1500 + Math.round(Math.random() * 1500);
/** Main-screen memory of the colour the human gets in the next solo game. */
const SOLO_COLOR_KEY = 'catur.soloColor';

function minutesFrom(settings: HoorahGame['settings']): number {
  const raw = Number(settings.rounds);
  return Number.isFinite(raw) && raw >= 1 && raw <= 60 ? Math.floor(raw) : DEFAULT_MINUTES;
}

function presenceOf(game: HoorahGame, cpus: readonly PlayerInfo[]): PlayerPresence[] {
  return [...game.allPlayers, ...cpus].map((p) => ({ id: p.id, connected: p.connected }));
}

/** Solo games alternate colours: white first, then black, and so on. */
function nextSoloColor(): Color {
  const c = loadJson<string>(SOLO_COLOR_KEY, 'w') === 'b' ? 'b' : 'w';
  saveJson(SOLO_COLOR_KEY, c === 'w' ? 'b' : 'w');
  return c;
}

/** Who the engine plays for on this turn, and how well. */
interface AutoSeat {
  by: number[];
  skill: number;
  /** The solo opponent (thinks like a person) rather than a takeover. */
  cpu: boolean;
}

interface AutoPlan extends AutoSeat {
  key: number;
  thinkAt: number;
  playAt: number;
  move: string | null;
}

function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] ?? Date.now();
}

class CaturDriver implements TvModel {
  readonly version = signal(0);
  readonly frame = new FrameBus();
  sprites: Sprite[];
  notice: string | null = null;
  private noticeTimer = 0;
  private readonly lastSent = new Map<number, string>();
  private ended = false;
  private raf = 0;
  private interval = 0;
  private readonly skill: number;
  private plan: AutoPlan | null = null;
  private reported = false;

  constructor(
    private readonly game: HoorahGame,
    readonly match: CaturMatch,
    /** Computer opponents (solo only). */
    private readonly cpus: PlayerInfo[],
  ) {
    this.skill = cpuSkill(game.gameId);
    this.sprites = spritesFrom(boardString(match.pos));
    game.on('players', () => this.onPlayers());
    game.on('action', (from, action) => this.onAction(from, action));
    game.on('pause', (paused) => {
      this.match.setHeld(paused, this.game.now());
      this.bump();
    });
    // Long-distance play: a far-away main screen that starts watching gets the whole state.
    game.on('mirrors', (on) => {
      if (on) this.publish();
    });
    if (game.paused) this.match.setHeld(true, game.now());
  }

  info = (id: number) => this.game.player(id) ?? this.cpus.find((p) => p.id === id);

  start(): void {
    const loop = () => {
      this.step();
      if (!this.ended) this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    this.interval = window.setInterval(() => this.step(), FALLBACK_TICK_MS);
    this.syncViews();
  }

  private step(): void {
    const now = this.game.now();
    const events = this.match.tick(now);
    if (events.length) this.handle(events);
    this.autoTurn(now);
    this.frame.emit(now);
  }

  /* ---------------------------------------------------------------- computer moves */

  /** The side to move is the solo opponent, or nobody is there to play it. */
  private autoSeat(): AutoSeat | null {
    const m = this.match;
    const ids = m.sides[m.turn];
    const someoneHere = this.game.players.length > 0;
    if (ids.length === 0) return null;
    if (m.mode === 'duel') {
      const id = ids[0]!;
      if (isCpu(id)) return { by: [id], skill: this.skill, cpu: true };
      if (m.sides.w.includes(id) && m.sides.b.includes(id)) return null;
      return !m.isConnected(id) && someoneHere ? { by: [id], skill: TAKEOVER_SKILL, cpu: false } : null;
    }
    return ids.every((id) => !m.isConnected(id)) && someoneHere
      ? { by: [], skill: TAKEOVER_SKILL, cpu: false }
      : null;
  }

  /** How long the solo opponent "thinks": quick in the opening and with one legal move. */
  private cpuThinkMs(now: number): number {
    const m = this.match;
    if (m.moves.length === 1) return thinkMs(this.skill, 500, 900);
    let ms = thinkMs(this.skill, 1000, 3200);
    if (m.history.length < 6) ms *= 0.6;
    // Never burn more than a twentieth of what is left on its own clock.
    return Math.round(Math.max(400, Math.min(ms, m.timeLeft(m.turn, now) / 20)));
  }

  /**
   * Plans, searches and plays the engine's move over several frames: a pause first, the search
   * (capped at about 120 ms) shortly after, the move when the pause ends. Its clock runs all the
   * while, like anyone else's.
   */
  private autoTurn(now: number): void {
    const m = this.match;
    const seat = m.running ? this.autoSeat() : null;
    if (!seat) {
      this.plan = null;
      return;
    }
    const key = m.history.length;
    if (this.plan?.key !== key || this.plan.cpu !== seat.cpu) {
      const ms = seat.cpu ? this.cpuThinkMs(now) : takeoverDelay();
      this.plan = { ...seat, key, thinkAt: now + Math.min(400, ms * 0.4), playAt: now + ms, move: null };
      return;
    }
    const plan = this.plan;
    if (plan.move === null) {
      if (now < plan.thinkAt) return;
      const res = chooseMove(m.pos, { skill: plan.skill, repeats: (p) => m.timesSeen(p) });
      plan.move = uci(res.move);
      return;
    }
    if (now < plan.playAt) return;
    this.plan = null;
    const events = m.autoMove(plan.move, plan.by, now);
    if (events.length) this.handle(events);
  }

  private sfx(name: Sfx, delayMs = 0): void {
    if (delayMs > 0) window.setTimeout(() => this.game.sfx(name), delayMs);
    else this.game.sfx(name);
  }

  private handle(events: CaturEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'start':
          this.sfx('go');
          this.buzzTurn();
          break;
        case 'move':
          this.onMove(e.move, e.random);
          break;
        case 'vote':
          this.sfx('tick');
          break;
        case 'low':
          this.sfx(e.seconds <= 5 ? 'count' : 'tick');
          break;
        case 'over':
          this.onOver();
          break;
        case 'ended':
          this.finish();
          break;
      }
    }
    this.bump();
  }

  private bump(): void {
    this.version.value++;
    this.syncViews();
    this.publish();
  }

  /** Long-distance play: what this screen shows, for far-away main screens (only while watched). */
  private publish(): void {
    if (!this.game.mirrored) return;
    this.game.publish(toMirror(this.match, boardString(this.match.pos), this.notice, this.info));
  }

  private onMove(move: PlayedMove, random: boolean): void {
    this.sprites = reconcile(this.sprites, boardString(this.match.pos), move.uci);
    if (move.check) this.sfx('ding', 120);
    if (move.promo) this.sfx('perfect', 80);
    if (move.castle) this.sfx('flip');
    else this.sfx(move.captured ? 'drop' : 'chop');
    if (random) this.showNotice(STR.voteRandom);
    else if (this.match.mode === 'team') this.showNotice(null);
    if (this.match.phase === 'play') this.buzzTurn();
  }

  /** A short buzz on the phones whose turn it now is. */
  private buzzTurn(): void {
    for (const id of this.match.sides[this.match.turn]) {
      if (this.match.isConnected(id) && !isCpu(id)) this.game.vibrate(id, 40);
    }
  }

  private showNotice(text: string | null): void {
    window.clearTimeout(this.noticeTimer);
    this.notice = text;
    if (text) {
      this.noticeTimer = window.setTimeout(() => {
        this.notice = null;
        this.version.value++;
        this.publish();
      }, NOTICE_MS);
    }
  }

  private onOver(): void {
    const out = this.match.outcome;
    if (!out) return;
    this.reportSolo();
    if (out.winner) {
      this.sfx(out.reason === 'checkmate' ? 'win' : 'whistle', 350);
      window.setTimeout(celebrate, 700);
      for (const c of ['w', 'b'] as const) {
        for (const id of this.match.sides[c]) {
          if (this.match.isConnected(id) && !isCpu(id))
            this.game.vibrate(id, c === out.winner ? [80, 50, 160] : [60, 40, 60]);
        }
      }
    } else {
      this.sfx('reveal', 350);
    }
  }

  /** Solo game over: nudges the computer's skill for next time (once, from the human's side). */
  private reportSolo(): void {
    const out = this.match.outcome;
    const human = this.game.allPlayers[0];
    if (this.reported || !out || this.cpus.length === 0 || !human) return;
    const color = this.match.sides.w.includes(human.id)
      ? 'w'
      : this.match.sides.b.includes(human.id)
        ? 'b'
        : null;
    if (!color) return;
    this.reported = true;
    reportSoloResult(this.game.gameId, out.winner === null ? 'draw' : out.winner === color ? 'win' : 'lose');
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    cancelAnimationFrame(this.raf);
    window.clearInterval(this.interval);
    this.game.end(this.result());
  }

  private nameOf = (id: number) => this.info(id)?.name ?? STR.unknownPlayer;

  private sideName(c: 'w' | 'b'): string {
    if (this.match.mode === 'team') return STR.team(c);
    const id = this.match.sides[c][0];
    return id === undefined ? STR.color[c] : this.nameOf(id);
  }

  private result(): GameResult {
    const m = this.match;
    const out = m.outcome;
    const ranking = rankings(m, (c, won) =>
      won === null ? STR.rankDraw(c) : won ? STR.rankWin(c) : STR.rankLose(c),
    );
    const loser = out?.winner ? (out.winner === 'w' ? 'b' : 'w') : m.turn;
    const reason = out ? STR.reason(out.reason, this.sideName(loser)) : '';
    const awards: GameAward[] = [];
    const ids = ranking.map((r) => r.playerId);
    const best = (key: 'captured' | 'moves') => {
      let top: number | null = null;
      let val = 0;
      for (const id of ids) {
        const v = m.stats.get(id)?.[key] ?? 0;
        if (v > val) {
          val = v;
          top = id;
        }
      }
      return top === null ? null : { id: top, val };
    };
    const hunter = best('captured');
    if (hunter)
      awards.push({
        playerId: hunter.id,
        title: STR.awardHunter,
        desc: STR.awardHunterDesc(hunter.val),
        icon: 'target',
      });
    if (m.mode === 'team') {
      const voice = best('moves');
      if (voice)
        awards.push({
          playerId: voice.id,
          title: STR.awardVoice,
          desc: STR.awardVoiceDesc(voice.val),
          icon: 'brain',
        });
    }
    const last = m.lastMove();
    if (out?.reason === 'checkmate' && last && last.by[0] !== undefined) {
      awards.push({ playerId: last.by[0], title: STR.awardMate, desc: STR.awardMateDesc, icon: 'crown' });
    }
    return {
      title: out?.winner ? STR.finalWinner(this.sideName(out.winner)) : STR.finalDraw,
      subtitle: STR.finalSub(reason, m.history.length),
      ranking,
      awards,
      ...(this.cpus.length ? { cpuPlayers: this.cpus } : {}),
    };
  }

  private onPlayers(): void {
    const now = this.game.now();
    this.match.syncPlayers(presenceOf(this.game, this.cpus), now);
    const connected = new Set(this.game.players.map((p) => p.id));
    for (const id of [...this.lastSent.keys()]) if (!connected.has(id)) this.lastSent.delete(id);
    this.bump();
  }

  private onAction(from: number, action: ControllerToGame): void {
    if (action.k !== 'action') return;
    const now = this.game.now();
    let events: CaturEvent[] = [];
    if (action.id === 'move') events = this.match.submit(from, action.value, now);
    else if (action.id === 'resign') events = this.match.resign(from, now);
    else return;
    if (events.length) {
      this.handle(events);
    } else {
      // Rejected (late, out of turn, illegal): make sure the phone shows the real state.
      this.lastSent.delete(from);
      this.syncViews();
    }
  }

  /** Send each connected phone its view if it changed. */
  private syncViews(): void {
    const over = this.match.phase === 'over' || this.match.phase === 'ended';
    for (const p of this.game.players) {
      const view = over ? resultView(this.match, p.id) : boardView(this.match, p.id, this.nameOf, this.cpus);
      const key = JSON.stringify(view);
      if (this.lastSent.get(p.id) === key) continue;
      this.lastSent.set(p.id, key);
      this.game.setView(p.id, view);
    }
  }
}

function MirrorRoot({ replica, size }: { replica: CaturReplica; size: Signal<StageSize> }) {
  return replica.shown.value ? <CaturTv model={replica} size={size} /> : null;
}

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;
  let game: HoorahGame;
  try {
    game = await connect();
  } catch {
    const { stage } = mountStage(root);
    render(<div class="ct-noshell">{STR.noShell}</div>, stage);
    return;
  }
  const { stage, width, height, onResize } = mountStage(root);
  const size = signal<StageSize>({ w: width(), h: height() });
  onResize((h, w) => {
    size.value = { w, h };
  });
  await fontsReady();
  if (game.isMirror) {
    // Long-distance play: draw the Host's match, run nothing of our own.
    const replica = new CaturReplica(game);
    render(<MirrorRoot replica={replica} size={size} />, stage);
    replica.start();
    game.ready();
    return;
  }
  // Playing alone: one computer opponent joins (PRD 6.4), colours alternate between games.
  const cpus = soloOpponents(game.allPlayers, 1);
  const human = game.allPlayers[0];
  const cpu = cpus[0];
  let seats: { w: number; b: number } | undefined;
  if (human && cpu) seats = nextSoloColor() === 'w' ? { w: human.id, b: cpu.id } : { w: cpu.id, b: human.id };
  const match = new CaturMatch({
    seed: randomSeed(),
    minutes: minutesFrom(game.settings),
    now: game.now(),
    players: presenceOf(game, cpus),
    ...(seats ? { seats } : {}),
  });
  const driver = new CaturDriver(game, match, cpus);
  // Dev-only hook for local harnesses (never in builds).
  if (import.meta.env.DEV) (window as unknown as { __catur?: CaturMatch }).__catur = match;
  render(<CaturTv model={driver} size={size} />, stage);
  game.ready();
  game.music('catur');
  driver.start();
}

void boot();
