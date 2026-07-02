/**
 * AES-256-GCM generico para segredos at-rest (P1.3).
 *
 * Formato de ESCRITA (v2): `v2:salt:iv:authTag:ciphertext` (hex).
 *   - salt aleatorio (16 bytes) POR SEGREDO → derivacao de chave unica por
 *     valor (corrige o salt estatico 'salt' que era compartilhado por tudo).
 *   - chave = scrypt(ENCRYPTION_KEY, salt, 32).
 *
 * Formato de LEITURA: dual, retrocompatível —
 *   - `v2:salt:iv:tag:cipher` (5 partes)  → deriva com o salt embutido.
 *   - `iv:tag:cipher`         (3 partes)  → LEGADO: deriva com o salt estatico
 *                                            'salt' (mesma chave de antes), para
 *                                            que segredos ja gravados continuem
 *                                            legiveis. Re-gravar migra p/ v2.
 *
 * Canonico -- token-encryption.ts (WhatsApp), api-key-codec.ts,
 * credential-encryption.ts e tiktok/token-manager.ts delegam para ca.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const SALT_LENGTH = 16
const V2 = 'v2'
const LEGACY_SALT = 'salt'

const isHex = (s: string) => s.length > 0 && /^[0-9a-f]+$/i.test(s)

/** Segredo base (ENCRYPTION_KEY) usado como password do scrypt. */
function getBaseSecret(): string {
  const key = process.env.ENCRYPTION_KEY
  if (!key || key.length < 32) {
    if (process.env.NODE_ENV === 'development') {
      return 'dev-key-not-for-production-use!'
    }
    throw new Error('ENCRYPTION_KEY must be at least 32 characters in production')
  }
  return key
}

/** Deriva a chave AES de 32 bytes a partir do segredo base + salt. */
function deriveKey(salt: Buffer | string): Buffer {
  return scryptSync(getBaseSecret(), salt, 32)
}

export function encryptSecret(plain: string): string {
  const salt = randomBytes(SALT_LENGTH)
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, deriveKey(salt), iv)
  let encrypted = cipher.update(plain, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return `${V2}:${salt.toString('hex')}:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted}`
}

export function decryptSecret(encrypted: string): string {
  const parts = encrypted.split(':')

  // v2: salt aleatorio embutido.
  if (parts.length === 5 && parts[0] === V2) {
    const [, saltHex, ivHex, authTagHex, data] = parts
    const decipher = createDecipheriv(ALGORITHM, deriveKey(Buffer.from(saltHex, 'hex')), Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
    let decrypted = decipher.update(data, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  }

  // Legado: iv:tag:cipher com salt estatico (mesma chave de antes).
  if (parts.length === 3) {
    const [ivHex, authTagHex, data] = parts
    const decipher = createDecipheriv(ALGORITHM, deriveKey(LEGACY_SALT), Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
    let decrypted = decipher.update(data, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  }

  throw new Error('secret-box: formato invalido (esperado v2:salt:iv:tag:cipher ou iv:tag:cipher hex)')
}

export function isEncryptedSecret(value: string | null | undefined): boolean {
  if (!value) return false
  const parts = value.split(':')
  // v2 (5 partes, prefixo + 4 hex)
  if (parts.length === 5 && parts[0] === V2) {
    return parts.slice(1).every(isHex)
  }
  // legado (3 partes hex)
  return parts.length === 3 && parts.every(isHex)
}
