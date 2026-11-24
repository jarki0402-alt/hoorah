import { LIMITS } from '@hoorah/protocol';

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  host: process.env.HOST ?? '0.0.0.0',
  port: intEnv('PORT', 8790),
  /** Players per room. Free tier is 2; raise it locally with MAX_PLAYERS=8 to test bigger parties. */
  maxPlayers: Math.min(LIMITS.maxPlayers, Math.max(1, intEnv('MAX_PLAYERS', LIMITS.freePlayers))),
  snapshotFile: process.env.SNAPSHOT_FILE ?? 'data/rooms.json',
  /** SQLite file for admins and Hoorah Pass codes (':memory:' for throwaway test servers). */
  dbFile: process.env.DB_FILE ?? 'data/hoorah.db',
  /** First start only: creates this admin when there is none yet (later changes: the admin CLI). */
  adminUsername: process.env.ADMIN_USERNAME ?? '',
  adminPassword: process.env.ADMIN_PASSWORD ?? '',
  roomsPerIpPerMinute: intEnv('ROOMS_PER_IP_PER_MINUTE', 10),
  logLevel: (process.env.LOG_LEVEL ?? 'info') as 'debug' | 'info' | 'warn' | 'error',
  /** UDP port of the built-in STUN responder (WebRTC on the same Wi-Fi); 0 turns it off. */
  stunPort: intEnv('STUN_PORT', 3478),
  /** Host's /sys mounted read-only into the container: the VM's network card counters (egress). */
  hostSysPath: process.env.HOST_SYS_PATH || '/host/sys',
  /** Network card to measure; empty picks the busiest one that is not loopback or Docker's. */
  netIface: process.env.NET_IFACE || undefined,
  /**
   * "Mode uji coba: semua terbuka" until the owner saves settings in the dashboard (OPEN_ALL=1):
   * test servers (e2e) and a fresh trial install start with everything open.
   */
  openAllDefault: process.env.OPEN_ALL === '1',
  /** Testing only: delay every client message by this many ms to mimic a far-away server. */
  relayDelayMs: Math.max(0, intEnv('RELAY_DELAY_MS', 0)),
};
