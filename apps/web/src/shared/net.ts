import {
  type Channel,
  CLOSE,
  type ClientMsg,
  ClockSync,
  decodeRelayedInput,
  type ErrorCode,
  LIMITS,
  type RelayedInput,
  type RelayTarget,
  type ServerMsg,
  stampInput,
} from '@hoorah/protocol';
import { type Envelope, InOrder, isEnvelope, newEpoch, OutSeq } from './linkseq';

export type NetStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

/**
 * A direct link next to the WebSocket (WebRTC on the same Wi-Fi). Each method returns false when
 * that link is not open, and the message then goes through the server relay instead.
 */
export interface DirectPath {
  /** One enveloped relay message (JSON text) straight to the screen or to one player. */
  sendText(to: number | 'screen', text: string): boolean;
  /** One binary input frame straight to the screen (phones only). */
  sendBinary(buf: ArrayBuffer): boolean;
  /** Screen: true while this player's input frames arrive directly; relayed copies are then stale. */
  directInput?(from: number): boolean;
}

export interface NetEvents {
  status: (s: NetStatus) => void;
  message: (m: ServerMsg) => void;
  input: (i: RelayedInput) => void;
  fatal: (code: ErrorCode | 'kicked') => void;
}

/**
 * One WebSocket with everything a party game needs:
 * auto-reconnect with backoff, heartbeat, clock sync, and a hello that is replayed on reconnect.
 */
export class Net {
  private ws: WebSocket | null = null;
  private readonly listeners: { [K in keyof NetEvents]: Set<NetEvents[K]> } = {
    status: new Set(),
    message: new Set(),
    input: new Set(),
    fatal: new Set(),
  };
  private attempt = 0;
  private reconnectTimer = 0;
  private heartbeatTimer = 0;
  private pingId = 0;
  private stopped = false;
  private _status: NetStatus = 'connecting';
  private direct: DirectPath | null = null;
  private recipients: (() => number[]) | null = null;
  /** This page's session id for numbered relay messages (see linkseq.ts). */
  readonly epoch = newEpoch();
  private readonly outSeq = new OutSeq();
  private readonly inOrder = new InOrder((from, env) => this.emitRelay(from, env));
  readonly clock = new ClockSync();

  /** Held: the socket opens but says nothing until `release()` (see `hold`). */
  private holding: boolean;
  /** The socket is open and waiting for `release()` to send its hello. */
  private helloDue = false;

  /**
   * `hello` is built fresh on each (re)connect so tokens learned along the way are used. With
   * `hold`, the connection is opened ahead of time (TCP and TLS handshakes done, the slow part far
   * from the server) and the hello only goes out on `release()`: a phone on the name page is then
   * in the room the moment "Masuk" is tapped.
   */
  constructor(
    private readonly hello: () => ClientMsg,
    opts: { hold?: boolean } = {},
  ) {
    this.holding = opts.hold === true;
  }

  /** Sends the held hello now (or as soon as the socket is open). */
  release(): void {
    if (!this.holding) return;
    this.holding = false;
    if (this.helloDue && this.ws?.readyState === WebSocket.OPEN) this.greet(this.ws);
  }

  get status(): NetStatus {
    return this._status;
  }

  get rtt(): number {
    return this.clock.rtt;
  }

  /** Synced server time in ms. */
  now(): number {
    return Date.now() + this.clock.offset;
  }

  on<K extends keyof NetEvents>(event: K, fn: NetEvents[K]): () => void {
    this.listeners[event].add(fn);
    return () => this.listeners[event].delete(fn);
  }

  start(): void {
    this.stopped = false;
    this.open();
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('online', this.onOnline);
  }

  stop(): void {
    this.stopped = true;
    window.clearTimeout(this.reconnectTimer);
    window.clearInterval(this.heartbeatTimer);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('online', this.onOnline);
    this.ws?.close(1000, 'bye');
    this.ws = null;
    this.setStatus('closed');
  }

  /** Plug in (or remove) the direct link. */
  setDirect(direct: DirectPath | null): void {
    this.direct = direct;
  }

  /**
   * Screen only: who a relay to 'all' reaches. Each player then gets its own numbered copy, so
   * its stream stays gap-free whichever path each copy takes.
   */
  setRecipients(fn: () => number[]): void {
    this.recipients = fn;
  }

  send(msg: ClientMsg): boolean {
    // Far-away main screens (long-distance play) take whole, self-numbered packets as they are
    // (screen/mirror.ts): the relay stream numbering below is for phones only.
    if (msg.t === 'relay' && msg.ch !== 'r' && msg.to !== 'mirror')
      return this.sendRelay(msg.ch, msg.to, msg.data);
    return this.sendWs(msg);
  }

  sendBinary(buf: ArrayBuffer): boolean {
    if (this.direct?.sendBinary(buf)) return true;
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    if (this.ws.bufferedAmount > 64 * 1024) return false;
    this.ws.send(buf);
    return true;
  }

  /** A relay message that arrived over the direct link from `from` (0 = the screen). */
  injectText(from: number, text: string): void {
    let v: unknown;
    try {
      v = JSON.parse(text);
    } catch {
      return;
    }
    if (isEnvelope(v)) this.inOrder.push(from, v);
  }

  /** Screen: a binary input frame that arrived over the direct link from player `from`. */
  injectBinary(from: number, buf: ArrayBuffer): void {
    const stamped = stampInput(buf, from);
    const input = stamped && decodeRelayedInput(stamped);
    if (input) for (const fn of this.listeners.input) fn(input);
  }

  /** Forget the message stream of a player who left. */
  forget(from: number): void {
    this.inOrder.drop(from);
  }

  private sendWs(msg: ClientMsg): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  private sendRelay(ch: Exclude<Channel, 'r'>, to: Exclude<RelayTarget, 'mirror'>, data: unknown): boolean {
    if (to !== 'all') return this.sendRelayTo(ch, to, data);
    if (!this.recipients) return this.sendWs({ t: 'relay', ch, to, data });
    let ok = true;
    for (const id of this.recipients()) ok = this.sendRelayTo(ch, id, data) && ok;
    return ok;
  }

  private sendRelayTo(ch: Exclude<Channel, 'r'>, to: number | 'screen', data: unknown): boolean {
    const env: Envelope = { e: this.epoch, q: this.outSeq.take(to), c: ch, d: data };
    if (this.direct?.sendText(to, JSON.stringify(env))) return true;
    return this.sendWs({ t: 'relay', ch, to, data: env });
  }

  private emitRelay(from: number, env: Envelope): void {
    const msg: ServerMsg = { t: 'relay', ch: env.c, from, data: env.d };
    for (const fn of this.listeners.message) fn(msg);
  }

  private greet(ws: WebSocket): void {
    this.helloDue = false;
    ws.send(JSON.stringify(this.hello()));
    this.ping();
    window.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = window.setInterval(() => this.ping(), LIMITS.heartbeatMs);
  }

  private open(): void {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    this.setStatus(this.attempt === 0 ? 'connecting' : 'reconnecting');

    ws.onopen = () => {
      this.attempt = 0;
      if (this.holding) this.helloDue = true;
      else this.greet(ws);
    };

    ws.onmessage = (e) => {
      if (typeof e.data !== 'string') {
        const input = decodeRelayedInput(e.data as ArrayBuffer);
        // While a player's frames come in directly, a relayed copy is late and would undo newer state.
        if (!input || this.direct?.directInput?.(input.from)) return;
        for (const fn of this.listeners.input) fn(input);
        return;
      }
      let msg: ServerMsg;
      try {
        msg = JSON.parse(e.data) as ServerMsg;
      } catch {
        return;
      }
      if (msg.t === 'pong') {
        this.clock.add(msg.ct, msg.st, Date.now());
        return;
      }
      if (msg.t === 'welcome') this.setStatus('open');
      if (msg.t === 'kicked') {
        this.stopped = true;
        for (const fn of this.listeners.fatal) fn('kicked');
        return;
      }
      if (msg.t === 'error' && msg.fatal) {
        this.stopped = true;
        for (const fn of this.listeners.fatal) fn(msg.code);
      }
      if (msg.t === 'relay' && msg.ch !== 'r' && isEnvelope(msg.data)) {
        this.inOrder.push(msg.from, msg.data);
        return;
      }
      for (const fn of this.listeners.message) fn(msg);
    };

    ws.onclose = (e) => {
      window.clearInterval(this.heartbeatTimer);
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.stopped || e.code === CLOSE.kicked || e.code === CLOSE.replaced) {
        this.setStatus('closed');
        return;
      }
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    this.setStatus('reconnecting');
    const base = Math.min(8000, 500 * 2 ** this.attempt);
    const delay = base / 2 + Math.random() * (base / 2);
    this.attempt++;
    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = window.setTimeout(() => this.open(), delay);
  }

  private ping(): void {
    this.sendWs({ t: 'ping', id: ++this.pingId, ct: Date.now() });
  }

  private setStatus(s: NetStatus): void {
    if (this._status === s) return;
    this._status = s;
    for (const fn of this.listeners.status) fn(s);
  }

  /** Phones freeze sockets in the background; reconnect immediately when we come back. */
  private readonly onVisibility = (): void => {
    if (document.visibilityState !== 'visible' || this.stopped) return;
    if (!this.ws || this.ws.readyState > WebSocket.OPEN) {
      window.clearTimeout(this.reconnectTimer);
      this.attempt = 0;
      this.open();
    } else {
      this.ping();
    }
  };

  private readonly onOnline = (): void => {
    if (this.stopped || this.ws) return;
    window.clearTimeout(this.reconnectTimer);
    this.attempt = 0;
    this.open();
  };
}
