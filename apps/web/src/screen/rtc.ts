/**
 * Main screen side of the direct links: one RTCPeerConnection per connected phone, offered by the
 * screen through the relay's `r` channel. While a link is open, relay messages to that phone and
 * its input frames travel over it; otherwise everything keeps using the server relay. A broken
 * link falls back at once and is retried later with backoff.
 */
import { type PlayerInfo, parseRtcSignal, type RtcSignal, type ServerMsg } from '@hoorah/protocol';
import type { DirectPath, Net } from '../shared/net';
import {
  CH_CONTROL,
  CH_INPUT,
  DEAD_MS,
  frameSeq,
  HEARTBEAT_MS,
  ICE_GATHER_MS,
  iceServers,
  isNewer,
  markLink,
  OPEN_TIMEOUT_MS,
  PING,
  PONG,
  RETRY_MS,
  rtcSupported,
  waitForIce,
} from '../shared/rtc';

/** Relayed input from a player is stale while its direct frames arrived within this window. */
const DIRECT_INPUT_FRESH_MS = 600;

interface Peer {
  gen: number;
  pc: RTCPeerConnection;
  input: RTCDataChannel;
  ctl: RTCDataChannel;
  open: boolean;
  seenAt: number;
  inputAt: number;
  lastSeq: number | null;
  timer: number;
}

export class ScreenRtc implements DirectPath {
  private readonly peers = new Map<number, Peer>();
  private readonly failures = new Map<number, number>();
  private readonly retryTimers = new Map<number, number>();
  private wanted = new Set<number>();
  private gen = 0;
  private openCount = 0;

  /** `onDirectCount`: called with the number of open links whenever it changes (admin dashboard). */
  constructor(
    private readonly net: Net,
    private readonly onDirectCount: (open: number) => void = () => {},
  ) {
    if (!rtcSupported()) return;
    net.setDirect(this);
    net.on('message', (m) => this.onMessage(m));
    net.on('status', (s) => {
      // The relay is the signalling path: links set up through a dead socket are retried later.
      if (s !== 'open')
        for (const id of [...this.peers.keys()]) if (!this.peers.get(id)?.open) this.close(id);
    });
    window.setInterval(() => this.heartbeat(), HEARTBEAT_MS);
    markLink('direct', '0');
  }

  /* ---------------------------------------------------------------- DirectPath */

  sendText(to: number | 'screen', text: string): boolean {
    if (to === 'screen') return false;
    const p = this.peers.get(to);
    if (!p?.open || p.ctl.readyState !== 'open' || p.ctl.bufferedAmount > 256 * 1024) return false;
    try {
      p.ctl.send(text);
      return true;
    } catch {
      return false;
    }
  }

  sendBinary(): boolean {
    return false;
  }

  directInput(from: number): boolean {
    const p = this.peers.get(from);
    return Boolean(p?.open && performance.now() - p.inputAt < DIRECT_INPUT_FRESH_MS);
  }

  /* ---------------------------------------------------------------- lifecycle */

  private onMessage(m: ServerMsg): void {
    if (m.t === 'welcome' || m.t === 'players') this.sync(m.players);
    else if (m.t === 'relay' && m.ch === 'r') {
      const sig = parseRtcSignal(m.data);
      if (sig) this.onSignal(m.from, sig);
    }
  }

  private sync(players: PlayerInfo[]): void {
    this.wanted = new Set(players.filter((p) => p.connected).map((p) => p.id));
    for (const id of [...this.peers.keys()]) if (!this.wanted.has(id)) this.close(id);
    for (const id of [...this.failures.keys()]) {
      if (this.wanted.has(id)) continue;
      this.failures.delete(id);
      window.clearTimeout(this.retryTimers.get(id));
      this.retryTimers.delete(id);
    }
    for (const id of this.wanted) {
      if (!this.peers.has(id) && !this.retryTimers.has(id)) void this.connect(id);
    }
  }

  private async connect(id: number): Promise<void> {
    const gen = ++this.gen;
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    const input = pc.createDataChannel(CH_INPUT, { ordered: false, maxRetransmits: 0 });
    const ctl = pc.createDataChannel(CH_CONTROL, { ordered: true });
    input.binaryType = 'arraybuffer';
    const peer: Peer = { gen, pc, input, ctl, open: false, seenAt: 0, inputAt: 0, lastSeq: null, timer: 0 };
    this.peers.set(id, peer);
    const current = () => this.peers.get(id) === peer;

    const onOpen = () => {
      if (!current() || input.readyState !== 'open' || ctl.readyState !== 'open') return;
      peer.open = true;
      peer.seenAt = performance.now();
      window.clearTimeout(peer.timer);
      this.failures.delete(id);
      this.mark();
    };
    input.onopen = onOpen;
    ctl.onopen = onOpen;
    input.onmessage = (e: MessageEvent) => {
      if (!current() || !(e.data instanceof ArrayBuffer)) return;
      // Unordered channel: an older frame arriving late would rewind counters and held buttons.
      const seq = frameSeq(e.data);
      if (seq === null || (peer.lastSeq !== null && !isNewer(seq, peer.lastSeq))) return;
      peer.lastSeq = seq;
      peer.inputAt = peer.seenAt = performance.now();
      this.net.injectBinary(id, e.data);
    };
    ctl.onmessage = (e: MessageEvent) => {
      if (!current() || typeof e.data !== 'string') return;
      peer.seenAt = performance.now();
      if (e.data === PING) ctl.send(PONG);
      else if (e.data !== PONG) this.net.injectText(id, e.data);
    };
    const broken = () => {
      if (current()) this.fail(id);
    };
    input.onclose = broken;
    ctl.onclose = broken;
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') broken();
    };
    peer.timer = window.setTimeout(() => {
      if (current() && !peer.open) this.fail(id);
    }, ICE_GATHER_MS + OPEN_TIMEOUT_MS);

    try {
      await pc.setLocalDescription(await pc.createOffer());
      await waitForIce(pc);
      const sdp = pc.localDescription?.sdp;
      if (!current()) return;
      if (!sdp) throw new Error('no local description');
      const offer: RtcSignal = { k: 'offer', gen, sdp };
      if (!this.net.send({ t: 'relay', ch: 'r', to: id, data: offer })) this.fail(id);
    } catch {
      if (current()) this.fail(id);
    }
  }

  private onSignal(from: number, sig: RtcSignal): void {
    const p = this.peers.get(from);
    if (!p || p.gen !== sig.gen) return;
    if (sig.k === 'answer') {
      p.pc.setRemoteDescription({ type: 'answer', sdp: sig.sdp }).catch(() => this.fail(from));
    } else if (sig.k === 'hangup') {
      this.fail(from);
    }
  }

  private heartbeat(): void {
    const now = performance.now();
    for (const [id, p] of this.peers) {
      if (!p.open) continue;
      if (now - p.seenAt > DEAD_MS) {
        this.fail(id);
        continue;
      }
      try {
        p.ctl.send(PING);
      } catch {
        this.fail(id);
      }
    }
  }

  /** Close the link and try again later (only while the phone is still in the room). */
  private fail(id: number): void {
    const p = this.peers.get(id);
    if (p) {
      const hangup: RtcSignal = { k: 'hangup', gen: p.gen };
      this.net.send({ t: 'relay', ch: 'r', to: id, data: hangup });
    }
    this.close(id);
    if (!this.wanted.has(id)) return;
    const n = (this.failures.get(id) ?? 0) + 1;
    this.failures.set(id, n);
    window.clearTimeout(this.retryTimers.get(id));
    const delay = RETRY_MS[Math.min(n, RETRY_MS.length) - 1]!;
    this.retryTimers.set(
      id,
      window.setTimeout(() => {
        this.retryTimers.delete(id);
        if (this.wanted.has(id) && !this.peers.has(id)) void this.connect(id);
      }, delay),
    );
  }

  private close(id: number): void {
    const p = this.peers.get(id);
    if (!p) return;
    this.peers.delete(id);
    window.clearTimeout(p.timer);
    p.input.onclose = null;
    p.ctl.onclose = null;
    try {
      p.pc.close();
    } catch {
      // Already closed.
    }
    this.mark();
  }

  private mark(): void {
    let open = 0;
    for (const p of this.peers.values()) if (p.open) open++;
    markLink('direct', String(open));
    if (open === this.openCount) return;
    this.openCount = open;
    this.onDirectCount(open);
  }
}
