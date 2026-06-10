import { describe, it, expect, beforeAll } from 'vitest'
import { encryptSecret, decryptSecret, isEncryptedSecret } from './secret-box'

beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'TEST_KEY_32_BYTES_MINIMUM_FOR_AES_256_GCM_OK!!'
})

describe('secret-box', () => {
  it('roundtrip', () => {
    const c = encryptSecret('sk-proj-abc123')
    expect(c.split(':').length).toBe(3)
    expect(decryptSecret(c)).toBe('sk-proj-abc123')
  })
  it('IV aleatorio por chamada', () => {
    expect(encryptSecret('x')).not.toBe(encryptSecret('x'))
  })
  it('isEncryptedSecret detecta formato e rejeita base64 legacy', () => {
    expect(isEncryptedSecret(encryptSecret('s'))).toBe(true)
    expect(isEncryptedSecret(Buffer.from('sk-test').toString('base64'))).toBe(false)
    expect(isEncryptedSecret(null)).toBe(false)
  })
  it('decryptSecret lanca em formato invalido', () => {
    expect(() => decryptSecret('not-encrypted')).toThrow()
  })
})
