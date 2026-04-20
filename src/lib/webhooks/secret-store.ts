import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const keyB64 = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
  if (!keyB64) {
    throw new Error('WEBHOOK_SECRET_ENCRYPTION_KEY not set');
  }
  const key = Buffer.from(keyB64, 'base64');
  if (key.length !== 32) {
    throw new Error('WEBHOOK_SECRET_ENCRYPTION_KEY must be 32 bytes (base64)');
  }
  return key;
}

export function encryptSecret(plaintext: string): Buffer {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

export function decryptSecret(blob: Buffer): string {
  if (blob.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error('Invalid encrypted secret: too short');
  }
  const iv = blob.subarray(0, IV_LENGTH);
  const tag = blob.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = blob.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export function generateWebhookSecret(): string {
  return 'whsec_' + crypto.randomBytes(32).toString('base64url');
}
