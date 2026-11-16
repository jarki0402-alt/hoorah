/**
 * Shared bits of the direct link between the main screen and each phone (WebRTC data channels on
 * the same Wi-Fi). The server relay only carries the set-up (`r` channel) and stays the fallback.
 *
 * Per phone there are two channels:
 *  - `in`  unordered, no retransmits: binary input frames (held buttons repeat, taps are counted,
 *          the stick repeats), so a lost frame heals itself and never waits behind another.
 *  - `ctl` ordered, reliable: numbered relay messages (views, actions, platform) and heartbeats.
 */

export const CH_INPUT = 'in';
export const CH_CONTROL = 'ctl';

/** Heartbeat texts on `ctl`; numbered relay messages are JSON objects, so they never collide. */
export const PING = '1';
export const PONG = '2';

export const HEARTBEAT_MS = 1000;
/** No heartbeat for this long: the link is treated as broken and traffic returns to the relay. */
export const DEAD_MS = 3500;
/** Longest wait for ICE candidates before the description is sent anyway (non-trickle). */
export const ICE_GATHER_MS = 1500;
/** A link that is not open this long after the offer counts as failed (PRD 5.2: 3 s). */
export const OPEN_TIMEOUT_MS = 3000;
/** Wait before trying again after the 1st, 2nd, ... failure. */
export const RETRY_MS = [2000, 5000, 15000, 30000, 60000] as const;

export function rtcSupported(): boolean {
  return typeof RTCPeerConnection === 'function';
}

/**
 * The server's STUN port. 3478 everywhere except the laptop's Docker stack, which builds with
 * VITE_STUN_PORT=3479 so it can run next to `npm run dev` and the e2e server without both
 * answering on one port.
 */
function stunPort(): number {
  const raw = import.meta.env.VITE_STUN_PORT as string | undefined;
  const port = raw && /^\d{1,5}$/.test(raw) ? Number(raw) : 0;
  return port > 0 && port < 65536 ? port : 3478;
}

/**
 * STUN servers: the Hoorah server's own responder on the host serving this page (no third
 * party). `VITE_RTC_ICE` overrides it with a comma-separated list, or "none" for host
 * candidates only.
 */
export function iceServers(): RTCIceServer[] {
  const raw = import.meta.env.VITE_RTC_ICE as string | undefined;
  if (raw === 'none') return [];
  const urls = raw
    ? raw
        .split(',')
        .map((u) => u.trim())
        .filter(Boolean)
    : [`stun:${location.hostname}:${stunPort()}`];
  return urls.length ? [{ urls }] : [];
}

/** Resolves once ICE gathering is complete, or after `ms` with whatever was gathered. */
export function waitForIce(pc: RTCPeerConnection, ms = ICE_GATHER_MS): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      window.clearTimeout(timer);
      pc.removeEventListener('icegatheringstatechange', check);
      resolve();
    };
    const check = () => {
      if (pc.iceGatheringState === 'complete') done();
    };
    const timer = window.setTimeout(done, ms);
    pc.addEventListener('icegatheringstatechange', check);
  });
}

/** Sequence number of a phone's binary input frame (u16 at byte 1). */
export function frameSeq(buf: ArrayBuffer): number | null {
  if (buf.byteLength < 3) return null;
  return new DataView(buf).getUint16(1);
}

/** True when u16 counter `seq` comes after `last` (wrap-aware). */
export function isNewer(seq: number, last: number): boolean {
  const d = (seq - last) & 0xffff;
  return d !== 0 && d < 0x8000;
}

/** Debug only: which path the traffic takes, as attributes on <html> (invisible to players). */
export function markLink(attr: 'link' | 'direct', value: string): void {
  document.documentElement.dataset[attr] = value;
}
