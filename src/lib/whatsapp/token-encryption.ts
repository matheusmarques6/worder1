/**
 * WhatsApp access_token encryption at-rest.
 *
 * Format: iv:authTag:ciphertext (hex) — AES-256-GCM.
 * Key derived from ENCRYPTION_KEY env via scrypt.
 *
 * Mirrors src/lib/tiktok/token-manager.ts:80-130 to keep one canonical
 * pattern across providers.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length < 32) {
    if (process.env.NODE_ENV === 'development') {
      return scryptSync('dev-key-not-for-production-use!', 'salt', 32);
    }
    throw new Error('ENCRYPTION_KEY must be at least 32 characters in production');
  }
  return scryptSync(key, 'salt', 32);
}

export function encryptToken(token: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decryptToken(encryptedToken: string): string {
  // Legacy plaintext (pre-encryption release): pass through.
  if (!encryptedToken.includes(':')) {
    return encryptedToken;
  }

  const parts = encryptedToken.split(':');
  if (parts.length !== 3) {
    return encryptedToken;
  }

  const [ivHex, authTagHex, encrypted] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

export function isEncryptedToken(value: string | null | undefined): boolean {
  if (!value) return false;
  const parts = value.split(':');
  return parts.length === 3 && parts.every((p) => /^[0-9a-f]+$/i.test(p));
}
