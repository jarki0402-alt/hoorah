/**
 * Glue between the Hoorah SDK, the race rules, the 3D renderer and the DOM HUD. Runs the session:
 * the Host picks a mode and a circuit, everyone picks a bajaj colour and gets ready, the race runs
 * on a fixed-step loop (frozen while paused), and afterwards the Host chooses to race again, change
 * the mode or finish (the shell then shows the podium). Phone input drives karts; race events turn
 * into sounds, haptics, HUD call-outs and phone views.
 */
import {
  type ControllerToGame,
  type ControllerView,
  FRUITS,
  type Fruit,
  PLAYER_COLORS,
  type PlayerInfo,
  type RelayedInput,
} from '@hoorah/protocol';
import type { GameResult } from '@hoorah/sdk';
import type { Sfx } from '../../shared/audio';
import { celebrate } from '../../shared/confetti';
import { getArena } from './arena';
import { Flyover } from './flyover';
import type { HudStore, KartCard, MenuModel, VpInfo, VpModel } from './hud';
import { type Kart, type Mode, Race, type RaceEvent, type RacerSetup, STEP_MS } from './logic';
import { type MapLibrary, MUSIC } from './maps';
import { CIRCUITS, type CircuitId, type MapId } from './maps/types';
import { RaceView } from './raceview';
import { buildResult, finalRows } from './results';
import type { RaceRenderer, Viewport } from './scene';
import { Showroom } from './showroom';
import { formatDelta, formatTime, STR } from './strings';
import { getTrack } from './tracks';
import * as V from './views';

/** The slice of the SDK the driver uses (a mock implements it for the offline demo). */
export interface GameLike {
  readonly allPlayers: PlayerInfo[];
  readonly settings: Record<string, string | number | boolean>;
  readonly paused: boolean;
  on(event: 'players', fn: (players: PlayerInfo[]) => void): () => void;
  on(event: 'input', fn: (input: RelayedInput & { atMs: number }) => void): () => void;
  on(event: 'pause', fn: (paused: boolean) => void): () => void;
  on(event: 'action', fn: (from: number, action: ControllerToGame) => void): () => void;
  setView(to: number | 'all', view: ControllerView): void;
  vibrate(to: number | 'all', pattern: number | number[]): void;
  sfx(name: string): void;
  music(track: string | null): void;
  end(result: GameResult): void;
  ready(): void;
}

export type Step = 'mode' | 'map' | 'kart' | 'race' | 'post';

export function parseLaps(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 ? Math.min(5, Math.floor(n)) : 3;
}

const VIEW_SYNC_MS = 200;
const HUD_SYNC_MS = 100;
const CALLOUT_MS = 1600;
export const KART_TIMEOUT_MS = 30_000;
export const POST_TIMEOUT_MS = 25_000;
const ALL_READY_DELAY_MS = 900;

/** CPUs added for a mode and number of humans. */
export function cpuCount(mode: Mode, humans: number): number {
  switch (mode) {
    case 'gp':
      return Math.max(0, 6 - humans);
    case 'duel':
      return humans === 1 ? 1 : 0;
    case 'arena':
      return Math.max(0, 4 - humans);
    case 'time':
      return 0;
  }
}

/** Humans (join order, with their picked colours) behind the CPUs; CPUs get unused colours and fruits. */
export function buildRacers(
  players: readonly PlayerInfo[],
  mode: Mode,
  cpuNames: readonly string[],
  picks: ReadonlyMap<number, string> = new Map(),
): RacerSetup[] {
  const humans = players
    .slice(0, 8)
    .map((p) => ({ id: p.id, human: true, name: p.name, color: picks.get(p.id) ?? p.color, fruit: p.fruit }));
  const usedColors = new Set(humans.map((p) => p.color.toUpperCase()));
  const usedFruits = new Set(humans.map((p) => p.fruit));
  const freeColors = PLAYER_COLORS.filter((c) => !usedColors.has(c.toUpperCase()));
  const freeFruits: Fruit[] = [...FRUITS.filter((f) => !usedFruits.has(f)), ...FRUITS];
  const cpus: RacerSetup[] = [];
  for (let i = 0; i < cpuCount(mode, humans.length); i++) {
    cpus.push({
      id: -(i + 1),
      human: false,
      name: cpuNames[i % cpuNames.length]!,
      color: freeColors[i % Math.max(1, freeColors.length)] ?? PLAYER_COLORS[i % PLAYER_COLORS.length]!,
      fruit: freeFruits[i % freeFruits.length]!,
    });
  }
  return [...cpus, ...humans];
}

/** Split-screen layout for the number of human racers on a `W` x `H` stage (1280x720 on 16:9). */
export function layoutFor(humanKarts: readonly number[], H: number, W = 1280): Viewport[] {
  const n = humanKarts.length;
  const gap = 3;
  if (n <= 1) return [{ x: 0, y: 0, w: W, h: H, kind: n ? 'chase' : 'broadcast', kart: humanKarts[0] ?? 0 }];
  if (n === 2) {
    const h = Math.floor(H / 2);
    return [
      { x: 0, y: 0, w: W, h: h - gap, kind: 'chase', kart: humanKarts[0]! },
      { x: 0, y: h + gap, w: W, h: H - h - gap, kind: 'chase', kart: humanKarts[1]! },
    ];
  }
  if (n <= 4) {
    const h = Math.floor(H / 2);
    const half = Math.floor(W / 2);
    const cells: [number, number, number, number][] = [
      [0, 0, half - gap, h - gap],
      [half + gap, 0, W - half - gap, h - gap],
      [0, h + gap, half - gap, H - h - gap],
      [half + gap, h + gap, W - half - gap, H - h - gap],
    ];
    return cells.map(([x, y, w, hh], i) => ({
      x,
      y,
      w,
      h: hh,
      kind: i < n ? 'chase' : 'overview',
      kart: humanKarts[i] ?? humanKarts[0]!,
    }));
  }
  return [{ x: 0, y: 0, w: W, h: H, kind: 'broadcast', kart: humanKarts[0]! }];
}

/** Which map shows behind the mode menu. */
const MODE_PREVIEW: Record<Mode, MapId> = { gp: 'kota', duel: 'pantai', arena: 'arena', time: 'puncak' };
const FLY_START: Record<MapId, number> = { kota: 560, pantai: 190, puncak: 90, arena: 0 };

export class BajajDriver {
  step: Step = 'mode';
  mode: Mode = 'gp';
  circuit: CircuitId = 'kota';
  readonly picks = new Map<number, string>();
  readonly readySet = new Set<number>();
  race: Race | null = null;
  private view: RaceView | null = null;
  private showroom: Showroom | null = null;
  private result: GameResult | null = null;
  private paused = false;
  private ended = false;
  private acc = 0;
  private last = 0;
  private raf = 0;
  /** Menu clock (ms), frozen while paused. */
  private menuT = 0;
  private stepStart = 0;
  private allReadyAt = 0;
  private readonly sent = new Map<number, string>();
  private readonly spectators = new Set<number>();
  private readonly online = new Map<number, boolean>();
  private lastViewSync = 0;
  private lastHudSync = 0;
  private readonly sfxAt = new Map<string, number>();
  private calloutSeq = 0;
  private readonly calloutUntil: number[] = [];
  private countHideAt = 0;
  private stageW = 1280;
  private stageH = 720;
  private frames = 0;
  private fpsT = 0;
  private readonly prevBrake = new Map<number, boolean>();
  fps = 0;
  /** Called with the measured fps (rendered frames) once a second. */
  onFps: (fps: number) => void = () => {};
  /** Called after every rendered frame (the quality ladder). */
  onFrame: (now: number) => void = () => {};
  /** Frame pacing (30 fps cap on the ladder's last rung); every display frame when null. */
  pacer: { due(now: number): boolean } | null = null;

  constructor(
    private readonly game: GameLike,
    private readonly hud: HudStore,
    private readonly renderer: RaceRenderer,
    readonly maps: MapLibrary,
    private readonly seed = Math.floor(Math.random() * 1e9),
  ) {
    for (const p of game.allPlayers) this.online.set(p.id, p.connected);
  }

  get laps(): number {
    return parseLaps(this.game.settings.rounds);
  }

  /* ---------------------------------------------------------------- players */

  private connected(): PlayerInfo[] {
    return this.game.allPlayers.filter((p) => p.connected);
  }

  private host(): PlayerInfo | undefined {
    const c = this.connected();
    return c.find((p) => p.isHost) ?? c[0];
  }

  private hostName(): string {
    return this.host()?.name ?? STR.unknownPlayer;
  }

  private isHost(id: number): boolean {
    return this.host()?.id === id;
  }

  /** Give everyone a colour: their own if free, else the first free one. */
  private assignPicks(): void {
    const players = this.connected();
    for (const id of [...this.picks.keys()]) if (!players.some((p) => p.id === id)) this.picks.delete(id);
    for (const p of players) {
      if (this.picks.has(p.id)) continue;
      const taken = new Set(this.picks.values());
      const own = PLAYER_COLORS.find((c) => c.toUpperCase() === p.color.toUpperCase());
      const col = own && !taken.has(own) ? own : PLAYER_COLORS.find((c) => !taken.has(c));
      if (col) this.picks.set(p.id, col);
    }
  }

  /* ---------------------------------------------------------------- lifecycle */

  start(): void {
    const g = this.game;
    g.on('input', (i) => {
      if (this.ended || !this.race || this.step !== 'race') return;
      this.race.input(i.from, i.buttons, i.taps, !this.paused);
    });
    g.on('players', () => this.onPlayers());
    g.on('pause', (p) => this.setPaused(p));
    g.on('action', (from, a) => this.onAction(from, a));
    if (g.paused) this.setPaused(true);
    g.music('bajaj');
    this.enterStep('mode');
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }

  /** Offline demo and tests: jump straight to a step with everyone's default colours. */
  debugStep(step: Step): void {
    this.assignPicks();
    this.enterStep(step);
  }

  /** The stage grew or shrank (window resize, fullscreen): re-split the viewports. */
  setStageSize(W: number, H: number): void {
    this.stageW = W;
    this.stageH = H;
    this.applyLayout();
  }

  private applyLayout(): void {
    const H = this.stageH;
    const W = this.stageW;
    if (this.step === 'race' || (this.step === 'post' && this.race)) {
      const humans = this.race!.karts.filter((k) => k.human).map((k) => k.idx);
      const vps = layoutFor(humans, H, W);
      this.renderer.setLayout(vps);
      this.view?.resetCameras();
      this.hud.layout.value = vps.map(
        (v) =>
          ({
            ...v,
            u: v.kind === 'broadcast' ? 1 : v.w < 700 ? 0.64 : v.h < 500 ? 0.76 : 1,
          }) satisfies VpInfo,
      );
      this.hud.broadcast.value = vps.length === 1 && vps[0]!.kind === 'broadcast';
      this.calloutUntil.length = vps.length;
      this.hud.callouts.value = vps.map(() => null);
    } else {
      this.renderer.setLayout([{ x: 0, y: 0, w: W, h: H, kind: 'free', kart: 0 }]);
      this.hud.layout.value = [];
      this.hud.broadcast.value = false;
    }
    this.syncHud(true);
  }

  /** True while the race itself runs (not the menus, intro, countdown, results or a pause). */
  get racing(): boolean {
    return !this.paused && !this.ended && this.step === 'race' && this.race?.phase === 'race';
  }

  private readonly loop = (now: number): void => {
    this.raf = requestAnimationFrame(this.loop);
    // Skipped display frames: the next drawn frame's delta covers them.
    if (this.pacer && !this.pacer.due(now)) return;
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (!this.paused && !this.ended) {
      this.menuT += dt * 1000;
      if (this.race && (this.step === 'race' || this.step === 'post')) {
        this.acc += dt * 1000;
        let steps = 0;
        while (this.acc >= STEP_MS && steps < 8) {
          this.race.step();
          this.acc -= STEP_MS;
          steps++;
          this.flush();
          if (this.step !== 'race' && this.step !== 'post') break;
        }
        if (steps >= 8) this.acc = 0;
      }
      this.tickMenus();
    }
    const alpha = this.paused ? 1 : Math.min(1, this.acc / STEP_MS);
    this.renderer.render(alpha, this.paused ? 0 : dt);
    this.hud.frame();
    if (!this.paused) {
      if (now - this.lastHudSync > HUD_SYNC_MS) this.syncHud(false);
      if (now - this.lastViewSync > VIEW_SYNC_MS) this.syncViews();
      if (this.countHideAt && now > this.countHideAt) {
        this.countHideAt = 0;
        this.hud.count.value = -1;
      }
      this.calloutUntil.forEach((until, vi) => {
        if (until && now > until) {
          this.calloutUntil[vi] = 0;
          const next = [...this.hud.callouts.value];
          next[vi] = null;
          this.hud.callouts.value = next;
        }
      });
      this.pedalSounds();
    }
    this.onFrame(now);
    this.frames++;
    if (now - this.fpsT >= 1000) {
      this.fps = (this.frames * 1000) / (now - this.fpsT || 1000);
      this.frames = 0;
      this.fpsT = now;
      this.onFps(this.fps);
    }
  };

  /* ---------------------------------------------------------------- session steps */

  private enterStep(step: Step): void {
    this.step = step;
    this.stepStart = this.menuT;
    this.allReadyAt = 0;
    const R = this.renderer;
    switch (step) {
      case 'mode':
      case 'map': {
        this.dropRace();
        const id: MapId = step === 'mode' ? MODE_PREVIEW[this.mode] : this.circuit;
        this.showFlyover(id);
        this.maps.prebuild(['kota', 'pantai', 'puncak', 'arena']);
        break;
      }
      case 'kart': {
        this.dropRace();
        this.readySet.clear();
        this.assignPicks();
        const id: MapId = this.mode === 'arena' ? 'arena' : this.circuit;
        const map = this.maps.get(id);
        R.setMap(map);
        let anchor: { x: number; y: number; z: number; h: number };
        if (id === 'arena') anchor = { x: 0, y: 0, z: 24, h: 0 };
        else {
          const T = getTrack(id);
          const p = T.point(-24, 0);
          anchor = { x: p.x, y: p.y, z: p.z, h: T.headingAt(-24) + Math.PI };
        }
        this.showroom = new Showroom(R, map, anchor);
        R.setContent(this.showroom);
        this.hud.tagSource = () =>
          this.showroom?.tags(
            R.viewports[0] ?? { x: 0, y: 0, w: this.stageW, h: this.stageH, kind: 'free', kart: 0 },
          ) ?? [];
        this.syncShowroom();
        break;
      }
      case 'race':
        this.startRace();
        break;
      case 'post':
        break;
    }
    this.sent.clear();
    this.applyLayout();
    this.syncViews();
  }

  private showFlyover(id: MapId): void {
    const map = this.maps.get(id);
    this.renderer.setMap(map);
    const fly =
      id === 'arena'
        ? new Flyover(map, null, getArena(), 0)
        : new Flyover(map, getTrack(id), null, FLY_START[id]);
    this.showroom = null;
    this.hud.tagSource = null;
    this.renderer.setContent(fly);
  }

  private dropRace(): void {
    this.race = null;
    this.view = null;
    this.hud.race = null;
    this.hud.raceView = null;
    this.hud.results.value = null;
    this.hud.count.value = -1;
    this.hud.intro.value = null;
    this.hud.grace.value = null;
  }

  private syncShowroom(): void {
    if (!this.showroom) return;
    const list = this.connected().map((p) => ({
      key: p.id,
      color: this.picks.get(p.id) ?? p.color,
      fruit: p.fruit,
    }));
    this.showroom.setKarts(list);
  }

  private tickMenus(): void {
    if (this.step === 'kart') {
      const players = this.connected();
      const allReady = players.length > 0 && players.every((p) => this.readySet.has(p.id));
      if (allReady) {
        if (!this.allReadyAt) this.allReadyAt = this.menuT + ALL_READY_DELAY_MS;
        else if (this.menuT >= this.allReadyAt) this.enterStep('race');
      } else {
        this.allReadyAt = 0;
      }
      if (this.step === 'kart' && this.menuT - this.stepStart >= KART_TIMEOUT_MS) this.enterStep('race');
    } else if (this.step === 'post') {
      if (this.menuT - this.stepStart >= POST_TIMEOUT_MS) this.finish();
    }
  }

  private startRace(): void {
    const mapId: MapId = this.mode === 'arena' ? 'arena' : this.circuit;
    const map = this.maps.get(mapId);
    this.renderer.setMap(map);
    const players = this.game.allPlayers.filter((p) => p.connected || this.picks.has(p.id));
    const racers = buildRacers(players, this.mode, STR.cpuNames, this.picks);
    const race = new Race({
      mode: this.mode,
      laps: this.laps,
      racers,
      circuit: this.circuit,
      seed: this.seed + Math.floor(this.menuT),
    });
    for (const p of players) if (!p.connected) race.setConnected(p.id, false);
    this.race = race;
    this.view = new RaceView(this.renderer, race, map);
    this.renderer.setContent(this.view);
    this.showroom = null;
    this.hud.tagSource = null;
    this.hud.race = race;
    this.hud.raceView = this.view;
    this.hud.mode.value = this.mode;
    this.hud.cards.value = race.karts.map(
      (k): KartCard => ({ idx: k.idx, name: k.name, fruit: k.fruit, color: k.color, human: k.human }),
    );
    this.hud.phase.value = 'intro';
    this.hud.results.value = null;
    this.hud.intro.value = {
      title:
        this.mode === 'arena' ? STR.maps.arena.name.toUpperCase() : STR.maps[this.circuit].name.toUpperCase(),
      sub: `${STR.modes[this.mode].name} · ${STR.introSub(this.mode, race.laps, race.karts.length)}`,
      hint: this.mode === 'time' ? STR.introHintTime : STR.introHint,
    };
    this.spectators.clear();
    for (const p of this.connected()) if (!race.kartOf(p.id)) this.spectators.add(p.id);
    this.acc = 0;
    this.result = null;
    this.prevBrake.clear();
    this.game.music(null);
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    this.game.music(null);
    if (this.result) this.game.end(this.result);
    else if (this.race) this.game.end(buildResult(this.race, STR.maps[this.circuit].name));
  }

  /* ---------------------------------------------------------------- SDK events */

  private onAction(from: number, a: ControllerToGame): void {
    if (this.ended || this.paused || a.k !== 'action') return;
    const host = this.isHost(from);
    switch (this.step) {
      case 'mode':
        if (!host) return;
        if (a.id === 'pick' && a.value && (['gp', 'duel', 'arena', 'time'] as string[]).includes(a.value)) {
          if (this.mode !== a.value) {
            this.mode = a.value as Mode;
            this.showFlyover(MODE_PREVIEW[this.mode]);
            this.sfx('tick', 0);
          }
        } else if (a.id === 'next') {
          this.sfx('select', 0);
          this.enterStep(this.mode === 'arena' ? 'kart' : 'map');
          return;
        }
        break;
      case 'map':
        if (!host) return;
        if (a.id === 'pick' && a.value && (CIRCUITS as readonly string[]).includes(a.value)) {
          if (this.circuit !== a.value) {
            this.circuit = a.value as CircuitId;
            this.showFlyover(this.circuit);
            this.sfx('tick', 0);
          }
        } else if (a.id === 'next') {
          this.sfx('select', 0);
          this.enterStep('kart');
          return;
        } else if (a.id === 'back') {
          this.sfx('back', 0);
          this.enterStep('mode');
          return;
        }
        break;
      case 'kart':
        if (a.id === 'pick' && a.value && V.KART_COLORS.includes(a.value) && !this.readySet.has(from)) {
          const takenByOther = [...this.picks].some(([id, c]) => c === a.value && id !== from);
          if (!takenByOther) {
            this.picks.set(from, a.value);
            this.syncShowroom();
            this.sfx('tick', 0);
          }
        } else if (a.id === 'ready') {
          this.readySet.add(from);
          this.sfx('ready', 0);
          this.game.vibrate(from, 40);
        } else if (a.id === 'unready') {
          this.readySet.delete(from);
        } else if (a.id === 'start' && host) {
          this.sfx('select', 0);
          this.enterStep('race');
          return;
        } else if (a.id === 'back' && host) {
          this.sfx('back', 0);
          this.enterStep(this.mode === 'arena' ? 'mode' : 'map');
          return;
        }
        break;
      case 'post':
        if (!host || a.id !== 'pick') return;
        if (a.value === 'again') {
          this.sfx('select', 0);
          this.enterStep('race');
          return;
        }
        if (a.value === 'change') {
          this.sfx('back', 0);
          this.game.music('bajaj');
          this.enterStep('mode');
          return;
        }
        if (a.value === 'done') {
          this.finish();
          return;
        }
        break;
      default:
        return;
    }
    this.syncHud(true);
    this.syncViews();
  }

  private onPlayers(): void {
    for (const p of this.game.allPlayers) {
      const was = this.online.get(p.id) ?? false;
      this.online.set(p.id, p.connected);
      if (p.connected && !was) this.sent.delete(p.id);
      if (!this.race) continue;
      const k = this.race.kartOf(p.id);
      if (!k) {
        if (p.connected) this.spectators.add(p.id);
        continue;
      }
      if (k.connected !== p.connected) this.race.setConnected(p.id, p.connected);
    }
    if (this.step === 'kart') {
      this.assignPicks();
      for (const id of [...this.readySet])
        if (!this.connected().some((p) => p.id === id)) this.readySet.delete(id);
      this.syncShowroom();
    }
    this.syncViews();
    this.syncHud(true);
  }

  private setPaused(p: boolean): void {
    if (p === this.paused) return;
    this.paused = p;
    this.hud.paused.value = p;
    if (!p) {
      this.last = performance.now();
      this.syncViews();
    }
  }

  /* ---------------------------------------------------------------- race events */

  private flush(): void {
    const R = this.race;
    if (!R) return;
    for (const e of R.drain()) {
      this.view?.onEvent(e);
      this.handle(R, e);
    }
  }

  private human(R: Race, idx: number): Kart | null {
    const k = R.karts[idx];
    return k?.human ? k : null;
  }

  private handle(R: Race, e: RaceEvent): void {
    switch (e.type) {
      case 'phase':
        this.hud.phase.value = e.phase;
        if (e.phase !== 'intro') this.hud.intro.value = null;
        if (e.phase === 'results') this.showResults(R);
        this.syncViews();
        return;
      case 'count':
        this.hud.count.value = e.n;
        this.sfx('count');
        return;
      case 'go':
        this.hud.count.value = 0;
        this.countHideAt = performance.now() + 1100;
        this.sfx('go');
        this.sfx('engine', 0);
        this.game.music(MUSIC[this.mode === 'arena' ? 'arena' : this.circuit]);
        this.syncViews();
        return;
      case 'lap': {
        const k = this.human(R, e.kart);
        if (!k) return;
        this.sfx('lap');
        if (R.mode === 'time' && e.best && k.lapTimes.length > 1) {
          this.sfx('correct', 0);
          this.callout(e.kart, { text: STR.newBest, sub: formatTime(e.lapTime), tone: 'good' });
        } else if (e.lap < R.laps && k.finishT === null) {
          this.callout(e.kart, {
            text: STR.lapBanner(e.lap, R.laps),
            sub: `${STR.lapTime} ${formatTime(e.lapTime)}`,
            tone: 'info',
          });
        }
        return;
      }
      case 'finalLap': {
        const k = this.human(R, e.kart);
        if (!k) return;
        this.sfx('whistle');
        this.callout(e.kart, { text: STR.finalLap, tone: 'final' });
        this.game.vibrate(k.id, [60, 40, 60]);
        return;
      }
      case 'finish': {
        const k = this.human(R, e.kart);
        if (!k) return;
        this.sfx(e.place === 1 ? 'win' : 'cheer', 0);
        if (e.place <= 3 && R.mode !== 'time') celebrate();
        this.game.vibrate(k.id, [80, 40, 80, 40, 220]);
        this.syncViews();
        this.syncHud(true);
        return;
      }
      case 'pickup': {
        const k = this.human(R, e.kart);
        if (!k) return;
        this.sfx('item');
        this.game.vibrate(k.id, 40);
        return;
      }
      case 'item':
        if (this.human(R, e.kart)) this.sfx('select');
        this.syncViews();
        return;
      case 'use': {
        const human = this.human(R, e.kart);
        if (e.item === 'horn') this.sfx('horn', 250);
        else if (human && (e.item === 'oil' || (e.item === 'durian' && e.back))) {
          this.sfx('skid');
          if (e.back) this.callout(e.kart, { text: STR.thrownBack, tone: 'info' });
        } else if (human && e.item === 'shield') {
          this.sfx('select');
          this.callout(e.kart, { text: STR.shieldOn, tone: 'good' });
        }
        this.syncViews();
        return;
      }
      case 'throw':
        this.sfx('throw', 120);
        return;
      case 'boom':
        this.sfx('explode', 150);
        return;
      case 'boost':
        if (this.human(R, e.kart)) {
          this.sfx('boost');
          this.callout(e.kart, { text: STR.boostOn, tone: 'good' });
        }
        return;
      case 'spin':
      case 'wobble': {
        const k = this.human(R, e.kart);
        const by = this.human(R, e.by);
        if (k || by) this.sfx('hit');
        if (k) {
          this.game.vibrate(k.id, [140, 60, 140]);
          const text =
            e.type === 'wobble'
              ? STR.hitHorn
              : e.kind === 'durian'
                ? STR.hitDurian
                : e.kind === 'firecracker'
                  ? STR.hitFirecracker
                  : STR.hitOil;
          this.callout(e.kart, { text, tone: 'bad' });
        }
        return;
      }
      case 'blocked': {
        const k = this.human(R, e.kart);
        if (!k) return;
        this.sfx('select');
        this.game.vibrate(k.id, 60);
        this.callout(e.kart, { text: STR.blocked, tone: 'good' });
        return;
      }
      case 'lifeLost': {
        const k = this.human(R, e.kart);
        if (!k) return;
        this.game.vibrate(k.id, [200, 80, 200]);
        if (e.lives > 0)
          this.callout(e.kart, { text: STR.lifeLost, sub: STR.livesShort(e.lives), tone: 'bad' });
        this.syncViews();
        return;
      }
      case 'out': {
        const k = this.human(R, e.kart);
        this.sfx('wrong', 0);
        if (k) {
          this.game.vibrate(k.id, [300, 100, 300]);
          this.callout(e.kart, { text: STR.out, sub: STR.outSub, tone: 'bad' });
        }
        this.syncViews();
        this.syncHud(true);
        return;
      }
      case 'split': {
        const k = this.human(R, e.kart);
        if (!k) return;
        if (e.delta === null) return;
        this.sfx('tick', 0);
        this.callout(e.kart, {
          text: formatDelta(e.delta),
          sub: STR.sector(e.sector),
          tone: e.delta <= 0 ? 'good' : 'bad',
        });
        return;
      }
      case 'jump':
        if (this.human(R, e.kart)) this.sfx('jump', 200);
        return;
      case 'land':
        if (this.human(R, e.kart) && e.air > 0.35) this.sfx('drop', 200);
        return;
      case 'wall': {
        const k = this.human(R, e.kart);
        if (k && e.power > 6) {
          this.sfx('skid', 500);
          this.game.vibrate(k.id, 50);
        }
        return;
      }
      case 'bump':
        if (this.human(R, e.a) || this.human(R, e.b)) this.sfx('skid', 400);
        return;
      case 'rescue': {
        const k = this.human(R, e.kart);
        if (!k) return;
        this.sfx('whistle');
        this.callout(e.kart, { text: STR.rescued, tone: 'info' });
        return;
      }
      case 'wrongWay': {
        const k = this.human(R, e.kart);
        if (k && e.on) this.game.vibrate(k.id, [200, 100, 200]);
        this.syncViews();
        this.syncHud(true);
        return;
      }
      case 'horn':
      case 'hazard':
        return;
      case 'end':
        this.result = buildResult(R, STR.maps[this.circuit].name);
        this.enterStep('post');
        return;
    }
  }

  /** Brake squeal and the reversing beeper for human karts. */
  private pedalSounds(): void {
    const R = this.race;
    if (!R || this.step !== 'race' || R.phase !== 'race') return;
    for (const k of R.karts) {
      if (!k.human || k.autopilot) continue;
      const was = this.prevBrake.get(k.idx) ?? false;
      if (k.braking && !was && k.speed > 14) this.sfx('brake', 300);
      this.prevBrake.set(k.idx, k.braking);
      if (k.speed < -1) this.sfx('reverse', 1200);
    }
  }

  private callout(
    kartIdx: number,
    c: { text: string; sub?: string; tone: 'good' | 'bad' | 'info' | 'final' },
  ): void {
    const vps = this.hud.layout.value;
    const next = [...this.hud.callouts.value];
    let any = false;
    vps.forEach((v, vi) => {
      if (v.kind !== 'chase' || v.kart !== kartIdx) return;
      next[vi] = { key: ++this.calloutSeq, ...c };
      this.calloutUntil[vi] = performance.now() + CALLOUT_MS;
      any = true;
    });
    if (any) this.hud.callouts.value = next;
  }

  private sfx(name: Sfx, gapMs = 110): void {
    const now = performance.now();
    if (now - (this.sfxAt.get(name) ?? -1e9) < gapMs) return;
    this.sfxAt.set(name, now);
    this.game.sfx(name);
  }

  private showResults(R: Race): void {
    const cards = this.hud.cards.value;
    this.hud.grace.value = null;
    this.hud.results.value = finalRows(R).map((r) => ({
      place: r.place,
      card: cards[r.idx]!,
      time: r.time !== null ? formatTime(r.time) : null,
      best: r.best !== null ? formatTime(r.best) : null,
      lives: r.lives,
      out: r.out,
      hits: R.karts[r.idx]!.stats.hitsGiven,
    }));
    const winner = R.karts[finalRows(R)[0]?.idx ?? 0];
    this.sfx(winner?.human ? 'win' : 'whistle', 0);
  }

  /* ---------------------------------------------------------------- HUD + phones */

  private menuModel(): MenuModel {
    const players = this.connected();
    const left =
      this.step === 'kart'
        ? Math.max(0, Math.ceil((KART_TIMEOUT_MS - (this.menuT - this.stepStart)) / 1000))
        : null;
    const postLeft =
      this.step === 'post'
        ? Math.max(0, Math.ceil((POST_TIMEOUT_MS - (this.menuT - this.stepStart)) / 1000))
        : null;
    return {
      step: this.step,
      mode: this.mode,
      circuit: this.circuit,
      laps: this.laps,
      hostName: this.hostName(),
      players: players.map((p) => ({
        id: p.id,
        name: p.name,
        fruit: p.fruit,
        color: this.picks.get(p.id) ?? p.color,
        ready: this.readySet.has(p.id),
        host: this.isHost(p.id),
      })),
      cpus: cpuCount(this.mode, Math.max(1, players.length)),
      autoS: left !== null && left <= 20 ? left : null,
      postS: postLeft,
    };
  }

  private syncHud(force: boolean): void {
    this.lastHudSync = performance.now();
    const menu = this.menuModel();
    if (force || JSON.stringify(menu) !== JSON.stringify(this.hud.menu.value)) this.hud.menu.value = menu;
    const R = this.race;
    if (!R || (this.step !== 'race' && this.step !== 'post')) return;
    const vps = this.hud.layout.value;
    const models: VpModel[] = vps.map((v) => {
      const k = R.karts[v.kart]!;
      return {
        kart: k.idx,
        place: k.place,
        total: R.karts.length,
        lap: R.displayLap(k),
        laps: R.laps,
        item: k.item,
        rolling: k.rollT > 0,
        finishPlace: k.finishT !== null ? k.place : null,
        finishTime: k.finishT,
        wrongWay: k.wrongWay,
        offline: k.human && !k.connected,
        lives: k.lives,
        out: k.out,
        best: R.bestLap(k),
        last: k.lapTimes.length ? k.lapTimes[k.lapTimes.length - 1]! : null,
      };
    });
    if (force || JSON.stringify(models) !== JSON.stringify(this.hud.vps.value)) this.hud.vps.value = models;
    const order = R.mode === 'time' ? finalRows(R).map((r) => r.idx) : R.order;
    const st = order.map((idx, i) => {
      const k = R.karts[idx]!;
      return {
        idx,
        place: i + 1,
        lap: R.displayLap(k),
        finished: k.finishT !== null,
        lives: k.lives,
        out: k.out,
        best: R.bestLap(k),
      };
    });
    if (force || JSON.stringify(st) !== JSON.stringify(this.hud.standings.value))
      this.hud.standings.value = st;
    const grace =
      R.phase === 'race' && R.endsAt !== null ? Math.max(0, Math.ceil((R.endsAt - R.t) / 1000)) : null;
    if (grace !== this.hud.grace.value) this.hud.grace.value = grace;
    const clock = R.mode === 'arena' ? R.timeLeft : null;
    const cs = clock === null ? null : Math.ceil(clock / 1000);
    if (cs !== this.hud.arenaClock.value) this.hud.arenaClock.value = cs;
    const alive = R.mode === 'arena' ? R.aliveCount() : null;
    if (alive !== this.hud.alive.value) this.hud.alive.value = alive;
  }

  private hintFor(R: Race, k: Kart): string {
    if (R.phase === 'intro') return STR.phoneHintGrid;
    if (R.phase === 'countdown') return STR.phoneHintCountdown;
    if (k.out) return STR.phoneHintOut;
    if (k.finishT !== null || R.phase !== 'race') return STR.phoneHintFinished;
    if (k.wrongWay) return STR.phoneHintWrongWay;
    if (k.item && k.rollT <= 0) {
      const name = STR.items[k.item];
      if (k.item === 'durian') return STR.phoneHintThrow(name);
      if (k.item === 'firecracker') return STR.phoneHintFirecracker;
      return STR.phoneHintItem(name);
    }
    if (R.mode !== 'arena' && k.lap === R.laps && R.mode !== 'time') return STR.phoneHintFinalLap;
    return R.mode === 'arena'
      ? STR.phoneHintArena
      : R.mode === 'time'
        ? STR.phoneHintTime
        : STR.phoneHintRace;
  }

  private viewFor(p: PlayerInfo): ControllerView | null {
    const hostName = this.hostName();
    switch (this.step) {
      case 'mode':
        return V.modeMenu(this.isHost(p.id), this.mode, hostName);
      case 'map':
        return V.mapMenu(this.isHost(p.id), this.circuit, hostName);
      case 'kart': {
        const players = this.connected();
        const names = new Map(players.map((q) => [q.id, q.name]));
        const left = Math.max(0, Math.ceil((KART_TIMEOUT_MS - (this.menuT - this.stepStart)) / 1000));
        return V.kartMenu({
          me: p.id,
          isHost: this.isHost(p.id),
          picks: this.picks,
          names,
          ready: this.readySet.has(p.id),
          readyCount: players.filter((q) => this.readySet.has(q.id)).length,
          total: players.length,
          step: this.mode === 'arena' ? 2 : 3,
          steps: this.mode === 'arena' ? 2 : 3,
          autoS: left <= 20 ? left : null,
        });
      }
      case 'post':
        return V.postMenu(
          this.isHost(p.id),
          hostName,
          Math.max(0, Math.ceil((POST_TIMEOUT_MS - (this.menuT - this.stepStart)) / 1000)),
        );
      case 'race': {
        const R = this.race;
        if (!R) return null;
        const k = R.kartOf(p.id);
        if (!k) return this.spectators.has(p.id) ? V.spectatorView() : null;
        return V.driveView({
          mode: R.mode,
          color: k.color,
          place: k.place,
          total: R.karts.length,
          lap: R.displayLap(k),
          laps: R.laps,
          lives: k.lives,
          out: k.out,
          clockMs: R.timeLeft,
          best: R.bestLap(k),
          item: k.item,
          rolling: k.rollT > 0,
          finishTime: k.finishT,
          hint: this.hintFor(R, k),
          locked: R.phase !== 'race' || k.finishT !== null || k.out,
        });
      }
    }
  }

  private syncViews(): void {
    this.lastViewSync = performance.now();
    for (const p of this.game.allPlayers) {
      if (!p.connected) continue;
      const view = this.viewFor(p);
      if (!view) continue;
      const json = JSON.stringify(view);
      if (this.sent.get(p.id) === json) continue;
      this.sent.set(p.id, json);
      this.game.setView(p.id, view);
    }
  }
}
