/**
 * WhatsApp access_token encryption at-rest.
 *
 * P1.3: Delega para src/lib/crypto/secret-box (AES-256-GCM canonico).
 * API publica intacta: encryptToken / decryptToken / isEncryptedToken.
 * O passthrough legacy (token sem ':') e preservado em decryptToken.
 */
import { encryptSecret, decryptSecret, isEncryptedSecret } from '@/lib/crypto/secret-box'

export function encryptToken(token: string): string {
  return encryptSecret(token)
}

export function decryptToken(encryptedToken: string): string {
  // Legacy plaintext (pre-encryption release): pass through.
  if (!isEncryptedSecret(encryptedToken)) return encryptedToken
  return decryptSecret(encryptedToken)
}

export function isEncryptedToken(value: string | null | undefined): boolean {
  return isEncryptedSecret(value)
}
