/**
 * Kampung Siluman entry: connects to the Hoorah shell, mounts the kampung stage and drives the
 * pure match from SDK events and a frame loop. The main screen is the guide, with sounds only
 * (no narrator voice): a countdown and a gong close everyone's eyes, each night role is called
 * by its own short sound, a weker closes eyes again and a rooster brings the morning. Nothing
 * vibrates at night. Side effects (sound, night and day music, confetti, phone views) all
 * happen here, in response to match events.
 */
import type { ControllerToGame } from '@hoorah/protocol';
import { connect, type HoorahGame, type MusicIntensity } from '@hoorah/sdk';
import { signal } from '@preact/signals';
import { render } from 'preact';
import { celebrate } from '../../shared/confetti';
import { fontsReady, mountStage } from '../common/stage';
import { type IntroCue, type NightRole, type Phase, type SilumanEvent, SilumanMatch, TIMING } from './logic';
import { buildResult } from './results';
import { FrameBus, type ScreenModel, SilumanScreen } from './screen';
import { STR } from './strings';
import { viewFor } from './views';
import './siluman.css';

const FALLBACK_TICK_MS = 250;
const TICK_FROM_S = 5;
const HURRY_FROM_MS = 10_000;
/** When the revealed card has turned over (matches the CSS: 1.2 s delay + 1.6 s turn). */
const FLIP_MS = 2_800;
const DAY_SONG = 'siluman';
const NIGHT_SONG = 'siluman-malam';

const CUE_SOUND: Record<IntroCue, string> = {
  siluman: 'growl',
  dukun: 'genta',
  tabib: 'flute',
  weker: 'weker',
  rooster: 'rooster',
};

const CALL_SOUND: Record<NightRole, string> = { siluman: 'growl', dukun: 'genta', tabib: 'flute' };
/** Room for the roar before the first heartbeat of the siluman's turn. */
const HEART_AFTER_CALL_MS = 2_600;

function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] ?? Date.now();
}

function presence(game: HoorahGame) {
  return game.allPlayers.map((p) => ({ id: p.id, connected: p.connected }));
}

class SilumanDriver implements ScreenModel {
  readonly version = signal(0);
  readonly frame = new FrameBus();
  private readonly sent = new Map<number, string>();
  /** Discussion: players looking at their own card instead of the suspect list. */
  private readonly cards = new Set<number>();
  private shellPaused: boolean;
  private ended = false;
  private raf = 0;
  private interval = 0;
  private lastTickKey = '';
  /** When the next heartbeat is due (performance.now ms); 0 = not beating. */
  private nextHeart = 0;
  private lastTally = 0;
  private hurry = false;
  private intensity: MusicIntensity = 0;
  private song: string | null = DAY_SONG;

  constructor(
    private readonly game: HoorahGame,
    readonly match: SilumanMatch,
  ) {
    this.shellPaused = game.paused;
    game.on('players', () => this.onPlayers());
    game.on('action', (from, action) => this.onAction(from, action));
    game.on('pause', (paused) => {
      this.shellPaused = paused;
      this.updateHold();
    });
    this.updateHold();
  }

  info = (id: number) => this.game.player(id);

  hostId = (): number | null =>
    this.game.players.find((p) => p.isHost)?.id ?? this.game.players[0]?.id ?? null;

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
    const events = this.match.tick(this.game.now());
    if (events.length) this.handle(events);
    this.clockSounds();
    this.heartbeat();
    this.tallySounds();
    this.frame.emit();
  }

  /**
   * Heartbeat through the siluman's turn (owner 2026-11-22): it never stops until every siluman
   * has picked a victim, and beats faster as the turn runs out.
   */
  private heartbeat(): void {
    const m = this.match;
    if (m.held || m.calling !== 'siluman' || m.silumanChosen) {
      this.nextHeart = 0;
      return;
    }
    const now = performance.now();
    if (this.nextHeart === 0) {
      this.nextHeart = now + HEART_AFTER_CALL_MS;
      return;
    }
    if (now < this.nextHeart) return;
    const left = Math.max(0, Math.min(1, m.msLeft() / TIMING.turnMs));
    this.game.sfx('heart');
    this.nextHeart = now + 520 + 420 * left;
  }

  /** Tick-tock: sparse through a night turn and dense in its last 5 s; the last seconds by day. */
  private clockSounds(): void {
    const m = this.match;
    if (m.held) return;
    const left = m.msLeft();
    const dayTimed = m.phase === 'discuss' || m.phase === 'defense' || m.phase === 'vote';
    const hurry = dayTimed && left > 0 && left <= HURRY_FROM_MS;
    if (hurry !== this.hurry) {
      this.hurry = hurry;
      this.game.musicHurry(hurry);
    }
    if (left <= 0) return;
    let key = '';
    let sound = 'tick';
    if (m.phase === 'night' && m.stage === 'open') {
      if (left <= 5_000) {
        const half = Math.ceil(left / 500);
        key = `n${m.night}:${m.turn}:h${half}`;
        sound = half % 2 === 0 ? 'tock' : 'tick';
      } else {
        const two = Math.ceil(left / 2_000);
        key = `n${m.night}:${m.turn}:t${two}`;
        sound = two % 2 === 0 ? 'tock' : 'tick';
      }
    } else if (m.phase === 'dusk') {
      key = `d${m.night}:${Math.ceil(left / 1000)}`;
    } else if (dayTimed) {
      const s = Math.ceil(left / 1000);
      if (s > TICK_FROM_S) return;
      key = `${m.phase}${m.night}:${s}`;
      sound = s % 2 === 0 ? 'tock' : 'tick';
    } else return;
    if (key === this.lastTickKey) return;
    // The first beat of a turn is the role's own call; skip the tick that would land on it.
    const fresh = m.phase === 'night' && left > TIMING.turnMs - 400;
    this.lastTickKey = key;
    if (!fresh) this.game.sfx(sound);
  }

  /** Each vote shown on the screen knocks like a kentongan, faster and faster. */
  private tallySounds(): void {
    const m = this.match;
    if (m.phase !== 'tally') {
      this.lastTally = 0;
      return;
    }
    const n = m.tallyShown();
    if (n <= this.lastTally) return;
    this.lastTally = n;
    const vote = m.tally?.order[n - 1];
    this.game.sfx(vote && vote.to === 0 ? 'select' : 'tock');
  }

  private intensityFor(): MusicIntensity {
    const m = this.match;
    switch (m.phase) {
      case 'night':
        if (m.stage !== 'open') return 0;
        return m.calling === 'siluman' ? 2 : 1;
      case 'dawn':
      case 'discuss':
      case 'final':
      case 'ended':
        return 1;
      case 'defense':
      case 'vote':
        return 2;
      case 'hunt':
      case 'tally':
      case 'reveal':
        return 3;
      default:
        return 0;
    }
  }

  private setSong(song: string | null): void {
    if (song === this.song) return;
    this.song = song;
    this.game.music(song);
    // A new song starts at intensity 0 with hurry off.
    this.intensity = 0;
    this.hurry = false;
  }

  private setMusic(): void {
    const level = this.intensityFor();
    if (level === this.intensity) return;
    this.intensity = level;
    this.game.musicIntensity(level);
  }

  private later(fn: () => void, ms: number): void {
    window.setTimeout(() => {
      if (!this.ended) fn();
    }, ms);
  }

  private handle(events: SilumanEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'phase':
          this.onPhase(e.phase);
          break;
        case 'cue':
          this.game.sfx(CUE_SOUND[e.cue]);
          break;
        case 'call':
          this.game.sfx(CALL_SOUND[e.role]);
          break;
        case 'close':
          this.game.sfx('weker');
          break;
        case 'ready':
        case 'locked':
          this.game.sfx('tick');
          break;
        case 'suspect':
          this.game.sfx('select');
          break;
        case 'shot':
          this.game.sfx('stinger-fall');
          break;
        case 'win':
          break;
      }
    }
    this.setMusic();
    this.version.value++;
    this.syncViews();
  }

  private onPhase(phase: Phase): void {
    const m = this.match;
    switch (phase) {
      case 'deal':
        this.game.sfx('round');
        for (const s of m.table) if (s.present) this.game.vibrate(s.id, 40);
        break;
      case 'dusk':
        // The day music fades: the countdown runs in silence before the gong.
        this.setSong(null);
        break;
      case 'night':
        this.game.sfx('night');
        this.setSong(NIGHT_SONG);
        break;
      case 'dawn':
        this.game.sfx('rooster');
        this.setSong(DAY_SONG);
        // After the crow: the alarm kentongan for a victim, morning birds for a quiet night.
        this.later(() => this.game.sfx(m.dawnVictim !== null ? 'kentongan' : 'birds'), 2_400);
        break;
      case 'hunt':
        this.game.sfx('tension');
        break;
      case 'discuss':
        this.cards.clear();
        this.game.sfx('round');
        break;
      case 'defense':
        this.game.sfx('whistle');
        break;
      case 'vote':
        this.cards.clear();
        this.game.sfx('bell');
        break;
      case 'tally':
        this.game.sfx('reveal');
        break;
      case 'reveal': {
        const out = m.tally?.out ?? null;
        if (out === null) {
          this.game.sfx('boo');
          break;
        }
        this.game.sfx('tension');
        const role = m.seat(out)?.role;
        this.later(() => {
          this.game.sfx('gong');
          this.game.sfx(role === 'siluman' ? 'stinger-win' : 'stinger-fall');
        }, FLIP_MS);
        break;
      }
      case 'final':
        this.setSong(DAY_SONG);
        if (m.winner === 'siluman') this.game.sfx('win-siluman');
        else {
          this.game.sfx('win-village');
          this.later(celebrate, 300);
        }
        break;
      case 'ended':
        this.finish();
        break;
      default:
        break;
    }
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    cancelAnimationFrame(this.raf);
    window.clearInterval(this.interval);
    this.game.musicHurry(false);
    this.game.end(buildResult(this.match));
  }

  private onPlayers(): void {
    this.match.syncPlayers(presence(this.game), this.game.now());
    const online = new Set(this.game.players.map((p) => p.id));
    for (const id of [...this.sent.keys()]) if (!online.has(id)) this.sent.delete(id);
    this.updateHold();
    this.version.value++;
    this.syncViews();
  }

  private onAction(from: number, a: ControllerToGame): void {
    if (a.k !== 'action') return;
    const m = this.match;
    const now = this.game.now();
    const isHost = from === this.hostId();
    const target = typeof a.value === 'string' && /^\d{1,9}$/.test(a.value) ? Number(a.value) : null;
    let events: SilumanEvent[] = [];
    switch (a.id) {
      case 'pick':
        if (m.phase === 'setup') {
          if (isHost && typeof a.value === 'string') m.pick(a.value);
        } else if (target !== null) {
          if (m.phase === 'night') events = m.nightPick(from, target, now);
          else if (m.phase === 'hunt') events = m.shoot(from, target, now);
          else if (m.phase === 'discuss') events = m.suspect(from, target, now);
          else if (m.phase === 'vote') events = m.vote(from, target, now);
        }
        break;
      case 'next':
        if (isHost) events = m.next(now);
        break;
      case 'back':
        if (isHost) m.back();
        break;
      case 'start':
        if (isHost) events = m.start(now);
        break;
      case 'skip':
        if (isHost) events = m.skipIntro(now);
        break;
      case 'ready':
        events = m.ready(from, now);
        break;
      case 'unready':
        events = m.unready(from, now);
        break;
      case 'card':
        if (m.phase === 'discuss') this.cards.add(from);
        break;
      case 'suspect':
        this.cards.delete(from);
        break;
      case 'done':
        events = m.doneDefending(from, now);
        break;
      case 'lock':
        events = m.lock(from, now);
        break;
      default:
        return;
    }
    if (events.length) this.handle(events);
    else {
      this.version.value++;
      this.syncViews();
    }
  }

  private updateHold(): void {
    const late = this.match.phase === 'final' || this.match.phase === 'ended';
    const hold = this.shellPaused || (this.game.players.length === 0 && !late);
    if (hold === this.match.held) return;
    this.match.setHeld(hold, this.game.now());
    if (hold && this.hurry) {
      this.hurry = false;
      this.game.musicHurry(false);
    }
    this.version.value++;
    if (!hold) this.syncViews();
  }

  private syncViews(): void {
    const ctx = {
      hostId: this.hostId(),
      name: (id: number) => this.game.player(id)?.name ?? '?',
      color: (id: number) => this.game.player(id)?.color ?? '#FFC928',
      showsCard: (id: number) => this.cards.has(id),
    };
    for (const p of this.game.players) {
      const view = viewFor(this.match, p.id, ctx);
      if (!view) continue;
      const key = JSON.stringify(view);
      if (this.sent.get(p.id) === key) continue;
      this.sent.set(p.id, key);
      this.game.setView(p.id, view);
    }
  }

  refresh(): void {
    this.syncViews();
  }
}

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;
  let game: HoorahGame;
  try {
    game = await connect();
  } catch {
    const { stage } = mountStage(root);
    render(<div class="sl-noshell">{STR.noShell}</div>, stage);
    return;
  }
  const { stage } = mountStage(root);
  await fontsReady();
  const match = new SilumanMatch({ seed: randomSeed(), now: game.now(), players: presence(game) });
  const driver = new SilumanDriver(game, match);
  if (import.meta.env.DEV) (window as unknown as { __siluman?: SilumanMatch }).__siluman = match;
  render(<SilumanScreen model={driver} />, stage);
  game.ready();
  game.music(DAY_SONG);
  driver.start();
  window.setInterval(() => driver.refresh(), 500);
}

void boot();
