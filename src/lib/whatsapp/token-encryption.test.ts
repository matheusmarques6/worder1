import { describe, it, expect, beforeAll } from 'vitest';
import { encryptToken, decryptToken, isEncryptedToken } from './token-encryption';

beforeAll(() => {
  process.env.ENCRYPTION_KEY =
    'TEST_KEY_32_BYTES_MINIMUM_FOR_AES_256_GCM_OK!!';
});

describe('token-encryption', () => {
  it('roundtrips an EAA-style token', () => {
    const token =
      'EAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    const cipher = encryptToken(token);
    expect(cipher).not.toBe(token);
    expect(cipher.split(':').length).toBe(3);
    expect(decryptToken(cipher)).toBe(token);
  });

  it('produces a different ciphertext per call (random IV)', () => {
    const token = 'sameplaintext';
    const a = encryptToken(token);
    const b = encryptToken(token);
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe(token);
    expect(decryptToken(b)).toBe(token);
  });

  it('passes legacy plaintext through decrypt unchanged', () => {
    const legacy = 'eaa_legacy_no_colons_token_xyz';
    expect(decryptToken(legacy)).toBe(legacy);
  });

  it('isEncryptedToken detects format', () => {
    const cipher = encryptToken('something');
    expect(isEncryptedToken(cipher)).toBe(true);
    expect(isEncryptedToken('plain')).toBe(false);
    expect(isEncryptedToken(null)).toBe(false);
    expect(isEncryptedToken(undefined)).toBe(false);
    expect(isEncryptedToken('ab:cd:gg')).toBe(false); // 'gg' not hex
  });

  it('roundtrips 200 random strings', () => {
    for (let i = 0; i < 200; i++) {
      const s = `tok_${i}_${Math.random().toString(36).slice(2)}`;
      expect(decryptToken(encryptToken(s))).toBe(s);
    }
  });
});
