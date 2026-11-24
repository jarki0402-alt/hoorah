/**
 * Long-distance play, direct link: the Host's main screen and each far-away main screen (usually
 * two cities in Indonesia) talk over WebRTC data channels instead of going through the server in
 * Oregon. The Host's screen offers one link per far-away screen through the server (`mirrorRtc`,
 * complete SDP, no trickle ICE, STUN on our own server). While a link is open, packets for that
 * screen go over it; when it is not open, congested or dead they take the relay at once, and the
 * link is tried again later with backoff.
 *
 * Two channels per link:
 *  - `ms` ordered, reliable: shell state and sounds, plus heartbeats both ways (round trip).
 *  - `mg` unordered, no retransmits: the game state (latest wins, the far-away screen drops older
 *         ones by packet number, see PacketOrder).
 */
import type { RtcSignal, ServerMsg } from '@hoorah/protocol';
import type { Net } from '../shared/net';
import {
  DEAD_MS,
  HEARTBEAT_MS,
  ICE_GATHER_MS,
  iceServers,
  OPEN_TIMEOUT_MS,
  RETRY_MS,
  rtcSupported,
  waitForIce,
} from '../shared/rtc';
import { beatText, type FarPath, type MirrorPacket, parseBeat, smoothRtt, splitForLink } from './mirror';

export const CH_SHELL = 'ms';
export const CH_GAME = 'mg';

/** Set-up crosses the server twice and both sides gather candidates: more time than on one Wi-Fi. */
const FAR_OPEN_TIMEOUT_MS = 2 * ICE_GATHER_MS + OPEN_TIMEOUT_MS + 1000;
/** Queued beyond this, a channel counts as congested and the packet takes the relay instead. */
const SHELL_BUFFER_MAX = 256 * 1024;
const GAME_BUFFER_MAX = 64 * 1024;

const NO_PATH: FarPath = { direct: 0, total: 0, rtt: null };

/** Heartbeat state of one open link (either side). */
interface Beating {
  seenAt: number;
  rtt: number | null;
}

/**
 * A heartbeat text arrived on the ordered channel: answers a ping, measures the round trip from a
 * pong. Returns true when the text was a heartbeat.
 */
function onBeat(text: string, link: Beating, reply: (t: string) => void): boolean {
  const beat = parseBeat(text);
  if (!beat) return false;
  if (beat.kind === 'ping') reply(beatText('pong', beat.stamp));
  else link.rtt = smoothRtt(link.rtt, performance.now() - beat.stamp);
  return true;
}

function closePc(pc: RTCPeerConnection | null): void {
  try {
    pc?.close();
  } catch {
    // Already closed.
  }
}

/* ------------------------------------------------------------------ Host's main screen */

interface Peer extends Beating {
  gen: number;
  pc: RTCPeerConnection;
  shell: RTCDataChannel;
  game: RTCDataChannel;
  open: boolean;
  timer: number;
}

/**
 * Host's main screen: one link per far-away screen (by the id the server gave its connection).
 * `onPath` hears every change of how they are reached; `linksChanged` is true when a link opened
 * or closed (the caller then sends the whole shell state again, whichever path it takes now).
 */
export class FarLinks {
  private readonly peers = new Map<number, Peer>();
  private readonly failures = new Map<number, number>();
  private readonly retryTimers = new Map<number, number>();
  private wanted: number[] = [];
  private gen = 0;
  private readonly enabled = rtcSupported();

  constructor(
    private readonly net: Net,
    private readonly onPath: (path: FarPath, linksChanged: boolean) => void,
  ) {
    if (!this.enabled) return;
    net.on('message', (m) => this.onMessage(m));
    net.on('status', (s) => {
      // The relay is the signalling path: links still being set up through it are retried later.
      // Open links keep carrying packets while the socket reconnects.
      if (s !== 'open') for (const [id, p] of [...this.peers]) if (!p.open) this.close(id);
    });
    window.setInterval(() => this.heartbeat(), HEARTBEAT_MS);
  }

  /** The far-away screens watching now (from `welcome` and `mirrors`). */
  sync(ids: readonly number[]): void {
    if (!this.enabled) return;
    this.wanted = [...ids];
    for (const id of [...this.peers.keys()]) if (!ids.includes(id)) this.close(id);
    for (const id of [...this.failures.keys()]) {
      if (ids.includes(id)) continue;
      this.failures.delete(id);
      window.clearTimeout(this.retryTimers.get(id));
      this.retryTimers.delete(id);
    }
    for (const id of ids) if (!this.peers.has(id) && !this.retryTimers.has(id)) void this.connect(id);
    this.report(false);
  }

  /**
   * Sends one packet over every open, uncongested link. Returns the far-away screens it reached;
   * the relay carries it to the others.
   */
  send(packet: MirrorPacket): number[] {
    const reached: number[] = [];
    if (this.peers.size === 0) return reached;
    const { shell, game } = splitForLink(packet);
    const shellText = shell ? JSON.stringify(shell) : null;
    const gameText = game ? JSON.stringify(game) : null;
    for (const [id, p] of this.peers) {
      if (!p.open || p.shell.readyState !== 'open' || p.game.readyState !== 'open') continue;
      if (shellText && p.shell.bufferedAmount > SHELL_BUFFER_MAX) continue;
      if (gameText && p.game.bufferedAmount > GAME_BUFFER_MAX) continue;
      try {
        if (shellText) p.shell.send(shellText);
        if (gameText) p.game.send(gameText);
        reached.push(id);
      } catch {
        this.fail(id);
      }
    }
    return reached;
  }

  path(): FarPath {
    if (this.wanted.length === 0) return NO_PATH;
    let direct = 0;
    let rtt: number | null = null;
    for (const id of this.wanted) {
      const p = this.peers.get(id);
      if (!p?.open) continue;
      direct++;
      if (p.rtt !== null) rtt = Math.max(rtt ?? 0, p.rtt);
    }
    return { direct, total: this.wanted.length, rtt: rtt === null ? null : Math.round(rtt) };
  }

  private report(linksChanged: boolean): void {
    this.onPath(this.path(), linksChanged);
  }

  private onMessage(m: ServerMsg): void {
    if (m.t !== 'mirrorRtc') return;
    const p = this.peers.get(m.from);
    if (!p || p.gen !== m.sig.gen) return;
    if (m.sig.k === 'answer') {
      p.pc.setRemoteDescription({ type: 'answer', sdp: m.sig.sdp }).catch(() => this.fail(m.from));
    } else if (m.sig.k === 'hangup') {
      this.fail(m.from);
    }
  }

  private async connect(id: number): Promise<void> {
    const gen = ++this.gen;
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    const shell = pc.createDataChannel(CH_SHELL, { ordered: true });
    const game = pc.createDataChannel(CH_GAME, { ordered: false, maxRetransmits: 0 });
    const peer: Peer = { gen, pc, shell, game, open: false, seenAt: 0, rtt: null, timer: 0 };
    this.peers.set(id, peer);
    const current = () => this.peers.get(id) === peer;

    const onOpen = () => {
      if (!current() || peer.open || shell.readyState !== 'open' || game.readyState !== 'open') return;
      peer.open = true;
      peer.seenAt = performance.now();
      window.clearTimeout(peer.timer);
      this.failures.delete(id);
      this.ping(peer);
      this.report(true);
    };
    shell.onopen = onOpen;
    game.onopen = onOpen;
    shell.onmessage = (e: MessageEvent) => {
      if (!current() || typeof e.data !== 'string') return;
      peer.seenAt = performance.now();
      const before = peer.rtt;
      if (onBeat(e.data, peer, (t) => this.sendBeat(peer, t)) && peer.rtt !== before) this.report(false);
    };
    const broken = () => {
      if (current()) this.fail(id);
    };
    shell.onclose = broken;
    game.onclose = broken;
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') broken();
    };
    peer.timer = window.setTimeout(() => {
      if (current() && !peer.open) this.fail(id);
    }, FAR_OPEN_TIMEOUT_MS);

    try {
      await pc.setLocalDescription(await pc.createOffer());
      await waitForIce(pc);
      const sdp = pc.localDescription?.sdp;
      if (!current()) return;
      if (!sdp) throw new Error('no local description');
      const offer: RtcSignal = { k: 'offer', gen, sdp };
      if (!this.net.send({ t: 'mirrorRtc', to: id, sig: offer })) this.fail(id);
    } catch {
      if (current()) this.fail(id);
    }
  }

  private heartbeat(): void {
    const now = performance.now();
    for (const [id, p] of [...this.peers]) {
      if (!p.open) continue;
      if (now - p.seenAt > DEAD_MS) this.fail(id);
      else this.ping(p);
    }
  }

  private ping(p: Peer): void {
    this.sendBeat(p, beatText('ping', performance.now()));
  }

  private sendBeat(p: Peer, text: string): void {
    try {
      if (p.shell.readyState === 'open') p.shell.send(text);
    } catch {
      // A broken channel is noticed by its close event or the missing heartbeat.
    }
  }

  /** Closes the link and tries again later (only while that far-away screen still watches). */
  private fail(id: number): void {
    const p = this.peers.get(id);
    if (p) {
      const hangup: RtcSignal = { k: 'hangup', gen: p.gen };
      this.net.send({ t: 'mirrorRtc', to: id, sig: hangup });
    }
    this.close(id);
    if (!this.wanted.includes(id)) return;
    const n = (this.failures.get(id) ?? 0) + 1;
    this.failures.set(id, n);
    window.clearTimeout(this.retryTimers.get(id));
    const delay = RETRY_MS[Math.min(n, RETRY_MS.length) - 1]!;
    this.retryTimers.set(
      id,
      window.setTimeout(() => {
        this.retryTimers.delete(id);
        if (this.wanted.includes(id) && !this.peers.has(id)) void this.connect(id);
      }, delay),
    );
  }

  private close(id: number): void {
    const p = this.peers.get(id);
    if (!p) return;
    this.peers.delete(id);
    window.clearTimeout(p.timer);
    p.shell.onclose = null;
    p.game.onclose = null;
    closePc(p.pc);
    this.report(p.open);
  }
}

/* ------------------------------------------------------------------ far-away main screen */

/**
 * Far-away main screen: answers the Host's screen's offer and hands every packet that arrives
 * directly to `onPacket`, the same path the relay feeds. `onPath` hears whether the link is open
 * and its round trip.
 */
export class FarLink {
  private pc: RTCPeerConnection | null = null;
  private shell: RTCDataChannel | null = null;
  private game: RTCDataChannel | null = null;
  private gen = -1;
  private readonly beat: Beating = { seenAt: 0, rtt: null };
  private wasOpen = false;

  constructor(
    private readonly net: Net,
    private readonly onPacket: (data: unknown) => void,
    private readonly onPath: (path: FarPath) => void,
  ) {
    net.on('message', (m) => {
      if (m.t === 'mirrorRtc' && m.from === 0) void this.onSignal(m.sig);
    });
    // A far-away screen that stopped following (link ended) drops its direct link too.
    net.on('status', (s) => {
      if (s === 'closed') this.close();
    });
    if (rtcSupported()) window.setInterval(() => this.heartbeat(), HEARTBEAT_MS);
  }

  private isOpen(): boolean {
    return this.shell?.readyState === 'open' && this.game?.readyState === 'open';
  }

  private async onSignal(sig: RtcSignal): Promise<void> {
    if (sig.k === 'hangup') {
      if (sig.gen === this.gen) this.close();
      return;
    }
    if (sig.k !== 'offer') return;
    // A new offer replaces any link (also one from the Host's screen before it reloaded).
    this.close();
    this.gen = sig.gen;
    if (!rtcSupported()) {
      this.hangup(sig.gen);
      return;
    }
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    this.pc = pc;
    pc.ondatachannel = (e) => {
      if (this.pc !== pc) return;
      const ch = e.channel;
      if (ch.label === CH_SHELL) this.shell = ch;
      else if (ch.label === CH_GAME) this.game = ch;
      else return;
      ch.onmessage = (m: MessageEvent) => {
        if (this.pc !== pc || typeof m.data !== 'string') return;
        this.beat.seenAt = performance.now();
        if (ch.label === CH_SHELL && onBeat(m.data, this.beat, (t) => this.sendBeat(t))) {
          this.mark();
          return;
        }
        let data: unknown;
        try {
          data = JSON.parse(m.data);
        } catch {
          return;
        }
        this.onPacket(data);
      };
      ch.onopen = () => {
        if (this.pc !== pc) return;
        this.beat.seenAt = performance.now();
        this.mark();
      };
      ch.onclose = () => {
        if (this.pc === pc) this.close();
      };
    };
    pc.onconnectionstatechange = () => {
      if (this.pc === pc && pc.connectionState === 'failed') this.close();
    };
    try {
      await pc.setRemoteDescription({ type: 'offer', sdp: sig.sdp });
      await pc.setLocalDescription(await pc.createAnswer());
      await waitForIce(pc);
      const sdp = pc.localDescription?.sdp;
      if (this.pc !== pc) return;
      if (!sdp) throw new Error('no local description');
      this.net.send({ t: 'mirrorRtc', sig: { k: 'answer', gen: sig.gen, sdp } });
    } catch {
      if (this.pc === pc) {
        this.close();
        this.hangup(sig.gen);
      }
    }
  }

  /** Pings the Host's screen; no sign of it for a while: drop the link, it offers a new one. */
  private heartbeat(): void {
    if (!this.isOpen()) return;
    if (performance.now() - this.beat.seenAt > DEAD_MS) {
      const gen = this.gen;
      this.close();
      this.hangup(gen);
      return;
    }
    this.sendBeat(beatText('ping', performance.now()));
  }

  private sendBeat(text: string): void {
    try {
      if (this.shell?.readyState === 'open') this.shell.send(text);
    } catch {
      // Noticed by the close event or the missing heartbeat.
    }
  }

  private hangup(gen: number): void {
    this.net.send({ t: 'mirrorRtc', sig: { k: 'hangup', gen } });
  }

  private close(): void {
    const pc = this.pc;
    this.pc = null;
    this.shell = null;
    this.game = null;
    this.beat.rtt = null;
    closePc(pc);
    this.mark();
  }

  private mark(): void {
    const open = this.isOpen();
    if (!open && !this.wasOpen) return;
    this.wasOpen = open;
    const rtt = this.beat.rtt;
    this.onPath({ direct: open ? 1 : 0, total: 1, rtt: open && rtt !== null ? Math.round(rtt) : null });
  }
}
