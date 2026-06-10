import { describe, it, expect, beforeAll } from 'vitest'
import { encryptApiKey, decodeApiKey } from '../api-key-codec'

beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'TEST_KEY_32_BYTES_MINIMUM_FOR_AES_256_GCM_OK!!'
})

describe('api-key-codec (P1.3 -- leitura dual)', () => {
  it('roundtrip AES', () => {
    const stored = encryptApiKey('sk-proj-secreta')
    const out = decodeApiKey(stored)
    expect(out).toEqual({ apiKey: 'sk-proj-secreta', legacyBase64: false })
  })

  it('le valor base64 legacy e sinaliza para re-encrypt', () => {
    const legacy = Buffer.from('sk-ant-legacy').toString('base64')
    const out = decodeApiKey(legacy)
    expect(out).toEqual({ apiKey: 'sk-ant-legacy', legacyBase64: true })
  })

  it('valor AES nunca e confundido com base64', () => {
    const stored = encryptApiKey('sk-x')
    expect(decodeApiKey(stored).legacyBase64).toBe(false)
  })
})
