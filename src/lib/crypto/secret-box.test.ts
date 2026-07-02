import { describe, it, expect, beforeAll } from 'vitest'
import { encryptSecret, decryptSecret, isEncryptedSecret } from './secret-box'

beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'TEST_KEY_32_BYTES_MINIMUM_FOR_AES_256_GCM_OK!!'
})

describe('secret-box', () => {
  it('roundtrip (formato v2 com salt aleatorio)', () => {
    const c = encryptSecret('sk-proj-abc123')
    const parts = c.split(':')
    expect(parts.length).toBe(5)
    expect(parts[0]).toBe('v2')
    expect(decryptSecret(c)).toBe('sk-proj-abc123')
  })
  it('salt E iv aleatorios por chamada', () => {
    const a = encryptSecret('x')
    const b = encryptSecret('x')
    expect(a).not.toBe(b)
    // salt (parts[1]) difere entre chamadas
    expect(a.split(':')[1]).not.toBe(b.split(':')[1])
  })
  it('decripta o formato LEGADO (iv:tag:cipher, salt estatico) sem quebrar', () => {
    // Reproduz exatamente como segredos antigos foram gravados: AES-256-GCM
    // com chave scrypt(ENCRYPTION_KEY, 'salt', 32) e envelope iv:tag:cipher.
    const { createCipheriv, scryptSync, randomBytes } = require('crypto')
    const key = scryptSync(process.env.ENCRYPTION_KEY, 'salt', 32)
    const iv = randomBytes(16)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    let enc = cipher.update('legacy-secret', 'utf8', 'hex'); enc += cipher.final('hex')
    const legacy = `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${enc}`
    expect(isEncryptedSecret(legacy)).toBe(true)
    expect(decryptSecret(legacy)).toBe('legacy-secret')
  })
  it('isEncryptedSecret detecta v2 e legado, rejeita base64/invalidos', () => {
    expect(isEncryptedSecret(encryptSecret('s'))).toBe(true)
    expect(isEncryptedSecret('aa:bb:cc')).toBe(true) // legado hex
    expect(isEncryptedSecret(Buffer.from('sk-test').toString('base64'))).toBe(false)
    expect(isEncryptedSecret(null)).toBe(false)
  })
  it('decryptSecret lanca em formato invalido', () => {
    expect(() => decryptSecret('not-encrypted')).toThrow()
  })
})
