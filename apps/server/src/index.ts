import type * as UWS from 'uWebSockets.js';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { DEFAULT_CONFIG, generateMirrorKey, LIMITS, parseClientMsg, type ServerMsg } from '@hoorah/protocol';
import { BAD_JSON, readJson, registerAdminApi, TOO_LARGE } from './admin/api';
import { AdminAuth } from './admin/auth';
import { runAdminCli } from './admin/cli';
import { AdminService } from './admin/service';
import { config } from './config';
import { openDb } from './db';
import { IpLimiter } from './limiter';
import { log } from './log';
import { EgressStore } from './metrics/egress';
import { loadCloudflareSeen, Monitor } from './metrics/monitor';
import { SampleStore } from './metrics/samples';
import { SecurityLog } from './metrics/security';
import { ByteMeter, CloudflareWatch, wsFrameBytes } from './metrics/traffic';
import { UsageStore } from './metrics/usage';
import { PassRepository } from './passes';
import { ErrorRepository, FeedbackIntake, type IntakeStatus, ReportRepository } from './reports';
import { type Conn, type RoomEvents, RoomManager, type RoomSnapshot } from './rooms';
import { SettingsRepository } from './settings';
import { startStun } from './stun';
import { TrialRepository } from './trials';

// uWebSockets.js v20.71 ships a broken ESM wrapper (it imports a missing index.js); the CJS entry works.
const uWS = createRequire(import.meta.url)('uWebSockets.js') as typeof UWS;

interface SocketData {
  ip: string;
  conn?: SocketConn;
}

/** Bytes the relay sends over WebSockets (dashboard: live rate and the 5-minute samples). */
const relayOut = new ByteMeter();

/** Wraps a uWS socket; guards against sends after close and slow consumers. */
class SocketConn implements Conn {
  closed = false;
  private windowStart = Date.now();
  private count = 0;
  private overSince = 0;

  constructor(
    private readonly ws: UWS.WebSocket<SocketData>,
    readonly ip: string,
  ) {}

  send(msg: ServerMsg): void {
    if (this.closed) return;
    if (this.ws.getBufferedAmount() > 1 << 20) return;
    const text = JSON.stringify(msg);
    this.ws.send(text, false);
    relayOut.add(wsFrameBytes(Buffer.byteLength(text)));
  }

  sendBinary(bytes: Uint8Array): void {
    if (this.closed) return;
    if (this.ws.getBufferedAmount() > 1 << 20) return;
    this.ws.send(bytes, true);
    relayOut.add(wsFrameBytes(bytes.byteLength));
  }

  close(code: number, reason: string): void {
    if (this.closed) return;
    this.closed = true;
    this.ws.end(code, reason);
  }

  /** Simple per-second window. Returns false when the message should be dropped. */
  allow(now: number): boolean {
    if (now - this.windowStart >= 1000) {
      this.windowStart = now;
      if (this.count <= LIMITS.messagesPerSecond) this.overSince = 0;
      this.count = 0;
    }
    this.count++;
    if (this.count <= LIMITS.messagesPerSecond) return true;
    if (!this.overSince) this.overSince = now;
    if (now - this.overSince > 3000) this.close(4006, 'rate_limited');
    return false;
  }
}

const startedAt = Date.now();
const db = openDb(config.dbFile);
const auth = new AdminAuth(db);

// `node server.js admin ...`: manage admin users, then exit without starting the server.
if (process.argv[2] === 'admin') {
  const code = await runAdminCli(process.argv.slice(3), auth);
  db.close();
  process.exit(code);
}

if (config.adminUsername && config.adminPassword && auth.count() === 0) {
  try {
    await auth.setUser(config.adminUsername, config.adminPassword, Date.now());
    log.info('admin_seeded', { username: config.adminUsername });
  } catch (err) {
    log.error('admin_seed_failed', { err: String(err) });
  }
}

const passes = new PassRepository(db);
const settings = new SettingsRepository(db, { ...DEFAULT_CONFIG, openAll: config.openAllDefault });
const reports = new ReportRepository(db);
const deviceErrors = new ErrorRepository(db);
const intake = new FeedbackIntake(reports, deviceErrors);
const usage = new UsageStore(db);
const security = new SecurityLog(db);
const cloudflare = new CloudflareWatch(loadCloudflareSeen(db));
const roomEvents: RoomEvents = {
  roomCreated: (at) => usage.roomCreated(at),
  gameStarted: (gameId, players, at) => usage.gameStarted(gameId, players, at),
  roomClosed: (lifetimeMs, peakPlayers, at) => usage.roomClosed(lifetimeMs, peakPlayers, at),
  passActivated: (at) => usage.passActivated(at),
  passRejected: (ip, reason, at) =>
    security.record(reason === 'rate_limited' ? 'pass_limited' : 'pass_wrong', ip, at),
};
const manager = new RoomManager({
  now: () => Date.now(),
  random: Math.random,
  token: () => randomBytes(18).toString('base64url'),
  // The far-away main screen link is a secret: crypto, not Math.random.
  mirrorKey: () => generateMirrorKey(() => randomBytes(4).readUInt32BE(0) / 2 ** 32),
  maxPlayers: config.maxPlayers,
  roomsPerIpPerMinute: config.roomsPerIpPerMinute,
  log,
  passes,
  trials: new TrialRepository(db),
  config: settings.config(),
  events: roomEvents,
});
const monitor = new Monitor({
  db,
  dbFile: config.dbFile,
  rooms: manager,
  relay: relayOut,
  cloudflare,
  samples: new SampleStore(db),
  egress: new EgressStore(db),
  usage,
  security,
  hostSys: config.hostSysPath,
  netIface: config.netIface,
  startedAt,
  now: () => Date.now(),
  log,
});
const adminService = new AdminService({
  passes,
  rooms: manager,
  now: () => Date.now(),
  random: Math.random,
  dbFile: config.dbFile,
  startedAt,
  monitor,
  usage,
  security,
  settings,
  reports,
  errors: deviceErrors,
});

async function loadSnapshot(): Promise<void> {
  try {
    const raw = await readFile(config.snapshotFile, 'utf8');
    const snaps = JSON.parse(raw) as RoomSnapshot[];
    manager.restore(snaps);
    log.info('snapshot_restored', { rooms: snaps.length });
  } catch {
    // No snapshot yet: fresh start.
  }
}

async function saveSnapshot(): Promise<void> {
  const snaps = manager.snapshot();
  await mkdir(dirname(config.snapshotFile), { recursive: true });
  await writeFile(config.snapshotFile, JSON.stringify(snaps));
  log.info('snapshot_saved', { rooms: snaps.length });
}

const decoder = new TextDecoder();
/** Phones ask for nearby screens every few seconds while on the code page. */
const nearbyLimiter = new IpLimiter(1);
/** Reports and device errors are small JSON bodies. */
const INTAKE_BODY_MAX = 8 * 1024;
const INTAKE_STATUS: Record<IntakeStatus | 413 | 415, string> = {
  204: '204 No Content',
  400: '400 Bad Request',
  413: '413 Payload Too Large',
  415: '415 Unsupported Media Type',
  429: '429 Too Many Requests',
};

/**
 * Public `POST` that devices use to send a report or an error: JSON only, size capped, rate limited
 * per address inside FeedbackIntake. Answers with an empty body.
 */
function intakeRoute(
  app: UWS.TemplatedApp,
  path: string,
  handle: (ip: string, body: unknown, now: number) => IntakeStatus,
): void {
  app.post(path, (res, req) => {
    let aborted = false;
    res.onAborted(() => {
      aborted = true;
    });
    cloudflare.note(req.getHeader('cf-ray') || req.getHeader('cf-connecting-ip'), Date.now());
    const forwarded = req.getHeader('x-forwarded-for').split(',')[0]?.trim();
    const ip = forwarded || decoder.decode(res.getRemoteAddressAsText());
    const json = req.getHeader('content-type').toLowerCase().startsWith('application/json');
    const reply = (status: keyof typeof INTAKE_STATUS) => {
      if (aborted) return;
      res.cork(() => {
        res.writeStatus(INTAKE_STATUS[status]);
        res.writeHeader('cache-control', 'no-store');
        res.end();
      });
    };
    if (!json) {
      reply(415);
      return;
    }
    // Attached before this handler returns, as uWS requires.
    void readJson(res, INTAKE_BODY_MAX).then((body) => {
      if (body === TOO_LARGE) reply(413);
      else if (body === BAD_JSON) reply(400);
      else {
        try {
          reply(handle(ip, body, Date.now()));
        } catch (err) {
          log.error('intake_failed', { path, err: String(err) });
          reply(400);
        }
      }
    });
  });
}

/**
 * Runs a client message now, or after RELAY_DELAY_MS when testing how the games feel behind a
 * distant server (order is kept because every message waits the same time).
 */
function later(fn: () => void): void {
  if (config.relayDelayMs > 0) setTimeout(fn, config.relayDelayMs);
  else fn();
}

const app = uWS
  .App()
  .ws<SocketData>('/ws', {
    compression: uWS.DISABLED,
    maxPayloadLength: LIMITS.messageBytes,
    idleTimeout: 32,
    sendPingsAutomatically: true,
    upgrade: (res, req, context) => {
      cloudflare.note(req.getHeader('cf-ray') || req.getHeader('cf-connecting-ip'), Date.now());
      const forwarded = req.getHeader('x-forwarded-for').split(',')[0]?.trim();
      const ip = forwarded || decoder.decode(res.getRemoteAddressAsText());
      res.upgrade<SocketData>(
        { ip },
        req.getHeader('sec-websocket-key'),
        req.getHeader('sec-websocket-protocol'),
        req.getHeader('sec-websocket-extensions'),
        context,
      );
    },
    open: (ws) => {
      const data = ws.getUserData();
      data.conn = new SocketConn(ws, data.ip);
    },
    message: (ws, message, isBinary) => {
      const conn = ws.getUserData().conn;
      if (!conn?.allow(Date.now())) return;
      if (isBinary) {
        // uWS reuses the buffer after this callback returns, so copy the bytes.
        const bytes = new Uint8Array(message.slice(0));
        later(() => {
          if (!conn.closed) manager.handleBinary(conn, bytes);
        });
        return;
      }
      const msg = parseClientMsg(decoder.decode(message));
      if (!msg) {
        conn.send({ t: 'error', code: 'bad_request', fatal: false });
        return;
      }
      later(() => {
        if (!conn.closed) manager.handleMessage(conn, msg);
      });
    },
    close: (ws) => {
      const conn = ws.getUserData().conn;
      if (!conn) return;
      conn.closed = true;
      manager.handleClose(conn);
    },
  })
  .get('/api/nearby', (res, req) => {
    cloudflare.note(req.getHeader('cf-ray') || req.getHeader('cf-connecting-ip'), Date.now());
    const forwarded = req.getHeader('x-forwarded-for').split(',')[0]?.trim();
    const ip = forwarded || decoder.decode(res.getRemoteAddressAsText());
    res.writeHeader('content-type', 'application/json');
    res.writeHeader('cache-control', 'no-store');
    if (!nearbyLimiter.allow(ip, Date.now())) {
      res.writeStatus('429 Too Many Requests').end('[]');
      return;
    }
    res.end(JSON.stringify(manager.nearby(ip)));
  })
  .get('/health', (res) => {
    res.writeHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true, rooms: manager.roomCount, sockets: manager.connectionCount }));
  });

intakeRoute(app, '/api/report', (ip, body, now) => intake.report(ip, body, now));
intakeRoute(app, '/api/errors', (ip, body, now) => intake.error(ip, body, now));

registerAdminApi(app, { auth, service: adminService, now: () => Date.now(), log, security, cloudflare });

app.any('/*', (res) => {
  res.writeStatus('404 Not Found').end('not found');
});

await loadSnapshot();
const ticker = setInterval(() => {
  manager.tick();
  relayOut.mark(Date.now());
}, 1000);
monitor.start();

app.listen(config.host, config.port, (token) => {
  if (!token) {
    log.error('listen_failed', { port: config.port });
    process.exit(1);
  }
  log.info('server_listening', {
    host: config.host,
    port: config.port,
    maxPlayers: config.maxPlayers,
    relayDelayMs: config.relayDelayMs,
  });
});

const stun = config.stunPort > 0 ? startStun(config.stunPort, log) : null;

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  log.info('shutting_down', { signal });
  clearInterval(ticker);
  stun?.close();
  monitor.stop();
  try {
    await saveSnapshot();
  } catch (err) {
    log.error('snapshot_failed', { err: String(err) });
  }
  db.close();
  app.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
