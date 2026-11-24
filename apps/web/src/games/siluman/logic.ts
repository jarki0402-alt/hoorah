/**
 * Kampung Siluman match logic (pure, no DOM, no network). The main screen is the guide: there is
 * no moderator. Phones only send actions and the driver feeds them in with the synced server
 * time. All timers run on an internal clock that stops while the match is held (shell paused).
 *
 * Eyes-closed play: at night everyone closes their eyes; each night role is called by its own
 * short sound and gets a fixed 15 s turn (always the full time, even when its holders are out,
 * so the length of a turn gives nothing away), a weker means eyes closed again, a rooster means
 * morning. Day: the morning news, a timed discussion with "Curigai" markers, 15 s of defence for
 * the most suspected, a secret vote, the votes revealed one by one and the card turned over.
 * Players who are out become arwah: they watch and guess the siluman each day for points.
 *
 * Warga win when every siluman is gone; the siluman win once they are as many as everyone else.
 */

export type Role = 'warga' | 'siluman' | 'dukun' | 'tabib' | 'pemburu' | 'pengkhianat';
export type Side = 'warga' | 'siluman';
export type NightRole = 'siluman' | 'dukun' | 'tabib';
export type Phase =
  | 'setup'
  | 'intro'
  | 'deal'
  | 'dusk'
  | 'night'
  | 'dawn'
  | 'hunt'
  | 'discuss'
  | 'defense'
  | 'vote'
  | 'tally'
  | 'reveal'
  | 'final'
  | 'ended';
export type SetupStep = 'roles' | 'talk';
export type Extras = 'dasar' | 'pemburu' | 'pengkhianat' | 'keduanya';
export type Talk = 'singkat' | 'sedang' | 'panjang';
export type Cause = 'night' | 'vote' | 'hunt';
/** One sound introduced before the first night. */
export type IntroCue = NightRole | 'weker' | 'rooster';

export const NIGHT_ORDER: readonly NightRole[] = ['siluman', 'dukun', 'tabib'];
export const INTRO_CUES: readonly IntroCue[] = ['siluman', 'dukun', 'tabib', 'weker', 'rooster'];
export const EXTRAS: readonly Extras[] = ['dasar', 'pemburu', 'pengkhianat', 'keduanya'];
export const TALKS: readonly Talk[] = ['singkat', 'sedang', 'panjang'];

export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 16;
/** The Pengkhianat only joins from this many players (with fewer the siluman side is too strong). */
export const PENGKHIANAT_MIN = 7;
/** Days before the kampung is declared to have held out (stops an endless stalemate). */
export const MAX_DAYS = 8;

export const TIMING = {
  introCueMs: 3_400,
  dealMs: 30_000,
  dealMinMs: 4_000,
  /** "Tutup mata dalam 5" on the screen. */
  duskMs: 5_000,
  turnMs: 15_000,
  /** Eyes closed between two turns (after the weker, before the next call). */
  gapMs: 2_500,
  dawnMs: 7_500,
  huntMs: 15_000,
  huntShowMs: 5_000,
  talkMs: { singkat: 60_000, sedang: 120_000, panjang: 180_000 } as Record<Talk, number>,
  defenseMs: 15_000,
  /** A defence cannot be ended before this (protects against a double tap). */
  defenseMinMs: 3_000,
  voteMs: 30_000,
  /** First vote shown this long into the tally; later ones come quicker (drum roll). */
  tallyFirstMs: 1_100,
  tallyHoldMs: 2_000,
  revealMs: 7_000,
  finalMs: 15_000,
} as const;

export const POINTS = {
  win: 3,
  aliveWin: 1,
  goodVote: 1,
  ghostHit: 1,
  seen: 1,
  save: 2,
  shot: 2,
} as const;

export interface Stats {
  /** Votes cast against a siluman. */
  goodVotes: number;
  /** Arwah guesses that named a siluman. */
  ghostHits: number;
  /** Dukun: siluman found. */
  seen: number;
  /** Tabib: lives saved. */
  saves: number;
  /** Pemburu: a siluman taken along. */
  shots: number;
  /** "Curigai" markers received. */
  suspected: number;
  votesReceived: number;
  /** Defended and stayed in the kampung. */
  defended: number;
}

export interface Seat {
  id: number;
  joinIndex: number;
  present: boolean;
  /** Dealt into this story (late joiners watch until the next one). */
  inGame: boolean;
  role: Role;
  alive: boolean;
  /** Out how and when (day/night number, 1-based). */
  out: { cause: Cause; at: number } | null;
  ready: boolean;
  /** Discussion: the player this seat suspects. */
  suspect: number | null;
  /** Vote of this day (0 = skip), or an arwah's guess. */
  vote: number | null;
  locked: boolean;
  score: number;
  stats: Stats;
}

export interface Settings {
  extras: Extras;
  talk: Talk;
}

/** What the Dukun learned, in order (kept on the Dukun's card as secret notes). */
export interface Sight {
  night: number;
  target: number;
  role: Role;
}

export interface NightRecord {
  night: number;
  /** Siluman's choice (null = none). */
  attacked: number | null;
  protected: number | null;
  /** Taken by the siluman (attacked and not protected). */
  victim: number | null;
  sight: Sight | null;
}

export interface DayRecord {
  day: number;
  out: number | null;
  tie: boolean;
}

export interface Tally {
  /** Votes in reveal order: voter → target (0 = skip). */
  order: Vote[];
  counts: { id: number; votes: number }[];
  skips: number;
  out: number | null;
  tie: boolean;
}

/** The seat fields the main screen draws. */
export type SceneSeat = Pick<Seat, 'id' | 'present' | 'role' | 'alive' | 'ready' | 'locked'>;

/**
 * What the main screen reads: the live match on the Host's screen, or a far-away screen's replica
 * built from the published display state (`mirror.ts`).
 */
export interface SilumanScene {
  readonly phase: Phase;
  readonly step: SetupStep;
  readonly settings: Readonly<Settings>;
  readonly night: number;
  readonly winner: Side | null;
  readonly dawnVictim: number | null;
  readonly hunter: number | null;
  readonly huntShot: number | null;
  readonly defender: number | null;
  readonly tally: {
    readonly order: readonly Vote[];
    readonly out: number | null;
    readonly tie: boolean;
  } | null;
  readonly nights: readonly Pick<NightRecord, 'night' | 'victim' | 'attacked' | 'protected'>[];
  readonly days: readonly Pick<DayRecord, 'day' | 'out'>[];
  readonly table: readonly SceneSeat[];
  readonly alive: readonly SceneSeat[];
  readonly present: readonly SceneSeat[];
  readonly calling: NightRole | null;
  readonly introCue: IntroCue | null;
  seat(id: number): SceneSeat | undefined;
  msLeft(): number;
  clockLength(): number;
  tallyShown(): number;
  marks(): Mark[];
}

/** One vote of the tally: voter to target (0 = skip). */
export interface Vote {
  from: number;
  to: number;
}

/** Suspicion markers on one player (only the count shows on the main screen). */
export interface Mark {
  id: number;
  n: number;
}

export type SilumanEvent =
  | { type: 'phase'; phase: Phase }
  | { type: 'cue'; cue: IntroCue }
  | { type: 'call'; role: NightRole }
  | { type: 'close'; role: NightRole }
  | { type: 'ready'; id: number }
  | { type: 'locked'; id: number }
  | { type: 'suspect'; id: number; target: number | null }
  | { type: 'shot'; id: number; target: number }
  | { type: 'win'; side: Side };

export interface MatchOptions {
  seed: number;
  now: number;
  players: readonly { id: number; connected: boolean }[];
}

const emptyStats = (): Stats => ({
  goodVotes: 0,
  ghostHits: 0,
  seen: 0,
  saves: 0,
  shots: 0,
  suspected: 0,
  votesReceived: 0,
  defended: 0,
});

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

export const sideOf = (role: Role): Side =>
  role === 'siluman' || role === 'pengkhianat' ? 'siluman' : 'warga';

/** Siluman for a table of `n`. */
export function silumanCount(n: number): number {
  if (n >= 11) return 3;
  if (n >= 7) return 2;
  return 1;
}

/** The roles dealt to a table of `n` (unshuffled). */
export function rolesFor(n: number, extras: Extras): Role[] {
  const roles: Role[] = [];
  for (let i = 0; i < silumanCount(n); i++) roles.push('siluman');
  roles.push('dukun', 'tabib');
  if (extras === 'pemburu' || extras === 'keduanya') roles.push('pemburu');
  if ((extras === 'pengkhianat' || extras === 'keduanya') && n >= PENGKHIANAT_MIN) roles.push('pengkhianat');
  while (roles.length < n) roles.push('warga');
  return roles.slice(0, n);
}

/** Interval before vote `i` of the tally is shown (speeding up like a drum roll). */
export function tallyStepMs(i: number): number {
  return i === 0 ? TIMING.tallyFirstMs : Math.max(380, 950 - i * 70);
}

/** Total length of a tally of `votes` votes. */
export function tallyLength(votes: number): number {
  let ms = 0;
  for (let i = 0; i < votes; i++) ms += tallyStepMs(i);
  return ms + TIMING.tallyHoldMs;
}

export class SilumanMatch implements SilumanScene {
  phase: Phase = 'setup';
  step: SetupStep = 'roles';
  settings: Settings = { extras: 'dasar', talk: 'sedang' };
  /** Index into INTRO_CUES during the intro. */
  cue = 0;
  /** 1-based night/day number (night N is followed by day N). */
  night = 0;
  /** Index into NIGHT_ORDER during the night. */
  turn = 0;
  /** `open`: the called role has its eyes open. `gap`: everyone's eyes closed. */
  stage: 'open' | 'gap' = 'gap';
  held = false;
  winner: Side | null = null;
  /** Night picks. */
  silumanPicks = new Map<number, number>();
  dukunPick: number | null = null;
  tabibPick: number | null = null;
  lastProtected: number | null = null;
  readonly sights: Sight[] = [];
  readonly nights: NightRecord[] = [];
  readonly days: DayRecord[] = [];
  /** Morning news: who was taken last night (null = nobody). */
  dawnVictim: number | null = null;
  /** The Pemburu taking someone along. */
  hunter: number | null = null;
  huntShot: number | null = null;
  defender: number | null = null;
  tally: Tally | null = null;

  private readonly seats = new Map<number, Seat>();
  private joinCounter = 0;
  private readonly rnd: () => number;
  private t = 0;
  private last: number;
  private deadline = 0;
  private phaseStart = 0;
  private huntFrom: 'dawn' | 'reveal' = 'dawn';
  private events: SilumanEvent[] = [];

  constructor(opts: MatchOptions) {
    this.rnd = mulberry(opts.seed);
    this.last = opts.now;
    this.syncPlayers(opts.players, opts.now);
  }

  /* ------------------------------------------------------------------ queries */

  get roster(): Seat[] {
    return [...this.seats.values()].sort((a, b) => a.joinIndex - b.joinIndex);
  }

  seat(id: number): Seat | undefined {
    return this.seats.get(id);
  }

  get table(): Seat[] {
    return this.roster.filter((s) => s.inGame);
  }

  get alive(): Seat[] {
    return this.table.filter((s) => s.alive);
  }

  get ghosts(): Seat[] {
    return this.table.filter((s) => !s.alive);
  }

  get present(): Seat[] {
    return this.roster.filter((s) => s.present);
  }

  /** The night role whose turn it is (null between turns or outside the night). */
  get calling(): NightRole | null {
    return this.phase === 'night' && this.stage === 'open' ? (NIGHT_ORDER[this.turn] ?? null) : null;
  }

  /** Night: every living siluman has picked a victim (the screen's heartbeat stops then). */
  get silumanChosen(): boolean {
    const hunters = this.alive.filter((s) => s.role === 'siluman');
    return hunters.length > 0 && hunters.every((s) => this.silumanPicks.has(s.id));
  }

  get introCue(): IntroCue | null {
    return this.phase === 'intro' ? (INTRO_CUES[this.cue] ?? null) : null;
  }

  /** Can the Pengkhianat be dealt with this many present players? */
  pengkhianatAllowed(): boolean {
    return this.present.length >= PENGKHIANAT_MIN;
  }

  holders(role: Role): Seat[] {
    return this.table.filter((s) => s.role === role);
  }

  msLeft(): number {
    return this.deadline > 0 ? Math.max(0, this.deadline - this.t) : 0;
  }

  phaseElapsed(): number {
    return Math.max(0, this.t - this.phaseStart);
  }

  /** Full length of the running clock, for rings. */
  clockLength(): number {
    switch (this.phase) {
      case 'dusk':
        return TIMING.duskMs;
      case 'night':
        return this.stage === 'open' ? TIMING.turnMs : TIMING.gapMs;
      case 'discuss':
        return TIMING.talkMs[this.settings.talk];
      case 'defense':
        return TIMING.defenseMs;
      case 'vote':
        return TIMING.voteMs;
      case 'hunt':
        return this.huntShot === null ? TIMING.huntMs : TIMING.huntShowMs;
      case 'deal':
        return TIMING.dealMs;
      default:
        return 0;
    }
  }

  /** Votes of the tally already shown on the screen. */
  tallyShown(): number {
    if (!this.tally) return 0;
    if (this.phase !== 'tally') return this.tally.order.length;
    const el = this.phaseElapsed();
    let at = 0;
    let n = 0;
    for (let i = 0; i < this.tally.order.length; i++) {
      at += tallyStepMs(i);
      if (el >= at) n++;
    }
    return n;
  }

  /** Suspicion markers per player (discussion), most first. */
  suspicions(): { id: number; by: number[] }[] {
    const map = new Map<number, number[]>();
    for (const s of this.alive) {
      if (s.suspect === null) continue;
      const list = map.get(s.suspect) ?? [];
      list.push(s.id);
      map.set(s.suspect, list);
    }
    return [...map.entries()]
      .map(([id, by]) => ({ id, by }))
      .sort((a, b) => b.by.length - a.by.length || this.joinOf(a.id) - this.joinOf(b.id));
  }

  /** Suspicion counts per player for the main screen, most first. */
  marks(): Mark[] {
    return this.suspicions().map((x) => ({ id: x.id, n: x.by.length }));
  }

  /** Ranked standings (ties share a rank). */
  standings(): { seat: Seat; rank: number }[] {
    const rows = this.table.slice().sort((a, b) => b.score - a.score || a.joinIndex - b.joinIndex);
    let rank = 0;
    let prev = Number.NaN;
    return rows.map((seat, i) => {
      if (seat.score !== prev) rank = i + 1;
      prev = seat.score;
      return { seat, rank };
    });
  }

  /* ------------------------------------------------------------------ roster */

  syncPlayers(players: readonly { id: number; connected: boolean }[], now: number): void {
    this.advance(now);
    const ids = new Set(players.map((p) => p.id));
    for (const p of players) {
      let s = this.seats.get(p.id);
      if (!s) {
        s = {
          id: p.id,
          joinIndex: this.joinCounter++,
          present: p.connected,
          inGame: false,
          role: 'warga',
          alive: false,
          out: null,
          ready: false,
          suspect: null,
          vote: null,
          locked: false,
          score: 0,
          stats: emptyStats(),
        };
        this.seats.set(p.id, s);
      }
      s.present = p.connected;
    }
    for (const s of this.seats.values()) if (!ids.has(s.id)) s.present = false;
    if (this.phase === 'setup' && !this.pengkhianatAllowed()) {
      if (this.settings.extras === 'pengkhianat') this.settings.extras = 'dasar';
      else if (this.settings.extras === 'keduanya') this.settings.extras = 'pemburu';
    }
    this.checkProgress();
  }

  setHeld(held: boolean, now: number): void {
    this.advance(now);
    this.held = held;
  }

  /* ------------------------------------------------------------------ setup (Host) */

  pick(value: string): boolean {
    if (this.phase !== 'setup') return false;
    if (this.step === 'roles') {
      if (!(EXTRAS as readonly string[]).includes(value)) return false;
      const extras = value as Extras;
      if ((extras === 'pengkhianat' || extras === 'keduanya') && !this.pengkhianatAllowed()) return false;
      this.settings.extras = extras;
      return true;
    }
    if (!(TALKS as readonly string[]).includes(value)) return false;
    this.settings.talk = value as Talk;
    return true;
  }

  next(now: number): SilumanEvent[] {
    if (this.phase !== 'setup') return [];
    if (this.step === 'roles') {
      this.step = 'talk';
      return [{ type: 'phase', phase: 'setup' }];
    }
    return this.start(now);
  }

  back(): boolean {
    if (this.phase !== 'setup' || this.step !== 'talk') return false;
    this.step = 'roles';
    return true;
  }

  start(now: number): SilumanEvent[] {
    if (this.phase !== 'setup') return [];
    this.advance(now);
    if (this.present.length < MIN_PLAYERS) return [];
    this.deal();
    this.cue = 0;
    this.enter('intro', TIMING.introCueMs);
    this.events.push({ type: 'cue', cue: INTRO_CUES[0]! });
    return this.flush();
  }

  /** Host skips the sound introduction. */
  skipIntro(now: number): SilumanEvent[] {
    this.advance(now);
    if (this.phase !== 'intro') return [];
    this.enter('deal', TIMING.dealMs);
    return this.flush();
  }

  /* ------------------------------------------------------------------ phone actions */

  ready(id: number, now: number): SilumanEvent[] {
    this.advance(now);
    const s = this.seats.get(id);
    if (!s?.inGame || s.ready) return [];
    if (this.phase === 'deal' || (this.phase === 'discuss' && s.alive)) {
      s.ready = true;
      this.events.push({ type: 'ready', id });
      this.checkProgress();
    }
    return this.flush();
  }

  unready(id: number, now: number): SilumanEvent[] {
    this.advance(now);
    const s = this.seats.get(id);
    if (this.phase === 'discuss' && s?.ready) s.ready = false;
    return this.flush();
  }

  /** A night choice of the role whose turn it is. */
  nightPick(id: number, target: number, now: number): SilumanEvent[] {
    this.advance(now);
    const s = this.seats.get(id);
    const tgt = this.seats.get(target);
    const role = this.calling;
    if (!role || !s?.inGame || !s.alive || s.role !== role || !tgt?.inGame || !tgt.alive) return [];
    switch (role) {
      case 'siluman':
        if (tgt.role === 'siluman') return [];
        this.silumanPicks.set(id, target);
        break;
      case 'dukun':
        if (target === id || this.dukunPick !== null) return [];
        this.dukunPick = target;
        this.sights.push({
          night: this.night,
          target,
          role: tgt.role === 'pengkhianat' ? 'warga' : tgt.role,
        });
        if (tgt.role === 'siluman') s.stats.seen++;
        break;
      case 'tabib':
        if (target === this.lastProtected) return [];
        this.tabibPick = target;
        break;
    }
    return this.flush();
  }

  /** The dead Pemburu takes someone along. */
  shoot(id: number, target: number, now: number): SilumanEvent[] {
    this.advance(now);
    const tgt = this.seats.get(target);
    if (this.phase !== 'hunt' || this.hunter !== id || this.huntShot !== null) return [];
    if (!tgt?.inGame || !tgt.alive || target === id) return [];
    this.huntShot = target;
    this.kill(tgt, 'hunt');
    const hunter = this.seats.get(id);
    if (hunter && tgt.role === 'siluman') hunter.stats.shots++;
    this.events.push({ type: 'shot', id, target });
    this.deadline = this.t + TIMING.huntShowMs;
    return this.flush();
  }

  /** "Curigai": mark (or, tapping the same player again, unmark) a suspect. */
  suspect(id: number, target: number, now: number): SilumanEvent[] {
    this.advance(now);
    const s = this.seats.get(id);
    const tgt = this.seats.get(target);
    if (this.phase !== 'discuss' || !s?.alive || !tgt?.alive || target === id) return [];
    if (s.suspect === target) s.suspect = null;
    else {
      s.suspect = target;
      tgt.stats.suspected++;
    }
    this.events.push({ type: 'suspect', id, target: s.suspect });
    return this.flush();
  }

  /** The defender ends their defence early. */
  doneDefending(id: number, now: number): SilumanEvent[] {
    this.advance(now);
    if (this.phase !== 'defense' || this.defender !== id) return [];
    if (this.phaseElapsed() < TIMING.defenseMinMs) return [];
    this.startVote();
    return this.flush();
  }

  /** Vote (alive: target or 0 = skip) or arwah guess (a living player). Changeable until locked. */
  vote(id: number, target: number, now: number): SilumanEvent[] {
    this.advance(now);
    const s = this.seats.get(id);
    if (this.phase !== 'vote' || !s?.inGame || s.locked) return [];
    if (target === 0) {
      if (!s.alive) return [];
      s.vote = 0;
      return [];
    }
    const tgt = this.seats.get(target);
    if (!tgt?.inGame || !tgt.alive || target === id) return [];
    s.vote = target;
    return [];
  }

  lock(id: number, now: number): SilumanEvent[] {
    this.advance(now);
    const s = this.seats.get(id);
    if (this.phase !== 'vote' || !s?.inGame || s.locked || s.vote === null) return [];
    s.locked = true;
    this.events.push({ type: 'locked', id });
    this.checkProgress();
    return this.flush();
  }

  /* ------------------------------------------------------------------ clock */

  tick(now: number): SilumanEvent[] {
    this.advance(now);
    if (this.held || this.deadline <= 0 || this.t < this.deadline) return this.flush();
    switch (this.phase) {
      case 'intro':
        this.cue++;
        if (this.cue >= INTRO_CUES.length) this.enter('deal', TIMING.dealMs);
        else {
          this.deadline += TIMING.introCueMs;
          this.events.push({ type: 'cue', cue: INTRO_CUES[this.cue]! });
        }
        break;
      case 'deal':
        this.startDusk();
        break;
      case 'dusk':
        this.openTurn(0);
        break;
      case 'night':
        if (this.stage === 'open') {
          this.events.push({ type: 'close', role: NIGHT_ORDER[this.turn]! });
          this.stage = 'gap';
          this.deadline = this.t + TIMING.gapMs;
        } else if (this.turn + 1 < NIGHT_ORDER.length) this.openTurn(this.turn + 1);
        else this.dawn();
        break;
      case 'dawn':
        this.afterDeath('dawn', this.dawnVictim);
        break;
      case 'hunt':
        this.afterHunt();
        break;
      case 'discuss':
        this.endDiscussion();
        break;
      case 'defense':
        this.startVote();
        break;
      case 'vote':
        this.closeVote();
        break;
      case 'tally':
        this.enter('reveal', TIMING.revealMs);
        break;
      case 'reveal':
        this.afterDeath('reveal', this.tally?.out ?? null);
        break;
      case 'final':
        this.deadline = 0;
        this.enter('ended', 0);
        break;
      default:
        break;
    }
    return this.flush();
  }

  /* ------------------------------------------------------------------ flow */

  private joinOf(id: number): number {
    return this.seats.get(id)?.joinIndex ?? 0;
  }

  private advance(now: number): void {
    const dt = Math.max(0, Math.min(1_000, now - this.last));
    this.last = now;
    if (!this.held) this.t += dt;
  }

  private flush(): SilumanEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  private enter(phase: Phase, ms: number): void {
    this.phase = phase;
    this.phaseStart = this.t;
    this.deadline = ms > 0 ? this.t + ms : 0;
    this.events.push({ type: 'phase', phase });
  }

  private deal(): void {
    const seated = this.present;
    const roles = shuffle(rolesFor(seated.length, this.settings.extras), this.rnd);
    seated.forEach((s, i) => {
      s.inGame = true;
      s.role = roles[i] ?? 'warga';
      s.alive = true;
      s.out = null;
      s.ready = false;
    });
  }

  private kill(s: Seat, cause: Cause): void {
    s.alive = false;
    s.out = { cause, at: this.night };
    s.suspect = null;
  }

  private startDusk(): void {
    this.night++;
    this.silumanPicks.clear();
    this.dukunPick = null;
    this.tabibPick = null;
    this.stage = 'gap';
    this.turn = 0;
    for (const s of this.table) {
      s.ready = false;
      s.vote = null;
      s.locked = false;
      s.suspect = null;
    }
    this.enter('dusk', TIMING.duskMs);
  }

  private openTurn(turn: number): void {
    if (this.phase !== 'night') this.enter('night', 0);
    this.turn = turn;
    this.stage = 'open';
    this.deadline = this.t + TIMING.turnMs;
    this.events.push({ type: 'call', role: NIGHT_ORDER[turn]! });
  }

  /** The siluman's victim: most picked, ties broken at random; null without picks. */
  private silumanChoice(): number | null {
    const counts = new Map<number, number>();
    for (const [from, to] of this.silumanPicks) {
      const s = this.seats.get(from);
      const t = this.seats.get(to);
      if (!s?.alive || !t?.alive) continue;
      counts.set(to, (counts.get(to) ?? 0) + 1);
    }
    if (counts.size === 0) return null;
    const top = Math.max(...counts.values());
    const tied = [...counts.entries()].filter(([, n]) => n === top).map(([id]) => id);
    tied.sort((a, b) => this.joinOf(a) - this.joinOf(b));
    return tied[Math.floor(this.rnd() * tied.length)] ?? null;
  }

  private dawn(): void {
    const attacked = this.silumanChoice();
    const saved = attacked !== null && attacked === this.tabibPick;
    let victim: number | null = null;
    if (attacked !== null && !saved) {
      const v = this.seats.get(attacked);
      if (v?.alive) {
        this.kill(v, 'night');
        victim = attacked;
      }
    }
    if (saved) for (const t of this.holders('tabib')) if (t.alive) t.stats.saves++;
    this.lastProtected = this.tabibPick;
    const sight = this.dukunPick !== null ? (this.sights[this.sights.length - 1] ?? null) : null;
    this.nights.push({ night: this.night, attacked, protected: this.tabibPick, victim, sight });
    this.dawnVictim = victim;
    this.stage = 'gap';
    this.enter('dawn', TIMING.dawnMs);
  }

  /** After a death is shown: the Pemburu's shot, the end, or the next part of the cycle. */
  private afterDeath(from: 'dawn' | 'reveal', dead: number | null): void {
    const d = dead !== null ? this.seats.get(dead) : undefined;
    if (d && d.role === 'pemburu' && !d.alive && this.alive.length > 0) {
      this.hunter = d.id;
      this.huntShot = null;
      this.huntFrom = from;
      this.enter('hunt', TIMING.huntMs);
      return;
    }
    this.continueCycle(from);
  }

  private afterHunt(): void {
    this.hunter = null;
    this.continueCycle(this.huntFrom);
  }

  private continueCycle(from: 'dawn' | 'reveal'): void {
    const side = this.winningSide();
    if (side) {
      this.finish(side);
      return;
    }
    if (from === 'dawn') this.startDiscussion();
    else if (this.night >= MAX_DAYS) this.finish('warga');
    else this.startDusk();
  }

  private winningSide(): Side | null {
    const alive = this.alive;
    const siluman = alive.filter((s) => s.role === 'siluman').length;
    if (siluman === 0) return 'warga';
    if (siluman >= alive.length - siluman) return 'siluman';
    return null;
  }

  private startDiscussion(): void {
    this.huntShot = null;
    for (const s of this.table) {
      s.ready = false;
      s.suspect = null;
      s.vote = null;
      s.locked = false;
    }
    this.enter('discuss', TIMING.talkMs[this.settings.talk]);
  }

  private endDiscussion(): void {
    const marks = this.suspicions();
    const top = marks[0];
    const second = marks[1];
    if (top && (!second || second.by.length < top.by.length)) {
      this.defender = top.id;
      this.enter('defense', TIMING.defenseMs);
    } else this.startVote();
  }

  private startVote(): void {
    for (const s of this.table) {
      s.vote = null;
      s.locked = false;
    }
    this.enter('vote', TIMING.voteMs);
  }

  private closeVote(): void {
    const voters = this.alive.filter((s) => s.vote !== null && (s.locked || s.present));
    const order = shuffle(
      voters.map((s) => ({ from: s.id, to: s.vote ?? 0 })),
      this.rnd,
    );
    const counts = new Map<number, number>();
    let skips = 0;
    for (const v of order) {
      if (v.to === 0) skips++;
      else counts.set(v.to, (counts.get(v.to) ?? 0) + 1);
    }
    const sorted = [...counts.entries()]
      .map(([id, votes]) => ({ id, votes }))
      .sort((a, b) => b.votes - a.votes || this.joinOf(a.id) - this.joinOf(b.id));
    const top = sorted[0];
    const tie = Boolean(top && sorted[1] && sorted[1].votes === top.votes);
    const out = top && !tie && top.votes > skips ? top.id : null;
    this.tally = { order, counts: sorted, skips, out, tie };

    for (const v of order) {
      if (v.to === 0) continue;
      const tgt = this.seats.get(v.to);
      const from = this.seats.get(v.from);
      if (tgt) tgt.stats.votesReceived++;
      if (from && tgt?.role === 'siluman') from.stats.goodVotes++;
    }
    for (const g of this.ghosts) {
      if (g.vote === null || g.vote === 0) continue;
      if (this.seats.get(g.vote)?.role === 'siluman') g.stats.ghostHits++;
    }
    if (this.defender !== null && out !== this.defender) {
      const d = this.seats.get(this.defender);
      if (d) d.stats.defended++;
    }
    this.defender = null;
    if (out !== null) {
      const o = this.seats.get(out);
      if (o) this.kill(o, 'vote');
    }
    this.days.push({ day: this.night, out, tie });
    this.enter('tally', tallyLength(order.length));
  }

  private finish(side: Side): void {
    this.winner = side;
    this.events.push({ type: 'win', side });
    for (const s of this.table) {
      const st = s.stats;
      let pts = st.goodVotes * POINTS.goodVote + st.ghostHits * POINTS.ghostHit;
      pts += st.seen * POINTS.seen + st.saves * POINTS.save + st.shots * POINTS.shot;
      if (sideOf(s.role) === side) pts += POINTS.win + (s.alive ? POINTS.aliveWin : 0);
      s.score += pts;
    }
    this.enter('final', TIMING.finalMs);
  }

  private checkProgress(): void {
    if (this.phase === 'deal') {
      const waiting = this.table.filter((s) => s.present && !s.ready);
      if (waiting.length === 0 && this.phaseElapsed() >= TIMING.dealMinMs) this.startDusk();
      else if (waiting.length === 0) this.deadline = this.phaseStart + TIMING.dealMinMs;
    } else if (this.phase === 'discuss') {
      const talkers = this.alive.filter((s) => s.present);
      if (talkers.length > 0 && talkers.every((s) => s.ready)) this.endDiscussion();
    } else if (this.phase === 'vote') {
      const voters = this.alive.filter((s) => s.present);
      if (voters.length > 0 && voters.every((s) => s.locked)) this.closeVote();
    }
  }
}
