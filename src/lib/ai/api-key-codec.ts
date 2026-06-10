/**
 * P1.3 -- Codec de api_key_encrypted (whatsapp_ai_configs).
 * Escrita: SEMPRE AES-256-GCM (secret-box).
 * Leitura: dual -- AES primeiro; fallback base64 legacy (formato antigo
 * sem ':' triplo), sinalizando legacyBase64=true para o caller re-gravar.
 */
import { encryptSecret, decryptSecret, isEncryptedSecret } from '@/lib/crypto/secret-box'

export function encryptApiKey(apiKey: string): string {
  return encryptSecret(apiKey)
}

export interface DecodedApiKey {
  apiKey: string
  /** true => valor armazenado ainda e base64 legacy; re-gravar encriptado */
  legacyBase64: boolean
}

export function decodeApiKey(stored: string): DecodedApiKey {
  if (isEncryptedSecret(stored)) {
    return { apiKey: decryptSecret(stored), legacyBase64: false }
  }
  return {
    apiKey: Buffer.from(stored, 'base64').toString('utf-8'),
    legacyBase64: true,
  }
}
