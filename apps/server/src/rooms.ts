import {
  type AdminRoom,
  type Channel,
  CLOSE,
  type ClientMsg,
  type ErrorCode,
  type Fruit,
  generateRoomCode,
  isRoomCode,
  LIMITS,
  type NearbyRoom,
  type PassReject,
  PLAYER_COLORS,
  type PlayerInfo,
  PROTOCOL_VERSION,
  type RoomPass,
  type ServerMsg,
  stampInput,
} from '@hoorah/protocol';
import type { Logger } from './log';
import { networkKey } from './network';
import type { PassLookup, PassRecord } from './passes';

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
  /** Hoorah Pass opening this room's seats (a copy, refreshed when the admin changes it). */
  pass: PassRecord | null;
  /** Page and game on the main screen as it reports them (`status`); for the dashboard only. */
  page: string | null;
  gameId: string | null;
  /** Phones linked to the screen over WebRTC, as the screen last reported (dashboard only). */
  direct: number;
  /** Most seats taken at once, for the usage numbers when the room closes. */
  peakPlayers: number;
}

/** Wrong room codes one address may try per minute before joining is refused for a while. */
const JOIN_FAILS_PER_MINUTE = 20;
/** Wrong pass codes one address may try per minute. */
const PASS_FAILS_PER_MINUTE = 10;
/** Screens idle longer than this are not offered as "nearby". */
const NEARBY_FRESH_MS = 30 * 60_000;

type Binding = { room: Room; role: 'screen' } | { room: Room; role: 'controller'; id: number };

export interface RoomSnapshot {
  code: string;
  screenToken: string;
  hostId: number | null;
  nextId: number;
  maxPlayers: number;
  createdAt: number;
  players: { id: number; name: string; fruit: Fruit; color: string; token: string; joinedAt: number }[];
  /** Pass the room was using; checked again on restore. */
  passId?: number | null;
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
  events?: RoomEvents;
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly bindings = new Map<Conn, Binding>();
  private readonly roomCreations = new Map<string, number[]>();
  private readonly joinFailures = new Map<string, number[]>();
  private readonly passFailures = new Map<string, number[]>();

  constructor(private readonly opts: RoomManagerOptions) {}

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
      if (msg.role === 'screen') this.helloScreen(conn, msg.resume);
      else this.helloController(conn, msg.code, msg.name, msg.fruit, msg.token, msg.pass);
      return;
    }

    const b = this.bindings.get(conn);
    if (!b) {
      this.fail(conn, 'bad_request', true);
      return;
    }
    const room = b.room;
    room.lastActivity = this.opts.now();

    switch (msg.t) {
      case 'ping':
        conn.send({ t: 'pong', id: msg.id, ct: msg.ct, st: this.opts.now() });
        return;
      case 'relay':
        this.relay(b, msg.ch, msg.to, msg.data);
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
        const found = this.checkPass(conn, room, msg.code);
        if (typeof found === 'string') {
          conn.send({ t: 'pass', ok: false, reason: found });
          return;
        }
        this.applyPass(room, found);
        conn.send({ t: 'pass', ok: true, pass: this.roomPass(room) ?? { expiresAt: found.expiresAt } });
        return;
      }
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
    if (b.role === 'screen') {
      if (room.screen !== conn) return;
      room.screen = null;
      room.screenGoneAt = now;
      room.direct = 0;
      this.toControllers(room, { t: 'screen', online: false });
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
      if (room.pass && room.pass.expiresAt <= now) this.dropPass(room, 'expired');
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
    }
    for (const map of [this.roomCreations, this.joinFailures, this.passFailures]) {
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
          .map((p) => ({ name: p.name, fruit: p.fruit, color: p.color })),
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
      players: [...r.players.values()].map(({ id, name, fruit, color, token, joinedAt }) => ({
        id,
        name,
        fruit,
        color,
        token,
        joinedAt,
      })),
      passId: r.pass?.id ?? null,
    }));
  }

  /** Restored rooms wait for their screen and players to reconnect with their tokens. */
  restore(snaps: RoomSnapshot[]): void {
    const now = this.opts.now();
    for (const s of snaps) {
      // Rooms from an older code format can no longer be joined: let them go.
      if (this.rooms.has(s.code) || !isRoomCode(s.code)) continue;
      const players = new Map<number, Player>();
      for (const p of s.players) players.set(p.id, { ...p, conn: null, goneAt: now });
      // The pass may have ended or been revoked while the server was down.
      const stored = s.passId ? (this.opts.passes?.byId(s.passId) ?? null) : null;
      const pass = stored && stored.revokedAt === null && stored.expiresAt > now ? stored : null;
      this.rooms.set(s.code, {
        code: s.code,
        screenToken: s.screenToken,
        screen: null,
        screenGoneAt: now,
        players,
        hostId: s.hostId,
        nextId: s.nextId,
        maxPlayers: pass
          ? Math.max(this.opts.maxPlayers, pass.maxPlayers, players.size)
          : s.passId
            ? Math.max(this.opts.maxPlayers, players.size)
            : s.maxPlayers,
        createdAt: s.createdAt,
        lastActivity: now,
        screenNet: '',
        pass,
        page: null,
        gameId: null,
        direct: 0,
        peakPlayers: players.size,
      });
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
    for (const room of this.rooms.values()) {
      if (room.pass?.id !== passId) continue;
      if (!fresh || fresh.revokedAt !== null || fresh.expiresAt <= now) {
        this.dropPass(room, fresh ? 'revoked' : 'deleted');
        continue;
      }
      room.pass = fresh;
      room.maxPlayers = Math.max(this.opts.maxPlayers, fresh.maxPlayers, room.players.size);
      this.broadcastRoom(room);
    }
  }

  /** Rooms using each pass right now. */
  passLiveCounts(): Map<number, number> {
    const counts = new Map<number, number>();
    for (const r of this.rooms.values()) if (r.pass) counts.set(r.pass.id, (counts.get(r.pass.id) ?? 0) + 1);
    return counts;
  }

  /** Every room, most recently active first. */
  adminRooms(): AdminRoom[] {
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
        pass: r.pass ? { id: r.pass.id, code: r.pass.code, expiresAt: r.pass.expiresAt } : null,
        createdAt: r.createdAt,
        lastActivity: r.lastActivity,
      }));
  }

  /* ------------------------------------------------------------------ internals */

  private helloScreen(conn: Conn, resume?: { code: string; token: string }): void {
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
      this.bindings.set(conn, { room: existing, role: 'screen' });
      conn.send({
        t: 'welcome',
        role: 'screen',
        code: existing.code,
        token: existing.screenToken,
        players: this.playerList(existing),
        maxPlayers: existing.maxPlayers,
        pass: this.roomPass(existing),
        resumed: true,
      });
      this.toControllers(existing, { t: 'screen', online: true });
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
      page: null,
      gameId: null,
      direct: 0,
      peakPlayers: 0,
    };
    this.rooms.set(code, room);
    this.bindings.set(conn, { room, role: 'screen' });
    conn.send({
      t: 'welcome',
      role: 'screen',
      code,
      token: room.screenToken,
      players: [],
      maxPlayers: room.maxPlayers,
      pass: null,
      resumed: false,
    });
    this.emit((e) => e.roomCreated(now));
    this.opts.log.info('room_created', { code });
  }

  private helloController(
    conn: Conn,
    code: string,
    name: string,
    fruit: Fruit,
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
      known.fruit = fruit;
      if (room.hostId === null) room.hostId = known.id;
      this.bindings.set(conn, { room, role: 'controller', id: known.id });
      this.welcomeController(conn, room, known, true);
      this.broadcastPlayers(room);
      return;
    }

    // A pass the phone remembers (or just typed on the "room full" page) opens the seats first.
    let passRejected: PassReject | null = null;
    if (passCode && room.pass?.code !== passCode) {
      const found = this.checkPass(conn, room, passCode);
      if (typeof found === 'string') passRejected = found;
      else this.applyPass(room, found);
    }
    if (room.players.size >= room.maxPlayers) {
      const code: ErrorCode =
        passRejected === 'invalid'
          ? 'pass_invalid'
          : passRejected === 'expired'
            ? 'pass_expired'
            : passRejected === 'busy'
              ? 'pass_busy'
              : passRejected === 'rate_limited'
                ? 'rate_limited'
                : 'room_full';
      this.fail(conn, code, true);
      return;
    }
    const id = this.nextFreeId(room);
    if (id === null) {
      this.fail(conn, 'room_full', true);
      return;
    }
    const used = new Set([...room.players.values()].map((p) => p.color));
    const color = PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[(id - 1) % PLAYER_COLORS.length]!;
    const player: Player = {
      id,
      name,
      fruit,
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

  private welcomeController(conn: Conn, room: Room, p: Player, resumed: boolean): void {
    conn.send({
      t: 'welcome',
      role: 'controller',
      code: room.code,
      id: p.id,
      token: p.token,
      players: this.playerList(room),
      maxPlayers: room.maxPlayers,
      pass: this.roomPass(room),
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

  private relay(b: Binding, ch: Channel, to: number | 'all' | 'screen', data: unknown): void {
    const room = b.room;
    if (b.role === 'controller') {
      // Controllers only talk to the screen; the screen decides what others see.
      if (to !== 'screen' || !room.screen) return;
      room.screen.send({ t: 'relay', ch, from: b.id, data });
      return;
    }
    if (to === 'screen') return;
    const msg: ServerMsg = { t: 'relay', ch, from: 0, data };
    if (to === 'all') this.toControllers(room, msg);
    else room.players.get(to)?.conn?.send(msg);
  }

  private canManage(b: Binding): boolean {
    return b.role === 'screen' || b.room.hostId === b.id;
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
        color: p.color,
        connected: p.conn !== null,
        isHost: room.hostId === p.id,
      }));
  }

  private broadcastPlayers(room: Room): void {
    const msg: ServerMsg = { t: 'players', players: this.playerList(room) };
    room.screen?.send(msg);
    this.toControllers(room, msg);
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
    if (found.expiresAt <= now) return 'expired';
    if (found.maxRooms !== null) {
      let using = 0;
      for (const r of this.rooms.values()) if (r !== room && r.pass?.id === found.id) using++;
      if (using >= found.maxRooms) return 'busy';
    }
    return found;
  }

  /** Opens the room's seats with `pass` (a room keeps whichever pass gives it more). */
  private applyPass(room: Room, pass: PassRecord): void {
    const cur = room.pass;
    if (cur && cur.id !== pass.id && cur.maxPlayers >= pass.maxPlayers && cur.expiresAt >= pass.expiresAt) {
      return;
    }
    if (cur?.id !== pass.id) this.emit((e) => e.passActivated(this.opts.now()));
    room.pass = pass;
    room.maxPlayers = Math.max(this.opts.maxPlayers, pass.maxPlayers, room.players.size);
    this.notePassUse(room);
    this.broadcastRoom(room);
    this.opts.log.info('pass_applied', { code: room.code, passId: pass.id, maxPlayers: room.maxPlayers });
  }

  /** The pass ended: nobody is sent away, but no seats beyond those taken open up again. */
  private dropPass(room: Room, reason: 'expired' | 'revoked' | 'deleted'): void {
    if (!room.pass) return;
    const passId = room.pass.id;
    room.pass = null;
    room.maxPlayers = Math.max(this.opts.maxPlayers, room.players.size);
    this.broadcastRoom(room);
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

  private roomPass(room: Room): RoomPass | null {
    return room.pass ? { expiresAt: room.pass.expiresAt } : null;
  }

  private broadcastRoom(room: Room): void {
    const msg: ServerMsg = { t: 'room', maxPlayers: room.maxPlayers, pass: this.roomPass(room) };
    room.screen?.send(msg);
    this.toControllers(room, msg);
  }

  private fail(conn: Conn, code: ErrorCode, fatal: boolean, closeCode: number = CLOSE.badRequest): void {
    conn.send({ t: 'error', code, fatal });
    if (fatal) {
      this.bindings.delete(conn);
      conn.close(closeCode, code);
    }
  }
}
