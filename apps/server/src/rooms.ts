import {
  type AdminRoom,
  type AppConfig,
  type Channel,
  CLOSE,
  type ClientMsg,
  DEFAULT_CONFIG,
  type ErrorCode,
  type Fruit,
  freeFruit,
  generateMirrorKey,
  generateRoomCode,
  type HostOfferResult,
  isMirrorKey,
  isRoomCode,
  LIMITS,
  type Look,
  lookAt,
  lookOfFruit,
  type NearbyRoom,
  PASS_MOVE_GAP_MS,
  type PassReject,
  PLAYER_COLORS,
  type PlayerInfo,
  PROTOCOL_VERSION,
  type RelayTarget,
  type RoomAccess,
  type RoomPass,
  type RtcSignal,
  type ServerMsg,
  stampInput,
  type TrialReject,
} from '@hoorah/protocol';
import type { Logger } from './log';
import { networkKey } from './network';
import type { PassLookup, PassRecord, ScreenGrant } from './passes';
import type { TrialLookup } from './trials';

/** Transport-agnostic socket handle so room logic can be unit-tested without a network. */
export interface Conn {
  readonly ip: string;
  send(msg: ServerMsg): void;
  sendBinary(bytes: Uint8Array): void;
  close(code: number, reason: string): void;
}

interface Player {
  id: number;
  name: string;
  fruit: Fruit;
  look: Look;
  /** Choosing an avatar right after joining (cleared by "Siap" or when the phone drops). */
  picking: boolean;
  color: string;
  token: string;
  conn: Conn | null;
  joinedAt: number;
  goneAt: number | null;
}

interface Room {
  code: string;
  screenToken: string;
  screen: Conn | null;
  screenGoneAt: number | null;
  players: Map<number, Player>;
  hostId: number | null;
  nextId: number;
  maxPlayers: number;
  createdAt: number;
  lastActivity: number;
  /** Network of the main screen (see network.ts), for the nearby-screen hint. */
  screenNet: string;
  /** Shared Hoorah Pass opening this room's seats (a copy, refreshed when the admin changes it). */
  pass: PassRecord | null;
  /** The main screen's own id from its hello; single/promo codes and the trial follow it. */
  screenId: string | null;
  /** That screen's running single/promo codes (a copy, reloaded whenever they change). */
  grants: ScreenGrant[];
  /** A single/promo code opening this room only (main screens that send no id). */
  localGrant: ScreenGrant | null;
  /** End of the screen's free trial, when it started one. */
  trialUntil: number | null;
  trialUsed: boolean;
  /** What the room has, its pass end and seats, as last sent (see `refreshAccess`). */
  access: RoomAccess;
  passInfo: RoomPass | null;
  /** Page and game on the main screen as it reports them (`status`); for the dashboard only. */
  page: string | null;
  gameId: string | null;
  /** Phones linked to the screen over WebRTC, as the screen last reported (dashboard only). */
  direct: number;
  /** Most seats taken at once, for the usage numbers when the room closes. */
  peakPlayers: number;
  /** The Host asked another player to take over and is waiting for the answer (at most one). */
  hostOffer: HostOffer | null;
  /** Secret of the far-away main screen link (long-distance play); only the main screen gets it. */
  mirrorKey: string;
  /** Far-away main screens watching (listen only, never players), with their direct-link set-up state. */
  mirrors: Map<Conn, FarScreen>;
  /** Id for the next far-away main screen (wraps at LIMITS.maxMirrorId). */
  nextMirrorId: number;
}

/** One far-away main screen's connection: its id and its recent direct-link signals. */
interface FarScreen {
  id: number;
  /** When signals from the main screen to it, and from it, went through (the last 10 s). */
  toSignals: number[];
  fromSignals: number[];
}

interface HostOffer {
  from: number;
  to: number;
  at: number;
}

/** Wrong room codes one address may try per minute before joining is refused for a while. */
const JOIN_FAILS_PER_MINUTE = 20;
/** Wrong pass codes one address may try per minute. */
const PASS_FAILS_PER_MINUTE = 10;
/** Screens idle longer than this are not offered as "nearby". */
const NEARBY_FRESH_MS = 30 * 60_000;
/** Trial requests one address may send per minute. */
const TRIAL_TRIES_PER_MINUTE = 10;
/**
 * One address may start trials for this many other main screens within the window before the
 * next is refused (lenient: a household shares one Wi-Fi and may own a few screens).
 */
const TRIAL_OTHER_SCREENS_PER_IP = 2;
const TRIAL_IP_WINDOW_MS = 30 * 24 * 60 * 60_000;
/**
 * Direct-link signals (offer, answer, hangup) per far-away main screen and direction within
 * SIGNAL_WINDOW_MS. A healthy set-up needs two; retries back off from 2 s, so this is generous.
 */
const SIGNALS_PER_WINDOW = 12;
const SIGNAL_WINDOW_MS = 10_000;

type Binding =
  | { room: Room; role: 'screen' }
  | { room: Room; role: 'controller'; id: number }
  | { room: Room; role: 'mirror' };

export interface RoomSnapshot {
  code: string;
  screenToken: string;
  hostId: number | null;
  nextId: number;
  maxPlayers: number;
  createdAt: number;
  players: {
    id: number;
    name: string;
    fruit: Fruit;
    /** Missing in snapshots from before avatars (2026-11-24). */
    look?: Look;
    color: string;
    token: string;
    joinedAt: number;
  }[];
  /** Pass the room was using; checked again on restore. */
  passId?: number | null;
  /** The main screen's id. */
  screenId?: string | null;
  /** A single/promo code opening this room only; checked again on restore. */
  localGrant?: ScreenGrant | null;
  /** The far-away main screen link secret, so a friend's link survives a server restart. */
  mirrorKey?: string;
}

/**
 * What the dashboard counts (usage and security log). Called synchronously; implementations only
 * collect in memory, the room logic never waits on them.
 */
export interface RoomEvents {
  roomCreated(at: number): void;
  /** The main screen entered a game; `players` = phones connected at that moment. */
  gameStarted(gameId: string, players: number, at: number): void;
  /** `lifetimeMs`: from opening until the screen left (or the last activity). */
  roomClosed(lifetimeMs: number, peakPlayers: number, at: number): void;
  /** A room started using a Hoorah Pass. */
  passActivated(at: number): void;
  passRejected(ip: string, reason: 'invalid' | 'rate_limited', at: number): void;
}

/** Live counts across every room for the dashboard. */
export interface LiveCounts {
  rooms: number;
  /** Rooms whose main screen is connected. */
  screens: number;
  /** Phones connected. */
  phones: number;
  players: number;
  /** Connected phones on a direct link to their (connected) screen. */
  direct: number;
}

export interface RoomManagerOptions {
  now: () => number;
  random: () => number;
  token: () => string;
  maxPlayers: number;
  roomsPerIpPerMinute: number;
  log: Logger;
  /** Hoorah Pass codes; without it every room stays at `maxPlayers`. */
  passes?: PassLookup;
  /** Free trials; without it the trial is never granted. */
  trials?: TrialLookup;
  /** The owner's settings at start (default: DEFAULT_CONFIG); later changes go through setConfig. */
  config?: AppConfig;
  events?: RoomEvents;
  /** New far-away main screen link secrets (default: from `random`; production: crypto). */
  mirrorKey?: () => string;
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly bindings = new Map<Conn, Binding>();
  private readonly roomCreations = new Map<string, number[]>();
  private readonly joinFailures = new Map<string, number[]>();
  private readonly passFailures = new Map<string, number[]>();
  private readonly trialTries = new Map<string, number[]>();
  private config: AppConfig;

  constructor(private readonly opts: RoomManagerOptions) {
    this.config = opts.config ?? DEFAULT_CONFIG;
  }

  get appConfig(): AppConfig {
    return this.config;
  }

  /**
   * The owner changed the settings: every screen and phone hears it, and every room's access is
   * worked out again ("semua terbuka" may have been switched).
   */
  setConfig(config: AppConfig): void {
    this.config = config;
    const msg: ServerMsg = { t: 'config', config };
    for (const conn of this.bindings.keys()) conn.send(msg);
    for (const room of this.rooms.values()) this.updateAccess(room);
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  get connectionCount(): number {
    return this.bindings.size;
  }

  /** Seats taken across all rooms (held seats of dropped phones included). */
  get playerCount(): number {
    let n = 0;
    for (const r of this.rooms.values()) n += r.players.size;
    return n;
  }

  liveCounts(): LiveCounts {
    const out: LiveCounts = { rooms: this.rooms.size, screens: 0, phones: 0, players: 0, direct: 0 };
    for (const r of this.rooms.values()) {
      let phones = 0;
      for (const p of r.players.values()) if (p.conn) phones++;
      out.players += r.players.size;
      out.phones += phones;
      if (!r.screen) continue;
      out.screens++;
      out.direct += Math.min(r.direct, phones);
    }
    return out;
  }

  /* ------------------------------------------------------------------ messages */

  handleMessage(conn: Conn, msg: ClientMsg): void {
    if (msg.t === 'hello') {
      if (this.bindings.has(conn)) {
        this.fail(conn, 'bad_request', true);
        return;
      }
      if (msg.v !== PROTOCOL_VERSION) {
        this.fail(conn, 'version', true, CLOSE.version);
        return;
      }
      if (msg.role === 'screen') this.helloScreen(conn, msg.resume, msg.screen);
      else if (msg.role === 'mirror') this.helloMirror(conn, msg.code, msg.key);
      else this.helloController(conn, msg.code, msg.name, msg.look, msg.fruit, msg.token, msg.pass);
      return;
    }

    const b = this.bindings.get(conn);
    if (!b) {
      this.fail(conn, 'bad_request', true);
      return;
    }
    const room = b.room;
    if (b.role === 'mirror') {
      // A far-away main screen only listens: its pings keep the clock in sync and it may answer
      // the main screen's direct-link offer. Nothing else goes.
      if (msg.t === 'ping') conn.send({ t: 'pong', id: msg.id, ct: msg.ct, st: this.opts.now() });
      else if (msg.t === 'mirrorRtc' && msg.to === undefined) this.signalFromMirror(conn, room, msg.sig);
      else this.fail(conn, 'not_allowed', false);
      return;
    }
    room.lastActivity = this.opts.now();

    switch (msg.t) {
      case 'ping':
        conn.send({ t: 'pong', id: msg.id, ct: msg.ct, st: this.opts.now() });
        return;
      case 'relay':
        this.relay(b, msg.ch, msg.to, msg.data, msg.skip);
        return;
      case 'host': {
        if (!this.canManage(b)) {
          this.fail(conn, 'not_allowed', false);
          return;
        }
        const target = room.players.get(msg.id);
        if (!target?.conn) {
          this.fail(conn, 'bad_request', false);
          return;
        }
        room.hostId = target.id;
        this.broadcastPlayers(room);
        return;
      }
      case 'hostOffer':
        this.offerHost(conn, b, msg.id);
        return;
      case 'hostOfferCancel': {
        const offer = room.hostOffer;
        if (b.role !== 'controller' || !offer || offer.from !== b.id) return;
        this.endHostOffer(room, 'cancelled');
        return;
      }
      case 'hostReply':
        this.replyHostOffer(conn, b, msg.accept);
        return;
      case 'profile': {
        if (b.role !== 'controller') {
          this.fail(conn, 'not_allowed', false);
          return;
        }
        const me = room.players.get(b.id);
        if (!me) return;
        me.name = msg.name;
        me.look = msg.look;
        me.picking = msg.picking === true;
        this.broadcastPlayers(room);
        return;
      }
      case 'kick': {
        if (!this.canManage(b) || (b.role === 'controller' && b.id === msg.id)) {
          this.fail(conn, 'not_allowed', false);
          return;
        }
        const target = room.players.get(msg.id);
        if (!target) return;
        if (target.conn) {
          target.conn.send({ t: 'kicked' });
          this.bindings.delete(target.conn);
          target.conn.close(CLOSE.kicked, 'kicked');
        }
        this.removePlayer(room, target.id);
        return;
      }
      case 'leave':
        if (b.role !== 'controller') return;
        this.bindings.delete(conn);
        this.removePlayer(room, b.id);
        return;
      case 'status': {
        if (b.role !== 'screen') return;
        // A game start: the screen enters a game page it was not already on (a resumed screen
        // repeats its status, which must not count again).
        const started =
          msg.page === 'game' && msg.gameId !== null && (room.page !== 'game' || room.gameId !== msg.gameId);
        room.page = msg.page;
        room.gameId = msg.gameId;
        if (msg.direct !== undefined) room.direct = msg.direct;
        if (started && msg.gameId !== null) {
          const gameId = msg.gameId;
          let players = 0;
          for (const p of room.players.values()) if (p.conn) players++;
          this.emit((e) => e.gameStarted(gameId, players, this.opts.now()));
        }
        return;
      }
      case 'pass': {
        const r = this.enterPass(conn, room, msg.code, true);
        conn.send(
          typeof r === 'string' ? { t: 'pass', ok: false, reason: r } : { t: 'pass', ok: true, pass: r },
        );
        return;
      }
      case 'trial': {
        const reason = this.startTrial(conn, room);
        if (reason) conn.send({ t: 'trial', ok: false, reason });
        return;
      }
      case 'mirrorsOff':
        if (b.role !== 'screen') {
          this.fail(conn, 'not_allowed', false);
          return;
        }
        this.stopMirrors(room);
        return;
      case 'mirrorRtc':
        if (b.role !== 'screen' || msg.to === undefined) {
          this.fail(conn, 'not_allowed', false);
          return;
        }
        this.signalToMirror(room, msg.to, msg.sig);
        return;
    }
  }

  handleBinary(conn: Conn, bytes: Uint8Array): void {
    const b = this.bindings.get(conn);
    if (b?.role !== 'controller' || !b.room.screen) return;
    const stamped = stampInput(bytes, b.id);
    if (!stamped) return;
    b.room.lastActivity = this.opts.now();
    b.room.screen.sendBinary(stamped);
  }

  handleClose(conn: Conn): void {
    const b = this.bindings.get(conn);
    if (!b) return;
    this.bindings.delete(conn);
    const room = b.room;
    const now = this.opts.now();
    if (b.role === 'mirror') {
      if (room.mirrors.delete(conn)) this.tellMirrorCount(room);
      return;
    }
    if (b.role === 'screen') {
      if (room.screen !== conn) return;
      room.screen = null;
      room.screenGoneAt = now;
      room.direct = 0;
      this.toControllers(room, { t: 'screen', online: false });
      this.toMirrors(room, { t: 'screen', online: false });
      this.opts.log.info('screen_left', { code: room.code });
      return;
    }
    const p = room.players.get(b.id);
    if (!p || p.conn !== conn) return;
    p.conn = null;
    p.goneAt = now;
    this.broadcastPlayers(room);
  }

  /* ------------------------------------------------------------------ housekeeping */

  /** Expire held slots, move the host role, close abandoned rooms. Call about once a second. */
  tick(): void {
    const now = this.opts.now();
    for (const room of this.rooms.values()) {
      // Also ends a trial or a screen's Pass whose time is up.
      if (room.pass && room.pass.expiresAt <= now) this.dropPass(room, 'expired');
      else this.updateAccess(room);
      if (room.screenGoneAt !== null && now - room.screenGoneAt > LIMITS.screenHoldMs) {
        this.closeRoom(room, 'screen_timeout');
        continue;
      }
      if (now - room.lastActivity > LIMITS.idleRoomMs) {
        this.closeRoom(room, 'idle');
        continue;
      }
      let changed = false;
      for (const p of room.players.values()) {
        if (p.goneAt !== null && now - p.goneAt > LIMITS.slotHoldMs) {
          room.players.delete(p.id);
          if (room.hostId === p.id) room.hostId = null;
          changed = true;
        }
      }
      const host = room.hostId === null ? undefined : room.players.get(room.hostId);
      const hostGone = !host || (host.goneAt !== null && now - host.goneAt > LIMITS.hostHandoverMs);
      if (hostGone) {
        const next = this.pickHost(room);
        if (next !== room.hostId) {
          room.hostId = next;
          changed = true;
        }
      }
      if (changed) this.broadcastPlayers(room);
      if (room.hostOffer && now - room.hostOffer.at >= LIMITS.hostOfferMs) this.endHostOffer(room, 'expired');
    }
    for (const map of [this.roomCreations, this.joinFailures, this.passFailures, this.trialTries]) {
      for (const [ip, times] of map) {
        const fresh = times.filter((t) => now - t < 60_000);
        if (fresh.length) map.set(ip, fresh);
        else map.delete(ip);
      }
    }
  }

  /** Up to three active, not-full rooms whose main screen is on the same network as `ip`. */
  nearby(ip: string): NearbyRoom[] {
    const net = networkKey(ip);
    if (!net) return [];
    const now = this.opts.now();
    return [...this.rooms.values()]
      .filter(
        (r) =>
          r.screenNet === net &&
          r.screen !== null &&
          now - r.lastActivity < NEARBY_FRESH_MS &&
          r.players.size < r.maxPlayers,
      )
      .sort((a, b) => b.lastActivity - a.lastActivity)
      .slice(0, 3)
      .map((r) => ({
        code: r.code,
        players: [...r.players.values()]
          .filter((p) => p.conn !== null)
          .slice(0, 6)
          .map((p) => ({ name: p.name, fruit: p.fruit, look: p.look, color: p.color })),
        seatsLeft: r.maxPlayers - r.players.size,
      }));
  }

  snapshot(): RoomSnapshot[] {
    return [...this.rooms.values()].map((r) => ({
      code: r.code,
      screenToken: r.screenToken,
      hostId: r.hostId,
      nextId: r.nextId,
      maxPlayers: r.maxPlayers,
      createdAt: r.createdAt,
      players: [...r.players.values()].map(({ id, name, fruit, look, color, token, joinedAt }) => ({
        id,
        name,
        fruit,
        look,
        color,
        token,
        joinedAt,
      })),
      passId: r.pass?.id ?? null,
      screenId: r.screenId,
      localGrant: r.localGrant,
      mirrorKey: r.mirrorKey,
    }));
  }

  /** Restored rooms wait for their screen and players to reconnect with their tokens. */
  restore(snaps: RoomSnapshot[]): void {
    const now = this.opts.now();
    for (const s of snaps) {
      // Rooms from an older code format can no longer be joined: let them go.
      if (this.rooms.has(s.code) || !isRoomCode(s.code)) continue;
      const players = new Map<number, Player>();
      for (const p of s.players)
        players.set(p.id, {
          ...p,
          look: p.look ?? lookOfFruit(p.fruit),
          picking: false,
          conn: null,
          goneAt: now,
        });
      // The pass may have ended or been revoked while the server was down.
      const stored = s.passId ? (this.opts.passes?.byId(s.passId) ?? null) : null;
      const pass = stored && stored.revokedAt === null && stored.expiresAt > now ? stored : null;
      const local = s.localGrant ?? null;
      const localPass = local ? (this.opts.passes?.byId(local.passId) ?? null) : null;
      const room: Room = {
        code: s.code,
        screenToken: s.screenToken,
        screen: null,
        screenGoneAt: now,
        players,
        hostId: s.hostId,
        nextId: s.nextId,
        maxPlayers: s.maxPlayers,
        createdAt: s.createdAt,
        lastActivity: now,
        screenNet: '',
        pass,
        screenId: s.screenId ?? null,
        grants: [],
        localGrant:
          local && localPass && localPass.revokedAt === null && local.expiresAt > now
            ? { ...local, maxPlayers: localPass.maxPlayers }
            : null,
        trialUntil: null,
        trialUsed: false,
        access: { kind: 'free', until: null, trialUsed: false },
        passInfo: null,
        page: null,
        gameId: null,
        direct: 0,
        peakPlayers: players.size,
        hostOffer: null,
        mirrorKey: isMirrorKey(s.mirrorKey) ? s.mirrorKey : this.newMirrorKey(),
        mirrors: new Map(),
        nextMirrorId: 1,
      };
      this.loadScreen(room, now);
      this.refreshAccess(room);
      this.rooms.set(s.code, room);
    }
  }

  /* ------------------------------------------------------------------ Hoorah Pass (admin side) */

  /**
   * The admin changed, revoked or deleted a pass: rooms using it pick up the new end time and seat
   * count right away, or lose it (players already in keep their seats).
   */
  refreshPass(passId: number): void {
    const now = this.opts.now();
    const fresh = this.opts.passes?.byId(passId) ?? null;
    const usable = fresh !== null && fresh.revokedAt === null;
    for (const room of this.rooms.values()) {
      if (room.pass?.id === passId) {
        if (!fresh || !usable || fresh.expiresAt <= now) {
          room.pass = null;
          this.opts.log.info('pass_dropped', {
            code: room.code,
            passId,
            reason: fresh ? 'revoked' : 'deleted',
          });
        } else {
          room.pass = fresh;
        }
      }
      if (room.localGrant?.passId === passId) {
        room.localGrant = fresh && usable ? { ...room.localGrant, maxPlayers: fresh.maxPlayers } : null;
      }
      // Revoking, restoring or deleting a single/promo code changes what its screens have.
      if (room.screenId) room.grants = this.loadGrants(room.screenId, now);
      this.updateAccess(room);
    }
  }

  /** Rooms using each pass right now (shared, or single/promo through their screen). */
  passLiveCounts(): Map<number, number> {
    const counts = new Map<number, number>();
    const now = this.opts.now();
    for (const r of this.rooms.values()) {
      const ids = new Set<number>();
      if (r.pass) ids.add(r.pass.id);
      for (const g of this.activeGrants(r, now)) ids.add(g.passId);
      for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }

  /** Every room, most recently active first. */
  adminRooms(): AdminRoom[] {
    const now = this.opts.now();
    const passOf = (r: Room): AdminRoom['pass'] => {
      if (r.pass) return { id: r.pass.id, code: r.pass.code, expiresAt: r.pass.expiresAt };
      const g = this.activeGrants(r, now).sort((a, b) => b.expiresAt - a.expiresAt)[0];
      return g ? { id: g.passId, code: g.code, expiresAt: g.expiresAt } : null;
    };
    return [...this.rooms.values()]
      .sort((a, b) => b.lastActivity - a.lastActivity)
      .map((r) => ({
        code: r.code,
        screenOnline: r.screen !== null,
        players: r.players.size,
        connected: [...r.players.values()].filter((p) => p.conn !== null).length,
        maxPlayers: r.maxPlayers,
        page: r.page,
        gameId: r.gameId,
        pass: passOf(r),
        createdAt: r.createdAt,
        lastActivity: r.lastActivity,
      }));
  }

  /* ------------------------------------------------------------------ internals */

  private helloScreen(conn: Conn, resume?: { code: string; token: string }, screenId?: string): void {
    const now = this.opts.now();
    const existing = resume ? this.rooms.get(resume.code) : undefined;
    if (existing && resume && existing.screenToken === resume.token) {
      if (existing.screen && existing.screen !== conn) {
        const old = existing.screen;
        this.bindings.delete(old);
        old.send({ t: 'error', code: 'session_replaced', fatal: true });
        old.close(CLOSE.replaced, 'replaced');
      }
      existing.screen = conn;
      existing.screenGoneAt = null;
      // Links are set up again by the new connection, which reports them.
      existing.direct = 0;
      existing.screenNet = networkKey(conn.ip);
      existing.lastActivity = now;
      // A room made before the screen sent its id (or restored without one) adopts it.
      if (screenId && !existing.screenId) {
        existing.screenId = screenId;
        this.loadScreen(existing, now);
      }
      const changed = this.refreshAccess(existing);
      this.bindings.set(conn, { room: existing, role: 'screen' });
      conn.send({
        t: 'welcome',
        role: 'screen',
        code: existing.code,
        token: existing.screenToken,
        players: this.playerList(existing),
        maxPlayers: existing.maxPlayers,
        pass: existing.passInfo,
        access: existing.access,
        config: this.config,
        resumed: true,
        mirrorKey: existing.mirrorKey,
        mirrors: existing.mirrors.size,
        mirrorIds: this.mirrorIds(existing),
      });
      if (changed) {
        this.toControllers(existing, this.roomMsg(existing));
        this.toMirrors(existing, this.roomMsg(existing));
      }
      this.toControllers(existing, { t: 'screen', online: true });
      this.toMirrors(existing, { t: 'screen', online: true });
      this.opts.log.info('screen_resumed', { code: existing.code });
      return;
    }

    const recent = this.roomCreations.get(conn.ip) ?? [];
    if (recent.filter((t) => now - t < 60_000).length >= this.opts.roomsPerIpPerMinute) {
      this.fail(conn, 'rate_limited', true);
      return;
    }
    recent.push(now);
    this.roomCreations.set(conn.ip, recent);

    let code = generateRoomCode(this.opts.random);
    for (let i = 0; this.rooms.has(code) && i < 50; i++) code = generateRoomCode(this.opts.random);
    if (this.rooms.has(code)) {
      this.fail(conn, 'rate_limited', true);
      return;
    }
    const room: Room = {
      code,
      screenToken: this.opts.token(),
      screen: conn,
      screenGoneAt: null,
      players: new Map(),
      hostId: null,
      nextId: 1,
      maxPlayers: this.opts.maxPlayers,
      createdAt: now,
      lastActivity: now,
      screenNet: networkKey(conn.ip),
      pass: null,
      screenId: screenId ?? null,
      grants: [],
      localGrant: null,
      trialUntil: null,
      trialUsed: false,
      access: { kind: 'free', until: null, trialUsed: false },
      passInfo: null,
      page: null,
      gameId: null,
      direct: 0,
      peakPlayers: 0,
      hostOffer: null,
      mirrorKey: this.newMirrorKey(),
      mirrors: new Map(),
      nextMirrorId: 1,
    };
    this.loadScreen(room, now);
    this.refreshAccess(room);
    this.rooms.set(code, room);
    this.bindings.set(conn, { room, role: 'screen' });
    conn.send({
      t: 'welcome',
      role: 'screen',
      code,
      token: room.screenToken,
      players: [],
      maxPlayers: room.maxPlayers,
      pass: room.passInfo,
      access: room.access,
      config: this.config,
      resumed: false,
      mirrorKey: room.mirrorKey,
      mirrors: 0,
      mirrorIds: [],
    });
    this.emit((e) => e.roomCreated(now));
    this.opts.log.info('room_created', { code });
  }

  private helloController(
    conn: Conn,
    code: string,
    name: string,
    look: Look | undefined,
    fruit: Fruit | undefined,
    token?: string,
    passCode?: string,
  ): void {
    const now = this.opts.now();
    // Guessing codes: after too many wrong ones from one address, stop looking them up.
    const fails = (this.joinFailures.get(conn.ip) ?? []).filter((t) => now - t < 60_000);
    if (fails.length >= JOIN_FAILS_PER_MINUTE) {
      this.fail(conn, 'rate_limited', true);
      return;
    }
    const room = this.rooms.get(code);
    if (!room) {
      fails.push(now);
      this.joinFailures.set(conn.ip, fails);
      this.fail(conn, 'room_not_found', true, CLOSE.roomClosed);
      return;
    }
    room.lastActivity = now;
    // Seats as of now (a trial or Pass may have ended since the last tick).
    this.updateAccess(room);

    const known = token ? [...room.players.values()].find((p) => p.token === token) : undefined;
    if (known) {
      if (known.conn && known.conn !== conn) {
        const old = known.conn;
        this.bindings.delete(old);
        old.send({ t: 'error', code: 'session_replaced', fatal: true });
        old.close(CLOSE.replaced, 'replaced');
      }
      known.conn = conn;
      known.goneAt = null;
      known.name = name;
      if (look) known.look = look;
      if (room.hostId === null) room.hostId = known.id;
      this.bindings.set(conn, { room, role: 'controller', id: known.id });
      this.welcomeController(conn, room, known, true);
      this.broadcastPlayers(room);
      return;
    }

    // A pass the phone remembers (or just typed on the "room full" page) opens the seats first.
    // A remembered code never moves a single code away from another screen (`canMove` false).
    let passRejected: PassReject | null = null;
    if (passCode && !this.hasCode(room, passCode, now)) {
      const r = this.enterPass(conn, room, passCode, false);
      if (typeof r === 'string') passRejected = r;
    }
    if (room.players.size >= room.maxPlayers) {
      const code: ErrorCode =
        passRejected === 'invalid'
          ? 'pass_invalid'
          : passRejected === 'expired' || passRejected === 'used'
            ? 'pass_expired'
            : passRejected === 'busy'
              ? 'pass_busy'
              : passRejected === 'rate_limited'
                ? 'rate_limited'
                : 'room_full';
      this.fail(conn, code, true);
      // The main screen offers the Pass (or the trial) to the room that just ran out of seats.
      if (code === 'room_full') room.screen?.send({ t: 'turnedAway' });
      return;
    }
    const id = this.nextFreeId(room);
    if (id === null) {
      this.fail(conn, 'room_full', true);
      return;
    }
    const used = new Set([...room.players.values()].map((p) => p.color));
    const color = PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[(id - 1) % PLAYER_COLORS.length]!;
    // Fruits are handed out per seat now (only the 3D racers draw them); old phones keep theirs.
    const seatFruit = fruit ?? freeFruit([...room.players.values()].map((p) => p.fruit));
    const player: Player = {
      id,
      name,
      fruit: seatFruit,
      look: look ?? (fruit ? lookOfFruit(fruit) : lookAt(id - 1)),
      picking: false,
      color,
      token: this.opts.token(),
      conn,
      joinedAt: now,
      goneAt: null,
    };
    room.players.set(id, player);
    room.peakPlayers = Math.max(room.peakPlayers, room.players.size);
    if (room.hostId === null) room.hostId = id;
    this.bindings.set(conn, { room, role: 'controller', id });
    this.welcomeController(conn, room, player, false);
    // The phone forgets a remembered code that no longer works; joining went ahead anyway.
    if (passRejected) conn.send({ t: 'pass', ok: false, reason: passRejected });
    this.broadcastPlayers(room);
    if (room.pass) this.notePassUse(room);
    this.opts.log.info('player_joined', { code: room.code, id, players: room.players.size });
  }

  /**
   * A far-away main screen (long-distance play) joins with the room code and the secret from the
   * main screen's link. A wrong pair counts toward the same wrong-code limit as phones.
   */
  private helloMirror(conn: Conn, code: string, key: string): void {
    const now = this.opts.now();
    const fails = (this.joinFailures.get(conn.ip) ?? []).filter((t) => now - t < 60_000);
    if (fails.length >= JOIN_FAILS_PER_MINUTE) {
      this.fail(conn, 'rate_limited', true);
      return;
    }
    const room = this.rooms.get(code);
    if (!room || room.mirrorKey !== key) {
      fails.push(now);
      this.joinFailures.set(conn.ip, fails);
      this.fail(conn, 'room_not_found', true, CLOSE.roomClosed);
      return;
    }
    if (room.mirrors.size >= LIMITS.maxMirrors) {
      this.fail(conn, 'room_full', true);
      return;
    }
    room.mirrors.set(conn, { id: this.nextMirrorId(room), toSignals: [], fromSignals: [] });
    this.bindings.set(conn, { room, role: 'mirror' });
    conn.send({
      t: 'welcome',
      role: 'mirror',
      code: room.code,
      players: this.playerList(room),
      maxPlayers: room.maxPlayers,
      pass: room.passInfo,
      access: room.access,
      config: this.config,
      screenOnline: room.screen !== null,
    });
    this.tellMirrorCount(room);
    this.opts.log.info('mirror_joined', { code: room.code, mirrors: room.mirrors.size });
  }

  /** The main screen stops long-distance play: every mirror goes, and the old link stops working. */
  private stopMirrors(room: Room): void {
    room.mirrorKey = this.newMirrorKey();
    const notice: ServerMsg = { t: 'error', code: 'mirror_stopped', fatal: true };
    for (const m of room.mirrors.keys()) {
      m.send(notice);
      this.bindings.delete(m);
      m.close(CLOSE.roomClosed, 'mirror_stopped');
    }
    room.mirrors.clear();
    this.tellMirrorCount(room);
  }

  private tellMirrorCount(room: Room): void {
    room.screen?.send({
      t: 'mirrors',
      count: room.mirrors.size,
      key: room.mirrorKey,
      ids: this.mirrorIds(room),
    });
  }

  private mirrorIds(room: Room): number[] {
    return [...room.mirrors.values()].map((f) => f.id);
  }

  /** A free id for a new far-away main screen (at most a few are ever in use at once). */
  private nextMirrorId(room: Room): number {
    const used = new Set(this.mirrorIds(room));
    let id = room.nextMirrorId;
    while (used.has(id)) id = (id % LIMITS.maxMirrorId) + 1;
    room.nextMirrorId = (id % LIMITS.maxMirrorId) + 1;
    return id;
  }

  /** `skip`: far-away screens the main screen already reached over their direct link. */
  private toMirrors(room: Room, msg: ServerMsg, skip?: readonly number[]): void {
    for (const [m, f] of room.mirrors) if (!skip?.includes(f.id)) m.send(msg);
  }

  /** True when one more direct-link signal fits the window (and counts it). */
  private signalAllowed(times: number[]): boolean {
    const now = this.opts.now();
    while (times.length > 0 && now - times[0]! >= SIGNAL_WINDOW_MS) times.shift();
    if (times.length >= SIGNALS_PER_WINDOW) return false;
    times.push(now);
    return true;
  }

  /** The main screen offers (or ends) a direct link to one far-away main screen. */
  private signalToMirror(room: Room, to: number, sig: RtcSignal): void {
    if (sig.k === 'answer') return;
    for (const [m, f] of room.mirrors) {
      if (f.id !== to) continue;
      if (this.signalAllowed(f.toSignals)) m.send({ t: 'mirrorRtc', from: 0, sig });
      else this.opts.log.debug('mirror_signal_limited', { code: room.code, to });
      return;
    }
  }

  /** A far-away main screen answers (or ends) the main screen's direct-link offer. */
  private signalFromMirror(conn: Conn, room: Room, sig: RtcSignal): void {
    const f = room.mirrors.get(conn);
    if (!f || sig.k === 'offer' || !room.screen) return;
    if (this.signalAllowed(f.fromSignals)) room.screen.send({ t: 'mirrorRtc', from: f.id, sig });
    else this.opts.log.debug('mirror_signal_limited', { code: room.code, from: f.id });
  }

  private newMirrorKey(): string {
    return this.opts.mirrorKey?.() ?? generateMirrorKey(this.opts.random);
  }

  private welcomeController(conn: Conn, room: Room, p: Player, resumed: boolean): void {
    conn.send({
      t: 'welcome',
      role: 'controller',
      code: room.code,
      id: p.id,
      token: p.token,
      players: this.playerList(room),
      maxPlayers: room.maxPlayers,
      pass: room.passInfo,
      access: room.access,
      config: this.config,
      screenOnline: room.screen !== null,
      resumed,
    });
  }

  private nextFreeId(room: Room): number | null {
    for (let i = 0; i < 255; i++) {
      const id = ((room.nextId - 1 + i) % 255) + 1;
      if (!room.players.has(id)) {
        room.nextId = (id % 255) + 1;
        return id;
      }
    }
    return null;
  }

  private relay(b: Binding, ch: Channel, to: RelayTarget, data: unknown, skip?: number[]): void {
    const room = b.room;
    if (b.role === 'mirror') return;
    if (b.role === 'controller') {
      // Controllers only talk to the screen; the screen decides what others see.
      if (to !== 'screen' || !room.screen) return;
      room.screen.send({ t: 'relay', ch, from: b.id, data });
      return;
    }
    if (to === 'screen') return;
    const msg: ServerMsg = { t: 'relay', ch, from: 0, data };
    if (to === 'mirror') this.toMirrors(room, msg, skip);
    else if (to === 'all') this.toControllers(room, msg);
    else room.players.get(to)?.conn?.send(msg);
  }

  private canManage(b: Binding): boolean {
    return b.role === 'screen' || (b.role === 'controller' && b.room.hostId === b.id);
  }

  private pickHost(room: Room): number | null {
    let best: Player | null = null;
    for (const p of room.players.values()) {
      if (!p.conn) continue;
      if (!best || p.joinedAt < best.joinedAt) best = p;
    }
    return best?.id ?? null;
  }

  private removePlayer(room: Room, id: number): void {
    room.players.delete(id);
    if (room.hostId === id) room.hostId = this.pickHost(room);
    this.broadcastPlayers(room);
  }

  private closeRoom(room: Room, reason: string): void {
    const notice: ServerMsg = { t: 'error', code: 'room_closed', fatal: true };
    for (const p of room.players.values()) {
      if (!p.conn) continue;
      p.conn.send(notice);
      this.bindings.delete(p.conn);
      p.conn.close(CLOSE.roomClosed, 'room_closed');
    }
    if (room.screen) {
      room.screen.send(notice);
      this.bindings.delete(room.screen);
      room.screen.close(CLOSE.roomClosed, 'room_closed');
    }
    for (const m of room.mirrors.keys()) {
      m.send(notice);
      this.bindings.delete(m);
      m.close(CLOSE.roomClosed, 'room_closed');
    }
    room.mirrors.clear();
    this.rooms.delete(room.code);
    const now = this.opts.now();
    const end = Math.min(now, room.screenGoneAt ?? room.lastActivity);
    this.emit((e) => e.roomClosed(Math.max(0, end - room.createdAt), room.peakPlayers, now));
    this.opts.log.info('room_closed', { code: room.code, reason });
  }

  private playerList(room: Room): PlayerInfo[] {
    return [...room.players.values()]
      .sort((a, b) => a.id - b.id)
      .map((p) => ({
        id: p.id,
        name: p.name,
        fruit: p.fruit,
        look: p.look,
        ...(p.picking && p.conn ? { picking: true } : {}),
        color: p.color,
        connected: p.conn !== null,
        isHost: room.hostId === p.id,
      }));
  }

  private broadcastPlayers(room: Room): void {
    // Every change of host or seats passes here: an offer whose sides changed is over.
    if (room.hostOffer && !this.hostOfferValid(room, room.hostOffer)) this.endHostOffer(room, 'cancelled');
    const msg: ServerMsg = { t: 'players', players: this.playerList(room) };
    room.screen?.send(msg);
    this.toControllers(room, msg);
    this.toMirrors(room, msg);
  }

  /* ------------------------------------------------------------------ Host offers */

  /** The Host phone asks player `to` to take over. Replaces the Host's earlier pending offer. */
  private offerHost(conn: Conn, b: Binding, to: number): void {
    const room = b.room;
    if (b.role !== 'controller' || room.hostId !== b.id || to === b.id) {
      this.fail(conn, 'not_allowed', false);
      return;
    }
    if (!room.players.get(to)?.conn) {
      this.fail(conn, 'bad_request', false);
      return;
    }
    if (room.hostOffer) this.endHostOffer(room, 'cancelled');
    room.hostOffer = { from: b.id, to, at: this.opts.now() };
    const msg: ServerMsg = { t: 'hostOffer', from: b.id, to };
    conn.send(msg);
    room.players.get(to)?.conn?.send(msg);
  }

  /** The asked player answers. Only they may, and only while the offer still holds. */
  private replyHostOffer(conn: Conn, b: Binding, accept: boolean): void {
    const room = b.room;
    const offer = room.hostOffer;
    if (b.role !== 'controller' || !offer || offer.to !== b.id) {
      this.fail(conn, 'not_allowed', false);
      return;
    }
    if (!this.hostOfferValid(room, offer)) {
      this.endHostOffer(room, 'cancelled');
      return;
    }
    if (!accept) {
      this.endHostOffer(room, 'declined');
      return;
    }
    this.endHostOffer(room, 'accepted');
    room.hostId = offer.to;
    this.broadcastPlayers(room);
    const changed: ServerMsg = { t: 'hostChanged', id: offer.to, from: offer.from };
    room.screen?.send(changed);
    this.toControllers(room, changed);
    this.toMirrors(room, changed);
  }

  /** Both sides still connected and the offering player still Host. */
  private hostOfferValid(room: Room, offer: HostOffer): boolean {
    return (
      room.hostId === offer.from &&
      (room.players.get(offer.from)?.conn ?? null) !== null &&
      (room.players.get(offer.to)?.conn ?? null) !== null
    );
  }

  private endHostOffer(room: Room, result: HostOfferResult): void {
    const offer = room.hostOffer;
    if (!offer) return;
    room.hostOffer = null;
    const msg: ServerMsg = { t: 'hostOfferEnd', from: offer.from, to: offer.to, result };
    room.players.get(offer.from)?.conn?.send(msg);
    room.players.get(offer.to)?.conn?.send(msg);
  }

  private toControllers(room: Room, msg: ServerMsg): void {
    for (const p of room.players.values()) p.conn?.send(msg);
  }

  /** Looks a typed code up for `room`; a string result says why it does not open it. */
  private checkPass(conn: Conn, room: Room, code: string): PassRecord | PassReject {
    if (room.pass?.code === code) return room.pass;
    const now = this.opts.now();
    const fails = (this.passFailures.get(conn.ip) ?? []).filter((t) => now - t < 60_000);
    if (fails.length >= PASS_FAILS_PER_MINUTE) {
      this.emit((e) => e.passRejected(conn.ip, 'rate_limited', now));
      return 'rate_limited';
    }
    const found = this.opts.passes?.byCode(code) ?? null;
    if (!found || found.revokedAt !== null) {
      fails.push(now);
      this.passFailures.set(conn.ip, fails);
      this.emit((e) => e.passRejected(conn.ip, 'invalid', now));
      return 'invalid';
    }
    // A single/promo code's end time is only the last moment it can be first used (useScreenPass).
    if (found.kind !== 'shared') return found;
    if (found.expiresAt <= now) return 'expired';
    if (found.maxRooms !== null) {
      let using = 0;
      for (const r of this.rooms.values()) if (r !== room && r.pass?.id === found.id) using++;
      if (using >= found.maxRooms) return 'busy';
    }
    return found;
  }

  /**
   * A code typed for `room` (or remembered by a joining phone). Returns the room's pass end, or why
   * the code did not open it. `canMove`: a single code bound to another screen may move here.
   */
  private enterPass(conn: Conn, room: Room, code: string, canMove: boolean): RoomPass | PassReject {
    const found = this.checkPass(conn, room, code);
    if (typeof found === 'string') return found;
    const now = this.opts.now();
    if (found.kind === 'shared') {
      this.applyPass(room, found);
    } else {
      const reason = this.useScreenPass(room, found, now, canMove);
      if (reason) return reason;
    }
    return room.passInfo ?? { expiresAt: found.expiresAt };
  }

  /** The room already has this code running (nothing to look up again). */
  private hasCode(room: Room, code: string, now: number): boolean {
    return room.pass?.code === code || this.activeGrants(room, now).some((g) => g.code === code);
  }

  /** Opens the room's seats with `pass` (a room keeps whichever pass gives it more). */
  private applyPass(room: Room, pass: PassRecord): void {
    const cur = room.pass;
    if (cur && cur.id !== pass.id && cur.maxPlayers >= pass.maxPlayers && cur.expiresAt >= pass.expiresAt) {
      return;
    }
    if (cur?.id !== pass.id) this.emit((e) => e.passActivated(this.opts.now()));
    room.pass = pass;
    this.notePassUse(room);
    this.updateAccess(room);
    this.opts.log.info('pass_applied', { code: room.code, passId: pass.id, maxPlayers: room.maxPlayers });
  }

  /**
   * A single or promo code. With a screen id it is bound to that main screen (and follows it to
   * every room it opens): single = one screen at a time, moved at most once per PASS_MOVE_GAP_MS;
   * promo = one use per screen up to `maxUses`. Each use runs `durationMs` from its start. Without
   * a screen id (older main screens) the code opens this room only.
   */
  private useScreenPass(room: Room, pass: PassRecord, now: number, canMove: boolean): PassReject | null {
    const store = this.opts.passes;
    if (!store) return 'invalid';
    const freshEnd = pass.durationMs !== null && pass.durationMs > 0 ? now + pass.durationMs : pass.expiresAt;
    const quotaFull = () => pass.maxUses !== null && store.uses(pass.id) >= pass.maxUses;
    const activated = () => this.emit((e) => e.passActivated(now));

    if (!room.screenId) {
      if (room.localGrant?.passId === pass.id && room.localGrant.expiresAt > now) return null;
      let until = freshEnd;
      const bound = pass.kind === 'single' ? store.singleBinding(pass.id) : null;
      if (bound) {
        if (bound.expiresAt <= now) return 'expired';
        until = bound.expiresAt;
      } else {
        if (pass.expiresAt <= now) return 'expired';
        if (pass.kind === 'promo' && quotaFull()) return 'used';
      }
      room.localGrant = { passId: pass.id, code: pass.code, maxPlayers: pass.maxPlayers, expiresAt: until };
      activated();
      this.updateAccess(room);
      this.opts.log.info('pass_applied', { code: room.code, passId: pass.id, maxPlayers: room.maxPlayers });
      return null;
    }

    const screenId = room.screenId;
    const b = pass.kind === 'single' ? store.singleBinding(pass.id) : store.binding(pass.id, screenId);
    if (!b) {
      if (pass.expiresAt <= now) return 'expired';
      if (pass.kind === 'promo' && quotaFull()) return 'used';
      store.bind(pass.id, screenId, now, freshEnd);
      activated();
      this.opts.log.info('pass_bound', { code: room.code, passId: pass.id, kind: pass.kind });
    } else if (b.expiresAt <= now) {
      return 'expired';
    } else if (b.screenId !== screenId) {
      if (!canMove || now - (b.movedAt ?? b.startedAt) < PASS_MOVE_GAP_MS) return 'busy';
      store.move(pass.id, screenId, now);
      this.refreshScreen(b.screenId);
      activated();
      this.opts.log.info('pass_moved', { code: room.code, passId: pass.id });
    }
    this.refreshScreen(screenId);
    return null;
  }

  /** The screen's free trial, when the room is on the free tier. Returns why it did not start. */
  private startTrial(conn: Conn, room: Room): TrialReject | null {
    const now = this.opts.now();
    const tries = (this.trialTries.get(conn.ip) ?? []).filter((t) => now - t < 60_000);
    if (tries.length >= TRIAL_TRIES_PER_MINUTE) return 'rate_limited';
    tries.push(now);
    this.trialTries.set(conn.ip, tries);
    this.updateAccess(room);
    if (room.access.kind !== 'free') return 'not_free';
    const store = this.opts.trials;
    if (!room.screenId || !store || room.trialUsed) return 'used';
    if (store.get(room.screenId)) {
      this.refreshScreen(room.screenId);
      return 'used';
    }
    const others = store.otherScreensFromIp(conn.ip, room.screenId, now - TRIAL_IP_WINDOW_MS);
    if (others > TRIAL_OTHER_SCREENS_PER_IP) return 'used';
    if (!store.start(room.screenId, conn.ip, now, now + this.config.trialMinutes * 60_000)) return 'used';
    this.opts.log.info('trial_started', { code: room.code, minutes: this.config.trialMinutes });
    this.refreshScreen(room.screenId);
    return null;
  }

  /** The shared pass ended: nobody is sent away, but no seats beyond those taken open up again. */
  private dropPass(room: Room, reason: 'expired' | 'revoked' | 'deleted'): void {
    if (!room.pass) return;
    const passId = room.pass.id;
    room.pass = null;
    this.updateAccess(room);
    this.opts.log.info('pass_dropped', { code: room.code, passId, reason });
  }

  private notePassUse(room: Room): void {
    if (!room.pass || !this.opts.passes) return;
    try {
      this.opts.passes.noteUse(room.pass.id, room.code, room.createdAt, room.players.size, this.opts.now());
    } catch (err) {
      // Usage numbers are for the dashboard only; never let them break a join.
      this.opts.log.warn('pass_use_failed', { err: String(err) });
    }
  }

  /** Dashboard counting must never break the room logic. */
  private emit(fn: (events: RoomEvents) => void): void {
    if (!this.opts.events) return;
    try {
      fn(this.opts.events);
    } catch (err) {
      this.opts.log.warn('room_event_failed', { err: String(err) });
    }
  }

  /* ------------------------------------------------------------------ access */

  private loadGrants(screenId: string, now: number): ScreenGrant[] {
    try {
      return this.opts.passes?.screenGrants(screenId, now) ?? [];
    } catch (err) {
      this.opts.log.warn('grants_load_failed', { err: String(err) });
      return [];
    }
  }

  /** Reads the screen's codes and trial into `room` (no messages). */
  private loadScreen(room: Room, now: number): void {
    if (!room.screenId) return;
    room.grants = this.loadGrants(room.screenId, now);
    let trial = null;
    try {
      trial = this.opts.trials?.get(room.screenId) ?? null;
    } catch (err) {
      this.opts.log.warn('trial_load_failed', { err: String(err) });
    }
    room.trialUntil = trial?.expiresAt ?? null;
    room.trialUsed = trial !== null;
  }

  /** Something about this main screen changed: every room it has picks it up. */
  private refreshScreen(screenId: string): void {
    const now = this.opts.now();
    for (const room of this.rooms.values()) {
      if (room.screenId !== screenId) continue;
      this.loadScreen(room, now);
      this.updateAccess(room);
    }
  }

  private activeGrants(room: Room, now: number): ScreenGrant[] {
    const out = room.grants.filter((g) => g.expiresAt > now);
    if (room.localGrant && room.localGrant.expiresAt > now) out.push(room.localGrant);
    return out;
  }

  /**
   * What the room has now: `open` (the owner's switch), else `pass` (shared pass or the screen's
   * single/promo codes, the later end wins), else `trial`, else `free`; and the seats that gives.
   */
  private accessOf(room: Room, now: number): { access: RoomAccess; seats: number; pass: RoomPass | null } {
    let passEnd: number | null = null;
    let passSeats = 0;
    if (room.pass && room.pass.expiresAt > now) {
      passEnd = room.pass.expiresAt;
      passSeats = room.pass.maxPlayers;
    }
    for (const g of this.activeGrants(room, now)) {
      passEnd = Math.max(passEnd ?? 0, g.expiresAt);
      passSeats = Math.max(passSeats, g.maxPlayers);
    }
    const trialUsed = room.trialUsed;
    const pass = passEnd === null ? null : { expiresAt: passEnd };
    if (this.config.openAll) {
      return {
        access: { kind: 'open', until: null, trialUsed },
        seats: Math.max(LIMITS.premiumPlayers, passSeats),
        pass,
      };
    }
    if (passEnd !== null)
      return { access: { kind: 'pass', until: passEnd, trialUsed }, seats: passSeats, pass };
    if (room.trialUntil !== null && room.trialUntil > now) {
      return {
        access: { kind: 'trial', until: room.trialUntil, trialUsed },
        seats: LIMITS.premiumPlayers,
        pass: null,
      };
    }
    return { access: { kind: 'free', until: null, trialUsed }, seats: this.opts.maxPlayers, pass: null };
  }

  /** Works the room's access and seats out again; true when anything the clients see changed. */
  private refreshAccess(room: Room): boolean {
    const next = this.accessOf(room, this.opts.now());
    // Never fewer seats than players already in (nobody is sent away).
    const maxPlayers = Math.max(this.opts.maxPlayers, next.seats, room.players.size);
    const a = room.access;
    const changed =
      maxPlayers !== room.maxPlayers ||
      a.kind !== next.access.kind ||
      a.until !== next.access.until ||
      a.trialUsed !== next.access.trialUsed ||
      (room.passInfo?.expiresAt ?? null) !== (next.pass?.expiresAt ?? null);
    room.maxPlayers = maxPlayers;
    room.access = next.access;
    room.passInfo = next.pass;
    return changed;
  }

  /** Recomputes and tells the screen and phones when it changed. */
  private updateAccess(room: Room): void {
    if (this.refreshAccess(room)) this.broadcastRoom(room);
  }

  private roomMsg(room: Room): ServerMsg {
    return { t: 'room', maxPlayers: room.maxPlayers, pass: room.passInfo, access: room.access };
  }

  private broadcastRoom(room: Room): void {
    const msg = this.roomMsg(room);
    room.screen?.send(msg);
    this.toControllers(room, msg);
    this.toMirrors(room, msg);
  }

  private fail(conn: Conn, code: ErrorCode, fatal: boolean, closeCode: number = CLOSE.badRequest): void {
    conn.send({ t: 'error', code, fatal });
    if (fatal) {
      this.bindings.delete(conn);
      conn.close(closeCode, code);
    }
  }
}
