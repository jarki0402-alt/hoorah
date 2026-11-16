/**
 * Phone side of the direct link: answers the main screen's offer and, while both data channels
 * are open, sends input frames and relay messages over them (see shared/rtc.ts). Anything that
 * cannot go direct takes the server relay, so the player never notices which path is used.
 */
import { parseRtcSignal, type RtcSignal } from '@hoorah/protocol';
import type { DirectPath, Net } from '../shared/net';
import {
  CH_CONTROL,
  CH_INPUT,
  DEAD_MS,
  HEARTBEAT_MS,
  iceServers,
  markLink,
  PING,
  PONG,
  rtcSupported,
  waitForIce,
} from '../shared/rtc';

export class ControllerRtc implements DirectPath {
  private pc: RTCPeerConnection | null = null;
  private input: RTCDataChannel | null = null;
  private ctl: RTCDataChannel | null = null;
  private gen = -1;
  private seenAt = 0;
  private watchTimer = 0;

  constructor(private readonly net: Net) {
    markLink('link', 'relay');
    net.on('message', (m) => {
      if (m.t !== 'relay' || m.ch !== 'r') return;
      const sig = parseRtcSignal(m.data);
      if (sig) void this.onSignal(sig);
    });
    // The store makes a new Net for every join; this link ends with its Net.
    net.on('status', (s) => {
      if (s === 'closed') this.dispose();
    });
    if (!rtcSupported()) return;
    net.setDirect(this);
    this.watchTimer = window.setInterval(() => this.watch(), HEARTBEAT_MS);
  }

  dispose(): void {
    window.clearInterval(this.watchTimer);
    this.net.setDirect(null);
    this.close();
  }

  /* ---------------------------------------------------------------- DirectPath */

  sendText(to: number | 'screen', text: string): boolean {
    const ch = this.ctl;
    if (to !== 'screen' || !this.isOpen() || !ch || ch.bufferedAmount > 64 * 1024) return false;
    try {
      ch.send(text);
      return true;
    } catch {
      return false;
    }
  }

  sendBinary(buf: ArrayBuffer): boolean {
    const ch = this.input;
    if (!this.isOpen() || !ch || ch.bufferedAmount > 16 * 1024) return false;
    try {
      ch.send(buf);
      return true;
    } catch {
      return false;
    }
  }

  /* ---------------------------------------------------------------- lifecycle */

  private isOpen(): boolean {
    return this.input?.readyState === 'open' && this.ctl?.readyState === 'open';
  }

  private async onSignal(sig: RtcSignal): Promise<void> {
    if (sig.k === 'hangup') {
      if (sig.gen === this.gen) this.close();
      return;
    }
    if (sig.k !== 'offer') return;
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
      ch.binaryType = 'arraybuffer';
      if (ch.label === CH_INPUT) this.input = ch;
      else if (ch.label === CH_CONTROL) {
        this.ctl = ch;
        ch.onmessage = (m: MessageEvent) => {
          if (this.pc !== pc || typeof m.data !== 'string') return;
          this.seenAt = performance.now();
          if (m.data === PING) ch.send(PONG);
          else if (m.data !== PONG) this.net.injectText(0, m.data);
        };
      } else return;
      ch.onopen = () => {
        this.seenAt = performance.now();
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
      const answer: RtcSignal = { k: 'answer', gen: sig.gen, sdp };
      this.net.send({ t: 'relay', ch: 'r', to: 'screen', data: answer });
    } catch {
      if (this.pc === pc) {
        this.close();
        this.hangup(sig.gen);
      }
    }
  }

  /** No heartbeat from the screen for a while: drop the link, the screen will offer a new one. */
  private watch(): void {
    if (this.isOpen() && performance.now() - this.seenAt > DEAD_MS) this.close();
  }

  private hangup(gen: number): void {
    const msg: RtcSignal = { k: 'hangup', gen };
    this.net.send({ t: 'relay', ch: 'r', to: 'screen', data: msg });
  }

  private close(): void {
    const pc = this.pc;
    this.pc = null;
    this.input = null;
    this.ctl = null;
    try {
      pc?.close();
    } catch {
      // Already closed.
    }
    this.mark();
  }

  private mark(): void {
    markLink('link', this.isOpen() ? 'direct' : 'relay');
  }
}
