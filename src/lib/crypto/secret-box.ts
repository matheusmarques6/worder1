/**
 * AES-256-GCM generico para segredos at-rest (P1.3).
 * Formato: iv:authTag:ciphertext (hex). Chave: ENCRYPTION_KEY via scrypt.
 * Canonico -- token-encryption.ts (WhatsApp) delega para ca.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key || key.length < 32) {
    if (process.env.NODE_ENV === 'development') {
      return scryptSync('dev-key-not-for-production-use!', 'salt', 32)
    }
    throw new Error('ENCRYPTION_KEY must be at least 32 characters in production')
  }
  return scryptSync(key, 'salt', 32)
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)
  let encrypted = cipher.update(plain, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted}`
}

export function decryptSecret(encrypted: string): string {
  const parts = encrypted.split(':')
  if (parts.length !== 3) {
    throw new Error('secret-box: formato invalido (esperado iv:tag:cipher hex)')
  }
  const [ivHex, authTagHex, data] = parts
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
  let decrypted = decipher.update(data, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

export function isEncryptedSecret(value: string | null | undefined): boolean {
  if (!value) return false
  const parts = value.split(':')
  return parts.length === 3 && parts.every((p) => p.length > 0 && /^[0-9a-f]+$/i.test(p))
}
