/**
 * Hot-path controller input, sent as a tiny binary frame instead of JSON.
 *
 * Controller -> server (11 bytes):
 *   u8 op | u16 seq | u16 buttons | u16 taps | u32 at
 * Server -> screen (12 bytes): same, with the sender id inserted after op:
 *   u8 op | u8 from | u16 seq | u16 buttons | u16 taps | u32 at
 *
 * `taps` is a cumulative counter (wraps at 65536) so a dropped frame never loses taps.
 * `at` is the synced server time of the latest event, modulo 2^32.
 *
 * Two ops share that layout:
 *  - INPUT_OP: `buttons` = held button bits (PAD_*, DRIVE_*, ...).
 *  - STICK_OP: `buttons` = joystick position, x in the high byte and y in the low byte, each a
 *    signed int8 (-127..127, +x right, +y down). Sent at most 30 Hz and only when it changes,
 *    repeated while held so a lost frame heals itself; (0,0) = released.
 */
export const INPUT_OP = 1;
export const STICK_OP = 2;
export const INPUT_CLIENT_BYTES = 11;
export const INPUT_RELAYED_BYTES = 12;

export interface InputState {
  /** INPUT_OP (default) or STICK_OP. */
  op?: number;
  seq: number;
  buttons: number;
  taps: number;
  at: number;
}

export interface RelayedInput extends InputState {
  op: number;
  from: number;
}

const isOp = (op: number | undefined): boolean => op === INPUT_OP || op === STICK_OP;

export function encodeInput(s: InputState): ArrayBuffer {
  const buf = new ArrayBuffer(INPUT_CLIENT_BYTES);
  const v = new DataView(buf);
  v.setUint8(0, s.op ?? INPUT_OP);
  v.setUint16(1, s.seq & 0xffff);
  v.setUint16(3, s.buttons & 0xffff);
  v.setUint16(5, s.taps & 0xffff);
  v.setUint32(7, s.at >>> 0);
  return buf;
}

/** Validates a controller frame and stamps the sender id. Returns null for anything malformed. */
export function stampInput(frame: ArrayBuffer | Uint8Array, from: number): Uint8Array | null {
  const src = frame instanceof Uint8Array ? frame : new Uint8Array(frame);
  if (src.byteLength !== INPUT_CLIENT_BYTES || !isOp(src[0]) || from < 1 || from > 255) return null;
  const out = new Uint8Array(INPUT_RELAYED_BYTES);
  out[0] = src[0]!;
  out[1] = from;
  out.set(src.subarray(1), 2);
  return out;
}

export function decodeRelayedInput(frame: ArrayBuffer | Uint8Array): RelayedInput | null {
  const bytes = frame instanceof Uint8Array ? frame : new Uint8Array(frame);
  if (bytes.byteLength !== INPUT_RELAYED_BYTES || !isOp(bytes[0])) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    op: bytes[0]!,
    from: v.getUint8(1),
    seq: v.getUint16(2),
    buttons: v.getUint16(4),
    taps: v.getUint16(6),
    at: v.getUint32(8),
  };
}

/** Packs a joystick position (each axis -1..1, clamped) into the `buttons` field of a STICK_OP frame. */
export function packStick(x: number, y: number): number {
  const q = (n: number) => Math.round(Math.max(-1, Math.min(1, Number.isFinite(n) ? n : 0)) * 127) & 0xff;
  return (q(x) << 8) | q(y);
}

/** Reads a STICK_OP `buttons` field back into axes in -1..1. */
export function unpackStick(buttons: number): { x: number; y: number } {
  const s8 = (b: number) => (b > 127 ? b - 256 : b);
  return { x: s8((buttons >> 8) & 0xff) / 127, y: s8(buttons & 0xff) / 127 };
}

/** Difference between two wrapping u16 counters (b - a), assuming b is newer. */
export function u16Delta(a: number, b: number): number {
  return (b - a + 0x10000) & 0xffff;
}

/** Expand a u32 timestamp back to full ms using a nearby reference time. */
export function expandTime(at32: number, reference: number): number {
  const base = reference - (reference >>> 0);
  let t = base + at32;
  if (t - reference > 0x80000000) t -= 0x100000000;
  if (reference - t > 0x80000000) t += 0x100000000;
  return t;
}
