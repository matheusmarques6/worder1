import { encryptSecret, decryptSecret, isEncryptedSecret } from '@/lib/crypto/secret-box'

/** Encrypt a provider API key for storage (AES-256-GCM v2). */
export function encodeProviderKey(apiKey: string): string {
  return encryptSecret(apiKey)
}

/**
 * Decode a stored provider key. Legacy rows are RAW PLAINTEXT (no envelope),
 * so a non-encrypted value is returned as-is — this is what keeps existing
 * keys working. Encrypted values (v2 or legacy 3-part) are decrypted.
 */
export function decodeProviderKey(stored: string | null | undefined): string {
  if (!stored) return ''
  if (!isEncryptedSecret(stored)) return stored
  try {
    return decryptSecret(stored)
  } catch {
    // Defensivo: se um valor por acaso parecer cifrado mas não decodificar
    // (linha corrompida / colisão de formato ~impossível), devolve o bruto
    // em vez de derrubar a chamada ao provider.
    return stored
  }
}
