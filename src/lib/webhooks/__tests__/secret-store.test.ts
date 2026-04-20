import { describe, it, expect, beforeAll } from 'vitest';
import { encryptSecret, decryptSecret, generateWebhookSecret } from '../secret-store';
import crypto from 'crypto';

beforeAll(() => {
  process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
});

describe('encryptSecret / decryptSecret', () => {
  it('round-trip funciona', () => {
    const original = 'whsec_abc123';
    const encrypted = encryptSecret(original);
    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(original);
  });

  it('encryptSecret produz output diferente toda vez (IV aleatório)', () => {
    const a = encryptSecret('whsec_x');
    const b = encryptSecret('whsec_x');
    expect(a.equals(b)).toBe(false);
  });

  it('decryptSecret detecta tampering', () => {
    const encrypted = encryptSecret('whsec_x');
    encrypted[encrypted.length - 1] ^= 1;
    expect(() => decryptSecret(encrypted)).toThrow();
  });
});

describe('generateWebhookSecret', () => {
  it('produz string com prefixo whsec_', () => {
    expect(generateWebhookSecret()).toMatch(/^whsec_[A-Za-z0-9_-]+$/);
  });

  it('produz secrets únicos', () => {
    expect(generateWebhookSecret()).not.toBe(generateWebhookSecret());
  });
});
