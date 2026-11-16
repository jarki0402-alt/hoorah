import { describe, expect, it } from 'vitest';
import { networkKey } from './network';

describe('networkKey', () => {
  it('matches public IPv4 exactly', () => {
    expect(networkKey('36.72.10.5')).toBe(networkKey('36.72.10.5'));
    expect(networkKey('36.72.10.5')).not.toBe(networkKey('36.72.10.6'));
  });

  it('groups a private LAN by its /24 and handles mapped addresses', () => {
    expect(networkKey('192.168.0.102')).toBe(networkKey('192.168.0.57'));
    expect(networkKey('::ffff:192.168.0.3')).toBe(networkKey('192.168.0.200'));
    expect(networkKey('192.168.1.2')).not.toBe(networkKey('192.168.0.2'));
    expect(networkKey('10.0.5.1')).toBe('v4net:10.0.5');
  });

  it('groups IPv6 by the /64 home prefix', () => {
    expect(networkKey('2001:db8:1:2::10')).toBe(networkKey('2001:db8:1:2:abcd::1'));
    expect(networkKey('2001:db8:1:2::10')).not.toBe(networkKey('2001:db8:1:3::10'));
  });

  it('treats loopback as one machine and rejects junk', () => {
    expect(networkKey('127.0.0.1')).toBe(networkKey('::1'));
    expect(networkKey('')).toBe('');
    expect(networkKey('999.1.1.1')).toBe('');
    expect(networkKey('not-an-ip')).toBe('');
  });
});
