import { describe, it, expect } from 'vitest';
import { isPrivateIP, validateUrl } from '../safe-fetch';

describe('isPrivateIP', () => {
  it.each([
    ['10.0.0.1', true],
    ['172.16.0.1', true],
    ['192.168.0.1', true],
    ['127.0.0.1', true],
    ['169.254.169.254', true],
    ['0.0.0.0', true],
    ['224.0.0.1', true],
    ['8.8.8.8', false],
    ['1.1.1.1', false],
    ['::1', true],
    ['fe80::1', true],
    ['fc00::1', true],
    ['2606:4700:4700::1111', false],
  ])('isPrivateIP(%s) === %s', (ip, expected) => {
    expect(isPrivateIP(ip)).toBe(expected);
  });
});

describe('validateUrl', () => {
  it('aceita https://', () => {
    expect(() => validateUrl('https://example.com/hook')).not.toThrow();
  });

  it('rejeita http:// em produção', () => {
    const old = process.env.NODE_ENV;
    (process.env as any).NODE_ENV = 'production';
    expect(() => validateUrl('http://example.com')).toThrow(/scheme/i);
    (process.env as any).NODE_ENV = old;
  });

  it('rejeita ftp://', () => {
    expect(() => validateUrl('ftp://example.com')).toThrow();
  });

  it('rejeita hostnames de metadata cloud', () => {
    expect(() => validateUrl('https://metadata.google.internal/x')).toThrow(/blocked/i);
    expect(() => validateUrl('https://metadata.aws.internal/x')).toThrow(/blocked/i);
  });
});
