import { describe, expect, it } from 'vitest';
import { IpLimiter } from './limiter';
import { buildBindingResponse, parseBindingRequest } from './stun';

function request(attrBytes = 0): Uint8Array {
  const b = new Uint8Array(20 + attrBytes);
  const v = new DataView(b.buffer);
  v.setUint16(0, 0x0001);
  v.setUint16(2, attrBytes);
  v.setUint32(4, 0x2112a442);
  for (let i = 8; i < 20; i++) b[i] = i;
  return b;
}

describe('stun', () => {
  it('accepts a binding request and returns its transaction id', () => {
    const tx = parseBindingRequest(request());
    expect(Array.from(tx!)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(parseBindingRequest(request(8))).not.toBeNull();
  });

  it('rejects anything that is not a well-formed binding request', () => {
    expect(parseBindingRequest(new Uint8Array(10))).toBeNull();
    const wrongType = request();
    new DataView(wrongType.buffer).setUint16(0, 0x0101);
    expect(parseBindingRequest(wrongType)).toBeNull();
    const wrongMagic = request();
    new DataView(wrongMagic.buffer).setUint32(4, 1);
    expect(parseBindingRequest(wrongMagic)).toBeNull();
    const wrongLength = request(4);
    new DataView(wrongLength.buffer).setUint16(2, 8);
    expect(parseBindingRequest(wrongLength)).toBeNull();
  });

  it('answers with the XOR-mapped IPv4 address and port', () => {
    const tx = parseBindingRequest(request())!;
    const res = buildBindingResponse(tx, '192.168.0.102', 54321)!;
    const v = new DataView(res.buffer);
    expect(v.getUint16(0)).toBe(0x0101);
    expect(v.getUint16(2)).toBe(12);
    expect(v.getUint16(20)).toBe(0x0020);
    expect(v.getUint16(26) ^ 0x2112).toBe(54321);
    const addr = (v.getUint32(28) ^ 0x2112a442) >>> 0;
    expect([addr >>> 24, (addr >>> 16) & 255, (addr >>> 8) & 255, addr & 255]).toEqual([192, 168, 0, 102]);
    expect(res.byteLength).toBe(32);
    expect(buildBindingResponse(tx, '::1', 1)).toBeNull();
  });

  it('rate limits per address', () => {
    const lim = new IpLimiter(2);
    const now = 1_000_000;
    const ok = Array.from({ length: 6 }, () => lim.allow('1.2.3.4', now)).filter(Boolean).length;
    expect(ok).toBe(4);
    expect(lim.allow('5.6.7.8', now)).toBe(true);
    expect(lim.allow('1.2.3.4', now + 1000)).toBe(true);
  });
});
