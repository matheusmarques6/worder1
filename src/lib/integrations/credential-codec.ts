import { decryptSecret, encryptSecret } from '../crypto/secret-box'

function requireKey(): void {
  if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length < 32) {
    throw new Error('ENCRYPTION_KEY must be at least 32 characters for integration credentials')
  }
}

/** Canonical v2 at rest; never use the development fallback for provider secrets. */
export function sealIntegrationSecret(plain: string): string {
  requireKey()
  return encryptSecret(plain)
}

/** Temporary plaintext compatibility. Declared ciphertext must authenticate or fail closed. */
export function openIntegrationSecret<T extends string | null | undefined>(stored: T): T {
  if (!stored) return stored
  const parts = stored.split(':')
  if (!/^v\d+:/.test(stored) && parts.length !== 3) return stored
  const hex = parts[0] === 'v2' && parts.length === 5 ? parts.slice(1) : parts.length === 3 ? parts : []
  if (hex.length < 3 || !hex.slice(0, -1).every(p => /^[0-9a-f]{32}$/i.test(p)) || !/^(?:[0-9a-f]{2})*$/i.test(hex[hex.length - 1])) {
    throw new Error('Malformed or unsupported integration credential')
  }
  requireKey()
  return decryptSecret(stored) as T
}

/** Stored secrets never belong in integration account/store responses. */
export function withoutIntegrationSecrets<T extends Record<string, any>>(row: T): Omit<T, 'access_token' | 'api_secret' | 'webhook_secret'> {
  const { access_token, api_secret, webhook_secret, ...publicFields } = row
  return publicFields
}
