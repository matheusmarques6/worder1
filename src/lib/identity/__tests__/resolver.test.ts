// =============================================
// Identity resolver — pure helper unit tests
//
// We test the deterministic helpers (hashing, IP subnet) here. The
// full database flow is covered by integration tests against a real
// Postgres in CI.
// =============================================

import { describe, it, expect } from 'vitest';
import { hashEmail, hashPhone, hashUserAgent, ipSubnet } from '../resolver';

describe('hashEmail', () => {
  it('returns null for falsy/empty input', () => {
    expect(hashEmail(null)).toBeNull();
    expect(hashEmail(undefined)).toBeNull();
    expect(hashEmail('')).toBeNull();
    expect(hashEmail('   ')).toBeNull();
  });

  it('normalizes case and whitespace', () => {
    const a = hashEmail('User@Example.com');
    const b = hashEmail('user@example.com');
    const c = hashEmail('  USER@EXAMPLE.COM  ');
    expect(a).toBe(b);
    expect(a).toBe(c);
  });

  it('returns 64-char hex sha256', () => {
    const h = hashEmail('foo@bar.com')!;
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('different emails produce different hashes', () => {
    expect(hashEmail('a@x.com')).not.toBe(hashEmail('b@x.com'));
  });
});

describe('hashPhone', () => {
  it('strips non-digit characters', () => {
    expect(hashPhone('+55 (11) 98765-4321')).toBe(hashPhone('5511987654321'));
    expect(hashPhone('11.98765.4321')).toBe(hashPhone('11987654321'));
  });

  it('returns null for input with no digits', () => {
    expect(hashPhone(null)).toBeNull();
    expect(hashPhone('+--')).toBeNull();
    expect(hashPhone('')).toBeNull();
  });
});

describe('hashUserAgent', () => {
  it('returns 32-char hex (truncated sha256)', () => {
    const h = hashUserAgent('Mozilla/5.0 ...')!;
    expect(h).toMatch(/^[0-9a-f]{32}$/);
  });

  it('returns null for empty', () => {
    expect(hashUserAgent(null)).toBeNull();
    expect(hashUserAgent('')).toBeNull();
  });

  it('same UA yields same hash', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)';
    expect(hashUserAgent(ua)).toBe(hashUserAgent(ua));
  });
});

describe('ipSubnet', () => {
  it('truncates IPv4 to /24', () => {
    expect(ipSubnet('203.0.113.45')).toBe('203.0.113.0');
    expect(ipSubnet('192.168.1.255')).toBe('192.168.1.0');
  });

  it('truncates IPv6 to first 3 groups', () => {
    expect(ipSubnet('2001:db8:abcd:0012:0000:0000:0000:0001')).toBe('2001:db8:abcd::');
  });

  it('returns null for invalid IPv4', () => {
    expect(ipSubnet('not-an-ip')).toBeNull();
    expect(ipSubnet('1.2.3')).toBeNull();
  });

  it('returns null for null/empty', () => {
    expect(ipSubnet(null)).toBeNull();
    expect(ipSubnet('')).toBeNull();
  });

  it('two IPs in same /24 produce same subnet', () => {
    expect(ipSubnet('10.0.0.5')).toBe(ipSubnet('10.0.0.250'));
  });
});
