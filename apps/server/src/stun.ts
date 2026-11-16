/**
 * A minimal STUN server (RFC 5389 Binding only). It answers "this is your address as I see it",
 * which helps a phone and the main screen on the same Wi-Fi find each other for a direct WebRTC
 * link. It never relays game data. Requests are rate limited per IP and the answer is at most 32
 * bytes, so it is useless as an amplifier.
 */
import { createSocket, type Socket } from 'node:dgram';
import { IpLimiter } from './limiter';
import type { Logger } from './log';

const MAGIC = 0x2112a442;
const BINDING_REQUEST = 0x0001;
const BINDING_SUCCESS = 0x0101;
const XOR_MAPPED_ADDRESS = 0x0020;
const HEADER_BYTES = 20;

/** Returns the 12-byte transaction id of a valid Binding request, or null for anything else. */
export function parseBindingRequest(msg: Uint8Array): Uint8Array | null {
  if (msg.byteLength < HEADER_BYTES || msg.byteLength > 548) return null;
  const v = new DataView(msg.buffer, msg.byteOffset, msg.byteLength);
  const type = v.getUint16(0);
  const length = v.getUint16(2);
  // The two top bits of every STUN message are zero; the length counts attributes only.
  if (type !== BINDING_REQUEST || v.getUint32(4) !== MAGIC) return null;
  if (length % 4 !== 0 || HEADER_BYTES + length !== msg.byteLength) return null;
  return msg.slice(8, 20);
}

/** Builds a Binding success response carrying XOR-MAPPED-ADDRESS for an IPv4 sender. */
export function buildBindingResponse(transactionId: Uint8Array, ip: string, port: number): Uint8Array | null {
  const parts = ip.split('.').map((n) => Number.parseInt(n, 10));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  if (transactionId.byteLength !== 12 || !Number.isInteger(port) || port < 0 || port > 65535) return null;
  const out = new Uint8Array(HEADER_BYTES + 12);
  const v = new DataView(out.buffer);
  v.setUint16(0, BINDING_SUCCESS);
  v.setUint16(2, 12);
  v.setUint32(4, MAGIC);
  out.set(transactionId, 8);
  v.setUint16(20, XOR_MAPPED_ADDRESS);
  v.setUint16(22, 8);
  v.setUint8(24, 0);
  v.setUint8(25, 0x01); // IPv4
  v.setUint16(26, port ^ (MAGIC >>> 16));
  const addr = ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
  v.setUint32(28, (addr ^ MAGIC) >>> 0);
  return out;
}

/** Starts the UDP listener; returns it so the caller can close it on shutdown. */
export function startStun(port: number, log: Logger): Socket {
  const socket = createSocket('udp4');
  const limiter = new IpLimiter(20);
  socket.on('message', (msg, rinfo) => {
    if (!limiter.allow(rinfo.address, Date.now())) return;
    const tx = parseBindingRequest(msg);
    if (!tx) return;
    const reply = buildBindingResponse(tx, rinfo.address, rinfo.port);
    if (reply) socket.send(reply, rinfo.port, rinfo.address);
  });
  socket.on('error', (err) => log.warn('stun_error', { error: err.message }));
  socket.bind(port, () => log.info('stun_listening', { port }));
  return socket;
}
