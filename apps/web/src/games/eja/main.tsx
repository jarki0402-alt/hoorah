/**
 * Juara Eja entry: connects to the Hoorah shell, mounts the paper stage and drives the pure match
 * from SDK events and a frame loop. Side effects (voice, sound, adaptive music, confetti, phone
 * views, the solo record) all happen here, in response to match events.
 */
import type { ControllerToGame } from '@hoorah/protocol';
import { connect, type HoorahGame, type MusicIntensity } from '@hoorah/sdk';
import { signal } from '@preact/signals';
import { render } from 'preact';
import { celebrate } from '../../shared/confetti';
import { submitRecord } from '../common/records';
import { fontsReady, mountStage } from '../common/stage';
import { loadJson, saveJson } from '../common/store';
import { DEFAULT_WORDS, type EjaEvent, EjaMatch, type Phase } from './logic';
import { buildResult } from './results';
import { EjaScreen, type FinalRecord, FrameBus, type ScreenModel } from './screen';
import { Speaker } from './speech';
import { STR } from './strings';
import { viewFor } from './views';
import './eja.css';

const FALLBACK_TICK_MS = 250;
const RECENT_KEY = 'eja.recent';
const RECENT_MAX = 160;
const TICK_FROM_S = 5;
const HURRY_FROM_MS = 10_000;
/** Replays closer together than this are ignored (several phones tapping at once). */
const REPLAY_GAP_MS = 2_000;
/** The word is read again shortly after typing opens, for whoever missed it. */
const SECOND_READ_MS = 4_500;
/** When the letters have flipped and the verdict sounds play. */
const VERDICT_MS = 1_300;

function wordsFrom(settings: HoorahGame['settings']): number {
  const raw = Number(settings.rounds);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : DEFAULT_WORDS;
}

function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] ?? Date.now();
}

function presence(game: HoorahGame) {
  return game.allPlayers.map((p) => ({ id: p.id, connected: p.connected }));
}

class EjaDriver implements ScreenModel {
  readonly version = signal(0);
  readonly frame = new FrameBus();
  readonly hint = signal(false);
  readonly speaking = signal(false);
  readonly record = signal<FinalRecord | null>(null);
  private readonly sent = new Map<number, string>();
  private readonly speaker = new Speaker();
  private shellPaused: boolean;
  private ended = false;
  private raf = 0;
  private interval = 0;
  private lastTickKey = '';
  private hurry = false;
  private intensity: MusicIntensity = 0;
  private lastReplay = 0;
  private readId = 0;

  constructor(
    private readonly game: HoorahGame,
    readonly match: EjaMatch,
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
    this.setMusic();
    this.syncViews();
  }

  /** Read the current word aloud (screen button or a phone's "Dengar lagi"). */
  replay = (): void => {
    const m = this.match;
    if (m.phase !== 'intro' && m.phase !== 'spell') return;
    const now = performance.now();
    if (now - this.lastReplay < REPLAY_GAP_MS) return;
    this.lastReplay = now;
    this.read();
  };

  private read(): void {
    const word = this.match.word;
    if (!word) return;
    const id = ++this.readId;
    if (!this.speaker.hasVoice(this.match.lang)) {
      this.hint.value = true;
      return;
    }
    this.speaking.value = true;
    this.setMusic();
    void this.speaker.speak(word.word, this.match.lang).then((ok) => {
      if (id !== this.readId || this.ended) return;
      if (!ok) this.hint.value = true;
      // The utterance is short: release the "speaking" state after a moment either way.
      window.setTimeout(
        () => {
          if (id !== this.readId) return;
          this.speaking.value = false;
          this.setMusic();
        },
        ok ? 1_400 : 0,
      );
    });
  }

  private step(): void {
    const events = this.match.tick(this.game.now());
    if (events.length) this.handle(events);
    this.clockSounds();
    this.frame.emit();
  }

  private clockSounds(): void {
    const m = this.match;
    const timed = m.phase === 'spell' && !m.held;
    const left = m.msLeft();
    const hurry = timed && left > 0 && left <= HURRY_FROM_MS;
    if (hurry !== this.hurry) {
      this.hurry = hurry;
      this.game.musicHurry(hurry);
    }
    if (!timed || left <= 0) return;
    const s = Math.ceil(left / 1000);
    if (s > TICK_FROM_S) return;
    const key = `${m.index}:${s}`;
    if (key === this.lastTickKey) return;
    this.lastTickKey = key;
    this.game.sfx(s % 2 === 0 ? 'tock' : 'tick');
  }

  private intensityFor(phase: Phase): MusicIntensity {
    if (this.speaking.value) return 0;
    switch (phase) {
      case 'spell':
        return this.match.tier as MusicIntensity;
      case 'intro':
      case 'reveal':
      case 'final':
      case 'ended':
        return 1;
      default:
        return 0;
    }
  }

  private setMusic(): void {
    const level = this.intensityFor(this.match.phase);
    if (level === this.intensity) return;
    this.intensity = level;
    this.game.musicIntensity(level);
  }

  private later(fn: () => void, ms: number): void {
    window.setTimeout(() => {
      if (!this.ended) fn();
    }, ms);
  }

  private handle(events: EjaEvent[]): void {
    for (const e of events) {
      if (e.type === 'phase') this.onPhase(e.phase);
      else if (e.type === 'locked') this.game.sfx('tick');
    }
    this.setMusic();
    this.version.value++;
    this.syncViews();
  }

  private onPhase(phase: Phase): void {
    const m = this.match;
    switch (phase) {
      case 'intro':
        this.hint.value = !this.speaker.hasVoice(m.lang);
        this.game.sfx(m.multiplier > 1 && m.index > 0 && m.tier === 3 ? 'round' : 'select');
        this.lastReplay = performance.now();
        this.later(() => this.read(), 500);
        break;
      case 'spell': {
        this.game.sfx('go');
        const index = m.index;
        this.later(() => {
          if (this.match.phase === 'spell' && this.match.index === index && this.match.waiting.length > 0) {
            this.lastReplay = performance.now();
            this.read();
          }
        }, SECOND_READ_MS);
        break;
      }
      case 'reveal': {
        this.speaker.stop();
        this.readId++;
        this.speaking.value = false;
        this.game.sfx('reveal');
        const table = m.table;
        const right = table.filter((s) => s.verdict === 'correct').length;
        const outs = table.filter((s) => s.lives === 0 && !s.practice && s.verdict !== 'correct').length;
        this.later(() => {
          if (right === table.length && right > 0) {
            this.game.sfx('perfect');
            celebrate();
          } else if (right > 0) this.game.sfx('correct');
          else this.game.sfx('wrong');
          if (outs > 0) this.later(() => this.game.sfx('stinger-fall'), 500);
        }, VERDICT_MS);
        break;
      }
      case 'final': {
        this.speaker.stop();
        this.game.sfx('stinger-win');
        this.later(celebrate, 300);
        if (m.solo) {
          const me = m.roster[0];
          if (me) this.record.value = submitRecord('eja', m.lang, me.stats.bestStreak);
        }
        break;
      }
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
    this.speaker.stop();
    this.game.musicHurry(false);
    this.game.end(buildResult(this.match, (id) => this.game.player(id)?.name ?? 'Pemain'));
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
    let events: EjaEvent[] = [];
    switch (a.id) {
      case 'pick':
        if (isHost && typeof a.value === 'string') m.pick(a.value);
        break;
      case 'start':
        if (isHost) events = m.start(now);
        break;
      case 'word':
        if (typeof a.value === 'string' && a.value.length <= 40) events = m.submit(from, a.value, now);
        break;
      case 'replay':
        this.replay();
        return;
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
    if (hold) {
      this.speaker.stop();
      if (this.hurry) {
        this.hurry = false;
        this.game.musicHurry(false);
      }
    }
    this.version.value++;
    if (!hold) this.syncViews();
  }

  private syncViews(): void {
    const now = this.game.now();
    const ctx = { hostId: this.hostId(), name: (id: number) => this.game.player(id)?.name ?? '?' };
    for (const p of this.game.players) {
      const view = viewFor(this.match, p.id, now, ctx);
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

function loadRecent(): string[] {
  const raw = loadJson<unknown>(RECENT_KEY, []);
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
}

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;
  let game: HoorahGame;
  try {
    game = await connect();
  } catch {
    const { stage } = mountStage(root);
    render(<div class="ej-noshell">{STR.noShell}</div>, stage);
    return;
  }
  const { stage } = mountStage(root);
  await fontsReady();
  const recent = loadRecent();
  const match = new EjaMatch({
    words: wordsFrom(game.settings),
    seed: randomSeed(),
    now: game.now(),
    players: presence(game),
    recent: new Set(recent),
  });
  const driver = new EjaDriver(game, match);
  let saved = 0;
  driver.frame.subscribe(() => {
    if (match.played.length === saved) return;
    saved = match.played.length;
    const next = [...recent.filter((k) => !match.played.includes(k)), ...match.played].slice(-RECENT_MAX);
    saveJson(RECENT_KEY, next);
  });
  if (import.meta.env.DEV) (window as unknown as { __eja?: EjaMatch }).__eja = match;
  render(<EjaScreen model={driver} />, stage);
  game.ready();
  game.music('eja');
  driver.start();
  window.setInterval(() => driver.refresh(), 500);
}

void boot();
