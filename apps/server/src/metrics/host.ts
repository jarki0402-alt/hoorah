/**
 * Reads the VM's numbers: memory from /proc/meminfo, the root disk, the kernel's boot id and the
 * network card's byte counters from the host's /sys (mounted read-only into the container at
 * HOST_SYS_PATH, default /host/sys). In a container these all describe the host, since the kernel is
 * shared. Anything missing (macOS, `npm run dev`, no mount) gives a fallback or null, never an error.
 */
import { readdir, readFile, statfs } from 'node:fs/promises';
import os from 'node:os';

export interface MemInfo {
  totalBytes: number;
  availableBytes: number;
  swapTotalBytes: number;
  swapUsedBytes: number;
  /** False when Node's own numbers stood in for /proc/meminfo. */
  fromProc: boolean;
}

/** Parses /proc/meminfo (values in kB); null when the essential lines are missing. */
export function parseMemInfo(text: string): Omit<MemInfo, 'fromProc'> | null {
  const kb = (name: string): number | null => {
    const m = new RegExp(`^${name}:\\s+(\\d+)`, 'm').exec(text);
    return m?.[1] ? Number(m[1]) * 1024 : null;
  };
  const total = kb('MemTotal');
  const available = kb('MemAvailable');
  if (total === null || available === null) return null;
  const swapTotal = kb('SwapTotal') ?? 0;
  const swapFree = kb('SwapFree') ?? swapTotal;
  return {
    totalBytes: total,
    availableBytes: available,
    swapTotalBytes: swapTotal,
    swapUsedBytes: Math.max(0, swapTotal - swapFree),
  };
}

export async function readMemInfo(): Promise<MemInfo> {
  const text = await readFile('/proc/meminfo', 'utf8').catch(() => '');
  const parsed = text ? parseMemInfo(text) : null;
  if (parsed) return { ...parsed, fromProc: true };
  return {
    totalBytes: os.totalmem(),
    availableBytes: os.freemem(),
    swapTotalBytes: 0,
    swapUsedBytes: 0,
    fromProc: false,
  };
}

export async function readDisk(path = '/'): Promise<{ totalBytes: number; freeBytes: number } | null> {
  try {
    const s = await statfs(path);
    // `bavail`: what the server may still write (blocks reserved for root count as used).
    return { totalBytes: s.blocks * s.bsize, freeBytes: s.bavail * s.bsize };
  } catch {
    return null;
  }
}

/** Changes when the VM reboots (counters restart from 0); a container restart keeps it. */
export async function readBootId(): Promise<string> {
  const id = (await readFile('/proc/sys/kernel/random/boot_id', 'utf8').catch(() => '')).trim();
  return id || 'unknown';
}

/** Loopback, Docker's bridges and container ends never reach the internet. */
export const SKIP_IFACE = /^(lo|docker\d*|br-.*|veth.*|virbr.*)$/;

export interface NetCounters {
  iface: string;
  tx: number;
  rx: number;
}

/** `wanted` (NET_IFACE) when given, otherwise the busiest card that is not skipped. */
export function pickInterface(readings: readonly NetCounters[], wanted?: string): NetCounters | null {
  let best: NetCounters | null = null;
  for (const r of readings) {
    if (wanted ? r.iface !== wanted : SKIP_IFACE.test(r.iface)) continue;
    if (!best || r.tx + r.rx > best.tx + best.rx) best = r;
  }
  return best;
}

async function readCounter(
  hostSys: string,
  iface: string,
  name: 'tx_bytes' | 'rx_bytes',
): Promise<number | null> {
  const raw = (
    await readFile(`${hostSys}/class/net/${iface}/statistics/${name}`, 'utf8').catch(() => '')
  ).trim();
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

/** The internet-facing card's counters; null when the host's /sys is not there. */
export async function readNetCounters(hostSys: string, wanted?: string): Promise<NetCounters | null> {
  const names = wanted ? [wanted] : await readdir(`${hostSys}/class/net`).catch(() => [] as string[]);
  const readings: NetCounters[] = [];
  for (const iface of names) {
    if (!/^[\w.-]{1,32}$/.test(iface)) continue;
    const [tx, rx] = await Promise.all([
      readCounter(hostSys, iface, 'tx_bytes'),
      readCounter(hostSys, iface, 'rx_bytes'),
    ]);
    if (tx !== null && rx !== null) readings.push({ iface, tx, rx });
  }
  return pickInterface(readings, wanted);
}
